/*!
 * Copyright (c) 2026 AwaCloud SAS
 * Author: Matthieu Bouilloux
 * SPDX-License-Identifier: AGPL-3.0-only
 * Dual-licensed; see the NOTICE file for licensing and any additional terms.
 */
/* GENERATED — do not edit. Source: packages/front/office/ooxml/tools/generate-bundles.mjs */

/**
 * @fileoverview `@awacloud/ooxml/bundles/prebuilt/pptx-large-package` — pre-built single-factory bundle.
 *
 * Variant **package** : declares the 7 fw modules as dependencies and inlines every
 * ooxml-local factory transitively reachable from `pptx` plus 12 extras.
 *
 * @module ooxml/bundles/prebuilt/pptx-large-package
 */

export const pptxLargePackage = {
    name: "pptxLargePackage",
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
    __register({ name: "pmlAnimations", dependencies: ["xml"], factory: function(xml) {
    const TIME_NODE_TAGS = new Set([
      "p:par",
      "p:seq",
      "p:excl",
      "p:anim",
      "p:animClr",
      "p:animEffect",
      "p:animMotion",
      "p:animRot",
      "p:animScale",
      "p:audio",
      "p:video",
      "p:cmd",
      "p:set"
    ]), BLD_TAGS = new Set([
      "p:bldP",
      "p:bldDgm",
      "p:bldGraphic",
      "p:bldOleChart",
      "p:bldSub"
    ]);
    function parseCondLst(el, kind) {
      const out = { kind, conds: [] };
      for (const c of el.children || []) {
        if (c.type !== "element")
          continue;
        if (c.name === "p:cond")
          out.conds.push(parseCond(c));
      }
      return out;
    }
    function parseCond(el) {
      const out = { kind: "cond", attrs: { ...el.attrs } };
      for (const c of el.children || []) {
        if (c.type !== "element")
          continue;
        if (c.name === "p:tgtEl")
          out.tgtEl = parseTgtEl(c);
        else if (c.name === "p:tn")
          out.tn = { ...c.attrs };
        else if (c.name === "p:rtn")
          out.rtn = { ...c.attrs };
      }
      return out;
    }
    function parseTgtEl(el) {
      const out = { kind: "tgtEl" };
      for (const c of el.children || []) {
        if (c.type !== "element")
          continue;
        if (c.name === "p:spTgt")
          out.spTgt = parseSpTgt(c);
        else if (c.name === "p:sldTgt")
          out.sldTgt = { ...c.attrs };
        else if (c.name === "p:sndTgt")
          out.sndTgt = { ...c.attrs };
        else if (c.name === "p:inkTgt")
          out.inkTgt = { ...c.attrs };
      }
      return out;
    }
    function parseSpTgt(el) {
      const out = { kind: "spTgt", attrs: { ...el.attrs } };
      for (const c of el.children || []) {
        if (c.type !== "element")
          continue;
        if (c.name === "p:bg")
          out.bg = !0;
        else if (c.name === "p:txEl")
          out.txEl = parseTxEl(c);
        else if (c.name === "p:subSp")
          out.subSp = { ...c.attrs };
        else if (c.name === "p:oleChartEl")
          out.oleChartEl = { ...c.attrs };
        else if (c.name === "p:graphicEl")
          out.graphicEl = !0;
      }
      return out;
    }
    function parseTxEl(el) {
      const out = { kind: "txEl" };
      for (const c of el.children || []) {
        if (c.type !== "element")
          continue;
        if (c.name === "p:charRg")
          out.charRg = { ...c.attrs };
        else if (c.name === "p:pRg")
          out.pRg = { ...c.attrs };
      }
      return out;
    }
    function parseIterate(el) {
      const out = { kind: "iterate", attrs: { ...el.attrs } };
      for (const c of el.children || []) {
        if (c.type !== "element")
          continue;
        if (c.name === "p:tmAbs")
          out.tmAbs = { ...c.attrs };
        else if (c.name === "p:tmPct")
          out.tmPct = { ...c.attrs };
      }
      return out;
    }
    function parseTavLst(el) {
      const out = { kind: "tavLst", tavs: [] };
      for (const c of el.children || [])
        if (c.type === "element" && c.name === "p:tav")
          out.tavs.push(parseTav(c));
      return out;
    }
    function parseTav(el) {
      const out = { kind: "tav", attrs: { ...el.attrs } };
      for (const c of el.children || []) {
        if (c.type !== "element")
          continue;
        if (c.name === "p:val")
          out.val = parseAnimVal(c);
      }
      return out;
    }
    function parseAnimVal(el) {
      let kind;
      switch (el.name) {
        case "p:val":
          kind = "val";
          break;
        case "p:to":
          kind = "to";
          break;
        case "p:from":
          kind = "from";
          break;
        case "p:by":
          kind = "by";
          break;
        case "p:progress":
          kind = "progress";
          break;
        default:
          kind = el.name.replace(/^p:/, "");
      }
      const out = { kind, attrs: { ...el.attrs } };
      for (const c of el.children || []) {
        if (c.type !== "element")
          continue;
        if (c.name === "p:strVal")
          out.strVal = { ...c.attrs };
        else if (c.name === "p:boolVal")
          out.boolVal = { ...c.attrs };
        else if (c.name === "p:intVal")
          out.intVal = { ...c.attrs };
        else if (c.name === "p:fltVal")
          out.fltVal = { ...c.attrs };
        else if (c.name === "p:clrVal")
          out.clrVal = parseClrVal(c);
      }
      return out;
    }
    function parseClrVal(el) {
      const out = { kind: "clrVal" };
      for (const c of el.children || []) {
        if (c.type !== "element")
          continue;
        if (c.name === "p:rgb")
          out.rgb = { ...c.attrs };
        else if (c.name === "p:hsl")
          out.hsl = { ...c.attrs };
      }
      return out;
    }
    function parseAttrNameLst(el) {
      const out = { kind: "attrNameLst", names: [] };
      for (const c of el.children || [])
        if (c.type === "element" && c.name === "p:attrName")
          out.names.push(xml.textContent(c));
      return out;
    }
    function parseCBhvr(el) {
      const out = { kind: "cBhvr", attrs: { ...el.attrs } };
      for (const c of el.children || []) {
        if (c.type !== "element")
          continue;
        if (c.name === "p:cTn")
          out.cTn = parseCTn(c);
        else if (c.name === "p:tgtEl")
          out.tgtEl = parseTgtEl(c);
        else if (c.name === "p:attrNameLst")
          out.attrNameLst = parseAttrNameLst(c);
      }
      return out;
    }
    function parseCMediaNode(el) {
      const out = { kind: "cMediaNode", attrs: { ...el.attrs } };
      for (const c of el.children || []) {
        if (c.type !== "element")
          continue;
        if (c.name === "p:cTn")
          out.cTn = parseCTn(c);
        else if (c.name === "p:tgtEl")
          out.tgtEl = parseTgtEl(c);
      }
      return out;
    }
    function parseCmd(el) {
      const out = { kind: "cmd", attrs: { ...el.attrs } };
      for (const c of el.children || []) {
        if (c.type !== "element")
          continue;
        if (c.name === "p:cBhvr")
          out.cBhvr = parseCBhvr(c);
      }
      return out;
    }
    function parseCTn(el) {
      const out = { kind: "cTn", attrs: { ...el.attrs } };
      for (const c of el.children || []) {
        if (c.type !== "element")
          continue;
        switch (c.name) {
          case "p:stCondLst":
            out.stCondLst = parseCondLst(c, "stCondLst");
            break;
          case "p:endCondLst":
            out.endCondLst = parseCondLst(c, "endCondLst");
            break;
          case "p:prevCondLst":
            out.prevCondLst = parseCondLst(c, "prevCondLst");
            break;
          case "p:nextCondLst":
            out.nextCondLst = parseCondLst(c, "nextCondLst");
            break;
          case "p:childTnLst":
            out.childTnLst = parseChildTnLst(c);
            break;
          case "p:subTnLst":
            out.subTnLst = parseChildTnLst(c, "subTnLst");
            break;
          case "p:iterate":
            out.iterate = parseIterate(c);
            break;
          case "p:endSync":
            out.endSync = parseCond(c);
            break;
        }
      }
      return out;
    }
    function parseChildTnLst(el, kind = "childTnLst") {
      const out = { kind, children: [] };
      for (const c of el.children || [])
        if (c.type === "element" && TIME_NODE_TAGS.has(c.name))
          out.children.push(parseTimeNode(c));
      return out;
    }
    function parseTimeNode(el) {
      let kind;
      switch (el.name) {
        case "p:par":
          kind = "par";
          break;
        case "p:seq":
          kind = "seq";
          break;
        case "p:excl":
          kind = "excl";
          break;
        case "p:anim":
          kind = "anim";
          break;
        case "p:animClr":
          kind = "animClr";
          break;
        case "p:animEffect":
          kind = "animEffect";
          break;
        case "p:animMotion":
          kind = "animMotion";
          break;
        case "p:animRot":
          kind = "animRot";
          break;
        case "p:animScale":
          kind = "animScale";
          break;
        case "p:audio":
          kind = "audio";
          break;
        case "p:video":
          kind = "video";
          break;
        case "p:cmd":
          kind = "cmd";
          break;
        case "p:set":
          kind = "set";
          break;
        default:
          kind = el.name.replace(/^p:/, "");
      }
      const node = { kind, attrs: { ...el.attrs } };
      for (const c of el.children || []) {
        if (c.type !== "element")
          continue;
        switch (c.name) {
          case "p:cTn":
            node.cTn = parseCTn(c);
            break;
          case "p:cBhvr":
            node.cBhvr = parseCBhvr(c);
            break;
          case "p:cMediaNode":
            node.cMediaNode = parseCMediaNode(c);
            break;
          case "p:to":
            node.to = parseAnimVal(c);
            break;
          case "p:from":
            node.from = parseAnimVal(c);
            break;
          case "p:by":
            node.by = parseAnimVal(c);
            break;
          case "p:tavLst":
            node.tavLst = parseTavLst(c);
            break;
          case "p:progress":
            node.progress = parseAnimVal(c);
            break;
          case "p:wheel":
            node.wheel = { ...c.attrs };
            break;
          case "p:videoClr":
            node.videoClr = { ...c.attrs };
            break;
        }
      }
      return node;
    }
    function parseBld(el) {
      let local;
      switch (el.name) {
        case "p:bldP":
          local = "bldP";
          break;
        case "p:bldDgm":
          local = "bldDgm";
          break;
        case "p:bldGraphic":
          local = "bldGraphic";
          break;
        case "p:bldOleChart":
          local = "bldOleChart";
          break;
        case "p:bldSub":
          local = "bldSub";
          break;
        default:
          local = el.name.replace(/^p:/, "");
      }
      const out = { kind: local, attrs: { ...el.attrs } };
      for (const c of el.children || []) {
        if (c.type !== "element")
          continue;
        if (c.name === "p:tmplLst")
          out.tmplLst = (c.children || []).filter((x) => x.type === "element" && x.name === "p:tmpl").map((t) => ({ kind: "tmpl", attrs: { ...t.attrs } }));
        else if (c.name === "p:bldAsOne")
          out.bldAsOne = !0;
        else if (c.name === "p:bldSub")
          out.bldSub = { kind: "bldSub", attrs: { ...c.attrs } };
      }
      return out;
    }
    function parseBldLst(el) {
      const out = [];
      for (const c of el.children || [])
        if (c.type === "element" && BLD_TAGS.has(c.name))
          out.push(parseBld(c));
      return out;
    }
    function parseTiming(timingEl) {
      if (!timingEl)
        return;
      const out = { kind: "timing" }, tnLst = xml.findChild(timingEl, "p:tnLst");
      if (tnLst) {
        out.tnLst = [];
        for (const c of tnLst.children || [])
          if (c.type === "element" && TIME_NODE_TAGS.has(c.name))
            out.tnLst.push(parseTimeNode(c));
      }
      const bldLst = xml.findChild(timingEl, "p:bldLst");
      if (bldLst)
        out.bldLst = parseBldLst(bldLst);
      return out;
    }
    function renderCondLst(node) {
      const conds = (node.conds || []).map(renderCond);
      switch (node.kind) {
        case "stCondLst":
          return xml.el("p:stCondLst", {}, conds);
        case "endCondLst":
          return xml.el("p:endCondLst", {}, conds);
        case "prevCondLst":
          return xml.el("p:prevCondLst", {}, conds);
        case "nextCondLst":
          return xml.el("p:nextCondLst", {}, conds);
        default:
          return xml.el("p:" + node.kind, {}, conds);
      }
    }
    function renderCond(c) {
      const kids = [];
      if (c.tgtEl)
        kids.push(renderTgtEl(c.tgtEl));
      if (c.tn)
        kids.push(xml.el("p:tn", c.tn));
      if (c.rtn)
        kids.push(xml.el("p:rtn", c.rtn));
      return xml.el("p:cond", c.attrs || {}, kids);
    }
    function renderTgtEl(t) {
      const kids = [];
      if (t.spTgt)
        kids.push(renderSpTgt(t.spTgt));
      if (t.sldTgt)
        kids.push(xml.el("p:sldTgt", t.sldTgt));
      if (t.sndTgt)
        kids.push(xml.el("p:sndTgt", t.sndTgt));
      if (t.inkTgt)
        kids.push(xml.el("p:inkTgt", t.inkTgt));
      return xml.el("p:tgtEl", {}, kids);
    }
    function renderSpTgt(s) {
      const kids = [];
      if (s.bg)
        kids.push(xml.el("p:bg", {}));
      if (s.txEl)
        kids.push(renderTxEl(s.txEl));
      if (s.subSp)
        kids.push(xml.el("p:subSp", s.subSp));
      if (s.oleChartEl)
        kids.push(xml.el("p:oleChartEl", s.oleChartEl));
      if (s.graphicEl)
        kids.push(xml.el("p:graphicEl", {}));
      return xml.el("p:spTgt", s.attrs || {}, kids);
    }
    function renderTxEl(t) {
      const kids = [];
      if (t.charRg)
        kids.push(xml.el("p:charRg", t.charRg));
      if (t.pRg)
        kids.push(xml.el("p:pRg", t.pRg));
      return xml.el("p:txEl", {}, kids);
    }
    function renderIterate(it) {
      const kids = [];
      if (it.tmAbs)
        kids.push(xml.el("p:tmAbs", it.tmAbs));
      if (it.tmPct)
        kids.push(xml.el("p:tmPct", it.tmPct));
      return xml.el("p:iterate", it.attrs || {}, kids);
    }
    function renderTavLst(t) {
      return xml.el("p:tavLst", {}, (t.tavs || []).map(renderTav));
    }
    function renderTav(t) {
      const kids = [];
      if (t.val)
        kids.push(renderAnimVal(t.val));
      return xml.el("p:tav", t.attrs || {}, kids);
    }
    function renderAnimVal(v) {
      const kids = renderValChildren(v), attrs = v.attrs || {};
      switch (v.kind) {
        case "val":
          return xml.el("p:val", attrs, kids);
        case "to":
          return xml.el("p:to", attrs, kids);
        case "from":
          return xml.el("p:from", attrs, kids);
        case "by":
          return xml.el("p:by", attrs, kids);
        case "progress":
          return xml.el("p:progress", attrs, kids);
        default:
          return xml.el("p:" + v.kind, attrs, kids);
      }
    }
    function renderClrVal(c) {
      const kids = [];
      if (c.rgb)
        kids.push(xml.el("p:rgb", c.rgb));
      if (c.hsl)
        kids.push(xml.el("p:hsl", c.hsl));
      return xml.el("p:clrVal", {}, kids);
    }
    function renderAttrNameLst(a) {
      return xml.el("p:attrNameLst", {}, (a.names || []).map((n) => xml.el("p:attrName", {}, [xml.text(n)])));
    }
    function renderCBhvr(b) {
      const kids = [];
      if (b.cTn)
        kids.push(renderCTn(b.cTn));
      if (b.tgtEl)
        kids.push(renderTgtEl(b.tgtEl));
      if (b.attrNameLst)
        kids.push(renderAttrNameLst(b.attrNameLst));
      return xml.el("p:cBhvr", b.attrs || {}, kids);
    }
    function renderCMediaNode(m) {
      const kids = [];
      if (m.cTn)
        kids.push(renderCTn(m.cTn));
      if (m.tgtEl)
        kids.push(renderTgtEl(m.tgtEl));
      return xml.el("p:cMediaNode", m.attrs || {}, kids);
    }
    function renderCmd(c) {
      const kids = [];
      if (c.cBhvr)
        kids.push(renderCBhvr(c.cBhvr));
      return xml.el("p:cmd", c.attrs || {}, kids);
    }
    function renderCTn(c) {
      const kids = [];
      if (c.stCondLst)
        kids.push(renderCondLst(c.stCondLst));
      if (c.endCondLst)
        kids.push(renderCondLst(c.endCondLst));
      if (c.prevCondLst)
        kids.push(renderCondLst(c.prevCondLst));
      if (c.nextCondLst)
        kids.push(renderCondLst(c.nextCondLst));
      if (c.iterate)
        kids.push(renderIterate(c.iterate));
      if (c.childTnLst && c.childTnLst.children && c.childTnLst.children.length)
        kids.push(xml.el("p:childTnLst", {}, c.childTnLst.children.map(renderTimeNode)));
      if (c.subTnLst && c.subTnLst.children && c.subTnLst.children.length)
        kids.push(xml.el("p:subTnLst", {}, c.subTnLst.children.map(renderTimeNode)));
      if (c.endSync)
        kids.push(xml.el("p:endSync", c.endSync.attrs || {}));
      return xml.el("p:cTn", c.attrs || {}, kids);
    }
    function renderTimeNode(node) {
      const kids = [];
      if (node.cTn)
        kids.push(renderCTn(node.cTn));
      if (node.cBhvr)
        kids.push(renderCBhvr(node.cBhvr));
      if (node.cMediaNode)
        kids.push(renderCMediaNode(node.cMediaNode));
      if (node.from)
        kids.push(xml.el("p:from", node.from.attrs || {}, renderValChildren(node.from)));
      if (node.to)
        kids.push(xml.el("p:to", node.to.attrs || {}, renderValChildren(node.to)));
      if (node.by)
        kids.push(xml.el("p:by", node.by.attrs || {}, renderValChildren(node.by)));
      if (node.tavLst)
        kids.push(renderTavLst(node.tavLst));
      if (node.progress)
        kids.push(xml.el("p:progress", node.progress.attrs || {}, renderValChildren(node.progress)));
      if (node.wheel)
        kids.push(xml.el("p:wheel", node.wheel));
      if (node.videoClr)
        kids.push(xml.el("p:videoClr", node.videoClr));
      const attrs = node.attrs || {};
      switch (node.kind) {
        case "par":
          return xml.el("p:par", attrs, kids);
        case "seq":
          return xml.el("p:seq", attrs, kids);
        case "excl":
          return xml.el("p:excl", attrs, kids);
        case "anim":
          return xml.el("p:anim", attrs, kids);
        case "animClr":
          return xml.el("p:animClr", attrs, kids);
        case "animEffect":
          return xml.el("p:animEffect", attrs, kids);
        case "animMotion":
          return xml.el("p:animMotion", attrs, kids);
        case "animRot":
          return xml.el("p:animRot", attrs, kids);
        case "animScale":
          return xml.el("p:animScale", attrs, kids);
        case "audio":
          return xml.el("p:audio", attrs, kids);
        case "video":
          return xml.el("p:video", attrs, kids);
        case "cmd":
          return xml.el("p:cmd", attrs, kids);
        case "set":
          return xml.el("p:set", attrs, kids);
        default:
          return xml.el("p:" + node.kind, attrs, kids);
      }
    }
    function renderValChildren(v) {
      const kids = [];
      if (v.strVal)
        kids.push(xml.el("p:strVal", v.strVal));
      if (v.boolVal)
        kids.push(xml.el("p:boolVal", v.boolVal));
      if (v.intVal)
        kids.push(xml.el("p:intVal", v.intVal));
      if (v.fltVal)
        kids.push(xml.el("p:fltVal", v.fltVal));
      if (v.clrVal)
        kids.push(renderClrVal(v.clrVal));
      return kids;
    }
    function renderBld(b) {
      const kids = [];
      if (b.tmplLst && b.tmplLst.length)
        kids.push(xml.el("p:tmplLst", {}, b.tmplLst.map((t) => xml.el("p:tmpl", t.attrs || {}))));
      if (b.bldAsOne)
        kids.push(xml.el("p:bldAsOne", {}));
      if (b.bldSub)
        kids.push(xml.el("p:bldSub", b.bldSub.attrs || {}));
      const attrs = b.attrs || {};
      switch (b.kind) {
        case "bldP":
          return xml.el("p:bldP", attrs, kids);
        case "bldDgm":
          return xml.el("p:bldDgm", attrs, kids);
        case "bldGraphic":
          return xml.el("p:bldGraphic", attrs, kids);
        case "bldOleChart":
          return xml.el("p:bldOleChart", attrs, kids);
        case "bldSub":
          return xml.el("p:bldSub", attrs, kids);
        default:
          return xml.el("p:" + b.kind, attrs, kids);
      }
    }
    function renderTiming(timing) {
      if (!timing)
        return null;
      const kids = [];
      if (timing.tnLst)
        kids.push(xml.el("p:tnLst", {}, timing.tnLst.map(renderTimeNode)));
      if (timing.bldLst)
        kids.push(xml.el("p:bldLst", {}, timing.bldLst.map(renderBld)));
      return xml.el("p:timing", {}, kids);
    }
    return {
      parseTiming,
      renderTiming,
      parseTimeNode,
      renderTimeNode,
      parseCTn,
      renderCTn,
      parseCBhvr,
      renderCBhvr,
      parseCond,
      renderCond,
      parseTgtEl,
      renderTgtEl,
      parseSpTgt,
      renderSpTgt,
      parseTxEl,
      renderTxEl,
      parseIterate,
      renderIterate,
      parseTavLst,
      renderTavLst,
      parseAnimVal,
      renderAnimVal,
      parseClrVal,
      renderClrVal,
      parseCMediaNode,
      renderCMediaNode,
      parseCmd,
      renderCmd,
      parseAttrNameLst,
      renderAttrNameLst,
      parseBld,
      renderBld,
      TIME_NODE_TAGS,
      BLD_TAGS
    };
  } });
    __register({ name: "pmlTransitions", dependencies: ["xml"], factory: function(xml) {
    const EFFECT_TAGS = [
      "cut",
      "fade",
      "wipe",
      "push",
      "split",
      "dissolve",
      "pull",
      "wedge",
      "wheel",
      "cover",
      "uncover",
      "zoom",
      "randomBar",
      "comb",
      "flash",
      "circle",
      "diamond",
      "plus",
      "newsflash",
      "random",
      "blinds",
      "checker",
      "strips"
    ];
    function parseTransition(el) {
      if (!el)
        return;
      const out = { attrs: { ...el.attrs } };
      for (const c of el.children || []) {
        if (c.type !== "element")
          continue;
        switch (c.name) {
          case "p:cut":
          case "p:fade":
          case "p:wipe":
          case "p:push":
          case "p:split":
          case "p:dissolve":
          case "p:pull":
          case "p:wedge":
          case "p:wheel":
          case "p:cover":
          case "p:uncover":
          case "p:zoom":
          case "p:randomBar":
          case "p:comb":
          case "p:flash":
          case "p:circle":
          case "p:diamond":
          case "p:plus":
          case "p:newsflash":
          case "p:random":
          case "p:blinds":
          case "p:checker":
          case "p:strips":
            out.effect = { kind: c.name.replace(/^p:/, ""), attrs: { ...c.attrs } };
            break;
          case "p:sndAc":
            out.sndAc = parseSoundAction(c);
            break;
          case "p:extLst":
            out.extLst = !0;
            break;
        }
      }
      return out;
    }
    function parseSoundAction(el) {
      const out = { kind: "sndAc" }, stSnd = xml.findChild(el, "p:stSnd");
      if (stSnd) {
        out.startSound = { ...stSnd.attrs };
        const snd = xml.findChild(stSnd, "p:snd");
        if (snd)
          out.startSound = { ...out.startSound, ...snd.attrs };
      }
      if (xml.findChild(el, "p:endSnd"))
        out.endSound = !0;
      return out;
    }
    function renderEffect(effect) {
      const a = effect.attrs || {};
      switch (effect.kind) {
        case "cut":
          return xml.el("p:cut", a);
        case "fade":
          return xml.el("p:fade", a);
        case "wipe":
          return xml.el("p:wipe", a);
        case "push":
          return xml.el("p:push", a);
        case "split":
          return xml.el("p:split", a);
        case "dissolve":
          return xml.el("p:dissolve", a);
        case "pull":
          return xml.el("p:pull", a);
        case "wedge":
          return xml.el("p:wedge", a);
        case "wheel":
          return xml.el("p:wheel", a);
        case "cover":
          return xml.el("p:cover", a);
        case "uncover":
          return xml.el("p:uncover", a);
        case "zoom":
          return xml.el("p:zoom", a);
        case "randomBar":
          return xml.el("p:randomBar", a);
        case "comb":
          return xml.el("p:comb", a);
        case "flash":
          return xml.el("p:flash", a);
        case "circle":
          return xml.el("p:circle", a);
        case "diamond":
          return xml.el("p:diamond", a);
        case "plus":
          return xml.el("p:plus", a);
        case "newsflash":
          return xml.el("p:newsflash", a);
        case "random":
          return xml.el("p:random", a);
        case "blinds":
          return xml.el("p:blinds", a);
        case "checker":
          return xml.el("p:checker", a);
        case "strips":
          return xml.el("p:strips", a);
        default:
          return xml.el("p:" + effect.kind, a);
      }
    }
    function renderTransition(t) {
      if (!t)
        return null;
      const kids = [];
      if (t.effect)
        kids.push(renderEffect(t.effect));
      if (t.sndAc) {
        const sndKids = [];
        if (t.sndAc.startSound)
          sndKids.push(xml.el("p:stSnd", t.sndAc.startSound));
        if (t.sndAc.endSound)
          sndKids.push(xml.el("p:endSnd", {}));
        kids.push(xml.el("p:sndAc", {}, sndKids));
      }
      return xml.el("p:transition", t.attrs || {}, kids);
    }
    return { parseTransition, renderTransition, parseSoundAction, renderEffect, EFFECT_TAGS };
  } });
    __register({ name: "pmlNotes", dependencies: ["xml"], factory: function(xml) {
    function parseHf(el) {
      return { kind: "hf", attrs: { ...el.attrs } };
    }
    function renderHf(hf) {
      return xml.el("p:hf", hf.attrs || {});
    }
    function parseClrMapOvr(el) {
      const out = { kind: "clrMapOvr" };
      for (const c of el.children || []) {
        if (c.type !== "element")
          continue;
        if (c.name === "a:masterClrMapping")
          out.masterClrMapping = !0;
        else if (c.name === "a:overrideClrMapping")
          out.overrideClrMapping = { ...c.attrs };
      }
      return out;
    }
    function renderClrMapOvr(c) {
      const kids = [];
      if (c.masterClrMapping)
        kids.push(xml.el("a:masterClrMapping", {}));
      if (c.overrideClrMapping)
        kids.push(xml.el("a:overrideClrMapping", c.overrideClrMapping));
      return xml.el("p:clrMapOvr", {}, kids);
    }
    function parseNotes(el) {
      const out = { kind: "notes", attrs: { ...el.attrs } }, cSld = xml.findChild(el, "p:cSld");
      if (cSld)
        out.cSld = { name: cSld.attrs.name, raw: cSld };
      const clrMapOvr = xml.findChild(el, "p:clrMapOvr");
      if (clrMapOvr)
        out.clrMapOvr = parseClrMapOvr(clrMapOvr);
      const hf = xml.findChild(el, "p:hf");
      if (hf)
        out.hf = parseHf(hf);
      return out;
    }
    function renderNotes(notes) {
      const kids = [];
      if (notes.cSld && notes.cSld.raw)
        kids.push(notes.cSld.raw);
      else
        kids.push(xml.el("p:cSld", notes.cSld && notes.cSld.name ? { name: notes.cSld.name } : {}, [
          xml.el("p:spTree", {}, [
            xml.el("p:nvGrpSpPr", {}, [
              xml.el("p:cNvPr", { id: "1", name: "" }),
              xml.el("p:cNvGrpSpPr", {}),
              xml.el("p:nvPr", {})
            ]),
            xml.el("p:grpSpPr", {})
          ])
        ]));
      if (notes.clrMapOvr)
        kids.push(renderClrMapOvr(notes.clrMapOvr));
      if (notes.hf)
        kids.push(renderHf(notes.hf));
      return xml.el("p:notes", {
        "xmlns:a": "http://schemas.openxmlformats.org/drawingml/2006/main",
        "xmlns:r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
        "xmlns:p": "http://schemas.openxmlformats.org/presentationml/2006/main",
        ...notes.attrs || {}
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
      return renderNotesSlide({
        kind: "notes",
        attrs: {},
        clrMapOvr: { kind: "clrMapOvr", masterClrMapping: !0 }
      });
    }
    function parseNotesMaster(el) {
      const out = { kind: "notesMaster", attrs: { ...el.attrs } }, cSld = xml.findChild(el, "p:cSld");
      if (cSld)
        out.cSld = { raw: cSld };
      const clrMap = xml.findChild(el, "p:clrMap");
      if (clrMap)
        out.clrMap = { ...clrMap.attrs };
      const hf = xml.findChild(el, "p:hf");
      if (hf)
        out.hf = parseHf(hf);
      const notesStyle = xml.findChild(el, "p:notesStyle");
      if (notesStyle)
        out.notesStyle = { raw: notesStyle };
      return out;
    }
    function renderNotesMaster(nm) {
      const kids = [];
      if (nm.cSld && nm.cSld.raw)
        kids.push(nm.cSld.raw);
      else
        kids.push(xml.el("p:cSld", {}, [
          xml.el("p:spTree", {}, [
            xml.el("p:nvGrpSpPr", {}, [
              xml.el("p:cNvPr", { id: "1", name: "" }),
              xml.el("p:cNvGrpSpPr", {}),
              xml.el("p:nvPr", {})
            ]),
            xml.el("p:grpSpPr", {})
          ])
        ]));
      if (nm.clrMap)
        kids.push(xml.el("p:clrMap", nm.clrMap));
      if (nm.hf)
        kids.push(renderHf(nm.hf));
      if (nm.notesStyle && nm.notesStyle.raw)
        kids.push(nm.notesStyle.raw);
      else if (nm.notesStyle)
        kids.push(xml.el("p:notesStyle", {}));
      return xml.el("p:notesMaster", {
        "xmlns:a": "http://schemas.openxmlformats.org/drawingml/2006/main",
        "xmlns:r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
        "xmlns:p": "http://schemas.openxmlformats.org/presentationml/2006/main",
        ...nm.attrs || {}
      }, kids);
    }
    function parseHandoutMaster(el) {
      const out = { kind: "handoutMaster", attrs: { ...el.attrs } }, cSld = xml.findChild(el, "p:cSld");
      if (cSld)
        out.cSld = { raw: cSld };
      const clrMap = xml.findChild(el, "p:clrMap");
      if (clrMap)
        out.clrMap = { ...clrMap.attrs };
      const hf = xml.findChild(el, "p:hf");
      if (hf)
        out.hf = parseHf(hf);
      return out;
    }
    function renderHandoutMaster(hm) {
      const kids = [];
      if (hm.cSld && hm.cSld.raw)
        kids.push(hm.cSld.raw);
      else
        kids.push(xml.el("p:cSld", {}, [
          xml.el("p:spTree", {}, [
            xml.el("p:nvGrpSpPr", {}, [
              xml.el("p:cNvPr", { id: "1", name: "" }),
              xml.el("p:cNvGrpSpPr", {}),
              xml.el("p:nvPr", {})
            ]),
            xml.el("p:grpSpPr", {})
          ])
        ]));
      if (hm.clrMap)
        kids.push(xml.el("p:clrMap", hm.clrMap));
      if (hm.hf)
        kids.push(renderHf(hm.hf));
      return xml.el("p:handoutMaster", {
        "xmlns:a": "http://schemas.openxmlformats.org/drawingml/2006/main",
        "xmlns:r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
        "xmlns:p": "http://schemas.openxmlformats.org/presentationml/2006/main",
        ...hm.attrs || {}
      }, kids);
    }
    function parseNotesSz(el) {
      return { kind: "notesSz", cx: el.attrs.cx, cy: el.attrs.cy };
    }
    function renderNotesSz(n) {
      return xml.el("p:notesSz", { cx: String(n.cx), cy: String(n.cy) });
    }
    function parseViewPr(el) {
      return {
        kind: el.name.replace(/^p:/, ""),
        attrs: { ...el.attrs },
        children: (el.children || []).filter((c) => c.type === "element")
      };
    }
    function parseNotesViewPr(el) {
      if (!el || el.name === "p:notesViewPr")
        return parseViewPr(el);
      return parseViewPr(el);
    }
    function parseNotesTextViewPr(el) {
      if (!el || el.name === "p:notesTextViewPr")
        return parseViewPr(el);
      return parseViewPr(el);
    }
    function parseOutlineViewPr(el) {
      if (!el || el.name === "p:outlineViewPr")
        return parseViewPr(el);
      return parseViewPr(el);
    }
    function parseSlideSorterViewPr(el) {
      if (!el || el.name === "p:slideSorterViewPr")
        return parseViewPr(el);
      if (el.name === "p:sorterViewPr")
        return parseViewPr(el);
      return parseViewPr(el);
    }
    function parseSorterViewPr(el) {
      if (!el || el.name === "p:sorterViewPr")
        return parseViewPr(el);
      return parseViewPr(el);
    }
    function renderSorterViewPr(v) {
      return xml.el("p:sorterViewPr", v.attrs || {}, v.children || []);
    }
    function renderNotesViewPr(v) {
      return xml.el("p:notesViewPr", v.attrs || {}, v.children || []);
    }
    function renderNotesTextViewPr(v) {
      return xml.el("p:notesTextViewPr", v.attrs || {}, v.children || []);
    }
    function renderOutlineViewPr(v) {
      return xml.el("p:outlineViewPr", v.attrs || {}, v.children || []);
    }
    function renderSlideSorterViewPr(v) {
      return xml.el("p:slideSorterViewPr", v.attrs || {}, v.children || []);
    }
    return {
      parseNotes,
      renderNotes,
      parseNotesSlide,
      renderNotesSlide,
      buildEmptyNotesSlide,
      parseNotesMaster,
      renderNotesMaster,
      parseHandoutMaster,
      renderHandoutMaster,
      parseNotesSz,
      renderNotesSz,
      parseNotesViewPr,
      renderNotesViewPr,
      parseNotesTextViewPr,
      renderNotesTextViewPr,
      parseOutlineViewPr,
      renderOutlineViewPr,
      parseSlideSorterViewPr,
      renderSlideSorterViewPr,
      parseSorterViewPr,
      renderSorterViewPr,
      parseHf,
      renderHf,
      parseClrMapOvr,
      renderClrMapOvr
    };
  } });
    __register({ name: "pmlLayoutsTyped", dependencies: ["xml"], factory: function(xml) {
    const LAYOUT_TYPES = [
      "title",
      "tx",
      "twoColTx",
      "tbl",
      "txAndChart",
      "chartAndTx",
      "dgm",
      "chart",
      "txAndClipArt",
      "clipArtAndTx",
      "titleOnly",
      "blank",
      "txAndObj",
      "objAndTx",
      "objOnly",
      "obj",
      "txAndMedia",
      "mediaAndTx",
      "objOverTx",
      "txOverObj",
      "txAndTwoObj",
      "twoObjAndTx",
      "twoObjOverTx",
      "fourObj",
      "vertTx",
      "clipArtAndVertTx",
      "vertTitleAndTx",
      "vertTitleAndTxOverChart",
      "twoObj",
      "objAndTwoObj",
      "twoObjAndObj",
      "cust",
      "secHead",
      "twoTxTwoObj",
      "objTx",
      "picTx"
    ], PRIMARY_LAYOUT_TYPES = [
      "obj",
      "tx",
      "twoColTx",
      "twoObj",
      "objAndTx",
      "vertTitleAndTx",
      "vertTx",
      "titleOnly",
      "blank",
      "tbl",
      "chart",
      "cust",
      "secHead",
      "txAndObj",
      "pic",
      "dgm",
      "mediaAndTx",
      "fourObj"
    ];
    function buildLayout({
      type = "obj",
      name = "",
      preserve = "1",
      userDrawn,
      showMasterSp,
      showMasterPhAnim
    } = {}) {
      const attrs = {
        "xmlns:a": "http://schemas.openxmlformats.org/drawingml/2006/main",
        "xmlns:r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
        "xmlns:p": "http://schemas.openxmlformats.org/presentationml/2006/main",
        type,
        preserve
      };
      if (userDrawn !== void 0)
        attrs.userDrawn = String(userDrawn);
      if (showMasterSp !== void 0)
        attrs.showMasterSp = String(showMasterSp);
      if (showMasterPhAnim !== void 0)
        attrs.showMasterPhAnim = String(showMasterPhAnim);
      const root = xml.el("p:sldLayout", attrs, [
        xml.el("p:cSld", name ? { name } : {}, [
          xml.el("p:spTree", {}, [
            xml.el("p:nvGrpSpPr", {}, [
              xml.el("p:cNvPr", { id: "1", name: "" }),
              xml.el("p:cNvGrpSpPr", {}),
              xml.el("p:nvPr", {})
            ]),
            xml.el("p:grpSpPr", {})
          ])
        ]),
        xml.el("p:clrMapOvr", {}, [xml.el("a:masterClrMapping", {})])
      ]);
      return xml.serialize(root);
    }
    function parseLayout(text) {
      const root = typeof text === "string" ? xml.parse(text) : text;
      if (root && root.name === "p:sldLayout")
        ;
      const out = {
        kind: "sldLayout",
        type: root.attrs.type || "cust",
        preserve: root.attrs.preserve,
        userDrawn: root.attrs.userDrawn,
        showMasterSp: root.attrs.showMasterSp,
        showMasterPhAnim: root.attrs.showMasterPhAnim,
        matchingName: root.attrs.matchingName
      };
      for (const c of root.children || []) {
        if (c.type !== "element")
          continue;
        switch (c.name) {
          case "p:cSld":
            out.cSld = { name: c.attrs.name, raw: c };
            break;
          case "p:clrMapOvr":
            out.clrMapOvr = parseClrMapOvr(c);
            break;
          case "p:transition":
            out.transition = { raw: c, attrs: { ...c.attrs } };
            break;
          case "p:timing":
            out.timing = { raw: c };
            break;
          case "p:hf":
            out.hf = { kind: "hf", attrs: { ...c.attrs } };
            break;
        }
      }
      return out;
    }
    function parseClrMapOvr(el) {
      const out = { kind: "clrMapOvr" };
      for (const c of el.children || []) {
        if (c.type !== "element")
          continue;
        if (c.name === "a:masterClrMapping")
          out.masterClrMapping = !0;
        else if (c.name === "a:overrideClrMapping")
          out.overrideClrMapping = { ...c.attrs };
      }
      return out;
    }
    function parseLayoutType(text) {
      return (typeof text === "string" ? xml.parse(text) : text).attrs.type || "cust";
    }
    return {
      LAYOUT_TYPES,
      PRIMARY_LAYOUT_TYPES,
      buildLayout,
      parseLayout,
      parseLayoutType,
      parseClrMapOvr
    };
  } });
    __register({ name: "dmlChartDataLabels", dependencies: ["xml"], factory: function(xml) {
    const FLAGS = [
      "showLegendKey",
      "showVal",
      "showCatName",
      "showSerName",
      "showPercent",
      "showBubbleSize",
      "showLeaderLines"
    ], DTABLE_FLAGS = [
      "showHorzBorder",
      "showVertBorder",
      "showOutline",
      "showKeys"
    ];
    function readFlag(el) {
      if (!el)
        return;
      const v = el.attrs.val;
      if (v === void 0)
        return !0;
      return !(v === "0" || v === "false");
    }
    function writeFlag(name, value) {
      if (value === void 0)
        return null;
      return xml.el(name, { val: value ? "1" : "0" });
    }
    function parseNumFmt(el) {
      return { formatCode: el.attrs.formatCode, sourceLinked: el.attrs.sourceLinked };
    }
    function renderNumFmt(n) {
      const a = {};
      if (n.formatCode != null)
        a.formatCode = n.formatCode;
      if (n.sourceLinked != null)
        a.sourceLinked = n.sourceLinked;
      return xml.el("c:numFmt", a);
    }
    function parseRun(el) {
      const out = { kind: "r" }, rPr = xml.findChild(el, "a:rPr");
      if (rPr)
        out.rPr = { ...rPr.attrs };
      const t = xml.findChild(el, "a:t");
      if (t)
        out.text = xml.textContent(t);
      return out;
    }
    function renderRun(r) {
      const kids = [];
      if (r.rPr)
        kids.push(xml.el("a:rPr", { ...r.rPr }));
      kids.push(xml.el("a:t", {}, [xml.text(r.text || "")]));
      return xml.el("a:r", {}, kids);
    }
    function parsePara(el) {
      const out = { runs: [] }, pPr = xml.findChild(el, "a:pPr");
      if (pPr)
        out.pPr = { ...pPr.attrs };
      for (const c of el.children) {
        if (c.type !== "element")
          continue;
        if (c.name === "a:r")
          out.runs.push(parseRun(c));
        else if (c.name === "a:br")
          out.runs.push({ kind: "br" });
        else if (c.name === "a:fld")
          out.runs.push({ kind: "fld", attrs: { ...c.attrs } });
        else if (c.name === "a:endParaRPr")
          out.endParaRPr = { ...c.attrs };
      }
      return out;
    }
    function renderPara(p) {
      const kids = [];
      if (p.pPr)
        kids.push(xml.el("a:pPr", { ...p.pPr }));
      for (const r of p.runs || [])
        if (r.kind === "br")
          kids.push(xml.el("a:br", {}));
        else if (r.kind === "fld")
          kids.push(xml.el("a:fld", { ...r.attrs || {} }));
        else
          kids.push(renderRun(r));
      if (p.endParaRPr)
        kids.push(xml.el("a:endParaRPr", { ...p.endParaRPr }));
      return xml.el("a:p", {}, kids);
    }
    function parseTxPr(el) {
      const out = { paras: [] }, bodyPr = xml.findChild(el, "a:bodyPr");
      if (bodyPr)
        out.bodyPr = { ...bodyPr.attrs };
      const lstStyle = xml.findChild(el, "a:lstStyle");
      if (lstStyle)
        out.lstStyle = lstStyle;
      for (const c of el.children)
        if (c.type === "element" && c.name === "a:p")
          out.paras.push(parsePara(c));
      return out;
    }
    function renderTxPr(t) {
      const kids = [];
      kids.push(xml.el("a:bodyPr", { ...t.bodyPr || {} }));
      kids.push(t.lstStyle || xml.el("a:lstStyle", {}));
      for (const p of t.paras || [])
        kids.push(renderPara(p));
      if (!(t.paras || []).length)
        kids.push(xml.el("a:p", {}));
      return xml.el("c:txPr", {}, kids);
    }
    function parseLeaderLines(el) {
      const out = {}, spPr = xml.findChild(el, "c:spPr");
      if (spPr)
        out.spPr = spPr;
      return out;
    }
    function renderLeaderLines(l) {
      const kids = [];
      if (l && l.spPr)
        kids.push(l.spPr);
      return xml.el("c:leaderLines", {}, kids);
    }
    function parseDLbls(el) {
      if (!el)
        return;
      const out = {};
      for (const c of el.children) {
        if (c.type !== "element")
          continue;
        const local = c.name.replace(/^c:/, "");
        if (FLAGS.includes(local)) {
          out[local] = readFlag(c);
          continue;
        }
        if (DTABLE_FLAGS.includes(local)) {
          out[local] = readFlag(c);
          continue;
        }
        if (local === "dLblPos") {
          out.dLblPos = c.attrs.val;
          continue;
        }
        if (local === "separator") {
          out.separator = xml.textContent(c);
          continue;
        }
        if (local === "numFmt") {
          out.numFmt = parseNumFmt(c);
          continue;
        }
        if (local === "spPr") {
          out.spPr = c;
          continue;
        }
        if (local === "txPr") {
          out.txPr = parseTxPr(c);
          continue;
        }
        if (local === "leaderLines") {
          out.leaderLines = parseLeaderLines(c);
          continue;
        }
        if (local === "dLbl") {
          out.dLblOverrides = out.dLblOverrides || [];
          out.dLblOverrides.push(parseDLbl(c));
          continue;
        }
        (out._extras = out._extras || []).push(c);
      }
      return out;
    }
    function parseDLbl(el) {
      const out = { attrs: { ...el.attrs } };
      for (const c of el.children) {
        if (c.type !== "element")
          continue;
        const local = c.name.replace(/^c:/, "");
        if (local === "idx") {
          out.idx = Number(c.attrs.val);
          continue;
        }
        if (FLAGS.includes(local)) {
          out[local] = readFlag(c);
          continue;
        }
        if (local === "dLblPos") {
          out.dLblPos = c.attrs.val;
          continue;
        }
        if (local === "tx") {
          out.tx = c;
          continue;
        }
        if (local === "spPr") {
          out.spPr = c;
          continue;
        }
        if (local === "numFmt") {
          out.numFmt = parseNumFmt(c);
          continue;
        }
        if (local === "txPr") {
          out.txPr = parseTxPr(c);
          continue;
        }
        if (local === "separator") {
          out.separator = xml.textContent(c);
          continue;
        }
        if (local === "layout") {
          out.layout = c;
          continue;
        }
        (out._extras = out._extras || []).push(c);
      }
      return out;
    }
    function renderDLbls(d) {
      if (!d)
        return null;
      const kids = [];
      if (d.dLblOverrides)
        for (const o of d.dLblOverrides)
          kids.push(renderDLbl(o));
      if (d.numFmt)
        kids.push(renderNumFmt(d.numFmt));
      if (d.spPr)
        kids.push(d.spPr);
      if (d.txPr)
        kids.push(renderTxPr(d.txPr));
      if (d.dLblPos != null)
        kids.push(xml.el("c:dLblPos", { val: d.dLblPos }));
      if (d.separator != null)
        kids.push(xml.el("c:separator", {}, [xml.text(d.separator)]));
      for (const f of FLAGS) {
        const el = writeFlag("c:" + f, d[f]);
        if (el)
          kids.push(el);
      }
      if (d.leaderLines)
        kids.push(renderLeaderLines(d.leaderLines));
      for (const f of DTABLE_FLAGS) {
        const el = writeFlag("c:" + f, d[f]);
        if (el)
          kids.push(el);
      }
      if (d._extras)
        for (const ex of d._extras)
          kids.push(ex);
      return xml.el("c:dLbls", {}, kids);
    }
    function renderDLbl(o) {
      const kids = [];
      if (o.idx != null)
        kids.push(xml.el("c:idx", { val: String(o.idx) }));
      if (o.layout)
        kids.push(o.layout);
      if (o.tx)
        kids.push(o.tx);
      if (o.numFmt)
        kids.push(renderNumFmt(o.numFmt));
      if (o.spPr)
        kids.push(o.spPr);
      if (o.txPr)
        kids.push(renderTxPr(o.txPr));
      if (o.dLblPos != null)
        kids.push(xml.el("c:dLblPos", { val: o.dLblPos }));
      if (o.separator != null)
        kids.push(xml.el("c:separator", {}, [xml.text(o.separator)]));
      for (const f of FLAGS) {
        const el = writeFlag("c:" + f, o[f]);
        if (el)
          kids.push(el);
      }
      if (o._extras)
        for (const ex of o._extras)
          kids.push(ex);
      return xml.el("c:dLbl", {}, kids);
    }
    return {
      parseDLbls,
      renderDLbls,
      parseDLbl,
      renderDLbl,
      parseNumFmt,
      renderNumFmt,
      parseTxPr,
      renderTxPr,
      parsePara,
      renderPara,
      parseRun,
      renderRun,
      parseLeaderLines,
      renderLeaderLines,
      FLAGS,
      DTABLE_FLAGS
    };
  } });
    __register({ name: "dmlChartTrendlines", dependencies: ["xml"], factory: function(xml) {
    function readBool(el) {
      if (!el)
        return;
      const v = el.attrs.val;
      if (v === void 0)
        return !0;
      return !(v === "0" || v === "false");
    }
    function parseTrendlineLbl(el) {
      const out = {};
      for (const c of el.children) {
        if (c.type !== "element")
          continue;
        switch (c.name) {
          case "c:layout":
            out.layout = c;
            break;
          case "c:tx":
            out.tx = c;
            break;
          case "c:numFmt":
            out.numFmt = { ...c.attrs };
            break;
          case "c:spPr":
            out.spPr = c;
            break;
          case "c:txPr":
            out.txPr = c;
            break;
          default:
            (out._extras = out._extras || []).push(c);
        }
      }
      return out;
    }
    function renderTrendlineLbl(l) {
      const kids = [];
      if (l.layout)
        kids.push(l.layout);
      if (l.tx)
        kids.push(l.tx);
      if (l.numFmt)
        kids.push(xml.el("c:numFmt", { ...l.numFmt }));
      if (l.spPr)
        kids.push(l.spPr);
      if (l.txPr)
        kids.push(l.txPr);
      if (l._extras)
        for (const ex of l._extras)
          kids.push(ex);
      return xml.el("c:trendlineLbl", {}, kids);
    }
    function parseTrendline(el) {
      const out = {};
      for (const c of el.children) {
        if (c.type !== "element")
          continue;
        switch (c.name) {
          case "c:name":
            out.name = xml.textContent(c);
            break;
          case "c:spPr":
            out.spPr = c;
            break;
          case "c:trendlineType":
            out.trendlineType = c.attrs.val;
            break;
          case "c:order":
            out.order = Number(c.attrs.val);
            break;
          case "c:period":
            out.period = Number(c.attrs.val);
            break;
          case "c:forward":
            out.forward = Number(c.attrs.val);
            break;
          case "c:backward":
            out.backward = Number(c.attrs.val);
            break;
          case "c:intercept":
            out.intercept = Number(c.attrs.val);
            break;
          case "c:dispRSqr":
            out.dispRSqr = readBool(c);
            break;
          case "c:dispEq":
            out.dispEq = readBool(c);
            break;
          case "c:trendlineLbl":
            out.trendlineLbl = parseTrendlineLbl(c);
            break;
          default:
            (out._extras = out._extras || []).push(c);
        }
      }
      return out;
    }
    function renderTrendline(t) {
      const kids = [];
      if (t.name != null)
        kids.push(xml.el("c:name", {}, [xml.text(t.name)]));
      if (t.spPr)
        kids.push(t.spPr);
      if (t.trendlineType != null)
        kids.push(xml.el("c:trendlineType", { val: t.trendlineType }));
      if (t.order != null)
        kids.push(xml.el("c:order", { val: String(t.order) }));
      if (t.period != null)
        kids.push(xml.el("c:period", { val: String(t.period) }));
      if (t.forward != null)
        kids.push(xml.el("c:forward", { val: String(t.forward) }));
      if (t.backward != null)
        kids.push(xml.el("c:backward", { val: String(t.backward) }));
      if (t.intercept != null)
        kids.push(xml.el("c:intercept", { val: String(t.intercept) }));
      if (t.dispRSqr !== void 0)
        kids.push(xml.el("c:dispRSqr", { val: t.dispRSqr ? "1" : "0" }));
      if (t.dispEq !== void 0)
        kids.push(xml.el("c:dispEq", { val: t.dispEq ? "1" : "0" }));
      if (t.trendlineLbl)
        kids.push(renderTrendlineLbl(t.trendlineLbl));
      if (t._extras)
        for (const ex of t._extras)
          kids.push(ex);
      return xml.el("c:trendline", {}, kids);
    }
    function parseErrBars(el) {
      const out = {};
      for (const c of el.children) {
        if (c.type !== "element")
          continue;
        switch (c.name) {
          case "c:errDir":
            out.errDir = c.attrs.val;
            break;
          case "c:errBarType":
            out.errBarType = c.attrs.val;
            break;
          case "c:errValType":
            out.errValType = c.attrs.val;
            break;
          case "c:noEndCap":
            out.noEndCap = readBool(c);
            break;
          case "c:val":
            out.val = Number(c.attrs.val);
            break;
          case "c:plus":
            out.plus = c;
            break;
          case "c:minus":
            out.minus = c;
            break;
          case "c:spPr":
            out.spPr = c;
            break;
          default:
            (out._extras = out._extras || []).push(c);
        }
      }
      return out;
    }
    function renderErrBars(e) {
      const kids = [];
      if (e.errDir != null)
        kids.push(xml.el("c:errDir", { val: e.errDir }));
      if (e.errBarType != null)
        kids.push(xml.el("c:errBarType", { val: e.errBarType }));
      if (e.errValType != null)
        kids.push(xml.el("c:errValType", { val: e.errValType }));
      if (e.noEndCap !== void 0)
        kids.push(xml.el("c:noEndCap", { val: e.noEndCap ? "1" : "0" }));
      if (e.plus)
        kids.push(e.plus.name === "c:plus" ? e.plus : xml.el("c:plus", {}, [e.plus]));
      if (e.minus)
        kids.push(e.minus.name === "c:minus" ? e.minus : xml.el("c:minus", {}, [e.minus]));
      if (e.val != null)
        kids.push(xml.el("c:val", { val: String(e.val) }));
      if (e.spPr)
        kids.push(e.spPr);
      if (e._extras)
        for (const ex of e._extras)
          kids.push(ex);
      return xml.el("c:errBars", {}, kids);
    }
    function makeLinesPair(local) {
      return {
        parse(el) {
          const out = {}, sp = xml.findChild(el, "c:spPr");
          if (sp)
            out.spPr = sp;
          return out;
        },
        render(o) {
          const kids = [];
          if (o && o.spPr)
            kids.push(o.spPr);
          return xml.el("c:" + local, {}, kids);
        }
      };
    }
    const dropLinesIO = makeLinesPair("dropLines"), hiLowLinesIO = makeLinesPair("hiLowLines"), serLinesIO = makeLinesPair("serLines");
    function parseDropLines(el) {
      return dropLinesIO.parse(el);
    }
    function renderDropLines(o) {
      return dropLinesIO.render(o);
    }
    function parseHiLowLines(el) {
      return hiLowLinesIO.parse(el);
    }
    function renderHiLowLines(o) {
      return hiLowLinesIO.render(o);
    }
    function parseSerLines(el) {
      return serLinesIO.parse(el);
    }
    function renderSerLines(o) {
      return serLinesIO.render(o);
    }
    function parseUpDownBar(el) {
      const out = {}, sp = xml.findChild(el, "c:spPr");
      if (sp)
        out.spPr = sp;
      return out;
    }
    function parseUpDownBars(el) {
      const out = {};
      for (const c of el.children) {
        if (c.type !== "element")
          continue;
        switch (c.name) {
          case "c:gapWidth":
            out.gapWidth = Number(c.attrs.val);
            break;
          case "c:upBars":
            out.upBars = parseUpDownBar(c);
            break;
          case "c:downBars":
            out.downBars = parseUpDownBar(c);
            break;
          default:
            (out._extras = out._extras || []).push(c);
        }
      }
      return out;
    }
    function renderUpDownBars(b) {
      const kids = [];
      if (b.gapWidth != null)
        kids.push(xml.el("c:gapWidth", { val: String(b.gapWidth) }));
      if (b.upBars) {
        const sk = [];
        if (b.upBars.spPr)
          sk.push(b.upBars.spPr);
        kids.push(xml.el("c:upBars", {}, sk));
      }
      if (b.downBars) {
        const sk = [];
        if (b.downBars.spPr)
          sk.push(b.downBars.spPr);
        kids.push(xml.el("c:downBars", {}, sk));
      }
      if (b._extras)
        for (const ex of b._extras)
          kids.push(ex);
      return xml.el("c:upDownBars", {}, kids);
    }
    function parseGapWidth(el) {
      return Number(el.attrs.val);
    }
    function renderGapWidth(n) {
      return xml.el("c:gapWidth", { val: String(n) });
    }
    function parseGapDepth(el) {
      return Number(el.attrs.val);
    }
    function renderGapDepth(n) {
      return xml.el("c:gapDepth", { val: String(n) });
    }
    return {
      parseTrendline,
      renderTrendline,
      parseTrendlineLbl,
      renderTrendlineLbl,
      parseErrBars,
      renderErrBars,
      parseDropLines,
      renderDropLines,
      parseHiLowLines,
      renderHiLowLines,
      parseSerLines,
      renderSerLines,
      parseUpDownBars,
      renderUpDownBars,
      parseGapWidth,
      renderGapWidth,
      parseGapDepth,
      renderGapDepth
    };
  } });
    __register({ name: "dmlChartAxesAdvanced", dependencies: ["xml"], factory: function(xml) {
    const VAL_FIELDS = [
      "crosses",
      "crossesAt",
      "crossBetween",
      "crossAx",
      "lblOffset",
      "lblAlgn",
      "tickLblPos",
      "tickLblSkip",
      "tickMarkSkip",
      "majorTickMark",
      "minorTickMark",
      "baseTimeUnit",
      "majorTimeUnit",
      "minorTimeUnit",
      "axPos",
      "auto"
    ];
    function readBool(el) {
      if (!el)
        return;
      const v = el.attrs.val;
      if (v === void 0)
        return !0;
      return !(v === "0" || v === "false");
    }
    function parseScaling(el) {
      const out = {};
      for (const c of el.children) {
        if (c.type !== "element")
          continue;
        switch (c.name) {
          case "c:orientation":
            out.orientation = c.attrs.val;
            break;
          case "c:min":
            out.min = Number(c.attrs.val);
            break;
          case "c:max":
            out.max = Number(c.attrs.val);
            break;
          case "c:logBase":
            out.logBase = Number(c.attrs.val);
            break;
          default:
            (out._extras = out._extras || []).push(c);
        }
      }
      return out;
    }
    function renderScaling(s) {
      const kids = [];
      if (s.logBase != null)
        kids.push(xml.el("c:logBase", { val: String(s.logBase) }));
      if (s.orientation != null)
        kids.push(xml.el("c:orientation", { val: s.orientation }));
      if (s.max != null)
        kids.push(xml.el("c:max", { val: String(s.max) }));
      if (s.min != null)
        kids.push(xml.el("c:min", { val: String(s.min) }));
      if (s._extras)
        for (const ex of s._extras)
          kids.push(ex);
      return xml.el("c:scaling", {}, kids);
    }
    function parseManualLayout(el) {
      const out = {};
      for (const c of el.children) {
        if (c.type !== "element")
          continue;
        switch (c.name) {
          case "c:layoutTarget":
            out.layoutTarget = c.attrs.val;
            break;
          case "c:xMode":
            out.xMode = c.attrs.val;
            break;
          case "c:yMode":
            out.yMode = c.attrs.val;
            break;
          case "c:wMode":
            out.wMode = c.attrs.val;
            break;
          case "c:hMode":
            out.hMode = c.attrs.val;
            break;
          case "c:x":
            out.x = Number(c.attrs.val);
            break;
          case "c:y":
            out.y = Number(c.attrs.val);
            break;
          case "c:w":
            out.w = Number(c.attrs.val);
            break;
          case "c:h":
            out.h = Number(c.attrs.val);
            break;
          default:
            (out._extras = out._extras || []).push(c);
        }
      }
      return out;
    }
    function renderManualLayout(m) {
      const kids = [];
      if (m.layoutTarget != null)
        kids.push(xml.el("c:layoutTarget", { val: m.layoutTarget }));
      if (m.xMode != null)
        kids.push(xml.el("c:xMode", { val: m.xMode }));
      if (m.yMode != null)
        kids.push(xml.el("c:yMode", { val: m.yMode }));
      if (m.wMode != null)
        kids.push(xml.el("c:wMode", { val: m.wMode }));
      if (m.hMode != null)
        kids.push(xml.el("c:hMode", { val: m.hMode }));
      if (m.x != null)
        kids.push(xml.el("c:x", { val: String(m.x) }));
      if (m.y != null)
        kids.push(xml.el("c:y", { val: String(m.y) }));
      if (m.w != null)
        kids.push(xml.el("c:w", { val: String(m.w) }));
      if (m.h != null)
        kids.push(xml.el("c:h", { val: String(m.h) }));
      if (m._extras)
        for (const ex of m._extras)
          kids.push(ex);
      return xml.el("c:manualLayout", {}, kids);
    }
    function parseLayout(el) {
      const out = {}, ml = xml.findChild(el, "c:manualLayout");
      if (ml)
        out.manualLayout = parseManualLayout(ml);
      return out;
    }
    function renderLayout(l) {
      const kids = [];
      if (l && l.manualLayout)
        kids.push(renderManualLayout(l.manualLayout));
      return xml.el("c:layout", {}, kids);
    }
    function parseGridlines(el) {
      const out = {}, sp = xml.findChild(el, "c:spPr");
      if (sp)
        out.spPr = sp;
      return out;
    }
    function renderMajorGridlines(g) {
      const kids = [];
      if (g && g.spPr)
        kids.push(g.spPr);
      return xml.el("c:majorGridlines", {}, kids);
    }
    function renderMinorGridlines(g) {
      const kids = [];
      if (g && g.spPr)
        kids.push(g.spPr);
      return xml.el("c:minorGridlines", {}, kids);
    }
    function parseNumFmt(el) {
      return { formatCode: el.attrs.formatCode, sourceLinked: el.attrs.sourceLinked };
    }
    function renderNumFmt(n) {
      const a = {};
      if (n.formatCode != null)
        a.formatCode = n.formatCode;
      if (n.sourceLinked != null)
        a.sourceLinked = n.sourceLinked;
      return xml.el("c:numFmt", a);
    }
    function parseDispUnitsLbl(el) {
      const out = {};
      for (const c of el.children) {
        if (c.type !== "element")
          continue;
        switch (c.name) {
          case "c:layout":
            out.layout = parseLayout(c);
            break;
          case "c:tx":
            out.tx = c;
            break;
          case "c:spPr":
            out.spPr = c;
            break;
          case "c:txPr":
            out.txPr = c;
            break;
          default:
            (out._extras = out._extras || []).push(c);
        }
      }
      return out;
    }
    function renderDispUnitsLbl(l) {
      const kids = [];
      if (l.layout)
        kids.push(renderLayout(l.layout));
      if (l.tx)
        kids.push(l.tx);
      if (l.spPr)
        kids.push(l.spPr);
      if (l.txPr)
        kids.push(l.txPr);
      if (l._extras)
        for (const ex of l._extras)
          kids.push(ex);
      return xml.el("c:dispUnitsLbl", {}, kids);
    }
    function parseDispUnits(el) {
      const out = {};
      for (const c of el.children) {
        if (c.type !== "element")
          continue;
        switch (c.name) {
          case "c:builtInUnit":
            out.builtInUnit = c.attrs.val;
            break;
          case "c:custUnit":
            out.custUnit = Number(c.attrs.val);
            break;
          case "c:dispUnitsLbl":
            out.dispUnitsLbl = parseDispUnitsLbl(c);
            break;
          default:
            (out._extras = out._extras || []).push(c);
        }
      }
      return out;
    }
    function renderDispUnits(d) {
      const kids = [];
      if (d.builtInUnit != null)
        kids.push(xml.el("c:builtInUnit", { val: d.builtInUnit }));
      if (d.custUnit != null)
        kids.push(xml.el("c:custUnit", { val: String(d.custUnit) }));
      if (d.dispUnitsLbl)
        kids.push(renderDispUnitsLbl(d.dispUnitsLbl));
      if (d._extras)
        for (const ex of d._extras)
          kids.push(ex);
      return xml.el("c:dispUnits", {}, kids);
    }
    function parseAxis(el) {
      const out = { kind: el.name.replace(/^c:/, "") };
      for (const c of el.children) {
        if (c.type !== "element")
          continue;
        const local = c.name.replace(/^c:/, "");
        if (local === "axId") {
          out.axId = c.attrs.val;
          continue;
        }
        if (local === "scaling") {
          out.scaling = parseScaling(c);
          continue;
        }
        if (local === "delete") {
          out.delete = readBool(c);
          continue;
        }
        if (local === "title") {
          out.title = c;
          continue;
        }
        if (local === "numFmt") {
          out.numFmt = parseNumFmt(c);
          continue;
        }
        if (local === "spPr") {
          out.spPr = c;
          continue;
        }
        if (local === "txPr") {
          out.txPr = c;
          continue;
        }
        if (local === "majorGridlines") {
          out.majorGridlines = parseGridlines(c);
          continue;
        }
        if (local === "minorGridlines") {
          out.minorGridlines = parseGridlines(c);
          continue;
        }
        if (local === "dispUnits") {
          out.dispUnits = parseDispUnits(c);
          continue;
        }
        if (local === "min" || local === "max" || local === "logBase" || local === "majorUnit" || local === "minorUnit") {
          out[local] = Number(c.attrs.val);
          continue;
        }
        if (VAL_FIELDS.includes(local)) {
          out[local] = c.attrs.val;
          continue;
        }
        (out._extras = out._extras || []).push(c);
      }
      return out;
    }
    function renderAxis(a) {
      const kids = [];
      if (a.axId != null)
        kids.push(xml.el("c:axId", { val: String(a.axId) }));
      if (a.scaling)
        kids.push(renderScaling(a.scaling));
      if (a.delete !== void 0)
        kids.push(xml.el("c:delete", { val: a.delete ? "1" : "0" }));
      if (a.axPos != null)
        kids.push(xml.el("c:axPos", { val: a.axPos }));
      if (a.majorGridlines)
        kids.push(renderMajorGridlines(a.majorGridlines));
      if (a.minorGridlines)
        kids.push(renderMinorGridlines(a.minorGridlines));
      if (a.title)
        kids.push(a.title);
      if (a.numFmt)
        kids.push(renderNumFmt(a.numFmt));
      if (a.majorTickMark != null)
        kids.push(xml.el("c:majorTickMark", { val: a.majorTickMark }));
      if (a.minorTickMark != null)
        kids.push(xml.el("c:minorTickMark", { val: a.minorTickMark }));
      if (a.tickLblPos != null)
        kids.push(xml.el("c:tickLblPos", { val: a.tickLblPos }));
      if (a.spPr)
        kids.push(a.spPr);
      if (a.txPr)
        kids.push(a.txPr);
      if (a.crossAx != null)
        kids.push(xml.el("c:crossAx", { val: String(a.crossAx) }));
      if (a.crosses != null)
        kids.push(xml.el("c:crosses", { val: a.crosses }));
      if (a.crossesAt != null)
        kids.push(xml.el("c:crossesAt", { val: String(a.crossesAt) }));
      if (a.crossBetween != null)
        kids.push(xml.el("c:crossBetween", { val: a.crossBetween }));
      if (a.auto !== void 0)
        kids.push(xml.el("c:auto", { val: String(a.auto) }));
      if (a.lblOffset != null)
        kids.push(xml.el("c:lblOffset", { val: String(a.lblOffset) }));
      if (a.lblAlgn != null)
        kids.push(xml.el("c:lblAlgn", { val: a.lblAlgn }));
      if (a.tickLblSkip != null)
        kids.push(xml.el("c:tickLblSkip", { val: String(a.tickLblSkip) }));
      if (a.tickMarkSkip != null)
        kids.push(xml.el("c:tickMarkSkip", { val: String(a.tickMarkSkip) }));
      if (a.majorUnit != null)
        kids.push(xml.el("c:majorUnit", { val: String(a.majorUnit) }));
      if (a.minorUnit != null)
        kids.push(xml.el("c:minorUnit", { val: String(a.minorUnit) }));
      if (a.min != null)
        kids.push(xml.el("c:min", { val: String(a.min) }));
      if (a.max != null)
        kids.push(xml.el("c:max", { val: String(a.max) }));
      if (a.logBase != null)
        kids.push(xml.el("c:logBase", { val: String(a.logBase) }));
      if (a.baseTimeUnit != null)
        kids.push(xml.el("c:baseTimeUnit", { val: a.baseTimeUnit }));
      if (a.majorTimeUnit != null)
        kids.push(xml.el("c:majorTimeUnit", { val: a.majorTimeUnit }));
      if (a.minorTimeUnit != null)
        kids.push(xml.el("c:minorTimeUnit", { val: a.minorTimeUnit }));
      if (a.dispUnits)
        kids.push(renderDispUnits(a.dispUnits));
      if (a._extras)
        for (const ex of a._extras)
          kids.push(ex);
      return xml.el("c:" + (a.kind || "valAx"), {}, kids);
    }
    function renderCatAx(a) {
      return renderAxis({ ...a, kind: "catAx" });
    }
    function renderValAx(a) {
      return renderAxis({ ...a, kind: "valAx" });
    }
    function renderDateAx(a) {
      return renderAxis({ ...a, kind: "dateAx" });
    }
    function renderSerAx(a) {
      return renderAxis({ ...a, kind: "serAx" });
    }
    function parseAxisByName(el) {
      switch (el.name) {
        case "c:catAx":
        case "c:valAx":
        case "c:dateAx":
        case "c:serAx":
          return parseAxis(el);
        default:
          return parseAxis(el);
      }
    }
    function renderMajorTickMark(v) {
      return xml.el("c:majorTickMark", { val: v });
    }
    function renderMinorTickMark(v) {
      return xml.el("c:minorTickMark", { val: v });
    }
    return {
      parseAxis,
      renderAxis,
      parseAxisByName,
      parseScaling,
      renderScaling,
      parseLayout,
      renderLayout,
      parseManualLayout,
      renderManualLayout,
      parseGridlines,
      renderMajorGridlines,
      renderMinorGridlines,
      parseDispUnits,
      renderDispUnits,
      parseDispUnitsLbl,
      renderDispUnitsLbl,
      parseNumFmt,
      renderNumFmt,
      renderCatAx,
      renderValAx,
      renderDateAx,
      renderSerAx,
      renderMajorTickMark,
      renderMinorTickMark,
      VAL_FIELDS
    };
  } });
    __register({ name: "dmlChart3d", dependencies: ["xml"], factory: function(xml) {
    function readBool(el) {
      if (!el)
        return;
      const v = el.attrs.val;
      if (v === void 0)
        return !0;
      return !(v === "0" || v === "false");
    }
    function parseView3D(el) {
      const out = {};
      for (const c of el.children) {
        if (c.type !== "element")
          continue;
        switch (c.name) {
          case "c:rotX":
            out.rotX = Number(c.attrs.val);
            break;
          case "c:rotY":
            out.rotY = Number(c.attrs.val);
            break;
          case "c:rAngAx":
            out.rAngAx = readBool(c);
            break;
          case "c:perspective":
            out.perspective = Number(c.attrs.val);
            break;
          case "c:depthPercent":
            out.depthPercent = Number(c.attrs.val);
            break;
          case "c:hPercent":
            out.hPercent = Number(c.attrs.val);
            break;
          default:
            (out._extras = out._extras || []).push(c);
        }
      }
      return out;
    }
    function renderView3D(v) {
      const kids = [];
      if (v.rotX != null)
        kids.push(xml.el("c:rotX", { val: String(v.rotX) }));
      if (v.hPercent != null)
        kids.push(xml.el("c:hPercent", { val: String(v.hPercent) }));
      if (v.rotY != null)
        kids.push(xml.el("c:rotY", { val: String(v.rotY) }));
      if (v.depthPercent != null)
        kids.push(xml.el("c:depthPercent", { val: String(v.depthPercent) }));
      if (v.rAngAx !== void 0)
        kids.push(xml.el("c:rAngAx", { val: v.rAngAx ? "1" : "0" }));
      if (v.perspective != null)
        kids.push(xml.el("c:perspective", { val: String(v.perspective) }));
      if (v._extras)
        for (const ex of v._extras)
          kids.push(ex);
      return xml.el("c:view3D", {}, kids);
    }
    function parseSurfaceProps(el) {
      const out = {};
      for (const c of el.children) {
        if (c.type !== "element")
          continue;
        switch (c.name) {
          case "c:thickness":
            out.thickness = Number(c.attrs.val);
            break;
          case "c:spPr":
            out.spPr = c;
            break;
          case "c:pictureOptions":
            out.pictureOptions = c;
            break;
          default:
            (out._extras = out._extras || []).push(c);
        }
      }
      return out;
    }
    function renderSurface(local, s) {
      const kids = [];
      if (s.thickness != null)
        kids.push(xml.el("c:thickness", { val: String(s.thickness) }));
      if (s.spPr)
        kids.push(s.spPr);
      if (s.pictureOptions)
        kids.push(s.pictureOptions);
      if (s._extras)
        for (const ex of s._extras)
          kids.push(ex);
      return xml.el("c:" + local, {}, kids);
    }
    function parseFloor(el) {
      return parseSurfaceProps(el);
    }
    function renderFloor(s) {
      return renderSurface("floor", s || {});
    }
    function parseSideWall(el) {
      return parseSurfaceProps(el);
    }
    function renderSideWall(s) {
      return renderSurface("sideWall", s || {});
    }
    function parseBackWall(el) {
      return parseSurfaceProps(el);
    }
    function renderBackWall(s) {
      return renderSurface("backWall", s || {});
    }
    function parseBandFmt(el) {
      const out = {};
      for (const c of el.children) {
        if (c.type !== "element")
          continue;
        switch (c.name) {
          case "c:idx":
            out.idx = Number(c.attrs.val);
            break;
          case "c:spPr":
            out.spPr = c;
            break;
          default:
            (out._extras = out._extras || []).push(c);
        }
      }
      return out;
    }
    function renderBandFmt(b) {
      const kids = [];
      if (b.idx != null)
        kids.push(xml.el("c:idx", { val: String(b.idx) }));
      if (b.spPr)
        kids.push(b.spPr);
      if (b._extras)
        for (const ex of b._extras)
          kids.push(ex);
      return xml.el("c:bandFmt", {}, kids);
    }
    function parseBandFmts(el) {
      const out = [];
      for (const c of el.children)
        if (c.type === "element" && c.name === "c:bandFmt")
          out.push(parseBandFmt(c));
      return out;
    }
    function renderBandFmts(arr) {
      return xml.el("c:bandFmts", {}, (arr || []).map(renderBandFmt));
    }
    function parseDPt(el) {
      const out = {};
      for (const c of el.children) {
        if (c.type !== "element")
          continue;
        switch (c.name) {
          case "c:idx":
            out.idx = Number(c.attrs.val);
            break;
          case "c:invertIfNegative":
            out.invertIfNegative = readBool(c);
            break;
          case "c:bubble3D":
            out.bubble3D = readBool(c);
            break;
          case "c:spPr":
            out.spPr = c;
            break;
          default:
            (out._extras = out._extras || []).push(c);
        }
      }
      return out;
    }
    function renderDPt(d) {
      const kids = [];
      if (d.idx != null)
        kids.push(xml.el("c:idx", { val: String(d.idx) }));
      if (d.invertIfNegative !== void 0)
        kids.push(xml.el("c:invertIfNegative", { val: d.invertIfNegative ? "1" : "0" }));
      if (d.bubble3D !== void 0)
        kids.push(xml.el("c:bubble3D", { val: d.bubble3D ? "1" : "0" }));
      if (d.spPr)
        kids.push(d.spPr);
      if (d._extras)
        for (const ex of d._extras)
          kids.push(ex);
      return xml.el("c:dPt", {}, kids);
    }
    function parseSer(el) {
      const out = { dPt: [] };
      for (const c of el.children) {
        if (c.type !== "element")
          continue;
        switch (c.name) {
          case "c:idx":
            out.idx = Number(c.attrs.val);
            break;
          case "c:order":
            out.order = Number(c.attrs.val);
            break;
          case "c:tx":
            out.tx = c;
            break;
          case "c:spPr":
            out.spPr = c;
            break;
          case "c:invertIfNegative":
            out.invertIfNegative = readBool(c);
            break;
          case "c:dPt":
            out.dPt.push(parseDPt(c));
            break;
          case "c:dLbls":
            out.dLbls = c;
            break;
          case "c:cat":
            out.cat = c;
            break;
          case "c:val":
            out.val = c;
            break;
          case "c:shape":
            out.shape = c.attrs.val;
            break;
          case "c:bubble3D":
            out.bubble3D = readBool(c);
            break;
          default:
            (out._extras = out._extras || []).push(c);
        }
      }
      if (!out.dPt.length)
        delete out.dPt;
      return out;
    }
    function renderSer(s) {
      const kids = [];
      if (s.idx != null)
        kids.push(xml.el("c:idx", { val: String(s.idx) }));
      if (s.order != null)
        kids.push(xml.el("c:order", { val: String(s.order) }));
      if (s.tx)
        kids.push(s.tx);
      if (s.spPr)
        kids.push(s.spPr);
      if (s.invertIfNegative !== void 0)
        kids.push(xml.el("c:invertIfNegative", { val: s.invertIfNegative ? "1" : "0" }));
      if (s.bubble3D !== void 0)
        kids.push(xml.el("c:bubble3D", { val: s.bubble3D ? "1" : "0" }));
      for (const d of s.dPt || [])
        kids.push(renderDPt(d));
      if (s.dLbls)
        kids.push(s.dLbls);
      if (s.cat)
        kids.push(s.cat);
      if (s.val)
        kids.push(s.val);
      if (s.shape != null)
        kids.push(xml.el("c:shape", { val: s.shape }));
      if (s._extras)
        for (const ex of s._extras)
          kids.push(ex);
      return xml.el("c:ser", {}, kids);
    }
    function parseChart3D(el) {
      const out = { kind: el.name.replace(/^c:/, ""), ser: [] };
      for (const c of el.children) {
        if (c.type !== "element")
          continue;
        switch (c.name) {
          case "c:varyColors":
            out.varyColors = readBool(c);
            break;
          case "c:ser":
            out.ser.push(parseSer(c));
            break;
          case "c:dLbls":
            out.dLbls = c;
            break;
          case "c:gapWidth":
            out.gapWidth = Number(c.attrs.val);
            break;
          case "c:gapDepth":
            out.gapDepth = Number(c.attrs.val);
            break;
          case "c:shape":
            out.shape = c.attrs.val;
            break;
          case "c:wireframe":
            out.wireframe = readBool(c);
            break;
          case "c:bandFmts":
            out.bandFmts = parseBandFmts(c);
            break;
          case "c:axId":
            (out.axId = out.axId || []).push(c.attrs.val);
            break;
          case "c:grouping":
            out.grouping = c.attrs.val;
            break;
          case "c:firstSliceAng":
            out.firstSliceAng = Number(c.attrs.val);
            break;
          default:
            (out._extras = out._extras || []).push(c);
        }
      }
      return out;
    }
    function renderChart3D(c) {
      const kind = c.kind || "bar3DChart", kids = [];
      if (c.wireframe !== void 0)
        kids.push(xml.el("c:wireframe", { val: c.wireframe ? "1" : "0" }));
      if (c.varyColors !== void 0)
        kids.push(xml.el("c:varyColors", { val: c.varyColors ? "1" : "0" }));
      if (c.grouping != null)
        kids.push(xml.el("c:grouping", { val: c.grouping }));
      if (c.firstSliceAng != null)
        kids.push(xml.el("c:firstSliceAng", { val: String(c.firstSliceAng) }));
      for (const s of c.ser || [])
        kids.push(renderSer(s));
      if (c.dLbls)
        kids.push(c.dLbls);
      if (c.gapWidth != null)
        kids.push(xml.el("c:gapWidth", { val: String(c.gapWidth) }));
      if (c.gapDepth != null)
        kids.push(xml.el("c:gapDepth", { val: String(c.gapDepth) }));
      if (c.shape != null)
        kids.push(xml.el("c:shape", { val: c.shape }));
      if (c.bandFmts)
        kids.push(renderBandFmts(c.bandFmts));
      for (const id of c.axId || [])
        kids.push(xml.el("c:axId", { val: String(id) }));
      if (c._extras)
        for (const ex of c._extras)
          kids.push(ex);
      return xml.el("c:" + kind, {}, kids);
    }
    function renderBar3DChart(c) {
      return renderChart3D({ ...c, kind: "bar3DChart" });
    }
    function renderLine3DChart(c) {
      return renderChart3D({ ...c, kind: "line3DChart" });
    }
    function renderPie3DChart(c) {
      return renderChart3D({ ...c, kind: "pie3DChart" });
    }
    function renderArea3DChart(c) {
      return renderChart3D({ ...c, kind: "area3DChart" });
    }
    function renderSurfaceChart(c) {
      return renderChart3D({ ...c, kind: "surfaceChart" });
    }
    function renderSurface3DChart(c) {
      return renderChart3D({ ...c, kind: "surface3DChart" });
    }
    function parseChartByName(el) {
      switch (el.name) {
        case "c:bar3DChart":
        case "c:line3DChart":
        case "c:pie3DChart":
        case "c:area3DChart":
        case "c:surfaceChart":
        case "c:surface3DChart":
          return parseChart3D(el);
        default:
          return parseChart3D(el);
      }
    }
    return {
      parseView3D,
      renderView3D,
      parseFloor,
      renderFloor,
      parseSideWall,
      renderSideWall,
      parseBackWall,
      renderBackWall,
      parseBandFmt,
      renderBandFmt,
      parseBandFmts,
      renderBandFmts,
      parseDPt,
      renderDPt,
      parseSer,
      renderSer,
      parseChart3D,
      renderChart3D,
      parseChartByName,
      renderBar3DChart,
      renderLine3DChart,
      renderPie3DChart,
      renderArea3DChart,
      renderSurfaceChart,
      renderSurface3DChart,
      CHART_TYPES_3D: [
        "bar3DChart",
        "line3DChart",
        "pie3DChart",
        "area3DChart",
        "surfaceChart",
        "surface3DChart"
      ]
    };
  } });
    __register({ name: "dmlChartOtherTypes", dependencies: ["xml"], factory: function(xml) {
    const TYPES = ["bubbleChart", "radarChart", "stockChart", "ofPieChart"];
    function readBool(el) {
      if (!el)
        return;
      const v = el.attrs.val;
      if (v === void 0)
        return !0;
      return !(v === "0" || v === "false");
    }
    function writeBool(name, b) {
      if (b === void 0)
        return null;
      return xml.el(name, { val: b ? "1" : "0" });
    }
    function parseSerGeneric(serEl, fieldMap) {
      const out = { _extras: [] };
      for (const c of serEl.children) {
        if (c.type !== "element")
          continue;
        const local = c.name.replace(/^c:/, "");
        if (local === "idx") {
          out.idx = Number(c.attrs.val);
          continue;
        }
        if (local === "order") {
          out.order = Number(c.attrs.val);
          continue;
        }
        if (local === "tx") {
          out.tx = c;
          continue;
        }
        if (local === "spPr") {
          out.spPr = c;
          continue;
        }
        const h = fieldMap[local];
        if (h) {
          h(c, out);
          continue;
        }
        out._extras.push(c);
      }
      if (!out._extras.length)
        delete out._extras;
      return out;
    }
    function renderSerHead(s) {
      const kids = [];
      if (s.idx != null)
        kids.push(xml.el("c:idx", { val: String(s.idx) }));
      if (s.order != null)
        kids.push(xml.el("c:order", { val: String(s.order) }));
      if (s.tx)
        kids.push(s.tx);
      if (s.spPr)
        kids.push(s.spPr);
      return kids;
    }
    function parseBubbleChart(el) {
      const out = { kind: "bubbleChart", ser: [], _extras: [] };
      for (const c of el.children) {
        if (c.type !== "element")
          continue;
        const local = c.name.replace(/^c:/, "");
        if (local === "varyColors") {
          out.varyColors = readBool(c);
          continue;
        }
        if (local === "bubbleScale") {
          out.bubbleScale = Number(c.attrs.val);
          continue;
        }
        if (local === "showNegBubbles") {
          out.showNegBubbles = readBool(c);
          continue;
        }
        if (local === "sizeRepresents") {
          out.sizeRepresents = c.attrs.val;
          continue;
        }
        if (local === "ser") {
          out.ser.push(parseSerGeneric(c, {
            bubble3D: (e, o) => {
              o.bubble3D = readBool(e);
            },
            bubbleSize: (e, o) => {
              o.bubbleSize = e;
            },
            xVal: (e, o) => {
              o.xVal = e;
            },
            yVal: (e, o) => {
              o.yVal = e;
            },
            invertIfNegative: (e, o) => {
              o.invertIfNegative = readBool(e);
            }
          }));
          continue;
        }
        out._extras.push(c);
      }
      if (!out._extras.length)
        delete out._extras;
      return out;
    }
    function renderBubbleChart(c) {
      const kids = [], vc = writeBool("c:varyColors", c.varyColors);
      if (vc)
        kids.push(vc);
      for (const s of c.ser || []) {
        const sk = renderSerHead(s);
        if (s.invertIfNegative !== void 0)
          sk.push(xml.el("c:invertIfNegative", { val: s.invertIfNegative ? "1" : "0" }));
        if (s.xVal)
          sk.push(s.xVal);
        if (s.yVal)
          sk.push(s.yVal);
        if (s.bubbleSize)
          sk.push(s.bubbleSize);
        if (s.bubble3D !== void 0)
          sk.push(xml.el("c:bubble3D", { val: s.bubble3D ? "1" : "0" }));
        if (s._extras)
          for (const ex of s._extras)
            sk.push(ex);
        kids.push(xml.el("c:ser", {}, sk));
      }
      if (c.bubbleScale != null)
        kids.push(xml.el("c:bubbleScale", { val: String(c.bubbleScale) }));
      if (c.showNegBubbles !== void 0)
        kids.push(xml.el("c:showNegBubbles", { val: c.showNegBubbles ? "1" : "0" }));
      if (c.sizeRepresents != null)
        kids.push(xml.el("c:sizeRepresents", { val: c.sizeRepresents }));
      if (c._extras)
        for (const ex of c._extras)
          kids.push(ex);
      return xml.el("c:bubbleChart", {}, kids);
    }
    function parseRadarChart(el) {
      const out = { kind: "radarChart", ser: [], _extras: [] };
      for (const c of el.children) {
        if (c.type !== "element")
          continue;
        const local = c.name.replace(/^c:/, "");
        if (local === "radarStyle") {
          out.radarStyle = c.attrs.val;
          continue;
        }
        if (local === "varyColors") {
          out.varyColors = readBool(c);
          continue;
        }
        if (local === "ser") {
          out.ser.push(parseSerGeneric(c, {
            cat: (e, o) => {
              o.cat = e;
            },
            val: (e, o) => {
              o.val = e;
            }
          }));
          continue;
        }
        out._extras.push(c);
      }
      if (!out._extras.length)
        delete out._extras;
      return out;
    }
    function renderRadarChart(c) {
      const kids = [];
      if (c.radarStyle != null)
        kids.push(xml.el("c:radarStyle", { val: c.radarStyle }));
      const vc = writeBool("c:varyColors", c.varyColors);
      if (vc)
        kids.push(vc);
      for (const s of c.ser || []) {
        const sk = renderSerHead(s);
        if (s.cat)
          sk.push(s.cat);
        if (s.val)
          sk.push(s.val);
        if (s._extras)
          for (const ex of s._extras)
            sk.push(ex);
        kids.push(xml.el("c:ser", {}, sk));
      }
      if (c._extras)
        for (const ex of c._extras)
          kids.push(ex);
      return xml.el("c:radarChart", {}, kids);
    }
    function parseStockChart(el) {
      const out = { kind: "stockChart", ser: [], _extras: [] };
      for (const c of el.children) {
        if (c.type !== "element")
          continue;
        if (c.name.replace(/^c:/, "") === "ser") {
          out.ser.push(parseSerGeneric(c, {
            cat: (e, o) => {
              o.cat = e;
            },
            val: (e, o) => {
              o.val = e;
            }
          }));
          continue;
        }
        out._extras.push(c);
      }
      if (!out._extras.length)
        delete out._extras;
      return out;
    }
    function renderStockChart(c) {
      const kids = [];
      for (const s of c.ser || []) {
        const sk = renderSerHead(s);
        if (s.cat)
          sk.push(s.cat);
        if (s.val)
          sk.push(s.val);
        if (s._extras)
          for (const ex of s._extras)
            sk.push(ex);
        kids.push(xml.el("c:ser", {}, sk));
      }
      if (c._extras)
        for (const ex of c._extras)
          kids.push(ex);
      return xml.el("c:stockChart", {}, kids);
    }
    function parseCustSplit(el) {
      const out = { secondPiePt: [] };
      for (const c of xml.findAll(el, "c:secondPiePt"))
        out.secondPiePt.push(Number(c.attrs.val));
      return out;
    }
    function renderCustSplit(cs) {
      const kids = [];
      for (const idx of cs.secondPiePt || [])
        kids.push(xml.el("c:secondPiePt", { val: String(idx) }));
      return xml.el("c:custSplit", {}, kids);
    }
    function parseOfPieChart(el) {
      const out = { kind: "ofPieChart", ser: [], _extras: [] };
      for (const c of el.children) {
        if (c.type !== "element")
          continue;
        const local = c.name.replace(/^c:/, "");
        if (local === "ofPieType") {
          out.ofPieType = c.attrs.val;
          continue;
        }
        if (local === "varyColors") {
          out.varyColors = readBool(c);
          continue;
        }
        if (local === "gapWidth") {
          out.gapWidth = Number(c.attrs.val);
          continue;
        }
        if (local === "splitType") {
          out.splitType = c.attrs.val;
          continue;
        }
        if (local === "splitPos") {
          out.splitPos = Number(c.attrs.val);
          continue;
        }
        if (local === "secondPieSize") {
          out.secondPieSize = Number(c.attrs.val);
          continue;
        }
        if (local === "custSplit") {
          out.custSplit = parseCustSplit(c);
          continue;
        }
        if (local === "ser") {
          out.ser.push(parseSerGeneric(c, {
            cat: (e, o) => {
              o.cat = e;
            },
            val: (e, o) => {
              o.val = e;
            }
          }));
          continue;
        }
        out._extras.push(c);
      }
      if (!out._extras.length)
        delete out._extras;
      return out;
    }
    function renderOfPieChart(c) {
      const kids = [];
      if (c.ofPieType != null)
        kids.push(xml.el("c:ofPieType", { val: c.ofPieType }));
      const vc = writeBool("c:varyColors", c.varyColors);
      if (vc)
        kids.push(vc);
      for (const s of c.ser || []) {
        const sk = renderSerHead(s);
        if (s.cat)
          sk.push(s.cat);
        if (s.val)
          sk.push(s.val);
        if (s._extras)
          for (const ex of s._extras)
            sk.push(ex);
        kids.push(xml.el("c:ser", {}, sk));
      }
      if (c.gapWidth != null)
        kids.push(xml.el("c:gapWidth", { val: String(c.gapWidth) }));
      if (c.splitType != null)
        kids.push(xml.el("c:splitType", { val: c.splitType }));
      if (c.splitPos != null)
        kids.push(xml.el("c:splitPos", { val: String(c.splitPos) }));
      if (c.custSplit)
        kids.push(renderCustSplit(c.custSplit));
      if (c.secondPieSize != null)
        kids.push(xml.el("c:secondPieSize", { val: String(c.secondPieSize) }));
      if (c._extras)
        for (const ex of c._extras)
          kids.push(ex);
      return xml.el("c:ofPieChart", {}, kids);
    }
    const PARSERS = {
      bubbleChart: parseBubbleChart,
      radarChart: parseRadarChart,
      stockChart: parseStockChart,
      ofPieChart: parseOfPieChart
    }, RENDERERS = {
      bubbleChart: renderBubbleChart,
      radarChart: renderRadarChart,
      stockChart: renderStockChart,
      ofPieChart: renderOfPieChart
    };
    function parseChartByType(el) {
      const local = el.name.replace(/^c:/, ""), p = PARSERS[local];
      if (p)
        return p(el);
      return { kind: local, _raw: el };
    }
    function renderChartByType(c) {
      if (c && c._raw)
        return c._raw;
      const r = c && RENDERERS[c.kind];
      if (r)
        return r(c);
      return xml.el("c:" + (c && c.kind), {});
    }
    function parsePivotFmt(el) {
      const out = { _extras: [] };
      for (const c of el.children) {
        if (c.type !== "element")
          continue;
        const local = c.name.replace(/^c:/, "");
        if (local === "idx") {
          out.idx = Number(c.attrs.val);
          continue;
        }
        if (local === "spPr") {
          out.spPr = c;
          continue;
        }
        if (local === "txPr") {
          out.txPr = c;
          continue;
        }
        if (local === "marker") {
          out.marker = c;
          continue;
        }
        if (local === "dLbl") {
          out.dLbl = c;
          continue;
        }
        out._extras.push(c);
      }
      if (!out._extras.length)
        delete out._extras;
      return out;
    }
    function renderPivotFmt(p) {
      const kids = [];
      if (p.idx != null)
        kids.push(xml.el("c:idx", { val: String(p.idx) }));
      if (p.spPr)
        kids.push(p.spPr);
      if (p.txPr)
        kids.push(p.txPr);
      if (p.marker)
        kids.push(p.marker);
      if (p.dLbl)
        kids.push(p.dLbl);
      if (p._extras)
        for (const ex of p._extras)
          kids.push(ex);
      return xml.el("c:pivotFmt", {}, kids);
    }
    function parsePivotFmts(el) {
      return xml.findAll(el, "c:pivotFmt").map(parsePivotFmt);
    }
    function renderPivotFmts(arr) {
      return xml.el("c:pivotFmts", {}, (arr || []).map(renderPivotFmt));
    }
    function parsePivotSource(el) {
      return { _raw: el, attrs: { ...el.attrs } };
    }
    function renderPivotSource(p) {
      return p._raw || xml.el("c:pivotSource", p.attrs || {});
    }
    function parseDTable(el) {
      return { _raw: el, attrs: { ...el.attrs } };
    }
    function renderDTable(d) {
      return d._raw || xml.el("c:dTable", d.attrs || {});
    }
    function parseUserShapes(el) {
      return { _raw: el, attrs: { ...el.attrs } };
    }
    function renderUserShapes(u) {
      return u._raw || xml.el("c:userShapes", u.attrs || {});
    }
    return {
      TYPES,
      parseChartByType,
      renderChartByType,
      parseBubbleChart,
      renderBubbleChart,
      parseRadarChart,
      renderRadarChart,
      parseStockChart,
      renderStockChart,
      parseOfPieChart,
      renderOfPieChart,
      parsePivotFmt,
      renderPivotFmt,
      parsePivotFmts,
      renderPivotFmts,
      parsePivotSource,
      renderPivotSource,
      parseDTable,
      renderDTable,
      parseUserShapes,
      renderUserShapes
    };
  } });
    __register({ name: "mathAdvanced", dependencies: ["xml"], factory: function(xml) {
    function getVal(el) {
      return el.attrs["m:val"];
    }
    function valEl(name, v) {
      const a = { "m:val": String(v) };
      switch (name) {
        case "argSz":
          return xml.el("m:argSz", a);
        case "maxDist":
          return xml.el("m:maxDist", a);
        case "objDist":
          return xml.el("m:objDist", a);
        case "rSp":
          return xml.el("m:rSp", a);
        case "rSpRule":
          return xml.el("m:rSpRule", a);
        case "baseJc":
          return xml.el("m:baseJc", a);
        case "chr":
          return xml.el("m:chr", a);
        case "pos":
          return xml.el("m:pos", a);
        case "vertJc":
          return xml.el("m:vertJc", a);
        case "show":
          return xml.el("m:show", a);
        case "zeroAsc":
          return xml.el("m:zeroAsc", a);
        case "zeroDesc":
          return xml.el("m:zeroDesc", a);
        case "zeroWid":
          return xml.el("m:zeroWid", a);
        case "transp":
          return xml.el("m:transp", a);
        case "hideTop":
          return xml.el("m:hideTop", a);
        case "hideBot":
          return xml.el("m:hideBot", a);
        case "hideLeft":
          return xml.el("m:hideLeft", a);
        case "hideRight":
          return xml.el("m:hideRight", a);
        case "strikeBLTR":
          return xml.el("m:strikeBLTR", a);
        case "strikeTLBR":
          return xml.el("m:strikeTLBR", a);
        case "strikeH":
          return xml.el("m:strikeH", a);
        case "strikeV":
          return xml.el("m:strikeV", a);
        case "opEmu":
          return xml.el("m:opEmu", a);
        case "noBreak":
          return xml.el("m:noBreak", a);
        case "diff":
          return xml.el("m:diff", a);
        case "aln":
          return xml.el("m:aln", a);
        case "jc":
          return xml.el("m:jc", a);
        case "count":
          return xml.el("m:count", a);
        case "mcJc":
          return xml.el("m:mcJc", a);
        case "plcHide":
          return xml.el("m:plcHide", a);
        case "cGpRule":
          return xml.el("m:cGpRule", a);
        case "cSp":
          return xml.el("m:cSp", a);
        case "cGp":
          return xml.el("m:cGp", a);
        case "brkBin":
          return xml.el("m:brkBin", a);
        case "brkBinSub":
          return xml.el("m:brkBinSub", a);
        case "defJc":
          return xml.el("m:defJc", a);
        case "dispDef":
          return xml.el("m:dispDef", a);
        case "intLim":
          return xml.el("m:intLim", a);
        case "mathFont":
          return xml.el("m:mathFont", a);
        case "naryLim":
          return xml.el("m:naryLim", a);
        case "lMargin":
          return xml.el("m:lMargin", a);
        case "rMargin":
          return xml.el("m:rMargin", a);
        case "preSp":
          return xml.el("m:preSp", a);
        case "postSp":
          return xml.el("m:postSp", a);
        case "interSp":
          return xml.el("m:interSp", a);
        case "intraSp":
          return xml.el("m:intraSp", a);
        case "smallFrac":
          return xml.el("m:smallFrac", a);
        case "wrapIndent":
          return xml.el("m:wrapIndent", a);
        case "wrapRight":
          return xml.el("m:wrapRight", a);
        default:
          return xml.el("m:" + name, a);
      }
    }
    function parseCtrlPr(el) {
      const out = {};
      for (const c of el.children || []) {
        if (c.type !== "element")
          continue;
        if (c.name === "w:rPr")
          out.rPr = c;
      }
      return out;
    }
    function renderCtrlPr(cp) {
      const kids = [];
      if (cp && cp.rPr)
        kids.push(cp.rPr);
      return xml.el("m:ctrlPr", {}, kids);
    }
    function parseArgPr(el) {
      const out = {};
      for (const c of el.children || []) {
        if (c.type !== "element")
          continue;
        switch (c.name) {
          case "m:argSz":
            out.argSz = getVal(c);
            break;
          case "m:ctrlPr":
            out.ctrlPr = parseCtrlPr(c);
            break;
        }
      }
      return out;
    }
    function renderArgPr(ap) {
      const kids = [];
      if (ap.argSz != null)
        kids.push(valEl("argSz", ap.argSz));
      if (ap.ctrlPr)
        kids.push(renderCtrlPr(ap.ctrlPr));
      return xml.el("m:argPr", {}, kids);
    }
    function parseEqArrPr(el) {
      const out = {};
      for (const c of el.children || []) {
        if (c.type !== "element")
          continue;
        switch (c.name) {
          case "m:maxDist":
            out.maxDist = getVal(c);
            break;
          case "m:objDist":
            out.objDist = getVal(c);
            break;
          case "m:rSp":
            out.rSp = getVal(c);
            break;
          case "m:rSpRule":
            out.rSpRule = getVal(c);
            break;
          case "m:baseJc":
            out.baseJc = getVal(c);
            break;
          case "m:ctrlPr":
            out.ctrlPr = parseCtrlPr(c);
            break;
        }
      }
      return out;
    }
    function renderEqArrPr(p) {
      p = p || {};
      const kids = [];
      if (p.maxDist != null)
        kids.push(valEl("maxDist", p.maxDist));
      if (p.objDist != null)
        kids.push(valEl("objDist", p.objDist));
      if (p.rSp != null)
        kids.push(valEl("rSp", p.rSp));
      if (p.rSpRule != null)
        kids.push(valEl("rSpRule", p.rSpRule));
      if (p.baseJc != null)
        kids.push(valEl("baseJc", p.baseJc));
      if (p.ctrlPr)
        kids.push(renderCtrlPr(p.ctrlPr));
      return xml.el("m:eqArrPr", {}, kids);
    }
    function parseEqArr(el) {
      const out = { rows: [] };
      for (const c of el.children || []) {
        if (c.type !== "element")
          continue;
        switch (c.name) {
          case "m:eqArrPr":
            out.pr = parseEqArrPr(c);
            break;
          case "m:e":
            out.rows.push(c);
            break;
        }
      }
      return out;
    }
    function renderEqArr(arr) {
      const kids = [];
      if (arr.pr)
        kids.push(renderEqArrPr(arr.pr));
      for (const r of arr.rows || [])
        if (r && r.name === "m:e")
          kids.push(r);
        else
          kids.push(xml.el("m:e", {}, Array.isArray(r) ? r : [r]));
      return xml.el("m:eqArr", {}, kids);
    }
    function parseGroupChrPr(el) {
      const out = {};
      for (const c of el.children || []) {
        if (c.type !== "element")
          continue;
        switch (c.name) {
          case "m:chr":
            out.chr = getVal(c);
            break;
          case "m:pos":
            out.pos = getVal(c);
            break;
          case "m:vertJc":
            out.vertJc = getVal(c);
            break;
          case "m:ctrlPr":
            out.ctrlPr = parseCtrlPr(c);
            break;
        }
      }
      return out;
    }
    function renderGroupChrPr(p) {
      p = p || {};
      const kids = [];
      if (p.chr != null)
        kids.push(valEl("chr", p.chr));
      if (p.pos != null)
        kids.push(valEl("pos", p.pos));
      if (p.vertJc != null)
        kids.push(valEl("vertJc", p.vertJc));
      if (p.ctrlPr)
        kids.push(renderCtrlPr(p.ctrlPr));
      return xml.el("m:groupChrPr", {}, kids);
    }
    function parseGroupChr(el) {
      const out = { e: null };
      for (const c of el.children || []) {
        if (c.type !== "element")
          continue;
        switch (c.name) {
          case "m:groupChrPr":
            out.pr = parseGroupChrPr(c);
            break;
          case "m:e":
            out.e = c;
            break;
        }
      }
      return out;
    }
    function renderGroupChr(g) {
      const kids = [];
      kids.push(renderGroupChrPr(g.pr || {}));
      kids.push(g.e && g.e.name === "m:e" ? g.e : xml.el("m:e", {}, g.body || []));
      return xml.el("m:groupChr", {}, kids);
    }
    function parseLimPr(el) {
      const out = {};
      for (const c of el.children || []) {
        if (c.type !== "element")
          continue;
        if (c.name === "m:ctrlPr")
          out.ctrlPr = parseCtrlPr(c);
      }
      return out;
    }
    function renderLimLowPr(p) {
      const kids = [];
      if (p && p.ctrlPr)
        kids.push(renderCtrlPr(p.ctrlPr));
      return xml.el("m:limLowPr", {}, kids);
    }
    function renderLimUppPr(p) {
      const kids = [];
      if (p && p.ctrlPr)
        kids.push(renderCtrlPr(p.ctrlPr));
      return xml.el("m:limUppPr", {}, kids);
    }
    function parseLimLow(el) {
      const out = {};
      for (const c of el.children || []) {
        if (c.type !== "element")
          continue;
        switch (c.name) {
          case "m:limLowPr":
            out.pr = parseLimPr(c);
            break;
          case "m:e":
            out.e = c;
            break;
          case "m:lim":
            out.lim = c;
            break;
        }
      }
      return out;
    }
    function renderLimLow(l) {
      const kids = [renderLimLowPr(l.pr || {})];
      if (l.e)
        kids.push(l.e);
      else
        kids.push(xml.el("m:e", {}));
      if (l.lim)
        kids.push(l.lim);
      else
        kids.push(xml.el("m:lim", {}));
      return xml.el("m:limLow", {}, kids);
    }
    function parseLimUpp(el) {
      const out = {};
      for (const c of el.children || []) {
        if (c.type !== "element")
          continue;
        switch (c.name) {
          case "m:limUppPr":
            out.pr = parseLimPr(c);
            break;
          case "m:e":
            out.e = c;
            break;
          case "m:lim":
            out.lim = c;
            break;
        }
      }
      return out;
    }
    function renderLimUpp(l) {
      const kids = [renderLimUppPr(l.pr || {})];
      if (l.e)
        kids.push(l.e);
      else
        kids.push(xml.el("m:e", {}));
      if (l.lim)
        kids.push(l.lim);
      else
        kids.push(xml.el("m:lim", {}));
      return xml.el("m:limUpp", {}, kids);
    }
    function parseIntLim(el) {
      return { val: getVal(el) };
    }
    function renderIntLim(v) {
      return xml.el("m:intLim", { "m:val": String(v && v.val != null ? v.val : v) });
    }
    function parsePhantPr(el) {
      const out = {};
      for (const c of el.children || []) {
        if (c.type !== "element")
          continue;
        switch (c.name) {
          case "m:show":
            out.show = getVal(c);
            break;
          case "m:zeroAsc":
            out.zeroAsc = getVal(c);
            break;
          case "m:zeroDesc":
            out.zeroDesc = getVal(c);
            break;
          case "m:zeroWid":
            out.zeroWid = getVal(c);
            break;
          case "m:transp":
            out.transp = getVal(c);
            break;
          case "m:ctrlPr":
            out.ctrlPr = parseCtrlPr(c);
            break;
        }
      }
      return out;
    }
    function renderPhantPr(p) {
      p = p || {};
      const kids = [];
      if (p.show != null)
        kids.push(valEl("show", p.show));
      if (p.zeroAsc != null)
        kids.push(valEl("zeroAsc", p.zeroAsc));
      if (p.zeroDesc != null)
        kids.push(valEl("zeroDesc", p.zeroDesc));
      if (p.zeroWid != null)
        kids.push(valEl("zeroWid", p.zeroWid));
      if (p.transp != null)
        kids.push(valEl("transp", p.transp));
      if (p.ctrlPr)
        kids.push(renderCtrlPr(p.ctrlPr));
      return xml.el("m:phantPr", {}, kids);
    }
    function parsePhant(el) {
      const out = {};
      for (const c of el.children || []) {
        if (c.type !== "element")
          continue;
        switch (c.name) {
          case "m:phantPr":
            out.pr = parsePhantPr(c);
            break;
          case "m:e":
            out.e = c;
            break;
        }
      }
      return out;
    }
    function renderPhant(p) {
      const kids = [renderPhantPr(p.pr || {})];
      kids.push(p.e || xml.el("m:e", {}));
      return xml.el("m:phant", {}, kids);
    }
    const BB_FLAGS = [
      "hideTop",
      "hideBot",
      "hideLeft",
      "hideRight",
      "strikeBLTR",
      "strikeTLBR",
      "strikeH",
      "strikeV"
    ];
    function parseBorderBoxPr(el) {
      const out = {};
      for (const c of el.children || []) {
        if (c.type !== "element")
          continue;
        switch (c.name) {
          case "m:hideTop":
            out.hideTop = getVal(c);
            break;
          case "m:hideBot":
            out.hideBot = getVal(c);
            break;
          case "m:hideLeft":
            out.hideLeft = getVal(c);
            break;
          case "m:hideRight":
            out.hideRight = getVal(c);
            break;
          case "m:strikeBLTR":
            out.strikeBLTR = getVal(c);
            break;
          case "m:strikeTLBR":
            out.strikeTLBR = getVal(c);
            break;
          case "m:strikeH":
            out.strikeH = getVal(c);
            break;
          case "m:strikeV":
            out.strikeV = getVal(c);
            break;
          case "m:ctrlPr":
            out.ctrlPr = parseCtrlPr(c);
            break;
        }
      }
      return out;
    }
    function renderBorderBoxPr(p) {
      p = p || {};
      const kids = [];
      for (const k of BB_FLAGS)
        if (p[k] != null)
          kids.push(valEl(k, p[k]));
      if (p.ctrlPr)
        kids.push(renderCtrlPr(p.ctrlPr));
      return xml.el("m:borderBoxPr", {}, kids);
    }
    function parseBorderBox(el) {
      const out = {};
      for (const c of el.children || []) {
        if (c.type !== "element")
          continue;
        switch (c.name) {
          case "m:borderBoxPr":
            out.pr = parseBorderBoxPr(c);
            break;
          case "m:e":
            out.e = c;
            break;
        }
      }
      return out;
    }
    function renderBorderBox(b) {
      const kids = [renderBorderBoxPr(b.pr || {})];
      kids.push(b.e || xml.el("m:e", {}));
      return xml.el("m:borderBox", {}, kids);
    }
    function parseBoxPr(el) {
      const out = {};
      for (const c of el.children || []) {
        if (c.type !== "element")
          continue;
        switch (c.name) {
          case "m:opEmu":
            out.opEmu = getVal(c);
            break;
          case "m:noBreak":
            out.noBreak = getVal(c);
            break;
          case "m:diff":
            out.diff = getVal(c);
            break;
          case "m:brk":
            out.brk = c.attrs["m:val"] != null ? c.attrs["m:val"] : c.attrs["m:alnAt"] || !0;
            break;
          case "m:aln":
            out.aln = getVal(c);
            break;
          case "m:ctrlPr":
            out.ctrlPr = parseCtrlPr(c);
            break;
        }
      }
      return out;
    }
    function renderBoxPr(p) {
      p = p || {};
      const kids = [];
      if (p.opEmu != null)
        kids.push(valEl("opEmu", p.opEmu));
      if (p.noBreak != null)
        kids.push(valEl("noBreak", p.noBreak));
      if (p.diff != null)
        kids.push(valEl("diff", p.diff));
      if (p.brk != null) {
        const v = p.brk === !0 ? {} : { "m:val": String(p.brk) };
        kids.push(xml.el("m:brk", v));
      }
      if (p.aln != null)
        kids.push(valEl("aln", p.aln));
      if (p.ctrlPr)
        kids.push(renderCtrlPr(p.ctrlPr));
      return xml.el("m:boxPr", {}, kids);
    }
    function parseBox(el) {
      const out = {};
      for (const c of el.children || []) {
        if (c.type !== "element")
          continue;
        switch (c.name) {
          case "m:boxPr":
            out.pr = parseBoxPr(c);
            break;
          case "m:e":
            out.e = c;
            break;
        }
      }
      return out;
    }
    function renderBox(b) {
      const kids = [renderBoxPr(b.pr || {})];
      kids.push(b.e || xml.el("m:e", {}));
      return xml.el("m:box", {}, kids);
    }
    const MATHPR_VAL = [
      "brkBin",
      "brkBinSub",
      "defJc",
      "dispDef",
      "intLim",
      "mathFont",
      "naryLim",
      "lMargin",
      "rMargin",
      "preSp",
      "postSp",
      "interSp",
      "intraSp",
      "smallFrac",
      "wrapIndent",
      "wrapRight"
    ];
    function parseMathPr(el) {
      const out = {};
      for (const c of el.children || []) {
        if (c.type !== "element")
          continue;
        switch (c.name) {
          case "m:brkBin":
            out.brkBin = getVal(c);
            break;
          case "m:brkBinSub":
            out.brkBinSub = getVal(c);
            break;
          case "m:defJc":
            out.defJc = getVal(c);
            break;
          case "m:dispDef":
            out.dispDef = getVal(c);
            break;
          case "m:intLim":
            out.intLim = getVal(c);
            break;
          case "m:mathFont":
            out.mathFont = getVal(c);
            break;
          case "m:naryLim":
            out.naryLim = getVal(c);
            break;
          case "m:lMargin":
            out.lMargin = getVal(c);
            break;
          case "m:rMargin":
            out.rMargin = getVal(c);
            break;
          case "m:preSp":
            out.preSp = getVal(c);
            break;
          case "m:postSp":
            out.postSp = getVal(c);
            break;
          case "m:interSp":
            out.interSp = getVal(c);
            break;
          case "m:intraSp":
            out.intraSp = getVal(c);
            break;
          case "m:smallFrac":
            out.smallFrac = getVal(c);
            break;
          case "m:wrapIndent":
            out.wrapIndent = getVal(c);
            break;
          case "m:wrapRight":
            out.wrapRight = getVal(c);
            break;
        }
      }
      return out;
    }
    function renderMathPr(mp) {
      mp = mp || {};
      const kids = MATHPR_VAL.filter((k) => mp[k] != null).map((k) => valEl(k, mp[k]));
      return xml.el("m:mathPr", {}, kids);
    }
    function parseOMathParaPr(el) {
      const out = {};
      for (const c of el.children || []) {
        if (c.type !== "element")
          continue;
        if (c.name === "m:jc")
          out.jc = getVal(c);
      }
      return out;
    }
    function renderOMathParaPr(p) {
      p = p || {};
      const kids = [];
      if (p.jc != null)
        kids.push(valEl("jc", p.jc));
      return xml.el("m:oMathParaPr", {}, kids);
    }
    function parseMcPr(el) {
      const out = {};
      for (const c of el.children || []) {
        if (c.type !== "element")
          continue;
        switch (c.name) {
          case "m:count":
            out.count = getVal(c);
            break;
          case "m:mcJc":
            out.mcJc = getVal(c);
            break;
        }
      }
      return out;
    }
    function renderMcPr(p) {
      p = p || {};
      const kids = [];
      if (p.count != null)
        kids.push(valEl("count", p.count));
      if (p.mcJc != null)
        kids.push(valEl("mcJc", p.mcJc));
      return xml.el("m:mcPr", {}, kids);
    }
    function parseMc(el) {
      const out = {};
      for (const c of el.children || []) {
        if (c.type !== "element")
          continue;
        if (c.name === "m:mcPr")
          out.pr = parseMcPr(c);
      }
      return out;
    }
    function renderMc(m) {
      return xml.el("m:mc", {}, [renderMcPr(m.pr || {})]);
    }
    function parseMcs(el) {
      const out = { mcs: [] };
      for (const c of el.children || []) {
        if (c.type !== "element")
          continue;
        if (c.name === "m:mc")
          out.mcs.push(parseMc(c));
      }
      return out;
    }
    function renderMcs(m) {
      return xml.el("m:mcs", {}, (m.mcs || []).map(renderMc));
    }
    function parseMPr(el) {
      const out = {};
      for (const c of el.children || []) {
        if (c.type !== "element")
          continue;
        switch (c.name) {
          case "m:baseJc":
            out.baseJc = getVal(c);
            break;
          case "m:plcHide":
            out.plcHide = getVal(c);
            break;
          case "m:rSpRule":
            out.rSpRule = getVal(c);
            break;
          case "m:cGpRule":
            out.cGpRule = getVal(c);
            break;
          case "m:rSp":
            out.rSp = getVal(c);
            break;
          case "m:cSp":
            out.cSp = getVal(c);
            break;
          case "m:cGp":
            out.cGp = getVal(c);
            break;
          case "m:mcs":
            out.mcs = parseMcs(c);
            break;
          case "m:ctrlPr":
            out.ctrlPr = parseCtrlPr(c);
            break;
        }
      }
      return out;
    }
    function renderMPr(p) {
      p = p || {};
      const kids = [];
      if (p.baseJc != null)
        kids.push(valEl("baseJc", p.baseJc));
      if (p.plcHide != null)
        kids.push(valEl("plcHide", p.plcHide));
      if (p.rSpRule != null)
        kids.push(valEl("rSpRule", p.rSpRule));
      if (p.cGpRule != null)
        kids.push(valEl("cGpRule", p.cGpRule));
      if (p.rSp != null)
        kids.push(valEl("rSp", p.rSp));
      if (p.cSp != null)
        kids.push(valEl("cSp", p.cSp));
      if (p.cGp != null)
        kids.push(valEl("cGp", p.cGp));
      if (p.mcs)
        kids.push(renderMcs(p.mcs));
      if (p.ctrlPr)
        kids.push(renderCtrlPr(p.ctrlPr));
      return xml.el("m:mPr", {}, kids);
    }
    function parseAln(el) {
      return { val: getVal(el) };
    }
    function renderAln(v) {
      return xml.el("m:aln", { "m:val": String(v && v.val != null ? v.val : v) });
    }
    function parseAlnScr(el) {
      return { val: getVal(el) };
    }
    function renderAlnScr(v) {
      return xml.el("m:alnScr", { "m:val": String(v && v.val != null ? v.val : v) });
    }
    function parseLit(el) {
      return { val: getVal(el) };
    }
    function renderLit(v) {
      return xml.el("m:lit", { "m:val": String(v && v.val != null ? v.val : v) });
    }
    function parseNor(el) {
      return { val: getVal(el) };
    }
    function renderNor(v) {
      return xml.el("m:nor", { "m:val": String(v && v.val != null ? v.val : v) });
    }
    function parseScr(el) {
      return { val: getVal(el) };
    }
    function renderScr(v) {
      return xml.el("m:scr", { "m:val": String(v && v.val != null ? v.val : v) });
    }
    function parseShow(el) {
      return { val: getVal(el) };
    }
    function renderShow(v) {
      return xml.el("m:show", { "m:val": String(v && v.val != null ? v.val : v) });
    }
    function parseShp(el) {
      return { val: getVal(el) };
    }
    function renderShp(v) {
      return xml.el("m:shp", { "m:val": String(v && v.val != null ? v.val : v) });
    }
    function parseSubHide(el) {
      return { val: getVal(el) };
    }
    function renderSubHide(v) {
      return xml.el("m:subHide", { "m:val": String(v && v.val != null ? v.val : v) });
    }
    function parseSupHide(el) {
      return { val: getVal(el) };
    }
    function renderSupHide(v) {
      return xml.el("m:supHide", { "m:val": String(v && v.val != null ? v.val : v) });
    }
    function parseTransp(el) {
      return { val: getVal(el) };
    }
    function renderTransp(v) {
      return xml.el("m:transp", { "m:val": String(v && v.val != null ? v.val : v) });
    }
    function parseMathElement(el) {
      switch (el.name) {
        case "m:eqArr":
          return { kind: "eqArr", value: parseEqArr(el) };
        case "m:eqArrPr":
          return { kind: "eqArrPr", value: parseEqArrPr(el) };
        case "m:groupChr":
          return { kind: "groupChr", value: parseGroupChr(el) };
        case "m:groupChrPr":
          return { kind: "groupChrPr", value: parseGroupChrPr(el) };
        case "m:limLow":
          return { kind: "limLow", value: parseLimLow(el) };
        case "m:limLowPr":
          return { kind: "limLowPr", value: parseLimPr(el) };
        case "m:limUpp":
          return { kind: "limUpp", value: parseLimUpp(el) };
        case "m:limUppPr":
          return { kind: "limUppPr", value: parseLimPr(el) };
        case "m:phant":
          return { kind: "phant", value: parsePhant(el) };
        case "m:phantPr":
          return { kind: "phantPr", value: parsePhantPr(el) };
        case "m:borderBox":
          return { kind: "borderBox", value: parseBorderBox(el) };
        case "m:borderBoxPr":
          return { kind: "borderBoxPr", value: parseBorderBoxPr(el) };
        case "m:box":
          return { kind: "box", value: parseBox(el) };
        case "m:boxPr":
          return { kind: "boxPr", value: parseBoxPr(el) };
        case "m:mathPr":
          return { kind: "mathPr", value: parseMathPr(el) };
        case "m:oMathParaPr":
          return { kind: "oMathParaPr", value: parseOMathParaPr(el) };
        case "m:ctrlPr":
          return { kind: "ctrlPr", value: parseCtrlPr(el) };
        case "m:argPr":
          return { kind: "argPr", value: parseArgPr(el) };
        case "m:mPr":
          return { kind: "mPr", value: parseMPr(el) };
        case "m:mcPr":
          return { kind: "mcPr", value: parseMcPr(el) };
        case "m:mc":
          return { kind: "mc", value: parseMc(el) };
        case "m:mcs":
          return { kind: "mcs", value: parseMcs(el) };
        case "m:intLim":
          return { kind: "intLim", value: parseIntLim(el) };
        case "m:aln":
          return { kind: "aln", value: parseAln(el) };
        case "m:alnScr":
          return { kind: "alnScr", value: parseAlnScr(el) };
        case "m:lit":
          return { kind: "lit", value: parseLit(el) };
        case "m:nor":
          return { kind: "nor", value: parseNor(el) };
        case "m:scr":
          return { kind: "scr", value: parseScr(el) };
        case "m:show":
          return { kind: "show", value: parseShow(el) };
        case "m:shp":
          return { kind: "shp", value: parseShp(el) };
        case "m:subHide":
          return { kind: "subHide", value: parseSubHide(el) };
        case "m:supHide":
          return { kind: "supHide", value: parseSupHide(el) };
        case "m:transp":
          return { kind: "transp", value: parseTransp(el) };
        case "m:brkBin":
          return { kind: "brkBin", value: { val: getVal(el) } };
        case "m:brkBinSub":
          return { kind: "brkBinSub", value: { val: getVal(el) } };
        case "m:defJc":
          return { kind: "defJc", value: { val: getVal(el) } };
        case "m:dispDef":
          return { kind: "dispDef", value: { val: getVal(el) } };
        case "m:mathFont":
          return { kind: "mathFont", value: { val: getVal(el) } };
        case "m:naryLim":
          return { kind: "naryLim", value: { val: getVal(el) } };
        case "m:lMargin":
          return { kind: "lMargin", value: { val: getVal(el) } };
        case "m:rMargin":
          return { kind: "rMargin", value: { val: getVal(el) } };
        case "m:preSp":
          return { kind: "preSp", value: { val: getVal(el) } };
        case "m:postSp":
          return { kind: "postSp", value: { val: getVal(el) } };
        case "m:interSp":
          return { kind: "interSp", value: { val: getVal(el) } };
        case "m:intraSp":
          return { kind: "intraSp", value: { val: getVal(el) } };
        case "m:smallFrac":
          return { kind: "smallFrac", value: { val: getVal(el) } };
        case "m:wrapIndent":
          return { kind: "wrapIndent", value: { val: getVal(el) } };
        case "m:wrapRight":
          return { kind: "wrapRight", value: { val: getVal(el) } };
        case "m:maxDist":
          return { kind: "maxDist", value: { val: getVal(el) } };
        case "m:objDist":
          return { kind: "objDist", value: { val: getVal(el) } };
        case "m:rSp":
          return { kind: "rSp", value: { val: getVal(el) } };
        case "m:rSpRule":
          return { kind: "rSpRule", value: { val: getVal(el) } };
        case "m:cSp":
          return { kind: "cSp", value: { val: getVal(el) } };
        case "m:cGp":
          return { kind: "cGp", value: { val: getVal(el) } };
        case "m:cGpRule":
          return { kind: "cGpRule", value: { val: getVal(el) } };
        case "m:count":
          return { kind: "count", value: { val: getVal(el) } };
        case "m:mcJc":
          return { kind: "mcJc", value: { val: getVal(el) } };
        case "m:baseJc":
          return { kind: "baseJc", value: { val: getVal(el) } };
        case "m:vertJc":
          return { kind: "vertJc", value: { val: getVal(el) } };
        case "m:plcHide":
          return { kind: "plcHide", value: { val: getVal(el) } };
        case "m:chr":
          return { kind: "chr", value: { val: getVal(el) } };
        case "m:pos":
          return { kind: "pos", value: { val: getVal(el) } };
        case "m:argSz":
          return { kind: "argSz", value: { val: getVal(el) } };
        case "m:zeroAsc":
          return { kind: "zeroAsc", value: { val: getVal(el) } };
        case "m:zeroDesc":
          return { kind: "zeroDesc", value: { val: getVal(el) } };
        case "m:zeroWid":
          return { kind: "zeroWid", value: { val: getVal(el) } };
        case "m:hideTop":
          return { kind: "hideTop", value: { val: getVal(el) } };
        case "m:hideBot":
          return { kind: "hideBot", value: { val: getVal(el) } };
        case "m:hideLeft":
          return { kind: "hideLeft", value: { val: getVal(el) } };
        case "m:hideRight":
          return { kind: "hideRight", value: { val: getVal(el) } };
        case "m:strikeBLTR":
          return { kind: "strikeBLTR", value: { val: getVal(el) } };
        case "m:strikeTLBR":
          return { kind: "strikeTLBR", value: { val: getVal(el) } };
        case "m:strikeH":
          return { kind: "strikeH", value: { val: getVal(el) } };
        case "m:strikeV":
          return { kind: "strikeV", value: { val: getVal(el) } };
        case "m:opEmu":
          return { kind: "opEmu", value: { val: getVal(el) } };
        case "m:noBreak":
          return { kind: "noBreak", value: { val: getVal(el) } };
        case "m:diff":
          return { kind: "diff", value: { val: getVal(el) } };
        case "m:brk":
          return { kind: "brk", value: { val: getVal(el) } };
        case "m:jc":
          return { kind: "jc", value: { val: getVal(el) } };
        default:
          return { kind: "unknown", value: el };
      }
    }
    return {
      parseEqArr,
      renderEqArr,
      parseEqArrPr,
      renderEqArrPr,
      parseGroupChr,
      renderGroupChr,
      parseGroupChrPr,
      renderGroupChrPr,
      parseLimLow,
      renderLimLow,
      parseLimUpp,
      renderLimUpp,
      renderLimLowPr,
      renderLimUppPr,
      parseIntLim,
      renderIntLim,
      parsePhant,
      renderPhant,
      parsePhantPr,
      renderPhantPr,
      parseBorderBox,
      renderBorderBox,
      parseBorderBoxPr,
      renderBorderBoxPr,
      parseBox,
      renderBox,
      parseBoxPr,
      renderBoxPr,
      parseMathPr,
      renderMathPr,
      parseOMathParaPr,
      renderOMathParaPr,
      parseCtrlPr,
      renderCtrlPr,
      parseArgPr,
      renderArgPr,
      parseMc,
      renderMc,
      parseMcs,
      renderMcs,
      parseMcPr,
      renderMcPr,
      parseMPr,
      renderMPr,
      parseAln,
      renderAln,
      parseAlnScr,
      renderAlnScr,
      parseLit,
      renderLit,
      parseNor,
      renderNor,
      parseScr,
      renderScr,
      parseShow,
      renderShow,
      parseShp,
      renderShp,
      parseSubHide,
      renderSubHide,
      parseSupHide,
      renderSupHide,
      parseTransp,
      renderTransp,
      parseMathElement,
      MATHPR_VAL,
      BB_FLAGS
    };
  } });
    __register({ name: "dmlEffects", dependencies: ["xml","ooxmlShared"], factory: function(xml, shared) {
    const codec = shared.createDmlColorCodec(xml), COLOR_TAGS = codec.COLOR_TAGS;
    function parseColor(el) {
      return codec.parseColor(el, { withMods: !0 });
    }
    function renderColor(c) {
      return codec.renderColor(c, { withMods: !0 });
    }
    function findFirstColor(el) {
      return codec.findFirstColor(el, { withMods: !0 });
    }
    const { parseColorMod, renderColorMod } = codec;
    function parseEffect(el) {
      switch (el.name) {
        case "a:outerShdw":
          return { kind: "outerShdw", attrs: { ...el.attrs }, color: findFirstColor(el) };
        case "a:innerShdw":
          return { kind: "innerShdw", attrs: { ...el.attrs }, color: findFirstColor(el) };
        case "a:prstShdw":
          return { kind: "prstShdw", attrs: { ...el.attrs }, color: findFirstColor(el) };
        case "a:glow":
          return { kind: "glow", attrs: { ...el.attrs }, color: findFirstColor(el) };
        case "a:reflection":
          return { kind: "reflection", attrs: { ...el.attrs } };
        case "a:softEdge":
          return { kind: "softEdge", attrs: { ...el.attrs } };
        case "a:blur":
          return { kind: "blur", attrs: { ...el.attrs } };
        case "a:fillOverlay": {
          const inner = (el.children || []).filter((c) => c.type === "element");
          return { kind: "fillOverlay", attrs: { ...el.attrs }, fills: inner };
        }
        default:
          return null;
      }
    }
    function renderEffect(e) {
      const cKids = e.color ? [renderColor(e.color)] : [];
      switch (e.kind) {
        case "outerShdw":
          return xml.el("a:outerShdw", e.attrs || {}, cKids);
        case "innerShdw":
          return xml.el("a:innerShdw", e.attrs || {}, cKids);
        case "prstShdw":
          return xml.el("a:prstShdw", e.attrs || {}, cKids);
        case "glow":
          return xml.el("a:glow", e.attrs || {}, cKids);
        case "reflection":
          return xml.el("a:reflection", e.attrs || {});
        case "softEdge":
          return xml.el("a:softEdge", e.attrs || {});
        case "blur":
          return xml.el("a:blur", e.attrs || {});
        case "fillOverlay":
          return xml.el("a:fillOverlay", e.attrs || {}, e.fills || []);
        default:
          return null;
      }
    }
    function parseEffectLst(el) {
      const out = { effects: [] };
      for (const c of el.children || []) {
        if (c.type !== "element")
          continue;
        const eff = parseEffect(c);
        if (eff)
          out.effects.push(eff);
      }
      return out;
    }
    function renderEffectLst(e) {
      const kids = (e.effects || []).map(renderEffect).filter(Boolean);
      return xml.el("a:effectLst", {}, kids);
    }
    function parseEffectDag(el) {
      const out = { attrs: { ...el.attrs }, effects: [] };
      for (const c of el.children || []) {
        if (c.type !== "element")
          continue;
        const eff = parseEffect(c);
        if (eff)
          out.effects.push(eff);
      }
      return out;
    }
    function renderEffectDag(e) {
      const kids = (e.effects || []).map(renderEffect).filter(Boolean);
      return xml.el("a:effectDag", e.attrs || {}, kids);
    }
    function parseEffectRef(el) {
      return { ref: el.attrs.ref };
    }
    function renderEffectRef(e) {
      return xml.el("a:effect", { ref: String(e.ref) });
    }
    function parseEffectStyle(el) {
      const out = {};
      for (const c of el.children || []) {
        if (c.type !== "element")
          continue;
        switch (c.name) {
          case "a:effectLst":
            out.effectLst = parseEffectLst(c);
            break;
          case "a:effectDag":
            out.effectDag = parseEffectDag(c);
            break;
        }
      }
      return out;
    }
    function renderEffectStyle(s) {
      const kids = [];
      if (s.effectLst)
        kids.push(renderEffectLst(s.effectLst));
      if (s.effectDag)
        kids.push(renderEffectDag(s.effectDag));
      return xml.el("a:effectStyle", {}, kids);
    }
    function parseEffectStyleLst(el) {
      const out = { styles: [] };
      for (const c of el.children || [])
        if (c.type === "element" && c.name === "a:effectStyle")
          out.styles.push(parseEffectStyle(c));
      return out;
    }
    function renderEffectStyleLst(l) {
      return xml.el("a:effectStyleLst", {}, (l.styles || []).map(renderEffectStyle));
    }
    function parseXfrm(el) {
      return { attrs: { ...el.attrs } };
    }
    function renderXfrm(x) {
      return xml.el("a:xfrm", x.attrs || {});
    }
    function parseAny(el) {
      switch (el.name) {
        case "a:effectLst":
          return parseEffectLst(el);
        case "a:effectDag":
          return parseEffectDag(el);
        case "a:xfrm":
          return parseXfrm(el);
        case "a:outerShdw":
        case "a:innerShdw":
        case "a:prstShdw":
        case "a:glow":
        case "a:reflection":
        case "a:softEdge":
        case "a:blur":
        case "a:fillOverlay":
          return parseEffect(el);
        case "a:lum":
        case "a:tint":
        case "a:shade":
        case "a:grayscl":
        case "a:duotone":
        case "a:clrChange":
        case "a:clrRepl":
        case "a:alphaMod":
        case "a:alphaModFix":
        case "a:alphaCeiling":
        case "a:alphaFloor":
        case "a:alphaRepl":
        case "a:biLevel":
        case "a:lumMod":
        case "a:lumOff":
          return parseColorMod(el);
        case "a:effect":
          return parseEffectRef(el);
        case "a:effectStyle":
          return parseEffectStyle(el);
        case "a:effectStyleLst":
          return parseEffectStyleLst(el);
        default:
          return null;
      }
    }
    return {
      parseAny,
      parseEffectLst,
      renderEffectLst,
      parseEffectDag,
      renderEffectDag,
      parseEffect,
      renderEffect,
      parseColor,
      renderColor,
      parseColorMod,
      renderColorMod,
      parseXfrm,
      renderXfrm,
      parseEffectRef,
      renderEffectRef,
      parseEffectStyle,
      renderEffectStyle,
      parseEffectStyleLst,
      renderEffectStyleLst,
      COLOR_TAGS
    };
  } });
    __register({ name: "dmlFillsAdvanced", dependencies: ["xml","ooxmlShared"], factory: function(xml, shared) {
    const codec = shared.createDmlColorCodec(xml), COLOR_TAGS = codec.COLOR_TAGS;
    function parseColor(el) {
      return codec.parseColor(el, { withMods: !1 });
    }
    function renderColor(c) {
      return codec.renderColor(c, { withMods: !1 });
    }
    function findFirstColor(el) {
      return codec.findFirstColor(el, { withMods: !1 });
    }
    function parseGradFill(el) {
      const out = { attrs: { ...el.attrs }, stops: [] };
      for (const c of el.children || []) {
        if (c.type !== "element")
          continue;
        switch (c.name) {
          case "a:gsLst": {
            for (const gs of c.children || [])
              if (gs.type === "element" && gs.name === "a:gs")
                out.stops.push({
                  pos: gs.attrs.pos,
                  color: findFirstColor(gs)
                });
            break;
          }
          case "a:lin":
            out.lin = { ...c.attrs };
            break;
          case "a:path":
            out.path = parseGradPath(c);
            break;
          case "a:tileRect":
            out.tileRect = { ...c.attrs };
            break;
        }
      }
      return out;
    }
    function parseGradPath(el) {
      const out = { attrs: { ...el.attrs } }, ftr = (el.children || []).find((c) => c.type === "element" && c.name === "a:fillToRect");
      if (ftr)
        out.fillToRect = { ...ftr.attrs };
      return out;
    }
    function renderGradFill(g) {
      const kids = [];
      if (g.stops)
        kids.push(xml.el("a:gsLst", {}, g.stops.map((s) => {
          const sub = [];
          if (s.color)
            sub.push(renderColor(s.color));
          return xml.el("a:gs", { pos: String(s.pos) }, sub);
        })));
      if (g.lin)
        kids.push(xml.el("a:lin", { ...g.lin }));
      if (g.path)
        kids.push(renderGradPath(g.path));
      if (g.tileRect)
        kids.push(xml.el("a:tileRect", { ...g.tileRect }));
      return xml.el("a:gradFill", g.attrs || {}, kids);
    }
    function renderGradPath(p) {
      const kids = [];
      if (p.fillToRect)
        kids.push(xml.el("a:fillToRect", { ...p.fillToRect }));
      return xml.el("a:path", p.attrs || {}, kids);
    }
    function parseBlipFill(el) {
      const out = { attrs: { ...el.attrs } };
      for (const c of el.children || []) {
        if (c.type !== "element")
          continue;
        switch (c.name) {
          case "a:blip":
            out.blip = { ...c.attrs };
            break;
          case "a:srcRect":
            out.srcRect = { ...c.attrs };
            break;
          case "a:tile": {
            out.mode = "tile";
            out.tile = { ...c.attrs };
            break;
          }
          case "a:stretch": {
            out.mode = "stretch";
            const fr = (c.children || []).find((x) => x.type === "element" && x.name === "a:fillRect");
            if (fr)
              out.fillRect = { ...fr.attrs };
            else
              out.fillRect = {};
            break;
          }
        }
      }
      return out;
    }
    function renderBlipFill(b) {
      const kids = [];
      if (b.blip)
        kids.push(xml.el("a:blip", { ...b.blip }));
      if (b.srcRect)
        kids.push(xml.el("a:srcRect", { ...b.srcRect }));
      if (b.mode === "tile")
        kids.push(xml.el("a:tile", { ...b.tile || {} }));
      if (b.mode === "stretch")
        kids.push(xml.el("a:stretch", {}, [xml.el("a:fillRect", { ...b.fillRect || {} })]));
      return xml.el("a:blipFill", b.attrs || {}, kids);
    }
    function parsePattFill(el) {
      const out = { attrs: { ...el.attrs } };
      for (const c of el.children || []) {
        if (c.type !== "element")
          continue;
        switch (c.name) {
          case "a:fgClr":
            out.fgClr = findFirstColor(c);
            break;
          case "a:bgClr":
            out.bgClr = findFirstColor(c);
            break;
        }
      }
      return out;
    }
    function renderPattFill(p) {
      const kids = [];
      if (p.fgClr)
        kids.push(xml.el("a:fgClr", {}, [renderColor(p.fgClr)]));
      if (p.bgClr)
        kids.push(xml.el("a:bgClr", {}, [renderColor(p.bgClr)]));
      return xml.el("a:pattFill", p.attrs || {}, kids);
    }
    function parseAny(el) {
      switch (el.name) {
        case "a:gradFill":
          return parseGradFill(el);
        case "a:blipFill":
          return parseBlipFill(el);
        case "a:pattFill":
          return parsePattFill(el);
        case "a:gsLst":
          return el;
        case "a:gs":
          return { pos: el.attrs.pos };
        case "a:lin":
          return { ...el.attrs };
        case "a:path":
          return parseGradPath(el);
        case "a:tileRect":
          return { ...el.attrs };
        case "a:fillToRect":
          return { ...el.attrs };
        case "a:blip":
          return { ...el.attrs };
        case "a:srcRect":
          return { ...el.attrs };
        case "a:tile":
          return { ...el.attrs };
        case "a:stretch":
          return el;
        case "a:fillRect":
          return { ...el.attrs };
        case "a:fgClr":
        case "a:bgClr":
          return findFirstColor(el);
        case "a:srgbClr":
        case "a:schemeClr":
        case "a:prstClr":
        case "a:hslClr":
        case "a:scrgbClr":
        case "a:sysClr":
          return parseColor(el);
        default:
          return null;
      }
    }
    return {
      parseAny,
      parseGradFill,
      renderGradFill,
      parseBlipFill,
      renderBlipFill,
      parsePattFill,
      renderPattFill,
      parseColor,
      renderColor,
      COLOR_TAGS
    };
  } });

    const __core = __resolve("pptx");
    __core.use(__resolve("pmlAnimations"), __resolve("pmlTransitions"), __resolve("pmlNotes"), __resolve("pmlLayoutsTyped"), __resolve("dmlChartDataLabels"), __resolve("dmlChartTrendlines"), __resolve("dmlChartAxesAdvanced"), __resolve("dmlChart3d"), __resolve("dmlChartOtherTypes"), __resolve("mathAdvanced"), __resolve("dmlEffects"), __resolve("dmlFillsAdvanced"));
    return __core;
    }
};
