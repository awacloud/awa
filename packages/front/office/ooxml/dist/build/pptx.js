/*!
 * Copyright (c) 2026 AwaCloud SAS
 * Author: Matthieu Bouilloux
 * SPDX-License-Identifier: AGPL-3.0-only
 * Dual-licensed; see the NOTICE file for licensing and any additional terms.
 */
/* GENERATED — do not edit. Source: packages/front/office/ooxml/tools/generate-bundles.mjs */

/**
 * @fileoverview `@awacloud/ooxml/bundles/prebuilt/pptx-package` — pre-built single-factory bundle.
 *
 * Variant **package** : declares the 7 fw modules as dependencies and inlines every
 * ooxml-local factory transitively reachable from `pptx` .
 *
 * @module ooxml/bundles/prebuilt/pptx-package
 */

export const pptxPackage = {
    name: "pptxPackage",
    dependencies: ["xml","bitstream","huffman","lz77","deflate","zip","crc32"],
    factory(xml, bitstream, huffman, lz77, deflate, zip, crc32) {
    const __reg = Object.create(null);
    const __cache = Object.create(null);
    function __register(m) { __reg[m.name] = m; }
    function __resolve(name) {
        if (name in __cache) return __cache[name];
        const def = __reg[name];
        if (!def) throw new Error('prebuilt: unknown module ' + name);
        const args = def.dependencies.map(__resolve);
        return (__cache[name] = def.factory.apply({}, args));
    }

    // fw modules — injected by DI.
    __cache["xml"] = xml;
    __cache["bitstream"] = bitstream;
    __cache["huffman"] = huffman;
    __cache["lz77"] = lz77;
    __cache["deflate"] = deflate;
    __cache["zip"] = zip;
    __cache["crc32"] = crc32;

    // ooxml-local factories — inlined and topo-ordered.
    __register({ name: "ooxmlErrors", dependencies: [], factory: function() {
    class OoxmlError extends Error {
      constructor(code, message, opts) {
        super(message);
        this.name = new.target.name;
        this.code = code;
        if (opts && opts.context)
          this.context = opts.context;
        if (opts && opts.cause)
          this.cause = opts.cause;
      }
    }

    class ParseError extends OoxmlError {
    }

    class RenderError extends OoxmlError {
    }

    class ContractError extends OoxmlError {
    }
    function isOoxmlError(e) {
      return e instanceof OoxmlError;
    }
    return {
      OoxmlError,
      ParseError,
      RenderError,
      ContractError,
      isOoxmlError
    };
  } });
    __register({ name: "opcContentTypes", dependencies: ["ooxmlErrors","xml"], factory: function(errors, xml) {
    const { ParseError } = errors;
    function parse(text) {
      const root = xml.parse(text);
      if (root.name !== "Types")
        throw new ParseError("opc/content-types-bad-root", `OPC: expected <Types>, got <${root.name}>`, { context: { elementName: root && root.name } });
      const defaults = {}, overrides = {};
      for (const child of root.children) {
        if (child.type !== "element")
          continue;
        if (child.name === "Default")
          defaults[child.attrs.Extension] = child.attrs.ContentType;
        else if (child.name === "Override")
          overrides[child.attrs.PartName] = child.attrs.ContentType;
      }
      return { defaults, overrides };
    }
    function serialize(types) {
      const children = [];
      for (const ext of Object.keys(types.defaults || {}))
        children.push(xml.el("Default", {
          Extension: ext,
          ContentType: types.defaults[ext]
        }));
      for (const part of Object.keys(types.overrides || {}))
        children.push(xml.el("Override", {
          PartName: part,
          ContentType: types.overrides[part]
        }));
      return xml.serialize(xml.el("Types", { xmlns: "http://schemas.openxmlformats.org/package/2006/content-types" }, children));
    }
    function lookup(types, partName) {
      if (types.overrides && types.overrides[partName])
        return types.overrides[partName];
      const dot = partName.lastIndexOf(".");
      if (dot < 0)
        return null;
      const ext = partName.slice(dot + 1).toLowerCase();
      return types.defaults && types.defaults[ext] || null;
    }
    return { parse, serialize, lookup, NS: "http://schemas.openxmlformats.org/package/2006/content-types" };
  } });
    __register({ name: "opcRelationships", dependencies: ["ooxmlErrors","xml"], factory: function(errors, xml) {
    const { ParseError } = errors;
    function parse(text) {
      const root = xml.parse(text);
      if (root.name !== "Relationships")
        throw new ParseError("opc/relationships-bad-root", `OPC: expected <Relationships>, got <${root.name}>`, { context: { elementName: root && root.name } });
      const out = [];
      for (const c of root.children) {
        if (c.type !== "element" || c.name !== "Relationship")
          continue;
        const r = {
          Id: c.attrs.Id,
          Type: c.attrs.Type,
          Target: c.attrs.Target
        };
        if (c.attrs.TargetMode)
          r.TargetMode = c.attrs.TargetMode;
        out.push(r);
      }
      return out;
    }
    function serialize(rels) {
      const children = (rels || []).map((r) => {
        const attrs = {
          Id: r.Id,
          Type: r.Type,
          Target: r.Target
        };
        if (r.TargetMode)
          attrs.TargetMode = r.TargetMode;
        return xml.el("Relationship", attrs);
      });
      return xml.serialize(xml.el("Relationships", { xmlns: "http://schemas.openxmlformats.org/package/2006/relationships" }, children));
    }
    function relsPathFor(partName) {
      if (!partName || partName === "/")
        return "_rels/.rels";
      const clean = partName.replace(/^\//, ""), slash = clean.lastIndexOf("/"), dir = slash < 0 ? "" : clean.slice(0, slash + 1), file = slash < 0 ? clean : clean.slice(slash + 1);
      return `${dir}_rels/${file}.rels`;
    }
    function resolveTarget(sourcePart, target) {
      if (target.startsWith("/"))
        return target;
      const src = sourcePart.replace(/^\//, ""), slash = src.lastIndexOf("/"), segments = ((slash < 0 ? "" : src.slice(0, slash + 1)) + target).split("/"), out = [];
      for (const seg of segments) {
        if (!seg || seg === ".")
          continue;
        if (seg === "..")
          out.pop();
        else
          out.push(seg);
      }
      return "/" + out.join("/");
    }
    return { parse, serialize, relsPathFor, resolveTarget, NS: "http://schemas.openxmlformats.org/package/2006/relationships" };
  } });
    __register({ name: "ooxmlShared", dependencies: [], factory: function() {
    const NS = Object.freeze({
      W: "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
      ["W15"]: "http://schemas.microsoft.com/office/word/2012/wordml",
      A: "http://schemas.openxmlformats.org/drawingml/2006/main",
      R: "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
      SS: "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
      P: "http://schemas.openxmlformats.org/presentationml/2006/main",
      C: "http://schemas.openxmlformats.org/drawingml/2006/chart",
      M: "http://schemas.openxmlformats.org/officeDocument/2006/math",
      MC: "http://schemas.openxmlformats.org/markup-compatibility/2006",
      WP: "http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing",
      PIC: "http://schemas.openxmlformats.org/drawingml/2006/picture",
      XDR: "http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing",
      DS: "http://schemas.openxmlformats.org/officeDocument/2006/customXml",
      TC: "http://schemas.microsoft.com/office/spreadsheetml/2018/threadedcomments",
      ACTIVEX: "http://schemas.microsoft.com/office/2006/activeX"
    }), REL_TYPE = Object.freeze({
      DOC: NS.R + "/officeDocument",
      HYPERLINK: NS.R + "/hyperlink",
      IMAGE: NS.R + "/image",
      STYLES: NS.R + "/styles",
      NUMBERING: NS.R + "/numbering",
      SETTINGS: NS.R + "/settings",
      COMMENTS: NS.R + "/comments",
      FOOTNOTES: NS.R + "/footnotes",
      ENDNOTES: NS.R + "/endnotes",
      HEADER: NS.R + "/header",
      FOOTER: NS.R + "/footer",
      CUSTOM_XML: NS.R + "/customXml",
      CUSTOM_XML_PROPS: NS.R + "/customXmlProps",
      CHART: NS.R + "/chart",
      PACKAGE: NS.R + "/package",
      DRAWING: NS.R + "/drawing",
      TABLE: NS.R + "/table",
      SHEET: NS.R + "/worksheet",
      SHARED_STRINGS: NS.R + "/sharedStrings",
      VML_DRAWING: NS.R + "/vmlDrawing",
      THREADED_COMMENT: "http://schemas.microsoft.com/office/2017/10/relationships/threadedComment",
      PERSON: "http://schemas.microsoft.com/office/2017/10/relationships/person",
      SLIDE: NS.R + "/slide",
      SLIDE_LAYOUT: NS.R + "/slideLayout",
      SLIDE_MASTER: NS.R + "/slideMaster",
      THEME: NS.R + "/theme"
    }), CT = Object.freeze({
      DOCUMENT: "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml",
      STYLES_W: "application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml",
      STYLES_X: "application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml",
      NUMBERING: "application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml",
      SETTINGS: "application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml",
      COMMENTS_W: "application/vnd.openxmlformats-officedocument.wordprocessingml.comments+xml",
      COMMENTS_X: "application/vnd.openxmlformats-officedocument.spreadsheetml.comments+xml",
      FOOTNOTES: "application/vnd.openxmlformats-officedocument.wordprocessingml.footnotes+xml",
      ENDNOTES: "application/vnd.openxmlformats-officedocument.wordprocessingml.endnotes+xml",
      HEADER: "application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml",
      FOOTER: "application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml",
      WORKBOOK: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml",
      SHEET: "application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml",
      SHARED_STRINGS: "application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml",
      DRAWING: "application/vnd.openxmlformats-officedocument.drawing+xml",
      TABLE: "application/vnd.openxmlformats-officedocument.spreadsheetml.table+xml",
      CHART: "application/vnd.openxmlformats-officedocument.drawingml.chart+xml",
      EMBEDDED_XLSX: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      PRESENTATION: "application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml",
      SLIDE: "application/vnd.openxmlformats-officedocument.presentationml.slide+xml",
      SLIDE_LAYOUT: "application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml",
      SLIDE_MASTER: "application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml",
      THEME: "application/vnd.openxmlformats-officedocument.theme+xml",
      VML_DRAWING: "application/vnd.openxmlformats-officedocument.vmlDrawing",
      CUSTOM_XML_PROPS: "application/vnd.openxmlformats-officedocument.customXmlProperties+xml"
    });
    function toEmu(v) {
      if (typeof v === "number")
        return Math.round(v);
      const m = /^(-?\d+(\.\d+)?)(in|cm|mm|pt|px)?$/.exec(String(v));
      if (!m)
        return 0;
      const n = parseFloat(m[1]);
      switch (m[3]) {
        case "in":
          return Math.round(n * 914400);
        case "cm":
          return Math.round(n * 360000);
        case "mm":
          return Math.round(n * 360000 / 10);
        case "pt":
          return Math.round(n * 12700);
        case "px":
          return Math.round(n * 9525);
        default:
          return Math.round(n);
      }
    }
    function inchesToEmu(v) {
      return Math.round(v * 914400);
    }
    function cmToEmu(v) {
      return Math.round(v * 360000);
    }
    function ptToEmu(v) {
      return Math.round(v * 12700);
    }
    function readBoolAttr(v) {
      if (v == null)
        return;
      return v === "1" || v === "true";
    }
    function writeBoolAttr(b) {
      return b ? "1" : "0";
    }
    function partExt(partName) {
      const s = String(partName || ""), dot = s.lastIndexOf(".");
      if (dot < 0)
        return "";
      return s.slice(dot + 1).toLowerCase();
    }
    function lookupCT(pkg, partName) {
      const ct = pkg && pkg.contentTypes;
      if (!ct)
        return null;
      if (ct.overrides && ct.overrides[partName])
        return ct.overrides[partName];
      const ext = partExt(partName);
      if (!ext)
        return null;
      return ct.defaults && ct.defaults[ext] || null;
    }
    function trackUnmodelledParts(pkg, consume) {
      const plain = pkg.parts, consumed = new Set;
      pkg.parts = new Proxy(plain, {
        get(target, key) {
          if (typeof key === "string")
            consumed.add(key);
          return target[key];
        }
      });
      let value;
      try {
        value = consume(pkg);
      } finally {
        pkg.parts = plain;
      }
      const unmodelledParts = Object.keys(plain).filter((name) => !consumed.has(name)).sort().map((partName) => ({ partName, contentType: lookupCT(pkg, partName) }));
      return { value, unmodelledParts };
    }
    function wordRootAttrs(nodes) {
      const attrs = { "xmlns:w": NS.W, "xmlns:r": NS.R };
      if (hasWord2012Element(nodes)) {
        attrs["xmlns:mc"] = NS.MC;
        attrs["xmlns:w15"] = NS.W15;
        attrs["mc:Ignorable"] = "w15";
      }
      return attrs;
    }
    function hasWord2012Element(nodes) {
      for (const n of nodes || []) {
        if (!n || n.type !== "element")
          continue;
        if (typeof n.name === "string" && n.name.startsWith("w15:"))
          return !0;
        if (hasWord2012Element(n.children))
          return !0;
      }
      return !1;
    }
    const _te = new TextEncoder, _td = new TextDecoder;
    function encodeText(s) {
      return _te.encode(s);
    }
    function decodeText(bytes) {
      return _td.decode(bytes);
    }
    function createRidAllocator(opts) {
      const prefix = opts && opts.prefix || "rId", startN = opts && opts.start || 1, used = new Set;
      if (opts && opts.existing) {
        for (const e of opts.existing)
          if (typeof e === "string")
            used.add(e);
          else if (e && e.Id)
            used.add(e.Id);
      }
      let n = startN;
      function _idAt(k) {
        return prefix + k;
      }
      function _advance() {
        while (used.has(_idAt(n)))
          n++;
      }
      function next() {
        _advance();
        const id = _idAt(n++);
        used.add(id);
        return id;
      }
      function peek() {
        _advance();
        return _idAt(n);
      }
      function reset() {
        n = startN;
      }
      function usedIds() {
        return Array.from(used);
      }
      function claim(preferred) {
        if (preferred && !used.has(preferred)) {
          used.add(preferred);
          return preferred;
        }
        return next();
      }
      function register(id) {
        if (id)
          used.add(id);
      }
      return { next, peek, reset, usedIds, claim, register };
    }
    function createDmlColorCodec(xml) {
      const COLOR_TAGS = Object.freeze([
        "srgbClr",
        "schemeClr",
        "prstClr",
        "hslClr",
        "scrgbClr",
        "sysClr"
      ]);
      function _kindOf(name) {
        switch (name) {
          case "a:srgbClr":
            return "srgbClr";
          case "a:schemeClr":
            return "schemeClr";
          case "a:prstClr":
            return "prstClr";
          case "a:hslClr":
            return "hslClr";
          case "a:scrgbClr":
            return "scrgbClr";
          case "a:sysClr":
            return "sysClr";
          default:
            return null;
        }
      }
      function parseColor(el, opts) {
        if (!el)
          return null;
        const kind = _kindOf(el.name);
        if (!kind)
          return null;
        const out = { kind, attrs: { ...el.attrs } };
        if (opts && opts.withMods)
          out.mods = parseColorMods(el);
        return out;
      }
      function renderColor(c, opts) {
        if (!c)
          return null;
        const mods = !!(opts && opts.withMods) && c.mods && c.mods.length ? c.mods.map(renderColorMod).filter(Boolean) : [];
        switch (c.kind) {
          case "srgbClr":
            return xml.el("a:srgbClr", c.attrs || {}, mods);
          case "schemeClr":
            return xml.el("a:schemeClr", c.attrs || {}, mods);
          case "prstClr":
            return xml.el("a:prstClr", c.attrs || {}, mods);
          case "hslClr":
            return xml.el("a:hslClr", c.attrs || {}, mods);
          case "scrgbClr":
            return xml.el("a:scrgbClr", c.attrs || {}, mods);
          case "sysClr":
            return xml.el("a:sysClr", c.attrs || {}, mods);
          default:
            return null;
        }
      }
      function parseColorMods(el) {
        const out = [];
        for (const c of el.children || []) {
          if (c.type !== "element")
            continue;
          const m = parseColorMod(c);
          if (m)
            out.push(m);
        }
        return out;
      }
      function parseColorMod(el) {
        switch (el.name) {
          case "a:lum":
            return { kind: "lum", attrs: { ...el.attrs } };
          case "a:tint":
            return { kind: "tint", attrs: { ...el.attrs } };
          case "a:shade":
            return { kind: "shade", attrs: { ...el.attrs } };
          case "a:grayscl":
            return { kind: "grayscl", attrs: {} };
          case "a:alphaMod":
            return { kind: "alphaMod", attrs: { ...el.attrs } };
          case "a:alphaModFix":
            return { kind: "alphaModFix", attrs: { ...el.attrs } };
          case "a:alphaCeiling":
            return { kind: "alphaCeiling", attrs: {} };
          case "a:alphaFloor":
            return { kind: "alphaFloor", attrs: {} };
          case "a:alphaRepl":
            return { kind: "alphaRepl", attrs: { ...el.attrs } };
          case "a:biLevel":
            return { kind: "biLevel", attrs: { ...el.attrs } };
          case "a:lumMod":
            return { kind: "lumMod", attrs: { ...el.attrs } };
          case "a:lumOff":
            return { kind: "lumOff", attrs: { ...el.attrs } };
          case "a:duotone":
            return { kind: "duotone", colors: (el.children || []).filter((c) => c.type === "element").map((c) => parseColor(c, { withMods: !0 })).filter(Boolean) };
          case "a:clrChange": {
            const cf = (el.children || []).find((c) => c.type === "element" && c.name === "a:clrFrom"), ct = (el.children || []).find((c) => c.type === "element" && c.name === "a:clrTo");
            return {
              kind: "clrChange",
              attrs: { ...el.attrs },
              clrFrom: cf ? findFirstColor(cf, { withMods: !0 }) : null,
              clrTo: ct ? findFirstColor(ct, { withMods: !0 }) : null
            };
          }
          case "a:clrRepl":
            return { kind: "clrRepl", color: findFirstColor(el, { withMods: !0 }) };
          default:
            return null;
        }
      }
      function renderColorMod(m) {
        switch (m.kind) {
          case "lum":
            return xml.el("a:lum", m.attrs || {});
          case "tint":
            return xml.el("a:tint", m.attrs || {});
          case "shade":
            return xml.el("a:shade", m.attrs || {});
          case "grayscl":
            return xml.el("a:grayscl", {});
          case "alphaMod":
            return xml.el("a:alphaMod", m.attrs || {});
          case "alphaModFix":
            return xml.el("a:alphaModFix", m.attrs || {});
          case "alphaCeiling":
            return xml.el("a:alphaCeiling", {});
          case "alphaFloor":
            return xml.el("a:alphaFloor", {});
          case "alphaRepl":
            return xml.el("a:alphaRepl", m.attrs || {});
          case "biLevel":
            return xml.el("a:biLevel", m.attrs || {});
          case "lumMod":
            return xml.el("a:lumMod", m.attrs || {});
          case "lumOff":
            return xml.el("a:lumOff", m.attrs || {});
          case "duotone":
            return xml.el("a:duotone", {}, (m.colors || []).map((c) => renderColor(c, { withMods: !0 })));
          case "clrChange":
            return xml.el("a:clrChange", m.attrs || {}, [
              xml.el("a:clrFrom", {}, m.clrFrom ? [renderColor(m.clrFrom, { withMods: !0 })] : []),
              xml.el("a:clrTo", {}, m.clrTo ? [renderColor(m.clrTo, { withMods: !0 })] : [])
            ]);
          case "clrRepl":
            return xml.el("a:clrRepl", {}, m.color ? [renderColor(m.color, { withMods: !0 })] : []);
          default:
            return null;
        }
      }
      function findFirstColor(el, opts) {
        for (const c of el.children || []) {
          if (c.type !== "element")
            continue;
          const local = c.name.replace(/^a:/, "");
          if (COLOR_TAGS.includes(local))
            return parseColor(c, opts);
        }
        return null;
      }
      function srgbClr(hex6) {
        return xml.el("a:srgbClr", { val: String(hex6).replace(/^#/, "").toUpperCase() });
      }
      return {
        COLOR_TAGS,
        parseColor,
        renderColor,
        parseColorMod,
        renderColorMod,
        parseColorMods,
        findFirstColor,
        srgbClr
      };
    }
    function createXlsxColorCodec(xml) {
      function parseColor(el) {
        if (!el)
          return null;
        const a = el.attrs || {}, c = {};
        if (a.rgb)
          c.rgb = a.rgb;
        if (a.theme)
          c.theme = Number(a.theme);
        if (a.tint)
          c.tint = Number(a.tint);
        if (a.indexed)
          c.indexed = Number(a.indexed);
        if (a.auto)
          c.auto = a.auto === "1";
        return c;
      }
      function renderColor(name, c) {
        if (!c)
          return null;
        const a = {};
        if (c.rgb != null)
          a.rgb = c.rgb;
        if (c.theme != null)
          a.theme = String(c.theme);
        if (c.tint != null)
          a.tint = String(c.tint);
        if (c.indexed != null)
          a.indexed = String(c.indexed);
        if (c.auto === !0)
          a.auto = "1";
        return xml.el(name, a);
      }
      return { parseColor, renderColor };
    }
    return {
      NS,
      REL_TYPE,
      CT,
      EMU_PER_INCH: 914400,
      EMU_PER_CM: 360000,
      EMU_PER_PT: 12700,
      EMU_PER_PX_96: 9525,
      toEmu,
      inchesToEmu,
      cmToEmu,
      ptToEmu,
      readBoolAttr,
      writeBoolAttr,
      partExt,
      lookupCT,
      trackUnmodelledParts,
      wordRootAttrs,
      encodeText,
      decodeText,
      createRidAllocator,
      createDmlColorCodec,
      createXlsxColorCodec
    };
  } });
    __register({ name: "opcPackage", dependencies: ["ooxmlErrors","zip","opcContentTypes","opcRelationships","ooxmlShared"], factory: function(errors, zipMod, contentTypesMod, relsMod, shared) {
    const { ParseError, RenderError, ContractError } = errors, DEFAULT_LIMITS = Object.freeze({
      maxParts: 1024,
      maxUncompressed: 268435456,
      maxRatio: 200
    }), LEADING_SLASH_RE = /^\//, { encodeText, decodeText } = shared;
    function bytesToString(u8) {
      return decodeText(u8);
    }
    function stringToBytes(s) {
      return encodeText(s);
    }
    function read(bytes, opts) {
      if (!(bytes instanceof Uint8Array))
        throw new ContractError("opc/invalid-input", "OPC read: bytes must be a Uint8Array", { context: { received: bytes === null ? "null" : typeof bytes } });
      const maxParts = opts && opts.maxParts !== void 0 ? opts.maxParts : DEFAULT_LIMITS.maxParts, maxUncompressed = opts && opts.maxUncompressed !== void 0 ? opts.maxUncompressed : DEFAULT_LIMITS.maxUncompressed, maxRatio = opts && opts.maxRatio !== void 0 ? opts.maxRatio : DEFAULT_LIMITS.maxRatio;
      let partCount = 0, uncompressedTotal = 0;
      const seen = [];
      try {
        zipMod.unzipSync(bytes, {
          filter(entry) {
            partCount++;
            if (maxParts && partCount > maxParts)
              throw new ParseError("opc/zip-bomb", "OPC: too many parts in archive", { context: { limit: "maxParts", max: maxParts } });
            if (entry && typeof entry.originalSize === "number") {
              uncompressedTotal += entry.originalSize;
              if (maxUncompressed && uncompressedTotal > maxUncompressed)
                throw new ParseError("opc/zip-bomb", "OPC: uncompressed payload exceeds limit", { context: {
                  limit: "maxUncompressed",
                  max: maxUncompressed,
                  actual: uncompressedTotal
                } });
              if (maxRatio && entry.size > 0 && entry.originalSize / entry.size > maxRatio)
                throw new ParseError("opc/zip-bomb", "OPC: per-entry compression ratio exceeds limit", { context: {
                  limit: "maxRatio",
                  max: maxRatio,
                  name: entry.name,
                  ratio: entry.originalSize / entry.size
                } });
            }
            seen.push(entry && entry.name);
            return !0;
          }
        });
      } catch (e) {
        if (e && e.code && typeof e.code === "string" && e.code.startsWith("opc/"))
          throw e;
        throw new ParseError("opc/invalid-zip", "OPC: failed to unzip archive: " + (e && e.message), { cause: e });
      }
      let files;
      try {
        files = zipMod.unzipSync(bytes);
      } catch (e) {
        throw new ParseError("opc/invalid-zip", "OPC: failed to unzip archive: " + (e && e.message), { cause: e });
      }
      const ctRaw = files["[Content_Types].xml"];
      if (!ctRaw)
        throw new ParseError("opc/missing-content-types", "OPC: missing [Content_Types].xml", { context: { partName: "[Content_Types].xml" } });
      let contentTypes;
      try {
        contentTypes = contentTypesMod.parse(bytesToString(ctRaw));
      } catch (e) {
        if (e && e.code && typeof e.code === "string" && e.code.startsWith("opc/"))
          throw e;
        throw new ParseError("opc/invalid-content-types", "OPC: failed to parse [Content_Types].xml", { context: { partName: "[Content_Types].xml" }, cause: e });
      }
      const parts = {}, rels = {};
      for (const path of Object.keys(files)) {
        if (path === "[Content_Types].xml")
          continue;
        if (path.endsWith("/"))
          continue;
        const absolute = "/" + path;
        if (isRelsPath(path)) {
          const owner = ownerPartFromRels(path);
          try {
            rels[owner] = relsMod.parse(bytesToString(files[path]));
          } catch (e) {
            throw new ParseError("opc/invalid-rels", "OPC: failed to parse rels", { context: { partName: path, owner }, cause: e });
          }
        } else
          parts[absolute] = files[path];
      }
      return { contentTypes, parts, rels };
    }
    function write(pkg, opts) {
      if (!pkg || typeof pkg !== "object")
        throw new ContractError("opc/invalid-input", "OPC write: pkg must be an object", { context: { received: pkg === null ? "null" : typeof pkg } });
      const files = {};
      try {
        files["[Content_Types].xml"] = stringToBytes(contentTypesMod.serialize(pkg.contentTypes));
      } catch (e) {
        throw new RenderError("opc/render-content-types", "OPC: failed to serialize [Content_Types].xml", { cause: e });
      }
      for (const owner of Object.keys(pkg.rels || {})) {
        const rels = pkg.rels[owner];
        if (!rels || !rels.length)
          continue;
        const path = relsMod.relsPathFor(owner === "/" ? "" : owner);
        try {
          files[path] = stringToBytes(relsMod.serialize(rels));
        } catch (e) {
          throw new RenderError("opc/render-rels", "OPC: failed to serialize rels", { context: { owner, path }, cause: e });
        }
      }
      for (const partName of Object.keys(pkg.parts || {})) {
        const data = pkg.parts[partName];
        files[partName.replace(LEADING_SLASH_RE, "")] = data;
      }
      const mtime = opts && opts.mtime !== void 0 ? opts.mtime : new Date(1980, 0, 1, 0, 0, 0);
      try {
        return zipMod.zipSync(files, { mtime });
      } catch (e) {
        throw new RenderError("opc/zip-failed", "OPC: failed to zip package", { cause: e });
      }
    }
    function empty() {
      return {
        contentTypes: {
          defaults: {
            rels: "application/vnd.openxmlformats-package.relationships+xml",
            xml: "application/xml"
          },
          overrides: {}
        },
        parts: {},
        rels: { "/": [] }
      };
    }
    function isRelsPath(zipPath) {
      if (zipPath === "_rels/.rels")
        return !0;
      const slash = zipPath.lastIndexOf("/");
      if (slash < 0)
        return !1;
      const dir = zipPath.slice(0, slash);
      return zipPath.endsWith(".rels") && dir.endsWith("/_rels");
    }
    function ownerPartFromRels(zipPath) {
      if (zipPath === "_rels/.rels")
        return "/";
      const noExt = zipPath.slice(0, -5), idx = noExt.lastIndexOf("/_rels/"), baseDir = noExt.slice(0, idx), fileName = noExt.slice(idx + 7);
      return "/" + (baseDir ? baseDir + "/" : "") + fileName;
    }
    function setPart(pkg, partName, data, contentType) {
      pkg.parts[partName] = data;
      if (contentType)
        pkg.contentTypes.overrides[partName] = contentType;
      return pkg;
    }
    function setRels(pkg, sourcePart, rels) {
      pkg.rels[sourcePart] = rels;
      return pkg;
    }
    return {
      read,
      write,
      empty,
      setPart,
      setRels,
      bytesToString,
      stringToBytes,
      isRelsPath,
      ownerPartFromRels,
      defaultLimits: DEFAULT_LIMITS
    };
  } });
    __register({ name: "ooxmlMath", dependencies: ["ooxmlErrors","xml"], factory: function(errors, xml) {
    const { ParseError } = errors;
    function parseSlot(parentEl) {
      const out = [];
      if (!parentEl)
        return out;
      for (const c of parentEl.children) {
        if (c.type !== "element")
          continue;
        const node = parseMathElement(c);
        if (node)
          out.push(node);
      }
      return out;
    }
    function renderSlot(name, elements) {
      return xml.el(name, {}, (elements || []).map(renderMathElement));
    }
    function parseMathRun(rEl) {
      const out = { type: "mathRun", text: "" }, rPrEl = xml.findChild(rEl, "m:rPr");
      if (rPrEl) {
        const sty = xml.findChild(rPrEl, "m:sty");
        if (sty)
          out.rPr = { sty: sty.attrs["m:val"] };
      }
      for (const c of rEl.children) {
        if (c.type !== "element")
          continue;
        if (c.name === "m:t")
          out.text += xml.textContent(c);
      }
      return out;
    }
    function renderMathRun(r) {
      const children = [];
      if (r.rPr) {
        const inner = [];
        if (r.rPr.sty)
          inner.push(xml.el("m:sty", { "m:val": r.rPr.sty }));
        if (inner.length)
          children.push(xml.el("m:rPr", {}, inner));
      }
      children.push(xml.el("m:t", { "xml:space": "preserve" }, [xml.text(r.text || "")]));
      return xml.el("m:r", {}, children);
    }
    function parseFrac(fEl) {
      return {
        type: "frac",
        numerator: parseSlot(xml.findChild(fEl, "m:num")),
        denominator: parseSlot(xml.findChild(fEl, "m:den"))
      };
    }
    function renderFrac(f) {
      return xml.el("m:f", {}, [
        renderSlot("m:num", f.numerator),
        renderSlot("m:den", f.denominator)
      ]);
    }
    function parseSSup(el) {
      return {
        type: "sSup",
        base: parseSlot(xml.findChild(el, "m:e")),
        sup: parseSlot(xml.findChild(el, "m:sup"))
      };
    }
    function renderSSup(n) {
      return xml.el("m:sSup", {}, [
        renderSlot("m:e", n.base),
        renderSlot("m:sup", n.sup)
      ]);
    }
    function parseSSub(el) {
      return {
        type: "sSub",
        base: parseSlot(xml.findChild(el, "m:e")),
        sub: parseSlot(xml.findChild(el, "m:sub"))
      };
    }
    function renderSSub(n) {
      return xml.el("m:sSub", {}, [
        renderSlot("m:e", n.base),
        renderSlot("m:sub", n.sub)
      ]);
    }
    function parseSSubSup(el) {
      return {
        type: "sSubSup",
        base: parseSlot(xml.findChild(el, "m:e")),
        sub: parseSlot(xml.findChild(el, "m:sub")),
        sup: parseSlot(xml.findChild(el, "m:sup"))
      };
    }
    function renderSSubSup(n) {
      return xml.el("m:sSubSup", {}, [
        renderSlot("m:e", n.base),
        renderSlot("m:sub", n.sub),
        renderSlot("m:sup", n.sup)
      ]);
    }
    function parseRad(el) {
      return {
        type: "rad",
        degree: parseSlot(xml.findChild(el, "m:deg")),
        base: parseSlot(xml.findChild(el, "m:e"))
      };
    }
    function renderRad(n) {
      return xml.el("m:rad", {}, [
        renderSlot("m:deg", n.degree),
        renderSlot("m:e", n.base)
      ]);
    }
    function parseNary(el) {
      const out = {
        type: "nary",
        op: "\u2211",
        sub: parseSlot(xml.findChild(el, "m:sub")),
        sup: parseSlot(xml.findChild(el, "m:sup")),
        body: parseSlot(xml.findChild(el, "m:e"))
      }, naryPr = xml.findChild(el, "m:naryPr");
      if (naryPr) {
        const chr = xml.findChild(naryPr, "m:chr");
        if (chr && chr.attrs["m:val"])
          out.op = chr.attrs["m:val"];
      }
      return out;
    }
    function renderNary(n) {
      const children = [];
      children.push(xml.el("m:naryPr", {}, [
        xml.el("m:chr", { "m:val": n.op || "\u2211" })
      ]));
      children.push(renderSlot("m:sub", n.sub));
      children.push(renderSlot("m:sup", n.sup));
      children.push(renderSlot("m:e", n.body));
      return xml.el("m:nary", {}, children);
    }
    function parseDelim(el) {
      const out = { type: "d", children: [] }, dPr = xml.findChild(el, "m:dPr");
      if (dPr) {
        const beg = xml.findChild(dPr, "m:begChr"), end = xml.findChild(dPr, "m:endChr"), sep = xml.findChild(dPr, "m:sepChr");
        if (beg && beg.attrs["m:val"])
          out.open = beg.attrs["m:val"];
        if (end && end.attrs["m:val"])
          out.close = end.attrs["m:val"];
        if (sep && sep.attrs["m:val"])
          out.sep = sep.attrs["m:val"];
      }
      for (const c of el.children) {
        if (c.type !== "element")
          continue;
        if (c.name === "m:e")
          out.children.push(parseSlot(c));
      }
      return out;
    }
    function renderDelim(n) {
      const children = [], pr = [];
      if (n.open != null)
        pr.push(xml.el("m:begChr", { "m:val": n.open }));
      if (n.close != null)
        pr.push(xml.el("m:endChr", { "m:val": n.close }));
      if (n.sep != null)
        pr.push(xml.el("m:sepChr", { "m:val": n.sep }));
      if (pr.length)
        children.push(xml.el("m:dPr", {}, pr));
      for (const slot of n.children || [])
        children.push(renderSlot("m:e", slot));
      return xml.el("m:d", {}, children);
    }
    function parseFunc(el) {
      return {
        type: "func",
        name: parseSlot(xml.findChild(el, "m:fName")),
        body: parseSlot(xml.findChild(el, "m:e"))
      };
    }
    function renderFunc(n) {
      return xml.el("m:func", {}, [
        renderSlot("m:fName", n.name),
        renderSlot("m:e", n.body)
      ]);
    }
    function parseMatrix(el) {
      const out = { type: "m", rows: [] };
      for (const r of xml.findAll(el, "m:mr")) {
        const row = [];
        for (const c of xml.findAll(r, "m:e"))
          row.push(parseSlot(c));
        out.rows.push(row);
      }
      return out;
    }
    function renderMatrix(n) {
      const rows = (n.rows || []).map((row) => xml.el("m:mr", {}, row.map((cell) => renderSlot("m:e", cell))));
      return xml.el("m:m", {}, rows);
    }
    function parseAcc(el) {
      const out = { type: "acc", base: parseSlot(xml.findChild(el, "m:e")) }, accPr = xml.findChild(el, "m:accPr");
      if (accPr) {
        const chr = xml.findChild(accPr, "m:chr");
        if (chr && chr.attrs["m:val"])
          out.char = chr.attrs["m:val"];
      }
      return out;
    }
    function renderAcc(n) {
      const children = [];
      if (n.char != null)
        children.push(xml.el("m:accPr", {}, [
          xml.el("m:chr", { "m:val": n.char })
        ]));
      children.push(renderSlot("m:e", n.base));
      return xml.el("m:acc", {}, children);
    }
    function parseBar(el) {
      const out = { type: "bar", base: parseSlot(xml.findChild(el, "m:e")) }, barPr = xml.findChild(el, "m:barPr");
      if (barPr) {
        const pos = xml.findChild(barPr, "m:pos");
        if (pos && pos.attrs["m:val"])
          out.pos = pos.attrs["m:val"];
      }
      return out;
    }
    function renderBar(n) {
      const children = [];
      if (n.pos)
        children.push(xml.el("m:barPr", {}, [
          xml.el("m:pos", { "m:val": n.pos })
        ]));
      children.push(renderSlot("m:e", n.base));
      return xml.el("m:bar", {}, children);
    }
    function parseBox(el) {
      return { type: "box", base: parseSlot(xml.findChild(el, "m:e")) };
    }
    function renderBox(n) {
      return xml.el("m:box", {}, [renderSlot("m:e", n.base)]);
    }
    function parseMathElement(el) {
      switch (el.name) {
        case "m:r":
          return parseMathRun(el);
        case "m:f":
          return parseFrac(el);
        case "m:sSup":
          return parseSSup(el);
        case "m:sSub":
          return parseSSub(el);
        case "m:sSubSup":
          return parseSSubSup(el);
        case "m:rad":
          return parseRad(el);
        case "m:nary":
          return parseNary(el);
        case "m:d":
          return parseDelim(el);
        case "m:func":
          return parseFunc(el);
        case "m:m":
          return parseMatrix(el);
        case "m:acc":
          return parseAcc(el);
        case "m:bar":
          return parseBar(el);
        case "m:box":
          return parseBox(el);
        case "m:oMath":
          return parseOMath(el);
        default:
          return { type: "mathUnknown", node: el };
      }
    }
    function renderMathElement(n) {
      switch (n.type) {
        case "mathRun":
          return renderMathRun(n);
        case "frac":
          return renderFrac(n);
        case "sSup":
          return renderSSup(n);
        case "sSub":
          return renderSSub(n);
        case "sSubSup":
          return renderSSubSup(n);
        case "rad":
          return renderRad(n);
        case "nary":
          return renderNary(n);
        case "d":
          return renderDelim(n);
        case "func":
          return renderFunc(n);
        case "m":
          return renderMatrix(n);
        case "acc":
          return renderAcc(n);
        case "bar":
          return renderBar(n);
        case "box":
          return renderBox(n);
        case "oMath":
          return renderOMath(n);
        case "mathUnknown":
          return n.node;
        default:
          throw new ParseError("math/unknown-node-type", `ooxmlMath: unknown type ${n.type}`, { context: { type: n && n.type } });
      }
    }
    function parseOMath(el) {
      return { type: "oMath", children: parseSlot(el) };
    }
    function renderOMath(n) {
      const children = (n.children || []).map(renderMathElement);
      return xml.el("m:oMath", {}, children);
    }
    function parseOMathPara(el) {
      const out = { type: "oMathPara", children: [] };
      for (const c of el.children) {
        if (c.type !== "element")
          continue;
        if (c.name === "m:oMath")
          out.children.push(parseOMath(c));
      }
      return out;
    }
    function renderOMathPara(n) {
      return xml.el("m:oMathPara", {}, (n.children || []).map(renderOMath));
    }
    function r(text, sty) {
      const out = { type: "mathRun", text: String(text || "") };
      if (sty)
        out.rPr = { sty };
      return out;
    }
    function frac(numerator, denominator) {
      return {
        type: "frac",
        numerator: toArray(numerator),
        denominator: toArray(denominator)
      };
    }
    function sup(base, sup) {
      return { type: "sSup", base: toArray(base), sup: toArray(sup) };
    }
    function sub(base, sub) {
      return { type: "sSub", base: toArray(base), sub: toArray(sub) };
    }
    function subSup(base, sub, sup) {
      return {
        type: "sSubSup",
        base: toArray(base),
        sub: toArray(sub),
        sup: toArray(sup)
      };
    }
    function rad(base, degree) {
      return {
        type: "rad",
        degree: degree != null ? toArray(degree) : [],
        base: toArray(base)
      };
    }
    function nary(op, sub, sup, body) {
      return {
        type: "nary",
        op,
        sub: toArray(sub),
        sup: toArray(sup),
        body: toArray(body)
      };
    }
    function delim(content, opts = {}) {
      const slots = Array.isArray(content) && Array.isArray(content[0]) ? content : [toArray(content)];
      return {
        type: "d",
        ...opts.open != null ? { open: opts.open } : {},
        ...opts.close != null ? { close: opts.close } : {},
        ...opts.sep != null ? { sep: opts.sep } : {},
        children: slots
      };
    }
    function func(name, body) {
      return { type: "func", name: toArray(name), body: toArray(body) };
    }
    function matrix(rows) {
      return {
        type: "m",
        rows: (rows || []).map((row) => row.map(toArray))
      };
    }
    function toArray(x) {
      if (x == null)
        return [];
      return Array.isArray(x) ? x : [x];
    }
    function oMath(...children) {
      const flat = [];
      for (const c of children)
        if (Array.isArray(c))
          flat.push(...c);
        else
          flat.push(c);
      return { type: "oMath", children: flat };
    }
    function oMathPara(...maths) {
      return {
        type: "oMathPara",
        children: maths.map((m) => m.type === "oMath" ? m : oMath(m))
      };
    }
    return {
      parseOMath,
      renderOMath,
      parseOMathPara,
      renderOMathPara,
      parseMathElement,
      renderMathElement,
      r,
      frac,
      sup,
      sub,
      subSup,
      rad,
      nary,
      delim,
      func,
      matrix,
      oMath,
      oMathPara,
      M_NS: "http://schemas.openxmlformats.org/officeDocument/2006/math"
    };
  } });
    __register({ name: "drawingml", dependencies: ["xml","ooxmlMath","ooxmlShared"], factory: function(xml, mathMod, shared) {
    const {
      NS,
      EMU_PER_INCH,
      EMU_PER_CM,
      EMU_PER_PT,
      inchesToEmu,
      cmToEmu,
      ptToEmu,
      readBoolAttr,
      writeBoolAttr
    } = shared, A_NS = NS.A, srgbClr = shared.createDmlColorCodec(xml).srgbClr;
    function parseRunProperties(rPrEl) {
      if (!rPrEl)
        return;
      const a = rPrEl.attrs, out = {};
      if (a.lang)
        out.lang = a.lang;
      if (a.sz != null)
        out.size = Number(a.sz);
      if (a.b != null)
        out.bold = readBoolAttr(a.b);
      if (a.i != null)
        out.italic = readBoolAttr(a.i);
      if (a.strike)
        out.strike = a.strike;
      if (a.u)
        out.underline = a.u;
      if (a.baseline != null)
        out.baseline = Number(a.baseline);
      const extras = [];
      for (const c of rPrEl.children) {
        if (c.type !== "element")
          continue;
        if (c.name === "a:solidFill") {
          const cl = c.children.find((n) => n.type === "element" && n.name === "a:srgbClr");
          if (cl)
            out.color = cl.attrs.val;
          else
            extras.push(c);
        } else if (c.name === "a:latin")
          out.font = c.attrs.typeface;
        else
          extras.push(c);
      }
      if (extras.length)
        out._extras = extras;
      return out;
    }
    function renderRunProperties(rPr) {
      if (!rPr)
        return null;
      const a = {};
      if (rPr.lang)
        a.lang = rPr.lang;
      if (rPr.size != null)
        a.sz = String(rPr.size);
      if (rPr.bold != null)
        a.b = writeBoolAttr(rPr.bold);
      if (rPr.italic != null)
        a.i = writeBoolAttr(rPr.italic);
      if (rPr.strike)
        a.strike = rPr.strike;
      if (rPr.underline)
        a.u = rPr.underline;
      if (rPr.baseline != null)
        a.baseline = String(rPr.baseline);
      const children = [];
      if (rPr.color)
        children.push(xml.el("a:solidFill", {}, [srgbClr(rPr.color)]));
      if (rPr.font)
        children.push(xml.el("a:latin", { typeface: rPr.font }));
      if (rPr._extras)
        for (const ex of rPr._extras)
          children.push(ex);
      return xml.el("a:rPr", a, children);
    }
    function parseParagraphProperties(pPrEl) {
      if (!pPrEl)
        return;
      const a = pPrEl.attrs, out = {};
      if (a.lvl != null)
        out.level = Number(a.lvl);
      if (a.algn)
        out.align = a.algn;
      if (a.indent != null)
        out.indent = Number(a.indent);
      if (a.marL != null)
        out.marL = Number(a.marL);
      const extras = [];
      for (const c of pPrEl.children) {
        if (c.type !== "element")
          continue;
        if (c.name === "a:buNone")
          out.bullet = "none";
        else if (c.name === "a:buChar")
          out.bullet = { char: c.attrs.char };
        else if (c.name === "a:buAutoNum")
          out.bullet = { autoNumType: c.attrs.type };
        else if (c.name === "a:defRPr")
          out.defRPr = parseRunProperties(c);
        else
          extras.push(c);
      }
      if (extras.length)
        out._extras = extras;
      return out;
    }
    function renderParagraphProperties(pPr) {
      if (!pPr)
        return null;
      const a = {};
      if (pPr.level != null)
        a.lvl = String(pPr.level);
      if (pPr.align)
        a.algn = pPr.align;
      if (pPr.indent != null)
        a.indent = String(pPr.indent);
      if (pPr.marL != null)
        a.marL = String(pPr.marL);
      const children = [];
      if (pPr.bullet === "none")
        children.push(xml.el("a:buNone", {}));
      else if (pPr.bullet && pPr.bullet.char)
        children.push(xml.el("a:buChar", { char: pPr.bullet.char }));
      else if (pPr.bullet && pPr.bullet.autoNumType)
        children.push(xml.el("a:buAutoNum", { type: pPr.bullet.autoNumType }));
      if (pPr.defRPr) {
        const dpr = renderRunProperties(pPr.defRPr);
        if (dpr)
          children.push(xml.el("a:defRPr", dpr.attrs, dpr.children));
      }
      if (pPr._extras)
        for (const ex of pPr._extras)
          children.push(ex);
      if (!Object.keys(a).length && !children.length)
        return null;
      return xml.el("a:pPr", a, children);
    }
    function parseRun(rEl) {
      const rPrEl = xml.findChild(rEl, "a:rPr"), tEl = xml.findChild(rEl, "a:t"), out = { type: "text", value: tEl ? xml.textContent(tEl) : "" }, rPr = parseRunProperties(rPrEl);
      if (rPr)
        out.rPr = rPr;
      return out;
    }
    function renderRun(run) {
      const children = [], rPrEl = renderRunProperties(run.rPr);
      if (rPrEl)
        children.push(rPrEl);
      children.push(xml.el("a:t", {}, [xml.text(run.value || "")]));
      return xml.el("a:r", {}, children);
    }
    function parseField(fEl) {
      const out = {
        type: "field",
        id: fEl.attrs.id
      };
      if (fEl.attrs.type)
        out.fieldType = fEl.attrs.type;
      const rPrEl = xml.findChild(fEl, "a:rPr"), tEl = xml.findChild(fEl, "a:t"), rPr = parseRunProperties(rPrEl);
      if (rPr)
        out.rPr = rPr;
      if (tEl)
        out.value = xml.textContent(tEl);
      return out;
    }
    function renderField(f) {
      const a = { id: f.id };
      if (f.fieldType)
        a.type = f.fieldType;
      const children = [], rPrEl = renderRunProperties(f.rPr);
      if (rPrEl)
        children.push(rPrEl);
      if (f.value != null)
        children.push(xml.el("a:t", {}, [xml.text(f.value)]));
      return xml.el("a:fld", a, children);
    }
    function parseBreak(brEl) {
      const out = { type: "break" }, rPrEl = xml.findChild(brEl, "a:rPr"), rPr = parseRunProperties(rPrEl);
      if (rPr)
        out.rPr = rPr;
      return out;
    }
    function renderBreak(b) {
      const rPrEl = renderRunProperties(b.rPr);
      return xml.el("a:br", {}, rPrEl ? [rPrEl] : []);
    }
    function parseParagraph(pEl) {
      const pPrEl = xml.findChild(pEl, "a:pPr"), pPr = parseParagraphProperties(pPrEl), runs = [], extras = [];
      for (const c of pEl.children) {
        if (c.type !== "element")
          continue;
        if (c.name === "a:pPr")
          continue;
        if (c.name === "a:r")
          runs.push(parseRun(c));
        else if (c.name === "a:br")
          runs.push(parseBreak(c));
        else if (c.name === "a:fld")
          runs.push(parseField(c));
        else if (c.name === "m:oMath" && mathMod)
          runs.push(mathMod.parseOMath(c));
        else if (c.name === "a:endParaRPr")
          extras.push(c);
        else
          extras.push(c);
      }
      const out = { runs };
      if (pPr)
        out.pPr = pPr;
      if (extras.length)
        out._extras = extras;
      return out;
    }
    function renderParagraph(p) {
      const children = [], pPrEl = renderParagraphProperties(p.pPr);
      if (pPrEl)
        children.push(pPrEl);
      for (const r of p.runs || [])
        if (r.type === "text")
          children.push(renderRun(r));
        else if (r.type === "break")
          children.push(renderBreak(r));
        else if (r.type === "field")
          children.push(renderField(r));
        else if (r.type === "oMath" && mathMod)
          children.push(mathMod.renderOMath(r));
      if (p._extras)
        for (const ex of p._extras)
          children.push(ex);
      return xml.el("a:p", {}, children);
    }
    function parseTextBody(tbEl) {
      const out = { paragraphs: [] };
      for (const c of tbEl.children) {
        if (c.type !== "element")
          continue;
        if (c.name === "a:bodyPr")
          out.bodyPr = c;
        else if (c.name === "a:lstStyle")
          out.lstStyle = c;
        else if (c.name === "a:p")
          out.paragraphs.push(parseParagraph(c));
      }
      return out;
    }
    function renderTextBody(tb, rootTag = "a:txBody") {
      const children = [];
      children.push(tb.bodyPr || xml.el("a:bodyPr", {}));
      children.push(tb.lstStyle || xml.el("a:lstStyle", {}));
      for (const p of tb.paragraphs || [])
        children.push(renderParagraph(p));
      return xml.el(rootTag, {}, children);
    }
    function textBodyFromString(text, rPr) {
      const run = { type: "text", value: text };
      if (rPr)
        run.rPr = rPr;
      return { paragraphs: [{ runs: [run] }] };
    }
    function textParagraph(text) {
      return xml.el("a:p", {}, [
        xml.el("a:r", {}, [
          xml.el("a:t", {}, [xml.text(text)])
        ])
      ]);
    }
    return {
      A_NS,
      EMU_PER_INCH,
      EMU_PER_CM,
      EMU_PER_PT,
      inchesToEmu,
      cmToEmu,
      ptToEmu,
      srgbClr,
      textParagraph,
      textBodyFromString,
      parseRunProperties,
      renderRunProperties,
      parseParagraphProperties,
      renderParagraphProperties,
      parseRun,
      renderRun,
      parseBreak,
      renderBreak,
      parseField,
      renderField,
      parseParagraph,
      renderParagraph,
      parseTextBody,
      renderTextBody
    };
  } });
    __register({ name: "pptxPicture", dependencies: ["xml","ooxmlShared"], factory: function(xml, shared) {
    const { NS, REL_TYPE } = shared, A_NS = NS.A, REL_TYPE_IMAGE = REL_TYPE.IMAGE;
    function sniffImageType(bytes) {
      if (!bytes || bytes.length < 4)
        return "application/octet-stream";
      const b = bytes;
      if (b[0] === 137 && b[1] === 80 && b[2] === 78 && b[3] === 71)
        return "image/png";
      if (b[0] === 255 && b[1] === 216 && b[2] === 255)
        return "image/jpeg";
      if (b[0] === 71 && b[1] === 73 && b[2] === 70 && b[3] === 56)
        return "image/gif";
      if (b[0] === 66 && b[1] === 77)
        return "image/bmp";
      if (b[0] === 82 && b[1] === 73 && b[2] === 70 && b[3] === 70 && b.length >= 12 && b[8] === 87 && b[9] === 69 && b[10] === 66 && b[11] === 80)
        return "image/webp";
      if (b[0] === 73 && b[1] === 73 && b[2] === 42 && b[3] === 0 || b[0] === 77 && b[1] === 77 && b[2] === 0 && b[3] === 42)
        return "image/tiff";
      return "application/octet-stream";
    }
    function extensionFor(contentType) {
      switch (contentType) {
        case "image/png":
          return "png";
        case "image/jpeg":
          return "jpg";
        case "image/gif":
          return "gif";
        case "image/bmp":
          return "bmp";
        case "image/webp":
          return "webp";
        case "image/tiff":
          return "tiff";
        case "image/svg+xml":
          return "svg";
        case "image/x-emf":
          return "emf";
        case "image/x-wmf":
          return "wmf";
        default:
          return "bin";
      }
    }
    function extToContentType(ext) {
      switch (ext) {
        case "png":
          return "image/png";
        case "jpg":
        case "jpeg":
          return "image/jpeg";
        case "gif":
          return "image/gif";
        case "bmp":
          return "image/bmp";
        case "webp":
          return "image/webp";
        case "tiff":
          return "image/tiff";
        case "svg":
          return "image/svg+xml";
        case "emf":
          return "image/x-emf";
        case "wmf":
          return "image/x-wmf";
        default:
          return "application/octet-stream";
      }
    }
    const { EMU_PER_INCH, EMU_PER_CM, EMU_PER_PT, EMU_PER_PX_96, toEmu } = shared;
    function parsePicture(picEl) {
      const out = { type: "picture" }, nvPicPr = xml.findChild(picEl, "p:nvPicPr");
      if (nvPicPr) {
        const cNvPr = xml.findChild(nvPicPr, "p:cNvPr");
        if (cNvPr) {
          if (cNvPr.attrs.id != null)
            out.id = Number(cNvPr.attrs.id);
          if (cNvPr.attrs.name)
            out.name = cNvPr.attrs.name;
          if (cNvPr.attrs.descr)
            out.description = cNvPr.attrs.descr;
          if (cNvPr.attrs.title)
            out.title = cNvPr.attrs.title;
        }
      }
      const blipFill = xml.findChild(picEl, "p:blipFill");
      if (blipFill) {
        const blip = xml.findChild(blipFill, "a:blip");
        if (blip) {
          if (blip.attrs["r:embed"])
            out.embedRef = blip.attrs["r:embed"];
          if (blip.attrs["r:link"])
            out.linkRef = blip.attrs["r:link"];
        }
      }
      const spPr = xml.findChild(picEl, "p:spPr");
      if (spPr) {
        const xfrm = xml.findChild(spPr, "a:xfrm");
        if (xfrm) {
          const off = xml.findChild(xfrm, "a:off"), ext = xml.findChild(xfrm, "a:ext");
          if (off) {
            if (off.attrs.x != null)
              out.offsetX = Number(off.attrs.x);
            if (off.attrs.y != null)
              out.offsetY = Number(off.attrs.y);
          }
          if (ext) {
            if (ext.attrs.cx != null)
              out.cx = Number(ext.attrs.cx);
            if (ext.attrs.cy != null)
              out.cy = Number(ext.attrs.cy);
          }
        }
        const prst = xml.findChild(spPr, "a:prstGeom");
        if (prst && prst.attrs.prst)
          out.prstGeom = prst.attrs.prst;
      }
      return out;
    }
    function renderPicture(p) {
      const cNvPrAttrs = {
        id: String(p.id != null ? p.id : 2),
        name: p.name || "Picture"
      };
      if (p.description)
        cNvPrAttrs.descr = p.description;
      if (p.title)
        cNvPrAttrs.title = p.title;
      const blipAttrs = {};
      if (p.embedRef)
        blipAttrs["r:embed"] = p.embedRef;
      else if (p.linkRef)
        blipAttrs["r:link"] = p.linkRef;
      return xml.el("p:pic", {}, [
        xml.el("p:nvPicPr", {}, [
          xml.el("p:cNvPr", cNvPrAttrs),
          xml.el("p:cNvPicPr", {}, [
            xml.el("a:picLocks", { noChangeAspect: "1" })
          ]),
          xml.el("p:nvPr", {})
        ]),
        xml.el("p:blipFill", {}, [
          xml.el("a:blip", blipAttrs),
          xml.el("a:stretch", {}, [xml.el("a:fillRect", {})])
        ]),
        xml.el("p:spPr", {}, [
          xml.el("a:xfrm", {}, [
            xml.el("a:off", {
              x: String(p.offsetX || 0),
              y: String(p.offsetY || 0)
            }),
            xml.el("a:ext", {
              cx: String(p.cx ?? 1828800),
              cy: String(p.cy ?? 1371600)
            })
          ]),
          xml.el("a:prstGeom", { prst: p.prstGeom || "rect" }, [
            xml.el("a:avLst", {})
          ])
        ])
      ]);
    }
    function image(data, opts = {}) {
      const contentType = opts.contentType || sniffImageType(data), cx = toEmu(opts.cx || "4in"), cy = toEmu(opts.cy || cx * 0.75), out = {
        type: "picture",
        cx,
        cy,
        name: opts.name || "Picture",
        prstGeom: opts.prstGeom || "rect",
        image: { data, contentType }
      };
      if (opts.description)
        out.description = opts.description;
      if (opts.title)
        out.title = opts.title;
      if (opts.offsetX != null)
        out.offsetX = toEmu(opts.offsetX);
      if (opts.offsetY != null)
        out.offsetY = toEmu(opts.offsetY);
      if (opts.id != null)
        out.id = opts.id;
      if (opts.rId)
        out.embedRef = opts.rId;
      return out;
    }
    return {
      parsePicture,
      renderPicture,
      image,
      sniffImageType,
      extensionFor,
      extToContentType,
      toEmu,
      EMU_PER_INCH,
      EMU_PER_CM,
      EMU_PER_PT,
      EMU_PER_PX_96,
      REL_TYPE_IMAGE,
      A_NS
    };
  } });
    __register({ name: "pptxTable", dependencies: ["xml","drawingml","ooxmlShared"], factory: function(xml, dml, shared) {
    const { NS, readBoolAttr, writeBoolAttr } = shared, A_NS = NS.A, R_NS = NS.R;
    function parseCell(tcEl) {
      const out = {}, extras = [];
      for (const k of ["gridSpan", "rowSpan"])
        if (tcEl.attrs[k] != null)
          out[k] = Number(tcEl.attrs[k]);
      for (const k of ["hMerge", "vMerge"])
        if (tcEl.attrs[k] != null)
          out[k] = readBoolAttr(tcEl.attrs[k]);
      for (const c of tcEl.children) {
        if (c.type !== "element")
          continue;
        if (c.name === "a:txBody")
          out.txBody = dml.parseTextBody(c);
        else if (c.name === "a:tcPr")
          out.tcPr = c;
        else
          extras.push(c);
      }
      if (extras.length)
        out._extras = extras;
      return out;
    }
    function renderCell(cell) {
      const a = {};
      if (cell.gridSpan != null)
        a.gridSpan = String(cell.gridSpan);
      if (cell.rowSpan != null)
        a.rowSpan = String(cell.rowSpan);
      if (cell.hMerge != null)
        a.hMerge = writeBoolAttr(cell.hMerge);
      if (cell.vMerge != null)
        a.vMerge = writeBoolAttr(cell.vMerge);
      const children = [];
      if (cell.txBody)
        children.push(dml.renderTextBody(cell.txBody, "a:txBody"));
      else
        children.push(xml.el("a:txBody", {}, [
          xml.el("a:bodyPr", {}),
          xml.el("a:lstStyle", {}),
          xml.el("a:p", {})
        ]));
      children.push(cell.tcPr || xml.el("a:tcPr", {}));
      if (cell._extras)
        for (const ex of cell._extras)
          children.push(ex);
      return xml.el("a:tc", a, children);
    }
    function parseRow(trEl) {
      const out = {
        height: trEl.attrs.h != null ? Number(trEl.attrs.h) : 370840,
        cells: []
      };
      for (const c of trEl.children) {
        if (c.type !== "element")
          continue;
        if (c.name === "a:tc")
          out.cells.push(parseCell(c));
      }
      return out;
    }
    function renderRow(row) {
      return xml.el("a:tr", { h: String(row.height ?? 370840) }, (row.cells || []).map(renderCell));
    }
    const FLAG_ATTRS = [
      "firstRow",
      "lastRow",
      "firstCol",
      "lastCol",
      "bandRow",
      "bandCol"
    ];
    function parseTable(tblEl) {
      const out = { columns: [], rows: [] }, tblPr = xml.findChild(tblEl, "a:tblPr");
      if (tblPr) {
        const flags = {};
        for (const k of FLAG_ATTRS)
          if (tblPr.attrs[k] != null)
            flags[k] = readBoolAttr(tblPr.attrs[k]);
        if (Object.keys(flags).length)
          out.flags = flags;
        const styleId = xml.findChild(tblPr, "a:tableStyleId");
        if (styleId)
          out.tableStyleId = xml.textContent(styleId);
      }
      const grid = xml.findChild(tblEl, "a:tblGrid");
      if (grid)
        for (const col of xml.findAll(grid, "a:gridCol"))
          out.columns.push({
            width: col.attrs.w != null ? Number(col.attrs.w) : 0
          });
      for (const tr of xml.findAll(tblEl, "a:tr"))
        out.rows.push(parseRow(tr));
      return out;
    }
    function renderTable(t) {
      const tblPrAttrs = {};
      for (const k of FLAG_ATTRS)
        if (t.flags && t.flags[k] != null)
          tblPrAttrs[k] = writeBoolAttr(t.flags[k]);
      const tblPrChildren = [];
      if (t.tableStyleId)
        tblPrChildren.push(xml.el("a:tableStyleId", {}, [xml.text(t.tableStyleId)]));
      const tblGridChildren = (t.columns || []).map((col) => xml.el("a:gridCol", { w: String(col.width ?? 3000000) }));
      return xml.el("a:tbl", {}, [
        xml.el("a:tblPr", tblPrAttrs, tblPrChildren),
        xml.el("a:tblGrid", {}, tblGridChildren),
        ...(t.rows || []).map(renderRow)
      ]);
    }
    function parseGraphicFrame(gfEl) {
      const graphic = xml.findChild(gfEl, "a:graphic");
      if (!graphic)
        return null;
      const gd = xml.findChild(graphic, "a:graphicData");
      if (!gd || gd.attrs.uri !== "http://schemas.openxmlformats.org/drawingml/2006/table")
        return null;
      const tbl = xml.findChild(gd, "a:tbl");
      if (!tbl)
        return null;
      const out = parseTable(tbl);
      out.type = "table";
      const nv = xml.findChild(gfEl, "p:nvGraphicFramePr");
      if (nv) {
        const cNvPr = xml.findChild(nv, "p:cNvPr");
        if (cNvPr) {
          if (cNvPr.attrs.id != null)
            out.id = Number(cNvPr.attrs.id);
          if (cNvPr.attrs.name)
            out.name = cNvPr.attrs.name;
        }
      }
      const xfrm = xml.findChild(gfEl, "p:xfrm");
      if (xfrm) {
        const off = xml.findChild(xfrm, "a:off"), ext = xml.findChild(xfrm, "a:ext");
        if (off) {
          if (off.attrs.x != null)
            out.offsetX = Number(off.attrs.x);
          if (off.attrs.y != null)
            out.offsetY = Number(off.attrs.y);
        }
        if (ext) {
          if (ext.attrs.cx != null)
            out.cx = Number(ext.attrs.cx);
          if (ext.attrs.cy != null)
            out.cy = Number(ext.attrs.cy);
        }
      }
      return out;
    }
    function renderGraphicFrame(t) {
      const cNvPrAttrs = {
        id: String(t.id != null ? t.id : 4),
        name: t.name || "Table"
      };
      return xml.el("p:graphicFrame", {}, [
        xml.el("p:nvGraphicFramePr", {}, [
          xml.el("p:cNvPr", cNvPrAttrs),
          xml.el("p:cNvGraphicFramePr", {}, [
            xml.el("a:graphicFrameLocks", { noGrp: "1" })
          ]),
          xml.el("p:nvPr", {})
        ]),
        xml.el("p:xfrm", {}, [
          xml.el("a:off", {
            x: String(t.offsetX || 0),
            y: String(t.offsetY || 0)
          }),
          xml.el("a:ext", {
            cx: String(t.cx ?? 6000000),
            cy: String(t.cy ?? 1500000)
          })
        ]),
        xml.el("a:graphic", {}, [
          xml.el("a:graphicData", { uri: "http://schemas.openxmlformats.org/drawingml/2006/table" }, [renderTable(t)])
        ])
      ]);
    }
    function tableFromRows(rows, opts = {}) {
      const ncols = rows[0] ? rows[0].length : 0, colWidth = opts.colWidth || (ncols ? Math.floor(6000000 / ncols) : 3000000);
      return {
        type: "table",
        cx: opts.cx || ncols * colWidth,
        cy: opts.cy || rows.length * 370840,
        offsetX: opts.offsetX || 0,
        offsetY: opts.offsetY || 0,
        tableStyleId: opts.tableStyleId,
        flags: opts.flags || (rows.length > 0 ? { firstRow: !0, bandRow: !0 } : void 0),
        columns: Array(ncols).fill(null).map(() => ({ width: colWidth })),
        rows: rows.map((row) => ({
          height: 370840,
          cells: row.map((value) => ({
            txBody: dml.textBodyFromString(String(value ?? ""))
          }))
        }))
      };
    }
    return {
      parseTable,
      renderTable,
      parseRow,
      renderRow,
      parseCell,
      renderCell,
      parseGraphicFrame,
      renderGraphicFrame,
      tableFromRows,
      TABLE_GRAPHIC_URI: "http://schemas.openxmlformats.org/drawingml/2006/table",
      A_NS,
      R_NS
    };
  } });
    __register({ name: "drawingmlChart", dependencies: ["ooxmlErrors","xml","ooxmlShared"], factory: function(errors, xml, shared) {
    const { ParseError } = errors, { NS, REL_TYPE, CT, readBoolAttr, writeBoolAttr, encodeText, decodeText } = shared, C_NS = NS.C, A_NS = NS.A, R_NS = NS.R, CHART_GRAPHIC_URI = C_NS, REL_TYPE_CHART = REL_TYPE.CHART, REL_TYPE_PACKAGE = REL_TYPE.PACKAGE, CT_CHART = CT.CHART, CT_EMBEDDED_XLSX = CT.EMBEDDED_XLSX;
    function renderStrLit(values) {
      const pts = values.map((v, i) => xml.el("c:pt", { idx: String(i) }, [xml.el("c:v", {}, [xml.text(String(v))])]));
      return xml.el("c:strLit", {}, [
        xml.el("c:ptCount", { val: String(values.length) }),
        ...pts
      ]);
    }
    function renderNumLit(values, formatCode) {
      const pts = values.map((v, i) => xml.el("c:pt", { idx: String(i) }, [xml.el("c:v", {}, [xml.text(String(v))])])), children = [
        xml.el("c:formatCode", {}, [xml.text(formatCode || "General")]),
        xml.el("c:ptCount", { val: String(values.length) }),
        ...pts
      ];
      return xml.el("c:numLit", {}, children);
    }
    function parseLitValues(litEl) {
      return xml.findAll(litEl, "c:pt").map((pt) => {
        const v = xml.findChild(pt, "c:v");
        return v ? xml.textContent(v) : "";
      });
    }
    function parseStrLit(el) {
      return parseLitValues(el);
    }
    function parseNumLit(el) {
      return parseLitValues(el).map((v) => {
        const n = Number(v);
        return Number.isFinite(n) ? n : v;
      });
    }
    function renderSpPrSolid(rgb) {
      return xml.el("c:spPr", {}, [
        xml.el("a:solidFill", {}, [
          xml.el("a:srgbClr", { val: rgb })
        ])
      ]);
    }
    function parseSpPrSolid(spPrEl) {
      if (!spPrEl)
        return;
      const fill = xml.findChild(spPrEl, "a:solidFill");
      if (!fill)
        return;
      const cl = xml.findChild(fill, "a:srgbClr");
      return cl ? cl.attrs.val : void 0;
    }
    function renderSeries(series, plotType, idx, formatCode) {
      const children = [
        xml.el("c:idx", { val: String(idx) }),
        xml.el("c:order", { val: String(idx) })
      ];
      children.push(xml.el("c:tx", {}, [
        xml.el("c:strRef", {}, [
          xml.el("c:f", {}, [xml.text(`"${series.name || ""}"`)]),
          renderStrLit([series.name || ""])
        ])
      ]));
      if (series.color)
        children.push(renderSpPrSolid(series.color));
      if (plotType === "scatter") {
        const xVals = series.xValues || (series.categories || []), yVals = series.yValues || series.values || [];
        children.push(xml.el("c:xVal", {}, [
          xml.el("c:numRef", {}, [
            xml.el("c:f", {}, [xml.text('""')]),
            renderNumLit(xVals.map(Number), formatCode)
          ])
        ]));
        children.push(xml.el("c:yVal", {}, [
          xml.el("c:numRef", {}, [
            xml.el("c:f", {}, [xml.text('""')]),
            renderNumLit(yVals.map(Number), formatCode)
          ])
        ]));
      } else {
        if (series.categories && series.categories.length)
          children.push(xml.el("c:cat", {}, [
            xml.el("c:strRef", {}, [
              xml.el("c:f", {}, [xml.text('""')]),
              renderStrLit(series.categories)
            ])
          ]));
        children.push(xml.el("c:val", {}, [
          xml.el("c:numRef", {}, [
            xml.el("c:f", {}, [xml.text('""')]),
            renderNumLit(series.values || [], formatCode)
          ])
        ]));
      }
      return xml.el("c:ser", {}, children);
    }
    function parseSeries(serEl, plotType) {
      const out = {}, idx = xml.findChild(serEl, "c:idx");
      if (idx)
        out._idx = Number(idx.attrs.val);
      const tx = xml.findChild(serEl, "c:tx");
      if (tx) {
        const sr = xml.findChild(tx, "c:strRef"), sl = xml.findChild(tx, "c:strLit"), v = xml.findChild(tx, "c:v");
        if (sr) {
          const inner = xml.findChild(sr, "c:strLit");
          if (inner)
            out.name = parseLitValues(inner)[0] || "";
          else {
            const f = xml.findChild(sr, "c:f");
            if (f)
              out.name = xml.textContent(f).replace(/^"|"$/g, "");
          }
        } else if (sl)
          out.name = parseLitValues(sl)[0] || "";
        else if (v)
          out.name = xml.textContent(v);
      }
      const spPr = xml.findChild(serEl, "c:spPr"), color = parseSpPrSolid(spPr);
      if (color)
        out.color = color;
      if (plotType === "scatter") {
        const xValEl = xml.findChild(serEl, "c:xVal"), yValEl = xml.findChild(serEl, "c:yVal");
        if (xValEl)
          out.xValues = readNumData(xValEl);
        if (yValEl)
          out.values = readNumData(yValEl);
      } else {
        const catEl = xml.findChild(serEl, "c:cat");
        if (catEl)
          out.categories = readStrData(catEl);
        const valEl = xml.findChild(serEl, "c:val");
        if (valEl)
          out.values = readNumData(valEl);
      }
      return out;
    }
    function readStrData(parentEl) {
      const strRef = xml.findChild(parentEl, "c:strRef");
      if (strRef) {
        const lit = xml.findChild(strRef, "c:strLit");
        if (lit)
          return parseStrLit(lit);
      }
      const strLit = xml.findChild(parentEl, "c:strLit");
      if (strLit)
        return parseStrLit(strLit);
      const numRef = xml.findChild(parentEl, "c:numRef");
      if (numRef) {
        const lit = xml.findChild(numRef, "c:numLit");
        if (lit)
          return parseLitValues(lit);
      }
      return [];
    }
    function readNumData(parentEl) {
      const numRef = xml.findChild(parentEl, "c:numRef");
      if (numRef) {
        const lit = xml.findChild(numRef, "c:numLit");
        if (lit)
          return parseNumLit(lit);
      }
      const numLit = xml.findChild(parentEl, "c:numLit");
      if (numLit)
        return parseNumLit(numLit);
      return [];
    }
    const PLOT_TAGS = {
      bar: "c:barChart",
      line: "c:lineChart",
      pie: "c:pieChart",
      scatter: "c:scatterChart",
      area: "c:areaChart",
      doughnut: "c:doughnutChart"
    }, TAG_TO_PLOT = Object.fromEntries(Object.entries(PLOT_TAGS).map(([k, v]) => [v, k]));
    function renderPlot(chart, axIds) {
      const tag = PLOT_TAGS[chart.plotType] || PLOT_TAGS.bar, children = [];
      if (chart.plotType === "bar" || chart.plotType === "area")
        children.push(xml.el("c:barDir", {
          val: chart.barDirection || "col"
        }));
      if (chart.plotType !== "pie" && chart.plotType !== "doughnut" && chart.plotType !== "scatter")
        children.push(xml.el("c:grouping", {
          val: chart.grouping || (chart.plotType === "bar" ? "clustered" : "standard")
        }));
      if (chart.plotType === "scatter")
        children.push(xml.el("c:scatterStyle", {
          val: chart.scatterStyle || "lineMarker"
        }));
      children.push(xml.el("c:varyColors", {
        val: writeBoolAttr(chart.varyColors !== void 0 ? chart.varyColors : chart.plotType === "pie" || chart.plotType === "doughnut")
      }));
      for (let i = 0;i < (chart.series || []).length; i++)
        children.push(renderSeries(chart.series[i], chart.plotType, i, chart.formatCode));
      if (chart.plotType !== "pie" && chart.plotType !== "doughnut") {
        children.push(xml.el("c:axId", { val: String(axIds[0]) }));
        children.push(xml.el("c:axId", { val: String(axIds[1]) }));
      } else if (chart.plotType === "doughnut") {
        children.push(xml.el("c:firstSliceAng", {
          val: String(chart.firstSliceAng || 0)
        }));
        children.push(xml.el("c:holeSize", {
          val: String(chart.holeSize || 50)
        }));
      }
      return xml.el(tag, {}, children);
    }
    function parsePlot(plotEl) {
      const plotType = TAG_TO_PLOT[plotEl.name], out = { plotType, series: [] }, barDir = xml.findChild(plotEl, "c:barDir");
      if (barDir)
        out.barDirection = barDir.attrs.val;
      const grouping = xml.findChild(plotEl, "c:grouping");
      if (grouping)
        out.grouping = grouping.attrs.val;
      const scatterStyle = xml.findChild(plotEl, "c:scatterStyle");
      if (scatterStyle)
        out.scatterStyle = scatterStyle.attrs.val;
      const varyColors = xml.findChild(plotEl, "c:varyColors");
      if (varyColors)
        out.varyColors = readBoolAttr(varyColors.attrs.val);
      for (const s of xml.findAll(plotEl, "c:ser"))
        out.series.push(parseSeries(s, plotType));
      const fsa = xml.findChild(plotEl, "c:firstSliceAng");
      if (fsa)
        out.firstSliceAng = Number(fsa.attrs.val);
      const hs = xml.findChild(plotEl, "c:holeSize");
      if (hs)
        out.holeSize = Number(hs.attrs.val);
      return out;
    }
    function renderCatAx(axId, crossAx) {
      return xml.el("c:catAx", {}, [
        xml.el("c:axId", { val: String(axId) }),
        xml.el("c:scaling", {}, [
          xml.el("c:orientation", { val: "minMax" })
        ]),
        xml.el("c:delete", { val: "0" }),
        xml.el("c:axPos", { val: "b" }),
        xml.el("c:crossAx", { val: String(crossAx) })
      ]);
    }
    function renderValAx(axId, crossAx) {
      return xml.el("c:valAx", {}, [
        xml.el("c:axId", { val: String(axId) }),
        xml.el("c:scaling", {}, [
          xml.el("c:orientation", { val: "minMax" })
        ]),
        xml.el("c:delete", { val: "0" }),
        xml.el("c:axPos", { val: "l" }),
        xml.el("c:crossAx", { val: String(crossAx) })
      ]);
    }
    function axIdCat() {
      return 100000001;
    }
    function axIdVal() {
      return 200000001;
    }
    function renderTitle(title) {
      return xml.el("c:title", {}, [
        xml.el("c:tx", {}, [
          xml.el("c:rich", {}, [
            xml.el("a:bodyPr", { rot: "0", spcFirstLastPara: "1", vertOverflow: "ellipsis", wrap: "square", anchor: "ctr", anchorCtr: "1" }),
            xml.el("a:lstStyle", {}),
            xml.el("a:p", {}, [
              xml.el("a:r", {}, [
                xml.el("a:rPr", { lang: "en-US" }),
                xml.el("a:t", {}, [xml.text(String(title))])
              ])
            ])
          ])
        ]),
        xml.el("c:overlay", { val: "0" })
      ]);
    }
    function parseTitle(titleEl) {
      const tx = xml.findChild(titleEl, "c:tx");
      if (!tx)
        return;
      const rich = xml.findChild(tx, "c:rich");
      if (!rich)
        return;
      const out = [];
      for (const p of xml.findAll(rich, "a:p"))
        for (const r of xml.findAll(p, "a:r")) {
          const t = xml.findChild(r, "a:t");
          if (t)
            out.push(xml.textContent(t));
        }
      return out.join("");
    }
    function renderLegend(legend) {
      return xml.el("c:legend", {}, [
        xml.el("c:legendPos", { val: legend.position || "r" }),
        xml.el("c:overlay", { val: writeBoolAttr(legend.overlay) })
      ]);
    }
    function parseLegend(legendEl) {
      const out = {}, pos = xml.findChild(legendEl, "c:legendPos");
      if (pos)
        out.position = pos.attrs.val;
      const ov = xml.findChild(legendEl, "c:overlay");
      if (ov)
        out.overlay = readBoolAttr(ov.attrs.val);
      return out;
    }
    function serialize(chart) {
      const axIds = [axIdCat(), axIdVal()], plotChildren = [];
      plotChildren.push(xml.el("c:layout", {}));
      plotChildren.push(renderPlot(chart, axIds));
      if (chart.plotType !== "pie" && chart.plotType !== "doughnut") {
        plotChildren.push(renderCatAx(axIds[0], axIds[1]));
        plotChildren.push(renderValAx(axIds[1], axIds[0]));
      }
      const plotArea = xml.el("c:plotArea", {}, plotChildren), chartChildren = [];
      if (chart.title != null) {
        chartChildren.push(renderTitle(chart.title));
        chartChildren.push(xml.el("c:autoTitleDeleted", { val: "0" }));
      } else
        chartChildren.push(xml.el("c:autoTitleDeleted", { val: "1" }));
      chartChildren.push(plotArea);
      if (chart.legend)
        chartChildren.push(renderLegend(chart.legend));
      chartChildren.push(xml.el("c:plotVisOnly", { val: "1" }));
      chartChildren.push(xml.el("c:dispBlanksAs", { val: "gap" }));
      if (chart._extras)
        for (const ex of chart._extras)
          chartChildren.push(ex);
      const rootChildren = [xml.el("c:chart", {}, chartChildren)];
      if (chart.embeddedWorkbookRid)
        rootChildren.push(xml.el("c:externalData", {
          "r:id": chart.embeddedWorkbookRid
        }, [xml.el("c:autoUpdate", { val: "0" })]));
      const root = xml.el("c:chartSpace", { "xmlns:c": C_NS, "xmlns:a": A_NS, "xmlns:r": R_NS }, rootChildren);
      return xml.serialize(root);
    }
    function parse(input) {
      const text = typeof input === "string" ? input : decodeText(input), root = xml.parse(text);
      if (root.name !== "c:chartSpace")
        throw new ParseError("drawingml/chart-bad-root", `drawingmlChart: expected <c:chartSpace>, got <${root.name}>`, { context: { elementName: root && root.name } });
      const chartEl = xml.findChild(root, "c:chart");
      if (!chartEl)
        throw new ParseError("drawingml/chart-missing", "drawingmlChart: missing <c:chart>", { context: { elementName: "c:chart" } });
      const out = {}, titleEl = xml.findChild(chartEl, "c:title");
      if (titleEl) {
        const t = parseTitle(titleEl);
        if (t != null)
          out.title = t;
      }
      const plotArea = xml.findChild(chartEl, "c:plotArea");
      if (plotArea)
        for (const c of plotArea.children) {
          if (c.type !== "element")
            continue;
          if (TAG_TO_PLOT[c.name]) {
            Object.assign(out, parsePlot(c));
            break;
          }
        }
      const legendEl = xml.findChild(chartEl, "c:legend");
      if (legendEl)
        out.legend = parseLegend(legendEl);
      const extData = xml.findChild(root, "c:externalData");
      if (extData && extData.attrs["r:id"])
        out.embeddedWorkbookRid = extData.attrs["r:id"];
      return out;
    }
    function bytesOf(chart) {
      return encodeText(serialize(chart));
    }
    function barChart(opts) {
      return Object.assign({
        plotType: "bar",
        barDirection: opts.direction || "col",
        grouping: opts.grouping || "clustered",
        varyColors: !1,
        series: opts.series || [],
        title: opts.title,
        legend: opts.legend
      });
    }
    function lineChart(opts) {
      return {
        plotType: "line",
        grouping: opts.grouping || "standard",
        varyColors: !1,
        series: opts.series || [],
        title: opts.title,
        legend: opts.legend
      };
    }
    function pieChart(opts) {
      return {
        plotType: "pie",
        varyColors: opts.varyColors !== !1,
        series: opts.series || [],
        title: opts.title,
        legend: opts.legend
      };
    }
    function scatterChart(opts) {
      return {
        plotType: "scatter",
        scatterStyle: opts.scatterStyle || "lineMarker",
        varyColors: !1,
        series: opts.series || [],
        title: opts.title,
        legend: opts.legend
      };
    }
    function doughnutChart(opts) {
      return {
        plotType: "doughnut",
        varyColors: opts.varyColors !== !1,
        holeSize: opts.holeSize || 50,
        series: opts.series || [],
        title: opts.title,
        legend: opts.legend
      };
    }
    return {
      parse,
      serialize,
      bytesOf,
      barChart,
      lineChart,
      pieChart,
      scatterChart,
      doughnutChart,
      renderSeries,
      parseSeries,
      renderTitle,
      parseTitle,
      renderLegend,
      parseLegend,
      CHART_GRAPHIC_URI,
      REL_TYPE_CHART,
      CT_CHART,
      REL_TYPE_PACKAGE,
      CT_EMBEDDED_XLSX,
      C_NS
    };
  } });
    __register({ name: "pptxChart", dependencies: ["xml","drawingmlChart","ooxmlShared"], factory: function(xml, chartMod, shared) {
    const { NS } = shared, A_NS = NS.A, R_NS = NS.R, CHART_URI = chartMod.CHART_GRAPHIC_URI;
    function parseGraphicFrame(gfEl) {
      const graphic = xml.findChild(gfEl, "a:graphic");
      if (!graphic)
        return null;
      const gd = xml.findChild(graphic, "a:graphicData");
      if (!gd || gd.attrs.uri !== CHART_URI)
        return null;
      const chart = xml.findChild(gd, "c:chart");
      if (!chart)
        return null;
      const out = { type: "chart" };
      if (chart.attrs["r:id"])
        out.chartRef = chart.attrs["r:id"];
      const nv = xml.findChild(gfEl, "p:nvGraphicFramePr");
      if (nv) {
        const cNvPr = xml.findChild(nv, "p:cNvPr");
        if (cNvPr) {
          if (cNvPr.attrs.id != null)
            out.id = Number(cNvPr.attrs.id);
          if (cNvPr.attrs.name)
            out.name = cNvPr.attrs.name;
        }
      }
      const xfrm = xml.findChild(gfEl, "p:xfrm");
      if (xfrm) {
        const off = xml.findChild(xfrm, "a:off"), ext = xml.findChild(xfrm, "a:ext");
        if (off) {
          if (off.attrs.x != null)
            out.offsetX = Number(off.attrs.x);
          if (off.attrs.y != null)
            out.offsetY = Number(off.attrs.y);
        }
        if (ext) {
          if (ext.attrs.cx != null)
            out.cx = Number(ext.attrs.cx);
          if (ext.attrs.cy != null)
            out.cy = Number(ext.attrs.cy);
        }
      }
      return out;
    }
    function renderGraphicFrame(c) {
      const cNvPrAttrs = {
        id: String(c.id != null ? c.id : 5),
        name: c.name || "Chart"
      }, chartAttrs = {};
      if (c.chartRef)
        chartAttrs["r:id"] = c.chartRef;
      return xml.el("p:graphicFrame", {}, [
        xml.el("p:nvGraphicFramePr", {}, [
          xml.el("p:cNvPr", cNvPrAttrs),
          xml.el("p:cNvGraphicFramePr", {}),
          xml.el("p:nvPr", {})
        ]),
        xml.el("p:xfrm", {}, [
          xml.el("a:off", {
            x: String(c.offsetX || 0),
            y: String(c.offsetY || 0)
          }),
          xml.el("a:ext", {
            cx: String(c.cx ?? 6000000),
            cy: String(c.cy ?? 4000000)
          })
        ]),
        xml.el("a:graphic", {}, [
          xml.el("a:graphicData", { uri: CHART_URI }, [
            xml.el("c:chart", Object.assign({
              "xmlns:c": chartMod.C_NS,
              "xmlns:r": R_NS
            }, chartAttrs))
          ])
        ])
      ]);
    }
    return {
      parseGraphicFrame,
      renderGraphicFrame,
      CHART_URI,
      A_NS,
      R_NS
    };
  } });
    __register({ name: "drawingmlShape", dependencies: ["xml","ooxmlShared"], factory: function(xml, shared) {
    const { NS } = shared, A_NS = NS.A;
    function parseColorChild(parent) {
      for (const c of parent.children) {
        if (c.type !== "element")
          continue;
        if (c.name === "a:srgbClr")
          return { rgb: c.attrs.val };
        if (c.name === "a:schemeClr")
          return { schemeColor: c.attrs.val };
      }
      return null;
    }
    function renderSrgbClr(rgb) {
      return xml.el("a:srgbClr", { val: String(rgb).replace(/^#/, "") });
    }
    function renderSchemeClr(name) {
      return xml.el("a:schemeClr", { val: name });
    }
    function renderColorChild(color) {
      if (!color)
        return null;
      if (color.rgb)
        return renderSrgbClr(color.rgb);
      if (color.schemeColor)
        return renderSchemeClr(color.schemeColor);
      return null;
    }
    function parsePrstGeom(prstEl) {
      if (!prstEl)
        return;
      const out = { geom: prstEl.attrs.prst }, avLst = xml.findChild(prstEl, "a:avLst");
      if (avLst) {
        const guides = [];
        for (const g of xml.findAll(avLst, "a:gd"))
          guides.push({ name: g.attrs.name, fmla: g.attrs.fmla });
        if (guides.length)
          out.avLst = guides;
      }
      return out;
    }
    function renderPrstGeom(props) {
      const avChildren = (props.avLst || []).map((g) => xml.el("a:gd", { name: g.name, fmla: g.fmla }));
      return xml.el("a:prstGeom", { prst: props.geom }, [xml.el("a:avLst", {}, avChildren)]);
    }
    function parseXfrm(xfrmEl) {
      if (!xfrmEl)
        return {};
      const out = {};
      if (xfrmEl.attrs.rot != null)
        out.rotation = Number(xfrmEl.attrs.rot);
      if (xfrmEl.attrs.flipH === "1")
        out.flipH = !0;
      if (xfrmEl.attrs.flipV === "1")
        out.flipV = !0;
      const off = xml.findChild(xfrmEl, "a:off"), ext = xml.findChild(xfrmEl, "a:ext");
      if (off) {
        if (off.attrs.x != null)
          out.offsetX = Number(off.attrs.x);
        if (off.attrs.y != null)
          out.offsetY = Number(off.attrs.y);
      }
      if (ext) {
        if (ext.attrs.cx != null)
          out.cx = Number(ext.attrs.cx);
        if (ext.attrs.cy != null)
          out.cy = Number(ext.attrs.cy);
      }
      return out;
    }
    function renderXfrm(props) {
      const a = {};
      if (props.rotation != null)
        a.rot = String(props.rotation);
      if (props.flipH)
        a.flipH = "1";
      if (props.flipV)
        a.flipV = "1";
      return xml.el("a:xfrm", a, [
        xml.el("a:off", {
          x: String(props.offsetX || 0),
          y: String(props.offsetY || 0)
        }),
        xml.el("a:ext", {
          cx: String(props.cx || 0),
          cy: String(props.cy || 0)
        })
      ]);
    }
    function parseFill(spPrEl) {
      for (const c of spPrEl.children) {
        if (c.type !== "element")
          continue;
        if (c.name === "a:noFill")
          return "none";
        if (c.name === "a:solidFill") {
          const color = parseColorChild(c);
          if (color)
            return color;
        }
      }
      return;
    }
    function renderFill(fill) {
      if (fill === "none")
        return xml.el("a:noFill", {});
      if (typeof fill === "object" && fill) {
        const color = renderColorChild(fill);
        if (color)
          return xml.el("a:solidFill", {}, [color]);
      }
      return null;
    }
    function parseLine(lnEl) {
      if (!lnEl)
        return;
      const out = {};
      if (lnEl.attrs.w != null)
        out.width = Number(lnEl.attrs.w);
      if (lnEl.attrs.cap)
        out.cap = lnEl.attrs.cap;
      if (lnEl.attrs.cmpd)
        out.compound = lnEl.attrs.cmpd;
      const sf = xml.findChild(lnEl, "a:solidFill");
      if (sf) {
        const c = parseColorChild(sf);
        if (c && c.rgb)
          out.color = c.rgb;
      }
      const dash = xml.findChild(lnEl, "a:prstDash");
      if (dash)
        out.dash = dash.attrs.val;
      if (xml.findChild(lnEl, "a:noFill"))
        out.color = null;
      return out;
    }
    function renderLine(line) {
      if (line === "none")
        return xml.el("a:ln", {}, [xml.el("a:noFill", {})]);
      if (!line || typeof line !== "object")
        return null;
      const a = {};
      if (line.width != null)
        a.w = String(line.width);
      if (line.cap)
        a.cap = line.cap;
      if (line.compound)
        a.cmpd = line.compound;
      const children = [];
      if (line.color === null)
        children.push(xml.el("a:noFill", {}));
      else if (line.color)
        children.push(xml.el("a:solidFill", {}, [renderSrgbClr(line.color)]));
      if (line.dash)
        children.push(xml.el("a:prstDash", { val: line.dash }));
      return xml.el("a:ln", a, children);
    }
    function parseShapeProperties(spPrEl) {
      if (!spPrEl)
        return;
      const out = {}, xfrmEl = xml.findChild(spPrEl, "a:xfrm");
      Object.assign(out, parseXfrm(xfrmEl));
      const prst = xml.findChild(spPrEl, "a:prstGeom");
      if (prst) {
        const geom = parsePrstGeom(prst);
        if (geom)
          Object.assign(out, geom);
      }
      const fill = parseFill(spPrEl);
      if (fill !== void 0)
        out.fill = fill;
      const ln = xml.findChild(spPrEl, "a:ln");
      if (ln) {
        const lineProps = parseLine(ln);
        if (lineProps !== void 0)
          out.line = lineProps;
      }
      const known = new Set([
        "a:xfrm",
        "a:prstGeom",
        "a:solidFill",
        "a:noFill",
        "a:ln"
      ]), extras = [];
      for (const c of spPrEl.children) {
        if (c.type !== "element")
          continue;
        if (!known.has(c.name))
          extras.push(c);
      }
      if (extras.length)
        out._extras = extras;
      return Object.keys(out).length ? out : void 0;
    }
    function renderShapeProperties(props, tag = "p:spPr") {
      if (!props)
        return null;
      const children = [];
      if (props.cx != null || props.cy != null || props.offsetX != null || props.offsetY != null || props.rotation != null || props.flipH || props.flipV)
        children.push(renderXfrm(props));
      if (props.geom)
        children.push(renderPrstGeom(props));
      const fillEl = renderFill(props.fill);
      if (fillEl)
        children.push(fillEl);
      const lineEl = renderLine(props.line);
      if (lineEl)
        children.push(lineEl);
      if (props._extras)
        for (const ex of props._extras)
          children.push(ex);
      return xml.el(tag, {}, children);
    }
    const { EMU_PER_INCH, EMU_PER_CM, EMU_PER_PT, EMU_PER_PX_96, toEmu } = shared;
    function shapeProps(opts = {}) {
      const out = {};
      if (opts.geom)
        out.geom = opts.geom;
      if (opts.cx != null)
        out.cx = toEmu(opts.cx);
      if (opts.cy != null)
        out.cy = toEmu(opts.cy);
      if (opts.offsetX != null)
        out.offsetX = toEmu(opts.offsetX);
      if (opts.offsetY != null)
        out.offsetY = toEmu(opts.offsetY);
      if (opts.rotation != null)
        out.rotation = opts.rotation;
      if (opts.flipH)
        out.flipH = !0;
      if (opts.flipV)
        out.flipV = !0;
      if (opts.fill !== void 0) {
        if (opts.fill === "none" || opts.fill === null)
          out.fill = "none";
        else if (typeof opts.fill === "string")
          out.fill = { rgb: opts.fill };
        else if (opts.fill && opts.fill.rgb)
          out.fill = { rgb: opts.fill.rgb };
        else if (opts.fill && opts.fill.schemeColor)
          out.fill = { schemeColor: opts.fill.schemeColor };
      }
      if (opts.line !== void 0)
        if (opts.line === "none" || opts.line === null)
          out.line = "none";
        else
          out.line = { ...opts.line };
      return out;
    }
    const PRESETS = Object.freeze({
      rect: "rect",
      roundRect: "roundRect",
      ellipse: "ellipse",
      triangle: "triangle",
      rtTriangle: "rtTriangle",
      parallelogram: "parallelogram",
      trapezoid: "trapezoid",
      diamond: "diamond",
      pentagon: "pentagon",
      hexagon: "hexagon",
      heptagon: "heptagon",
      octagon: "octagon",
      star5: "star5",
      star6: "star6",
      star8: "star8",
      rightArrow: "rightArrow",
      leftArrow: "leftArrow",
      upArrow: "upArrow",
      downArrow: "downArrow",
      leftRightArrow: "leftRightArrow",
      upDownArrow: "upDownArrow",
      wedgeRectCallout: "wedgeRectCallout",
      wedgeRoundRectCallout: "wedgeRoundRectCallout",
      wedgeEllipseCallout: "wedgeEllipseCallout",
      cloudCallout: "cloudCallout",
      line: "line",
      bentConnector2: "bentConnector2",
      bentConnector3: "bentConnector3",
      curvedConnector2: "curvedConnector2",
      curvedConnector3: "curvedConnector3",
      ribbon: "ribbon",
      wave: "wave",
      doubleWave: "doubleWave",
      cloud: "cloud",
      sun: "sun",
      moon: "moon",
      heart: "heart",
      lightningBolt: "lightningBolt"
    });
    return {
      parseShapeProperties,
      renderShapeProperties,
      parsePrstGeom,
      renderPrstGeom,
      parseXfrm,
      renderXfrm,
      parseFill,
      renderFill,
      parseLine,
      renderLine,
      shapeProps,
      toEmu,
      EMU_PER_INCH,
      EMU_PER_CM,
      EMU_PER_PT,
      EMU_PER_PX_96,
      PRESETS,
      A_NS
    };
  } });
    __register({ name: "pptxSlide", dependencies: ["ooxmlErrors","xml","drawingml","pptxPicture","pptxTable","pptxChart","drawingmlShape","ooxmlShared"], factory: function(errors, xml, dml, picMod, tblMod, chartMod, shapeMod, shared) {
    const { ParseError } = errors, { NS, REL_TYPE, CT, encodeText, decodeText } = shared, P_NS = NS.P, A_NS = NS.A, R_NS = NS.R;
    function parseShape(spEl) {
      const out = { type: "shape" }, nvSpPr = xml.findChild(spEl, "p:nvSpPr");
      if (nvSpPr) {
        const cNvPr = xml.findChild(nvSpPr, "p:cNvPr");
        if (cNvPr) {
          if (cNvPr.attrs.id != null)
            out.id = Number(cNvPr.attrs.id);
          if (cNvPr.attrs.name)
            out.name = cNvPr.attrs.name;
        }
        const nvPr = xml.findChild(nvSpPr, "p:nvPr");
        if (nvPr) {
          const ph = xml.findChild(nvPr, "p:ph");
          if (ph) {
            const phObj = {};
            if (ph.attrs.type)
              phObj.type = ph.attrs.type;
            if (ph.attrs.idx != null)
              phObj.idx = Number(ph.attrs.idx);
            if (ph.attrs.sz)
              phObj.sz = ph.attrs.sz;
            out.placeholder = phObj;
          }
        }
        out.nvSpPr = nvSpPr;
      }
      const spPr = xml.findChild(spEl, "p:spPr");
      if (spPr) {
        out.spPr = spPr;
        const typed = shapeMod.parseShapeProperties(spPr);
        if (typed)
          out.shapeProps = typed;
      }
      const styleEl = xml.findChild(spEl, "p:style");
      if (styleEl)
        out.style = styleEl;
      const txBody = xml.findChild(spEl, "p:txBody");
      if (txBody)
        out.txBody = dml.parseTextBody(txBody);
      return out;
    }
    function renderShape(shape) {
      const children = [];
      children.push(shape.nvSpPr || buildNvSpPr(shape));
      if (shape.shapeProps)
        children.push(shapeMod.renderShapeProperties(shape.shapeProps, "p:spPr"));
      else if (shape.spPr)
        children.push(shape.spPr);
      else
        children.push(xml.el("p:spPr", {}));
      if (shape.style)
        children.push(shape.style);
      if (shape.txBody)
        children.push(dml.renderTextBody(shape.txBody, "p:txBody"));
      if (shape._extras)
        for (const ex of shape._extras)
          children.push(ex);
      return xml.el("p:sp", {}, children);
    }
    function buildNvSpPr(shape) {
      const cNvPrAttrs = {};
      cNvPrAttrs.id = String(shape.id != null ? shape.id : 2);
      cNvPrAttrs.name = shape.name || "TextBox";
      const nvPrChildren = [];
      if (shape.placeholder) {
        const pa = {};
        if (shape.placeholder.type)
          pa.type = shape.placeholder.type;
        if (shape.placeholder.idx != null)
          pa.idx = String(shape.placeholder.idx);
        if (shape.placeholder.sz)
          pa.sz = shape.placeholder.sz;
        nvPrChildren.push(xml.el("p:ph", pa));
      }
      return xml.el("p:nvSpPr", {}, [
        xml.el("p:cNvPr", cNvPrAttrs),
        xml.el("p:cNvSpPr", {}, [xml.el("a:spLocks", { noGrp: "1" })]),
        xml.el("p:nvPr", {}, nvPrChildren)
      ]);
    }
    function parseSpTree(treeEl) {
      const shapes = [], extras = [];
      for (const c of treeEl.children) {
        if (c.type !== "element")
          continue;
        switch (c.name) {
          case "p:sp":
            shapes.push(parseShape(c));
            break;
          case "p:pic":
            shapes.push(picMod.parsePicture(c));
            break;
          case "p:graphicFrame": {
            const tbl = tblMod.parseGraphicFrame(c);
            if (tbl) {
              shapes.push(tbl);
              break;
            }
            const chart = chartMod.parseGraphicFrame(c);
            if (chart) {
              shapes.push(chart);
              break;
            }
            shapes.push({ type: "graphicFrame", node: c });
            break;
          }
          case "p:nvGrpSpPr":
          case "p:grpSpPr":
            extras.push(c);
            break;
          default:
            extras.push(c);
        }
      }
      return { shapes, extras };
    }
    function renderSpTree({ shapes, extras }) {
      const children = [], headExtras = (extras || []).filter((n) => n.name === "p:nvGrpSpPr" || n.name === "p:grpSpPr"), tailExtras = (extras || []).filter((n) => n.name !== "p:nvGrpSpPr" && n.name !== "p:grpSpPr");
      if (!headExtras.length) {
        children.push(xml.el("p:nvGrpSpPr", {}, [
          xml.el("p:cNvPr", { id: "1", name: "" }),
          xml.el("p:cNvGrpSpPr", {}),
          xml.el("p:nvPr", {})
        ]));
        children.push(xml.el("p:grpSpPr", {}));
      } else
        for (const ex of headExtras)
          children.push(ex);
      for (const sp of shapes || [])
        if (sp.type === "shape")
          children.push(renderShape(sp));
        else if (sp.type === "picture")
          children.push(picMod.renderPicture(sp));
        else if (sp.type === "table")
          children.push(tblMod.renderGraphicFrame(sp));
        else if (sp.type === "chart")
          children.push(chartMod.renderGraphicFrame(sp));
        else if (sp.type === "graphicFrame" && sp.node)
          children.push(sp.node);
      for (const ex of tailExtras)
        children.push(ex);
      return xml.el("p:spTree", {}, children);
    }
    function parseCSld(cSldEl) {
      const out = {}, extras = [];
      if (cSldEl.attrs.name)
        out.name = cSldEl.attrs.name;
      for (const c of cSldEl.children) {
        if (c.type !== "element")
          continue;
        if (c.name === "p:bg")
          out.bg = c;
        else if (c.name === "p:spTree") {
          const tree = parseSpTree(c);
          out.shapes = tree.shapes;
          if (tree.extras.length)
            out.spTreeExtras = tree.extras;
        } else
          extras.push(c);
      }
      if (extras.length)
        out._extras = extras;
      return out;
    }
    function renderCSld(content, defaultName) {
      const a = {};
      if (content.name)
        a.name = content.name;
      else if (defaultName)
        a.name = defaultName;
      const children = [];
      if (content.bg)
        children.push(content.bg);
      children.push(renderSpTree({
        shapes: content.shapes || [],
        extras: content.spTreeExtras
      }));
      if (content._extras)
        for (const ex of content._extras)
          children.push(ex);
      return xml.el("p:cSld", a, children);
    }
    function buildParser(rootTag, defaults) {
      return function parse(input) {
        let root;
        if (input && input.type === "element")
          root = input;
        else {
          const text = typeof input === "string" ? input : decodeText(input);
          root = xml.parse(text);
        }
        if (root.name !== rootTag)
          throw new ParseError(`pptx/${rootTag.replace(/^p:/, "")}-bad-root`, `pptx ${rootTag}: expected <${rootTag}>, got <${root.name}>`, { context: { expected: rootTag, elementName: root && root.name } });
        const out = { type: defaults.type }, cSld = xml.findChild(root, "p:cSld");
        if (cSld)
          Object.assign(out, parseCSld(cSld));
        const extras = [];
        for (const c of root.children) {
          if (c.type !== "element" || c.name === "p:cSld")
            continue;
          if (c.name === "p:clrMapOvr")
            out.clrMapOvr = c;
          else if (c.name === "p:clrMap")
            out.clrMap = c;
          else if (c.name === "p:sldLayoutIdLst")
            out.layoutIds = parseSldLayoutIdLst(c);
          else if (c.name === "p:txStyles")
            out.txStyles = c;
          else
            extras.push(c);
        }
        if (extras.length)
          out._extras = extras;
        return out;
      };
    }
    function buildSerializer(rootTag, defaultName, extraNs) {
      return function serialize(obj) {
        const ns = {
          "xmlns:p": P_NS,
          "xmlns:a": A_NS,
          "xmlns:r": R_NS,
          ...extraNs || {}
        }, children = [renderCSld(obj, defaultName)];
        if (obj.clrMap)
          children.push(obj.clrMap);
        if (obj.clrMapOvr)
          children.push(obj.clrMapOvr);
        if (obj.layoutIds)
          children.push(renderSldLayoutIdLst(obj.layoutIds));
        if (obj.txStyles)
          children.push(obj.txStyles);
        if (obj._extras)
          for (const ex of obj._extras)
            children.push(ex);
        return xml.serialize(xml.el(rootTag, ns, children));
      };
    }
    function parseSldLayoutIdLst(el) {
      return xml.findAll(el, "p:sldLayoutId").map((c) => ({
        id: c.attrs.id,
        rId: c.attrs["r:id"]
      }));
    }
    function renderSldLayoutIdLst(layoutIds) {
      return xml.el("p:sldLayoutIdLst", {}, layoutIds.map((li) => xml.el("p:sldLayoutId", { id: String(li.id), "r:id": li.rId })));
    }
    const parseSlide = buildParser("p:sld", { type: "slide" }), parseSlideLayout = buildParser("p:sldLayout", { type: "slideLayout" }), parseSlideMaster = buildParser("p:sldMaster", { type: "slideMaster" }), serializeSlide = buildSerializer("p:sld", null);
    function serializeSlideLayout(obj) {
      const xmlText = buildSerializer("p:sldLayout", obj.cSldName || "Title and Content", obj.layoutType ? {} : {})(obj);
      if (obj.layoutType)
        return xmlText.replace("<p:sldLayout", `<p:sldLayout type="${obj.layoutType}"`);
      return xmlText;
    }
    const serializeSlideMaster = buildSerializer("p:sldMaster", null);
    function slideBytes(obj) {
      return encodeText(serializeSlide(obj));
    }
    function slideLayoutBytes(obj) {
      return encodeText(serializeSlideLayout(obj));
    }
    function slideMasterBytes(obj) {
      return encodeText(serializeSlideMaster(obj));
    }
    function fromTitleBody({ title, body }) {
      const shapes = [];
      if (title != null)
        shapes.push({
          type: "shape",
          id: 2,
          name: "Title 1",
          placeholder: { type: "title" },
          txBody: dml.textBodyFromString(String(title))
        });
      if (body && body.length)
        shapes.push({
          type: "shape",
          id: 3,
          name: "Content Placeholder 2",
          placeholder: { idx: 1 },
          txBody: {
            paragraphs: body.map((line) => ({
              runs: [{ type: "text", value: String(line) }]
            }))
          }
        });
      return { type: "slide", shapes };
    }
    function extractTitle(slide) {
      const sp = (slide.shapes || []).find((s) => s.placeholder && s.placeholder.type === "title");
      if (!sp || !sp.txBody)
        return null;
      return sp.txBody.paragraphs.map((p) => p.runs.map((r) => r.value || "").join("")).join(`
`);
    }
    function extractBody(slide) {
      const sp = (slide.shapes || []).find((s) => s.placeholder && s.placeholder.idx != null);
      if (!sp || !sp.txBody)
        return [];
      return sp.txBody.paragraphs.map((p) => p.runs.map((r) => r.value || "").join(""));
    }
    return {
      parseShape,
      renderShape,
      parseSlide,
      parseSlideLayout,
      parseSlideMaster,
      serializeSlide,
      serializeSlideLayout,
      serializeSlideMaster,
      slideBytes,
      slideLayoutBytes,
      slideMasterBytes,
      parseCSld,
      renderCSld,
      parseSpTree,
      renderSpTree,
      fromTitleBody,
      extractTitle,
      extractBody,
      P_NS,
      A_NS,
      R_NS,
      REL_TYPE_SLIDE: REL_TYPE.SLIDE,
      REL_TYPE_SLIDE_LAYOUT: REL_TYPE.SLIDE_LAYOUT,
      REL_TYPE_SLIDE_MASTER: REL_TYPE.SLIDE_MASTER,
      CT_SLIDE: CT.SLIDE,
      CT_SLIDE_LAYOUT: CT.SLIDE_LAYOUT,
      CT_SLIDE_MASTER: CT.SLIDE_MASTER
    };
  } });
    __register({ name: "pptxTheme", dependencies: ["ooxmlErrors","xml","ooxmlShared"], factory: function(errors, xml, shared) {
    const { ParseError } = errors, { NS, REL_TYPE, CT, encodeText, decodeText } = shared, A_NS = NS.A, REL_TYPE_THEME = REL_TYPE.THEME, CT_THEME = CT.THEME;
    function parseColorContainer(el) {
      for (const c of el.children) {
        if (c.type !== "element")
          continue;
        if (c.name === "a:srgbClr")
          return { srgb: c.attrs.val };
        if (c.name === "a:sysClr")
          return { sysClr: {
            val: c.attrs.val,
            lastClr: c.attrs.lastClr
          } };
      }
      return null;
    }
    function renderColorContainer(name, color) {
      if (!color)
        return null;
      let inner;
      if (color.srgb)
        inner = xml.el("a:srgbClr", { val: color.srgb });
      else if (color.sysClr) {
        const a = { val: color.sysClr.val };
        if (color.sysClr.lastClr)
          a.lastClr = color.sysClr.lastClr;
        inner = xml.el("a:sysClr", a);
      } else
        return null;
      return xml.el(name, {}, [inner]);
    }
    const CLR_SCHEME_KEYS = [
      "dk1",
      "lt1",
      "dk2",
      "lt2",
      "accent1",
      "accent2",
      "accent3",
      "accent4",
      "accent5",
      "accent6",
      "hlink",
      "folHlink"
    ];
    function parseClrScheme(el) {
      const out = { name: el.attrs.name || "", colors: {} };
      for (const key of CLR_SCHEME_KEYS) {
        const child = xml.findChild(el, "a:" + key);
        if (child)
          out.colors[key] = parseColorContainer(child);
      }
      return out;
    }
    function renderClrScheme(scheme) {
      const children = [];
      for (const key of CLR_SCHEME_KEYS) {
        const c = scheme.colors[key];
        if (!c)
          continue;
        const el = renderColorContainer("a:" + key, c);
        if (el)
          children.push(el);
      }
      return xml.el("a:clrScheme", { name: scheme.name || "Office" }, children);
    }
    function parseFontKind(el) {
      const out = {}, latin = xml.findChild(el, "a:latin"), ea = xml.findChild(el, "a:ea"), cs = xml.findChild(el, "a:cs");
      if (latin)
        out.latin = latin.attrs.typeface;
      if (ea)
        out.ea = ea.attrs.typeface;
      if (cs)
        out.cs = cs.attrs.typeface;
      const extras = el.children.filter((n) => n.type === "element" && !["a:latin", "a:ea", "a:cs"].includes(n.name));
      if (extras.length)
        out._extras = extras;
      return out;
    }
    function renderFontKind(tag, kind) {
      const children = [];
      children.push(xml.el("a:latin", { typeface: kind.latin || "Calibri" }));
      children.push(xml.el("a:ea", { typeface: kind.ea || "" }));
      children.push(xml.el("a:cs", { typeface: kind.cs || "" }));
      if (kind._extras)
        for (const ex of kind._extras)
          children.push(ex);
      return xml.el(tag, {}, children);
    }
    function parseFontScheme(el) {
      const out = { name: el.attrs.name || "" }, major = xml.findChild(el, "a:majorFont"), minor = xml.findChild(el, "a:minorFont");
      if (major)
        out.majorFont = parseFontKind(major);
      if (minor)
        out.minorFont = parseFontKind(minor);
      return out;
    }
    function renderFontScheme(scheme) {
      const children = [];
      children.push(renderFontKind("a:majorFont", scheme.majorFont || {}));
      children.push(renderFontKind("a:minorFont", scheme.minorFont || {}));
      return xml.el("a:fontScheme", { name: scheme.name || "Office" }, children);
    }
    function parse(input) {
      const text = typeof input === "string" ? input : decodeText(input), root = xml.parse(text);
      if (root.name !== "a:theme")
        throw new ParseError("pptx/theme-bad-root", `pptx theme: expected <a:theme>, got <${root.name}>`, { context: { elementName: root && root.name } });
      const out = { name: root.attrs.name || "Office Theme" }, themeEls = xml.findChild(root, "a:themeElements");
      if (themeEls) {
        const cs = xml.findChild(themeEls, "a:clrScheme"), fs = xml.findChild(themeEls, "a:fontScheme"), fm = xml.findChild(themeEls, "a:fmtScheme");
        if (cs)
          out.clrScheme = parseClrScheme(cs);
        if (fs)
          out.fontScheme = parseFontScheme(fs);
        if (fm)
          out.fmtScheme = fm;
      }
      const od = xml.findChild(root, "a:objectDefaults"), xc = xml.findChild(root, "a:extraClrSchemeLst");
      if (od)
        out.objectDefaults = od;
      if (xc)
        out.extraClrSchemeLst = xc;
      return out;
    }
    function serialize(obj) {
      const themeChildren = [];
      if (obj.clrScheme)
        themeChildren.push(renderClrScheme(obj.clrScheme));
      if (obj.fontScheme)
        themeChildren.push(renderFontScheme(obj.fontScheme));
      if (obj.fmtScheme)
        themeChildren.push(obj.fmtScheme);
      const children = [xml.el("a:themeElements", {}, themeChildren)];
      children.push(obj.objectDefaults || xml.el("a:objectDefaults", {}));
      children.push(obj.extraClrSchemeLst || xml.el("a:extraClrSchemeLst", {}));
      return xml.serialize(xml.el("a:theme", { "xmlns:a": A_NS, name: obj.name || "Office Theme" }, children));
    }
    function bytesOf(obj) {
      return encodeText(serialize(obj));
    }
    function defaults() {
      const fmtSchemeXml = '<a:fmtScheme xmlns:a="' + A_NS + '" name="Office"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst><a:lnStyleLst><a:ln w="6350" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/></a:ln><a:ln w="12700" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/></a:ln><a:ln w="19050" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/></a:ln></a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme>';
      return {
        name: "Office Theme",
        clrScheme: {
          name: "Office",
          colors: {
            dk1: { sysClr: { val: "windowText", lastClr: "000000" } },
            lt1: { sysClr: { val: "window", lastClr: "FFFFFF" } },
            dk2: { srgb: "44546A" },
            lt2: { srgb: "E7E6E6" },
            accent1: { srgb: "4472C4" },
            accent2: { srgb: "ED7D31" },
            accent3: { srgb: "A5A5A5" },
            accent4: { srgb: "FFC000" },
            accent5: { srgb: "5B9BD5" },
            accent6: { srgb: "70AD47" },
            hlink: { srgb: "0563C1" },
            folHlink: { srgb: "954F72" }
          }
        },
        fontScheme: {
          name: "Office",
          majorFont: { latin: "Calibri Light" },
          minorFont: { latin: "Calibri" }
        },
        fmtScheme: xml.parse(fmtSchemeXml)
      };
    }
    return {
      parse,
      serialize,
      bytesOf,
      defaults,
      parseClrScheme,
      renderClrScheme,
      parseFontScheme,
      renderFontScheme,
      REL_TYPE_THEME,
      CT_THEME
    };
  } });
    __register({ name: "markupCompatibility", dependencies: ["xml"], factory: function(xml) {
    function process(root, options) {
      const opts = {
        supportedPrefixes: [],
        preserveAlternateContent: !1,
        keepElements: [],
        ...options || {}
      };
      if (!Array.isArray(opts.keepElements))
        opts.keepElements = [];
      walk(root, new Set, opts, !1);
      return root;
    }
    function walk(node, ignorable, opts, kept) {
      if (!node || node.type !== "element")
        return;
      const localIgnorable = kept ? ignorable : pickIgnorable(node, ignorable, opts), processContent = parseSpaceSep(node.attrs && node.attrs["mc:ProcessContent"]), attrKeys = Object.keys(node.attrs || {});
      for (const k of attrKeys)
        if (isMcAttr(k))
          delete node.attrs[k];
        else if (localIgnorable.size && hasPrefix(k, localIgnorable))
          delete node.attrs[k];
      if (!node.children || !node.children.length)
        return;
      const out = [];
      for (const child of node.children) {
        if (child.type !== "element") {
          out.push(child);
          continue;
        }
        if (child.name === "mc:AlternateContent" && !opts.preserveAlternateContent) {
          const replacement = resolveAlternateContentRecursive(child, opts);
          for (const r of replacement) {
            walk(r, localIgnorable, opts, kept);
            out.push(r);
          }
          continue;
        }
        if (opts.keepElements.includes(child.name)) {
          walk(child, new Set, opts, !0);
          out.push(child);
          continue;
        }
        if (localIgnorable.size && hasPrefix(child.name, localIgnorable)) {
          if (processContent.includes(child.name))
            for (const grand of child.children || []) {
              if (grand.type === "element")
                walk(grand, localIgnorable, opts, kept);
              out.push(grand);
            }
          continue;
        }
        walk(child, localIgnorable, opts, kept);
        out.push(child);
      }
      node.children = out;
    }
    function parseSpaceSep(s) {
      if (!s)
        return [];
      return String(s).split(/\s+/).filter(Boolean);
    }
    function pickIgnorable(node, parentSet, opts) {
      const ig = node.attrs && node.attrs["mc:Ignorable"];
      if (!ig)
        return parentSet;
      const merged = new Set(parentSet);
      for (const prefix of String(ig).split(/\s+/).filter(Boolean))
        if (!opts.supportedPrefixes.includes(prefix))
          merged.add(prefix);
      return merged;
    }
    function isMcAttr(name) {
      return name === "mc:Ignorable" || name === "mc:PreserveElements" || name === "mc:PreserveAttributes" || name === "mc:MustUnderstand" || name === "mc:ProcessContent";
    }
    function hasPrefix(name, prefixSet) {
      const colon = name.indexOf(":");
      if (colon <= 0)
        return !1;
      return prefixSet.has(name.slice(0, colon));
    }
    function resolveAlternateContentRecursive(altEl, opts) {
      const direct = resolveAlternateContent(altEl, opts), out = [];
      for (const e of direct)
        if (e.type === "element" && e.name === "mc:AlternateContent" && !opts.preserveAlternateContent)
          for (const inner of resolveAlternateContentRecursive(e, opts))
            out.push(inner);
        else
          out.push(e);
      return out;
    }
    function resolveAlternateContent(altEl, opts) {
      const choices = (altEl.children || []).filter((c) => c.type === "element" && c.name === "mc:Choice");
      for (const choice of choices)
        if (String(choice.attrs.Requires || "").split(/\s+/).filter(Boolean).every((p) => opts.supportedPrefixes.includes(p)))
          return (choice.children || []).filter((c) => c.type === "element");
      const fallback = (altEl.children || []).find((c) => c.type === "element" && c.name === "mc:Fallback");
      if (fallback)
        return (fallback.children || []).filter((c) => c.type === "element");
      return [];
    }
    function wrapAlternateContent({ choices, fallback }) {
      const children = [];
      for (const c of choices || []) {
        const inner = Array.isArray(c.element) ? c.element : c.element ? [c.element] : [];
        children.push(xml.el("mc:Choice", { Requires: String(c.requires || "") }, inner));
      }
      if (fallback !== void 0) {
        const inner = Array.isArray(fallback) ? fallback : fallback ? [fallback] : [];
        children.push(xml.el("mc:Fallback", {}, inner));
      }
      return xml.el("mc:AlternateContent", {}, children);
    }
    function setIgnorable(rootEl, prefixes) {
      if (!rootEl || rootEl.type !== "element")
        return rootEl;
      const list = Array.isArray(prefixes) ? prefixes.join(" ") : String(prefixes);
      if (!rootEl.attrs["xmlns:mc"])
        rootEl.attrs["xmlns:mc"] = "http://schemas.openxmlformats.org/markup-compatibility/2006";
      const existing = rootEl.attrs["mc:Ignorable"];
      if (!existing)
        rootEl.attrs["mc:Ignorable"] = list;
      else {
        const set = new Set(existing.split(/\s+/).filter(Boolean));
        for (const p of list.split(/\s+/).filter(Boolean))
          set.add(p);
        rootEl.attrs["mc:Ignorable"] = [...set].join(" ");
      }
      return rootEl;
    }
    return {
      process,
      wrapAlternateContent,
      setIgnorable,
      MC_NS: "http://schemas.openxmlformats.org/markup-compatibility/2006"
    };
  } });
    __register({ name: "pptxWalker", dependencies: [], factory: function() {
    function createWalker() {
      const _exts = [];
      function use(...extensions) {
        for (const ext of extensions)
          if (ext && !_exts.includes(ext))
            _exts.push(ext);
      }
      function applyHook(name, value) {
        if (value == null)
          return value;
        for (const ext of _exts)
          if (typeof ext[name] === "function") {
            const r = ext[name](value);
            if (r !== void 0)
              value = r;
          }
        return value;
      }
      function walkRunsInTextBody(tb, phase) {
        if (!tb || !tb.paragraphs)
          return;
        const hr = phase === "hydrate" ? "hydrateRunProperties" : "dehydrateRunProperties", hp = phase === "hydrate" ? "hydrateParagraphProperties" : "dehydrateParagraphProperties";
        for (const p of tb.paragraphs) {
          if (p.pPr)
            p.pPr = applyHook(hp, p.pPr);
          for (const r of p.runs || [])
            if (r.rPr)
              r.rPr = applyHook(hr, r.rPr);
        }
      }
      function applyExtensions(presentation, phase) {
        if (!_exts.length || !presentation)
          return presentation;
        const sName = phase === "hydrate" ? "hydrateSettings" : "dehydrateSettings";
        for (const slide of presentation.slides || [])
          for (const shape of slide.shapes || [])
            walkRunsInTextBody(shape.txBody, phase);
        for (const layout of presentation.slideLayouts || [])
          for (const shape of layout.shapes || [])
            walkRunsInTextBody(shape.txBody, phase);
        for (const master of presentation.slideMasters || [])
          for (const shape of master.shapes || [])
            walkRunsInTextBody(shape.txBody, phase);
        applyHook(sName, presentation);
        return presentation;
      }
      return {
        use,
        applyHydrate(presentation) {
          applyExtensions(presentation, "hydrate");
        },
        applyDehydrate(presentation) {
          applyExtensions(presentation, "dehydrate");
        },
        get hasExtensions() {
          return _exts.length > 0;
        },
        get extensions() {
          return _exts.slice();
        }
      };
    }
    return { createWalker };
  } });
    __register({ name: "pptx", dependencies: ["ooxmlErrors","opcPackage","xml","opcRelationships","pptxSlide","pptxTheme","markupCompatibility","pptxPicture","drawingmlChart","drawingmlShape","pptxWalker","ooxmlShared"], factory: function(errors, opc, xml, relsMod, slideMod, themeMod, mc, picMod, chartPartMod, shapeMod, walkerMod, shared) {
    const { ParseError, ContractError } = errors, {
      REL_TYPE,
      CT,
      lookupCT,
      encodeText,
      decodeText,
      createRidAllocator,
      trackUnmodelledParts
    } = shared, P_NS = slideMod.P_NS, A_NS = slideMod.A_NS, R_NS = slideMod.R_NS, REL_TYPE_DOC = REL_TYPE.DOC, CT_PRESENTATION = CT.PRESENTATION;
    function attachSlideImages(slide, slideRels, slidePart, pkg) {
      for (const shape of slide.shapes || [])
        if (shape.type === "picture" && shape.embedRef) {
          const rel = slideRels.find((r) => r.Id === shape.embedRef);
          if (rel && rel.Type === picMod.REL_TYPE_IMAGE) {
            const partName = relsMod.resolveTarget(slidePart, rel.Target), data = pkg.parts[partName];
            if (data) {
              const declared = lookupCT(pkg, partName);
              shape.image = shape.image || {};
              shape.image.data = data;
              shape.image.contentType = declared || picMod.sniffImageType(data);
              shape.image.rId = shape.embedRef;
            }
          }
        } else if (shape.type === "chart" && shape.chartRef) {
          const rel = slideRels.find((r) => r.Id === shape.chartRef);
          if (rel && rel.Type === chartPartMod.REL_TYPE_CHART) {
            const partName = relsMod.resolveTarget(slidePart, rel.Target), data = pkg.parts[partName];
            if (data) {
              shape.chart = chartPartMod.parse(data);
              shape._chartPartName = partName;
              if (shape.chart.embeddedWorkbookRid) {
                const embRel = (pkg.rels[partName] || []).find((r) => r.Id === shape.chart.embeddedWorkbookRid);
                if (embRel) {
                  const embPart = relsMod.resolveTarget(partName, embRel.Target);
                  if (pkg.parts[embPart])
                    shape.chart.embeddedWorkbook = pkg.parts[embPart];
                }
              }
            }
          }
        }
    }
    function defaultMasterContent(layoutRefIds) {
      return {
        type: "slideMaster",
        shapes: [],
        clrMap: xml.el("p:clrMap", {
          bg1: "lt1",
          tx1: "dk1",
          bg2: "lt2",
          tx2: "dk2",
          accent1: "accent1",
          accent2: "accent2",
          accent3: "accent3",
          accent4: "accent4",
          accent5: "accent5",
          accent6: "accent6",
          hlink: "hlink",
          folHlink: "folHlink"
        }),
        layoutIds: layoutRefIds.map((rId, i) => ({
          id: String(2147483649 + i),
          rId
        }))
      };
    }
    function defaultLayoutContent(type, name) {
      return {
        type: "slideLayout",
        layoutType: type || "obj",
        cSldName: name || "Title and Content",
        shapes: [],
        clrMapOvr: xml.el("p:clrMapOvr", {}, [
          xml.el("a:masterClrMapping", {})
        ])
      };
    }
    function archiveLimits(o) {
      return o ? { maxParts: o.maxParts, maxUncompressed: o.maxUncompressed, maxRatio: o.maxRatio } : void 0;
    }
    function read(bytes, opts) {
      const pkg = opc.read(bytes, archiveLimits(opts)), { value: result, unmodelledParts } = trackUnmodelledParts(pkg, readPackage);
      result.unmodelledParts = unmodelledParts;
      return result;
    }
    function readPackage(pkg) {
      const docRel = (pkg.rels["/"] || []).find((r) => r.Type === REL_TYPE_DOC || r.Type.endsWith("/officeDocument"));
      if (!docRel)
        throw new ParseError("pptx/missing-officeDocument-rel", "pptx: no officeDocument relationship");
      const presPart = relsMod.resolveTarget("/", docRel.Target), presBytes = pkg.parts[presPart];
      if (!presBytes)
        throw new ParseError("pptx/missing-presentation-part", "pptx: missing presentation part", { context: { partName: presPart } });
      let presRoot;
      try {
        presRoot = mc.process(xml.parse(decodeText(presBytes)));
      } catch (e) {
        throw new ParseError("pptx/invalid-presentation-xml", "pptx: failed to parse presentation XML", { context: { partName: presPart }, cause: e });
      }
      const presRels = pkg.rels[presPart] || [], sldList = xml.findChild(presRoot, "p:sldIdLst"), slideEntries = sldList ? xml.findAll(sldList, "p:sldId").map((s) => ({
        id: s.attrs.id,
        rId: s.attrs["r:id"]
      })) : [], masterList = xml.findChild(presRoot, "p:sldMasterIdLst"), masterEntries = masterList ? xml.findAll(masterList, "p:sldMasterId").map((m) => ({
        id: m.attrs.id,
        rId: m.attrs["r:id"]
      })) : [];
      let sldSize;
      const ssEl = xml.findChild(presRoot, "p:sldSize");
      if (ssEl) {
        sldSize = {
          cx: Number(ssEl.attrs.cx),
          cy: Number(ssEl.attrs.cy)
        };
        if (ssEl.attrs.type)
          sldSize.type = ssEl.attrs.type;
      }
      const slides = [], slideLayouts = [], slideMasters = [];
      let theme;
      for (const entry of slideEntries) {
        const rel = presRels.find((r) => r.Id === entry.rId);
        if (!rel)
          continue;
        const slidePart = relsMod.resolveTarget(presPart, rel.Target), sBytes = pkg.parts[slidePart];
        if (!sBytes)
          continue;
        const slideRoot = mc.process(xml.parse(decodeText(sBytes))), slide = slideMod.parseSlide(slideRoot), slideRels = pkg.rels[slidePart] || [];
        slide._partName = slidePart;
        attachSlideImages(slide, slideRels, slidePart, pkg);
        slides.push(slide);
        const layoutRel = slideRels.find((r) => r.Type === slideMod.REL_TYPE_SLIDE_LAYOUT);
        if (layoutRel) {
          const layoutPart = relsMod.resolveTarget(slidePart, layoutRel.Target);
          if (!slideLayouts.some((l) => l._partName === layoutPart)) {
            const lBytes = pkg.parts[layoutPart];
            if (lBytes) {
              const layoutRoot = mc.process(xml.parse(decodeText(lBytes))), layout = slideMod.parseSlideLayout(layoutRoot);
              layout._partName = layoutPart;
              slideLayouts.push(layout);
            }
          }
          slide.layoutRef = slideLayouts.findIndex((l) => l._partName === layoutPart);
        }
      }
      for (const entry of masterEntries) {
        const rel = presRels.find((r) => r.Id === entry.rId);
        if (!rel)
          continue;
        const masterPart = relsMod.resolveTarget(presPart, rel.Target), mBytes = pkg.parts[masterPart];
        if (!mBytes)
          continue;
        const masterRoot = mc.process(xml.parse(decodeText(mBytes))), master = slideMod.parseSlideMaster(masterRoot);
        master._partName = masterPart;
        slideMasters.push(master);
        const themeRel = (pkg.rels[masterPart] || []).find((r) => r.Type === themeMod.REL_TYPE_THEME);
        if (themeRel && !theme) {
          const themePart = relsMod.resolveTarget(masterPart, themeRel.Target), tBytes = pkg.parts[themePart];
          if (tBytes)
            theme = themeMod.parse(tBytes);
        }
      }
      for (const s of slides) {
        delete s._partName;
        for (const sp of s.shapes || [])
          delete sp._chartPartName;
      }
      for (const l of slideLayouts)
        delete l._partName;
      for (const m of slideMasters)
        delete m._partName;
      const presentation = { type: "presentation", slides };
      if (slideLayouts.length)
        presentation.slideLayouts = slideLayouts;
      if (slideMasters.length)
        presentation.slideMasters = slideMasters;
      if (theme)
        presentation.theme = theme;
      if (sldSize)
        presentation.sldSize = sldSize;
      walker.applyHydrate(presentation);
      return { presentation, package: pkg };
    }
    const walker = walkerMod.createWalker();
    function use(...extensions) {
      walker.use(...extensions);
      return api;
    }
    function write(pres) {
      if (pres == null || typeof pres !== "object" || Array.isArray(pres))
        throw new ContractError("pptx/invalid-presentation", "pptx.write: presentation must be an object with a slides array", { context: { received: pres === null ? "null" : typeof pres } });
      if (pres.slides !== void 0 && !Array.isArray(pres.slides))
        throw new ContractError("pptx/invalid-slides", "pptx.write: presentation.slides must be an array", { context: { path: "slides", received: typeof pres.slides } });
      if (walker.hasExtensions)
        walker.applyDehydrate(pres);
      const pkg = opc.empty(), slides = pres.slides || [], theme = pres.theme || themeMod.defaults();
      let layouts = pres.slideLayouts;
      if (!layouts || !layouts.length)
        layouts = [defaultLayoutContent("obj", "Title and Content")];
      const masterRels = layouts.map((_, i) => `rId${i + 1}`);
      let masters = pres.slideMasters;
      if (!masters || !masters.length)
        masters = [defaultMasterContent(masterRels)];
      else
        for (const m of masters)
          if (!m.layoutIds)
            m.layoutIds = masterRels.map((rId, i) => ({
              id: String(2147483649 + i),
              rId
            }));
      opc.setPart(pkg, "/ppt/theme/theme1.xml", themeMod.bytesOf(theme), themeMod.CT_THEME);
      masters.forEach((master, i) => {
        const masterPath = `/ppt/slideMasters/slideMaster${i + 1}.xml`;
        opc.setPart(pkg, masterPath, slideMod.slideMasterBytes(master), slideMod.CT_SLIDE_MASTER);
        const masterRelsArr = [];
        layouts.forEach((_, j) => {
          masterRelsArr.push({
            Id: `rId${j + 1}`,
            Type: slideMod.REL_TYPE_SLIDE_LAYOUT,
            Target: `../slideLayouts/slideLayout${j + 1}.xml`
          });
        });
        masterRelsArr.push({
          Id: `rId${layouts.length + 1}`,
          Type: themeMod.REL_TYPE_THEME,
          Target: "../theme/theme1.xml"
        });
        opc.setRels(pkg, masterPath, masterRelsArr);
      });
      layouts.forEach((layout, j) => {
        const layoutPath = `/ppt/slideLayouts/slideLayout${j + 1}.xml`;
        opc.setPart(pkg, layoutPath, slideMod.slideLayoutBytes(layout), slideMod.CT_SLIDE_LAYOUT);
        opc.setRels(pkg, layoutPath, [{
          Id: "rId1",
          Type: slideMod.REL_TYPE_SLIDE_MASTER,
          Target: "../slideMasters/slideMaster1.xml"
        }]);
      });
      const usedExts = new Set;
      let nextImageIdx = 1, nextChartIdx = 1;
      const chartParts = [];
      slides.forEach((slide, k) => {
        const node = normalizeSlide(slide), slidePath = `/ppt/slides/slide${k + 1}.xml`, slideRels = [], ridAlloc = createRidAllocator({ prefix: "rId", start: 1 }), seenData = new Map;
        for (const shape of node.shapes || [])
          if (shape.type === "picture" && shape.image && shape.image.data) {
            let item = seenData.get(shape.image.data);
            if (!item) {
              const ct = shape.image.contentType || picMod.sniffImageType(shape.image.data), ext = picMod.extensionFor(ct), fileName = shape.image.fileName || `image${nextImageIdx++}.${ext}`;
              item = {
                rId: ridAlloc.claim(shape.image.rId || shape.embedRef),
                data: shape.image.data,
                contentType: ct,
                fileName,
                partName: "/ppt/media/" + fileName
              };
              seenData.set(shape.image.data, item);
              opc.setPart(pkg, item.partName, item.data, item.contentType);
              usedExts.add(ext);
              slideRels.push({
                Id: item.rId,
                Type: picMod.REL_TYPE_IMAGE,
                Target: "../media/" + fileName
              });
            }
            shape.embedRef = item.rId;
          } else if (shape.type === "chart" && shape.chart) {
            const chartIdx = nextChartIdx++, chartFile = `chart${chartIdx}.xml`, partName = "/ppt/charts/" + chartFile;
            if (shape.chart.embeddedWorkbook) {
              const embFile = `Microsoft_Excel_Worksheet${chartIdx}.xlsx`, embPath = "/ppt/embeddings/" + embFile;
              opc.setPart(pkg, embPath, shape.chart.embeddedWorkbook, chartPartMod.CT_EMBEDDED_XLSX);
              pkg.contentTypes.overrides[embPath] = chartPartMod.CT_EMBEDDED_XLSX;
              shape.chart.embeddedWorkbookRid = "rId1";
              opc.setRels(pkg, partName, [{
                Id: "rId1",
                Type: chartPartMod.REL_TYPE_PACKAGE,
                Target: "../embeddings/" + embFile
              }]);
            }
            opc.setPart(pkg, partName, chartPartMod.bytesOf(shape.chart), chartPartMod.CT_CHART);
            chartParts.push(partName);
            const finalRid = ridAlloc.claim(shape.chartRef);
            slideRels.push({
              Id: finalRid,
              Type: chartPartMod.REL_TYPE_CHART,
              Target: "../charts/" + chartFile
            });
            shape.chartRef = finalRid;
          }
        const layoutRid = ridAlloc.next(), layoutIdx = slide.layoutRef != null && slide.layoutRef < layouts.length ? slide.layoutRef : 0;
        slideRels.push({
          Id: layoutRid,
          Type: slideMod.REL_TYPE_SLIDE_LAYOUT,
          Target: `../slideLayouts/slideLayout${layoutIdx + 1}.xml`
        });
        opc.setPart(pkg, slidePath, slideMod.slideBytes(node), slideMod.CT_SLIDE);
        opc.setRels(pkg, slidePath, slideRels);
      });
      for (const ext of usedExts)
        pkg.contentTypes.defaults[ext] = picMod.extToContentType(ext);
      for (const partName of chartParts)
        pkg.contentTypes.overrides[partName] = chartPartMod.CT_CHART;
      const presChildren = [];
      presChildren.push(xml.el("p:sldMasterIdLst", {}, masters.map((_, i) => xml.el("p:sldMasterId", {
        id: String(2147483648 + i),
        "r:id": `rIdMaster${i + 1}`
      }))));
      presChildren.push(xml.el("p:sldIdLst", {}, slides.map((_, k) => xml.el("p:sldId", {
        id: String(256 + k),
        "r:id": `rIdSlide${k + 1}`
      }))));
      const sldSize = pres.sldSize || { cx: 9144000, cy: 6858000, type: "screen4x3" }, sa = { cx: String(sldSize.cx), cy: String(sldSize.cy) };
      if (sldSize.type)
        sa.type = sldSize.type;
      presChildren.push(xml.el("p:sldSize", sa));
      presChildren.push(xml.el("p:notesSz", { cx: "6858000", cy: "9144000" }));
      const presXml = xml.serialize(xml.el("p:presentation", { "xmlns:p": P_NS, "xmlns:a": A_NS, "xmlns:r": R_NS }, presChildren));
      opc.setPart(pkg, "/ppt/presentation.xml", encodeText(presXml), CT_PRESENTATION);
      const presRels = [];
      masters.forEach((_, i) => presRels.push({
        Id: `rIdMaster${i + 1}`,
        Type: slideMod.REL_TYPE_SLIDE_MASTER,
        Target: `slideMasters/slideMaster${i + 1}.xml`
      }));
      slides.forEach((_, k) => presRels.push({
        Id: `rIdSlide${k + 1}`,
        Type: slideMod.REL_TYPE_SLIDE,
        Target: `slides/slide${k + 1}.xml`
      }));
      opc.setRels(pkg, "/ppt/presentation.xml", presRels);
      opc.setRels(pkg, "/", [{
        Id: "rId1",
        Type: REL_TYPE_DOC,
        Target: "ppt/presentation.xml"
      }]);
      return opc.write(pkg);
    }
    function normalizeSlide(slide) {
      if (slide.shapes)
        return slide;
      if (slide.title != null || slide.body && slide.body.length)
        return slideMod.fromTitleBody(slide);
      if (slide.paragraphs)
        return {
          type: "slide",
          shapes: [{
            type: "shape",
            id: 2,
            name: "Text Body",
            placeholder: { idx: 1 },
            txBody: {
              paragraphs: slide.paragraphs.map((line) => ({
                runs: [{ type: "text", value: String(line) }]
              }))
            }
          }]
        };
      return { type: "slide", shapes: [] };
    }
    function fromTitleBody(args) {
      return slideMod.fromTitleBody(args);
    }
    function extractTitle(slide) {
      return slideMod.extractTitle(slide);
    }
    function extractBody(slide) {
      return slideMod.extractBody(slide);
    }
    function picture(data, opts) {
      return picMod.image(data, opts);
    }
    function shape(geom, opts = {}) {
      const props = shapeMod.shapeProps({ geom, ...opts }), out = {
        type: "shape",
        id: opts.id != null ? opts.id : 4,
        name: opts.name || "Shape",
        shapeProps: props
      };
      if (opts.text != null)
        if (typeof opts.text === "string")
          out.txBody = {
            paragraphs: [{
              runs: [{ type: "text", value: opts.text }]
            }]
          };
        else
          out.txBody = opts.text;
      return out;
    }
    function chart(spec, opts = {}) {
      return {
        type: "chart",
        cx: opts.cx || 6000000,
        cy: opts.cy || 4000000,
        offsetX: opts.offsetX || 0,
        offsetY: opts.offsetY || 0,
        name: opts.name || "Chart",
        ...opts.id != null ? { id: opts.id } : {},
        chart: spec
      };
    }
    const api = {
      read,
      write,
      use,
      fromTitleBody,
      extractTitle,
      extractBody,
      picture,
      chart,
      shape,
      PRESETS: shapeMod.PRESETS
    };
    return api;
  } });

    const __core = __resolve("pptx");
    return __core;
    }
};
