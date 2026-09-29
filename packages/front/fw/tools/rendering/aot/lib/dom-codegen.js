// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview AOT codegen: walks a fw ParseResult (see parser.js) and emits
 * imperative JavaScript that builds the DOM tree directly via document.createElement.
 *
 * No runtime dependency on fw. The generated function takes `(data, slots)` and
 * returns the root Element.
 *
 * Supported fw template features:
 *   - Static elements (any tag, any attrs)
 *   - SVG children (svg_* internal tags are emitted via createElementNS)
 *   - Text interpolation: `#{var}` (full replace / prepend / append)
 *   - Attribute interpolation: same shapes as text
 *   - `${slot}` content slots (single child, leaf only) → slots.<name>
 *   - `<!-- $name --> … <!-- name$ -->` iterate blocks → for…of loop
 *   - Synthetic `tag:'text'` nodes (mixed inline/block) → text nodes with bindings
 *   - Void elements emitted without children
 *
 * NOT supported (explicit non-goals):
 *   - Dynamic class composition beyond #{var} prefix/suffix/replace
 *   - Runtime template registration / fragments
 *   - SVG root namespace inheritance for arbitrary nested templates (only direct
 *     svg_* internal tags handled)
 *   - The render-time `default` value on MapEntry (always falls back to '' on missing)
 *
 * @module fw/tools/rendering/aot/lib/dom-codegen
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

/** JSON-stringify a string for embedding in generated source. */
function q(s) { return JSON.stringify(s ?? ''); }

/** Identifier-safe sanitizer for variable names (data keys may be arbitrary). */
function safeKey(name) {
    // Bracket-access — always safe regardless of name.
    return `[${q(name)}]`;
}

/**
 * Compile a MapEntry against a `data` identifier into an expression.
 * `prepend`/`append` combine with the static base, otherwise full replace.
 */
function bindExpr(entry, dataVar, baseLit) {
    const v = `${dataVar}${safeKey(entry.name)}`;
    // Static trailing run (see MapEntry.tail): appended unconditionally so
    // interleaved segments survive a missing value. Only present on `append`.
    const tail = entry.tail ? ` + ${q(entry.tail)}` : '';
    // missing → keep static base (matches computeBoundValue: undefined → base)
    if (entry.append) {
        // (base ?? '') + value, but skip if value undefined
        return `(${v} !== undefined ? ${baseLit} + String(${v}) : ${baseLit})${tail}`;
    }
    if (entry.prepend) {
        return `(${v} !== undefined ? String(${v}) + ${baseLit} : ${baseLit})${tail}`;
    }
    // full replace
    return `(${v} !== undefined ? String(${v}) : ${baseLit})${tail}`;
}

/**
 * Build the resolved-value expression for a property on a node:
 * combines static base with all matching map entries (last expression wins
 * because each entry mutates `cur` in sequence).
 *
 * Returns an expression string. If no maps for this prop, returns the literal.
 */
function propExpr(maps, prop, isData, base, dataVar) {
    const propMaps = (maps || []).filter(m =>
        m.prop === prop && !!m.data === isData
    );
    if (propMaps.length === 0) return q(base ?? '');
    if (propMaps.length === 1) {
        return bindExpr(propMaps[0], dataVar, q(base ?? ''));
    }
    // Multiple: build a chained expression via IIFE for clarity.
    const lines = [`let _b = ${q(base ?? '')};`];
    for (const m of propMaps) {
        const v = `${dataVar}${safeKey(m.name)}`;
        if (m.append) {
            lines.push(`if (${v} !== undefined) _b = _b + String(${v});`);
        } else if (m.prepend) {
            lines.push(`if (${v} !== undefined) _b = String(${v}) + _b;`);
        } else {
            lines.push(`if (${v} !== undefined) _b = String(${v});`);
        }
        // Static trailing run — appended unconditionally (see MapEntry.tail).
        if (m.tail) lines.push(`_b = _b + ${q(m.tail)};`);
    }
    lines.push(`return _b;`);
    return `(() => { ${lines.join(' ')} })()`;
}

