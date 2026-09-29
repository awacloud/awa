// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview Inspectable primitives for debugging fw apps.
 *
 * Provides **read-only** introspection over a uiSession, formatting helpers
 * for elm-array `ParseResult`, and a tiny profiler built on top of the
 * sanity-friendly `clock` module.
 *
 * **Splitting strategy fw vs sde/sdc.** This module deliberately exposes only
 * data structures (snapshots, strings, durations) - no UI. sde/sdc layer a
 * developer UI on top (sidebar, console panel) by consuming these primitives.
 * The fw standalone consumer can pipe outputs to `console.log` / `console.table`.
 *
 * @example
 *   const dev = runtime.resolve('devtools');
 *   console.table(dev.inspect(ui).blocks);   // → list of mounted blocks
 *   console.log(dev.dumpTemplate(tpl));      // → readable elm-array
 *   const { result, durationMs } = dev.profile(() => render.full(items));
 *
 */

import { clock } from '../../io/timing/clock.js';

/**
 * Public API returned by `devtools.factory()` - read-only introspection,
 * template dumping, and profiling helpers.
 *
 * @typedef {object} DevtoolsAPI
 * @property {(session: object) => object} inspect Snapshot a `uiSession` into a JSON-safe object (`{ container, blocks, attaches, children, listeners, mountHooks, unmountHooks, lists, portals }`).
 * @property {(session: object) => string} summarize One-line `"<blockId>(<logicalIds…>)"` summary per mounted block.
 * @property {(input: (import('./parser').ParseResult|import('./parser').ElmNode[]), opts?: { indent?: string }) => string} dumpTemplate Render an elm-array/ParseResult as an indented tree string.
 * @property {(fn: () => *) => { result: *, durationMs: number }} profile Run `fn` synchronously, returning its result and elapsed ms.
 * @property {(fn: () => *) => Promise<{ result: *, durationMs: number }>} profileAsync Awaitable variant of `profile`.
 * @property {() => { mark: (name: string) => void, end: () => { total: number, segments: Array<{ name: string, durationMs: number }> } }} timer Marker-style profiler with named segments.
 */

