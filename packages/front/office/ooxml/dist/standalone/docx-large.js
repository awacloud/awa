/*!
 * Copyright (c) 2026 AwaCloud SAS
 * Author: Matthieu Bouilloux
 * SPDX-License-Identifier: AGPL-3.0-only
 * Dual-licensed; see the NOTICE file for licensing and any additional terms.
 */
/* GENERATED — do not edit. Source: packages/front/office/ooxml/tools/generate-bundles.mjs */

/**
 * @fileoverview `@awacloud/ooxml/bundles/prebuilt/docx-large-bundled` — pre-built single-factory bundle.
 *
 * Variant **bundled** : declares no dependencies — every fw and ooxml-local
 * factory transitively reachable from `docx` plus 11 extras is inlined.
 *
 * @module ooxml/bundles/prebuilt/docx-large-bundled
 */

export const docxLargeBundled = {
    name: "docxLargeBundled",
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
    __register({ name: "xml", dependencies: [], factory: function() {
    class XmlParseError extends Error {
      constructor(code, msg) {
        super(msg);
        Object.defineProperty(this, "name", { value: "XmlParseError", writable: !0, configurable: !0 });
        this.code = code;
      }
    }
    const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
    function decodeEntities(s) {
      return s.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (m, body) => {
        if (body[0] === "#") {
          const cp = body[1] === "x" ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
          if (isNaN(cp) || cp < 0 || cp > 1114111 || cp >= 55296 && cp <= 57343)
            return m;
          return String.fromCodePoint(cp);
        }
        return ENTITIES[body] != null ? ENTITIES[body] : m;
      });
    }
    function encodeText(s) {
      return String(s).replace(/[&<>]/g, (c) => c === "&" ? "&amp;" : c === "<" ? "&lt;" : "&gt;");
    }
    function encodeAttr(s) {
      return String(s).replace(/[&<>"]/g, (c) => c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : "&quot;");
    }
    function el(name, attrs, children) {
      return {
        type: "element",
        name,
        attrs: attrs || {},
        children: children || []
      };
    }
    function text(value) {
      return { type: "text", value };
    }
    function findTagEnd(s, from) {
      let i = from + 1;
      const len = s.length;
      let q = "";
      while (i < len) {
        const c = s[i];
        if (q) {
          if (c === q)
            q = "";
        } else if (c === '"' || c === "'")
          q = c;
        else if (c === ">")
          return i;
        i++;
      }
      return -1;
    }
    function parseStartTag(inner) {
      let i = 0;
      const len = inner.length;
      while (i < len && !/\s/.test(inner[i]))
        i++;
      const name = inner.slice(0, i), attrs = {};
      while (i < len) {
        while (i < len && /\s/.test(inner[i]))
          i++;
        if (i >= len)
          break;
        let j = i;
        while (j < len && inner[j] !== "=" && !/\s/.test(inner[j]))
          j++;
        const attrName = inner.slice(i, j);
        if (!attrName)
          break;
        while (j < len && /\s/.test(inner[j]))
          j++;
        if (inner[j] !== "=") {
          attrs[attrName] = "";
          i = j;
          continue;
        }
        j++;
        while (j < len && /\s/.test(inner[j]))
          j++;
        const q = inner[j];
        if (q !== '"' && q !== "'")
          throw new XmlParseError("xml/parse-error", `XML: unquoted attribute "${attrName}"`);
        const end = inner.indexOf(q, j + 1);
        if (end < 0)
          throw new XmlParseError("xml/parse-error", `XML: unterminated attribute "${attrName}"`);
        attrs[attrName] = decodeEntities(inner.slice(j + 1, end));
        i = end + 1;
      }
      return el(name, attrs);
    }
    function parse(xmlStr) {
      let i = 0;
      const len = xmlStr.length;
      if (xmlStr.charCodeAt(0) === 65279)
        i = 1;
      const stack = [];
      let root = null;
      while (i < len)
        if (xmlStr[i] === "<") {
          if (xmlStr.startsWith("<?", i)) {
            const end = xmlStr.indexOf("?>", i + 2);
            if (end < 0)
              throw new XmlParseError("xml/parse-error", "XML: unterminated processing instruction");
            i = end + 2;
            continue;
          }
          if (xmlStr.startsWith("<!--", i)) {
            const end = xmlStr.indexOf("-->", i + 4);
            if (end < 0)
              throw new XmlParseError("xml/parse-error", "XML: unterminated comment");
            i = end + 3;
            continue;
          }
          if (xmlStr.startsWith("<![CDATA[", i)) {
            const end = xmlStr.indexOf("]]>", i + 9);
            if (end < 0)
              throw new XmlParseError("xml/parse-error", "XML: unterminated CDATA");
            const val = xmlStr.slice(i + 9, end);
            if (stack.length)
              stack[stack.length - 1].children.push(text(val));
            i = end + 3;
            continue;
          }
          if (xmlStr.startsWith("<!", i)) {
            let j = i + 2, foundBracket = !1;
            while (j < len) {
              if (xmlStr[j] === "[") {
                foundBracket = !0;
                break;
              }
              if (xmlStr[j] === ">")
                break;
              j++;
            }
            if (foundBracket) {
              const subsetEnd = xmlStr.indexOf("]>", j + 1);
              if (subsetEnd < 0)
                throw new XmlParseError("xml/parse-error", "XML: unterminated declaration");
              i = subsetEnd + 2;
            } else {
              if (j >= len)
                throw new XmlParseError("xml/parse-error", "XML: unterminated declaration");
              i = j + 1;
            }
            continue;
          }
          if (xmlStr[i + 1] === "/") {
            const end = xmlStr.indexOf(">", i);
            if (end < 0)
              throw new XmlParseError("xml/parse-error", "XML: unterminated end tag");
            const tagName = xmlStr.slice(i + 2, end).trim(), top = stack.pop();
            if (!top || top.name !== tagName)
              throw new XmlParseError("xml/parse-error", `XML: mismatched end tag </${tagName}> (expected </${top ? top.name : "\u2205"}>)`);
            i = end + 1;
            continue;
          }
          const end = findTagEnd(xmlStr, i);
          if (end < 0)
            throw new XmlParseError("xml/parse-error", "XML: unterminated start tag");
          const selfClose = xmlStr[end - 1] === "/", inner = xmlStr.slice(i + 1, selfClose ? end - 1 : end), node = parseStartTag(inner);
          if (stack.length)
            stack[stack.length - 1].children.push(node);
          else {
            if (root)
              throw new XmlParseError("xml/parse-error", "XML: multiple root elements");
            root = node;
          }
          if (!selfClose)
            stack.push(node);
          else if (!root)
            root = node;
          i = end + 1;
        } else {
          const next = xmlStr.indexOf("<", i), slice = xmlStr.slice(i, next < 0 ? len : next);
          if (stack.length && slice.length)
            stack[stack.length - 1].children.push(text(decodeEntities(slice)));
          if (next < 0)
            break;
          i = next;
        }
      if (stack.length)
        throw new XmlParseError("xml/parse-error", `XML: unclosed element <${stack[stack.length - 1].name}>`);
      if (!root)
        throw new XmlParseError("xml/parse-error", "XML: no root element");
      return root;
    }
    function serializeNode(node) {
      if (node.type === "text")
        return encodeText(node.value);
      const attrs = Object.keys(node.attrs).map((k) => ` ${k}="${encodeAttr(node.attrs[k])}"`).join("");
      if (!node.children || node.children.length === 0)
        return `<${node.name}${attrs}/>`;
      const inner = node.children.map(serializeNode).join("");
      return `<${node.name}${attrs}>${inner}</${node.name}>`;
    }
    function serialize(root) {
      return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r
` + serializeNode(root);
    }
    function findChild(node, name) {
      if (!node.children)
        return null;
      for (const c of node.children)
        if (c.type === "element" && c.name === name)
          return c;
      return null;
    }
    function findAll(node, name) {
      const out = [];
      if (!node.children)
        return out;
      for (const c of node.children)
        if (c.type === "element" && c.name === name)
          out.push(c);
      return out;
    }
    function textContent(node) {
      if (!node)
        return "";
      if (node.type === "text")
        return node.value;
      if (!node.children)
        return "";
      return node.children.map(textContent).join("");
    }
    return {
      el,
      text,
      parse,
      serialize,
      serializeNode,
      findChild,
      findAll,
      textContent,
      encodeText,
      encodeAttr,
      decodeEntities,
      XmlParseError
    };
  } });
    __register({ name: "bitstream", dependencies: [], factory: function() {
    function readBits(buf, bitPos, mask) {
      const at = bitPos >>> 3;
      return (buf[at] | buf[at + 1] << 8) >>> (bitPos & 7) & mask;
    }
    function readBits16(buf, bitPos) {
      const at = bitPos >>> 3;
      return (buf[at] | buf[at + 1] << 8 | buf[at + 2] << 16) >>> (bitPos & 7);
    }
    function writeBits(buf, bitPos, value) {
      const at = bitPos >>> 3, placed = value << (bitPos & 7);
      buf[at] |= placed;
      buf[at + 1] |= placed >>> 8;
    }
    function writeBits16(buf, bitPos, value) {
      const at = bitPos >>> 3, placed = value << (bitPos & 7);
      buf[at] |= placed;
      buf[at + 1] |= placed >>> 8;
      buf[at + 2] |= placed >>> 16;
    }
    function byteOffset(bitPos) {
      return bitPos + 7 >>> 3;
    }
    function slice(buf, start, end) {
      const from = start == null || start < 0 ? 0 : start, to = end == null || end > buf.length ? buf.length : end;
      return new Uint8Array(buf.subarray(from, to));
    }
    function max(arr) {
      let top = arr[0];
      for (let k = arr.length - 1;k > 0; --k) {
        const v = arr[k];
        if (v > top)
          top = v;
      }
      return top;
    }
    const rev = new Uint16Array(32768);
    for (let code = 1;code < 32768; code++)
      rev[code] = (code & 1) << 14 | rev[code >> 1] >> 1;
    return {
      rev,
      byteOffset,
      readBits,
      writeBits,
      readBits16,
      writeBits16,
      slice,
      max
    };
  } });
    __register({ name: "huffman", dependencies: ["bitstream"], factory: function(bitstream) {
    const mirror15 = bitstream.rev;
    function _firstCodes(codeLengths) {
      const perLength = new Int32Array(16);
      for (let s = 0;s < codeLengths.length; ++s)
        perLength[codeLengths[s]]++;
      perLength[0] = 0;
      const firstCode = new Int32Array(16);
      let code = 0;
      for (let len = 1;len < 16; ++len) {
        code = code + perLength[len - 1] << 1;
        firstCode[len] = code;
      }
      return firstCode;
    }
    function buildMap(codeLengths, maxBits, reversed) {
      const next = _firstCodes(codeLengths), count = codeLengths.length;
      if (!reversed) {
        const codes = new Uint16Array(count);
        for (let s = 0;s < count; ++s) {
          const len = codeLengths[s];
          if (len)
            codes[s] = mirror15[next[len]++] >>> 15 - len;
        }
        return codes;
      }
      const size = 1 << maxBits, table = new Uint16Array(size);
      for (let s = 0;s < count; ++s) {
        const len = codeLengths[s];
        if (!len)
          continue;
        const entry = s << 4 | len, stride = 1 << len;
        for (let k = mirror15[next[len]++] >>> 15 - len;k < size; k += stride)
          table[k] = entry;
      }
      return table;
    }
    function _sortedLeaves(freqs, span, used) {
      const keys = new Float64Array(used);
      let n = 0;
      for (let s = 0;s < span; ++s)
        if (freqs[s] > 0)
          keys[n++] = freqs[s] * span + s;
      keys.sort();
      const symbols = new Int32Array(used), weights = new Float64Array(used);
      for (let i = 0;i < used; ++i) {
        const symbol = keys[i] % span;
        symbols[i] = symbol;
        weights[i] = (keys[i] - symbol) / span;
      }
      return { symbols, weights };
    }
    function _packageMerge(weights, levels) {
      const n = weights.length, room = 2 * n, isLeaf = new Uint8Array(levels * room), listSize = new Int32Array(levels);
      let below = new Float64Array(room), here = new Float64Array(room);
      below.set(weights);
      isLeaf.fill(1, 0, n);
      listSize[0] = n;
      for (let level = 1;level < levels; ++level) {
        const packages = listSize[level - 1] >>> 1, base = level * room;
        let leaf = 0, pkg = 0, size = 0;
        while (leaf < n || pkg < packages) {
          const pkgWeight = pkg < packages ? below[2 * pkg] + below[2 * pkg + 1] : 1 / 0;
          if (leaf < n && weights[leaf] <= pkgWeight) {
            here[size] = weights[leaf++];
            isLeaf[base + size] = 1;
          } else {
            here[size] = pkgWeight;
            ++pkg;
          }
          ++size;
        }
        listSize[level] = size;
        const swap = below;
        below = here;
        here = swap;
      }
      const lengths = new Uint8Array(n);
      let bought = 2 * n - 2;
      for (let level = levels - 1;level >= 0 && bought > 0; --level) {
        const base = level * room;
        let leaves = 0;
        for (let i = 0;i < bought; ++i)
          leaves += isLeaf[base + i];
        for (let i = 0;i < leaves; ++i)
          lengths[i]++;
        bought = 2 * (bought - leaves);
      }
      return lengths;
    }
    function _huffmanLengths(weights, limit) {
      const n = weights.length, steps = n - 1, merged = new Float64Array(steps), absorbedBy = new Int32Array(steps + n);
      let leaf = 0, node = 0;
      for (let step = 0;step < steps; ++step) {
        let sum = 0;
        for (let pick = 0;pick < 2; ++pick)
          if (leaf < n && (node === step || weights[leaf] <= merged[node])) {
            sum += weights[leaf];
            absorbedBy[steps + leaf++] = step;
          } else {
            sum += merged[node];
            absorbedBy[node++] = step;
          }
        merged[step] = sum;
      }
      const depth = new Int32Array(steps);
      for (let step = steps - 2;step >= 0; --step)
        depth[step] = depth[absorbedBy[step]] + 1;
      const lengths = new Uint8Array(n);
      for (let i = 0;i < n; ++i) {
        const len = depth[absorbedBy[steps + i]] + 1;
        if (len > limit)
          return null;
        lengths[i] = len;
      }
      return lengths;
    }
    function buildTree(freqs, maxBits) {
      let used = 0, top = -1;
      for (let s = 0;s < freqs.length; ++s)
        if (freqs[s] > 0) {
          ++used;
          top = s;
        }
      if (used === 0)
        return { t: new Uint8Array(0), l: 0 };
      const t = new Uint8Array(top + 1);
      if (used === 1) {
        t[top] = 1;
        return { t, l: 1 };
      }
      const { symbols, weights } = _sortedLeaves(freqs, top + 1, used), lengths = _huffmanLengths(weights, maxBits) || _packageMerge(weights, maxBits);
      for (let i = 0;i < used; ++i)
        t[symbols[i]] = lengths[i];
      return { t, l: lengths[0] };
    }
    return { buildTree, buildMap };
  } });
    __register({ name: "lz77", dependencies: [], factory: function() {
    const u8 = Uint8Array, i32 = Int32Array, DEFAULT = Object.freeze({
      windowBits: 16,
      minMatch: 4,
      maxMatch: 258,
      chainDepth: 16,
      lazy: !1,
      hashBits: 17,
      niceLength: 258,
      goodLength: 258,
      maxLazy: 258,
      chainSkip: !1,
      start: 0,
      hashFn: null
    });
    function _resolveOpts(opts) {
      opts = opts || {};
      const minMatch = Math.max(opts.minMatch ?? DEFAULT.minMatch, 3), maxMatch = opts.maxMatch ?? DEFAULT.maxMatch, niceLength = Math.min(Math.max(opts.niceLength ?? maxMatch, minMatch), maxMatch);
      return {
        windowBits: Math.min(opts.windowBits ?? DEFAULT.windowBits, 24),
        minMatch,
        maxMatch,
        chainDepth: Math.max(opts.chainDepth ?? DEFAULT.chainDepth, 1),
        lazy: opts.lazy ?? DEFAULT.lazy,
        hashBits: Math.min(opts.hashBits ?? DEFAULT.hashBits, 22),
        niceLength,
        goodLength: Math.min(opts.goodLength ?? DEFAULT.goodLength, maxMatch),
        maxLazy: Math.min(opts.maxLazy ?? DEFAULT.maxLazy, niceLength),
        chainSkip: opts.chainSkip ?? DEFAULT.chainSkip,
        start: Math.max(0, opts.start | 0),
        hashFn: typeof opts.hashFn === "function" ? opts.hashFn : null
      };
    }
    function _hasherFor(o) {
      const mask = (1 << o.hashBits) - 1, shift = 32 - o.hashBits, fn = o.hashFn;
      if (fn)
        return function hashInjected(data, i) {
          return fn(data, i) & mask;
        };
      if (o.minMatch <= 3)
        return function hash3(data, i) {
          let h = data[i] * 506832829 >>> 0;
          h = (h ^ data[i + 1] * 982451653) >>> 0;
          h = (h ^ data[i + 2] * 1610612741) >>> 0;
          return h >>> shift & mask;
        };
      return function hash4(data, i) {
        let h = data[i] * 506832829 >>> 0;
        h = (h ^ data[i + 1] * 982451653) >>> 0;
        h = (h ^ data[i + 2] * 1610612741) >>> 0;
        h = (h ^ data[i + 3] * 805306457) >>> 0;
        return h >>> shift & mask;
      };
    }
    let matchDist = 0;
    function _longestMatch(data, pos, h, head, prev, wndSize, wndMask, maxLen, niceLength, chainDepth, chainSkip, atLeast) {
      if (atLeast >= niceLength || atLeast >= maxLen)
        return 0;
      const first = data[pos], second = data[pos + 1];
      let best = atLeast, bestDist = 0, link = head[h], align = 0, probes = chainDepth;
      while (link !== -1 && probes-- > 0) {
        const cand = link - align;
        if (cand < 0 || pos - cand >= wndSize)
          break;
        if (data[cand + best] === data[pos + best] && data[cand + best - 1] === data[pos + best - 1] && data[cand] === first && data[cand + 1] === second) {
          let m = 0;
          while (m < maxLen && data[cand + m] === data[pos + m])
            ++m;
          if (m > best) {
            best = m;
            bestDist = pos - cand;
            if (m >= niceLength || m >= maxLen)
              break;
            if (chainSkip) {
              let widest = 0;
              for (let j = 0, n = Math.min(bestDist, m - 2);j < n; ++j) {
                const at = cand + j, back = prev[at & wndMask];
                if (back === -1)
                  continue;
                const gap = at - back;
                if (gap > widest) {
                  widest = gap;
                  link = at;
                  align = j;
                }
              }
            }
          }
        }
        link = prev[link & wndMask];
      }
      if (bestDist === 0)
        return 0;
      matchDist = bestDist;
      return best;
    }
    function findMatch(data, pos, head, prev, opts) {
      const o = _resolveOpts(opts);
      if (pos + o.minMatch > data.length)
        return null;
      const wndSize = 1 << o.windowBits, hash = _hasherFor(o), maxLen = Math.min(o.maxMatch, data.length - pos), len = _longestMatch(data, pos, hash(data, pos), head, prev, wndSize, wndSize - 1, maxLen, o.niceLength, o.chainDepth, o.chainSkip, o.minMatch - 1);
      return len ? { len, dist: matchDist } : null;
    }
    function encode(data, opts, callbacks) {
      if (!(data instanceof u8))
        throw Error("lz77.encode: data must be Uint8Array");
      const { literal: onLit, match: onMatch } = callbacks;
      if (typeof onLit !== "function" || typeof onMatch !== "function")
        throw Error("lz77.encode: callbacks.literal and callbacks.match required");
      const { tokens, count } = encodeTokens(data, opts);
      let pos = _resolveOpts(opts).start;
      for (let k = 0, p = 0;k < count; ++k, p += 2) {
        const len = tokens[p];
        if (len === 0) {
          onLit(pos);
          pos += 1;
        } else {
          onMatch(pos, len, tokens[p + 1]);
          pos += len;
        }
      }
    }
    function encodeTokens(data, opts) {
      if (!(data instanceof u8))
        throw Error("lz77.encodeTokens: data must be Uint8Array");
      const o = _resolveOpts(opts), len = data.length, cap = 2 * Math.max(0, len - o.start), provided = opts && opts.tokens;
      let tokens;
      if (provided) {
        if (provided.length < cap)
          throw Error("lz77.encodeTokens: tokens buffer too small");
        tokens = provided;
      } else
        tokens = new i32(cap);
      let p = 0;
      if (o.start >= len)
        return { tokens, count: 0 };
      const { maxMatch, niceLength, chainDepth, lazy, goodLength, maxLazy, chainSkip } = o, wndSize = 1 << o.windowBits, wndMask = wndSize - 1, head = new i32(1 << o.hashBits).fill(-1), prev = new i32(Math.min(wndSize, len)).fill(-1), hash = _hasherFor(o), lastKey = len - o.minMatch, atLeast = o.minMatch - 1;
      for (let k = 0;k < o.start && k <= lastKey; ++k) {
        const h = hash(data, k);
        prev[k & wndMask] = head[h];
        head[h] = k;
      }
      let i = o.start;
      while (i <= lastKey) {
        const h = hash(data, i);
        let matchLen = _longestMatch(data, i, h, head, prev, wndSize, wndMask, Math.min(maxMatch, len - i), niceLength, chainDepth, chainSkip, atLeast), dist = matchDist;
        prev[i & wndMask] = head[h];
        head[h] = i;
        if (matchLen === 0) {
          tokens[p++] = 0;
          tokens[p++] = data[i];
          i++;
          continue;
        }
        if (lazy && matchLen < maxLazy && i < lastKey) {
          const h1 = hash(data, i + 1), nextLen = _longestMatch(data, i + 1, h1, head, prev, wndSize, wndMask, Math.min(maxMatch, len - i - 1), niceLength, matchLen >= goodLength ? chainDepth >> 2 || 1 : chainDepth, chainSkip, matchLen);
          if (nextLen) {
            tokens[p++] = 0;
            tokens[p++] = data[i];
            i++;
            matchLen = nextLen;
            dist = matchDist;
            prev[i & wndMask] = head[h1];
            head[h1] = i;
          }
        }
        tokens[p++] = matchLen;
        tokens[p++] = dist;
        const end = i + matchLen;
        for (let k = i + 1;k < end && k <= lastKey; ++k) {
          const hk = hash(data, k);
          prev[k & wndMask] = head[hk];
          head[hk] = k;
        }
        i = end;
      }
      while (i < len) {
        tokens[p++] = 0;
        tokens[p++] = data[i];
        i++;
      }
      return { tokens, count: p / 2 };
    }
    function decodeStream(dst, ops) {
      let p = 0;
      for (const op of ops)
        if ("lit" in op)
          dst[p++] = op.lit;
        else
          for (let k = 0;k < op.len; ++k) {
            dst[p] = dst[p - op.dist];
            p++;
          }
      return p;
    }
    return {
      encode,
      encodeTokens,
      findMatch,
      decodeStream,
      DEFAULT
    };
  } });
    __register({ name: "deflate", dependencies: ["bitstream","huffman","lz77"], factory: function(bitstream, huffman, lz77) {
    const {
      readBits,
      readBits16,
      writeBits,
      writeBits16,
      byteOffset,
      slice,
      max
    } = bitstream, { buildMap, buildTree } = huffman, ERROR_MESSAGES = [
      "unexpected EOF",
      "invalid block type",
      "invalid length/literal",
      "invalid distance",
      "stream finished",
      "no stream handler",
      null,
      null,
      "invalid data"
    ];
    function fail(code, message) {
      const e = Error(message ?? ERROR_MESSAGES[code] ?? "unknown error");
      e.code = code;
      throw e;
    }
    const u8 = Uint8Array, u16 = Uint16Array, u32 = Uint32Array, i32 = Int32Array, WINDOW_SIZE = 32768;
    function lengthExtraBits(i) {
      if (i < 8 || i === 28)
        return 0;
      return i - 4 >> 2;
    }
    function distanceExtraBits(i) {
      if (i < 4)
        return 0;
      return i - 2 >> 1;
    }
    function accumulateBases(extra, start) {
      const base = new u16(extra.length);
      base[0] = start;
      for (let i = 1;i < extra.length; ++i)
        base[i] = base[i - 1] + (1 << extra[i - 1]);
      return base;
    }
    const LENGTH_EXTRA = new u8(29);
    for (let i = 0;i < 29; ++i)
      LENGTH_EXTRA[i] = lengthExtraBits(i);
    const LENGTH_BASE = accumulateBases(LENGTH_EXTRA, 3);
    LENGTH_BASE[28] = 258;
    const DIST_EXTRA = new u8(30);
    for (let i = 0;i < 30; ++i)
      DIST_EXTRA[i] = distanceExtraBits(i);
    const DIST_BASE = accumulateBases(DIST_EXTRA, 1), CODE_LENGTH_ORDER = new u8([
      16,
      17,
      18,
      0,
      8,
      7,
      9,
      6,
      10,
      5,
      11,
      4,
      12,
      3,
      13,
      2,
      14,
      1,
      15
    ]), FIXED_LIT_LENGTHS = new u8(288);
    for (let i = 0;i < 144; ++i)
      FIXED_LIT_LENGTHS[i] = 8;
    for (let i = 144;i < 256; ++i)
      FIXED_LIT_LENGTHS[i] = 9;
    for (let i = 256;i < 280; ++i)
      FIXED_LIT_LENGTHS[i] = 7;
    for (let i = 280;i < 288; ++i)
      FIXED_LIT_LENGTHS[i] = 8;
    const FIXED_DIST_LENGTHS = new u8(30);
    for (let i = 0;i < 30; ++i)
      FIXED_DIST_LENGTHS[i] = 5;
    const FIXED_LIT_TABLE = buildMap(FIXED_LIT_LENGTHS, 9, 1), FIXED_DIST_TABLE = buildMap(FIXED_DIST_LENGTHS, 5, 1), FIXED_LIT_CODES = buildMap(FIXED_LIT_LENGTHS, 9, 0), FIXED_DIST_CODES = buildMap(FIXED_DIST_LENGTHS, 5, 0), LENGTH_CODE = new u8(259);
    for (let sym = 0;sym < 28; ++sym) {
      const base = LENGTH_BASE[sym], span = 1 << LENGTH_EXTRA[sym];
      for (let len = base;len < base + span && len < 258; ++len)
        LENGTH_CODE[len] = sym;
    }
    LENGTH_CODE[258] = 28;
    const DIST_CODE_LOW = new u8(256);
    for (let dist = 1, sym = 0;dist <= 256; ++dist) {
      while (sym < 29 && dist >= DIST_BASE[sym + 1])
        ++sym;
      DIST_CODE_LOW[dist - 1] = sym;
    }
    const DIST_CODE_HIGH = new u8(128);
    for (let bucket = 0, sym = 0;bucket < 128; ++bucket) {
      const first = (bucket << 8) + 1;
      while (sym < 29 && first >= DIST_BASE[sym + 1])
        ++sym;
      DIST_CODE_HIGH[bucket] = sym;
    }
    function distanceCode(dist) {
      if (dist <= 256)
        return DIST_CODE_LOW[dist - 1];
      const sym = DIST_CODE_HIGH[dist - 1 >> 8];
      return sym < 29 && dist >= DIST_BASE[sym + 1] ? sym + 1 : sym;
    }
    const PHASE_HEADER = 0, PHASE_STORED = 1, PHASE_CODES = 2, PHASE_DONE = 3, NEED_INPUT = 0, COMPLETE = 1;
    function createInflateState(dictionary) {
      const dict = dictionary && dictionary.length ? dictionary.subarray(Math.max(0, dictionary.length - WINDOW_SIZE)) : null;
      return {
        bitPos: 0,
        finalBlock: 0,
        phase: PHASE_HEADER,
        storedRemaining: 0,
        litTable: null,
        litBits: 0,
        distTable: null,
        distBits: 0,
        out: null,
        outLen: 0,
        emitted: 0,
        dictionary: dict,
        fixedOut: !1
      };
    }
    function initOutput(state, inputLength, providedOut) {
      const dictLen = state.dictionary ? state.dictionary.length : 0;
      if (providedOut && !dictLen) {
        state.out = providedOut;
        state.fixedOut = !0;
      } else
        state.out = new u8(Math.max(65536, inputLength * 3));
      if (dictLen) {
        state.out.set(state.dictionary);
        state.outLen = dictLen;
        state.emitted = dictLen;
      }
    }
    function reserveOutput(state, needed) {
      if (needed <= state.out.length)
        return;
      if (state.fixedOut)
        fail(8, "output exceeds provided buffer");
      let size = state.out.length || 65536;
      while (size < needed)
        size *= 2;
      const grown = new u8(size);
      grown.set(state.out.subarray(0, state.outLen));
      state.out = grown;
    }
    function readDynamicTables(state, input) {
      const totalBits = input.length * 8;
      let pos = state.bitPos;
      const hlit = readBits(input, pos, 31) + 257, hdist = readBits(input, pos + 5, 31) + 1, hclen = readBits(input, pos + 10, 15) + 4;
      pos += 14;
      if (pos > totalBits) {
        state.bitPos = pos;
        return !1;
      }
      if (hlit > 286 || hdist > 30)
        fail(8, "too many length/distance codes");
      const clLengths = new u8(19);
      for (let i = 0;i < hclen; ++i)
        clLengths[CODE_LENGTH_ORDER[i]] = readBits(input, pos + i * 3, 7);
      pos += hclen * 3;
      if (pos > totalBits) {
        state.bitPos = pos;
        return !1;
      }
      const clBits = max(clLengths), clMask = (1 << clBits) - 1, clTable = buildMap(clLengths, clBits, 1), total = hlit + hdist, lengths = new u8(total);
      for (let i = 0;i < total; ) {
        const entry = clTable[readBits(input, pos, clMask)];
        if (!entry || pos + (entry & 15) > totalBits) {
          if (pos + clBits > totalBits) {
            state.bitPos = totalBits + 1;
            return !1;
          }
          fail(8, "invalid code-length code");
        }
        pos += entry & 15;
        const symbol = entry >> 4;
        if (symbol < 16) {
          lengths[i++] = symbol;
          continue;
        }
        let repeat, value = 0;
        if (symbol === 16) {
          if (i === 0)
            fail(8, "code-length repeat with no previous length");
          value = lengths[i - 1];
          repeat = 3 + readBits(input, pos, 3);
          pos += 2;
        } else if (symbol === 17) {
          repeat = 3 + readBits(input, pos, 7);
          pos += 3;
        } else {
          repeat = 11 + readBits(input, pos, 127);
          pos += 7;
        }
        if (pos > totalBits) {
          state.bitPos = pos;
          return !1;
        }
        if (i + repeat > total)
          fail(8, "code-length repeat overruns the table");
        while (repeat--)
          lengths[i++] = value;
      }
      const litLengths = lengths.subarray(0, hlit), distLengths = lengths.subarray(hlit);
      state.litBits = max(litLengths);
      state.distBits = max(distLengths);
      state.litTable = buildMap(litLengths, state.litBits, 1);
      state.distTable = buildMap(distLengths, state.distBits, 1);
      state.bitPos = pos;
      return !0;
    }
    function readBlockHeader(state, input) {
      const totalBits = input.length * 8;
      state.finalBlock = readBits(input, state.bitPos, 1);
      const type = readBits(input, state.bitPos + 1, 3);
      state.bitPos += 3;
      if (state.bitPos > totalBits)
        return !1;
      if (type === 0) {
        const start = byteOffset(state.bitPos);
        if (start + 4 > input.length) {
          state.bitPos = (start + 4) * 8;
          return !1;
        }
        const len = input[start] | input[start + 1] << 8;
        if ((input[start + 2] | input[start + 3] << 8) !== (~len & 65535))
          fail(8, "stored block LEN/NLEN mismatch");
        state.bitPos = (start + 4) * 8;
        state.storedRemaining = len;
        state.phase = PHASE_STORED;
      } else if (type === 1) {
        state.litTable = FIXED_LIT_TABLE;
        state.litBits = 9;
        state.distTable = FIXED_DIST_TABLE;
        state.distBits = 5;
        state.phase = PHASE_CODES;
      } else if (type === 2) {
        if (!readDynamicTables(state, input))
          return !1;
        state.phase = PHASE_CODES;
      } else
        fail(1);
      return !0;
    }
    function copyStored(state, input) {
      const start = state.bitPos >> 3, n = Math.min(state.storedRemaining, input.length - start);
      if (n > 0) {
        const end = state.outLen + n;
        reserveOutput(state, end);
        state.out.set(input.subarray(start, start + n), state.outLen);
        state.outLen = end;
        state.storedRemaining -= n;
        state.bitPos += n * 8;
      }
      if (state.storedRemaining > 0)
        return !1;
      state.phase = state.finalBlock ? PHASE_DONE : PHASE_HEADER;
      return !0;
    }
    function decodeSymbols(state, input) {
      const totalBits = input.length * 8, litTable = state.litTable, distTable = state.distTable, litMask = (1 << state.litBits) - 1, distMask = (1 << state.distBits) - 1;
      for (;; ) {
        const snapshot = state.bitPos, entry = litTable[readBits16(input, state.bitPos) & litMask];
        if (!entry || state.bitPos + (entry & 15) > totalBits) {
          if (state.bitPos + state.litBits > totalBits) {
            state.bitPos = snapshot;
            return !1;
          }
          fail(2);
        }
        state.bitPos += entry & 15;
        const symbol = entry >> 4;
        if (symbol < 256) {
          reserveOutput(state, state.outLen + 1);
          state.out[state.outLen++] = symbol;
          continue;
        }
        if (symbol === 256) {
          state.phase = state.finalBlock ? PHASE_DONE : PHASE_HEADER;
          return !0;
        }
        const lengthIndex = symbol - 257;
        if (lengthIndex >= 29)
          fail(2);
        let length = LENGTH_BASE[lengthIndex];
        const lengthExtra = LENGTH_EXTRA[lengthIndex];
        if (lengthExtra) {
          if (state.bitPos + lengthExtra > totalBits) {
            state.bitPos = snapshot;
            return !1;
          }
          length += readBits(input, state.bitPos, (1 << lengthExtra) - 1);
          state.bitPos += lengthExtra;
        }
        const distEntry = distTable[readBits16(input, state.bitPos) & distMask];
        if (!distEntry || state.bitPos + (distEntry & 15) > totalBits) {
          if (state.bitPos + state.distBits > totalBits) {
            state.bitPos = snapshot;
            return !1;
          }
          fail(3);
        }
        state.bitPos += distEntry & 15;
        const distIndex = distEntry >> 4;
        if (distIndex >= 30)
          fail(3);
        let distance = DIST_BASE[distIndex];
        const distExtra = DIST_EXTRA[distIndex];
        if (distExtra) {
          if (state.bitPos + distExtra > totalBits) {
            state.bitPos = snapshot;
            return !1;
          }
          distance += readBits16(input, state.bitPos) & (1 << distExtra) - 1;
          state.bitPos += distExtra;
        }
        if (distance > state.outLen)
          fail(3);
        const end = state.outLen + length;
        reserveOutput(state, end);
        const out = state.out;
        for (let p = state.outLen;p < end; ++p)
          out[p] = out[p - distance];
        state.outLen = end;
      }
    }
    function runInflate(state, input, streaming) {
      for (;; ) {
        if (state.phase === PHASE_DONE)
          return COMPLETE;
        if (state.phase === PHASE_HEADER) {
          const snapshot = state.bitPos;
          if (!readBlockHeader(state, input)) {
            if (!streaming)
              fail(0);
            state.bitPos = snapshot;
            state.phase = PHASE_HEADER;
            return NEED_INPUT;
          }
        }
        if (state.phase === PHASE_STORED) {
          if (!copyStored(state, input)) {
            if (!streaming)
              fail(0);
            return NEED_INPUT;
          }
        } else if (state.phase === PHASE_CODES) {
          if (!decodeSymbols(state, input)) {
            if (!streaming)
              fail(0);
            return NEED_INPUT;
          }
        }
      }
    }
    function trimWindow(state) {
      if (state.outLen <= WINDOW_SIZE)
        return;
      const start = state.outLen - WINDOW_SIZE;
      state.out.set(state.out.subarray(start, state.outLen), 0);
      state.outLen = WINDOW_SIZE;
      state.emitted = Math.max(0, state.emitted - start);
    }
    const WINDOW_BITS = 15, MIN_MATCH = 3, MAX_MATCH = 258, BLOCK_TOKENS = 16384, STREAM_FLUSH_BYTES = 65536, LEVELS = [
      null,
      { chainDepth: 4, niceLength: 8 },
      { chainDepth: 8, niceLength: 16 },
      { chainDepth: 16, niceLength: 32 },
      { chainDepth: 16, niceLength: 16, goodLength: 4, maxLazy: 4 },
      { chainDepth: 32, niceLength: 32, goodLength: 8, maxLazy: 16 },
      { chainDepth: 128, niceLength: 128, goodLength: 8, maxLazy: 16 },
      { chainDepth: 256, niceLength: 128, goodLength: 8, maxLazy: 32 },
      { chainDepth: 1024, niceLength: 258, goodLength: 32, maxLazy: 128 },
      { chainDepth: 4096, niceLength: 258, goodLength: 32, maxLazy: 258 }
    ];
    function clamp(value, lo, hi) {
      if (!(value >= lo))
        return lo;
      return value > hi ? hi : value;
    }
    function resolveHashBits(opts, inputLength) {
      if (opts.mem != null)
        return Math.min(22, 12 + opts.mem);
      return clamp(Math.ceil(Math.log2(inputLength || 1)), 12, 20);
    }
    function makeHashFn(hashBits) {
      const shift = 32 - hashBits;
      return function rfc1951Hash(data, i) {
        return Math.imul(data[i] | data[i + 1] << 8 | data[i + 2] << 16, 2654435761) >>> shift;
      };
    }
    const TOKEN_SCRATCH_MAX = 2097152;
    let tokenScratch = null;
    function tokenBuffer(capacity) {
      if (capacity > TOKEN_SCRATCH_MAX)
        return new i32(capacity);
      if (!tokenScratch || tokenScratch.length < capacity)
        tokenScratch = new i32(capacity);
      return tokenScratch;
    }
    function createTokenBuffer(tokens, start) {
      return {
        tokens,
        from: 0,
        to: 0,
        litFreq: new u32(286),
        distFreq: new u32(30),
        extraBits: 0,
        blockStart: start,
        blockLen: 0
      };
    }
    function tallyBlock(tb, from, to) {
      const { tokens, litFreq, distFreq } = tb;
      let extraBits = 0, covered = 0;
      for (let p = 2 * from, end = 2 * to;p < end; p += 2) {
        const len = tokens[p], value = tokens[p + 1];
        if (len === 0) {
          ++litFreq[value];
          covered += 1;
        } else {
          const ls = LENGTH_CODE[len], ds = distanceCode(value);
          ++litFreq[257 + ls];
          ++distFreq[ds];
          extraBits += LENGTH_EXTRA[ls] + DIST_EXTRA[ds];
          covered += len;
        }
      }
      tb.from = from;
      tb.to = to;
      tb.extraBits = extraBits;
      return covered;
    }
    function resetTokenBuffer(tb, start) {
      tb.extraBits = 0;
      tb.blockStart = start;
      tb.blockLen = 0;
      tb.litFreq.fill(0);
      tb.distFreq.fill(0);
    }
    function ensureBits(w, bits) {
      const needed = (w.bitPos + bits >> 3) + 8;
      if (needed <= w.buf.length)
        return;
      let size = w.buf.length || 1024;
      while (size < needed)
        size *= 2;
      const grown = new u8(size);
      grown.set(w.buf);
      w.buf = grown;
    }
    function codeBits(freq, lengths, n) {
      let bits = 0;
      for (let i = 0;i < n; ++i)
        if (freq[i])
          bits += freq[i] * lengths[i];
      return bits;
    }
    function usedAtLeastTwo(freq) {
      let used = 0;
      for (let i = 0;i < freq.length; ++i)
        if (freq[i] && ++used === 2)
          return 2;
      return used;
    }
    function runLengthEncodeCodeLengths(lengths) {
      const out = [], n = lengths.length;
      let i = 0;
      while (i < n) {
        const value = lengths[i];
        let run = 1;
        while (i + run < n && lengths[i + run] === value)
          ++run;
        i += run;
        if (value === 0) {
          while (run >= 11) {
            const r = run < 138 ? run : 138;
            out.push(18, r - 11, 7);
            run -= r;
          }
          if (run >= 3) {
            out.push(17, run - 3, 3);
            run = 0;
          }
          while (run-- > 0)
            out.push(0, 0, 0);
        } else {
          out.push(value, 0, 0);
          let rest = run - 1;
          while (rest >= 3) {
            const r = rest < 6 ? rest : 6;
            out.push(16, r - 3, 2);
            rest -= r;
          }
          while (rest-- > 0)
            out.push(value, 0, 0);
        }
      }
      return out;
    }
    function writeStoredBlock(w, input, start, n, final) {
      writeBits(w.buf, w.bitPos, final ? 1 : 0);
      w.bitPos += 3;
      const o = byteOffset(w.bitPos);
      w.buf[o] = n & 255;
      w.buf[o + 1] = n >> 8 & 255;
      w.buf[o + 2] = ~n & 255;
      w.buf[o + 3] = ~n >> 8 & 255;
      if (n)
        w.buf.set(input.subarray(start, start + n), o + 4);
      w.bitPos = (o + 4 + n) * 8;
    }
    function writeTokens(w, tb, litCodes, litLengths, distCodes, distLengths) {
      const buf = w.buf, tokens = tb.tokens;
      let p = w.bitPos;
      for (let i = 2 * tb.from, end = 2 * tb.to;i < end; i += 2) {
        const len = tokens[i], value = tokens[i + 1];
        if (len === 0) {
          writeBits16(buf, p, litCodes[value]);
          p += litLengths[value];
          continue;
        }
        const ls = LENGTH_CODE[len];
        writeBits16(buf, p, litCodes[257 + ls]);
        p += litLengths[257 + ls];
        const lextra = LENGTH_EXTRA[ls];
        if (lextra) {
          writeBits(buf, p, len - LENGTH_BASE[ls]);
          p += lextra;
        }
        const ds = distanceCode(value);
        writeBits16(buf, p, distCodes[ds]);
        p += distLengths[ds];
        const dextra = DIST_EXTRA[ds];
        if (dextra) {
          writeBits16(buf, p, value - DIST_BASE[ds]);
          p += dextra;
        }
      }
      writeBits16(buf, p, litCodes[256]);
      w.bitPos = p + litLengths[256];
    }
    function writeBlock(w, tb, input, final) {
      ++tb.litFreq[256];
      const n = tb.blockLen, align = 8 - (w.bitPos + 3 & 7) & 7, storedCost = n <= 65535 ? 8 * (5 + n) + align : 1 / 0, fixedCost = 3 + codeBits(tb.litFreq, FIXED_LIT_LENGTHS, 286) + codeBits(tb.distFreq, FIXED_DIST_LENGTHS, 30) + tb.extraBits, litTree = buildTree(tb.litFreq, 15), distTree = buildTree(tb.distFreq, 15), hlit = Math.max(257, litTree.t.length), hdist = Math.max(1, distTree.t.length), combined = new u8(hlit + hdist);
      combined.set(litTree.t, 0);
      if (distTree.t.length)
        combined.set(distTree.t, hlit);
      const litLengths = combined.subarray(0, hlit), distLengths = combined.subarray(hlit), rle = runLengthEncodeCodeLengths(combined), clFreq = new u16(19);
      let clExtra = 0;
      for (let i = 0;i < rle.length; i += 3) {
        ++clFreq[rle[i]];
        clExtra += rle[i + 2];
      }
      const clTree = buildTree(clFreq, 7), clLengths = new u8(19);
      clLengths.set(clTree.t);
      let hclen = 19;
      while (hclen > 4 && !clLengths[CODE_LENGTH_ORDER[hclen - 1]])
        --hclen;
      let dynamicCost = 17 + 3 * hclen + codeBits(clFreq, clLengths, 19) + clExtra + codeBits(tb.litFreq, litLengths, Math.min(286, hlit)) + codeBits(tb.distFreq, distLengths, Math.min(30, hdist)) + tb.extraBits;
      if (usedAtLeastTwo(tb.litFreq) < 2 || usedAtLeastTwo(clFreq) < 2)
        dynamicCost = 1 / 0;
      const best = Math.min(storedCost, fixedCost, dynamicCost);
      ensureBits(w, best + 64);
      if (best === storedCost) {
        writeStoredBlock(w, input, tb.blockStart, n, final);
        return;
      }
      writeBits(w.buf, w.bitPos, final ? 1 : 0);
      if (best === fixedCost) {
        writeBits(w.buf, w.bitPos + 1, 1);
        w.bitPos += 3;
        writeTokens(w, tb, FIXED_LIT_CODES, FIXED_LIT_LENGTHS, FIXED_DIST_CODES, FIXED_DIST_LENGTHS);
        return;
      }
      writeBits(w.buf, w.bitPos + 1, 2);
      w.bitPos += 3;
      const buf = w.buf;
      let p = w.bitPos;
      writeBits(buf, p, hlit - 257);
      writeBits(buf, p + 5, hdist - 1);
      writeBits(buf, p + 10, hclen - 4);
      p += 14;
      for (let i = 0;i < hclen; ++i)
        writeBits(buf, p + 3 * i, clLengths[CODE_LENGTH_ORDER[i]]);
      p += 3 * hclen;
      const clCodes = buildMap(clLengths, clTree.l || 1, 0);
      for (let i = 0;i < rle.length; i += 3) {
        const symbol = rle[i];
        writeBits16(buf, p, clCodes[symbol]);
        p += clLengths[symbol];
        const bits = rle[i + 2];
        if (bits) {
          writeBits(buf, p, rle[i + 1]);
          p += bits;
        }
      }
      w.bitPos = p;
      writeTokens(w, tb, buildMap(litLengths, litTree.l || 1, 0), litLengths, buildMap(distLengths, distTree.l || 1, 0), distLengths);
    }
    function writeStoredRun(w, input, start, final) {
      const end = input.length;
      if (start >= end) {
        if (final) {
          ensureBits(w, 48);
          writeStoredBlock(w, input, start, 0, !0);
        }
        return;
      }
      let pos = start;
      while (pos < end) {
        const n = Math.min(65535, end - pos);
        ensureBits(w, 8 * (n + 5) + 8);
        writeStoredBlock(w, input, pos, n, final && pos + n >= end);
        pos += n;
      }
    }
    function compressBlocks(input, params) {
      const w = { buf: new u8(4096), bitPos: params.carryBits & 7 };
      w.buf[0] = params.carryByte & 255;
      const start = params.start;
      if (params.level === 0)
        writeStoredRun(w, input, start, params.final);
      else {
        const scan = lz77.encodeTokens(input, {
          windowBits: WINDOW_BITS,
          minMatch: MIN_MATCH,
          maxMatch: MAX_MATCH,
          hashBits: params.hashBits,
          start,
          hashFn: makeHashFn(params.hashBits),
          lazy: params.lazy,
          chainSkip: !0,
          ...LEVELS[params.level],
          tokens: tokenBuffer(2 * Math.max(0, input.length - start))
        }), tb = createTokenBuffer(scan.tokens, start), count = scan.count;
        for (let from = 0;; from += BLOCK_TOKENS) {
          const to = Math.min(count, from + BLOCK_TOKENS), covered = tallyBlock(tb, from, to);
          if (to === count) {
            tb.blockLen = input.length - tb.blockStart;
            writeBlock(w, tb, input, params.final);
            break;
          }
          tb.blockLen = covered;
          writeBlock(w, tb, input, !1);
          resetTokenBuffer(tb, tb.blockStart + covered);
        }
      }
      if (params.final)
        return { bytes: slice(w.buf, 0, byteOffset(w.bitPos)), carryByte: 0, carryBits: 0 };
      const whole = w.bitPos >> 3, carryBits = w.bitPos & 7;
      return {
        bytes: slice(w.buf, 0, whole),
        carryByte: carryBits ? w.buf[whole] : 0,
        carryBits
      };
    }
    function DeflateStream(opts, ondata) {
      if (typeof opts === "function") {
        ondata = opts;
        opts = {};
      }
      this.ondata = ondata;
      this._o = opts || {};
      this._level = clamp(this._o.level ?? 6, 0, 9) | 0;
      const dict = this._o.dictionary;
      this._window = dict && dict.length ? slice(dict, Math.max(0, dict.length - WINDOW_SIZE), dict.length) : new u8(0);
      this._pending = [];
      this._pendingLen = 0;
      this._carryByte = 0;
      this._carryBits = 0;
      this._done = !1;
    }
    DeflateStream.prototype._compressPending = function(final) {
      const window = this._window, input = new u8(window.length + this._pendingLen);
      input.set(window);
      let off = window.length;
      for (const chunk of this._pending) {
        input.set(chunk, off);
        off += chunk.length;
      }
      const result = compressBlocks(input, {
        start: window.length,
        level: this._level,
        lazy: this._o.lazy === !0,
        hashBits: resolveHashBits(this._o, input.length),
        final,
        carryByte: this._carryByte,
        carryBits: this._carryBits
      });
      this._carryByte = result.carryByte;
      this._carryBits = result.carryBits;
      this._window = input.length > WINDOW_SIZE ? slice(input, input.length - WINDOW_SIZE, input.length) : input;
      this._pending = [];
      this._pendingLen = 0;
      if (result.bytes.length > 0 || final)
        this.ondata(result.bytes, final);
    };
    DeflateStream.prototype.push = function(chunk, final) {
      final = !!final;
      if (!this.ondata)
        fail(5);
      if (this._done)
        fail(4);
      if (chunk && chunk.length) {
        this._pending.push(chunk);
        this._pendingLen += chunk.length;
      }
      if (final)
        this._done = !0;
      if (final || this._pendingLen >= STREAM_FLUSH_BYTES)
        this._compressPending(final);
    };
    DeflateStream.prototype.flush = function() {
      if (!this.ondata)
        fail(5);
      if (this._done)
        fail(4);
      this._compressPending(!1);
    };
    function InflateStream(opts, ondata) {
      if (typeof opts === "function") {
        ondata = opts;
        opts = {};
      }
      this.ondata = ondata;
      this._state = createInflateState((opts || {}).dictionary);
      initOutput(this._state, 0, void 0);
      this._pending = new u8(0);
      this._done = !1;
    }
    InflateStream.prototype._append = function(chunk) {
      if (!this._pending.length)
        this._pending = chunk;
      else if (chunk.length) {
        const merged = new u8(this._pending.length + chunk.length);
        merged.set(this._pending);
        merged.set(chunk, this._pending.length);
        this._pending = merged;
      }
    };
    InflateStream.prototype.push = function(chunk, final) {
      if (!this.ondata)
        fail(5);
      if (this._done)
        fail(4);
      final = !!final;
      this._append(chunk);
      const state = this._state, status = runInflate(state, this._pending, !0);
      if (final && status !== COMPLETE)
        fail(0);
      this._done = final;
      const produced = slice(state.out, state.emitted, state.outLen);
      state.emitted = state.outLen;
      this.ondata(produced, final);
      trimWindow(state);
      this._pending = slice(this._pending, state.bitPos >> 3);
      state.bitPos &= 7;
    };
    function deflateSync(data, opts = {}) {
      let input = data, start = 0;
      const dict = opts.dictionary;
      if (dict && dict.length) {
        const tail = dict.subarray(Math.max(0, dict.length - WINDOW_SIZE));
        input = new u8(tail.length + data.length);
        input.set(tail);
        input.set(data, tail.length);
        start = tail.length;
      }
      return compressBlocks(input, {
        start,
        level: clamp(opts.level ?? 6, 0, 9) | 0,
        lazy: opts.lazy === !0,
        hashBits: resolveHashBits(opts, input.length),
        final: !0,
        carryByte: 0,
        carryBits: 0
      }).bytes;
    }
    function inflateSync(data, opts = {}) {
      if (!data.length)
        return opts.out ? opts.out.subarray(0, 0) : new u8(0);
      const state = createInflateState(opts.dictionary), dictLen = state.dictionary ? state.dictionary.length : 0;
      initOutput(state, data.length, opts.out);
      runInflate(state, data, !1);
      if (state.fixedOut)
        return state.out.subarray(0, state.outLen);
      if (opts.out) {
        const produced = state.outLen - dictLen;
        if (produced > opts.out.length)
          fail(8, "output exceeds provided buffer");
        opts.out.set(state.out.subarray(dictLen, state.outLen));
        return opts.out.subarray(0, produced);
      }
      return slice(state.out, dictLen, state.outLen);
    }
    const _mt = typeof queueMicrotask === "function" ? queueMicrotask : (fn) => Promise.resolve().then(fn);
    function deflateAsync(data, opts = {}) {
      return new Promise((resolve, reject) => {
        _mt(() => {
          try {
            resolve(deflateSync(data, opts));
          } catch (e) {
            reject(e);
          }
        });
      });
    }
    function inflateAsync(data, opts = {}) {
      return new Promise((resolve, reject) => {
        _mt(() => {
          try {
            resolve(inflateSync(data, opts));
          } catch (e) {
            reject(e);
          }
        });
      });
    }
    return {
      deflateSync,
      inflateSync,
      deflate: deflateAsync,
      inflate: inflateAsync,
      DeflateStream,
      InflateStream
    };
  } });
    __register({ name: "zip", dependencies: ["deflate","crc32"], factory: function(deflateModule, Crc32) {
    const { deflateSync, inflateSync, DeflateStream } = deflateModule, _te = typeof TextEncoder < "u" && new TextEncoder, _td = typeof TextDecoder < "u" && new TextDecoder;
    function _strToU8(str) {
      if (_te)
        return _te.encode(str);
      const a = [];
      for (let i = 0;i < str.length; ++i) {
        let c = str.charCodeAt(i);
        if (c < 128)
          a.push(c);
        else if (c < 2048)
          a.push(192 | c >> 6, 128 | c & 63);
        else if (c > 55295 && c < 57344) {
          c = 65536 + ((c & 1023) << 10 | str.charCodeAt(++i) & 1023);
          a.push(240 | c >> 18, 128 | c >> 12 & 63, 128 | c >> 6 & 63, 128 | c & 63);
        } else
          a.push(224 | c >> 12, 128 | c >> 6 & 63, 128 | c & 63);
      }
      return new Uint8Array(a);
    }
    function _u8ToStr(d, utf8) {
      if (!utf8) {
        let r = "";
        for (let i = 0;i < d.length; i += 16384)
          r += String.fromCharCode(...d.subarray(i, i + 16384));
        return r;
      }
      if (_td)
        return _td.decode(d);
      let r = "";
      for (let i = 0;i < d.length; ) {
        const b = d[i++];
        if (b < 128)
          r += String.fromCharCode(b);
        else if (b < 224)
          r += String.fromCharCode((b & 31) << 6 | d[i++] & 63);
        else if (b < 240)
          r += String.fromCharCode((b & 15) << 12 | (d[i++] & 63) << 6 | d[i++] & 63);
        else {
          let cp = (b & 7) << 18 | (d[i++] & 63) << 12 | (d[i++] & 63) << 6 | d[i++] & 63;
          cp -= 65536;
          r += String.fromCharCode(55296 | cp >> 10, 56320 | cp & 1023);
        }
      }
      return r;
    }
    function _isUTF8(str) {
      for (let i = 0;i < str.length; ++i)
        if (str.charCodeAt(i) > 127)
          return !0;
      return !1;
    }
    function _r16(d, b) {
      return d[b] | d[b + 1] << 8;
    }
    function _r32(d, b) {
      return (d[b] | d[b + 1] << 8 | d[b + 2] << 16 | d[b + 3] << 24) >>> 0;
    }
    function _r64(d, b) {
      return _r32(d, b) + _r32(d, b + 4) * 4294967296;
    }
    function _w16(d, b, v) {
      d[b] = v & 255;
      d[b + 1] = v >> 8 & 255;
    }
    function _w32(d, b, v) {
      d[b] = v & 255;
      d[b + 1] = v >> 8 & 255;
      d[b + 2] = v >> 16 & 255;
      d[b + 3] = v >>> 24 & 255;
    }
    function _dosDateTime(mtime) {
      const d = new Date(mtime ?? Date.now()), y = d.getFullYear() - 1980;
      if (y < 0 || y > 119) {
        const e = Error("date not in range 1980-2099");
        e.code = 10;
        throw e;
      }
      return y << 25 | d.getMonth() + 1 << 21 | d.getDate() << 16 | d.getHours() << 11 | d.getMinutes() << 5 | d.getSeconds() >> 1;
    }
    function _dbf(l) {
      return l === 1 ? 3 : l < 6 ? 2 : l === 9 ? 1 : 0;
    }
    function _exfl(ex) {
      let le = 0;
      if (ex)
        for (const k in ex) {
          const l = ex[k].length;
          if (l > 65535) {
            const e = Error("extra field too long");
            e.code = 9;
            throw e;
          }
          le += l + 4;
        }
      return le;
    }
    function _writeExtra(d, b, ex) {
      if (!ex)
        return b;
      for (const k in ex) {
        const exf = ex[k];
        _w16(d, b, +k);
        _w16(d, b + 2, exf.length);
        d.set(exf, b + 4);
        b += 4 + exf.length;
      }
      return b;
    }
    function _localHeaderSize(fnLen, exLen) {
      return 30 + fnLen + exLen;
    }
    function _writeLocalHeader(d, b, fn, fnBytes, u, compression, dosTime, crc, cSize, uSize, ex) {
      _w32(d, b, 67324752);
      b += 4;
      d[b] = 20;
      b += 2;
      d[b] = compression < 0 && 8;
      d[b + 1] = u && 8;
      b += 2;
      _w16(d, b, compression & 65535);
      b += 2;
      _w32(d, b, dosTime);
      b += 4;
      if (compression >= 0) {
        _w32(d, b, crc);
        b += 4;
        _w32(d, b, cSize);
        b += 4;
        _w32(d, b, uSize);
        b += 4;
      } else
        b += 12;
      _w16(d, b, fnBytes.length);
      b += 2;
      _w16(d, b, _exfl(ex));
      b += 2;
      d.set(fnBytes, b);
      b += fnBytes.length;
      return _writeExtra(d, b, ex);
    }
    function _centralEntrySize(fnLen, exLen, comLen) {
      return 46 + fnLen + exLen + comLen;
    }
    function _writeCentralEntry(d, b, fnBytes, u, compression, dosTime, crc, cSize, uSize, localOffset, ex, comment) {
      _w32(d, b, 33639248);
      b += 4;
      d[b] = 20;
      d[b + 1] = 0;
      b += 2;
      d[b] = 20;
      b += 2;
      d[b] = _dbf(compression) << 1;
      d[b + 1] = u && 8;
      b += 2;
      _w16(d, b, compression < 0 ? 0 : compression & 65535);
      b += 2;
      _w32(d, b, dosTime);
      b += 4;
      _w32(d, b, crc);
      b += 4;
      _w32(d, b, compression < 0 ? -compression - 2 : cSize);
      b += 4;
      _w32(d, b, uSize);
      b += 4;
      _w16(d, b, fnBytes.length);
      b += 2;
      const exl = _exfl(ex);
      _w16(d, b, exl);
      b += 2;
      const coml = comment ? comment.length : 0;
      _w16(d, b, coml);
      b += 2;
      b += 2;
      b += 2;
      b += 4;
      _w32(d, b, localOffset);
      b += 4;
      d.set(fnBytes, b);
      b += fnBytes.length;
      b = _writeExtra(d, b, ex);
      if (comment) {
        d.set(comment, b);
        b += coml;
      }
      return b;
    }
    function _writeEOCD(o, b, entryCount, cdSize, cdOffset) {
      _w32(o, b, 101010256);
      b += 4;
      b += 4;
      _w16(o, b, entryCount);
      b += 2;
      _w16(o, b, entryCount);
      b += 2;
      _w32(o, b, cdSize);
      b += 4;
      _w32(o, b, cdOffset);
    }
    function _z64e(d, b) {
      while (_r16(d, b) !== 1)
        b += 4 + _r16(d, b + 2);
      return [_r64(d, b + 12), _r64(d, b + 4), _r64(d, b + 20)];
    }
    function _slzh(d, b) {
      return b + 30 + _r16(d, b + 26) + _r16(d, b + 28);
    }
    function _readCDE(d, b, zip64) {
      const fnl = _r16(d, b + 28), utf8 = (_r16(d, b + 8) & 2048) !== 0, fn = _u8ToStr(d.subarray(b + 46, b + 46 + fnl), utf8), es = b + 46 + fnl, bs = _r32(d, b + 20), [sc, su, off] = zip64 && bs === 4294967295 ? _z64e(d, es) : [bs, _r32(d, b + 24), _r32(d, b + 42)];
      return [_r16(d, b + 10), sc, su, fn, es + _r16(d, b + 30) + _r16(d, b + 32), off];
    }
    function _flatten(d, prefix, out, defaultOpts) {
      for (const k in d) {
        const val = d[k], name = prefix + k;
        let data = val, opts = defaultOpts;
        if (Array.isArray(val)) {
          opts = Object.assign({}, defaultOpts, val[1]);
          data = val[0];
        }
        if (data instanceof Uint8Array)
          out[name] = [data, opts];
        else {
          out[name + "/"] = [new Uint8Array(0), opts];
          _flatten(data, name + "/", out, defaultOpts);
        }
      }
    }
    function zipSync(files, opts = {}) {
      const flat = {};
      _flatten(files, "", flat, opts);
      const entries = [];
      let dataLen = 0, cdLen = 0;
      for (const fn in flat) {
        const [file, p] = flat[fn], compression = p.level === 0 ? 0 : 8, fnBytes = _strToU8(fn), fnLen = fnBytes.length;
        if (fnLen > 65535) {
          const e = Error("filename too long");
          e.code = 11;
          throw e;
        }
        const comBytes = p.comment ? _strToU8(p.comment) : null, exl = _exfl(p.extra), u = _isUTF8(fn) || comBytes && _isUTF8(p.comment), dosTime = _dosDateTime(p.mtime), crc = new Crc32;
        crc.append(file);
        const compressed = compression ? deflateSync(file, p) : file, cSize = compressed.length, uSize = file.length, crcVal = crc.get(), localHdrLen = _localHeaderSize(fnLen, exl);
        entries.push({
          fnBytes,
          u,
          compression,
          dosTime,
          crcVal,
          cSize,
          uSize,
          compressed,
          localHdrLen,
          p,
          comBytes,
          exl,
          localOffset: dataLen
        });
        dataLen += localHdrLen + cSize;
        cdLen += _centralEntrySize(fnLen, exl, comBytes ? comBytes.length : 0);
      }
      const out = new Uint8Array(dataLen + cdLen + 22);
      let pos = 0, cdPos = dataLen;
      for (const e of entries) {
        pos = _writeLocalHeader(out, pos, null, e.fnBytes, e.u, e.compression, e.dosTime, e.crcVal, e.cSize, e.uSize, e.p.extra);
        out.set(e.compressed, pos);
        pos += e.cSize;
        cdPos = _writeCentralEntry(out, cdPos, e.fnBytes, e.u, e.compression, e.dosTime, e.crcVal, e.cSize, e.uSize, e.localOffset, e.p.extra, e.comBytes);
      }
      _writeEOCD(out, cdPos, entries.length, cdLen, dataLen);
      return out;
    }
    function _isUnsafePath(name) {
      if (!name)
        return !1;
      if (name.charCodeAt(0) === 47)
        return !0;
      if (/^[A-Za-z]:[\\/]/.test(name))
        return !0;
      if (name.startsWith("\\\\"))
        return !0;
      const segs = name.split(/[\\/]/);
      for (const s of segs)
        if (s === "..")
          return !0;
      return !1;
    }
    function unzipSync(data, opts = {}) {
      const result = {}, safe = opts.safe !== !1;
      let e = data.length - 22;
      while (_r32(data, e) !== 101010256) {
        if (!e || data.length - e > 65558) {
          const err = Error("invalid zip data");
          err.code = 13;
          throw err;
        }
        --e;
      }
      let entryCount = _r16(data, e + 8);
      if (!entryCount)
        return result;
      let cdOffset = _r32(data, e + 16), zip64 = cdOffset === 4294967295 || entryCount === 65535;
      if (zip64) {
        const ze = _r32(data, e - 12);
        if (_r32(data, ze) === 101075792) {
          entryCount = _r32(data, ze + 32);
          cdOffset = _r64(data, ze + 48);
        }
      }
      const fltr = opts.filter;
      let o = cdOffset;
      for (let i = 0;i < entryCount; ++i) {
        const [cmp, cSize, uSize, fn, nextOff, localOff] = _readCDE(data, o, zip64);
        o = nextOff;
        const dataStart = _slzh(data, localOff);
        if (safe && _isUnsafePath(fn)) {
          const err = Error('zip-slip: unsafe entry path "' + fn + '"');
          err.code = 15;
          throw err;
        }
        if (fltr && !fltr({ name: fn, size: cSize, originalSize: uSize, compression: cmp }))
          continue;
        if (cmp === 0)
          result[fn] = new Uint8Array(data.subarray(dataStart, dataStart + cSize));
        else if (cmp === 8)
          result[fn] = inflateSync(data.subarray(dataStart, dataStart + cSize), {
            out: new Uint8Array(uSize)
          });
        else {
          const err = Error("unknown compression type " + cmp);
          err.code = 14;
          throw err;
        }
      }
      return result;
    }
    function _writeLocalHeaderDD(d, b, fnBytes, u, method, dosTime, ex) {
      _w32(d, b, 67324752);
      b += 4;
      d[b] = 20;
      b += 2;
      d[b] = 8;
      d[b + 1] = u ? 8 : 0;
      b += 2;
      _w16(d, b, method);
      b += 2;
      _w32(d, b, dosTime);
      b += 4;
      b += 12;
      _w16(d, b, fnBytes.length);
      b += 2;
      _w16(d, b, _exfl(ex));
      b += 2;
      d.set(fnBytes, b);
      b += fnBytes.length;
      return _writeExtra(d, b, ex);
    }
    function _writeDataDescriptor(d, b, crc, cSize, uSize) {
      _w32(d, b, 134695760);
      b += 4;
      _w32(d, b, crc);
      b += 4;
      _w32(d, b, cSize);
      b += 4;
      _w32(d, b, uSize);
      b += 4;
      return b;
    }
    function ZipStream(opts, ondata) {
      if (typeof opts === "function") {
        ondata = opts;
        opts = {};
      }
      this.ondata = ondata || null;
      this._opts = opts || {};
      this._off = 0;
      this._entries = [];
      this._active = null;
    }
    ZipStream.prototype._emit = function(chunk, final) {
      this._off += chunk.length;
      if (this.ondata)
        this.ondata(chunk, !!final);
    };
    ZipStream.prototype.add = function(name, data, opts) {
      if (this._active)
        throw Error("ZipStream: an entry is still open");
      if (Array.isArray(data)) {
        opts = Object.assign({}, data[1], opts);
        data = data[0];
      }
      const p = Object.assign({}, this._opts, opts), fnBytes = _strToU8(name);
      if (fnBytes.length > 65535) {
        const e = Error("filename too long");
        e.code = 11;
        throw e;
      }
      const u = _isUTF8(name), method = p.level === 0 ? 0 : 8, dosTime = _dosDateTime(p.mtime), exl = _exfl(p.extra), localHdrLen = _localHeaderSize(fnBytes.length, exl), localOffset = this._off, crc = new Crc32;
      crc.append(data);
      const crcVal = crc.get(), compressed = method ? deflateSync(data, p) : data, cSize = compressed.length, uSize = data.length, out = new Uint8Array(localHdrLen + cSize);
      _writeLocalHeader(out, 0, null, fnBytes, u, method, dosTime, crcVal, cSize, uSize, p.extra);
      out.set(compressed, localHdrLen);
      this._emit(out, !1);
      const comBytes = p.comment ? _strToU8(p.comment) : null;
      this._entries.push({ fnBytes, u, method, dosTime, crcVal, cSize, uSize, localOffset, extra: p.extra, comBytes });
    };
    ZipStream.prototype.openEntry = function(name, opts) {
      if (this._active)
        throw Error("ZipStream: an entry is still open");
      const p = Object.assign({}, this._opts, opts), fnBytes = _strToU8(name);
      if (fnBytes.length > 65535) {
        const e = Error("filename too long");
        e.code = 11;
        throw e;
      }
      const u = _isUTF8(name), method = p.level === 0 ? 0 : 8, dosTime = _dosDateTime(p.mtime), exl = _exfl(p.extra), localHdrLen = _localHeaderSize(fnBytes.length, exl), localOffset = this._off, hdr = new Uint8Array(localHdrLen);
      _writeLocalHeaderDD(hdr, 0, fnBytes, u, method, dosTime, p.extra);
      this._emit(hdr, !1);
      const crc = new Crc32;
      let cSize = 0, uSize = 0;
      const self = this, comBytes = p.comment ? _strToU8(p.comment) : null;
      let ds = null;
      if (method === 8)
        ds = new DeflateStream(p, function(chunk, dfinal) {
          cSize += chunk.length;
          self._emit(chunk, !1);
          if (dfinal) {
            const dd = new Uint8Array(16);
            _writeDataDescriptor(dd, 0, crc.get(), cSize, uSize);
            self._emit(dd, !1);
            self._entries.push({ fnBytes, u, method, dosTime, crcVal: crc.get(), cSize, uSize, localOffset, extra: p.extra, comBytes });
            self._active = null;
          }
        });
      const state = { done: !1 };
      this._active = state;
      return {
        push(chunk, final) {
          if (state.done)
            throw Error("ZipStream entry already finalized");
          final = !!final;
          crc.append(chunk);
          uSize += chunk.length;
          if (method === 0) {
            cSize += chunk.length;
            self._emit(chunk, !1);
            if (final) {
              const dd = new Uint8Array(16);
              _writeDataDescriptor(dd, 0, crc.get(), cSize, uSize);
              self._emit(dd, !1);
              self._entries.push({ fnBytes, u, method, dosTime, crcVal: crc.get(), cSize, uSize, localOffset, extra: p.extra, comBytes });
              self._active = null;
              state.done = !0;
            }
          } else {
            ds.push(chunk, final);
            if (final)
              state.done = !0;
          }
        }
      };
    };
    ZipStream.prototype.finalize = function() {
      if (this._active)
        throw Error("ZipStream: an entry is still open");
      const cdOffset = this._off;
      let cdLen = 0;
      for (const e of this._entries)
        cdLen += _centralEntrySize(e.fnBytes.length, _exfl(e.extra), e.comBytes ? e.comBytes.length : 0);
      const out = new Uint8Array(cdLen + 22);
      let pos = 0;
      for (const e of this._entries)
        pos = _writeCentralEntry(out, pos, e.fnBytes, e.u, e.method, e.dosTime, e.crcVal, e.cSize, e.uSize, e.localOffset, e.extra, e.comBytes);
      _writeEOCD(out, pos, this._entries.length, cdLen, cdOffset);
      this._emit(out, !0);
    };
    function ZipStreamReader(opts, onfile) {
      if (typeof opts === "function") {
        onfile = opts;
        opts = {};
      }
      this.onfile = onfile || null;
      this._opts = opts || {};
      this._buf = [];
      this._bufLen = 0;
    }
    ZipStreamReader.prototype.push = function(chunk, final) {
      this._buf.push(chunk);
      this._bufLen += chunk.length;
      if (!final)
        return;
      const combined = new Uint8Array(this._bufLen);
      let off = 0;
      for (const c of this._buf) {
        combined.set(c, off);
        off += c.length;
      }
      this._buf = null;
      const files = unzipSync(combined, this._opts);
      if (this.onfile) {
        const names = Object.keys(files);
        for (let i = 0;i < names.length; ++i)
          this.onfile(names[i], files[names[i]], i === names.length - 1);
      }
    };
    const _mt = typeof queueMicrotask === "function" ? queueMicrotask : (fn) => Promise.resolve().then(fn);
    function zipAsync(files, opts = {}) {
      return new Promise((resolve, reject) => {
        _mt(() => {
          try {
            resolve(zipSync(files, opts));
          } catch (e) {
            reject(e);
          }
        });
      });
    }
    function unzipAsync(data, opts = {}) {
      return new Promise((resolve, reject) => {
        _mt(() => {
          try {
            resolve(unzipSync(data, opts));
          } catch (e) {
            reject(e);
          }
        });
      });
    }
    return {
      zipSync,
      unzipSync,
      zip: zipAsync,
      unzip: unzipAsync,
      ZipStream,
      ZipStreamReader
    };
  } });
    __register({ name: "crc32", dependencies: [], factory: function() {
    const table = new Uint32Array(256);
    for (let i = 0;i < 256; i++) {
      let t = i;
      for (let j = 0;j < 8; j++)
        if (t & 1)
          t = t >>> 1 ^ 3988292384;
        else
          t = t >>> 1;
      table[i] = t;
    }
    function Crc32() {
      this.crc = -1;
    }
    Crc32.prototype.append = function(data) {
      let crc = this.crc | 0;
      for (let offset = 0, length = data.length | 0;offset < length; offset++)
        crc = crc >>> 8 ^ table[(crc ^ data[offset]) & 255];
      this.crc = crc;
    };
    Crc32.prototype.get = function() {
      return ~this.crc >>> 0;
    };
    return Crc32;
  } });

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
    __register({ name: "wmlRunFormatting", dependencies: ["xml","docxProperties"], factory: function(xml, core) {
    function readToggle(el) {
      return core.readToggle(el);
    }
    function writeToggle(name, value) {
      return core.writeToggle(name, value);
    }
    function valOf(el) {
      return core.valOf(el);
    }
    function elVal(name, val) {
      return core.elVal(name, val);
    }
    function parseLang(el) {
      const out = {};
      if (el.attrs["w:val"])
        out.val = el.attrs["w:val"];
      if (el.attrs["w:eastAsia"])
        out.eastAsia = el.attrs["w:eastAsia"];
      if (el.attrs["w:bidi"])
        out.bidi = el.attrs["w:bidi"];
      return Object.keys(out).length ? out : void 0;
    }
    function renderLang(lang) {
      if (!lang)
        return null;
      const a = {};
      if (lang.val != null)
        a["w:val"] = lang.val;
      if (lang.eastAsia != null)
        a["w:eastAsia"] = lang.eastAsia;
      if (lang.bidi != null)
        a["w:bidi"] = lang.bidi;
      return xml.el("w:lang", a);
    }
    function parseShd(el) {
      const out = {};
      if (el.attrs["w:val"])
        out.pattern = el.attrs["w:val"];
      if (el.attrs["w:color"])
        out.color = el.attrs["w:color"];
      if (el.attrs["w:fill"])
        out.fill = el.attrs["w:fill"];
      return Object.keys(out).length ? out : void 0;
    }
    function renderShd(shd) {
      if (!shd)
        return null;
      const a = {};
      if (shd.pattern != null)
        a["w:val"] = shd.pattern;
      if (shd.color != null)
        a["w:color"] = shd.color;
      if (shd.fill != null)
        a["w:fill"] = shd.fill;
      return xml.el("w:shd", a);
    }
    function parseFitText(el) {
      const out = {};
      if (el.attrs["w:val"])
        out.val = Number(el.attrs["w:val"]);
      if (el.attrs["w:id"])
        out.id = Number(el.attrs["w:id"]);
      return Object.keys(out).length ? out : void 0;
    }
    function renderFitText(ft) {
      if (!ft)
        return null;
      const a = {};
      if (ft.val != null)
        a["w:val"] = String(ft.val);
      if (ft.id != null)
        a["w:id"] = String(ft.id);
      return xml.el("w:fitText", a);
    }
    const EAL_ATTRS = ["id", "combine", "combineBrackets", "vert", "vertCompress"];
    function parseEastAsianLayout(el) {
      const out = {};
      for (const a of EAL_ATTRS)
        if (el.attrs["w:" + a] != null)
          out[a] = el.attrs["w:" + a];
      return Object.keys(out).length ? out : void 0;
    }
    function renderEastAsianLayout(eal) {
      if (!eal)
        return null;
      const a = {};
      for (const k of EAL_ATTRS)
        if (eal[k] != null)
          a["w:" + k] = String(eal[k]);
      return xml.el("w:eastAsianLayout", a);
    }
    function parseStylisticSets(el) {
      const sets = [];
      for (const c of el.children) {
        if (c.type !== "element")
          continue;
        if (c.name === "w:styleSet") {
          if (c.attrs["w:id"])
            sets.push(Number(c.attrs["w:id"]));
        }
      }
      return sets.length ? sets : void 0;
    }
    function renderStylisticSets(sets) {
      if (!sets || !sets.length)
        return null;
      const kids = sets.map((id) => xml.el("w:styleSet", { "w:id": String(id) }));
      return xml.el("w:stylisticSets", {}, kids);
    }
    function hydrate(rPr) {
      if (!rPr || !rPr._extras)
        return rPr;
      const remaining = [];
      for (const c of rPr._extras) {
        if (c.type !== "element") {
          remaining.push(c);
          continue;
        }
        switch (c.name) {
          case "w:caps":
            rPr.caps = readToggle(c);
            break;
          case "w:smallCaps":
            rPr.smallCaps = readToggle(c);
            break;
          case "w:vanish":
            rPr.vanish = readToggle(c);
            break;
          case "w:specVanish":
            rPr.specVanish = readToggle(c);
            break;
          case "w:outline":
            rPr.outline = readToggle(c);
            break;
          case "w:emboss":
            rPr.emboss = readToggle(c);
            break;
          case "w:imprint":
            rPr.imprint = readToggle(c);
            break;
          case "w:shadow":
            rPr.shadow = readToggle(c);
            break;
          case "w:noProof":
            rPr.noProof = readToggle(c);
            break;
          case "w:webHidden":
            rPr.webHidden = readToggle(c);
            break;
          case "w:snapToGrid":
            rPr.snapToGrid = readToggle(c);
            break;
          case "w:cs":
            rPr.cs = readToggle(c);
            break;
          case "w:bCs":
            rPr.bCs = readToggle(c);
            break;
          case "w:iCs":
            rPr.iCs = readToggle(c);
            break;
          case "w:dstrike":
            rPr.dstrike = readToggle(c);
            break;
          case "w:oMath":
            rPr.oMath = readToggle(c);
            break;
          case "w:cntxtAlts":
            rPr.cntxtAlts = readToggle(c);
            break;
          case "w:kern":
            rPr.kern = Number(c.attrs["w:val"]);
            break;
          case "w:position":
            rPr.position = c.attrs["w:val"];
            break;
          case "w:szCs":
            rPr.szCs = Number(c.attrs["w:val"]);
            break;
          case "w:w":
            rPr.scale = Number(c.attrs["w:val"]);
            break;
          case "w:em":
            rPr.em = c.attrs["w:val"];
            break;
          case "w:effect":
            rPr.effect = c.attrs["w:val"];
            break;
          case "w:ligatures":
            rPr.ligatures = c.attrs["w:val"];
            break;
          case "w:numForm":
            rPr.numForm = c.attrs["w:val"];
            break;
          case "w:numSpacing":
            rPr.numSpacing = c.attrs["w:val"];
            break;
          case "w:lang": {
            const v = parseLang(c);
            if (v)
              rPr.lang = v;
            break;
          }
          case "w:shd": {
            const v = parseShd(c);
            if (v)
              rPr.shd = v;
            break;
          }
          case "w:fitText": {
            const v = parseFitText(c);
            if (v)
              rPr.fitText = v;
            break;
          }
          case "w:eastAsianLayout": {
            const v = parseEastAsianLayout(c);
            if (v)
              rPr.eastAsianLayout = v;
            break;
          }
          case "w:stylisticSets": {
            const v = parseStylisticSets(c);
            if (v)
              rPr.stylisticSets = v;
            break;
          }
          default:
            remaining.push(c);
        }
      }
      if (remaining.length)
        rPr._extras = remaining;
      else
        delete rPr._extras;
      return rPr;
    }
    function dehydrate(rPr) {
      if (!rPr)
        return rPr;
      const out = { ...rPr }, extras = out._extras ? [...out._extras] : [], toggleAttrs = (v) => v === !1 ? { "w:val": "0" } : {};
      if (out.caps !== void 0) {
        extras.push(xml.el("w:caps", toggleAttrs(out.caps)));
        delete out.caps;
      }
      if (out.smallCaps !== void 0) {
        extras.push(xml.el("w:smallCaps", toggleAttrs(out.smallCaps)));
        delete out.smallCaps;
      }
      if (out.vanish !== void 0) {
        extras.push(xml.el("w:vanish", toggleAttrs(out.vanish)));
        delete out.vanish;
      }
      if (out.specVanish !== void 0) {
        extras.push(xml.el("w:specVanish", toggleAttrs(out.specVanish)));
        delete out.specVanish;
      }
      if (out.outline !== void 0) {
        extras.push(xml.el("w:outline", toggleAttrs(out.outline)));
        delete out.outline;
      }
      if (out.emboss !== void 0) {
        extras.push(xml.el("w:emboss", toggleAttrs(out.emboss)));
        delete out.emboss;
      }
      if (out.imprint !== void 0) {
        extras.push(xml.el("w:imprint", toggleAttrs(out.imprint)));
        delete out.imprint;
      }
      if (out.shadow !== void 0) {
        extras.push(xml.el("w:shadow", toggleAttrs(out.shadow)));
        delete out.shadow;
      }
      if (out.noProof !== void 0) {
        extras.push(xml.el("w:noProof", toggleAttrs(out.noProof)));
        delete out.noProof;
      }
      if (out.webHidden !== void 0) {
        extras.push(xml.el("w:webHidden", toggleAttrs(out.webHidden)));
        delete out.webHidden;
      }
      if (out.snapToGrid !== void 0) {
        extras.push(xml.el("w:snapToGrid", toggleAttrs(out.snapToGrid)));
        delete out.snapToGrid;
      }
      if (out.cs !== void 0) {
        extras.push(xml.el("w:cs", toggleAttrs(out.cs)));
        delete out.cs;
      }
      if (out.bCs !== void 0) {
        extras.push(xml.el("w:bCs", toggleAttrs(out.bCs)));
        delete out.bCs;
      }
      if (out.iCs !== void 0) {
        extras.push(xml.el("w:iCs", toggleAttrs(out.iCs)));
        delete out.iCs;
      }
      if (out.dstrike !== void 0) {
        extras.push(xml.el("w:dstrike", toggleAttrs(out.dstrike)));
        delete out.dstrike;
      }
      if (out.oMath !== void 0) {
        extras.push(xml.el("w:oMath", toggleAttrs(out.oMath)));
        delete out.oMath;
      }
      if (out.cntxtAlts !== void 0) {
        extras.push(xml.el("w:cntxtAlts", toggleAttrs(out.cntxtAlts)));
        delete out.cntxtAlts;
      }
      if (out.kern != null) {
        extras.push(xml.el("w:kern", { "w:val": String(out.kern) }));
        delete out.kern;
      }
      if (out.position != null) {
        extras.push(xml.el("w:position", { "w:val": String(out.position) }));
        delete out.position;
      }
      if (out.szCs != null) {
        extras.push(xml.el("w:szCs", { "w:val": String(out.szCs) }));
        delete out.szCs;
      }
      if (out.scale != null) {
        extras.push(xml.el("w:w", { "w:val": String(out.scale) }));
        delete out.scale;
      }
      if (out.em != null) {
        extras.push(xml.el("w:em", { "w:val": String(out.em) }));
        delete out.em;
      }
      if (out.effect != null) {
        extras.push(xml.el("w:effect", { "w:val": String(out.effect) }));
        delete out.effect;
      }
      if (out.ligatures != null) {
        extras.push(xml.el("w:ligatures", { "w:val": String(out.ligatures) }));
        delete out.ligatures;
      }
      if (out.numForm != null) {
        extras.push(xml.el("w:numForm", { "w:val": String(out.numForm) }));
        delete out.numForm;
      }
      if (out.numSpacing != null) {
        extras.push(xml.el("w:numSpacing", { "w:val": String(out.numSpacing) }));
        delete out.numSpacing;
      }
      if (out.lang) {
        extras.push(renderLang(out.lang));
        delete out.lang;
      }
      if (out.shd) {
        extras.push(renderShd(out.shd));
        delete out.shd;
      }
      if (out.fitText) {
        extras.push(renderFitText(out.fitText));
        delete out.fitText;
      }
      if (out.eastAsianLayout) {
        extras.push(renderEastAsianLayout(out.eastAsianLayout));
        delete out.eastAsianLayout;
      }
      if (out.stylisticSets) {
        extras.push(renderStylisticSets(out.stylisticSets));
        delete out.stylisticSets;
      }
      if (extras.length)
        out._extras = extras;
      return out;
    }
    function parseRunProperties(rPrEl) {
      const rPr = core.parseRunProperties(rPrEl);
      return hydrate(rPr);
    }
    function renderRunProperties(rPr) {
      return core.renderRunProperties(dehydrate(rPr));
    }
    function parseParagraphProperties(pPrEl) {
      const pPr = core.parseParagraphProperties(pPrEl);
      if (pPr && pPr.rPr)
        hydrate(pPr.rPr);
      return pPr;
    }
    function renderParagraphProperties(pPr) {
      if (!pPr)
        return null;
      const clone = { ...pPr };
      if (clone.rPr)
        clone.rPr = dehydrate(clone.rPr);
      return core.renderParagraphProperties(clone);
    }
    return {
      parseRunProperties,
      renderRunProperties,
      parseParagraphProperties,
      renderParagraphProperties,
      hydrate,
      dehydrate,
      hydrateRunProperties: hydrate,
      dehydrateRunProperties: dehydrate,
      readToggle,
      writeToggle,
      valOf,
      elVal
    };
  } });
    __register({ name: "wmlParagraphFormatting", dependencies: ["xml","docxProperties"], factory: function(xml, core) {
    function parseTabs(el) {
      const tabs = [];
      for (const c of el.children) {
        if (c.type !== "element")
          continue;
        if (c.name === "w:tab") {
          const t = {};
          if (c.attrs["w:val"])
            t.val = c.attrs["w:val"];
          if (c.attrs["w:pos"])
            t.pos = Number(c.attrs["w:pos"]);
          if (c.attrs["w:leader"])
            t.leader = c.attrs["w:leader"];
          tabs.push(t);
        }
      }
      return tabs.length ? tabs : void 0;
    }
    function renderTabs(tabs) {
      if (!tabs || !tabs.length)
        return null;
      const kids = tabs.map((t) => {
        const a = {};
        if (t.val != null)
          a["w:val"] = String(t.val);
        if (t.pos != null)
          a["w:pos"] = String(t.pos);
        if (t.leader != null)
          a["w:leader"] = String(t.leader);
        return xml.el("w:tab", a);
      });
      return xml.el("w:tabs", {}, kids);
    }
    const FRAME_ATTRS = [
      "w",
      "h",
      "hSpace",
      "vSpace",
      "x",
      "y",
      "wrap",
      "hAnchor",
      "vAnchor",
      "xAlign",
      "yAlign",
      "hRule",
      "anchorLock",
      "lines",
      "dropCap"
    ];
    function parseFramePr(el) {
      const out = {};
      for (const a of FRAME_ATTRS)
        if (el.attrs["w:" + a] != null)
          out[a] = el.attrs["w:" + a];
      return Object.keys(out).length ? out : void 0;
    }
    function renderFramePr(fp) {
      if (!fp)
        return null;
      const a = {};
      for (const k of FRAME_ATTRS)
        if (fp[k] != null)
          a["w:" + k] = String(fp[k]);
      return xml.el("w:framePr", a);
    }
    function hydrate(pPr) {
      if (!pPr || !pPr._extras)
        return pPr;
      const remaining = [];
      for (const c of pPr._extras) {
        if (c.type !== "element") {
          remaining.push(c);
          continue;
        }
        switch (c.name) {
          case "w:widowControl":
            pPr.widowControl = core.readToggle(c);
            break;
          case "w:adjustRightInd":
            pPr.adjustRightInd = core.readToggle(c);
            break;
          case "w:snapToGrid":
            pPr.snapToGrid = core.readToggle(c);
            break;
          case "w:contextualSpacing":
            pPr.contextualSpacing = core.readToggle(c);
            break;
          case "w:mirrorIndents":
            pPr.mirrorIndents = core.readToggle(c);
            break;
          case "w:suppressAutoHyphens":
            pPr.suppressAutoHyphens = core.readToggle(c);
            break;
          case "w:kinsoku":
            pPr.kinsoku = core.readToggle(c);
            break;
          case "w:wordWrap":
            pPr.wordWrap = core.readToggle(c);
            break;
          case "w:overflowPunct":
            pPr.overflowPunct = core.readToggle(c);
            break;
          case "w:topLinePunct":
            pPr.topLinePunct = core.readToggle(c);
            break;
          case "w:autoSpaceDE":
            pPr.autoSpaceDE = core.readToggle(c);
            break;
          case "w:autoSpaceDN":
            pPr.autoSpaceDN = core.readToggle(c);
            break;
          case "w:bidi":
            pPr.bidi = core.readToggle(c);
            break;
          case "w:keepNext":
            pPr.keepNext = core.readToggle(c);
            break;
          case "w:keepLines":
            pPr.keepLines = core.readToggle(c);
            break;
          case "w:pageBreakBefore":
            pPr.pageBreakBefore = core.readToggle(c);
            break;
          case "w:suppressLineNumbers":
            pPr.suppressLineNumbers = core.readToggle(c);
            break;
          case "w:suppressOverlap":
            pPr.suppressOverlap = core.readToggle(c);
            break;
          case "w:outlineLvl":
            pPr.outlineLvl = Number(c.attrs["w:val"]);
            break;
          case "w:divId":
            pPr.divId = c.attrs["w:val"];
            break;
          case "w:textAlignment":
            pPr.textAlignment = c.attrs["w:val"];
            break;
          case "w:textDirection":
            pPr.textDirection = c.attrs["w:val"];
            break;
          case "w:textboxTightWrap":
            pPr.textboxTightWrap = c.attrs["w:val"];
            break;
          case "w:cnfStyle":
            pPr.cnfStyle = c.attrs["w:val"];
            break;
          case "w:tabs": {
            const v = parseTabs(c);
            if (v)
              pPr.tabs = v;
            break;
          }
          case "w:framePr": {
            const v = parseFramePr(c);
            if (v)
              pPr.framePr = v;
            break;
          }
          default:
            remaining.push(c);
        }
      }
      if (remaining.length)
        pPr._extras = remaining;
      else
        delete pPr._extras;
      return pPr;
    }
    function dehydrate(pPr) {
      if (!pPr)
        return pPr;
      const out = { ...pPr }, extras = out._extras ? [...out._extras] : [], tA = (v) => v === !1 ? { "w:val": "0" } : {};
      if (out.widowControl !== void 0) {
        extras.push(xml.el("w:widowControl", tA(out.widowControl)));
        delete out.widowControl;
      }
      if (out.adjustRightInd !== void 0) {
        extras.push(xml.el("w:adjustRightInd", tA(out.adjustRightInd)));
        delete out.adjustRightInd;
      }
      if (out.snapToGrid !== void 0) {
        extras.push(xml.el("w:snapToGrid", tA(out.snapToGrid)));
        delete out.snapToGrid;
      }
      if (out.contextualSpacing !== void 0) {
        extras.push(xml.el("w:contextualSpacing", tA(out.contextualSpacing)));
        delete out.contextualSpacing;
      }
      if (out.mirrorIndents !== void 0) {
        extras.push(xml.el("w:mirrorIndents", tA(out.mirrorIndents)));
        delete out.mirrorIndents;
      }
      if (out.suppressAutoHyphens !== void 0) {
        extras.push(xml.el("w:suppressAutoHyphens", tA(out.suppressAutoHyphens)));
        delete out.suppressAutoHyphens;
      }
      if (out.kinsoku !== void 0) {
        extras.push(xml.el("w:kinsoku", tA(out.kinsoku)));
        delete out.kinsoku;
      }
      if (out.wordWrap !== void 0) {
        extras.push(xml.el("w:wordWrap", tA(out.wordWrap)));
        delete out.wordWrap;
      }
      if (out.overflowPunct !== void 0) {
        extras.push(xml.el("w:overflowPunct", tA(out.overflowPunct)));
        delete out.overflowPunct;
      }
      if (out.topLinePunct !== void 0) {
        extras.push(xml.el("w:topLinePunct", tA(out.topLinePunct)));
        delete out.topLinePunct;
      }
      if (out.autoSpaceDE !== void 0) {
        extras.push(xml.el("w:autoSpaceDE", tA(out.autoSpaceDE)));
        delete out.autoSpaceDE;
      }
      if (out.autoSpaceDN !== void 0) {
        extras.push(xml.el("w:autoSpaceDN", tA(out.autoSpaceDN)));
        delete out.autoSpaceDN;
      }
      if (out.bidi !== void 0) {
        extras.push(xml.el("w:bidi", tA(out.bidi)));
        delete out.bidi;
      }
      if (out.keepNext !== void 0) {
        extras.push(xml.el("w:keepNext", tA(out.keepNext)));
        delete out.keepNext;
      }
      if (out.keepLines !== void 0) {
        extras.push(xml.el("w:keepLines", tA(out.keepLines)));
        delete out.keepLines;
      }
      if (out.pageBreakBefore !== void 0) {
        extras.push(xml.el("w:pageBreakBefore", tA(out.pageBreakBefore)));
        delete out.pageBreakBefore;
      }
      if (out.suppressLineNumbers !== void 0) {
        extras.push(xml.el("w:suppressLineNumbers", tA(out.suppressLineNumbers)));
        delete out.suppressLineNumbers;
      }
      if (out.suppressOverlap !== void 0) {
        extras.push(xml.el("w:suppressOverlap", tA(out.suppressOverlap)));
        delete out.suppressOverlap;
      }
      if (out.outlineLvl != null) {
        extras.push(xml.el("w:outlineLvl", { "w:val": String(out.outlineLvl) }));
        delete out.outlineLvl;
      }
      if (out.divId != null) {
        extras.push(xml.el("w:divId", { "w:val": String(out.divId) }));
        delete out.divId;
      }
      if (out.textAlignment != null) {
        extras.push(xml.el("w:textAlignment", { "w:val": String(out.textAlignment) }));
        delete out.textAlignment;
      }
      if (out.textDirection != null) {
        extras.push(xml.el("w:textDirection", { "w:val": String(out.textDirection) }));
        delete out.textDirection;
      }
      if (out.textboxTightWrap != null) {
        extras.push(xml.el("w:textboxTightWrap", { "w:val": String(out.textboxTightWrap) }));
        delete out.textboxTightWrap;
      }
      if (out.cnfStyle != null) {
        extras.push(xml.el("w:cnfStyle", { "w:val": String(out.cnfStyle) }));
        delete out.cnfStyle;
      }
      if (out.tabs) {
        extras.push(renderTabs(out.tabs));
        delete out.tabs;
      }
      if (out.framePr) {
        extras.push(renderFramePr(out.framePr));
        delete out.framePr;
      }
      if (extras.length)
        out._extras = extras;
      return out;
    }
    function parseParagraphProperties(pPrEl) {
      return hydrate(core.parseParagraphProperties(pPrEl));
    }
    function renderParagraphProperties(pPr) {
      return core.renderParagraphProperties(dehydrate(pPr));
    }
    return {
      parseParagraphProperties,
      renderParagraphProperties,
      hydrate,
      dehydrate,
      hydrateParagraphProperties: hydrate,
      dehydrateParagraphProperties: dehydrate,
      parseTabs,
      renderTabs,
      parseFramePr,
      renderFramePr
    };
  } });
    __register({ name: "wmlTableProperties", dependencies: ["xml","docxProperties"], factory: function(xml, core) {
    function widthAttrs(w) {
      const a = {};
      if (w.w != null)
        a["w:w"] = String(w.w);
      if (w.type != null)
        a["w:type"] = w.type;
      return a;
    }
    function parseWidth(el) {
      const w = {};
      if (el.attrs["w:w"] != null)
        w.w = el.attrs["w:w"];
      if (el.attrs["w:type"] != null)
        w.type = el.attrs["w:type"];
      return Object.keys(w).length ? w : void 0;
    }
    const BORDER_ATTRS = ["val", "sz", "space", "color", "shadow", "frame", "themeColor"];
    function readBorderSide(c) {
      const b = {};
      for (const a of BORDER_ATTRS)
        if (c.attrs["w:" + a] != null)
          b[a] = c.attrs["w:" + a];
      const known = new Set(BORDER_ATTRS.map((a) => "w:" + a)), extraAttrs = {};
      let any = !1;
      for (const k of Object.keys(c.attrs))
        if (!known.has(k)) {
          extraAttrs[k] = c.attrs[k];
          any = !0;
        }
      if (any)
        b.extraAttrs = extraAttrs;
      return Object.keys(b).length ? b : void 0;
    }
    function parseBorders(el) {
      const out = {};
      for (const c of el.children) {
        if (c.type !== "element")
          continue;
        switch (c.name) {
          case "w:top": {
            const v = readBorderSide(c);
            if (v)
              out.top = v;
            break;
          }
          case "w:left": {
            const v = readBorderSide(c);
            if (v)
              out.left = v;
            break;
          }
          case "w:bottom": {
            const v = readBorderSide(c);
            if (v)
              out.bottom = v;
            break;
          }
          case "w:right": {
            const v = readBorderSide(c);
            if (v)
              out.right = v;
            break;
          }
          case "w:insideH": {
            const v = readBorderSide(c);
            if (v)
              out.insideH = v;
            break;
          }
          case "w:insideV": {
            const v = readBorderSide(c);
            if (v)
              out.insideV = v;
            break;
          }
          case "w:tl2br": {
            const v = readBorderSide(c);
            if (v)
              out.tl2br = v;
            break;
          }
          case "w:tr2bl": {
            const v = readBorderSide(c);
            if (v)
              out.tr2bl = v;
            break;
          }
          case "w:start": {
            const v = readBorderSide(c);
            if (v)
              out.start = v;
            break;
          }
          case "w:end": {
            const v = readBorderSide(c);
            if (v)
              out.end = v;
            break;
          }
        }
      }
      return Object.keys(out).length ? out : void 0;
    }
    function borderSideAttrs(b) {
      const a = {};
      for (const k of BORDER_ATTRS)
        if (b[k] != null)
          a["w:" + k] = String(b[k]);
      if (b.extraAttrs) {
        const known = new Set(BORDER_ATTRS.map((x) => "w:" + x));
        for (const k of Object.keys(b.extraAttrs))
          if (!known.has(k) && b.extraAttrs[k] !== void 0)
            a[k] = String(b.extraAttrs[k]);
      }
      return a;
    }
    function bordersChildren(b) {
      const kids = [];
      if (b.top)
        kids.push(xml.el("w:top", borderSideAttrs(b.top)));
      if (b.left)
        kids.push(xml.el("w:left", borderSideAttrs(b.left)));
      if (b.bottom)
        kids.push(xml.el("w:bottom", borderSideAttrs(b.bottom)));
      if (b.right)
        kids.push(xml.el("w:right", borderSideAttrs(b.right)));
      if (b.insideH)
        kids.push(xml.el("w:insideH", borderSideAttrs(b.insideH)));
      if (b.insideV)
        kids.push(xml.el("w:insideV", borderSideAttrs(b.insideV)));
      if (b.tl2br)
        kids.push(xml.el("w:tl2br", borderSideAttrs(b.tl2br)));
      if (b.tr2bl)
        kids.push(xml.el("w:tr2bl", borderSideAttrs(b.tr2bl)));
      if (b.start)
        kids.push(xml.el("w:start", borderSideAttrs(b.start)));
      if (b.end)
        kids.push(xml.el("w:end", borderSideAttrs(b.end)));
      if (b._extras)
        for (const ex of b._extras)
          kids.push(ex);
      return kids;
    }
    function renderBorders(parentName, b) {
      if (!b)
        return null;
      const kids = bordersChildren(b);
      if (!kids.length)
        return null;
      if (parentName === "w:tblBorders")
        return xml.el("w:tblBorders", {}, kids);
      if (parentName === "w:tcBorders")
        return xml.el("w:tcBorders", {}, kids);
      if (parentName === "w:pBdr")
        return xml.el("w:pBdr", {}, kids);
      return xml.el(parentName, {}, kids);
    }
    function parseMargins(el) {
      const out = {};
      for (const c of el.children) {
        if (c.type !== "element")
          continue;
        switch (c.name) {
          case "w:top": {
            const w = parseWidth(c);
            if (w)
              out.top = w;
            break;
          }
          case "w:left": {
            const w = parseWidth(c);
            if (w)
              out.left = w;
            break;
          }
          case "w:bottom": {
            const w = parseWidth(c);
            if (w)
              out.bottom = w;
            break;
          }
          case "w:right": {
            const w = parseWidth(c);
            if (w)
              out.right = w;
            break;
          }
          case "w:start": {
            const w = parseWidth(c);
            if (w)
              out.start = w;
            break;
          }
          case "w:end": {
            const w = parseWidth(c);
            if (w)
              out.end = w;
            break;
          }
        }
      }
      return Object.keys(out).length ? out : void 0;
    }
    function marginsChildren(m) {
      const kids = [];
      if (m.top)
        kids.push(xml.el("w:top", widthAttrs(m.top)));
      if (m.left)
        kids.push(xml.el("w:left", widthAttrs(m.left)));
      if (m.bottom)
        kids.push(xml.el("w:bottom", widthAttrs(m.bottom)));
      if (m.right)
        kids.push(xml.el("w:right", widthAttrs(m.right)));
      if (m.start)
        kids.push(xml.el("w:start", widthAttrs(m.start)));
      if (m.end)
        kids.push(xml.el("w:end", widthAttrs(m.end)));
      return kids;
    }
    function renderMargins(parentName, m) {
      if (!m)
        return null;
      const kids = marginsChildren(m);
      if (!kids.length)
        return null;
      if (parentName === "w:tblCellMar")
        return xml.el("w:tblCellMar", {}, kids);
      if (parentName === "w:tcMar")
        return xml.el("w:tcMar", {}, kids);
      return xml.el(parentName, {}, kids);
    }
    function parseTblPr(el) {
      const out = {}, extras = [];
      for (const c of el.children) {
        if (c.type !== "element")
          continue;
        switch (c.name) {
          case "w:tblStyle":
            out.tblStyle = c.attrs["w:val"];
            break;
          case "w:tblOverlap":
            out.tblOverlap = c.attrs["w:val"];
            break;
          case "w:tblLayout":
            out.tblLayout = c.attrs["w:type"];
            break;
          case "w:tblCaption":
            out.tblCaption = c.attrs["w:val"];
            break;
          case "w:tblDescription":
            out.tblDescription = c.attrs["w:val"];
            break;
          case "w:tblStyleColBandSize":
            out.tblStyleColBandSize = c.attrs["w:val"];
            break;
          case "w:tblStyleRowBandSize":
            out.tblStyleRowBandSize = c.attrs["w:val"];
            break;
          case "w:jc":
            out.jc = c.attrs["w:val"];
            break;
          case "w:bidiVisual":
            out.bidiVisual = core.readToggle(c);
            break;
          case "w:tblW": {
            const w = parseWidth(c);
            if (w)
              out.width = w;
            break;
          }
          case "w:tblInd": {
            const w = parseWidth(c);
            if (w)
              out.indent = w;
            break;
          }
          case "w:tblCellSpacing": {
            const w = parseWidth(c);
            if (w)
              out.cellSpacing = w;
            break;
          }
          case "w:tblBorders": {
            const b = parseBorders(c);
            if (b)
              out.borders = b;
            break;
          }
          case "w:tblCellMar": {
            const m = parseMargins(c);
            if (m)
              out.cellMargins = m;
            break;
          }
          case "w:tblLook":
            out.tblLook = { ...c.attrs };
            break;
          case "w:tblpPr":
            out.floatPos = { ...c.attrs };
            break;
          default:
            extras.push(c);
        }
      }
      if (extras.length)
        out._extras = extras;
      return Object.keys(out).length ? out : void 0;
    }
    function renderTblPr(t) {
      if (!t)
        return null;
      const c = [], styleId = t.tblStyle != null ? t.tblStyle : t.style;
      if (styleId != null)
        c.push(xml.el("w:tblStyle", { "w:val": String(styleId) }));
      if (t.floatPos)
        c.push(xml.el("w:tblpPr", { ...t.floatPos }));
      if (t.tblOverlap != null)
        c.push(xml.el("w:tblOverlap", { "w:val": String(t.tblOverlap) }));
      if (t.bidiVisual !== void 0)
        c.push(xml.el("w:bidiVisual", t.bidiVisual === !1 ? { "w:val": "0" } : {}));
      if (t.tblStyleRowBandSize != null)
        c.push(xml.el("w:tblStyleRowBandSize", { "w:val": String(t.tblStyleRowBandSize) }));
      if (t.tblStyleColBandSize != null)
        c.push(xml.el("w:tblStyleColBandSize", { "w:val": String(t.tblStyleColBandSize) }));
      if (t.width)
        c.push(xml.el("w:tblW", widthAttrs(t.width)));
      if (t.jc != null)
        c.push(xml.el("w:jc", { "w:val": String(t.jc) }));
      if (t.cellSpacing)
        c.push(xml.el("w:tblCellSpacing", widthAttrs(t.cellSpacing)));
      if (t.indent)
        c.push(xml.el("w:tblInd", widthAttrs(t.indent)));
      const bs = renderBorders("w:tblBorders", t.borders);
      if (bs)
        c.push(bs);
      const ms = renderMargins("w:tblCellMar", t.cellMargins);
      if (ms)
        c.push(ms);
      if (t.tblLayout != null)
        c.push(xml.el("w:tblLayout", { "w:type": String(t.tblLayout) }));
      if (t.tblLook)
        c.push(xml.el("w:tblLook", { ...t.tblLook }));
      if (t.tblCaption != null)
        c.push(xml.el("w:tblCaption", { "w:val": String(t.tblCaption) }));
      if (t.tblDescription != null)
        c.push(xml.el("w:tblDescription", { "w:val": String(t.tblDescription) }));
      if (t._extras)
        for (const ex of t._extras)
          c.push(ex);
      return c.length ? xml.el("w:tblPr", {}, c) : null;
    }
    function parseTrPr(el) {
      const out = {}, extras = [];
      for (const c of el.children) {
        if (c.type !== "element")
          continue;
        switch (c.name) {
          case "w:trHeight":
            out.height = { ...c.attrs };
            break;
          case "w:gridBefore":
            out.gridBefore = Number(c.attrs["w:val"]);
            break;
          case "w:gridAfter":
            out.gridAfter = Number(c.attrs["w:val"]);
            break;
          case "w:wAfter": {
            const w = parseWidth(c);
            if (w)
              out.wAfter = w;
            break;
          }
          case "w:wBefore": {
            const w = parseWidth(c);
            if (w)
              out.wBefore = w;
            break;
          }
          case "w:cnfStyle":
            out.cnfStyle = c.attrs["w:val"];
            break;
          case "w:hidden":
            out.hidden = core.readToggle(c);
            break;
          case "w:cantSplit":
            out.cantSplit = core.readToggle(c);
            break;
          case "w:tblHeader":
            out.tblHeader = core.readToggle(c);
            break;
          default:
            extras.push(c);
        }
      }
      if (extras.length)
        out._extras = extras;
      return Object.keys(out).length ? out : void 0;
    }
    function renderTrPr(t) {
      if (!t)
        return null;
      const c = [];
      if (t.cnfStyle != null)
        c.push(xml.el("w:cnfStyle", { "w:val": String(t.cnfStyle) }));
      if (t.gridBefore != null)
        c.push(xml.el("w:gridBefore", { "w:val": String(t.gridBefore) }));
      if (t.gridAfter != null)
        c.push(xml.el("w:gridAfter", { "w:val": String(t.gridAfter) }));
      if (t.wBefore)
        c.push(xml.el("w:wBefore", widthAttrs(t.wBefore)));
      if (t.wAfter)
        c.push(xml.el("w:wAfter", widthAttrs(t.wAfter)));
      const tA = (v) => v === !1 ? { "w:val": "0" } : {};
      if (t.hidden !== void 0)
        c.push(xml.el("w:hidden", tA(t.hidden)));
      if (t.cantSplit !== void 0)
        c.push(xml.el("w:cantSplit", tA(t.cantSplit)));
      if (t.tblHeader !== void 0)
        c.push(xml.el("w:tblHeader", tA(t.tblHeader)));
      if (t.height)
        c.push(xml.el("w:trHeight", { ...t.height }));
      if (t._extras)
        for (const ex of t._extras)
          c.push(ex);
      return c.length ? xml.el("w:trPr", {}, c) : null;
    }
    function parseTcW(el) {
      return parseWidth(el);
    }
    function hydrateTcPr(tcPr) {
      if (!tcPr || !tcPr._extras)
        return tcPr;
      const remaining = [];
      for (const c of tcPr._extras) {
        if (c.type !== "element") {
          remaining.push(c);
          continue;
        }
        switch (c.name) {
          case "w:tcBorders": {
            const b = parseBorders(c);
            if (b)
              tcPr.borders = b;
            break;
          }
          case "w:tcMar": {
            const m = parseMargins(c);
            if (m)
              tcPr.margins = m;
            break;
          }
          case "w:tcW": {
            const w = parseTcW(c);
            if (w)
              tcPr.width = w;
            break;
          }
          case "w:vAlign":
            tcPr.vAlign = c.attrs["w:val"];
            break;
          case "w:cnfStyle":
            tcPr.cnfStyle = c.attrs["w:val"];
            break;
          case "w:noWrap":
            tcPr.noWrap = core.readToggle(c);
            break;
          case "w:hideMark":
            tcPr.hideMark = core.readToggle(c);
            break;
          case "w:tcFitText":
            tcPr.tcFitText = core.readToggle(c);
            break;
          default:
            remaining.push(c);
        }
      }
      if (remaining.length)
        tcPr._extras = remaining;
      else
        delete tcPr._extras;
      return tcPr;
    }
    function dehydrateTcPr(tcPr) {
      if (!tcPr)
        return tcPr;
      const out = { ...tcPr }, extras = out._extras ? [...out._extras] : [];
      if (out.cnfStyle != null) {
        extras.push(xml.el("w:cnfStyle", { "w:val": String(out.cnfStyle) }));
        delete out.cnfStyle;
      }
      const bs = renderBorders("w:tcBorders", out.borders);
      if (bs)
        extras.push(bs);
      delete out.borders;
      const ms = renderMargins("w:tcMar", out.margins);
      if (ms)
        extras.push(ms);
      delete out.margins;
      if (out.vAlign != null) {
        extras.push(xml.el("w:vAlign", { "w:val": String(out.vAlign) }));
        delete out.vAlign;
      }
      const tA = (v) => v === !1 ? { "w:val": "0" } : {};
      if (out.noWrap !== void 0) {
        extras.push(xml.el("w:noWrap", tA(out.noWrap)));
        delete out.noWrap;
      }
      if (out.hideMark !== void 0) {
        extras.push(xml.el("w:hideMark", tA(out.hideMark)));
        delete out.hideMark;
      }
      if (out.tcFitText !== void 0) {
        extras.push(xml.el("w:tcFitText", tA(out.tcFitText)));
        delete out.tcFitText;
      }
      if (extras.length)
        out._extras = extras;
      return out;
    }
    const extShaped = new WeakSet;
    function adoptCoreTblPr(table) {
      const t = table && table.tblPr;
      if (!t || extShaped.has(t))
        return;
      const el = core.renderTableProperties(t), typed = el ? parseTblPr(el) : void 0;
      if (typed) {
        extShaped.add(typed);
        table.tblPr = typed;
      }
    }
    function hydrateTable(table) {
      adoptCoreTblPr(table);
      if (!table || !table._extras) {
        if (table && table.rows)
          table.rows.forEach(hydrateRow);
        return table;
      }
      const remaining = [];
      for (const c of table._extras) {
        if (c.type === "element" && c.name === "w:tblPr") {
          const t = parseTblPr(c);
          if (t) {
            extShaped.add(t);
            table.tblPr = t;
          }
          continue;
        }
        remaining.push(c);
      }
      if (remaining.length)
        table._extras = remaining;
      else
        delete table._extras;
      if (table.rows)
        table.rows.forEach(hydrateRow);
      return table;
    }
    function hydrateRow(row) {
      if (row && row._extras) {
        const remaining = [];
        for (const c of row._extras) {
          if (c.type === "element" && c.name === "w:trPr") {
            const t = parseTrPr(c);
            if (t)
              row.trPr = t;
            continue;
          }
          remaining.push(c);
        }
        if (remaining.length)
          row._extras = remaining;
        else
          delete row._extras;
      }
      if (row && row.cells) {
        for (const cell of row.cells)
          if (cell.tcPr)
            hydrateTcPr(cell.tcPr);
      }
      return row;
    }
    function dehydrateTable(table) {
      if (!table)
        return table;
      const out = { ...table }, extras = out._extras ? [...out._extras] : [];
      if (out.tblPr) {
        const el = renderTblPr(out.tblPr);
        if (el)
          extras.unshift(el);
        delete out.tblPr;
      }
      out.rows = (out.rows || []).map(dehydrateRow);
      if (extras.length)
        out._extras = extras;
      return out;
    }
    function dehydrateRow(row) {
      if (!row)
        return row;
      const out = { ...row }, extras = out._extras ? [...out._extras] : [];
      if (out.trPr) {
        const el = renderTrPr(out.trPr);
        if (el)
          extras.unshift(el);
        delete out.trPr;
      }
      out.cells = (out.cells || []).map((cell) => {
        if (!cell.tcPr)
          return cell;
        return { ...cell, tcPr: dehydrateTcPr(cell.tcPr) };
      });
      if (extras.length)
        out._extras = extras;
      return out;
    }
    return {
      hydrateTable,
      dehydrateTable,
      hydrateRow,
      dehydrateRow,
      hydrateTcPr,
      dehydrateTcPr,
      parseTblPr,
      renderTblPr,
      parseTrPr,
      renderTrPr,
      parseBorders,
      renderBorders,
      parseMargins,
      renderMargins
    };
  } });
    __register({ name: "wmlNumberingDetails", dependencies: ["xml"], factory: function(xml) {
    const findChild = xml.findChild;
    function readToggle(el) {
      if (!el)
        return;
      const v = el.attrs["w:val"];
      if (v === void 0)
        return !0;
      return !(v === "0" || v === "false" || v === "off");
    }
    function valOf(el) {
      return el && el.attrs ? el.attrs["w:val"] : void 0;
    }
    function parseLvl(el) {
      const out = { attrs: { ...el.attrs } };
      for (const c of el.children) {
        if (c.type !== "element")
          continue;
        switch (c.name) {
          case "w:start":
            out.start = valOf(c);
            break;
          case "w:numFmt":
            out.numFmt = valOf(c);
            break;
          case "w:lvlText":
            out.lvlText = valOf(c);
            break;
          case "w:lvlJc":
            out.lvlJc = valOf(c);
            break;
          case "w:nfc":
            out.nfc = valOf(c);
            break;
          case "w:suff":
            out.suff = valOf(c);
            break;
          case "w:lvlPicBulletId":
            out.lvlPicBulletId = valOf(c);
            break;
          case "w:lvlRestart":
            out.lvlRestart = valOf(c);
            break;
          case "w:pStyle":
            out.pStyle = valOf(c);
            break;
          case "w:isLgl":
            out.isLgl = readToggle(c);
            break;
          case "w:legacy":
            out.legacy = { ...c.attrs };
            break;
          case "w:pPr":
            out.pPr = c;
            break;
          case "w:rPr":
            out.rPr = c;
            break;
          default:
            (out._extras = out._extras || []).push(c);
        }
      }
      return out;
    }
    function renderLvl(lvl) {
      const kids = [];
      if (lvl.start != null)
        kids.push(xml.el("w:start", { "w:val": String(lvl.start) }));
      if (lvl.numFmt != null)
        kids.push(xml.el("w:numFmt", { "w:val": String(lvl.numFmt) }));
      if (lvl.lvlText != null)
        kids.push(xml.el("w:lvlText", { "w:val": String(lvl.lvlText) }));
      if (lvl.lvlJc != null)
        kids.push(xml.el("w:lvlJc", { "w:val": String(lvl.lvlJc) }));
      if (lvl.nfc != null)
        kids.push(xml.el("w:nfc", { "w:val": String(lvl.nfc) }));
      if (lvl.suff != null)
        kids.push(xml.el("w:suff", { "w:val": String(lvl.suff) }));
      if (lvl.lvlPicBulletId != null)
        kids.push(xml.el("w:lvlPicBulletId", { "w:val": String(lvl.lvlPicBulletId) }));
      if (lvl.lvlRestart != null)
        kids.push(xml.el("w:lvlRestart", { "w:val": String(lvl.lvlRestart) }));
      if (lvl.pStyle != null)
        kids.push(xml.el("w:pStyle", { "w:val": String(lvl.pStyle) }));
      if (lvl.isLgl === !0)
        kids.push(xml.el("w:isLgl", {}));
      else if (lvl.isLgl === !1)
        kids.push(xml.el("w:isLgl", { "w:val": "0" }));
      if (lvl.legacy)
        kids.push(xml.el("w:legacy", { ...lvl.legacy }));
      if (lvl.pPr)
        kids.push(lvl.pPr);
      if (lvl.rPr)
        kids.push(lvl.rPr);
      if (lvl._extras)
        for (const e of lvl._extras)
          kids.push(e);
      return xml.el("w:lvl", lvl.attrs || {}, kids);
    }
    function parseAbstractNum(el) {
      const out = { attrs: { ...el.attrs }, lvls: [] };
      for (const c of el.children) {
        if (c.type !== "element")
          continue;
        switch (c.name) {
          case "w:nsid":
            out.nsid = valOf(c);
            break;
          case "w:multiLevelType":
            out.multiLevelType = valOf(c);
            break;
          case "w:tmpl":
            out.tmpl = valOf(c);
            break;
          case "w:tplc":
            out.tplc = valOf(c);
            break;
          case "w:name":
            out.name = valOf(c);
            break;
          case "w:styleLink":
            out.styleLink = valOf(c);
            break;
          case "w:numStyleLink":
            out.numStyleLink = valOf(c);
            break;
          case "w:lvl":
            out.lvls.push(parseLvl(c));
            break;
          default:
            (out._extras = out._extras || []).push(c);
        }
      }
      return out;
    }
    function renderAbstractNum(an) {
      const kids = [];
      if (an.nsid != null)
        kids.push(xml.el("w:nsid", { "w:val": String(an.nsid) }));
      if (an.multiLevelType != null)
        kids.push(xml.el("w:multiLevelType", { "w:val": String(an.multiLevelType) }));
      if (an.tmpl != null)
        kids.push(xml.el("w:tmpl", { "w:val": String(an.tmpl) }));
      if (an.tplc != null)
        kids.push(xml.el("w:tplc", { "w:val": String(an.tplc) }));
      if (an.name != null)
        kids.push(xml.el("w:name", { "w:val": String(an.name) }));
      if (an.styleLink != null)
        kids.push(xml.el("w:styleLink", { "w:val": String(an.styleLink) }));
      if (an.numStyleLink != null)
        kids.push(xml.el("w:numStyleLink", { "w:val": String(an.numStyleLink) }));
      if (an.lvls)
        for (const lvl of an.lvls)
          kids.push(renderLvl(lvl));
      if (an._extras)
        for (const e of an._extras)
          kids.push(e);
      return xml.el("w:abstractNum", an.attrs || {}, kids);
    }
    function parseLvlOverride(el) {
      const out = { attrs: { ...el.attrs } };
      for (const c of el.children) {
        if (c.type !== "element")
          continue;
        if (c.name === "w:startOverride") {
          out.startOverride = valOf(c);
          continue;
        }
        if (c.name === "w:numStart") {
          out.numStart = valOf(c);
          continue;
        }
        if (c.name === "w:numRestart") {
          out.numRestart = valOf(c);
          continue;
        }
        if (c.name === "w:lvl") {
          out.lvl = parseLvl(c);
          continue;
        }
        (out._extras = out._extras || []).push(c);
      }
      return out;
    }
    function renderLvlOverride(lo) {
      const kids = [];
      if (lo.startOverride != null)
        kids.push(xml.el("w:startOverride", { "w:val": String(lo.startOverride) }));
      if (lo.numStart != null)
        kids.push(xml.el("w:numStart", { "w:val": String(lo.numStart) }));
      if (lo.numRestart != null)
        kids.push(xml.el("w:numRestart", { "w:val": String(lo.numRestart) }));
      if (lo.lvl)
        kids.push(renderLvl(lo.lvl));
      if (lo._extras)
        for (const e of lo._extras)
          kids.push(e);
      return xml.el("w:lvlOverride", lo.attrs || {}, kids);
    }
    function parseNum(el) {
      const out = { attrs: { ...el.attrs }, lvlOverrides: [] };
      for (const c of el.children) {
        if (c.type !== "element")
          continue;
        if (c.name === "w:abstractNumId") {
          out.abstractNumId = valOf(c);
          continue;
        }
        if (c.name === "w:lvlOverride") {
          out.lvlOverrides.push(parseLvlOverride(c));
          continue;
        }
        (out._extras = out._extras || []).push(c);
      }
      return out;
    }
    function renderNum(n) {
      const kids = [];
      if (n.abstractNumId != null)
        kids.push(xml.el("w:abstractNumId", { "w:val": String(n.abstractNumId) }));
      if (n.lvlOverrides)
        for (const lo of n.lvlOverrides)
          kids.push(renderLvlOverride(lo));
      if (n._extras)
        for (const e of n._extras)
          kids.push(e);
      return xml.el("w:num", n.attrs || {}, kids);
    }
    function parseNumPicBullet(el) {
      return { attrs: { ...el.attrs }, children: el.children.filter((c) => c.type === "element") };
    }
    function renderNumPicBullet(b) {
      return xml.el("w:numPicBullet", b.attrs || {}, b.children || []);
    }
    return {
      parseLvl,
      renderLvl,
      parseAbstractNum,
      renderAbstractNum,
      parseNum,
      renderNum,
      parseLvlOverride,
      renderLvlOverride,
      parseNumPicBullet,
      renderNumPicBullet,
      findChild
    };
  } });
    __register({ name: "wmlSettings", dependencies: ["xml","docxProperties"], factory: function(xml, core) {
    const TOGGLES = [
      "autoHyphenation",
      "doNotHyphenateCaps",
      "autoFormatOverride",
      "bordersDoNotSurroundHeader",
      "bordersDoNotSurroundFooter",
      "bookFoldPrintingSheets",
      "bookFoldRevPrinting",
      "bookFoldPrinting",
      "displayBackgroundShape",
      "doNotDemarcateInvalidXml",
      "doNotDisplayPageBoundaries",
      "doNotEmbedSmartTags",
      "doNotIncludeSubdocsInStats",
      "doNotShadeFormData",
      "doNotTrackFormatting",
      "doNotTrackMoves",
      "doNotUseLongFileNames",
      "embedSystemFonts",
      "embedTrueTypeFonts",
      "evenAndOddHeaders",
      "forceUpgrade",
      "formsDesign",
      "gutterAtTop",
      "hideGrammaticalErrors",
      "hideSpellingErrors",
      "linkStyles",
      "mirrorMargins",
      "noPunctuationKerning",
      "printFormsData",
      "printFractionalCharacterWidth",
      "printPostScriptOverText",
      "printTwoOnOne",
      "removeDateAndTime",
      "removePersonalInformation",
      "saveFormsData",
      "saveInvalidXml",
      "savePreviewPicture",
      "saveSubsetFonts",
      "saveThroughXslt",
      "showEnvelope",
      "showXMLTags",
      "strictFirstAndLastChars",
      "styleLockQFSet",
      "styleLockTheme",
      "trackRevisions",
      "updateFields",
      "useFELayout",
      "useNormalStyleForList",
      "useXSLTWhenSaving",
      "alignBordersAndEdges",
      "allowPNG",
      "alwaysMergeEmptyNamespace",
      "alwaysShowPlaceholderText",
      "adjustLineHeightInTable",
      "applyBreakingRules",
      "balanceSingleByteDoubleByteWidth",
      "optimizeForBrowser",
      "readModeInkLockDown",
      "rtlGutter",
      "saveSmartTagsAsXml",
      "spaceForUL",
      "ulTrailSpace",
      "noLineBreaksAfter",
      "noLineBreaksBefore"
    ], TOGGLE_SET = new Set(TOGGLES.map((n) => "w:" + n)), VAL_ELEMENTS = [
      "decimalSymbol",
      "listSeparator",
      "characterSpacingControl",
      "defaultTableStyle",
      "clickAndTypeStyle",
      "summaryLength",
      "hyphenationZone",
      "consecutiveHyphenLimit",
      "displayHorizontalDrawingGridEvery",
      "displayVerticalDrawingGridEvery",
      "drawingGridHorizontalOrigin",
      "drawingGridHorizontalSpacing",
      "drawingGridVerticalOrigin",
      "drawingGridVerticalSpacing",
      "pixelsPerInch",
      "targetScreenSz",
      "stylePaneFormatFilter",
      "stylePaneSortMethod",
      "attachedTemplate"
    ], VAL_SET = new Set(VAL_ELEMENTS.map((n) => "w:" + n));
    function parseRsids(el) {
      const out = { rsids: [] };
      for (const c of el.children) {
        if (c.type !== "element")
          continue;
        if (c.name === "w:rsidRoot")
          out.rsidRoot = c.attrs["w:val"];
        else if (c.name === "w:rsid")
          out.rsids.push(c.attrs["w:val"]);
      }
      return out;
    }
    function renderRsids(r) {
      const kids = [];
      if (r.rsidRoot != null)
        kids.push(xml.el("w:rsidRoot", { "w:val": String(r.rsidRoot) }));
      for (const v of r.rsids || [])
        kids.push(xml.el("w:rsid", { "w:val": String(v) }));
      return xml.el("w:rsids", {}, kids);
    }
    function parseCompat(el) {
      const out = { settings: [] };
      for (const c of el.children) {
        if (c.type !== "element")
          continue;
        if (c.name === "w:compatSetting")
          out.settings.push({
            name: c.attrs["w:name"],
            uri: c.attrs["w:uri"],
            val: c.attrs["w:val"]
          });
        else
          (out._extras = out._extras || []).push(c);
      }
      return out;
    }
    function renderCompat(c) {
      const kids = [];
      for (const s of c.settings || []) {
        const a = {};
        if (s.name != null)
          a["w:name"] = String(s.name);
        if (s.uri != null)
          a["w:uri"] = String(s.uri);
        if (s.val != null)
          a["w:val"] = String(s.val);
        kids.push(xml.el("w:compatSetting", a));
      }
      if (c._extras)
        for (const e of c._extras)
          kids.push(e);
      return xml.el("w:compat", {}, kids);
    }
    function parseShapeDefaults(el) {
      return { children: el.children.filter((c) => c.type === "element") };
    }
    function renderShapeDefaults(name, sd) {
      return xml.el(name, {}, sd.children || []);
    }
    function parseThemeFontLang(el) {
      const a = el.attrs || {}, out = {};
      if (a["w:val"])
        out.val = a["w:val"];
      if (a["w:eastAsia"])
        out.eastAsia = a["w:eastAsia"];
      if (a["w:bidi"])
        out.bidi = a["w:bidi"];
      return out;
    }
    function renderThemeFontLang(t) {
      const a = {};
      if (t.val != null)
        a["w:val"] = t.val;
      if (t.eastAsia != null)
        a["w:eastAsia"] = t.eastAsia;
      if (t.bidi != null)
        a["w:bidi"] = t.bidi;
      return xml.el("w:themeFontLang", a);
    }
    function parseMailMerge(el) {
      return { attrs: { ...el.attrs }, children: el.children.filter((c) => c.type === "element") };
    }
    function renderMailMerge(m) {
      return xml.el("w:mailMerge", m.attrs || {}, m.children || []);
    }
    function parseAttrsOnly(el) {
      const out = {};
      for (const [k, v] of Object.entries(el.attrs || {}))
        out[k.replace(/^w:/, "")] = v;
      return out;
    }
    function renderTrackChanges(t) {
      return xml.el("w:trackChanges", objAttrsOf(t));
    }
    function renderProofState(p) {
      return xml.el("w:proofState", objAttrsOf(p));
    }
    function objAttrsOf(o) {
      const out = {};
      for (const [k, v] of Object.entries(o || {}))
        out[k.startsWith("w:") ? k : "w:" + k] = String(v);
      return out;
    }
    function renderView(v) {
      const a = typeof v === "object" ? objAttrsOf(v) : { "w:val": String(v) };
      return xml.el("w:view", a);
    }
    function renderZoom(z) {
      const a = typeof z === "object" ? objAttrsOf(z) : { "w:val": String(z) };
      return xml.el("w:zoom", a);
    }
    function renderWriteProtection(p) {
      return xml.el("w:writeProtection", objAttrsOf(p));
    }
    function renderDocumentProtection(p) {
      return xml.el("w:documentProtection", objAttrsOf(p));
    }
    function parseNotePr(el) {
      return { children: el.children.filter((c) => c.type === "element") };
    }
    function renderFootnotePr(f) {
      return xml.el("w:footnotePr", {}, f.children || []);
    }
    function renderEndnotePr(e) {
      return xml.el("w:endnotePr", {}, e.children || []);
    }
    function renderSmartTagPr(s) {
      return xml.el("w:smartTagPr", {}, s.children || []);
    }
    function renderRevisionView(r) {
      return xml.el("w:revisionView", objAttrsOf(r));
    }
    function renderClrSchemeMapping(c) {
      return xml.el("w:clrSchemeMapping", objAttrsOf(c));
    }
    function renderAttachedSchemas(arr) {
      return arr.map((v) => xml.el("w:attachedSchema", { "w:val": String(v) }));
    }
    function hydrate(root) {
      const extras = root._extras || (Array.isArray(root) ? root : []), remaining = [];
      for (const c of extras) {
        if (c.type !== "element") {
          remaining.push(c);
          continue;
        }
        const local = c.name.replace(/^w:/, "");
        if (TOGGLE_SET.has(c.name)) {
          root[local] = core.readToggle(c);
          continue;
        }
        if (VAL_SET.has(c.name)) {
          root[local] = c.attrs["w:val"];
          continue;
        }
        switch (c.name) {
          case "w:rsids":
            root.rsids = parseRsids(c);
            continue;
          case "w:compat":
            root.compat = parseCompat(c);
            continue;
          case "w:hdrShapeDefaults":
            root.hdrShapeDefaults = parseShapeDefaults(c);
            continue;
          case "w:shapeDefaults":
            root.shapeDefaults = parseShapeDefaults(c);
            continue;
          case "w:themeFontLang":
            root.themeFontLang = parseThemeFontLang(c);
            continue;
          case "w:mailMerge":
            root.mailMerge = parseMailMerge(c);
            continue;
          case "w:trackChanges":
            root.trackChanges = parseAttrsOnly(c);
            continue;
          case "w:proofState":
            root.proofState = parseAttrsOnly(c);
            continue;
          case "w:view":
            root.view = parseAttrsOnly(c);
            continue;
          case "w:zoom":
            root.zoom = parseAttrsOnly(c);
            continue;
          case "w:writeProtection":
            root.writeProtection = parseAttrsOnly(c);
            continue;
          case "w:documentProtection":
            root.documentProtection = parseAttrsOnly(c);
            continue;
          case "w:footnotePr":
            root.footnotePr = parseNotePr(c);
            continue;
          case "w:endnotePr":
            root.endnotePr = parseNotePr(c);
            continue;
          case "w:smartTagPr":
            root.smartTagPr = { children: c.children.filter((x) => x.type === "element") };
            continue;
          case "w:revisionView":
            root.revisionView = parseAttrsOnly(c);
            continue;
          case "w:clrSchemeMapping":
            root.clrSchemeMapping = parseAttrsOnly(c);
            continue;
          case "w:attachedSchema":
            (root.attachedSchemas = root.attachedSchemas || []).push(c.attrs["w:val"]);
            continue;
          default:
            remaining.push(c);
        }
      }
      if (remaining.length)
        root._extras = remaining;
      else
        delete root._extras;
      return root;
    }
    function dehydrate(root) {
      const out = { ...root }, extras = out._extras ? [...out._extras] : [];
      for (const t of TOGGLES)
        if (out[t] !== void 0) {
          const el = core.writeToggle("w:" + t, out[t]);
          if (el)
            extras.push(el);
          delete out[t];
        }
      for (const v of VAL_ELEMENTS)
        if (out[v] !== void 0) {
          extras.push(xml.el("w:" + v, { "w:val": String(out[v]) }));
          delete out[v];
        }
      if (out.rsids) {
        extras.push(renderRsids(out.rsids));
        delete out.rsids;
      }
      if (out.compat) {
        extras.push(renderCompat(out.compat));
        delete out.compat;
      }
      if (out.hdrShapeDefaults) {
        extras.push(renderShapeDefaults("w:hdrShapeDefaults", out.hdrShapeDefaults));
        delete out.hdrShapeDefaults;
      }
      if (out.shapeDefaults) {
        extras.push(renderShapeDefaults("w:shapeDefaults", out.shapeDefaults));
        delete out.shapeDefaults;
      }
      if (out.themeFontLang) {
        extras.push(renderThemeFontLang(out.themeFontLang));
        delete out.themeFontLang;
      }
      if (out.mailMerge) {
        extras.push(renderMailMerge(out.mailMerge));
        delete out.mailMerge;
      }
      if (out.trackChanges) {
        extras.push(renderTrackChanges(out.trackChanges));
        delete out.trackChanges;
      }
      if (out.proofState) {
        extras.push(renderProofState(out.proofState));
        delete out.proofState;
      }
      if (out.view !== void 0) {
        extras.push(renderView(out.view));
        delete out.view;
      }
      if (out.zoom !== void 0) {
        extras.push(renderZoom(out.zoom));
        delete out.zoom;
      }
      if (out.writeProtection) {
        extras.push(renderWriteProtection(out.writeProtection));
        delete out.writeProtection;
      }
      if (out.documentProtection) {
        extras.push(renderDocumentProtection(out.documentProtection));
        delete out.documentProtection;
      }
      if (out.footnotePr) {
        extras.push(renderFootnotePr(out.footnotePr));
        delete out.footnotePr;
      }
      if (out.endnotePr) {
        extras.push(renderEndnotePr(out.endnotePr));
        delete out.endnotePr;
      }
      if (out.smartTagPr) {
        extras.push(renderSmartTagPr(out.smartTagPr));
        delete out.smartTagPr;
      }
      if (out.revisionView) {
        extras.push(renderRevisionView(out.revisionView));
        delete out.revisionView;
      }
      if (out.clrSchemeMapping) {
        extras.push(renderClrSchemeMapping(out.clrSchemeMapping));
        delete out.clrSchemeMapping;
      }
      if (out.attachedSchemas) {
        for (const e of renderAttachedSchemas(out.attachedSchemas))
          extras.push(e);
        delete out.attachedSchemas;
      }
      if (extras.length)
        out._extras = extras;
      return out;
    }
    return {
      hydrate,
      dehydrate,
      hydrateSettings: hydrate,
      dehydrateSettings: dehydrate,
      TOGGLES,
      VAL_ELEMENTS,
      parseRsids,
      renderRsids,
      parseCompat,
      renderCompat,
      parseThemeFontLang,
      renderThemeFontLang,
      parseMailMerge,
      renderMailMerge
    };
  } });
    __register({ name: "wmlFields", dependencies: [], factory: function() {
    function tokenize(instr) {
      const tokens = [];
      let i = 0;
      const s = instr.trim();
      while (i < s.length) {
        while (i < s.length && /\s/.test(s[i]))
          i++;
        if (i >= s.length)
          break;
        if (s[i] === '"') {
          let j = i + 1;
          while (j < s.length && s[j] !== '"')
            j++;
          tokens.push({ kind: "string", value: s.slice(i + 1, j) });
          i = j + 1;
        } else if (s[i] === "\\") {
          let j = i + 1;
          while (j < s.length && /\S/.test(s[j]))
            j++;
          tokens.push({ kind: "switch", value: s.slice(i, j) });
          i = j;
        } else {
          let j = i;
          while (j < s.length && /\S/.test(s[j]))
            j++;
          tokens.push({ kind: "word", value: s.slice(i, j) });
          i = j;
        }
      }
      return tokens;
    }
    function parseInstruction(instr) {
      const tokens = tokenize(instr);
      if (!tokens.length)
        return null;
      const out = { type: tokens[0].value.toUpperCase(), args: [], switches: {} };
      for (let i = 1;i < tokens.length; i++) {
        const t = tokens[i];
        if (t.kind === "switch") {
          const key = t.value, next = tokens[i + 1];
          if (next && next.kind !== "switch") {
            out.switches[key] = next.value;
            i++;
          } else
            out.switches[key] = !0;
        } else
          out.args.push(t.value);
      }
      return out;
    }
    function quoteIfNeeded(v) {
      const s = String(v);
      return /\s/.test(s) ? `"${s}"` : s;
    }
    function renderInstruction(parsed) {
      const parts = [parsed.type];
      for (const a of parsed.args || [])
        parts.push(quoteIfNeeded(a));
      for (const [k, v] of Object.entries(parsed.switches || {}))
        if (v === !0)
          parts.push(k);
        else
          parts.push(k, quoteIfNeeded(v));
      return parts.join(" ");
    }
    function copySwitches(sw, exclude) {
      const out = {};
      for (const [k, v] of Object.entries(sw))
        if (!exclude.has(k))
          out[k] = v;
      return out;
    }
    const KNOWN_FIELDS = {
      PAGE: simpleField("PAGE"),
      NUMPAGES: simpleField("NUMPAGES"),
      SECTION: simpleField("SECTION"),
      SECTIONPAGES: simpleField("SECTIONPAGES"),
      DATE: dateField("DATE"),
      TIME: dateField("TIME"),
      CREATEDATE: dateField("CREATEDATE"),
      SAVEDATE: dateField("SAVEDATE"),
      PRINTDATE: dateField("PRINTDATE"),
      MERGEFIELD: {
        parse(p) {
          const sw = p.switches || {};
          return {
            type: "MERGEFIELD",
            fieldName: p.args[0],
            mergeFormat: sw["\\*"] === "MERGEFORMAT" || sw["\\*"] === !0 ? !0 : sw["\\*"] || void 0,
            before: sw["\\b"],
            after: sw["\\f"],
            format: sw["\\#"] || sw["\\@"],
            otherSwitches: copySwitches(sw, new Set(["\\*", "\\b", "\\f", "\\#", "\\@"]))
          };
        },
        render(s) {
          const sw = { ...s.otherSwitches || {} };
          if (s.mergeFormat)
            sw["\\*"] = s.mergeFormat === !0 ? "MERGEFORMAT" : s.mergeFormat;
          if (s.before != null)
            sw["\\b"] = s.before;
          if (s.after != null)
            sw["\\f"] = s.after;
          if (s.format != null)
            sw["\\#"] = s.format;
          return renderInstruction({ type: "MERGEFIELD", args: [s.fieldName], switches: sw });
        }
      },
      HYPERLINK: {
        parse(p) {
          const sw = p.switches || {};
          return {
            type: "HYPERLINK",
            url: p.args[0],
            anchor: sw["\\l"],
            target: sw["\\t"],
            screenTip: sw["\\o"],
            m: sw["\\m"] === !0,
            n: sw["\\n"] === !0,
            otherSwitches: copySwitches(sw, new Set(["\\l", "\\t", "\\o", "\\m", "\\n"]))
          };
        },
        render(s) {
          const sw = { ...s.otherSwitches || {} };
          if (s.anchor != null)
            sw["\\l"] = s.anchor;
          if (s.target != null)
            sw["\\t"] = s.target;
          if (s.screenTip != null)
            sw["\\o"] = s.screenTip;
          if (s.m)
            sw["\\m"] = !0;
          if (s.n)
            sw["\\n"] = !0;
          return renderInstruction({ type: "HYPERLINK", args: s.url != null ? [s.url] : [], switches: sw });
        }
      },
      IF: {
        parse(p) {
          return {
            type: "IF",
            left: p.args[0],
            operator: p.args[1],
            right: p.args[2],
            trueText: p.args[3],
            falseText: p.args[4],
            switches: { ...p.switches || {} }
          };
        },
        render(s) {
          const args = [];
          for (const k of ["left", "operator", "right", "trueText", "falseText"])
            if (s[k] != null)
              args.push(s[k]);
          return renderInstruction({ type: "IF", args, switches: s.switches || {} });
        }
      },
      INCLUDETEXT: {
        parse(p) {
          const sw = p.switches || {};
          return {
            type: "INCLUDETEXT",
            source: p.args[0],
            bookmark: p.args[1],
            namespaceMappings: sw["\\n"],
            xpath: sw["\\x"],
            switches: copySwitches(sw, new Set(["\\n", "\\x"]))
          };
        },
        render(s) {
          const sw = { ...s.switches || {} };
          if (s.namespaceMappings != null)
            sw["\\n"] = s.namespaceMappings;
          if (s.xpath != null)
            sw["\\x"] = s.xpath;
          const args = [];
          if (s.source != null)
            args.push(s.source);
          if (s.bookmark != null)
            args.push(s.bookmark);
          return renderInstruction({ type: "INCLUDETEXT", args, switches: sw });
        }
      },
      INCLUDEPICTURE: {
        parse(p) {
          return {
            type: "INCLUDEPICTURE",
            source: p.args[0],
            switches: { ...p.switches || {} }
          };
        },
        render(s) {
          return renderInstruction({
            type: "INCLUDEPICTURE",
            args: s.source != null ? [s.source] : [],
            switches: s.switches || {}
          });
        }
      },
      REF: {
        parse(p) {
          const sw = p.switches || {};
          return {
            type: "REF",
            bookmark: p.args[0],
            hyperlink: sw["\\h"] === !0,
            insertParaNum: sw["\\n"] === !0,
            relative: sw["\\r"] === !0,
            switches: copySwitches(sw, new Set(["\\h", "\\n", "\\r"]))
          };
        },
        render(s) {
          const sw = { ...s.switches || {} };
          if (s.hyperlink)
            sw["\\h"] = !0;
          if (s.insertParaNum)
            sw["\\n"] = !0;
          if (s.relative)
            sw["\\r"] = !0;
          return renderInstruction({
            type: "REF",
            args: s.bookmark != null ? [s.bookmark] : [],
            switches: sw
          });
        }
      },
      STYLEREF: {
        parse(p) {
          const sw = p.switches || {};
          return {
            type: "STYLEREF",
            styleName: p.args[0],
            searchFromBottom: sw["\\l"] === !0,
            insertNumber: sw["\\n"] === !0,
            switches: copySwitches(sw, new Set(["\\l", "\\n"]))
          };
        },
        render(s) {
          const sw = { ...s.switches || {} };
          if (s.searchFromBottom)
            sw["\\l"] = !0;
          if (s.insertNumber)
            sw["\\n"] = !0;
          return renderInstruction({
            type: "STYLEREF",
            args: s.styleName != null ? [s.styleName] : [],
            switches: sw
          });
        }
      },
      TOC: {
        parse(p) {
          const sw = p.switches || {};
          let minLevel, maxLevel;
          if (sw["\\o"]) {
            const m = String(sw["\\o"]).match(/^(\d+)-(\d+)$/);
            if (m) {
              minLevel = Number(m[1]);
              maxLevel = Number(m[2]);
            }
          }
          return {
            type: "TOC",
            outlineRange: sw["\\o"],
            minLevel,
            maxLevel,
            hyperlinks: sw["\\h"] === !0,
            hideTabAndPageNum: sw["\\n"],
            omitPageNum: sw["\\z"] === !0,
            useAppliedParaOutline: sw["\\u"] === !0,
            buildFromBookmark: sw["\\b"],
            tableEntryFields: sw["\\f"],
            tableEntryStyle: sw["\\t"],
            buildFromStyles: sw["\\l"],
            switches: copySwitches(sw, new Set(["\\o", "\\h", "\\n", "\\z", "\\u", "\\b", "\\f", "\\t", "\\l"]))
          };
        },
        render(s) {
          const sw = { ...s.switches || {} };
          if (s.outlineRange != null)
            sw["\\o"] = s.outlineRange;
          else if (s.minLevel != null && s.maxLevel != null)
            sw["\\o"] = `${s.minLevel}-${s.maxLevel}`;
          if (s.hyperlinks)
            sw["\\h"] = !0;
          if (s.hideTabAndPageNum != null)
            sw["\\n"] = s.hideTabAndPageNum;
          if (s.omitPageNum)
            sw["\\z"] = !0;
          if (s.useAppliedParaOutline)
            sw["\\u"] = !0;
          if (s.buildFromBookmark != null)
            sw["\\b"] = s.buildFromBookmark;
          if (s.tableEntryFields != null)
            sw["\\f"] = s.tableEntryFields;
          if (s.tableEntryStyle != null)
            sw["\\t"] = s.tableEntryStyle;
          if (s.buildFromStyles != null)
            sw["\\l"] = s.buildFromStyles;
          return renderInstruction({ type: "TOC", args: [], switches: sw });
        }
      },
      INDEX: {
        parse(p) {
          const sw = p.switches || {};
          return {
            type: "INDEX",
            columns: sw["\\c"],
            language: sw["\\l"],
            entryType: sw["\\f"],
            heading: sw["\\h"],
            switches: copySwitches(sw, new Set(["\\c", "\\l", "\\f", "\\h"]))
          };
        },
        render(s) {
          const sw = { ...s.switches || {} };
          if (s.columns != null)
            sw["\\c"] = s.columns;
          if (s.language != null)
            sw["\\l"] = s.language;
          if (s.entryType != null)
            sw["\\f"] = s.entryType;
          if (s.heading != null)
            sw["\\h"] = s.heading;
          return renderInstruction({ type: "INDEX", args: [], switches: sw });
        }
      },
      XE: {
        parse(p) {
          return {
            type: "XE",
            text: p.args[0],
            switches: { ...p.switches || {} }
          };
        },
        render(s) {
          return renderInstruction({
            type: "XE",
            args: s.text != null ? [s.text] : [],
            switches: s.switches || {}
          });
        }
      },
      RD: {
        parse(p) {
          return {
            type: "RD",
            file: p.args[0],
            switches: { ...p.switches || {} }
          };
        },
        render(s) {
          return renderInstruction({
            type: "RD",
            args: s.file != null ? [s.file] : [],
            switches: s.switches || {}
          });
        }
      },
      EQ: {
        parse(p) {
          return {
            type: "EQ",
            tokens: p.args,
            switches: { ...p.switches || {} }
          };
        },
        render(s) {
          return renderInstruction({
            type: "EQ",
            args: s.tokens || [],
            switches: s.switches || {}
          });
        }
      },
      ASK: {
        parse(p) {
          return {
            type: "ASK",
            bookmark: p.args[0],
            prompt: p.args[1],
            defaultResponse: (p.switches || {})["\\d"],
            switches: copySwitches(p.switches || {}, new Set(["\\d"]))
          };
        },
        render(s) {
          const sw = { ...s.switches || {} };
          if (s.defaultResponse != null)
            sw["\\d"] = s.defaultResponse;
          const args = [];
          if (s.bookmark != null)
            args.push(s.bookmark);
          if (s.prompt != null)
            args.push(s.prompt);
          return renderInstruction({ type: "ASK", args, switches: sw });
        }
      },
      FILLIN: {
        parse(p) {
          return {
            type: "FILLIN",
            prompt: p.args[0],
            defaultResponse: (p.switches || {})["\\d"],
            switches: copySwitches(p.switches || {}, new Set(["\\d"]))
          };
        },
        render(s) {
          const sw = { ...s.switches || {} };
          if (s.defaultResponse != null)
            sw["\\d"] = s.defaultResponse;
          return renderInstruction({
            type: "FILLIN",
            args: s.prompt != null ? [s.prompt] : [],
            switches: sw
          });
        }
      },
      SET: {
        parse(p) {
          return {
            type: "SET",
            bookmark: p.args[0],
            value: p.args[1],
            switches: { ...p.switches || {} }
          };
        },
        render(s) {
          const args = [];
          if (s.bookmark != null)
            args.push(s.bookmark);
          if (s.value != null)
            args.push(s.value);
          return renderInstruction({ type: "SET", args, switches: s.switches || {} });
        }
      },
      BIDIOUTLINE: simpleField("BIDIOUTLINE"),
      AUTHOR: simpleField("AUTHOR"),
      TITLE: simpleField("TITLE"),
      SUBJECT: simpleField("SUBJECT"),
      KEYWORDS: simpleField("KEYWORDS"),
      FILENAME: simpleField("FILENAME"),
      FILESIZE: simpleField("FILESIZE")
    };
    function simpleField(name) {
      return {
        parse(p) {
          return { type: name, switches: { ...p.switches || {} } };
        },
        render(s) {
          return renderInstruction({ type: name, args: [], switches: s.switches || {} });
        }
      };
    }
    function dateField(name) {
      return {
        parse(p) {
          const sw = p.switches || {};
          return {
            type: name,
            format: sw["\\@"],
            switches: copySwitches(sw, new Set(["\\@"]))
          };
        },
        render(s) {
          const sw = { ...s.switches || {} };
          if (s.format != null)
            sw["\\@"] = s.format;
          return renderInstruction({ type: name, args: [], switches: sw });
        }
      };
    }
    function parseTyped(instr) {
      const p = parseInstruction(instr);
      if (!p)
        return null;
      const spec = KNOWN_FIELDS[p.type];
      return spec ? spec.parse(p) : p;
    }
    function renderTyped(struct) {
      const spec = KNOWN_FIELDS[struct.type];
      if (spec)
        return spec.render(struct);
      return renderInstruction(struct);
    }
    return {
      tokenize,
      parseInstruction,
      renderInstruction,
      parseTyped,
      renderTyped,
      KNOWN_FIELDS,
      FIELD_NAMES: new Set(Object.keys(KNOWN_FIELDS))
    };
  } });
    __register({ name: "wmlTrackedChanges", dependencies: ["xml"], factory: function(xml) {
    const CHANGE_SNAPSHOTS = {
      "w:pPrChange": "w:pPr",
      "w:rPrChange": "w:rPr",
      "w:tblPrChange": "w:tblPr",
      "w:tblPrExChange": "w:tblPrEx",
      "w:trPrChange": "w:trPr",
      "w:tcPrChange": "w:tcPr",
      "w:sectPrChange": "w:sectPr",
      "w:tblGridChange": "w:tblGrid",
      "w:numberingChange": null
    }, CHANGE_TAGS = Object.keys(CHANGE_SNAPSHOTS).map((s) => s.slice(2)), RANGE_TAGS = [
      "customXmlInsRangeStart",
      "customXmlInsRangeEnd",
      "customXmlDelRangeStart",
      "customXmlDelRangeEnd",
      "customXmlMoveFromRangeStart",
      "customXmlMoveFromRangeEnd",
      "customXmlMoveToRangeStart",
      "customXmlMoveToRangeEnd",
      "moveFromRangeStart",
      "moveFromRangeEnd",
      "moveToRangeStart",
      "moveToRangeEnd"
    ], CELL_TAGS = ["cellMerge", "cellIns", "cellDel"];
    function parseChange(el) {
      const kind = el.name, expectedChild = CHANGE_SNAPSHOTS[kind], out = {
        kind: kind.replace(/^w:/, ""),
        id: el.attrs["w:id"],
        author: el.attrs["w:author"],
        date: el.attrs["w:date"]
      };
      for (const c of el.children) {
        if (c.type !== "element")
          continue;
        if (expectedChild && c.name === expectedChild)
          out.snapshot = c;
        else
          (out._extras = out._extras || []).push(c);
      }
      return out;
    }
    function renderChange(c) {
      const tag = "w:" + c.kind, attrs = {};
      if (c.id != null)
        attrs["w:id"] = String(c.id);
      if (c.author != null)
        attrs["w:author"] = c.author;
      if (c.date != null)
        attrs["w:date"] = c.date;
      const kids = [];
      if (c.snapshot)
        kids.push(c.snapshot);
      if (c._extras)
        for (const e of c._extras)
          kids.push(e);
      switch (tag) {
        case "w:pPrChange":
          return xml.el("w:pPrChange", attrs, kids);
        case "w:rPrChange":
          return xml.el("w:rPrChange", attrs, kids);
        case "w:tblPrChange":
          return xml.el("w:tblPrChange", attrs, kids);
        case "w:tblPrExChange":
          return xml.el("w:tblPrExChange", attrs, kids);
        case "w:trPrChange":
          return xml.el("w:trPrChange", attrs, kids);
        case "w:tcPrChange":
          return xml.el("w:tcPrChange", attrs, kids);
        case "w:sectPrChange":
          return xml.el("w:sectPrChange", attrs, kids);
        case "w:tblGridChange":
          return xml.el("w:tblGridChange", attrs, kids);
        default:
          return xml.el(tag, attrs, kids);
      }
    }
    function parseRange(el) {
      const out = { kind: el.name.replace(/^w:/, "") };
      for (const [k, v] of Object.entries(el.attrs || {}))
        out[k.replace(/^w:/, "")] = v;
      return out;
    }
    function renderRange(r) {
      const kind = r.kind, attrs = {};
      for (const [k, v] of Object.entries(r)) {
        if (k === "kind")
          continue;
        if (v != null)
          attrs["w:" + k] = String(v);
      }
      const tag = "w:" + kind;
      switch (tag) {
        case "w:customXmlInsRangeStart":
          return xml.el("w:customXmlInsRangeStart", attrs);
        case "w:customXmlInsRangeEnd":
          return xml.el("w:customXmlInsRangeEnd", attrs);
        case "w:customXmlDelRangeStart":
          return xml.el("w:customXmlDelRangeStart", attrs);
        case "w:customXmlDelRangeEnd":
          return xml.el("w:customXmlDelRangeEnd", attrs);
        case "w:customXmlMoveFromRangeStart":
          return xml.el("w:customXmlMoveFromRangeStart", attrs);
        case "w:customXmlMoveFromRangeEnd":
          return xml.el("w:customXmlMoveFromRangeEnd", attrs);
        case "w:customXmlMoveToRangeStart":
          return xml.el("w:customXmlMoveToRangeStart", attrs);
        case "w:customXmlMoveToRangeEnd":
          return xml.el("w:customXmlMoveToRangeEnd", attrs);
        case "w:moveFromRangeStart":
          return xml.el("w:moveFromRangeStart", attrs);
        case "w:moveFromRangeEnd":
          return xml.el("w:moveFromRangeEnd", attrs);
        case "w:moveToRangeStart":
          return xml.el("w:moveToRangeStart", attrs);
        case "w:moveToRangeEnd":
          return xml.el("w:moveToRangeEnd", attrs);
        default:
          return xml.el(tag, attrs);
      }
    }
    function parseCellChange(el) {
      const out = { kind: el.name.replace(/^w:/, "") };
      for (const [k, v] of Object.entries(el.attrs || {}))
        out[k.replace(/^w:/, "")] = v;
      return out;
    }
    function renderCellChange(c) {
      const attrs = {};
      for (const [k, v] of Object.entries(c)) {
        if (k === "kind" || v == null)
          continue;
        attrs["w:" + k] = String(v);
      }
      const tag = "w:" + c.kind;
      switch (tag) {
        case "w:cellMerge":
          return xml.el("w:cellMerge", attrs);
        case "w:cellIns":
          return xml.el("w:cellIns", attrs);
        case "w:cellDel":
          return xml.el("w:cellDel", attrs);
        default:
          return xml.el(tag, attrs);
      }
    }
    function parseMoveBlock(el) {
      return {
        kind: el.name.replace(/^w:/, ""),
        id: el.attrs["w:id"],
        author: el.attrs["w:author"],
        date: el.attrs["w:date"],
        children: el.children.filter((c) => c.type === "element")
      };
    }
    function renderMoveBlock(b) {
      const attrs = {};
      if (b.id != null)
        attrs["w:id"] = String(b.id);
      if (b.author != null)
        attrs["w:author"] = b.author;
      if (b.date != null)
        attrs["w:date"] = b.date;
      const tag = "w:" + b.kind;
      switch (tag) {
        case "w:moveFrom":
          return xml.el("w:moveFrom", attrs, b.children || []);
        case "w:moveTo":
          return xml.el("w:moveTo", attrs, b.children || []);
        case "w:ins":
          return xml.el("w:ins", attrs, b.children || []);
        case "w:del":
          return xml.el("w:del", attrs, b.children || []);
        default:
          return xml.el(tag, attrs, b.children || []);
      }
    }
    return {
      parseChange,
      renderChange,
      parseRange,
      renderRange,
      parseCellChange,
      renderCellChange,
      parseMoveBlock,
      renderMoveBlock,
      CHANGE_TAGS,
      RANGE_TAGS,
      CELL_TAGS,
      CHANGE_SNAPSHOTS
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
    __register({ name: "dmlWpPositioning", dependencies: ["xml"], factory: function(xml) {
    const ANCHOR_FLAGS = [
      "simplePos",
      "allowOverlap",
      "behindDoc",
      "locked",
      "layoutInCell"
    ], WRAP_KINDS = [
      "wrapNone",
      "wrapSquare",
      "wrapTight",
      "wrapThrough",
      "wrapTopAndBottom"
    ];
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
    function buildCNvPrAttrs(p) {
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
      return a;
    }
    function renderCNvPr(p) {
      return xml.el("wp:cNvPr", buildCNvPrAttrs(p));
    }
    function parseCNvSpPr(el) {
      if (!el)
        return;
      const out = { attrs: { ...el.attrs } }, lck = xml.findChild(el, "a:spLocks");
      if (lck)
        out.spLocks = { ...lck.attrs };
      return out;
    }
    function renderCNvSpPr(p) {
      const kids = [];
      if (p.spLocks)
        kids.push(xml.el("a:spLocks", { ...p.spLocks }));
      return xml.el("wp:cNvSpPr", p.attrs || {}, kids);
    }
    function parseCNvCnPr(el) {
      if (!el)
        return;
      const out = { attrs: { ...el.attrs } }, stCxn = xml.findChild(el, "a:stCxn"), endCxn = xml.findChild(el, "a:endCxn");
      if (stCxn)
        out.stCxn = { ...stCxn.attrs };
      if (endCxn)
        out.endCxn = { ...endCxn.attrs };
      return out;
    }
    function renderCNvCnPr(p) {
      const kids = [];
      if (p.stCxn)
        kids.push(xml.el("a:stCxn", { ...p.stCxn }));
      if (p.endCxn)
        kids.push(xml.el("a:endCxn", { ...p.endCxn }));
      return xml.el("wp:cNvCnPr", p.attrs || {}, kids);
    }
    function parseCNvFrPr(el) {
      if (!el)
        return;
      const out = { attrs: { ...el.attrs } }, lck = xml.findChild(el, "a:graphicFrameLocks");
      if (lck)
        out.graphicFrameLocks = { ...lck.attrs };
      return out;
    }
    function renderCNvFrPr(p) {
      const kids = [];
      if (p.graphicFrameLocks)
        kids.push(xml.el("a:graphicFrameLocks", { ...p.graphicFrameLocks }));
      return xml.el("wp:cNvFrPr", p.attrs || {}, kids);
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
      return xml.el("wp:cNvGrpSpPr", p.attrs || {}, kids);
    }
    function parseCNvContentPartPr(el) {
      if (!el)
        return;
      return { attrs: { ...el.attrs } };
    }
    function renderCNvContentPartPr(p) {
      return xml.el("wp:cNvContentPartPr", p.attrs || {});
    }
    function parseNvContentPartPr(el) {
      if (!el)
        return;
      const out = {}, cnv = xml.findChild(el, "wp:cNvPr"), cnvPart = xml.findChild(el, "wp:cNvContentPartPr");
      if (cnv)
        out.cNvPr = parseCNvPr(cnv);
      if (cnvPart)
        out.cNvContentPartPr = parseCNvContentPartPr(cnvPart);
      return out;
    }
    function renderNvContentPartPr(p) {
      const kids = [];
      if (p.cNvPr)
        kids.push(renderCNvPr(p.cNvPr));
      if (p.cNvContentPartPr)
        kids.push(renderCNvContentPartPr(p.cNvContentPartPr));
      return xml.el("wp:nvContentPartPr", {}, kids);
    }
    function parseExtLst(el) {
      if (!el)
        return;
      return { children: (el.children || []).slice() };
    }
    function renderExtLst(p) {
      return xml.el("wp:extLst", {}, p.children || []);
    }
    function parseXfrm(el) {
      if (!el)
        return;
      const out = {};
      if (el.attrs.rot != null)
        out.rot = el.attrs.rot;
      if (el.attrs.flipH != null)
        out.flipH = el.attrs.flipH;
      if (el.attrs.flipV != null)
        out.flipV = el.attrs.flipV;
      const off = xml.findChild(el, "a:off"), ext = xml.findChild(el, "a:ext");
      if (off)
        out.off = { x: off.attrs.x, y: off.attrs.y };
      if (ext)
        out.ext = { cx: ext.attrs.cx, cy: ext.attrs.cy };
      return out;
    }
    function renderXfrm(x) {
      const a = {};
      if (x.rot != null)
        a.rot = String(x.rot);
      if (x.flipH != null)
        a.flipH = String(x.flipH);
      if (x.flipV != null)
        a.flipV = String(x.flipV);
      const kids = [];
      if (x.off)
        kids.push(xml.el("a:off", { x: String(x.off.x), y: String(x.off.y) }));
      if (x.ext)
        kids.push(xml.el("a:ext", { cx: String(x.ext.cx), cy: String(x.ext.cy) }));
      return xml.el("wp:xfrm", a, kids);
    }
    function parseSpPr(el) {
      if (!el)
        return;
      const out = { attrs: { ...el.attrs }, children: [] };
      for (const c of elements(el))
        out.children.push(c);
      return out;
    }
    function renderSpPr(p) {
      return xml.el("wp:spPr", p.attrs || {}, p.children || []);
    }
    function parseGrpSpPr(el) {
      if (!el)
        return;
      const out = { attrs: { ...el.attrs }, children: [] };
      for (const c of elements(el))
        out.children.push(c);
      return out;
    }
    function renderGrpSpPr(p) {
      return xml.el("wp:grpSpPr", p.attrs || {}, p.children || []);
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
      return xml.el("wp:style", {}, kids);
    }
    const BODY_PR_ATTRS = [
      "rot",
      "spcFirstLastPara",
      "vertOverflow",
      "horzOverflow",
      "vert",
      "wrap",
      "lIns",
      "tIns",
      "rIns",
      "bIns",
      "numCol",
      "spcCol",
      "rtlCol",
      "fromWordArt",
      "anchor",
      "anchorCtr",
      "forceAA",
      "upright",
      "compatLnSpc"
    ];
    function parseBodyPr(el) {
      if (!el)
        return;
      const out = { attrs: {} };
      for (const k of BODY_PR_ATTRS)
        if (el.attrs[k] != null)
          out.attrs[k] = el.attrs[k];
      for (const c of elements(el))
        if (c.name === "a:prstTxWarp")
          out.prstTxWarp = { ...c.attrs };
        else if (c.name === "a:normAutofit")
          out.normAutofit = { ...c.attrs };
        else if (c.name === "a:spAutoFit")
          out.spAutoFit = !0;
        else if (c.name === "a:noAutofit")
          out.noAutofit = !0;
      return out;
    }
    function renderBodyPr(b) {
      const kids = [];
      if (b.prstTxWarp)
        kids.push(xml.el("a:prstTxWarp", { ...b.prstTxWarp }));
      if (b.normAutofit)
        kids.push(xml.el("a:normAutofit", { ...b.normAutofit }));
      if (b.spAutoFit)
        kids.push(xml.el("a:spAutoFit", {}));
      if (b.noAutofit)
        kids.push(xml.el("a:noAutofit", {}));
      return xml.el("wp:bodyPr", b.attrs || {}, kids);
    }
    function parseTxbxContent(el) {
      if (!el)
        return;
      return { children: (el.children || []).slice() };
    }
    function renderTxbxContent(t) {
      return xml.el("wp:txbxContent", {}, t.children || []);
    }
    function parseTxbx(el) {
      if (!el)
        return;
      const out = { attrs: { ...el.attrs } }, c = xml.findChild(el, "wp:txbxContent");
      if (c)
        out.content = parseTxbxContent(c);
      return out;
    }
    function renderTxbx(t) {
      const kids = [];
      if (t.content)
        kids.push(renderTxbxContent(t.content));
      return xml.el("wp:txbx", t.attrs || {}, kids);
    }
    function parseLinkedTxbx(el) {
      if (!el)
        return;
      return { id: el.attrs.id, seq: el.attrs.seq };
    }
    function renderLinkedTxbx(l) {
      const a = {};
      if (l.id != null)
        a.id = String(l.id);
      if (l.seq != null)
        a.seq = String(l.seq);
      return xml.el("wp:linkedTxbx", a);
    }
    function parseContentPart(el) {
      if (!el)
        return;
      const out = {};
      if (el.attrs["r:id"] != null)
        out.rId = el.attrs["r:id"];
      const nv = xml.findChild(el, "wp:nvContentPartPr"), xf = xml.findChild(el, "wp:xfrm"), ext = xml.findChild(el, "wp:extLst");
      if (nv)
        out.nvContentPartPr = parseNvContentPartPr(nv);
      if (xf)
        out.xfrm = parseXfrm(xf);
      if (ext)
        out.extLst = parseExtLst(ext);
      return out;
    }
    function renderContentPart(c) {
      const a = {};
      if (c.rId != null)
        a["r:id"] = String(c.rId);
      const kids = [];
      if (c.nvContentPartPr)
        kids.push(renderNvContentPartPr(c.nvContentPartPr));
      if (c.xfrm)
        kids.push(renderXfrm(c.xfrm));
      if (c.extLst)
        kids.push(renderExtLst(c.extLst));
      return xml.el("wp:contentPart", a, kids);
    }
    function parseWsp(el) {
      if (!el)
        return;
      const out = {}, cnPr = xml.findChild(el, "wp:cNvPr"), cnSp = xml.findChild(el, "wp:cNvSpPr"), cnCn = xml.findChild(el, "wp:cNvCnPr");
      if (cnPr)
        out.cNvPr = parseCNvPr(cnPr);
      if (cnSp)
        out.cNvSpPr = parseCNvSpPr(cnSp);
      if (cnCn)
        out.cNvCnPr = parseCNvCnPr(cnCn);
      for (const c of elements(el))
        switch (c.name) {
          case "wp:cNvPr":
            out.cNvPr = parseCNvPr(c);
            break;
          case "wp:cNvSpPr":
            out.cNvSpPr = parseCNvSpPr(c);
            break;
          case "wp:cNvCnPr":
            out.cNvCnPr = parseCNvCnPr(c);
            break;
          case "wp:spPr":
            out.spPr = parseSpPr(c);
            break;
          case "wp:style":
            out.style = parseStyle(c);
            break;
          case "wp:txbx":
            out.txbx = parseTxbx(c);
            break;
          case "wp:linkedTxbx":
            out.linkedTxbx = parseLinkedTxbx(c);
            break;
          case "wp:bodyPr":
            out.bodyPr = parseBodyPr(c);
            break;
          case "wp:extLst":
            out.extLst = parseExtLst(c);
            break;
          default:
            (out._extras = out._extras || []).push(c);
        }
      return out;
    }
    function renderWsp(w) {
      const kids = [];
      if (w.cNvPr)
        kids.push(renderCNvPr(w.cNvPr));
      if (w.cNvSpPr)
        kids.push(renderCNvSpPr(w.cNvSpPr));
      if (w.cNvCnPr)
        kids.push(renderCNvCnPr(w.cNvCnPr));
      if (w.spPr)
        kids.push(renderSpPr(w.spPr));
      if (w.style)
        kids.push(renderStyle(w.style));
      if (w.txbx)
        kids.push(renderTxbx(w.txbx));
      if (w.linkedTxbx)
        kids.push(renderLinkedTxbx(w.linkedTxbx));
      if (w.bodyPr)
        kids.push(renderBodyPr(w.bodyPr));
      if (w.extLst)
        kids.push(renderExtLst(w.extLst));
      if (w._extras)
        kids.push(...w._extras);
      return xml.el("wp:wsp", {}, kids);
    }
    function parseGraphicFrame(el) {
      if (!el)
        return;
      const out = {};
      for (const c of elements(el))
        switch (c.name) {
          case "wp:cNvPr":
            out.cNvPr = parseCNvPr(c);
            break;
          case "wp:cNvFrPr":
            out.cNvFrPr = parseCNvFrPr(c);
            break;
          case "wp:xfrm":
            out.xfrm = parseXfrm(c);
            break;
          case "a:graphic":
            out.graphic = c;
            break;
          case "wp:extLst":
            out.extLst = parseExtLst(c);
            break;
          default:
            (out._extras = out._extras || []).push(c);
        }
      return out;
    }
    function renderGraphicFrame(g) {
      const kids = [];
      if (g.cNvPr)
        kids.push(renderCNvPr(g.cNvPr));
      if (g.cNvFrPr)
        kids.push(renderCNvFrPr(g.cNvFrPr));
      if (g.xfrm)
        kids.push(renderXfrm(g.xfrm));
      if (g.graphic)
        kids.push(g.graphic);
      if (g.extLst)
        kids.push(renderExtLst(g.extLst));
      if (g._extras)
        kids.push(...g._extras);
      return xml.el("wp:graphicFrame", {}, kids);
    }
    function parseGrpSp(el) {
      if (!el)
        return;
      const out = { items: [] };
      for (const c of elements(el))
        switch (c.name) {
          case "wp:cNvPr":
            out.cNvPr = parseCNvPr(c);
            break;
          case "wp:cNvGrpSpPr":
            out.cNvGrpSpPr = parseCNvGrpSpPr(c);
            break;
          case "wp:grpSpPr":
            out.grpSpPr = parseGrpSpPr(c);
            break;
          case "wp:wsp":
            out.items.push({ kind: "wsp", node: parseWsp(c) });
            break;
          case "wp:grpSp":
            out.items.push({ kind: "grpSp", node: parseGrpSp(c) });
            break;
          case "wp:graphicFrame":
            out.items.push({ kind: "graphicFrame", node: parseGraphicFrame(c) });
            break;
          case "wp:contentPart":
            out.items.push({ kind: "contentPart", node: parseContentPart(c) });
            break;
          case "wp:extLst":
            out.extLst = parseExtLst(c);
            break;
          default:
            (out._extras = out._extras || []).push(c);
        }
      return out;
    }
    function renderGrpSp(g) {
      const kids = [];
      if (g.cNvPr)
        kids.push(renderCNvPr(g.cNvPr));
      if (g.cNvGrpSpPr)
        kids.push(renderCNvGrpSpPr(g.cNvGrpSpPr));
      if (g.grpSpPr)
        kids.push(renderGrpSpPr(g.grpSpPr));
      for (const it of g.items || [])
        if (it.kind === "wsp")
          kids.push(renderWsp(it.node));
        else if (it.kind === "grpSp")
          kids.push(renderGrpSp(it.node));
        else if (it.kind === "graphicFrame")
          kids.push(renderGraphicFrame(it.node));
        else if (it.kind === "contentPart")
          kids.push(renderContentPart(it.node));
      if (g.extLst)
        kids.push(renderExtLst(g.extLst));
      if (g._extras)
        kids.push(...g._extras);
      return xml.el("wp:grpSp", {}, kids);
    }
    function parseBg(el) {
      if (!el)
        return;
      return { children: (el.children || []).slice() };
    }
    function renderBg(b) {
      return xml.el("wp:bg", {}, b.children || []);
    }
    function parseWhole(el) {
      if (!el)
        return;
      const out = {}, bg = xml.findChild(el, "wp:bg"), style = xml.findChild(el, "wp:style");
      if (bg)
        out.bg = parseBg(bg);
      if (style)
        out.style = parseStyle(style);
      return out;
    }
    function renderWhole(w) {
      const kids = [];
      if (w.bg)
        kids.push(renderBg(w.bg));
      if (w.style)
        kids.push(renderStyle(w.style));
      return xml.el("wp:whole", {}, kids);
    }
    function parseWgp(el) {
      if (!el || el.name !== "wp:wgp") {
        if (el && el.name !== "wp:wgp")
          return;
        if (!el)
          return;
      }
      return parseGrpSp(el);
    }
    function parseWpcOrWgp(el) {
      if (!el)
        return;
      switch (el.name) {
        case "wp:wpc":
          return parseWpc(el);
        case "wp:wgp":
          return parseWgp(el);
        default:
          return;
      }
    }
    function renderWgp(g) {
      const kids = [];
      if (g.cNvPr)
        kids.push(renderCNvPr(g.cNvPr));
      if (g.cNvGrpSpPr)
        kids.push(renderCNvGrpSpPr(g.cNvGrpSpPr));
      if (g.grpSpPr)
        kids.push(renderGrpSpPr(g.grpSpPr));
      for (const it of g.items || [])
        if (it.kind === "wsp")
          kids.push(renderWsp(it.node));
        else if (it.kind === "grpSp")
          kids.push(renderGrpSp(it.node));
        else if (it.kind === "graphicFrame")
          kids.push(renderGraphicFrame(it.node));
        else if (it.kind === "contentPart")
          kids.push(renderContentPart(it.node));
      if (g.extLst)
        kids.push(renderExtLst(g.extLst));
      return xml.el("wp:wgp", {}, kids);
    }
    function parseWpc(el) {
      if (!el)
        return;
      const out = { items: [] };
      for (const c of elements(el))
        switch (c.name) {
          case "wp:bg":
            out.bg = parseBg(c);
            break;
          case "wp:whole":
            out.whole = parseWhole(c);
            break;
          case "wp:wsp":
            out.items.push({ kind: "wsp", node: parseWsp(c) });
            break;
          case "wp:grpSp":
            out.items.push({ kind: "grpSp", node: parseGrpSp(c) });
            break;
          case "wp:graphicFrame":
            out.items.push({ kind: "graphicFrame", node: parseGraphicFrame(c) });
            break;
          case "wp:contentPart":
            out.items.push({ kind: "contentPart", node: parseContentPart(c) });
            break;
          case "wp:extLst":
            out.extLst = parseExtLst(c);
            break;
          default:
            (out._extras = out._extras || []).push(c);
        }
      return out;
    }
    function renderWpc(w) {
      const kids = [];
      if (w.bg)
        kids.push(renderBg(w.bg));
      if (w.whole)
        kids.push(renderWhole(w.whole));
      for (const it of w.items || [])
        if (it.kind === "wsp")
          kids.push(renderWsp(it.node));
        else if (it.kind === "grpSp")
          kids.push(renderGrpSp(it.node));
        else if (it.kind === "graphicFrame")
          kids.push(renderGraphicFrame(it.node));
        else if (it.kind === "contentPart")
          kids.push(renderContentPart(it.node));
      if (w.extLst)
        kids.push(renderExtLst(w.extLst));
      return xml.el("wp:wpc", {}, kids);
    }
    function parseWrapPolygon(poly) {
      const out = { attrs: { ...poly.attrs }, points: [] };
      for (const pp of elements(poly))
        if (pp.name === "wp:start" || pp.name === "wp:lineTo")
          out.points.push({
            kind: pp.name.replace(/^wp:/, ""),
            x: pp.attrs.x,
            y: pp.attrs.y
          });
      return out;
    }
    function renderWrapPolygon(p) {
      const pts = (p.points || []).map((pt) => {
        if (pt.kind === "start")
          return xml.el("wp:start", { x: String(pt.x), y: String(pt.y) });
        return xml.el("wp:lineTo", { x: String(pt.x), y: String(pt.y) });
      });
      return xml.el("wp:wrapPolygon", p.attrs || {}, pts);
    }
    function renderWrap(w) {
      const wkids = [];
      if (w.polygon)
        wkids.push(renderWrapPolygon(w.polygon));
      switch (w.kind) {
        case "wrapNone":
          return xml.el("wp:wrapNone", w.attrs || {}, wkids);
        case "wrapSquare":
          return xml.el("wp:wrapSquare", w.attrs || {}, wkids);
        case "wrapTight":
          return xml.el("wp:wrapTight", w.attrs || {}, wkids);
        case "wrapThrough":
          return xml.el("wp:wrapThrough", w.attrs || {}, wkids);
        case "wrapTopAndBottom":
          return xml.el("wp:wrapTopAndBottom", w.attrs || {}, wkids);
        default:
          return xml.el("wp:" + w.kind, w.attrs || {}, wkids);
      }
    }
    function parseAnchorBody(el) {
      const out = { attrs: { ...el.attrs } };
      for (const c of elements(el))
        switch (c.name) {
          case "wp:simplePos":
            out.simplePosCoords = { x: c.attrs.x, y: c.attrs.y };
            break;
          case "wp:positionH":
          case "wp:positionV": {
            const dim = c.name.endsWith("H") ? "H" : "V", o = { relativeFrom: c.attrs.relativeFrom }, align = xml.findChild(c, "wp:align"), off = xml.findChild(c, "wp:posOffset");
            if (align)
              o.align = xml.textContent(align);
            if (off)
              o.posOffset = Number(xml.textContent(off));
            out["position" + dim] = o;
            break;
          }
          case "wp:extent":
            out.extent = { cx: c.attrs.cx, cy: c.attrs.cy };
            break;
          case "wp:effectExtent":
            out.effectExtent = { ...c.attrs };
            break;
          case "wp:wrapNone":
          case "wp:wrapSquare":
          case "wp:wrapTight":
          case "wp:wrapThrough":
          case "wp:wrapTopAndBottom": {
            const w = { kind: c.name.replace(/^wp:/, ""), attrs: { ...c.attrs } }, poly = xml.findChild(c, "wp:wrapPolygon");
            if (poly)
              w.polygon = parseWrapPolygon(poly);
            out.wrap = w;
            break;
          }
          case "wp:docPr":
            out.docPr = { ...c.attrs };
            break;
          case "wp:cNvGraphicFramePr":
            out.cNvGraphicFramePr = { children: (c.children || []).slice() };
            break;
          case "a:graphic":
            out.graphic = c;
            break;
          case "wp:extLst":
            out.extLst = parseExtLst(c);
            break;
          default:
            (out._extras = out._extras || []).push(c);
        }
      return out;
    }
    function renderAnchorChildren(a) {
      const kids = [];
      if (a.simplePosCoords)
        kids.push(xml.el("wp:simplePos", { x: String(a.simplePosCoords.x), y: String(a.simplePosCoords.y) }));
      function renderPosInner(p) {
        const inner = [];
        if (p.align != null)
          inner.push(xml.el("wp:align", {}, [xml.text(p.align)]));
        if (p.posOffset != null)
          inner.push(xml.el("wp:posOffset", {}, [xml.text(String(p.posOffset))]));
        return inner;
      }
      if (a.positionH)
        kids.push(xml.el("wp:positionH", { relativeFrom: a.positionH.relativeFrom || "column" }, renderPosInner(a.positionH)));
      if (a.positionV)
        kids.push(xml.el("wp:positionV", { relativeFrom: a.positionV.relativeFrom || "paragraph" }, renderPosInner(a.positionV)));
      if (a.extent)
        kids.push(xml.el("wp:extent", { cx: String(a.extent.cx), cy: String(a.extent.cy) }));
      if (a.effectExtent)
        kids.push(xml.el("wp:effectExtent", { ...a.effectExtent }));
      if (a.wrap)
        kids.push(renderWrap(a.wrap));
      if (a.docPr)
        kids.push(xml.el("wp:docPr", { ...a.docPr }));
      if (a.cNvGraphicFramePr)
        kids.push(xml.el("wp:cNvGraphicFramePr", {}, a.cNvGraphicFramePr.children || []));
      if (a.graphic)
        kids.push(a.graphic);
      if (a.extLst)
        kids.push(renderExtLst(a.extLst));
      if (a._extras)
        kids.push(...a._extras);
      return kids;
    }
    function parseAnchor(el) {
      if (!el)
        return;
      return parseAnchorBody(el);
    }
    function renderAnchor(a) {
      if (!a)
        return null;
      return xml.el("wp:anchor", a.attrs || {}, renderAnchorChildren(a));
    }
    function parseInline(el) {
      if (!el)
        return;
      return parseAnchorBody(el);
    }
    function renderInline(a) {
      if (!a)
        return null;
      return xml.el("wp:inline", a.attrs || {}, renderAnchorChildren(a));
    }
    return {
      ANCHOR_FLAGS,
      WRAP_KINDS,
      parseAnchor,
      renderAnchor,
      parseInline,
      renderInline,
      parseWrapPolygon,
      renderWrapPolygon,
      renderWrap,
      parseCNvPr,
      renderCNvPr,
      parseCNvSpPr,
      renderCNvSpPr,
      parseCNvCnPr,
      renderCNvCnPr,
      parseCNvFrPr,
      renderCNvFrPr,
      parseCNvGrpSpPr,
      renderCNvGrpSpPr,
      parseCNvContentPartPr,
      renderCNvContentPartPr,
      parseNvContentPartPr,
      renderNvContentPartPr,
      parseExtLst,
      renderExtLst,
      parseXfrm,
      renderXfrm,
      parseSpPr,
      renderSpPr,
      parseGrpSpPr,
      renderGrpSpPr,
      parseStyle,
      renderStyle,
      parseBodyPr,
      renderBodyPr,
      parseTxbx,
      renderTxbx,
      parseTxbxContent,
      renderTxbxContent,
      parseLinkedTxbx,
      renderLinkedTxbx,
      parseContentPart,
      renderContentPart,
      parseWsp,
      renderWsp,
      parseGraphicFrame,
      renderGraphicFrame,
      parseGrpSp,
      renderGrpSp,
      parseWgp,
      renderWgp,
      parseWpc,
      renderWpc,
      parseWpcOrWgp,
      parseWhole,
      renderWhole,
      parseBg,
      renderBg
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

    const __core = __resolve("docx");
    __core.use(__resolve("wmlRunFormatting"), __resolve("wmlParagraphFormatting"), __resolve("wmlTableProperties"), __resolve("wmlNumberingDetails"), __resolve("wmlSettings"), __resolve("wmlFields"), __resolve("wmlTrackedChanges"), __resolve("mathAdvanced"), __resolve("dmlWpPositioning"), __resolve("dmlEffects"), __resolve("dmlFillsAdvanced"));
    return __core;
    }
};
