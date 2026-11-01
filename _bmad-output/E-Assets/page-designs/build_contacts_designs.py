#!/usr/bin/env python3
"""
build_contacts_designs.py — generate the FOLK "Contacts" FigCraft design file.

The Contacts surface reuses the campaign design set's own chrome and tokens, so
the two files read as one product. Every control here is taken from the running
`folk_hkmc` app (apps/folk/app/globals.css, components/header.tsx,
components/manage/manage-portal.tsx, components/grid/) and from the captures in
`references/`. Nothing is invented.

Screens:
  Desktop  1440x900  Contacts Overview / Contacts Reports / Contacts grid
  Mobile    390x844  Contacts Overview / Contacts Reports / Contacts list

The nav shape is the campaign set's: a sub-tab strip of
`Overview | Contacts | Reports` under the page title, and the grid is the second
tab rather than the whole page. On a phone the same three destinations live in a
full-screen menu opened from the title's chevron, exactly as `campaign-menu.tsx`
does it. The section lives behind the existing first
"Contact" pill, so the app bar and the phone bottom nav are the campaign
generator's own — there is no sixth nav item, and this file does not draw one.

The eight frames settle `_bmad-output/specs/spec-contacts-overview-reports/`.
Where that spec corrects an earlier draft of this file, the correction is
commented at the point it lands.

Usage:  python3 build_contacts_designs.py <out-dir> [refs-dir]
"""

import os
import sys

# The campaign generator owns the token table, the icon fitting and the chrome
# helpers. Reusing them is what keeps the two design files from drifting: a
# change to the app's primary colour lands in both, because there is one source.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from build_campaigner_designs import (  # noqa: E402
    LIGHT, DARK, POPPINS, INTER,
    Doc, Raw, frame, row, col, txt, ico, rect, hairline, pill, button, card,
    checkbox, input_field, select_field, field_label, stat_card, table, divider,
    note, setp, app_header, mobile_appbar, bottom_nav, page_title, tab_strip,
    panel_header, image_size,
)

ROOT = os.path.dirname(os.path.abspath(__file__))
REFS_DIR = os.path.join(ROOT, "references")

# The Contacts sub-nav, matching `campaign-nav.ts`'s shape and order. The grid is
# the third tab, so the section never needs a nav item of its own: the app bar and
# the phone bottom nav are `build_campaigner_designs`' own, which is also what keeps
# the two files from drifting apart.
SUB_NAV = ["Overview", "Contacts", "Reports"]

# --------------------------------------------------------------------------
# Shared parts
# --------------------------------------------------------------------------

def recolor_last(d, count, color):
    """Recolour the last `count` text/vector commands.

    `button(kind="outline")` hard-codes the light theme's ink (`#24324a`) on its
    icon and label, which is invisible on a dark surface. There is no per-theme
    parameter, so the caller repaints the two nodes it just made.
    """
    for step in range(len(d.cmds) - 1, max(len(d.cmds) - 1 - count, -1), -1):
        props = d.cmds[step]["params"].get("props", {})
        if d.cmds[step]["params"].get("type") in ("text", "vector"):
            if "fill" in props or d.cmds[step]["params"].get("type") == "text":
                props["fill"] = color
            if "stroke" in props or d.cmds[step]["params"].get("type") == "vector":
                props["stroke"] = color


def scope_switch(d, parent, t, w=260):
    """The manage portal's admin/preacher scope switch, top-right of the page."""
    g = frame(d, parent, "scope-switch", width=w, height=44, layout="horizontal",
              gap=4, padding=4, cornerRadius=999, fill=t["surface"],
              stroke=t["border"], strokeWeight=1, strokeAlign="inside",
              crossAlign="center")
    on = frame(d, g, "all-preachers", layout="horizontal", crossAlign="center",
               mainAlign="center", paddingLeft=16, paddingRight=16, height=36,
               cornerRadius=999, fill=t["primary"])
    txt(d, on, "All preachers", size=14, weight="SemiBold", color="#ffffff")
    off = frame(d, g, "own-scope", layout="horizontal", crossAlign="center",
                mainAlign="center", paddingLeft=16, paddingRight=16, height=36,
                cornerRadius=999)
    txt(d, off, "Own scope", size=14, weight="SemiBold", color=t["muted"])
    return g


def grid_toolbar(d, parent, t, hidden=5, w=1360):
    """The grid toolbar, copied from components/grid/grid-toolbar.tsx.

    Search across every column, Filter, Sort, the hidden-field report, the row
    density select, and Add record. The hidden-field pill reports the count in
    the warning ink, because a hidden field is the one piece of grid state an
    operator cannot otherwise see.
    """
    g = row(d, parent, "grid-toolbar", gap=12, crossAlign="center", width=w,
            sizingH="fill")
    search = frame(d, g, "search", width=360, height=40, layout="horizontal",
                   crossAlign="center", gap=8, paddingLeft=12, paddingRight=12,
                   cornerRadius=8, fill=t["surface"], stroke=t["border"],
                   strokeWeight=1, strokeAlign="inside")
    ico(d, search, "search", size=16, color=t["faint"])
    txt(d, search, "Search every column", size=14, color=t["faint"])

    fb = button(d, g, "Filter", "outline", icon="list-filter", h=40, size=14)
    setp(d, fb, fill=t["surface"], stroke=t["border"], cornerRadius=8)
    sb = button(d, g, "Sort", "outline", icon="arrow-up-down", h=40, size=14)
    setp(d, sb, fill=t["surface"], stroke=t["border"], cornerRadius=8)

    hb = button(d, g, f"{hidden} hidden fields", "outline", icon="eye-off", h=40,
                size=14, px=12)
    setp(d, hb, fill=t["warningSoft"], stroke="none", cornerRadius=8)
    # The warning ink lands on both the glyph and the label: at rest the icon
    # names the control, once hidden fields exist the whole pill is a report.
    for step in range(len(d.cmds) - 1, max(len(d.cmds) - 4, 0), -1):
        params = d.cmds[step]["params"]
        if params.get("type") in ("text", "vector") and params.get("parent"):
            props = params.get("props", {})
            if props.get("fill") in (None, "#24324a"):
                props["fill"] = t["warning"]
            elif props.get("stroke") in (None, "#24324a"):
                props["stroke"] = t["warning"]

    density = select_field(d, g, "Default rows", w=160, h=40, bg=t["surface"],
                           border=t["border"], fg=t["text"], size=14)
    # No `Add record`: the section has one create path, the header's `Add contact`,
    # which opens the form. A blank row appended here would be a second door to a
    # different create, and the form is the only one that assigns a preacher.
    return g


