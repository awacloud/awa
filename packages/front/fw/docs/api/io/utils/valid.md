---
module: valid
category: io/utils
dependencies: []
returns: object
worker-safe: true
status: complete
---

# valid

> JavaScript type detection + schema validation (JSON Schema draft 2020-12 subset).

**Module** `valid` | **Source** `packages/front/fw/src/io/utils/valid.js` | **Deps** none | **Worker-safe** yes

Two distinct surfaces:
1. **Type guards** — `is`, `isNumber`, `isString`, … (unchanged, used internally by `buffer`).
2. **Schema validation** — `validate`, `test`, `compile` for payload/form/options.

## Resolve

```js
const valid = runtime.resolve('valid');
// Returns: { is, isNumber, isString, isBoolean, isArray, isObject,
//             isUint8Array, isUint8ClampedArray, isFunction,
//             validate, test, compile, formats, __map }
```

## API — Type guards

| Method | Signature | Description |
|--------|-----------|-------------|
| `is` | `(obj) => string` | Lowercase type name (e.g. `"number"`, `"uint8array"`) |
| `isNumber` | `(obj) => boolean` | `typeof obj === 'number' && Number.isFinite(obj)` (strict: excludes `NaN`, `Infinity`, strings) |
| `isString` | `(obj) => boolean` | `[object String]` |
| `isBoolean` | `(obj) => boolean` | `true`, `false`, `[object Boolean]` |
| `isArray` | `(obj) => boolean` | `[object Array]` |
| `isObject` | `(obj) => boolean` | `[object Object]` (plain object) |
| `isUint8Array` | `(obj) => boolean` | `[object Uint8Array]` |
| `isUint8ClampedArray` | `(obj) => boolean` | `[object Uint8ClampedArray]` |
| `isFunction` | `(obj) => boolean` | `[object Function]` |

## API — Schema validation

| Method | Signature | Returns |
|--------|-----------|---------|
| `validate` | `(value, schema, options?) => {valid, errors}` | Detailed error list |
| `test` | `(value, schema, options?) => boolean` | Boolean short-circuit |
| `compile` | `(schema, options?) => {validate, test}` | Validator pre-bound to a schema |
| `formats` | `Object<string, RegExp>` | Built-in formats accessible for reading |

### Options

```ts
{ formats?: Object<string, RegExp | (v: string) => boolean> }
```

Custom formats extend or override built-ins.

## Supported keywords

| Category | Keywords |
|----------|----------|
| **Type** | `type`, `nullable`, `const`, `enum` |
| **String** | `minLength`, `maxLength`, `pattern`, `format` |
| **Number** | `minimum`, `maximum`, `exclusiveMinimum`, `exclusiveMaximum`, `multipleOf` |
| **Array** | `items`, `minItems`, `maxItems`, `uniqueItems` |
| **Object** | `properties`, `required`, `additionalProperties`, `patternProperties` |
| **Combinators** | `allOf`, `anyOf`, `oneOf`, `not` |

**Accepted JSON Schema types**: `'string'`, `'number'`, `'integer'`, `'boolean'`, `'null'`, `'object'`, `'array'`, or an array of these values (union).

### Built-in formats

| Format | Example | Reference |
|--------|---------|-----------|
| `email` | `user+tag@example.co.uk` | WHATWG HTML5 §4.10.5.1.5 + RFC 5321 limits |
| `url` | `https://example.com/a` | Pragmatic (http/https scheme) |
| `uuid` | `550e8400-e29b-41d4-a716-446655440000` (v1–v5) | RFC 4122 |
| `date` | `2024-01-15` | ISO 8601 |
| `datetime` | `2024-01-15T10:30:00Z` or `…+02:00` | ISO 8601 |
| `ipv4` | `192.168.1.1` | RFC 791 |
| `ipv6` | `2001:db8::1`, `::ffff:192.0.2.1`, `fe80::1%eth0` | RFC 4291 + RFC 6874 zone ID |
| `hex` | `deadBEEF` | — |
| `base64` | `dGVzdA==` | RFC 4648 |

