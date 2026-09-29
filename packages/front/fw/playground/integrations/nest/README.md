# Playground — NestJS consumer

Runnable example of a NestJS backend reusing `@awacloud/fw`'s hand-written
crypto/codec primitives server-side, via the official
[`@awacloud/fw/nest`](../../../integrations/nestjs/README.md) integration
(`FwModule.forFeature([...])`).

> **Marginal need, assumed.** `@awacloud/fw` is a *front* framework. The point
> server-side is sharing the **same** hand-written crypto/codec between the
> browser client and the Nest server (identical hash/encoding on both sides),
> or reusing fw primitives in shared libs (e.g. `office`). The **DOM is out of
> scope** — `fw.dom.*` modules are rejected at bootstrap by `FwModule`'s guard.

## Run

```sh
npm i && npm start
```

Run from this directory. `npm start` compiles the TypeScript (`tsc`,
decorators + `emitDecoratorMetadata`) and runs `dist/main.js`. `main.ts`
boots a standalone Nest application context, resolves `SignService`, and logs:

```
payload: {"hello":"world","n":42}
sha256(cbor(payload)): <64 hex chars>
```

## What it shows

- `FwModule.forFeature([sha256, cbor, bitArray, hex])` — imported **module
  objects** (tree-shakable), not names. Transitive deps (`utf8`) register
  automatically, but only **head modules** become injectable Nest providers,
  so `bitArray` and `hex` are listed explicitly.
- `@Inject('sha256')` / `@Inject('cbor')` / `@Inject('bitArray')` /
  `@Inject('hex')` into `SignService` — the token is the module `name`.
- A `digest(payload)` that SHA-256-hashes the CBOR encoding of the payload —
  bridging bytes to SJCL words with `bitArray.ui8_to_ba(...)` (no hand-written
  conversion), and a `digestHex(payload)` that renders it via the fw `hex`
  codec (`hex.fromBytes(bitArray.ba_to_ui8(digest))`).

## Files

- `src/app.module.ts` — `@Module({ imports: [FwModule.forFeature([sha256, cbor, bitArray, hex])], providers: [SignService] })`
- `src/sign.service.ts` — `@Injectable()`, injects `'sha256'` + `'cbor'` + `'bitArray'` + `'hex'`, `digest(payload)` / `digestHex(payload)`
- `src/main.ts` — bootstrap + resolve + log
- `package.json` / `tsconfig.json`
