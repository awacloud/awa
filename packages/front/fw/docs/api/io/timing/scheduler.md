---
module: scheduler
category: io/timing
dependencies: []
returns: object
worker-safe: true
status: complete
---

# scheduler

> 5-field cron parser + interval wrapper + job scheduler.

**Module** `scheduler` | **Source** `packages/front/fw/src/io/timing/scheduler.js` | **Deps** none | **Worker-safe** yes

## Resolve

```js
const scheduler = runtime.resolve('scheduler');
// Returns: { cron, interval, job }
```

## API

### `scheduler.cron(expression)` → CronInstance

Parses a 5-field cron expression. Throws `Error('scheduler: invalid cron expression …')` on invalid input.

| Method | Signature | Returns |
|--------|-----------|---------|
| `next` | `(from?: Date) => Date` | Next date strictly after `from` |
| `nextN` | `(n: number, from?: Date) => Date[]` | N next dates in ascending order |
| `matches` | `(date: Date) => boolean` | `true` if the date satisfies the expression |
| `expression` | `string` | Original expression |
| `fields` | `object` | Value sets for each field |

**Fields and ranges:**

| Field | Position | Range |
|-------|----------|-------|
| minute | 1st | 0–59 |
| hour | 2nd | 0–23 |
| day (of month) | 3rd | 1–31 |
| month | 4th | 1–12 |
| weekday | 5th | 0–6 (0 = Sunday) |

**Syntax accepted per field:**

| Pattern | Example | Meaning |
|---------|---------|---------|
| `*` | `*` | Any value |
| `N` | `5` | Fixed value |
| `N-M` | `9-17` | Range |
| `*/S` | `*/15` | Every S values |
| `N-M/S` | `0-30/5` | Range with step |
| `A,B,…` | `0,15,30,45` | List |

**day/weekday semantics:** if both fields are non-`*`, fires if **either** matches (standard cron behavior).

**Horizon:** if no date matches within the next 5 years → throws `'scheduler: no firing in 5y horizon'`.

### `scheduler.interval(callback, ms)` → IntervalInstance

| Method | Description |
|--------|-------------|
| `start()` | Starts the interval (idempotent) |
| `stop()` | Stops (idempotent) |
| `running` | getter `boolean` |

`start()` does not fire automatically on construction — explicit call required.

### `scheduler.job(expression, callback)` → JobInstance

| Method/Prop | Description |
|-------------|-------------|
| `start()` | Schedules the next firing, idempotent |
| `stop()` | Cancels the pending firing |
| `running` | getter `boolean` |
| `next` | getter `Date \| null` — next scheduled firing |
| `expression` | getter `string` |

- Missed firings (machine asleep) are **ignored** — no catch-up.
- If `callback` throws: log + continue (the job does not stop).

## Non-features (explicit)

- **No timezone**: uses the context's local `Date`.
- **No seconds field**: throws on 6 fields with a clear message.
- **No Quartz extensions**: `L`, `W`, `#`, `?` are not supported.
- **No catch-up** on missed firings.
- **No job pool** (dynamic add/remove): that belongs in `lib/`.

## Examples

### Cron — next firing

```js
const scheduler = runtime.resolve('scheduler');
const c = scheduler.cron('0 9 * * 1-5'); // Monday–Friday at 09:00

const next = c.next();
console.log('Next firing:', next.toLocaleString());
console.log('Following firings:', c.nextN(5));
```

### Simple interval

```js
const it = scheduler.interval(() => checkHealth(), 30_000);
it.start();

// Later
it.stop();
```

### Cron job

```js
const job = scheduler.job('*/5 * * * *', async () => {
    await syncData();
});
job.start();

// Show the next firing
console.log('Next:', job.next);

// Stop
job.stop();
```

### Pre-display check

```js
const c = scheduler.cron('0 12 * * *');
const upcoming = c.nextN(7); // next 7 noons
```

## Worker Usage

```js
const worker = fw.createWorker(
    async function ({ libs }) {
        const s = libs.scheduler;
        const job = s.job('*/10 * * * *', () => {
            // batch processing in the worker, without blocking the main thread
        });
        job.start();
    },
    { dependencies: ['scheduler'] }
);
```

## Notes

- The module uses `setTimeout` (not `setInterval`) for jobs — each firing recomputes the next one.
- `next()` uses an optimized search (jumps by month/day/hour) — not a minute-by-minute loop over 5 years.
- Local `Date`: in a browser context, cron hours correspond to the user's local timezone. In a worker, same timezone as the main thread.

## See also

- [rateLimit](./rateLimit.md) — debounce and throttle
- [abort](../sync/abort.md) — combine with job for timeout
- [cancellable](../sync/cancellable.md) — async task cancellation
