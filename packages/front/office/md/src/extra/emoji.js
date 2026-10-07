// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Extra : emoji shortcode expansion (`:smile:` → 😄).
 *
 * Ships a small built-in table (~70 common shortcodes). Consumers can
 * extend or replace the table via `mdEmoji.install(md, { table })`.
 *
 * Operates as a post-parse AST pass : scans the joined literal of every run
 * of adjacent sibling `text` nodes (the inline parser splits `:heart_eyes:`
 * into `:heart`, `_`, `eyes:`) and replaces `:name:` substrings with `text`
 * nodes carrying the emoji character. The replacement preserves surrounding
 * text; a delimiter that formed real emphasis stays a boundary.
 *
 * Lookup uses a `Map` built fresh inside `factory()` (never at module
 * scope — capture-free discipline, see `fw/no-factory-capture`): a plain
 * object keyed by shortcode name is vulnerable to `Object.prototype`
 * collisions (`:constructor:`, `:__proto__:` resolve to an inherited
 * value instead of `undefined` when indexed with `obj[key]`), whereas
 * `Map#get` never consults the prototype chain. `DEFAULT_EMOJI_TABLE`
 * stays a plain object for API/docs compatibility (`Record<string,
 * string>`, mergeable via `{ ...DEFAULT_EMOJI_TABLE, custom: '🎯' }`) —
 * only the internal lookup structure changed, not the public shape.
 *
 * Strict factory-only — exposes `{ name, dependencies, factory }`.
 * `factory(...)` returns `{ name, install, DEFAULT_EMOJI_TABLE,
 * expandEmojiInAst }`.
 *
 * @module md/extra/emoji
 */

/**
 * @typedef {Object.<string, string>} EmojiTable
 * Shortcode name (lowercase, no colons) → emoji character.
 */

import { mdNode } from '../ast/node.js';
import { mdAstWalker } from '../ast/walker.js';
import { mdAstTypes } from '../ast/types.js';

export const mdEmoji = {
    name: 'mdEmoji',
    dependencies: ['mdNode', 'mdAstWalker', 'mdAstTypes'],
    deps: [mdNode, mdAstWalker, mdAstTypes],
    factory(mdNode, mdAstWalker, mdAstTypes) {
        const { Node } = mdNode;
        const { walk } = mdAstWalker;
        const { T_TEXT } = mdAstTypes;

        const DEFAULT_EMOJI_TABLE = {
            smile: '😄', smiley: '😀', grin: '😁', laughing: '😆', wink: '😉',
            blush: '😊', heart_eyes: '😍', sunglasses: '😎',
            thinking: '🤔', neutral_face: '😐', confused: '😕',
            cry: '😢', sob: '😭', rage: '😡',
            heart: '❤️', broken_heart: '💔', sparkles: '✨', star: '⭐', star2: '🌟',
            fire: '🔥', boom: '💥', tada: '🎉', confetti_ball: '🎊',
            rocket: '🚀', zap: '⚡', sunny: '☀️', umbrella: '☂️',
            snowflake: '❄️', cloud: '☁️',
            thumbsup: '👍', '+1': '👍', thumbsdown: '👎', '-1': '👎',
            clap: '👏', wave: '👋', muscle: '💪', pray: '🙏',
            eyes: '👀', brain: '🧠', skull: '💀',
            coffee: '☕', tea: '🍵', beer: '🍺', pizza: '🍕',
            apple: '🍎', banana: '🍌', cake: '🍰',
            dog: '🐶', cat: '🐱', mouse: '🐭', rabbit: '🐰', bear: '🐻',
            fox_face: '🦊', unicorn: '🦄', dragon: '🐉',
            earth_africa: '🌍', earth_americas: '🌎', earth_asia: '🌏',
            moon: '🌙', sun_with_face: '🌞',
            check: '✅', x: '❌', warning: '⚠️', white_check_mark: '✅',
            bug: '🐛', wrench: '🔧', hammer: '🔨', gear: '⚙️',
            book: '📖', books: '📚', memo: '📝', pencil: '✏️',
            bulb: '💡', mag: '🔍', lock: '🔒', unlock: '🔓', key: '🔑'
        };

        const RE_SHORTCODE = /:([a-z0-9_+-]+):/gi;

        // Built once inside factory() from the default table — a Map has
        // no prototype chain to accidentally shadow a shortcode lookup.
        const DEFAULT_EMOJI_MAP = new Map(Object.entries(DEFAULT_EMOJI_TABLE));

        /**
         * @param {EmojiTable|Map<string,string>} table
         * @returns {Map<string,string>}
         */
        function toLookupMap(table) {
            return table instanceof Map ? table : new Map(Object.entries(table));
        }

        function expandEmojiInAst(root, table) {
            const lookup = toLookupMap(table);
            // First pass: collect runs of adjacent sibling text nodes. The
            // inline parser splits a shortcode like `:heart_eyes:` into
            // `:heart`, `_`, `eyes:`, so the scan must run over the joined
            // literal of the run, not over each node.
            const runs = [];
            for (const { node, entering } of walk(root)) {
                if (!entering || node.type !== T_TEXT) continue;
                if (node.prev && node.prev.type === T_TEXT) continue;
                let last = node, joined = node.literal || '';
                while (last.next && last.next.type === T_TEXT) {
                    last = last.next; joined += (last.literal || '');
                }
                if (joined.indexOf(':') < 0) continue;
                runs.push({ first: node, last, joined });
            }
            for (const run of runs) {
                const lit = run.joined;
                RE_SHORTCODE.lastIndex = 0;
                const parts = [];
                let last = 0, replaced = false, m;
                while ((m = RE_SHORTCODE.exec(lit)) !== null) {
                    const replacement = lookup.get(m[1].toLowerCase());
                    if (replacement === undefined) continue;
                    if (m.index > last) parts.push(lit.substring(last, m.index));
                    parts.push(replacement);
                    last = m.index + m[0].length;
                    replaced = true;
                }
                RE_SHORTCODE.lastIndex = 0;
                if (!replaced) continue;
                if (last < lit.length) parts.push(lit.substring(last));
                for (const value of parts) {
                    const n = new Node(T_TEXT);
                    n.literal = value;
                    run.first.insertBefore(n);
                }
                let cur = run.first; const end = run.last.next;
                while (cur && cur !== end) { const nx = cur.next; cur.unlink(); cur = nx; }
            }
            return root;
        }

        return {
            name: 'mdEmoji',
            DEFAULT_EMOJI_TABLE,
            expandEmojiInAst,
            install(md, opts) {
                const custom = (opts && opts.table) || {};
                const lookup = Object.keys(custom).length === 0
                    ? DEFAULT_EMOJI_MAP
                    : new Map([...DEFAULT_EMOJI_MAP, ...Object.entries(custom)]);
                const originalParse = md.parse;
                md.parse = function (text) {
                    const ast = originalParse.call(md, text);
                    expandEmojiInAst(ast, lookup);
                    return ast;
                };
                md.renderHtml = function (textOrAst, renderOpts) {
                    if (typeof textOrAst === 'string') {
                        return md.render(md.parse(textOrAst), renderOpts);
                    }
                    return md.render(textOrAst, renderOpts);
                };
            }
        };
    }
};
