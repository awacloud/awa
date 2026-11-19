/*!
 * Copyright (c) 2026 AwaCloud SAS
 * Author: Matthieu Bouilloux
 * SPDX-License-Identifier: AGPL-3.0-only
 * Dual-licensed; see the NOTICE file for licensing and any additional terms.
 */
/* GENERATED — do not edit. Source: packages/front/office/odf/tools/generate-bundles.mjs */

/**
 * @fileoverview `@awacloud/odf/bundles/prebuilt/odt-package` — pre-built single-factory bundle.
 *
 * Variant **package** : declares the 7 fw modules as dependencies and inlines every
 * odf-local factory transitively reachable from `odt` .
 *
 * @module odf/bundles/prebuilt/odt-package
 */

export const odtPackage = {
    name: "odtPackage",
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
    const { ParseError, RenderError, ContractError } = errors, ODF_NS = Object.freeze({
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
      const out = {}, attrs = sourceRootAttrs(sourcePkg, partPath);
      for (const k of Object.keys(attrs))
        if (k.startsWith("xmlns:") && k.length > 6)
          out[k.slice(6)] = attrs[k];
      return Object.freeze(out);
    }
    function sourceRootAttrs(sourcePkg, partPath) {
      try {
        const src = sourcePkg && sourcePkg.parts && sourcePkg.parts[partPath];
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
        return Object.freeze(tag ? { ...xml.parse("<" + tag + "/>").attrs } : {});
      } catch {
        return Object.freeze({});
      }
    }
    function keptVersion(doc, opts, module) {
      const v = opts && opts.keepVersion;
      if (v !== void 0 && typeof v !== "boolean")
        throw new ContractError(`odf/contract-error/${module}`, `${module}: write opts.keepVersion must be true or false`, { context: { module, argument: "opts.keepVersion" } });
      if (!v)
        return null;
      const pkg = doc && doc.package;
      if (!pkg || !pkg.parts)
        return { of: () => "1.4", manifest: "1.4" };
      const versionOf = (part) => sourceRootAttrs(pkg, part)["office:version"] || null, content = versionOf("content.xml"), manifest = content === null ? pkg.manifest && pkg.manifest.version || "1.4" : parseFloat(content) >= 1.2 ? content : null;
      return {
        of: (part) => pkg.parts[part] ? versionOf(part) : content,
        manifest
      };
    }
    function applyManifestVersion(p, kept) {
      if (!kept)
        return;
      p.manifest.version = kept.manifest;
      for (const e of p.manifest.entries || [])
        if (e.fullPath === "/")
          e.version = kept.manifest;
    }
    const VALUE_PREFIX_ATTRS = new Set([
      "table:formula",
      "text:formula",
      "text:condition",
      "chart:class",
      "db:type",
      "draw:engine",
      "draw:extrusion-metal-type",
      "form:control-implementation"
    ]);
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
          if (VALUE_PREFIX_ATTRS.has(k) && typeof attrs[k] === "string") {
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
      const { pkg: pkgM, metaMod, settingsMod, stylesMod } = sideMods, ct = ctXml || CT.XML, ours = metaMod.empty().generator, kept = keptVersion(doc, opts, "odf"), ns = (part) => ({
        namespaces: sourceNamespaces(doc.package, part),
        ...kept ? { version: kept.of(part) } : {}
      });
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
      sourceRootAttrs,
      declareNamespaces,
      keptVersion,
      applyManifestVersion,
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
      const m = manifest || { version: ODF_VERSION, entries: [] }, attrs = { "xmlns:manifest": MANIFEST_NS };
      if (m.version !== null)
        attrs["manifest:version"] = m.version || ODF_VERSION;
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
    const { ParseError, RenderError, ContractError } = errors, { encodeText, decodeText } = shared, DEFAULT_LIMITS = Object.freeze({
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
    function write(pkg, opts) {
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
      const mtime = opts && opts.mtime !== void 0 ? opts.mtime : new Date(1980, 0, 1, 0, 0, 0);
      try {
        return zipMod.zipSync(files, { mtime });
      } catch (e) {
        throw new RenderError("odf/render-error/pkg", "pkg: failed to zip package", { cause: e, context: { module: "pkg" } });
      }
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
        "office:version": opts && opts.version !== void 0 ? opts.version : ODF_VERSION
      }, [metaEl]);
      if (root.attrs["office:version"] === null)
        delete root.attrs["office:version"];
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
      const root = xml.el("office:document-settings", {
        "xmlns:office": OFFICE_NS,
        "xmlns:config": CONFIG_NS,
        "office:version": opts && opts.version !== void 0 ? opts.version : ODF_VERSION
      }, children.length ? [xml.el("office:settings", {}, children)] : []);
      if (root.attrs["office:version"] === null)
        delete root.attrs["office:version"];
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
      const s = styles || { styles: [], automaticStyles: [], masterStyles: [] }, extras = s._extras && s._extras.children || [], isDecls = (c) => c && c.type === "element" && c.name === "office:font-face-decls", children = [
        ...extras.filter(isDecls),
        xml.el("office:styles", {}, bucketEntries(s.styles)),
        xml.el("office:automatic-styles", {}, bucketEntries(s.automaticStyles)),
        xml.el("office:master-styles", {}, bucketEntries(s.masterStyles)),
        ...extras.filter((c) => !isDecls(c))
      ], root = xml.el("office:document-styles", {
        "xmlns:office": OFFICE_NS,
        "xmlns:style": STYLE_NS,
        "xmlns:text": TEXT_NS,
        "xmlns:fo": FO_NS,
        "xmlns:svg": SVG_NS,
        "xmlns:table": TABLE_NS,
        "office:version": opts && opts.version !== void 0 ? opts.version : ODF_VERSION
      }, children);
      if (root.attrs["office:version"] === null)
        delete root.attrs["office:version"];
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
      const runs = [], extras = [], inPlace = positional || !!(ctx && ctx.elementsInRuns);
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
          else if (c.name === "draw:frame" && ctx && typeof ctx.parseFrame === "function")
            runs.push(ctx.parseFrame(c));
          else if (c.name === "text:note" && ctx && typeof ctx.parseNote === "function")
            runs.push(ctx.parseNote(c));
          else if (inPlace)
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
        case "frame":
          return ctx && typeof ctx.renderFrame === "function" ? ctx.renderFrame(r) : xml.text("");
        case "note":
          return ctx && typeof ctx.renderNote === "function" ? ctx.renderNote(r) : xml.text("");
        case "element":
          return r;
        default:
          return xml.text("");
      }
    }
    function textOfRuns(runs, inSpan) {
      const out = [];
      for (const r of runs || [])
        switch (r.type) {
          case "text":
            out.push(r.value || "");
            break;
          case "span":
            out.push(Array.isArray(r.runs) ? textOfRuns(r.runs, !0) : r.value || "");
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
            if (inSpan)
              out.push(xml.textContent(r));
            break;
          case "frame":
            if (inSpan)
              out.push(frameText(r));
            break;
        }
      return out.join("");
    }
    function frameText(f) {
      return [
        ...f.child && f.child.children || [],
        ...f._extras && f._extras.children || []
      ].map((n) => xml.textContent(n)).join("");
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
    __register({ name: "textHeading", dependencies: ["xml","textParagraph"], factory: function(xml, para) {
    function parseHeading(el, ctx) {
      const p = para.parseParagraph(el, ctx), out = { type: "heading", runs: p.runs };
      if (p.styleName)
        out.styleName = p.styleName;
      if (p._extras) {
        const ex = p._extras;
        if (ex.attrs) {
          delete ex.attrs["text:outline-level"];
          if (!Object.keys(ex.attrs).length)
            delete ex.attrs;
        }
        if (Object.keys(ex).length)
          out._extras = ex;
      }
      const lvl = el.attrs && el.attrs["text:outline-level"], n = parseInt(lvl, 10);
      out.outlineLevel = Number.isFinite(n) && n > 0 ? n : 1;
      return out;
    }
    function renderHeading(h, ctx) {
      const p = { type: "paragraph", runs: h.runs || [] };
      if (h.styleName)
        p.styleName = h.styleName;
      if (h._extras)
        p._extras = h._extras;
      const node = para.renderParagraph(p, ctx);
      node.name = "text:h";
      node.attrs["text:outline-level"] = String(h.outlineLevel || 1);
      return node;
    }
    function heading(textValue, opts) {
      const h = { type: "heading", outlineLevel: opts && opts.outlineLevel || 1, runs: [] };
      if (textValue != null)
        h.runs.push({ type: "text", value: String(textValue) });
      if (opts && opts.styleName)
        h.styleName = opts.styleName;
      return h;
    }
    return { parseHeading, renderHeading, heading };
  } });
    __register({ name: "textList", dependencies: ["xml","textParagraph"], factory: function(xml, para) {
    function parseList(el, hooks, ctx) {
      const out = { type: "list", items: [] }, styleName = el.attrs && el.attrs["text:style-name"];
      if (styleName)
        out.styleName = styleName;
      if (ctx && typeof ctx.listNumbering === "function" && styleName) {
        const num = ctx.listNumbering(styleName);
        if (num) {
          out.ordered = num.ordered;
          if (num.ordered && num.numFormat)
            out.numFormat = num.numFormat;
          if (num.source === "auto")
            delete out.styleName;
        }
      }
      const stack = ctx && Array.isArray(ctx.listStack) ? ctx.listStack : null;
      if (stack && !styleName && out.ordered === void 0 && typeof ctx.listLevel === "function")
        for (let k = stack.length - 1;k >= 0; k--) {
          if (!stack[k])
            continue;
          const num = ctx.listLevel(stack[k], stack.length + 1);
          if (num) {
            out.ordered = num.ordered;
            if (num.ordered && num.numFormat)
              out.numFormat = num.numFormat;
          }
          break;
        }
      const cont = el.attrs && el.attrs["text:continue-numbering"];
      if (cont === "true")
        out.continueNumbering = !0;
      const attrs = el && el.attrs || {};
      if (attrs["xml:id"] != null)
        out.id = attrs["xml:id"];
      if (attrs["text:continue-list"] != null)
        out.continueList = attrs["text:continue-list"];
      const extraAttrs = otherAttrs(attrs, LIST_ATTRS, cont === "true" ? null : "text:continue-numbering");
      if (extraAttrs)
        out.extraAttrs = extraAttrs;
      const extras = [];
      if (stack)
        stack.push(styleName || null);
      try {
        for (const c of el.children || []) {
          if (c.type !== "element")
            continue;
          if (c.name === "text:list-item")
            out.items.push(parseItem(c, hooks, ctx));
          else if (c.name === "text:list-header")
            out.items.push({ ...parseItem(c, hooks, ctx), header: !0 });
          else
            extras.push(c);
        }
      } finally {
        if (stack)
          stack.pop();
      }
      if (extras.length)
        out._extras = { children: extras };
      return out;
    }
    const LIST_ATTRS = new Set(["text:style-name", "text:continue-numbering", "xml:id", "text:continue-list"]), ITEM_ATTRS = new Set(["text:start-value", "xml:id"]);
    function otherAttrs(attrs, typed, keep) {
      const out = {};
      for (const [k, v] of Object.entries(attrs))
        if ((!typed.has(k) || k === keep) && !k.startsWith("xmlns"))
          out[k] = v;
      return Object.keys(out).length ? out : null;
    }
    function parseItem(el, hooks, ctx) {
      const item = { children: [] }, attrs = el && el.attrs || {}, start = attrs["text:start-value"];
      if (start != null)
        item.startValue = /^\d+$/.test(start) ? Number(start) : start;
      if (attrs["xml:id"] != null)
        item.id = attrs["xml:id"];
      const extraAttrs = otherAttrs(attrs, ITEM_ATTRS, null);
      if (extraAttrs)
        item.extraAttrs = extraAttrs;
      const xtra = [];
      for (const c of el.children || []) {
        if (c.type !== "element")
          continue;
        let node = null;
        if (hooks && typeof hooks.parseChild === "function")
          node = hooks.parseChild(c);
        else if (c.name === "text:p")
          node = para.parseParagraph(c);
        else if (c.name === "text:list")
          node = parseList(c, hooks, ctx);
        if (node)
          item.children.push(node);
        else
          xtra.push(c);
      }
      if (xtra.length)
        item._extras = { children: xtra };
      return item;
    }
    function renderList(list, hooks, ctx) {
      const attrs = {};
      if (list.id != null)
        attrs["xml:id"] = String(list.id);
      if (list.styleName)
        attrs["text:style-name"] = list.styleName;
      else if (list.ordered !== void 0 && ctx && typeof ctx.listStyle === "function")
        attrs["text:style-name"] = ctx.listStyle({
          ordered: !!list.ordered,
          numFormat: list.numFormat
        });
      if (list.continueNumbering)
        attrs["text:continue-numbering"] = "true";
      if (list.continueList != null)
        attrs["text:continue-list"] = String(list.continueList);
      Object.assign(attrs, list.extraAttrs || {});
      const items = (list.items || []).map((it) => renderItem(it, hooks, ctx));
      if (list._extras && list._extras.children)
        for (const c of list._extras.children)
          items.push(c);
      return xml.el("text:list", attrs, items);
    }
    function renderItem(item, hooks, ctx) {
      const children = [];
      for (const node of item.children || []) {
        let xmlNode = null;
        if (hooks && typeof hooks.renderChild === "function")
          xmlNode = hooks.renderChild(node);
        else if (node && node.type === "paragraph")
          xmlNode = para.renderParagraph(node);
        else if (node && node.type === "list")
          xmlNode = renderList(node, hooks, ctx);
        else if (node && node.type === "element")
          xmlNode = node;
        if (xmlNode)
          children.push(xmlNode);
      }
      if (item._extras && item._extras.children)
        for (const c of item._extras.children)
          children.push(c);
      const tag = item.header ? "text:list-header" : "text:list-item", attrs = {};
      if (item.startValue != null)
        attrs["text:start-value"] = String(item.startValue);
      if (item.id != null)
        attrs["xml:id"] = String(item.id);
      Object.assign(attrs, item.extraAttrs || {});
      return xml.el(tag, attrs, children);
    }
    return { parseList, renderList };
  } });
    __register({ name: "textSection", dependencies: ["xml"], factory: function(xml) {
    function parseSection(el, hooks) {
      const out = {
        type: "section",
        name: el.attrs && el.attrs["text:name"] || "",
        children: []
      }, sn = el.attrs && el.attrs["text:style-name"];
      if (sn)
        out.styleName = sn;
      const xtraAttrs = {};
      let anyAttr = !1;
      for (const k of Object.keys(el.attrs || {}))
        if (k !== "text:name" && k !== "text:style-name") {
          xtraAttrs[k] = el.attrs[k];
          anyAttr = !0;
        }
      const xtraChildren = [];
      for (const c of el.children || []) {
        if (c.type !== "element")
          continue;
        let node = null;
        if (hooks && typeof hooks.parseChild === "function")
          node = hooks.parseChild(c);
        if (node)
          out.children.push(node);
        else
          out.children.push(c);
      }
      if (anyAttr || xtraChildren.length) {
        out._extras = {};
        if (anyAttr)
          out._extras.attrs = xtraAttrs;
        if (xtraChildren.length)
          out._extras.children = xtraChildren;
      }
      return out;
    }
    function renderSection(sec, hooks) {
      const attrs = { "text:name": sec.name || "" };
      if (sec.styleName)
        attrs["text:style-name"] = sec.styleName;
      if (sec._extras && sec._extras.attrs)
        for (const k of Object.keys(sec._extras.attrs))
          attrs[k] = sec._extras.attrs[k];
      const children = [];
      for (const node of sec.children || []) {
        if (node && node.type === "element") {
          children.push(node);
          continue;
        }
        let x = null;
        if (hooks && typeof hooks.renderChild === "function")
          x = hooks.renderChild(node);
        if (x)
          children.push(x);
      }
      if (sec._extras && sec._extras.children)
        for (const c of sec._extras.children)
          children.push(c);
      return xml.el("text:section", attrs, children);
    }
    return { parseSection, renderSection };
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
      if (attrs["table:visibility"])
        out.visibility = attrs["table:visibility"];
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
      if (row.visibility)
        attrs["table:visibility"] = row.visibility;
      const children = (row.cells && row.cells.length ? row.cells : [{ type: "cell", children: [] }]).map((c) => cellMod.renderCell(c));
      return xml.el("table:table-row", attrs, children);
    }
    return { parseRow, renderRow };
  } });
    __register({ name: "tableTable", dependencies: ["xml","tableRow"], factory: function(xml, rowMod) {
    const ROW_GROUPS = new Set(["table:table-row-group", "table:table-rows"]);
    function parseColumn(el) {
      const out = {}, a = el.attrs || {};
      if (a["table:style-name"])
        out.styleName = a["table:style-name"];
      if (a["table:default-cell-style-name"])
        out.defaultCellStyleName = a["table:default-cell-style-name"];
      const r = parseInt(a["table:number-columns-repeated"], 10);
      if (Number.isFinite(r) && r > 1)
        out.repeated = r;
      if (a["table:visibility"])
        out.visibility = a["table:visibility"];
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
      if (col.visibility)
        a["table:visibility"] = col.visibility;
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
      const breaks = [];
      let pending = [];
      const pushRow = (rowEl) => {
        for (const b of pending) {
          if (b.inExtras)
            extras.splice(extras.indexOf(b.el), 1);
          breaks.push(out.rows.length);
        }
        pending = [];
        out.rows.push(rowMod.parseRow(rowEl));
      };
      for (const c of el.children || []) {
        if (c.type !== "element")
          continue;
        switch (c.name) {
          case "table:table-column":
            out.columns.push(parseColumn(c));
            pending = [];
            break;
          case "table:table-row":
            pushRow(c);
            break;
          case "table:table-header-rows":
            for (const k of c.children || []) {
              if (k.type !== "element")
                continue;
              if (k.name === "table:table-row") {
                pushRow(k);
                headerRows++;
              } else if (k.name === "text:soft-page-break")
                pending.push({ el: k, inExtras: !1 });
            }
            break;
          case "text:soft-page-break":
            extras.push(c);
            pending.push({ el: c, inExtras: !0 });
            break;
          default:
            extras.push(c);
            pending = [];
        }
      }
      if (headerRows > 0)
        out.headerRows = headerRows;
      if (breaks.length)
        out._softPageBreaks = breaks;
      if (extras.length)
        out._extras = { children: extras };
      return out;
    }
    function widthOf(rows) {
      let width = 1;
      for (const r of rows) {
        let pos = 0;
        for (const c of r && r.cells || []) {
          const rep = c.repeated > 1 ? c.repeated : 1, span = c.colSpan > 1 ? c.colSpan : 1;
          width = Math.max(width, pos + rep - 1 + span);
          pos += rep;
        }
      }
      return width;
    }
    function renderTable(t) {
      const attrs = {};
      if (t.name)
        attrs["table:name"] = t.name;
      if (t.styleName)
        attrs["table:style-name"] = t.styleName;
      const children = [], extras = t._extras && t._extras.children || [];
      let rows = t.rows || [];
      const headerN = Math.min(t.headerRows || 0, rows.length);
      if (!rows.length && !extras.some((c) => c && ROW_GROUPS.has(c.name)))
        rows = [{ type: "row", cells: [] }];
      const columns = t.columns && t.columns.length ? t.columns : [{ repeated: widthOf(rows) }];
      for (const col of columns)
        children.push(renderColumn(col));
      const breaksBefore = new Map;
      for (const i of t._softPageBreaks || [])
        breaksBefore.set(i, (breaksBefore.get(i) || 0) + 1);
      const pushRows = (into, from, to) => {
        for (let i = from;i < to; i++) {
          for (let n = breaksBefore.get(i) || 0;n > 0; n--)
            into.push(xml.el("text:soft-page-break", {}, []));
          into.push(rowMod.renderRow(rows[i]));
        }
      };
      if (headerN > 0) {
        const headerKids = [];
        pushRows(headerKids, 0, headerN);
        children.push(xml.el("table:table-header-rows", {}, headerKids));
      }
      pushRows(children, headerN, rows.length);
      if (t._extras && t._extras.children)
        for (const c of t._extras.children)
          children.push(c);
      return xml.el("table:table", attrs, children);
    }
    return { parseTable, renderTable };
  } });
    __register({ name: "textContent", dependencies: ["xml","textParagraph","textHeading","textList","textSection","tableTable"], factory: function(xml, para, heading, list, section, table) {
    const mkHooks = (ctx) => ({
      parseChild: (el) => parseNode(el, ctx),
      renderChild: (node) => renderNode(node, ctx)
    });
    function parseNode(el, ctx) {
      if (!el || el.type !== "element")
        return null;
      switch (el.name) {
        case "text:p":
          return para.parseParagraph(el, ctx);
        case "text:h":
          return heading.parseHeading(el, ctx);
        case "text:list":
          return list.parseList(el, mkHooks(ctx), ctx);
        case "text:section":
          return section.parseSection(el, mkHooks(ctx));
        case "table:table":
          return parseBodyTable(el, ctx);
        case "text:soft-page-break":
          return { type: "soft-page-break" };
        default:
          return { type: "unknown", element: el };
      }
    }
    function renderNode(node, ctx) {
      if (!node)
        return null;
      switch (node.type) {
        case "paragraph":
          return para.renderParagraph(node, ctx);
        case "heading":
          return heading.renderHeading(node, ctx);
        case "list":
          return list.renderList(node, mkHooks(ctx), ctx);
        case "section":
          return section.renderSection(node, mkHooks(ctx));
        case "table":
          return renderBodyTable(node, ctx);
        case "soft-page-break":
          return xml.el("text:soft-page-break", {}, []);
        case "unknown":
          return node.element || null;
        default:
          if (node.type === "element")
            return node;
          return null;
      }
    }
    function parseBodyTable(el, ctx) {
      const t = table.parseTable(el);
      for (const row of t.rows || [])
        for (const cell of row.cells || [])
          cell.children = cell.covered ? [] : (cell.children || []).map((c) => parseNode(c, ctx)).filter(Boolean);
      if (ctx && typeof ctx.cellBorders === "function")
        recogniseGrid(t, ctx);
      return t;
    }
    function recogniseGrid(t, ctx) {
      const cells = [];
      for (const row of t.rows || [])
        for (const cell of row.cells || [])
          if (!cell.covered)
            cells.push(cell);
      if (!cells.length)
        return;
      for (const cell of cells)
        if (!cell.styleName)
          return;
      const consumed = ctx.consumed instanceof Set ? ctx.consumed : null, before = consumed ? new Set(consumed) : null, resolved = [];
      for (const cell of cells) {
        const r = ctx.cellBorders(cell.styleName);
        if (!r || !r.bordered) {
          if (consumed) {
            for (const n of [...consumed])
              if (!before.has(n))
                consumed.delete(n);
          }
          return;
        }
        resolved.push(r);
      }
      t.grid = !0;
      cells.forEach((cell, i) => {
        if (resolved[i].source === "auto")
          delete cell.styleName;
      });
      if (t.styleName && typeof ctx.tableAlign === "function") {
        const a = ctx.tableAlign(t.styleName);
        if (a && a.source === "auto")
          delete t.styleName;
      }
    }
    function renderBodyTable(node, ctx) {
      const grid = node.grid === !0 && !!ctx && typeof ctx.cellStyle === "function", copy = {
        ...node,
        rows: (node.rows || []).map((row) => ({
          ...row,
          cells: (row.cells || []).map((cell) => {
            const c = {
              ...cell,
              children: (cell.children || []).map((n) => renderNode(n, ctx)).filter(Boolean)
            };
            if (grid && !cell.covered)
              c.styleName = cell.styleName || ctx.cellStyle({ bordered: !0 });
            return c;
          })
        }))
      };
      delete copy.grid;
      if (grid)
        copy.styleName = node.styleName || ctx.tableStyle({ align: "margins" });
      return table.renderTable(copy);
    }
    function parseBody(officeTextEl, ctx) {
      const out = [];
      if (!officeTextEl || !officeTextEl.children)
        return out;
      for (const c of officeTextEl.children) {
        if (c.type !== "element")
          continue;
        const node = parseNode(c, ctx);
        if (node)
          out.push(node);
      }
      return out;
    }
    function renderBody(nodes, ctx) {
      const out = [];
      for (const n of nodes || []) {
        const x = renderNode(n, ctx);
        if (x)
          out.push(x);
      }
      return out;
    }
    function bodyText(nodes) {
      const lines = [];
      walk(nodes, lines);
      return lines.join(`
`);
    }
    function boxes(el, lines) {
      if (!el || el.type !== "element")
        return;
      if (el.name === "svg:title" || el.name === "svg:desc")
        return;
      if (el.name === "draw:text-box") {
        const typed = [];
        for (const c of el.children || []) {
          const t = parseNode(c);
          if (t)
            typed.push(t);
        }
        walk(typed, lines);
        return;
      }
      for (const c of el.children || [])
        boxes(c, lines);
    }
    function inlineBoxes(n, lines) {
      const extras = n._extras && n._extras.children;
      if (extras)
        for (const el of extras)
          boxes(el, lines);
      const elementRuns = (runs) => {
        for (const r of runs || [])
          if (r && r.type === "element")
            boxes(r, lines);
      };
      elementRuns(n.runs);
      const visitRuns = (runs, inSpan) => {
        for (const r of runs || []) {
          if (!r)
            continue;
          if (r.type === "span" && Array.isArray(r.runs))
            visitRuns(r.runs, !0);
          else if (r.type === "link") {
            const ex = r._extras && r._extras.children;
            if (ex)
              for (const el of ex)
                boxes(el, lines);
            elementRuns(r.runs);
            visitRuns(r.runs, !1);
          } else if (r.type === "frame" && !inSpan)
            frameBoxes(r, lines);
        }
      };
      visitRuns(n.runs, !1);
    }
    function frameBoxes(f, lines) {
      const c = f.child;
      if (c && c.kind === "text-box" && Array.isArray(c.content))
        walk(c.content, lines);
      else if (c && c.kind === "text-box")
        boxes(xml.el("draw:text-box", { ...c.attrs || {} }, c.children || []), lines);
      for (const el of f._extras && f._extras.children || [])
        boxes(el, lines);
    }
    function walk(nodes, lines) {
      for (const n of nodes || []) {
        if (!n)
          continue;
        if (n.type === "paragraph" || n.type === "heading") {
          lines.push(para.textOf(n));
          inlineBoxes(n, lines);
        } else if (n.type === "unknown")
          boxes(n.element, lines);
        else if (n.type === "list")
          for (const it of n.items || [])
            walk(it.children, lines);
        else if (n.type === "section")
          walk(n.children, lines);
        else if (n.type === "table")
          for (const row of n.rows || [])
            for (const cell of row.cells || [])
              walk(cell.children, lines);
      }
    }
    return { parseNode, renderNode, parseBody, renderBody, bodyText };
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
    __register({ name: "odtWalker", dependencies: ["odfWalker"], factory: function(shared) {
    const CONFIG = {
      rootField: "body",
      recurseFields: ["children", "body", "rows", "cells", "items", "frames", "spans"],
      typeHooks: {
        paragraph: "Paragraph",
        span: "Span",
        heading: "Heading",
        list: "List",
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
      const xtraChildren = [], propertyChildren = {};
      for (const c of el.children || []) {
        if (c.type !== "element")
          continue;
        const key = PROP_TAGS[c.name];
        if (key) {
          out.properties[key] = { ...c.attrs || {} };
          const kids = (c.children || []).filter((k) => k.type === "element");
          if (kids.length)
            propertyChildren[key] = kids;
        } else
          xtraChildren.push(c);
      }
      const anyPropertyChild = Object.keys(propertyChildren).length > 0;
      if (anyAttr || xtraChildren.length || anyPropertyChild) {
        out._extras = {};
        if (anyAttr)
          out._extras.attrs = xa;
        if (xtraChildren.length)
          out._extras.children = xtraChildren;
        if (anyPropertyChild)
          out._extras.propertyChildren = propertyChildren;
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
      const children = [], kept = s._extras && s._extras.propertyChildren || {}, keys = Object.keys(s.properties || {});
      for (const key of Object.keys(kept))
        if (!keys.includes(key))
          keys.push(key);
      for (const key of keys) {
        const tag = TAG_BY_PROP[key];
        if (!tag)
          continue;
        const attrs = s.properties && s.properties[key] || {};
        children.push(xml.el(tag, { ...attrs }, [...kept[key] || []]));
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
    __register({ name: "textStyleRegistry", dependencies: ["xml"], factory: function(xml) {
    const PROP_TAGS = {
      "style:paragraph-properties": "paragraph",
      "style:text-properties": "text",
      "style:table-properties": "table",
      "style:table-column-properties": "tableColumn",
      "style:table-row-properties": "tableRow",
      "style:table-cell-properties": "tableCell",
      "style:graphic-properties": "graphic"
    }, TOLERATED_NAMED_ATTRS = new Set(["style:display-name", "style:class"]), LIST_LEVEL_MARGINS = [
      "1.27cm",
      "1.905cm",
      "2.54cm",
      "3.175cm",
      "3.81cm",
      "4.445cm",
      "5.08cm",
      "5.715cm",
      "6.35cm",
      "6.985cm"
    ], NAME_PART = /^[-.0-9A-Z_a-z\u00B7\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u037D\u037F-\u1FFF\u200C-\u200D\u203F-\u2040\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD\u{10000}-\u{EFFFF}]+$/u, CELL_KEYS = new Set(["fo:border", "fo:padding"]), FLAG_ORDER = [
      ["bold", "b"],
      ["italic", "i"],
      ["strike", "s"],
      ["monospace", "m"]
    ];
    function toSet(v) {
      if (!v)
        return new Set;
      if (v instanceof Set)
        return v;
      return new Set(v);
    }
    function levelPropsEl(level) {
      const ml = LIST_LEVEL_MARGINS[level - 1];
      return xml.el("style:list-level-properties", {
        "text:list-level-position-and-space-mode": "label-alignment"
      }, [
        xml.el("style:list-level-label-alignment", {
          "text:label-followed-by": "listtab",
          "text:list-tab-stop-position": ml,
          "fo:text-indent": "-0.635cm",
          "fo:margin-left": ml
        }, [])
      ]);
    }
    function listStyleEl(entry) {
      const levels = [];
      for (let level = 1;level <= 10; level++)
        levels.push(entry.ordered ? xml.el("text:list-level-style-number", {
          "text:level": String(level),
          "style:num-format": entry.numFormat,
          "style:num-suffix": "."
        }, [levelPropsEl(level)]) : xml.el("text:list-level-style-bullet", {
          "text:level": String(level),
          "text:bullet-char": "\u2022"
        }, [levelPropsEl(level)]));
      return xml.el("text:list-style", { "style:name": entry.name }, levels);
    }
    function sameStyleEl(a, b, ignore) {
      if (!a || !b || a.name !== b.name)
        return !1;
      const attrs = (el) => Object.entries(el.attrs || {}).filter(([k]) => k !== ignore && !k.startsWith("xmlns")), aa = attrs(a), ba = attrs(b);
      if (aa.length !== ba.length || aa.some(([k, v]) => (b.attrs || {})[k] !== v))
        return !1;
      const kids = (el) => (el.children || []).filter((c) => c.type === "element" || c.type === "text" && /\S/.test(c.value || "")), ak = kids(a), bk = kids(b);
      if (ak.length !== bk.length)
        return !1;
      return ak.every((c, i) => c.type === "text" ? bk[i].type === "text" && bk[i].value === c.value : sameStyleEl(c, bk[i], null));
    }
    function createRegistry(reserved) {
      const reservedStyles = toSet(reserved && reserved.styles), reservedFaces = toSet(reserved && reserved.fontFaces), textByKey = new Map, listByKey = new Map;
      let otherFormats = 0;
      const used = new Set;
      let cellName = null, tableName = null, monoFace = null;
      function alloc(base) {
        if (!reservedStyles.has(base) && !used.has(base)) {
          used.add(base);
          return base;
        }
        let i = 2;
        while (reservedStyles.has(`${base}-${i}`) || used.has(`${base}-${i}`))
          i++;
        const name = `${base}-${i}`;
        used.add(name);
        return name;
      }
      function ensureMonoFace() {
        if (monoFace)
          return monoFace;
        let name = "awa-mono";
        if (reservedFaces.has(name)) {
          let i = 2;
          while (reservedFaces.has(`awa-mono-${i}`))
            i++;
          name = `awa-mono-${i}`;
        }
        monoFace = name;
        return name;
      }
      function textStyle(flags) {
        const f = flags || {};
        let key = "";
        for (const [prop, letter] of FLAG_ORDER)
          if (f[prop])
            key += letter;
        const seen = textByKey.get(key);
        if (seen) {
          if (f.monospace)
            ensureMonoFace();
          return seen;
        }
        const name = alloc(`awa-t-${key}`);
        textByKey.set(key, name);
        if (f.monospace)
          ensureMonoFace();
        return name;
      }
      function listStyle(spec) {
        const ordered = !!(spec && spec.ordered), numFormat = ordered ? spec && spec.numFormat || "1" : null, key = ordered ? `n${numFormat}` : "b", seen = listByKey.get(key);
        if (seen)
          return seen.name;
        const name = alloc(!ordered || NAME_PART.test(numFormat) ? `awa-l-${key}` : `awa-l-x${++otherFormats}`);
        listByKey.set(key, { name, ordered, numFormat });
        return name;
      }
      function cellStyle(spec) {
        if (!cellName)
          cellName = alloc("awa-c-b");
        return cellName;
      }
      function tableStyle(spec) {
        if (!tableName)
          tableName = alloc("awa-tb-m");
        return tableName;
      }
      function toAutomaticStyles() {
        if (!textByKey.size && !listByKey.size && !cellName && !tableName)
          return null;
        const styles = [];
        for (const [key, name] of textByKey) {
          const bag = {};
          if (key.includes("b"))
            bag["fo:font-weight"] = "bold";
          if (key.includes("i"))
            bag["fo:font-style"] = "italic";
          if (key.includes("s"))
            bag["style:text-line-through-style"] = "solid";
          if (key.includes("m"))
            bag["style:font-name"] = monoFace;
          styles.push({ name, family: "text", properties: { text: bag } });
        }
        if (cellName)
          styles.push({ name: cellName, family: "table-cell", properties: {
            tableCell: { "fo:border": "0.5pt solid #000000", "fo:padding": "0.097cm" }
          } });
        if (tableName)
          styles.push({ name: tableName, family: "table", properties: {
            table: { "table:align": "margins" }
          } });
        const model = { styles };
        if (listByKey.size) {
          const children = [];
          for (const entry of listByKey.values())
            children.push(listStyleEl(entry));
          model._extras = { children };
        }
        return model;
      }
      function toFontFaceDecls() {
        if (!monoFace)
          return null;
        return xml.el("office:font-face-decls", {}, [
          xml.el("style:font-face", {
            "style:name": monoFace,
            "svg:font-family": "monospace",
            "style:font-family-generic": "modern",
            "style:font-pitch": "fixed"
          }, [])
        ]);
      }
      return {
        textStyle,
        listStyle,
        cellStyle,
        tableStyle,
        toAutomaticStyles,
        toFontFaceDecls
      };
    }
    function typeRawStyle(el) {
      const a = el && el.attrs || {}, out = {
        name: a["style:name"] || "",
        family: a["style:family"] || "",
        properties: {}
      };
      if (a["style:parent-style-name"])
        out.parentStyleName = a["style:parent-style-name"];
      const known = new Set(["style:name", "style:family", "style:parent-style-name"]), extraAttrs = {};
      let anyAttr = !1;
      for (const k of Object.keys(a))
        if (!known.has(k)) {
          extraAttrs[k] = a[k];
          anyAttr = !0;
        }
      const extraChildren = [];
      for (const c of el && el.children || []) {
        if (c.type !== "element")
          continue;
        const key = PROP_TAGS[c.name];
        if (key)
          out.properties[key] = { ...c.attrs || {} };
        else
          extraChildren.push(c);
      }
      if (anyAttr || extraChildren.length) {
        out._extras = {};
        if (anyAttr)
          out._extras.attrs = extraAttrs;
        if (extraChildren.length)
          out._extras.children = extraChildren;
      }
      return out;
    }
    function createResolver(contentAutoStyles, fontFaces, namedStyles, opts) {
      const semantic = !!(opts && opts.semantic === !0), consumed = new Set, autoStyleByName = new Map, autoListByName = new Map, namedStyleByName = new Map, namedListByName = new Map, faceByName = new Map;
      for (const s of contentAutoStyles && contentAutoStyles.styles || [])
        if (s && s.name)
          autoStyleByName.set(s.name, s);
      for (const c of contentAutoStyles && contentAutoStyles._extras && contentAutoStyles._extras.children || [])
        if (c && c.type === "element" && c.name === "text:list-style") {
          const n = c.attrs && c.attrs["style:name"];
          if (n)
            autoListByName.set(n, c);
        }
      for (const f of fontFaces || []) {
        const n = f && f.attrs && f.attrs["style:name"];
        if (n && !faceByName.has(n))
          faceByName.set(n, f);
      }
      for (const el of namedStyles || []) {
        if (!el || el.type !== "element")
          continue;
        const n = el.attrs && el.attrs["style:name"];
        if (!n)
          continue;
        const bucket = el.name === "style:style" ? namedStyleByName : el.name === "text:list-style" ? namedListByName : null;
        if (!bucket)
          continue;
        if (!bucket.has(n))
          bucket.set(n, []);
        bucket.get(n).push(el);
      }
      function isMonoFace(faceName) {
        const el = faceByName.get(faceName);
        if (!el)
          return !1;
        const a = el.attrs || {};
        return a["style:font-pitch"] === "fixed" || a["style:font-family-generic"] === "modern";
      }
      function flagsFromBag(bag) {
        const out = {};
        for (const k of Object.keys(bag)) {
          const v = bag[k];
          if (k === "fo:font-weight") {
            if (v !== "bold")
              return null;
            out.bold = !0;
          } else if (k === "fo:font-style") {
            if (v !== "italic")
              return null;
            out.italic = !0;
          } else if (k === "style:text-line-through-style") {
            if (!v || v === "none")
              return null;
            out.strike = !0;
          } else if (k === "style:font-name") {
            if (!isMonoFace(v))
              return null;
            out.monospace = !0;
          } else
            return null;
        }
        return Object.keys(out).length ? out : null;
      }
      function mapTypedStyle(s, tolerated) {
        const bag = soleBag(s, "text", "text", tolerated);
        return bag ? flagsFromBag(bag) : null;
      }
      function soleBag(s, family, propKey, tolerated) {
        if (!s || s.family !== family)
          return null;
        if (s.parentStyleName)
          return null;
        const props = s.properties || {}, keys = Object.keys(props);
        if (keys.length !== 1 || keys[0] !== propKey)
          return null;
        if (s._extras) {
          if (s._extras.children && s._extras.children.length)
            return null;
          const xa = s._extras.attrs || {};
          for (const k of Object.keys(xa))
            if (!tolerated || !tolerated.has(k))
              return null;
        }
        return props[propKey] || {};
      }
      function mapCellStyle(s, tolerated) {
        const bag = soleBag(s, "table-cell", "tableCell", tolerated);
        if (!bag)
          return null;
        for (const k of Object.keys(bag))
          if (!CELL_KEYS.has(k))
            return null;
        const border = bag["fo:border"];
        if (!border || border === "none")
          return null;
        return { bordered: !0 };
      }
      function mapTableStyle(s, tolerated) {
        const bag = soleBag(s, "table", "table", tolerated);
        if (!bag)
          return null;
        if (Object.keys(bag).length !== 1 || bag["table:align"] !== "margins")
          return null;
        return { align: "margins" };
      }
      function resolveStyle(styleName, map) {
        if (!styleName)
          return null;
        const auto = autoStyleByName.get(styleName);
        if (auto) {
          const got = map(auto, null);
          if (got) {
            consumed.add(styleName);
            return { ...got, source: "auto" };
          }
        }
        for (const el of namedStyleByName.get(styleName) || []) {
          const got = map(typeRawStyle(el), TOLERATED_NAMED_ATTRS);
          if (got)
            return { ...got, source: "named" };
        }
        return null;
      }
      const PARENT_DEPTH_MAX = 16;
      function looseTextFlags(styleName) {
        const named = (n) => {
          const els = namedStyleByName.get(n);
          return els && els.length ? typeRawStyle(els[0]) : null;
        };
        let s = autoStyleByName.get(styleName) || named(styleName);
        if (!s || s.family !== "text")
          return null;
        const chain = [], seen = new Set;
        while (s && chain.length < PARENT_DEPTH_MAX && !seen.has(s.name)) {
          seen.add(s.name);
          chain.unshift(s);
          s = s.parentStyleName ? named(s.parentStyleName) : null;
        }
        const bag = {};
        for (const st of chain)
          Object.assign(bag, st.properties && st.properties.text || {});
        const out = {}, w = bag["fo:font-weight"];
        if (w === "bold" || Number(w) >= 700)
          out.bold = !0;
        const fs = bag["fo:font-style"];
        if (fs === "italic" || fs === "oblique")
          out.italic = !0;
        const lt = bag["style:text-line-through-style"];
        if (lt && lt !== "none")
          out.strike = !0;
        if (bag["style:font-name"] && isMonoFace(bag["style:font-name"]))
          out.monospace = !0;
        return Object.keys(out).length ? { ...out, source: "named" } : null;
      }
      function textFlags(styleName) {
        const strict = resolveStyle(styleName, mapTypedStyle);
        if (strict || !semantic || !styleName)
          return strict;
        return looseTextFlags(styleName);
      }
      function cellBorders(styleName) {
        return resolveStyle(styleName, mapCellStyle);
      }
      function tableAlign(styleName) {
        return resolveStyle(styleName, mapTableStyle);
      }
      function mapListEl(el) {
        for (const c of el && el.children || []) {
          if (c.type !== "element")
            continue;
          if (c.name === "text:list-level-style-number")
            return { ordered: !0, numFormat: c.attrs && c.attrs["style:num-format"] || "1" };
          if (c.name === "text:list-level-style-bullet")
            return { ordered: !1 };
          return null;
        }
        return null;
      }
      function listNumbering(styleName) {
        if (!styleName)
          return null;
        const auto = autoListByName.get(styleName);
        if (auto) {
          const num = mapListEl(auto);
          if (num && sameStyleEl(auto, listStyleEl({ name: styleName, ...num }), "style:name")) {
            consumed.add(styleName);
            return { ...num, source: "auto" };
          }
          if (num)
            return { ...num, source: "kept" };
        }
        for (const el of namedListByName.get(styleName) || []) {
          const num = mapListEl(el);
          if (num)
            return { ...num, source: "named" };
        }
        return null;
      }
      function listLevel(styleName, level) {
        const el = autoListByName.get(styleName) || (namedListByName.get(styleName) || [])[0];
        for (const c of el && el.children || []) {
          if (c.type !== "element" || (c.attrs && c.attrs["text:level"]) !== String(level))
            continue;
          if (c.name === "text:list-level-style-number")
            return { ordered: !0, numFormat: c.attrs && c.attrs["style:num-format"] || "1" };
          if (c.name === "text:list-level-style-bullet")
            return { ordered: !1 };
          return null;
        }
        return null;
      }
      return {
        textFlags,
        listNumbering,
        listLevel,
        cellBorders,
        tableAlign,
        get consumed() {
          return consumed;
        }
      };
    }
    const LEVEL_KINDS = {
      "text:list-level-style-number": "number",
      "text:list-level-style-bullet": "bullet",
      "text:list-level-style-image": "image",
      "text:outline-level-style": "number"
    }, LEVEL_ATTRS = [
      ["style:num-format", "numFormat", "str"],
      ["style:num-prefix", "prefix", "str"],
      ["style:num-suffix", "suffix", "str"],
      ["text:start-value", "startValue", "num"],
      ["text:display-levels", "displayLevels", "num"],
      ["text:bullet-char", "bulletChar", "str"],
      ["text:style-name", "textStyleName", "str"],
      ["style:num-letter-sync", "numLetterSync", "bool"]
    ], ALIGNMENT_ATTRS = [
      ["text:label-followed-by", "labelFollowedBy"],
      ["text:list-tab-stop-position", "tabStopPosition"],
      ["fo:text-indent", "textIndent"],
      ["fo:margin-left", "marginLeft"]
    ], WIDTH_ATTRS = [
      ["text:space-before", "spaceBefore"],
      ["text:min-label-width", "minLabelWidth"],
      ["text:min-label-distance", "minLabelDistance"],
      ["fo:text-align", "textAlign"]
    ], decodeLevelAttr = (codec, v) => codec === "num" ? /^\d+$/.test(v) ? Number(v) : v : codec === "bool" ? v === "true" : v;
    function typedAttrs(el, fields, out, skip) {
      const known = new Set(fields.map((f) => f[0])), rest = {};
      for (const [k, v] of Object.entries(el && el.attrs || {}))
        if (known.has(k)) {
          const f = fields.find((x) => x[0] === k);
          out[f[1]] = f[2] ? decodeLevelAttr(f[2], v) : v;
        } else if (!k.startsWith("xmlns") && k !== skip)
          rest[k] = v;
      return Object.keys(rest).length ? rest : null;
    }
    function levelPosition(props) {
      const pos = { mode: (props.attrs && props.attrs["text:list-level-position-and-space-mode"]) === "label-alignment" ? "label-alignment" : "label-width-and-position" }, rest = typedAttrs(props, WIDTH_ATTRS, pos, "text:list-level-position-and-space-mode"), align = xml.findChild(props, "style:list-level-label-alignment");
      if (align) {
        const alignRest = typedAttrs(align, ALIGNMENT_ATTRS, pos, null);
        if (alignRest)
          pos.alignmentExtraAttrs = alignRest;
      }
      if (rest)
        pos.extraAttrs = rest;
      return pos;
    }
    function typeListStyle(el, source) {
      const levels = [];
      for (const c of el && el.children || []) {
        if (c.type !== "element" || !LEVEL_KINDS[c.name])
          continue;
        const level = { level: Number(c.attrs && c.attrs["text:level"]), kind: LEVEL_KINDS[c.name] }, rest = typedAttrs(c, LEVEL_ATTRS, level, "text:level"), props = xml.findChild(c, "style:list-level-properties");
        if (props)
          level.position = levelPosition(props);
        const text = xml.findChild(c, "style:text-properties");
        if (text)
          level.textProperties = { ...text.attrs };
        if (rest)
          level.extraAttrs = rest;
        levels.push(level);
      }
      return { source, levels };
    }
    function listStylesOf(raw) {
      const out = {}, add = (els, source, isOutline) => {
        for (const el of els || []) {
          if (!el || el.type !== "element")
            continue;
          const outline = el.name === "text:outline-style";
          if (el.name !== "text:list-style" && !(isOutline && outline))
            continue;
          const name = el.attrs && el.attrs["style:name"];
          if (!name || Object.prototype.hasOwnProperty.call(out, name))
            continue;
          out[name] = typeListStyle(el, outline ? "outline" : source);
        }
      };
      add(raw.content, "auto", !1);
      add(raw.styles, "named", !0);
      add(raw.stylesAuto, "styles-auto", !1);
      return out;
    }
    const SECTION_ATTRS = [
      ["fo:background-color", "backgroundColor"],
      ["style:editable", "editable", "bool"],
      ["style:writing-mode", "writingMode"]
    ], COLUMN_ATTRS = [
      ["style:rel-width", "relWidth"],
      ["fo:start-indent", "startIndent"],
      ["fo:end-indent", "endIndent"]
    ], SEPARATOR_ATTRS = [
      ["style:width", "width"],
      ["style:height", "height"],
      ["style:color", "color"],
      ["style:style", "style"],
      ["style:vertical-align", "verticalAlign"]
    ];
    function typeSectionStyle(el, source) {
      const out = { source }, props = xml.findChild(el, "style:section-properties");
      if (!props)
        return out;
      const dontBalance = props.attrs && props.attrs["text:dont-balance-text-columns"];
      if (dontBalance != null)
        out.balance = dontBalance !== "true";
      const rest = typedAttrs(props, SECTION_ATTRS, out, "text:dont-balance-text-columns");
      if (rest)
        out.extraAttrs = rest;
      const cols = xml.findChild(props, "style:columns");
      if (cols) {
        const c = {}, count = cols.attrs && cols.attrs["fo:column-count"];
        if (count != null)
          c.count = /^\d+$/.test(count) ? Number(count) : count;
        if (cols.attrs && cols.attrs["fo:column-gap"] != null)
          c.gap = cols.attrs["fo:column-gap"];
        const list = xml.findAll(cols, "style:column").map((col) => {
          const one = {}, extra = typedAttrs(col, COLUMN_ATTRS, one, null);
          if (extra)
            one.extraAttrs = extra;
          return one;
        });
        if (list.length)
          c.columns = list;
        const sep = xml.findChild(cols, "style:column-sep");
        if (sep) {
          c.separator = {};
          const extra = typedAttrs(sep, SEPARATOR_ATTRS, c.separator, null);
          if (extra)
            c.separator.extraAttrs = extra;
        }
        out.columns = c;
      }
      return out;
    }
    function sectionStylesOf(raw) {
      const out = {}, add = (els, source) => {
        for (const el of els || []) {
          if (!el || el.type !== "element" || el.name !== "style:style")
            continue;
          if (!el.attrs || el.attrs["style:family"] !== "section")
            continue;
          const name = el.attrs["style:name"];
          if (!name || Object.prototype.hasOwnProperty.call(out, name))
            continue;
          out[name] = typeSectionStyle(el, source);
        }
      };
      add(raw.content, "auto");
      add(raw.styles, "named");
      add(raw.stylesAuto, "styles-auto");
      return out;
    }
    return { createRegistry, createResolver, typeListStyle, listStylesOf, typeSectionStyle, sectionStylesOf };
  } });
    __register({ name: "drawImage", dependencies: ["xml"], factory: function(xml) {
    const XLINK_DEFAULTS = {
      "xlink:type": "simple",
      "xlink:show": "embed",
      "xlink:actuate": "onLoad"
    }, CT_BY_MAGIC = [
      { ct: "image/png", test: (b) => b.length >= 8 && b[0] === 137 && b[1] === 80 && b[2] === 78 && b[3] === 71 },
      { ct: "image/jpeg", test: (b) => b.length >= 3 && b[0] === 255 && b[1] === 216 && b[2] === 255 },
      { ct: "image/gif", test: (b) => b.length >= 6 && b[0] === 71 && b[1] === 73 && b[2] === 70 && b[3] === 56 },
      { ct: "image/bmp", test: (b) => b.length >= 2 && b[0] === 66 && b[1] === 77 },
      { ct: "image/webp", test: (b) => b.length >= 12 && b[0] === 82 && b[1] === 73 && b[2] === 70 && b[3] === 70 && b[8] === 87 && b[9] === 69 && b[10] === 66 && b[11] === 80 },
      { ct: "image/tiff", test: (b) => b.length >= 4 && (b[0] === 73 && b[1] === 73 && b[2] === 42 && b[3] === 0 || b[0] === 77 && b[1] === 77 && b[2] === 0 && b[3] === 42) },
      { ct: "image/svg+xml", test: (b) => looksLikeSvg(b) }
    ];
    function looksLikeSvg(bytes) {
      const probe = Math.min(bytes.length, 1024);
      let s = "";
      for (let i = 0;i < probe; i++)
        s += String.fromCharCode(bytes[i]);
      return s.indexOf("<svg") >= 0;
    }
    const EXT_BY_CT = {
      "image/png": "png",
      "image/jpeg": "jpg",
      "image/gif": "gif",
      "image/bmp": "bmp",
      "image/webp": "webp",
      "image/tiff": "tif",
      "image/svg+xml": "svg"
    };
    function parseImage(el) {
      const attrs = el.attrs || {}, out = { type: "image", href: attrs["xlink:href"] || "" }, draw = attrs["draw:mime-type"], lo = attrs["loext:mime-type"];
      if (draw)
        out.mimeType = draw;
      else if (lo) {
        out.mimeType = lo;
        out._mimeTypeAttr = "loext:mime-type";
      }
      const known = new Set([
        "xlink:href",
        "xlink:type",
        "xlink:show",
        "xlink:actuate",
        "draw:mime-type",
        ...draw ? [] : ["loext:mime-type"]
      ]), xa = {};
      let any = !1;
      for (const k of Object.keys(attrs))
        if (!known.has(k)) {
          xa[k] = attrs[k];
          any = !0;
        }
      if (any)
        out._extras = { attrs: xa };
      return out;
    }
    function renderImage(img, opts) {
      const attrs = { "xlink:href": img.href || "" };
      attrs["xlink:type"] = XLINK_DEFAULTS["xlink:type"];
      attrs["xlink:show"] = XLINK_DEFAULTS["xlink:show"];
      attrs["xlink:actuate"] = XLINK_DEFAULTS["xlink:actuate"];
      const name = opts && opts.mimeTypeAsRead && img._mimeTypeAttr || "draw:mime-type";
      if (img.mimeType)
        attrs[name] = img.mimeType;
      if (img._extras && img._extras.attrs)
        for (const k of Object.keys(img._extras.attrs))
          attrs[k] = img._extras.attrs[k];
      return xml.el("draw:image", attrs, []);
    }
    function sniffImageType(bytes) {
      const b = bytes || new Uint8Array(0);
      for (const entry of CT_BY_MAGIC)
        if (entry.test(b))
          return entry.ct;
      return "application/octet-stream";
    }
    function extensionFor(ct) {
      return EXT_BY_CT[ct] || "bin";
    }
    return { parseImage, renderImage, sniffImageType, extensionFor };
  } });
    __register({ name: "drawFrame", dependencies: ["xml","drawImage","odfErrors"], factory: function(xml, imageMod, errors) {
    const ContractError = errors && errors.ContractError;
    function parseFrame(el) {
      const out = { type: "frame" }, a = el.attrs || {};
      if (a["text:anchor-type"])
        out.anchorType = a["text:anchor-type"];
      if (a["draw:name"])
        out.name = a["draw:name"];
      if (a["draw:style-name"])
        out.styleName = a["draw:style-name"];
      if (a["svg:width"])
        out.width = a["svg:width"];
      if (a["svg:height"])
        out.height = a["svg:height"];
      if (a["svg:x"])
        out.x = a["svg:x"];
      if (a["svg:y"])
        out.y = a["svg:y"];
      const known = new Set([
        "text:anchor-type",
        "draw:name",
        "draw:style-name",
        "svg:width",
        "svg:height",
        "svg:x",
        "svg:y"
      ]), xa = {};
      let anyAttr = !1;
      for (const k of Object.keys(a))
        if (!known.has(k)) {
          xa[k] = a[k];
          anyAttr = !0;
        }
      let child = null;
      const xtraChildren = [];
      for (const c of el.children || []) {
        if (c.type !== "element")
          continue;
        if (!child)
          if (c.name === "draw:image")
            child = { kind: "image", ...stripType(imageMod.parseImage(c)) };
          else if (c.name === "draw:text-box") {
            const kids = [];
            for (const k of c.children || [])
              if (k.type === "element")
                kids.push(k);
            child = {
              kind: "text-box",
              children: kids,
              attrs: { ...c.attrs || {} }
            };
          } else if (c.name === "draw:object" || c.name === "draw:object-ole")
            child = {
              kind: "object",
              tag: c.name,
              attrs: { ...c.attrs || {} },
              href: c.attrs && c.attrs["xlink:href"] || void 0
            };
          else
            xtraChildren.push(c);
        else
          xtraChildren.push(c);
      }
      if (child)
        out.child = child;
      if (anyAttr || xtraChildren.length) {
        out._extras = {};
        if (anyAttr)
          out._extras.attrs = xa;
        if (xtraChildren.length)
          out._extras.children = xtraChildren;
      }
      return out;
    }
    function stripType(node) {
      const { type: _type, ...rest } = node;
      return rest;
    }
    function renderFrame(f, opts) {
      const attrs = {};
      if (f.anchorType)
        attrs["text:anchor-type"] = f.anchorType;
      if (f.name)
        attrs["draw:name"] = f.name;
      if (f.styleName)
        attrs["draw:style-name"] = f.styleName;
      if (f.width)
        attrs["svg:width"] = f.width;
      if (f.height)
        attrs["svg:height"] = f.height;
      if (f.x)
        attrs["svg:x"] = f.x;
      if (f.y)
        attrs["svg:y"] = f.y;
      if (f._extras && f._extras.attrs)
        for (const k of Object.keys(f._extras.attrs))
          attrs[k] = f._extras.attrs[k];
      const children = [];
      if (f.child)
        children.push(renderChild(f.child, opts));
      if (f._extras && f._extras.children)
        for (const c of f._extras.children)
          children.push(c);
      return xml.el("draw:frame", attrs, children);
    }
    function renderChild(child, opts) {
      if (!child)
        return null;
      if (child.kind === "image")
        return imageMod.renderImage({
          href: child.href,
          mimeType: child.mimeType,
          _mimeTypeAttr: child._mimeTypeAttr,
          _extras: child._extras
        }, opts);
      if (child.kind === "text-box")
        return xml.el("draw:text-box", { ...child.attrs || {} }, (child.children || []).slice());
      if (child.kind === "object") {
        const tag = child.tag || "draw:object", a = { ...child.attrs || {} };
        if (child.href && !a["xlink:href"])
          a["xlink:href"] = child.href;
        return xml.el(tag, a, []);
      }
      if (!ContractError)
        return null;
      throw new ContractError("odf/contract-error/frame", `drawFrame: unknown frame child kind "${child.kind}" (expected image, text-box or object)`, { context: { kind: child.kind } });
    }
    return { parseFrame, renderFrame };
  } });
    __register({ name: "odt", dependencies: ["odfErrors","odfShared","pkgPackage","xml","pkgMimetype","pkgManifest","odfMeta","odfSettings","odfStyles","textParagraph","textContent","odtWalker","styleAutomatic","textStyleRegistry","drawFrame","drawImage"], factory: function(errors, shared, pkg, xml, mimetypeMod, manifestMod, metaMod, settingsMod, stylesMod, paraMod, contentMod, walkerMod, styleAutoMod, styleRegMod, frameMod, imageMod) {
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
      declareNamespaces,
      keptVersion,
      applyManifestVersion
    } = shared, CT_ODT = CT.ODT, CT_XML = CT.XML, RESERVED_PARTS = new Set(["content.xml", "styles.xml", "meta.xml", "settings.xml"]), walker = walkerMod.createWalker();
    function read(bytes, opts) {
      if (opts && opts.semanticStyles !== void 0 && typeof opts.semanticStyles !== "boolean")
        throw new ContractError("odf/contract-error/odt", "odt: read opts.semanticStyles must be true or false", { context: { module: "odt", argument: "opts.semanticStyles" } });
      const semanticStyles = !!(opts && opts.semanticStyles);
      if (opts && opts.headerFooterContent !== void 0 && typeof opts.headerFooterContent !== "boolean")
        throw new ContractError("odf/contract-error/odt", "odt: read opts.headerFooterContent must be true or false", { context: { module: "odt", argument: "opts.headerFooterContent" } });
      if (opts && opts.textBoxes !== void 0 && typeof opts.textBoxes !== "boolean")
        throw new ContractError("odf/contract-error/odt", "odt: read opts.textBoxes must be true or false", { context: { module: "odt", argument: "opts.textBoxes" } });
      for (const key of ["listStyles", "sectionStyles"])
        if (opts && opts[key] !== void 0 && typeof opts[key] !== "boolean")
          throw new ContractError("odf/contract-error/odt", `odt: read opts.${key} must be true or false`, { context: { module: "odt", argument: `opts.${key}` } });
      if (opts && opts.notes !== void 0 && typeof opts.notes !== "boolean")
        throw new ContractError("odf/contract-error/odt", "odt: read opts.notes must be true or false", { context: { module: "odt", argument: "opts.notes" } });
      const textBoxes = !!(opts && opts.textBoxes);
      if (textBoxes && !(opts && opts.framesInRuns))
        throw new ContractError("odf/contract-error/odt", "odt: read opts.textBoxes needs opts.framesInRuns", { context: { module: "odt", argument: "opts.textBoxes" } });
      const p = pkg.read(bytes, opts);
      if (p.mimetype !== CT_ODT)
        throw new ParseError("odf/parse-error/odt", `odt: unexpected mimetype "${p.mimetype}"`, { context: { expected: CT_ODT, module: "odt" } });
      const contentBytes = p.parts["content.xml"];
      if (!contentBytes)
        throw new ParseError("odf/parse-error/odt", "odt: missing content.xml", { context: { part: "content.xml", module: "odt" } });
      const result = { mimetype: p.mimetype, body: [], package: p };
      readSidecars(result, p, { metaMod, settingsMod, stylesMod });
      const parsed = parseContent(shared.decodeText(contentBytes), result.styles, !!(opts && opts.framesInRuns), !!(opts && opts.elementsInRuns), semanticStyles, textBoxes, !!(opts && opts.notes));
      result.body = parsed.body;
      if (parsed.autoStyles)
        result.autoStyles = parsed.autoStyles;
      if (parsed.fontFaces)
        result.fontFaces = parsed.fontFaces;
      if (opts && (opts.listStyles || opts.sectionStyles) && styleRegMod) {
        const st = result.styles || {}, raw = (content) => ({
          content,
          styles: (st.styles || []).map(asElement),
          stylesAuto: (st.automaticStyles || []).map(asElement)
        });
        if (opts.listStyles)
          result.listStyles = styleRegMod.listStylesOf(raw(parsed.listStyleEls));
        if (opts.sectionStyles)
          result.sectionStyles = styleRegMod.sectionStylesOf(raw(parsed.sectionStyleEls));
      }
      walker.applyHydrate(result);
      if (opts && opts.headerFooterContent)
        typeHeaderFooters(result.styles, !!opts.framesInRuns, !!opts.elementsInRuns, semanticStyles, textBoxes);
      return result;
    }
    const HEADER_FOOTER = new Set([
      "style:header",
      "style:header-left",
      "style:header-first",
      "style:footer",
      "style:footer-left",
      "style:footer-first"
    ]);
    function asElement(n) {
      if (!n || typeof n !== "object")
        return n;
      if (n.type === "element")
        return structuredClone(n);
      if (typeof n.kind === "string")
        return {
          type: "element",
          name: n.kind,
          attrs: { ...n.attrs || {} },
          children: (n.children || []).map(asElement)
        };
      return structuredClone(n);
    }
    function writtenStyles(styles) {
      if (!styles || !walker.hasExtensions)
        return styles;
      const env = { styles: structuredClone(styles) };
      walker.applyDehydrate(env);
      return env.styles || styles;
    }
    function headerReadCtx(styles, framesInRuns, elementsInRuns, semanticStyles, textBoxes) {
      const autoEls = (styles.automaticStyles || []).filter((c) => c && c.type === "element"), autoModel = styleAutoMod ? styleAutoMod.parse(xml.el("office:automatic-styles", {}, autoEls)) : null, resolver = styleRegMod ? styleRegMod.createResolver(autoModel, stylesSidecarFaces(styles), styles.styles || null, semanticStyles ? { semantic: !0 } : void 0) : void 0, ctx = framesInRuns || elementsInRuns || semanticStyles ? {
        ...resolver || {},
        ...framesInRuns ? { parseFrame: frameMod.parseFrame } : {},
        ...elementsInRuns ? { elementsInRuns: !0 } : {},
        ...semanticStyles ? { listStack: [] } : {}
      } : resolver;
      if (textBoxes)
        ctx.parseFrame = (el) => typeBox(frameMod.parseFrame(el), ctx);
      return ctx;
    }
    function typeBox(frame, ctx) {
      const c = frame && frame.child;
      if (c && c.kind === "text-box") {
        c.content = contentMod.parseBody(xml.el("draw:text-box", {}, c.children || []), ctx);
        c._contentRead = structuredClone(c.content);
      }
      return frame;
    }
    function boxAsWritten(frame, ctx) {
      const c = frame && frame.child;
      if (!c || c.kind !== "text-box" || !Array.isArray(c.content) || sameModel(c.content, c._contentRead))
        return frame;
      return { ...frame, child: { ...c, children: contentMod.renderBody(c.content, ctx) } };
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
    function asBag(n) {
      if (!n || n.type !== "element")
        return n;
      return { kind: n.name, attrs: { ...n.attrs || {} }, children: (n.children || []).map(asBag) };
    }
    function writeHeaderFooters(styles, doc) {
      if (!styles)
        return null;
      let flat = null;
      const edited = [];
      for (const mp of [...styles.masterStyles || [], ...styles.masterPages || []]) {
        if (!mp || (mp.name || mp.kind) !== "style:master-page")
          continue;
        for (const c of mp.children || []) {
          if (!c || !HEADER_FOOTER.has(c.name || c.kind) || !Array.isArray(c.content))
            continue;
          const f = c._contentFlags || {};
          flat = flat || writtenStyles(styles);
          const read = contentMod.parseBody(asElement(c), headerReadCtx(flat, !!f.framesInRuns, !!f.elementsInRuns, !!f.semanticStyles, !!f.textBoxes));
          if (!sameModel(read, c.content))
            edited.push(c);
        }
      }
      if (!edited.length || !styleRegMod)
        return null;
      const taken = reservedStyleNamesOf(doc.autoStyles), nameOf = (n) => n && n.attrs && n.attrs["style:name"];
      for (const n of [
        ...flat.styles || [],
        ...flat.automaticStyles || [],
        ...flat.pageLayouts || [],
        ...flat.masterPages || []
      ])
        if (nameOf(n))
          taken.add(nameOf(n));
      const faces = stylesSidecarFaces(flat), registry = styleRegMod.createRegistry({ styles: taken, fontFaces: faces.map(nameOf).filter(Boolean) }), ctx = writeCtx(registry);
      for (const c of edited) {
        const els = contentMod.renderBody(c.content, ctx);
        c.children = c.type === "element" ? els : els.map(asBag);
      }
      const out = new Set, gen = registry.toAutomaticStyles();
      if (gen && styleAutoMod) {
        const rendered = (styleAutoMod.render(gen).children || []).filter((n) => n && n.type === "element");
        styles.automaticStyles = [...styles.automaticStyles || [], ...rendered];
        for (const n of rendered)
          if (nameOf(n))
            out.add(nameOf(n));
      }
      const genFaces = registry.toFontFaceDecls();
      if (genFaces) {
        const kids = styles._extras && styles._extras.children || [], decls = kids.find((n) => n && n.type === "element" && n.name === "office:font-face-decls");
        if (decls)
          decls.children = [...decls.children || [], ...genFaces.children];
        else
          styles._extras = { ...styles._extras || {}, children: [genFaces, ...kids] };
      }
      return out;
    }
    function typeHeaderFooters(styles, framesInRuns, elementsInRuns, semanticStyles, textBoxes) {
      if (!styles)
        return;
      const ctx = headerReadCtx(writtenStyles(styles), framesInRuns, elementsInRuns, semanticStyles, textBoxes);
      for (const mp of [...styles.masterStyles || [], ...styles.masterPages || []]) {
        if (!mp || (mp.name || mp.kind) !== "style:master-page")
          continue;
        for (const c of mp.children || []) {
          if (!c || !HEADER_FOOTER.has(c.name || c.kind))
            continue;
          c.content = contentMod.parseBody(asElement(c), ctx);
          c._contentFlags = semanticStyles ? { framesInRuns, elementsInRuns, semanticStyles } : { framesInRuns, elementsInRuns };
          if (textBoxes)
            c._contentFlags.textBoxes = !0;
        }
      }
    }
    function stylesSidecarFaces(stylesModel) {
      const out = [], extras = stylesModel && stylesModel._extras && stylesModel._extras.children;
      for (const c of extras || []) {
        if (c.type !== "element" || c.name !== "office:font-face-decls")
          continue;
        for (const f of xml.findAll(c, "style:font-face"))
          out.push(f);
      }
      return out;
    }
    function textFontName(style) {
      return style && style.properties && style.properties.text && style.properties.text["style:font-name"];
    }
    function parseContent(xmlString, stylesModel, framesInRuns, elementsInRuns, semanticStyles, textBoxes, notes) {
      const root = parseXmlOrThrow(xmlString, "odt", { part: "content.xml", module: "odt" });
      if (root.name !== "office:document-content")
        throw new ParseError("odf/parse-error/odt", `odt: unexpected content root <${root.name}>`, { context: { part: "content.xml", module: "odt" } });
      const bodyEl = xml.findChild(root, "office:body");
      if (!bodyEl)
        throw new ParseError("odf/parse-error/odt", "odt: missing <office:body> in content.xml", { context: { part: "content.xml", module: "odt" } });
      const declsEl = xml.findChild(root, "office:font-face-decls"), autoEl = xml.findChild(root, "office:automatic-styles"), contentFaces = declsEl ? xml.findAll(declsEl, "style:font-face") : [], autoModel = autoEl && styleAutoMod ? styleAutoMod.parse(autoEl) : null, resolver = styleRegMod ? styleRegMod.createResolver(autoModel, contentFaces.concat(stylesSidecarFaces(stylesModel)), stylesModel && stylesModel.styles || null, semanticStyles ? { semantic: !0 } : void 0) : void 0, textEl = xml.findChild(bodyEl, "office:text"), readCtx = framesInRuns || elementsInRuns || semanticStyles || notes ? {
        ...resolver || {},
        ...framesInRuns ? { parseFrame: frameMod.parseFrame } : {},
        ...elementsInRuns ? { elementsInRuns: !0 } : {},
        ...semanticStyles ? { listStack: [] } : {}
      } : resolver;
      if (textBoxes) {
        const boxCtx = {
          ...(styleRegMod ? styleRegMod.createResolver(autoModel, contentFaces.concat(stylesSidecarFaces(stylesModel)), stylesModel && stylesModel.styles || null, semanticStyles ? { semantic: !0 } : void 0) : void 0) || {},
          ...elementsInRuns ? { elementsInRuns: !0 } : {},
          ...semanticStyles ? { listStack: [] } : {}
        };
        boxCtx.parseFrame = (el) => typeBox(frameMod.parseFrame(el), boxCtx);
        readCtx.parseFrame = boxCtx.parseFrame;
      }
      if (notes)
        readCtx.parseNote = (el) => parseNote(el, readCtx);
      const out = { body: textEl ? contentMod.parseBody(textEl, readCtx) : [] };
      out.listStyleEls = autoEl ? xml.findAll(autoEl, "text:list-style") : [];
      out.sectionStyleEls = autoEl ? xml.findAll(autoEl, "style:style") : [];
      const consumed = resolver ? resolver.consumed : new Set;
      let surfaced = null;
      if (autoModel) {
        const styles = (autoModel.styles || []).filter((s) => !consumed.has(s.name)), extras = (autoModel._extras && autoModel._extras.children || []).filter((c) => !(c.type === "element" && c.name === "text:list-style" && consumed.has(c.attrs && c.attrs["style:name"])));
        if (styles.length || extras.length) {
          surfaced = { styles };
          if (extras.length)
            surfaced._extras = { children: extras };
        }
      }
      if (surfaced)
        out.autoStyles = surfaced;
      const resolvedMono = new Set;
      for (const s of autoModel && autoModel.styles || []) {
        if (!consumed.has(s.name))
          continue;
        const fn = textFontName(s);
        if (fn)
          resolvedMono.add(fn);
      }
      const stillReferenced = new Set;
      for (const s of surfaced && surfaced.styles || []) {
        const fn = textFontName(s);
        if (fn)
          stillReferenced.add(fn);
      }
      const remainingFaces = contentFaces.filter((f) => {
        const n = f.attrs && f.attrs["style:name"];
        return !(resolvedMono.has(n) && !stillReferenced.has(n));
      });
      if (remainingFaces.length)
        out.fontFaces = remainingFaces;
      return out;
    }
    function write(doc, opts) {
      if (!doc)
        throw new ContractError("odf/contract-error/odt", "odt: write needs a document", { context: { module: "odt", argument: "doc" } });
      opts = opts || {};
      if (opts.preserveInput !== void 0 && typeof opts.preserveInput !== "boolean")
        throw new ContractError("odf/contract-error/odt", "odt: write opts.preserveInput must be true or false", { context: { module: "odt", argument: "opts.preserveInput" } });
      const cleanup = cleanupSpec(opts.cleanup);
      if (opts.preserveInput || cleanup.size) {
        const { package: envelope, ...rest } = doc, copy = structuredClone({ doc: rest, opts });
        doc = envelope === void 0 ? copy.doc : { ...copy.doc, package: envelope };
        opts = copy.opts;
      }
      if (cleanup.has("emptyProperties")) {
        dropEmptyAutoProperties(doc.autoStyles);
        dropEmptyPropertyNodes(opts.styles || doc.styles);
      }
      const headerNames = writeHeaderFooters(opts.styles || doc.styles, doc);
      if (walker.hasExtensions) {
        const dehydrated = {
          body: doc.body,
          meta: opts.meta || doc.meta,
          settings: opts.settings || doc.settings,
          styles: opts.styles || doc.styles
        };
        walker.applyDehydrate(dehydrated);
        if (dehydrated.body !== void 0)
          doc = { ...doc, body: dehydrated.body };
        if (dehydrated.meta !== void 0)
          opts = { ...opts, meta: dehydrated.meta };
        if (dehydrated.settings !== void 0)
          opts = { ...opts, settings: dehydrated.settings };
        if (dehydrated.styles !== void 0)
          opts = { ...opts, styles: dehydrated.styles };
      }
      const kept = keptVersion(doc, opts, "odt"), p = pkg.empty(CT_ODT), contentXml = renderContent(doc, headerNames, kept ? kept.of("content.xml") : void 0);
      pkg.setPart(p, "content.xml", encodeText(contentXml), CT_XML);
      writeSidecars(p, doc, opts, { pkg, metaMod, settingsMod, stylesMod }, CT_XML);
      writePictures(p, doc.pictures);
      carryParts(p, doc.package, { pkg, manifestMod });
      applyManifestVersion(p, kept);
      return pkg.write(p, { mtime: opts.mtime });
    }
    const CLEANUPS = new Set(["emptyProperties"]), PROPERTY_ELEMENT = /^style:[a-z-]+-properties$/;
    function cleanupSpec(value) {
      if (value === void 0)
        return new Set;
      if (!(Array.isArray(value) && value.every((n) => CLEANUPS.has(n)) && new Set(value).size === value.length))
        throw new ContractError("odf/contract-error/odt", "odt: write opts.cleanup must be an array of distinct names among: " + [...CLEANUPS].join(", "), { context: { module: "odt", argument: "opts.cleanup" } });
      return new Set(value);
    }
    function dropEmptyAutoProperties(autoStyles) {
      for (const st of autoStyles && autoStyles.styles || []) {
        const kept = st._extras && st._extras.propertyChildren || {};
        for (const key of Object.keys(st.properties || {})) {
          const bag = st.properties[key] || {};
          if (!Object.keys(bag).length && !(kept[key] && kept[key].length))
            delete st.properties[key];
        }
      }
    }
    function dropEmptyPropertyNodes(node) {
      if (!node || typeof node !== "object" || ArrayBuffer.isView(node))
        return;
      if (Array.isArray(node)) {
        for (const n of node)
          dropEmptyPropertyNodes(n);
        return;
      }
      if (Array.isArray(node.children))
        node.children = node.children.filter((c) => !(c && c.type === "element" && PROPERTY_ELEMENT.test(c.name) && !Object.keys(c.attrs || {}).some((k) => k !== "xmlns" && !k.startsWith("xmlns:")) && !(c.children || []).some((k) => k.type === "element" || k.type === "text" && k.value.trim())));
      for (const key of Object.keys(node))
        dropEmptyPropertyNodes(node[key]);
    }
    function writePictures(p, pictures) {
      for (const path of Object.keys(pictures || {})) {
        const bytes = pictures[path];
        if (RESERVED_PARTS.has(path) || path === pkg.MIMETYPE_PATH || path === pkg.MANIFEST_PATH || path === "" || path.startsWith("/") || path.endsWith("/") || path.split("/").includes(".."))
          throw new ContractError("odf/contract-error/odt", `odt: pictures path "${path}" is reserved or invalid`, { context: { module: "odt", argument: "doc.pictures", path } });
        if (!(bytes instanceof Uint8Array))
          throw new ContractError("odf/contract-error/odt", `odt: pictures["${path}"] must be a Uint8Array`, { context: { module: "odt", argument: "doc.pictures", path } });
        pkg.setPart(p, path, bytes, imageMod.sniffImageType(bytes));
      }
    }
    function renderImageRun(r) {
      const frame = { type: "frame", anchorType: r.anchorType || "as-char", child: { kind: "image", href: r.href || "" } };
      if (r.name)
        frame.name = r.name;
      if (r.styleName)
        frame.styleName = r.styleName;
      if (r.width)
        frame.width = r.width;
      if (r.height)
        frame.height = r.height;
      if (r.mimeType)
        frame.child.mimeType = r.mimeType;
      return frameMod.renderFrame(frame);
    }
    function writeCtx(registry, version) {
      const asRead = typeof version === "string" && parseFloat(version) < 1.3, ctx = { ...registry || {}, renderImage: renderImageRun };
      ctx.renderFrame = asRead ? (f) => frameMod.renderFrame(boxAsWritten(f, ctx), { mimeTypeAsRead: !0 }) : (f) => frameMod.renderFrame(boxAsWritten(f, ctx));
      ctx.renderNote = (n) => renderNote(n, ctx);
      return ctx;
    }
    function parseNote(el, ctx) {
      const kids = (el.children || []).filter((c) => c && c.type === "element"), cite = kids.find((c) => c.name === "text:note-citation"), body = kids.find((c) => c.name === "text:note-body"), a = el.attrs || {}, note = { type: "note" };
      if (a["text:id"])
        note.id = a["text:id"];
      note.noteClass = a["text:note-class"] === "endnote" ? "endnote" : "footnote";
      note.citation = cite ? xml.textContent(cite) : "";
      if (cite && cite.attrs && cite.attrs["text:label"])
        note.label = cite.attrs["text:label"];
      note.body = body ? contentMod.parseBody(body, ctx) : [];
      return note;
    }
    function renderNote(n, ctx) {
      const attrs = {};
      if (typeof n.id === "string" && n.id)
        attrs["text:id"] = n.id;
      attrs["text:note-class"] = n.noteClass === "endnote" ? "endnote" : "footnote";
      const citeAttrs = typeof n.label === "string" && n.label ? { "text:label": n.label } : {};
      return xml.el("text:note", attrs, [
        xml.el("text:note-citation", citeAttrs, [xml.text(String(n.citation == null ? "" : n.citation))]),
        xml.el("text:note-body", {}, contentMod.renderBody(Array.isArray(n.body) ? n.body : [], ctx))
      ]);
    }
    function reservedStyleNamesOf(autoStyles) {
      const out = new Set;
      for (const s of autoStyles && autoStyles.styles || [])
        if (s && s.name)
          out.add(s.name);
      for (const c of autoStyles && autoStyles._extras && autoStyles._extras.children || []) {
        const n = c && c.attrs && c.attrs["style:name"];
        if (n)
          out.add(n);
      }
      return out;
    }
    function reservedFaceNamesOf(fontFaces) {
      const out = new Set;
      for (const f of fontFaces || []) {
        const n = f && f.attrs && f.attrs["style:name"];
        if (n)
          out.add(n);
      }
      return out;
    }
    function mergeAutoStyles(docAuto, genAuto) {
      const styles = [], extras = [];
      for (const s of docAuto && docAuto.styles || [])
        styles.push(s);
      for (const c of docAuto && docAuto._extras && docAuto._extras.children || [])
        extras.push(c);
      for (const s of genAuto && genAuto.styles || [])
        styles.push(s);
      for (const c of genAuto && genAuto._extras && genAuto._extras.children || [])
        extras.push(c);
      if (!styles.length && !extras.length)
        return null;
      const model = { styles };
      if (extras.length)
        model._extras = { children: extras };
      return model;
    }
    function renderContent(doc, headerNames, version) {
      const reserved = reservedStyleNamesOf(doc.autoStyles);
      for (const n of headerNames || [])
        reserved.add(n);
      const registry = styleRegMod ? styleRegMod.createRegistry({
        styles: reserved,
        fontFaces: reservedFaceNamesOf(doc.fontFaces)
      }) : void 0, ctx = writeCtx(registry, version), body = contentMod.renderBody(doc.body || [], ctx), textEl = xml.el("office:text", {}, body), bodyEl = xml.el("office:body", {}, [textEl]), rootChildren = [], faces = [];
      for (const f of doc.fontFaces || [])
        faces.push(f);
      const genFaces = registry ? registry.toFontFaceDecls() : null;
      for (const c of genFaces && genFaces.children || [])
        faces.push(c);
      if (faces.length)
        rootChildren.push(xml.el("office:font-face-decls", {}, faces));
      const merged = mergeAutoStyles(doc.autoStyles, registry ? registry.toAutomaticStyles() : null);
      if (merged && styleAutoMod)
        rootChildren.push(styleAutoMod.render(merged));
      rootChildren.push(bodyEl);
      const root = xml.el("office:document-content", {
        "xmlns:office": ODF_NS.OFFICE,
        "xmlns:text": ODF_NS.TEXT,
        "xmlns:style": ODF_NS.STYLE,
        "xmlns:table": ODF_NS.TABLE,
        "xmlns:draw": ODF_NS.DRAW,
        "xmlns:fo": ODF_NS.FO,
        "xmlns:svg": ODF_NS.SVG,
        "xmlns:xlink": ODF_NS.XLINK,
        "office:version": version !== void 0 ? version : ODF_VERSION
      }, rootChildren);
      if (root.attrs["office:version"] === null)
        delete root.attrs["office:version"];
      declareNamespaces(root, {
        carried: sourceNamespaces(doc.package, "content.xml"),
        part: "content.xml",
        module: "odt"
      });
      return xml.serialize(root);
    }
    function empty() {
      return { body: [paraMod.paragraph("")] };
    }
    function paragraph(text, opts) {
      return paraMod.paragraph(text, opts);
    }
    function fromText(strings) {
      return {
        body: (strings || []).map((s) => paraMod.paragraph(String(s)))
      };
    }
    function toText(doc) {
      return contentMod.bodyText(doc.body || []);
    }
    const api = {
      read,
      write,
      empty,
      paragraph,
      fromText,
      toText,
      CT_ODT,
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

    const __core = __resolve("odt");
    return __core;
    }
};
