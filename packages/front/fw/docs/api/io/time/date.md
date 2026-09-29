---
module: date
category: io/time
dependencies: []
returns: object
worker-safe: true
status: complete
---

# date

> Date + Intl helpers — strict ISO parsing, locale-aware formatting, calendar arithmetic.

**Module** `date` | **Source** `packages/front/fw/src/io/time/date.js` | **Deps** none | **Worker-safe** yes

No embedded timezone database — delegated to native `Intl` (modern browsers, Node 16+, Bun).

## Resolve

```js
const date = runtime.resolve('date');
// Returns: { format, formatRelative, parse, parseISO, diff, add, sub, startOf, endOf, getOffset, zones, isValid }
```

## API

| Method | Signature | Returns |
|--------|-----------|---------|
| `isValid` | `(d: Date) => boolean` | `true` if date is valid (non-NaN) |
| `format` | `(d: Date, options?) => string` | Intl.DateTimeFormat.format |
| `formatRelative` | `(from: Date, to?: Date, options?) => string` | "3 min ago" via Intl.RelativeTimeFormat |
| `parseISO` | `(str: string) => Date \| null` | Strict ISO 8601 (timezone required) |
| `parse` | `(str: string, fmt?: string) => Date \| null` | Custom format (tokens YYYY MM DD HH mm ss SSS) |
| `add` | `(d: Date, n: number, unit: string) => Date` | New Date (immutable) |
| `sub` | `(d: Date, n: number, unit: string) => Date` | Alias for `add(d, -n, unit)` |
| `diff` | `(a: Date, b: Date, unit: string) => number` | `a - b` in `unit` (floor) |
| `startOf` | `(d: Date, unit: string) => Date` | Start of the period |
| `endOf` | `(d: Date, unit: string) => Date` | End of the period (23:59:59.999) |
| `getOffset` | `(d: Date, timeZone: string) => number` | Minutes from UTC |
| `zones` | `() => string[]` | List of IANA timezones (Intl.supportedValuesOf) |

### Valid units (`add`, `sub`, `diff`, `startOf`, `endOf`)

`'years'` | `'months'` | `'weeks'` | `'days'` | `'hours'` | `'minutes'` | `'seconds'` | `'ms'`

### Options `format`

All `Intl.DateTimeFormat` options + `locale` (default `'en-US'`).

### Options `parse` — supported tokens

| Token | Meaning | Example |
|-------|---------|---------|
| `YYYY` | 4-digit year | `2024` |
| `MM` | 2-digit month | `01` |
| `DD` | 2-digit day | `15` |
| `HH` | 2-digit hour (24h) | `14` |
| `mm` | 2-digit minute | `30` |
| `ss` | 2-digit second | `45` |
| `SSS` | 3-digit milliseconds | `123` |

## Examples

### Parsing + formatting

```js
const date = runtime.resolve('date');

const d = date.parseISO('2024-06-15T14:30:00Z');
date.format(d, { locale: 'fr-FR', timeZone: 'Europe/Paris', dateStyle: 'long', timeStyle: 'short' });
// "15 juin 2024 à 16:30"
```

### Calendar arithmetic

```js
// End-of-month clamp: Jan 31 + 1 month → Feb 29 2024 (leap year)
const d = new Date(2024, 0, 31);
date.add(d, 1, 'months'); // 2024-02-29

// Diff in days
const a = new Date(2024, 2, 10);
const b = new Date(2024, 0, 1);
date.diff(a, b, 'days'); // 69
```

### startOf / endOf

```js
const d = new Date(2024, 5, 15, 14, 30, 45);
date.startOf(d, 'months'); // 2024-06-01 00:00:00.000
date.endOf(d, 'months');   // 2024-06-30 23:59:59.999
```

### Timezone offset

```js
const d = new Date('2024-01-15T12:00:00Z');
date.getOffset(d, 'UTC');              // 0
date.getOffset(d, 'Europe/Paris');     // 60 (CET, winter)
date.getOffset(d, 'America/New_York'); // -300 (EST, winter)
```

## Worker Usage

```js
const worker = fw.createWorker(
    function ({ libs, args }) {
        const d = libs.date.parseISO(args[0]);
        self.postMessage(libs.date.format(d, { locale: args[1], dateStyle: 'medium' }));
    },
    { dependencies: ['date'], args: ['2024-01-15T12:00:00Z', 'fr-FR'] }
);
```

## Notes

- `parseISO` is strict: rejects formats without timezone (`2024-01-15`, `2024-01-15T10:30:00` without Z/±HH:MM).
- `add` is immutable: always returns a new `Date`.
- Month clamp: `add(jan-31, 1, 'months')` → last day of the target month (no overflow).
- No `toTimezone(d, tz)` API that returns a "shifted" Date — that is an anti-pattern (the resulting Date would lie about its UTC epoch). Use `format(d, { timeZone })` for display.
- `diff` uses `Math.trunc` (not round) — 23h59 = 0 days, not 1.
- No timezone DB polyfill — if `Intl.supportedValuesOf` is unavailable, `zones()` returns a minimal hardcoded list.

## See also

- [scheduler](../timing/scheduler.md) — cron + time intervals
- [i18n](../i18n/i18n.md) — localisation (Intl.MessageFormat, plurals)
