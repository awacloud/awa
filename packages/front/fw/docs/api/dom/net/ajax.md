---
module: ajax
category: dom/net
dependencies: []
returns: function
worker-safe: false
status: complete
---

# ajax

> Fetch-based HTTP client — configurable instances with base URL, default headers, scopes, timeout, and structured error handling.

**Module** `ajax` | **Source** `packages/front/fw/src/dom/net/ajax.js` | **Deps** none | **Worker-safe** no

## Resolve

```js
const ajax = runtime.resolve('ajax');
// ajax is a factory: ajax(baseUrl?, defaults?) → AjaxInstance
```

## API

### `ajax(baseUrl?, defaults?) → AjaxInstance`

Creates a configured HTTP instance.

```js
const api = ajax('/api/v1', {
    headers: { 'Authorization': 'Bearer token' }
});
```

| Param | Type | Default | Description |
|-------|------|--------|-------------|
| `baseUrl` | `string` | `''` | Base URL (prefixes all requests) |
| `defaults` | `object` | `{}` | Default options: `headers`, `type`, `timeout` |

---

### HTTP methods

```js
const data   = await api.get('/users');
const result = await api.post('/users', { name: 'Bob' });
await api.put('/users/1', updatedUser);
await api.patch('/users/1', { name: 'Robert' });
await api.del('/users/1');
```

All return a `Promise` with the deserialised response body.

---

### Per-request options

| Option | Type | Description |
|--------|------|-------------|
| `headers` | `object` | Additional headers (merged with defaults) |
| `type` | `string` | Expected response type: `'json'`, `'text'`, `'blob'`, `'buffer'`, `'response'` |
| `timeout` | `number` | Timeout in ms (0 = no limit). Uses `AbortSignal.timeout` |
| `signal` | `AbortSignal` | External cancellation signal |

```js
// Timeout + explicit type
const blob = await api.get('/image.png', { type: 'blob', timeout: 5000 });

// External cancellation
const controller = new AbortController();
const data = await api.get('/slow', { signal: controller.signal });
controller.abort();
```

---

### `api.scope(path?, opts?) → AjaxInstance`

Creates a sub-client that inherits the base URL and defaults.

```js
const api   = ajax('/api');
const admin = api.scope('/admin', { headers: { 'X-Role': 'admin' } });
const users = api.scope('/users');

await admin.get('/stats');     // GET /api/admin/stats
await users.get('/1');         // GET /api/users/1
```

---

### URL resolution

| Form | Resolution |
|-------|-----------|
| `'http://...'` / `'https://...'` | Used as-is |
| `'/foo'` | Prefixed with the base origin |
| `'foo'` | Replaces the last segment of the base |

---

### Automatic response type detection

If `type` is not specified, the response `Content-Type` header is used:

| Content-Type | Result |
|--------------|---------|
| `application/json` or `+json` | Parsed as JSON |
| `text/*` | Text |
| Other | ArrayBuffer |

---

### Error handling — `HttpError`

Responses with HTTP code ≥ 400 throw an `HttpError`:

```js
try {
    await api.get('/missing');
} catch (err) {
    if (err instanceof api.HttpError) {
        console.log(err.status);    // 404
        console.log(err.message);   // Human-readable
        console.log(err.response);  // Raw Response
    }
}
```

## Examples

### Complete REST client

```js
const ajax = runtime.resolve('ajax');

// Main instance
const api = ajax('/api/v1', {
    headers: { 'Content-Type': 'application/json' },
    timeout: 10000
});

// Sub-clients per resource
const usersApi  = api.scope('/users');
const ordersApi = api.scope('/orders');

// User CRUD
const users     = await usersApi.get('');
const user      = await usersApi.get('/1');
const newUser   = await usersApi.post('', { name: 'Alice', email: 'alice@example.com' });
await usersApi.patch(`/${newUser.id}`, { verified: true });
await usersApi.del(`/${newUser.id}`);
```

### File upload

```js
const formData = new FormData();
formData.append('file', fileBlob, 'upload.png');

await api.post('/upload', formData, {
    headers: {}  // do not set Content-Type (the browser sets it for multipart)
});
```

## Notes

- `HttpError` is exposed on the instance (`api.HttpError`) — no separate import needed for `instanceof` checks.
- Timeout via `AbortSignal.timeout` (Chrome 103+, Firefox 100+, Safari 16.4+). `AbortSignal.any` to combine timeout + external signal (Chrome 119+, Firefox 124+, Safari 17.4+) — when absent, the external signal takes precedence and the timeout is ignored.
- JSON body automatically serialised if `body` is a plain object (not `FormData`, `Blob`, `ArrayBuffer`, `URLSearchParams`).
- No built-in retry — wrap with an external wrapper if needed.

## See also

- [ws](./ws.md) — WebSocket
- [download](../fs/download.md) — download received data
