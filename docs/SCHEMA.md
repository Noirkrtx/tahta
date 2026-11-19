# Board scenario schema (version 1)

Source of truth: [`src/schema.ts`](../src/schema.ts). This page describes the same rules in prose. Everything here is enforced by `validateScenario`; a scenario that breaks a rule is rejected with a list of errors such as `steps[2].elements[0].cx: required`.

## Canvas

- Fixed virtual canvas, 1600 wide and 900 high. Origin top-left, x to the right, y down.
- The player writes the title (top-left, underlined) and the summary by itself. Authored content starts at y ≈ 250.
- Recommended regions: text column x 60–690, drawing area x 720–1560, both y 250–870.
- Coordinates must be finite numbers in [-200, 1800]; sizes (`r`, `rx`, `ry`, `w`, `h`) in [1, 1600].

## Top level

| Field | Type | Notes |
| --- | --- | --- |
| `version` | `1` | required |
| `lang` | `"tr"` \| `"en"` | required |
| `question` | string, ≤ 400 | optional; the original question |
| `title` | string, ≤ 80 | required; written at the top and underlined |
| `summary` | string, ≤ 220 | required; the core idea in one sentence, written under the title |
| `steps` | array of 1–14 steps | required; the prompt asks the model for 4–10 |

## Step

| Field | Type | Notes |
| --- | --- | --- |
| `title` | string, ≤ 70 | required; shown in the step list |
| `narration` | string, ≤ 500 | optional; shown under the board while the step is active; also sets the reading pause |
| `elements` | array of 1–24 elements | required; drawn in order |

At most 180 elements per scenario.

## Elements

Every element has a `type`. `color` and `fill` are optional everywhere they are listed and take one of `"ink"` (default), `"blue"`, `"red"`, `"amber"`, `"green"`. `fill` is a light tint. Unknown fields are errors.

| Type | Required | Optional |
| --- | --- | --- |
| `text` | `x`, `y`, `text` (≤ 180) | `size` (`sm` 34 px, `md` 42 px default, `lg` 58 px), `color`, `anchor` (`start` default, `middle`, `end`), `maxWidth` (80–1600) |
| `line` | `x1`, `y1`, `x2`, `y2` | `color`, `dashed` |
| `arrow` | `x1`, `y1`, `x2`, `y2` (head at 2) | `color`, `label` (≤ 40), `double` |
| `circle` | `cx`, `cy`, `r` | `color`, `fill`, `dashed` |
| `ellipse` | `cx`, `cy`, `rx`, `ry` | `rotation` (degrees), `color`, `fill`, `dashed` |
| `rect` | `x`, `y`, `w`, `h` | `color`, `fill` |
| `polyline` | `points` (2–40 `[x, y]` pairs) | `closed`, `color`, `fill` |
| `curve` | `points` (2–40 pairs; smooth curve through them) | `closed`, `arrowEnd`, `color`, `fill`, `dashed` |
| `arc` | `cx`, `cy`, `r`, `from`, `to` | `color`, `label` (≤ 40) |
| `path` | `d` | `color`, `fill` |

Details:

- **text**: `y` is the baseline of the first line. Text wraps automatically. Without `maxWidth`, text that starts in the left column wraps at x = 690 so it stays out of the drawing area; other text wraps at the canvas edge. `\n` forces a line break.
- **arrow label**: placed beside the middle of the arrow, on its upper side (to the right for vertical arrows).
- **arc**: angles in degrees; 0 points right, 90 points up, so positive angles run counter-clockwise on screen. The label sits just outside the middle of the arc.
- **path**: SVG path data restricted to the commands `M L H V C S Q T A Z` (either case) and plain numbers, at most 2000 characters, numbers within ±5000, must start with `M`. It is parsed and re-serialised, so nothing but those commands and numbers reaches the page. Paths are drawn exactly as given, without hand wobble.
- **Strings** are plain text. They are trimmed, may not be empty or contain control characters, and are rendered with `textContent`, so markup in them is shown literally.

## What the player adds

- Step 0 is always the intro: title, underline, summary.
- Seeded wobble: the seed comes from the title and the element's position in the scenario, so a scenario always renders the same way.
- Overlap fix: a `text` element that would overlap earlier text (including title and summary) is moved down until it is clear, as long as it stays on the canvas. Shapes and arrow/arc labels are not moved.
- Timing: about 38 ms per character for text, about 1100 canvas units per second for strokes, and a reading pause after each step that grows with the narration length (0.7 s to 5.2 s).
