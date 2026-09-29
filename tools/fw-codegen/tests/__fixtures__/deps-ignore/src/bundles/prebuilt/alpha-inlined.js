/* GENERATED — do not edit. Source: tools/generate-prebuilds.mjs */
//
// Duplicate-name leak guard: a generated bundle RE-DECLARING a real module's
// name (`alpha`). It must never be selected as the import target for gamma's
// `alpha` dependency — nor abort the scan on a duplicate-name collision.
export const alphaInlined = {
    name: 'alpha',
    version: '1.0.0',
    dependencies: [],
    factory() {
        return { a: 'inlined-copy' };
    },
};
