---
module: form
category: dom/utils
dependencies: [dom, events]
returns: object
worker-safe: false
status: complete
---

# form

> Bidirectional input ↔ state binding + complete form state machine (values, dirty, touched, errors, submit).

**Module** `form` | **Source** `packages/front/fw/src/dom/utils/form.js` | **Deps** `dom`, `events` | **Worker-safe** no

## Resolve

```js
const form = runtime.resolve('form');
// → { bind, create }
```

## API

| Method | Signature | Returns |
|---------|-----------|---------|
| `bind` | `(name, element, getter, setter, opts?) => { refresh, destroy }` | Bidirectional sync 1 input ↔ 1 source |
| `create` | `(spec) => FormController` | Complete form state machine (values, validation, submit) |

### API levels

| Level | API | Usage |
|---|---|---|
| Low-level | `form.bind(name, element, getter, setter, opts?)` | Sync 1 input ↔ 1 value source. A good building block for simple cases. |
| High-level | `form.create(spec)` | Complete form state machine. Values + validation + submit lifecycle. |

---

### `form.bind(name, element, getter, setter, opts?)`

Bidirectional sync between an input and an external source.

```js
let userInput = '';
const handle = form.bind('myInput', inputEl,
    () => userInput,
    (v) => { userInput = v; },
    { event: 'input' }
);
// `inputEl.value` initialised from `userInput`. Each keystroke → setter called.

handle.refresh();   // re-sync from getter
handle.destroy();   // removes the listener (idempotent)
```

| Option | Type | Description |
|---|---|---|
| `event` | `string` | DOM source event (`'input'` default, `'change'`, `'blur'`). |
| `checked` | `boolean` | If true, syncs `element.checked` (checkbox/radio) instead of `element.value`. |

---

### `form.create(spec)`

Creates a form state machine. Returns a `controller` with values, errors, touched, dirty, and a complete submit cycle.

```js
const f = form.create({
    fields: {
        email:    { required: true, validate: (v) => /@/.test(v) ? null : 'Email invalide' },
        password: { required: true, validate: (v) => v.length >= 8 ? null : '8 char min' },
        remember: { type: 'boolean', default: false },
    },
    validate: (vals) => vals.email === vals.password ? { password: 'Trop simple' } : {},
    onSubmit: async (vals) => {
        await api.login(vals);
    },
});

// Connect to DOM
f.attach('email',    emailInput);
f.attach('password', passwordInput);
f.attach('remember', rememberCheckbox);

// Reactive state (subscribe to re-render)
f.subscribe(({ values, errors, touched, isValid, submitting }) => {
    updateUI({ values, errors, touched, isValid, submitting });
});

// Submit
submitBtn.addEventListener('click', () => f.submit());
```

#### Spec

| Field | Type | Description |
|---|---|---|
| `fields` | `Object<name, FieldSpec>` | **Required.** Field descriptors. |
| `validate` | `(values) → {field: err}` | Optional. Cross-field validation. |
| `onSubmit` | `(values) → void\|Promise` | Optional. Submit handler, async-aware. |

**FieldSpec**:

| Field | Description |
|---|---|
| `default` | Initial value (otherwise `''` or `false` depending on `type`). |
| `type` | `'boolean'` for checkbox/radio, `'array'` for multi-value fields, otherwise `'string'` by default. |
| `required` | `true` to reject empty values; custom message via `requiredMessage`. |
| `validate(value, allValues)` | Returns `null` if OK, an error string otherwise. Can be **async** (returns `Promise<string\|null>`). |
| `itemValidate(value)` | For `type: 'array'` — per-item validator. |

#### Controller (instance)

