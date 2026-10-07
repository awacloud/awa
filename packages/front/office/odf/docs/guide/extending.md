# Extending @awacloud/odf

How to register opt-in extras on the `odt` / `ods` / `odp` orchestrators and how to
write your own. **Prerequisites.** `@awacloud/odf` and `@awacloud/fw`, with a
`runtime` wired as in [Getting started](./getting-started.md); the snippets below
reuse that `runtime`.

The three top-level orchestrators (`odt`, `ods`, `odp`) expose a
`.use(...extensions)` hook for registering opt-in extras that promote
elements from the catch-all `_extras` carry-bag into typed fields.

## Walker hook surface

| Hook prefix | Visits |
|---|---|
| `hydrate*` / `dehydrate*Paragraph` | `text:p` nodes |
| `hydrate*` / `dehydrate*Span` | `text:span` nodes |
| `hydrate*` / `dehydrate*Heading` | `text:h` nodes (odt) |
| `hydrate*` / `dehydrate*List` | `text:list` nodes |
| `hydrate*` / `dehydrate*Table` | `table:table` nodes |
| `hydrate*` / `dehydrate*Cell` | `table:table-cell` nodes |
| `hydrate*` / `dehydrate*Frame` | `draw:frame` nodes |
| `hydrate*` / `dehydrate*Slide` | `draw:page` slides (odp) |
| `hydrate*` / `dehydrate*Metadata` | `meta.xml` body |
| `hydrate*` / `dehydrate*Settings` | `settings.xml` body |
| `hydrate*` / `dehydrate*Styles` | `styles.xml` body |

`hydrate*` runs after the core parser, `dehydrate*` runs before the
core renderer. An extension may implement any subset of hooks.

## Anatomy of an extension

```js
export const myExtra = {
    name: 'myExtra',
    dependencies: ['xml'],
    factory(xml) {
        function hydrateParagraph(p) {
            if (!p || !p._extras) return p;
            // promote elements from p._extras into typed fields
            return p;
        }
        function dehydrateParagraph(p) {
            // mirror : demote typed fields back into _extras
            return p;
        }
        return { hydrateParagraph, dehydrateParagraph };
    }
};
```

Register :

```js
const odtInstance = runtime.resolve('odt');
odtInstance.use(myExtra.factory(runtime.resolve('xml')));
```

`.use(...)` is idempotent — passing the same extension instance twice
is a no-op.

## Conventions

- Extension factory must accept dependencies positionally (same order
  as `dependencies` array).
- Hooks must not mutate hidden state ; they may mutate the visited
  node in place (typical) or return a replacement (the walker swaps
  the reference).
- Promotion should always be reversible : `dehydrate(hydrate(x))`
  must produce a tree that round-trips through the core renderer.
- Preserve unknown attributes / children verbatim via `_extras`.
