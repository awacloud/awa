/* GENERATED — do not edit. Source: tools/generate-bundles.mjs */

import type { Hypertree, HypertreeOptions, TreeNode } from '@awacloud/graphic-anim';

/** `graphicHypertreeBundled`: every dependency inlined; `factory()` takes nothing. */
export declare const graphicHypertreeBundled: {
    name: 'graphicHypertreeBundled';
    dependencies: [];
    factory(): { Hypertree: { new (svgRoot: Element, tree: TreeNode | TreeNode[], opts?: HypertreeOptions): Hypertree; readonly FOREST_ORIGIN: string }; hypertree: (svgRoot: Element, tree: TreeNode | TreeNode[], opts?: HypertreeOptions) => Hypertree };
};
