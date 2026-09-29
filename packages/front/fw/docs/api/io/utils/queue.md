---
module: queue
category: io/utils
dependencies: []
returns: constructor
worker-safe: true
status: complete
---

# queue

> Async queue with configurable concurrency. Callback pattern with `onData`/`onEnd`.

**Module** `queue` | **Source** `packages/front/fw/src/io/utils/queue.js` | **Deps** none | **Worker-safe** yes

## Resolve

```js
const Queue = runtime.resolve('queue');
// Returns: Queue constructor (class)
```

## API

```js
const q = new Queue(concurrency);
```

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `concurrency` | `number\|boolean` | `1` | Max simultaneous jobs. `true` → 1024 |

### Properties

| Property | Type | Description |
|----------|------|-------------|
| `onData` | `Function` | **Must be set.** `(job, end) => void` — processes a job, calls `end()` when done |
| `onEnd` | `Function` | **Must be set.** `(error) => void` — called when the queue is closed |
| `length` | `number` | Number of jobs waiting |
| `running` | `number` | Number of jobs in progress |
| `stopped` | `boolean` | `true` after `stop()` |
| `error` | `any` | Error passed to `stop()` or `onData end(error)` |

### Methods

| Method | Signature | Description |
|--------|-----------|-------------|
| `push` | `(job: any) => void` | Adds a job |
| `concat` | `(jobs: any[]) => void` | Adds multiple jobs |
| `end` | `(error?) => void` | Signals EOF — no more jobs to come |
| `stop` | `(error?) => void` | Stops processing immediately |

## Examples

### Sequential (concurrency 1)

```js
const Queue = runtime.resolve('queue');

const q = new Queue(1);

q.onData = function(item, done) {
    // Async processing
    fetch(item.url)
        .then(r => r.json())
        .then(data => {
            console.log(data);
            done();   // job done — triggers the next one
        })
        .catch(err => done(err)); // error → closes the queue
};

q.onEnd = function(error) {
    if (error) console.error('Queue error:', error);
    else console.log('All done');
};

q.push({ url: '/api/1' });
q.push({ url: '/api/2' });
q.push({ url: '/api/3' });
q.end(); // no more jobs to come
```

### Parallel (concurrency 4)

```js
const q = new Queue(4);

q.onData = (chunk, done) => {
    processChunk(chunk).then(() => done());
};

q.onEnd = () => console.log('Batch complete');

q.concat(chunksArray);
q.end();
```

### Emergency stop

```js
q.stop(new Error('Cancelled by user'));
// → onEnd(error) called immediately
```

## Worker Usage

```js
const worker = fw.createWorker(
    function ({ libs, args }) {
        const Queue = libs.queue;
        const q = new Queue(2);

        q.onData = (url, done) => {
            fetch(url).then(r => r.json())
                .then(data => { self.postMessage(data); done(); })
                .catch(err => done(err));
        };

        q.onEnd = (error) => {
            if (error) self.postMessage({ error: error.message });
        };

        q.concat(args.urls);
        q.end();
    },
    { dependencies: ['queue'], args: { urls: ['/api/1', '/api/2', '/api/3'] } }
);
```

## Notes

- `onData` and `onEnd` **must be set** before the first `push` — otherwise `Error` at runtime.
- `done()` in `onData` must be called **exactly once** — multiple calls → `Error`.
- `push()` after `end()` → `Error`.
- `concurrency = true` → 1024 (near-parallel execution).
- Internal state machine: `PROCESSING | EOF | CLOSING | CLOSED`.

## See also

- [workers](../../../guide/workers.md) — similar pattern for parallel workers
