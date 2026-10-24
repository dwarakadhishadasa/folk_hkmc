#!/usr/bin/env python3
"""
build_campaigner_designs.py — generate the FOLK "Campaigner" FigCraft design file.

Every colour, radius, type size and control shape in here is taken from the
running `folk_hkmc` app (apps/folk/app/globals.css, components/header.tsx,
components/manage/manage-portal.tsx) and from screenshots captured off the
local stack. Nothing is invented: the Campaigner surface reuses the app's own
header pill, tab strip, grid toolbar and table, so it reads as part of the
product rather than a new app dropped next to it.

Screens:
  Desktop  1440x900  Campaigns / New campaign / Assign / Callers / Reports
  Mobile    390x844  Dialer session (6 states) + Campaigner admin (3 states)

Usage:  python3 build_campaigner_designs.py <out-dir>
"""

import json
import math
import os
import struct
import re
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))
LUCIDE = "/home/dwarakadhisha-dasa/projects/hkmc/folk_hkmc/node_modules/lucide-react/dist/esm/icons"

# --------------------------------------------------------------------------
# Tokens — copied verbatim from apps/folk/app/globals.css
# --------------------------------------------------------------------------

LIGHT = {
    "bg": "#ffffff", "surface": "#ffffff", "surface2": "#f8fafc", "field": "#ffffff",
    "text": "#24324a", "muted": "#4a5568", "faint": "#64748b",
    "border": "#e2e8f0", "borderStrong": "#cbd5e1",
    "primary": "#0f1e54", "primaryLight": "#1a2d6d", "primarySoft": "#eef1f8",
    "success": "#15803d", "successSoft": "#e8f5ec",
    "warning": "#f97f29", "warningSoft": "#fdf2e6",
    "danger": "#c2410c", "dangerSoft": "#fdeee7",
    "info": "#1e40af", "infoSoft": "#e8eefc",
    "chip": "#e9ebef", "chipFg": "#3b3f4b",
    "header": "#0f1e54", "headerText": "#ffffff",
    "headerNavBg": "#ffffff1a", "headerNavText": "#ffffffcc",
    "headerActionBg": "#ffffff1a", "headerHover": "#ffffff29",
    "bottomNav": "#fffffff2",
    "tabBorder": "#e2e8f0", "tabActive": "#0f1e54", "tabUnderline": "#0f1e54",
    "tabInactive": "#4a5568",
    "chart1": "#1e40af", "chart2": "#15803d", "chart3": "#c2410c", "chart4": "#0f1e54", "chart5": "#64748b",
    "strong": "#0f1e54",
    "scrim": "#0f1e5466",
}

DARK = {
    "bg": "#1f2124", "surface": "#272a2e", "surface2": "#2f3338", "field": "#2f3338",
    "text": "#e9eaeb", "muted": "#9da1a6", "faint": "#91959c",
    "border": "#3c4045", "borderStrong": "#4a4e53",
    "primary": "#2f4b9e", "primaryLight": "#3b5cc4", "primarySoft": "#22305c",
    "success": "#4ade80", "successSoft": "#1e3a25",
    "warning": "#f97f29", "warningSoft": "#3a2a19",
    "danger": "#f08a5d", "dangerSoft": "#3d2519",
    "info": "#60a5fa", "infoSoft": "#1c2b45",
    "chip": "#3b3f4b", "chipFg": "#e5e7eb",
    "header": "#060606", "headerText": "#e9eaeb",
    "headerNavBg": "#ffffff00", "headerNavText": "#91959c",
    "headerActionBg": "#292a30", "headerHover": "#292a30",
    "bottomNav": "#fffffff2",
    "tabBorder": "#34363b", "tabActive": "#ffffff", "tabUnderline": "#048a0e",
    "tabInactive": "#91959c",
    "chart1": "#60a5fa", "chart2": "#4ade80", "chart3": "#f08a5d", "chart4": "#7da3e8", "chart5": "#9da1a6",
    "strong": "#e9eaeb",
    "scrim": "#00000099",
}

# The header's own light-theme fallback chain (header.tsx headerThemeVars).
LIGHT["headerNavText"] = "#ffffffcc"

POPPINS = "Poppins"
INTER = "Inter"

# --------------------------------------------------------------------------
# Lucide icon paths
# --------------------------------------------------------------------------

_ICON_CACHE = {}


def _num(v):
    return float(str(v).replace(",", " "))


def _circle_to_path(cx, cy, r):
    return (f"M {cx - r} {cy} a {r} {r} 0 1 0 {2 * r} 0 "
            f"a {r} {r} 0 1 0 {-2 * r} 0 Z")


def _rect_to_path(x, y, w, h, rx=0):
    if not rx:
        return f"M {x} {y} H {x + w} V {y + h} H {x} Z"
    return (f"M {x + rx} {y} H {x + w - rx} A {rx} {rx} 0 0 1 {x + w} {y + rx} "
            f"V {y + h - rx} A {rx} {rx} 0 0 1 {x + w - rx} {y + h} "
            f"H {x + rx} A {rx} {rx} 0 0 1 {x} {y + h - rx} "
            f"V {y + rx} A {rx} {rx} 0 0 1 {x + rx} {y} Z")


def _anchor(d):
    """A lucide <path> starts at the origin; our concatenation does not.

    Lucide writes each sub-path as its own SVG <path> element, so a leading
    "m 6 6" means "start at 6,6" — absolute. Concatenated into one path, that
    same "m" would be relative to the previous sub-path's end point. Rewrite
    the leading move so every sub-path is anchored where Lucide means it.
    """
    d = d.strip()
    if not d:
        return d
    if d[0] == "M":
        return d
    if d[0] == "m":
        m = re.match(r"^m\s*(-?\d*\.?\d+)[,\s]+(-?\d*\.?\d+)\s*(.*)$", d, re.S)
        if not m:
            return d
        dx, dy, rest = m.group(1), m.group(2), m.group(3).strip().lstrip(",").strip()
        if not rest:
            return f"M {dx} {dy}"
        if re.match(r"^[-.\d]", rest):
            # Implicit linetos after a move are relative to the move.
            return f"M {dx} {dy} l {rest}"
        # The rest is a command in its own right (an arc, a curve).
        return f"M {dx} {dy} {rest}"
    return "M 0 0 " + d


# --- path transformation -------------------------------------------------
#
# FigCraft draws a vector by stretching the path's own bounding box to fill
# the node's box. Lucide draws in a 24x24 grid, so an icon's box is rarely
# square and the stretch would distort it. The path is therefore rewritten
# here: every command becomes absolute, every coordinate is scaled into the
# node's box, and the icon's ink lands exactly where the bbox says it does.

_TOKEN = re.compile(r"([MmLlHhVvAaCcSsQqTtZz])|(-?\d*\.?\d+(?:e[-+]?\d+)?)")


def _arc_points(x1, y1, rx, ry, phi_deg, large, sweep, x2, y2, n=24):
    """Sample an elliptical arc so its bounds are exact enough for an icon."""
    if rx == 0 or ry == 0:
        return [(x2, y2)]
    phi = math.radians(phi_deg)
    cosp, sinp = math.cos(phi), math.sin(phi)
    dx2, dy2 = (x1 - x2) / 2.0, (y1 - y2) / 2.0
    x1p = cosp * dx2 + sinp * dy2
    y1p = -sinp * dx2 + cosp * dy2
    rx, ry = abs(rx), abs(ry)
    lam = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry)
    if lam > 1:
        scale = math.sqrt(lam)
        rx, ry = rx * scale, ry * scale
    num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p
    den = rx * rx * y1p * y1p + ry * ry * x1p * x1p
    coef = math.sqrt(max(0.0, num / den)) if den else 0.0
    if large == sweep:
        coef = -coef
    cxp = coef * rx * y1p / ry
    cyp = -coef * ry * x1p / rx
    cx = cosp * cxp - sinp * cyp + (x1 + x2) / 2.0
    cy = sinp * cxp + cosp * cyp + (y1 + y2) / 2.0
    ang = math.atan2((y1p - cyp) / ry, (x1p - cxp) / rx)
    ang2 = math.atan2((-y1p - cyp) / ry, (-x1p - cxp) / rx)
    delta = ang2 - ang
    if not sweep and delta > 0:
        delta -= 2 * math.pi
    elif sweep and delta < 0:
        delta += 2 * math.pi
    pts = []
    for i in range(n + 1):
        t = ang + delta * i / n
        px = cosp * rx * math.cos(t) - sinp * ry * math.sin(t) + cx
        py = sinp * rx * math.cos(t) + cosp * ry * math.sin(t) + cy
        pts.append((px, py))
    return pts


def _cubic(p0, p1, p2, p3, n=16):
    out = []
    for i in range(n + 1):
        t = i / n
        u = 1 - t
        out.append((
            u ** 3 * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t ** 3 * p3[0],
            u ** 3 * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t ** 3 * p3[1],
        ))
    return out


def _quad(p0, p1, p2, n=16):
    out = []
    for i in range(n + 1):
        t = i / n
        u = 1 - t
        out.append((u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0],
                    u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1]))
    return out


def parse_path(d):
    """Yield (command, [absolute params]) for an SVG path."""
    tokens = _TOKEN.findall(d)
    i = 0
    cmd = None
    cx = cy = 0.0
    sx = sy = 0.0
    prev_c2 = None      # last cubic's second control point
    prev_q = None       # last quadratic's control point
    while i < len(tokens):
        letter, number = tokens[i]
        if letter:
            cmd = letter
            i += 1
            if cmd in "Zz":
                cx, cy = sx, sy
                prev_c2 = prev_q = None
                yield ("Z", [])
                continue
        if cmd is None:
            break
        upper = cmd.upper()
        rel = cmd.islower()
        count = {"A": 7, "C": 6, "S": 4, "Q": 4, "T": 2, "H": 1, "V": 1}.get(upper, 2)
        nums = []
        for _ in range(count):
            if i < len(tokens) and tokens[i][1]:
                nums.append(float(tokens[i][1]))
                i += 1
            else:
                nums.append(0.0)
        if upper == "M":
            x, y = nums
            if rel:
                x, y = cx + x, cy + y
            cx, cy = sx, sy = x, y
            prev_c2 = prev_q = None
            yield ("M", [x, y])
            cmd = "l" if rel else "L"     # implicit linetos
        elif upper == "L":
            x, y = nums
            if rel:
                x, y = cx + x, cy + y
            cx, cy = x, y
            prev_c2 = prev_q = None
            yield ("L", [x, y])
        elif upper == "H":
            x = cx + nums[0] if rel else nums[0]
            cx = x
            prev_c2 = prev_q = None
            yield ("L", [x, cy])
        elif upper == "V":
            y = cy + nums[0] if rel else nums[0]
            cy = y
            prev_c2 = prev_q = None
            yield ("L", [cx, y])
        elif upper == "C":
            x1, y1, x2, y2, x, y = nums
            if rel:
                x1, y1, x2, y2, x, y = cx + x1, cy + y1, cx + x2, cy + y2, cx + x, cy + y
            yield ("C", [x1, y1, x2, y2, x, y])
            prev_c2 = (x2, y2)
            prev_q = None
            cx, cy = x, y
        elif upper == "S":
            x2, y2, x, y = nums
            if rel:
                x2, y2, x, y = cx + x2, cy + y2, cx + x, cy + y
            x1, y1 = prev_c2 if prev_c2 else (cx, cy)
            x1 = 2 * cx - x1
            y1 = 2 * cy - y1
            yield ("C", [x1, y1, x2, y2, x, y])
            prev_c2 = (x2, y2)
            prev_q = None
            cx, cy = x, y
        elif upper == "Q":
            x1, y1, x, y = nums
            if rel:
                x1, y1, x, y = cx + x1, cy + y1, cx + x, cy + y
            yield ("Q", [x1, y1, x, y])
            prev_q = (x1, y1)
            prev_c2 = None
            cx, cy = x, y
        elif upper == "T":
            x, y = nums
            if rel:
                x, y = cx + x, cy + y
            x1, y1 = prev_q if prev_q else (cx, cy)
            x1 = 2 * cx - x1
            y1 = 2 * cy - y1
            yield ("Q", [x1, y1, x, y])
            prev_q = (x1, y1)
            prev_c2 = None
            cx, cy = x, y
        elif upper == "A":
            rx, ry, rot, laf, sf, x, y = nums
            if rel:
                x, y = cx + x, cy + y
            yield ("A", [rx, ry, rot, laf, sf, x, y])
            cx, cy = x, y
            prev_c2 = prev_q = None


