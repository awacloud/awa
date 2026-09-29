# Test format

Test convention for all framework modules. Runner: **`bun test`**.

## Location

The test lives **next to** the module it validates:

```
src/io/codec/csv.js
src/io/codec/csv.test.js
```

No separate `__tests__/` or `tests/` folder — strict co-location.

## Minimum skeleton

```js
import { describe, test, expect, beforeEach } from 'bun:test';
import { myModule } from './myModule.js';

describe('myModule module', () => {
    test('should have correct module metadata', () => {
        expect(myModule.name).toBe('myModule');
        expect(myModule.dependencies).toEqual([]);   // or ['dep1', 'dep2']
        expect(typeof myModule.factory).toBe('function');
    });

    describe('factory', () => {
        test('should create instance with expected API', () => {
            const inst = myModule.factory();
            expect(inst).toBeDefined();
            expect(typeof inst.method1).toBe('function');
            // ... all public members
        });
    });

    describe('method1', () => {
        let inst;
        beforeEach(() => { inst = myModule.factory(); });

        test('happy path', () => { /* ... */ });
        test('edge case X', () => { /* ... */ });
        test('throws on invalid input', () => {
            expect(() => inst.method1(null)).toThrow();
        });
    });
});
```

## Mandatory sections

Every `*.test.js` file must contain **at minimum**:

| Block | Role |
|------|------|
| `describe('<name> module', ...)` | Root container |
| Metadata test | Verifies `name`, `dependencies`, `factory` |
| Factory API test | Verifies that the factory returns all expected members |
| `describe(<method>)` × N | One per non-trivial public method |
| Error tests / edge cases | `throw`, empty values, invalid types |

If the module does round-trips (codec, serialisation), add:

| Block | Role |
|------|------|
| `describe('round-trip')` | `decode(encode(x)) === x` over several typical values |

## Naming conventions

- The root `describe` is `'<name> module'` (not `'<Name>'` nor `'tests <name>'`).
- Sub-`describe` blocks carry the **exact name of the public method** (e.g. `'parseQuery'`, not `'parsing queries'`).
- `test` names start with a verb or a fact, without a redundant `should` prefix. Acceptable:
  - `test('returns empty array on empty input', …)`
  - `test('throws on unterminated quoted field', …)`
  - `test('round-trip with custom delimiter', …)`

## Dependencies: manual factory wiring

Tests instantiate the factory **directly** without going through `runtime.resolve` — they control the dependencies:

```js
import { mime } from './mime.js';
import { utf8 } from './utf8.js';

// Minimal stub for external deps outside the test's scope
const randomStub = {
    bytes(n) { const out = new Uint8Array(n); crypto.getRandomValues(out); return out; }
};

const codec = mime.factory(utf8.factory(), randomStub);
```

No auto-resolution in tests. This:
- Guarantees isolation (no runtime cache effect).
- Explicitly documents dependencies.
- Allows stubbing where needed.

## `beforeEach` rather than `beforeAll`

For modules with internal state (codec with buffer, queue with items in progress), use `beforeEach` to start from a fresh instance:

```js
let inst;
beforeEach(() => { inst = myModule.factory(); });
```

`beforeAll` is reserved for **immutable** expensive setups (e.g. pre-computing a large reference vector).

## Test vectors

When a standard provides official vectors (RFC, CAVP, Appendix), include them as-is:

```js
describe('RFC 4648 §10 test vectors', () => {
    const vectors = [
        ['',       ''],
        ['f',      'Zg=='],
        ['fo',     'Zm8='],
        // ...
    ];
    for (const [input, expected] of vectors) {
        test(`encode ${JSON.stringify(input)} → ${expected}`, () => {
            expect(codec.encode(input)).toBe(expected);
        });
    }
});
```

## What we do **not** test

- Private implementation details (internal variables, `_xxx` helpers).
- Behaviour of the DI runtime (covered by `runtime.test.js`).
- Code from dependencies (covered by their own tests).

## Running

```bash
# One file
bun test src/io/codec/csv.test.js

# A directory
bun test src/io/codec/

# The whole framework
bun test packages/front/fw/
```

Expected output:

```
 552 pass
 0 fail
 1115 expect() calls
Ran 552 tests across 11 files. [111.00ms]
```

**No test must fail or be skipped** before a module is considered delivered.

## Special cases

### Worker-safe module tested outside a worker

Worker-safe modules can be tested directly in the bun main thread — workers are not instantiated in tests.

### DOM module (not worker-safe)

Bun exposes a minimal DOM via `happy-dom` or `jsdom`. These modules often require an explicit setup — see the existing `dom`/`events` tests for the pattern.

### Crypto / NIST CAVP vectors

Keep official vectors as commented hex strings with their reference (`COUNT=0`, archive, CSRC URL). Do not rewrite as binary literals.

## Review checklist

Before considering a test suite complete:

- [ ] Module metadata tested
- [ ] All public members have at least one `describe`
- [ ] Error cases / `throw` covered
- [ ] Round-trip if applicable
- [ ] Official vectors if a standard is implemented
- [ ] No `test.skip` / `test.only` left
- [ ] `bun test <file>` passes at 100%

## See also

- [Documentation format](./doc-format.md)
- [Module pattern](./module-pattern.md)
- [Module creation workflow](./module-creation-workflow.md)