| Member | Description |
|---|---|
| `f.values` | Snapshot `{name: value}`. |
| `f.errors` | Snapshot `{name: errorMsg}` (array of strings for `type: 'array'`). |
| `f.touched` / `f.dirty` | Boolean snapshots. |
| `f.validating` | Snapshot `{name: boolean}` — `true` during an in-flight async validation. |
| `f.isValid` | `false` if `errors` is non-empty **or** if a field is currently being validated async. |
| `f.submitting` | Boolean — true while `submit()` is in flight. |
| `f.get(name)` / `f.set(name, val)` | Programmatic read/write of a field. |
| `f.touch(name)` | Marks as touched (typical: on blur). |
| `f.attach(name, element, opts?)` | Connects a DOM input to the field. |
| `f.detach()` | Detaches all inputs (state preserved). |
| `f.validate()` | Re-validates everything. Returns `Promise<boolean>` (`isValid`). |
| `f.subscribe(fn)` | Subscribes to changes. Returns `unsubscribe()`. |
| `f.snapshot()` | Full snapshot `{values, errors, touched, dirty, isValid, submitting, validating}`. |
| `f.reset(overrides?)` | Reverts to defaults. Touched/dirty cleared. |
| `f.submit()` | Awaits async validations, then validate → run `onSubmit`. Returns `Promise<boolean>`. |
| `f.array(name)` | Returns an `ArrayField` controller for a `type: 'array'` field. |

#### `ArrayField` (`f.array(name)`)

| Member | Description |
|---|---|
| `arr.push(value)` | Appends an item. |
| `arr.remove(index)` | Removes the item at `index`. |
| `arr.move(from, to)` | Moves the item. |
| `arr.length` | Current item count. |

`snapshot()` deep-clones array values to prevent accidental mutations.

### Submit semantics

1. Marks all fields as `touched` (to make errors visible).
2. Re-validates everything (`validateAll()`).
3. If `isValid === false` → returns `false`. `onSubmit` is not called.
4. Otherwise: `submitting = true`, calls `await onSubmit(values)`.
5. `submitting = false` (`finally`, even if `onSubmit` rejects).
6. Returns `true`.

## Examples

### Complete with uiSession

```js
const ui = runtime.resolve('uiSession')('app');
const form = runtime.resolve('form');

ui.add([{ id: 'loginForm', block: loginTpl, data: {} }]);

const f = form.create({
    fields: {
        username: { required: true, requiredMessage: 'Nom utilisateur requis' },
        password: { required: true, validate: (v) => v.length >= 8 ? null : '≥ 8 chars' },
    },
    onSubmit: async (vals) => { await api.login(vals); },
});

f.attach('username', ui.get('loginForm', 'usernameInput'));
f.attach('password', ui.get('loginForm', 'passwordInput'));

f.subscribe(({ errors, touched, isValid, submitting }) => {
    for (const field of ['username', 'password']) {
        const showErr = touched[field] && errors[field];
        ui.text('loginForm', `${field}Err`, showErr || '');
    }
    ui.attr('loginForm', 'submitBtn', 'disabled', !isValid || submitting ? '' : null);
});

ui.on('loginForm', 'submitBtn', 'click', () => f.submit());
```

## Notes

- **No fine-grained reactivity**: `subscribe` re-fires on every mutation. For very large forms, accumulate changes via `requestAnimationFrame` on the consumer side.
- **Async validation**: `validate(v)` may return a `Promise`. `f.validating[name]` is `true` while waiting. `isValid` returns `false` during any in-flight validation (conservative). `submit()` waits for all async validations to resolve before invoking `onSubmit`.
- **`f.snapshot()` deep-clones arrays** — mutating returned values has no effect on internal state.
- **`type: 'boolean'`** and **`type: 'array'`** are the only automatic discriminations; for `number`, `date`, etc., the consumer converts in `validate` or before `set()`.

## See also

- [dom](../query/dom.md) — `val`/`valGet`/`checked`/`checkedGet` used internally.
- [events](../query/events.md) — managed listeners for `attach`.
- [component](../rendering/component.md) — combine form + component for reusable forms.
