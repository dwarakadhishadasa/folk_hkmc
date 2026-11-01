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
# --------------------------------------------------------------------------
# Sessions screens — the same chrome, tokens and grid as Campaign
# --------------------------------------------------------------------------

def bar_row(d, parent, t, label, count, pct, color, track=380, w=440):
    r = row(d, parent, f"bar-{label}", gap=12, crossAlign="center", width=w)
    txt(d, r, label, size=13, color=t["text"], w=132)
    tr = frame(d, r, "track", width=track, height=26, cornerRadius=6, fill=t["surface2"],
               layout="horizontal", alignItems="center", paddingLeft=0)
    rect(d, tr, int(track * pct), 26, fill=color, radius=6, name="bar")
    txt(d, r, count, size=13, weight="SemiBold", color=t["text"], w=48, align="right")
    return r


def m_campaign_title(d, parent, t, title, subtitle, chevron=True, action=None):
    g = col(d, parent, "m-title", gap=2)
    h = row(d, g, "h", gap=4, crossAlign="center")
    txt(d, h, title, size=22, weight="SemiBold", color=t["text"], font=POPPINS)
    if chevron:
        ico(d, h, "chevron-down", size=18, color=t["primary"])
    if action:
        spacer = frame(d, h, "spacer", layout="horizontal", sizingH="fill")
        b = button(d, h, action, "primary", icon="plus", size=12, h=32, px=12)
        setp(d, b, fill=t["primary"])
    txt(d, g, subtitle, size=13, color=t["muted"])
    return g


def m_pill_nav(d, parent, t, items, active_index=0):
    p = row(d, parent, "m-pills", gap=4, padding=4, cornerRadius=999, fill=t["surface"],
            stroke=t["border"], strokeWeight=1, strokeAlign="inside", alignItems="center")
    for i, label in enumerate(items):
        on = i == active_index
        ip = {"layout": "horizontal", "height": 32,
              "paddingLeft": 14, "paddingRight": 14, "cornerRadius": 999,
              "crossAlign": "center", "alignItems": "center"}
        if on:
            ip["fill"] = t["primary"]
        it = frame(d, p, f"pill-{label}", **ip)
        txt(d, it, label, size=13, weight="SemiBold", color="#ffffff" if on else t["muted"])
    return p

def detail_row(d, parent, t, label, value, w_label=120, w_value=320, gap=10):
    r = row(d, parent, f"detail-{label}", gap=gap, crossAlign="min", sizingH="fill")
    txt(d, r, label, size=11, color=t["muted"], w=w_label)
    txt(d, r, value, size=13, color=t["text"], w=w_value)
    return r


def attendance_row(d, parent, t, name, when, state="Attended"):
    r = row(d, parent, f"history-{name}", gap=10, crossAlign="center", sizingH="fill")
    dot = frame(d, r, "dot", width=8, height=8, cornerRadius=999,
                fill=t["success"] if state == "Attended" else t["muted"])
    c = col(d, r, "who", gap=1)
    txt(d, c, name, size=12, weight="SemiBold", color=t["text"])
    txt(d, c, when, size=11, color=t["muted"])
    spacer = frame(d, r, "spacer", layout="horizontal", sizingH="fill")
    pill(d, r, state, size=10,
         bg=t["successSoft"] if state == "Attended" else t["surface2"],
         fg=t["success"] if state == "Attended" else t["muted"], px=8, py=3)
    return r


