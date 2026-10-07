/*!
 * Copyright (c) 2026 AwaCloud SAS
 * Author: Matthieu Bouilloux
 * SPDX-License-Identifier: AGPL-3.0-only
 * Dual-licensed; see the NOTICE file for licensing and any additional terms.
 */
/* GENERATED — do not edit. Source: packages/front/office/md/tools/generate-bundles.mjs */

/**
 * @fileoverview `@awacloud/md/bundles/prebuilt/md-full-package` — pre-built single-factory bundle.
 *
 * Variant **package** : declares the 4 fw modules as dependencies and inlines every
 * md-local factory transitively reachable from `md` plus 10 extras.
 *
 * @module md/bundles/prebuilt/md-full-package
 */

export const mdFullPackage = {
    name: "mdFullPackage",
    dependencies: ["secPolicy","sanitize","htmlEntities","url"],
    factory(secPolicy, sanitize, htmlEntities, url) {
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
    __cache["secPolicy"] = secPolicy;
    __cache["sanitize"] = sanitize;
    __cache["htmlEntities"] = htmlEntities;
    __cache["url"] = url;

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
