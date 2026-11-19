// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * Minimal hand-authored type surface for `@awacloud/graphic-anim`.
 *
 * Scope: the **public barrel** (`src/main.js`), the two constructible helpers
 * and the instances they return (`Pageflip`, `Hypertree`, their options).
 * Full typing of every module's resolved namespace is explicitly NOT the goal —
 * the authoritative per-module API stays JSDoc in `src/**` and prose in
 * `docs/**`. These declarations exist so a TypeScript consumer gets the shape of
 * what it imports (descriptor arrays, descriptor consts, helper signatures)
 * without the package growing a build step.
 *
 * Hand-authored and committed: `types/` is NOT generated — there is no `tsc`
 * emit in this package. Keep it in step with `src/main.js` by hand;
 * `tests/types-consumer.integration.test.js` compiles a strict consumer
 * against it.
 *
 * The 8 `./kernels/*` exports-map subpaths are declared separately: each has a
 * sibling `.d.ts` next to its resolved `src/**` source file (hand-authored,
 * same no-build rule), not listed here.
 */

/**
 * An `@awacloud/fw` module descriptor as this package authors them. Structural
 * on purpose: it must stay assignable to fw's own `ModuleDefinition` without
 * this package depending on fw's generated `.d.ts`.
 */
export interface GraphicModuleDescriptor {
    /** Registered module name (e.g. `graphic.tween`). */
    name: string;
    /** fw type tag (e.g. `fw.dom.graphic`). */
    type?: string;
    /** Semver of the descriptor. */
    version?: string;
    /** Dependency names, in factory-parameter order. */
    dependencies: string[];
    /** The same dependencies as descriptor references, for `registerDeep`. */
    deps?: GraphicModuleDescriptor[];
    /** Capture-free factory; receives one resolved dependency per name. */
    factory: (...args: any[]) => any;
}

/** A bundle entry of the `@awacloud/tool-prebuild-generator` input contract. */
export interface GraphicBundleEntry {
    /** Descriptor name; MUST end in `Bundle` (generator contract). */
    name: string;
    /** `[coreName, ...extraNames]`. */
    dependencies: string[];
    /** Pass-through factory. */
    factory: (...args: any[]) => any;
}

// ── Public barrel ────────────────────────────────────────────────────────────

/** Every graphic module descriptor, in topological registration order. */
export const graphicModules: GraphicModuleDescriptor[];

/** fw factory descriptors inlined (standalone) or injected (fw) by the generator. */
export const fw_require: GraphicModuleDescriptor[];

/** Same reference as {@link graphicModules}; the generator's input field name. */
export const modules: GraphicModuleDescriptor[];

/** Opt-in extra descriptors (empty today). */
export const extras: GraphicModuleDescriptor[];

/** One bare-core bundle entry per public `dist/standalone` resolution root. */
export const bundle: GraphicBundleEntry[];

export const lerpModule: GraphicModuleDescriptor;
export const easingModule: GraphicModuleDescriptor;
export const unitsModule: GraphicModuleDescriptor;
export const matrixModule: GraphicModuleDescriptor;
export const colorModule: GraphicModuleDescriptor;
export const scopedIdsModule: GraphicModuleDescriptor;
export const interpolateModule: GraphicModuleDescriptor;
export const svgApplyModule: GraphicModuleDescriptor;
export const svgBuildModule: GraphicModuleDescriptor;
export const schedulerModule: GraphicModuleDescriptor;
export const tweenModule: GraphicModuleDescriptor;
export const timelineModule: GraphicModuleDescriptor;
export const sceneModule: GraphicModuleDescriptor;
export const framesModule: GraphicModuleDescriptor;
export const pageflipModule: GraphicModuleDescriptor;
export const hypertreeModule: GraphicModuleDescriptor;
export const animAggregatorModule: GraphicModuleDescriptor;
export const svg3dModule: GraphicModuleDescriptor;

// ── Shared value types ───────────────────────────────────────────────────────

/** A `graphic.svgBuild` JSON template node. */
export interface NodeDesc {
    tag: string;
    attrs?: Record<string, string | number>;
    children?: (NodeDesc | string)[];
    text?: string | number;
}

