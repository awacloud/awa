/*!
 * Copyright (c) 2026 AwaCloud SAS
 * Author: Matthieu Bouilloux
 * SPDX-License-Identifier: AGPL-3.0-only
 * Dual-licensed; see the NOTICE file for licensing and any additional terms.
 */
/* GENERATED — do not edit. Source: packages/front/office/ooxml/tools/generate-bundles.mjs */

/**
 * @fileoverview `@awacloud/ooxml/bundles/prebuilt/pptx-full-bundled` — pre-built single-factory bundle.
 *
 * Variant **bundled** : declares no dependencies — every fw and ooxml-local
 * factory transitively reachable from `pptx` plus 19 extras is inlined.
 *
 * @module ooxml/bundles/prebuilt/pptx-full-bundled
 */

export const pptxFullBundled = {
    name: "pptxFullBundled",
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
    __register({ name: "pmlMisc", dependencies: ["xml"], factory: function(xml) {
    const ELEMENTS = ["p:bgPr", "p:bgRef", "p:blinds", "p:bodyStyle", "p:bold", "p:boldItalic", "p:browse", "p:cNvCxnSpPr", "p:cSldViewPr", "p:cViewPr", "p:checker", "p:circle", "p:clrMru", "p:cm", "p:cmAuthor", "p:cmAuthorLst", "p:cmLst", "p:comb", "p:contentPart", "p:control", "p:controls", "p:cover", "p:custData", "p:custDataLst", "p:custShow", "p:custShowLst", "p:cut", "p:cxnSp", "p:defaultTextStyle", "p:diamond", "p:dissolve", "p:embed", "p:embeddedFont", "p:embeddedFontLst", "p:ext", "p:extLst", "p:fade", "p:font", "p:gridSpacing", "p:grpSp", "p:guide", "p:guideLst", "p:handoutMaster", "p:handoutMasterId", "p:handoutMasterIdLst", "p:hf", "p:italic", "p:kinsoku", "p:kiosk", "p:link", "p:modifyVerifier", "p:newsflash", "p:normalViewPr", "p:notes", "p:notesMaster", "p:notesMasterId", "p:notesMasterIdLst", "p:notesStyle", "p:notesTextViewPr", "p:notesViewPr", "p:nvCxnSpPr", "p:oleObj", "p:origin", "p:otherStyle", "p:penClr", "p:photoAlbum", "p:pos", "p:present", "p:presentationPr", "p:prnPr", "p:rCtr", "p:regular", "p:restoredLeft", "p:restoredTop", "p:scale", "p:showPr", "p:sld", "p:sldAll", "p:sldLst", "p:sldMaster", "p:sldRg", "p:sldSyncPr", "p:sldSz", "p:slideViewPr", "p:smartTags", "p:tag", "p:tagLst", "p:tags", "p:text", "p:titleStyle", "p:txStyles", "p:viewPr"];
    function parseElement(el) {
      if (!el || el.type !== "element")
        return null;
      switch (el.name) {
        case "p:bgPr":
          return { _passthrough: !0, kind: "bgPr", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "p:bgRef":
          return { _passthrough: !0, kind: "bgRef", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "p:blinds":
          return { _passthrough: !0, kind: "blinds", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "p:bodyStyle":
          return { _passthrough: !0, kind: "bodyStyle", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "p:bold":
          return { _passthrough: !0, kind: "bold", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "p:boldItalic":
          return { _passthrough: !0, kind: "boldItalic", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "p:browse":
          return { _passthrough: !0, kind: "browse", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "p:cNvCxnSpPr":
          return { _passthrough: !0, kind: "cNvCxnSpPr", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "p:cSldViewPr":
          return { _passthrough: !0, kind: "cSldViewPr", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "p:cViewPr":
          return { _passthrough: !0, kind: "cViewPr", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "p:checker":
          return { _passthrough: !0, kind: "checker", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "p:circle":
          return { _passthrough: !0, kind: "circle", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "p:clrMru":
          return { _passthrough: !0, kind: "clrMru", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "p:cm":
          return { _passthrough: !0, kind: "cm", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "p:cmAuthor":
          return { _passthrough: !0, kind: "cmAuthor", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "p:cmAuthorLst":
          return { _passthrough: !0, kind: "cmAuthorLst", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "p:cmLst":
          return { _passthrough: !0, kind: "cmLst", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "p:comb":
          return { _passthrough: !0, kind: "comb", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "p:contentPart":
          return { _passthrough: !0, kind: "contentPart", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "p:control":
          return { _passthrough: !0, kind: "control", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "p:controls":
          return { _passthrough: !0, kind: "controls", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "p:cover":
          return { _passthrough: !0, kind: "cover", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "p:custData":
          return { _passthrough: !0, kind: "custData", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "p:custDataLst":
          return { _passthrough: !0, kind: "custDataLst", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "p:custShow":
          return { _passthrough: !0, kind: "custShow", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "p:custShowLst":
          return { _passthrough: !0, kind: "custShowLst", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "p:cut":
          return { _passthrough: !0, kind: "cut", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "p:cxnSp":
          return { _passthrough: !0, kind: "cxnSp", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "p:defaultTextStyle":
          return { _passthrough: !0, kind: "defaultTextStyle", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "p:diamond":
          return { _passthrough: !0, kind: "diamond", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "p:dissolve":
          return { _passthrough: !0, kind: "dissolve", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "p:embed":
          return { _passthrough: !0, kind: "embed", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "p:embeddedFont":
          return { _passthrough: !0, kind: "embeddedFont", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "p:embeddedFontLst":
          return { _passthrough: !0, kind: "embeddedFontLst", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "p:ext":
          return { _passthrough: !0, kind: "ext", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "p:extLst":
          return { _passthrough: !0, kind: "extLst", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "p:fade":
          return { _passthrough: !0, kind: "fade", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "p:font":
          return { _passthrough: !0, kind: "font", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "p:gridSpacing":
          return { _passthrough: !0, kind: "gridSpacing", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "p:grpSp":
          return { _passthrough: !0, kind: "grpSp", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "p:guide":
          return { _passthrough: !0, kind: "guide", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "p:guideLst":
          return { _passthrough: !0, kind: "guideLst", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "p:handoutMaster":
          return { _passthrough: !0, kind: "handoutMaster", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "p:handoutMasterId":
          return { _passthrough: !0, kind: "handoutMasterId", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "p:handoutMasterIdLst":
          return { _passthrough: !0, kind: "handoutMasterIdLst", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "p:hf":
          return { _passthrough: !0, kind: "hf", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "p:italic":
          return { _passthrough: !0, kind: "italic", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "p:kinsoku":
          return { _passthrough: !0, kind: "kinsoku", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "p:kiosk":
          return { _passthrough: !0, kind: "kiosk", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "p:link":
          return { _passthrough: !0, kind: "link", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "p:modifyVerifier":
          return { _passthrough: !0, kind: "modifyVerifier", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "p:newsflash":
          return { _passthrough: !0, kind: "newsflash", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "p:normalViewPr":
          return { _passthrough: !0, kind: "normalViewPr", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "p:notes":
          return { _passthrough: !0, kind: "notes", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "p:notesMaster":
          return { _passthrough: !0, kind: "notesMaster", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "p:notesMasterId":
          return { _passthrough: !0, kind: "notesMasterId", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "p:notesMasterIdLst":
          return { _passthrough: !0, kind: "notesMasterIdLst", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "p:notesStyle":
          return { _passthrough: !0, kind: "notesStyle", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "p:notesTextViewPr":
          return { _passthrough: !0, kind: "notesTextViewPr", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "p:notesViewPr":
          return { _passthrough: !0, kind: "notesViewPr", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "p:nvCxnSpPr":
          return { _passthrough: !0, kind: "nvCxnSpPr", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "p:oleObj":
          return { _passthrough: !0, kind: "oleObj", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "p:origin":
          return { _passthrough: !0, kind: "origin", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "p:otherStyle":
          return { _passthrough: !0, kind: "otherStyle", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "p:penClr":
          return { _passthrough: !0, kind: "penClr", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "p:photoAlbum":
          return { _passthrough: !0, kind: "photoAlbum", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "p:pos":
          return { _passthrough: !0, kind: "pos", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "p:present":
          return { _passthrough: !0, kind: "present", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "p:presentationPr":
          return { _passthrough: !0, kind: "presentationPr", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "p:prnPr":
          return { _passthrough: !0, kind: "prnPr", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "p:rCtr":
          return { _passthrough: !0, kind: "rCtr", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "p:regular":
          return { _passthrough: !0, kind: "regular", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "p:restoredLeft":
          return { _passthrough: !0, kind: "restoredLeft", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "p:restoredTop":
          return { _passthrough: !0, kind: "restoredTop", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "p:scale":
          return { _passthrough: !0, kind: "scale", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "p:showPr":
          return { _passthrough: !0, kind: "showPr", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "p:sld":
          return { _passthrough: !0, kind: "sld", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "p:sldAll":
          return { _passthrough: !0, kind: "sldAll", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "p:sldLst":
          return { _passthrough: !0, kind: "sldLst", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "p:sldMaster":
          return { _passthrough: !0, kind: "sldMaster", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "p:sldRg":
          return { _passthrough: !0, kind: "sldRg", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "p:sldSyncPr":
          return { _passthrough: !0, kind: "sldSyncPr", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "p:sldSz":
          return { _passthrough: !0, kind: "sldSz", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "p:slideViewPr":
          return { _passthrough: !0, kind: "slideViewPr", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "p:smartTags":
          return { _passthrough: !0, kind: "smartTags", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "p:tag":
          return { _passthrough: !0, kind: "tag", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "p:tagLst":
          return { _passthrough: !0, kind: "tagLst", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "p:tags":
          return { _passthrough: !0, kind: "tags", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "p:text":
          return { _passthrough: !0, kind: "text", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "p:titleStyle":
          return { _passthrough: !0, kind: "titleStyle", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "p:txStyles":
          return { _passthrough: !0, kind: "txStyles", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "p:viewPr":
          return { _passthrough: !0, kind: "viewPr", attrs: { ...el.attrs }, children: [...el.children || []] };
        default:
          return null;
      }
    }
    function renderElement(obj) {
      if (!obj || !obj.kind)
        return null;
      switch (obj.kind) {
        case "bgPr":
          return xml.el("p:bgPr", obj.attrs || {}, obj.children || []);
        case "bgRef":
          return xml.el("p:bgRef", obj.attrs || {}, obj.children || []);
        case "blinds":
          return xml.el("p:blinds", obj.attrs || {}, obj.children || []);
        case "bodyStyle":
          return xml.el("p:bodyStyle", obj.attrs || {}, obj.children || []);
        case "bold":
          return xml.el("p:bold", obj.attrs || {}, obj.children || []);
        case "boldItalic":
          return xml.el("p:boldItalic", obj.attrs || {}, obj.children || []);
        case "browse":
          return xml.el("p:browse", obj.attrs || {}, obj.children || []);
        case "cNvCxnSpPr":
          return xml.el("p:cNvCxnSpPr", obj.attrs || {}, obj.children || []);
        case "cSldViewPr":
          return xml.el("p:cSldViewPr", obj.attrs || {}, obj.children || []);
        case "cViewPr":
          return xml.el("p:cViewPr", obj.attrs || {}, obj.children || []);
        case "checker":
          return xml.el("p:checker", obj.attrs || {}, obj.children || []);
        case "circle":
          return xml.el("p:circle", obj.attrs || {}, obj.children || []);
        case "clrMru":
          return xml.el("p:clrMru", obj.attrs || {}, obj.children || []);
        case "cm":
          return xml.el("p:cm", obj.attrs || {}, obj.children || []);
        case "cmAuthor":
          return xml.el("p:cmAuthor", obj.attrs || {}, obj.children || []);
        case "cmAuthorLst":
          return xml.el("p:cmAuthorLst", obj.attrs || {}, obj.children || []);
        case "cmLst":
          return xml.el("p:cmLst", obj.attrs || {}, obj.children || []);
        case "comb":
          return xml.el("p:comb", obj.attrs || {}, obj.children || []);
        case "contentPart":
          return xml.el("p:contentPart", obj.attrs || {}, obj.children || []);
        case "control":
          return xml.el("p:control", obj.attrs || {}, obj.children || []);
        case "controls":
          return xml.el("p:controls", obj.attrs || {}, obj.children || []);
        case "cover":
          return xml.el("p:cover", obj.attrs || {}, obj.children || []);
        case "custData":
          return xml.el("p:custData", obj.attrs || {}, obj.children || []);
        case "custDataLst":
          return xml.el("p:custDataLst", obj.attrs || {}, obj.children || []);
        case "custShow":
          return xml.el("p:custShow", obj.attrs || {}, obj.children || []);
        case "custShowLst":
          return xml.el("p:custShowLst", obj.attrs || {}, obj.children || []);
        case "cut":
          return xml.el("p:cut", obj.attrs || {}, obj.children || []);
        case "cxnSp":
          return xml.el("p:cxnSp", obj.attrs || {}, obj.children || []);
        case "defaultTextStyle":
          return xml.el("p:defaultTextStyle", obj.attrs || {}, obj.children || []);
        case "diamond":
          return xml.el("p:diamond", obj.attrs || {}, obj.children || []);
        case "dissolve":
          return xml.el("p:dissolve", obj.attrs || {}, obj.children || []);
        case "embed":
          return xml.el("p:embed", obj.attrs || {}, obj.children || []);
        case "embeddedFont":
          return xml.el("p:embeddedFont", obj.attrs || {}, obj.children || []);
        case "embeddedFontLst":
          return xml.el("p:embeddedFontLst", obj.attrs || {}, obj.children || []);
        case "ext":
          return xml.el("p:ext", obj.attrs || {}, obj.children || []);
        case "extLst":
          return xml.el("p:extLst", obj.attrs || {}, obj.children || []);
        case "fade":
          return xml.el("p:fade", obj.attrs || {}, obj.children || []);
        case "font":
          return xml.el("p:font", obj.attrs || {}, obj.children || []);
        case "gridSpacing":
          return xml.el("p:gridSpacing", obj.attrs || {}, obj.children || []);
        case "grpSp":
          return xml.el("p:grpSp", obj.attrs || {}, obj.children || []);
        case "guide":
          return xml.el("p:guide", obj.attrs || {}, obj.children || []);
        case "guideLst":
          return xml.el("p:guideLst", obj.attrs || {}, obj.children || []);
        case "handoutMaster":
          return xml.el("p:handoutMaster", obj.attrs || {}, obj.children || []);
        case "handoutMasterId":
          return xml.el("p:handoutMasterId", obj.attrs || {}, obj.children || []);
        case "handoutMasterIdLst":
          return xml.el("p:handoutMasterIdLst", obj.attrs || {}, obj.children || []);
        case "hf":
          return xml.el("p:hf", obj.attrs || {}, obj.children || []);
        case "italic":
          return xml.el("p:italic", obj.attrs || {}, obj.children || []);
        case "kinsoku":
          return xml.el("p:kinsoku", obj.attrs || {}, obj.children || []);
        case "kiosk":
          return xml.el("p:kiosk", obj.attrs || {}, obj.children || []);
        case "link":
          return xml.el("p:link", obj.attrs || {}, obj.children || []);
        case "modifyVerifier":
          return xml.el("p:modifyVerifier", obj.attrs || {}, obj.children || []);
        case "newsflash":
          return xml.el("p:newsflash", obj.attrs || {}, obj.children || []);
        case "normalViewPr":
          return xml.el("p:normalViewPr", obj.attrs || {}, obj.children || []);
        case "notes":
          return xml.el("p:notes", obj.attrs || {}, obj.children || []);
        case "notesMaster":
          return xml.el("p:notesMaster", obj.attrs || {}, obj.children || []);
        case "notesMasterId":
          return xml.el("p:notesMasterId", obj.attrs || {}, obj.children || []);
        case "notesMasterIdLst":
          return xml.el("p:notesMasterIdLst", obj.attrs || {}, obj.children || []);
        case "notesStyle":
          return xml.el("p:notesStyle", obj.attrs || {}, obj.children || []);
        case "notesTextViewPr":
          return xml.el("p:notesTextViewPr", obj.attrs || {}, obj.children || []);
        case "notesViewPr":
          return xml.el("p:notesViewPr", obj.attrs || {}, obj.children || []);
        case "nvCxnSpPr":
          return xml.el("p:nvCxnSpPr", obj.attrs || {}, obj.children || []);
        case "oleObj":
          return xml.el("p:oleObj", obj.attrs || {}, obj.children || []);
        case "origin":
          return xml.el("p:origin", obj.attrs || {}, obj.children || []);
        case "otherStyle":
          return xml.el("p:otherStyle", obj.attrs || {}, obj.children || []);
        case "penClr":
          return xml.el("p:penClr", obj.attrs || {}, obj.children || []);
        case "photoAlbum":
          return xml.el("p:photoAlbum", obj.attrs || {}, obj.children || []);
        case "pos":
          return xml.el("p:pos", obj.attrs || {}, obj.children || []);
        case "present":
          return xml.el("p:present", obj.attrs || {}, obj.children || []);
        case "presentationPr":
          return xml.el("p:presentationPr", obj.attrs || {}, obj.children || []);
        case "prnPr":
          return xml.el("p:prnPr", obj.attrs || {}, obj.children || []);
        case "rCtr":
          return xml.el("p:rCtr", obj.attrs || {}, obj.children || []);
        case "regular":
          return xml.el("p:regular", obj.attrs || {}, obj.children || []);
        case "restoredLeft":
          return xml.el("p:restoredLeft", obj.attrs || {}, obj.children || []);
        case "restoredTop":
          return xml.el("p:restoredTop", obj.attrs || {}, obj.children || []);
        case "scale":
          return xml.el("p:scale", obj.attrs || {}, obj.children || []);
        case "showPr":
          return xml.el("p:showPr", obj.attrs || {}, obj.children || []);
        case "sld":
          return xml.el("p:sld", obj.attrs || {}, obj.children || []);
        case "sldAll":
          return xml.el("p:sldAll", obj.attrs || {}, obj.children || []);
        case "sldLst":
          return xml.el("p:sldLst", obj.attrs || {}, obj.children || []);
        case "sldMaster":
          return xml.el("p:sldMaster", obj.attrs || {}, obj.children || []);
        case "sldRg":
          return xml.el("p:sldRg", obj.attrs || {}, obj.children || []);
        case "sldSyncPr":
          return xml.el("p:sldSyncPr", obj.attrs || {}, obj.children || []);
        case "sldSz":
          return xml.el("p:sldSz", obj.attrs || {}, obj.children || []);
        case "slideViewPr":
          return xml.el("p:slideViewPr", obj.attrs || {}, obj.children || []);
        case "smartTags":
          return xml.el("p:smartTags", obj.attrs || {}, obj.children || []);
        case "tag":
          return xml.el("p:tag", obj.attrs || {}, obj.children || []);
        case "tagLst":
          return xml.el("p:tagLst", obj.attrs || {}, obj.children || []);
        case "tags":
          return xml.el("p:tags", obj.attrs || {}, obj.children || []);
        case "text":
          return xml.el("p:text", obj.attrs || {}, obj.children || []);
        case "titleStyle":
          return xml.el("p:titleStyle", obj.attrs || {}, obj.children || []);
        case "txStyles":
          return xml.el("p:txStyles", obj.attrs || {}, obj.children || []);
        case "viewPr":
          return xml.el("p:viewPr", obj.attrs || {}, obj.children || []);
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
    __register({ name: "mathMisc", dependencies: ["xml"], factory: function(xml) {
    const ELEMENTS = ["m:alnScr", "m:argPr", "m:argSz", "m:baseJc", "m:brkBin", "m:brkBinSub", "m:cGp", "m:cGpRule", "m:cSp", "m:count", "m:defJc", "m:degHide", "m:diff", "m:dispDef", "m:fPr", "m:funcPr", "m:grow", "m:hideBot", "m:hideLeft", "m:hideRight", "m:hideTop", "m:interSp", "m:intraSp", "m:jc", "m:lMargin", "m:limLoc", "m:lit", "m:mPr", "m:mathFont", "m:maxDist", "m:mcJc", "m:naryLim", "m:noBreak", "m:nor", "m:objDist", "m:opEmu", "m:plcHide", "m:postSp", "m:preSp", "m:rMargin", "m:radPr", "m:sPre", "m:sPrePr", "m:sSubPr", "m:sSubSupPr", "m:sSupPr", "m:type"];
    function parseElement(el) {
      if (!el || el.type !== "element")
        return null;
      switch (el.name) {
        case "m:alnScr":
          return { _passthrough: !0, kind: "alnScr", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "m:argPr":
          return { _passthrough: !0, kind: "argPr", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "m:argSz":
          return { _passthrough: !0, kind: "argSz", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "m:baseJc":
          return { _passthrough: !0, kind: "baseJc", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "m:brkBin":
          return { _passthrough: !0, kind: "brkBin", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "m:brkBinSub":
          return { _passthrough: !0, kind: "brkBinSub", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "m:cGp":
          return { _passthrough: !0, kind: "cGp", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "m:cGpRule":
          return { _passthrough: !0, kind: "cGpRule", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "m:cSp":
          return { _passthrough: !0, kind: "cSp", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "m:count":
          return { _passthrough: !0, kind: "count", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "m:defJc":
          return { _passthrough: !0, kind: "defJc", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "m:degHide":
          return { _passthrough: !0, kind: "degHide", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "m:diff":
          return { _passthrough: !0, kind: "diff", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "m:dispDef":
          return { _passthrough: !0, kind: "dispDef", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "m:fPr":
          return { _passthrough: !0, kind: "fPr", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "m:funcPr":
          return { _passthrough: !0, kind: "funcPr", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "m:grow":
          return { _passthrough: !0, kind: "grow", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "m:hideBot":
          return { _passthrough: !0, kind: "hideBot", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "m:hideLeft":
          return { _passthrough: !0, kind: "hideLeft", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "m:hideRight":
          return { _passthrough: !0, kind: "hideRight", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "m:hideTop":
          return { _passthrough: !0, kind: "hideTop", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "m:interSp":
          return { _passthrough: !0, kind: "interSp", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "m:intraSp":
          return { _passthrough: !0, kind: "intraSp", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "m:jc":
          return { _passthrough: !0, kind: "jc", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "m:lMargin":
          return { _passthrough: !0, kind: "lMargin", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "m:limLoc":
          return { _passthrough: !0, kind: "limLoc", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "m:lit":
          return { _passthrough: !0, kind: "lit", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "m:mPr":
          return { _passthrough: !0, kind: "mPr", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "m:mathFont":
          return { _passthrough: !0, kind: "mathFont", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "m:maxDist":
          return { _passthrough: !0, kind: "maxDist", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "m:mcJc":
          return { _passthrough: !0, kind: "mcJc", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "m:naryLim":
          return { _passthrough: !0, kind: "naryLim", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "m:noBreak":
          return { _passthrough: !0, kind: "noBreak", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "m:nor":
          return { _passthrough: !0, kind: "nor", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "m:objDist":
          return { _passthrough: !0, kind: "objDist", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "m:opEmu":
          return { _passthrough: !0, kind: "opEmu", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "m:plcHide":
          return { _passthrough: !0, kind: "plcHide", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "m:postSp":
          return { _passthrough: !0, kind: "postSp", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "m:preSp":
          return { _passthrough: !0, kind: "preSp", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "m:rMargin":
          return { _passthrough: !0, kind: "rMargin", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "m:radPr":
          return { _passthrough: !0, kind: "radPr", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "m:sPre":
          return { _passthrough: !0, kind: "sPre", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "m:sPrePr":
          return { _passthrough: !0, kind: "sPrePr", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "m:sSubPr":
          return { _passthrough: !0, kind: "sSubPr", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "m:sSubSupPr":
          return { _passthrough: !0, kind: "sSubSupPr", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "m:sSupPr":
          return { _passthrough: !0, kind: "sSupPr", attrs: { ...el.attrs }, children: [...el.children || []] };
        case "m:type":
          return { _passthrough: !0, kind: "type", attrs: { ...el.attrs }, children: [...el.children || []] };
        default:
          return null;
      }
    }
    function renderElement(obj) {
      if (!obj || !obj.kind)
        return null;
      switch (obj.kind) {
        case "alnScr":
          return xml.el("m:alnScr", obj.attrs || {}, obj.children || []);
        case "argPr":
          return xml.el("m:argPr", obj.attrs || {}, obj.children || []);
        case "argSz":
          return xml.el("m:argSz", obj.attrs || {}, obj.children || []);
        case "baseJc":
          return xml.el("m:baseJc", obj.attrs || {}, obj.children || []);
        case "brkBin":
          return xml.el("m:brkBin", obj.attrs || {}, obj.children || []);
        case "brkBinSub":
          return xml.el("m:brkBinSub", obj.attrs || {}, obj.children || []);
        case "cGp":
          return xml.el("m:cGp", obj.attrs || {}, obj.children || []);
        case "cGpRule":
          return xml.el("m:cGpRule", obj.attrs || {}, obj.children || []);
        case "cSp":
          return xml.el("m:cSp", obj.attrs || {}, obj.children || []);
        case "count":
          return xml.el("m:count", obj.attrs || {}, obj.children || []);
        case "defJc":
          return xml.el("m:defJc", obj.attrs || {}, obj.children || []);
        case "degHide":
          return xml.el("m:degHide", obj.attrs || {}, obj.children || []);
        case "diff":
          return xml.el("m:diff", obj.attrs || {}, obj.children || []);
        case "dispDef":
          return xml.el("m:dispDef", obj.attrs || {}, obj.children || []);
        case "fPr":
          return xml.el("m:fPr", obj.attrs || {}, obj.children || []);
        case "funcPr":
          return xml.el("m:funcPr", obj.attrs || {}, obj.children || []);
        case "grow":
          return xml.el("m:grow", obj.attrs || {}, obj.children || []);
        case "hideBot":
          return xml.el("m:hideBot", obj.attrs || {}, obj.children || []);
        case "hideLeft":
          return xml.el("m:hideLeft", obj.attrs || {}, obj.children || []);
        case "hideRight":
          return xml.el("m:hideRight", obj.attrs || {}, obj.children || []);
        case "hideTop":
          return xml.el("m:hideTop", obj.attrs || {}, obj.children || []);
        case "interSp":
          return xml.el("m:interSp", obj.attrs || {}, obj.children || []);
        case "intraSp":
          return xml.el("m:intraSp", obj.attrs || {}, obj.children || []);
        case "jc":
          return xml.el("m:jc", obj.attrs || {}, obj.children || []);
        case "lMargin":
          return xml.el("m:lMargin", obj.attrs || {}, obj.children || []);
        case "limLoc":
          return xml.el("m:limLoc", obj.attrs || {}, obj.children || []);
        case "lit":
          return xml.el("m:lit", obj.attrs || {}, obj.children || []);
        case "mPr":
          return xml.el("m:mPr", obj.attrs || {}, obj.children || []);
        case "mathFont":
          return xml.el("m:mathFont", obj.attrs || {}, obj.children || []);
        case "maxDist":
          return xml.el("m:maxDist", obj.attrs || {}, obj.children || []);
        case "mcJc":
          return xml.el("m:mcJc", obj.attrs || {}, obj.children || []);
        case "naryLim":
          return xml.el("m:naryLim", obj.attrs || {}, obj.children || []);
        case "noBreak":
          return xml.el("m:noBreak", obj.attrs || {}, obj.children || []);
        case "nor":
          return xml.el("m:nor", obj.attrs || {}, obj.children || []);
        case "objDist":
          return xml.el("m:objDist", obj.attrs || {}, obj.children || []);
        case "opEmu":
          return xml.el("m:opEmu", obj.attrs || {}, obj.children || []);
        case "plcHide":
          return xml.el("m:plcHide", obj.attrs || {}, obj.children || []);
        case "postSp":
          return xml.el("m:postSp", obj.attrs || {}, obj.children || []);
        case "preSp":
          return xml.el("m:preSp", obj.attrs || {}, obj.children || []);
        case "rMargin":
          return xml.el("m:rMargin", obj.attrs || {}, obj.children || []);
        case "radPr":
          return xml.el("m:radPr", obj.attrs || {}, obj.children || []);
        case "sPre":
          return xml.el("m:sPre", obj.attrs || {}, obj.children || []);
        case "sPrePr":
          return xml.el("m:sPrePr", obj.attrs || {}, obj.children || []);
        case "sSubPr":
          return xml.el("m:sSubPr", obj.attrs || {}, obj.children || []);
        case "sSubSupPr":
          return xml.el("m:sSubSupPr", obj.attrs || {}, obj.children || []);
        case "sSupPr":
          return xml.el("m:sSupPr", obj.attrs || {}, obj.children || []);
        case "type":
          return xml.el("m:type", obj.attrs || {}, obj.children || []);
        default:
          return null;
      }
    }
    return { parseElement, renderElement, ELEMENTS };
  } });

    const __core = __resolve("pptx");
    __core.use(__resolve("pmlAnimations"), __resolve("pmlTransitions"), __resolve("pmlNotes"), __resolve("pmlLayoutsTyped"), __resolve("dmlChartDataLabels"), __resolve("dmlChartTrendlines"), __resolve("dmlChartAxesAdvanced"), __resolve("dmlChart3d"), __resolve("dmlChartOtherTypes"), __resolve("mathAdvanced"), __resolve("dmlEffects"), __resolve("dmlFillsAdvanced"), __resolve("dmlShapesAdvanced"), __resolve("transitional"), __resolve("legacyVml"), __resolve("pmlMisc"), __resolve("dmlChartMisc"), __resolve("dmlMainMisc"), __resolve("mathMisc"));
    return __core;
    }
};
