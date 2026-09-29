# IO / Utils

General utilities: application pub/sub, binary data manipulation, validation, reactive signals, error handling, identifiers.

| Module | Returns | Deps | Description |
|--------|----------|------|-------------|
| [eventBus](./eventBus.md) | `{create}` | none | Typed application pub/sub by topic (sticky, wildcards, scopes) |
| [queue](./queue.md) | Constructor `Queue` | none | Queue with configurable concurrency |
| [bitmap](./bitmap.md) | `{bytesToBits, bitsToBytes, padBitsToByte}` | none | Bits ↔ bytes conversion (LSB-first) |
| [valid](./valid.md) | `{is, isNumber, isString, validate, test, compile, formats}` | none | Type guards + JSON Schema validation (draft 2020-12 subset) |
| [ui8](./ui8.md) | `{equal, join, concat}` | none | Uint8Array utilities (comparison, concatenation) |
| [errors](./errors.md) | `{logger, guard, boundary}` | none | Structured logger, execution guard, UI boundary |
| [signal](./signal.md) | `{create, derived, batch, untrack, effect, resource, derivedAsync, computed, scheduleNotify, flushSync, inspectGraph}` | none | Lightweight reactive signals — mutable cells with subscriptions, derivations and a read-only dependency-graph snapshot |

> The `uuid` module is documented under [`crypto/utils/uuid`](../../crypto/utils/uuid.md) — its source lives in `src/crypto/utils/` because it depends on `crypto.getRandomValues`.

## Common pattern

```js
const eventBus = runtime.resolve('eventBus');
const bus = eventBus.create();
bus.on('app:ready', () => console.log('ready'));
bus.emit('app:ready');

const signal = runtime.resolve('signal');
const count = signal.create(0);
const stop = signal.effect(() => console.log('count =', count.get()));
count.set(1); // logs: count = 1
stop();
```