/**
 * An easing: a curve `(t) => t'`, the name of a `graphic.easing` curve, or a CSS
 * timing function (`cubic-bezier(…)`, `steps(…)`, `ease`, `ease-in`, `ease-out`,
 * `ease-in-out`, `step-start`, `step-end`).
 */
export type Easing = ((t: number) => number) | string;

/** A `graphic.timeline` `Timeline` (the members a helper user touches). */
export interface Timeline {
    play(): Timeline;
    stop(): Timeline;
    readonly done: boolean;
    /** Render the whole timeline's state at `ms` and move its clock there. */
    seek(ms: number): Timeline;
    /** Hold the position; `resume()` continues. */
    pause(): Timeline;
    /** Continue from `time` (on an idle timeline: start a play cycle from there). */
    resume(): Timeline;
    /** Current position in ms. */
    readonly time: number;
    /** The latest child end, in ms. */
    readonly duration: number;
    readonly paused: boolean;
    /** Playback rate: a finite number >= 0 (1 real time). */
    timeScale: number;
}

// ── graphic.pageflip ─────────────────────────────────────────────────────────

/** One page of a book. */
export interface PageSpec {
    /** Stable page id (used by `goTo`; scoped for the DOM id). */
    id: string;
    /** Page content built via `graphic.svgBuild`; a plain page when omitted. */
    template?: NodeDesc;
    /** An image page (used when there is no `template`), loaded in the preload window. */
    src?: string;
}

/** `Pageflip` constructor options (and `createPageflip`'s `opts`). */
export interface PageflipOptions {
    /** The book's pages, in reading order (at least one). */
    pages: PageSpec[];
    /** Page width (SVG user units). */
    width: number;
    /** Page height (SVG user units). */
    height: number;
    prefix?: string;
    /** Turn duration in ms (default 300). */
    duration?: number;
    easing?: Easing;
    marginPercent?: number;
    ratio?: number;
    /** Fill of the leaf back (default `#e9e6df`). */
    backFill?: string;
    /** Spread gutter shadow width, as a fraction of the page width. */
    shadow?: number;
    /** The resolved fw `dom/query/events` surface (pointer corners). */
    events?: { scope: (...args: any[]) => any };
    /** Image pages: the preload window, in pages (default 8). */
    cache?: number;
    /** Image pages: loads in flight at most (default 1). */
    preloadConcurrency?: number;
    /** Image pages: the loader. */
    loadImage?: (src: string) => Promise<void>;
    /** `false` keeps a spread programmatic (no pointer corners). */
    pointer?: boolean;
    /** Two-page spread. */
    spread?: boolean;
    /** Override the shared scheduler (tests / isolation). */
    scheduler?: object;
}

/** A page-turn book (`graphic.pageflip`). */
export interface Pageflip {
    /** The id-scope prefix in force. */
    readonly prefix: string;
    /** Index of the current page (spread mode: of the current spread). */
    readonly index: number;
    /** Number of pages. */
    readonly pageCount: number;
    /** The built root; `null` after `dispose()`. */
    readonly el: SVGSVGElement | null;
    /** Id of the current page. */
    readonly currentId: string;
    /** Turn forward; the playing timeline, or `null` (at the end, mid-turn, disposed). */
    next(): Timeline | null;
    /** Turn backward; the playing timeline, or `null`. */
    previous(): Timeline | null;
    /** Turn to a page by id; the playing timeline, or `null`. */
    goTo(id: string): Timeline | null;
    /** An image page's load state. */
    imageState(id: string): string;
    /** Make the book the sole child of `el`. */
    mountInto(el: Element): this;
    /** Stop every in-flight timeline and detach. Idempotent. */
    dispose(): void;
}

// ── graphic.hypertree ────────────────────────────────────────────────────────

/** A tree node: the author's data. */
export interface TreeNode {
    id: string;
    label?: string;
    /** Branch colour (styled mode), inherited down the subtree. */
    color?: string;
    /** Styled mode: a link badge; its value reaches `onNodeDetail`. */
    action?: unknown;
    /** Styled mode: an info badge; its value reaches `onNodeDetail`. */
    info?: unknown;
    children?: TreeNode[];
}