def path_bbox(d):
    """(x0, y0, x1, y1) of the ink, sampled along curves."""
    xs, ys = [], []
    cx = cy = 0.0
    sx = sy = 0.0
    for cmd, params in parse_path(d):
        if cmd == "M":
            cx, cy = sx, sy = params
            xs.append(cx)
            ys.append(cy)
        elif cmd == "L":
            cx, cy = params
            xs.append(cx)
            ys.append(cy)
        elif cmd == "C":
            x1, y1, x2, y2, x, y = params
            for px, py in _cubic((cx, cy), (x1, y1), (x2, y2), (x, y)):
                xs.append(px)
                ys.append(py)
            cx, cy = x, y
        elif cmd == "Q":
            x1, y1, x, y = params
            for px, py in _quad((cx, cy), (x1, y1), (x, y)):
                xs.append(px)
                ys.append(py)
            cx, cy = x, y
        elif cmd == "A":
            rx, ry, rot, laf, sf, x, y = params
            for px, py in _arc_points(cx, cy, rx, ry, rot, laf, sf, x, y):
                xs.append(px)
                ys.append(py)
            cx, cy = x, y
        elif cmd == "Z":
            cx, cy = sx, sy
    if not xs:
        return 0.0, 0.0, 1.0, 1.0
    return min(xs), min(ys), max(xs), max(ys)


def flatten_path(d):
    """The path as absolute commands, sampled so curves are poly-lines."""
    out = []
    for cmd, params in parse_path(d):
        if cmd == "C":
            x1, y1, x2, y2, x, y = params
            out.append(("L", [(x1, y1), (x2, y2), (x, y)]))
        elif cmd == "Q":
            x1, y1, x, y = params
            out.append(("L", [(x1, y1), (x, y)]))
        elif cmd == "A":
            rx, ry, rot, laf, sf, x, y = params
            last = out[-1][1][-1] if out else (0.0, 0.0)
            out.append(("L", _arc_points(last[0], last[1], rx, ry, rot, laf, sf, x, y)))
        else:
            out.append((cmd, [(params[0], params[1])] if len(params) >= 2 else []))
    return out


def fit_path(d, box_w, box_h):
    """Rewrite a path so its ink fills a box_w x box_h box, undistorted."""
    x0, y0, x1, y1 = path_bbox(d)
    w, h = max(x1 - x0, 1e-6), max(y1 - y0, 1e-6)
    k = min(box_w / w, box_h / h)
    ox = (box_w - w * k) / 2.0 - x0 * k
    oy = (box_h - h * k) / 2.0 - y0 * k
    parts = []
    for cmd, points in flatten_path(d):
        if cmd == "Z":
            parts.append("Z")
            continue
        for px, py in points:
            parts.append(f"{'M' if cmd == 'M' else 'L'} {px * k + ox:g} {py * k + oy:g}")
    return " ".join(parts)


def lucide(name):
    """Return the SVG path data for a lucide icon, normalised to one path."""
    if name in _ICON_CACHE:
        return _ICON_CACHE[name]
    src = open(os.path.join(LUCIDE, f"{name}.js")).read()
    body = src[src.index("createLucideIcon("):]
    body = body[body.index("["):body.index("]);")]
    parts = re.findall(r'\[\s*"(\w+)",\s*\{([^}]*)\}\s*\]', body, re.S)
    segs = []
    for kind, raw in parts:
        attrs = dict(re.findall(r'(\w+):\s*"([^"]*)"', raw))
        if kind == "path":
            segs.append(_anchor(attrs["d"]))
        elif kind == "circle":
            segs.append(_circle_to_path(_num(attrs["cx"]), _num(attrs["cy"]), _num(attrs["r"])))
        elif kind == "ellipse":
            cx, cy = _num(attrs["cx"]), _num(attrs["cy"])
            rx, ry = _num(attrs["rx"]), _num(attrs["ry"])
            segs.append(f"M {cx - rx} {cy} a {rx} {ry} 0 1 0 {2 * rx} 0 a {rx} {ry} 0 1 0 {-2 * rx} 0 Z")
        elif kind == "line":
            segs.append(f"M {_num(attrs['x1'])} {_num(attrs['y1'])} L {_num(attrs['x2'])} {_num(attrs['y2'])}")
        elif kind in ("polyline", "polygon"):
            pts = [_num(p) for p in attrs["points"].replace(",", " ").split()]
            pairs = list(zip(pts[0::2], pts[1::2]))
            d = "M " + " L ".join(f"{x} {y}" for x, y in pairs)
            segs.append(d + (" Z" if kind == "polygon" else ""))
        elif kind == "rect":
            segs.append(_rect_to_path(_num(attrs["x"]), _num(attrs["y"]),
                                      _num(attrs["width"]), _num(attrs["height"]),
                                      _num(attrs.get("rx", 0))))
    path = " ".join(segs)
    _ICON_CACHE[name] = path
    return path


# --------------------------------------------------------------------------
# Document builder
# --------------------------------------------------------------------------

class Raw:
    """A literal node id, for a page the script did not create itself."""

    def __init__(self, v):
        self.v = v


class Doc:
    def __init__(self):
        self.cmds = []
        self.orient = {}

    def add(self, command, params):
        self.cmds.append({"command": command, "params": params})
        return len(self.cmds) - 1

    @staticmethod
    def ref(step):
        return {"$step": step}

    def dump(self, path):
        with open(path, "w") as fh:
            json.dump(self.cmds, fh, indent=1)


def _align(props):
    """flexbox names -> FigCraft's mainAlign / crossAlign."""
    if "alignItems" in props:
        props["crossAlign"] = props.pop("alignItems")
    if "justifyContent" in props:
        props["mainAlign"] = props.pop("justifyContent")
    return props


def frame(d, parent, name, w=None, h=None, x=None, y=None, **props):
    w = props.pop("width", w)
    h = props.pop("height", h)
    x = props.pop("x", x)
    y = props.pop("y", y)
    props = {k: v for k, v in props.items() if v is not None}
    _align(props)
    layout = props.pop("layout", "horizontal")
    if layout == "none":
        layout = None
    if layout:
        props["layout"] = layout
    # A child fills its parent's cross axis and hugs its parent's main axis —
    # the same default a designer gets in Figma. Written out rather than
    # inherited, because FigCraft's own default is a fixed 100x100 box.
    parent_orient = d.orient.get(parent) if isinstance(parent, int) else None
    if "sizingH" not in props:
        props["sizingH"] = ("fixed" if w is not None else
                            "fill" if parent_orient == "vertical" else "hug")
    if "sizingV" not in props:
        # Hug the height everywhere: a cross-axis fill inside a row would make
        # the row's height depend on a child whose height depends on the row.
        props["sizingV"] = "fixed" if h is not None else "hug"
    props.setdefault("fill", "#00000000")
    props.setdefault("clip", False)
    p = {"type": "frame", "name": name}
    if parent is not None:
        p["parent"] = (parent.v if isinstance(parent, Raw)
                       else parent if isinstance(parent, dict) else d.ref(parent))
    if w is not None:
        p["width"] = w
    if h is not None:
        p["height"] = h
    if x is not None:
        p["x"] = x
    if y is not None:
        p["y"] = y
    if props:
        p["props"] = props
    step = d.add("node.create", p)
    d.orient[step] = props.get("layout")
    return step


def row(d, parent, name="Row", **props):
    props.setdefault("layout", "horizontal")
    return frame(d, parent, name, **props)


def col(d, parent, name="Col", **props):
    props.setdefault("layout", "vertical")
    return frame(d, parent, name, **props)


def txt(d, parent, s, size=14, weight="Regular", color="#24324a", font=INTER,
        w=None, align="left", lh=None, caps=False, ls=None, h=None):
    props = {
        "fontFamily": font, "fontSize": size, "fill": color, "textAlign": align,
    }
    if weight and weight != "Regular":
        props["fontStyle"] = weight
    if w is not None:
        props["width"] = w
    if h is not None:
        props["height"] = h
        props["textAutoResize"] = "none"
    elif w is not None:
        props["textAutoResize"] = "height"
    if lh is not None:
        props["lineHeight"] = lh
    if caps:
        props["textCase"] = "upper"
    if ls is not None:
        props["letterSpacing"] = ls
    return d.add("node.create", {
        "type": "text", "text": s, "parent": d.ref(parent), "props": props,
    })


def ico(d, parent, name, size=16, color="#24324a", sw=2, box=None):
    """A lucide icon at `size` px, in a square slot, undistorted."""
    raw = lucide(name)
    x0, y0, x1, y1 = path_bbox(raw)
    k = size / 24.0
    w, h = (x1 - x0) * k, (y1 - y0) * k
    slot = frame(d, parent, f"icon-slot-{name}", w=size, h=size,
                 layout="horizontal", mainAlign="center", crossAlign="center")
    p = {
        "type": "vector", "name": f"icon-{name}",
        "path": fit_path(raw, w, h),
        "width": w, "height": h,
        "props": {
            "fill": "#00000000", "stroke": color, "strokeWeight": sw * k,
            "strokeCap": "round", "strokeJoin": "round",
        },
    }
    p["parent"] = d.ref(slot)
    if box:
        p["props"].update(box)
    return d.add("node.create", p)


def rect(d, parent, w, h, fill=None, radius=0, stroke=None, sw=1, name="Rect", **props):
    p = {"type": "frame", "name": name, "width": w, "height": h}
    if parent is not None:
        p["parent"] = (parent.v if isinstance(parent, Raw)
                       else parent if isinstance(parent, dict) else d.ref(parent))
    pr = {"layout": "horizontal"}
    if fill:
        pr["fill"] = fill
    if radius:
        pr["cornerRadius"] = radius
    if stroke:
        pr["stroke"] = stroke
        pr["strokeWeight"] = sw
        pr["strokeAlign"] = "inside"
    pr.update(props)
    p["props"] = pr
    return d.add("node.create", p)


def hairline(d, parent, w, color="#e2e8f0", vertical=False):
    if vertical:
        return rect(d, parent, 1, None, fill=color, name="Hairline")
    return rect(d, parent, w, 1, fill=color, name="Hairline")


def pill(d, parent, label, size=12, bg=None, fg="#24324a", border=None, px=10, py=5,
         icon=None, weight="Regular", font=INTER, radius=None):
    props = {
        "layout": "horizontal", "crossAlign": "center",
        "gap": 6, "paddingLeft": px, "paddingRight": px,
        "paddingTop": py, "paddingBottom": py,
        "cornerRadius": radius if radius is not None else 999,
        "crossAlign": "center",
    }
    if bg:
        props["fill"] = bg
    if border:
        props["stroke"] = border
        props["strokeWeight"] = 1
        props["strokeAlign"] = "inside"
    s = frame(d, parent, f"pill-{label}", **props)
    if icon:
        ico(d, s, icon, size=size + 2, color=fg)
    txt(d, s, label, size=size, weight=weight, color=fg, font=font)
    return s


def button(d, parent, label, kind="primary", icon=None, size=14, h=40, px=16, w=None):
    """primary = navy fill; outline = bordered; ghost = text only; danger = red."""
    if kind == "primary":
        bg, fg, border = "#0f1e54", "#ffffff", None
    elif kind == "dark-primary":
        bg, fg, border = "#2f4b9e", "#ffffff", None
    elif kind == "outline":
        bg, fg, border = "#ffffff", "#24324a", "#e2e8f0"
    elif kind == "ghost":
        bg, fg, border = None, "#4a5568", None
    elif kind == "danger":
        bg, fg, border = "#c2410c", "#ffffff", None
    else:
        bg, fg, border = None, "#24324a", None
    props = {
        "layout": "horizontal", "crossAlign": "center", "mainAlign": "center",
        "gap": 8, "paddingLeft": px, "paddingRight": px,
        "cornerRadius": 8,
    }
    if bg:
        props["fill"] = bg
    if border:
        props["stroke"] = border
        props["strokeWeight"] = 1
        props["strokeAlign"] = "inside"
    s = frame(d, parent, f"btn-{label}", w=w, h=h, **props)
    if icon:
        ico(d, s, icon, size=size + 2, color=fg)
    txt(d, s, label, size=size, weight="SemiBold", color=fg)
    return s


def card(d, parent, name, bg="#ffffff", border="#e2e8f0", radius=12, pad=20,
         w=None, h=None, **props):
    base = {"layout": "vertical", "padding": pad, "cornerRadius": radius, "gap": 12,
            "fill": bg}
    if border:
        base["stroke"] = border
        base["strokeWeight"] = 1
        base["strokeAlign"] = "inside"
    base.update(props)
    return frame(d, parent, name, w=w, h=h, **base)


def checkbox(d, parent, checked=False, color="#0f1e54", size=18):
    box = rect(d, parent, size, size, fill="#ffffff" if not checked else color,
               radius=4, stroke=color if not checked else None, sw=1.5, name="Checkbox")
    if checked:
        ico(d, box, "check", size=size - 6, color="#ffffff", sw=2.5)
    return box


def input_field(d, parent, placeholder, icon=None, w=None, h=40, bg="#ffffff",
                border="#e2e8f0", fg="#64748b", size=14):
    props = {
        "layout": "horizontal", "crossAlign": "center", "gap": 8,
        "paddingLeft": 12, "paddingRight": 12, "height": h,
        "cornerRadius": 8, "fill": bg,
        "stroke": border, "strokeWeight": 1, "strokeAlign": "inside",
        "crossAlign": "center",
    }
    s = frame(d, parent, "input", w=w, h=h, **props)
    if icon:
        ico(d, s, icon, size=size + 2, color="#64748b")
    txt(d, s, placeholder, size=size, color=fg)
    return s


