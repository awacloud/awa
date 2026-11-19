// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * A TypeScript consumer of `@awacloud/graphic-anim`, compiled by
 * `tests/types-consumer.integration.test.js` (strict, --noEmit). It imports the
 * package by its own name, so every import resolves through the `exports` map
 * as an installed consumer's would. Each `@ts-expect-error` line is a claim
 * about what must NOT compile: if the declarations loosen, the directive goes
 * unused and the compile fails.
 */

import {
    createHypertree,
    createPageflip,
    graphicModules,
    type GraphicModuleDescriptor,
    type Hypertree,
    type HypertreeHandle,
    type Pageflip,
    type PageflipHandle,
    type Timeline,
    type TreeNode,
} from '@awacloud/graphic-anim';
import { foldModule } from '@awacloud/graphic-anim/kernels/pageflip/fold.js';
import { composeModule } from '@awacloud/graphic-anim/kernels/pageflip/compose.js';
import { hypertreeLayoutModule } from '@awacloud/graphic-anim/kernels/hypertree/layout.js';
import { hypertreeMeasureModule } from '@awacloud/graphic-anim/kernels/hypertree/measure.js';
import { svg3dVec3Module } from '@awacloud/graphic-anim/kernels/svg3d/vec3.js';
import { svg3dMeshModule } from '@awacloud/graphic-anim/kernels/svg3d/mesh.js';
import { svg3dProjectModule } from '@awacloud/graphic-anim/kernels/svg3d/project.js';
import { svg3dApplyModule } from '@awacloud/graphic-anim/kernels/svg3d/apply.js';

// ── The registry and the eight kernels ───────────────────────────────────────

const kernels: GraphicModuleDescriptor[] = [
    foldModule, composeModule, hypertreeLayoutModule, hypertreeMeasureModule,
    svg3dVec3Module, svg3dMeshModule, svg3dProjectModule, svg3dApplyModule,
];
export const names: string[] = [...graphicModules, ...kernels].map((m) => m.name);

// ── createHypertree ──────────────────────────────────────────────────────────

const tree: TreeNode = {
    id: 'root',
    label: 'Root',
    color: '#3b6ea8',
    children: [{ id: 'a', action: '#a', info: 'About a' }, { id: 'b' }],
};
const host = document.createElement('div');

const ht: HypertreeHandle = createHypertree(host, {
    tree,
    radius: 400,
    labelDepth: 1,
    onFocus: (id: string) => void id,
    onNodeDetail: (id, kind) => void [id, kind],
});
const t: Hypertree = ht.instance;
t.focus('a');

// The timeline a focus returns: scrub, pause, slow motion.
const turn: Timeline = t.focus('b');
turn.timeScale = 0.5;
turn.pause().seek(turn.duration).resume();
export const turnAt: number = turn.time;
export const held: boolean = turn.paused;
// @ts-expect-error `time` is read-only
turn.time = 3;
// @ts-expect-error `seek` takes a time in ms
turn.seek('end');
t.focusSync(t.rootId);
export const focused: string = t.focusId;
export const at: { x: number; y: number } | null = t.node('a');
ht.dispose();

// A forest is a tree input too.
createHypertree(host, { tree: [tree, { id: 'other' }] }).dispose();

// @ts-expect-error — opts.tree is required.
createHypertree(host, { radius: 400 });
// @ts-expect-error — the handle's instance is typed: no such member.
ht.instance.focusOn('a');
// @ts-expect-error — labelDepth is a number.
createHypertree(host, { tree, labelDepth: 'one' });

// ── createPageflip ───────────────────────────────────────────────────────────

const book: PageflipHandle = createPageflip(host, {
    pages: [{ id: 'p1' }, { id: 'p2', src: 'p2.png' }],
    width: 320,
    height: 480,
    spread: true,
});
const p: Pageflip = book.instance;
p.next();
p.goTo('p2');
export const current: string = p.currentId;
export const index: number = p.index;
book.dispose();

// @ts-expect-error — pages, width and height are required.
createPageflip(host, { width: 320, height: 480 });
// @ts-expect-error — the handle's instance is typed: no such member.
book.instance.turnTo('p2');
// @ts-expect-error — width is a number.
createPageflip(host, { pages: [{ id: 'p1' }], width: '320', height: 480 });

// ── dist surfaces ────────────────────────────────────────────────────────────

import { graphicTimelineBundled } from '@awacloud/graphic-anim/standalone/graphic-timeline-bundled.js';
import { graphicPageflipBundled } from '@awacloud/graphic-anim/build/graphic-pageflip.standalone.js';
import { graphicHypertreePackage } from '@awacloud/graphic-anim/build/graphic-hypertree.fw.min.js';
import { graphicModules as barrelModules } from '@awacloud/graphic-anim/build/index.js';

export const timelineName: string = graphicTimelineBundled.name;
export const none: [] = graphicTimelineBundled.dependencies;
export const timelineApi: unknown = graphicTimelineBundled.factory();
// @ts-expect-error — a standalone factory takes no argument.
graphicTimelineBundled.factory(1);

const pf = graphicPageflipBundled.factory();
const standaloneBook: Pageflip = pf.pageflip({ pages: [{ id: 'p1' }], width: 320, height: 480 });
standaloneBook.dispose();
// @ts-expect-error — the typed surface checks the options.
pf.pageflip({ pages: [{ id: 'p1' }], width: 320 });

export const fwDeps: string[] = graphicHypertreePackage.dependencies;
export const barrelCount: number = barrelModules.length;