/** The second argument of `onFocus`. */
export interface FocusInfo {
    previous: string | null;
    refocus: boolean;
}

/** `Hypertree` constructor options. */
export interface HypertreeOptions {
    /** Outer layout radius (SVG user units, default 500). */
    radius?: number;
    prefix?: string;
    /** Focus-transition duration in ms (default 400). */
    duration?: number;
    easing?: Easing;
    onFocus?: (id: string, info: FocusInfo) => void;
    /** Return `false` to cancel the internal focus. */
    onNodeClick?: (id: string, event: Event) => boolean | void;
    onNodeDetail?: (id: string, kind: 'action' | 'info', value: unknown, event: Event) => void;
    ignoreWhileFocusing?: boolean;
    maxLabel?: number;
    styled?: boolean | {
        bullet?: number;
        bulletFactor?: number;
        fontSize?: number;
        fontFamily?: string;
        palette?: string[];
    };
    nodeStyle?: (node: TreeNode, info: { depth: number; color: string }) => { color?: string } | void;
    /** Styled mode: a `graphic.svgBuild` template drawn in place of the root's dot. */
    rootGlyph?: NodeDesc;
    /** Styled mode: the detail-badge glyphs, `graphic.svgBuild` templates. */
    badgeGlyphs?: { action?: NodeDesc; info?: NodeDesc };
    rootGlyphRadius?: number;
    /** Show only the labels within this graph distance of the focus. */
    labelDepth?: number;
    /** Override the shared scheduler (tests / isolation). */
    scheduler?: object;
}

/** A laid-out node, as `Hypertree#node` returns it. */
export interface HypertreeNode {
    id: string;
    x: number;
    y: number;
    depth: number;
    angle: number;
    sector: { start: number; end: number };
}

/** A radial / hyperbolic tree (`graphic.hypertree`). */
export interface Hypertree {
    /** The root id (`Hypertree.FOREST_ORIGIN` for a forest). */
    readonly rootId: string;
    /** True when the input was a forest. */
    readonly forest: boolean;
    /** The id-scope prefix in force. */
    readonly prefix: string;
    /** The built `<g>` (detached by `dispose()`, still readable). */
    readonly el: SVGGElement;
    /** The currently focused node id. */
    readonly focusId: string;
    /** Animate the focus to a node; the playing timeline. */
    focus(nodeId: string): Timeline;
    /** Apply a focus at once. */
    focusSync(nodeId: string): this;
    /** A node's current layout. */
    node(nodeId: string): HypertreeNode;
    /** Remove listeners, stop timelines, detach `el`. Idempotent. */
    dispose(): void;
}

// ── Constructible helpers ────────────────────────────────────────────────────

/** Handle returned by {@link createPageflip}. */
export interface PageflipHandle {
    /** The live book. */
    instance: Pageflip;
    /** Idempotent teardown: disposes the instance and releases the shared runtime. */
    dispose(): void;
}

/** `createHypertree`'s options: the tree, plus every `Hypertree` option. */
export interface HypertreeHelperOptions extends HypertreeOptions {
    /** One root, or a forest (several roots). */
    tree: TreeNode | TreeNode[];
}

/** Handle returned by {@link createHypertree}. */
export interface HypertreeHandle {
    /** The live tree. */
    instance: Hypertree;
    /** The SVG root the tree was built into (caller-supplied or helper-created). */
    root: Element;
    /** Idempotent teardown: disposes the instance and releases the shared runtime. */
    dispose(): void;
}

/**
 * Build a page-turn book and mount it into `el`, wiring `graphic.pageflip`'s
 * dependencies on the helpers' shared runtime. `opts` is forwarded verbatim to
 * the `Pageflip` constructor.
 */
export function createPageflip(el: Element, opts: PageflipOptions): PageflipHandle;

/**
 * Build a radial/hyperbolic tree into `rootEl`, wiring `graphic.hypertree`'s
 * dependencies on the helpers' shared runtime. The tree travels in
 * `opts.tree`; every other key is forwarded verbatim as `HypertreeOptions`.
 */
export function createHypertree(rootEl: Element, opts: HypertreeHelperOptions): HypertreeHandle;