def select_field(d, parent, value, icon=None, w=None, h=40, bg="#ffffff",
                 border="#e2e8f0", fg="#24324a", size=14):
    props = {
        "layout": "horizontal", "crossAlign": "center", "gap": 8,
        "paddingLeft": 12, "paddingRight": 12, "height": h,
        "cornerRadius": 8, "fill": bg,
        "stroke": border, "strokeWeight": 1, "strokeAlign": "inside",
        "crossAlign": "center",
    }
    s = frame(d, parent, "select", w=w, h=h, **props)
    if icon:
        ico(d, s, icon, size=size + 2, color="#64748b")
    txt(d, s, value, size=size, color=fg, weight="Regular")
    ico(d, s, "chevron-down", size=size + 2, color="#64748b")
    return s


def field_label(d, parent, label, hint=None, size=13):
    g = col(d, parent, f"field-{label}", gap=6)
    txt(d, g, label, size=size, weight="SemiBold", color="#24324a")
    if hint:
        txt(d, g, hint, size=12, color="#64748b")
    return g


def stat_card(d, parent, label, value, sub=None, accent="#0f1e54", w=None, bg="#ffffff",
              border="#e2e8f0", value_size=32):
    props = {
        "layout": "vertical", "gap": 6, "padding": 20, "cornerRadius": 12,
        "fill": bg, "crossAlign": "min",
    }
    if border:
        props["stroke"] = border
        props["strokeWeight"] = 1
        props["strokeAlign"] = "inside"
    s = frame(d, parent, f"stat-{label}", w=w, **props)
    txt(d, s, label, size=11, weight="SemiBold", color="#64748b", ls=0.8, caps=True)
    txt(d, s, value, size=value_size, weight="Bold", color=accent, font=POPPINS)
    if sub:
        txt(d, s, sub, size=12, color="#64748b")
    return s


def table(d, parent, name, headers, widths, rows, bg="#ffffff",
          header_bg="#f8fafc", border="#e2e8f0", text="#24324a", muted="#4a5568",
          row_h=48, checkbox_col=False, header_size=13, cell_size=14, name_col=0,
          name_weight="Regular", total=None, strong="#0f1e54"):
    """A grid table built from nested rows (auto-layout beats absolute here)."""
    if total:
        widths = list(widths)
        widths[0] = widths[0] + (total - sum(widths))
    wrap = frame(d, parent, name, layout="vertical", gap=0, fill=bg,
                 cornerRadius=12, clip=True,
                 stroke=border, strokeWeight=1, strokeAlign="inside")
    hdr = row(d, wrap, "thead", gap=0, fill=header_bg, height=44,
              paddingLeft=16, paddingRight=16, crossAlign="center")
    last = len(widths) - 1
    for i, (htxt, wdt) in enumerate(zip(headers, widths)):
        cell = row(d, hdr, f"th-{htxt}", gap=6, width=wdt, crossAlign="center",
                   paddingLeft=0, paddingRight=12)
        if i == 0 and checkbox_col:
            checkbox(d, cell, False, color="#cbd5e1", size=16)
        txt(d, cell, htxt, size=header_size, weight="SemiBold", color=text)
    for r, rowdata in enumerate(rows):
        rrow = row(d, wrap, f"tr-{r}", gap=0, height=row_h,
                   paddingLeft=16, paddingRight=16, crossAlign="center",
                   fill=bg, stroke=border, strokeWeight=1,
                   strokeSides=[False, False, True, False], strokeAlign="inside")
        for i, (cell_data, wdt) in enumerate(zip(rowdata, widths)):
            cell = row(d, rrow, f"td-{i}", gap=8, width=wdt, crossAlign="center",
                       paddingLeft=0, paddingRight=12)
            if i == 0 and checkbox_col:
                checkbox(d, cell, bool(cell_data), color="#0f1e54", size=16)
                continue
            if isinstance(cell_data, tuple) and cell_data[0] == "chip":
                _, label, tone = cell_data
                pill(d, cell, label, size=12,
                     bg={"soft": "#f2f2f2", "success": "#e8f5ec", "warning": "#fdf2e6",
                         "danger": "#fdeee7", "info": "#e8eefc", "navy": "#eef1f8"}.get(tone, "#f2f2f2"),
                     fg={"soft": "#3b3f4b", "success": "#15803d", "warning": "#f97f29",
                         "danger": "#c2410c", "info": "#1e40af", "navy": strong}.get(tone, "#3b3f4b"),
                     px=8, py=3)
            elif isinstance(cell_data, tuple) and cell_data[0] == "txt":
                _, label, tone = cell_data
                txt(d, cell, label, size=cell_size,
                    weight=name_weight if i == name_col else "Regular",
                    color={"muted": muted, "warn": "#f97f29", "danger": "#c2410c",
                           "success": "#15803d", "navy": strong}.get(tone, text))
            else:
                txt(d, cell, str(cell_data), size=cell_size,
                    weight=name_weight if i == name_col else "Regular", color=text,
                    align="right" if i == last else "left")
    return wrap


def divider(d, parent, color="#e2e8f0"):
    return rect(d, parent, None, 1, fill=color, name="Divider", sizingH="fill")


def note(d, parent, s, size=12, color="#64748b", icon=None, w=None):
    g = row(d, parent, "note", gap=8, crossAlign="center", width=w)
    if icon:
        ico(d, g, icon, size=size + 2, color=color)
    txt(d, g, s, size=size, color=color, w=None)
    return g


# --------------------------------------------------------------------------
# Shared chrome — lifted from the real components
# --------------------------------------------------------------------------

def setp(d, step, **props):
    """Set properties on an existing layer. A None value removes the property."""
    _align(props)
    params = d.cmds[step]["params"]
    tgt = params.setdefault("props", {})
    for key, value in props.items():
        if value is None:
            tgt.pop(key, None)
            params.pop(key, None)
        else:
            tgt[key] = value
    return step


def app_header(d, parent, t, active="campaigner", w=1440):
    """The navy app bar. Shape and spacing copied from components/header.tsx.

    The nav pill bar is centred on the page: the logo and account sides get the
    same fixed width, so the space-between gaps are equal and the bar's centre is
    the page centre rather than the midpoint of two unequal sides.
    """
    side_w = 320
    bar = frame(d, parent, "app-header", layout="horizontal", width=w, height=88,
                fill=t["header"], paddingLeft=24, paddingRight=24, paddingTop=16,
                paddingBottom=16, gap=24, mainAlign="spaceBetween",
                crossAlign="center")
    left = frame(d, bar, "header-left", width=side_w, layout="horizontal",
                 crossAlign="center")
    logo = frame(d, left, "logo", width=160, height=56, fill="#ffffff", cornerRadius=12,
                 layout="horizontal", alignItems="center", justifyContent="center")
    d.add("image.place", {"path": os.path.join(REFS_DIR, "folk-logo.jpg"),
                          "parent": d.ref(logo), "x": 56, "y": 4,
                          "width": 48, "height": 48, "mode": "fit"})

    nav = frame(d, bar, "nav", layout="horizontal", gap=4, fill=t["headerNavBg"],
                cornerRadius=999, padding=4, alignItems="center")
    items = [("Contact", "user-round-plus"), ("Sessions", "calendar-days"),
             ("Invite", "send"), ("Manage", "settings-2"),
             ("Campaign", "megaphone")]
    for label, icon in items:
        on = label == active
        p = {
            "layout": "horizontal", "crossAlign": "center", "gap": 8,
            "paddingLeft": 16, "paddingRight": 16, "height": 40,
            "cornerRadius": 999, "crossAlign": "center",
        }
        if on:
            p["fill"] = "#ffffff" if t is LIGHT else "#292a30"
        it = frame(d, nav, f"nav-{label}", **p)
        fg = "#0f1e54" if (on and t is LIGHT) else ("#ffffff" if on else t["headerNavText"])
        ico(d, it, icon, size=16, color=fg)
        txt(d, it, label, size=14, weight="SemiBold", color=fg)

    right = frame(d, bar, "header-right", width=side_w, layout="horizontal",
                  mainAlign="max", crossAlign="center", gap=24)
    ico(d, right, "moon", size=18, color=t["headerText"], box={"stroke": t["headerText"]})
    txt(d, right, "Kavitha Raman (Admin)", size=12, color=t["headerNavText"])
    lg = frame(d, right, "logout", layout="horizontal", alignItems="center", gap=8,
               height=40, paddingLeft=12, paddingRight=16, cornerRadius=999,
               fill=t["headerActionBg"], crossAlign="center")
    ico(d, lg, "log-out", size=16, color=t["headerText"])
    txt(d, lg, "Logout", size=14, weight="SemiBold", color=t["headerText"])
    return bar


def mobile_appbar(d, parent, t, w=390):
    """The phone's app bar — logo box left, two circular controls right."""
    bar = frame(d, parent, "app-bar", layout="horizontal", width=w, height=64,
                fill=t["header"], paddingLeft=16, paddingRight=16, gap=12,
                crossAlign="center")
    logo = frame(d, bar, "logo", width=112, height=40, fill="#ffffff", cornerRadius=12,
                 layout="horizontal", alignItems="center", justifyContent="center")
    d.add("image.place", {"path": os.path.join(REFS_DIR, "folk-logo.jpg"),
                          "parent": d.ref(logo), "x": 36, "y": 0,
                          "width": 40, "height": 40, "mode": "fit"})
    spacer = frame(d, bar, "spacer", layout="horizontal", sizingH="fill")
    for ic in ("moon", "log-out"):
        c = frame(d, bar, f"circle-{ic}", width=40, height=40, cornerRadius=999,
                  fill=t["headerActionBg"], layout="horizontal", alignItems="center",
                  justifyContent="center")
        ico(d, c, ic, size=18, color=t["headerText"])
    return bar


def bottom_nav(d, parent, t, active="Campaign", w=390):
    """components/header.tsx's fixed phone nav — always white, even in .dark."""
    nav = frame(d, parent, "bottom-nav", layout="vertical", width=w,
                fill=t["bottomNav"], stroke="#0000001a", strokeWeight=1,
                strokeAlign="inside", paddingLeft=8, paddingRight=8,
                paddingTop=8, paddingBottom=8, gap=4)
    inner = row(d, nav, "items", gap=4, alignItems="center")
    items = [("Contact", "user-round-plus"), ("Sessions", "calendar-days"),
             ("Invite", "send"), ("Manage", "settings-2"),
             ("Campaign", "megaphone")]
    for label, icon in items:
        on = label == active
        p = {
            "layout": "vertical", "crossAlign": "center", "mainAlign": "center",
            "gap": 4, "height": 56, "sizingH": "fill", "cornerRadius": 16,
        }
        if on:
            p["fill"] = "#0f1e54"
        it = frame(d, inner, f"nav-{label}", **p)
        fg = "#ffffff" if on else "#24324a70"
        ico(d, it, icon, size=20, color=fg)
        txt(d, it, label, size=11, weight="SemiBold", color=fg)
    return nav


def dialer_appbar(d, parent, t, campaign="Weekend Camp", progress="3 of 12", w=390):
    """The dialer's own bar — no logo, no logout: the caller is mid-conversation."""
    bar = frame(d, parent, "dialer-bar", layout="horizontal", width=w, height=60,
                fill=t["header"], paddingLeft=16, paddingRight=12, gap=12,
                crossAlign="center")
    left = col(d, bar, "campaign", gap=1)
    txt(d, left, campaign, size=15, weight="SemiBold", color=t["headerText"], font=POPPINS)
    txt(d, left, progress, size=12, color=t["headerNavText"])
    spacer = frame(d, bar, "spacer", layout="horizontal", sizingH="fill")
    q = frame(d, bar, "queue-btn", layout="horizontal", alignItems="center", gap=6,
              height=36, paddingLeft=10, paddingRight=12, cornerRadius=999,
              fill=t["headerActionBg"], crossAlign="center")
    ico(d, q, "list", size=16, color=t["headerText"])
    txt(d, q, "Queue", size=13, weight="SemiBold", color=t["headerText"])
    return bar


def page_title(d, parent, t, title, subtitle=None, action=None, action_icon="plus",
               filter_value=None, filter_w=170):
    g = frame(d, parent, "page-title", layout="horizontal", sizingH="fill",
              crossAlign="max", gap=16)
    left = col(d, g, "titles", gap=2)
    txt(d, left, title, size=22, weight="SemiBold", color=t["text"], font=POPPINS)
    if subtitle:
        txt(d, left, subtitle, size=12, color=t["muted"])
    spacer = frame(d, g, "spacer", layout="horizontal", sizingH="fill")
    if filter_value:
        select_field(d, g, filter_value, icon="filter", w=filter_w, h=36,
                     bg=t["surface"], border=t["border"], fg=t["muted"], size=13)
    if action:
        b = button(d, g, action, "primary", icon=action_icon, h=40, px=16)
        setp(d, b, fill=t["primary"])
    return g


