# IO / i18n

Minimal translation and localisation system over the native `Intl.*` APIs.

| Module | Returns | Deps | Description |
|--------|----------|------|-------------|
| [i18n](./i18n.md) | `{create}` | none | Catalogues, interpolation, plurals, formats |

## Common pattern

```js
const i18n = runtime.resolve('i18n');
const tr = i18n.create({
    locale: 'fr-FR',
    fallback: 'en',
    catalogs: {
        'fr-FR': { greeting: 'Bonjour {name}' },
        en:      { greeting: 'Hello {name}' },
    }
});

tr.t('greeting', { name: 'Alice' }); // 'Bonjour Alice'
```
