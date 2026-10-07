/*!
 * Copyright (c) 2026 AwaCloud SAS
 * Author: Matthieu Bouilloux
 * SPDX-License-Identifier: AGPL-3.0-only
 * Dual-licensed; see the NOTICE file for licensing and any additional terms.
 */
/* GENERATED — do not edit. Source: packages/front/office/odf/tools/generate-bundles.mjs */

/**
 * @fileoverview `@awacloud/odf/bundles/prebuilt/ods-full-package` — pre-built single-factory bundle.
 *
 * Variant **package** : declares the 7 fw modules as dependencies and inlines every
 * odf-local factory transitively reachable from `ods` plus 22 extras.
 *
 * @module odf/bundles/prebuilt/ods-full-package
 */

export const odsFullPackage = {
    name: "odsFullPackage",
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

    // odf-local factories — inlined and topo-ordered.
    __register({ name: "odfErrors", dependencies: [], factory: function() {
    class OdfError extends Error {
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

    class ParseError extends OdfError {
    }

    class RenderError extends OdfError {
    }

    class ContractError extends OdfError {
    }
    function isOdfError(e) {
      return e instanceof OdfError;
    }
    return {
      OdfError,
      ParseError,
      RenderError,
      ContractError,
      isOdfError
    };
  } });
    __register({ name: "odfShared", dependencies: ["odfErrors","xml"], factory: function(errors, xml) {
    const { ParseError, RenderError } = errors, ODF_NS = Object.freeze({
      OFFICE: "urn:oasis:names:tc:opendocument:xmlns:office:1.0",
      TEXT: "urn:oasis:names:tc:opendocument:xmlns:text:1.0",
      STYLE: "urn:oasis:names:tc:opendocument:xmlns:style:1.0",
      TABLE: "urn:oasis:names:tc:opendocument:xmlns:table:1.0",
      DRAW: "urn:oasis:names:tc:opendocument:xmlns:drawing:1.0",
      FO: "urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0",
      SVG: "urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0",
      NUMBER: "urn:oasis:names:tc:opendocument:xmlns:datastyle:1.0",
      OF: "urn:oasis:names:tc:opendocument:xmlns:of:1.2",
      PRESENTATION: "urn:oasis:names:tc:opendocument:xmlns:presentation:1.0",
      META: "urn:oasis:names:tc:opendocument:xmlns:meta:1.0",
      CONFIG: "urn:oasis:names:tc:opendocument:xmlns:config:1.0",
      MANIFEST: "urn:oasis:names:tc:opendocument:xmlns:manifest:1.0",
      DC: "http://purl.org/dc/elements/1.1/",
      XLINK: "http://www.w3.org/1999/xlink",
      CHART: "urn:oasis:names:tc:opendocument:xmlns:chart:1.0",
      MATH: "http://www.w3.org/1998/Math/MathML",
      FORM: "urn:oasis:names:tc:opendocument:xmlns:form:1.0",
      SCRIPT: "urn:oasis:names:tc:opendocument:xmlns:script:1.0",
      DR3D: "urn:oasis:names:tc:opendocument:xmlns:dr3d:1.0",
      ANIM: "urn:oasis:names:tc:opendocument:xmlns:animation:1.0",
      SMIL: "urn:oasis:names:tc:opendocument:xmlns:smil-compatible:1.0",
      DB: "urn:oasis:names:tc:opendocument:xmlns:database:1.0",
      XHTML: "http://www.w3.org/1999/xhtml"
    }), ODF_PREFIXES = (() => {
      const t = {};
      for (const k of Object.keys(ODF_NS))
        t[k.toLowerCase()] = ODF_NS[k];
      t.ooo = "http://openoffice.org/2004/office";
      t.ooow = "http://openoffice.org/2004/writer";
      t.oooc = "http://openoffice.org/2004/calc";
      t.rpt = "http://openoffice.org/2005/report";
      t.dom = "http://www.w3.org/2001/xml-events";
      t.xforms = "http://www.w3.org/2002/xforms";
      t.xsd = "http://www.w3.org/2001/XMLSchema";
      t.xsi = "http://www.w3.org/2001/XMLSchema-instance";
      t.formx = "urn:openoffice:names:experimental:ooxml-odf-interop:xmlns:form:1.0";
      t.grddl = "http://www.w3.org/2003/g/data-view#";
      t.css3t = "http://www.w3.org/TR/css3-text/";
      t.loext = "urn:org:documentfoundation:names:experimental:office:xmlns:loext:1.0";
      return Object.freeze(t);
    })(), CT = Object.freeze({
      ODT: "application/vnd.oasis.opendocument.text",
      ODS: "application/vnd.oasis.opendocument.spreadsheet",
      ODP: "application/vnd.oasis.opendocument.presentation",
      XML: "text/xml",
      FORMULA: "application/vnd.oasis.opendocument.formula"
    }), _te = new TextEncoder, _td = new TextDecoder;
    function encodeText(s) {
      return _te.encode(s);
    }
    function decodeText(b) {
      return _td.decode(b);
    }
    function parseXmlOrThrow(src, part, context) {
      try {
        return xml.parse(src);
      } catch (e) {
        const opts = { cause: e };
        if (context)
          opts.context = context;
        throw new ParseError(`odf/parse-error/${part}`, `${part}: ${e.message}`, opts);
      }
    }
    const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
    function firstStartTag(s) {
      let i = s.charCodeAt(0) === 65279 ? 1 : 0;
      for (;; ) {
        i = s.indexOf("<", i);
        if (i < 0)
          return null;
        let close = null;
        if (s.startsWith("<?", i))
          close = "?>";
        else if (s.startsWith("<!--", i))
          close = "-->";
        else if (s.startsWith("<!", i))
          close = ">";
        if (close) {
          const e = s.indexOf(close, i + 2);
          if (e < 0)
            return null;
          i = e + close.length;
          continue;
        }
        let q = "";
        for (let j = i + 1;j < s.length; j++) {
          const c = s[j];
          if (q) {
            if (c === q)
              q = "";
          } else if (c === '"' || c === "'")
            q = c;
          else if (c === ">")
            return s.slice(i + 1, s[j - 1] === "/" ? j - 1 : j);
        }
        return null;
      }
    }
    function sourceNamespaces(sourcePkg, partPath) {
      try {
        const out = {}, src = sourcePkg && sourcePkg.parts && sourcePkg.parts[partPath];
        let tag = null;
        if (typeof src === "string")
          tag = firstStartTag(src);
        else if (src instanceof Uint8Array)
          for (let len = 4096;; len *= 2) {
            const whole = len >= src.length;
            tag = firstStartTag(_td.decode(whole ? src : src.subarray(0, len)));
            if (tag !== null || whole)
              break;
          }
        if (tag) {
          const el = xml.parse("<" + tag + "/>");
          for (const k of Object.keys(el.attrs))
            if (k.startsWith("xmlns:") && k.length > 6)
              out[k.slice(6)] = el.attrs[k];
        }
        return Object.freeze(out);
      } catch {
        return Object.freeze({});
      }
    }
    const FORMULA_ATTRS = new Set(["table:formula", "text:formula", "text:condition"]);
    function declareNamespaces(rootEl, opts) {
      const o = opts || {}, carried = o.carried || {}, resolvable = (p) => hasOwn(carried, p) || hasOwn(ODF_PREFIXES, p), missing = new Set, scope = [], inScope = (p) => {
        if (p === "xml")
          return !0;
        for (let i = scope.length - 1;i >= 0; i--)
          if (scope[i].has(p))
            return !0;
        return !1;
      }, use = (name) => {
        const i = typeof name === "string" ? name.indexOf(":") : -1;
        if (i > 0 && !inScope(name.slice(0, i)))
          missing.add(name.slice(0, i));
      }, walk = (node) => {
        if (!node || node.type !== "element")
          return;
        const attrs = node.attrs || {}, local = new Set;
        for (const k of Object.keys(attrs))
          if (k.startsWith("xmlns:"))
            local.add(k.slice(6));
        scope.push(local);
        use(node.name);
        for (const k of Object.keys(attrs)) {
          if (k === "xmlns" || k.startsWith("xmlns:"))
            continue;
          use(k);
          if (FORMULA_ATTRS.has(k) && typeof attrs[k] === "string") {
            const m = /^([A-Za-z_][\w.-]*):/.exec(attrs[k]);
            if (m && !inScope(m[1]) && resolvable(m[1]))
              missing.add(m[1]);
          }
        }
        for (const c of node.children || [])
          walk(c);
        scope.pop();
      };
      walk(rootEl);
      const names = [...missing].sort(), uris = {};
      for (const p of names)
        if (hasOwn(carried, p))
          uris[p] = carried[p];
        else if (hasOwn(ODF_PREFIXES, p))
          uris[p] = ODF_PREFIXES[p];
        else
          throw new RenderError("odf/render-error/namespace", `odf: namespace prefix "${p}" is used but not declared`, { context: { module: o.module, part: o.part, prefix: p } });
      const attrs = rootEl.attrs || {}, keys = Object.keys(attrs);
      let at = -1;
      keys.forEach((k, i) => {
        if (k.startsWith("xmlns:"))
          at = i;
      });
      const out = {}, insert = () => {
        for (const p of names)
          out["xmlns:" + p] = uris[p];
      };
      if (at < 0)
        insert();
      keys.forEach((k, i) => {
        out[k] = attrs[k];
        if (i === at)
          insert();
      });
      rootEl.attrs = out;
      return rootEl;
    }
    function readSidecars(target, pkgModel, sideMods) {
      const parts = pkgModel.parts || {}, m = parts["meta.xml"];
      if (m)
        target.meta = sideMods.metaMod.parse(_td.decode(m));
      const s = parts["settings.xml"];
      if (s)
        target.settings = sideMods.settingsMod.parse(_td.decode(s));
      const st = parts["styles.xml"];
      if (st)
        target.styles = sideMods.stylesMod.parse(_td.decode(st));
      return target;
    }
    function writeSidecars(p, doc, opts, sideMods, ctXml) {
      const { pkg: pkgM, metaMod, settingsMod, stylesMod } = sideMods, ct = ctXml || CT.XML, ours = metaMod.empty().generator, ns = (part) => ({ namespaces: sourceNamespaces(doc.package, part) });
      let meta = opts.meta ? opts.meta.generator == null ? { ...opts.meta, generator: ours } : opts.meta : { ...doc.meta || metaMod.empty(), generator: ours };
      pkgM.setPart(p, "meta.xml", _te.encode(metaMod.serialize(meta, ns("meta.xml"))), ct);
      const settings = opts.settings || doc.settings || settingsMod.empty();
      pkgM.setPart(p, "settings.xml", _te.encode(settingsMod.serialize(settings, ns("settings.xml"))), ct);
      const styles = opts.styles || doc.styles || stylesMod.empty();
      pkgM.setPart(p, "styles.xml", _te.encode(stylesMod.serialize(styles, ns("styles.xml"))), ct);
    }
    const REGENERATED_PARTS = Object.freeze(["content.xml", "meta.xml", "settings.xml", "styles.xml"]);
    function carryParts(p, source, mods) {
      if (!source || !source.parts || typeof source.parts !== "object")
        return p;
      const { pkg: pkgM, manifestMod } = mods, entries = source.manifest && source.manifest.entries || [], mediaTypes = {};
      for (const e of entries)
        if (e && e.fullPath)
          mediaTypes[e.fullPath] = e.mediaType;
      const skip = new Set([...REGENERATED_PARTS, pkgM.MIMETYPE_PATH, pkgM.MANIFEST_PATH]);
      for (const path of Object.keys(source.parts)) {
        if (skip.has(path))
          continue;
        if (Object.prototype.hasOwnProperty.call(p.parts, path))
          continue;
        pkgM.setPart(p, path, source.parts[path], mediaTypes[path] || "application/octet-stream");
      }
      for (const e of entries) {
        if (!e || !e.fullPath || e.fullPath === "/" || !e.fullPath.endsWith("/"))
          continue;
        manifestMod.setEntry(p.manifest, e.fullPath, e.mediaType || "");
      }
      return p;
    }
    function findDeep(node, name) {
      if (!node || node.type !== "element")
        return null;
      if (node.name === name)
        return node;
      for (const c of node.children || []) {
        const f = findDeep(c, name);
        if (f)
          return f;
      }
      return null;
    }
    function intAttr(el, name) {
      const v = el && el.attrs && el.attrs[name];
      if (v == null)
        return;
      const n = parseInt(v, 10);
      return Number.isFinite(n) ? n : void 0;
    }
    function boundedIntAttr(el, name, opts) {
      const v = intAttr(el, name), min = opts && Number.isFinite(opts.minStrict) ? opts.minStrict : 1;
      if (!Number.isFinite(v) || v <= min)
        return;
      const max = opts && Number.isFinite(opts.max) ? opts.max : null;
      if (max != null && v > max) {
        const label = opts && opts.label || name;
        throw new ParseError("odf/parse-error/limit", `${opts && opts.module || "odf"}: ${label} ${v} exceeds max ${max}`, { context: { module: opts && opts.module || "odf", value: v, max } });
      }
      return v;
    }
    return {
      ODF_NS,
      ODF_PREFIXES,
      ODF_VERSION: "1.4",
      XML_DECL: '<?xml version="1.0" encoding="UTF-8"?>',
      XML_DECL_STANDALONE: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
      CT,
      encodeText,
      decodeText,
      parseXmlOrThrow,
      sourceNamespaces,
      declareNamespaces,
      readSidecars,
      writeSidecars,
      carryParts,
      REGENERATED_PARTS,
      findDeep,
      intAttr,
      boundedIntAttr
    };
  } });
    __register({ name: "pkgMimetype", dependencies: ["odfErrors","odfShared"], factory: function(errors, shared) {
    const { ParseError, ContractError } = errors, { CT, encodeText, decodeText } = shared, CT_ODT = CT.ODT, CT_ODS = CT.ODS, CT_ODP = CT.ODP, KNOWN = [CT_ODT, CT_ODS, CT_ODP];
    function parse(bytes) {
      if (!(bytes instanceof Uint8Array))
        throw new ContractError("odf/contract-error/mimetype", "mimetype: expected Uint8Array", { context: { module: "mimetype", argument: "bytes" } });
      const s = decodeText(bytes).trim();
      if (!s)
        throw new ParseError("odf/parse-error/mimetype", "mimetype: empty", { context: { module: "mimetype" } });
      return s;
    }
    function render(mimetype) {
      if (typeof mimetype !== "string" || !mimetype)
        throw new ContractError("odf/contract-error/mimetype", "mimetype: expected non-empty string", { context: { module: "mimetype", argument: "mimetype" } });
      return encodeText(mimetype);
    }
    function isKnown(mt) {
      return KNOWN.indexOf(mt) >= 0;
    }
    return {
      parse,
      render,
      isKnown,
      CT_ODT,
      CT_ODS,
      CT_ODP
    };
  } });
    __register({ name: "pkgManifest", dependencies: ["odfErrors","odfShared","xml"], factory: function(errors, shared, xml) {
    const { ParseError } = errors, { ODF_NS, ODF_VERSION, parseXmlOrThrow, declareNamespaces } = shared, MANIFEST_NS = ODF_NS.MANIFEST, KNOWN_ROOT_ATTRS = new Set(["manifest:version", "xmlns:manifest"]), KNOWN_ENTRY_ATTRS = new Set([
      "manifest:full-path",
      "manifest:media-type",
      "manifest:version",
      "manifest:size"
    ]);
    function parse(xmlString) {
      const root = parseXmlOrThrow(xmlString, "manifest", { part: "META-INF/manifest.xml", module: "manifest" });
      if (root.name !== "manifest:manifest")
        throw new ParseError("odf/parse-error/manifest", `manifest: unexpected root <${root.name}>`, { context: { part: "META-INF/manifest.xml", module: "manifest" } });
      const version = root.attrs["manifest:version"] || ODF_VERSION, entries = [], extraChildren = [], extraAttrs = {};
      for (const k of Object.keys(root.attrs))
        if (!KNOWN_ROOT_ATTRS.has(k))
          extraAttrs[k] = root.attrs[k];
      for (const c of root.children || []) {
        if (c.type !== "element")
          continue;
        if (c.name === "manifest:file-entry")
          entries.push(parseEntry(c));
        else
          extraChildren.push(c);
      }
      const out = { version, entries }, extras = {};
      if (Object.keys(extraAttrs).length)
        extras.attrs = extraAttrs;
      if (extraChildren.length)
        extras.children = extraChildren;
      if (Object.keys(extras).length)
        out._extras = extras;
      return out;
    }
    function parseEntry(el) {
      const e = {
        fullPath: el.attrs["manifest:full-path"] || "",
        mediaType: el.attrs["manifest:media-type"] || ""
      };
      if (el.attrs["manifest:version"])
        e.version = el.attrs["manifest:version"];
      if (el.attrs["manifest:size"])
        e.size = el.attrs["manifest:size"];
      const extraAttrs = {};
      for (const k of Object.keys(el.attrs))
        if (!KNOWN_ENTRY_ATTRS.has(k))
          extraAttrs[k] = el.attrs[k];
      const extraChildren = (el.children || []).filter((c) => c.type === "element"), extras = {};
      if (Object.keys(extraAttrs).length)
        extras.attrs = extraAttrs;
      if (extraChildren.length)
        extras.children = extraChildren;
      if (Object.keys(extras).length)
        e._extras = extras;
      return e;
    }
    function serialize(manifest) {
      const m = manifest || { version: ODF_VERSION, entries: [] }, attrs = {
        "xmlns:manifest": MANIFEST_NS,
        "manifest:version": m.version || ODF_VERSION
      };
      if (m._extras && m._extras.attrs)
        for (const k of Object.keys(m._extras.attrs))
          attrs[k] = m._extras.attrs[k];
      const children = (m.entries || []).map(renderEntry);
      if (m._extras && m._extras.children)
        for (const c of m._extras.children)
          children.push(c);
      const root = xml.el("manifest:manifest", attrs, children);
      declareNamespaces(root, { part: "META-INF/manifest.xml", module: "manifest" });
      return xml.serialize(root);
    }
    function renderEntry(e) {
      const attrs = {
        "manifest:full-path": e.fullPath,
        "manifest:media-type": e.mediaType || ""
      };
      if (e.version)
        attrs["manifest:version"] = e.version;
      if (e.size != null)
        attrs["manifest:size"] = String(e.size);
      if (e._extras && e._extras.attrs)
        for (const k of Object.keys(e._extras.attrs))
          attrs[k] = e._extras.attrs[k];
      const children = e._extras && e._extras.children || [];
      return xml.el("manifest:file-entry", attrs, children);
    }
    function empty(mimetype) {
      return {
        version: ODF_VERSION,
        entries: [{ fullPath: "/", mediaType: mimetype, version: ODF_VERSION }]
      };
    }
    function setEntry(manifest, fullPath, mediaType) {
      const idx = manifest.entries.findIndex((e) => e.fullPath === fullPath), entry = { fullPath, mediaType };
      if (idx >= 0)
        manifest.entries[idx] = entry;
      else
        manifest.entries.push(entry);
      return manifest;
    }
    return { parse, serialize, empty, setEntry, MANIFEST_NS };
  } });
    __register({ name: "pkgPackage", dependencies: ["odfErrors","odfShared","zip","pkgMimetype","pkgManifest"], factory: function(errors, shared, zipMod, mimetypeMod, manifestMod) {
    const { ParseError, ContractError } = errors, { encodeText, decodeText } = shared, DEFAULT_LIMITS = Object.freeze({
      maxParts: 4096,
      maxUncompressed: 268435456,
      maxRatio: 200
    });
    function limitOf(opts, key) {
      const v = opts && opts[key] !== void 0 ? opts[key] : DEFAULT_LIMITS[key];
      if (typeof v !== "number" || !Number.isFinite(v) || v < 0)
        throw new ContractError("odf/contract-error/pkg", `pkg: ${key} must be a finite number >= 0 (0 disables)`, { context: { module: "pkg", argument: key, received: v } });
      return v;
    }
    function zipBomb(message, context) {
      return new ParseError("odf/parse-error/zip-bomb", "pkg: " + message, { context: { module: "pkg", ...context } });
    }
    function read(bytes, opts) {
      const maxParts = limitOf(opts, "maxParts"), maxUncompressed = limitOf(opts, "maxUncompressed"), maxRatio = limitOf(opts, "maxRatio");
      let files, count = 0, total = 0;
      try {
        files = zipMod.unzipSync(bytes, {
          filter(entry) {
            count++;
            if (maxParts && count > maxParts)
              throw zipBomb("too many entries in archive", { limit: "maxParts", max: maxParts, actual: count });
            const u = typeof entry.originalSize === "number" ? entry.originalSize : 0;
            total += u;
            if (maxUncompressed && total > maxUncompressed)
              throw zipBomb("uncompressed payload exceeds limit", { limit: "maxUncompressed", max: maxUncompressed, actual: total, name: entry.name });
            if (maxRatio && entry.size > 0 && u / entry.size > maxRatio)
              throw zipBomb("per-entry compression ratio exceeds limit", { limit: "maxRatio", max: maxRatio, name: entry.name, ratio: u / entry.size });
            return !0;
          }
        });
      } catch (e) {
        if (e && e.code === "odf/parse-error/zip-bomb")
          throw e;
        throw new ParseError("odf/parse-error/pkg", "pkg: not a valid ZIP archive", { cause: e, context: { module: "pkg" } });
      }
      const mimetypeBytes = files.mimetype;
      if (!mimetypeBytes)
        throw new ParseError("odf/parse-error/pkg", "pkg: missing mimetype", { context: { module: "pkg", part: "mimetype" } });
      const mimetype = mimetypeMod.parse(mimetypeBytes), manifestBytes = files["META-INF/manifest.xml"];
      if (!manifestBytes)
        throw new ParseError("odf/parse-error/pkg", "pkg: missing META-INF/manifest.xml", { context: { module: "pkg", part: "META-INF/manifest.xml" } });
      const manifest = manifestMod.parse(decodeText(manifestBytes)), parts = {};
      for (const path of Object.keys(files)) {
        if (path === "mimetype")
          continue;
        if (path === "META-INF/manifest.xml")
          continue;
        if (path.endsWith("/"))
          continue;
        parts[path] = files[path];
      }
      return { mimetype, manifest, parts };
    }
    function write(pkg) {
      if (!pkg || !pkg.mimetype)
        throw new ContractError("odf/contract-error/pkg", "pkg: package needs a mimetype", { context: { module: "pkg", argument: "pkg" } });
      const files = {};
      files.mimetype = [mimetypeMod.render(pkg.mimetype), { level: 0 }];
      for (const path of Object.keys(pkg.parts || {})) {
        if (path === "mimetype")
          continue;
        if (path === "META-INF/manifest.xml")
          continue;
        files[path] = pkg.parts[path];
      }
      files["META-INF/manifest.xml"] = encodeText(manifestMod.serialize(pkg.manifest));
      return zipMod.zipSync(files);
    }
    function empty(mimetype) {
      return {
        mimetype,
        manifest: manifestMod.empty(mimetype),
        parts: {}
      };
    }
    function setPart(pkg, path, bytes, mediaType) {
      pkg.parts[path] = bytes;
      manifestMod.setEntry(pkg.manifest, path, mediaType || "application/octet-stream");
      return pkg;
    }
    function getPart(pkg, path) {
      return pkg.parts[path];
    }
    function getPartText(pkg, path) {
      const b = pkg.parts[path];
      return b ? decodeText(b) : null;
    }
    return {
      read,
      write,
      empty,
      setPart,
      getPart,
      getPartText,
      MIMETYPE_PATH: "mimetype",
      MANIFEST_PATH: "META-INF/manifest.xml",
      DEFAULT_LIMITS
    };
  } });
    __register({ name: "odfMeta", dependencies: ["odfErrors","odfShared","xml"], factory: function(errors, shared, xml) {
    const { ParseError } = errors, { ODF_NS, ODF_VERSION, parseXmlOrThrow, declareNamespaces } = shared, OFFICE_NS = ODF_NS.OFFICE, META_NS = ODF_NS.META, DC_NS = ODF_NS.DC;
    function parse(xmlString) {
      const root = parseXmlOrThrow(xmlString, "meta", { part: "meta.xml", module: "meta" });
      if (root.name !== "office:document-meta")
        throw new ParseError("odf/parse-error/meta", `meta: unexpected root <${root.name}>`, { context: { part: "meta.xml", module: "meta" } });
      const metaEl = xml.findChild(root, "office:meta"), out = {}, extras = [];
      if (metaEl)
        for (const c of metaEl.children || []) {
          if (c.type !== "element")
            continue;
          switch (c.name) {
            case "dc:title":
              out.title = xml.textContent(c);
              break;
            case "dc:creator":
              out.creator = xml.textContent(c);
              break;
            case "dc:date":
              out.date = xml.textContent(c);
              break;
            case "meta:generator":
              out.generator = xml.textContent(c);
              break;
            case "meta:initial-creator":
              out.initialCreator = xml.textContent(c);
              break;
            case "meta:creation-date":
              out.creationDate = xml.textContent(c);
              break;
            default:
              extras.push(c);
          }
        }
      if (extras.length)
        out._extras = { children: extras };
      return out;
    }
    function serialize(meta, opts) {
      const m = meta || {}, children = [];
      if (m.title != null)
        children.push(xml.el("dc:title", {}, [xml.text(String(m.title))]));
      if (m.creator != null)
        children.push(xml.el("dc:creator", {}, [xml.text(String(m.creator))]));
      if (m.date != null)
        children.push(xml.el("dc:date", {}, [xml.text(String(m.date))]));
      if (m.generator != null)
        children.push(xml.el("meta:generator", {}, [xml.text(String(m.generator))]));
      if (m.initialCreator != null)
        children.push(xml.el("meta:initial-creator", {}, [xml.text(String(m.initialCreator))]));
      if (m.creationDate != null)
        children.push(xml.el("meta:creation-date", {}, [xml.text(String(m.creationDate))]));
      if (m._extras && m._extras.children)
        for (const c of m._extras.children)
          children.push(c);
      const metaEl = xml.el("office:meta", {}, children), root = xml.el("office:document-meta", {
        "xmlns:office": OFFICE_NS,
        "xmlns:meta": META_NS,
        "xmlns:dc": DC_NS,
        "office:version": ODF_VERSION
      }, [metaEl]);
      declareNamespaces(root, {
        carried: opts && opts.namespaces || {},
        part: "meta.xml",
        module: "meta"
      });
      return xml.serialize(root);
    }
    function empty() {
      return { generator: "@awacloud/odf" };
    }
    return { parse, serialize, empty, OFFICE_NS, META_NS, DC_NS };
  } });
    __register({ name: "odfSettings", dependencies: ["odfErrors","odfShared","xml"], factory: function(errors, shared, xml) {
    const { ParseError } = errors, { ODF_NS, ODF_VERSION, parseXmlOrThrow, declareNamespaces } = shared, OFFICE_NS = ODF_NS.OFFICE, CONFIG_NS = ODF_NS.CONFIG;
    function parse(xmlString) {
      const root = parseXmlOrThrow(xmlString, "settings", { part: "settings.xml", module: "settings" });
      if (root.name !== "office:document-settings")
        throw new ParseError("odf/parse-error/settings", `settings: unexpected root <${root.name}>`, { context: { part: "settings.xml", module: "settings" } });
      const settingsEl = xml.findChild(root, "office:settings"), itemSets = [], extras = [];
      if (settingsEl)
        for (const c of settingsEl.children || []) {
          if (c.type !== "element")
            continue;
          if (c.name === "config:config-item-set")
            itemSets.push(c);
          else
            extras.push(c);
        }
      const out = { itemSets };
      if (extras.length)
        out._extras = { children: extras };
      return out;
    }
    function serialize(settings, opts) {
      const s = settings || { itemSets: [] }, children = (s.itemSets || []).slice();
      if (s._extras && s._extras.children)
        for (const c of s._extras.children)
          children.push(c);
      const settingsEl = xml.el("office:settings", {}, children), root = xml.el("office:document-settings", {
        "xmlns:office": OFFICE_NS,
        "xmlns:config": CONFIG_NS,
        "office:version": ODF_VERSION
      }, [settingsEl]);
      declareNamespaces(root, {
        carried: opts && opts.namespaces || {},
        part: "settings.xml",
        module: "settings"
      });
      return xml.serialize(root);
    }
    function empty() {
      return { itemSets: [] };
    }
    return { parse, serialize, empty, OFFICE_NS, CONFIG_NS };
  } });
    __register({ name: "odfStyles", dependencies: ["odfErrors","odfShared","xml"], factory: function(errors, shared, xml) {
    const { ParseError, ContractError } = errors, { ODF_NS, ODF_VERSION, parseXmlOrThrow, declareNamespaces } = shared, OFFICE_NS = ODF_NS.OFFICE, STYLE_NS = ODF_NS.STYLE, TEXT_NS = ODF_NS.TEXT, FO_NS = ODF_NS.FO, SVG_NS = ODF_NS.SVG, TABLE_NS = ODF_NS.TABLE;
    function parse(xmlString) {
      const root = parseXmlOrThrow(xmlString, "styles", { part: "styles.xml", module: "styles" });
      if (root.name !== "office:document-styles")
        throw new ParseError("odf/parse-error/styles", `styles: unexpected root <${root.name}>`, { context: { part: "styles.xml", module: "styles" } });
      const out = { styles: [], automaticStyles: [], masterStyles: [] }, extras = [];
      for (const c of root.children || []) {
        if (c.type !== "element")
          continue;
        if (c.name === "office:styles") {
          for (const k of c.children || [])
            if (k.type === "element")
              out.styles.push(k);
        } else if (c.name === "office:automatic-styles") {
          for (const k of c.children || [])
            if (k.type === "element")
              out.automaticStyles.push(k);
        } else if (c.name === "office:master-styles") {
          for (const k of c.children || [])
            if (k.type === "element")
              out.masterStyles.push(k);
        } else
          extras.push(c);
      }
      if (extras.length)
        out._extras = { children: extras };
      return out;
    }
    const PROP_ORDER = [
      ["paragraph", "style:paragraph-properties"],
      ["text", "style:text-properties"],
      ["table", "style:table-properties"],
      ["tableColumn", "style:table-column-properties"],
      ["tableRow", "style:table-row-properties"],
      ["tableCell", "style:table-cell-properties"],
      ["graphic", "style:graphic-properties"]
    ], SPEC_ATTRS = [
      ["name", "style:name"],
      ["displayName", "style:display-name"],
      ["family", "style:family"],
      ["parentStyleName", "style:parent-style-name"],
      ["nextStyleName", "style:next-style-name"],
      ["defaultOutlineLevel", "style:default-outline-level"],
      ["class", "style:class"]
    ];
    function badSpec(spec) {
      return new ContractError("odf/contract-error/styles", "styles: named style needs a string name and family", { context: { module: "styles", spec } });
    }
    function namedStyle(spec) {
      if (!spec || typeof spec !== "object" || typeof spec.name !== "string" || typeof spec.family !== "string")
        throw badSpec(spec);
      const attrs = {};
      for (const [field, attr] of SPEC_ATTRS) {
        const v = spec[field];
        if (v === void 0 || v === null)
          continue;
        attrs[attr] = String(v);
      }
      const xa = spec._extras && spec._extras.attrs;
      if (xa)
        for (const k of Object.keys(xa))
          attrs[k] = xa[k];
      const children = [], props = spec.properties || {};
      for (const [key, tag] of PROP_ORDER) {
        if (props[key] === void 0 || props[key] === null)
          continue;
        children.push(xml.el(tag, { ...props[key] }, []));
      }
      const xc = spec._extras && spec._extras.children;
      if (xc)
        for (const c of xc)
          children.push(c);
      return xml.el("style:style", attrs, children);
    }
    function bucketEntries(list) {
      const out = [];
      for (const entry of list || [])
        if (entry && entry.type === "element")
          out.push(entry);
        else if (entry && typeof entry === "object" && typeof entry.name === "string")
          out.push(namedStyle(entry));
        else
          throw badSpec(entry);
      return out;
    }
    function serialize(styles, opts) {
      const s = styles || { styles: [], automaticStyles: [], masterStyles: [] }, children = [
        xml.el("office:styles", {}, bucketEntries(s.styles)),
        xml.el("office:automatic-styles", {}, bucketEntries(s.automaticStyles)),
        xml.el("office:master-styles", {}, bucketEntries(s.masterStyles))
      ];
      if (s._extras && s._extras.children)
        for (const c of s._extras.children)
          children.push(c);
      const root = xml.el("office:document-styles", {
        "xmlns:office": OFFICE_NS,
        "xmlns:style": STYLE_NS,
        "xmlns:text": TEXT_NS,
        "xmlns:fo": FO_NS,
        "xmlns:svg": SVG_NS,
        "xmlns:table": TABLE_NS,
        "office:version": ODF_VERSION
      }, children);
      declareNamespaces(root, {
        carried: opts && opts.namespaces || {},
        part: "styles.xml",
        module: "styles"
      });
      return xml.serialize(root);
    }
    function empty() {
      return { styles: [], automaticStyles: [], masterStyles: [] };
    }
    return {
      parse,
      serialize,
      namedStyle,
      empty,
      OFFICE_NS,
      STYLE_NS,
      TEXT_NS,
      FO_NS,
      SVG_NS,
      TABLE_NS
    };
  } });
    __register({ name: "tableCell", dependencies: ["odfErrors","odfShared","xml"], factory: function(errors, shared, xml) {
    const { ParseError } = errors, { intAttr } = shared;
    function parseCell(el, opts) {
      const out = { type: "cell", children: [] };
      if (el.name === "table:covered-table-cell")
        out.covered = !0;
      const attrs = el.attrs || {};
      if (attrs["table:style-name"])
        out.styleName = attrs["table:style-name"];
      if (attrs["office:value-type"])
        out.valueType = attrs["office:value-type"];
      const vt = out.valueType;
      if (vt === "date" && attrs["office:date-value"] != null)
        out.value = attrs["office:date-value"];
      else if (vt === "time" && attrs["office:time-value"] != null)
        out.value = attrs["office:time-value"];
      else if (vt === "boolean" && attrs["office:boolean-value"] != null)
        out.value = attrs["office:boolean-value"];
      else if (vt === "string" && attrs["office:string-value"] != null)
        out.value = attrs["office:string-value"];
      else if (attrs["office:value"] != null)
        out.value = attrs["office:value"];
      else if (attrs["office:string-value"] != null)
        out.value = attrs["office:string-value"];
      else if (attrs["office:date-value"] != null)
        out.value = attrs["office:date-value"];
      else if (attrs["office:time-value"] != null)
        out.value = attrs["office:time-value"];
      else if (attrs["office:boolean-value"] != null)
        out.value = attrs["office:boolean-value"];
      if (attrs["office:currency"])
        out.currency = attrs["office:currency"];
      if (attrs["table:formula"])
        out.formula = attrs["table:formula"];
      const repeated = intAttr(el, "table:number-columns-repeated");
      if (repeated && repeated > 1) {
        const max = opts && Number.isFinite(opts.maxRepeat) ? opts.maxRepeat : null;
        if (max != null && repeated > max)
          throw new ParseError("odf/parse-error/limit", `cell: number-columns-repeated ${repeated} exceeds max ${max}`, { context: { module: "tableCell", value: repeated, max } });
        out.repeated = repeated;
      }
      const colSpan = intAttr(el, "table:number-columns-spanned");
      if (colSpan && colSpan > 1)
        out.colSpan = colSpan;
      const rowSpan = intAttr(el, "table:number-rows-spanned");
      if (rowSpan && rowSpan > 1)
        out.rowSpan = rowSpan;
      const known = new Set([
        "table:style-name",
        "office:value-type",
        "office:value",
        "office:string-value",
        "office:date-value",
        "office:time-value",
        "office:boolean-value",
        "office:currency",
        "table:formula",
        "table:number-columns-repeated",
        "table:number-columns-spanned",
        "table:number-rows-spanned"
      ]), xtraAttrs = {};
      let anyAttr = !1;
      for (const k of Object.keys(attrs))
        if (!known.has(k)) {
          xtraAttrs[k] = attrs[k];
          anyAttr = !0;
        }
      for (const c of el.children || [])
        if (c.type === "element")
          out.children.push(c);
      if (anyAttr)
        out._extras = { attrs: xtraAttrs };
      return out;
    }
    function renderCell(cell) {
      const attrs = {};
      if (cell.styleName)
        attrs["table:style-name"] = cell.styleName;
      if (cell.valueType)
        attrs["office:value-type"] = cell.valueType;
      if (cell.value != null) {
        const kind = cell.valueType;
        if (kind === "string")
          attrs["office:string-value"] = cell.value;
        else if (kind === "date")
          attrs["office:date-value"] = cell.value;
        else if (kind === "time")
          attrs["office:time-value"] = cell.value;
        else if (kind === "boolean")
          attrs["office:boolean-value"] = cell.value;
        else
          attrs["office:value"] = cell.value;
      }
      if (cell.currency)
        attrs["office:currency"] = cell.currency;
      if (cell.formula)
        attrs["table:formula"] = cell.formula;
      if (cell.repeated && cell.repeated > 1)
        attrs["table:number-columns-repeated"] = String(cell.repeated);
      if (cell.colSpan && cell.colSpan > 1)
        attrs["table:number-columns-spanned"] = String(cell.colSpan);
      if (cell.rowSpan && cell.rowSpan > 1)
        attrs["table:number-rows-spanned"] = String(cell.rowSpan);
      if (cell._extras && cell._extras.attrs)
        for (const k of Object.keys(cell._extras.attrs))
          attrs[k] = cell._extras.attrs[k];
      const tag = cell.covered ? "table:covered-table-cell" : "table:table-cell";
      return xml.el(tag, attrs, (cell.children || []).slice());
    }
    return { parseCell, renderCell };
  } });
    __register({ name: "tableRow", dependencies: ["odfErrors","odfShared","xml","tableCell"], factory: function(errors, shared, xml, cellMod) {
    const { ParseError } = errors;
    function parseRow(el, opts) {
      const out = { type: "row", cells: [] }, attrs = el.attrs || {};
      if (attrs["table:style-name"])
        out.styleName = attrs["table:style-name"];
      const r = parseInt(attrs["table:number-rows-repeated"], 10);
      if (Number.isFinite(r) && r > 1) {
        const max = opts && Number.isFinite(opts.maxRepeat) ? opts.maxRepeat : null;
        if (max != null && r > max)
          throw new ParseError("odf/parse-error/limit", `row: number-rows-repeated ${r} exceeds max ${max}`, { context: { module: "tableRow", value: r, max } });
        out.repeated = r;
      }
      for (const c of el.children || []) {
        if (c.type !== "element")
          continue;
        if (c.name === "table:table-cell" || c.name === "table:covered-table-cell")
          out.cells.push(cellMod.parseCell(c, opts));
      }
      return out;
    }
    function renderRow(row) {
      const attrs = {};
      if (row.styleName)
        attrs["table:style-name"] = row.styleName;
      if (row.repeated && row.repeated > 1)
        attrs["table:number-rows-repeated"] = String(row.repeated);
      const children = (row.cells || []).map((c) => cellMod.renderCell(c));
      return xml.el("table:table-row", attrs, children);
    }
    return { parseRow, renderRow };
  } });
    __register({ name: "tableTable", dependencies: ["xml","tableRow"], factory: function(xml, rowMod) {
    function parseColumn(el) {
      const out = {}, a = el.attrs || {};
      if (a["table:style-name"])
        out.styleName = a["table:style-name"];
      if (a["table:default-cell-style-name"])
        out.defaultCellStyleName = a["table:default-cell-style-name"];
      const r = parseInt(a["table:number-columns-repeated"], 10);
      if (Number.isFinite(r) && r > 1)
        out.repeated = r;
      return out;
    }
    function renderColumn(col) {
      const a = {};
      if (col.styleName)
        a["table:style-name"] = col.styleName;
      if (col.defaultCellStyleName)
        a["table:default-cell-style-name"] = col.defaultCellStyleName;
      if (col.repeated && col.repeated > 1)
        a["table:number-columns-repeated"] = String(col.repeated);
      return xml.el("table:table-column", a, []);
    }
    function parseTable(el) {
      const out = { type: "table", columns: [], rows: [] }, a = el.attrs || {};
      if (a["table:name"])
        out.name = a["table:name"];
      if (a["table:style-name"])
        out.styleName = a["table:style-name"];
      const extras = [];
      let headerRows = 0;
      for (const c of el.children || []) {
        if (c.type !== "element")
          continue;
        switch (c.name) {
          case "table:table-column":
            out.columns.push(parseColumn(c));
            break;
          case "table:table-row":
            out.rows.push(rowMod.parseRow(c));
            break;
          case "table:table-header-rows":
            for (const k of c.children || [])
              if (k.type === "element" && k.name === "table:table-row") {
                out.rows.push(rowMod.parseRow(k));
                headerRows++;
              }
            break;
          default:
            extras.push(c);
        }
      }
      if (headerRows > 0)
        out.headerRows = headerRows;
      if (extras.length)
        out._extras = { children: extras };
      return out;
    }
    function renderTable(t) {
      const attrs = {};
      if (t.name)
        attrs["table:name"] = t.name;
      if (t.styleName)
        attrs["table:style-name"] = t.styleName;
      const children = [];
      for (const col of t.columns || [])
        children.push(renderColumn(col));
      const headerN = t.headerRows || 0, rows = t.rows || [];
      if (headerN > 0) {
        const headerKids = rows.slice(0, headerN).map((r) => rowMod.renderRow(r));
        children.push(xml.el("table:table-header-rows", {}, headerKids));
        for (const r of rows.slice(headerN))
          children.push(rowMod.renderRow(r));
      } else
        for (const r of rows)
          children.push(rowMod.renderRow(r));
      if (t._extras && t._extras.children)
        for (const c of t._extras.children)
          children.push(c);
      return xml.el("table:table", attrs, children);
    }
    return { parseTable, renderTable };
  } });
    __register({ name: "spreadsheet", dependencies: ["xml","tableTable"], factory: function(xml, tableMod) {
    function parseSpreadsheet(el) {
      const out = { tables: [] }, extras = [];
      for (const c of el && el.children || []) {
        if (c.type !== "element")
          continue;
        switch (c.name) {
          case "table:table":
            out.tables.push(tableMod.parseTable(c));
            break;
          case "table:named-expressions": {
            const kids = [];
            for (const k of c.children || [])
              if (k.type === "element")
                kids.push(k);
            out.namedExpressions = kids;
            break;
          }
          case "table:content-validations": {
            const kids = [];
            for (const k of c.children || [])
              if (k.type === "element")
                kids.push(k);
            out.dataValidations = kids;
            break;
          }
          default:
            extras.push(c);
        }
      }
      if (extras.length)
        out._extras = { children: extras };
      return out;
    }
    function renderSpreadsheet(s) {
      const children = [];
      if (s.namedExpressions && s.namedExpressions.length)
        children.push(xml.el("table:named-expressions", {}, s.namedExpressions.slice()));
      if (s.dataValidations && s.dataValidations.length)
        children.push(xml.el("table:content-validations", {}, s.dataValidations.slice()));
      for (const t of s.tables || [])
        children.push(tableMod.renderTable(t));
      if (s._extras && s._extras.children)
        for (const c of s._extras.children)
          children.push(c);
      return xml.el("office:spreadsheet", {}, children);
    }
    function empty() {
      return { tables: [] };
    }
    return { parseSpreadsheet, renderSpreadsheet, empty };
  } });
    __register({ name: "styleAutomatic", dependencies: ["xml"], factory: function(xml) {
    const PROP_TAGS = {
      "style:paragraph-properties": "paragraph",
      "style:text-properties": "text",
      "style:table-properties": "table",
      "style:table-column-properties": "tableColumn",
      "style:table-row-properties": "tableRow",
      "style:table-cell-properties": "tableCell",
      "style:graphic-properties": "graphic"
    }, TAG_BY_PROP = Object.fromEntries(Object.entries(PROP_TAGS).map(([tag, key]) => [key, tag]));
    function parseStyle(el) {
      const a = el.attrs || {}, out = {
        name: a["style:name"] || "",
        family: a["style:family"] || "",
        properties: {}
      };
      if (a["style:parent-style-name"])
        out.parentStyleName = a["style:parent-style-name"];
      const known = new Set(["style:name", "style:family", "style:parent-style-name"]), xa = {};
      let anyAttr = !1;
      for (const k of Object.keys(a))
        if (!known.has(k)) {
          xa[k] = a[k];
          anyAttr = !0;
        }
      const xtraChildren = [];
      for (const c of el.children || []) {
        if (c.type !== "element")
          continue;
        const key = PROP_TAGS[c.name];
        if (key)
          out.properties[key] = { ...c.attrs || {} };
        else
          xtraChildren.push(c);
      }
      if (anyAttr || xtraChildren.length) {
        out._extras = {};
        if (anyAttr)
          out._extras.attrs = xa;
        if (xtraChildren.length)
          out._extras.children = xtraChildren;
      }
      return out;
    }
    function renderStyle(s) {
      const attrs = { "style:name": s.name || "", "style:family": s.family || "" };
      if (s.parentStyleName)
        attrs["style:parent-style-name"] = s.parentStyleName;
      if (s._extras && s._extras.attrs)
        for (const k of Object.keys(s._extras.attrs))
          attrs[k] = s._extras.attrs[k];
      const children = [];
      for (const key of Object.keys(s.properties || {})) {
        const tag = TAG_BY_PROP[key];
        if (!tag)
          continue;
        children.push(xml.el(tag, { ...s.properties[key] || {} }, []));
      }
      if (s._extras && s._extras.children)
        for (const c of s._extras.children)
          children.push(c);
      return xml.el("style:style", attrs, children);
    }
    function parse(containerEl) {
      const out = { styles: [] }, extras = [];
      for (const c of containerEl && containerEl.children || []) {
        if (c.type !== "element")
          continue;
        if (c.name === "style:style")
          out.styles.push(parseStyle(c));
        else
          extras.push(c);
      }
      if (extras.length)
        out._extras = { children: extras };
      return out;
    }
    function render(model) {
      const children = (model && model.styles || []).map(renderStyle);
      if (model && model._extras && model._extras.children)
        for (const c of model._extras.children)
          children.push(c);
      return xml.el("office:automatic-styles", {}, children);
    }
    function empty() {
      return { styles: [] };
    }
    return { parse, render, parseStyle, renderStyle, empty, PROP_TAGS };
  } });
    __register({ name: "textParagraph", dependencies: ["xml"], factory: function(xml) {
    const FLAGS = ["bold", "italic", "strike", "monospace"];
    function parseSpan(c, ctx, insideLink) {
      const r = { type: "span", value: xml.textContent(c) }, a = c.attrs || {}, sn = a["text:style-name"];
      let keepName = !!sn, res = null;
      if (sn && ctx && typeof ctx.textFlags === "function") {
        res = ctx.textFlags(sn);
        if (res && res.source === "auto")
          keepName = !1;
      }
      if (keepName)
        r.styleName = sn;
      if (res) {
        for (const f of FLAGS)
          if (res[f])
            r[f] = !0;
      }
      if ((c.children || []).some((k) => k.type === "element"))
        r.runs = parseInline(c.children, ctx, insideLink, !0).runs;
      const attrs = {};
      let anyAttr = !1;
      for (const k of Object.keys(a)) {
        if (k === "text:style-name")
          continue;
        attrs[k] = a[k];
        anyAttr = !0;
      }
      if (anyAttr)
        r._extras = { attrs };
      return r;
    }
    function parseLink(c, ctx) {
      const a = c && c.attrs || {}, r = { type: "link", href: a["xlink:href"] || "", runs: [] }, attrs = {};
      let anyAttr = !1;
      for (const k of Object.keys(a)) {
        if (k === "xlink:href")
          continue;
        if (k === "xlink:type" && a[k] === "simple")
          continue;
        attrs[k] = a[k];
        anyAttr = !0;
      }
      const inner = parseInline(c.children, ctx, !0);
      r.runs = inner.runs;
      if (anyAttr || inner.extras.length) {
        r._extras = {};
        if (anyAttr)
          r._extras.attrs = attrs;
        if (inner.extras.length)
          r._extras.children = inner.extras;
      }
      return r;
    }
    function parseInline(children, ctx, insideLink, positional) {
      const runs = [], extras = [];
      for (const c of children || [])
        if (c.type === "text")
          runs.push({ type: "text", value: c.value });
        else if (c.type === "element")
          if (c.name === "text:span")
            runs.push(parseSpan(c, ctx, insideLink));
          else if (c.name === "text:s") {
            const count = parseInt(c.attrs && c.attrs["text:c"] || "1", 10) || 1;
            runs.push({ type: "space", count });
          } else if (c.name === "text:tab")
            runs.push({ type: "tab" });
          else if (c.name === "text:line-break")
            runs.push({ type: "line-break" });
          else if (c.name === "text:a" && !insideLink)
            runs.push(parseLink(c, ctx));
          else if (positional)
            runs.push(c);
          else
            extras.push(c);
      return { runs, extras };
    }
    function parseParagraph(el, ctx) {
      const out = { type: "paragraph", runs: [] }, a = el && el.attrs || {}, styleName = a["text:style-name"];
      if (styleName)
        out.styleName = styleName;
      const attrs = {};
      let anyAttr = !1;
      for (const k of Object.keys(a)) {
        if (k === "text:style-name")
          continue;
        attrs[k] = a[k];
        anyAttr = !0;
      }
      const inline = parseInline(el.children, ctx);
      out.runs = inline.runs;
      if (anyAttr || inline.extras.length) {
        out._extras = {};
        if (anyAttr)
          out._extras.attrs = attrs;
        if (inline.extras.length)
          out._extras.children = inline.extras;
      }
      return out;
    }
    function renderParagraph(p, ctx) {
      const attrs = {};
      if (p.styleName)
        attrs["text:style-name"] = p.styleName;
      const extraAttrs = p._extras && p._extras.attrs || {};
      for (const k of Object.keys(extraAttrs)) {
        if (k === "text:style-name")
          continue;
        attrs[k] = extraAttrs[k];
      }
      const children = [];
      for (const r of p.runs || [])
        children.push(renderRun(r, ctx));
      if (p._extras && p._extras.children)
        for (const c of p._extras.children)
          children.push(c);
      return xml.el("text:p", attrs, children);
    }
    function renderRun(r, ctx) {
      switch (r.type) {
        case "text":
          return xml.text(r.value || "");
        case "span": {
          const a = {};
          if (r.styleName)
            a["text:style-name"] = r.styleName;
          else if ((r.bold || r.italic || r.strike || r.monospace) && ctx && typeof ctx.textStyle === "function")
            a["text:style-name"] = ctx.textStyle({
              bold: !!r.bold,
              italic: !!r.italic,
              strike: !!r.strike,
              monospace: !!r.monospace
            });
          const extraAttrs = r._extras && r._extras.attrs || {};
          for (const k of Object.keys(extraAttrs)) {
            if (k === "text:style-name")
              continue;
            a[k] = extraAttrs[k];
          }
          if (Array.isArray(r.runs)) {
            const children = [];
            for (const inner of r.runs)
              children.push(renderRun(inner, ctx));
            return xml.el("text:span", a, children);
          }
          return xml.el("text:span", a, [xml.text(r.value || "")]);
        }
        case "space": {
          const a = {};
          if (r.count && r.count > 1)
            a["text:c"] = String(r.count);
          return xml.el("text:s", a, []);
        }
        case "tab":
          return xml.el("text:tab", {}, []);
        case "line-break":
          return xml.el("text:line-break", {}, []);
        case "link": {
          const ex = r._extras || {}, a = {
            "xlink:type": "simple",
            "xlink:href": r.href || "",
            ...ex.attrs || {}
          }, children = [];
          for (const inner of r.runs || [])
            children.push(renderRun(inner, ctx));
          for (const c of ex.children || [])
            children.push(c);
          return xml.el("text:a", a, children);
        }
        case "image":
          return ctx && typeof ctx.renderImage === "function" ? ctx.renderImage(r) : xml.text("");
        case "element":
          return r;
        default:
          return xml.text("");
      }
    }
    function textOfRuns(runs) {
      const out = [];
      for (const r of runs || [])
        switch (r.type) {
          case "text":
            out.push(r.value || "");
            break;
          case "span":
            out.push(Array.isArray(r.runs) ? textOfRuns(r.runs) : r.value || "");
            break;
          case "space":
            out.push(" ".repeat(r.count || 1));
            break;
          case "tab":
            out.push("\t");
            break;
          case "line-break":
            out.push(`
`);
            break;
          case "link":
            out.push(textOfRuns(r.runs));
            break;
          case "element":
            out.push(xml.textContent(r));
            break;
        }
      return out.join("");
    }
    function textOf(p) {
      return textOfRuns(p.runs);
    }
    function paragraph(textValue, opts) {
      const p = { type: "paragraph", runs: [] };
      if (textValue != null)
        p.runs.push({ type: "text", value: String(textValue) });
      if (opts && opts.styleName)
        p.styleName = opts.styleName;
      return p;
    }
    return { parseParagraph, renderParagraph, textOf, paragraph, TEXT_NS: "urn:oasis:names:tc:opendocument:xmlns:text:1.0" };
  } });
    __register({ name: "odfWalker", dependencies: [], factory: function() {
    function createWalker(config) {
      const { recurseFields, typeHooks, rootField } = config, sidecars = config.sidecars || ["meta", "settings", "styles"], SIDECAR_HOOKS = {
        meta: "Metadata",
        settings: "Settings",
        styles: "Styles"
      }, _exts = [];
      let _index = null;
      function use(...extensions) {
        for (const ext of extensions)
          if (ext && !_exts.includes(ext))
            _exts.push(ext);
        _index = null;
      }
      function indexHook(name) {
        if (!_index)
          _index = Object.create(null);
        let arr = _index[name];
        if (arr)
          return arr;
        arr = [];
        for (const ext of _exts) {
          const fn = ext[name];
          if (typeof fn === "function")
            arr.push(fn.bind(ext));
        }
        _index[name] = arr;
        return arr;
      }
      function applyHook(name, value) {
        if (value == null)
          return value;
        const fns = indexHook(name);
        for (let i = 0;i < fns.length; i++) {
          const r = fns[i](value);
          if (r !== void 0)
            value = r;
        }
        return value;
      }
      function visitNode(node, phase) {
        if (!node || typeof node !== "object")
          return node;
        if (Array.isArray(node)) {
          for (let i = 0;i < node.length; i++) {
            const r = visitNode(node[i], phase);
            if (r !== void 0)
              node[i] = r;
          }
          return node;
        }
        for (let i = 0;i < recurseFields.length; i++) {
          const f = recurseFields[i];
          if (node[f])
            visitNode(node[f], phase);
        }
        const suffix = typeHooks[node.type];
        if (suffix)
          return applyHook((phase === "hydrate" ? "hydrate" : "dehydrate") + suffix, node);
        return node;
      }
      function applyExtensions(result, phase) {
        if (!_exts.length)
          return;
        if (result[rootField])
          visitNode(result[rootField], phase);
        for (let i = 0;i < sidecars.length; i++) {
          const k = sidecars[i];
          if (!result[k])
            continue;
          const suffix = SIDECAR_HOOKS[k] || k.charAt(0).toUpperCase() + k.slice(1), r = applyHook((phase === "hydrate" ? "hydrate" : "dehydrate") + suffix, result[k]);
          if (r !== void 0)
            result[k] = r;
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
    __register({ name: "odsWalker", dependencies: ["odfWalker"], factory: function(shared) {
    const CONFIG = {
      rootField: "spreadsheet",
      recurseFields: ["tables", "rows", "cells", "children", "frames", "spans"],
      typeHooks: {
        paragraph: "Paragraph",
        span: "Span",
        table: "Table",
        cell: "Cell",
        frame: "Frame"
      }
    };
    function createWalker() {
      return shared.createWalker(CONFIG);
    }
    return { createWalker };
  } });
    __register({ name: "ods", dependencies: ["odfErrors","odfShared","pkgPackage","xml","pkgMimetype","pkgManifest","odfMeta","odfSettings","odfStyles","spreadsheet","styleAutomatic","tableTable","tableRow","tableCell","textParagraph","odsWalker"], factory: function(errors, shared, pkg, xml, mimetypeMod, manifestMod, metaMod, settingsMod, stylesMod, spreadsheetMod, automaticMod, tableMod, rowMod, cellMod, paraMod, walkerMod) {
    const { ParseError, ContractError } = errors, {
      ODF_NS,
      ODF_VERSION,
      CT,
      encodeText,
      parseXmlOrThrow,
      readSidecars,
      writeSidecars,
      carryParts,
      sourceNamespaces,
      declareNamespaces
    } = shared, CT_ODS = CT.ODS, CT_XML = CT.XML, walker = walkerMod.createWalker();
    function read(bytes, opts) {
      const p = pkg.read(bytes, opts);
      if (p.mimetype !== CT_ODS)
        throw new ParseError("odf/parse-error/ods", `ods: unexpected mimetype "${p.mimetype}"`, { context: { expected: CT_ODS, module: "ods" } });
      const contentBytes = p.parts["content.xml"];
      if (!contentBytes)
        throw new ParseError("odf/parse-error/ods", "ods: missing content.xml", { context: { part: "content.xml", module: "ods" } });
      const parsed = parseContent(shared.decodeText(contentBytes)), result = {
        mimetype: p.mimetype,
        spreadsheet: parsed.spreadsheet,
        package: p
      };
      if (parsed.automaticStyles)
        result.automaticStyles = parsed.automaticStyles;
      readSidecars(result, p, { metaMod, settingsMod, stylesMod });
      walker.applyHydrate(result);
      return result;
    }
    function parseContent(xmlString) {
      const root = parseXmlOrThrow(xmlString, "ods", { part: "content.xml", module: "ods" });
      if (root.name !== "office:document-content")
        throw new ParseError("odf/parse-error/ods", `ods: unexpected content root <${root.name}>`, { context: { part: "content.xml", module: "ods" } });
      const autoEl = xml.findChild(root, "office:automatic-styles"), bodyEl = xml.findChild(root, "office:body");
      if (!bodyEl)
        throw new ParseError("odf/parse-error/ods", "ods: missing <office:body> in content.xml", { context: { part: "content.xml", module: "ods" } });
      const ssEl = xml.findChild(bodyEl, "office:spreadsheet"), out = { spreadsheet: ssEl ? spreadsheetMod.parseSpreadsheet(ssEl) : spreadsheetMod.empty() };
      if (autoEl)
        out.automaticStyles = automaticMod.parse(autoEl);
      return out;
    }
    function write(doc, opts) {
      if (!doc)
        throw new ContractError("odf/contract-error/ods", "ods: write needs a document", { context: { module: "ods", argument: "doc" } });
      opts = opts || {};
      if (walker.hasExtensions) {
        const dehydrated = {
          spreadsheet: doc.spreadsheet,
          meta: opts.meta || doc.meta,
          settings: opts.settings || doc.settings,
          styles: opts.styles || doc.styles
        };
        walker.applyDehydrate(dehydrated);
        if (dehydrated.spreadsheet !== void 0)
          doc = { ...doc, spreadsheet: dehydrated.spreadsheet };
        if (dehydrated.meta !== void 0)
          opts = { ...opts, meta: dehydrated.meta };
        if (dehydrated.settings !== void 0)
          opts = { ...opts, settings: dehydrated.settings };
        if (dehydrated.styles !== void 0)
          opts = { ...opts, styles: dehydrated.styles };
      }
      const p = pkg.empty(CT_ODS), contentXml = renderContent(doc);
      pkg.setPart(p, "content.xml", encodeText(contentXml), CT_XML);
      writeSidecars(p, doc, opts, { pkg, metaMod, settingsMod, stylesMod }, CT_XML);
      carryParts(p, doc.package, { pkg, manifestMod });
      return pkg.write(p);
    }
    function renderContent(doc) {
      const sheet = doc.spreadsheet || { tables: doc.tables || [] }, ssEl = spreadsheetMod.renderSpreadsheet(sheet), bodyEl = xml.el("office:body", {}, [ssEl]), children = [];
      if (doc.automaticStyles)
        children.push(automaticMod.render(doc.automaticStyles));
      children.push(bodyEl);
      const root = xml.el("office:document-content", {
        "xmlns:office": ODF_NS.OFFICE,
        "xmlns:text": ODF_NS.TEXT,
        "xmlns:style": ODF_NS.STYLE,
        "xmlns:table": ODF_NS.TABLE,
        "xmlns:draw": ODF_NS.DRAW,
        "xmlns:fo": ODF_NS.FO,
        "xmlns:svg": ODF_NS.SVG,
        "xmlns:number": ODF_NS.NUMBER,
        "xmlns:of": ODF_NS.OF,
        "xmlns:xlink": ODF_NS.XLINK,
        "office:version": ODF_VERSION
      }, children);
      declareNamespaces(root, {
        carried: sourceNamespaces(doc.package, "content.xml"),
        part: "content.xml",
        module: "ods"
      });
      return xml.serialize(root);
    }
    function empty() {
      return { spreadsheet: { tables: [sheet("Sheet1", [])] } };
    }
    function sheet(name, rows) {
      const out = { type: "table", name, columns: [], rows: [] };
      for (const r of rows || [])
        out.rows.push({ type: "row", cells: (r || []).map((v) => cell(v)) });
      return out;
    }
    function fromArrays(sheets) {
      const tables = [];
      for (const s of sheets || [])
        if (s && s.type === "table")
          tables.push(s);
        else if (s)
          tables.push(sheet(s.name || "Sheet", s.rows || []));
      return { spreadsheet: { tables } };
    }
    function cell(value, opts) {
      if (value && typeof value === "object" && value.type === "cell")
        return value;
      opts = opts || {};
      const c = { type: "cell", children: [] };
      if (value == null || value === "")
        return c;
      if (typeof value === "number" && Number.isFinite(value)) {
        c.valueType = "float";
        c.value = String(value);
        c.children.push(paraMod.renderParagraph(paraMod.paragraph(String(value))));
      } else if (typeof value === "boolean") {
        c.valueType = "boolean";
        c.value = value ? "true" : "false";
        c.children.push(paraMod.renderParagraph(paraMod.paragraph(value ? "TRUE" : "FALSE")));
      } else if (value instanceof Date) {
        c.valueType = "date";
        c.value = value.toISOString().slice(0, 19);
        c.children.push(paraMod.renderParagraph(paraMod.paragraph(c.value)));
      } else {
        c.valueType = "string";
        c.value = String(value);
        c.children.push(paraMod.renderParagraph(paraMod.paragraph(String(value))));
      }
      if (opts.styleName)
        c.styleName = opts.styleName;
      if (opts.formula)
        c.formula = opts.formula;
      return c;
    }
    function toText(doc) {
      const lines = [], tables = doc && doc.spreadsheet && doc.spreadsheet.tables || [];
      for (const t of tables)
        for (const r of t.rows || []) {
          const cells = (r.cells || []).map((c) => c.value != null ? String(c.value) : "");
          lines.push(cells.join("\t"));
        }
      return lines.join(`
`);
    }
    const api = {
      read,
      write,
      empty,
      sheet,
      fromArrays,
      cell,
      toText,
      CT_ODS,
      use(...extensions) {
        walker.use(...extensions);
        return api;
      },
      get hasExtensions() {
        return walker.hasExtensions;
      }
    };
    return api;
  } });
    __register({ name: "tableAdvanced", dependencies: ["xml"], factory: function(xml) {
    const ADV_NAMES = new Set([
      "table:table-template",
      "table:database-range",
      "table:database-source-query",
      "table:database-source-sql",
      "table:database-source-table",
      "table:filter",
      "table:filter-and",
      "table:filter-or",
      "table:filter-condition",
      "table:filter-set-item",
      "table:scenario",
      "table:sort",
      "table:sort-by",
      "table:sort-groups",
      "table:subtotal-rules",
      "table:subtotal-rule",
      "table:subtotal-field",
      "table:cell-range-source",
      "table:cell-content-change",
      "table:data-pilot-table",
      "table:data-pilot-field",
      "table:data-pilot-member",
      "table:data-pilot-members",
      "table:data-pilot-level",
      "table:data-pilot-display-info",
      "table:data-pilot-sort-info",
      "table:data-pilot-layout-info",
      "table:data-pilot-field-reference",
      "table:data-pilot-group",
      "table:data-pilot-group-member",
      "table:data-pilot-groups",
      "table:data-pilot-subtotal",
      "table:data-pilot-subtotals"
    ]);
    function parseNode(el) {
      const out = { kind: el.name, attrs: { ...el.attrs || {} }, children: [] };
      for (const c of el.children || []) {
        if (c.type !== "element")
          continue;
        out.children.push(parseNode(c));
      }
      return out;
    }
    function renderNode(n) {
      const kids = (n.children || []).map(renderNode);
      return xml.el(n.kind, { ...n.attrs || {} }, kids);
    }
    function isAdvancedName(name) {
      return ADV_NAMES.has(name);
    }
    function hydrateTable(t) {
      if (!t || !t._extras)
        return t;
      const extras = Array.isArray(t._extras) ? t._extras : t._extras.children || [];
      if (!extras.length)
        return t;
      const remaining = [], adv = t.advanced || [];
      for (const c of extras)
        if (c && c.type === "element" && ADV_NAMES.has(c.name))
          adv.push(parseNode(c));
        else
          remaining.push(c);
      if (adv.length)
        t.advanced = adv;
      if (Array.isArray(t._extras))
        if (remaining.length)
          t._extras = remaining;
        else
          delete t._extras;
      else {
        if (remaining.length)
          t._extras.children = remaining;
        else
          delete t._extras.children;
        if (!Object.keys(t._extras).length)
          delete t._extras;
      }
      return t;
    }
    function dehydrateTable(t) {
      if (!t || !t.advanced || !t.advanced.length)
        return t;
      const out = { ...t }, extras = Array.isArray(out._extras) ? [...out._extras] : out._extras && Array.isArray(out._extras.children) ? [...out._extras.children] : [];
      for (const a of out.advanced)
        extras.push(renderNode(a));
      delete out.advanced;
      if (Array.isArray(t._extras) || !t._extras)
        out._extras = extras;
      else
        out._extras = { ...t._extras, children: extras };
      return out;
    }
    return {
      parseNode,
      renderNode,
      isAdvancedName,
      hydrateTable,
      dehydrateTable,
      ADV_NAMES
    };
  } });
    __register({ name: "stylePage", dependencies: ["xml"], factory: function(xml) {
    const PAGE_NAMES = new Set([
      "style:page-layout",
      "style:master-page"
    ]), PAGE_CHILDREN = new Set([
      "style:page-layout-properties",
      "style:header-style",
      "style:footer-style",
      "style:header",
      "style:footer",
      "style:header-left",
      "style:footer-left",
      "style:header-first",
      "style:footer-first",
      "style:background-image",
      "style:column",
      "style:columns",
      "style:column-sep",
      "style:footnote-sep",
      "style:layout-grid-properties"
    ]);
    function parseNode(el) {
      const out = {
        kind: el.name,
        attrs: { ...el.attrs || {} },
        children: []
      };
      for (const c of el.children || []) {
        if (c.type !== "element")
          continue;
        out.children.push(parseNode(c));
      }
      return out;
    }
    function renderNode(n) {
      const kids = (n.children || []).map(renderNode);
      return xml.el(n.kind, { ...n.attrs || {} }, kids);
    }
    function isPageName(name) {
      return PAGE_NAMES.has(name) || PAGE_CHILDREN.has(name);
    }
    function hydrateStyles(styles) {
      if (!styles)
        return styles;
      const containers = ["styles", "automaticStyles", "masterStyles"];
      for (const k of containers) {
        if (!Array.isArray(styles[k]))
          continue;
        const remaining = [], pages = styles.pageLayouts || [], masters = styles.masterPages || [];
        for (const s of styles[k]) {
          if (!s || s.type !== "element") {
            remaining.push(s);
            continue;
          }
          if (s.name === "style:page-layout")
            pages.push(parseNode(s));
          else if (s.name === "style:master-page")
            masters.push(parseNode(s));
          else
            remaining.push(s);
        }
        if (pages.length)
          styles.pageLayouts = pages;
        if (masters.length)
          styles.masterPages = masters;
        styles[k] = remaining;
      }
      if (Array.isArray(styles._extras)) {
        const remaining = [], pages = styles.pageLayouts || [], masters = styles.masterPages || [];
        for (const s of styles._extras) {
          if (!s || s.type !== "element") {
            remaining.push(s);
            continue;
          }
          if (s.name === "style:page-layout")
            pages.push(parseNode(s));
          else if (s.name === "style:master-page")
            masters.push(parseNode(s));
          else
            remaining.push(s);
        }
        if (pages.length)
          styles.pageLayouts = pages;
        if (masters.length)
          styles.masterPages = masters;
        if (remaining.length)
          styles._extras = remaining;
        else
          delete styles._extras;
      }
      return styles;
    }
    function dehydrateStyles(styles) {
      if (!styles)
        return styles;
      if ((!styles.pageLayouts || !styles.pageLayouts.length) && (!styles.masterPages || !styles.masterPages.length))
        return styles;
      const out = { ...styles }, extras = Array.isArray(out._extras) ? [...out._extras] : [];
      for (const p of out.pageLayouts || [])
        extras.push(renderNode(p));
      for (const m of out.masterPages || [])
        extras.push(renderNode(m));
      delete out.pageLayouts;
      delete out.masterPages;
      if (extras.length)
        out._extras = extras;
      return out;
    }
    return {
      parseNode,
      renderNode,
      isPageName,
      hydrateStyles,
      dehydrateStyles,
      PAGE_NAMES,
      PAGE_CHILDREN
    };
  } });
    __register({ name: "stylePropertiesTyped", dependencies: ["xml"], factory: function(xml) {
    const PROPS_NAMES = new Set([
      "style:paragraph-properties",
      "style:text-properties",
      "style:graphic-properties",
      "style:section-properties",
      "style:ruby-properties",
      "style:table-properties",
      "style:table-column-properties",
      "style:table-row-properties",
      "style:table-cell-properties",
      "style:chart-properties",
      "style:drawing-page-properties",
      "style:list-level-properties",
      "style:list-level-label-alignment",
      "style:tab-stops",
      "style:tab-stop"
    ]), ATTR_MAP = {
      "fo:font-family": "fontFamily",
      "fo:font-size": "fontSize",
      "fo:font-weight": "fontWeight",
      "fo:font-style": "fontStyle",
      "fo:color": "color",
      "fo:background-color": "backgroundColor",
      "fo:text-align": "textAlign",
      "fo:margin-left": "marginLeft",
      "fo:margin-right": "marginRight",
      "fo:margin-top": "marginTop",
      "fo:margin-bottom": "marginBottom",
      "fo:padding": "padding",
      "fo:line-height": "lineHeight",
      "fo:break-before": "breakBefore",
      "fo:break-after": "breakAfter",
      "style:font-name": "fontName",
      "style:writing-mode": "writingMode",
      "style:column-width": "columnWidth",
      "style:row-height": "rowHeight",
      "svg:width": "width",
      "svg:height": "height"
    }, REVERSE_MAP = {};
    for (const k of Object.keys(ATTR_MAP))
      REVERSE_MAP[ATTR_MAP[k]] = k;
    function parseProperties(el) {
      const out = { kind: el.name, attrs: {} };
      for (const k of Object.keys(el.attrs || {}))
        if (ATTR_MAP[k])
          out[ATTR_MAP[k]] = el.attrs[k];
        else
          out.attrs[k] = el.attrs[k];
      const subs = [];
      for (const c of el.children || []) {
        if (c.type !== "element")
          continue;
        if (PROPS_NAMES.has(c.name))
          subs.push(parseProperties(c));
        else
          subs.push(c);
      }
      if (subs.length)
        out.children = subs;
      return out;
    }
    function renderProperties(p) {
      const attrs = { ...p.attrs || {} };
      for (const k of Object.keys(REVERSE_MAP))
        if (p[k] != null)
          attrs[REVERSE_MAP[k]] = String(p[k]);
      const kids = [];
      for (const c of p.children || [])
        if (c && c.kind)
          kids.push(renderProperties(c));
        else
          kids.push(c);
      return xml.el(p.kind, attrs, kids);
    }
    function walkStyleNode(s) {
      if (!s || s.type !== "element")
        return s;
      const kids = s.children || [], out = { ...s, children: [] };
      let mutated = !1;
      for (const c of kids)
        if (c.type === "element" && PROPS_NAMES.has(c.name)) {
          out.children.push(parseProperties(c));
          mutated = !0;
        } else
          out.children.push(c);
      return mutated ? out : s;
    }
    function emitStyleNode(s) {
      if (!s || s.type !== "element")
        return s;
      const kids = s.children || [], out = { ...s, children: [] };
      let mutated = !1;
      for (const c of kids)
        if (c && c.kind && PROPS_NAMES.has(c.kind)) {
          out.children.push(renderProperties(c));
          mutated = !0;
        } else
          out.children.push(c);
      return mutated ? out : s;
    }
    function hydrateStyles(styles) {
      if (!styles)
        return styles;
      for (const k of ["styles", "automaticStyles", "masterStyles"]) {
        if (!Array.isArray(styles[k]))
          continue;
        styles[k] = styles[k].map(walkStyleNode);
      }
      return styles;
    }
    function dehydrateStyles(styles) {
      if (!styles)
        return styles;
      const out = { ...styles };
      for (const k of ["styles", "automaticStyles", "masterStyles"]) {
        if (!Array.isArray(out[k]))
          continue;
        out[k] = out[k].map(emitStyleNode);
      }
      return out;
    }
    return {
      parseProperties,
      renderProperties,
      hydrateStyles,
      dehydrateStyles,
      PROPS_NAMES,
      ATTR_MAP
    };
  } });
    __register({ name: "drawShapes", dependencies: ["xml"], factory: function(xml) {
    const SHAPE_NAMES = new Set([
      "draw:rect",
      "draw:circle",
      "draw:ellipse",
      "draw:line",
      "draw:polyline",
      "draw:polygon",
      "draw:path",
      "draw:regular-polygon",
      "draw:connector",
      "draw:caption",
      "draw:measure",
      "draw:control",
      "draw:custom-shape",
      "draw:contour-polygon",
      "draw:contour-path"
    ]);
    function parseEnhanced(el) {
      const out = { attrs: { ...el.attrs || {} }, equations: [], handles: [] };
      for (const c of el.children || []) {
        if (c.type !== "element")
          continue;
        if (c.name === "draw:equation")
          out.equations.push({ attrs: { ...c.attrs || {} } });
        else if (c.name === "draw:handle")
          out.handles.push({ attrs: { ...c.attrs || {} } });
      }
      return out;
    }
    function renderEnhanced(e) {
      const kids = [];
      for (const q of e.equations || [])
        kids.push(xml.el("draw:equation", { ...q.attrs || {} }));
      for (const h of e.handles || [])
        kids.push(xml.el("draw:handle", { ...h.attrs || {} }));
      return xml.el("draw:enhanced-geometry", { ...e.attrs || {} }, kids);
    }
    function parseShape(el) {
      const out = {
        type: "shape-ext",
        kind: el.name,
        attrs: { ...el.attrs || {} },
        children: []
      };
      for (const c of el.children || []) {
        if (c.type !== "element") {
          out.children.push(c);
          continue;
        }
        if (c.name === "draw:enhanced-geometry")
          out.enhancedGeometry = parseEnhanced(c);
        else
          out.children.push(c);
      }
      if (!out.children.length)
        delete out.children;
      return out;
    }
    function renderShape(s) {
      const kids = [];
      if (s.enhancedGeometry)
        kids.push(renderEnhanced(s.enhancedGeometry));
      for (const c of s.children || [])
        kids.push(c);
      return xml.el(s.kind, { ...s.attrs || {} }, kids);
    }
    function isShapeName(name) {
      return SHAPE_NAMES.has(name);
    }
    function hydrateFrame(f) {
      if (!f || !f._extras)
        return f;
      const extras = Array.isArray(f._extras) ? f._extras : f._extras.children || [];
      if (!extras.length)
        return f;
      const remaining = [], shapes = f.shapes || [];
      for (const c of extras)
        if (c && c.type === "element" && SHAPE_NAMES.has(c.name))
          shapes.push(parseShape(c));
        else
          remaining.push(c);
      if (shapes.length)
        f.shapes = shapes;
      if (Array.isArray(f._extras))
        if (remaining.length)
          f._extras = remaining;
        else
          delete f._extras;
      else {
        if (remaining.length)
          f._extras.children = remaining;
        else
          delete f._extras.children;
        if (!Object.keys(f._extras).length)
          delete f._extras;
      }
      return f;
    }
    function dehydrateFrame(f) {
      if (!f || !f.shapes || !f.shapes.length)
        return f;
      const out = { ...f }, extras = Array.isArray(out._extras) ? [...out._extras] : out._extras && Array.isArray(out._extras.children) ? [...out._extras.children] : [];
      for (const s of out.shapes)
        extras.push(renderShape(s));
      delete out.shapes;
      if (Array.isArray(f._extras) || !f._extras)
        out._extras = extras;
      else
        out._extras = { ...f._extras, children: extras };
      return out;
    }
    return {
      parseShape,
      renderShape,
      isShapeName,
      parseEnhanced,
      renderEnhanced,
      hydrateFrame,
      dehydrateFrame,
      SHAPE_NAMES
    };
  } });
    __register({ name: "textFieldsExtended", dependencies: ["xml"], factory: function(xml) {
    const EXT_FIELDS = new Set([
      "text:variable-decl",
      "text:variable-set",
      "text:variable-get",
      "text:user-field-decl",
      "text:user-field-get",
      "text:user-field-input",
      "text:sequence-decl",
      "text:expression",
      "text:database-display",
      "text:database-next",
      "text:database-row-select",
      "text:database-row-number",
      "text:database-name",
      "text:hidden-paragraph",
      "text:hidden-text",
      "text:conditional-text",
      "text:placeholder",
      "text:execute-macro",
      "text:dde-connection",
      "text:dde-connection-decl",
      "text:meta-field"
    ]);
    function isExtendedFieldName(name) {
      return EXT_FIELDS.has(name);
    }
    function parseField(el) {
      const out = { type: "field-ext", kind: el.name.replace(/^text:/, ""), attrs: { ...el.attrs || {} } }, value = xml.textContent(el);
      if (value)
        out.value = value;
      const childEls = [];
      for (const c of el.children || [])
        if (c.type === "element")
          childEls.push(c);
      if (childEls.length)
        out._extras = { children: childEls };
      return out;
    }
    function renderField(f) {
      const name = `text:${f.kind}`, kids = [];
      if (f.value != null && f.value !== "")
        kids.push(xml.text(String(f.value)));
      if (f._extras && f._extras.children)
        for (const c of f._extras.children)
          kids.push(c);
      return xml.el(name, { ...f.attrs || {} }, kids);
    }
    function hydrateParagraph(p) {
      if (!p || !p._extras)
        return p;
      const extras = Array.isArray(p._extras) ? p._extras : p._extras.children || [];
      if (!extras.length)
        return p;
      const remaining = [], promoted = p.fields || [];
      for (const c of extras)
        if (c && c.type === "element" && EXT_FIELDS.has(c.name))
          promoted.push(parseField(c));
        else
          remaining.push(c);
      if (promoted.length)
        p.fields = promoted;
      if (Array.isArray(p._extras))
        if (remaining.length)
          p._extras = remaining;
        else
          delete p._extras;
      else {
        if (remaining.length)
          p._extras.children = remaining;
        else
          delete p._extras.children;
        if (!Object.keys(p._extras).length)
          delete p._extras;
      }
      return p;
    }
    function dehydrateParagraph(p) {
      if (!p || !p.fields || !p.fields.length)
        return p;
      const out = { ...p }, extras = Array.isArray(out._extras) ? [...out._extras] : out._extras && Array.isArray(out._extras.children) ? [...out._extras.children] : [];
      for (const f of out.fields)
        extras.push(renderField(f));
      delete out.fields;
      if (Array.isArray(p._extras) || !p._extras)
        out._extras = extras;
      else
        out._extras = { ...p._extras, children: extras };
      return out;
    }
    return {
      isExtendedFieldName,
      parseField,
      renderField,
      hydrateParagraph,
      dehydrateParagraph,
      EXT_FIELDS
    };
  } });
    __register({ name: "textListDetailed", dependencies: ["xml"], factory: function(xml) {
    const LIST_STYLE_NAMES = new Set([
      "text:list-style",
      "text:outline-style"
    ]), LEVEL_KIND = {
      "text:list-level-style-number": "level-number",
      "text:list-level-style-bullet": "level-bullet",
      "text:list-level-style-image": "level-image",
      "text:outline-level-style": "level-outline"
    }, LEVEL_KIND_TO_TAG = {
      "level-number": "text:list-level-style-number",
      "level-bullet": "text:list-level-style-bullet",
      "level-image": "text:list-level-style-image",
      "level-outline": "text:outline-level-style"
    };
    function parseLevel(el) {
      const out = {
        type: LEVEL_KIND[el.name] || "level-other",
        attrs: { ...el.attrs || {} }
      }, props = [];
      for (const c of el.children || []) {
        if (c.type !== "element")
          continue;
        props.push(c);
      }
      if (props.length)
        out._extras = { children: props };
      return out;
    }
    function renderLevel(lvl) {
      const tag = LEVEL_KIND_TO_TAG[lvl.type] || "text:list-level-style-number", kids = lvl._extras && lvl._extras.children || [];
      return xml.el(tag, { ...lvl.attrs || {} }, kids);
    }
    function parseListStyle(el) {
      const out = {
        type: el.name === "text:outline-style" ? "outline-style" : "list-style",
        name: el.attrs && (el.attrs["style:name"] || el.attrs["style:display-name"]) || "",
        attrs: { ...el.attrs || {} },
        levels: []
      };
      for (const c of el.children || []) {
        if (c.type !== "element")
          continue;
        if (LEVEL_KIND[c.name])
          out.levels.push(parseLevel(c));
      }
      return out;
    }
    function renderListStyle(ls) {
      const tag = ls.type === "outline-style" ? "text:outline-style" : "text:list-style", kids = (ls.levels || []).map(renderLevel);
      return xml.el(tag, { ...ls.attrs || {} }, kids);
    }
    function parseListHeader(el) {
      const out = { type: "list-header", attrs: { ...el.attrs || {} }, children: [] };
      for (const c of el.children || [])
        if (c.type === "element")
          out.children.push(c);
      return out;
    }
    function renderListHeader(h) {
      return xml.el("text:list-header", { ...h.attrs || {} }, h.children || []);
    }
    function hydrateStyles(styles) {
      if (!styles)
        return styles;
      const containers = ["styles", "automaticStyles", "masterStyles"];
      for (const k of containers) {
        if (!Array.isArray(styles[k]))
          continue;
        const remaining = [], listStyles = styles.listStyles || [];
        for (const s of styles[k])
          if (s && s.type === "element" && LIST_STYLE_NAMES.has(s.name))
            listStyles.push(parseListStyle(s));
          else
            remaining.push(s);
        if (listStyles.length)
          styles.listStyles = listStyles;
        styles[k] = remaining;
      }
      if (Array.isArray(styles._extras)) {
        const remaining = [], listStyles = styles.listStyles || [];
        for (const s of styles._extras)
          if (s && s.type === "element" && LIST_STYLE_NAMES.has(s.name))
            listStyles.push(parseListStyle(s));
          else
            remaining.push(s);
        if (listStyles.length)
          styles.listStyles = listStyles;
        if (remaining.length)
          styles._extras = remaining;
        else
          delete styles._extras;
      }
      return styles;
    }
    function dehydrateStyles(styles) {
      if (!styles || !styles.listStyles || !styles.listStyles.length)
        return styles;
      const out = { ...styles }, extras = Array.isArray(out._extras) ? [...out._extras] : [];
      for (const ls of out.listStyles)
        extras.push(renderListStyle(ls));
      delete out.listStyles;
      if (extras.length)
        out._extras = extras;
      return out;
    }
    function hydrateList(list) {
      if (!list || !list._extras)
        return list;
      const extras = Array.isArray(list._extras) ? list._extras : list._extras.children || [];
      if (!extras.length)
        return list;
      const remaining = [], headers = list.headers || [];
      for (const c of extras)
        if (c && c.type === "element" && c.name === "text:list-header")
          headers.push(parseListHeader(c));
        else
          remaining.push(c);
      if (headers.length)
        list.headers = headers;
      if (Array.isArray(list._extras))
        if (remaining.length)
          list._extras = remaining;
        else
          delete list._extras;
      return list;
    }
    function dehydrateList(list) {
      if (!list || !list.headers || !list.headers.length)
        return list;
      const out = { ...list }, extras = Array.isArray(out._extras) ? [...out._extras] : [];
      for (const h of out.headers)
        extras.push(renderListHeader(h));
      delete out.headers;
      out._extras = extras;
      return out;
    }
    return {
      parseListStyle,
      renderListStyle,
      parseLevel,
      renderLevel,
      parseListHeader,
      renderListHeader,
      hydrateStyles,
      dehydrateStyles,
      hydrateList,
      dehydrateList,
      LIST_STYLE_NAMES,
      LEVEL_KIND
    };
  } });
    __register({ name: "odfTypedHelper", dependencies: ["xml"], factory: function(xml) {
    function build(elementNames, ns, typeTag, opts) {
      const passthrough = !!(opts && opts.passthrough);
      function parseElement(el) {
        if (!el || el.type !== "element" || !elementNames.has(el.name))
          return null;
        const kids = [];
        for (const c of el.children || [])
          if (c && c.type === "element" && elementNames.has(c.name))
            kids.push(parseElement(c));
          else
            kids.push(c);
        const kind = el.name.startsWith(ns) ? el.name.slice(ns.length) : el.name, out = { type: typeTag, kind, attrs: { ...el.attrs || {} } };
        if (passthrough)
          out._passthrough = !0;
        if (kids.length)
          out.children = kids;
        return out;
      }
      function renderElement(obj) {
        if (!obj || obj.kind == null)
          return null;
        const name = obj.kind.includes(":") ? obj.kind : ns + obj.kind, kids = [];
        for (const c of obj.children || [])
          if (c && c.type === typeTag)
            kids.push(renderElement(c));
          else
            kids.push(c);
        return xml.el(name, { ...obj.attrs || {} }, kids);
      }
      function isCovered(name) {
        return elementNames.has(name);
      }
      return { parseElement, renderElement, isCovered, ELEMENTS: elementNames };
    }
    return {
      buildTypedFamily(elementNames, ns, typeTag, opts) {
        return build(elementNames, ns, typeTag, opts);
      }
    };
  } });
    __register({ name: "animationsSmil", dependencies: ["xml","odfTypedHelper"], factory: function(xml, odfTypedHelper) {
    const ELEMENTS = new Set([
      "anim:par",
      "anim:seq",
      "anim:iterate",
      "anim:audio",
      "anim:command",
      "anim:set",
      "anim:animate",
      "anim:animateColor",
      "anim:animate-color",
      "anim:animateMotion",
      "anim:animate-motion",
      "anim:animateTransform",
      "anim:animate-transform",
      "anim:transitionFilter",
      "anim:transition-filter",
      "anim:param"
    ]), f = odfTypedHelper.buildTypedFamily(ELEMENTS, "anim:", "anim-node");
    function parseAnim(el) {
      return f.parseElement(el);
    }
    function renderAnim(obj) {
      return f.renderElement(obj);
    }
    function hydrateSlide(slide) {
      if (!slide || !slide._extras)
        return slide;
      const extras = Array.isArray(slide._extras) ? slide._extras : slide._extras.children || [], remaining = [], promoted = slide.animations || [];
      for (const c of extras)
        if (c && c.type === "element" && ELEMENTS.has(c.name))
          promoted.push(parseAnim(c));
        else
          remaining.push(c);
      if (promoted.length)
        slide.animations = promoted;
      if (Array.isArray(slide._extras))
        if (remaining.length)
          slide._extras = remaining;
        else
          delete slide._extras;
      else {
        if (remaining.length)
          slide._extras.children = remaining;
        else
          delete slide._extras.children;
        if (!Object.keys(slide._extras).length)
          delete slide._extras;
      }
      return slide;
    }
    function dehydrateSlide(slide) {
      if (!slide || !slide.animations || !slide.animations.length)
        return slide;
      const out = { ...slide }, extras = Array.isArray(out._extras) ? [...out._extras] : out._extras && Array.isArray(out._extras.children) ? [...out._extras.children] : [];
      for (const a of out.animations)
        if (a && a.type === "anim-node")
          extras.push(renderAnim(a));
      delete out.animations;
      if (Array.isArray(slide._extras) || !slide._extras)
        out._extras = extras;
      else
        out._extras = { ...slide._extras, children: extras };
      return out;
    }
    return { ...f, parseAnim, renderAnim, hydrateSlide, dehydrateSlide };
  } });
    __register({ name: "chartTyped", dependencies: ["xml","odfTypedHelper"], factory: function(xml, odfTypedHelper) {
    const ELEMENTS = new Set([
      "chart:chart",
      "chart:title",
      "chart:subtitle",
      "chart:footer",
      "chart:legend",
      "chart:plot-area",
      "chart:axis",
      "chart:categories",
      "chart:grid",
      "chart:series",
      "chart:domain",
      "chart:data-point",
      "chart:mean-value",
      "chart:regression-curve",
      "chart:error-indicator",
      "chart:stock-gain-marker",
      "chart:stock-loss-marker",
      "chart:stock-range-line",
      "chart:wall",
      "chart:floor",
      "chart:label-separator",
      "chart:equation",
      "chart:data-label"
    ]), f = odfTypedHelper.buildTypedFamily(ELEMENTS, "chart:", "chart-node");
    function parseChart(el) {
      return f.parseElement(el);
    }
    function renderChart(obj) {
      return f.renderElement(obj);
    }
    function hydrateChart(c) {
      if (!c || !c._extras)
        return c;
      const extras = Array.isArray(c._extras) ? c._extras : c._extras.children || [], remaining = [], promoted = c.chartNodes || [];
      for (const e of extras)
        if (e && e.type === "element" && ELEMENTS.has(e.name))
          promoted.push(f.parseElement(e));
        else
          remaining.push(e);
      if (promoted.length)
        c.chartNodes = promoted;
      if (Array.isArray(c._extras))
        if (remaining.length)
          c._extras = remaining;
        else
          delete c._extras;
      else {
        if (remaining.length)
          c._extras.children = remaining;
        else
          delete c._extras.children;
        if (!Object.keys(c._extras).length)
          delete c._extras;
      }
      return c;
    }
    function dehydrateChart(c) {
      if (!c || !c.chartNodes || !c.chartNodes.length)
        return c;
      const out = { ...c }, extras = Array.isArray(out._extras) ? [...out._extras] : out._extras && Array.isArray(out._extras.children) ? [...out._extras.children] : [];
      for (const n of out.chartNodes)
        extras.push(f.renderElement(n));
      delete out.chartNodes;
      if (Array.isArray(c._extras) || !c._extras)
        out._extras = extras;
      else
        out._extras = { ...c._extras, children: extras };
      return out;
    }
    return { ...f, parseChart, renderChart, hydrateChart, dehydrateChart };
  } });
    __register({ name: "drawImageExtended", dependencies: ["xml","odfTypedHelper"], factory: function(xml, odfTypedHelper) {
    const ELEMENTS = new Set([
      "draw:area-rectangle",
      "draw:area-circle",
      "draw:area-polygon",
      "draw:image-map",
      "draw:gradient",
      "draw:hatch",
      "draw:fill-image",
      "draw:opacity",
      "draw:marker",
      "draw:stroke-dash",
      "draw:layer",
      "draw:layer-set",
      "draw:applet",
      "draw:plugin",
      "draw:floating-frame",
      "draw:object",
      "draw:object-ole",
      "draw:param"
    ]), f = odfTypedHelper.buildTypedFamily(ELEMENTS, "draw:", "draw-ext");
    function hydrateFrame(frame) {
      if (!frame || !frame._extras)
        return frame;
      const extras = Array.isArray(frame._extras) ? frame._extras : frame._extras.children || [];
      if (!extras.length)
        return frame;
      const remaining = [], promoted = frame.drawExtras || [];
      for (const c of extras)
        if (c && c.type === "element" && ELEMENTS.has(c.name))
          promoted.push(f.parseElement(c));
        else
          remaining.push(c);
      if (promoted.length)
        frame.drawExtras = promoted;
      if (Array.isArray(frame._extras))
        if (remaining.length)
          frame._extras = remaining;
        else
          delete frame._extras;
      else {
        if (remaining.length)
          frame._extras.children = remaining;
        else
          delete frame._extras.children;
        if (!Object.keys(frame._extras).length)
          delete frame._extras;
      }
      return frame;
    }
    function dehydrateFrame(frame) {
      if (!frame || !frame.drawExtras || !frame.drawExtras.length)
        return frame;
      const out = { ...frame }, extras = Array.isArray(out._extras) ? [...out._extras] : out._extras && Array.isArray(out._extras.children) ? [...out._extras.children] : [];
      for (const n of out.drawExtras)
        extras.push(f.renderElement(n));
      delete out.drawExtras;
      if (Array.isArray(frame._extras) || !frame._extras)
        out._extras = extras;
      else
        out._extras = { ...frame._extras, children: extras };
      return out;
    }
    return { ...f, hydrateFrame, dehydrateFrame };
  } });
    __register({ name: "numberFormatExtended", dependencies: ["xml"], factory: function(xml) {
    const FRAGMENTS = new Set([
      "number:number",
      "number:scientific-number",
      "number:fraction",
      "number:currency-symbol",
      "number:text",
      "number:embedded-text",
      "number:day",
      "number:day-of-week",
      "number:month",
      "number:year",
      "number:era",
      "number:week-of-year",
      "number:quarter",
      "number:hours",
      "number:minutes",
      "number:seconds",
      "number:am-pm",
      "number:boolean",
      "number:text-content"
    ]);
    function parseFragment(el) {
      if (!el || el.type !== "element" || !FRAGMENTS.has(el.name))
        return null;
      const out = { type: "number-fragment", kind: el.name.slice(7), attrs: { ...el.attrs || {} } }, txt = xml.textContent(el);
      if (txt)
        out.text = txt;
      return out;
    }
    function renderFragment(f) {
      if (!f || f.kind == null)
        return null;
      const kids = f.text != null ? [xml.text(String(f.text))] : [];
      return xml.el("number:" + f.kind, { ...f.attrs || {} }, kids);
    }
    function hydrateStyle(s) {
      if (!s || !Array.isArray(s.parts))
        return s;
      const out = s.parts.slice();
      for (let i = 0;i < out.length; i++) {
        const c = out[i];
        if (c && c.type === "element" && FRAGMENTS.has(c.name))
          out[i] = parseFragment(c);
      }
      s.parts = out;
      return s;
    }
    function dehydrateStyle(s) {
      if (!s || !Array.isArray(s.parts))
        return s;
      const out = s.parts.slice();
      for (let i = 0;i < out.length; i++) {
        const c = out[i];
        if (c && c.type === "number-fragment")
          out[i] = renderFragment(c);
      }
      s.parts = out;
      return s;
    }
    function isFragment(name) {
      return FRAGMENTS.has(name);
    }
    return {
      parseFragment,
      renderFragment,
      isFragment,
      hydrateStyle,
      dehydrateStyle,
      FRAGMENTS
    };
  } });
    __register({ name: "metaExtended", dependencies: ["xml"], factory: function(xml) {
    const META_TEXT = new Set([
      "meta:generator",
      "meta:initial-creator",
      "meta:creation-date",
      "meta:printed-by",
      "meta:print-date",
      "meta:editing-cycles",
      "meta:editing-duration",
      "meta:keyword",
      "dc:title",
      "dc:creator",
      "dc:date",
      "dc:description",
      "dc:subject",
      "dc:language",
      "dc:rights"
    ]), META_ATTR = new Set([
      "meta:template",
      "meta:auto-reload",
      "meta:hyperlink-behaviour",
      "meta:document-statistic",
      "meta:user-defined"
    ]);
    function camel(name) {
      return (name.includes(":") ? name.slice(name.indexOf(":") + 1) : name).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    }
    function parseMetaBody(el) {
      const out = { type: "meta-extended", text: {}, attrs: {} };
      for (const c of el.children || []) {
        if (c.type !== "element")
          continue;
        if (META_TEXT.has(c.name)) {
          const key = camel(c.name);
          if (c.name === "meta:keyword")
            (out.text.keywords = out.text.keywords || []).push(xml.textContent(c));
          else if (c.name === "meta:user-defined")
            (out.attrs.userDefined = out.attrs.userDefined || []).push({
              attrs: { ...c.attrs || {} },
              text: xml.textContent(c)
            });
          else
            out.text[key] = xml.textContent(c);
        } else if (META_ATTR.has(c.name)) {
          const key = camel(c.name);
          if (c.name === "meta:user-defined")
            (out.attrs.userDefined = out.attrs.userDefined || []).push({
              attrs: { ...c.attrs || {} },
              text: xml.textContent(c)
            });
          else
            out.attrs[key] = { ...c.attrs || {} };
        }
      }
      return out;
    }
    function renderMetaBody(m) {
      const kids = [];
      for (const [name, asText] of [
        ["meta:generator", "generator"],
        ["meta:initial-creator", "initialCreator"],
        ["meta:creation-date", "creationDate"],
        ["meta:printed-by", "printedBy"],
        ["meta:print-date", "printDate"],
        ["meta:editing-cycles", "editingCycles"],
        ["meta:editing-duration", "editingDuration"],
        ["dc:title", "title"],
        ["dc:creator", "creator"],
        ["dc:date", "date"],
        ["dc:description", "description"],
        ["dc:subject", "subject"],
        ["dc:language", "language"],
        ["dc:rights", "rights"]
      ])
        if (m.text && m.text[asText] != null)
          kids.push(xml.el(name, {}, [xml.text(String(m.text[asText]))]));
      if (m.text && Array.isArray(m.text.keywords))
        for (const k of m.text.keywords)
          kids.push(xml.el("meta:keyword", {}, [xml.text(String(k))]));
      for (const [name, asAttr] of [
        ["meta:template", "template"],
        ["meta:auto-reload", "autoReload"],
        ["meta:hyperlink-behaviour", "hyperlinkBehaviour"],
        ["meta:document-statistic", "documentStatistic"]
      ])
        if (m.attrs && m.attrs[asAttr])
          kids.push(xml.el(name, { ...m.attrs[asAttr] }));
      if (m.attrs && Array.isArray(m.attrs.userDefined))
        for (const u of m.attrs.userDefined)
          kids.push(xml.el("meta:user-defined", { ...u.attrs || {} }, u.text != null ? [xml.text(String(u.text))] : []));
      return xml.el("office:meta", {}, kids);
    }
    function hydrateMetadata(meta) {
      if (!meta || !meta._rawMeta)
        return meta;
      meta.metaExtended = parseMetaBody(meta._rawMeta);
      return meta;
    }
    function dehydrateMetadata(meta) {
      return meta;
    }
    return {
      parseMetaBody,
      renderMetaBody,
      hydrateMetadata,
      dehydrateMetadata,
      META_TEXT,
      META_ATTR
    };
  } });
    __register({ name: "formsControls", dependencies: ["xml","odfTypedHelper"], factory: function(xml, odfTypedHelper) {
    const ELEMENTS = new Set([
      "form:form",
      "form:button",
      "form:text",
      "form:textarea",
      "form:fixed-text",
      "form:image",
      "form:image-frame",
      "form:checkbox",
      "form:radio",
      "form:listbox",
      "form:option",
      "form:combobox",
      "form:item",
      "form:password",
      "form:formatted-text",
      "form:number",
      "form:date",
      "form:time",
      "form:file",
      "form:hidden",
      "form:frame",
      "form:value-range",
      "form:grid",
      "form:column",
      "form:generic-control",
      "form:properties",
      "form:property",
      "form:list-property",
      "form:list-value",
      "form:connection-resource",
      "form:item-list",
      "form:button-control",
      "form:event-listener"
    ]), f = odfTypedHelper.buildTypedFamily(ELEMENTS, "form:", "form-control");
    function parseForms(el) {
      const out = { type: "forms", attrs: { ...el.attrs || {} }, controls: [] };
      for (const c of el.children || [])
        if (c && c.type === "element" && ELEMENTS.has(c.name))
          out.controls.push(f.parseElement(c));
        else if (c && c.type === "element")
          (out._extras = out._extras || []).push(c);
      return out;
    }
    function renderForms(forms) {
      const kids = (forms.controls || []).map((c) => f.renderElement(c));
      if (forms._extras)
        for (const e of forms._extras)
          kids.push(e);
      return xml.el("office:forms", { ...forms.attrs || {} }, kids);
    }
    return { ...f, parseForms, renderForms };
  } });
    __register({ name: "scriptMacros", dependencies: ["xml"], factory: function(xml) {
    const ELEMENTS = new Set([
      "office:scripts",
      "office:script",
      "office:event-listeners",
      "office:event-listener",
      "script:event-listener"
    ]);
    function parseScript(el) {
      if (!el || el.type !== "element" || !ELEMENTS.has(el.name))
        return null;
      const out = {
        type: "script-node",
        kind: el.name,
        attrs: { ...el.attrs || {} }
      }, kids = [];
      for (const c of el.children || [])
        if (c && c.type === "element" && ELEMENTS.has(c.name))
          kids.push(parseScript(c));
        else
          kids.push(c);
      if (kids.length)
        out.children = kids;
      return out;
    }
    function renderScript(obj) {
      if (!obj || obj.kind == null)
        return null;
      const kids = [];
      for (const c of obj.children || [])
        if (c && c.type === "script-node")
          kids.push(renderScript(c));
        else
          kids.push(c);
      return xml.el(obj.kind, { ...obj.attrs || {} }, kids);
    }
    function hydrateMetadata(meta) {
      if (!meta || !meta._extras)
        return meta;
      const extras = Array.isArray(meta._extras) ? meta._extras : meta._extras.children || [], remaining = [], promoted = meta.scripts || [];
      for (const c of extras)
        if (c && c.type === "element" && ELEMENTS.has(c.name))
          promoted.push(parseScript(c));
        else
          remaining.push(c);
      if (promoted.length)
        meta.scripts = promoted;
      if (Array.isArray(meta._extras))
        if (remaining.length)
          meta._extras = remaining;
        else
          delete meta._extras;
      else {
        if (remaining.length)
          meta._extras.children = remaining;
        else
          delete meta._extras.children;
        if (!Object.keys(meta._extras).length)
          delete meta._extras;
      }
      return meta;
    }
    function dehydrateMetadata(meta) {
      if (!meta || !meta.scripts || !meta.scripts.length)
        return meta;
      const out = { ...meta }, extras = Array.isArray(out._extras) ? [...out._extras] : out._extras && Array.isArray(out._extras.children) ? [...out._extras.children] : [];
      for (const s of out.scripts)
        extras.push(renderScript(s));
      delete out.scripts;
      if (Array.isArray(meta._extras) || !meta._extras)
        out._extras = extras;
      else
        out._extras = { ...meta._extras, children: extras };
      return out;
    }
    return {
      parseScript,
      renderScript,
      hydrateMetadata,
      dehydrateMetadata,
      ELEMENTS
    };
  } });
    __register({ name: "databaseSources", dependencies: ["odfTypedHelper"], factory: function(typedHelper) {
    const ELEMENTS = new Set([
      "db:data-source",
      "db:data-source-settings",
      "db:data-source-setting",
      "db:data-source-setting-value",
      "db:data-source-setting-values",
      "db:driver-settings",
      "db:auto-increment",
      "db:character-set",
      "db:delimiter",
      "db:delimiters",
      "db:login",
      "db:application-connection-settings",
      "db:table-settings",
      "db:table-setting",
      "db:table-include-list",
      "db:table-exclude-list",
      "db:table-filter-pattern",
      "db:table-filter",
      "db:table-type-filter",
      "db:table-type",
      "db:connection-data",
      "db:database-description",
      "db:server-database",
      "db:file-based-database",
      "db:connection-resource",
      "db:component-collection",
      "db:component",
      "db:queries",
      "db:query",
      "db:query-collection",
      "db:column-definitions",
      "db:column-definition",
      "db:columns",
      "db:column",
      "db:filter-statement",
      "db:order-statement",
      "db:update-table",
      "db:forms",
      "db:reports",
      "db:report",
      "db:schema-definition",
      "db:table-definitions",
      "db:table-definition",
      "db:keys",
      "db:key",
      "db:key-column",
      "db:key-columns",
      "db:indices",
      "db:index",
      "db:index-column",
      "db:index-columns",
      "db:positive-integer"
    ]), h = typedHelper.buildTypedFamily(ELEMENTS, "db:", "db-node", { passthrough: !0 });
    return {
      parseElement: h.parseElement,
      renderElement: h.renderElement,
      parseDb: h.parseElement,
      renderDb: h.renderElement,
      isDb: h.isCovered,
      ELEMENTS,
      _passthrough: !0
    };
  } });
    __register({ name: "dsigSignatures", dependencies: ["xml"], factory: function(xml) {
    function parseSignatures(el) {
      if (!el || el.type !== "element" || el.name !== "dsig:document-signatures")
        return null;
      return {
        type: "dsig-signatures",
        attrs: { ...el.attrs || {} },
        body: [...el.children || []]
      };
    }
    function renderSignatures(obj) {
      if (!obj || obj.type !== "dsig-signatures")
        return null;
      return xml.el("dsig:document-signatures", { ...obj.attrs || {} }, obj.body || []);
    }
    function isSignatures(name) {
      return name === "dsig:document-signatures";
    }
    function manifestEntries() {
      return [
        { fullPath: "META-INF/documentsignatures.xml", mediaType: "" }
      ];
    }
    function hydrateMetadata(meta) {
      if (!meta || !meta._extras)
        return meta;
      const extras = Array.isArray(meta._extras) ? meta._extras : meta._extras.children || [], remaining = [];
      for (const c of extras)
        if (c && c.type === "element" && c.name === "dsig:document-signatures")
          meta.signatures = parseSignatures(c);
        else
          remaining.push(c);
      if (Array.isArray(meta._extras))
        if (remaining.length)
          meta._extras = remaining;
        else
          delete meta._extras;
      else {
        if (remaining.length)
          meta._extras.children = remaining;
        else
          delete meta._extras.children;
        if (!Object.keys(meta._extras).length)
          delete meta._extras;
      }
      return meta;
    }
    function dehydrateMetadata(meta) {
      if (!meta || !meta.signatures)
        return meta;
      const out = { ...meta }, extras = Array.isArray(out._extras) ? [...out._extras] : out._extras && Array.isArray(out._extras.children) ? [...out._extras.children] : [];
      extras.push(renderSignatures(out.signatures));
      delete out.signatures;
      if (Array.isArray(meta._extras) || !meta._extras)
        out._extras = extras;
      else
        out._extras = { ...meta._extras, children: extras };
      return out;
    }
    return {
      parseSignatures,
      renderSignatures,
      isSignatures,
      manifestEntries,
      hydrateMetadata,
      dehydrateMetadata
    };
  } });
    __register({ name: "dr3d3d", dependencies: ["xml","odfTypedHelper"], factory: function(xml, odfTypedHelper) {
    const ELEMENTS = new Set([
      "dr3d:scene",
      "dr3d:cube",
      "dr3d:sphere",
      "dr3d:extrude",
      "dr3d:rotate",
      "dr3d:light"
    ]), f = odfTypedHelper.buildTypedFamily(ELEMENTS, "dr3d:", "dr3d-typed");
    function parseScene(el) {
      return f.parseElement(el);
    }
    function renderScene(obj) {
      return f.renderElement(obj);
    }
    function hydrateFrame(frame) {
      if (!frame || !frame._extras)
        return frame;
      const extras = Array.isArray(frame._extras) ? frame._extras : frame._extras.children || [], remaining = [], promoted = frame.dr3d || [];
      for (const c of extras)
        if (c && c.type === "element" && ELEMENTS.has(c.name))
          promoted.push(f.parseElement(c));
        else
          remaining.push(c);
      if (promoted.length)
        frame.dr3d = promoted;
      if (Array.isArray(frame._extras))
        if (remaining.length)
          frame._extras = remaining;
        else
          delete frame._extras;
      else {
        if (remaining.length)
          frame._extras.children = remaining;
        else
          delete frame._extras.children;
        if (!Object.keys(frame._extras).length)
          delete frame._extras;
      }
      return frame;
    }
    function dehydrateFrame(frame) {
      if (!frame || !frame.dr3d || !frame.dr3d.length)
        return frame;
      const out = { ...frame }, extras = Array.isArray(out._extras) ? [...out._extras] : out._extras && Array.isArray(out._extras.children) ? [...out._extras.children] : [];
      for (const n of out.dr3d)
        extras.push(f.renderElement(n));
      delete out.dr3d;
      if (Array.isArray(frame._extras) || !frame._extras)
        out._extras = extras;
      else
        out._extras = { ...frame._extras, children: extras };
      return out;
    }
    return { ...f, parseScene, renderScene, hydrateFrame, dehydrateFrame };
  } });
    __register({ name: "odfMiscHelper", dependencies: ["xml"], factory: function(xml) {
    function build(elementNames, ns) {
      function parseChildren(children) {
        const out = [];
        for (const c of children || [])
          if (c && c.type === "element" && elementNames.has(c.name))
            out.push(parseElement(c));
          else
            out.push(c);
        return out;
      }
      function parseElement(el) {
        if (!el || el.type !== "element" || !elementNames.has(el.name))
          return null;
        return {
          _passthrough: !0,
          kind: el.name.startsWith(ns) ? el.name.slice(ns.length) : el.name,
          attrs: { ...el.attrs || {} },
          children: parseChildren(el.children)
        };
      }
      function renderChildren(children) {
        const out = [];
        for (const c of children || [])
          if (c && c._passthrough && c.kind != null)
            out.push(renderElement(c));
          else
            out.push(c);
        return out;
      }
      function renderElement(obj) {
        if (!obj || obj.kind == null)
          return null;
        const name = obj.kind.includes(":") ? obj.kind : ns + obj.kind;
        return xml.el(name, { ...obj.attrs || {} }, renderChildren(obj.children));
      }
      function isCovered(name) {
        return elementNames.has(name);
      }
      return { parseElement, renderElement, isCovered, ELEMENTS: elementNames };
    }
    return {
      buildMiscPassthrough(elementNames, ns) {
        return build(elementNames, ns);
      }
    };
  } });
    __register({ name: "tableMisc", dependencies: ["xml","odfMiscHelper"], factory: function(xml, odfMiscHelper) {
    const ELEMENTS = new Set([
      "table:title",
      "table:desc",
      "table:source-cell-range",
      "table:source-service",
      "table:label-range",
      "table:label-ranges",
      "table:named-expression",
      "table:named-range",
      "table:named-expressions",
      "table:dependencies",
      "table:dependency",
      "table:operation",
      "table:tracked-changes",
      "table:cell-content-change",
      "table:cell-content-deletion",
      "table:cell-address",
      "table:deletion",
      "table:insertion",
      "table:movement",
      "table:movement-cut-off",
      "table:change-deletion",
      "table:change-track-table-cell",
      "table:previous",
      "table:detective",
      "table:operation-list",
      "table:highlighted-range",
      "table:consolidation",
      "table:body",
      "table:shapes",
      "table:cell-range-source",
      "table:database-source-sql",
      "table:database-source-table",
      "table:database-source-query",
      "table:content-validations",
      "table:content-validation",
      "table:error-message",
      "table:error-macro",
      "table:help-message"
    ]), h = odfMiscHelper.buildMiscPassthrough(ELEMENTS, "table:");
    function hydrateTable(t) {
      if (!t || !t._extras)
        return t;
      const extras = Array.isArray(t._extras) ? t._extras : t._extras.children || [];
      if (!extras.length)
        return t;
      const remaining = [], promoted = t.tableNodes || [];
      for (const c of extras)
        if (c && c.type === "element" && ELEMENTS.has(c.name))
          promoted.push(h.parseElement(c));
        else
          remaining.push(c);
      if (promoted.length)
        t.tableNodes = promoted;
      if (Array.isArray(t._extras))
        if (remaining.length)
          t._extras = remaining;
        else
          delete t._extras;
      else {
        if (remaining.length)
          t._extras.children = remaining;
        else
          delete t._extras.children;
        if (!Object.keys(t._extras).length)
          delete t._extras;
      }
      return t;
    }
    function dehydrateTable(t) {
      if (!t || !t.tableNodes || !t.tableNodes.length)
        return t;
      const out = { ...t }, extras = Array.isArray(out._extras) ? [...out._extras] : out._extras && Array.isArray(out._extras.children) ? [...out._extras.children] : [];
      for (const n of out.tableNodes)
        if (n && n._passthrough)
          extras.push(h.renderElement(n));
      delete out.tableNodes;
      if (Array.isArray(t._extras) || !t._extras)
        out._extras = extras;
      else
        out._extras = { ...t._extras, children: extras };
      return out;
    }
    return { ...h, _passthrough: !0, hydrateTable, dehydrateTable };
  } });
    __register({ name: "drawMisc", dependencies: ["xml","odfMiscHelper"], factory: function(xml, odfMiscHelper) {
    const ELEMENTS = new Set([
      "draw:a",
      "draw:glue-point",
      "draw:glue-points",
      "draw:page-thumbnail",
      "draw:text-box",
      "draw:object",
      "draw:object-ole",
      "draw:floating-frame",
      "draw:applet",
      "draw:plugin",
      "draw:param",
      "draw:contour-polygon",
      "draw:contour-path",
      "draw:image-map",
      "draw:area-rectangle",
      "draw:area-circle",
      "draw:area-polygon",
      "draw:layer",
      "draw:layer-set",
      "draw:marker",
      "draw:stroke-dash",
      "draw:gradient",
      "draw:hatch",
      "draw:fill-image",
      "draw:opacity",
      "draw:fill-pattern",
      "draw:page",
      "draw:caption-point",
      "draw:notify-on-update-of-ranges",
      "draw:custom-shape",
      "draw:enhanced-geometry",
      "draw:equation",
      "draw:handle"
    ]), h = odfMiscHelper.buildMiscPassthrough(ELEMENTS, "draw:");
    function hydrateFrame(f) {
      if (!f || !f._extras)
        return f;
      const extras = Array.isArray(f._extras) ? f._extras : f._extras.children || [];
      if (!extras.length)
        return f;
      const remaining = [], promoted = f.drawNodes || [];
      for (const c of extras)
        if (c && c.type === "element" && ELEMENTS.has(c.name))
          promoted.push(h.parseElement(c));
        else
          remaining.push(c);
      if (promoted.length)
        f.drawNodes = promoted;
      if (Array.isArray(f._extras))
        if (remaining.length)
          f._extras = remaining;
        else
          delete f._extras;
      else {
        if (remaining.length)
          f._extras.children = remaining;
        else
          delete f._extras.children;
        if (!Object.keys(f._extras).length)
          delete f._extras;
      }
      return f;
    }
    function dehydrateFrame(f) {
      if (!f || !f.drawNodes || !f.drawNodes.length)
        return f;
      const out = { ...f }, extras = Array.isArray(out._extras) ? [...out._extras] : out._extras && Array.isArray(out._extras.children) ? [...out._extras.children] : [];
      for (const n of out.drawNodes)
        if (n && n._passthrough)
          extras.push(h.renderElement(n));
      delete out.drawNodes;
      if (Array.isArray(f._extras) || !f._extras)
        out._extras = extras;
      else
        out._extras = { ...f._extras, children: extras };
      return out;
    }
    return { ...h, _passthrough: !0, hydrateFrame, dehydrateFrame };
  } });
    __register({ name: "styleMisc", dependencies: ["xml","odfMiscHelper"], factory: function(xml, odfMiscHelper) {
    const ELEMENTS = new Set([
      "style:style",
      "style:default-style",
      "style:default-page-layout",
      "style:font-face",
      "style:handout-master",
      "style:presentation-page-layout",
      "style:tab-stop",
      "style:tab-stops",
      "style:drop-cap",
      "style:background-image",
      "style:list-level-properties",
      "style:list-level-label-alignment",
      "style:text-properties",
      "style:paragraph-properties",
      "style:graphic-properties",
      "style:table-properties",
      "style:table-column-properties",
      "style:table-row-properties",
      "style:table-cell-properties",
      "style:section-properties",
      "style:ruby-properties",
      "style:header-style",
      "style:footer-style",
      "style:header-footer-properties",
      "style:column",
      "style:columns",
      "style:column-sep",
      "style:footnote-sep",
      "style:layout-grid-properties",
      "style:map",
      "style:region-left",
      "style:region-center",
      "style:region-right",
      "style:chart-properties"
    ]), h = odfMiscHelper.buildMiscPassthrough(ELEMENTS, "style:");
    function hydrateStyles(s) {
      if (!s || !s._extras)
        return s;
      const extras = Array.isArray(s._extras) ? s._extras : s._extras.children || [];
      if (!extras.length)
        return s;
      const remaining = [], promoted = s.styleNodes || [];
      for (const c of extras)
        if (c && c.type === "element" && ELEMENTS.has(c.name))
          promoted.push(h.parseElement(c));
        else
          remaining.push(c);
      if (promoted.length)
        s.styleNodes = promoted;
      if (Array.isArray(s._extras))
        if (remaining.length)
          s._extras = remaining;
        else
          delete s._extras;
      else {
        if (remaining.length)
          s._extras.children = remaining;
        else
          delete s._extras.children;
        if (!Object.keys(s._extras).length)
          delete s._extras;
      }
      return s;
    }
    function dehydrateStyles(s) {
      if (!s || !s.styleNodes || !s.styleNodes.length)
        return s;
      const out = { ...s }, extras = Array.isArray(out._extras) ? [...out._extras] : out._extras && Array.isArray(out._extras.children) ? [...out._extras.children] : [];
      for (const n of out.styleNodes)
        if (n && n._passthrough)
          extras.push(h.renderElement(n));
      delete out.styleNodes;
      if (Array.isArray(s._extras) || !s._extras)
        out._extras = extras;
      else
        out._extras = { ...s._extras, children: extras };
      return out;
    }
    return { ...h, _passthrough: !0, hydrateStyles, dehydrateStyles };
  } });
    __register({ name: "textMisc", dependencies: ["xml","odfMiscHelper"], factory: function(xml, odfMiscHelper) {
    const ELEMENTS = new Set([
      "text:a",
      "text:alphabetical-index-auto-mark-file",
      "text:alphabetical-index-mark",
      "text:alphabetical-index-mark-end",
      "text:alphabetical-index-mark-start",
      "text:author-initials",
      "text:author-name",
      "text:bibliography-mark",
      "text:chapter",
      "text:character-count",
      "text:creation-date",
      "text:creation-time",
      "text:creator",
      "text:date",
      "text:dde-connection-decl",
      "text:dde-connection-decls",
      "text:description",
      "text:editing-cycles",
      "text:editing-duration",
      "text:file-name",
      "text:image-count",
      "text:index-entry-bibliography",
      "text:index-entry-chapter",
      "text:index-entry-link-end",
      "text:index-entry-link-start",
      "text:index-entry-page-number",
      "text:index-entry-span",
      "text:index-entry-tab-stop",
      "text:index-entry-text",
      "text:index-title",
      "text:initial-creator",
      "text:keywords",
      "text:line-break",
      "text:measure",
      "text:modification-date",
      "text:modification-time",
      "text:note",
      "text:note-body",
      "text:note-citation",
      "text:note-ref",
      "text:notes-configuration",
      "text:number",
      "text:numbered-paragraph",
      "text:object-count",
      "text:outline-level-style",
      "text:p",
      "text:page-continuation",
      "text:page-count",
      "text:page-number",
      "text:page-variable-get",
      "text:page-variable-set",
      "text:paragraph-count",
      "text:print-date",
      "text:print-time",
      "text:printed-by",
      "text:reference-ref",
      "text:ruby",
      "text:ruby-base",
      "text:ruby-text",
      "text:s",
      "text:script",
      "text:sender-city",
      "text:sender-company",
      "text:sender-country",
      "text:sender-email",
      "text:sender-fax",
      "text:sender-firstname",
      "text:sender-initials",
      "text:sender-lastname",
      "text:sender-phone-private",
      "text:sender-phone-work",
      "text:sender-position",
      "text:sender-postal-code",
      "text:sender-state-or-province",
      "text:sender-street",
      "text:sender-title",
      "text:sequence",
      "text:sequence-ref",
      "text:soft-page-break",
      "text:span",
      "text:span-extra",
      "text:subject",
      "text:tab",
      "text:table-count",
      "text:table-formula",
      "text:template-name",
      "text:time",
      "text:title",
      "text:toc-mark",
      "text:toc-mark-end",
      "text:toc-mark-start",
      "text:user-defined",
      "text:user-field-get",
      "text:user-field-input",
      "text:variable-decl",
      "text:variable-decls",
      "text:variable-get",
      "text:variable-input",
      "text:variable-set",
      "text:word-count"
    ]), h = odfMiscHelper.buildMiscPassthrough(ELEMENTS, "text:");
    function hydrateParagraph(p) {
      if (!p || !p._extras)
        return p;
      const extras = Array.isArray(p._extras) ? p._extras : p._extras.children || [];
      if (!extras.length)
        return p;
      const remaining = [], promoted = p.text || [];
      for (const c of extras)
        if (c && c.type === "element" && ELEMENTS.has(c.name))
          promoted.push(h.parseElement(c));
        else
          remaining.push(c);
      if (promoted.length)
        p.text = promoted;
      if (Array.isArray(p._extras))
        if (remaining.length)
          p._extras = remaining;
        else
          delete p._extras;
      else {
        if (remaining.length)
          p._extras.children = remaining;
        else
          delete p._extras.children;
        if (!Object.keys(p._extras).length)
          delete p._extras;
      }
      return p;
    }
    function dehydrateParagraph(p) {
      if (!p || !p.text || !p.text.length)
        return p;
      const out = { ...p }, extras = Array.isArray(out._extras) ? [...out._extras] : out._extras && Array.isArray(out._extras.children) ? [...out._extras.children] : [];
      for (const t of out.text)
        if (t && t._passthrough)
          extras.push(h.renderElement(t));
      delete out.text;
      if (Array.isArray(p._extras) || !p._extras)
        out._extras = extras;
      else
        out._extras = { ...p._extras, children: extras };
      return out;
    }
    return {
      ...h,
      _passthrough: !0,
      hydrateParagraph,
      dehydrateParagraph
    };
  } });
    __register({ name: "officeMisc", dependencies: ["xml","odfMiscHelper"], factory: function(xml, odfMiscHelper) {
    const ELEMENTS = new Set([
      "office:annotation",
      "office:annotation-end",
      "office:body",
      "office:change-info",
      "office:chart",
      "office:database",
      "office:dde-source",
      "office:document",
      "office:document-content",
      "office:document-meta",
      "office:document-settings",
      "office:document-styles",
      "office:drawing",
      "office:event-listeners",
      "office:font-face-decls",
      "office:forms",
      "office:image",
      "office:master-styles",
      "office:meta",
      "office:presentation",
      "office:script",
      "office:scripts",
      "office:spreadsheet",
      "office:styles",
      "office:text",
      "office:value",
      "office:annotation-ref"
    ]), h = odfMiscHelper.buildMiscPassthrough(ELEMENTS, "office:");
    function hydrateMetadata(m) {
      if (!m || !m._extras)
        return m;
      const extras = Array.isArray(m._extras) ? m._extras : m._extras.children || [];
      if (!extras.length)
        return m;
      const remaining = [], promoted = m.officeNodes || [];
      for (const c of extras)
        if (c && c.type === "element" && ELEMENTS.has(c.name))
          promoted.push(h.parseElement(c));
        else
          remaining.push(c);
      if (promoted.length)
        m.officeNodes = promoted;
      if (Array.isArray(m._extras))
        if (remaining.length)
          m._extras = remaining;
        else
          delete m._extras;
      else {
        if (remaining.length)
          m._extras.children = remaining;
        else
          delete m._extras.children;
        if (!Object.keys(m._extras).length)
          delete m._extras;
      }
      return m;
    }
    function dehydrateMetadata(m) {
      if (!m || !m.officeNodes || !m.officeNodes.length)
        return m;
      const out = { ...m }, extras = Array.isArray(out._extras) ? [...out._extras] : out._extras && Array.isArray(out._extras.children) ? [...out._extras.children] : [];
      for (const n of out.officeNodes)
        if (n && n._passthrough)
          extras.push(h.renderElement(n));
      delete out.officeNodes;
      if (Array.isArray(m._extras) || !m._extras)
        out._extras = extras;
      else
        out._extras = { ...m._extras, children: extras };
      return out;
    }
    return { ...h, _passthrough: !0, hydrateMetadata, dehydrateMetadata };
  } });
    __register({ name: "legacyStaroffice", dependencies: ["xml"], factory: function(xml) {
    const LEGACY_PREFIXES = ["so:", "so20:", "so52:", "ooo:", "ooow:", "oooc:"];
    function isLegacy(name) {
      if (typeof name !== "string")
        return !1;
      for (const p of LEGACY_PREFIXES)
        if (name.startsWith(p))
          return !0;
      return !1;
    }
    function parseLegacy(el) {
      if (!el || el.type !== "element" || !isLegacy(el.name))
        return null;
      const kids = [];
      for (const c of el.children || [])
        if (c && c.type === "element" && isLegacy(c.name))
          kids.push(parseLegacy(c));
        else
          kids.push(c);
      return {
        _legacy: !0,
        kind: el.name,
        attrs: { ...el.attrs || {} },
        children: kids
      };
    }
    function renderLegacy(obj) {
      if (!obj || obj.kind == null)
        return null;
      const kids = [];
      for (const c of obj.children || [])
        if (c && c._legacy)
          kids.push(renderLegacy(c));
        else
          kids.push(c);
      return xml.el(obj.kind, { ...obj.attrs || {} }, kids);
    }
    function hydrate(node) {
      if (!node || !node._extras)
        return node;
      const extras = Array.isArray(node._extras) ? node._extras : node._extras.children || [];
      if (!extras.length)
        return node;
      const remaining = [], promoted = node.legacyNodes || [];
      for (const c of extras)
        if (c && c.type === "element" && isLegacy(c.name))
          promoted.push(parseLegacy(c));
        else
          remaining.push(c);
      if (promoted.length)
        node.legacyNodes = promoted;
      if (Array.isArray(node._extras))
        if (remaining.length)
          node._extras = remaining;
        else
          delete node._extras;
      else {
        if (remaining.length)
          node._extras.children = remaining;
        else
          delete node._extras.children;
        if (!Object.keys(node._extras).length)
          delete node._extras;
      }
      return node;
    }
    function dehydrate(node) {
      if (!node || !node.legacyNodes || !node.legacyNodes.length)
        return node;
      const out = { ...node }, extras = Array.isArray(out._extras) ? [...out._extras] : out._extras && Array.isArray(out._extras.children) ? [...out._extras.children] : [];
      for (const n of out.legacyNodes)
        extras.push(renderLegacy(n));
      delete out.legacyNodes;
      if (Array.isArray(node._extras) || !node._extras)
        out._extras = extras;
      else
        out._extras = { ...node._extras, children: extras };
      return out;
    }
    return {
      parseLegacy,
      renderLegacy,
      isLegacy,
      hydrateParagraph: hydrate,
      dehydrateParagraph: dehydrate,
      hydrateMetadata: hydrate,
      dehydrateMetadata: dehydrate,
      hydrateStyles: hydrate,
      dehydrateStyles: dehydrate,
      hydrateFrame: hydrate,
      dehydrateFrame: dehydrate,
      LEGACY_PREFIXES
    };
  } });

    const __core = __resolve("ods");
    __core.use(__resolve("tableAdvanced"), __resolve("stylePage"), __resolve("stylePropertiesTyped"), __resolve("drawShapes"), __resolve("textFieldsExtended"), __resolve("textListDetailed"), __resolve("animationsSmil"), __resolve("chartTyped"), __resolve("drawImageExtended"), __resolve("numberFormatExtended"), __resolve("metaExtended"), __resolve("formsControls"), __resolve("scriptMacros"), __resolve("databaseSources"), __resolve("dsigSignatures"), __resolve("dr3d3d"), __resolve("tableMisc"), __resolve("drawMisc"), __resolve("styleMisc"), __resolve("textMisc"), __resolve("officeMisc"), __resolve("legacyStaroffice"));
    return __core;
    }
};