def tab_strip(d, parent, t, items, active_index=0, w=None):
    """components/manage/manage-portal.tsx's hairline underline strip.

    The strip spans the content width and carries the hairline rule, so it reads
    as the page's view switcher rather than a floating pill group. The tabs stay
    left-aligned under the page title, exactly as they do in Manage.
    """
    strip = row(d, parent, "tab-strip", gap=32, crossAlign="max",
                width=w, sizingH="fill")
    for i, label in enumerate(items):
        on = i == active_index
        tab = col(d, strip, f"tab-{label}", gap=10, crossAlign="center")
        txt(d, tab, label, size=13, weight="SemiBold" if on else "Regular",
            color=t["tabActive"] if on else t["tabInactive"])
        rect(d, tab, None, 2, name="underline", sizingH="fill",
             fill=t["tabUnderline"] if on else "#00000000")
    setp(d, strip, stroke=t["tabBorder"], strokeWeight=1, strokeAlign="inside",
         strokeSides=[False, False, True, False])
    return strip


def panel_header(d, parent, t, title, subtitle=None):
    """The navy title band on the dashboard's chart cards."""
    band = frame(d, parent, "panel-header", layout="vertical", gap=2,
                 fill=t["primary"], paddingLeft=20, paddingRight=20,
                 paddingTop=16, paddingBottom=16, cornerRadius=[12, 12, 0, 0])
    txt(d, band, title, size=20, weight="SemiBold", color="#ffffff", font=POPPINS)
    if subtitle:
        txt(d, band, subtitle, size=15, color="#ffffffcc")
    return band


def save_receipt(d, parent, t, state="saved", stamp="12:04"):
    """CAP-7's persistent receipt — never a toast."""
    tones = {
        "saved": (t["successSoft"], t["success"], "circle-check", f"Saved {stamp}"),
        "saving": (t["surface2"], t["muted"], "refresh-cw", "Saving…"),
        "queued": (t["warningSoft"], t["warning"], "wifi-off", "Queued — will send"),
        "failed": (t["dangerSoft"], t["danger"], "triangle-alert", "Save failed — session paused"),
    }
    bg, fg, icon, label = tones[state]
    r = frame(d, parent, f"receipt-{state}", layout="horizontal", alignItems="center",
              gap=6, paddingLeft=10, paddingRight=12, paddingTop=6, paddingBottom=6,
              cornerRadius=999, fill=bg, crossAlign="center")
    ico(d, r, icon, size=14, color=fg)
    txt(d, r, label, size=12, weight="SemiBold", color=fg)
    return r


# --------------------------------------------------------------------------
# Desktop screens — 1440x900
# --------------------------------------------------------------------------

def desktop_frame(d, page, name, t, x, y):
    return frame(d, None, name, width=1440, height=900, x=x, y=y, fill=t["bg"],
                 layout="vertical", gap=0, name_note=name)


def d_campaigns(d, page, t, x, y, name):
    f = frame(d, page, name, width=1440, height=900, x=x, y=y, fill=t["bg"],
              layout="vertical", gap=0, clip=True)
    app_header(d, f, t, "Campaign")
    main = col(d, f, "main", gap=20, padding=24, sizingH="fill", sizingV="fill")
    page_title(d, main, t, "Campaign", "12 campaigns · folk programme",
               action="New campaign", filter_value="All campaigns")

    sub = row(d, main, "sub-nav", gap=0, crossAlign="center")
    tab_strip(d, sub, t, ["Campaigns", "Callers", "Reports"], 0)

    stats = row(d, main, "stats", gap=16, crossAlign="min")
    stat_card(d, stats, "Assigned", "200", "Across 3 active campaigns", t["strong"], w=265.6,
              bg=t["surface"], border=t["border"])
    stat_card(d, stats, "Attempted", "148", "74% of assigned", t["strong"], w=265.6,
              bg=t["surface"], border=t["border"])
    stat_card(d, stats, "Reached", "91", "61% of attempted", t["strong"], w=265.6,
              bg=t["surface"], border=t["border"])
    stat_card(d, stats, "Confirmed", "59", "65% of reached", t["success"], w=265.6,
              bg=t["surface"], border=t["border"])
    sc = stat_card(d, stats, "Never attempted", "52", "26% of assigned — nudge callers",
                   t["warning"], w=265.6, bg=t["surface"], border=t["border"])
    setp(d, sc, stroke=t["warning"], strokeWeight=1, strokeAlign="inside")

    tbl = table(
        d, main, "campaigns",
        ["Campaign", "End Date", "Status", "Assigned", "Reached", "Confirmed", "Never attempted"],
        [300, 170, 150, 110, 110, 130, 180],
        [
            ["Weekend Camp 2026", ("txt", "12 Aug 2026", "muted"), ("chip", "ACTIVE", "success"),
             ("txt", "120", "navy"), ("txt", "68", "muted"), ("txt", "44", "navy"),
             ("txt", "17", "warn")],
            ["Bhakti Basics — Batch 4", ("txt", "19 Aug 2026", "muted"), ("chip", "ACTIVE", "success"),
             ("txt", "80", "navy"), ("txt", "23", "muted"), ("txt", "15", "navy"),
             ("txt", "9", "warn")],
            ["Monsoon Outreach", ("txt", "02 Sep 2026", "muted"), ("chip", "DRAFT", "soft"),
             ("txt", "0", "muted"), ("txt", "0", "muted"), ("txt", "0", "muted"),
             ("txt", "0", "muted")],
            ["Diwali Family Meet", ("txt", "28 Oct 2026", "muted"), ("chip", "COMPLETED", "info"),
             ("txt", "200", "navy"), ("txt", "141", "muted"), ("txt", "96", "navy"),
             ("txt", "12", "warn")],
            ["New Year Retreat", ("txt", "04 Jan 2027", "muted"), ("chip", "CANCELLED", "danger"),
             ("txt", "60", "muted"), ("txt", "0", "muted"), ("txt", "0", "muted"),
             ("txt", "60", "warn")],
        ],
        header_bg=t["surface2"], bg=t["surface"], border=t["border"], text=t["text"],
        muted=t["muted"], total=1360, strong=t["strong"])
    setp(d, tbl, sizingH="fill")
    foot = row(d, main, "foot", gap=12, crossAlign="center")
    txt(d, foot, "5 campaigns · 1 draft · 1 cancelled", size=12, color=t["muted"])
    return f


def d_new_campaign(d, page, t, x, y, name):
    f = frame(d, page, name, width=1440, height=900, x=x, y=y, fill=t["bg"],
              layout="vertical", gap=0, clip=True)
    app_header(d, f, t, "Campaign")
    main = col(d, f, "main", gap=20, padding=24, sizingH="fill", sizingV="fill")
    head = row(d, main, "head", gap=16, crossAlign="center")
    back = frame(d, head, "back", width=40, height=40, cornerRadius=999, fill=t["surface"],
                 stroke=t["border"], strokeWeight=1, strokeAlign="inside",
                 layout="horizontal", alignItems="center", justifyContent="center")
    ico(d, back, "arrow-left", size=18, color=t["text"])
    titles = col(d, head, "titles", gap=2)
    txt(d, titles, "New campaign", size=22, weight="SemiBold", color=t["text"], font=POPPINS)
    txt(d, titles, "Name it, choose when it ends, and define the call-outcome survey.",
        size=12, color=t["muted"])
    spacer = frame(d, head, "spacer", layout="horizontal", sizingH="fill")
    next_btn = button(d, head, "Next", "primary", icon="arrow-right", h=40)
    setp(d, next_btn, fill=t["primary"])

    body = row(d, main, "body", gap=20, crossAlign="min", sizingH="fill")

    left = col(d, body, "left", gap=20, width=520)
    c1 = card(d, left, "basics", bg=t["surface"], border=t["border"])
    panel_header(d, c1, t, "Campaign details")
    fields = col(d, c1, "fields", gap=16)
    fl = field_label(d, fields, "Campaign name")
    input_field(d, fl, "Weekend Camp 2026", w=468, size=14)
    fl2 = field_label(d, fields, "Description")
    rect(d, fl2, 468, 72, fill=t["field"], radius=8, stroke=t["border"], sw=1,
         name="textarea")
    fl3 = field_label(d, fields, "Campaign end date")
    input_field(d, fl3, "12 Aug 2026", icon="calendar-days", w=468)

    right = col(d, body, "right", gap=16, sizingH="fill")
    c3 = card(d, right, "survey", bg=t["surface"], border=t["border"])
    panel_header(d, c3, t, "Call-outcome survey",
                 "Every caller records this status, for this campaign only.")
    sb = col(d, c3, "questions", gap=12)
    q1 = card(d, sb, "q1", bg=t["surface2"], border=t["border"], pad=16, radius=8)
    q1h = row(d, q1, "q1h", gap=12, crossAlign="center")
    txt(d, q1h, "1", size=13, weight="Bold", color=t["muted"])
    txt(d, q1h, "Status?", size=14, weight="SemiBold", color=t["text"], w=520)
    spacer = frame(d, q1h, "spacer", layout="horizontal", sizingH="fill")
    pill(d, q1h, "RADIO", size=11, bg="#e2e8f0", fg="#3b3f4b", px=8, py=3)
    pill(d, q1h, "Required", size=11, bg="#e8f5ec", fg="#15803d", px=8, py=3)
    q1o = row(d, q1, "options", gap=8, crossGap=8, crossAlign="center", wrap=True)
    for o in ("Confirmed", "May come", "Will come next class", "Will come next week",
              "Visiting home town", "Call me back", "Call did not connect",
              "Health is not good", "Switched off", "Out of station",
              "Busy cannot come", "Wrong number", "Not interested — do not call again"):
        pill(d, q1o, o, size=12, bg="#ffffff", fg=t["text"], border=t["border"], px=10, py=5)

    add = button(d, sb, "Add question", "outline", icon="plus", h=40)
    setp(d, add, sizingH="fill")
    return f


def toggle(d, parent, t, label, on=True, w=260):
    """A switch: the manage portal's own pill-switch shape."""
    g = row(d, parent, f"switch-{label}", gap=12, crossAlign="center", width=w)
    txt(d, g, label, size=13, weight="SemiBold", color=t["text"], w=w - 64)
    track = frame(d, g, "track", width=44, height=24, cornerRadius=999,
                  fill=t["primary"] if on else t["border"], layout="horizontal",
                  alignItems="center", paddingLeft=3 if on else 3,
                  paddingRight=3 if not on else 3)
    knob = frame(d, track, "knob", width=18, height=18, cornerRadius=999, fill="#ffffff",
                 layout="horizontal")
    if on:
        setp(d, knob, alignItems="center", justifyContent="center")
    return g


ASSIGN_CONTACTS = [
    # selected, name, phone, location, assigned to, notes
    (True, "Kavya Krishnaswamy", "8100000066", "Mylapore", "Anand Narayanan",
     "Prefers after 6pm"),
    (True, "Shanti Balaji", "8100000023", "T. Nagar", "Divya Parthasarathy", "—"),
    (True, "Dwaraka Dasa", "4857382048", "Adyar", "Anand Narayanan", "Tamil only"),
    (True, "Mohanraj Anand", "8100000137", "T. Nagar", "Suresh Kannan",
     "Called once — busy"),
    (True, "Saranya Subramanian", "8100000159", "Perungalathur", "Suresh Kannan", "—"),
    (False, "Venkataraman Ramesh", "8100000175", "Adyar", "—", "New contact"),
    (False, "Sathishkumar Palaniappan", "8100000192", "T. Nagar", "—", "—"),
]

# The weighted panel: 120 assignable contacts over weights 5 / 3 / 1 / 1.
ASSIGN_CALLERS = [
    ("AN", "Anand Narayanan", 5, 60),
    ("DP", "Divya Parthasarathy", 3, 36),
    ("SK", "Suresh Kannan", 1, 12),
    ("MR", "Meena Rajan", 1, 12),
]


def assign_stepper(d, parent, t, weight):
    """[- 32][number 34][+ 32] in a 100x32 control."""
    box = frame(d, parent, "stepper", w=100, h=32, layout="horizontal", gap=0,
                crossAlign="center", fill=t["surface"], stroke=t["border"],
                strokeWeight=1, strokeAlign="inside", cornerRadius=8, clip=True)
    minus = frame(d, box, "btn-minus", w=32, h=32, layout="horizontal",
                  mainAlign="center", crossAlign="center")
    txt(d, minus, "−", size=15, weight="Medium",
        color=t["text"] if weight > 1 else t["faint"], w=32, align="center")
    rect(d, box, 1, 32, fill=t["border"])
    field = frame(d, box, "weight-field", w=34, h=32, layout="horizontal",
                  mainAlign="center", crossAlign="center")
    txt(d, field, str(weight), size=14, weight="Medium", color=t["text"],
        w=34, align="center")
    rect(d, box, 1, 32, fill=t["border"])
    plus = frame(d, box, "btn-plus", w=32, h=32, layout="horizontal",
                 mainAlign="center", crossAlign="center")
    txt(d, plus, "+", size=15, weight="Medium", color=t["text"], w=32,
        align="center")
    return box


