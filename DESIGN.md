---
name: Rak Buku
description: Dark comic-reader PWA, cleanly executed. The page is the center; controls step aside.
colors:
  bg: "#0E0F12"
  surface: "#17191E"
  raised: "#1F2229"
  line: "#2A2E37"
  fg: "#F2F3F5"
  muted: "#A3A8B3"
  accent: "#3D7BFF"
  accent-fill: "#2A64E8"
  accent-fg: "#FFFFFF"
  ok: "#3DBE7A"
  danger: "#FF6B6B"
  light-bg: "#F5F6F8"
  light-surface: "#FFFFFF"
  light-raised: "#EEF0F4"
  light-line: "#DDE1E8"
  light-fg: "#12141A"
  light-muted: "#5C6270"
  light-accent: "#2A64E8"
  light-accent-fill: "#2257D0"
  light-ok: "#1E8E55"
  light-danger: "#D23B3B"
typography:
  display:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', Roboto, sans-serif"
    fontSize: "26px"
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', Roboto, sans-serif"
    fontSize: "20px"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.01em"
  title:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', Roboto, sans-serif"
    fontSize: "18px"
    fontWeight: 700
    lineHeight: 1.2
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', Roboto, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.45
  label:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', Roboto, sans-serif"
    fontSize: "15px"
    fontWeight: 600
    lineHeight: 1.45
    fontFeature: "tabular-nums"
  caption:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', Roboto, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.45
    fontFeature: "tabular-nums"
rounded:
  cover: "8px"
  control: "12px"
  toast: "14px"
  card: "16px"
  sheet: "20px"
  pill: "999px"
spacing:
  xs: "8px"
  sm: "12px"
  md: "16px"
  lg: "24px"
  touch: "44px"
components:
  button:
    backgroundColor: "{colors.raised}"
    textColor: "{colors.fg}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "10px 16px"
    height: "44px"
  button-primary:
    backgroundColor: "{colors.accent-fill}"
    textColor: "{colors.accent-fg}"
    rounded: "{rounded.control}"
    height: "44px"
  icon-btn:
    backgroundColor: "{colors.bg}"
    textColor: "{colors.fg}"
    rounded: "{rounded.pill}"
    size: "44px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.fg}"
    rounded: "{rounded.control}"
    padding: "10px 12px"
    height: "44px"
  tab:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.fg}"
    rounded: "{rounded.pill}"
    padding: "6px 16px"
    height: "44px"
  tab-on:
    backgroundColor: "{colors.fg}"
    textColor: "{colors.bg}"
    rounded: "{rounded.pill}"
  hero:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.fg}"
    rounded: "{rounded.card}"
    padding: "16px"
  cover:
    backgroundColor: "{colors.raised}"
    rounded: "{rounded.cover}"
  xfer-card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.fg}"
    rounded: "{rounded.control}"
    padding: "14px"
  sheet:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.fg}"
    rounded: "{rounded.sheet}"
    padding: "20px 16px"
  seg-on:
    backgroundColor: "{colors.accent-fill}"
    textColor: "{colors.accent-fg}"
    height: "44px"
  fab:
    backgroundColor: "{colors.accent-fill}"
    textColor: "{colors.accent-fg}"
    rounded: "{rounded.pill}"
    size: "56px"
  toast:
    backgroundColor: "{colors.raised}"
    textColor: "{colors.fg}"
    rounded: "{rounded.toast}"
    padding: "12px"
---

# Design System: Rak Buku

## Overview

**Creative North Star: "The Dimmed Reading Room"**

A comic-reader app for one owner, mostly on an iPhone at night. The page art is the brightest thing on screen; everything else is near-black, quiet, and one tap away. It is the category standard (a dark comic reader) executed cleanly, not a reinvention. Shinigami is the owner's reference for function and polish (prev/next chapter, auto-scroll, reading settings), not for look.

The system is deliberately small: three stacked dark surfaces, two text tones, one blue accent for actions and progress, system type, and one 1.75px line-icon family. Density is moderate and thumb-sized. There is no catalogue chrome, no ratings, no decoration.

Dark is the default. A light theme exists through `[data-theme="light"]`, chosen in the reading settings. The reader canvas stays pure black in dark and follows `--bg` in light.

**Key Characteristics:**
- Near-black ground with three tonal steps (bg, surface, raised) and a hairline border. No decorative shadows.
- One accent, split in two: text-safe `accent` and fill-safe `accent-fill`.
- System font, tabular numerals wherever a number can change.
- Every interactive target is at least 44px.
- Line icons only (24px viewBox, drawn at 22px, stroke 1.75).
- Reading progress is always a thin accent bar under a cover.

## Colors

A monochrome blue-black ladder with a single electric-blue voice. Semantic green and red appear only for status.