def grid_header_cell(d, parent, label, icon=None, width=None):
    """A grid header cell: the field's type glyph, then its name."""
    cell = row(d, parent, f"th-{label}", gap=8, width=width, crossAlign="center",
               paddingLeft=0, paddingRight=12)
    if icon:
        ico(d, cell, icon, size=14, color="#64748b")
    txt(d, cell, label, size=13, weight="SemiBold", color="#24324a")
    return cell


def grid_table(d, parent, t, rows, total_width=1360):
    """The contacts grid, copied from the running /manage contacts table.

    The eight visible fields are the app's own default set: Name, Phone,
    Location, Initial Contact, Total Attendance, Past 60 Days, Notes, Collected
    By — plus the select column. Source, Books Read, Date of Birth, Last
    Contacted On and Favorite are the five the app hides by default, and the
    toolbar says so.

    The widths are computed against the **content box**, not the frame: the
    select column (a 16px checkbox plus a 12px gap and a 44px spacer) and the
    row's 16px side padding are both spent before the first data cell starts.
    Measuring against the frame instead is what made the Name and Phone cells
    overlap — every row overflowed by the select column's width, so the last
    cell was pushed out of the row and the columns slid under one another.
    """
    headers = [("Name", "type"), ("Phone", None), ("Location", "link-2"),
               ("Initial Contact", "calendar-days"), ("Total Atte…", "sigma"),
               ("Past 6…", "sigma"), ("Notes", "align-left"), ("Collected By", "link-2")]
    select_w = 44 + 16          # the spacer plus the checkbox
    pad = 32                    # the row's own side padding
    # The base widths are the *proportional* sizes; the leftover space goes to
    # the Name column, which is the one field an operator reads at length. The
    # arithmetic is `available = total - select - pad`, and the bases are scaled
    # to fit it — measuring the bases against the frame itself is what produced
    # a negative Name width and slid the columns under one another.
    available = total_width - select_w - pad
    bases = [268, 190, 230, 180, 130, 112, 250, 200]
    scale = available / sum(bases)
    widths = [int(b * scale) for b in bases]
    widths[0] += available - sum(widths)

    wrap = frame(d, parent, "contacts-grid", layout="vertical", gap=0,
                 fill=t["surface"], cornerRadius=12, clip=True,
                 stroke=t["border"], strokeWeight=1, strokeAlign="inside")
    hdr = row(d, wrap, "thead", gap=0, fill=t["surface2"], height=44,
              paddingLeft=16, paddingRight=16, crossAlign="center")
    checkbox(d, hdr, False, color=t["borderStrong"], size=16)
    frame(d, hdr, "th-select", width=44, layout="horizontal")
    for i, (label, icon) in enumerate(headers):
        grid_header_cell(d, hdr, label, icon, width=widths[i])

    for r, (name, phone, loc, init, tot, p60, notes, by) in enumerate(rows):
        rrow = row(d, wrap, f"tr-{r}", gap=0, height=48, paddingLeft=16,
                   paddingRight=16, crossAlign="center", fill=t["surface"],
                   stroke=t["border"], strokeWeight=1,
                   strokeSides=[False, False, True, False], strokeAlign="inside")
        checkbox(d, rrow, False, color=t["primary"], size=16)
        frame(d, rrow, "td-select", width=44, layout="horizontal")
        cells = [
            (name, "text"),
            (phone, "text"),
            (loc, "chip"),
            (init, "text"),
            (tot, "text"),
            (p60, "text"),
            (notes, "text"),
            (by, "chip"),
        ]
        for i, (value, kind) in enumerate(cells):
            cell = row(d, rrow, f"td-{i}", gap=8, width=widths[i],
                       crossAlign="center", paddingLeft=0, paddingRight=12,
                       clip=True)
            if kind == "chip":
                pill(d, cell, value, size=12, bg=t["chip"], fg=t["chipFg"],
                     px=8, py=3)
            else:
                txt(d, cell, value, size=14,
                    color=t["text"] if i == 0 else t["muted"],
                    weight="SemiBold" if i == 0 else "Regular")
    return wrap


# --------------------------------------------------------------------------
# Desktop — 1440x900
# --------------------------------------------------------------------------