def assign_caller_row(d, parent, t, initials, name, weight, count):
    """One 48px caller row: avatar + name | stepper | count | remove."""
    row = frame(d, parent, f"row-{initials.lower()}", h=48, layout="horizontal",
                gap=0, crossAlign="center")
    avatar = frame(d, row, "avatar", w=28, h=28, layout="horizontal",
                   mainAlign="center", crossAlign="center", fill=t["primary"],
                   cornerRadius=999)
    txt(d, avatar, initials, size=10, weight="SemiBold", color="#ffffff")
    frame(d, row, "spacer-name", w=10, h=1)
    txt(d, row, name, size=14, color=t["text"], w=146)
    assign_stepper(d, row, t, weight)
    frame(d, row, "spacer-count", w=12, h=1)
    txt(d, row, str(count), size=16, weight="SemiBold", color=t["text"],
        w=44, align="right")
    frame(d, row, "spacer-remove", w=10, h=1)
    remove = frame(d, row, "remove", w=16, h=16, layout="horizontal",
                   mainAlign="center", crossAlign="center")
    ico(d, remove, "x", size=10, color=t["muted"], sw=1.6)
    return row


def assign_caller_list(d, parent, t, callers):
    """48px per caller, a hairline between rows."""
    lst = frame(d, parent, "caller-list", layout="vertical", gap=0)
    for i, (initials, name, weight, count) in enumerate(callers):
        assign_caller_row(d, lst, t, initials, name, weight, count)
        if i < len(callers) - 1:
            rect(d, lst, 366, 1, fill=t["border"])
    return lst


def assign_panel(d, parent, t, callers, assigned, total=120, show_reset=True,
                 expand_view=True):
    """The weighted 'Assign to' card."""
    p = card(d, parent, "panel", bg=t["surface"], border=t["border"], pad=20,
             radius=12, gap=16)
    txt(d, p, "Assign to", size=16, weight="SemiBold", color=t["text"], font=POPPINS)

    field = frame(d, p, "field-Callers", layout="vertical", gap=12)
    head = frame(d, field, "field-head", layout="vertical", gap=4)
    txt(d, head, "Callers", size=14, weight="Medium", color=t["text"], w=100)
    txt(d, head, "Higher weight gets more contacts. Equal weights split evenly.",
        size=12, color=t["muted"], w=366)
    col_head = frame(d, field, "col-head", w=366, h=15, layout="horizontal",
                     gap=0, crossAlign="center")
    txt(d, col_head, "Caller", size=12, color=t["muted"], w=184)
    txt(d, col_head, "Weight", size=12, color=t["muted"], w=100, align="center")
    txt(d, col_head, "Contacts", size=12, color=t["muted"], w=66, align="right")
    assign_caller_list(d, field, t, callers)
    actions = frame(d, field, "field-actions", w=366, h=24, layout="horizontal",
                    mainAlign="spaceBetween", crossAlign="center")
    add = frame(d, actions, "add-caller", layout="horizontal", gap=6,
                crossAlign="center")
    ico(d, add, "plus", size=14, color=t["primary"], sw=1.5)
    txt(d, add, "Add caller", size=14, weight="Medium", color=t["primary"], w=90)
    if show_reset:
        txt(d, actions, "Reset to equal", size=13, color=t["muted"], w=100,
            align="right")

    warn = frame(d, p, "warning", layout="vertical", gap=8)
    line = frame(d, warn, "warning-line", layout="horizontal", gap=8,
                 crossAlign="min")
    ico(d, line, "triangle-alert", size=14, color=t["warning"], sw=1.4)
    copy = frame(d, line, "warning-copy", layout="vertical", gap=0)
    txt(d, copy, "5 selected contacts are already assigned and will be",
        size=13, color=t["warning"], w=340)
    line2 = frame(d, copy, "warning-line-2", layout="horizontal", gap=8,
                  crossAlign="center")
    txt(d, line2, "skipped.", size=13, color=t["warning"], w=60)
    txt(d, line2, "View", size=13, weight="Medium", color=t["primary"], w=40)
    if expand_view:
        lst = frame(d, warn, "warning-list", layout="vertical", gap=6,
                    paddingLeft=22)
        for contact, caller in assigned:
            item = frame(d, lst, "assigned", layout="horizontal", gap=8,
                         crossAlign="center")
            txt(d, item, contact, size=12, color=t["text"], w=150)
            txt(d, item, "→ " + caller, size=12, color=t["muted"], w=170)
        txt(d, lst, "Reassign them from the Campaign page.", size=12,
            color=t["muted"], w=344)

    btn = button(d, p, f"Assign {total} contacts", "primary", h=44, size=15)
    setp(d, btn, sizingH="fill")
    return p


def d_assign(d, page, t, x, y, name):
    f = frame(d, page, name, width=1440, height=900, x=x, y=y, fill=t["bg"],
              layout="vertical", gap=0, clip=True)
    app_header(d, f, t, "Campaign")
    main = col(d, f, "main", gap=20, padding=24, sizingH="fill", sizingV="fill")
    page_title(d, main, t, "Assign contacts")

    body = row(d, main, "body", gap=20, crossAlign="min", sizingH="fill")

    left = col(d, body, "left", gap=12, width=944)
    grid = card(d, left, "grid", bg=t["surface"], border=t["border"], pad=0, radius=12)
    toolbar = row(d, grid, "toolbar", gap=10, crossAlign="center", padding=16)
    input_field(d, toolbar, "Search every column", icon="search", w=280, h=36,
                 bg=t["surface"], border=t["border"])
    button(d, toolbar, "Filter", "outline", icon="filter", h=36, size=13, px=12)
    button(d, toolbar, "Sort", "outline", icon="arrow-up-down", h=36, size=13, px=12)
    pill(d, toolbar, "5 hidden fields", size=13, bg=t["warningSoft"], fg=t["warning"],
         icon="eye-off", px=10, py=6)
    select_field(d, toolbar, "Default rows", w=150, h=36, bg=t["surface"],
                 border=t["border"], fg=t["text"], size=13)

    rows = []
    for selected, contact, phone, location, assigned, notes in ASSIGN_CONTACTS:
        rows.append([
            selected,
            contact,
            phone,
            ("chip", location, "soft"),
            ("txt", assigned, "muted" if assigned == "—" else "navy"),
            notes,
        ])

    ct = table(
        d, grid, "contacts",
        ["", "Name", "Phone", "Location", "Assigned To", "Notes"],
        [40, 250, 150, 160, 160, 152],
        rows,
        header_bg=t["surface2"], bg=t["surface"], border=t["border"], text=t["text"],
        muted=t["muted"], row_h=44, checkbox_col=True, cell_size=13,
        strong=t["strong"])
    setp(d, ct, sizingH="fill")
    gfoot = row(d, grid, "grid-foot", gap=12, crossAlign="center", padding=12)
    txt(d, gfoot, "125 of 272 selected", size=13, weight="SemiBold", color=t["text"])
    txt(d, gfoot, "·  12 hidden on other pages", size=13, color=t["warning"])
    spacer = frame(d, gfoot, "spacer", layout="horizontal", sizingH="fill")
    txt(d, gfoot, "Select all 272 matching", size=13, color=t["info"])
    txt(d, gfoot, "Clear all (125)", size=13, color=t["muted"])

    right = col(d, body, "right", gap=16, width=408)
    assigned_today = [(contact, who) for selected, contact, phone, location, who, notes
                      in ASSIGN_CONTACTS if who != "—"]
    assign_panel(d, right, t, ASSIGN_CALLERS, assigned_today, total=120,
                 show_reset=True, expand_view=True)
    return f


def d_callers(d, page, t, x, y, name):
    f = frame(d, page, name, width=1440, height=900, x=x, y=y, fill=t["bg"],
              layout="vertical", gap=0, clip=True)
    app_header(d, f, t, "Campaign")
    main = col(d, f, "main", gap=20, padding=24, sizingH="fill", sizingV="fill")
    head = row(d, main, "head", gap=16, crossAlign="center")
    titles = col(d, head, "titles", gap=2)
    txt(d, titles, "Callers", size=22, weight="SemiBold", color=t["text"], font=POPPINS)
    txt(d, titles, "3 active · 1 inactive · folk programme", size=12, color=t["muted"])
    spacer = frame(d, head, "spacer", layout="horizontal", sizingH="fill")
    button(d, head, "Import roster", "outline", icon="download", h=40)
    invite_btn = button(d, head, "Invite caller", "primary", icon="user-round-plus", h=40)
    setp(d, invite_btn, fill=t["primary"])

    ct = table(
        d, main, "callers",
        ["Caller", "Contact", "Campaigns", "Calls made", "Reached", "Status", ""],
        [280, 220, 170, 150, 140, 200, 60],
        [
            ["Divya Parthasarathy", ("txt", "divya.parthasarathy@…", "muted"),
             ("chip", "Weekend Camp", "navy"), ("txt", "68", "navy"), ("txt", "41", "muted"),
             ("chip", "ACTIVE", "success"), "⋯"],
            ["Anand Narayanan", ("txt", "anand.narayanan@…", "muted"),
             ("chip", "Weekend Camp", "navy"), ("txt", "52", "navy"), ("txt", "27", "muted"),
             ("chip", "ACTIVE", "success"), "⋯"],
            ["Suresh Kannan", ("txt", "suresh.kannan@…", "muted"),
             ("chip", "Bhakti Basics", "navy"), ("txt", "28", "navy"), ("txt", "23", "muted"),
             ("chip", "ACTIVE", "success"), "⋯"],
            ["Meenakshi Ramesh", ("txt", "meenakshi.ramesh@…", "muted"),
             ("chip", "Diwali Family Meet", "navy"), ("txt", "0", "muted"), ("txt", "0", "muted"),
             ("chip", "INACTIVE", "danger"), "⋯"],
        ],
        header_bg=t["surface2"], bg=t["surface"], border=t["border"], text=t["text"],
        muted=t["muted"], row_h=56, total=1360, strong=t["strong"])
    setp(d, ct, sizingH="fill")

    notes = row(d, main, "notes", gap=16, crossAlign="min")
    n1 = card(d, notes, "n1", bg=t["surface"], border=t["border"], pad=16, radius=10,
              gap=6, w=686)
    nh = row(d, n1, "nh", gap=8, crossAlign="center")
    ico(d, nh, "user-round-plus", size=16, color=t["primary"])
    txt(d, nh, "All roles can be callers", size=13, weight="SemiBold",
        color=t["text"], w=380)
    txt(d, n1, "Volunteers, Assistants, Preachers and Admins can be callers. Assistants "
               "and Volunteers who are assigned to the preacher can be callers.",
        size=12, color=t["muted"], w=400)
    n2 = card(d, notes, "n2", bg=t["warningSoft"], border=t["warning"], pad=16, radius=10,
              gap=6, w=686)
    nh2 = row(d, n2, "nh2", gap=8, crossAlign="center")
    ico(d, nh2, "triangle-alert", size=16, color=t["warning"])
    txt(d, nh2, "Inactive means inactive", size=13, weight="SemiBold", color=t["warning"], w=380)
    txt(d, n2, "A deactivated caller disappears from assignment pickers AND is refused at "
               "the disposition write. Their history is retained, but they cannot record "
               "a new outcome.", size=12, color=t["muted"], w=400)
    return f


def bar_row(d, parent, t, label, count, pct, color, track=380, w=440):
    r = row(d, parent, f"bar-{label}", gap=12, crossAlign="center", width=w)
    txt(d, r, label, size=13, color=t["text"], w=132)
    tr = frame(d, r, "track", width=track, height=26, cornerRadius=6, fill=t["surface2"],
               layout="horizontal", alignItems="center", paddingLeft=0)
    rect(d, tr, int(track * pct), 26, fill=color, radius=6, name="bar")
    txt(d, r, count, size=13, weight="SemiBold", color=t["text"], w=48, align="right")
    return r