def contact_panel(d, parent, t, w=512):
    c = card(d, parent, "contact", bg=t["surface"], border=t["border"], pad=20,
             radius=12, w=w, gap=10)
    head = row(d, c, "head", gap=12, crossAlign="center", sizingH="fill")
    av = frame(d, head, "avatar", width=52, height=52, cornerRadius=999,
               fill=t["primarySoft"], layout="horizontal", alignItems="center",
               justifyContent="center")
    txt(d, av, "PR", size=16, weight="Bold", color=t["primary"], font=POPPINS)
    who = col(d, head, "who", gap=2)
    txt(d, who, "Priya Raman", size=17, weight="SemiBold", color=t["text"], font=POPPINS)
    txt(d, who, "Contact · since Sep 2025", size=12, color=t["muted"])
    spacer = frame(d, head, "spacer", layout="horizontal", sizingH="fill")
    ico(d, head, "x", size=16, color=t["muted"])
    divider(d, c, t["border"])

    grid = row(d, c, "details", gap=16, crossAlign="min", sizingH="fill")
    col_a = col(d, grid, "col-a", gap=8, width=228)
    col_b = col(d, grid, "col-b", gap=8, width=228)
    for label, value in (("Phone", "+91 98400 12345"), ("Location", "T. Nagar Temple"),
                         ("First contact", "14 Sep 2025"), ("Sessions attended", "12")):
        detail_row(d, col_a, t, label, value, w_label=96, w_value=124, gap=8)
    for label, value in (("Preacher", "Anand Narayanan"),
                         ("Last attended", "12 Aug 2026")):
        detail_row(d, col_b, t, label, value, w_label=96, w_value=124, gap=8)

    txt(d, c, "Attendance history", size=12, weight="SemiBold", color=t["muted"],
        ls=0.6, caps=True)
    attendance_row(d, c, t, "Weekend Camp 2026", "12 Aug 2026 · T. Nagar")
    attendance_row(d, c, t, "Bhakti Basics — Batch 4", "19 Jul 2026 · Velachery")
    attendance_row(d, c, t, "Sunday Feast — July", "5 Jul 2026 · T. Nagar")
    attendance_row(d, c, t, "Youth Meet — June", "21 Jun 2026 · Adyar")
    return c


def d_sessions_overview(d, page, t, x, y, name, dark=False):
    f = frame(d, page, name, width=1440, height=900, x=x, y=y, fill=t["bg"],
              layout="vertical", gap=0, clip=True)
    app_header(d, f, t, "Sessions")
    main = col(d, f, "main", gap=20, padding=24, sizingH="fill", sizingV="fill")
    page_title(d, main, t, "Sessions", "48 sessions · folk programme",
               action="New session", filter_value="All locations")

    sub = row(d, main, "sub-nav", gap=0, crossAlign="center")
    tab_strip(d, sub, t, ["Overview", "Reports"], 0)

    stats = row(d, main, "stats", gap=16, crossAlign="min")
    stat_card(d, stats, "Sessions", "48", "6 upcoming", t["strong"], w=336,
              bg=t["surface"], border=t["border"])
    stat_card(d, stats, "Attendees", "1,284", "Across all sessions", t["strong"], w=336,
              bg=t["surface"], border=t["border"])
    stat_card(d, stats, "Avg attendance", "27", "+4 vs last month", t["strong"], w=336,
              bg=t["surface"], border=t["border"])
    stat_card(d, stats, "Repeat attendees", "312", "24% of attendees", t["strong"], w=336,
              bg=t["surface"], border=t["border"])

    if dark:
        rows = [
            [("txt", "Weekend Camp 2026", "navy"), "Wed, 12 Aug 2026", "T. Nagar Temple",
             "42 of 60", ("txt", "Completed", "muted"), ("txt", "Open ›", "muted")],
            [("txt", "Bhakti Basics — Batch 4", "navy"), "Wed, 19 Aug 2026", "Velachery Temple",
             "38 of 50", ("txt", "Completed", "muted"), ("txt", "Open ›", "muted")],
            [("txt", "Sunday Feast — August", "navy"), "Sun, 23 Aug 2026", "T. Nagar Temple",
             "57 of 80", ("txt", "Live now", "success"), ("txt", "Open ›", "muted")],
            [("txt", "Youth Meet — August", "navy"), "Sat, 29 Aug 2026", "Adyar Centre",
             "26 of 40", ("txt", "Upcoming", "warn"), ("txt", "Open ›", "muted")],
            [("txt", "Gita Life — Weekend", "navy"), "Sun, 30 Aug 2026", "Velachery Temple",
             "—", ("txt", "Upcoming", "warn"), ("txt", "Open ›", "muted")],
        ]
    else:
        rows = [
            [("txt", "Weekend Camp 2026", "navy"), "Wed, 12 Aug 2026", "T. Nagar Temple",
             "42 of 60", ("chip", "Completed", "info"), ("txt", "Open ›", "muted")],
            [("txt", "Bhakti Basics — Batch 4", "navy"), "Wed, 19 Aug 2026", "Velachery Temple",
             "38 of 50", ("chip", "Completed", "info"), ("txt", "Open ›", "muted")],
            [("txt", "Sunday Feast — August", "navy"), "Sun, 23 Aug 2026", "T. Nagar Temple",
             "57 of 80", ("chip", "Live now", "success"), ("txt", "Open ›", "muted")],
            [("txt", "Youth Meet — August", "navy"), "Sat, 29 Aug 2026", "Adyar Centre",
             "26 of 40", ("chip", "Upcoming", "warning"), ("txt", "Open ›", "muted")],
            [("txt", "Gita Life — Weekend", "navy"), "Sun, 30 Aug 2026", "Velachery Temple",
             "—", ("chip", "Upcoming", "warning"), ("txt", "Open ›", "muted")],
        ]

    table(d, main, "sessions",
          ["Session", "Date", "Location", "Attendees", "Status", ""],
          [400, 170, 230, 150, 140, 72], rows,
          bg=t["surface"], header_bg=t["surface2"], border=t["border"],
          text=t["text"], muted=t["muted"], total=1392, name_weight="SemiBold",
          strong=t["strong"])

    foot = row(d, main, "foot", gap=12, crossAlign="center", sizingH="fill")
    txt(d, foot, "48 sessions · showing 5", size=12, color=t["muted"])
    spacer = frame(d, foot, "spacer", layout="horizontal", sizingH="fill")
    note(d, foot, "Status is automatic — a session completes once its duration elapses. "
                  "Select one for its attendees.", icon="clock", color=t["muted"])
    return f