export const devtools = {
    name: 'devtools',
    version: '1.0.0',
    type: 'fw.dom.rendering',
    dependencies: ['clock'],
    deps: [clock],

    /** @returns {DevtoolsAPI} */
    factory(clock) {

        const _clock = clock; // captured for profile()

        // ── Session inspection ──────────────────────────────────────────────

        /**
         * Snapshot the state of a `uiSession` into a plain, JSON-safe object.
         * Does NOT capture DOM nodes - only logical IDs, names, and counts.
         *
         * Shape :
         *   {
         *     container:    string,                            // session container name (null if disposed/missing)
         *     blocks:       Array<{ id, logicalIds, isLoop }>,
         *     attaches:     Array<{ blockId, slots }>,         // slots per block
         *     children:     Array<{ parent, children }>,
         *     listeners:    Array<{ blockId, logicalId, names }>,
         *     mountHooks:   string[],                          // blockIds with pending onMount
         *     unmountHooks: string[],                          // blockIds with registered onUnmount
         *     lists:        Array<{ parent, slot, size, disposed }>,
         *     portals:      Array<{ name, container }>,
         *   }
         *
         * @param {Object} session - The uiSession instance to inspect.
         *   Reads framework-internal fields (`_map`, `_attach`, `_children`,
         *   `_listeners`, `_mount`, `_unmount`, `_lists`, `_portals`,
         *   `_container`). Missing fields are tolerated (returned as `null`
         *   or empty arrays) - useful for partially-disposed sessions.
         * @returns {{
         *   container: string|null,
         *   blocks:    Array<{ id: string, logicalIds: string[]|string[][], isLoop: boolean }>,
         *   attaches:  Array<{ blockId: string, slots: string[] }>,
         *   children:  Array<{ parent: string, children: string[] }>,
         *   listeners: Array<{ blockId: string, logicalId: string, names: string[] }>,
         *   mountHooks:   string[],
         *   unmountHooks: string[],
         *   lists:    Array<{ parent: string, slot: string, size: number, disposed: boolean }>,
         *   portals:  Array<{ name: string, container: any }>,
         * }}
         */
        function inspect(session) {
            if (!session || typeof session !== 'object')
                throw new Error('devtools.inspect: session argument is required');

            const out = {
                container:    session._container || null,
                blocks:       [],
                attaches:     [],
                children:     [],
                listeners:    [],
                mountHooks:   [],
                unmountHooks: [],
                lists:        [],
                portals:      [],
            };

            if (session._map) {
                for (const [id, m] of session._map) {
                    if (Array.isArray(m)) {
                        out.blocks.push({ id, logicalIds: m.map(mm => [...mm.keys()]), isLoop: true });
                    } else {
                        out.blocks.push({ id, logicalIds: [...m.keys()], isLoop: false });
                    }
                }
            }

            if (session._attach) {
                for (const [bid, info] of session._attach) {
                    const slots = info && info.content ? [...info.content.keys()] : [];
                    out.attaches.push({ blockId: bid, slots });
                }
            }

            if (session._children) {
                for (const [parent, kids] of session._children) {
                    out.children.push({ parent, children: [...kids] });
                }
            }

            if (session._listeners) {
                for (const [bid, blockMap] of session._listeners) {
                    for (const [lid, set] of blockMap) {
                        out.listeners.push({ blockId: bid, logicalId: lid, names: [...set] });
                    }
                }
            }

            if (session._mount) {
                for (const [bid] of session._mount) out.mountHooks.push(bid);
            }
            if (session._unmount) {
                for (const [bid] of session._unmount) out.unmountHooks.push(bid);
            }

            if (session._lists) {
                for (const [parent, slots] of session._lists) {
                    for (const [slot, list] of slots) {
                        out.lists.push({
                            parent,
                            slot,
                            size:     list.size,
                            disposed: !!list._disposed,
                        });
                    }
                }
            }

            if (session._portals) {
                for (const [name, portal] of session._portals) {
                    out.portals.push({ name, container: portal._container });
                }
            }

            return out;
        }

        /**
         * Return a one-line summary `"<blockId>(<logicalIds…>)"` for each
         * mounted block - useful for quick console dumps.
         *
         * @param {Object} session - The uiSession instance to summarize.
         * @returns {string} Space-separated summary, one block per token.
         *   Loops render as `id(loop×N)` where N is the iteration count.
         */
        function summarize(session) {
            const snap = inspect(session);
            return snap.blocks.map(b =>
                `${b.id}(${b.isLoop ? `loop×${b.logicalIds.length}` : b.logicalIds.join(',')})`
            ).join(' ');
        }

        // ── Template dump ───────────────────────────────────────────────────

        /**
         * Render an elm-array (or a ParseResult) as an indented, human-readable
         * tree. Each line shows : the elm id, the tag, and any text/content/map
         * binding hints.
         *
         * @param {import('./parser').ParseResult | import('./parser').ElmNode[]} input
         *   Either a raw elm-array (the `template` field of a ParseResult) or a
         *   full ParseResult - the latter is detected and its sub-iterates are
         *   appended below the main tree.
         * @param {Object} [opts]
         * @param {string} [opts.indent='  '] - Indent per level.
         * @returns {string} Multi-line string, terminated lines (no trailing
         *   newline). Safe to pass directly to `console.log`.
         */
        function dumpTemplate(input, opts = {}) {
            const arr = Array.isArray(input) ? input : (input && input.template) || [];
            const indent = opts.indent || '  ';
            // Build parent → children index.
            const byId = new Map(arr.map(e => [e.id, e]));
            const kids = new Map();
            const roots = [];
            for (const e of arr) {
                if (e.parent && byId.has(e.parent)) {
                    if (!kids.has(e.parent)) kids.set(e.parent, []);
                    kids.get(e.parent).push(e.id);
                } else {
                    roots.push(e.id);
                }
            }

            const lines = [];
            function _walk(id, depth) {
                const e = byId.get(id);
                if (!e) return;
                const pad = indent.repeat(depth);
                const bits = [`<${e.tag}#${e.id}>`];
                if (e.text != null) bits.push(`text=${JSON.stringify(e.text)}`);
                if (e.content)      bits.push(`slot=${JSON.stringify(e.content)}`);
                if (e.attrs && e.attrs.length) bits.push(`attrs=[${e.attrs.join(',')}]`);
                if (e.map && e.map.length) {
                    const m = e.map.map(b =>
                        `${b.data ? '@' : '$'}${b.prop}=#{${b.name}}` +
                        (b.append ? '+' : b.prepend ? '^' : '=')
                    ).join(',');
                    bits.push(`map=[${m}]`);
                }
                lines.push(pad + bits.join(' '));
                const cids = kids.get(id) || [];
                for (const cid of cids) _walk(cid, depth + 1);
            }
            for (const r of roots) _walk(r, 0);

            // Sub-iterates (a ParseResult may carry them).
            // @ts-ignore - input may be ElmNode[] (no iterates) or ParseResult (has iterates); checked at runtime
            if (input && input.iterates) {
                // @ts-ignore - iterates is on ParseResult; checked by parent guard
                for (const name of Object.keys(input.iterates)) {
                    lines.push(`-- iterate: ${name} --`);
                    // @ts-ignore - iterates is on ParseResult; checked by parent guard
                    lines.push(dumpTemplate({ template: input.iterates[name] }, opts));
                }
            }
            return lines.join('\n');
        }

        // ── Profiler ────────────────────────────────────────────────────────
        //
        // `clock` is injected as an ALREADY-INSTANTIATED dependency instance:
        // `runtime.resolve()` calls `def.factory.apply({}, deps)` with the
        // resolved instances of `dependencies`, never the raw module
        // descriptors (`src/core/runtime.js`) — so `_clock` here already IS
        // the `ClockAPI` object (`{ now, monotonic, since, iso, format }`),
        // not `clock` the module. Call `monotonic()` on it directly; no
        // `.factory()` hop (BL-466 — that hop TypeError'd on the canonical
        // `runtime.resolve('devtools')` path, e.g. sde-core's taskmgr).

        /**
         * Execute `fn` synchronously and return `{ result, durationMs }` using
         * the framework's `clock.monotonic` (sanity-safe, ~1 ms resolution).
         *
         * @template T
         * @param {() => T} fn - Synchronous function to profile.
         * @returns {{ result: T, durationMs: number }}
         * @throws {Error} When `fn` is not a function.
         */
        function profile(fn) {
            if (typeof fn !== 'function')
                throw new Error('devtools.profile: fn must be a function');
            const t0 = _clock.monotonic();
            const result = fn();
            const t1 = _clock.monotonic();
            return { result, durationMs: t1 - t0 };
        }

        /**
         * Awaitable variant. Returns `Promise<{ result, durationMs }>`.
         *
         * @template T
         * @param {() => (Promise<T>|T)} fn - Async function to profile.
         * @returns {Promise<{ result: T, durationMs: number }>}
         * @throws {Error} When `fn` is not a function.
         */
        async function profileAsync(fn) {
            if (typeof fn !== 'function')
                throw new Error('devtools.profileAsync: fn must be a function');
            const t0 = _clock.monotonic();
            const result = await fn();
            const t1 = _clock.monotonic();
            return { result, durationMs: t1 - t0 };
        }

        /**
         * Build a marker-style profiler with named segments.
         *
         *   const t = dev.timer();
         *   t.mark('parse');  parse();
         *   t.mark('render'); render();
         *   t.end();          // → { total, segments: [{name, durationMs}] }
         *
         * @returns {{
         *   mark: (name: string) => void,
         *   end:  () => { total: number, segments: Array<{ name: string, durationMs: number }> }
         * }}
         *   `mark(name)` opens a new segment named `name` and closes the
         *   previous one (if any). `end()` closes the last open segment
         *   and returns the aggregate.
         */
        function timer() {
            const c = _clock;
            const t0 = c.monotonic();
            const segments = [];
            return {
                /**
                 * Open a new named segment. The previous segment (if any) is
                 * closed at this exact instant.
                 * @param {string} name
                 */
                mark(name) {
                    const now = c.monotonic();
                    if (segments.length > 0) {
                        const last = segments[segments.length - 1];
                        last.durationMs = now - last._startedAt;
                        delete last._startedAt;
                    }
                    segments.push({ name, _startedAt: now });
                },
                /**
                 * Close the last open segment and return the timing report.
                 * @returns {{ total: number, segments: Array<{ name: string, durationMs: number }> }}
                 */
                end() {
                    const now = c.monotonic();
                    if (segments.length > 0) {
                        const last = segments[segments.length - 1];
                        last.durationMs = now - last._startedAt;
                        delete last._startedAt;
                    }
                    return { total: now - t0, segments };
                },
            };
        }

        return {
            inspect,
            summarize,
            dumpTemplate,
            profile,
            profileAsync,
            timer,
        };
    },
};
