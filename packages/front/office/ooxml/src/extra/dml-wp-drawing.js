// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Opt-in: a docx drawing's edits written into its kept source.
 *
 * `docx.read` keeps each drawing's `<w:drawing>` element (`_source`) and its
 * typed fields as read (`_read`); the write emits the source while the
 * fields are unchanged and rebuilds the drawing from them once one is
 * edited, losing what they do not hold (a picture's locks, blip state,
 * extension list, line and fill, `cNvPr` text, a shape's style …). Under
 * this extension `dehydrateDrawing` writes an edit into a copy of the
 * source instead: each edited core field is set in place and the copy
 * becomes the source (`docxDrawing.keepSource`), so everything else stays.
 *
 * A drawing whose structure changed — its mode or kind, an edited field
 * with no place in the source, a field this module does not know — is left
 * to the core, which rebuilds it as before.
 *
 * `hydrateDrawing` gives a picture drawing a typed `picture` field (alt
 * text, hyperlink, locks, blip state and colour effects, blip fill,
 * black-and-white mode, transform, adjust guides, fill, line, effect list;
 * `readPicture`); `dehydrateDrawing` removes it and writes its edits into
 * the source copy with the core fields' (`writePicture`). A shape drawing
 * gets a typed `shape` the same way (flags and locks, shape properties,
 * style references, body properties, the text box's blocks through
 * `docxStructure`; `readShape` / `writeShape`), a group or canvas its
 * `group` / `canvas` (its properties and typed children), every drawing its
 * `frame` (Word's ids, effect extent, frame locks, `wp:docPr`'s hidden flag,
 * hyperlink and decorative flag) and an anchor its `layout` (position, wrap,
 * relative size). The codecs are lossless: an element they do not type
 * rides along verbatim, a number written with its unit stays that string.
 *
 * @module ooxml/extra/dml-wp-drawing
 */
import { xml } from '@awacloud/fw/io/codec/xml.js';
import { ooxmlShared } from '../_shared/index.js';
import { docxDrawing } from '../docx/drawing.js';
import { drawingmlShape } from '../drawingml/shape.js';
import { docxStructure } from '../docx/structure.js';

export const dmlWpDrawing = {
    name: 'dmlWpDrawing',
    dependencies: ['xml', 'ooxmlShared', 'docxDrawing', 'drawingmlShape', 'docxStructure'],
    deps: [xml, ooxmlShared, docxDrawing, drawingmlShape, docxStructure],

    factory(xml, shared, drawingMod, shapeMod, structureMod) {
        const { typedFields, keepSource } = drawingMod;
        // CT_Anchor order (ECMA-376 Part 1 § 20.4.2.3), as `docxDrawing`
        // writes it.
        const ANCHOR_SEQ = shared.sequence([
            'wp:simplePos', 'wp:positionH', 'wp:positionV', 'wp:extent', 'wp:effectExtent',
            ['wp:wrapNone', 'wp:wrapSquare', 'wp:wrapTight', 'wp:wrapThrough', 'wp:wrapTopAndBottom'],
            'wp:docPr', 'wp:cNvGraphicFramePr', 'a:graphic', 'wp14:sizeRelH', 'wp14:sizeRelV'
        ]);
        // The anchor children `anchorChildren` does not hold.
        const FRAME = new Set(['wp:extent', 'wp:effectExtent', 'wp:docPr', 'wp:cNvGraphicFramePr', 'a:graphic']);
        const DIST = ['distT', 'distB', 'distL', 'distR'];

        // Structural equality of two plain model values (`Object.is` on the
        // leaves), as `docxDrawing` compares a drawing with `_read`.
        function same(a, b) {
            if (Object.is(a, b)) return true;
            if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
            if (Array.isArray(a) !== Array.isArray(b)) return false;
            const ka = Object.keys(a), kb = Object.keys(b);
            if (ka.length !== kb.length) return false;
            for (const k of ka) {
                if (!Object.prototype.hasOwnProperty.call(b, k) || !same(a[k], b[k])) return false;
            }
            return true;
        }

        // The elements of a `<w:drawing>` copy the setters write into.
        function partsOf(el) {
            const wrapper = xml.findChild(el, 'wp:inline') || xml.findChild(el, 'wp:anchor');
            const graphic = wrapper && xml.findChild(wrapper, 'a:graphic');
            const gd = graphic && xml.findChild(graphic, 'a:graphicData');
            const pic = gd && xml.findChild(gd, 'pic:pic');
            const nvPicPr = pic && xml.findChild(pic, 'pic:nvPicPr');
            const blipFill = pic && xml.findChild(pic, 'pic:blipFill');
            const picSpPr = pic && xml.findChild(pic, 'pic:spPr');
            const xfrm = picSpPr && xml.findChild(picSpPr, 'a:xfrm');
            return {
                wrapper, graphic, gd, pic, blipFill, picSpPr, xfrm,
                anchor: wrapper && wrapper.name === 'wp:anchor' ? wrapper : null,
                extent: wrapper && xml.findChild(wrapper, 'wp:extent'),
                docPr: wrapper && xml.findChild(wrapper, 'wp:docPr'),
                cNvPr: nvPicPr && xml.findChild(nvPicPr, 'pic:cNvPr'),
                blip: blipFill && xml.findChild(blipFill, 'a:blip'),
                wsp: gd && xml.findChild(gd, 'wps:wsp'),
                wgp: gd && xml.findChild(gd, 'wpg:wgp'),
                wpc: gd && xml.findChild(gd, 'wpc:wpc')
            };
        }

        // An attribute set to a value, or removed with the field.
        function setAttr(node, name, value) {
            if (value == null) delete node.attrs[name];
            else node.attrs[name] = String(value);
        }

        // `children` with `node`'s child named `name` replaced by
        // `replacement` (removed when null), or `replacement` inserted at
        // `at` when there is none. False when there is nothing to replace
        // and nowhere to insert.
        function replaceChild(node, name, replacement, at) {
            const i = node.children.findIndex(c => c.type === 'element' && c.name === name);
            if (i >= 0) {
                if (replacement) node.children[i] = replacement; else node.children.splice(i, 1);
                return true;
            }
            if (!replacement) return true;
            if (at == null || at < 0) return false;
            node.children.splice(at, 0, replacement);
            return true;
        }

        // Each core field's setter: writes the drawing's value into the
        // source copy's parts `p`; false when the field has no place there.
        const SETTERS = {
            cx: (p, d) => setExtent(p, 'cx', d.cx),
            cy: (p, d) => setExtent(p, 'cy', d.cy),
            docName: (p, d) => {
                if (!p.docPr || typeof d.docName !== 'string') return false;
                p.docPr.attrs.name = d.docName;
            },
            description: (p, d) => p.docPr ? setAttr(p.docPr, 'descr', d.description || null) : false,
            title: (p, d) => p.docPr ? setAttr(p.docPr, 'title', d.title || null) : false,
            anchorAttrs: (p, d) => {
                if (!p.anchor) return false;
                const next = d.anchorAttrs || {};
                const attrs = {};
                for (const [k, v] of Object.entries(p.anchor.attrs)) {
                    if (DIST.includes(k)) attrs[k] = v;
                    else if (next[k] != null) attrs[k] = String(next[k]);
                }
                for (const [k, v] of Object.entries(next)) if (!(k in attrs) && v != null) attrs[k] = String(v);
                p.anchor.attrs = attrs;
            },
            anchorChildren: (p, d) => {
                if (!p.anchor) return false;
                const kept = p.anchor.children.filter(c => c.type !== 'element' || FRAME.has(c.name));
                p.anchor.children = shared.orderBySequence([...kept, ...(d.anchorChildren || [])], ANCHOR_SEQ);
            },
            picName: (p, d) => {
                if (!p.cNvPr || typeof d.picName !== 'string') return false;
                p.cNvPr.attrs.name = d.picName;
            },
            picId: (p, d) => {
                if (!p.cNvPr || d.picId == null) return false;
                p.cNvPr.attrs.id = String(d.picId);
            },
            linkRef: (p, d) => p.blip ? setAttr(p.blip, 'r:link', d.linkRef || null) : false,
            srcRect: (p, d) => {
                if (!p.blipFill) return false;
                const rect = d.srcRect ? xml.el('a:srcRect', shared.srcRectAttrs(d.srcRect)) : null;
                const blipAt = p.blipFill.children.findIndex(c => c.type === 'element' && c.name === 'a:blip');
                return replaceChild(p.blipFill, 'a:srcRect', rect, blipAt + 1);
            },
            prstGeom: (p, d) => {
                const prst = p.picSpPr && xml.findChild(p.picSpPr, 'a:prstGeom');
                if (!prst || !d.prstGeom) return false;
                prst.attrs.prst = d.prstGeom;
            },
            offsetX: (p, d) => setOffset(p, 'x', d.offsetX),
            offsetY: (p, d) => setOffset(p, 'y', d.offsetY),
            shapeProps: (p, d) => {
                const spPr = p.wsp && xml.findChild(p.wsp, 'wps:spPr');
                if (!spPr || !d.shapeProps) return false;
                const next = shapeMod.renderShapeProperties(d.shapeProps, 'wps:spPr');
                next.attrs = Object.assign({}, spPr.attrs, next.attrs);
                return replaceChild(p.wsp, 'wps:spPr', next);
            },
            _wpsTxbx: (p, d) => {
                if (!p.wsp) return false;
                const bodyAt = p.wsp.children.findIndex(c => c.type === 'element' && c.name === 'wps:bodyPr');
                return replaceChild(p.wsp, 'wps:txbx', d._wpsTxbx || null, bodyAt);
            },
            _wpsBodyPr: (p, d) => (p.wsp && d._wpsBodyPr ? replaceChild(p.wsp, 'wps:bodyPr', d._wpsBodyPr) : false),
            _gdRaw: (p, d) => (p.graphic && p.gd && d._gdRaw ? replaceChild(p.graphic, 'a:graphicData', d._gdRaw) : false)
        };
        for (const k of DIST) {
            SETTERS[k] = (p, d) => (p.wrapper ? setAttr(p.wrapper, k, d[k]) : false);
        }

        // `wp:extent`, and the picture's own `a:xfrm` extent where it has one.
        function setExtent(p, attr, value) {
            if (!p.extent || value == null) return false;
            p.extent.attrs[attr] = String(value);
            const ext = p.xfrm && xml.findChild(p.xfrm, 'a:ext');
            if (ext) ext.attrs[attr] = String(value);
        }

        function setOffset(p, attr, value) {
            const off = p.xfrm && xml.findChild(p.xfrm, 'a:off');
            if (!off) return false;
            off.attrs[attr] = String(value || 0);
        }

        // --- The typed picture ---

        const A14_NS = 'http://schemas.microsoft.com/office/drawing/2010/main';
        const ADEC_NS = 'http://schemas.microsoft.com/office/drawing/2017/decorative';
        const LOCAL_DPI_URI = '{28A0092B-C50C-407E-A947-70E740481C1C}';
        const DECORATIVE_URI = '{C183D7F6-B498-43B3-948B-1728B52AA6E4}';
        const COLORS = new Set(['a:srgbClr', 'a:schemeClr', 'a:prstClr', 'a:hslClr', 'a:scrgbClr', 'a:sysClr']);
        const FILLS = ['a:noFill', 'a:solidFill', 'a:gradFill', 'a:blipFill', 'a:pattFill', 'a:grpFill'];
        const LINE_FILLS = ['a:noFill', 'a:solidFill', 'a:gradFill', 'a:pattFill'];
        const JOINS = ['a:round', 'a:bevel', 'a:miter'];
        // Schema order of the children the writers insert (ECMA-376 Part 1
        // CT_NonVisualDrawingProps, CT_NonVisualPictureProperties,
        // CT_BlipFillProperties, CT_ShapeProperties, CT_LineProperties).
        const rankOf = (names) => new Map(names.flatMap((n, i) => (Array.isArray(n) ? n : [n]).map(x => [x, i])));
        const CNVPR_ORDER = rankOf(['a:hlinkClick', 'a:hlinkHover', 'a:extLst']);
        const CNVPICPR_ORDER = rankOf(['a:picLocks', 'a:extLst']);
        const BLIPFILL_ORDER = rankOf(['a:blip', 'a:srcRect', ['a:tile', 'a:stretch']]);
        const SPPR_ORDER = rankOf(['a:xfrm', ['a:custGeom', 'a:prstGeom'], FILLS, 'a:ln',
            ['a:effectLst', 'a:effectDag'], 'a:scene3d', 'a:sp3d', 'a:extLst']);
        const LN_ORDER = rankOf([LINE_FILLS, ['a:prstDash', 'a:custDash'], JOINS, 'a:headEnd', 'a:tailEnd', 'a:extLst']);
        const BLIP_ORDER = rankOf(['a:extLst']);

        const elements = (el) => (el && el.children || []).filter(c => c.type === 'element');
        const local = (name) => name.slice(name.indexOf(':') + 1);
        const flag = (v) => (v == null ? undefined : v === '1' || v === 'true');
        // A number, or the value as written when it is none (a strict
        // document's `10cm`, `40%`).
        const num = (v) => (v == null || v === '' ? undefined : Number.isFinite(Number(v)) ? Number(v) : v);
        // Assign `value` to `out[key]` unless undefined, so a field is
        // present only when the source holds it.
        const put = (out, key, value) => { if (value !== undefined) out[key] = value; };

        // `node` inserted among `parent`'s children before the first one
        // ranked after it (`order`), else last.
        function insertOrdered(parent, node, order) {
            const r = order.get(node.name);
            const kids = parent.children || (parent.children = []);
            let at = kids.length;
            if (r != null) {
                const i = kids.findIndex(c => c.type === 'element' && order.has(c.name) && order.get(c.name) > r);
                if (i >= 0) at = i;
            }
            kids.splice(at, 0, node);
        }

        // `parent`'s child named one of `names` replaced by `node`, removed
        // (null), or `node` inserted at its place when there is none.
        function putChild(parent, names, node, order) {
            const group = Array.isArray(names) ? names : [names];
            const kids = parent.children || (parent.children = []);
            const i = kids.findIndex(c => c.type === 'element' && group.includes(c.name));
            if (i >= 0) {
                if (node) kids[i] = node; else kids.splice(i, 1);
            } else if (node) insertOrdered(parent, node, order);
        }

        // Attributes `attrs` (value null = removed) set on `node` in its own
        // order, new ones after.
        function patchAttrs(node, attrs) {
            const out = {};
            for (const [k, v] of Object.entries(node.attrs)) {
                if (!(k in attrs)) out[k] = v;
                else if (attrs[k] != null) out[k] = attrs[k];
            }
            for (const [k, v] of Object.entries(attrs)) if (!(k in out) && v != null && !(k in node.attrs)) out[k] = v;
            node.attrs = out;
        }

        // A boolean attribute's value: the source's spelling while it still
        // says the same, else '1' / '0'.
        const flagValue = (old, value) => (value == null ? null : flag(old) === value ? old : value ? '1' : '0');

        // --- Colours, fills, line, effects: lossless codecs ---

        // `{ kind, attrs, mods }`: every transform child kept, in order.
        function readColor(el) {
            return {
                kind: local(el.name), attrs: { ...el.attrs },
                mods: elements(el).map(m => ({ kind: local(m.name), attrs: { ...m.attrs } }))
            };
        }
        function renderColor(c) {
            return xml.el('a:' + c.kind, { ...(c.attrs || {}) }, (c.mods || []).map(m => xml.el('a:' + m.kind, { ...(m.attrs || {}) })));
        }
        const firstColor = (el) => { const c = elements(el).find(k => COLORS.has(k.name)); return c ? readColor(c) : undefined; };

        function readFill(el) {
            switch (el.name) {
                case 'a:noFill': return 'none';
                case 'a:grpFill': return 'group';
                case 'a:solidFill': return { solid: firstColor(el) || null };
                case 'a:gradFill': {
                    const g = { attrs: { ...el.attrs }, stops: [] };
                    for (const c of elements(el)) {
                        if (c.name === 'a:gsLst') {
                            for (const gs of elements(c)) g.stops.push({ pos: num(gs.attrs.pos), color: firstColor(gs) || null });
                        } else if (c.name === 'a:lin') g.lin = { ...c.attrs };
                        else if (c.name === 'a:path') {
                            g.path = { attrs: { ...c.attrs } };
                            const ftr = xml.findChild(c, 'a:fillToRect');
                            if (ftr) g.path.fillToRect = { ...ftr.attrs };
                        } else if (c.name === 'a:tileRect') g.tileRect = { ...c.attrs };
                        else (g._extras || (g._extras = [])).push(c);
                    }
                    return { gradient: g };
                }
                case 'a:pattFill': {
                    const p = { attrs: { ...el.attrs } };
                    const fg = xml.findChild(el, 'a:fgClr'), bg = xml.findChild(el, 'a:bgClr');
                    if (fg) p.fg = firstColor(fg) || null;
                    if (bg) p.bg = firstColor(bg) || null;
                    return { pattern: p };
                }
                default: return { node: el };
            }
        }
        function renderFill(f) {
            if (f === 'none') return xml.el('a:noFill', {});
            if (f === 'group') return xml.el('a:grpFill', {});
            if (f.node) return f.node;
            if ('solid' in f) return xml.el('a:solidFill', {}, f.solid ? [renderColor(f.solid)] : []);
            if (f.gradient) {
                const g = f.gradient, kids = [];
                kids.push(xml.el('a:gsLst', {}, (g.stops || []).map(s =>
                    xml.el('a:gs', { pos: String(s.pos) }, s.color ? [renderColor(s.color)] : []))));
                if (g.lin) kids.push(xml.el('a:lin', { ...g.lin }));
                if (g.path) kids.push(xml.el('a:path', { ...(g.path.attrs || {}) }, g.path.fillToRect ? [xml.el('a:fillToRect', { ...g.path.fillToRect })] : []));
                if (g.tileRect) kids.push(xml.el('a:tileRect', { ...g.tileRect }));
                return xml.el('a:gradFill', { ...(g.attrs || {}) }, [...kids, ...(g._extras || [])]);
            }
            if (f.pattern) {
                const p = f.pattern, kids = [];
                if (p.fg !== undefined) kids.push(xml.el('a:fgClr', {}, p.fg ? [renderColor(p.fg)] : []));
                if (p.bg !== undefined) kids.push(xml.el('a:bgClr', {}, p.bg ? [renderColor(p.bg)] : []));
                return xml.el('a:pattFill', { ...(p.attrs || {}) }, kids);
            }
            return null;
        }

        const LINE_ATTRS = { w: 'width', cap: 'cap', cmpd: 'compound', algn: 'align' };
        function readLine(el) {
            const out = {};
            for (const [k, v] of Object.entries(el.attrs)) {
                if (k === 'w') put(out, 'width', num(v));
                else if (k in LINE_ATTRS) out[LINE_ATTRS[k]] = v;
                else if (!k.startsWith('xmlns')) (out.extraAttrs || (out.extraAttrs = {}))[k] = v;
            }
            for (const c of elements(el)) {
                if (LINE_FILLS.includes(c.name)) out.fill = readFill(c);
                else if (c.name === 'a:prstDash') out.dash = c.attrs.val;
                else if (c.name === 'a:custDash') out.dash = { custom: elements(c).map(ds => ({ ...ds.attrs })) };
                else if (JOINS.includes(c.name)) {
                    out.join = local(c.name);
                    if (c.name === 'a:miter') put(out, 'miterLimit', num(c.attrs.lim));
                } else if (c.name === 'a:headEnd') out.headEnd = { ...c.attrs };
                else if (c.name === 'a:tailEnd') out.tailEnd = { ...c.attrs };
                else (out._extras || (out._extras = [])).push(c);
            }
            return out;
        }
        function renderLine(l) {
            const attrs = {};
            if (l.width != null) attrs.w = String(l.width);
            for (const k of ['cap', 'compound', 'align']) if (l[k] != null) attrs[k === 'compound' ? 'cmpd' : k === 'align' ? 'algn' : k] = String(l[k]);
            Object.assign(attrs, l.extraAttrs || {});
            const node = xml.el('a:ln', attrs, []);
            const add = (child) => insertOrdered(node, child, LN_ORDER);
            if (l.fill) add(renderFill(l.fill));
            if (typeof l.dash === 'string') add(xml.el('a:prstDash', { val: l.dash }));
            else if (l.dash && l.dash.custom) add(xml.el('a:custDash', {}, l.dash.custom.map(ds => xml.el('a:ds', { ...ds }))));
            if (l.join) add(xml.el('a:' + l.join, l.join === 'miter' && l.miterLimit != null ? { lim: String(l.miterLimit) } : {}));
            if (l.headEnd) add(xml.el('a:headEnd', { ...l.headEnd }));
            if (l.tailEnd) add(xml.el('a:tailEnd', { ...l.tailEnd }));
            for (const x of l._extras || []) add(x);
            return node;
        }

        // An effect (`a:effectLst` child) or a blip's colour effect: its
        // attributes and its colour(s), a fill overlay's fill, a colour
        // change's two colours; anything else verbatim (`node`).
        function readEffect(el) {
            const kids = elements(el);
            const e = { kind: local(el.name), attrs: { ...el.attrs } };
            if (!kids.length) return e;
            if (kids.length === 1 && COLORS.has(kids[0].name)) return { ...e, color: readColor(kids[0]) };
            if (el.name === 'a:duotone' && kids.every(k => COLORS.has(k.name))) return { ...e, colors: kids.map(readColor) };
            if (el.name === 'a:fillOverlay' && kids.length === 1 && FILLS.includes(kids[0].name)) return { ...e, fill: readFill(kids[0]) };
            if (el.name === 'a:clrChange' && kids.every(k => k.name === 'a:clrFrom' || k.name === 'a:clrTo')) {
                const from = xml.findChild(el, 'a:clrFrom'), to = xml.findChild(el, 'a:clrTo');
                return { ...e, from: from ? firstColor(from) || null : null, to: to ? firstColor(to) || null : null };
            }
            return { kind: e.kind, node: el };
        }
        function renderEffect(e) {
            if (e.node) return e.node;
            const kids = [];
            if (e.color) kids.push(renderColor(e.color));
            for (const c of e.colors || []) kids.push(renderColor(c));
            if (e.fill) kids.push(renderFill(e.fill));
            if ('from' in e) kids.push(xml.el('a:clrFrom', {}, e.from ? [renderColor(e.from)] : []), xml.el('a:clrTo', {}, e.to ? [renderColor(e.to)] : []));
            return xml.el('a:' + e.kind, { ...(e.attrs || {}) }, kids);
        }

        // --- Extension items (`a:extLst/a:ext[@uri]`) ---

        function extItem(parent, uri) {
            const lst = xml.findChild(parent, 'a:extLst');
            const ext = lst && elements(lst).find(c => c.name === 'a:ext' && c.attrs.uri === uri);
            return ext ? elements(ext)[0] || null : null;
        }
        // The item of `uri` given `attrs` (in place), created from `make()`
        // when absent, or removed (attrs null) with its list once empty.
        function putExtItem(parent, uri, attrs, make, order) {
            let lst = xml.findChild(parent, 'a:extLst');
            const ext = lst && elements(lst).find(c => c.name === 'a:ext' && c.attrs.uri === uri);
            if (attrs == null) {
                if (!ext) return;
                lst.children.splice(lst.children.indexOf(ext), 1);
                if (!elements(lst).length) parent.children.splice(parent.children.indexOf(lst), 1);
                return;
            }
            const item = ext && elements(ext)[0];
            if (item) { patchAttrs(item, attrs); return; }
            if (!lst) { lst = xml.el('a:extLst', {}, []); insertOrdered(parent, lst, order); }
            lst.children.push(xml.el('a:ext', { uri }, [make()]));
        }

        // --- The picture's parts and fields ---

        function picParts(pic) {
            const nv = xml.findChild(pic, 'pic:nvPicPr');
            const blipFill = xml.findChild(pic, 'pic:blipFill');
            const spPr = xml.findChild(pic, 'pic:spPr');
            return {
                cNvPr: nv && xml.findChild(nv, 'pic:cNvPr'),
                cNvPicPr: nv && xml.findChild(nv, 'pic:cNvPicPr'),
                blipFill, blip: blipFill && xml.findChild(blipFill, 'a:blip'),
                spPr, xfrm: spPr && xml.findChild(spPr, 'a:xfrm'), prstGeom: spPr && xml.findChild(spPr, 'a:prstGeom')
            };
        }

        // The non-visual properties a picture and a shape share (`cNvPr`).
        function readNonVisual(p, out) {
            if (p.cNvPr) {
                const a = p.cNvPr.attrs;
                put(out, 'description', a.descr);
                put(out, 'title', a.title);
                put(out, 'hidden', flag(a.hidden));
                const link = xml.findChild(p.cNvPr, 'a:hlinkClick');
                if (link) {
                    const h = {};
                    for (const [k, v] of Object.entries(link.attrs)) {
                        if (k === 'r:id') h.rId = v;
                        else if (k === 'tooltip') h.tooltip = v;
                        else if (k === 'tgtFrame') h.targetFrame = v;
                        else if (!k.startsWith('xmlns')) (h.extraAttrs || (h.extraAttrs = {}))[k] = v;
                    }
                    if (elements(link).length) h._extras = elements(link);
                    out.hyperlink = h;
                }
                const dec = extItem(p.cNvPr, DECORATIVE_URI);
                if (dec) put(out, 'decorative', flag(dec.attrs.val));
            }
        }

        // A flags element (`a:picLocks`, `a:spLocks` …) as booleans.
        function readFlags(el) {
            const out = {};
            for (const [k, v] of Object.entries(el.attrs)) if (!k.startsWith('xmlns')) out[k] = flag(v);
            return out;
        }

        // The shape properties a picture and a shape share (`spPr`).
        function readShapeProperties(p, out) {
            if (!p.spPr) return;
            if (p.spPr.attrs.bwMode) out.bwMode = p.spPr.attrs.bwMode;
            if (p.xfrm) {
                put(out, 'rotation', num(p.xfrm.attrs.rot));
                put(out, 'flipH', flag(p.xfrm.attrs.flipH));
                put(out, 'flipV', flag(p.xfrm.attrs.flipV));
            }
            const av = p.prstGeom && xml.findChild(p.prstGeom, 'a:avLst');
            const guides = av ? elements(av).filter(g => g.name === 'a:gd') : [];
            if (guides.length) out.adjust = guides.map(g => ({ name: g.attrs.name, fmla: g.attrs.fmla }));
            const fill = elements(p.spPr).find(c => FILLS.includes(c.name));
            if (fill) out.fill = readFill(fill);
            const ln = xml.findChild(p.spPr, 'a:ln');
            if (ln) out.line = readLine(ln);
            const lst = xml.findChild(p.spPr, 'a:effectLst');
            if (lst) out.effects = elements(lst).map(readEffect);
        }

        /** The `picture` field of a `pic:pic` element: each property it holds. */
        function readPicture(pic) {
            const p = picParts(pic), out = {};
            readNonVisual(p, out);
            if (p.cNvPicPr) {
                put(out, 'preferRelativeResize', flag(p.cNvPicPr.attrs.preferRelativeResize));
                const locks = xml.findChild(p.cNvPicPr, 'a:picLocks');
                if (locks) out.locks = readFlags(locks);
            }
            if (p.blip) {
                if (p.blip.attrs.cstate) out.cstate = p.blip.attrs.cstate;
                const dpi = extItem(p.blip, LOCAL_DPI_URI);
                if (dpi) put(out, 'useLocalDpi', flag(dpi.attrs.val));
                const effects = elements(p.blip).filter(c => c.name !== 'a:extLst');
                if (effects.length) out.blipEffects = effects.map(readEffect);
            }
            if (p.blipFill) {
                put(out, 'dpi', num(p.blipFill.attrs.dpi));
                put(out, 'rotWithShape', flag(p.blipFill.attrs.rotWithShape));
                const stretch = xml.findChild(p.blipFill, 'a:stretch'), tile = xml.findChild(p.blipFill, 'a:tile');
                if (stretch) {
                    out.fillMode = 'stretch';
                    const fr = xml.findChild(stretch, 'a:fillRect');
                    if (fr) out.fillRect = { ...fr.attrs };
                } else if (tile) {
                    out.fillMode = 'tile';
                    out.tile = { ...tile.attrs };
                }
            }
            readShapeProperties(p, out);
            return out;
        }

        // Each `picture` field's writer into the source copy's parts `p`
        // (`v` the picture); false when it has no place there. Fields that
        // share an element share a writer (`PICTURE_WRITERS` groups them).
        const attrWriter = (part, attr, encode = String) => (p, v, key) => {
            if (!p[part]) return false;
            patchAttrs(p[part], { [attr]: v[key] == null ? null : encode(v[key], p[part].attrs[attr]) });
        };
        const flagWriter = (part, attr) => attrWriter(part, attr, (value, old) => flagValue(old, value));
        const xfrmWriter = (attr, encode) => (p, v, key) => {
            if (!p.spPr) return false;
            if (!p.xfrm) {
                if (v[key] == null) return;
                p.xfrm = xml.el('a:xfrm', {}, []);
                insertOrdered(p.spPr, p.xfrm, SPPR_ORDER);
            }
            patchAttrs(p.xfrm, { [attr]: v[key] == null ? null : encode(v[key], p.xfrm.attrs[attr]) });
        };
        // A flags element (`a:picLocks`, `a:spLocks`, `a:cxnSpLocks`) of
        // `parent`: its attributes patched, created at its place, or removed.
        function writeFlags(parent, name, flags, order) {
            const node = xml.findChild(parent, name);
            if (!flags) { putChild(parent, name, null, order); return; }
            const attrs = {};
            for (const k of Object.keys(node ? node.attrs : {})) if (!k.startsWith('xmlns')) attrs[k] = null;
            for (const [k, b] of Object.entries(flags)) attrs[k] = flagValue(node && node.attrs[k], b);
            if (node) patchAttrs(node, attrs);
            else putChild(parent, name, xml.el(name, Object.fromEntries(Object.entries(attrs).filter(([, x]) => x != null))), order);
        }
        const NON_VISUAL_WRITERS = [
            [['description'], attrWriter('cNvPr', 'descr')],
            [['title'], attrWriter('cNvPr', 'title')],
            [['hidden'], flagWriter('cNvPr', 'hidden')],
            [['hyperlink'], (p, v) => {
                if (!p.cNvPr) return false;
                const h = v.hyperlink;
                const node = h ? xml.el('a:hlinkClick', Object.assign(
                    h.rId != null ? { 'r:id': String(h.rId) } : {},
                    h.tooltip != null ? { tooltip: String(h.tooltip) } : {},
                    h.targetFrame != null ? { tgtFrame: String(h.targetFrame) } : {},
                    h.extraAttrs || {}), h._extras || []) : null;
                putChild(p.cNvPr, 'a:hlinkClick', node, CNVPR_ORDER);
            }],
            [['decorative'], (p, v) => {
                if (!p.cNvPr) return false;
                const old = extItem(p.cNvPr, DECORATIVE_URI);
                const val = v.decorative == null ? null : flagValue(old && old.attrs.val, v.decorative);
                putExtItem(p.cNvPr, DECORATIVE_URI, val == null ? null : { val },
                    () => xml.el('adec:decorative', { 'xmlns:adec': ADEC_NS, val }), CNVPR_ORDER);
            }]
        ];
        const SHAPE_PROPERTY_WRITERS = [
            [['bwMode'], attrWriter('spPr', 'bwMode')],
            [['rotation'], xfrmWriter('rot', String)],
            [['flipH'], xfrmWriter('flipH', (value, old) => flagValue(old, value))],
            [['flipV'], xfrmWriter('flipV', (value, old) => flagValue(old, value))],
            [['adjust'], (p, v) => {
                const av = p.prstGeom && xml.findChild(p.prstGeom, 'a:avLst');
                if (!p.prstGeom) return false;
                const gds = (v.adjust || []).map(g => xml.el('a:gd', { name: String(g.name), fmla: String(g.fmla) }));
                if (av) av.children = [...(av.children || []).filter(c => c.type !== 'element' || c.name !== 'a:gd'), ...gds];
                else if (gds.length) p.prstGeom.children = [...(p.prstGeom.children || []), xml.el('a:avLst', {}, gds)];
            }],
            [['fill'], (p, v) => (p.spPr ? putChild(p.spPr, FILLS, v.fill ? renderFill(v.fill) : null, SPPR_ORDER) : false)],
            [['line'], (p, v) => (p.spPr ? putChild(p.spPr, 'a:ln', v.line ? renderLine(v.line) : null, SPPR_ORDER) : false)],
            [['effects'], (p, v) => (p.spPr
                ? putChild(p.spPr, 'a:effectLst', v.effects ? xml.el('a:effectLst', {}, v.effects.map(renderEffect)) : null, SPPR_ORDER)
                : false)]
        ];
        const PICTURE_WRITERS = [
            ...NON_VISUAL_WRITERS,
            [['preferRelativeResize'], flagWriter('cNvPicPr', 'preferRelativeResize')],
            [['locks'], (p, v) => (p.cNvPicPr ? writeFlags(p.cNvPicPr, 'a:picLocks', v.locks, CNVPICPR_ORDER) : false)],
            [['cstate'], attrWriter('blip', 'cstate')],
            [['useLocalDpi'], (p, v) => {
                if (!p.blip) return false;
                const old = extItem(p.blip, LOCAL_DPI_URI);
                const val = v.useLocalDpi == null ? null : flagValue(old && old.attrs.val, v.useLocalDpi);
                putExtItem(p.blip, LOCAL_DPI_URI, val == null ? null : { val },
                    () => xml.el('a14:useLocalDpi', { 'xmlns:a14': A14_NS, val }), BLIP_ORDER);
            }],
            [['blipEffects'], (p, v) => {
                if (!p.blip) return false;
                const kids = p.blip.children || [];
                const lst = kids.find(c => c.type === 'element' && c.name === 'a:extLst');
                const rest = kids.filter(c => c.type !== 'element' || c.name === 'a:extLst');
                const effects = (v.blipEffects || []).map(renderEffect);
                p.blip.children = lst ? [...rest.slice(0, rest.indexOf(lst)), ...effects, ...rest.slice(rest.indexOf(lst))] : [...rest, ...effects];
            }],
            [['dpi'], attrWriter('blipFill', 'dpi')],
            [['rotWithShape'], flagWriter('blipFill', 'rotWithShape')],
            [['fillMode', 'fillRect', 'tile'], (p, v) => {
                if (!p.blipFill) return false;
                const node = v.fillMode === 'tile' ? xml.el('a:tile', { ...(v.tile || {}) })
                    : v.fillMode === 'stretch' ? xml.el('a:stretch', {}, v.fillRect ? [xml.el('a:fillRect', { ...v.fillRect })] : [])
                        : null;
                putChild(p.blipFill, ['a:tile', 'a:stretch'], node, BLIPFILL_ORDER);
            }],
            ...SHAPE_PROPERTY_WRITERS
        ];

        // Write `value`'s fields that differ from `base` through `writers`
        // into parts `p`; false when one has no place there. `force` writes
        // every field. A writer finding no place where the value holds none
        // of its fields is no failure.
        function writeFields(p, writers, value, base, force) {
            for (const [keys, write] of writers) {
                if (!force && keys.every(k => same(value[k], base[k]))) continue;
                if (write(p, value, keys[0], base, force) === false && keys.some(k => value[k] != null)) return false;
            }
            return true;
        }

        /**
         * Write `picture`'s fields that differ from `base` (the `picture` of
         * the source) into `pic` (a `pic:pic` of the source copy); false
         * when one has no place there. `force` writes every field.
         */
        function writePicture(pic, picture, base, force) {
            return writeFields(picParts(pic), PICTURE_WRITERS, picture, base, force);
        }

        // --- The typed shape ---

        const WSP_ORDER = rankOf(['wps:cNvPr', ['wps:cNvSpPr', 'wps:cNvCnPr'], 'wps:spPr', 'wps:style', 'wps:extLst',
            ['wps:txbx', 'wps:linkedTxbx'], 'wps:bodyPr']);
        const CNVSPPR_ORDER = rankOf(['a:spLocks', 'a:extLst']);
        const CNVCNPR_ORDER = rankOf(['a:cxnSpLocks', 'a:stCxn', 'a:endCxn', 'a:extLst']);
        const AUTOFITS = ['a:noAutofit', 'a:normAutofit', 'a:spAutoFit'];
        const BODYPR_ORDER = rankOf(['a:prstTxWarp', AUTOFITS, 'a:scene3d', 'a:sp3d', 'a:flatTx', 'a:extLst']);
        const STYLE_REFS = [['line', 'a:lnRef'], ['fill', 'a:fillRef'], ['effect', 'a:effectRef'], ['font', 'a:fontRef']];
        // `wps:bodyPr` attributes typed as `body` fields: attribute, field, codec.
        const BODY_ATTRS = [['rot', 'rotation', 'num'], ['vert', 'vertical', 'str'], ['wrap', 'wrap', 'str'],
            ['anchor', 'anchor', 'str'], ['anchorCtr', 'anchorCenter', 'flag'], ['upright', 'upright', 'flag']];
        const INSETS = [['lIns', 'l'], ['tIns', 't'], ['rIns', 'r'], ['bIns', 'b']];
        const COLUMNS = [['numCol', 'count', 'num'], ['spcCol', 'spacing', 'num'], ['rtlCol', 'rtl', 'flag']];
        const decode = (codec, v) => (codec === 'num' ? num(v) : codec === 'flag' ? flag(v) : v);
        // A value as an attribute, the source's spelling kept while it says
        // the same.
        const encode = (codec, value, old) => (value == null ? null
            : codec === 'flag' ? flagValue(old, value)
                : codec === 'num' && old != null && Number(old) === value ? old : String(value));

        function shapeParts(wsp) {
            const spPr = xml.findChild(wsp, 'wps:spPr');
            const txbx = xml.findChild(wsp, 'wps:txbx');
            return {
                wsp, spPr, xfrm: spPr && xml.findChild(spPr, 'a:xfrm'), prstGeom: spPr && xml.findChild(spPr, 'a:prstGeom'),
                cNvPr: xml.findChild(wsp, 'wps:cNvPr'), cNvSpPr: xml.findChild(wsp, 'wps:cNvSpPr'),
                cNvCnPr: xml.findChild(wsp, 'wps:cNvCnPr'), style: xml.findChild(wsp, 'wps:style'),
                bodyPr: xml.findChild(wsp, 'wps:bodyPr'), txbx, txbxContent: txbx && xml.findChild(txbx, 'w:txbxContent')
            };
        }

        function readConnection(el) {
            const c = {};
            put(c, 'id', num(el.attrs.id));
            put(c, 'idx', num(el.attrs.idx));
            return c;
        }

        function readBody(el) {
            const out = {};
            const typed = new Set();
            for (const [attr, key, codec] of BODY_ATTRS) {
                if (el.attrs[attr] == null) continue;
                put(out, key, decode(codec, el.attrs[attr]));
                typed.add(attr);
            }
            for (const [attr, side] of INSETS) {
                if (el.attrs[attr] == null) continue;
                (out.insets || (out.insets = {}))[side] = num(el.attrs[attr]);
                typed.add(attr);
            }
            for (const [attr, key, codec] of COLUMNS) {
                if (el.attrs[attr] == null) continue;
                (out.columns || (out.columns = {}))[key] = decode(codec, el.attrs[attr]);
                typed.add(attr);
            }
            for (const [k, v] of Object.entries(el.attrs)) {
                if (!typed.has(k) && !k.startsWith('xmlns')) (out.extraAttrs || (out.extraAttrs = {}))[k] = v;
            }
            const warp = xml.findChild(el, 'a:prstTxWarp');
            if (warp) {
                out.warp = { preset: warp.attrs.prst };
                const av = xml.findChild(warp, 'a:avLst');
                if (av) out.warp.adjust = elements(av).filter(g => g.name === 'a:gd').map(g => ({ name: g.attrs.name, fmla: g.attrs.fmla }));
            }
            const fit = elements(el).find(c => AUTOFITS.includes(c.name));
            if (fit) out.autofit = fit.name === 'a:noAutofit' ? 'none' : fit.name === 'a:spAutoFit' ? 'shape' : { normal: { ...fit.attrs } };
            return out;
        }

        /** The `shape` field of a `wps:wsp` element: each property it holds. */
        function readShape(wsp) {
            const p = shapeParts(wsp), out = {};
            readNonVisual(p, out);
            if (p.cNvSpPr) {
                put(out, 'isTextBox', flag(p.cNvSpPr.attrs.txBox));
                const locks = xml.findChild(p.cNvSpPr, 'a:spLocks');
                if (locks) out.locks = readFlags(locks);
            }
            if (p.cNvCnPr) {
                const c = {};
                const locks = xml.findChild(p.cNvCnPr, 'a:cxnSpLocks');
                if (locks) c.locks = readFlags(locks);
                const st = xml.findChild(p.cNvCnPr, 'a:stCxn'), end = xml.findChild(p.cNvCnPr, 'a:endCxn');
                if (st) c.start = readConnection(st);
                if (end) c.end = readConnection(end);
                out.connector = c;
            }
            readShapeProperties(p, out);
            if (p.style) {
                const st = {};
                for (const [key, name] of STYLE_REFS) {
                    const ref = xml.findChild(p.style, name);
                    if (!ref) continue;
                    st[key] = { idx: key === 'font' ? ref.attrs.idx : num(ref.attrs.idx) };
                    const color = firstColor(ref);
                    if (color) st[key].color = color;
                }
                out.style = st;
            }
            if (p.bodyPr) out.body = readBody(p.bodyPr);
            if (p.txbxContent) out.content = structureMod.parseBody(p.txbxContent).body;
            return out;
        }

        function renderStyle(st) {
            return xml.el('wps:style', {}, STYLE_REFS.filter(([key]) => st[key]).map(([key, name]) =>
                xml.el(name, { idx: String(st[key].idx) }, st[key].color ? [renderColor(st[key].color)] : [])));
        }

        function writeBody(p, body) {
            if (!body) return false;   // `wps:bodyPr` is required: a structure change
            if (!p.bodyPr) {
                p.bodyPr = xml.el('wps:bodyPr', {}, []);
                insertOrdered(p.wsp, p.bodyPr, WSP_ORDER);
            }
            const el = p.bodyPr, attrs = {};
            for (const k of Object.keys(el.attrs)) if (!k.startsWith('xmlns')) attrs[k] = null;
            for (const [attr, key, codec] of BODY_ATTRS) attrs[attr] = encode(codec, body[key], el.attrs[attr]);
            for (const [attr, side] of INSETS) attrs[attr] = encode('num', body.insets && body.insets[side], el.attrs[attr]);
            for (const [attr, key, codec] of COLUMNS) attrs[attr] = encode(codec, body.columns && body.columns[key], el.attrs[attr]);
            Object.assign(attrs, body.extraAttrs || {});
            patchAttrs(el, attrs);
            const warp = xml.findChild(el, 'a:prstTxWarp');
            if (!body.warp) putChild(el, 'a:prstTxWarp', null, BODYPR_ORDER);
            else {
                const gds = (body.warp.adjust || []).map(g => xml.el('a:gd', { name: String(g.name), fmla: String(g.fmla) }));
                const node = warp || xml.el('a:prstTxWarp', {}, []);
                node.attrs.prst = String(body.warp.preset);
                const av = xml.findChild(node, 'a:avLst');
                if (av) av.children = gds;
                else if (body.warp.adjust) node.children.push(xml.el('a:avLst', {}, gds));
                if (!warp) insertOrdered(el, node, BODYPR_ORDER);
            }
            const fit = body.autofit;
            putChild(el, AUTOFITS, fit === 'none' ? xml.el('a:noAutofit', {}) : fit === 'shape' ? xml.el('a:spAutoFit', {})
                : fit && fit.normal ? xml.el('a:normAutofit', { ...fit.normal }) : null, BODYPR_ORDER);
        }

        const SHAPE_WRITERS = [
            ...NON_VISUAL_WRITERS,
            [['isTextBox'], flagWriter('cNvSpPr', 'txBox')],
            [['locks'], (p, v) => (p.cNvSpPr ? writeFlags(p.cNvSpPr, 'a:spLocks', v.locks, CNVSPPR_ORDER) : false)],
            [['connector'], (p, v) => {
                const c = v.connector;
                if (!p.cNvCnPr || !c) return false;
                writeFlags(p.cNvCnPr, 'a:cxnSpLocks', c.locks, CNVCNPR_ORDER);
                const cxn = (name, x) => (x ? xml.el(name, Object.fromEntries(['id', 'idx'].filter(k => x[k] != null).map(k => [k, String(x[k])]))) : null);
                putChild(p.cNvCnPr, 'a:stCxn', cxn('a:stCxn', c.start), CNVCNPR_ORDER);
                putChild(p.cNvCnPr, 'a:endCxn', cxn('a:endCxn', c.end), CNVCNPR_ORDER);
            }],
            ...SHAPE_PROPERTY_WRITERS,
            [['style'], (p, v) => putChild(p.wsp, 'wps:style', v.style ? renderStyle(v.style) : null, WSP_ORDER)],
            [['body'], (p, v) => writeBody(p, v.body)],
            [['content'], (p, v) => {
                if (!v.content) { putChild(p.wsp, 'wps:txbx', null, WSP_ORDER); return; }
                const extras = p.txbxContent ? structureMod.parseBody(p.txbxContent).extras : [];
                const children = structureMod.renderBodyChildren({ body: v.content, _extras: extras });
                if (p.txbxContent) p.txbxContent.children = children;
                else if (p.txbx) p.txbx.children = [...(p.txbx.children || []), xml.el('w:txbxContent', {}, children)];
                else putChild(p.wsp, 'wps:txbx', xml.el('wps:txbx', {}, [xml.el('w:txbxContent', {}, children)]), WSP_ORDER);
            }]
        ];

        /**
         * Write `shape`'s fields that differ from `base` (the `shape` of the
         * source) into `wsp` (a `wps:wsp` of the source copy); false when one
         * has no place there. `force` writes every field.
         */
        function writeShape(wsp, shape, base, force) {
            return writeFields(shapeParts(wsp), SHAPE_WRITERS, shape, base, force);
        }

        // --- The frame, the layout, groups and canvases ---

        const WP14_IDS = [['anchorId', 'wp14:anchorId'], ['editId', 'wp14:editId']];
        const WRAPS = ['wp:wrapNone', 'wp:wrapSquare', 'wp:wrapTight', 'wp:wrapThrough', 'wp:wrapTopAndBottom'];
        // CT_Inline / CT_Anchor order (ECMA-376 Part 1 § 20.4.2), Word 2010's
        // relative sizes last.
        const WRAPPER_ORDER = rankOf(['wp:simplePos', 'wp:positionH', 'wp:positionV', 'wp:extent', 'wp:effectExtent',
            WRAPS, 'wp:docPr', 'wp:cNvGraphicFramePr', 'a:graphic', 'wp14:sizeRelH', 'wp14:sizeRelV']);
        const FRAMEPR_ORDER = rankOf(['a:graphicFrameLocks', 'a:extLst']);
        const GRPXFRM_ORDER = rankOf(['a:off', 'a:ext', 'a:chOff', 'a:chExt']);
        const GROUP_ORDER = rankOf(['wpg:cNvPr', 'wpg:cNvGrpSpPr', 'wpg:grpSpPr']);
        const CANVAS_ORDER = rankOf(['wpc:bg', 'wpc:whole']);
        const CNVGRPSPPR_ORDER = rankOf(['a:grpSpLocks', 'a:extLst']);
        const SIDES = ['l', 't', 'r', 'b'];
        const textOf = (el) => (el && el.children || []).filter(c => c.type === 'text').map(c => c.value).join('');
        const sides = (el) => { const o = {}; for (const k of SIDES) put(o, k, num(el.attrs[k])); return o; };
        const sideAttrs = (o) => Object.fromEntries(SIDES.filter(k => o[k] != null).map(k => [k, String(o[k])]));

        function frameParts(wrapper) {
            const framePr = xml.findChild(wrapper, 'wp:cNvGraphicFramePr');
            return {
                wrapper, framePr, cNvPr: xml.findChild(wrapper, 'wp:docPr'),
                effectExtent: xml.findChild(wrapper, 'wp:effectExtent'),
                frameLocks: framePr && xml.findChild(framePr, 'a:graphicFrameLocks')
            };
        }

        /** The `frame` of a `wp:inline` / `wp:anchor` element: each property it holds. */
        function readFrame(wrapper) {
            const p = frameParts(wrapper), out = {};
            for (const [key, attr] of WP14_IDS) put(out, key, wrapper.attrs[attr]);
            if (p.effectExtent) out.effectExtent = sides(p.effectExtent);
            if (p.frameLocks) out.frameLocks = readFlags(p.frameLocks);
            const nv = {};
            readNonVisual(p, nv);
            for (const key of ['hidden', 'hyperlink', 'decorative']) put(out, key, nv[key]);
            return out;
        }

        const FRAME_WRITERS = [
            ...WP14_IDS.map(([key, attr]) => [[key], attrWriter('wrapper', attr)]),
            [['effectExtent'], (p, v) => {
                if (!v.effectExtent) { putChild(p.wrapper, 'wp:effectExtent', null, WRAPPER_ORDER); return; }
                const attrs = {};
                for (const k of SIDES) attrs[k] = encode('num', v.effectExtent[k], p.effectExtent && p.effectExtent.attrs[k]);
                if (p.effectExtent) patchAttrs(p.effectExtent, attrs);
                else putChild(p.wrapper, 'wp:effectExtent', xml.el('wp:effectExtent', sideAttrs(v.effectExtent)), WRAPPER_ORDER);
            }],
            [['frameLocks'], (p, v) => {
                if (!p.framePr) {
                    if (!v.frameLocks) return;
                    p.framePr = xml.el('wp:cNvGraphicFramePr', {}, []);
                    insertOrdered(p.wrapper, p.framePr, WRAPPER_ORDER);
                }
                writeFlags(p.framePr, 'a:graphicFrameLocks', v.frameLocks, FRAMEPR_ORDER);
            }],
            ...NON_VISUAL_WRITERS.filter(([keys]) => ['hidden', 'hyperlink', 'decorative'].includes(keys[0]))
        ];

        function readPosition(el) {
            const out = { relativeFrom: el.attrs.relativeFrom };
            for (const c of elements(el)) {
                if (c.name === 'wp:posOffset') out.offset = num(textOf(c));
                else if (c.name === 'wp:align') out.align = textOf(c);
                else if (c.name === 'wp14:pctPosHOffset' || c.name === 'wp14:pctPosVOffset') out.pctOffset = num(textOf(c));
            }
            return out;
        }
        function renderPosition(name, pos) {
            const kids = [];
            if (pos.align != null) kids.push(xml.el('wp:align', {}, [{ type: 'text', value: String(pos.align) }]));
            else if (pos.offset != null) kids.push(xml.el('wp:posOffset', {}, [{ type: 'text', value: String(pos.offset) }]));
            if (pos.pctOffset != null) {
                kids.push(xml.el(name === 'wp:positionH' ? 'wp14:pctPosHOffset' : 'wp14:pctPosVOffset', {}, [{ type: 'text', value: String(pos.pctOffset) }]));
            }
            return xml.el(name, pos.relativeFrom != null ? { relativeFrom: String(pos.relativeFrom) } : {}, kids);
        }

        function readWrap(el) {
            const out = { type: { 'wp:wrapNone': 'none', 'wp:wrapSquare': 'square', 'wp:wrapTight': 'tight',
                'wp:wrapThrough': 'through', 'wp:wrapTopAndBottom': 'topAndBottom' }[el.name] };
            for (const [k, v] of Object.entries(el.attrs)) out[k] = k === 'wrapText' ? v : num(v);
            const ee = xml.findChild(el, 'wp:effectExtent');
            if (ee) out.effectExtent = sides(ee);
            const poly = xml.findChild(el, 'wp:wrapPolygon');
            if (poly) {
                const point = (c) => ({ x: num(c.attrs.x), y: num(c.attrs.y) });
                const start = xml.findChild(poly, 'wp:start');
                out.polygon = { start: start ? point(start) : undefined, lineTo: xml.findAll(poly, 'wp:lineTo').map(point) };
                if (!start) delete out.polygon.start;
                put(out.polygon, 'edited', flag(poly.attrs.edited));
            }
            return out;
        }
        function renderWrap(w) {
            const name = { none: 'wp:wrapNone', square: 'wp:wrapSquare', tight: 'wp:wrapTight', through: 'wp:wrapThrough',
                topAndBottom: 'wp:wrapTopAndBottom' }[w.type];
            if (!name) return null;
            const attrs = {};
            for (const [k, v] of Object.entries(w)) if (!['type', 'effectExtent', 'polygon'].includes(k) && v != null) attrs[k] = String(v);
            const kids = [];
            if (w.effectExtent) kids.push(xml.el('wp:effectExtent', sideAttrs(w.effectExtent)));
            if (w.polygon) {
                const pt = (n, q) => xml.el(n, { x: String(q.x), y: String(q.y) });
                kids.push(xml.el('wp:wrapPolygon', w.polygon.edited != null ? { edited: w.polygon.edited ? '1' : '0' } : {},
                    [...(w.polygon.start ? [pt('wp:start', w.polygon.start)] : []), ...(w.polygon.lineTo || []).map(q => pt('wp:lineTo', q))]));
            }
            return xml.el(name, attrs, kids);
        }

        /** The `layout` of a `wp:anchor` element: its position, wrap and relative size. */
        function readLayout(anchor) {
            const out = {};
            const sp = xml.findChild(anchor, 'wp:simplePos');
            if (sp) out.simplePos = { x: num(sp.attrs.x), y: num(sp.attrs.y) };
            const h = xml.findChild(anchor, 'wp:positionH'), v = xml.findChild(anchor, 'wp:positionV');
            if (h) out.horizontal = readPosition(h);
            if (v) out.vertical = readPosition(v);
            const wrap = elements(anchor).find(c => WRAPS.includes(c.name));
            if (wrap) out.wrap = readWrap(wrap);
            const size = {};
            for (const [key, name, pct] of [['horizontal', 'wp14:sizeRelH', 'wp14:pctWidth'], ['vertical', 'wp14:sizeRelV', 'wp14:pctHeight']]) {
                const el = xml.findChild(anchor, name);
                if (el) size[key] = { relativeFrom: el.attrs.relativeFrom, pct: num(textOf(xml.findChild(el, pct))) };
            }
            if (Object.keys(size).length) out.relativeSize = size;
            return out;
        }

        const LAYOUT_WRITERS = [
            [['simplePos'], (p, v) => {
                const el = xml.findChild(p.anchor, 'wp:simplePos');
                if (!v.simplePos) { putChild(p.anchor, 'wp:simplePos', null, WRAPPER_ORDER); return; }
                const attrs = { x: encode('num', v.simplePos.x, el && el.attrs.x), y: encode('num', v.simplePos.y, el && el.attrs.y) };
                if (el) patchAttrs(el, attrs);
                else putChild(p.anchor, 'wp:simplePos', xml.el('wp:simplePos', attrs), WRAPPER_ORDER);
            }],
            [['horizontal'], (p, v) => putChild(p.anchor, 'wp:positionH', v.horizontal ? renderPosition('wp:positionH', v.horizontal) : null, WRAPPER_ORDER)],
            [['vertical'], (p, v) => putChild(p.anchor, 'wp:positionV', v.vertical ? renderPosition('wp:positionV', v.vertical) : null, WRAPPER_ORDER)],
            [['wrap'], (p, v) => {
                const node = v.wrap ? renderWrap(v.wrap) : null;
                if (v.wrap && !node) return false;
                putChild(p.anchor, WRAPS, node, WRAPPER_ORDER);
            }],
            [['relativeSize'], (p, v) => {
                const s = v.relativeSize || {};
                for (const [key, name, pct] of [['horizontal', 'wp14:sizeRelH', 'wp14:pctWidth'], ['vertical', 'wp14:sizeRelV', 'wp14:pctHeight']]) {
                    const x = s[key];
                    putChild(p.anchor, name, x ? xml.el(name, x.relativeFrom != null ? { relativeFrom: String(x.relativeFrom) } : {},
                        x.pct != null ? [xml.el(pct, {}, [{ type: 'text', value: String(x.pct) }])] : []) : null, WRAPPER_ORDER);
                }
            }]
        ];

        // A group's or canvas's children: (c)'s shapes, (b)'s pictures,
        // nested groups, anything else verbatim.
        const CHILD_KINDS = { 'wps:wsp': 'shape', 'pic:pic': 'picture', 'wpg:grpSp': 'group', 'wpg:wgp': 'group' };
        const GROUP_OWN = new Set(['wpg:cNvPr', 'wpg:cNvGrpSpPr', 'wpg:grpSpPr', 'wpg:extLst', 'wpc:bg', 'wpc:whole', 'wpc:extLst']);
        const childElements = (el) => elements(el).filter(c => !GROUP_OWN.has(c.name));
        function readChild(el) {
            const kind = CHILD_KINDS[el.name];
            if (kind === 'shape') return { shape: readShape(el) };
            if (kind === 'picture') return { picture: readPicture(el) };
            if (kind === 'group') return { group: readGroup(el) };
            return { node: el };
        }
        // The children written each into its own element; false when their
        // number or kinds changed.
        function writeChildren(container, children, base, force) {
            const els = childElements(container);
            if (!Array.isArray(children) || children.length !== els.length) return false;
            for (let i = 0; i < els.length; i++) {
                const c = children[i], b = base[i], el = els[i];
                const kind = CHILD_KINDS[el.name] || 'node';
                if (!c || !(kind in c)) return false;
                if (!force && same(c, b)) continue;
                if (kind === 'node') { container.children[container.children.indexOf(el)] = c.node; continue; }
                const ok = kind === 'shape' ? writeShape(el, c.shape, b.shape, force)
                    : kind === 'picture' ? writePicture(el, c.picture, b.picture, force)
                        : writeGroup(el, c.group, b.group, force);
                if (!ok) return false;
            }
            return true;
        }

        function groupParts(el) {
            const spPr = xml.findChild(el, 'wpg:grpSpPr');
            return {
                container: el, spPr, xfrm: spPr && xml.findChild(spPr, 'a:xfrm'),
                cNvPr: xml.findChild(el, 'wpg:cNvPr'), cNvGrpSpPr: xml.findChild(el, 'wpg:cNvGrpSpPr')
            };
        }
        const GROUP_XFRM = [['offset', 'a:off', 'x', 'y'], ['extent', 'a:ext', 'cx', 'cy'], ['childOffset', 'a:chOff', 'x', 'y'], ['childExtent', 'a:chExt', 'cx', 'cy']];

        /** The `group` of a `wpg:wgp` / `wpg:grpSp` element: its properties and children. */
        function readGroup(el) {
            const p = groupParts(el), out = {};
            readNonVisual(p, out);
            const locks = p.cNvGrpSpPr && xml.findChild(p.cNvGrpSpPr, 'a:grpSpLocks');
            if (locks) out.locks = readFlags(locks);
            readShapeProperties(p, out);
            for (const [key, name, a, b] of GROUP_XFRM) {
                const c = p.xfrm && xml.findChild(p.xfrm, name);
                if (c) out[key] = { [a]: num(c.attrs[a]), [b]: num(c.attrs[b]) };
            }
            out.children = childElements(el).map(readChild);
            return out;
        }

        const GROUP_WRITERS = [
            ...NON_VISUAL_WRITERS,
            [['locks'], (p, v) => {
                if (!p.cNvGrpSpPr) {
                    if (!v.locks) return;
                    p.cNvGrpSpPr = xml.el('wpg:cNvGrpSpPr', {}, []);
                    insertOrdered(p.container, p.cNvGrpSpPr, GROUP_ORDER);
                }
                writeFlags(p.cNvGrpSpPr, 'a:grpSpLocks', v.locks, CNVGRPSPPR_ORDER);
            }],
            ...SHAPE_PROPERTY_WRITERS.filter(([keys]) => keys[0] !== 'line' && keys[0] !== 'adjust'),
            ...GROUP_XFRM.map(([key, name, a, b]) => [[key], (p, v) => {
                if (!p.spPr) return false;
                if (!p.xfrm) {
                    if (!v[key]) return;
                    p.xfrm = xml.el('a:xfrm', {}, []);
                    insertOrdered(p.spPr, p.xfrm, SPPR_ORDER);
                }
                const el = xml.findChild(p.xfrm, name), x = v[key];
                if (!x) { putChild(p.xfrm, name, null, GRPXFRM_ORDER); return; }
                const attrs = { [a]: encode('num', x[a], el && el.attrs[a]), [b]: encode('num', x[b], el && el.attrs[b]) };
                if (el) patchAttrs(el, attrs); else putChild(p.xfrm, name, xml.el(name, attrs), GRPXFRM_ORDER);
            }]),
            [['children'], (p, v, key, base, force) => writeChildren(p.container, v.children, base.children || [], force)]
        ];

        /** Write a `group`'s edited fields into `el` (a `wpg:wgp` / `wpg:grpSp`); see `writePicture`. */
        function writeGroup(el, group, base, force) {
            return writeFields(groupParts(el), GROUP_WRITERS, group, base, force);
        }

        // A canvas's background (`wpc:bg`) and whole (`wpc:whole`) formatting.
        const FORMAT_WRITERS = SHAPE_PROPERTY_WRITERS.filter(([keys]) => ['fill', 'line', 'effects'].includes(keys[0]));
        function readFormat(el) {
            const out = {};
            readShapeProperties({ spPr: el }, out);
            delete out.bwMode;
            return out;
        }
        const formatWriter = (key, name) => (p, v) => {
            let el = xml.findChild(p.container, name);
            if (!v[key]) { putChild(p.container, name, null, CANVAS_ORDER); return; }
            if (!el) { el = xml.el(name, {}, []); insertOrdered(p.container, el, CANVAS_ORDER); }
            return writeFields({ spPr: el }, FORMAT_WRITERS, v[key], el ? readFormat(el) : {}, false);
        };

        /** The `canvas` of a `wpc:wpc` element: its background, whole and children. */
        function readCanvas(el) {
            const out = {};
            const bg = xml.findChild(el, 'wpc:bg'), whole = xml.findChild(el, 'wpc:whole');
            if (bg) out.background = readFormat(bg);
            if (whole) out.whole = readFormat(whole);
            out.children = childElements(el).map(readChild);
            return out;
        }
        const CANVAS_WRITERS = [
            [['background'], formatWriter('background', 'wpc:bg')],
            [['whole'], formatWriter('whole', 'wpc:whole')],
            [['children'], (p, v, key, base, force) => writeChildren(p.container, v.children, base.children || [], force)]
        ];
        function writeCanvas(el, canvas, base, force) {
            return writeFields({ container: el }, CANVAS_WRITERS, canvas, base, force);
        }

        function writeFrame(wrapper, frame, base, force) {
            return writeFields(frameParts(wrapper), FRAME_WRITERS, frame, base, force);
        }
        function writeLayout(anchor, layout, base, force) {
            return writeFields({ anchor }, LAYOUT_WRITERS, layout, base, force);
        }

        // The typed fields a drawing gets: field, the element (`partsOf`)
        // it is read from, reader, writer.
        const TYPED = [
            ['frame', 'wrapper', readFrame, writeFrame],
            ['layout', 'anchor', readLayout, writeLayout],
            ['picture', 'pic', readPicture, writePicture],
            ['shape', 'wsp', readShape, writeShape],
            ['group', 'wgp', readGroup, writeGroup],
            ['canvas', 'wpc', readCanvas, writeCanvas]
        ];

        /**
         * A drawing gets its typed `frame`, an anchor its `layout`, a picture
         * its `picture`, a shape its `shape`, a group its `group`, a canvas
         * its `canvas` (see the `read*` functions).
         */
        function hydrateDrawing(d) {
            const p = d && d._source && d._source.type === 'element' ? partsOf(d._source) : {};
            for (const [field, part, read] of TYPED) if (p[part]) d[field] = read(p[part]);
            return d;
        }

        /**
         * An edited drawing (typed fields other than `_read`, or a typed
         * field of this module other than its source's) gets as its source a
         * copy of the kept one with each edited field set in place; an
         * untouched one, or one whose structure changed, is left as it is
         * (the core writes the former from its source and rebuilds the
         * latter). This module's fields are removed in every case.
         */
        function dehydrateDrawing(d) {
            if (!d) return d;
            const values = {};
            for (const [field] of TYPED) {
                if (field in d) values[field] = d[field];
                delete d[field];
            }
            if (!d._source || d._source.type !== 'element' || !d._read) return d;
            const now = typedFields(d);
            const edited = [...new Set([...Object.keys(now), ...Object.keys(d._read)])]
                .filter(k => !same(now[k], d._read[k]));
            const src = partsOf(d._source);
            const typedEdits = [];
            for (const [field, part, read, write] of TYPED) {
                const v = values[field];
                if (!v || typeof v !== 'object' || !src[part]) continue;
                const base = read(src[part]);
                if (!same(v, base)) typedEdits.push([part, write, v, base]);
            }
            if (!edited.length && !typedEdits.length) return d;
            if (!edited.every(k => Object.prototype.hasOwnProperty.call(SETTERS, k))) return d;
            const el = structuredClone(d._source);
            const parts = partsOf(el);
            if (!parts.wrapper) return d;
            for (const k of edited) if (SETTERS[k](parts, d) === false) return d;
            // Over the core fields' edits, whose setters may replace parts.
            const after = partsOf(el);
            for (const [part, write, v, base] of typedEdits) if (!after[part] || !write(after[part], v, base, false)) return d;
            return keepSource(d, el);
        }

        return {
            hydrateDrawing, dehydrateDrawing,
            readFrame, writeFrame, readLayout, writeLayout, readPicture, writePicture,
            readShape, writeShape, readGroup, writeGroup, readCanvas, writeCanvas
        };
    }
};