/** Build a parent → children id map from a flat elm array. */
function buildKids(elms) {
    const kids = new Map();
    const byId = new Map();
    const roots = [];
    for (const e of elms) {
        byId.set(e.id, e);
        if (!kids.has(e.id)) kids.set(e.id, []);
    }
    for (const e of elms) {
        if (e.parent && byId.has(e.parent)) {
            kids.get(e.parent).push(e.id);
        } else {
            roots.push(e.id);
        }
    }
    return { byId, kids, roots };
}

/** Map an internal tag → { tagName, namespaceURI? } */
function resolveTag(tag) {
    if (tag === 'text') return null; // synthetic text node, no element
    if (tag.startsWith('svg_')) return { name: tag.slice(4), ns: SVG_NS };
    if (tag === 'svg') return { name: 'svg', ns: SVG_NS };
    return { name: tag, ns: null };
}

/**
 * Emit code that creates one element (and recurses into its children), appending
 * the resulting node to the parent variable `parentVar`.
 *
 * `ctx` carries the in-scope `data` variable name and the `slots` variable name.
 *
 * Returns an array of source lines.
 */
function emitNode(id, tree, iterates, parentVar, ctx, depth) {
    const elm = tree.byId.get(id);
    const out = [];
    const ind = '    '.repeat(depth);
    const vName = `el${ctx.counter.n++}`;

    // ── Synthetic text node ─────────────────────────────────────────────────
    if (elm.tag === 'text') {
        const expr = propExpr(elm.map, 'text', false, elm.text, ctx.dataVar);
        out.push(`${ind}${parentVar}.appendChild(document.createTextNode(${expr}));`);
        return out;
    }

    const tagInfo = resolveTag(elm.tag);
    if (tagInfo.ns) {
        out.push(`${ind}const ${vName} = document.createElementNS(${q(tagInfo.ns)}, ${q(tagInfo.name)});`);
    } else {
        out.push(`${ind}const ${vName} = document.createElement(${q(tagInfo.name)});`);
    }

    // ── Attributes (deterministic order: as recorded in elm.attrs) ──────────
    if (elm.attrs && elm.attrs.length > 0) {
        // Sort for stable diffs.
        const sortedAttrs = [...elm.attrs].sort();
        for (const a of sortedAttrs) {
            const base = elm.data?.[a];
            const propMaps = (elm.map || []).filter(m => m.prop === a && m.data);
            if (propMaps.length === 0) {
                // Pure static — keep prior behaviour.
                out.push(`${ind}${vName}.setAttribute(${q(a)}, ${q(base ?? '')});`);
                continue;
            }
            // Single full-replace binding (most common): pass raw value through
            // the null/false check before stringifying. Matches runtime.
            if (propMaps.length === 1 && !propMaps[0].append && !propMaps[0].prepend) {
                const m = propMaps[0];
                const raw = `${ctx.dataVar}${safeKey(m.name)}`;
                const tmp = `_a${ctx.counter.n++}`;
                out.push(
                    `${ind}{ const ${tmp} = ${raw}; ` +
                    `if (${tmp} === undefined) ${vName}.setAttribute(${q(a)}, ${q(base ?? '')}); ` +
                    `else if (${tmp} != null && ${tmp} !== false) ${vName}.setAttribute(${q(a)}, String(${tmp})); }`,
                );
                continue;
            }
            // Multi-binding or prepend/append: fall back to combined expression
            // (a null/false in the middle is intentionally stringified, matching
            // current runtime composition semantics).
            const expr = propExpr(elm.map, a, true, base, ctx.dataVar);
            out.push(`${ind}${vName}.setAttribute(${q(a)}, ${expr});`);
        }
    }

    // ── Content resolution ──────────────────────────────────────────────────
    if (elm.content) {
        const itTpl = iterates && iterates[elm.content];
        if (itTpl) {
            // Iterate block: loop over data[content]; new scope variable = item
            const arrExpr = `${ctx.dataVar}${safeKey(elm.content)}`;
            const itemVar = `item${ctx.counter.n++}`;
            out.push(`${ind}{`);
            out.push(`${ind}    const _arr = ${arrExpr};`);
            out.push(`${ind}    if (_arr) for (const ${itemVar} of _arr) {`);
            // Recurse with new data scope = itemVar.
            const subTree = buildKids(itTpl);
            const subCtx = { ...ctx, dataVar: itemVar };
            for (const rid of subTree.roots) {
                out.push(...emitNode(rid, subTree, iterates, vName, subCtx, depth + 2));
            }
            out.push(`${ind}    }`);
            out.push(`${ind}}`);
        } else {
            // Slot: append slots[name] if provided
            out.push(`${ind}if (${ctx.slotsVar} && ${ctx.slotsVar}${safeKey(elm.content)}) ${vName}.appendChild(${ctx.slotsVar}${safeKey(elm.content)});`);
        }
    } else if (Object.prototype.hasOwnProperty.call(elm, 'text') ||
               (elm.map || []).some(m => m.prop === 'text' && !m.data)) {
        // Leaf: text content (may carry bindings)
        const expr = propExpr(elm.map, 'text', false, elm.text, ctx.dataVar);
        out.push(`${ind}${vName}.textContent = ${expr};`);
    } else {
        // Container: recurse into children
        const childIds = tree.kids.get(id) || [];
        for (const cid of childIds) {
            out.push(...emitNode(cid, tree, iterates, vName, ctx, depth));
        }
    }

    out.push(`${ind}${parentVar}.appendChild(${vName});`);
    return out;
}