def d_reports(d, page, t, x, y, name):
    f = frame(d, page, name, width=1440, height=900, x=x, y=y, fill=t["bg"],
              layout="vertical", gap=0, clip=True)
    app_header(d, f, t, "Campaign")
    main = col(d, f, "main", gap=20, padding=24, sizingH="fill", sizingV="fill")
    page_title(d, main, t, "Reports", "Weekend Camp 2026 · 12 Aug 2026", action="Export CSV")

    body = row(d, main, "body", gap=20, crossAlign="min", sizingH="fill")
    left = col(d, body, "left", gap=20, width=860)
    right = col(d, body, "right", gap=20, width=512, sizingV="fill")

    fc = card(d, left, "funnel", bg=t["surface"], border=t["border"], pad=0, radius=12)
    panel_header(d, fc, t, "Campaign funnel",
                 "The fourth bucket is the one that makes a stalled caller visible.")
    fb = col(d, fc, "funnel-body", gap=12, padding=20)
    bar_row(d, fb, t, "Assigned", "200", 1.0, t["chart1"], track=560, w=780)
    bar_row(d, fb, t, "Attempted", "148", 0.74, t["chart2"], track=560, w=780)
    bar_row(d, fb, t, "Reached", "91", 0.455, t["chart4"], track=560, w=780)
    bar_row(d, fb, t, "Never attempted", "52", 0.26, t["warning"], track=560, w=780)
    fnote = row(d, fb, "fnote", gap=8, crossAlign="center")
    ico(d, fnote, "triangle-alert", size=15, color=t["warning"])
    txt(d, fnote, "52 assigned contacts were never called. Assigning is not the same as "
                  "reaching somebody — this bucket is the difference.",
        size=12, color=t["muted"], w=700)

    oc = card(d, left, "outcomes", bg=t["surface"], border=t["border"], pad=0, radius=12)
    panel_header(d, oc, t, "Outcome mix", "Every outcome is recorded by the caller, by hand.")
    ob = col(d, oc, "outcomes-body", gap=10, padding=20)
    for label, cnt, pct, colr in (
            ("Answered", "91", 0.455, t["chart2"]),
            ("Busy", "22", 0.11, t["chart5"]),
            ("No response", "19", 0.095, t["chart1"]),
            ("Switched off", "8", 0.04, t["chart3"]),
            ("Wrong number", "6", 0.03, t["danger"]),
            ("Not reachable", "2", 0.01, t["chart5"])):
        bar_row(d, ob, t, label, cnt, pct, colr, track=460, w=780)

    lc = card(d, right, "leaderboard", bg=t["surface"], border=t["border"], pad=0, radius=12)
    panel_header(d, lc, t, "Caller leaderboard")
    lb = col(d, lc, "lb-body", gap=10, padding=20)
    warn = row(d, lb, "lb-note", gap=8, crossAlign="center")
    ico(d, warn, "info", size=15, color=t["muted"])
    txt(d, warn, "Ranked on completed attempts only. Under click-to-call every outcome is "
                 "self-reported, so no quality signal is claimed.",
        size=12, color=t["muted"], w=440)
    for i, (nm, calls, reached) in enumerate((("Divya Parthasarathy", "68", "41"),
                                              ("Anand Narayanan", "52", "27"),
                                              ("Suresh Kannan", "28", "23"))):
        lr = row(d, lb, f"lb-{i}", gap=12, crossAlign="center")
        txt(d, lr, str(i + 1), size=13, weight="Bold", color=t["muted"], w=18)
        av = frame(d, lr, "avatar", width=32, height=32, cornerRadius=999, fill=t["primarySoft"],
                   layout="horizontal", alignItems="center", justifyContent="center")
        txt(d, av, nm.split()[0][0] + nm.split()[1][0], size=11, weight="Bold", color=t["primary"])
        txt(d, lr, nm, size=13, color=t["text"], w=200)
        spacer = frame(d, lr, "spacer", layout="horizontal", sizingH="fill")
        txt(d, lr, f"{reached} reached", size=12, color=t["muted"], w=90, align="right")
        txt(d, lr, calls, size=14, weight="Bold", color=t["primary"], w=40, align="right")

    ac = card(d, right, "activity", bg=t["surface"], border=t["border"], pad=0, radius=12)
    panel_header(d, ac, t, "Recent activity")
    ab = col(d, ac, "activity-body", gap=14, padding=20)
    for who, what, when in (("Divya Parthasarathy", "Answered · Weekend Camp", "12:04"),
                            ("Anand Narayanan", "No response · Weekend Camp", "11:52"),
                            ("Suresh Kannan", "Busy · Bhakti Basics", "11:31"),
                            ("Divya Parthasarathy", "Re-queued 7 contacts", "11:12")):
        ar = row(d, ab, "act", gap=10, crossAlign="center")
        dot = frame(d, ar, "dot", width=8, height=8, cornerRadius=999, fill=t["primary"])
        txt(d, ar, who, size=12, weight="SemiBold", color=t["text"], w=170)
        txt(d, ar, what, size=12, color=t["muted"], w=190)
        spacer = frame(d, ar, "spacer", layout="horizontal", sizingH="fill")
        txt(d, ar, when, size=12, color=t["muted"])
    return f


# --------------------------------------------------------------------------
# Mobile screens — 390x844
# --------------------------------------------------------------------------

def m_shell(d, page, t, name, x, y, appbar="dialer"):
    f = frame(d, page, name, width=390, height=844, x=x, y=y, fill=t["bg"],
              layout="vertical", gap=0)
    if appbar == "dialer":
        dialer_appbar(d, f, t)
    else:
        mobile_appbar(d, f, t)
    body = col(d, f, "body", gap=0, sizingH="fill", sizingV="fill")
    return f, body


def m_call_card(d, page, t, x, y, name, theme=None):
    t = theme or t
    f, body = m_shell(d, page, t, name, x, y, appbar="dialer")
    content = col(d, body, "content", gap=12, padding=16, sizingV="fill")
    rec = row(d, content, "receipt-row", gap=8, crossAlign="center")
    spacer = frame(d, rec, "spacer", layout="horizontal", sizingH="fill")
    save_receipt(d, rec, t, "saved", "12:04")

    txt(d, content, "Priya R", size=26, weight="SemiBold", color=t["text"], font=POPPINS)
    ph = row(d, content, "phone", gap=10, crossAlign="center")
    txt(d, ph, "+91 98401 23456", size=15, color=t["text"])
    cp = frame(d, ph, "copy", layout="horizontal", alignItems="center", gap=6, height=32,
               paddingLeft=10, paddingRight=12, cornerRadius=999, fill=t["surface"],
               stroke=t["border"], strokeWeight=1, strokeAlign="inside", crossAlign="center")
    ico(d, cp, "copy", size=14, color=t["muted"])
    txt(d, cp, "Copy", size=12, weight="SemiBold", color=t["muted"])
    meta = row(d, content, "meta", gap=8)
    for m in ("Hindi", "Level 2", "Anna Nagar"):
        pill(d, meta, m, size=12, bg=t["chip"], fg=t["chipFg"], px=10, py=4)
    divider(d, content, t["border"])
    txt(d, content, "Previous", size=11, weight="SemiBold", color=t["muted"], ls=0.8, caps=True)
    for when, outcome, extra in (("12 Aug", "No answer", "tried twice · no follow-up set"),
                                 ("03 Aug", "Answered", "Not interested · “shift timings”")):
        h = row(d, content, "history", gap=10, crossAlign="center")
        txt(d, h, when, size=12, color=t["muted"], w=58)
        txt(d, h, outcome, size=13, weight="SemiBold", color=t["text"], w=96)
        txt(d, h, extra, size=12, color=t["muted"], w=180)
    spacer = frame(d, content, "spacer", layout="vertical", sizingV="fill")

    action = col(d, body, "action", gap=10, padding=16, fill=t["surface"])
    d.cmds[-1]["params"]["props"]["stroke"] = t["border"]
    d.cmds[-1]["params"]["props"]["strokeWeight"] = 1
    d.cmds[-1]["params"]["props"]["strokeSides"] = [True, False, False, False]
    d.cmds[-1]["params"]["props"]["strokeAlign"] = "inside"
    b = button(d, action, "Call Priya", "primary", icon="phone", h=56, size=16)
    setp(d, b, sizingH="fill", fill=t["primary"], cornerRadius=12)
    cd = row(d, action, "countdown", gap=10, crossAlign="center")
    txt(d, cd, "Next call in 14s", size=12, weight="SemiBold", color=t["muted"], w=100)
    tr = frame(d, cd, "track", width=242, height=6, cornerRadius=999, fill=t["surface2"],
               layout="horizontal")
    rect(d, tr, 96, 6, fill=t["primary"], radius=999, name="progress")
    return f


def m_queue_drawer(d, page, t, x, y, name):
    f = frame(d, page, name, width=390, height=844, x=x, y=y, fill=t["bg"], layout="none")
    base = frame(d, f, "base", x=0, y=0, width=390, height=844, fill=t["bg"],
                 layout="vertical", gap=0, opacity=0.35)
    dialer_appbar(d, base, t)
    bcontent = col(d, base, "content", gap=12, padding=16, sizingV="fill")
    txt(d, bcontent, "Priya R", size=26, weight="SemiBold", color=t["text"], font=POPPINS)
    txt(d, bcontent, "+91 98401 23456", size=15, color=t["text"])
    spacer = frame(d, bcontent, "spacer", layout="vertical", sizingV="fill")
    b = button(d, bcontent, "Call Priya", "primary", icon="phone", h=56, size=16)
    setp(d, b, sizingH="fill", fill=t["primary"], cornerRadius=12)

    rect(d, f, 390, 844, fill=t["scrim"], x=0, y=0, name="scrim")

    dr = frame(d, f, "drawer", x=0, y=0, width=320, height=844, fill=t["surface"],
               layout="vertical", gap=0)
    d.cmds[-1]["params"]["props"]["stroke"] = t["border"]
    d.cmds[-1]["params"]["props"]["strokeWeight"] = 1
    d.cmds[-1]["params"]["props"]["strokeSides"] = [False, True, False, False]
    d.cmds[-1]["params"]["props"]["strokeAlign"] = "inside"
    dh = row(d, dr, "drawer-head", gap=12, crossAlign="center", padding=16)
    txt(d, dh, "Queue", size=20, weight="SemiBold", color=t["text"], font=POPPINS)
    spacer = frame(d, dh, "spacer", layout="horizontal", sizingH="fill")
    xb = frame(d, dh, "close", width=32, height=32, cornerRadius=999, fill=t["surface2"],
               layout="horizontal", alignItems="center", justifyContent="center")
    ico(d, xb, "x", size=16, color=t["text"])
    sub = row(d, dr, "drawer-sub", gap=8, crossAlign="center", paddingLeft=16, paddingRight=16)
    txt(d, sub, "Showing 12 of 487", size=12, weight="SemiBold", color=t["muted"])
    txt(d, sub, "·  tap any name to jump", size=12, color=t["muted"])
    divider(d, dr, t["border"])
    lst = col(d, dr, "list", gap=0, paddingTop=8, paddingBottom=8, sizingV="fill")
    rows = [("done", "1", "Meena S", "Answered"), ("done", "2", "Ravi N", "Answered"),
            ("current", "3", "Priya R", "← you"), ("next", "4", "Sanjay K", ""),
            ("", "5", "Lakshmi V", ""), ("", "6", "Ganesh M", ""),
            ("", "7", "Radha S", ""), ("", "8", "Kiran P", "")]
    for state, n, name_, note in rows:
        rr = row(d, lst, f"q-{n}", gap=12, crossAlign="center", paddingLeft=16,
                 paddingRight=16, height=56)
        if state == "current":
            setp(d, rr, fill=t["primarySoft"])
        mark = frame(d, rr, "mark", width=22, height=22, cornerRadius=999,
                     fill={"done": t["success"], "current": t["primary"],
                           "next": t["surface2"]}.get(state, "#ffffff00"),
                     stroke=t["border"] if not state else None, strokeWeight=1,
                     strokeAlign="inside", layout="horizontal", alignItems="center",
                     justifyContent="center")
        if state == "done":
            ico(d, mark, "check", size=13, color="#ffffff", sw=2.5)
        elif state == "current":
            ico(d, mark, "phone", size=11, color="#ffffff", sw=2.5)
        txt(d, rr, n, size=12, color=t["muted"], w=20)
        txt(d, rr, name_, size=14, weight="SemiBold" if state == "current" else "Regular",
            color=t["text"], w=130)
        txt(d, rr, note, size=12, color=t["primary"] if state == "current" else t["muted"])
    return f


