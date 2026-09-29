---
module: formKit
category: dom/utils
dependencies: [form, valid, reactiveBind, signal]
returns: object
worker-safe: false
status: complete
---

# formKit

> Thin ergonomic layer over `form` — RHF-style API with JSON-Schema resolver.

**Module** `formKit` | **Source** `packages/front/fw/src/dom/utils/formKit.js` | **Deps** `form`, `valid`, `reactiveBind`, `signal` | **Worker-safe** no

`formKit` is a **thin wrapper** around the existing [`form`](./form.md) module.
It does not reimplement form state, dirty/touched tracking, array handling,
async validation, or submit — those live entirely in `form`. What it adds is:

- A **JSON-Schema resolver** compiled once via [`valid.compile(schema)`](../../io/utils/valid.md).
- A declarative **`register(name)`** helper returning input props (value + event handlers)
  without calling `form.attach` manually.
- A **`watch(name?)`** subscription backed by [`signal`](../../io/utils/signal.md) that fires
  only for the requested field, or for any change when no name is given.
- A **`dispose()`** that tears down all subscriptions and DOM bindings in one call.

## Resolve

```js
const formKit = runtime.resolve('formKit');
// Returns: { create }
```

## API

### `formKit.create(spec) → FormKitInstance`

| Parameter              | Type   | Description                                              |
|------------------------|--------|----------------------------------------------------------|
| `spec.schema`          | object | Optional JSON Schema; compiled via `valid.compile(schema)`. |
| `spec.defaultValues`   | object | Initial field values keyed by field name.                |

Returns a `FormKitInstance`.

### `FormKitInstance` methods

| Method | Signature | Returns |
|--------|-----------|---------|
| `register` | `(name: string) => FieldProps` | Props to spread on an `<input>` (value, onInput, onChange, name). |
| `watch` | `(name?: string) => WatchHandle` | Subscribe to one field or the whole form. |
| `reset` | `(values?: object) => void` | Reset to defaults or given values; clears manual errors. |
| `setValue` | `(name: string, value: *) => void` | Set one field value. |
| `getValues` | `(name?: string) => * \| object` | Read one field or all values. |
| `setError` | `(name: string, message: string) => void` | Set a manual error on a field. |
| `array` | `(name: string) => FormKitArrayAccessor` | RHF-style array-field accessor. |
| `submit` | `(onValid, onInvalid?) => Promise<void>` | Submit; calls `onValid(values)` or `onInvalid(errors)`. |
| `form` | `FormController` | Escape hatch: the underlying `form.create()` controller. |
| `dispose` | `() => void` | Detach all subscriptions and DOM bindings (idempotent). |

### `FieldProps` (returned by `register`)

| Property   | Type     | Description                                   |
|------------|----------|-----------------------------------------------|
| `name`     | string   | The field name.                               |
| `value`    | *        | Live getter — current field value.            |
| `onInput`  | Function | Handler for the `input` event (text inputs).  |
| `onChange` | Function | Handler for the `change` event (checkboxes).  |

### `WatchHandle` (returned by `watch`)

| Property      | Type     | Description                                          |
|---------------|----------|------------------------------------------------------|
| `value`       | *        | Current value (field snapshot or full values object).|
| `subscribe`   | Function | Register an additional subscriber; returns unsubscribe.|
| `unsubscribe` | Function | Detach this watch subscription.                      |

### `FormKitArrayAccessor` (returned by `array`)

| Property/Method | Description                                        |
|-----------------|----------------------------------------------------|
| `fields`        | Defensive copy of the array (alias for `values`).  |
| `values`        | Defensive copy of the current array.               |
| `length`        | Current array length.                              |
| `push(item)`    | Append an item; returns its index.                 |
| `remove(idx)`   | Remove at index; `false` when out of range.        |
| `move(from, to)`| Move item; `false` when out of range.              |
| `set(idx, item)`| Replace at index; `false` when out of range.       |
| `clear()`       | Empty the array.                                   |
| `get(idx)`      | Read a single item by index.                       |

## Examples

### Register an input

```js
const formKit = runtime.resolve('formKit');

const fk = formKit.create({
    schema: {
        type: 'object',
        required: ['email'],
        properties: {
            email:    { type: 'string', minLength: 1 },
            username: { type: 'string', minLength: 3 },
        },
    },
    defaultValues: { email: '', username: '' },
});

// --- In a component render callback ---

// Spread onto your input element.
const emailProps = fk.register('email');
// emailProps = { name: 'email', value: '', onInput: fn, onChange: fn }

// Wire the real DOM element (optional — for full two-way DOM sync):
fk.form.attach('email', document.querySelector('#email'));

// Watch a single field for live validation feedback.
const emailWatch = fk.watch('email');
emailWatch.subscribe((v) => console.log('email changed to', v));

// Submit
await fk.submit(
    (values) => { /* POST values to the server */ },
    (errors) => { /* display errors[fieldName] */ },
);

// Cleanup on unmount.
fk.dispose();
```

### Array fields

```js
const fk = formKit.create({
    schema: {
        type: 'object',
        properties: { tags: { type: 'array', items: { type: 'string' } } },
    },
    defaultValues: { tags: [] },
});

const arr = fk.array('tags');
arr.push('alpha');
arr.push('beta');
arr.move(0, 1);        // ['beta', 'alpha']
arr.remove(1);         // ['beta']
console.log(arr.length); // 1
console.log(arr.fields);  // ['beta']
```

### Manual errors (e.g. from server responses)

```js
await fk.submit(async (values) => {
    const resp = await fetch('/api/save', { method: 'POST', body: JSON.stringify(values) });
    if (!resp.ok) {
        const { field, message } = await resp.json();
        fk.setError(field, message);   // surfaces in fk.form.errors[field]
    }
});
```

## Notes

- The resolver is `valid.compile(schema)` — no new validation engine. The same
  JSON Schema dialect supported by [`valid`](../../io/utils/valid.md) applies
  (type, required, properties, format, minLength, etc.).
- `watch` is subscription-based (explicit), not transparent — it does not auto-track
  reads. Use `subscribe` on the returned handle to react to changes.
- `setError` persists until the field is changed (triggering re-validation) or
  `reset()` is called.
- `dispose()` is idempotent; calling it multiple times is safe.

## See also

- [`form`](./form.md) — underlying form state machine (values, dirty, touched, errors, array, submit).
- [`valid`](../../io/utils/valid.md) — JSON-Schema validator; `valid.compile(schema)` is the resolver.
- [`reactiveBind`](../../dom/rendering/reactiveBind.md) — signal → DOM binding controller used internally.
- [`signal`](../../io/utils/signal.md) — reactive signals powering `watch`.
