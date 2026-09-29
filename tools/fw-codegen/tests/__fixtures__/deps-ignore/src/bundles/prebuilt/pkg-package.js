/* GENERATED — do not edit. Source: tools/generate-prebuilds.mjs */
//
// Mirrors the office `<pkg>-package.js` shape: a generated bundle declaring
// host-injected dependency names that exist in NO module file of the package.
// Scanning it aborts the whole package unless it is ignored.
export const pkgPackage = {
    name: 'pkgPackage',
    dependencies: ['ghostFromHost'],
    factory(ghostFromHost) {
        return { ghost: ghostFromHost };
    },
};