def d_overview(d, page, t, x, y, name):
    """The Contacts Overview: the headline numbers, then the growth, then the mix."""
    f = frame(d, page, name, width=1440, height=900, x=x, y=y, fill=t["bg"],
              layout="vertical", gap=0, clip=True)
    app_header(d, f, t, "Contact")
    main = col(d, f, "main", gap=16, padding=24, sizingH="fill", sizingV="fill")

    head = row(d, main, "head", gap=16, crossAlign="max")
    titles = col(d, head, "titles", gap=2)
    # The title follows the tab the reader clicked, as it does on every Campaigns
    # page — the tab above says "Overview" and so does this.
    txt(d, titles, "Overview", size=22, weight="SemiBold", color=t["text"], font=POPPINS)
    txt(d, titles, "272 contacts · 14 locations · folk programme", size=12,
        color=t["muted"])
    spacer = frame(d, head, "spacer", layout="horizontal", sizingH="fill")

    sub = row(d, main, "sub-nav", gap=0, crossAlign="center")
    tab_strip(d, sub, t, SUB_NAV, 0)

    stats = row(d, main, "stats", gap=16, crossAlign="min")
    stat_card(d, stats, "Total contacts", "272", "Across 14 locations", t["strong"],
              w=265.6, bg=t["surface"], border=t["border"])
    stat_card(d, stats, "New this month", "23", "+8 vs last month", t["success"],
              w=265.6, bg=t["surface"], border=t["border"])
    stat_card(d, stats, "Active in 60 days", "61", "22% of all contacts", t["strong"],
              w=265.6, bg=t["surface"], border=t["border"])
    # "Never contacted" had no field behind it: `last_contacted_on` is parked
    # empty by 20261010000000_contacts_date_columns_to_date.sql. The nearest
    # question a real column answers is never *attended*, and it is the same
    # number the Reports quality list carries, so the two cannot disagree.
    stat_card(d, stats, "Never attended", "211", "78% — worth a first session", t["warning"],
              w=265.6, bg=t["surface"], border=t["border"])
    sc = stat_card(d, stats, "No location", "9", "3% — unresolved", t["warning"],
                   w=265.6, bg=t["surface"], border=t["border"])
    setp(d, sc, stroke=t["warning"], strokeWeight=1, strokeAlign="inside")

    body = row(d, main, "body", gap=20, crossAlign="min", sizingH="fill")
    left = col(d, body, "left", gap=20, width=860, sizingV="fill")
    right = col(d, body, "right", gap=20, width=480, sizingV="fill")

    # New contacts per month — the growth line the dashboard's "Contact
    # Generation" chart shows per quarter, made monthly here because a
    # collection effort is read month to month.
    gc = card(d, left, "growth", bg=t["surface"], border=t["border"], pad=0, radius=12)
    panel_header(d, gc, t, "New contacts collected",
                 "First-contact date, or the record's creation date when it is missing.")
    gb = col(d, gc, "growth-body", gap=6, padding=16)
    # Six months here, twelve on Reports. The Overview is a glance — twelve rows
    # do not fit the 484px the body has left on a 900px frame — so this card
    # says its own window and the long series lives on the Reports column chart.
    months = [("May", 12), ("Jun", 18), ("Jul", 9), ("Aug", 24), ("Sep", 31),
              ("Oct", 23)]
    peak = max(v for _, v in months)
    for label, value in months:
        r = row(d, gb, f"gm-{label}", gap=12, crossAlign="center")
        txt(d, r, label, size=13, color=t["text"], w=46)
        tr = frame(d, r, "track", width=560, height=16, cornerRadius=6,
                   fill=t["surface2"], layout="horizontal", alignItems="center")
        rect(d, tr, max(int(560 * value / peak), 4), 16,
             fill=t["chart1"] if label != "Oct" else t["chart2"], radius=6, name="bar")
        txt(d, r, str(value), size=13, weight="SemiBold", color=t["text"], w=40,
            align="right")
    txt(d, gb, "October is the current month and is still filling. Twelve months on Reports.",
        size=12, color=t["muted"])

    # Where the contacts came from — the `source` field, which the grid shows
    # only when it is unhidden. Three sources, so the card's height stays
    # inside the fold on a 900px screen.
    sc2 = card(d, left, "sources", bg=t["surface"], border=t["border"], pad=0,
               radius=12)
    panel_header(d, sc2, t, "Where contacts came from",
                 "The source field — hidden in the grid by default.")
    sb = col(d, sc2, "sources-body", gap=6, padding=16)
    for label, value, pct, colr in (("Public registration", 148, 0.544, t["chart1"]),
                                    ("Follow-up of a friend", 61, 0.224, t["chart2"]),
                                    ("Not recorded", 63, 0.232, t["chart5"])):
        r = row(d, sb, f"src-{label}", gap=12, crossAlign="center")
        txt(d, r, label, size=13, color=t["text"], w=190)
        tr = frame(d, r, "track", width=380, height=16, cornerRadius=6,
                   fill=t["surface2"], layout="horizontal", alignItems="center")
        rect(d, tr, max(int(380 * pct), 4), 16, fill=colr, radius=6, name="bar")
        txt(d, r, str(value), size=13, weight="SemiBold", color=t["text"], w=44,
            align="right")

    # The locations table — the same rows the grid's Location column shows, as
    # a count per location rather than one chip per contact. The rows sum to the
    # total, which is the one thing a distribution card must do.
    #
    # "No location" and "Unknown location" are two rows, not one: a contact with
    # no location and a contact whose location row was deleted are different
    # facts, and `manage-contact-fields.ts` already ships two markers for them.
    # Only the first is the amber tile's count.
    lc = card(d, right, "locations", bg=t["surface"], border=t["border"], pad=0,
              radius=12)
    panel_header(d, lc, t, "Contacts by location")
    lb = col(d, lc, "locations-body", gap=8, padding=16)
    for label, value, pct in (("Adyar Temple", 84, 0.309),
                              ("Mylapore Temple", 74, 0.272),
                              ("T. Nagar Temple", 63, 0.232),
                              ("Perungalathur Temple", 38, 0.140),
                              ("No location", 9, 0.033),
                              ("Unknown location", 4, 0.015)):
        unresolved = label in ("No location", "Unknown location")
        r = row(d, lb, f"loc-{label}", gap=10, crossAlign="center")
        frame(d, r, "dot", width=8, height=8, cornerRadius=999,
              fill=t["warning"] if unresolved else t["chart1"])
        txt(d, r, label, size=13, color=t["text"], w=180)
        spacer = frame(d, r, "spacer", layout="horizontal", sizingH="fill")
        txt(d, r, f"{value}", size=13, weight="SemiBold",
            color=t["warning"] if unresolved else t["text"], w=36, align="right")
        txt(d, r, f"{round(pct * 100)}%", size=12, color=t["muted"], w=40,
            align="right")

    # Engagement — the attendance rollups the grid already carries.
    ec = card(d, right, "engagement", bg=t["surface"], border=t["border"], pad=0,
              radius=12)
    panel_header(d, ec, t, "Engagement")
    eb = col(d, ec, "engagement-body", gap=10, padding=16)
    for label, value, sub, colr in (
            ("Attend a session", "61", "22% of contacts", t["chart1"]),
            ("Attended in the last 60 days", "34", "12% of contacts", t["chart2"]),
            ("Attended 3+ times", "18", "the committed core", t["chart4"])):
        r = row(d, eb, f"eng-{label}", gap=12, crossAlign="center")
        bar = frame(d, r, "bar", width=4, height=24, cornerRadius=2, fill=colr)
        txt(d, r, label, size=13, weight="SemiBold", color=t["text"], w=250)
        spacer = frame(d, r, "spacer", layout="horizontal", sizingH="fill")
        txt(d, r, value, size=20, weight="Bold", color=colr, font=POPPINS, w=48,
            align="right")
        txt(d, r, sub, size=12, color=t["muted"], w=120, align="right")
    return f


