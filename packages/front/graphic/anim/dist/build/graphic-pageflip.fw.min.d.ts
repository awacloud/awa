/* GENERATED — do not edit. Source: tools/generate-bundles.mjs */

import type { Pageflip, PageflipOptions } from '@awacloud/graphic-anim';

/** `graphicPageflipPackage`: register it on an `@awacloud/fw` runtime that provides its dependencies, or pass one value per dependency. */
export declare const graphicPageflipPackage: {
    name: 'graphicPageflipPackage';
    dependencies: ['secPolicy', 'dom', 'interp', 'easing', 'clock', 'graphic.scopedIds', 'graphic.svgApply', 'graphic.svgBuild', 'graphic.tween', 'graphic.timeline'];
    factory(secPolicy: unknown, dom: unknown, interp: unknown, easing: unknown, clock: unknown, graphic_scopedIds: unknown, graphic_svgApply: unknown, graphic_svgBuild: unknown, graphic_tween: unknown, graphic_timeline: unknown): { Pageflip: new (opts: PageflipOptions) => Pageflip; pageflip: (opts: PageflipOptions) => Pageflip };
};
