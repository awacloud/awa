/*!
 * Copyright (c) 2026 AwaCloud SAS
 * Author: Matthieu Bouilloux
 * SPDX-License-Identifier: AGPL-3.0-only
 * Dual-licensed; see the NOTICE file for licensing and any additional terms.
 */
/* GENERATED — do not edit. Source: packages/front/office/ooxml/tools/generate-bundles.mjs */

/**
 * @fileoverview `@awacloud/ooxml/bundles/prebuilt/docx-package` — pre-built single-factory bundle.
 *
 * Variant **package** : declares the 7 fw modules as dependencies and inlines every
 * ooxml-local factory transitively reachable from `docx` .
 *
 * @module ooxml/bundles/prebuilt/docx-package
 */

export const docxPackage = {
    name: "docxPackage",
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
        Object.defineProperty(this, "name", {
          value: new.target.name,
          writable: !0,
          enumerable: !0,
          configurable: !0
        });
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
    __register({ name: "docxText", dependencies: [], factory: function() {
    function toText(doc) {
      const lines = [];
      for (const node of doc.body || [])
        if (node.type === "paragraph")
          lines.push(textOfParagraph(node));
        else if (node.type === "table")
          lines.push(textOfTable(node));
      return lines.join(`
`);
    }
    function textOfParagraph(p) {
      const out = [];
      for (const c of p.children || [])
        if (c.type === "run")
          out.push(textOfRun(c));
        else if (c.type === "hyperlink" || c.type === "ins" || c.type === "moveTo" || c.type === "smartTag")
          out.push(textOfParagraph(c));
      return out.join("");
    }
    function textOfRun(r) {
      const out = [];
      for (const c of r.children || [])
        if (c.type === "text")
          out.push(c.value);
        else if (c.type === "tab")
          out.push("\t");
        else if (c.type === "break")
          out.push(`
`);
        else if (c.type === "noBreakHyphen")
          out.push("\u2011");
      return out.join("");
    }
    function textOfTable(t) {
      const lines = [];
      for (const row of t.rows || []) {
        const cells = [];
        for (const cell of row.cells || []) {
          const inner = [];
          for (const node of cell.children || [])
            if (node.type === "paragraph")
              inner.push(textOfParagraph(node));
            else if (node.type === "table")
              inner.push(textOfTable(node));
          cells.push(inner.join(" "));
        }
        lines.push(cells.join("\t"));
      }
      return lines.join(`
`);
    }
    return { toText, textOfParagraph, textOfRun, textOfTable };
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
      THEME: NS.R + "/theme",
      NOTES_SLIDE: NS.R + "/notesSlide",
      NOTES_MASTER: NS.R + "/notesMaster",
      HANDOUT_MASTER: NS.R + "/handoutMaster"
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
      CUSTOM_XML_PROPS: "application/vnd.openxmlformats-officedocument.customXmlProperties+xml",
      NOTES_SLIDE: "application/vnd.openxmlformats-officedocument.presentationml.notesSlide+xml",
      NOTES_MASTER: "application/vnd.openxmlformats-officedocument.presentationml.notesMaster+xml",
      HANDOUT_MASTER: "application/vnd.openxmlformats-officedocument.presentationml.handoutMaster+xml"
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
    const WORD_ROOT_PREFIXES = Object.freeze([
      ["wp", NS.WP, !1],
      ["a", NS.A, !1],
      ["pic", NS.PIC, !1],
      ["wps", "http://schemas.microsoft.com/office/word/2010/wordprocessingShape", !1],
      ["wpg", "http://schemas.microsoft.com/office/word/2010/wordprocessingGroup", !1],
      ["wpc", "http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas", !1],
      ["c", NS.C, !1],
      ["m", NS.M, !1],
      ["v", "urn:schemas-microsoft-com:vml", !1],
      ["o", "urn:schemas-microsoft-com:office:office", !1],
      ["w10", "urn:schemas-microsoft-com:office:word", !1],
      ["wp14", "http://schemas.microsoft.com/office/word/2010/wordprocessingDrawing", !0],
      ["w14", "http://schemas.microsoft.com/office/word/2010/wordml", !0],
      ["w15", NS.W15, !0],
      ["w16", "http://schemas.microsoft.com/office/word/2018/wordml", !0],
      ["w16cex", "http://schemas.microsoft.com/office/word/2018/wordml/cex", !0],
      ["w16cid", "http://schemas.microsoft.com/office/word/2016/wordml/cid", !0],
      ["w16se", "http://schemas.microsoft.com/office/word/2015/wordml/symex", !0],
      ["w16sdtdh", "http://schemas.microsoft.com/office/word/2020/wordml/sdtdatahash", !0]
    ]), WORD_EXTENSION_PREFIXES = Object.freeze(WORD_ROOT_PREFIXES.filter(([, , ext]) => ext).map(([p]) => p));
    function wordRootAttrs(nodes, opts) {
      const alwaysR = !(opts && opts.r === !1), used = new Set;
      collectUnscopedPrefixes(nodes, new Set(alwaysR ? ["w", "r"] : ["w"]), used);
      const attrs = alwaysR || used.has("r") ? { "xmlns:w": NS.W, "xmlns:r": NS.R } : { "xmlns:w": NS.W };
      if (hasWord2012Element(nodes))
        used.add("w15");
      const declared = WORD_ROOT_PREFIXES.filter(([p]) => used.has(p)), ignorable = declared.filter(([, , ext]) => ext).map(([p]) => p);
      if (used.has("mc") || ignorable.length)
        attrs["xmlns:mc"] = NS.MC;
      for (const [p, uri] of declared)
        attrs["xmlns:" + p] = uri;
      if (ignorable.length)
        attrs["mc:Ignorable"] = ignorable.join(" ");
      return attrs;
    }
    function collectUnscopedPrefixes(nodes, scope, used) {
      for (const n of nodes || []) {
        if (!n || n.type !== "element" || typeof n.name !== "string")
          continue;
        const attrs = n.attrs || {};
        let inner = scope;
        for (const k of Object.keys(attrs)) {
          if (!k.startsWith("xmlns:"))
            continue;
          if (inner === scope)
            inner = new Set(scope);
          inner.add(k.slice(6));
        }
        addUnscoped(n.name, inner, used);
        for (const k of Object.keys(attrs))
          addUnscoped(k, inner, used);
        if (n.name.endsWith(":Choice") && typeof attrs.Requires === "string") {
          for (const p of attrs.Requires.split(/\s+/))
            if (p)
              addUnscoped(p + ":", inner, used);
        }
        collectUnscopedPrefixes(n.children, inner, used);
      }
    }
    function addUnscoped(qname, scope, used) {
      const i = qname.indexOf(":");
      if (i < 0)
        return;
      const prefix = qname.slice(0, i);
      if (prefix !== "xml" && prefix !== "xmlns" && !scope.has(prefix))
        used.add(prefix);
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
    function parseSrcRect(el) {
      const out = {};
      for (const k of ["l", "t", "r", "b"]) {
        const v = el.attrs && el.attrs[k];
        if (v != null && Number.isFinite(Number(v)))
          out[k] = Number(v);
      }
      return out;
    }
    function srcRectAttrs(rect) {
      const out = {};
      for (const k of ["l", "t", "r", "b"])
        if (rect && rect[k] != null)
          out[k] = String(rect[k]);
      return out;
    }
    function createTypedColorCodec(xml) {
      function parse(el) {
        let out;
        if (el && el.name === "a:srgbClr")
          out = { rgb: el.attrs.val };
        else if (el && el.name === "a:schemeClr")
          out = { schemeColor: el.attrs.val };
        else
          return null;
        const mods = [];
        for (const c of el.children || []) {
          if (c.type !== "element")
            continue;
          if (!c.name.startsWith("a:"))
            return null;
          const attrs = c.attrs || {};
          if (Object.keys(attrs).some((k) => k !== "val"))
            return null;
          if ((c.children || []).some((n) => n.type === "element"))
            return null;
          const m = { name: c.name.slice(2) };
          if (attrs.val != null) {
            const v = Number(attrs.val);
            if (!Number.isFinite(v) || String(v) !== attrs.val)
              return null;
            m.val = v;
          }
          mods.push(m);
        }
        if (mods.length)
          out.mods = mods;
        return out;
      }
      function render(color) {
        if (!color || typeof color !== "object")
          return null;
        const mods = (color.mods || []).map((m) => xml.el("a:" + m.name, m.val != null ? { val: String(m.val) } : {}));
        if (color.rgb)
          return xml.el("a:srgbClr", { val: String(color.rgb).replace(/^#/, "") }, mods);
        if (color.schemeColor)
          return xml.el("a:schemeClr", { val: color.schemeColor }, mods);
        return null;
      }
      return { parse, render };
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
            if (/^a:\w+$/.test(el.name) && !(el.children || []).some((c) => c.type === "element"))
              return { kind: el.name.slice(2), attrs: { ...el.attrs } };
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
            return m.kind ? xml.el("a:" + m.kind, m.attrs || {}) : null;
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
    function sequence(names) {
      const rank = new Map;
      let change = -1;
      names.forEach((entry, i) => {
        for (const n of Array.isArray(entry) ? entry : [entry]) {
          rank.set(n, i);
          if (change < 0 && /Change$/.test(n))
            change = i;
        }
      });
      return { rank, other: change >= 0 ? change - 0.5 : names.length };
    }
    function orderBySequence(children, seq) {
      const firstElement = (el) => (el && el.children || []).find((k) => k && k.type === "element"), nameOf = (c) => {
        if (c.name !== "mc:AlternateContent")
          return c.name;
        const branches = (c.children || []).filter((k) => k && k.type === "element"), branch = branches.find((k) => k.name === "mc:Fallback") || branches.find((k) => k.name === "mc:Choice"), inner = firstElement(branch);
        return inner ? inner.name : c.name;
      };
      return children.map((c, i) => {
        const n = c && c.type === "element" ? nameOf(c) : null;
        return { c, i, r: n !== null && seq.rank.has(n) ? seq.rank.get(n) : seq.other };
      }).sort((a, b) => a.r - b.r || a.i - b.i).map((x) => x.c);
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
      WORD_EXTENSION_PREFIXES,
      encodeText,
      decodeText,
      createRidAllocator,
      createTypedColorCodec,
      parseSrcRect,
      srcRectAttrs,
      createDmlColorCodec,
      createXlsxColorCodec,
      sequence,
      orderBySequence
    };
  } });
    __register({ name: "opcPackage", dependencies: ["ooxmlErrors","zip","opcContentTypes","opcRelationships","ooxmlShared"], factory: function(errors, zipMod, contentTypesMod, relsMod, shared) {
    const { ParseError, RenderError, ContractError } = errors, DEFAULT_LIMITS = Object.freeze({
      maxParts: 8192,
      maxUncompressed: 268435456,
      maxRatio: 200,
      maxDepth: 1000
    }), XML_PART_RE = /\.(xml|rels|vml)$/i;
    function deeperThan(s, limit) {
      const n = s.length;
      let depth = 0, i = s.indexOf("<");
      while (i !== -1 && i < n) {
        const c = s.charCodeAt(i + 1);
        let end;
        if (c === 47) {
          depth--;
          end = s.indexOf(">", i + 2);
        } else if (c === 63) {
          end = s.indexOf("?>", i + 2);
          if (end !== -1)
            end += 1;
        } else if (c === 33)
          if (s.startsWith("<!--", i)) {
            end = s.indexOf("-->", i + 4);
            if (end !== -1)
              end += 2;
          } else if (s.startsWith("<![CDATA[", i)) {
            end = s.indexOf("]]>", i + 9);
            if (end !== -1)
              end += 2;
          } else
            end = s.indexOf(">", i + 2);
        else {
          let j = i + 1, quote = 0;
          for (;j < n; j++) {
            const b = s.charCodeAt(j);
            if (quote) {
              if (b === quote)
                quote = 0;
            } else if (b === 34 || b === 39)
              quote = b;
            else if (b === 62)
              break;
          }
          end = j < n ? j : -1;
          if (end !== -1 && s.charCodeAt(end - 1) !== 47 && ++depth > limit)
            return !0;
        }
        if (end === -1)
          return !1;
        i = s.indexOf("<", end + 1);
      }
      return !1;
    }
    const LEADING_SLASH_RE = /^\//, { encodeText, decodeText } = shared;
    function bytesToString(u8) {
      return decodeText(u8);
    }
    function stringToBytes(s) {
      return encodeText(s);
    }
    function read(bytes, opts) {
      if (!(bytes instanceof Uint8Array))
        throw new ContractError("opc/invalid-input", "OPC read: bytes must be a Uint8Array", { context: { received: bytes === null ? "null" : typeof bytes } });
      const maxParts = opts && opts.maxParts !== void 0 ? opts.maxParts : DEFAULT_LIMITS.maxParts, maxUncompressed = opts && opts.maxUncompressed !== void 0 ? opts.maxUncompressed : DEFAULT_LIMITS.maxUncompressed, maxRatio = opts && opts.maxRatio !== void 0 ? opts.maxRatio : DEFAULT_LIMITS.maxRatio, maxDepth = opts && opts.maxDepth !== void 0 ? opts.maxDepth : DEFAULT_LIMITS.maxDepth;
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
      if (maxDepth)
        for (const path of Object.keys(files)) {
          if (!XML_PART_RE.test(path))
            continue;
          if (deeperThan(bytesToString(files[path]), maxDepth))
            throw new ParseError("opc/xml-too-deep", `OPC: part ${path} nests elements deeper than ${maxDepth}`, { context: { limit: "maxDepth", max: maxDepth, partName: path } });
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
    __register({ name: "docxProperties", dependencies: ["xml"], factory: function(xml) {
    function readToggle(el) {
      if (!el)
        return;
      const v = el.attrs["w:val"];
      if (v === void 0)
        return !0;
      return !(v === "0" || v === "false" || v === "off");
    }
    function writeToggle(name, value) {
      if (value === !0)
        return xml.el(name, {});
      if (value === !1)
        return xml.el(name, { "w:val": "0" });
      return null;
    }
    function toggleForm(v) {
      if (v === void 0 || v === "true" || v === "1" || v === "on")
        return "on";
      if (v === "false" || v === "0" || v === "off")
        return "off";
      return v;
    }
    function significant(children) {
      return (children || []).filter((c) => !(c && c.type === "text" && /^\s*$/.test(String(c.value ?? c.text ?? ""))));
    }
    function sameElement(a, b) {
      if (!a || !b || a.type !== b.type)
        return !1;
      if (a.type !== "element")
        return String(a.value ?? a.text ?? "") === String(b.value ?? b.text ?? "");
      if (a.name !== b.name)
        return !1;
      const ka = significant(a.children), kb = significant(b.children), aa = a.attrs || {}, ba = b.attrs || {}, keys = new Set([...Object.keys(aa), ...Object.keys(ba)]);
      for (const k of keys)
        if (k === "w:val" && ka.length === 0 && kb.length === 0) {
          if (toggleForm(aa[k]) !== toggleForm(ba[k]))
            return !1;
        } else if (aa[k] !== ba[k])
          return !1;
      if (ka.length !== kb.length)
        return !1;
      for (let i = 0;i < ka.length; i++)
        if (!sameElement(ka[i], kb[i]))
          return !1;
      return !0;
    }
    function isPlain(v) {
      return !!v && typeof v === "object" && !Array.isArray(v);
    }
    function hydrateLossless(bag, typeBag, untypeBag) {
      if (!bag || !Array.isArray(bag._extras))
        return bag;
      const count = new Map;
      for (const c of bag._extras)
        if (c && c.type === "element")
          count.set(c.name, (count.get(c.name) || 0) + 1);
      const claimed = new Map, keysOf = (k) => {
        if (!claimed.has(k))
          claimed.set(k, new Set(isPlain(bag[k]) ? Object.keys(bag[k]) : []));
        return claimed.get(k);
      }, verdicts = bag._extras.map((c) => {
        if (!c || c.type !== "element")
          return null;
        const probe = typeBag({ _extras: [c] }) || {}, fields = Object.keys(probe).filter((k) => k !== "_extras");
        if (count.get(c.name) > 1 && !fields.every((k) => Array.isArray(probe[k])))
          return null;
        const merges = (k) => Array.isArray(probe[k]) && (bag[k] === void 0 || Array.isArray(bag[k])) || isPlain(probe[k]) && (bag[k] === void 0 || isPlain(bag[k])) && (k[0] === "_" || Object.keys(probe[k]).every((s) => !keysOf(k).has(s))), taken = (k) => bag[k] !== void 0 || claimed.has(k), clash = fields.some((k) => taken(k) && !merges(k));
        if (fields.length === 0 || (probe._extras || []).length > 0 || clash)
          return null;
        const back = (untypeBag({ ...probe }) || {})._extras || [];
        if (back.length !== 1 || !sameElement(back[0], c))
          return null;
        for (const k of fields) {
          const keys = keysOf(k);
          if (isPlain(probe[k]))
            for (const s of Object.keys(probe[k]))
              keys.add(s);
        }
        return { name: c.name, probe, fields };
      }), refused = new Set;
      bag._extras.forEach((c, i) => {
        if (c && c.type === "element" && count.get(c.name) > 1 && verdicts[i] === null)
          refused.add(c.name);
      });
      const remaining = [];
      bag._extras.forEach((c, i) => {
        const v = verdicts[i];
        if (v === null || refused.has(v.name)) {
          remaining.push(c);
          return;
        }
        for (const k of v.fields)
          if (Array.isArray(v.probe[k]))
            bag[k] = (Array.isArray(bag[k]) ? bag[k] : []).concat(v.probe[k]);
          else if (isPlain(bag[k]))
            bag[k] = { ...bag[k], ...v.probe[k] };
          else
            bag[k] = v.probe[k];
      });
      if (remaining.length)
        bag._extras = remaining;
      else
        delete bag._extras;
      return bag;
    }
    function valOf(el) {
      return el ? el.attrs["w:val"] : void 0;
    }
    function elVal(name, val) {
      return xml.el(name, { "w:val": String(val) });
    }
    function sequence(names) {
      const rank = new Map;
      let change = -1;
      names.forEach((entry, i) => {
        for (const n of Array.isArray(entry) ? entry : [entry]) {
          rank.set(n, i);
          if (change < 0 && /Change$/.test(n))
            change = i;
        }
      });
      return { rank, other: change >= 0 ? change - 0.5 : names.length };
    }
    function orderBySequence(children, seq) {
      const firstElement = (el) => (el && el.children || []).find((k) => k && k.type === "element"), nameOf = (c) => {
        if (c.name !== "mc:AlternateContent")
          return c.name;
        const branches = (c.children || []).filter((k) => k && k.type === "element"), branch = branches.find((k) => k.name === "mc:Fallback") || branches.find((k) => k.name === "mc:Choice"), inner = firstElement(branch);
        return inner ? inner.name : c.name;
      };
      return children.map((c, i) => {
        const n = c && c.type === "element" ? nameOf(c) : null;
        return { c, i, r: n !== null && seq.rank.has(n) ? seq.rank.get(n) : seq.other };
      }).sort((a, b) => a.r - b.r || a.i - b.i).map((x) => x.c);
    }
    const RPR_SEQ = sequence([
      "w:ins",
      "w:del",
      "w:moveFrom",
      "w:moveTo",
      "w:rStyle",
      "w:rFonts",
      "w:b",
      "w:bCs",
      "w:i",
      "w:iCs",
      "w:caps",
      "w:smallCaps",
      "w:strike",
      "w:dstrike",
      "w:outline",
      "w:shadow",
      "w:emboss",
      "w:imprint",
      "w:noProof",
      "w:snapToGrid",
      "w:vanish",
      "w:webHidden",
      "w:color",
      "w:spacing",
      "w:w",
      "w:kern",
      "w:position",
      "w:sz",
      "w:szCs",
      "w:highlight",
      "w:u",
      "w:effect",
      "w:bdr",
      "w:shd",
      "w:fitText",
      "w:vertAlign",
      "w:rtl",
      "w:cs",
      "w:em",
      "w:lang",
      "w:eastAsianLayout",
      "w:specVanish",
      "w:oMath",
      "w:rPrChange"
    ]), PPR_SEQ = sequence([
      "w:pStyle",
      "w:keepNext",
      "w:keepLines",
      "w:pageBreakBefore",
      "w:framePr",
      "w:widowControl",
      "w:numPr",
      "w:suppressLineNumbers",
      "w:pBdr",
      "w:shd",
      "w:tabs",
      "w:suppressAutoHyphens",
      "w:kinsoku",
      "w:wordWrap",
      "w:overflowPunct",
      "w:topLinePunct",
      "w:autoSpaceDE",
      "w:autoSpaceDN",
      "w:bidi",
      "w:adjustRightInd",
      "w:snapToGrid",
      "w:spacing",
      "w:ind",
      "w:contextualSpacing",
      "w:mirrorIndents",
      "w:suppressOverlap",
      "w:jc",
      "w:textDirection",
      "w:textAlignment",
      "w:textboxTightWrap",
      "w:outlineLvl",
      "w:divId",
      "w:cnfStyle",
      "w:rPr",
      "w:sectPr",
      "w:pPrChange"
    ]), TBLPR_SEQ = sequence([
      "w:tblStyle",
      "w:tblpPr",
      "w:tblOverlap",
      "w:bidiVisual",
      "w:tblStyleRowBandSize",
      "w:tblStyleColBandSize",
      "w:tblW",
      "w:jc",
      "w:tblCellSpacing",
      "w:tblInd",
      "w:tblBorders",
      "w:shd",
      "w:tblLayout",
      "w:tblCellMar",
      "w:tblLook",
      "w:tblCaption",
      "w:tblDescription",
      "w:tblPrChange"
    ]), RPR_KNOWN = new Set([
      "w:b",
      "w:i",
      "w:u",
      "w:strike",
      "w:color",
      "w:sz",
      "w:rFonts",
      "w:vertAlign",
      "w:highlight",
      "w:rStyle"
    ]), FONT_SLOTS = ["ascii", "hAnsi", "cs", "asciiTheme", "hAnsiTheme", "cstheme"];
    function parseFonts(el) {
      const out = {};
      for (const [k, v] of Object.entries(el.attrs))
        out[k.replace(/^w:/, "")] = v;
      return out;
    }
    function renderFonts(rPr) {
      const fonts = rPr.fonts && typeof rPr.fonts === "object" ? rPr.fonts : null;
      if (!fonts)
        return rPr.font != null ? xml.el("w:rFonts", { "w:ascii": rPr.font, "w:hAnsi": rPr.font, "w:cs": rPr.font }) : null;
      const derived = fonts.ascii || fonts.hAnsi || fonts.cs, kept = { ...fonts };
      if ((rPr.font ?? void 0) !== derived) {
        for (const k of FONT_SLOTS)
          delete kept[k];
        if (rPr.font != null) {
          kept.ascii = rPr.font;
          kept.hAnsi = rPr.font;
          kept.cs = rPr.font;
        }
      }
      const attrs = {};
      for (const [k, v] of Object.entries(kept))
        if (v != null)
          attrs["w:" + k] = String(v);
      return Object.keys(attrs).length ? xml.el("w:rFonts", attrs) : null;
    }
    const THEME_LINK = [["themeColor", "w:themeColor"], ["themeTint", "w:themeTint"], ["themeShade", "w:themeShade"]];
    function themeLinkOf(el) {
      const out = {};
      for (const [k, a] of THEME_LINK)
        if (el.attrs[a] != null)
          out[k] = el.attrs[a];
      return Object.keys(out).length ? out : void 0;
    }
    function withThemeLink(el, theme) {
      if (theme) {
        for (const [k, a] of THEME_LINK)
          if (theme[k] != null)
            el.attrs[a] = String(theme[k]);
      }
      return el;
    }
    function parseRunProperties(rPrEl) {
      if (!rPrEl)
        return;
      const out = {}, extras = [];
      for (const c of rPrEl.children) {
        if (c.type !== "element")
          continue;
        switch (c.name) {
          case "w:b":
            out.bold = readToggle(c);
            break;
          case "w:i":
            out.italic = readToggle(c);
            break;
          case "w:strike":
            out.strike = readToggle(c);
            break;
          case "w:u": {
            out.underline = valOf(c) || "single";
            if (c.attrs["w:color"] != null)
              out.underlineColor = c.attrs["w:color"];
            const theme = themeLinkOf(c);
            if (theme)
              out.underlineTheme = theme;
            break;
          }
          case "w:color": {
            out.color = valOf(c);
            const theme = themeLinkOf(c);
            if (theme)
              out.colorTheme = theme;
            break;
          }
          case "w:sz":
            out.size = Number(valOf(c));
            break;
          case "w:rFonts":
            out.font = c.attrs["w:ascii"] || c.attrs["w:hAnsi"] || c.attrs["w:cs"];
            out.fonts = parseFonts(c);
            break;
          case "w:vertAlign":
            out.vertAlign = valOf(c);
            break;
          case "w:highlight":
            out.highlight = valOf(c);
            break;
          case "w:rStyle":
            out.rStyle = valOf(c);
            break;
          default:
            if (!RPR_KNOWN.has(c.name))
              extras.push(c);
        }
      }
      if (extras.length)
        out._extras = orderBySequence(extras, RPR_SEQ);
      return out;
    }
    function renderRunProperties(rPr) {
      if (!rPr)
        return null;
      const children = [];
      if (rPr.rStyle != null)
        children.push(elVal("w:rStyle", rPr.rStyle));
      const rFonts = renderFonts(rPr);
      if (rFonts)
        children.push(rFonts);
      const bold = writeToggle("w:b", rPr.bold);
      if (bold)
        children.push(bold);
      const italic = writeToggle("w:i", rPr.italic);
      if (italic)
        children.push(italic);
      const strike = writeToggle("w:strike", rPr.strike);
      if (strike)
        children.push(strike);
      if (rPr.color != null || rPr.colorTheme)
        children.push(withThemeLink(rPr.color != null ? elVal("w:color", rPr.color) : xml.el("w:color", {}), rPr.colorTheme));
      if (rPr.size != null)
        children.push(elVal("w:sz", rPr.size));
      if (rPr.underline != null) {
        const u = elVal("w:u", rPr.underline);
        if (rPr.underlineColor != null)
          u.attrs["w:color"] = String(rPr.underlineColor);
        children.push(withThemeLink(u, rPr.underlineTheme));
      }
      if (rPr.highlight != null)
        children.push(elVal("w:highlight", rPr.highlight));
      if (rPr.vertAlign != null)
        children.push(elVal("w:vertAlign", rPr.vertAlign));
      if (rPr._extras)
        for (const ex of rPr._extras)
          children.push(ex);
      if (!children.length)
        return null;
      return xml.el("w:rPr", {}, orderBySequence(children, RPR_SEQ));
    }
    const PPR_KNOWN = new Set([
      "w:jc",
      "w:ind",
      "w:spacing",
      "w:pStyle",
      "w:numPr",
      "w:rPr"
    ]), SPACING_TYPED = new Set(["w:before", "w:after", "w:line", "w:lineRule"]), IND_TYPED = new Set(["w:left", "w:right", "w:firstLine", "w:hanging"]);
    function keepExtraAttrs(el, out, typed) {
      const extraAttrs = {};
      let any = !1;
      for (const k of Object.keys(el.attrs)) {
        if (typed.has(k) && el.attrs[k])
          continue;
        if (k === "xmlns" || k.startsWith("xmlns:"))
          continue;
        extraAttrs[k] = el.attrs[k];
        any = !0;
      }
      if (any)
        out.extraAttrs = extraAttrs;
    }
    function writeExtraAttrs(a, extraAttrs) {
      if (!extraAttrs)
        return;
      for (const k of Object.keys(extraAttrs))
        if (!(k in a) && extraAttrs[k] !== void 0)
          a[k] = String(extraAttrs[k]);
    }
    function parseParagraphProperties(pPrEl) {
      if (!pPrEl)
        return;
      const out = {}, extras = [];
      for (const c of pPrEl.children) {
        if (c.type !== "element")
          continue;
        switch (c.name) {
          case "w:jc":
            out.align = valOf(c);
            break;
          case "w:pStyle":
            out.pStyle = valOf(c);
            break;
          case "w:ind": {
            const ind = {};
            if (c.attrs["w:left"])
              ind.left = Number(c.attrs["w:left"]);
            if (c.attrs["w:right"])
              ind.right = Number(c.attrs["w:right"]);
            if (c.attrs["w:firstLine"])
              ind.firstLine = Number(c.attrs["w:firstLine"]);
            if (c.attrs["w:hanging"])
              ind.hanging = Number(c.attrs["w:hanging"]);
            keepExtraAttrs(c, ind, IND_TYPED);
            if (Object.keys(ind).length)
              out.indent = ind;
            break;
          }
          case "w:spacing": {
            const sp = {};
            if (c.attrs["w:before"])
              sp.before = Number(c.attrs["w:before"]);
            if (c.attrs["w:after"])
              sp.after = Number(c.attrs["w:after"]);
            if (c.attrs["w:line"])
              sp.line = Number(c.attrs["w:line"]);
            if (c.attrs["w:lineRule"])
              sp.lineRule = c.attrs["w:lineRule"];
            keepExtraAttrs(c, sp, SPACING_TYPED);
            if (Object.keys(sp).length)
              out.spacing = sp;
            break;
          }
          case "w:numPr": {
            const np = {}, ilvl = xml.findChild(c, "w:ilvl"), numId = xml.findChild(c, "w:numId");
            if (ilvl)
              np.ilvl = Number(valOf(ilvl));
            if (numId)
              np.numId = Number(valOf(numId));
            if (Object.keys(np).length)
              out.numPr = np;
            break;
          }
          case "w:rPr": {
            const inner = parseRunProperties(c);
            if (inner)
              out.rPr = inner;
            break;
          }
          default:
            if (!PPR_KNOWN.has(c.name))
              extras.push(c);
        }
      }
      if (extras.length)
        out._extras = orderBySequence(extras, PPR_SEQ);
      return out;
    }
    function renderParagraphProperties(pPr) {
      if (!pPr)
        return null;
      const children = [];
      if (pPr.pStyle != null)
        children.push(elVal("w:pStyle", pPr.pStyle));
      if (pPr.numPr) {
        const inner = [];
        if (pPr.numPr.ilvl != null)
          inner.push(elVal("w:ilvl", pPr.numPr.ilvl));
        if (pPr.numPr.numId != null)
          inner.push(elVal("w:numId", pPr.numPr.numId));
        children.push(xml.el("w:numPr", {}, inner));
      }
      if (pPr.spacing) {
        const a = {};
        if (pPr.spacing.before != null)
          a["w:before"] = String(pPr.spacing.before);
        if (pPr.spacing.after != null)
          a["w:after"] = String(pPr.spacing.after);
        if (pPr.spacing.line != null)
          a["w:line"] = String(pPr.spacing.line);
        if (pPr.spacing.lineRule != null)
          a["w:lineRule"] = String(pPr.spacing.lineRule);
        writeExtraAttrs(a, pPr.spacing.extraAttrs);
        children.push(xml.el("w:spacing", a));
      }
      if (pPr.indent) {
        const a = {};
        if (pPr.indent.left != null)
          a["w:left"] = String(pPr.indent.left);
        if (pPr.indent.right != null)
          a["w:right"] = String(pPr.indent.right);
        if (pPr.indent.firstLine != null)
          a["w:firstLine"] = String(pPr.indent.firstLine);
        if (pPr.indent.hanging != null)
          a["w:hanging"] = String(pPr.indent.hanging);
        writeExtraAttrs(a, pPr.indent.extraAttrs);
        children.push(xml.el("w:ind", a));
      }
      if (pPr.align != null)
        children.push(elVal("w:jc", pPr.align));
      if (pPr.rPr)
        children.push(renderRunProperties(pPr.rPr) || xml.el("w:rPr", {}, []));
      if (pPr._extras)
        for (const ex of pPr._extras)
          children.push(ex);
      if (!children.length)
        return null;
      return xml.el("w:pPr", {}, orderBySequence(children, PPR_SEQ));
    }
    const BORDER_EDGES = ["top", "left", "bottom", "right", "insideH", "insideV"], BORDER_EDGE_NAMES = new Set(BORDER_EDGES.map((e) => "w:" + e));
    function numOrRaw(v) {
      if (v === void 0)
        return v;
      const n = Number(v);
      return String(v).trim() !== "" && Number.isFinite(n) ? n : v;
    }
    const BORDER_MODELLED_ATTRS = new Set(["w:val", "w:sz", "w:space", "w:color"]);
    function parseBorder(el) {
      const b = { val: el.attrs["w:val"] };
      if (el.attrs["w:sz"] !== void 0)
        b.sz = Number(el.attrs["w:sz"]);
      if (el.attrs["w:space"] !== void 0)
        b.space = Number(el.attrs["w:space"]);
      if (el.attrs["w:color"] !== void 0)
        b.color = el.attrs["w:color"];
      const extraAttrs = {};
      let any = !1;
      for (const k of Object.keys(el.attrs)) {
        if (BORDER_MODELLED_ATTRS.has(k))
          continue;
        extraAttrs[k] = el.attrs[k];
        any = !0;
      }
      if (any)
        b.extraAttrs = extraAttrs;
      return b;
    }
    function renderBorder(edge, b) {
      const a = { "w:val": String(b.val) };
      if (b.sz !== void 0)
        a["w:sz"] = String(b.sz);
      if (b.space !== void 0)
        a["w:space"] = String(b.space);
      if (b.color !== void 0)
        a["w:color"] = String(b.color);
      if (b.extraAttrs) {
        for (const k of Object.keys(b.extraAttrs))
          if (!BORDER_MODELLED_ATTRS.has(k) && b.extraAttrs[k] !== void 0)
            a[k] = String(b.extraAttrs[k]);
      }
      return xml.el("w:" + edge, a);
    }
    function parseTableBorders(el) {
      const out = {}, extras = [];
      for (const c of el.children) {
        if (c.type !== "element")
          continue;
        if (BORDER_EDGE_NAMES.has(c.name))
          out[c.name.slice(2)] = parseBorder(c);
        else
          extras.push(c);
      }
      if (extras.length)
        out._extras = extras;
      return out;
    }
    function renderTableBorders(borders) {
      if (!borders)
        return null;
      const kids = [];
      for (const edge of BORDER_EDGES)
        if (borders[edge])
          kids.push(renderBorder(edge, borders[edge]));
      if (borders._extras)
        for (const ex of borders._extras)
          kids.push(ex);
      if (!kids.length)
        return null;
      return xml.el("w:tblBorders", {}, kids);
    }
    const MARGIN_EDGES = ["top", "start", "left", "bottom", "end", "right"], MARGIN_EDGE_NAMES = new Set(MARGIN_EDGES.map((e) => "w:" + e));
    function parseWidth(el) {
      return { w: numOrRaw(el.attrs["w:w"]), type: el.attrs["w:type"] || "auto" };
    }
    function renderWidth(name, width) {
      const a = {};
      if (width.w !== void 0)
        a["w:w"] = String(width.w);
      a["w:type"] = width.type || "auto";
      return xml.el(name, a);
    }
    function parseCellMargins(el) {
      const out = {}, extras = [];
      for (const c of el.children) {
        if (c.type !== "element")
          continue;
        if (MARGIN_EDGE_NAMES.has(c.name))
          out[c.name.slice(2)] = parseWidth(c);
        else
          extras.push(c);
      }
      if (extras.length)
        out._extras = extras;
      return out;
    }
    function renderCellMargins(margins) {
      if (!margins)
        return null;
      const kids = [];
      for (const edge of MARGIN_EDGES)
        if (margins[edge])
          kids.push(renderWidth("w:" + edge, margins[edge]));
      if (margins._extras)
        for (const ex of margins._extras)
          kids.push(ex);
      if (!kids.length)
        return null;
      return xml.el("w:tblCellMar", {}, kids);
    }
    function parseTableProperties(tblPrEl) {
      if (!tblPrEl)
        return;
      const out = {}, extras = [];
      let any = !1;
      for (const c of tblPrEl.children) {
        if (c.type !== "element")
          continue;
        any = !0;
        switch (c.name) {
          case "w:tblStyle":
            out.style = valOf(c);
            break;
          case "w:tblW":
            out.width = parseWidth(c);
            break;
          case "w:tblBorders":
            if ((c.children || []).some((k) => k.type === "element"))
              out.borders = parseTableBorders(c);
            else
              extras.push(c);
            break;
          case "w:tblCellMar":
            out.cellMargins = parseCellMargins(c);
            break;
          default:
            extras.push(c);
        }
      }
      if (!any)
        return;
      if (extras.length)
        out._extras = orderBySequence(extras, TBLPR_SEQ);
      return out;
    }
    function renderTableProperties(tblPr) {
      if (!tblPr)
        return null;
      const children = [];
      if (tblPr.style != null)
        children.push(elVal("w:tblStyle", tblPr.style));
      if (tblPr.width)
        children.push(renderWidth("w:tblW", tblPr.width));
      const bordersEl = renderTableBorders(tblPr.borders);
      if (bordersEl)
        children.push(bordersEl);
      const marginsEl = renderCellMargins(tblPr.cellMargins);
      if (marginsEl)
        children.push(marginsEl);
      for (const ex of tblPr._extras || [])
        children.push(ex);
      if (!children.length)
        return null;
      return xml.el("w:tblPr", {}, orderBySequence(children, TBLPR_SEQ));
    }
    return {
      parseRunProperties,
      renderRunProperties,
      parseParagraphProperties,
      renderParagraphProperties,
      parseTableProperties,
      renderTableProperties,
      readToggle,
      writeToggle,
      valOf,
      elVal,
      sequence,
      orderBySequence,
      sameElement,
      hydrateLossless
    };
  } });
    __register({ name: "drawingmlShape", dependencies: ["xml","ooxmlShared"], factory: function(xml, shared) {
    const { NS } = shared, A_NS = NS.A, typedColor = shared.createTypedColorCodec(xml);
    function parseColorChild(parent) {
      for (const c of parent.children) {
        if (c.type !== "element")
          continue;
        if (c.name === "a:srgbClr" || c.name === "a:schemeClr")
          return typedColor.parse(c) || (c.name === "a:srgbClr" ? { rgb: c.attrs.val } : { schemeColor: c.attrs.val });
      }
      return null;
    }
    function renderColorChild(color) {
      return typedColor.render(color);
    }
    const orderSeq = shared.sequence ? shared.sequence : () => null, ordered = (children, seq) => seq && shared.orderBySequence ? shared.orderBySequence(children, seq) : children, LN_SEQ = orderSeq([
      ["a:noFill", "a:solidFill", "a:gradFill", "a:pattFill"],
      ["a:prstDash", "a:custDash"],
      ["a:round", "a:bevel", "a:miter"],
      "a:headEnd",
      "a:tailEnd",
      "a:extLst"
    ]), SPPR_SEQ = orderSeq([
      "a:xfrm",
      ["a:custGeom", "a:prstGeom"],
      ["a:noFill", "a:solidFill", "a:gradFill", "a:blipFill", "a:pattFill", "a:grpFill"],
      "a:ln",
      ["a:effectLst", "a:effectDag"],
      "a:scene3d",
      "a:sp3d",
      "a:extLst"
    ]), LN_TYPED_ATTRS = new Set(["w", "cap", "cmpd"]), LN_FILLS = new Set(["a:noFill", "a:solidFill", "a:gradFill", "a:pattFill"]);
    function renderSrgbClr(rgb) {
      return xml.el("a:srgbClr", { val: String(rgb).replace(/^#/, "") });
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
    function lineColor(solidFill, opts) {
      if (!(opts && opts.typedLineColors)) {
        const col = parseColorChild(solidFill);
        return col && col.rgb ? col.rgb : void 0;
      }
      const el = solidFill.children.find((n) => n.type === "element");
      if (!el)
        return;
      if (el.name === "a:srgbClr" && !el.children.some((n) => n.type === "element"))
        return el.attrs.val;
      return typedColor.parse(el) || void 0;
    }
    function parseLine(lnEl, opts) {
      if (!lnEl)
        return;
      const out = {};
      if (lnEl.attrs.w != null)
        out.width = Number(lnEl.attrs.w);
      if (lnEl.attrs.cap)
        out.cap = lnEl.attrs.cap;
      if (lnEl.attrs.cmpd)
        out.compound = lnEl.attrs.cmpd;
      const extraAttrs = {};
      let anyAttr = !1;
      for (const k of Object.keys(lnEl.attrs)) {
        if (LN_TYPED_ATTRS.has(k) || k.startsWith("xmlns"))
          continue;
        extraAttrs[k] = lnEl.attrs[k];
        anyAttr = !0;
      }
      if (anyAttr)
        out.extraAttrs = extraAttrs;
      const extras = [];
      for (const c of lnEl.children) {
        if (c.type !== "element")
          continue;
        if (c.name === "a:solidFill") {
          const col = lineColor(c, opts);
          if (col !== void 0)
            out.color = col;
          else
            extras.push(c);
        } else if (c.name === "a:prstDash")
          out.dash = c.attrs.val;
        else if (c.name === "a:noFill")
          out.color = null;
        else
          extras.push(c);
      }
      if (extras.length)
        out._extras = extras;
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
      if (line.extraAttrs) {
        for (const k of Object.keys(line.extraAttrs))
          if (!(k in a))
            a[k] = String(line.extraAttrs[k]);
      }
      const children = [];
      if (line.color === null)
        children.push(xml.el("a:noFill", {}));
      else if (line.color) {
        const el = typeof line.color === "object" ? typedColor.render(line.color) : renderSrgbClr(line.color);
        if (el)
          children.push(xml.el("a:solidFill", {}, [el]));
      }
      if (line.dash)
        children.push(xml.el("a:prstDash", { val: line.dash }));
      if (!line._extras)
        return xml.el("a:ln", a, children);
      for (const ex of line._extras) {
        if (line.color !== void 0 && LN_FILLS.has(ex.name))
          continue;
        if (line.dash && ex.name === "a:custDash")
          continue;
        children.push(ex);
      }
      return xml.el("a:ln", a, ordered(children, LN_SEQ));
    }
    function parseShapeProperties(spPrEl, opts) {
      if (!spPrEl)
        return;
      const out = {};
      if (spPrEl.attrs && spPrEl.attrs.bwMode)
        out.bwMode = spPrEl.attrs.bwMode;
      const xfrmEl = xml.findChild(spPrEl, "a:xfrm");
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
        const lineProps = parseLine(ln, opts);
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
      const attrs = props.bwMode ? { bwMode: String(props.bwMode) } : {};
      if (!props._extras)
        return xml.el(tag, attrs, children);
      for (const ex of props._extras)
        children.push(ex);
      return xml.el(tag, attrs, ordered(children, SPPR_SEQ));
    }
    const { EMU_PER_INCH, EMU_PER_CM, EMU_PER_PT, EMU_PER_PX_96, toEmu } = shared;
    function withMods(color, from) {
      if (Array.isArray(from.mods) && from.mods.length)
        color.mods = from.mods.map((m) => ({ ...m }));
      return color;
    }
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
          out.fill = withMods({ rgb: opts.fill.rgb }, opts.fill);
        else if (opts.fill && opts.fill.schemeColor)
          out.fill = withMods({ schemeColor: opts.fill.schemeColor }, opts.fill);
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
    __register({ name: "docxDrawing", dependencies: ["xml","drawingmlShape","ooxmlShared"], factory: function(xml, shapeMod, shared) {
    const { NS, REL_TYPE, parseSrcRect, srcRectAttrs } = shared, ANCHOR_SEQ = shared.sequence ? shared.sequence([
      "wp:simplePos",
      "wp:positionH",
      "wp:positionV",
      "wp:extent",
      "wp:effectExtent",
      ["wp:wrapNone", "wp:wrapSquare", "wp:wrapTight", "wp:wrapThrough", "wp:wrapTopAndBottom"],
      "wp:docPr",
      "wp:cNvGraphicFramePr",
      "a:graphic",
      "wp14:sizeRelH",
      "wp14:sizeRelV"
    ]) : null, anchorOrdered = (children) => ANCHOR_SEQ && shared.orderBySequence ? shared.orderBySequence(children, ANCHOR_SEQ) : children, WP_NS = NS.WP, A_NS = NS.A, PIC_NS = NS.PIC, R_NS = NS.R, REL_TYPE_IMAGE = REL_TYPE.IMAGE;
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
    const { EMU_PER_INCH, EMU_PER_CM, EMU_PER_PT, EMU_PER_PX_96, toEmu } = shared;
    function parseDrawing(drawingEl) {
      const inline = xml.findChild(drawingEl, "wp:inline"), anchor = xml.findChild(drawingEl, "wp:anchor"), wrapper = inline || anchor;
      if (!wrapper)
        return { type: "drawing", mode: "unknown", _extras: [drawingEl] };
      const out = {
        type: "drawing",
        mode: inline ? "inline" : "anchor"
      };
      for (const k of ["distT", "distB", "distL", "distR"])
        if (wrapper.attrs[k] != null)
          out[k] = Number(wrapper.attrs[k]);
      const extent = xml.findChild(wrapper, "wp:extent");
      if (extent) {
        out.cx = Number(extent.attrs.cx);
        out.cy = Number(extent.attrs.cy);
      }
      const docPr = xml.findChild(wrapper, "wp:docPr");
      if (docPr) {
        if (docPr.attrs.id != null)
          out.docId = Number(docPr.attrs.id);
        if (docPr.attrs.name != null)
          out.docName = docPr.attrs.name;
        if (docPr.attrs.descr)
          out.description = docPr.attrs.descr;
        if (docPr.attrs.title)
          out.title = docPr.attrs.title;
      }
      if (anchor) {
        const aAttrs = {};
        for (const k of Object.keys(anchor.attrs))
          if (!["distT", "distB", "distL", "distR"].includes(k))
            aAttrs[k] = anchor.attrs[k];
        if (Object.keys(aAttrs).length)
          out.anchorAttrs = aAttrs;
        const positioning = [];
        for (const c of anchor.children) {
          if (c.type !== "element")
            continue;
          if (c.name === "wp:extent")
            continue;
          if (c.name === "wp:effectExtent")
            continue;
          if (c.name === "wp:docPr")
            continue;
          if (c.name === "wp:cNvGraphicFramePr")
            continue;
          if (c.name === "a:graphic")
            continue;
          positioning.push(c);
        }
        if (positioning.length)
          out.anchorChildren = positioning;
      }
      const graphic = xml.findChild(wrapper, "a:graphic");
      if (graphic) {
        const gd = xml.findChild(graphic, "a:graphicData");
        if (gd) {
          const uri = gd.attrs.uri;
          if (uri === "http://schemas.openxmlformats.org/drawingml/2006/chart")
            parseChartInto(out, gd);
          else if (uri === "http://schemas.microsoft.com/office/word/2010/wordprocessingShape" || uri === "http://schemas.microsoft.com/office/word/2010/wordprocessingShape")
            parseWpsInto(out, gd);
          else {
            const pic = xml.findChild(gd, "pic:pic");
            if (pic)
              parsePicInto(out, pic);
            else
              out._gdRaw = gd;
          }
        }
      }
      out._source = drawingEl;
      out._read = structuredClone(typedFields(out));
      return out;
    }
    function parseWpsInto(out, gdEl) {
      const wsp = xml.findChild(gdEl, "wps:wsp");
      if (!wsp)
        return;
      out.kind = "shape";
      const spPr = xml.findChild(wsp, "wps:spPr");
      if (spPr) {
        const typed = shapeMod.parseShapeProperties(spPr);
        if (typed)
          out.shapeProps = typed;
      }
      const txbx = xml.findChild(wsp, "wps:txbx");
      if (txbx)
        out._wpsTxbx = txbx;
      const bodyPr = xml.findChild(wsp, "wps:bodyPr");
      if (bodyPr)
        out._wpsBodyPr = bodyPr;
    }
    function parseChartInto(out, gdEl) {
      const chartEl = xml.findChild(gdEl, "c:chart");
      if (chartEl && chartEl.attrs["r:id"]) {
        out.chartRef = chartEl.attrs["r:id"];
        out.kind = "chart";
      }
    }
    function parsePicInto(out, picEl) {
      const nvPicPr = xml.findChild(picEl, "pic:nvPicPr");
      if (nvPicPr) {
        const cNvPr = xml.findChild(nvPicPr, "pic:cNvPr");
        if (cNvPr && !out.picName)
          out.picName = cNvPr.attrs.name;
        if (cNvPr && cNvPr.attrs.id != null && out.picId == null)
          out.picId = Number(cNvPr.attrs.id);
      }
      const blipFill = xml.findChild(picEl, "pic:blipFill");
      if (blipFill) {
        const blip = xml.findChild(blipFill, "a:blip");
        if (blip) {
          if (blip.attrs["r:embed"])
            out.embedRef = blip.attrs["r:embed"];
          if (blip.attrs["r:link"])
            out.linkRef = blip.attrs["r:link"];
          const svgBlip = svgBlipOf(blip);
          if (svgBlip && svgBlip.attrs["r:embed"])
            out.svgRef = svgBlip.attrs["r:embed"];
        }
        const srcRect = xml.findChild(blipFill, "a:srcRect");
        if (srcRect)
          out.srcRect = parseSrcRect(srcRect);
      }
      const spPr = xml.findChild(picEl, "pic:spPr");
      if (spPr) {
        const prst = xml.findChild(spPr, "a:prstGeom");
        if (prst && prst.attrs.prst)
          out.prstGeom = prst.attrs.prst;
        const xfrm = xml.findChild(spPr, "a:xfrm");
        if (xfrm) {
          const off = xml.findChild(xfrm, "a:off"), ext = xml.findChild(xfrm, "a:ext");
          if (off) {
            if (off.attrs.x != null)
              out.offsetX = Number(off.attrs.x);
            if (off.attrs.y != null)
              out.offsetY = Number(off.attrs.y);
          }
        }
      }
    }
    function svgBlipOf(blip) {
      const extLst = xml.findChild(blip, "a:extLst");
      for (const ext of extLst && extLst.children || []) {
        if (ext.type !== "element" || ext.name !== "a:ext" || ext.attrs.uri !== "{96DAC541-7B7A-43D3-8B79-37D633B846F1}")
          continue;
        const el = (ext.children || []).find((c) => c.type === "element" && /(^|:)svgBlip$/.test(c.name));
        if (el)
          return el;
      }
      return null;
    }
    const LATE_FIELDS = new Set(["image", "chart", "alternate", "embedRef", "svgRef", "chartRef", "docId", "_source", "_read"]), REL_NAMESPACES = new Set([R_NS, "http://purl.oclc.org/ooxml/officeDocument/relationships"]);
    function typedFields(d) {
      const out = {};
      for (const k of Object.keys(d))
        if (!LATE_FIELDS.has(k))
          out[k] = d[k];
      return out;
    }
    function keepSource(d, element) {
      d._source = element;
      d._read = structuredClone(typedFields(d));
      return d;
    }
    function sameModel(a, b) {
      if (Object.is(a, b))
        return !0;
      if (!a || !b || typeof a !== "object" || typeof b !== "object")
        return !1;
      if (Array.isArray(a) !== Array.isArray(b))
        return !1;
      const ka = Object.keys(a), kb = Object.keys(b);
      if (ka.length !== kb.length)
        return !1;
      for (const k of ka)
        if (!Object.prototype.hasOwnProperty.call(b, k) || !sameModel(a[k], b[k]))
          return !1;
      return !0;
    }
    let held = null;
    function withRelationships(scope, fn) {
      const before = held;
      held = scope;
      try {
        return fn();
      } finally {
        held = before;
      }
    }
    function keptSource(d) {
      const src = d._source;
      if (!src || src.type !== "element" || !d._read || !sameModel(typedFields(d), d._read))
        return null;
      const el = structuredClone(src), wrapper = xml.findChild(el, "wp:inline") || xml.findChild(el, "wp:anchor");
      if (!wrapper)
        return null;
      const docPr = xml.findChild(wrapper, "wp:docPr");
      if (d.docId != null) {
        if (!docPr || docPr.attrs.id == null)
          return null;
        docPr.attrs.id = String(d.docId);
      }
      const graphic = xml.findChild(wrapper, "a:graphic"), gd = graphic && xml.findChild(graphic, "a:graphicData"), isChart = gd && gd.attrs.uri === "http://schemas.openxmlformats.org/drawingml/2006/chart", chartEl = isChart ? xml.findChild(gd, "c:chart") : null, pic = gd && !isChart ? xml.findChild(gd, "pic:pic") : null, blipFill = pic && xml.findChild(pic, "pic:blipFill"), blip = blipFill && xml.findChild(blipFill, "a:blip"), svgBlip = blip && svgBlipOf(blip), typed = new Map;
      for (const [node, attr, value] of [
        [blip, "r:embed", d.embedRef],
        [svgBlip, "r:embed", d.svgRef],
        [chartEl, "r:id", d.chartRef]
      ]) {
        const at = node && node.attrs[attr];
        if (Boolean(value) !== Boolean(at))
          return null;
        if (!value)
          continue;
        node.attrs[attr] = String(value);
        typed.set(node, attr);
      }
      return referencesHeld(el, typed) ? el : null;
    }
    function referencesHeld(el, typed) {
      const walk = (n, prefixes) => {
        if (!n || n.type !== "element")
          return !0;
        let scope = prefixes;
        for (const [k, v] of Object.entries(n.attrs)) {
          if (!k.startsWith("xmlns:"))
            continue;
          if (scope === prefixes)
            scope = new Set(prefixes);
          if (REL_NAMESPACES.has(v))
            scope.add(k.slice(6));
          else
            scope.delete(k.slice(6));
        }
        for (const [k, v] of Object.entries(n.attrs)) {
          const colon = k.indexOf(":");
          if (!(k === "o:relid" || colon > 0 && k !== "xmlns" && scope.has(k.slice(0, colon))) || v === "")
            continue;
          if (typed.get(n) === k) {
            if (held && !held.media.has(v) && !held.links.has(v))
              return !1;
          } else if (!held || !held.links.has(v))
            return !1;
        }
        return (n.children || []).every((c) => walk(c, scope));
      };
      return walk(el, new Set(["r"]));
    }
    function renderDrawing(drawing) {
      const kept = keptSource(drawing);
      if (kept)
        return kept;
      const inner = drawing.mode === "anchor" ? renderAnchorWrapper(drawing) : renderInlineWrapper(drawing);
      return xml.el("w:drawing", {}, [inner]);
    }
    function renderRunChild(drawing) {
      const el = renderDrawing(drawing), alt = drawing.alternate;
      if (!alt || drawing._read && !sameModel(typedFields(drawing), drawing._read))
        return el;
      const children = [xml.el("mc:Choice", { Requires: String(alt.requires || "") }, [el])];
      if (alt.fallback)
        children.push(alt.fallback);
      return xml.el("mc:AlternateContent", {}, children);
    }
    function renderInlineWrapper(d) {
      const a = {};
      for (const k of ["distT", "distB", "distL", "distR"])
        a[k] = d[k] != null ? String(d[k]) : "0";
      return xml.el("wp:inline", a, [
        xml.el("wp:extent", {
          cx: String(d.cx ?? 1e6),
          cy: String(d.cy ?? 1e6)
        }),
        xml.el("wp:effectExtent", { l: "0", t: "0", r: "0", b: "0" }),
        renderDocPr(d),
        xml.el("wp:cNvGraphicFramePr", {}, [
          xml.el("a:graphicFrameLocks", {
            "xmlns:a": A_NS,
            noChangeAspect: "1"
          })
        ]),
        renderGraphic(d)
      ]);
    }
    function renderAnchorWrapper(d) {
      const a = Object.assign({}, d.anchorAttrs || {
        distT: "0",
        distB: "0",
        distL: "0",
        distR: "0",
        relativeHeight: "0",
        behindDoc: "0",
        locked: "0",
        layoutInCell: "1",
        allowOverlap: "1"
      });
      for (const k of ["distT", "distB", "distL", "distR"])
        if (d[k] != null)
          a[k] = String(d[k]);
      const children = [];
      if (d.anchorChildren)
        for (const c of d.anchorChildren)
          children.push(c);
      children.push(xml.el("wp:extent", {
        cx: String(d.cx ?? 1e6),
        cy: String(d.cy ?? 1e6)
      }));
      children.push(xml.el("wp:effectExtent", { l: "0", t: "0", r: "0", b: "0" }));
      children.push(renderDocPr(d));
      children.push(xml.el("wp:cNvGraphicFramePr", {}, [
        xml.el("a:graphicFrameLocks", {
          "xmlns:a": A_NS,
          noChangeAspect: "1"
        })
      ]));
      children.push(renderGraphic(d));
      return xml.el("wp:anchor", a, anchorOrdered(children));
    }
    function renderDocPr(d) {
      const a = {
        id: String(d.docId != null ? d.docId : 1),
        name: typeof d.docName === "string" ? d.docName : "Picture"
      };
      if (d.description)
        a.descr = d.description;
      if (d.title)
        a.title = d.title;
      return xml.el("wp:docPr", a);
    }
    function renderGraphic(d) {
      if (d.kind === "shape" || d.shapeProps) {
        const wspChildren = [
          xml.el("wps:cNvSpPr", {})
        ];
        if (d.shapeProps)
          wspChildren.push(shapeMod.renderShapeProperties(d.shapeProps, "wps:spPr"));
        if (d._wpsTxbx)
          wspChildren.push(d._wpsTxbx);
        if (d._wpsBodyPr)
          wspChildren.push(d._wpsBodyPr);
        else
          wspChildren.push(xml.el("wps:bodyPr", {
            rot: "0",
            spcFirstLastPara: "0",
            vertOverflow: "overflow",
            horzOverflow: "overflow",
            vert: "horz",
            wrap: "square",
            anchor: "t"
          }));
        return xml.el("a:graphic", { "xmlns:a": A_NS }, [
          xml.el("a:graphicData", { uri: "http://schemas.microsoft.com/office/word/2010/wordprocessingShape" }, [
            xml.el("wps:wsp", { "xmlns:wps": "http://schemas.microsoft.com/office/word/2010/wordprocessingShape" }, wspChildren)
          ])
        ]);
      }
      if (d.kind === "chart" || d.chart)
        return xml.el("a:graphic", { "xmlns:a": A_NS }, [
          xml.el("a:graphicData", { uri: "http://schemas.openxmlformats.org/drawingml/2006/chart" }, [
            xml.el("c:chart", {
              "xmlns:c": "http://schemas.openxmlformats.org/drawingml/2006/chart",
              "xmlns:r": R_NS,
              "r:id": d.chartRef || ""
            })
          ])
        ]);
      if (d._gdRaw && !d.embedRef)
        return xml.el("a:graphic", { "xmlns:a": A_NS }, [d._gdRaw]);
      return xml.el("a:graphic", { "xmlns:a": A_NS }, [
        xml.el("a:graphicData", { uri: "http://schemas.openxmlformats.org/drawingml/2006/picture" }, [renderPic(d)])
      ]);
    }
    function renderPic(d) {
      return xml.el("pic:pic", { "xmlns:pic": PIC_NS }, [
        xml.el("pic:nvPicPr", {}, [
          xml.el("pic:cNvPr", {
            id: String(d.picId != null ? d.picId : 0),
            name: typeof d.picName === "string" ? d.picName : typeof d.docName === "string" ? d.docName : "Picture"
          }),
          xml.el("pic:cNvPicPr", {})
        ]),
        xml.el("pic:blipFill", {}, [
          xml.el("a:blip", d.embedRef ? { "r:embed": d.embedRef } : d.linkRef ? { "r:link": d.linkRef } : {}, renderSvgExt(d)),
          ...d.srcRect ? [xml.el("a:srcRect", srcRectAttrs(d.srcRect))] : [],
          xml.el("a:stretch", {}, [xml.el("a:fillRect", {})])
        ]),
        xml.el("pic:spPr", {}, [
          xml.el("a:xfrm", {}, [
            xml.el("a:off", {
              x: String(d.offsetX || 0),
              y: String(d.offsetY || 0)
            }),
            xml.el("a:ext", {
              cx: String(d.cx ?? 1e6),
              cy: String(d.cy ?? 1e6)
            })
          ]),
          xml.el("a:prstGeom", { prst: d.prstGeom || "rect" }, [
            xml.el("a:avLst", {})
          ])
        ])
      ]);
    }
    function renderSvgExt(d) {
      if (!d.svgRef || !d.image || !d.image.svg || !d.image.svg.data)
        return [];
      return [xml.el("a:extLst", {}, [
        xml.el("a:ext", { uri: "{96DAC541-7B7A-43D3-8B79-37D633B846F1}" }, [
          xml.el("asvg:svgBlip", { "xmlns:asvg": "http://schemas.microsoft.com/office/drawing/2016/SVG/main", "r:embed": d.svgRef })
        ])
      ])];
    }
    function image(data, opts = {}) {
      const contentType = opts.contentType || sniffImageType(data), cx = toEmu(opts.cx || "2in"), cy = toEmu(opts.cy || cx * 0.75), out = {
        type: "drawing",
        mode: "inline",
        cx,
        cy,
        docName: opts.name || "Picture",
        prstGeom: opts.prstGeom || "rect",
        image: { data, contentType }
      };
      if (opts.description)
        out.description = opts.description;
      if (opts.title)
        out.title = opts.title;
      if (opts.rId)
        out.embedRef = opts.rId;
      if (opts.svg)
        out.image.svg = { data: opts.svg };
      if (opts.docId != null)
        out.docId = opts.docId;
      return out;
    }
    function chart(spec, opts = {}) {
      const cx = toEmu(opts.cx || "6in"), cy = toEmu(opts.cy || "4in"), out = {
        type: "drawing",
        mode: "inline",
        kind: "chart",
        cx,
        cy,
        docName: opts.name || "Chart",
        chart: spec
      };
      if (opts.description)
        out.description = opts.description;
      if (opts.title)
        out.title = opts.title;
      if (opts.docId != null)
        out.docId = opts.docId;
      return out;
    }
    function shape(spec, opts = {}) {
      const cx = toEmu(opts.cx || "2in"), cy = toEmu(opts.cy || "1in"), props = typeof spec === "string" ? shapeMod.shapeProps({ geom: spec, cx, cy, ...opts }) : spec;
      return {
        type: "drawing",
        mode: "inline",
        kind: "shape",
        cx,
        cy,
        docName: opts.name || "Shape",
        shapeProps: props
      };
    }
    return {
      parseDrawing,
      renderDrawing,
      renderRunChild,
      withRelationships,
      typedFields,
      keepSource,
      image,
      chart,
      shape,
      sniffImageType,
      extensionFor,
      toEmu,
      EMU_PER_INCH,
      EMU_PER_CM,
      EMU_PER_PT,
      EMU_PER_PX_96,
      REL_TYPE_IMAGE,
      WP_NS,
      A_NS,
      PIC_NS
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
    function withPr(el, prName, node) {
      readPr(node, el, prName, []);
      return node;
    }
    function readPr(node, el, prName, typed) {
      const pr = xml.findChild(el, prName);
      if (pr)
        node._prExtras = pr.children.filter((c) => c.type === "element" && !typed.includes(c.name));
      return pr;
    }
    function renderPr(prName, typedChildren, n) {
      if (!typedChildren.length && !n._prExtras)
        return [];
      return [xml.el(prName, {}, [...typedChildren, ...n._prExtras || []])];
    }
    function charOf(pr, name) {
      const c = pr && xml.findChild(pr, name);
      return c && c.attrs["m:val"] != null ? c.attrs["m:val"] : void 0;
    }
    function parseMathRun(rEl) {
      const out = { type: "mathRun", text: "" }, rPrEl = xml.findChild(rEl, "m:rPr");
      if (rPrEl) {
        const sty = xml.findChild(rPrEl, "m:sty"), rPr = {};
        if (sty)
          rPr.sty = sty.attrs["m:val"];
        const extras = rPrEl.children.filter((c) => c.type === "element" && c.name !== "m:sty");
        if (extras.length)
          rPr._extras = extras;
        if (Object.keys(rPr).length)
          out.rPr = rPr;
      }
      const extras = [];
      for (const c of rEl.children) {
        if (c.type !== "element")
          continue;
        if (c.name === "m:t")
          out.text += xml.textContent(c);
        else if (c.name !== "m:rPr")
          extras.push(c);
      }
      if (extras.length)
        out._extras = extras;
      return out;
    }
    const SCRIPT_BEFORE_STY = new Set(["m:lit", "m:nor", "m:scr"]);
    function renderMathRun(r) {
      const children = [];
      if (r.rPr) {
        const inner = [];
        if (r.rPr._extras)
          inner.push(...r.rPr._extras.filter((c) => c.name !== "m:sty" && SCRIPT_BEFORE_STY.has(c.name)));
        if (r.rPr.sty)
          inner.push(xml.el("m:sty", { "m:val": r.rPr.sty }));
        if (r.rPr._extras)
          inner.push(...r.rPr._extras.filter((c) => !SCRIPT_BEFORE_STY.has(c.name)));
        if (inner.length)
          children.push(xml.el("m:rPr", {}, inner));
      }
      if (r._extras)
        children.push(...r._extras);
      children.push(xml.el("m:t", { "xml:space": "preserve" }, [xml.text(r.text || "")]));
      return xml.el("m:r", {}, children);
    }
    function parseFrac(fEl) {
      const out = {
        type: "frac",
        numerator: parseSlot(xml.findChild(fEl, "m:num")),
        denominator: parseSlot(xml.findChild(fEl, "m:den"))
      };
      readPr(out, fEl, "m:fPr", []);
      return out;
    }
    function renderFrac(f) {
      return xml.el("m:f", {}, [
        ...renderPr("m:fPr", [], f),
        renderSlot("m:num", f.numerator),
        renderSlot("m:den", f.denominator)
      ]);
    }
    function parseSSup(el) {
      return withPr(el, "m:sSupPr", {
        type: "sSup",
        base: parseSlot(xml.findChild(el, "m:e")),
        sup: parseSlot(xml.findChild(el, "m:sup"))
      });
    }
    function renderSSup(n) {
      return xml.el("m:sSup", {}, [
        ...renderPr("m:sSupPr", [], n),
        renderSlot("m:e", n.base),
        renderSlot("m:sup", n.sup)
      ]);
    }
    function parseSSub(el) {
      return withPr(el, "m:sSubPr", {
        type: "sSub",
        base: parseSlot(xml.findChild(el, "m:e")),
        sub: parseSlot(xml.findChild(el, "m:sub"))
      });
    }
    function renderSSub(n) {
      return xml.el("m:sSub", {}, [
        ...renderPr("m:sSubPr", [], n),
        renderSlot("m:e", n.base),
        renderSlot("m:sub", n.sub)
      ]);
    }
    function parseSSubSup(el) {
      return withPr(el, "m:sSubSupPr", {
        type: "sSubSup",
        base: parseSlot(xml.findChild(el, "m:e")),
        sub: parseSlot(xml.findChild(el, "m:sub")),
        sup: parseSlot(xml.findChild(el, "m:sup"))
      });
    }
    function renderSSubSup(n) {
      return xml.el("m:sSubSup", {}, [
        ...renderPr("m:sSubSupPr", [], n),
        renderSlot("m:e", n.base),
        renderSlot("m:sub", n.sub),
        renderSlot("m:sup", n.sup)
      ]);
    }
    function parseRad(el) {
      return withPr(el, "m:radPr", {
        type: "rad",
        degree: parseSlot(xml.findChild(el, "m:deg")),
        base: parseSlot(xml.findChild(el, "m:e"))
      });
    }
    function renderRad(n) {
      return xml.el("m:rad", {}, [
        ...renderPr("m:radPr", [], n),
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
      }, naryPr = readPr(out, el, "m:naryPr", ["m:chr"]), op = charOf(naryPr, "m:chr");
      if (op != null)
        out.op = op;
      return out;
    }
    function renderNary(n) {
      const children = [];
      children.push(...renderPr("m:naryPr", [
        xml.el("m:chr", { "m:val": n.op ?? "\u2211" })
      ], n));
      children.push(renderSlot("m:sub", n.sub));
      children.push(renderSlot("m:sup", n.sup));
      children.push(renderSlot("m:e", n.body));
      return xml.el("m:nary", {}, children);
    }
    function parseDelim(el) {
      const out = { type: "d", children: [] }, dPr = readPr(out, el, "m:dPr", ["m:begChr", "m:sepChr", "m:endChr"]), open = charOf(dPr, "m:begChr"), close = charOf(dPr, "m:endChr"), sep = charOf(dPr, "m:sepChr");
      if (open != null)
        out.open = open;
      if (close != null)
        out.close = close;
      if (sep != null)
        out.sep = sep;
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
      if (n.sep != null)
        pr.push(xml.el("m:sepChr", { "m:val": n.sep }));
      if (n.close != null)
        pr.push(xml.el("m:endChr", { "m:val": n.close }));
      children.push(...renderPr("m:dPr", pr, n));
      for (const slot of n.children || [])
        children.push(renderSlot("m:e", slot));
      return xml.el("m:d", {}, children);
    }
    function parseFunc(el) {
      return withPr(el, "m:funcPr", {
        type: "func",
        name: parseSlot(xml.findChild(el, "m:fName")),
        body: parseSlot(xml.findChild(el, "m:e"))
      });
    }
    function renderFunc(n) {
      return xml.el("m:func", {}, [
        ...renderPr("m:funcPr", [], n),
        renderSlot("m:fName", n.name),
        renderSlot("m:e", n.body)
      ]);
    }
    function parseMatrix(el) {
      const out = { type: "m", rows: [] };
      readPr(out, el, "m:mPr", []);
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
      return xml.el("m:m", {}, [...renderPr("m:mPr", [], n), ...rows]);
    }
    function parseAcc(el) {
      const out = { type: "acc", base: parseSlot(xml.findChild(el, "m:e")) }, accPr = readPr(out, el, "m:accPr", ["m:chr"]), char = charOf(accPr, "m:chr");
      if (char != null)
        out.char = char;
      return out;
    }
    function renderAcc(n) {
      const children = [];
      children.push(...renderPr("m:accPr", n.char != null ? [xml.el("m:chr", { "m:val": n.char })] : [], n));
      children.push(renderSlot("m:e", n.base));
      return xml.el("m:acc", {}, children);
    }
    function parseBar(el) {
      const out = { type: "bar", base: parseSlot(xml.findChild(el, "m:e")) }, barPr = readPr(out, el, "m:barPr", ["m:pos"]), pos = charOf(barPr, "m:pos");
      if (pos != null)
        out.pos = pos;
      return out;
    }
    function renderBar(n) {
      const children = [];
      children.push(...renderPr("m:barPr", n.pos != null ? [xml.el("m:pos", { "m:val": n.pos })] : [], n));
      children.push(renderSlot("m:e", n.base));
      return xml.el("m:bar", {}, children);
    }
    function parseBox(el) {
      return withPr(el, "m:boxPr", { type: "box", base: parseSlot(xml.findChild(el, "m:e")) });
    }
    function renderBox(n) {
      return xml.el("m:box", {}, [...renderPr("m:boxPr", [], n), renderSlot("m:e", n.base)]);
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
      const out = { type: "oMathPara", children: [] }, extras = [];
      for (const c of el.children) {
        if (c.type !== "element")
          continue;
        if (c.name === "m:oMath")
          out.children.push(parseOMath(c));
        else
          extras.push(c);
      }
      if (extras.length)
        out._extras = extras;
      return out;
    }
    function renderOMathPara(n) {
      return xml.el("m:oMathPara", {}, [...n._extras || [], ...(n.children || []).map(renderOMath)]);
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
    __register({ name: "docxStructure", dependencies: ["xml","docxProperties","docxDrawing","ooxmlMath"], factory: function(xml, props, drawingMod, mathMod) {
    const orderSeq = props.sequence ? props.sequence : () => null, ordered = (children, seq) => seq && props.orderBySequence ? props.orderBySequence(children, seq) : children, SECT_SEQ = orderSeq([
      ["w:headerReference", "w:footerReference"],
      "w:footnotePr",
      "w:endnotePr",
      "w:type",
      "w:pgSz",
      "w:pgMar",
      "w:paperSrc",
      "w:pgBorders",
      "w:lnNumType",
      "w:pgNumType",
      "w:cols",
      "w:formProt",
      "w:vAlign",
      "w:noEndnote",
      "w:titlePg",
      "w:textDirection",
      "w:bidi",
      "w:rtlGutter",
      "w:docGrid",
      "w:printerSettings",
      "w:sectPrChange"
    ]), TCPR_SEQ = orderSeq([
      "w:cnfStyle",
      "w:tcW",
      "w:gridSpan",
      "w:hMerge",
      "w:vMerge",
      "w:tcBorders",
      "w:shd",
      "w:noWrap",
      "w:tcMar",
      "w:textDirection",
      "w:tcFitText",
      "w:vAlign",
      "w:hideMark",
      "w:headers",
      "w:cellIns",
      "w:cellDel",
      "w:cellMerge",
      "w:tcPrChange"
    ]);
    let choiceDrawings = !1;
    function withChoiceDrawings(on, fn) {
      const before = choiceDrawings;
      choiceDrawings = on === !0;
      try {
        return fn();
      } finally {
        choiceDrawings = before;
      }
    }
    const CHOICE_PREFIXES = new Set(["wps", "wpg", "wpc"]);
    function choiceDrawing(ac) {
      const els = ac.children.filter((k) => k.type === "element"), choice = els[0], fallback = els[1] || null;
      if (!choice || choice.name !== "mc:Choice" || els.length > 2 || fallback && fallback.name !== "mc:Fallback")
        return null;
      if (Object.keys(ac.attrs).length || Object.keys(choice.attrs).some((k) => k !== "Requires"))
        return null;
      const requires = String(choice.attrs.Requires || ""), prefixes = requires.split(/\s+/).filter(Boolean);
      if (!prefixes.length || !prefixes.every((p) => CHOICE_PREFIXES.has(p)))
        return null;
      const inner = choice.children.filter((k) => k.type === "element");
      if (inner.length !== 1 || inner[0].name !== "w:drawing")
        return null;
      const drawing = drawingMod.parseDrawing(inner[0]);
      drawing.alternate = { requires, fallback };
      return drawing;
    }
    function parseRunChildren(rEl) {
      const out = [];
      for (const c of rEl.children) {
        if (c.type !== "element")
          continue;
        switch (c.name) {
          case "w:t":
            out.push({ type: "text", value: xml.textContent(c) });
            break;
          case "w:delText":
            out.push({ type: "delText", value: xml.textContent(c) });
            break;
          case "w:br": {
            const kind = c.attrs["w:type"], br = kind ? { type: "break", kind } : { type: "break" };
            if (c.attrs["w:clear"] != null)
              br.clear = c.attrs["w:clear"];
            out.push(br);
            break;
          }
          case "w:tab":
            out.push({ type: "tab" });
            break;
          case "w:noBreakHyphen":
            out.push({ type: "noBreakHyphen" });
            break;
          case "w:softHyphen":
            out.push({ type: "softHyphen" });
            break;
          case "w:commentReference":
            out.push({ type: "commentReference", id: c.attrs["w:id"] });
            break;
          case "w:footnoteReference":
          case "w:endnoteReference": {
            const ref = { type: c.name.slice(2), id: c.attrs["w:id"] };
            if (c.attrs["w:customMarkFollows"] != null)
              ref.customMarkFollows = isOn(c.attrs["w:customMarkFollows"]);
            out.push(ref);
            break;
          }
          case "w:drawing":
            out.push(drawingMod.parseDrawing(c));
            break;
          case "mc:AlternateContent":
            out.push(choiceDrawings && choiceDrawing(c) || { type: "unknown", node: c });
            break;
          case "w:fldChar": {
            const f = {
              type: "fldChar",
              kind: c.attrs["w:fldCharType"]
            };
            if (c.attrs["w:dirty"])
              f.dirty = c.attrs["w:dirty"] === "1";
            if (c.attrs["w:fldLock"] !== void 0 && isOn(c.attrs["w:fldLock"]))
              f.fldLock = !0;
            const kept = c.children.filter((k) => k.type === "element");
            if (kept.length)
              f._extras = kept;
            out.push(f);
            break;
          }
          case "w:instrText":
            out.push({
              type: "instrText",
              value: xml.textContent(c)
            });
            break;
          case "w:rPr":
            break;
          default:
            out.push({ type: "unknown", node: c });
        }
      }
      return out;
    }
    function renderRunChildren(children) {
      const out = [];
      for (const ch of children || [])
        switch (ch.type) {
          case "text":
            out.push(xml.el("w:t", { "xml:space": "preserve" }, [xml.text(ch.value || "")]));
            break;
          case "delText":
            out.push(xml.el("w:delText", { "xml:space": "preserve" }, [xml.text(ch.value || "")]));
            break;
          case "break": {
            const a = ch.kind ? { "w:type": ch.kind } : {};
            if (ch.clear != null)
              a["w:clear"] = String(ch.clear);
            out.push(xml.el("w:br", a));
            break;
          }
          case "tab":
            out.push(xml.el("w:tab", {}));
            break;
          case "noBreakHyphen":
            out.push(xml.el("w:noBreakHyphen", {}));
            break;
          case "softHyphen":
            out.push(xml.el("w:softHyphen", {}));
            break;
          case "commentReference":
            out.push(xml.el("w:commentReference", { "w:id": String(ch.id) }));
            break;
          case "footnoteReference":
          case "endnoteReference": {
            const a = {};
            if (ch.customMarkFollows != null)
              a["w:customMarkFollows"] = ch.customMarkFollows ? "1" : "0";
            a["w:id"] = String(ch.id);
            out.push(xml.el("w:" + ch.type, a));
            break;
          }
          case "drawing":
            out.push(drawingMod.renderRunChild(ch));
            break;
          case "fldChar": {
            const a = { "w:fldCharType": ch.kind };
            if (ch.dirty)
              a["w:dirty"] = "1";
            if (ch.fldLock)
              a["w:fldLock"] = "1";
            out.push(xml.el("w:fldChar", a, ch._extras || []));
            break;
          }
          case "instrText":
            out.push(xml.el("w:instrText", { "xml:space": "preserve" }, [xml.text(ch.value || "")]));
            break;
          case "unknown":
            if (ch.node)
              out.push(ch.node);
            break;
        }
      return out;
    }
    function parseRun(rEl) {
      const rPrEl = xml.findChild(rEl, "w:rPr"), rPr = props.parseRunProperties(rPrEl);
      return {
        type: "run",
        ...rPr ? { rPr } : {},
        children: parseRunChildren(rEl)
      };
    }
    function renderRun(run) {
      const children = [], rPrEl = props.renderRunProperties(run.rPr);
      if (rPrEl)
        children.push(rPrEl);
      else if (run.rPr && typeof run.rPr === "object")
        children.push(xml.el("w:rPr", {}, []));
      children.push(...renderRunChildren(run.children));
      return xml.el("w:r", {}, children);
    }
    const HYPERLINK_STRINGS = [["tgtFrame", "w:tgtFrame"], ["tooltip", "w:tooltip"], ["docLocation", "w:docLocation"]];
    function parseHyperlink(hEl) {
      const out = { type: "hyperlink", children: [] };
      if (hEl.attrs["r:id"])
        out.rId = hEl.attrs["r:id"];
      if (hEl.attrs["w:anchor"])
        out.anchor = hEl.attrs["w:anchor"];
      for (const [k, a] of HYPERLINK_STRINGS)
        if (hEl.attrs[a] != null)
          out[k] = hEl.attrs[a];
      if (hEl.attrs["w:history"] != null)
        out.history = isOn(hEl.attrs["w:history"]);
      const extras = [];
      for (const c of hEl.children) {
        if (c.type !== "element")
          continue;
        const node = parseInline(c);
        if (node)
          out.children.push(node);
        else
          extras.push(c);
      }
      if (extras.length)
        out._extras = extras;
      return out;
    }
    function renderHyperlink(h) {
      const attrs = {};
      if (h.rId)
        attrs["r:id"] = h.rId;
      if (h.anchor)
        attrs["w:anchor"] = h.anchor;
      for (const [k, a] of HYPERLINK_STRINGS)
        if (h[k] != null)
          attrs[a] = String(h[k]);
      if (h.history != null)
        attrs["w:history"] = h.history ? "1" : "0";
      const children = renderInlines(h.children);
      if (h._extras)
        for (const ex of h._extras)
          children.push(ex);
      return xml.el("w:hyperlink", attrs, children);
    }
    function isOn(val) {
      return val == null || val === "1" || val === "true" || val === "on";
    }
    function parseSdtProperties(pPrEl) {
      if (!pPrEl)
        return;
      const out = {}, extras = [];
      for (const c of pPrEl.children) {
        if (c.type !== "element")
          continue;
        switch (c.name) {
          case "w:alias":
            out.alias = c.attrs["w:val"];
            break;
          case "w:tag":
            out.tag = c.attrs["w:val"];
            break;
          case "w:id":
            out.id = Number(c.attrs["w:val"]);
            break;
          case "w:showingPlcHdr":
            out.showingPlcHdr = isOn(c.attrs["w:val"]);
            break;
          case "w:dataBinding": {
            const db = {};
            if (c.attrs["w:xpath"])
              db.xpath = c.attrs["w:xpath"];
            if (c.attrs["w:prefixMappings"])
              db.prefixMappings = c.attrs["w:prefixMappings"];
            if (c.attrs["w:storeItemID"])
              db.storeItemID = c.attrs["w:storeItemID"];
            out.dataBinding = db;
            break;
          }
          case "w:text":
            out.kind = "text";
            if (Object.keys(c.attrs).length)
              out._kindNode = c;
            break;
          case "w:richText":
            out.kind = "richText";
            break;
          case "w:dropDownList":
            out.kind = "dropDownList";
            out._kindNode = c;
            break;
          case "w:comboBox":
            out.kind = "comboBox";
            out._kindNode = c;
            break;
          case "w:date":
            out.kind = "date";
            out._kindNode = c;
            break;
          case "w:checkbox":
            out.kind = "checkbox";
            out._kindNode = c;
            break;
          case "w:picture":
            out.kind = "picture";
            break;
          case "w15:repeatingSection": {
            out.kind = "repeatingSection";
            for (const g of c.children || []) {
              if (g.type !== "element")
                continue;
              if (g.name === "w15:sectionTitle" && g.attrs["w:val"] != null)
                out.sectionTitle = g.attrs["w:val"];
              else if (g.name === "w15:doNotAllowInsertDeleteSection" && isOn(g.attrs["w:val"]))
                out.doNotAllowInsertDeleteSection = !0;
            }
            break;
          }
          case "w15:repeatingSectionItem":
            out.kind = "repeatingSectionItem";
            break;
          case "w:repeatingSection":
            out.kind = "repeatingSection";
            if (c.attrs["w:sectionTitle"])
              out.sectionTitle = c.attrs["w:sectionTitle"];
            break;
          case "w:repeatingSectionItem":
            out.kind = "repeatingSectionItem";
            break;
          default:
            extras.push(c);
        }
      }
      if (extras.length)
        out._extras = extras;
      return out;
    }
    function renderSdtProperties(props) {
      if (!props)
        return null;
      const children = [];
      if (props.alias != null)
        children.push(xml.el("w:alias", { "w:val": props.alias }));
      if (props.tag != null)
        children.push(xml.el("w:tag", { "w:val": props.tag }));
      if (props.id != null)
        children.push(xml.el("w:id", { "w:val": String(props.id) }));
      if (props.showingPlcHdr != null)
        children.push(xml.el("w:showingPlcHdr", props.showingPlcHdr ? {} : { "w:val": "0" }));
      if (props.dataBinding) {
        const a = {};
        if (props.dataBinding.prefixMappings)
          a["w:prefixMappings"] = props.dataBinding.prefixMappings;
        if (props.dataBinding.xpath)
          a["w:xpath"] = props.dataBinding.xpath;
        if (props.dataBinding.storeItemID)
          a["w:storeItemID"] = props.dataBinding.storeItemID;
        children.push(xml.el("w:dataBinding", a));
      }
      if (props.kind === "text")
        children.push(props._kindNode || xml.el("w:text", {}));
      else if (props.kind === "richText")
        children.push(xml.el("w:richText", {}));
      else if (props.kind === "picture")
        children.push(xml.el("w:picture", {}));
      else if (props.kind === "repeatingSection") {
        const rs = [];
        if (props.sectionTitle)
          rs.push(xml.el("w15:sectionTitle", { "w:val": props.sectionTitle }));
        if (props.doNotAllowInsertDeleteSection)
          rs.push(xml.el("w15:doNotAllowInsertDeleteSection", {}));
        children.push(xml.el("w15:repeatingSection", {}, rs));
      } else if (props.kind === "repeatingSectionItem")
        children.push(xml.el("w15:repeatingSectionItem", {}));
      else if (props._kindNode)
        children.push(props._kindNode);
      if (props._extras)
        for (const ex of props._extras)
          children.push(ex);
      if (!children.length)
        return null;
      return xml.el("w:sdtPr", {}, children);
    }
    function parseSdt(sdtEl, isBlock) {
      const sdtPrEl = xml.findChild(sdtEl, "w:sdtPr"), sdtContentEl = xml.findChild(sdtEl, "w:sdtContent"), out = { type: isBlock ? "blockSdt" : "sdt", children: [] }, props = parseSdtProperties(sdtPrEl);
      if (props)
        out.properties = props;
      const own = sdtEl.children.filter((c) => c.type === "element" && c.name !== "w:sdtPr" && c.name !== "w:sdtContent");
      if (own.length)
        out._extras = own;
      if (sdtContentEl)
        if (isBlock) {
          const extras = [];
          for (const c of sdtContentEl.children) {
            if (c.type !== "element")
              continue;
            const marker = parseMarker(c);
            if (c.name === "w:p")
              out.children.push(parseParagraph(c));
            else if (c.name === "w:tbl")
              out.children.push(parseTable(c));
            else if (c.name === "w:sdt")
              out.children.push(parseSdt(c, !0));
            else if (marker)
              out.children.push(marker);
            else
              extras.push(c);
          }
          if (extras.length)
            out._contentExtras = extras;
        } else {
          const extras = [];
          for (const c of sdtContentEl.children) {
            if (c.type !== "element")
              continue;
            const node = parseInline(c);
            if (node)
              out.children.push(node);
            else
              extras.push(c);
          }
          if (extras.length)
            out._contentExtras = extras;
        }
      return out;
    }
    function renderSdt(sdt) {
      const sdtChildren = [], propsEl = renderSdtProperties(sdt.properties);
      if (propsEl)
        sdtChildren.push(propsEl);
      if (sdt._extras)
        sdtChildren.push(...sdt._extras);
      const isBlock = sdt.type === "blockSdt";
      let contentChildren = [];
      if (isBlock)
        for (const c of sdt.children || [])
          if (c.type === "paragraph")
            contentChildren.push(renderParagraph(c));
          else if (c.type === "table")
            contentChildren.push(renderTable(c));
          else if (c.type === "blockSdt")
            contentChildren.push(renderSdt(c));
          else {
            const marker = renderMarker(c);
            if (marker)
              contentChildren.push(marker);
          }
      else
        contentChildren = renderInlines(sdt.children || []);
      if (sdt._contentExtras)
        contentChildren.push(...sdt._contentExtras);
      sdtChildren.push(xml.el("w:sdtContent", {}, contentChildren));
      return xml.el("w:sdt", {}, sdtChildren);
    }
    const REVISION_TAGS = { "w:ins": "ins", "w:del": "del", "w:moveFrom": "moveFrom", "w:moveTo": "moveTo" }, REVISION_ELEMENTS = { ins: "w:ins", del: "w:del", moveFrom: "w:moveFrom", moveTo: "w:moveTo" }, RANGE_MARKERS = new Set([
      "w:moveFromRangeStart",
      "w:moveFromRangeEnd",
      "w:moveToRangeStart",
      "w:moveToRangeEnd",
      "w:customXmlInsRangeStart",
      "w:customXmlInsRangeEnd",
      "w:customXmlDelRangeStart",
      "w:customXmlDelRangeEnd",
      "w:customXmlMoveFromRangeStart",
      "w:customXmlMoveFromRangeEnd",
      "w:customXmlMoveToRangeStart",
      "w:customXmlMoveToRangeEnd",
      "w:permStart",
      "w:permEnd",
      "w:proofErr"
    ]), MARKER_TYPES = {
      "w:bookmarkStart": "bookmarkStart",
      "w:bookmarkEnd": "bookmarkEnd",
      "w:commentRangeStart": "commentRangeStart",
      "w:commentRangeEnd": "commentRangeEnd"
    }, MARKER_ELEMENTS = Object.fromEntries(Object.entries(MARKER_TYPES).map(([k, v]) => [v, k]));
    function parseMarker(c) {
      if (RANGE_MARKERS.has(c.name))
        return parseRangeMarker(c);
      const type = MARKER_TYPES[c.name];
      if (!type)
        return null;
      const a = c.attrs, out = { type, id: a["w:id"] };
      if (type === "bookmarkStart") {
        out.name = a["w:name"];
        if (a["w:colFirst"] !== void 0)
          out.colFirst = Number(a["w:colFirst"]);
        if (a["w:colLast"] !== void 0)
          out.colLast = Number(a["w:colLast"]);
      }
      if (a["w:displacedByCustomXml"] !== void 0)
        out.displacedByCustomXml = a["w:displacedByCustomXml"];
      return out;
    }
    function renderMarker(m) {
      if (m.type === "rangeMarker")
        return renderRangeMarker(m);
      const name = MARKER_ELEMENTS[m.type];
      if (!name)
        return null;
      const a = { "w:id": String(m.id) };
      if (m.type === "bookmarkStart") {
        if (m.name)
          a["w:name"] = m.name;
        if (m.colFirst != null)
          a["w:colFirst"] = String(m.colFirst);
        if (m.colLast != null)
          a["w:colLast"] = String(m.colLast);
      }
      if (m.displacedByCustomXml)
        a["w:displacedByCustomXml"] = m.displacedByCustomXml;
      return xml.el(name, a);
    }
    function parseRangeMarker(el) {
      return { type: "rangeMarker", name: el.name.slice(2), attrs: { ...el.attrs } };
    }
    function renderRangeMarker(m) {
      return xml.el("w:" + m.name, { ...m.attrs || {} }, []);
    }
    function parseInline(c) {
      const marker = parseMarker(c);
      if (marker)
        return marker;
      switch (c.name) {
        case "w:r":
          return parseRun(c);
        case "w:hyperlink":
          return parseHyperlink(c);
        case "w:ins":
        case "w:del":
        case "w:moveFrom":
        case "w:moveTo":
          return parseRevision(c, REVISION_TAGS[c.name]);
        case "w:sdt":
          return parseSdt(c, !1);
        case "w:smartTag": {
          const t = { type: "smartTag", attrs: { ...c.attrs || {} }, children: [] }, extras = [];
          for (const cc of c.children) {
            if (cc.type !== "element")
              continue;
            if (cc.name === "w:smartTagPr") {
              t.smartTagPr = cc;
              continue;
            }
            const node = parseInline(cc);
            if (node)
              t.children.push(node);
            else
              extras.push(cc);
          }
          if (extras.length)
            t._extras = extras;
          return t;
        }
        case "m:oMath":
          return mathMod.parseOMath(c);
        case "w:fldSimple": {
          const f = {
            type: "fldSimple",
            instr: c.attrs["w:instr"] || "",
            children: []
          };
          if (c.attrs["w:dirty"])
            f.dirty = c.attrs["w:dirty"] === "1";
          for (const cc of c.children) {
            if (cc.type !== "element")
              continue;
            if (cc.name === "w:r")
              f.children.push(parseRun(cc));
            else if (cc.name === "w:hyperlink")
              f.children.push(parseHyperlink(cc));
          }
          return f;
        }
        default:
          return null;
      }
    }
    function parseParagraph(pEl) {
      const pPrEl = xml.findChild(pEl, "w:pPr"), pPr = props.parseParagraphProperties(pPrEl), children = [], extras = [];
      for (const c of pEl.children) {
        if (c.type !== "element")
          continue;
        if (c.name === "w:pPr")
          continue;
        const node = parseInline(c);
        if (node)
          children.push(node);
        else
          extras.push(c);
      }
      const out = { type: "paragraph", children };
      if (pPr)
        out.pPr = pPr;
      if (extras.length)
        out._extras = extras;
      readIds(pEl, out);
      return out;
    }
    function readIds(el, out) {
      const a = el.attrs || {};
      if (a["w14:paraId"] != null)
        out.paraId = a["w14:paraId"];
      if (a["w14:textId"] != null)
        out.textId = a["w14:textId"];
    }
    let paraIdsWritten = null;
    function withParaIds(fn) {
      const before = paraIdsWritten;
      paraIdsWritten = new Set;
      try {
        return fn();
      } finally {
        paraIdsWritten = before;
      }
    }
    function idAttrs(node) {
      const attrs = {}, id = node.paraId;
      if (id != null && !(paraIdsWritten && paraIdsWritten.has(String(id)))) {
        attrs["w14:paraId"] = String(id);
        if (paraIdsWritten)
          paraIdsWritten.add(String(id));
      }
      if (node.textId != null)
        attrs["w14:textId"] = String(node.textId);
      return attrs;
    }
    function parseRevision(el, kind) {
      const out = {
        type: kind,
        id: el.attrs["w:id"],
        children: []
      };
      if (el.attrs["w:author"] !== void 0)
        out.author = el.attrs["w:author"];
      if (el.attrs["w:date"])
        out.date = el.attrs["w:date"];
      const extras = [];
      for (const c of el.children) {
        if (c.type !== "element")
          continue;
        const node = parseInline(c);
        if (node)
          out.children.push(node);
        else
          extras.push(c);
      }
      if (extras.length)
        out._extras = extras;
      return out;
    }
    function renderRevision(rev) {
      const attrs = {};
      if (rev.id != null)
        attrs["w:id"] = String(rev.id);
      if (typeof rev.author === "string")
        attrs["w:author"] = rev.author;
      if (rev.date)
        attrs["w:date"] = rev.date;
      const children = renderInlines(rev.children);
      if (rev._extras)
        for (const ex of rev._extras)
          children.push(ex);
      return xml.el(REVISION_ELEMENTS[rev.type] || "w:ins", attrs, children);
    }
    function renderInlines(nodes) {
      const children = [];
      for (const c of nodes || [])
        switch (c.type) {
          case "run":
            children.push(renderRun(c));
            break;
          case "hyperlink":
            children.push(renderHyperlink(c));
            break;
          case "ins":
          case "del":
          case "moveFrom":
          case "moveTo":
            children.push(renderRevision(c));
            break;
          case "sdt":
            children.push(renderSdt(c));
            break;
          case "smartTag": {
            const kids = [];
            if (c.smartTagPr)
              kids.push(c.smartTagPr);
            kids.push(...renderInlines(c.children));
            if (c._extras)
              kids.push(...c._extras);
            children.push(xml.el("w:smartTag", { ...c.attrs || {} }, kids));
            break;
          }
          case "oMath":
            children.push(mathMod.renderOMath(c));
            break;
          case "fldSimple": {
            const a = { "w:instr": c.instr || "" };
            if (c.dirty)
              a["w:dirty"] = "1";
            const inner = (c.children || []).map((ch) => {
              if (ch.type === "run")
                return renderRun(ch);
              if (ch.type === "hyperlink")
                return renderHyperlink(ch);
              return null;
            }).filter(Boolean);
            children.push(xml.el("w:fldSimple", a, inner));
            break;
          }
          case "bookmarkStart":
          case "bookmarkEnd":
          case "commentRangeStart":
          case "commentRangeEnd":
          case "rangeMarker":
            children.push(renderMarker(c));
            break;
        }
      return children;
    }
    function renderParagraph(p) {
      const children = [], pPrEl = props.renderParagraphProperties(p.pPr);
      if (pPrEl)
        children.push(pPrEl);
      else if (p.pPr && typeof p.pPr === "object")
        children.push(xml.el("w:pPr", {}, []));
      children.push(...renderInlines(p.children));
      if (p._extras)
        for (const ex of p._extras)
          children.push(ex);
      return xml.el("w:p", idAttrs(p), children);
    }
    function parseCell(tcEl) {
      const tcPrEl = xml.findChild(tcEl, "w:tcPr"), tcPr = tcPrEl ? parseCellProperties(tcPrEl) : void 0, children = [], extras = [];
      for (const c of tcEl.children) {
        if (c.type !== "element")
          continue;
        if (c.name === "w:tcPr")
          continue;
        const marker = parseMarker(c);
        if (c.name === "w:p")
          children.push(parseParagraph(c));
        else if (c.name === "w:tbl")
          children.push(parseTable(c));
        else if (c.name === "w:sdt")
          children.push(parseSdt(c, !0));
        else if (marker)
          children.push(marker);
        else
          extras.push(c);
      }
      const out = { type: "cell", children };
      if (tcPr)
        out.tcPr = tcPr;
      if (extras.length)
        out._extras = extras;
      return out;
    }
    const CELL_BLOCKS = new Set(["w:p", "w:tbl", "w:sdt", "w:customXml", "w:altChunk"]);
    function renderCell(c) {
      const children = [], tcPrEl = renderCellProperties(c.tcPr);
      if (tcPrEl)
        children.push(tcPrEl);
      for (const ch of c.children || [])
        if (ch.type === "paragraph")
          children.push(renderParagraph(ch));
        else if (ch.type === "table")
          children.push(renderTable(ch));
        else if (ch.type === "blockSdt")
          children.push(renderSdt(ch));
        else {
          const marker = renderMarker(ch);
          if (marker)
            children.push(marker);
        }
      if (c._extras)
        for (const ex of c._extras)
          children.push(ex);
      if (!children.some((n) => n && CELL_BLOCKS.has(n.name)))
        children.push(xml.el("w:p", {}));
      return xml.el("w:tc", {}, children);
    }
    function parseCellProperties(tcPrEl) {
      const out = {}, extras = [];
      for (const c of tcPrEl.children) {
        if (c.type !== "element")
          continue;
        switch (c.name) {
          case "w:tcW":
            out.width = { w: c.attrs["w:w"], type: c.attrs["w:type"] };
            break;
          case "w:gridSpan":
            out.gridSpan = Number(c.attrs["w:val"]);
            break;
          case "w:vMerge":
            out.vMerge = c.attrs["w:val"] || "continue";
            break;
          default:
            extras.push(c);
        }
      }
      if (extras.length)
        out._extras = extras;
      return Object.keys(out).length ? out : void 0;
    }
    function renderCellProperties(tcPr) {
      if (!tcPr)
        return null;
      const children = [];
      if (tcPr.width)
        children.push(xml.el("w:tcW", {
          "w:w": String(tcPr.width.w ?? ""),
          "w:type": tcPr.width.type || "dxa"
        }));
      if (tcPr.gridSpan != null)
        children.push(xml.el("w:gridSpan", { "w:val": String(tcPr.gridSpan) }));
      if (tcPr.vMerge)
        children.push(tcPr.vMerge === "continue" ? xml.el("w:vMerge", {}) : xml.el("w:vMerge", { "w:val": tcPr.vMerge }));
      if (tcPr._extras)
        for (const ex of tcPr._extras)
          children.push(ex);
      if (!children.length)
        return null;
      return xml.el("w:tcPr", {}, ordered(children, TCPR_SEQ));
    }
    function readWrapped(children, itemName, parseItem, items, extras) {
      let group = 0;
      const walk = (kids, chain, sink) => {
        for (const c of kids) {
          if (c.type !== "element")
            continue;
          if (c.name === itemName) {
            const item = parseItem(c);
            if (chain.length)
              item.sdt = chain.slice();
            items.push(item);
          } else if (c.name === "w:sdt") {
            const ctl = { group: group++ }, pr = parseSdtProperties(xml.findChild(c, "w:sdtPr"));
            if (pr)
              ctl.properties = pr;
            const own = c.children.filter((k) => k.type === "element" && k.name !== "w:sdtPr" && k.name !== "w:sdtContent");
            if (own.length)
              ctl._extras = own;
            const content = xml.findChild(c, "w:sdtContent"), inner = [], before = items.length;
            walk(content ? content.children : [], [...chain, ctl], inner);
            if (items.length === before)
              sink.push(c);
            else if (inner.length)
              ctl._contentExtras = inner;
          } else
            sink.push(c);
        }
      };
      walk(children, [], extras);
    }
    function renderWrapped(items, renderItem, out) {
      const stack = [], target = () => stack.length ? stack[stack.length - 1].content : out, close = () => {
        const { ctl, content } = stack.pop(), kids = [], pr = renderSdtProperties(ctl.properties);
        if (pr)
          kids.push(pr);
        if (ctl._extras)
          kids.push(...ctl._extras);
        kids.push(xml.el("w:sdtContent", {}, [...content, ...ctl._contentExtras || []]));
        target().push(xml.el("w:sdt", {}, kids));
      };
      for (const it of items) {
        const chain = Array.isArray(it && it.sdt) ? it.sdt : [];
        let k = 0;
        while (k < stack.length && k < chain.length && chain[k] && stack[k].ctl.group === chain[k].group)
          k++;
        while (stack.length > k)
          close();
        for (;k < chain.length; k++)
          if (chain[k])
            stack.push({ ctl: chain[k], content: [] });
        target().push(renderItem(it));
      }
      while (stack.length)
        close();
    }
    function parseRow(trEl) {
      const cells = [], extras = [];
      readWrapped(trEl.children, "w:tc", parseCell, cells, extras);
      const out = { type: "row", cells };
      if (extras.length)
        out._extras = extras;
      readIds(trEl, out);
      return out;
    }
    function renderRow(row) {
      const extras = row._extras || [], head = (name) => extras.filter((ex) => ex && ex.name === name), children = [...head("w:tblPrEx"), ...head("w:trPr")];
      renderWrapped(row.cells || [], renderCell, children);
      for (const ex of extras)
        if (!(ex && (ex.name === "w:tblPrEx" || ex.name === "w:trPr")))
          children.push(ex);
      return xml.el("w:tr", idAttrs(row), children);
    }
    function parseTable(tblEl) {
      const rows = [], extras = [], out = { type: "table", rows }, rest = [];
      for (const c of tblEl.children) {
        if (c.type !== "element")
          continue;
        if (c.name === "w:tblPr") {
          const tp = props.parseTableProperties(c);
          if (tp !== void 0)
            out.tblPr = tp;
          else
            extras.push(c);
        } else
          rest.push(c);
      }
      readWrapped(rest, "w:tr", parseRow, rows, extras);
      if (extras.length)
        out._extras = extras;
      return out;
    }
    function renderGrid(rows) {
      const span = (c) => Math.max(1, Number(c && c.tcPr && c.tcPr.gridSpan) || 1);
      let n = 0;
      for (const r of rows)
        n = Math.max(n, (r.cells || []).reduce((sum, c) => sum + span(c), 0));
      const dxa = (c) => {
        const w = c && c.tcPr && c.tcPr.width, v = w ? Number(w.w) : NaN;
        return w && (w.type || "dxa") === "dxa" && Number.isFinite(v) && v >= 0 ? String(v) : null;
      }, sized = rows.map((r) => r.cells || []).find((cs) => cs.length === n && cs.every((c) => span(c) === 1 && dxa(c) !== null)), cols = [];
      for (let i = 0;i < n; i++)
        cols.push(xml.el("w:gridCol", sized ? { "w:w": dxa(sized[i]) } : {}));
      return xml.el("w:tblGrid", {}, cols);
    }
    function renderTable(t) {
      const extras = t._extras || [], keptPr = extras.find((ex) => ex && ex.name === "w:tblPr"), keptGrid = extras.find((ex) => ex && ex.name === "w:tblGrid"), pr = props.renderTableProperties(t.tblPr) || keptPr || xml.el("w:tblPr", {}, []), children = [pr, keptGrid || renderGrid(t.rows || [])];
      for (const ex of extras)
        if (ex !== pr && ex !== keptGrid)
          children.push(ex);
      renderWrapped(t.rows || [], renderRow, children);
      return xml.el("w:tbl", {}, children);
    }
    const SECT_KNOWN = new Set([
      "w:pgSz",
      "w:pgMar",
      "w:type",
      "w:headerReference",
      "w:footerReference",
      "w:titlePg"
    ]), UNIT_TWIPS = { in: 1440, pt: 20, pc: 240, pi: 240, cm: 566.9291338582677, mm: 56.69291338582677 }, UNIVERSAL_MEASURE = /^(-?[0-9]+(?:\.[0-9]+)?)(mm|cm|in|pt|pc|pi)$/;
    function twipsMeasure(v) {
      const m = UNIVERSAL_MEASURE.exec(v);
      return m ? Math.round(Number(m[1]) * UNIT_TWIPS[m[2]]) : Number(v);
    }
    function parseSection(sectPrEl) {
      const out = {}, extras = [];
      for (const c of sectPrEl.children) {
        if (c.type !== "element")
          continue;
        switch (c.name) {
          case "w:pgSz":
            out.pageSize = {};
            if (c.attrs["w:w"])
              out.pageSize.w = twipsMeasure(c.attrs["w:w"]);
            if (c.attrs["w:h"])
              out.pageSize.h = twipsMeasure(c.attrs["w:h"]);
            if (c.attrs["w:orient"])
              out.pageSize.orient = c.attrs["w:orient"];
            if (c.attrs["w:code"] != null && c.attrs["w:code"] !== "")
              out.pageSize.code = Number(c.attrs["w:code"]);
            break;
          case "w:pgMar":
            out.pageMargin = {};
            for (const k of [
              "top",
              "right",
              "bottom",
              "left",
              "header",
              "footer",
              "gutter"
            ]) {
              const a = c.attrs["w:" + k];
              if (a != null)
                out.pageMargin[k] = twipsMeasure(a);
            }
            break;
          case "w:type":
            out.type = c.attrs["w:val"];
            break;
          case "w:headerReference":
            out.headerReferences = out.headerReferences || [];
            out.headerReferences.push({
              type: c.attrs["w:type"] || "default",
              rId: c.attrs["r:id"]
            });
            break;
          case "w:footerReference":
            out.footerReferences = out.footerReferences || [];
            out.footerReferences.push({
              type: c.attrs["w:type"] || "default",
              rId: c.attrs["r:id"]
            });
            break;
          case "w:titlePg":
            out.titlePg = !0;
            break;
          default:
            if (!SECT_KNOWN.has(c.name))
              extras.push(c);
        }
      }
      if (extras.length)
        out._extras = extras;
      return out;
    }
    function renderSection(sect) {
      if (!sect)
        return null;
      const children = [];
      for (const ref of sect.headerReferences || [])
        children.push(xml.el("w:headerReference", { "w:type": ref.type || "default", "r:id": ref.rId }));
      for (const ref of sect.footerReferences || [])
        children.push(xml.el("w:footerReference", { "w:type": ref.type || "default", "r:id": ref.rId }));
      if (sect.type)
        children.push(xml.el("w:type", { "w:val": sect.type }));
      if (sect.pageSize) {
        const a = {};
        if (sect.pageSize.w != null)
          a["w:w"] = String(sect.pageSize.w);
        if (sect.pageSize.h != null)
          a["w:h"] = String(sect.pageSize.h);
        if (sect.pageSize.orient)
          a["w:orient"] = sect.pageSize.orient;
        if (sect.pageSize.code != null)
          a["w:code"] = String(sect.pageSize.code);
        children.push(xml.el("w:pgSz", a));
      }
      if (sect.pageMargin) {
        const a = {};
        for (const k of [
          "top",
          "right",
          "bottom",
          "left",
          "header",
          "footer",
          "gutter"
        ])
          if (sect.pageMargin[k] != null)
            a["w:" + k] = String(sect.pageMargin[k]);
        children.push(xml.el("w:pgMar", a));
      }
      if (sect.titlePg)
        children.push(xml.el("w:titlePg", {}));
      if (sect._extras)
        for (const ex of sect._extras)
          children.push(ex);
      return xml.el("w:sectPr", {}, children.length ? ordered(children, SECT_SEQ) : []);
    }
    function blockMathOf(pEl) {
      let math = null;
      for (const c of pEl.children) {
        if (c.type !== "element")
          continue;
        if (c.name !== "m:oMathPara" || math)
          return null;
        math = c;
      }
      return math;
    }
    function parseBody(bodyEl) {
      const body = [];
      let sectPr;
      const extras = [];
      for (const c of bodyEl.children) {
        if (c.type !== "element")
          continue;
        switch (c.name) {
          case "w:p": {
            const math = blockMathOf(c), node = math ? mathMod.parseOMathPara(math) : parseParagraph(c);
            if (math)
              readIds(c, node);
            body.push(node);
            break;
          }
          case "w:tbl":
            body.push(parseTable(c));
            break;
          case "w:sdt":
            body.push(parseSdt(c, !0));
            break;
          case "m:oMathPara":
            body.push(mathMod.parseOMathPara(c));
            break;
          case "w:sectPr":
            sectPr = parseSection(c);
            break;
          default: {
            const marker = parseMarker(c);
            if (marker)
              body.push(marker);
            else
              extras.push(c);
          }
        }
      }
      return { body, sectPr, extras };
    }
    function renderBodyChildren(doc) {
      const children = [];
      for (const node of doc.body || [])
        if (node.type === "paragraph")
          children.push(renderParagraph(node));
        else if (node.type === "table")
          children.push(renderTable(node));
        else if (node.type === "blockSdt")
          children.push(renderSdt(node));
        else if (node.type === "oMathPara")
          children.push(xml.el("w:p", idAttrs(node), [mathMod.renderOMathPara(node)]));
        else {
          const marker = renderMarker(node);
          if (marker)
            children.push(marker);
        }
      if (doc._extras)
        for (const ex of doc._extras)
          children.push(ex);
      const sect = renderSection(doc.sectPr);
      if (sect)
        children.push(sect);
      return children;
    }
    return {
      parseRun,
      renderRun,
      parseHyperlink,
      renderHyperlink,
      parseParagraph,
      renderParagraph,
      withParaIds,
      withChoiceDrawings,
      parseTable,
      renderTable,
      parseRow,
      renderRow,
      parseCell,
      renderCell,
      parseSection,
      renderSection,
      parseSdt,
      renderSdt,
      parseSdtProperties,
      renderSdtProperties,
      parseBody,
      renderBodyChildren
    };
  } });
    __register({ name: "docxStyles", dependencies: ["ooxmlErrors","xml","docxProperties","ooxmlShared"], factory: function(errors, xml, props, shared) {
    const { ParseError } = errors, { REL_TYPE, CT, encodeText, decodeText, wordRootAttrs } = shared, orderSeq = shared.sequence ? shared.sequence : () => null, ordered = (children, seq) => seq && shared.orderBySequence ? shared.orderBySequence(children, seq) : children, STYLE_SEQ = orderSeq([
      "w:name",
      "w:aliases",
      "w:basedOn",
      "w:next",
      "w:link",
      "w:autoRedefine",
      "w:hidden",
      "w:uiPriority",
      "w:semiHidden",
      "w:unhideWhenUsed",
      "w:qFormat",
      "w:locked",
      "w:personal",
      "w:personalCompose",
      "w:personalReply",
      "w:rsid",
      "w:pPr",
      "w:rPr",
      "w:tblPr",
      "w:trPr",
      "w:tcPr",
      "w:tblStylePr"
    ]), STYLES_SEQ = orderSeq([
      "w:docDefaults",
      "w:latentStyles",
      "w:style"
    ]), REL_TYPE_STYLES = REL_TYPE.STYLES, CT_STYLES = CT.STYLES_W;
    function valOf(el) {
      return el ? el.attrs["w:val"] : void 0;
    }
    function elVal(name, val) {
      return xml.el(name, { "w:val": String(val) });
    }
    function parseStyle(sEl) {
      const out = {
        type: sEl.attrs["w:type"] || "paragraph",
        styleId: sEl.attrs["w:styleId"]
      };
      if (sEl.attrs["w:default"] === "1")
        out.isDefault = !0;
      const extras = [];
      for (const c of sEl.children) {
        if (c.type !== "element")
          continue;
        switch (c.name) {
          case "w:name":
            out.name = valOf(c);
            break;
          case "w:basedOn":
            out.basedOn = valOf(c);
            break;
          case "w:next":
            out.next = valOf(c);
            break;
          case "w:rPr": {
            const r = props.parseRunProperties(c);
            if (r)
              out.rPr = r;
            break;
          }
          case "w:pPr": {
            const p = props.parseParagraphProperties(c);
            if (p)
              out.pPr = p;
            break;
          }
          case "w:tblPr": {
            const t = props.parseTableProperties(c);
            if (t)
              out.tblPr = t;
            else
              extras.push(c);
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
    function renderStyle(s) {
      const attrs = { "w:type": s.type || "paragraph", "w:styleId": s.styleId };
      if (s.isDefault)
        attrs["w:default"] = "1";
      const children = [];
      if (s.name != null)
        children.push(elVal("w:name", s.name));
      if (s.basedOn != null)
        children.push(elVal("w:basedOn", s.basedOn));
      if (s.next != null)
        children.push(elVal("w:next", s.next));
      const pPrEl = props.renderParagraphProperties(s.pPr);
      if (pPrEl)
        children.push(pPrEl);
      const rPrEl = props.renderRunProperties(s.rPr);
      if (rPrEl)
        children.push(rPrEl);
      const tblPrEl = props.renderTableProperties(s.tblPr);
      if (tblPrEl)
        children.push(tblPrEl);
      if (s._extras)
        for (const ex of s._extras)
          children.push(ex);
      return xml.el("w:style", attrs, ordered(children, STYLE_SEQ));
    }
    function parseDocDefaults(ddEl) {
      const out = {};
      for (const c of ddEl.children) {
        if (c.type !== "element")
          continue;
        if (c.name === "w:rPrDefault") {
          const inner = c.children.find((n) => n.type === "element" && n.name === "w:rPr");
          if (inner) {
            const r = props.parseRunProperties(inner);
            if (r)
              out.rPr = r;
          }
        } else if (c.name === "w:pPrDefault") {
          const inner = c.children.find((n) => n.type === "element" && n.name === "w:pPr");
          if (inner) {
            const p = props.parseParagraphProperties(inner);
            if (p)
              out.pPr = p;
          }
        }
      }
      return Object.keys(out).length ? out : void 0;
    }
    function renderDocDefaults(dd) {
      if (!dd)
        return null;
      const children = [], rPrEl = props.renderRunProperties(dd.rPr);
      if (rPrEl)
        children.push(xml.el("w:rPrDefault", {}, [rPrEl]));
      const pPrEl = props.renderParagraphProperties(dd.pPr);
      if (pPrEl)
        children.push(xml.el("w:pPrDefault", {}, [pPrEl]));
      if (!children.length)
        return null;
      return xml.el("w:docDefaults", {}, children);
    }
    function parse(input) {
      const text = typeof input === "string" ? input : decodeText(input), root = xml.parse(text);
      if (root.name !== "w:styles")
        throw new ParseError("docx/styles-bad-root", `docx styles: expected <w:styles>, got <${root.name}>`, { context: { elementName: root && root.name } });
      const out = { styles: [] }, extras = [];
      for (const c of root.children) {
        if (c.type !== "element")
          continue;
        if (c.name === "w:docDefaults") {
          const dd = parseDocDefaults(c);
          if (dd)
            out.docDefaults = dd;
        } else if (c.name === "w:style")
          out.styles.push(parseStyle(c));
        else
          extras.push(c);
      }
      if (extras.length)
        out._extras = extras;
      return out;
    }
    function serialize(stylesObj) {
      const children = [], dd = renderDocDefaults(stylesObj.docDefaults);
      if (dd)
        children.push(dd);
      for (const s of stylesObj.styles || [])
        children.push(renderStyle(s));
      if (stylesObj._extras)
        for (const ex of stylesObj._extras)
          children.push(ex);
      const kids = ordered(children, STYLES_SEQ);
      return xml.serialize(xml.el("w:styles", wordRootAttrs(kids, { r: !1 }), kids));
    }
    function defaults() {
      return {
        docDefaults: { rPr: { font: "Calibri", size: 22 } },
        styles: [
          {
            type: "paragraph",
            styleId: "Normal",
            name: "Normal",
            isDefault: !0
          }
        ]
      };
    }
    function bytesOf(stylesObj) {
      return encodeText(serialize(stylesObj));
    }
    return {
      parse,
      serialize,
      defaults,
      bytesOf,
      renderStyle,
      parseStyle,
      REL_TYPE_STYLES,
      CT_STYLES
    };
  } });
    __register({ name: "docxNumbering", dependencies: ["ooxmlErrors","xml","docxProperties","ooxmlShared"], factory: function(errors, xml, props, shared) {
    const orderSeq = shared.sequence ? shared.sequence : () => null, ordered = (children, seq) => seq && shared.orderBySequence ? shared.orderBySequence(children, seq) : children, LVL_SEQ = orderSeq([
      "w:start",
      "w:numFmt",
      "w:lvlRestart",
      "w:pStyle",
      "w:isLgl",
      "w:suff",
      "w:lvlText",
      "w:lvlPicBulletId",
      "w:legacy",
      "w:lvlJc",
      "w:pPr",
      "w:rPr"
    ]), ABSTRACT_SEQ = orderSeq([
      "w:nsid",
      "w:multiLevelType",
      "w:tmpl",
      "w:name",
      "w:styleLink",
      "w:numStyleLink",
      "w:lvl"
    ]), NUMBERING_SEQ = orderSeq([
      "w:numPicBullet",
      "w:abstractNum",
      "w:num",
      "w:numIdMacAtCleanup"
    ]), { ParseError } = errors, { REL_TYPE, CT, encodeText, decodeText, wordRootAttrs } = shared, REL_TYPE_NUMBERING = REL_TYPE.NUMBERING, CT_NUMBERING = CT.NUMBERING;
    function valOf(el) {
      return el ? el.attrs["w:val"] : void 0;
    }
    function elVal(name, val) {
      return xml.el(name, { "w:val": String(val) });
    }
    function parseLevel(lvlEl) {
      const out = { ilvl: Number(lvlEl.attrs["w:ilvl"]) }, extras = [];
      for (const c of lvlEl.children) {
        if (c.type !== "element")
          continue;
        switch (c.name) {
          case "w:start":
            out.start = Number(valOf(c));
            break;
          case "w:numFmt":
            out.numFmt = valOf(c);
            break;
          case "w:lvlText":
            out.lvlText = c.attrs["w:val"];
            break;
          case "w:lvlJc":
            out.lvlJc = valOf(c);
            break;
          case "w:pPr": {
            const p = props.parseParagraphProperties(c);
            if (p)
              out.pPr = p;
            break;
          }
          case "w:rPr": {
            const r = props.parseRunProperties(c);
            if (r)
              out.rPr = r;
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
    function renderLevel(lvl) {
      const children = [];
      if (lvl.start != null)
        children.push(elVal("w:start", lvl.start));
      if (lvl.numFmt)
        children.push(elVal("w:numFmt", lvl.numFmt));
      if (lvl.lvlText != null)
        children.push(xml.el("w:lvlText", { "w:val": String(lvl.lvlText) }));
      if (lvl.lvlJc)
        children.push(elVal("w:lvlJc", lvl.lvlJc));
      const pPrEl = props.renderParagraphProperties(lvl.pPr);
      if (pPrEl)
        children.push(pPrEl);
      const rPrEl = props.renderRunProperties(lvl.rPr);
      if (rPrEl)
        children.push(rPrEl);
      if (lvl._extras)
        for (const ex of lvl._extras)
          children.push(ex);
      return xml.el("w:lvl", { "w:ilvl": String(lvl.ilvl) }, ordered(children, LVL_SEQ));
    }
    function parseAbstractNum(aEl) {
      const out = {
        abstractNumId: Number(aEl.attrs["w:abstractNumId"]),
        levels: []
      }, extras = [];
      for (const c of aEl.children) {
        if (c.type !== "element")
          continue;
        switch (c.name) {
          case "w:name":
            out.name = valOf(c);
            break;
          case "w:multiLevelType":
            out.multiLevelType = valOf(c);
            break;
          case "w:lvl":
            out.levels.push(parseLevel(c));
            break;
          default:
            extras.push(c);
        }
      }
      if (extras.length)
        out._extras = extras;
      return out;
    }
    function renderAbstractNum(a) {
      const children = [];
      if (a.multiLevelType)
        children.push(elVal("w:multiLevelType", a.multiLevelType));
      if (a.name)
        children.push(elVal("w:name", a.name));
      if (a._extras)
        for (const ex of a._extras)
          children.push(ex);
      for (const lvl of a.levels || [])
        children.push(renderLevel(lvl));
      return xml.el("w:abstractNum", { "w:abstractNumId": String(a.abstractNumId) }, ordered(children, ABSTRACT_SEQ));
    }
    function parseNum(nEl) {
      const out = { numId: Number(nEl.attrs["w:numId"]) }, overrides = [];
      for (const c of nEl.children) {
        if (c.type !== "element")
          continue;
        if (c.name === "w:abstractNumId")
          out.abstractNumId = Number(valOf(c));
        else if (c.name === "w:lvlOverride") {
          const ov = { ilvl: Number(c.attrs["w:ilvl"]) }, startOv = xml.findChild(c, "w:startOverride");
          if (startOv)
            ov.startOverride = Number(valOf(startOv));
          overrides.push(ov);
        }
      }
      if (overrides.length)
        out.lvlOverrides = overrides;
      return out;
    }
    function renderNum(n) {
      const children = [];
      if (n.abstractNumId != null)
        children.push(elVal("w:abstractNumId", n.abstractNumId));
      for (const ov of n.lvlOverrides || []) {
        const inner = [];
        if (ov.startOverride != null)
          inner.push(elVal("w:startOverride", ov.startOverride));
        children.push(xml.el("w:lvlOverride", { "w:ilvl": String(ov.ilvl) }, inner));
      }
      return xml.el("w:num", { "w:numId": String(n.numId) }, children);
    }
    function parse(input) {
      const text = typeof input === "string" ? input : decodeText(input), root = xml.parse(text);
      if (root.name !== "w:numbering")
        throw new ParseError("docx/numbering-bad-root", `docx numbering: expected <w:numbering>, got <${root.name}>`, { context: { elementName: root && root.name } });
      const out = { abstractNums: [], nums: [] }, extras = [];
      for (const c of root.children) {
        if (c.type !== "element")
          continue;
        if (c.name === "w:abstractNum")
          out.abstractNums.push(parseAbstractNum(c));
        else if (c.name === "w:num")
          out.nums.push(parseNum(c));
        else
          extras.push(c);
      }
      if (extras.length)
        out._extras = extras;
      return out;
    }
    function serialize(obj) {
      const children = [];
      for (const a of obj.abstractNums || [])
        children.push(renderAbstractNum(a));
      for (const n of obj.nums || [])
        children.push(renderNum(n));
      if (obj._extras)
        for (const ex of obj._extras)
          children.push(ex);
      const kids = ordered(children, NUMBERING_SEQ);
      return xml.serialize(xml.el("w:numbering", wordRootAttrs(kids, { r: !1 }), kids));
    }
    function bytesOf(obj) {
      return encodeText(serialize(obj));
    }
    function decimalList() {
      return {
        numbering: {
          abstractNums: [{
            abstractNumId: 0,
            multiLevelType: "singleLevel",
            levels: [{
              ilvl: 0,
              start: 1,
              numFmt: "decimal",
              lvlText: "%1.",
              lvlJc: "left",
              pPr: { indent: { left: 720, hanging: 360 } }
            }]
          }],
          nums: [{ numId: 1, abstractNumId: 0 }]
        },
        numId: 1
      };
    }
    function bulletList() {
      return {
        numbering: {
          abstractNums: [{
            abstractNumId: 0,
            multiLevelType: "singleLevel",
            levels: [{
              ilvl: 0,
              numFmt: "bullet",
              lvlText: "\u2022",
              lvlJc: "left",
              pPr: { indent: { left: 720, hanging: 360 } }
            }]
          }],
          nums: [{ numId: 1, abstractNumId: 0 }]
        },
        numId: 1
      };
    }
    return {
      parse,
      serialize,
      bytesOf,
      decimalList,
      bulletList,
      REL_TYPE_NUMBERING,
      CT_NUMBERING
    };
  } });
    __register({ name: "docxSettings", dependencies: ["ooxmlErrors","xml","ooxmlShared"], factory: function(errors, xml, shared) {
    const orderSeq = shared.sequence ? shared.sequence : () => null, ordered = (children, seq) => seq && shared.orderBySequence ? shared.orderBySequence(children, seq) : children, SETTINGS_SEQ = orderSeq([
      "w:writeProtection",
      "w:view",
      "w:zoom",
      "w:removePersonalInformation",
      "w:removeDateAndTime",
      "w:doNotDisplayPageBoundaries",
      "w:displayBackgroundShape",
      "w:printPostScriptOverText",
      "w:printFractionalCharacterWidth",
      "w:printFormsData",
      "w:embedTrueTypeFonts",
      "w:embedSystemFonts",
      "w:saveSubsetFonts",
      "w:saveFormsData",
      "w:mirrorMargins",
      "w:alignBordersAndEdges",
      "w:bordersDoNotSurroundHeader",
      "w:bordersDoNotSurroundFooter",
      "w:gutterAtTop",
      "w:hideSpellingErrors",
      "w:hideGrammaticalErrors",
      "w:activeWritingStyle",
      "w:proofState",
      "w:formsDesign",
      "w:attachedTemplate",
      "w:linkStyles",
      "w:stylePaneFormatFilter",
      "w:stylePaneSortMethod",
      "w:documentType",
      "w:mailMerge",
      "w:revisionView",
      ["w:trackRevisions", "w:trackChanges"],
      "w:doNotTrackMoves",
      "w:doNotTrackFormatting",
      "w:documentProtection",
      "w:autoFormatOverride",
      "w:styleLockTheme",
      "w:styleLockQFSet",
      "w:defaultTabStop",
      "w:autoHyphenation",
      "w:consecutiveHyphenLimit",
      "w:hyphenationZone",
      "w:doNotHyphenateCaps",
      "w:showEnvelope",
      "w:summaryLength",
      "w:clickAndTypeStyle",
      "w:defaultTableStyle",
      "w:evenAndOddHeaders",
      "w:bookFoldRevPrinting",
      "w:bookFoldPrinting",
      "w:bookFoldPrintingSheets",
      "w:drawingGridHorizontalSpacing",
      "w:drawingGridVerticalSpacing",
      "w:displayHorizontalDrawingGridEvery",
      "w:displayVerticalDrawingGridEvery",
      "w:doNotUseMarginsForDrawingGridOrigin",
      "w:drawingGridHorizontalOrigin",
      "w:drawingGridVerticalOrigin",
      "w:doNotShadeFormData",
      "w:noPunctuationKerning",
      "w:characterSpacingControl",
      "w:printTwoOnOne",
      "w:strictFirstAndLastChars",
      "w:noLineBreaksAfter",
      "w:noLineBreaksBefore",
      "w:savePreviewPicture",
      "w:doNotValidateAgainstSchema",
      "w:saveInvalidXml",
      "w:ignoreMixedContent",
      "w:alwaysShowPlaceholderText",
      "w:doNotDemarcateInvalidXml",
      "w:saveXmlDataOnly",
      "w:useXSLTWhenSaving",
      "w:saveThroughXslt",
      "w:showXMLTags",
      "w:alwaysMergeEmptyNamespace",
      "w:updateFields",
      "w:hdrShapeDefaults",
      "w:footnotePr",
      "w:endnotePr",
      "w:compat",
      "w:docVars",
      "w:rsids",
      "m:mathPr",
      "w:uiCompat97To2003",
      "w:attachedSchema",
      "w:themeFontLang",
      "w:clrSchemeMapping",
      "w:doNotIncludeSubdocsInStats",
      "w:doNotAutoCompressPictures",
      "w:forceUpgrade",
      "w:captions",
      "w:readModeInkLockDown",
      "w:smartTagType",
      "sl:schemaLibrary",
      "w:shapeDefaults",
      "w:doNotEmbedSmartTags",
      "w:decimalSymbol",
      "w:listSeparator"
    ]), { ParseError, RenderError } = errors, { NS, REL_TYPE, CT, encodeText, decodeText } = shared, W_NS = NS.W, REL_TYPE_SETTINGS = REL_TYPE.SETTINGS, CT_SETTINGS = CT.SETTINGS, SETTINGS_PREFIXES = Object.freeze({
      r: NS.R,
      m: NS.M,
      o: "urn:schemas-microsoft-com:office:office",
      v: "urn:schemas-microsoft-com:vml",
      w10: "urn:schemas-microsoft-com:office:word",
      w14: "http://schemas.microsoft.com/office/word/2010/wordml",
      w15: NS.W15,
      w16cex: "http://schemas.microsoft.com/office/word/2018/wordml/cex",
      w16cid: "http://schemas.microsoft.com/office/word/2016/wordml/cid",
      w16: "http://schemas.microsoft.com/office/word/2018/wordml",
      w16sdtdh: "http://schemas.microsoft.com/office/word/2020/wordml/sdtdatahash",
      w16se: "http://schemas.microsoft.com/office/word/2015/wordml/symex",
      sl: "http://schemas.openxmlformats.org/schemaLibrary/2006/main",
      mc: NS.MC
    }), EXTENSION_PREFIXES = new Set(["w14", "w15", "w16cex", "w16cid", "w16", "w16sdtdh", "w16se"]);
    function collectPrefixes(nodes, used) {
      for (const node of nodes) {
        if (!node || node.type !== "element")
          continue;
        addPrefix(node.name, used);
        for (const k of Object.keys(node.attrs || {})) {
          if (k === "xmlns" || k.startsWith("xmlns:"))
            continue;
          addPrefix(k, used);
        }
        if (node.children)
          collectPrefixes(node.children, used);
      }
    }
    function addPrefix(qname, used) {
      const i = qname.indexOf(":");
      if (i < 0)
        return;
      const prefix = qname.slice(0, i);
      if (prefix === "xml" || prefix === "xmlns")
        return;
      used.add(prefix);
    }
    function rootAttrs(children) {
      const used = new Set;
      collectPrefixes(children, used);
      for (const prefix of used)
        if (prefix !== "w" && !Object.hasOwn(SETTINGS_PREFIXES, prefix))
          throw new RenderError("docx/settings-unknown-prefix", `docx settings: the settings tree uses the prefix "${prefix}", which has no known namespace`, { context: { prefix } });
      const attrs = { "xmlns:w": W_NS }, ignorable = [];
      for (const [prefix, uri] of Object.entries(SETTINGS_PREFIXES)) {
        if (!used.has(prefix))
          continue;
        attrs[`xmlns:${prefix}`] = uri;
        if (EXTENSION_PREFIXES.has(prefix))
          ignorable.push(prefix);
      }
      if (ignorable.length) {
        if (!attrs["xmlns:mc"])
          attrs["xmlns:mc"] = SETTINGS_PREFIXES.mc;
        attrs["mc:Ignorable"] = ignorable.join(" ");
      }
      return attrs;
    }
    function readToggle(el) {
      const v = el.attrs["w:val"];
      if (v === void 0)
        return !0;
      return !(v === "0" || v === "false" || v === "off");
    }
    function parse(input) {
      const text = typeof input === "string" ? input : decodeText(input), root = xml.parse(text);
      if (root.name !== "w:settings")
        throw new ParseError("docx/settings-bad-root", `docx settings: expected <w:settings>, got <${root.name}>`, { context: { elementName: root && root.name } });
      const out = {}, extras = [];
      for (const c of root.children) {
        if (c.type !== "element")
          continue;
        switch (c.name) {
          case "w:defaultTabStop":
            out.defaultTabStop = Number(c.attrs["w:val"]);
            break;
          case "w:evenAndOddHeaders":
            out.evenAndOddHeaders = readToggle(c);
            break;
          case "w:updateFields":
            out.updateFields = readToggle(c);
            break;
          case "w:trackRevisions":
          case "w:trackChanges":
            out.trackChanges = readToggle(c);
            break;
          case "w:zoom": {
            const z = {};
            if (c.attrs["w:val"])
              z.val = c.attrs["w:val"];
            if (c.attrs["w:percent"])
              z.percent = Number(c.attrs["w:percent"]);
            out.zoom = z;
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
    function serialize(obj) {
      const children = [];
      if (obj.defaultTabStop != null)
        children.push(xml.el("w:defaultTabStop", { "w:val": String(obj.defaultTabStop) }));
      const toggle = (name, v) => {
        if (v === !0)
          children.push(xml.el(name, {}));
        else if (v === !1)
          children.push(xml.el(name, { "w:val": "0" }));
      };
      toggle("w:evenAndOddHeaders", obj.evenAndOddHeaders);
      toggle("w:updateFields", obj.updateFields);
      toggle("w:trackRevisions", obj.trackChanges);
      if (obj.zoom) {
        const a = {};
        if (obj.zoom.val)
          a["w:val"] = obj.zoom.val;
        if (obj.zoom.percent != null)
          a["w:percent"] = String(obj.zoom.percent);
        children.push(xml.el("w:zoom", a));
      }
      const typedTracking = typeof obj.trackChanges === "boolean";
      if (obj._extras)
        for (const ex of obj._extras) {
          if (typedTracking && (ex.name === "w:trackRevisions" || ex.name === "w:trackChanges"))
            continue;
          children.push(ex);
        }
      const kids = ordered(children, SETTINGS_SEQ);
      return xml.serialize(xml.el("w:settings", rootAttrs(kids), kids));
    }
    function bytesOf(obj) {
      return encodeText(serialize(obj));
    }
    return {
      parse,
      serialize,
      bytesOf,
      REL_TYPE_SETTINGS,
      CT_SETTINGS
    };
  } });
    __register({ name: "docxComments", dependencies: ["ooxmlErrors","xml","docxStructure","ooxmlShared"], factory: function(errors, xml, structure, shared) {
    const { ParseError } = errors, { REL_TYPE, CT, encodeText, decodeText, wordRootAttrs } = shared, REL_TYPE_COMMENTS = REL_TYPE.COMMENTS, CT_COMMENTS = CT.COMMENTS_W;
    function parseComment(cEl) {
      const out = {
        id: Number(cEl.attrs["w:id"]),
        body: []
      };
      if (cEl.attrs["w:author"] !== void 0)
        out.author = cEl.attrs["w:author"];
      if (cEl.attrs["w:date"])
        out.date = cEl.attrs["w:date"];
      if (cEl.attrs["w:initials"])
        out.initials = cEl.attrs["w:initials"];
      const { body, extras } = structure.parseBody(cEl);
      out.body = body;
      if (extras && extras.length)
        out._extras = extras;
      return out;
    }
    function renderComment(c) {
      const attrs = { "w:id": String(c.id) };
      if (typeof c.author === "string")
        attrs["w:author"] = c.author;
      if (c.date)
        attrs["w:date"] = c.date;
      if (c.initials)
        attrs["w:initials"] = c.initials;
      const children = structure.renderBodyChildren({
        body: c.body || [],
        _extras: c._extras
      }).filter((n) => n.name !== "w:sectPr");
      return xml.el("w:comment", attrs, children);
    }
    function parse(input) {
      const root = input && typeof input === "object" && input.type === "element" ? input : xml.parse(typeof input === "string" ? input : decodeText(input));
      if (root.name !== "w:comments")
        throw new ParseError("docx/comments-bad-root", `docx comments: expected <w:comments>, got <${root.name}>`, { context: { elementName: root && root.name } });
      const out = { comments: [] }, extras = [];
      for (const c of root.children) {
        if (c.type !== "element")
          continue;
        if (c.name === "w:comment")
          out.comments.push(parseComment(c));
        else
          extras.push(c);
      }
      if (extras.length)
        out._extras = extras;
      return out;
    }
    function serialize(obj) {
      const children = (obj.comments || []).map(renderComment);
      if (obj._extras)
        for (const ex of obj._extras)
          children.push(ex);
      return xml.serialize(xml.el("w:comments", wordRootAttrs(children), children));
    }
    function bytesOf(obj) {
      return encodeText(serialize(obj));
    }
    return {
      parse,
      serialize,
      bytesOf,
      REL_TYPE_COMMENTS,
      CT_COMMENTS
    };
  } });
    __register({ name: "docxFootnotes", dependencies: ["ooxmlErrors","xml","docxStructure","ooxmlShared"], factory: function(errors, xml, structure, shared) {
    const { ParseError } = errors, { REL_TYPE, CT, encodeText, decodeText, wordRootAttrs } = shared, REL_TYPE_FOOTNOTES = REL_TYPE.FOOTNOTES, REL_TYPE_ENDNOTES = REL_TYPE.ENDNOTES, CT_FOOTNOTES = CT.FOOTNOTES, CT_ENDNOTES = CT.ENDNOTES;
    function parseNote(nEl) {
      const out = {
        id: Number(nEl.attrs["w:id"]),
        body: []
      };
      if (nEl.attrs["w:type"])
        out.noteType = nEl.attrs["w:type"];
      const { body, extras } = structure.parseBody(nEl);
      out.body = body;
      if (extras && extras.length)
        out._extras = extras;
      return out;
    }
    function renderNote(n, childTag) {
      const attrs = { "w:id": String(n.id) };
      if (n.noteType)
        attrs["w:type"] = n.noteType;
      const children = structure.renderBodyChildren({
        body: n.body || [],
        _extras: n._extras
      }).filter((node) => node.name !== "w:sectPr");
      return xml.el(childTag, attrs, children);
    }
    function buildParser(rootTag, childTag) {
      return function parse(input) {
        const root = input && typeof input === "object" && input.type === "element" ? input : xml.parse(typeof input === "string" ? input : decodeText(input));
        if (root.name !== rootTag)
          throw new ParseError(`docx/${rootTag.replace(/^w:/, "")}-bad-root`, `docx ${rootTag}: expected <${rootTag}>, got <${root.name}>`, { context: { expected: rootTag, elementName: root && root.name } });
        const out = { notes: [] }, extras = [];
        for (const c of root.children) {
          if (c.type !== "element")
            continue;
          if (c.name === childTag)
            out.notes.push(parseNote(c, childTag));
          else
            extras.push(c);
        }
        if (extras.length)
          out._extras = extras;
        return out;
      };
    }
    function buildSerializer(rootTag, childTag) {
      return function serialize(obj) {
        const children = (obj.notes || []).map((n) => renderNote(n, childTag));
        if (obj._extras)
          for (const ex of obj._extras)
            children.push(ex);
        return xml.serialize(xml.el(rootTag, wordRootAttrs(children), children));
      };
    }
    const parseFootnotes = buildParser("w:footnotes", "w:footnote"), parseEndnotes = buildParser("w:endnotes", "w:endnote"), serializeFootnotes = buildSerializer("w:footnotes", "w:footnote"), serializeEndnotes = buildSerializer("w:endnotes", "w:endnote");
    function footnotesBytes(obj) {
      return encodeText(serializeFootnotes(obj));
    }
    function endnotesBytes(obj) {
      return encodeText(serializeEndnotes(obj));
    }
    return {
      parseFootnotes,
      parseEndnotes,
      serializeFootnotes,
      serializeEndnotes,
      footnotesBytes,
      endnotesBytes,
      REL_TYPE_FOOTNOTES,
      REL_TYPE_ENDNOTES,
      CT_FOOTNOTES,
      CT_ENDNOTES
    };
  } });
    __register({ name: "docxHeaders", dependencies: ["ooxmlErrors","xml","docxStructure","ooxmlShared"], factory: function(errors, xml, structure, shared) {
    const { ParseError } = errors, { REL_TYPE, CT, encodeText, decodeText, wordRootAttrs } = shared, REL_TYPE_HEADER = REL_TYPE.HEADER, REL_TYPE_FOOTER = REL_TYPE.FOOTER, CT_HEADER = CT.HEADER, CT_FOOTER = CT.FOOTER;
    function parse(input, kind) {
      const root = input && typeof input === "object" && input.type === "element" ? input : xml.parse(typeof input === "string" ? input : decodeText(input)), expected = kind === "footer" ? "w:ftr" : "w:hdr";
      if (root.name !== expected)
        throw new ParseError(`docx/${kind}-bad-root`, `docx ${kind}: expected <${expected}>, got <${root.name}>`, { context: { kind, elementName: root && root.name } });
      const { body, extras } = structure.parseBody(root), out = { type: kind, body };
      if (extras && extras.length)
        out._extras = extras;
      return out;
    }
    function serialize(obj) {
      const tag = obj.type === "footer" ? "w:ftr" : "w:hdr", filtered = structure.renderBodyChildren({
        body: obj.body || [],
        _extras: obj._extras
      }).filter((n) => n.name !== "w:sectPr");
      return xml.serialize(xml.el(tag, wordRootAttrs(filtered), filtered));
    }
    function bytesOf(obj) {
      return encodeText(serialize(obj));
    }
    return {
      parse,
      serialize,
      bytesOf,
      REL_TYPE_HEADER,
      REL_TYPE_FOOTER,
      CT_HEADER,
      CT_FOOTER
    };
  } });
    __register({ name: "markupCompatibility", dependencies: ["xml"], factory: function(xml) {
    function process(root, options) {
      const opts = {
        supportedPrefixes: [],
        preserveAlternateContent: !1,
        keepElements: [],
        ignorablePrefixes: [],
        ...options || {}
      };
      if (!Array.isArray(opts.keepElements))
        opts.keepElements = [];
      const initial = Array.isArray(opts.ignorablePrefixes) ? opts.ignorablePrefixes.filter((p) => !opts.supportedPrefixes.includes(p)) : [];
      walk(root, new Set(initial), opts, !1);
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
      node.children = mergeAdjacentText(out);
    }
    function mergeAdjacentText(children) {
      const out = [];
      for (const c of children) {
        const prev = out[out.length - 1];
        if (c.type === "text" && prev && prev.type === "text")
          out[out.length - 1] = { type: "text", value: prev.value + c.value };
        else
          out.push(c);
      }
      return out;
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
        xml.el("c:v", {}, [xml.text(String(series.name || ""))])
      ]));
      if (series.color)
        children.push(renderSpPrSolid(series.color));
      if (plotType === "scatter") {
        const xVals = series.xValues || (series.categories || []), yVals = series.yValues || series.values || [];
        children.push(xml.el("c:xVal", {}, [renderNumLit(xVals.map(Number), formatCode)]));
        children.push(xml.el("c:yVal", {}, [renderNumLit(yVals.map(Number), formatCode)]));
      } else {
        if (series.categories && series.categories.length)
          children.push(xml.el("c:cat", {}, [renderStrLit(series.categories)]));
        children.push(xml.el("c:val", {}, [renderNumLit(series.values || [], formatCode)]));
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
          const inner = xml.findChild(sr, "c:strCache") || xml.findChild(sr, "c:strLit");
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
        const lit = xml.findChild(strRef, "c:strCache") || xml.findChild(strRef, "c:strLit");
        if (lit)
          return parseStrLit(lit);
      }
      const strLit = xml.findChild(parentEl, "c:strLit");
      if (strLit)
        return parseStrLit(strLit);
      const numRef = xml.findChild(parentEl, "c:numRef");
      if (numRef) {
        const lit = xml.findChild(numRef, "c:numCache") || xml.findChild(numRef, "c:numLit");
        if (lit)
          return parseLitValues(lit);
      }
      const numLit = xml.findChild(parentEl, "c:numLit");
      if (numLit)
        return parseLitValues(numLit);
      return [];
    }
    function readNumData(parentEl) {
      const numRef = xml.findChild(parentEl, "c:numRef");
      if (numRef) {
        const lit = xml.findChild(numRef, "c:numCache") || xml.findChild(numRef, "c:numLit");
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
    __register({ name: "docxCustomXml", dependencies: ["ooxmlErrors","xml","ooxmlShared"], factory: function(errors, xml, shared) {
    const { ParseError, RenderError } = errors, { NS, REL_TYPE, CT, encodeText, decodeText } = shared, DS_NS = NS.DS, REL_TYPE_CUSTOM_XML = REL_TYPE.CUSTOM_XML, REL_TYPE_CUSTOM_XML_PROPS = REL_TYPE.CUSTOM_XML_PROPS, CT_CUSTOM_XML_PROPS = CT.CUSTOM_XML_PROPS;
    function parseProps(input) {
      const text = typeof input === "string" ? input : decodeText(input), root = xml.parse(text);
      if (root.name !== "ds:datastoreItem")
        throw new ParseError("docx/customxml-bad-root", `docx customXml props: expected <ds:datastoreItem>, got <${root.name}>`, { context: { elementName: root && root.name } });
      const out = {
        storeItemID: root.attrs["ds:itemID"] || root.attrs.itemID || ""
      }, schemaRefs = [], refsEl = xml.findChild(root, "ds:schemaRefs");
      if (refsEl) {
        for (const r of xml.findAll(refsEl, "ds:schemaRef"))
          if (r.attrs["ds:uri"])
            schemaRefs.push(r.attrs["ds:uri"]);
      }
      if (schemaRefs.length)
        out.schemaRefs = schemaRefs;
      return out;
    }
    function renderProps(props) {
      const refs = (props.schemaRefs || []).map((uri) => xml.el("ds:schemaRef", { "ds:uri": uri })), children = [];
      children.push(xml.el("ds:schemaRefs", {}, refs));
      return xml.serialize(xml.el("ds:datastoreItem", { "xmlns:ds": DS_NS, "ds:itemID": props.storeItemID || "" }, children));
    }
    function propsBytes(props) {
      return encodeText(renderProps(props));
    }
    function generateStoreItemID() {
      const c = globalThis.crypto;
      if (!c || typeof c.getRandomValues !== "function")
        throw new RenderError("docx/no-random-source", "docx: no cryptographic random source (crypto.getRandomValues is unavailable); pass storeItemID explicitly");
      const b = new Uint8Array(16);
      c.getRandomValues(b);
      b[6] = b[6] & 15 | 64;
      b[8] = b[8] & 63 | 128;
      const hex = Array.from(b, (x) => x.toString(16).padStart(2, "0").toUpperCase()).join("");
      return `{${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}}`;
    }
    return {
      parseProps,
      renderProps,
      propsBytes,
      generateStoreItemID,
      DS_NS,
      REL_TYPE_CUSTOM_XML,
      REL_TYPE_CUSTOM_XML_PROPS,
      CT_CUSTOM_XML_PROPS
    };
  } });
    __register({ name: "docxWalker", dependencies: [], factory: function() {
    const HOOK_NAMES = [
      "hydrateRunProperties",
      "dehydrateRunProperties",
      "hydrateParagraphProperties",
      "dehydrateParagraphProperties",
      "hydrateTcPr",
      "dehydrateTcPr",
      "hydrateTable",
      "dehydrateTable",
      "hydrateRow",
      "dehydrateRow",
      "hydrateDrawing",
      "dehydrateDrawing",
      "hydrateSettings",
      "dehydrateSettings",
      "hydrateStyles",
      "dehydrateStyles",
      "hydrateNumbering",
      "dehydrateNumbering",
      "hydrateSection",
      "dehydrateSection"
    ];
    function createWalker() {
      const _exts = [];
      let _hookIndex = Object.create(null);
      function rebuildIndex() {
        _hookIndex = Object.create(null);
        for (const name of HOOK_NAMES) {
          const arr = [];
          for (const ext of _exts)
            if (typeof ext[name] === "function")
              arr.push(ext);
          if (arr.length)
            _hookIndex[name] = arr;
        }
      }
      function use(...extensions) {
        let changed = !1;
        for (const ext of extensions)
          if (ext && !_exts.includes(ext)) {
            _exts.push(ext);
            changed = !0;
          }
        if (changed)
          rebuildIndex();
      }
      function applyHook(name, value) {
        if (value == null)
          return value;
        const list = _hookIndex[name];
        if (!list)
          return value;
        const reverse = name.startsWith("dehydrate");
        for (let n = 0;n < list.length; n++) {
          const r = list[reverse ? list.length - 1 - n : n][name](value);
          if (r !== void 0)
            value = r;
        }
        return value;
      }
      function walkProperties(node, phase) {
        if (!node || typeof node !== "object")
          return;
        if (Array.isArray(node)) {
          for (let i = 0;i < node.length; i++) {
            walkProperties(node[i], phase);
            if (node[i] && node[i].type === "table") {
              const r = applyHook(phase === "hydrate" ? "hydrateTable" : "dehydrateTable", node[i]);
              if (r)
                node[i] = r;
            } else if (node[i] && node[i].type === "row") {
              const r = applyHook(phase === "hydrate" ? "hydrateRow" : "dehydrateRow", node[i]);
              if (r)
                node[i] = r;
            } else if (node[i] && node[i].type === "drawing") {
              const r = applyHook(phase === "hydrate" ? "hydrateDrawing" : "dehydrateDrawing", node[i]);
              if (r)
                node[i] = r;
            }
          }
          return;
        }
        const hr = phase === "hydrate" ? "hydrateRunProperties" : "dehydrateRunProperties", hp = phase === "hydrate" ? "hydrateParagraphProperties" : "dehydrateParagraphProperties", htc = phase === "hydrate" ? "hydrateTcPr" : "dehydrateTcPr";
        if (node.type === "run" && node.rPr)
          node.rPr = applyHook(hr, node.rPr);
        if (node.type === "paragraph") {
          const hs = phase === "hydrate" ? "hydrateSection" : "dehydrateSection", section = () => {
            if (node.pPr && node.pPr.sectPr && typeof node.pPr.sectPr === "object" && node.pPr.sectPr.type !== "element")
              node.pPr.sectPr = applyHook(hs, node.pPr.sectPr);
          };
          if (phase === "dehydrate")
            section();
          if (node.pPr)
            node.pPr = applyHook(hp, node.pPr);
          if (node.pPr && node.pPr.rPr)
            node.pPr.rPr = applyHook(hr, node.pPr.rPr);
          if (phase === "hydrate")
            section();
        }
        if (node.type === "cell" && node.tcPr)
          node.tcPr = applyHook(htc, node.tcPr);
        if (node.body)
          walkProperties(node.body, phase);
        if (node.children)
          walkProperties(node.children, phase);
        if (node.rows)
          walkProperties(node.rows, phase);
        if (node.cells)
          walkProperties(node.cells, phase);
      }
      function applyExtensions(result, phase) {
        if (!_exts.length)
          return;
        if (result.document)
          walkProperties(result.document, phase);
        if (result.document && result.document.sectPr)
          result.document.sectPr = applyHook(phase === "hydrate" ? "hydrateSection" : "dehydrateSection", result.document.sectPr);
        for (const k of Object.keys(result.headers || {}))
          walkProperties(result.headers[k], phase);
        for (const k of Object.keys(result.footers || {}))
          walkProperties(result.footers[k], phase);
        for (const item of result.footnotes && result.footnotes.notes || [])
          if (item)
            walkProperties(item.body, phase);
        for (const item of result.endnotes && result.endnotes.notes || [])
          if (item)
            walkProperties(item.body, phase);
        for (const item of result.comments && result.comments.comments || [])
          if (item)
            walkProperties(item.body, phase);
        const hrName = phase === "hydrate" ? "hydrateRunProperties" : "dehydrateRunProperties", hpName = phase === "hydrate" ? "hydrateParagraphProperties" : "dehydrateParagraphProperties", part = (key, hook, visit) => {
          if (!result[key])
            return;
          if (phase === "hydrate")
            result[key] = applyHook("hydrate" + hook, result[key]);
          visit(result[key]);
          if (phase === "dehydrate")
            result[key] = applyHook("dehydrate" + hook, result[key]);
        };
        part("styles", "Styles", (styles) => {
          const dd = styles.docDefaults;
          if (dd && dd.rPr)
            dd.rPr = applyHook(hrName, dd.rPr);
          if (dd && dd.pPr)
            dd.pPr = applyHook(hpName, dd.pPr);
          for (const st of Array.isArray(styles.styles) ? styles.styles : []) {
            if (st.rPr)
              st.rPr = applyHook(hrName, st.rPr);
            if (st.pPr)
              st.pPr = applyHook(hpName, st.pPr);
            for (const t of Array.isArray(st.tblStylePr) ? st.tblStylePr : []) {
              if (t && t.rPr)
                t.rPr = applyHook(hrName, t.rPr);
              if (t && t.pPr)
                t.pPr = applyHook(hpName, t.pPr);
            }
          }
        });
        part("numbering", "Numbering", (numbering) => {
          for (const an of Array.isArray(numbering.abstractNums) ? numbering.abstractNums : [])
            for (const lvl of an && Array.isArray(an.levels) ? an.levels : []) {
              if (lvl.pPr)
                lvl.pPr = applyHook(hpName, lvl.pPr);
              if (lvl.rPr)
                lvl.rPr = applyHook(hrName, lvl.rPr);
            }
        });
        if (result.settings) {
          const name = phase === "hydrate" ? "hydrateSettings" : "dehydrateSettings";
          result.settings = applyHook(name, result.settings);
        }
      }
      return {
        use,
        applyHydrate(result) {
          applyExtensions(result, "hydrate");
        },
        applyDehydrate(result) {
          applyExtensions(result, "dehydrate");
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
    __register({ name: "docx", dependencies: ["ooxmlErrors","docxText","opcPackage","xml","opcRelationships","docxStructure","docxStyles","docxNumbering","docxSettings","docxComments","docxFootnotes","docxHeaders","docxDrawing","markupCompatibility","drawingmlChart","docxCustomXml","docxWalker","ooxmlShared"], factory: function(errors, textMod, opc, xml, relsMod, structure, stylesMod, numberingMod, settingsMod, commentsMod, footnotesMod, headersMod, drawingMod, mc, chartMod, customXmlMod, walkerMod, shared) {
    const { ParseError, ContractError } = errors, {
      NS,
      REL_TYPE,
      CT,
      encodeText,
      decodeText,
      createRidAllocator,
      lookupCT,
      trackUnmodelledParts,
      wordRootAttrs,
      WORD_EXTENSION_PREFIXES
    } = shared, _toText = textMod.toText, W_NS = NS.W, REPEATING_SECTION_ELEMENTS = Object.freeze(["w15:repeatingSection", "w15:repeatingSectionItem"]), REL_TYPE_DOC = REL_TYPE.DOC, REL_TYPE_HYPERLINK = REL_TYPE.HYPERLINK, CT_DOCUMENT = CT.DOCUMENT;
    function storyRoot(bytes, keepAlternate, keepExtensions) {
      const root = xml.parse(decodeText(bytes));
      mc.process(root, mcOptions(keepAlternate === !0, keepExtensions === !0));
      return root;
    }
    function mcOptions(keepAlternate, keepExtensions) {
      const opts = {
        keepElements: REPEATING_SECTION_ELEMENTS,
        preserveAlternateContent: keepAlternate,
        ignorablePrefixes: WORD_EXTENSION_PREFIXES
      };
      if (keepExtensions)
        opts.supportedPrefixes = WORD_EXTENSION_PREFIXES;
      return opts;
    }
    function chartRefsOf(tree) {
      const refs = new Set;
      walkDrawings(tree, (d) => {
        if (d.chartRef)
          refs.add(d.chartRef);
      });
      return refs;
    }
    function walkDrawings(doc, cb) {
      walkNodes(doc, (n) => {
        if (n && n.type === "drawing")
          cb(n);
      });
    }
    function attachDrawing(images, charts) {
      return (drawing) => {
        const img = drawing.embedRef && images[drawing.embedRef];
        if (img) {
          drawing.image = drawing.image || {};
          drawing.image.data = img.data;
          drawing.image.contentType = img.contentType;
          drawing.image.rId = drawing.embedRef;
        }
        const svg = drawing.svgRef && images[drawing.svgRef];
        if (svg) {
          drawing.image = drawing.image || {};
          drawing.image.svg = { data: svg.data, contentType: SVG_CT, rId: drawing.svgRef };
        }
        if (drawing.chartRef && charts && charts[drawing.chartRef]) {
          drawing.chart = charts[drawing.chartRef].chart;
          drawing.kind = "chart";
        }
      };
    }
    function storyDrawingTables(pkg, partName, wantChart) {
      const images = {}, charts = {};
      for (const rel of pkg.rels[partName] || []) {
        if (rel.TargetMode === "External")
          continue;
        if (rel.Type === drawingMod.REL_TYPE_IMAGE) {
          const target = relsMod.resolveTarget(partName, rel.Target), data = pkg.parts[target];
          if (!data)
            continue;
          images[rel.Id] = {
            partName: target,
            data,
            contentType: lookupCT(pkg, target) || drawingMod.sniffImageType(data)
          };
        } else if (rel.Type === chartMod.REL_TYPE_CHART) {
          if (wantChart && !wantChart.has(rel.Id))
            continue;
          const target = relsMod.resolveTarget(partName, rel.Target), data = pkg.parts[target];
          if (data)
            charts[rel.Id] = { partName: target, chart: chartMod.parse(data) };
        }
      }
      return { images, charts };
    }
    function walkNodes(node, cb) {
      if (!node)
        return;
      if (Array.isArray(node)) {
        for (const n of node)
          walkNodes(n, cb);
        return;
      }
      cb(node);
      if (node.body)
        walkNodes(node.body, cb);
      if (node.children)
        walkNodes(node.children, cb);
      if (node.rows)
        walkNodes(node.rows, cb);
      if (node.cells)
        walkNodes(node.cells, cb);
      if (node.drawing)
        walkNodes(node.drawing, cb);
      if (node.content)
        walkNodes(node.content, cb);
      if (node.txbxContent)
        walkNodes(node.txbxContent, cb);
      if (node.altContent)
        walkNodes(node.altContent, cb);
    }
    const walker = walkerMod.createWalker();
    function use(...extensions) {
      walker.use(...extensions);
      return api;
    }
    function archiveLimits(o) {
      return o ? { maxParts: o.maxParts, maxUncompressed: o.maxUncompressed, maxRatio: o.maxRatio, maxDepth: o.maxDepth } : void 0;
    }
    function read(bytes, opts) {
      const alternate = opts && opts.alternateContent !== void 0 ? opts.alternateContent : "fallback";
      if (alternate !== "fallback" && alternate !== "keep" && alternate !== "choice")
        throw new ContractError("docx/invalid-alternate-content", "docx.read: opts.alternateContent must be 'fallback', 'keep' or 'choice'", { context: { received: alternate === null ? "null" : typeof alternate === "string" ? alternate : typeof alternate } });
      const extensions = opts && opts.extensions !== void 0 ? opts.extensions : "drop";
      if (extensions !== "drop" && extensions !== "keep")
        throw new ContractError("docx/invalid-extensions", "docx.read: opts.extensions must be 'drop' or 'keep'", { context: { received: extensions === null ? "null" : typeof extensions === "string" ? extensions : typeof extensions } });
      const pkg = opc.read(bytes, archiveLimits(opts)), { value: result, unmodelledParts } = trackUnmodelledParts(pkg, (p) => {
        try {
          return structure.withChoiceDrawings(alternate === "choice", () => readPackage(p, alternate !== "fallback", extensions === "keep"));
        } catch (e) {
          throw typedPartXml(e);
        }
      });
      result.unmodelledParts = unmodelledParts;
      for (const keep of keptParts.get(result) || []) {
        const kept = keptRelationships(pkg, keep.part, keep.named, keep.written || writtenIds(result)), model = typeof keep.model === "function" ? keep.model() : keep.model;
        if (kept && model)
          model._relationships = kept;
      }
      return result;
    }
    const REFERENCE_ATTR = /\b(?:r:[A-Za-z]+|o:relid)="([^"]+)"/g, keptParts = new WeakMap;
    function idsIn(bytes) {
      const out = new Set;
      for (const m of decodeText(bytes).matchAll(REFERENCE_ATTR))
        out.add(m[1]);
      return out;
    }
    function storyWrittenIds(rels, bodies) {
      const ids = new Set((rels || []).filter((r) => r && r.Type === REL_TYPE_HYPERLINK).map((r) => r.Id));
      walkDrawings(bodies, (d) => {
        if (d.image && d.image.data && d.embedRef)
          ids.add(d.embedRef);
        if (d.svgRef && svgOf(d.image))
          ids.add(d.svgRef);
        if (d.chart && d.chartRef)
          ids.add(d.chartRef);
      });
      return ids;
    }
    function referencedIds(el, out = new Set) {
      if (!el || el.type !== "element")
        return out;
      for (const [k, v] of Object.entries(el.attrs || {}))
        if ((k === "o:relid" || /^r:[A-Za-z]+$/.test(k)) && v)
          out.add(v);
      for (const c of el.children || [])
        referencedIds(c, out);
      return out;
    }
    function writtenIds(result) {
      const ids = new Set([
        ...Object.keys(result.hyperlinks),
        ...Object.keys(result.headers),
        ...Object.keys(result.footers)
      ]);
      for (const [id, img] of Object.entries(result.images))
        if (img && img.data instanceof Uint8Array)
          ids.add(id);
      walkDrawings(result.document, (d) => {
        if (d.chart && d.chartRef)
          ids.add(d.chartRef);
      });
      return ids;
    }
    function keptRelationships(pkg, part, named, written) {
      if (!named || !named.size)
        return null;
      const own = (pkg.rels[part] || []).filter((r) => r && named.has(r.Id) && typeof r.Type === "string" && typeof r.Target === "string" && !written.has(r.Id) && (r.TargetMode === "External" || pkg.parts[relsMod.resolveTarget(part, r.Target)] !== void 0));
      if (!own.length)
        return null;
      const slice = {
        parts: {},
        rels: { [part]: own.map((r) => ({ ...r })) },
        contentTypes: { defaults: { ...pkg.contentTypes.defaults }, overrides: {} }
      }, reach = (from, rel) => {
        if (!rel || rel.TargetMode === "External" || typeof rel.Target !== "string")
          return;
        const name = relsMod.resolveTarget(from, rel.Target);
        if (name in slice.parts || !pkg.parts[name])
          return;
        slice.parts[name] = pkg.parts[name];
        const ct = pkg.contentTypes.overrides[name];
        if (ct)
          slice.contentTypes.overrides[name] = ct;
        const sub = pkg.rels[name];
        if (!sub || !sub.length)
          return;
        slice.rels[name] = sub.map((r) => ({ ...r }));
        for (const r of sub)
          reach(name, r);
      };
      for (const r of own)
        reach(part, r);
      return { part, package: slice };
    }
    function keptIdsOf(kept) {
      return kept ? kept.package.rels[kept.part].map((r) => r && r.Id).filter((id) => typeof id === "string") : [];
    }
    function storyKeptOf(opts) {
      const out = new Map, put = (written, model) => {
        const k = keptOf(model);
        if (k)
          out.set(written, k);
      };
      put("/word/comments.xml", opts.comments);
      put("/word/footnotes.xml", opts.footnotes);
      put("/word/endnotes.xml", opts.endnotes);
      put("/word/numbering.xml", opts.numbering);
      put("/word/settings.xml", opts.settings);
      Object.keys(opts.headers || {}).forEach((rId, i) => put(`/word/header${i + 1}.xml`, opts.headers[rId]));
      Object.keys(opts.footers || {}).forEach((rId, i) => put(`/word/footer${i + 1}.xml`, opts.footers[rId]));
      return out;
    }
    function keptOf(doc) {
      const k = doc && doc._relationships, p = k && typeof k === "object" ? k.package : null;
      if (typeof k?.part !== "string" || !p || typeof p !== "object" || !p.parts || typeof p.parts !== "object" || !p.rels || typeof p.rels !== "object" || !Array.isArray(p.rels[k.part]) || !p.contentTypes || typeof p.contentTypes !== "object")
        return null;
      return k;
    }
    function typedPartXml(e) {
      if (!e || e.code !== "xml/parse-error")
        return e;
      return new ParseError("docx/invalid-part-xml", `docx: failed to parse a part's XML (${e.message})`, { cause: e });
    }
    function readPackage(pkg, keepAlternate, keepExtensions) {
      const docRel = (pkg.rels["/"] || []).find((r) => r.Type === REL_TYPE_DOC || r.Type.endsWith("/officeDocument"));
      if (!docRel)
        throw new ParseError("docx/missing-officeDocument-rel", "docx: no officeDocument relationship");
      const docPart = relsMod.resolveTarget("/", docRel.Target), partBytes = pkg.parts[docPart];
      if (!partBytes)
        throw new ParseError("docx/missing-document-part", `docx: missing part ${docPart}`, { context: { partName: docPart } });
      let root;
      try {
        root = xml.parse(decodeText(partBytes));
      } catch (e) {
        throw new ParseError("docx/invalid-xml", "docx: failed to parse document XML", { context: { partName: docPart }, cause: e });
      }
      mc.process(root, mcOptions(keepAlternate, keepExtensions));
      const keeps = [{ model: null, part: docPart, named: referencedIds(root), written: null }], keepChart = (chart, partName, data) => {
        keeps.push({ model: chart, part: partName, named: idsIn(data), written: new Set, bodies: null });
      }, storyKeep = (partName, rootEl) => {
        const keep = { model: null, part: partName, named: referencedIds(rootEl), written: null, bodies: null };
        keeps.push(keep);
        return keep;
      }, bodyEl = xml.findChild(root, "w:body");
      if (!bodyEl)
        throw new ParseError("docx/missing-body", "docx: no <w:body> in document", { context: { partName: docPart } });
      const { body, sectPr, extras } = structure.parseBody(bodyEl), document = { type: "document", body };
      if (sectPr)
        document.sectPr = sectPr;
      if (extras.length)
        document._extras = extras;
      const backgroundEl = xml.findChild(root, "w:background");
      if (backgroundEl)
        document.background = parseBackground(backgroundEl);
      const docRels = pkg.rels[docPart] || [], result = {
        document,
        package: pkg,
        documentPart: docPart,
        hyperlinks: {},
        headers: {},
        footers: {},
        images: {}
      };
      keeps[0].model = document;
      keptParts.set(result, keeps);
      const storyParts = [];
      for (const rel of docRels)
        switch (rel.Type) {
          case REL_TYPE_HYPERLINK:
            result.hyperlinks[rel.Id] = {
              target: rel.Target,
              external: rel.TargetMode === "External"
            };
            break;
          case drawingMod.REL_TYPE_IMAGE: {
            const partName = relsMod.resolveTarget(docPart, rel.Target), data = pkg.parts[partName], declared = lookupCT(pkg, partName);
            result.images[rel.Id] = {
              partName,
              data,
              contentType: declared || drawingMod.sniffImageType(data)
            };
            break;
          }
          case chartMod.REL_TYPE_CHART: {
            if (keepAlternate)
              break;
            const partName = relsMod.resolveTarget(docPart, rel.Target), data = pkg.parts[partName];
            if (data) {
              result.charts = result.charts || {};
              result.charts[rel.Id] = {
                partName,
                chart: chartMod.parse(data)
              };
              keepChart(result.charts[rel.Id].chart, partName, data);
            }
            break;
          }
          case customXmlMod.REL_TYPE_CUSTOM_XML: {
            const itemPart = relsMod.resolveTarget(docPart, rel.Target), itemBytes = pkg.parts[itemPart];
            if (!itemBytes)
              break;
            result.customXml = result.customXml || [];
            const entry = {
              id: result.customXml.length + 1,
              xml: decodeText(itemBytes),
              partName: itemPart
            }, propsRel = (pkg.rels[itemPart] || []).find((r) => r.Type === customXmlMod.REL_TYPE_CUSTOM_XML_PROPS);
            if (propsRel) {
              const propsPart = relsMod.resolveTarget(itemPart, propsRel.Target), propsBytes = pkg.parts[propsPart];
              if (propsBytes) {
                const props = customXmlMod.parseProps(propsBytes);
                entry.storeItemID = props.storeItemID;
                if (props.schemaRefs)
                  entry.schemaRefs = props.schemaRefs;
                entry.propsPart = propsPart;
              }
            }
            result.customXml.push(entry);
            break;
          }
          case stylesMod.REL_TYPE_STYLES: {
            const partName = relsMod.resolveTarget(docPart, rel.Target), b = pkg.parts[partName];
            if (b)
              result.styles = stylesMod.parse(b);
            break;
          }
          case numberingMod.REL_TYPE_NUMBERING: {
            const partName = relsMod.resolveTarget(docPart, rel.Target), b = pkg.parts[partName];
            if (b) {
              result.numbering = numberingMod.parse(b);
              keeps.push({ model: result.numbering, part: partName, named: idsIn(b), written: new Set, bodies: null });
            }
            break;
          }
          case settingsMod.REL_TYPE_SETTINGS: {
            const partName = relsMod.resolveTarget(docPart, rel.Target), b = pkg.parts[partName];
            if (b) {
              result.settings = settingsMod.parse(b);
              keeps.push({ model: () => result.settings, part: partName, named: idsIn(b), written: new Set, bodies: null });
            }
            break;
          }
          case commentsMod.REL_TYPE_COMMENTS: {
            const partName = relsMod.resolveTarget(docPart, rel.Target), b = pkg.parts[partName];
            if (b) {
              const rootEl = storyRoot(b, keepAlternate, keepExtensions);
              result.comments = commentsMod.parse(rootEl);
              storyParts.push([partName, bodiesOf(result.comments.comments)]);
              Object.assign(storyKeep(partName, rootEl), { model: result.comments, bodies: bodiesOf(result.comments.comments) });
            }
            break;
          }
          case footnotesMod.REL_TYPE_FOOTNOTES: {
            const partName = relsMod.resolveTarget(docPart, rel.Target), b = pkg.parts[partName];
            if (b) {
              const rootEl = storyRoot(b, keepAlternate, keepExtensions);
              result.footnotes = footnotesMod.parseFootnotes(rootEl);
              storyParts.push([partName, bodiesOf(result.footnotes.notes)]);
              Object.assign(storyKeep(partName, rootEl), { model: result.footnotes, bodies: bodiesOf(result.footnotes.notes) });
            }
            break;
          }
          case footnotesMod.REL_TYPE_ENDNOTES: {
            const partName = relsMod.resolveTarget(docPart, rel.Target), b = pkg.parts[partName];
            if (b) {
              const rootEl = storyRoot(b, keepAlternate, keepExtensions);
              result.endnotes = footnotesMod.parseEndnotes(rootEl);
              storyParts.push([partName, bodiesOf(result.endnotes.notes)]);
              Object.assign(storyKeep(partName, rootEl), { model: result.endnotes, bodies: bodiesOf(result.endnotes.notes) });
            }
            break;
          }
          case headersMod.REL_TYPE_HEADER: {
            const partName = relsMod.resolveTarget(docPart, rel.Target), b = pkg.parts[partName];
            if (b) {
              const rootEl = storyRoot(b, keepAlternate, keepExtensions);
              result.headers[rel.Id] = headersMod.parse(rootEl, "header");
              storyParts.push([partName, [result.headers[rel.Id].body]]);
              Object.assign(storyKeep(partName, rootEl), { model: result.headers[rel.Id], bodies: [result.headers[rel.Id].body] });
            }
            break;
          }
          case headersMod.REL_TYPE_FOOTER: {
            const partName = relsMod.resolveTarget(docPart, rel.Target), b = pkg.parts[partName];
            if (b) {
              const rootEl = storyRoot(b, keepAlternate, keepExtensions);
              result.footers[rel.Id] = headersMod.parse(rootEl, "footer");
              storyParts.push([partName, [result.footers[rel.Id].body]]);
              Object.assign(storyKeep(partName, rootEl), { model: result.footers[rel.Id], bodies: [result.footers[rel.Id].body] });
            }
            break;
          }
        }
      attachTargets(document.body, result.hyperlinks);
      for (const [partName, bodies] of storyParts)
        attachTargets(bodies, hyperlinkTable(pkg.rels[partName]));
      if (keepAlternate) {
        const wanted = chartRefsOf(document);
        for (const rel of docRels) {
          if (rel.Type !== chartMod.REL_TYPE_CHART || rel.TargetMode === "External" || !wanted.has(rel.Id))
            continue;
          const partName = relsMod.resolveTarget(docPart, rel.Target), data = pkg.parts[partName];
          if (!data)
            continue;
          result.charts = result.charts || {};
          result.charts[rel.Id] = { partName, chart: chartMod.parse(data) };
          keepChart(result.charts[rel.Id].chart, partName, data);
        }
      }
      walkDrawings(document, attachDrawing(result.images, result.charts));
      for (const [partName, bodies] of storyParts) {
        const own = storyDrawingTables(pkg, partName, keepAlternate ? chartRefsOf(bodies) : null);
        for (const ch of Object.values(own.charts))
          keepChart(ch.chart, ch.partName, pkg.parts[ch.partName]);
        walkDrawings(bodies, attachDrawing(own.images, own.charts));
      }
      for (const keep of keeps)
        if (keep.bodies)
          keep.written = storyWrittenIds(pkg.rels[keep.part], keep.bodies);
      walker.applyHydrate(result);
      return result;
    }
    function write(doc, opts) {
      if (doc == null || typeof doc !== "object" || Array.isArray(doc))
        throw new ContractError("docx/invalid-document", "docx.write: document must be an object with a body", { context: { received: doc === null ? "null" : typeof doc } });
      if (doc.body !== void 0 && !Array.isArray(doc.body))
        throw new ContractError("docx/invalid-body", "docx.write: document.body must be an array", { context: { path: "body", received: typeof doc.body } });
      opts = opts || {};
      if (opts.preserveInput !== void 0 && typeof opts.preserveInput !== "boolean")
        throw new ContractError("docx/invalid-preserve-input", "docx.write: opts.preserveInput must be true or false", { context: { received: opts.preserveInput === null ? "null" : typeof opts.preserveInput } });
      const cleanup = cleanupSpec(opts.cleanup);
      if (opts.preserveInput || cleanup.size) {
        const { carry: envelope, ...rest } = opts, copy = structuredClone({ doc, opts: rest });
        doc = copy.doc;
        opts = envelope === void 0 ? copy.opts : { ...copy.opts, carry: envelope };
      }
      if (cleanup.has("emptyProperties")) {
        dropEmptyProperties(doc);
        for (const key of CLEANUP_STORIES)
          if (opts[key])
            dropEmptyProperties(opts[key]);
      }
      const carry = carrySpec(opts);
      checkReferences(doc, opts);
      let { settings, styles: stylesPart, numbering: numberingPart } = opts;
      if (walker.hasExtensions) {
        const parts = {
          document: doc,
          headers: opts.headers || {},
          footers: opts.footers || {},
          footnotes: opts.footnotes,
          endnotes: opts.endnotes,
          comments: opts.comments,
          styles: opts.styles,
          numbering: opts.numbering,
          settings: opts.settings
        };
        walker.applyDehydrate(parts);
        settings = parts.settings;
        stylesPart = parts.styles;
        numberingPart = parts.numbering;
      }
      assignDocIds(doc, opts);
      const pkg = opc.empty(), kept = keptOf(doc), keptIds = keptIdsOf(kept), storyKept = storyKeptOf(opts), hyperlinks = opts.hyperlinks || derivedHyperlinks(doc), collected = collectImages(doc, opts.images, keptIds), chartCollected = collectCharts(doc, keptIds), story = collectStoryDrawings(opts, collected, chartCollected.length, storyKept);
      for (const ext of collected.exts)
        pkg.contentTypes.defaults[ext] = extToContentType(ext);
      for (const img of collected.list.concat(story.media))
        opc.setPart(pkg, img.partName, img.data, img.contentType);
      const chartSources = carry ? new Map(chartOwners(carry, chartCollected.concat(story.charts)).map(([src, written]) => [written, src])) : null;
      for (const ch of chartCollected.concat(story.charts)) {
        opc.setPart(pkg, ch.partName, unchangedChartBytes(carry, chartSources, ch) || chartMod.bytesOf(ch.chart), chartMod.CT_CHART);
        pkg.contentTypes.overrides[ch.partName] = chartMod.CT_CHART;
      }
      const docMedia = new Set(collected.list.map((i) => i.rId).concat(chartCollected.map((c) => c.rId))), docLinks = new Set(Object.keys(hyperlinks)), writerIds = new Set([
        ...docMedia,
        ...docLinks,
        ...Object.keys(opts.headers || {}),
        ...Object.keys(opts.footers || {})
      ]);
      if (carry) {
        for (const id of carry.docIds)
          if (!writerIds.has(id))
            docLinks.add(id);
      }
      for (const id of keptIds)
        if (!writerIds.has(id))
          docLinks.add(id);
      const documentXml = drawingMod.withRelationships({ links: docLinks, media: docMedia }, () => structure.withParaIds(() => renderDocument(doc)));
      opc.setPart(pkg, "/word/document.xml", encodeText(documentXml), CT_DOCUMENT);
      const docRels = [], _ridAlloc = createRidAllocator({ existing: docRels });
      if (carry)
        for (const id of carry.docIds)
          _ridAlloc.register(id);
      for (const id of keptIds)
        _ridAlloc.register(id);
      for (const id of Object.keys(opts.headers || {}))
        _ridAlloc.register(id);
      for (const id of Object.keys(opts.footers || {}))
        _ridAlloc.register(id);
      for (const id of Object.keys(hyperlinks))
        _ridAlloc.register(id);
      for (const img of collected.list)
        _ridAlloc.register(img.rId);
      for (const ch of chartCollected)
        _ridAlloc.register(ch.rId);
      (opts.customXml || []).forEach((_, i) => _ridAlloc.register(`rIdCx${i + 1}`));
      const claimRid = (preferred) => _ridAlloc.claim(preferred);
      function attachPart(opts_part, partName, rel) {
        opc.setPart(pkg, partName, opts_part.bytes, opts_part.contentType);
        docRels.push(rel);
      }
      function attachStoryRels(partName, bodies) {
        const rels = hyperlinkRels(derivedHyperlinks(bodies)).concat(story.rels.get(partName) || []);
        if (rels.length)
          opc.setRels(pkg, partName, rels);
      }
      function inStory(partName, bodies, fn) {
        const links = new Set(Object.keys(derivedHyperlinks(bodies))), media = new Set((story.rels.get(partName) || []).map((r) => r.Id)), carried = carry ? carry.rels.get(partName) || [] : [];
        for (const { rel } of carried)
          if (!links.has(rel.Id) && !media.has(rel.Id))
            links.add(rel.Id);
        for (const id of keptIdsOf(storyKept.get(partName)))
          if (!media.has(id))
            links.add(id);
        return drawingMod.withRelationships({ links, media }, () => structure.withParaIds(fn));
      }
      if (stylesPart)
        attachPart({
          bytes: stylesMod.bytesOf(stylesPart),
          contentType: stylesMod.CT_STYLES
        }, "/word/styles.xml", {
          Id: claimRid(),
          Type: stylesMod.REL_TYPE_STYLES,
          Target: "styles.xml"
        });
      if (numberingPart)
        attachPart({
          bytes: numberingMod.bytesOf(numberingPart),
          contentType: numberingMod.CT_NUMBERING
        }, "/word/numbering.xml", {
          Id: claimRid(),
          Type: numberingMod.REL_TYPE_NUMBERING,
          Target: "numbering.xml"
        });
      if (settings)
        attachPart({
          bytes: settingsMod.bytesOf(settings),
          contentType: settingsMod.CT_SETTINGS
        }, "/word/settings.xml", {
          Id: claimRid(),
          Type: settingsMod.REL_TYPE_SETTINGS,
          Target: "settings.xml"
        });
      if (opts.comments) {
        attachPart({
          bytes: inStory("/word/comments.xml", bodiesOf(opts.comments.comments), () => commentsMod.bytesOf(opts.comments)),
          contentType: commentsMod.CT_COMMENTS
        }, "/word/comments.xml", {
          Id: claimRid(),
          Type: commentsMod.REL_TYPE_COMMENTS,
          Target: "comments.xml"
        });
        attachStoryRels("/word/comments.xml", bodiesOf(opts.comments.comments));
      }
      if (opts.footnotes) {
        attachPart({
          bytes: inStory("/word/footnotes.xml", bodiesOf(opts.footnotes.notes), () => footnotesMod.footnotesBytes(opts.footnotes)),
          contentType: footnotesMod.CT_FOOTNOTES
        }, "/word/footnotes.xml", {
          Id: claimRid(),
          Type: footnotesMod.REL_TYPE_FOOTNOTES,
          Target: "footnotes.xml"
        });
        attachStoryRels("/word/footnotes.xml", bodiesOf(opts.footnotes.notes));
      }
      if (opts.endnotes) {
        attachPart({
          bytes: inStory("/word/endnotes.xml", bodiesOf(opts.endnotes.notes), () => footnotesMod.endnotesBytes(opts.endnotes)),
          contentType: footnotesMod.CT_ENDNOTES
        }, "/word/endnotes.xml", {
          Id: claimRid(),
          Type: footnotesMod.REL_TYPE_ENDNOTES,
          Target: "endnotes.xml"
        });
        attachStoryRels("/word/endnotes.xml", bodiesOf(opts.endnotes.notes));
      }
      if (opts.headers) {
        let i = 1;
        for (const rId of Object.keys(opts.headers)) {
          const target = `header${i}.xml`;
          attachPart({
            bytes: inStory(`/word/${target}`, [opts.headers[rId].body], () => headersMod.bytesOf(opts.headers[rId])),
            contentType: headersMod.CT_HEADER
          }, `/word/${target}`, { Id: rId, Type: headersMod.REL_TYPE_HEADER, Target: target });
          attachStoryRels(`/word/${target}`, [opts.headers[rId].body]);
          i++;
        }
      }
      if (opts.footers) {
        let i = 1;
        for (const rId of Object.keys(opts.footers)) {
          const target = `footer${i}.xml`;
          attachPart({
            bytes: inStory(`/word/${target}`, [opts.footers[rId].body], () => headersMod.bytesOf(opts.footers[rId])),
            contentType: headersMod.CT_FOOTER
          }, `/word/${target}`, { Id: rId, Type: headersMod.REL_TYPE_FOOTER, Target: target });
          attachStoryRels(`/word/${target}`, [opts.footers[rId].body]);
          i++;
        }
      }
      docRels.push(...hyperlinkRels(hyperlinks));
      for (const img of collected.list)
        docRels.push({
          Id: img.rId,
          Type: drawingMod.REL_TYPE_IMAGE,
          Target: "media/" + img.fileName
        });
      for (const ch of chartCollected)
        docRels.push({
          Id: ch.rId,
          Type: chartMod.REL_TYPE_CHART,
          Target: "charts/" + ch.fileName
        });
      (opts.customXml || []).forEach((item, i) => {
        const idx = i + 1, itemPath = `/customXml/item${idx}.xml`, propsPath = `/customXml/itemProps${idx}.xml`, storeItemID = item.storeItemID || customXmlMod.generateStoreItemID();
        opc.setPart(pkg, itemPath, encodeText(item.xml || "<root/>"), "application/xml");
        opc.setPart(pkg, propsPath, customXmlMod.propsBytes({
          storeItemID,
          schemaRefs: item.schemaRefs
        }), customXmlMod.CT_CUSTOM_XML_PROPS);
        pkg.contentTypes.overrides[propsPath] = customXmlMod.CT_CUSTOM_XML_PROPS;
        pkg.contentTypes.defaults.xml = "application/xml";
        opc.setRels(pkg, itemPath, [{
          Id: "rId1",
          Type: customXmlMod.REL_TYPE_CUSTOM_XML_PROPS,
          Target: `itemProps${idx}.xml`
        }]);
        docRels.push({
          Id: `rIdCx${idx}`,
          Type: customXmlMod.REL_TYPE_CUSTOM_XML,
          Target: `../customXml/item${idx}.xml`
        });
        item.storeItemID = storeItemID;
      });
      if (docRels.length)
        opc.setRels(pkg, "/word/document.xml", docRels);
      if (carry) {
        applyCarry(pkg, carry);
        repairReferences(pkg, carry, chartOwners(carry, chartCollected.concat(story.charts)));
      } else {
        opc.setRels(pkg, "/", [{
          Id: "rId1",
          Type: REL_TYPE_DOC,
          Target: "word/document.xml"
        }]);
        if (kept)
          repairReferences(pkg, { pkg: kept.package, owners: [] }, [[kept.part, "/word/document.xml"]]);
        for (const [written, k] of storyKept)
          repairReferences(pkg, { pkg: k.package, owners: [] }, [[k.part, written]]);
        for (const ch of chartCollected.concat(story.charts)) {
          const k = keptOf(ch.chart);
          if (k)
            repairReferences(pkg, { pkg: k.package, owners: [] }, [[k.part, ch.partName]]);
        }
      }
      return opc.write(pkg);
    }
    function carrySpec(opts) {
      if (opts.carry === void 0)
        return null;
      const c = opts.carry, p = c && typeof c === "object" ? c.package : null;
      if (!p || typeof p !== "object" || !p.parts || typeof p.parts !== "object" || !p.rels || typeof p.rels !== "object" || !p.contentTypes || typeof p.contentTypes !== "object" || !Array.isArray(c.unmodelledParts))
        throw new ContractError("docx/invalid-carry", "docx.write: opts.carry must be the { package, unmodelledParts } envelope read() returns", { context: { received: c === null ? "null" : typeof c } });
      const listed = [];
      for (const u of c.unmodelledParts) {
        const name = u && u.partName;
        if (typeof name === "string" && p.parts[name] && !listed.includes(name))
          listed.push(name);
      }
      const owners = [["/", "/"]], docRel = (p.rels["/"] || []).find((r) => r && typeof r.Type === "string" && (r.Type === REL_TYPE_DOC || r.Type.endsWith("/officeDocument")));
      if (docRel) {
        const srcDoc = relsMod.resolveTarget("/", docRel.Target), internal = (p.rels[srcDoc] || []).filter((r) => r && r.TargetMode !== "External" && typeof r.Target === "string"), target = (r) => relsMod.resolveTarget(srcDoc, r.Target);
        owners.push([srcDoc, "/word/document.xml"]);
        const story = (keys, type, prefix) => keys.forEach((k, i) => {
          const r = internal.find((x) => x.Id === k && x.Type === type);
          if (r)
            owners.push([target(r), `/word/${prefix}${i + 1}.xml`]);
        });
        story(Object.keys(opts.headers || {}), headersMod.REL_TYPE_HEADER, "header");
        story(Object.keys(opts.footers || {}), headersMod.REL_TYPE_FOOTER, "footer");
        for (const [given, type, written] of [
          [opts.styles, stylesMod.REL_TYPE_STYLES, "/word/styles.xml"],
          [opts.numbering, numberingMod.REL_TYPE_NUMBERING, "/word/numbering.xml"],
          [opts.settings, settingsMod.REL_TYPE_SETTINGS, "/word/settings.xml"],
          [opts.comments, commentsMod.REL_TYPE_COMMENTS, "/word/comments.xml"],
          [opts.footnotes, footnotesMod.REL_TYPE_FOOTNOTES, "/word/footnotes.xml"],
          [opts.endnotes, footnotesMod.REL_TYPE_ENDNOTES, "/word/endnotes.xml"]
        ]) {
          const r = given ? internal.find((x) => x.Type === type) : null;
          if (r)
            owners.push([target(r), written]);
        }
      }
      const rels = new Map, add = (written, entry) => {
        if (!rels.has(written))
          rels.set(written, []);
        rels.get(written).push(entry);
      };
      for (const [src, written] of owners)
        for (const r of p.rels[src] || []) {
          if (!r || typeof r.Target !== "string" || typeof r.Type !== "string")
            continue;
          if (r.TargetMode === "External") {
            if (r.Type !== REL_TYPE_HYPERLINK)
              add(written, { rel: r, target: null });
            continue;
          }
          const t = relsMod.resolveTarget(src, r.Target);
          if (listed.includes(t))
            add(written, { rel: r, target: t });
        }
      const docIds = (rels.get("/word/document.xml") || []).map((x) => x.rel.Id), srcDoc = docRel ? relsMod.resolveTarget("/", docRel.Target) : null;
      return { pkg: p, listed, rels, docIds, owners, srcDoc };
    }
    function applyCarry(pkg, spec) {
      const src = spec.pkg, taken = new Set(Object.keys(pkg.parts).concat(spec.listed)), names = new Map;
      for (const name of spec.listed)
        names.set(name, pkg.parts[name] ? freePartName(name, taken) : name);
      for (const name of spec.listed) {
        const fin = names.get(name);
        pkg.parts[fin] = src.parts[name];
        carryContentType(pkg, src, name, fin);
      }
      const pointTo = (owner, rel, target) => {
        if (target === null)
          return rel.Target;
        const fin = names.get(target) || target;
        return relsMod.resolveTarget(owner, rel.Target) === fin ? rel.Target : relativeTarget(owner, fin);
      }, carriedRel = (rel, Id, Target) => rel.TargetMode === "External" ? { Id, Type: rel.Type, Target, TargetMode: "External" } : { Id, Type: rel.Type, Target };
      for (const [owner, list] of spec.rels) {
        if (owner === "/")
          continue;
        const table = (pkg.rels[owner] || []).slice(), ids = createRidAllocator({ existing: table.concat(list.map((x) => x.rel)) });
        for (const { rel, target } of list) {
          const Id = table.some((x) => x.Id === rel.Id) ? ids.next() : rel.Id;
          table.push(carriedRel(rel, Id, pointTo(owner, rel, target)));
        }
        opc.setRels(pkg, owner, table);
      }
      for (const name of spec.listed) {
        const own = src.rels[name];
        if (!own || !own.length)
          continue;
        const fin = names.get(name);
        opc.setRels(pkg, fin, own.map((r) => {
          if (!r || r.TargetMode === "External" || typeof r.Target !== "string")
            return { ...r };
          const t = relsMod.resolveTarget(name, r.Target);
          return names.has(t) ? { ...r, Target: pointTo(fin, r, t) } : { ...r };
        }));
      }
      const rootCarried = spec.rels.get("/") || [], rootIds = createRidAllocator({ existing: rootCarried.map((x) => x.rel.Id) });
      opc.setRels(pkg, "/", [
        { Id: rootIds.claim("rId1"), Type: REL_TYPE_DOC, Target: "word/document.xml" },
        ...rootCarried.map(({ rel, target }) => carriedRel(rel, rel.Id, pointTo("/", rel, target)))
      ]);
    }
    function carryContentType(pkg, src, name, fin) {
      const srcDefaults = src.contentTypes.defaults || {}, srcOverrides = src.contentTypes.overrides || {};
      if (srcOverrides[name]) {
        pkg.contentTypes.overrides[fin] = srcOverrides[name];
        return;
      }
      const ext = extensionOf(name), key = Object.keys(srcDefaults).find((k) => k.toLowerCase() === ext);
      if (!ext || !key)
        return;
      const mine = Object.keys(pkg.contentTypes.defaults).find((k) => k.toLowerCase() === ext);
      if (!mine)
        pkg.contentTypes.defaults[key] = srcDefaults[key];
      else if (pkg.contentTypes.defaults[mine] !== srcDefaults[key])
        pkg.contentTypes.overrides[fin] = srcDefaults[key];
    }
    function unchangedChartBytes(spec, sources, ch) {
      const srcName = sources && sources.get(ch.partName), data = srcName && spec.pkg.parts[srcName];
      if (!data)
        return null;
      let read;
      try {
        read = chartMod.parse(data);
      } catch {
        return null;
      }
      const { _relationships, ...model } = ch.chart;
      return sameModel(read, model) ? data : null;
    }
    function sameModel(a, b) {
      if (Object.is(a, b))
        return !0;
      if (!a || !b || typeof a !== "object" || typeof b !== "object")
        return !1;
      if (Array.isArray(a) !== Array.isArray(b))
        return !1;
      const ka = Object.keys(a), kb = Object.keys(b);
      if (ka.length !== kb.length)
        return !1;
      for (const k of ka)
        if (!Object.prototype.hasOwnProperty.call(b, k) || !sameModel(a[k], b[k]))
          return !1;
      return !0;
    }
    function chartOwners(spec, charts) {
      const out = [];
      for (const ch of charts) {
        const written = ch.owner || "/word/document.xml", pair = written === "/word/document.xml" ? [spec.srcDoc, written] : spec.owners.find(([, w]) => w === written), srcOwner = pair && pair[0];
        if (!srcOwner)
          continue;
        const r = (spec.pkg.rels[srcOwner] || []).find((x) => x && x.Id === ch.rId && x.Type === chartMod.REL_TYPE_CHART && x.TargetMode !== "External" && typeof x.Target === "string");
        if (r)
          out.push([relsMod.resolveTarget(srcOwner, r.Target), ch.partName]);
      }
      return out;
    }
    function repairReferences(pkg, spec, more) {
      const src = spec.pkg, copied = new Map, same = (a, b) => a && b && a.length === b.length && a.every((x, i) => x === b[i]);
      function copyPart(name) {
        if (copied.has(name))
          return copied.get(name);
        const data = src.parts[name];
        if (!data)
          return null;
        const exists = pkg.parts[name], fin = exists && !same(exists, data) ? freePartName(name, new Set(Object.keys(pkg.parts))) : name;
        copied.set(name, fin);
        if (pkg.parts[fin])
          return fin;
        pkg.parts[fin] = data;
        carryContentType(pkg, src, name, fin);
        const own = src.rels[name] || [];
        if (own.length) {
          const table = [];
          for (const r of own) {
            if (!r || r.TargetMode === "External" || typeof r.Target !== "string") {
              table.push({ ...r });
              continue;
            }
            const t = copyPart(relsMod.resolveTarget(name, r.Target));
            if (t)
              table.push({ ...r, Target: relativeTarget(fin, t) });
          }
          opc.setRels(pkg, fin, table);
        }
        return fin;
      }
      for (const [srcPart, written] of spec.owners.concat(more)) {
        if (written === "/" || !pkg.parts[written] || !/\.xml$/i.test(written))
          continue;
        const ids = new Set;
        for (const m of decodeText(pkg.parts[written]).matchAll(REFERENCE_ATTR))
          ids.add(m[1]);
        const table = (pkg.rels[written] || []).slice(), have = new Set(table.map((x) => x.Id));
        let changed = !1;
        for (const id of ids) {
          if (have.has(id))
            continue;
          const rel = (src.rels[srcPart] || []).find((x) => x && x.Id === id);
          if (!rel || typeof rel.Target !== "string" || typeof rel.Type !== "string")
            continue;
          if (rel.TargetMode === "External")
            table.push({ Id: id, Type: rel.Type, Target: rel.Target, TargetMode: "External" });
          else {
            const fin = copyPart(relsMod.resolveTarget(srcPart, rel.Target));
            if (!fin)
              continue;
            table.push({ Id: id, Type: rel.Type, Target: relativeTarget(written, fin) });
          }
          have.add(id);
          changed = !0;
        }
        if (changed)
          opc.setRels(pkg, written, table);
      }
    }
    function freePartName(name, taken) {
      const slash = name.lastIndexOf("/"), dot = name.lastIndexOf("."), cut = dot > slash ? dot : name.length;
      let n = 1;
      while (taken.has(`${name.slice(0, cut)}_${n}${name.slice(cut)}`))
        n++;
      const out = `${name.slice(0, cut)}_${n}${name.slice(cut)}`;
      taken.add(out);
      return out;
    }
    function extensionOf(name) {
      const file = name.slice(name.lastIndexOf("/") + 1), dot = file.lastIndexOf(".");
      return dot > 0 ? file.slice(dot + 1).toLowerCase() : "";
    }
    function relativeTarget(fromPart, toPart) {
      const from = fromPart === "/" ? [] : fromPart.slice(1).split("/").slice(0, -1), to = toPart.slice(1).split("/");
      let i = 0;
      while (i < from.length && i < to.length - 1 && from[i] === to[i])
        i++;
      return from.slice(i).map(() => "..").concat(to.slice(i)).join("/");
    }
    function extToContentType(ext) {
      switch (ext) {
        case "png":
          return "image/png";
        case "jpg":
          return "image/jpeg";
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
    const SVG_CT = "image/svg+xml";
    function svgOf(img) {
      const svg = img && img.svg;
      if (!svg || !(svg.data instanceof Uint8Array))
        return null;
      return { data: svg.data, contentType: svg.contentType || SVG_CT, fileName: svg.fileName };
    }
    function collectImages(doc, extra, reserved) {
      const list = [], byData = new Map, exts = new Set, _ridAlloc = createRidAllocator({
        prefix: "rImg",
        existing: extra ? Object.keys(extra) : []
      });
      for (const id of reserved || [])
        _ridAlloc.register(id);
      let nextIdx = 1;
      function nextRId() {
        return _ridAlloc.next();
      }
      if (extra)
        for (const id of Object.keys(extra)) {
          const e = extra[id];
          if (!e || !(e.data instanceof Uint8Array))
            continue;
          const ct = e.contentType || drawingMod.sniffImageType(e.data), ext = drawingMod.extensionFor(ct), fileName = e.fileName || `image${nextIdx++}.${ext}`, partName = "/word/media/" + fileName, item = {
            rId: id,
            data: e.data,
            contentType: ct,
            fileName,
            partName
          };
          list.push(item);
          byData.set(e.data, item);
          exts.add(ext);
        }
      function itemFor(img, preferredId) {
        let item = byData.get(img.data);
        if (!item) {
          const ct = img.contentType || drawingMod.sniffImageType(img.data), ext = drawingMod.extensionFor(ct), fileName = img.fileName || `image${nextIdx++}.${ext}`, rId = preferredId || nextRId();
          if (preferredId)
            _ridAlloc.register(preferredId);
          item = {
            rId,
            data: img.data,
            contentType: ct,
            fileName,
            partName: "/word/media/" + fileName
          };
          list.push(item);
          byData.set(img.data, item);
          exts.add(ext);
        }
        return item;
      }
      walkDrawings(doc, (drawing) => {
        const img = drawing.image;
        if (!img)
          return;
        if (img.data)
          drawing.embedRef = itemFor(img, img.rId || drawing.embedRef).rId;
        const svg = svgOf(img);
        if (svg)
          drawing.svgRef = img.svg.rId = itemFor(svg, img.svg.rId || drawing.svgRef).rId;
      });
      function addMedia(img) {
        const ct = img.contentType || drawingMod.sniffImageType(img.data), ext = drawingMod.extensionFor(ct), fileName = img.fileName || `image${nextIdx++}.${ext}`, item = {
          data: img.data,
          contentType: ct,
          fileName,
          partName: "/word/media/" + fileName
        };
        byData.set(img.data, item);
        exts.add(ext);
        return item;
      }
      return { list, exts, byData, addMedia };
    }
    function collectStoryDrawings(opts, images, chartCount, kept) {
      const rels = new Map, media = [], charts = [];
      let chartIdx = chartCount;
      function visit(partName, bodies) {
        const alloc = createRidAllocator({
          existing: Object.keys(derivedHyperlinks(bodies))
        });
        for (const id of keptIdsOf(kept && kept.get(partName)))
          alloc.register(id);
        const ridOf = new Map, out = [];
        function ridFor(img, preferredId) {
          let item = images.byData.get(img.data);
          if (!item) {
            item = images.addMedia(img);
            media.push(item);
          }
          let rId = ridOf.get(item);
          if (!rId) {
            rId = alloc.claim(preferredId);
            ridOf.set(item, rId);
            out.push({
              Id: rId,
              Type: drawingMod.REL_TYPE_IMAGE,
              Target: "media/" + item.fileName
            });
          }
          return rId;
        }
        walkDrawings(bodies, (drawing) => {
          const img = drawing.image;
          if (img && img.data)
            drawing.embedRef = ridFor(img, img.rId || drawing.embedRef);
          const svg = svgOf(img);
          if (svg)
            drawing.svgRef = img.svg.rId = ridFor(svg, img.svg.rId || drawing.svgRef);
          if (drawing.chart) {
            const fileName = `chart${++chartIdx}.xml`, rId = alloc.claim(drawing.chartRef);
            charts.push({
              fileName,
              partName: "/word/charts/" + fileName,
              chart: drawing.chart,
              rId,
              owner: partName
            });
            out.push({
              Id: rId,
              Type: chartMod.REL_TYPE_CHART,
              Target: "charts/" + fileName
            });
            drawing.chartRef = rId;
            drawing.kind = "chart";
          }
        });
        if (out.length)
          rels.set(partName, out);
      }
      if (opts.comments)
        visit("/word/comments.xml", bodiesOf(opts.comments.comments));
      if (opts.footnotes)
        visit("/word/footnotes.xml", bodiesOf(opts.footnotes.notes));
      if (opts.endnotes)
        visit("/word/endnotes.xml", bodiesOf(opts.endnotes.notes));
      Object.keys(opts.headers || {}).forEach((rId, i) => visit(`/word/header${i + 1}.xml`, [opts.headers[rId].body]));
      Object.keys(opts.footers || {}).forEach((rId, i) => visit(`/word/footer${i + 1}.xml`, [opts.footers[rId].body]));
      return { rels, media, charts };
    }
    function collectCharts(doc, reserved) {
      const out = [], _ridAlloc = createRidAllocator({ prefix: "rChart" });
      for (const id of reserved || [])
        _ridAlloc.register(id);
      let nextIdx = 1;
      function nextRId() {
        return _ridAlloc.next();
      }
      walkDrawings(doc, (drawing) => {
        if (!drawing.chart)
          return;
        if (drawing.chartRef)
          _ridAlloc.register(drawing.chartRef);
        const rId = drawing.chartRef || nextRId(), fileName = `chart${nextIdx++}.xml`, partName = "/word/charts/" + fileName;
        out.push({ rId, fileName, partName, chart: drawing.chart });
        drawing.chartRef = rId;
        drawing.kind = "chart";
      });
      return out;
    }
    const CLEANUPS = new Set(["emptyProperties"]), CLEANUP_STORIES = ["headers", "footers", "footnotes", "endnotes", "comments"];
    function cleanupSpec(value) {
      if (value === void 0)
        return new Set;
      if (!(Array.isArray(value) && value.every((n) => CLEANUPS.has(n)) && new Set(value).size === value.length))
        throw new ContractError("docx/invalid-cleanup", "docx.write: opts.cleanup must be an array of distinct names among: " + [...CLEANUPS].join(", "), { context: { received: Array.isArray(value) ? value.map(String) : value === null ? "null" : typeof value } });
      return new Set(value);
    }
    function dropEmptyProperties(node) {
      if (!node || typeof node !== "object" || ArrayBuffer.isView(node))
        return;
      if (Array.isArray(node)) {
        for (const n of node)
          dropEmptyProperties(n);
        return;
      }
      for (const key of Object.keys(node)) {
        const v = node[key];
        dropEmptyProperties(v);
        if ((key === "rPr" || key === "pPr") && v && typeof v === "object" && !Array.isArray(v) && Object.keys(v).every((k) => v[k] === void 0))
          delete node[key];
      }
    }
    function derivedHyperlinks(doc) {
      const out = {};
      walkRuns(doc, (node) => {
        if (node && node.type === "hyperlink" && node.rId && node.target)
          out[node.rId] = {
            target: node.target,
            external: node.external !== !1
          };
      });
      return out;
    }
    function checkReferences(doc, opts) {
      const dangling = opts.danglingNumbering === void 0 ? "throw" : opts.danglingNumbering;
      if (dangling !== "throw" && dangling !== "keep")
        throw new ContractError("docx/invalid-dangling-numbering", "docx.write: opts.danglingNumbering must be 'throw' or 'keep'", { context: { received: dangling === null ? "null" : typeof dangling } });
      let lostTarget = null, unresolved = null, danglingNumId = null, unknownNumId = null;
      const declaredNums = opts.numbering ? new Set((opts.numbering.nums || []).map((n) => Number(n && n.numId))) : null;
      function checkNumPr(numPr, where) {
        if (dangling === "keep")
          return;
        if (!numPr || numPr.numId == null || Number(numPr.numId) === 0)
          return;
        if (!declaredNums) {
          if (danglingNumId === null)
            danglingNumId = { numId: numPr.numId, ...where };
        } else if (unknownNumId === null && !declaredNums.has(Number(numPr.numId)))
          unknownNumId = { numId: numPr.numId, ...where };
      }
      const visitor = (table, where) => (node) => {
        if (!node || typeof node !== "object")
          return;
        if (node.type === "hyperlink") {
          if (lostTarget === null && typeof node.target === "string" && node.target !== "" && !node.rId && !node.anchor)
            lostTarget = node.target;
          if (unresolved === null && typeof node.rId === "string" && node.rId !== "" && !hasOwn(table, node.rId))
            unresolved = { rId: node.rId, ...where };
        }
        if (node.type === "paragraph" && node.pPr)
          checkNumPr(node.pPr.numPr, where);
      };
      walkRuns(doc.body, visitor(opts.hyperlinks || derivedHyperlinks(doc), { story: "document" }));
      for (const part of storyPartsOf(opts))
        walkRuns(part.bodies, visitor(derivedHyperlinks(part.bodies), part.where));
      if (opts.styles) {
        const dd = opts.styles.docDefaults;
        if (dd && dd.pPr)
          checkNumPr(dd.pPr.numPr, { story: "styles" });
        for (const s of opts.styles.styles || [])
          if (s && s.pPr)
            checkNumPr(s.pPr.numPr, { story: "styles", styleId: s.styleId });
      }
      if (lostTarget !== null)
        throw new ContractError("docx/hyperlink-missing-rid", "docx.write: a hyperlink with a target needs an rId (pass one, e.g. hyperlink(text, target, { rId }))", { context: { target: lostTarget } });
      if (unresolved !== null)
        throw new ContractError("docx/hyperlink-unresolved-rid", `docx.write: hyperlink rId "${unresolved.rId}" has no relationship in the ${unresolved.story} part (give the node a target, or pass the relationship in opts.hyperlinks for the document body)`, { context: unresolved });
      if (danglingNumId !== null)
        throw new ContractError("docx/numbering-missing", `docx.write: the ${danglingNumId.story} part references a list (pPr.numPr) but opts.numbering is missing`, { context: danglingNumId });
      if (unknownNumId !== null)
        throw new ContractError("docx/numbering-unknown-num", `docx.write: numId ${unknownNumId.numId} (${unknownNumId.story} part) is not declared in opts.numbering.nums`, { context: unknownNumId });
    }
    function walkRuns(node, cb) {
      if (!node)
        return;
      if (Array.isArray(node)) {
        for (const n of node)
          walkRuns(n, cb);
        return;
      }
      cb(node);
      if (node.body)
        walkRuns(node.body, cb);
      if (node.children)
        walkRuns(node.children, cb);
      if (node.rows)
        walkRuns(node.rows, cb);
      if (node.cells)
        walkRuns(node.cells, cb);
    }
    function hasOwn(obj, key) {
      return Object.prototype.hasOwnProperty.call(obj, key);
    }
    function assignDocIds(doc, opts) {
      const drawings = [], collect = (drawing) => {
        drawings.push(drawing);
      };
      walkDrawings(doc, collect);
      for (const items of [
        opts.comments && opts.comments.comments,
        opts.footnotes && opts.footnotes.notes,
        opts.endnotes && opts.endnotes.notes
      ])
        walkDrawings(bodiesOf(items), collect);
      for (const story of [opts.headers || {}, opts.footers || {}])
        for (const rId of Object.keys(story))
          walkDrawings([story[rId] && story[rId].body], collect);
      const used = new Set, pending = [];
      for (const drawing of drawings) {
        const id = drawing.docId;
        if (Number.isInteger(id) && id >= 0 && !used.has(id))
          used.add(id);
        else
          pending.push(drawing);
      }
      let next = 1;
      for (const drawing of pending) {
        while (used.has(next))
          next++;
        drawing.docId = next;
        used.add(next);
      }
    }
    function bodiesOf(items) {
      return (items || []).map((item) => item && item.body);
    }
    function hyperlinkTable(rels) {
      const out = {};
      for (const rel of rels || []) {
        if (rel.Type !== REL_TYPE_HYPERLINK)
          continue;
        out[rel.Id] = {
          target: rel.Target,
          external: rel.TargetMode === "External"
        };
      }
      return out;
    }
    function attachTargets(body, relsById) {
      walkRuns(body, (node) => {
        if (node.type === "hyperlink" && node.rId && hasOwn(relsById, node.rId)) {
          const rel = relsById[node.rId];
          node.target = rel.target;
          node.external = rel.external;
        }
      });
    }
    function hyperlinkRels(table) {
      return Object.keys(table).map((id) => {
        const h = table[id], rel = { Id: id, Type: REL_TYPE_HYPERLINK, Target: h.target };
        if (h.external)
          rel.TargetMode = "External";
        return rel;
      });
    }
    function storyPartsOf(opts) {
      const out = [];
      for (const [story, parts] of [["header", opts.headers], ["footer", opts.footers]]) {
        if (!parts)
          continue;
        for (const key of Object.keys(parts))
          out.push({
            where: { story, key },
            bodies: parts[key] ? [parts[key].body] : []
          });
      }
      for (const story of ["footnotes", "endnotes"])
        if (opts[story])
          out.push({ where: { story }, bodies: bodiesOf(opts[story].notes) });
      if (opts.comments)
        out.push({
          where: { story: "comments" },
          bodies: bodiesOf(opts.comments.comments)
        });
      return out;
    }
    function renderDocument(doc) {
      const bodyChildren = structure.renderBodyChildren(doc), body = xml.el("w:body", {}, bodyChildren), children = doc.background ? [renderBackground(doc.background), body] : [body], root = xml.el("w:document", wordRootAttrs(children), children);
      return xml.serialize(root);
    }
    const BACKGROUND_ATTRS = [
      ["color", "w:color"],
      ["themeColor", "w:themeColor"],
      ["themeTint", "w:themeTint"],
      ["themeShade", "w:themeShade"]
    ];
    function parseBackground(el) {
      const out = {};
      for (const [k, a] of BACKGROUND_ATTRS)
        if (el.attrs[a] != null)
          out[k] = el.attrs[a];
      const kids = el.children.filter((c) => c.type === "element");
      if (kids.length)
        out._extras = kids;
      return out;
    }
    function renderBackground(bg) {
      const attrs = {};
      for (const [k, a] of BACKGROUND_ATTRS)
        if (bg[k] != null)
          attrs[a] = String(bg[k]);
      return xml.el("w:background", attrs, bg._extras ? bg._extras.slice() : []);
    }
    function fromText(paragraphs) {
      return {
        type: "document",
        body: paragraphs.map((text) => paragraph(text))
      };
    }
    function paragraph(text, opts = {}) {
      const node = {
        type: "paragraph",
        children: [run(text, opts.rPr)]
      };
      if (opts.pPr)
        node.pPr = opts.pPr;
      return node;
    }
    function run(text, rPr) {
      const node = { type: "run", children: [{ type: "text", value: text }] };
      if (rPr)
        node.rPr = rPr;
      return node;
    }
    function hyperlink(text, target, opts = {}) {
      return {
        type: "hyperlink",
        rId: opts.rId,
        target,
        external: opts.external !== !1,
        children: [run(text, opts.rPr || { color: "0563C1", underline: "single" })]
      };
    }
    function tableFromRows(rows) {
      return {
        type: "table",
        rows: rows.map((row) => ({
          type: "row",
          cells: row.map((cellText) => ({
            type: "cell",
            children: [paragraph(cellText)]
          }))
        }))
      };
    }
    function imageRun(data, opts = {}) {
      return {
        type: "run",
        children: [drawingMod.image(data, opts)]
      };
    }
    function chartRun(spec, opts = {}) {
      return {
        type: "run",
        children: [drawingMod.chart(spec, opts)]
      };
    }
    function shapeRun(geom, opts = {}) {
      return {
        type: "run",
        children: [drawingMod.shape(geom, opts)]
      };
    }
    function fieldSimple(instr, displayText, rPr) {
      return {
        type: "fldSimple",
        instr,
        dirty: !0,
        children: displayText != null ? [run(displayText, rPr)] : []
      };
    }
    function fieldComplex(instr, displayText, rPr) {
      return [
        { type: "run", children: [{ type: "fldChar", kind: "begin", dirty: !0 }] },
        { type: "run", children: [{ type: "instrText", value: " " + instr + " " }] },
        { type: "run", children: [{ type: "fldChar", kind: "separate" }] },
        run(displayText != null ? String(displayText) : "", rPr),
        { type: "run", children: [{ type: "fldChar", kind: "end" }] }
      ];
    }
    function boundText(props, defaultText, rPr) {
      return {
        type: "sdt",
        properties: { kind: "text", ...props || {} },
        children: [run(defaultText, rPr)]
      };
    }
    function blockSdt(props, children) {
      return {
        type: "blockSdt",
        properties: { ...props || {} },
        children: children || []
      };
    }
    function repeatingSectionItem(children, props) {
      return {
        type: "blockSdt",
        properties: { kind: "repeatingSectionItem", ...props || {} },
        children: children || []
      };
    }
    function repeatingSection(props, items) {
      return {
        type: "blockSdt",
        properties: { kind: "repeatingSection", ...props || {} },
        children: items || []
      };
    }
    function walkSdts(node, cb) {
      if (!node)
        return;
      if (Array.isArray(node)) {
        for (const n of node)
          walkSdts(n, cb);
        return;
      }
      if (node.type === "sdt" || node.type === "blockSdt")
        cb(node);
      if (node.body)
        walkSdts(node.body, cb);
      if (node.children)
        walkSdts(node.children, cb);
      if (node.rows)
        walkSdts(node.rows, cb);
      if (node.cells)
        walkSdts(node.cells, cb);
    }
    function cloneNode(node) {
      if (node == null)
        return node;
      if (Array.isArray(node))
        return node.map(cloneNode);
      if (typeof node !== "object")
        return node;
      if (node.type === "element" || node.type === "text")
        return node;
      const out = {};
      for (const k of Object.keys(node))
        out[k] = cloneNode(node[k]);
      return out;
    }
    function substituteByTag(node, data) {
      walkSdts(node, (sdt) => {
        const tag = sdt.properties && sdt.properties.tag;
        if (!tag || !(tag in data))
          return;
        if (sdt.properties.kind === "repeatingSection" || sdt.properties.kind === "repeatingSectionItem")
          return;
        const value = data[tag];
        if (sdt.type === "blockSdt")
          sdt.children = [paragraph(String(value))];
        else
          sdt.children = [run(String(value))];
      });
      return node;
    }
    function expandRepeating(section, data) {
      if (!section || !Array.isArray(section.children) || !section.children.length)
        return section;
      const itemTemplate = section.children[0];
      section.children = (data || []).map((record) => {
        const cloned = cloneNode(itemTemplate);
        substituteByTag(cloned, record);
        return cloned;
      });
      return section;
    }
    function bookmark(name, id, children) {
      return [
        { type: "bookmarkStart", id, name },
        ...children || [],
        { type: "bookmarkEnd", id }
      ];
    }
    function listParagraph(text, numId, ilvl = 0, opts = {}) {
      const pPr = { ...opts.pPr || {}, numPr: { numId, ilvl } };
      return paragraph(text, { ...opts, pPr });
    }
    const api = {
      read,
      write,
      use,
      fromText,
      paragraph,
      run,
      hyperlink,
      tableFromRows,
      bookmark,
      listParagraph,
      imageRun,
      chartRun,
      shapeRun,
      fieldSimple,
      fieldComplex,
      boundText,
      blockSdt,
      repeatingSection,
      repeatingSectionItem,
      walkSdts,
      cloneNode,
      substituteByTag,
      expandRepeating,
      toText: _toText,
      W_NS,
      REL_TYPE_DOC,
      REL_TYPE_HYPERLINK,
      CT_DOCUMENT
    };
    return api;
  } });

    const __core = __resolve("docx");
    return __core;
    }
};
