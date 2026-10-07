# Design constraints for the `/manage` grid

`/manage` is an operator tool, not a marketing page. Most of what makes a dashboard look "designed" to a general audience — large type, generous padding, cards on cards, drop shadows — is what makes it unusable at Airtable density. These are prohibitions, not suggestions.

## Density

- Grid base font **13px**. Row labels outside the grid stay at the app's normal size.
- Default row height **32px**; a dense option at **28px**.
- Numeric columns use `tabular-nums` so digits align vertically and a column can be scanned by position rather than by reading each value.
- Column headers are sticky; the first column is frozen. Scrolling right must never lose the row's identity.

## Surface

- **No drop shadows on data surfaces.** Use a 1px border and background contrast instead.
- **No card-in-card nesting.** A table sits directly on the page background. One level of framing maximum.
- **One accent color**, reserved for selection and focus. If a second accent appears, it means two things are competing for the same signal.
- Rows separate with a hairline border, not alternating background stripes. Stripes fight with selection highlighting.

## Empty, loading, error

Every panel implements all three, and all three are visually distinct. This is the single highest-leverage rule in this file: it is what separates a tool that feels finished from a demo.

## Keyboard

Operators live in this screen. Minimum set:

| Key | Action |
|---|---|
| `j` / `k` | move down / up a row |
| `e` | edit the focused cell |
| `Enter` | commit |
| `Escape` | cancel |
| `Cmd`/`Ctrl` + `K` | command palette, including jump-to-table |

## What "attractive" means here

Not decoration. It means the operator can read a wide table without fatigue, find the row they want in seconds, and trust that what they see is current. Density, alignment, and honest state get you there. Whitespace does not.