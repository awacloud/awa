// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview SpreadsheetML threaded comments — an Office 2018+ Microsoft
 * extension, not part of ECMA-376, defined in the namespace
 * `http://schemas.microsoft.com/office/spreadsheetml/2018/threadedcomments`.
 *
 * The threaded model replaces legacy comments with discussion threads,
 * @-mentions and a resolved/unresolved state. It coexists with legacy
 * comments for compatibility with older Excel versions.
 *
 * Structure :
 *
 * | Part | Role |
 * |------|------|
 * | `xl/threadedComments/threadedComment{N}.xml` | Thread-aware comment list (one file per sheet). |
 * | `xl/persons/person.xml` | Global registry of authors (display name + provider id). |
 *
 * Document model (sheet level) :
 *
 * ```js
 * sheet.threadedComments: [{
 *   id: '{GUID}',                      // unique per comment
 *   ref: 'A1',                          // cell reference
 *   date: '2024-01-15T10:30:00Z',       // ISO 8601 UTC
 *   personId: '{GUID}',                  // → workbook.persons[].id
 *   parentId?: '{GUID}',                 // for replies
 *   text: string,
 *   done?: boolean,                      // resolved flag
 *   mentions?: [{
 *     mentionpersonId: '{GUID}',
 *     mentionId: number, startIndex: number, length: number
 *   }]
 * }]
 * ```
 *
 * Document model (workbook level) :
 *
 * ```js
 * workbook.persons: [{
 *   id: '{GUID}',
 *   displayName: string,
 *   userId?: string,
 *   providerId?: 'AD' | 'PeoplePicker' | 'None'
 * }]
 * ```
 *
 * @module ooxml/xlsx/threadedComments
 */

import { ooxmlErrors } from '../errors.js';
import { xml } from '@awacloud/fw/io/codec/xml.js';
import { ooxmlShared } from '../_shared/index.js';

export const xlsxThreadedComments = {
    name: 'xlsxThreadedComments',
    dependencies: ['ooxmlErrors', 'xml', 'ooxmlShared'],
    deps: [ooxmlErrors, xml, ooxmlShared],

    factory(errors, xml, shared) {
        const { ParseError, RenderError } = errors;
        const { NS, REL_TYPE, readBoolAttr, writeBoolAttr, encodeText, decodeText } = shared;

        const TC_NS = NS.TC;
        const REL_TYPE_THREADED_COMMENT = REL_TYPE.THREADED_COMMENT;
        const REL_TYPE_PERSON = REL_TYPE.PERSON;
        const CT_THREADED_COMMENTS = 'application/vnd.ms-excel.threadedcomments+xml';
        const CT_PERSONS = 'application/vnd.ms-excel.person+xml';

        // --- Threaded comments (per-sheet) ---

        function parseThreadedComments(input) {
            const text = typeof input === 'string' ? input : decodeText(input);
            const root = xml.parse(text);
            if (root.name !== 'ThreadedComments' && root.name !== 'threadedComments') {
                throw new ParseError('xlsx/threaded-comments-bad-root',
                    `xlsx threadedComments: expected <ThreadedComments>, got <${root.name}>`,
                    { context: { elementName: root && root.name } });
            }
            const out = [];
            for (const c of root.children) {
                if (c.type !== 'element') continue;
                if (c.name !== 'threadedComment') continue;
                const entry = {
                    id: c.attrs.id,
                    ref: c.attrs.ref,
                    date: c.attrs.dT,
                    personId: c.attrs.personId
                };
                if (c.attrs.parentId) entry.parentId = c.attrs.parentId;
                if (c.attrs.done != null) entry.done = readBoolAttr(c.attrs.done);
                const tEl = xml.findChild(c, 'text');
                if (tEl) entry.text = xml.textContent(tEl);
                const mentionsEl = xml.findChild(c, 'mentions');
                if (mentionsEl) {
                    entry.mentions = [];
                    for (const mEl of xml.findAll(mentionsEl, 'mention')) {
                        entry.mentions.push({
                            mentionpersonId: mEl.attrs.mentionpersonId,
                            mentionId: mEl.attrs.mentionId,
                            startIndex: Number(mEl.attrs.startIndex || 0),
                            length: Number(mEl.attrs.length || 0)
                        });
                    }
                }
                out.push(entry);
            }
            return out;
        }

        function serializeThreadedComments(entries) {
            const items = (entries || []).map(c => {
                const a = {
                    ref: c.ref,
                    dT: c.date,
                    personId: c.personId,
                    id: c.id
                };
                if (c.parentId) a.parentId = c.parentId;
                if (c.done != null) a.done = writeBoolAttr(c.done);
                const inner = [];
                inner.push(xml.el('text', {}, [xml.text(c.text || '')]));
                if (c.mentions && c.mentions.length) {
                    inner.push(xml.el('mentions', {},
                        c.mentions.map(m => xml.el('mention', {
                            mentionpersonId: m.mentionpersonId,
                            mentionId: String(m.mentionId),
                            startIndex: String(m.startIndex || 0),
                            length: String(m.length || 0)
                        }))));
                }
                return xml.el('threadedComment', a, inner);
            });
            return xml.serialize(xml.el('ThreadedComments',
                { xmlns: TC_NS }, items));
        }

        function threadedCommentsBytes(entries) {
            return encodeText(serializeThreadedComments(entries));
        }

        // --- Persons (workbook-level) ---

        function parsePersons(input) {
            const text = typeof input === 'string' ? input : decodeText(input);
            const root = xml.parse(text);
            if (root.name !== 'personList' && root.name !== 'PersonList') {
                throw new ParseError('xlsx/persons-bad-root',
                    `xlsx persons: expected <personList>, got <${root.name}>`,
                    { context: { elementName: root && root.name } });
            }
            const out = [];
            for (const p of xml.findAll(root, 'person')) {
                const entry = {
                    id: p.attrs.id,
                    displayName: p.attrs.displayName
                };
                if (p.attrs.userId)     entry.userId = p.attrs.userId;
                if (p.attrs.providerId) entry.providerId = p.attrs.providerId;
                out.push(entry);
            }
            return out;
        }

        function serializePersons(persons) {
            const items = (persons || []).map(p => {
                const a = { displayName: p.displayName, id: p.id };
                if (p.userId)     a.userId = p.userId;
                if (p.providerId) a.providerId = p.providerId;
                else              a.providerId = 'None';
                return xml.el('person', a);
            });
            return xml.serialize(xml.el('personList',
                { xmlns: TC_NS }, items));
        }

        function personsBytes(persons) {
            return encodeText(serializePersons(persons));
        }

        // --- Helpers ---

        /** Generate a `{GUID}` matching what Excel produces. */
        function generateId() {
            // Read at call time (worker-safe); fail closed, never a weak fallback.
            const c = globalThis.crypto;
            if (!c || typeof c.getRandomValues !== 'function') {
                throw new RenderError('xlsx/no-random-source', 'xlsx: no cryptographic random source (crypto.getRandomValues is unavailable); pass the comment / person id explicitly');
            }
            const b = new Uint8Array(16);
            c.getRandomValues(b);
            b[6] = (b[6] & 0x0F) | 0x40;
            b[8] = (b[8] & 0x3F) | 0x80;
            const hex = Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
            return `{${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}}`;
        }

        return {
            parseThreadedComments, serializeThreadedComments, threadedCommentsBytes,
            parsePersons, serializePersons, personsBytes,
            generateId,
            TC_NS,
            REL_TYPE_THREADED_COMMENT, REL_TYPE_PERSON,
            CT_THREADED_COMMENTS, CT_PERSONS
        };
    }
};
