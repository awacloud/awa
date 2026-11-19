// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Opt-in: the pptx parts the core's read leaves unmodelled —
 * the slide layouts no slide uses, the notes slides, the notes master and
 * the handout master (with their themes). A pptx walker extension
 * registered by `pptxFullBundle`, through the package hook pair:
 *
 * - `hydratePackage(presentation, ctx)` runs inside `pptx.read`'s pass,
 *   before the other hooks. Each part is read only when it is written back
 *   as read (its re-rendered root `sameElement` to its source after
 *   markup-compatibility processing, namespace declarations aside), carries
 *   no `r:` reference and has relationships the write rebuilds (a slide, a
 *   slide master, a notes master, a theme). A part read is consumed: it
 *   leaves `unmodelledParts`.
 *   - Unused layouts: when the presentation has one slide master and every
 *     layout its `sldLayoutIdLst` names passes, `slideLayouts` follows that
 *     list, each slide's `layoutRef` remapped, and the master's `layoutIds`
 *     name the relationships the write gives them (`rId1`…). Otherwise the
 *     layouts are left as the core read them.
 *   - A notes slide becomes its slide's `notes`; the notes and handout
 *     masters `notesMaster` / `handoutMaster`, each with its `theme`.
 * - `dehydratePackage(presentation, ctx)` runs in `pptx.write` after the
 *   core has built its package: it writes the notes slides, the notes and
 *   handout masters and their themes, their relationships, a slide's
 *   relationship to its notes, the presentation's `p:notesMasterIdLst` /
 *   `p:handoutMasterIdLst` and the content types. Slides with `notes` and
 *   no `notesMaster` get a minimal notes master on the main theme.
 *
 * @module ooxml/extra/pml-package-parts
 */

import { xml } from '@awacloud/fw/io/codec/xml.js';
import { opcPackage } from '../opc/package.js';
import { opcRelationships } from '../opc/relationships.js';
import { markupCompatibility } from '../mc/markupCompatibility.js';
import { docxProperties } from '../docx/properties.js';
import { pptxSlide } from '../pptx/slide.js';
import { pptxTheme } from '../pptx/theme.js';
import { ooxmlShared } from '../_shared/index.js';