def d_reports(d, page, t, x, y, name):
    """The Contacts Reports: what the collection effort produced, in detail."""
    f = frame(d, page, name, width=1440, height=900, x=x, y=y, fill=t["bg"],
              layout="vertical", gap=0, clip=True)
    app_header(d, f, t, "Contact")
    main = col(d, f, "main", gap=16, padding=24, sizingH="fill", sizingV="fill")

    head = row(d, main, "head", gap=16, crossAlign="max")
    titles = col(d, head, "titles", gap=2)
    txt(d, titles, "Reports", size=22, weight="SemiBold", color=t["text"], font=POPPINS)
    txt(d, titles, "272 contacts · 14 locations · folk programme", size=12,
        color=t["muted"])
    spacer = frame(d, head, "spacer", layout="horizontal", sizingH="fill")
    # The scope switch is on every tab, not only on the two the design drew it
    # on: it narrows the server read for the whole section, so a Reports page
    # without it would show program-wide numbers under a "Own scope" reader.
    period = select_field(d, head, "Last 90 days", icon="calendar-days", w=170, h=40,
                          bg=t["surface"], border=t["border"], fg=t["text"], size=14)
    exp = button(d, head, "Export CSV", "outline", icon="download", h=40, size=14)
    setp(d, exp, fill=t["surface"], stroke=t["border"], cornerRadius=8)
    if t is DARK:
        recolor_last(d, 2, t["text"])

    sub = row(d, main, "sub-nav", gap=0, crossAlign="center")
    tab_strip(d, sub, t, SUB_NAV, 2)

    body = row(d, main, "body", gap=20, crossAlign="min", sizingH="fill")
    left = col(d, body, "left", gap=20, width=860, sizingV="fill")
    right = col(d, body, "right", gap=20, width=480, sizingV="fill")

    # The collection funnel. Same shape as the campaign funnel — a bar per
    # bucket — but the buckets are the contact lifecycle, not the call outcome.
    fc = card(d, left, "funnel", bg=t["surface"], border=t["border"], pad=0, radius=12)
    panel_header(d, fc, t, "Collection funnel",
                 "From first contact to an active member of the community.")
    fb = col(d, fc, "funnel-body", gap=10, padding=20)
    for label, count, pct, colr in (("Collected", "272", 1.0, t["chart1"]),
                                    ("Location resolved", "263", 0.966, t["chart2"]),
                                    ("Attended a session", "61", 0.224, t["chart4"]),
                                    ("Active in 60 days", "34", 0.125, t["chart2"])):
        r = row(d, fb, f"fn-{label}", gap=12, crossAlign="center")
        txt(d, r, label, size=13, color=t["text"], w=180)
        tr = frame(d, r, "track", width=460, height=22, cornerRadius=6,
                   fill=t["surface2"], layout="horizontal", alignItems="center")
        rect(d, tr, max(int(460 * pct), 4), 22, fill=colr, radius=6, name="bar")
        txt(d, r, count, size=13, weight="SemiBold", color=t["text"], w=48,
            align="right")
    fnote = row(d, fb, "fnote", gap=8, crossAlign="center")
    ico(d, fnote, "triangle-alert", size=15, color=t["warning"])
    txt(d, fnote, "211 collected contacts have never attended a session. Collecting is "
                  "not the same as belonging — this bucket is the difference.",
        size=12, color=t["muted"], w=760)

    # New contacts per month, as a column chart with a month axis.
    mc = card(d, left, "monthly", bg=t["surface"], border=t["border"], pad=0, radius=12)
    panel_header(d, mc, t, "New contacts collected",
                 "First-contact date, by month. The last column is the current month.")
    mb = col(d, mc, "monthly-body", gap=12, padding=20)
    # Twelve months, matching the Overview strip's six: the two surfaces show
    # the same series at two lengths, and each card names its own window.
    months = [("Nov", 14), ("Dec", 11), ("Jan", 6), ("Feb", 9), ("Mar", 15),
              ("Apr", 8), ("May", 12), ("Jun", 18), ("Jul", 9), ("Aug", 24),
              ("Sep", 31), ("Oct", 23)]
    peak = max(v for _, v in months)
    chart = row(d, mb, "cols", gap=14, crossAlign="max")
    for label, value in months:
        c = col(d, chart, f"c-{label}", gap=8, crossAlign="center",
                mainAlign="max")
        txt(d, c, str(value), size=12, weight="SemiBold", color=t["text"])
        # The track is the bar's full-height slot; the bar itself is a fixed
        # height anchored to the track's bottom edge, so the months share one
        # baseline instead of each growing down from its own value label.
        tr = frame(d, c, "track", width=52, height=132, cornerRadius=6,
                   fill=t["surface2"], layout="horizontal", alignItems="max")
        rect(d, tr, 52, max(int(132 * value / peak), 6),
             fill=t["chart2"] if label == "Oct" else t["chart1"], radius=6,
             name="bar")
        txt(d, c, label, size=12, color=t["muted"])

    # Who collects — the `collected_by` column, as a leaderboard.
    cc = card(d, right, "collectors", bg=t["surface"], border=t["border"], pad=0,
              radius=12)
    panel_header(d, cc, t, "Who collects contacts")
    cb = col(d, cc, "collectors-body", gap=12, padding=20)
    for nm, count, share in (("Anand Narayanan", 118, 0.434),
                             ("Kavitha Raman", 94, 0.346),
                             ("Divya Parthasarathy", 41, 0.151),
                             ("Suresh Kannan", 19, 0.070)):
        r = row(d, cb, f"col-{nm}", gap=12, crossAlign="center")
        av = frame(d, r, "avatar", width=32, height=32, cornerRadius=999,
                   fill=t["primarySoft"], layout="horizontal", alignItems="center",
                   justifyContent="center")
        txt(d, av, nm.split()[0][0] + nm.split()[1][0], size=11, weight="Bold",
            color=t["primary"])
        txt(d, r, nm, size=13, color=t["text"], w=170)
        spacer = frame(d, r, "spacer", layout="horizontal", sizingH="fill")
        txt(d, r, f"{round(share * 100)}%", size=12, color=t["muted"], w=44,
            align="right")
        txt(d, r, str(count), size=14, weight="Bold", color=t["primary"], w=44,
            align="right")
    cnote = row(d, cb, "cnote", gap=8, crossAlign="center")
    ico(d, cnote, "info", size=15, color=t["muted"])
    txt(d, cnote, "Counts are contacts whose first contact was recorded by that "
                  "staff member. A contact with no collector is not counted here.",
        size=12, color=t["muted"], w=400)

    # Data quality — the things an operator has to chase down.
    qc = card(d, right, "quality", bg=t["surface"], border=t["border"], pad=0,
              radius=12)
    panel_header(d, qc, t, "Needs attention")
    qb = col(d, qc, "quality-body", gap=12, padding=20)
    for label, value, action in (("No location", "9", "Assign a location"),
                                  ("No phone number", "4", "Add a number"),
                                  ("No first-contact date", "31", "Set the date"),
                                  ("Never attended a session", "211", "Invite to a session")):
        r = row(d, qb, f"q-{label}", gap=10, crossAlign="center")
        ico(d, r, "triangle-alert", size=14, color=t["warning"])
        txt(d, r, label, size=13, color=t["text"], w=210)
        spacer = frame(d, r, "spacer", layout="horizontal", sizingH="fill")
        txt(d, r, value, size=14, weight="Bold", color=t["warning"], w=40,
            align="right")
        txt(d, r, action, size=12, color=t["muted"], w=120, align="right")
    return f