def m_on_the_call(d, page, t, x, y, name):
    f, body = m_shell(d, page, t, name, x, y, appbar="dialer")
    content = col(d, body, "content", gap=16, padding=16, sizingV="fill", crossAlign="center")
    spacer = frame(d, content, "spacer", layout="vertical", sizingV="fill")
    txt(d, content, "You're calling", size=13, color=t["muted"])
    txt(d, content, "Priya R", size=30, weight="SemiBold", color=t["text"], font=POPPINS)
    ph = row(d, content, "phone", gap=10, crossAlign="center")
    txt(d, ph, "+91 98401 23456", size=17, color=t["text"])
    cp = frame(d, ph, "copy", layout="horizontal", alignItems="center", gap=6, height=34,
               paddingLeft=10, paddingRight=12, cornerRadius=999, fill=t["surface"],
               stroke=t["border"], strokeWeight=1, strokeAlign="inside", crossAlign="center")
    ico(d, cp, "copy", size=14, color=t["muted"])
    txt(d, cp, "Copy", size=12, weight="SemiBold", color=t["muted"])
    meta = row(d, content, "meta", gap=8)
    for m in ("Hindi", "Level 2", "Anna Nagar"):
        pill(d, meta, m, size=12, bg=t["chip"], fg=t["chipFg"], px=10, py=4)
    n = card(d, content, "explain", bg=t["surface2"], border=t["border"], pad=14, radius=10, gap=8)
    nh = row(d, n, "nh", gap=8, crossAlign="center")
    ico(d, nh, "info", size=16, color=t["muted"])
    txt(d, nh, "Nothing on the web can hear your call", size=12, weight="SemiBold",
        color=t["text"], w=300)
    txt(d, n, "No browser can tell when a call ends. Tap “I'm back” when you are back — "
              "the survey is asked after that, never before.",
        size=12, color=t["muted"], w=300)
    spacer = frame(d, content, "spacer2", layout="vertical", sizingV="fill")

    action = col(d, body, "action", gap=10, padding=16, fill=t["surface"])
    for k, v in (("stroke", t["border"]), ("strokeWeight", 1),
                 ("strokeSides", [True, False, False, False]), ("strokeAlign", "inside")):
        d.cmds[-1]["params"]["props"][k] = v
    b = button(d, action, "I'm back", "primary", icon="phone-forwarded", h=56, size=16)
    setp(d, b, sizingH="fill", fill=t["primary"], cornerRadius=12)
    return f


def outcome_grid(d, parent, t, selected="Answered"):
    g = frame(d, parent, "outcomes", layout="horizontal", gap=8, wrap=True)
    for o in ("Answered", "Busy", "No response", "Switched off", "Wrong number", "Not reachable"):
        on = o == selected
        p = {"layout": "horizontal", "crossAlign": "center", "height": 40,
             "paddingLeft": 14, "paddingRight": 14, "cornerRadius": 999, "crossAlign": "center"}
        if on:
            p["fill"] = t["primary"]
        else:
            p["fill"] = t["surface"]
            p["stroke"] = t["border"]
            p["strokeWeight"] = 1
            p["strokeAlign"] = "inside"
        it = frame(d, g, f"out-{o}", **p)
        if on:
            ico(d, it, "check", size=14, color="#ffffff", sw=2.5)
        txt(d, it, o, size=13, weight="SemiBold", color="#ffffff" if on else t["text"])
    return g


def m_disposition(d, page, t, x, y, name, state="ok"):
    f, body = m_shell(d, page, t, name, x, y, appbar="dialer")
    content = col(d, body, "content", gap=14, padding=16, sizingV="fill", clip=True)
    rec = row(d, content, "receipt-row", gap=8, crossAlign="center")
    spacer = frame(d, rec, "spacer", layout="horizontal", sizingH="fill")
    save_receipt(d, rec, t, "saved" if state == "ok" else "failed", "12:04")
    if state == "failed":
        ban = card(d, content, "banner", bg=t["dangerSoft"], border=t["danger"], pad=14,
                   radius=10, gap=6)
        bh = row(d, ban, "bh", gap=8, crossAlign="center")
        ico(d, bh, "triangle-alert", size=16, color=t["danger"])
        txt(d, bh, "We could not reach the server", size=13, weight="SemiBold",
            color=t["danger"], w=300)
        txt(d, ban, "Your answers are kept. The session is paused until the save lands, "
                    "so nothing is lost and nothing is silently dropped.",
            size=12, color=t["muted"], w=300)

    txt(d, content, "How did it go?", size=20, weight="SemiBold", color=t["text"], font=POPPINS)
    outcome_grid(d, content, t, "Answered")

    sec = col(d, content, "followup", gap=8)
    hdr = row(d, sec, "fh", gap=8, crossAlign="center")
    txt(d, hdr, "Follow-up", size=12, weight="SemiBold", color=t["muted"], ls=0.6, caps=True)
    txt(d, hdr, "only asked when the call was answered", size=11, color=t["muted"])
    fg = row(d, sec, "fu-chips", gap=8, wrap=True)
    for s in ("New", "Contacted", "Interested", "Not interested", "Joined", "Dormant"):
        on = s == "Interested"
        p = {"layout": "horizontal", "crossAlign": "center", "height": 36,
             "paddingLeft": 12, "paddingRight": 12, "cornerRadius": 999, "crossAlign": "center"}
        if on:
            p["fill"] = t["primarySoft"]
            p["stroke"] = t["primary"]
            p["strokeWeight"] = 1
            p["strokeAlign"] = "inside"
        it = frame(d, fg, f"fu-{s}", **p)
        txt(d, it, s, size=12, weight="SemiBold", color=t["primary"] if on else t["text"])

    nl = field_label(d, content, "Notes", "Never pre-filled — this is the caller's own words.")
    rect(d, nl, 358, 64, fill=t["field"], radius=8, stroke=t["border"], sw=1, name="notes")

    q1 = col(d, content, "q1", gap=8)
    q1h = row(d, q1, "q1h", gap=8, crossAlign="center")
    txt(d, q1h, "Were they interested in the programme?", size=13, weight="SemiBold",
        color=t["text"], w=280)
    pill(d, q1h, "Required", size=10, bg=t["successSoft"], fg=t["success"], px=7, py=3)
    q1o = row(d, q1, "q1o", gap=8, wrap=True)
    for o in ("Yes, very interested", "Somewhat", "Not interested"):
        pill(d, q1o, o, size=12, bg=t["surface"], fg=t["text"], border=t["border"], px=10, py=5)

    q2 = col(d, content, "q2", gap=8)
    txt(d, q2, "Which session would they attend?", size=13, weight="SemiBold", color=t["text"])
    q2o = row(d, q2, "q2o", gap=8, wrap=True)
    for o in ("Sunday morning", "Sunday evening"):
        pill(d, q2o, o, size=12, bg=t["surface"], fg=t["text"], border=t["border"], px=10, py=5)

    action = col(d, body, "action", gap=10, padding=16, fill=t["surface"])
    for k, v in (("stroke", t["border"]), ("strokeWeight", 1),
                 ("strokeSides", [True, False, False, False]), ("strokeAlign", "inside")):
        d.cmds[-1]["params"]["props"][k] = v
    if state == "ok":
        b = button(d, action, "Save & continue", "primary", icon="check", h=56, size=16)
        setp(d, b, sizingH="fill", fill=t["primary"], cornerRadius=12)
    else:
        b = button(d, action, "Retry save", "primary", icon="refresh-cw", h=56, size=16)
        setp(d, b, sizingH="fill", fill=t["danger"], cornerRadius=12)
        b2 = button(d, action, "Skip this contact", "outline", h=44)
        setp(d, b2, sizingH="fill")
    return f


def m_summary(d, page, t, x, y, name):
    f, body = m_shell(d, page, t, name, x, y, appbar="dialer")
    content = col(d, body, "content", gap=16, padding=16, sizingV="fill")
    txt(d, content, "Session complete", size=24, weight="SemiBold", color=t["text"], font=POPPINS)
    txt(d, content, "Weekend Camp 2026 · 12 Aug", size=13, color=t["muted"])
    stats = row(d, content, "stats", gap=10)
    for label, value, colr in (("Called", "18", t["primary"]), ("Reached", "11", t["success"]),
                               ("No answer", "7", t["warning"])):
        sc = stat_card(d, stats, label, value, None, colr, w=112, bg=t["surface"],
                       border=t["border"], value_size=26)
        setp(d, sc, padding=14, gap=4)
    more = col(d, content, "more", gap=6)
    for line in ("3 wrong number", "2 skipped early", "1 closed after 3 attempts"):
        r = row(d, more, "m", gap=8, crossAlign="center")
        ico(d, r, "chevron-right", size=14, color=t["muted"])
        txt(d, r, line, size=13, color=t["muted"])
    rec = card(d, content, "recall", bg=t["primarySoft"], border=t["primary"], pad=16,
               radius=12, gap=8)
    rh = row(d, rec, "rh", gap=8, crossAlign="center")
    ico(d, rh, "phone-forwarded", size=16, color=t["primary"])
    txt(d, rh, "7 people were never picked up", size=14, weight="SemiBold",
        color=t["primary"], w=280)
    txt(d, rec, "A contact who was busy at 7pm is not a contact who declined. Re-queue "
                "them and they come back as work instead of being lost.",
        size=12, color=t["muted"], w=300)
    spacer = frame(d, content, "spacer", layout="vertical", sizingV="fill")

    action = col(d, body, "action", gap=10, padding=16, fill=t["surface"])
    for k, v in (("stroke", t["border"]), ("strokeWeight", 1),
                 ("strokeSides", [True, False, False, False]), ("strokeAlign", "inside")):
        d.cmds[-1]["params"]["props"][k] = v
    b = button(d, action, "Re-queue those 7 and continue", "primary", icon="refresh-cw",
               h=52, size=15)
    setp(d, b, sizingH="fill", fill=t["primary"], cornerRadius=12)
    b2 = button(d, action, "Done — back to my queue", "outline", h=44)
    setp(d, b2, sizingH="fill")
    txt(d, action, "Re-queue stops after 3 attempts per contact.", size=11, color=t["muted"])
    return f


def m_campaign_title(d, parent, t, title, subtitle, chevron=True):
    g = col(d, parent, "m-title", gap=2)
    h = row(d, g, "h", gap=4, crossAlign="center")
    txt(d, h, title, size=22, weight="SemiBold", color=t["text"], font=POPPINS)
    if chevron:
        ico(d, h, "chevron-down", size=18, color=t["primary"])
    txt(d, g, subtitle, size=13, color=t["muted"])
    return g


def m_pill_nav(d, parent, t, items, active_index=0):
    p = row(d, parent, "m-pills", gap=4, padding=4, cornerRadius=999, fill=t["surface"],
            stroke=t["border"], strokeWeight=1, strokeAlign="inside", alignItems="center")
    for i, label in enumerate(items):
        on = i == active_index
        ip = {"layout": "horizontal", "crossAlign": "center", "height": 32,
              "paddingLeft": 14, "paddingRight": 14, "cornerRadius": 999, "crossAlign": "center"}
        if on:
            ip["fill"] = t["primary"]
        it = frame(d, p, f"pill-{label}", **ip)
        txt(d, it, label, size=13, weight="SemiBold", color="#ffffff" if on else t["muted"])
    return p


def m_campaigns(d, page, t, x, y, name, theme=None):
    t = theme or t
    f = frame(d, page, name, width=390, height=844, x=x, y=y, fill=t["bg"],
              layout="vertical", gap=0)
    mobile_appbar(d, f, t)
    body = col(d, f, "body", gap=0, sizingH="fill", sizingV="fill")
    content = col(d, body, "content", gap=16, padding=16, sizingV="fill", clip=True)
    m_campaign_title(d, content, t, "Campaign", "12 campaigns · folk programme")
    m_pill_nav(d, content, t, ["Campaigns", "Callers", "Reports"], 0)

    grid = col(d, content, "stats", gap=10)
    for pair in ((("Assigned", "200", t["primary"]), ("Attempted", "148", t["primary"])),
                 (("Reached", "91", t["primary"]), ("Never attempted", "52", t["warning"]))):
        r = row(d, grid, "srow", gap=10)
        for label, value, colr in pair:
            sc = stat_card(d, r, label, value, None, colr, w=173, bg=t["surface"],
                           border=t["border"], value_size=24)
            setp(d, sc, padding=14, gap=4)

    txt(d, content, "Active", size=12, weight="SemiBold", color=t["muted"], ls=0.6, caps=True)
    for cname, cdate, assigned, reached, never in (
            ("Weekend Camp 2026", "12 Aug", "120", "68", "17"),
            ("Bhakti Basics — Batch 4", "19 Aug", "80", "23", "9")):
        cc = card(d, content, f"camp-{cname}", bg=t["surface"], border=t["border"],
                  pad=14, radius=10, gap=10)
        ch = row(d, cc, "ch", gap=8, crossAlign="center")
        txt(d, ch, cname, size=14, weight="SemiBold", color=t["text"], w=230)
        spacer = frame(d, ch, "spacer", layout="horizontal", sizingH="fill")
        pill(d, ch, "ACTIVE", size=10, bg=t["successSoft"], fg=t["success"], px=7, py=3)
        cr = row(d, cc, "cr", gap=16, crossAlign="center")
        for label, value, colr in (("Assigned", assigned, t["text"]),
                                   ("Reached", reached, t["text"]),
                                   ("Never", never, t["warning"])):
            cell = col(d, cr, "cell", gap=2)
            txt(d, cell, label, size=10, color=t["muted"], ls=0.5, caps=True)
            txt(d, cell, value, size=15, weight="Bold", color=colr, font=POPPINS)
    txt(d, content, "Completed and cancelled campaigns are listed under Campaigns on the "
                    "desktop.", size=11, color=t["muted"], w=358)
    spacer = frame(d, content, "spacer", layout="vertical", sizingV="fill")
    bottom_nav(d, body, t, "Campaign")
    return f


