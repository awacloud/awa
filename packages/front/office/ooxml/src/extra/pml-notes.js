// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Opt-in: notesSlide / notesMaster / handoutMaster / view
 * properties parts.
 *
 * Speaker notes live in `ppt/notesSlides/notesSlide<n>.xml`, the notes
 * master in `ppt/notesMasters/notesMaster1.xml`, the handout master in
 * `ppt/handoutMasters/handoutMaster1.xml`. View properties (notesViewPr,
 * notesTextViewPr, outlineViewPr, slideSorterViewPr) live inside
 * `ppt/viewProps.xml`.
 *
 * @module ooxml/extra/pml-notes
 */

import { xml } from '@awacloud/fw/io/codec/xml.js';

export const pmlNotes = {
    name: 'pmlNotes',
    dependencies: ['xml'],
    deps: [xml],

    factory(xml) {
        // ----------------------------------------------------------------
        // Header / footer (shared by notes / notesMaster / handoutMaster)
        // ----------------------------------------------------------------

        function parseHf(el) {
            return { kind: 'hf', attrs: { ...el.attrs } };
        }
        function renderHf(hf) {
            return xml.el('p:hf', hf.attrs || {});
        }

        // ----------------------------------------------------------------
        // Color map override (notes/handout slides)
        // ----------------------------------------------------------------

        function parseClrMapOvr(el) {
            const out = { kind: 'clrMapOvr' };
            for (const c of el.children || []) {
                if (c.type !== 'element') continue;
                if (c.name === 'a:masterClrMapping')   out.masterClrMapping = true;
                else if (c.name === 'a:overrideClrMapping') out.overrideClrMapping = { ...c.attrs };
            }
            return out;
        }
        function renderClrMapOvr(c) {
            const kids = [];
            if (c.masterClrMapping) kids.push(xml.el('a:masterClrMapping', {}));
            if (c.overrideClrMapping) kids.push(xml.el('a:overrideClrMapping', c.overrideClrMapping));
            return xml.el('p:clrMapOvr', {}, kids);
        }

        // ----------------------------------------------------------------
        // <p:notes> — a notesSlide root element
        // ----------------------------------------------------------------

        function parseNotes(el) {
            const out = { kind: 'notes', attrs: { ...el.attrs } };
            const cSld = xml.findChild(el, 'p:cSld');
            if (cSld) out.cSld = { name: cSld.attrs.name, raw: cSld };
            const clrMapOvr = xml.findChild(el, 'p:clrMapOvr');
            if (clrMapOvr) out.clrMapOvr = parseClrMapOvr(clrMapOvr);
            const hf = xml.findChild(el, 'p:hf');
            if (hf) out.hf = parseHf(hf);
            return out;
        }

        function renderNotes(notes) {
            const kids = [];
            if (notes.cSld && notes.cSld.raw) {
                kids.push(notes.cSld.raw);
            } else {
                kids.push(xml.el('p:cSld', notes.cSld && notes.cSld.name ? { name: notes.cSld.name } : {}, [
                    xml.el('p:spTree', {}, [
                        xml.el('p:nvGrpSpPr', {}, [
                            xml.el('p:cNvPr', { id: '1', name: '' }),
                            xml.el('p:cNvGrpSpPr', {}),
                            xml.el('p:nvPr', {})
                        ]),
                        xml.el('p:grpSpPr', {})
                    ])
                ]));
            }
            if (notes.clrMapOvr) kids.push(renderClrMapOvr(notes.clrMapOvr));
            if (notes.hf) kids.push(renderHf(notes.hf));
            return xml.el('p:notes', {
                'xmlns:a': 'http://schemas.openxmlformats.org/drawingml/2006/main',
                'xmlns:r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
                'xmlns:p': 'http://schemas.openxmlformats.org/presentationml/2006/main',
                ...(notes.attrs || {})
            }, kids);
        }

        function parseNotesSlide(text) {
            const root = xml.parse(text);
            return parseNotes(root);
        }

        function renderNotesSlide(notes) {
            return xml.serialize(renderNotes(notes));
        }

        function buildEmptyNotesSlide() {
            return renderNotesSlide({ kind: 'notes', attrs: {},
                clrMapOvr: { kind: 'clrMapOvr', masterClrMapping: true } });
        }

        // ----------------------------------------------------------------
        // <p:notesMaster>
        // ----------------------------------------------------------------

        function parseNotesMaster(el) {
            const out = { kind: 'notesMaster', attrs: { ...el.attrs } };
            const cSld = xml.findChild(el, 'p:cSld');
            if (cSld) out.cSld = { raw: cSld };
            const clrMap = xml.findChild(el, 'p:clrMap');
            if (clrMap) out.clrMap = { ...clrMap.attrs };
            const hf = xml.findChild(el, 'p:hf');
            if (hf) out.hf = parseHf(hf);
            const notesStyle = xml.findChild(el, 'p:notesStyle');
            if (notesStyle) out.notesStyle = { raw: notesStyle };
            return out;
        }

        function renderNotesMaster(nm) {
            const kids = [];
            if (nm.cSld && nm.cSld.raw) kids.push(nm.cSld.raw);
            else kids.push(xml.el('p:cSld', {}, [
                xml.el('p:spTree', {}, [
                    xml.el('p:nvGrpSpPr', {}, [
                        xml.el('p:cNvPr', { id: '1', name: '' }),
                        xml.el('p:cNvGrpSpPr', {}),
                        xml.el('p:nvPr', {})
                    ]),
                    xml.el('p:grpSpPr', {})
                ])
            ]));
            if (nm.clrMap) kids.push(xml.el('p:clrMap', nm.clrMap));
            if (nm.hf) kids.push(renderHf(nm.hf));
            if (nm.notesStyle && nm.notesStyle.raw) kids.push(nm.notesStyle.raw);
            else if (nm.notesStyle) kids.push(xml.el('p:notesStyle', {}));
            return xml.el('p:notesMaster', {
                'xmlns:a': 'http://schemas.openxmlformats.org/drawingml/2006/main',
                'xmlns:r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
                'xmlns:p': 'http://schemas.openxmlformats.org/presentationml/2006/main',
                ...(nm.attrs || {})
            }, kids);
        }

        // ----------------------------------------------------------------
        // <p:handoutMaster>
        // ----------------------------------------------------------------

        function parseHandoutMaster(el) {
            const out = { kind: 'handoutMaster', attrs: { ...el.attrs } };
            const cSld = xml.findChild(el, 'p:cSld');
            if (cSld) out.cSld = { raw: cSld };
            const clrMap = xml.findChild(el, 'p:clrMap');
            if (clrMap) out.clrMap = { ...clrMap.attrs };
            const hf = xml.findChild(el, 'p:hf');
            if (hf) out.hf = parseHf(hf);
            return out;
        }

        function renderHandoutMaster(hm) {
            const kids = [];
            if (hm.cSld && hm.cSld.raw) kids.push(hm.cSld.raw);
            else kids.push(xml.el('p:cSld', {}, [
                xml.el('p:spTree', {}, [
                    xml.el('p:nvGrpSpPr', {}, [
                        xml.el('p:cNvPr', { id: '1', name: '' }),
                        xml.el('p:cNvGrpSpPr', {}),
                        xml.el('p:nvPr', {})
                    ]),
                    xml.el('p:grpSpPr', {})
                ])
            ]));
            if (hm.clrMap) kids.push(xml.el('p:clrMap', hm.clrMap));
            if (hm.hf) kids.push(renderHf(hm.hf));
            return xml.el('p:handoutMaster', {
                'xmlns:a': 'http://schemas.openxmlformats.org/drawingml/2006/main',
                'xmlns:r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
                'xmlns:p': 'http://schemas.openxmlformats.org/presentationml/2006/main',
                ...(hm.attrs || {})
            }, kids);
        }

        // ----------------------------------------------------------------
        // <p:notesSz> — note pages dimensions (presentation root)
        // ----------------------------------------------------------------

        function parseNotesSz(el) {
            return { kind: 'notesSz', cx: el.attrs.cx, cy: el.attrs.cy };
        }
        function renderNotesSz(n) {
            return xml.el('p:notesSz', { cx: String(n.cx), cy: String(n.cy) });
        }

        // ----------------------------------------------------------------
        // View properties (live in viewProps.xml)
        // ----------------------------------------------------------------

        function parseViewPr(el) {
            // common shape (cViewPr inside) — we keep raw children for fidelity
            const out = { kind: el.name.replace(/^p:/, ''), attrs: { ...el.attrs },
                          children: (el.children || []).filter(c => c.type === 'element') };
            return out;
        }

        function parseNotesViewPr(el) {
            if (!el || el.name === 'p:notesViewPr') return parseViewPr(el);
            return parseViewPr(el);
        }
        function parseNotesTextViewPr(el) {
            if (!el || el.name === 'p:notesTextViewPr') return parseViewPr(el);
            return parseViewPr(el);
        }
        function parseOutlineViewPr(el) {
            if (!el || el.name === 'p:outlineViewPr') return parseViewPr(el);
            return parseViewPr(el);
        }
        function parseSlideSorterViewPr(el) {
            if (!el || el.name === 'p:slideSorterViewPr') return parseViewPr(el);
            if (el.name === 'p:sorterViewPr') return parseViewPr(el);
            return parseViewPr(el);
        }
        function parseSorterViewPr(el) {
            if (!el || el.name === 'p:sorterViewPr') return parseViewPr(el);
            return parseViewPr(el);
        }
        function renderSorterViewPr(v) {
            return xml.el('p:sorterViewPr', v.attrs || {}, v.children || []);
        }

        function renderNotesViewPr(v) {
            return xml.el('p:notesViewPr', v.attrs || {}, v.children || []);
        }
        function renderNotesTextViewPr(v) {
            return xml.el('p:notesTextViewPr', v.attrs || {}, v.children || []);
        }
        function renderOutlineViewPr(v) {
            return xml.el('p:outlineViewPr', v.attrs || {}, v.children || []);
        }
        function renderSlideSorterViewPr(v) {
            return xml.el('p:slideSorterViewPr', v.attrs || {}, v.children || []);
        }

        return {
            // notes parts
            parseNotes, renderNotes, parseNotesSlide, renderNotesSlide,
            buildEmptyNotesSlide,
            parseNotesMaster, renderNotesMaster,
            parseHandoutMaster, renderHandoutMaster,
            parseNotesSz, renderNotesSz,
            // view properties
            parseNotesViewPr, renderNotesViewPr,
            parseNotesTextViewPr, renderNotesTextViewPr,
            parseOutlineViewPr, renderOutlineViewPr,
            parseSlideSorterViewPr, renderSlideSorterViewPr,
            parseSorterViewPr, renderSorterViewPr,
            // helpers
            parseHf, renderHf, parseClrMapOvr, renderClrMapOvr
        };
    }
};