export const pmlPackageParts = {
    name: 'pmlPackageParts',
    dependencies: ['xml', 'opcPackage', 'opcRelationships', 'markupCompatibility',
                   'docxProperties', 'pptxSlide', 'pptxTheme', 'ooxmlShared'],
    deps: [xml, opcPackage, opcRelationships, markupCompatibility, docxProperties,
           pptxSlide, pptxTheme, ooxmlShared],

    factory(xml, opc, relsMod, mc, props, slideMod, themeMod, shared) {
        const { REL_TYPE, CT, decodeText, encodeText } = shared;
        const isPlain = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

        // --- The guard ---

        const noNs = (el) => ({ ...el, attrs: Object.fromEntries(Object.entries(el.attrs || {})
            .filter(([k]) => k !== 'xmlns' && !k.startsWith('xmlns:') && k !== 'mc:Ignorable')) });
        const same = (a, b) => props.sameElement(noNs(a), noNs(b));
        function rootOf(parts, name) {
            const bytes = parts[name];
            if (!bytes) return null;
            try { return mc.process(xml.parse(decodeText(bytes))); } catch { return null; }
        }
        function hasRRef(node) {
            if (!node || node.type !== 'element') return false;
            for (const k of Object.keys(node.attrs || {})) if (k.startsWith('r:')) return true;
            return (node.children || []).some(hasRRef);
        }
        // `parse(root)` written back by `render(model)` as read, or null.
        function readBack(root, parse, render) {
            if (!root || hasRRef(root)) return null;
            let model;
            try { model = parse(root); } catch { return null; }
            return same(xml.parse(render(model)), root) ? model : null;
        }
        // Every relationship of `part` is one of `types`, each target (when
        // given) the one expected.
        function relsAre(rels, part, expect) {
            for (const r of rels[part] || []) {
                if (r.TargetMode === 'External' || !(r.Type in expect)) return false;
                const want = expect[r.Type];
                if (want && relsMod.resolveTarget(part, r.Target) !== want) return false;
            }
            return true;
        }
        function themeOf(parts, rels, part) {
            const list = rels[part] || [];
            const themeRels = list.filter(r => r.Type === REL_TYPE.THEME);
            if (themeRels.length !== 1 || list.length !== 1) return null;
            const tp = relsMod.resolveTarget(part, themeRels[0].Target);
            const root = rootOf(parts, tp);
            if (!root) return null;
            let model;
            try { model = themeMod.parse(parts[tp]); } catch { return null; }
            return same(xml.parse(themeMod.serialize(model)), root) ? { model, part: tp } : null;
        }

        // --- Read ---

        function readLayouts(pres, ctx) {
            const { parts, rels, masterParts, layoutParts, textOpts } = ctx;
            const masters = pres.slideMasters;
            if (!Array.isArray(masters) || masters.length !== 1 || masterParts.length !== 1) return;
            const master = masters[0], masterPart = masterParts[0];
            const ids = Array.isArray(master.layoutIds) ? master.layoutIds : [];
            const mRels = rels[masterPart] || [];
            const entries = ids.map(li => {
                const r = mRels.find(x => x.Id === li.rId);
                return r && r.Type === REL_TYPE.SLIDE_LAYOUT ? relsMod.resolveTarget(masterPart, r.Target) : null;
            });
            if (!entries.length || entries.some(e => !e || !parts[e]) || new Set(entries).size !== entries.length) return;
            const used = layoutParts;
            if (used.some(u => !entries.includes(u))) return;
            const read = new Map();
            for (const e of entries) {
                if (used.includes(e)) continue;
                if (!relsAre(rels, e, { [REL_TYPE.SLIDE_MASTER]: masterPart })) return;
                const root = rootOf(parts, e);
                if (!root || root.name !== 'p:sldLayout') return;
                const model = readBack(root, r => slideMod.parseSlideLayout(r, textOpts), slideMod.serializeSlideLayout);
                if (!model) return;
                read.set(e, model);
            }
            const old = pres.slideLayouts || [];
            pres.slideLayouts = entries.map(e => (read.has(e) ? read.get(e) : old[used.indexOf(e)]));
            for (const s of pres.slides || []) {
                if (s && Number.isInteger(s.layoutRef) && used[s.layoutRef]) s.layoutRef = entries.indexOf(used[s.layoutRef]);
            }
            master.layoutIds = ids.map((li, j) => ({ id: li.id, rId: `rId${j + 1}` }));
            for (const e of read.keys()) ctx.consume(e);
        }

        function masterEntryPart(ctx, listName, itemName) {
            const lst = xml.findChild(ctx.presRoot, listName);
            const item = lst && xml.findChild(lst, itemName);
            const rel = item && (ctx.presRels || []).find(r => r.Id === item.attrs['r:id']);
            return rel ? relsMod.resolveTarget(ctx.presPart, rel.Target) : null;
        }

        // A notes or handout master with its own theme, or null.
        function readMaster(ctx, part, rootName, parse, serialize) {
            if (!part) return null;
            const root = rootOf(ctx.parts, part);
            if (!root || root.name !== rootName) return null;
            const theme = themeOf(ctx.parts, ctx.rels, part);
            if (!theme) return null;
            const model = readBack(root, r => parse(r, ctx.textOpts), serialize);
            if (!model) return null;
            model.theme = theme.model;
            ctx.consume(part);
            ctx.consume(theme.part);
            return model;
        }

        function hydratePackage(pres, ctx) {
            if (!isPlain(pres) || !ctx) return pres;
            readLayouts(pres, ctx);
            const nmPart = masterEntryPart(ctx, 'p:notesMasterIdLst', 'p:notesMasterId');
            const nm = readMaster(ctx, nmPart, 'p:notesMaster', slideMod.parseNotesMaster, slideMod.serializeNotesMaster);
            if (nm) pres.notesMaster = nm;
            const hmPart = masterEntryPart(ctx, 'p:handoutMasterIdLst', 'p:handoutMasterId');
            const hm = readMaster(ctx, hmPart, 'p:handoutMaster', slideMod.parseHandoutMaster, slideMod.serializeHandoutMaster);
            if (hm) pres.handoutMaster = hm;
            (pres.slides || []).forEach((slide, k) => {
                const slidePart = ctx.slideParts[k];
                if (!isPlain(slide) || !slidePart) return;
                const rel = (ctx.rels[slidePart] || []).find(r => r.Type === REL_TYPE.NOTES_SLIDE);
                if (!rel) return;
                const np = relsMod.resolveTarget(slidePart, rel.Target);
                const expect = { [REL_TYPE.SLIDE]: slidePart, [REL_TYPE.NOTES_MASTER]: null };
                if (!relsAre(ctx.rels, np, expect)) return;
                const root = rootOf(ctx.parts, np);
                if (!root || root.name !== 'p:notes') return;
                const model = readBack(root, r => slideMod.parseNotesSlide(r, ctx.textOpts), slideMod.serializeNotesSlide);
                if (!model) return;
                slide.notes = model;
                ctx.consume(np);
            });
            return pres;
        }

        // --- Write ---

        const CLR_MAP = {
            bg1: 'lt1', tx1: 'dk1', bg2: 'lt2', tx2: 'dk2',
            accent1: 'accent1', accent2: 'accent2', accent3: 'accent3',
            accent4: 'accent4', accent5: 'accent5', accent6: 'accent6',
            hlink: 'hlink', folHlink: 'folHlink'
        };
        function minimalNotesMaster() {
            return { type: 'notesMaster', shapes: [], clrMap: xml.el('p:clrMap', { ...CLR_MAP }) };
        }
        // The first `rId<n>` no relationship of `list` uses.
        function freeRid(list) {
            const used = new Set((list || []).map(r => r.Id));
            let n = list ? list.length + 1 : 1;
            while (used.has(`rId${n}`)) n++;
            return `rId${n}`;
        }

        function dehydratePackage(pres, ctx) {
            if (!isPlain(pres) || !ctx || !ctx.package) return pres;
            const pkg = ctx.package;
            const slides = Array.isArray(pres.slides) ? pres.slides : [];
            const withNotes = [];
            slides.forEach((s, k) => { if (isPlain(s) && isPlain(s.notes)) withNotes.push(k); });
            let nm = isPlain(pres.notesMaster) ? pres.notesMaster : null;
            const hm = isPlain(pres.handoutMaster) ? pres.handoutMaster : null;
            if (withNotes.length && !nm) nm = minimalNotesMaster();
            if (!nm && !hm) return pres;

            let themeN = 1;
            while (pkg.parts[`/ppt/theme/theme${themeN}.xml`]) themeN++;
            function themeTarget(model) {
                if (!isPlain(model.theme)) return '../theme/' + ctx.themePart.split('/').pop();
                const name = `theme${themeN++}.xml`;
                opc.setPart(pkg, '/ppt/theme/' + name, themeMod.bytesOf(model.theme), CT.THEME);
                return '../theme/' + name;
            }
            const presRoot = xml.parse(decodeText(pkg.parts[ctx.presPart]));
            const lists = [];
            const presRels = (pkg.rels[ctx.presPart] || []).slice();
            if (nm) {
                const path = '/ppt/notesMasters/notesMaster1.xml';
                opc.setPart(pkg, path, encodeText(slideMod.serializeNotesMaster(nm)), CT.NOTES_MASTER);
                opc.setRels(pkg, path, [{ Id: 'rId1', Type: REL_TYPE.THEME, Target: themeTarget(nm) }]);
                presRels.push({ Id: 'rIdNotesMaster1', Type: REL_TYPE.NOTES_MASTER, Target: 'notesMasters/notesMaster1.xml' });
                lists.push(xml.el('p:notesMasterIdLst', {}, [xml.el('p:notesMasterId', { 'r:id': 'rIdNotesMaster1' })]));
            }
            if (hm) {
                const path = '/ppt/handoutMasters/handoutMaster1.xml';
                opc.setPart(pkg, path, encodeText(slideMod.serializeHandoutMaster(hm)), CT.HANDOUT_MASTER);
                opc.setRels(pkg, path, [{ Id: 'rId1', Type: REL_TYPE.THEME, Target: themeTarget(hm) }]);
                presRels.push({ Id: 'rIdHandoutMaster1', Type: REL_TYPE.HANDOUT_MASTER, Target: 'handoutMasters/handoutMaster1.xml' });
                lists.push(xml.el('p:handoutMasterIdLst', {}, [xml.el('p:handoutMasterId', { 'r:id': 'rIdHandoutMaster1' })]));
            }
            for (const k of withNotes) {
                const slidePart = ctx.slideParts[k];
                const path = `/ppt/notesSlides/notesSlide${k + 1}.xml`;
                opc.setPart(pkg, path, encodeText(slideMod.serializeNotesSlide(slides[k].notes)), CT.NOTES_SLIDE);
                opc.setRels(pkg, path, [
                    { Id: 'rId1', Type: REL_TYPE.NOTES_MASTER, Target: '../notesMasters/notesMaster1.xml' },
                    { Id: 'rId2', Type: REL_TYPE.SLIDE, Target: '../slides/' + slidePart.split('/').pop() }
                ]);
                const sRels = (pkg.rels[slidePart] || []).slice();
                sRels.push({ Id: freeRid(sRels), Type: REL_TYPE.NOTES_SLIDE, Target: `../notesSlides/notesSlide${k + 1}.xml` });
                opc.setRels(pkg, slidePart, sRels);
            }
            // CT_Presentation: sldMasterIdLst, notesMasterIdLst, handoutMasterIdLst, sldIdLst …
            const kids = presRoot.children.slice();
            const at = kids.findIndex(c => c && c.type === 'element' && c.name === 'p:sldMasterIdLst');
            kids.splice(at + 1, 0, ...lists);
            presRoot.children = kids;
            opc.setPart(pkg, ctx.presPart, encodeText(xml.serialize(presRoot)), CT.PRESENTATION);
            opc.setRels(pkg, ctx.presPart, presRels);
            return pres;
        }

        return { hydratePackage, dehydratePackage };
    }
};