def m_assign(d, page, t, x, y, name):
    f = frame(d, page, name, width=390, height=844, x=x, y=y, fill=t["bg"],
              layout="vertical", gap=0)
    mobile_appbar(d, f, t)
    body = col(d, f, "body", gap=0, sizingH="fill", sizingV="fill")
    content = col(d, body, "content", gap=16, padding=16, sizingV="fill", clip=True)
    m_campaign_title(d, content, t, "Assign contacts", "Weekend Camp 2026 · 12 Aug 2026")
    m_pill_nav(d, content, t, ["Campaigns", "Callers", "Reports"], 0)

    fl = col(d, content, "filter-block", gap=8)
    fr = row(d, fl, "filters", gap=8, wrap=True)
    for label, icon in (("Centre", "map-pin"), ("Level", "layers"), ("Language", "globe")):
        select_field(d, fr, label, icon=icon, w=118, h=36, bg=t["surface"],
                     border=t["border"], fg=t["text"], size=13)
    match = row(d, content, "match", gap=8, crossAlign="center")
    txt(d, match, "148 contacts match", size=14, weight="SemiBold", color=t["text"])
    txt(d, match, "in 3 centres", size=12, color=t["muted"])

    cl = field_label(d, content, "Callers", "Choose who calls them, then split the list equally.")
    for nm, initials, calls in (("Divya Parthasarathy", "DP", "18 done"),
                                ("Anand Narayanan", "AN", "12 done"),
                                ("Suresh Kannan", "SK", "9 done")):
        cr = row(d, cl, f"caller-{initials}", gap=12, crossAlign="center", height=50,
                 paddingLeft=12, paddingRight=12, cornerRadius=10, fill=t["surface"],
                 stroke=t["border"], strokeWeight=1, strokeAlign="inside")
        av = frame(d, cr, "avatar", width=32, height=32, cornerRadius=999, fill=t["primary"],
                   layout="horizontal", alignItems="center", justifyContent="center")
        txt(d, av, initials, size=11, weight="Bold", color="#ffffff")
        txt(d, cr, nm, size=13, weight="SemiBold", color=t["text"], w=180)
        spacer = frame(d, cr, "spacer", layout="horizontal", sizingH="fill")
        txt(d, cr, calls, size=12, color=t["muted"])
        checkbox(d, cr, True, color=t["primary"], size=18)

    toggle(d, content, t, "Split equally", on=True, w=358)
    sumrow = card(d, content, "summary", bg=t["primarySoft"], border=t["primary"], pad=12,
                  radius=10, gap=4)
    txt(d, sumrow, "148 contacts ÷ 3 callers", size=13, weight="SemiBold", color=t["primary"])
    txt(d, sumrow, "50 · 49 · 49", size=13, color=t["muted"])
    note(d, content, "Picking contacts one at a time is available on the desktop.",
         size=11, icon="info", w=358)
    spacer = frame(d, content, "spacer", layout="vertical", sizingV="fill")

    action = col(d, body, "action", gap=10, padding=16, fill=t["surface"])
    for k, v in (("stroke", t["border"]), ("strokeWeight", 1),
                 ("strokeSides", [True, False, False, False]), ("strokeAlign", "inside")):
        d.cmds[-1]["params"]["props"][k] = v
    b = button(d, action, "Assign 148 contacts", "primary", icon="check", h=52, size=15)
    setp(d, b, sizingH="fill", fill=t["primary"], cornerRadius=12)
    bottom_nav(d, body, t, "Campaign")
    return f


def m_reports(d, page, t, x, y, name):
    f = frame(d, page, name, width=390, height=844, x=x, y=y, fill=t["bg"],
              layout="vertical", gap=0)
    mobile_appbar(d, f, t)
    body = col(d, f, "body", gap=0, sizingH="fill", sizingV="fill")
    content = col(d, body, "content", gap=16, padding=16, sizingV="fill", clip=True)
    m_campaign_title(d, content, t, "Reports", "Weekend Camp 2026 · 12 Aug 2026")
    m_pill_nav(d, content, t, ["Campaigns", "Callers", "Reports"], 2)

    fc = card(d, content, "funnel", bg=t["surface"], border=t["border"], pad=16, radius=12,
              gap=12)
    txt(d, fc, "Campaign funnel", size=16, weight="SemiBold", color=t["text"], font=POPPINS)
    for label, count, pct, colr in (("Assigned", "200", 1.0, t["chart1"]),
                                    ("Attempted", "148", 0.74, t["chart2"]),
                                    ("Reached", "91", 0.455, t["chart4"]),
                                    ("Never attempted", "52", 0.26, t["warning"])):
        r = row(d, fc, f"b-{label}", gap=10, crossAlign="center")
        txt(d, r, label, size=12, color=t["text"], w=110)
        tr = frame(d, r, "track", width=170, height=22, cornerRadius=6, fill=t["surface2"],
                   layout="horizontal", alignItems="center")
        rect(d, tr, int(170 * pct), 22, fill=colr, radius=6, name="bar")
        txt(d, r, count, size=12, weight="SemiBold", color=t["text"], w=36, align="right")

    lc = card(d, content, "leaderboard", bg=t["surface"], border=t["border"], pad=16,
              radius=12, gap=10)
    txt(d, lc, "Caller leaderboard", size=16, weight="SemiBold", color=t["text"], font=POPPINS)
    txt(d, lc, "Ranked on completed attempts only — every outcome is self-reported.",
        size=11, color=t["muted"], w=330)
    for i, (nm, calls, reached) in enumerate((("Divya Parthasarathy", "68", "41"),
                                              ("Anand Narayanan", "52", "27"),
                                              ("Suresh Kannan", "28", "23"))):
        lr = row(d, lc, f"lb-{i}", gap=10, crossAlign="center")
        txt(d, lr, str(i + 1), size=12, weight="Bold", color=t["muted"], w=16)
        av = frame(d, lr, "avatar", width=28, height=28, cornerRadius=999, fill=t["primarySoft"],
                   layout="horizontal", alignItems="center", justifyContent="center")
        txt(d, av, nm.split()[0][0] + nm.split()[1][0], size=10, weight="Bold", color=t["primary"])
        txt(d, lr, nm, size=13, color=t["text"], w=160)
        spacer = frame(d, lr, "spacer", layout="horizontal", sizingH="fill")
        txt(d, lr, calls, size=13, weight="Bold", color=t["primary"])
    spacer = frame(d, content, "spacer", layout="vertical", sizingV="fill")
    action = col(d, body, "action", gap=10, padding=16, fill=t["surface"])
    for k, v in (("stroke", t["border"]), ("strokeWeight", 1),
                 ("strokeSides", [True, False, False, False]), ("strokeAlign", "inside")):
        d.cmds[-1]["params"]["props"][k] = v
    b = button(d, action, "Export CSV", "outline", icon="download", h=48)
    setp(d, b, sizingH="fill")
    bottom_nav(d, body, t, "Campaign")
    return f


# --------------------------------------------------------------------------
# Assembly
# --------------------------------------------------------------------------

REFS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "references")

REFS = [
    ("desktop-manage-dashboard.png", "The real /manage dashboard, 1440×900"),
    ("desktop-manage-contacts.png", "The real contacts grid — the toolbar and table the "
                                    "assignment screen borrows"),
    ("desktop-light-header.png", "The app header the Campaign pill joins"),
    ("desktop-light-login.png", "The public page — brand chrome, orange accent"),
    ("mobile-light-manage-dashboard.png", "The real phone surfaces, 390×844"),
    ("mobile-light-manage-contacts.png", "The real phone contacts list and bottom nav"),
    ("mobile-light-admin-panel.png", "The phone's navigation drawer"),
    ("desktop-dark-header.png", "The dark header"),
]


def image_size(path):
    """(w, h) of a PNG or JPEG, without pulling in an image library."""
    data = open(path, "rb").read()
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return struct.unpack(">II", data[16:24])
    i = 2
    while i < len(data):
        if data[i] != 0xFF:
            i += 1
            continue
        marker = data[i + 1]
        if marker in (0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7, 0xC9, 0xCA, 0xCB):
            h, w = struct.unpack(">HH", data[i + 5:i + 9])
            return w, h
        if marker in (0xD8, 0xD9) or 0xD0 <= marker <= 0xD7:
            i += 2
            continue
        i += 2 + struct.unpack(">H", data[i + 2:i + 4])[0]
    return 100, 100


def build(out_dir, refs_dir):
    d = Doc()
    d.add("file.new", {"name": "FOLK Campaign — design set"})
    d.add("page.rename", {"id": 1, "name": "References"})
    d.add("page.setBackground", {"id": 1, "color": "#F2F4F7"})
    p_desktop = d.add("page.add", {"name": "Desktop — Campaign"})
    p_dialer = d.add("page.add", {"name": "Mobile — Dialer"})
    p_mobile = d.add("page.add", {"name": "Mobile — Campaign"})
    d.add("page.setBackground", {"id": {"$step": p_desktop}, "color": "#FFFFFF"})
    d.add("page.setBackground", {"id": {"$step": p_dialer}, "color": "#FFFFFF"})
    d.add("page.setBackground", {"id": {"$step": p_mobile}, "color": "#FFFFFF"})

    # ---- References page: the real app, for comparison ----
    head = frame(d, Raw(1), "refs-head", x=0, y=0, width=1900, layout="vertical", gap=8)
    txt(d, head, "FOLK Campaign — design set", size=28, weight="SemiBold", color="#24324a",
        font=POPPINS)
    txt(d, head, "Every control below is taken from the running folk_hkmc app: the same "
                 "header pill, the same tab strip, the same scope switch, the same grid "
                 "toolbar and table, the same tokens. The Campaign surface is a new tab on "
                 "that chrome, not a new app.", size=13, color="#4a5568", w=1200)
    for i, (fn, cap) in enumerate(REFS):
        path = os.path.join(refs_dir, fn)
        if not os.path.exists(path):
            continue
        col_i, row_i = i % 3, i // 3
        bx = col_i * 640
        by = 160 + row_i * 470
        f = frame(d, Raw(1), f"ref-{fn}", x=bx, y=by, width=600, layout="vertical",
                  gap=10, fill="#ffffff", cornerRadius=12, padding=12,
                  stroke="#e2e8f0", strokeWeight=1, strokeAlign="inside")
        iw, ih = image_size(path)
        k = min(576.0 / iw, 320.0 / ih)
        d.add("image.place", {"path": path, "parent": d.ref(f), "x": 0, "y": 0,
                              "width": round(iw * k), "height": round(ih * k),
                              "mode": "fill"})
        txt(d, f, cap, size=12, color="#4a5568", w=576)

    # ---- Desktop page ----
    d_campaigns(d, p_desktop, LIGHT, 0, 0, "Campaign — Campaigns (light)")
    d_new_campaign(d, p_desktop, LIGHT, 1520, 0, "Campaign — New campaign & survey (light)")
    d_assign(d, p_desktop, LIGHT, 3040, 0, "Campaign — Assign contacts (light, desktop only)")
    d_callers(d, p_desktop, LIGHT, 4560, 0, "Campaign — Callers (light)")
    d_reports(d, p_desktop, LIGHT, 6080, 0, "Campaign — Reports (light)")
    d_campaigns(d, p_desktop, DARK, 0, 980, "Campaign — Campaigns (dark)")
    d_reports(d, p_desktop, DARK, 1520, 980, "Campaign — Reports (dark)")

    # ---- Mobile dialer page ----
    m_call_card(d, p_dialer, LIGHT, 0, 0, "Dialer — Call card")
    m_queue_drawer(d, p_dialer, LIGHT, 470, 0, "Dialer — Queue rail")
    m_on_the_call(d, p_dialer, LIGHT, 940, 0, "Dialer — On the call")
    m_disposition(d, p_dialer, LIGHT, 1410, 0, "Dialer — Disposition")
    m_disposition(d, p_dialer, LIGHT, 1880, 0, "Dialer — Save failed, session paused", state="failed")
    m_summary(d, p_dialer, LIGHT, 2350, 0, "Dialer — Session summary & re-queue")
    m_call_card(d, p_dialer, DARK, 2820, 0, "Dialer — Call card (dark)", theme=DARK)

    # ---- Mobile campaign page ----
    m_campaigns(d, p_mobile, LIGHT, 0, 0, "Campaign (phone) — Campaigns")
    m_assign(d, p_mobile, LIGHT, 470, 0, "Campaign (phone) — Assign")
    m_reports(d, p_mobile, LIGHT, 940, 0, "Campaign (phone) — Reports")
    m_campaigns(d, p_mobile, DARK, 1410, 0, "Campaign (phone) — Campaigns (dark)", theme=DARK)

    out = os.path.join(out_dir, "campaign.json")
    d.dump(out)
    print(f"wrote {out} — {len(d.cmds)} commands")


if __name__ == "__main__":
    here = os.path.dirname(os.path.abspath(__file__))
    out_dir = sys.argv[1] if len(sys.argv) > 1 else here
    refs_dir = sys.argv[2] if len(sys.argv) > 2 else os.path.join(
        os.path.dirname(os.path.abspath(__file__)), "references")
    build(out_dir, refs_dir)