/**
 * Compile a ParseResult into a JavaScript factory-function source string.
 *
 * @param {ParseResult} parsed - fw parser output ({ template, iterates? })
 * @param {object} opts - { fnName: string, esm: boolean }
 * @returns {string} source code of one .js file exporting the factory.
 */
export function compileParseResult(parsed, opts) {
    const { fnName, esm = true } = opts;
    const template = parsed.template || [];
    const iterates = parsed.iterates || {};

    const tree = buildKids(template);
    const ctx = {
        dataVar: 'data',
        slotsVar: 'slots',
        counter: { n: 0 },
    };

    const body = [];
    // Single-root convention: wrap multi-root in a DocumentFragment.
    if (tree.roots.length === 1) {
        const rootId = tree.roots[0];
        const rootElm = tree.byId.get(rootId);
        if (rootElm.tag === 'text') {
            // Edge case: single-root synthetic text — return a text node.
            body.push(`    const root = document.createDocumentFragment();`);
            body.push(...emitNode(rootId, tree, iterates, 'root', ctx, 1));
            body.push(`    return root;`);
        } else {
            // Inline the root: emit then return el0.
            const lines = emitNode(rootId, tree, iterates, '/*ROOT*/', ctx, 1);
            // Rewrite last appendChild line (we have a placeholder) into a return.
            // Simpler: build a fragment and pull firstChild.
            body.push(`    const _frag = document.createDocumentFragment();`);
            const patched = lines.map(l => l.replace('/*ROOT*/', '_frag'));
            body.push(...patched);
            body.push(`    return _frag.firstChild;`);
        }
    } else {
        body.push(`    const root = document.createDocumentFragment();`);
        for (const rid of tree.roots) {
            body.push(...emitNode(rid, tree, iterates, 'root', ctx, 1));
        }
        body.push(`    return root;`);
    }

    const fn =
        `function ${fnName}(data, slots) {\n` +
        `    data = data || {};\n` +
        body.join('\n') + '\n' +
        `}\n`;

    const banner =
        `// AUTO-GENERATED by tools/rendering/aot/aot-template.js — DO NOT EDIT.\n` +
        `// Pure DOM API; no fw runtime dependency.\n` +
        `// Runs in any environment exposing \`document\` (browser, happy-dom, jsdom).\n\n`;

    if (esm) {
        return banner + fn + `\nexport default ${fnName};\n`;
    }
    return banner + fn + `\nmodule.exports = ${fnName};\n`;
}

/** Derive a factory function name from a filename. `nav-bar.html` → `tplNavBar`. */
export function deriveName(prefix, baseName) {
    const camel = baseName
        .replace(/\.html$/i, '')
        .replace(/[-_.\s]+(.)/g, (_, c) => c.toUpperCase())
        .replace(/^./, c => c.toUpperCase());
    return `${prefix}${camel}`;
}
