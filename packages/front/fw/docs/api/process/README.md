# Process — Inter-context communication

Modules for communication between the main thread and Web Workers.

| Module | Returns | Deps | Description |
|--------|----------|------|-------------|
| [processMessage](./message.md) | `{sync, worker, workerCommand, workerFramework}` | none | Message proxy with routing by command name |
| [processRPC](./rpc.md) | `{create, open}` | none | Promise-based RPC over MessageChannel |
| [workerPool](./workerPool.md) | `{create}` | none | Homogeneous pool of N workers — FIFO dispatch, respawn, AbortSignal |

## Choosing the right module

| Case | Module |
|-----|--------|
| Worker sends/receives simple data | `processMessage.worker()` + `processMessage.workerCommand()` |
| Expose a full JS object cross-worker | `processRPC` |
| In-memory tests without a real worker | `processMessage.sync()` |
| Process a job queue over N workers | `workerPool` |
