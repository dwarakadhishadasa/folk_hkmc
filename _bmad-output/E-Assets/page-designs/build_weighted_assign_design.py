#!/usr/bin/env python3
"""Build the alternate 'Assign contacts' screen — weighted caller distribution.

The alternate design keeps the top nav, the page title and the left contacts
table exactly as they are in `campaign.figcraft`, and replaces only the
right-hand "Assign to" panel with one that splits the selected contacts
between callers by weight.

The screen is not rebuilt from scratch: the frame is copied out of
`campaign.figcraft` (so the header and the grid are the same layers, not a
redrawing of them), the old panel is deleted, and the new panel is built in
its place. The grid footer already reads "125 of 272 selected" and
"Clear all (125)" in the main design — 125 selected minus the 5 already
assigned is the 120 contacts the panel distributes — so only the panel
changes here.

Usage:

    python3 build_weighted_assign_design.py [out_dir]
    # -> campaign-weighted-assign.figcraft

Two notes for anyone editing this script, both learned the hard way:

- **FigCraft draws a vector by stretching the path's bounding box to fill the
  node's box.** The icons here are authored in their own coordinate space
  (14x14 for the plus, 10x10 for the x), so the stretch is the intent.
- **A FigCraft frame defaults to a white fill and a fixed 100x100 box.**
  Every frame below sets its fill, its sizing and its clipping explicitly.
- **`node.create` only reads styling from the `props` sub-dict.** Anything
  passed at the top level of a create is silently dropped, so this script
  follows every create with a `node.set`.
"""

import json
import os
import shutil
import subprocess
import sys
import zipfile

ROOT = os.path.dirname(os.path.abspath(__file__))
SOURCE = os.path.join(ROOT, "campaign.figcraft")
TARGET = "campaign-weighted-assign.figcraft"
PAGE_NAME = "Alternate \u2014 Weighted assign"
SOURCE_FRAME_NAME = "Campaign \u2014 Assign contacts (light, desktop only)"

# ---- the palette the brief asks for ---------------------------------------
NAVY = "#14215A"
TEXT = "#111827"
MUTED = "#6B7280"
BORDER = "#E5E7EB"
ORANGE = "#EA580C"
WHITE = "#FFFFFF"
DISABLED = "#9CA3AF"
CLEAR = "#FFFFFF00"

CONTENT_W = 366          # 408 card - 2 x 20 padding - 1px border
PANEL_W = 408

# ---- the three states the brief asks for ----------------------------------
WEIGHTED = [
    {"initials": "AN", "name": "Anand Narayanan", "weight": 5, "count": 60},
    {"initials": "DP", "name": "Divya Parthasarathy", "weight": 3, "count": 36},
    {"initials": "SK", "name": "Suresh Kannan", "weight": 1, "count": 12},
    {"initials": "MR", "name": "Meena Rajan", "weight": 1, "count": 12},
]
EQUAL = [
    {"initials": "AN", "name": "Anand Narayanan", "weight": 1, "count": 30},
    {"initials": "DP", "name": "Divya Parthasarathy", "weight": 1, "count": 30},
    {"initials": "SK", "name": "Suresh Kannan", "weight": 1, "count": 30},
    {"initials": "MR", "name": "Meena Rajan", "weight": 1, "count": 30},
]
SINGLE = [{"initials": "AN", "name": "Anand Narayanan", "weight": 1, "count": 120}]

ALREADY_ASSIGNED = [
    ("Kavya Krishnaswamy", "Anand Narayanan"),
    ("Shanti Balaji", "Divya Parthasarathy"),
    ("Dwaraka Dasa", "Anand Narayanan"),
    ("Mohanraj Anand", "Suresh Kannan"),
    ("Saranya Subramanian", "Suresh Kannan"),
]

ALERT_TRIANGLE = "M7 0.9 L13.7 13.1 H0.3 Z M7 5.1 V8.4 M7 10.4 V11"
ICON_X = "M2.5 2.5 L9.5 9.5 M9.5 2.5 L2.5 9.5"
ICON_PLUS = "M7 1.5 V12.5 M1.5 7 H12.5"


# --------------------------------------------------------------------------
# Command stream
# --------------------------------------------------------------------------

CREATE_KEYS = {"type", "parent", "name", "x", "y", "width", "height", "text",
               "path", "index", "select"}


class Ref:
    """A handle on a layer created earlier in the stream."""

    def __init__(self, step):
        self.step = step


