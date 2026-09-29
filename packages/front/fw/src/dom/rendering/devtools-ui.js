// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview Opt-in DOM inspector rendering `devtools`' data API and the two
 * read-only accessors of the runtime registry and the signal graph.
 *
 * **Why a separate module.** `devtools` deliberately exposes data only
 * (snapshots, strings, durations) — see its own fileoverview. This module is
 * the fw-side, no-bundler counterpart of the developer UI sde/sdc layer on top
 * of it: it turns those snapshots into DOM, and nothing else.
 *
 * **Opt-in.** Importing this file mounts nothing, reads nothing and touches no
 * ambient state. A view exists only once a caller resolves the module and calls
 * one of the `render*` methods with an explicit target element.
 *
 * **Read-only end to end.** Every source is read through an accessor that hands
 * back frozen data (`runtime.snapshot()`, `signal.inspectGraph()`) or a plain
 * copy (`devtools.inspect()`). This module never writes back into a session,
 * the module registry, the signal graph or a module instance, registers no
 * listener and installs no timer. Its only write is building DOM inside the
 * target element the caller supplied.
 *
 * **Composition posture.** The single dependency, `devtools`, is measured
 * lockdown-compatible with zero carve-outs, and the DOM surface used here
 * (`createElement`, `appendChild`, `textContent`, `setAttribute`, `className`)
 * is measured working post-`lockdown()` — see
 * `tests/devtools-ui-lockdown.integration.test.js`.
 *
 * @example
 *   const ui = runtime.resolve('devtoolsUI');
 *   ui.render(document.querySelector('#inspector'), {
 *       session: myUiSession,     // → devtools.inspect() view
 *       runtime,                  // → runtime.snapshot() view
 *       signal: signalInstance,   // → signal.inspectGraph() view
 *   });
 */

import { devtools } from './devtools.js';

/**
 * Sources the composite {@link DevtoolsUIAPI.render} accepts. Every field is
 * optional; a view is emitted only for the sources actually supplied.
 *
 * @typedef {object} DevtoolsUISources
 * @property {object} [session] A `uiSession` instance, passed to `devtools.inspect()`.
 * @property {{ snapshot: (filter?: object) => ReadonlyArray<object> }} [runtime]
 *   The module runtime, read through its **`snapshot()`** accessor (never `list()`,
 *   which hands back live definitions).
 * @property {{ inspectGraph: () => object }} [signal] A `signal.factory()`
 *   **instance** — the graph is per-instance, so a module descriptor will not do.
 * @property {object} [filter] Optional `snapshot()` filter for the registry view.
 */

/**
 * Public API returned by `devtoolsUI.factory()` — DOM rendering only, no writes
 * back into any inspected source.
 *
 * @typedef {object} DevtoolsUIAPI
 * @property {(target: Element, sources?: DevtoolsUISources) => Element} render Append a composite inspector holding one section per supplied source.
 * @property {(target: Element, session: object) => Element} renderSession Append the `devtools.inspect()` view for one uiSession.
 * @property {(target: Element, runtime: object, filter?: object) => Element} renderRegistry Append the module-registry view over `runtime.snapshot(filter)`.
 * @property {(target: Element, signal: object) => Element} renderGraph Append the effect dependency-graph view over `signal.inspectGraph()`.
 */