### Primary
- **Signal Blue** (`accent`, #3D7BFF dark, #2A64E8 light): text-grade accent. Focus ring, selection, current-chapter title and number, progress bar fill, busy dot, pressed-toggle outline, checkbox. Never a background behind white text.
- **Pressed Blue** (`accent-fill`, #2A64E8 dark, #2257D0 light): fill-grade accent for anything that carries `accent-fg` white text: primary button, active segment, auto-scroll on-state, FAB. It is darker than `accent` so white text keeps contrast. Do not swap the two.

### Neutral
- **Reading-Room Black** (`bg`, #0E0F12): page ground, sticky bar tint, text on an active tab.
- **Slate Surface** (`surface`, #17191E): hero, xfer cards, inputs, sheets, inactive tabs, reader bars.
- **Raised Slate** (`raised`, #1F2229): buttons, cover placeholder, segmented track, toast, hover on icon buttons.
- **Hairline** (`line`, #2A2E37): every border, list divider, progress track.
- **Paper White** (`fg`, #F2F3F5): primary text, and the active tab fill.
- **Quiet Gray** (`muted`, #A3A8B3): secondary text, placeholders, labels, finished-chapter titles.
- **Reader Black** (#000000, literal): reader backdrop in dark theme only.

### Status
- **Saved Green** (`ok`, #3DBE7A): downloaded/synced chips and the check icon.
- **Alert Coral** (`danger`, #FF6B6B): destructive button text.

Light theme values are the `light-*` tokens above; same roles, same names in CSS.

### Named Rules
**The Two-Blues Rule.** `accent` is for strokes and text on the dark ground; `accent-fill` is for solid areas that hold white text. A solid `accent` block with white text is a contrast bug.

**The One Voice Rule.** Blue marks action or progress, nothing else. Status uses green/coral, structure uses grays.

**The Inverted Tab Rule.** The selected tab flips to `fg` on `bg` rather than turning blue, so blue stays reserved for actions.

## Typography

**Font:** system stack, `-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, sans-serif` (`--font`). SF on iPhone, which is the main device. No webfonts, no separate display face.

**Character:** neutral, native, and quick to scan in the dark. Hierarchy comes from size and weight, with slight negative tracking on headings.

### Hierarchy
- **Display** (700, 26px, 1.15, -0.02em): `h1`, the Rak Buku title and page titles.
- **Headline** (700, 20px, 1.2, -0.01em): `h2`, hero title (clamped to 2 lines), section heads.
- **Title** (700, 18px): sheet heading. Transfer group heads drop to 16px in `muted`.
- **Body** (400, 16px, 1.45): base text and inputs.
- **Label** (600, 15px): buttons and tabs. Reader step buttons are 14px.
- **Caption** (400, 14px): `.muted`, field labels, reader position, segment labels. Chapter sub-lines 13px; shelf titles are 14px/600 and shelf meta 12px; chips 12px.

### Named Rules
**The Tabular Rule.** `.num`, `.muted`, `small`, and the reader position use `font-variant-numeric: tabular-nums`, so page numbers, percentages, and transfer progress do not jitter.

**The Two-Line Rule.** Hero and shelf titles clamp at 2 lines; transfer names and reader titles truncate on one line with an ellipsis.

## Layout

Single column, mobile first. `.page` is centered, max 1080px, 16px side padding, 120px bottom padding so the FAB never covers the last row. Safe-area insets are honored on `#app`, the sticky top bar, reader bars, FAB, sheets.

- **Shelf grid:** 3 equal columns on phones with gap 18px/12px. At 640px and up it becomes `auto-fill, minmax(150px, 1fr)` with gap 24px/16px. Covers are 2:3.
- **Hero:** cover 104px wide beside an info column; button pinned to the bottom of the card.
- **Series page:** cover 120px bottom-aligned with info; actions stacked full width at 10px gap; chapter rows 60px minimum.
- **Spacing rhythm:** 8, 12, 16, 24px. Form gaps 8px, card padding 14-16px.
- **Breakpoints:** 640px (shelf columns, Transfer button gains a text label) and 420px (reader step buttons hide their labels).
- **Top bar:** sticky, 44px controls, translucent `bg` at 88% with 14px backdrop blur.

## Elevation & Depth

Tonal layering, not shadows. Depth steps are bg, surface, raised, each separated by a 1px hairline. Only two floating things carry a shadow, both soft and blurred: the FAB (`0 8px 24px #0008`) and the toast (`0 10px 30px #0009`). Sticky bars use translucency plus backdrop blur (14px top bar, 16px reader bars) instead of shadow. Sheets sit on a `#000a` scrim.

### Named Rules
**The Flat-At-Rest Rule.** Cards, buttons, and rows have borders, never shadows. Shadow is reserved for elements that float over content.

## Shapes

Soft, consistent corners in a short ladder: 8px covers, 12px controls (buttons, inputs, xfer cards, details, segmented track), 14px toast, 16px hero and empty-state cards, 20px sheet top corners, 999px for tabs, the Transfer pill, and round icon buttons and FAB. Segment buttons inside the 12px track are 9px with a 3px inset. Progress bars are 4px (hero, series) or 3px (shelf) with 2px radius. Borders are always 1px `line`.

## Components

### Top bar and icon-btn
Sticky, title left (flex 1), icon buttons right. Icon-btn is a 44px circle, transparent, `raised` on hover. On 640px+ the Transfer button widens into a pill with a text label. A busy transfer shows a 9px accent dot with a 2px `bg` ring at its corner; sync spins its icon 1s linear.

### Buttons
44px minimum, 12px radius, `raised` fill, 1px `line` border, weight 600. Primary swaps to `accent-fill` with white text. Danger only recolors text to `danger`. Disabled is 40% opacity. Pressed scales to 0.97. A toggled button (`aria-pressed`) takes an accent border and text.

### Search
Full-width 44px input, 12px radius, 18px magnifier inset 12px, 40px left padding, `muted` icon and placeholder. Inside chapter tools it flexes beside other controls with no margin.

### Hero (Lanjut baca)
Surface card, 16px radius, 16px padding, cover 104px, 2-line title, muted meta lines (batch/page, device and time), 4px progress, then a primary button anchored to the bottom.

### Cover
2:3, 8px radius, `raised` placeholder, image cover-fit. The blank state centers a 34px/700 initial in `muted`.

### Thin progress
4px track in `line`, accent fill, 2px radius; 3px under shelf covers. Exposed as `role=progressbar` with the percent in its label.

### Tabs
Horizontally scrolling pill row that bleeds to the screen edge, scrollbar hidden. 44px high. Idle is `surface`; selected is `fg` on `bg`.

### Shelf grid
Cover, a 3px progress bar, 2-line 14px title, 12px muted one-line meta; items gap 6px. Empty states span all columns.

### Chapter rows and chips
Full-width 60px rows, no radius, a hairline under each, list top-bordered. Number column 32px, right-aligned, muted 600. Current row recolors number and title to `accent`; finished rows mute the title. Chips are 12px muted with a 15px icon; `.ok` turns green.

### Transfer cards
Surface, 12px radius, 14px padding, 10px gap. Name truncates on one line, a muted small status line, then a thin progress bar. Group heads are 16px muted.

### Sheet
Bottom sheet over a `#000a` scrim, max 560px, max-height 85vh, 20px top radius, 10px item gap, safe-area bottom padding. Items are left-aligned stacked buttons with a muted sublabel. Details blocks use a hairline and 12px radius.

### Seg control
`raised` track with 12px radius and 3px padding; 44px segments; the selected one fills `accent-fill` with white text.

### Toggle
44px row with label and a 22px native checkbox using `accent-color: accent`.

### Reader bars
Fixed top and bottom bars, `surface` at 92% with 16px blur and a hairline on the page-facing edge. They slide in from off-screen and are hidden with `visibility` when closed, so they are neither focusable nor visible. The top bar holds title plus a tabular position line; the bottom bar spaces prev/next steppers around a chapter picker (`raised`, flex 1). Auto-scroll on-state fills `accent-fill`. Page slots are `surface` canvases; the night-invert mode applies `invert(1) hue-rotate(180deg)`.

### Toast
Centered above the bottom bar (76px up), width min(92vw, 460px), `raised`, 14px radius, hairline and shadow; message on its own line, actions share the row.

### FAB
56px circle, `accent-fill`, white 26px plus at stroke 2.2, bottom-right with safe-area offset, shadow as above.

## Motion

Short and functional. Easing is `--ease: cubic-bezier(.22, 1, .36, 1)`. Button press scales to 0.97 in 150ms. Sheet rises 24px while fading in over 280ms; scrim fades in over 200ms; toast reuses the rise. Reader bars slide 250ms. Background hover is 150ms. Under `prefers-reduced-motion: reduce` all animation and transition are turned off. No decorative motion, no parallax, no scroll effects.

## Do's and Don'ts

### Do:
- **Do** keep every touch target at 44px or more, including segments, tabs, and toggle rows.
- **Do** use `accent-fill` behind white text and `accent` for strokes and text on dark.
- **Do** build new surfaces from bg, surface, and raised separated by a 1px `line` border.
- **Do** use tabular numerals for any figure that changes.
- **Do** draw icons with `icons.js` (24px viewBox, 1.75 stroke, `currentColor`).
- **Do** show real progress and status everywhere (percent, waiting reason), per the product principles.
- **Do** honor safe-area insets on any fixed or sticky element.

### Don't:
- **Don't** use `accent` as a solid fill under white text.
- **Don't** add catalogue chrome: ratings, rankings, recommendation rows, store-style cards.
- **Don't** add decorative shadows, gradients, or glass beyond the sticky-bar blur.
- **Don't** introduce a second accent hue or color a category.
- **Don't** let controls cover the page in the reader. Bars hide on demand.
- **Don't** use emoji or glyph icons in the UI.
- **Don't** treat `.impeccable/review/seed.html` (synthetic review fixture) as product.