class Stream:
    """A list of FigCraft commands; `ref` points at a step's new layer id."""

    def __init__(self):
        self.cmds = []

    def add(self, command, params):
        self.cmds.append({"command": command, "params": params})
        return len(self.cmds) - 1

    def ref(self, step):
        return {"$step": step}

    def parent(self, parent):
        """A step handle becomes a $step ref; a plain node id stays as it is."""
        if isinstance(parent, Ref):
            return self.ref(parent.step)
        return parent

    def create(self, **params):
        """Create a layer, then style it (node.create ignores top-level styling)."""
        style = {k: v for k, v in params.items() if k not in CREATE_KEYS}
        params = {k: v for k, v in params.items() if k in CREATE_KEYS}
        step = self.add("node.create", params)
        if style:
            self.add("node.set", dict(style, ids=[self.ref(step)]))
        return step

    def frame(self, parent, name, width=None, height=None, **props):
        p = {"type": "frame", "parent": self.parent(parent), "name": name}
        style = {"clip": props.pop("clip", False)}
        if width is None:
            style["sizingH"] = "hug"
        else:
            p["width"] = width
        if height is None:
            style["sizingV"] = "hug"
        else:
            p["height"] = height
        p.update(props)
        p.update(style)
        return Ref(self.create(**p))

    def text(self, parent, chars, name=None, size=13, weight="Regular", color=TEXT,
             width=None, align=None, features=None, truncate=False, x=None, y=None):
        props = {"fontFamily": "Inter", "fontStyle": weight, "fontSize": size,
                 "fill": color}
        if align:
            props["textAlign"] = align
        if features:
            props["features"] = features
        if width is not None:
            props["width"] = width
            props["textAutoResize"] = "truncate" if truncate else "height"
            if truncate:
                props["maxLines"] = 1
        p = {"type": "text", "parent": self.parent(parent), "text": chars,
             "name": name or chars[:40]}
        if x is not None:
            p["x"] = x
        if y is not None:
            p["y"] = y
        return Ref(self.create(props=props, **p))

    def vector(self, parent, name, path, size, stroke, weight=1.5):
        return Ref(self.create(
            type="vector", parent=self.parent(parent), name=name, width=size,
            height=size, path=path,
            props={"fills": [CLEAR], "strokes": [stroke], "strokeWeight": weight,
                   "strokeCap": "round", "strokeJoin": "round"},
        ))


# --------------------------------------------------------------------------
# The panel
# --------------------------------------------------------------------------

def stepper(s, parent, x, y, weight):
    """[- 32][number 36][+ 32] in a 100x32 control."""
    box = s.frame(parent, "stepper", width=100, height=32, x=x, y=y,
                  fill=WHITE, strokes=[BORDER], strokeWeight=1, cornerRadius=8,
                  clip=True)
    minus = s.frame(box, "btn-minus", width=32, height=32, x=0, y=0,
                    layout="horizontal", mainAlign="center", crossAlign="center",
                    fill=CLEAR)
    s.text(minus, "\u2212", name="minus", size=15, weight="Medium",
           color=TEXT if weight > 1 else DISABLED, width=32, align="center")
    field = s.frame(box, "weight-field", width=36, height=32, x=32, y=0,
                    layout="horizontal", mainAlign="center", crossAlign="center",
                    fill=CLEAR)
    s.text(field, str(weight), name="weight-value", size=14, weight="Medium",
           color=TEXT, width=36, align="center", features={"tnum": True})
    plus = s.frame(box, "btn-plus", width=32, height=32, x=68, y=0,
                   layout="horizontal", mainAlign="center", crossAlign="center",
                   fill=CLEAR)
    s.text(plus, "+", name="plus", size=15, weight="Medium", color=TEXT,
           width=32, align="center")
    s.frame(box, "divider-1", width=1, height=32, x=32, y=0, fill=BORDER)
    s.frame(box, "divider-2", width=1, height=32, x=68, y=0, fill=BORDER)
    return box


def caller_row(s, parent, initials, name, weight=None, count=None, muted=False,
               single=False):
    """One 48px caller row: avatar + name | stepper | count | remove."""
    row = s.frame(parent, "row-" + initials.lower(), width=CONTENT_W, height=48,
                  fill=CLEAR)
    avatar = s.frame(row, "avatar", width=28, height=28, x=0, y=10,
                     layout="horizontal", mainAlign="center", crossAlign="center",
                     fill=NAVY, cornerRadius=999)
    s.text(avatar, initials, name="initials", size=10, weight="SemiBold", color=WHITE,
           width=28, align="center")
    s.text(row, name, name="name", size=14, color=TEXT, width=146, truncate=True,
           x=38, y=15)
    if single:
        s.text(row, "All 120", name="all-count", size=16, weight="SemiBold",
               color=TEXT, width=60, align="right", features={"tnum": True}, x=280, y=14)
    else:
        stepper(s, row, 184, 8, weight)
        s.text(row, str(count), name="count", size=16, weight="SemiBold",
               color=MUTED if muted else TEXT, width=44, align="right",
               features={"tnum": True}, x=296, y=14)
    remove = s.frame(row, "remove", width=16, height=16, x=350, y=16,
                     layout="horizontal", mainAlign="center", crossAlign="center",
                     fill=CLEAR)
    s.vector(remove, "icon-x", ICON_X, 10, DISABLED, weight=1.6)
    return row