def d_sessions_reports(d, page, t, x, y, name):
    f = frame(d, page, name, width=1440, height=900, x=x, y=y, fill=t["bg"],
              layout="vertical", gap=0, clip=True)
    app_header(d, f, t, "Sessions")
    main = col(d, f, "main", gap=20, padding=24, sizingH="fill", sizingV="fill")
    page_title(d, main, t, "Reports", "Sessions · last 90 days",
               action="New session", filter_value="Last 90 days")

    sub = row(d, main, "sub-nav", gap=0, crossAlign="center")
    tab_strip(d, sub, t, ["Overview", "Reports"], 1)

    stats = row(d, main, "stats", gap=16, crossAlign="min")
    stat_card(d, stats, "Sessions run", "42", "Last 90 days", t["strong"], w=336,
              bg=t["surface"], border=t["border"])
    stat_card(d, stats, "Total attendance", "1,284", "Across all sessions", t["strong"], w=336,
              bg=t["surface"], border=t["border"])
    stat_card(d, stats, "Avg per session", "31", "+3 vs previous 90 days", t["strong"], w=336,
              bg=t["surface"], border=t["border"])
    stat_card(d, stats, "Repeat rate", "24%", "312 returning attendees", t["strong"], w=336,
              bg=t["surface"], border=t["border"])

    body = row(d, main, "body", gap=20, crossAlign="min", sizingH="fill")
    left = col(d, body, "left", gap=20, width=860)
    right = col(d, body, "right", gap=20, width=512, sizingV="fill")

    charts = row(d, left, "charts", gap=20, crossAlign="min")
    fc = card(d, charts, "by-session", bg=t["surface"], border=t["border"], pad=0,
              radius=12, w=420)
    panel_header(d, fc, t, "Attendance by session", "Top sessions by turnout.")
    fb = col(d, fc, "by-session-body", gap=10, padding=16)
    for label, count, pct, colr in (
            ("Sunday Feast", "57", 1.0, t["chart2"]),
            ("Weekend Camp", "42", 0.74, t["chart1"]),
            ("Bhakti Basics", "38", 0.67, t["chart4"]),
            ("Youth Meet", "26", 0.46, t["chart3"])):
        bar_row(d, fb, t, label, count, pct, colr, track=190, w=388)

    tc = card(d, charts, "trend", bg=t["surface"], border=t["border"], pad=0,
              radius=12, w=420)
    panel_header(d, tc, t, "Attendance trend", "Check-ins by week.")
    tb = col(d, tc, "trend-body", gap=10, padding=16)
    for label, count, pct in (("Week 2", "104", 0.74), ("Week 3", "96", 0.69),
                              ("Week 4", "121", 0.86)):
        bar_row(d, tb, t, label, count, pct, t["chart1"], track=190, w=388)
    note(d, tb, "Check-ins only; a session with none counts as zero.", icon="info",
         color=t["muted"])

    lc = card(d, right, "top", bg=t["surface"], border=t["border"], pad=0, radius=12)
    panel_header(d, lc, t, "Top sessions")
    lb = col(d, lc, "top-body", gap=10, padding=18)
    for i, (nm, when, count) in enumerate((("Sunday Feast — August", "23 Aug", "57"),
                                           ("Weekend Camp 2026", "12 Aug", "42"),
                                           ("Bhakti Basics — Batch 4", "19 Aug", "38"))):
        lr = row(d, lb, f"top-{i}", gap=12, crossAlign="center")
        txt(d, lr, str(i + 1), size=13, weight="Bold", color=t["muted"], w=18)
        c = col(d, lr, "who", gap=1)
        txt(d, c, nm, size=13, weight="SemiBold", color=t["text"])
        txt(d, c, when, size=11, color=t["muted"])
        spacer = frame(d, lr, "spacer", layout="horizontal", sizingH="fill")
        txt(d, lr, count, size=15, weight="Bold", color=t["primary"], w=40, align="right")

    return f