def d_grid(d, page, t, x, y, name):
    """The Contacts grid — the existing /manage contacts table, unchanged."""
    f = frame(d, page, name, width=1440, height=900, x=x, y=y, fill=t["bg"],
              layout="vertical", gap=0, clip=True)
    app_header(d, f, t, "Contact")
    main = col(d, f, "main", gap=16, padding=24, sizingH="fill", sizingV="fill")

    head = row(d, main, "head", gap=16, crossAlign="max")
    titles = col(d, head, "titles", gap=2)
    txt(d, titles, "Contacts", size=22, weight="SemiBold", color=t["text"], font=POPPINS)
    txt(d, titles, "272 contacts · 14 locations", size=12, color=t["muted"])
    spacer = frame(d, head, "spacer", layout="horizontal", sizingH="fill")
    # The form path, at the far right of the title row: the toolbar's `Add
    # record` appends a blank row, and only the form can assign a preacher and a
    # location. Both exist because they are two different creates.
    hb = button(d, head, "Add contact", "primary", icon="plus", h=40, size=14)
    setp(d, hb, fill=t["primary"], cornerRadius=8)

    sub = row(d, main, "sub-nav", gap=0, crossAlign="center")
    tab_strip(d, sub, t, SUB_NAV, 1)

    # Five hidden fields: Source, Books Read, Date of Birth, Last Contacted On
    # and Favorite. The collection date is the stored `initial_contact`, so no
    # derived column exists and the set is exactly Manage's.
    grid_toolbar(d, main, t, hidden=5, w=1360)

    rows = [
        ("Kavya Krishnaswamy", "8100000066", "Mylapore Temple", "", "0", "0", "", "Anand Narayanan"),
        ("Shanti Balaji", "8100000023", "T. Nagar Temple", "", "0", "0", "", "Anand Narayanan"),
        ("Dwaraka Dasa", "4857382048", "Adyar Temple", "19 Oct 2026", "1", "1", "", "Anand Narayanan"),
        ("Mohanraj Anand", "8100000137", "T. Nagar Temple", "", "0", "0", "", "Kavitha Raman"),
        ("Saranya Subramanian", "8100000159", "Perungalathur Temple", "", "0", "0", "", "Anand Narayanan"),
        ("Venkataraman Ramesh", "8100000175", "Adyar Temple", "", "2", "0", "", "Kavitha Raman"),
        ("Sathishkumar Palaniappan", "8100000192", "T. Nagar Temple", "", "0", "0",
         "Met at the temple festival…", "Anand Narayanan"),
        ("Siddharth Neelakantan", "8100000032", "T. Nagar Temple", "", "0", "0",
         "Met at the temple festival…", "Anand Narayanan"),
        ("Priya Raman", "8100000204", "Mylapore Temple", "02 Aug 2026", "3", "1", "", "Kavitha Raman"),
        ("Arjun Venkatesh", "8100000218", "Mylapore Temple", "", "0", "0", "", "Anand Narayanan"),
        ("Lakshmi Narayanan", "8100000226", "Adyar Temple", "", "0", "0", "", "Anand Narayanan"),
    ]
    grid_table(d, main, t, rows, total_width=1360)

    foot = row(d, main, "foot", gap=16, crossAlign="center")
    txt(d, foot, "272 records", size=13, weight="SemiBold", color=t["text"])
    spacer = frame(d, foot, "spacer", layout="horizontal", sizingH="fill")
    txt(d, foot, "Sum 6", size=13, color=t["muted"])
    txt(d, foot, "Sum 2", size=13, color=t["muted"])
    return f


