// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Office Math Markup Language (OMML) — ECMA-376
 * part 1 §22.1. Cross-format : the same `<m:…>` markup appears in
 * docx (paragraph children + body children), pptx (slide text bodies)
 * and xlsx (rare — chart titles, comments).
 *
 * The module exposes a typed model for the structural math constructs.
 * Wrapper containers (`<m:e>`, `<m:num>`, `<m:den>`, `<m:sub>`,
 * `<m:sup>`, …) hold an array of math elements ; the array form is
 * preserved across the model so users compose by concatenation.
 *
 * Document model :
 *
 * ```js
 * { type: 'oMath',
 *   children: [mathElement, ...] }
 *
 * { type: 'oMathPara',
 *   children: [oMath] }            // block-level wrapper
 *
 * mathElement :=
 *   | { type: 'mathRun', text: string, rPr?: { sty? } }
 *   | { type: 'frac',    numerator: [mathElement], denominator: [mathElement] }
 *   | { type: 'sSup',    base: [mathElement], sup: [mathElement] }
 *   | { type: 'sSub',    base: [mathElement], sub: [mathElement] }
 *   | { type: 'sSubSup', base: [mathElement], sub: [...], sup: [...] }
 *   | { type: 'rad',     degree: [mathElement], base: [mathElement] }
 *   | { type: 'nary',    op: string, sub: [...], sup: [...], body: [...] }
 *   | { type: 'd',       open?: '(', close?: ')', sep?: '|',
 *                         children: [[mathElement]] }   // each "slot" is an array
 *   | { type: 'func',    name: [mathElement], body: [mathElement] }
 *   | { type: 'm',       rows: [[[mathElement]]] }       // m × n cells
 *   | { type: 'acc',     char?: '^', base: [mathElement] }
 *   | { type: 'bar',     pos?: 'top'|'bot', base: [mathElement] }
 *   | { type: 'box',     base: [mathElement] }
 *   | { type: 'mathUnknown', node: xmlNode }
 * ```
 *
 * `rPr.sty` follows ECMA-376 §22.1.2.114 :
 * - `'p'` plain
 * - `'b'` bold (default for letters)
 * - `'i'` italic
 * - `'bi'` bold italic
 *
 * @module ooxml/math
 */

import { ooxmlErrors } from '../errors.js';
import { xml } from '@awacloud/fw/io/codec/xml.js';