def d_session_detail(d, page, t, x, y, name, drawer=False):
    f = frame(d, page, name, width=1440, height=900, x=x, y=y, fill=t["bg"],
              layout="vertical", gap=0, clip=True)
    app_header(d, f, t, "Sessions")
    main = col(d, f, "main", gap=20, padding=24, sizingH="fill", sizingV="fill")

    hdr = row(d, main, "page-title", crossAlign="max", gap=16, sizingH="fill")
    left = col(d, hdr, "titles", gap=4)
    back = row(d, left, "back", gap=6, crossAlign="center")
    ico(d, back, "chevron-left", size=14, color=t["muted"])
    txt(d, back, "All sessions", size=12, color=t["muted"])
    title_row = row(d, left, "title-row", gap=10, crossAlign="center")
    txt(d, title_row, "Weekend Camp 2026", size=22, weight="SemiBold", color=t["text"],
        font=POPPINS)
    pill(d, title_row, "Completed", size=11, bg=t["infoSoft"], fg=t["info"], px=9, py=3)
    txt(d, left, "Wed, 12 Aug 2026 · 10:00 am · T. Nagar Temple", size=12,
        color=t["muted"])
    spacer = frame(d, hdr, "spacer", layout="horizontal", sizingH="fill")
    bo = button(d, hdr, "Export attendees", "outline", icon="download", h=36)
    if t is DARK:
        setp(d, bo, fill=t["surface"], stroke=t["border"])

    sub = row(d, main, "sub-nav", gap=0, crossAlign="center")
    tab_strip(d, sub, t, ["Attendees", "Session report"], 0)

    stats = row(d, main, "stats", gap=16, crossAlign="min")
    stat_card(d, stats, "Attended", "42", "This session", t["strong"], w=453.33,
              bg=t["surface"], border=t["border"])
    stat_card(d, stats, "First-timers", "11", "26% of attendees", t["strong"], w=453.33,
              bg=t["surface"], border=t["border"])
    stat_card(d, stats, "Returning", "31", "74% of attendees", t["strong"], w=453.33,
              bg=t["surface"], border=t["border"])

    rows = [
        [("txt", "Priya Raman", "navy"), "+91 98400 12345", "T. Nagar", "12",
         "Sep 2025", ("txt", "View ›", "muted")],
        [("txt", "Karthik Subramanian", "navy"), "+91 98410 22334", "Velachery", "8",
         "Jan 2026", ("txt", "View ›", "muted")],
        [("txt", "Meera Krishnan", "navy"), "+91 98420 33445", "T. Nagar", "15",
         "Mar 2025", ("txt", "View ›", "muted")],
        [("txt", "Arjun Prasad", "navy"), "+91 98430 44556", "Adyar", "3",
         "Jul 2026", ("txt", "View ›", "muted")],
        [("txt", "Lakshmi Narayanan", "navy"), "+91 98440 55667", "T. Nagar", "21",
         "Nov 2024", ("txt", "View ›", "muted")],
        [("txt", "Vignesh Iyer", "navy"), "+91 98450 66778", "Velachery", "1",
         "Aug 2026", ("txt", "View ›", "muted")],
    ]

    if drawer:
        body = row(d, main, "body", gap=20, crossAlign="min", sizingH="fill")
        lcol = col(d, body, "attendees", gap=12, width=860)
        table(d, lcol, "attendees",
              ["Name", "Phone", "Location", "Sessions", "First session", ""],
              [170, 150, 160, 80, 150, 72], rows,
              bg=t["surface"], header_bg=t["surface2"], border=t["border"],
              text=t["text"], muted=t["muted"], total=860, name_weight="SemiBold",
              strong=t["strong"])
        note(d, lcol, "Select an attendee to open their full contact record — phone, "
                      "assigned preacher, first contact and attendance history.",
             icon="mouse-pointer-click", color=t["muted"])
        contact_panel(d, body, t, 512)
    else:
        table(d, main, "attendees",
              ["Name", "Phone", "Location", "Sessions", "First session", ""],
              [400, 170, 200, 120, 160, 72], rows,
              bg=t["surface"], header_bg=t["surface2"], border=t["border"],
              text=t["text"], muted=t["muted"], total=1392, name_weight="SemiBold",
              strong=t["strong"])
        foot = row(d, main, "foot", gap=12, crossAlign="center", sizingH="fill")
        txt(d, foot, "42 attendees · showing 6", size=12, color=t["muted"])
        spacer = frame(d, foot, "spacer", layout="horizontal", sizingH="fill")
        note(d, foot, "Select an attendee to open their complete contact details.",
             icon="mouse-pointer-click", color=t["muted"])
    return f


