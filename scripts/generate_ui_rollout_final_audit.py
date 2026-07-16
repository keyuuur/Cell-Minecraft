"""Create the final UI-rollout audit packet from the verified Run 5 report."""

from __future__ import annotations

import argparse
import hashlib
from pathlib import Path

from pypdf import PdfReader, PdfWriter
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfgen import canvas


INK = colors.HexColor("#F2F7F3")
MUTED = colors.HexColor("#B8C8C1")
LIME = colors.HexColor("#B4E957")
DEEP = colors.HexColor("#071A16")
PANEL = colors.HexColor("#0E3028")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-report", type=Path, required=True)
    parser.add_argument("--source-sha256", required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--audit-commit", required=True)
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
    *,
    font: str = "Helvetica",
    size: float = 10,
    leading: float = 13,
) -> float:
    pdf.setFont(font, size)
    for line in wrap(text, font, size, width):
        pdf.drawString(x, y, line)
        y -= leading
    return y


def draw_section(
    pdf: canvas.Canvas,
    title: str,
    lines: list[str],
    y: float,
) -> float:
    width, _ = letter
    pdf.setFillColor(PANEL)
    box_height = 27 + sum(max(1, len(wrap(line, "Helvetica", 9.5, width - 116))) for line in lines) * 13
    pdf.roundRect(42, y - box_height, width - 84, box_height, 9, fill=1, stroke=0)
    pdf.setFillColor(LIME)
    pdf.setFont("Helvetica-Bold", 11)
    pdf.drawString(56, y - 19, title)
    line_y = y - 38
    pdf.setFillColor(INK)
    for line in lines:
        line_y = draw_wrapped(pdf, f"- {line}", 62, line_y, width - 124, size=9.5, leading=13)
        line_y -= 3
    return y - box_height - 10


def create_cover(path: Path, audit_commit: str) -> None:
    width, height = letter
    pdf = canvas.Canvas(str(path), pagesize=letter, pageCompression=1)
    pdf.setTitle("Build a Living Cell UI Rollout Final Audit")
    pdf.setAuthor("Build a Living Cell rollout coordinator")
    pdf.setFillColor(DEEP)
    pdf.rect(0, 0, width, height, fill=1, stroke=0)
    pdf.setFillColor(LIME)
    pdf.setFont("Helvetica-Bold", 9)
    pdf.drawString(36, height - 28, "BUILD A LIVING CELL · UI ROLLOUT")
    pdf.setFillColor(MUTED)
    pdf.setFont("Helvetica", 8)
    pdf.drawRightString(width - 36, height - 28, "Final audit")
    pdf.drawRightString(width - 36, 20, "Page 1")

    pdf.setFillColor(LIME)
    pdf.setFont("Helvetica-Bold", 13)
    pdf.drawString(42, height - 74, "FIVE-RUN, THREE-PASS CLOSEOUT")
    pdf.setFillColor(INK)
    pdf.setFont("Helvetica-Bold", 29)
    pdf.drawString(42, height - 116, "Final rollout audit: GO")
    pdf.setFillColor(MUTED)
    y = draw_wrapped(
        pdf,
        "All five counted browser playthroughs, three visual passes, the protected Preview "
        "synthetic backend path, and the independent swarm audit passed. Production remains "
        "unpromoted because physical school-iPad and classroom evidence is still required.",
        42,
        height - 148,
        width - 84,
        size=11,
        leading=15,
    )
    y -= 14

    y = draw_section(
        pdf,
        "Automated and browser verification",
        [
            "Formatting, lint, TypeScript, 44 unit/component/API tests, and production build passed.",
            "28 of 28 applicable local browser scenarios passed serially across Chromium and emulated iPad WebKit.",
            "Four fail-closed visual-driver preflights passed: Production forbidden, live restricted to Run 5, Run 5 requires live mode, and live mode requires a protected target.",
        ],
        y,
    )
    y = draw_section(
        pdf,
        "Evidence integrity",
        [
            "Five successful counted manifests; 60 core PNGs representing 55 report panels; 12 diagnostics; 72 of 72 hashes match.",
            "Five progress reports total 77 pages. Manifest and PDF scans found no sensitive-data hits or replacement glyphs.",
            "Every run recorded one accepted page submission, zero page errors, zero console errors, passed graphics checks, visible Pause/Resume, and full-credit remove/replace/reinspect recovery.",
        ],
        y,
    )
    y = draw_section(
        pdf,
        "Preview, backend, and swarm posture",
        [
            "The exact final application Preview is Ready; Run 5 completed at 100% with an accepted synthetic receipt and original-receipt idempotency.",
            "The private Sheet has three test-only raw rows, no duplicate fourth row, and zero BestResults rows. No real student data was submitted.",
            "QA, Deployment/Ops, Biology, Classroom Fit, Game Loop, Student UX, Visual Direction, and Skeptical review all returned GO with no remaining P0-P2 finding.",
        ],
        y,
    )

    pdf.setFillColor(LIME)
    pdf.setFont("Helvetica-Bold", 10)
    pdf.drawString(42, y - 2, "External gates before classroom release")
    pdf.setFillColor(INK)
    draw_wrapped(
        pdf,
        "Physical school-iPad Safari/WebGL performance and 20-minute soak; simultaneous "
        "multitouch; orientation/background recovery; school Wi-Fi; hardware keyboard; "
        "shared-iPad pending-delivery privacy; and real-student completion/discoverability.",
        42,
        y - 19,
        width - 84,
        size=9.5,
        leading=13,
    )
    pdf.setFillColor(MUTED)
    pdf.setFont("Helvetica", 8)
    pdf.drawString(42, 35, f"Audit checkpoint: {audit_commit[:12]}")
    pdf.save()


def main() -> None:
    args = parse_args()
    source = args.source_report.resolve()
    output = args.output.resolve()
    expected = args.source_sha256.lower()
    actual = hashlib.sha256(source.read_bytes()).hexdigest()
    if actual != expected:
        raise ValueError("Source Run 5 report hash does not match the verified checkpoint.")

    output.parent.mkdir(parents=True, exist_ok=True)
    cover = output.with_name(f".{output.stem}-cover.pdf")
    create_cover(cover, args.audit_commit)
    try:
        writer = PdfWriter()
        writer.append(PdfReader(str(cover)))
        writer.append(PdfReader(str(source)))
        writer.add_metadata(
            {
                "/Title": "Build a Living Cell UI Rollout Final Audit",
                "/Author": "Build a Living Cell rollout coordinator",
            }
        )
        with output.open("wb") as destination:
            writer.write(destination)
    finally:
        cover.unlink(missing_ok=True)
    print(output)


if __name__ == "__main__":
    main()
