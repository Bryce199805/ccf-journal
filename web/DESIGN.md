# Visual system

The directory uses a blue identity with fixed semantic colors. Keep each badge's
text visible: color supports a classification, but never replaces its label.

## Themes

- Light: blue-gray canvas `#f3f6fb`, white surfaces, ink text `#17263d`.
- Dark: graphite canvas `#0f1218`, cards `#171b23`, elevated popovers `#1e232d`; cool-neutral with a single blue accent. Metric tiles use neutral surfaces with hue only in the number, dot and hairline.
- Primary: `#245bd6` in light mode; `#93b8ff` with navy foreground in dark mode.
- Default follows the OS. Explicit choices persist under `ccf_theme`, synchronize
  across tabs, and take precedence over OS changes. The head initializer applies
  the theme before the app loads; keep it consistent with `theme-provider.tsx`.
- Native controls and browser chrome use the active color scheme/theme color.

## Semantic colors

| Information | Color treatment |
| --- | --- |
| CCF A / B / C | Crimson / amber / blue, always labeled |
| CAS zones 1–4 | Crimson / burnt orange / amber / green |
| Xinrui | Same zone hues, soft fill and a left border |
| JCR | Purple, explicit `JCR Qn` text |
| TOP | Gold outlined badge, independent of CCF grade |
| IF / CiteScore / H-index / articles | Blue / teal / violet / orange |
| 5-year IF / realtime IF / JCI / LetPub | Indigo / cyan / rose / amber |
| Missing detail metrics | Neutral value; one empty state when all metrics are unavailable |
| Favorites | Amber icon plus pressed state |

`index.css` owns surface tokens, badge colors, and `[data-tone]` metric tokens.
Cards, details, and tables use the same metric hues. Changing an accent should
update both theme variants. Avoid applying primary-foreground to custom dark
backgrounds: that token becomes navy in dark mode; solid colored external-link
buttons and the brand mark explicitly use white.

## Interaction and layout

- 16px card corners, subtle borders and shadows, restrained hover changes.
- Shadows and hover treatments are enhancements; focus has an explicit outline.
- Hover elevation is limited to devices with a fine pointer and hover support.
- Reduced-motion preferences suppress transitions and animation.
- Full titles wrap; badges, metadata, and controls wrap within the viewport.
- Card notes precede the metric strip to align the comparison area across cards.
- Mobile partition details use stacked sections; wide tables retain local scrolling.
- A compact legend explains the independent classification systems.

## Verification

`tests/theme.cjs` checks theme persistence, OS changes, cross-tab synchronization,
representative text/background contrast, and responsive cards, tables, dialogs,
and the theme selector. Sampled text and badge-gradient endpoints must have a
contrast ratio of at least 4.5:1. This is not a full accessibility audit.

Use `tests/experience.cjs` for behavior regressions. See `tests/README.md` for setup.

## Detail layout

The dialog has a fixed close bar and, when external URLs exist, a fixed action
footer. Only the middle content scrolls, with overscroll contained locally.
Nothing is collapsed: every metric, partition, ranking and metadata field is
visible so a journal can be read at a glance.

From lg widths the four primary metrics (large tiles) and the six secondary
metrics (compact tiles, label above value, one row from xl) sit in the title area, to the right of the
title. Below the title, journal info (identifiers, publisher, submission
references, research area, data date) is a full-width section that is collapsed
by default — low-priority reference data, and the only collapsible part of the
dialog. Partitions are a row of three cards (CAS current, Xinrui, historical
CAS) with JCR as a slim bar beneath. Subject rankings follow: CiteScore spans
the full width, and JIF and JCI share a two-column row. At 1440x900 a typical
journal fits without scrolling; phones stack everything. Long lists of ranking
subjects scroll inside the dialog rather than being hidden.

The submission link is the primary footer action; the official website takes
that emphasis if no submission URL exists. Other links use outlined buttons.
All outbound links declare that they open a new window.