export const devtoolsUI = {
    name: 'devtoolsUI',
    version: '1.0.0',
    type: 'fw.dom.rendering',
    dependencies: ['devtools'],
    deps: [devtools],

    /**
     * @param {object} devtools - The resolved **`devtools` instance** (the six
     *   read-only methods), as `runtime.resolve('devtoolsUI')` injects it. Only
     *   `inspect` and `summarize` are consumed.
     * @returns {DevtoolsUIAPI}
     */
    factory(devtools) {

        const ROOT_CLASS = 'fw-devtools-ui';
        const VIEW_CLASS = 'fw-devtools-ui__view';
        const TITLE_CLASS = 'fw-devtools-ui__title';
        const META_CLASS = 'fw-devtools-ui__meta';
        const NOTE_CLASS = 'fw-devtools-ui__note';
        const TABLE_CLASS = 'fw-devtools-ui__table';
        const EMPTY_CLASS = 'fw-devtools-ui__empty';

        // ── DOM helpers (textContent only — never innerHTML) ────────────────

        /**
         * @param {string} tag
         * @param {string} [className]
         * @param {string|number|boolean} [text] Coerced through `String()`.
         * @returns {HTMLElement}
         */
        function _el(tag, className, text) {
            const node = document.createElement(tag);
            if (className) node.className = className;
            if (text != null) node.textContent = String(text);
            return node;
        }

        /**
         * @param {*} target
         * @param {string} method - Caller name, for the error message.
         * @returns {Element}
         * @throws {Error} When `target` is not an element able to receive children.
         */
        function _requireTarget(target, method) {
            if (!target || typeof target.appendChild !== 'function')
                throw new Error(`devtoolsUI.${method}: target must be a DOM element`);
            return target;
        }

        /**
         * Build an empty view section carrying its title.
         * @param {string} view - `data-view` value.
         * @param {string} title
         * @returns {HTMLElement}
         */
        function _section(view, title) {
            const sec = _el('section', VIEW_CLASS);
            sec.setAttribute('data-view', view);
            sec.appendChild(_el('h2', TITLE_CLASS, title));
            return sec;
        }

        /**
         * Build a `<table>` from plain string cells. Values pass through
         * `textContent`, so no source value can ever be interpreted as markup.
         *
         * @param {string[]} headers
         * @param {Array<Array<string|number|boolean>>} rows
         * @param {string} emptyLabel - Rendered instead of the table when `rows` is empty.
         * @returns {HTMLElement} A `<table>`, or a `<p>` when there is no row.
         */
        function _table(headers, rows, emptyLabel) {
            if (rows.length === 0) return _el('p', EMPTY_CLASS, emptyLabel);
            const table = _el('table', TABLE_CLASS);
            const thead = _el('thead');
            const hrow = _el('tr');
            for (const h of headers) hrow.appendChild(_el('th', null, h));
            thead.appendChild(hrow);
            table.appendChild(thead);
            const tbody = _el('tbody');
            for (const row of rows) {
                const tr = _el('tr');
                for (const cell of row) tr.appendChild(_el('td', null, cell));
                tbody.appendChild(tr);
            }
            table.appendChild(tbody);
            return table;
        }

        /**
         * @param {boolean} value
         * @returns {string}
         */
        function _yn(value) { return value ? 'yes' : 'no'; }

        // ── View 1 — uiSession, over devtools.inspect() ─────────────────────

        /**
         * @param {object} session
         * @returns {HTMLElement}
         */
        function _buildSession(session) {
            const snap = devtools.inspect(session);
            const sec = _section('session', 'Session');

            sec.appendChild(_el('p', META_CLASS,
                `container: ${snap.container == null ? '(none)' : snap.container}`));
            sec.appendChild(_el('p', META_CLASS, `summary: ${devtools.summarize(session)}`));

            sec.appendChild(_el('h3', TITLE_CLASS, 'Blocks'));
            sec.appendChild(_table(
                ['block', 'logical ids', 'loop'],
                snap.blocks.map(b => [
                    b.id,
                    b.isLoop
                        ? b.logicalIds.map(ids => (Array.isArray(ids) ? ids.join(',') : String(ids))).join(' | ')
                        : b.logicalIds.join(','),
                    _yn(b.isLoop),
                ]),
                'no mounted block',
            ));

            sec.appendChild(_el('h3', TITLE_CLASS, 'Listeners'));
            sec.appendChild(_table(
                ['block', 'logical id', 'events'],
                snap.listeners.map(l => [l.blockId, l.logicalId, l.names.join(',')]),
                'no registered listener',
            ));

            sec.appendChild(_el('h3', TITLE_CLASS, 'Lists'));
            sec.appendChild(_table(
                ['parent', 'slot', 'size', 'disposed'],
                snap.lists.map(l => [l.parent, l.slot, l.size, _yn(l.disposed)]),
                'no list',
            ));

            sec.appendChild(_el('h3', TITLE_CLASS, 'Counts'));
            sec.appendChild(_table(
                ['collection', 'count'],
                [
                    ['blocks', snap.blocks.length],
                    ['attaches', snap.attaches.length],
                    ['children', snap.children.length],
                    ['listeners', snap.listeners.length],
                    ['mountHooks', snap.mountHooks.length],
                    ['unmountHooks', snap.unmountHooks.length],
                    ['lists', snap.lists.length],
                    ['portals', snap.portals.length],
                ],
                'no data',
            ));

            return sec;
        }

        // ── View 2 — module registry, over runtime.snapshot() ───────────────

        /**
         * @param {object} runtime
         * @param {object} [filter]
         * @returns {HTMLElement}
         * @throws {Error} When `runtime` exposes no `snapshot()` accessor.
         */
        function _buildRegistry(runtime, filter) {
            if (!runtime || typeof runtime.snapshot !== 'function')
                throw new Error(
                    'devtoolsUI.renderRegistry: runtime must expose snapshot() ' +
                    '(list() is a live handle and is deliberately not accepted)');

            const rows = runtime.snapshot(filter || {});
            const sec = _section('registry', 'Module registry');

            sec.appendChild(_el('p', META_CLASS, `${rows.length} registered version(s)`));
            sec.appendChild(_table(
                ['module', 'version', 'type', 'dependencies', 'latest', 'instantiated'],
                rows.map(r => [
                    r.name,
                    r.version,
                    r.type == null ? '—' : r.type,
                    r.dependencies.length ? r.dependencies.join(', ') : '—',
                    _yn(r.latest),
                    _yn(r.instantiated),
                ]),
                'no registered module',
            ));
            sec.appendChild(_el('p', NOTE_CLASS,
                'Read from runtime.snapshot(): frozen metadata rows. Rendering this '
                + 'view instantiates nothing, so "instantiated" reports the cache as '
                + 'it was before the view was built.'));

            return sec;
        }

        // ── View 3 — signal/effect graph, over signal.inspectGraph() ────────

        /**
         * @param {object} signal - A `signal.factory()` instance.
         * @returns {HTMLElement}
         * @throws {Error} When `signal` exposes no `inspectGraph()` accessor.
         */
        function _buildGraph(signal) {
            if (!signal || typeof signal.inspectGraph !== 'function')
                throw new Error(
                    'devtoolsUI.renderGraph: signal must be a signal.factory() '
                    + 'instance exposing inspectGraph()');

            const graph = signal.inspectGraph();
            const sec = _section('graph', 'Signal graph');

            sec.appendChild(_el('p', META_CLASS,
                `${graph.signals.length} signal(s) · ${graph.effects.length} effect(s) · `
                + `${graph.edges.length} edge(s)`));

            sec.appendChild(_el('h3', TITLE_CLASS, 'Effects'));
            sec.appendChild(_table(
                ['effect', 'deps'],
                graph.effects.map(e => [e.id, e.deps]),
                'no live effect',
            ));

            sec.appendChild(_el('h3', TITLE_CLASS, 'Signals'));
            sec.appendChild(_table(
                ['signal', 'kind'],
                graph.signals.map(s => [s.id, s.kind]),
                'no observed signal',
            ));

            sec.appendChild(_el('h3', TITLE_CLASS, 'Edges'));
            sec.appendChild(_table(
                ['effect', 'depends on'],
                graph.edges.map(e => [e.effect, e.signal]),
                'no edge',
            ));

            // Honesty note: this view is NOT an exhaustive picture of reactivity.
            sec.appendChild(_el('p', NOTE_CLASS,
                'Partial by design: this is the EFFECT dependency graph. A signal no '
                + 'live effect observes is not a node, and the own sources of a computed '
                + 'are not edges (a computed read by an effect does appear, as a node of '
                + 'kind "computed"). Absence here is not absence in the app.'));

            return sec;
        }

        // ── Public surface ──────────────────────────────────────────────────

        /**
         * Append the uiSession view to `target`.
         *
         * @param {Element} target - Element receiving the view.
         * @param {object} session - uiSession instance to inspect.
         * @returns {Element} The appended `<section data-view="session">`.
         * @throws {Error} When `target` is not an element, or `session` is not
         *   an object (rethrown from `devtools.inspect`).
         */
        function renderSession(target, session) {
            _requireTarget(target, 'renderSession');
            const sec = _buildSession(session);
            target.appendChild(sec);
            return sec;
        }

        /**
         * Append the module-registry view to `target`.
         *
         * @param {Element} target - Element receiving the view.
         * @param {object} runtime - Module runtime exposing `snapshot(filter)`.
         * @param {object} [filter={}] - Same filter `snapshot()`/`list()` accept.
         * @returns {Element} The appended `<section data-view="registry">`.
         * @throws {Error} When `target` is not an element or `runtime` has no `snapshot()`.
         */
        function renderRegistry(target, runtime, filter) {
            _requireTarget(target, 'renderRegistry');
            const sec = _buildRegistry(runtime, filter);
            target.appendChild(sec);
            return sec;
        }

        /**
         * Append the effect dependency-graph view to `target`.
         *
         * @param {Element} target - Element receiving the view.
         * @param {object} signal - A `signal.factory()` instance (per-instance graph).
         * @returns {Element} The appended `<section data-view="graph">`.
         * @throws {Error} When `target` is not an element or `signal` has no `inspectGraph()`.
         */
        function renderGraph(target, signal) {
            _requireTarget(target, 'renderGraph');
            const sec = _buildGraph(signal);
            target.appendChild(sec);
            return sec;
        }

        /**
         * Append a composite inspector: one section per supplied source, in the
         * fixed order session → registry → graph. Sources left out simply
         * produce no section; passing none yields an empty inspector root.
         *
         * Each call appends a NEW root — nothing is cleared, so the caller owns
         * the lifetime of what it mounted (`root.remove()`).
         *
         * @param {Element} target - Element receiving the inspector.
         * @param {DevtoolsUISources} [sources={}]
         * @returns {Element} The appended `<section class="fw-devtools-ui">` root.
         * @throws {Error} When `target` is not an element, or a supplied source
         *   fails its own accessor check.
         */
        function render(target, sources) {
            _requireTarget(target, 'render');
            const src = sources || {};
            const root = _el('section', ROOT_CLASS);
            root.setAttribute('data-fw-devtools-ui', '');

            if (src.session != null) root.appendChild(_buildSession(src.session));
            if (src.runtime != null) root.appendChild(_buildRegistry(src.runtime, src.filter));
            if (src.signal != null) root.appendChild(_buildGraph(src.signal));

            if (root.childElementCount === 0)
                root.appendChild(_el('p', EMPTY_CLASS, 'no source provided'));

            target.appendChild(root);
            return root;
        }

        return {
            render,
            renderSession,
            renderRegistry,
            renderGraph,
        };
    },
};
