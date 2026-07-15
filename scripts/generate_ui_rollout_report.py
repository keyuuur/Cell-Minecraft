"""Generate a mobile-readable PDF from a redacted UI-rollout run manifest."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

from PIL import Image
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfgen import canvas


INK = colors.HexColor("#F2F7F3")
MUTED = colors.HexColor("#B8C8C1")
LIME = colors.HexColor("#B4E957")
DEEP = colors.HexColor("#071A16")
PANEL = colors.HexColor("#0E3028")

CAPTIONS = {
    "01-identify-blank.png": (
        "1. Blank identification form",
        "The attempt begins with only first name, last initial, and class period. The baseline "
        "already keeps identity off the public gameplay HUD.",
    ),
    "02-controls-practice-complete.png": (
        "2. Selected controls and completed tutorial practice",
        "Touch Only was selected. The untimed practice required movement, look, Interact, Place, "
        "and Recenter before the mission button enabled.",
    ),
    "03-mission-opening.png": (
        "3. Mission opening and first wall objective",
        "The 15-minute active timer begins only after practice. The baseline objective identifies "
        "the wall task and the green supply depot.",
    ),
    "04-boundary-and-cytoplasm.png": (
        "4. Complete wall/membrane boundary and cytoplasm",
        "The outside wall, inside membrane, and cytoplasm fill are complete. Function credit was "
        "earned through nearby Inspect + Interact rather than placement alone.",
    ),
    "05-nucleus-and-ribosomes.png": (
        "5. Nucleus and ribosomes",
        "Both approved Unit 1 structures are installed and inspected. The screenshot also exposes "
        "the baseline scene crowding that Visual Pass 2 will address.",
    ),
    "06-mitochondria-and-chloroplasts.png": (
        "6. Mitochondria and chloroplasts",
        "The plant cell includes both energy-related structures at the approved Unit 1 depth. "
        "The function status has reached 88% after visible inspection.",
    ),
    "07-function-inspect-before.png": (
        "7A. Inspect before Interact",
        "The vacuole is placed and produces turgor, but its function evidence is still unrecorded. "
        "The nearby prompt identifies the structure that must be inspected.",
    ),
    "07-function-interact-after.png": (
        "7B. Interact after Inspect",
        "After the visible Interact action, observed functions reach 100%. This before/after pair "
        "proves placement and Overview alone did not award function credit.",
    ),
    "08-hydrated-overview.png": (
        "8. Hydrated vacuole, firm plant, and 100% turgor",
        "Overview records the hydrated baseline: a full central vacuole, high turgor pressure, and "
        "a firm plant indicator.",
    ),
    "09-drought-wilt-overview.png": (
        "9. Drought, wilt, and 25% Overview state",
        "Reduced external water availability shrinks the vacuole, lowers turgor to 25%, and wilts "
        "the plant. The wording correctly frames this as a homeostasis challenge.",
    ),
    "10-recovered-overview.png": (
        "10. Restored water, firm plant, and 100% Overview state",
        "After using the water station, the vacuole refills, turgor returns to 100%, and the plant "
        "becomes firm again.",
    ),
    "11-results-delivered.png": (
        "11. Results at 100% with delivery status",
        "The complete rubric totals 100%. This local baseline used an intercepted synthetic "
        "accepted receipt; no external student record was created.",
    ),
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--run-dir", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--evidence-sha", required=True)
    parser.add_argument("--next-focus", required=True)
    return parser.parse_args()


def wrap(text: str, font: str, size: float, width: float) -> list[str]:
    lines: list[str] = []
    current = ""
    for word in text.split():
        candidate = f"{current} {word}".strip()
        if current and stringWidth(candidate, font, size) > width:
            lines.append(current)
            current = word
        else:
            current = candidate
    if current:
        lines.append(current)
    return lines


def draw_wrapped(
    pdf: canvas.Canvas,
    text: str,
    x: float,
    y: float,
    width: float,
    font: str = "Helvetica",
    size: float = 11,
    leading: float = 15,
) -> float:
    pdf.setFont(font, size)
    for line in wrap(text, font, size, width):
        pdf.drawString(x, y, line)
        y -= leading
    return y


def page_frame(pdf: canvas.Canvas, page_number: int, label: str) -> None:
    width, height = letter
    pdf.setFillColor(DEEP)
    pdf.rect(0, 0, width, height, fill=1, stroke=0)
    pdf.setFillColor(LIME)
    pdf.setFont("Helvetica-Bold", 9)
    pdf.drawString(36, height - 28, "BUILD A LIVING CELL · UI ROLLOUT")
    pdf.setFillColor(MUTED)
    pdf.setFont("Helvetica", 8)
    pdf.drawRightString(width - 36, height - 28, label)
    pdf.drawRightString(width - 36, 20, f"Page {page_number}")


def verified_manifest(run_dir: Path) -> dict:
    manifest_path = run_dir / "run.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if manifest.get("outcome") != "success":
        raise ValueError("Only successful counted runs may be reported.")
    screenshots = manifest.get("screenshots", [])
    if len(screenshots) != 12:
        raise ValueError(f"Expected 12 screenshots, found {len(screenshots)}.")
    for item in screenshots:
        image_path = run_dir / item["filename"]
        digest = hashlib.sha256(image_path.read_bytes()).hexdigest()
        if digest != item["sha256"]:
            raise ValueError(f"Hash mismatch: {item['filename']}")
    return manifest


def draw_cover(
    pdf: canvas.Canvas,
    manifest: dict,
    evidence_sha: str,
    next_focus: str,
) -> None:
    width, height = letter
    page_frame(pdf, 1, f"Counted Run {manifest['countedRun']}")
    pdf.setFillColor(LIME)
    pdf.setFont("Helvetica-Bold", 13)
    pdf.drawString(42, height - 86, "BASELINE EVIDENCE")
    pdf.setFillColor(INK)
    pdf.setFont("Helvetica-Bold", 30)
    pdf.drawString(42, height - 128, "Run 1 completed at 100%")
    pdf.setFillColor(MUTED)
    y = draw_wrapped(
        pdf,
        "A fresh iPad-WebKit browser context completed identification, the actual control "
        "tutorial, all eight approved structures, drought, recovery, and Results through visible "
        "controls. The local submission was intercepted and answered with a synthetic accepted "
        "receipt, so no external student record was created.",
        42,
        height - 166,
        width - 84,
        size=12,
        leading=17,
    )
    y -= 18
    pdf.setFillColor(PANEL)
    pdf.roundRect(42, y - 154, width - 84, 154, 12, fill=1, stroke=0)
    pdf.setFillColor(INK)
    rows = [
        ("Profile", f"{manifest['engine']} · {manifest['viewport']['width']}×{manifest['viewport']['height']} · Touch Only"),
        ("App baseline", manifest["appBaseSha"][:12]),
        ("Evidence commit", evidence_sha[:12]),
        ("Errors", f"{len(manifest['pageErrors'])} page · {len(manifest['consoleErrors'])} console"),
        ("Panels", "11 numbered panels · 12 verified PNG files"),
        ("Submission", "Local intercepted synthetic accepted receipt"),
    ]
    row_y = y - 25
    for key, value in rows:
        pdf.setFont("Helvetica-Bold", 10)
        pdf.setFillColor(LIME)
        pdf.drawString(58, row_y, key)
        pdf.setFont("Helvetica", 10)
        pdf.setFillColor(INK)
        pdf.drawString(155, row_y, value)
        row_y -= 21
    y -= 184
    pdf.setFillColor(INK)
    pdf.setFont("Helvetica-Bold", 13)
    pdf.drawString(42, y, "Baseline findings carried into Visual Pass 1")
    pdf.setFillColor(MUTED)
    findings = [
        "The control tutorial is taller than one iPad viewport and needs clearer continuation.",
        "The objective must say nearby Inspect + Interact, not imply Overview awards function credit.",
        "HUD hierarchy, hotbar selection, and smaller critical targets need iPad-first refinement.",
        "Scene wayfinding and structure-specific feedback are reserved for Visual Pass 2.",
    ]
    y -= 23
    for finding in findings:
        y = draw_wrapped(pdf, f"• {finding}", 52, y, width - 104, size=10.5, leading=14)
        y -= 5
    y -= 8
    pdf.setFillColor(LIME)
    pdf.setFont("Helvetica-Bold", 11)
    pdf.drawString(42, y, "Next bounded focus")
    pdf.setFillColor(INK)
    draw_wrapped(pdf, next_focus, 42, y - 18, width - 84, size=10.5, leading=14)


def draw_screenshot_page(
    pdf: canvas.Canvas,
    page_number: int,
    image_path: Path,
    title: str,
    caption: str,
) -> None:
    width, height = letter
    page_frame(pdf, page_number, title.split(".", 1)[0])
    pdf.setFillColor(INK)
    pdf.setFont("Helvetica-Bold", 18)
    pdf.drawString(36, height - 64, title)
    pdf.setFillColor(MUTED)
    caption_bottom = draw_wrapped(pdf, caption, 36, height - 86, width - 72, size=10.5, leading=14)
    top = caption_bottom - 16
    bottom = 42
    available_width = width - 48
    available_height = top - bottom
    with Image.open(image_path) as source:
        image_width, image_height = source.size
    scale = min(available_width / image_width, available_height / image_height)
    rendered_width = image_width * scale
    rendered_height = image_height * scale
    x = (width - rendered_width) / 2
    y = bottom + (available_height - rendered_height) / 2
    pdf.setStrokeColor(colors.HexColor("#31584E"))
    pdf.setLineWidth(1)
    pdf.roundRect(x - 3, y - 3, rendered_width + 6, rendered_height + 6, 7, fill=0, stroke=1)
    pdf.drawImage(
        ImageReader(str(image_path)),
        x,
        y,
        rendered_width,
        rendered_height,
        preserveAspectRatio=True,
        mask="auto",
    )


def main() -> None:
    args = parse_args()
    run_dir = args.run_dir.resolve()
    output = args.output.resolve()
    manifest = verified_manifest(run_dir)
    output.parent.mkdir(parents=True, exist_ok=True)

    pdf = canvas.Canvas(str(output), pagesize=letter, pageCompression=1)
    pdf.setTitle(f"Build a Living Cell UI Rollout Run {manifest['countedRun']}")
    pdf.setAuthor("Build a Living Cell rollout coordinator")
    draw_cover(pdf, manifest, args.evidence_sha, args.next_focus)
    page_number = 2
    for item in manifest["screenshots"]:
        pdf.showPage()
        filename = item["filename"]
        title, caption = CAPTIONS[filename]
        draw_screenshot_page(pdf, page_number, run_dir / filename, title, caption)
        page_number += 1
    pdf.save()
    print(output)


if __name__ == "__main__":
    main()
