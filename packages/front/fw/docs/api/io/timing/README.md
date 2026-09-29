# IO / Timing

Low-level temporal primitives: monotonic clock, rate limiting, scheduling.

| Module | Returns | Deps | Description |
|--------|----------|------|-------------|
| [clock](./clock.md) | `{now, monotonic, since, iso, format}` | none | Monotonic clock — replacement for `performance.now()`, human formatting |
| [rateLimit](./rateLimit.md) | `{debounce, throttle}` | none | Debounce and throttle (lodash-compat) |
| [scheduler](./scheduler.md) | `{cron, interval, job}` | none | Cron expressions + interval + job scheduler |

## Common pattern

```js
const clock     = runtime.resolve('clock');
const rateLimit = runtime.resolve('rateLimit');
const scheduler = runtime.resolve('scheduler');

// Monotonic clock
const t0 = clock.monotonic();
// ... operation ...
console.log(clock.format(clock.since(t0))); // e.g. "12.3 ms"

// Debounce
const debouncedFn = rateLimit.debounce(fn, 300);

// Throttle
const throttledFn = rateLimit.throttle(fn, 100);

// Cron job
const job = scheduler.job('0 * * * *', () => doHourlyTask());
job.start();
```