def m_sessions(d, page, t, x, y, name, theme=None):
    t = theme or t
    f = frame(d, page, name, width=390, height=844, x=x, y=y, fill=t["bg"],
              layout="vertical", gap=0)
    mobile_appbar(d, f, t)
    body = col(d, f, "body", gap=0, sizingH="fill", sizingV="fill")
    content = col(d, body, "content", gap=16, padding=16, sizingV="fill", clip=True)
    m_campaign_title(d, content, t, "Sessions", "48 sessions · folk programme",
                     action="New session")

    grid = col(d, content, "stats", gap=10)
    for pair in ((("Sessions", "48", t["primary"]), ("Attendees", "1,284", t["primary"])),
                 (("Avg attendance", "27", t["primary"]), ("Upcoming", "6", t["primary"]))):
        r = row(d, grid, "srow", gap=10)
        for label, value, colr in pair:
            sc = stat_card(d, r, label, value, None, colr, w=173, bg=t["surface"],
                           border=t["border"], value_size=24)
            setp(d, sc, padding=14, gap=4)

    txt(d, content, "Recent & upcoming", size=12, weight="SemiBold", color=t["muted"],
        ls=0.6, caps=True)

    for sname, sdate, loc, attended, status in (
            ("Weekend Camp 2026", "Wed, 12 Aug", "T. Nagar", "42", "Completed"),
            ("Sunday Feast — August", "Sun, 23 Aug", "T. Nagar", "57", "Live now"),
            ("Youth Meet — August", "Sat, 29 Aug", "Adyar", "26", "Upcoming")):
        cc = card(d, content, f"sess-{sname}", bg=t["surface"], border=t["border"],
                  pad=14, radius=10, gap=8)
        ch = row(d, cc, "ch", gap=8, crossAlign="center")
        txt(d, ch, sname, size=14, weight="SemiBold", color=t["text"], w=250)
        spacer = frame(d, ch, "spacer", layout="horizontal", sizingH="fill")
        ico(d, ch, "chevron-right", size=16, color=t["muted"])
        txt(d, cc, f"{sdate} · {loc}", size=12, color=t["muted"])
        cr = row(d, cc, "cr", gap=10, crossAlign="center")
        txt(d, cr, attended, size=12, weight="SemiBold", color=t["text"])
        spacer = frame(d, cr, "spacer", layout="horizontal", sizingH="fill")
        tone = {"Completed": (t["infoSoft"], t["info"]),
                "Live now": (t["successSoft"], t["success"]),
                "Upcoming": (t["warningSoft"], t["warning"])}[status]
        pill(d, cr, status, size=10, bg=tone[0], fg=tone[1], px=7, py=3)

    spacer = frame(d, content, "spacer", layout="vertical", sizingV="fill")
    bottom_nav(d, body, t, "Sessions")
    return f