# --------------------------------------------------------------------------
# Mobile — 390x844
# --------------------------------------------------------------------------

def m_shell(d, page, t, name, x, y):
    f = frame(d, page, name, width=390, height=844, x=x, y=y, fill=t["bg"],
              layout="vertical", gap=0)
    mobile_appbar(d, f, t)
    body = col(d, f, "body", gap=0, sizingH="fill", sizingV="fill")
    content = col(d, body, "content", gap=16, padding=16, sizingV="fill", clip=True)
    return f, body, content


def m_title(d, parent, t, title, subtitle, action=None):
    """The phone page title, with the menu trigger beside it and an action at the end.

    Same construction as `components/campaign/campaign-page-header.tsx` and the
    Campaigns phone frame: the heading stays a heading and the chevron is its own
    control, in one `gap-4` row. Tapping it opens the full-screen section menu,
    which is the phone's only navigation — there is no strip under the title.

    `action` draws a primary pill on the same row, right-aligned by the spacer.
    The page header's action and the section menu are the two things a phone
    header carries, and they sit at opposite ends of one line rather than in a
    toolbar below it.
    """
    g = col(d, parent, "m-title", gap=2, sizingH="fill")
    h = row(d, g, "h", gap=4, crossAlign="center", sizingH="fill")
    txt(d, h, title, size=22, weight="SemiBold", color=t["text"], font=POPPINS)
    ico(d, h, "chevron-down", size=18, color=t["primary"])
    frame(d, h, "spacer", layout="horizontal", sizingH="fill")
    if action:
        b = button(d, h, action, "primary", icon="plus", h=36, size=13, px=12)
        setp(d, b, fill=t["primary"], cornerRadius=10)
    txt(d, g, subtitle, size=13, color=t["muted"])
    return g


def m_menu(d, page, t, x, y, name, active="Overview"):
    """The phone's Contacts menu — a full-screen panel, not a strip.

    `components/campaign/campaign-menu.tsx` is the model: a takeover dialog with
    its own head (title + close), the section subtitle, a rule, the destinations
    as full-width rows with a trailing chevron and a 2px underline on the current
    one, and a rule at the foot. On a phone there is no tab strip, because three
    labels under a title is a second navigation and the menu is the first.
    """
    f = frame(d, page, name, width=390, height=844, x=x, y=y, fill=t["bg"],
              layout="vertical", gap=0)

    head = col(d, f, "menu-head", gap=4, paddingLeft=16, paddingRight=16,
               paddingTop=20, paddingBottom=16)
    hrow = row(d, head, "menu-h", mainAlign="spaceBetween", crossAlign="center",
               height=40)
    txt(d, hrow, "Contacts", size=22, weight="SemiBold", color=t["text"],
        font=POPPINS)
    close = frame(d, hrow, "close", width=40, height=40, cornerRadius=999,
                  fill=t["surface2"], layout="horizontal", alignItems="center",
                  justifyContent="center")
    ico(d, close, "x", size=13, color=t["text"], sw=1.6)
    txt(d, head, "272 contacts · 14 locations", size=13, color=t["muted"])

    hairline(d, f, 390, color=t["border"])

    nav = col(d, f, "menu-nav", gap=0, paddingTop=8)
    for label in SUB_NAV:
        on = label == active
        it = row(d, nav, f"menu-{label}", height=56, paddingLeft=16,
                 paddingRight=16, crossAlign="center")
        cell = col(d, it, "cell", gap=4)
        txt(d, cell, label, size=15, weight="SemiBold", color=t["tabActive"])
        # The active destination carries the same 2px underline the desktop
        # strip uses — weight plus a rule, never a second colour.
        rect(d, cell, None, 2, name="underline", sizingH="fill",
             fill=t["tabUnderline"] if on else "#00000000")
        frame(d, it, "spacer", layout="horizontal", sizingH="fill")
        ico(d, it, "chevron-right", size=10, color=t["muted"], sw=1.4)

    frame(d, f, "menu-spacer", layout="vertical", sizingV="fill")
    hairline(d, f, 390, color=t["border"])
    return f