def caller_list(s, parent, rows, single=False):
    """48px per caller, a hairline between rows."""
    lst = s.frame(parent, "caller-list", width=CONTENT_W, layout="vertical", gap=0,
                  fill=CLEAR)
    for i, r in enumerate(rows):
        caller_row(s, lst, r["initials"], r["name"], r.get("weight"), r.get("count"),
                   r.get("muted", False), single=single)
        if i < len(rows) - 1:
            s.frame(lst, "divider", width=CONTENT_W, height=1, fill=BORDER)
    return lst


def column_head(s, parent):
    """Caller | Weight (centred over the steppers) | Contacts (right)."""
    head = s.frame(parent, "col-head", width=CONTENT_W, height=15, fill=CLEAR)
    s.text(head, "Caller", name="th-caller", size=12, color=MUTED, width=100, x=0, y=0)
    s.text(head, "Weight", name="th-weight", size=12, color=MUTED, width=100,
           align="center", x=184, y=0)
    s.text(head, "Contacts", name="th-contacts", size=12, color=MUTED, width=60,
           align="right", x=280, y=0)
    return head


def actions(s, parent, show_reset):
    row = s.frame(parent, "field-actions", width=CONTENT_W, height=24,
                  layout="horizontal", mainAlign="spaceBetween", crossAlign="center",
                  fill=CLEAR)
    add = s.frame(row, "add-caller", layout="horizontal", gap=6, crossAlign="center",
                  fill=CLEAR)
    s.vector(add, "icon-plus", ICON_PLUS, 14, NAVY, weight=1.5)
    s.text(add, "Add caller", name="add-caller-label", size=14, weight="Medium",
           color=NAVY, width=90)
    if show_reset:
        s.text(row, "Reset to equal", name="reset-equal", size=13, color=MUTED,
               width=100, align="right")
    return row


def warning(s, parent, expand=False):
    """A plain line, no box: the five contacts that will be skipped."""
    blk = s.frame(parent, "warning", width=CONTENT_W, layout="vertical", gap=8,
                  fill=CLEAR)
    line = s.frame(blk, "warning-line", width=CONTENT_W, layout="horizontal", gap=8,
                   crossAlign="min", fill=CLEAR)
    icon = s.frame(line, "icon-slot-alert", width=14, height=14, fill=CLEAR)
    s.vector(icon, "icon-triangle-alert", ALERT_TRIANGLE, 14, ORANGE, weight=1.4)
    copy = s.frame(line, "warning-copy", layout="vertical", gap=0, fill=CLEAR)
    s.text(copy, "5 selected contacts are already assigned and will be",
           name="warning-text", size=13, color=ORANGE, width=340)
    l2 = s.frame(copy, "warning-line-2", layout="horizontal", gap=8,
                 crossAlign="center", fill=CLEAR)
    s.text(l2, "skipped.", name="warning-text-2", size=13, color=ORANGE, width=60)
    s.text(l2, "View", name="warning-view", size=13, weight="Medium", color=NAVY,
           width=40)
    if expand:
        lst = s.frame(blk, "warning-list", width=CONTENT_W, layout="vertical", gap=6,
                      padding=[0, 0, 0, 22], fill=CLEAR)
        for contact, caller in ALREADY_ASSIGNED:
            item = s.frame(lst, "assigned", layout="horizontal", gap=8,
                           crossAlign="center", fill=CLEAR)
            s.text(item, contact, name="assigned-contact", size=12, color=TEXT,
                   width=150)
            s.text(item, "\u2192 " + caller, name="assigned-caller", size=12, color=MUTED,
                   width=170)
        s.text(lst, "Reassign them from the Campaign page.", name="assigned-note",
               size=12, color=MUTED, width=344)
    return blk


def panel(s, parent, rows, *, show_helper=True, show_headers=True, show_reset=False,
          expand_view=False, single=False, total=120, name="panel"):
    """The 'Assign to' card."""
    card = s.frame(parent, name, width=PANEL_W, layout="vertical", gap=16, padding=20,
                   fill=WHITE, strokes=[BORDER], strokeWeight=1, cornerRadius=12)
    s.text(card, "Assign to", name="panel-title", size=16, weight="SemiBold",
           color=TEXT, width=100)

    field = s.frame(card, "field-Callers", width=CONTENT_W, layout="vertical", gap=12,
                    fill=CLEAR)
    head = s.frame(field, "field-head", layout="vertical", gap=4, fill=CLEAR)
    s.text(head, "Callers", name="label-callers", size=14, weight="Medium", color=TEXT,
           width=100)
    if show_helper:
        s.text(head, "Higher weight gets more contacts. Equal weights split evenly.",
               name="helper", size=12, color=MUTED, width=CONTENT_W)
    if show_headers:
        column_head(s, field)
    caller_list(s, field, rows, single=single)
    actions(s, field, show_reset)

    warning(s, card, expand=expand_view)

    btn = s.frame(card, "btn-Assign %d contacts" % total, width=CONTENT_W, height=44,
                  layout="horizontal", mainAlign="center", crossAlign="center",
                  fill=NAVY, cornerRadius=8)
    s.text(btn, "Assign %d contacts" % total, name="btn-label", size=15,
           weight="SemiBold", color=WHITE, width=200, align="center")
    return card


