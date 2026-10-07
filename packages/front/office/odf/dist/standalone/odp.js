/*!
 * Copyright (c) 2026 AwaCloud SAS
 * Author: Matthieu Bouilloux
 * SPDX-License-Identifier: AGPL-3.0-only
 * Dual-licensed; see the NOTICE file for licensing and any additional terms.
 */
/* GENERATED — do not edit. Source: packages/front/office/odf/tools/generate-bundles.mjs */

/**
 * @fileoverview `@awacloud/odf/bundles/prebuilt/odp-bundled` — pre-built single-factory bundle.
 *
 * Variant **bundled** : declares no dependencies — every fw and odf-local
 * factory transitively reachable from `odp`  is inlined.
 *
 * @module odf/bundles/prebuilt/odp-bundled
 */

export const odpBundled = {
    name: "odpBundled",
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
      if ((el.attrs && el.attrs["text:continue-numbering"]) === "true")
        out.continueNumbering = !0;
      const extras = [];
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
      if (extras.length)
        out._extras = { children: extras };
      return out;
    }
    function parseItem(el, hooks, ctx) {
      const item = { children: [] }, xtra = [];
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
      if (list.styleName)
        attrs["text:style-name"] = list.styleName;
      else if (list.ordered !== void 0 && ctx && typeof ctx.listStyle === "function")
        attrs["text:style-name"] = ctx.listStyle({
          ordered: !!list.ordered,
          numFormat: list.numFormat
        });
      if (list.continueNumbering)
        attrs["text:continue-numbering"] = "true";
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
      const tag = item.header ? "text:list-header" : "text:list-item";
      return xml.el(tag, {}, children);
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
      const visitRuns = (runs) => {
        for (const r of runs || []) {
          if (!r)
            continue;
          if (r.type === "span" && Array.isArray(r.runs))
            visitRuns(r.runs);
          else if (r.type === "link") {
            const ex = r._extras && r._extras.children;
            if (ex)
              for (const el of ex)
                boxes(el, lines);
            visitRuns(r.runs);
          }
        }
      };
      visitRuns(n.runs);
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
      const attrs = el.attrs || {}, out = { type: "image", href: attrs["xlink:href"] || "" }, mt = attrs["loext:mime-type"] || attrs["draw:mime-type"];
      if (mt)
        out.mimeType = mt;
      const known = new Set([
        "xlink:href",
        "xlink:type",
        "xlink:show",
        "xlink:actuate",
        "loext:mime-type",
        "draw:mime-type"
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
    function renderImage(img) {
      const attrs = { "xlink:href": img.href || "" };
      attrs["xlink:type"] = XLINK_DEFAULTS["xlink:type"];
      attrs["xlink:show"] = XLINK_DEFAULTS["xlink:show"];
      attrs["xlink:actuate"] = XLINK_DEFAULTS["xlink:actuate"];
      if (img.mimeType)
        attrs["draw:mime-type"] = img.mimeType;
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
    __register({ name: "drawFrame", dependencies: ["xml","drawImage"], factory: function(xml, imageMod) {
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
    function renderFrame(f) {
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
        children.push(renderChild(f.child));
      if (f._extras && f._extras.children)
        for (const c of f._extras.children)
          children.push(c);
      return xml.el("draw:frame", attrs, children);
    }
    function renderChild(child) {
      if (!child)
        return null;
      if (child.kind === "image")
        return imageMod.renderImage({ href: child.href, mimeType: child.mimeType, _extras: child._extras });
      if (child.kind === "text-box")
        return xml.el("draw:text-box", { ...child.attrs || {} }, (child.children || []).slice());
      if (child.kind === "object") {
        const tag = child.tag || "draw:object", a = { ...child.attrs || {} };
        if (child.href && !a["xlink:href"])
          a["xlink:href"] = child.href;
        return xml.el(tag, a, []);
      }
      return null;
    }
    return { parseFrame, renderFrame };
  } });
    __register({ name: "slide", dependencies: ["xml","textParagraph","textContent","drawFrame"], factory: function(xml, paraMod, contentMod, frameMod) {
    const TEXT_BEARING = new Set(["text:p", "text:h", "text:list", "table:table"]), NOT_SLIDE_TEXT = new Set(["svg:title", "svg:desc", "presentation:notes"]);
    function bodyNodesOf(rawChildren) {
      const nodes = [];
      for (const el of rawChildren || []) {
        if (!el || el.type !== "element" || !TEXT_BEARING.has(el.name))
          continue;
        const n = contentMod.parseNode(el);
        if (n)
          nodes.push(n);
      }
      return nodes;
    }
    function parseSlide(el) {
      const out = { type: "slide", frames: [] }, a = el.attrs || {};
      if (a["draw:name"])
        out.name = a["draw:name"];
      if (a["draw:master-page-name"])
        out.masterPageName = a["draw:master-page-name"];
      if (a["draw:style-name"])
        out.styleName = a["draw:style-name"];
      if (a["presentation:presentation-page-layout-name"])
        out.layoutName = a["presentation:presentation-page-layout-name"];
      const known = new Set([
        "draw:name",
        "draw:master-page-name",
        "draw:style-name",
        "presentation:presentation-page-layout-name"
      ]), xa = {};
      let anyAttr = !1;
      for (const k of Object.keys(a))
        if (!known.has(k)) {
          xa[k] = a[k];
          anyAttr = !0;
        }
      const xtra = [];
      for (const c of el.children || []) {
        if (c.type !== "element")
          continue;
        if (c.name === "draw:frame")
          out.frames.push(frameMod.parseFrame(c));
        else if (c.name === "presentation:notes") {
          const body = [];
          for (const k of c.children || [])
            if (k.type === "element")
              body.push(k);
          out.notes = { body };
          if (c.attrs) {
            const na = {};
            let nanyAttr = !1;
            for (const ak of Object.keys(c.attrs)) {
              na[ak] = c.attrs[ak];
              nanyAttr = !0;
            }
            if (nanyAttr)
              out.notes._attrs = na;
          }
        } else
          xtra.push(c);
      }
      if (anyAttr || xtra.length) {
        out._extras = {};
        if (anyAttr)
          out._extras.attrs = xa;
        if (xtra.length)
          out._extras.children = xtra;
      }
      return out;
    }
    function renderSlide(s) {
      const attrs = {};
      if (s.name)
        attrs["draw:name"] = s.name;
      if (s.masterPageName)
        attrs["draw:master-page-name"] = s.masterPageName;
      if (s.styleName)
        attrs["draw:style-name"] = s.styleName;
      if (s.layoutName)
        attrs["presentation:presentation-page-layout-name"] = s.layoutName;
      if (s._extras && s._extras.attrs)
        for (const k of Object.keys(s._extras.attrs))
          attrs[k] = s._extras.attrs[k];
      const children = [];
      for (const f of s.frames || [])
        children.push(frameMod.renderFrame(f));
      if (s.notes) {
        const nAttrs = s.notes._attrs ? { ...s.notes._attrs } : {};
        children.push(xml.el("presentation:notes", nAttrs, (s.notes.body || []).slice()));
      }
      if (s._extras && s._extras.children)
        for (const c of s._extras.children)
          children.push(c);
      return xml.el("draw:page", attrs, children);
    }
    function slideText(s, opts) {
      const blocks = [], push = (raw) => {
        const nodes = bodyNodesOf(raw);
        if (!nodes.length)
          return;
        const t = contentMod.bodyText(nodes);
        if (t !== "")
          blocks.push(t);
      }, walkRaw = (list) => {
        let run = [];
        const flush = () => {
          if (run.length)
            push(run);
          run = [];
        };
        for (const el of list || []) {
          if (!el || el.type !== "element" || NOT_SLIDE_TEXT.has(el.name))
            continue;
          if (TEXT_BEARING.has(el.name))
            run.push(el);
          else {
            flush();
            if (el.name === "draw:text-box")
              push(el.children);
            else
              walkRaw(el.children);
          }
        }
        flush();
      };
      for (const f of s && s.frames || []) {
        if (!f)
          continue;
        if (f.child && f.child.kind === "text-box")
          push(f.child.children);
        if (f._extras)
          walkRaw(f._extras.children);
      }
      walkRaw(s && s._extras && s._extras.children);
      if (opts && opts.notes === !0 && s && s.notes)
        push(s.notes.body);
      return blocks.join(`
`);
    }
    return { parseSlide, renderSlide, slideText };
  } });
    __register({ name: "presentationStyle", dependencies: ["xml"], factory: function(xml) {
    function parsePlaceholder(el) {
      const out = { type: "placeholder" }, a = el.attrs || {};
      if (a["presentation:object"])
        out.objectType = a["presentation:object"];
      if (a["svg:x"])
        out.x = a["svg:x"];
      if (a["svg:y"])
        out.y = a["svg:y"];
      if (a["svg:width"])
        out.width = a["svg:width"];
      if (a["svg:height"])
        out.height = a["svg:height"];
      const known = new Set([
        "presentation:object",
        "svg:x",
        "svg:y",
        "svg:width",
        "svg:height"
      ]), xa = {};
      let any = !1;
      for (const k of Object.keys(a))
        if (!known.has(k)) {
          xa[k] = a[k];
          any = !0;
        }
      if (any)
        out._extras = { attrs: xa };
      return out;
    }
    function renderPlaceholder(p) {
      const attrs = {};
      if (p.objectType)
        attrs["presentation:object"] = p.objectType;
      if (p.x)
        attrs["svg:x"] = p.x;
      if (p.y)
        attrs["svg:y"] = p.y;
      if (p.width)
        attrs["svg:width"] = p.width;
      if (p.height)
        attrs["svg:height"] = p.height;
      if (p._extras && p._extras.attrs)
        for (const k of Object.keys(p._extras.attrs))
          attrs[k] = p._extras.attrs[k];
      return xml.el("presentation:placeholder", attrs, []);
    }
    function parseNotes(el) {
      const out = { type: "notes", body: [] }, a = el.attrs || {};
      if (a["presentation:style-name"])
        out.styleName = a["presentation:style-name"];
      else if (a["draw:style-name"])
        out.styleName = a["draw:style-name"];
      const known = new Set(["presentation:style-name", "draw:style-name"]), xa = {};
      let any = !1;
      for (const k of Object.keys(a))
        if (!known.has(k)) {
          xa[k] = a[k];
          any = !0;
        }
      for (const c of el.children || [])
        if (c.type === "element")
          out.body.push(c);
      if (any)
        out._extras = { attrs: xa };
      return out;
    }
    function renderNotes(n) {
      const attrs = {};
      if (n.styleName)
        attrs["presentation:style-name"] = n.styleName;
      if (n._extras && n._extras.attrs)
        for (const k of Object.keys(n._extras.attrs))
          attrs[k] = n._extras.attrs[k];
      return xml.el("presentation:notes", attrs, (n.body || []).slice());
    }
    return { parsePlaceholder, renderPlaceholder, parseNotes, renderNotes };
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
    __register({ name: "styleMasterPage", dependencies: ["xml"], factory: function(xml) {
    function collectChildren(el) {
      const kids = [];
      for (const c of el.children || [])
        if (c.type === "element")
          kids.push(c);
      return kids;
    }
    function parseMasterPage(el) {
      const a = el.attrs || {}, out = {
        name: a["style:name"] || "",
        pageLayoutName: a["style:page-layout-name"] || ""
      };
      if (a["style:display-name"])
        out.displayName = a["style:display-name"];
      const known = new Set(["style:name", "style:page-layout-name", "style:display-name"]), xa = {};
      let anyAttr = !1;
      for (const k of Object.keys(a))
        if (!known.has(k)) {
          xa[k] = a[k];
          anyAttr = !0;
        }
      const headers = {}, footers = {}, xtra = [];
      for (const c of el.children || []) {
        if (c.type !== "element")
          continue;
        switch (c.name) {
          case "style:header":
            headers.default = collectChildren(c);
            break;
          case "style:header-left":
            headers.left = collectChildren(c);
            break;
          case "style:footer":
            footers.default = collectChildren(c);
            break;
          case "style:footer-left":
            footers.left = collectChildren(c);
            break;
          default:
            xtra.push(c);
        }
      }
      if (Object.keys(headers).length)
        out.headers = headers;
      if (Object.keys(footers).length)
        out.footers = footers;
      if (anyAttr || xtra.length) {
        out._extras = {};
        if (anyAttr)
          out._extras.attrs = xa;
        if (xtra.length)
          out._extras.children = xtra;
      }
      return out;
    }
    function renderMasterPage(mp) {
      const attrs = {
        "style:name": mp.name || "",
        "style:page-layout-name": mp.pageLayoutName || ""
      };
      if (mp.displayName)
        attrs["style:display-name"] = mp.displayName;
      if (mp._extras && mp._extras.attrs)
        for (const k of Object.keys(mp._extras.attrs))
          attrs[k] = mp._extras.attrs[k];
      const children = [], h = mp.headers || {};
      if (h.default)
        children.push(xml.el("style:header", {}, h.default.slice()));
      if (h.left)
        children.push(xml.el("style:header-left", {}, h.left.slice()));
      const f = mp.footers || {};
      if (f.default)
        children.push(xml.el("style:footer", {}, f.default.slice()));
      if (f.left)
        children.push(xml.el("style:footer-left", {}, f.left.slice()));
      if (mp._extras && mp._extras.children)
        for (const c of mp._extras.children)
          children.push(c);
      return xml.el("style:master-page", attrs, children);
    }
    return { parseMasterPage, renderMasterPage };
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
    __register({ name: "odpWalker", dependencies: ["odfWalker"], factory: function(shared) {
    const CONFIG = {
      rootField: "slides",
      recurseFields: ["frames", "children", "spans", "body"],
      typeHooks: {
        slide: "Slide",
        paragraph: "Paragraph",
        span: "Span",
        frame: "Frame"
      }
    };
    function createWalker() {
      return shared.createWalker(CONFIG);
    }
    return { createWalker };
  } });
    __register({ name: "odp", dependencies: ["odfErrors","odfShared","pkgPackage","xml","pkgMimetype","pkgManifest","odfMeta","odfSettings","odfStyles","slide","presentationStyle","styleAutomatic","styleMasterPage","drawFrame","textParagraph","odpWalker"], factory: function(errors, shared, pkg, xml, mimetypeMod, manifestMod, metaMod, settingsMod, stylesMod, slideMod, presentationMod, automaticMod, masterPageMod, frameMod, paraMod, walkerMod) {
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
    } = shared, CT_ODP = CT.ODP, CT_XML = CT.XML, walker = walkerMod.createWalker();
    function read(bytes, opts) {
      const p = pkg.read(bytes, opts);
      if (p.mimetype !== CT_ODP)
        throw new ParseError("odf/parse-error/odp", `odp: unexpected mimetype "${p.mimetype}"`, { context: { expected: CT_ODP, module: "odp" } });
      const contentBytes = p.parts["content.xml"];
      if (!contentBytes)
        throw new ParseError("odf/parse-error/odp", "odp: missing content.xml", { context: { part: "content.xml", module: "odp" } });
      const parsed = parseContent(shared.decodeText(contentBytes)), result = {
        mimetype: p.mimetype,
        slides: parsed.slides,
        package: p
      };
      if (parsed.automaticStyles)
        result.automaticStyles = parsed.automaticStyles;
      readSidecars(result, p, { metaMod, settingsMod, stylesMod });
      walker.applyHydrate(result);
      return result;
    }
    function parseContent(xmlString) {
      const root = parseXmlOrThrow(xmlString, "odp", { part: "content.xml", module: "odp" });
      if (root.name !== "office:document-content")
        throw new ParseError("odf/parse-error/odp", `odp: unexpected content root <${root.name}>`, { context: { part: "content.xml", module: "odp" } });
      const autoEl = xml.findChild(root, "office:automatic-styles"), bodyEl = xml.findChild(root, "office:body");
      if (!bodyEl)
        throw new ParseError("odf/parse-error/odp", "odp: missing <office:body> in content.xml", { context: { part: "content.xml", module: "odp" } });
      const presEl = xml.findChild(bodyEl, "office:presentation"), slides = [];
      if (presEl) {
        for (const c of presEl.children || [])
          if (c.type === "element" && c.name === "draw:page")
            slides.push(slideMod.parseSlide(c));
      }
      const out = { slides };
      if (autoEl)
        out.automaticStyles = automaticMod.parse(autoEl);
      return out;
    }
    function write(doc, opts) {
      if (!doc)
        throw new ContractError("odf/contract-error/odp", "odp: write needs a document", { context: { module: "odp", argument: "doc" } });
      opts = opts || {};
      if (walker.hasExtensions) {
        const dehydrated = {
          slides: doc.slides,
          meta: opts.meta || doc.meta,
          settings: opts.settings || doc.settings,
          styles: opts.styles || doc.styles
        };
        walker.applyDehydrate(dehydrated);
        if (dehydrated.slides !== void 0)
          doc = { ...doc, slides: dehydrated.slides };
        if (dehydrated.meta !== void 0)
          opts = { ...opts, meta: dehydrated.meta };
        if (dehydrated.settings !== void 0)
          opts = { ...opts, settings: dehydrated.settings };
        if (dehydrated.styles !== void 0)
          opts = { ...opts, styles: dehydrated.styles };
      }
      const p = pkg.empty(CT_ODP), contentXml = renderContent(doc);
      pkg.setPart(p, "content.xml", encodeText(contentXml), CT_XML);
      writeSidecars(p, doc, opts, { pkg, metaMod, settingsMod, stylesMod }, CT_XML);
      carryParts(p, doc.package, { pkg, manifestMod });
      return pkg.write(p);
    }
    function renderContent(doc) {
      const slideEls = (doc.slides || []).map((s) => slideMod.renderSlide(s)), presEl = xml.el("office:presentation", {}, slideEls), bodyEl = xml.el("office:body", {}, [presEl]), children = [];
      if (doc.automaticStyles)
        children.push(automaticMod.render(doc.automaticStyles));
      children.push(bodyEl);
      const root = xml.el("office:document-content", {
        "xmlns:office": ODF_NS.OFFICE,
        "xmlns:text": ODF_NS.TEXT,
        "xmlns:style": ODF_NS.STYLE,
        "xmlns:table": ODF_NS.TABLE,
        "xmlns:draw": ODF_NS.DRAW,
        "xmlns:presentation": ODF_NS.PRESENTATION,
        "xmlns:fo": ODF_NS.FO,
        "xmlns:svg": ODF_NS.SVG,
        "xmlns:xlink": ODF_NS.XLINK,
        "office:version": ODF_VERSION
      }, children);
      declareNamespaces(root, {
        carried: sourceNamespaces(doc.package, "content.xml"),
        part: "content.xml",
        module: "odp"
      });
      return xml.serialize(root);
    }
    function empty() {
      return { slides: [slideBuilder("Slide1")] };
    }
    function slideBuilder(name, opts) {
      opts = opts || {};
      const s = { type: "slide", name, frames: opts.frames || [] };
      if (opts.masterPageName)
        s.masterPageName = opts.masterPageName;
      if (opts.layoutName)
        s.layoutName = opts.layoutName;
      if (opts.styleName)
        s.styleName = opts.styleName;
      if (opts.notes)
        s.notes = opts.notes;
      return s;
    }
    function fromSlides(slides) {
      return { slides: (slides || []).slice() };
    }
    function toText(doc, opts) {
      const out = [];
      for (const s of doc && doc.slides || []) {
        const t = slideMod.slideText(s, opts);
        if (t !== "")
          out.push(t);
      }
      return out.join(`

`);
    }
    const api = {
      read,
      write,
      empty,
      slide: slideBuilder,
      fromSlides,
      toText,
      CT_ODP,
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

    const __core = __resolve("odp");
    return __core;
    }
};