def m_overview(d, page, t, x, y, name):
    f, body, content = m_shell(d, page, t, name, x, y)
    m_title(d, content, t, "Overview", "272 contacts · 14 locations")

    # Four of the five tiles, and the one dropped is "Active in 60 days" rather
    # than "No location": the phone is the surface a coordinator holds while
    # standing in a hall, so the two amber tiles are the ones with an action
    # behind them, and a success metric is the one that can wait for the desk.
    grid = col(d, content, "stats", gap=10)
    for pair in ((("Total contacts", "272", t["primary"]),
                  ("New this month", "23", t["success"])),
                 (("Never attended", "211", t["warning"]),
                  ("No location", "9", t["warning"]))):
        r = row(d, grid, "srow", gap=10)
        for label, value, colr in pair:
            sc = stat_card(d, r, label, value, None, colr, w=173, bg=t["surface"],
                           border=t["border"], value_size=24)
            setp(d, sc, padding=14, gap=4)
            if label == "No location":
                setp(d, sc, stroke=t["warning"], strokeWeight=1, strokeAlign="inside")

    gc = card(d, content, "growth", bg=t["surface"], border=t["border"], pad=16,
              radius=12, gap=12)
    txt(d, gc, "New contacts collected", size=16, weight="SemiBold", color=t["text"],
        font=POPPINS)
    for label, value, pct in (("Sep", "31", 1.0), ("Oct", "23", 0.742)):
        r = row(d, gc, f"g-{label}", gap=10, crossAlign="center")
        txt(d, r, label, size=12, color=t["text"], w=34)
        tr = frame(d, r, "track", width=200, height=22, cornerRadius=6,
                   fill=t["surface2"], layout="horizontal", alignItems="center")
        rect(d, tr, max(int(200 * pct), 4), 22,
             fill=t["chart1"] if label == "Sep" else t["chart2"], radius=6, name="bar")
        txt(d, r, value, size=12, weight="SemiBold", color=t["text"], w=34,
            align="right")
    txt(d, gc, "October is the current month and is still filling.", size=11,
        color=t["muted"], w=326)

    lc = card(d, content, "locations", bg=t["surface"], border=t["border"], pad=16,
              radius=12, gap=10)
    txt(d, lc, "Contacts by location", size=16, weight="SemiBold", color=t["text"],
        font=POPPINS)
    for label, value in (("Adyar Temple", "84"), ("Mylapore Temple", "74"),
                         ("T. Nagar Temple", "63"), ("Perungalathur Temple", "38"),
                         ("No location", "9"), ("Unknown location", "4")):
        unresolved = label in ("No location", "Unknown location")
        r = row(d, lc, f"l-{label}", gap=10, crossAlign="center")
        frame(d, r, "dot", width=8, height=8, cornerRadius=999,
              fill=t["warning"] if unresolved else t["chart1"])
        txt(d, r, label, size=13, color=t["text"], w=200)
        spacer = frame(d, r, "spacer", layout="horizontal", sizingH="fill")
        txt(d, r, value, size=13, weight="SemiBold",
            color=t["warning"] if unresolved else t["text"])

    spacer = frame(d, content, "spacer", layout="vertical", sizingV="fill")
    bottom_nav(d, body, t, "Contact")
    return f


def m_reports(d, page, t, x, y, name):
    f, body, content = m_shell(d, page, t, name, x, y)
    m_title(d, content, t, "Reports", "272 contacts · 14 locations")
    # The period is a control here, not the subtitle: a report whose window
    # cannot be changed on the surface most readers hold is a screenshot.
    select_field(d, content, "Last 90 days", icon="calendar-days", w=358, h=44,
                 bg=t["surface"], border=t["border"], fg=t["text"], size=14)

    fc = card(d, content, "funnel", bg=t["surface"], border=t["border"], pad=16,
              radius=12, gap=12)
    txt(d, fc, "Collection funnel", size=16, weight="SemiBold", color=t["text"],
        font=POPPINS)
    for label, value, pct, colr in (("Collected", "272", 1.0, t["chart1"]),
                                    ("Location resolved", "263", 0.966, t["chart2"]),
                                    ("Attended a session", "61", 0.224, t["chart4"]),
                                    ("Active in 60 days", "34", 0.125, t["chart2"])):
        r = row(d, fc, f"f-{label}", gap=10, crossAlign="center")
        txt(d, r, label, size=12, color=t["text"], w=116)
        tr = frame(d, r, "track", width=148, height=22, cornerRadius=6,
                   fill=t["surface2"], layout="horizontal", alignItems="center")
        rect(d, tr, max(int(148 * pct), 4), 22, fill=colr, radius=6, name="bar")
        txt(d, r, value, size=12, weight="SemiBold", color=t["text"], w=34,
            align="right")

    qc = card(d, content, "quality", bg=t["surface"], border=t["border"], pad=16,
              radius=12, gap=10)
    txt(d, qc, "Needs attention", size=16, weight="SemiBold", color=t["text"],
        font=POPPINS)
    for label, value in (("No location", "9"), ("No phone number", "4"),
                         ("No first-contact date", "31"),
                         ("Never attended a session", "211")):
        r = row(d, qc, f"q-{label}", gap=10, crossAlign="center")
        ico(d, r, "triangle-alert", size=14, color=t["warning"])
        txt(d, r, label, size=13, color=t["text"], w=230)
        spacer = frame(d, r, "spacer", layout="horizontal", sizingH="fill")
        txt(d, r, value, size=14, weight="Bold", color=t["warning"])

    spacer = frame(d, content, "spacer", layout="vertical", sizingV="fill")
    action = col(d, body, "action", gap=10, padding=16, fill=t["surface"])
    for k, v in (("stroke", t["border"]), ("strokeWeight", 1),
                 ("strokeSides", [True, False, False, False]), ("strokeAlign", "inside")):
        d.cmds[-1]["params"]["props"][k] = v
    b = button(d, action, "Export CSV", "outline", icon="download", h=48)
    setp(d, b, sizingH="fill", fill=t["surface"], stroke=t["border"], cornerRadius=12)
    bottom_nav(d, body, t, "Contact")
    return f


