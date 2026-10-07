# Optional Content (Layers) — ISO 32000-2 §8.11

Optional layers — conditional visibility of content.

| Module | Returns | Deps | Description |
|--------|----------|------|-------------|
| [`pdfOCG`](./ocg.md) | `{ typeOCG, typeUsage }` | `pdfErrors`, `pdfParser` | OCG dict §8.11.2. |
| [`pdfOCConfig`](./config.md) | `{ typeOCConfig, typeUsageApp }` | `pdfErrors`, `pdfParser` | OC Configuration §8.11.4. |

## Read pattern

```js
const ocg = runtime.resolve('pdfOCG');
const cfg = runtime.resolve('pdfOCConfig');
const props = catalog.ocProperties;
const groups = props.entries.OCGs.items.map(ref => ocg.typeOCG(resolveRef(ref)));
const defaultCfg = cfg.typeOCConfig(resolveRef(props.entries.D));
```

## See also

- [Catalog](../document/catalog.md) — `/OCProperties`.
- [Content streams](../content/README.md) — `BMC /OC … EMC`.
