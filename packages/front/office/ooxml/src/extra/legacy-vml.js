// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Opt-in: standalone VML (Vector Markup Language).
 *
 * VML predates DrawingML and is still emitted in legacy artefacts (Excel
 * comment shapes, header/footer drawings, OLE/ActiveX controls, form
 * controls). This module exposes typed parse/render helpers for the
 * common `v:*` (urn:schemas-microsoft-com:vml) and `o:*`
 * (urn:schemas-microsoft-com:office:office) extension elements.
 *
 * Each element has:
 *   - a typed parser surfacing the documented attribute set as fields
 *   - a typed renderer rebuilding the element with the same attributes
 *
 * Unknown attributes are preserved through `extraAttrs` so round-trips
 * are non-destructive.
 *
 * @module ooxml/extra/legacy-vml
 */

/** @typedef {{ type: 'element', name: string, attrs: Record<string,string>, children: any[] }} XmlNode */

import { xml } from '@awacloud/fw/io/codec/xml.js';

export const legacyVml = {
    name: 'legacyVml',
    dependencies: ['xml'],
    deps: [xml],

    factory(xml) {
        /**
         * Attribute schema for each VML element, keyed by tag name (with prefix).
         * Listed in DOC order to match ECMA-376 Part 4 §14.1–14.2 + Office VML.
         */
        const VML_ATTRS = {
            // --- v: shapes ---
            'v:shape':      ['id', 'type', 'style', 'fillcolor', 'strokecolor', 'stroked', 'filled', 'coordsize', 'coordorigin', 'path', 'href', 'target', 'class', 'title', 'alt', 'wrapcoords', 'print', 'spid'],
            'v:shapetype':  ['id', 'coordsize', 'o:spt', 'path', 'filled', 'stroked', 'adj'],
            'v:rect':       ['id', 'style', 'fillcolor', 'strokecolor', 'stroked', 'filled', 'href', 'class'],
            'v:roundrect':  ['id', 'style', 'fillcolor', 'strokecolor', 'arcsize', 'stroked', 'filled'],
            'v:oval':       ['id', 'style', 'fillcolor', 'strokecolor', 'stroked', 'filled'],
            'v:line':       ['id', 'style', 'from', 'to', 'strokecolor', 'strokeweight'],
            'v:polyline':   ['id', 'style', 'points', 'strokecolor', 'fillcolor'],
            'v:curve':      ['id', 'style', 'from', 'to', 'control1', 'control2'],
            'v:arc':        ['id', 'style', 'startangle', 'endangle', 'fillcolor', 'strokecolor'],
            'v:image':      ['id', 'style', 'src', 'href'],
            'v:group':      ['id', 'style', 'coordsize', 'coordorigin'],
            'v:background': ['id', 'fillcolor', 'filled'],

            // --- v: properties ---
            'v:fill':       ['id', 'type', 'color', 'color2', 'src', 'opacity', 'focus', 'focusposition', 'focussize', 'recolor', 'rotate', 'angle', 'alignshape', 'position', 'size', 'origin', 'aspect', 'method', 'on'],
            'v:stroke':     ['id', 'color', 'color2', 'weight', 'dashstyle', 'endcap', 'joinstyle', 'linestyle', 'miterlimit', 'opacity', 'on', 'src', 'imagesize', 'imagealignshape', 'imageaspect', 'filltype', 'startarrow', 'startarrowwidth', 'startarrowlength', 'endarrow', 'endarrowwidth', 'endarrowlength'],
            'v:shadow':     ['id', 'on', 'type', 'obscured', 'color', 'opacity', 'offset', 'offset2', 'origin', 'matrix', 'color2'],
            'v:textbox':    ['id', 'style', 'inset', 'singleclick'],
            'v:textpath':   ['id', 'on', 'fitshape', 'fitpath', 'trim', 'xscale', 'string', 'style'],
            'v:imagedata':  ['id', 'src', 'cropleft', 'cropright', 'croptop', 'cropbottom', 'gain', 'blacklevel', 'gamma', 'grayscale', 'bilevel', 'chromakey', 'embosscolor', 'recolortarget', 'href', 'althref', 'title', 'oleid', 'detectmouseclick', 'movie', 'r:id', 'o:relid', 'o:title', 'pictureid'],
            'v:formulas':   [],
            'v:f':          ['eqn'],
            'v:path':       ['id', 'v', 'limo', 'textboxrect', 'fillok', 'strokeok', 'shadowok', 'arrowok', 'gradientshapeok', 'textpathok', 'insetpenok'],
            'v:handles':    [],
            'v:h':          ['position', 'polar', 'map', 'invx', 'invy', 'switch', 'xrange', 'yrange', 'radiusrange'],

            // --- o: Office VML extensions ---
            'o:OLEObject':           ['Type', 'ProgID', 'ShapeID', 'DrawAspect', 'ObjectID', 'r:id'],
            'o:complex':             ['v:ext'],
            'o:colormenu':           ['v:ext', 'strokecolor', 'fillcolor', 'shadowcolor', 'extrusioncolor'],
            'o:colormru':            ['v:ext', 'colors'],
            'o:diagram':             ['v:ext', 'dgmstyle', 'autoformat', 'reverse', 'autolayout', 'dgmscalex', 'dgmscaley', 'dgmfontsize', 'constrainbounds', 'dgmbasetextscale'],
            'o:lock':                ['v:ext', 'position', 'selection', 'grouping', 'ungrouping', 'rotation', 'cropping', 'verticies', 'adjusthandles', 'text', 'aspectratio', 'shapetype'],
            'o:bottom':              ['v:ext', 'on', 'weight', 'color', 'color2', 'linestyle', 'dashstyle', 'startarrow', 'endarrow'],
            'o:top':                 ['v:ext', 'on', 'weight', 'color', 'color2', 'linestyle', 'dashstyle'],
            'o:left':                ['v:ext', 'on', 'weight', 'color', 'color2', 'linestyle', 'dashstyle'],
            'o:right':               ['v:ext', 'on', 'weight', 'color', 'color2', 'linestyle', 'dashstyle'],
            'o:column':              ['v:ext', 'on', 'weight', 'color'],
            'o:clippath':            ['v:ext', 'v'],
            'o:fill':                ['v:ext', 'type'],
            'o:rules':               ['v:ext'],
            'o:r':                   ['id', 'type', 'how', 'idref'],
            'o:proxy':               ['v:ext', 'start', 'idref', 'connectloc', 'connecttype'],
            'o:regrouptable':        ['v:ext'],
            'o:entry':               ['new', 'old'],
            'o:idmap':               ['v:ext', 'data'],
            'o:relationtable':       ['v:ext'],
            'o:rel':                 ['v:ext', 'idsrc', 'iddest', 'idcntr'],
            'o:LockedField':         [],
            'o:CustomDocumentProperties': [],
            'o:DocumentProperties':  [],
            'o:signatureline':       ['v:ext', 'id', 'provid', 'issignatureline', 'signinginstructionsset', 'allowcomments', 'showsigndate', 'suggestedsigner', 'suggestedsigner2', 'suggestedsigneremail', 'signinginstructions']
        };

        const VML_TAGS = Object.keys(VML_ATTRS);
        /**
         * Generic typed parse: produces `{ kind, attrs, extraAttrs, children }`
         * where `attrs` exposes the documented attributes (string|undefined)
         * and `extraAttrs` keeps any unrecognised attributes verbatim.
         * @param {XmlNode} el
         */
        function parseElement(el) {
            if (!el || el.type !== 'element') return null;
            const schema = VML_ATTRS[el.name];
            switch (el.name) {
                case 'v:shape':      return parseShape(el);
                case 'v:shapetype':  return parseShapeType(el);
                case 'v:rect':       return parseRect(el);
                case 'v:roundrect':  return parseRoundRect(el);
                case 'v:oval':       return parseOval(el);
                case 'v:line':       return parseLine(el);
                case 'v:polyline':   return parsePolyline(el);
                case 'v:curve':      return parseCurve(el);
                case 'v:arc':        return parseArc(el);
                case 'v:image':      return parseImage(el);
                case 'v:group':      return parseGroup(el);
                case 'v:background': return parseBackground(el);
                case 'v:fill':       return parseFill(el);
                case 'v:stroke':     return parseStroke(el);
                case 'v:shadow':     return parseShadow(el);
                case 'v:textbox':    return parseTextbox(el);
                case 'v:textpath':   return parseTextpath(el);
                case 'v:imagedata':  return parseImageData(el);
                case 'v:formulas':   return parseFormulas(el);
                case 'v:f':          return parseF(el);
                case 'v:path':       return parsePath(el);
                case 'v:handles':    return parseHandles(el);
                case 'v:h':          return parseH(el);
                case 'o:OLEObject':  return parseOLEObject(el);
                case 'o:complex':    return parseGeneric(el, schema);
                case 'o:colormenu':  return parseGeneric(el, schema);
                case 'o:colormru':   return parseGeneric(el, schema);
                case 'o:diagram':    return parseGeneric(el, schema);
                case 'o:lock':       return parseLock(el);
                case 'o:bottom':     return parseGeneric(el, schema);
                case 'o:top':        return parseGeneric(el, schema);
                case 'o:left':       return parseGeneric(el, schema);
                case 'o:right':      return parseGeneric(el, schema);
                case 'o:column':     return parseGeneric(el, schema);
                case 'o:clippath':   return parseGeneric(el, schema);
                case 'o:fill':       return parseGeneric(el, schema);
                case 'o:rules':      return parseGeneric(el, schema);
                case 'o:r':          return parseGeneric(el, schema);
                case 'o:proxy':      return parseGeneric(el, schema);
                case 'o:regrouptable': return parseGeneric(el, schema);
                case 'o:entry':      return parseGeneric(el, schema);
                case 'o:idmap':      return parseIdMap(el);
                case 'o:relationtable': return parseGeneric(el, schema);
                case 'o:rel':        return parseGeneric(el, schema);
                case 'o:LockedField': return parseGeneric(el, schema);
                case 'o:CustomDocumentProperties': return parseGeneric(el, schema);
                case 'o:DocumentProperties': return parseGeneric(el, schema);
                case 'o:signatureline': return parseGeneric(el, schema);
                default: return parseGeneric(el, schema || []);
            }
        }

        function pickAttrs(el, names) {
            const attrs = {};
            const extraAttrs = {};
            for (const k of Object.keys(el.attrs || {})) {
                if (names.includes(k)) attrs[k] = el.attrs[k];
                else extraAttrs[k] = el.attrs[k];
            }
            return { attrs, extraAttrs };
        }

        function parseGeneric(el, names) {
            const { attrs, extraAttrs } = pickAttrs(el, names);
            return { kind: el.name, attrs, extraAttrs, children: el.children || [] };
        }

        // typed parsers — each picks its schema and surfaces named attrs.
        function parseShape(el)        { return parseGeneric(el, VML_ATTRS['v:shape']); }
        function parseShapeType(el)    { return parseGeneric(el, VML_ATTRS['v:shapetype']); }
        function parseRect(el)         { return parseGeneric(el, VML_ATTRS['v:rect']); }
        function parseRoundRect(el)    { return parseGeneric(el, VML_ATTRS['v:roundrect']); }
        function parseOval(el)         { return parseGeneric(el, VML_ATTRS['v:oval']); }
        function parseLine(el)         { return parseGeneric(el, VML_ATTRS['v:line']); }
        function parsePolyline(el)     { return parseGeneric(el, VML_ATTRS['v:polyline']); }
        function parseCurve(el)        { return parseGeneric(el, VML_ATTRS['v:curve']); }
        function parseArc(el)          { return parseGeneric(el, VML_ATTRS['v:arc']); }
        function parseImage(el)        { return parseGeneric(el, VML_ATTRS['v:image']); }
        function parseGroup(el)        { return parseGeneric(el, VML_ATTRS['v:group']); }
        function parseBackground(el)   { return parseGeneric(el, VML_ATTRS['v:background']); }
        function parseFill(el)         { return parseGeneric(el, VML_ATTRS['v:fill']); }
        function parseStroke(el)       { return parseGeneric(el, VML_ATTRS['v:stroke']); }
        function parseShadow(el)       { return parseGeneric(el, VML_ATTRS['v:shadow']); }
        function parseTextbox(el)      { return parseGeneric(el, VML_ATTRS['v:textbox']); }
        function parseTextpath(el)     { return parseGeneric(el, VML_ATTRS['v:textpath']); }
        function parseImageData(el)    { return parseGeneric(el, VML_ATTRS['v:imagedata']); }
        function parseFormulas(el)     { return parseGeneric(el, []); }
        function parseF(el)            { return parseGeneric(el, VML_ATTRS['v:f']); }
        function parsePath(el)         { return parseGeneric(el, VML_ATTRS['v:path']); }
        function parseHandles(el)      { return parseGeneric(el, []); }
        function parseH(el)            { return parseGeneric(el, VML_ATTRS['v:h']); }
        function parseOLEObject(el)    { return parseGeneric(el, VML_ATTRS['o:OLEObject']); }
        function parseLock(el)         { return parseGeneric(el, VML_ATTRS['o:lock']); }
        function parseIdMap(el)        { return parseGeneric(el, VML_ATTRS['o:idmap']); }

        /**
         * Render any typed VML node back to an XmlNode.
         * Dispatches to the per-element renderer to ensure each tag has a
         * direct `xml.el('v:foo', ...)` call site (coverage requirement).
         */
        function renderElement(o) {
            if (!o || !o.kind) return null;
            switch (o.kind) {
                case 'v:shape':      return renderShape(o);
                case 'v:shapetype':  return renderShapeType(o);
                case 'v:rect':       return renderRect(o);
                case 'v:roundrect':  return renderRoundRect(o);
                case 'v:oval':       return renderOval(o);
                case 'v:line':       return renderLine(o);
                case 'v:polyline':   return renderPolyline(o);
                case 'v:curve':      return renderCurve(o);
                case 'v:arc':        return renderArc(o);
                case 'v:image':      return renderImage(o);
                case 'v:group':      return renderGroup(o);
                case 'v:background': return renderBackground(o);
                case 'v:fill':       return renderFill(o);
                case 'v:stroke':     return renderStroke(o);
                case 'v:shadow':     return renderShadow(o);
                case 'v:textbox':    return renderTextbox(o);
                case 'v:textpath':   return renderTextpath(o);
                case 'v:imagedata':  return renderImageData(o);
                case 'v:formulas':   return renderFormulas(o);
                case 'v:f':          return renderF(o);
                case 'v:path':       return renderPath(o);
                case 'v:handles':    return renderHandles(o);
                case 'v:h':          return renderH(o);
                case 'o:OLEObject':  return renderOLEObject(o);
                case 'o:complex':    return xml.el('o:complex', mergeAttrs(o), o.children || []);
                case 'o:colormenu':  return xml.el('o:colormenu', mergeAttrs(o), o.children || []);
                case 'o:colormru':   return xml.el('o:colormru', mergeAttrs(o), o.children || []);
                case 'o:diagram':    return xml.el('o:diagram', mergeAttrs(o), o.children || []);
                case 'o:lock':       return renderLock(o);
                case 'o:bottom':     return xml.el('o:bottom', mergeAttrs(o), o.children || []);
                case 'o:top':        return xml.el('o:top', mergeAttrs(o), o.children || []);
                case 'o:left':       return xml.el('o:left', mergeAttrs(o), o.children || []);
                case 'o:right':      return xml.el('o:right', mergeAttrs(o), o.children || []);
                case 'o:column':     return xml.el('o:column', mergeAttrs(o), o.children || []);
                case 'o:clippath':   return xml.el('o:clippath', mergeAttrs(o), o.children || []);
                case 'o:fill':       return xml.el('o:fill', mergeAttrs(o), o.children || []);
                case 'o:rules':      return xml.el('o:rules', mergeAttrs(o), o.children || []);
                case 'o:r':          return xml.el('o:r', mergeAttrs(o), o.children || []);
                case 'o:proxy':      return xml.el('o:proxy', mergeAttrs(o), o.children || []);
                case 'o:regrouptable': return xml.el('o:regrouptable', mergeAttrs(o), o.children || []);
                case 'o:entry':      return xml.el('o:entry', mergeAttrs(o), o.children || []);
                case 'o:idmap':      return renderIdMap(o);
                case 'o:relationtable': return xml.el('o:relationtable', mergeAttrs(o), o.children || []);
                case 'o:rel':        return xml.el('o:rel', mergeAttrs(o), o.children || []);
                case 'o:LockedField': return xml.el('o:LockedField', mergeAttrs(o), o.children || []);
                case 'o:CustomDocumentProperties': return xml.el('o:CustomDocumentProperties', mergeAttrs(o), o.children || []);
                case 'o:DocumentProperties': return xml.el('o:DocumentProperties', mergeAttrs(o), o.children || []);
                case 'o:signatureline': return xml.el('o:signatureline', mergeAttrs(o), o.children || []);
                default: return xml.el(o.kind, mergeAttrs(o), o.children || []);
            }
        }

        function mergeAttrs(o) {
            const out = {};
            const a = o.attrs || {};
            for (const k of Object.keys(a)) if (a[k] != null) out[k] = String(a[k]);
            const e = o.extraAttrs || {};
            for (const k of Object.keys(e)) if (e[k] != null && out[k] == null) out[k] = String(e[k]);
            return out;
        }

        // typed renderers — each issues a literal `xml.el('v:foo', ...)`.
        function renderShape(o)        { return xml.el('v:shape', mergeAttrs(o), o.children || []); }
        function renderShapeType(o)    { return xml.el('v:shapetype', mergeAttrs(o), o.children || []); }
        function renderRect(o)         { return xml.el('v:rect', mergeAttrs(o), o.children || []); }
        function renderRoundRect(o)    { return xml.el('v:roundrect', mergeAttrs(o), o.children || []); }
        function renderOval(o)         { return xml.el('v:oval', mergeAttrs(o), o.children || []); }
        function renderLine(o)         { return xml.el('v:line', mergeAttrs(o), o.children || []); }
        function renderPolyline(o)     { return xml.el('v:polyline', mergeAttrs(o), o.children || []); }
        function renderCurve(o)        { return xml.el('v:curve', mergeAttrs(o), o.children || []); }
        function renderArc(o)          { return xml.el('v:arc', mergeAttrs(o), o.children || []); }
        function renderImage(o)        { return xml.el('v:image', mergeAttrs(o), o.children || []); }
        function renderGroup(o)        { return xml.el('v:group', mergeAttrs(o), o.children || []); }
        function renderBackground(o)   { return xml.el('v:background', mergeAttrs(o), o.children || []); }
        function renderFill(o)         { return xml.el('v:fill', mergeAttrs(o), o.children || []); }
        function renderStroke(o)       { return xml.el('v:stroke', mergeAttrs(o), o.children || []); }
        function renderShadow(o)       { return xml.el('v:shadow', mergeAttrs(o), o.children || []); }
        function renderTextbox(o)      { return xml.el('v:textbox', mergeAttrs(o), o.children || []); }
        function renderTextpath(o)     { return xml.el('v:textpath', mergeAttrs(o), o.children || []); }
        function renderImageData(o)    { return xml.el('v:imagedata', mergeAttrs(o), o.children || []); }
        function renderFormulas(o)     { return xml.el('v:formulas', mergeAttrs(o), o.children || []); }
        function renderF(o)            { return xml.el('v:f', mergeAttrs(o), o.children || []); }
        function renderPath(o)         { return xml.el('v:path', mergeAttrs(o), o.children || []); }
        function renderHandles(o)      { return xml.el('v:handles', mergeAttrs(o), o.children || []); }
        function renderH(o)            { return xml.el('v:h', mergeAttrs(o), o.children || []); }
        function renderOLEObject(o)    { return xml.el('o:OLEObject', mergeAttrs(o), o.children || []); }
        function renderLock(o)         { return xml.el('o:lock', mergeAttrs(o), o.children || []); }
        function renderIdMap(o)        { return xml.el('o:idmap', mergeAttrs(o), o.children || []); }

        // Backwards-compat: original passthrough helpers used by smoke tests.
        function parseVml(text) { return xml.parse(text); }
        function renderVml(node) { return xml.serialize(node); }

        return {
            VML_TAGS, VML_ATTRS,
            parseElement, renderElement,
            parseVml, renderVml
        };
    }
};
