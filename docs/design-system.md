# Design system

The site's visual language, as implemented in `public/style.css`. Tokens are
plain CSS custom properties — no build step. Components read **semantic**
tokens only; primitives exist so the two themes share one palette.

## Principles

- **Numbers first.** The rate is the content. Big tabular figures, quiet chrome.
- **Swiss / minimal.** Flat surfaces, 1px borders, no glows or gradients.
- **One meaning per color.** Product identity, maturity, and status each have
  their own tokens and are never reused for one another.
- **Accessible by default.** Text ≥ 4.5:1 in both themes, ≥ 12px, visible
  focus, 44px touch targets, `prefers-reduced-motion` honored.

## Themes

Dark is the default. Light follows `prefers-color-scheme`; the header toggle
stamps `<html data-theme="light|dark">` and stores it in `localStorage.theme`.
An inline script in each page's `<head>` applies the stored choice before
first paint. `theme.js` dispatches a `themechange` event so Chart.js canvases
(which can't read CSS variables live) repaint — see `applyTheme()` in `app.js`.

When adding a semantic token, define it in **three** places in `style.css`:
`:root` (dark), the `prefers-color-scheme: light` block, and
`:root[data-theme="light"]`.

## Color tokens

| Token | Dark | Light | Use |
|---|---|---|---|
| `--bg` | `#0b0e14` | `#f5f6f8` | Page background |
| `--surface` | `#131720` | `#ffffff` | Cards |
| `--surface-raised` | `#1a1f2b` | `#f0f2f5` | Table header, hover, selected tab, tooltips |
| `--surface-sunken` | `#0f1219` | `#f5f6f8` | Form wells, segmented-control track |
| `--border` / `--border-strong` | `#262c3a` / `#343c4d` | `#e2e5eb` / `#cfd4dc` | Dividers / emphasized edges |
| `--text` | `#e6eaf0` (14.9:1) | `#0f172a` (17.9:1) | Primary text |
| `--text-muted` | `#9aa4b5` (7.1:1) | `#556071` (6.4:1) | Secondary text, labels |
| `--accent` | `#6ea3ff` (7.1:1) | `#1d5fd1` (5.8:1) | Links, primary button, focus ring |
| `--positive` | `#34d399` | `#047857` | Rate up, "Oportunitate", "Păstrează" |
| `--warning` | `#fbbf24` | `#a14a06` | "Nelichid", sell signal |
| `--negative` | `#f87171` | `#c0262d` | Rate down, "Supraevaluat", errors |
| `--tezaur` / `--fidelis` | positive / accent | positive / accent | Product identity dot |

Contrast ratios are against `--surface`. Each status color has a `-soft`
variant for tinted backgrounds. Status is always paired with a text label
(and an arrow/check icon where space allows) — never color alone.

## Chart palette (maturities)

Every maturity owns a fixed slot, so "3 ani" is aqua on every chart and tile.
Slot order was validated for color-vision-deficiency separation (worst adjacent
ΔE 8.4 dark / 9.1 light) with the dataviz palette checker.

| Maturity | Slot | Dark | Light |
|---|---|---|---|
| 1 an | `--mat-1` | `#3987e5` | `#2a78d6` |
| 2 ani | `--mat-2` | `#d95926` | `#eb6834` |
| 3 ani | `--mat-3` | `#199e70` | `#1baf7a` |
| 4 ani | `--mat-4` | `#c98500` | `#eda100` |
| 5 ani | `--mat-5` | `#d55181` | `#e87ba4` |
| 6 ani | `--mat-6` | `#008300` | `#008300` |
| 7 ani | `--mat-7` | `#9085e9` | `#6250d6` |
| 10 ani | `--mat-8` | `#e66767` | `#e34948` |

New maturity → add it to `MAT_SLOT` in `app.js`. Never generate a ninth hue.
Currency on the donor chart is a **dash** (EUR dashed), not a new color.
In light mode slots 3–5 are below 3:1 against white, which is acceptable only
because every value is also shown as text (tiles, tooltips, legend labels).

Chart anatomy: 2px lines, 3px points with a surface-colored ring, no vertical
grid, `--chart-grid` horizontal grid, `--chart-axis` ticks, tooltip on
`--surface-raised` sorted by value.

## Typography

Inter (already loaded), tabular numerals for all figures.

| Token | Size | Use |
|---|---|---|
| `--fs-xs` | 12px | Labels, badges, pills, footnotes (minimum size) |
| `--fs-sm` | 14px | Tables, secondary copy, buttons |
| `--fs-md` | 16px | Body |
| `--fs-lg` | 20px | Card titles |
| `--fs-xl` | 28px | Stat tile rate |
| `--fs-2xl` | 28–40px (clamp) | Page title |

Section labels: `--fs-xs`, 600, uppercase, 0.08em tracking, `--text-muted`.
Bond symbols (`.sym`) use `--font-mono`.

## Spacing, shape, motion

- Spacing: 4px base — `--space-1` 4 · `2` 8 · `3` 12 · `4` 16 · `5` 20 · `6` 24 · `7` 32 · `8` 48.
- Radius: `--radius-sm` 6 (controls) · `--radius` 8 (inner blocks) · `--radius-lg` 12 (cards) · `--radius-full` pills.
- Motion: one `--duration` (150ms) with `--ease`; reduced-motion disables
  transitions and chart animation.
- Touch: `--target-min` is 36px for mouse, 44px under `pointer: coarse`.
  Small icons (info `ⓘ`) extend their hit area with an inset pseudo-element.

## Components

| Component | Class | Notes |
|---|---|---|
| Site header | `.site-header` | Sticky, brand + nav (`aria-current="page"`) + theme toggle. Same markup on every page. |
| Page intro | `.page-intro` | `h1` + `.lede`; optional right-aligned pill. |
| Card | `.card` › `.card-header` (`.dot`, `h2`, `.badge`, `.card-sub`) | |
| Stat tile group | `.now-group` › `.now-row` | Rate + delta vs previous emission of the same maturity. |
| Delta | `.delta.delta-up/down` | Arrow icon + signed "pp" text + visually-hidden comparison. |
| Segmented tabs | `.tab-bar` › `.tab-bar-inner[role=tablist]` › `.tab-btn` | Roving tabindex, ←/→ keys. |
| Legend chip | `.legend-item[aria-pressed]` | Toggles a series. |
| Table | `.market-table` | Sticky header, `aria-sort`, keyboard-sortable headers, numeric columns right-aligned. |
| Status pill | `.status-pill.pill-good/fair/bad/illiquid` | |
| Info tooltip | `.tip-btn` + `#global-tip` | Click/Enter to toggle, Esc to close, `aria-expanded`/`aria-describedby`. |
| Accordion | `details.accordion` | Chevron rotates on open. |
| Buttons | `.btn.btn-primary`, `.btn.btn-ghost` | |
| Form | `.form-row` › `label` + `.form-control-row`, `.form-hint`, `.form-error[role=alert]` | Invalid input gets `aria-invalid`. |

## Responsive behavior

One breakpoint for layout (`max-width: 640px`), plus height-aware sizing:

- **Charts:** height = `clamp(260, 55% of viewport height, 420)` and at most
  80% of the width, recomputed on width changes (`sizeChart()` in `app.js`).
  The y-axis labels are redrawn on a pinned overlay canvas (`stickyYAxis`
  plugin) so the scale stays visible while the plot scrolls horizontally.
- **Rates-now tiles:** auto-fit grid on wide screens; on phones a swipeable
  scroll-snap row where the next tile peeks in.
- **Market tables:** on phones each row becomes a card (3 columns, 2 under
  340px) labelled from the cells' `data-label`. The column headers are hidden,
  so a "Sortează după" select takes over sorting.
- **Header:** sticky, except on short screens (`max-height: 520px`).
- Text inside horizontally scrolling containers must not use absolutely
  positioned children without a positioned ancestor inside the scroller
  (it escapes the clip and widens the page).

## Icons

Inline SVG, Lucide-style 24×24 strokes, `class="icon"`, `aria-hidden="true"`
with a text label or `aria-label` on the control. No emoji or Unicode glyphs
as icons.
