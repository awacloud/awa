# IO / Time

Temporal helpers (formatting, parsing, timezone) over the native `Date` and `Intl`.

| Module | Returns | Deps | Description |
|--------|----------|------|-------------|
| [date](./date.md) | `{format, parseISO, parse, add, diff, ...}` | none | Date helpers + timezone via Intl |

## Common pattern

```js
const date = runtime.resolve('date');

// Strict ISO 8601 parsing
const d = date.parseISO('2024-01-15T10:30:00Z');

// Locale-aware formatting
const str = date.format(d, { locale: 'fr-FR', timeZone: 'Europe/Paris', dateStyle: 'long' });

// Calendar arithmetic
const nextMonth = date.add(d, 1, 'months');
```
