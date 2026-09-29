# IO / Calc

Pure calculation modules — checksums and easing functions.

| Module | Returns | Deps | Description |
|--------|----------|------|-------------|
| [crc32](./crc32.md) | Constructor `Crc32` | none | Incremental CRC-32 checksum (polynomial 0xEDB88320) |
| [adler32](./adler32.md) | Constructor `Adler32` | none | Incremental Adler-32 checksum (RFC 1950) |
| [easing](./easing.md) | functions object | none | Easing functions for animations |
| [bigint](./bigint.md) | object | none | BigInt helpers (bytes, modPow, isPrime, randomBetween) |

## Common pattern (checksums)

```js
const Crc32 = runtime.resolve('crc32');
const checksum = new Crc32();

// Incremental processing
checksum.append(chunk1);
checksum.append(chunk2);
const value = checksum.get(); // unsigned 32-bit integer
```