def m_sessions_reports(d, page, t, x, y, name):
    f = frame(d, page, name, width=390, height=844, x=x, y=y, fill=t["bg"],
              layout="vertical", gap=0)
    mobile_appbar(d, f, t)
    body = col(d, f, "body", gap=0, sizingH="fill", sizingV="fill")
    content = col(d, body, "content", gap=14, padding=16, sizingV="fill", clip=True)
    m_campaign_title(d, content, t, "Reports", "Sessions · last 90 days")

    grid = col(d, content, "stats", gap=10)
    for pair in ((("Sessions run", "42", t["primary"]), ("Attendance", "1,284", t["primary"])),
                 (("Avg per session", "31", t["primary"]), ("Repeat rate", "24%", t["primary"]))):
        r = row(d, grid, "srow", gap=10)
        for label, value, colr in pair:
            sc = stat_card(d, r, label, value, None, colr, w=173, bg=t["surface"],
                           border=t["border"], value_size=24)
            setp(d, sc, padding=14, gap=4)

    fc = card(d, content, "by-session", bg=t["surface"], border=t["border"], pad=14,
              radius=12, gap=10)
    txt(d, fc, "Attendance by session", size=15, weight="SemiBold", color=t["text"],
        font=POPPINS)
    for label, count, pct, colr in (("Sunday Feast", "57", 1.0, t["chart2"]),
                                    ("Weekend Camp", "42", 0.74, t["chart1"]),
                                    ("Bhakti Basics", "38", 0.67, t["chart4"]),
                                    ("Youth Meet", "26", 0.46, t["chart3"])):
        r = row(d, fc, f"b-{label}", gap=8, crossAlign="center")
        txt(d, r, label, size=11, color=t["text"], w=100)
        tr = frame(d, r, "track", width=180, height=20, cornerRadius=6, fill=t["surface2"],
                   layout="horizontal", alignItems="center")
        rect(d, tr, int(180 * pct), 20, fill=colr, radius=6, name="bar")
        txt(d, r, count, size=11, weight="SemiBold", color=t["text"], w=32, align="right")

    lc = card(d, content, "top", bg=t["surface"], border=t["border"], pad=14,
              radius=12, gap=8)
    txt(d, lc, "Top sessions", size=15, weight="SemiBold", color=t["text"], font=POPPINS)
    for i, (nm, when, count) in enumerate((("Sunday Feast — August", "23 Aug", "57"),
                                           ("Weekend Camp 2026", "12 Aug", "42"),
                                           ("Bhakti Basics — Batch 4", "19 Aug", "38"))):
        lr = row(d, lc, f"top-{i}", gap=8, crossAlign="center")
        txt(d, lr, str(i + 1), size=11, weight="Bold", color=t["muted"], w=14)
        c = col(d, lr, "who", gap=1)
        txt(d, c, nm, size=12, weight="SemiBold", color=t["text"])
        txt(d, c, when, size=10, color=t["muted"])
        spacer = frame(d, lr, "spacer", layout="horizontal", sizingH="fill")
        txt(d, lr, count, size=13, weight="Bold", color=t["primary"])

    spacer = frame(d, content, "spacer", layout="vertical", sizingV="fill")
    bottom_nav(d, body, t, "Sessions")
    return f


