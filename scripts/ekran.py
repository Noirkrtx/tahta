"""Visual check: screenshot every demo (mid-way and finished) from the production build.

Usage:  npm run build && python scripts/ekran.py
Needs Python Playwright with Chromium. Serves dist/ under /tahta/ from a thread
(the same static layout as GitHub Pages). Also exercises the keyboard controls and
the PNG/SVG/JSON exports once, and fails on any console error.
"""
import http.server
import json
import os
import pathlib
import sys
import threading

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "docs" / "ekran"
DEMOS = ["mevsimler", "seasons", "kalp", "pisagor", "fotosentez"]


class Handler(http.server.SimpleHTTPRequestHandler):
    """Serve dist/ under /tahta/, the way GitHub Pages will."""

    def translate_path(self, path: str) -> str:
        path = path.split("?", 1)[0].split("#", 1)[0]
        rel = path[len("/tahta/"):] if path.startswith("/tahta/") else "__missing__"
        return str(ROOT / "dist" / (rel or "index.html"))

    def log_message(self, *args) -> None:  # keep the output quiet
        pass


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    BASE = f"http://127.0.0.1:{server.server_address[1]}/tahta/"
    threading.Thread(target=server.serve_forever, daemon=True).start()
    problems: list[str] = []
    try:
        with sync_playwright() as p:
            # Set TAHTA_CHROMIUM to use a specific Chromium binary instead of Playwright's own download.
            browser = p.chromium.launch(executable_path=os.environ.get("TAHTA_CHROMIUM") or None)
            ctx = browser.new_context(viewport={"width": 1500, "height": 1000}, device_scale_factor=1.5, accept_downloads=True)
            page = ctx.new_page()
            page.on("console", lambda m: problems.append(f"console {m.type}: {m.text}") if m.type == "error" else None)
            page.on("pageerror", lambda e: problems.append(f"pageerror: {e}"))
            external: list[str] = []
            page.on("request", lambda r: external.append(r.url) if not r.url.startswith((BASE, "data:", "blob:")) else None)

            for demo in DEMOS:
                for name, at in (("ara", "0.5"), ("son", "1")):
                    page.goto(f"{BASE}?demo={demo}&at={at}")
                    page.wait_for_function("document.documentElement.dataset.ready === '1'", timeout=8000)
                    page.evaluate("document.fonts.ready")
                    fixes = page.evaluate("document.documentElement.dataset.layoutFixes")
                    font_ok = page.evaluate("document.fonts.check(\"500 34px 'Caveat'\", 'ğşıİçöü')")
                    if not font_ok:
                        problems.append(f"{demo}: handwriting font not loaded")
                    if fixes != "0":
                        problems.append(f"{demo}: {fixes} automatic layout fix(es) with the real font")
                    page.locator("#board").screenshot(path=str(OUT / f"{demo}-{name}.png"))
                    print(f"{demo}-{name}.png  layoutFixes={fixes} font={font_ok}")

            # Whole UI, Turkish and English.
            page.goto(f"{BASE}?demo=mevsimler&at=1")
            page.wait_for_function("document.documentElement.dataset.ready === '1'", timeout=8000)
            page.screenshot(path=str(OUT / "arayuz-tr.png"), full_page=True)
            page.goto(f"{BASE}?demo=seasons&at=1&lang=en")
            page.wait_for_function("document.documentElement.dataset.ready === '1'", timeout=8000)
            page.screenshot(path=str(OUT / "arayuz-en.png"), full_page=True)

            # Controls: keyboard stepping and play/pause.
            page.goto(f"{BASE}?demo=kalp&at=0")
            page.wait_for_function("document.documentElement.dataset.ready === '1'", timeout=8000)
            count = lambda: page.inner_text("#step-count")
            assert count() == "0/6", count()
            page.keyboard.press("ArrowRight")
            page.keyboard.press("ArrowRight")
            assert count() == "1/6", count()
            page.keyboard.press("ArrowLeft")
            assert count() == "0/6", count()
            page.keyboard.press("Space")
            page.wait_for_timeout(600)
            v1 = int(page.input_value("#progress"))
            page.keyboard.press("Space")
            page.wait_for_timeout(300)
            v2 = int(page.input_value("#progress"))
            page.wait_for_timeout(300)
            assert v1 > 0 and int(page.input_value("#progress")) == v2, (v1, v2)
            page.locator("#step-list button").nth(3).click()
            page.wait_for_timeout(200)
            assert count() == "3/6", count()
            page.keyboard.press("Space")
            print("controls ok")

            # Exports.
            for button, suffix in (("#btn-png", ".png"), ("#btn-svg", ".svg"), ("#btn-json", ".json")):
                with page.expect_download() as dl:
                    page.click(button)
                path = pathlib.Path(dl.value.path())
                size = path.stat().st_size
                assert dl.value.suggested_filename.endswith(suffix), dl.value.suggested_filename
                assert size > 2000, (button, size)
                if suffix == ".png":
                    (OUT / "disa-aktarim-ornek.png").write_bytes(path.read_bytes())
                if suffix == ".json":
                    assert json.loads(path.read_text())["version"] == 1
                if suffix == ".svg":
                    text = path.read_text()
                    assert "<script" not in text and "font/woff2;base64" in text
                print(f"export {dl.value.suggested_filename}: {size} bytes")

            # Asking without a key must not hit the network and must explain itself.
            page.fill("#question", "Gökyüzü neden mavi?")
            page.click("#btn-ask")
            page.wait_for_selector("dialog[open]")
            assert "localStorage" in page.inner_text("dialog .warning")
            page.screenshot(path=str(OUT / "ayarlar.png"))
            if external:
                problems.append(f"unexpected external requests: {external}")
            browser.close()
    finally:
        for line in problems:
            print("PROBLEM:", line)
        server.shutdown()
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
