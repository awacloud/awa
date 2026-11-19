/* GENERATED — do not edit. Source: tools/generate-bundles.mjs */

import type { Hypertree, HypertreeOptions, TreeNode } from '@awacloud/graphic-anim';

/** `graphicHypertreePackage`: register it on an `@awacloud/fw` runtime that provides its dependencies, or pass one value per dependency. */
export declare const graphicHypertreePackage: {
    name: 'graphicHypertreePackage';
    dependencies: ['secPolicy', 'dom', 'interp', 'easing', 'clock', 'graphic.scopedIds', 'graphic.svgApply', 'graphic.svgBuild', 'graphic.scheduler', 'graphic.tween', 'graphic.timeline'];
    factory(secPolicy: unknown, dom: unknown, interp: unknown, easing: unknown, clock: unknown, graphic_scopedIds: unknown, graphic_svgApply: unknown, graphic_svgBuild: unknown, graphic_scheduler: unknown, graphic_tween: unknown, graphic_timeline: unknown): { Hypertree: { new (svgRoot: Element, tree: TreeNode | TreeNode[], opts?: HypertreeOptions): Hypertree; readonly FOREST_ORIGIN: string }; hypertree: (svgRoot: Element, tree: TreeNode | TreeNode[], opts?: HypertreeOptions) => Hypertree };
};