export const ooxmlMath = {
    name: 'ooxmlMath',
    dependencies: ['ooxmlErrors', 'xml'],
    deps: [ooxmlErrors, xml],

    factory(errors, xml) {
        const { ParseError } = errors;

        const M_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/math';

        // --- Container ("slot") helper ---
        // Every wrapper element (m:e, m:num, m:den, m:sub, m:sup, m:deg, m:fName)
        // contains a sequence of math elements. parseChildren extracts that.

        function parseSlot(parentEl) {
            const out = [];
            if (!parentEl) return out;
            for (const c of parentEl.children) {
                if (c.type !== 'element') continue;
                const node = parseMathElement(c);
                if (node) out.push(node);
            }
            return out;
        }

        function renderSlot(name, elements) {
            return xml.el(name, {},
                (elements || []).map(renderMathElement));
        }

        // --- Property elements ---
        // A construct's property element (m:fPr, m:dPr, …): the children
        // this module types are read into fields, the others are kept
        // verbatim in `_prExtras` (an empty array for a present, empty
        // element) and written after the typed ones (m:ctrlPr, last in
        // every property element, among them).

        /** `node` with the untyped children of its property element `prName`. */
        function withPr(el, prName, node) {
            readPr(node, el, prName, []);
            return node;
        }

        function readPr(node, el, prName, typed) {
            const pr = xml.findChild(el, prName);
            if (pr) node._prExtras = pr.children.filter(c => c.type === 'element' && !typed.includes(c.name));
            return pr;
        }

        function renderPr(prName, typedChildren, n) {
            if (!typedChildren.length && !n._prExtras) return [];
            return [xml.el(prName, {}, [...typedChildren, ...(n._prExtras || [])])];
        }

        // A character property (m:chr, m:begChr, …): an empty value is a
        // character too (none drawn).
        function charOf(pr, name) {
            const c = pr && xml.findChild(pr, name);
            return c && c.attrs['m:val'] != null ? c.attrs['m:val'] : undefined;
        }

        // --- Math run (m:r) ---

        function parseMathRun(rEl) {
            const out = { type: 'mathRun', text: '' };
            const rPrEl = xml.findChild(rEl, 'm:rPr');
            if (rPrEl) {
                const sty = xml.findChild(rPrEl, 'm:sty');
                const rPr = {};
                if (sty) rPr.sty = sty.attrs['m:val'];
                const extras = rPrEl.children.filter(c => c.type === 'element' && c.name !== 'm:sty');
                if (extras.length) rPr._extras = extras;
                if (Object.keys(rPr).length) out.rPr = rPr;
            }
            // The run's other children (its w:rPr), verbatim.
            const extras = [];
            for (const c of rEl.children) {
                if (c.type !== 'element') continue;
                if (c.name === 'm:t') out.text += xml.textContent(c);
                else if (c.name !== 'm:rPr') extras.push(c);
            }
            if (extras.length) out._extras = extras;
            return out;
        }

        // CT_RPR (math): lit, then the scr / sty choice, then brk, aln.
        const SCRIPT_BEFORE_STY = new Set(['m:lit', 'm:nor', 'm:scr']);

        function renderMathRun(r) {
            const children = [];
            if (r.rPr) {
                const inner = [];
                if (r.rPr._extras) inner.push(...r.rPr._extras.filter(c => c.name !== 'm:sty' && SCRIPT_BEFORE_STY.has(c.name)));
                if (r.rPr.sty) inner.push(xml.el('m:sty', { 'm:val': r.rPr.sty }));
                if (r.rPr._extras) inner.push(...r.rPr._extras.filter(c => !SCRIPT_BEFORE_STY.has(c.name)));
                if (inner.length) children.push(xml.el('m:rPr', {}, inner));
            }
            if (r._extras) children.push(...r._extras);
            children.push(xml.el('m:t', { 'xml:space': 'preserve' },
                [xml.text(r.text || '')]));
            return xml.el('m:r', {}, children);
        }

        // --- Fraction (m:f) ---

        function parseFrac(fEl) {
            const out = {
                type: 'frac',
                numerator:   parseSlot(xml.findChild(fEl, 'm:num')),
                denominator: parseSlot(xml.findChild(fEl, 'm:den'))
            };
            readPr(out, fEl, 'm:fPr', []);
            return out;
        }

        function renderFrac(f) {
            return xml.el('m:f', {}, [
                ...renderPr('m:fPr', [], f),
                renderSlot('m:num', f.numerator),
                renderSlot('m:den', f.denominator)
            ]);
        }

        // --- Superscript / Subscript / SubSup ---

        function parseSSup(el) {
            return withPr(el, 'm:sSupPr', {
                type: 'sSup',
                base: parseSlot(xml.findChild(el, 'm:e')),
                sup:  parseSlot(xml.findChild(el, 'm:sup'))
            });
        }

        function renderSSup(n) {
            return xml.el('m:sSup', {}, [
                ...renderPr('m:sSupPr', [], n),
                renderSlot('m:e', n.base),
                renderSlot('m:sup', n.sup)
            ]);
        }

        function parseSSub(el) {
            return withPr(el, 'm:sSubPr', {
                type: 'sSub',
                base: parseSlot(xml.findChild(el, 'm:e')),
                sub:  parseSlot(xml.findChild(el, 'm:sub'))
            });
        }

        function renderSSub(n) {
            return xml.el('m:sSub', {}, [
                ...renderPr('m:sSubPr', [], n),
                renderSlot('m:e', n.base),
                renderSlot('m:sub', n.sub)
            ]);
        }

        function parseSSubSup(el) {
            return withPr(el, 'm:sSubSupPr', {
                type: 'sSubSup',
                base: parseSlot(xml.findChild(el, 'm:e')),
                sub:  parseSlot(xml.findChild(el, 'm:sub')),
                sup:  parseSlot(xml.findChild(el, 'm:sup'))
            });
        }

        function renderSSubSup(n) {
            return xml.el('m:sSubSup', {}, [
                ...renderPr('m:sSubSupPr', [], n),
                renderSlot('m:e', n.base),
                renderSlot('m:sub', n.sub),
                renderSlot('m:sup', n.sup)
            ]);
        }

        // --- Radical (m:rad) ---

        function parseRad(el) {
            return withPr(el, 'm:radPr', {
                type: 'rad',
                degree: parseSlot(xml.findChild(el, 'm:deg')),
                base:   parseSlot(xml.findChild(el, 'm:e'))
            });
        }

        function renderRad(n) {
            return xml.el('m:rad', {}, [
                ...renderPr('m:radPr', [], n),
                renderSlot('m:deg', n.degree),
                renderSlot('m:e', n.base)
            ]);
        }

        // --- N-ary operator (m:nary) — sum, integral, product, etc. ---

        function parseNary(el) {
            const out = {
                type: 'nary',
                op: '∑',
                sub:  parseSlot(xml.findChild(el, 'm:sub')),
                sup:  parseSlot(xml.findChild(el, 'm:sup')),
                body: parseSlot(xml.findChild(el, 'm:e'))
            };
            const naryPr = readPr(out, el, 'm:naryPr', ['m:chr']);
            const op = charOf(naryPr, 'm:chr');
            if (op != null) out.op = op;
            return out;
        }

        function renderNary(n) {
            const children = [];
            children.push(...renderPr('m:naryPr', [
                xml.el('m:chr', { 'm:val': n.op ?? '∑' })
            ], n));
            children.push(renderSlot('m:sub', n.sub));
            children.push(renderSlot('m:sup', n.sup));
            children.push(renderSlot('m:e', n.body));
            return xml.el('m:nary', {}, children);
        }

        // --- Delimiter (m:d) — parens / brackets, possibly multi-element ---

        function parseDelim(el) {
            const out = { type: 'd', children: [] };
            const dPr = readPr(out, el, 'm:dPr', ['m:begChr', 'm:sepChr', 'm:endChr']);
            const open = charOf(dPr, 'm:begChr'), close = charOf(dPr, 'm:endChr'), sep = charOf(dPr, 'm:sepChr');
            if (open != null) out.open = open;
            if (close != null) out.close = close;
            if (sep != null) out.sep = sep;
            // Each <m:e> child is one "slot".
            for (const c of el.children) {
                if (c.type !== 'element') continue;
                if (c.name === 'm:e') out.children.push(parseSlot(c));
            }
            return out;
        }

        function renderDelim(n) {
            const children = [];
            const pr = [];
            // CT_DPr order: begChr, sepChr, endChr.
            if (n.open != null)  pr.push(xml.el('m:begChr', { 'm:val': n.open }));
            if (n.sep != null)   pr.push(xml.el('m:sepChr', { 'm:val': n.sep }));
            if (n.close != null) pr.push(xml.el('m:endChr', { 'm:val': n.close }));
            children.push(...renderPr('m:dPr', pr, n));
            for (const slot of n.children || []) {
                children.push(renderSlot('m:e', slot));
            }
            return xml.el('m:d', {}, children);
        }

        // --- Function (m:func) ---

        function parseFunc(el) {
            return withPr(el, 'm:funcPr', {
                type: 'func',
                name: parseSlot(xml.findChild(el, 'm:fName')),
                body: parseSlot(xml.findChild(el, 'm:e'))
            });
        }

        function renderFunc(n) {
            return xml.el('m:func', {}, [
                ...renderPr('m:funcPr', [], n),
                renderSlot('m:fName', n.name),
                renderSlot('m:e', n.body)
            ]);
        }

        // --- Matrix (m:m) ---

        function parseMatrix(el) {
            const out = { type: 'm', rows: [] };
            readPr(out, el, 'm:mPr', []);
            for (const r of xml.findAll(el, 'm:mr')) {
                const row = [];
                for (const c of xml.findAll(r, 'm:e')) {
                    row.push(parseSlot(c));
                }
                out.rows.push(row);
            }
            return out;
        }

        function renderMatrix(n) {
            const rows = (n.rows || []).map(row =>
                xml.el('m:mr', {}, row.map(cell => renderSlot('m:e', cell))));
            return xml.el('m:m', {}, [...renderPr('m:mPr', [], n), ...rows]);
        }

        // --- Accent (m:acc) and Bar (m:bar) and Box (m:box) ---

        function parseAcc(el) {
            const out = { type: 'acc', base: parseSlot(xml.findChild(el, 'm:e')) };
            const accPr = readPr(out, el, 'm:accPr', ['m:chr']);
            const char = charOf(accPr, 'm:chr');
            if (char != null) out.char = char;
            return out;
        }

        function renderAcc(n) {
            const children = [];
            children.push(...renderPr('m:accPr',
                n.char != null ? [xml.el('m:chr', { 'm:val': n.char })] : [], n));
            children.push(renderSlot('m:e', n.base));
            return xml.el('m:acc', {}, children);
        }

        function parseBar(el) {
            const out = { type: 'bar', base: parseSlot(xml.findChild(el, 'm:e')) };
            const barPr = readPr(out, el, 'm:barPr', ['m:pos']);
            const pos = charOf(barPr, 'm:pos');
            if (pos != null) out.pos = pos;
            return out;
        }

        function renderBar(n) {
            const children = [];
            children.push(...renderPr('m:barPr',
                n.pos != null ? [xml.el('m:pos', { 'm:val': n.pos })] : [], n));
            children.push(renderSlot('m:e', n.base));
            return xml.el('m:bar', {}, children);
        }

        function parseBox(el) {
            return withPr(el, 'm:boxPr', { type: 'box', base: parseSlot(xml.findChild(el, 'm:e')) });
        }

        function renderBox(n) {
            return xml.el('m:box', {}, [...renderPr('m:boxPr', [], n), renderSlot('m:e', n.base)]);
        }

        // --- Dispatch ---

        function parseMathElement(el) {
            switch (el.name) {
                case 'm:r':       return parseMathRun(el);
                case 'm:f':       return parseFrac(el);
                case 'm:sSup':    return parseSSup(el);
                case 'm:sSub':    return parseSSub(el);
                case 'm:sSubSup': return parseSSubSup(el);
                case 'm:rad':     return parseRad(el);
                case 'm:nary':    return parseNary(el);
                case 'm:d':       return parseDelim(el);
                case 'm:func':    return parseFunc(el);
                case 'm:m':       return parseMatrix(el);
                case 'm:acc':     return parseAcc(el);
                case 'm:bar':     return parseBar(el);
                case 'm:box':     return parseBox(el);
                case 'm:oMath':   return parseOMath(el);
                default:          return { type: 'mathUnknown', node: el };
            }
        }

        function renderMathElement(n) {
            switch (n.type) {
                case 'mathRun':   return renderMathRun(n);
                case 'frac':      return renderFrac(n);
                case 'sSup':      return renderSSup(n);
                case 'sSub':      return renderSSub(n);
                case 'sSubSup':   return renderSSubSup(n);
                case 'rad':       return renderRad(n);
                case 'nary':      return renderNary(n);
                case 'd':         return renderDelim(n);
                case 'func':      return renderFunc(n);
                case 'm':         return renderMatrix(n);
                case 'acc':       return renderAcc(n);
                case 'bar':       return renderBar(n);
                case 'box':       return renderBox(n);
                case 'oMath':     return renderOMath(n);
                case 'mathUnknown': return n.node;
                default:          throw new ParseError('math/unknown-node-type', `ooxmlMath: unknown type ${n.type}`, { context: { type: n && n.type } });
            }
        }

        // --- Top-level oMath / oMathPara ---

        function parseOMath(el) {
            return { type: 'oMath', children: parseSlot(el) };
        }

        function renderOMath(n) {
            const children = (n.children || []).map(renderMathElement);
            return xml.el('m:oMath', {}, children);
        }

        function parseOMathPara(el) {
            const out = { type: 'oMathPara', children: [] };
            const extras = [];
            for (const c of el.children) {
                if (c.type !== 'element') continue;
                if (c.name === 'm:oMath') out.children.push(parseOMath(c));
                else extras.push(c); // m:oMathParaPr, verbatim
            }
            if (extras.length) out._extras = extras;
            return out;
        }

        function renderOMathPara(n) {
            return xml.el('m:oMathPara', {},
                [...(n._extras || []), ...(n.children || []).map(renderOMath)]);
        }

        // --- Builders ---

        /** Build a math run with optional style (`'p'`, `'b'`, `'i'`, `'bi'`). */
        function r(text, sty) {
            const out = { type: 'mathRun', text: String(text || '') };
            if (sty) out.rPr = { sty };
            return out;
        }

        /** Build a fraction. */
        function frac(numerator, denominator) {
            return {
                type: 'frac',
                numerator: toArray(numerator),
                denominator: toArray(denominator)
            };
        }

        /** Build a superscript. */
        function sup(base, sup) {
            return { type: 'sSup', base: toArray(base), sup: toArray(sup) };
        }

        /** Build a subscript. */
        function sub(base, sub) {
            return { type: 'sSub', base: toArray(base), sub: toArray(sub) };
        }

        /** Build a base with both subscript and superscript. */
        function subSup(base, sub, sup) {
            return {
                type: 'sSubSup',
                base: toArray(base),
                sub:  toArray(sub),
                sup:  toArray(sup)
            };
        }

        /** Build a radical (root). `degree` may be empty for square root. */
        function rad(base, degree) {
            return {
                type: 'rad',
                degree: degree != null ? toArray(degree) : [],
                base:   toArray(base)
            };
        }

        /** Build an n-ary operator like sum / integral / product. */
        function nary(op, sub, sup, body) {
            return {
                type: 'nary',
                op,
                sub:  toArray(sub),
                sup:  toArray(sup),
                body: toArray(body)
            };
        }

        /** Build a delimiter (parens / brackets / etc.). */
        function delim(content, opts = {}) {
            const slots = Array.isArray(content) && Array.isArray(content[0])
                ? content                  // already an array of slots
                : [toArray(content)];      // single slot
            return {
                type: 'd',
                ...(opts.open  != null ? { open:  opts.open }  : {}),
                ...(opts.close != null ? { close: opts.close } : {}),
                ...(opts.sep   != null ? { sep:   opts.sep }   : {}),
                children: slots
            };
        }

        /** Build a function call (`sin x`, `cos θ`, `log_2 n`). */
        function func(name, body) {
            return { type: 'func', name: toArray(name), body: toArray(body) };
        }

        /** Build a matrix from a 2-D array of slots. */
        function matrix(rows) {
            return {
                type: 'm',
                rows: (rows || []).map(row => row.map(toArray))
            };
        }

        function toArray(x) {
            if (x == null) return [];
            return Array.isArray(x) ? x : [x];
        }

        // --- Wrappers ---

        function oMath(...children) {
            const flat = [];
            for (const c of children) {
                if (Array.isArray(c)) flat.push(...c);
                else                   flat.push(c);
            }
            return { type: 'oMath', children: flat };
        }

        function oMathPara(...maths) {
            return { type: 'oMathPara',
                     children: maths.map(m =>
                         m.type === 'oMath' ? m : oMath(m)) };
        }

        return {
            // Parse / render top-level
            parseOMath, renderOMath,
            parseOMathPara, renderOMathPara,
            parseMathElement, renderMathElement,
            // Builders
            r, frac, sup, sub, subSup, rad, nary, delim, func, matrix,
            oMath, oMathPara,
            M_NS
        };
    }
};