**Email — full validation**:
- Local-part character set RFC 5322 (alphanum + `.!#$%&'*+/=?^_`{|}~-`).
- Strict dot-atom RFC 5321 §4.1.2: no leading, trailing, or consecutive `.`.
- Domain LDH labels (letter/digit/hyphen), hyphen never at boundaries, label ≤ 63 chars.
- Length limits RFC 5321 §4.5.3.1: local ≤ 64, domain ≤ 255, total ≤ 254.
- TLD ≥ 2 chars.
- Quoted local-parts (`"..."@`) and IDN/SMTPUTF8 (Unicode) are intentionally **rejected** — not supported by the vast majority of providers and a classic source of injection bugs. For IDN, provide a custom `format`.
- ReDoS-safe regex (no exponential backtracking).

**IPv6 — full RFC 4291 coverage**:
- Preferred form `x:x:x:x:x:x:x:x` (8 groups of 1–4 hex).
- Compressed form `::` (only one per address): `::`, `::1`, `2001:db8::`, `2001:db8::1`.
- IPv4-mapped: `::ffff:192.0.2.1`, `::ffff:0:192.0.2.1` (RFC 4291 §2.5.5.2).
- IPv4-translated (legacy): `::192.0.2.1` (§2.5.5.1).
- IPv4-embedded: `2001:db8:3:4::192.0.2.1`, `64:ff9b::192.0.2.1` (RFC 6052).
- Link-local zone ID: `fe80::1%eth0`, `fe80::%1` (RFC 6874).
- Uppercase hex accepted.
- ReDoS-safe (non-overlapping alternatives).

An unknown `format` is silently ignored ("annotation only" behavior per JSON Schema default).

## Examples

### Type guards

```js
valid.is(42);                  // "number"
valid.is(new Uint8Array());    // "uint8array"
valid.isObject({ x: 1 });      // true
valid.isNumber(5);             // true
valid.isNumber('5');           // false — strict (typeof + isFinite)
```

### Simple validation

```js
valid.test('hello', { type: 'string' });            // true
valid.test(42, { type: 'integer', minimum: 0 });    // true
valid.test(-1, { type: 'integer', minimum: 0 });    // false
```

### Application object (user creation payload)

```js
const userSchema = {
    type: 'object',
    required: ['name', 'email'],
    properties: {
        name:  { type: 'string', minLength: 1, maxLength: 50 },
        email: { type: 'string', format: 'email' },
        age:   { type: 'integer', minimum: 0, maximum: 150 },
        tags:  { type: 'array', items: { type: 'string' }, uniqueItems: true },
        role:  { enum: ['admin', 'user', 'guest'] }
    },
    additionalProperties: false
};

const { valid: ok, errors } = valid.validate(
    { name: '', email: 'bad', age: -5 },
    userSchema
);
// ok === false
// errors: [
//   { path: '/email',  keyword: 'required', ... },   // if email was missing
//   { path: '/name',   keyword: 'minLength', ... },
//   { path: '/email',  keyword: 'format',    ... },
//   { path: '/age',    keyword: 'minimum',   ... }
// ]
```

### Arrays and composite types

```js
// Homogeneous array
valid.test([1, 2, 3], { type: 'array', items: { type: 'integer' } });    // true

// Type union
valid.test('x', { type: ['string', 'number'] });                          // true
valid.test(null, { type: 'string', nullable: true });                     // true
```

### Combinators

```js
// String OR number
valid.test(42, { anyOf: [{ type: 'string' }, { type: 'number' }] });      // true

// Non-empty string AND length ≤ 10
const s = { allOf: [{ type: 'string' }, { minLength: 1 }, { maxLength: 10 }] };

// Exactly one of the two
valid.test('x', { oneOf: [{ type: 'string' }, { type: 'number' }] });     // true

// Negation
valid.test(42, { not: { type: 'string' } });                              // true
```

### Custom format

```js
const schema = { type: 'string', format: 'slug' };
const opts = { formats: { slug: /^[a-z0-9-]+$/ } };

valid.test('my-slug', schema, opts);      // true
valid.test('Not A Slug', schema, opts);   // false

// Function instead of regex
valid.test('42', { type: 'string', format: 'even' }, {
    formats: { even: s => parseInt(s, 10) % 2 === 0 }
});
```

### Pre-compilation (hot path)

```js
const userCheck = valid.compile(userSchema);

for (const user of users) {
    if (!userCheck.test(user)) {
        console.warn('invalid', userCheck.validate(user).errors);
    }
}
```

### patternProperties / additionalProperties

```js
// All keys starting with x_ must be numeric
valid.test(
    { x_a: 1, x_b: 2, name: 'ok' },
    {
        type: 'object',
        properties: { name: { type: 'string' } },
        patternProperties: { '^x_': { type: 'number' } }
    }
); // true

// Strict: reject any undeclared property
valid.test(
    { a: 1, unexpected: 2 },
    { type: 'object', properties: { a: { type: 'number' } }, additionalProperties: false }
); // false
```

## Error structure

Each element of `errors`:

```js
{
    path:    '/user/email',     // JSON-Pointer-like
    keyword: 'format',          // keyword that failed
    message: 'does not match format email'
}
```

The path is always of the form `'/<segment>/<segment>...'` (root = `'/'`).

## Worker Usage

```js
const worker = fw.createWorker(
    function ({ libs, args }) {
        const [value, schema] = args;
        const result = libs.valid.validate(value, schema);
        self.postMessage(result);
    },
    { dependencies: ['valid'], args: [payload, mySchema] }
);
```

## Notes

- **No `$ref` / `$defs` / JSON-Pointer** — for recursive or catalogued schemas, introduce a dedicated `schema` module based on a third-party validator (Ajv, Zod-like).
- `isNumber` requires `typeof === 'number' && isFinite` — excludes `NaN`, `Infinity`, and any string. For numeric strings, use `{ type: 'number' }` via `validate`.
- `NaN` / `Infinity` always fail `{ type: 'number' }` (only finite values accepted).
- `integer` is a subset of `number`: `{ type: 'number' }` accepts `42` and `1.5`, `{ type: 'integer' }` accepts only `42`.
- `const` and `enum` use **deep equality** (arrays and objects compared recursively).
- `uniqueItems` also uses deep equality — costly on large arrays (O(n²)); pre-compiling the schema does not speed up this step (structurally quadratic).
- `multipleOf` uses a 1e-12 tolerance to support `0.1 * 3` vs `0.3` — sufficient for application data, not for scientific computation.
- `additionalProperties: true` (default) = all accepted; `false` = strict rejection; object = schema applied to undeclared properties.

## See also

- [buffer](../codec/buffer.md) — uses `valid.is()` for type dispatch
- [csv](../codec/csv.md), [url](../codec/url.md) — typically validated upstream via `valid.compile()`
