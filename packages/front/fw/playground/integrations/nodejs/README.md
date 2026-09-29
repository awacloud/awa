# Playground — Node.js ("à la carte" consumption)

**Runtime** example: consuming `@awacloud/fw` under **plain Node**, without a
bundler, by importing a few worker-safe modules by subpath then resolving
them via the typed DI runtime.

See the reference integration: [`integrations/nodejs/README.md`](../../../integrations/nodejs/README.md).

## Run

```sh
node app.mjs
```

Run from this directory (or `npm start` — the `start` script runs `node app.mjs`).

## What `app.mjs` does

- `import { createRuntime } from '@awacloud/fw/typed'` — typed runtime facade.
- Subpath imports of three **worker-safe** modules:
  `@awacloud/fw/io/codec/hex.js`, `@awacloud/fw/crypto/hash/sha256.js`,
  `@awacloud/fw/io/codec/cbor.js`.
- `createRuntime([...])` (which calls `registerAllDeep` internally) +
  explicit `registerDeep` / `registerAllDeep`, then `resolve(...)`.
- A small **digest**: object → `cbor.encode` → `sha256.hash` → `hex.fromBytes`.

Server boundary: **no `dom/*` module** is resolved here (browser-only).

## Expected output

```
value        : {"hello":"world","n":42,"items":[1,2,3]}
cbor bytes   : a3616e182a6568656c6c6f65776f726c64656974656d7383010203 (27 bytes)
sha256(cbor) : ed282bb13d95a6fd9ab37691789dc0cd7dcef58b74161a6cf56fab7654417184
```

(The digest matches Node's `crypto.createHash('sha256')` on the same CBOR
bytes — deterministic encoding via `{ deterministic: true }`.)

## Node-native profile

`@awacloud/fw`'s `package.json` is **bun**-oriented by default. To develop
100% under Node (Vitest, `tsc`, builds via `--backend esbuild`), take the
substitute profile
[`integrations/nodejs/package.node.example.json`](../../../integrations/nodejs/package.node.example.json)
as a model.
