---
module: numberFormatExtended
category: odf/extra
dependencies: [xml]
returns: object
worker-safe: true
status: complete
---

# numberFormatExtended (P1)

> Opt-in extra : extended typed coverage of every `number:*`
> sub-element used in `<number:*-style>` definitions — number,
> scientific-number, fraction, currency-symbol, text, embedded-text,
> day, day-of-week, month, year, era, week-of-year, quarter, hours,
> minutes, seconds, am-pm, boolean, text-content.

**Module** `numberFormatExtended` | **Source** `packages/front/office/odf/src/extra/number-format-extended.js`

## Helpers

`parseFragment(el)` / `renderFragment(f)`, `hydrateStyle(s)` /
`dehydrateStyle(s)`.
