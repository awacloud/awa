/*!
 * Copyright (c) 2026 AwaCloud SAS
 * Author: Matthieu Bouilloux
 * SPDX-License-Identifier: AGPL-3.0-only
 * Dual-licensed; see the NOTICE file for licensing and any additional terms.
 */
/* GENERATED — do not edit. Source: packages/front/office/md/tools/generate-bundles.mjs */

/**
 * @fileoverview `@awacloud/md/bundles/prebuilt/md-full-bundled` — pre-built single-factory bundle.
 *
 * Variant **bundled** : declares no dependencies — every fw and md-local
 * factory transitively reachable from `md` plus 10 extras is inlined.
 *
 * @module md/bundles/prebuilt/md-full-bundled
 */

export const mdFullBundled = {
    name: "mdFullBundled",
    dependencies: [],
    factory() {
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

    // fw modules — inlined (bundled variant).
    __register({ name: "secPolicy", dependencies: [], factory: function() {
    const URL_ATTRS = new Set([
      "href",
      "src",
      "action",
      "formaction",
      "srcset",
      "xlink:href",
      "data",
      "codebase"
    ]), SCHEME_DANGEROUS_RE = /^(javascript|vbscript|file|jar|data:text|data:application)/, SAFE_SCHEMES = new Set(["http", "https", "mailto", "tel", "ftp"]), DATA_IMAGE_RE = /^data:image\/(png|jpe?g|gif|webp|svg\+xml|bmp|ico|avif|apng);/;
    function isSafeUrl(url, schemes, allowDataImage) {
      if (typeof url !== "string")
        return !1;
      const trimmed = url.replace(/[\x00-\x20\x7f]+/g, "").toLowerCase();
      if (trimmed === "")
        return !0;
      if (trimmed[0] === "#" || trimmed[0] === "/" || trimmed[0] === "?" || trimmed[0] === ".")
        return !0;
      if (SCHEME_DANGEROUS_RE.test(trimmed))
        return !1;
      if (trimmed.startsWith("data:")) {
        if (allowDataImage === !1)
          return !1;
        return DATA_IMAGE_RE.test(trimmed);
      }
      const colon = trimmed.indexOf(":");
      if (colon === -1)
        return !0;
      const slash = trimmed.indexOf("/");
      if (slash !== -1 && slash < colon)
        return !0;
      const allowed = Array.isArray(schemes) ? schemes : SAFE_SCHEMES, scheme = trimmed.slice(0, colon);
      return allowed instanceof Set ? allowed.has(scheme) : allowed.includes(scheme);
    }
    const CLOBBER_ATTRS = new Set(["id", "name"]), CLOBBER_NAMES = new Set([
      "cookie",
      "cookies",
      "domain",
      "location",
      "write",
      "writeln",
      "open",
      "close",
      "body",
      "head",
      "title",
      "URL",
      "referrer",
      "documentElement",
      "documentURI",
      "currentScript",
      "designMode",
      "forms",
      "images",
      "links",
      "scripts",
      "styleSheets",
      "all",
      "embeds",
      "plugins",
      "anchors",
      "applets",
      "parent",
      "top",
      "self",
      "frames",
      "frameElement",
      "opener",
      "elements",
      "submit",
      "reset",
      "method",
      "action"
    ]);
    function isClobberValue(attrName, value) {
      return CLOBBER_ATTRS.has(attrName) && CLOBBER_NAMES.has(String(value));
    }
    const EVENT_ATTR_RE = /^on/i, SAFE_ATTR_NAME_RE = /^[a-zA-Z]/;
    function isEventAttr(name) {
      return typeof name === "string" && EVENT_ATTR_RE.test(name);
    }
    function isSafeAttrName(name) {
      return typeof name === "string" && SAFE_ATTR_NAME_RE.test(name) && !EVENT_ATTR_RE.test(name);
    }
    const BLOCKED_TAGS_RE = /^(script|object|embed|iframe)$/;
    function isBlockedTag(tagName) {
      return typeof tagName === "string" && BLOCKED_TAGS_RE.test(tagName);
    }
    const CSS_DANGEROUS_RE = /expression\(|url\(['"]?(?:javascript|vbscript|data:text|data:application)/, CSS_BLOCKED_PROPS = new Set(["behavior", "-ms-behavior"]);
    function isSafeCss(prop, val) {
      if (typeof prop === "string" && CSS_BLOCKED_PROPS.has(prop.toLowerCase()))
        return !1;
      if (val == null)
        return !0;
      const collapsed = String(val).replace(/[\x00-\x20\x7f]+/g, "").toLowerCase();
      return !CSS_DANGEROUS_RE.test(collapsed);
    }
    return {
      URL_ATTRS,
      SCHEME_DANGEROUS_RE,
      SAFE_SCHEMES,
      DATA_IMAGE_RE,
      isSafeUrl,
      CLOBBER_ATTRS,
      CLOBBER_NAMES,
      isClobberValue,
      EVENT_ATTR_RE,
      SAFE_ATTR_NAME_RE,
      isEventAttr,
      isSafeAttrName,
      BLOCKED_TAGS_RE,
      isBlockedTag,
      CSS_DANGEROUS_RE,
      CSS_BLOCKED_PROPS,
      isSafeCss
    };
  } });
    __register({ name: "sanitize", dependencies: ["secPolicy"], factory: function(secPolicy) {
    const VOID_ELEMENTS = new Set([
      "area",
      "base",
      "br",
      "col",
      "embed",
      "hr",
      "img",
      "input",
      "link",
      "meta",
      "param",
      "source",
      "track",
      "wbr"
    ]), DEFAULT_TAGS = new Set([
      "a",
      "abbr",
      "b",
      "blockquote",
      "br",
      "caption",
      "cite",
      "code",
      "col",
      "colgroup",
      "dd",
      "del",
      "details",
      "dfn",
      "div",
      "dl",
      "dt",
      "em",
      "figcaption",
      "figure",
      "h1",
      "h2",
      "h3",
      "h4",
      "h5",
      "h6",
      "hr",
      "i",
      "img",
      "ins",
      "kbd",
      "li",
      "mark",
      "ol",
      "p",
      "pre",
      "q",
      "s",
      "samp",
      "section",
      "small",
      "span",
      "strong",
      "sub",
      "summary",
      "sup",
      "table",
      "tbody",
      "td",
      "th",
      "thead",
      "tfoot",
      "tr",
      "u",
      "ul",
      "var",
      "wbr"
    ]), DEFAULT_ATTRIBUTES = {
      "*": new Set(["class", "id", "title", "dir", "lang", "tabindex"]),
      a: new Set(["href", "name", "target", "rel"]),
      img: new Set(["src", "alt", "width", "height", "loading"]),
      td: new Set(["colspan", "rowspan", "align", "valign"]),
      th: new Set(["colspan", "rowspan", "align", "valign", "scope"]),
      col: new Set(["span"]),
      colgroup: new Set(["span"]),
      ol: new Set(["start", "type", "reversed"]),
      li: new Set(["value"]),
      q: new Set(["cite"]),
      blockquote: new Set(["cite"]),
      del: new Set(["cite", "datetime"]),
      ins: new Set(["cite", "datetime"]),
      details: new Set(["open"])
    }, DEFAULT_URL_SCHEMES = ["http", "https", "mailto", "tel", "ftp"], defaultAllowlist = {
      tags: DEFAULT_TAGS,
      attributes: DEFAULT_ATTRIBUTES,
      urlSchemes: DEFAULT_URL_SCHEMES
    }, DANGEROUS_CONTENT_TAGS = new Set([
      "script",
      "style",
      "iframe",
      "object",
      "embed",
      "noscript",
      "noembed",
      "noframes",
      "xmp",
      "plaintext",
      "textarea",
      "svg",
      "math",
      "template",
      "link",
      "meta",
      "head",
      "frame",
      "frameset"
    ]), COMMENT_RE = /<!--[\s\S]*?-->/g, TAG_RE = /<\s*(\/\s*)?([a-zA-Z][a-zA-Z0-9-]*)\s*([^>]*?)\s*(\/\s*)?\s*>/g, ATTR_RE = /([a-zA-Z_:][a-zA-Z0-9:._-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'<>`=]+)))?/g;
    function isSafeUrl(url, schemes, allowDataImage) {
      return secPolicy.isSafeUrl(url, schemes ?? DEFAULT_URL_SCHEMES, !!allowDataImage);
    }
    function parseAttrs(soup) {
      const result = {};
      if (!soup)
        return result;
      ATTR_RE.lastIndex = 0;
      let m;
      while ((m = ATTR_RE.exec(soup)) !== null) {
        const name = m[1].toLowerCase(), value = m[2] !== void 0 ? m[2] : m[3] !== void 0 ? m[3] : m[4] !== void 0 ? m[4] : "";
        result[name] = value;
      }
      return result;
    }
    const _BLOCKED_ATTRS = new Set([
      "style",
      "srcdoc",
      "formaction",
      "action",
      "ping",
      "xlink:href",
      "xmlns",
      "xlink:actuate",
      "xlink:show",
      "data-bind"
    ]);
    function isAttrAllowed(attrName, tag, al) {
      if (/^on[a-z]/i.test(attrName))
        return !1;
      if (attrName.startsWith("v-") || attrName.startsWith("ng-") || attrName.startsWith(":") || attrName.startsWith("@"))
        return !1;
      if (_BLOCKED_ATTRS.has(attrName))
        return !1;
      const attrs = al.attributes || DEFAULT_ATTRIBUTES, globalSet = attrs["*"];
      if (globalSet && globalSet.has(attrName))
        return !0;
      const tagSet = attrs[tag];
      if (tagSet && tagSet.has(attrName))
        return !0;
      return !1;
    }
    function buildAttrs(attrs, tag, al) {
      const schemes = al.urlSchemes || DEFAULT_URL_SCHEMES;
      let out = "";
      for (const name of Object.keys(attrs)) {
        if (!isAttrAllowed(name, tag, al))
          continue;
        let value = attrs[name];
        if (name === "href" || name === "src") {
          if (!isSafeUrl(value, schemes, !1))
            continue;
        }
        value = String(value).replace(/[<>"]/g, "").replace(/\s+/g, " ").trim();
        if (name === "href" || name === "src")
          value = value.replace(/[\r\n\t]/g, "");
        out += " " + name + '="' + value + '"';
      }
      if (tag === "a") {
        const href = attrs.href || "", target = (attrs.target || "").toLowerCase().trim();
        if (/^https?:\/\//i.test(href.trim()) && (target === "_blank" || target !== "" && target !== "_self" && target !== "_parent" && target !== "_top")) {
          const existingRel = attrs.rel ? attrs.rel.toLowerCase() : "", hasNoopener = existingRel.includes("noopener"), hasNoreferrer = existingRel.includes("noreferrer");
          if (!hasNoopener || !hasNoreferrer) {
            out = out.replace(/ rel="[^"]*"/, "");
            const relParts = [];
            if (existingRel)
              relParts.push(existingRel);
            if (!hasNoopener)
              relParts.push("noopener");
            if (!hasNoreferrer)
              relParts.push("noreferrer");
            out += ' rel="' + relParts.join(" ").trim() + '"';
          }
        }
      }
      return out;
    }
    function sanitizeHtml(html, opts) {
      if (typeof html !== "string" || html.length === 0)
        return "";
      html = html.replace(/\x00/g, "");
      html = html.replace(COMMENT_RE, "");
      const al = {
        tags: opts && opts.allowedTags ? opts.allowedTags instanceof Set ? opts.allowedTags : new Set(opts.allowedTags) : DEFAULT_TAGS,
        attributes: opts && opts.allowedAttributes !== void 0 ? opts.allowedAttributes : DEFAULT_ATTRIBUTES,
        urlSchemes: opts && opts.urlSchemes ? opts.urlSchemes : DEFAULT_URL_SCHEMES
      }, dropDangerous = !(opts && opts.dropDangerousContent === !1);
      let s = html;
      if (dropDangerous)
        for (const t of DANGEROUS_CONTENT_TAGS) {
          const re = new RegExp("<\\s*" + t + "(\\s[^>]*)?>([\\s\\S]*?)<\\s*\\/\\s*" + t + "\\s*>", "gi");
          s = s.replace(re, "");
          const re2 = new RegExp("<\\s*" + t + "\\b[^>]*>[\\s\\S]*$", "gi");
          s = s.replace(re2, "");
          const re3 = new RegExp("<\\s*" + t + "\\b[^>]*/>", "gi");
          s = s.replace(re3, "");
          const re4 = new RegExp("<\\s*" + t + "\\b[^>]*>", "gi");
          s = s.replace(re4, "");
        }
      const parts = [];
      let lastIndex = 0, m;
      TAG_RE.lastIndex = 0;
      while ((m = TAG_RE.exec(s)) !== null) {
        parts.push(s.slice(lastIndex, m.index));
        lastIndex = m.index + m[0].length;
        const isEnd = !!(m[1] && m[1].trim() === "/"), tag = m[2].toLowerCase(), attrSoup = m[3] || "", isSelfClose = !!(m[4] && m[4].trim() === "/");
        if (!al.tags.has(tag))
          continue;
        if (isEnd) {
          parts.push("</" + tag + ">");
          continue;
        }
        const parsedAttrs = parseAttrs(attrSoup), attrStr = buildAttrs(parsedAttrs, tag, al);
        if (isSelfClose || VOID_ELEMENTS.has(tag))
          parts.push("<" + tag + attrStr + " />");
        else
          parts.push("<" + tag + attrStr + ">");
      }
      parts.push(s.slice(lastIndex));
      return parts.join("");
    }
    return {
      sanitizeHtml,
      isSafeUrl,
      defaultAllowlist
    };
  } });
    __register({ name: "htmlEntities", dependencies: [], factory: function() {
    const HTML5_ENTITIES = JSON.parse('{"AElig":"\xC6","AMP":"&","Aacute":"\xC1","Abreve":"\u0102","Acirc":"\xC2","Acy":"\u0410","Afr":"\uD835\uDD04","Agrave":"\xC0","Alpha":"\u0391","Amacr":"\u0100","And":"\u2A53","Aogon":"\u0104","Aopf":"\uD835\uDD38","ApplyFunction":"\u2061","Aring":"\xC5","Ascr":"\uD835\uDC9C","Assign":"\u2254","Atilde":"\xC3","Auml":"\xC4","Backslash":"\u2216","Barv":"\u2AE7","Barwed":"\u2306","Bcy":"\u0411","Because":"\u2235","Bernoullis":"\u212C","Beta":"\u0392","Bfr":"\uD835\uDD05","Bopf":"\uD835\uDD39","Breve":"\u02D8","Bscr":"\u212C","Bumpeq":"\u224E","CHcy":"\u0427","COPY":"\xA9","Cacute":"\u0106","Cap":"\u22D2","CapitalDifferentialD":"\u2145","Cayleys":"\u212D","Ccaron":"\u010C","Ccedil":"\xC7","Ccirc":"\u0108","Cconint":"\u2230","Cdot":"\u010A","Cedilla":"\xB8","CenterDot":"\xB7","Cfr":"\u212D","Chi":"\u03A7","CircleDot":"\u2299","CircleMinus":"\u2296","CirclePlus":"\u2295","CircleTimes":"\u2297","ClockwiseContourIntegral":"\u2232","CloseCurlyDoubleQuote":"\u201D","CloseCurlyQuote":"\u2019","Colon":"\u2237","Colone":"\u2A74","Congruent":"\u2261","Conint":"\u222F","ContourIntegral":"\u222E","Copf":"\u2102","Coproduct":"\u2210","CounterClockwiseContourIntegral":"\u2233","Cross":"\u2A2F","Cscr":"\uD835\uDC9E","Cup":"\u22D3","CupCap":"\u224D","DD":"\u2145","DDotrahd":"\u2911","DJcy":"\u0402","DScy":"\u0405","DZcy":"\u040F","Dagger":"\u2021","Darr":"\u21A1","Dashv":"\u2AE4","Dcaron":"\u010E","Dcy":"\u0414","Del":"\u2207","Delta":"\u0394","Dfr":"\uD835\uDD07","DiacriticalAcute":"\xB4","DiacriticalDot":"\u02D9","DiacriticalDoubleAcute":"\u02DD","DiacriticalGrave":"`","DiacriticalTilde":"\u02DC","Diamond":"\u22C4","DifferentialD":"\u2146","Dopf":"\uD835\uDD3B","Dot":"\xA8","DotDot":"\u20DC","DotEqual":"\u2250","DoubleContourIntegral":"\u222F","DoubleDot":"\xA8","DoubleDownArrow":"\u21D3","DoubleLeftArrow":"\u21D0","DoubleLeftRightArrow":"\u21D4","DoubleLeftTee":"\u2AE4","DoubleLongLeftArrow":"\u27F8","DoubleLongLeftRightArrow":"\u27FA","DoubleLongRightArrow":"\u27F9","DoubleRightArrow":"\u21D2","DoubleRightTee":"\u22A8","DoubleUpArrow":"\u21D1","DoubleUpDownArrow":"\u21D5","DoubleVerticalBar":"\u2225","DownArrow":"\u2193","DownArrowBar":"\u2913","DownArrowUpArrow":"\u21F5","DownBreve":"\u0311","DownLeftRightVector":"\u2950","DownLeftTeeVector":"\u295E","DownLeftVector":"\u21BD","DownLeftVectorBar":"\u2956","DownRightTeeVector":"\u295F","DownRightVector":"\u21C1","DownRightVectorBar":"\u2957","DownTee":"\u22A4","DownTeeArrow":"\u21A7","Downarrow":"\u21D3","Dscr":"\uD835\uDC9F","Dstrok":"\u0110","ENG":"\u014A","ETH":"\xD0","Eacute":"\xC9","Ecaron":"\u011A","Ecirc":"\xCA","Ecy":"\u042D","Edot":"\u0116","Efr":"\uD835\uDD08","Egrave":"\xC8","Element":"\u2208","Emacr":"\u0112","EmptySmallSquare":"\u25FB","EmptyVerySmallSquare":"\u25AB","Eogon":"\u0118","Eopf":"\uD835\uDD3C","Epsilon":"\u0395","Equal":"\u2A75","EqualTilde":"\u2242","Equilibrium":"\u21CC","Escr":"\u2130","Esim":"\u2A73","Eta":"\u0397","Euml":"\xCB","Exists":"\u2203","ExponentialE":"\u2147","Fcy":"\u0424","Ffr":"\uD835\uDD09","FilledSmallSquare":"\u25FC","FilledVerySmallSquare":"\u25AA","Fopf":"\uD835\uDD3D","ForAll":"\u2200","Fouriertrf":"\u2131","Fscr":"\u2131","GJcy":"\u0403","GT":">","Gamma":"\u0393","Gammad":"\u03DC","Gbreve":"\u011E","Gcedil":"\u0122","Gcirc":"\u011C","Gcy":"\u0413","Gdot":"\u0120","Gfr":"\uD835\uDD0A","Gg":"\u22D9","Gopf":"\uD835\uDD3E","GreaterEqual":"\u2265","GreaterEqualLess":"\u22DB","GreaterFullEqual":"\u2267","GreaterGreater":"\u2AA2","GreaterLess":"\u2277","GreaterSlantEqual":"\u2A7E","GreaterTilde":"\u2273","Gscr":"\uD835\uDCA2","Gt":"\u226B","HARDcy":"\u042A","Hacek":"\u02C7","Hat":"^","Hcirc":"\u0124","Hfr":"\u210C","HilbertSpace":"\u210B","Hopf":"\u210D","HorizontalLine":"\u2500","Hscr":"\u210B","Hstrok":"\u0126","HumpDownHump":"\u224E","HumpEqual":"\u224F","IEcy":"\u0415","IJlig":"\u0132","IOcy":"\u0401","Iacute":"\xCD","Icirc":"\xCE","Icy":"\u0418","Idot":"\u0130","Ifr":"\u2111","Igrave":"\xCC","Im":"\u2111","Imacr":"\u012A","ImaginaryI":"\u2148","Implies":"\u21D2","Int":"\u222C","Integral":"\u222B","Intersection":"\u22C2","InvisibleComma":"\u2063","InvisibleTimes":"\u2062","Iogon":"\u012E","Iopf":"\uD835\uDD40","Iota":"\u0399","Iscr":"\u2110","Itilde":"\u0128","Iukcy":"\u0406","Iuml":"\xCF","Jcirc":"\u0134","Jcy":"\u0419","Jfr":"\uD835\uDD0D","Jopf":"\uD835\uDD41","Jscr":"\uD835\uDCA5","Jsercy":"\u0408","Jukcy":"\u0404","KHcy":"\u0425","KJcy":"\u040C","Kappa":"\u039A","Kcedil":"\u0136","Kcy":"\u041A","Kfr":"\uD835\uDD0E","Kopf":"\uD835\uDD42","Kscr":"\uD835\uDCA6","LJcy":"\u0409","LT":"<","Lacute":"\u0139","Lambda":"\u039B","Lang":"\u27EA","Laplacetrf":"\u2112","Larr":"\u219E","Lcaron":"\u013D","Lcedil":"\u013B","Lcy":"\u041B","LeftAngleBracket":"\u27E8","LeftArrow":"\u2190","LeftArrowBar":"\u21E4","LeftArrowRightArrow":"\u21C6","LeftCeiling":"\u2308","LeftDoubleBracket":"\u27E6","LeftDownTeeVector":"\u2961","LeftDownVector":"\u21C3","LeftDownVectorBar":"\u2959","LeftFloor":"\u230A","LeftRightArrow":"\u2194","LeftRightVector":"\u294E","LeftTee":"\u22A3","LeftTeeArrow":"\u21A4","LeftTeeVector":"\u295A","LeftTriangle":"\u22B2","LeftTriangleBar":"\u29CF","LeftTriangleEqual":"\u22B4","LeftUpDownVector":"\u2951","LeftUpTeeVector":"\u2960","LeftUpVector":"\u21BF","LeftUpVectorBar":"\u2958","LeftVector":"\u21BC","LeftVectorBar":"\u2952","Leftarrow":"\u21D0","Leftrightarrow":"\u21D4","LessEqualGreater":"\u22DA","LessFullEqual":"\u2266","LessGreater":"\u2276","LessLess":"\u2AA1","LessSlantEqual":"\u2A7D","LessTilde":"\u2272","Lfr":"\uD835\uDD0F","Ll":"\u22D8","Lleftarrow":"\u21DA","Lmidot":"\u013F","LongLeftArrow":"\u27F5","LongLeftRightArrow":"\u27F7","LongRightArrow":"\u27F6","Longleftarrow":"\u27F8","Longleftrightarrow":"\u27FA","Longrightarrow":"\u27F9","Lopf":"\uD835\uDD43","LowerLeftArrow":"\u2199","LowerRightArrow":"\u2198","Lscr":"\u2112","Lsh":"\u21B0","Lstrok":"\u0141","Lt":"\u226A","Map":"\u2905","Mcy":"\u041C","MediumSpace":"\u205F","Mellintrf":"\u2133","Mfr":"\uD835\uDD10","MinusPlus":"\u2213","Mopf":"\uD835\uDD44","Mscr":"\u2133","Mu":"\u039C","NJcy":"\u040A","Nacute":"\u0143","Ncaron":"\u0147","Ncedil":"\u0145","Ncy":"\u041D","NegativeMediumSpace":"\u200B","NegativeThickSpace":"\u200B","NegativeThinSpace":"\u200B","NegativeVeryThinSpace":"\u200B","NestedGreaterGreater":"\u226B","NestedLessLess":"\u226A","NewLine":"\\n","Nfr":"\uD835\uDD11","NoBreak":"\u2060","NonBreakingSpace":"\xA0","Nopf":"\u2115","Not":"\u2AEC","NotCongruent":"\u2262","NotCupCap":"\u226D","NotDoubleVerticalBar":"\u2226","NotElement":"\u2209","NotEqual":"\u2260","NotEqualTilde":"\u2242\u0338","NotExists":"\u2204","NotGreater":"\u226F","NotGreaterEqual":"\u2271","NotGreaterFullEqual":"\u2267\u0338","NotGreaterGreater":"\u226B\u0338","NotGreaterLess":"\u2279","NotGreaterSlantEqual":"\u2A7E\u0338","NotGreaterTilde":"\u2275","NotHumpDownHump":"\u224E\u0338","NotHumpEqual":"\u224F\u0338","NotLeftTriangle":"\u22EA","NotLeftTriangleBar":"\u29CF\u0338","NotLeftTriangleEqual":"\u22EC","NotLess":"\u226E","NotLessEqual":"\u2270","NotLessGreater":"\u2278","NotLessLess":"\u226A\u0338","NotLessSlantEqual":"\u2A7D\u0338","NotLessTilde":"\u2274","NotNestedGreaterGreater":"\u2AA2\u0338","NotNestedLessLess":"\u2AA1\u0338","NotPrecedes":"\u2280","NotPrecedesEqual":"\u2AAF\u0338","NotPrecedesSlantEqual":"\u22E0","NotReverseElement":"\u220C","NotRightTriangle":"\u22EB","NotRightTriangleBar":"\u29D0\u0338","NotRightTriangleEqual":"\u22ED","NotSquareSubset":"\u228F\u0338","NotSquareSubsetEqual":"\u22E2","NotSquareSuperset":"\u2290\u0338","NotSquareSupersetEqual":"\u22E3","NotSubset":"\u2282\u20D2","NotSubsetEqual":"\u2288","NotSucceeds":"\u2281","NotSucceedsEqual":"\u2AB0\u0338","NotSucceedsSlantEqual":"\u22E1","NotSucceedsTilde":"\u227F\u0338","NotSuperset":"\u2283\u20D2","NotSupersetEqual":"\u2289","NotTilde":"\u2241","NotTildeEqual":"\u2244","NotTildeFullEqual":"\u2247","NotTildeTilde":"\u2249","NotVerticalBar":"\u2224","Nscr":"\uD835\uDCA9","Ntilde":"\xD1","Nu":"\u039D","OElig":"\u0152","Oacute":"\xD3","Ocirc":"\xD4","Ocy":"\u041E","Odblac":"\u0150","Ofr":"\uD835\uDD12","Ograve":"\xD2","Omacr":"\u014C","Omega":"\u03A9","Omicron":"\u039F","Oopf":"\uD835\uDD46","OpenCurlyDoubleQuote":"\u201C","OpenCurlyQuote":"\u2018","Or":"\u2A54","Oscr":"\uD835\uDCAA","Oslash":"\xD8","Otilde":"\xD5","Otimes":"\u2A37","Ouml":"\xD6","OverBar":"\u203E","OverBrace":"\u23DE","OverBracket":"\u23B4","OverParenthesis":"\u23DC","PartialD":"\u2202","Pcy":"\u041F","Pfr":"\uD835\uDD13","Phi":"\u03A6","Pi":"\u03A0","PlusMinus":"\xB1","Poincareplane":"\u210C","Popf":"\u2119","Pr":"\u2ABB","Precedes":"\u227A","PrecedesEqual":"\u2AAF","PrecedesSlantEqual":"\u227C","PrecedesTilde":"\u227E","Prime":"\u2033","Product":"\u220F","Proportion":"\u2237","Proportional":"\u221D","Pscr":"\uD835\uDCAB","Psi":"\u03A8","QUOT":"\\"","Qfr":"\uD835\uDD14","Qopf":"\u211A","Qscr":"\uD835\uDCAC","RBarr":"\u2910","REG":"\xAE","Racute":"\u0154","Rang":"\u27EB","Rarr":"\u21A0","Rarrtl":"\u2916","Rcaron":"\u0158","Rcedil":"\u0156","Rcy":"\u0420","Re":"\u211C","ReverseElement":"\u220B","ReverseEquilibrium":"\u21CB","ReverseUpEquilibrium":"\u296F","Rfr":"\u211C","Rho":"\u03A1","RightAngleBracket":"\u27E9","RightArrow":"\u2192","RightArrowBar":"\u21E5","RightArrowLeftArrow":"\u21C4","RightCeiling":"\u2309","RightDoubleBracket":"\u27E7","RightDownTeeVector":"\u295D","RightDownVector":"\u21C2","RightDownVectorBar":"\u2955","RightFloor":"\u230B","RightTee":"\u22A2","RightTeeArrow":"\u21A6","RightTeeVector":"\u295B","RightTriangle":"\u22B3","RightTriangleBar":"\u29D0","RightTriangleEqual":"\u22B5","RightUpDownVector":"\u294F","RightUpTeeVector":"\u295C","RightUpVector":"\u21BE","RightUpVectorBar":"\u2954","RightVector":"\u21C0","RightVectorBar":"\u2953","Rightarrow":"\u21D2","Ropf":"\u211D","RoundImplies":"\u2970","Rrightarrow":"\u21DB","Rscr":"\u211B","Rsh":"\u21B1","RuleDelayed":"\u29F4","SHCHcy":"\u0429","SHcy":"\u0428","SOFTcy":"\u042C","Sacute":"\u015A","Sc":"\u2ABC","Scaron":"\u0160","Scedil":"\u015E","Scirc":"\u015C","Scy":"\u0421","Sfr":"\uD835\uDD16","ShortDownArrow":"\u2193","ShortLeftArrow":"\u2190","ShortRightArrow":"\u2192","ShortUpArrow":"\u2191","Sigma":"\u03A3","SmallCircle":"\u2218","Sopf":"\uD835\uDD4A","Sqrt":"\u221A","Square":"\u25A1","SquareIntersection":"\u2293","SquareSubset":"\u228F","SquareSubsetEqual":"\u2291","SquareSuperset":"\u2290","SquareSupersetEqual":"\u2292","SquareUnion":"\u2294","Sscr":"\uD835\uDCAE","Star":"\u22C6","Sub":"\u22D0","Subset":"\u22D0","SubsetEqual":"\u2286","Succeeds":"\u227B","SucceedsEqual":"\u2AB0","SucceedsSlantEqual":"\u227D","SucceedsTilde":"\u227F","SuchThat":"\u220B","Sum":"\u2211","Sup":"\u22D1","Superset":"\u2283","SupersetEqual":"\u2287","Supset":"\u22D1","THORN":"\xDE","TRADE":"\u2122","TSHcy":"\u040B","TScy":"\u0426","Tab":"\\t","Tau":"\u03A4","Tcaron":"\u0164","Tcedil":"\u0162","Tcy":"\u0422","Tfr":"\uD835\uDD17","Therefore":"\u2234","Theta":"\u0398","ThickSpace":"\u205F\u200A","ThinSpace":"\u2009","Tilde":"\u223C","TildeEqual":"\u2243","TildeFullEqual":"\u2245","TildeTilde":"\u2248","Topf":"\uD835\uDD4B","TripleDot":"\u20DB","Tscr":"\uD835\uDCAF","Tstrok":"\u0166","Uacute":"\xDA","Uarr":"\u219F","Uarrocir":"\u2949","Ubrcy":"\u040E","Ubreve":"\u016C","Ucirc":"\xDB","Ucy":"\u0423","Udblac":"\u0170","Ufr":"\uD835\uDD18","Ugrave":"\xD9","Umacr":"\u016A","UnderBar":"_","UnderBrace":"\u23DF","UnderBracket":"\u23B5","UnderParenthesis":"\u23DD","Union":"\u22C3","UnionPlus":"\u228E","Uogon":"\u0172","Uopf":"\uD835\uDD4C","UpArrow":"\u2191","UpArrowBar":"\u2912","UpArrowDownArrow":"\u21C5","UpDownArrow":"\u2195","UpEquilibrium":"\u296E","UpTee":"\u22A5","UpTeeArrow":"\u21A5","Uparrow":"\u21D1","Updownarrow":"\u21D5","UpperLeftArrow":"\u2196","UpperRightArrow":"\u2197","Upsi":"\u03D2","Upsilon":"\u03A5","Uring":"\u016E","Uscr":"\uD835\uDCB0","Utilde":"\u0168","Uuml":"\xDC","VDash":"\u22AB","Vbar":"\u2AEB","Vcy":"\u0412","Vdash":"\u22A9","Vdashl":"\u2AE6","Vee":"\u22C1","Verbar":"\u2016","Vert":"\u2016","VerticalBar":"\u2223","VerticalLine":"|","VerticalSeparator":"\u2758","VerticalTilde":"\u2240","VeryThinSpace":"\u200A","Vfr":"\uD835\uDD19","Vopf":"\uD835\uDD4D","Vscr":"\uD835\uDCB1","Vvdash":"\u22AA","Wcirc":"\u0174","Wedge":"\u22C0","Wfr":"\uD835\uDD1A","Wopf":"\uD835\uDD4E","Wscr":"\uD835\uDCB2","Xfr":"\uD835\uDD1B","Xi":"\u039E","Xopf":"\uD835\uDD4F","Xscr":"\uD835\uDCB3","YAcy":"\u042F","YIcy":"\u0407","YUcy":"\u042E","Yacute":"\xDD","Ycirc":"\u0176","Ycy":"\u042B","Yfr":"\uD835\uDD1C","Yopf":"\uD835\uDD50","Yscr":"\uD835\uDCB4","Yuml":"\u0178","ZHcy":"\u0416","Zacute":"\u0179","Zcaron":"\u017D","Zcy":"\u0417","Zdot":"\u017B","ZeroWidthSpace":"\u200B","Zeta":"\u0396","Zfr":"\u2128","Zopf":"\u2124","Zscr":"\uD835\uDCB5","aacute":"\xE1","abreve":"\u0103","ac":"\u223E","acE":"\u223E\u0333","acd":"\u223F","acirc":"\xE2","acute":"\xB4","acy":"\u0430","aelig":"\xE6","af":"\u2061","afr":"\uD835\uDD1E","agrave":"\xE0","alefsym":"\u2135","aleph":"\u2135","alpha":"\u03B1","amacr":"\u0101","amalg":"\u2A3F","amp":"&","and":"\u2227","andand":"\u2A55","andd":"\u2A5C","andslope":"\u2A58","andv":"\u2A5A","ang":"\u2220","ange":"\u29A4","angle":"\u2220","angmsd":"\u2221","angmsdaa":"\u29A8","angmsdab":"\u29A9","angmsdac":"\u29AA","angmsdad":"\u29AB","angmsdae":"\u29AC","angmsdaf":"\u29AD","angmsdag":"\u29AE","angmsdah":"\u29AF","angrt":"\u221F","angrtvb":"\u22BE","angrtvbd":"\u299D","angsph":"\u2222","angst":"\xC5","angzarr":"\u237C","aogon":"\u0105","aopf":"\uD835\uDD52","ap":"\u2248","apE":"\u2A70","apacir":"\u2A6F","ape":"\u224A","apid":"\u224B","apos":"\'","approx":"\u2248","approxeq":"\u224A","aring":"\xE5","ascr":"\uD835\uDCB6","ast":"*","asymp":"\u2248","asympeq":"\u224D","atilde":"\xE3","auml":"\xE4","awconint":"\u2233","awint":"\u2A11","bNot":"\u2AED","backcong":"\u224C","backepsilon":"\u03F6","backprime":"\u2035","backsim":"\u223D","backsimeq":"\u22CD","barvee":"\u22BD","barwed":"\u2305","barwedge":"\u2305","bbrk":"\u23B5","bbrktbrk":"\u23B6","bcong":"\u224C","bcy":"\u0431","bdquo":"\u201E","becaus":"\u2235","because":"\u2235","bemptyv":"\u29B0","bepsi":"\u03F6","bernou":"\u212C","beta":"\u03B2","beth":"\u2136","between":"\u226C","bfr":"\uD835\uDD1F","bigcap":"\u22C2","bigcirc":"\u25EF","bigcup":"\u22C3","bigodot":"\u2A00","bigoplus":"\u2A01","bigotimes":"\u2A02","bigsqcup":"\u2A06","bigstar":"\u2605","bigtriangledown":"\u25BD","bigtriangleup":"\u25B3","biguplus":"\u2A04","bigvee":"\u22C1","bigwedge":"\u22C0","bkarow":"\u290D","blacklozenge":"\u29EB","blacksquare":"\u25AA","blacktriangle":"\u25B4","blacktriangledown":"\u25BE","blacktriangleleft":"\u25C2","blacktriangleright":"\u25B8","blank":"\u2423","blk12":"\u2592","blk14":"\u2591","blk34":"\u2593","block":"\u2588","bne":"=\u20E5","bnequiv":"\u2261\u20E5","bnot":"\u2310","bopf":"\uD835\uDD53","bot":"\u22A5","bottom":"\u22A5","bowtie":"\u22C8","boxDL":"\u2557","boxDR":"\u2554","boxDl":"\u2556","boxDr":"\u2553","boxH":"\u2550","boxHD":"\u2566","boxHU":"\u2569","boxHd":"\u2564","boxHu":"\u2567","boxUL":"\u255D","boxUR":"\u255A","boxUl":"\u255C","boxUr":"\u2559","boxV":"\u2551","boxVH":"\u256C","boxVL":"\u2563","boxVR":"\u2560","boxVh":"\u256B","boxVl":"\u2562","boxVr":"\u255F","boxbox":"\u29C9","boxdL":"\u2555","boxdR":"\u2552","boxdl":"\u2510","boxdr":"\u250C","boxh":"\u2500","boxhD":"\u2565","boxhU":"\u2568","boxhd":"\u252C","boxhu":"\u2534","boxminus":"\u229F","boxplus":"\u229E","boxtimes":"\u22A0","boxuL":"\u255B","boxuR":"\u2558","boxul":"\u2518","boxur":"\u2514","boxv":"\u2502","boxvH":"\u256A","boxvL":"\u2561","boxvR":"\u255E","boxvh":"\u253C","boxvl":"\u2524","boxvr":"\u251C","bprime":"\u2035","breve":"\u02D8","brvbar":"\xA6","bscr":"\uD835\uDCB7","bsemi":"\u204F","bsim":"\u223D","bsime":"\u22CD","bsol":"\\\\","bsolb":"\u29C5","bsolhsub":"\u27C8","bull":"\u2022","bullet":"\u2022","bump":"\u224E","bumpE":"\u2AAE","bumpe":"\u224F","bumpeq":"\u224F","cacute":"\u0107","cap":"\u2229","capand":"\u2A44","capbrcup":"\u2A49","capcap":"\u2A4B","capcup":"\u2A47","capdot":"\u2A40","caps":"\u2229\uFE00","caret":"\u2041","caron":"\u02C7","ccaps":"\u2A4D","ccaron":"\u010D","ccedil":"\xE7","ccirc":"\u0109","ccups":"\u2A4C","ccupssm":"\u2A50","cdot":"\u010B","cedil":"\xB8","cemptyv":"\u29B2","cent":"\xA2","centerdot":"\xB7","cfr":"\uD835\uDD20","chcy":"\u0447","check":"\u2713","checkmark":"\u2713","chi":"\u03C7","cir":"\u25CB","cirE":"\u29C3","circ":"\u02C6","circeq":"\u2257","circlearrowleft":"\u21BA","circlearrowright":"\u21BB","circledR":"\xAE","circledS":"\u24C8","circledast":"\u229B","circledcirc":"\u229A","circleddash":"\u229D","cire":"\u2257","cirfnint":"\u2A10","cirmid":"\u2AEF","cirscir":"\u29C2","clubs":"\u2663","clubsuit":"\u2663","colon":":","colone":"\u2254","coloneq":"\u2254","comma":",","commat":"@","comp":"\u2201","compfn":"\u2218","complement":"\u2201","complexes":"\u2102","cong":"\u2245","congdot":"\u2A6D","conint":"\u222E","copf":"\uD835\uDD54","coprod":"\u2210","copy":"\xA9","copysr":"\u2117","crarr":"\u21B5","cross":"\u2717","cscr":"\uD835\uDCB8","csub":"\u2ACF","csube":"\u2AD1","csup":"\u2AD0","csupe":"\u2AD2","ctdot":"\u22EF","cudarrl":"\u2938","cudarrr":"\u2935","cuepr":"\u22DE","cuesc":"\u22DF","cularr":"\u21B6","cularrp":"\u293D","cup":"\u222A","cupbrcap":"\u2A48","cupcap":"\u2A46","cupcup":"\u2A4A","cupdot":"\u228D","cupor":"\u2A45","cups":"\u222A\uFE00","curarr":"\u21B7","curarrm":"\u293C","curlyeqprec":"\u22DE","curlyeqsucc":"\u22DF","curlyvee":"\u22CE","curlywedge":"\u22CF","curren":"\xA4","curvearrowleft":"\u21B6","curvearrowright":"\u21B7","cuvee":"\u22CE","cuwed":"\u22CF","cwconint":"\u2232","cwint":"\u2231","cylcty":"\u232D","dArr":"\u21D3","dHar":"\u2965","dagger":"\u2020","daleth":"\u2138","darr":"\u2193","dash":"\u2010","dashv":"\u22A3","dbkarow":"\u290F","dblac":"\u02DD","dcaron":"\u010F","dcy":"\u0434","dd":"\u2146","ddagger":"\u2021","ddarr":"\u21CA","ddotseq":"\u2A77","deg":"\xB0","delta":"\u03B4","demptyv":"\u29B1","dfisht":"\u297F","dfr":"\uD835\uDD21","dharl":"\u21C3","dharr":"\u21C2","diam":"\u22C4","diamond":"\u22C4","diamondsuit":"\u2666","diams":"\u2666","die":"\xA8","digamma":"\u03DD","disin":"\u22F2","div":"\xF7","divide":"\xF7","divideontimes":"\u22C7","divonx":"\u22C7","djcy":"\u0452","dlcorn":"\u231E","dlcrop":"\u230D","dollar":"$","dopf":"\uD835\uDD55","dot":"\u02D9","doteq":"\u2250","doteqdot":"\u2251","dotminus":"\u2238","dotplus":"\u2214","dotsquare":"\u22A1","doublebarwedge":"\u2306","downarrow":"\u2193","downdownarrows":"\u21CA","downharpoonleft":"\u21C3","downharpoonright":"\u21C2","drbkarow":"\u2910","drcorn":"\u231F","drcrop":"\u230C","dscr":"\uD835\uDCB9","dscy":"\u0455","dsol":"\u29F6","dstrok":"\u0111","dtdot":"\u22F1","dtri":"\u25BF","dtrif":"\u25BE","duarr":"\u21F5","duhar":"\u296F","dwangle":"\u29A6","dzcy":"\u045F","dzigrarr":"\u27FF","eDDot":"\u2A77","eDot":"\u2251","eacute":"\xE9","easter":"\u2A6E","ecaron":"\u011B","ecir":"\u2256","ecirc":"\xEA","ecolon":"\u2255","ecy":"\u044D","edot":"\u0117","ee":"\u2147","efDot":"\u2252","efr":"\uD835\uDD22","eg":"\u2A9A","egrave":"\xE8","egs":"\u2A96","egsdot":"\u2A98","el":"\u2A99","elinters":"\u23E7","ell":"\u2113","els":"\u2A95","elsdot":"\u2A97","emacr":"\u0113","empty":"\u2205","emptyset":"\u2205","emptyv":"\u2205","emsp13":"\u2004","emsp14":"\u2005","emsp":"\u2003","eng":"\u014B","ensp":"\u2002","eogon":"\u0119","eopf":"\uD835\uDD56","epar":"\u22D5","eparsl":"\u29E3","eplus":"\u2A71","epsi":"\u03B5","epsilon":"\u03B5","epsiv":"\u03F5","eqcirc":"\u2256","eqcolon":"\u2255","eqsim":"\u2242","eqslantgtr":"\u2A96","eqslantless":"\u2A95","equals":"=","equest":"\u225F","equiv":"\u2261","equivDD":"\u2A78","eqvparsl":"\u29E5","erDot":"\u2253","erarr":"\u2971","escr":"\u212F","esdot":"\u2250","esim":"\u2242","eta":"\u03B7","eth":"\xF0","euml":"\xEB","euro":"\u20AC","excl":"!","exist":"\u2203","expectation":"\u2130","exponentiale":"\u2147","fallingdotseq":"\u2252","fcy":"\u0444","female":"\u2640","ffilig":"\uFB03","fflig":"\uFB00","ffllig":"\uFB04","ffr":"\uD835\uDD23","filig":"\uFB01","fjlig":"fj","flat":"\u266D","fllig":"\uFB02","fltns":"\u25B1","fnof":"\u0192","fopf":"\uD835\uDD57","forall":"\u2200","fork":"\u22D4","forkv":"\u2AD9","fpartint":"\u2A0D","frac12":"\xBD","frac13":"\u2153","frac14":"\xBC","frac15":"\u2155","frac16":"\u2159","frac18":"\u215B","frac23":"\u2154","frac25":"\u2156","frac34":"\xBE","frac35":"\u2157","frac38":"\u215C","frac45":"\u2158","frac56":"\u215A","frac58":"\u215D","frac78":"\u215E","frasl":"\u2044","frown":"\u2322","fscr":"\uD835\uDCBB","gE":"\u2267","gEl":"\u2A8C","gacute":"\u01F5","gamma":"\u03B3","gammad":"\u03DD","gap":"\u2A86","gbreve":"\u011F","gcirc":"\u011D","gcy":"\u0433","gdot":"\u0121","ge":"\u2265","gel":"\u22DB","geq":"\u2265","geqq":"\u2267","geqslant":"\u2A7E","ges":"\u2A7E","gescc":"\u2AA9","gesdot":"\u2A80","gesdoto":"\u2A82","gesdotol":"\u2A84","gesl":"\u22DB\uFE00","gesles":"\u2A94","gfr":"\uD835\uDD24","gg":"\u226B","ggg":"\u22D9","gimel":"\u2137","gjcy":"\u0453","gl":"\u2277","glE":"\u2A92","gla":"\u2AA5","glj":"\u2AA4","gnE":"\u2269","gnap":"\u2A8A","gnapprox":"\u2A8A","gne":"\u2A88","gneq":"\u2A88","gneqq":"\u2269","gnsim":"\u22E7","gopf":"\uD835\uDD58","grave":"`","gscr":"\u210A","gsim":"\u2273","gsime":"\u2A8E","gsiml":"\u2A90","gt":">","gtcc":"\u2AA7","gtcir":"\u2A7A","gtdot":"\u22D7","gtlPar":"\u2995","gtquest":"\u2A7C","gtrapprox":"\u2A86","gtrarr":"\u2978","gtrdot":"\u22D7","gtreqless":"\u22DB","gtreqqless":"\u2A8C","gtrless":"\u2277","gtrsim":"\u2273","gvertneqq":"\u2269\uFE00","gvnE":"\u2269\uFE00","hArr":"\u21D4","hairsp":"\u200A","half":"\xBD","hamilt":"\u210B","hardcy":"\u044A","harr":"\u2194","harrcir":"\u2948","harrw":"\u21AD","hbar":"\u210F","hcirc":"\u0125","hearts":"\u2665","heartsuit":"\u2665","hellip":"\u2026","hercon":"\u22B9","hfr":"\uD835\uDD25","hksearow":"\u2925","hkswarow":"\u2926","hoarr":"\u21FF","homtht":"\u223B","hookleftarrow":"\u21A9","hookrightarrow":"\u21AA","hopf":"\uD835\uDD59","horbar":"\u2015","hscr":"\uD835\uDCBD","hslash":"\u210F","hstrok":"\u0127","hybull":"\u2043","hyphen":"\u2010","iacute":"\xED","ic":"\u2063","icirc":"\xEE","icy":"\u0438","iecy":"\u0435","iexcl":"\xA1","iff":"\u21D4","ifr":"\uD835\uDD26","igrave":"\xEC","ii":"\u2148","iiiint":"\u2A0C","iiint":"\u222D","iinfin":"\u29DC","iiota":"\u2129","ijlig":"\u0133","imacr":"\u012B","image":"\u2111","imagline":"\u2110","imagpart":"\u2111","imath":"\u0131","imof":"\u22B7","imped":"\u01B5","in":"\u2208","incare":"\u2105","infin":"\u221E","infintie":"\u29DD","inodot":"\u0131","int":"\u222B","intcal":"\u22BA","integers":"\u2124","intercal":"\u22BA","intlarhk":"\u2A17","intprod":"\u2A3C","iocy":"\u0451","iogon":"\u012F","iopf":"\uD835\uDD5A","iota":"\u03B9","iprod":"\u2A3C","iquest":"\xBF","iscr":"\uD835\uDCBE","isin":"\u2208","isinE":"\u22F9","isindot":"\u22F5","isins":"\u22F4","isinsv":"\u22F3","isinv":"\u2208","it":"\u2062","itilde":"\u0129","iukcy":"\u0456","iuml":"\xEF","jcirc":"\u0135","jcy":"\u0439","jfr":"\uD835\uDD27","jmath":"\u0237","jopf":"\uD835\uDD5B","jscr":"\uD835\uDCBF","jsercy":"\u0458","jukcy":"\u0454","kappa":"\u03BA","kappav":"\u03F0","kcedil":"\u0137","kcy":"\u043A","kfr":"\uD835\uDD28","kgreen":"\u0138","khcy":"\u0445","kjcy":"\u045C","kopf":"\uD835\uDD5C","kscr":"\uD835\uDCC0","lAarr":"\u21DA","lArr":"\u21D0","lAtail":"\u291B","lBarr":"\u290E","lE":"\u2266","lEg":"\u2A8B","lHar":"\u2962","lacute":"\u013A","laemptyv":"\u29B4","lagran":"\u2112","lambda":"\u03BB","lang":"\u27E8","langd":"\u2991","langle":"\u27E8","lap":"\u2A85","laquo":"\xAB","larr":"\u2190","larrb":"\u21E4","larrbfs":"\u291F","larrfs":"\u291D","larrhk":"\u21A9","larrlp":"\u21AB","larrpl":"\u2939","larrsim":"\u2973","larrtl":"\u21A2","lat":"\u2AAB","latail":"\u2919","late":"\u2AAD","lates":"\u2AAD\uFE00","lbarr":"\u290C","lbbrk":"\u2772","lbrace":"{","lbrack":"[","lbrke":"\u298B","lbrksld":"\u298F","lbrkslu":"\u298D","lcaron":"\u013E","lcedil":"\u013C","lceil":"\u2308","lcub":"{","lcy":"\u043B","ldca":"\u2936","ldquo":"\u201C","ldquor":"\u201E","ldrdhar":"\u2967","ldrushar":"\u294B","ldsh":"\u21B2","le":"\u2264","leftarrow":"\u2190","leftarrowtail":"\u21A2","leftharpoondown":"\u21BD","leftharpoonup":"\u21BC","leftleftarrows":"\u21C7","leftrightarrow":"\u2194","leftrightarrows":"\u21C6","leftrightharpoons":"\u21CB","leftrightsquigarrow":"\u21AD","leftthreetimes":"\u22CB","leg":"\u22DA","leq":"\u2264","leqq":"\u2266","leqslant":"\u2A7D","les":"\u2A7D","lescc":"\u2AA8","lesdot":"\u2A7F","lesdoto":"\u2A81","lesdotor":"\u2A83","lesg":"\u22DA\uFE00","lesges":"\u2A93","lessapprox":"\u2A85","lessdot":"\u22D6","lesseqgtr":"\u22DA","lesseqqgtr":"\u2A8B","lessgtr":"\u2276","lesssim":"\u2272","lfisht":"\u297C","lfloor":"\u230A","lfr":"\uD835\uDD29","lg":"\u2276","lgE":"\u2A91","lhard":"\u21BD","lharu":"\u21BC","lharul":"\u296A","lhblk":"\u2584","ljcy":"\u0459","ll":"\u226A","llarr":"\u21C7","llcorner":"\u231E","llhard":"\u296B","lltri":"\u25FA","lmidot":"\u0140","lmoust":"\u23B0","lmoustache":"\u23B0","lnE":"\u2268","lnap":"\u2A89","lnapprox":"\u2A89","lne":"\u2A87","lneq":"\u2A87","lneqq":"\u2268","lnsim":"\u22E6","loang":"\u27EC","loarr":"\u21FD","lobrk":"\u27E6","longleftarrow":"\u27F5","longleftrightarrow":"\u27F7","longmapsto":"\u27FC","longrightarrow":"\u27F6","looparrowleft":"\u21AB","looparrowright":"\u21AC","lopar":"\u2985","lopf":"\uD835\uDD5D","loplus":"\u2A2D","lotimes":"\u2A34","lowast":"\u2217","lowbar":"_","loz":"\u25CA","lozenge":"\u25CA","lozf":"\u29EB","lpar":"(","lparlt":"\u2993","lrarr":"\u21C6","lrcorner":"\u231F","lrhar":"\u21CB","lrhard":"\u296D","lrm":"\u200E","lrtri":"\u22BF","lsaquo":"\u2039","lscr":"\uD835\uDCC1","lsh":"\u21B0","lsim":"\u2272","lsime":"\u2A8D","lsimg":"\u2A8F","lsqb":"[","lsquo":"\u2018","lsquor":"\u201A","lstrok":"\u0142","lt":"<","ltcc":"\u2AA6","ltcir":"\u2A79","ltdot":"\u22D6","lthree":"\u22CB","ltimes":"\u22C9","ltlarr":"\u2976","ltquest":"\u2A7B","ltrPar":"\u2996","ltri":"\u25C3","ltrie":"\u22B4","ltrif":"\u25C2","lurdshar":"\u294A","luruhar":"\u2966","lvertneqq":"\u2268\uFE00","lvnE":"\u2268\uFE00","mDDot":"\u223A","macr":"\xAF","male":"\u2642","malt":"\u2720","maltese":"\u2720","map":"\u21A6","mapsto":"\u21A6","mapstodown":"\u21A7","mapstoleft":"\u21A4","mapstoup":"\u21A5","marker":"\u25AE","mcomma":"\u2A29","mcy":"\u043C","mdash":"-","measuredangle":"\u2221","mfr":"\uD835\uDD2A","mho":"\u2127","micro":"\xB5","mid":"\u2223","midast":"*","midcir":"\u2AF0","middot":"\xB7","minus":"\u2212","minusb":"\u229F","minusd":"\u2238","minusdu":"\u2A2A","mlcp":"\u2ADB","mldr":"\u2026","mnplus":"\u2213","models":"\u22A7","mopf":"\uD835\uDD5E","mp":"\u2213","mscr":"\uD835\uDCC2","mstpos":"\u223E","mu":"\u03BC","multimap":"\u22B8","mumap":"\u22B8","nGg":"\u22D9\u0338","nGt":"\u226B\u20D2","nGtv":"\u226B\u0338","nLeftarrow":"\u21CD","nLeftrightarrow":"\u21CE","nLl":"\u22D8\u0338","nLt":"\u226A\u20D2","nLtv":"\u226A\u0338","nRightarrow":"\u21CF","nVDash":"\u22AF","nVdash":"\u22AE","nabla":"\u2207","nacute":"\u0144","nang":"\u2220\u20D2","nap":"\u2249","napE":"\u2A70\u0338","napid":"\u224B\u0338","napos":"\u0149","napprox":"\u2249","natur":"\u266E","natural":"\u266E","naturals":"\u2115","nbsp":"\xA0","nbump":"\u224E\u0338","nbumpe":"\u224F\u0338","ncap":"\u2A43","ncaron":"\u0148","ncedil":"\u0146","ncong":"\u2247","ncongdot":"\u2A6D\u0338","ncup":"\u2A42","ncy":"\u043D","ndash":"\u2013","ne":"\u2260","neArr":"\u21D7","nearhk":"\u2924","nearr":"\u2197","nearrow":"\u2197","nedot":"\u2250\u0338","nequiv":"\u2262","nesear":"\u2928","nesim":"\u2242\u0338","nexist":"\u2204","nexists":"\u2204","nfr":"\uD835\uDD2B","ngE":"\u2267\u0338","nge":"\u2271","ngeq":"\u2271","ngeqq":"\u2267\u0338","ngeqslant":"\u2A7E\u0338","nges":"\u2A7E\u0338","ngsim":"\u2275","ngt":"\u226F","ngtr":"\u226F","nhArr":"\u21CE","nharr":"\u21AE","nhpar":"\u2AF2","ni":"\u220B","nis":"\u22FC","nisd":"\u22FA","niv":"\u220B","njcy":"\u045A","nlArr":"\u21CD","nlE":"\u2266\u0338","nlarr":"\u219A","nldr":"\u2025","nle":"\u2270","nleftarrow":"\u219A","nleftrightarrow":"\u21AE","nleq":"\u2270","nleqq":"\u2266\u0338","nleqslant":"\u2A7D\u0338","nles":"\u2A7D\u0338","nless":"\u226E","nlsim":"\u2274","nlt":"\u226E","nltri":"\u22EA","nltrie":"\u22EC","nmid":"\u2224","nopf":"\uD835\uDD5F","not":"\xAC","notin":"\u2209","notinE":"\u22F9\u0338","notindot":"\u22F5\u0338","notinva":"\u2209","notinvb":"\u22F7","notinvc":"\u22F6","notni":"\u220C","notniva":"\u220C","notnivb":"\u22FE","notnivc":"\u22FD","npar":"\u2226","nparallel":"\u2226","nparsl":"\u2AFD\u20E5","npart":"\u2202\u0338","npolint":"\u2A14","npr":"\u2280","nprcue":"\u22E0","npre":"\u2AAF\u0338","nprec":"\u2280","npreceq":"\u2AAF\u0338","nrArr":"\u21CF","nrarr":"\u219B","nrarrc":"\u2933\u0338","nrarrw":"\u219D\u0338","nrightarrow":"\u219B","nrtri":"\u22EB","nrtrie":"\u22ED","nsc":"\u2281","nsccue":"\u22E1","nsce":"\u2AB0\u0338","nscr":"\uD835\uDCC3","nshortmid":"\u2224","nshortparallel":"\u2226","nsim":"\u2241","nsime":"\u2244","nsimeq":"\u2244","nsmid":"\u2224","nspar":"\u2226","nsqsube":"\u22E2","nsqsupe":"\u22E3","nsub":"\u2284","nsubE":"\u2AC5\u0338","nsube":"\u2288","nsubset":"\u2282\u20D2","nsubseteq":"\u2288","nsubseteqq":"\u2AC5\u0338","nsucc":"\u2281","nsucceq":"\u2AB0\u0338","nsup":"\u2285","nsupE":"\u2AC6\u0338","nsupe":"\u2289","nsupset":"\u2283\u20D2","nsupseteq":"\u2289","nsupseteqq":"\u2AC6\u0338","ntgl":"\u2279","ntilde":"\xF1","ntlg":"\u2278","ntriangleleft":"\u22EA","ntrianglelefteq":"\u22EC","ntriangleright":"\u22EB","ntrianglerighteq":"\u22ED","nu":"\u03BD","num":"#","numero":"\u2116","numsp":"\u2007","nvDash":"\u22AD","nvHarr":"\u2904","nvap":"\u224D\u20D2","nvdash":"\u22AC","nvge":"\u2265\u20D2","nvgt":">\u20D2","nvinfin":"\u29DE","nvlArr":"\u2902","nvle":"\u2264\u20D2","nvlt":"<\u20D2","nvltrie":"\u22B4\u20D2","nvrArr":"\u2903","nvrtrie":"\u22B5\u20D2","nvsim":"\u223C\u20D2","nwArr":"\u21D6","nwarhk":"\u2923","nwarr":"\u2196","nwarrow":"\u2196","nwnear":"\u2927","oS":"\u24C8","oacute":"\xF3","oast":"\u229B","ocir":"\u229A","ocirc":"\xF4","ocy":"\u043E","odash":"\u229D","odblac":"\u0151","odiv":"\u2A38","odot":"\u2299","odsold":"\u29BC","oelig":"\u0153","ofcir":"\u29BF","ofr":"\uD835\uDD2C","ogon":"\u02DB","ograve":"\xF2","ogt":"\u29C1","ohbar":"\u29B5","ohm":"\u03A9","oint":"\u222E","olarr":"\u21BA","olcir":"\u29BE","olcross":"\u29BB","oline":"\u203E","olt":"\u29C0","omacr":"\u014D","omega":"\u03C9","omicron":"\u03BF","omid":"\u29B6","ominus":"\u2296","oopf":"\uD835\uDD60","opar":"\u29B7","operp":"\u29B9","oplus":"\u2295","or":"\u2228","orarr":"\u21BB","ord":"\u2A5D","order":"\u2134","orderof":"\u2134","ordf":"\xAA","ordm":"\xBA","origof":"\u22B6","oror":"\u2A56","orslope":"\u2A57","orv":"\u2A5B","oscr":"\u2134","oslash":"\xF8","osol":"\u2298","otilde":"\xF5","otimes":"\u2297","otimesas":"\u2A36","ouml":"\xF6","ovbar":"\u233D","par":"\u2225","para":"\xB6","parallel":"\u2225","parsim":"\u2AF3","parsl":"\u2AFD","part":"\u2202","pcy":"\u043F","percnt":"%","period":".","permil":"\u2030","perp":"\u22A5","pertenk":"\u2031","pfr":"\uD835\uDD2D","phi":"\u03C6","phiv":"\u03D5","phmmat":"\u2133","phone":"\u260E","pi":"\u03C0","pitchfork":"\u22D4","piv":"\u03D6","planck":"\u210F","planckh":"\u210E","plankv":"\u210F","plus":"+","plusacir":"\u2A23","plusb":"\u229E","pluscir":"\u2A22","plusdo":"\u2214","plusdu":"\u2A25","pluse":"\u2A72","plusmn":"\xB1","plussim":"\u2A26","plustwo":"\u2A27","pm":"\xB1","pointint":"\u2A15","popf":"\uD835\uDD61","pound":"\xA3","pr":"\u227A","prE":"\u2AB3","prap":"\u2AB7","prcue":"\u227C","pre":"\u2AAF","prec":"\u227A","precapprox":"\u2AB7","preccurlyeq":"\u227C","preceq":"\u2AAF","precnapprox":"\u2AB9","precneqq":"\u2AB5","precnsim":"\u22E8","precsim":"\u227E","prime":"\u2032","primes":"\u2119","prnE":"\u2AB5","prnap":"\u2AB9","prnsim":"\u22E8","prod":"\u220F","profalar":"\u232E","profline":"\u2312","profsurf":"\u2313","prop":"\u221D","propto":"\u221D","prsim":"\u227E","prurel":"\u22B0","pscr":"\uD835\uDCC5","psi":"\u03C8","puncsp":"\u2008","qfr":"\uD835\uDD2E","qint":"\u2A0C","qopf":"\uD835\uDD62","qprime":"\u2057","qscr":"\uD835\uDCC6","quaternions":"\u210D","quatint":"\u2A16","quest":"?","questeq":"\u225F","quot":"\\"","rAarr":"\u21DB","rArr":"\u21D2","rAtail":"\u291C","rBarr":"\u290F","rHar":"\u2964","race":"\u223D\u0331","racute":"\u0155","radic":"\u221A","raemptyv":"\u29B3","rang":"\u27E9","rangd":"\u2992","range":"\u29A5","rangle":"\u27E9","raquo":"\xBB","rarr":"\u2192","rarrap":"\u2975","rarrb":"\u21E5","rarrbfs":"\u2920","rarrc":"\u2933","rarrfs":"\u291E","rarrhk":"\u21AA","rarrlp":"\u21AC","rarrpl":"\u2945","rarrsim":"\u2974","rarrtl":"\u21A3","rarrw":"\u219D","ratail":"\u291A","ratio":"\u2236","rationals":"\u211A","rbarr":"\u290D","rbbrk":"\u2773","rbrace":"}","rbrack":"]","rbrke":"\u298C","rbrksld":"\u298E","rbrkslu":"\u2990","rcaron":"\u0159","rcedil":"\u0157","rceil":"\u2309","rcub":"}","rcy":"\u0440","rdca":"\u2937","rdldhar":"\u2969","rdquo":"\u201D","rdquor":"\u201D","rdsh":"\u21B3","real":"\u211C","realine":"\u211B","realpart":"\u211C","reals":"\u211D","rect":"\u25AD","reg":"\xAE","rfisht":"\u297D","rfloor":"\u230B","rfr":"\uD835\uDD2F","rhard":"\u21C1","rharu":"\u21C0","rharul":"\u296C","rho":"\u03C1","rhov":"\u03F1","rightarrow":"\u2192","rightarrowtail":"\u21A3","rightharpoondown":"\u21C1","rightharpoonup":"\u21C0","rightleftarrows":"\u21C4","rightleftharpoons":"\u21CC","rightrightarrows":"\u21C9","rightsquigarrow":"\u219D","rightthreetimes":"\u22CC","ring":"\u02DA","risingdotseq":"\u2253","rlarr":"\u21C4","rlhar":"\u21CC","rlm":"\u200F","rmoust":"\u23B1","rmoustache":"\u23B1","rnmid":"\u2AEE","roang":"\u27ED","roarr":"\u21FE","robrk":"\u27E7","ropar":"\u2986","ropf":"\uD835\uDD63","roplus":"\u2A2E","rotimes":"\u2A35","rpar":")","rpargt":"\u2994","rppolint":"\u2A12","rrarr":"\u21C9","rsaquo":"\u203A","rscr":"\uD835\uDCC7","rsh":"\u21B1","rsqb":"]","rsquo":"\u2019","rsquor":"\u2019","rthree":"\u22CC","rtimes":"\u22CA","rtri":"\u25B9","rtrie":"\u22B5","rtrif":"\u25B8","rtriltri":"\u29CE","ruluhar":"\u2968","rx":"\u211E","sacute":"\u015B","sbquo":"\u201A","sc":"\u227B","scE":"\u2AB4","scap":"\u2AB8","scaron":"\u0161","sccue":"\u227D","sce":"\u2AB0","scedil":"\u015F","scirc":"\u015D","scnE":"\u2AB6","scnap":"\u2ABA","scnsim":"\u22E9","scpolint":"\u2A13","scsim":"\u227F","scy":"\u0441","sdot":"\u22C5","sdotb":"\u22A1","sdote":"\u2A66","seArr":"\u21D8","searhk":"\u2925","searr":"\u2198","searrow":"\u2198","sect":"\xA7","semi":";","seswar":"\u2929","setminus":"\u2216","setmn":"\u2216","sext":"\u2736","sfr":"\uD835\uDD30","sfrown":"\u2322","sharp":"\u266F","shchcy":"\u0449","shcy":"\u0448","shortmid":"\u2223","shortparallel":"\u2225","shy":"\xAD","sigma":"\u03C3","sigmaf":"\u03C2","sigmav":"\u03C2","sim":"\u223C","simdot":"\u2A6A","sime":"\u2243","simeq":"\u2243","simg":"\u2A9E","simgE":"\u2AA0","siml":"\u2A9D","simlE":"\u2A9F","simne":"\u2246","simplus":"\u2A24","simrarr":"\u2972","slarr":"\u2190","smallsetminus":"\u2216","smashp":"\u2A33","smeparsl":"\u29E4","smid":"\u2223","smile":"\u2323","smt":"\u2AAA","smte":"\u2AAC","smtes":"\u2AAC\uFE00","softcy":"\u044C","sol":"/","solb":"\u29C4","solbar":"\u233F","sopf":"\uD835\uDD64","spades":"\u2660","spadesuit":"\u2660","spar":"\u2225","sqcap":"\u2293","sqcaps":"\u2293\uFE00","sqcup":"\u2294","sqcups":"\u2294\uFE00","sqsub":"\u228F","sqsube":"\u2291","sqsubset":"\u228F","sqsubseteq":"\u2291","sqsup":"\u2290","sqsupe":"\u2292","sqsupset":"\u2290","sqsupseteq":"\u2292","squ":"\u25A1","square":"\u25A1","squarf":"\u25AA","squf":"\u25AA","srarr":"\u2192","sscr":"\uD835\uDCC8","ssetmn":"\u2216","ssmile":"\u2323","sstarf":"\u22C6","star":"\u2606","starf":"\u2605","straightepsilon":"\u03F5","straightphi":"\u03D5","strns":"\xAF","sub":"\u2282","subE":"\u2AC5","subdot":"\u2ABD","sube":"\u2286","subedot":"\u2AC3","submult":"\u2AC1","subnE":"\u2ACB","subne":"\u228A","subplus":"\u2ABF","subrarr":"\u2979","subset":"\u2282","subseteq":"\u2286","subseteqq":"\u2AC5","subsetneq":"\u228A","subsetneqq":"\u2ACB","subsim":"\u2AC7","subsub":"\u2AD5","subsup":"\u2AD3","succ":"\u227B","succapprox":"\u2AB8","succcurlyeq":"\u227D","succeq":"\u2AB0","succnapprox":"\u2ABA","succneqq":"\u2AB6","succnsim":"\u22E9","succsim":"\u227F","sum":"\u2211","sung":"\u266A","sup1":"\xB9","sup2":"\xB2","sup3":"\xB3","sup":"\u2283","supE":"\u2AC6","supdot":"\u2ABE","supdsub":"\u2AD8","supe":"\u2287","supedot":"\u2AC4","suphsol":"\u27C9","suphsub":"\u2AD7","suplarr":"\u297B","supmult":"\u2AC2","supnE":"\u2ACC","supne":"\u228B","supplus":"\u2AC0","supset":"\u2283","supseteq":"\u2287","supseteqq":"\u2AC6","supsetneq":"\u228B","supsetneqq":"\u2ACC","supsim":"\u2AC8","supsub":"\u2AD4","supsup":"\u2AD6","swArr":"\u21D9","swarhk":"\u2926","swarr":"\u2199","swarrow":"\u2199","swnwar":"\u292A","szlig":"\xDF","target":"\u2316","tau":"\u03C4","tbrk":"\u23B4","tcaron":"\u0165","tcedil":"\u0163","tcy":"\u0442","tdot":"\u20DB","telrec":"\u2315","tfr":"\uD835\uDD31","there4":"\u2234","therefore":"\u2234","theta":"\u03B8","thetasym":"\u03D1","thetav":"\u03D1","thickapprox":"\u2248","thicksim":"\u223C","thinsp":"\u2009","thkap":"\u2248","thksim":"\u223C","thorn":"\xFE","tilde":"\u02DC","times":"\xD7","timesb":"\u22A0","timesbar":"\u2A31","timesd":"\u2A30","tint":"\u222D","toea":"\u2928","top":"\u22A4","topbot":"\u2336","topcir":"\u2AF1","topf":"\uD835\uDD65","topfork":"\u2ADA","tosa":"\u2929","tprime":"\u2034","trade":"\u2122","triangle":"\u25B5","triangledown":"\u25BF","triangleleft":"\u25C3","trianglelefteq":"\u22B4","triangleq":"\u225C","triangleright":"\u25B9","trianglerighteq":"\u22B5","tridot":"\u25EC","trie":"\u225C","triminus":"\u2A3A","triplus":"\u2A39","trisb":"\u29CD","tritime":"\u2A3B","trpezium":"\u23E2","tscr":"\uD835\uDCC9","tscy":"\u0446","tshcy":"\u045B","tstrok":"\u0167","twixt":"\u226C","twoheadleftarrow":"\u219E","twoheadrightarrow":"\u21A0","uArr":"\u21D1","uHar":"\u2963","uacute":"\xFA","uarr":"\u2191","ubrcy":"\u045E","ubreve":"\u016D","ucirc":"\xFB","ucy":"\u0443","udarr":"\u21C5","udblac":"\u0171","udhar":"\u296E","ufisht":"\u297E","ufr":"\uD835\uDD32","ugrave":"\xF9","uharl":"\u21BF","uharr":"\u21BE","uhblk":"\u2580","ulcorn":"\u231C","ulcorner":"\u231C","ulcrop":"\u230F","ultri":"\u25F8","umacr":"\u016B","uml":"\xA8","uogon":"\u0173","uopf":"\uD835\uDD66","uparrow":"\u2191","updownarrow":"\u2195","upharpoonleft":"\u21BF","upharpoonright":"\u21BE","uplus":"\u228E","upsi":"\u03C5","upsih":"\u03D2","upsilon":"\u03C5","upuparrows":"\u21C8","urcorn":"\u231D","urcorner":"\u231D","urcrop":"\u230E","uring":"\u016F","urtri":"\u25F9","uscr":"\uD835\uDCCA","utdot":"\u22F0","utilde":"\u0169","utri":"\u25B5","utrif":"\u25B4","uuarr":"\u21C8","uuml":"\xFC","uwangle":"\u29A7","vArr":"\u21D5","vBar":"\u2AE8","vBarv":"\u2AE9","vDash":"\u22A8","vangrt":"\u299C","varepsilon":"\u03F5","varkappa":"\u03F0","varnothing":"\u2205","varphi":"\u03D5","varpi":"\u03D6","varpropto":"\u221D","varr":"\u2195","varrho":"\u03F1","varsigma":"\u03C2","varsubsetneq":"\u228A\uFE00","varsubsetneqq":"\u2ACB\uFE00","varsupsetneq":"\u228B\uFE00","varsupsetneqq":"\u2ACC\uFE00","vartheta":"\u03D1","vartriangleleft":"\u22B2","vartriangleright":"\u22B3","vcy":"\u0432","vdash":"\u22A2","vee":"\u2228","veebar":"\u22BB","veeeq":"\u225A","vellip":"\u22EE","verbar":"|","vert":"|","vfr":"\uD835\uDD33","vltri":"\u22B2","vnsub":"\u2282\u20D2","vnsup":"\u2283\u20D2","vopf":"\uD835\uDD67","vprop":"\u221D","vrtri":"\u22B3","vscr":"\uD835\uDCCB","vsubnE":"\u2ACB\uFE00","vsubne":"\u228A\uFE00","vsupnE":"\u2ACC\uFE00","vsupne":"\u228B\uFE00","vzigzag":"\u299A","wcirc":"\u0175","wedbar":"\u2A5F","wedge":"\u2227","wedgeq":"\u2259","weierp":"\u2118","wfr":"\uD835\uDD34","wopf":"\uD835\uDD68","wp":"\u2118","wr":"\u2240","wreath":"\u2240","wscr":"\uD835\uDCCC","xcap":"\u22C2","xcirc":"\u25EF","xcup":"\u22C3","xdtri":"\u25BD","xfr":"\uD835\uDD35","xhArr":"\u27FA","xharr":"\u27F7","xi":"\u03BE","xlArr":"\u27F8","xlarr":"\u27F5","xmap":"\u27FC","xnis":"\u22FB","xodot":"\u2A00","xopf":"\uD835\uDD69","xoplus":"\u2A01","xotime":"\u2A02","xrArr":"\u27F9","xrarr":"\u27F6","xscr":"\uD835\uDCCD","xsqcup":"\u2A06","xuplus":"\u2A04","xutri":"\u25B3","xvee":"\u22C1","xwedge":"\u22C0","yacute":"\xFD","yacy":"\u044F","ycirc":"\u0177","ycy":"\u044B","yen":"\xA5","yfr":"\uD835\uDD36","yicy":"\u0457","yopf":"\uD835\uDD6A","yscr":"\uD835\uDCCE","yucy":"\u044E","yuml":"\xFF","zacute":"\u017A","zcaron":"\u017E","zcy":"\u0437","zdot":"\u017C","zeetrf":"\u2128","zeta":"\u03B6","zfr":"\uD835\uDD37","zhcy":"\u0436","zigrarr":"\u21DD","zopf":"\uD835\uDD6B","zscr":"\uD835\uDCCF","zwj":"\u200D","zwnj":"\u200C"}'), NUMERIC_OVERRIDES = {
      0: 65533,
      128: 8364,
      130: 8218,
      131: 402,
      132: 8222,
      133: 8230,
      134: 8224,
      135: 8225,
      136: 710,
      137: 8240,
      138: 352,
      139: 8249,
      140: 338,
      142: 381,
      145: 8216,
      146: 8217,
      147: 8220,
      148: 8221,
      149: 8226,
      150: 8211,
      151: 8212,
      152: 732,
      153: 8482,
      154: 353,
      155: 8250,
      156: 339,
      158: 382,
      159: 376
    }, RE_ENTITY_STRICT = /&(?:#[xX]([0-9a-fA-F]+)|#([0-9]+)|([A-Za-z][A-Za-z0-9]*));/g, RE_ENTITY_LENIENT = /&(?:#[xX]([0-9a-fA-F]+);?|#([0-9]+);?|([A-Za-z][A-Za-z0-9]*);?)/g;
    function decodeCodePoint(cp) {
      if (cp in NUMERIC_OVERRIDES)
        return String.fromCodePoint(NUMERIC_OVERRIDES[cp]);
      if (cp < 0 || cp > 1114111)
        return "\uFFFD";
      if (cp >= 55296 && cp <= 57343)
        return "\uFFFD";
      return String.fromCodePoint(cp);
    }
    function decodeHtmlStrict(s) {
      if (typeof s !== "string" || s.indexOf("&") === -1)
        return s;
      return s.replace(RE_ENTITY_STRICT, (match, hex, dec, name) => {
        if (hex !== void 0)
          return decodeCodePoint(parseInt(hex, 16));
        if (dec !== void 0)
          return decodeCodePoint(parseInt(dec, 10));
        const v = HTML5_ENTITIES[name];
        return v === void 0 ? match : v;
      });
    }
    function decodeHtml(s) {
      if (typeof s !== "string" || s.indexOf("&") === -1)
        return s;
      return s.replace(RE_ENTITY_LENIENT, (match, hex, dec, name) => {
        if (hex !== void 0)
          return decodeCodePoint(parseInt(hex, 16));
        if (dec !== void 0)
          return decodeCodePoint(parseInt(dec, 10));
        const v = HTML5_ENTITIES[name];
        return v === void 0 ? match : v;
      });
    }
    return { decodeHtmlStrict, decodeHtml, decodeCodePoint, HTML5_ENTITIES };
  } });
    __register({ name: "url", dependencies: [], factory: function() {
    function encodeComponent(s, space) {
      const out = encodeURIComponent(String(s));
      return space === "plus" ? out.replace(/%20/g, "+") : out;
    }
    function decodeComponent(s, space) {
      try {
        if (space === "plus")
          s = s.replace(/\+/g, " ");
        return decodeURIComponent(s);
      } catch {
        return s;
      }
    }
    function splitPath(key) {
      if (key.indexOf("[") < 0)
        return [key];
      const path = [], firstIdx = key.indexOf("[");
      path.push(key.slice(0, firstIdx));
      let i = firstIdx;
      const len = key.length;
      while (i < len && key[i] === "[") {
        const end = key.indexOf("]", i);
        if (end < 0) {
          path.push(key.slice(i));
          return path;
        }
        path.push(key.slice(i + 1, end));
        i = end + 1;
      }
      return path;
    }
    function setAtPath(obj, path, value) {
      let cur = obj;
      for (let i = 0;i < path.length; i++) {
        const seg = path[i], last = i === path.length - 1;
        if (seg === "") {
          if (!Array.isArray(cur))
            return;
          if (last)
            cur.push(value);
          else {
            const next = {};
            cur.push(next);
            cur = next;
          }
          continue;
        }
        if (last)
          if (Array.isArray(cur)) {
            const idx = /^\d+$/.test(seg) ? parseInt(seg, 10) : null;
            if (idx !== null)
              cur[idx] = value;
          } else if (seg in cur) {
            const existing = cur[seg];
            if (Array.isArray(existing))
              existing.push(value);
            else
              cur[seg] = [existing, value];
          } else
            cur[seg] = value;
        else {
          const nextSeg = path[i + 1], nextIsArray = nextSeg === "" || /^\d+$/.test(nextSeg);
          if (Array.isArray(cur)) {
            const idx = /^\d+$/.test(seg) ? parseInt(seg, 10) : cur.length;
            if (!cur[idx])
              cur[idx] = nextIsArray ? [] : {};
            cur = cur[idx];
          } else {
            if (!(seg in cur))
              cur[seg] = nextIsArray ? [] : {};
            cur = cur[seg];
          }
        }
      }
    }
    function parseQuery(str, options) {
      options = options || {};
      const arrayFormat = options.arrayFormat || "repeat", nested = !!options.nested, space = options.space || "percent", delimiter = options.delimiter || "&", out = {};
      if (!str)
        return out;
      if (str[0] === "?" || str[0] === "#")
        str = str.slice(1);
      if (!str)
        return out;
      const pairs = str.split(delimiter);
      for (let i = 0;i < pairs.length; i++) {
        const pair = pairs[i];
        if (pair === "")
          continue;
        const eqIdx = pair.indexOf("=");
        let rawKey, rawVal;
        if (eqIdx < 0) {
          rawKey = pair;
          rawVal = "";
        } else {
          rawKey = pair.slice(0, eqIdx);
          rawVal = pair.slice(eqIdx + 1);
        }
        const key = decodeComponent(rawKey, space);
        let value = decodeComponent(rawVal, space);
        if (arrayFormat === "comma" && value.indexOf(",") >= 0)
          value = value.split(",");
        if (nested || arrayFormat === "brackets" || arrayFormat === "indices") {
          const path = splitPath(key);
          if (path.length > 1) {
            if (Array.isArray(value))
              for (let j = 0;j < value.length; j++)
                setAtPath(out, path, value[j]);
            else
              setAtPath(out, path, value);
            continue;
          }
        }
        if (arrayFormat === "none")
          out[key] = Array.isArray(value) ? value[value.length - 1] : value;
        else if (key in out) {
          const existing = out[key];
          if (Array.isArray(existing))
            if (Array.isArray(value))
              for (const v of value)
                existing.push(v);
            else
              existing.push(value);
          else
            out[key] = Array.isArray(value) ? [existing, ...value] : [existing, value];
        } else
          out[key] = value;
      }
      return out;
    }
    function pushPair(pairs, key, val, space) {
      if (val === void 0)
        return;
      if (val === null) {
        pairs.push(encodeComponent(key, space) + "=");
        return;
      }
      pairs.push(encodeComponent(key, space) + "=" + encodeComponent(val, space));
    }
    function stringifyQuery(obj, options) {
      options = options || {};
      const arrayFormat = options.arrayFormat || "repeat", nested = !!options.nested, space = options.space || "percent", delimiter = options.delimiter || "&", skipNull = !!options.skipNull;
      if (!obj || typeof obj !== "object")
        return "";
      const pairs = [], emit = (keyExpr, val) => {
        if (val === void 0 && skipNull)
          return;
        if (val === null && skipNull)
          return;
        if (Array.isArray(val)) {
          if (val.length === 0)
            return;
          switch (arrayFormat) {
            case "brackets":
              for (const v of val)
                emit(keyExpr + "[]", v);
              return;
            case "indices":
              for (let i = 0;i < val.length; i++)
                emit(keyExpr + "[" + i + "]", val[i]);
              return;
            case "comma":
              pairs.push(encodeComponent(keyExpr, space) + "=" + val.map((v) => encodeComponent(v == null ? "" : v, space)).join(","));
              return;
            case "repeat":
            default:
              for (const v of val)
                pushPair(pairs, keyExpr, v, space);
              return;
          }
        }
        if (nested && val && typeof val === "object" && !(val instanceof Date)) {
          for (const k of Object.keys(val))
            emit(keyExpr + "[" + k + "]", val[k]);
          return;
        }
        if (val instanceof Date)
          val = val.toISOString();
        pushPair(pairs, keyExpr, val, space);
      }, keys = options.sort ? Object.keys(obj).sort() : Object.keys(obj);
      for (const k of keys)
        emit(k, obj[k]);
      return pairs.join(delimiter);
    }
    function parseURL(str, base) {
      if (typeof URL === "function") {
        const u = base ? new URL(str, base) : new URL(str);
        return {
          protocol: u.protocol,
          username: u.username,
          password: u.password,
          hostname: u.hostname,
          port: u.port,
          host: u.host,
          pathname: u.pathname,
          search: u.search,
          hash: u.hash,
          origin: u.origin,
          href: u.href,
          query: parseQuery(u.search)
        };
      }
      const m = /^(?:([a-z][a-z0-9+\-.]*:))?(?:\/\/((?:([^:@/]*)(?::([^@/]*))?@)?([^:/?#]*)(?::(\d+))?))?([^?#]*)(\?[^#]*)?(#.*)?$/i.exec(str);
      if (!m)
        throw Error("url: cannot parse");
      const protocol = m[1] || "", username = m[3] || "", password = m[4] || "", hostname = m[5] || "", port = m[6] || "", pathname = m[7] || "", search = m[8] || "", hash = m[9] || "", host = hostname + (port ? ":" + port : ""), origin = protocol && hostname ? protocol + "//" + host : "";
      return {
        protocol,
        username,
        password,
        hostname,
        port,
        host,
        pathname,
        search,
        hash,
        origin,
        href: str,
        query: parseQuery(search)
      };
    }
    function buildURL(parts) {
      if (!parts)
        return "";
      let out = "";
      if (parts.protocol) {
        out += parts.protocol;
        if (!out.endsWith(":"))
          out += ":";
        out += "//";
      }
      if (parts.username) {
        out += encodeURIComponent(parts.username);
        if (parts.password)
          out += ":" + encodeURIComponent(parts.password);
        out += "@";
      }
      if (parts.host)
        out += parts.host;
      else if (parts.hostname) {
        out += parts.hostname;
        if (parts.port)
          out += ":" + parts.port;
      }
      if (parts.pathname)
        out += parts.pathname.startsWith("/") || !parts.hostname ? parts.pathname : "/" + parts.pathname;
      if (parts.query !== void 0 && parts.query !== null && parts.query !== "") {
        const qs = typeof parts.query === "string" ? parts.query : stringifyQuery(parts.query);
        if (qs)
          out += "?" + qs;
      } else if (parts.search)
        out += parts.search.startsWith("?") ? parts.search : "?" + parts.search;
      if (parts.hash)
        out += parts.hash.startsWith("#") ? parts.hash : "#" + parts.hash;
      return out;
    }
    const DEFAULT_SAFE = ";/?:@&=+$,-_.!~*'()#";
    function buildTable(safe) {
      const t = Array(128);
      for (let i = 0;i < 128; i++) {
        const ch = String.fromCharCode(i);
        if (/[0-9A-Za-z]/.test(ch))
          t[i] = ch;
        else
          t[i] = "%" + ("0" + i.toString(16).toUpperCase()).slice(-2);
      }
      for (let i = 0;i < safe.length; i++)
        t[safe.charCodeAt(i)] = safe[i];
      return t;
    }
    const DEFAULT_TABLE = buildTable(DEFAULT_SAFE), RE_HEX2 = /^[0-9a-fA-F]{2}$/;
    function encodeSafe(s, options) {
      if (!s)
        return s === "" ? "" : String(s);
      const table = options && options.safe !== void 0 ? buildTable(options.safe) : DEFAULT_TABLE;
      let out = "";
      const len = s.length;
      for (let i = 0;i < len; i++) {
        const code = s.charCodeAt(i);
        if (code === 37 && i + 2 < len) {
          if (RE_HEX2.test(s.slice(i + 1, i + 3))) {
            out += s.slice(i, i + 3);
            i += 2;
            continue;
          }
        }
        if (code < 128) {
          out += table[code];
          continue;
        }
        if (code >= 55296 && code <= 57343) {
          if (code <= 56319 && i + 1 < len) {
            const next = s.charCodeAt(i + 1);
            if (next >= 56320 && next <= 57343) {
              out += encodeURIComponent(s[i] + s[i + 1]);
              i++;
              continue;
            }
          }
          out += "%EF%BF%BD";
          continue;
        }
        out += encodeURIComponent(s[i]);
      }
      return out;
    }
    function decodeSafe(s) {
      if (!s)
        return s === "" ? "" : String(s);
      try {
        return decodeURIComponent(s);
      } catch {
        return s;
      }
    }
    return { parseQuery, stringifyQuery, parseURL, buildURL, encodeSafe, decodeSafe };
  } });

    // md-local factories — inlined and topo-ordered.
    __register({ name: "mdErrors", dependencies: [], factory: function() {
    class MdError extends Error {
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

    class ParseError extends MdError {
    }

    class RenderError extends MdError {
    }

    class ContractError extends MdError {
    }
    function isMdError(e) {
      return e instanceof MdError;
    }
    return {
      MdError,
      ParseError,
      RenderError,
      ContractError,
      isMdError
    };
  } });
    __register({ name: "mdNode", dependencies: [], factory: function() {
    const BLOCK_CONTAINERS = new Set([
      "document",
      "block_quote",
      "list",
      "item",
      "table",
      "table_row",
      "admonition",
      "footnote_def"
    ]), INLINE_CONTAINERS = new Set([
      "paragraph",
      "heading",
      "emph",
      "strong",
      "link",
      "image",
      "strikethrough",
      "table_cell",
      "highlight",
      "subscript",
      "superscript"
    ]);
    function isContainerType(type) {
      return BLOCK_CONTAINERS.has(type) || INLINE_CONTAINERS.has(type);
    }

    class Node {
      constructor(type, sourcepos) {
        this.type = type;
        this.parent = null;
        this.firstChild = null;
        this.lastChild = null;
        this.prev = null;
        this.next = null;
        this.sourcepos = sourcepos || null;
        this.open = !0;
        this.stringContent = null;
        this.literal = null;
        this.level = null;
        this.info = null;
        this.isFenced = !1;
        this.fenceChar = null;
        this.fenceLength = 0;
        this.fenceOffset = 0;
        this.htmlBlockType = null;
        this.destination = null;
        this.title = null;
        this.listType = null;
        this.listStart = null;
        this.listTight = !0;
        this.listDelimiter = null;
        this.listBulletChar = null;
        this.listPadding = 0;
        this.listMarkerOffset = 0;
        this.checked = null;
        this.align = null;
        this.cellAlign = null;
        this.isHeader = !1;
        this.data = null;
      }
      get isContainer() {
        return isContainerType(this.type);
      }
      appendChild(child) {
        child.unlink();
        child.parent = this;
        if (this.lastChild) {
          this.lastChild.next = child;
          child.prev = this.lastChild;
          this.lastChild = child;
        } else {
          this.firstChild = child;
          this.lastChild = child;
        }
      }
      prependChild(child) {
        child.unlink();
        child.parent = this;
        if (this.firstChild) {
          this.firstChild.prev = child;
          child.next = this.firstChild;
          this.firstChild = child;
        } else {
          this.firstChild = child;
          this.lastChild = child;
        }
      }
      insertAfter(sibling) {
        sibling.unlink();
        sibling.next = this.next;
        if (sibling.next)
          sibling.next.prev = sibling;
        sibling.prev = this;
        this.next = sibling;
        sibling.parent = this.parent;
        if (!sibling.next && sibling.parent)
          sibling.parent.lastChild = sibling;
      }
      insertBefore(sibling) {
        sibling.unlink();
        sibling.prev = this.prev;
        if (sibling.prev)
          sibling.prev.next = sibling;
        sibling.next = this;
        this.prev = sibling;
        sibling.parent = this.parent;
        if (!sibling.prev && sibling.parent)
          sibling.parent.firstChild = sibling;
      }
      unlink() {
        if (this.prev)
          this.prev.next = this.next;
        else if (this.parent)
          this.parent.firstChild = this.next;
        if (this.next)
          this.next.prev = this.prev;
        else if (this.parent)
          this.parent.lastChild = this.prev;
        this.parent = null;
        this.next = null;
        this.prev = null;
      }
      walker() {
        return new Walker(this);
      }
    }

    class Walker {
      constructor(root) {
        this.current = root;
        this.root = root;
        this.entering = !0;
      }
      next() {
        const cur = this.current;
        if (cur === null)
          return null;
        const entering = this.entering, container = cur.isContainer;
        if (entering && container)
          if (cur.firstChild) {
            this.current = cur.firstChild;
            this.entering = !0;
          } else
            this.entering = !1;
        else if (cur === this.root)
          this.current = null;
        else if (cur.next === null) {
          this.current = cur.parent;
          this.entering = !1;
        } else {
          this.current = cur.next;
          this.entering = !0;
        }
        return { entering, node: cur };
      }
      resumeAt(node, entering) {
        this.current = node;
        this.entering = entering === !0;
      }
    }
    function makeNode(type, sourcepos) {
      return new Node(type, sourcepos);
    }
    function trustedHtmlInline(literal) {
      const n = new Node("html_inline");
      n.literal = String(literal);
      n._mdTrustedHtml = !0;
      return n;
    }
    function trustedHtmlBlock(literal) {
      const n = new Node("html_block");
      n.literal = String(literal);
      n.htmlBlockType = 6;
      n._mdTrustedHtml = !0;
      return n;
    }
    return { Node, Walker, makeNode, trustedHtmlInline, trustedHtmlBlock };
  } });
    __register({ name: "mdAstTypes", dependencies: [], factory: function() {
    const BLOCK_CONTAINERS = new Set([
      "document",
      "block_quote",
      "list",
      "item",
      "table",
      "table_row",
      "admonition",
      "footnote_def"
    ]), INLINE_CONTAINERS = new Set([
      "paragraph",
      "heading",
      "emph",
      "strong",
      "link",
      "image",
      "strikethrough",
      "table_cell",
      "highlight",
      "subscript",
      "superscript"
    ]);
    function isContainerType(type) {
      return BLOCK_CONTAINERS.has(type) || INLINE_CONTAINERS.has(type);
    }
    function isContainer(type) {
      return isContainerType(type);
    }
    return {
      isContainer,
      T_DOCUMENT: "document",
      T_PARAGRAPH: "paragraph",
      T_HEADING: "heading",
      T_THEMATIC_BREAK: "thematic_break",
      T_CODE_BLOCK: "code_block",
      T_HTML_BLOCK: "html_block",
      T_BLOCK_QUOTE: "block_quote",
      T_LIST: "list",
      T_ITEM: "item",
      T_TABLE: "table",
      T_TABLE_ROW: "table_row",
      T_TABLE_CELL: "table_cell",
      T_TEXT: "text",
      T_SOFTBREAK: "softbreak",
      T_LINEBREAK: "linebreak",
      T_CODE: "code",
      T_EMPH: "emph",
      T_STRONG: "strong",
      T_LINK: "link",
      T_IMAGE: "image",
      T_HTML_INLINE: "html_inline",
      T_STRIKETHROUGH: "strikethrough",
      T_MATH_INLINE: "math_inline",
      T_MATH_BLOCK: "math_block",
      T_FOOTNOTE_REF: "footnote_ref",
      T_FOOTNOTE_DEF: "footnote_def",
      T_ADMONITION: "admonition",
      T_HIGHLIGHT: "highlight",
      T_SUBSCRIPT: "subscript",
      T_SUPERSCRIPT: "superscript",
      BLOCK_CONTAINERS,
      INLINE_CONTAINERS,
      isContainerType
    };
  } });
    __register({ name: "refsLinkRefs", dependencies: [], factory: function() {
    function normalizeLabel(label) {
      return label.trim().replace(/[ \t\r\n]+/g, " ").toLowerCase().toUpperCase();
    }
    function createLinkRefMap() {
      return Object.create(null);
    }
    function addLinkRef(map, label, destination, title) {
      const k = normalizeLabel(label);
      if (k === "" || map[k] !== void 0)
        return !1;
      map[k] = { destination, title: title || null };
      return !0;
    }
    function lookupLinkRef(map, label) {
      return map[normalizeLabel(label)] || null;
    }
    function normalize(label) {
      return normalizeLabel(label);
    }
    return { normalize, normalizeLabel, createLinkRefMap, addLinkRef, lookupLinkRef };
  } });
    __register({ name: "mdBlockHtmlPatterns", dependencies: [], factory: function() {
    const _wsMarker = function() {}, TAGNAME = "[A-Za-z][A-Za-z0-9-]*", ATTRIBUTENAME = "[a-zA-Z_:][a-zA-Z0-9:._-]*", UNQUOTEDVALUE = "[^\"'=<>`\\x00-\\x20]+", SINGLEQUOTEDVALUE = "'[^']*'", DOUBLEQUOTEDVALUE = '"[^"]*"', ATTRIBUTEVALUESPEC = "(?:\\s*=\\s*" + ("(?:" + UNQUOTEDVALUE + "|" + SINGLEQUOTEDVALUE + "|" + DOUBLEQUOTEDVALUE + ")") + ")", ATTRIBUTE = "(?:\\s+" + ATTRIBUTENAME + ATTRIBUTEVALUESPEC + "?)", OPENTAG = "<" + TAGNAME + ATTRIBUTE + "*\\s*/?>", CLOSETAG = "</" + TAGNAME + "\\s*[>]", reHtmlBlockOpen = [
      /./,
      /^<(?:script|pre|textarea|style)(?:\s|>|$)/i,
      /^<!--/,
      /^<[?]/,
      /^<![A-Za-z]/,
      /^<!\[CDATA\[/,
      /^<[/]?(?:address|article|aside|base|basefont|blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|frame|frameset|h[123456]|head|header|hr|html|iframe|legend|li|link|main|menu|menuitem|nav|noframes|ol|optgroup|option|p|param|section|search|summary|table|tbody|td|tfoot|th|thead|title|tr|track|ul)(?:\s|[/]?[>]|$)/i,
      new RegExp("^(?:" + OPENTAG + "|" + CLOSETAG + ")\\s*$", "i")
    ];
    return { OPENTAG, CLOSETAG, reHtmlBlockOpen, reHtmlBlockClose: [
      /./,
      /<\/(?:script|pre|textarea|style)>/i,
      /-->/,
      /\?>/,
      />/,
      /\]\]>/
    ] };
  } });
    __register({ name: "mdCommon", dependencies: ["htmlEntities","url"], factory: function(htmlEntitiesMod, urlMod) {
    const { decodeHtmlStrict: decodeHTMLStrict } = htmlEntitiesMod, { encodeSafe: mdurlEncode } = urlMod, OPENTAG = `<[A-Za-z][A-Za-z0-9-]*(?:\\s+[a-zA-Z_:][a-zA-Z0-9:._-]*(?:\\s*=\\s*(?:[^"'=<>\`\\x00-\\x20]+|'[^']*'|"[^"]*"))?)*\\s*/?>`, CLOSETAG = "</[A-Za-z][A-Za-z0-9-]*\\s*[>]", HTMLTAG = "(?:" + OPENTAG + "|" + CLOSETAG + "|<!-->|<!--->|<!--[\\s\\S]*?-->|[<][?][\\s\\S]*?[?][>]|<![A-Za-z]+[^>]*>|<!\\[CDATA\\[[\\s\\S]*?\\]\\]>)", reHtmlTag = new RegExp("^" + HTMLTAG), reBackslashOrAmp = /[\\&]/, reEntityOrEscapedChar = new RegExp("\\\\[!\"#$%&'()*+,./:;<=>?@[\\\\\\]^_`{|}~-]|&(?:#x[a-f0-9]{1,6}|#[0-9]{1,7}|[a-z][a-z0-9]{1,31});", "gi");
    function unescapeChar(s) {
      if (s.charCodeAt(0) === 92)
        return s.charAt(1);
      return decodeHTMLStrict(s);
    }
    function unescapeString(s) {
      if (reBackslashOrAmp.test(s))
        return s.replace(reEntityOrEscapedChar, unescapeChar);
      return s;
    }
    function normalizeURI(uri) {
      try {
        return mdurlEncode(uri);
      } catch {
        return uri;
      }
    }
    const reXmlSpecial = new RegExp('[&<>"]', "g");
    function replaceUnsafeChar(s) {
      switch (s) {
        case "&":
          return "&amp;";
        case "<":
          return "&lt;";
        case ">":
          return "&gt;";
        case '"':
          return "&quot;";
        default:
          return s;
      }
    }
    function escapeXml(s) {
      if (reXmlSpecial.test(s))
        return s.replace(reXmlSpecial, replaceUnsafeChar);
      return s;
    }
    const escapeHtml = escapeXml, UNRESERVED_URL = new Set;
    for (const c of "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~:/?#[]@!$&'()*+,;=")
      UNRESERVED_URL.add(c.charCodeAt(0));
    function isHex(c) {
      return c >= 48 && c <= 57 || c >= 65 && c <= 70 || c >= 97 && c <= 102;
    }
    const _urlEncoder = new TextEncoder;
    function encodeUrl(url) {
      let out = "";
      for (let i = 0;i < url.length; i++) {
        const c = url.charCodeAt(i);
        if (c === 37 && i + 2 < url.length && isHex(url.charCodeAt(i + 1)) && isHex(url.charCodeAt(i + 2))) {
          out += url.substr(i, 3);
          i += 2;
          continue;
        }
        if (c < 128)
          if (UNRESERVED_URL.has(c))
            out += url[i];
          else
            out += "%" + c.toString(16).toUpperCase().padStart(2, "0");
        else {
          const bytes = _urlEncoder.encode(url[i]);
          for (const b of bytes)
            out += "%" + b.toString(16).toUpperCase().padStart(2, "0");
        }
      }
      return escapeXml(out);
    }
    return {
      C_NEWLINE: 10,
      C_SPACE: 32,
      C_TAB: 9,
      C_BANG: 33,
      C_DOUBLEQUOTE: 34,
      C_SINGLEQUOTE: 39,
      C_OPEN_PAREN: 40,
      C_CLOSE_PAREN: 41,
      C_ASTERISK: 42,
      C_COLON: 58,
      C_LESSTHAN: 60,
      C_GREATERTHAN: 62,
      C_OPEN_BRACKET: 91,
      C_BACKSLASH: 92,
      C_CLOSE_BRACKET: 93,
      C_UNDERSCORE: 95,
      C_BACKTICK: 96,
      C_AMPERSAND: 38,
      TAGNAME: "[A-Za-z][A-Za-z0-9-]*",
      OPENTAG,
      CLOSETAG,
      reHtmlTag,
      ENTITY: "&(?:#x[a-f0-9]{1,6}|#[0-9]{1,7}|[a-z][a-z0-9]{1,31});",
      ESCAPABLE: "[!\"#$%&'()*+,./:;<=>?@[\\\\\\]^_`{|}~-]",
      unescapeString,
      normalizeURI,
      escapeXml,
      escapeHtml,
      encodeUrl
    };
  } });
    __register({ name: "mdBlockLinkRef", dependencies: ["refsLinkRefs","mdAstTypes","mdCommon"], factory: function(linkRefsMod, astTypes, common) {
    const { addLinkRef } = linkRefsMod, { T_PARAGRAPH } = astTypes, { ESCAPABLE, unescapeString, normalizeURI } = common, reWhitespaceChar = /^[ \t\n\x0b\x0c\x0d]/, reSpaceAtEndOfLine = /^ *(?:\n|$)/, reNonSpace = /[^ \t\f\v\r\n]/, reEscapable = new RegExp(ESCAPABLE);
    function isBlank(s) {
      return !reNonSpace.test(s);
    }
    function peek(ln, pos) {
      return pos < ln.length ? ln.charCodeAt(pos) : -1;
    }

    class RefCursor {
      constructor(subject) {
        this.subject = subject;
        this.pos = 0;
        this.label_nest_level = 0;
      }
      peek() {
        return this.pos < this.subject.length ? this.subject.charCodeAt(this.pos) : -1;
      }
      spnl() {
        this.match(/^ *(?:\n *)?/);
        return !0;
      }
      match(re) {
        const m = re.exec(this.subject.slice(this.pos));
        if (m === null)
          return null;
        this.pos += m.index + m[0].length;
        return m[0];
      }
    }
    function parseLinkLabel(cur) {
      const m = cur.match(/^\[(?:[^\\[\]]|\\.){0,1000}\]/);
      if (m === null || m.length > 1001)
        return 0;
      return m.length;
    }
    function parseLinkDestination(cur) {
      let res = cur.match(/^(?:<(?:[^<>\n\\\x00]|\\.)*>)/);
      if (res !== null)
        return normalizeURI(unescapeString(res.slice(1, -1)));
      const savepos = cur.pos;
      let openparens = 0, c;
      while ((c = cur.peek()) !== -1)
        if (c === 92 && cur.subject.charAt(cur.pos + 1) !== "" && reEscapable.test(cur.subject.charAt(cur.pos + 1))) {
          cur.pos += 1;
          if (cur.peek() !== -1)
            cur.pos += 1;
        } else if (c === 40) {
          cur.pos += 1;
          openparens += 1;
        } else if (c === 41) {
          if (openparens < 1)
            break;
          cur.pos += 1;
          openparens -= 1;
        } else if (reWhitespaceChar.exec(String.fromCharCode(c)) !== null)
          break;
        else
          cur.pos += 1;
      if (cur.pos === savepos && c !== 41)
        return null;
      if (openparens !== 0)
        return null;
      res = cur.subject.slice(savepos, cur.pos);
      return normalizeURI(unescapeString(res));
    }
    function parseLinkTitle(cur) {
      const title = cur.match(/^(?:"(\\.|[^"\x00])*"|'(\\.|[^'\x00])*'|\((\\.|[^()\x00])*\))/);
      if (title === null)
        return null;
      return unescapeString(title.slice(1, -1));
    }
    function parseReference(s, refmap) {
      const cur = new RefCursor(s), startpos = cur.pos, matchChars = parseLinkLabel(cur);
      if (matchChars === 0)
        return 0;
      const rawlabel = cur.subject.slice(0, matchChars);
      if (cur.peek() === 58)
        cur.pos += 1;
      else {
        cur.pos = startpos;
        return 0;
      }
      cur.spnl();
      const dest = parseLinkDestination(cur);
      if (dest === null) {
        cur.pos = startpos;
        return 0;
      }
      const beforetitle = cur.pos;
      cur.spnl();
      let title = null;
      if (cur.pos !== beforetitle)
        title = parseLinkTitle(cur);
      if (title === null) {
        title = "";
        cur.pos = beforetitle;
      }
      let atLineEnd = !0;
      if (cur.match(reSpaceAtEndOfLine) === null)
        if (title === "")
          atLineEnd = !1;
        else {
          title = "";
          cur.pos = beforetitle;
          atLineEnd = cur.match(reSpaceAtEndOfLine) !== null;
        }
      if (!atLineEnd) {
        cur.pos = startpos;
        return 0;
      }
      const normlabel = rawlabel.slice(1, -1);
      if (normlabel.trim() === "" || /^[ \t\n\r]*$/.test(normlabel)) {
        cur.pos = startpos;
        return 0;
      }
      addLinkRef(refmap, normlabel, dest, title);
      return cur.pos - startpos;
    }
    function removeLinkReferenceDefinitions(parser, tree) {
      const walker = tree.walker(), emptyNodes = [];
      let event;
      while (event = walker.next()) {
        const node = event.node;
        if (event.entering && node.type === T_PARAGRAPH) {
          let pos, hasReferenceDefs = !1;
          while (peek(node.stringContent, 0) === 91 && (pos = parseReference(node.stringContent, parser.refmap))) {
            const removedText = node.stringContent.slice(0, pos);
            node.stringContent = node.stringContent.slice(pos);
            hasReferenceDefs = !0;
            const lines = removedText.split(`
`);
            node.sourcepos[0][0] += lines.length - 1;
          }
          if (hasReferenceDefs && isBlank(node.stringContent))
            emptyNodes.push(node);
        }
      }
      for (const node of emptyNodes)
        node.unlink();
    }
    return { parseReference, removeLinkReferenceDefinitions };
  } });
    __register({ name: "mdBlockListData", dependencies: ["mdAstTypes"], factory: function(astTypes) {
    const { T_PARAGRAPH } = astTypes, reBulletListMarker = /^[*+-]/, reOrderedListMarker = /^(\d{1,9})([.)])/, reNonSpace = /[^ \t\f\v\r\n]/;
    function isSpaceOrTab(c) {
      return c === 32 || c === 9;
    }
    function peek(ln, pos) {
      return pos < ln.length ? ln.charCodeAt(pos) : -1;
    }
    function parseListMarker(parser, container) {
      const rest = parser.currentLine.slice(parser.nextNonspace);
      let match, nextc;
      const data = {
        type: null,
        tight: !0,
        bulletChar: null,
        start: null,
        delimiter: null,
        padding: null,
        markerOffset: parser.indent
      };
      if (parser.indent >= 4)
        return null;
      if (match = rest.match(reBulletListMarker)) {
        data.type = "bullet";
        data.bulletChar = match[0][0];
      } else if ((match = rest.match(reOrderedListMarker)) && (container.type !== T_PARAGRAPH || match[1] == 1)) {
        data.type = "ordered";
        data.start = parseInt(match[1], 10);
        data.delimiter = match[2];
      } else
        return null;
      nextc = peek(parser.currentLine, parser.nextNonspace + match[0].length);
      if (!(nextc === -1 || nextc === 9 || nextc === 32))
        return null;
      if (container.type === T_PARAGRAPH && !parser.currentLine.slice(parser.nextNonspace + match[0].length).match(reNonSpace))
        return null;
      parser.advanceNextNonspace();
      parser.advanceOffset(match[0].length, !0);
      const { column: spacesStartCol, offset: spacesStartOffset } = parser;
      do {
        parser.advanceOffset(1, !0);
        nextc = peek(parser.currentLine, parser.offset);
      } while (parser.column - spacesStartCol < 5 && isSpaceOrTab(nextc));
      const blank_item = peek(parser.currentLine, parser.offset) === -1, spaces_after_marker = parser.column - spacesStartCol;
      if (spaces_after_marker >= 5 || spaces_after_marker < 1 || blank_item) {
        data.padding = match[0].length + 1;
        parser.column = spacesStartCol;
        parser.offset = spacesStartOffset;
        if (isSpaceOrTab(peek(parser.currentLine, parser.offset)))
          parser.advanceOffset(1, !0);
      } else
        data.padding = match[0].length + spaces_after_marker;
      return data;
    }
    function listsMatch(list_data, item_data) {
      return list_data.type === item_data.type && list_data.delimiter === item_data.delimiter && list_data.bulletChar === item_data.bulletChar;
    }
    function applyListData(node, d) {
      node.listType = d.type;
      node.listStart = d.start;
      node.listTight = d.tight;
      node.listDelimiter = d.delimiter;
      node.listBulletChar = d.bulletChar;
      node.listPadding = d.padding;
      node.listMarkerOffset = d.markerOffset;
    }
    function listDataFromNode(node) {
      return {
        type: node.listType,
        start: node.listStart,
        tight: node.listTight,
        delimiter: node.listDelimiter,
        bulletChar: node.listBulletChar,
        padding: node.listPadding,
        markerOffset: node.listMarkerOffset
      };
    }
    return { parseListMarker, listsMatch, applyListData, listDataFromNode };
  } });
    __register({ name: "mdBlockTable", dependencies: ["mdNode","mdAstTypes"], factory: function(nodeMod, astTypes) {
    const { Node } = nodeMod, { T_PARAGRAPH, T_TABLE, T_TABLE_ROW, T_TABLE_CELL } = astTypes;
    function parseDelimiterRow(line, expectedCols) {
      let s = line.replace(/^\s+/, "").replace(/\s+$/, "");
      if (s.length === 0)
        return null;
      if (!/^[\s|:-]+$/.test(s))
        return null;
      if (s.startsWith("|"))
        s = s.slice(1);
      if (s.endsWith("|") && !s.endsWith("\\|"))
        s = s.slice(0, -1);
      const cells = s.split("|"), aligns = [];
      for (const cell of cells) {
        const m = cell.trim().match(/^(:?)(-+)(:?)$/);
        if (!m)
          return null;
        const leftColon = m[1] === ":", rightColon = m[3] === ":";
        if (leftColon && rightColon)
          aligns.push("center");
        else if (rightColon)
          aligns.push("right");
        else if (leftColon)
          aligns.push("left");
        else
          aligns.push(null);
      }
      if (expectedCols != null && aligns.length !== expectedCols)
        return null;
      return aligns;
    }
    function splitRowCells(line) {
      let s = line;
      s = s.replace(/^\s+/, "").replace(/\s+$/, "");
      if (s.startsWith("|"))
        s = s.slice(1);
      if (s.endsWith("|") && !s.endsWith("\\|"))
        s = s.slice(0, -1);
      const cells = [];
      let cur = "";
      for (let i = 0;i < s.length; i++) {
        const c = s.charAt(i);
        if (c === "\\" && s.charAt(i + 1) === "|") {
          cur += "|";
          i++;
        } else if (c === "|") {
          cells.push(cur);
          cur = "";
        } else
          cur += c;
      }
      cells.push(cur);
      return cells.map((c) => c.trim());
    }
    function countHeaderCells(line) {
      return splitRowCells(line).length;
    }
    function tryConvertParagraphToTable(paragraph) {
      const content = paragraph.stringContent || "";
      if (content.indexOf("|") === -1)
        return !1;
      const lines = content.replace(/\n+$/, "").split(`
`);
      if (lines.length < 2)
        return !1;
      const headerLine = lines[0], delimLine = lines[1];
      if (headerLine.indexOf("|") === -1)
        return !1;
      const headerCells = splitRowCells(headerLine);
      if (headerCells.length === 0)
        return !1;
      const aligns = parseDelimiterRow(delimLine, headerCells.length);
      if (!aligns)
        return !1;
      const table = new Node(T_TABLE);
      table.align = aligns;
      const headerRow = new Node(T_TABLE_ROW);
      headerRow.isHeader = !0;
      for (let i = 0;i < headerCells.length; i++) {
        const cell = new Node(T_TABLE_CELL);
        cell.isHeader = !0;
        cell.cellAlign = aligns[i] || null;
        cell.stringContent = headerCells[i];
        headerRow.appendChild(cell);
      }
      table.appendChild(headerRow);
      for (let i = 2;i < lines.length; i++) {
        const rowLine = lines[i];
        if (rowLine.trim() === "")
          break;
        const cells = splitRowCells(rowLine), row = new Node(T_TABLE_ROW);
        row.isHeader = !1;
        for (let j = 0;j < aligns.length; j++) {
          const cell = new Node(T_TABLE_CELL);
          cell.isHeader = !1;
          cell.cellAlign = aligns[j] || null;
          cell.stringContent = j < cells.length ? cells[j] : "";
          row.appendChild(cell);
        }
        table.appendChild(row);
      }
      paragraph.insertAfter(table);
      paragraph.unlink();
      return !0;
    }
    function detectTables(doc) {
      const paragraphs = [], walker = doc.walker();
      let event;
      while (event = walker.next())
        if (event.entering && event.node.type === T_PARAGRAPH)
          paragraphs.push(event.node);
      for (const p of paragraphs) {
        if (!p.parent)
          continue;
        tryConvertParagraphToTable(p);
      }
    }
    return {
      parseDelimiterRow,
      splitRowCells,
      countHeaderCells,
      tryConvertParagraphToTable,
      detectTables
    };
  } });
    __register({ name: "mdBlockTaskList", dependencies: ["mdAstTypes"], factory: function(astTypes) {
    const { T_ITEM, T_PARAGRAPH } = astTypes;
    function detectTaskLists(doc) {
      const walker = doc.walker();
      let event;
      const items = [];
      while (event = walker.next())
        if (event.entering && event.node.type === T_ITEM)
          items.push(event.node);
      for (const item of items) {
        const firstChild = item.firstChild;
        if (!firstChild || firstChild.type !== T_PARAGRAPH)
          continue;
        const sc = firstChild.stringContent;
        if (!sc)
          continue;
        const m = sc.match(/^\[([ xX])\][ \t]+/);
        if (!m)
          continue;
        item.checked = m[1] !== " ";
        firstChild.stringContent = sc.slice(m[0].length);
      }
    }
    return { detectTaskLists };
  } });
    __register({ name: "mdBlockTypes", dependencies: ["mdAstTypes","mdBlockLinkRef","mdCommon"], factory: function(astTypes, blockLinkRef, common) {
    const { T_ITEM } = astTypes, { removeLinkReferenceDefinitions } = blockLinkRef, { unescapeString } = common, reClosingCodeFence = /^(?:`{3,}|~{3,})(?=[ \t]*$)/;
    function isSpaceOrTab(c) {
      return c === 32 || c === 9;
    }
    function peek(ln, pos) {
      return pos < ln.length ? ln.charCodeAt(pos) : -1;
    }
    function endsWithBlankLine(block) {
      return block.next && block.sourcepos[1][0] !== block.next.sourcepos[0][0] - 1;
    }
    return { blocks: {
      document: {
        continue() {
          return 0;
        },
        finalize(parser, block) {
          removeLinkReferenceDefinitions(parser, block);
        },
        canContain(t) {
          return t !== T_ITEM;
        },
        acceptsLines: !1
      },
      list: {
        continue() {
          return 0;
        },
        finalize(parser, block) {
          let item = block.firstChild;
          while (item) {
            if (item.next && endsWithBlankLine(item)) {
              block.listTight = !1;
              break;
            }
            let subitem = item.firstChild;
            while (subitem) {
              if (subitem.next && endsWithBlankLine(subitem)) {
                block.listTight = !1;
                break;
              }
              subitem = subitem.next;
            }
            item = item.next;
          }
          if (block.lastChild)
            block.sourcepos[1] = block.lastChild.sourcepos[1];
        },
        canContain(t) {
          return t === T_ITEM;
        },
        acceptsLines: !1
      },
      block_quote: {
        continue(parser) {
          const ln = parser.currentLine;
          if (!parser.indented && peek(ln, parser.nextNonspace) === 62) {
            parser.advanceNextNonspace();
            parser.advanceOffset(1, !1);
            if (isSpaceOrTab(peek(ln, parser.offset)))
              parser.advanceOffset(1, !0);
          } else
            return 1;
          return 0;
        },
        finalize() {},
        canContain(t) {
          return t !== T_ITEM;
        },
        acceptsLines: !1
      },
      item: {
        continue(parser, container) {
          if (parser.blank) {
            if (container.firstChild == null)
              return 1;
            parser.advanceNextNonspace();
          } else if (parser.indent >= container.listMarkerOffset + container.listPadding)
            parser.advanceOffset(container.listMarkerOffset + container.listPadding, !0);
          else
            return 1;
          return 0;
        },
        finalize(parser, block) {
          if (block.lastChild)
            block.sourcepos[1] = block.lastChild.sourcepos[1];
          else {
            block.sourcepos[1][0] = block.sourcepos[0][0];
            block.sourcepos[1][1] = block.listMarkerOffset + block.listPadding;
          }
        },
        canContain(t) {
          return t !== T_ITEM;
        },
        acceptsLines: !1
      },
      heading: {
        continue() {
          return 1;
        },
        finalize() {},
        canContain() {
          return !1;
        },
        acceptsLines: !1
      },
      thematic_break: {
        continue() {
          return 1;
        },
        finalize() {},
        canContain() {
          return !1;
        },
        acceptsLines: !1
      },
      code_block: {
        continue(parser, container) {
          const { currentLine: ln, indent } = parser;
          if (container.isFenced) {
            const match = indent <= 3 && ln.charAt(parser.nextNonspace) === container.fenceChar && ln.slice(parser.nextNonspace).match(reClosingCodeFence);
            if (match && match[0].length >= container.fenceLength) {
              parser.lastLineLength = parser.offset + indent + match[0].length;
              parser.finalize(container, parser.lineNumber);
              return 2;
            }
            let i = container.fenceOffset;
            while (i > 0 && isSpaceOrTab(peek(ln, parser.offset))) {
              parser.advanceOffset(1, !0);
              i--;
            }
          } else if (indent >= 4)
            parser.advanceOffset(4, !0);
          else if (parser.blank)
            parser.advanceNextNonspace();
          else
            return 1;
          return 0;
        },
        finalize(parser, block) {
          if (block.isFenced) {
            const content = block.stringContent, newlinePos = content.indexOf(`
`), firstLine = content.slice(0, newlinePos), rest = content.slice(newlinePos + 1);
            block.info = unescapeString(firstLine.trim());
            block.literal = rest;
          } else {
            const lines = block.stringContent.split(`
`);
            while (/^[ \t]*$/.test(lines[lines.length - 1]))
              lines.pop();
            block.literal = lines.join(`
`) + `
`;
            block.sourcepos[1][0] = block.sourcepos[0][0] + lines.length - 1;
            block.sourcepos[1][1] = block.sourcepos[0][1] + lines[lines.length - 1].length - 1;
          }
          block.stringContent = null;
        },
        canContain() {
          return !1;
        },
        acceptsLines: !0
      },
      html_block: {
        continue(parser, container) {
          return parser.blank && (container.htmlBlockType === 6 || container.htmlBlockType === 7) ? 1 : 0;
        },
        finalize(parser, block) {
          block.literal = block.stringContent.replace(/\n$/, "");
          block.stringContent = null;
        },
        canContain() {
          return !1;
        },
        acceptsLines: !0
      },
      paragraph: {
        continue(parser) {
          return parser.blank ? 1 : 0;
        },
        finalize() {},
        canContain() {
          return !1;
        },
        acceptsLines: !0
      }
    } };
  } });
    __register({ name: "mdBlockStarts", dependencies: ["mdNode","mdAstTypes","mdBlockHtmlPatterns","mdBlockLinkRef","mdBlockListData"], factory: function(nodeMod, astTypes, htmlPatterns, blockLinkRef, blockListData) {
    const { Node } = nodeMod, {
      T_PARAGRAPH,
      T_HEADING,
      T_THEMATIC_BREAK,
      T_CODE_BLOCK,
      T_HTML_BLOCK,
      T_BLOCK_QUOTE,
      T_LIST,
      T_ITEM
    } = astTypes, { reHtmlBlockOpen } = htmlPatterns, { parseReference } = blockLinkRef, {
      parseListMarker,
      listsMatch,
      applyListData,
      listDataFromNode
    } = blockListData, reThematicBreak = /^(?:\*[ \t]*){3,}$|^(?:_[ \t]*){3,}$|^(?:-[ \t]*){3,}$/, reATXHeadingMarker = /^#{1,6}(?:[ \t]+|$)/, reCodeFence = /^`{3,}(?!.*`)|^~{3,}/, reSetextHeadingLine = /^(?:=+|-+)[ \t]*$/;
    function isSpaceOrTab(c) {
      return c === 32 || c === 9;
    }
    function peek(ln, pos) {
      return pos < ln.length ? ln.charCodeAt(pos) : -1;
    }
    return { blockStarts: [
      function(parser) {
        if (!parser.indented && peek(parser.currentLine, parser.nextNonspace) === 62) {
          parser.advanceNextNonspace();
          parser.advanceOffset(1, !1);
          if (isSpaceOrTab(peek(parser.currentLine, parser.offset)))
            parser.advanceOffset(1, !0);
          parser.closeUnmatchedBlocks();
          parser.addChild(T_BLOCK_QUOTE, parser.nextNonspace);
          return 1;
        }
        return 0;
      },
      function(parser) {
        let match;
        if (!parser.indented && (match = parser.currentLine.slice(parser.nextNonspace).match(reATXHeadingMarker))) {
          parser.advanceNextNonspace();
          parser.advanceOffset(match[0].length, !1);
          parser.closeUnmatchedBlocks();
          const container = parser.addChild(T_HEADING, parser.nextNonspace);
          container.level = match[0].trim().length;
          container.stringContent = parser.currentLine.slice(parser.offset).replace(/^[ \t]*#+[ \t]*$/, "").replace(/[ \t]+#+[ \t]*$/, "");
          parser.advanceOffset(parser.currentLine.length - parser.offset);
          return 2;
        }
        return 0;
      },
      function(parser) {
        let match;
        if (!parser.indented && (match = parser.currentLine.slice(parser.nextNonspace).match(reCodeFence))) {
          const fenceLength = match[0].length;
          parser.closeUnmatchedBlocks();
          const container = parser.addChild(T_CODE_BLOCK, parser.nextNonspace);
          container.isFenced = !0;
          container.fenceLength = fenceLength;
          container.fenceChar = match[0][0];
          container.fenceOffset = parser.indent;
          parser.advanceNextNonspace();
          parser.advanceOffset(fenceLength, !1);
          return 2;
        }
        return 0;
      },
      function(parser, container) {
        if (!parser.indented && peek(parser.currentLine, parser.nextNonspace) === 60) {
          const s = parser.currentLine.slice(parser.nextNonspace);
          for (let blockType = 1;blockType <= 7; blockType++)
            if (reHtmlBlockOpen[blockType].test(s) && (blockType < 7 || container.type !== T_PARAGRAPH && !(!parser.allClosed && !parser.blank && parser.tip.type === T_PARAGRAPH))) {
              parser.closeUnmatchedBlocks();
              const b = parser.addChild(T_HTML_BLOCK, parser.offset);
              b.htmlBlockType = blockType;
              return 2;
            }
        }
        return 0;
      },
      function(parser, container) {
        let match;
        if (!parser.indented && container.type === T_PARAGRAPH && (match = parser.currentLine.slice(parser.nextNonspace).match(reSetextHeadingLine))) {
          parser.closeUnmatchedBlocks();
          let pos;
          while (peek(container.stringContent, 0) === 91 && (pos = parseReference(container.stringContent, parser.refmap)))
            container.stringContent = container.stringContent.slice(pos);
          if (container.stringContent.length > 0) {
            const heading = new Node(T_HEADING, container.sourcepos);
            heading.level = match[0][0] === "=" ? 1 : 2;
            heading.stringContent = container.stringContent;
            container.insertAfter(heading);
            container.unlink();
            parser.tip = heading;
            parser.advanceOffset(parser.currentLine.length - parser.offset, !1);
            return 2;
          }
          return 0;
        }
        return 0;
      },
      function(parser) {
        if (!parser.indented && reThematicBreak.test(parser.currentLine.slice(parser.nextNonspace))) {
          parser.closeUnmatchedBlocks();
          parser.addChild(T_THEMATIC_BREAK, parser.nextNonspace);
          parser.advanceOffset(parser.currentLine.length - parser.offset, !1);
          return 2;
        }
        return 0;
      },
      function(parser, container) {
        let data;
        if ((!parser.indented || container.type === T_LIST) && (data = parseListMarker(parser, container))) {
          parser.closeUnmatchedBlocks();
          if (parser.tip.type !== T_LIST || !listsMatch(listDataFromNode(container), data)) {
            container = parser.addChild(T_LIST, parser.nextNonspace);
            applyListData(container, data);
          }
          container = parser.addChild(T_ITEM, parser.nextNonspace);
          applyListData(container, data);
          return 1;
        }
        return 0;
      },
      function(parser) {
        if (parser.indented && parser.tip.type !== T_PARAGRAPH && !parser.blank) {
          parser.advanceOffset(4, !0);
          parser.closeUnmatchedBlocks();
          parser.addChild(T_CODE_BLOCK, parser.offset);
          return 2;
        }
        return 0;
      }
    ] };
  } });
    __register({ name: "mdBlockCursor", dependencies: ["mdErrors","mdNode","mdAstTypes","mdBlockHtmlPatterns"], factory: function(errors, nodeMod, astTypes, htmlPatterns) {
    const { ContractError } = errors, { Node } = nodeMod, { T_PARAGRAPH, T_HTML_BLOCK } = astTypes, { reHtmlBlockClose } = htmlPatterns, reMaybeSpecial = /^[#`~*+_=<>0-9-]/;
    function advanceOffset(count, columns) {
      const currentLine = this.currentLine;
      let charsToTab, charsToAdvance, c;
      while (count > 0 && (c = currentLine[this.offset]))
        if (c === "\t") {
          charsToTab = 4 - this.column % 4;
          if (columns) {
            this.partiallyConsumedTab = charsToTab > count;
            charsToAdvance = charsToTab > count ? count : charsToTab;
            this.column += charsToAdvance;
            this.offset += this.partiallyConsumedTab ? 0 : 1;
            count -= charsToAdvance;
          } else {
            this.partiallyConsumedTab = !1;
            this.column += charsToTab;
            this.offset += 1;
            count -= 1;
          }
        } else {
          this.partiallyConsumedTab = !1;
          this.offset += 1;
          this.column += 1;
          count -= 1;
        }
    }
    function advanceNextNonspace() {
      this.offset = this.nextNonspace;
      this.column = this.nextNonspaceColumn;
      this.partiallyConsumedTab = !1;
    }
    function findNextNonspace() {
      const currentLine = this.currentLine;
      let i = this.offset, cols = this.column, c;
      while ((c = currentLine.charAt(i)) !== "")
        if (c === " ") {
          i++;
          cols++;
        } else if (c === "\t") {
          i++;
          cols += 4 - cols % 4;
        } else
          break;
      this.blank = c === `
` || c === "\r" || c === "";
      this.nextNonspace = i;
      this.nextNonspaceColumn = cols;
      this.indent = this.nextNonspaceColumn - this.column;
      this.indented = this.indent >= 4;
    }
    function addLine() {
      if (this.partiallyConsumedTab) {
        this.offset += 1;
        const charsToTab = 4 - this.column % 4;
        this.tip.stringContent += " ".repeat(charsToTab);
      }
      this.tip.stringContent += this.currentLine.slice(this.offset) + `
`;
    }
    function addChild(tag, offset) {
      while (!this.blocks[this.tip.type].canContain(tag))
        this.finalize(this.tip, this.lineNumber - 1);
      const column_number = offset + 1, newBlock = new Node(tag, [
        [this.lineNumber, column_number],
        [0, 0]
      ]);
      newBlock.stringContent = "";
      this.tip.appendChild(newBlock);
      this.tip = newBlock;
      return newBlock;
    }
    function closeUnmatchedBlocks() {
      if (!this.allClosed) {
        while (this.oldtip !== this.lastMatchedContainer) {
          const parent = this.oldtip.parent;
          this.finalize(this.oldtip, this.lineNumber - 1);
          this.oldtip = parent;
        }
        this.allClosed = !0;
      }
    }
    function incorporateLine(ln) {
      let all_matched = !0, container = this.doc;
      this.oldtip = this.tip;
      this.offset = 0;
      this.column = 0;
      this.blank = !1;
      this.partiallyConsumedTab = !1;
      this.lineNumber += 1;
      if (ln.indexOf(" ") !== -1)
        ln = ln.replace(/\0/g, "\uFFFD");
      this.currentLine = ln;
      let lastChild;
      while ((lastChild = container.lastChild) && lastChild.open) {
        container = lastChild;
        this.findNextNonspace();
        switch (this.blocks[container.type].continue(this, container)) {
          case 0:
            break;
          case 1:
            all_matched = !1;
            break;
          case 2:
            return;
          default:
            throw new ContractError("md/parse-error", "continue returned illegal value");
        }
        if (!all_matched) {
          container = container.parent;
          break;
        }
      }
      this.allClosed = container === this.oldtip;
      this.lastMatchedContainer = container;
      let matchedLeaf = container.type !== T_PARAGRAPH && this.blocks[container.type].acceptsLines;
      const starts = this.blockStarts, startsLen = starts.length;
      while (!matchedLeaf) {
        this.findNextNonspace();
        if (!this.indented && !reMaybeSpecial.test(ln.slice(this.nextNonspace))) {
          this.advanceNextNonspace();
          break;
        }
        let i = 0;
        while (i < startsLen) {
          const res = starts[i](this, container);
          if (res === 1) {
            container = this.tip;
            break;
          } else if (res === 2) {
            container = this.tip;
            matchedLeaf = !0;
            break;
          } else
            i++;
        }
        if (i === startsLen) {
          this.advanceNextNonspace();
          break;
        }
      }
      if (!this.allClosed && !this.blank && this.tip.type === T_PARAGRAPH)
        this.addLine();
      else {
        this.closeUnmatchedBlocks();
        const t = container.type;
        if (this.blocks[t].acceptsLines) {
          this.addLine();
          if (t === T_HTML_BLOCK && container.htmlBlockType >= 1 && container.htmlBlockType <= 5 && reHtmlBlockClose[container.htmlBlockType].test(this.currentLine.slice(this.offset))) {
            this.lastLineLength = ln.length;
            this.finalize(container, this.lineNumber);
          }
        } else if (this.offset < ln.length && !this.blank) {
          this.addChild(T_PARAGRAPH, this.offset);
          this.advanceNextNonspace();
          this.addLine();
        }
      }
      this.lastLineLength = ln.length;
    }
    function finalize(block, lineNumber) {
      const above = block.parent;
      block.open = !1;
      block.sourcepos[1] = [lineNumber, this.lastLineLength];
      this.blocks[block.type].finalize(this, block);
      this.tip = above;
    }
    return {
      advanceOffset,
      advanceNextNonspace,
      findNextNonspace,
      addLine,
      addChild,
      closeUnmatchedBlocks,
      incorporateLine,
      finalize
    };
  } });
    __register({ name: "blockParser", dependencies: ["mdErrors","mdNode","mdAstTypes","refsLinkRefs","mdBlockHtmlPatterns","mdBlockLinkRef","mdBlockListData","mdBlockTable","mdBlockTaskList","mdBlockTypes","mdBlockStarts","mdBlockCursor"], factory: function(errors, nodeMod, astTypes, linkRefsMod, htmlPatterns, blockLinkRef, blockListData, blockTable, blockTaskList, blockTypes, blockStartsMod, blockCursor) {
    const { ContractError: _ContractError } = errors, { Node } = nodeMod, { T_DOCUMENT, T_PARAGRAPH, T_HEADING, T_TEXT, T_TABLE_CELL } = astTypes, { createLinkRefMap } = linkRefsMod, { blocks } = blockTypes, { blockStarts } = blockStartsMod, { detectTables } = blockTable, { detectTaskLists } = blockTaskList, {
      findNextNonspace,
      advanceOffset,
      advanceNextNonspace,
      addLine,
      addChild,
      closeUnmatchedBlocks,
      incorporateLine,
      finalize
    } = blockCursor, reLineEnding = /\r\n|\n|\r/;
    function stubInlines(block) {
      const walker = block.walker();
      let event;
      while (event = walker.next()) {
        const node = event.node, t = node.type;
        if (!event.entering && (t === T_PARAGRAPH || t === T_HEADING)) {
          const text = (node.stringContent || "").replace(/\n+$/, ""), child = new Node(T_TEXT);
          child.literal = text;
          node.appendChild(child);
          node.stringContent = null;
        }
      }
    }
    function makeDocument() {
      return new Node(T_DOCUMENT, [[1, 1], [0, 0]]);
    }
    function makeParser() {
      const doc = makeDocument();
      return {
        doc,
        blocks,
        blockStarts,
        tip: doc,
        oldtip: doc,
        currentLine: "",
        lineNumber: 0,
        offset: 0,
        column: 0,
        nextNonspace: 0,
        nextNonspaceColumn: 0,
        indent: 0,
        indented: !1,
        blank: !1,
        partiallyConsumedTab: !1,
        allClosed: !0,
        lastMatchedContainer: doc,
        refmap: createLinkRefMap(),
        lastLineLength: 0,
        findNextNonspace,
        advanceOffset,
        advanceNextNonspace,
        addLine,
        addChild,
        incorporateLine,
        finalize,
        closeUnmatchedBlocks
      };
    }
    function parse(input, opts) {
      if (typeof input !== "string")
        throw new _ContractError("md/parse-not-string", "blockParser.parse: input must be a string, got " + typeof input, { context: { gotType: typeof input } });
      const p = makeParser(), lines = input.split(reLineEnding);
      let len = lines.length;
      if (input.charCodeAt(input.length - 1) === 10)
        len -= 1;
      for (let i = 0;i < len; i++)
        p.incorporateLine(lines[i]);
      while (p.tip)
        p.finalize(p.tip, len);
      detectTables(p.doc);
      detectTaskLists(p.doc);
      const ip = opts && opts.inlineParser;
      if (typeof ip === "function") {
        const walker = p.doc.walker();
        let event;
        while (event = walker.next()) {
          const node = event.node;
          if (!event.entering && (node.type === T_PARAGRAPH || node.type === T_HEADING || node.type === T_TABLE_CELL))
            ip(node, p.refmap);
        }
      } else
        stubInlines(p.doc);
      return { document: p.doc, refmap: p.refmap };
    }
    return { parse };
  } });
    __register({ name: "mdInlineRegex", dependencies: ["mdCommon"], factory: function(common) {
    const { ESCAPABLE, ENTITY } = common, ESCAPED_CHAR = "\\\\" + ESCAPABLE, rePunctuation = new RegExp(/^[!"#$%&'()*+,\-./:;<=>?@[\]\\^_`{|}~\p{P}\p{S}]/u), reLinkTitle = new RegExp('^(?:"(' + ESCAPED_CHAR + `|\\\\[^\\\\]|[^\\\\"\\x00])*"|'(` + ESCAPED_CHAR + "|\\\\[^\\\\]|[^\\\\'\\x00])*'|\\((" + ESCAPED_CHAR + "|\\\\[^\\\\]|[^\\\\()\\x00])*\\))"), reLinkDestinationBraces = /^(?:<(?:[^<>\n\\\x00]|\\.)*>)/, reEscapable = new RegExp("^" + ESCAPABLE), reEntityHere = new RegExp("^" + ENTITY, "i"), reTicks = /`+/, reTicksHere = /^`+/, reEmailAutolink = /^<([a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*)>/, reAutolink = /^<[A-Za-z][A-Za-z0-9.+-]{1,31}:[^<>\x00-\x20]*>/i, reSpnl = /^ *(?:\n *)?/, reWhitespaceChar = /^[ \t\n\x0b\x0c\x0d]/, reUnicodeWhitespaceChar = /^\s/, reFinalSpace = / *$/, reInitialSpace = /^ */, reSpaceAtEndOfLine = /^ *(?:\n|$)/, reLinkLabel = /^\[(?:[^\\[\]]|\\.){0,1000}\]/s, reMain = /^[^\n`[\]\\!<&*_'"~]+/m, reExtAutolinkUrl = /(?:^|[\s*_~(])((?:https?:\/\/|ftp:\/\/)[^\s<]+)/gi, reExtAutolinkWww = /(?:^|[\s*_~(])(www\.[^\s<]+)/gi, reExtAutolinkEmail = /(?:^|[\s*_~(<])([a-zA-Z0-9._+-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+)/g;
    function _isTildeCode(c) {
      return c === 126;
    }
    return {
      C_TILDE: 126,
      ESCAPED_CHAR,
      rePunctuation,
      reLinkTitle,
      reLinkDestinationBraces,
      reEscapable,
      reEntityHere,
      reTicks,
      reTicksHere,
      reEmailAutolink,
      reAutolink,
      reSpnl,
      reWhitespaceChar,
      reUnicodeWhitespaceChar,
      reFinalSpace,
      reInitialSpace,
      reSpaceAtEndOfLine,
      reLinkLabel,
      reMain,
      reExtAutolinkUrl,
      reExtAutolinkWww,
      reExtAutolinkEmail,
      _isTildeCode
    };
  } });
    __register({ name: "mdInlineHelpers", dependencies: ["mdNode","mdAstTypes"], factory: function(nodeApi, astTypes) {
    const { Node } = nodeApi, { T_TEXT } = astTypes;
    function makeText(s) {
      const n = new Node(T_TEXT);
      n.literal = s;
      return n;
    }
    function fromCodePoint(cp) {
      try {
        return String.fromCodePoint(cp);
      } catch {
        return "\uFFFD";
      }
    }
    function normalizeReference(str) {
      return str.slice(1, str.length - 1).trim().replace(/[ \t\r\n]+/g, " ").toLowerCase().toUpperCase();
    }
    function isSpace(c) {
      return c === 32 || c === 9 || c === 10 || c === 13;
    }
    function trim(str) {
      let start = 0;
      for (;start < str.length; start++)
        if (!isSpace(str.charCodeAt(start)))
          break;
      let end = str.length - 1;
      for (;end >= start; end--)
        if (!isSpace(str.charCodeAt(end)))
          break;
      return str.slice(start, end + 1);
    }
    return { makeText, fromCodePoint, normalizeReference, trim, isSpace };
  } });
    __register({ name: "mdInlineEscapes", dependencies: ["mdInlineHelpers","mdInlineRegex","mdCommon","mdNode","mdAstTypes","htmlEntities"], factory: function(helpers, regex, common, nodeApi, astTypes, htmlEntitiesMod) {
    const { decodeHtmlStrict: decodeHTMLStrict } = htmlEntitiesMod, { makeText } = helpers, { reEscapable, reEntityHere } = regex, { C_NEWLINE } = common, { Node } = nodeApi, { T_LINEBREAK } = astTypes;
    function installEscapes(ip) {
      ip.parseBackslash = function(block) {
        const subj = this.subject;
        this.pos += 1;
        if (this.peek() === C_NEWLINE) {
          this.pos += 1;
          block.appendChild(new Node(T_LINEBREAK));
        } else if (reEscapable.test(subj.charAt(this.pos))) {
          block.appendChild(makeText(subj.charAt(this.pos)));
          this.pos += 1;
        } else
          block.appendChild(makeText("\\"));
        return !0;
      };
      ip.parseEntity = function(block) {
        let m;
        if (m = this.match(reEntityHere)) {
          block.appendChild(makeText(decodeHTMLStrict(m)));
          return !0;
        }
        return !1;
      };
    }
    return { installEscapes };
  } });
    __register({ name: "mdInlineCodeSpan", dependencies: ["mdInlineHelpers","mdInlineRegex","mdNode","mdAstTypes"], factory: function(helpers, regex, nodeApi, astTypes) {
    const { makeText } = helpers, { reTicks, reTicksHere } = regex, { Node } = nodeApi, { T_CODE } = astTypes;
    function installCodeSpan(ip) {
      ip.parseBackticks = function(block) {
        const ticks = this.match(reTicksHere);
        if (ticks === null)
          return !1;
        const afterOpenTicks = this.pos;
        let matched;
        while ((matched = this.match(reTicks)) !== null)
          if (matched === ticks) {
            const node = new Node(T_CODE);
            let contents = this.subject.slice(afterOpenTicks, this.pos - ticks.length).replace(/\n/gm, " ");
            if (contents.length > 0 && contents.match(/[^ ]/) !== null && contents[0] === " " && contents[contents.length - 1] === " ")
              node.literal = contents.slice(1, contents.length - 1);
            else
              node.literal = contents;
            block.appendChild(node);
            return !0;
          }
        this.pos = afterOpenTicks;
        block.appendChild(makeText(ticks));
        return !0;
      };
    }
    return { installCodeSpan };
  } });
    __register({ name: "mdInlineAutolink", dependencies: ["mdInlineHelpers","mdInlineRegex","mdCommon","mdNode","mdAstTypes"], factory: function(helpers, regex, common, nodeApi, astTypes) {
    const { makeText } = helpers, { reEmailAutolink, reAutolink } = regex, { normalizeURI, reHtmlTag } = common, { Node } = nodeApi, { T_LINK, T_HTML_INLINE } = astTypes;
    function installAutolink(ip) {
      ip.parseAutolink = function(block) {
        let m, dest, node;
        if (m = this.match(reEmailAutolink)) {
          dest = m.slice(1, m.length - 1);
          node = new Node(T_LINK);
          node.destination = normalizeURI("mailto:" + dest);
          node.title = "";
          node.appendChild(makeText(dest));
          block.appendChild(node);
          return !0;
        } else if (m = this.match(reAutolink)) {
          dest = m.slice(1, m.length - 1);
          node = new Node(T_LINK);
          node.destination = normalizeURI(dest);
          node.title = "";
          node.appendChild(makeText(dest));
          block.appendChild(node);
          return !0;
        }
        return !1;
      };
      ip.parseHtmlTag = function(block) {
        const m = this.match(reHtmlTag);
        if (m === null)
          return !1;
        const node = new Node(T_HTML_INLINE);
        node.literal = m;
        block.appendChild(node);
        return !0;
      };
    }
    return { installAutolink };
  } });
    __register({ name: "mdInlineAutolinkExt", dependencies: ["mdInlineHelpers","mdInlineRegex","mdCommon","mdNode","mdAstTypes"], factory: function(helpers, regex, common, nodeApi, astTypes) {
    const { makeText } = helpers, { reExtAutolinkUrl, reExtAutolinkWww, reExtAutolinkEmail } = regex, { normalizeURI } = common, { Node } = nodeApi, { T_TEXT, T_LINK, T_IMAGE } = astTypes;
    function trimTrailingPunct(s) {
      while (s.length > 0 && /[?!.,:*_~]$/.test(s))
        s = s.slice(0, -1);
      while (s.length > 0 && s.endsWith(")")) {
        const opens = (s.match(/\(/g) || []).length;
        if ((s.match(/\)/g) || []).length > opens)
          s = s.slice(0, -1);
        else
          break;
      }
      s = s.replace(/&[a-zA-Z0-9]+;$/, "");
      return s;
    }
    function scanExtAutolinks(text) {
      const matches = [];
      let m;
      reExtAutolinkUrl.lastIndex = 0;
      while ((m = reExtAutolinkUrl.exec(text)) !== null) {
        let url = m[1];
        const trimmed = trimTrailingPunct(url);
        if (trimmed.length === 0)
          continue;
        const start = m.index + m[0].indexOf(m[1]);
        matches.push({ start, end: start + trimmed.length, url: trimmed, isEmail: !1, isWww: !1 });
      }
      reExtAutolinkWww.lastIndex = 0;
      while ((m = reExtAutolinkWww.exec(text)) !== null) {
        let url = m[1];
        const trimmed = trimTrailingPunct(url);
        if (trimmed.length === 0)
          continue;
        if (!/^www\.[^\s.]+\.[^\s]/.test(trimmed))
          continue;
        const start = m.index + m[0].indexOf(m[1]);
        matches.push({ start, end: start + trimmed.length, url: trimmed, isEmail: !1, isWww: !0 });
      }
      reExtAutolinkEmail.lastIndex = 0;
      while ((m = reExtAutolinkEmail.exec(text)) !== null) {
        let email = m[1];
        while (email.length > 0 && /[?!.,:_*~-]$/.test(email))
          email = email.slice(0, -1);
        if (!/@.+\..+/.test(email))
          continue;
        const start = m.index + m[0].indexOf(m[1]);
        matches.push({ start, end: start + email.length, url: email, isEmail: !0, isWww: !1 });
      }
      matches.sort((a, b) => a.start - b.start || b.end - b.start - (a.end - a.start));
      const final = [];
      let lastEnd = -1;
      for (const m2 of matches) {
        if (m2.start < lastEnd)
          continue;
        final.push(m2);
        lastEnd = m2.end;
      }
      return final;
    }
    function processExtendedAutolinks(root) {
      const containers = [], w = root.walker();
      let event;
      while (event = w.next()) {
        if (!event.entering)
          continue;
        const n = event.node;
        if (n.type === T_LINK || n.type === T_IMAGE) {
          w.resumeAt(n, !1);
          continue;
        }
        if (n.firstChild)
          containers.push(n);
      }
      for (const container of containers) {
        let cursor = container.firstChild;
        while (cursor) {
          if (cursor.type !== T_TEXT) {
            cursor = cursor.next;
            continue;
          }
          const run = [cursor];
          let scan = cursor.next;
          while (scan && scan.type === T_TEXT) {
            run.push(scan);
            scan = scan.next;
          }
          const combined = run.map((n) => n.literal || "").join(""), matches = combined.indexOf("http") >= 0 || combined.indexOf("ftp") >= 0 || combined.indexOf("www.") >= 0 || combined.indexOf("@") >= 0 ? scanExtAutolinks(combined) : [];
          if (matches.length === 0) {
            cursor = scan;
            continue;
          }
          const newNodes = [];
          let pos = 0;
          for (const m of matches) {
            if (m.start > pos)
              newNodes.push(makeText(combined.slice(pos, m.start)));
            const link = new Node(T_LINK);
            let dest = m.url;
            if (m.isEmail)
              dest = "mailto:" + dest;
            else if (m.isWww)
              dest = "http://" + dest;
            link.destination = normalizeURI(dest);
            link.title = "";
            link.appendChild(makeText(m.url));
            newNodes.push(link);
            pos = m.end;
          }
          if (pos < combined.length)
            newNodes.push(makeText(combined.slice(pos)));
          let anchor = run[0];
          anchor.literal = "";
          for (const nn of newNodes) {
            anchor.insertAfter(nn);
            anchor = nn;
          }
          for (const old of run)
            old.unlink();
          cursor = scan;
        }
      }
    }
    return { trimTrailingPunct, scanExtAutolinks, processExtendedAutolinks };
  } });
    __register({ name: "mdInlineDelimiterStack", dependencies: ["mdInlineHelpers","mdInlineRegex","mdCommon","mdNode","mdAstTypes"], factory: function(helpers, regex, common, nodeApi, astTypes) {
    const { makeText, fromCodePoint } = helpers, { C_TILDE, rePunctuation, reUnicodeWhitespaceChar } = regex, {
      C_ASTERISK,
      C_UNDERSCORE,
      C_SINGLEQUOTE,
      C_DOUBLEQUOTE
    } = common, { Node } = nodeApi, { T_EMPH, T_STRONG, T_STRIKETHROUGH } = astTypes;
    function removeDelimitersBetween(bottom, top) {
      if (bottom.next !== top) {
        bottom.next = top;
        top.previous = bottom;
      }
    }
    function previousChar(str, pos) {
      if (pos === 0)
        return `
`;
      if ((str.charCodeAt(pos - 1) & 64512) !== 56320)
        return str.charAt(pos - 1);
      if ((str.charCodeAt(pos - 2) & 64512) !== 55296)
        return str.charAt(pos - 1);
      return str.slice(pos - 2, pos);
    }
    function installDelimiterStack(ip) {
      ip.scanDelims = function(cc) {
        let numdelims = 0;
        const startpos = this.pos;
        if (cc === C_SINGLEQUOTE || cc === C_DOUBLEQUOTE) {
          numdelims++;
          this.pos++;
        } else
          while (this.peek() === cc) {
            numdelims++;
            this.pos++;
          }
        if (numdelims === 0)
          return null;
        const char_before = previousChar(this.subject, startpos), cc_after = this.peek(), char_after = cc_after === -1 ? `
` : fromCodePoint(cc_after), after_is_whitespace = reUnicodeWhitespaceChar.test(char_after), after_is_punctuation = rePunctuation.test(char_after), before_is_whitespace = reUnicodeWhitespaceChar.test(char_before), before_is_punctuation = rePunctuation.test(char_before), left_flanking = !after_is_whitespace && (!after_is_punctuation || before_is_whitespace || before_is_punctuation), right_flanking = !before_is_whitespace && (!before_is_punctuation || after_is_whitespace || after_is_punctuation);
        let can_open, can_close;
        if (cc === C_UNDERSCORE) {
          can_open = left_flanking && (!right_flanking || before_is_punctuation);
          can_close = right_flanking && (!left_flanking || after_is_punctuation);
        } else if (cc === C_SINGLEQUOTE || cc === C_DOUBLEQUOTE) {
          can_open = left_flanking && (!right_flanking || before_is_punctuation);
          can_close = right_flanking;
        } else {
          can_open = left_flanking;
          can_close = right_flanking;
        }
        this.pos = startpos;
        return { numdelims, can_open, can_close };
      };
      ip.handleDelim = function(cc, block) {
        const res = this.scanDelims(cc);
        if (!res)
          return !1;
        const numdelims = res.numdelims, startpos = this.pos;
        let contents;
        this.pos += numdelims;
        if (cc === C_SINGLEQUOTE)
          contents = "\u2019";
        else if (cc === C_DOUBLEQUOTE)
          contents = "\u201C";
        else
          contents = this.subject.slice(startpos, this.pos);
        const node = makeText(contents);
        block.appendChild(node);
        if ((res.can_open || res.can_close) && (this.options.smart || cc !== C_SINGLEQUOTE && cc !== C_DOUBLEQUOTE)) {
          this.delimiters = {
            cc,
            numdelims,
            origdelims: numdelims,
            node,
            previous: this.delimiters,
            next: null,
            can_open: res.can_open,
            can_close: res.can_close
          };
          if (this.delimiters.previous !== null)
            this.delimiters.previous.next = this.delimiters;
        }
        return !0;
      };
      ip.removeDelimiter = function(delim) {
        if (delim.previous !== null)
          delim.previous.next = delim.next;
        if (delim.next === null)
          this.delimiters = delim.previous;
        else
          delim.next.previous = delim.previous;
      };
      ip.processEmphasis = function(stack_bottom) {
        let opener, closer, old_closer, opener_inl, closer_inl, tempstack, use_delims, tmp, next, opener_found;
        const openers_bottom = [];
        let openers_bottom_index, odd_match;
        for (let i = 0;i < 15; i++)
          openers_bottom[i] = stack_bottom;
        closer = this.delimiters;
        while (closer !== null && closer.previous !== stack_bottom)
          closer = closer.previous;
        while (closer !== null) {
          const closercc = closer.cc;
          if (!closer.can_close)
            closer = closer.next;
          else {
            opener = closer.previous;
            opener_found = !1;
            switch (closercc) {
              case C_SINGLEQUOTE:
                openers_bottom_index = 0;
                break;
              case C_DOUBLEQUOTE:
                openers_bottom_index = 1;
                break;
              case C_UNDERSCORE:
                openers_bottom_index = 2 + (closer.can_open ? 3 : 0) + closer.origdelims % 3;
                break;
              case C_ASTERISK:
                openers_bottom_index = 8 + (closer.can_open ? 3 : 0) + closer.origdelims % 3;
                break;
              case C_TILDE:
                openers_bottom_index = 13;
                break;
            }
            while (opener !== null && opener !== stack_bottom && opener !== openers_bottom[openers_bottom_index]) {
              odd_match = (closer.can_open || opener.can_close) && closer.origdelims % 3 !== 0 && (opener.origdelims + closer.origdelims) % 3 === 0;
              if (opener.cc === closer.cc && opener.can_open && !odd_match) {
                opener_found = !0;
                break;
              }
              opener = opener.previous;
            }
            old_closer = closer;
            if (closercc === C_ASTERISK || closercc === C_UNDERSCORE || closercc === C_TILDE)
              if (!opener_found)
                closer = closer.next;
              else if (closercc === C_TILDE && (opener.numdelims > 2 || closer.numdelims > 2 || opener.numdelims !== closer.numdelims))
                closer = closer.next;
              else {
                let nodeType;
                if (closercc === C_TILDE) {
                  use_delims = opener.numdelims;
                  nodeType = T_STRIKETHROUGH;
                } else {
                  use_delims = closer.numdelims >= 2 && opener.numdelims >= 2 ? 2 : 1;
                  nodeType = use_delims === 1 ? T_EMPH : T_STRONG;
                }
                opener_inl = opener.node;
                closer_inl = closer.node;
                opener.numdelims -= use_delims;
                closer.numdelims -= use_delims;
                opener_inl.literal = opener_inl.literal.slice(0, opener_inl.literal.length - use_delims);
                closer_inl.literal = closer_inl.literal.slice(0, closer_inl.literal.length - use_delims);
                const emph = new Node(nodeType);
                if (nodeType === T_STRIKETHROUGH)
                  emph.delimiterCount = use_delims;
                if (this._sp && opener_inl.sourcepos && closer_inl.sourcepos)
                  emph.sourcepos = [
                    opener_inl.sourcepos[0].slice(),
                    closer_inl.sourcepos[1].slice()
                  ];
                tmp = opener_inl.next;
                while (tmp && tmp !== closer_inl) {
                  next = tmp.next;
                  tmp.unlink();
                  emph.appendChild(tmp);
                  tmp = next;
                }
                opener_inl.insertAfter(emph);
                removeDelimitersBetween(opener, closer);
                if (opener.numdelims === 0) {
                  opener_inl.unlink();
                  this.removeDelimiter(opener);
                }
                if (closer.numdelims === 0) {
                  closer_inl.unlink();
                  tempstack = closer.next;
                  this.removeDelimiter(closer);
                  closer = tempstack;
                }
              }
            else if (closercc === C_SINGLEQUOTE) {
              closer.node.literal = "\u2019";
              if (opener_found)
                opener.node.literal = "\u2018";
              closer = closer.next;
            } else if (closercc === C_DOUBLEQUOTE) {
              closer.node.literal = "\u201D";
              if (opener_found)
                opener.node.literal = "\u201C";
              closer = closer.next;
            }
            if (!opener_found) {
              openers_bottom[openers_bottom_index] = old_closer.previous;
              if (!old_closer.can_open)
                this.removeDelimiter(old_closer);
            }
          }
        }
        while (this.delimiters !== null && this.delimiters !== stack_bottom)
          this.removeDelimiter(this.delimiters);
      };
    }
    return { installDelimiterStack };
  } });
    __register({ name: "mdInlineLink", dependencies: ["mdInlineHelpers","mdInlineRegex","mdCommon","mdNode","mdAstTypes"], factory: function(helpers, regex, common, nodeApi, astTypes) {
    const { makeText, normalizeReference, fromCodePoint } = helpers, {
      reLinkTitle,
      reLinkDestinationBraces,
      reLinkLabel,
      reEscapable,
      reWhitespaceChar
    } = regex, {
      unescapeString,
      normalizeURI,
      C_BACKSLASH,
      C_LESSTHAN,
      C_OPEN_BRACKET,
      C_OPEN_PAREN,
      C_CLOSE_PAREN
    } = common, { Node } = nodeApi, { T_LINK, T_IMAGE } = astTypes;
    function installLink(ip) {
      ip.parseLinkTitle = function() {
        const title = this.match(reLinkTitle);
        if (title === null)
          return null;
        return unescapeString(title.slice(1, -1));
      };
      ip.parseLinkDestination = function() {
        let res = this.match(reLinkDestinationBraces);
        if (res === null) {
          if (this.peek() === C_LESSTHAN)
            return null;
          const savepos = this.pos;
          let openparens = 0, c;
          while ((c = this.peek()) !== -1)
            if (c === C_BACKSLASH && reEscapable.test(this.subject.charAt(this.pos + 1))) {
              this.pos += 1;
              if (this.peek() !== -1)
                this.pos += 1;
            } else if (c === C_OPEN_PAREN) {
              this.pos += 1;
              openparens += 1;
            } else if (c === C_CLOSE_PAREN) {
              if (openparens < 1)
                break;
              this.pos += 1;
              openparens -= 1;
            } else if (reWhitespaceChar.exec(fromCodePoint(c)) !== null)
              break;
            else
              this.pos += 1;
          if (this.pos === savepos && c !== C_CLOSE_PAREN)
            return null;
          if (openparens !== 0)
            return null;
          res = this.subject.slice(savepos, this.pos);
          return normalizeURI(unescapeString(res));
        }
        return normalizeURI(unescapeString(res.slice(1, -1)));
      };
      ip.parseLinkLabel = function() {
        const m = this.match(reLinkLabel);
        if (m === null || m.length > 1001)
          return 0;
        return m.length;
      };
      ip.parseOpenBracket = function(block) {
        const startpos = this.pos;
        this.pos += 1;
        const node = makeText("[");
        block.appendChild(node);
        this.addBracket(node, startpos, !1);
        return !0;
      };
      ip.parseBang = function(block) {
        const startpos = this.pos;
        this.pos += 1;
        if (this.peek() === C_OPEN_BRACKET) {
          this.pos += 1;
          const node = makeText("![");
          block.appendChild(node);
          this.addBracket(node, startpos + 1, !0);
        } else
          block.appendChild(makeText("!"));
        return !0;
      };
      ip.parseCloseBracket = function(block) {
        let dest, title, matched = !1, reflabel, opener;
        this.pos += 1;
        const startpos = this.pos;
        opener = this.brackets;
        if (opener === null) {
          block.appendChild(makeText("]"));
          return !0;
        }
        if (!opener.active) {
          block.appendChild(makeText("]"));
          this.removeBracket();
          return !0;
        }
        const is_image = opener.image, savepos = this.pos;
        if (this.peek() === C_OPEN_PAREN) {
          this.pos++;
          if (this.spnl() && (dest = this.parseLinkDestination()) !== null && this.spnl() && (reWhitespaceChar.test(this.subject.charAt(this.pos - 1)) && (title = this.parseLinkTitle()) || !0) && this.spnl() && this.peek() === C_CLOSE_PAREN) {
            this.pos += 1;
            matched = !0;
          } else
            this.pos = savepos;
        }
        if (!matched) {
          const beforelabel = this.pos, n = this.parseLinkLabel();
          if (n > 2)
            reflabel = this.subject.slice(beforelabel, beforelabel + n);
          else if (!opener.bracketAfter)
            reflabel = this.subject.slice(opener.index, startpos);
          if (n === 0)
            this.pos = savepos;
          if (reflabel) {
            const link = this.refmap[normalizeReference(reflabel)];
            if (link) {
              dest = link.destination;
              title = link.title;
              matched = !0;
            }
          }
        }
        if (matched) {
          const node = new Node(is_image ? T_IMAGE : T_LINK);
          node.destination = dest;
          node.title = title || "";
          if (this._sp && opener.node.sourcepos)
            node.sourcepos = [
              opener.node.sourcepos[0].slice(),
              this._sp(Math.max(0, this.pos - 1))
            ];
          let tmp, next;
          tmp = opener.node.next;
          while (tmp) {
            next = tmp.next;
            tmp.unlink();
            node.appendChild(tmp);
            tmp = next;
          }
          block.appendChild(node);
          this.processEmphasis(opener.previousDelimiter);
          this.removeBracket();
          opener.node.unlink();
          if (!is_image) {
            opener = this.brackets;
            while (opener !== null) {
              if (!opener.image)
                opener.active = !1;
              opener = opener.previous;
            }
          }
          return !0;
        } else {
          this.removeBracket();
          this.pos = startpos;
          block.appendChild(makeText("]"));
          return !0;
        }
      };
      ip.addBracket = function(node, index, image) {
        if (this.brackets !== null)
          this.brackets.bracketAfter = !0;
        this.brackets = {
          node,
          previous: this.brackets,
          previousDelimiter: this.delimiters,
          index,
          image,
          active: !0
        };
      };
      ip.removeBracket = function() {
        this.brackets = this.brackets.previous;
      };
    }
    return { installLink };
  } });
    __register({ name: "mdInlineLineBreak", dependencies: ["mdInlineHelpers","mdInlineRegex","mdNode","mdAstTypes"], factory: function(helpers, regex, nodeApi, astTypes) {
    const { makeText } = helpers, { reFinalSpace, reInitialSpace, reMain } = regex, { Node } = nodeApi, { T_TEXT, T_SOFTBREAK, T_LINEBREAK } = astTypes;
    function installLineBreak(ip) {
      ip.parseNewline = function(block) {
        this.pos += 1;
        const lastc = block.lastChild;
        if (lastc && lastc.type === T_TEXT && lastc.literal[lastc.literal.length - 1] === " ") {
          const hardbreak = lastc.literal[lastc.literal.length - 2] === " ";
          lastc.literal = lastc.literal.replace(reFinalSpace, "");
          block.appendChild(new Node(hardbreak ? T_LINEBREAK : T_SOFTBREAK));
        } else
          block.appendChild(new Node(T_SOFTBREAK));
        this.match(reInitialSpace);
        return !0;
      };
      ip.parseString = function(block) {
        const m = this.match(reMain);
        if (m === null)
          return !1;
        block.appendChild(makeText(m));
        return !0;
      };
    }
    return { installLineBreak };
  } });
    __register({ name: "mdInlineSourcepos", dependencies: [], factory: function() {
    function backfillSourcepos(root) {
      function visit(n) {
        let c = n.firstChild;
        while (c) {
          visit(c);
          c = c.next;
        }
        if (!n.sourcepos && n.firstChild) {
          const first = n.firstChild;
          let last = n.lastChild;
          while (last && !last.sourcepos)
            last = last.prev;
          if (first.sourcepos && last && last.sourcepos)
            n.sourcepos = [first.sourcepos[0].slice(), last.sourcepos[1].slice()];
        }
        if (!n.sourcepos && n.parent && n.parent.sourcepos)
          n.sourcepos = [n.parent.sourcepos[0].slice(), n.parent.sourcepos[1].slice()];
      }
      let c = root.firstChild;
      while (c) {
        visit(c);
        c = c.next;
      }
    }
    return { backfillSourcepos };
  } });
    __register({ name: "inlineParser", dependencies: ["mdErrors","mdCommon","mdInlineRegex","mdInlineHelpers","mdInlineEscapes","mdInlineCodeSpan","mdInlineAutolink","mdInlineAutolinkExt","mdInlineDelimiterStack","mdInlineLink","mdInlineLineBreak","mdInlineSourcepos"], factory: function(errors, common, regex, helpers, escapes, codeSpan, autolink, autolinkExt, delimiterStack, link, lineBreak, sourcepos, options) {
    const {
      C_NEWLINE,
      C_ASTERISK,
      C_UNDERSCORE,
      C_BACKTICK,
      C_OPEN_BRACKET,
      C_CLOSE_BRACKET,
      C_LESSTHAN,
      C_BANG,
      C_BACKSLASH,
      C_AMPERSAND,
      C_SINGLEQUOTE,
      C_DOUBLEQUOTE
    } = common, { C_TILDE, reSpnl } = regex, { makeText, fromCodePoint, trim, isSpace } = helpers, { installEscapes } = escapes, { installCodeSpan } = codeSpan, { installAutolink } = autolink, { installDelimiterStack } = delimiterStack, { installLink } = link, { installLineBreak } = lineBreak, { processExtendedAutolinks } = autolinkExt, { backfillSourcepos } = sourcepos;
    function createInlineParser(opts) {
      const ip = {
        subject: "",
        pos: 0,
        delimiters: null,
        brackets: null,
        refmap: {},
        options: opts || {}
      };
      ip.match = function(re) {
        const m = re.exec(this.subject.slice(this.pos));
        if (m === null)
          return null;
        this.pos += m.index + m[0].length;
        return m[0];
      };
      ip.peek = function() {
        if (this.pos < this.subject.length)
          return this.subject.codePointAt(this.pos);
        return -1;
      };
      ip.spnl = function() {
        this.match(reSpnl);
        return !0;
      };
      installEscapes(ip);
      installCodeSpan(ip);
      installAutolink(ip);
      installDelimiterStack(ip);
      installLink(ip);
      installLineBreak(ip);
      ip.parseInline = function(block) {
        let res;
        const c = this.peek();
        if (c === -1)
          return !1;
        switch (c) {
          case C_NEWLINE:
            res = this.parseNewline(block);
            break;
          case C_BACKSLASH:
            res = this.parseBackslash(block);
            break;
          case C_BACKTICK:
            res = this.parseBackticks(block);
            break;
          case C_ASTERISK:
          case C_UNDERSCORE:
            res = this.handleDelim(c, block);
            break;
          case C_TILDE:
            res = this.handleDelim(c, block);
            break;
          case C_SINGLEQUOTE:
          case C_DOUBLEQUOTE:
            res = this.options.smart && this.handleDelim(c, block);
            break;
          case C_OPEN_BRACKET:
            res = this.parseOpenBracket(block);
            break;
          case C_BANG:
            res = this.parseBang(block);
            break;
          case C_CLOSE_BRACKET:
            res = this.parseCloseBracket(block);
            break;
          case C_LESSTHAN:
            res = this.parseAutolink(block) || this.parseHtmlTag(block);
            break;
          case C_AMPERSAND:
            res = this.parseEntity(block);
            break;
          default:
            res = this.parseString(block);
            break;
        }
        if (!res) {
          this.pos += 1;
          block.appendChild(makeText(fromCodePoint(c)));
        }
        return !0;
      };
      ip.parse = function(block, refmap) {
        const raw = block.stringContent || "";
        this.subject = trim(raw);
        let leadTrim = 0;
        while (leadTrim < raw.length && isSpace(raw.charCodeAt(leadTrim)))
          leadTrim++;
        this.pos = 0;
        this.delimiters = null;
        this.brackets = null;
        if (refmap)
          this.refmap = refmap;
        const wantSourcepos = !!this.options.sourcepos;
        if (wantSourcepos) {
          let baseLine = 1, baseCol = 1;
          if (block.sourcepos) {
            baseLine = block.sourcepos[0][0];
            baseCol = block.sourcepos[0][1];
          }
          const lineStarts = [0];
          for (let i = 0;i < this.subject.length; i++)
            if (this.subject.charCodeAt(i) === 10)
              lineStarts.push(i + 1);
          this._sp = (p) => {
            if (p < 0)
              p = 0;
            if (p > this.subject.length)
              p = this.subject.length;
            let lo = 0, hi = lineStarts.length - 1;
            while (lo < hi) {
              const mid = lo + hi + 1 >> 1;
              if (lineStarts[mid] <= p)
                lo = mid;
              else
                hi = mid - 1;
            }
            const lineIdx = lo, col = p - lineStarts[lineIdx];
            if (lineIdx === 0)
              return [baseLine, baseCol + leadTrim + col];
            return [baseLine + lineIdx, 1 + col];
          };
        } else
          this._sp = null;
        while (block.firstChild)
          block.firstChild.unlink();
        if (wantSourcepos)
          while (!0) {
            const posBefore = this.pos, beforeLast = block.lastChild;
            if (!this.parseInline(block))
              break;
            const posAfterIncl = Math.max(posBefore, this.pos - 1);
            let c = beforeLast ? beforeLast.next : block.firstChild;
            while (c) {
              if (!c.sourcepos)
                c.sourcepos = [this._sp(posBefore), this._sp(posAfterIncl)];
              c = c.next;
            }
          }
        else
          while (this.parseInline(block))
            ;
        block.stringContent = null;
        this.processEmphasis(null);
        if (this.options.extendedAutolinks !== !1)
          processExtendedAutolinks(block);
        if (wantSourcepos)
          backfillSourcepos(block);
      };
      return ip;
    }
    const ip = createInlineParser(options);
    function parse(block, refmap) {
      ip.parse(block, refmap);
    }
    return { parse };
  } });
    __register({ name: "inlineParserBuilder", dependencies: ["mdErrors","mdCommon","mdInlineRegex","mdInlineHelpers","mdInlineEscapes","mdInlineCodeSpan","mdInlineAutolink","mdInlineAutolinkExt","mdInlineDelimiterStack","mdInlineLink","mdInlineLineBreak","mdInlineSourcepos"], factory: function (errors, common, regex, helpers, escapes, codeSpan, autolink, autolinkExt, delimiterStack, link, lineBreak, sourcepos) {
        const inlineParserDesc = __reg['inlineParser'];
        return function (opts) {
            return inlineParserDesc.factory(errors, common, regex, helpers, escapes, codeSpan, autolink, autolinkExt, delimiterStack, link, lineBreak, sourcepos, opts || {});
        };
    } });
    __register({ name: "renderHtmlMod", dependencies: ["mdErrors"], factory: function(errors) {
    const { RenderError } = errors, BLOCK_CONTAINERS = new Set([
      "document",
      "block_quote",
      "list",
      "item",
      "table",
      "table_row",
      "admonition",
      "footnote_def"
    ]), INLINE_CONTAINERS = new Set([
      "paragraph",
      "heading",
      "emph",
      "strong",
      "link",
      "image",
      "strikethrough",
      "table_cell",
      "highlight",
      "subscript",
      "superscript"
    ]);
    function isContainerType(type) {
      return BLOCK_CONTAINERS.has(type) || INLINE_CONTAINERS.has(type);
    }

    class WalkerLocal {
      constructor(root) {
        this.current = root;
        this.root = root;
        this.entering = !0;
      }
      next() {
        const cur = this.current;
        if (cur === null)
          return null;
        const entering = this.entering, container = isContainerType(cur.type);
        if (entering && container)
          if (cur.firstChild) {
            this.current = cur.firstChild;
            this.entering = !0;
          } else
            this.entering = !1;
        else if (cur === this.root)
          this.current = null;
        else if (cur.next === null) {
          this.current = cur.parent;
          this.entering = !1;
        } else {
          this.current = cur.next;
          this.entering = !0;
        }
        return { entering, node: cur };
      }
    }
    const RE_XML_SPECIAL = /[&<>"]/g;
    function replaceUnsafeChar(s) {
      switch (s) {
        case "&":
          return "&amp;";
        case "<":
          return "&lt;";
        case ">":
          return "&gt;";
        case '"':
          return "&quot;";
        default:
          return s;
      }
    }
    function escapeHtml(s) {
      if (RE_XML_SPECIAL.test(s))
        return s.replace(RE_XML_SPECIAL, replaceUnsafeChar);
      return s;
    }
    const UNRESERVED_URL = new Set;
    for (const c of "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~:/?#[]@!$&'()*+,;=")
      UNRESERVED_URL.add(c.charCodeAt(0));
    function isHex(c) {
      return c >= 48 && c <= 57 || c >= 65 && c <= 70 || c >= 97 && c <= 102;
    }
    const _urlEncoder = new TextEncoder;
    function encodeUrl(url) {
      let out = "";
      for (let i = 0;i < url.length; i++) {
        const c = url.charCodeAt(i);
        if (c === 37 && i + 2 < url.length && isHex(url.charCodeAt(i + 1)) && isHex(url.charCodeAt(i + 2))) {
          out += url.substr(i, 3);
          i += 2;
          continue;
        }
        if (c < 128)
          if (UNRESERVED_URL.has(c))
            out += url[i];
          else
            out += "%" + c.toString(16).toUpperCase().padStart(2, "0");
        else {
          const bytes = _urlEncoder.encode(url[i]);
          for (const b of bytes)
            out += "%" + b.toString(16).toUpperCase().padStart(2, "0");
        }
      }
      return escapeHtml(out);
    }
    const RE_SAFE_DATA_IMAGE = /^\s*data:image\/(png|jpe?g|gif|webp|svg\+xml|bmp|ico|avif|apng)[;,]/i, RE_DANGEROUS_SCHEME = /^\s*(javascript|vbscript|file|data):/i, DISALLOWED_RAW_HTML = /<(\/?(?:title|textarea|style|xmp|iframe|noembed|noframes|script|plaintext)(?:\s|>|\/>|$))/gi;
    function filterDisallowedRawHtml(s) {
      return s.replace(DISALLOWED_RAW_HTML, "&lt;$1");
    }
    function renderHtml(root, opts) {
      if (!root || typeof root !== "object" || !root.type) {
        const gotType = root === null ? "null" : typeof root;
        throw new RenderError("md/render-invalid-root", "renderHtml: invalid AST root (expected document node, got " + gotType + ")", { context: { gotType } });
      }
      const safe = !(opts && opts.safe === !1), allowDataImage = !!(opts && opts.allowDataImage), softbreak = opts && opts.softbreak || `
`, filterHtml = !(opts && opts.disallowedRawHtml === !1) ? filterDisallowedRawHtml : (s) => s, buf = [], w = new WalkerLocal(root);
      let event, node, entering, lastOut = `
`, disableTags = 0;
      function lit(s) {
        buf.push(s);
        if (s.length > 0)
          lastOut = s.charAt(s.length - 1);
      }
      function out(s) {
        if (disableTags > 0)
          lit(s.replace(/<[^>]*>/g, ""));
        else
          lit(s);
      }
      function tag(s) {
        if (disableTags > 0)
          return;
        lit(s);
      }
      function cr() {
        if (lastOut !== `
`)
          lit(`
`);
      }
      function isDangerousUrl(url) {
        if (!RE_DANGEROUS_SCHEME.test(url))
          return !1;
        if (allowDataImage && RE_SAFE_DATA_IMAGE.test(url))
          return !1;
        return !0;
      }
      while ((event = w.next()) !== null) {
        node = event.node;
        entering = event.entering;
        switch (node.type) {
          case "document":
            break;
          case "paragraph": {
            const grandparent = node.parent && node.parent.parent;
            if (!(grandparent && grandparent.type === "list" && grandparent.listTight === !0))
              if (entering) {
                cr();
                out("<p>");
              } else {
                out("</p>");
                cr();
              }
            break;
          }
          case "heading": {
            const t = "h" + node.level;
            if (entering) {
              cr();
              out("<" + t + ">");
            } else {
              out("</" + t + ">");
              cr();
            }
            break;
          }
          case "thematic_break":
            cr();
            out("<hr />");
            cr();
            break;
          case "block_quote":
            if (entering) {
              cr();
              out("<blockquote>");
              cr();
            } else {
              cr();
              out("</blockquote>");
              cr();
            }
            break;
          case "list": {
            const t = node.listType === "ordered" ? "ol" : "ul";
            if (entering) {
              cr();
              out("<" + t);
              if (node.listType === "ordered" && typeof node.listStart === "number" && node.listStart !== 1)
                out(' start="' + node.listStart + '"');
              out(">");
              cr();
            } else {
              cr();
              out("</" + t + ">");
              cr();
            }
            break;
          }
          case "item":
            if (entering) {
              out("<li>");
              if (node.checked === !0)
                out('<input checked="" disabled="" type="checkbox"> ');
              else if (node.checked === !1)
                out('<input disabled="" type="checkbox"> ');
            } else {
              out("</li>");
              cr();
            }
            break;
          case "code_block": {
            let info = node.info, attr = "";
            if (info) {
              const lang = info.split(/\s+/)[0];
              if (lang)
                attr = ' class="language-' + escapeHtml(lang) + '"';
            }
            cr();
            out("<pre><code" + attr + ">");
            out(escapeHtml(node.literal || ""));
            out("</code></pre>");
            cr();
            break;
          }
          case "html_block":
            cr();
            out(safe && !node._mdTrustedHtml ? "" : filterHtml(node.literal || ""));
            cr();
            break;
          case "text":
            out(escapeHtml(node.literal || ""));
            break;
          case "code":
            tag("<code>");
            out(escapeHtml(node.literal || ""));
            tag("</code>");
            break;
          case "softbreak":
            lit(softbreak);
            break;
          case "linebreak":
            tag("<br />");
            cr();
            break;
          case "emph":
            tag(entering ? "<em>" : "</em>");
            break;
          case "strong":
            tag(entering ? "<strong>" : "</strong>");
            break;
          case "strikethrough":
            tag(entering ? "<del>" : "</del>");
            break;
          case "link":
            if (entering) {
              const url = node.destination || "";
              if (safe && isDangerousUrl(url))
                tag('<a href="">');
              else {
                let s = '<a href="' + encodeUrl(url) + '"';
                if (node.title)
                  s += ' title="' + escapeHtml(node.title) + '"';
                s += ">";
                tag(s);
              }
            } else
              tag("</a>");
            break;
          case "image":
            if (entering) {
              if (disableTags === 0) {
                const url = node.destination || "", safeUrl = safe && isDangerousUrl(url) ? "" : encodeUrl(url);
                lit('<img src="' + safeUrl + '" alt="');
              }
              disableTags++;
            } else {
              disableTags--;
              if (disableTags === 0) {
                lit('"');
                if (node.title)
                  lit(' title="' + escapeHtml(node.title) + '"');
                lit(" />");
              }
            }
            break;
          case "html_inline":
            tag(safe && !node._mdTrustedHtml ? "" : filterHtml(node.literal || ""));
            break;
          case "table":
            if (entering) {
              cr();
              out("<table>");
              cr();
            } else {
              if (node.firstChild && node.firstChild.next) {
                out("</tbody>");
                cr();
              }
              cr();
              out("</table>");
              cr();
            }
            break;
          case "table_row":
            if (entering) {
              cr();
              if (node.isHeader) {
                out("<thead>");
                cr();
              } else if (!node.prev || node.prev.isHeader) {
                out("<tbody>");
                cr();
              }
              out("<tr>");
              cr();
            } else {
              cr();
              out("</tr>");
              cr();
              if (node.isHeader) {
                out("</thead>");
                cr();
              }
            }
            break;
          case "table_cell": {
            const t = node.isHeader ? "th" : "td";
            if (entering) {
              let attr = "";
              if (node.cellAlign)
                attr = ' align="' + node.cellAlign + '"';
              out("<" + t + attr + ">");
            } else {
              out("</" + t + ">");
              cr();
            }
            break;
          }
          default:
            break;
        }
      }
      return buf.join("");
    }
    return { renderHtml, escapeHtml, encodeUrl };
  } });
    __register({ name: "renderMarkdownMod", dependencies: ["mdErrors"], factory: function(errors) {
    const { RenderError } = errors;
    function escapeText(s) {
      return s.replace(/([\\`*_[\]<>~])/g, "\\$1").replace(/!\[/g, "\\!\\[");
    }
    function escapeLineStart(line) {
      const lead = /^ {1,3}(?=\S)/.exec(line), indent = lead ? lead[0] : "", rest = line.slice(indent.length);
      if (/^(-+|=+)[ \t]*$/.test(rest))
        return indent + "\\" + rest;
      const ord = /^(\d{1,9})([.)])(?=\s|$)/.exec(rest);
      if (ord)
        return indent + ord[1] + "\\" + ord[2] + rest.slice(ord[0].length);
      if (/^[-+*](?=\s|$)/.test(rest) || /^#{1,6}(?=\s|$)/.test(rest) || rest.charCodeAt(0) === 62)
        return indent + "\\" + rest;
      return line;
    }
    function renderDestination(dest) {
      const d = dest || "";
      if (d !== "" && /[\s<\u0000-\u001f\u007f]/.test(d))
        return "<" + d.replace(/([<>\\])/g, "\\$1").replace(/\r\n|\r|\n/g, "%0A") + ">";
      return d.replace(/([()])/g, "\\$1");
    }
    function escapeParagraphLines(s) {
      return s.split(`
`).map(escapeLineStart).join(`
`);
    }
    function escapeTableCell(s) {
      return s.replace(/\|/g, "\\|").replace(/\n/g, " ");
    }
    function renderInlines(node, inTable) {
      let out = "", child = node.firstChild;
      while (child) {
        out += renderInline(child, inTable);
        child = child.next;
      }
      return out;
    }
    function renderInline(node, inTable) {
      switch (node.type) {
        case "text":
          return escapeText(node.literal || "");
        case "softbreak":
          return inTable ? " " : `
`;
        case "linebreak":
          return inTable ? " " : "\\\n";
        case "code": {
          const lit = node.literal || "", runs = lit.match(/`+/g) || [];
          let n = 1;
          for (const r of runs)
            if (r.length >= n)
              n = r.length + 1;
          const fence = "`".repeat(n), pad = lit.startsWith("`") || lit.endsWith("`") || /^\s|\s$/.test(lit) ? " " : "";
          return fence + pad + lit + pad + fence;
        }
        case "emph":
          return "*" + renderInlines(node, inTable) + "*";
        case "strong":
          return "**" + renderInlines(node, inTable) + "**";
        case "strikethrough": {
          const run = Object.prototype.hasOwnProperty.call(node, "delimiterCount") && node.delimiterCount === 1 ? "~" : "~~";
          return run + renderInlines(node, inTable) + run;
        }
        case "link": {
          const inner = renderInlines(node, inTable), url = renderDestination(node.destination), title = node.title ? ' "' + (node.title || "").replace(/"/g, "\\\"") + '"' : "";
          return "[" + inner + "](" + url + title + ")";
        }
        case "image": {
          const inner = renderInlines(node, inTable), url = renderDestination(node.destination), title = node.title ? ' "' + (node.title || "").replace(/"/g, "\\\"") + '"' : "";
          return "![" + inner + "](" + url + title + ")";
        }
        case "subscript":
          return "~" + renderInlines(node, inTable) + "~";
        case "superscript":
          return "^" + renderInlines(node, inTable) + "^";
        case "highlight":
          return "==" + renderInlines(node, inTable) + "==";
        case "html_inline":
          return node.literal || "";
        default:
          return "";
      }
    }
    function indent(s, prefix) {
      if (!s)
        return "";
      return s.split(`
`).map((l, i) => i === 0 ? l : l.length ? prefix + l : prefix.replace(/\s+$/, "")).join(`
`);
    }
    function renderBlock(node, ctx) {
      switch (node.type) {
        case "document": {
          let out = "", child = node.firstChild;
          while (child) {
            out += renderBlock(child, ctx);
            if (child.next)
              out += `
`;
            child = child.next;
          }
          return out;
        }
        case "heading":
          return "#".repeat(node.level) + " " + renderInlines(node, !1) + `
`;
        case "paragraph":
          return escapeParagraphLines(renderInlines(node, !1)) + `
`;
        case "thematic_break":
          return `---
`;
        case "code_block": {
          const info = node.info || "", literal = (node.literal || "").replace(/\n$/, ""), runs = literal.match(/^`{3,}|\n`{3,}/g) || [];
          let n = 3;
          for (const r of runs) {
            const len = r.replace(/\n/, "").length;
            if (len >= n)
              n = len + 1;
          }
          const fence = "`".repeat(n);
          return fence + info + `
` + literal + (literal ? `
` : "") + fence + `
`;
        }
        case "html_block":
          return (node.literal || "") + `
`;
        case "block_quote": {
          let inner = "", child = node.firstChild;
          while (child) {
            inner += renderBlock(child, ctx);
            if (child.next)
              inner += `
`;
            child = child.next;
          }
          return inner.split(`
`).map((l) => l.length ? "> " + l : ">").join(`
`).replace(/>\n$/, `
`);
        }
        case "list": {
          const tight = node.listTight !== !1;
          let out = "", item = node.firstChild, idx = 0;
          while (item) {
            const marker = node.listType === "ordered" ? (node.listStart || 1) + idx + (node.listDelimiter || ".") + " " : (node.listBulletChar || "-") + " ", itemBody = renderItemContents(item, tight), prefix = " ".repeat(marker.length);
            let taskPrefix = "";
            if (item.checked === !0)
              taskPrefix = "[x] ";
            else if (item.checked === !1)
              taskPrefix = "[ ] ";
            out += marker + taskPrefix + indent(itemBody, prefix).replace(/\n$/, "") + `
`;
            if (!tight && item.next)
              out += `
`;
            idx++;
            item = item.next;
          }
          return out;
        }
        case "table":
          return renderTable(node);
        default:
          return "";
      }
    }
    function renderItemContents(item, tight) {
      let out = "", child = item.firstChild;
      while (child) {
        out += renderBlock(child, {});
        if (child.next)
          out += tight ? "" : `
`;
        child = child.next;
      }
      return out;
    }
    function renderTable(table) {
      const aligns = table.align || [], rows = [];
      let row = table.firstChild;
      while (row) {
        const cells = [];
        let cell = row.firstChild;
        while (cell) {
          cells.push(escapeTableCell(renderInlines(cell, !0)));
          cell = cell.next;
        }
        rows.push({ cells, isHeader: row.isHeader });
        row = row.next;
      }
      if (rows.length === 0)
        return "";
      const header = rows[0];
      let out = "| " + header.cells.join(" | ") + ` |
`;
      const delims = aligns.map((a) => {
        if (a === "left")
          return ":---";
        if (a === "right")
          return "---:";
        if (a === "center")
          return ":---:";
        return "---";
      });
      while (delims.length < header.cells.length)
        delims.push("---");
      out += "| " + delims.join(" | ") + ` |
`;
      for (let i = 1;i < rows.length; i++)
        out += "| " + rows[i].cells.join(" | ") + ` |
`;
      return out;
    }
    function renderMarkdown(root, opts) {
      if (!root || typeof root !== "object" || !root.type) {
        const gotType = root === null ? "null" : typeof root;
        throw new RenderError("md/render-invalid-root", "renderMarkdown: invalid AST root (expected document node, got " + gotType + ")", { context: { gotType } });
      }
      const ctx = Object.assign({}, opts || {});
      return renderBlock(root, ctx);
    }
    return { renderMarkdown };
  } });
    __register({ name: "md", dependencies: ["mdErrors","blockParser","inlineParser","inlineParserBuilder","renderHtmlMod","renderMarkdownMod","sanitize"], factory: function(errors, blockParserAPI, inlineParserAPI, inlineParserBuilder, renderHtmlAPI, renderMarkdownAPI, sanitizeAPI) {
    const { ContractError } = errors, sanitizeHtml = sanitizeAPI ? sanitizeAPI.sanitizeHtml : null, renderHtml = renderHtmlAPI.renderHtml, renderMarkdown = renderMarkdownAPI.renderMarkdown;
    function createMd(opts) {
      if (opts && Object.prototype.hasOwnProperty.call(opts, "allowlist"))
        try {
          console.warn("createMd: the `allowlist` option was removed \u2014 pass `sanitizeOpts.allowedTags` / `sanitizeOpts.allowedAttributes` instead.");
        } catch {}
      const bp = blockParserAPI, ip = typeof inlineParserBuilder === "function" ? inlineParserBuilder(opts || {}) : inlineParserAPI, extensions = [];
      function pickLimit(v, dflt) {
        if (v === 1 / 0)
          return 1 / 0;
        return typeof v === "number" && v >= 0 && Number.isFinite(v) ? v : dflt;
      }
      const maxDepth = pickLimit(opts && opts.maxDepth, 1000), maxNodes = pickLimit(opts && opts.maxNodes, 1e5), maxUrlLength = pickLimit(opts && opts.maxUrlLength, 8192);
      function enforceLimits(document) {
        let nodeCount = 0;
        const w = document.walker();
        let ev;
        while ((ev = w.next()) !== null) {
          if (!ev.entering)
            continue;
          nodeCount++;
          if (nodeCount > maxNodes)
            throw new ContractError("md/limit-exceeded", "md.parse: node count exceeded limit (" + maxNodes + ")", { context: { kind: "maxNodes", limit: maxNodes } });
          const node = ev.node;
          let d = 0;
          for (let p = node.parent;p; p = p.parent)
            d++;
          if (d > maxDepth)
            throw new ContractError("md/limit-exceeded", "md.parse: nesting depth exceeded limit (" + maxDepth + ")", { context: { kind: "maxDepth", limit: maxDepth, depth: d } });
          if (node.destination && node.destination.length > maxUrlLength)
            throw new ContractError("md/limit-exceeded", "md.parse: URL length exceeded limit (" + maxUrlLength + ")", { context: { kind: "maxUrlLength", limit: maxUrlLength, length: node.destination.length } });
        }
      }
      function parse(text) {
        if (typeof text !== "string")
          throw new ContractError("md/parse-not-string", "md.parse: expected a string, got " + typeof text, { context: { gotType: typeof text } });
        const { document, refmap } = bp.parse(text, { inlineParser: ip.parse });
        document.data = { refmap };
        if (maxDepth !== 1 / 0 || maxNodes !== 1 / 0 || maxUrlLength !== 1 / 0)
          enforceLimits(document);
        return document;
      }
      function render(ast, renderOpts) {
        const merged = Object.assign({}, opts || {}, renderOpts || {});
        let html = renderHtml(ast, merged);
        if (merged.sanitize && sanitizeHtml)
          html = sanitizeHtml(html, merged.sanitizeOpts || {});
        return html;
      }
      function renderHtmlFn(text, renderOpts) {
        return render(parse(text), renderOpts);
      }
      function renderMarkdownFn(astOrText, renderOpts) {
        const ast = typeof astOrText === "string" ? api.parse(astOrText) : astOrText;
        return renderMarkdown(ast, renderOpts);
      }
      function use(...exts) {
        for (const ext of exts) {
          if (!ext || typeof ext !== "object" || typeof ext.install !== "function")
            throw new ContractError("md/use-bad-extension", "md.use: extension must be { name, install(md) }");
          if (extensions.some((e) => e.name === ext.name))
            continue;
          extensions.push(ext);
          ext.install(api);
        }
        return api;
      }
      const api = {
        parse,
        render,
        renderHtml: renderHtmlFn,
        renderMarkdown: renderMarkdownFn,
        use,
        extensions
      };
      return api;
    }
    const md = createMd();
    md.createMd = createMd;
    md.ContractError = ContractError;
    return md;
  } });
    __register({ name: "mdShared", dependencies: [], factory: function() {
    function escapeHtml(s) {
      return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    }
    function unescapeHtml(s) {
      return String(s).replace(/&quot;/g, '"').replace(/&gt;/g, ">").replace(/&lt;/g, "<").replace(/&amp;/g, "&");
    }
    function escapeForRegex(s) {
      return String(s).replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
    }
    function createLocalWalker(BLOCK, INLINE) {
      const blockSet = BLOCK instanceof Set ? BLOCK : new Set(BLOCK || []), inlineSet = INLINE instanceof Set ? INLINE : new Set(INLINE || []);
      function isContainerType(type) {
        return blockSet.has(type) || inlineSet.has(type);
      }
      return class WalkerLocal {
        constructor(root) {
          this.current = root;
          this.root = root;
          this.entering = !0;
        }
        next() {
          const cur = this.current;
          if (cur === null)
            return null;
          const entering = this.entering, container = isContainerType(cur.type);
          if (entering && container)
            if (cur.firstChild) {
              this.current = cur.firstChild;
              this.entering = !0;
            } else
              this.entering = !1;
          else if (cur === this.root)
            this.current = null;
          else if (cur.next === null) {
            this.current = cur.parent;
            this.entering = !1;
          } else {
            this.current = cur.next;
            this.entering = !0;
          }
          return { entering, node: cur };
        }
      };
    }
    return { escapeHtml, escapeForRegex, unescapeHtml, createLocalWalker };
  } });
    __register({ name: "mdFrontmatter", dependencies: ["mdShared"], factory: function(mdShared) {
    const { escapeForRegex } = mdShared, FENCES = {
      "---": "yaml",
      "+++": "toml",
      ";;;": "json"
    };
    function stripFrontmatter(text) {
      if (typeof text !== "string" || text.length < 7)
        return { rest: text, frontmatter: null };
      let pos = 0;
      if (text.charCodeAt(0) === 65279)
        pos = 1;
      const head = text.substr(pos, 3), lang = FENCES[head];
      if (!lang)
        return { rest: text, frontmatter: null };
      const firstNl = text.indexOf(`
`, pos);
      if (firstNl < 0)
        return { rest: text, frontmatter: null };
      if (text.substring(pos, firstNl).trimEnd() !== head)
        return { rest: text, frontmatter: null };
      const re = new RegExp("\\n" + escapeForRegex(head) + "[ \\t]*(?:\\n|$)");
      re.lastIndex = firstNl;
      const m = re.exec(text.substring(firstNl));
      if (!m)
        return { rest: text, frontmatter: null };
      const closeStart = firstNl + m.index, closeEnd = firstNl + m.index + m[0].length, content = text.substring(firstNl + 1, closeStart);
      return { rest: text.substring(closeEnd), frontmatter: { lang, content } };
    }
    return {
      name: "mdFrontmatter",
      stripFrontmatter,
      install(md) {
        const originalParse = md.parse;
        md.parse = function(text) {
          const { rest, frontmatter } = stripFrontmatter(text), ast = originalParse.call(md, rest);
          ast.data = ast.data || {};
          ast.data.frontmatter = frontmatter;
          return ast;
        };
        md.renderHtml = function(textOrAst, renderOpts) {
          if (typeof textOrAst === "string")
            return md.render(md.parse(textOrAst), renderOpts);
          return md.render(textOrAst, renderOpts);
        };
      }
    };
  } });
    __register({ name: "mdAstWalker", dependencies: ["mdNode"], factory: function(nodeApi) {
    const { Walker } = nodeApi;
    function* walk(root) {
      const w = new Walker(root);
      let ev;
      while ((ev = w.next()) !== null)
        yield ev;
    }
    return { walk, Walker };
  } });
    __register({ name: "mdFootnotes", dependencies: ["mdNode","mdAstWalker","mdAstTypes","mdShared"], factory: function(mdNode, mdAstWalker, mdAstTypes, mdShared) {
    const { Node, trustedHtmlInline } = mdNode, { walk } = mdAstWalker, {
      T_TEXT,
      T_PARAGRAPH,
      T_FOOTNOTE_REF
    } = mdAstTypes, { escapeHtml } = mdShared, RE_DEF_HEAD = /^\[\^([^\]\s]+)\]:[ \t]?/, RE_REF = /\[\^([^\]\s]+)\]/g;
    function stripFootnoteDefs(text) {
      const defs = new Map;
      if (typeof text !== "string")
        return { rest: text, defs };
      const lines = text.split(`
`), out = [];
      let i = 0;
      while (i < lines.length) {
        const m = RE_DEF_HEAD.exec(lines[i]);
        if (m) {
          const id = m[1];
          let body = lines[i].substring(m[0].length);
          i++;
          while (i < lines.length) {
            const ln = lines[i];
            if (/^[ \t]+\S/.test(ln)) {
              body += `
` + ln.replace(/^[ \t]+/, "");
              i++;
            } else if (ln === "" && i + 1 < lines.length && /^[ \t]+\S/.test(lines[i + 1])) {
              body += `
`;
              i++;
            } else
              break;
          }
          defs.set(id, body);
          out.push("");
          continue;
        }
        out.push(lines[i]);
        i++;
      }
      return { rest: out.join(`
`), defs };
    }
    function paragraphRawText(para) {
      let s = "", c = para.firstChild;
      while (c) {
        if (c.type === T_TEXT)
          s += c.literal || "";
        else if (c.type === "softbreak" || c.type === "linebreak")
          s += `
`;
        else if (c.literal)
          s += c.literal;
        c = c.next;
      }
      return s;
    }
    function extractFootnoteDefs(doc) {
      const defs = new Map;
      if (!doc.firstChild)
        return defs;
      const toRemove = [];
      let cur = doc.firstChild;
      while (cur) {
        const next = cur.next;
        if (cur.type === T_PARAGRAPH) {
          const text = paragraphRawText(cur), m = RE_DEF_HEAD.exec(text);
          if (m) {
            const id = m[1], body = text.substring(m[0].length);
            defs.set(id, body);
            toRemove.push(cur);
          }
        }
        cur = next;
      }
      for (const n of toRemove)
        n.unlink();
      return defs;
    }
    function expandFootnoteRefs(root, defs) {
      const order = [], used = new Map;
      function assign(id) {
        if (!defs.has(id))
          return null;
        if (!used.has(id)) {
          used.set(id, order.length + 1);
          order.push(id);
        }
        return used.get(id);
      }
      const runs = [];
      for (const { node, entering } of walk(root)) {
        if (!entering || node.type !== T_TEXT)
          continue;
        if (node.prev && node.prev.type === T_TEXT)
          continue;
        let last = node, joined = node.literal || "";
        while (last.next && last.next.type === T_TEXT) {
          last = last.next;
          joined += last.literal || "";
        }
        if (joined.indexOf("[^") < 0)
          continue;
        runs.push({ first: node, last, joined });
      }
      for (const run of runs) {
        RE_REF.lastIndex = 0;
        let m, lastIdx = 0;
        const parts = [];
        while ((m = RE_REF.exec(run.joined)) !== null) {
          const id = m[1], num = assign(id);
          if (num === null)
            continue;
          if (m.index > lastIdx)
            parts.push({ kind: "text", value: run.joined.substring(lastIdx, m.index) });
          parts.push({ kind: "ref", id, num });
          lastIdx = m.index + m[0].length;
        }
        if (parts.length === 0)
          continue;
        if (lastIdx < run.joined.length)
          parts.push({ kind: "text", value: run.joined.substring(lastIdx) });
        const nodes = parts.map((p) => {
          if (p.kind === "text") {
            const n = new Node(T_TEXT);
            n.literal = p.value;
            return n;
          }
          const n = new Node(T_FOOTNOTE_REF);
          n.data = { id: p.id, num: p.num };
          return n;
        });
        run.first.insertBefore(nodes[0]);
        let prev = nodes[0];
        for (let k = 1;k < nodes.length; k++) {
          prev.insertAfter(nodes[k]);
          prev = nodes[k];
        }
        let cur = run.first;
        const end = run.last.next;
        while (cur && cur !== end) {
          const nx = cur.next;
          cur.unlink();
          cur = nx;
        }
      }
      return { order, used };
    }
    function renderFootnotesHtml(html, order, defs) {
      if (order.length === 0)
        return html;
      let out = html;
      out += `<section class="footnotes">
<ol>
`;
      for (let i = 0;i < order.length; i++) {
        const id = order[i], body = defs.get(id) || "";
        out += '<li id="fn-' + escapeHtml(id) + '">';
        out += "<p>" + escapeHtml(body) + " ";
        out += '<a href="#fnref-' + escapeHtml(id) + '" class="footnote-back">&#8617;</a>';
        out += `</p></li>
`;
      }
      out += `</ol>
</section>
`;
      return out;
    }
    function lowerFootnoteRefs(root) {
      const refs = [];
      for (const { node, entering } of walk(root)) {
        if (!entering)
          continue;
        if (node.type === T_FOOTNOTE_REF)
          refs.push(node);
      }
      for (const r of refs) {
        const id = r.data && r.data.id, num = r.data && r.data.num, inline = trustedHtmlInline('<sup class="footnote-ref"><a href="#fn-' + escapeHtml(id) + '" id="fnref-' + escapeHtml(id) + '">' + num + "</a></sup>");
        r.insertBefore(inline);
        r.unlink();
      }
    }
    return {
      name: "mdFootnotes",
      stripFootnoteDefs,
      extractFootnoteDefs,
      expandFootnoteRefs,
      renderFootnotesHtml,
      lowerFootnoteRefs,
      install(md) {
        const { parse: originalParse, render: originalRender } = md;
        md.parse = function(text) {
          const { rest, defs } = stripFootnoteDefs(text), ast = originalParse.call(md, rest), { order } = expandFootnoteRefs(ast, defs);
          ast.data = ast.data || {};
          ast.data.footnotes = { defs, order };
          return ast;
        };
        md.render = function(ast, renderOpts) {
          lowerFootnoteRefs(ast);
          let html = originalRender.call(md, ast, renderOpts);
          const fn = ast.data && ast.data.footnotes;
          if (fn)
            html = renderFootnotesHtml(html, fn.order, fn.defs);
          return html;
        };
        md.renderHtml = function(textOrAst, renderOpts) {
          if (typeof textOrAst === "string")
            return md.render(md.parse(textOrAst), renderOpts);
          return md.render(textOrAst, renderOpts);
        };
      }
    };
  } });
    __register({ name: "mdMath", dependencies: ["mdNode","mdAstWalker","mdAstTypes","mdShared"], factory: function(mdNode, mdAstWalker, mdAstTypes, mdShared) {
    const { Node, trustedHtmlInline, trustedHtmlBlock } = mdNode, { walk } = mdAstWalker, {
      T_TEXT,
      T_CODE_BLOCK,
      T_MATH_INLINE,
      T_MATH_BLOCK
    } = mdAstTypes, { escapeHtml } = mdShared;
    function splitMath(lit) {
      if (!lit || lit.indexOf("$") < 0)
        return null;
      const parts = [];
      let i = 0;
      while (i < lit.length) {
        const dollar = lit.indexOf("$", i);
        if (dollar < 0) {
          if (i < lit.length)
            parts.push({ kind: "text", value: lit.substring(i) });
          break;
        }
        if (dollar > i)
          parts.push({ kind: "text", value: lit.substring(i, dollar) });
        if (lit.substr(dollar, 2) === "$$") {
          const end = lit.indexOf("$$", dollar + 2);
          if (end > 0) {
            parts.push({ kind: "math_block", value: lit.substring(dollar + 2, end) });
            i = end + 2;
            continue;
          }
        }
        let j = dollar + 1, found = -1;
        while (j < lit.length) {
          const c = lit.charCodeAt(j);
          if (c === 10)
            break;
          if (c === 92) {
            j += 2;
            continue;
          }
          if (c === 36) {
            found = j;
            break;
          }
          j++;
        }
        if (found > dollar + 1) {
          parts.push({ kind: "math_inline", value: lit.substring(dollar + 1, found) });
          i = found + 1;
          continue;
        }
        parts.push({ kind: "text", value: lit.substring(dollar) });
        i = lit.length;
      }
      if (parts.length === 0)
        return null;
      if (parts.every((p) => p.kind === "text"))
        return null;
      return parts;
    }
    function collectTextRuns(root) {
      const runs = [];
      for (const { node, entering } of walk(root)) {
        if (!entering)
          continue;
        if (node.type !== T_TEXT)
          continue;
        if (node.prev && node.prev.type === T_TEXT)
          continue;
        let last = node, joined = node.literal || "";
        while (last.next && last.next.type === T_TEXT) {
          last = last.next;
          joined += last.literal || "";
        }
        if (joined.indexOf("$") >= 0)
          runs.push({ first: node, last, joined });
      }
      return runs;
    }
    function expandMathInAst(root) {
      const codeReplacements = [];
      for (const { node, entering } of walk(root)) {
        if (!entering)
          continue;
        if (node.type === T_CODE_BLOCK) {
          if ((node.info || "").split(/\s+/)[0] === "math")
            codeReplacements.push(node);
        }
      }
      const runs = collectTextRuns(root);
      for (const run of runs) {
        const parts = splitMath(run.joined);
        if (!parts)
          continue;
        const nodes = parts.map((p) => {
          const n = p.kind === "text" ? new Node(T_TEXT) : new Node(p.kind === "math_block" ? T_MATH_BLOCK : T_MATH_INLINE);
          n.literal = p.value;
          return n;
        });
        run.first.insertBefore(nodes[0]);
        let prev = nodes[0];
        for (let k = 1;k < nodes.length; k++) {
          prev.insertAfter(nodes[k]);
          prev = nodes[k];
        }
        let cur = run.first;
        const end = run.last.next;
        while (cur && cur !== end) {
          const nx = cur.next;
          cur.unlink();
          cur = nx;
        }
      }
      for (const cb of codeReplacements) {
        const mb = new Node(T_MATH_BLOCK);
        mb.literal = cb.literal || "";
        cb.insertBefore(mb);
        cb.unlink();
      }
      return root;
    }
    function renderMathHtml(value, display) {
      if (display)
        return '<div class="math display">' + escapeHtml(value) + "</div>";
      return '<span class="math inline">' + escapeHtml(value) + "</span>";
    }
    function lowerMathToHtml(root) {
      const toRewrite = [];
      for (const { node, entering } of walk(root)) {
        if (!entering)
          continue;
        if (node.type === T_MATH_INLINE || node.type === T_MATH_BLOCK)
          toRewrite.push(node);
      }
      for (const node of toRewrite) {
        const display = node.type === T_MATH_BLOCK, html = renderMathHtml(node.literal || "", display), replacement = display ? trustedHtmlBlock(html) : trustedHtmlInline(html);
        node.insertBefore(replacement);
        node.unlink();
      }
      return root;
    }
    return {
      name: "mdMath",
      splitMath,
      expandMathInAst,
      lowerMathToHtml,
      install(md) {
        const { parse: originalParse, render: originalRender } = md;
        md.parse = function(text) {
          const ast = originalParse.call(md, text);
          expandMathInAst(ast);
          return ast;
        };
        md.render = function(ast, renderOpts) {
          lowerMathToHtml(ast);
          return originalRender.call(md, ast, renderOpts);
        };
        md.renderHtml = function(textOrAst, renderOpts) {
          if (typeof textOrAst === "string")
            return md.render(md.parse(textOrAst), renderOpts);
          return md.render(textOrAst, renderOpts);
        };
      }
    };
  } });
    __register({ name: "mdSubsuper", dependencies: ["mdNode","mdAstWalker","mdAstTypes"], factory: function(mdNode, mdAstWalker, mdAstTypes) {
    const { Node, trustedHtmlInline } = mdNode, { walk } = mdAstWalker, { T_TEXT, T_LINK, T_STRIKETHROUGH, T_SUBSCRIPT, T_SUPERSCRIPT } = mdAstTypes, RE_SUP = /\^([^\s^]+)\^/g;
    function textOf(node) {
      let out = "";
      for (const { node: n, entering } of walk(node)) {
        if (!entering || n === node)
          continue;
        if (n.type === "softbreak" || n.type === "linebreak")
          out += `
`;
        else if (typeof n.literal === "string")
          out += n.literal;
      }
      return out;
    }
    function decodeDestination(dest) {
      try {
        return decodeURI(dest);
      } catch {
        return dest;
      }
    }
    function inAutolink(node) {
      let p = node.parent;
      while (p && p.type !== T_LINK)
        p = p.parent;
      if (!p || typeof p.destination !== "string")
        return !1;
      const text = textOf(p), dests = [p.destination, decodeDestination(p.destination)];
      for (const d of dests)
        if (d === text || d === "mailto:" + text || d === "http://" + text)
          return !0;
      return !1;
    }
    function isCaretNode(node) {
      return node.type === T_TEXT && node.literal === "^";
    }
    function isRunText(node) {
      return !!node && node.type === T_TEXT && !isCaretNode(node);
    }
    function expandSubSupInAst(root) {
      const strikes = [];
      for (const { node, entering } of walk(root))
        if (entering && node.type === T_STRIKETHROUGH && node.delimiterCount === 1)
          strikes.push(node);
      for (const s of strikes)
        if (!/\s/.test(textOf(s)))
          s.type = T_SUBSCRIPT;
      const runs = [];
      for (const { node, entering } of walk(root)) {
        if (!entering || !isRunText(node))
          continue;
        if (isRunText(node.prev))
          continue;
        let last = node, joined = node.literal || "";
        while (isRunText(last.next)) {
          last = last.next;
          joined += last.literal || "";
        }
        if (joined.indexOf("^") < 0)
          continue;
        if (inAutolink(node))
          continue;
        runs.push({ first: node, last, joined });
      }
      for (const run of runs) {
        RE_SUP.lastIndex = 0;
        const parts = [];
        let lastIdx = 0, m;
        while ((m = RE_SUP.exec(run.joined)) !== null) {
          if (m.index > lastIdx)
            parts.push({ kind: "text", value: run.joined.substring(lastIdx, m.index) });
          parts.push({ kind: "sup", body: m[1] });
          lastIdx = m.index + m[0].length;
        }
        if (parts.length === 0)
          continue;
        if (lastIdx < run.joined.length)
          parts.push({ kind: "text", value: run.joined.substring(lastIdx) });
        const nodes = parts.map((p) => {
          if (p.kind === "text") {
            const n = new Node(T_TEXT);
            n.literal = p.value;
            return n;
          }
          const sup = new Node(T_SUPERSCRIPT), t = new Node(T_TEXT);
          t.literal = p.body;
          sup.appendChild(t);
          return sup;
        });
        run.first.insertBefore(nodes[0]);
        let prev = nodes[0];
        for (let k = 1;k < nodes.length; k++) {
          prev.insertAfter(nodes[k]);
          prev = nodes[k];
        }
        let cur = run.first;
        const end = run.last.next;
        while (cur && cur !== end) {
          const nx = cur.next;
          cur.unlink();
          cur = nx;
        }
      }
    }
    function lowerSubSupToHtml(root) {
      const nodes = [];
      for (const { node, entering } of walk(root)) {
        if (!entering)
          continue;
        if (node.type === T_SUBSCRIPT || node.type === T_SUPERSCRIPT)
          nodes.push(node);
      }
      for (const n of nodes) {
        const tag = n.type === T_SUBSCRIPT ? "sub" : "sup", open = trustedHtmlInline("<" + tag + ">"), close = trustedHtmlInline("</" + tag + ">");
        n.insertBefore(open);
        let c = n.firstChild, anchor = open;
        while (c) {
          const nx = c.next;
          c.unlink();
          anchor.insertAfter(c);
          anchor = c;
          c = nx;
        }
        anchor.insertAfter(close);
        n.unlink();
      }
    }
    return {
      name: "mdSubsuper",
      expandSubSupInAst,
      lowerSubSupToHtml,
      install(md) {
        const { parse: originalParse, render: originalRender } = md;
        md.parse = function(text) {
          const ast = originalParse.call(md, text);
          expandSubSupInAst(ast);
          return ast;
        };
        md.render = function(ast, renderOpts) {
          lowerSubSupToHtml(ast);
          return originalRender.call(md, ast, renderOpts);
        };
        md.renderHtml = function(textOrAst, renderOpts) {
          if (typeof textOrAst === "string")
            return md.render(md.parse(textOrAst), renderOpts);
          return md.render(textOrAst, renderOpts);
        };
      }
    };
  } });
    __register({ name: "mdHighlight", dependencies: ["mdNode","mdAstWalker","mdAstTypes"], factory: function(mdNode, mdAstWalker, mdAstTypes) {
    const { Node, trustedHtmlInline } = mdNode, { walk } = mdAstWalker, { T_TEXT, T_HIGHLIGHT } = mdAstTypes, RE_MARK = /==([^=\n][^\n]*?)==/g;
    function expandHighlightInAst(root) {
      const runs = [];
      for (const { node, entering } of walk(root)) {
        if (!entering || node.type !== T_TEXT)
          continue;
        if (node.prev && node.prev.type === T_TEXT)
          continue;
        let last = node, joined = node.literal || "";
        while (last.next && last.next.type === T_TEXT) {
          last = last.next;
          joined += last.literal || "";
        }
        if (joined.indexOf("==") < 0)
          continue;
        runs.push({ first: node, last, joined });
      }
      for (const run of runs) {
        RE_MARK.lastIndex = 0;
        const parts = [];
        let lastIdx = 0, m;
        while ((m = RE_MARK.exec(run.joined)) !== null) {
          if (m.index > lastIdx)
            parts.push({ kind: "text", value: run.joined.substring(lastIdx, m.index) });
          parts.push({ kind: "mark", value: m[1] });
          lastIdx = m.index + m[0].length;
        }
        if (parts.length === 0)
          continue;
        if (lastIdx < run.joined.length)
          parts.push({ kind: "text", value: run.joined.substring(lastIdx) });
        const nodes = parts.map((p) => {
          if (p.kind === "text") {
            const n = new Node(T_TEXT);
            n.literal = p.value;
            return n;
          }
          const hl = new Node(T_HIGHLIGHT), t = new Node(T_TEXT);
          t.literal = p.value;
          hl.appendChild(t);
          return hl;
        });
        run.first.insertBefore(nodes[0]);
        let prev = nodes[0];
        for (let k = 1;k < nodes.length; k++) {
          prev.insertAfter(nodes[k]);
          prev = nodes[k];
        }
        let cur = run.first;
        const end = run.last.next;
        while (cur && cur !== end) {
          const nx = cur.next;
          cur.unlink();
          cur = nx;
        }
      }
    }
    function lowerHighlightToHtml(root) {
      const marks = [];
      for (const { node, entering } of walk(root)) {
        if (!entering)
          continue;
        if (node.type === T_HIGHLIGHT)
          marks.push(node);
      }
      for (const mk of marks) {
        const open = trustedHtmlInline("<mark>"), close = trustedHtmlInline("</mark>");
        mk.insertBefore(open);
        let c = mk.firstChild, anchor = open;
        while (c) {
          const nx = c.next;
          c.unlink();
          anchor.insertAfter(c);
          anchor = c;
          c = nx;
        }
        anchor.insertAfter(close);
        mk.unlink();
      }
    }
    return {
      name: "mdHighlight",
      expandHighlightInAst,
      lowerHighlightToHtml,
      install(md) {
        const { parse: originalParse, render: originalRender } = md;
        md.parse = function(text) {
          const ast = originalParse.call(md, text);
          expandHighlightInAst(ast);
          return ast;
        };
        md.render = function(ast, renderOpts) {
          lowerHighlightToHtml(ast);
          return originalRender.call(md, ast, renderOpts);
        };
        md.renderHtml = function(textOrAst, renderOpts) {
          if (typeof textOrAst === "string")
            return md.render(md.parse(textOrAst), renderOpts);
          return md.render(textOrAst, renderOpts);
        };
      }
    };
  } });
    __register({ name: "mdEmoji", dependencies: ["mdNode","mdAstWalker","mdAstTypes"], factory: function(mdNode, mdAstWalker, mdAstTypes) {
    const { Node } = mdNode, { walk } = mdAstWalker, { T_TEXT } = mdAstTypes, DEFAULT_EMOJI_TABLE = {
      smile: "\uD83D\uDE04",
      smiley: "\uD83D\uDE00",
      grin: "\uD83D\uDE01",
      laughing: "\uD83D\uDE06",
      wink: "\uD83D\uDE09",
      blush: "\uD83D\uDE0A",
      heart_eyes: "\uD83D\uDE0D",
      sunglasses: "\uD83D\uDE0E",
      thinking: "\uD83E\uDD14",
      neutral_face: "\uD83D\uDE10",
      confused: "\uD83D\uDE15",
      cry: "\uD83D\uDE22",
      sob: "\uD83D\uDE2D",
      rage: "\uD83D\uDE21",
      heart: "\u2764\uFE0F",
      broken_heart: "\uD83D\uDC94",
      sparkles: "\u2728",
      star: "\u2B50",
      star2: "\uD83C\uDF1F",
      fire: "\uD83D\uDD25",
      boom: "\uD83D\uDCA5",
      tada: "\uD83C\uDF89",
      confetti_ball: "\uD83C\uDF8A",
      rocket: "\uD83D\uDE80",
      zap: "\u26A1",
      sunny: "\u2600\uFE0F",
      umbrella: "\u2602\uFE0F",
      snowflake: "\u2744\uFE0F",
      cloud: "\u2601\uFE0F",
      thumbsup: "\uD83D\uDC4D",
      "+1": "\uD83D\uDC4D",
      thumbsdown: "\uD83D\uDC4E",
      "-1": "\uD83D\uDC4E",
      clap: "\uD83D\uDC4F",
      wave: "\uD83D\uDC4B",
      muscle: "\uD83D\uDCAA",
      pray: "\uD83D\uDE4F",
      eyes: "\uD83D\uDC40",
      brain: "\uD83E\uDDE0",
      skull: "\uD83D\uDC80",
      coffee: "\u2615",
      tea: "\uD83C\uDF75",
      beer: "\uD83C\uDF7A",
      pizza: "\uD83C\uDF55",
      apple: "\uD83C\uDF4E",
      banana: "\uD83C\uDF4C",
      cake: "\uD83C\uDF70",
      dog: "\uD83D\uDC36",
      cat: "\uD83D\uDC31",
      mouse: "\uD83D\uDC2D",
      rabbit: "\uD83D\uDC30",
      bear: "\uD83D\uDC3B",
      fox_face: "\uD83E\uDD8A",
      unicorn: "\uD83E\uDD84",
      dragon: "\uD83D\uDC09",
      earth_africa: "\uD83C\uDF0D",
      earth_americas: "\uD83C\uDF0E",
      earth_asia: "\uD83C\uDF0F",
      moon: "\uD83C\uDF19",
      sun_with_face: "\uD83C\uDF1E",
      check: "\u2705",
      x: "\u274C",
      warning: "\u26A0\uFE0F",
      white_check_mark: "\u2705",
      bug: "\uD83D\uDC1B",
      wrench: "\uD83D\uDD27",
      hammer: "\uD83D\uDD28",
      gear: "\u2699\uFE0F",
      book: "\uD83D\uDCD6",
      books: "\uD83D\uDCDA",
      memo: "\uD83D\uDCDD",
      pencil: "\u270F\uFE0F",
      bulb: "\uD83D\uDCA1",
      mag: "\uD83D\uDD0D",
      lock: "\uD83D\uDD12",
      unlock: "\uD83D\uDD13",
      key: "\uD83D\uDD11"
    }, RE_SHORTCODE = /:([a-z0-9_+-]+):/gi, DEFAULT_EMOJI_MAP = new Map(Object.entries(DEFAULT_EMOJI_TABLE));
    function toLookupMap(table) {
      return table instanceof Map ? table : new Map(Object.entries(table));
    }
    function expandEmojiInAst(root, table) {
      const lookup = toLookupMap(table), runs = [];
      for (const { node, entering } of walk(root)) {
        if (!entering || node.type !== T_TEXT)
          continue;
        if (node.prev && node.prev.type === T_TEXT)
          continue;
        let last = node, joined = node.literal || "";
        while (last.next && last.next.type === T_TEXT) {
          last = last.next;
          joined += last.literal || "";
        }
        if (joined.indexOf(":") < 0)
          continue;
        runs.push({ first: node, last, joined });
      }
      for (const run of runs) {
        const lit = run.joined;
        RE_SHORTCODE.lastIndex = 0;
        const parts = [];
        let last = 0, replaced = !1, m;
        while ((m = RE_SHORTCODE.exec(lit)) !== null) {
          const replacement = lookup.get(m[1].toLowerCase());
          if (replacement === void 0)
            continue;
          if (m.index > last)
            parts.push(lit.substring(last, m.index));
          parts.push(replacement);
          last = m.index + m[0].length;
          replaced = !0;
        }
        RE_SHORTCODE.lastIndex = 0;
        if (!replaced)
          continue;
        if (last < lit.length)
          parts.push(lit.substring(last));
        for (const value of parts) {
          const n = new Node(T_TEXT);
          n.literal = value;
          run.first.insertBefore(n);
        }
        let cur = run.first;
        const end = run.last.next;
        while (cur && cur !== end) {
          const nx = cur.next;
          cur.unlink();
          cur = nx;
        }
      }
      return root;
    }
    return {
      name: "mdEmoji",
      DEFAULT_EMOJI_TABLE,
      expandEmojiInAst,
      install(md, opts) {
        const custom = opts && opts.table || {}, lookup = Object.keys(custom).length === 0 ? DEFAULT_EMOJI_MAP : new Map([...DEFAULT_EMOJI_MAP, ...Object.entries(custom)]), originalParse = md.parse;
        md.parse = function(text) {
          const ast = originalParse.call(md, text);
          expandEmojiInAst(ast, lookup);
          return ast;
        };
        md.renderHtml = function(textOrAst, renderOpts) {
          if (typeof textOrAst === "string")
            return md.render(md.parse(textOrAst), renderOpts);
          return md.render(textOrAst, renderOpts);
        };
      }
    };
  } });
    __register({ name: "mdToc", dependencies: ["mdAstWalker","mdAstTypes"], factory: function(mdAstWalker, mdAstTypes) {
    const { walk } = mdAstWalker, { T_HEADING, T_PARAGRAPH, T_TEXT, T_SOFTBREAK, T_LINEBREAK } = mdAstTypes;
    function slugify(s) {
      return String(s).trim().toLowerCase().replace(/[^\w\s-]/g, "").replace(/\s+/g, "-").replace(/^-+|-+$/g, "");
    }
    function headingText(h) {
      let s = "";
      for (const { node, entering } of walk(h)) {
        if (!entering || node === h)
          continue;
        if (node.type === T_SOFTBREAK || node.type === T_LINEBREAK)
          s += " ";
        else if (node.literal)
          s += node.literal;
      }
      return s;
    }
    function escapeLinkText(s) {
      return String(s).replace(/([\\`*_[\]<>~&!])/g, "\\$1");
    }
    function collectHeadings(ast, opts) {
      const min = opts && opts.minLevel || 1, max = opts && opts.maxLevel || 6, out = [], slugCount = new Map;
      for (const { node, entering } of walk(ast)) {
        if (!entering || node.type !== T_HEADING)
          continue;
        const lvl = node.level;
        if (lvl < min || lvl > max)
          continue;
        const txt = headingText(node);
        let slug = slugify(txt);
        if (!slug)
          slug = "section";
        const n = slugCount.get(slug) || 0;
        slugCount.set(slug, n + 1);
        if (n > 0)
          slug = slug + "-" + n;
        out.push({ level: lvl, text: txt, slug });
      }
      return out;
    }
    function generate(ast, opts) {
      const headings = collectHeadings(ast, opts);
      if (headings.length === 0)
        return "";
      const baseLevel = headings.reduce((m, h) => Math.min(m, h.level), 6), lines = [];
      for (const h of headings) {
        const indent = "  ".repeat(Math.max(0, h.level - baseLevel));
        lines.push(indent + "- [" + escapeLinkText(h.text) + "](#" + h.slug + ")");
      }
      return lines.join(`
`);
    }
    function replaceTocPlaceholders(doc, parser, opts) {
      const targets = [];
      let cur = doc.firstChild;
      while (cur) {
        if (cur.type === T_PARAGRAPH) {
          let s = "", ok = !0, c = cur.firstChild;
          while (c) {
            if (c.type === T_TEXT || c.type === "code" || c.type === "html_inline")
              s += c.literal || "";
            else if (c.type === "softbreak" || c.type === "linebreak")
              s += `
`;
            else {
              ok = !1;
              break;
            }
            c = c.next;
          }
          if (ok && s.trim() === "[[TOC]]")
            targets.push(cur);
        }
        cur = cur.next;
      }
      if (targets.length === 0)
        return;
      const tocText = generate(doc, opts);
      if (!tocText) {
        for (const t of targets)
          t.unlink();
        return;
      }
      for (const t of targets) {
        let c = parser(tocText).firstChild;
        while (c) {
          const nx = c.next;
          c.unlink();
          t.insertBefore(c);
          c = nx;
        }
        t.unlink();
      }
    }
    return {
      name: "mdToc",
      generate,
      collectHeadings,
      slugify,
      replaceTocPlaceholders,
      install(md, opts) {
        const originalParse = md.parse;
        md.parse = function(text) {
          const ast = originalParse.call(md, text);
          replaceTocPlaceholders(ast, (s) => originalParse.call(md, s), opts);
          return ast;
        };
        md.renderHtml = function(textOrAst, renderOpts) {
          if (typeof textOrAst === "string")
            return md.render(md.parse(textOrAst), renderOpts);
          return md.render(textOrAst, renderOpts);
        };
      }
    };
  } });
    __register({ name: "mdWikilinks", dependencies: ["mdNode","mdAstWalker","mdAstTypes"], factory: function(mdNode, mdAstWalker, mdAstTypes) {
    const { Node } = mdNode, { walk } = mdAstWalker, { T_TEXT, T_LINK } = mdAstTypes, RE_WIKI = /\[\[([^[\]\n|#]+)(?:#([^[\]\n|]+))?(?:\|([^[\]\n]+))?\]\]/g;
    function defaultSlugify(s) {
      return String(s).trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    }
    function expandWikilinksInAst(root, slugify) {
      const runs = [];
      for (const { node, entering } of walk(root)) {
        if (!entering || node.type !== T_TEXT)
          continue;
        if (node.prev && node.prev.type === T_TEXT)
          continue;
        let last = node, joined = node.literal || "";
        while (last.next && last.next.type === T_TEXT) {
          last = last.next;
          joined += last.literal || "";
        }
        if (joined.indexOf("[[") < 0)
          continue;
        runs.push({ first: node, last, joined });
      }
      for (const run of runs) {
        RE_WIKI.lastIndex = 0;
        const parts = [];
        let lastIdx = 0, m;
        while ((m = RE_WIKI.exec(run.joined)) !== null) {
          if (m.index > lastIdx)
            parts.push({ kind: "text", value: run.joined.substring(lastIdx, m.index) });
          const page = m[1].trim(), anchor = m[2] ? m[2].trim() : "", alias = m[3] ? m[3].trim() : "", dest = slugify(page) + (anchor ? "#" + slugify(anchor) : ""), display = alias || (anchor ? page + " \xA7 " + anchor : page);
          parts.push({ kind: "link", dest, title: page, display });
          lastIdx = m.index + m[0].length;
        }
        if (parts.length === 0)
          continue;
        if (lastIdx < run.joined.length)
          parts.push({ kind: "text", value: run.joined.substring(lastIdx) });
        const nodes = parts.map((p) => {
          if (p.kind === "text") {
            const n = new Node(T_TEXT);
            n.literal = p.value;
            return n;
          }
          const link = new Node(T_LINK);
          link.destination = p.dest;
          link.title = p.title;
          const txt = new Node(T_TEXT);
          txt.literal = p.display;
          link.appendChild(txt);
          return link;
        });
        run.first.insertBefore(nodes[0]);
        let prev = nodes[0];
        for (let k = 1;k < nodes.length; k++) {
          prev.insertAfter(nodes[k]);
          prev = nodes[k];
        }
        let cur = run.first;
        const end = run.last.next;
        while (cur && cur !== end) {
          const nx = cur.next;
          cur.unlink();
          cur = nx;
        }
      }
      return root;
    }
    return {
      name: "mdWikilinks",
      defaultSlugify,
      expandWikilinksInAst,
      install(md, opts) {
        const slugify = opts && opts.slugify || defaultSlugify, originalParse = md.parse;
        md.parse = function(text) {
          const ast = originalParse.call(md, text);
          expandWikilinksInAst(ast, slugify);
          return ast;
        };
        md.renderHtml = function(textOrAst, renderOpts) {
          if (typeof textOrAst === "string")
            return md.render(md.parse(textOrAst), renderOpts);
          return md.render(textOrAst, renderOpts);
        };
      }
    };
  } });
    __register({ name: "mdAdmonitions", dependencies: ["mdNode","mdAstWalker","mdAstTypes","mdShared"], factory: function(mdNode, mdAstWalker, mdAstTypes, mdShared) {
    const { Node, trustedHtmlBlock } = mdNode, { walk } = mdAstWalker, {
      T_BLOCK_QUOTE,
      T_PARAGRAPH,
      T_TEXT,
      T_ADMONITION
    } = mdAstTypes, { escapeHtml } = mdShared, VALID_KINDS = new Set(["note", "warning", "tip", "caution", "important", "danger", "info"]), RE_MKDOCS_HEAD = /^!!![ \t]+([a-zA-Z]+)(?:[ \t]+"([^"]*)")?[ \t]*$/;
    function preprocessMkdocsAdmonitions(text) {
      if (typeof text !== "string" || text.indexOf("!!!") < 0)
        return text;
      const lines = text.split(`
`), out = [];
      let i = 0;
      while (i < lines.length) {
        const m = RE_MKDOCS_HEAD.exec(lines[i]);
        if (!m) {
          out.push(lines[i]);
          i++;
          continue;
        }
        const kind = m[1].toLowerCase(), title = m[2] || "";
        if (!VALID_KINDS.has(kind)) {
          out.push(lines[i]);
          i++;
          continue;
        }
        i++;
        const body = [];
        while (i < lines.length) {
          const ln = lines[i];
          if (ln === "") {
            if (i + 1 < lines.length && /^(?: {4}|\t)/.test(lines[i + 1])) {
              body.push("");
              i++;
              continue;
            }
            break;
          }
          if (/^(?: {4}|\t)/.test(ln)) {
            body.push(ln.replace(/^(?: {4}|\t)/, ""));
            i++;
          } else
            break;
        }
        out.push("> [!" + kind.toUpperCase() + (title ? ":" + title : "") + "]");
        for (const b of body)
          out.push("> " + b);
        out.push("");
      }
      return out.join(`
`);
    }
    function expandAdmonitionsInAst(root) {
      const toConvert = [];
      for (const { node, entering } of walk(root)) {
        if (!entering || node.type !== T_BLOCK_QUOTE)
          continue;
        const first = node.firstChild;
        if (!first || first.type !== T_PARAGRAPH)
          continue;
        let head = "", last = null, c = first.firstChild;
        while (c && c.type === T_TEXT) {
          head += c.literal || "";
          last = c;
          c = c.next;
        }
        const m = /^\[!([A-Za-z]+)(?::([^\]]*))?\]\s*$/.exec(head);
        if (!m)
          continue;
        const kind = m[1].toLowerCase();
        if (!VALID_KINDS.has(kind))
          continue;
        const title = m[2] || "";
        toConvert.push({ node, kind, title, lastMarkerText: last });
      }
      for (const { node, kind, title, lastMarkerText } of toConvert) {
        const adm = new Node(T_ADMONITION);
        adm.data = { kind, title };
        const para = node.firstChild;
        let c = para.firstChild;
        const stop = lastMarkerText && lastMarkerText.next;
        while (c && c !== stop) {
          const nx = c.next;
          c.unlink();
          c = nx;
        }
        if (para.firstChild && (para.firstChild.type === "softbreak" || para.firstChild.type === "linebreak"))
          para.firstChild.unlink();
        if (!para.firstChild)
          para.unlink();
        let q = node.firstChild;
        while (q) {
          const nx = q.next;
          adm.appendChild(q);
          q = nx;
        }
        node.insertBefore(adm);
        node.unlink();
      }
      return root;
    }
    function lowerAdmonitionsToHtml(root) {
      const adms = [];
      for (const { node, entering } of walk(root)) {
        if (!entering)
          continue;
        if (node.type === T_ADMONITION)
          adms.push(node);
      }
      for (const adm of adms) {
        const kind = adm.data && adm.data.kind || "note", title = adm.data && adm.data.title || kind.charAt(0).toUpperCase() + kind.slice(1), opener = trustedHtmlBlock('<div class="admonition admonition-' + escapeHtml(kind) + `">
<p class="admonition-title">` + escapeHtml(title) + "</p>"), closer = trustedHtmlBlock("</div>");
        adm.insertBefore(opener);
        let anchor = opener, c = adm.firstChild;
        while (c) {
          const nx = c.next;
          c.unlink();
          anchor.insertAfter(c);
          anchor = c;
          c = nx;
        }
        anchor.insertAfter(closer);
        adm.unlink();
      }
      return root;
    }
    return {
      name: "mdAdmonitions",
      preprocessMkdocsAdmonitions,
      expandAdmonitionsInAst,
      lowerAdmonitionsToHtml,
      install(md) {
        const { parse: originalParse, render: originalRender } = md;
        md.parse = function(text) {
          const pre = preprocessMkdocsAdmonitions(text), ast = originalParse.call(md, pre);
          expandAdmonitionsInAst(ast);
          return ast;
        };
        md.render = function(ast, renderOpts) {
          lowerAdmonitionsToHtml(ast);
          return originalRender.call(md, ast, renderOpts);
        };
        md.renderHtml = function(textOrAst, renderOpts) {
          if (typeof textOrAst === "string")
            return md.render(md.parse(textOrAst), renderOpts);
          return md.render(textOrAst, renderOpts);
        };
      }
    };
  } });
    __register({ name: "mdMermaid", dependencies: ["mdShared"], factory: function(_mdShared) {
    const RE = /<pre><code class="language-mermaid">([\s\S]*?)<\/code><\/pre>/g;
    function rewriteMermaidHtml(html) {
      return html.replace(RE, (_, body) => {
        return '<div class="mermaid">' + body + "</div>";
      });
    }
    return {
      name: "mdMermaid",
      rewriteMermaidHtml,
      install(md) {
        const originalRender = md.render;
        md.render = function(ast, renderOpts) {
          const out = originalRender.call(md, ast, renderOpts);
          return rewriteMermaidHtml(out);
        };
        md.renderHtml = function(textOrAst, renderOpts) {
          if (typeof textOrAst === "string")
            return md.render(md.parse(textOrAst), renderOpts);
          return md.render(textOrAst, renderOpts);
        };
      }
    };
  } });

    const __core = __resolve("md");
    __core.use(__resolve("mdFrontmatter"), __resolve("mdFootnotes"), __resolve("mdMath"), __resolve("mdSubsuper"), __resolve("mdHighlight"), __resolve("mdEmoji"), __resolve("mdToc"), __resolve("mdWikilinks"), __resolve("mdAdmonitions"), __resolve("mdMermaid"));
    return __core;
    }
};
