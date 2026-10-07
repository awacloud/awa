/*!
 * Copyright (c) 2026 AwaCloud SAS
 * Author: Matthieu Bouilloux
 * SPDX-License-Identifier: AGPL-3.0-only
 * Dual-licensed; see the NOTICE file for licensing and any additional terms.
 */
/* GENERATED — do not edit. Source: packages/front/office/ooxml/tools/generate-bundles.mjs */

/**
 * @fileoverview `@awacloud/ooxml/bundles/prebuilt/xlsx-package` — pre-built single-factory bundle.
 *
 * Variant **package** : declares the 7 fw modules as dependencies and inlines every
 * ooxml-local factory transitively reachable from `xlsx` .
 *
 * @module ooxml/bundles/prebuilt/xlsx-package
 */

export const xlsxPackage = {
    name: "xlsxPackage",
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
    __register({ name: "xlsxStyles", dependencies: ["ooxmlErrors","xml","ooxmlShared"], factory: function(errors, xml, shared) {
    const { ParseError } = errors, { NS, REL_TYPE, CT, readBoolAttr, writeBoolAttr, encodeText, decodeText } = shared, SS_NS = NS.SS, REL_TYPE_STYLES = REL_TYPE.STYLES, CT_STYLES = CT.STYLES_X;
    function readToggle(el) {
      if (!el)
        return;
      const v = el.attrs.val;
      if (v === void 0)
        return !0;
      return !(v === "0" || v === "false");
    }
    function elFlag(name, val) {
      return val ? xml.el(name, {}) : null;
    }
    const _xlsxColor = shared.createXlsxColorCodec(xml), parseColor = _xlsxColor.parseColor, renderColor = _xlsxColor.renderColor;
    function parseNumFmts(el) {
      const out = [];
      for (const c of xml.findAll(el, "numFmt"))
        out.push({
          id: Number(c.attrs.numFmtId),
          formatCode: c.attrs.formatCode
        });
      return out;
    }
    function renderNumFmts(numFmts) {
      if (!numFmts || !numFmts.length)
        return null;
      return xml.el("numFmts", { count: String(numFmts.length) }, numFmts.map((f) => xml.el("numFmt", {
        numFmtId: String(f.id),
        formatCode: f.formatCode
      })));
    }
    function parseFont(fEl) {
      const out = {}, extras = [];
      for (const c of fEl.children) {
        if (c.type !== "element")
          continue;
        switch (c.name) {
          case "sz":
            out.size = Number(c.attrs.val);
            break;
          case "name":
            out.name = c.attrs.val;
            break;
          case "family":
            out.family = Number(c.attrs.val);
            break;
          case "color":
            out.color = parseColor(c);
            break;
          case "b":
            out.bold = readToggle(c);
            break;
          case "i":
            out.italic = readToggle(c);
            break;
          case "strike":
            out.strike = readToggle(c);
            break;
          case "u":
            out.underline = c.attrs.val || "single";
            break;
          case "vertAlign":
            out.vertAlign = c.attrs.val;
            break;
          case "scheme":
            out.scheme = c.attrs.val;
            break;
          case "charset":
            out.charset = Number(c.attrs.val);
            break;
          default:
            extras.push(c);
        }
      }
      if (extras.length)
        out._extras = extras;
      return out;
    }
    function renderFont(f) {
      const children = [];
      if (f.bold !== void 0)
        children.push(elFlag("b", f.bold) || xml.el("b", { val: "0" }));
      if (f.italic !== void 0)
        children.push(elFlag("i", f.italic) || xml.el("i", { val: "0" }));
      if (f.strike !== void 0)
        children.push(elFlag("strike", f.strike) || xml.el("strike", { val: "0" }));
      if (f.underline)
        children.push(xml.el("u", { val: f.underline }));
      if (f.vertAlign)
        children.push(xml.el("vertAlign", { val: f.vertAlign }));
      if (f.size != null)
        children.push(xml.el("sz", { val: String(f.size) }));
      if (f.color)
        children.push(renderColor("color", f.color));
      if (f.name != null)
        children.push(xml.el("name", { val: f.name }));
      if (f.family != null)
        children.push(xml.el("family", { val: String(f.family) }));
      if (f.charset != null)
        children.push(xml.el("charset", { val: String(f.charset) }));
      if (f.scheme)
        children.push(xml.el("scheme", { val: f.scheme }));
      if (f._extras)
        for (const ex of f._extras)
          children.push(ex);
      return xml.el("font", {}, children.filter(Boolean));
    }
    function parseFill(fEl) {
      const patt = xml.findChild(fEl, "patternFill");
      if (patt) {
        const out = { patternType: patt.attrs.patternType || "none" }, fg = xml.findChild(patt, "fgColor"), bg = xml.findChild(patt, "bgColor");
        if (fg)
          out.fgColor = parseColor(fg);
        if (bg)
          out.bgColor = parseColor(bg);
        return out;
      }
      const grad = xml.findChild(fEl, "gradientFill");
      if (grad)
        return { gradient: grad };
      return { patternType: "none" };
    }
    function renderFill(f) {
      if (f.gradient)
        return xml.el("fill", {}, [f.gradient]);
      const children = [];
      if (f.fgColor)
        children.push(renderColor("fgColor", f.fgColor));
      if (f.bgColor)
        children.push(renderColor("bgColor", f.bgColor));
      const patt = xml.el("patternFill", { patternType: f.patternType || "none" }, children);
      return xml.el("fill", {}, [patt]);
    }
    const SIDE_TAGS = [
      "left",
      "right",
      "top",
      "bottom",
      "diagonal",
      "vertical",
      "horizontal"
    ];
    function parseSide(sEl) {
      if (!sEl)
        return;
      const out = {};
      if (sEl.attrs.style)
        out.style = sEl.attrs.style;
      const color = xml.findChild(sEl, "color");
      if (color)
        out.color = parseColor(color);
      return out;
    }
    function renderSide(name, side) {
      if (!side)
        return xml.el(name, {});
      const a = {};
      if (side.style)
        a.style = side.style;
      const children = [];
      if (side.color)
        children.push(renderColor("color", side.color));
      return xml.el(name, a, children);
    }
    function parseBorder(bEl) {
      const out = {};
      for (const tag of SIDE_TAGS) {
        const s = parseSide(xml.findChild(bEl, tag));
        if (s)
          out[tag] = s;
      }
      if (bEl.attrs.diagonalUp === "1")
        out.diagonalUp = !0;
      if (bEl.attrs.diagonalDown === "1")
        out.diagonalDown = !0;
      return out;
    }
    function renderBorder(b) {
      const a = {};
      if (b.diagonalUp)
        a.diagonalUp = "1";
      if (b.diagonalDown)
        a.diagonalDown = "1";
      const children = [];
      for (const tag of ["left", "right", "top", "bottom", "diagonal"])
        children.push(renderSide(tag, b[tag]));
      for (const tag of ["vertical", "horizontal"])
        if (b[tag])
          children.push(renderSide(tag, b[tag]));
      return xml.el("border", a, children);
    }
    function parseXf(el) {
      const out = {}, a = el.attrs;
      if (a.numFmtId != null)
        out.numFmtId = Number(a.numFmtId);
      if (a.fontId != null)
        out.fontId = Number(a.fontId);
      if (a.fillId != null)
        out.fillId = Number(a.fillId);
      if (a.borderId != null)
        out.borderId = Number(a.borderId);
      if (a.xfId != null)
        out.xfId = Number(a.xfId);
      const flags = [
        "applyNumberFormat",
        "applyFont",
        "applyFill",
        "applyBorder",
        "applyAlignment",
        "applyProtection"
      ];
      for (const f of flags)
        if (a[f] != null)
          out[f] = readBoolAttr(a[f]);
      const align = xml.findChild(el, "alignment");
      if (align) {
        const al = {};
        for (const k of ["horizontal", "vertical"])
          if (align.attrs[k])
            al[k] = align.attrs[k];
        if (align.attrs.wrapText)
          al.wrapText = readBoolAttr(align.attrs.wrapText);
        if (align.attrs.shrinkToFit)
          al.shrinkToFit = readBoolAttr(align.attrs.shrinkToFit);
        if (align.attrs.indent)
          al.indent = Number(align.attrs.indent);
        if (align.attrs.textRotation)
          al.textRotation = Number(align.attrs.textRotation);
        if (Object.keys(al).length)
          out.alignment = al;
      }
      return out;
    }
    function renderXf(xf) {
      const a = {};
      if (xf.numFmtId != null)
        a.numFmtId = String(xf.numFmtId);
      if (xf.fontId != null)
        a.fontId = String(xf.fontId);
      if (xf.fillId != null)
        a.fillId = String(xf.fillId);
      if (xf.borderId != null)
        a.borderId = String(xf.borderId);
      if (xf.xfId != null)
        a.xfId = String(xf.xfId);
      for (const f of [
        "applyNumberFormat",
        "applyFont",
        "applyFill",
        "applyBorder",
        "applyAlignment",
        "applyProtection"
      ])
        if (xf[f] != null)
          a[f] = writeBoolAttr(xf[f]);
      const children = [];
      if (xf.alignment) {
        const al = xf.alignment, at = {};
        if (al.horizontal)
          at.horizontal = al.horizontal;
        if (al.vertical)
          at.vertical = al.vertical;
        if (al.wrapText != null)
          at.wrapText = writeBoolAttr(al.wrapText);
        if (al.shrinkToFit != null)
          at.shrinkToFit = writeBoolAttr(al.shrinkToFit);
        if (al.indent != null)
          at.indent = String(al.indent);
        if (al.textRotation != null)
          at.textRotation = String(al.textRotation);
        children.push(xml.el("alignment", at));
      }
      return xml.el("xf", a, children);
    }
    function parseCellStyle(el) {
      const out = { name: el.attrs.name, xfId: Number(el.attrs.xfId) };
      if (el.attrs.builtinId != null)
        out.builtinId = Number(el.attrs.builtinId);
      return out;
    }
    function renderCellStyle(s) {
      const a = { name: s.name, xfId: String(s.xfId) };
      if (s.builtinId != null)
        a.builtinId = String(s.builtinId);
      return xml.el("cellStyle", a);
    }
    function parseDxf(el) {
      const out = {}, extras = [];
      for (const c of el.children) {
        if (c.type !== "element")
          continue;
        switch (c.name) {
          case "font":
            out.font = parseFont(c);
            break;
          case "fill":
            out.fill = parseFill(c);
            break;
          case "border":
            out.border = parseBorder(c);
            break;
          case "numFmt":
            out.numFmt = {
              id: Number(c.attrs.numFmtId),
              formatCode: c.attrs.formatCode
            };
            break;
          case "alignment": {
            const a = {};
            if (c.attrs.horizontal)
              a.horizontal = c.attrs.horizontal;
            if (c.attrs.vertical)
              a.vertical = c.attrs.vertical;
            if (c.attrs.wrapText)
              a.wrapText = readBoolAttr(c.attrs.wrapText);
            if (c.attrs.indent)
              a.indent = Number(c.attrs.indent);
            if (c.attrs.textRotation)
              a.textRotation = Number(c.attrs.textRotation);
            out.alignment = a;
            break;
          }
          default:
            extras.push(c);
        }
      }
      if (extras.length)
        out._extras = extras;
      return out;
    }
    function renderDxf(d) {
      const children = [];
      if (d.font)
        children.push(renderFont(d.font));
      if (d.numFmt)
        children.push(xml.el("numFmt", {
          numFmtId: String(d.numFmt.id),
          formatCode: d.numFmt.formatCode
        }));
      if (d.fill)
        children.push(renderFill(d.fill));
      if (d.alignment) {
        const a = {};
        if (d.alignment.horizontal)
          a.horizontal = d.alignment.horizontal;
        if (d.alignment.vertical)
          a.vertical = d.alignment.vertical;
        if (d.alignment.wrapText != null)
          a.wrapText = writeBoolAttr(d.alignment.wrapText);
        if (d.alignment.indent != null)
          a.indent = String(d.alignment.indent);
        if (d.alignment.textRotation != null)
          a.textRotation = String(d.alignment.textRotation);
        children.push(xml.el("alignment", a));
      }
      if (d.border)
        children.push(renderBorder(d.border));
      if (d._extras)
        for (const ex of d._extras)
          children.push(ex);
      return xml.el("dxf", {}, children);
    }
    function parse(input) {
      const text = typeof input === "string" ? input : decodeText(input), root = xml.parse(text);
      if (root.name !== "styleSheet")
        throw new ParseError("xlsx/styles-bad-root", `xlsx styles: expected <styleSheet>, got <${root.name}>`, { context: { elementName: root && root.name } });
      const out = {
        numFmts: [],
        fonts: [],
        fills: [],
        borders: [],
        cellStyleXfs: [],
        cellXfs: [],
        cellStyles: [],
        dxfs: []
      }, extras = [];
      for (const c of root.children) {
        if (c.type !== "element")
          continue;
        switch (c.name) {
          case "numFmts":
            out.numFmts = parseNumFmts(c);
            break;
          case "fonts":
            out.fonts = xml.findAll(c, "font").map(parseFont);
            break;
          case "fills":
            out.fills = xml.findAll(c, "fill").map(parseFill);
            break;
          case "borders":
            out.borders = xml.findAll(c, "border").map(parseBorder);
            break;
          case "cellStyleXfs":
            out.cellStyleXfs = xml.findAll(c, "xf").map(parseXf);
            break;
          case "cellXfs":
            out.cellXfs = xml.findAll(c, "xf").map(parseXf);
            break;
          case "cellStyles":
            out.cellStyles = xml.findAll(c, "cellStyle").map(parseCellStyle);
            break;
          case "dxfs":
            out.dxfs = xml.findAll(c, "dxf").map(parseDxf);
            break;
          case "tableStyles":
            out.tableStyles = c;
            break;
          default:
            extras.push(c);
        }
      }
      if (extras.length)
        out._extras = extras;
      return out;
    }
    function countWrap(name, items, renderer) {
      if (!items || !items.length)
        return null;
      return xml.el(name, { count: String(items.length) }, items.map(renderer));
    }
    function serialize(obj) {
      const children = [], numFmts = renderNumFmts(obj.numFmts);
      if (numFmts)
        children.push(numFmts);
      const fonts = countWrap("fonts", obj.fonts, renderFont);
      if (fonts)
        children.push(fonts);
      const fills = countWrap("fills", obj.fills, renderFill);
      if (fills)
        children.push(fills);
      const borders = countWrap("borders", obj.borders, renderBorder);
      if (borders)
        children.push(borders);
      const csxf = countWrap("cellStyleXfs", obj.cellStyleXfs, renderXf);
      if (csxf)
        children.push(csxf);
      const cxf = countWrap("cellXfs", obj.cellXfs, renderXf);
      if (cxf)
        children.push(cxf);
      const cs = countWrap("cellStyles", obj.cellStyles, renderCellStyle);
      if (cs)
        children.push(cs);
      const dxfs = countWrap("dxfs", obj.dxfs, renderDxf);
      if (dxfs)
        children.push(dxfs);
      if (obj.tableStyles)
        children.push(obj.tableStyles);
      if (obj._extras)
        for (const ex of obj._extras)
          children.push(ex);
      return xml.serialize(xml.el("styleSheet", { xmlns: SS_NS }, children));
    }
    function bytesOf(obj) {
      return encodeText(serialize(obj));
    }
    function defaults() {
      return {
        numFmts: [],
        fonts: [{ size: 11, name: "Calibri", family: 2, scheme: "minor" }],
        fills: [
          { patternType: "none" },
          { patternType: "gray125" }
        ],
        borders: [{ left: {}, right: {}, top: {}, bottom: {}, diagonal: {} }],
        cellStyleXfs: [{ numFmtId: 0, fontId: 0, fillId: 0, borderId: 0 }],
        cellXfs: [{ numFmtId: 0, fontId: 0, fillId: 0, borderId: 0, xfId: 0 }],
        cellStyles: [{ name: "Normal", xfId: 0, builtinId: 0 }],
        dxfs: []
      };
    }
    function withDxfs(stylesObj, dxfs) {
      stylesObj.dxfs = stylesObj.dxfs || [];
      const indices = [];
      for (const d of dxfs) {
        indices.push(stylesObj.dxfs.length);
        stylesObj.dxfs.push(d);
      }
      return indices;
    }
    function withCellXfs(xfs) {
      const styles = defaults(), indices = [];
      for (const xf of xfs) {
        indices.push(styles.cellXfs.length);
        styles.cellXfs.push(Object.assign({ xfId: 0 }, xf));
      }
      return { styles, indices };
    }
    return {
      parse,
      serialize,
      bytesOf,
      defaults,
      withCellXfs,
      withDxfs,
      parseFont,
      renderFont,
      parseFill,
      renderFill,
      parseBorder,
      renderBorder,
      parseXf,
      renderXf,
      parseDxf,
      renderDxf,
      parseColor,
      renderColor,
      REL_TYPE_STYLES,
      CT_STYLES
    };
  } });
    __register({ name: "xlsxTables", dependencies: ["ooxmlErrors","xml","ooxmlShared"], factory: function(errors, xml, shared) {
    const { ParseError } = errors, { NS, REL_TYPE, CT, readBoolAttr, writeBoolAttr, encodeText, decodeText } = shared, SS_NS = NS.SS, REL_TYPE_TABLE = REL_TYPE.TABLE, CT_TABLE = CT.TABLE;
    function parseColumn(cEl) {
      const out = {
        id: Number(cEl.attrs.id),
        name: cEl.attrs.name
      };
      if (cEl.attrs.totalsRowLabel)
        out.totalsRowLabel = cEl.attrs.totalsRowLabel;
      if (cEl.attrs.totalsRowFunction)
        out.totalsRowFunction = cEl.attrs.totalsRowFunction;
      const extras = cEl.children.filter((n) => n.type === "element");
      if (extras.length)
        out._extras = extras;
      return out;
    }
    function renderColumn(c) {
      const a = { id: String(c.id), name: c.name };
      if (c.totalsRowLabel)
        a.totalsRowLabel = c.totalsRowLabel;
      if (c.totalsRowFunction)
        a.totalsRowFunction = c.totalsRowFunction;
      return xml.el("tableColumn", a, c._extras || []);
    }
    function parseTableStyleInfo(el) {
      const out = {};
      if (el.attrs.name)
        out.name = el.attrs.name;
      for (const k of [
        "showFirstColumn",
        "showLastColumn",
        "showRowStripes",
        "showColumnStripes"
      ])
        if (el.attrs[k] != null)
          out[k] = readBoolAttr(el.attrs[k]);
      return out;
    }
    function renderTableStyleInfo(s) {
      const a = {};
      if (s.name)
        a.name = s.name;
      for (const k of [
        "showFirstColumn",
        "showLastColumn",
        "showRowStripes",
        "showColumnStripes"
      ])
        if (s[k] != null)
          a[k] = writeBoolAttr(s[k]);
      return xml.el("tableStyleInfo", a);
    }
    function parse(input) {
      const text = typeof input === "string" ? input : decodeText(input), root = xml.parse(text);
      if (root.name !== "table")
        throw new ParseError("xlsx/tables-bad-root", `xlsx tables: expected <table>, got <${root.name}>`, { context: { elementName: root && root.name } });
      const out = {
        id: Number(root.attrs.id),
        name: root.attrs.name,
        displayName: root.attrs.displayName,
        ref: root.attrs.ref,
        columns: []
      };
      if (root.attrs.headerRowCount != null)
        out.headerRowCount = Number(root.attrs.headerRowCount);
      if (root.attrs.totalsRowCount != null)
        out.totalsRowCount = Number(root.attrs.totalsRowCount);
      if (root.attrs.totalsRowShown != null)
        out.totalsRowShown = readBoolAttr(root.attrs.totalsRowShown);
      const af = xml.findChild(root, "autoFilter");
      if (af)
        out.autoFilter = { ref: af.attrs.ref };
      const cols = xml.findChild(root, "tableColumns");
      if (cols)
        for (const cEl of xml.findAll(cols, "tableColumn"))
          out.columns.push(parseColumn(cEl));
      const tsi = xml.findChild(root, "tableStyleInfo");
      if (tsi)
        out.tableStyleInfo = parseTableStyleInfo(tsi);
      return out;
    }
    function serialize(obj) {
      const a = {
        xmlns: SS_NS,
        id: String(obj.id),
        name: obj.name,
        displayName: obj.displayName,
        ref: obj.ref
      };
      if (obj.headerRowCount != null)
        a.headerRowCount = String(obj.headerRowCount);
      if (obj.totalsRowCount != null)
        a.totalsRowCount = String(obj.totalsRowCount);
      if (obj.totalsRowShown != null)
        a.totalsRowShown = writeBoolAttr(obj.totalsRowShown);
      const children = [];
      if (obj.autoFilter)
        children.push(xml.el("autoFilter", { ref: obj.autoFilter.ref }));
      children.push(xml.el("tableColumns", { count: String((obj.columns || []).length) }, (obj.columns || []).map(renderColumn)));
      if (obj.tableStyleInfo)
        children.push(renderTableStyleInfo(obj.tableStyleInfo));
      if (obj._extras)
        for (const ex of obj._extras)
          children.push(ex);
      return xml.serialize(xml.el("table", a, children));
    }
    function bytesOf(obj) {
      return encodeText(serialize(obj));
    }
    return {
      parse,
      serialize,
      bytesOf,
      REL_TYPE_TABLE,
      CT_TABLE
    };
  } });
    __register({ name: "xlsxConditionalFormatting", dependencies: ["xml","ooxmlShared"], factory: function(xml, shared) {
    const { readBoolAttr, writeBoolAttr } = shared, _xlsxColor = shared.createXlsxColorCodec(xml), parseColor = _xlsxColor.parseColor, renderColor = _xlsxColor.renderColor;
    function parseCfvo(el) {
      const out = { type: el.attrs.type };
      if (el.attrs.val != null)
        out.val = el.attrs.val;
      if (el.attrs.gte != null)
        out.gte = readBoolAttr(el.attrs.gte);
      return out;
    }
    function renderCfvo(c) {
      const a = { type: c.type };
      if (c.val != null)
        a.val = String(c.val);
      if (c.gte != null)
        a.gte = writeBoolAttr(c.gte);
      return xml.el("cfvo", a);
    }
    function parseColorScale(el) {
      return {
        cfvos: xml.findAll(el, "cfvo").map(parseCfvo),
        colors: xml.findAll(el, "color").map(parseColor)
      };
    }
    function renderColorScale(cs) {
      const children = [];
      for (const v of cs.cfvos || [])
        children.push(renderCfvo(v));
      for (const c of cs.colors || [])
        children.push(renderColor("color", c));
      return xml.el("colorScale", {}, children);
    }
    function parseDataBar(el) {
      const out = { cfvos: [] };
      for (const c of el.children) {
        if (c.type !== "element")
          continue;
        if (c.name === "cfvo")
          out.cfvos.push(parseCfvo(c));
        else if (c.name === "color")
          out.color = parseColor(c);
      }
      for (const k of ["minLength", "maxLength"])
        if (el.attrs[k] != null)
          out[k] = Number(el.attrs[k]);
      if (el.attrs.showValue != null)
        out.showValue = readBoolAttr(el.attrs.showValue);
      return out;
    }
    function renderDataBar(db) {
      const a = {};
      if (db.minLength != null)
        a.minLength = String(db.minLength);
      if (db.maxLength != null)
        a.maxLength = String(db.maxLength);
      if (db.showValue != null)
        a.showValue = writeBoolAttr(db.showValue);
      const children = [];
      for (const v of db.cfvos || [])
        children.push(renderCfvo(v));
      if (db.color)
        children.push(renderColor("color", db.color));
      return xml.el("dataBar", a, children);
    }
    function parseIconSet(el) {
      const out = {
        iconSet: el.attrs.iconSet || "3TrafficLights1",
        cfvos: xml.findAll(el, "cfvo").map(parseCfvo)
      };
      if (el.attrs.showValue != null)
        out.showValue = readBoolAttr(el.attrs.showValue);
      if (el.attrs.percent != null)
        out.percent = readBoolAttr(el.attrs.percent);
      if (el.attrs.reverse != null)
        out.reverse = readBoolAttr(el.attrs.reverse);
      return out;
    }
    function renderIconSet(is) {
      const a = { iconSet: is.iconSet || "3TrafficLights1" };
      if (is.showValue != null)
        a.showValue = writeBoolAttr(is.showValue);
      if (is.percent != null)
        a.percent = writeBoolAttr(is.percent);
      if (is.reverse != null)
        a.reverse = writeBoolAttr(is.reverse);
      return xml.el("iconSet", a, (is.cfvos || []).map(renderCfvo));
    }
    const RULE_FLAG_ATTRS = [
      "aboveAverage",
      "equalAverage",
      "bottom",
      "percent"
    ];
    function parseRule(el) {
      const a = el.attrs, out = { type: a.type, priority: Number(a.priority) };
      if (a.dxfId != null)
        out.dxfId = Number(a.dxfId);
      if (a.stopIfTrue != null)
        out.stopIfTrue = readBoolAttr(a.stopIfTrue);
      if (a.operator)
        out.operator = a.operator;
      if (a.text != null)
        out.text = a.text;
      if (a.rank != null)
        out.rank = Number(a.rank);
      if (a.stdDev != null)
        out.stdDev = Number(a.stdDev);
      if (a.timePeriod)
        out.timePeriod = a.timePeriod;
      for (const k of RULE_FLAG_ATTRS)
        if (a[k] != null)
          out[k] = readBoolAttr(a[k]);
      const formulas = [], extras = [];
      for (const c of el.children) {
        if (c.type !== "element")
          continue;
        switch (c.name) {
          case "formula":
            formulas.push(xml.textContent(c));
            break;
          case "colorScale":
            out.colorScale = parseColorScale(c);
            break;
          case "dataBar":
            out.dataBar = parseDataBar(c);
            break;
          case "iconSet":
            out.iconSet = parseIconSet(c);
            break;
          default:
            extras.push(c);
        }
      }
      if (formulas.length)
        out.formulas = formulas;
      if (extras.length)
        out._extras = extras;
      return out;
    }
    function renderRule(r) {
      const a = { type: r.type, priority: String(r.priority) };
      if (r.dxfId != null)
        a.dxfId = String(r.dxfId);
      if (r.stopIfTrue != null)
        a.stopIfTrue = writeBoolAttr(r.stopIfTrue);
      if (r.operator)
        a.operator = r.operator;
      if (r.text != null)
        a.text = r.text;
      if (r.rank != null)
        a.rank = String(r.rank);
      if (r.stdDev != null)
        a.stdDev = String(r.stdDev);
      if (r.timePeriod)
        a.timePeriod = r.timePeriod;
      for (const k of RULE_FLAG_ATTRS)
        if (r[k] != null)
          a[k] = writeBoolAttr(r[k]);
      const children = [];
      for (const f of r.formulas || [])
        children.push(xml.el("formula", {}, [xml.text(f)]));
      if (r.colorScale)
        children.push(renderColorScale(r.colorScale));
      if (r.dataBar)
        children.push(renderDataBar(r.dataBar));
      if (r.iconSet)
        children.push(renderIconSet(r.iconSet));
      if (r._extras)
        for (const ex of r._extras)
          children.push(ex);
      return xml.el("cfRule", a, children);
    }
    function parseBlock(el) {
      const out = {
        sqref: el.attrs.sqref,
        rules: xml.findAll(el, "cfRule").map(parseRule)
      }, extras = el.children.filter((n) => n.type === "element" && n.name !== "cfRule");
      if (extras.length)
        out._extras = extras;
      return out;
    }
    function renderBlock(b) {
      const a = { sqref: b.sqref }, children = (b.rules || []).map(renderRule);
      if (b._extras)
        for (const ex of b._extras)
          children.push(ex);
      return xml.el("conditionalFormatting", a, children);
    }
    return {
      parseBlock,
      renderBlock,
      parseRule,
      renderRule,
      parseCfvo,
      renderCfvo,
      parseColorScale,
      renderColorScale,
      parseDataBar,
      renderDataBar,
      parseIconSet,
      renderIconSet,
      parseColor,
      renderColor
    };
  } });
    __register({ name: "xlsxComments", dependencies: ["ooxmlErrors","xml","ooxmlShared"], factory: function(errors, xml, shared) {
    const { ParseError } = errors, { NS, REL_TYPE, CT, readBoolAttr, encodeText, decodeText } = shared, SS_NS = NS.SS, REL_TYPE_COMMENTS = REL_TYPE.COMMENTS, REL_TYPE_VML_DRAWING = REL_TYPE.VML_DRAWING, CT_COMMENTS = CT.COMMENTS_X, CT_VML_DRAWING = CT.VML_DRAWING;
    function parseRPr(el) {
      if (!el)
        return;
      const out = {};
      for (const c of el.children) {
        if (c.type !== "element")
          continue;
        switch (c.name) {
          case "sz":
            out.size = Number(c.attrs.val);
            break;
          case "rFont":
            out.font = c.attrs.val;
            break;
          case "family":
            out.family = Number(c.attrs.val);
            break;
          case "color": {
            const cl = {};
            if (c.attrs.rgb)
              cl.rgb = c.attrs.rgb;
            if (c.attrs.theme)
              cl.theme = Number(c.attrs.theme);
            if (c.attrs.tint)
              cl.tint = Number(c.attrs.tint);
            if (c.attrs.indexed)
              cl.indexed = Number(c.attrs.indexed);
            out.color = cl;
            break;
          }
          case "b":
            out.bold = readBoolAttr(c.attrs.val) !== !1;
            break;
          case "i":
            out.italic = readBoolAttr(c.attrs.val) !== !1;
            break;
          case "strike":
            out.strike = readBoolAttr(c.attrs.val) !== !1;
            break;
          case "u":
            out.underline = c.attrs.val || "single";
            break;
          case "scheme":
            out.scheme = c.attrs.val;
            break;
          case "charset":
            out.charset = Number(c.attrs.val);
            break;
        }
      }
      return out;
    }
    function renderRPr(rPr) {
      if (!rPr)
        return null;
      const children = [];
      if (rPr.bold)
        children.push(xml.el("b", {}));
      if (rPr.italic)
        children.push(xml.el("i", {}));
      if (rPr.strike)
        children.push(xml.el("strike", {}));
      if (rPr.underline)
        children.push(xml.el("u", { val: rPr.underline }));
      if (rPr.size != null)
        children.push(xml.el("sz", { val: String(rPr.size) }));
      if (rPr.color) {
        const a = {};
        if (rPr.color.rgb != null)
          a.rgb = rPr.color.rgb;
        if (rPr.color.theme != null)
          a.theme = String(rPr.color.theme);
        if (rPr.color.tint != null)
          a.tint = String(rPr.color.tint);
        if (rPr.color.indexed != null)
          a.indexed = String(rPr.color.indexed);
        children.push(xml.el("color", a));
      }
      if (rPr.font != null)
        children.push(xml.el("rFont", { val: rPr.font }));
      if (rPr.family != null)
        children.push(xml.el("family", { val: String(rPr.family) }));
      if (rPr.charset != null)
        children.push(xml.el("charset", { val: String(rPr.charset) }));
      if (rPr.scheme)
        children.push(xml.el("scheme", { val: rPr.scheme }));
      if (!children.length)
        return null;
      return xml.el("rPr", {}, children);
    }
    function parseText(textEl) {
      const runs = [];
      for (const c of textEl.children) {
        if (c.type !== "element")
          continue;
        if (c.name === "t")
          runs.push({ text: xml.textContent(c) });
        else if (c.name === "r") {
          const rPrEl = xml.findChild(c, "rPr"), tEl = xml.findChild(c, "t"), run = { text: tEl ? xml.textContent(tEl) : "" }, rPr = parseRPr(rPrEl);
          if (rPr && Object.keys(rPr).length)
            run.rPr = rPr;
          runs.push(run);
        }
      }
      return runs;
    }
    function renderText(richText) {
      const children = (richText || []).map((run) => {
        if (!run.rPr)
          return xml.el("r", {}, [
            xml.el("t", { "xml:space": "preserve" }, [xml.text(run.text || "")])
          ]);
        const inner = [], rPrEl = renderRPr(run.rPr);
        if (rPrEl)
          inner.push(rPrEl);
        inner.push(xml.el("t", { "xml:space": "preserve" }, [xml.text(run.text || "")]));
        return xml.el("r", {}, inner);
      });
      return xml.el("text", {}, children);
    }
    function parse(input) {
      const text = typeof input === "string" ? input : decodeText(input), root = xml.parse(text);
      if (root.name !== "comments")
        throw new ParseError("xlsx/comments-bad-root", `xlsx comments: expected <comments>, got <${root.name}>`, { context: { elementName: root && root.name } });
      const authors = [], authorsEl = xml.findChild(root, "authors");
      if (authorsEl)
        for (const a of xml.findAll(authorsEl, "author"))
          authors.push(xml.textContent(a));
      const comments = [], listEl = xml.findChild(root, "commentList");
      if (listEl)
        for (const cEl of xml.findAll(listEl, "comment")) {
          const authorId = cEl.attrs.authorId != null ? Number(cEl.attrs.authorId) : 0, out = {
            ref: cEl.attrs.ref,
            authorId,
            author: authors[authorId] || ""
          };
          if (cEl.attrs.shapeId != null)
            out.shapeId = Number(cEl.attrs.shapeId);
          const tEl = xml.findChild(cEl, "text");
          if (tEl)
            out.richText = parseText(tEl);
          comments.push(out);
        }
      return { authors, comments };
    }
    function serialize(obj) {
      const authors = (obj.authors || []).slice(), authorIndex = new Map;
      authors.forEach((a, i) => authorIndex.set(a, i));
      function internAuthor(name) {
        if (!authorIndex.has(name)) {
          authorIndex.set(name, authors.length);
          authors.push(name);
        }
        return authorIndex.get(name);
      }
      const commentEls = (obj.comments || []).map((c, i) => {
        let authorId = c.authorId;
        if (authorId == null)
          authorId = c.author != null ? internAuthor(c.author) : 0;
        const a = {
          ref: c.ref,
          authorId: String(authorId)
        };
        if (c.shapeId != null)
          a.shapeId = String(c.shapeId);
        else
          a.shapeId = String(1024 + i);
        const richText = c.richText || (c.text != null ? [{ text: c.text }] : []);
        return xml.el("comment", a, [renderText(richText)]);
      }), children = [];
      children.push(xml.el("authors", {}, authors.map((name) => xml.el("author", {}, [xml.text(name)]))));
      children.push(xml.el("commentList", {}, commentEls));
      return xml.serialize(xml.el("comments", { xmlns: SS_NS }, children));
    }
    function bytesOf(obj) {
      return encodeText(serialize(obj));
    }
    const VML_NS_V = "urn:schemas-microsoft-com:vml", VML_NS_O = "urn:schemas-microsoft-com:office:office", VML_NS_X = "urn:schemas-microsoft-com:office:excel";
    function vmlForComments(cellRefs) {
      const shapes = cellRefs.map((cell, i) => {
        const id = `_x0000_s${1025 + i}`, anchor = [
          cell.col + 1,
          15,
          cell.row,
          10,
          cell.col + 3,
          15,
          cell.row + 4,
          4
        ].join(", ");
        return [
          `<v:shape id="${id}" type="#_x0000_t202"`,
          ' style="position:absolute;margin-left:60pt;margin-top:1.5pt;',
          `width:108pt;height:60pt;z-index:${i + 1};visibility:hidden"`,
          ' fillcolor="#ffffe1" o:insetmode="auto">',
          '<v:fill color2="#ffffe1"/>',
          '<v:shadow on="t" color="black" obscured="t"/>',
          '<v:path o:connecttype="none"/>',
          '<v:textbox style="mso-direction-alt:auto"><div style="text-align:left"/></v:textbox>',
          '<x:ClientData ObjectType="Note">',
          "<x:MoveWithCells/>",
          "<x:SizeWithCells/>",
          `<x:Anchor>${anchor}</x:Anchor>`,
          "<x:AutoFill>False</x:AutoFill>",
          `<x:Row>${cell.row}</x:Row>`,
          `<x:Column>${cell.col}</x:Column>`,
          "</x:ClientData>",
          "</v:shape>"
        ].join("");
      }).join("");
      return `<xml xmlns:v="${VML_NS_V}" xmlns:o="${VML_NS_O}" xmlns:x="${VML_NS_X}"><o:shapelayout v:ext="edit"><o:idmap v:ext="edit" data="1"/></o:shapelayout><v:shapetype id="_x0000_t202" coordsize="21600,21600" o:spt="202" path="m,l,21600r21600,l21600,xe"><v:stroke joinstyle="miter"/><v:path gradientshapeok="t" o:connecttype="rect"/></v:shapetype>` + shapes + "</xml>";
    }
    function vmlBytes(cellRefs) {
      return encodeText(vmlForComments(cellRefs));
    }
    return {
      parse,
      serialize,
      bytesOf,
      renderText,
      parseText,
      renderRPr,
      parseRPr,
      vmlForComments,
      vmlBytes,
      REL_TYPE_COMMENTS,
      REL_TYPE_VML_DRAWING,
      CT_COMMENTS,
      CT_VML_DRAWING
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
    __register({ name: "xlsxDrawings", dependencies: ["ooxmlErrors","xml","drawingmlShape","drawingml","ooxmlShared"], factory: function(errors, xml, shapeMod, dml, shared) {
    const { ParseError } = errors, { NS, REL_TYPE, CT, encodeText, decodeText } = shared, XDR_NS = NS.XDR, A_NS = NS.A, R_NS = NS.R, REL_TYPE_DRAWING = REL_TYPE.DRAWING, CT_DRAWING = CT.DRAWING, CHART_URI = NS.C;
    function parseCellPos(el) {
      return {
        col: Number(xml.textContent(xml.findChild(el, "xdr:col") || el) || 0),
        colOff: Number(xml.textContent(xml.findChild(el, "xdr:colOff") || el) || 0),
        row: Number(xml.textContent(xml.findChild(el, "xdr:row") || el) || 0),
        rowOff: Number(xml.textContent(xml.findChild(el, "xdr:rowOff") || el) || 0)
      };
    }
    function renderCellPos(name, pos) {
      return xml.el(name, {}, [
        xml.el("xdr:col", {}, [xml.text(String(pos.col || 0))]),
        xml.el("xdr:colOff", {}, [xml.text(String(pos.colOff || 0))]),
        xml.el("xdr:row", {}, [xml.text(String(pos.row || 0))]),
        xml.el("xdr:rowOff", {}, [xml.text(String(pos.rowOff || 0))])
      ]);
    }
    function parseExt(el) {
      return { cx: Number(el.attrs.cx || 0), cy: Number(el.attrs.cy || 0) };
    }
    function renderExt(name, ext) {
      return xml.el(name, {
        cx: String(ext.cx || 0),
        cy: String(ext.cy || 0)
      });
    }
    function parseAnchor(el) {
      const out = { kind: el.name === "xdr:twoCellAnchor" ? "twoCell" : el.name === "xdr:oneCellAnchor" ? "oneCell" : el.name === "xdr:absoluteAnchor" ? "absolute" : "unknown" };
      if (el.attrs.editAs)
        out.editAs = el.attrs.editAs;
      const from = xml.findChild(el, "xdr:from");
      if (from)
        out.from = parseCellPos(from);
      const to = xml.findChild(el, "xdr:to");
      if (to)
        out.to = parseCellPos(to);
      const ext = xml.findChild(el, "xdr:ext");
      if (ext)
        out.ext = parseExt(ext);
      const pos = xml.findChild(el, "xdr:pos");
      if (pos)
        out.pos = { x: Number(pos.attrs.x || 0), y: Number(pos.attrs.y || 0) };
      return out;
    }
    function renderAnchor(anchor, content) {
      const tag = {
        twoCell: "xdr:twoCellAnchor",
        oneCell: "xdr:oneCellAnchor",
        absolute: "xdr:absoluteAnchor"
      }[anchor.kind] || "xdr:twoCellAnchor", a = {};
      if (anchor.editAs)
        a.editAs = anchor.editAs;
      const children = [];
      if (anchor.kind === "absolute") {
        children.push(xml.el("xdr:pos", {
          x: String(anchor.pos ? anchor.pos.x : 0),
          y: String(anchor.pos ? anchor.pos.y : 0)
        }));
        children.push(renderExt("xdr:ext", anchor.ext || { cx: 0, cy: 0 }));
      } else {
        children.push(renderCellPos("xdr:from", anchor.from || {}));
        if (anchor.kind === "twoCell")
          children.push(renderCellPos("xdr:to", anchor.to || anchor.from || {}));
        else
          children.push(renderExt("xdr:ext", anchor.ext || { cx: 0, cy: 0 }));
      }
      children.push(content);
      children.push(xml.el("xdr:clientData", {}));
      return xml.el(tag, a, children);
    }
    function parseGraphicFrame(gfEl) {
      const out = { type: "graphicFrame" }, nv = xml.findChild(gfEl, "xdr:nvGraphicFramePr");
      if (nv) {
        const cNvPr = xml.findChild(nv, "xdr:cNvPr");
        if (cNvPr) {
          if (cNvPr.attrs.id != null)
            out.graphicFrameId = Number(cNvPr.attrs.id);
          if (cNvPr.attrs.name)
            out.graphicFrameName = cNvPr.attrs.name;
        }
      }
      const xfrm = xml.findChild(gfEl, "xdr:xfrm");
      if (xfrm) {
        const off = xml.findChild(xfrm, "a:off"), ext = xml.findChild(xfrm, "a:ext");
        if (off) {
          out.offsetX = Number(off.attrs.x || 0);
          out.offsetY = Number(off.attrs.y || 0);
        }
        if (ext) {
          out.cx = Number(ext.attrs.cx || 0);
          out.cy = Number(ext.attrs.cy || 0);
        }
      }
      const graphic = xml.findChild(gfEl, "a:graphic");
      if (graphic) {
        const gd = xml.findChild(graphic, "a:graphicData");
        if (gd && gd.attrs.uri === CHART_URI) {
          const chartEl = xml.findChild(gd, "c:chart");
          if (chartEl && chartEl.attrs["r:id"]) {
            out.type = "chart";
            out.chartRef = chartEl.attrs["r:id"];
          }
        }
      }
      return out;
    }
    function renderGraphicFrame(entry) {
      const cNvPrAttrs = {
        id: String(entry.graphicFrameId != null ? entry.graphicFrameId : 2),
        name: entry.graphicFrameName || "Chart"
      }, graphicChildren = [];
      if (entry.type === "chart" && entry.chartRef)
        graphicChildren.push(xml.el("a:graphicData", { uri: CHART_URI }, [
          xml.el("c:chart", {
            "xmlns:c": "http://schemas.openxmlformats.org/drawingml/2006/chart",
            "xmlns:r": R_NS,
            "r:id": entry.chartRef
          })
        ]));
      else
        graphicChildren.push(xml.el("a:graphicData", { uri: "" }));
      return xml.el("xdr:graphicFrame", { macro: "" }, [
        xml.el("xdr:nvGraphicFramePr", {}, [
          xml.el("xdr:cNvPr", cNvPrAttrs),
          xml.el("xdr:cNvGraphicFramePr", {})
        ]),
        xml.el("xdr:xfrm", {}, [
          xml.el("a:off", {
            x: String(entry.offsetX || 0),
            y: String(entry.offsetY || 0)
          }),
          xml.el("a:ext", {
            cx: String(entry.cx || 0),
            cy: String(entry.cy || 0)
          })
        ]),
        xml.el("a:graphic", {}, graphicChildren)
      ]);
    }
    function parsePic(picEl) {
      const out = { type: "picture" }, nv = xml.findChild(picEl, "xdr:nvPicPr");
      if (nv) {
        const cNvPr = xml.findChild(nv, "xdr:cNvPr");
        if (cNvPr) {
          if (cNvPr.attrs.id != null)
            out.picId = Number(cNvPr.attrs.id);
          if (cNvPr.attrs.name)
            out.picName = cNvPr.attrs.name;
          if (cNvPr.attrs.descr)
            out.description = cNvPr.attrs.descr;
          if (cNvPr.attrs.title)
            out.title = cNvPr.attrs.title;
        }
      }
      const blipFill = xml.findChild(picEl, "xdr:blipFill");
      if (blipFill) {
        const blip = xml.findChild(blipFill, "a:blip");
        if (blip && blip.attrs["r:embed"])
          out.embedRef = blip.attrs["r:embed"];
      }
      const spPr = xml.findChild(picEl, "xdr:spPr");
      if (spPr) {
        const xfrm = xml.findChild(spPr, "a:xfrm");
        if (xfrm) {
          const off = xml.findChild(xfrm, "a:off"), ext = xml.findChild(xfrm, "a:ext");
          if (off) {
            out.offsetX = Number(off.attrs.x || 0);
            out.offsetY = Number(off.attrs.y || 0);
          }
          if (ext) {
            out.cx = Number(ext.attrs.cx || 0);
            out.cy = Number(ext.attrs.cy || 0);
          }
        }
        const prst = xml.findChild(spPr, "a:prstGeom");
        if (prst && prst.attrs.prst)
          out.prstGeom = prst.attrs.prst;
      }
      return out;
    }
    function renderPic(entry) {
      const cNvPrAttrs = {
        id: String(entry.picId != null ? entry.picId : 2),
        name: entry.picName || "Picture"
      };
      if (entry.description)
        cNvPrAttrs.descr = entry.description;
      if (entry.title)
        cNvPrAttrs.title = entry.title;
      return xml.el("xdr:pic", {}, [
        xml.el("xdr:nvPicPr", {}, [
          xml.el("xdr:cNvPr", cNvPrAttrs),
          xml.el("xdr:cNvPicPr", {}, [
            xml.el("a:picLocks", { noChangeAspect: "1" })
          ])
        ]),
        xml.el("xdr:blipFill", {}, [
          xml.el("a:blip", entry.embedRef ? { "r:embed": entry.embedRef } : {}),
          xml.el("a:stretch", {}, [xml.el("a:fillRect", {})])
        ]),
        xml.el("xdr:spPr", {}, [
          xml.el("a:xfrm", {}, [
            xml.el("a:off", {
              x: String(entry.offsetX || 0),
              y: String(entry.offsetY || 0)
            }),
            xml.el("a:ext", {
              cx: String(entry.cx || 0),
              cy: String(entry.cy || 0)
            })
          ]),
          xml.el("a:prstGeom", { prst: entry.prstGeom || "rect" }, [
            xml.el("a:avLst", {})
          ])
        ])
      ]);
    }
    function parseSp(spEl) {
      const out = { type: "shape" }, nvSpPr = xml.findChild(spEl, "xdr:nvSpPr");
      if (nvSpPr) {
        const cNvPr = xml.findChild(nvSpPr, "xdr:cNvPr");
        if (cNvPr) {
          if (cNvPr.attrs.id != null)
            out.id = Number(cNvPr.attrs.id);
          if (cNvPr.attrs.name)
            out.name = cNvPr.attrs.name;
          if (cNvPr.attrs.descr)
            out.description = cNvPr.attrs.descr;
        }
      }
      const spPr = xml.findChild(spEl, "xdr:spPr");
      if (spPr) {
        const typed = shapeMod.parseShapeProperties(spPr);
        if (typed)
          out.shapeProps = typed;
      }
      const txBody = xml.findChild(spEl, "xdr:txBody");
      if (txBody)
        out.txBody = dml.parseTextBody(txBody);
      return out;
    }
    function renderSp(entry) {
      const cNvPrAttrs = {
        id: String(entry.id != null ? entry.id : 2),
        name: entry.name || "Shape"
      };
      if (entry.description)
        cNvPrAttrs.descr = entry.description;
      const children = [
        xml.el("xdr:nvSpPr", {}, [
          xml.el("xdr:cNvPr", cNvPrAttrs),
          xml.el("xdr:cNvSpPr", {})
        ])
      ];
      if (entry.shapeProps)
        children.push(shapeMod.renderShapeProperties(entry.shapeProps, "xdr:spPr"));
      else
        children.push(xml.el("xdr:spPr", {}));
      if (entry.txBody)
        children.push(dml.renderTextBody(entry.txBody, "xdr:txBody"));
      return xml.el("xdr:sp", { macro: "", textlink: "" }, children);
    }
    function parseEntry(anchorEl) {
      const anchor = parseAnchor(anchorEl);
      for (const c of anchorEl.children) {
        if (c.type !== "element")
          continue;
        if (c.name === "xdr:graphicFrame")
          return Object.assign(parseGraphicFrame(c), { anchor });
        if (c.name === "xdr:pic")
          return Object.assign(parsePic(c), { anchor });
        if (c.name === "xdr:sp")
          return Object.assign(parseSp(c), { anchor });
        if (c.name === "xdr:cxnSp" || c.name === "xdr:grpSp")
          return { type: "shape", anchor, _node: c };
      }
      return { type: "graphicFrame", anchor };
    }
    function renderEntry(entry) {
      let content;
      if (entry.type === "chart" || entry.type === "graphicFrame")
        content = renderGraphicFrame(entry);
      else if (entry.type === "picture")
        content = renderPic(entry);
      else if (entry.type === "shape")
        content = entry._node ? entry._node : renderSp(entry);
      else if (entry._node)
        content = entry._node;
      else
        content = renderGraphicFrame(entry);
      return renderAnchor(entry.anchor || { kind: "twoCell" }, content);
    }
    function parse(input) {
      const text = typeof input === "string" ? input : decodeText(input), root = xml.parse(text);
      if (root.name !== "xdr:wsDr")
        throw new ParseError("xlsx/drawings-bad-root", `xlsx drawings: expected <xdr:wsDr>, got <${root.name}>`, { context: { elementName: root && root.name } });
      const entries = [], extras = [];
      for (const c of root.children) {
        if (c.type !== "element")
          continue;
        if (c.name === "xdr:twoCellAnchor" || c.name === "xdr:oneCellAnchor" || c.name === "xdr:absoluteAnchor")
          entries.push(parseEntry(c));
        else
          extras.push(c);
      }
      const out = { entries };
      if (extras.length)
        out._extras = extras;
      return out;
    }
    function serialize(obj) {
      const children = (obj.entries || []).map(renderEntry);
      if (obj._extras)
        for (const ex of obj._extras)
          children.push(ex);
      return xml.serialize(xml.el("xdr:wsDr", { "xmlns:xdr": XDR_NS, "xmlns:a": A_NS, "xmlns:r": R_NS }, children));
    }
    function bytesOf(obj) {
      return encodeText(serialize(obj));
    }
    function twoCell(from, to) {
      return {
        kind: "twoCell",
        editAs: "oneCell",
        from: {
          col: from.col,
          colOff: from.colOff || 0,
          row: from.row,
          rowOff: from.rowOff || 0
        },
        to: {
          col: to.col,
          colOff: to.colOff || 0,
          row: to.row,
          rowOff: to.rowOff || 0
        }
      };
    }
    function oneCell(from, ext) {
      return {
        kind: "oneCell",
        from: {
          col: from.col,
          colOff: from.colOff || 0,
          row: from.row,
          rowOff: from.rowOff || 0
        },
        ext: { cx: ext.cx, cy: ext.cy }
      };
    }
    return {
      parse,
      serialize,
      bytesOf,
      parseAnchor,
      renderAnchor,
      parseGraphicFrame,
      renderGraphicFrame,
      parsePic,
      renderPic,
      twoCell,
      oneCell,
      REL_TYPE_DRAWING,
      CT_DRAWING,
      CHART_URI,
      XDR_NS,
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
    __register({ name: "xlsxThreadedComments", dependencies: ["ooxmlErrors","xml","ooxmlShared"], factory: function(errors, xml, shared) {
    const { ParseError, RenderError } = errors, { NS, REL_TYPE, readBoolAttr, writeBoolAttr, encodeText, decodeText } = shared, TC_NS = NS.TC, REL_TYPE_THREADED_COMMENT = REL_TYPE.THREADED_COMMENT, REL_TYPE_PERSON = REL_TYPE.PERSON;
    function parseThreadedComments(input) {
      const text = typeof input === "string" ? input : decodeText(input), root = xml.parse(text);
      if (root.name !== "ThreadedComments" && root.name !== "threadedComments")
        throw new ParseError("xlsx/threaded-comments-bad-root", `xlsx threadedComments: expected <ThreadedComments>, got <${root.name}>`, { context: { elementName: root && root.name } });
      const out = [];
      for (const c of root.children) {
        if (c.type !== "element")
          continue;
        if (c.name !== "threadedComment")
          continue;
        const entry = {
          id: c.attrs.id,
          ref: c.attrs.ref,
          date: c.attrs.dT,
          personId: c.attrs.personId
        };
        if (c.attrs.parentId)
          entry.parentId = c.attrs.parentId;
        if (c.attrs.done != null)
          entry.done = readBoolAttr(c.attrs.done);
        const tEl = xml.findChild(c, "text");
        if (tEl)
          entry.text = xml.textContent(tEl);
        const mentionsEl = xml.findChild(c, "mentions");
        if (mentionsEl) {
          entry.mentions = [];
          for (const mEl of xml.findAll(mentionsEl, "mention"))
            entry.mentions.push({
              mentionpersonId: mEl.attrs.mentionpersonId,
              mentionId: mEl.attrs.mentionId,
              startIndex: Number(mEl.attrs.startIndex || 0),
              length: Number(mEl.attrs.length || 0)
            });
        }
        out.push(entry);
      }
      return out;
    }
    function serializeThreadedComments(entries) {
      const items = (entries || []).map((c) => {
        const a = {
          ref: c.ref,
          dT: c.date,
          personId: c.personId,
          id: c.id
        };
        if (c.parentId)
          a.parentId = c.parentId;
        if (c.done != null)
          a.done = writeBoolAttr(c.done);
        const inner = [];
        inner.push(xml.el("text", {}, [xml.text(c.text || "")]));
        if (c.mentions && c.mentions.length)
          inner.push(xml.el("mentions", {}, c.mentions.map((m) => xml.el("mention", {
            mentionpersonId: m.mentionpersonId,
            mentionId: String(m.mentionId),
            startIndex: String(m.startIndex || 0),
            length: String(m.length || 0)
          }))));
        return xml.el("threadedComment", a, inner);
      });
      return xml.serialize(xml.el("ThreadedComments", { xmlns: TC_NS }, items));
    }
    function threadedCommentsBytes(entries) {
      return encodeText(serializeThreadedComments(entries));
    }
    function parsePersons(input) {
      const text = typeof input === "string" ? input : decodeText(input), root = xml.parse(text);
      if (root.name !== "personList" && root.name !== "PersonList")
        throw new ParseError("xlsx/persons-bad-root", `xlsx persons: expected <personList>, got <${root.name}>`, { context: { elementName: root && root.name } });
      const out = [];
      for (const p of xml.findAll(root, "person")) {
        const entry = {
          id: p.attrs.id,
          displayName: p.attrs.displayName
        };
        if (p.attrs.userId)
          entry.userId = p.attrs.userId;
        if (p.attrs.providerId)
          entry.providerId = p.attrs.providerId;
        out.push(entry);
      }
      return out;
    }
    function serializePersons(persons) {
      const items = (persons || []).map((p) => {
        const a = { displayName: p.displayName, id: p.id };
        if (p.userId)
          a.userId = p.userId;
        if (p.providerId)
          a.providerId = p.providerId;
        else
          a.providerId = "None";
        return xml.el("person", a);
      });
      return xml.serialize(xml.el("personList", { xmlns: TC_NS }, items));
    }
    function personsBytes(persons) {
      return encodeText(serializePersons(persons));
    }
    function generateId() {
      const c = globalThis.crypto;
      if (!c || typeof c.getRandomValues !== "function")
        throw new RenderError("xlsx/no-random-source", "xlsx: no cryptographic random source (crypto.getRandomValues is unavailable); pass the comment / person id explicitly");
      const b = new Uint8Array(16);
      c.getRandomValues(b);
      b[6] = b[6] & 15 | 64;
      b[8] = b[8] & 63 | 128;
      const hex = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
      return `{${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}}`;
    }
    return {
      parseThreadedComments,
      serializeThreadedComments,
      threadedCommentsBytes,
      parsePersons,
      serializePersons,
      personsBytes,
      generateId,
      TC_NS,
      REL_TYPE_THREADED_COMMENT,
      REL_TYPE_PERSON,
      CT_THREADED_COMMENTS: "application/vnd.ms-excel.threadedcomments+xml",
      CT_PERSONS: "application/vnd.ms-excel.person+xml"
    };
  } });
    __register({ name: "xlsxWalker", dependencies: [], factory: function() {
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
      function applyExtensions(workbook, phase) {
        if (!_exts.length || !workbook)
          return workbook;
        const sName = phase === "hydrate" ? "hydrateSettings" : "dehydrateSettings", wbName = phase === "hydrate" ? "hydrateWorkbook" : "dehydrateWorkbook", shName = phase === "hydrate" ? "hydrateSheet" : "dehydrateSheet", wb2 = applyHook(wbName, workbook);
        if (wb2 && wb2 !== workbook)
          Object.assign(workbook, wb2);
        applyHook(sName, workbook);
        for (const sheet of workbook.sheets || [])
          applyHook(shName, sheet);
        return workbook;
      }
      return {
        use,
        applyHydrate(workbook) {
          applyExtensions(workbook, "hydrate");
        },
        applyDehydrate(workbook) {
          applyExtensions(workbook, "dehydrate");
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
    __register({ name: "xlsx", dependencies: ["ooxmlErrors","opcPackage","xml","opcRelationships","xlsxStyles","xlsxTables","xlsxConditionalFormatting","xlsxComments","markupCompatibility","xlsxDrawings","drawingmlChart","xlsxThreadedComments","xlsxWalker","ooxmlShared"], factory: function(errors, opc, xml, relsMod, stylesMod, tablesMod, cfMod, commentsMod, mc, drawingsMod, chartMod, tcMod, walkerMod, shared) {
    const { ParseError, ContractError } = errors, {
      NS,
      REL_TYPE,
      CT,
      readBoolAttr,
      writeBoolAttr,
      encodeText,
      decodeText,
      createRidAllocator,
      trackUnmodelledParts
    } = shared, SS_NS = NS.SS, RELS_NS = NS.R, REL_TYPE_DOC = REL_TYPE.DOC, REL_TYPE_SHEET = REL_TYPE.SHEET, REL_TYPE_SHARED_STRINGS = REL_TYPE.SHARED_STRINGS, REL_TYPE_HYPERLINK = REL_TYPE.HYPERLINK, CT_WORKBOOK = CT.WORKBOOK, CT_SHEET = CT.SHEET, CT_SHARED_STRINGS = CT.SHARED_STRINGS, ROW_TAG_RE = /<row[\s>/]/g, CELL_TAG_RE = /<c[\s>/]/g;
    function colName(idx) {
      let s = "", n = idx + 1;
      while (n > 0) {
        const r = (n - 1) % 26;
        s = String.fromCharCode(65 + r) + s;
        n = (n - 1) / 26 | 0;
      }
      return s;
    }
    function colIndex(name) {
      let n = 0;
      for (let i = 0;i < name.length; i++) {
        const c = name.charCodeAt(i);
        if (c < 65 || c > 90)
          break;
        n = n * 26 + (c - 64);
      }
      return n - 1;
    }
    function cellRef(rowIdx, colIdx) {
      return colName(colIdx) + (rowIdx + 1);
    }
    function parseRef(ref) {
      const m = ref.match(/^([A-Z]+)(\d+)$/);
      if (!m)
        return null;
      return { col: colIndex(m[1]), row: Number(m[2]) - 1 };
    }
    function resolveThreadedComments(entries, workbook) {
      workbook.persons = workbook.persons || [];
      const personByName = new Map;
      for (const p of workbook.persons)
        if (p.displayName)
          personByName.set(p.displayName, p);
      const out = [], idByIdx = new Map;
      entries.forEach((entry, idx) => {
        const resolved = { ...entry };
        if (!resolved.id)
          resolved.id = tcMod.generateId();
        if (!resolved.personId && resolved.author) {
          let person = personByName.get(resolved.author);
          if (!person) {
            person = {
              id: tcMod.generateId(),
              displayName: resolved.author,
              providerId: "None"
            };
            workbook.persons.push(person);
            personByName.set(resolved.author, person);
          }
          resolved.personId = person.id;
        }
        delete resolved.author;
        if (typeof resolved.parentId === "number")
          resolved.parentId = idByIdx.get(resolved.parentId);
        idByIdx.set(idx, resolved.id);
        out.push(resolved);
      });
      return out;
    }
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
      return "application/octet-stream";
    }
    function imageExtensionFor(contentType) {
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
        default:
          return "bin";
      }
    }
    function extToImageContentType(ext) {
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
        default:
          return "application/octet-stream";
      }
    }
    function parseSharedStrings(text) {
      const root = xml.parse(text), out = [];
      for (const si of xml.findAll(root, "si")) {
        let s = "";
        for (const c of si.children) {
          if (c.type !== "element")
            continue;
          if (c.name === "t")
            s += xml.textContent(c);
          else if (c.name === "r") {
            const t = xml.findChild(c, "t");
            if (t)
              s += xml.textContent(t);
          }
        }
        out.push(s);
      }
      return out;
    }
    function serializeSharedStrings(strings) {
      const items = strings.map((s) => xml.el("si", {}, [
        xml.el("t", { "xml:space": "preserve" }, [xml.text(s)])
      ]));
      return xml.serialize(xml.el("sst", {
        xmlns: SS_NS,
        count: String(strings.length),
        uniqueCount: String(strings.length)
      }, items));
    }
    const walker = walkerMod.createWalker();
    function use(...extensions) {
      walker.use(...extensions);
      return api;
    }
    function write(workbook) {
      if (workbook == null || typeof workbook !== "object" || Array.isArray(workbook))
        throw new ContractError("xlsx/invalid-workbook", "xlsx.write: workbook must be an object with a sheets array", { context: { received: workbook === null ? "null" : typeof workbook } });
      if (workbook.sheets !== void 0 && !Array.isArray(workbook.sheets))
        throw new ContractError("xlsx/invalid-sheets", "xlsx.write: workbook.sheets must be an array", { context: { path: "sheets", received: typeof workbook.sheets } });
      if (walker.hasExtensions)
        walker.applyDehydrate(workbook);
      const pkg = opc.empty(), sheets = workbook.sheets || [], sst = [], sstIndex = new Map;
      function internString(s) {
        if (sstIndex.has(s))
          return sstIndex.get(s);
        const idx = sst.length;
        sst.push(s);
        sstIndex.set(s, idx);
        return idx;
      }
      const tablesById = {};
      for (const t of workbook.tables || [])
        tablesById[t.id] = t;
      const sheetHyperlinkRels = sheets.map(() => []), sheetExtraRels = sheets.map(() => ({
        legacyDrawingRid: null,
        drawingRid: null,
        rels: []
      }));
      sheets.forEach((sheet, i) => {
        const extra = sheetExtraRels[i];
        if (sheet.comments && sheet.comments.length) {
          const commentsRid = `rIdC${i + 1}`, vmlRid = `rIdV${i + 1}`;
          extra.rels.push({
            Id: commentsRid,
            Type: commentsMod.REL_TYPE_COMMENTS,
            Target: `../comments${i + 1}.xml`
          });
          extra.rels.push({
            Id: vmlRid,
            Type: commentsMod.REL_TYPE_VML_DRAWING,
            Target: `../drawings/vmlDrawing${i + 1}.vml`
          });
          extra.legacyDrawingRid = vmlRid;
        }
        if (sheet.drawings && sheet.drawings.length) {
          const drawingRid = `rIdD${i + 1}`;
          extra.rels.push({
            Id: drawingRid,
            Type: drawingsMod.REL_TYPE_DRAWING,
            Target: `../drawings/drawing${i + 1}.xml`
          });
          extra.drawingRid = drawingRid;
        }
      });
      const sheetXmls = sheets.map((sheet, sheetIdx) => renderWorksheet(sheet, sheetIdx, internString, sheetHyperlinkRels[sheetIdx], sheetExtraRels[sheetIdx])), useSharedStrings = sst.length > 0, useStyles = !!workbook.styles, wbChildren = [];
      wbChildren.push(xml.el("sheets", {}, sheets.map((s, i) => {
        const a = {
          name: s.name || `Sheet${i + 1}`,
          sheetId: String(i + 1),
          "r:id": `rId${i + 1}`
        };
        if (s.state)
          a.state = s.state;
        return xml.el("sheet", a);
      })));
      if (workbook.definedNames && workbook.definedNames.length)
        wbChildren.push(xml.el("definedNames", {}, workbook.definedNames.map((dn) => {
          const a = { name: dn.name };
          if (dn.scope != null)
            a.localSheetId = String(dn.scope);
          if (dn.hidden)
            a.hidden = "1";
          return xml.el("definedName", a, [xml.text(dn.value)]);
        })));
      const workbookXml = xml.serialize(xml.el("workbook", { xmlns: SS_NS, "xmlns:r": RELS_NS }, wbChildren));
      opc.setPart(pkg, "/xl/workbook.xml", encodeText(workbookXml), CT_WORKBOOK);
      const wbRels = sheets.map((_, i) => ({
        Id: `rId${i + 1}`,
        Type: REL_TYPE_SHEET,
        Target: `worksheets/sheet${i + 1}.xml`
      }));
      let nextWbRid = sheets.length + 1;
      if (useSharedStrings) {
        wbRels.push({
          Id: `rId${nextWbRid++}`,
          Type: REL_TYPE_SHARED_STRINGS,
          Target: "sharedStrings.xml"
        });
        opc.setPart(pkg, "/xl/sharedStrings.xml", encodeText(serializeSharedStrings(sst)), CT_SHARED_STRINGS);
      }
      if (useStyles) {
        wbRels.push({
          Id: `rId${nextWbRid++}`,
          Type: stylesMod.REL_TYPE_STYLES,
          Target: "styles.xml"
        });
        opc.setPart(pkg, "/xl/styles.xml", stylesMod.bytesOf(workbook.styles), stylesMod.CT_STYLES);
      }
      let needCommentsCT = !1, needVmlCT = !1, nextChartIdx = 1, nextImageIdx = 1;
      const usedImageExts = new Set, chartParts = [];
      sheetXmls.forEach((wsXml, i) => {
        opc.setPart(pkg, `/xl/worksheets/sheet${i + 1}.xml`, encodeText(wsXml), CT_SHEET);
        const wsRels = [];
        for (const h of sheetHyperlinkRels[i])
          wsRels.push(h);
        for (const tableId of sheets[i].tableRefs || []) {
          const t = tablesById[tableId];
          if (!t)
            continue;
          const wsRid = `rId${wsRels.length + 1}`, target = `../tables/table${tableId}.xml`;
          wsRels.push({
            Id: wsRid,
            Type: tablesMod.REL_TYPE_TABLE,
            Target: target
          });
          opc.setPart(pkg, `/xl/tables/table${tableId}.xml`, tablesMod.bytesOf(t), tablesMod.CT_TABLE);
        }
        const sheet = sheets[i];
        if (sheet.comments && sheet.comments.length) {
          needCommentsCT = !0;
          needVmlCT = !0;
          const commentsObj = {
            authors: sheet.commentAuthors || [],
            comments: sheet.comments
          };
          opc.setPart(pkg, `/xl/comments${i + 1}.xml`, commentsMod.bytesOf(commentsObj), commentsMod.CT_COMMENTS);
          const cellRefs = sheet.comments.map((c) => parseRef(c.ref)).filter(Boolean);
          opc.setPart(pkg, `/xl/drawings/vmlDrawing${i + 1}.vml`, commentsMod.vmlBytes(cellRefs), commentsMod.CT_VML_DRAWING);
        }
        for (const r of sheetExtraRels[i].rels)
          wsRels.push(r);
        if (sheet.threadedComments && sheet.threadedComments.length) {
          const tcEntries = resolveThreadedComments(sheet.threadedComments, workbook);
          opc.setPart(pkg, `/xl/threadedComments/threadedComment${i + 1}.xml`, tcMod.threadedCommentsBytes(tcEntries), tcMod.CT_THREADED_COMMENTS);
          pkg.contentTypes.overrides[`/xl/threadedComments/threadedComment${i + 1}.xml`] = tcMod.CT_THREADED_COMMENTS;
          wsRels.push({
            Id: `rIdTc${i + 1}`,
            Type: tcMod.REL_TYPE_THREADED_COMMENT,
            Target: `../threadedComments/threadedComment${i + 1}.xml`
          });
        }
        if (sheet.drawings && sheet.drawings.length) {
          const drawingPath = `/xl/drawings/drawing${i + 1}.xml`, drawingRels = [];
          let nextDrawingRid = 1;
          const seenImages = new Map, entries = [];
          for (const d of sheet.drawings)
            if (d.shapeProps && !d.chart && !d.image)
              entries.push({
                type: "shape",
                anchor: d.anchor,
                id: d.id,
                name: d.name,
                description: d.description,
                shapeProps: d.shapeProps,
                txBody: d.txBody
              });
            else if (d.chart) {
              const chartFile = `chart${nextChartIdx++}.xml`, partName = "/xl/charts/" + chartFile;
              opc.setPart(pkg, partName, chartMod.bytesOf(d.chart), chartMod.CT_CHART);
              chartParts.push(partName);
              const rId = `rId${nextDrawingRid++}`;
              drawingRels.push({
                Id: rId,
                Type: chartMod.REL_TYPE_CHART,
                Target: "../charts/" + chartFile
              });
              entries.push({
                type: "chart",
                anchor: d.anchor,
                graphicFrameId: d.id || entries.length + 2,
                graphicFrameName: d.name || `Chart ${entries.length + 1}`,
                cx: d.cx,
                cy: d.cy,
                offsetX: d.offsetX,
                offsetY: d.offsetY,
                chartRef: rId
              });
            } else if (d.image && d.image.data) {
              let item = seenImages.get(d.image.data);
              if (!item) {
                const ct = d.image.contentType || sniffImageType(d.image.data), ext = imageExtensionFor(ct), fileName = `image${nextImageIdx++}.${ext}`, partName = "/xl/media/" + fileName;
                opc.setPart(pkg, partName, d.image.data, ct);
                usedImageExts.add(ext);
                const rId = `rId${nextDrawingRid++}`;
                drawingRels.push({
                  Id: rId,
                  Type: REL_TYPE.IMAGE,
                  Target: "../media/" + fileName
                });
                item = { rId, partName, ext };
                seenImages.set(d.image.data, item);
              }
              entries.push({
                type: "picture",
                anchor: d.anchor,
                picId: d.id || entries.length + 2,
                picName: d.name || `Picture ${entries.length + 1}`,
                description: d.description,
                title: d.title,
                cx: d.cx,
                cy: d.cy,
                offsetX: d.offsetX,
                offsetY: d.offsetY,
                embedRef: item.rId,
                prstGeom: d.prstGeom || "rect"
              });
            } else if (d._node)
              entries.push({
                type: "graphicFrame",
                anchor: d.anchor,
                _node: d._node
              });
          opc.setPart(pkg, drawingPath, drawingsMod.bytesOf({ entries }), drawingsMod.CT_DRAWING);
          if (drawingRels.length)
            opc.setRels(pkg, drawingPath, drawingRels);
        }
        if (wsRels.length)
          opc.setRels(pkg, `/xl/worksheets/sheet${i + 1}.xml`, wsRels);
      });
      for (let i = 0;i < sheets.length; i++)
        if (sheets[i].drawings && sheets[i].drawings.length)
          pkg.contentTypes.overrides[`/xl/drawings/drawing${i + 1}.xml`] = drawingsMod.CT_DRAWING;
      for (const partName of chartParts)
        pkg.contentTypes.overrides[partName] = chartMod.CT_CHART;
      for (const ext of usedImageExts)
        pkg.contentTypes.defaults[ext] = extToImageContentType(ext);
      if (needVmlCT)
        pkg.contentTypes.defaults.vml = commentsMod.CT_VML_DRAWING;
      if (needCommentsCT) {
        for (let i = 0;i < sheets.length; i++)
          if (sheets[i].comments && sheets[i].comments.length)
            pkg.contentTypes.overrides[`/xl/comments${i + 1}.xml`] = commentsMod.CT_COMMENTS;
      }
      if (workbook.persons && workbook.persons.length) {
        wbRels.push({
          Id: `rId${nextWbRid}`,
          Type: tcMod.REL_TYPE_PERSON,
          Target: "persons/person.xml"
        });
        opc.setPart(pkg, "/xl/persons/person.xml", tcMod.personsBytes(workbook.persons), tcMod.CT_PERSONS);
        pkg.contentTypes.overrides["/xl/persons/person.xml"] = tcMod.CT_PERSONS;
      }
      opc.setRels(pkg, "/xl/workbook.xml", wbRels);
      opc.setRels(pkg, "/", [{
        Id: "rId1",
        Type: REL_TYPE_DOC,
        Target: "xl/workbook.xml"
      }]);
      return opc.write(pkg);
    }
    function renderWorksheet(sheet, sheetIdx, internString, hyperlinkRels, extraRels) {
      const children = [];
      if (sheet.sheetViews && sheet.sheetViews.length)
        children.push(xml.el("sheetViews", {}, sheet.sheetViews.map(renderSheetView)));
      if (sheet.cols && sheet.cols.length)
        children.push(xml.el("cols", {}, sheet.cols.map((col) => {
          const a = { min: String(col.min), max: String(col.max) };
          if (col.width != null) {
            a.width = String(col.width);
            a.customWidth = "1";
          }
          if (col.hidden)
            a.hidden = "1";
          if (col.style != null)
            a.style = String(col.style);
          if (col.bestFit)
            a.bestFit = "1";
          return xml.el("col", a);
        })));
      const rows = (sheet.rows || []).map((row, r) => {
        const cells = row.map((val, c) => renderCell(val, r, c, internString)), a = { r: String(r + 1) };
        return xml.el("row", a, cells);
      });
      children.push(xml.el("sheetData", {}, rows));
      if (sheet.autoFilter)
        children.push(xml.el("autoFilter", { ref: sheet.autoFilter.ref }));
      if (sheet.merges && sheet.merges.length)
        children.push(xml.el("mergeCells", { count: String(sheet.merges.length) }, sheet.merges.map((ref) => xml.el("mergeCell", { ref }))));
      if (sheet.conditionalFormatting && sheet.conditionalFormatting.length)
        for (const block of sheet.conditionalFormatting)
          children.push(cfMod.renderBlock(block));
      if (sheet.dataValidations && sheet.dataValidations.length)
        children.push(xml.el("dataValidations", { count: String(sheet.dataValidations.length) }, sheet.dataValidations.map(renderDataValidation)));
      if (sheet.hyperlinks && sheet.hyperlinks.length) {
        const _ridAlloc = createRidAllocator({ prefix: "rIdH" }), hlinks = sheet.hyperlinks.map((h) => {
          const a = { ref: h.ref };
          if (h.target) {
            const rId = _ridAlloc.next();
            hyperlinkRels.push({
              Id: rId,
              Type: REL_TYPE_HYPERLINK,
              Target: h.target,
              TargetMode: h.external !== !1 ? "External" : void 0
            });
            a["r:id"] = rId;
          }
          if (h.location)
            a.location = h.location;
          if (h.tooltip)
            a.tooltip = h.tooltip;
          if (h.display)
            a.display = h.display;
          return xml.el("hyperlink", a);
        });
        for (const rel of hyperlinkRels)
          if (rel.TargetMode === void 0)
            delete rel.TargetMode;
        children.push(xml.el("hyperlinks", {}, hlinks));
      }
      if (extraRels && extraRels.drawingRid)
        children.push(xml.el("drawing", { "r:id": extraRels.drawingRid }));
      if (extraRels && extraRels.legacyDrawingRid)
        children.push(xml.el("legacyDrawing", { "r:id": extraRels.legacyDrawingRid }));
      if (sheet.tableRefs && sheet.tableRefs.length) {
        let i = hyperlinkRels.length + 1;
        children.push(xml.el("tableParts", { count: String(sheet.tableRefs.length) }, sheet.tableRefs.map(() => xml.el("tablePart", { "r:id": `rId${i++}` }))));
      }
      if (sheet._extras)
        for (const ex of sheet._extras)
          children.push(ex);
      return xml.serialize(xml.el("worksheet", { xmlns: SS_NS, "xmlns:r": RELS_NS }, children));
    }
    function renderSheetView(sv) {
      const a = {};
      if (sv.workbookViewId != null)
        a.workbookViewId = String(sv.workbookViewId);
      else
        a.workbookViewId = "0";
      if (sv.zoomScale != null)
        a.zoomScale = String(sv.zoomScale);
      if (sv.tabSelected)
        a.tabSelected = "1";
      if (sv.showGridLines === !1)
        a.showGridLines = "0";
      if (sv.rightToLeft)
        a.rightToLeft = "1";
      const children = [];
      if (sv.pane) {
        const pa = {};
        if (sv.pane.xSplit != null)
          pa.xSplit = String(sv.pane.xSplit);
        if (sv.pane.ySplit != null)
          pa.ySplit = String(sv.pane.ySplit);
        if (sv.pane.topLeftCell)
          pa.topLeftCell = sv.pane.topLeftCell;
        if (sv.pane.activePane)
          pa.activePane = sv.pane.activePane;
        if (sv.pane.state)
          pa.state = sv.pane.state;
        children.push(xml.el("pane", pa));
      }
      return xml.el("sheetView", a, children);
    }
    function renderDataValidation(dv) {
      const a = { sqref: dv.sqref };
      if (dv.type)
        a.type = dv.type;
      if (dv.operator)
        a.operator = dv.operator;
      if (dv.allowBlank != null)
        a.allowBlank = writeBoolAttr(dv.allowBlank);
      if (dv.showDropDown != null)
        a.showDropDown = writeBoolAttr(dv.showDropDown);
      if (dv.showInputMessage != null)
        a.showInputMessage = writeBoolAttr(dv.showInputMessage);
      if (dv.showErrorMessage != null)
        a.showErrorMessage = writeBoolAttr(dv.showErrorMessage);
      if (dv.errorStyle)
        a.errorStyle = dv.errorStyle;
      if (dv.errorTitle)
        a.errorTitle = dv.errorTitle;
      if (dv.error)
        a.error = dv.error;
      if (dv.promptTitle)
        a.promptTitle = dv.promptTitle;
      if (dv.prompt)
        a.prompt = dv.prompt;
      const children = [];
      if (dv.formula1)
        children.push(xml.el("formula1", {}, [xml.text(dv.formula1)]));
      if (dv.formula2)
        children.push(xml.el("formula2", {}, [xml.text(dv.formula2)]));
      return xml.el("dataValidation", a, children);
    }
    function renderCell(val, r, c, internString) {
      const ref = cellRef(r, c), cell = normalizeCell(val), a = { r: ref };
      if (cell.s != null)
        a.s = String(cell.s);
      if (cell.formula) {
        const inner = [xml.el("f", {}, [xml.text(cell.formula)])];
        if (cell.value != null && cell.value !== "")
          inner.push(xml.el("v", {}, [xml.text(String(cell.value))]));
        if (cell.t && cell.t !== "n")
          a.t = cell.t;
        return xml.el("c", a, inner);
      }
      if (cell.t === "inlineStr") {
        a.t = "inlineStr";
        return xml.el("c", a, [
          xml.el("is", {}, [
            xml.el("t", { "xml:space": "preserve" }, [xml.text(String(cell.value))])
          ])
        ]);
      }
      if (cell.t === "s") {
        const idx = internString(String(cell.value));
        a.t = "s";
        return xml.el("c", a, [xml.el("v", {}, [xml.text(String(idx))])]);
      }
      if (cell.t === "b") {
        a.t = "b";
        return xml.el("c", a, [xml.el("v", {}, [xml.text(cell.value ? "1" : "0")])]);
      }
      if (cell.value === null || cell.value === void 0)
        return xml.el("c", a, []);
      return xml.el("c", a, [xml.el("v", {}, [xml.text(String(cell.value))])]);
    }
    function normalizeCell(val) {
      if (val == null)
        return { value: null, t: "n" };
      if (typeof val === "object" && val.type === "cell") {
        if (val.formula)
          return { ...val, t: val.t || "n" };
        if (val.t)
          return val;
        return { ...val, t: inferT(val.value) };
      }
      return {
        type: "cell",
        value: typeof val === "number" ? val : typeof val === "boolean" ? val : String(val),
        t: inferT(val)
      };
    }
    function inferT(v) {
      if (typeof v === "number")
        return "n";
      if (typeof v === "boolean")
        return "b";
      return "s";
    }
    function archiveLimits(o) {
      return o ? { maxParts: o.maxParts, maxUncompressed: o.maxUncompressed, maxRatio: o.maxRatio } : void 0;
    }
    function read(bytes, readOpts) {
      const pkg = opc.read(bytes, archiveLimits(readOpts)), { value: result, unmodelledParts } = trackUnmodelledParts(pkg, (p) => readPackage(p, readOpts));
      result.unmodelledParts = unmodelledParts;
      return result;
    }
    function readPackage(pkg, readOpts) {
      const docRel = (pkg.rels["/"] || []).find((r) => r.Type.endsWith("/officeDocument"));
      if (!docRel)
        throw new ParseError("xlsx/missing-officeDocument-rel", "xlsx: no officeDocument relationship");
      const wbPart = relsMod.resolveTarget("/", docRel.Target), wbBytes = pkg.parts[wbPart];
      if (!wbBytes)
        throw new ParseError("xlsx/missing-workbook-part", `xlsx: missing workbook ${wbPart}`, { context: { partName: wbPart } });
      const limits = {
        maxSheets: readOpts && readOpts.maxSheets !== void 0 ? readOpts.maxSheets : 64,
        maxRowsPerSheet: readOpts && readOpts.maxRowsPerSheet !== void 0 ? readOpts.maxRowsPerSheet : 200000,
        maxCellsPerSheet: readOpts && readOpts.maxCellsPerSheet !== void 0 ? readOpts.maxCellsPerSheet : 5000000
      };
      let wbRoot;
      try {
        wbRoot = mc.process(xml.parse(decodeText(wbBytes)));
      } catch (e) {
        throw new ParseError("xlsx/invalid-workbook-xml", "xlsx: failed to parse workbook XML", { context: { partName: wbPart }, cause: e });
      }
      const wbRels = pkg.rels[wbPart] || [];
      let sharedStrings = [];
      const sstRel = wbRels.find((r) => r.Type === REL_TYPE_SHARED_STRINGS || r.Type.endsWith("/sharedStrings"));
      if (sstRel) {
        const sstPart = relsMod.resolveTarget(wbPart, sstRel.Target), sstBytes = pkg.parts[sstPart];
        if (sstBytes)
          sharedStrings = parseSharedStrings(decodeText(sstBytes));
      }
      let styles;
      const stylesRel = wbRels.find((r) => r.Type === stylesMod.REL_TYPE_STYLES);
      if (stylesRel) {
        const stylesPart = relsMod.resolveTarget(wbPart, stylesRel.Target), stylesBytes = pkg.parts[stylesPart];
        if (stylesBytes)
          styles = stylesMod.parse(stylesBytes);
      }
      let persons;
      const personsRel = wbRels.find((r) => r.Type === tcMod.REL_TYPE_PERSON);
      if (personsRel) {
        const personsPart = relsMod.resolveTarget(wbPart, personsRel.Target), personsBytes = pkg.parts[personsPart];
        if (personsBytes)
          persons = tcMod.parsePersons(personsBytes);
      }
      const definedNames = [], dnEl = xml.findChild(wbRoot, "definedNames");
      if (dnEl)
        for (const c of xml.findAll(dnEl, "definedName")) {
          const dn = { name: c.attrs.name, value: xml.textContent(c) };
          if (c.attrs.localSheetId != null)
            dn.scope = Number(c.attrs.localSheetId);
          if (c.attrs.hidden === "1")
            dn.hidden = !0;
          definedNames.push(dn);
        }
      const sheets = [], tables = [], sheetsEl = xml.findChild(wbRoot, "sheets");
      if (sheetsEl) {
        const sheetEls = xml.findAll(sheetsEl, "sheet");
        if (limits.maxSheets && sheetEls.length > limits.maxSheets)
          throw new ParseError("xlsx/limit-exceeded", "xlsx: workbook declares more sheets than allowed", { context: {
            limit: "maxSheets",
            max: limits.maxSheets,
            actual: sheetEls.length
          } });
        for (const sEl of sheetEls) {
          const rid = sEl.attrs["r:id"], rel = wbRels.find((r) => r.Id === rid);
          if (!rel)
            continue;
          const wsPart = relsMod.resolveTarget(wbPart, rel.Target), wsBytes = pkg.parts[wsPart];
          if (!wsBytes)
            continue;
          const wsRels = pkg.rels[wsPart] || [], sheet = parseSheet(decodeText(wsBytes), sharedStrings, wsRels, limits, wsPart);
          sheet.name = sEl.attrs.name;
          if (sEl.attrs.state)
            sheet.state = sEl.attrs.state;
          if (sheet._tableRefs) {
            sheet.tableRefs = [];
            for (const tableRid of sheet._tableRefs) {
              const tRel = wsRels.find((r) => r.Id === tableRid);
              if (!tRel)
                continue;
              const tPart = relsMod.resolveTarget(wsPart, tRel.Target), tBytes = pkg.parts[tPart];
              if (!tBytes)
                continue;
              const t = tablesMod.parse(decodeText(tBytes));
              tables.push(t);
              sheet.tableRefs.push(t.id);
            }
            delete sheet._tableRefs;
          }
          const commentsRel = wsRels.find((r) => r.Type === commentsMod.REL_TYPE_COMMENTS);
          if (commentsRel) {
            const commentsPart = relsMod.resolveTarget(wsPart, commentsRel.Target), cBytes = pkg.parts[commentsPart];
            if (cBytes) {
              const parsed = commentsMod.parse(decodeText(cBytes));
              sheet.comments = parsed.comments;
              if (parsed.authors && parsed.authors.length)
                sheet.commentAuthors = parsed.authors;
            }
          }
          delete sheet._legacyDrawingRid;
          const tcRel = wsRels.find((r) => r.Type === tcMod.REL_TYPE_THREADED_COMMENT);
          if (tcRel) {
            const tcPart = relsMod.resolveTarget(wsPart, tcRel.Target), tcBytes = pkg.parts[tcPart];
            if (tcBytes)
              sheet.threadedComments = tcMod.parseThreadedComments(decodeText(tcBytes));
          }
          if (sheet._drawingRid) {
            const drawingRel = wsRels.find((r) => r.Id === sheet._drawingRid);
            if (drawingRel) {
              const drawingPart = relsMod.resolveTarget(wsPart, drawingRel.Target), dBytes = pkg.parts[drawingPart];
              if (dBytes) {
                const parsed = drawingsMod.parse(decodeText(dBytes)), drawingRels = pkg.rels[drawingPart] || [];
                sheet.drawings = resolveDrawingEntries(parsed.entries, drawingPart, drawingRels, pkg);
              }
            }
          }
          delete sheet._drawingRid;
          sheets.push(sheet);
        }
      }
      const workbook = { type: "workbook", sheets, sharedStrings };
      if (styles)
        workbook.styles = styles;
      if (definedNames.length)
        workbook.definedNames = definedNames;
      if (tables.length)
        workbook.tables = tables;
      if (persons && persons.length)
        workbook.persons = persons;
      walker.applyHydrate(workbook);
      return { workbook, package: pkg };
    }
    function resolveDrawingEntries(entries, drawingPart, drawingRels, pkg) {
      const out = [];
      for (const e of entries) {
        const entry = {
          anchor: e.anchor,
          cx: e.cx,
          cy: e.cy,
          offsetX: e.offsetX,
          offsetY: e.offsetY
        };
        if (e.graphicFrameId != null)
          entry.id = e.graphicFrameId;
        else if (e.picId != null)
          entry.id = e.picId;
        else if (e.id != null)
          entry.id = e.id;
        if (e.graphicFrameName)
          entry.name = e.graphicFrameName;
        else if (e.picName)
          entry.name = e.picName;
        else if (e.name)
          entry.name = e.name;
        if (e.description)
          entry.description = e.description;
        if (e.title)
          entry.title = e.title;
        if (e.prstGeom)
          entry.prstGeom = e.prstGeom;
        if (e.type === "chart" && e.chartRef) {
          const rel = drawingRels.find((r) => r.Id === e.chartRef);
          if (rel) {
            const chartPart = relsMod.resolveTarget(drawingPart, rel.Target), cBytes = pkg.parts[chartPart];
            if (cBytes)
              entry.chart = chartMod.parse(decodeText(cBytes));
          }
        } else if (e.type === "picture" && e.embedRef) {
          const rel = drawingRels.find((r) => r.Id === e.embedRef);
          if (rel) {
            const imgPart = relsMod.resolveTarget(drawingPart, rel.Target), data = pkg.parts[imgPart];
            if (data) {
              const ct = pkg.contentTypes && pkg.contentTypes.defaults && pkg.contentTypes.defaults[imgPart.slice(imgPart.lastIndexOf(".") + 1).toLowerCase()];
              entry.image = {
                data,
                contentType: ct || sniffImageType(data),
                rId: e.embedRef
              };
            }
          }
        } else if (e.type === "shape" && e.shapeProps) {
          entry.shapeProps = e.shapeProps;
          if (e.txBody)
            entry.txBody = e.txBody;
        } else if (e._node)
          entry._node = e._node;
        out.push(entry);
      }
      return out;
    }
    function limitExceeded(limit, max, actual, partName) {
      return new ParseError("xlsx/limit-exceeded", `xlsx: sheet exceeds ${limit}`, { context: { limit, max, actual, partName } });
    }
    function countMatches(re, text) {
      re.lastIndex = 0;
      let n = 0;
      while (re.exec(text) !== null)
        n++;
      return n;
    }
    function preScanSheet(text, limits, partName) {
      if (limits.maxRowsPerSheet) {
        const rows = countMatches(ROW_TAG_RE, text);
        if (rows > limits.maxRowsPerSheet)
          throw limitExceeded("maxRowsPerSheet", limits.maxRowsPerSheet, rows, partName);
      }
      if (limits.maxCellsPerSheet) {
        const cells = countMatches(CELL_TAG_RE, text);
        if (cells > limits.maxCellsPerSheet)
          throw limitExceeded("maxCellsPerSheet", limits.maxCellsPerSheet, cells, partName);
      }
    }
    function parseSheet(text, sharedStrings, wsRels, limits, partName) {
      preScanSheet(text, limits, partName);
      const root = mc.process(xml.parse(text)), sheet = { rows: [] }, svs = xml.findChild(root, "sheetViews");
      if (svs)
        sheet.sheetViews = xml.findAll(svs, "sheetView").map(parseSheetView);
      const cols = xml.findChild(root, "cols");
      if (cols)
        sheet.cols = xml.findAll(cols, "col").map(parseColEl);
      const data = xml.findChild(root, "sheetData");
      if (data) {
        const budget = { max: limits.maxCellsPerSheet, used: 0, partName };
        for (const rEl of xml.findAll(data, "row")) {
          if (limits.maxRowsPerSheet && sheet.rows.length >= limits.maxRowsPerSheet)
            throw limitExceeded("maxRowsPerSheet", limits.maxRowsPerSheet, sheet.rows.length + 1, partName);
          sheet.rows.push(parseRow(rEl, sharedStrings, budget));
        }
      }
      const af = xml.findChild(root, "autoFilter");
      if (af)
        sheet.autoFilter = { ref: af.attrs.ref };
      const mergeEl = xml.findChild(root, "mergeCells");
      if (mergeEl)
        sheet.merges = xml.findAll(mergeEl, "mergeCell").map((m) => m.attrs.ref);
      const cfBlocks = xml.findAll(root, "conditionalFormatting");
      if (cfBlocks.length)
        sheet.conditionalFormatting = cfBlocks.map((b) => cfMod.parseBlock(b));
      const dvs = xml.findChild(root, "dataValidations");
      if (dvs)
        sheet.dataValidations = xml.findAll(dvs, "dataValidation").map(parseDataValidation);
      const hl = xml.findChild(root, "hyperlinks");
      if (hl)
        sheet.hyperlinks = xml.findAll(hl, "hyperlink").map((hEl) => {
          const out = { ref: hEl.attrs.ref };
          if (hEl.attrs["r:id"]) {
            const rid = hEl.attrs["r:id"], rel = wsRels.find((r) => r.Id === rid);
            if (rel) {
              out.target = rel.Target;
              out.external = rel.TargetMode === "External";
            }
          }
          if (hEl.attrs.location)
            out.location = hEl.attrs.location;
          if (hEl.attrs.tooltip)
            out.tooltip = hEl.attrs.tooltip;
          if (hEl.attrs.display)
            out.display = hEl.attrs.display;
          return out;
        });
      const tparts = xml.findChild(root, "tableParts");
      if (tparts)
        sheet._tableRefs = xml.findAll(tparts, "tablePart").map((tp) => tp.attrs["r:id"]);
      const legacyDrawing = xml.findChild(root, "legacyDrawing");
      if (legacyDrawing && legacyDrawing.attrs["r:id"])
        sheet._legacyDrawingRid = legacyDrawing.attrs["r:id"];
      const drawingEl = xml.findChild(root, "drawing");
      if (drawingEl && drawingEl.attrs["r:id"])
        sheet._drawingRid = drawingEl.attrs["r:id"];
      return sheet;
    }
    function parseSheetView(sv) {
      const out = {}, a = sv.attrs;
      if (a.workbookViewId != null)
        out.workbookViewId = Number(a.workbookViewId);
      if (a.zoomScale != null)
        out.zoomScale = Number(a.zoomScale);
      if (a.tabSelected === "1")
        out.tabSelected = !0;
      if (a.showGridLines === "0")
        out.showGridLines = !1;
      if (a.rightToLeft === "1")
        out.rightToLeft = !0;
      const pane = xml.findChild(sv, "pane");
      if (pane) {
        const p = {};
        if (pane.attrs.xSplit != null)
          p.xSplit = Number(pane.attrs.xSplit);
        if (pane.attrs.ySplit != null)
          p.ySplit = Number(pane.attrs.ySplit);
        if (pane.attrs.topLeftCell)
          p.topLeftCell = pane.attrs.topLeftCell;
        if (pane.attrs.activePane)
          p.activePane = pane.attrs.activePane;
        if (pane.attrs.state)
          p.state = pane.attrs.state;
        out.pane = p;
      }
      return out;
    }
    function parseColEl(c) {
      const out = { min: Number(c.attrs.min), max: Number(c.attrs.max) };
      if (c.attrs.width)
        out.width = Number(c.attrs.width);
      if (c.attrs.hidden === "1")
        out.hidden = !0;
      if (c.attrs.style != null)
        out.style = Number(c.attrs.style);
      if (c.attrs.bestFit === "1")
        out.bestFit = !0;
      return out;
    }
    function parseDataValidation(el) {
      const out = { sqref: el.attrs.sqref };
      for (const k of [
        "type",
        "operator",
        "errorStyle",
        "errorTitle",
        "error",
        "promptTitle",
        "prompt"
      ])
        if (el.attrs[k])
          out[k] = el.attrs[k];
      for (const k of [
        "allowBlank",
        "showDropDown",
        "showInputMessage",
        "showErrorMessage"
      ])
        if (el.attrs[k] != null)
          out[k] = readBoolAttr(el.attrs[k]);
      const f1 = xml.findChild(el, "formula1"), f2 = xml.findChild(el, "formula2");
      if (f1)
        out.formula1 = xml.textContent(f1);
      if (f2)
        out.formula2 = xml.textContent(f2);
      return out;
    }
    function spendCell(budget) {
      budget.used++;
      if (budget.max && budget.used > budget.max)
        throw limitExceeded("maxCellsPerSheet", budget.max, budget.used, budget.partName);
    }
    function parseRow(rEl, sharedStrings, budget) {
      const row = [];
      let expectedCol = 0;
      for (const cEl of xml.findAll(rEl, "c")) {
        if (cEl.attrs.r) {
          const pos = parseRef(cEl.attrs.r);
          if (pos)
            while (expectedCol < pos.col) {
              spendCell(budget);
              row.push({ type: "cell", value: null, t: "n" });
              expectedCol++;
            }
        }
        spendCell(budget);
        row.push(parseCell(cEl, sharedStrings));
        expectedCol++;
      }
      return row;
    }
    function parseCell(cEl, sharedStrings) {
      const t = cEl.attrs.t || "n", ref = cEl.attrs.r, fEl = xml.findChild(cEl, "f"), formula = fEl ? xml.textContent(fEl) : void 0, s = cEl.attrs.s != null ? Number(cEl.attrs.s) : void 0;
      let value;
      if (t === "inlineStr") {
        const is = xml.findChild(cEl, "is"), tEl = is && xml.findChild(is, "t");
        value = tEl ? xml.textContent(tEl) : "";
      } else if (t === "s") {
        const vEl = xml.findChild(cEl, "v"), idx = vEl ? Number(xml.textContent(vEl)) : -1;
        value = sharedStrings[idx] != null ? sharedStrings[idx] : "";
      } else if (t === "b") {
        const vEl = xml.findChild(cEl, "v");
        value = vEl && xml.textContent(vEl) === "1";
      } else if (t === "str") {
        const vEl = xml.findChild(cEl, "v");
        value = vEl ? xml.textContent(vEl) : "";
      } else {
        const vEl = xml.findChild(cEl, "v");
        if (vEl) {
          const raw = xml.textContent(vEl), num = Number(raw);
          value = Number.isFinite(num) ? num : raw;
        } else
          value = null;
      }
      const out = { type: "cell", value, t };
      if (formula)
        out.formula = formula;
      if (ref)
        out.ref = ref;
      if (s !== void 0)
        out.s = s;
      return out;
    }
    const api = {
      read,
      write,
      use,
      colName,
      colIndex,
      cellRef,
      parseRef,
      parseSharedStrings,
      serializeSharedStrings,
      CT_WORKBOOK,
      CT_SHEET,
      CT_SHARED_STRINGS,
      REL_TYPE_DOC,
      REL_TYPE_SHEET,
      REL_TYPE_SHARED_STRINGS,
      REL_TYPE_HYPERLINK
    };
    return api;
  } });

    const __core = __resolve("xlsx");
    return __core;
    }
};
