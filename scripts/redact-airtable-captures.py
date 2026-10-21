#!/usr/bin/env python3
"""
Redact the Airtable mobile captures into layout references.

The captures are of a live base and carry real contact names, phone numbers
and a staff member's name. Those must not travel into a Figma file, a design
tool prompt, or this repository — so every text run is replaced with a
redaction bar of the same box, and the row rhythm, the column widths, the
dividers and the chrome all survive.

Each capture is paired with the `uiautomator` dump taken in the same state, so
the bars land exactly on the text rather than on a guess.

Usage:
    python3 scripts/redact-airtable-captures.py <source-dir> <output-dir>

The source directory is expected to hold the captures and their dumps:

    screen.png            ui_contacts_list.xml
    sheet_cell.png        ui_record_detail.xml
    record_detail.png     ui_record_full.xml
    sort_sheet.png        ui_sort.xml
    filter_controls.png   ui_filter.xml
    drawer.png            ui_drawer.xml
    go_to_data.png        ui_gotodata.xml
"""

import sys
import xml.etree.ElementTree as ET
from pathlib import Path

from PIL import Image, ImageDraw

# capture -> the dump taken in the same state
PAIRS = {
    "screen.png": "ui_contacts_list.xml",
    "sheet_cell.png": "ui_record_detail.xml",
    "record_detail.png": "ui_record_full.xml",
    "sort_sheet.png": "ui_sort.xml",
    "filter_controls.png": "ui_filter.xml",
    "drawer.png": "ui_drawer.xml",
    "go_to_data.png": "ui_gotodata.xml",
}

# The bar that stands in for the text. The app's own border colour, so a
# redacted capture still reads as the interface it was.
BAR = (226, 232, 240, 255)

# Labels that are **interface, not data**.
#
# A reference whose chrome is blanked is a worse reference: the reader can no
# longer tell which sheet is the sort sheet or which column is the phone
# column. These are the app's own strings — navigation, field names, button
# captions — and none of them is a person's name or a phone number.
SAFE_LABELS = {
    "Admin Portal",
    "Attendance",
    "Back",
    "Branch",
    "Came in Touch",
    "Chat with Omni",
    "Close",
    "Close sheet",
    "Collected By",
    "Contacts",
    "Created",
    "Dashboard",
    "Date quick actions",
    "Default",
    "End user controls",
    "Everything is filtered",
    "Expand contact",
    "Favorite",
    "Favorites",
    "FOLK Chennai",
    "Go to data",
    "Grid view",
    "Last 2 months sessions attended",
    "Last Contacted On",
    "Location",
    "Manage Collaborators",
    "More options",
    "Name",
    "No visible data",
    "Notes",
    "Open interface",
    "Past60DayAttendanceCount",
    "Phone",
    "Share",
    "Sort",
    "Sort by",
    "Total Sessions Attended",
    "TotalAttendanceCount",
}


def bounds(node: ET.Element):
    """A node's `bounds` attribute as four ints, or None when it has none."""
    raw = node.get("bounds") or ""
    parts = raw.replace("][", ",").strip("[]").split(",")
    if len(parts) != 4:
        return None
    try:
        return tuple(int(part) for part in parts)
    except ValueError:
        return None


def text_nodes(root: ET.Element):
    """Every node that renders **data**: TextView and EditText with a value.

    A node whose text is one of the app's own interface labels is left alone —
    see `SAFE_LABELS`.
    """
    for node in root.iter("node"):
        if node.get("class", "").split(".")[-1] not in ("TextView", "EditText"):
            continue
        value = (node.get("text") or "").strip()
        if not value:
            continue
        if value in SAFE_LABELS:
            continue
        box = bounds(node)
        if box is None:
            continue
        yield box


def redact(source: Path, output: Path, dump: Path) -> bool:
    if not source.exists() or not dump.exists():
        return False

    image = Image.open(source).convert("RGBA")
    draw = ImageDraw.Draw(image)
    tree = ET.parse(dump)

    for left, top, right, bottom in text_nodes(tree.getroot()):
        # The bar is drawn **larger** than the text box rather than inside it.
        # An inset leaves the first and last glyph outside the bar, and a
        # redacted capture that still shows the first letter of a name is not
        # redacted — it is a name with a bar over it.
        draw.rectangle((left - 4, top - 2, right + 4, bottom + 2), fill=BAR)

    output.parent.mkdir(parents=True, exist_ok=True)
    image.convert("RGB").save(output, optimize=True)
    return True


def main() -> int:
    if len(sys.argv) != 3:
        print(__doc__)
        return 2

    source_dir = Path(sys.argv[1])
    output_dir = Path(sys.argv[2])

    written = 0

    for capture, dump_name in PAIRS.items():
        if redact(source_dir / capture, output_dir / capture, source_dir / dump_name):
            written += 1
            print(f"redacted {capture}")
        else:
            print(f"skipped {capture} (missing capture or dump)")

    print(f"{written} capture(s) redacted into {output_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
