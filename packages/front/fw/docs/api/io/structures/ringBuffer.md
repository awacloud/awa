---
module: ringBuffer
category: io/structures
dependencies: []
returns: object
worker-safe: true
status: complete
---

# ringBuffer

> Bounded circular FIFO buffer — O(1) push/shift/pop, automatic overwrite when full.

**Module** `ringBuffer` | **Source** `packages/front/fw/src/io/structures/ringBuffer.js` | **Deps** none | **Worker-safe** yes

Fixed array with `head` and `_size` pointers: no reallocation, no copying. When full, `push` overwrites the oldest value and advances `head`.

## Resolve

```js
const ringBuffer = runtime.resolve('ringBuffer');
// Returns: { create }
const rb = ringBuffer.create({ capacity: 256 });
// Instance: { push, shift, pop, peek, peekLast, peekAt, toArray, clear, snapshot, size, capacity, isFull, isEmpty }
```

## API

| Method | Signature | Returns |
|--------|-----------|---------|
| `create` | `({ capacity, storage?, snapshot? }) => RingBuffer` | New instance |
| `rb.push` | `(value) => void` | Adds; overwrites oldest if full |
| `rb.shift` | `() => value \| undefined` | Removes and returns oldest |
| `rb.pop` | `() => value \| undefined` | Removes and returns newest |
| `rb.peek` | `() => value \| undefined` | Oldest without removal |
| `rb.peekLast` | `() => value \| undefined` | Newest without removal |
| `rb.peekAt` | `(i: number) => value \| undefined` | Relative index (0=oldest); out of bounds → `undefined` |
| `rb.toArray` | `() => value[]` | Copy oldest → newest |
| `rb.clear` | `() => void` | Empties the buffer |
| `rb.snapshot` | `() => { capacity, size, data }` | Structured-cloneable snapshot |
| `rb.size` | getter `number` | Elements stored |
| `rb.capacity` | getter `number` | Limit (immutable) |
| `rb.isFull` | getter `boolean` | `size === capacity` |
| `rb.isEmpty` | getter `boolean` | `size === 0` |

### `create` options

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `capacity` | `integer >= 1` | Yes | Fixed buffer size; throws if invalid |
| `storage` | `Array \| TypedArray` (length ≥ capacity) | No | External backing array — no copy; mutated by the module |
| `snapshot` | object returned by `inst.snapshot()` | No | Restores state (head=0, slots 0..size-1 ← snapshot.data) |

## Examples

### Circular log (keep last N)

```js
const ringBuffer = runtime.resolve('ringBuffer');
const logs = ringBuffer.create({ capacity: 1000 });

function log(msg) { logs.push({ ts: Date.now(), msg }); }

function getLogs() { return logs.toArray(); } // last 1000 logs
```

### Audio FIFO buffer

```js
const audio = ringBuffer.create({ capacity: 4096 });

// Producer thread: push samples
audio.push(sample);

// Consumer thread: shift samples
const sample = audio.shift();
```

### Frame buffer (overwrite oldest)

```js
const frames = ringBuffer.create({ capacity: 30 }); // max 30 frames
while (streaming) {
    frames.push(captureFrame()); // overwrites the oldest if full
}
const snapshot = frames.toArray();
```

### Persistence

#### `inst.snapshot()`

Returns a **structured-cloneable** object representing the current state in logical order (oldest → newest):

```js
{
    capacity: number,   // same as the create capacity
    size: number,       // current _size
    data: Array<any>    // length = size, oldest → newest
}
```

Does not return the internal circular layout. Values are copied by reference.

#### `create({ capacity, snapshot })`

Restores a buffer from a snapshot previously extracted by `snapshot()`.

```js
const rb1 = ringBuffer.create({ capacity: 4 });
rb1.push('a'); rb1.push('b'); rb1.push('c');
const snap = rb1.snapshot();

// Transfer via postMessage / structuredClone / JSON
const rb2 = ringBuffer.create({ capacity: 4, snapshot: snap });
rb2.toArray(); // ['a', 'b', 'c']
```

**Throws**: `'ringBuffer: snapshot.capacity mismatch'` if `snapshot.capacity !== capacity`.

#### `create({ capacity, storage })`

Uses a provided `Array` or `TypedArray` as backing with no copy. Useful for `SharedArrayBuffer`-backed TypedArrays shared between threads.

```js
const storage = new Float64Array(new SharedArrayBuffer(8 * 256));
const rb = ringBuffer.create({ capacity: 256, storage });
rb.push(3.14);
```

**Note**: no defensive copy — do not mutate `storage` in parallel during ring buffer operations.

**Throws**:
- `'ringBuffer: storage must be Array or TypedArray'` if the type is incorrect.
- `'ringBuffer: storage length must be >= capacity'` if too short.

#### Combo `storage + snapshot`

```js
const storage = new Float64Array(256);
const rb = ringBuffer.create({ capacity: 256, storage, snapshot: snap });
// snap.data is copied into storage[0..size-1], head=0
```

#### `clear()` with external storage

- `Array`: slots are set to `undefined`.
- `TypedArray`: slots are set to `0` (native TypedArray behavior).

#### Worker example — round-trip via postMessage

```js
// Main thread
const rb = ringBuffer.create({ capacity: 100 });
rb.push({ ts: Date.now(), value: 42 });
worker.postMessage({ snap: rb.snapshot() });

// Worker
self.onmessage = ({ data }) => {
    const rb2 = ringBuffer.create({ capacity: 100, snapshot: data.snap });
    // rb2.toArray() identical to rb.toArray() at the time of the snapshot
};
```

## Worker Usage

```js
const worker = fw.createWorker(
    function ({ libs, args }) {
        const rb = libs.ringBuffer.create({ capacity: args[0] });
        for (let i = 0; i < args[1]; i++) rb.push(i);
        return rb.toArray();
    },
    { dependencies: ['ringBuffer'], args: [5, 10] }
);
```

## Notes

- No blocking option when full — if backpressure is needed, use `channel`.
- `peekAt(i)`: 0 = oldest, `size-1` = newest; negative indices or ≥ size → `undefined`.
- No auto-resize: capacity is immutable at creation.
- For a SAB-backed ring buffer (cross-thread), compose with the `atomics` module.

## See also

- [channel](../sync/channel.md) — async FIFO with backpressure
- [lruCache](./lruCache.md) — bounded cache with LRU eviction
