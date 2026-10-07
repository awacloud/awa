// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Opt-in: typed settings.xml flags.
 *
 * Provides a typed bag for the ~50 toggle/val children of `<w:settings>`
 * plus typed sub-trees for complex children (`<w:rsids>`, `<w:compat>`,
 * `<w:hdrShapeDefaults>`, `<w:shapeDefaults>`, `<w:themeFontLang>`,
 * `<w:mailMerge>`, `<w:trackChanges>`, `<w:proofState>`, `<w:view>`,
 * `<w:zoom>`, `<w:writeProtection>`, `<w:documentProtection>`,
 * `<w:footnotePr>`, `<w:endnotePr>`, `<w:smartTagPr>`,
 * `<w:clrSchemeMapping>`, `<w:revisionView>`, `<w:attachedTemplate>`,
 * `<w:attachedSchema>`, `<w:stylePaneFormatFilter>`, `<w:stylePaneSortMethod>`,
 * `<w:characterSpacingControl>`, `<w:decimalSymbol>`, `<w:listSeparator>`,
 * `<w:defaultTableStyle>`, `<w:clickAndTypeStyle>`,
 * `<w:summaryLength>`, `<w:hyphenationZone>`, `<w:consecutiveHyphenLimit>`,
 * `<w:displayHorizontalDrawingGridEvery>` etc).
 *
 * @module ooxml/extra/wml-settings
 */

import { xml } from '@awacloud/fw/io/codec/xml.js';
import { docxProperties } from '../docx/properties.js';

