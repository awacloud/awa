// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Opt-in: typed parser/serializer for Word field
 * instructions.
 *
 * Exposes a tokenizer plus a typed catalog for the most common field
 * codes. Each entry in `KNOWN_FIELDS` has a `parse(parsedInstruction)` ->
 * structured object and a `render(struct)` -> instruction string.
 *
 * Coverage : PAGE, NUMPAGES, SECTION, SECTIONPAGES, DATE, TIME,
 * CREATEDATE, SAVEDATE, PRINTDATE, MERGEFIELD, HYPERLINK, IF,
 * INCLUDETEXT, INCLUDEPICTURE, REF, STYLEREF, TOC, INDEX, XE, RD,
 * EQ, ASK, FILLIN, SET, BIDIOUTLINE, AUTHOR, TITLE, SUBJECT, KEYWORDS,
 * FILENAME, FILESIZE.
 *
 * @module ooxml/extra/wml-fields
 */

export const wmlFields = {
    name: 'wmlFields',
    dependencies: [],

    factory() {
        // ---- low-level tokenizer ----
        function tokenize(instr) {
            const tokens = [];
            let i = 0;
            const s = instr.trim();
            while (i < s.length) {
                while (i < s.length && /\s/.test(s[i])) i++;
                if (i >= s.length) break;
                if (s[i] === '"') {
                    let j = i + 1;
                    while (j < s.length && s[j] !== '"') j++;
                    tokens.push({ kind: 'string', value: s.slice(i + 1, j) });
                    i = j + 1;
                } else if (s[i] === '\\') {
                    let j = i + 1;
                    while (j < s.length && /\S/.test(s[j])) j++;
                    tokens.push({ kind: 'switch', value: s.slice(i, j) });
                    i = j;
                } else {
                    let j = i;
                    while (j < s.length && /\S/.test(s[j])) j++;
                    tokens.push({ kind: 'word', value: s.slice(i, j) });
                    i = j;
                }
            }
            return tokens;
        }

        function parseInstruction(instr) {
            const tokens = tokenize(instr);
            if (!tokens.length) return null;
            const out = { type: tokens[0].value.toUpperCase(), args: [], switches: {} };
            for (let i = 1; i < tokens.length; i++) {
                const t = tokens[i];
                if (t.kind === 'switch') {
                    const key = t.value;
                    const next = tokens[i + 1];
                    if (next && next.kind !== 'switch') {
                        out.switches[key] = next.value;
                        i++;
                    } else {
                        out.switches[key] = true;
                    }
                } else {
                    out.args.push(t.value);
                }
            }
            return out;
        }

        function quoteIfNeeded(v) {
            const s = String(v);
            return /\s/.test(s) ? `"${s}"` : s;
        }

        function renderInstruction(parsed) {
            const parts = [parsed.type];
            for (const a of parsed.args || []) parts.push(quoteIfNeeded(a));
            for (const [k, v] of Object.entries(parsed.switches || {})) {
                if (v === true) parts.push(k);
                else parts.push(k, quoteIfNeeded(v));
            }
            return parts.join(' ');
        }

        // ---- Switch helpers ----
        function copySwitches(sw, exclude) {
            const out = {};
            for (const [k, v] of Object.entries(sw)) {
                if (!exclude.has(k)) out[k] = v;
            }
            return out;
        }

        // ---- Per-field parsers / renderers ----
        // Convention: parseX(parsed) -> structured ; renderX(struct) -> string.

        const KNOWN_FIELDS = {

            // PAGE / NUMPAGES / SECTION / SECTIONPAGES — value-only fields
            PAGE:         simpleField('PAGE'),
            NUMPAGES:     simpleField('NUMPAGES'),
            SECTION:      simpleField('SECTION'),
            SECTIONPAGES: simpleField('SECTIONPAGES'),

            // Date/time fields with optional \@ "format" switch
            DATE:        dateField('DATE'),
            TIME:        dateField('TIME'),
            CREATEDATE:  dateField('CREATEDATE'),
            SAVEDATE:    dateField('SAVEDATE'),
            PRINTDATE:   dateField('PRINTDATE'),

            MERGEFIELD: {
                parse(p) {
                    const sw = p.switches || {};
                    return {
                        type: 'MERGEFIELD',
                        fieldName: p.args[0],
                        mergeFormat: sw['\\*'] === 'MERGEFORMAT' || sw['\\*'] === true ? true : (sw['\\*'] || undefined),
                        before: sw['\\b'],
                        after: sw['\\f'],
                        format: sw['\\#'] || sw['\\@'],
                        otherSwitches: copySwitches(sw, new Set(['\\*', '\\b', '\\f', '\\#', '\\@']))
                    };
                },
                render(s) {
                    const sw = { ...(s.otherSwitches || {}) };
                    if (s.mergeFormat) sw['\\*'] = s.mergeFormat === true ? 'MERGEFORMAT' : s.mergeFormat;
                    if (s.before != null) sw['\\b'] = s.before;
                    if (s.after != null)  sw['\\f'] = s.after;
                    if (s.format != null) sw['\\#'] = s.format;
                    return renderInstruction({ type: 'MERGEFIELD', args: [s.fieldName], switches: sw });
                }
            },

            HYPERLINK: {
                parse(p) {
                    const sw = p.switches || {};
                    return {
                        type: 'HYPERLINK',
                        url: p.args[0],
                        anchor: sw['\\l'],
                        target: sw['\\t'],
                        screenTip: sw['\\o'],
                        m: sw['\\m'] === true,
                        n: sw['\\n'] === true,
                        otherSwitches: copySwitches(sw, new Set(['\\l', '\\t', '\\o', '\\m', '\\n']))
                    };
                },
                render(s) {
                    const sw = { ...(s.otherSwitches || {}) };
                    if (s.anchor != null)    sw['\\l'] = s.anchor;
                    if (s.target != null)    sw['\\t'] = s.target;
                    if (s.screenTip != null) sw['\\o'] = s.screenTip;
                    if (s.m) sw['\\m'] = true;
                    if (s.n) sw['\\n'] = true;
                    return renderInstruction({ type: 'HYPERLINK', args: s.url != null ? [s.url] : [], switches: sw });
                }
            },

            IF: {
                parse(p) {
                    return {
                        type: 'IF',
                        left: p.args[0],
                        operator: p.args[1],
                        right: p.args[2],
                        trueText: p.args[3],
                        falseText: p.args[4],
                        switches: { ...(p.switches || {}) }
                    };
                },
                render(s) {
                    const args = [];
                    for (const k of ['left', 'operator', 'right', 'trueText', 'falseText']) {
                        if (s[k] != null) args.push(s[k]);
                    }
                    return renderInstruction({ type: 'IF', args, switches: s.switches || {} });
                }
            },

            INCLUDETEXT: {
                parse(p) {
                    const sw = p.switches || {};
                    return { type: 'INCLUDETEXT', source: p.args[0], bookmark: p.args[1],
                             namespaceMappings: sw['\\n'], xpath: sw['\\x'],
                             switches: copySwitches(sw, new Set(['\\n', '\\x'])) };
                },
                render(s) {
                    const sw = { ...(s.switches || {}) };
                    if (s.namespaceMappings != null) sw['\\n'] = s.namespaceMappings;
                    if (s.xpath != null) sw['\\x'] = s.xpath;
                    const args = [];
                    if (s.source != null) args.push(s.source);
                    if (s.bookmark != null) args.push(s.bookmark);
                    return renderInstruction({ type: 'INCLUDETEXT', args, switches: sw });
                }
            },

            INCLUDEPICTURE: {
                parse(p) { return { type: 'INCLUDEPICTURE', source: p.args[0],
                                    switches: { ...(p.switches || {}) } }; },
                render(s) { return renderInstruction({ type: 'INCLUDEPICTURE',
                                                       args: s.source != null ? [s.source] : [],
                                                       switches: s.switches || {} }); }
            },

            REF: {
                parse(p) {
                    const sw = p.switches || {};
                    return { type: 'REF', bookmark: p.args[0],
                             hyperlink: sw['\\h'] === true,
                             insertParaNum: sw['\\n'] === true,
                             relative: sw['\\r'] === true,
                             switches: copySwitches(sw, new Set(['\\h', '\\n', '\\r'])) };
                },
                render(s) {
                    const sw = { ...(s.switches || {}) };
                    if (s.hyperlink) sw['\\h'] = true;
                    if (s.insertParaNum) sw['\\n'] = true;
                    if (s.relative) sw['\\r'] = true;
                    return renderInstruction({ type: 'REF',
                                               args: s.bookmark != null ? [s.bookmark] : [],
                                               switches: sw });
                }
            },

            STYLEREF: {
                parse(p) {
                    const sw = p.switches || {};
                    return { type: 'STYLEREF', styleName: p.args[0],
                             searchFromBottom: sw['\\l'] === true,
                             insertNumber: sw['\\n'] === true,
                             switches: copySwitches(sw, new Set(['\\l', '\\n'])) };
                },
                render(s) {
                    const sw = { ...(s.switches || {}) };
                    if (s.searchFromBottom) sw['\\l'] = true;
                    if (s.insertNumber)     sw['\\n'] = true;
                    return renderInstruction({ type: 'STYLEREF',
                                               args: s.styleName != null ? [s.styleName] : [],
                                               switches: sw });
                }
            },

            TOC: {
                parse(p) {
                    const sw = p.switches || {};
                    let minLevel, maxLevel;
                    if (sw['\\o']) {
                        const m = String(sw['\\o']).match(/^(\d+)-(\d+)$/);
                        if (m) { minLevel = Number(m[1]); maxLevel = Number(m[2]); }
                    }
                    return { type: 'TOC',
                             outlineRange: sw['\\o'],
                             minLevel, maxLevel,
                             hyperlinks: sw['\\h'] === true,
                             hideTabAndPageNum: sw['\\n'],
                             omitPageNum: sw['\\z'] === true,
                             useAppliedParaOutline: sw['\\u'] === true,
                             buildFromBookmark: sw['\\b'],
                             tableEntryFields: sw['\\f'],
                             tableEntryStyle: sw['\\t'],
                             buildFromStyles: sw['\\l'],
                             switches: copySwitches(sw, new Set(['\\o', '\\h', '\\n', '\\z', '\\u', '\\b', '\\f', '\\t', '\\l'])) };
                },
                render(s) {
                    const sw = { ...(s.switches || {}) };
                    if (s.outlineRange != null) sw['\\o'] = s.outlineRange;
                    else if (s.minLevel != null && s.maxLevel != null) sw['\\o'] = `${s.minLevel}-${s.maxLevel}`;
                    if (s.hyperlinks) sw['\\h'] = true;
                    if (s.hideTabAndPageNum != null) sw['\\n'] = s.hideTabAndPageNum;
                    if (s.omitPageNum) sw['\\z'] = true;
                    if (s.useAppliedParaOutline) sw['\\u'] = true;
                    if (s.buildFromBookmark != null) sw['\\b'] = s.buildFromBookmark;
                    if (s.tableEntryFields != null) sw['\\f'] = s.tableEntryFields;
                    if (s.tableEntryStyle != null)  sw['\\t'] = s.tableEntryStyle;
                    if (s.buildFromStyles != null)  sw['\\l'] = s.buildFromStyles;
                    return renderInstruction({ type: 'TOC', args: [], switches: sw });
                }
            },

            INDEX: {
                parse(p) {
                    const sw = p.switches || {};
                    return { type: 'INDEX', columns: sw['\\c'], language: sw['\\l'],
                             entryType: sw['\\f'], heading: sw['\\h'],
                             switches: copySwitches(sw, new Set(['\\c', '\\l', '\\f', '\\h'])) };
                },
                render(s) {
                    const sw = { ...(s.switches || {}) };
                    if (s.columns != null) sw['\\c'] = s.columns;
                    if (s.language != null) sw['\\l'] = s.language;
                    if (s.entryType != null) sw['\\f'] = s.entryType;
                    if (s.heading != null) sw['\\h'] = s.heading;
                    return renderInstruction({ type: 'INDEX', args: [], switches: sw });
                }
            },

            XE: {
                parse(p) { return { type: 'XE', text: p.args[0],
                                    switches: { ...(p.switches || {}) } }; },
                render(s) { return renderInstruction({ type: 'XE',
                                                       args: s.text != null ? [s.text] : [],
                                                       switches: s.switches || {} }); }
            },

            RD: {
                parse(p) { return { type: 'RD', file: p.args[0],
                                    switches: { ...(p.switches || {}) } }; },
                render(s) { return renderInstruction({ type: 'RD',
                                                       args: s.file != null ? [s.file] : [],
                                                       switches: s.switches || {} }); }
            },

            EQ: {
                parse(p) { return { type: 'EQ', tokens: p.args,
                                    switches: { ...(p.switches || {}) } }; },
                render(s) { return renderInstruction({ type: 'EQ',
                                                       args: s.tokens || [],
                                                       switches: s.switches || {} }); }
            },

            ASK: {
                parse(p) { return { type: 'ASK', bookmark: p.args[0], prompt: p.args[1],
                                    defaultResponse: (p.switches || {})['\\d'],
                                    switches: copySwitches(p.switches || {}, new Set(['\\d'])) }; },
                render(s) {
                    const sw = { ...(s.switches || {}) };
                    if (s.defaultResponse != null) sw['\\d'] = s.defaultResponse;
                    const args = [];
                    if (s.bookmark != null) args.push(s.bookmark);
                    if (s.prompt != null)   args.push(s.prompt);
                    return renderInstruction({ type: 'ASK', args, switches: sw });
                }
            },

            FILLIN: {
                parse(p) { return { type: 'FILLIN', prompt: p.args[0],
                                    defaultResponse: (p.switches || {})['\\d'],
                                    switches: copySwitches(p.switches || {}, new Set(['\\d'])) }; },
                render(s) {
                    const sw = { ...(s.switches || {}) };
                    if (s.defaultResponse != null) sw['\\d'] = s.defaultResponse;
                    return renderInstruction({ type: 'FILLIN',
                                               args: s.prompt != null ? [s.prompt] : [],
                                               switches: sw });
                }
            },

            SET: {
                parse(p) { return { type: 'SET', bookmark: p.args[0], value: p.args[1],
                                    switches: { ...(p.switches || {}) } }; },
                render(s) {
                    const args = [];
                    if (s.bookmark != null) args.push(s.bookmark);
                    if (s.value != null) args.push(s.value);
                    return renderInstruction({ type: 'SET', args, switches: s.switches || {} });
                }
            },

            BIDIOUTLINE:  simpleField('BIDIOUTLINE'),
            AUTHOR:       simpleField('AUTHOR'),
            TITLE:        simpleField('TITLE'),
            SUBJECT:      simpleField('SUBJECT'),
            KEYWORDS:     simpleField('KEYWORDS'),
            FILENAME:     simpleField('FILENAME'),
            FILESIZE:     simpleField('FILESIZE')
        };

        function simpleField(name) {
            return {
                parse(p) { return { type: name, switches: { ...(p.switches || {}) } }; },
                render(s) { return renderInstruction({ type: name, args: [], switches: s.switches || {} }); }
            };
        }
        function dateField(name) {
            return {
                parse(p) {
                    const sw = p.switches || {};
                    return { type: name, format: sw['\\@'],
                             switches: copySwitches(sw, new Set(['\\@'])) };
                },
                render(s) {
                    const sw = { ...(s.switches || {}) };
                    if (s.format != null) sw['\\@'] = s.format;
                    return renderInstruction({ type: name, args: [], switches: sw });
                }
            };
        }

        function parseTyped(instr) {
            const p = parseInstruction(instr);
            if (!p) return null;
            const spec = KNOWN_FIELDS[p.type];
            return spec ? spec.parse(p) : p;
        }
        function renderTyped(struct) {
            const spec = KNOWN_FIELDS[struct.type];
            if (spec) return spec.render(struct);
            return renderInstruction(struct);
        }

        return {
            tokenize, parseInstruction, renderInstruction,
            parseTyped, renderTyped,
            KNOWN_FIELDS,
            FIELD_NAMES: new Set(Object.keys(KNOWN_FIELDS))
        };
    }
};