# --------------------------------------------------------------------------
# FigCraft plumbing
# --------------------------------------------------------------------------

def run(script, src, out):
    """Run one command script through the FigCraft CLI."""
    path = os.path.join(ROOT, "weighted-assign-step.json")
    with open(path, "w") as fh:
        json.dump(script, fh, indent=1)
    cmd = [
        "figcraft.cli", "run", path, "--in", src, "--out", out,
        "--automation-read-root", ROOT,
        "--automation-write-root", ROOT,
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        sys.stderr.write(proc.stdout[-4000:] + proc.stderr[-4000:])
        raise SystemExit("figcraft.cli run failed")
    results = []
    for line in proc.stdout.strip().splitlines():
        if line.startswith("{"):
            results.append(json.loads(line))
    for r in results:
        if not r.get("ok"):
            raise SystemExit("step failed: %s" % json.dumps(r))
    os.remove(path)
    return results


def read_nodes(path):
    with zipfile.ZipFile(path) as z:
        doc = json.loads(z.read("document.json"))
    return doc["nodes"]


def find(node, nodes, name):
    """First descendant of `node` with the given layer name."""
    for cid in node.get("children", []):
        child = nodes[str(cid)]
        if child.get("name") == name:
            return child
        hit = find(child, nodes, name)
        if hit:
            return hit
    return None


def build(out_dir):
    src = os.path.join(ROOT, "campaign.figcraft")
    if not os.path.exists(src):
        raise SystemExit("missing %s — build it with build_campaigner_designs.py first"
                         % src)
    out = os.path.join(out_dir, TARGET)
    shutil.copyfile(src, out)

    # --- 1. a page of its own, and a copy of the screen to hang it on ------
    res = run([
        {"command": "page.add", "params": {"name": PAGE_NAME}},
        {"command": "page.setBackground", "params": {"id": {"$step": 0},
                                                      "color": "#FFFFFF"}},
        {"command": "edit.copy", "params": {"ids": [324]}},
        {"command": "edit.paste", "params": {"parent": {"$step": 0}, "x": 0, "y": 0}},
    ], out, out)
    page = res[0]["result"]["id"]
    screen = res[3]["result"]["ids"][0]
    run([{"command": "node.set", "params": {
        "ids": [screen],
        "name": "Assign contacts (light, desktop only) \u2014 weighted"}}], out, out)

    nodes = read_nodes(out)
    frame = nodes[str(screen)]
    right = find(frame, nodes, "right")
    old_panel = [nodes[str(c)]["id"] for c in right["children"]]

    # --- 2. drop the old panel -------------------------------------------
    # The footer already reads "125 of 272 selected" / "Clear all (125)" in
    # campaign.figcraft and is copied with the frame, so there is nothing to
    # rewrite here.
    run([{"command": "edit.delete", "params": {"ids": old_panel}}], out, out)

    # --- 3. the weighted panel, and the two panel-only states -------------
    s = Stream()
    panel(s, right["id"], WEIGHTED, show_reset=True, expand_view=True)

    equal = panel(s, page, EQUAL, show_reset=False, expand_view=False,
                  name="Assign to panel \u2014 equal weights (default)")
    s.add("node.set", {"ids": [s.parent(equal)], "x": 1520, "y": 0})

    single = panel(s, page, SINGLE, show_helper=False, show_headers=False,
                   show_reset=False, expand_view=False, single=True,
                   name="Assign to panel \u2014 single caller")
    s.add("node.set", {"ids": [s.parent(single)], "x": 2020, "y": 0})

    run(s.cmds, out, out)

    # --- 4. the right column takes the height of the new panel ------------
    run([{"command": "node.set", "params": {"ids": [right["id"]], "sizingV": "hug",
                                            "height": 700}}], out, out)

    nodes = read_nodes(out)
    print("wrote %s — page %s, screen %s" % (out, page, screen))


if __name__ == "__main__":
    here = os.path.dirname(os.path.abspath(__file__))
    target_dir = sys.argv[1] if len(sys.argv) > 1 else here
    build(target_dir)
