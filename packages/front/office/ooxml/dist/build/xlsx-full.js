/*!
 * Copyright (c) 2026 AwaCloud SAS
 * Author: Matthieu Bouilloux
 * SPDX-License-Identifier: AGPL-3.0-only
 * Dual-licensed; see the NOTICE file for licensing and any additional terms.
 */
/* GENERATED — do not edit. Source: packages/front/office/ooxml/tools/generate-bundles.mjs */

/**
 * @fileoverview `@awacloud/ooxml/bundles/prebuilt/xlsx-full-package` — pre-built single-factory bundle.
 *
 * Variant **package** : declares the 7 fw modules as dependencies and inlines every
 * ooxml-local factory transitively reachable from `xlsx` plus 19 extras.
 *
 * @module ooxml/bundles/prebuilt/xlsx-full-package
 */

export const xlsxFullPackage = {
    name: "xlsxFullPackage",
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
    __register({ name: "smlPivotTables", dependencies: ["ooxmlErrors","xml"], factory: function(errors, xml) {
    const { ParseError } = errors;
    function findChildren(parent, name) {
      const out = [];
      for (const c of parent.children || [])
        if (c.type === "element" && c.name === name)
          out.push(c);
      return out;
    }
    function parseSharedItems(node) {
      if (!node)
        return;
      const out = { attrs: { ...node.attrs }, items: [] };
      for (const it of node.children || []) {
        if (it.type !== "element")
          continue;
        switch (it.name) {
          case "s":
            out.items.push({ kind: "s", v: it.attrs.v });
            break;
          case "n":
            out.items.push({ kind: "n", v: it.attrs.v, u: it.attrs.u, f: it.attrs.f, c: it.attrs.c, cp: it.attrs.cp });
            break;
          case "m":
            out.items.push({ kind: "m" });
            break;
          case "b":
            out.items.push({ kind: "b", v: it.attrs.v });
            break;
          case "d":
            out.items.push({ kind: "d", v: it.attrs.v });
            break;
          case "e":
            out.items.push({ kind: "e", v: it.attrs.v });
            break;
          case "x":
            out.items.push({ kind: "x", v: it.attrs.v });
            break;
          default:
            out.items.push({ kind: it.name, attrs: { ...it.attrs } });
        }
      }
      return out;
    }
    function renderSharedItems(si) {
      if (!si)
        return null;
      const kids = (si.items || []).map((it) => {
        switch (it.kind) {
          case "s":
            return xml.el("s", clean({ v: it.v }));
          case "n":
            return xml.el("n", clean({ v: it.v, u: it.u, f: it.f, c: it.c, cp: it.cp }));
          case "m":
            return xml.el("m", {});
          case "b":
            return xml.el("b", clean({ v: it.v }));
          case "d":
            return xml.el("d", clean({ v: it.v }));
          case "e":
            return xml.el("e", clean({ v: it.v }));
          case "x":
            return xml.el("x", clean({ v: it.v }));
          default:
            return xml.el(it.kind, { ...it.attrs || {} });
        }
      });
      return xml.el("sharedItems", { ...si.attrs || {} }, kids);
    }
    function clean(o) {
      const r = {};
      for (const k of Object.keys(o))
        if (o[k] != null)
          r[k] = String(o[k]);
      return r;
    }
    function parsePivotTable(xmlText) {
      const root = xml.parse(xmlText);
      if (root.name !== "pivotTableDefinition")
        throw new ParseError("xlsx/pivotTable-bad-root", `expected <pivotTableDefinition>, got <${root.name}>`, { context: { elementName: root && root.name } });
      const out = { attrs: { ...root.attrs }, _extras: [] }, loc = xml.findChild(root, "location");
      if (loc)
        out.location = { ...loc.attrs };
      const pf = xml.findChild(root, "pivotFields");
      if (pf) {
        out.pivotFields = [];
        for (const f of pf.children || []) {
          if (f.type !== "element" || f.name !== "pivotField")
            continue;
          const pivotField = { attrs: { ...f.attrs } }, items = xml.findChild(f, "items");
          if (items) {
            pivotField.items = [];
            for (const it of items.children || [])
              if (it.type === "element" && it.name === "item")
                pivotField.items.push({ ...it.attrs });
          }
          const ass = xml.findChild(f, "autoSortScope");
          if (ass)
            pivotField.autoSortScope = { attrs: { ...ass.attrs } };
          const fg = xml.findChild(f, "fieldGroup");
          if (fg)
            pivotField.fieldGroup = parseFieldGroup(fg);
          out.pivotFields.push(pivotField);
        }
      }
      const rowFields = xml.findChild(root, "rowFields");
      if (rowFields) {
        out.rowFields = [];
        for (const ch of rowFields.children || [])
          if (ch.type === "element")
            out.rowFields.push({ name: ch.name, attrs: { ...ch.attrs } });
      }
      const colFields = xml.findChild(root, "colFields");
      if (colFields) {
        out.colFields = [];
        for (const ch of colFields.children || [])
          if (ch.type === "element")
            out.colFields.push({ name: ch.name, attrs: { ...ch.attrs } });
      }
      const pageFields = xml.findChild(root, "pageFields");
      if (pageFields) {
        out.pageFields = [];
        for (const ch of pageFields.children || [])
          if (ch.type === "element" && ch.name === "pageField")
            out.pageFields.push({ name: "pageField", attrs: { ...ch.attrs } });
      }
      const dataFields = xml.findChild(root, "dataFields");
      if (dataFields) {
        out.dataFields = [];
        for (const ch of dataFields.children || [])
          if (ch.type === "element" && ch.name === "dataField")
            out.dataFields.push({ name: "dataField", attrs: { ...ch.attrs } });
      }
      const rowItems = xml.findChild(root, "rowItems");
      if (rowItems) {
        out.rowItems = [];
        for (const i of rowItems.children || []) {
          if (i.type !== "element" || i.name !== "i")
            continue;
          const xs = [];
          for (const x of i.children || [])
            if (x.type === "element" && x.name === "x")
              xs.push({ ...x.attrs });
          out.rowItems.push({ attrs: { ...i.attrs }, x: xs });
        }
      }
      const colItems = xml.findChild(root, "colItems");
      if (colItems) {
        out.colItems = [];
        for (const i of colItems.children || []) {
          if (i.type !== "element" || i.name !== "i")
            continue;
          const xs = [];
          for (const x of i.children || [])
            if (x.type === "element" && x.name === "x")
              xs.push({ ...x.attrs });
          out.colItems.push({ attrs: { ...i.attrs }, x: xs });
        }
      }
      const fmts = xml.findChild(root, "formats");
      if (fmts) {
        out.formats = [];
        for (const f of fmts.children || [])
          if (f.type === "element" && f.name === "format")
            out.formats.push(parseFormat(f));
      }
      const cfmts = xml.findChild(root, "chartFormats");
      if (cfmts) {
        out.chartFormats = [];
        for (const f of cfmts.children || [])
          if (f.type === "element" && f.name === "chartFormat")
            out.chartFormats.push({ attrs: { ...f.attrs }, pivotArea: parsePivotArea(xml.findChild(f, "pivotArea")) });
      }
      const cf = xml.findChild(root, "conditionalFormats");
      if (cf) {
        out.conditionalFormats = [];
        for (const c of cf.children || [])
          if (c.type === "element" && c.name === "conditionalFormat") {
            const cfm = { attrs: { ...c.attrs }, pivotAreas: [] }, pas = xml.findChild(c, "pivotAreas");
            if (pas) {
              for (const pa of pas.children || [])
                if (pa.type === "element" && pa.name === "pivotArea")
                  cfm.pivotAreas.push(parsePivotArea(pa));
            }
            out.conditionalFormats.push(cfm);
          }
      }
      const filters = xml.findChild(root, "filters");
      if (filters) {
        out.filters = [];
        for (const f of filters.children || [])
          if (f.type === "element" && f.name === "filter")
            out.filters.push({ attrs: { ...f.attrs }, autoFilter: xml.findChild(f, "autoFilter") });
      }
      const ph = xml.findChild(root, "pivotHierarchies");
      if (ph) {
        out.pivotHierarchies = [];
        for (const h of ph.children || [])
          if (h.type === "element" && h.name === "pivotHierarchy")
            out.pivotHierarchies.push({ attrs: { ...h.attrs } });
      }
      const rhu = xml.findChild(root, "rowHierarchiesUsage");
      if (rhu) {
        out.rowHierarchiesUsage = [];
        for (const u of rhu.children || [])
          if (u.type === "element" && u.name === "rowHierarchyUsage")
            out.rowHierarchiesUsage.push({ ...u.attrs });
      }
      const chu = xml.findChild(root, "colHierarchiesUsage");
      if (chu) {
        out.colHierarchiesUsage = [];
        for (const u of chu.children || [])
          if (u.type === "element" && u.name === "colHierarchyUsage")
            out.colHierarchiesUsage.push({ ...u.attrs });
      }
      const styleInfo = xml.findChild(root, "pivotTableStyleInfo");
      if (styleInfo)
        out.pivotTableStyleInfo = { ...styleInfo.attrs };
      const ext = xml.findChild(root, "extLst");
      if (ext)
        out.extLst = ext;
      const known = new Set([
        "location",
        "pivotFields",
        "rowFields",
        "colFields",
        "pageFields",
        "dataFields",
        "rowItems",
        "colItems",
        "formats",
        "chartFormats",
        "conditionalFormats",
        "filters",
        "pivotHierarchies",
        "rowHierarchiesUsage",
        "colHierarchiesUsage",
        "pivotTableStyleInfo",
        "extLst"
      ]);
      for (const c of root.children || [])
        if (c.type === "element" && !known.has(c.name))
          out._extras.push(c);
      if (!out._extras.length)
        delete out._extras;
      return out;
    }
    function parsePivotArea(pa) {
      if (!pa)
        return;
      const out = { attrs: { ...pa.attrs } }, refs = xml.findChild(pa, "references");
      if (refs) {
        out.references = [];
        for (const r of refs.children || [])
          if (r.type === "element" && r.name === "reference") {
            const ref = { attrs: { ...r.attrs }, x: [] };
            for (const x of r.children || [])
              if (x.type === "element" && x.name === "x")
                ref.x.push({ ...x.attrs });
            out.references.push(ref);
          }
      }
      return out;
    }
    function renderPivotArea(pa) {
      if (!pa)
        return null;
      const kids = [];
      if (pa.references)
        kids.push(xml.el("references", { count: String(pa.references.length) }, pa.references.map((r) => xml.el("reference", { ...r.attrs || {} }, (r.x || []).map((x) => xml.el("x", { ...x }))))));
      return xml.el("pivotArea", { ...pa.attrs || {} }, kids);
    }
    function parseFormat(f) {
      return { attrs: { ...f.attrs }, pivotArea: parsePivotArea(xml.findChild(f, "pivotArea")) };
    }
    function parseFieldGroup(fg) {
      const out = { attrs: { ...fg.attrs } }, rp = xml.findChild(fg, "rangePr");
      if (rp)
        out.rangePr = { ...rp.attrs };
      const dp = xml.findChild(fg, "discretePr");
      if (dp) {
        out.discretePr = { attrs: { ...dp.attrs }, x: [] };
        for (const x of dp.children || [])
          if (x.type === "element" && x.name === "x")
            out.discretePr.x.push({ ...x.attrs });
      }
      const gi = xml.findChild(fg, "groupItems");
      if (gi)
        out.groupItems = parseSharedItems(gi);
      return out;
    }
    function renderFieldGroup(fg) {
      const kids = [];
      if (fg.rangePr)
        kids.push(xml.el("rangePr", { ...fg.rangePr }));
      if (fg.discretePr)
        kids.push(xml.el("discretePr", { ...fg.discretePr.attrs || {} }, (fg.discretePr.x || []).map((x) => xml.el("x", { ...x }))));
      if (fg.groupItems) {
        const gi = renderSharedItems({ attrs: fg.groupItems.attrs, items: fg.groupItems.items });
        kids.push(xml.el("groupItems", gi.attrs, gi.children));
      }
      return xml.el("fieldGroup", { ...fg.attrs || {} }, kids);
    }
    function renderPivotTable(pt) {
      const kids = [];
      if (pt.location)
        kids.push(xml.el("location", { ...pt.location }));
      if (pt.pivotFields)
        kids.push(xml.el("pivotFields", { count: String(pt.pivotFields.length) }, pt.pivotFields.map((f) => {
          const fkids = [];
          if (f.items && f.items.length)
            fkids.push(xml.el("items", { count: String(f.items.length) }, f.items.map((it) => xml.el("item", { ...it }))));
          if (f.autoSortScope)
            fkids.push(xml.el("autoSortScope", { ...f.autoSortScope.attrs || {} }));
          if (f.fieldGroup)
            fkids.push(renderFieldGroup(f.fieldGroup));
          return xml.el("pivotField", { ...f.attrs || {} }, fkids);
        })));
      if (pt.rowFields && pt.rowFields.length)
        kids.push(xml.el("rowFields", { count: String(pt.rowFields.length) }, pt.rowFields.map((item) => xml.el(item.name || "field", { ...item.attrs }))));
      if (pt.colFields && pt.colFields.length)
        kids.push(xml.el("colFields", { count: String(pt.colFields.length) }, pt.colFields.map((item) => xml.el(item.name || "field", { ...item.attrs }))));
      if (pt.pageFields && pt.pageFields.length)
        kids.push(xml.el("pageFields", { count: String(pt.pageFields.length) }, pt.pageFields.map((item) => xml.el("pageField", { ...item.attrs }))));
      if (pt.dataFields && pt.dataFields.length)
        kids.push(xml.el("dataFields", { count: String(pt.dataFields.length) }, pt.dataFields.map((item) => xml.el("dataField", { ...item.attrs }))));
      if (pt.rowItems && pt.rowItems.length)
        kids.push(xml.el("rowItems", { count: String(pt.rowItems.length) }, pt.rowItems.map((i) => xml.el("i", { ...i.attrs || {} }, (i.x || []).map((x) => xml.el("x", { ...x }))))));
      if (pt.colItems && pt.colItems.length)
        kids.push(xml.el("colItems", { count: String(pt.colItems.length) }, pt.colItems.map((i) => xml.el("i", { ...i.attrs || {} }, (i.x || []).map((x) => xml.el("x", { ...x }))))));
      if (pt.formats)
        kids.push(xml.el("formats", { count: String(pt.formats.length) }, pt.formats.map((f) => xml.el("format", { ...f.attrs || {} }, f.pivotArea ? [renderPivotArea(f.pivotArea)] : []))));
      if (pt.chartFormats)
        kids.push(xml.el("chartFormats", { count: String(pt.chartFormats.length) }, pt.chartFormats.map((f) => xml.el("chartFormat", { ...f.attrs || {} }, f.pivotArea ? [renderPivotArea(f.pivotArea)] : []))));
      if (pt.conditionalFormats)
        kids.push(xml.el("conditionalFormats", { count: String(pt.conditionalFormats.length) }, pt.conditionalFormats.map((c) => xml.el("conditionalFormat", { ...c.attrs || {} }, [xml.el("pivotAreas", { count: String((c.pivotAreas || []).length) }, (c.pivotAreas || []).map(renderPivotArea))]))));
      if (pt.filters)
        kids.push(xml.el("filters", { count: String(pt.filters.length) }, pt.filters.map((f) => xml.el("filter", { ...f.attrs || {} }, f.autoFilter ? [f.autoFilter] : []))));
      if (pt.pivotHierarchies)
        kids.push(xml.el("pivotHierarchies", { count: String(pt.pivotHierarchies.length) }, pt.pivotHierarchies.map((h) => xml.el("pivotHierarchy", { ...h.attrs || {} }))));
      if (pt.rowHierarchiesUsage && pt.rowHierarchiesUsage.length)
        kids.push(xml.el("rowHierarchiesUsage", { count: String(pt.rowHierarchiesUsage.length) }, pt.rowHierarchiesUsage.map((u) => xml.el("rowHierarchyUsage", { ...u }))));
      if (pt.colHierarchiesUsage && pt.colHierarchiesUsage.length)
        kids.push(xml.el("colHierarchiesUsage", { count: String(pt.colHierarchiesUsage.length) }, pt.colHierarchiesUsage.map((u) => xml.el("colHierarchyUsage", { ...u }))));
      if (pt.pivotTableStyleInfo)
        kids.push(xml.el("pivotTableStyleInfo", { ...pt.pivotTableStyleInfo }));
      if (pt.extLst)
        kids.push(pt.extLst);
      if (pt._extras)
        for (const ex of pt._extras)
          kids.push(ex);
      const root = xml.el("pivotTableDefinition", {
        xmlns: "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
        "xmlns:r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
        ...pt.attrs || {}
      }, kids);
      return xml.serialize(root);
    }
    function parseCacheSource(src) {
      if (!src)
        return;
      const out = { attrs: { ...src.attrs } }, ws = xml.findChild(src, "worksheetSource");
      if (ws)
        out.worksheetSource = { ...ws.attrs };
      const con = xml.findChild(src, "consolidation");
      if (con) {
        out.consolidation = { attrs: { ...con.attrs }, pages: [], rangeSets: [] };
        const pages = xml.findChild(con, "pages");
        if (pages) {
          for (const p of pages.children || [])
            if (p.type === "element" && p.name === "page") {
              const pageItems = [];
              for (const it of p.children || [])
                if (it.type === "element" && it.name === "pageItem")
                  pageItems.push({ ...it.attrs });
              out.consolidation.pages.push({ attrs: { ...p.attrs }, pageItems });
            }
        }
        const rs = xml.findChild(con, "rangeSets");
        if (rs) {
          for (const r of rs.children || [])
            if (r.type === "element" && r.name === "rangeSet")
              out.consolidation.rangeSets.push({ ...r.attrs });
        }
      }
      return out;
    }
    function renderCacheSource(cs) {
      const kids = [];
      if (cs.worksheetSource)
        kids.push(xml.el("worksheetSource", { ...cs.worksheetSource }));
      if (cs.consolidation) {
        const ckids = [];
        if (cs.consolidation.pages && cs.consolidation.pages.length)
          ckids.push(xml.el("pages", { count: String(cs.consolidation.pages.length) }, cs.consolidation.pages.map((p) => xml.el("page", { ...p.attrs || {} }, (p.pageItems || []).map((it) => xml.el("pageItem", { ...it }))))));
        if (cs.consolidation.rangeSets && cs.consolidation.rangeSets.length)
          ckids.push(xml.el("rangeSets", { count: String(cs.consolidation.rangeSets.length) }, cs.consolidation.rangeSets.map((r) => xml.el("rangeSet", { ...r }))));
        kids.push(xml.el("consolidation", { ...cs.consolidation.attrs || {} }, ckids));
      }
      return xml.el("cacheSource", { ...cs.attrs || {} }, kids);
    }
    function parsePivotCacheDefinition(xmlText) {
      const root = xml.parse(xmlText);
      if (root.name !== "pivotCacheDefinition")
        throw new ParseError("xlsx/pivotCacheDefinition-bad-root", `expected <pivotCacheDefinition>, got <${root.name}>`, { context: { elementName: root && root.name } });
      const out = { attrs: { ...root.attrs }, cacheFields: [], _extras: [] };
      out.cacheSource = parseCacheSource(xml.findChild(root, "cacheSource"));
      const cf = xml.findChild(root, "cacheFields");
      if (cf)
        for (const f of cf.children || []) {
          if (f.type !== "element" || f.name !== "cacheField")
            continue;
          const field = { attrs: { ...f.attrs } }, si = xml.findChild(f, "sharedItems");
          if (si)
            field.sharedItems = parseSharedItems(si);
          const fg = xml.findChild(f, "fieldGroup");
          if (fg)
            field.fieldGroup = parseFieldGroup(fg);
          out.cacheFields.push(field);
        }
      const ch = xml.findChild(root, "cacheHierarchies");
      if (ch) {
        out.cacheHierarchies = [];
        for (const h of ch.children || [])
          if (h.type === "element" && h.name === "cacheHierarchy") {
            const hh = { attrs: { ...h.attrs } }, fu = xml.findChild(h, "fieldsUsage");
            if (fu) {
              hh.fieldsUsage = [];
              for (const u of fu.children || [])
                if (u.type === "element" && u.name === "fieldUsage")
                  hh.fieldsUsage.push({ ...u.attrs });
            }
            const gl = xml.findChild(h, "groupLevels");
            if (gl) {
              hh.groupLevels = [];
              for (const g of gl.children || [])
                if (g.type === "element" && g.name === "groupLevel") {
                  const gg = { attrs: { ...g.attrs }, groups: [] }, gs = xml.findChild(g, "groups");
                  if (gs) {
                    for (const gn of gs.children || [])
                      if (gn.type === "element" && gn.name === "group") {
                        const gm = { attrs: { ...gn.attrs }, groupMembers: [] }, gms = xml.findChild(gn, "groupMembers");
                        if (gms) {
                          for (const m of gms.children || [])
                            if (m.type === "element" && m.name === "groupMember")
                              gm.groupMembers.push({ ...m.attrs });
                        }
                        gg.groups.push(gm);
                      }
                  }
                  hh.groupLevels.push(gg);
                }
            }
            out.cacheHierarchies.push(hh);
          }
      }
      const kpis = xml.findChild(root, "kpis");
      if (kpis) {
        out.kpis = [];
        for (const k of kpis.children || [])
          if (k.type === "element" && k.name === "kpi")
            out.kpis.push({ ...k.attrs });
      }
      const dims = xml.findChild(root, "dimensions");
      if (dims) {
        out.dimensions = [];
        for (const d of dims.children || [])
          if (d.type === "element" && d.name === "dimension")
            out.dimensions.push({ ...d.attrs });
      }
      const mgs = xml.findChild(root, "measureGroups");
      if (mgs) {
        out.measureGroups = [];
        for (const m of mgs.children || [])
          if (m.type === "element" && m.name === "measureGroup")
            out.measureGroups.push({ ...m.attrs });
      }
      const maps = xml.findChild(root, "maps");
      if (maps) {
        out.maps = [];
        for (const mp of maps.children || [])
          if (mp.type === "element" && mp.name === "map")
            out.maps.push({ ...mp.attrs });
      }
      const known = new Set([
        "cacheSource",
        "cacheFields",
        "cacheHierarchies",
        "kpis",
        "dimensions",
        "measureGroups",
        "maps"
      ]);
      for (const c of root.children || [])
        if (c.type === "element" && !known.has(c.name))
          out._extras.push(c);
      if (!out._extras.length)
        delete out._extras;
      return out;
    }
    function renderPivotCacheDefinition(cd) {
      const kids = [];
      if (cd.cacheSource)
        kids.push(renderCacheSource(cd.cacheSource));
      if (cd.cacheFields)
        kids.push(xml.el("cacheFields", { count: String(cd.cacheFields.length) }, cd.cacheFields.map((f) => {
          const fkids = [];
          if (f.sharedItems)
            fkids.push(renderSharedItems(f.sharedItems));
          if (f.fieldGroup)
            fkids.push(renderFieldGroup(f.fieldGroup));
          return xml.el("cacheField", { ...f.attrs || {} }, fkids);
        })));
      if (cd.cacheHierarchies)
        kids.push(xml.el("cacheHierarchies", { count: String(cd.cacheHierarchies.length) }, cd.cacheHierarchies.map((h) => {
          const hkids = [];
          if (h.fieldsUsage)
            hkids.push(xml.el("fieldsUsage", { count: String(h.fieldsUsage.length) }, h.fieldsUsage.map((u) => xml.el("fieldUsage", { ...u }))));
          if (h.groupLevels)
            hkids.push(xml.el("groupLevels", { count: String(h.groupLevels.length) }, h.groupLevels.map((g) => xml.el("groupLevel", { ...g.attrs || {} }, [xml.el("groups", { count: String((g.groups || []).length) }, (g.groups || []).map((gn) => xml.el("group", { ...gn.attrs || {} }, [xml.el("groupMembers", { count: String((gn.groupMembers || []).length) }, (gn.groupMembers || []).map((m) => xml.el("groupMember", { ...m })))])))]))));
          return xml.el("cacheHierarchy", { ...h.attrs || {} }, hkids);
        })));
      if (cd.kpis)
        kids.push(xml.el("kpis", { count: String(cd.kpis.length) }, cd.kpis.map((k) => xml.el("kpi", { ...k }))));
      if (cd.dimensions)
        kids.push(xml.el("dimensions", { count: String(cd.dimensions.length) }, cd.dimensions.map((d) => xml.el("dimension", { ...d }))));
      if (cd.measureGroups)
        kids.push(xml.el("measureGroups", { count: String(cd.measureGroups.length) }, cd.measureGroups.map((m) => xml.el("measureGroup", { ...m }))));
      if (cd.maps)
        kids.push(xml.el("maps", { count: String(cd.maps.length) }, cd.maps.map((mp) => xml.el("map", { ...mp }))));
      if (cd._extras)
        for (const ex of cd._extras)
          kids.push(ex);
      const root = xml.el("pivotCacheDefinition", {
        xmlns: "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
        "xmlns:r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
        ...cd.attrs || {}
      }, kids);
      return xml.serialize(root);
    }
    function parsePivotCacheRecords(xmlText) {
      const root = xml.parse(xmlText);
      if (root.name !== "pivotCacheRecords")
        throw new ParseError("xlsx/pivotCacheRecords-bad-root", `expected <pivotCacheRecords>, got <${root.name}>`, { context: { elementName: root && root.name } });
      const out = { attrs: { ...root.attrs }, records: [] };
      for (const r of root.children || []) {
        if (r.type !== "element" || r.name !== "r")
          continue;
        const cells = [];
        for (const c of r.children || []) {
          if (c.type !== "element")
            continue;
          cells.push({ kind: c.name, attrs: { ...c.attrs } });
        }
        out.records.push(cells);
      }
      return out;
    }
    function renderPivotCacheRecords(rec) {
      const kids = (rec.records || []).map((row) => xml.el("r", {}, row.map((c) => xml.el(c.kind || "m", { ...c.attrs || {} })))), root = xml.el("pivotCacheRecords", {
        xmlns: "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
        "xmlns:r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
        count: String((rec.records || []).length),
        ...rec.attrs || {}
      }, kids);
      return xml.serialize(root);
    }
    return {
      parsePivotTable,
      renderPivotTable,
      parsePivotCacheDefinition,
      renderPivotCacheDefinition,
      parsePivotCacheRecords,
      renderPivotCacheRecords,
      parseSharedItems,
      renderSharedItems,
      parsePivotArea,
      renderPivotArea,
      parseFieldGroup,
      renderFieldGroup,
      parseCacheSource,
      renderCacheSource,
      findChildren
    };
  } });
    __register({ name: "smlCalculation", dependencies: ["xml"], factory: function(xml) {
    const CALC_PR_ATTRS = [
      "calcId",
      "calcMode",
      "fullCalcOnLoad",
      "refMode",
      "iterate",
      "iterateCount",
      "iterateDelta",
      "fullPrecision",
      "calcCompleted",
      "calcOnSave",
      "concurrentCalc",
      "concurrentManualCount",
      "forceFullCalc"
    ];
    function parseCalcChain(text) {
      const root = xml.parse(text), cells = [];
      for (const c of root.children || []) {
        if (c.type !== "element" || c.name !== "c")
          continue;
        const a = c.attrs || {};
        cells.push({
          r: a.r,
          i: a.i,
          s: a.s,
          l: a.l,
          a: a.a,
          t: a.t
        });
      }
      return { attrs: { ...root.attrs }, cells };
    }
    function renderCalcChain(cc) {
      const kids = (cc.cells || []).map((c) => {
        const a = {};
        if (c.r != null)
          a.r = String(c.r);
        if (c.i != null)
          a.i = String(c.i);
        if (c.s != null)
          a.s = String(c.s);
        if (c.l != null)
          a.l = String(c.l);
        if (c.a != null)
          a.a = String(c.a);
        if (c.t != null)
          a.t = String(c.t);
        return xml.el("c", a);
      }), root = xml.el("calcChain", {
        xmlns: "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
        ...cc.attrs || {}
      }, kids);
      return xml.serialize(root);
    }
    function parseCalcPr(input) {
      const a = input && input.attrs ? input.attrs : input || {}, out = {};
      for (const k of CALC_PR_ATTRS)
        if (a[k] != null)
          out[k] = a[k];
      return out;
    }
    function renderCalcPr(cp) {
      const a = {};
      for (const k of CALC_PR_ATTRS)
        if (cp[k] != null)
          a[k] = String(cp[k]);
      return xml.el("calcPr", a);
    }
    return { parseCalcChain, renderCalcChain, parseCalcPr, renderCalcPr };
  } });
    __register({ name: "smlSheetConfig", dependencies: ["xml"], factory: function(xml) {
    const SHEET_PR_ATTRS = [
      "codeName",
      "enableFormatConditionsCalculation",
      "filterMode",
      "published",
      "syncHorizontal",
      "syncRef",
      "syncVertical",
      "transitionEntry",
      "transitionEvaluation"
    ], SHEET_FORMAT_ATTRS = [
      "baseColWidth",
      "defaultColWidth",
      "defaultRowHeight",
      "customHeight",
      "zeroHeight",
      "thickTop",
      "thickBottom",
      "outlineLevelRow",
      "outlineLevelCol"
    ], PRINT_OPTS_ATTRS = [
      "horizontalCentered",
      "verticalCentered",
      "headings",
      "gridLines",
      "gridLinesSet"
    ], PAGE_MARGINS_ATTRS = ["left", "right", "top", "bottom", "header", "footer"], PAGE_SETUP_ATTRS = [
      "paperSize",
      "paperHeight",
      "paperWidth",
      "scale",
      "firstPageNumber",
      "fitToWidth",
      "fitToHeight",
      "pageOrder",
      "orientation",
      "usePrinterDefaults",
      "blackAndWhite",
      "draft",
      "cellComments",
      "useFirstPageNumber",
      "errors",
      "horizontalDpi",
      "verticalDpi",
      "copies",
      "r:id"
    ], HEADER_FOOTER_ATTRS = [
      "differentOddEven",
      "differentFirst",
      "scaleWithDoc",
      "alignWithMargins"
    ];
    function pickAttrs(src, list) {
      const out = {};
      for (const k of list)
        if (src[k] != null)
          out[k] = src[k];
      return out;
    }
    function strAttrs(src, list) {
      const out = {};
      for (const k of list)
        if (src[k] != null)
          out[k] = String(src[k]);
      return out;
    }
    function parseSheetPr(node) {
      if (!node)
        return;
      const out = pickAttrs(node.attrs || {}, SHEET_PR_ATTRS), tabColor = xml.findChild(node, "tabColor");
      if (tabColor)
        out.tabColor = { ...tabColor.attrs };
      const outlinePr = xml.findChild(node, "outlinePr");
      if (outlinePr)
        out.outlinePr = { ...outlinePr.attrs };
      const pageSetUpPr = xml.findChild(node, "pageSetUpPr");
      if (pageSetUpPr)
        out.pageSetUpPr = { ...pageSetUpPr.attrs };
      return out;
    }
    function renderSheetPr(s) {
      const a = strAttrs(s, SHEET_PR_ATTRS), kids = [];
      if (s.tabColor)
        kids.push(xml.el("tabColor", strAttrs(s.tabColor, Object.keys(s.tabColor))));
      if (s.outlinePr)
        kids.push(xml.el("outlinePr", strAttrs(s.outlinePr, Object.keys(s.outlinePr))));
      if (s.pageSetUpPr)
        kids.push(xml.el("pageSetUpPr", strAttrs(s.pageSetUpPr, Object.keys(s.pageSetUpPr))));
      return xml.el("sheetPr", a, kids);
    }
    function parseHeaderFooter(node) {
      if (!node)
        return;
      const out = { attrs: pickAttrs(node.attrs || {}, HEADER_FOOTER_ATTRS) }, oh = xml.findChild(node, "oddHeader");
      if (oh)
        out.oddHeader = xml.textContent(oh);
      const of = xml.findChild(node, "oddFooter");
      if (of)
        out.oddFooter = xml.textContent(of);
      const eh = xml.findChild(node, "evenHeader");
      if (eh)
        out.evenHeader = xml.textContent(eh);
      const ef = xml.findChild(node, "evenFooter");
      if (ef)
        out.evenFooter = xml.textContent(ef);
      const fh = xml.findChild(node, "firstHeader");
      if (fh)
        out.firstHeader = xml.textContent(fh);
      const ff = xml.findChild(node, "firstFooter");
      if (ff)
        out.firstFooter = xml.textContent(ff);
      return out;
    }
    function renderHeaderFooter(h) {
      const kids = [];
      if (h.oddHeader != null)
        kids.push(xml.el("oddHeader", {}, [xml.text(h.oddHeader)]));
      if (h.oddFooter != null)
        kids.push(xml.el("oddFooter", {}, [xml.text(h.oddFooter)]));
      if (h.evenHeader != null)
        kids.push(xml.el("evenHeader", {}, [xml.text(h.evenHeader)]));
      if (h.evenFooter != null)
        kids.push(xml.el("evenFooter", {}, [xml.text(h.evenFooter)]));
      if (h.firstHeader != null)
        kids.push(xml.el("firstHeader", {}, [xml.text(h.firstHeader)]));
      if (h.firstFooter != null)
        kids.push(xml.el("firstFooter", {}, [xml.text(h.firstFooter)]));
      return xml.el("headerFooter", strAttrs(h.attrs || {}, HEADER_FOOTER_ATTRS), kids);
    }
    function parseBreaks(node) {
      if (!node)
        return;
      const items = [];
      for (const b of node.children || [])
        if (b.type === "element" && b.name === "brk")
          items.push({ ...b.attrs });
      return {
        count: node.attrs.count,
        manualBreakCount: node.attrs.manualBreakCount,
        items
      };
    }
    function _breakAttrs(b) {
      const a = {};
      if (b.count != null)
        a.count = String(b.count);
      if (b.manualBreakCount != null)
        a.manualBreakCount = String(b.manualBreakCount);
      return a;
    }
    function _breakKids(b) {
      return (b.items || []).map((i) => xml.el("brk", strAttrs(i, Object.keys(i))));
    }
    function renderRowBreaks(b) {
      return xml.el("rowBreaks", _breakAttrs(b), _breakKids(b));
    }
    function renderColBreaks(b) {
      return xml.el("colBreaks", _breakAttrs(b), _breakKids(b));
    }
    function renderBreaks(name, b) {
      return name === "rowBreaks" ? renderRowBreaks(b) : renderColBreaks(b);
    }
    function parseCustomSheetView(c) {
      const out = { attrs: { ...c.attrs } }, pm = xml.findChild(c, "pageMargins");
      if (pm)
        out.pageMargins = pickAttrs(pm.attrs, PAGE_MARGINS_ATTRS);
      const ps = xml.findChild(c, "pageSetup");
      if (ps)
        out.pageSetup = pickAttrs(ps.attrs, PAGE_SETUP_ATTRS);
      const po = xml.findChild(c, "printOptions");
      if (po)
        out.printOptions = pickAttrs(po.attrs, PRINT_OPTS_ATTRS);
      const hf = xml.findChild(c, "headerFooter");
      if (hf)
        out.headerFooter = parseHeaderFooter(hf);
      const rb = xml.findChild(c, "rowBreaks");
      if (rb)
        out.rowBreaks = parseBreaks(rb);
      const cb = xml.findChild(c, "colBreaks");
      if (cb)
        out.colBreaks = parseBreaks(cb);
      return out;
    }
    function renderCustomSheetView(v) {
      const kids = [];
      if (v.pageMargins)
        kids.push(xml.el("pageMargins", strAttrs(v.pageMargins, PAGE_MARGINS_ATTRS)));
      if (v.pageSetup)
        kids.push(xml.el("pageSetup", strAttrs(v.pageSetup, PAGE_SETUP_ATTRS)));
      if (v.printOptions)
        kids.push(xml.el("printOptions", strAttrs(v.printOptions, PRINT_OPTS_ATTRS)));
      if (v.headerFooter)
        kids.push(renderHeaderFooter(v.headerFooter));
      if (v.rowBreaks)
        kids.push(renderBreaks("rowBreaks", v.rowBreaks));
      if (v.colBreaks)
        kids.push(renderBreaks("colBreaks", v.colBreaks));
      return xml.el("customSheetView", { ...v.attrs || {} }, kids);
    }
    function parseSheetConfig(rootChildren) {
      const out = {};
      for (const c of rootChildren) {
        if (c.type !== "element")
          continue;
        switch (c.name) {
          case "sheetPr":
            out.sheetPr = parseSheetPr(c);
            break;
          case "dimension":
            out.dimension = c.attrs.ref;
            break;
          case "sheetFormatPr":
            out.sheetFormatPr = pickAttrs(c.attrs, SHEET_FORMAT_ATTRS);
            break;
          case "sheetCalcPr":
            out.sheetCalcPr = { ...c.attrs };
            break;
          case "phoneticPr":
            out.phoneticPr = { ...c.attrs };
            break;
          case "printOptions":
            out.printOptions = pickAttrs(c.attrs, PRINT_OPTS_ATTRS);
            break;
          case "pageMargins":
            out.pageMargins = pickAttrs(c.attrs, PAGE_MARGINS_ATTRS);
            break;
          case "pageSetup":
            out.pageSetup = pickAttrs(c.attrs, PAGE_SETUP_ATTRS);
            break;
          case "headerFooter":
            out.headerFooter = parseHeaderFooter(c);
            break;
          case "rowBreaks":
            out.rowBreaks = parseBreaks(c);
            break;
          case "colBreaks":
            out.colBreaks = parseBreaks(c);
            break;
          case "sheetProtection":
            out.sheetProtection = { ...c.attrs };
            break;
          case "protectedRanges": {
            out.protectedRanges = [];
            for (const pr of c.children || [])
              if (pr.type === "element" && pr.name === "protectedRange")
                out.protectedRanges.push({ ...pr.attrs });
            break;
          }
          case "customSheetViews": {
            out.customSheetViews = [];
            for (const v of c.children || [])
              if (v.type === "element" && v.name === "customSheetView")
                out.customSheetViews.push(parseCustomSheetView(v));
            break;
          }
        }
      }
      return out;
    }
    function renderSheetConfig(s) {
      const out = [];
      if (s.sheetPr)
        out.push(renderSheetPr(s.sheetPr));
      if (s.dimension)
        out.push(xml.el("dimension", { ref: String(s.dimension) }));
      if (s.sheetFormatPr)
        out.push(xml.el("sheetFormatPr", strAttrs(s.sheetFormatPr, SHEET_FORMAT_ATTRS)));
      if (s.sheetCalcPr)
        out.push(xml.el("sheetCalcPr", strAttrs(s.sheetCalcPr, Object.keys(s.sheetCalcPr))));
      if (s.phoneticPr)
        out.push(xml.el("phoneticPr", strAttrs(s.phoneticPr, Object.keys(s.phoneticPr))));
      if (s.printOptions)
        out.push(xml.el("printOptions", strAttrs(s.printOptions, PRINT_OPTS_ATTRS)));
      if (s.pageMargins)
        out.push(xml.el("pageMargins", strAttrs(s.pageMargins, PAGE_MARGINS_ATTRS)));
      if (s.pageSetup)
        out.push(xml.el("pageSetup", strAttrs(s.pageSetup, PAGE_SETUP_ATTRS)));
      if (s.headerFooter)
        out.push(renderHeaderFooter(s.headerFooter));
      if (s.rowBreaks)
        out.push(renderBreaks("rowBreaks", s.rowBreaks));
      if (s.colBreaks)
        out.push(renderBreaks("colBreaks", s.colBreaks));
      if (s.sheetProtection)
        out.push(xml.el("sheetProtection", strAttrs(s.sheetProtection, Object.keys(s.sheetProtection))));
      if (s.protectedRanges)
        out.push(xml.el("protectedRanges", {}, s.protectedRanges.map((p) => xml.el("protectedRange", strAttrs(p, Object.keys(p))))));
      if (s.customSheetViews)
        out.push(xml.el("customSheetViews", {}, s.customSheetViews.map(renderCustomSheetView)));
      return out;
    }
    return {
      parseSheetConfig,
      renderSheetConfig,
      parseSheetPr,
      renderSheetPr,
      parseHeaderFooter,
      renderHeaderFooter,
      parseBreaks,
      renderBreaks,
      parseCustomSheetView,
      renderCustomSheetView
    };
  } });
    __register({ name: "smlWorkbookConfig", dependencies: ["xml"], factory: function(xml) {
    function strAttrs(o) {
      const r = {};
      for (const k of Object.keys(o || {}))
        if (o[k] != null)
          r[k] = String(o[k]);
      return r;
    }
    function parseWorkbookView(node) {
      return { ...node.attrs };
    }
    function renderWorkbookView(v) {
      return xml.el("workbookView", strAttrs(v));
    }
    function parseCustomWorkbookView(node) {
      return { ...node.attrs };
    }
    function renderCustomWorkbookView(v) {
      return xml.el("customWorkbookView", strAttrs(v));
    }
    function parseSmartTagTypes(node) {
      const items = [];
      for (const c of node.children || [])
        if (c.type === "element" && c.name === "smartTagType")
          items.push({ ...c.attrs });
      return items;
    }
    function renderSmartTagTypes(arr) {
      return xml.el("smartTagTypes", {}, (arr || []).map((t) => xml.el("smartTagType", strAttrs(t))));
    }
    function parseWebPublishObjects(node) {
      const items = [];
      for (const c of node.children || [])
        if (c.type === "element" && c.name === "webPublishObject")
          items.push({ ...c.attrs });
      return { count: node.attrs.count, items };
    }
    function renderWebPublishObjects(o) {
      const a = {};
      if (o.count != null)
        a.count = String(o.count);
      return xml.el("webPublishObjects", a, (o.items || []).map((i) => xml.el("webPublishObject", strAttrs(i))));
    }
    function parseWorkbookConfig(rootChildren) {
      const out = {};
      for (const c of rootChildren) {
        if (c.type !== "element")
          continue;
        switch (c.name) {
          case "fileVersion":
            out.fileVersion = { ...c.attrs };
            continue;
          case "fileSharing":
            out.fileSharing = { ...c.attrs };
            continue;
          case "fileRecoveryPr":
            out.fileRecoveryPr = { ...c.attrs };
            continue;
          case "oleSize":
            out.oleSize = { ...c.attrs };
            continue;
          case "protection":
            out.protection = { ...c.attrs };
            continue;
          case "workbookProtection":
            out.workbookProtection = { ...c.attrs };
            continue;
          case "smartTagPr":
            out.smartTagPr = { ...c.attrs };
            continue;
          case "webPublishing":
            out.webPublishing = { ...c.attrs };
            continue;
        }
        if (c.name === "bookViews") {
          out.bookViews = [];
          for (const v of c.children || [])
            if (v.type === "element" && v.name === "workbookView")
              out.bookViews.push(parseWorkbookView(v));
          continue;
        }
        if (c.name === "customWorkbookViews") {
          out.customWorkbookViews = [];
          for (const v of c.children || [])
            if (v.type === "element" && v.name === "customWorkbookView")
              out.customWorkbookViews.push(parseCustomWorkbookView(v));
          continue;
        }
        if (c.name === "smartTagTypes") {
          out.smartTagTypes = parseSmartTagTypes(c);
          continue;
        }
        if (c.name === "webPublishObjects") {
          out.webPublishObjects = parseWebPublishObjects(c);
          continue;
        }
        if (c.name === "pivotCaches") {
          out.pivotCaches = [];
          for (const pc of c.children || [])
            if (pc.type === "element" && pc.name === "pivotCache")
              out.pivotCaches.push({ ...pc.attrs });
          continue;
        }
      }
      return out;
    }
    function renderWorkbookConfig(w) {
      const out = [];
      if (w.fileVersion)
        out.push(xml.el("fileVersion", strAttrs(w.fileVersion)));
      if (w.fileSharing)
        out.push(xml.el("fileSharing", strAttrs(w.fileSharing)));
      if (w.fileRecoveryPr)
        out.push(xml.el("fileRecoveryPr", strAttrs(w.fileRecoveryPr)));
      if (w.oleSize)
        out.push(xml.el("oleSize", strAttrs(w.oleSize)));
      if (w.protection)
        out.push(xml.el("protection", strAttrs(w.protection)));
      if (w.workbookProtection)
        out.push(xml.el("workbookProtection", strAttrs(w.workbookProtection)));
      if (w.smartTagPr)
        out.push(xml.el("smartTagPr", strAttrs(w.smartTagPr)));
      if (w.webPublishing)
        out.push(xml.el("webPublishing", strAttrs(w.webPublishing)));
      if (w.bookViews)
        out.push(xml.el("bookViews", {}, w.bookViews.map(renderWorkbookView)));
      if (w.customWorkbookViews)
        out.push(xml.el("customWorkbookViews", {}, w.customWorkbookViews.map(renderCustomWorkbookView)));
      if (w.smartTagTypes)
        out.push(renderSmartTagTypes(w.smartTagTypes));
      if (w.webPublishObjects)
        out.push(renderWebPublishObjects(w.webPublishObjects));
      if (w.pivotCaches)
        out.push(xml.el("pivotCaches", {}, w.pivotCaches.map((pc) => xml.el("pivotCache", strAttrs(pc)))));
      return out;
    }
    return {
      parseWorkbookConfig,
      renderWorkbookConfig,
      parseWorkbookView,
      renderWorkbookView,
      parseCustomWorkbookView,
      renderCustomWorkbookView,
      parseSmartTagTypes,
      renderSmartTagTypes,
      parseWebPublishObjects,
      renderWebPublishObjects
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
    __register({ name: "smlFormControls", dependencies: ["ooxmlErrors","xml"], factory: function(errors, xml) {
    const { ParseError } = errors;
    function strAttrs(o) {
      const r = {};
      for (const k of Object.keys(o || {}))
        if (o[k] != null)
          r[k] = String(o[k]);
      return r;
    }
    function parseActiveX(text) {
      const root = xml.parse(text), out = { attrs: { ...root.attrs }, ocxPr: [] };
      for (const c of root.children || []) {
        if (c.type !== "element" || c.name !== "ocxPr")
          continue;
        const a = c.attrs || {};
        out.ocxPr.push({
          name: a.name,
          value: a.value,
          license: a.license,
          persistence: a.persistence,
          autoLoad: a.autoLoad,
          id: a.id
        });
      }
      return out;
    }
    function renderActiveX(node) {
      if (node && node.type === "element" && node.name)
        return xml.serialize(node);
      const o = node || {}, kids = (o.ocxPr || []).map((p) => xml.el("ocxPr", strAttrs(p))), attrs = {
        xmlns: "http://schemas.microsoft.com/office/2006/activeX",
        ...o.attrs || {}
      }, root = xml.el("ocx", attrs, kids);
      return xml.serialize(root);
    }
    function parseOleObjects(node) {
      if (!node || node.name !== "oleObjects")
        throw new ParseError("xlsx/oleObjects-bad-root", `expected <oleObjects>, got <${node && node.name}>`, { context: { elementName: node && node.name } });
      const out = [];
      for (const c of node.children || []) {
        if (c.type !== "element" || c.name !== "oleObject")
          continue;
        const o = { ...c.attrs }, objectPr = xml.findChild(c, "objectPr");
        if (objectPr) {
          o.objectPr = { attrs: { ...objectPr.attrs } };
          const anchor = xml.findChild(objectPr, "anchor");
          if (anchor)
            o.objectPr.anchor = { attrs: { ...anchor.attrs } };
        }
        out.push(o);
      }
      return out;
    }
    function renderOleObjects(arr) {
      return xml.el("oleObjects", {}, (arr || []).map((o) => {
        const a = strAttrs({
          progId: o.progId,
          dvAspect: o.dvAspect,
          link: o.link,
          oleUpdate: o.oleUpdate,
          autoLoad: o.autoLoad,
          shapeId: o.shapeId,
          "r:id": o["r:id"] || o.rId
        }), kids = [];
        if (o.objectPr) {
          const opKids = [];
          if (o.objectPr.anchor)
            opKids.push(xml.el("anchor", strAttrs(o.objectPr.anchor.attrs || {})));
          kids.push(xml.el("objectPr", strAttrs(o.objectPr.attrs || {}), opKids));
        }
        return xml.el("oleObject", a, kids);
      }));
    }
    function parseControls(node) {
      if (!node || node.name !== "controls")
        throw new ParseError("xlsx/controls-bad-root", `expected <controls>, got <${node && node.name}>`, { context: { elementName: node && node.name } });
      const out = [];
      for (const c of node.children || []) {
        if (c.type !== "element" || c.name !== "control")
          continue;
        const ctl = { ...c.attrs }, cp = xml.findChild(c, "controlPr");
        if (cp) {
          ctl.controlPr = { attrs: { ...cp.attrs } };
          const anchor = xml.findChild(cp, "anchor");
          if (anchor)
            ctl.controlPr.anchor = { attrs: { ...anchor.attrs } };
        }
        out.push(ctl);
      }
      return out;
    }
    function renderControls(arr) {
      return xml.el("controls", {}, (arr || []).map((c) => {
        const a = strAttrs({
          shapeId: c.shapeId,
          name: c.name,
          "r:id": c["r:id"] || c.rId
        }), kids = [];
        if (c.controlPr) {
          const cpKids = [];
          if (c.controlPr.anchor)
            cpKids.push(xml.el("anchor", strAttrs(c.controlPr.anchor.attrs || {})));
          kids.push(xml.el("controlPr", strAttrs(c.controlPr.attrs || {}), cpKids));
        }
        return xml.el("control", a, kids);
      }));
    }
    function parseControl(text) {
      return xml.parse(text);
    }
    function renderControl(node) {
      return xml.serialize(node);
    }
    return {
      parseActiveX,
      renderActiveX,
      parseOleObjects,
      renderOleObjects,
      parseControls,
      renderControls,
      parseControl,
      renderControl
    };
  } });
    __register({ name: "dmlShapesAdvanced", dependencies: ["xml"], factory: function(xml) {
    const PATH_OPS = ["moveTo", "lnTo", "arcTo", "cubicBezTo", "quadBezTo", "close"];
    function parsePathCommand(el) {
      const local = el.name.replace(/^a:/, "");
      switch (el.name) {
        case "a:moveTo":
        case "a:lnTo":
        case "a:cubicBezTo":
        case "a:quadBezTo": {
          const points = (el.children || []).filter((c) => c.type === "element" && c.name === "a:pt").map((pt) => ({ x: pt.attrs.x, y: pt.attrs.y }));
          return { op: local, points };
        }
        case "a:arcTo":
          return { op: "arcTo", attrs: { ...el.attrs } };
        case "a:close":
          return { op: "close" };
        default:
          return null;
      }
    }
    function renderPathCommand(cmd) {
      const pts = (cmd.points || []).map((pt) => xml.el("a:pt", { x: String(pt.x), y: String(pt.y) }));
      switch (cmd.op) {
        case "moveTo":
          return xml.el("a:moveTo", {}, pts);
        case "lnTo":
          return xml.el("a:lnTo", {}, pts);
        case "cubicBezTo":
          return xml.el("a:cubicBezTo", {}, pts);
        case "quadBezTo":
          return xml.el("a:quadBezTo", {}, pts);
        case "arcTo":
          return xml.el("a:arcTo", cmd.attrs || {});
        case "close":
          return xml.el("a:close", {});
        default:
          return null;
      }
    }
    function parsePath(el) {
      const out = { attrs: { ...el.attrs }, commands: [] };
      for (const c of el.children || []) {
        if (c.type !== "element")
          continue;
        const cmd = parsePathCommand(c);
        if (cmd)
          out.commands.push(cmd);
      }
      return out;
    }
    function renderPath(p) {
      return xml.el("a:path", p.attrs || {}, (p.commands || []).map(renderPathCommand).filter(Boolean));
    }
    function parseGd(el) {
      return { name: el.attrs.name, fmla: el.attrs.fmla };
    }
    function renderGd(g) {
      return xml.el("a:gd", { name: String(g.name), fmla: String(g.fmla) });
    }
    function parseAhPolar(el) {
      const out = { attrs: { ...el.attrs } }, pos = (el.children || []).find((c) => c.type === "element" && c.name === "a:pos");
      if (pos)
        out.pos = { ...pos.attrs };
      return out;
    }
    function renderAhPolar(a) {
      const kids = [];
      if (a.pos)
        kids.push(xml.el("a:pos", { ...a.pos }));
      return xml.el("a:ahPolar", a.attrs || {}, kids);
    }
    function parseAhXY(el) {
      const out = { attrs: { ...el.attrs } }, pos = (el.children || []).find((c) => c.type === "element" && c.name === "a:pos");
      if (pos)
        out.pos = { ...pos.attrs };
      return out;
    }
    function renderAhXY(a) {
      const kids = [];
      if (a.pos)
        kids.push(xml.el("a:pos", { ...a.pos }));
      return xml.el("a:ahXY", a.attrs || {}, kids);
    }
    function parseCxn(el) {
      const out = { attrs: { ...el.attrs } }, pos = (el.children || []).find((c) => c.type === "element" && c.name === "a:pos");
      if (pos)
        out.pos = { ...pos.attrs };
      return out;
    }
    function renderCxn(c) {
      const kids = [];
      if (c.pos)
        kids.push(xml.el("a:pos", { ...c.pos }));
      return xml.el("a:cxn", c.attrs || {}, kids);
    }
    function parsePt(el) {
      return { x: el.attrs.x, y: el.attrs.y };
    }
    function renderPt(p) {
      return xml.el("a:pt", { x: String(p.x), y: String(p.y) });
    }
    function parseAvLst(el) {
      const out = { gds: [] };
      for (const c of el.children || [])
        if (c.type === "element" && c.name === "a:gd")
          out.gds.push(parseGd(c));
      return out;
    }
    function renderAvLst(a) {
      return xml.el("a:avLst", {}, (a && a.gds || []).map(renderGd));
    }
    function parseGdLst(el) {
      const out = { gds: [] };
      for (const c of el.children || [])
        if (c.type === "element" && c.name === "a:gd")
          out.gds.push(parseGd(c));
      return out;
    }
    function renderGdLst(g) {
      return xml.el("a:gdLst", {}, (g && g.gds || []).map(renderGd));
    }
    function parseAhLst(el) {
      const out = { ahs: [] };
      for (const c of el.children || []) {
        if (c.type !== "element")
          continue;
        switch (c.name) {
          case "a:ahPolar":
            out.ahs.push({ kind: "ahPolar", ...parseAhPolar(c) });
            break;
          case "a:ahXY":
            out.ahs.push({ kind: "ahXY", ...parseAhXY(c) });
            break;
        }
      }
      return out;
    }
    function renderAhLst(a) {
      const kids = (a && a.ahs || []).map((h) => h.kind === "ahPolar" ? renderAhPolar(h) : renderAhXY(h));
      return xml.el("a:ahLst", {}, kids);
    }
    function parseCxnLst(el) {
      const out = { cxns: [] };
      for (const c of el.children || [])
        if (c.type === "element" && c.name === "a:cxn")
          out.cxns.push(parseCxn(c));
      return out;
    }
    function renderCxnLst(c) {
      return xml.el("a:cxnLst", {}, (c && c.cxns || []).map(renderCxn));
    }
    function parseRect(el) {
      return { ...el.attrs };
    }
    function renderRect(r) {
      const a = r || {};
      return xml.el("a:rect", {
        l: String(a.l || 0),
        t: String(a.t || 0),
        r: String(a.r || 0),
        b: String(a.b || 0)
      });
    }
    function parsePathLst(el) {
      const out = { paths: [] };
      for (const c of el.children || [])
        if (c.type === "element" && c.name === "a:path")
          out.paths.push(parsePath(c));
      return out;
    }
    function renderPathLst(p) {
      return xml.el("a:pathLst", {}, (p && p.paths || []).map(renderPath));
    }
    function parseCustGeom(el) {
      const out = { paths: [] };
      for (const c of el.children || []) {
        if (c.type !== "element")
          continue;
        switch (c.name) {
          case "a:avLst":
            out.avLst = parseAvLst(c);
            break;
          case "a:gdLst":
            out.gdLst = parseGdLst(c);
            break;
          case "a:ahLst":
            out.ahLst = parseAhLst(c);
            break;
          case "a:cxnLst":
            out.cxnLst = parseCxnLst(c);
            break;
          case "a:rect":
            out.rect = parseRect(c);
            break;
          case "a:pathLst": {
            const pl = parsePathLst(c);
            out.paths = pl.paths;
            out.pathLst = pl;
            break;
          }
        }
      }
      return out;
    }
    function renderCustGeom(c) {
      return xml.el("a:custGeom", {}, [
        renderAvLst(c.avLst),
        renderGdLst(c.gdLst),
        renderAhLst(c.ahLst),
        renderCxnLst(c.cxnLst),
        renderRect(c.rect),
        renderPathLst(c.pathLst || { paths: c.paths || [] })
      ]);
    }
    function parseCxnSp(el) {
      const out = { attrs: { ...el.attrs } };
      for (const c of el.children || []) {
        if (c.type !== "element")
          continue;
        if (c.name === "a:cNvCxnSpPr" || c.name === "p:cNvCxnSpPr" || c.name === "xdr:cNvCxnSpPr")
          out.cNvCxnSpPr = { name: c.name, attrs: { ...c.attrs } };
      }
      return out;
    }
    function renderCxnSp(c) {
      const kids = [];
      if (c.cNvCxnSpPr)
        kids.push(xml.el("a:cNvCxnSpPr", c.cNvCxnSpPr.attrs || {}));
      return xml.el("a:cxnSp", c.attrs || {}, kids);
    }
    function parseLightRig(el) {
      const out = { attrs: { ...el.attrs } }, r = (el.children || []).find((c) => c.type === "element" && c.name === "a:rot");
      if (r)
        out.rot = { ...r.attrs };
      return out;
    }
    function renderLightRig(l) {
      const kids = [];
      if (l && l.rot)
        kids.push(xml.el("a:rot", { ...l.rot }));
      return xml.el("a:lightRig", l && l.attrs || {}, kids);
    }
    function parseScene3d(el) {
      const out = {};
      for (const c of el.children || []) {
        if (c.type !== "element")
          continue;
        switch (c.name) {
          case "a:camera":
            out.camera = { attrs: { ...c.attrs } };
            break;
          case "a:lightRig":
            out.lightRig = parseLightRig(c);
            break;
          case "a:flatTx":
            out.flatTx = { ...c.attrs };
            break;
        }
      }
      return out;
    }
    function renderScene3d(s) {
      s = s || {};
      const kids = [];
      if (s.camera)
        kids.push(xml.el("a:camera", s.camera.attrs || {}));
      if (s.lightRig)
        kids.push(renderLightRig(s.lightRig));
      if (s.flatTx)
        kids.push(xml.el("a:flatTx", { ...s.flatTx }));
      return xml.el("a:scene3d", {}, kids);
    }
    function parseBevel(el) {
      return { attrs: { ...el.attrs } };
    }
    function parseSp3d(el) {
      const out = { attrs: { ...el.attrs } };
      for (const c of el.children || []) {
        if (c.type !== "element")
          continue;
        switch (c.name) {
          case "a:bevelT":
            out.bevelT = parseBevel(c);
            break;
          case "a:bevelB":
            out.bevelB = parseBevel(c);
            break;
          case "a:extrusionClr":
            out.extrusionClr = { children: c.children || [] };
            break;
          case "a:contourClr":
            out.contourClr = { children: c.children || [] };
            break;
        }
      }
      return out;
    }
    function renderSp3d(s) {
      s = s || {};
      const kids = [];
      if (s.bevelT)
        kids.push(xml.el("a:bevelT", s.bevelT.attrs || {}));
      if (s.bevelB)
        kids.push(xml.el("a:bevelB", s.bevelB.attrs || {}));
      if (s.extrusionClr)
        kids.push(xml.el("a:extrusionClr", {}, s.extrusionClr.children || []));
      if (s.contourClr)
        kids.push(xml.el("a:contourClr", {}, s.contourClr.children || []));
      return xml.el("a:sp3d", s.attrs || {}, kids);
    }
    function parseAny(el) {
      switch (el.name) {
        case "a:custGeom":
          return parseCustGeom(el);
        case "a:pathLst":
          return parsePathLst(el);
        case "a:path":
          return parsePath(el);
        case "a:moveTo":
        case "a:lnTo":
        case "a:cubicBezTo":
        case "a:quadBezTo":
        case "a:arcTo":
        case "a:close":
          return parsePathCommand(el);
        case "a:gd":
          return parseGd(el);
        case "a:gdLst":
          return parseGdLst(el);
        case "a:avLst":
          return parseAvLst(el);
        case "a:ahLst":
          return parseAhLst(el);
        case "a:ahPolar":
          return parseAhPolar(el);
        case "a:ahXY":
          return parseAhXY(el);
        case "a:cxnLst":
          return parseCxnLst(el);
        case "a:cxn":
          return parseCxn(el);
        case "a:rect":
          return parseRect(el);
        case "a:pt":
          return parsePt(el);
        case "a:cxnSp":
          return parseCxnSp(el);
        case "a:scene3d":
          return parseScene3d(el);
        case "a:sp3d":
          return parseSp3d(el);
        case "a:lightRig":
          return parseLightRig(el);
        case "a:bevelT":
        case "a:bevelB":
          return parseBevel(el);
        case "a:flatTx":
          return { ...el.attrs };
        case "a:extrusionClr":
        case "a:contourClr":
          return { children: el.children || [] };
        case "a:cNvCxnSpPr":
          return { attrs: { ...el.attrs } };
        default:
          return null;
      }
    }
    return {
      parseAny,
      parseCustGeom,
      renderCustGeom,
      parsePath,
      renderPath,
      parsePathLst,
      renderPathLst,
      parsePathCommand,
      renderPathCommand,
      parseGd,
      renderGd,
      parseAvLst,
      renderAvLst,
      parseGdLst,
      renderGdLst,
      parseAhLst,
      renderAhLst,
      parseAhPolar,
      renderAhPolar,
      parseAhXY,
      renderAhXY,
      parseCxnLst,
      renderCxnLst,
      parseCxn,
      renderCxn,
      parseRect,
      renderRect,
      parsePt,
      renderPt,
      parseCxnSp,
      renderCxnSp,
      parseScene3d,
      renderScene3d,
      parseSp3d,
      renderSp3d,
      parseLightRig,
      renderLightRig,
      PATH_OPS
    };
  } });
    __register({ name: "dmlXdrAdvanced", dependencies: ["xml"], factory: function(xml) {
    function elements(node) {
      return (node && node.children ? node.children : []).filter((c) => c.type === "element");
    }
    function parseCNvPr(el) {
      if (!el)
        return;
      return {
        id: el.attrs.id,
        name: el.attrs.name,
        descr: el.attrs.descr,
        title: el.attrs.title,
        hidden: el.attrs.hidden
      };
    }
    function renderCNvPr(p) {
      const a = {};
      if (p.id != null)
        a.id = String(p.id);
      if (p.name != null)
        a.name = String(p.name);
      if (p.descr != null)
        a.descr = String(p.descr);
      if (p.title != null)
        a.title = String(p.title);
      if (p.hidden != null)
        a.hidden = String(p.hidden);
      return xml.el("xdr:cNvPr", a);
    }
    function parseCNvCxnSpPr(el) {
      if (!el)
        return;
      const out = { attrs: { ...el.attrs } }, stCxn = xml.findChild(el, "a:stCxn"), endCxn = xml.findChild(el, "a:endCxn");
      if (stCxn)
        out.stCxn = { ...stCxn.attrs };
      if (endCxn)
        out.endCxn = { ...endCxn.attrs };
      return out;
    }
    function renderCNvCxnSpPr(p) {
      const kids = [];
      if (p.stCxn)
        kids.push(xml.el("a:stCxn", { ...p.stCxn }));
      if (p.endCxn)
        kids.push(xml.el("a:endCxn", { ...p.endCxn }));
      return xml.el("xdr:cNvCxnSpPr", p.attrs || {}, kids);
    }
    function parseNvCxnSpPr(el) {
      if (!el)
        return;
      const out = {}, cnv = xml.findChild(el, "xdr:cNvPr"), cnvSp = xml.findChild(el, "xdr:cNvCxnSpPr");
      if (cnv)
        out.cNvPr = parseCNvPr(cnv);
      if (cnvSp)
        out.cNvCxnSpPr = parseCNvCxnSpPr(cnvSp);
      return out;
    }
    function renderNvCxnSpPr(p) {
      const kids = [];
      if (p.cNvPr)
        kids.push(renderCNvPr(p.cNvPr));
      if (p.cNvCxnSpPr)
        kids.push(renderCNvCxnSpPr(p.cNvCxnSpPr));
      return xml.el("xdr:nvCxnSpPr", {}, kids);
    }
    function parseCNvGrpSpPr(el) {
      if (!el)
        return;
      const out = { attrs: { ...el.attrs } }, lck = xml.findChild(el, "a:grpSpLocks");
      if (lck)
        out.grpSpLocks = { ...lck.attrs };
      return out;
    }
    function renderCNvGrpSpPr(p) {
      const kids = [];
      if (p.grpSpLocks)
        kids.push(xml.el("a:grpSpLocks", { ...p.grpSpLocks }));
      return xml.el("xdr:cNvGrpSpPr", p.attrs || {}, kids);
    }
    function parseNvGrpSpPr(el) {
      if (!el)
        return;
      const out = {}, cnv = xml.findChild(el, "xdr:cNvPr"), cnvGrp = xml.findChild(el, "xdr:cNvGrpSpPr");
      if (cnv)
        out.cNvPr = parseCNvPr(cnv);
      if (cnvGrp)
        out.cNvGrpSpPr = parseCNvGrpSpPr(cnvGrp);
      return out;
    }
    function renderNvGrpSpPr(p) {
      const kids = [];
      if (p.cNvPr)
        kids.push(renderCNvPr(p.cNvPr));
      if (p.cNvGrpSpPr)
        kids.push(renderCNvGrpSpPr(p.cNvGrpSpPr));
      return xml.el("xdr:nvGrpSpPr", {}, kids);
    }
    function parseGrpSpPr(el) {
      if (!el)
        return;
      return { attrs: { ...el.attrs }, children: (el.children || []).slice() };
    }
    function renderGrpSpPr(p) {
      return xml.el("xdr:grpSpPr", p.attrs || {}, p.children || []);
    }
    function parseStyle(el) {
      if (!el)
        return;
      const out = {};
      for (const c of elements(el))
        if (c.name === "a:lnRef")
          out.lnRef = { idx: c.attrs.idx, raw: c };
        else if (c.name === "a:fillRef")
          out.fillRef = { idx: c.attrs.idx, raw: c };
        else if (c.name === "a:effectRef")
          out.effectRef = { idx: c.attrs.idx, raw: c };
        else if (c.name === "a:fontRef")
          out.fontRef = { idx: c.attrs.idx, raw: c };
      return out;
    }
    function renderStyle(s) {
      const kids = [];
      if (s.lnRef)
        kids.push(s.lnRef.raw || xml.el("a:lnRef", { idx: String(s.lnRef.idx) }));
      if (s.fillRef)
        kids.push(s.fillRef.raw || xml.el("a:fillRef", { idx: String(s.fillRef.idx) }));
      if (s.effectRef)
        kids.push(s.effectRef.raw || xml.el("a:effectRef", { idx: String(s.effectRef.idx) }));
      if (s.fontRef)
        kids.push(s.fontRef.raw || xml.el("a:fontRef", { idx: String(s.fontRef.idx) }));
      return xml.el("xdr:style", {}, kids);
    }
    function parseContentPart(el) {
      if (!el)
        return;
      return { rId: el.attrs["r:id"] };
    }
    function renderContentPart(p) {
      const a = {};
      if (p.rId != null)
        a["r:id"] = String(p.rId);
      return xml.el("xdr:contentPart", a);
    }
    function parseCxnSp(el) {
      if (!el)
        return;
      const out = { attrs: { ...el.attrs } };
      for (const c of elements(el))
        switch (c.name) {
          case "xdr:nvCxnSpPr":
            out.nvCxnSpPr = parseNvCxnSpPr(c);
            break;
          case "xdr:spPr":
            out.spPr = { children: (c.children || []).slice() };
            break;
          case "xdr:style":
            out.style = parseStyle(c);
            break;
          default:
            (out._extras = out._extras || []).push(c);
        }
      return out;
    }
    function renderCxnSp(c) {
      const kids = [];
      if (c.nvCxnSpPr)
        kids.push(renderNvCxnSpPr(c.nvCxnSpPr));
      if (c.spPr)
        kids.push(xml.el("xdr:spPr", {}, c.spPr.children || []));
      if (c.style)
        kids.push(renderStyle(c.style));
      if (c._extras)
        kids.push(...c._extras);
      return xml.el("xdr:cxnSp", c.attrs || {}, kids);
    }
    function parseGrpSp(el) {
      if (!el)
        return;
      const out = { attrs: { ...el.attrs }, items: [] };
      for (const c of elements(el))
        switch (c.name) {
          case "xdr:nvGrpSpPr":
            out.nvGrpSpPr = parseNvGrpSpPr(c);
            break;
          case "xdr:grpSpPr":
            out.grpSpPr = parseGrpSpPr(c);
            break;
          case "xdr:cxnSp":
            out.items.push({ kind: "cxnSp", node: parseCxnSp(c) });
            break;
          case "xdr:grpSp":
            out.items.push({ kind: "grpSp", node: parseGrpSp(c) });
            break;
          case "xdr:contentPart":
            out.items.push({ kind: "contentPart", node: parseContentPart(c) });
            break;
          default:
            (out._extras = out._extras || []).push(c);
        }
      return out;
    }
    function renderGrpSp(g) {
      const kids = [];
      if (g.nvGrpSpPr)
        kids.push(renderNvGrpSpPr(g.nvGrpSpPr));
      if (g.grpSpPr)
        kids.push(renderGrpSpPr(g.grpSpPr));
      for (const it of g.items || [])
        if (it.kind === "cxnSp")
          kids.push(renderCxnSp(it.node));
        else if (it.kind === "grpSp")
          kids.push(renderGrpSp(it.node));
        else if (it.kind === "contentPart")
          kids.push(renderContentPart(it.node));
      if (g._extras)
        kids.push(...g._extras);
      return xml.el("xdr:grpSp", g.attrs || {}, kids);
    }
    function parseMarker(el) {
      if (!el)
        return;
      const out = {}, col = xml.findChild(el, "xdr:col"), colOff = xml.findChild(el, "xdr:colOff"), row = xml.findChild(el, "xdr:row"), rowOff = xml.findChild(el, "xdr:rowOff");
      if (col)
        out.col = Number(xml.textContent(col));
      if (colOff)
        out.colOff = Number(xml.textContent(colOff));
      if (row)
        out.row = Number(xml.textContent(row));
      if (rowOff)
        out.rowOff = Number(xml.textContent(rowOff));
      return out;
    }
    function renderMarker(tag, m) {
      const kids = [];
      if (m.col != null)
        kids.push(xml.el("xdr:col", {}, [xml.text(String(m.col))]));
      if (m.colOff != null)
        kids.push(xml.el("xdr:colOff", {}, [xml.text(String(m.colOff))]));
      if (m.row != null)
        kids.push(xml.el("xdr:row", {}, [xml.text(String(m.row))]));
      if (m.rowOff != null)
        kids.push(xml.el("xdr:rowOff", {}, [xml.text(String(m.rowOff))]));
      return xml.el(tag, {}, kids);
    }
    function parseExt(el) {
      if (!el)
        return;
      return { cx: el.attrs.cx, cy: el.attrs.cy };
    }
    function renderExt(e) {
      return xml.el("xdr:ext", { cx: String(e.cx), cy: String(e.cy) });
    }
    function parseAnchorBody(el) {
      const out = { attrs: { ...el.attrs }, items: [] };
      for (const c of elements(el))
        switch (c.name) {
          case "xdr:from":
            out.from = parseMarker(c);
            break;
          case "xdr:to":
            out.to = parseMarker(c);
            break;
          case "xdr:ext":
            out.ext = parseExt(c);
            break;
          case "xdr:pos":
            out.pos = { x: c.attrs.x, y: c.attrs.y };
            break;
          case "xdr:cxnSp":
            out.items.push({ kind: "cxnSp", node: parseCxnSp(c) });
            break;
          case "xdr:grpSp":
            out.items.push({ kind: "grpSp", node: parseGrpSp(c) });
            break;
          case "xdr:contentPart":
            out.items.push({ kind: "contentPart", node: parseContentPart(c) });
            break;
          case "xdr:clientData":
            out.clientData = { ...c.attrs };
            break;
          default:
            (out._extras = out._extras || []).push(c);
        }
      return out;
    }
    function renderAnchorChildren(a) {
      const kids = [];
      if (a.pos)
        kids.push(xml.el("xdr:pos", { x: String(a.pos.x), y: String(a.pos.y) }));
      if (a.from)
        kids.push(renderMarker("xdr:from", a.from));
      if (a.to)
        kids.push(renderMarker("xdr:to", a.to));
      if (a.ext)
        kids.push(renderExt(a.ext));
      for (const it of a.items || [])
        if (it.kind === "cxnSp")
          kids.push(renderCxnSp(it.node));
        else if (it.kind === "grpSp")
          kids.push(renderGrpSp(it.node));
        else if (it.kind === "contentPart")
          kids.push(renderContentPart(it.node));
      if (a.clientData)
        kids.push(xml.el("xdr:clientData", { ...a.clientData }));
      if (a._extras)
        kids.push(...a._extras);
      return kids;
    }
    function parseAbsoluteAnchor(el) {
      return el ? parseAnchorBody(el) : void 0;
    }
    function renderAbsoluteAnchor(a) {
      return xml.el("xdr:absoluteAnchor", a.attrs || {}, renderAnchorChildren(a));
    }
    function parseOneCellAnchor(el) {
      return el ? parseAnchorBody(el) : void 0;
    }
    function renderOneCellAnchor(a) {
      return xml.el("xdr:oneCellAnchor", a.attrs || {}, renderAnchorChildren(a));
    }
    function parseTwoCellAnchor(el) {
      return el ? parseAnchorBody(el) : void 0;
    }
    function renderTwoCellAnchor(a) {
      return xml.el("xdr:twoCellAnchor", a.attrs || {}, renderAnchorChildren(a));
    }
    function parseConnector(el) {
      return parseCxnSp(el);
    }
    function renderConnector(c) {
      return renderCxnSp(c);
    }
    function parseGroupShape(el) {
      return parseGrpSp(el);
    }
    function renderGroupShape(g) {
      return renderGrpSp(g);
    }
    return {
      parseConnector,
      renderConnector,
      parseGroupShape,
      renderGroupShape,
      parseCxnSp,
      renderCxnSp,
      parseGrpSp,
      renderGrpSp,
      parseCNvCxnSpPr,
      renderCNvCxnSpPr,
      parseNvCxnSpPr,
      renderNvCxnSpPr,
      parseCNvGrpSpPr,
      renderCNvGrpSpPr,
      parseNvGrpSpPr,
      renderNvGrpSpPr,
      parseGrpSpPr,
      renderGrpSpPr,
      parseStyle,
      renderStyle,
      parseContentPart,
      renderContentPart,
      parseAbsoluteAnchor,
      renderAbsoluteAnchor,
      parseOneCellAnchor,
      renderOneCellAnchor,
      parseTwoCellAnchor,
      renderTwoCellAnchor,
      parseCNvPr,
      renderCNvPr
    };
  } });
    __register({ name: "transitional", dependencies: ["xml"], factory: function(xml) {
    const NS_MAP = {
      "http://schemas.openxmlformats.org/wordprocessingml/2006/main": "http://purl.oclc.org/ooxml/wordprocessingml/main",
      "http://schemas.openxmlformats.org/spreadsheetml/2006/main": "http://purl.oclc.org/ooxml/spreadsheetml/main",
      "http://schemas.openxmlformats.org/presentationml/2006/main": "http://purl.oclc.org/ooxml/presentationml/main",
      "http://schemas.openxmlformats.org/drawingml/2006/main": "http://purl.oclc.org/ooxml/drawingml/main"
    }, TRANSITIONAL_ELEMENTS = [
      { name: "w:embedSystemFonts", kind: "deprecated" },
      { name: "w:doNotEmbedSystemFonts", kind: "deprecated" },
      { name: "w:embedTrueTypeFonts", kind: "deprecated" },
      { name: "w:saveSubsetFonts", kind: "deprecated" },
      { name: "w:savePreviewPicture", kind: "deprecated" },
      { name: "w:savePropertiesXML", kind: "deprecated" },
      { name: "w:noLineBreaksAfter", kind: "deprecated" },
      { name: "w:noLineBreaksBefore", kind: "deprecated" },
      { name: "w:applyBreakingRules", kind: "deprecated" },
      { name: "w:uiCompat97To2003", kind: "deprecated" },
      { name: "w:useFELayout", kind: "deprecated" },
      { name: "w:strictFirstAndLastChars", kind: "deprecated" },
      { name: "w:doNotAutofitConstrainedTables", kind: "deprecated" },
      { name: "w:doNotBreakConstrainedForcedTable", kind: "deprecated" },
      { name: "w:doNotBreakWrappedTables", kind: "deprecated" },
      { name: "w:doNotExpandShiftReturn", kind: "deprecated" },
      { name: "w:doNotLeaveBackslashAlone", kind: "deprecated" },
      { name: "w:doNotSnapToGridInCell", kind: "deprecated" },
      { name: "w:doNotUseEastAsianBreakRules", kind: "deprecated" },
      { name: "w:doNotUseHTMLParagraphAutoSpacing", kind: "deprecated" },
      { name: "w:doNotUseIndentAsNumberingTabStop", kind: "deprecated" },
      { name: "w:doNotVertAlignCellWithSp", kind: "deprecated" },
      { name: "w:doNotVertAlignInTxbx", kind: "deprecated" },
      { name: "w:doNotWrapTextWithPunct", kind: "deprecated" },
      { name: "w:displayBackgroundShape", kind: "deprecated" },
      { name: "w:displayHorizontalDrawingGridEvery", kind: "deprecated" },
      { name: "w:displayVerticalDrawingGridEvery", kind: "deprecated" },
      { name: "w:drawingGridHorizontalSpacing", kind: "deprecated" },
      { name: "w:drawingGridVerticalSpacing", kind: "deprecated" },
      { name: "w:drawingGridHorizontalOrigin", kind: "deprecated" },
      { name: "w:drawingGridVerticalOrigin", kind: "deprecated" },
      { name: "w:gutterAtTop", kind: "deprecated" },
      { name: "w:cachedColBalance", kind: "deprecated" },
      { name: "w:swapBordersFacingPages", kind: "deprecated" },
      { name: "w:characterSpacingControl", kind: "deprecated" },
      { name: "w:printPostScriptOverText", kind: "deprecated" },
      { name: "w:printFractionalCharacterWidth", kind: "deprecated" },
      { name: "w:printTwoOnOne", kind: "deprecated" },
      { name: "w:autoSpaceDE", kind: "deprecated" },
      { name: "w:autoSpaceDN", kind: "deprecated" },
      { name: "w:bordersDoNotSurroundHeader", kind: "deprecated" },
      { name: "w:bordersDoNotSurroundFooter", kind: "deprecated" },
      { name: "w:mirrorMargins", kind: "deprecated" },
      { name: "w:doNotShadeFormData", kind: "deprecated" },
      { name: "w:doNotIncludeSubdocsInStats", kind: "deprecated" },
      { name: "w:trackChange", kind: "namespace-only" },
      { name: "a:vmlDrawing", kind: "deprecated" },
      { name: "w:document", kind: "namespace-only" },
      { name: "w:body", kind: "namespace-only" }
    ];
    function toStrict(node) {
      return rewriteAttrs(node, (k, v) => {
        if (k.startsWith("xmlns") && NS_MAP[v])
          return [k, NS_MAP[v]];
        return [k, v];
      });
    }
    function fromStrict(node) {
      const reverse = Object.fromEntries(Object.entries(NS_MAP).map(([t, s]) => [s, t]));
      return rewriteAttrs(node, (k, v) => {
        if (k.startsWith("xmlns") && reverse[v])
          return [k, reverse[v]];
        return [k, v];
      });
    }
    function rewriteAttrs(node, fn) {
      if (!node || node.type !== "element")
        return node;
      const newAttrs = {};
      for (const [k, v] of Object.entries(node.attrs)) {
        const [nk, nv] = fn(k, v);
        newAttrs[nk] = nv;
      }
      return { ...node, attrs: newAttrs, children: (node.children || []).map((c) => rewriteAttrs(c, fn)) };
    }
    function transitionalToStrict(el) {
      if (!el || el.type !== "element")
        return el;
      switch (el.name) {
        case "w:embedSystemFonts":
          return null;
        case "w:doNotEmbedSystemFonts":
          return null;
        case "w:embedTrueTypeFonts":
          return null;
        case "w:saveSubsetFonts":
          return null;
        case "w:savePreviewPicture":
          return null;
        case "w:savePropertiesXML":
          return null;
        case "w:noLineBreaksAfter":
          return null;
        case "w:noLineBreaksBefore":
          return null;
        case "w:applyBreakingRules":
          return null;
        case "w:uiCompat97To2003":
          return null;
        case "w:useFELayout":
          return null;
        case "w:strictFirstAndLastChars":
          return null;
        case "w:doNotAutofitConstrainedTables":
          return null;
        case "w:doNotBreakConstrainedForcedTable":
          return null;
        case "w:doNotBreakWrappedTables":
          return null;
        case "w:doNotExpandShiftReturn":
          return null;
        case "w:doNotLeaveBackslashAlone":
          return null;
        case "w:doNotSnapToGridInCell":
          return null;
        case "w:doNotUseEastAsianBreakRules":
          return null;
        case "w:doNotUseHTMLParagraphAutoSpacing":
          return null;
        case "w:doNotUseIndentAsNumberingTabStop":
          return null;
        case "w:doNotVertAlignCellWithSp":
          return null;
        case "w:doNotVertAlignInTxbx":
          return null;
        case "w:doNotWrapTextWithPunct":
          return null;
        case "w:displayBackgroundShape":
          return null;
        case "w:displayHorizontalDrawingGridEvery":
          return null;
        case "w:displayVerticalDrawingGridEvery":
          return null;
        case "w:drawingGridHorizontalSpacing":
          return null;
        case "w:drawingGridVerticalSpacing":
          return null;
        case "w:drawingGridHorizontalOrigin":
          return null;
        case "w:drawingGridVerticalOrigin":
          return null;
        case "w:gutterAtTop":
          return null;
        case "w:cachedColBalance":
          return null;
        case "w:swapBordersFacingPages":
          return null;
        case "w:characterSpacingControl":
          return null;
        case "w:printPostScriptOverText":
          return null;
        case "w:printFractionalCharacterWidth":
          return null;
        case "w:printTwoOnOne":
          return null;
        case "w:autoSpaceDE":
          return null;
        case "w:autoSpaceDN":
          return null;
        case "w:bordersDoNotSurroundHeader":
          return null;
        case "w:bordersDoNotSurroundFooter":
          return null;
        case "w:mirrorMargins":
          return null;
        case "w:doNotShadeFormData":
          return null;
        case "w:doNotIncludeSubdocsInStats":
          return null;
        case "w:trackChange":
          return toStrict(el);
        case "a:vmlDrawing":
          return null;
        case "w:document":
          return toStrict(el);
        case "w:body":
          return toStrict(el);
        default:
          return el;
      }
    }
    function strictToTransitional(el) {
      if (!el || el.type !== "element")
        return el;
      return fromStrict(el);
    }
    function buildTransitional(name, attrs, children) {
      switch (name) {
        case "w:embedSystemFonts":
          return xml.el("w:embedSystemFonts", attrs || {}, children || []);
        case "w:doNotEmbedSystemFonts":
          return xml.el("w:doNotEmbedSystemFonts", attrs || {}, children || []);
        case "w:embedTrueTypeFonts":
          return xml.el("w:embedTrueTypeFonts", attrs || {}, children || []);
        case "w:saveSubsetFonts":
          return xml.el("w:saveSubsetFonts", attrs || {}, children || []);
        case "w:savePreviewPicture":
          return xml.el("w:savePreviewPicture", attrs || {}, children || []);
        case "w:savePropertiesXML":
          return xml.el("w:savePropertiesXML", attrs || {}, children || []);
        case "w:noLineBreaksAfter":
          return xml.el("w:noLineBreaksAfter", attrs || {}, children || []);
        case "w:noLineBreaksBefore":
          return xml.el("w:noLineBreaksBefore", attrs || {}, children || []);
        case "w:applyBreakingRules":
          return xml.el("w:applyBreakingRules", attrs || {}, children || []);
        case "w:uiCompat97To2003":
          return xml.el("w:uiCompat97To2003", attrs || {}, children || []);
        case "w:useFELayout":
          return xml.el("w:useFELayout", attrs || {}, children || []);
        case "w:strictFirstAndLastChars":
          return xml.el("w:strictFirstAndLastChars", attrs || {}, children || []);
        case "w:doNotAutofitConstrainedTables":
          return xml.el("w:doNotAutofitConstrainedTables", attrs || {}, children || []);
        case "w:doNotBreakConstrainedForcedTable":
          return xml.el("w:doNotBreakConstrainedForcedTable", attrs || {}, children || []);
        case "w:doNotBreakWrappedTables":
          return xml.el("w:doNotBreakWrappedTables", attrs || {}, children || []);
        case "w:doNotExpandShiftReturn":
          return xml.el("w:doNotExpandShiftReturn", attrs || {}, children || []);
        case "w:doNotLeaveBackslashAlone":
          return xml.el("w:doNotLeaveBackslashAlone", attrs || {}, children || []);
        case "w:doNotSnapToGridInCell":
          return xml.el("w:doNotSnapToGridInCell", attrs || {}, children || []);
        case "w:doNotUseEastAsianBreakRules":
          return xml.el("w:doNotUseEastAsianBreakRules", attrs || {}, children || []);
        case "w:doNotUseHTMLParagraphAutoSpacing":
          return xml.el("w:doNotUseHTMLParagraphAutoSpacing", attrs || {}, children || []);
        case "w:doNotUseIndentAsNumberingTabStop":
          return xml.el("w:doNotUseIndentAsNumberingTabStop", attrs || {}, children || []);
        case "w:doNotVertAlignCellWithSp":
          return xml.el("w:doNotVertAlignCellWithSp", attrs || {}, children || []);
        case "w:doNotVertAlignInTxbx":
          return xml.el("w:doNotVertAlignInTxbx", attrs || {}, children || []);
        case "w:doNotWrapTextWithPunct":
          return xml.el("w:doNotWrapTextWithPunct", attrs || {}, children || []);
        case "w:displayBackgroundShape":
          return xml.el("w:displayBackgroundShape", attrs || {}, children || []);
        case "w:displayHorizontalDrawingGridEvery":
          return xml.el("w:displayHorizontalDrawingGridEvery", attrs || {}, children || []);
        case "w:displayVerticalDrawingGridEvery":
          return xml.el("w:displayVerticalDrawingGridEvery", attrs || {}, children || []);
        case "w:drawingGridHorizontalSpacing":
          return xml.el("w:drawingGridHorizontalSpacing", attrs || {}, children || []);
        case "w:drawingGridVerticalSpacing":
          return xml.el("w:drawingGridVerticalSpacing", attrs || {}, children || []);
        case "w:drawingGridHorizontalOrigin":
          return xml.el("w:drawingGridHorizontalOrigin", attrs || {}, children || []);
        case "w:drawingGridVerticalOrigin":
          return xml.el("w:drawingGridVerticalOrigin", attrs || {}, children || []);
        case "w:gutterAtTop":
          return xml.el("w:gutterAtTop", attrs || {}, children || []);
        case "w:cachedColBalance":
          return xml.el("w:cachedColBalance", attrs || {}, children || []);
        case "w:swapBordersFacingPages":
          return xml.el("w:swapBordersFacingPages", attrs || {}, children || []);
        case "w:characterSpacingControl":
          return xml.el("w:characterSpacingControl", attrs || {}, children || []);
        case "w:printPostScriptOverText":
          return xml.el("w:printPostScriptOverText", attrs || {}, children || []);
        case "w:printFractionalCharacterWidth":
          return xml.el("w:printFractionalCharacterWidth", attrs || {}, children || []);
        case "w:printTwoOnOne":
          return xml.el("w:printTwoOnOne", attrs || {}, children || []);
        case "w:autoSpaceDE":
          return xml.el("w:autoSpaceDE", attrs || {}, children || []);
        case "w:autoSpaceDN":
          return xml.el("w:autoSpaceDN", attrs || {}, children || []);
        case "w:bordersDoNotSurroundHeader":
          return xml.el("w:bordersDoNotSurroundHeader", attrs || {}, children || []);
        case "w:bordersDoNotSurroundFooter":
          return xml.el("w:bordersDoNotSurroundFooter", attrs || {}, children || []);
        case "w:mirrorMargins":
          return xml.el("w:mirrorMargins", attrs || {}, children || []);
        case "w:doNotShadeFormData":
          return xml.el("w:doNotShadeFormData", attrs || {}, children || []);
        case "w:doNotIncludeSubdocsInStats":
          return xml.el("w:doNotIncludeSubdocsInStats", attrs || {}, children || []);
        case "w:trackChange":
          return xml.el("w:trackChange", attrs || {}, children || []);
        case "a:vmlDrawing":
          return xml.el("a:vmlDrawing", attrs || {}, children || []);
        case "w:document":
          return xml.el("w:document", attrs || {}, children || []);
        case "w:body":
          return xml.el("w:body", attrs || {}, children || []);
        default:
          return xml.el(name, attrs || {}, children || []);
      }
    }
    function isTransitionalOnly(name) {
      const e = TRANSITIONAL_ELEMENTS.find((t) => t.name === name);
      return !!e && e.kind === "deprecated";
    }
    return {
      NS_MAP,
      TRANSITIONAL_ELEMENTS,
      toStrict,
      fromStrict,
      transitionalToStrict,
      strictToTransitional,
      buildTransitional,
      isTransitionalOnly
    };
  } });
    __register({ name: "legacyVml", dependencies: ["xml"], factory: function(xml) {
    const VML_ATTRS = {
      "v:shape": ["id", "type", "style", "fillcolor", "strokecolor", "stroked", "filled", "coordsize", "coordorigin", "path", "href", "target", "class", "title", "alt", "wrapcoords", "print", "spid"],
      "v:shapetype": ["id", "coordsize", "o:spt", "path", "filled", "stroked", "adj"],
      "v:rect": ["id", "style", "fillcolor", "strokecolor", "stroked", "filled", "href", "class"],
      "v:roundrect": ["id", "style", "fillcolor", "strokecolor", "arcsize", "stroked", "filled"],
      "v:oval": ["id", "style", "fillcolor", "strokecolor", "stroked", "filled"],
      "v:line": ["id", "style", "from", "to", "strokecolor", "strokeweight"],
      "v:polyline": ["id", "style", "points", "strokecolor", "fillcolor"],
      "v:curve": ["id", "style", "from", "to", "control1", "control2"],
      "v:arc": ["id", "style", "startangle", "endangle", "fillcolor", "strokecolor"],
      "v:image": ["id", "style", "src", "href"],
      "v:group": ["id", "style", "coordsize", "coordorigin"],
      "v:background": ["id", "fillcolor", "filled"],
      "v:fill": ["id", "type", "color", "color2", "src", "opacity", "focus", "focusposition", "focussize", "recolor", "rotate", "angle", "alignshape", "position", "size", "origin", "aspect", "method", "on"],
      "v:stroke": ["id", "color", "color2", "weight", "dashstyle", "endcap", "joinstyle", "linestyle", "miterlimit", "opacity", "on", "src", "imagesize", "imagealignshape", "imageaspect", "filltype", "startarrow", "startarrowwidth", "startarrowlength", "endarrow", "endarrowwidth", "endarrowlength"],
      "v:shadow": ["id", "on", "type", "obscured", "color", "opacity", "offset", "offset2", "origin", "matrix", "color2"],
      "v:textbox": ["id", "style", "inset", "singleclick"],
      "v:textpath": ["id", "on", "fitshape", "fitpath", "trim", "xscale", "string", "style"],
      "v:imagedata": ["id", "src", "cropleft", "cropright", "croptop", "cropbottom", "gain", "blacklevel", "gamma", "grayscale", "bilevel", "chromakey", "embosscolor", "recolortarget", "href", "althref", "title", "oleid", "detectmouseclick", "movie", "r:id", "o:relid", "o:title", "pictureid"],
      "v:formulas": [],
      "v:f": ["eqn"],
      "v:path": ["id", "v", "limo", "textboxrect", "fillok", "strokeok", "shadowok", "arrowok", "gradientshapeok", "textpathok", "insetpenok"],
      "v:handles": [],
      "v:h": ["position", "polar", "map", "invx", "invy", "switch", "xrange", "yrange", "radiusrange"],
      "o:OLEObject": ["Type", "ProgID", "ShapeID", "DrawAspect", "ObjectID", "r:id"],
      "o:complex": ["v:ext"],
      "o:colormenu": ["v:ext", "strokecolor", "fillcolor", "shadowcolor", "extrusioncolor"],
      "o:colormru": ["v:ext", "colors"],
      "o:diagram": ["v:ext", "dgmstyle", "autoformat", "reverse", "autolayout", "dgmscalex", "dgmscaley", "dgmfontsize", "constrainbounds", "dgmbasetextscale"],
      "o:lock": ["v:ext", "position", "selection", "grouping", "ungrouping", "rotation", "cropping", "verticies", "adjusthandles", "text", "aspectratio", "shapetype"],
      "o:bottom": ["v:ext", "on", "weight", "color", "color2", "linestyle", "dashstyle", "startarrow", "endarrow"],
      "o:top": ["v:ext", "on", "weight", "color", "color2", "linestyle", "dashstyle"],
      "o:left": ["v:ext", "on", "weight", "color", "color2", "linestyle", "dashstyle"],
      "o:right": ["v:ext", "on", "weight", "color", "color2", "linestyle", "dashstyle"],
      "o:column": ["v:ext", "on", "weight", "color"],
      "o:clippath": ["v:ext", "v"],
      "o:fill": ["v:ext", "type"],
      "o:rules": ["v:ext"],
      "o:r": ["id", "type", "how", "idref"],
      "o:proxy": ["v:ext", "start", "idref", "connectloc", "connecttype"],
      "o:regrouptable": ["v:ext"],
      "o:entry": ["new", "old"],
      "o:idmap": ["v:ext", "data"],
      "o:relationtable": ["v:ext"],
      "o:rel": ["v:ext", "idsrc", "iddest", "idcntr"],
      "o:LockedField": [],
      "o:CustomDocumentProperties": [],
      "o:DocumentProperties": [],
      "o:signatureline": ["v:ext", "id", "provid", "issignatureline", "signinginstructionsset", "allowcomments", "showsigndate", "suggestedsigner", "suggestedsigner2", "suggestedsigneremail", "signinginstructions"]
    }, VML_TAGS = Object.keys(VML_ATTRS);
    function parseElement(el) {
      if (!el || el.type !== "element")
        return null;
      const schema = VML_ATTRS[el.name];
      switch (el.name) {
        case "v:shape":
          return parseShape(el);
        case "v:shapetype":
          return parseShapeType(el);
        case "v:rect":
          return parseRect(el);
        case "v:roundrect":
          return parseRoundRect(el);
        case "v:oval":
          return parseOval(el);
        case "v:line":
          return parseLine(el);
        case "v:polyline":
          return parsePolyline(el);
        case "v:curve":
          return parseCurve(el);
        case "v:arc":
          return parseArc(el);
        case "v:image":
          return parseImage(el);
        case "v:group":
          return parseGroup(el);
        case "v:background":
          return parseBackground(el);
        case "v:fill":
          return parseFill(el);
        case "v:stroke":
          return parseStroke(el);
        case "v:shadow":
          return parseShadow(el);
        case "v:textbox":
          return parseTextbox(el);
        case "v:textpath":
          return parseTextpath(el);
        case "v:imagedata":
          return parseImageData(el);
        case "v:formulas":
          return parseFormulas(el);
        case "v:f":
          return parseF(el);
        case "v:path":
          return parsePath(el);
        case "v:handles":
          return parseHandles(el);
        case "v:h":
          return parseH(el);
        case "o:OLEObject":
          return parseOLEObject(el);
        case "o:complex":
          return parseGeneric(el, schema);
        case "o:colormenu":
          return parseGeneric(el, schema);
        case "o:colormru":
          return parseGeneric(el, schema);
        case "o:diagram":
          return parseGeneric(el, schema);
        case "o:lock":
          return parseLock(el);
        case "o:bottom":
          return parseGeneric(el, schema);
        case "o:top":
          return parseGeneric(el, schema);
        case "o:left":
          return parseGeneric(el, schema);
        case "o:right":
          return parseGeneric(el, schema);
        case "o:column":
          return parseGeneric(el, schema);
        case "o:clippath":
          return parseGeneric(el, schema);
        case "o:fill":
          return parseGeneric(el, schema);
        case "o:rules":
          return parseGeneric(el, schema);
        case "o:r":
          return parseGeneric(el, schema);
        case "o:proxy":
          return parseGeneric(el, schema);
        case "o:regrouptable":
          return parseGeneric(el, schema);
        case "o:entry":
          return parseGeneric(el, schema);
        case "o:idmap":
          return parseIdMap(el);
        case "o:relationtable":
          return parseGeneric(el, schema);
        case "o:rel":
          return parseGeneric(el, schema);
        case "o:LockedField":
          return parseGeneric(el, schema);
        case "o:CustomDocumentProperties":
          return parseGeneric(el, schema);
        case "o:DocumentProperties":
          return parseGeneric(el, schema);
        case "o:signatureline":
          return parseGeneric(el, schema);
        default:
          return parseGeneric(el, schema || []);
      }
    }
    function pickAttrs(el, names) {
      const attrs = {}, extraAttrs = {};
      for (const k of Object.keys(el.attrs || {}))
        if (names.includes(k))
          attrs[k] = el.attrs[k];
        else
          extraAttrs[k] = el.attrs[k];
      return { attrs, extraAttrs };
    }
    function parseGeneric(el, names) {
      const { attrs, extraAttrs } = pickAttrs(el, names);
      return { kind: el.name, attrs, extraAttrs, children: el.children || [] };
    }
    function parseShape(el) {
      return parseGeneric(el, VML_ATTRS["v:shape"]);
    }
    function parseShapeType(el) {
      return parseGeneric(el, VML_ATTRS["v:shapetype"]);
    }
    function parseRect(el) {
      return parseGeneric(el, VML_ATTRS["v:rect"]);
    }
    function parseRoundRect(el) {
      return parseGeneric(el, VML_ATTRS["v:roundrect"]);
    }
    function parseOval(el) {
      return parseGeneric(el, VML_ATTRS["v:oval"]);
    }
    function parseLine(el) {
      return parseGeneric(el, VML_ATTRS["v:line"]);
    }
    function parsePolyline(el) {
      return parseGeneric(el, VML_ATTRS["v:polyline"]);
    }
    function parseCurve(el) {
      return parseGeneric(el, VML_ATTRS["v:curve"]);
    }
    function parseArc(el) {
      return parseGeneric(el, VML_ATTRS["v:arc"]);
    }
    function parseImage(el) {
      return parseGeneric(el, VML_ATTRS["v:image"]);
    }
    function parseGroup(el) {
      return parseGeneric(el, VML_ATTRS["v:group"]);
    }
    function parseBackground(el) {
      return parseGeneric(el, VML_ATTRS["v:background"]);
    }
    function parseFill(el) {
      return parseGeneric(el, VML_ATTRS["v:fill"]);
    }
    function parseStroke(el) {
      return parseGeneric(el, VML_ATTRS["v:stroke"]);
    }
    function parseShadow(el) {
      return parseGeneric(el, VML_ATTRS["v:shadow"]);
    }
    function parseTextbox(el) {
      return parseGeneric(el, VML_ATTRS["v:textbox"]);
    }
    function parseTextpath(el) {
      return parseGeneric(el, VML_ATTRS["v:textpath"]);
    }
    function parseImageData(el) {
      return parseGeneric(el, VML_ATTRS["v:imagedata"]);
    }
    function parseFormulas(el) {
      return parseGeneric(el, []);
    }
    function parseF(el) {
      return parseGeneric(el, VML_ATTRS["v:f"]);
    }
    function parsePath(el) {
      return parseGeneric(el, VML_ATTRS["v:path"]);
    }
    function parseHandles(el) {
      return parseGeneric(el, []);
    }
    function parseH(el) {
      return parseGeneric(el, VML_ATTRS["v:h"]);
    }
    function parseOLEObject(el) {
      return parseGeneric(el, VML_ATTRS["o:OLEObject"]);
    }
    function parseLock(el) {
      return parseGeneric(el, VML_ATTRS["o:lock"]);
    }
    function parseIdMap(el) {
      return parseGeneric(el, VML_ATTRS["o:idmap"]);
    }
    function renderElement(o) {
      if (!o || !o.kind)
        return null;
      switch (o.kind) {
        case "v:shape":
          return renderShape(o);
        case "v:shapetype":
          return renderShapeType(o);
        case "v:rect":
          return renderRect(o);
        case "v:roundrect":
          return renderRoundRect(o);
        case "v:oval":
          return renderOval(o);
        case "v:line":
          return renderLine(o);
        case "v:polyline":
          return renderPolyline(o);
        case "v:curve":
          return renderCurve(o);
        case "v:arc":
          return renderArc(o);
        case "v:image":
          return renderImage(o);
        case "v:group":
          return renderGroup(o);
        case "v:background":
          return renderBackground(o);
        case "v:fill":
          return renderFill(o);
        case "v:stroke":
          return renderStroke(o);
        case "v:shadow":
          return renderShadow(o);
        case "v:textbox":
          return renderTextbox(o);
        case "v:textpath":
          return renderTextpath(o);
        case "v:imagedata":
          return renderImageData(o);
        case "v:formulas":
          return renderFormulas(o);
        case "v:f":
          return renderF(o);
        case "v:path":
          return renderPath(o);
        case "v:handles":
          return renderHandles(o);
        case "v:h":
          return renderH(o);
        case "o:OLEObject":
          return renderOLEObject(o);
        case "o:complex":
          return xml.el("o:complex", mergeAttrs(o), o.children || []);
        case "o:colormenu":
          return xml.el("o:colormenu", mergeAttrs(o), o.children || []);
        case "o:colormru":
          return xml.el("o:colormru", mergeAttrs(o), o.children || []);
        case "o:diagram":
          return xml.el("o:diagram", mergeAttrs(o), o.children || []);
        case "o:lock":
          return renderLock(o);
        case "o:bottom":
          return xml.el("o:bottom", mergeAttrs(o), o.children || []);
        case "o:top":
          return xml.el("o:top", mergeAttrs(o), o.children || []);
        case "o:left":
          return xml.el("o:left", mergeAttrs(o), o.children || []);
        case "o:right":
          return xml.el("o:right", mergeAttrs(o), o.children || []);
        case "o:column":
          return xml.el("o:column", mergeAttrs(o), o.children || []);
        case "o:clippath":
          return xml.el("o:clippath", mergeAttrs(o), o.children || []);
        case "o:fill":
          return xml.el("o:fill", mergeAttrs(o), o.children || []);
        case "o:rules":
          return xml.el("o:rules", mergeAttrs(o), o.children || []);
        case "o:r":
          return xml.el("o:r", mergeAttrs(o), o.children || []);
        case "o:proxy":
          return xml.el("o:proxy", mergeAttrs(o), o.children || []);
        case "o:regrouptable":
          return xml.el("o:regrouptable", mergeAttrs(o), o.children || []);
        case "o:entry":
          return xml.el("o:entry", mergeAttrs(o), o.children || []);
        case "o:idmap":
          return renderIdMap(o);
        case "o:relationtable":
          return xml.el("o:relationtable", mergeAttrs(o), o.children || []);
        case "o:rel":
          return xml.el("o:rel", mergeAttrs(o), o.children || []);
        case "o:LockedField":
          return xml.el("o:LockedField", mergeAttrs(o), o.children || []);
        case "o:CustomDocumentProperties":
          return xml.el("o:CustomDocumentProperties", mergeAttrs(o), o.children || []);
        case "o:DocumentProperties":
          return xml.el("o:DocumentProperties", mergeAttrs(o), o.children || []);
        case "o:signatureline":
          return xml.el("o:signatureline", mergeAttrs(o), o.children || []);
        default:
          return xml.el(o.kind, mergeAttrs(o), o.children || []);
      }
    }
    function mergeAttrs(o) {
      const out = {}, a = o.attrs || {};
      for (const k of Object.keys(a))
        if (a[k] != null)
          out[k] = String(a[k]);
      const e = o.extraAttrs || {};
      for (const k of Object.keys(e))
        if (e[k] != null && out[k] == null)
          out[k] = String(e[k]);
      return out;
    }
    function renderShape(o) {
      return xml.el("v:shape", mergeAttrs(o), o.children || []);
    }
    function renderShapeType(o) {
      return xml.el("v:shapetype", mergeAttrs(o), o.children || []);
    }
    function renderRect(o) {
      return xml.el("v:rect", mergeAttrs(o), o.children || []);
    }
    function renderRoundRect(o) {
      return xml.el("v:roundrect", mergeAttrs(o), o.children || []);
    }
    function renderOval(o) {
      return xml.el("v:oval", mergeAttrs(o), o.children || []);
    }
    function renderLine(o) {
      return xml.el("v:line", mergeAttrs(o), o.children || []);
    }
    function renderPolyline(o) {
      return xml.el("v:polyline", mergeAttrs(o), o.children || []);
    }
    function renderCurve(o) {
      return xml.el("v:curve", mergeAttrs(o), o.children || []);
    }
    function renderArc(o) {
      return xml.el("v:arc", mergeAttrs(o), o.children || []);
    }
    function renderImage(o) {
      return xml.el("v:image", mergeAttrs(o), o.children || []);
    }
    function renderGroup(o) {
      return xml.el("v:group", mergeAttrs(o), o.children || []);
    }
    function renderBackground(o) {
      return xml.el("v:background", mergeAttrs(o), o.children || []);
    }
    function renderFill(o) {
      return xml.el("v:fill", mergeAttrs(o), o.children || []);
    }
    function renderStroke(o) {
      return xml.el("v:stroke", mergeAttrs(o), o.children || []);
    }
    function renderShadow(o) {
      return xml.el("v:shadow", mergeAttrs(o), o.children || []);
    }
    function renderTextbox(o) {
      return xml.el("v:textbox", mergeAttrs(o), o.children || []);
    }
    function renderTextpath(o) {
      return xml.el("v:textpath", mergeAttrs(o), o.children || []);
    }
    function renderImageData(o) {
      return xml.el("v:imagedata", mergeAttrs(o), o.children || []);
    }
    function renderFormulas(o) {
      return xml.el("v:formulas", mergeAttrs(o), o.children || []);
    }
    function renderF(o) {
      return xml.el("v:f", mergeAttrs(o), o.children || []);
    }
    function renderPath(o) {
      return xml.el("v:path", mergeAttrs(o), o.children || []);
    }
    function renderHandles(o) {
      return xml.el("v:handles", mergeAttrs(o), o.children || []);
    }
    function renderH(o) {
      return xml.el("v:h", mergeAttrs(o), o.children || []);
    }
    function renderOLEObject(o) {
      return xml.el("o:OLEObject", mergeAttrs(o), o.children || []);
    }
    function renderLock(o) {
      return xml.el("o:lock", mergeAttrs(o), o.children || []);
    }
    function renderIdMap(o) {
      return xml.el("o:idmap", mergeAttrs(o), o.children || []);
    }
    function parseVml(text) {
      return xml.parse(text);
    }
    function renderVml(node) {
      return xml.serialize(node);
    }
    return {
      VML_TAGS,
      VML_ATTRS,
      parseElement,
      renderElement,
      parseVml,
      renderVml
    };
  } });
    __register({ name: "smlMisc", dependencies: ["xml"], factory: function(xml) {
    const ELEMENTS = ["DataBinding", "Map", "MapInfo", "Schema", "anchor", "autoSortScope", "bk", "bottom", "cacheField", "cacheHierarchies", "cacheHierarchy", "calcChain", "calcPr", "calculatedColumnFormula", "calculatedItem", "calculatedItems", "calculatedMember", "calculatedMembers", "cell", "cellMetadata", "cellSmartTag", "cellSmartTagPr", "cellSmartTags", "cellWatch", "cellWatches", "chartFormat", "chartFormats", "chartsheet", "colBreaks", "colFields", "colHierarchiesUsage", "colHierarchyUsage", "colItems", "colorFilter", "colors", "commentPr", "condense", "conditionalFormat", "conditionalFormats", "connection", "connections", "consolidation", "control", "controlPr", "controls", "customFilter", "customFilters", "customPr", "customProperties", "customSheetView", "customSheetViews", "customWorkbookView", "d", "dataConsolidate", "dataField", "dataFields", "dataRef", "dataRefs", "dateGroupItem", "dbPr", "ddeItem", "ddeItems", "ddeLink", "deletedField", "diagonal", "dialogsheet", "dimensions", "discretePr", "drawingHF", "dynamicFilter", "e", "end", "entries", "evenFooter", "evenHeader", "ext", "extLst", "extend", "externalBook", "externalLink", "externalReference", "externalReferences", "field", "fieldGroup", "fieldUsage", "fieldsUsage", "fileRecoveryPr", "fileSharing", "fileVersion", "filter", "filterColumn", "filters", "firstFooter", "firstHeader", "format", "formats", "functionGroup", "functionGroups", "futureMetadata", "group", "header", "headers", "horizontal", "iconFilter", "ignoredError", "ignoredErrors", "indexedColors", "inputCells", "k", "main", "mdx", "mdxMetadata", "member", "members", "metadata", "metadataStrings", "metadataType", "metadataTypes", "mp", "mpMap", "mps", "mruColors", "ms", "nc", "ndxf", "oc", "odxf", "olapPr", "oldFormula", "oleItem", "oleItems", "oleLink", "outline", "p", "parameter", "parameters", "picture", "pivotSelection", "query", "queryCache", "queryTable", "queryTableDeletedFields", "queryTableField", "queryTableFields", "queryTableRefresh", "rPh", "raf", "rc", "rcc", "rcft", "rcmt", "rcv", "rdn", "reviewed", "reviewedList", "revisions", "rfmt", "rgbColor", "ris", "rm", "rqt", "rrc", "rsnm", "scenario", "scenarios", "securityDescriptor", "selection", "serverFormat", "serverFormats", "set", "sets", "shadow", "sheetDataSet", "sheetId", "sheetIdMap", "sheetName", "sheetNames", "singleXmlCell", "singleXmlCells", "smartTags", "sortByTuple", "sortCondition", "sortState", "start", "stop", "stp", "tableStyle", "tableStyleElement", "tables", "textField", "textFields", "textPr", "top", "top10", "totalsRowFormula", "tp", "tpl", "tpls", "tr", "tupleCache", "undo", "userInfo", "users", "val", "value", "valueMetadata", "values", "vertical", "volType", "volTypes", "webPr", "webPublishItem", "webPublishItems", "workbookPr", "xmlCellPr", "xmlColumnPr", "xmlPr"];
    function parseElement(el) {
      if (!el || el.type !== "element")
        return null;
      switch (el.name) {
        case "DataBinding":
          return { _passthrough: !0, kind: "DataBinding", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "Map":
          return { _passthrough: !0, kind: "Map", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "MapInfo":
          return { _passthrough: !0, kind: "MapInfo", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "Schema":
          return { _passthrough: !0, kind: "Schema", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "anchor":
          return { _passthrough: !0, kind: "anchor", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "autoSortScope":
          return { _passthrough: !0, kind: "autoSortScope", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "bk":
          return { _passthrough: !0, kind: "bk", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "bottom":
          return { _passthrough: !0, kind: "bottom", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "cacheField":
          return { _passthrough: !0, kind: "cacheField", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "cacheHierarchies":
          return { _passthrough: !0, kind: "cacheHierarchies", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "cacheHierarchy":
          return { _passthrough: !0, kind: "cacheHierarchy", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "calcChain":
          return { _passthrough: !0, kind: "calcChain", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "calcPr":
          return { _passthrough: !0, kind: "calcPr", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "calculatedColumnFormula":
          return { _passthrough: !0, kind: "calculatedColumnFormula", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "calculatedItem":
          return { _passthrough: !0, kind: "calculatedItem", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "calculatedItems":
          return { _passthrough: !0, kind: "calculatedItems", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "calculatedMember":
          return { _passthrough: !0, kind: "calculatedMember", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "calculatedMembers":
          return { _passthrough: !0, kind: "calculatedMembers", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "cell":
          return { _passthrough: !0, kind: "cell", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "cellMetadata":
          return { _passthrough: !0, kind: "cellMetadata", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "cellSmartTag":
          return { _passthrough: !0, kind: "cellSmartTag", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "cellSmartTagPr":
          return { _passthrough: !0, kind: "cellSmartTagPr", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "cellSmartTags":
          return { _passthrough: !0, kind: "cellSmartTags", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "cellWatch":
          return { _passthrough: !0, kind: "cellWatch", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "cellWatches":
          return { _passthrough: !0, kind: "cellWatches", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "chartFormat":
          return { _passthrough: !0, kind: "chartFormat", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "chartFormats":
          return { _passthrough: !0, kind: "chartFormats", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "chartsheet":
          return { _passthrough: !0, kind: "chartsheet", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "colBreaks":
          return { _passthrough: !0, kind: "colBreaks", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "colFields":
          return { _passthrough: !0, kind: "colFields", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "colHierarchiesUsage":
          return { _passthrough: !0, kind: "colHierarchiesUsage", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "colHierarchyUsage":
          return { _passthrough: !0, kind: "colHierarchyUsage", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "colItems":
          return { _passthrough: !0, kind: "colItems", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "colorFilter":
          return { _passthrough: !0, kind: "colorFilter", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "colors":
          return { _passthrough: !0, kind: "colors", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "commentPr":
          return { _passthrough: !0, kind: "commentPr", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "condense":
          return { _passthrough: !0, kind: "condense", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "conditionalFormat":
          return { _passthrough: !0, kind: "conditionalFormat", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "conditionalFormats":
          return { _passthrough: !0, kind: "conditionalFormats", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "connection":
          return { _passthrough: !0, kind: "connection", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "connections":
          return { _passthrough: !0, kind: "connections", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "consolidation":
          return { _passthrough: !0, kind: "consolidation", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "control":
          return { _passthrough: !0, kind: "control", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "controlPr":
          return { _passthrough: !0, kind: "controlPr", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "controls":
          return { _passthrough: !0, kind: "controls", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "customFilter":
          return { _passthrough: !0, kind: "customFilter", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "customFilters":
          return { _passthrough: !0, kind: "customFilters", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "customPr":
          return { _passthrough: !0, kind: "customPr", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "customProperties":
          return { _passthrough: !0, kind: "customProperties", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "customSheetView":
          return { _passthrough: !0, kind: "customSheetView", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "customSheetViews":
          return { _passthrough: !0, kind: "customSheetViews", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "customWorkbookView":
          return { _passthrough: !0, kind: "customWorkbookView", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "d":
          return { _passthrough: !0, kind: "d", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "dataConsolidate":
          return { _passthrough: !0, kind: "dataConsolidate", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "dataField":
          return { _passthrough: !0, kind: "dataField", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "dataFields":
          return { _passthrough: !0, kind: "dataFields", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "dataRef":
          return { _passthrough: !0, kind: "dataRef", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "dataRefs":
          return { _passthrough: !0, kind: "dataRefs", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "dateGroupItem":
          return { _passthrough: !0, kind: "dateGroupItem", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "dbPr":
          return { _passthrough: !0, kind: "dbPr", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "ddeItem":
          return { _passthrough: !0, kind: "ddeItem", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "ddeItems":
          return { _passthrough: !0, kind: "ddeItems", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "ddeLink":
          return { _passthrough: !0, kind: "ddeLink", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "deletedField":
          return { _passthrough: !0, kind: "deletedField", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "diagonal":
          return { _passthrough: !0, kind: "diagonal", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "dialogsheet":
          return { _passthrough: !0, kind: "dialogsheet", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "dimensions":
          return { _passthrough: !0, kind: "dimensions", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "discretePr":
          return { _passthrough: !0, kind: "discretePr", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "drawingHF":
          return { _passthrough: !0, kind: "drawingHF", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "dynamicFilter":
          return { _passthrough: !0, kind: "dynamicFilter", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "e":
          return { _passthrough: !0, kind: "e", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "end":
          return { _passthrough: !0, kind: "end", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "entries":
          return { _passthrough: !0, kind: "entries", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "evenFooter":
          return { _passthrough: !0, kind: "evenFooter", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "evenHeader":
          return { _passthrough: !0, kind: "evenHeader", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "ext":
          return { _passthrough: !0, kind: "ext", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "extLst":
          return { _passthrough: !0, kind: "extLst", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "extend":
          return { _passthrough: !0, kind: "extend", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "externalBook":
          return { _passthrough: !0, kind: "externalBook", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "externalLink":
          return { _passthrough: !0, kind: "externalLink", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "externalReference":
          return { _passthrough: !0, kind: "externalReference", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "externalReferences":
          return { _passthrough: !0, kind: "externalReferences", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "field":
          return { _passthrough: !0, kind: "field", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "fieldGroup":
          return { _passthrough: !0, kind: "fieldGroup", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "fieldUsage":
          return { _passthrough: !0, kind: "fieldUsage", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "fieldsUsage":
          return { _passthrough: !0, kind: "fieldsUsage", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "fileRecoveryPr":
          return { _passthrough: !0, kind: "fileRecoveryPr", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "fileSharing":
          return { _passthrough: !0, kind: "fileSharing", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "fileVersion":
          return { _passthrough: !0, kind: "fileVersion", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "filter":
          return { _passthrough: !0, kind: "filter", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "filterColumn":
          return { _passthrough: !0, kind: "filterColumn", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "filters":
          return { _passthrough: !0, kind: "filters", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "firstFooter":
          return { _passthrough: !0, kind: "firstFooter", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "firstHeader":
          return { _passthrough: !0, kind: "firstHeader", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "format":
          return { _passthrough: !0, kind: "format", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "formats":
          return { _passthrough: !0, kind: "formats", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "functionGroup":
          return { _passthrough: !0, kind: "functionGroup", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "functionGroups":
          return { _passthrough: !0, kind: "functionGroups", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "futureMetadata":
          return { _passthrough: !0, kind: "futureMetadata", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "group":
          return { _passthrough: !0, kind: "group", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "header":
          return { _passthrough: !0, kind: "header", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "headers":
          return { _passthrough: !0, kind: "headers", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "horizontal":
          return { _passthrough: !0, kind: "horizontal", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "iconFilter":
          return { _passthrough: !0, kind: "iconFilter", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "ignoredError":
          return { _passthrough: !0, kind: "ignoredError", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "ignoredErrors":
          return { _passthrough: !0, kind: "ignoredErrors", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "indexedColors":
          return { _passthrough: !0, kind: "indexedColors", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "inputCells":
          return { _passthrough: !0, kind: "inputCells", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "k":
          return { _passthrough: !0, kind: "k", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "main":
          return { _passthrough: !0, kind: "main", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "mdx":
          return { _passthrough: !0, kind: "mdx", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "mdxMetadata":
          return { _passthrough: !0, kind: "mdxMetadata", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "member":
          return { _passthrough: !0, kind: "member", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "members":
          return { _passthrough: !0, kind: "members", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "metadata":
          return { _passthrough: !0, kind: "metadata", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "metadataStrings":
          return { _passthrough: !0, kind: "metadataStrings", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "metadataType":
          return { _passthrough: !0, kind: "metadataType", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "metadataTypes":
          return { _passthrough: !0, kind: "metadataTypes", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "mp":
          return { _passthrough: !0, kind: "mp", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "mpMap":
          return { _passthrough: !0, kind: "mpMap", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "mps":
          return { _passthrough: !0, kind: "mps", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "mruColors":
          return { _passthrough: !0, kind: "mruColors", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "ms":
          return { _passthrough: !0, kind: "ms", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "nc":
          return { _passthrough: !0, kind: "nc", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "ndxf":
          return { _passthrough: !0, kind: "ndxf", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "oc":
          return { _passthrough: !0, kind: "oc", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "odxf":
          return { _passthrough: !0, kind: "odxf", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "olapPr":
          return { _passthrough: !0, kind: "olapPr", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "oldFormula":
          return { _passthrough: !0, kind: "oldFormula", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "oleItem":
          return { _passthrough: !0, kind: "oleItem", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "oleItems":
          return { _passthrough: !0, kind: "oleItems", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "oleLink":
          return { _passthrough: !0, kind: "oleLink", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "outline":
          return { _passthrough: !0, kind: "outline", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "p":
          return { _passthrough: !0, kind: "p", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "parameter":
          return { _passthrough: !0, kind: "parameter", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "parameters":
          return { _passthrough: !0, kind: "parameters", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "picture":
          return { _passthrough: !0, kind: "picture", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "pivotSelection":
          return { _passthrough: !0, kind: "pivotSelection", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "query":
          return { _passthrough: !0, kind: "query", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "queryCache":
          return { _passthrough: !0, kind: "queryCache", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "queryTable":
          return { _passthrough: !0, kind: "queryTable", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "queryTableDeletedFields":
          return { _passthrough: !0, kind: "queryTableDeletedFields", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "queryTableField":
          return { _passthrough: !0, kind: "queryTableField", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "queryTableFields":
          return { _passthrough: !0, kind: "queryTableFields", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "queryTableRefresh":
          return { _passthrough: !0, kind: "queryTableRefresh", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "rPh":
          return { _passthrough: !0, kind: "rPh", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "raf":
          return { _passthrough: !0, kind: "raf", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "rc":
          return { _passthrough: !0, kind: "rc", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "rcc":
          return { _passthrough: !0, kind: "rcc", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "rcft":
          return { _passthrough: !0, kind: "rcft", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "rcmt":
          return { _passthrough: !0, kind: "rcmt", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "rcv":
          return { _passthrough: !0, kind: "rcv", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "rdn":
          return { _passthrough: !0, kind: "rdn", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "reviewed":
          return { _passthrough: !0, kind: "reviewed", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "reviewedList":
          return { _passthrough: !0, kind: "reviewedList", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "revisions":
          return { _passthrough: !0, kind: "revisions", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "rfmt":
          return { _passthrough: !0, kind: "rfmt", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "rgbColor":
          return { _passthrough: !0, kind: "rgbColor", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "ris":
          return { _passthrough: !0, kind: "ris", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "rm":
          return { _passthrough: !0, kind: "rm", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "rqt":
          return { _passthrough: !0, kind: "rqt", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "rrc":
          return { _passthrough: !0, kind: "rrc", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "rsnm":
          return { _passthrough: !0, kind: "rsnm", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "scenario":
          return { _passthrough: !0, kind: "scenario", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "scenarios":
          return { _passthrough: !0, kind: "scenarios", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "securityDescriptor":
          return { _passthrough: !0, kind: "securityDescriptor", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "selection":
          return { _passthrough: !0, kind: "selection", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "serverFormat":
          return { _passthrough: !0, kind: "serverFormat", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "serverFormats":
          return { _passthrough: !0, kind: "serverFormats", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "set":
          return { _passthrough: !0, kind: "set", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "sets":
          return { _passthrough: !0, kind: "sets", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "shadow":
          return { _passthrough: !0, kind: "shadow", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "sheetDataSet":
          return { _passthrough: !0, kind: "sheetDataSet", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "sheetId":
          return { _passthrough: !0, kind: "sheetId", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "sheetIdMap":
          return { _passthrough: !0, kind: "sheetIdMap", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "sheetName":
          return { _passthrough: !0, kind: "sheetName", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "sheetNames":
          return { _passthrough: !0, kind: "sheetNames", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "singleXmlCell":
          return { _passthrough: !0, kind: "singleXmlCell", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "singleXmlCells":
          return { _passthrough: !0, kind: "singleXmlCells", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "smartTags":
          return { _passthrough: !0, kind: "smartTags", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "sortByTuple":
          return { _passthrough: !0, kind: "sortByTuple", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "sortCondition":
          return { _passthrough: !0, kind: "sortCondition", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "sortState":
          return { _passthrough: !0, kind: "sortState", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "start":
          return { _passthrough: !0, kind: "start", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "stop":
          return { _passthrough: !0, kind: "stop", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "stp":
          return { _passthrough: !0, kind: "stp", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "tableStyle":
          return { _passthrough: !0, kind: "tableStyle", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "tableStyleElement":
          return { _passthrough: !0, kind: "tableStyleElement", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "tables":
          return { _passthrough: !0, kind: "tables", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "textField":
          return { _passthrough: !0, kind: "textField", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "textFields":
          return { _passthrough: !0, kind: "textFields", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "textPr":
          return { _passthrough: !0, kind: "textPr", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "top":
          return { _passthrough: !0, kind: "top", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "top10":
          return { _passthrough: !0, kind: "top10", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "totalsRowFormula":
          return { _passthrough: !0, kind: "totalsRowFormula", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "tp":
          return { _passthrough: !0, kind: "tp", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "tpl":
          return { _passthrough: !0, kind: "tpl", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "tpls":
          return { _passthrough: !0, kind: "tpls", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "tr":
          return { _passthrough: !0, kind: "tr", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "tupleCache":
          return { _passthrough: !0, kind: "tupleCache", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "undo":
          return { _passthrough: !0, kind: "undo", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "userInfo":
          return { _passthrough: !0, kind: "userInfo", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "users":
          return { _passthrough: !0, kind: "users", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "val":
          return { _passthrough: !0, kind: "val", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "value":
          return { _passthrough: !0, kind: "value", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "valueMetadata":
          return { _passthrough: !0, kind: "valueMetadata", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "values":
          return { _passthrough: !0, kind: "values", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "vertical":
          return { _passthrough: !0, kind: "vertical", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "volType":
          return { _passthrough: !0, kind: "volType", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "volTypes":
          return { _passthrough: !0, kind: "volTypes", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "webPr":
          return { _passthrough: !0, kind: "webPr", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "webPublishItem":
          return { _passthrough: !0, kind: "webPublishItem", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "webPublishItems":
          return { _passthrough: !0, kind: "webPublishItems", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "workbookPr":
          return { _passthrough: !0, kind: "workbookPr", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "xmlCellPr":
          return { _passthrough: !0, kind: "xmlCellPr", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "xmlColumnPr":
          return { _passthrough: !0, kind: "xmlColumnPr", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "xmlPr":
          return { _passthrough: !0, kind: "xmlPr", attrs: { ...el.attrs }, children: [...el.children || []] };
        default:
          return null;
      }
    }
    function renderElement(obj) {
      if (!obj || !obj.kind)
        return null;
      switch (obj.kind) {
        case "DataBinding":
          return xml.el("DataBinding", obj.attrs || {}, obj.children || []);
        case "Map":
          return xml.el("Map", obj.attrs || {}, obj.children || []);
        case "MapInfo":
          return xml.el("MapInfo", obj.attrs || {}, obj.children || []);
        case "Schema":
          return xml.el("Schema", obj.attrs || {}, obj.children || []);
        case "anchor":
          return xml.el("anchor", obj.attrs || {}, obj.children || []);
        case "autoSortScope":
          return xml.el("autoSortScope", obj.attrs || {}, obj.children || []);
        case "bk":
          return xml.el("bk", obj.attrs || {}, obj.children || []);
        case "bottom":
          return xml.el("bottom", obj.attrs || {}, obj.children || []);
        case "cacheField":
          return xml.el("cacheField", obj.attrs || {}, obj.children || []);
        case "cacheHierarchies":
          return xml.el("cacheHierarchies", obj.attrs || {}, obj.children || []);
        case "cacheHierarchy":
          return xml.el("cacheHierarchy", obj.attrs || {}, obj.children || []);
        case "calcChain":
          return xml.el("calcChain", obj.attrs || {}, obj.children || []);
        case "calcPr":
          return xml.el("calcPr", obj.attrs || {}, obj.children || []);
        case "calculatedColumnFormula":
          return xml.el("calculatedColumnFormula", obj.attrs || {}, obj.children || []);
        case "calculatedItem":
          return xml.el("calculatedItem", obj.attrs || {}, obj.children || []);
        case "calculatedItems":
          return xml.el("calculatedItems", obj.attrs || {}, obj.children || []);
        case "calculatedMember":
          return xml.el("calculatedMember", obj.attrs || {}, obj.children || []);
        case "calculatedMembers":
          return xml.el("calculatedMembers", obj.attrs || {}, obj.children || []);
        case "cell":
          return xml.el("cell", obj.attrs || {}, obj.children || []);
        case "cellMetadata":
          return xml.el("cellMetadata", obj.attrs || {}, obj.children || []);
        case "cellSmartTag":
          return xml.el("cellSmartTag", obj.attrs || {}, obj.children || []);
        case "cellSmartTagPr":
          return xml.el("cellSmartTagPr", obj.attrs || {}, obj.children || []);
        case "cellSmartTags":
          return xml.el("cellSmartTags", obj.attrs || {}, obj.children || []);
        case "cellWatch":
          return xml.el("cellWatch", obj.attrs || {}, obj.children || []);
        case "cellWatches":
          return xml.el("cellWatches", obj.attrs || {}, obj.children || []);
        case "chartFormat":
          return xml.el("chartFormat", obj.attrs || {}, obj.children || []);
        case "chartFormats":
          return xml.el("chartFormats", obj.attrs || {}, obj.children || []);
        case "chartsheet":
          return xml.el("chartsheet", obj.attrs || {}, obj.children || []);
        case "colBreaks":
          return xml.el("colBreaks", obj.attrs || {}, obj.children || []);
        case "colFields":
          return xml.el("colFields", obj.attrs || {}, obj.children || []);
        case "colHierarchiesUsage":
          return xml.el("colHierarchiesUsage", obj.attrs || {}, obj.children || []);
        case "colHierarchyUsage":
          return xml.el("colHierarchyUsage", obj.attrs || {}, obj.children || []);
        case "colItems":
          return xml.el("colItems", obj.attrs || {}, obj.children || []);
        case "colorFilter":
          return xml.el("colorFilter", obj.attrs || {}, obj.children || []);
        case "colors":
          return xml.el("colors", obj.attrs || {}, obj.children || []);
        case "commentPr":
          return xml.el("commentPr", obj.attrs || {}, obj.children || []);
        case "condense":
          return xml.el("condense", obj.attrs || {}, obj.children || []);
        case "conditionalFormat":
          return xml.el("conditionalFormat", obj.attrs || {}, obj.children || []);
        case "conditionalFormats":
          return xml.el("conditionalFormats", obj.attrs || {}, obj.children || []);
        case "connection":
          return xml.el("connection", obj.attrs || {}, obj.children || []);
        case "connections":
          return xml.el("connections", obj.attrs || {}, obj.children || []);
        case "consolidation":
          return xml.el("consolidation", obj.attrs || {}, obj.children || []);
        case "control":
          return xml.el("control", obj.attrs || {}, obj.children || []);
        case "controlPr":
          return xml.el("controlPr", obj.attrs || {}, obj.children || []);
        case "controls":
          return xml.el("controls", obj.attrs || {}, obj.children || []);
        case "customFilter":
          return xml.el("customFilter", obj.attrs || {}, obj.children || []);
        case "customFilters":
          return xml.el("customFilters", obj.attrs || {}, obj.children || []);
        case "customPr":
          return xml.el("customPr", obj.attrs || {}, obj.children || []);
        case "customProperties":
          return xml.el("customProperties", obj.attrs || {}, obj.children || []);
        case "customSheetView":
          return xml.el("customSheetView", obj.attrs || {}, obj.children || []);
        case "customSheetViews":
          return xml.el("customSheetViews", obj.attrs || {}, obj.children || []);
        case "customWorkbookView":
          return xml.el("customWorkbookView", obj.attrs || {}, obj.children || []);
        case "d":
          return xml.el("d", obj.attrs || {}, obj.children || []);
        case "dataConsolidate":
          return xml.el("dataConsolidate", obj.attrs || {}, obj.children || []);
        case "dataField":
          return xml.el("dataField", obj.attrs || {}, obj.children || []);
        case "dataFields":
          return xml.el("dataFields", obj.attrs || {}, obj.children || []);
        case "dataRef":
          return xml.el("dataRef", obj.attrs || {}, obj.children || []);
        case "dataRefs":
          return xml.el("dataRefs", obj.attrs || {}, obj.children || []);
        case "dateGroupItem":
          return xml.el("dateGroupItem", obj.attrs || {}, obj.children || []);
        case "dbPr":
          return xml.el("dbPr", obj.attrs || {}, obj.children || []);
        case "ddeItem":
          return xml.el("ddeItem", obj.attrs || {}, obj.children || []);
        case "ddeItems":
          return xml.el("ddeItems", obj.attrs || {}, obj.children || []);
        case "ddeLink":
          return xml.el("ddeLink", obj.attrs || {}, obj.children || []);
        case "deletedField":
          return xml.el("deletedField", obj.attrs || {}, obj.children || []);
        case "diagonal":
          return xml.el("diagonal", obj.attrs || {}, obj.children || []);
        case "dialogsheet":
          return xml.el("dialogsheet", obj.attrs || {}, obj.children || []);
        case "dimensions":
          return xml.el("dimensions", obj.attrs || {}, obj.children || []);
        case "discretePr":
          return xml.el("discretePr", obj.attrs || {}, obj.children || []);
        case "drawingHF":
          return xml.el("drawingHF", obj.attrs || {}, obj.children || []);
        case "dynamicFilter":
          return xml.el("dynamicFilter", obj.attrs || {}, obj.children || []);
        case "e":
          return xml.el("e", obj.attrs || {}, obj.children || []);
        case "end":
          return xml.el("end", obj.attrs || {}, obj.children || []);
        case "entries":
          return xml.el("entries", obj.attrs || {}, obj.children || []);
        case "evenFooter":
          return xml.el("evenFooter", obj.attrs || {}, obj.children || []);
        case "evenHeader":
          return xml.el("evenHeader", obj.attrs || {}, obj.children || []);
        case "ext":
          return xml.el("ext", obj.attrs || {}, obj.children || []);
        case "extLst":
          return xml.el("extLst", obj.attrs || {}, obj.children || []);
        case "extend":
          return xml.el("extend", obj.attrs || {}, obj.children || []);
        case "externalBook":
          return xml.el("externalBook", obj.attrs || {}, obj.children || []);
        case "externalLink":
          return xml.el("externalLink", obj.attrs || {}, obj.children || []);
        case "externalReference":
          return xml.el("externalReference", obj.attrs || {}, obj.children || []);
        case "externalReferences":
          return xml.el("externalReferences", obj.attrs || {}, obj.children || []);
        case "field":
          return xml.el("field", obj.attrs || {}, obj.children || []);
        case "fieldGroup":
          return xml.el("fieldGroup", obj.attrs || {}, obj.children || []);
        case "fieldUsage":
          return xml.el("fieldUsage", obj.attrs || {}, obj.children || []);
        case "fieldsUsage":
          return xml.el("fieldsUsage", obj.attrs || {}, obj.children || []);
        case "fileRecoveryPr":
          return xml.el("fileRecoveryPr", obj.attrs || {}, obj.children || []);
        case "fileSharing":
          return xml.el("fileSharing", obj.attrs || {}, obj.children || []);
        case "fileVersion":
          return xml.el("fileVersion", obj.attrs || {}, obj.children || []);
        case "filter":
          return xml.el("filter", obj.attrs || {}, obj.children || []);
        case "filterColumn":
          return xml.el("filterColumn", obj.attrs || {}, obj.children || []);
        case "filters":
          return xml.el("filters", obj.attrs || {}, obj.children || []);
        case "firstFooter":
          return xml.el("firstFooter", obj.attrs || {}, obj.children || []);
        case "firstHeader":
          return xml.el("firstHeader", obj.attrs || {}, obj.children || []);
        case "format":
          return xml.el("format", obj.attrs || {}, obj.children || []);
        case "formats":
          return xml.el("formats", obj.attrs || {}, obj.children || []);
        case "functionGroup":
          return xml.el("functionGroup", obj.attrs || {}, obj.children || []);
        case "functionGroups":
          return xml.el("functionGroups", obj.attrs || {}, obj.children || []);
        case "futureMetadata":
          return xml.el("futureMetadata", obj.attrs || {}, obj.children || []);
        case "group":
          return xml.el("group", obj.attrs || {}, obj.children || []);
        case "header":
          return xml.el("header", obj.attrs || {}, obj.children || []);
        case "headers":
          return xml.el("headers", obj.attrs || {}, obj.children || []);
        case "horizontal":
          return xml.el("horizontal", obj.attrs || {}, obj.children || []);
        case "iconFilter":
          return xml.el("iconFilter", obj.attrs || {}, obj.children || []);
        case "ignoredError":
          return xml.el("ignoredError", obj.attrs || {}, obj.children || []);
        case "ignoredErrors":
          return xml.el("ignoredErrors", obj.attrs || {}, obj.children || []);
        case "indexedColors":
          return xml.el("indexedColors", obj.attrs || {}, obj.children || []);
        case "inputCells":
          return xml.el("inputCells", obj.attrs || {}, obj.children || []);
        case "k":
          return xml.el("k", obj.attrs || {}, obj.children || []);
        case "main":
          return xml.el("main", obj.attrs || {}, obj.children || []);
        case "mdx":
          return xml.el("mdx", obj.attrs || {}, obj.children || []);
        case "mdxMetadata":
          return xml.el("mdxMetadata", obj.attrs || {}, obj.children || []);
        case "member":
          return xml.el("member", obj.attrs || {}, obj.children || []);
        case "members":
          return xml.el("members", obj.attrs || {}, obj.children || []);
        case "metadata":
          return xml.el("metadata", obj.attrs || {}, obj.children || []);
        case "metadataStrings":
          return xml.el("metadataStrings", obj.attrs || {}, obj.children || []);
        case "metadataType":
          return xml.el("metadataType", obj.attrs || {}, obj.children || []);
        case "metadataTypes":
          return xml.el("metadataTypes", obj.attrs || {}, obj.children || []);
        case "mp":
          return xml.el("mp", obj.attrs || {}, obj.children || []);
        case "mpMap":
          return xml.el("mpMap", obj.attrs || {}, obj.children || []);
        case "mps":
          return xml.el("mps", obj.attrs || {}, obj.children || []);
        case "mruColors":
          return xml.el("mruColors", obj.attrs || {}, obj.children || []);
        case "ms":
          return xml.el("ms", obj.attrs || {}, obj.children || []);
        case "nc":
          return xml.el("nc", obj.attrs || {}, obj.children || []);
        case "ndxf":
          return xml.el("ndxf", obj.attrs || {}, obj.children || []);
        case "oc":
          return xml.el("oc", obj.attrs || {}, obj.children || []);
        case "odxf":
          return xml.el("odxf", obj.attrs || {}, obj.children || []);
        case "olapPr":
          return xml.el("olapPr", obj.attrs || {}, obj.children || []);
        case "oldFormula":
          return xml.el("oldFormula", obj.attrs || {}, obj.children || []);
        case "oleItem":
          return xml.el("oleItem", obj.attrs || {}, obj.children || []);
        case "oleItems":
          return xml.el("oleItems", obj.attrs || {}, obj.children || []);
        case "oleLink":
          return xml.el("oleLink", obj.attrs || {}, obj.children || []);
        case "outline":
          return xml.el("outline", obj.attrs || {}, obj.children || []);
        case "p":
          return xml.el("p", obj.attrs || {}, obj.children || []);
        case "parameter":
          return xml.el("parameter", obj.attrs || {}, obj.children || []);
        case "parameters":
          return xml.el("parameters", obj.attrs || {}, obj.children || []);
        case "picture":
          return xml.el("picture", obj.attrs || {}, obj.children || []);
        case "pivotSelection":
          return xml.el("pivotSelection", obj.attrs || {}, obj.children || []);
        case "query":
          return xml.el("query", obj.attrs || {}, obj.children || []);
        case "queryCache":
          return xml.el("queryCache", obj.attrs || {}, obj.children || []);
        case "queryTable":
          return xml.el("queryTable", obj.attrs || {}, obj.children || []);
        case "queryTableDeletedFields":
          return xml.el("queryTableDeletedFields", obj.attrs || {}, obj.children || []);
        case "queryTableField":
          return xml.el("queryTableField", obj.attrs || {}, obj.children || []);
        case "queryTableFields":
          return xml.el("queryTableFields", obj.attrs || {}, obj.children || []);
        case "queryTableRefresh":
          return xml.el("queryTableRefresh", obj.attrs || {}, obj.children || []);
        case "rPh":
          return xml.el("rPh", obj.attrs || {}, obj.children || []);
        case "raf":
          return xml.el("raf", obj.attrs || {}, obj.children || []);
        case "rc":
          return xml.el("rc", obj.attrs || {}, obj.children || []);
        case "rcc":
          return xml.el("rcc", obj.attrs || {}, obj.children || []);
        case "rcft":
          return xml.el("rcft", obj.attrs || {}, obj.children || []);
        case "rcmt":
          return xml.el("rcmt", obj.attrs || {}, obj.children || []);
        case "rcv":
          return xml.el("rcv", obj.attrs || {}, obj.children || []);
        case "rdn":
          return xml.el("rdn", obj.attrs || {}, obj.children || []);
        case "reviewed":
          return xml.el("reviewed", obj.attrs || {}, obj.children || []);
        case "reviewedList":
          return xml.el("reviewedList", obj.attrs || {}, obj.children || []);
        case "revisions":
          return xml.el("revisions", obj.attrs || {}, obj.children || []);
        case "rfmt":
          return xml.el("rfmt", obj.attrs || {}, obj.children || []);
        case "rgbColor":
          return xml.el("rgbColor", obj.attrs || {}, obj.children || []);
        case "ris":
          return xml.el("ris", obj.attrs || {}, obj.children || []);
        case "rm":
          return xml.el("rm", obj.attrs || {}, obj.children || []);
        case "rqt":
          return xml.el("rqt", obj.attrs || {}, obj.children || []);
        case "rrc":
          return xml.el("rrc", obj.attrs || {}, obj.children || []);
        case "rsnm":
          return xml.el("rsnm", obj.attrs || {}, obj.children || []);
        case "scenario":
          return xml.el("scenario", obj.attrs || {}, obj.children || []);
        case "scenarios":
          return xml.el("scenarios", obj.attrs || {}, obj.children || []);
        case "securityDescriptor":
          return xml.el("securityDescriptor", obj.attrs || {}, obj.children || []);
        case "selection":
          return xml.el("selection", obj.attrs || {}, obj.children || []);
        case "serverFormat":
          return xml.el("serverFormat", obj.attrs || {}, obj.children || []);
        case "serverFormats":
          return xml.el("serverFormats", obj.attrs || {}, obj.children || []);
        case "set":
          return xml.el("set", obj.attrs || {}, obj.children || []);
        case "sets":
          return xml.el("sets", obj.attrs || {}, obj.children || []);
        case "shadow":
          return xml.el("shadow", obj.attrs || {}, obj.children || []);
        case "sheetDataSet":
          return xml.el("sheetDataSet", obj.attrs || {}, obj.children || []);
        case "sheetId":
          return xml.el("sheetId", obj.attrs || {}, obj.children || []);
        case "sheetIdMap":
          return xml.el("sheetIdMap", obj.attrs || {}, obj.children || []);
        case "sheetName":
          return xml.el("sheetName", obj.attrs || {}, obj.children || []);
        case "sheetNames":
          return xml.el("sheetNames", obj.attrs || {}, obj.children || []);
        case "singleXmlCell":
          return xml.el("singleXmlCell", obj.attrs || {}, obj.children || []);
        case "singleXmlCells":
          return xml.el("singleXmlCells", obj.attrs || {}, obj.children || []);
        case "smartTags":
          return xml.el("smartTags", obj.attrs || {}, obj.children || []);
        case "sortByTuple":
          return xml.el("sortByTuple", obj.attrs || {}, obj.children || []);
        case "sortCondition":
          return xml.el("sortCondition", obj.attrs || {}, obj.children || []);
        case "sortState":
          return xml.el("sortState", obj.attrs || {}, obj.children || []);
        case "start":
          return xml.el("start", obj.attrs || {}, obj.children || []);
        case "stop":
          return xml.el("stop", obj.attrs || {}, obj.children || []);
        case "stp":
          return xml.el("stp", obj.attrs || {}, obj.children || []);
        case "tableStyle":
          return xml.el("tableStyle", obj.attrs || {}, obj.children || []);
        case "tableStyleElement":
          return xml.el("tableStyleElement", obj.attrs || {}, obj.children || []);
        case "tables":
          return xml.el("tables", obj.attrs || {}, obj.children || []);
        case "textField":
          return xml.el("textField", obj.attrs || {}, obj.children || []);
        case "textFields":
          return xml.el("textFields", obj.attrs || {}, obj.children || []);
        case "textPr":
          return xml.el("textPr", obj.attrs || {}, obj.children || []);
        case "top":
          return xml.el("top", obj.attrs || {}, obj.children || []);
        case "top10":
          return xml.el("top10", obj.attrs || {}, obj.children || []);
        case "totalsRowFormula":
          return xml.el("totalsRowFormula", obj.attrs || {}, obj.children || []);
        case "tp":
          return xml.el("tp", obj.attrs || {}, obj.children || []);
        case "tpl":
          return xml.el("tpl", obj.attrs || {}, obj.children || []);
        case "tpls":
          return xml.el("tpls", obj.attrs || {}, obj.children || []);
        case "tr":
          return xml.el("tr", obj.attrs || {}, obj.children || []);
        case "tupleCache":
          return xml.el("tupleCache", obj.attrs || {}, obj.children || []);
        case "undo":
          return xml.el("undo", obj.attrs || {}, obj.children || []);
        case "userInfo":
          return xml.el("userInfo", obj.attrs || {}, obj.children || []);
        case "users":
          return xml.el("users", obj.attrs || {}, obj.children || []);
        case "val":
          return xml.el("val", obj.attrs || {}, obj.children || []);
        case "value":
          return xml.el("value", obj.attrs || {}, obj.children || []);
        case "valueMetadata":
          return xml.el("valueMetadata", obj.attrs || {}, obj.children || []);
        case "values":
          return xml.el("values", obj.attrs || {}, obj.children || []);
        case "vertical":
          return xml.el("vertical", obj.attrs || {}, obj.children || []);
        case "volType":
          return xml.el("volType", obj.attrs || {}, obj.children || []);
        case "volTypes":
          return xml.el("volTypes", obj.attrs || {}, obj.children || []);
        case "webPr":
          return xml.el("webPr", obj.attrs || {}, obj.children || []);
        case "webPublishItem":
          return xml.el("webPublishItem", obj.attrs || {}, obj.children || []);
        case "webPublishItems":
          return xml.el("webPublishItems", obj.attrs || {}, obj.children || []);
        case "workbookPr":
          return xml.el("workbookPr", obj.attrs || {}, obj.children || []);
        case "xmlCellPr":
          return xml.el("xmlCellPr", obj.attrs || {}, obj.children || []);
        case "xmlColumnPr":
          return xml.el("xmlColumnPr", obj.attrs || {}, obj.children || []);
        case "xmlPr":
          return xml.el("xmlPr", obj.attrs || {}, obj.children || []);
        default:
          return null;
      }
    }
    return { parseElement, renderElement, ELEMENTS };
  } });
    __register({ name: "dmlChartMisc", dependencies: ["xml"], factory: function(xml) {
    const ELEMENTS = ["c:applyToEnd", "c:applyToFront", "c:applyToSides", "c:area3DChart", "c:areaChart", "c:auto", "c:backWall", "c:bandFmt", "c:bandFmts", "c:bar3DChart", "c:barChart", "c:baseTimeUnit", "c:bubble3D", "c:bubbleChart", "c:bubbleScale", "c:bubbleSize", "c:chartObject", "c:clrMapOvr", "c:crossBetween", "c:crosses", "c:crossesAt", "c:custSplit", "c:dLbl", "c:dLblPos", "c:dLbls", "c:dPt", "c:dTable", "c:data", "c:date1904", "c:dateAx", "c:depthPercent", "c:dispUnits", "c:doughnutChart", "c:dropLines", "c:errBars", "c:evenFooter", "c:evenHeader", "c:explosion", "c:ext", "c:extLst", "c:firstFooter", "c:firstHeader", "c:floor", "c:fmtId", "c:formatting", "c:gapDepth", "c:hPercent", "c:headerFooter", "c:hiLowLines", "c:invertIfNegative", "c:lang", "c:lblAlgn", "c:lblOffset", "c:leaderLines", "c:legendEntry", "c:line3DChart", "c:lineChart", "c:lvl", "c:majorGridlines", "c:majorTickMark", "c:majorTimeUnit", "c:majorUnit", "c:marker", "c:minorGridlines", "c:minorTickMark", "c:minorTimeUnit", "c:minorUnit", "c:multiLvlStrCache", "c:multiLvlStrRef", "c:noMultiLvlLbl", "c:numCache", "c:oddFooter", "c:oddHeader", "c:ofPieChart", "c:ofPieType", "c:overlap", "c:pageMargins", "c:pageSetup", "c:pictureFormat", "c:pictureOptions", "c:pictureStackUnit", "c:pie3DChart", "c:pieChart", "c:pivotFmt", "c:pivotFmts", "c:pivotSource", "c:printSettings", "c:protection", "c:radarChart", "c:radarStyle", "c:roundedCorners", "c:scatterChart", "c:secondPiePt", "c:secondPieSize", "c:selection", "c:separator", "c:serAx", "c:serLines", "c:showBubbleSize", "c:showCatName", "c:showDLblsOverMax", "c:showHorzBorder", "c:showKeys", "c:showLeaderLines", "c:showLegendKey", "c:showNegBubbles", "c:showOutline", "c:showPercent", "c:showSerName", "c:showVal", "c:showVertBorder", "c:sideWall", "c:size", "c:sizeRepresents", "c:smooth", "c:splitPos", "c:splitType", "c:stockChart", "c:strCache", "c:style", "c:surface3DChart", "c:surfaceChart", "c:symbol", "c:tickLblPos", "c:tickLblSkip", "c:tickMarkSkip", "c:trendline", "c:upDownBars", "c:userInterface", "c:userShapes", "c:view3D"];
    function parseElement(el) {
      if (!el || el.type !== "element")
        return null;
      switch (el.name) {
        case "c:applyToEnd":
          return { _passthrough: !0, kind: "applyToEnd", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "c:applyToFront":
          return { _passthrough: !0, kind: "applyToFront", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "c:applyToSides":
          return { _passthrough: !0, kind: "applyToSides", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "c:area3DChart":
          return { _passthrough: !0, kind: "area3DChart", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "c:areaChart":
          return { _passthrough: !0, kind: "areaChart", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "c:auto":
          return { _passthrough: !0, kind: "auto", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "c:backWall":
          return { _passthrough: !0, kind: "backWall", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "c:bandFmt":
          return { _passthrough: !0, kind: "bandFmt", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "c:bandFmts":
          return { _passthrough: !0, kind: "bandFmts", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "c:bar3DChart":
          return { _passthrough: !0, kind: "bar3DChart", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "c:barChart":
          return { _passthrough: !0, kind: "barChart", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "c:baseTimeUnit":
          return { _passthrough: !0, kind: "baseTimeUnit", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "c:bubble3D":
          return { _passthrough: !0, kind: "bubble3D", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "c:bubbleChart":
          return { _passthrough: !0, kind: "bubbleChart", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "c:bubbleScale":
          return { _passthrough: !0, kind: "bubbleScale", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "c:bubbleSize":
          return { _passthrough: !0, kind: "bubbleSize", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "c:chartObject":
          return { _passthrough: !0, kind: "chartObject", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "c:clrMapOvr":
          return { _passthrough: !0, kind: "clrMapOvr", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "c:crossBetween":
          return { _passthrough: !0, kind: "crossBetween", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "c:crosses":
          return { _passthrough: !0, kind: "crosses", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "c:crossesAt":
          return { _passthrough: !0, kind: "crossesAt", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "c:custSplit":
          return { _passthrough: !0, kind: "custSplit", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "c:dLbl":
          return { _passthrough: !0, kind: "dLbl", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "c:dLblPos":
          return { _passthrough: !0, kind: "dLblPos", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "c:dLbls":
          return { _passthrough: !0, kind: "dLbls", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "c:dPt":
          return { _passthrough: !0, kind: "dPt", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "c:dTable":
          return { _passthrough: !0, kind: "dTable", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "c:data":
          return { _passthrough: !0, kind: "data", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "c:date1904":
          return { _passthrough: !0, kind: "date1904", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "c:dateAx":
          return { _passthrough: !0, kind: "dateAx", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "c:depthPercent":
          return { _passthrough: !0, kind: "depthPercent", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "c:dispUnits":
          return { _passthrough: !0, kind: "dispUnits", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "c:doughnutChart":
          return { _passthrough: !0, kind: "doughnutChart", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "c:dropLines":
          return { _passthrough: !0, kind: "dropLines", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "c:errBars":
          return { _passthrough: !0, kind: "errBars", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "c:evenFooter":
          return { _passthrough: !0, kind: "evenFooter", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "c:evenHeader":
          return { _passthrough: !0, kind: "evenHeader", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "c:explosion":
          return { _passthrough: !0, kind: "explosion", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "c:ext":
          return { _passthrough: !0, kind: "ext", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "c:extLst":
          return { _passthrough: !0, kind: "extLst", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "c:firstFooter":
          return { _passthrough: !0, kind: "firstFooter", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "c:firstHeader":
          return { _passthrough: !0, kind: "firstHeader", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "c:floor":
          return { _passthrough: !0, kind: "floor", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "c:fmtId":
          return { _passthrough: !0, kind: "fmtId", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "c:formatting":
          return { _passthrough: !0, kind: "formatting", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "c:gapDepth":
          return { _passthrough: !0, kind: "gapDepth", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "c:hPercent":
          return { _passthrough: !0, kind: "hPercent", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "c:headerFooter":
          return { _passthrough: !0, kind: "headerFooter", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "c:hiLowLines":
          return { _passthrough: !0, kind: "hiLowLines", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "c:invertIfNegative":
          return { _passthrough: !0, kind: "invertIfNegative", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "c:lang":
          return { _passthrough: !0, kind: "lang", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "c:lblAlgn":
          return { _passthrough: !0, kind: "lblAlgn", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "c:lblOffset":
          return { _passthrough: !0, kind: "lblOffset", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "c:leaderLines":
          return { _passthrough: !0, kind: "leaderLines", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "c:legendEntry":
          return { _passthrough: !0, kind: "legendEntry", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "c:line3DChart":
          return { _passthrough: !0, kind: "line3DChart", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "c:lineChart":
          return { _passthrough: !0, kind: "lineChart", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "c:lvl":
          return { _passthrough: !0, kind: "lvl", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "c:majorGridlines":
          return { _passthrough: !0, kind: "majorGridlines", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "c:majorTickMark":
          return { _passthrough: !0, kind: "majorTickMark", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "c:majorTimeUnit":
          return { _passthrough: !0, kind: "majorTimeUnit", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "c:majorUnit":
          return { _passthrough: !0, kind: "majorUnit", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "c:marker":
          return { _passthrough: !0, kind: "marker", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "c:minorGridlines":
          return { _passthrough: !0, kind: "minorGridlines", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "c:minorTickMark":
          return { _passthrough: !0, kind: "minorTickMark", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "c:minorTimeUnit":
          return { _passthrough: !0, kind: "minorTimeUnit", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "c:minorUnit":
          return { _passthrough: !0, kind: "minorUnit", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "c:multiLvlStrCache":
          return { _passthrough: !0, kind: "multiLvlStrCache", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "c:multiLvlStrRef":
          return { _passthrough: !0, kind: "multiLvlStrRef", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "c:noMultiLvlLbl":
          return { _passthrough: !0, kind: "noMultiLvlLbl", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "c:numCache":
          return { _passthrough: !0, kind: "numCache", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "c:oddFooter":
          return { _passthrough: !0, kind: "oddFooter", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "c:oddHeader":
          return { _passthrough: !0, kind: "oddHeader", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "c:ofPieChart":
          return { _passthrough: !0, kind: "ofPieChart", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "c:ofPieType":
          return { _passthrough: !0, kind: "ofPieType", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "c:overlap":
          return { _passthrough: !0, kind: "overlap", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "c:pageMargins":
          return { _passthrough: !0, kind: "pageMargins", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "c:pageSetup":
          return { _passthrough: !0, kind: "pageSetup", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "c:pictureFormat":
          return { _passthrough: !0, kind: "pictureFormat", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "c:pictureOptions":
          return { _passthrough: !0, kind: "pictureOptions", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "c:pictureStackUnit":
          return { _passthrough: !0, kind: "pictureStackUnit", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "c:pie3DChart":
          return { _passthrough: !0, kind: "pie3DChart", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "c:pieChart":
          return { _passthrough: !0, kind: "pieChart", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "c:pivotFmt":
          return { _passthrough: !0, kind: "pivotFmt", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "c:pivotFmts":
          return { _passthrough: !0, kind: "pivotFmts", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "c:pivotSource":
          return { _passthrough: !0, kind: "pivotSource", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "c:printSettings":
          return { _passthrough: !0, kind: "printSettings", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "c:protection":
          return { _passthrough: !0, kind: "protection", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "c:radarChart":
          return { _passthrough: !0, kind: "radarChart", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "c:radarStyle":
          return { _passthrough: !0, kind: "radarStyle", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "c:roundedCorners":
          return { _passthrough: !0, kind: "roundedCorners", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "c:scatterChart":
          return { _passthrough: !0, kind: "scatterChart", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "c:secondPiePt":
          return { _passthrough: !0, kind: "secondPiePt", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "c:secondPieSize":
          return { _passthrough: !0, kind: "secondPieSize", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "c:selection":
          return { _passthrough: !0, kind: "selection", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "c:separator":
          return { _passthrough: !0, kind: "separator", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "c:serAx":
          return { _passthrough: !0, kind: "serAx", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "c:serLines":
          return { _passthrough: !0, kind: "serLines", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "c:showBubbleSize":
          return { _passthrough: !0, kind: "showBubbleSize", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "c:showCatName":
          return { _passthrough: !0, kind: "showCatName", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "c:showDLblsOverMax":
          return { _passthrough: !0, kind: "showDLblsOverMax", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "c:showHorzBorder":
          return { _passthrough: !0, kind: "showHorzBorder", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "c:showKeys":
          return { _passthrough: !0, kind: "showKeys", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "c:showLeaderLines":
          return { _passthrough: !0, kind: "showLeaderLines", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "c:showLegendKey":
          return { _passthrough: !0, kind: "showLegendKey", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "c:showNegBubbles":
          return { _passthrough: !0, kind: "showNegBubbles", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "c:showOutline":
          return { _passthrough: !0, kind: "showOutline", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "c:showPercent":
          return { _passthrough: !0, kind: "showPercent", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "c:showSerName":
          return { _passthrough: !0, kind: "showSerName", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "c:showVal":
          return { _passthrough: !0, kind: "showVal", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "c:showVertBorder":
          return { _passthrough: !0, kind: "showVertBorder", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "c:sideWall":
          return { _passthrough: !0, kind: "sideWall", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "c:size":
          return { _passthrough: !0, kind: "size", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "c:sizeRepresents":
          return { _passthrough: !0, kind: "sizeRepresents", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "c:smooth":
          return { _passthrough: !0, kind: "smooth", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "c:splitPos":
          return { _passthrough: !0, kind: "splitPos", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "c:splitType":
          return { _passthrough: !0, kind: "splitType", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "c:stockChart":
          return { _passthrough: !0, kind: "stockChart", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "c:strCache":
          return { _passthrough: !0, kind: "strCache", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "c:style":
          return { _passthrough: !0, kind: "style", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "c:surface3DChart":
          return { _passthrough: !0, kind: "surface3DChart", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "c:surfaceChart":
          return { _passthrough: !0, kind: "surfaceChart", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "c:symbol":
          return { _passthrough: !0, kind: "symbol", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "c:tickLblPos":
          return { _passthrough: !0, kind: "tickLblPos", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "c:tickLblSkip":
          return { _passthrough: !0, kind: "tickLblSkip", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "c:tickMarkSkip":
          return { _passthrough: !0, kind: "tickMarkSkip", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "c:trendline":
          return { _passthrough: !0, kind: "trendline", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "c:upDownBars":
          return { _passthrough: !0, kind: "upDownBars", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "c:userInterface":
          return { _passthrough: !0, kind: "userInterface", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "c:userShapes":
          return { _passthrough: !0, kind: "userShapes", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "c:view3D":
          return { _passthrough: !0, kind: "view3D", attrs: { ...el.attrs }, children: [...el.children || []] };
        default:
          return null;
      }
    }
    function renderElement(obj) {
      if (!obj || !obj.kind)
        return null;
      switch (obj.kind) {
        case "applyToEnd":
          return xml.el("c:applyToEnd", obj.attrs || {}, obj.children || []);
        case "applyToFront":
          return xml.el("c:applyToFront", obj.attrs || {}, obj.children || []);
        case "applyToSides":
          return xml.el("c:applyToSides", obj.attrs || {}, obj.children || []);
        case "area3DChart":
          return xml.el("c:area3DChart", obj.attrs || {}, obj.children || []);
        case "areaChart":
          return xml.el("c:areaChart", obj.attrs || {}, obj.children || []);
        case "auto":
          return xml.el("c:auto", obj.attrs || {}, obj.children || []);
        case "backWall":
          return xml.el("c:backWall", obj.attrs || {}, obj.children || []);
        case "bandFmt":
          return xml.el("c:bandFmt", obj.attrs || {}, obj.children || []);
        case "bandFmts":
          return xml.el("c:bandFmts", obj.attrs || {}, obj.children || []);
        case "bar3DChart":
          return xml.el("c:bar3DChart", obj.attrs || {}, obj.children || []);
        case "barChart":
          return xml.el("c:barChart", obj.attrs || {}, obj.children || []);
        case "baseTimeUnit":
          return xml.el("c:baseTimeUnit", obj.attrs || {}, obj.children || []);
        case "bubble3D":
          return xml.el("c:bubble3D", obj.attrs || {}, obj.children || []);
        case "bubbleChart":
          return xml.el("c:bubbleChart", obj.attrs || {}, obj.children || []);
        case "bubbleScale":
          return xml.el("c:bubbleScale", obj.attrs || {}, obj.children || []);
        case "bubbleSize":
          return xml.el("c:bubbleSize", obj.attrs || {}, obj.children || []);
        case "chartObject":
          return xml.el("c:chartObject", obj.attrs || {}, obj.children || []);
        case "clrMapOvr":
          return xml.el("c:clrMapOvr", obj.attrs || {}, obj.children || []);
        case "crossBetween":
          return xml.el("c:crossBetween", obj.attrs || {}, obj.children || []);
        case "crosses":
          return xml.el("c:crosses", obj.attrs || {}, obj.children || []);
        case "crossesAt":
          return xml.el("c:crossesAt", obj.attrs || {}, obj.children || []);
        case "custSplit":
          return xml.el("c:custSplit", obj.attrs || {}, obj.children || []);
        case "dLbl":
          return xml.el("c:dLbl", obj.attrs || {}, obj.children || []);
        case "dLblPos":
          return xml.el("c:dLblPos", obj.attrs || {}, obj.children || []);
        case "dLbls":
          return xml.el("c:dLbls", obj.attrs || {}, obj.children || []);
        case "dPt":
          return xml.el("c:dPt", obj.attrs || {}, obj.children || []);
        case "dTable":
          return xml.el("c:dTable", obj.attrs || {}, obj.children || []);
        case "data":
          return xml.el("c:data", obj.attrs || {}, obj.children || []);
        case "date1904":
          return xml.el("c:date1904", obj.attrs || {}, obj.children || []);
        case "dateAx":
          return xml.el("c:dateAx", obj.attrs || {}, obj.children || []);
        case "depthPercent":
          return xml.el("c:depthPercent", obj.attrs || {}, obj.children || []);
        case "dispUnits":
          return xml.el("c:dispUnits", obj.attrs || {}, obj.children || []);
        case "doughnutChart":
          return xml.el("c:doughnutChart", obj.attrs || {}, obj.children || []);
        case "dropLines":
          return xml.el("c:dropLines", obj.attrs || {}, obj.children || []);
        case "errBars":
          return xml.el("c:errBars", obj.attrs || {}, obj.children || []);
        case "evenFooter":
          return xml.el("c:evenFooter", obj.attrs || {}, obj.children || []);
        case "evenHeader":
          return xml.el("c:evenHeader", obj.attrs || {}, obj.children || []);
        case "explosion":
          return xml.el("c:explosion", obj.attrs || {}, obj.children || []);
        case "ext":
          return xml.el("c:ext", obj.attrs || {}, obj.children || []);
        case "extLst":
          return xml.el("c:extLst", obj.attrs || {}, obj.children || []);
        case "firstFooter":
          return xml.el("c:firstFooter", obj.attrs || {}, obj.children || []);
        case "firstHeader":
          return xml.el("c:firstHeader", obj.attrs || {}, obj.children || []);
        case "floor":
          return xml.el("c:floor", obj.attrs || {}, obj.children || []);
        case "fmtId":
          return xml.el("c:fmtId", obj.attrs || {}, obj.children || []);
        case "formatting":
          return xml.el("c:formatting", obj.attrs || {}, obj.children || []);
        case "gapDepth":
          return xml.el("c:gapDepth", obj.attrs || {}, obj.children || []);
        case "hPercent":
          return xml.el("c:hPercent", obj.attrs || {}, obj.children || []);
        case "headerFooter":
          return xml.el("c:headerFooter", obj.attrs || {}, obj.children || []);
        case "hiLowLines":
          return xml.el("c:hiLowLines", obj.attrs || {}, obj.children || []);
        case "invertIfNegative":
          return xml.el("c:invertIfNegative", obj.attrs || {}, obj.children || []);
        case "lang":
          return xml.el("c:lang", obj.attrs || {}, obj.children || []);
        case "lblAlgn":
          return xml.el("c:lblAlgn", obj.attrs || {}, obj.children || []);
        case "lblOffset":
          return xml.el("c:lblOffset", obj.attrs || {}, obj.children || []);
        case "leaderLines":
          return xml.el("c:leaderLines", obj.attrs || {}, obj.children || []);
        case "legendEntry":
          return xml.el("c:legendEntry", obj.attrs || {}, obj.children || []);
        case "line3DChart":
          return xml.el("c:line3DChart", obj.attrs || {}, obj.children || []);
        case "lineChart":
          return xml.el("c:lineChart", obj.attrs || {}, obj.children || []);
        case "lvl":
          return xml.el("c:lvl", obj.attrs || {}, obj.children || []);
        case "majorGridlines":
          return xml.el("c:majorGridlines", obj.attrs || {}, obj.children || []);
        case "majorTickMark":
          return xml.el("c:majorTickMark", obj.attrs || {}, obj.children || []);
        case "majorTimeUnit":
          return xml.el("c:majorTimeUnit", obj.attrs || {}, obj.children || []);
        case "majorUnit":
          return xml.el("c:majorUnit", obj.attrs || {}, obj.children || []);
        case "marker":
          return xml.el("c:marker", obj.attrs || {}, obj.children || []);
        case "minorGridlines":
          return xml.el("c:minorGridlines", obj.attrs || {}, obj.children || []);
        case "minorTickMark":
          return xml.el("c:minorTickMark", obj.attrs || {}, obj.children || []);
        case "minorTimeUnit":
          return xml.el("c:minorTimeUnit", obj.attrs || {}, obj.children || []);
        case "minorUnit":
          return xml.el("c:minorUnit", obj.attrs || {}, obj.children || []);
        case "multiLvlStrCache":
          return xml.el("c:multiLvlStrCache", obj.attrs || {}, obj.children || []);
        case "multiLvlStrRef":
          return xml.el("c:multiLvlStrRef", obj.attrs || {}, obj.children || []);
        case "noMultiLvlLbl":
          return xml.el("c:noMultiLvlLbl", obj.attrs || {}, obj.children || []);
        case "numCache":
          return xml.el("c:numCache", obj.attrs || {}, obj.children || []);
        case "oddFooter":
          return xml.el("c:oddFooter", obj.attrs || {}, obj.children || []);
        case "oddHeader":
          return xml.el("c:oddHeader", obj.attrs || {}, obj.children || []);
        case "ofPieChart":
          return xml.el("c:ofPieChart", obj.attrs || {}, obj.children || []);
        case "ofPieType":
          return xml.el("c:ofPieType", obj.attrs || {}, obj.children || []);
        case "overlap":
          return xml.el("c:overlap", obj.attrs || {}, obj.children || []);
        case "pageMargins":
          return xml.el("c:pageMargins", obj.attrs || {}, obj.children || []);
        case "pageSetup":
          return xml.el("c:pageSetup", obj.attrs || {}, obj.children || []);
        case "pictureFormat":
          return xml.el("c:pictureFormat", obj.attrs || {}, obj.children || []);
        case "pictureOptions":
          return xml.el("c:pictureOptions", obj.attrs || {}, obj.children || []);
        case "pictureStackUnit":
          return xml.el("c:pictureStackUnit", obj.attrs || {}, obj.children || []);
        case "pie3DChart":
          return xml.el("c:pie3DChart", obj.attrs || {}, obj.children || []);
        case "pieChart":
          return xml.el("c:pieChart", obj.attrs || {}, obj.children || []);
        case "pivotFmt":
          return xml.el("c:pivotFmt", obj.attrs || {}, obj.children || []);
        case "pivotFmts":
          return xml.el("c:pivotFmts", obj.attrs || {}, obj.children || []);
        case "pivotSource":
          return xml.el("c:pivotSource", obj.attrs || {}, obj.children || []);
        case "printSettings":
          return xml.el("c:printSettings", obj.attrs || {}, obj.children || []);
        case "protection":
          return xml.el("c:protection", obj.attrs || {}, obj.children || []);
        case "radarChart":
          return xml.el("c:radarChart", obj.attrs || {}, obj.children || []);
        case "radarStyle":
          return xml.el("c:radarStyle", obj.attrs || {}, obj.children || []);
        case "roundedCorners":
          return xml.el("c:roundedCorners", obj.attrs || {}, obj.children || []);
        case "scatterChart":
          return xml.el("c:scatterChart", obj.attrs || {}, obj.children || []);
        case "secondPiePt":
          return xml.el("c:secondPiePt", obj.attrs || {}, obj.children || []);
        case "secondPieSize":
          return xml.el("c:secondPieSize", obj.attrs || {}, obj.children || []);
        case "selection":
          return xml.el("c:selection", obj.attrs || {}, obj.children || []);
        case "separator":
          return xml.el("c:separator", obj.attrs || {}, obj.children || []);
        case "serAx":
          return xml.el("c:serAx", obj.attrs || {}, obj.children || []);
        case "serLines":
          return xml.el("c:serLines", obj.attrs || {}, obj.children || []);
        case "showBubbleSize":
          return xml.el("c:showBubbleSize", obj.attrs || {}, obj.children || []);
        case "showCatName":
          return xml.el("c:showCatName", obj.attrs || {}, obj.children || []);
        case "showDLblsOverMax":
          return xml.el("c:showDLblsOverMax", obj.attrs || {}, obj.children || []);
        case "showHorzBorder":
          return xml.el("c:showHorzBorder", obj.attrs || {}, obj.children || []);
        case "showKeys":
          return xml.el("c:showKeys", obj.attrs || {}, obj.children || []);
        case "showLeaderLines":
          return xml.el("c:showLeaderLines", obj.attrs || {}, obj.children || []);
        case "showLegendKey":
          return xml.el("c:showLegendKey", obj.attrs || {}, obj.children || []);
        case "showNegBubbles":
          return xml.el("c:showNegBubbles", obj.attrs || {}, obj.children || []);
        case "showOutline":
          return xml.el("c:showOutline", obj.attrs || {}, obj.children || []);
        case "showPercent":
          return xml.el("c:showPercent", obj.attrs || {}, obj.children || []);
        case "showSerName":
          return xml.el("c:showSerName", obj.attrs || {}, obj.children || []);
        case "showVal":
          return xml.el("c:showVal", obj.attrs || {}, obj.children || []);
        case "showVertBorder":
          return xml.el("c:showVertBorder", obj.attrs || {}, obj.children || []);
        case "sideWall":
          return xml.el("c:sideWall", obj.attrs || {}, obj.children || []);
        case "size":
          return xml.el("c:size", obj.attrs || {}, obj.children || []);
        case "sizeRepresents":
          return xml.el("c:sizeRepresents", obj.attrs || {}, obj.children || []);
        case "smooth":
          return xml.el("c:smooth", obj.attrs || {}, obj.children || []);
        case "splitPos":
          return xml.el("c:splitPos", obj.attrs || {}, obj.children || []);
        case "splitType":
          return xml.el("c:splitType", obj.attrs || {}, obj.children || []);
        case "stockChart":
          return xml.el("c:stockChart", obj.attrs || {}, obj.children || []);
        case "strCache":
          return xml.el("c:strCache", obj.attrs || {}, obj.children || []);
        case "style":
          return xml.el("c:style", obj.attrs || {}, obj.children || []);
        case "surface3DChart":
          return xml.el("c:surface3DChart", obj.attrs || {}, obj.children || []);
        case "surfaceChart":
          return xml.el("c:surfaceChart", obj.attrs || {}, obj.children || []);
        case "symbol":
          return xml.el("c:symbol", obj.attrs || {}, obj.children || []);
        case "tickLblPos":
          return xml.el("c:tickLblPos", obj.attrs || {}, obj.children || []);
        case "tickLblSkip":
          return xml.el("c:tickLblSkip", obj.attrs || {}, obj.children || []);
        case "tickMarkSkip":
          return xml.el("c:tickMarkSkip", obj.attrs || {}, obj.children || []);
        case "trendline":
          return xml.el("c:trendline", obj.attrs || {}, obj.children || []);
        case "upDownBars":
          return xml.el("c:upDownBars", obj.attrs || {}, obj.children || []);
        case "userInterface":
          return xml.el("c:userInterface", obj.attrs || {}, obj.children || []);
        case "userShapes":
          return xml.el("c:userShapes", obj.attrs || {}, obj.children || []);
        case "view3D":
          return xml.el("c:view3D", obj.attrs || {}, obj.children || []);
        default:
          return null;
      }
    }
    return { parseElement, renderElement, ELEMENTS };
  } });
    __register({ name: "dmlMainMisc", dependencies: ["xml"], factory: function(xml) {
    const ELEMENTS = ["a:accent1", "a:accent2", "a:accent3", "a:accent4", "a:accent5", "a:accent6", "a:ahLst", "a:ahPolar", "a:ahXY", "a:alpha", "a:alphaBiLevel", "a:alphaCeiling", "a:alphaFloor", "a:alphaInv", "a:alphaMod", "a:alphaModFix", "a:alphaOff", "a:alphaOutset", "a:alphaRepl", "a:anchor", "a:arcTo", "a:audioCd", "a:audioFile", "a:backdrop", "a:band1H", "a:band1V", "a:band2H", "a:band2V", "a:bevel", "a:bevelB", "a:bevelT", "a:bgFillStyleLst", "a:biLevel", "a:bldChart", "a:bldDgm", "a:blend", "a:blipFill", "a:blue", "a:blueMod", "a:blueOff", "a:blur", "a:bottom", "a:buBlip", "a:buClr", "a:buClrTx", "a:buFont", "a:buFontTx", "a:buSzPct", "a:buSzPts", "a:buSzTx", "a:cNvCxnSpPr", "a:cNvGraphicFramePr", "a:cNvGrpSpPr", "a:cNvPicPr", "a:cNvPr", "a:cNvSpPr", "a:camera", "a:cell3D", "a:chExt", "a:chOff", "a:chart", "a:close", "a:clrChange", "a:clrFrom", "a:clrMap", "a:clrRepl", "a:clrTo", "a:comp", "a:cont", "a:contourClr", "a:cpLocks", "a:cubicBezTo", "a:custClr", "a:custClrLst", "a:custDash", "a:custGeom", "a:cxn", "a:cxnLst", "a:cxnSp", "a:cxnSpLocks", "a:defPPr", "a:dgm", "a:dk1", "a:dk2", "a:ds", "a:end", "a:extLst", "a:extraClrScheme", "a:fill", "a:fillStyleLst", "a:firstCol", "a:firstRow", "a:folHlink", "a:font", "a:gamma", "a:graphicFrame", "a:gray", "a:green", "a:greenMod", "a:greenOff", "a:grpFill", "a:grpSp", "a:grpSpPr", "a:headEnd", "a:header", "a:headers", "a:highlight", "a:hlink", "a:hlinkClick", "a:hlinkHover", "a:hlinkMouseOver", "a:hsl", "a:hue", "a:hueMod", "a:hueOff", "a:insideH", "a:insideV", "a:inv", "a:invGamma", "a:lastCol", "a:lastRow", "a:left", "a:lnB", "a:lnBlToTr", "a:lnDef", "a:lnL", "a:lnR", "a:lnSpc", "a:lnStyleLst", "a:lnT", "a:lnTlToBr", "a:lt1", "a:lt2", "a:lvl1pPr", "a:lvl2pPr", "a:lvl3pPr", "a:lvl4pPr", "a:lvl5pPr", "a:lvl6pPr", "a:lvl7pPr", "a:lvl8pPr", "a:lvl9pPr", "a:miter", "a:neCell", "a:norm", "a:nvCxnSpPr", "a:nvGraphicFramePr", "a:nvGrpSpPr", "a:nvPicPr", "a:nvSpPr", "a:nwCell", "a:pic", "a:quickTimeFile", "a:red", "a:redMod", "a:redOff", "a:relOff", "a:right", "a:round", "a:rtl", "a:sat", "a:satMod", "a:satOff", "a:seCell", "a:snd", "a:sp", "a:spDef", "a:spPr", "a:spcAft", "a:spcBef", "a:spcPct", "a:spcPts", "a:st", "a:style", "a:swCell", "a:sx", "a:sy", "a:sym", "a:tab", "a:tabLst", "a:tableStyle", "a:tailEnd", "a:tblBg", "a:tblStyle", "a:tblStyleLst", "a:tcBdr", "a:tcStyle", "a:tcTxStyle", "a:themeManager", "a:themeOverride", "a:tl2br", "a:top", "a:tr2bl", "a:txDef", "a:txSp", "a:uFill", "a:uFillTx", "a:uLn", "a:uLnTx", "a:up", "a:useSpRect", "a:videoFile", "a:wavAudioFile", "a:wholeTbl"];
    function parseElement(el) {
      if (!el || el.type !== "element")
        return null;
      switch (el.name) {
        case "a:accent1":
          return { _passthrough: !0, kind: "accent1", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:accent2":
          return { _passthrough: !0, kind: "accent2", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:accent3":
          return { _passthrough: !0, kind: "accent3", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:accent4":
          return { _passthrough: !0, kind: "accent4", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:accent5":
          return { _passthrough: !0, kind: "accent5", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:accent6":
          return { _passthrough: !0, kind: "accent6", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:ahLst":
          return { _passthrough: !0, kind: "ahLst", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:ahPolar":
          return { _passthrough: !0, kind: "ahPolar", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:ahXY":
          return { _passthrough: !0, kind: "ahXY", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:alpha":
          return { _passthrough: !0, kind: "alpha", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:alphaBiLevel":
          return { _passthrough: !0, kind: "alphaBiLevel", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:alphaCeiling":
          return { _passthrough: !0, kind: "alphaCeiling", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:alphaFloor":
          return { _passthrough: !0, kind: "alphaFloor", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:alphaInv":
          return { _passthrough: !0, kind: "alphaInv", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:alphaMod":
          return { _passthrough: !0, kind: "alphaMod", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:alphaModFix":
          return { _passthrough: !0, kind: "alphaModFix", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:alphaOff":
          return { _passthrough: !0, kind: "alphaOff", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:alphaOutset":
          return { _passthrough: !0, kind: "alphaOutset", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:alphaRepl":
          return { _passthrough: !0, kind: "alphaRepl", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:anchor":
          return { _passthrough: !0, kind: "anchor", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:arcTo":
          return { _passthrough: !0, kind: "arcTo", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:audioCd":
          return { _passthrough: !0, kind: "audioCd", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:audioFile":
          return { _passthrough: !0, kind: "audioFile", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:backdrop":
          return { _passthrough: !0, kind: "backdrop", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:band1H":
          return { _passthrough: !0, kind: "band1H", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:band1V":
          return { _passthrough: !0, kind: "band1V", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:band2H":
          return { _passthrough: !0, kind: "band2H", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:band2V":
          return { _passthrough: !0, kind: "band2V", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:bevel":
          return { _passthrough: !0, kind: "bevel", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:bevelB":
          return { _passthrough: !0, kind: "bevelB", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:bevelT":
          return { _passthrough: !0, kind: "bevelT", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:bgFillStyleLst":
          return { _passthrough: !0, kind: "bgFillStyleLst", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:biLevel":
          return { _passthrough: !0, kind: "biLevel", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:bldChart":
          return { _passthrough: !0, kind: "bldChart", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:bldDgm":
          return { _passthrough: !0, kind: "bldDgm", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:blend":
          return { _passthrough: !0, kind: "blend", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:blipFill":
          return { _passthrough: !0, kind: "blipFill", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:blue":
          return { _passthrough: !0, kind: "blue", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:blueMod":
          return { _passthrough: !0, kind: "blueMod", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:blueOff":
          return { _passthrough: !0, kind: "blueOff", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:blur":
          return { _passthrough: !0, kind: "blur", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:bottom":
          return { _passthrough: !0, kind: "bottom", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:buBlip":
          return { _passthrough: !0, kind: "buBlip", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:buClr":
          return { _passthrough: !0, kind: "buClr", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:buClrTx":
          return { _passthrough: !0, kind: "buClrTx", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:buFont":
          return { _passthrough: !0, kind: "buFont", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:buFontTx":
          return { _passthrough: !0, kind: "buFontTx", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:buSzPct":
          return { _passthrough: !0, kind: "buSzPct", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:buSzPts":
          return { _passthrough: !0, kind: "buSzPts", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:buSzTx":
          return { _passthrough: !0, kind: "buSzTx", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:cNvCxnSpPr":
          return { _passthrough: !0, kind: "cNvCxnSpPr", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:cNvGraphicFramePr":
          return { _passthrough: !0, kind: "cNvGraphicFramePr", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:cNvGrpSpPr":
          return { _passthrough: !0, kind: "cNvGrpSpPr", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:cNvPicPr":
          return { _passthrough: !0, kind: "cNvPicPr", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:cNvPr":
          return { _passthrough: !0, kind: "cNvPr", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:cNvSpPr":
          return { _passthrough: !0, kind: "cNvSpPr", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:camera":
          return { _passthrough: !0, kind: "camera", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:cell3D":
          return { _passthrough: !0, kind: "cell3D", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:chExt":
          return { _passthrough: !0, kind: "chExt", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:chOff":
          return { _passthrough: !0, kind: "chOff", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:chart":
          return { _passthrough: !0, kind: "chart", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:close":
          return { _passthrough: !0, kind: "close", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:clrChange":
          return { _passthrough: !0, kind: "clrChange", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:clrFrom":
          return { _passthrough: !0, kind: "clrFrom", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:clrMap":
          return { _passthrough: !0, kind: "clrMap", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:clrRepl":
          return { _passthrough: !0, kind: "clrRepl", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:clrTo":
          return { _passthrough: !0, kind: "clrTo", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:comp":
          return { _passthrough: !0, kind: "comp", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:cont":
          return { _passthrough: !0, kind: "cont", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:contourClr":
          return { _passthrough: !0, kind: "contourClr", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:cpLocks":
          return { _passthrough: !0, kind: "cpLocks", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:cubicBezTo":
          return { _passthrough: !0, kind: "cubicBezTo", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:custClr":
          return { _passthrough: !0, kind: "custClr", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:custClrLst":
          return { _passthrough: !0, kind: "custClrLst", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:custDash":
          return { _passthrough: !0, kind: "custDash", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:custGeom":
          return { _passthrough: !0, kind: "custGeom", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:cxn":
          return { _passthrough: !0, kind: "cxn", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:cxnLst":
          return { _passthrough: !0, kind: "cxnLst", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:cxnSp":
          return { _passthrough: !0, kind: "cxnSp", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:cxnSpLocks":
          return { _passthrough: !0, kind: "cxnSpLocks", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:defPPr":
          return { _passthrough: !0, kind: "defPPr", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:dgm":
          return { _passthrough: !0, kind: "dgm", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:dk1":
          return { _passthrough: !0, kind: "dk1", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:dk2":
          return { _passthrough: !0, kind: "dk2", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:ds":
          return { _passthrough: !0, kind: "ds", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:end":
          return { _passthrough: !0, kind: "end", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:extLst":
          return { _passthrough: !0, kind: "extLst", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:extraClrScheme":
          return { _passthrough: !0, kind: "extraClrScheme", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:fill":
          return { _passthrough: !0, kind: "fill", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:fillStyleLst":
          return { _passthrough: !0, kind: "fillStyleLst", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:firstCol":
          return { _passthrough: !0, kind: "firstCol", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:firstRow":
          return { _passthrough: !0, kind: "firstRow", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:folHlink":
          return { _passthrough: !0, kind: "folHlink", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:font":
          return { _passthrough: !0, kind: "font", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:gamma":
          return { _passthrough: !0, kind: "gamma", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:graphicFrame":
          return { _passthrough: !0, kind: "graphicFrame", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:gray":
          return { _passthrough: !0, kind: "gray", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:green":
          return { _passthrough: !0, kind: "green", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:greenMod":
          return { _passthrough: !0, kind: "greenMod", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:greenOff":
          return { _passthrough: !0, kind: "greenOff", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:grpFill":
          return { _passthrough: !0, kind: "grpFill", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:grpSp":
          return { _passthrough: !0, kind: "grpSp", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:grpSpPr":
          return { _passthrough: !0, kind: "grpSpPr", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:headEnd":
          return { _passthrough: !0, kind: "headEnd", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:header":
          return { _passthrough: !0, kind: "header", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:headers":
          return { _passthrough: !0, kind: "headers", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:highlight":
          return { _passthrough: !0, kind: "highlight", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:hlink":
          return { _passthrough: !0, kind: "hlink", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:hlinkClick":
          return { _passthrough: !0, kind: "hlinkClick", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:hlinkHover":
          return { _passthrough: !0, kind: "hlinkHover", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:hlinkMouseOver":
          return { _passthrough: !0, kind: "hlinkMouseOver", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:hsl":
          return { _passthrough: !0, kind: "hsl", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:hue":
          return { _passthrough: !0, kind: "hue", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:hueMod":
          return { _passthrough: !0, kind: "hueMod", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:hueOff":
          return { _passthrough: !0, kind: "hueOff", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:insideH":
          return { _passthrough: !0, kind: "insideH", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:insideV":
          return { _passthrough: !0, kind: "insideV", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:inv":
          return { _passthrough: !0, kind: "inv", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:invGamma":
          return { _passthrough: !0, kind: "invGamma", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:lastCol":
          return { _passthrough: !0, kind: "lastCol", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:lastRow":
          return { _passthrough: !0, kind: "lastRow", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:left":
          return { _passthrough: !0, kind: "left", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:lnB":
          return { _passthrough: !0, kind: "lnB", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:lnBlToTr":
          return { _passthrough: !0, kind: "lnBlToTr", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:lnDef":
          return { _passthrough: !0, kind: "lnDef", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:lnL":
          return { _passthrough: !0, kind: "lnL", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:lnR":
          return { _passthrough: !0, kind: "lnR", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:lnSpc":
          return { _passthrough: !0, kind: "lnSpc", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:lnStyleLst":
          return { _passthrough: !0, kind: "lnStyleLst", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:lnT":
          return { _passthrough: !0, kind: "lnT", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:lnTlToBr":
          return { _passthrough: !0, kind: "lnTlToBr", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:lt1":
          return { _passthrough: !0, kind: "lt1", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:lt2":
          return { _passthrough: !0, kind: "lt2", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:lvl1pPr":
          return { _passthrough: !0, kind: "lvl1pPr", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:lvl2pPr":
          return { _passthrough: !0, kind: "lvl2pPr", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:lvl3pPr":
          return { _passthrough: !0, kind: "lvl3pPr", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:lvl4pPr":
          return { _passthrough: !0, kind: "lvl4pPr", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:lvl5pPr":
          return { _passthrough: !0, kind: "lvl5pPr", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:lvl6pPr":
          return { _passthrough: !0, kind: "lvl6pPr", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:lvl7pPr":
          return { _passthrough: !0, kind: "lvl7pPr", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:lvl8pPr":
          return { _passthrough: !0, kind: "lvl8pPr", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:lvl9pPr":
          return { _passthrough: !0, kind: "lvl9pPr", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:miter":
          return { _passthrough: !0, kind: "miter", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:neCell":
          return { _passthrough: !0, kind: "neCell", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:norm":
          return { _passthrough: !0, kind: "norm", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:nvCxnSpPr":
          return { _passthrough: !0, kind: "nvCxnSpPr", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:nvGraphicFramePr":
          return { _passthrough: !0, kind: "nvGraphicFramePr", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:nvGrpSpPr":
          return { _passthrough: !0, kind: "nvGrpSpPr", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:nvPicPr":
          return { _passthrough: !0, kind: "nvPicPr", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:nvSpPr":
          return { _passthrough: !0, kind: "nvSpPr", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:nwCell":
          return { _passthrough: !0, kind: "nwCell", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:pic":
          return { _passthrough: !0, kind: "pic", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:quickTimeFile":
          return { _passthrough: !0, kind: "quickTimeFile", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:red":
          return { _passthrough: !0, kind: "red", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:redMod":
          return { _passthrough: !0, kind: "redMod", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:redOff":
          return { _passthrough: !0, kind: "redOff", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:relOff":
          return { _passthrough: !0, kind: "relOff", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:right":
          return { _passthrough: !0, kind: "right", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:round":
          return { _passthrough: !0, kind: "round", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:rtl":
          return { _passthrough: !0, kind: "rtl", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:sat":
          return { _passthrough: !0, kind: "sat", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:satMod":
          return { _passthrough: !0, kind: "satMod", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:satOff":
          return { _passthrough: !0, kind: "satOff", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:seCell":
          return { _passthrough: !0, kind: "seCell", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:snd":
          return { _passthrough: !0, kind: "snd", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:sp":
          return { _passthrough: !0, kind: "sp", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:spDef":
          return { _passthrough: !0, kind: "spDef", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:spPr":
          return { _passthrough: !0, kind: "spPr", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:spcAft":
          return { _passthrough: !0, kind: "spcAft", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:spcBef":
          return { _passthrough: !0, kind: "spcBef", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:spcPct":
          return { _passthrough: !0, kind: "spcPct", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:spcPts":
          return { _passthrough: !0, kind: "spcPts", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:st":
          return { _passthrough: !0, kind: "st", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:style":
          return { _passthrough: !0, kind: "style", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:swCell":
          return { _passthrough: !0, kind: "swCell", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:sx":
          return { _passthrough: !0, kind: "sx", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:sy":
          return { _passthrough: !0, kind: "sy", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:sym":
          return { _passthrough: !0, kind: "sym", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:tab":
          return { _passthrough: !0, kind: "tab", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:tabLst":
          return { _passthrough: !0, kind: "tabLst", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:tableStyle":
          return { _passthrough: !0, kind: "tableStyle", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:tailEnd":
          return { _passthrough: !0, kind: "tailEnd", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:tblBg":
          return { _passthrough: !0, kind: "tblBg", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:tblStyle":
          return { _passthrough: !0, kind: "tblStyle", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:tblStyleLst":
          return { _passthrough: !0, kind: "tblStyleLst", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:tcBdr":
          return { _passthrough: !0, kind: "tcBdr", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:tcStyle":
          return { _passthrough: !0, kind: "tcStyle", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:tcTxStyle":
          return { _passthrough: !0, kind: "tcTxStyle", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:themeManager":
          return { _passthrough: !0, kind: "themeManager", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:themeOverride":
          return { _passthrough: !0, kind: "themeOverride", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:tl2br":
          return { _passthrough: !0, kind: "tl2br", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:top":
          return { _passthrough: !0, kind: "top", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:tr2bl":
          return { _passthrough: !0, kind: "tr2bl", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:txDef":
          return { _passthrough: !0, kind: "txDef", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:txSp":
          return { _passthrough: !0, kind: "txSp", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:uFill":
          return { _passthrough: !0, kind: "uFill", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:uFillTx":
          return { _passthrough: !0, kind: "uFillTx", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:uLn":
          return { _passthrough: !0, kind: "uLn", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:uLnTx":
          return { _passthrough: !0, kind: "uLnTx", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:up":
          return { _passthrough: !0, kind: "up", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:useSpRect":
          return { _passthrough: !0, kind: "useSpRect", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:videoFile":
          return { _passthrough: !0, kind: "videoFile", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:wavAudioFile":
          return { _passthrough: !0, kind: "wavAudioFile", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "a:wholeTbl":
          return { _passthrough: !0, kind: "wholeTbl", attrs: { ...el.attrs }, children: [...el.children || []] };
        default:
          return null;
      }
    }
    function renderElement(obj) {
      if (!obj || !obj.kind)
        return null;
      switch (obj.kind) {
        case "accent1":
          return xml.el("a:accent1", obj.attrs || {}, obj.children || []);
        case "accent2":
          return xml.el("a:accent2", obj.attrs || {}, obj.children || []);
        case "accent3":
          return xml.el("a:accent3", obj.attrs || {}, obj.children || []);
        case "accent4":
          return xml.el("a:accent4", obj.attrs || {}, obj.children || []);
        case "accent5":
          return xml.el("a:accent5", obj.attrs || {}, obj.children || []);
        case "accent6":
          return xml.el("a:accent6", obj.attrs || {}, obj.children || []);
        case "ahLst":
          return xml.el("a:ahLst", obj.attrs || {}, obj.children || []);
        case "ahPolar":
          return xml.el("a:ahPolar", obj.attrs || {}, obj.children || []);
        case "ahXY":
          return xml.el("a:ahXY", obj.attrs || {}, obj.children || []);
        case "alpha":
          return xml.el("a:alpha", obj.attrs || {}, obj.children || []);
        case "alphaBiLevel":
          return xml.el("a:alphaBiLevel", obj.attrs || {}, obj.children || []);
        case "alphaCeiling":
          return xml.el("a:alphaCeiling", obj.attrs || {}, obj.children || []);
        case "alphaFloor":
          return xml.el("a:alphaFloor", obj.attrs || {}, obj.children || []);
        case "alphaInv":
          return xml.el("a:alphaInv", obj.attrs || {}, obj.children || []);
        case "alphaMod":
          return xml.el("a:alphaMod", obj.attrs || {}, obj.children || []);
        case "alphaModFix":
          return xml.el("a:alphaModFix", obj.attrs || {}, obj.children || []);
        case "alphaOff":
          return xml.el("a:alphaOff", obj.attrs || {}, obj.children || []);
        case "alphaOutset":
          return xml.el("a:alphaOutset", obj.attrs || {}, obj.children || []);
        case "alphaRepl":
          return xml.el("a:alphaRepl", obj.attrs || {}, obj.children || []);
        case "anchor":
          return xml.el("a:anchor", obj.attrs || {}, obj.children || []);
        case "arcTo":
          return xml.el("a:arcTo", obj.attrs || {}, obj.children || []);
        case "audioCd":
          return xml.el("a:audioCd", obj.attrs || {}, obj.children || []);
        case "audioFile":
          return xml.el("a:audioFile", obj.attrs || {}, obj.children || []);
        case "backdrop":
          return xml.el("a:backdrop", obj.attrs || {}, obj.children || []);
        case "band1H":
          return xml.el("a:band1H", obj.attrs || {}, obj.children || []);
        case "band1V":
          return xml.el("a:band1V", obj.attrs || {}, obj.children || []);
        case "band2H":
          return xml.el("a:band2H", obj.attrs || {}, obj.children || []);
        case "band2V":
          return xml.el("a:band2V", obj.attrs || {}, obj.children || []);
        case "bevel":
          return xml.el("a:bevel", obj.attrs || {}, obj.children || []);
        case "bevelB":
          return xml.el("a:bevelB", obj.attrs || {}, obj.children || []);
        case "bevelT":
          return xml.el("a:bevelT", obj.attrs || {}, obj.children || []);
        case "bgFillStyleLst":
          return xml.el("a:bgFillStyleLst", obj.attrs || {}, obj.children || []);
        case "biLevel":
          return xml.el("a:biLevel", obj.attrs || {}, obj.children || []);
        case "bldChart":
          return xml.el("a:bldChart", obj.attrs || {}, obj.children || []);
        case "bldDgm":
          return xml.el("a:bldDgm", obj.attrs || {}, obj.children || []);
        case "blend":
          return xml.el("a:blend", obj.attrs || {}, obj.children || []);
        case "blipFill":
          return xml.el("a:blipFill", obj.attrs || {}, obj.children || []);
        case "blue":
          return xml.el("a:blue", obj.attrs || {}, obj.children || []);
        case "blueMod":
          return xml.el("a:blueMod", obj.attrs || {}, obj.children || []);
        case "blueOff":
          return xml.el("a:blueOff", obj.attrs || {}, obj.children || []);
        case "blur":
          return xml.el("a:blur", obj.attrs || {}, obj.children || []);
        case "bottom":
          return xml.el("a:bottom", obj.attrs || {}, obj.children || []);
        case "buBlip":
          return xml.el("a:buBlip", obj.attrs || {}, obj.children || []);
        case "buClr":
          return xml.el("a:buClr", obj.attrs || {}, obj.children || []);
        case "buClrTx":
          return xml.el("a:buClrTx", obj.attrs || {}, obj.children || []);
        case "buFont":
          return xml.el("a:buFont", obj.attrs || {}, obj.children || []);
        case "buFontTx":
          return xml.el("a:buFontTx", obj.attrs || {}, obj.children || []);
        case "buSzPct":
          return xml.el("a:buSzPct", obj.attrs || {}, obj.children || []);
        case "buSzPts":
          return xml.el("a:buSzPts", obj.attrs || {}, obj.children || []);
        case "buSzTx":
          return xml.el("a:buSzTx", obj.attrs || {}, obj.children || []);
        case "cNvCxnSpPr":
          return xml.el("a:cNvCxnSpPr", obj.attrs || {}, obj.children || []);
        case "cNvGraphicFramePr":
          return xml.el("a:cNvGraphicFramePr", obj.attrs || {}, obj.children || []);
        case "cNvGrpSpPr":
          return xml.el("a:cNvGrpSpPr", obj.attrs || {}, obj.children || []);
        case "cNvPicPr":
          return xml.el("a:cNvPicPr", obj.attrs || {}, obj.children || []);
        case "cNvPr":
          return xml.el("a:cNvPr", obj.attrs || {}, obj.children || []);
        case "cNvSpPr":
          return xml.el("a:cNvSpPr", obj.attrs || {}, obj.children || []);
        case "camera":
          return xml.el("a:camera", obj.attrs || {}, obj.children || []);
        case "cell3D":
          return xml.el("a:cell3D", obj.attrs || {}, obj.children || []);
        case "chExt":
          return xml.el("a:chExt", obj.attrs || {}, obj.children || []);
        case "chOff":
          return xml.el("a:chOff", obj.attrs || {}, obj.children || []);
        case "chart":
          return xml.el("a:chart", obj.attrs || {}, obj.children || []);
        case "close":
          return xml.el("a:close", obj.attrs || {}, obj.children || []);
        case "clrChange":
          return xml.el("a:clrChange", obj.attrs || {}, obj.children || []);
        case "clrFrom":
          return xml.el("a:clrFrom", obj.attrs || {}, obj.children || []);
        case "clrMap":
          return xml.el("a:clrMap", obj.attrs || {}, obj.children || []);
        case "clrRepl":
          return xml.el("a:clrRepl", obj.attrs || {}, obj.children || []);
        case "clrTo":
          return xml.el("a:clrTo", obj.attrs || {}, obj.children || []);
        case "comp":
          return xml.el("a:comp", obj.attrs || {}, obj.children || []);
        case "cont":
          return xml.el("a:cont", obj.attrs || {}, obj.children || []);
        case "contourClr":
          return xml.el("a:contourClr", obj.attrs || {}, obj.children || []);
        case "cpLocks":
          return xml.el("a:cpLocks", obj.attrs || {}, obj.children || []);
        case "cubicBezTo":
          return xml.el("a:cubicBezTo", obj.attrs || {}, obj.children || []);
        case "custClr":
          return xml.el("a:custClr", obj.attrs || {}, obj.children || []);
        case "custClrLst":
          return xml.el("a:custClrLst", obj.attrs || {}, obj.children || []);
        case "custDash":
          return xml.el("a:custDash", obj.attrs || {}, obj.children || []);
        case "custGeom":
          return xml.el("a:custGeom", obj.attrs || {}, obj.children || []);
        case "cxn":
          return xml.el("a:cxn", obj.attrs || {}, obj.children || []);
        case "cxnLst":
          return xml.el("a:cxnLst", obj.attrs || {}, obj.children || []);
        case "cxnSp":
          return xml.el("a:cxnSp", obj.attrs || {}, obj.children || []);
        case "cxnSpLocks":
          return xml.el("a:cxnSpLocks", obj.attrs || {}, obj.children || []);
        case "defPPr":
          return xml.el("a:defPPr", obj.attrs || {}, obj.children || []);
        case "dgm":
          return xml.el("a:dgm", obj.attrs || {}, obj.children || []);
        case "dk1":
          return xml.el("a:dk1", obj.attrs || {}, obj.children || []);
        case "dk2":
          return xml.el("a:dk2", obj.attrs || {}, obj.children || []);
        case "ds":
          return xml.el("a:ds", obj.attrs || {}, obj.children || []);
        case "end":
          return xml.el("a:end", obj.attrs || {}, obj.children || []);
        case "extLst":
          return xml.el("a:extLst", obj.attrs || {}, obj.children || []);
        case "extraClrScheme":
          return xml.el("a:extraClrScheme", obj.attrs || {}, obj.children || []);
        case "fill":
          return xml.el("a:fill", obj.attrs || {}, obj.children || []);
        case "fillStyleLst":
          return xml.el("a:fillStyleLst", obj.attrs || {}, obj.children || []);
        case "firstCol":
          return xml.el("a:firstCol", obj.attrs || {}, obj.children || []);
        case "firstRow":
          return xml.el("a:firstRow", obj.attrs || {}, obj.children || []);
        case "folHlink":
          return xml.el("a:folHlink", obj.attrs || {}, obj.children || []);
        case "font":
          return xml.el("a:font", obj.attrs || {}, obj.children || []);
        case "gamma":
          return xml.el("a:gamma", obj.attrs || {}, obj.children || []);
        case "graphicFrame":
          return xml.el("a:graphicFrame", obj.attrs || {}, obj.children || []);
        case "gray":
          return xml.el("a:gray", obj.attrs || {}, obj.children || []);
        case "green":
          return xml.el("a:green", obj.attrs || {}, obj.children || []);
        case "greenMod":
          return xml.el("a:greenMod", obj.attrs || {}, obj.children || []);
        case "greenOff":
          return xml.el("a:greenOff", obj.attrs || {}, obj.children || []);
        case "grpFill":
          return xml.el("a:grpFill", obj.attrs || {}, obj.children || []);
        case "grpSp":
          return xml.el("a:grpSp", obj.attrs || {}, obj.children || []);
        case "grpSpPr":
          return xml.el("a:grpSpPr", obj.attrs || {}, obj.children || []);
        case "headEnd":
          return xml.el("a:headEnd", obj.attrs || {}, obj.children || []);
        case "header":
          return xml.el("a:header", obj.attrs || {}, obj.children || []);
        case "headers":
          return xml.el("a:headers", obj.attrs || {}, obj.children || []);
        case "highlight":
          return xml.el("a:highlight", obj.attrs || {}, obj.children || []);
        case "hlink":
          return xml.el("a:hlink", obj.attrs || {}, obj.children || []);
        case "hlinkClick":
          return xml.el("a:hlinkClick", obj.attrs || {}, obj.children || []);
        case "hlinkHover":
          return xml.el("a:hlinkHover", obj.attrs || {}, obj.children || []);
        case "hlinkMouseOver":
          return xml.el("a:hlinkMouseOver", obj.attrs || {}, obj.children || []);
        case "hsl":
          return xml.el("a:hsl", obj.attrs || {}, obj.children || []);
        case "hue":
          return xml.el("a:hue", obj.attrs || {}, obj.children || []);
        case "hueMod":
          return xml.el("a:hueMod", obj.attrs || {}, obj.children || []);
        case "hueOff":
          return xml.el("a:hueOff", obj.attrs || {}, obj.children || []);
        case "insideH":
          return xml.el("a:insideH", obj.attrs || {}, obj.children || []);
        case "insideV":
          return xml.el("a:insideV", obj.attrs || {}, obj.children || []);
        case "inv":
          return xml.el("a:inv", obj.attrs || {}, obj.children || []);
        case "invGamma":
          return xml.el("a:invGamma", obj.attrs || {}, obj.children || []);
        case "lastCol":
          return xml.el("a:lastCol", obj.attrs || {}, obj.children || []);
        case "lastRow":
          return xml.el("a:lastRow", obj.attrs || {}, obj.children || []);
        case "left":
          return xml.el("a:left", obj.attrs || {}, obj.children || []);
        case "lnB":
          return xml.el("a:lnB", obj.attrs || {}, obj.children || []);
        case "lnBlToTr":
          return xml.el("a:lnBlToTr", obj.attrs || {}, obj.children || []);
        case "lnDef":
          return xml.el("a:lnDef", obj.attrs || {}, obj.children || []);
        case "lnL":
          return xml.el("a:lnL", obj.attrs || {}, obj.children || []);
        case "lnR":
          return xml.el("a:lnR", obj.attrs || {}, obj.children || []);
        case "lnSpc":
          return xml.el("a:lnSpc", obj.attrs || {}, obj.children || []);
        case "lnStyleLst":
          return xml.el("a:lnStyleLst", obj.attrs || {}, obj.children || []);
        case "lnT":
          return xml.el("a:lnT", obj.attrs || {}, obj.children || []);
        case "lnTlToBr":
          return xml.el("a:lnTlToBr", obj.attrs || {}, obj.children || []);
        case "lt1":
          return xml.el("a:lt1", obj.attrs || {}, obj.children || []);
        case "lt2":
          return xml.el("a:lt2", obj.attrs || {}, obj.children || []);
        case "lvl1pPr":
          return xml.el("a:lvl1pPr", obj.attrs || {}, obj.children || []);
        case "lvl2pPr":
          return xml.el("a:lvl2pPr", obj.attrs || {}, obj.children || []);
        case "lvl3pPr":
          return xml.el("a:lvl3pPr", obj.attrs || {}, obj.children || []);
        case "lvl4pPr":
          return xml.el("a:lvl4pPr", obj.attrs || {}, obj.children || []);
        case "lvl5pPr":
          return xml.el("a:lvl5pPr", obj.attrs || {}, obj.children || []);
        case "lvl6pPr":
          return xml.el("a:lvl6pPr", obj.attrs || {}, obj.children || []);
        case "lvl7pPr":
          return xml.el("a:lvl7pPr", obj.attrs || {}, obj.children || []);
        case "lvl8pPr":
          return xml.el("a:lvl8pPr", obj.attrs || {}, obj.children || []);
        case "lvl9pPr":
          return xml.el("a:lvl9pPr", obj.attrs || {}, obj.children || []);
        case "miter":
          return xml.el("a:miter", obj.attrs || {}, obj.children || []);
        case "neCell":
          return xml.el("a:neCell", obj.attrs || {}, obj.children || []);
        case "norm":
          return xml.el("a:norm", obj.attrs || {}, obj.children || []);
        case "nvCxnSpPr":
          return xml.el("a:nvCxnSpPr", obj.attrs || {}, obj.children || []);
        case "nvGraphicFramePr":
          return xml.el("a:nvGraphicFramePr", obj.attrs || {}, obj.children || []);
        case "nvGrpSpPr":
          return xml.el("a:nvGrpSpPr", obj.attrs || {}, obj.children || []);
        case "nvPicPr":
          return xml.el("a:nvPicPr", obj.attrs || {}, obj.children || []);
        case "nvSpPr":
          return xml.el("a:nvSpPr", obj.attrs || {}, obj.children || []);
        case "nwCell":
          return xml.el("a:nwCell", obj.attrs || {}, obj.children || []);
        case "pic":
          return xml.el("a:pic", obj.attrs || {}, obj.children || []);
        case "quickTimeFile":
          return xml.el("a:quickTimeFile", obj.attrs || {}, obj.children || []);
        case "red":
          return xml.el("a:red", obj.attrs || {}, obj.children || []);
        case "redMod":
          return xml.el("a:redMod", obj.attrs || {}, obj.children || []);
        case "redOff":
          return xml.el("a:redOff", obj.attrs || {}, obj.children || []);
        case "relOff":
          return xml.el("a:relOff", obj.attrs || {}, obj.children || []);
        case "right":
          return xml.el("a:right", obj.attrs || {}, obj.children || []);
        case "round":
          return xml.el("a:round", obj.attrs || {}, obj.children || []);
        case "rtl":
          return xml.el("a:rtl", obj.attrs || {}, obj.children || []);
        case "sat":
          return xml.el("a:sat", obj.attrs || {}, obj.children || []);
        case "satMod":
          return xml.el("a:satMod", obj.attrs || {}, obj.children || []);
        case "satOff":
          return xml.el("a:satOff", obj.attrs || {}, obj.children || []);
        case "seCell":
          return xml.el("a:seCell", obj.attrs || {}, obj.children || []);
        case "snd":
          return xml.el("a:snd", obj.attrs || {}, obj.children || []);
        case "sp":
          return xml.el("a:sp", obj.attrs || {}, obj.children || []);
        case "spDef":
          return xml.el("a:spDef", obj.attrs || {}, obj.children || []);
        case "spPr":
          return xml.el("a:spPr", obj.attrs || {}, obj.children || []);
        case "spcAft":
          return xml.el("a:spcAft", obj.attrs || {}, obj.children || []);
        case "spcBef":
          return xml.el("a:spcBef", obj.attrs || {}, obj.children || []);
        case "spcPct":
          return xml.el("a:spcPct", obj.attrs || {}, obj.children || []);
        case "spcPts":
          return xml.el("a:spcPts", obj.attrs || {}, obj.children || []);
        case "st":
          return xml.el("a:st", obj.attrs || {}, obj.children || []);
        case "style":
          return xml.el("a:style", obj.attrs || {}, obj.children || []);
        case "swCell":
          return xml.el("a:swCell", obj.attrs || {}, obj.children || []);
        case "sx":
          return xml.el("a:sx", obj.attrs || {}, obj.children || []);
        case "sy":
          return xml.el("a:sy", obj.attrs || {}, obj.children || []);
        case "sym":
          return xml.el("a:sym", obj.attrs || {}, obj.children || []);
        case "tab":
          return xml.el("a:tab", obj.attrs || {}, obj.children || []);
        case "tabLst":
          return xml.el("a:tabLst", obj.attrs || {}, obj.children || []);
        case "tableStyle":
          return xml.el("a:tableStyle", obj.attrs || {}, obj.children || []);
        case "tailEnd":
          return xml.el("a:tailEnd", obj.attrs || {}, obj.children || []);
        case "tblBg":
          return xml.el("a:tblBg", obj.attrs || {}, obj.children || []);
        case "tblStyle":
          return xml.el("a:tblStyle", obj.attrs || {}, obj.children || []);
        case "tblStyleLst":
          return xml.el("a:tblStyleLst", obj.attrs || {}, obj.children || []);
        case "tcBdr":
          return xml.el("a:tcBdr", obj.attrs || {}, obj.children || []);
        case "tcStyle":
          return xml.el("a:tcStyle", obj.attrs || {}, obj.children || []);
        case "tcTxStyle":
          return xml.el("a:tcTxStyle", obj.attrs || {}, obj.children || []);
        case "themeManager":
          return xml.el("a:themeManager", obj.attrs || {}, obj.children || []);
        case "themeOverride":
          return xml.el("a:themeOverride", obj.attrs || {}, obj.children || []);
        case "tl2br":
          return xml.el("a:tl2br", obj.attrs || {}, obj.children || []);
        case "top":
          return xml.el("a:top", obj.attrs || {}, obj.children || []);
        case "tr2bl":
          return xml.el("a:tr2bl", obj.attrs || {}, obj.children || []);
        case "txDef":
          return xml.el("a:txDef", obj.attrs || {}, obj.children || []);
        case "txSp":
          return xml.el("a:txSp", obj.attrs || {}, obj.children || []);
        case "uFill":
          return xml.el("a:uFill", obj.attrs || {}, obj.children || []);
        case "uFillTx":
          return xml.el("a:uFillTx", obj.attrs || {}, obj.children || []);
        case "uLn":
          return xml.el("a:uLn", obj.attrs || {}, obj.children || []);
        case "uLnTx":
          return xml.el("a:uLnTx", obj.attrs || {}, obj.children || []);
        case "up":
          return xml.el("a:up", obj.attrs || {}, obj.children || []);
        case "useSpRect":
          return xml.el("a:useSpRect", obj.attrs || {}, obj.children || []);
        case "videoFile":
          return xml.el("a:videoFile", obj.attrs || {}, obj.children || []);
        case "wavAudioFile":
          return xml.el("a:wavAudioFile", obj.attrs || {}, obj.children || []);
        case "wholeTbl":
          return xml.el("a:wholeTbl", obj.attrs || {}, obj.children || []);
        default:
          return null;
      }
    }
    return { parseElement, renderElement, ELEMENTS };
  } });

    const __core = __resolve("xlsx");
    __core.use(__resolve("smlPivotTables"), __resolve("smlCalculation"), __resolve("smlSheetConfig"), __resolve("smlWorkbookConfig"), __resolve("dmlChartDataLabels"), __resolve("dmlChartTrendlines"), __resolve("dmlChartAxesAdvanced"), __resolve("dmlChart3d"), __resolve("dmlChartOtherTypes"), __resolve("dmlEffects"), __resolve("dmlFillsAdvanced"), __resolve("smlFormControls"), __resolve("dmlShapesAdvanced"), __resolve("dmlXdrAdvanced"), __resolve("transitional"), __resolve("legacyVml"), __resolve("smlMisc"), __resolve("dmlChartMisc"), __resolve("dmlMainMisc"));
    return __core;
    }
};
