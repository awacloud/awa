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
        else if (c.type === "hyperlink")
          for (const r of c.children)
            out.push(textOfRun(r));
        else if (c.type === "ins")
          for (const r of c.children)
            out.push(textOfRun(r));
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
    function valOf(el) {
      return el ? el.attrs["w:val"] : void 0;
    }
    function elVal(name, val) {
      return xml.el(name, { "w:val": String(val) });
    }
    const RPR_KNOWN = new Set([
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
    ]);
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
          case "w:u":
            out.underline = valOf(c) || "single";
            break;
          case "w:color":
            out.color = valOf(c);
            break;
          case "w:sz":
            out.size = Number(valOf(c));
            break;
          case "w:rFonts":
            out.font = c.attrs["w:ascii"] || c.attrs["w:hAnsi"] || c.attrs["w:cs"];
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
        out._extras = extras;
      return out;
    }
    function renderRunProperties(rPr) {
      if (!rPr)
        return null;
      const children = [];
      if (rPr.rStyle != null)
        children.push(elVal("w:rStyle", rPr.rStyle));
      if (rPr.font != null)
        children.push(xml.el("w:rFonts", {
          "w:ascii": rPr.font,
          "w:hAnsi": rPr.font,
          "w:cs": rPr.font
        }));
      const bold = writeToggle("w:b", rPr.bold);
      if (bold)
        children.push(bold);
      const italic = writeToggle("w:i", rPr.italic);
      if (italic)
        children.push(italic);
      const strike = writeToggle("w:strike", rPr.strike);
      if (strike)
        children.push(strike);
      if (rPr.color != null)
        children.push(elVal("w:color", rPr.color));
      if (rPr.size != null)
        children.push(elVal("w:sz", rPr.size));
      if (rPr.underline != null)
        children.push(elVal("w:u", rPr.underline));
      if (rPr.highlight != null)
        children.push(elVal("w:highlight", rPr.highlight));
      if (rPr.vertAlign != null)
        children.push(elVal("w:vertAlign", rPr.vertAlign));
      if (rPr._extras)
        for (const ex of rPr._extras)
          children.push(ex);
      if (!children.length)
        return null;
      return xml.el("w:rPr", {}, children);
    }
    const PPR_KNOWN = new Set([
      "w:jc",
      "w:ind",
      "w:spacing",
      "w:pStyle",
      "w:numPr",
      "w:rPr"
    ]);
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
        out._extras = extras;
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
        children.push(xml.el("w:ind", a));
      }
      if (pPr.align != null)
        children.push(elVal("w:jc", pPr.align));
      if (pPr.rPr) {
        const rPrEl = renderRunProperties(pPr.rPr);
        if (rPrEl)
          children.push(rPrEl);
      }
      if (pPr._extras)
        for (const ex of pPr._extras)
          children.push(ex);
      if (!children.length)
        return null;
      return xml.el("w:pPr", {}, children);
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
    const AFTER_CELL_MARGINS = new Set(["w:tblLook", "w:tblCaption", "w:tblDescription", "w:tblPrChange"]);
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
            out.borders = parseTableBorders(c);
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
        out._extras = extras;
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
      const extras = tblPr._extras || [], isAfter = (ex) => ex.type === "element" && AFTER_CELL_MARGINS.has(ex.name);
      for (const ex of extras)
        if (!isAfter(ex))
          children.push(ex);
      const marginsEl = renderCellMargins(tblPr.cellMargins);
      if (marginsEl)
        children.push(marginsEl);
      for (const ex of extras)
        if (isAfter(ex))
          children.push(ex);
      if (!children.length)
        return null;
      return xml.el("w:tblPr", {}, children);
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
      elVal
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
    __register({ name: "docxDrawing", dependencies: ["xml","drawingmlShape","ooxmlShared"], factory: function(xml, shapeMod, shared) {
    const { NS, REL_TYPE } = shared, WP_NS = NS.WP, A_NS = NS.A, PIC_NS = NS.PIC, R_NS = NS.R, REL_TYPE_IMAGE = REL_TYPE.IMAGE;
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
        if (docPr.attrs.name)
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
        }
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
    function renderDrawing(drawing) {
      const inner = drawing.mode === "anchor" ? renderAnchorWrapper(drawing) : renderInlineWrapper(drawing);
      return xml.el("w:drawing", {}, [inner]);
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
      return xml.el("wp:anchor", a, children);
    }
    function renderDocPr(d) {
      const a = {
        id: String(d.docId != null ? d.docId : 1),
        name: d.docName || "Picture"
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
            name: d.picName || d.docName || "Picture"
          }),
          xml.el("pic:cNvPicPr", {})
        ]),
        xml.el("pic:blipFill", {}, [
          xml.el("a:blip", d.embedRef ? { "r:embed": d.embedRef } : d.linkRef ? { "r:link": d.linkRef } : {}),
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
    __register({ name: "docxStructure", dependencies: ["xml","docxProperties","docxDrawing","ooxmlMath"], factory: function(xml, props, drawingMod, mathMod) {
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
            const kind = c.attrs["w:type"];
            out.push(kind ? { type: "break", kind } : { type: "break" });
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
            out.push({ type: "footnoteReference", id: c.attrs["w:id"] });
            break;
          case "w:endnoteReference":
            out.push({ type: "endnoteReference", id: c.attrs["w:id"] });
            break;
          case "w:drawing":
            out.push(drawingMod.parseDrawing(c));
            break;
          case "w:fldChar": {
            const f = {
              type: "fldChar",
              kind: c.attrs["w:fldCharType"]
            };
            if (c.attrs["w:dirty"])
              f.dirty = c.attrs["w:dirty"] === "1";
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
          case "break":
            out.push(ch.kind ? xml.el("w:br", { "w:type": ch.kind }) : xml.el("w:br", {}));
            break;
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
            out.push(xml.el("w:footnoteReference", { "w:id": String(ch.id) }));
            break;
          case "endnoteReference":
            out.push(xml.el("w:endnoteReference", { "w:id": String(ch.id) }));
            break;
          case "drawing":
            out.push(drawingMod.renderDrawing(ch));
            break;
          case "fldChar": {
            const a = { "w:fldCharType": ch.kind };
            if (ch.dirty)
              a["w:dirty"] = "1";
            out.push(xml.el("w:fldChar", a));
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
      children.push(...renderRunChildren(run.children));
      return xml.el("w:r", {}, children);
    }
    function parseHyperlink(hEl) {
      const out = { type: "hyperlink", children: [] };
      if (hEl.attrs["r:id"])
        out.rId = hEl.attrs["r:id"];
      if (hEl.attrs["w:anchor"])
        out.anchor = hEl.attrs["w:anchor"];
      for (const c of hEl.children) {
        if (c.type !== "element")
          continue;
        if (c.name === "w:r")
          out.children.push(parseRun(c));
      }
      return out;
    }
    function renderHyperlink(h) {
      const attrs = {};
      if (h.rId)
        attrs["r:id"] = h.rId;
      if (h.anchor)
        attrs["w:anchor"] = h.anchor;
      return xml.el("w:hyperlink", attrs, (h.children || []).map(renderRun));
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
            out.showingPlcHdr = !0;
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
      if (props.showingPlcHdr)
        children.push(xml.el("w:showingPlcHdr", {}));
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
        children.push(xml.el("w:text", {}));
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
      if (sdtContentEl)
        if (isBlock)
          for (const c of sdtContentEl.children) {
            if (c.type !== "element")
              continue;
            if (c.name === "w:p")
              out.children.push(parseParagraph(c));
            else if (c.name === "w:tbl")
              out.children.push(parseTable(c));
            else if (c.name === "w:sdt")
              out.children.push(parseSdt(c, !0));
          }
        else
          for (const c of sdtContentEl.children) {
            if (c.type !== "element")
              continue;
            if (c.name === "w:r")
              out.children.push(parseRun(c));
            else if (c.name === "w:hyperlink")
              out.children.push(parseHyperlink(c));
            else if (c.name === "w:sdt")
              out.children.push(parseSdt(c, !1));
          }
      return out;
    }
    function renderSdt(sdt) {
      const sdtChildren = [], propsEl = renderSdtProperties(sdt.properties);
      if (propsEl)
        sdtChildren.push(propsEl);
      const isBlock = sdt.type === "blockSdt", contentChildren = [];
      for (const c of sdt.children || [])
        if (isBlock) {
          if (c.type === "paragraph")
            contentChildren.push(renderParagraph(c));
          else if (c.type === "table")
            contentChildren.push(renderTable(c));
          else if (c.type === "blockSdt")
            contentChildren.push(renderSdt(c));
        } else if (c.type === "run")
          contentChildren.push(renderRun(c));
        else if (c.type === "hyperlink")
          contentChildren.push(renderHyperlink(c));
        else if (c.type === "sdt")
          contentChildren.push(renderSdt(c));
      sdtChildren.push(xml.el("w:sdtContent", {}, contentChildren));
      return xml.el("w:sdt", {}, sdtChildren);
    }
    function parseParagraph(pEl) {
      const pPrEl = xml.findChild(pEl, "w:pPr"), pPr = props.parseParagraphProperties(pPrEl), children = [], extras = [];
      for (const c of pEl.children) {
        if (c.type !== "element")
          continue;
        if (c.name === "w:pPr")
          continue;
        switch (c.name) {
          case "w:r":
            children.push(parseRun(c));
            break;
          case "w:hyperlink":
            children.push(parseHyperlink(c));
            break;
          case "w:bookmarkStart":
            children.push({
              type: "bookmarkStart",
              id: c.attrs["w:id"],
              name: c.attrs["w:name"]
            });
            break;
          case "w:bookmarkEnd":
            children.push({ type: "bookmarkEnd", id: c.attrs["w:id"] });
            break;
          case "w:commentRangeStart":
            children.push({ type: "commentRangeStart", id: c.attrs["w:id"] });
            break;
          case "w:commentRangeEnd":
            children.push({ type: "commentRangeEnd", id: c.attrs["w:id"] });
            break;
          case "w:ins":
            children.push(parseRevision(c, "ins"));
            break;
          case "w:del":
            children.push(parseRevision(c, "del"));
            break;
          case "w:sdt":
            children.push(parseSdt(c, !1));
            break;
          case "m:oMath":
            children.push(mathMod.parseOMath(c));
            break;
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
            children.push(f);
            break;
          }
          default:
            extras.push(c);
        }
      }
      const out = { type: "paragraph", children };
      if (pPr)
        out.pPr = pPr;
      if (extras.length)
        out._extras = extras;
      return out;
    }
    function parseRevision(el, kind) {
      const out = {
        type: kind,
        id: el.attrs["w:id"],
        children: []
      };
      if (el.attrs["w:author"])
        out.author = el.attrs["w:author"];
      if (el.attrs["w:date"])
        out.date = el.attrs["w:date"];
      for (const c of el.children) {
        if (c.type !== "element")
          continue;
        if (c.name === "w:r")
          out.children.push(parseRun(c));
      }
      return out;
    }
    function renderRevision(rev) {
      const attrs = {};
      if (rev.id != null)
        attrs["w:id"] = String(rev.id);
      if (rev.author)
        attrs["w:author"] = rev.author;
      if (rev.date)
        attrs["w:date"] = rev.date;
      const tag = rev.type === "del" ? "w:del" : "w:ins";
      return xml.el(tag, attrs, (rev.children || []).map(renderRun));
    }
    function renderParagraph(p) {
      const children = [], pPrEl = props.renderParagraphProperties(p.pPr);
      if (pPrEl)
        children.push(pPrEl);
      for (const c of p.children || [])
        switch (c.type) {
          case "run":
            children.push(renderRun(c));
            break;
          case "hyperlink":
            children.push(renderHyperlink(c));
            break;
          case "ins":
          case "del":
            children.push(renderRevision(c));
            break;
          case "sdt":
            children.push(renderSdt(c));
            break;
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
          case "bookmarkStart": {
            const a = { "w:id": String(c.id) };
            if (c.name)
              a["w:name"] = c.name;
            children.push(xml.el("w:bookmarkStart", a));
            break;
          }
          case "bookmarkEnd":
            children.push(xml.el("w:bookmarkEnd", { "w:id": String(c.id) }));
            break;
          case "commentRangeStart":
            children.push(xml.el("w:commentRangeStart", { "w:id": String(c.id) }));
            break;
          case "commentRangeEnd":
            children.push(xml.el("w:commentRangeEnd", { "w:id": String(c.id) }));
            break;
        }
      if (p._extras)
        for (const ex of p._extras)
          children.push(ex);
      return xml.el("w:p", {}, children);
    }
    function parseCell(tcEl) {
      const tcPrEl = xml.findChild(tcEl, "w:tcPr"), tcPr = tcPrEl ? parseCellProperties(tcPrEl) : void 0, children = [], extras = [];
      for (const c of tcEl.children) {
        if (c.type !== "element")
          continue;
        if (c.name === "w:tcPr")
          continue;
        if (c.name === "w:p")
          children.push(parseParagraph(c));
        else if (c.name === "w:tbl")
          children.push(parseTable(c));
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
    function renderCell(c) {
      const children = [], tcPrEl = renderCellProperties(c.tcPr);
      if (tcPrEl)
        children.push(tcPrEl);
      for (const ch of c.children || [])
        if (ch.type === "paragraph")
          children.push(renderParagraph(ch));
        else if (ch.type === "table")
          children.push(renderTable(ch));
      if (c._extras)
        for (const ex of c._extras)
          children.push(ex);
      if (!children.some((n) => n.name === "w:p"))
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
      return xml.el("w:tcPr", {}, children);
    }
    function parseRow(trEl) {
      const cells = [], extras = [];
      for (const c of trEl.children) {
        if (c.type !== "element")
          continue;
        if (c.name === "w:tc")
          cells.push(parseCell(c));
        else if (c.name === "w:trPr")
          extras.push(c);
        else
          extras.push(c);
      }
      const out = { type: "row", cells };
      if (extras.length)
        out._extras = extras;
      return out;
    }
    function renderRow(row) {
      const children = [];
      for (const c of row.cells || [])
        children.push(renderCell(c));
      if (row._extras)
        for (const ex of row._extras)
          children.push(ex);
      return xml.el("w:tr", {}, children);
    }
    function parseTable(tblEl) {
      const rows = [], extras = [], out = { type: "table", rows };
      for (const c of tblEl.children) {
        if (c.type !== "element")
          continue;
        if (c.name === "w:tr")
          rows.push(parseRow(c));
        else if (c.name === "w:tblPr") {
          const tp = props.parseTableProperties(c);
          if (tp !== void 0)
            out.tblPr = tp;
          else
            extras.push(c);
        } else
          extras.push(c);
      }
      if (extras.length)
        out._extras = extras;
      return out;
    }
    function renderTable(t) {
      const children = [], tblPrEl = props.renderTableProperties(t.tblPr);
      if (tblPrEl)
        children.push(tblPrEl);
      if (t._extras)
        for (const ex of t._extras)
          children.push(ex);
      for (const r of t.rows || [])
        children.push(renderRow(r));
      return xml.el("w:tbl", {}, children);
    }
    const SECT_KNOWN = new Set([
      "w:pgSz",
      "w:pgMar",
      "w:type",
      "w:headerReference",
      "w:footerReference",
      "w:titlePg"
    ]);
    function parseSection(sectPrEl) {
      const out = {}, extras = [];
      for (const c of sectPrEl.children) {
        if (c.type !== "element")
          continue;
        switch (c.name) {
          case "w:pgSz":
            out.pageSize = {};
            if (c.attrs["w:w"])
              out.pageSize.w = Number(c.attrs["w:w"]);
            if (c.attrs["w:h"])
              out.pageSize.h = Number(c.attrs["w:h"]);
            if (c.attrs["w:orient"])
              out.pageSize.orient = c.attrs["w:orient"];
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
                out.pageMargin[k] = Number(a);
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
      return Object.keys(out).length ? out : void 0;
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
      if (!children.length)
        return null;
      return xml.el("w:sectPr", {}, children);
    }
    function parseBody(bodyEl) {
      const body = [];
      let sectPr;
      const extras = [];
      for (const c of bodyEl.children) {
        if (c.type !== "element")
          continue;
        switch (c.name) {
          case "w:p":
            body.push(parseParagraph(c));
            break;
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
          default:
            extras.push(c);
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
          children.push(mathMod.renderOMathPara(node));
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
    const { ParseError } = errors, { NS, REL_TYPE, CT, encodeText, decodeText } = shared, W_NS = NS.W, REL_TYPE_STYLES = REL_TYPE.STYLES, CT_STYLES = CT.STYLES_W;
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
      return xml.el("w:style", attrs, children);
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
      return xml.serialize(xml.el("w:styles", { "xmlns:w": W_NS }, children));
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
    const { ParseError } = errors, { NS, REL_TYPE, CT, encodeText, decodeText } = shared, W_NS = NS.W, REL_TYPE_NUMBERING = REL_TYPE.NUMBERING, CT_NUMBERING = CT.NUMBERING;
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
      return xml.el("w:lvl", { "w:ilvl": String(lvl.ilvl) }, children);
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
      return xml.el("w:abstractNum", { "w:abstractNumId": String(a.abstractNumId) }, children);
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
      return xml.serialize(xml.el("w:numbering", { "xmlns:w": W_NS }, children));
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
    const { ParseError, RenderError } = errors, { NS, REL_TYPE, CT, encodeText, decodeText } = shared, W_NS = NS.W, REL_TYPE_SETTINGS = REL_TYPE.SETTINGS, CT_SETTINGS = CT.SETTINGS, SETTINGS_PREFIXES = Object.freeze({
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
      if (obj.evenAndOddHeaders === !0)
        children.push(xml.el("w:evenAndOddHeaders", {}));
      if (obj.updateFields === !0)
        children.push(xml.el("w:updateFields", {}));
      if (obj.trackChanges === !0)
        children.push(xml.el("w:trackChanges", {}));
      if (obj.zoom) {
        const a = {};
        if (obj.zoom.val)
          a["w:val"] = obj.zoom.val;
        if (obj.zoom.percent != null)
          a["w:percent"] = String(obj.zoom.percent);
        children.push(xml.el("w:zoom", a));
      }
      if (obj._extras)
        for (const ex of obj._extras)
          children.push(ex);
      return xml.serialize(xml.el("w:settings", rootAttrs(children), children));
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
      if (cEl.attrs["w:author"])
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
      if (c.author)
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
      "hydrateSettings",
      "dehydrateSettings"
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
        for (let i = 0;i < list.length; i++) {
          const r = list[i][name](value);
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
            }
          }
          return;
        }
        const hr = phase === "hydrate" ? "hydrateRunProperties" : "dehydrateRunProperties", hp = phase === "hydrate" ? "hydrateParagraphProperties" : "dehydrateParagraphProperties", htc = phase === "hydrate" ? "hydrateTcPr" : "dehydrateTcPr";
        if (node.type === "run" && node.rPr)
          node.rPr = applyHook(hr, node.rPr);
        if (node.type === "paragraph") {
          if (node.pPr)
            node.pPr = applyHook(hp, node.pPr);
          if (node.pPr && node.pPr.rPr)
            node.pPr.rPr = applyHook(hr, node.pPr.rPr);
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
        for (const k of Object.keys(result.headers || {}))
          walkProperties(result.headers[k], phase);
        for (const k of Object.keys(result.footers || {}))
          walkProperties(result.footers[k], phase);
        if (result.styles && Array.isArray(result.styles.styles)) {
          const hrName = phase === "hydrate" ? "hydrateRunProperties" : "dehydrateRunProperties", hpName = phase === "hydrate" ? "hydrateParagraphProperties" : "dehydrateParagraphProperties";
          for (const st of result.styles.styles) {
            if (st.rPr)
              st.rPr = applyHook(hrName, st.rPr);
            if (st.pPr)
              st.pPr = applyHook(hpName, st.pPr);
          }
        }
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
      wordRootAttrs
    } = shared, _toText = textMod.toText, W_NS = NS.W, REPEATING_SECTION_ELEMENTS = Object.freeze(["w15:repeatingSection", "w15:repeatingSectionItem"]), REL_TYPE_DOC = REL_TYPE.DOC, REL_TYPE_HYPERLINK = REL_TYPE.HYPERLINK, CT_DOCUMENT = CT.DOCUMENT;
    function storyRoot(bytes) {
      const root = xml.parse(decodeText(bytes));
      mc.process(root, { keepElements: REPEATING_SECTION_ELEMENTS });
      return root;
    }
    function walkDrawings(doc, cb) {
      walkNodes(doc, (n) => {
        if (n && n.type === "drawing")
          cb(n);
      });
    }
    function walkAllDrawings(result, cb) {
      walkDrawings(result.document || result, cb);
      for (const k of Object.keys(result.headers || {})) {
        const h = result.headers[k];
        if (h && h.body)
          walkDrawings(h.body, cb);
      }
      for (const k of Object.keys(result.footers || {})) {
        const f = result.footers[k];
        if (f && f.body)
          walkDrawings(f.body, cb);
      }
      for (const fn of result.footnotes && result.footnotes.notes || [])
        if (fn && fn.body)
          walkDrawings(fn.body, cb);
      for (const en of result.endnotes && result.endnotes.notes || [])
        if (en && en.body)
          walkDrawings(en.body, cb);
      for (const c of result.comments && result.comments.comments || [])
        if (c && c.body)
          walkDrawings(c.body, cb);
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
      mc.process(root, { keepElements: REPEATING_SECTION_ELEMENTS });
      const bodyEl = xml.findChild(root, "w:body");
      if (!bodyEl)
        throw new ParseError("docx/missing-body", "docx: no <w:body> in document", { context: { partName: docPart } });
      const { body, sectPr } = structure.parseBody(bodyEl), document = { type: "document", body };
      if (sectPr)
        document.sectPr = sectPr;
      const docRels = pkg.rels[docPart] || [], result = {
        document,
        package: pkg,
        documentPart: docPart,
        hyperlinks: {},
        headers: {},
        footers: {},
        images: {}
      }, storyParts = [];
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
            const partName = relsMod.resolveTarget(docPart, rel.Target), data = pkg.parts[partName];
            if (data) {
              result.charts = result.charts || {};
              result.charts[rel.Id] = {
                partName,
                chart: chartMod.parse(data)
              };
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
            if (b)
              result.numbering = numberingMod.parse(b);
            break;
          }
          case settingsMod.REL_TYPE_SETTINGS: {
            const partName = relsMod.resolveTarget(docPart, rel.Target), b = pkg.parts[partName];
            if (b)
              result.settings = settingsMod.parse(b);
            break;
          }
          case commentsMod.REL_TYPE_COMMENTS: {
            const partName = relsMod.resolveTarget(docPart, rel.Target), b = pkg.parts[partName];
            if (b) {
              result.comments = commentsMod.parse(storyRoot(b));
              storyParts.push([partName, bodiesOf(result.comments.comments)]);
            }
            break;
          }
          case footnotesMod.REL_TYPE_FOOTNOTES: {
            const partName = relsMod.resolveTarget(docPart, rel.Target), b = pkg.parts[partName];
            if (b) {
              result.footnotes = footnotesMod.parseFootnotes(storyRoot(b));
              storyParts.push([partName, bodiesOf(result.footnotes.notes)]);
            }
            break;
          }
          case footnotesMod.REL_TYPE_ENDNOTES: {
            const partName = relsMod.resolveTarget(docPart, rel.Target), b = pkg.parts[partName];
            if (b) {
              result.endnotes = footnotesMod.parseEndnotes(storyRoot(b));
              storyParts.push([partName, bodiesOf(result.endnotes.notes)]);
            }
            break;
          }
          case headersMod.REL_TYPE_HEADER: {
            const partName = relsMod.resolveTarget(docPart, rel.Target), b = pkg.parts[partName];
            if (b) {
              result.headers[rel.Id] = headersMod.parse(storyRoot(b), "header");
              storyParts.push([partName, [result.headers[rel.Id].body]]);
            }
            break;
          }
          case headersMod.REL_TYPE_FOOTER: {
            const partName = relsMod.resolveTarget(docPart, rel.Target), b = pkg.parts[partName];
            if (b) {
              result.footers[rel.Id] = headersMod.parse(storyRoot(b), "footer");
              storyParts.push([partName, [result.footers[rel.Id].body]]);
            }
            break;
          }
        }
      attachTargets(document.body, result.hyperlinks);
      for (const [partName, bodies] of storyParts)
        attachTargets(bodies, hyperlinkTable(pkg.rels[partName]));
      walkAllDrawings(result, (drawing) => {
        if (drawing.embedRef) {
          const img = result.images[drawing.embedRef];
          if (img) {
            drawing.image = drawing.image || {};
            drawing.image.data = img.data;
            drawing.image.contentType = img.contentType;
            drawing.image.rId = drawing.embedRef;
          }
        }
        if (drawing.chartRef && result.charts && result.charts[drawing.chartRef]) {
          drawing.chart = result.charts[drawing.chartRef].chart;
          drawing.kind = "chart";
        }
      });
      walker.applyHydrate(result);
      return result;
    }
    function write(doc, opts) {
      if (doc == null || typeof doc !== "object" || Array.isArray(doc))
        throw new ContractError("docx/invalid-document", "docx.write: document must be an object with a body", { context: { received: doc === null ? "null" : typeof doc } });
      if (doc.body !== void 0 && !Array.isArray(doc.body))
        throw new ContractError("docx/invalid-body", "docx.write: document.body must be an array", { context: { path: "body", received: typeof doc.body } });
      opts = opts || {};
      checkReferences(doc, opts);
      if (walker.hasExtensions)
        walker.applyDehydrate({
          document: doc,
          headers: opts.headers || {},
          footers: opts.footers || {},
          styles: opts.styles,
          settings: opts.settings
        });
      const pkg = opc.empty(), hyperlinks = opts.hyperlinks || derivedHyperlinks(doc), collected = collectImages(doc, opts.images);
      for (const ext of collected.exts)
        pkg.contentTypes.defaults[ext] = extToContentType(ext);
      for (const img of collected.list)
        opc.setPart(pkg, img.partName, img.data, img.contentType);
      const chartCollected = collectCharts(doc);
      for (const ch of chartCollected) {
        opc.setPart(pkg, ch.partName, chartMod.bytesOf(ch.chart), chartMod.CT_CHART);
        pkg.contentTypes.overrides[ch.partName] = chartMod.CT_CHART;
      }
      const documentXml = renderDocument(doc);
      opc.setPart(pkg, "/word/document.xml", encodeText(documentXml), CT_DOCUMENT);
      const docRels = [], _ridAlloc = createRidAllocator({ existing: docRels }), claimRid = (preferred) => _ridAlloc.claim(preferred);
      function attachPart(opts_part, partName, rel) {
        opc.setPart(pkg, partName, opts_part.bytes, opts_part.contentType);
        docRels.push(rel);
      }
      function attachStoryRels(partName, bodies) {
        const rels = hyperlinkRels(derivedHyperlinks(bodies));
        if (rels.length)
          opc.setRels(pkg, partName, rels);
      }
      if (opts.styles)
        attachPart({
          bytes: stylesMod.bytesOf(opts.styles),
          contentType: stylesMod.CT_STYLES
        }, "/word/styles.xml", {
          Id: claimRid(),
          Type: stylesMod.REL_TYPE_STYLES,
          Target: "styles.xml"
        });
      if (opts.numbering)
        attachPart({
          bytes: numberingMod.bytesOf(opts.numbering),
          contentType: numberingMod.CT_NUMBERING
        }, "/word/numbering.xml", {
          Id: claimRid(),
          Type: numberingMod.REL_TYPE_NUMBERING,
          Target: "numbering.xml"
        });
      if (opts.settings)
        attachPart({
          bytes: settingsMod.bytesOf(opts.settings),
          contentType: settingsMod.CT_SETTINGS
        }, "/word/settings.xml", {
          Id: claimRid(),
          Type: settingsMod.REL_TYPE_SETTINGS,
          Target: "settings.xml"
        });
      if (opts.comments) {
        attachPart({
          bytes: commentsMod.bytesOf(opts.comments),
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
          bytes: footnotesMod.footnotesBytes(opts.footnotes),
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
          bytes: footnotesMod.endnotesBytes(opts.endnotes),
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
            bytes: headersMod.bytesOf(opts.headers[rId]),
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
            bytes: headersMod.bytesOf(opts.footers[rId]),
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
      opc.setRels(pkg, "/", [{
        Id: "rId1",
        Type: REL_TYPE_DOC,
        Target: "word/document.xml"
      }]);
      return opc.write(pkg);
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
    function collectImages(doc, extra) {
      const list = [], byData = new Map, exts = new Set, _ridAlloc = createRidAllocator({
        prefix: "rImg",
        existing: extra ? Object.keys(extra) : []
      });
      let nextIdx = 1;
      function nextRId() {
        return _ridAlloc.next();
      }
      if (extra)
        for (const id of Object.keys(extra)) {
          const e = extra[id], ct = e.contentType || drawingMod.sniffImageType(e.data), ext = drawingMod.extensionFor(ct), fileName = e.fileName || `image${nextIdx++}.${ext}`, partName = "/word/media/" + fileName, item = {
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
      walkDrawings(doc, (drawing) => {
        const img = drawing.image;
        if (!img || !img.data)
          return;
        let item = byData.get(img.data);
        if (!item) {
          const ct = img.contentType || drawingMod.sniffImageType(img.data), ext = drawingMod.extensionFor(ct), fileName = img.fileName || `image${nextIdx++}.${ext}`, preferredId = img.rId || drawing.embedRef, rId = preferredId || nextRId();
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
        drawing.embedRef = item.rId;
      });
      return { list, exts };
    }
    function collectCharts(doc) {
      const out = [], _ridAlloc = createRidAllocator({ prefix: "rChart" });
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
      let lostTarget = null, unresolved = null, danglingNumId = null;
      const visitor = (table, where, withNumbering) => (node) => {
        if (!node || typeof node !== "object")
          return;
        if (node.type === "hyperlink") {
          if (lostTarget === null && typeof node.target === "string" && node.target !== "" && !node.rId && !node.anchor)
            lostTarget = node.target;
          if (unresolved === null && typeof node.rId === "string" && node.rId !== "" && !hasOwn(table, node.rId))
            unresolved = { rId: node.rId, ...where };
        }
        if (withNumbering && danglingNumId === null && !opts.numbering && node.type === "paragraph" && node.pPr && node.pPr.numPr && node.pPr.numPr.numId != null && Number(node.pPr.numPr.numId) !== 0)
          danglingNumId = node.pPr.numPr.numId;
      };
      walkRuns(doc.body, visitor(opts.hyperlinks || derivedHyperlinks(doc), { story: "document" }, !0));
      for (const part of storyPartsOf(opts)) {
        const headerOrFooter = part.where.key !== void 0;
        walkRuns(part.bodies, visitor(derivedHyperlinks(part.bodies), part.where, headerOrFooter));
      }
      if (lostTarget !== null)
        throw new ContractError("docx/hyperlink-missing-rid", "docx.write: a hyperlink with a target needs an rId (pass one, e.g. hyperlink(text, target, { rId }))", { context: { target: lostTarget } });
      if (unresolved !== null)
        throw new ContractError("docx/hyperlink-unresolved-rid", `docx.write: hyperlink rId "${unresolved.rId}" has no relationship in the ${unresolved.story} part (give the node a target, or pass the relationship in opts.hyperlinks for the document body)`, { context: unresolved });
      if (danglingNumId !== null)
        throw new ContractError("docx/numbering-missing", "docx.write: the document references a list (pPr.numPr) but opts.numbering is missing", { context: { numId: danglingNumId } });
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
      const bodyChildren = structure.renderBodyChildren(doc), body = xml.el("w:body", {}, bodyChildren), root = xml.el("w:document", wordRootAttrs([body]), [body]);
      return xml.serialize(root);
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
