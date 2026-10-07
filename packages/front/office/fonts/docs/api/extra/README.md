# Extra — Heavy / specialised features

Modules beyond the core OpenType tables: hinting VM, WOFF2 encoder, complex shapers, AAT, signature.

| Module | Returns | Deps | Description |
|--------|----------|------|-------------|
| [tt-hinting](./tt-hinting.md) | `{ interpret, RM05_OPCODES, RM05_DEFERRED_COUNT, GraphicsState, Zone }` | `fontErrors`, `fontReader`, `ttHintingGs`, `ttHintingOpCatalog`, `ttHintingOpPush`, `ttHintingOpStack`, `ttHintingOpMath`, `ttHintingOpControl`, `ttHintingOpGs`, `ttHintingOpOutline`, `ttHintingOpCvt` | RM05 bytecode VM (191 of 220 catalogued opcodes recognized). |
| [woff2-write](./woff2-write.md) | `{ encode, encodeWoff2, WOFF2_MAGIC }` | `fontErrors`, `fontWriter`, `fontSfnt`, `brotli` | WOFF2 encoder (no glyf/loca transform). |
| [dsig](./dsig.md) | `{ parseDsig, DSIG_VERSION, DSIG_FORMAT_PKCS7 }` | `fontErrors`, `fontReader` | Parses DSIG (raw PKCS#7). |
| [math](./math.md) | `{ parseMath, MATH_CONSTANTS_FIELDS }` | `fontErrors`, `fontReader` | MATH constants. |
| [jstf](./jstf.md) | `{ parseJstf }` | `fontErrors`, `fontReader`, `fontTag` | JSTF justification metadata. |
| [shaper-arabic](./shaper-arabic.md) | `{ arabicShape, arabicShapeString, joiningType, JOINING_TYPES }` | `fontErrors` | Joining types, UAX §9. |
| [shaper-indic](./shaper-indic.md) | `{ indicReorder, categorize, splitClusters, INDIC_SCRIPTS, DEVA_CATEGORIES, DEVANAGARI_CATEGORIES, DEVA_RA }` | `fontErrors` | Devanagari + related scripts. |
| [shaper-cjk](./shaper-cjk.md) | `{ cjkVertical, extractIVS, ... }` | `fontErrors` | Vertical forms + IVS. |
| [apple-aat/](./apple-aat/README.md) | 6 factories | reader | Apple AAT scaffolds. |