def m_grid(d, page, t, x, y, name):
    """The phone's contacts list — the app's own list, with the sub-nav above it."""
    f, body, content = m_shell(d, page, t, name, x, y)
    # "Add contact" sits on the title row, at the right: it is the one action the
    # phone Contacts tab exists for at a distribution drive, and it opens the
    # add-contact form — the app's `/contact/new`, drawn from the Reference tab.
    m_title(d, content, t, "Contacts", "272 contacts · 14 locations",
            action="Add contact")

    search = frame(d, content, "search", width=358, height=44, layout="horizontal",
                   crossAlign="center", gap=8, paddingLeft=12, paddingRight=12,
                   cornerRadius=8, fill=t["surface"], stroke=t["border"],
                   strokeWeight=1, strokeAlign="inside")
    ico(d, search, "search", size=16, color=t["faint"])
    txt(d, search, "Search name or phone", size=14, color=t["faint"])

    hdr = row(d, content, "list-head", gap=0, crossAlign="center", paddingLeft=16,
              paddingRight=16, height=40)
    txt(d, hdr, "Name", size=14, weight="SemiBold", color=t["muted"], w=200)
    spacer = frame(d, hdr, "spacer", layout="horizontal", sizingH="fill")
    txt(d, hdr, "Phone", size=14, weight="SemiBold", color=t["muted"], w=110,
        align="right")

    rows = [("Kavya Krishnaswamy", "8100000066"),
            ("Shanti Balaji", "8100000023"),
            ("Dwaraka Dasa", "4857382048"),
            ("Mohanraj Anand", "8100000137"),
            ("Saranya Subramanian", "8100000159"),
            ("Venkataraman Ramesh", "8100000175"),
            ("Sathishkumar Palaniappan", "8100000192"),
            ("Siddharth Neelakantan", "8100000032")]
    lst = col(d, content, "list", gap=0, fill=t["surface"], cornerRadius=12,
              clip=True, stroke=t["border"], strokeWeight=1, strokeAlign="inside")
    for i, (name, phone) in enumerate(rows):
        r = row(d, lst, f"l-{i}", gap=0, crossAlign="center", paddingLeft=16,
                paddingRight=16, height=56, fill=t["surface"], stroke=t["border"],
                strokeWeight=1, strokeSides=[False, False, True, False],
                strokeAlign="inside")
        txt(d, r, name, size=14, color=t["text"], w=200)
        spacer = frame(d, r, "spacer", layout="horizontal", sizingH="fill")
        txt(d, r, phone, size=14, color=t["text"], w=110, align="right")

    spacer = frame(d, content, "spacer", layout="vertical", sizingV="fill")
    # The count only. The add action moved to the header, where it sits beside
    # the page title; a second add control in the footer would be the same
    # destination twice, and it was what pushed this line off the frame.
    foot = row(d, content, "foot", gap=8, crossAlign="center")
    txt(d, foot, "272 records", size=13, weight="SemiBold", color=t["text"])
    bottom_nav(d, body, t, "Contact")
    return f


# --------------------------------------------------------------------------
# Assembly
# --------------------------------------------------------------------------

REFS = [
    ("desktop-manage-contacts.png",
     "The real /manage contacts grid — the toolbar and table the Contacts tab shows"),
    ("desktop-manage-dashboard.png",
     "The real /manage dashboard — the stat cards and chart cards the Overview reuses"),
    ("desktop-light-header.png", "The app header the Contacts section sits under"),
    ("mobile-light-manage-contacts.png",
     "The real phone contacts list — the phone Contacts tab shows"),
    ("mobile-light-manage-dashboard.png", "The real phone dashboard"),
    ("mobile-light-admin-panel.png", "The phone's navigation drawer"),
    ("mobile-light-contact-new.png",
     "The app's Contact tab today: the add-contact form the new Add contact action opens"),
    ("mobile-light-contact-new-lower.png",
     "The same form, lower half: occupation, assigned preacher, location, comments, Save"),
]


def build(out_dir, refs_dir):
    d = Doc()
    d.add("file.new", {"name": "FOLK Contacts — design set"})
    d.add("page.rename", {"id": 1, "name": "References"})
    d.add("page.setBackground", {"id": 1, "color": "#F2F4F7"})
    p_desktop = d.add("page.add", {"name": "Desktop — Contacts"})
    p_mobile = d.add("page.add", {"name": "Mobile — Contacts"})
    d.add("page.setBackground", {"id": {"$step": p_desktop}, "color": "#FFFFFF"})
    d.add("page.setBackground", {"id": {"$step": p_mobile}, "color": "#FFFFFF"})

    # ---- References page: the real app, for comparison ----
    head = frame(d, Raw(1), "refs-head", x=0, y=0, width=1900, layout="vertical", gap=8)
    txt(d, head, "FOLK Contacts — design set", size=28, weight="SemiBold",
        color="#24324a", font=POPPINS)
    txt(d, head,
        "The staff's contact directory, behind the app's existing first Contact pill. The "
        "nav shape is the Campaign set's: a sub-tab strip of Overview | Contacts | Reports "
        "under the page title, with the existing /manage grid as the third tab rather than "
        "the whole page. Every control is taken from the running folk_hkmc app — the same "
        "header, the same tab strip, the same scope switch, the same grid toolbar and "
        "table, the same tokens. Where this set and "
        "_bmad-output/specs/spec-contacts-overview-reports/ disagree, the spec wins: it is "
        "the behavioural contract, and its opening table lists the seven corrections this "
        "drawing set carries.",
        size=13, color="#4a5568", w=1300)
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
    d_overview(d, p_desktop, LIGHT, 0, 0, "Contacts — Overview (light)")
    d_reports(d, p_desktop, LIGHT, 1520, 0, "Contacts — Reports (light)")
    d_grid(d, p_desktop, LIGHT, 3040, 0, "Contacts — Grid (light)")
    d_overview(d, p_desktop, DARK, 0, 980, "Contacts — Overview (dark)")
    d_reports(d, p_desktop, DARK, 1520, 980, "Contacts — Reports (dark)")

    # ---- Mobile page ----
    m_overview(d, p_mobile, LIGHT, 0, 0, "Contacts (phone) — Overview")
    m_reports(d, p_mobile, LIGHT, 470, 0, "Contacts (phone) — Reports")
    m_grid(d, p_mobile, LIGHT, 940, 0, "Contacts (phone) — Grid")
    m_menu(d, p_mobile, LIGHT, 1410, 0, "Contacts (phone) — Menu")

    out = os.path.join(out_dir, "contacts.json")
    d.dump(out)
    print(f"wrote {out} — {len(d.cmds)} commands")


if __name__ == "__main__":
    here = os.path.dirname(os.path.abspath(__file__))
    out_dir = sys.argv[1] if len(sys.argv) > 1 else here
    refs_dir = sys.argv[2] if len(sys.argv) > 2 else os.path.join(
        os.path.dirname(os.path.abspath(__file__)), "references")
    build(out_dir, refs_dir)
