# `@awacloud/fw/nest`

Official NestJS integration — **backend / Node**. Exposes the **environment-agnostic modules** of `@awacloud/fw` (crypto, codecs, compression, math, process, valid, eventBus…) as **Nest providers**.

> **Marginal need, assumed.** `@awacloud/fw` is a *front* framework. The server-side interest: sharing **the same** hand-written crypto/codec between browser client and Nest server (identical hash/signature/encoding on both sides), or reusing fw primitives in shared libs (e.g. `office`). **DOM is out of scope** (guard at bootstrap).

## Usage

Pass **imported module objects** (tree-shakable), not names:

```ts
import { Module, Inject, Injectable } from '@nestjs/common';
import { FwModule } from '@awacloud/fw/nest';
import { sha256 }   from '@awacloud/fw/crypto/hash/sha256.js';
import { cbor }     from '@awacloud/fw/io/codec/cbor.js';
import { bitArray } from '@awacloud/fw/crypto/utils/bitArray.js';

@Module({
    // Only top-level modules become injectable Nest providers —
    // `bitArray` is listed explicitly because we inject it below.
    imports: [FwModule.forFeature([sha256, cbor, bitArray])],
})
export class AppModule {}

@Injectable()
export class SignService {
    constructor(
        @Inject('sha256')   private readonly sha256: any,
        @Inject('cbor')     private readonly cbor: any,
        @Inject('bitArray') private readonly bitArray: any,
    ) {}
    digest(payload: unknown) {
        const bytes = this.cbor.encode(payload);              // Uint8Array
        // `sha256.hash` expects a UTF-8 string OR a bitArray (32-bit words),
        // NOT raw bytes → convert via bitArray.
        return this.sha256.hash(this.bitArray.ui8_to_ba(bytes));
    }
}
```

> ⚠️ **Crypto input shape**: `sha256.hash` interprets a `Uint8Array` as a *bitArray* (not as raw bytes). Passing `cbor.encode(...)` directly would produce a wrong hash — hence the `bitArray.ui8_to_ba(...)` bridge (and the `bitArray` injection). See the runnable example [`playground/integrations/nest`](https://github.com/awacloud/awa/tree/main/packages/front/fw/playground/integrations/nest).

- **Token** = the module `name` (`@Inject('sha256')`).
- **Transitive dependencies** are registered automatically (the `deps` field) — only pass top-level modules (here `sha256`/`cbor`/`bitArray`).
- `exports` is populated → other Nest modules can inject these tokens.

## DOM guard (out of scope)

Any `fw.dom.*` module (browser-only: freezes `window`/`document`) is **rejected at bootstrap**:

```ts
FwModule.forFeature([dom]); // ❌ throws: "dom" is browser-only (type "fw.dom.query")
```

Override possible but **not recommended**: `FwModule.forFeature([...], { allowDom: true })`.

## Options

| Option | Type | Default | Role |
|---|---|---|---|
| `global` | `boolean` | `false` | marks the Nest module as global |
| `allowDom` | `boolean` | `false` | allows `fw.dom.*` modules (not recommended server-side) |

## Notes

- **Peer `@nestjs/common`**: consumer dependency only; this integration **does not import** Nest (the `DynamicModule` is a structural shape) → zero hard dependency.
- Typing: `@Inject('name')` returns `any` at the Nest level; at the usage site, cast to the module's API type (see `@awacloud/fw/typed` `InstanceOf`).
- This is a Nest-idiomatic wrapper over the fw runtime; without Nest, `createRuntime` (`@awacloud/fw/typed`) already suffices on the server side.
