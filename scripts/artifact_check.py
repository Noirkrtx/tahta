"""Browser check of the single-file artifact build with a fake window.claude.

Usage:  npm run build:artifact && python scripts/artifact_check.py
Needs Python Playwright with Chromium (set TAHTA_CHROMIUM to use a specific
Chromium binary). Opens artifact/tahta-artifact.html from file://, injects a
fake `window.claude.complete` before the page loads, asks one question, lets
the generated board play to the end and saves docs/ekran/artifact.png.
The fake's first reply is broken JSON, so the repair round runs as well.
Fails on any console error, on any network request, and when the page
without window.claude does not fall back to the API-key mode.
"""
import json
import os
import pathlib
import sys

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
HTML = ROOT / "artifact" / "tahta-artifact.html"
SHOT = ROOT / "docs" / "ekran" / "artifact.png"
QUESTION = "What causes the seasons on Earth?"

# A valid scenario for the fake to return: the English demo, re-titled so the
# check can tell a generated board from the bundled one.
scenario = json.loads((ROOT / "examples" / "seasons.en.json").read_text(encoding="utf-8"))
scenario["title"] = "Seasons (from fake Claude)"

FAKE_CLAUDE = """
(() => {
  const replies = [%s, %s];
  window.__claudeCalls = [];
  window.claude = {
    complete: async (input) => {
      window.__claudeCalls.push(typeof input === 'string' ? 'string' : 'object');
      await new Promise((r) => setTimeout(r, 150));
      return replies.shift() ?? '';
    },
  };
})();
""" % (
    json.dumps('{"version": 1, "title": "unfinished'),
    json.dumps("```json\n" + json.dumps(scenario, ensure_ascii=False) + "\n```"),
)


def main() -> int:
    if not HTML.exists():
        print("artifact/tahta-artifact.html missing: run npm run build:artifact", file=sys.stderr)
        return 1
    url = HTML.as_uri()
    problems: list[str] = []
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=os.environ.get("TAHTA_CHROMIUM") or None)

        def new_page(ctx):
            page = ctx.new_page()
            page.on("console", lambda m: problems.append(f"console {m.type}: {m.text}") if m.type == "error" else None)
            page.on("pageerror", lambda e: problems.append(f"pageerror: {e}"))
            page.on(
                "request",
                lambda r: problems.append(f"network request: {r.url}") if not r.url.startswith(("file:", "data:", "blob:")) else None,
            )
            return page

        # 1) Inside Claude: window.claude present -> artifact mode.
        ctx = browser.new_context(viewport={"width": 1500, "height": 1000}, device_scale_factor=1.5)
        ctx.add_init_script(FAKE_CLAUDE)
        page = new_page(ctx)
        page.goto(url + "?lang=en")
        page.wait_for_function("document.documentElement.dataset.ready === '1'", timeout=10000)
        page.evaluate("document.fonts.ready")
        checks = page.evaluate(
            """() => ({
              mode: document.documentElement.dataset.mode,
              settingsHidden: document.getElementById('btn-settings').hidden,
              noteVisible: !document.getElementById('mode-note').hidden,
              note: document.getElementById('mode-note').textContent,
              exportsHidden: ['btn-json', 'btn-svg', 'btn-png'].every((id) => document.getElementById(id).hidden),
              font: document.fonts.check("500 34px 'Caveat'", 'ğşıİçöü'),
            })"""
        )
        print("artifact mode:", checks)
        if checks["mode"] != "artifact" or not checks["settingsHidden"] or not checks["noteVisible"] or not checks["exportsHidden"]:
            problems.append(f"artifact mode UI wrong: {checks}")
        if not checks["font"]:
            problems.append("handwriting font not loaded from the inlined data")

        page.fill("#question", QUESTION)
        page.click("#btn-ask")
        page.wait_for_function(
            "document.querySelector('#narration strong')?.textContent === %s" % json.dumps(QUESTION), timeout=10000
        )
        status = page.evaluate("document.getElementById('status').hidden ? '' : document.getElementById('status').textContent")
        calls = page.evaluate("window.__claudeCalls")
        print("claude calls:", calls, "| status:", status)
        if calls != ["object", "object"]:
            problems.append(f"expected first call + one repair call, got {calls}")
        if "repair" not in status:
            problems.append(f"repair note missing, status was: {status!r}")

        # Play the generated board to its last step at the highest speed.
        page.select_option("#speed", page.evaluate("[...document.querySelectorAll('#speed option')].at(-1).value"))
        page.wait_for_function(
            """() => {
              const [cur, total] = document.getElementById('step-count').textContent.split('/').map(Number);
              return cur === total && document.getElementById('progress').value === '1000';
            }""",
            timeout=120000,
        )
        final = page.evaluate(
            """() => ({
              steps: document.getElementById('step-count').textContent,
              aiNote: document.querySelector('#narration .note')?.textContent ?? '',
              layoutFixes: document.documentElement.dataset.layoutFixes,
            })"""
        )
        print("played to end:", final)
        if not final["aiNote"]:
            problems.append("AI-generated note missing under the board")
        SHOT.parent.mkdir(parents=True, exist_ok=True)
        page.screenshot(path=str(SHOT))
        print("screenshot:", SHOT.relative_to(ROOT))
        ctx.close()

        # 2) Outside Claude: no window.claude -> the normal API-key mode, demos still play.
        ctx = browser.new_context(viewport={"width": 1200, "height": 900})
        page = new_page(ctx)
        page.goto(url + "?demo=kalp&at=1")
        page.wait_for_function("document.documentElement.dataset.ready === '1'", timeout=10000)
        plain = page.evaluate(
            """() => ({
              mode: document.documentElement.dataset.mode,
              settingsVisible: !document.getElementById('btn-settings').hidden,
              noteHidden: document.getElementById('mode-note').hidden,
              steps: document.getElementById('step-count').textContent,
            })"""
        )
        print("without window.claude:", plain)
        if plain["mode"] != "byok" or not plain["settingsVisible"] or not plain["noteHidden"]:
            problems.append(f"fallback mode UI wrong: {plain}")
        ctx.close()
        browser.close()

    if problems:
        print("\nPROBLEMS:", *problems, sep="\n  ")
        return 1
    print("OK: 0 console errors, 0 network requests")
    return 0


if __name__ == "__main__":
    sys.exit(main())