export const wmlSettings = {
    name: 'wmlSettings',
    dependencies: ['xml', 'docxProperties'],
    deps: [xml, docxProperties],

    factory(xml, core) {
        // ---- Toggles (no w:val => true ; w:val="0|false|off" => false) ----
        const TOGGLES = [
            'autoHyphenation', 'doNotHyphenateCaps', 'autoFormatOverride',
            'bordersDoNotSurroundHeader', 'bordersDoNotSurroundFooter',
            'bookFoldPrintingSheets', 'bookFoldRevPrinting', 'bookFoldPrinting',
            'displayBackgroundShape', 'doNotDemarcateInvalidXml',
            'doNotDisplayPageBoundaries', 'doNotEmbedSmartTags',
            'doNotIncludeSubdocsInStats', 'doNotShadeFormData', 'doNotTrackFormatting',
            'doNotTrackMoves', 'doNotUseLongFileNames',
            'embedSystemFonts', 'embedTrueTypeFonts',
            'evenAndOddHeaders', 'forceUpgrade', 'formsDesign', 'gutterAtTop',
            'hideGrammaticalErrors', 'hideSpellingErrors', 'linkStyles',
            'mirrorMargins', 'noPunctuationKerning', 'printFormsData',
            'printFractionalCharacterWidth', 'printPostScriptOverText', 'printTwoOnOne',
            'removeDateAndTime', 'removePersonalInformation', 'saveFormsData',
            'saveInvalidXml', 'savePreviewPicture', 'saveSubsetFonts',
            'saveThroughXslt', 'showEnvelope', 'showXMLTags',
            'strictFirstAndLastChars', 'styleLockQFSet', 'styleLockTheme',
            'trackRevisions', 'updateFields', 'useFELayout',
            'useNormalStyleForList', 'useXSLTWhenSaving',
            'alignBordersAndEdges', 'allowPNG', 'alwaysMergeEmptyNamespace',
            'alwaysShowPlaceholderText', 'adjustLineHeightInTable',
            'applyBreakingRules', 'balanceSingleByteDoubleByteWidth',
            'optimizeForBrowser', 'readModeInkLockDown', 'rtlGutter',
            'saveSmartTagsAsXml', 'spaceForUL', 'ulTrailSpace',
            'noLineBreaksAfter', 'noLineBreaksBefore'
        ];
        const TOGGLE_SET = new Set(TOGGLES.map(n => 'w:' + n));

        // ---- Simple w:val-bearing scalar elements ----
        const VAL_ELEMENTS = [
            'decimalSymbol', 'listSeparator', 'characterSpacingControl',
            'defaultTableStyle', 'clickAndTypeStyle', 'summaryLength',
            'hyphenationZone', 'consecutiveHyphenLimit',
            'displayHorizontalDrawingGridEvery', 'displayVerticalDrawingGridEvery',
            'drawingGridHorizontalOrigin', 'drawingGridHorizontalSpacing',
            'drawingGridVerticalOrigin', 'drawingGridVerticalSpacing',
            'pixelsPerInch', 'targetScreenSz',
            'stylePaneFormatFilter', 'stylePaneSortMethod',
            'attachedTemplate'
        ];
        const VAL_SET = new Set(VAL_ELEMENTS.map(n => 'w:' + n));

        // ---- Complex children with attributes only ----
        // <w:rsids>: <w:rsidRoot w:val=".."/> + <w:rsid w:val=".."/>+
        function parseRsids(el) {
            const out = { rsids: [] };
            for (const c of el.children) {
                if (c.type !== 'element') continue;
                if (c.name === 'w:rsidRoot') out.rsidRoot = c.attrs['w:val'];
                else if (c.name === 'w:rsid') out.rsids.push(c.attrs['w:val']);
            }
            return out;
        }
        function renderRsids(r) {
            const kids = [];
            if (r.rsidRoot != null) kids.push(xml.el('w:rsidRoot', { 'w:val': String(r.rsidRoot) }));
            for (const v of (r.rsids || [])) kids.push(xml.el('w:rsid', { 'w:val': String(v) }));
            return xml.el('w:rsids', {}, kids);
        }

        // <w:compat>: list of <w:compatSetting w:name=".." w:uri=".." w:val=".."/>
        // plus a few legacy toggle children.
        function parseCompat(el) {
            const out = { settings: [] };
            for (const c of el.children) {
                if (c.type !== 'element') continue;
                if (c.name === 'w:compatSetting') {
                    out.settings.push({
                        name: c.attrs['w:name'],
                        uri: c.attrs['w:uri'],
                        val: c.attrs['w:val']
                    });
                } else {
                    (out._extras = out._extras || []).push(c);
                }
            }
            return out;
        }
        function renderCompat(c) {
            const kids = [];
            for (const s of (c.settings || [])) {
                const a = {};
                if (s.name != null) a['w:name'] = String(s.name);
                if (s.uri != null)  a['w:uri'] = String(s.uri);
                if (s.val != null)  a['w:val'] = String(s.val);
                kids.push(xml.el('w:compatSetting', a));
            }
            if (c._extras) for (const e of c._extras) kids.push(e);
            return xml.el('w:compat', {}, kids);
        }

        // <w:hdrShapeDefaults> / <w:shapeDefaults>: opaque VML-ish blob
        function parseShapeDefaults(el) {
            return { children: el.children.filter(c => c.type === 'element') };
        }
        function renderShapeDefaults(name, sd) {
            return xml.el(name, {}, sd.children || []);
        }

        // <w:themeFontLang>: attrs only (val, eastAsia, bidi)
        function parseThemeFontLang(el) {
            const a = el.attrs || {};
            const out = {};
            if (a['w:val']) out.val = a['w:val'];
            if (a['w:eastAsia']) out.eastAsia = a['w:eastAsia'];
            if (a['w:bidi']) out.bidi = a['w:bidi'];
            return out;
        }
        function renderThemeFontLang(t) {
            const a = {};
            if (t.val != null) a['w:val'] = t.val;
            if (t.eastAsia != null) a['w:eastAsia'] = t.eastAsia;
            if (t.bidi != null) a['w:bidi'] = t.bidi;
            return xml.el('w:themeFontLang', a);
        }

        // <w:mailMerge>: attrs + child elements
        function parseMailMerge(el) {
            return { attrs: { ...el.attrs }, children: el.children.filter(c => c.type === 'element') };
        }
        function renderMailMerge(m) {
            return xml.el('w:mailMerge', m.attrs || {}, m.children || []);
        }

        // <w:trackChanges>/<w:proofState>: attrs only
        function parseAttrsOnly(el) {
            const out = {};
            for (const [k, v] of Object.entries(el.attrs || {})) {
                out[k.replace(/^w:/, '')] = v;
            }
            return out;
        }
        function renderTrackChanges(t) {
            return xml.el('w:trackChanges', objAttrsOf(t));
        }
        function renderProofState(p) {
            return xml.el('w:proofState', objAttrsOf(p));
        }

        function objAttrsOf(o) {
            const out = {};
            for (const [k, v] of Object.entries(o || {})) {
                out[k.startsWith('w:') ? k : 'w:' + k] = String(v);
            }
            return out;
        }

        // <w:view> / <w:zoom>: w:val + extra attrs
        function renderView(v) {
            const a = typeof v === 'object' ? objAttrsOf(v) : { 'w:val': String(v) };
            return xml.el('w:view', a);
        }
        function renderZoom(z) {
            const a = typeof z === 'object' ? objAttrsOf(z) : { 'w:val': String(z) };
            return xml.el('w:zoom', a);
        }

        // <w:writeProtection>/<w:documentProtection>: attrs only
        function renderWriteProtection(p) {
            return xml.el('w:writeProtection', objAttrsOf(p));
        }
        function renderDocumentProtection(p) {
            return xml.el('w:documentProtection', objAttrsOf(p));
        }

        // <w:footnotePr>/<w:endnotePr>: children (numFmt, pos, ...). Keep raw.
        function parseNotePr(el) {
            return { children: el.children.filter(c => c.type === 'element') };
        }
        function renderFootnotePr(f) {
            return xml.el('w:footnotePr', {}, f.children || []);
        }
        function renderEndnotePr(e) {
            return xml.el('w:endnotePr', {}, e.children || []);
        }

        // <w:smartTagPr> / <w:revisionView> / <w:clrSchemeMapping>:
        //   attrs-only complex
        function renderSmartTagPr(s) {
            return xml.el('w:smartTagPr', {}, s.children || []);
        }
        function renderRevisionView(r) {
            return xml.el('w:revisionView', objAttrsOf(r));
        }
        function renderClrSchemeMapping(c) {
            return xml.el('w:clrSchemeMapping', objAttrsOf(c));
        }
        // <w:attachedSchema w:val=".."/> repeated
        function renderAttachedSchemas(arr) {
            return arr.map(v => xml.el('w:attachedSchema', { 'w:val': String(v) }));
        }

        // ---- hydrate / dehydrate against an _extras list ----
        function hydrate(root) {
            const extras = root._extras || (Array.isArray(root) ? root : []);
            const remaining = [];
            for (const c of extras) {
                if (c.type !== 'element') { remaining.push(c); continue; }
                const local = c.name.replace(/^w:/, '');

                if (TOGGLE_SET.has(c.name)) {
                    root[local] = core.readToggle(c);
                    continue;
                }
                if (VAL_SET.has(c.name)) {
                    root[local] = c.attrs['w:val'];
                    continue;
                }
                switch (c.name) {
                    case 'w:rsids':              root.rsids = parseRsids(c); continue;
                    case 'w:compat':             root.compat = parseCompat(c); continue;
                    case 'w:hdrShapeDefaults':   root.hdrShapeDefaults = parseShapeDefaults(c); continue;
                    case 'w:shapeDefaults':      root.shapeDefaults = parseShapeDefaults(c); continue;
                    case 'w:themeFontLang':      root.themeFontLang = parseThemeFontLang(c); continue;
                    case 'w:mailMerge':          root.mailMerge = parseMailMerge(c); continue;
                    case 'w:trackChanges':       root.trackChanges = parseAttrsOnly(c); continue;
                    case 'w:proofState':         root.proofState = parseAttrsOnly(c); continue;
                    case 'w:view':               root.view = parseAttrsOnly(c); continue;
                    case 'w:zoom':               root.zoom = parseAttrsOnly(c); continue;
                    case 'w:writeProtection':    root.writeProtection = parseAttrsOnly(c); continue;
                    case 'w:documentProtection': root.documentProtection = parseAttrsOnly(c); continue;
                    case 'w:footnotePr':         root.footnotePr = parseNotePr(c); continue;
                    case 'w:endnotePr':          root.endnotePr = parseNotePr(c); continue;
                    case 'w:smartTagPr':         root.smartTagPr = { children: c.children.filter(x => x.type === 'element') }; continue;
                    case 'w:revisionView':       root.revisionView = parseAttrsOnly(c); continue;
                    case 'w:clrSchemeMapping':   root.clrSchemeMapping = parseAttrsOnly(c); continue;
                    case 'w:attachedSchema':
                        (root.attachedSchemas = root.attachedSchemas || []).push(c.attrs['w:val']);
                        continue;
                    default:
                        remaining.push(c);
                }
            }
            if (remaining.length) root._extras = remaining; else delete root._extras;
            return root;
        }

        function dehydrate(root) {
            const out = { ...root };
            const extras = out._extras ? [...out._extras] : [];
            for (const t of TOGGLES) {
                if (out[t] !== undefined) {
                    const el = core.writeToggle('w:' + t, out[t]);
                    if (el) extras.push(el);
                    delete out[t];
                }
            }
            for (const v of VAL_ELEMENTS) {
                if (out[v] !== undefined) {
                    extras.push(xml.el('w:' + v, { 'w:val': String(out[v]) }));
                    delete out[v];
                }
            }
            if (out.rsids)              { extras.push(renderRsids(out.rsids));        delete out.rsids; }
            if (out.compat)             { extras.push(renderCompat(out.compat));      delete out.compat; }
            if (out.hdrShapeDefaults)   { extras.push(renderShapeDefaults('w:hdrShapeDefaults', out.hdrShapeDefaults)); delete out.hdrShapeDefaults; }
            if (out.shapeDefaults)      { extras.push(renderShapeDefaults('w:shapeDefaults', out.shapeDefaults));       delete out.shapeDefaults; }
            if (out.themeFontLang)      { extras.push(renderThemeFontLang(out.themeFontLang)); delete out.themeFontLang; }
            if (out.mailMerge)          { extras.push(renderMailMerge(out.mailMerge));         delete out.mailMerge; }
            if (out.trackChanges)       { extras.push(renderTrackChanges(out.trackChanges));   delete out.trackChanges; }
            if (out.proofState)         { extras.push(renderProofState(out.proofState));       delete out.proofState; }
            if (out.view !== undefined) { extras.push(renderView(out.view));                   delete out.view; }
            if (out.zoom !== undefined) { extras.push(renderZoom(out.zoom));                   delete out.zoom; }
            if (out.writeProtection)    { extras.push(renderWriteProtection(out.writeProtection));   delete out.writeProtection; }
            if (out.documentProtection) { extras.push(renderDocumentProtection(out.documentProtection)); delete out.documentProtection; }
            if (out.footnotePr)         { extras.push(renderFootnotePr(out.footnotePr));       delete out.footnotePr; }
            if (out.endnotePr)          { extras.push(renderEndnotePr(out.endnotePr));         delete out.endnotePr; }
            if (out.smartTagPr)         { extras.push(renderSmartTagPr(out.smartTagPr));       delete out.smartTagPr; }
            if (out.revisionView)       { extras.push(renderRevisionView(out.revisionView));   delete out.revisionView; }
            if (out.clrSchemeMapping)   { extras.push(renderClrSchemeMapping(out.clrSchemeMapping)); delete out.clrSchemeMapping; }
            if (out.attachedSchemas)    { for (const e of renderAttachedSchemas(out.attachedSchemas)) extras.push(e); delete out.attachedSchemas; }

            if (extras.length) out._extras = extras;
            return out;
        }

        return {
            hydrate, dehydrate,
            // Hook aliases for the docx `.use(...)` walker.
            hydrateSettings: hydrate,
            dehydrateSettings: dehydrate,
            TOGGLES, VAL_ELEMENTS,
            parseRsids, renderRsids,
            parseCompat, renderCompat,
            parseThemeFontLang, renderThemeFontLang,
            parseMailMerge, renderMailMerge
        };
    }
};