def m_session_detail(d, page, t, x, y, name):
    f = frame(d, page, name, width=390, height=844, x=x, y=y, fill=t["bg"],
              layout="vertical", gap=0)
    mobile_appbar(d, f, t)
    body = col(d, f, "body", gap=0, sizingH="fill", sizingV="fill")
    content = col(d, body, "content", gap=14, padding=16, sizingV="fill", clip=True)
    back = row(d, content, "back", gap=4, crossAlign="center")
    ico(d, back, "chevron-left", size=16, color=t["muted"])
    txt(d, back, "Sessions", size=13, color=t["muted"])
    mtitle = row(d, content, "title-row", gap=8, crossAlign="center")
    txt(d, mtitle, "Weekend Camp 2026", size=20, weight="SemiBold", color=t["text"],
        font=POPPINS)
    ico(d, mtitle, "chevron-down", size=18, color=t["primary"])
    pill(d, mtitle, "Completed", size=10, bg=t["infoSoft"], fg=t["info"], px=7, py=2)
    txt(d, content, "Wed, 12 Aug 2026 · 10:00 am", size=12, color=t["muted"])
    txt(d, content, "T. Nagar Temple", size=12, color=t["muted"])

    srow = row(d, content, "stats", gap=10)
    for label, value, colr in (("Attended", "42", t["primary"]),
                               ("First-timers", "11", t["text"]),
                               ("Returning", "31", t["text"])):
        sc = stat_card(d, srow, label, value, None, colr, w=112, bg=t["surface"],
                       border=t["border"], value_size=22)
        setp(d, sc, padding=12, gap=4)

    h = row(d, content, "att-head", gap=8, crossAlign="center")
    txt(d, h, "Attendees · 42", size=12, weight="SemiBold", color=t["muted"], ls=0.6,
        caps=True)
    spacer = frame(d, h, "spacer", layout="horizontal", sizingH="fill")
    txt(d, h, "Sort", size=12, color=t["muted"])

    for nm, phone, sessions in (("Priya Raman", "+91 98400 12345", "12 sessions"),
                                ("Karthik Subramanian", "+91 98410 22334", "8 sessions"),
                                ("Meera Krishnan", "+91 98420 33445", "15 sessions"),
                                ("Arjun Prasad", "+91 98430 44556", "3 sessions")):
        cc = card(d, content, f"att-{nm}", bg=t["surface"], border=t["border"],
                  pad=12, radius=10, gap=8)
        r = row(d, cc, "row", gap=10, crossAlign="center")
        av = frame(d, r, "avatar", width=36, height=36, cornerRadius=999,
                   fill=t["primarySoft"], layout="horizontal", alignItems="center",
                   justifyContent="center")
        initials = nm.split()[0][0] + nm.split()[1][0]
        txt(d, av, initials, size=11, weight="Bold", color=t["primary"])
        c = col(d, r, "who", gap=1)
        txt(d, c, nm, size=13, weight="SemiBold", color=t["text"])
        txt(d, c, phone, size=11, color=t["muted"])
        spacer = frame(d, r, "spacer", layout="horizontal", sizingH="fill")
        txt(d, r, sessions, size=11, color=t["muted"])
        ico(d, r, "chevron-right", size=15, color=t["muted"])

    txt(d, content, "Tap an attendee for their complete contact record.", size=11,
        color=t["muted"], w=358)
    spacer = frame(d, content, "spacer", layout="vertical", sizingV="fill")
    bottom_nav(d, body, t, "Sessions")
    return f


def m_contact(d, page, t, x, y, name):
    f = frame(d, page, name, width=390, height=844, x=x, y=y, fill=t["bg"],
              layout="vertical", gap=0)
    mobile_appbar(d, f, t)
    body = col(d, f, "body", gap=0, sizingH="fill", sizingV="fill")
    content = col(d, body, "content", gap=14, padding=16, sizingV="fill", clip=True)
    back = row(d, content, "back", gap=4, crossAlign="center")
    ico(d, back, "chevron-left", size=16, color=t["muted"])
    txt(d, back, "Weekend Camp 2026 · Attendees", size=13, color=t["muted"])

    hero = row(d, content, "hero", gap=12, crossAlign="center")
    av = frame(d, hero, "avatar", width=60, height=60, cornerRadius=999,
               fill=t["primarySoft"], layout="horizontal", alignItems="center",
               justifyContent="center")
    txt(d, av, "PR", size=18, weight="Bold", color=t["primary"], font=POPPINS)
    c = col(d, hero, "who", gap=2)
    txt(d, c, "Priya Raman", size=20, weight="SemiBold", color=t["text"], font=POPPINS)
    txt(d, c, "Contact · since Sep 2025", size=12, color=t["muted"])

    dc = card(d, content, "details", bg=t["surface"], border=t["border"], pad=16,
              radius=12, gap=10)
    txt(d, dc, "Contact details", size=14, weight="SemiBold", color=t["text"],
        font=POPPINS)
    for label, value in (("Phone", "+91 98400 12345"),
                         ("Location", "T. Nagar Temple"),
                         ("Assigned preacher", "Anand Narayanan"),
                         ("First contact", "14 Sep 2025"),
                         ("Sessions attended", "12"),
                         ("Last attended", "12 Aug 2026")):
        r = row(d, dc, f"d-{label}", gap=8, crossAlign="min", sizingH="fill")
        txt(d, r, label, size=11, color=t["muted"], w=118)
        txt(d, r, value, size=12, color=t["text"], w=210)

    hc = card(d, content, "history", bg=t["surface"], border=t["border"], pad=16,
              radius=12, gap=8)
    txt(d, hc, "Attendance history", size=14, weight="SemiBold", color=t["text"],
        font=POPPINS)
    for nm, when, state in (("Weekend Camp 2026", "12 Aug 2026", "Attended"),
                            ("Bhakti Basics — Batch 4", "19 Jul 2026", "Attended"),
                            ("Sunday Feast — July", "5 Jul 2026", "Attended")):
        r = row(d, hc, f"h-{nm}", gap=8, crossAlign="center", sizingH="fill")
        dot = frame(d, r, "dot", width=7, height=7, cornerRadius=999, fill=t["success"])
        c = col(d, r, "who", gap=1)
        txt(d, c, nm, size=12, weight="SemiBold", color=t["text"])
        txt(d, c, when, size=10, color=t["muted"])
        spacer = frame(d, r, "spacer", layout="horizontal", sizingH="fill")
        pill(d, r, state, size=9, bg=t["successSoft"], fg=t["success"], px=7, py=2)

    spacer = frame(d, content, "spacer", layout="vertical", sizingV="fill")
    bottom_nav(d, body, t, "Sessions")
    return f


# --------------------------------------------------------------------------
# Assembly
# --------------------------------------------------------------------------

REFS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "references")


def build(out_dir, refs_dir):
    d = Doc()
    d.add("file.new", {"name": "FOLK Sessions — design set"})
    d.add("page.rename", {"id": 1, "name": "Desktop — Sessions"})
    d.add("page.setBackground", {"id": 1, "color": "#FFFFFF"})
    p_mobile = d.add("page.add", {"name": "Mobile — Sessions"})
    d.add("page.setBackground", {"id": {"$step": p_mobile}, "color": "#FFFFFF"})
    p_desktop = Raw(1)

    d_sessions_overview(d, p_desktop, LIGHT, 0, 0, "Sessions — Overview (light)")
    d_sessions_reports(d, p_desktop, LIGHT, 1520, 0, "Sessions — Reports (light)")
    d_session_detail(d, p_desktop, LIGHT, 3040, 0,
                     "Sessions — Session detail (light)")
    d_session_detail(d, p_desktop, LIGHT, 4560, 0,
                     "Sessions — Attendee contact (light)", drawer=True)
    d_sessions_overview(d, p_desktop, DARK, 0, 980, "Sessions — Overview (dark)")
    d_sessions_reports(d, p_desktop, DARK, 1520, 980, "Sessions — Reports (dark)")

    m_sessions(d, p_mobile, LIGHT, 0, 0, "Sessions (phone) — Overview")
    m_session_detail(d, p_mobile, LIGHT, 470, 0, "Sessions (phone) — Session detail")
    m_contact(d, p_mobile, LIGHT, 940, 0, "Sessions (phone) — Attendee contact")
    m_sessions_reports(d, p_mobile, LIGHT, 1880, 0, "Sessions (phone) — Reports")
    m_sessions(d, p_mobile, DARK, 1410, 0, "Sessions (phone) — Overview (dark)", theme=DARK)

    out = os.path.join(out_dir, "sessions.json")
    d.dump(out)
    print(f"wrote {out} — {len(d.cmds)} commands")


if __name__ == "__main__":
    here = os.path.dirname(os.path.abspath(__file__))
    out_dir = sys.argv[1] if len(sys.argv) > 1 else here
    refs_dir = sys.argv[2] if len(sys.argv) > 2 else os.path.join(
        os.path.dirname(os.path.abspath(__file__)), "references")
    build(out_dir, refs_dir)
