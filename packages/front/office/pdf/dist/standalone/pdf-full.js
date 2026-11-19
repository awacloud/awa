/*!
 * Copyright (c) 2026 AwaCloud SAS
 * Author: Matthieu Bouilloux
 * SPDX-License-Identifier: AGPL-3.0-only
 * Dual-licensed; see the NOTICE file for licensing and any additional terms.
 */
/* GENERATED — do not edit. Source: packages/front/office/pdf/tools/generate-bundles.mjs */

/**
 * @fileoverview `@awacloud/pdf/bundles/prebuilt/pdf-full-bundled` — pre-built single-factory bundle.
 *
 * Variant **bundled** : declares no dependencies — every fw and pdf-local
 * factory transitively reachable from `pdf` plus 28 extras is inlined.
 *
 * @module pdf/bundles/prebuilt/pdf-full-bundled
 */

export const pdfFullBundled = {
    name: "pdfFullBundled",
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
    function kraft(codeLengths) {
      const perLength = new Int32Array(16);
      for (let s = 0;s < codeLengths.length; ++s)
        perLength[codeLengths[s]]++;
      let left = 1;
      for (let len = 1;len < 16; ++len) {
        left = left * 2 - perLength[len];
        if (left < 0)
          return { oversubscribed: !0, incomplete: !1 };
      }
      return { oversubscribed: !1, incomplete: left > 0 };
    }
    return { buildTree, buildMap, kraft };
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
    function _fill(st, tokens, max) {
      const { data, len, head, prev, hash, maxMatch, niceLength, chainDepth, lazy, goodLength, maxLazy, chainSkip, wndSize } = st, wndMask = wndSize - 1, lastKey = st.lastKey, atLeast = st.atLeast, cap = 2 * max;
      let p = 0;
      if (st.heldLen) {
        tokens[p++] = st.heldLen;
        tokens[p++] = st.heldDist;
        st.heldLen = 0;
      }
      let i = st.at;
      while (p < cap && i <= lastKey) {
        const h = hash(data, i), newest = head[h];
        let matchLen = newest === -1 || i - newest >= wndSize ? 0 : _longestMatch(data, i, h, head, prev, wndSize, wndMask, Math.min(maxMatch, len - i), niceLength, chainDepth, chainSkip, atLeast), dist = matchDist;
        prev[i & wndMask] = head[h];
        head[h] = i;
        if (matchLen === 0) {
          tokens[p++] = 0;
          tokens[p++] = data[i];
          i++;
          continue;
        }
        if (lazy && matchLen < maxLazy && i < lastKey) {
          const h1 = hash(data, i + 1), newest1 = head[h1], nextLen = newest1 === -1 || i + 1 - newest1 >= wndSize ? 0 : _longestMatch(data, i + 1, h1, head, prev, wndSize, wndMask, Math.min(maxMatch, len - i - 1), niceLength, matchLen >= goodLength ? chainDepth >> 2 || 1 : chainDepth, chainSkip, matchLen);
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
        if (p < cap) {
          tokens[p++] = matchLen;
          tokens[p++] = dist;
        } else {
          st.heldLen = matchLen;
          st.heldDist = dist;
        }
        const end = i + matchLen;
        for (let k = i + 1;k < end && k <= lastKey; ++k) {
          const hk = hash(data, k);
          prev[k & wndMask] = head[hk];
          head[hk] = k;
        }
        i = end;
      }
      while (p < cap && i < len) {
        tokens[p++] = 0;
        tokens[p++] = data[i];
        i++;
      }
      st.at = i;
      return p >> 1;
    }
    function createScanner(data, opts) {
      if (!(data instanceof u8))
        throw Error("lz77.createScanner: data must be Uint8Array");
      const o = _resolveOpts(opts), len = data.length, wndSize = 1 << o.windowBits, wndMask = wndSize - 1, empty = o.start >= len, hash = _hasherFor(o), lastKey = len - o.minMatch, head = empty ? null : new i32(1 << o.hashBits).fill(-1), prev = empty ? null : new i32(Math.min(wndSize, len)).fill(-1);
      if (!empty)
        for (let k = 0;k < o.start && k <= lastKey; ++k) {
          const h = hash(data, k);
          prev[k & wndMask] = head[h];
          head[h] = k;
        }
      const st = {
        data,
        len,
        hash,
        lastKey,
        wndSize,
        head,
        prev,
        maxMatch: o.maxMatch,
        niceLength: o.niceLength,
        chainDepth: o.chainDepth,
        lazy: o.lazy,
        goodLength: o.goodLength,
        maxLazy: o.maxLazy,
        chainSkip: o.chainSkip,
        atLeast: o.minMatch - 1,
        at: empty ? len : o.start,
        heldLen: 0,
        heldDist: 0
      };
      return {
        fill(tokens, max) {
          return _fill(st, tokens, max);
        },
        get done() {
          return st.at >= st.len && st.heldLen === 0;
        }
      };
    }
    function encodeTokens(data, opts) {
      if (!(data instanceof u8))
        throw Error("lz77.encodeTokens: data must be Uint8Array");
      const n = Math.max(0, data.length - Math.max(0, (opts && opts.start) | 0)), cap = 2 * n, provided = opts && opts.tokens;
      let tokens;
      if (provided) {
        if (provided.length < cap)
          throw Error("lz77.encodeTokens: tokens buffer too small");
        tokens = provided;
      } else
        tokens = new i32(cap);
      if (n === 0)
        return { tokens, count: 0 };
      return { tokens, count: createScanner(data, opts).fill(tokens, n) };
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
      createScanner,
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
    } = bitstream, { buildMap, buildTree } = huffman, CODE_NAMES = { 0: "EEOF", 1: "EBADBLOCK", 2: "EBADSYMBOL", 3: "EBADDISTANCE", 4: "ESTREAMEND", 5: "ENOHANDLER", 6: "EBADFORMAT", 7: "EMAXOUT", 8: "EBADSTREAM", 9: "EEXTRATOOLONG", 10: "EBADDATE", 11: "ENAMETOOLONG", 12: "ENOENCODER", 13: "EBADFORMAT", 14: "EBADMETHOD", 15: "EUNSAFEPATH", 16: "ECHECKSUM" }, ERROR_MESSAGES = [
      "unexpected EOF",
      "invalid block type",
      "invalid length/literal",
      "invalid distance",
      "stream finished",
      "no stream handler",
      null,
      "output limit exceeded",
      "invalid data"
    ];
    function fail(code, message) {
      const e = Error(message ?? ERROR_MESSAGES[code] ?? "unknown error");
      e.code = CODE_NAMES[code];
      e.errno = code;
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
    function createInflateState(dictionary, maxOutput) {
      const dict = dictionary && dictionary.length ? dictionary.subarray(Math.max(0, dictionary.length - WINDOW_SIZE)) : null;
      if (maxOutput !== void 0 && maxOutput !== null && !(Number.isSafeInteger(maxOutput) && maxOutput >= 0))
        throw RangeError("maxOutput must be a non-negative integer");
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
        fixedOut: !1,
        base: 0,
        limit: maxOutput !== void 0 && maxOutput !== null ? (dict ? dict.length : 0) + maxOutput : 1 / 0,
        end: 0
      };
    }
    function initOutput(state, inputLength, providedOut) {
      const dictLen = state.dictionary ? state.dictionary.length : 0;
      if (providedOut && !dictLen) {
        state.out = providedOut;
        state.fixedOut = !0;
      } else
        state.out = new u8(Math.min(Math.max(65536, inputLength * 3), state.limit));
      if (dictLen) {
        state.out.set(state.dictionary);
        state.outLen = dictLen;
        state.emitted = dictLen;
      }
      state.end = Math.min(state.out.length, state.limit - state.base);
    }
    function reserveOutput(state, needed) {
      if (needed <= state.end)
        return;
      if (state.base + needed > state.limit)
        fail(7);
      if (state.fixedOut)
        fail(8, "output exceeds provided buffer");
      let size = state.out.length || 65536;
      while (size < needed)
        size *= 2;
      size = Math.min(size, state.limit - state.base);
      const grown = new u8(size);
      grown.set(state.out.subarray(0, state.outLen));
      state.out = grown;
      state.end = Math.min(size, state.limit - state.base);
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
      state.base += start;
      state.end = Math.min(state.out.length, state.limit - state.base);
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
    const blockTokens = new i32(2 * BLOCK_TOKENS);
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
        const scan = lz77.createScanner(input, {
          windowBits: WINDOW_BITS,
          minMatch: MIN_MATCH,
          maxMatch: MAX_MATCH,
          hashBits: params.hashBits,
          start,
          hashFn: makeHashFn(params.hashBits),
          lazy: params.lazy,
          chainSkip: !0,
          ...LEVELS[params.level]
        }), tb = createTokenBuffer(blockTokens, start);
        for (;; ) {
          const covered = tallyBlock(tb, 0, scan.fill(blockTokens, BLOCK_TOKENS));
          if (scan.done) {
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
      this._state = createInflateState((opts || {}).dictionary, (opts || {}).maxOutput);
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
    Object.defineProperty(InflateStream.prototype, "ended", {
      get() {
        return this._state.phase === PHASE_DONE;
      }
    });
    InflateStream.prototype.rest = function() {
      if (this._state.phase !== PHASE_DONE)
        return null;
      return this._pending.subarray(this._state.bitPos ? 1 : 0);
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
      const state = createInflateState(opts.dictionary, opts.maxOutput), dictLen = state.dictionary ? state.dictionary.length : 0;
      initOutput(state, data.length, opts.out);
      runInflate(state, data, !1);
      if (typeof opts.onEnd === "function")
        opts.onEnd(byteOffset(state.bitPos));
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
    __register({ name: "adler32", dependencies: [], factory: function() {
    function Adler32() {
      this._a = 1;
      this._b = 0;
    }
    Adler32.prototype.append = function(data) {
      let a = this._a, b = this._b;
      const l = data.length | 0;
      for (let i = 0;i !== l; ) {
        const e = Math.min(i + 2655, l);
        for (;i < e; ++i)
          b += a += data[i];
        a = (a & 65535) + 15 * (a >> 16);
        b = (b & 65535) + 15 * (b >> 16);
      }
      this._a = a;
      this._b = b;
    };
    Adler32.prototype.get = function() {
      return (this._b % 65521 << 16 | this._a % 65521) >>> 0;
    };
    return Adler32;
  } });
    __register({ name: "b64", dependencies: [], factory: function() {
    const byteToB64 = [];
    for (let m = 0;m < 64; m++)
      byteToB64["ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/".charCodeAt(m)] = m;
    function _b64ToNum(a, b, c, d) {
      return byteToB64[a.charCodeAt(0)] << 18 | byteToB64[b.charCodeAt(0)] << 12 | byteToB64[c.charCodeAt(0)] << 6 | byteToB64[d.charCodeAt(0)];
    }
    function _enc_remain1(arr, remain) {
      arr.push("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"[remain >> 2]);
      arr.push("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"[remain << 4 & 63]);
      arr.push("==");
    }
    function _enc_remain2(arr, remain) {
      arr.push("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"[remain >> 10]);
      arr.push("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"[remain >> 4 & 63]);
      arr.push("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"[remain << 2 & 63]);
      arr.push("=");
    }
    function _dec_remain1(arr, remain) {
      arr.push(remain >> 8 & 255);
      arr.push(remain & 255);
    }
    function _decode(str, arr, num, len, remain) {
      if (str[len - 2] === "=")
        remain = 2;
      else if (str[len - 1] === "=")
        remain = 1;
      len = remain > 0 ? len - 4 : len;
      let i;
      for (i = 0;i < len; i += 4) {
        num = _b64ToNum(str[i], str[i + 1], str[i + 2], str[i + 3]);
        arr.push(num >> 16 & 255);
        arr.push(num >> 8 & 255);
        arr.push(num & 255);
      }
      if (remain === 2)
        arr.push((byteToB64[str.charCodeAt(i)] << 2 | byteToB64[str.charCodeAt(i + 1)] >> 4) & 255);
      else if (remain === 1)
        _dec_remain1(arr, byteToB64[str.charCodeAt(i)] << 10 | byteToB64[str.charCodeAt(i + 1)] << 4 | byteToB64[str.charCodeAt(i + 2)] >> 2);
      return new Uint8Array(arr);
    }
    const b64Code = Uint8Array.from("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/", (c) => c.charCodeAt(0)), little = new Uint8Array(new Uint16Array([1]).buffer)[0] === 1, pairCode = new Uint16Array(4096);
    for (let v = 0;v < 4096; v++) {
      const a = b64Code[v >> 6], b = b64Code[v & 63];
      pairCode[v] = little ? a | b << 8 : a << 8 | b;
    }
    const sextet = new Uint8Array(256).fill(64);
    for (let m = 0;m < 64; m++)
      sextet["ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/".charCodeAt(m)] = m;
    const U8 = Uint8Array, nativeTo = typeof U8.prototype.toBase64 === "function" ? U8.prototype.toBase64 : null, nativeFrom = typeof U8.fromBase64 === "function" ? U8.fromBase64 : null, ascii = typeof TextDecoder === "function" ? new TextDecoder : null, CHUNK = 8192;
    function _codesToString(codes) {
      if (ascii)
        return ascii.decode(codes);
      if (codes.length <= CHUNK)
        return String.fromCharCode.apply(null, codes);
      const parts = [];
      for (let k = 0;k < codes.length; k += CHUNK)
        parts.push(String.fromCharCode.apply(null, codes.subarray(k, k + CHUNK)));
      return parts.join("");
    }
    function _encodeFast(bytes) {
      const len = bytes.length, remain = len % 3, whole = len - remain, pairs = new Uint16Array(whole / 3 * 2);
      for (let i = 0, j = 0;i < whole; i += 3, j += 2) {
        const num = (bytes[i] << 16) + (bytes[i + 1] << 8) + bytes[i + 2];
        pairs[j] = pairCode[num >> 12 & 4095];
        pairs[j + 1] = pairCode[num & 4095];
      }
      const body = _codesToString(new Uint8Array(pairs.buffer));
      if (remain === 0)
        return body;
      const tail = [];
      if (remain === 1)
        _enc_remain1(tail, bytes[len - 1]);
      else
        _enc_remain2(tail, (bytes[len - 2] << 8) + bytes[len - 1]);
      return body + tail.join("");
    }
    function _decodeFast(str) {
      const len = str.length;
      if (len % 4 !== 0)
        return null;
      if (len === 0)
        return new Uint8Array(0);
      let pad = 0;
      if (str.charCodeAt(len - 1) === 61)
        pad = str.charCodeAt(len - 2) === 61 ? 2 : 1;
      else if (str.charCodeAt(len - 2) === 61)
        return null;
      const out = new Uint8Array(len / 4 * 3 - pad), full = pad ? len - 4 : len;
      let bad = 0, wide = 0, j = 0;
      for (let i = 0;i < full; i += 4) {
        const a = str.charCodeAt(i), b = str.charCodeAt(i + 1), c = str.charCodeAt(i + 2), d = str.charCodeAt(i + 3);
        wide |= a | b | c | d;
        const sa = sextet[a], sb = sextet[b], sc = sextet[c], sd = sextet[d];
        bad |= sa | sb | sc | sd;
        const num = sa << 18 | sb << 12 | sc << 6 | sd;
        out[j++] = num >> 16;
        out[j++] = num >> 8;
        out[j++] = num;
      }
      if (pad) {
        const a = str.charCodeAt(full), b = str.charCodeAt(full + 1), c = pad === 1 ? str.charCodeAt(full + 2) : 65;
        wide |= a | b | c;
        const sa = sextet[a], sb = sextet[b], sc = sextet[c];
        bad |= sa | sb | sc;
        out[j++] = sa << 2 | sb >> 4;
        if (pad === 1)
          out[j] = sb << 4 | sc >> 2;
      }
      return bad & 64 || wide > 255 ? null : out;
    }
    const fromBytes = function(bytes) {
      if (nativeTo && bytes instanceof Uint8Array)
        return nativeTo.call(bytes);
      return _encodeFast(bytes);
    }, toBytes = function(str) {
      if (typeof str !== "string")
        return _decode(str, [], 0, str.length, 0);
      const len = str.length;
      if (nativeFrom && len % 4 === 0 && len > 0) {
        const last = str.charCodeAt(len - 1) === 61, prev = str.charCodeAt(len - 2) === 61;
        if (last || !prev)
          try {
            const r = nativeFrom(str);
            if (r.length === len / 4 * 3 - (last ? prev ? 2 : 1 : 0))
              return r;
          } catch {}
      }
      return _decodeFast(str) || _decode(str, [], 0, len, 0);
    }, test = function(str) {
      return /^(?=(.{4})*$)[A-Za-z0-9+/]*={0,2}$/.test(str);
    }, _B64U = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_", urlFromBytes = function(bytes) {
      return fromBytes(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    }, urlTest = function(s) {
      if (typeof s !== "string" || !/^[A-Za-z0-9\-_]*$/.test(s))
        return !1;
      const rem = s.length % 4;
      if (rem === 1)
        return !1;
      if (rem === 0)
        return !0;
      const unusedBits = rem === 2 ? 4 : 2;
      return (_B64U.indexOf(s[s.length - 1]) & (1 << unusedBits) - 1) === 0;
    };
    return { fromBytes, toBytes, test, url: { fromBytes: urlFromBytes, toBytes: function(s) {
      if (!urlTest(s))
        return !1;
      const std = s.replace(/-/g, "+").replace(/_/g, "/");
      return toBytes(std + "=".repeat((4 - s.length % 4) % 4));
    }, test: urlTest } };
  } });
    __register({ name: "hex", dependencies: [], factory: function() {
    const charToNibble = new Int8Array(128).fill(-1);
    for (let i = 0;i < 16; i++) {
      charToNibble["0123456789abcdef".charCodeAt(i)] = i;
      if (i >= 10)
        charToNibble["ABCDEF".charCodeAt(i - 10)] = i;
    }
    const hexCode = Uint8Array.from("0123456789abcdef", (c) => c.charCodeAt(0)), little = new Uint8Array(new Uint16Array([1]).buffer)[0] === 1, pairCode = new Uint16Array(256);
    for (let b = 0;b < 256; b++) {
      const hi = hexCode[b >> 4], lo = hexCode[b & 15];
      pairCode[b] = little ? hi | lo << 8 : hi << 8 | lo;
    }
    const U8P = Uint8Array.prototype, nativeToHex = typeof U8P.toHex === "function" ? U8P.toHex : null, ascii = typeof TextDecoder === "function" ? new TextDecoder : null, CHUNK = 8192;
    function _codesToString(codes) {
      if (ascii)
        return ascii.decode(codes);
      if (codes.length <= CHUNK)
        return String.fromCharCode.apply(null, codes);
      const parts = [];
      for (let k = 0;k < codes.length; k += CHUNK)
        parts.push(String.fromCharCode.apply(null, codes.subarray(k, k + CHUNK)));
      return parts.join("");
    }
    return { toBytes: (text) => {
      const len = text.length;
      if (len % 2 !== 0)
        throw Error(`hex: odd-length input (length ${len})`);
      const arr = new Uint8Array(len >> 1);
      for (let i = 0, j = 0;i < len; i += 2, j++) {
        const c1 = text.charCodeAt(i), c2 = text.charCodeAt(i + 1), hi = c1 < 128 ? charToNibble[c1] : -1, lo = c2 < 128 ? charToNibble[c2] : -1;
        if (hi < 0 || lo < 0)
          throw Error(`hex: invalid character at index ${hi < 0 ? i : i + 1}`);
        arr[j] = hi << 4 | lo;
      }
      return arr;
    }, fromBytes: (bytes) => {
      if (nativeToHex && bytes instanceof Uint8Array)
        return nativeToHex.call(bytes);
      const n = bytes.length, pairs = new Uint16Array(n);
      for (let i = 0;i < n; i++)
        pairs[i] = pairCode[bytes[i] & 255];
      return _codesToString(new Uint8Array(pairs.buffer));
    }, test: (str) => {
      if (typeof str !== "string")
        return !1;
      if (str.length % 2 !== 0)
        return !1;
      return /^[0-9a-fA-F]*$/.test(str);
    } };
  } });
    __register({ name: "zlib", dependencies: ["deflate","adler32"], factory: function(deflateModule, Adler32) {
    const { deflateSync, inflateSync, DeflateStream, InflateStream } = deflateModule;
    function _w32be(d, off, v) {
      d[off] = v >>> 24 & 255;
      d[off + 1] = v >>> 16 & 255;
      d[off + 2] = v >>> 8 & 255;
      d[off + 3] = v & 255;
    }
    function _headerLen(opts) {
      return opts.dictionary ? 6 : 2;
    }
    function _writeHeader(out, opts, adlerCtor) {
      const lv = opts.level ?? 6, fl = lv === 0 ? 0 : lv < 6 ? 1 : lv === 9 ? 3 : 2;
      out[0] = 120;
      out[1] = fl << 6 | (opts.dictionary ? 32 : 0);
      out[1] |= 31 - (out[0] << 8 | out[1]) % 31;
      if (opts.dictionary) {
        const a = new adlerCtor;
        a.append(opts.dictionary);
        _w32be(out, 2, a.get());
      }
    }
    function _payloadStart(d, dict) {
      if (d.length < 2 || (d[1] >> 3 & 4) + 2 > d.length) {
        const e = Error("invalid zlib data: truncated header");
        e.code = "EBADFORMAT";
        e.errno = 6;
        throw e;
      }
      if ((d[0] & 15) !== 8 || d[0] >> 4 > 7 || (d[0] << 8 | d[1]) % 31) {
        const e = Error("invalid zlib data");
        e.code = "EBADFORMAT";
        e.errno = 6;
        throw e;
      }
      const hasDict = d[1] >> 5 & 1;
      if (hasDict === +!dict) {
        const e = Error("invalid zlib data: " + (hasDict ? "need" : "unexpected") + " dictionary");
        e.code = "EBADFORMAT";
        e.errno = 6;
        throw e;
      }
      return (d[1] >> 3 & 4) + 2;
    }
    function zlibSync(data, opts = {}) {
      const a = new Adler32;
      a.append(data);
      const hl = _headerLen(opts), compressed = deflateSync(data, opts), out = new Uint8Array(hl + compressed.length + 4);
      _writeHeader(out, opts, Adler32);
      out.set(compressed, hl);
      _w32be(out, hl + compressed.length, a.get());
      return out;
    }
    const CODE_NAMES = { 0: "EEOF", 1: "EBADBLOCK", 2: "EBADSYMBOL", 3: "EBADDISTANCE", 4: "ESTREAMEND", 5: "ENOHANDLER", 6: "EBADFORMAT", 7: "EMAXOUT", 8: "EBADSTREAM", 9: "EEXTRATOOLONG", 10: "EBADDATE", 11: "ENAMETOOLONG", 12: "ENOENCODER", 13: "EBADFORMAT", 14: "EBADMETHOD", 15: "EUNSAFEPATH", 16: "ECHECKSUM" };
    function _codeErr(code, message) {
      const e = Error(message);
      e.code = CODE_NAMES[code];
      e.errno = code;
      return e;
    }
    function _r32be(d, at) {
      return (d[at] << 24 | d[at + 1] << 16 | d[at + 2] << 8 | d[at + 3]) >>> 0;
    }
    function _checkAdler(out, data, trailerAt) {
      const a = new Adler32;
      a.append(out);
      if (a.get() !== _r32be(data, trailerAt))
        throw _codeErr(16, "zlib: incorrect data check (Adler-32 mismatch)");
    }
    function unzlibSync(data, opts = {}) {
      const start = _payloadStart(data, opts.dictionary);
      if (opts.verify !== !1 && data.length < start + 2 + 4)
        throw _codeErr(0, "zlib: unexpected EOF (frame shorter than a deflate stream and its trailer)");
      const out = inflateSync(data.subarray(start, -4), {
        out: opts.out,
        dictionary: opts.dictionary,
        maxOutput: opts.maxOutput
      });
      if (opts.verify !== !1)
        _checkAdler(out, data, data.length - 4);
      return out;
    }
    function _concat2(a, b) {
      const out = new Uint8Array(a.length + b.length);
      out.set(a);
      out.set(b, a.length);
      return out;
    }
    function ZlibStream(opts, ondata) {
      if (typeof opts === "function") {
        ondata = opts;
        opts = {};
      }
      this.ondata = ondata || null;
      this._opts = opts || {};
      this._adler = new Adler32;
      this._first = !0;
      const self = this;
      this._ds = new DeflateStream(this._opts, function(chunk, final) {
        let out;
        if (self._first) {
          const hl = _headerLen(self._opts), hdr = new Uint8Array(hl);
          _writeHeader(hdr, self._opts, Adler32);
          out = _concat2(hdr, chunk);
          self._first = !1;
        } else
          out = chunk;
        if (final) {
          const footer = new Uint8Array(4);
          _w32be(footer, 0, self._adler.get());
          out = _concat2(out, footer);
        }
        if (self.ondata)
          self.ondata(out, final);
      });
    }
    ZlibStream.prototype.push = function(chunk, final) {
      this._adler.append(chunk);
      this._ds.push(chunk, !!final);
    };
    function UnzlibStream(opts, ondata) {
      if (typeof opts === "function") {
        ondata = opts;
        opts = {};
      }
      this.ondata = ondata || null;
      this._opts = opts || {};
      this._buf = [];
      this._bufLen = 0;
      this._hdr = -1;
      this._inf = null;
      this._tail = new Uint8Array(4);
      this._tailLen = 0;
      this._sum = this._opts.verify !== !1 ? new Adler32 : null;
      this._ended = !1;
    }
    UnzlibStream.prototype.push = function(chunk, final) {
      if (this._ended) {
        const e = Error("stream finished");
        e.code = "ESTREAMEND";
        e.errno = 4;
        throw e;
      }
      if (final)
        this._ended = !0;
      if (this._hdr === -1) {
        this._buf.push(chunk);
        this._bufLen += chunk.length;
        const combined = new Uint8Array(this._bufLen);
        let off = 0;
        for (const c of this._buf) {
          combined.set(c, off);
          off += c.length;
        }
        let hdrEnd;
        try {
          hdrEnd = _payloadStart(combined, this._opts.dictionary);
        } catch (e) {
          if (final)
            throw e;
          return;
        }
        this._hdr = hdrEnd;
        this._buf = null;
        const self = this;
        this._inf = new InflateStream(this._opts, function(data, fin) {
          if (self._sum)
            self._sum.append(data);
          if (self.ondata)
            self.ondata(data, fin);
        });
        this._feedPayload(combined.subarray(hdrEnd), !!final);
      } else
        this._feedPayload(chunk, !!final);
    };
    UnzlibStream.prototype._feedPayload = function(chunk, final) {
      const total = new Uint8Array(this._tailLen + chunk.length);
      total.set(this._tail.subarray(0, this._tailLen));
      total.set(chunk, this._tailLen);
      if (!final) {
        const feedLen = total.length > 4 ? total.length - 4 : 0;
        if (feedLen > 0)
          this._inf.push(total.subarray(0, feedLen), !1);
        this._fed = (this._fed || 0) + feedLen;
        const newTailLen = total.length - feedLen;
        this._tailLen = newTailLen;
        this._tail.set(total.subarray(feedLen));
      } else {
        const feedLen = Math.max(0, total.length - 4);
        if (this._sum && (this._fed || 0) + feedLen < 2)
          throw _codeErr(0, "zlib: unexpected EOF (stream shorter than a deflate stream and its trailer)");
        this._inf.push(total.subarray(0, feedLen), !0);
        if (this._sum && this._sum.get() !== _r32be(total, feedLen))
          throw _codeErr(16, "zlib: incorrect data check (Adler-32 mismatch)");
      }
    };
    UnzlibStream.prototype.flush = function() {
      if (this._ended)
        throw _codeErr(4, "stream finished");
      this._ended = !0;
      if (this._hdr === -1 || this._tailLen === 0)
        return;
      this._inf.push(this._tail.subarray(0, this._tailLen), !1);
      this._tailLen = 0;
    };
    const _mt = typeof queueMicrotask === "function" ? queueMicrotask : (fn) => Promise.resolve().then(fn);
    function zlibAsync(data, opts = {}) {
      return new Promise((resolve, reject) => {
        _mt(() => {
          try {
            resolve(zlibSync(data, opts));
          } catch (e) {
            reject(e);
          }
        });
      });
    }
    function unzlibAsync(data, opts = {}) {
      return new Promise((resolve, reject) => {
        _mt(() => {
          try {
            resolve(unzlibSync(data, opts));
          } catch (e) {
            reject(e);
          }
        });
      });
    }
    return {
      zlibSync,
      unzlibSync,
      zlib: zlibAsync,
      unzlib: unzlibAsync,
      ZlibStream,
      UnzlibStream
    };
  } });
    __register({ name: "lzw", dependencies: [], factory: function() {
    function _codedError(code, message) {
      const e = Error(message);
      e.code = code;
      return e;
    }
    const u8 = Uint8Array;
    function _resolveOpts(opts) {
      opts = opts || {};
      const minCodeBits = opts.minCodeBits ?? 8, maxBits = opts.maxBits ?? 12, bigEndian = !!opts.bigEndian, useClearEnd = opts.useClearEnd ?? !0, earlyChange = opts.earlyChange ?? bigEndian;
      if (minCodeBits < 2 || minCodeBits > 12)
        throw _codedError("EBADARG", "lzw: minCodeBits must be in [2, 12]");
      if (maxBits < minCodeBits + 1 || maxBits > 16)
        throw _codedError("EBADARG", "lzw: maxBits must be in [minCodeBits+1, 16]");
      return { minCodeBits, maxBits, bigEndian, useClearEnd, earlyChange: !!earlyChange };
    }
    function _makeBitWriter(bigEndian) {
      let buf = new u8(256), len = 0, acc = 0, nAcc = 0;
      function ensure(n) {
        if (len + n > buf.length) {
          let cap = buf.length;
          while (cap < len + n)
            cap *= 2;
          const g = new u8(cap);
          g.set(buf.subarray(0, len));
          buf = g;
        }
      }
      function writeCode(code, nbits) {
        if (bigEndian) {
          acc = acc << nbits | code;
          nAcc += nbits;
          while (nAcc >= 8) {
            nAcc -= 8;
            ensure(1);
            buf[len++] = acc >>> nAcc & 255;
          }
        } else {
          acc |= code << nAcc;
          nAcc += nbits;
          while (nAcc >= 8) {
            ensure(1);
            buf[len++] = acc & 255;
            acc >>>= 8;
            nAcc -= 8;
          }
        }
      }
      function flush() {
        if (nAcc > 0) {
          ensure(1);
          if (bigEndian)
            buf[len++] = acc << 8 - nAcc & 255;
          else
            buf[len++] = acc & 255;
          acc = 0;
          nAcc = 0;
        }
      }
      function bytes() {
        return buf.slice(0, len);
      }
      return { writeCode, flush, bytes };
    }
    function _makeBitReader(data, bigEndian) {
      let pos = 0, acc = 0, nAcc = 0;
      function readCode(nbits) {
        if (bigEndian) {
          while (nAcc < nbits) {
            if (pos >= data.length)
              return -1;
            acc = acc << 8 | data[pos++];
            nAcc += 8;
          }
          nAcc -= nbits;
          return acc >>> nAcc & (1 << nbits) - 1;
        }
        while (nAcc < nbits) {
          if (pos >= data.length)
            return -1;
          acc |= data[pos++] << nAcc;
          nAcc += 8;
        }
        const code = acc & (1 << nbits) - 1;
        acc >>>= nbits;
        nAcc -= nbits;
        return code;
      }
      return { readCode };
    }
    function encode(data, opts) {
      if (!(data instanceof u8))
        throw _codedError("EBADARG", "lzw.encode: data must be Uint8Array");
      const o = _resolveOpts(opts), initialSize = 1 << o.minCodeBits, clearCode = o.useClearEnd ? initialSize : -1, endCode = o.useClearEnd ? initialSize + 1 : -1, firstFree = o.useClearEnd ? initialSize + 2 : initialSize, w = _makeBitWriter(o.bigEndian);
      let codeBits = o.minCodeBits + 1, nextCode = firstFree;
      const maxCode = (1 << o.maxBits) - 1, dict = new Map;
      for (let i = 0;i < initialSize; ++i)
        dict.set(String.fromCharCode(i), i);
      if (o.useClearEnd)
        w.writeCode(clearCode, codeBits);
      if (data.length === 0) {
        if (o.useClearEnd)
          w.writeCode(endCode, codeBits);
        w.flush();
        return w.bytes();
      }
      let cur = String.fromCharCode(data[0]);
      for (let i = 1;i < data.length; ++i) {
        const nextChar = String.fromCharCode(data[i]), candidate = cur + nextChar;
        if (dict.has(candidate))
          cur = candidate;
        else {
          w.writeCode(dict.get(cur), codeBits);
          if (nextCode <= maxCode) {
            dict.set(candidate, nextCode++);
            if (nextCode === (1 << codeBits) + (o.earlyChange ? 0 : 1) && codeBits < o.maxBits)
              codeBits++;
          }
          cur = nextChar;
        }
      }
      w.writeCode(dict.get(cur), codeBits);
      if (o.useClearEnd)
        w.writeCode(endCode, codeBits);
      w.flush();
      return w.bytes();
    }
    function decode(data, opts) {
      if (!(data instanceof u8))
        throw _codedError("EBADARG", "lzw.decode: data must be Uint8Array");
      const o = _resolveOpts(opts), initialSize = 1 << o.minCodeBits, clearCode = o.useClearEnd ? initialSize : -1, endCode = o.useClearEnd ? initialSize + 1 : -1, firstFree = o.useClearEnd ? initialSize + 2 : initialSize, r = _makeBitReader(data, o.bigEndian);
      let out = new u8(Math.max(data.length * 2, 256)), outLen = 0;
      function append(arr) {
        if (outLen + arr.length > out.length) {
          let cap = out.length;
          while (cap < outLen + arr.length)
            cap *= 2;
          const g = new u8(cap);
          g.set(out.subarray(0, outLen));
          out = g;
        }
        out.set(arr, outLen);
        outLen += arr.length;
      }
      const dict = Array(1 << o.maxBits);
      function resetDict() {
        for (let i = 0;i < initialSize; ++i)
          dict[i] = new u8([i]);
        return firstFree;
      }
      let nextCode = resetDict(), codeBits = o.minCodeBits + 1, prevSeq = null;
      const maxCode = (1 << o.maxBits) - 1;
      for (;; ) {
        const code = r.readCode(codeBits);
        if (code < 0)
          break;
        if (code === endCode)
          break;
        if (code === clearCode) {
          nextCode = resetDict();
          codeBits = o.minCodeBits + 1;
          prevSeq = null;
          continue;
        }
        let seq;
        if (code < nextCode) {
          seq = dict[code];
          if (!seq)
            throw _codedError("EBADSTREAM", "lzw.decode: invalid code " + code + " (unassigned)");
        } else if (code === nextCode && prevSeq) {
          seq = new u8(prevSeq.length + 1);
          seq.set(prevSeq, 0);
          seq[prevSeq.length] = prevSeq[0];
        } else
          throw _codedError("EBADSTREAM", "lzw.decode: code " + code + " out of range (nextCode=" + nextCode + ")");
        append(seq);
        if (prevSeq && nextCode <= maxCode) {
          const ent = new u8(prevSeq.length + 1);
          ent.set(prevSeq, 0);
          ent[prevSeq.length] = seq[0];
          dict[nextCode++] = ent;
          if (nextCode === (1 << codeBits) - (o.earlyChange ? 1 : 0) && codeBits < o.maxBits)
            codeBits++;
        }
        prevSeq = seq;
      }
      return outLen === out.length ? out : out.slice(0, outLen);
    }
    return {
      encode,
      decode
    };
  } });
    __register({ name: "utf8", dependencies: [], factory: function() {
    const hasTextEncoder = typeof TextEncoder < "u", hasTextDecoder = typeof TextDecoder < "u", enc = hasTextEncoder ? new TextEncoder : null, dec = hasTextDecoder ? new TextDecoder("utf-8", { fatal: !1 }) : null;
    function manualToBytes(text) {
      const len = text.length, arr = new Uint8Array(len * 3);
      let p = 0;
      for (let i = 0;i < len; i++) {
        let cp = text.charCodeAt(i);
        if (cp >= 55296 && cp <= 56319) {
          const next = i + 1 < len ? text.charCodeAt(i + 1) : -1;
          if (next >= 56320 && next <= 57343) {
            cp = 65536 + (cp - 55296 << 10) + (next - 56320);
            i++;
          } else
            cp = 65533;
        } else if (cp >= 56320 && cp <= 57343)
          cp = 65533;
        if (cp < 128)
          arr[p++] = cp;
        else if (cp < 2048) {
          arr[p++] = 192 | cp >> 6;
          arr[p++] = 128 | cp & 63;
        } else if (cp < 65536) {
          arr[p++] = 224 | cp >> 12;
          arr[p++] = 128 | cp >> 6 & 63;
          arr[p++] = 128 | cp & 63;
        } else {
          arr[p++] = 240 | cp >> 18;
          arr[p++] = 128 | cp >> 12 & 63;
          arr[p++] = 128 | cp >> 6 & 63;
          arr[p++] = 128 | cp & 63;
        }
      }
      return arr.subarray(0, p);
    }
    function manualFromBytes(bytes) {
      const out = [], len = bytes.length;
      let i = 0;
      while (i < len) {
        const b1 = bytes[i];
        let cp;
        if (b1 < 128) {
          cp = b1;
          i += 1;
        } else if (b1 < 192) {
          cp = 65533;
          i += 1;
        } else if (b1 < 224) {
          if (i + 1 >= len) {
            out.push(String.fromCharCode(65533));
            break;
          }
          cp = (b1 & 31) << 6 | bytes[i + 1] & 63;
          i += 2;
        } else if (b1 < 240) {
          if (i + 2 >= len) {
            out.push(String.fromCharCode(65533));
            break;
          }
          cp = (b1 & 15) << 12 | (bytes[i + 1] & 63) << 6 | bytes[i + 2] & 63;
          i += 3;
        } else if (b1 < 248) {
          if (i + 3 >= len) {
            out.push(String.fromCharCode(65533));
            break;
          }
          cp = (b1 & 7) << 18 | (bytes[i + 1] & 63) << 12 | (bytes[i + 2] & 63) << 6 | bytes[i + 3] & 63;
          i += 4;
        } else {
          cp = 65533;
          i += 1;
        }
        if (cp < 65536)
          out.push(String.fromCharCode(cp));
        else {
          cp -= 65536;
          out.push(String.fromCharCode(55296 | cp >> 10, 56320 | cp & 1023));
        }
      }
      return out.join("");
    }
    return { toBytes: function(text) {
      if (text === "" || text == null)
        return new Uint8Array(0);
      if (enc)
        return enc.encode(String(text));
      return manualToBytes(String(text));
    }, fromBytes: function(bytes) {
      if (!bytes || bytes.length === 0)
        return "";
      if (dec) {
        const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
        return dec.decode(u8);
      }
      return manualFromBytes(bytes);
    } };
  } });
    __register({ name: "aes", dependencies: [], factory: function() {
    const tables = [[[], [], [], [], []], [[], [], [], [], []]];
    (function precompute() {
      const encTable = tables[0], decTable = tables[1], sbox = encTable[4], sboxInv = decTable[4], d = [], th = [];
      let x, xInv, x2, x4, x8, s, tEnc, tDec, i;
      for (i = 0;i < 256; i++)
        th[(d[i] = i << 1 ^ (i >> 7) * 283) ^ i] = i;
      for (x = xInv = 0;!sbox[x]; x ^= x2 || 1, xInv = th[xInv] || 1) {
        s = xInv ^ xInv << 1 ^ xInv << 2 ^ xInv << 3 ^ xInv << 4;
        s = s >> 8 ^ s & 255 ^ 99;
        sbox[x] = s;
        sboxInv[s] = x;
        x8 = d[x4 = d[x2 = d[x]]];
        tDec = x8 * 16843009 ^ x4 * 65537 ^ x2 * 257 ^ x * 16843008;
        tEnc = d[s] * 257 ^ s * 16843008;
        for (i = 0;i < 4; i++) {
          encTable[i][x] = tEnc = tEnc << 24 ^ tEnc >>> 8;
          decTable[i][s] = tDec = tDec << 24 ^ tDec >>> 8;
        }
      }
      for (i = 0;i < 5; i++) {
        encTable[i] = encTable[i].slice(0);
        decTable[i] = decTable[i].slice(0);
      }
    })();
    function crypt(input, dir, keys, _tables) {
      if (input.length !== 4) {
        console.warn("[crypto] INVALID: aes: invalid block size");
        return !1;
      }
      const key = keys[dir];
      let a = input[0] ^ key[0], b = input[dir ? 3 : 1] ^ key[1], c = input[2] ^ key[2], d = input[dir ? 1 : 3] ^ key[3], a2, b2, c2;
      const nInnerRounds = key.length / 4 - 2;
      let kIndex = 4;
      const out = [0, 0, 0, 0], table = _tables[dir], t0 = table[0], t1 = table[1], t2 = table[2], t3 = table[3], sbox = table[4];
      for (let i = 0;i < nInnerRounds; i++) {
        a2 = t0[a >>> 24] ^ t1[b >> 16 & 255] ^ t2[c >> 8 & 255] ^ t3[d & 255] ^ key[kIndex];
        b2 = t0[b >>> 24] ^ t1[c >> 16 & 255] ^ t2[d >> 8 & 255] ^ t3[a & 255] ^ key[kIndex + 1];
        c2 = t0[c >>> 24] ^ t1[d >> 16 & 255] ^ t2[a >> 8 & 255] ^ t3[b & 255] ^ key[kIndex + 2];
        d = t0[d >>> 24] ^ t1[a >> 16 & 255] ^ t2[b >> 8 & 255] ^ t3[c & 255] ^ key[kIndex + 3];
        kIndex += 4;
        a = a2;
        b = b2;
        c = c2;
      }
      for (let i = 0;i < 4; i++) {
        out[dir ? 3 & -i : i] = sbox[a >>> 24] << 24 ^ sbox[b >> 16 & 255] << 16 ^ sbox[c >> 8 & 255] << 8 ^ sbox[d & 255] ^ key[kIndex++];
        a2 = a;
        a = b;
        b = c;
        c = d;
        d = a2;
      }
      return out;
    }
    const LANES = 65535;
    function _bsMul(a, b, out) {
      const a0 = a[0], a1 = a[1], a2 = a[2], a3 = a[3], a4 = a[4], a5 = a[5], a6 = a[6], a7 = a[7], b0 = b[0], b1 = b[1], b2 = b[2], b3 = b[3], b4 = b[4], b5 = b[5], b6 = b[6], b7 = b[7];
      let p0 = a0 & b0, p1 = a0 & b1 ^ a1 & b0, p2 = a0 & b2 ^ a1 & b1 ^ a2 & b0, p3 = a0 & b3 ^ a1 & b2 ^ a2 & b1 ^ a3 & b0, p4 = a0 & b4 ^ a1 & b3 ^ a2 & b2 ^ a3 & b1 ^ a4 & b0, p5 = a0 & b5 ^ a1 & b4 ^ a2 & b3 ^ a3 & b2 ^ a4 & b1 ^ a5 & b0, p6 = a0 & b6 ^ a1 & b5 ^ a2 & b4 ^ a3 & b3 ^ a4 & b2 ^ a5 & b1 ^ a6 & b0, p7 = a0 & b7 ^ a1 & b6 ^ a2 & b5 ^ a3 & b4 ^ a4 & b3 ^ a5 & b2 ^ a6 & b1 ^ a7 & b0, p8 = a1 & b7 ^ a2 & b6 ^ a3 & b5 ^ a4 & b4 ^ a5 & b3 ^ a6 & b2 ^ a7 & b1, p9 = a2 & b7 ^ a3 & b6 ^ a4 & b5 ^ a5 & b4 ^ a6 & b3 ^ a7 & b2, p10 = a3 & b7 ^ a4 & b6 ^ a5 & b5 ^ a6 & b4 ^ a7 & b3, p11 = a4 & b7 ^ a5 & b6 ^ a6 & b5 ^ a7 & b4, p12 = a5 & b7 ^ a6 & b6 ^ a7 & b5, p13 = a6 & b7 ^ a7 & b6, p14 = a7 & b7;
      p10 ^= p14;
      p9 ^= p14;
      p7 ^= p14;
      p6 ^= p14;
      p9 ^= p13;
      p8 ^= p13;
      p6 ^= p13;
      p5 ^= p13;
      p8 ^= p12;
      p7 ^= p12;
      p5 ^= p12;
      p4 ^= p12;
      p7 ^= p11;
      p6 ^= p11;
      p4 ^= p11;
      p3 ^= p11;
      p6 ^= p10;
      p5 ^= p10;
      p3 ^= p10;
      p2 ^= p10;
      p5 ^= p9;
      p4 ^= p9;
      p2 ^= p9;
      p1 ^= p9;
      p4 ^= p8;
      p3 ^= p8;
      p1 ^= p8;
      p0 ^= p8;
      out[0] = p0;
      out[1] = p1;
      out[2] = p2;
      out[3] = p3;
      out[4] = p4;
      out[5] = p5;
      out[6] = p6;
      out[7] = p7;
    }
    function _bsSq(a, out) {
      const a0 = a[0], a1 = a[1], a2 = a[2], a3 = a[3], a4 = a[4], a5 = a[5], a6 = a[6], a7 = a[7];
      out[0] = a0 ^ a4 ^ a6;
      out[1] = a4 ^ a6 ^ a7;
      out[2] = a1 ^ a5;
      out[3] = a4 ^ a5 ^ a6 ^ a7;
      out[4] = a2 ^ a4 ^ a7;
      out[5] = a5 ^ a6;
      out[6] = a3 ^ a5;
      out[7] = a6 ^ a7;
    }
    const _x2 = new Int32Array(8), _x3 = new Int32Array(8), _x12 = new Int32Array(8), _acc = new Int32Array(8), _aff = new Int32Array(8);
    function _bsInv(x) {
      _bsSq(x, _x2);
      _bsMul(_x2, x, _x3);
      _bsSq(_x3, _x12);
      _bsSq(_x12, _x12);
      _bsMul(_x12, _x3, _acc);
      _bsSq(_acc, _acc);
      _bsSq(_acc, _acc);
      _bsSq(_acc, _acc);
      _bsSq(_acc, _acc);
      _bsMul(_acc, _x12, _acc);
      _bsMul(_acc, _x2, x);
    }
    function _bsSubPlanes(s) {
      _bsInv(s);
      for (let k = 0;k < 8; k++)
        _aff[k] = s[k];
      for (let k = 0;k < 8; k++)
        s[k] = _aff[k] ^ _aff[k + 4 & 7] ^ _aff[k + 5 & 7] ^ _aff[k + 6 & 7] ^ _aff[k + 7 & 7] ^ (99 >> k & 1 ? LANES : 0);
    }
    function _bsInvSubPlanes(s) {
      for (let k = 0;k < 8; k++)
        _aff[k] = s[k];
      for (let k = 0;k < 8; k++)
        s[k] = _aff[k + 2 & 7] ^ _aff[k + 5 & 7] ^ _aff[k + 7 & 7] ^ (5 >> k & 1 ? LANES : 0);
      _bsInv(s);
    }
    function _bsShift(s, inv) {
      for (let k = 0;k < 8; k++) {
        const x = s[k];
        let y = x & 4369;
        for (let r = 1;r < 4; r++) {
          const m = 4369 << r, v = x & m, n = 4 * r, rot = inv ? v << n | v >>> 16 - n : v >>> n | v << 16 - n;
          y |= rot & m;
        }
        s[k] = y;
      }
    }
    const _c1 = new Int32Array(8), _u = new Int32Array(8);
    function _bsMix(s) {
      for (let k = 0;k < 8; k++) {
        const x = s[k], x1 = x >>> 1 & 30583 | (x & 4369) << 3, x2 = x1 >>> 1 & 30583 | (x1 & 4369) << 3, x3 = x2 >>> 1 & 30583 | (x2 & 4369) << 3;
        _c1[k] = x ^ x1 ^ x2 ^ x3;
        _u[k] = x ^ x1;
      }
      const u = _u, xt0 = u[7], xt1 = u[0] ^ u[7], xt2 = u[1], xt3 = u[2] ^ u[7], xt4 = u[3] ^ u[7], xt5 = u[4], xt6 = u[5], xt7 = u[6];
      s[0] ^= _c1[0] ^ xt0;
      s[1] ^= _c1[1] ^ xt1;
      s[2] ^= _c1[2] ^ xt2;
      s[3] ^= _c1[3] ^ xt3;
      s[4] ^= _c1[4] ^ xt4;
      s[5] ^= _c1[5] ^ xt5;
      s[6] ^= _c1[6] ^ xt6;
      s[7] ^= _c1[7] ^ xt7;
    }
    function _bsInvMix(s) {
      _bsMix(s);
      _bsMix(s);
      _bsMix(s);
    }
    function _bsPack(words, out) {
      out.fill(0);
      for (let c = 0;c < 4; c++) {
        const w = words[c];
        for (let r = 0;r < 4; r++) {
          const byte = w >>> 24 - 8 * r & 255, lane = r + 4 * c;
          for (let k = 0;k < 8; k++)
            out[k] |= (byte >>> k & 1) << lane;
        }
      }
    }
    function _bsUnpack(s) {
      const out = [0, 0, 0, 0];
      for (let c = 0;c < 4; c++) {
        let w = 0;
        for (let r = 0;r < 4; r++) {
          const lane = r + 4 * c;
          let byte = 0;
          for (let k = 0;k < 8; k++)
            byte |= (s[k] >>> lane & 1) << k;
          w |= byte << 24 - 8 * r;
        }
        out[c] = w;
      }
      return out;
    }
    const _state = new Int32Array(8);
    function _subWordCT(w) {
      _bsPack([w, 0, 0, 0], _state);
      _bsSubPlanes(_state);
      return _bsUnpack(_state)[0];
    }
    function _expandKeyCT(key) {
      const n = key.length, w = key.slice(0);
      let rcon = 1;
      for (let i = n;i < 4 * n + 28; i++) {
        let tmp = w[i - 1];
        if (i % n === 0) {
          tmp = _subWordCT(tmp << 8 | tmp >>> 24) ^ rcon << 24;
          rcon = rcon << 1 ^ (rcon >> 7) * 283;
        } else if (n === 8 && i % n === 4)
          tmp = _subWordCT(tmp);
        w[i] = w[i - n] ^ tmp;
      }
      return w;
    }
    function _expandKeyTable(key) {
      const sbox = tables[0][4], n = key.length, w = key.slice(0);
      let rcon = 1;
      for (let i = n;i < 4 * n + 28; i++) {
        let tmp = w[i - 1];
        if (i % n === 0 || n === 8 && i % n === 4) {
          tmp = sbox[tmp >>> 24] << 24 ^ sbox[tmp >> 16 & 255] << 16 ^ sbox[tmp >> 8 & 255] << 8 ^ sbox[tmp & 255];
          if (i % n === 0) {
            tmp = tmp << 8 ^ tmp >>> 24 ^ rcon << 24;
            rcon = rcon << 1 ^ (rcon >> 7) * 283;
          }
        }
        w[i] = w[i - n] ^ tmp;
      }
      return w;
    }
    function _bsRoundKeys(words) {
      const rk = [];
      for (let r = 0;r < words.length / 4; r++) {
        const p = new Int32Array(8);
        _bsPack(words.slice(4 * r, 4 * r + 4), p);
        rk.push(p);
      }
      return rk;
    }
    const _addKey = (s, k) => {
      for (let i = 0;i < 8; i++)
        s[i] ^= k[i];
    };
    function _bsCrypt(input, dir, rk) {
      if (!input || input.length !== 4) {
        console.warn("[crypto] INVALID: aes: invalid block size");
        return !1;
      }
      const s = _state, nr = rk.length - 1;
      _bsPack(input, s);
      if (!dir) {
        _addKey(s, rk[0]);
        for (let r = 1;r < nr; r++) {
          _bsSubPlanes(s);
          _bsShift(s, !1);
          _bsMix(s);
          _addKey(s, rk[r]);
        }
        _bsSubPlanes(s);
        _bsShift(s, !1);
        _addKey(s, rk[nr]);
      } else {
        _addKey(s, rk[nr]);
        for (let r = nr - 1;r >= 1; r--) {
          _bsShift(s, !0);
          _bsInvSubPlanes(s);
          _addKey(s, rk[r]);
          _bsInvMix(s);
        }
        _bsShift(s, !0);
        _bsInvSubPlanes(s);
        _addKey(s, rk[0]);
      }
      return _bsUnpack(s);
    }
    const _bsEncrypt = (input, rk) => _bsCrypt(input, 0, rk), api = {};
    api.fn = function(input_key, full = !0) {
      const keyLen = input_key.length;
      if (keyLen !== 4 && keyLen !== 6 && keyLen !== 8) {
        console.warn("[crypto] INVALID: aes: invalid key size");
        return !1;
      }
      const rk = _bsRoundKeys(_expandKeyCT(input_key)), ret = { encrypt(data) {
        return _bsCrypt(data, 0, rk);
      } };
      if (full)
        ret.decrypt = (data) => _bsCrypt(data, 1, rk);
      return ret;
    };
    api.ttable = {
      fn(input_key, full = !0) {
        const _tables = tables.slice(), sbox = _tables[0][4], decTable = _tables[1], keyLen = input_key.length;
        let rcon = 1, i, j, tmp;
        if (keyLen !== 4 && keyLen !== 6 && keyLen !== 8) {
          console.warn("[crypto] INVALID: aes: invalid key size");
          return !1;
        }
        const encKey = input_key.slice(0), decKey = [], key = [encKey, decKey];
        for (i = keyLen;i < 4 * keyLen + 28; i++) {
          tmp = encKey[i - 1];
          if (i % keyLen === 0 || keyLen === 8 && i % keyLen === 4) {
            tmp = sbox[tmp >>> 24] << 24 ^ sbox[tmp >> 16 & 255] << 16 ^ sbox[tmp >> 8 & 255] << 8 ^ sbox[tmp & 255];
            if (i % keyLen === 0) {
              tmp = tmp << 8 ^ tmp >>> 24 ^ rcon << 24;
              rcon = rcon << 1 ^ (rcon >> 7) * 283;
            }
          }
          encKey[i] = encKey[i - keyLen] ^ tmp;
        }
        if (full)
          for (j = 0;i; j++, i--) {
            tmp = encKey[j & 3 ? i : i - 4];
            if (i <= 4 || j < 4)
              decKey[j] = tmp;
            else
              decKey[j] = decTable[0][sbox[tmp >>> 24]] ^ decTable[1][sbox[tmp >> 16 & 255]] ^ decTable[2][sbox[tmp >> 8 & 255]] ^ decTable[3][sbox[tmp & 255]];
          }
        const ret = {
          encrypt(data) {
            return crypt(data, 0, key, _tables);
          }
        };
        if (full)
          ret.decrypt = function(data) {
            return crypt(data, 1, key, _tables);
          };
        return ret;
      }
    };
    Object.defineProperty(api, Symbol.for("@awacloud/fw/internal"), { value: {
      sbox: tables[0][4],
      sboxInv: tables[1][4],
      bsSub(bytes) {
        const p = new Int32Array(8);
        for (let i = 0;i < 16; i++)
          for (let k = 0;k < 8; k++)
            p[k] |= (bytes[i] >>> k & 1) << i;
        _bsSubPlanes(p);
        return Uint8Array.from({ length: 16 }, (_, i) => {
          let v = 0;
          for (let k = 0;k < 8; k++)
            v |= (p[k] >>> i & 1) << k;
          return v;
        });
      },
      bsInvSub(bytes) {
        const p = new Int32Array(8);
        for (let i = 0;i < 16; i++)
          for (let k = 0;k < 8; k++)
            p[k] |= (bytes[i] >>> k & 1) << i;
        _bsInvSubPlanes(p);
        return Uint8Array.from({ length: 16 }, (_, i) => {
          let v = 0;
          for (let k = 0;k < 8; k++)
            v |= (p[k] >>> i & 1) << k;
          return v;
        });
      },
      expandKey: _expandKeyCT,
      expandKeyTable: _expandKeyTable,
      bsEncrypt: _bsEncrypt
    } });
    return api;
  } });
    __register({ name: "cbc", dependencies: ["bitArray"], factory: function(bitArray) {
    function _checkBlockAligned(data, label) {
      if (data.length % 4 !== 0 || bitArray.bitLength(data) !== data.length * 32) {
        console.warn(`[crypto] INVALID: cbc: ${label} must be a whole number of 16-byte blocks`);
        return !1;
      }
      return !0;
    }
    function _checkIv(iv) {
      if (bitArray.bitLength(iv) !== 128) {
        console.warn("[crypto] INVALID: cbc: iv must be 128 bits");
        return !1;
      }
      return !0;
    }
    function encrypt(prf, plaintext, iv) {
      if (!_checkIv(iv))
        return !1;
      if (!_checkBlockAligned(plaintext, "plaintext"))
        return !1;
      const l = plaintext.length, out = Array(l);
      let p0 = iv[0], p1 = iv[1], p2 = iv[2], p3 = iv[3];
      for (let i = 0;i < l; i += 4) {
        const block = [
          plaintext[i] ^ p0,
          plaintext[i + 1] ^ p1,
          plaintext[i + 2] ^ p2,
          plaintext[i + 3] ^ p3
        ], enc = prf.encrypt(block);
        out[i] = enc[0];
        out[i + 1] = enc[1];
        out[i + 2] = enc[2];
        out[i + 3] = enc[3];
        p0 = enc[0];
        p1 = enc[1];
        p2 = enc[2];
        p3 = enc[3];
      }
      return out;
    }
    function decrypt(prf, ciphertext, iv) {
      if (!_checkIv(iv))
        return !1;
      if (!_checkBlockAligned(ciphertext, "ciphertext"))
        return !1;
      if (typeof prf.decrypt !== "function") {
        console.warn("[crypto] INVALID: cbc: prf does not expose decrypt (build the cipher with full=true)");
        return !1;
      }
      const l = ciphertext.length, out = Array(l);
      let p0 = iv[0], p1 = iv[1], p2 = iv[2], p3 = iv[3];
      for (let i = 0;i < l; i += 4) {
        const c0 = ciphertext[i], c1 = ciphertext[i + 1], c2 = ciphertext[i + 2], c3 = ciphertext[i + 3], dec = prf.decrypt([c0, c1, c2, c3]);
        out[i] = dec[0] ^ p0;
        out[i + 1] = dec[1] ^ p1;
        out[i + 2] = dec[2] ^ p2;
        out[i + 3] = dec[3] ^ p3;
        p0 = c0;
        p1 = c1;
        p2 = c2;
        p3 = c3;
      }
      return out;
    }
    return {
      encrypt,
      decrypt
    };
  } });
    __register({ name: "gcm", dependencies: ["bitArray"], factory: function(bitArray) {
    function _gmult(X, Y) {
      const Z = [0, 0, 0, 0], V = [Y[0], Y[1], Y[2], Y[3]];
      for (let i = 0;i < 128; i++) {
        const w = i >>> 5, b = 31 - (i & 31);
        if (X[w] >>> b & 1) {
          Z[0] ^= V[0];
          Z[1] ^= V[1];
          Z[2] ^= V[2];
          Z[3] ^= V[3];
        }
        const lsb = V[3] & 1;
        V[3] = V[3] >>> 1 | (V[2] & 1) << 31;
        V[2] = V[2] >>> 1 | (V[1] & 1) << 31;
        V[1] = V[1] >>> 1 | (V[0] & 1) << 31;
        V[0] = V[0] >>> 1;
        if (lsb)
          V[0] ^= -520093696;
      }
      return Z;
    }
    function _ghash(H, data) {
      let Y0 = 0, Y1 = 0, Y2 = 0, Y3 = 0;
      for (let i = 0;i < data.length; i += 4) {
        Y0 ^= data[i];
        Y1 ^= data[i + 1];
        Y2 ^= data[i + 2];
        Y3 ^= data[i + 3];
        const out = _gmult([Y0, Y1, Y2, Y3], H);
        Y0 = out[0];
        Y1 = out[1];
        Y2 = out[2];
        Y3 = out[3];
      }
      return [Y0, Y1, Y2, Y3];
    }
    function _zpad128(data) {
      const u8 = bitArray.ba_to_ui8(data), padBytes = (16 - u8.length % 16) % 16;
      if (padBytes === 0)
        return bitArray.ui8_to_ba(u8);
      const padded = new Uint8Array(u8.length + padBytes);
      padded.set(u8, 0);
      return bitArray.ui8_to_ba(padded);
    }
    function _len64(bits) {
      const lo = bits | 0;
      return [Math.floor(bits / 4294967296) | 0, lo];
    }
    function _gctr(prf, icb, data) {
      const dataBits = bitArray.bitLength(data);
      if (dataBits === 0)
        return [];
      const u8 = bitArray.ba_to_ui8(data), padBytes = (16 - u8.length % 16) % 16;
      let buf;
      if (padBytes === 0)
        buf = bitArray.ui8_to_ba(u8);
      else {
        const padded = new Uint8Array(u8.length + padBytes);
        padded.set(u8, 0);
        buf = bitArray.ui8_to_ba(padded);
      }
      const cb = [icb[0], icb[1], icb[2], icb[3]];
      for (let i = 0;i < buf.length; i += 4) {
        const e = prf.encrypt(cb);
        buf[i] = buf[i] ^ e[0] | 0;
        buf[i + 1] = buf[i + 1] ^ e[1] | 0;
        buf[i + 2] = buf[i + 2] ^ e[2] | 0;
        buf[i + 3] = buf[i + 3] ^ e[3] | 0;
        cb[3] = cb[3] + 1 | 0;
      }
      return bitArray.clamp(buf, dataBits);
    }
    function _j0(H, iv) {
      const ivBits = bitArray.bitLength(iv);
      if (ivBits === 96) {
        const ivBytes = bitArray.ba_to_ui8(iv), out = new Uint8Array(16);
        out.set(ivBytes, 0);
        out[15] = 1;
        return bitArray.ui8_to_ba(out);
      }
      const padded = _zpad128(iv), tail = [0, 0].concat(_len64(ivBits));
      return _ghash(H, padded.concat(tail));
    }
    function _incCb(cb) {
      return [cb[0], cb[1], cb[2], cb[3] + 1 | 0];
    }
    function _authTag(prf, H, J0, adata, ciphertext, tlen) {
      const aBits = bitArray.bitLength(adata), cBits = bitArray.bitLength(ciphertext), ghashInput = _zpad128(adata).concat(_zpad128(ciphertext)).concat(_len64(aBits)).concat(_len64(cBits)), S = _ghash(H, ghashInput);
      return bitArray.clamp(_gctr(prf, J0, S), tlen);
    }
    function _validateInputs(iv, tlen) {
      if (bitArray.bitLength(iv) === 0) {
        console.warn("[crypto] INVALID: gcm: iv must not be empty");
        return !1;
      }
      if (tlen < 32 || tlen > 128) {
        console.warn("[crypto] INVALID: gcm: tag length must be 32..128 bits");
        return !1;
      }
      return !0;
    }
    function encrypt(prf, plaintext, iv, adata, tlen) {
      adata = adata || [];
      tlen = tlen === void 0 ? 128 : tlen;
      if (!_validateInputs(iv, tlen))
        return !1;
      const H = prf.encrypt([0, 0, 0, 0]), J0 = _j0(H, iv), ct = _gctr(prf, _incCb(J0), plaintext), tag = _authTag(prf, H, J0, adata, ct, tlen);
      return { ct, tag };
    }
    function decrypt(prf, ciphertext, iv, adata, tag, tlen) {
      adata = adata || [];
      tlen = tlen === void 0 ? bitArray.bitLength(tag) : tlen;
      if (!_validateInputs(iv, tlen))
        return !1;
      const H = prf.encrypt([0, 0, 0, 0]), J0 = _j0(H, iv), expected = _authTag(prf, H, J0, adata, ciphertext, tlen);
      if (!bitArray.equal(bitArray.clamp(tag, tlen), expected)) {
        console.warn("[crypto] CORRUPT: gcm: authentication tag mismatch");
        return !1;
      }
      return _gctr(prf, _incCb(J0), ciphertext);
    }
    function gmac(prf, adata, iv, tlen) {
      const r = encrypt(prf, [], iv, adata, tlen);
      return r === !1 ? !1 : r.tag;
    }
    function gmacVerify(prf, adata, iv, tag, tlen) {
      tlen = tlen === void 0 ? bitArray.bitLength(tag) : tlen;
      const expected = gmac(prf, adata, iv, tlen);
      if (expected === !1)
        return !1;
      return bitArray.equal(bitArray.clamp(tag, tlen), expected);
    }
    function nonceTracker(prf) {
      const seen = new Set, key = (iv) => {
        const u8 = bitArray.ba_to_ui8(iv);
        let s = "";
        for (let i = 0;i < u8.length; i++)
          s += (u8[i] < 16 ? "0" : "") + u8[i].toString(16);
        return s;
      };
      return {
        seenNonces: seen,
        encrypt(plaintext, iv, adata, tlen) {
          const k = key(iv);
          if (seen.has(k)) {
            console.error("[crypto] CORRUPT: gcm: nonce reuse rejected by tracker");
            return !1;
          }
          seen.add(k);
          return encrypt(prf, plaintext, iv, adata, tlen);
        },
        decrypt(ciphertext, iv, adata, tag, tlen) {
          return decrypt(prf, ciphertext, iv, adata, tag, tlen);
        }
      };
    }
    return Object.defineProperty({
      encrypt,
      decrypt,
      gmac,
      gmacVerify,
      nonceTracker
    }, Symbol.for("@awacloud/fw/internal"), {
      value: { ghash: _ghash, gctr: _gctr }
    });
  } });
    __register({ name: "sha256", dependencies: ["bitArray","utf8"], factory: function(bitArray, utf8) {
    const _INIT = [
      1779033703,
      3144134277,
      1013904242,
      2773480762,
      1359893119,
      2600822924,
      528734635,
      1541459225
    ], _KEY = [
      1116352408,
      1899447441,
      3049323471,
      3921009573,
      961987163,
      1508970993,
      2453635748,
      2870763221,
      3624381080,
      310598401,
      607225278,
      1426881987,
      1925078388,
      2162078206,
      2614888103,
      3248222580,
      3835390401,
      4022224774,
      264347078,
      604807628,
      770255983,
      1249150122,
      1555081692,
      1996064986,
      2554220882,
      2821834349,
      2952996808,
      3210313671,
      3336571891,
      3584528711,
      113926993,
      338241895,
      666307205,
      773529912,
      1294757372,
      1396182291,
      1695183700,
      1986661051,
      2177026350,
      2456956037,
      2730485921,
      2820302411,
      3259730800,
      3345764771,
      3516065817,
      3600352804,
      4094571909,
      275423344,
      430227734,
      506948616,
      659060556,
      883997877,
      958139571,
      1322822218,
      1537002063,
      1747873779,
      1955562222,
      2024104815,
      2227730452,
      2361852424,
      2428436474,
      2756734187,
      3204031479,
      3329325298
    ], _K32 = Int32Array.from(_KEY), _BW = new Int32Array(16), _W64 = new Int32Array(64);
    function _compress(h, w) {
      const k = _K32, W = _W64;
      for (let i = 0;i < 16; i++)
        W[i] = w[i] | 0;
      for (let i = 16;i < 64; i++) {
        const a = W[i - 15], b = W[i - 2], s0 = (a >>> 7 | a << 25) ^ (a >>> 18 | a << 14) ^ a >>> 3, s1 = (b >>> 17 | b << 15) ^ (b >>> 19 | b << 13) ^ b >>> 10;
        W[i] = (s0 + W[i - 16] | 0) + (s1 + W[i - 7] | 0) | 0;
      }
      let a = h[0] | 0, b = h[1] | 0, c = h[2] | 0, d = h[3] | 0, e = h[4] | 0, f = h[5] | 0, g = h[6] | 0, hh = h[7] | 0, t1, t2, s0, s1, ch, mj;
      s1 = (e >>> 6 | e << 26) ^ (e >>> 11 | e << 21) ^ (e >>> 25 | e << 7);
      ch = g ^ e & (f ^ g);
      t1 = ((hh + s1 | 0) + ch | 0) + (k[0] + W[0] | 0) | 0;
      s0 = (a >>> 2 | a << 30) ^ (a >>> 13 | a << 19) ^ (a >>> 22 | a << 10);
      mj = a & b ^ c & (a ^ b);
      t2 = s0 + mj | 0;
      d = d + t1 | 0;
      hh = t1 + t2 | 0;
      s1 = (d >>> 6 | d << 26) ^ (d >>> 11 | d << 21) ^ (d >>> 25 | d << 7);
      ch = f ^ d & (e ^ f);
      t1 = ((g + s1 | 0) + ch | 0) + (k[1] + W[1] | 0) | 0;
      s0 = (hh >>> 2 | hh << 30) ^ (hh >>> 13 | hh << 19) ^ (hh >>> 22 | hh << 10);
      mj = hh & a ^ b & (hh ^ a);
      t2 = s0 + mj | 0;
      c = c + t1 | 0;
      g = t1 + t2 | 0;
      s1 = (c >>> 6 | c << 26) ^ (c >>> 11 | c << 21) ^ (c >>> 25 | c << 7);
      ch = e ^ c & (d ^ e);
      t1 = ((f + s1 | 0) + ch | 0) + (k[2] + W[2] | 0) | 0;
      s0 = (g >>> 2 | g << 30) ^ (g >>> 13 | g << 19) ^ (g >>> 22 | g << 10);
      mj = g & hh ^ a & (g ^ hh);
      t2 = s0 + mj | 0;
      b = b + t1 | 0;
      f = t1 + t2 | 0;
      s1 = (b >>> 6 | b << 26) ^ (b >>> 11 | b << 21) ^ (b >>> 25 | b << 7);
      ch = d ^ b & (c ^ d);
      t1 = ((e + s1 | 0) + ch | 0) + (k[3] + W[3] | 0) | 0;
      s0 = (f >>> 2 | f << 30) ^ (f >>> 13 | f << 19) ^ (f >>> 22 | f << 10);
      mj = f & g ^ hh & (f ^ g);
      t2 = s0 + mj | 0;
      a = a + t1 | 0;
      e = t1 + t2 | 0;
      s1 = (a >>> 6 | a << 26) ^ (a >>> 11 | a << 21) ^ (a >>> 25 | a << 7);
      ch = c ^ a & (b ^ c);
      t1 = ((d + s1 | 0) + ch | 0) + (k[4] + W[4] | 0) | 0;
      s0 = (e >>> 2 | e << 30) ^ (e >>> 13 | e << 19) ^ (e >>> 22 | e << 10);
      mj = e & f ^ g & (e ^ f);
      t2 = s0 + mj | 0;
      hh = hh + t1 | 0;
      d = t1 + t2 | 0;
      s1 = (hh >>> 6 | hh << 26) ^ (hh >>> 11 | hh << 21) ^ (hh >>> 25 | hh << 7);
      ch = b ^ hh & (a ^ b);
      t1 = ((c + s1 | 0) + ch | 0) + (k[5] + W[5] | 0) | 0;
      s0 = (d >>> 2 | d << 30) ^ (d >>> 13 | d << 19) ^ (d >>> 22 | d << 10);
      mj = d & e ^ f & (d ^ e);
      t2 = s0 + mj | 0;
      g = g + t1 | 0;
      c = t1 + t2 | 0;
      s1 = (g >>> 6 | g << 26) ^ (g >>> 11 | g << 21) ^ (g >>> 25 | g << 7);
      ch = a ^ g & (hh ^ a);
      t1 = ((b + s1 | 0) + ch | 0) + (k[6] + W[6] | 0) | 0;
      s0 = (c >>> 2 | c << 30) ^ (c >>> 13 | c << 19) ^ (c >>> 22 | c << 10);
      mj = c & d ^ e & (c ^ d);
      t2 = s0 + mj | 0;
      f = f + t1 | 0;
      b = t1 + t2 | 0;
      s1 = (f >>> 6 | f << 26) ^ (f >>> 11 | f << 21) ^ (f >>> 25 | f << 7);
      ch = hh ^ f & (g ^ hh);
      t1 = ((a + s1 | 0) + ch | 0) + (k[7] + W[7] | 0) | 0;
      s0 = (b >>> 2 | b << 30) ^ (b >>> 13 | b << 19) ^ (b >>> 22 | b << 10);
      mj = b & c ^ d & (b ^ c);
      t2 = s0 + mj | 0;
      e = e + t1 | 0;
      a = t1 + t2 | 0;
      s1 = (e >>> 6 | e << 26) ^ (e >>> 11 | e << 21) ^ (e >>> 25 | e << 7);
      ch = g ^ e & (f ^ g);
      t1 = ((hh + s1 | 0) + ch | 0) + (k[8] + W[8] | 0) | 0;
      s0 = (a >>> 2 | a << 30) ^ (a >>> 13 | a << 19) ^ (a >>> 22 | a << 10);
      mj = a & b ^ c & (a ^ b);
      t2 = s0 + mj | 0;
      d = d + t1 | 0;
      hh = t1 + t2 | 0;
      s1 = (d >>> 6 | d << 26) ^ (d >>> 11 | d << 21) ^ (d >>> 25 | d << 7);
      ch = f ^ d & (e ^ f);
      t1 = ((g + s1 | 0) + ch | 0) + (k[9] + W[9] | 0) | 0;
      s0 = (hh >>> 2 | hh << 30) ^ (hh >>> 13 | hh << 19) ^ (hh >>> 22 | hh << 10);
      mj = hh & a ^ b & (hh ^ a);
      t2 = s0 + mj | 0;
      c = c + t1 | 0;
      g = t1 + t2 | 0;
      s1 = (c >>> 6 | c << 26) ^ (c >>> 11 | c << 21) ^ (c >>> 25 | c << 7);
      ch = e ^ c & (d ^ e);
      t1 = ((f + s1 | 0) + ch | 0) + (k[10] + W[10] | 0) | 0;
      s0 = (g >>> 2 | g << 30) ^ (g >>> 13 | g << 19) ^ (g >>> 22 | g << 10);
      mj = g & hh ^ a & (g ^ hh);
      t2 = s0 + mj | 0;
      b = b + t1 | 0;
      f = t1 + t2 | 0;
      s1 = (b >>> 6 | b << 26) ^ (b >>> 11 | b << 21) ^ (b >>> 25 | b << 7);
      ch = d ^ b & (c ^ d);
      t1 = ((e + s1 | 0) + ch | 0) + (k[11] + W[11] | 0) | 0;
      s0 = (f >>> 2 | f << 30) ^ (f >>> 13 | f << 19) ^ (f >>> 22 | f << 10);
      mj = f & g ^ hh & (f ^ g);
      t2 = s0 + mj | 0;
      a = a + t1 | 0;
      e = t1 + t2 | 0;
      s1 = (a >>> 6 | a << 26) ^ (a >>> 11 | a << 21) ^ (a >>> 25 | a << 7);
      ch = c ^ a & (b ^ c);
      t1 = ((d + s1 | 0) + ch | 0) + (k[12] + W[12] | 0) | 0;
      s0 = (e >>> 2 | e << 30) ^ (e >>> 13 | e << 19) ^ (e >>> 22 | e << 10);
      mj = e & f ^ g & (e ^ f);
      t2 = s0 + mj | 0;
      hh = hh + t1 | 0;
      d = t1 + t2 | 0;
      s1 = (hh >>> 6 | hh << 26) ^ (hh >>> 11 | hh << 21) ^ (hh >>> 25 | hh << 7);
      ch = b ^ hh & (a ^ b);
      t1 = ((c + s1 | 0) + ch | 0) + (k[13] + W[13] | 0) | 0;
      s0 = (d >>> 2 | d << 30) ^ (d >>> 13 | d << 19) ^ (d >>> 22 | d << 10);
      mj = d & e ^ f & (d ^ e);
      t2 = s0 + mj | 0;
      g = g + t1 | 0;
      c = t1 + t2 | 0;
      s1 = (g >>> 6 | g << 26) ^ (g >>> 11 | g << 21) ^ (g >>> 25 | g << 7);
      ch = a ^ g & (hh ^ a);
      t1 = ((b + s1 | 0) + ch | 0) + (k[14] + W[14] | 0) | 0;
      s0 = (c >>> 2 | c << 30) ^ (c >>> 13 | c << 19) ^ (c >>> 22 | c << 10);
      mj = c & d ^ e & (c ^ d);
      t2 = s0 + mj | 0;
      f = f + t1 | 0;
      b = t1 + t2 | 0;
      s1 = (f >>> 6 | f << 26) ^ (f >>> 11 | f << 21) ^ (f >>> 25 | f << 7);
      ch = hh ^ f & (g ^ hh);
      t1 = ((a + s1 | 0) + ch | 0) + (k[15] + W[15] | 0) | 0;
      s0 = (b >>> 2 | b << 30) ^ (b >>> 13 | b << 19) ^ (b >>> 22 | b << 10);
      mj = b & c ^ d & (b ^ c);
      t2 = s0 + mj | 0;
      e = e + t1 | 0;
      a = t1 + t2 | 0;
      s1 = (e >>> 6 | e << 26) ^ (e >>> 11 | e << 21) ^ (e >>> 25 | e << 7);
      ch = g ^ e & (f ^ g);
      t1 = ((hh + s1 | 0) + ch | 0) + (k[16] + W[16] | 0) | 0;
      s0 = (a >>> 2 | a << 30) ^ (a >>> 13 | a << 19) ^ (a >>> 22 | a << 10);
      mj = a & b ^ c & (a ^ b);
      t2 = s0 + mj | 0;
      d = d + t1 | 0;
      hh = t1 + t2 | 0;
      s1 = (d >>> 6 | d << 26) ^ (d >>> 11 | d << 21) ^ (d >>> 25 | d << 7);
      ch = f ^ d & (e ^ f);
      t1 = ((g + s1 | 0) + ch | 0) + (k[17] + W[17] | 0) | 0;
      s0 = (hh >>> 2 | hh << 30) ^ (hh >>> 13 | hh << 19) ^ (hh >>> 22 | hh << 10);
      mj = hh & a ^ b & (hh ^ a);
      t2 = s0 + mj | 0;
      c = c + t1 | 0;
      g = t1 + t2 | 0;
      s1 = (c >>> 6 | c << 26) ^ (c >>> 11 | c << 21) ^ (c >>> 25 | c << 7);
      ch = e ^ c & (d ^ e);
      t1 = ((f + s1 | 0) + ch | 0) + (k[18] + W[18] | 0) | 0;
      s0 = (g >>> 2 | g << 30) ^ (g >>> 13 | g << 19) ^ (g >>> 22 | g << 10);
      mj = g & hh ^ a & (g ^ hh);
      t2 = s0 + mj | 0;
      b = b + t1 | 0;
      f = t1 + t2 | 0;
      s1 = (b >>> 6 | b << 26) ^ (b >>> 11 | b << 21) ^ (b >>> 25 | b << 7);
      ch = d ^ b & (c ^ d);
      t1 = ((e + s1 | 0) + ch | 0) + (k[19] + W[19] | 0) | 0;
      s0 = (f >>> 2 | f << 30) ^ (f >>> 13 | f << 19) ^ (f >>> 22 | f << 10);
      mj = f & g ^ hh & (f ^ g);
      t2 = s0 + mj | 0;
      a = a + t1 | 0;
      e = t1 + t2 | 0;
      s1 = (a >>> 6 | a << 26) ^ (a >>> 11 | a << 21) ^ (a >>> 25 | a << 7);
      ch = c ^ a & (b ^ c);
      t1 = ((d + s1 | 0) + ch | 0) + (k[20] + W[20] | 0) | 0;
      s0 = (e >>> 2 | e << 30) ^ (e >>> 13 | e << 19) ^ (e >>> 22 | e << 10);
      mj = e & f ^ g & (e ^ f);
      t2 = s0 + mj | 0;
      hh = hh + t1 | 0;
      d = t1 + t2 | 0;
      s1 = (hh >>> 6 | hh << 26) ^ (hh >>> 11 | hh << 21) ^ (hh >>> 25 | hh << 7);
      ch = b ^ hh & (a ^ b);
      t1 = ((c + s1 | 0) + ch | 0) + (k[21] + W[21] | 0) | 0;
      s0 = (d >>> 2 | d << 30) ^ (d >>> 13 | d << 19) ^ (d >>> 22 | d << 10);
      mj = d & e ^ f & (d ^ e);
      t2 = s0 + mj | 0;
      g = g + t1 | 0;
      c = t1 + t2 | 0;
      s1 = (g >>> 6 | g << 26) ^ (g >>> 11 | g << 21) ^ (g >>> 25 | g << 7);
      ch = a ^ g & (hh ^ a);
      t1 = ((b + s1 | 0) + ch | 0) + (k[22] + W[22] | 0) | 0;
      s0 = (c >>> 2 | c << 30) ^ (c >>> 13 | c << 19) ^ (c >>> 22 | c << 10);
      mj = c & d ^ e & (c ^ d);
      t2 = s0 + mj | 0;
      f = f + t1 | 0;
      b = t1 + t2 | 0;
      s1 = (f >>> 6 | f << 26) ^ (f >>> 11 | f << 21) ^ (f >>> 25 | f << 7);
      ch = hh ^ f & (g ^ hh);
      t1 = ((a + s1 | 0) + ch | 0) + (k[23] + W[23] | 0) | 0;
      s0 = (b >>> 2 | b << 30) ^ (b >>> 13 | b << 19) ^ (b >>> 22 | b << 10);
      mj = b & c ^ d & (b ^ c);
      t2 = s0 + mj | 0;
      e = e + t1 | 0;
      a = t1 + t2 | 0;
      s1 = (e >>> 6 | e << 26) ^ (e >>> 11 | e << 21) ^ (e >>> 25 | e << 7);
      ch = g ^ e & (f ^ g);
      t1 = ((hh + s1 | 0) + ch | 0) + (k[24] + W[24] | 0) | 0;
      s0 = (a >>> 2 | a << 30) ^ (a >>> 13 | a << 19) ^ (a >>> 22 | a << 10);
      mj = a & b ^ c & (a ^ b);
      t2 = s0 + mj | 0;
      d = d + t1 | 0;
      hh = t1 + t2 | 0;
      s1 = (d >>> 6 | d << 26) ^ (d >>> 11 | d << 21) ^ (d >>> 25 | d << 7);
      ch = f ^ d & (e ^ f);
      t1 = ((g + s1 | 0) + ch | 0) + (k[25] + W[25] | 0) | 0;
      s0 = (hh >>> 2 | hh << 30) ^ (hh >>> 13 | hh << 19) ^ (hh >>> 22 | hh << 10);
      mj = hh & a ^ b & (hh ^ a);
      t2 = s0 + mj | 0;
      c = c + t1 | 0;
      g = t1 + t2 | 0;
      s1 = (c >>> 6 | c << 26) ^ (c >>> 11 | c << 21) ^ (c >>> 25 | c << 7);
      ch = e ^ c & (d ^ e);
      t1 = ((f + s1 | 0) + ch | 0) + (k[26] + W[26] | 0) | 0;
      s0 = (g >>> 2 | g << 30) ^ (g >>> 13 | g << 19) ^ (g >>> 22 | g << 10);
      mj = g & hh ^ a & (g ^ hh);
      t2 = s0 + mj | 0;
      b = b + t1 | 0;
      f = t1 + t2 | 0;
      s1 = (b >>> 6 | b << 26) ^ (b >>> 11 | b << 21) ^ (b >>> 25 | b << 7);
      ch = d ^ b & (c ^ d);
      t1 = ((e + s1 | 0) + ch | 0) + (k[27] + W[27] | 0) | 0;
      s0 = (f >>> 2 | f << 30) ^ (f >>> 13 | f << 19) ^ (f >>> 22 | f << 10);
      mj = f & g ^ hh & (f ^ g);
      t2 = s0 + mj | 0;
      a = a + t1 | 0;
      e = t1 + t2 | 0;
      s1 = (a >>> 6 | a << 26) ^ (a >>> 11 | a << 21) ^ (a >>> 25 | a << 7);
      ch = c ^ a & (b ^ c);
      t1 = ((d + s1 | 0) + ch | 0) + (k[28] + W[28] | 0) | 0;
      s0 = (e >>> 2 | e << 30) ^ (e >>> 13 | e << 19) ^ (e >>> 22 | e << 10);
      mj = e & f ^ g & (e ^ f);
      t2 = s0 + mj | 0;
      hh = hh + t1 | 0;
      d = t1 + t2 | 0;
      s1 = (hh >>> 6 | hh << 26) ^ (hh >>> 11 | hh << 21) ^ (hh >>> 25 | hh << 7);
      ch = b ^ hh & (a ^ b);
      t1 = ((c + s1 | 0) + ch | 0) + (k[29] + W[29] | 0) | 0;
      s0 = (d >>> 2 | d << 30) ^ (d >>> 13 | d << 19) ^ (d >>> 22 | d << 10);
      mj = d & e ^ f & (d ^ e);
      t2 = s0 + mj | 0;
      g = g + t1 | 0;
      c = t1 + t2 | 0;
      s1 = (g >>> 6 | g << 26) ^ (g >>> 11 | g << 21) ^ (g >>> 25 | g << 7);
      ch = a ^ g & (hh ^ a);
      t1 = ((b + s1 | 0) + ch | 0) + (k[30] + W[30] | 0) | 0;
      s0 = (c >>> 2 | c << 30) ^ (c >>> 13 | c << 19) ^ (c >>> 22 | c << 10);
      mj = c & d ^ e & (c ^ d);
      t2 = s0 + mj | 0;
      f = f + t1 | 0;
      b = t1 + t2 | 0;
      s1 = (f >>> 6 | f << 26) ^ (f >>> 11 | f << 21) ^ (f >>> 25 | f << 7);
      ch = hh ^ f & (g ^ hh);
      t1 = ((a + s1 | 0) + ch | 0) + (k[31] + W[31] | 0) | 0;
      s0 = (b >>> 2 | b << 30) ^ (b >>> 13 | b << 19) ^ (b >>> 22 | b << 10);
      mj = b & c ^ d & (b ^ c);
      t2 = s0 + mj | 0;
      e = e + t1 | 0;
      a = t1 + t2 | 0;
      s1 = (e >>> 6 | e << 26) ^ (e >>> 11 | e << 21) ^ (e >>> 25 | e << 7);
      ch = g ^ e & (f ^ g);
      t1 = ((hh + s1 | 0) + ch | 0) + (k[32] + W[32] | 0) | 0;
      s0 = (a >>> 2 | a << 30) ^ (a >>> 13 | a << 19) ^ (a >>> 22 | a << 10);
      mj = a & b ^ c & (a ^ b);
      t2 = s0 + mj | 0;
      d = d + t1 | 0;
      hh = t1 + t2 | 0;
      s1 = (d >>> 6 | d << 26) ^ (d >>> 11 | d << 21) ^ (d >>> 25 | d << 7);
      ch = f ^ d & (e ^ f);
      t1 = ((g + s1 | 0) + ch | 0) + (k[33] + W[33] | 0) | 0;
      s0 = (hh >>> 2 | hh << 30) ^ (hh >>> 13 | hh << 19) ^ (hh >>> 22 | hh << 10);
      mj = hh & a ^ b & (hh ^ a);
      t2 = s0 + mj | 0;
      c = c + t1 | 0;
      g = t1 + t2 | 0;
      s1 = (c >>> 6 | c << 26) ^ (c >>> 11 | c << 21) ^ (c >>> 25 | c << 7);
      ch = e ^ c & (d ^ e);
      t1 = ((f + s1 | 0) + ch | 0) + (k[34] + W[34] | 0) | 0;
      s0 = (g >>> 2 | g << 30) ^ (g >>> 13 | g << 19) ^ (g >>> 22 | g << 10);
      mj = g & hh ^ a & (g ^ hh);
      t2 = s0 + mj | 0;
      b = b + t1 | 0;
      f = t1 + t2 | 0;
      s1 = (b >>> 6 | b << 26) ^ (b >>> 11 | b << 21) ^ (b >>> 25 | b << 7);
      ch = d ^ b & (c ^ d);
      t1 = ((e + s1 | 0) + ch | 0) + (k[35] + W[35] | 0) | 0;
      s0 = (f >>> 2 | f << 30) ^ (f >>> 13 | f << 19) ^ (f >>> 22 | f << 10);
      mj = f & g ^ hh & (f ^ g);
      t2 = s0 + mj | 0;
      a = a + t1 | 0;
      e = t1 + t2 | 0;
      s1 = (a >>> 6 | a << 26) ^ (a >>> 11 | a << 21) ^ (a >>> 25 | a << 7);
      ch = c ^ a & (b ^ c);
      t1 = ((d + s1 | 0) + ch | 0) + (k[36] + W[36] | 0) | 0;
      s0 = (e >>> 2 | e << 30) ^ (e >>> 13 | e << 19) ^ (e >>> 22 | e << 10);
      mj = e & f ^ g & (e ^ f);
      t2 = s0 + mj | 0;
      hh = hh + t1 | 0;
      d = t1 + t2 | 0;
      s1 = (hh >>> 6 | hh << 26) ^ (hh >>> 11 | hh << 21) ^ (hh >>> 25 | hh << 7);
      ch = b ^ hh & (a ^ b);
      t1 = ((c + s1 | 0) + ch | 0) + (k[37] + W[37] | 0) | 0;
      s0 = (d >>> 2 | d << 30) ^ (d >>> 13 | d << 19) ^ (d >>> 22 | d << 10);
      mj = d & e ^ f & (d ^ e);
      t2 = s0 + mj | 0;
      g = g + t1 | 0;
      c = t1 + t2 | 0;
      s1 = (g >>> 6 | g << 26) ^ (g >>> 11 | g << 21) ^ (g >>> 25 | g << 7);
      ch = a ^ g & (hh ^ a);
      t1 = ((b + s1 | 0) + ch | 0) + (k[38] + W[38] | 0) | 0;
      s0 = (c >>> 2 | c << 30) ^ (c >>> 13 | c << 19) ^ (c >>> 22 | c << 10);
      mj = c & d ^ e & (c ^ d);
      t2 = s0 + mj | 0;
      f = f + t1 | 0;
      b = t1 + t2 | 0;
      s1 = (f >>> 6 | f << 26) ^ (f >>> 11 | f << 21) ^ (f >>> 25 | f << 7);
      ch = hh ^ f & (g ^ hh);
      t1 = ((a + s1 | 0) + ch | 0) + (k[39] + W[39] | 0) | 0;
      s0 = (b >>> 2 | b << 30) ^ (b >>> 13 | b << 19) ^ (b >>> 22 | b << 10);
      mj = b & c ^ d & (b ^ c);
      t2 = s0 + mj | 0;
      e = e + t1 | 0;
      a = t1 + t2 | 0;
      s1 = (e >>> 6 | e << 26) ^ (e >>> 11 | e << 21) ^ (e >>> 25 | e << 7);
      ch = g ^ e & (f ^ g);
      t1 = ((hh + s1 | 0) + ch | 0) + (k[40] + W[40] | 0) | 0;
      s0 = (a >>> 2 | a << 30) ^ (a >>> 13 | a << 19) ^ (a >>> 22 | a << 10);
      mj = a & b ^ c & (a ^ b);
      t2 = s0 + mj | 0;
      d = d + t1 | 0;
      hh = t1 + t2 | 0;
      s1 = (d >>> 6 | d << 26) ^ (d >>> 11 | d << 21) ^ (d >>> 25 | d << 7);
      ch = f ^ d & (e ^ f);
      t1 = ((g + s1 | 0) + ch | 0) + (k[41] + W[41] | 0) | 0;
      s0 = (hh >>> 2 | hh << 30) ^ (hh >>> 13 | hh << 19) ^ (hh >>> 22 | hh << 10);
      mj = hh & a ^ b & (hh ^ a);
      t2 = s0 + mj | 0;
      c = c + t1 | 0;
      g = t1 + t2 | 0;
      s1 = (c >>> 6 | c << 26) ^ (c >>> 11 | c << 21) ^ (c >>> 25 | c << 7);
      ch = e ^ c & (d ^ e);
      t1 = ((f + s1 | 0) + ch | 0) + (k[42] + W[42] | 0) | 0;
      s0 = (g >>> 2 | g << 30) ^ (g >>> 13 | g << 19) ^ (g >>> 22 | g << 10);
      mj = g & hh ^ a & (g ^ hh);
      t2 = s0 + mj | 0;
      b = b + t1 | 0;
      f = t1 + t2 | 0;
      s1 = (b >>> 6 | b << 26) ^ (b >>> 11 | b << 21) ^ (b >>> 25 | b << 7);
      ch = d ^ b & (c ^ d);
      t1 = ((e + s1 | 0) + ch | 0) + (k[43] + W[43] | 0) | 0;
      s0 = (f >>> 2 | f << 30) ^ (f >>> 13 | f << 19) ^ (f >>> 22 | f << 10);
      mj = f & g ^ hh & (f ^ g);
      t2 = s0 + mj | 0;
      a = a + t1 | 0;
      e = t1 + t2 | 0;
      s1 = (a >>> 6 | a << 26) ^ (a >>> 11 | a << 21) ^ (a >>> 25 | a << 7);
      ch = c ^ a & (b ^ c);
      t1 = ((d + s1 | 0) + ch | 0) + (k[44] + W[44] | 0) | 0;
      s0 = (e >>> 2 | e << 30) ^ (e >>> 13 | e << 19) ^ (e >>> 22 | e << 10);
      mj = e & f ^ g & (e ^ f);
      t2 = s0 + mj | 0;
      hh = hh + t1 | 0;
      d = t1 + t2 | 0;
      s1 = (hh >>> 6 | hh << 26) ^ (hh >>> 11 | hh << 21) ^ (hh >>> 25 | hh << 7);
      ch = b ^ hh & (a ^ b);
      t1 = ((c + s1 | 0) + ch | 0) + (k[45] + W[45] | 0) | 0;
      s0 = (d >>> 2 | d << 30) ^ (d >>> 13 | d << 19) ^ (d >>> 22 | d << 10);
      mj = d & e ^ f & (d ^ e);
      t2 = s0 + mj | 0;
      g = g + t1 | 0;
      c = t1 + t2 | 0;
      s1 = (g >>> 6 | g << 26) ^ (g >>> 11 | g << 21) ^ (g >>> 25 | g << 7);
      ch = a ^ g & (hh ^ a);
      t1 = ((b + s1 | 0) + ch | 0) + (k[46] + W[46] | 0) | 0;
      s0 = (c >>> 2 | c << 30) ^ (c >>> 13 | c << 19) ^ (c >>> 22 | c << 10);
      mj = c & d ^ e & (c ^ d);
      t2 = s0 + mj | 0;
      f = f + t1 | 0;
      b = t1 + t2 | 0;
      s1 = (f >>> 6 | f << 26) ^ (f >>> 11 | f << 21) ^ (f >>> 25 | f << 7);
      ch = hh ^ f & (g ^ hh);
      t1 = ((a + s1 | 0) + ch | 0) + (k[47] + W[47] | 0) | 0;
      s0 = (b >>> 2 | b << 30) ^ (b >>> 13 | b << 19) ^ (b >>> 22 | b << 10);
      mj = b & c ^ d & (b ^ c);
      t2 = s0 + mj | 0;
      e = e + t1 | 0;
      a = t1 + t2 | 0;
      s1 = (e >>> 6 | e << 26) ^ (e >>> 11 | e << 21) ^ (e >>> 25 | e << 7);
      ch = g ^ e & (f ^ g);
      t1 = ((hh + s1 | 0) + ch | 0) + (k[48] + W[48] | 0) | 0;
      s0 = (a >>> 2 | a << 30) ^ (a >>> 13 | a << 19) ^ (a >>> 22 | a << 10);
      mj = a & b ^ c & (a ^ b);
      t2 = s0 + mj | 0;
      d = d + t1 | 0;
      hh = t1 + t2 | 0;
      s1 = (d >>> 6 | d << 26) ^ (d >>> 11 | d << 21) ^ (d >>> 25 | d << 7);
      ch = f ^ d & (e ^ f);
      t1 = ((g + s1 | 0) + ch | 0) + (k[49] + W[49] | 0) | 0;
      s0 = (hh >>> 2 | hh << 30) ^ (hh >>> 13 | hh << 19) ^ (hh >>> 22 | hh << 10);
      mj = hh & a ^ b & (hh ^ a);
      t2 = s0 + mj | 0;
      c = c + t1 | 0;
      g = t1 + t2 | 0;
      s1 = (c >>> 6 | c << 26) ^ (c >>> 11 | c << 21) ^ (c >>> 25 | c << 7);
      ch = e ^ c & (d ^ e);
      t1 = ((f + s1 | 0) + ch | 0) + (k[50] + W[50] | 0) | 0;
      s0 = (g >>> 2 | g << 30) ^ (g >>> 13 | g << 19) ^ (g >>> 22 | g << 10);
      mj = g & hh ^ a & (g ^ hh);
      t2 = s0 + mj | 0;
      b = b + t1 | 0;
      f = t1 + t2 | 0;
      s1 = (b >>> 6 | b << 26) ^ (b >>> 11 | b << 21) ^ (b >>> 25 | b << 7);
      ch = d ^ b & (c ^ d);
      t1 = ((e + s1 | 0) + ch | 0) + (k[51] + W[51] | 0) | 0;
      s0 = (f >>> 2 | f << 30) ^ (f >>> 13 | f << 19) ^ (f >>> 22 | f << 10);
      mj = f & g ^ hh & (f ^ g);
      t2 = s0 + mj | 0;
      a = a + t1 | 0;
      e = t1 + t2 | 0;
      s1 = (a >>> 6 | a << 26) ^ (a >>> 11 | a << 21) ^ (a >>> 25 | a << 7);
      ch = c ^ a & (b ^ c);
      t1 = ((d + s1 | 0) + ch | 0) + (k[52] + W[52] | 0) | 0;
      s0 = (e >>> 2 | e << 30) ^ (e >>> 13 | e << 19) ^ (e >>> 22 | e << 10);
      mj = e & f ^ g & (e ^ f);
      t2 = s0 + mj | 0;
      hh = hh + t1 | 0;
      d = t1 + t2 | 0;
      s1 = (hh >>> 6 | hh << 26) ^ (hh >>> 11 | hh << 21) ^ (hh >>> 25 | hh << 7);
      ch = b ^ hh & (a ^ b);
      t1 = ((c + s1 | 0) + ch | 0) + (k[53] + W[53] | 0) | 0;
      s0 = (d >>> 2 | d << 30) ^ (d >>> 13 | d << 19) ^ (d >>> 22 | d << 10);
      mj = d & e ^ f & (d ^ e);
      t2 = s0 + mj | 0;
      g = g + t1 | 0;
      c = t1 + t2 | 0;
      s1 = (g >>> 6 | g << 26) ^ (g >>> 11 | g << 21) ^ (g >>> 25 | g << 7);
      ch = a ^ g & (hh ^ a);
      t1 = ((b + s1 | 0) + ch | 0) + (k[54] + W[54] | 0) | 0;
      s0 = (c >>> 2 | c << 30) ^ (c >>> 13 | c << 19) ^ (c >>> 22 | c << 10);
      mj = c & d ^ e & (c ^ d);
      t2 = s0 + mj | 0;
      f = f + t1 | 0;
      b = t1 + t2 | 0;
      s1 = (f >>> 6 | f << 26) ^ (f >>> 11 | f << 21) ^ (f >>> 25 | f << 7);
      ch = hh ^ f & (g ^ hh);
      t1 = ((a + s1 | 0) + ch | 0) + (k[55] + W[55] | 0) | 0;
      s0 = (b >>> 2 | b << 30) ^ (b >>> 13 | b << 19) ^ (b >>> 22 | b << 10);
      mj = b & c ^ d & (b ^ c);
      t2 = s0 + mj | 0;
      e = e + t1 | 0;
      a = t1 + t2 | 0;
      s1 = (e >>> 6 | e << 26) ^ (e >>> 11 | e << 21) ^ (e >>> 25 | e << 7);
      ch = g ^ e & (f ^ g);
      t1 = ((hh + s1 | 0) + ch | 0) + (k[56] + W[56] | 0) | 0;
      s0 = (a >>> 2 | a << 30) ^ (a >>> 13 | a << 19) ^ (a >>> 22 | a << 10);
      mj = a & b ^ c & (a ^ b);
      t2 = s0 + mj | 0;
      d = d + t1 | 0;
      hh = t1 + t2 | 0;
      s1 = (d >>> 6 | d << 26) ^ (d >>> 11 | d << 21) ^ (d >>> 25 | d << 7);
      ch = f ^ d & (e ^ f);
      t1 = ((g + s1 | 0) + ch | 0) + (k[57] + W[57] | 0) | 0;
      s0 = (hh >>> 2 | hh << 30) ^ (hh >>> 13 | hh << 19) ^ (hh >>> 22 | hh << 10);
      mj = hh & a ^ b & (hh ^ a);
      t2 = s0 + mj | 0;
      c = c + t1 | 0;
      g = t1 + t2 | 0;
      s1 = (c >>> 6 | c << 26) ^ (c >>> 11 | c << 21) ^ (c >>> 25 | c << 7);
      ch = e ^ c & (d ^ e);
      t1 = ((f + s1 | 0) + ch | 0) + (k[58] + W[58] | 0) | 0;
      s0 = (g >>> 2 | g << 30) ^ (g >>> 13 | g << 19) ^ (g >>> 22 | g << 10);
      mj = g & hh ^ a & (g ^ hh);
      t2 = s0 + mj | 0;
      b = b + t1 | 0;
      f = t1 + t2 | 0;
      s1 = (b >>> 6 | b << 26) ^ (b >>> 11 | b << 21) ^ (b >>> 25 | b << 7);
      ch = d ^ b & (c ^ d);
      t1 = ((e + s1 | 0) + ch | 0) + (k[59] + W[59] | 0) | 0;
      s0 = (f >>> 2 | f << 30) ^ (f >>> 13 | f << 19) ^ (f >>> 22 | f << 10);
      mj = f & g ^ hh & (f ^ g);
      t2 = s0 + mj | 0;
      a = a + t1 | 0;
      e = t1 + t2 | 0;
      s1 = (a >>> 6 | a << 26) ^ (a >>> 11 | a << 21) ^ (a >>> 25 | a << 7);
      ch = c ^ a & (b ^ c);
      t1 = ((d + s1 | 0) + ch | 0) + (k[60] + W[60] | 0) | 0;
      s0 = (e >>> 2 | e << 30) ^ (e >>> 13 | e << 19) ^ (e >>> 22 | e << 10);
      mj = e & f ^ g & (e ^ f);
      t2 = s0 + mj | 0;
      hh = hh + t1 | 0;
      d = t1 + t2 | 0;
      s1 = (hh >>> 6 | hh << 26) ^ (hh >>> 11 | hh << 21) ^ (hh >>> 25 | hh << 7);
      ch = b ^ hh & (a ^ b);
      t1 = ((c + s1 | 0) + ch | 0) + (k[61] + W[61] | 0) | 0;
      s0 = (d >>> 2 | d << 30) ^ (d >>> 13 | d << 19) ^ (d >>> 22 | d << 10);
      mj = d & e ^ f & (d ^ e);
      t2 = s0 + mj | 0;
      g = g + t1 | 0;
      c = t1 + t2 | 0;
      s1 = (g >>> 6 | g << 26) ^ (g >>> 11 | g << 21) ^ (g >>> 25 | g << 7);
      ch = a ^ g & (hh ^ a);
      t1 = ((b + s1 | 0) + ch | 0) + (k[62] + W[62] | 0) | 0;
      s0 = (c >>> 2 | c << 30) ^ (c >>> 13 | c << 19) ^ (c >>> 22 | c << 10);
      mj = c & d ^ e & (c ^ d);
      t2 = s0 + mj | 0;
      f = f + t1 | 0;
      b = t1 + t2 | 0;
      s1 = (f >>> 6 | f << 26) ^ (f >>> 11 | f << 21) ^ (f >>> 25 | f << 7);
      ch = hh ^ f & (g ^ hh);
      t1 = ((a + s1 | 0) + ch | 0) + (k[63] + W[63] | 0) | 0;
      s0 = (b >>> 2 | b << 30) ^ (b >>> 13 | b << 19) ^ (b >>> 22 | b << 10);
      mj = b & c ^ d & (b ^ c);
      t2 = s0 + mj | 0;
      e = e + t1 | 0;
      a = t1 + t2 | 0;
      h[0] = h[0] + a | 0;
      h[1] = h[1] + b | 0;
      h[2] = h[2] + c | 0;
      h[3] = h[3] + d | 0;
      h[4] = h[4] + e | 0;
      h[5] = h[5] + f | 0;
      h[6] = h[6] + g | 0;
      h[7] = h[7] + hh | 0;
    }
    function _makeSha(init, outWords) {
      const sha = {};
      sha.fn = function(hash) {
        if (hash) {
          this._h = hash._h.slice(0);
          this._buffer = hash._buffer.slice(0);
          this._length = hash._length;
        } else
          this.reset();
      };
      sha.hash = function(data) {
        return new sha.fn().update(data).finalize();
      };
      sha.fn.prototype = {
        blockSize: 512,
        _init: init,
        _key: _KEY,
        reset() {
          this._h = this._init.slice(0);
          this._buffer = [];
          this._length = 0;
          return this;
        },
        update(data) {
          if (data instanceof Uint8Array && this._buffer.length === 0 && data.length >= 64) {
            const whole = data.length - (data.length & 63);
            if (this._length + whole * 8 > 9007199254740991) {
              console.warn("[crypto] INVALID: sha256: cannot hash more than 2^53 - 1 bits");
              return !1;
            }
            const words = _BW;
            for (let off = 0;off < whole; off += 64) {
              for (let j = 0, o = off;j < 16; j++, o += 4)
                words[j] = data[o] << 24 | data[o + 1] << 16 | data[o + 2] << 8 | data[o + 3];
              _compress(this._h, words);
            }
            this._length += whole * 8;
            if (whole === data.length)
              return this;
            data = data.subarray(whole);
          }
          if (typeof data === "string")
            data = bitArray.ui8_to_ba(utf8.toBytes(data));
          else if (data instanceof Uint8Array)
            data = bitArray.ui8_to_ba(data);
          const b = this._buffer = bitArray.concat(this._buffer, data), ol = this._length, nl = this._length = ol + bitArray.bitLength(data);
          if (nl > 9007199254740991) {
            console.warn("[crypto] INVALID: sha256: cannot hash more than 2^53 - 1 bits");
            return !1;
          }
          const c = new Int32Array(b);
          let j = 0;
          for (let i = 512 + ol - (512 + ol & 511);i <= nl; i += 512) {
            this._block(c.subarray(16 * j, 16 * (j + 1)));
            j += 1;
          }
          b.splice(0, 16 * j);
          return this;
        },
        finalize() {
          let b = this._buffer;
          const h = this._h;
          b = bitArray.concat(b, [bitArray.partial(1, 1)]);
          for (let i = b.length + 2;i & 15; i++)
            b.push(0);
          b.push(Math.floor(this._length / 4294967296));
          b.push(this._length | 0);
          while (b.length)
            this._block(b.splice(0, 16));
          this.reset();
          return outWords < 8 ? h.slice(0, outWords) : h;
        },
        _block(w) {
          _compress(this._h, w);
        }
      };
      return sha;
    }
    const _sha256 = _makeSha(_INIT, 8);
    return Object.defineProperty({
      fn: _sha256.fn,
      hash: _sha256.hash
    }, Symbol.for("@awacloud/fw/internal"), {
      value: { makeSha: _makeSha, compress: _compress }
    });
  } });
    __register({ name: "sha384", dependencies: ["sha512"], factory: function(sha512) {
    const _INIT_384 = [
      3418070365,
      3238371032,
      1654270250,
      914150663,
      2438529370,
      812702999,
      355462360,
      4144912697,
      1731405415,
      4290775857,
      2394180231,
      1750603025,
      3675008525,
      1694076839,
      1203062813,
      3204075428
    ];
    return sha512[Symbol.for("@awacloud/fw/internal")].makeSha(_INIT_384, 12);
  } });
    __register({ name: "sha512", dependencies: ["bitArray","utf8"], factory: function(bitArray, utf8) {
    const _INIT = [
      1779033703,
      4089235720,
      3144134277,
      2227873595,
      1013904242,
      4271175723,
      2773480762,
      1595750129,
      1359893119,
      2917565137,
      2600822924,
      725511199,
      528734635,
      4215389547,
      1541459225,
      327033209
    ], _KEY = [
      1116352408,
      3609767458,
      1899447441,
      602891725,
      3049323471,
      3964484399,
      3921009573,
      2173295548,
      961987163,
      4081628472,
      1508970993,
      3053834265,
      2453635748,
      2937671579,
      2870763221,
      3664609560,
      3624381080,
      2734883394,
      310598401,
      1164996542,
      607225278,
      1323610764,
      1426881987,
      3590304994,
      1925078388,
      4068182383,
      2162078206,
      991336113,
      2614888103,
      633803317,
      3248222580,
      3479774868,
      3835390401,
      2666613458,
      4022224774,
      944711139,
      264347078,
      2341262773,
      604807628,
      2007800933,
      770255983,
      1495990901,
      1249150122,
      1856431235,
      1555081692,
      3175218132,
      1996064986,
      2198950837,
      2554220882,
      3999719339,
      2821834349,
      766784016,
      2952996808,
      2566594879,
      3210313671,
      3203337956,
      3336571891,
      1034457026,
      3584528711,
      2466948901,
      113926993,
      3758326383,
      338241895,
      168717936,
      666307205,
      1188179964,
      773529912,
      1546045734,
      1294757372,
      1522805485,
      1396182291,
      2643833823,
      1695183700,
      2343527390,
      1986661051,
      1014477480,
      2177026350,
      1206759142,
      2456956037,
      344077627,
      2730485921,
      1290863460,
      2820302411,
      3158454273,
      3259730800,
      3505952657,
      3345764771,
      106217008,
      3516065817,
      3606008344,
      3600352804,
      1432725776,
      4094571909,
      1467031594,
      275423344,
      851169720,
      430227734,
      3100823752,
      506948616,
      1363258195,
      659060556,
      3750685593,
      883997877,
      3785050280,
      958139571,
      3318307427,
      1322822218,
      3812723403,
      1537002063,
      2003034995,
      1747873779,
      3602036899,
      1955562222,
      1575990012,
      2024104815,
      1125592928,
      2227730452,
      2716904306,
      2361852424,
      442776044,
      2428436474,
      593698344,
      2756734187,
      3733110249,
      3204031479,
      2999351573,
      3329325298,
      3815920427,
      3391569614,
      3928383900,
      3515267271,
      566280711,
      3940187606,
      3454069534,
      4118630271,
      4000239992,
      116418474,
      1914138554,
      174292421,
      2731055270,
      289380356,
      3203993006,
      460393269,
      320620315,
      685471733,
      587496836,
      852142971,
      1086792851,
      1017036298,
      365543100,
      1126000580,
      2618297676,
      1288033470,
      3409855158,
      1501505948,
      4234509866,
      1607167915,
      987167468,
      1816402316,
      1246189591
    ], _K32 = Int32Array.from(_KEY), _W = new Int32Array(160), _BW = new Int32Array(32);
    function _makeSha(init, outWords) {
      const sha = {};
      sha.fn = function(hash) {
        if (hash) {
          this._h = hash._h.slice(0);
          this._buffer = hash._buffer.slice(0);
          this._length = hash._length;
        } else
          this.reset();
      };
      sha.hash = function(data) {
        return new sha.fn().update(data).finalize();
      };
      sha.fn.prototype = {
        blockSize: 1024,
        _init: init,
        _outWords: outWords,
        _key: _KEY,
        reset() {
          this._h = this._init.slice(0);
          this._buffer = [];
          this._length = 0;
          return this;
        },
        update(data) {
          if (data instanceof Uint8Array && this._buffer.length === 0 && data.length >= 128) {
            const whole = data.length - (data.length & 127);
            if (this._length + whole * 8 > 9007199254740991) {
              console.warn("[crypto] INVALID: sha512: cannot hash more than 2^53 - 1 bits");
              return !1;
            }
            const words = _BW;
            for (let off = 0;off < whole; off += 128) {
              for (let j = 0, o = off;j < 32; j++, o += 4)
                words[j] = data[o] << 24 | data[o + 1] << 16 | data[o + 2] << 8 | data[o + 3];
              this._block(words);
            }
            this._length += whole * 8;
            if (whole === data.length)
              return this;
            data = data.subarray(whole);
          }
          if (typeof data === "string")
            data = bitArray.ui8_to_ba(utf8.toBytes(data));
          else if (data instanceof Uint8Array)
            data = bitArray.ui8_to_ba(data);
          const b = this._buffer = bitArray.concat(this._buffer, data), ol = this._length, nl = this._length = ol + bitArray.bitLength(data);
          if (nl > 9007199254740991) {
            console.warn("[crypto] INVALID: sha512: cannot hash more than 2^53 - 1 bits");
            return !1;
          }
          const c = new Uint32Array(b);
          let j = 0;
          for (let i = 1024 + ol - (1024 + ol & 1023);i <= nl; i += 1024) {
            this._block(c.subarray(32 * j, 32 * (j + 1)));
            j += 1;
          }
          b.splice(0, 32 * j);
          return this;
        },
        finalize() {
          let b = this._buffer;
          const h = this._h;
          b = bitArray.concat(b, [bitArray.partial(1, 1)]);
          for (let i = b.length + 4;i & 31; i++)
            b.push(0);
          b.push(0);
          b.push(0);
          b.push(Math.floor(this._length / 4294967296));
          b.push(this._length | 0);
          while (b.length)
            this._block(b.splice(0, 32));
          this.reset();
          return outWords < 16 ? h.slice(0, outWords) : h;
        },
        _block(words) {
          const h = this._h, k = _K32, w = _W;
          for (let j = 0;j < 32; j++)
            w[j] = words[j] | 0;
          for (let i = 16;i < 80; i++) {
            const xh = w[(i - 15) * 2], xl = w[(i - 15) * 2 + 1], g0h = (xl << 31 | xh >>> 1) ^ (xl << 24 | xh >>> 8) ^ xh >>> 7, g0l = (xh << 31 | xl >>> 1) ^ (xh << 24 | xl >>> 8) ^ (xh << 25 | xl >>> 7), yh = w[(i - 2) * 2], yl = w[(i - 2) * 2 + 1], g1h = (yl << 13 | yh >>> 19) ^ (yh << 3 | yl >>> 29) ^ yh >>> 6, g1l = (yh << 13 | yl >>> 19) ^ (yl << 3 | yh >>> 29) ^ (yh << 26 | yl >>> 6), w7h = w[(i - 7) * 2], w7l = w[(i - 7) * 2 + 1], w16h = w[(i - 16) * 2], w16l = w[(i - 16) * 2 + 1], l1 = g0l + w7l | 0;
            let hi = g0h + w7h + ((g0l & w7l | (g0l | w7l) & ~l1) >>> 31) | 0;
            const l2 = l1 + g1l | 0;
            hi = hi + g1h + ((l1 & g1l | (l1 | g1l) & ~l2) >>> 31) | 0;
            const l3 = l2 + w16l | 0;
            hi = hi + w16h + ((l2 & w16l | (l2 | w16l) & ~l3) >>> 31) | 0;
            w[i * 2] = hi;
            w[i * 2 + 1] = l3;
          }
          let ah = h[0] | 0, al = h[1] | 0, bh = h[2] | 0, bl = h[3] | 0, ch = h[4] | 0, cl = h[5] | 0, dh = h[6] | 0, dl = h[7] | 0, eh = h[8] | 0, el = h[9] | 0, fh = h[10] | 0, fl = h[11] | 0, gh = h[12] | 0, gl = h[13] | 0, hh = h[14] | 0, hl = h[15] | 0;
          for (let i = 0;i < 80; i++) {
            const chh = eh & fh ^ ~eh & gh, chl = el & fl ^ ~el & gl, majh = ah & bh ^ ah & ch ^ bh & ch, majl = al & bl ^ al & cl ^ bl & cl, s0h = (al << 4 | ah >>> 28) ^ (ah << 30 | al >>> 2) ^ (ah << 25 | al >>> 7), s0l = (ah << 4 | al >>> 28) ^ (al << 30 | ah >>> 2) ^ (al << 25 | ah >>> 7), s1h = (el << 18 | eh >>> 14) ^ (el << 14 | eh >>> 18) ^ (eh << 23 | el >>> 9), s1l = (eh << 18 | el >>> 14) ^ (eh << 14 | el >>> 18) ^ (el << 23 | eh >>> 9);
            let tl = hl + s1l | 0, th = hh + s1h + ((hl & s1l | (hl | s1l) & ~tl) >>> 31) | 0, nl = tl + chl | 0;
            th = th + chh + ((tl & chl | (tl | chl) & ~nl) >>> 31) | 0;
            const kl = k[i * 2 + 1];
            tl = nl + kl | 0;
            th = th + k[i * 2] + ((nl & kl | (nl | kl) & ~tl) >>> 31) | 0;
            const wl = w[i * 2 + 1];
            nl = tl + wl | 0;
            th = th + w[i * 2] + ((tl & wl | (tl | wl) & ~nl) >>> 31) | 0;
            const t1l = nl, t1h = th, t2l = s0l + majl | 0, t2h = s0h + majh + ((s0l & majl | (s0l | majl) & ~t2l) >>> 31) | 0;
            hh = gh;
            hl = gl;
            gh = fh;
            gl = fl;
            fh = eh;
            fl = el;
            el = dl + t1l | 0;
            eh = dh + t1h + ((dl & t1l | (dl | t1l) & ~el) >>> 31) | 0;
            dh = ch;
            dl = cl;
            ch = bh;
            cl = bl;
            bh = ah;
            bl = al;
            al = t1l + t2l | 0;
            ah = t1h + t2h + ((t1l & t2l | (t1l | t2l) & ~al) >>> 31) | 0;
          }
          let x = h[1] | 0, y = x + al | 0;
          h[0] = (h[0] | 0) + ah + ((x & al | (x | al) & ~y) >>> 31) | 0;
          h[1] = y;
          x = h[3] | 0;
          y = x + bl | 0;
          h[2] = (h[2] | 0) + bh + ((x & bl | (x | bl) & ~y) >>> 31) | 0;
          h[3] = y;
          x = h[5] | 0;
          y = x + cl | 0;
          h[4] = (h[4] | 0) + ch + ((x & cl | (x | cl) & ~y) >>> 31) | 0;
          h[5] = y;
          x = h[7] | 0;
          y = x + dl | 0;
          h[6] = (h[6] | 0) + dh + ((x & dl | (x | dl) & ~y) >>> 31) | 0;
          h[7] = y;
          x = h[9] | 0;
          y = x + el | 0;
          h[8] = (h[8] | 0) + eh + ((x & el | (x | el) & ~y) >>> 31) | 0;
          h[9] = y;
          x = h[11] | 0;
          y = x + fl | 0;
          h[10] = (h[10] | 0) + fh + ((x & fl | (x | fl) & ~y) >>> 31) | 0;
          h[11] = y;
          x = h[13] | 0;
          y = x + gl | 0;
          h[12] = (h[12] | 0) + gh + ((x & gl | (x | gl) & ~y) >>> 31) | 0;
          h[13] = y;
          x = h[15] | 0;
          y = x + hl | 0;
          h[14] = (h[14] | 0) + hh + ((x & hl | (x | hl) & ~y) >>> 31) | 0;
          h[15] = y;
        }
      };
      return sha;
    }
    const _sha512 = _makeSha(_INIT, 16);
    return Object.defineProperty({
      fn: _sha512.fn,
      hash: _sha512.hash
    }, Symbol.for("@awacloud/fw/internal"), {
      value: { makeSha: _makeSha }
    });
  } });
    __register({ name: "bitArray", dependencies: [], factory: function() {
    const bitArray = {
      ba_to_ui8: function(arr) {
        let out = [], bl = bitArray.bitLength(arr), i, tmp;
        for (i = 0;i < bl / 8; i++) {
          if ((i & 3) === 0)
            tmp = arr[i / 4];
          out.push(tmp >>> 8 >>> 8 >>> 8);
          tmp <<= 8;
        }
        return new Uint8Array(out);
      },
      ui8_to_ba: function(arr) {
        let out = [], i, tmp = 0;
        for (i = 0;i < arr.length; i++) {
          tmp = tmp << 8 | arr[i];
          if ((i & 3) === 3) {
            out.push(tmp);
            tmp = 0;
          }
        }
        if (i & 3)
          out.push(bitArray.partial(8 * (i & 3), tmp));
        return out;
      },
      bitSlice: function(a, bstart, bend) {
        a = _shiftRight(a.slice(bstart / 32), 32 - (bstart & 31)).slice(1);
        return bend === void 0 ? a : bitArray.clamp(a, bend - bstart);
      },
      extract: function(a, bstart, blength) {
        let x, sh = (-bstart - blength & 31) >> 0;
        if ((bstart + blength - 1 ^ bstart) & -32)
          x = a[bstart / 32 | 0] << 32 - sh ^ a[bstart / 32 + 1 | 0] >>> sh;
        else
          x = a[bstart / 32 | 0] >>> sh;
        return x & (1 << blength) - 1;
      },
      concat: function(a1, a2) {
        if (a1.length === 0 || a2.length === 0)
          return a1.concat(a2);
        let last = a1[a1.length - 1], shift = bitArray.getPartial(last);
        if (shift === 32)
          return a1.concat(a2);
        else
          return _shiftRight(a2, shift, last | 0, a1.slice(0, a1.length - 1));
      },
      bitLength: function(a) {
        let l = a.length, x;
        if (l === 0)
          return 0;
        x = a[l - 1];
        return (l - 1) * 32 + bitArray.getPartial(x);
      },
      clamp: function(a, len) {
        if (a.length * 32 < len)
          return a;
        a = a.slice(0, Math.ceil(len / 32));
        let l = a.length;
        len = len & 31;
        if (l > 0 && len)
          a[l - 1] = bitArray.partial(len, a[l - 1] & 2147483648 >> len - 1, 1);
        return a;
      },
      partial: function(len, x, _end) {
        if (len === 32)
          return x;
        return (_end ? x | 0 : x << 32 - len) + len * 1099511627776;
      },
      getPartial: function(x) {
        return Math.round(x / 1099511627776) || 32;
      },
      equal: function(a, b) {
        if (bitArray.bitLength(a) !== bitArray.bitLength(b))
          return !1;
        let x = 0, i;
        for (i = 0;i < a.length; i++)
          x |= a[i] ^ b[i];
        return x === 0;
      },
      byteswapM: function(a) {
        if (a.length > 0 && bitArray.getPartial(a[a.length - 1]) !== 32) {
          console.warn("[crypto] INVALID: bitArray.byteswapM: partial words not supported");
          return !1;
        }
        let i, v, m = 65280;
        for (i = 0;i < a.length; ++i) {
          v = a[i];
          a[i] = v >>> 24 | v >>> 8 & m | (v & m) << 8 | v << 24;
        }
        return a;
      }
    };
    function _shiftRight(a, shift, carry, out) {
      let i, last2, shift2;
      if (out === void 0)
        out = [];
      for (;shift >= 32; shift -= 32) {
        out.push(carry);
        carry = 0;
      }
      if (shift === 0)
        return out.concat(a);
      for (i = 0;i < a.length; i++) {
        out.push(carry | a[i] >>> shift);
        carry = a[i] << 32 - shift;
      }
      last2 = a.length ? a[a.length - 1] : 0;
      shift2 = bitArray.getPartial(last2);
      out.push(bitArray.partial(shift + shift2 & 31, shift + shift2 > 32 ? carry : out.pop(), 1));
      return out;
    }
    return bitArray;
  } });
    __register({ name: "asn1", dependencies: [], factory: function() {
    const TAG = {
      INTEGER: 2,
      BIT_STRING: 3,
      OCTET_STRING: 4,
      NULL: 5,
      OID: 6,
      SEQUENCE: 48,
      SET: 49
    };
    function _encLen(n) {
      if (n < 128)
        return Uint8Array.of(n);
      if (n <= 255)
        return Uint8Array.of(129, n);
      if (n <= 65535)
        return Uint8Array.of(130, n >>> 8 & 255, n & 255);
      if (n <= 16777215)
        return Uint8Array.of(131, n >>> 16 & 255, n >>> 8 & 255, n & 255);
      if (n <= 4294967295)
        return Uint8Array.of(132, n >>> 24 & 255, n >>> 16 & 255, n >>> 8 & 255, n & 255);
      console.warn("[crypto] INVALID: asn1: length exceeds 2^32-1");
      return !1;
    }
    function _decLen(buf, off) {
      const first = buf[off];
      if (first < 128)
        return { len: first, next: off + 1 };
      const n = first & 127;
      if (n === 0 || n > 4) {
        console.warn("[crypto] INVALID: asn1: unsupported length form");
        return !1;
      }
      let len = 0;
      for (let i = 0;i < n; i++)
        len = len << 8 | buf[off + 1 + i];
      if (len < 128 || n > 1 && len >>> (n - 1) * 8 === 0) {
        console.warn("[crypto] INVALID: asn1: non-minimal length encoding");
        return !1;
      }
      return { len: len >>> 0, next: off + 1 + n };
    }
    function _wrap(tag, body) {
      const lenBytes = _encLen(body.length);
      if (lenBytes === !1)
        return !1;
      const out = new Uint8Array(1 + lenBytes.length + body.length);
      out[0] = tag;
      out.set(lenBytes, 1);
      out.set(body, 1 + lenBytes.length);
      return out;
    }
    function _concat(parts) {
      let total = 0;
      for (const p of parts)
        total += p.length;
      const out = new Uint8Array(total);
      let off = 0;
      for (const p of parts) {
        out.set(p, off);
        off += p.length;
      }
      return out;
    }
    function encodeInteger(value) {
      let bytes;
      if (typeof value === "number") {
        if (!Number.isInteger(value) || value < 0) {
          console.warn("[crypto] INVALID: asn1: encodeInteger expects a non-negative integer");
          return !1;
        }
        if (value === 0)
          bytes = Uint8Array.of(0);
        else {
          const arr = [];
          let v = value;
          while (v > 0) {
            arr.unshift(v & 255);
            v = Math.floor(v / 256);
          }
          bytes = new Uint8Array(arr);
        }
      } else {
        bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
        let i = 0;
        while (i < bytes.length - 1 && bytes[i] === 0 && (bytes[i + 1] & 128) === 0)
          i++;
        bytes = bytes.subarray(i);
      }
      if (bytes[0] & 128) {
        const padded = new Uint8Array(bytes.length + 1);
        padded.set(bytes, 1);
        bytes = padded;
      }
      return _wrap(TAG.INTEGER, bytes);
    }
    function encodeOctetString(bytes) {
      const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
      return _wrap(TAG.OCTET_STRING, u8);
    }
    function encodeBitString(bytes, unusedBits) {
      const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
      unusedBits = unusedBits | 0;
      if (unusedBits < 0 || unusedBits > 7) {
        console.warn("[crypto] INVALID: asn1: BIT STRING unusedBits must be 0..7");
        return !1;
      }
      const body = new Uint8Array(u8.length + 1);
      body[0] = unusedBits;
      body.set(u8, 1);
      return _wrap(TAG.BIT_STRING, body);
    }
    function encodeNull() {
      return Uint8Array.of(TAG.NULL, 0);
    }
    function encodeOid(dotted) {
      const parts = dotted.split(".").map(Number);
      if (parts.length < 2 || parts.some((p) => !Number.isInteger(p) || p < 0)) {
        console.warn("[crypto] INVALID: asn1: malformed OID");
        return !1;
      }
      const out = [40 * parts[0] + parts[1]];
      for (let i = 2;i < parts.length; i++) {
        let v = parts[i];
        const stack = [v & 127];
        v >>>= 7;
        while (v > 0) {
          stack.unshift(v & 127 | 128);
          v >>>= 7;
        }
        for (const b of stack)
          out.push(b);
      }
      return _wrap(TAG.OID, new Uint8Array(out));
    }
    function encodeSequence(items) {
      return _wrap(TAG.SEQUENCE, _concat(items));
    }
    function encodeSet(items) {
      return _wrap(TAG.SET, _concat(items));
    }
    function encodeExplicit(n, body) {
      return _wrap(160 | n & 31, body);
    }
    function encodeImplicit(n, tlv, constructed) {
      const out = new Uint8Array(tlv.length);
      out.set(tlv);
      out[0] = (constructed ? 160 : 128) | n & 31;
      return out;
    }
    function parseOne(buf, off) {
      off = off | 0;
      if (off >= buf.length) {
        console.warn("[crypto] INVALID: asn1: unexpected end of input");
        return !1;
      }
      const tag = buf[off];
      if ((tag & 31) === 31) {
        console.warn("[crypto] INVALID: asn1: high-tag-number form not supported");
        return !1;
      }
      const lenInfo = _decLen(buf, off + 1);
      if (!lenInfo)
        return !1;
      const start = lenInfo.next, end = start + lenInfo.len;
      if (end > buf.length) {
        console.warn("[crypto] INVALID: asn1: declared length exceeds buffer");
        return !1;
      }
      return {
        tag,
        length: lenInfo.len,
        value: buf.subarray(start, end),
        valueOff: start,
        next: end
      };
    }
    function parseChildren(value) {
      const out = [];
      let off = 0;
      while (off < value.length) {
        const node = parseOne(value, off);
        if (!node)
          return !1;
        out.push(node);
        off = node.next;
      }
      return out;
    }
    function readInteger(node) {
      if (node.tag !== TAG.INTEGER)
        return !1;
      return node.value;
    }
    function readOid(node) {
      if (node.tag !== TAG.OID)
        return !1;
      const v = node.value;
      if (v.length === 0)
        return !1;
      const parts = [Math.floor(v[0] / 40), v[0] % 40];
      let acc = 0;
      for (let i = 1;i < v.length; i++) {
        acc = acc << 7 | v[i] & 127;
        if ((v[i] & 128) === 0) {
          parts.push(acc);
          acc = 0;
        }
      }
      return parts.join(".");
    }
    function readBitString(node) {
      if (node.tag !== TAG.BIT_STRING || node.value.length < 1)
        return !1;
      return { unusedBits: node.value[0], bytes: node.value.subarray(1) };
    }
    return {
      TAG,
      encodeInteger,
      encodeOctetString,
      encodeBitString,
      encodeNull,
      encodeOid,
      encodeSequence,
      encodeSet,
      encodeExplicit,
      encodeImplicit,
      parseOne,
      parseChildren,
      readInteger,
      readOid,
      readBitString
    };
  } });
    __register({ name: "asn1Oid", dependencies: [], factory: function() {
    const OID_DATABASE = {
      "1.2.840.113549.1.1.1": { name: "rsaEncryption", shortName: "rsa", category: "pkcs1" },
      "1.2.840.113549.1.1.2": { name: "md2WithRSAEncryption", shortName: "md2WithRSA", category: "pkcs1", hashAlg: "md2", sigAlg: "rsa" },
      "1.2.840.113549.1.1.4": { name: "md5WithRSAEncryption", shortName: "md5WithRSA", category: "pkcs1", hashAlg: "md5", sigAlg: "rsa" },
      "1.2.840.113549.1.1.5": { name: "sha1WithRSAEncryption", shortName: "sha1WithRSA", category: "pkcs1", hashAlg: "sha-1", sigAlg: "rsa" },
      "1.2.840.113549.1.1.11": { name: "sha256WithRSAEncryption", shortName: "sha256WithRSA", category: "pkcs1", hashAlg: "sha-256", sigAlg: "rsa" },
      "1.2.840.113549.1.1.12": { name: "sha384WithRSAEncryption", shortName: "sha384WithRSA", category: "pkcs1", hashAlg: "sha-384", sigAlg: "rsa" },
      "1.2.840.113549.1.1.13": { name: "sha512WithRSAEncryption", shortName: "sha512WithRSA", category: "pkcs1", hashAlg: "sha-512", sigAlg: "rsa" },
      "1.2.840.113549.1.1.14": { name: "sha224WithRSAEncryption", shortName: "sha224WithRSA", category: "pkcs1", hashAlg: "sha-224", sigAlg: "rsa" },
      "1.2.840.113549.1.1.10": { name: "rsaPSS", shortName: "rsaPSS", category: "pkcs1", sigAlg: "rsa-pss" },
      "1.2.840.113549.1.1.7": { name: "rsaOAEP", shortName: "rsaOAEP", category: "pkcs1", encAlg: "rsa-oaep" },
      "1.2.840.113549.1.7.1": { name: "pkcs7-data", shortName: "data", category: "pkcs7" },
      "1.2.840.113549.1.7.2": { name: "pkcs7-signedData", shortName: "signedData", category: "pkcs7" },
      "1.2.840.113549.1.7.3": { name: "pkcs7-envelopedData", shortName: "envelopedData", category: "pkcs7" },
      "1.2.840.113549.1.7.4": { name: "pkcs7-signedAndEnvelopedData", shortName: "signedAndEnveloped", category: "pkcs7" },
      "1.2.840.113549.1.7.5": { name: "pkcs7-digestedData", shortName: "digestedData", category: "pkcs7" },
      "1.2.840.113549.1.7.6": { name: "pkcs7-encryptedData", shortName: "encryptedData", category: "pkcs7" },
      "1.2.840.113549.1.9.16.1.2": { name: "id-smime-ct-authenticatedData", shortName: "authenticatedData", category: "pkcs7" },
      "1.2.840.113549.1.9.1": { name: "pkcs9-emailAddress", shortName: "emailAddress", category: "pkcs9" },
      "1.2.840.113549.1.9.2": { name: "pkcs9-unstructuredName", shortName: "unstructuredName", category: "pkcs9" },
      "1.2.840.113549.1.9.3": { name: "pkcs9-contentType", shortName: "contentType", category: "pkcs9" },
      "1.2.840.113549.1.9.4": { name: "pkcs9-messageDigest", shortName: "messageDigest", category: "pkcs9" },
      "1.2.840.113549.1.9.5": { name: "pkcs9-signingTime", shortName: "signingTime", category: "pkcs9" },
      "1.2.840.113549.1.9.6": { name: "pkcs9-counterSignature", shortName: "counterSignature", category: "pkcs9" },
      "1.2.840.113549.1.9.7": { name: "pkcs9-challengePassword", shortName: "challengePassword", category: "pkcs9" },
      "1.2.840.113549.1.9.14": { name: "pkcs9-extensionRequest", shortName: "extensionRequest", category: "pkcs9" },
      "1.2.840.113549.1.9.15": { name: "pkcs9-sMIMECapabilities", shortName: "sMIMECapabilities", category: "pkcs9" },
      "1.2.840.113549.1.9.16.2.12": { name: "id-aa-signingCertificate", shortName: "signingCertificate", category: "pkcs9" },
      "1.2.840.113549.1.9.16.2.14": { name: "id-aa-timeStampToken", shortName: "timeStampToken", category: "pkcs9" },
      "1.2.840.113549.1.9.16.2.47": { name: "id-aa-signingCertificateV2", shortName: "signingCertificateV2", category: "pkcs9" },
      "1.2.840.113549.2.5": { name: "md5", shortName: "md5", category: "digest" },
      "1.3.14.3.2.26": { name: "sha1", shortName: "sha1", category: "digest" },
      "2.16.840.1.101.3.4.2.4": { name: "sha224", shortName: "sha224", category: "digest" },
      "2.16.840.1.101.3.4.2.1": { name: "sha256", shortName: "sha256", category: "digest" },
      "2.16.840.1.101.3.4.2.2": { name: "sha384", shortName: "sha384", category: "digest" },
      "2.16.840.1.101.3.4.2.3": { name: "sha512", shortName: "sha512", category: "digest" },
      "2.16.840.1.101.3.4.2.5": { name: "sha512-224", shortName: "sha512-224", category: "digest" },
      "2.16.840.1.101.3.4.2.6": { name: "sha512-256", shortName: "sha512-256", category: "digest" },
      "2.16.840.1.101.3.4.2.7": { name: "sha3-224", shortName: "sha3-224", category: "digest" },
      "2.16.840.1.101.3.4.2.8": { name: "sha3-256", shortName: "sha3-256", category: "digest" },
      "2.16.840.1.101.3.4.2.9": { name: "sha3-384", shortName: "sha3-384", category: "digest" },
      "2.16.840.1.101.3.4.2.10": { name: "sha3-512", shortName: "sha3-512", category: "digest" },
      "2.16.840.1.101.3.4.2.11": { name: "shake128", shortName: "shake128", category: "digest" },
      "2.16.840.1.101.3.4.2.12": { name: "shake256", shortName: "shake256", category: "digest" },
      "1.2.840.113549.2.7": { name: "hmacWithSHA1", shortName: "hmac-sha1", category: "digest" },
      "1.2.840.113549.2.8": { name: "hmacWithSHA224", shortName: "hmac-sha224", category: "digest" },
      "1.2.840.113549.2.9": { name: "hmacWithSHA256", shortName: "hmac-sha256", category: "digest" },
      "1.2.840.113549.2.10": { name: "hmacWithSHA384", shortName: "hmac-sha384", category: "digest" },
      "1.2.840.113549.2.11": { name: "hmacWithSHA512", shortName: "hmac-sha512", category: "digest" },
      "2.5.4.3": { name: "commonName", shortName: "CN", category: "x509-dn" },
      "2.5.4.4": { name: "surname", shortName: "SN", category: "x509-dn" },
      "2.5.4.5": { name: "serialNumber", shortName: "serialNumber", category: "x509-dn" },
      "2.5.4.6": { name: "countryName", shortName: "C", category: "x509-dn" },
      "2.5.4.7": { name: "localityName", shortName: "L", category: "x509-dn" },
      "2.5.4.8": { name: "stateOrProvinceName", shortName: "ST", category: "x509-dn" },
      "2.5.4.9": { name: "streetAddress", shortName: "street", category: "x509-dn" },
      "2.5.4.10": { name: "organizationName", shortName: "O", category: "x509-dn" },
      "2.5.4.11": { name: "organizationalUnitName", shortName: "OU", category: "x509-dn" },
      "2.5.4.12": { name: "title", shortName: "title", category: "x509-dn" },
      "2.5.4.13": { name: "description", shortName: "description", category: "x509-dn" },
      "2.5.4.17": { name: "postalCode", shortName: "postalCode", category: "x509-dn" },
      "2.5.4.18": { name: "postOfficeBox", shortName: "postOfficeBox", category: "x509-dn" },
      "2.5.4.20": { name: "telephoneNumber", shortName: "telephoneNumber", category: "x509-dn" },
      "2.5.4.41": { name: "name", shortName: "name", category: "x509-dn" },
      "2.5.4.42": { name: "givenName", shortName: "GN", category: "x509-dn" },
      "2.5.4.43": { name: "initials", shortName: "initials", category: "x509-dn" },
      "2.5.4.44": { name: "generationQualifier", shortName: "generationQualifier", category: "x509-dn" },
      "2.5.4.45": { name: "uniqueIdentifier", shortName: "uniqueIdentifier", category: "x509-dn" },
      "2.5.4.46": { name: "dnQualifier", shortName: "dnQualifier", category: "x509-dn" },
      "2.5.4.65": { name: "pseudonym", shortName: "pseudonym", category: "x509-dn" },
      "2.5.29.14": { name: "subjectKeyIdentifier", shortName: "subjectKeyIdentifier", category: "x509-extension" },
      "2.5.29.15": { name: "keyUsage", shortName: "keyUsage", category: "x509-extension" },
      "2.5.29.16": { name: "privateKeyUsagePeriod", shortName: "privateKeyUsagePeriod", category: "x509-extension" },
      "2.5.29.17": { name: "subjectAltName", shortName: "subjectAltName", category: "x509-extension" },
      "2.5.29.18": { name: "issuerAltName", shortName: "issuerAltName", category: "x509-extension" },
      "2.5.29.19": { name: "basicConstraints", shortName: "basicConstraints", category: "x509-extension" },
      "2.5.29.20": { name: "cRLNumber", shortName: "cRLNumber", category: "x509-extension" },
      "2.5.29.21": { name: "reasonCode", shortName: "reasonCode", category: "x509-extension" },
      "2.5.29.23": { name: "holdInstructionCode", shortName: "holdInstructionCode", category: "x509-extension" },
      "2.5.29.24": { name: "invalidityDate", shortName: "invalidityDate", category: "x509-extension" },
      "2.5.29.27": { name: "deltaCRLIndicator", shortName: "deltaCRLIndicator", category: "x509-extension" },
      "2.5.29.28": { name: "issuingDistributionPoint", shortName: "issuingDistributionPoint", category: "x509-extension" },
      "2.5.29.31": { name: "crlDistributionPoints", shortName: "cRLDistributionPoints", category: "x509-extension" },
      "2.5.29.32": { name: "certificatePolicies", shortName: "certificatePolicies", category: "x509-extension" },
      "2.5.29.33": { name: "policyMappings", shortName: "policyMappings", category: "x509-extension" },
      "2.5.29.35": { name: "authorityKeyIdentifier", shortName: "authorityKeyIdentifier", category: "x509-extension" },
      "2.5.29.36": { name: "policyConstraints", shortName: "policyConstraints", category: "x509-extension" },
      "2.5.29.37": { name: "extendedKeyUsage", shortName: "extendedKeyUsage", category: "x509-extension" },
      "1.3.6.1.5.5.7.1.1": { name: "authorityInformationAccess", shortName: "authorityInformationAccess", category: "x509-extension" },
      "1.3.6.1.5.5.7.1.11": { name: "subjectInformationAccess", shortName: "subjectInformationAccess", category: "x509-extension" },
      "2.5.29.54": { name: "inhibitAnyPolicy", shortName: "inhibitAnyPolicy", category: "x509-extension" },
      "1.3.6.1.5.5.7.3.1": { name: "serverAuth", shortName: "serverAuth", category: "x509-eku" },
      "1.3.6.1.5.5.7.3.2": { name: "clientAuth", shortName: "clientAuth", category: "x509-eku" },
      "1.3.6.1.5.5.7.3.3": { name: "codeSigning", shortName: "codeSigning", category: "x509-eku" },
      "1.3.6.1.5.5.7.3.4": { name: "emailProtection", shortName: "emailProtection", category: "x509-eku" },
      "1.3.6.1.5.5.7.3.8": { name: "timeStamping", shortName: "timeStamping", category: "x509-eku" },
      "1.3.6.1.5.5.7.3.9": { name: "OCSPSigning", shortName: "OCSPSigning", category: "x509-eku" },
      "0.4.0.19122.1": { name: "id-etsi-es-ades-commitment-type-signed-data", shortName: "padesSignedData", category: "pades" },
      "0.4.0.2023.1.1": { name: "id-etsi-ades-pades", shortName: "pades", category: "pades" },
      "0.4.0.19122.2.1": { name: "id-etsi-ades-pades-b", shortName: "pades-b", category: "pades" },
      "0.4.0.19122.2.2": { name: "id-etsi-ades-pades-t", shortName: "pades-t", category: "pades" },
      "0.4.0.19122.2.3": { name: "id-etsi-ades-pades-lt", shortName: "pades-lt", category: "pades" },
      "0.4.0.19122.2.4": { name: "id-etsi-ades-pades-lta", shortName: "pades-lta", category: "pades" },
      "1.2.840.113583.1.1.8": { name: "adbe-revocationInfoArchival", shortName: "revocationInfoArchival", category: "pades" },
      "0.4.0.17090.1.1": { name: "id-etsi-qcs-QcCompliance", shortName: "QcCompliance", category: "pades" },
      "0.4.0.17090.1.2": { name: "id-etsi-qcs-QcLimitValue", shortName: "QcLimitValue", category: "pades" },
      "0.4.0.17090.1.3": { name: "id-etsi-qcs-QcRetentionPeriod", shortName: "QcRetentionPeriod", category: "pades" },
      "0.4.0.17090.1.4": { name: "id-etsi-qcs-QcSSCD", shortName: "QcSSCD", category: "pades" },
      "0.4.0.17090.1.5": { name: "id-etsi-qcs-QcPDS", shortName: "QcPDS", category: "pades" },
      "0.4.0.17090.1.6": { name: "id-etsi-qcs-QcType", shortName: "QcType", category: "pades" },
      "1.2.840.113549.1.9.16.2.15": { name: "id-aa-ets-sigPolicyId", shortName: "sigPolicyId", category: "pades" },
      "1.2.840.113549.1.9.16.2.16": { name: "id-aa-ets-commitmentType", shortName: "commitmentType", category: "pades" },
      "1.2.840.113549.1.9.16.2.18": { name: "id-aa-ets-signerAttr", shortName: "signerAttr", category: "pades" },
      "1.2.840.113549.1.9.16.2.20": { name: "id-aa-ets-otherSigCert", shortName: "otherSigCert", category: "pades" },
      "1.2.840.113549.1.9.16.2.21": { name: "id-aa-ets-contentTimestamp", shortName: "contentTimestamp", category: "pades" },
      "1.2.840.10045.3.1.1": { name: "prime192v1", shortName: "P-192", category: "ecc-curve", curve: "P-192" },
      "1.2.840.10045.3.1.7": { name: "prime256v1", shortName: "P-256", category: "ecc-curve", curve: "P-256" },
      "1.3.132.0.34": { name: "secp384r1", shortName: "P-384", category: "ecc-curve", curve: "P-384" },
      "1.3.132.0.35": { name: "secp521r1", shortName: "P-521", category: "ecc-curve", curve: "P-521" },
      "1.3.132.0.10": { name: "secp256k1", shortName: "secp256k1", category: "ecc-curve", curve: "secp256k1" },
      "1.3.132.0.1": { name: "sect163k1", shortName: "sect163k1", category: "ecc-curve", curve: "sect163k1" },
      "1.3.36.3.3.2.8.1.1.7": { name: "brainpoolP256r1", shortName: "brainpoolP256r1", category: "ecc-curve", curve: "brainpoolP256r1" },
      "1.3.36.3.3.2.8.1.1.11": { name: "brainpoolP384r1", shortName: "brainpoolP384r1", category: "ecc-curve", curve: "brainpoolP384r1" },
      "1.3.36.3.3.2.8.1.1.13": { name: "brainpoolP512r1", shortName: "brainpoolP512r1", category: "ecc-curve", curve: "brainpoolP512r1" },
      "1.3.101.110": { name: "X25519", shortName: "X25519", category: "ecc-curve", curve: "X25519" },
      "1.3.101.111": { name: "X448", shortName: "X448", category: "ecc-curve", curve: "X448" },
      "1.3.101.112": { name: "Ed25519", shortName: "Ed25519", category: "ecc-curve", curve: "Ed25519" },
      "1.3.101.113": { name: "Ed448", shortName: "Ed448", category: "ecc-curve", curve: "Ed448" },
      "1.2.840.10045.2.1": { name: "ecPublicKey", shortName: "ecc", category: "pkcs1" },
      "1.2.840.10045.4.1": { name: "ecdsaWithSHA1", shortName: "ecdsaWithSHA1", category: "pkcs1", hashAlg: "sha-1", sigAlg: "ecdsa" },
      "1.2.840.10045.4.3.1": { name: "ecdsaWithSHA224", shortName: "ecdsaWithSHA224", category: "pkcs1", hashAlg: "sha-224", sigAlg: "ecdsa" },
      "1.2.840.10045.4.3.2": { name: "ecdsaWithSHA256", shortName: "ecdsaWithSHA256", category: "pkcs1", hashAlg: "sha-256", sigAlg: "ecdsa" },
      "1.2.840.10045.4.3.3": { name: "ecdsaWithSHA384", shortName: "ecdsaWithSHA384", category: "pkcs1", hashAlg: "sha-384", sigAlg: "ecdsa" },
      "1.2.840.10045.4.3.4": { name: "ecdsaWithSHA512", shortName: "ecdsaWithSHA512", category: "pkcs1", hashAlg: "sha-512", sigAlg: "ecdsa" },
      "1.2.840.113549.1.5.1": { name: "pbeWithMD2AndDES-CBC", shortName: "pbeWithMD2AndDES", category: "pkcs5" },
      "1.2.840.113549.1.5.3": { name: "pbeWithMD5AndDES-CBC", shortName: "pbeWithMD5AndDES", category: "pkcs5" },
      "1.2.840.113549.1.5.4": { name: "pbeWithMD2And40BitRC2-CBC", shortName: "pbeWithMD2AndRC2", category: "pkcs5" },
      "1.2.840.113549.1.5.6": { name: "pbeWithMD5And40BitRC2-CBC", shortName: "pbeWithMD5AndRC2", category: "pkcs5" },
      "1.2.840.113549.1.5.10": { name: "pbeWithSHA1AndDES-CBC", shortName: "pbeWithSHA1AndDES", category: "pkcs5" },
      "1.2.840.113549.1.5.11": { name: "pbeWithSHA1And40BitRC2-CBC", shortName: "pbeWithSHA1AndRC2", category: "pkcs5" },
      "1.2.840.113549.1.5.12": { name: "pbkdf2", shortName: "pbkdf2", category: "pkcs5" },
      "1.2.840.113549.1.5.13": { name: "pbes2", shortName: "pbes2", category: "pkcs5" },
      "1.2.840.113549.1.5.14": { name: "pbmac1", shortName: "pbmac1", category: "pkcs5" },
      "2.16.840.1.101.3.4.1.1": { name: "aes128-ECB", shortName: "aes128-ecb", category: "aes", keyLen: 128, mode: "ecb" },
      "2.16.840.1.101.3.4.1.2": { name: "aes128-CBC", shortName: "aes128-cbc", category: "aes", keyLen: 128, mode: "cbc" },
      "2.16.840.1.101.3.4.1.3": { name: "aes128-OFB", shortName: "aes128-ofb", category: "aes", keyLen: 128, mode: "ofb" },
      "2.16.840.1.101.3.4.1.4": { name: "aes128-CFB", shortName: "aes128-cfb", category: "aes", keyLen: 128, mode: "cfb" },
      "2.16.840.1.101.3.4.1.5": { name: "aes128-wrap", shortName: "aes128-kw", category: "aes", keyLen: 128, mode: "kw" },
      "2.16.840.1.101.3.4.1.6": { name: "aes128-GCM", shortName: "aes128-gcm", category: "aes", keyLen: 128, mode: "gcm" },
      "2.16.840.1.101.3.4.1.7": { name: "aes128-CCM", shortName: "aes128-ccm", category: "aes", keyLen: 128, mode: "ccm" },
      "2.16.840.1.101.3.4.1.21": { name: "aes192-ECB", shortName: "aes192-ecb", category: "aes", keyLen: 192, mode: "ecb" },
      "2.16.840.1.101.3.4.1.22": { name: "aes192-CBC", shortName: "aes192-cbc", category: "aes", keyLen: 192, mode: "cbc" },
      "2.16.840.1.101.3.4.1.23": { name: "aes192-OFB", shortName: "aes192-ofb", category: "aes", keyLen: 192, mode: "ofb" },
      "2.16.840.1.101.3.4.1.24": { name: "aes192-CFB", shortName: "aes192-cfb", category: "aes", keyLen: 192, mode: "cfb" },
      "2.16.840.1.101.3.4.1.25": { name: "aes192-wrap", shortName: "aes192-kw", category: "aes", keyLen: 192, mode: "kw" },
      "2.16.840.1.101.3.4.1.26": { name: "aes192-GCM", shortName: "aes192-gcm", category: "aes", keyLen: 192, mode: "gcm" },
      "2.16.840.1.101.3.4.1.27": { name: "aes192-CCM", shortName: "aes192-ccm", category: "aes", keyLen: 192, mode: "ccm" },
      "2.16.840.1.101.3.4.1.41": { name: "aes256-ECB", shortName: "aes256-ecb", category: "aes", keyLen: 256, mode: "ecb" },
      "2.16.840.1.101.3.4.1.42": { name: "aes256-CBC", shortName: "aes256-cbc", category: "aes", keyLen: 256, mode: "cbc" },
      "2.16.840.1.101.3.4.1.43": { name: "aes256-OFB", shortName: "aes256-ofb", category: "aes", keyLen: 256, mode: "ofb" },
      "2.16.840.1.101.3.4.1.44": { name: "aes256-CFB", shortName: "aes256-cfb", category: "aes", keyLen: 256, mode: "cfb" },
      "2.16.840.1.101.3.4.1.45": { name: "aes256-wrap", shortName: "aes256-kw", category: "aes", keyLen: 256, mode: "kw" },
      "2.16.840.1.101.3.4.1.46": { name: "aes256-GCM", shortName: "aes256-gcm", category: "aes", keyLen: 256, mode: "gcm" },
      "2.16.840.1.101.3.4.1.47": { name: "aes256-CCM", shortName: "aes256-ccm", category: "aes", keyLen: 256, mode: "ccm" },
      "1.2.840.113549.1.12.1.1": { name: "pbeWithSHA1And128BitRC4", shortName: "pbeWithSHA1RC4-128", category: "pkcs12" },
      "1.2.840.113549.1.12.1.2": { name: "pbeWithSHA1And40BitRC4", shortName: "pbeWithSHA1RC4-40", category: "pkcs12" },
      "1.2.840.113549.1.12.1.3": { name: "pbeWithSHA1And3-KeyTripleDES-CBC", shortName: "pbeWithSHA13DES", category: "pkcs12" },
      "1.2.840.113549.1.12.10.1.1": { name: "pkcs12-keyBag", shortName: "keyBag", category: "pkcs12" },
      "1.2.840.113549.1.12.10.1.2": { name: "pkcs12-pkcs8ShroudedKeyBag", shortName: "pkcs8ShroudedKeyBag", category: "pkcs12" },
      "1.2.840.113549.1.12.10.1.3": { name: "pkcs12-certBag", shortName: "certBag", category: "pkcs12" },
      "1.2.840.113549.1.12.10.1.4": { name: "pkcs12-crlBag", shortName: "crlBag", category: "pkcs12" },
      "1.2.840.113549.1.12.10.1.5": { name: "pkcs12-secretBag", shortName: "secretBag", category: "pkcs12" },
      "1.2.840.113549.1.12.10.1.6": { name: "pkcs12-safeContentsBag", shortName: "safeContentsBag", category: "pkcs12" },
      "1.3.6.1.5.5.7.48.1": { name: "ocsp", shortName: "ocsp", category: "x509-extension" },
      "1.3.6.1.5.5.7.48.2": { name: "caIssuers", shortName: "caIssuers", category: "x509-extension" },
      "1.3.6.1.5.5.7.48.3": { name: "timeStamping", shortName: "timestampingUri", category: "x509-extension" },
      "1.2.840.113549.1.9.16.1.4": { name: "id-smime-ct-TSTInfo", shortName: "tstInfo", category: "pkcs7" },
      "1.3.6.1.5.5.7.48.1.1": { name: "id-pkix-ocsp-basic", shortName: "ocspBasic", category: "pkcs7" },
      "1.2.840.113549.1.9.16.3.8": { name: "id-alg-CMS3DESwrap", shortName: "CMS3DESwrap", category: "pkcs7" },
      "2.16.840.1.101.3.4.1": { name: "nistAlgorithms", shortName: "nistAlgorithms", category: "aes" },
      "1.2.840.113549": { name: "rsadsi", shortName: "rsadsi", category: "pkcs1" },
      "1.2.840.113549.1": { name: "pkcs", shortName: "pkcs", category: "pkcs1" },
      "2.5.4.0": { name: "objectClass", shortName: "objectClass", category: "x509-dn" },
      "2.5.4.49": { name: "distinguishedName", shortName: "distinguishedName", category: "x509-dn" },
      "2.5.4.97": { name: "organizationIdentifier", shortName: "organizationIdentifier", category: "x509-dn" },
      "2.16.840.1.113730.1.1": { name: "netscape-cert-type", shortName: "nsCertType", category: "x509-extension" },
      "2.16.840.1.113730.1.12": { name: "netscape-ssl-server-name", shortName: "nsSSLServerName", category: "x509-extension" },
      "2.16.840.1.113730.1.13": { name: "netscape-comment", shortName: "nsComment", category: "x509-extension" }
    }, _OID_RE = /^\d+(\.\d+)*$/, _nameIndex = new Map;
    for (const [oidStr, entry] of Object.entries(OID_DATABASE)) {
      _nameIndex.set(entry.name.toLowerCase(), oidStr);
      _nameIndex.set(entry.shortName.toLowerCase(), oidStr);
    }
    const _DN_ALIASES = [
      ["e", "1.2.840.113549.1.9.1"]
    ];
    for (const [alias, oidStr] of _DN_ALIASES)
      if (!_nameIndex.has(alias))
        _nameIndex.set(alias, oidStr);
    function lookup(oidStr) {
      if (typeof oidStr !== "string")
        return null;
      if (!_OID_RE.test(oidStr))
        return null;
      return OID_DATABASE[oidStr] ?? null;
    }
    function byName(nameOrShortName) {
      if (typeof nameOrShortName !== "string")
        return null;
      return _nameIndex.get(nameOrShortName.toLowerCase()) ?? null;
    }
    function findByCategory(category) {
      const out = [];
      for (const [oidStr, entry] of Object.entries(OID_DATABASE))
        if (entry.category === category)
          out.push({ oid: oidStr, ...entry });
      return out;
    }
    return { lookup, byName, findByCategory, OID_DATABASE };
  } });
    __register({ name: "pem", dependencies: ["b64"], factory: function(b64) {
    function _wrapLines(s, w) {
      let out = "";
      for (let i = 0;i < s.length; i += w)
        out += s.substring(i, i + w) + `
`;
      return out;
    }
    function encode(bytes, label) {
      const body = b64.fromBytes(bytes);
      return `-----BEGIN ${label}-----
${_wrapLines(body, 64)}-----END ${label}-----
`;
    }
    function decode(text, expectLabel) {
      const m = text.match(/-----BEGIN ([^-]+)-----([\s\S]+?)-----END ([^-]+)-----/);
      if (!m) {
        console.warn("[crypto] INVALID: pem: no BEGIN/END markers");
        return !1;
      }
      const label = m[1].trim(), endLabel = m[3].trim();
      if (label !== endLabel) {
        console.warn("[crypto] INVALID: pem: BEGIN/END label mismatch");
        return !1;
      }
      if (expectLabel && label !== expectLabel) {
        console.warn(`[crypto] INVALID: pem: expected ${expectLabel}, got ${label}`);
        return !1;
      }
      const body = m[2].replace(/\s+/g, "");
      return { label, bytes: b64.toBytes(body) };
    }
    return { name: "pem", encode, decode };
  } });
    __register({ name: "random", dependencies: ["bitArray","aes","sha256"], factory: function(bitArray, aes, sha256) {
    const _hasCrypto = typeof crypto < "u" && !!crypto.getRandomValues;
    function _bytesToWords(b) {
      const n = b.length >>> 2, out = Array(n);
      for (let i = 0;i < n; i++) {
        const j = i << 2;
        out[i] = b[j] << 24 | b[j + 1] << 16 | b[j + 2] << 8 | b[j + 3] | 0;
      }
      return out;
    }
    function _wordsToBytes(w, count, into, off) {
      for (let i = 0;i < count; i++) {
        const j = off + (i << 2);
        into[j] = w[i] >>> 24 & 255;
        into[j + 1] = w[i] >>> 16 & 255;
        into[j + 2] = w[i] >>> 8 & 255;
        into[j + 3] = w[i] & 255;
      }
    }
    const _RCT_CUTOFF = 4, _APT_W = 512, _APT_C = 13, _rct = { prev: -1, run: 0 }, _apt = { anchor: -1, count: 0, idx: 0 };
    let _entropyDead = !1;
    function _healthCheck(buf) {
      if (_entropyDead)
        return !1;
      for (let i = 0;i < buf.length; i++) {
        const b = buf[i];
        if (b === _rct.prev) {
          _rct.run++;
          if (_rct.run >= _RCT_CUTOFF) {
            _entropyDead = !0;
            console.error("[crypto] CORRUPT: random: RCT health-test failed on entropy source");
            return !1;
          }
        } else {
          _rct.prev = b;
          _rct.run = 1;
        }
        if (_apt.anchor === -1) {
          _apt.anchor = b;
          _apt.count = 1;
          _apt.idx = 1;
        } else {
          _apt.idx++;
          if (b === _apt.anchor) {
            _apt.count++;
            if (_apt.count > _APT_C) {
              _entropyDead = !0;
              console.error("[crypto] CORRUPT: random: APT health-test failed on entropy source");
              return !1;
            }
          }
          if (_apt.idx >= _APT_W)
            _apt.anchor = -1;
        }
      }
      return !0;
    }
    function _resetHealth() {
      _rct.prev = -1;
      _rct.run = 0;
      _apt.anchor = -1;
      _apt.count = 0;
      _apt.idx = 0;
      _entropyDead = !1;
    }
    function _getRandomBytes(out) {
      if (!_hasCrypto) {
        console.error("[crypto] NOT READY: crypto.getRandomValues unavailable");
        return !1;
      }
      let offset = 0;
      while (offset < out.length) {
        const chunk = Math.min(65536, out.length - offset);
        crypto.getRandomValues(out.subarray(offset, offset + chunk));
        offset += chunk;
      }
      return out;
    }
    function _getEntropy(nBytes) {
      if (_entropyDead) {
        console.error("[crypto] CORRUPT: random: entropy source previously failed health test");
        return !1;
      }
      const buf = _getRandomBytes(new Uint8Array(nBytes));
      if (buf === !1)
        return !1;
      if (!_healthCheck(buf))
        return !1;
      return buf;
    }
    const _BLK_WORDS = 4, _BLK_BYTES = 16, _MAX_GEN_BYTES = 65536, _RESEED_INTERVAL = 4294967296;
    function _makeDrbg(opts) {
      opts = opts || {};
      const aesKeyBits = opts.aesKeyBits || 256, useDf = !!opts.df;
      if (aesKeyBits !== 128 && aesKeyBits !== 192 && aesKeyBits !== 256) {
        console.error("[crypto] BUG: ctr_drbg: aesKeyBits must be 128, 192 or 256");
        return !1;
      }
      const KEY_BYTES = aesKeyBits / 8, KEY_WORDS = KEY_BYTES / 4, SEED_BYTES = KEY_BYTES + _BLK_BYTES, SEED_WORDS = SEED_BYTES / 4;
      let K = Array(KEY_WORDS).fill(0), V = Array(_BLK_WORDS).fill(0), cipher = null, reseedCt = 0, live = !1;
      function _bcc(Kbytes, dataBytes) {
        const cf = aes.fn(_bytesToWords(Kbytes), !1);
        if (cf === !1)
          return !1;
        const chain = new Uint8Array(_BLK_BYTES);
        for (let off = 0;off < dataBytes.length; off += _BLK_BYTES) {
          for (let i = 0;i < _BLK_BYTES; i++)
            chain[i] ^= dataBytes[off + i];
          const blk = cf.encrypt(_bytesToWords(chain));
          _wordsToBytes(blk, _BLK_WORDS, chain, 0);
        }
        return chain;
      }
      function _df(inputBytes, outBytes) {
        const L = inputBytes.length, N = outBytes, rawLen = 8 + L + 1, padLen = (_BLK_BYTES - rawLen % _BLK_BYTES) % _BLK_BYTES, Slen = rawLen + padLen, S = new Uint8Array(Slen);
        S[0] = L >>> 24 & 255;
        S[1] = L >>> 16 & 255;
        S[2] = L >>> 8 & 255;
        S[3] = L & 255;
        S[4] = N >>> 24 & 255;
        S[5] = N >>> 16 & 255;
        S[6] = N >>> 8 & 255;
        S[7] = N & 255;
        for (let i = 0;i < L; i++)
          S[8 + i] = inputBytes[i];
        S[8 + L] = 128;
        const Kdf = new Uint8Array(KEY_BYTES);
        for (let i = 0;i < KEY_BYTES; i++)
          Kdf[i] = i;
        const tempLen = KEY_BYTES + _BLK_BYTES, temp = new Uint8Array(Math.ceil(tempLen / _BLK_BYTES) * _BLK_BYTES);
        let tempOff = 0, i = 0;
        while (tempOff < tempLen) {
          const ivS = new Uint8Array(_BLK_BYTES + Slen);
          ivS[0] = i >>> 24 & 255;
          ivS[1] = i >>> 16 & 255;
          ivS[2] = i >>> 8 & 255;
          ivS[3] = i & 255;
          ivS.set(S, _BLK_BYTES);
          const blk = _bcc(Kdf, ivS);
          if (blk === !1)
            return !1;
          temp.set(blk, tempOff);
          tempOff += _BLK_BYTES;
          i++;
        }
        const Kp = temp.subarray(0, KEY_BYTES);
        let X = temp.slice(KEY_BYTES, KEY_BYTES + _BLK_BYTES);
        const cf = aes.fn(_bytesToWords(Kp), !1);
        if (cf === !1)
          return !1;
        const out = new Uint8Array(outBytes);
        let outOff = 0;
        while (outOff < outBytes) {
          const blk = cf.encrypt(_bytesToWords(X));
          _wordsToBytes(blk, _BLK_WORDS, X, 0);
          const n = Math.min(_BLK_BYTES, outBytes - outOff);
          out.set(X.subarray(0, n), outOff);
          outOff += n;
        }
        return out;
      }
      function _rebuild() {
        cipher = aes.fn(K, !1);
        if (cipher === !1) {
          console.error("[crypto] BUG: ctr_drbg: AES key schedule failed");
          return !1;
        }
        return !0;
      }
      function _incV() {
        for (let i = _BLK_WORDS - 1;i >= 0; i--) {
          V[i] = V[i] + 1 | 0;
          if (V[i] !== 0)
            break;
        }
      }
      function _update(providedWords) {
        const temp = Array(SEED_WORDS).fill(0);
        let pos = 0;
        while (pos < SEED_WORDS) {
          _incV();
          const blk = cipher.encrypt(V);
          for (let j = 0;j < _BLK_WORDS && pos < SEED_WORDS; j++)
            temp[pos++] = blk[j];
        }
        for (let i = 0;i < SEED_WORDS; i++)
          temp[i] ^= providedWords[i];
        K = temp.slice(0, KEY_WORDS);
        V = temp.slice(KEY_WORDS, KEY_WORDS + _BLK_WORDS);
        return _rebuild();
      }
      function _distill(entropyBytes, personalisationBytes, nonceBytes) {
        if (useDf) {
          const eLen = entropyBytes ? entropyBytes.length : 0, nLen = nonceBytes ? nonceBytes.length : 0, pLen = personalisationBytes ? personalisationBytes.length : 0, cat = new Uint8Array(eLen + nLen + pLen);
          if (eLen)
            cat.set(entropyBytes, 0);
          if (nLen)
            cat.set(nonceBytes, eLen);
          if (pLen)
            cat.set(personalisationBytes, eLen + nLen);
          return _df(cat, SEED_BYTES);
        }
        if (!entropyBytes || entropyBytes.length !== SEED_BYTES) {
          console.error("[crypto] BUG: ctr_drbg (no-df): entropy must be exactly " + SEED_BYTES + " bytes");
          return !1;
        }
        const seed = new Uint8Array(SEED_BYTES);
        seed.set(entropyBytes);
        if (personalisationBytes && personalisationBytes.length > 0) {
          const lim = Math.min(personalisationBytes.length, SEED_BYTES);
          for (let i = 0;i < lim; i++)
            seed[i] ^= personalisationBytes[i];
        }
        return seed;
      }
      function instantiate(entropyBytes, personalisationBytes, nonceBytes) {
        const seed = _distill(entropyBytes, personalisationBytes, nonceBytes);
        if (seed === !1)
          return !1;
        K.fill(0);
        V.fill(0);
        if (!_rebuild())
          return !1;
        if (!_update(_bytesToWords(seed)))
          return !1;
        reseedCt = 1;
        live = !0;
        return !0;
      }
      function reseed(entropyBytes, additionalInputBytes) {
        if (!live) {
          console.warn("[crypto] NOT READY: ctr_drbg.reseed: not instantiated");
          return !1;
        }
        const seed = _distill(entropyBytes, additionalInputBytes, null);
        if (seed === !1)
          return !1;
        if (!_update(_bytesToWords(seed)))
          return !1;
        reseedCt = 1;
        return !0;
      }
      function generate(n, additionalInputBytes) {
        if (!live) {
          console.warn("[crypto] NOT READY: ctr_drbg.generate: not instantiated");
          return !1;
        }
        if (!Number.isInteger(n) || n < 0 || n > _MAX_GEN_BYTES) {
          console.warn("[crypto] INVALID: ctr_drbg.generate: n must be an integer in [0, " + _MAX_GEN_BYTES + "]");
          return !1;
        }
        if (n === 0)
          return new Uint8Array(0);
        if (reseedCt > _RESEED_INTERVAL) {
          const fresh = _getEntropy(SEED_BYTES);
          if (fresh === !1)
            return !1;
          if (!reseed(fresh, additionalInputBytes))
            return !1;
          additionalInputBytes = null;
        }
        let aiWords;
        if (additionalInputBytes && additionalInputBytes.length > 0) {
          let aiBytes;
          if (useDf) {
            aiBytes = _df(additionalInputBytes, SEED_BYTES);
            if (aiBytes === !1)
              return !1;
          } else {
            aiBytes = new Uint8Array(SEED_BYTES);
            aiBytes.set(additionalInputBytes.subarray(0, Math.min(SEED_BYTES, additionalInputBytes.length)));
          }
          aiWords = _bytesToWords(aiBytes);
          if (!_update(aiWords))
            return !1;
        } else
          aiWords = Array(SEED_WORDS).fill(0);
        const out = new Uint8Array(n);
        let off = 0;
        while (off < n) {
          _incV();
          const blk = cipher.encrypt(V), remaining = n - off;
          if (remaining >= 16) {
            _wordsToBytes(blk, _BLK_WORDS, out, off);
            off += 16;
          } else {
            const tmp = new Uint8Array(16);
            _wordsToBytes(blk, _BLK_WORDS, tmp, 0);
            out.set(tmp.subarray(0, remaining), off);
            off = n;
          }
        }
        if (!_update(aiWords))
          return !1;
        reseedCt++;
        return out;
      }
      function uninstantiate() {
        K.fill(0);
        V.fill(0);
        cipher = null;
        reseedCt = 0;
        live = !1;
      }
      return {
        instantiate,
        reseed,
        generate,
        uninstantiate,
        get isLive() {
          return live;
        },
        get reseedCounter() {
          return reseedCt;
        },
        get securityStrength() {
          return aesKeyBits;
        },
        get aesKeyBits() {
          return aesKeyBits;
        },
        get useDf() {
          return useDf;
        },
        get seedBytes() {
          return SEED_BYTES;
        }
      };
    }
    const _KAT_ENTROPY_INPUT = _hexToBytes("e4bc23c5089a19d86f4119cb3fa08c0a4991e0a1def17e101e4c14d9c323460a7c2fb58e0b086c6c57b55f56cae25bad"), _KAT_ENTROPY_RESEED = _hexToBytes("fd85a836bba85019881e8c6bad23c9061adc75477659acaea8e4a01dfe07a1832dad1c136f59d70f8653a5dc118663d6"), _KAT_EXPECTED_HEX = "b2cb8905c05e5950ca31895096be29ea3d5a3b82b269495554eb80fe07de43e193b9e7c3ece73b80e062b1c1f68202fbb1c52a040ea2478864295282234aaada";
    let _selfTestPassed = null;
    function _hexToBytes(h) {
      const out = new Uint8Array(h.length >>> 1);
      for (let i = 0;i < out.length; i++)
        out[i] = parseInt(h.substring(i * 2, i * 2 + 2), 16);
      return out;
    }
    function _hex(b) {
      let s = "";
      for (let i = 0;i < b.length; i++) {
        const v = b[i];
        s += (v < 16 ? "0" : "") + v.toString(16);
      }
      return s;
    }
    function _runSelfTest() {
      const d = _makeDrbg();
      if (!d || d === !1)
        return !1;
      if (!d.instantiate(_KAT_ENTROPY_INPUT))
        return !1;
      if (!d.reseed(_KAT_ENTROPY_RESEED))
        return !1;
      if (d.generate(64) === !1)
        return !1;
      const out = d.generate(64);
      if (out === !1)
        return !1;
      const got = _hex(out);
      if (got !== _KAT_EXPECTED_HEX) {
        console.error("[crypto] CORRUPT: random.selfTest: CTR_DRBG KAT mismatch (got " + got + ")");
        return !1;
      }
      return !0;
    }
    function _ensureSelfTest() {
      if (_selfTestPassed === null)
        _selfTestPassed = _runSelfTest();
      return _selfTestPassed;
    }
    const api = Object.defineProperty({
      fill(array) {
        return _getRandomBytes(array);
      },
      float() {
        const bytes = _getRandomBytes(new Uint8Array(4));
        if (bytes === !1)
          return !1;
        return ((bytes[0] << 24 | bytes[1] << 16 | bytes[2] << 8 | bytes[3]) >>> 0) / 4294967296;
      },
      int(min, max) {
        if (min > max)
          throw RangeError("min must be \u2264 max");
        const range = max - min + 1, maxUnbiased = Math.floor(4294967296 / range) * range, buf = new Uint8Array(4);
        let value;
        do {
          if (_getRandomBytes(buf) === !1)
            return !1;
          value = (buf[0] << 24 | buf[1] << 16 | buf[2] << 8 | buf[3]) >>> 0;
        } while (value >= maxUnbiased);
        return min + value % range;
      },
      bytes(n) {
        if (!Number.isInteger(n) || n < 0) {
          console.warn("[crypto] INVALID: random.bytes expects a non-negative integer");
          return !1;
        }
        return _getRandomBytes(new Uint8Array(n));
      },
      words(n) {
        if (!Number.isInteger(n) || n < 0) {
          console.warn("[crypto] INVALID: random.words expects a non-negative integer");
          return !1;
        }
        const bytes = _getRandomBytes(new Uint8Array(n * 4));
        if (bytes === !1)
          return !1;
        const out = Array(n);
        for (let i = 0;i < n; i++) {
          const j = i * 4;
          out[i] = bytes[j] << 24 | bytes[j + 1] << 16 | bytes[j + 2] << 8 | bytes[j + 3] | 0;
        }
        return out;
      },
      bits(n) {
        if (!Number.isInteger(n) || n < 0) {
          console.warn("[crypto] INVALID: random.bits expects a non-negative integer");
          return !1;
        }
        const wordCount = Math.ceil(n / 32), words = api.words(wordCount);
        if (words === !1)
          return !1;
        return bitArray.clamp(words, n);
      },
      isReady() {
        return _hasCrypto;
      },
      selfTest() {
        _selfTestPassed = _runSelfTest();
        return _selfTestPassed;
      },
      health: {
        feed(buf) {
          return _healthCheck(buf instanceof Uint8Array ? buf : new Uint8Array(buf));
        },
        reset() {
          _resetHealth();
        },
        get isDead() {
          return _entropyDead;
        }
      },
      drbg(options = {}) {
        if (!_ensureSelfTest()) {
          console.error("[crypto] CORRUPT: random.drbg refused - POST failed");
          return !1;
        }
        const inst = _makeDrbg(options);
        if (inst === !1)
          return !1;
        const seed = _getEntropy(inst.seedBytes);
        if (seed === !1)
          return !1;
        if (!inst.instantiate(seed, options.personalisation))
          return !1;
        let pending = null;
        return {
          generate(n, additionalInput) {
            let ai = additionalInput || null;
            if (pending !== null) {
              ai = ai === null ? pending : (() => {
                const m = new Uint8Array(pending.length + ai.length);
                m.set(pending);
                m.set(ai, pending.length);
                return m;
              })();
              pending = null;
            }
            return inst.generate(n, ai);
          },
          reseed(additionalInput) {
            const fresh = _getEntropy(inst.seedBytes);
            if (fresh === !1)
              return !1;
            let ai = additionalInput || null;
            if (pending !== null) {
              ai = ai === null ? pending : (() => {
                const m = new Uint8Array(pending.length + ai.length);
                m.set(pending);
                m.set(ai, pending.length);
                return m;
              })();
              pending = null;
            }
            return inst.reseed(fresh, ai);
          },
          addAdditionalInput(bytes) {
            if (!(bytes instanceof Uint8Array))
              if (Array.isArray(bytes) || bytes instanceof Uint32Array) {
                const tmp = new Uint8Array(bytes.length * 4);
                for (let i = 0;i < bytes.length; i++) {
                  const v = bytes[i] | 0;
                  tmp[i * 4] = v >>> 24 & 255;
                  tmp[i * 4 + 1] = v >>> 16 & 255;
                  tmp[i * 4 + 2] = v >>> 8 & 255;
                  tmp[i * 4 + 3] = v & 255;
                }
                bytes = tmp;
              } else if (typeof bytes === "number") {
                const v = bytes | 0;
                bytes = new Uint8Array([v >>> 24 & 255, v >>> 16 & 255, v >>> 8 & 255, v & 255]);
              } else {
                console.warn("[crypto] BUG: drbg.addAdditionalInput: unsupported data type");
                return !1;
              }
            const merged = pending === null ? bytes : (() => {
              const m = new Uint8Array(pending.length + bytes.length);
              m.set(pending);
              m.set(bytes, pending.length);
              return m;
            })();
            if (merged.length <= inst.seedBytes)
              pending = merged;
            else {
              const h = sha256.hash(_bytesToWords(merged.subarray(0, merged.length & -4))), folded = new Uint8Array(32);
              _wordsToBytes(h, 8, folded, 0);
              pending = folded;
            }
            return !0;
          },
          uninstantiate() {
            pending = null;
            inst.uninstantiate();
          },
          get isLive() {
            return inst.isLive;
          },
          get reseedCounter() {
            return inst.reseedCounter;
          },
          get securityStrength() {
            return inst.securityStrength;
          }
        };
      }
    }, Symbol.for("@awacloud/fw/internal"), {
      value: { makeDrbg: _makeDrbg }
    });
    return api;
  } });
    __register({ name: "bn", dependencies: ["bitArray","random"], factory: function(bitArray, random) {
    const bn_class = {
      random: function(modulus, paranoia) {},
      prime: {},
      pseudoMersennePrime: function(exponent, coeff) {},
      fromBits: function(bits) {},
      bn: function(it) {
        this.initWith(it);
      }
    }, Bn = bn_class.bn;
    Bn.prototype.radix = 24;
    Bn.prototype.maxMul = 8;
    Bn.prototype._class = Bn;
    Bn.prototype.copy = function() {
      return new this._class(this);
    };
    Bn.prototype.initWith = function(it) {
      let i, k;
      switch (typeof it) {
        case "object":
          this.limbs = it.limbs.slice(0);
          break;
        case "number":
          this.limbs = [it];
          this.normalize();
          break;
        case "string":
          it = it.replace(/^0x/, "");
          if (!/^[0-9a-fA-F]*$/.test(it)) {
            console.warn("[crypto] INVALID: bn.initWith: string must contain only hex characters");
            this.limbs = [0];
            break;
          }
          this.limbs = [];
          k = this.radix / 4;
          for (i = 0;i < it.length; i += k)
            this.limbs.push(parseInt(it.substring(Math.max(it.length - i - k, 0), it.length - i), 16));
          if (this.limbs.length === 0)
            this.limbs = [0];
          break;
        default:
          this.limbs = [0];
      }
      return this;
    };
    Bn.prototype.equals = function(that) {
      if (typeof that === "number")
        that = new this._class(that);
      const a = this.copy().fullReduce(), b = that.copy().fullReduce();
      let difference = 0;
      for (let i = 0;i < a.limbs.length || i < b.limbs.length; i++)
        difference |= a.getLimb(i) ^ b.getLimb(i);
      return difference === 0;
    };
    Bn.prototype.getLimb = function(i) {
      return i >= this.limbs.length ? 0 : this.limbs[i];
    };
    Bn.prototype.greaterEquals = function(that) {
      if (typeof that === "number")
        that = new this._class(that);
      let less = 0, greater = 0, a, b, i = Math.max(this.limbs.length, that.limbs.length) - 1;
      for (;i >= 0; i--) {
        a = this.getLimb(i);
        b = that.getLimb(i);
        greater |= b - a & ~less;
        less |= a - b & ~greater;
      }
      return (greater | ~less) >>> 31;
    };
    Bn.prototype.toHex = function() {
      this.fullReduce();
      let out = "";
      const l = this.limbs;
      for (let i = 0;i < this.limbs.length; i++) {
        let s = l[i].toString(16);
        while (i < this.limbs.length - 1 && s.length < 6)
          s = "0" + s;
        out = s + out;
      }
      return "0x" + out;
    };
    Bn.prototype.addM = function(that) {
      if (typeof that !== "object")
        that = new this._class(that);
      const l = this.limbs, ll = that.limbs;
      for (let i = l.length;i < ll.length; i++)
        l[i] = 0;
      for (let i = 0;i < ll.length; i++)
        l[i] += ll[i];
      return this;
    };
    Bn.prototype.doubleM = function() {
      let carry = 0, tmp;
      const r = this.radix, m = this.radixMask, l = this.limbs;
      for (let i = 0;i < l.length; i++) {
        tmp = l[i];
        tmp = tmp + tmp + carry;
        l[i] = tmp & m;
        carry = tmp >> r;
      }
      if (carry)
        l.push(carry);
      return this;
    };
    Bn.prototype.halveM = function() {
      let carry = 0, tmp;
      const r = this.radix, l = this.limbs;
      for (let i = l.length - 1;i >= 0; i--) {
        tmp = l[i];
        l[i] = tmp + carry >> 1;
        carry = (tmp & 1) << r;
      }
      if (!l[l.length - 1])
        l.pop();
      return this;
    };
    Bn.prototype.subM = function(that) {
      if (typeof that !== "object")
        that = new this._class(that);
      const l = this.limbs, ll = that.limbs;
      for (let i = l.length;i < ll.length; i++)
        l[i] = 0;
      for (let i = 0;i < ll.length; i++)
        l[i] -= ll[i];
      return this;
    };
    Bn.prototype.mod = function(that) {
      const neg = !this.greaterEquals(new Bn(0));
      that = new Bn(that).normalize();
      let out = new Bn(this).normalize(), ci = 0;
      if (neg)
        out = new Bn(0).subM(out).normalize();
      for (;out.greaterEquals(that); ci++)
        that.doubleM();
      if (neg)
        out = that.sub(out).normalize();
      for (;ci > 0; ci--) {
        that.halveM();
        if (out.greaterEquals(that))
          out.subM(that).normalize();
      }
      return out.trim();
    };
    Bn.prototype.inverseMod = function(p) {
      let a = new Bn(1), b = new Bn(0), x = new Bn(this), y = new Bn(p), tmp, nz;
      if (!(p.limbs[0] & 1)) {
        console.warn("[crypto] INVALID: inverseMod: p must be odd");
        return !1;
      }
      do {
        if (x.limbs[0] & 1) {
          if (!x.greaterEquals(y)) {
            tmp = x;
            x = y;
            y = tmp;
            tmp = a;
            a = b;
            b = tmp;
          }
          x.subM(y);
          x.normalize();
          if (!a.greaterEquals(b))
            a.addM(p);
          a.subM(b);
        }
        x.halveM();
        if (a.limbs[0] & 1)
          a.addM(p);
        a.normalize();
        a.halveM();
        nz = 0;
        for (let i = 0;i < x.limbs.length; i++)
          nz |= x.limbs[i];
      } while (nz);
      if (!y.equals(1)) {
        console.warn("[crypto] INVALID: inverseMod: p and x must be relatively prime");
        return !1;
      }
      return b;
    };
    Bn.prototype.add = function(that) {
      return this.copy().addM(that);
    };
    Bn.prototype.sub = function(that) {
      return this.copy().subM(that);
    };
    Bn.prototype.mul = function(that) {
      if (typeof that === "number")
        that = new this._class(that);
      else
        that.normalize();
      this.normalize();
      const a = this.limbs, b = that.limbs, al = a.length, bl = b.length, out = new this._class, c = out.limbs;
      let ai, ii = this.maxMul;
      for (let i = 0;i < this.limbs.length + that.limbs.length + 1; i++)
        c[i] = 0;
      for (let i = 0;i < al; i++) {
        ai = a[i];
        for (let j = 0;j < bl; j++)
          c[i + j] += ai * b[j];
        if (!--ii) {
          ii = this.maxMul;
          out.cnormalize();
        }
      }
      return out.cnormalize().reduce();
    };
    Bn.prototype.square = function() {
      return this.mul(this);
    };
    Bn.prototype.power = function(l) {
      l = new Bn(l).normalize().trim().limbs;
      let out = new this._class(1), pow = this;
      for (let i = 0;i < l.length; i++)
        for (let j = 0;j < this.radix; j++) {
          if (l[i] & 1 << j)
            out = out.mul(pow);
          if (i === l.length - 1 && l[i] >> j + 1 === 0)
            break;
          pow = pow.square();
        }
      return out;
    };
    Bn.prototype.mulmod = function(that, N) {
      return this.mod(N).mul(that.mod(N)).mod(N);
    };
    Bn.prototype.powermod = function(x, N) {
      x = new Bn(x);
      N = new Bn(N);
      if ((N.limbs[0] & 1) === 1) {
        const montOut = this.montpowermod(x, N);
        if (montOut !== !1)
          return montOut;
      }
      const l = x.normalize().trim().limbs;
      let out = new this._class(1), pow = this;
      for (let i = 0;i < l.length; i++)
        for (let j = 0;j < this.radix; j++) {
          if (l[i] & 1 << j)
            out = out.mulmod(pow, N);
          if (i === l.length - 1 && l[i] >> j + 1 === 0)
            break;
          pow = pow.mulmod(pow, N);
        }
      return out;
    };
    Bn.prototype.montpowermod = function(x, N) {
      x = new Bn(x).normalize().trim();
      N = new Bn(N);
      const radix = this.radix;
      let out = new this._class(1), pow = this.copy();
      const bitsize = x.bitLength(), R = new Bn({
        limbs: N.copy().normalize().trim().limbs.map(function() {
          return 0;
        })
      });
      let s;
      for (s = this.radix;s > 0; s--)
        if ((N.limbs[N.limbs.length - 1] >> s & 1) === 1) {
          R.limbs[R.limbs.length - 1] = 1 << s;
          break;
        }
      let wind;
      if (bitsize === 0)
        return this;
      else if (bitsize < 18)
        wind = 1;
      else if (bitsize < 48)
        wind = 3;
      else if (bitsize < 144)
        wind = 4;
      else if (bitsize < 768)
        wind = 5;
      else
        wind = 6;
      const RR = R.copy(), NN = N.copy();
      let RP = new Bn(1), NP = new Bn(0);
      const RT = R.copy();
      while (RT.greaterEquals(1)) {
        RT.halveM();
        if ((RP.limbs[0] & 1) === 0) {
          RP.halveM();
          NP.halveM();
        } else {
          RP.addM(NN);
          RP.halveM();
          NP.halveM();
          NP.addM(RR);
        }
      }
      RP = RP.normalize();
      NP = NP.normalize();
      RR.doubleM();
      const R2 = RR.mulmod(RR, N);
      if (!RR.mul(RP).sub(N.mul(NP)).equals(1))
        return !1;
      const montMul = function(a, b) {
        const mask = (1 << s + 1) - 1;
        let ab = a.mul(b), right = ab.mul(NP);
        right.limbs = right.limbs.slice(0, R.limbs.length);
        if (right.limbs.length === R.limbs.length)
          right.limbs[R.limbs.length - 1] &= mask;
        right = right.mul(N);
        const abBar = ab.add(right).normalize().trim();
        abBar.limbs = abBar.limbs.slice(R.limbs.length - 1);
        for (let k = 0;k < abBar.limbs.length; k++) {
          if (k > 0)
            abBar.limbs[k - 1] |= (abBar.limbs[k] & mask) << radix - s - 1;
          abBar.limbs[k] = abBar.limbs[k] >> s + 1;
        }
        if (abBar.greaterEquals(N))
          abBar.subM(N);
        return abBar;
      }, montIn = function(c) {
        return montMul(c, R2);
      }, montOut = function(c) {
        return montMul(c, 1);
      };
      pow = montIn(pow);
      out = montIn(out);
      const precomp = {}, cap = (1 << wind - 1) - 1;
      precomp[1] = pow.copy();
      precomp[2] = montMul(pow, pow);
      for (let h = 1;h <= cap; h++)
        precomp[2 * h + 1] = montMul(precomp[2 * h - 1], precomp[2]);
      const getBit = function(exp, i) {
        const off = i % exp.radix;
        return (exp.limbs[Math.floor(i / exp.radix)] & 1 << off) >> off;
      };
      for (let i = x.bitLength() - 1;i >= 0; )
        if (getBit(x, i) === 0) {
          out = montMul(out, out);
          i = i - 1;
        } else {
          let l = i - wind + 1;
          while (getBit(x, l) === 0)
            l++;
          let indx = 0;
          for (let j = l;j <= i; j++) {
            indx += getBit(x, j) << j - l;
            out = montMul(out, out);
          }
          out = montMul(out, precomp[indx]);
          i = l - 1;
        }
      return montOut(out);
    };
    Bn.prototype.trim = function() {
      const l = this.limbs;
      let p;
      do
        p = l.pop();
      while (l.length && p === 0);
      l.push(p);
      return this;
    };
    Bn.prototype.reduce = function() {
      return this;
    };
    Bn.prototype.fullReduce = function() {
      return this.normalize();
    };
    Bn.prototype.normalize = function() {
      let carry = 0;
      const pv = this.placeVal, ipv = this.ipv, limbs = this.limbs, ll = limbs.length, mask = this.radixMask;
      let i, l, m;
      for (i = 0;i < ll || carry !== 0 && carry !== -1; i++) {
        l = (limbs[i] || 0) + carry;
        m = limbs[i] = l & mask;
        carry = (l - m) * ipv;
      }
      if (carry === -1)
        limbs[i - 1] -= pv;
      this.trim();
      return this;
    };
    Bn.prototype.cnormalize = function() {
      let carry = 0;
      const ipv = this.ipv, limbs = this.limbs, ll = limbs.length, mask = this.radixMask;
      let i, l, m;
      for (i = 0;i < ll - 1; i++) {
        l = limbs[i] + carry;
        m = limbs[i] = l & mask;
        carry = (l - m) * ipv;
      }
      limbs[i] += carry;
      return this;
    };
    Bn.prototype.toBits = function(len) {
      this.fullReduce();
      len = len || this.exponent || this.bitLength();
      let i = Math.floor((len - 1) / 24);
      const w = bitArray, e = (len + 7 & -8) % this.radix || this.radix;
      let out = [w.partial(e, this.getLimb(i))];
      for (i--;i >= 0; i--) {
        out = w.concat(out, [w.partial(Math.min(this.radix, len), this.getLimb(i))]);
        len -= this.radix;
      }
      return out;
    };
    Bn.prototype.bitLength = function() {
      this.fullReduce();
      let out = this.radix * (this.limbs.length - 1), b = this.limbs[this.limbs.length - 1];
      for (;b; b >>>= 1)
        out++;
      return out + 7 & -8;
    };
    bn_class.fromBits = function(bits) {
      let Class, t;
      if (this.bn) {
        Class = this.bn;
        t = this.bn.prototype;
      } else {
        Class = this;
        t = this.prototype;
      }
      const out = new Class, words = [], w = bitArray, l = Math.min(this.bitLength || 4294967296, w.bitLength(bits)), e = l % t.radix || t.radix;
      words[0] = w.extract(bits, 0, e);
      for (let p = e;p < l; p += t.radix)
        words.unshift(w.extract(bits, p, t.radix));
      out.limbs = words;
      return out;
    };
    Bn.prototype.ipv = 1 / (Bn.prototype.placeVal = Math.pow(2, Bn.prototype.radix));
    Bn.prototype.radixMask = (1 << Bn.prototype.radix) - 1;
    bn_class.pseudoMersennePrime = function(exponent, coeff) {
      function p(it) {
        this.initWith(it);
      }
      const ppr = p.prototype = new Bn, tmp = exponent / ppr.radix, mo = ppr.modOffset = Math.ceil(tmp);
      ppr.exponent = exponent;
      ppr.offset = [];
      ppr.factor = [];
      ppr.minOffset = mo;
      ppr.fullMask = 0;
      ppr.fullOffset = [];
      ppr.fullFactor = [];
      ppr.modulus = p.modulus = new Bn(Math.pow(2, exponent));
      ppr.fullMask = 0 | -Math.pow(2, exponent % ppr.radix);
      for (let i = 0;i < coeff.length; i++) {
        ppr.offset[i] = Math.floor(coeff[i][0] / ppr.radix - tmp);
        ppr.fullOffset[i] = Math.floor(coeff[i][0] / ppr.radix) - mo + 1;
        ppr.factor[i] = coeff[i][1] * Math.pow(0.5, exponent - coeff[i][0] + ppr.offset[i] * ppr.radix);
        ppr.fullFactor[i] = coeff[i][1] * Math.pow(0.5, exponent - coeff[i][0] + ppr.fullOffset[i] * ppr.radix);
        ppr.modulus.addM(new Bn(Math.pow(2, coeff[i][0]) * coeff[i][1]));
        ppr.minOffset = Math.min(ppr.minOffset, -ppr.offset[i]);
      }
      ppr._class = p;
      ppr.modulus.cnormalize();
      ppr.reduce = function() {
        const limbs = this.limbs, off = this.offset, ol = this.offset.length, fac = this.factor;
        let i = this.minOffset, l, ll;
        while (limbs.length > mo) {
          l = limbs.pop();
          ll = limbs.length;
          for (let k = 0;k < ol; k++)
            limbs[ll + off[k]] -= fac[k] * l;
          i--;
          if (!i) {
            limbs.push(0);
            this.cnormalize();
            i = this.minOffset;
          }
        }
        this.cnormalize();
        return this;
      };
      ppr._strongReduce = ppr.fullMask === -1 ? ppr.reduce : function() {
        const limbs = this.limbs, i = limbs.length - 1;
        this.reduce();
        if (i === this.modOffset - 1) {
          const l = limbs[i] & this.fullMask;
          limbs[i] -= l;
          for (let k = 0;k < this.fullOffset.length; k++)
            limbs[i + this.fullOffset[k]] -= this.fullFactor[k] * l;
          this.normalize();
        }
      };
      ppr.fullReduce = function() {
        this._strongReduce();
        this.addM(this.modulus);
        this.addM(this.modulus);
        this.normalize();
        this._strongReduce();
        for (let i = this.limbs.length;i < this.modOffset; i++)
          this.limbs[i] = 0;
        const greater = this.greaterEquals(this.modulus);
        for (let i = 0;i < this.limbs.length; i++)
          this.limbs[i] -= this.modulus.limbs[i] * greater;
        this.cnormalize();
        return this;
      };
      ppr.inverse = function() {
        return this.power(this.modulus.sub(2));
      };
      p.fromBits = bn_class.fromBits;
      return p;
    };
    const sbp = bn_class.pseudoMersennePrime;
    bn_class.prime = {
      p127: sbp(127, [[0, -1]]),
      p25519: sbp(255, [[0, -19]]),
      p192k: sbp(192, [[32, -1], [12, -1], [8, -1], [7, -1], [6, -1], [3, -1], [0, -1]]),
      p224k: sbp(224, [[32, -1], [12, -1], [11, -1], [9, -1], [7, -1], [4, -1], [1, -1], [0, -1]]),
      p256k: sbp(256, [[32, -1], [9, -1], [8, -1], [7, -1], [6, -1], [4, -1], [0, -1]]),
      p192: sbp(192, [[0, -1], [64, -1]]),
      p224: sbp(224, [[0, 1], [96, -1]]),
      p256: sbp(256, [[0, -1], [96, 1], [192, 1], [224, -1]]),
      p384: sbp(384, [[0, -1], [32, 1], [96, -1], [128, -1]]),
      p521: sbp(521, [[0, -1]])
    };
    bn_class.random = function(modulus, paranoia) {
      if (typeof modulus !== "object")
        modulus = new Bn(modulus);
      const l = modulus.limbs.length, m = modulus.limbs[l - 1] + 1, out = new Bn;
      let words;
      while (!0) {
        do {
          words = random.words(l, paranoia);
          if (words[l - 1] < 0)
            words[l - 1] += 4294967296;
        } while (Math.floor(words[l - 1] / m) === Math.floor(4294967296 / m));
        words[l - 1] %= m;
        for (let i = 0;i < l - 1; i++)
          words[i] &= modulus.radixMask;
        out.limbs = words;
        if (!out.greaterEquals(modulus))
          return out;
      }
    };
    return bn_class;
  } });
    __register({ name: "hmac", dependencies: ["bitArray","utf8","sha256"], factory: function(bitArray, utf8, sha256) {
    const api = {};
    api.fn = function(key, Hash) {
      this._updated = !1;
      this._hash = Hash || sha256;
      if (typeof key === "string")
        key = bitArray.ui8_to_ba(utf8.toBytes(key));
      else if (key instanceof Uint8Array)
        key = bitArray.ui8_to_ba(key);
      const exKey = [[], []], bs = this._hash.fn.prototype.blockSize / 32;
      this._baseHash = [new this._hash.fn, new this._hash.fn];
      if (key.length > bs)
        key = this._hash.hash(key);
      const k = key;
      for (let i = 0;i < bs; i++) {
        exKey[0][i] = (k[i] | 0) ^ 909522486;
        exKey[1][i] = (k[i] | 0) ^ 1549556828;
      }
      this._baseHash[0].update(exKey[0]);
      this._baseHash[1].update(exKey[1]);
      this._resultHash = new this._hash.fn(this._baseHash[0]);
    };
    api.fn.prototype.encrypt = function(data) {
      if (this._updated) {
        console.warn("[crypto] INVALID: hmac: encrypt called on already-updated instance");
        return !1;
      }
      this.update(data);
      return this.digest();
    };
    api.fn.prototype.mac = api.fn.prototype.encrypt;
    api.fn.prototype.reset = function() {
      this._resultHash = new this._hash.fn(this._baseHash[0]);
      this._updated = !1;
    };
    api.fn.prototype.update = function(data) {
      this._updated = !0;
      this._resultHash.update(data);
      return this;
    };
    api.fn.prototype.digest = function() {
      const w = this._resultHash.finalize(), result = new this._hash.fn(this._baseHash[1]).update(w).finalize();
      this.reset();
      return result;
    };
    api.verify = function(key, data, tag, Hash) {
      const expected = new api.fn(key, Hash).encrypt(data);
      if (expected === !1)
        return !1;
      return bitArray.equal(expected, tag);
    };
    return api;
  } });
    __register({ name: "rsa", dependencies: ["bitArray","bn","random"], factory: function(bitArray, bn, random) {
    function _bytesToBn(bytes) {
      return bn.fromBits(bitArray.ui8_to_ba(bytes));
    }
    function _bnToBytes(num, len) {
      const bits = num.toBits(len * 8);
      return bitArray.ba_to_ui8(bits);
    }
    function _modByteLen(nBytes) {
      return nBytes.length;
    }
    function _rsaep(pub, m) {
      const n = _bytesToBn(pub.n), e = _bytesToBn(pub.e);
      return m.powermod(e, n);
    }
    function _rsadp(priv, c, opts) {
      const blinding = !(opts && opts.blinding === !1), n = _bytesToBn(priv.n);
      let cIn = c, rInv = null;
      if (blinding && priv.e) {
        const e = _bytesToBn(priv.e);
        let r, rInvMaybe, attempt = 0;
        while (attempt < 16) {
          r = bn.random(n, 6);
          if (r === !1) {
            rInv = null;
            cIn = c;
            break;
          }
          if (r.equals(0) || r.equals(1)) {
            attempt++;
            continue;
          }
          rInvMaybe = r.inverseMod(n);
          if (rInvMaybe === !1 || rInvMaybe === void 0) {
            attempt++;
            continue;
          }
          rInv = rInvMaybe;
          const rE = r.powermod(e, n);
          cIn = c.mul(rE).mod(n).normalize();
          break;
        }
        if (rInv === null) {
          console.warn("[crypto] WEAK: rsa: blinding disabled (random failure or gcd(r, n) \u2260 1) - falling back to unblinded decrypt");
          cIn = c;
        }
      }
      let m;
      if (priv.p && priv.q && priv.dp && priv.dq && priv.qInv) {
        const p = _bytesToBn(priv.p), q = _bytesToBn(priv.q), dp = _bytesToBn(priv.dp), dq = _bytesToBn(priv.dq), qInv = _bytesToBn(priv.qInv), m1 = cIn.mod(p).normalize().powermod(dp, p), m2 = cIn.mod(q).normalize().powermod(dq, q), m2ModP = m2.mod(p).normalize();
        let diff;
        if (m1.greaterEquals(m2ModP))
          diff = m1.sub(m2ModP).normalize();
        else
          diff = m1.add(p).sub(m2ModP).normalize();
        const h = diff.mul(qInv).mod(p).normalize();
        m = m2.add(q.mul(h)).mod(n).normalize();
      } else {
        const d = _bytesToBn(priv.d);
        m = cIn.powermod(d, n);
      }
      if (rInv !== null)
        m = m.mul(rInv).mod(n).normalize();
      return m;
    }
    function _mgf1(hashMod, seed, maskLen) {
      const out = new Uint8Array(maskLen), counter = new Uint8Array(4);
      let off = 0;
      for (let i = 0;off < maskLen; i++) {
        counter[0] = i >>> 24 & 255;
        counter[1] = i >>> 16 & 255;
        counter[2] = i >>> 8 & 255;
        counter[3] = i & 255;
        const concat = new Uint8Array(seed.length + 4);
        concat.set(seed, 0);
        concat.set(counter, seed.length);
        const h = bitArray.ba_to_ui8(hashMod.hash(bitArray.ui8_to_ba(concat))), take = Math.min(h.length, maskLen - off);
        out.set(h.subarray(0, take), off);
        off += take;
      }
      return out;
    }
    function _hashBytes(hashMod, msg) {
      return bitArray.ba_to_ui8(hashMod.hash(bitArray.ui8_to_ba(msg)));
    }
    function _xor(a, b) {
      const out = new Uint8Array(a.length);
      for (let i = 0;i < a.length; i++)
        out[i] = a[i] ^ b[i];
      return out;
    }
    function oaepEncrypt(pub, msg, hashMod, label, seed) {
      const k = _modByteLen(pub.n), lHash = _hashBytes(hashMod, label || new Uint8Array(0)), hLen = lHash.length;
      if (msg.length > k - 2 * hLen - 2) {
        console.warn("[crypto] INVALID: rsa: message too long for OAEP");
        return !1;
      }
      const psLen = k - msg.length - 2 * hLen - 2, db = new Uint8Array(k - hLen - 1);
      db.set(lHash, 0);
      db[hLen + psLen] = 1;
      db.set(msg, hLen + psLen + 1);
      const _seed = seed || random.bytes(hLen), dbMask = _mgf1(hashMod, _seed, k - hLen - 1), maskedDB = _xor(db, dbMask), seedMask = _mgf1(hashMod, maskedDB, hLen), maskedSeed = _xor(_seed, seedMask), em = new Uint8Array(k);
      em[0] = 0;
      em.set(maskedSeed, 1);
      em.set(maskedDB, 1 + hLen);
      const c = _rsaep(pub, _bytesToBn(em));
      return _bnToBytes(c, k);
    }
    function oaepDecrypt(priv, ct, hashMod, label) {
      const k = _modByteLen(priv.n), lHash = _hashBytes(hashMod, label || new Uint8Array(0)), hLen = lHash.length;
      if (ct.length !== k || k < 2 * hLen + 2) {
        console.warn("[crypto] INVALID: rsa: OAEP ciphertext length wrong");
        return !1;
      }
      const m = _rsadp(priv, _bytesToBn(ct)), em = _bnToBytes(m, k);
      let bad = em[0];
      const maskedSeed = em.subarray(1, 1 + hLen), maskedDB = em.subarray(1 + hLen), seedMask = _mgf1(hashMod, maskedDB, hLen), seed = _xor(maskedSeed, seedMask), dbMask = _mgf1(hashMod, seed, k - hLen - 1), db = _xor(maskedDB, dbMask);
      for (let i = 0;i < hLen; i++)
        bad |= db[i] ^ lHash[i];
      let found = 0, onePos = 0, badPad = 0;
      for (let i = hLen;i < db.length; i++) {
        const b = db[i], isOne = (b ^ 1) - 1 >>> 31, isZero = b - 1 >>> 31;
        onePos |= i & -(isOne & 1 - found | 0);
        found |= isOne;
        badPad |= 1 - found & 1 - isZero;
      }
      bad |= badPad | 1 - found;
      if (bad !== 0) {
        console.warn("[crypto] CORRUPT: rsa: OAEP decryption failed");
        return !1;
      }
      return new Uint8Array(db.subarray(onePos + 1));
    }
    function _pssEncode(mHash, emBits, hashMod, salt) {
      const hLen = mHash.length, emLen = emBits + 7 >>> 3, sLen = salt.length;
      if (emLen < hLen + sLen + 2) {
        console.warn("[crypto] INVALID: rsa: PSS encoding too short");
        return !1;
      }
      const mPrime = new Uint8Array(8 + hLen + sLen);
      mPrime.set(mHash, 8);
      mPrime.set(salt, 8 + hLen);
      const H = _hashBytes(hashMod, mPrime), db = new Uint8Array(emLen - hLen - 1);
      db[emLen - hLen - sLen - 2] = 1;
      db.set(salt, emLen - hLen - sLen - 1);
      const dbMask = _mgf1(hashMod, H, db.length), maskedDB = _xor(db, dbMask), clearBits = 8 * emLen - emBits;
      if (clearBits > 0)
        maskedDB[0] &= 255 >>> clearBits;
      const em = new Uint8Array(emLen);
      em.set(maskedDB, 0);
      em.set(H, emLen - hLen - 1);
      em[emLen - 1] = 188;
      return em;
    }
    function _pssVerify(mHash, em, emBits, hashMod, sLen) {
      const hLen = mHash.length, emLen = em.length;
      if (emLen < hLen + sLen + 2 || em[emLen - 1] !== 188)
        return !1;
      const maskedDB = new Uint8Array(em.subarray(0, emLen - hLen - 1)), H = em.subarray(emLen - hLen - 1, emLen - 1), clearBits = 8 * emLen - emBits;
      if (clearBits > 0 && (maskedDB[0] & (255 << 8 - clearBits & 255)) !== 0)
        return !1;
      const dbMask = _mgf1(hashMod, H, maskedDB.length), db = _xor(maskedDB, dbMask);
      if (clearBits > 0)
        db[0] &= 255 >>> clearBits;
      for (let i = 0;i < emLen - hLen - sLen - 2; i++)
        if (db[i] !== 0)
          return !1;
      if (db[emLen - hLen - sLen - 2] !== 1)
        return !1;
      const salt = db.subarray(db.length - sLen), mPrime = new Uint8Array(8 + hLen + sLen);
      mPrime.set(mHash, 8);
      mPrime.set(salt, 8 + hLen);
      const Hp = _hashBytes(hashMod, mPrime);
      let diff = 0;
      for (let i = 0;i < hLen; i++)
        diff |= H[i] ^ Hp[i];
      return diff === 0;
    }
    function pssSign(priv, msg, hashMod, sLen, salt) {
      const k = _modByteLen(priv.n), emBits = _bytesToBn(priv.n).bitLength() - 1, emLen = emBits + 7 >>> 3, mHash = _hashBytes(hashMod, msg);
      if (sLen === void 0)
        sLen = mHash.length;
      const _salt = salt || (sLen > 0 ? random.bytes(sLen) : new Uint8Array(0)), em = _pssEncode(mHash, emBits, hashMod, _salt);
      if (em === !1)
        return !1;
      let emPadded = em;
      if (emLen < k) {
        emPadded = new Uint8Array(k);
        emPadded.set(em, k - emLen);
      }
      const s = _rsadp(priv, _bytesToBn(emPadded));
      return _bnToBytes(s, k);
    }
    function pssVerify(pub, msg, sig, hashMod, sLen) {
      const k = _modByteLen(pub.n);
      if (sig.length !== k)
        return !1;
      const emBits = _bytesToBn(pub.n).bitLength() - 1, emLen = emBits + 7 >>> 3, m = _rsaep(pub, _bytesToBn(sig)), em = _bnToBytes(m, k).subarray(k - emLen), mHash = _hashBytes(hashMod, msg);
      if (sLen === void 0)
        sLen = mHash.length;
      return _pssVerify(mHash, em, emBits, hashMod, sLen);
    }
    return Object.defineProperty({
      oaepEncrypt,
      oaepDecrypt,
      pssSign,
      pssVerify
    }, Symbol.for("@awacloud/fw/internal"), {
      value: { rsaep: _rsaep, rsadp: _rsadp, mgf1: _mgf1 }
    });
  } });
    __register({ name: "ecc", dependencies: ["bitArray","hex","bn","sha256","sha384","sha512","hmac"], factory: function(bitArray, hex, bn, sha256, sha384, sha512, hmac) {
    const hashes = { 256: sha256, 384: sha384, 512: sha512 };
    function _hashForBits(bits) {
      if (bits <= 256)
        return sha256;
      if (bits <= 384)
        return sha384;
      return sha512;
    }
    function _concatBytes(parts) {
      let len = 0;
      for (let i = 0;i < parts.length; i++)
        len += parts[i].length;
      const out = new Uint8Array(len);
      let off = 0;
      for (let i = 0;i < parts.length; i++) {
        out.set(parts[i], off);
        off += parts[i].length;
      }
      return out;
    }
    function _hmacBytes(Hash, keyBytes, msgBytes) {
      const m = new hmac.fn(bitArray.ui8_to_ba(keyBytes), Hash);
      return bitArray.ba_to_ui8(m.encrypt(bitArray.ui8_to_ba(msgBytes)));
    }
    function _intToOctets(x, rolen) {
      const bits = x.toBits(rolen * 8), out = bitArray.ba_to_ui8(bits);
      if (out.length === rolen)
        return out;
      const padded = new Uint8Array(rolen);
      padded.set(out, rolen - out.length);
      return padded;
    }
    function _bitsToInt(bs, qlen) {
      const blen = bitArray.bitLength(bs);
      let truncated = bs;
      if (blen > qlen)
        truncated = bitArray.clamp(bs, qlen);
      return bn.fromBits(truncated);
    }
    function _bitsToOctets(bs, R, rolen, qlen) {
      const z1 = _bitsToInt(bs, qlen), z2 = z1.greaterEquals(R) ? z1.sub(R).normalize() : z1;
      return _intToOctets(z2, rolen);
    }
    function _trueBitLength(R) {
      const bytes = bitArray.ba_to_ui8(R.toBits());
      let i = 0;
      while (i < bytes.length && bytes[i] === 0)
        i++;
      if (i === bytes.length)
        return 0;
      let bits = (bytes.length - i) * 8, b = bytes[i];
      while ((b & 128) === 0) {
        bits--;
        b = b << 1 & 255;
      }
      return bits;
    }
    function _rfc6979K(hashBits, x, R, Hash) {
      const qlen = _trueBitLength(R), rolen = qlen + 7 >>> 3, xOct = _intToOctets(x, rolen), hOct = _bitsToOctets(hashBits, R, rolen, qlen), holen = bitArray.bitLength(Hash.hash([])) / 8;
      let V = new Uint8Array(holen).fill(1), K = new Uint8Array(holen);
      const z = new Uint8Array([0]), o = new Uint8Array([1]);
      K = _hmacBytes(Hash, K, _concatBytes([V, z, xOct, hOct]));
      V = _hmacBytes(Hash, K, V);
      K = _hmacBytes(Hash, K, _concatBytes([V, o, xOct, hOct]));
      V = _hmacBytes(Hash, K, V);
      for (;; ) {
        let T = new Uint8Array(0);
        while (T.length * 8 < qlen) {
          V = _hmacBytes(Hash, K, V);
          T = _concatBytes([T, V]);
        }
        const k = _bitsToInt(bitArray.ui8_to_ba(T), qlen);
        if (!k.equals(0) && !k.greaterEquals(R))
          return k;
        K = _hmacBytes(Hash, K, _concatBytes([V, z]));
        V = _hmacBytes(Hash, K, V);
      }
    }
    const ecc = {};
    ecc.point = function(curve, x, y) {
      if (x === void 0)
        this.isIdentity = !0;
      else {
        if (x instanceof bn.bn)
          x = new curve.field(x);
        if (y instanceof bn.bn)
          y = new curve.field(y);
        this.x = x;
        this.y = y;
        this.isIdentity = !1;
      }
      this.curve = curve;
    };
    ecc.point.prototype = {
      toJac() {
        return new ecc.pointJac(this.curve, this.x, this.y, new this.curve.field(1));
      },
      mult(k) {
        return this.toJac().mult(k, this).toAffine();
      },
      mult2(k, k2, affine2) {
        return this.toJac().mult2(k, this, k2, affine2).toAffine();
      },
      multiples() {
        if (this._multiples === void 0) {
          let j = this.toJac().doubl();
          const m = [j];
          for (let i = 3;i < 16; i++) {
            j = j.add(this);
            m.push(j);
          }
          this._multiples = [new ecc.point(this.curve), this].concat(ecc.pointJac.toAffineMultiple(m));
        }
        return this._multiples;
      },
      negate() {
        const newY = new this.curve.field(0).sub(this.y).normalize().reduce();
        return new ecc.point(this.curve, this.x, newY);
      },
      isValid() {
        return this.y.square().equals(this.curve.b.add(this.x.mul(this.curve.a.add(this.x.square()))));
      },
      toBits() {
        return bitArray.concat(this.x.toBits(), this.y.toBits());
      }
    };
    ecc.pointJac = function(curve, x, y, z) {
      if (x === void 0)
        this.isIdentity = !0;
      else {
        this.x = x;
        this.y = y;
        this.z = z;
        this.isIdentity = !1;
      }
      this.curve = curve;
    };
    ecc.pointJac.toAffineMultiple = function(points) {
      let i = 0, j, p, tmp, z, zi, zi2, curve;
      const ret = Array(points.length);
      for (;i < points.length; i++) {
        p = points[i];
        if (curve !== p.curve) {
          if (curve) {
            for (i = 0;i < points.length; i++)
              ret[i] = points[i].toAffine();
            return ret;
          }
          curve = p.curve;
        }
        if (!p.isIdentity && !p.z.equals(0))
          if (tmp) {
            tmp.push(z);
            z = z.mul(p.z);
          } else {
            z = p.z;
            tmp = [];
          }
      }
      if (tmp) {
        z = z.inverse();
        j = tmp.length - 1;
      }
      for (i--;i >= 0; i--) {
        p = points[i];
        if (p.isIdentity || p.z.equals(0))
          ret[i] = new ecc.point(p.curve);
        else {
          if (j >= 0) {
            zi = z.mul(tmp[j]);
            z = z.mul(p.z);
            j--;
          } else
            zi = z;
          zi2 = zi.square();
          ret[i] = new ecc.point(p.curve, p.x.mul(zi2).fullReduce(), p.y.mul(zi2.mul(zi)).fullReduce());
        }
      }
      return ret;
    };
    ecc.pointJac.prototype = {
      add(T) {
        const S = this;
        if (S.curve !== T.curve) {
          console.warn("[crypto] INVALID: ecc.add: points must be on the same curve");
          return !1;
        }
        if (S.isIdentity)
          return T.toJac();
        if (T.isIdentity)
          return S;
        const sz2 = S.z.square(), c = T.x.mul(sz2).subM(S.x);
        if (c.equals(0)) {
          if (S.y.equals(T.y.mul(sz2.mul(S.z))))
            return S.doubl();
          return new ecc.pointJac(S.curve);
        }
        const d = T.y.mul(sz2.mul(S.z)).subM(S.y), c2 = c.square(), x1 = d.square(), x2 = c.square().mul(c).addM(S.x.add(S.x).mul(c2)), x = x1.subM(x2), y1 = S.x.mul(c2).subM(x).mul(d), y2 = S.y.mul(c.square().mul(c)), y = y1.subM(y2), z = S.z.mul(c);
        return new ecc.pointJac(this.curve, x, y, z);
      },
      doubl() {
        if (this.isIdentity)
          return this;
        const y2 = this.y.square(), a = y2.mul(this.x.mul(4)), b = y2.square().mul(8), z2 = this.z.square(), c = this.curve.a.toHex() === new bn.bn(-3).toHex() ? this.x.sub(z2).mul(3).mul(this.x.add(z2)) : this.x.square().mul(3).add(z2.square().mul(this.curve.a)), x = c.square().subM(a).subM(a), y = a.sub(x).mul(c).subM(b), z = this.y.add(this.y).mul(this.z);
        return new ecc.pointJac(this.curve, x, y, z);
      },
      toAffine() {
        if (this.isIdentity || this.z.equals(0))
          return new ecc.point(this.curve);
        const zi = this.z.inverse(), zi2 = zi.square();
        return new ecc.point(this.curve, this.x.mul(zi2).fullReduce(), this.y.mul(zi2.mul(zi)).fullReduce());
      },
      mult(k, affine) {
        if (typeof k === "number")
          k = [k];
        else if (k.limbs !== void 0)
          k = k.normalize().limbs;
        let out = new ecc.point(this.curve).toJac();
        const multiples = affine.multiples();
        for (let i = k.length - 1;i >= 0; i--)
          for (let j = bn.bn.prototype.radix - 4;j >= 0; j -= 4)
            out = out.doubl().doubl().doubl().doubl().add(multiples[k[i] >> j & 15]);
        return out;
      },
      mult2(k1, affine, k2, affine2) {
        if (typeof k1 === "number")
          k1 = [k1];
        else if (k1.limbs !== void 0)
          k1 = k1.normalize().limbs;
        if (typeof k2 === "number")
          k2 = [k2];
        else if (k2.limbs !== void 0)
          k2 = k2.normalize().limbs;
        let out = new ecc.point(this.curve).toJac();
        const m1 = affine.multiples(), m2 = affine2.multiples();
        for (let i = Math.max(k1.length, k2.length) - 1;i >= 0; i--) {
          const l1 = k1[i] | 0, l2 = k2[i] | 0;
          for (let j = bn.bn.prototype.radix - 4;j >= 0; j -= 4)
            out = out.doubl().doubl().doubl().doubl().add(m1[l1 >> j & 15]).add(m2[l2 >> j & 15]);
        }
        return out;
      },
      negate() {
        return this.toAffine().negate().toJac();
      },
      isValid() {
        const z2 = this.z.square(), z4 = z2.square(), z6 = z4.mul(z2);
        return this.y.square().equals(this.curve.b.mul(z6).add(this.x.mul(this.curve.a.mul(z4).add(this.x.square()))));
      }
    };
    ecc.curve = function(Field, r, a, b, x, y) {
      this.field = Field;
      this.r = new bn.bn(r);
      this.a = new Field(a);
      this.b = new Field(b);
      this.G = new ecc.point(this, new Field(x), new Field(y));
    };
    ecc.curve.prototype.fromBits = function(bits) {
      const l = this.field.prototype.exponent + 7 & -8, p = new ecc.point(this, this.field.fromBits(bitArray.bitSlice(bits, 0, l)), this.field.fromBits(bitArray.bitSlice(bits, l, 2 * l)));
      if (!p.isValid()) {
        console.error("[crypto] CORRUPT: ecc: point not on the curve");
        return !1;
      }
      return p;
    };
    ecc.curves = {
      c192: new ecc.curve(bn.prime.p192, "0xffffffffffffffffffffffff99def836146bc9b1b4d22831", -3, "0x64210519e59c80e70fa7e9ab72243049feb8deecc146b9b1", "0x188da80eb03090f67cbf20eb43a18800f4ff0afd82ff1012", "0x07192b95ffc8da78631011ed6b24cdd573f977a11e794811"),
      c224: new ecc.curve(bn.prime.p224, "0xffffffffffffffffffffffffffff16a2e0b8f03e13dd29455c5c2a3d", -3, "0xb4050a850c04b3abf54132565044b0b7d7bfd8ba270b39432355ffb4", "0xb70e0cbd6bb4bf7f321390b94a03c1d356c21122343280d6115c1d21", "0xbd376388b5f723fb4c22dfe6cd4375a05a07476444d5819985007e34"),
      c256: new ecc.curve(bn.prime.p256, "0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551", -3, "0x5ac635d8aa3a93e7b3ebbd55769886bc651d06b0cc53b0f63bce3c3e27d2604b", "0x6b17d1f2e12c4247f8bce6e563a440f277037d812deb33a0f4a13945d898c296", "0x4fe342e2fe1a7f9b8ee7eb4a7c0f9e162bce33576b315ececbb6406837bf51f5"),
      c384: new ecc.curve(bn.prime.p384, "0xffffffffffffffffffffffffffffffffffffffffffffffffc7634d81f4372ddf581a0db248b0a77aecec196accc52973", -3, "0xb3312fa7e23ee7e4988e056be3f82d19181d9c6efe8141120314088f5013875ac656398d8a2ed19d2a85c8edd3ec2aef", "0xaa87ca22be8b05378eb1c71ef320ad746e1d3b628ba79b9859f741e082542a385502f25dbf55296c3a545e3872760ab7", "0x3617de4a96262c6f5d9e98bf9292dc29f8f41dbd289a147ce9da3113b5f0b8c00a60b1ce1d7e819d7a431d7c90ea0e5f"),
      c521: new ecc.curve(bn.prime.p521, "0x1FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFA51868783BF2F966B7FCC0148F709A5D03BB5C9B8899C47AEBB6FB71E91386409", -3, "0x051953EB9618E1C9A1F929A21A0B68540EEA2DA725B99B315F3B8B489918EF109E156193951EC7E937B1652C0BD3BB1BF073573DF883D2C34F1EF451FD46B503F00", "0xC6858E06B70404E9CD9E3ECB662395B4429C648139053FB521F828AF606B4D3DBAA14B5E77EFE75928FE1DC127A2FFA8DE3348B3C1856A429BF97E7E31C2E5BD66", "0x11839296A789A3BC0045C8A5FB42C7D1BD998F54449579B446817AFBD17273E662C97EE72995EF42640C550B9013FAD0761353C7086A272C24088BE94769FD16650"),
      k192: new ecc.curve(bn.prime.p192k, "0xfffffffffffffffffffffffe26f2fc170f69466a74defd8d", 0, 3, "0xdb4ff10ec057e9ae26b07d0280b7f4341da5d1b1eae06c7d", "0x9b2f2f6d9c5628a7844163d015be86344082aa88d95e2f9d"),
      k224: new ecc.curve(bn.prime.p224k, "0x010000000000000000000000000001dce8d2ec6184caf0a971769fb1f7", 0, 5, "0xa1455b334df099df30fc28a169a467e9e47075a90f7e650eb6b7a45c", "0x7e089fed7fba344282cafbd6f7e319f7c0b0bd59e2ca4bdb556d61a5"),
      k256: new ecc.curve(bn.prime.p256k, "0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141", 0, 7, "0x79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798", "0x483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8")
    };
    ecc.curveName = function(curve) {
      for (const name in ecc.curves)
        if (Object.prototype.hasOwnProperty.call(ecc.curves, name) && ecc.curves[name] === curve)
          return name;
      console.warn("[crypto] INVALID: ecc: no such curve");
      return !1;
    };
    function _coordsInRange(bits, curve) {
      const halfBits = curve.field.prototype.exponent + 7 & -8, xBn = bn.fromBits(bitArray.bitSlice(bits, 0, halfBits)), yBn = bn.fromBits(bitArray.bitSlice(bits, halfBits, 2 * halfBits)), p = curve.field.modulus;
      return !xBn.greaterEquals(p) && !yBn.greaterEquals(p);
    }
    function _isInSubgroup(point, curve) {
      if (!point || point === !1)
        return !1;
      if (point.isIdentity)
        return !1;
      if (!point.isValid())
        return !1;
      const result = point.mult(curve.r);
      return !!result && result.isIdentity;
    }
    ecc.deserialize = function(key) {
      const types = ["elGamal", "ecdsa"];
      if (!key || !key.curve || !ecc.curves[key.curve]) {
        console.warn("[crypto] INVALID: ecc: invalid serialization");
        return !1;
      }
      if (types.indexOf(key.type) === -1) {
        console.warn("[crypto] INVALID: ecc: invalid type");
        return !1;
      }
      const curve = ecc.curves[key.curve];
      if (key.secretKey) {
        if (!key.exponent) {
          console.warn("[crypto] INVALID: ecc: invalid exponent");
          return !1;
        }
        const exponent = new bn.bn(key.exponent);
        return new ecc[key.type].secretKey(curve, exponent);
      }
      if (!key.point) {
        console.warn("[crypto] INVALID: ecc: invalid point");
        return !1;
      }
      const ptBits = bitArray.ui8_to_ba(hex.toBytes(key.point));
      if (!_coordsInRange(ptBits, curve)) {
        console.warn("[crypto] INVALID: ecc: x or y coordinate out of field range");
        return !1;
      }
      const point = curve.fromBits(ptBits);
      if (point === !1)
        return !1;
      if (!_isInSubgroup(point, curve)) {
        console.warn("[crypto] INVALID: ecc: public key not in the main subgroup (n\xB7Q != O)");
        return !1;
      }
      return new ecc[key.type].publicKey(curve, point);
    };
    ecc.basicKey = {
      publicKey: function(curve, point) {
        this._curve = curve;
        this._curveBitLength = curve.r.bitLength();
        if (point instanceof Array)
          this._point = curve.fromBits(point);
        else
          this._point = point;
        this.serialize = function() {
          const curveName = ecc.curveName(curve);
          return {
            type: this.getType(),
            secretKey: !1,
            point: hex.fromBytes(bitArray.ba_to_ui8(this._point.toBits())),
            curve: curveName
          };
        };
        this.get = function() {
          const pointbits = this._point.toBits(), len = bitArray.bitLength(pointbits), x = bitArray.bitSlice(pointbits, 0, len / 2), y = bitArray.bitSlice(pointbits, len / 2);
          return { x, y };
        };
      },
      secretKey: function(curve, exponent) {
        this._curve = curve;
        this._curveBitLength = curve.r.bitLength();
        this._exponent = exponent;
        this.serialize = function() {
          const exp = this.get(), curveName = ecc.curveName(curve);
          return {
            type: this.getType(),
            secretKey: !0,
            exponent: hex.fromBytes(bitArray.ba_to_ui8(exp)),
            curve: curveName
          };
        };
        this.get = function() {
          return this._exponent.toBits();
        };
      }
    };
    ecc.basicKey.generateKeys = function(cn) {
      return function generateKeys(curve, paranoia, sec) {
        curve = curve || 256;
        if (typeof curve === "number") {
          curve = ecc.curves["c" + curve];
          if (curve === void 0) {
            console.warn("[crypto] INVALID: ecc: no such curve");
            return !1;
          }
        }
        sec = sec || bn.random(curve.r, paranoia);
        const pub = curve.G.mult(sec);
        return {
          pub: new ecc[cn].publicKey(curve, pub),
          sec: new ecc[cn].secretKey(curve, sec)
        };
      };
    };
    ecc.elGamal = {
      generateKeys: ecc.basicKey.generateKeys("elGamal"),
      publicKey: function(curve, point) {
        ecc.basicKey.publicKey.apply(this, arguments);
      },
      secretKey: function(curve, exponent) {
        ecc.basicKey.secretKey.apply(this, arguments);
      }
    };
    ecc.elGamal.publicKey.prototype = {
      kem(paranoia, bits = 256) {
        const sec = bn.random(this._curve.r, paranoia), tag = this._curve.G.mult(sec).toBits();
        return { key: (hashes[bits] || sha256).hash(this._point.mult(sec).toBits()), tag };
      },
      getType() {
        return "elGamal";
      }
    };
    ecc.elGamal.secretKey.prototype = {
      unkem(tag, bits = 256) {
        return (hashes[bits] || sha256).hash(this._curve.fromBits(tag).mult(this._exponent).toBits());
      },
      dh(pk, bits = 256) {
        return (hashes[bits] || sha256).hash(pk._point.mult(this._exponent).toBits());
      },
      dhJavaEc(pk) {
        return pk._point.mult(this._exponent).x.toBits();
      },
      getType() {
        return "elGamal";
      }
    };
    ecc.ecdsa = {
      generateKeys: ecc.basicKey.generateKeys("ecdsa")
    };
    ecc.ecdsa.publicKey = function(curve, point) {
      ecc.basicKey.publicKey.apply(this, arguments);
    };
    ecc.ecdsa.publicKey.prototype = {
      verify(hash, rs, optsOrLegacy) {
        let opts = null, fakeLegacyVersion;
        if (optsOrLegacy && typeof optsOrLegacy === "object") {
          opts = optsOrLegacy;
          fakeLegacyVersion = !!opts.fakeLegacyVersion;
        } else
          fakeLegacyVersion = !!optsOrLegacy;
        const strict = !!(opts && opts.strict);
        if (bitArray.bitLength(hash) > this._curveBitLength)
          hash = bitArray.clamp(hash, this._curveBitLength);
        const R = this._curve.r, l = this._curveBitLength, r = bn.fromBits(bitArray.bitSlice(rs, 0, l)), ss = bn.fromBits(bitArray.bitSlice(rs, l, 2 * l)), s = fakeLegacyVersion ? ss : ss.inverseMod(R), hG = bn.fromBits(hash).mul(s).mod(R), hA = r.mul(s).mod(R), r2 = this._curve.G.mult2(hG, hA, this._point).x;
        if (r.equals(0) || ss.equals(0) || r.greaterEquals(R) || ss.greaterEquals(R) || !r2.equals(r)) {
          console.warn("[crypto] CORRUPT: ecdsa: signature did not verify");
          return !1;
        }
        if (strict) {
          const upperBoundExcl = R.copy().halveM().add(new bn.bn(1));
          if (ss.greaterEquals(upperBoundExcl)) {
            console.warn("[crypto] CORRUPT: ecdsa: signature is malleable (s > n/2) under strict mode");
            return !1;
          }
        }
        return !0;
      },
      getType() {
        return "ecdsa";
      }
    };
    ecc.ecdsa.secretKey = function(curve, exponent) {
      ecc.basicKey.secretKey.apply(this, arguments);
    };
    ecc.ecdsa.secretKey.prototype = {
      sign(hash, paranoia, fakeLegacyVersion, fixedKForTesting) {
        let opts = null;
        if (paranoia && typeof paranoia === "object") {
          opts = paranoia;
          paranoia = opts.paranoia;
          fakeLegacyVersion = opts.fakeLegacyVersion;
          fixedKForTesting = opts.fixedKForTesting;
        }
        const deterministic = opts ? opts.deterministic !== !1 : !0, hashForK = opts ? opts.hashForK : null, strict = !!(opts && opts.strict);
        if (bitArray.bitLength(hash) > this._curveBitLength)
          hash = bitArray.clamp(hash, this._curveBitLength);
        const R = this._curve.r, l = R.bitLength();
        let k;
        if (fixedKForTesting)
          k = fixedKForTesting;
        else if (deterministic) {
          const Hash = hashForK || _hashForBits(this._curveBitLength);
          k = _rfc6979K(hash, this._exponent, R, Hash);
        } else
          k = bn.random(R.sub(1), paranoia).add(1);
        const r = this._curve.G.mult(k).x.mod(R), ss = bn.fromBits(hash).add(r.mul(this._exponent));
        let s = fakeLegacyVersion ? ss.inverseMod(R).mul(k).mod(R) : ss.mul(k.inverseMod(R)).mod(R);
        if (strict) {
          const upperBoundExcl = R.copy().halveM().add(new bn.bn(1));
          if (s.greaterEquals(upperBoundExcl))
            s = R.sub(s).normalize();
        }
        return bitArray.concat(r.toBits(l), s.toBits(l));
      },
      getType() {
        return "ecdsa";
      }
    };
    Object.defineProperty(ecc, Symbol.for("@awacloud/fw/internal"), { value: {
      coordsInRange: _coordsInRange,
      isInSubgroup: _isInSubgroup,
      isValidPublicKey(curveName, pointHex) {
        const curve = ecc.curves[curveName];
        if (!curve)
          return !1;
        const bits = bitArray.ui8_to_ba(hex.toBytes(pointHex));
        if (!_coordsInRange(bits, curve))
          return !1;
        const point = curve.fromBits(bits);
        if (point === !1)
          return !1;
        return _isInSubgroup(point, curve);
      }
    } });
    return ecc;
  } });
    __register({ name: "ed25519", dependencies: ["sha512","bitArray"], factory: function(sha512, bitArray) {
    function _gf(init) {
      const r = new Float64Array(16);
      if (init)
        for (let i = 0;i < init.length; i++)
          r[i] = init[i];
      return r;
    }
    const _gf0 = _gf(), _gf1 = _gf([1]), _D = _gf([
      30883,
      4953,
      19914,
      30187,
      55467,
      16705,
      2637,
      112,
      59544,
      30585,
      16505,
      36039,
      65139,
      11119,
      27886,
      20995
    ]), _D2 = _gf([
      61785,
      9906,
      39828,
      60374,
      45398,
      33411,
      5274,
      224,
      53552,
      61171,
      33010,
      6542,
      64743,
      22239,
      55772,
      9222
    ]), _X = _gf([
      54554,
      36645,
      11616,
      51542,
      42930,
      38181,
      51040,
      26924,
      56412,
      64982,
      57905,
      49316,
      21502,
      52590,
      14035,
      8553
    ]), _Y = _gf([
      26200,
      26214,
      26214,
      26214,
      26214,
      26214,
      26214,
      26214,
      26214,
      26214,
      26214,
      26214,
      26214,
      26214,
      26214,
      26214
    ]), _I = _gf([
      41136,
      18958,
      6951,
      50414,
      58488,
      44335,
      6150,
      12099,
      55207,
      15867,
      153,
      11085,
      57099,
      20417,
      9344,
      11139
    ]);
    function _car25519(o) {
      for (let i = 0;i < 16; i++) {
        o[i] += 65536;
        const c = Math.floor(o[i] / 65536);
        o[(i + 1) * (i < 15 ? 1 : 0)] += c - 1 + 37 * (c - 1) * (i === 15 ? 1 : 0);
        o[i] -= c * 65536;
      }
    }
    function _sel25519(p, q, b) {
      const c = ~(b - 1);
      for (let i = 0;i < 16; i++) {
        const t = c & (p[i] ^ q[i]);
        p[i] ^= t;
        q[i] ^= t;
      }
    }
    function _pack25519(o, n) {
      const m = _gf(), t = _gf();
      for (let i = 0;i < 16; i++)
        t[i] = n[i];
      _car25519(t);
      _car25519(t);
      _car25519(t);
      for (let j = 0;j < 2; j++) {
        m[0] = t[0] - 65517;
        for (let i = 1;i < 15; i++) {
          m[i] = t[i] - 65535 - (m[i - 1] >> 16 & 1);
          m[i - 1] &= 65535;
        }
        m[15] = t[15] - 32767 - (m[14] >> 16 & 1);
        const b = m[15] >> 16 & 1;
        m[14] &= 65535;
        _sel25519(t, m, 1 - b);
      }
      for (let i = 0;i < 16; i++) {
        o[2 * i] = t[i] & 255;
        o[2 * i + 1] = t[i] >> 8;
      }
    }
    function _neq25519(a, b) {
      const c = new Uint8Array(32), d = new Uint8Array(32);
      _pack25519(c, a);
      _pack25519(d, b);
      let r = 0;
      for (let i = 0;i < 32; i++)
        r |= c[i] ^ d[i];
      return (1 & r - 1 >>> 8) - 1;
    }
    function _par25519(a) {
      const d = new Uint8Array(32);
      _pack25519(d, a);
      return d[0] & 1;
    }
    function _unpack25519(o, n) {
      for (let i = 0;i < 16; i++)
        o[i] = n[2 * i] + (n[2 * i + 1] << 8);
      o[15] &= 32767;
    }
    function _A(o, a, b) {
      for (let i = 0;i < 16; i++)
        o[i] = a[i] + b[i];
    }
    function _Z(o, a, b) {
      for (let i = 0;i < 16; i++)
        o[i] = a[i] - b[i];
    }
    function _M(o, a, b) {
      const a0 = a[0], a1 = a[1], a2 = a[2], a3 = a[3], a4 = a[4], a5 = a[5], a6 = a[6], a7 = a[7], a8 = a[8], a9 = a[9], a10 = a[10], a11 = a[11], a12 = a[12], a13 = a[13], a14 = a[14], a15 = a[15], b0 = b[0], b1 = b[1], b2 = b[2], b3 = b[3], b4 = b[4], b5 = b[5], b6 = b[6], b7 = b[7], b8 = b[8], b9 = b[9], b10 = b[10], b11 = b[11], b12 = b[12], b13 = b[13], b14 = b[14], b15 = b[15];
      let t0 = a0 * b0, t1 = a0 * b1 + a1 * b0, t2 = a0 * b2 + a1 * b1 + a2 * b0, t3 = a0 * b3 + a1 * b2 + a2 * b1 + a3 * b0, t4 = a0 * b4 + a1 * b3 + a2 * b2 + a3 * b1 + a4 * b0, t5 = a0 * b5 + a1 * b4 + a2 * b3 + a3 * b2 + a4 * b1 + a5 * b0, t6 = a0 * b6 + a1 * b5 + a2 * b4 + a3 * b3 + a4 * b2 + a5 * b1 + a6 * b0, t7 = a0 * b7 + a1 * b6 + a2 * b5 + a3 * b4 + a4 * b3 + a5 * b2 + a6 * b1 + a7 * b0, t8 = a0 * b8 + a1 * b7 + a2 * b6 + a3 * b5 + a4 * b4 + a5 * b3 + a6 * b2 + a7 * b1 + a8 * b0, t9 = a0 * b9 + a1 * b8 + a2 * b7 + a3 * b6 + a4 * b5 + a5 * b4 + a6 * b3 + a7 * b2 + a8 * b1 + a9 * b0, t10 = a0 * b10 + a1 * b9 + a2 * b8 + a3 * b7 + a4 * b6 + a5 * b5 + a6 * b4 + a7 * b3 + a8 * b2 + a9 * b1 + a10 * b0, t11 = a0 * b11 + a1 * b10 + a2 * b9 + a3 * b8 + a4 * b7 + a5 * b6 + a6 * b5 + a7 * b4 + a8 * b3 + a9 * b2 + a10 * b1 + a11 * b0, t12 = a0 * b12 + a1 * b11 + a2 * b10 + a3 * b9 + a4 * b8 + a5 * b7 + a6 * b6 + a7 * b5 + a8 * b4 + a9 * b3 + a10 * b2 + a11 * b1 + a12 * b0, t13 = a0 * b13 + a1 * b12 + a2 * b11 + a3 * b10 + a4 * b9 + a5 * b8 + a6 * b7 + a7 * b6 + a8 * b5 + a9 * b4 + a10 * b3 + a11 * b2 + a12 * b1 + a13 * b0, t14 = a0 * b14 + a1 * b13 + a2 * b12 + a3 * b11 + a4 * b10 + a5 * b9 + a6 * b8 + a7 * b7 + a8 * b6 + a9 * b5 + a10 * b4 + a11 * b3 + a12 * b2 + a13 * b1 + a14 * b0, t15 = a0 * b15 + a1 * b14 + a2 * b13 + a3 * b12 + a4 * b11 + a5 * b10 + a6 * b9 + a7 * b8 + a8 * b7 + a9 * b6 + a10 * b5 + a11 * b4 + a12 * b3 + a13 * b2 + a14 * b1 + a15 * b0, t16 = a1 * b15 + a2 * b14 + a3 * b13 + a4 * b12 + a5 * b11 + a6 * b10 + a7 * b9 + a8 * b8 + a9 * b7 + a10 * b6 + a11 * b5 + a12 * b4 + a13 * b3 + a14 * b2 + a15 * b1, t17 = a2 * b15 + a3 * b14 + a4 * b13 + a5 * b12 + a6 * b11 + a7 * b10 + a8 * b9 + a9 * b8 + a10 * b7 + a11 * b6 + a12 * b5 + a13 * b4 + a14 * b3 + a15 * b2, t18 = a3 * b15 + a4 * b14 + a5 * b13 + a6 * b12 + a7 * b11 + a8 * b10 + a9 * b9 + a10 * b8 + a11 * b7 + a12 * b6 + a13 * b5 + a14 * b4 + a15 * b3, t19 = a4 * b15 + a5 * b14 + a6 * b13 + a7 * b12 + a8 * b11 + a9 * b10 + a10 * b9 + a11 * b8 + a12 * b7 + a13 * b6 + a14 * b5 + a15 * b4, t20 = a5 * b15 + a6 * b14 + a7 * b13 + a8 * b12 + a9 * b11 + a10 * b10 + a11 * b9 + a12 * b8 + a13 * b7 + a14 * b6 + a15 * b5, t21 = a6 * b15 + a7 * b14 + a8 * b13 + a9 * b12 + a10 * b11 + a11 * b10 + a12 * b9 + a13 * b8 + a14 * b7 + a15 * b6, t22 = a7 * b15 + a8 * b14 + a9 * b13 + a10 * b12 + a11 * b11 + a12 * b10 + a13 * b9 + a14 * b8 + a15 * b7, t23 = a8 * b15 + a9 * b14 + a10 * b13 + a11 * b12 + a12 * b11 + a13 * b10 + a14 * b9 + a15 * b8, t24 = a9 * b15 + a10 * b14 + a11 * b13 + a12 * b12 + a13 * b11 + a14 * b10 + a15 * b9, t25 = a10 * b15 + a11 * b14 + a12 * b13 + a13 * b12 + a14 * b11 + a15 * b10, t26 = a11 * b15 + a12 * b14 + a13 * b13 + a14 * b12 + a15 * b11, t27 = a12 * b15 + a13 * b14 + a14 * b13 + a15 * b12, t28 = a13 * b15 + a14 * b14 + a15 * b13, t29 = a14 * b15 + a15 * b14, t30 = a15 * b15;
      t0 += 38 * t16;
      t1 += 38 * t17;
      t2 += 38 * t18;
      t3 += 38 * t19;
      t4 += 38 * t20;
      t5 += 38 * t21;
      t6 += 38 * t22;
      t7 += 38 * t23;
      t8 += 38 * t24;
      t9 += 38 * t25;
      t10 += 38 * t26;
      t11 += 38 * t27;
      t12 += 38 * t28;
      t13 += 38 * t29;
      t14 += 38 * t30;
      let c = 0, v;
      v = t0 + c;
      c = Math.floor(v / 65536);
      t0 = v - c * 65536;
      v = t1 + c;
      c = Math.floor(v / 65536);
      t1 = v - c * 65536;
      v = t2 + c;
      c = Math.floor(v / 65536);
      t2 = v - c * 65536;
      v = t3 + c;
      c = Math.floor(v / 65536);
      t3 = v - c * 65536;
      v = t4 + c;
      c = Math.floor(v / 65536);
      t4 = v - c * 65536;
      v = t5 + c;
      c = Math.floor(v / 65536);
      t5 = v - c * 65536;
      v = t6 + c;
      c = Math.floor(v / 65536);
      t6 = v - c * 65536;
      v = t7 + c;
      c = Math.floor(v / 65536);
      t7 = v - c * 65536;
      v = t8 + c;
      c = Math.floor(v / 65536);
      t8 = v - c * 65536;
      v = t9 + c;
      c = Math.floor(v / 65536);
      t9 = v - c * 65536;
      v = t10 + c;
      c = Math.floor(v / 65536);
      t10 = v - c * 65536;
      v = t11 + c;
      c = Math.floor(v / 65536);
      t11 = v - c * 65536;
      v = t12 + c;
      c = Math.floor(v / 65536);
      t12 = v - c * 65536;
      v = t13 + c;
      c = Math.floor(v / 65536);
      t13 = v - c * 65536;
      v = t14 + c;
      c = Math.floor(v / 65536);
      t14 = v - c * 65536;
      v = t15 + c;
      c = Math.floor(v / 65536);
      t15 = v - c * 65536;
      t0 += 38 * c;
      c = 0;
      v = t0 + c;
      c = Math.floor(v / 65536);
      t0 = v - c * 65536;
      v = t1 + c;
      c = Math.floor(v / 65536);
      t1 = v - c * 65536;
      v = t2 + c;
      c = Math.floor(v / 65536);
      t2 = v - c * 65536;
      v = t3 + c;
      c = Math.floor(v / 65536);
      t3 = v - c * 65536;
      v = t4 + c;
      c = Math.floor(v / 65536);
      t4 = v - c * 65536;
      v = t5 + c;
      c = Math.floor(v / 65536);
      t5 = v - c * 65536;
      v = t6 + c;
      c = Math.floor(v / 65536);
      t6 = v - c * 65536;
      v = t7 + c;
      c = Math.floor(v / 65536);
      t7 = v - c * 65536;
      v = t8 + c;
      c = Math.floor(v / 65536);
      t8 = v - c * 65536;
      v = t9 + c;
      c = Math.floor(v / 65536);
      t9 = v - c * 65536;
      v = t10 + c;
      c = Math.floor(v / 65536);
      t10 = v - c * 65536;
      v = t11 + c;
      c = Math.floor(v / 65536);
      t11 = v - c * 65536;
      v = t12 + c;
      c = Math.floor(v / 65536);
      t12 = v - c * 65536;
      v = t13 + c;
      c = Math.floor(v / 65536);
      t13 = v - c * 65536;
      v = t14 + c;
      c = Math.floor(v / 65536);
      t14 = v - c * 65536;
      v = t15 + c;
      c = Math.floor(v / 65536);
      t15 = v - c * 65536;
      t0 += 38 * c;
      o[0] = t0;
      o[1] = t1;
      o[2] = t2;
      o[3] = t3;
      o[4] = t4;
      o[5] = t5;
      o[6] = t6;
      o[7] = t7;
      o[8] = t8;
      o[9] = t9;
      o[10] = t10;
      o[11] = t11;
      o[12] = t12;
      o[13] = t13;
      o[14] = t14;
      o[15] = t15;
    }
    function _S(o, a) {
      const a0 = a[0], a1 = a[1], a2 = a[2], a3 = a[3], a4 = a[4], a5 = a[5], a6 = a[6], a7 = a[7], a8 = a[8], a9 = a[9], a10 = a[10], a11 = a[11], a12 = a[12], a13 = a[13], a14 = a[14], a15 = a[15], d0 = 2 * a0, d1 = 2 * a1, d2 = 2 * a2, d3 = 2 * a3, d4 = 2 * a4, d5 = 2 * a5, d6 = 2 * a6, d7 = 2 * a7, d8 = 2 * a8, d9 = 2 * a9, d10 = 2 * a10, d11 = 2 * a11, d12 = 2 * a12, d13 = 2 * a13, d14 = 2 * a14;
      let t0 = a0 * a0, t1 = d0 * a1, t2 = d0 * a2 + a1 * a1, t3 = d0 * a3 + d1 * a2, t4 = d0 * a4 + d1 * a3 + a2 * a2, t5 = d0 * a5 + d1 * a4 + d2 * a3, t6 = d0 * a6 + d1 * a5 + d2 * a4 + a3 * a3, t7 = d0 * a7 + d1 * a6 + d2 * a5 + d3 * a4, t8 = d0 * a8 + d1 * a7 + d2 * a6 + d3 * a5 + a4 * a4, t9 = d0 * a9 + d1 * a8 + d2 * a7 + d3 * a6 + d4 * a5, t10 = d0 * a10 + d1 * a9 + d2 * a8 + d3 * a7 + d4 * a6 + a5 * a5, t11 = d0 * a11 + d1 * a10 + d2 * a9 + d3 * a8 + d4 * a7 + d5 * a6, t12 = d0 * a12 + d1 * a11 + d2 * a10 + d3 * a9 + d4 * a8 + d5 * a7 + a6 * a6, t13 = d0 * a13 + d1 * a12 + d2 * a11 + d3 * a10 + d4 * a9 + d5 * a8 + d6 * a7, t14 = d0 * a14 + d1 * a13 + d2 * a12 + d3 * a11 + d4 * a10 + d5 * a9 + d6 * a8 + a7 * a7, t15 = d0 * a15 + d1 * a14 + d2 * a13 + d3 * a12 + d4 * a11 + d5 * a10 + d6 * a9 + d7 * a8, t16 = d1 * a15 + d2 * a14 + d3 * a13 + d4 * a12 + d5 * a11 + d6 * a10 + d7 * a9 + a8 * a8, t17 = d2 * a15 + d3 * a14 + d4 * a13 + d5 * a12 + d6 * a11 + d7 * a10 + d8 * a9, t18 = d3 * a15 + d4 * a14 + d5 * a13 + d6 * a12 + d7 * a11 + d8 * a10 + a9 * a9, t19 = d4 * a15 + d5 * a14 + d6 * a13 + d7 * a12 + d8 * a11 + d9 * a10, t20 = d5 * a15 + d6 * a14 + d7 * a13 + d8 * a12 + d9 * a11 + a10 * a10, t21 = d6 * a15 + d7 * a14 + d8 * a13 + d9 * a12 + d10 * a11, t22 = d7 * a15 + d8 * a14 + d9 * a13 + d10 * a12 + a11 * a11, t23 = d8 * a15 + d9 * a14 + d10 * a13 + d11 * a12, t24 = d9 * a15 + d10 * a14 + d11 * a13 + a12 * a12, t25 = d10 * a15 + d11 * a14 + d12 * a13, t26 = d11 * a15 + d12 * a14 + a13 * a13, t27 = d12 * a15 + d13 * a14, t28 = d13 * a15 + a14 * a14, t29 = d14 * a15, t30 = a15 * a15;
      t0 += 38 * t16;
      t1 += 38 * t17;
      t2 += 38 * t18;
      t3 += 38 * t19;
      t4 += 38 * t20;
      t5 += 38 * t21;
      t6 += 38 * t22;
      t7 += 38 * t23;
      t8 += 38 * t24;
      t9 += 38 * t25;
      t10 += 38 * t26;
      t11 += 38 * t27;
      t12 += 38 * t28;
      t13 += 38 * t29;
      t14 += 38 * t30;
      let c = 0, v;
      v = t0 + c;
      c = Math.floor(v / 65536);
      t0 = v - c * 65536;
      v = t1 + c;
      c = Math.floor(v / 65536);
      t1 = v - c * 65536;
      v = t2 + c;
      c = Math.floor(v / 65536);
      t2 = v - c * 65536;
      v = t3 + c;
      c = Math.floor(v / 65536);
      t3 = v - c * 65536;
      v = t4 + c;
      c = Math.floor(v / 65536);
      t4 = v - c * 65536;
      v = t5 + c;
      c = Math.floor(v / 65536);
      t5 = v - c * 65536;
      v = t6 + c;
      c = Math.floor(v / 65536);
      t6 = v - c * 65536;
      v = t7 + c;
      c = Math.floor(v / 65536);
      t7 = v - c * 65536;
      v = t8 + c;
      c = Math.floor(v / 65536);
      t8 = v - c * 65536;
      v = t9 + c;
      c = Math.floor(v / 65536);
      t9 = v - c * 65536;
      v = t10 + c;
      c = Math.floor(v / 65536);
      t10 = v - c * 65536;
      v = t11 + c;
      c = Math.floor(v / 65536);
      t11 = v - c * 65536;
      v = t12 + c;
      c = Math.floor(v / 65536);
      t12 = v - c * 65536;
      v = t13 + c;
      c = Math.floor(v / 65536);
      t13 = v - c * 65536;
      v = t14 + c;
      c = Math.floor(v / 65536);
      t14 = v - c * 65536;
      v = t15 + c;
      c = Math.floor(v / 65536);
      t15 = v - c * 65536;
      t0 += 38 * c;
      c = 0;
      v = t0 + c;
      c = Math.floor(v / 65536);
      t0 = v - c * 65536;
      v = t1 + c;
      c = Math.floor(v / 65536);
      t1 = v - c * 65536;
      v = t2 + c;
      c = Math.floor(v / 65536);
      t2 = v - c * 65536;
      v = t3 + c;
      c = Math.floor(v / 65536);
      t3 = v - c * 65536;
      v = t4 + c;
      c = Math.floor(v / 65536);
      t4 = v - c * 65536;
      v = t5 + c;
      c = Math.floor(v / 65536);
      t5 = v - c * 65536;
      v = t6 + c;
      c = Math.floor(v / 65536);
      t6 = v - c * 65536;
      v = t7 + c;
      c = Math.floor(v / 65536);
      t7 = v - c * 65536;
      v = t8 + c;
      c = Math.floor(v / 65536);
      t8 = v - c * 65536;
      v = t9 + c;
      c = Math.floor(v / 65536);
      t9 = v - c * 65536;
      v = t10 + c;
      c = Math.floor(v / 65536);
      t10 = v - c * 65536;
      v = t11 + c;
      c = Math.floor(v / 65536);
      t11 = v - c * 65536;
      v = t12 + c;
      c = Math.floor(v / 65536);
      t12 = v - c * 65536;
      v = t13 + c;
      c = Math.floor(v / 65536);
      t13 = v - c * 65536;
      v = t14 + c;
      c = Math.floor(v / 65536);
      t14 = v - c * 65536;
      v = t15 + c;
      c = Math.floor(v / 65536);
      t15 = v - c * 65536;
      t0 += 38 * c;
      o[0] = t0;
      o[1] = t1;
      o[2] = t2;
      o[3] = t3;
      o[4] = t4;
      o[5] = t5;
      o[6] = t6;
      o[7] = t7;
      o[8] = t8;
      o[9] = t9;
      o[10] = t10;
      o[11] = t11;
      o[12] = t12;
      o[13] = t13;
      o[14] = t14;
      o[15] = t15;
    }
    function _pow22501(z, o, z11) {
      const t0 = _gf(), t1 = _gf(), t2 = _gf();
      _S(t0, z);
      _S(t1, t0);
      _S(t1, t1);
      _M(t1, t1, z);
      _M(z11, t1, t0);
      _S(t0, z11);
      _M(t0, t0, t1);
      _S(t1, t0);
      for (let i = 1;i < 5; i++)
        _S(t1, t1);
      _M(t0, t1, t0);
      _S(t1, t0);
      for (let i = 1;i < 10; i++)
        _S(t1, t1);
      _M(t1, t1, t0);
      _S(t2, t1);
      for (let i = 1;i < 20; i++)
        _S(t2, t2);
      _M(t1, t2, t1);
      for (let i = 0;i < 10; i++)
        _S(t1, t1);
      _M(t0, t1, t0);
      _S(t1, t0);
      for (let i = 1;i < 50; i++)
        _S(t1, t1);
      _M(t1, t1, t0);
      _S(t2, t1);
      for (let i = 1;i < 100; i++)
        _S(t2, t2);
      _M(t1, t2, t1);
      for (let i = 0;i < 50; i++)
        _S(t1, t1);
      _M(o, t1, t0);
    }
    function _inv25519(o, i) {
      const t = _gf(), z11 = _gf();
      _pow22501(i, t, z11);
      for (let k = 0;k < 5; k++)
        _S(t, t);
      _M(o, t, z11);
    }
    function _pow2523(o, i) {
      const t = _gf(), z11 = _gf();
      _pow22501(i, t, z11);
      _S(t, t);
      _S(t, t);
      _M(o, t, i);
    }
    function _set25519(r, a) {
      for (let i = 0;i < 16; i++)
        r[i] = a[i];
    }
    const _ga = _gf(), _gb = _gf(), _gc = _gf(), _gd = _gf(), _ge = _gf(), _gff = _gf(), _gg = _gf(), _gh = _gf(), _gt = _gf();
    function _add(p, q) {
      const a = _ga, b = _gb, c = _gc, d = _gd, e = _ge, f = _gff, g = _gg, h = _gh, t = _gt;
      _Z(a, p[1], p[0]);
      _Z(t, q[1], q[0]);
      _M(a, a, t);
      _A(b, p[0], p[1]);
      _A(t, q[0], q[1]);
      _M(b, b, t);
      _M(c, p[3], q[3]);
      _M(c, c, _D2);
      _M(d, p[2], q[2]);
      _A(d, d, d);
      _Z(e, b, a);
      _Z(f, d, c);
      _A(g, d, c);
      _A(h, b, a);
      _M(p[0], e, f);
      _M(p[1], h, g);
      _M(p[2], g, f);
      _M(p[3], e, h);
    }
    function _dbl(p) {
      const a = _ga, b = _gb, c = _gc, e = _ge, f = _gff, g = _gg, h = _gh, t = _gt;
      _S(a, p[0]);
      _S(b, p[1]);
      _S(c, p[2]);
      _A(c, c, c);
      _A(h, a, b);
      _A(t, p[0], p[1]);
      _S(t, t);
      _Z(e, h, t);
      _Z(g, a, b);
      _A(f, c, g);
      _M(p[0], e, f);
      _M(p[1], g, h);
      _M(p[2], f, g);
      _M(p[3], e, h);
    }
    function _addNiels(p, n) {
      const a = _ga, b = _gb, c = _gc, d = _gd, e = _ge, f = _gff, g = _gg, h = _gh;
      _Z(a, p[1], p[0]);
      _M(a, a, n[1]);
      _A(b, p[0], p[1]);
      _M(b, b, n[0]);
      _M(c, p[3], n[2]);
      _A(d, p[2], p[2]);
      _Z(e, b, a);
      _Z(f, d, c);
      _A(g, d, c);
      _A(h, b, a);
      _M(p[0], e, f);
      _M(p[1], h, g);
      _M(p[2], g, f);
      _M(p[3], e, h);
    }
    function _pack(r, p) {
      const tx = _gf(), ty = _gf(), zi = _gf();
      _inv25519(zi, p[2]);
      _M(tx, p[0], zi);
      _M(ty, p[1], zi);
      _pack25519(r, ty);
      r[31] ^= _par25519(tx) << 7;
    }
    function _canon(o, a) {
      const bytes = new Uint8Array(32);
      _pack25519(bytes, a);
      for (let i = 0;i < 16; i++)
        o[i] = bytes[2 * i] + (bytes[2 * i + 1] << 8);
    }
    let _baseTable = null;
    function _buildBaseTable() {
      const points = [], P = [_gf(), _gf(), _gf(), _gf()];
      _set25519(P[0], _X);
      _set25519(P[1], _Y);
      _set25519(P[2], _gf1);
      _M(P[3], _X, _Y);
      for (let i = 0;i < 32; i++) {
        const Q = P.map((c) => Float64Array.from(c));
        for (let j = 1;j <= 8; j++) {
          points.push(Q.map((c) => Float64Array.from(c)));
          if (j < 8)
            _add(Q, P);
        }
        if (i < 31)
          for (let k = 0;k < 8; k++)
            _dbl(P);
      }
      const n = points.length, prefix = Array(n);
      prefix[0] = Float64Array.from(points[0][2]);
      for (let k = 1;k < n; k++) {
        prefix[k] = _gf();
        _M(prefix[k], prefix[k - 1], points[k][2]);
      }
      const inv = _gf();
      _inv25519(inv, prefix[n - 1]);
      const table = [];
      for (let i = 0;i < 32; i++)
        table.push(Array(8));
      const zi = _gf(), x = _gf(), y = _gf(), t = _gf();
      for (let k = n - 1;k >= 0; k--) {
        if (k > 0) {
          _M(zi, inv, prefix[k - 1]);
          _M(inv, inv, points[k][2]);
        } else
          _set25519(zi, inv);
        _M(x, points[k][0], zi);
        _M(y, points[k][1], zi);
        const yPx = _gf(), yMx = _gf(), xy2d = _gf();
        _A(t, y, x);
        _canon(yPx, t);
        _Z(t, y, x);
        _canon(yMx, t);
        _M(t, x, y);
        _M(t, t, _D2);
        _canon(xy2d, t);
        table[k >> 3][k & 7] = [yPx, yMx, xy2d];
      }
      return table;
    }
    function _cmov(a, b, bit) {
      const m = -bit;
      for (let i = 0;i < 16; i++)
        a[i] ^= m & (a[i] ^ b[i]);
    }
    const _sel = [_gf(), _gf(), _gf()], _negXy2d = _gf();
    function _selectBase(i, digit) {
      const row = _baseTable[i], negMask = digit >> 31, abs = (digit ^ negMask) - negMask, s0 = _sel[0], s1 = _sel[1], s2 = _sel[2];
      for (let k = 0;k < 16; k++) {
        s0[k] = 0;
        s1[k] = 0;
        s2[k] = 0;
      }
      s0[0] = 1;
      s1[0] = 1;
      for (let j = 1;j <= 8; j++) {
        const eq = (abs ^ j) - 1 >>> 31, e = row[j - 1];
        _cmov(s0, e[0], eq);
        _cmov(s1, e[1], eq);
        _cmov(s2, e[2], eq);
      }
      const neg = negMask & 1;
      _sel25519(s0, s1, neg);
      _Z(_negXy2d, _gf0, s2);
      _cmov(s2, _negXy2d, neg);
      return _sel;
    }
    const _digits = new Int32Array(64);
    function _scalarbase(p, s) {
      if (_baseTable === null)
        _baseTable = _buildBaseTable();
      const e = _digits;
      for (let i = 0;i < 32; i++) {
        e[2 * i] = s[i] & 15;
        e[2 * i + 1] = s[i] >> 4 & 15;
      }
      let carry = 0;
      for (let i = 0;i < 63; i++) {
        e[i] += carry;
        carry = e[i] + 8 >> 4;
        e[i] -= carry << 4;
      }
      e[63] += carry;
      _set25519(p[0], _gf0);
      _set25519(p[1], _gf1);
      _set25519(p[2], _gf1);
      _set25519(p[3], _gf0);
      for (let i = 1;i < 64; i += 2)
        _addNiels(p, _selectBase(i >> 1, e[i]));
      _dbl(p);
      _dbl(p);
      _dbl(p);
      _dbl(p);
      for (let i = 0;i < 64; i += 2)
        _addNiels(p, _selectBase(i >> 1, e[i]));
      for (let i = 0;i < 64; i++)
        e[i] = 0;
    }
    function _scalarmultPublic(p, q, s) {
      const win = [[_gf(), _gf1.slice(), _gf1.slice(), _gf()]];
      for (let j = 1;j < 16; j++) {
        const w = win[j - 1].map((c) => Float64Array.from(c));
        _add(w, q);
        win.push(w);
      }
      _set25519(p[0], _gf0);
      _set25519(p[1], _gf1);
      _set25519(p[2], _gf1);
      _set25519(p[3], _gf0);
      for (let i = 63;i >= 0; i--) {
        if (i < 63) {
          _dbl(p);
          _dbl(p);
          _dbl(p);
          _dbl(p);
        }
        _add(p, win[s[i >> 1] >> ((i & 1) << 2) & 15]);
      }
    }
    const _L = new Float64Array([
      237,
      211,
      245,
      92,
      26,
      99,
      18,
      88,
      214,
      156,
      247,
      162,
      222,
      249,
      222,
      20,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      16
    ]);
    function _modL(r, x) {
      let carry, i, j;
      for (i = 63;i >= 32; --i) {
        carry = 0;
        for (j = i - 32;j < i - 12; j++) {
          x[j] += carry - 16 * x[i] * _L[j - (i - 32)];
          carry = Math.floor((x[j] + 128) / 256);
          x[j] -= carry * 256;
        }
        x[j] += carry;
        x[i] = 0;
      }
      carry = 0;
      for (j = 0;j < 32; j++) {
        x[j] += carry - (x[31] >> 4) * _L[j];
        carry = x[j] >> 8;
        x[j] &= 255;
      }
      for (j = 0;j < 32; j++)
        x[j] -= carry * _L[j];
      for (i = 0;i < 32; i++) {
        x[i + 1] += x[i] >> 8;
        r[i] = x[i] & 255;
      }
    }
    function _reduce(r) {
      const x = new Float64Array(64);
      for (let i = 0;i < 64; i++)
        x[i] = r[i];
      for (let i = 0;i < 64; i++)
        r[i] = 0;
      _modL(r, x);
    }
    function _h(...parts) {
      let total = 0;
      for (const p of parts)
        total += p.length;
      const buf = new Uint8Array(total);
      let off = 0;
      for (const p of parts) {
        buf.set(p, off);
        off += p.length;
      }
      const ba = bitArray.ui8_to_ba(buf);
      return bitArray.ba_to_ui8(sha512.hash(ba));
    }
    const _DOM2_PREFIX = new Uint8Array([
      83,
      105,
      103,
      69,
      100,
      50,
      53,
      53,
      49,
      57,
      32,
      110,
      111,
      32,
      69,
      100,
      50,
      53,
      53,
      49,
      57,
      32,
      99,
      111,
      108,
      108,
      105,
      115,
      105,
      111,
      110,
      115
    ]);
    function _dom2(F, ctx) {
      const ctxLen = ctx ? ctx.length : 0;
      if (ctxLen > 255) {
        console.warn("[crypto] INVALID: ed25519: context must be \u2264 255 bytes");
        return !1;
      }
      const out = new Uint8Array(34 + ctxLen);
      out.set(_DOM2_PREFIX, 0);
      out[32] = F & 255;
      out[33] = ctxLen & 255;
      if (ctxLen > 0)
        out.set(ctx, 34);
      return out;
    }
    function _seedToKeyPair(seed) {
      const d = _h(seed);
      d[0] &= 248;
      d[31] &= 127;
      d[31] |= 64;
      const p = [_gf(), _gf(), _gf(), _gf()], pk = new Uint8Array(32);
      _scalarbase(p, d);
      _pack(pk, p);
      const sk = new Uint8Array(64);
      sk.set(seed, 0);
      sk.set(pk, 32);
      return { publicKey: pk, privateKey: sk };
    }
    function keyPair(seed) {
      if (!(seed instanceof Uint8Array) || seed.length !== 32) {
        console.warn("[crypto] INVALID: ed25519: seed must be 32 bytes");
        return !1;
      }
      return _seedToKeyPair(seed);
    }
    function _signCore(privateKey, message, dom) {
      if (!(privateKey instanceof Uint8Array) || privateKey.length !== 64) {
        console.warn("[crypto] INVALID: ed25519: privateKey must be 64 bytes (seed || pub)");
        return !1;
      }
      const seed = privateKey.subarray(0, 32), pk = privateKey.subarray(32, 64), d = _h(seed);
      d[0] &= 248;
      d[31] &= 127;
      d[31] |= 64;
      const prefix = d.subarray(32, 64), r = dom ? _h(dom, prefix, message) : _h(prefix, message);
      _reduce(r);
      const p = [_gf(), _gf(), _gf(), _gf()];
      _scalarbase(p, r);
      const R = new Uint8Array(32);
      _pack(R, p);
      const k = dom ? _h(dom, R, pk, message) : _h(R, pk, message);
      _reduce(k);
      const S = new Uint8Array(32), x = new Float64Array(64);
      for (let i = 0;i < 32; i++)
        x[i] = r[i];
      for (let i = 0;i < 32; i++)
        for (let j = 0;j < 32; j++)
          x[i + j] += k[i] * d[j];
      _modL(S, x);
      const sig = new Uint8Array(64);
      sig.set(R, 0);
      sig.set(S, 32);
      return sig;
    }
    function sign(privateKey, message) {
      return _signCore(privateKey, message, null);
    }
    function signPh(privateKey, message, context) {
      const dom = _dom2(1, context);
      if (dom === !1)
        return !1;
      const ph = _h(message);
      return _signCore(privateKey, ph, dom);
    }
    function signCtx(privateKey, message, context) {
      if (!(context instanceof Uint8Array) || context.length === 0 || context.length > 255) {
        console.warn("[crypto] INVALID: ed25519: signCtx context must be 1..255 bytes (use sign() for empty context)");
        return !1;
      }
      const dom = _dom2(0, context);
      if (dom === !1)
        return !1;
      return _signCore(privateKey, message, dom);
    }
    function _unpackneg(r, p) {
      const t = _gf(), chk = _gf(), num = _gf(), den = _gf(), den2 = _gf(), den4 = _gf(), den6 = _gf();
      _set25519(r[2], _gf1);
      _unpack25519(r[1], p);
      _S(num, r[1]);
      _M(den, num, _D);
      _Z(num, num, r[2]);
      _A(den, r[2], den);
      _S(den2, den);
      _S(den4, den2);
      _M(den6, den4, den2);
      _M(t, den6, num);
      _M(t, t, den);
      _pow2523(t, t);
      _M(t, t, num);
      _M(t, t, den);
      _M(t, t, den);
      _M(r[0], t, den);
      _S(chk, r[0]);
      _M(chk, chk, den);
      if (_neq25519(chk, num))
        _M(r[0], r[0], _I);
      _S(chk, r[0]);
      _M(chk, chk, den);
      if (_neq25519(chk, num))
        return -1;
      if (_par25519(r[0]) === p[31] >> 7)
        _Z(r[0], _gf0, r[0]);
      _M(r[3], r[0], r[1]);
      return 0;
    }
    const _ED25519_L = new Uint8Array([
      237,
      211,
      245,
      92,
      26,
      99,
      18,
      88,
      214,
      156,
      247,
      162,
      222,
      249,
      222,
      20,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      16
    ]);
    function _sLessThanL(s) {
      let lt = 0, gt = 0;
      for (let i = 31;i >= 0; i--) {
        const a = s[i] | 0, b = _ED25519_L[i] | 0, ltHere = a - b >>> 31 & 1, gtHere = b - a >>> 31 & 1;
        lt |= ltHere & 1 - gt;
        gt |= gtHere & 1 - lt;
      }
      return lt === 1;
    }
    function _verifyCore(publicKey, message, signature, dom) {
      if (!(publicKey instanceof Uint8Array) || publicKey.length !== 32)
        return !1;
      if (!(signature instanceof Uint8Array) || signature.length !== 64)
        return !1;
      if (!_sLessThanL(signature.subarray(32, 64)))
        return !1;
      const q = [_gf(), _gf(), _gf(), _gf()];
      if (_unpackneg(q, publicKey) !== 0)
        return !1;
      const R = signature.subarray(0, 32), k = dom ? _h(dom, R, publicKey, message) : _h(R, publicKey, message);
      _reduce(k);
      const p = [_gf(), _gf(), _gf(), _gf()];
      _scalarmultPublic(p, q, k);
      const Rcheck = [_gf(), _gf(), _gf(), _gf()];
      _scalarbase(Rcheck, signature.subarray(32, 64));
      _add(p, Rcheck);
      const t = new Uint8Array(32);
      _pack(t, p);
      let diff = 0;
      for (let i = 0;i < 32; i++)
        diff |= signature[i] ^ t[i];
      return diff === 0;
    }
    function verify(publicKey, signature, message) {
      return _verifyCore(publicKey, message, signature, null);
    }
    function verifyPh(publicKey, signature, message, context) {
      const dom = _dom2(1, context);
      if (dom === !1)
        return !1;
      const ph = _h(message);
      return _verifyCore(publicKey, ph, signature, dom);
    }
    function verifyCtx(publicKey, signature, message, context) {
      if (!(context instanceof Uint8Array) || context.length === 0 || context.length > 255) {
        console.warn("[crypto] INVALID: ed25519: verifyCtx context must be 1..255 bytes");
        return !1;
      }
      const dom = _dom2(0, context);
      if (dom === !1)
        return !1;
      return _verifyCore(publicKey, message, signature, dom);
    }
    return Object.defineProperty({
      keyPair,
      sign,
      verify,
      signPh,
      verifyPh,
      signCtx,
      verifyCtx
    }, Symbol.for("@awacloud/fw/internal"), {
      value: {
        isValidPublicKey(pk) {
          if (!(pk instanceof Uint8Array) || pk.length !== 32)
            return !1;
          const q = [_gf(), _gf(), _gf(), _gf()];
          return _unpackneg(q, pk) === 0;
        },
        dom2: _dom2,
        baseMulBoth(sc) {
          const B = [_gf(), _gf(), _gf(), _gf()];
          _set25519(B[0], _X);
          _set25519(B[1], _Y);
          _set25519(B[2], _gf1);
          _M(B[3], _X, _Y);
          const p1 = [_gf(), _gf(), _gf(), _gf()], p2 = [_gf(), _gf(), _gf(), _gf()];
          _scalarbase(p1, sc);
          _scalarmultPublic(p2, B, sc);
          const t = new Uint8Array(32), w = new Uint8Array(32);
          _pack(t, p1);
          _pack(w, p2);
          return { table: t, window: w };
        },
        baseMulSource: () => String(_selectBase) + String(_scalarbase)
      }
    });
  } });

    // pdf-local factories — inlined and topo-ordered.
    __register({ name: "pdfErrors", dependencies: [], factory: function() {
    class PdfError extends Error {
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

    class ParseError extends PdfError {
    }

    class RenderError extends PdfError {
    }

    class ContractError extends PdfError {
    }

    class EncryptionError extends PdfError {
    }
    function isPdfError(e) {
      return e instanceof PdfError;
    }
    return {
      PdfError,
      ParseError,
      RenderError,
      ContractError,
      EncryptionError,
      isPdfError
    };
  } });
    __register({ name: "pdfShared", dependencies: [], factory: function() {
    const HEADER_PREFIX = new Uint8Array([37, 80, 68, 70, 45]), EOF_MARKER = new Uint8Array([37, 37, 69, 79, 70]), BINARY_MARKER = new Uint8Array([37, 226, 227, 207, 211, 10]), ASCII = Object.freeze({
      NUL: 0,
      HT: 9,
      LF: 10,
      FF: 12,
      CR: 13,
      SP: 32,
      HASH: 35,
      PERCENT: 37,
      LPAREN: 40,
      RPAREN: 41,
      PLUS: 43,
      MINUS: 45,
      DOT: 46,
      SLASH: 47,
      ZERO: 48,
      NINE: 57,
      LANGLE: 60,
      RANGLE: 62,
      A_UP: 65,
      F_UP: 70,
      Z_UP: 90,
      LBRACK: 91,
      BACKSLASH: 92,
      RBRACK: 93,
      A_LO: 97,
      F_LO: 102,
      Z_LO: 122,
      LBRACE: 123,
      RBRACE: 125
    });
    function isWs(b) {
      return b === 32 || b === 9 || b === 10 || b === 13 || b === 12 || b === 0;
    }
    function isEol(b) {
      return b === 10 || b === 13;
    }
    function isDigit(b) {
      return b >= 48 && b <= 57;
    }
    function isHex(b) {
      return b >= 48 && b <= 57 || b >= 65 && b <= 70 || b >= 97 && b <= 102;
    }
    function isDelim(b) {
      return b === 40 || b === 41 || b === 60 || b === 62 || b === 91 || b === 93 || b === 47 || b === 37 || b === 123 || b === 125;
    }
    function isRegular(b) {
      return !isWs(b) && !isDelim(b);
    }
    function hexNibble(b) {
      if (b >= 48 && b <= 57)
        return b - 48;
      if (b >= 65 && b <= 70)
        return b - 65 + 10;
      if (b >= 97 && b <= 102)
        return b - 97 + 10;
      return -1;
    }
    const HEX_LO = function buildHexLo() {
      const t = new Int8Array(128);
      t.fill(-1);
      for (let c = 48;c <= 57; c++)
        t[c] = c - 48;
      for (let c = 65;c <= 70; c++)
        t[c] = c - 65 + 10;
      for (let c = 97;c <= 102; c++)
        t[c] = c - 97 + 10;
      return t;
    }(), te = new TextEncoder, tdUtf8 = new TextDecoder("utf-8"), tdUtf8Lenient = new TextDecoder("utf-8", { fatal: !1 }), tdLatin1 = new TextDecoder("latin1");
    function encodeAscii(s) {
      return te.encode(s);
    }
    function decodeUtf8(bytes) {
      return tdUtf8.decode(bytes);
    }
    function decodeUtf8Lenient(b) {
      return tdUtf8Lenient.decode(b);
    }
    function decodeLatin1(bytes) {
      return tdLatin1.decode(bytes);
    }
    function pad10(n) {
      return String(n).padStart(10, "0");
    }
    function hexLit(bytes) {
      let s = "<";
      for (let i = 0;i < bytes.length; i++)
        s += "0123456789ABCDEF"[bytes[i] >> 4] + "0123456789ABCDEF"[bytes[i] & 15];
      return s + ">";
    }
    function bytesEqual(a, b, n) {
      if (!a || !b)
        return !1;
      if (n == null) {
        if (a.length !== b.length)
          return !1;
        n = a.length;
      } else if (a.length < n || b.length < n)
        return !1;
      let diff = 0;
      for (let i = 0;i < n; i++)
        diff |= a[i] ^ b[i];
      return diff === 0;
    }
    function concatBytes(arrays) {
      let total = 0;
      for (const a of arrays)
        total += a.length;
      const out = new Uint8Array(total);
      let o = 0;
      for (const a of arrays) {
        out.set(a, o);
        o += a.length;
      }
      return out;
    }
    return {
      HEADER_PREFIX,
      EOF_MARKER,
      BINARY_MARKER,
      ASCII,
      isWs,
      isEol,
      isDigit,
      isHex,
      isDelim,
      isRegular,
      hexNibble,
      HEX_LO,
      te,
      tdUtf8,
      tdUtf8Lenient,
      tdLatin1,
      encodeAscii,
      decodeUtf8,
      decodeUtf8Lenient,
      decodeLatin1,
      pad10,
      hexLit,
      bytesEqual,
      concatBytes
    };
  } });
    __register({ name: "pdfTokenizer", dependencies: ["pdfErrors","pdfShared"], factory: function(errors, shared) {
    const { ParseError } = errors, { ASCII, isWs, isEol, isDigit, isRegular, hexNibble } = shared, {
      HT,
      LF,
      CR,
      FF,
      LPAREN,
      RPAREN,
      LANGLE,
      RANGLE,
      LBRACK,
      RBRACK,
      SLASH,
      PERCENT,
      BACKSLASH,
      PLUS,
      MINUS,
      DOT,
      ZERO,
      HASH
    } = ASCII;
    function tokenize(bytes, opts) {
      if (!(bytes instanceof Uint8Array))
        throw new ParseError("pdf/tokenizer/bad-input", "tokenize() expects a Uint8Array", { context: { typeof: typeof bytes } });
      const keepWs = !!(opts && opts.keepWhitespace);
      let i = opts && opts.start | 0 || 0;
      const N = opts && Number.isFinite(opts.end) ? Math.min(opts.end | 0, bytes.length) : bytes.length;
      let lookahead = null;
      function pos() {
        return i;
      }
      function seek(n) {
        if (n < 0 || n > bytes.length)
          throw new ParseError("pdf/tokenizer/bad-seek", "seek out of range", { context: { offset: n, total: bytes.length } });
        i = n;
        lookahead = null;
      }
      function readName() {
        const start = i;
        i++;
        const out = [];
        while (i < N) {
          const b = bytes[i];
          if (!isRegular(b))
            break;
          if (b === HASH) {
            if (i + 2 >= N)
              throw new ParseError("pdf/tokenizer/bad-name-escape", "truncated #xx escape in name", { context: { offset: i } });
            const hi = hexNibble(bytes[i + 1]), lo = hexNibble(bytes[i + 2]);
            if (hi < 0 || lo < 0)
              throw new ParseError("pdf/tokenizer/bad-name-escape", "invalid hex digits in name escape", { context: { offset: i } });
            out.push(hi << 4 | lo);
            i += 3;
          } else {
            out.push(b);
            i++;
          }
        }
        return { kind: "name", value: new TextDecoder("utf-8", { fatal: !1 }).decode(Uint8Array.from(out)), offset: start, end: i };
      }
      function readNumber() {
        const start = i;
        let isReal = !1;
        if (bytes[i] === PLUS || bytes[i] === MINUS)
          i++;
        while (i < N) {
          const b = bytes[i];
          if (isDigit(b)) {
            i++;
            continue;
          }
          if (b === DOT && !isReal) {
            isReal = !0;
            i++;
            continue;
          }
          break;
        }
        const raw = new TextDecoder("latin1").decode(bytes.subarray(start, i));
        if (raw === "" || raw === "+" || raw === "-" || raw === ".")
          throw new ParseError("pdf/tokenizer/bad-number", "empty number token", { context: { offset: start } });
        const n = Number(raw);
        if (!Number.isFinite(n))
          throw new ParseError("pdf/tokenizer/bad-number", "cannot parse number", { context: { raw, offset: start } });
        return { kind: isReal ? "real" : "int", value: n, offset: start, end: i, raw };
      }
      function readLiteralString() {
        const start = i;
        i++;
        const out = [];
        let depth = 1;
        while (i < N && depth > 0) {
          const b = bytes[i];
          if (b === LPAREN) {
            depth++;
            out.push(b);
            i++;
            continue;
          }
          if (b === RPAREN) {
            depth--;
            if (depth === 0) {
              i++;
              break;
            }
            out.push(b);
            i++;
            continue;
          }
          if (b === BACKSLASH) {
            if (i + 1 >= N)
              throw new ParseError("pdf/tokenizer/bad-string", "trailing backslash in literal string", { context: { offset: i } });
            const nxt = bytes[i + 1];
            if (nxt === LF) {
              i += 2;
              continue;
            }
            if (nxt === CR) {
              i += 2;
              if (i < N && bytes[i] === LF)
                i++;
              continue;
            }
            if (nxt === 110) {
              out.push(LF);
              i += 2;
              continue;
            }
            if (nxt === 114) {
              out.push(CR);
              i += 2;
              continue;
            }
            if (nxt === 116) {
              out.push(HT);
              i += 2;
              continue;
            }
            if (nxt === 98) {
              out.push(8);
              i += 2;
              continue;
            }
            if (nxt === 102) {
              out.push(FF);
              i += 2;
              continue;
            }
            if (nxt === LPAREN || nxt === RPAREN || nxt === BACKSLASH) {
              out.push(nxt);
              i += 2;
              continue;
            }
            if (nxt >= ZERO && nxt <= ZERO + 7) {
              let v = 0, k = 0;
              i++;
              while (k < 3 && i < N && bytes[i] >= ZERO && bytes[i] <= ZERO + 7) {
                v = v << 3 | bytes[i] - ZERO;
                i++;
                k++;
              }
              out.push(v & 255);
              continue;
            }
            i++;
            continue;
          }
          if (b === CR) {
            out.push(LF);
            i++;
            if (i < N && bytes[i] === LF)
              i++;
            continue;
          }
          out.push(b);
          i++;
        }
        if (depth !== 0)
          throw new ParseError("pdf/tokenizer/unterminated-string", "literal string was not closed", { context: { offset: start } });
        return { kind: "string", value: Uint8Array.from(out), offset: start, end: i };
      }
      function readHexString() {
        const start = i;
        i++;
        const nibbles = [];
        while (i < N) {
          const b = bytes[i];
          if (b === RANGLE) {
            i++;
            break;
          }
          if (isWs(b)) {
            i++;
            continue;
          }
          const v = hexNibble(b);
          if (v < 0)
            throw new ParseError("pdf/tokenizer/bad-hex", "non-hex byte in hex string", { context: { offset: i, byte: b } });
          nibbles.push(v);
          i++;
        }
        if (nibbles.length % 2 === 1)
          nibbles.push(0);
        const out = new Uint8Array(nibbles.length / 2);
        for (let k = 0;k < out.length; k++)
          out[k] = nibbles[2 * k] << 4 | nibbles[2 * k + 1];
        return { kind: "hex", value: out, offset: start, end: i };
      }
      function readKeyword() {
        const start = i;
        while (i < N && isRegular(bytes[i]))
          i++;
        const raw = new TextDecoder("latin1").decode(bytes.subarray(start, i));
        if (raw === "")
          throw new ParseError("pdf/tokenizer/empty-keyword", "empty keyword", { context: { offset: start } });
        return { kind: "kw", value: raw, offset: start, end: i };
      }
      function next() {
        if (lookahead) {
          const t = lookahead;
          lookahead = null;
          return t;
        }
        while (i < N) {
          const b = bytes[i];
          if (isWs(b)) {
            if (keepWs) {
              const start = i;
              while (i < N && isWs(bytes[i]))
                i++;
              return { kind: "ws", offset: start, end: i };
            }
            i++;
            continue;
          }
          if (b === PERCENT) {
            if (i + 4 < N && bytes[i + 1] === PERCENT && bytes[i + 2] === 69 && bytes[i + 3] === 79 && bytes[i + 4] === 70) {
              const start = i;
              i += 5;
              return { kind: "eof_marker", offset: start, end: i };
            }
            while (i < N && !isEol(bytes[i]))
              i++;
            if (i < N && bytes[i] === CR)
              i++;
            if (i < N && bytes[i] === LF)
              i++;
            continue;
          }
          break;
        }
        if (i >= N)
          return null;
        const b = bytes[i];
        if (b === SLASH)
          return readName();
        if (b === LBRACK)
          return { kind: "open_arr", offset: i++, end: i };
        if (b === RBRACK)
          return { kind: "close_arr", offset: i++, end: i };
        if (b === LANGLE) {
          if (i + 1 < N && bytes[i + 1] === LANGLE) {
            const off = i;
            i += 2;
            return { kind: "open_dict", offset: off, end: i };
          }
          return readHexString();
        }
        if (b === RANGLE) {
          if (i + 1 < N && bytes[i + 1] === RANGLE) {
            const off = i;
            i += 2;
            return { kind: "close_dict", offset: off, end: i };
          }
          throw new ParseError("pdf/tokenizer/unexpected-rangle", "lone > outside hex string", { context: { offset: i } });
        }
        if (b === LPAREN)
          return readLiteralString();
        if (b === PLUS || b === MINUS || b === DOT || isDigit(b))
          return readNumber();
        return readKeyword();
      }
      function peek() {
        if (!lookahead)
          lookahead = next();
        return lookahead;
      }
      return { next, peek, pos, seek, bytes };
    }
    function lastIndexOfBytes(bytes, needle, from) {
      const N = bytes.length, M = needle.length;
      if (M === 0 || M > N)
        return -1;
      let start = Number.isFinite(from) ? Math.min(from | 0, N - M) : N - M;
      outer:
        for (let i = start;i >= 0; i--) {
          for (let k = 0;k < M; k++)
            if (bytes[i + k] !== needle[k])
              continue outer;
          return i;
        }
      return -1;
    }
    return { tokenize, lastIndexOfBytes };
  } });
    __register({ name: "pdfParserObj", dependencies: [], factory: function() {
    const obj = {
      nul: () => ({ type: "null" }),
      bool: (v) => ({ type: "bool", value: !!v }),
      int: (v) => ({ type: "int", value: v | 0 }),
      real: (v) => ({ type: "real", value: +v }),
      name: (s) => ({ type: "name", value: String(s) }),
      string: (bytes, syntax) => ({
        type: "string",
        value: bytes,
        syntax: syntax === "hex" ? "hex" : "lit"
      }),
      array: (items) => ({ type: "array", items: items || [] }),
      dict: (entries) => ({ type: "dict", entries: entries || {} }),
      ref: (num, gen) => ({ type: "ref", num: num | 0, gen: gen | 0 || 0 }),
      stream: (dict, raw) => ({ type: "stream", dict, raw })
    };
    function getEntry(dict, key) {
      if (!dict || dict.type !== "dict")
        return;
      return dict.entries[key];
    }
    function isType(v, kind) {
      return !!(v && v.type === kind);
    }
    return { obj, getEntry, isType };
  } });
    __register({ name: "pdfParser", dependencies: ["pdfErrors","pdfParserObj","pdfTokenizer"], factory: function(errors, parserObj, tokenizerMod) {
    const { ParseError } = errors, { obj, getEntry, isType } = parserObj, tokenize = tokenizerMod.tokenize;
    function resolveStreamLength(streamDict, resolveRef) {
      const e = streamDict.entries && streamDict.entries.Length;
      if (!e)
        return -1;
      if (e.type === "int")
        return e.value;
      if (e.type === "ref" && typeof resolveRef === "function") {
        const r = resolveRef(e);
        if (r && r.type === "int")
          return r.value;
      }
      return -1;
    }
    function findEndstream(bytes, from, quota) {
      const needle = [101, 110, 100, 115, 116, 114, 101, 97, 109], lim = Math.min(bytes.length, from + (quota | 0));
      outer:
        for (let i = from;i + needle.length <= lim; i++) {
          for (let k = 0;k < needle.length; k++)
            if (bytes[i + k] !== needle[k])
              continue outer;
          let end = i;
          if (end > from && bytes[end - 1] === 10)
            end--;
          if (end > from && bytes[end - 1] === 13)
            end--;
          return end;
        }
      return -1;
    }
    function skipEolWs(tok) {
      const b = tok.bytes;
      let p = tok.pos();
      while (p < b.length) {
        const c = b[p];
        if (c === 32 || c === 9 || c === 10 || c === 13)
          p++;
        else
          break;
      }
      tok.seek(p);
    }
    const parserLimits = {
      maxDepth: 200,
      maxArrayLen: 1e6,
      maxStreamBytes: 268435456
    };
    function setParserLimits(partial) {
      if (partial && typeof partial === "object") {
        if (Number.isInteger(partial.maxDepth) && partial.maxDepth > 0)
          parserLimits.maxDepth = partial.maxDepth;
        if (Number.isInteger(partial.maxArrayLen) && partial.maxArrayLen > 0)
          parserLimits.maxArrayLen = partial.maxArrayLen;
        if (Number.isInteger(partial.maxStreamBytes) && partial.maxStreamBytes > 0)
          parserLimits.maxStreamBytes = partial.maxStreamBytes;
      }
      return parserLimits;
    }
    function parseObject(tok) {
      const t = tok.next();
      if (!t)
        throw new ParseError("pdf/parser/eof", "unexpected end of input");
      return continueParse(tok, t, 0);
    }
    function continueParse(tok, t, depth) {
      if (depth > parserLimits.maxDepth)
        throw new ParseError("pdf/parser/depth-exceeded", "parser depth limit exceeded", { context: {
          depth,
          limit: parserLimits.maxDepth,
          offset: t && t.offset
        } });
      switch (t.kind) {
        case "kw":
          if (t.value === "null")
            return { type: "null" };
          if (t.value === "true")
            return { type: "bool", value: !0 };
          if (t.value === "false")
            return { type: "bool", value: !1 };
          throw new ParseError("pdf/parser/unexpected-keyword", `unexpected keyword "${t.value}"`, { context: { offset: t.offset, keyword: t.value } });
        case "name":
          return { type: "name", value: t.value };
        case "string":
          return { type: "string", value: t.value, syntax: "lit" };
        case "hex":
          return { type: "string", value: t.value, syntax: "hex" };
        case "int":
          return tryReadRef(tok, t);
        case "real":
          return { type: "real", value: t.value };
        case "open_arr":
          return readArray(tok, t.offset, depth);
        case "open_dict":
          return readDict(tok, t.offset, depth);
        case "close_arr":
        case "close_dict":
          throw new ParseError("pdf/parser/unbalanced", `unexpected ${t.kind}`, { context: { offset: t.offset } });
        default:
          throw new ParseError("pdf/parser/unexpected-token", `unexpected token of kind "${t.kind}"`, { context: { offset: t.offset, kind: t.kind } });
      }
    }
    function tryReadRef(tok, intTok) {
      const at = tok.pos(), p1 = tok.peek();
      if (!p1 || p1.kind !== "int")
        return { type: "int", value: intTok.value };
      tok.next();
      const p2 = tok.peek();
      if (p2 && p2.kind === "kw" && p2.value === "R") {
        tok.next();
        return { type: "ref", num: intTok.value | 0, gen: p1.value | 0 };
      }
      tok.seek(at);
      return { type: "int", value: intTok.value };
    }
    function readArray(tok, startOff, depth) {
      const items = [];
      for (;; ) {
        const p = tok.peek();
        if (!p)
          throw new ParseError("pdf/parser/unterminated-array", "array not closed", { context: { offset: startOff } });
        if (p.kind === "close_arr") {
          tok.next();
          return { type: "array", items };
        }
        if (items.length >= parserLimits.maxArrayLen)
          throw new ParseError("pdf/parser/array-too-long", "array exceeds parserLimits.maxArrayLen", { context: {
            length: items.length,
            limit: parserLimits.maxArrayLen,
            offset: startOff
          } });
        const sub = tok.next();
        items.push(continueParse(tok, sub, (depth | 0) + 1));
      }
    }
    function readDict(tok, startOff, depth) {
      const entries = {};
      for (;; ) {
        const p = tok.peek();
        if (!p)
          throw new ParseError("pdf/parser/unterminated-dict", "dict not closed", { context: { offset: startOff } });
        if (p.kind === "close_dict") {
          tok.next();
          return { type: "dict", entries };
        }
        if (p.kind !== "name")
          throw new ParseError("pdf/parser/dict-key-not-name", "expected /Name as dict key", { context: { offset: p.offset, kind: p.kind } });
        const keyTok = tok.next(), sub = tok.next();
        if (!sub)
          throw new ParseError("pdf/parser/eof", "unexpected end of input");
        const value = continueParse(tok, sub, (depth | 0) + 1);
        entries[keyTok.value] = value;
      }
    }
    function parseIndirect(tok, resolveRef) {
      const t1 = tok.next();
      if (!t1 || t1.kind !== "int")
        throw new ParseError("pdf/parser/indirect-bad-num", "expected object number", { context: { offset: t1 ? t1.offset : tok.pos() } });
      const t2 = tok.next();
      if (!t2 || t2.kind !== "int")
        throw new ParseError("pdf/parser/indirect-bad-gen", "expected generation number", { context: { offset: t2 ? t2.offset : tok.pos() } });
      const t3 = tok.next();
      if (!t3 || t3.kind !== "kw" || t3.value !== "obj")
        throw new ParseError("pdf/parser/indirect-missing-obj", "expected obj keyword", { context: { offset: t3 ? t3.offset : tok.pos() } });
      const value = parseObject(tok);
      let body = value;
      const after = tok.peek();
      if (value.type === "dict" && after && after.kind === "kw" && after.value === "stream") {
        tok.next();
        const bytes = tok.bytes;
        let p = tok.pos();
        if (p < bytes.length && bytes[p] === 13)
          p++;
        if (p < bytes.length && bytes[p] === 10)
          p++;
        tok.seek(p);
        const dataStart = tok.pos(), length = resolveStreamLength(value, resolveRef);
        let dataEnd;
        if (Number.isFinite(length) && length >= 0 && dataStart + length <= bytes.length)
          dataEnd = dataStart + length;
        else {
          dataEnd = findEndstream(bytes, dataStart, parserLimits.maxStreamBytes);
          if (dataEnd < 0)
            throw new ParseError("pdf/parser/stream/no-endstream", "cannot locate endstream within quota", { context: {
              offset: dataStart,
              num: t1.value,
              gen: t2.value,
              quota: parserLimits.maxStreamBytes
            } });
        }
        const raw = bytes.subarray(dataStart, dataEnd);
        tok.seek(dataEnd);
        skipEolWs(tok);
        const endTok = tok.next();
        if (!endTok || endTok.kind !== "kw" || endTok.value !== "endstream")
          throw new ParseError("pdf/parser/stream/expected-endstream", "expected endstream", { context: { offset: endTok ? endTok.offset : tok.pos() } });
        body = { type: "stream", dict: value, raw };
      }
      const endObj = tok.next();
      if (!endObj || endObj.kind !== "kw" || endObj.value !== "endobj")
        throw new ParseError("pdf/parser/indirect-missing-endobj", "expected endobj", { context: {
          offset: endObj ? endObj.offset : tok.pos(),
          num: t1.value,
          gen: t2.value
        } });
      return { num: t1.value, gen: t2.value, value: body };
    }
    function parseFromBytes(bytes) {
      const tok = tokenize(bytes);
      return parseObject(tok);
    }
    function parseIndirectFromBytes(bytes, at, resolveRef) {
      const tok = tokenize(bytes, { start: at | 0 });
      return parseIndirect(tok, resolveRef);
    }
    return {
      tokenize,
      parseObject,
      parseIndirect,
      parseFromBytes,
      parseIndirectFromBytes,
      parserLimits,
      setParserLimits,
      obj,
      getEntry,
      isType
    };
  } });
    __register({ name: "pdfXref", dependencies: ["pdfErrors","pdfTokenizer","pdfParser"], factory: function(errors, tokenizerMod, parserMod) {
    const { ParseError, RenderError } = errors, tokenize = tokenizerMod.tokenize, lastIndexOfBytes = tokenizerMod.lastIndexOfBytes, parseObject = parserMod.parseObject;
    function locateStartXref(bytes) {
      const tail = Math.max(0, bytes.length - 8192), idx = lastIndexOfBytes(bytes, new Uint8Array([115, 116, 97, 114, 116, 120, 114, 101, 102]), bytes.length);
      if (idx < tail)
        return -1;
      return idx;
    }
    function readStartXref(bytes, at) {
      const tok = tokenize(bytes, { start: at }), kw = tok.next();
      if (!kw || kw.kind !== "kw" || kw.value !== "startxref")
        throw new ParseError("pdf/xref/no-startxref", "startxref keyword not found", { context: { offset: at } });
      const num = tok.next();
      if (!num || num.kind !== "int" || num.value < 0)
        throw new ParseError("pdf/xref/bad-startxref", "startxref must be followed by a non-negative integer", { context: { offset: at } });
      return num.value;
    }
    function parseIntBytes(bytes, off, len) {
      let n = 0;
      for (let i = 0;i < len; i++) {
        const b = bytes[off + i];
        if (b < 48 || b > 57)
          throw new ParseError("pdf/xref/bad-digit", "expected ASCII digit in xref entry", { context: { offset: off + i, byte: b } });
        n = n * 10 + (b - 48);
      }
      return n;
    }
    function parseXrefTable(bytes, at) {
      const tok = tokenize(bytes, { start: at }), kw = tok.next();
      if (!kw || kw.kind !== "kw" || kw.value !== "xref")
        throw new ParseError("pdf/xref/no-xref-keyword", "expected xref keyword", { context: { offset: at } });
      const entries = {}, tolerated = new Set;
      for (;; ) {
        const first = tok.peek();
        if (!first || first.kind !== "int") {
          if (first)
            tok.seek(first.offset);
          break;
        }
        tok.next();
        const cnt = tok.next();
        if (!cnt || cnt.kind !== "int" || cnt.value < 0)
          throw new ParseError("pdf/xref/bad-subsection-header", "xref subsection header must be `<first> <count>`", { context: { offset: first.offset } });
        let p = tok.pos(), q = p;
        while (q < bytes.length && (bytes[q] === 32 || bytes[q] === 9))
          q++;
        if (q > p && q < bytes.length && (bytes[q] === 13 || bytes[q] === 10)) {
          tolerated.add("subsection-header-space");
          p = q;
        }
        if (p < bytes.length && bytes[p] === 13)
          p++;
        if (p < bytes.length && bytes[p] === 10)
          p++;
        for (let k = 0;k < cnt.value; k++) {
          if (p + 19 > bytes.length)
            throw new ParseError("pdf/xref/truncated-entry", "truncated xref entry", { context: { offset: p, expected: 20 } });
          const off = parseIntBytes(bytes, p, 10);
          if (bytes[p + 10] !== 32)
            throw new ParseError("pdf/xref/bad-entry-format", "xref entry missing space at col 10", { context: { offset: p } });
          const gen = parseIntBytes(bytes, p + 11, 5);
          if (bytes[p + 16] !== 32)
            throw new ParseError("pdf/xref/bad-entry-format", "xref entry missing space at col 16", { context: { offset: p } });
          const tag = bytes[p + 17];
          if (tag !== 110 && tag !== 102)
            throw new ParseError("pdf/xref/bad-entry-flag", "xref entry flag must be n or f", { context: { offset: p, byte: tag } });
          entries[first.value + k] = {
            offset: off,
            gen,
            free: tag === 102
          };
          const e1 = bytes[p + 18], e2 = bytes[p + 19];
          if ((e1 === 13 || e1 === 10) && e2 !== 13 && e2 !== 10 && e2 !== 32) {
            tolerated.add("entry-eol-one-byte");
            p += 19;
          } else
            p += 20;
        }
        tok.seek(p);
      }
      return tolerated.size ? { entries, end: tok.pos(), tolerated: [...tolerated] } : { entries, end: tok.pos() };
    }
    function parseTrailerDict(bytes, at) {
      const tok = tokenize(bytes, { start: at }), kw = tok.next();
      if (!kw || kw.kind !== "kw" || kw.value !== "trailer")
        throw new ParseError("pdf/xref/no-trailer", "expected trailer keyword", { context: { offset: at } });
      const dict = parseObject(tok);
      if (dict.type !== "dict")
        throw new ParseError("pdf/xref/trailer-not-dict", "trailer must be a dictionary", { context: { offset: at } });
      return { dict, end: tok.pos() };
    }
    function readXrefStreamDict(bytes, at) {
      const notStream = (why) => new ParseError("pdf/xref/not-xref-stream", `no cross-reference stream at offset ${at}: ${why}`, { context: { offset: at } });
      if (!Number.isInteger(at) || at < 0 || at >= bytes.length)
        throw notStream("offset outside the file");
      let num, gen, kw, dict, after;
      try {
        const tok = tokenize(bytes, { start: at });
        num = tok.next();
        gen = tok.next();
        kw = tok.next();
        if (!num || num.kind !== "int" || !gen || gen.kind !== "int" || !kw || kw.kind !== "kw" || kw.value !== "obj")
          throw notStream("no indirect object header");
        dict = parseObject(tok);
        after = tok.peek();
      } catch (e) {
        if (e && e.code === "pdf/xref/not-xref-stream")
          throw e;
        throw notStream("the object does not parse");
      }
      const type = dict && dict.type === "dict" && dict.entries.Type;
      if (!type || type.type !== "name" || type.value !== "XRef" || !after || after.kind !== "kw" || after.value !== "stream")
        throw notStream("the object is not a /Type /XRef stream");
      return { num: num.value, gen: gen.value, dict };
    }
    function byteWidth(n) {
      let w = 1;
      while (n > 255) {
        n = Math.floor(n / 256);
        w++;
      }
      return w;
    }
    function hexLit(bytes) {
      let s = "<";
      for (let i = 0;i < bytes.length; i++)
        s += "0123456789ABCDEF"[bytes[i] >> 4] + "0123456789ABCDEF"[bytes[i] & 15];
      return s + ">";
    }
    function isRef(r) {
      return !!r && Number.isInteger(r.num) && r.num >= 1;
    }
    function buildXrefStream(opts) {
      const bad = (why) => new RenderError("pdf/xref/bad-stream-section", `cannot build the cross-reference stream: ${why}`);
      if (!opts || !Number.isInteger(opts.num) || opts.num < 1)
        throw bad("num must be an integer >= 1");
      if (!Number.isInteger(opts.offset) || opts.offset < 0)
        throw bad("offset must be an integer >= 0");
      if (!Number.isInteger(opts.prev) || opts.prev < 0)
        throw bad("prev must be an integer >= 0");
      if (!isRef(opts.root))
        throw bad("root must be { num >= 1, gen }");
      if (opts.encrypt != null && !isRef(opts.encrypt))
        throw bad("encrypt must be an indirect reference { num >= 1, gen }");
      const rows = new Map;
      rows.set(0, [0, 0, 65535]);
      for (const e of opts.entries || []) {
        if (!e || !Number.isInteger(e.num) || e.num < 1 || !Number.isInteger(e.offset) || e.offset < 0)
          throw bad("each entry needs num >= 1 and offset >= 0");
        rows.set(e.num, [1, e.offset, e.gen | 0]);
      }
      rows.set(opts.num, [1, opts.offset, 0]);
      const nums = Array.from(rows.keys()).sort((a, b) => a - b);
      let max2 = 0, max3 = 0;
      for (const r of rows.values()) {
        if (r[1] > max2)
          max2 = r[1];
        if (r[2] > max3)
          max3 = r[2];
      }
      const w = [1, byteWidth(max2), byteWidth(max3)], rec = w[0] + w[1] + w[2], data = new Uint8Array(nums.length * rec);
      let o = 0;
      for (const n of nums) {
        const r = rows.get(n);
        let at = o;
        for (let f = 0;f < 3; f++) {
          let v = r[f];
          for (let k = w[f] - 1;k >= 0; k--) {
            data[at + k] = v & 255;
            v = Math.floor(v / 256);
          }
          at += w[f];
        }
        o += rec;
      }
      const index = [];
      for (let i = 0;i < nums.length; ) {
        let j = i;
        while (j + 1 < nums.length && nums[j + 1] === nums[j] + 1)
          j++;
        index.push(`${nums[i]} ${j - i + 1}`);
        i = j + 1;
      }
      let d = `<< /Type /XRef /Size ${Math.max(opts.num + 1, Number.isInteger(opts.size) ? opts.size : 0)} /W [${w.join(" ")}] /Index [${index.join(" ")}] /Root ${opts.root.num} ${opts.root.gen | 0} R`;
      if (isRef(opts.info))
        d += ` /Info ${opts.info.num} ${opts.info.gen | 0} R`;
      if (opts.id && opts.id[0] instanceof Uint8Array && opts.id[1] instanceof Uint8Array)
        d += ` /ID [${hexLit(opts.id[0])}${hexLit(opts.id[1])}]`;
      if (isRef(opts.encrypt))
        d += ` /Encrypt ${opts.encrypt.num} ${opts.encrypt.gen | 0} R`;
      d += ` /Prev ${opts.prev} /Length ${data.length} >>`;
      const te = new TextEncoder, head = te.encode(`${opts.num} 0 obj
${d}
stream
`), tail = te.encode(`
endstream
endobj
`), out = new Uint8Array(head.length + data.length + tail.length);
      out.set(head, 0);
      out.set(data, head.length);
      out.set(tail, head.length + data.length);
      return out;
    }
    return {
      locateStartXref,
      readStartXref,
      parseXrefTable,
      parseTrailerDict,
      readXrefStreamDict,
      buildXrefStream
    };
  } });
    __register({ name: "pdfTrailer", dependencies: ["pdfErrors","pdfParserObj"], factory: function(errors, parserObj) {
    const { ParseError } = errors, { isType } = parserObj;
    function typeTrailer(dict) {
      if (!isType(dict, "dict"))
        throw new ParseError("pdf/trailer/not-dict", "trailer is not a dictionary", { context: { type: dict && dict.type } });
      const e = dict.entries, size = e.Size;
      if (!size || size.type !== "int" || size.value < 0)
        throw new ParseError("pdf/trailer/missing-size", "trailer is missing required /Size entry", { context: { hasSize: !!size } });
      const root = e.Root;
      if (!root || root.type !== "ref")
        throw new ParseError("pdf/trailer/missing-root", "trailer is missing required /Root indirect reference", { context: { hasRoot: !!root, type: root && root.type } });
      const out = {
        size: size.value,
        root: { num: root.num, gen: root.gen },
        raw: dict
      };
      if (e.Info && e.Info.type === "ref")
        out.info = { num: e.Info.num, gen: e.Info.gen };
      if (e.Prev && e.Prev.type === "int")
        out.prev = e.Prev.value;
      if (e.Encrypt && e.Encrypt.type !== "null")
        out.encrypt = e.Encrypt.type === "ref" ? { num: e.Encrypt.num, gen: e.Encrypt.gen } : e.Encrypt;
      if (e.ID && e.ID.type === "array" && e.ID.items.length === 2 && e.ID.items[0].type === "string" && e.ID.items[1].type === "string")
        out.id = [e.ID.items[0].value, e.ID.items[1].value];
      return out;
    }
    return { typeTrailer };
  } });
    __register({ name: "pdfSerializer", dependencies: ["pdfErrors"], factory: function(errors) {
    const { RenderError } = errors, te = new TextEncoder;
    function serializeObject(obj) {
      if (!obj || typeof obj.type !== "string")
        throw new RenderError("pdf/serializer/bad-input", "serializeObject expects a typed object", { context: { typeof: typeof obj } });
      return concat(emitObject(obj));
    }
    function serializeIndirect(num, gen, body) {
      if (!Number.isFinite(num) || num < 0)
        throw new RenderError("pdf/serializer/bad-num", "object number must be a non-negative integer", { context: { num } });
      if (!Number.isFinite(gen) || gen < 0)
        throw new RenderError("pdf/serializer/bad-gen", "generation number must be a non-negative integer", { context: { gen } });
      const head = te.encode(`${num | 0} ${gen | 0} obj
`), tail = te.encode(`
endobj
`);
      if (body && body.type === "stream") {
        const raw = body.raw instanceof Uint8Array ? body.raw : new Uint8Array(0), updated = {
          type: "dict",
          entries: {
            ...(body.dict || { type: "dict", entries: {} }).entries,
            Length: { type: "int", value: raw.length }
          }
        }, dictBytes = concat(emitObject(updated)), streamHead = te.encode(`
stream
`), streamTail = te.encode(`
endstream`);
        return concatU8([head, dictBytes, streamHead, raw, streamTail, tail]);
      }
      return concatU8([head, concat(emitObject(body)), tail]);
    }
    function formatReal(n) {
      if (!Number.isFinite(n))
        throw new RenderError("pdf/serializer/bad-real", "real number must be finite", { context: { value: n } });
      if (Number.isInteger(n))
        return `${n}`;
      let s = n.toFixed(5);
      if (s.indexOf(".") >= 0) {
        s = s.replace(/0+$/, "");
        if (s.endsWith("."))
          s = s.slice(0, -1);
      }
      if (s === "-0")
        s = "0";
      return s;
    }
    function emitObject(o) {
      switch (o.type) {
        case "null":
          return ["null"];
        case "bool":
          return [o.value ? "true" : "false"];
        case "int":
          return [`${o.value | 0}`];
        case "real":
          return [formatReal(o.value)];
        case "name":
          return [emitName(o.value)];
        case "string":
          return [emitString(o)];
        case "array":
          return emitArray(o);
        case "dict":
          return emitDict(o);
        case "ref":
          return [`${o.num | 0} ${o.gen | 0} R`];
        case "stream":
          throw new RenderError("pdf/serializer/inline-stream", "stream objects must be serialized via serializeIndirect");
        default:
          throw new RenderError("pdf/serializer/unknown-type", `unknown object type "${o.type}"`, { context: { type: o.type } });
      }
    }
    function emitName(value) {
      let out = "/";
      for (let i = 0;i < value.length; i++) {
        const cp = value.codePointAt(i);
        if (cp > 65535)
          i++;
        if (cp < 33 || cp > 126 || cp === 35 || cp === 47 || cp === 40 || cp === 41 || cp === 60 || cp === 62 || cp === 91 || cp === 93 || cp === 123 || cp === 125 || cp === 37) {
          const enc = te.encode(String.fromCodePoint(cp));
          for (const b of enc)
            out += "#" + b.toString(16).padStart(2, "0").toUpperCase();
        } else
          out += String.fromCharCode(cp);
      }
      return out;
    }
    function emitString(o) {
      const bytes = o.value;
      if (!(bytes instanceof Uint8Array))
        throw new RenderError("pdf/serializer/bad-string", "string value must be Uint8Array", { context: { typeof: typeof bytes } });
      if (o.syntax === "hex" || shouldUseHex(bytes))
        return emitHexString(bytes);
      return emitLiteralString(bytes);
    }
    function shouldUseHex(bytes) {
      let bad = 0;
      for (let i = 0;i < bytes.length; i++) {
        const b = bytes[i];
        if (b < 9 || b > 13 && b < 32 || b >= 127)
          bad++;
        if (bad > bytes.length / 4)
          return !0;
      }
      return !1;
    }
    function emitLiteralString(bytes) {
      const out = ["("];
      for (let i = 0;i < bytes.length; i++) {
        const b = bytes[i];
        if (b === 92)
          out.push("\\\\");
        else if (b === 40)
          out.push("\\(");
        else if (b === 41)
          out.push("\\)");
        else if (b === 10)
          out.push("\\n");
        else if (b === 13)
          out.push("\\r");
        else if (b === 9)
          out.push("\\t");
        else if (b === 8)
          out.push("\\b");
        else if (b === 12)
          out.push("\\f");
        else if (b < 32 || b > 126)
          out.push("\\" + b.toString(8).padStart(3, "0"));
        else
          out.push(String.fromCharCode(b));
      }
      out.push(")");
      return out.join("");
    }
    function emitHexString(bytes) {
      let s = "<";
      for (let i = 0;i < bytes.length; i++)
        s += "0123456789ABCDEF"[bytes[i] >> 4] + "0123456789ABCDEF"[bytes[i] & 15];
      return s + ">";
    }
    function emitArray(o) {
      const parts = ["["];
      let first = !0;
      for (const it of o.items) {
        if (!first)
          parts.push(" ");
        first = !1;
        for (const p of emitObject(it))
          parts.push(p);
      }
      parts.push("]");
      return parts;
    }
    function emitDict(o) {
      const parts = ["<<"];
      for (const k of Object.keys(o.entries)) {
        parts.push(" ");
        parts.push(emitName(k));
        parts.push(" ");
        for (const p of emitObject(o.entries[k]))
          parts.push(p);
      }
      parts.push(" >>");
      return parts;
    }
    function concat(parts) {
      let s = "";
      for (const p of parts)
        s += p;
      return te.encode(s);
    }
    function concatU8(arrays) {
      let n = 0;
      for (const a of arrays)
        n += a.length;
      const out = new Uint8Array(n);
      let o = 0;
      for (const a of arrays) {
        out.set(a, o);
        o += a.length;
      }
      return out;
    }
    return { serializeObject, serializeIndirect, formatReal };
  } });
    __register({ name: "pdfCatalog", dependencies: ["pdfErrors","pdfParser"], factory: function(errors, parserMod) {
    const { ParseError } = errors, isType = parserMod && parserMod.isType || ((v, kind) => !!(v && v.type === kind)), KNOWN = new Set([
      "Type",
      "Version",
      "Pages",
      "PageLabels",
      "Names",
      "Dests",
      "ViewerPreferences",
      "PageLayout",
      "PageMode",
      "Outlines",
      "Threads",
      "OpenAction",
      "AA",
      "URI",
      "AcroForm",
      "Metadata",
      "StructTreeRoot",
      "MarkInfo",
      "Lang",
      "SpiderInfo",
      "OutputIntents",
      "PieceInfo",
      "OCProperties",
      "Perms",
      "Legal",
      "Requirements",
      "Collection",
      "NeedsRendering",
      "DSS",
      "AF",
      "DPartRoot",
      "Extensions"
    ]);
    function typeCatalog(dict) {
      if (!isType(dict, "dict"))
        throw new ParseError("pdf/catalog/not-dict", "Catalog must be a dictionary", { context: { type: dict && dict.type } });
      const e = dict.entries;
      if (e.Type && (e.Type.type !== "name" || e.Type.value !== "Catalog"))
        throw new ParseError("pdf/catalog/bad-type", "/Type entry must be /Catalog", { context: { actual: e.Type.value } });
      if (!e.Pages || e.Pages.type !== "ref")
        throw new ParseError("pdf/catalog/missing-pages", "Catalog is missing required /Pages reference", { context: { type: e.Pages && e.Pages.type } });
      const out = {
        pages: { num: e.Pages.num, gen: e.Pages.gen },
        raw: dict,
        _extras: {}
      };
      if (e.Version && e.Version.type === "name")
        out.version = e.Version.value;
      if (e.PageLayout && e.PageLayout.type === "name")
        out.pageLayout = e.PageLayout.value;
      if (e.PageMode && e.PageMode.type === "name")
        out.pageMode = e.PageMode.value;
      if (e.Lang && e.Lang.type === "string")
        out.lang = e.Lang.value;
      if (e.Outlines && e.Outlines.type === "ref")
        out.outlines = e.Outlines;
      if (e.Metadata && e.Metadata.type === "ref")
        out.metadata = e.Metadata;
      if (e.StructTreeRoot && e.StructTreeRoot.type === "ref")
        out.structTreeRoot = e.StructTreeRoot;
      if (e.AcroForm)
        out.acroForm = e.AcroForm;
      if (e.Names)
        out.names = e.Names;
      if (e.Dests)
        out.dests = e.Dests;
      if (e.ViewerPreferences)
        out.viewerPrefs = e.ViewerPreferences;
      if (e.PageLabels)
        out.pageLabels = e.PageLabels;
      if (e.MarkInfo)
        out.markInfo = e.MarkInfo;
      if (e.OCProperties)
        out.ocProperties = e.OCProperties;
      if (e.OutputIntents)
        out.outputIntents = e.OutputIntents;
      const has = (v) => !!v && v.type !== "null";
      if (has(e.Threads))
        out.threads = e.Threads;
      if (has(e.OpenAction))
        out.openAction = e.OpenAction;
      if (has(e.AA))
        out.aa = e.AA;
      if (has(e.URI))
        out.uri = e.URI;
      if (has(e.Extensions))
        out.extensions = e.Extensions;
      if (has(e.SpiderInfo))
        out.spiderInfo = e.SpiderInfo;
      if (has(e.PieceInfo))
        out.pieceInfo = e.PieceInfo;
      if (has(e.Perms))
        out.perms = e.Perms;
      if (has(e.Legal))
        out.legal = e.Legal;
      if (has(e.Requirements))
        out.requirements = e.Requirements;
      if (has(e.Collection))
        out.collection = e.Collection;
      if (isType(e.NeedsRendering, "bool"))
        out.needsRendering = e.NeedsRendering.value;
      if (has(e.DSS))
        out.dss = e.DSS;
      if (has(e.AF))
        out.af = e.AF;
      if (has(e.DPartRoot))
        out.dPartRoot = e.DPartRoot;
      for (const k of Object.keys(e))
        if (!KNOWN.has(k))
          out._extras[k] = e[k];
      return out;
    }
    return { typeCatalog };
  } });
    __register({ name: "pdfPages", dependencies: ["pdfErrors","pdfParser"], factory: function(errors, parserMod) {
    const { ParseError } = errors, isType = parserMod && parserMod.isType || ((v, kind) => !!(v && v.type === kind));
    function walkPageTree(rootRef, resolveRef, opts) {
      const maxDepth = opts && opts.maxDepth || 64, maxPages = opts && opts.maxPages || 200000, out = [], visited = new Set;
      walk(rootRef, 0);
      return out;
      function walk(ref, depth) {
        if (depth > maxDepth)
          throw new ParseError("pdf/pages/max-depth", "page tree depth limit exceeded", { context: { depth, maxDepth } });
        const key = ref.num + ":" + ref.gen;
        if (visited.has(key))
          throw new ParseError("pdf/pages/cycle", "cycle detected in page tree", { context: { ref } });
        visited.add(key);
        const node = resolveRef({ type: "ref", num: ref.num, gen: ref.gen });
        if (!isType(node, "dict"))
          throw new ParseError("pdf/pages/not-dict", "page tree node is not a dict", { context: { ref } });
        const t = node.entries.Type;
        if (t && t.type === "name" && t.value === "Page" || !node.entries.Kids && !t) {
          out.push({ num: ref.num, gen: ref.gen });
          if (out.length > maxPages)
            throw new ParseError("pdf/pages/too-many", "page count limit exceeded", { context: { maxPages } });
          return;
        }
        let kids = node.entries.Kids;
        if (kids && kids.type === "ref")
          kids = resolveRef(kids);
        if (!kids || kids.type !== "array")
          throw new ParseError("pdf/pages/missing-kids", "intermediate page tree node missing /Kids array", { context: { ref, hasKids: !!kids } });
        for (const k of kids.items) {
          if (k.type !== "ref")
            throw new ParseError("pdf/pages/non-ref-kid", "page tree /Kids entries must be indirect refs", { context: { kind: k.type } });
          walk({ num: k.num, gen: k.gen }, depth + 1);
        }
      }
    }
    function readPageCount(node) {
      if (!isType(node, "dict"))
        return null;
      const c = node.entries.Count;
      if (!c || c.type !== "int" && c.type !== "real")
        return null;
      return c.value | 0;
    }
    return { walkPageTree, readPageCount };
  } });
    __register({ name: "pdfPage", dependencies: ["pdfErrors","pdfParser"], factory: function(errors, parserMod) {
    const { ParseError } = errors, isType = parserMod && parserMod.isType || ((v, kind) => !!(v && v.type === kind)), KNOWN = new Set([
      "Type",
      "Parent",
      "LastModified",
      "Resources",
      "MediaBox",
      "CropBox",
      "BleedBox",
      "TrimBox",
      "ArtBox",
      "BoxColorInfo",
      "Contents",
      "Rotate",
      "Group",
      "Thumb",
      "B",
      "Dur",
      "Trans",
      "Annots",
      "AA",
      "Metadata",
      "PieceInfo",
      "StructParents",
      "ID",
      "PZ",
      "SeparationInfo",
      "Tabs",
      "TemplateInstantiated",
      "PresSteps",
      "UserUnit",
      "VP",
      "AF",
      "OutputIntents",
      "DPart",
      "AssociatedFiles",
      "Hid"
    ]), has = (v) => !!v && v.type !== "null", isNum = (v) => !!v && (v.type === "int" || v.type === "real");
    function toBox(v) {
      if (!v || v.type !== "array" || v.items.length !== 4)
        return null;
      const r = Array(4);
      for (let i = 0;i < 4; i++) {
        const it = v.items[i];
        if (!it || it.type !== "int" && it.type !== "real")
          return null;
        r[i] = it.value;
      }
      return r;
    }
    function toRotate(v) {
      if (!v || v.type !== "int" && v.type !== "real")
        return 0;
      const m = ((v.value | 0) % 360 + 360) % 360;
      if (m % 90 !== 0)
        return 0;
      return m;
    }
    function toContentsRefs(v) {
      if (!v)
        return [];
      if (v.type === "ref")
        return [{ num: v.num, gen: v.gen }];
      if (v.type === "array") {
        const out = [];
        for (const it of v.items)
          if (it.type === "ref")
            out.push({ num: it.num, gen: it.gen });
        return out;
      }
      return [];
    }
    function toAnnots(v) {
      if (!v)
        return [];
      if (v.type === "ref")
        return [v];
      if (v.type === "array")
        return v.items.slice();
      return [];
    }
    function typePage(dict) {
      if (!isType(dict, "dict"))
        throw new ParseError("pdf/page/not-dict", "Page must be a dictionary", { context: { type: dict && dict.type } });
      const e = dict.entries;
      if (e.Type && (e.Type.type !== "name" || e.Type.value !== "Page"))
        throw new ParseError("pdf/page/bad-type", "/Type must be /Page when present", { context: { actual: e.Type.value } });
      const out = {
        parent: e.Parent && e.Parent.type === "ref" ? { num: e.Parent.num, gen: e.Parent.gen } : null,
        mediaBox: toBox(e.MediaBox),
        resources: e.Resources || null,
        contents: toContentsRefs(e.Contents),
        rotate: toRotate(e.Rotate),
        annots: toAnnots(e.Annots),
        raw: dict,
        _extras: {}
      };
      if (e.CropBox)
        out.cropBox = toBox(e.CropBox);
      if (e.BleedBox)
        out.bleedBox = toBox(e.BleedBox);
      if (e.TrimBox)
        out.trimBox = toBox(e.TrimBox);
      if (e.ArtBox)
        out.artBox = toBox(e.ArtBox);
      if (e.UserUnit && e.UserUnit.type === "real")
        out.userUnit = e.UserUnit.value;
      if (e.UserUnit && e.UserUnit.type === "int")
        out.userUnit = e.UserUnit.value;
      if (e.Tabs && e.Tabs.type === "name")
        out.tabs = e.Tabs.value;
      if (e.Metadata)
        out.metadata = e.Metadata;
      if (e.Group)
        out.group = e.Group;
      if (isType(e.LastModified, "string"))
        out.lastModified = e.LastModified.value;
      if (has(e.BoxColorInfo))
        out.boxColorInfo = e.BoxColorInfo;
      if (has(e.Thumb))
        out.thumb = e.Thumb;
      if (has(e.B))
        out.b = e.B;
      if (isNum(e.Dur))
        out.dur = e.Dur.value;
      if (isType(e.Hid, "bool"))
        out.hid = e.Hid.value;
      if (has(e.Trans))
        out.trans = e.Trans;
      if (has(e.AA))
        out.aa = e.AA;
      if (has(e.PieceInfo))
        out.pieceInfo = e.PieceInfo;
      if (isType(e.StructParents, "int"))
        out.structParents = e.StructParents.value;
      if (isType(e.ID, "string"))
        out.id = e.ID.value;
      if (isNum(e.PZ))
        out.pz = e.PZ.value;
      if (has(e.SeparationInfo))
        out.separationInfo = e.SeparationInfo;
      if (isType(e.TemplateInstantiated, "name"))
        out.templateInstantiated = e.TemplateInstantiated.value;
      if (has(e.PresSteps))
        out.presSteps = e.PresSteps;
      if (has(e.VP))
        out.vp = e.VP;
      if (has(e.AF))
        out.af = e.AF;
      if (has(e.OutputIntents))
        out.outputIntents = e.OutputIntents;
      if (has(e.DPart))
        out.dPart = e.DPart;
      for (const k of Object.keys(e))
        if (!KNOWN.has(k))
          out._extras[k] = e[k];
      return out;
    }
    return { typePage };
  } });
    __register({ name: "pdfCrossRefStream", dependencies: ["pdfErrors","pdfParserObj"], factory: function(errors, parserObj) {
    const { ParseError } = errors, { isType } = parserObj;
    function readBE(bytes, off, len) {
      let v = 0;
      for (let i = 0;i < len; i++)
        v = v * 256 + bytes[off + i];
      return v;
    }
    function readInt(entry, label) {
      if (!entry || entry.type !== "int")
        throw new ParseError("pdf/xrefstm/missing-int", `XRef stream dict missing required /${label}`, { context: { label } });
      return entry.value;
    }
    function parseCrossRefStream(decoded, dict) {
      if (!(decoded instanceof Uint8Array))
        throw new ParseError("pdf/xrefstm/bad-input", "parseCrossRefStream expects Uint8Array");
      if (!isType(dict, "dict"))
        throw new ParseError("pdf/xrefstm/bad-dict", "XRef stream dict must be a typed dict");
      const e = dict.entries;
      if (!e.Type || e.Type.type !== "name" || e.Type.value !== "XRef")
        throw new ParseError("pdf/xrefstm/wrong-type", "/Type must be /XRef", { context: { actual: e.Type && e.Type.value } });
      const W = e.W;
      if (!W || W.type !== "array" || W.items.length !== 3)
        throw new ParseError("pdf/xrefstm/bad-W", "/W must be a 3-element array", { context: { items: W && W.items && W.items.length } });
      const w = W.items.map((it) => {
        if (it.type !== "int" || it.value < 0)
          throw new ParseError("pdf/xrefstm/bad-W-entry", "/W entries must be non-negative ints");
        return it.value;
      }), recordSize = w[0] + w[1] + w[2];
      if (recordSize <= 0)
        throw new ParseError("pdf/xrefstm/bad-W-zero", "/W must yield at least one non-zero field");
      let index;
      if (e.Index) {
        if (e.Index.type !== "array" || (e.Index.items.length & 1) !== 0)
          throw new ParseError("pdf/xrefstm/bad-Index", "/Index must be an array of (first, count) pairs");
        index = [];
        for (let i = 0;i < e.Index.items.length; i += 2) {
          const f = e.Index.items[i], c = e.Index.items[i + 1];
          if (f.type !== "int" || c.type !== "int")
            throw new ParseError("pdf/xrefstm/bad-Index-entry", "/Index entries must be ints");
          index.push([f.value, c.value]);
        }
      } else
        index = [[0, readInt(e.Size, "Size")]];
      const entries = {};
      let pos = 0;
      for (const [first, count] of index)
        for (let k = 0;k < count; k++) {
          if (pos + recordSize > decoded.length)
            throw new ParseError("pdf/xrefstm/truncated", "truncated xref stream payload", { context: { pos, recordSize, length: decoded.length } });
          const t = w[0] > 0 ? readBE(decoded, pos, w[0]) : 1, f2 = w[1] > 0 ? readBE(decoded, pos + w[0], w[1]) : 0, f3 = w[2] > 0 ? readBE(decoded, pos + w[0] + w[1], w[2]) : 0;
          pos += recordSize;
          const num = first + k;
          if (t === 0)
            entries[num] = { type: 0, offset: f2, gen: f3, free: !0 };
          else if (t === 1)
            entries[num] = { type: 1, offset: f2, gen: f3, free: !1 };
          else if (t === 2)
            entries[num] = {
              type: 2,
              objStm: f2,
              index: f3,
              free: !1,
              offset: 0,
              gen: 0
            };
          else
            entries[num] = { type: t, offset: 0, gen: 0, free: !0 };
        }
      return {
        entries,
        size: e.Size && e.Size.type === "int" ? e.Size.value : Object.keys(entries).length,
        trailer: dict
      };
    }
    return { parseCrossRefStream };
  } });
    __register({ name: "pdfObjStream", dependencies: ["pdfErrors","pdfParserObj","pdfTokenizer","pdfParser"], factory: function(errors, parserObj, tokenizerMod, parserMod) {
    const { ParseError } = errors, { isType } = parserObj, tokenize = tokenizerMod.tokenize, parseObject = parserMod.parseObject;
    function readInt(entry, label) {
      if (!entry || entry.type !== "int")
        throw new ParseError("pdf/objstm/missing-int", `ObjStm dict missing required /${label}`, { context: { label, hasEntry: !!entry, type: entry && entry.type } });
      return entry.value;
    }
    function parseObjectStream(decoded, dict) {
      if (!(decoded instanceof Uint8Array))
        throw new ParseError("pdf/objstm/bad-input", "parseObjectStream expects Uint8Array", { context: { typeof: typeof decoded } });
      if (!isType(dict, "dict"))
        throw new ParseError("pdf/objstm/bad-dict", "ObjStm dict must be a typed dict");
      const e = dict.entries;
      if (e.Type && (e.Type.type !== "name" || e.Type.value !== "ObjStm"))
        throw new ParseError("pdf/objstm/wrong-type", "/Type must be /ObjStm", { context: { actual: e.Type.value } });
      const N = readInt(e.N, "N"), First = readInt(e.First, "First");
      if (N < 0)
        throw new ParseError("pdf/objstm/bad-N", "/N must be non-negative", { context: { N } });
      if (First < 0 || First > decoded.length)
        throw new ParseError("pdf/objstm/bad-First", "/First out of payload range", { context: { First, length: decoded.length } });
      const header = tokenize(decoded, { start: 0, end: First }), nums = Array(N), offs = Array(N);
      for (let i = 0;i < N; i++) {
        const tNum = header.next(), tOff = header.next();
        if (!tNum || tNum.kind !== "int" || !tOff || tOff.kind !== "int")
          throw new ParseError("pdf/objstm/bad-pair", "ObjStm header expects N pairs of integers", { context: { index: i } });
        nums[i] = tNum.value;
        offs[i] = tOff.value;
      }
      const out = Array(N);
      for (let i = 0;i < N; i++) {
        const start = First + offs[i], end = i + 1 < N ? First + offs[i + 1] : decoded.length;
        if (start < First || end > decoded.length || start > end)
          throw new ParseError("pdf/objstm/bad-offset", "ObjStm member offset out of range", { context: { index: i, start, end, length: decoded.length } });
        const tok = tokenize(decoded, { start, end }), value = parseObject(tok);
        out[i] = { num: nums[i], gen: 0, value };
      }
      return out;
    }
    return { parseObjectStream };
  } });
    __register({ name: "pdfFlate", dependencies: ["pdfErrors","zlib"], factory: function(errors, fwZlib) {
    const { ParseError } = errors;
    if (!fwZlib || typeof fwZlib.unzlibSync !== "function" || typeof fwZlib.zlibSync !== "function")
      throw new ParseError("pdf/flate/missing-fw", "pdfFlate requires the @awacloud/fw zlib module", { context: { keys: fwZlib && Object.keys(fwZlib) } });
    function paeth(a, b, c) {
      const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
      if (pa <= pb && pa <= pc)
        return a;
      if (pb <= pc)
        return b;
      return c;
    }
    function predictorParams(params) {
      const predictor = params && params.predictor != null ? params.predictor | 0 : params && params.Predictor != null ? params.Predictor | 0 : 1, columns = params && params.columns != null ? params.columns | 0 : params && params.Columns != null ? params.Columns | 0 : 1, colors = params && params.colors != null ? params.colors | 0 : params && params.Colors != null ? params.Colors | 0 : 1, bpc = params && params.bitsPerComponent != null ? params.bitsPerComponent | 0 : params && params.BitsPerComponent != null ? params.BitsPerComponent | 0 : 8;
      if (predictor !== 1 && predictor !== 2 && (predictor < 10 || predictor > 15))
        throw new ParseError("pdf/flate/bad-predictor", "unsupported Predictor value", { context: { predictor } });
      if (columns <= 0 || colors <= 0 || bpc <= 0)
        throw new ParseError("pdf/flate/bad-predictor-params", "Columns, Colors and BitsPerComponent must be > 0", { context: { columns, colors, bpc } });
      const bitsPerPixel = colors * bpc, bytesPerPixel = Math.max(1, bitsPerPixel + 7 >> 3), rowBytes = columns * bitsPerPixel + 7 >> 3;
      return { predictor, columns, colors, bpc, bytesPerPixel, rowBytes };
    }
    function pngUnfilterRow(filter, row, prevRow, bpp) {
      const out = new Uint8Array(row.length);
      for (let i = 0;i < row.length; i++) {
        const left = i >= bpp ? out[i - bpp] : 0, up = prevRow ? prevRow[i] : 0, upLeft = prevRow && i >= bpp ? prevRow[i - bpp] : 0;
        let v = row[i];
        switch (filter) {
          case 0:
            break;
          case 1:
            v = v + left & 255;
            break;
          case 2:
            v = v + up & 255;
            break;
          case 3:
            v = v + (left + up >> 1) & 255;
            break;
          case 4:
            v = v + paeth(left, up, upLeft) & 255;
            break;
          default:
            throw new ParseError("pdf/flate/bad-png-filter", "unknown PNG filter tag", { context: { tag: filter } });
        }
        out[i] = v;
      }
      return out;
    }
    function pngFilterRow(filter, row, prevRow, bpp) {
      const out = new Uint8Array(row.length);
      for (let i = 0;i < row.length; i++) {
        const left = i >= bpp ? row[i - bpp] : 0, up = prevRow ? prevRow[i] : 0, upLeft = prevRow && i >= bpp ? prevRow[i - bpp] : 0, v = row[i];
        switch (filter) {
          case 0:
            out[i] = v;
            break;
          case 1:
            out[i] = v - left & 255;
            break;
          case 2:
            out[i] = v - up & 255;
            break;
          case 3:
            out[i] = v - (left + up >> 1) & 255;
            break;
          default:
            out[i] = v - paeth(left, up, upLeft) & 255;
            break;
        }
      }
      return out;
    }
    function tiff2Decode(bytes, p) {
      if (p.bpc !== 8)
        throw new ParseError("pdf/flate/tiff-bpc-unsupported", "TIFF Predictor 2 requires BitsPerComponent=8", { context: { bpc: p.bpc } });
      const out = new Uint8Array(bytes.length), stride = p.colors, rowBytes = p.rowBytes, rows = bytes.length / rowBytes | 0;
      for (let r = 0;r < rows; r++) {
        const base = r * rowBytes;
        for (let i = 0;i < rowBytes; i++) {
          const left = i >= stride ? out[base + i - stride] : 0;
          out[base + i] = bytes[base + i] + left & 255;
        }
      }
      return out;
    }
    function tiff2Encode(bytes, p) {
      if (p.bpc !== 8)
        throw new ParseError("pdf/flate/tiff-bpc-unsupported", "TIFF Predictor 2 requires BitsPerComponent=8", { context: { bpc: p.bpc } });
      const out = new Uint8Array(bytes.length), stride = p.colors, rowBytes = p.rowBytes, rows = bytes.length / rowBytes | 0;
      for (let r = 0;r < rows; r++) {
        const base = r * rowBytes;
        for (let i = 0;i < rowBytes; i++) {
          const left = i >= stride ? bytes[base + i - stride] : 0;
          out[base + i] = bytes[base + i] - left & 255;
        }
      }
      return out;
    }
    function pngDecode(bytes, p) {
      const rowBytes = p.rowBytes, stride = rowBytes + 1;
      if (bytes.length % stride !== 0)
        throw new ParseError("pdf/flate/png-row-mismatch", "predicted stream length is not a multiple of (rowBytes+1)", { context: { length: bytes.length, stride } });
      const rows = bytes.length / stride, out = new Uint8Array(rows * rowBytes);
      let prev = null;
      for (let r = 0;r < rows; r++) {
        const tag = bytes[r * stride], row = bytes.subarray(r * stride + 1, r * stride + stride), unfiltered = pngUnfilterRow(tag, row, prev, p.bytesPerPixel);
        out.set(unfiltered, r * rowBytes);
        prev = unfiltered;
      }
      return out;
    }
    function pngEncode(bytes, p) {
      const rowBytes = p.rowBytes;
      if (bytes.length % rowBytes !== 0)
        throw new ParseError("pdf/flate/png-row-mismatch", "input length is not a multiple of rowBytes", { context: { length: bytes.length, rowBytes } });
      const rows = bytes.length / rowBytes, outStride = rowBytes + 1, out = new Uint8Array(rows * outStride), forced = p.predictor === 15 ? -1 : p.predictor - 10;
      let prev = null;
      for (let r = 0;r < rows; r++) {
        const row = bytes.subarray(r * rowBytes, (r + 1) * rowBytes);
        let tag = forced;
        if (tag < 0)
          tag = r === 0 ? 0 : 2;
        const filtered = pngFilterRow(tag, row, prev, p.bytesPerPixel);
        out[r * outStride] = tag;
        out.set(filtered, r * outStride + 1);
        prev = row;
      }
      return out;
    }
    function endedBeforeFinalBlock(e) {
      return !!e && e.code === "EEOF";
    }
    const limits = Object.freeze({ maxOutput: 268435456 }), SAFE_RATIO = 2048, CHUNK = 16384;
    function outputLimit(max, length) {
      return new ParseError("pdf/flate/output-limit", "inflated stream exceeds maxOutput", { context: { limit: "maxOutput", max, length } });
    }
    function inflateChunked(bytes, max, final) {
      const chunks = [];
      let total = 0;
      const stream = new fwZlib.UnzlibStream({ verify: !1 }, (chunk) => {
        total += chunk.length;
        if (max && total > max)
          throw outputLimit(max, bytes.length);
        chunks.push(chunk);
      });
      if (bytes.length === 0)
        stream.push(bytes, final);
      for (let off = 0;off < bytes.length; off += CHUNK) {
        const end = Math.min(off + CHUNK, bytes.length);
        stream.push(bytes.subarray(off, end), final && end === bytes.length);
      }
      const out = new Uint8Array(total);
      let off = 0;
      for (const chunk of chunks) {
        out.set(chunk, off);
        off += chunk.length;
      }
      return out;
    }
    function plainZlibHeader(b) {
      return b.length >= 2 && (b[0] & 15) === 8 && b[0] >> 4 <= 7 && (b[0] << 8 | b[1]) % 31 === 0 && !(b[1] & 32);
    }
    function inflate(bytes, max) {
      if (!max || bytes.length <= max / SAFE_RATIO || typeof fwZlib.UnzlibStream !== "function" || !plainZlibHeader(bytes))
        return fwZlib.unzlibSync(bytes, { verify: !1 });
      return inflateChunked(bytes, max, !0);
    }
    function isOutputLimit(e) {
      return e instanceof ParseError && e.code === "pdf/flate/output-limit";
    }
    function markTruncated(out) {
      Object.defineProperty(out, "truncated", { value: !0, enumerable: !1 });
      return out;
    }
    function decode(bytes, params, opts) {
      if (!(bytes instanceof Uint8Array))
        throw new ParseError("pdf/flate/bad-input", "FlateDecode expects Uint8Array");
      const max = opts && opts.maxOutput !== void 0 ? opts.maxOutput : limits.maxOutput;
      let raw, truncated = !1;
      try {
        raw = inflate(bytes, max);
      } catch (e) {
        if (isOutputLimit(e))
          throw e;
        const inflateFailed = () => new ParseError("pdf/flate/inflate-failed", "inflate failed: " + (e && e.message), { context: { length: bytes.length }, cause: e });
        if (!endedBeforeFinalBlock(e) || typeof fwZlib.UnzlibStream !== "function")
          throw inflateFailed();
        let prefix;
        try {
          prefix = inflateChunked(bytes, max, !1);
        } catch (e2) {
          if (isOutputLimit(e2))
            throw e2;
          throw inflateFailed();
        }
        if (prefix.length === 0)
          throw inflateFailed();
        raw = prefix;
        truncated = !0;
      }
      const done = (out) => truncated ? markTruncated(out) : out;
      if (!params)
        return done(raw);
      if (!(params.predictor != null && params.predictor !== 1 || params.Predictor != null && params.Predictor !== 1))
        return done(raw);
      const p = predictorParams(params);
      if (p.predictor === 1)
        return done(raw);
      const stride = p.predictor === 2 ? p.rowBytes : p.rowBytes + 1;
      if (truncated)
        raw = raw.subarray(0, raw.length - raw.length % stride);
      if (p.predictor === 2)
        return done(tiff2Decode(raw, p));
      return done(pngDecode(raw, p));
    }
    function encode(bytes, params) {
      if (!(bytes instanceof Uint8Array))
        throw new ParseError("pdf/flate/bad-input", "FlateEncode expects Uint8Array");
      let payload = bytes;
      if (params) {
        if (params.predictor != null && params.predictor !== 1 || params.Predictor != null && params.Predictor !== 1) {
          const p = predictorParams(params);
          if (p.predictor === 2)
            payload = tiff2Encode(bytes, p);
          else if (p.predictor >= 10)
            payload = pngEncode(bytes, p);
        }
      }
      try {
        return fwZlib.zlibSync(payload);
      } catch (e) {
        throw new ParseError("pdf/flate/deflate-failed", "deflate failed: " + (e && e.message), { context: { length: payload.length }, cause: e });
      }
    }
    return { decode, encode, limits };
  } });
    __register({ name: "pdfAsciiHex", dependencies: ["pdfErrors"], factory: function(errors) {
    const { ParseError } = errors, HEX_LO = [
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      0,
      1,
      2,
      3,
      4,
      5,
      6,
      7,
      8,
      9,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      10,
      11,
      12,
      13,
      14,
      15,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      10,
      11,
      12,
      13,
      14,
      15,
      -1
    ];
    function isWs(b) {
      return b === 32 || b === 9 || b === 10 || b === 13 || b === 12 || b === 0;
    }
    function decode(bytes) {
      if (!(bytes instanceof Uint8Array))
        throw new ParseError("pdf/asciiHex/bad-input", "ASCIIHexDecode expects Uint8Array");
      const out = [];
      let pending = -1;
      for (let i = 0;i < bytes.length; i++) {
        const b = bytes[i];
        if (b === 62)
          break;
        if (isWs(b))
          continue;
        const v = b < HEX_LO.length ? HEX_LO[b] : -1;
        if (v < 0)
          throw new ParseError("pdf/asciiHex/bad-digit", "invalid hex digit", { context: { offset: i, byte: b } });
        if (pending < 0)
          pending = v;
        else {
          out.push(pending << 4 | v);
          pending = -1;
        }
      }
      if (pending >= 0)
        out.push(pending << 4);
      return Uint8Array.from(out);
    }
    function encode(bytes) {
      if (!(bytes instanceof Uint8Array))
        throw new ParseError("pdf/asciiHex/bad-input", "ASCIIHexEncode expects Uint8Array");
      const H = "0123456789ABCDEF";
      let s = "";
      for (let i = 0;i < bytes.length; i++) {
        if (i > 0 && (i & 31) === 0)
          s += `
`;
        const b = bytes[i];
        s += H[b >> 4] + H[b & 15];
      }
      s += ">";
      return new TextEncoder().encode(s);
    }
    return { decode, encode };
  } });
    __register({ name: "pdfAscii85", dependencies: ["pdfErrors"], factory: function(errors) {
    const { ParseError } = errors;
    function isWs(b) {
      return b === 32 || b === 9 || b === 10 || b === 13 || b === 12 || b === 0;
    }
    function decode(bytes) {
      if (!(bytes instanceof Uint8Array))
        throw new ParseError("pdf/ascii85/bad-input", "ASCII85Decode expects Uint8Array");
      const out = [];
      let group = 0, count = 0;
      for (let i = 0;i < bytes.length; i++) {
        const b = bytes[i];
        if (isWs(b))
          continue;
        if (b === 126) {
          if (i + 1 < bytes.length && bytes[i + 1] === 62)
            break;
          throw new ParseError("pdf/ascii85/bad-eod", "~ not followed by >", { context: { offset: i } });
        }
        if (b === 122) {
          if (count !== 0)
            throw new ParseError("pdf/ascii85/bad-z", "z must appear at group boundary", { context: { offset: i } });
          out.push(0, 0, 0, 0);
          continue;
        }
        if (b < 33 || b > 117)
          throw new ParseError("pdf/ascii85/bad-digit", "character outside ! .. u", { context: { offset: i, byte: b } });
        group = group * 85 + (b - 33);
        count++;
        if (count === 5) {
          out.push(group >>> 24 & 255, group >>> 16 & 255, group >>> 8 & 255, group & 255);
          group = 0;
          count = 0;
        }
      }
      if (count > 0) {
        for (let k = count;k < 5; k++)
          group = group * 85 + 84;
        const decoded = [
          group >>> 24 & 255,
          group >>> 16 & 255,
          group >>> 8 & 255,
          group & 255
        ];
        for (let k = 0;k < count - 1; k++)
          out.push(decoded[k]);
      }
      return Uint8Array.from(out);
    }
    function encode(bytes) {
      if (!(bytes instanceof Uint8Array))
        throw new ParseError("pdf/ascii85/bad-input", "ASCII85Encode expects Uint8Array");
      const chars = [];
      let i = 0;
      while (i + 4 <= bytes.length) {
        const v = bytes[i] * 16777216 + (bytes[i + 1] << 16) + (bytes[i + 2] << 8) + bytes[i + 3];
        if (v === 0)
          chars.push(122);
        else {
          const g = [0, 0, 0, 0, 0];
          let n = v;
          for (let k = 4;k >= 0; k--) {
            g[k] = n % 85 + 33;
            n = Math.floor(n / 85);
          }
          chars.push(g[0], g[1], g[2], g[3], g[4]);
        }
        i += 4;
      }
      const rem = bytes.length - i;
      if (rem > 0) {
        const padded = new Uint8Array(4);
        padded.set(bytes.subarray(i));
        const v = padded[0] * 16777216 + (padded[1] << 16) + (padded[2] << 8) + padded[3], g = [0, 0, 0, 0, 0];
        let n = v;
        for (let k = 4;k >= 0; k--) {
          g[k] = n % 85 + 33;
          n = Math.floor(n / 85);
        }
        for (let k = 0;k < rem + 1; k++)
          chars.push(g[k]);
      }
      chars.push(126, 62);
      return Uint8Array.from(chars);
    }
    return { decode, encode };
  } });
    __register({ name: "pdfRunLength", dependencies: ["pdfErrors"], factory: function(errors) {
    const { ParseError } = errors;
    function decode(bytes) {
      if (!(bytes instanceof Uint8Array))
        throw new ParseError("pdf/runLength/bad-input", "RunLengthDecode expects Uint8Array");
      const out = [];
      let i = 0;
      while (i < bytes.length) {
        const n = bytes[i++];
        if (n === 128)
          break;
        if (n < 128) {
          const count = n + 1;
          if (i + count > bytes.length)
            throw new ParseError("pdf/runLength/truncated-literal", "truncated literal run", { context: { offset: i - 1, want: count, have: bytes.length - i } });
          for (let k = 0;k < count; k++)
            out.push(bytes[i + k]);
          i += count;
        } else {
          if (i >= bytes.length)
            throw new ParseError("pdf/runLength/truncated-repeat", "truncated repeat run", { context: { offset: i - 1 } });
          const v = bytes[i++], count = 257 - n;
          for (let k = 0;k < count; k++)
            out.push(v);
        }
      }
      return Uint8Array.from(out);
    }
    function encode(bytes) {
      if (!(bytes instanceof Uint8Array))
        throw new ParseError("pdf/runLength/bad-input", "RunLengthEncode expects Uint8Array");
      const out = [];
      let i = 0;
      while (i < bytes.length) {
        const v = bytes[i];
        let runLen = 1;
        while (runLen < 128 && i + runLen < bytes.length && bytes[i + runLen] === v)
          runLen++;
        if (runLen >= 3) {
          out.push(257 - runLen, v);
          i += runLen;
          continue;
        }
        let litStart = i, litLen = 0;
        while (litLen < 128 && i < bytes.length) {
          let look = 1;
          while (look < 3 && i + look < bytes.length && bytes[i + look] === bytes[i])
            look++;
          if (look >= 3 && litLen > 0)
            break;
          i++;
          litLen++;
        }
        out.push(litLen - 1);
        for (let k = 0;k < litLen; k++)
          out.push(bytes[litStart + k]);
      }
      out.push(128);
      return Uint8Array.from(out);
    }
    return { decode, encode };
  } });
    __register({ name: "pdfFilterDispatch", dependencies: ["pdfErrors","pdfFlate","pdfAsciiHex","pdfAscii85","pdfRunLength"], factory: function(errors, flate, asciiHex, ascii85, runLength) {
    const { ParseError, ContractError } = errors;
    function isType(node, kind) {
      return !!(node && node.type === kind);
    }
    const ABBREV = {
      Fl: "FlateDecode",
      AHx: "ASCIIHexDecode",
      A85: "ASCII85Decode",
      RL: "RunLengthDecode",
      LZW: "LZWDecode",
      DCT: "DCTDecode",
      JPX: "JPXDecode",
      CCF: "CCITTFaxDecode"
    };
    function resolveAbbrev(name) {
      return ABBREV[name] || name;
    }
    function passthrough() {
      return {
        decode(bytes) {
          return bytes;
        },
        encode(bytes) {
          return bytes;
        }
      };
    }
    function normalizeFilterList(filterEntry) {
      if (!filterEntry)
        return [];
      if (filterEntry.type === "name")
        return [resolveAbbrev(filterEntry.value)];
      if (filterEntry.type === "array") {
        const out = [];
        for (const it of filterEntry.items) {
          if (it.type !== "name")
            throw new ParseError("pdf/filter/non-name", "/Filter array entries must be names", { context: { kind: it.type } });
          out.push(resolveAbbrev(it.value));
        }
        return out;
      }
      throw new ParseError("pdf/filter/bad-type", "/Filter must be a name or array of names", { context: { type: filterEntry.type } });
    }
    function applyDecodeChain(bytes, filters, params, decoders) {
      let cur = bytes;
      for (let i = 0;i < filters.length; i++) {
        const name = filters[i], p = params ? params[i] || null : null, dec = decoders[name];
        if (!dec)
          throw new ParseError("pdf/filter/unsupported", `filter "${name}" not registered`, { context: { name, available: Object.keys(decoders) } });
        cur = dec.decode(cur, p);
      }
      return cur;
    }
    function applyEncodeChain(bytes, filters, params, decoders) {
      let cur = bytes;
      for (let i = 0;i < filters.length; i++) {
        const name = filters[i], p = params ? params[i] || null : null, enc = decoders[name];
        if (!enc || typeof enc.encode !== "function")
          throw new ParseError("pdf/filter/no-encoder", `filter "${name}" has no encoder`, { context: { name } });
        cur = enc.encode(cur, p);
      }
      return cur;
    }
    function plainParams(dictNode) {
      const entries = dictNode.entries || {}, out = {};
      for (const key of Object.keys(entries)) {
        const v = entries[key];
        out[key] = v ? v.value : void 0;
      }
      return out;
    }
    function decodeParmsList(entry, count) {
      if (!entry)
        return null;
      if (entry.type === "null")
        return null;
      if (entry.type === "dict") {
        const arr = Array(count).fill(null);
        if (count > 0)
          arr[0] = plainParams(entry);
        return arr;
      }
      if (entry.type === "array")
        return entry.items.map((it) => it.type === "dict" ? plainParams(it) : null);
      throw new ParseError("pdf/filter/bad-decodeparms", "/DecodeParms must be a dict, array, or null", { context: { type: entry.type } });
    }
    function decodeStream(streamObj, decoders) {
      if (!isType(streamObj, "stream"))
        throw new ParseError("pdf/filter/not-stream", "decodeStream expects a stream object");
      const dict = streamObj.dict, filters = normalizeFilterList(dict.entries.Filter), params = decodeParmsList(dict.entries.DecodeParms, filters.length);
      return applyDecodeChain(streamObj.raw, filters, params, decoders);
    }
    const decoders = {
      FlateDecode: flate,
      ASCIIHexDecode: asciiHex,
      ASCII85Decode: ascii85,
      RunLengthDecode: runLength,
      DCTDecode: passthrough(),
      JPXDecode: passthrough(),
      Crypt: passthrough()
    };
    function decode(streamObj) {
      return decodeStream(streamObj, decoders);
    }
    function decodeChain(bytes, filters, params) {
      return applyDecodeChain(bytes, filters, params, decoders);
    }
    function encodeChain(bytes, filters, params) {
      return applyEncodeChain(bytes, filters, params, decoders);
    }
    function register(name, impl) {
      decoders[name] = impl;
    }
    function names() {
      return Object.keys(decoders);
    }
    function filterNames(v) {
      if (v === void 0)
        return [];
      if (isType(v, "name"))
        return [v.value];
      if (isType(v, "array") && v.items.every((it) => isType(it, "name")))
        return v.items.map((it) => it.value);
      return null;
    }
    function filterParms(v) {
      if (isType(v, "dict"))
        return [v];
      if (isType(v, "array") && v.items.every((it) => isType(it, "dict") || isType(it, "null")))
        return v.items.map((it) => isType(it, "dict") ? it : null);
      return null;
    }
    function typeStreamEntries(streamObj) {
      const dict = isType(streamObj, "stream") ? streamObj.dict : streamObj;
      if (!isType(dict, "dict"))
        throw new ParseError("pdf/filter/not-stream", "typeStreamEntries expects a stream or a stream dictionary", { context: { type: streamObj && streamObj.type } });
      const e = dict.entries, refOf = (v) => isType(v, "ref") ? { num: v.num, gen: v.gen } : null;
      return {
        length: isType(e.Length, "int") ? e.Length.value : refOf(e.Length),
        filter: filterNames(e.Filter),
        decodeParms: filterParms(e.DecodeParms),
        f: isType(e.F, "string") ? e.F.value : isType(e.F, "dict") ? e.F : refOf(e.F),
        fFilter: filterNames(e.FFilter),
        fDecodeParms: filterParms(e.FDecodeParms),
        dl: isType(e.DL, "int") && e.DL.value >= 0 ? e.DL.value : null
      };
    }
    const DECODE_READ = Object.freeze({
      int: (v) => isType(v, "int") ? v.value : null,
      bool: (v) => isType(v, "bool") ? v.value : null,
      name: (v) => isType(v, "name") ? v.value : null,
      stream: (v) => isType(v, "stream") ? v : null
    }), keyTypes = (text) => Object.freeze(Object.fromEntries(text.split(" ").map((p) => p.split(":")))), PREDICTOR = "Predictor:int Colors:int BitsPerComponent:int Columns:int", DECODE_PARMS_TYPES = Object.freeze({
      FlateDecode: keyTypes(PREDICTOR),
      LZWDecode: keyTypes(`${PREDICTOR} EarlyChange:int`),
      CCITTFaxDecode: keyTypes("K:int EndOfLine:bool EncodedByteAlign:bool Columns:int Rows:int EndOfBlock:bool BlackIs1:bool DamagedRowsBeforeError:int"),
      DCTDecode: keyTypes("ColorTransform:int"),
      JBIG2Decode: keyTypes("JBIG2Globals:stream"),
      Crypt: keyTypes("Type:name Name:name")
    }), DECODE_PARMS_KEYS = Object.freeze(Object.fromEntries(Object.entries(DECODE_PARMS_TYPES).map(([filter, types]) => [filter, Object.freeze(Object.keys(types))])));
    function typeDecodeParms(dict, filter) {
      const name = typeof filter === "string" ? resolveAbbrev(filter) : filter;
      if (typeof name !== "string" || !Object.prototype.hasOwnProperty.call(DECODE_PARMS_TYPES, name))
        throw new ContractError("pdf/filter/decodeparms/filter", "filter must be a key of DECODE_PARMS_KEYS", { context: { filter } });
      if (!isType(dict, "dict"))
        throw new ParseError("pdf/filter/decodeparms/not-dict", "decode parameters must be a dictionary", { context: { type: dict && dict.type } });
      const types = DECODE_PARMS_TYPES[name], out = { raw: dict, _extras: {} };
      for (const [k, v] of Object.entries(dict.entries))
        if (!Object.prototype.hasOwnProperty.call(types, k))
          out._extras[k] = v;
        else
          out[k.toLowerCase()] = isType(v, "ref") ? v : DECODE_READ[types[k]](v);
      return out;
    }
    return {
      typeStreamEntries,
      typeDecodeParms,
      DECODE_PARMS_KEYS,
      decode,
      decodeChain,
      encodeChain,
      register,
      names,
      decoders,
      normalizeFilterList,
      applyDecodeChain,
      applyEncodeChain,
      decodeStream
    };
  } });
    __register({ name: "pdfSecurity", dependencies: ["pdfErrors"], factory: function(errors) {
    const { EncryptionError } = errors;
    function asUint8(v) {
      if (v == null)
        return;
      if (v instanceof Uint8Array)
        return v;
      if (typeof v === "string") {
        const out = new Uint8Array(v.length);
        for (let i = 0;i < v.length; i++)
          out[i] = v.charCodeAt(i) & 255;
        return out;
      }
      if (Array.isArray(v))
        return new Uint8Array(v);
      return;
    }
    function recipientsOf(v) {
      if (v == null)
        return;
      const items = Array.isArray(v) ? v : typeof v === "object" && v.type === "array" && Array.isArray(v.items) ? v.items : null;
      if (!items)
        return;
      return items.map((i) => asUint8(i && typeof i === "object" && i.type === "string" ? i.value : i)).filter(Boolean);
    }
    function typeEncryptDict(dict) {
      if (dict == null || typeof dict !== "object")
        throw new EncryptionError("pdf/crypto/encrypt-dict/bad-input", "/Encrypt must be a dictionary");
      const isNode = !(dict instanceof Map) && dict.type === "dict" && dict.entries !== null && typeof dict.entries === "object", plain = (n) => n && typeof n === "object" && (n.type === "int" || n.type === "real" || n.type === "bool" || n.type === "string") ? n.value : n, get = (k) => dict instanceof Map ? dict.get(k) : isNode ? plain(dict.entries[k]) : dict[k], V = get("V"), R = get("R"), Filter = get("Filter"), filterName = Filter && typeof Filter === "object" && Filter.type === "name" ? Filter.value : Filter;
      if (V === void 0 || R === void 0 && (filterName === void 0 || filterName === null || filterName === "Standard"))
        throw new EncryptionError("pdf/crypto/encrypt-dict/missing-V-R", "/Encrypt requires both /V and /R", { context: { V, R } });
      if (typeof V !== "number" || R !== void 0 && typeof R !== "number")
        throw new EncryptionError("pdf/crypto/encrypt-dict/bad-V-R-type", "/V and /R must be integers", { context: { V, R } });
      return {
        V,
        R,
        Filter,
        SubFilter: get("SubFilter"),
        Length: get("Length"),
        CF: get("CF"),
        StmF: get("StmF"),
        StrF: get("StrF"),
        EFF: get("EFF"),
        O: asUint8(get("O")),
        U: asUint8(get("U")),
        OE: asUint8(get("OE")),
        UE: asUint8(get("UE")),
        Perms: asUint8(get("Perms")),
        EncryptMetadata: get("EncryptMetadata") !== !1,
        Recipients: recipientsOf(get("Recipients")),
        P: get("P"),
        raw: dict
      };
    }
    function nameValue(v) {
      if (v == null)
        return null;
      if (typeof v === "string")
        return v;
      if (typeof v === "object" && v.type === "name")
        return v.value;
      return null;
    }
    function dictGet(d, key) {
      if (d == null)
        return;
      if (d instanceof Map)
        return d.get(key);
      if (typeof d === "object" && d.type === "dict" && d.entries)
        return d.entries[key];
      if (typeof d === "object")
        return d[key];
      return;
    }
    function resolveV4Method(typedEncrypt) {
      const stmFName = nameValue(typedEncrypt.StmF) || "Identity", strFName = nameValue(typedEncrypt.StrF) || "Identity", effName = nameValue(typedEncrypt.EFF) || stmFName, streamMethod = stmFName === "Identity" ? "Identity" : resolveCfmFor(typedEncrypt, stmFName), stringMethod = strFName === "Identity" ? "Identity" : resolveCfmFor(typedEncrypt, strFName), embeddedFileMethod = effName === "Identity" ? "Identity" : resolveCfmFor(typedEncrypt, effName);
      return {
        method: streamMethod,
        strMethod: stringMethod,
        effMethod: embeddedFileMethod
      };
    }
    function resolveCfmFor(typedEncrypt, filterName) {
      const cf = typedEncrypt.CF, entry = dictGet(cf, filterName);
      if (!entry)
        throw new EncryptionError("pdf/crypto/v4/missing-cf-entry", "V=4 requires /CF /" + filterName + " entry", { context: { filterName } });
      const cfm = nameValue(dictGet(entry, "CFM"));
      if (cfm !== "AESV2" && cfm !== "V2")
        throw new EncryptionError("pdf/crypto/v4/bad-cfm", "V=4 CFM must be AESV2 or V2", { context: { cfm } });
      return cfm;
    }
    function resolveV5Method(typedEncrypt) {
      const stmFName = nameValue(typedEncrypt.StmF) || "Identity", strFName = nameValue(typedEncrypt.StrF) || "Identity", effName = nameValue(typedEncrypt.EFF) || stmFName, streamMethod = stmFName === "Identity" ? "Identity" : resolveCfmForV5(typedEncrypt, stmFName), stringMethod = strFName === "Identity" ? "Identity" : resolveCfmForV5(typedEncrypt, strFName), embeddedFileMethod = effName === "Identity" ? "Identity" : resolveCfmForV5(typedEncrypt, effName);
      return {
        method: streamMethod,
        strMethod: stringMethod,
        effMethod: embeddedFileMethod
      };
    }
    function resolveCfmForV5(typedEncrypt, filterName) {
      const cf = typedEncrypt.CF, entry = dictGet(cf, filterName);
      if (!entry)
        return "AESV3";
      const cfm = nameValue(dictGet(entry, "CFM"));
      if (cfm == null)
        return "AESV3";
      if (cfm !== "AESV3" && cfm !== "AESV4")
        throw new EncryptionError("pdf/crypto/v5/bad-cfm", "V=5 CFM must be AESV3 or AESV4", { context: { cfm } });
      return cfm;
    }
    function selectHandler(typedEncrypt, handlers) {
      if (!typedEncrypt || typeof typedEncrypt !== "object")
        throw new EncryptionError("pdf/crypto/security/bad-typed", "selectHandler requires a typed /Encrypt");
      const { V, R } = typedEncrypt;
      if (V < 4)
        throw new EncryptionError("pdf/crypto/unsupported-version", "Security Handler V=" + V + " is not supported at this level", { context: { V, R } });
      if (V === 4) {
        if (R !== 4)
          throw new EncryptionError("pdf/crypto/unsupported-version", "Standard handler V=4 requires R=4", { context: { V, R } });
        if (!handlers || !handlers.v4)
          throw new EncryptionError("pdf/crypto/missing-handler", "no v4 handler provided");
        const m = resolveV4Method(typedEncrypt);
        return {
          handler: handlers.v4,
          revision: 4,
          method: m.method,
          strMethod: m.strMethod,
          effMethod: m.effMethod
        };
      }
      if (V !== 5)
        throw new EncryptionError("pdf/crypto/unsupported-version", "Security Handler V=" + V + " is unknown", { context: { V, R } });
      if (R === 5) {
        if (!handlers || !handlers.v5)
          throw new EncryptionError("pdf/crypto/missing-handler", "no v5 handler provided");
        const m5 = resolveV5Method(typedEncrypt);
        return {
          handler: handlers.v5,
          revision: 5,
          method: m5.method,
          strMethod: m5.strMethod,
          effMethod: m5.effMethod
        };
      }
      if (R === 6) {
        if (!handlers || !handlers.v6)
          throw new EncryptionError("pdf/crypto/missing-handler", "no v6 handler provided");
        const m6 = resolveV5Method(typedEncrypt);
        return {
          handler: handlers.v6,
          revision: 6,
          method: m6.method,
          strMethod: m6.strMethod,
          effMethod: m6.effMethod
        };
      }
      throw new EncryptionError("pdf/crypto/unsupported-version", "Standard handler revision R=" + R + " is not supported", { context: { V, R } });
    }
    function isEmbeddedFileStream(stream) {
      if (!stream || stream.type !== "stream")
        return !1;
      const d = stream.dict;
      if (!d || d.type !== "dict" || !d.entries)
        return !1;
      const t = d.entries.Type;
      if (!t)
        return !1;
      if (t.type === "name")
        return t.value === "EmbeddedFile";
      if (typeof t === "string")
        return t === "EmbeddedFile";
      return !1;
    }
    function dispatchDecryptStream(selection, stream, fek, objNum, gen, ciphertext, opts) {
      if (!selection || typeof selection !== "object" || !selection.handler)
        throw new EncryptionError("pdf/crypto/security/bad-selection", "dispatchDecryptStream requires a selection from selectHandler");
      const h = selection.handler, embedded = isEmbeddedFileStream(stream);
      if ((embedded ? selection.effMethod : selection.method) === "Identity")
        return ciphertext;
      if (embedded) {
        const typedView = { method: selection.effMethod };
        if (typeof h.decryptEmbeddedFile === "function")
          return h.decryptEmbeddedFile(typedView, fek, objNum, gen, ciphertext, opts);
        if (typeof h.decryptStream === "function")
          return h.decryptStream(typedView, fek, objNum, gen, ciphertext, opts);
        throw new EncryptionError("pdf/crypto/security/no-eff", "selected handler lacks decryptEmbeddedFile and decryptStream");
      }
      if (typeof h.decryptStream !== "function")
        throw new EncryptionError("pdf/crypto/security/no-stream", "selected handler lacks decryptStream");
      const typedView = { method: selection.method };
      return h.decryptStream(typedView, fek, objNum, gen, ciphertext, opts);
    }
    return {
      typeEncryptDict,
      selectHandler,
      isEmbeddedFileStream,
      dispatchDecryptStream
    };
  } });
    __register({ name: "pdfStandardV4", dependencies: ["pdfErrors","aes","cbc","bitArray"], factory: function(errors, aes, cbc, bitArray) {
    const { EncryptionError } = errors;
    if (!aes || !cbc || !bitArray)
      throw new EncryptionError("pdf/crypto/v4/missing-fw", "pdfStandardV4 requires aes, cbc, bitArray fw modules");
    const PASSWORD_PADDING = new Uint8Array([
      40,
      191,
      78,
      94,
      78,
      117,
      138,
      65,
      100,
      0,
      78,
      86,
      255,
      250,
      1,
      8,
      46,
      46,
      0,
      182,
      208,
      104,
      62,
      128,
      47,
      12,
      169,
      254,
      100,
      83,
      105,
      122
    ]), AES_SALT = new Uint8Array([115, 65, 108, 84]);
    function bytesToWords(b, off, len) {
      const n = len >>> 2, out = Array(n);
      for (let i = 0;i < n; i++) {
        const j = off + (i << 2);
        out[i] = b[j] << 24 | b[j + 1] << 16 | b[j + 2] << 8 | b[j + 3] | 0;
      }
      return out;
    }
    function wordsToBytes(w, into, off) {
      for (let i = 0;i < w.length; i++) {
        const j = off + (i << 2);
        into[j] = w[i] >>> 24 & 255;
        into[j + 1] = w[i] >>> 16 & 255;
        into[j + 2] = w[i] >>> 8 & 255;
        into[j + 3] = w[i] & 255;
      }
    }
    function rc4(key, data) {
      const S = new Uint8Array(256);
      for (let i = 0;i < 256; i++)
        S[i] = i;
      let j = 0;
      for (let i = 0;i < 256; i++) {
        j = j + S[i] + key[i % key.length] & 255;
        const t = S[i];
        S[i] = S[j];
        S[j] = t;
      }
      const out = new Uint8Array(data.length);
      let a = 0, b = 0;
      for (let n = 0;n < data.length; n++) {
        a = a + 1 & 255;
        b = b + S[a] & 255;
        const t = S[a];
        S[a] = S[b];
        S[b] = t;
        const k = S[S[a] + S[b] & 255];
        out[n] = data[n] ^ k;
      }
      return out;
    }
    function md5(bytes) {
      function rol(x, n) {
        return x << n | x >>> 32 - n | 0;
      }
      const r = [
        7,
        12,
        17,
        22,
        7,
        12,
        17,
        22,
        7,
        12,
        17,
        22,
        7,
        12,
        17,
        22,
        5,
        9,
        14,
        20,
        5,
        9,
        14,
        20,
        5,
        9,
        14,
        20,
        5,
        9,
        14,
        20,
        4,
        11,
        16,
        23,
        4,
        11,
        16,
        23,
        4,
        11,
        16,
        23,
        4,
        11,
        16,
        23,
        6,
        10,
        15,
        21,
        6,
        10,
        15,
        21,
        6,
        10,
        15,
        21,
        6,
        10,
        15,
        21
      ], k = [
        3614090360,
        3905402710,
        606105819,
        3250441966,
        4118548399,
        1200080426,
        2821735955,
        4249261313,
        1770035416,
        2336552879,
        4294925233,
        2304563134,
        1804603682,
        4254626195,
        2792965006,
        1236535329,
        4129170786,
        3225465664,
        643717713,
        3921069994,
        3593408605,
        38016083,
        3634488961,
        3889429448,
        568446438,
        3275163606,
        4107603335,
        1163531501,
        2850285829,
        4243563512,
        1735328473,
        2368359562,
        4294588738,
        2272392833,
        1839030562,
        4259657740,
        2763975236,
        1272893353,
        4139469664,
        3200236656,
        681279174,
        3936430074,
        3572445317,
        76029189,
        3654602809,
        3873151461,
        530742520,
        3299628645,
        4096336452,
        1126891415,
        2878612391,
        4237533241,
        1700485571,
        2399980690,
        4293915773,
        2240044497,
        1873313359,
        4264355552,
        2734768916,
        1309151649,
        4149444226,
        3174756917,
        718787259,
        3951481745
      ], msgLenBytes = bytes.length, withOne = new Uint8Array((msgLenBytes + 8 >> 6 << 6) + 64);
      withOne.set(bytes);
      withOne[msgLenBytes] = 128;
      const bitsLo = msgLenBytes * 8 >>> 0, bitsHi = Math.floor(msgLenBytes * 8 / 4294967296) >>> 0, dv = new DataView(withOne.buffer);
      dv.setUint32(withOne.length - 8, bitsLo, !0);
      dv.setUint32(withOne.length - 4, bitsHi, !0);
      let a0 = 1732584193, b0 = -271733879, c0 = -1732584194, d0 = 271733878;
      for (let off = 0;off < withOne.length; off += 64) {
        const M = Array(16);
        for (let i = 0;i < 16; i++)
          M[i] = dv.getUint32(off + i * 4, !0);
        let A = a0, B = b0, C = c0, D = d0;
        for (let i = 0;i < 64; i++) {
          let F, g;
          if (i < 16) {
            F = B & C | ~B & D;
            g = i;
          } else if (i < 32) {
            F = D & B | ~D & C;
            g = (5 * i + 1) % 16;
          } else if (i < 48) {
            F = B ^ C ^ D;
            g = (3 * i + 5) % 16;
          } else {
            F = C ^ (B | ~D);
            g = 7 * i % 16;
          }
          const t = A + F + k[i] + M[g] | 0;
          A = D;
          D = C;
          C = B;
          B = B + rol(t, r[i]) | 0;
        }
        a0 = a0 + A | 0;
        b0 = b0 + B | 0;
        c0 = c0 + C | 0;
        d0 = d0 + D | 0;
      }
      const out = new Uint8Array(16), ov = new DataView(out.buffer);
      ov.setUint32(0, a0, !0);
      ov.setUint32(4, b0, !0);
      ov.setUint32(8, c0, !0);
      ov.setUint32(12, d0, !0);
      return out;
    }
    function padPassword(pw) {
      if (pw === void 0 || pw === null)
        pw = "";
      if (typeof pw === "string")
        pw = new TextEncoder().encode(pw);
      if (!(pw instanceof Uint8Array))
        throw new EncryptionError("pdf/crypto/v4/bad-password", "password must be string or Uint8Array");
      const out = new Uint8Array(32), take = Math.min(32, pw.length);
      out.set(pw.subarray(0, take));
      out.set(PASSWORD_PADDING.subarray(0, 32 - take), take);
      return out;
    }
    function computeFileKey(pw, O, P, idFirst, encryptMetadata) {
      if (!(O instanceof Uint8Array) || O.length !== 32)
        throw new EncryptionError("pdf/crypto/v4/bad-O", "/O must be a 32-byte Uint8Array");
      if (!(idFirst instanceof Uint8Array))
        throw new EncryptionError("pdf/crypto/v4/bad-id", "first /ID element required");
      const padded = padPassword(pw), extra = encryptMetadata === !1 ? 4 : 0, buf = new Uint8Array(68 + idFirst.length + extra);
      let p = 0;
      buf.set(padded, p);
      p += 32;
      buf.set(O, p);
      p += 32;
      new DataView(buf.buffer).setInt32(p, P | 0, !0);
      p += 4;
      buf.set(idFirst, p);
      p += idFirst.length;
      if (extra) {
        buf[p++] = 255;
        buf[p++] = 255;
        buf[p++] = 255;
        buf[p] = 255;
      }
      let h = md5(buf);
      const nBytes = 16;
      for (let i = 0;i < 50; i++)
        h = md5(h.subarray(0, nBytes));
      return h.subarray(0, nBytes);
    }
    function computeU(fileKey, idFirst) {
      const seed = new Uint8Array(PASSWORD_PADDING.length + idFirst.length);
      seed.set(PASSWORD_PADDING, 0);
      seed.set(idFirst, PASSWORD_PADDING.length);
      let h = md5(seed);
      h = rc4(fileKey, h);
      for (let i = 1;i <= 19; i++) {
        const xk = new Uint8Array(fileKey.length);
        for (let n = 0;n < fileKey.length; n++)
          xk[n] = fileKey[n] ^ i;
        h = rc4(xk, h);
      }
      const out = new Uint8Array(32);
      out.set(h, 0);
      return out;
    }
    function computeO(ownerPw, userPw) {
      const oPad = padPassword(ownerPw && ownerPw.length ? ownerPw : userPw);
      let h = md5(oPad);
      for (let i = 0;i < 50; i++)
        h = md5(h);
      const rc4Key = h.subarray(0, 16);
      let out = rc4(rc4Key, padPassword(userPw));
      for (let i = 1;i <= 19; i++) {
        const xk = new Uint8Array(16);
        for (let n = 0;n < 16; n++)
          xk[n] = rc4Key[n] ^ i;
        out = rc4(xk, out);
      }
      return out;
    }
    function bytesEqual(a, b, n) {
      const len = n === void 0 ? Math.min(a.length, b.length) : n;
      for (let i = 0;i < len; i++)
        if (a[i] !== b[i])
          return !1;
      return !0;
    }
    function objectKey(fileKey, objNum, gen, isAes) {
      const extra = isAes ? 4 : 0, buf = new Uint8Array(fileKey.length + 5 + extra);
      buf.set(fileKey, 0);
      buf[fileKey.length + 0] = objNum & 255;
      buf[fileKey.length + 1] = objNum >> 8 & 255;
      buf[fileKey.length + 2] = objNum >> 16 & 255;
      buf[fileKey.length + 3] = gen & 255;
      buf[fileKey.length + 4] = gen >> 8 & 255;
      if (isAes)
        buf.set(AES_SALT, fileKey.length + 5);
      return md5(buf).subarray(0, Math.min(fileKey.length + 5, 16));
    }
    function aesOf(opts) {
      return opts && opts.fastCipher === !0 && aes.ttable ? aes.ttable : aes;
    }
    function aesCbcDecrypt(key, iv, ciphertext, A = aes) {
      if (ciphertext.length % 16 !== 0)
        throw new EncryptionError("pdf/crypto/v4/bad-ciphertext-len", "AES-CBC ciphertext length must be a multiple of 16");
      const cipher = A.fn(bytesToWords(key, 0, key.length), !0);
      if (cipher === !1)
        throw new EncryptionError("pdf/crypto/v4/aes-schedule-failed", "AES-128 key schedule failed");
      const ctWords = bytesToWords(ciphertext, 0, ciphertext.length), ivWords = bytesToWords(iv, 0, 16), ptWords = cbc.decrypt(cipher, ctWords, ivWords);
      if (ptWords === !1)
        throw new EncryptionError("pdf/crypto/v4/cbc-decrypt-failed", "AES-128-CBC decryption failed");
      const out = new Uint8Array(ciphertext.length);
      wordsToBytes(ptWords, out, 0);
      return out;
    }
    function aesCbcEncrypt(key, iv, plaintext) {
      if (plaintext.length % 16 !== 0)
        throw new EncryptionError("pdf/crypto/v4/bad-pt-len", "AES-CBC plaintext length must be a multiple of 16");
      const cipher = aes.fn(bytesToWords(key, 0, key.length), !1);
      if (cipher === !1 || typeof cipher.encrypt !== "function")
        throw new EncryptionError("pdf/crypto/v4/aes-encrypt-schedule", "AES-128 key schedule failed for encrypt");
      const ptWords = bytesToWords(plaintext, 0, plaintext.length), ivWords = bytesToWords(iv, 0, 16), ctWords = cbc.encrypt(cipher, ptWords, ivWords);
      if (ctWords === !1)
        throw new EncryptionError("pdf/crypto/v4/cbc-encrypt-failed", "AES-128-CBC encryption failed");
      const out = new Uint8Array(plaintext.length);
      wordsToBytes(ctWords, out, 0);
      return out;
    }
    function padPkcs7(buf) {
      const pad = 16 - buf.length % 16, out = new Uint8Array(buf.length + pad);
      out.set(buf);
      for (let i = buf.length;i < out.length; i++)
        out[i] = pad;
      return out;
    }
    function stripPkcs7(buf) {
      if (buf.length === 0)
        return buf;
      const pad = buf[buf.length - 1];
      if (pad < 1 || pad > 16 || pad > buf.length)
        return buf;
      for (let i = buf.length - pad;i < buf.length; i++)
        if (buf[i] !== pad)
          return buf;
      return buf.subarray(0, buf.length - pad);
    }
    function tryPassword(typedEncrypt, password, isOwner, _opts) {
      const { O, U, idFirst } = typedEncrypt, P = typedEncrypt.P | 0, encryptMetadata = typedEncrypt.EncryptMetadata !== !1;
      if (!(O instanceof Uint8Array) || O.length !== 32 || !(U instanceof Uint8Array) || U.length !== 32)
        throw new EncryptionError("pdf/crypto/v4/bad-O-U", "/O and /U must be 32 bytes for v4");
      if (!(idFirst instanceof Uint8Array))
        throw new EncryptionError("pdf/crypto/v4/bad-id", "idFirst is required for v4 key derivation");
      let userPw;
      if (isOwner) {
        const oPad = padPassword(password);
        let h = md5(oPad);
        for (let i = 0;i < 50; i++)
          h = md5(h);
        const rc4Key = h.subarray(0, 16);
        let recovered = O;
        for (let i = 19;i >= 0; i--) {
          const xk = new Uint8Array(16);
          for (let n = 0;n < 16; n++)
            xk[n] = rc4Key[n] ^ i;
          recovered = rc4(xk, recovered);
        }
        userPw = recovered;
      } else
        userPw = password;
      const fk = computeFileKey(userPw, O, P, idFirst, encryptMetadata), u = computeU(fk, idFirst);
      return bytesEqual(u, U, 16) ? { fileEncryptionKey: fk } : { fileEncryptionKey: null };
    }
    function decryptString(typedEncrypt, fek, objNum, gen, ciphertext, opts) {
      const method = typedEncrypt && typedEncrypt.method;
      if (method === "AESV2") {
        if (ciphertext.length < 16)
          throw new EncryptionError("pdf/crypto/v4/bad-string", "AESV2 string must be at least 16 bytes (IV)");
        const key = objectKey(fek, objNum, gen, !0), iv = ciphertext.subarray(0, 16), body = ciphertext.subarray(16);
        if (body.length === 0)
          return body;
        const pt = aesCbcDecrypt(key, iv, body, aesOf(opts));
        return stripPkcs7(pt);
      }
      if (method === "V2" || method === "RC4") {
        const key = objectKey(fek, objNum, gen, !1);
        return rc4(key, ciphertext);
      }
      throw new EncryptionError("pdf/crypto/v4/bad-method", "V4 method must be AESV2 or V2", { context: { method } });
    }
    function decryptStream(typedEncrypt, fek, objNum, gen, ciphertext, opts) {
      return decryptString(typedEncrypt, fek, objNum, gen, ciphertext, opts);
    }
    function decryptEmbeddedFile(typedEncrypt, fek, objNum, gen, ciphertext, opts) {
      return decryptString(typedEncrypt, fek, objNum, gen, ciphertext, opts);
    }
    function encryptEmbeddedFile(typedEncrypt, fek, objNum, gen, plaintext, iv) {
      return encryptString(typedEncrypt, fek, objNum, gen, plaintext, iv);
    }
    function encryptString(typedEncrypt, fek, objNum, gen, plaintext, iv) {
      const method = typedEncrypt && typedEncrypt.method;
      if (!(plaintext instanceof Uint8Array))
        throw new EncryptionError("pdf/crypto/v4/encrypt-bad-input", "plaintext must be Uint8Array");
      if (method === "AESV2") {
        if (!(iv instanceof Uint8Array) || iv.length !== 16)
          throw new EncryptionError("pdf/crypto/v4/encrypt-bad-iv", "AESV2 IV must be 16 bytes");
        const key = objectKey(fek, objNum, gen, !0), padded = padPkcs7(plaintext), body = aesCbcEncrypt(key, iv, padded), out = new Uint8Array(16 + body.length);
        out.set(iv, 0);
        out.set(body, 16);
        return out;
      }
      if (method === "V2" || method === "RC4") {
        const key = objectKey(fek, objNum, gen, !1);
        return rc4(key, plaintext);
      }
      throw new EncryptionError("pdf/crypto/v4/bad-method", "V4 method must be AESV2 or V2", { context: { method } });
    }
    function encryptStream(typedEncrypt, fek, objNum, gen, plaintext, iv) {
      return encryptString(typedEncrypt, fek, objNum, gen, plaintext, iv);
    }
    function buildOU(ownerPassword, userPassword, P, idFirst, encryptMetadata) {
      if (!(idFirst instanceof Uint8Array))
        throw new EncryptionError("pdf/crypto/v4/bad-id", "idFirst required to build /O and /U");
      const O = computeO(ownerPassword, userPassword), fek = computeFileKey(userPassword, O, P, idFirst, encryptMetadata), U = computeU(fek, idFirst);
      return { O, U, fek };
    }
    function buildPerms() {
      return null;
    }
    return {
      tryPassword,
      decryptString,
      decryptStream,
      decryptEmbeddedFile,
      encryptEmbeddedFile,
      encryptString,
      encryptStream,
      buildOU,
      buildPerms,
      computeFileKey,
      computeU,
      computeO,
      objectKey,
      rc4,
      md5,
      padPassword,
      PASSWORD_PADDING
    };
  } });
    __register({ name: "pdfAesGcm", dependencies: ["pdfErrors","aes","gcm","bitArray"], factory: function(errors, aes, gcm, bitArray) {
    const { EncryptionError } = errors;
    function bytesToWords(b, off, len) {
      const n = len >>> 2, out = Array(n);
      for (let i = 0;i < n; i++) {
        const j = off + (i << 2);
        out[i] = b[j] << 24 | b[j + 1] << 16 | b[j + 2] << 8 | b[j + 3] | 0;
      }
      return out;
    }
    if (!aes || !gcm || !bitArray)
      throw new EncryptionError("pdf/crypto/gcm/missing-fw", "pdfAesGcm requires aes, gcm, bitArray fw modules");
    function buildCipher(fek) {
      if (!(fek instanceof Uint8Array) || fek.length !== 32)
        throw new EncryptionError("pdf/crypto/gcm/bad-fek", "File Encryption Key must be 32 bytes (AES-256)", { context: { length: fek && fek.length } });
      const c = aes.fn(bytesToWords(fek, 0, 32), !1);
      if (c === !1)
        throw new EncryptionError("pdf/crypto/gcm/aes-schedule-failed", "AES-256 key schedule failed");
      return c;
    }
    function decryptObjectGcm(fek, framed) {
      if (!(framed instanceof Uint8Array) || framed.length < 28)
        throw new EncryptionError("pdf/crypto/gcm/bad-input", "AES-GCM framed input must be at least 28 bytes (IV + tag)");
      const cipher = buildCipher(fek), iv = framed.subarray(0, 12), tag = framed.subarray(framed.length - 16), ct = framed.subarray(12, framed.length - 16), pt = gcm.decrypt(cipher, bitArray.ui8_to_ba(ct), bitArray.ui8_to_ba(iv), [], bitArray.ui8_to_ba(tag), 128);
      if (pt === !1)
        throw new EncryptionError("pdf/crypto/gcm/tag-mismatch", "AES-GCM authentication tag mismatch");
      return bitArray.ba_to_ui8(pt);
    }
    function encryptObjectGcm(fek, plaintext, ivProvider) {
      if (!(plaintext instanceof Uint8Array))
        throw new EncryptionError("pdf/crypto/gcm/bad-plaintext", "plaintext must be Uint8Array");
      if (typeof ivProvider !== "function")
        throw new EncryptionError("pdf/crypto/gcm/bad-iv-provider", "ivProvider must be a function returning 12 bytes");
      const iv = ivProvider();
      if (!(iv instanceof Uint8Array) || iv.length !== 12)
        throw new EncryptionError("pdf/crypto/gcm/bad-iv", "ivProvider must return exactly 12 bytes (96-bit nonce)", { context: { length: iv && iv.length } });
      const cipher = buildCipher(fek), res = gcm.encrypt(cipher, bitArray.ui8_to_ba(plaintext), bitArray.ui8_to_ba(iv), [], 128);
      if (res === !1)
        throw new EncryptionError("pdf/crypto/gcm/encrypt-failed", "AES-GCM encryption failed");
      const ct = bitArray.ba_to_ui8(res.ct), tag = bitArray.ba_to_ui8(res.tag), out = new Uint8Array(12 + ct.length + 16);
      out.set(iv, 0);
      out.set(ct, 12);
      out.set(tag, 12 + ct.length);
      return out;
    }
    return { encryptObjectGcm, decryptObjectGcm };
  } });
    __register({ name: "pdfStandardV5", dependencies: ["pdfErrors","aes","cbc","sha256","bitArray","pdfAesGcm"], factory: function(errors, aes, cbc, sha256, bitArray, pdfAesGcm) {
    const { EncryptionError } = errors;
    if (!aes || !cbc || !sha256 || !bitArray)
      throw new EncryptionError("pdf/crypto/v5/missing-fw", "pdfStandardV5 requires aes, cbc, sha256, bitArray fw modules");
    const ZERO_IV = new Uint8Array(16);
    function bytesToWords(b, off, len) {
      const n = len >>> 2, out = Array(n);
      for (let i = 0;i < n; i++) {
        const j = off + (i << 2);
        out[i] = b[j] << 24 | b[j + 1] << 16 | b[j + 2] << 8 | b[j + 3] | 0;
      }
      return out;
    }
    function wordsToBytes(w, into, off) {
      for (let i = 0;i < w.length; i++) {
        const j = off + (i << 2);
        into[j] = w[i] >>> 24 & 255;
        into[j + 1] = w[i] >>> 16 & 255;
        into[j + 2] = w[i] >>> 8 & 255;
        into[j + 3] = w[i] & 255;
      }
    }
    function passwordToBytes(password) {
      if (password === void 0 || password === null || password === "")
        return new Uint8Array(0);
      if (password instanceof Uint8Array)
        return password.length > 127 ? password.subarray(0, 127) : password;
      if (typeof password === "string") {
        const enc = new TextEncoder().encode(password);
        return enc.length > 127 ? enc.subarray(0, 127) : enc;
      }
      throw new EncryptionError("pdf/crypto/v5/bad-password", "password must be string or Uint8Array");
    }
    function sha256Bytes(bytes) {
      const ba = bitArray.ui8_to_ba(bytes), out = sha256.hash(ba);
      return bitArray.ba_to_ui8(out);
    }
    function concatBytes(parts) {
      let n = 0;
      for (const p of parts)
        n += p.length;
      const out = new Uint8Array(n);
      let off = 0;
      for (const p of parts) {
        out.set(p, off);
        off += p.length;
      }
      return out;
    }
    function aesOf(opts) {
      return opts && opts.fastCipher === !0 && aes.ttable ? aes.ttable : aes;
    }
    function aesCbcDecrypt(key, iv, ciphertext, A = aes) {
      if (ciphertext.length % 16 !== 0)
        throw new EncryptionError("pdf/crypto/v5/bad-ciphertext-len", "AES-CBC ciphertext length must be a multiple of 16", { context: { length: ciphertext.length } });
      const cipher = A.fn(bytesToWords(key, 0, 32), !0);
      if (cipher === !1)
        throw new EncryptionError("pdf/crypto/v5/aes-schedule-failed", "AES-256 key schedule failed");
      const ctWords = bytesToWords(ciphertext, 0, ciphertext.length), ivWords = bytesToWords(iv, 0, 16), ptWords = cbc.decrypt(cipher, ctWords, ivWords);
      if (ptWords === !1)
        throw new EncryptionError("pdf/crypto/v5/cbc-decrypt-failed", "AES-256-CBC decryption failed");
      const out = new Uint8Array(ciphertext.length);
      wordsToBytes(ptWords, out, 0);
      return out;
    }
    function stripPkcs7(buf) {
      if (buf.length === 0)
        return buf;
      const pad = buf[buf.length - 1];
      if (pad < 1 || pad > 16 || pad > buf.length)
        return buf;
      for (let i = buf.length - pad;i < buf.length; i++)
        if (buf[i] !== pad)
          return buf;
      return buf.subarray(0, buf.length - pad);
    }
    function tryPassword(typedEncrypt, password, isOwner, opts) {
      const { O, U, OE, UE } = typedEncrypt;
      if (!(O instanceof Uint8Array) || O.length < 48 || !(U instanceof Uint8Array) || U.length < 48)
        throw new EncryptionError("pdf/crypto/v5/bad-O-U", "/O and /U must be at least 48 bytes for v5");
      const pw = passwordToBytes(password), target = isOwner ? O : U, valSalt = target.subarray(32, 40), keySalt = target.subarray(40, 48);
      let h;
      if (isOwner) {
        h = sha256Bytes(concatBytes([pw, valSalt, U.subarray(0, 48)]));
        for (let i = 0;i < 32; i++)
          if (h[i] !== O[i])
            return { fileEncryptionKey: null };
      } else {
        h = sha256Bytes(concatBytes([pw, valSalt]));
        for (let i = 0;i < 32; i++)
          if (h[i] !== U[i])
            return { fileEncryptionKey: null };
      }
      const intermediate = isOwner ? sha256Bytes(concatBytes([pw, keySalt, U.subarray(0, 48)])) : sha256Bytes(concatBytes([pw, keySalt])), oeue = isOwner ? OE : UE;
      if (!(oeue instanceof Uint8Array) || oeue.length !== 32)
        throw new EncryptionError("pdf/crypto/v5/bad-OE-UE", "/OE and /UE must be exactly 32 bytes for v5", { context: { length: oeue && oeue.length } });
      return { fileEncryptionKey: aesCbcDecrypt(intermediate, ZERO_IV, oeue, aesOf(opts)) };
    }
    function methodOf(typedEncrypt, fallback) {
      const m = typedEncrypt && typedEncrypt.method;
      if (m === "AESV3" || m === "AESV4")
        return m;
      return fallback || "AESV3";
    }
    function requireGcm() {
      if (!pdfAesGcm || typeof pdfAesGcm.decryptObjectGcm !== "function")
        throw new EncryptionError("pdf/crypto/v5/missing-gcm", "AESV4 requires pdfAesGcm dependency");
      return pdfAesGcm;
    }
    function decryptString(typedEncrypt, fek, _objNum, _gen, ciphertext, opts) {
      if (methodOf(typedEncrypt, "AESV3") === "AESV4")
        return requireGcm().decryptObjectGcm(fek, ciphertext);
      if (!(ciphertext instanceof Uint8Array) || ciphertext.length < 32)
        throw new EncryptionError("pdf/crypto/v5/bad-string", "AES-256 encrypted string must be at least 32 bytes (IV+1 block)");
      const iv = ciphertext.subarray(0, 16), body = ciphertext.subarray(16), pt = aesCbcDecrypt(fek, iv, body, aesOf(opts));
      return stripPkcs7(pt);
    }
    function decryptStream(typedEncrypt, fek, objNum, gen, ciphertext, opts) {
      return decryptString(typedEncrypt, fek, objNum, gen, ciphertext, opts);
    }
    function aesCbcEncrypt(key, iv, plaintext) {
      if (plaintext.length % 16 !== 0)
        throw new EncryptionError("pdf/crypto/v5/bad-pt-len", "AES-CBC plaintext length must be a multiple of 16", { context: { length: plaintext.length } });
      const cipher = aes.fn(bytesToWords(key, 0, key.length), !1);
      if (cipher === !1 || typeof cipher.encrypt !== "function")
        throw new EncryptionError("pdf/crypto/v5/aes-encrypt-schedule", "AES key schedule failed for encrypt");
      const ptWords = bytesToWords(plaintext, 0, plaintext.length), ivWords = bytesToWords(iv, 0, 16), ctWords = cbc.encrypt(cipher, ptWords, ivWords);
      if (ctWords === !1)
        throw new EncryptionError("pdf/crypto/v5/cbc-encrypt-failed", "AES-CBC encryption failed");
      const out = new Uint8Array(plaintext.length);
      wordsToBytes(ctWords, out, 0);
      return out;
    }
    function padPkcs7(buf) {
      const pad = 16 - buf.length % 16, out = new Uint8Array(buf.length + pad);
      out.set(buf);
      for (let i = buf.length;i < out.length; i++)
        out[i] = pad;
      return out;
    }
    function encryptString(typedEncrypt, fek, _objNum, _gen, plaintext, iv) {
      if (!(plaintext instanceof Uint8Array))
        throw new EncryptionError("pdf/crypto/v5/encrypt-bad-input", "plaintext must be Uint8Array");
      if (methodOf(typedEncrypt, "AESV3") === "AESV4") {
        if (!(iv instanceof Uint8Array) || iv.length !== 12)
          throw new EncryptionError("pdf/crypto/v5/encrypt-bad-iv", "AESV4 IV must be a 12-byte Uint8Array");
        return requireGcm().encryptObjectGcm(fek, plaintext, () => iv);
      }
      if (!(iv instanceof Uint8Array) || iv.length !== 16)
        throw new EncryptionError("pdf/crypto/v5/encrypt-bad-iv", "IV must be a 16-byte Uint8Array");
      const padded = padPkcs7(plaintext), body = aesCbcEncrypt(fek, iv, padded), out = new Uint8Array(16 + body.length);
      out.set(iv, 0);
      out.set(body, 16);
      return out;
    }
    function encryptStream(typedEncrypt, fek, objNum, gen, plaintext, iv) {
      return encryptString(typedEncrypt, fek, objNum, gen, plaintext, iv);
    }
    function buildUUE(password, fek, valSalt, keySalt) {
      const pw = passwordToBytes(password), hVal = sha256Bytes(concatBytes([pw, valSalt])), U = new Uint8Array(48);
      U.set(hVal, 0);
      U.set(valSalt, 32);
      U.set(keySalt, 40);
      const intermediate = sha256Bytes(concatBytes([pw, keySalt])), UE = aesCbcEncrypt(intermediate, ZERO_IV, fek);
      return { U, UE };
    }
    function buildOOE(password, fek, U48, valSalt, keySalt) {
      const pw = passwordToBytes(password), hVal = sha256Bytes(concatBytes([pw, valSalt, U48])), O = new Uint8Array(48);
      O.set(hVal, 0);
      O.set(valSalt, 32);
      O.set(keySalt, 40);
      const intermediate = sha256Bytes(concatBytes([pw, keySalt, U48])), OE = aesCbcEncrypt(intermediate, ZERO_IV, fek);
      return { O, OE };
    }
    function buildPerms(p, fek, encryptMetadata, randomBytes) {
      const buf = new Uint8Array(16), v = p | 0;
      buf[0] = v & 255;
      buf[1] = v >>> 8 & 255;
      buf[2] = v >>> 16 & 255;
      buf[3] = v >>> 24 & 255;
      buf[4] = 255;
      buf[5] = 255;
      buf[6] = 255;
      buf[7] = 255;
      buf[8] = encryptMetadata ? 84 : 70;
      buf[9] = 97;
      buf[10] = 100;
      buf[11] = 98;
      const rand = randomBytes(4);
      buf[12] = rand[0];
      buf[13] = rand[1];
      buf[14] = rand[2];
      buf[15] = rand[3];
      const cipher = aes.fn(bytesToWords(fek, 0, 32), !1);
      if (cipher === !1 || typeof cipher.encrypt !== "function")
        throw new EncryptionError("pdf/crypto/v5/perms-schedule", "AES-256-ECB schedule failed for /Perms");
      const blk = cipher.encrypt(bytesToWords(buf, 0, 16)), out = new Uint8Array(16);
      wordsToBytes(blk, out, 0);
      return out;
    }
    return {
      tryPassword,
      decryptString,
      decryptStream,
      encryptString,
      encryptStream,
      buildUUE,
      buildOOE,
      buildPerms
    };
  } });
    __register({ name: "pdfStandardV6", dependencies: ["pdfErrors","aes","cbc","sha256","sha384","sha512","bitArray","pdfAesGcm"], factory: function(errors, aes, cbc, sha256, sha384, sha512, bitArray, pdfAesGcm) {
    const { EncryptionError } = errors;
    if (!aes || !cbc || !sha256 || !sha384 || !sha512 || !bitArray)
      throw new EncryptionError("pdf/crypto/v6/missing-fw", "pdfStandardV6 requires aes, cbc, sha256, sha384, sha512, bitArray");
    const ZERO_IV = new Uint8Array(16), _AES128_KEY_SCRATCH = Array(4);
    function bytesToWords(b, off, len, scratch) {
      const n = len >>> 2, out = scratch && scratch.length >= n ? scratch : Array(n);
      for (let i = 0;i < n; i++) {
        const j = off + (i << 2);
        out[i] = b[j] << 24 | b[j + 1] << 16 | b[j + 2] << 8 | b[j + 3] | 0;
      }
      if (out.length !== n && out !== scratch)
        out.length = n;
      if (scratch && out === scratch)
        out.length = n;
      return out;
    }
    function wordsToBytes(w, into, off, count) {
      const n = count === void 0 ? w.length : count;
      for (let i = 0;i < n; i++) {
        const j = off + (i << 2);
        into[j] = w[i] >>> 24 & 255;
        into[j + 1] = w[i] >>> 16 & 255;
        into[j + 2] = w[i] >>> 8 & 255;
        into[j + 3] = w[i] & 255;
      }
    }
    function concatBytes(parts) {
      let n = 0;
      for (const p of parts)
        n += p.length;
      const out = new Uint8Array(n);
      let off = 0;
      for (const p of parts) {
        out.set(p, off);
        off += p.length;
      }
      return out;
    }
    function passwordToBytes(password) {
      if (password === void 0 || password === null || password === "")
        return new Uint8Array(0);
      if (password instanceof Uint8Array)
        return password.length > 127 ? password.subarray(0, 127) : password;
      if (typeof password === "string") {
        const enc = new TextEncoder().encode(password);
        return enc.length > 127 ? enc.subarray(0, 127) : enc;
      }
      throw new EncryptionError("pdf/crypto/v6/bad-password", "password must be string or Uint8Array");
    }
    function hashBytes(hashMod, bytes, outLen) {
      const ba = bitArray.ui8_to_ba(bytes), digest = hashMod.hash(ba), u8 = bitArray.ba_to_ui8(digest);
      return u8.length === outLen ? u8 : u8.subarray(0, outLen);
    }
    function aesOf(opts) {
      return opts && opts.fastCipher === !0 && aes.ttable ? aes.ttable : aes;
    }
    function aesCbcEncryptRaw(key, iv, plaintext, A = aes) {
      if (plaintext.length % 16 !== 0)
        throw new EncryptionError("pdf/crypto/v6/bad-pt-len", "AES-CBC plaintext length must be a multiple of 16", { context: { length: plaintext.length } });
      const cipher = A.fn(bytesToWords(key, 0, key.length, _AES128_KEY_SCRATCH), !1);
      if (cipher === !1)
        throw new EncryptionError("pdf/crypto/v6/aes-schedule-failed", "AES key schedule failed");
      const out = new Uint8Array(plaintext.length);
      let p0 = iv[0] << 24 | iv[1] << 16 | iv[2] << 8 | iv[3], p1 = iv[4] << 24 | iv[5] << 16 | iv[6] << 8 | iv[7], p2 = iv[8] << 24 | iv[9] << 16 | iv[10] << 8 | iv[11], p3 = iv[12] << 24 | iv[13] << 16 | iv[14] << 8 | iv[15];
      for (let off = 0;off < plaintext.length; off += 16) {
        const b0 = plaintext[off] << 24 | plaintext[off + 1] << 16 | plaintext[off + 2] << 8 | plaintext[off + 3], b1 = plaintext[off + 4] << 24 | plaintext[off + 5] << 16 | plaintext[off + 6] << 8 | plaintext[off + 7], b2 = plaintext[off + 8] << 24 | plaintext[off + 9] << 16 | plaintext[off + 10] << 8 | plaintext[off + 11], b3 = plaintext[off + 12] << 24 | plaintext[off + 13] << 16 | plaintext[off + 14] << 8 | plaintext[off + 15], blk = cipher.encrypt([b0 ^ p0, b1 ^ p1, b2 ^ p2, b3 ^ p3]);
        p0 = blk[0];
        p1 = blk[1];
        p2 = blk[2];
        p3 = blk[3];
        wordsToBytes(blk, out, off, 4);
      }
      return out;
    }
    function aesCbcDecrypt(key, iv, ciphertext, A = aes) {
      if (ciphertext.length % 16 !== 0)
        throw new EncryptionError("pdf/crypto/v6/bad-ct-len", "AES-CBC ciphertext length must be a multiple of 16");
      const cipher = A.fn(bytesToWords(key, 0, key.length), !0);
      if (cipher === !1 || typeof cipher.decrypt !== "function")
        throw new EncryptionError("pdf/crypto/v6/aes-decrypt-schedule", "AES-256 decrypt key schedule failed");
      const ctWords = bytesToWords(ciphertext, 0, ciphertext.length), ivWords = bytesToWords(iv, 0, 16), ptWords = cbc.decrypt(cipher, ctWords, ivWords);
      if (ptWords === !1)
        throw new EncryptionError("pdf/crypto/v6/cbc-decrypt-failed", "AES-256-CBC decryption failed");
      const out = new Uint8Array(ciphertext.length);
      wordsToBytes(ptWords, out, 0, ptWords.length);
      return out;
    }
    function stripPkcs7(buf) {
      if (buf.length === 0)
        return buf;
      const pad = buf[buf.length - 1];
      if (pad < 1 || pad > 16 || pad > buf.length)
        return buf;
      for (let i = buf.length - pad;i < buf.length; i++)
        if (buf[i] !== pad)
          return buf;
      return buf.subarray(0, buf.length - pad);
    }
    function hardenKey(password, salt, extra, A = aes) {
      let K = hashBytes(sha256, concatBytes([password, salt, extra]), 32), round = 0;
      while (!0) {
        const block = concatBytes([password, K, extra]), K1 = new Uint8Array(block.length * 64);
        for (let i = 0;i < 64; i++)
          K1.set(block, i * block.length);
        const aesKey = K.subarray(0, 16), iv = K.subarray(16, 32), E = aesCbcEncryptRaw(aesKey, iv, K1, A);
        let sum = 0;
        for (let i = 0;i < 16; i++)
          sum = (sum + E[i]) % 3;
        let nextHash, outLen;
        if (sum === 0) {
          nextHash = sha256;
          outLen = 32;
        } else if (sum === 1) {
          nextHash = sha384;
          outLen = 48;
        } else {
          nextHash = sha512;
          outLen = 64;
        }
        K = hashBytes(nextHash, E, outLen);
        round++;
        if (round >= 64 && E[E.length - 1] <= round - 32)
          break;
      }
      return K.subarray(0, 32);
    }
    function tryPassword(typedEncrypt, password, isOwner, opts) {
      const A = aesOf(opts), O = typedEncrypt.O, U = typedEncrypt.U, OE = typedEncrypt.OE, UE = typedEncrypt.UE;
      if (!(O instanceof Uint8Array) || O.length < 48 || !(U instanceof Uint8Array) || U.length < 48)
        throw new EncryptionError("pdf/crypto/v6/bad-O-U", "/O and /U must be at least 48 bytes for v6");
      const pw = passwordToBytes(password), target = isOwner ? O : U, valSalt = target.subarray(32, 40), keySalt = target.subarray(40, 48), extra = isOwner ? U.subarray(0, 48) : new Uint8Array(0), valHash = hardenKey(pw, valSalt, extra, A);
      for (let i = 0;i < 32; i++)
        if (valHash[i] !== target[i])
          return { fileEncryptionKey: null };
      const intermediate = hardenKey(pw, keySalt, extra, A), oeue = isOwner ? OE : UE;
      if (!(oeue instanceof Uint8Array) || oeue.length !== 32)
        throw new EncryptionError("pdf/crypto/v6/bad-OE-UE", "/OE and /UE must be exactly 32 bytes for v6");
      return { fileEncryptionKey: aesCbcDecrypt(intermediate, ZERO_IV, oeue, A) };
    }
    function methodOf(typedEncrypt, fallback) {
      const m = typedEncrypt && typedEncrypt.method;
      if (m === "AESV3" || m === "AESV4")
        return m;
      return fallback || "AESV3";
    }
    function requireGcm() {
      if (!pdfAesGcm || typeof pdfAesGcm.decryptObjectGcm !== "function")
        throw new EncryptionError("pdf/crypto/v6/missing-gcm", "AESV4 requires pdfAesGcm dependency");
      return pdfAesGcm;
    }
    function decryptString(typedEncrypt, fek, _objNum, _gen, ciphertext, opts) {
      if (methodOf(typedEncrypt, "AESV3") === "AESV4")
        return requireGcm().decryptObjectGcm(fek, ciphertext);
      if (!(ciphertext instanceof Uint8Array) || ciphertext.length < 32)
        throw new EncryptionError("pdf/crypto/v6/bad-string", "AES-256 encrypted string must be at least 32 bytes");
      const iv = ciphertext.subarray(0, 16), body = ciphertext.subarray(16), pt = aesCbcDecrypt(fek, iv, body, aesOf(opts));
      return stripPkcs7(pt);
    }
    function decryptStream(typedEncrypt, fek, objNum, gen, ciphertext, opts) {
      return decryptString(typedEncrypt, fek, objNum, gen, ciphertext, opts);
    }
    function aesCbcEncrypt256(key, iv, plaintext) {
      return aesCbcEncryptRaw(key, iv, plaintext);
    }
    function padPkcs7(buf) {
      const pad = 16 - buf.length % 16, out = new Uint8Array(buf.length + pad);
      out.set(buf);
      for (let i = buf.length;i < out.length; i++)
        out[i] = pad;
      return out;
    }
    function encryptString(typedEncrypt, fek, _objNum, _gen, plaintext, iv) {
      if (!(plaintext instanceof Uint8Array))
        throw new EncryptionError("pdf/crypto/v6/encrypt-bad-input", "plaintext must be Uint8Array");
      if (methodOf(typedEncrypt, "AESV3") === "AESV4") {
        if (!(iv instanceof Uint8Array) || iv.length !== 12)
          throw new EncryptionError("pdf/crypto/v6/encrypt-bad-iv", "AESV4 IV must be a 12-byte Uint8Array");
        return requireGcm().encryptObjectGcm(fek, plaintext, () => iv);
      }
      if (!(iv instanceof Uint8Array) || iv.length !== 16)
        throw new EncryptionError("pdf/crypto/v6/encrypt-bad-iv", "IV must be a 16-byte Uint8Array");
      const padded = padPkcs7(plaintext), body = aesCbcEncrypt256(fek, iv, padded), out = new Uint8Array(16 + body.length);
      out.set(iv, 0);
      out.set(body, 16);
      return out;
    }
    function encryptStream(typedEncrypt, fek, objNum, gen, plaintext, iv) {
      return encryptString(typedEncrypt, fek, objNum, gen, plaintext, iv);
    }
    function buildUUE(password, fek, valSalt, keySalt) {
      const pw = passwordToBytes(password), hVal = hardenKey(pw, valSalt, new Uint8Array(0)), U = new Uint8Array(48);
      U.set(hVal, 0);
      U.set(valSalt, 32);
      U.set(keySalt, 40);
      const intermediate = hardenKey(pw, keySalt, new Uint8Array(0)), UE = aesCbcEncrypt256(intermediate, ZERO_IV, fek);
      return { U, UE };
    }
    function buildOOE(password, fek, U48, valSalt, keySalt) {
      const pw = passwordToBytes(password), hVal = hardenKey(pw, valSalt, U48), O = new Uint8Array(48);
      O.set(hVal, 0);
      O.set(valSalt, 32);
      O.set(keySalt, 40);
      const intermediate = hardenKey(pw, keySalt, U48), OE = aesCbcEncrypt256(intermediate, ZERO_IV, fek);
      return { O, OE };
    }
    function buildPerms(p, fek, encryptMetadata, randomBytes) {
      const buf = new Uint8Array(16), v = p | 0;
      buf[0] = v & 255;
      buf[1] = v >>> 8 & 255;
      buf[2] = v >>> 16 & 255;
      buf[3] = v >>> 24 & 255;
      buf[4] = 255;
      buf[5] = 255;
      buf[6] = 255;
      buf[7] = 255;
      buf[8] = encryptMetadata ? 84 : 70;
      buf[9] = 97;
      buf[10] = 100;
      buf[11] = 98;
      const rand = randomBytes(4);
      buf[12] = rand[0];
      buf[13] = rand[1];
      buf[14] = rand[2];
      buf[15] = rand[3];
      const cipher = aes.fn(bytesToWords(fek, 0, 32, _AES128_KEY_SCRATCH), !1);
      if (cipher === !1 || typeof cipher.encrypt !== "function")
        throw new EncryptionError("pdf/crypto/v6/perms-schedule", "AES-256-ECB schedule failed for /Perms");
      const blk = cipher.encrypt(bytesToWords(buf, 0, 16)), out = new Uint8Array(16);
      wordsToBytes(blk, out, 0, 4);
      return out;
    }
    return {
      tryPassword,
      decryptString,
      decryptStream,
      encryptString,
      encryptStream,
      buildUUE,
      buildOOE,
      buildPerms
    };
  } });
    __register({ name: "pdfInfo", dependencies: ["pdfErrors","pdfParser"], factory: function(errors, parser) {
    const { ParseError, ContractError } = errors, { isType } = parser, PDFDOC = [];
    for (let c = 0;c < 256; c++)
      PDFDOC.push(c);
    [728, 711, 710, 729, 733, 731, 730, 732].forEach((u, i) => {
      PDFDOC[24 + i] = u;
    });
    PDFDOC[127] = 65533;
    [
      8226,
      8224,
      8225,
      8230,
      8212,
      8211,
      402,
      8260,
      8249,
      8250,
      8722,
      8240,
      8222,
      8220,
      8221,
      8216,
      8217,
      8218,
      8482,
      64257,
      64258,
      321,
      338,
      352,
      376,
      381,
      305,
      322,
      339,
      353,
      382,
      65533,
      8364
    ].forEach((u, i) => {
      PDFDOC[128 + i] = u;
    });
    PDFDOC[173] = 65533;
    function decodeTextString(bytes) {
      if (!(bytes instanceof Uint8Array))
        throw new ContractError("pdf/info/bad-text-string", "decodeTextString expects a Uint8Array", { context: { typeof: typeof bytes } });
      if (bytes.length >= 2 && bytes[0] === 254 && bytes[1] === 255) {
        let s = "";
        for (let i = 2;i + 1 < bytes.length; i += 2)
          s += String.fromCharCode(bytes[i] << 8 | bytes[i + 1]);
        return s.replace(/\u001b[^\u001b]*\u001b/g, "");
      }
      if (bytes.length >= 3 && bytes[0] === 239 && bytes[1] === 187 && bytes[2] === 191)
        return new TextDecoder("utf-8").decode(bytes.subarray(3));
      let s = "";
      for (const c of bytes)
        s += String.fromCharCode(PDFDOC[c]);
      return s;
    }
    const STRINGY = ["Title", "Author", "Subject", "Keywords", "Creator", "Producer"], DATEY = ["CreationDate", "ModDate"], KNOWN = new Set(STRINGY.concat(DATEY, ["Trapped"]));
    function lower(s) {
      return s.charAt(0).toLowerCase() + s.slice(1);
    }
    function typeInfo(dict) {
      if (!isType(dict, "dict"))
        throw new ParseError("pdf/info/not-dict", "Info must be a dictionary", { context: { type: dict && dict.type } });
      const e = dict.entries, out = { raw: dict, _extras: {} };
      for (const k of STRINGY)
        if (e[k] !== void 0) {
          if (e[k].type !== "string")
            throw new ParseError("pdf/info/bad-string", "/" + k + " must be a string", { context: { key: k, type: e[k].type } });
          out[lower(k)] = e[k].value;
        }
      for (const k of DATEY)
        if (e[k] !== void 0) {
          if (e[k].type !== "string")
            throw new ParseError("pdf/info/bad-date", "/" + k + " must be a date string", { context: { key: k, type: e[k].type } });
          out[lower(k)] = e[k].value;
        }
      if (e.Trapped !== void 0)
        if (e.Trapped.type === "name")
          out.trapped = e.Trapped.value;
        else if (e.Trapped.type === "bool")
          out.trapped = e.Trapped.value ? "True" : "False";
        else
          throw new ParseError("pdf/info/bad-trapped", "/Trapped must be a name (True|False|Unknown)", { context: { type: e.Trapped.type } });
      for (const k of Object.keys(e))
        if (!KNOWN.has(k))
          out._extras[k] = e[k];
      return out;
    }
    return { typeInfo, decodeTextString };
  } });
    __register({ name: "pdfDocument", dependencies: ["pdfErrors","pdfTokenizer","pdfParser","pdfXref","pdfTrailer","pdfCatalog","pdfPage","pdfPages","pdfCrossRefStream","pdfObjStream","pdfFilterDispatch","pdfSecurity","pdfStandardV4","pdfStandardV5","pdfStandardV6","pdfInfo"], factory: function(errors, tokenizerMod, parserMod, xrefMod, trailerMod, catalogMod, pageMod, pagesMod, crossRefStreamMod, objStreamMod, filterDispatchMod, securityMod, v4Mod, v5Mod, v6Mod, infoMod) {
    const { ParseError, ContractError, EncryptionError } = errors, tokenize = tokenizerMod && tokenizerMod.tokenize, parseIndirect = parserMod && parserMod.parseIndirect, locateStartXref = xrefMod && xrefMod.locateStartXref, readStartXref = xrefMod && xrefMod.readStartXref, parseXrefTable = xrefMod && xrefMod.parseXrefTable, parseTrailerDict = xrefMod && xrefMod.parseTrailerDict, typeTrailer = trailerMod && trailerMod.typeTrailer, typeCatalog = catalogMod && catalogMod.typeCatalog, typePage = pageMod && pageMod.typePage, walkPageTree = pagesMod && pagesMod.walkPageTree, HEADER_PREFIX = new Uint8Array([37, 80, 68, 70, 45]), XREF_KEYWORD = new Uint8Array([120, 114, 101, 102]), PDF_NULL = Object.freeze({ type: "null" }), SECTION_LOCAL_KEYS = new Set([
      "Prev",
      "XRefStm",
      "Type",
      "W",
      "Index",
      "Length",
      "Filter",
      "DecodeParms",
      "F",
      "FFilter",
      "FDecodeParms",
      "DL"
    ]), EMPTY_PAGES_NODE = Object.freeze({
      type: "dict",
      entries: Object.freeze({
        Type: Object.freeze({ type: "name", value: "Pages" }),
        Kids: Object.freeze({ type: "array", items: Object.freeze([]) })
      })
    });
    function skipWhitespace(bytes, at) {
      let p = at < 0 ? 0 : at;
      while (p < bytes.length) {
        const b = bytes[p];
        if (b === 0 || b === 9 || b === 10 || b === 12 || b === 13 || b === 32) {
          p++;
          continue;
        }
        break;
      }
      return p;
    }
    function startsXrefTable(bytes, at) {
      for (let k = 0;k < XREF_KEYWORD.length; k++)
        if (bytes[at + k] !== XREF_KEYWORD[k])
          return !1;
      return !0;
    }
    function refuseIndirectLength(ref) {
      throw new ParseError("pdf/document/xrefstm-indirect-length", "a cross-reference stream may not use an indirect /Length", { context: { num: ref && ref.num, gen: ref && ref.gen } });
    }
    function requireStreamWiring(offset) {
      if (!crossRefStreamMod || !objStreamMod || !filterDispatchMod)
        throw new ParseError("pdf/document/xref-stream-unwired", "this pdfDocument was built without pdfCrossRefStream, " + "pdfObjStream and pdfFilterDispatch \u2014 cross-reference " + "streams and object streams cannot be read", { context: { offset } });
    }
    function readXrefStreamSection(bytes, at, end = !0) {
      requireStreamWiring(at);
      const tok = tokenize(bytes, { start: at }), streamObj = parseIndirect(tok, refuseIndirectLength).value;
      checkStreamWindow(streamObj, bytes, end, null);
      const typeEntry = streamObj && streamObj.dict && streamObj.dict.entries && streamObj.dict.entries.Type;
      if (!streamObj || streamObj.type !== "stream" || !typeEntry || typeEntry.type !== "name" || typeEntry.value !== "XRef")
        throw new ParseError("pdf/document/bad-xref-section", "neither an xref table nor a cross-reference stream at startxref", { context: { offset: at } });
      const decoded = filterDispatchMod.decode(streamObj);
      return { entries: crossRefStreamMod.parseCrossRefStream(decoded, streamObj.dict).entries, dict: streamObj.dict };
    }
    function mergeTrailerDicts(dicts) {
      if (dicts.length === 1)
        return dicts[0];
      for (const d of dicts)
        if (!d || d.type !== "dict")
          return d;
      const entries = { ...dicts[0].entries };
      for (let i = 1;i < dicts.length; i++)
        for (const k of Object.keys(dicts[i].entries)) {
          if (SECTION_LOCAL_KEYS.has(k))
            continue;
          if (!(k in entries))
            entries[k] = dicts[i].entries[k];
        }
      return { ...dicts[0], entries };
    }
    const OBJ_HEADER = /(?<![0-9A-Za-z])(\d{1,10})[\0\t\n\f\r ]+(\d{1,5})[\0\t\n\f\r ]+obj(?![0-9A-Za-z])/g, TRAILER_KEYWORD = /(?<![0-9A-Za-z])trailer(?![0-9A-Za-z])/g;
    function nameEntry(dict, key) {
      const v = dict && dict.type === "dict" && dict.entries[key];
      return v && v.type === "name" ? v.value : null;
    }
    function rebuildXref(bytes) {
      const text = new TextDecoder("latin1").decode(bytes), entries = {}, trailers = [];
      let lastCatalog = null, maxNum = -1;
      OBJ_HEADER.lastIndex = 0;
      for (let m = OBJ_HEADER.exec(text);m !== null; m = OBJ_HEADER.exec(text)) {
        const num = Number(m[1]), gen = Number(m[2]), at = m.index;
        let def;
        try {
          def = parseIndirect(tokenize(bytes, { start: at }), () => null);
        } catch (_e) {
          continue;
        }
        entries[num] = { type: 1, offset: at, gen, free: !1 };
        if (num > maxNum)
          maxNum = num;
        const value = def.value, dict = value && value.type === "stream" ? value.dict : value, type = nameEntry(dict, "Type");
        if (type === "Catalog")
          lastCatalog = { num, gen };
        if (type === "XRef" && value.type === "stream")
          trailers.push({ at, dict: value.dict });
        else if (type === "ObjStm" && value.type === "stream" && objStreamMod && filterDispatchMod)
          try {
            objStreamMod.parseObjectStream(filterDispatchMod.decode(value), value.dict).forEach((member, index) => {
              entries[member.num] = { type: 2, objStm: num, index, free: !1, offset: 0, gen: 0 };
              if (member.num > maxNum)
                maxNum = member.num;
            });
          } catch (_e) {}
      }
      TRAILER_KEYWORD.lastIndex = 0;
      for (let m = TRAILER_KEYWORD.exec(text);m !== null; m = TRAILER_KEYWORD.exec(text))
        try {
          trailers.push({ at: m.index, dict: parseTrailerDict(bytes, m.index).dict });
        } catch (_e) {}
      trailers.sort((a, b) => b.at - a.at);
      const merged = trailers.length > 0 ? mergeTrailerDicts(trailers.map((t) => t.dict)) : { type: "dict", entries: {} }, trailerEntries = { ...merged.entries };
      if (!trailerEntries.Root && lastCatalog)
        trailerEntries.Root = { type: "ref", num: lastCatalog.num, gen: lastCatalog.gen };
      if (!trailerEntries.Size)
        trailerEntries.Size = { type: "int", value: maxNum + 1 };
      return { entries, trailer: { ...merged, entries: trailerEntries } };
    }
    function readHeader(bytes) {
      if (bytes.length < 8)
        throw new ParseError("pdf/document/short", "input too short to contain a PDF header", { context: { length: bytes.length } });
      let off = -1;
      const maxScan = Math.min(bytes.length - 5, 1024);
      outer:
        for (let i = 0;i <= maxScan; i++) {
          for (let k = 0;k < 5; k++)
            if (bytes[i + k] !== HEADER_PREFIX[k])
              continue outer;
          off = i;
          break;
        }
      if (off < 0)
        throw new ParseError("pdf/document/bad-header", "no %PDF- header found in first 1024 bytes");
      let p = off + 5;
      const digits = [];
      while (p < bytes.length) {
        const b = bytes[p];
        if (b === 10 || b === 13)
          break;
        digits.push(b);
        p++;
      }
      const version = new TextDecoder("latin1").decode(Uint8Array.from(digits));
      if (p < bytes.length && bytes[p] === 13)
        p++;
      if (p < bytes.length && bytes[p] === 10)
        p++;
      return { version, end: p };
    }
    function resolvedDict(node, resolve) {
      const d = resolve(node);
      if (!d || d.type !== "dict")
        return d;
      const entries = {};
      for (const k of Object.keys(d.entries))
        entries[k] = resolve(d.entries[k]);
      const cf = entries.CF;
      if (cf && cf.type === "dict") {
        const cfEntries = {};
        for (const k of Object.keys(cf.entries))
          cfEntries[k] = resolve(cf.entries[k]);
        entries.CF = { ...cf, entries: cfEntries };
      }
      return { ...d, entries };
    }
    function hasType(dict, value) {
      const t = dict && dict.type === "dict" && dict.entries.Type;
      return !!t && t.type === "name" && t.value === value;
    }
    function createDecryptor(encryptNode, trailerTyped, password, resolve, legacyRc4, fastCipher) {
      const typed = securityMod.typeEncryptDict(resolvedDict(encryptNode, resolve)), filter = typed.Filter && typed.Filter.type === "name" ? typed.Filter.value : typed.Filter;
      if (filter !== "Standard")
        throw new EncryptionError("pdf/crypto/unsupported-filter", "only the Standard security handler is supported", { context: { filter } });
      typed.idFirst = trailerTyped.id ? trailerTyped.id[0] : void 0;
      const badPassword = () => new EncryptionError("pdf/document/bad-password", "the password opens the document neither as its user nor as its owner password", { context: { V: typed.V, R: typed.R } });
      let strings, streams;
      if (legacyRc4 && (typed.V === 1 || typed.V === 2)) {
        const params = {
          O: typed.O,
          U: typed.U,
          P: typed.P,
          idFirst: typed.idFirst,
          revision: typed.R,
          keyLength: typed.V === 2 && typeof typed.Length === "number" ? typed.Length : 40,
          encryptMetadata: typed.EncryptMetadata
        };
        let r = legacyRc4.validateUserPassword(password, params);
        if (!r.ok)
          r = legacyRc4.validateOwnerPassword(password, params);
        if (!r.ok)
          throw badPassword();
        const fileKey = r.fileKey;
        strings = (bytes, num, gen) => legacyRc4.decryptString(fileKey, num, gen, bytes);
        streams = (stream, num, gen) => legacyRc4.decryptStream(fileKey, num, gen, stream.raw);
      } else {
        const selection = securityMod.selectHandler(typed, { v4: v4Mod, v5: v5Mod, v6: v6Mod }), h = selection.handler, copts = fastCipher ? { fastCipher: !0 } : void 0;
        let fek = h.tryPassword(typed, password, !1, copts).fileEncryptionKey;
        if (!fek)
          fek = h.tryPassword(typed, password, !0, copts).fileEncryptionKey;
        if (!fek)
          throw badPassword();
        const strView = { method: selection.strMethod };
        strings = (bytes, num, gen) => selection.strMethod === "Identity" ? bytes : h.decryptString(strView, fek, num, gen, bytes, copts);
        streams = (stream, num, gen) => securityMod.dispatchDecryptStream(selection, stream, fek, num, gen, stream.raw, copts);
      }
      const encryptNum = encryptNode && encryptNode.type === "ref" ? encryptNode.num : -1;
      function walk(v, num, gen) {
        if (!v || typeof v !== "object")
          return v;
        switch (v.type) {
          case "string":
            return { ...v, value: strings(v.value, num, gen) };
          case "array":
            return { ...v, items: v.items.map((x) => walk(x, num, gen)) };
          case "dict": {
            const sig = hasType(v, "Sig") || hasType(v, "DocTimeStamp"), entries = {};
            for (const k of Object.keys(v.entries))
              entries[k] = sig && k === "Contents" ? v.entries[k] : walk(v.entries[k], num, gen);
            return { ...v, entries };
          }
          case "stream": {
            if (hasType(v.dict, "XRef"))
              return v;
            const dict = walk(v.dict, num, gen);
            if (hasType(v.dict, "Metadata") && !typed.EncryptMetadata)
              return { ...v, dict };
            const raw = v.raw instanceof Uint8Array ? streams(v, num, gen) : v.raw;
            return { ...v, dict, raw };
          }
          default:
            return v;
        }
      }
      return {
        decrypt(num, gen, value) {
          return num === encryptNum ? value : walk(value, num, gen);
        }
      };
    }
    const SOURCE_WINDOW = 65536, SOURCE_WINDOW_MIN = 16, SOURCE_WINDOW_SLACK = 65536, STARTXREF_TAIL = 8192;
    function isSource(v) {
      return !!v && typeof v === "object" && !(v instanceof Uint8Array) && Number.isSafeInteger(v.byteLength) && v.byteLength >= 0 && typeof v.read === "function";
    }

    class WindowShort extends Error {
    }
    function inputOf(input, first) {
      if (!isSource(input)) {
        const whole = { bytes: input, base: 0, end: !0 };
        return { size: input.length, window: () => whole, run: (offset, parse) => parse(input, offset, !0) };
      }
      const size = input.byteLength;
      function window(offset, length) {
        const n = Math.max(0, Math.min(length, size - offset)), got = input.read(offset, n);
        if (!(got instanceof Uint8Array))
          throw new ContractError("pdf/document/bad-source-read", "a byte source read must return a Uint8Array", { context: { offset, length: n, typeof: typeof got } });
        return { bytes: got, base: offset, end: offset + got.length >= size };
      }
      function run(offset, parse) {
        const cap = parserMod.parserLimits.maxStreamBytes + SOURCE_WINDOW_SLACK;
        let length = Math.min(first, cap);
        for (;; ) {
          const w = window(offset, length);
          try {
            return parse(w.bytes, 0, w.end);
          } catch (err) {
            if (w.end || !(err instanceof ParseError || err instanceof WindowShort))
              throw err;
          }
          if (length >= cap)
            throw new ParseError("pdf/document/source-window", "the object does not fit the largest window a byte source is read by", { context: { offset, window: length } });
          length = Math.min(length * 2, cap);
        }
      }
      return { size, window, run };
    }
    function checkStreamWindow(value, bytes, end, resolveRef) {
      if (end || !value || value.type !== "stream")
        return;
      let len = value.dict && value.dict.entries && value.dict.entries.Length;
      if (len && len.type === "ref" && resolveRef)
        len = resolveRef(len);
      if (len && len.type === "int" && len.value > value.raw.length)
        throw new WindowShort("stream longer than its window");
    }
    const INFO_TEXT = [
      ["Title", "title"],
      ["Author", "author"],
      ["Subject", "subject"],
      ["Keywords", "keywords"],
      ["Creator", "creator"],
      ["Producer", "producer"],
      ["CreationDate", "creationDate"],
      ["ModDate", "modDate"]
    ];
    function infoText(node, resolve) {
      let dict;
      try {
        dict = resolve(node);
      } catch {
        return null;
      }
      if (!dict || dict.type !== "dict")
        return null;
      const out = {};
      for (const [key, name] of INFO_TEXT) {
        let v;
        try {
          v = resolve(dict.entries[key]);
        } catch {
          continue;
        }
        if (v && v.type === "string" && v.value instanceof Uint8Array)
          out[name] = infoMod.decodeTextString(v.value);
      }
      let t;
      try {
        t = resolve(dict.entries.Trapped);
      } catch {
        t = void 0;
      }
      if (t && t.type === "name")
        out.trapped = t.value;
      else if (t && t.type === "bool")
        out.trapped = t.value ? "True" : "False";
      return out;
    }
    function contentsOf(page, resolve) {
      const parts = [];
      for (const ref of page.contents || []) {
        const s = resolve({ type: "ref", num: ref.num, gen: ref.gen });
        if (!s || s.type !== "stream")
          throw new ParseError("pdf/document/bad-contents", `content ${ref.num} ${ref.gen} R is not a stream`, { context: { num: ref.num, gen: ref.gen } });
        parts.push(filterDispatchMod.decode(s));
      }
      const size = parts.reduce((n, x) => n + x.length, 0) + Math.max(0, parts.length - 1), out = new Uint8Array(size);
      let at = 0;
      parts.forEach((x, k) => {
        if (k)
          out[at++] = 10;
        out.set(x, at);
        at += x.length;
      });
      return out;
    }
    function readDocument(input, opts = {}) {
      if (!(input instanceof Uint8Array) && !isSource(input))
        throw new ParseError("pdf/document/bad-input", "readDocument expects a Uint8Array or a byte source { byteLength, read(offset, length) }", { context: { typeof: input === null ? "null" : typeof input } });
      const sourceWindow = opts.sourceWindow;
      if (sourceWindow !== void 0 && !(Number.isSafeInteger(sourceWindow) && sourceWindow >= SOURCE_WINDOW_MIN))
        throw new ContractError("pdf/document/bad-source-window-option", `opts.sourceWindow must be an integer of at least ${SOURCE_WINDOW_MIN}`, { context: { typeof: typeof sourceWindow } });
      const fromSource = isSource(input), src = inputOf(input, sourceWindow === void 0 ? SOURCE_WINDOW : sourceWindow), bytes = fromSource ? null : input, password = opts.password;
      if (password !== void 0 && typeof password !== "string" && !(password instanceof Uint8Array))
        throw new ContractError("pdf/document/bad-password-option", "opts.password must be a string or a Uint8Array", { context: { typeof: typeof password } });
      const legacyRc4 = opts.legacyRc4;
      if (legacyRc4 !== void 0 && !(legacyRc4 && [
        "validateUserPassword",
        "validateOwnerPassword",
        "decryptString",
        "decryptStream"
      ].every((f) => typeof legacyRc4[f] === "function")))
        throw new ContractError("pdf/document/bad-legacy-rc4-option", "opts.legacyRc4 must be the pdfLegacyRc4Read instance", { context: { typeof: typeof legacyRc4 } });
      const fastCipher = opts.fastCipher;
      if (fastCipher !== void 0 && typeof fastCipher !== "boolean")
        throw new ContractError("pdf/document/bad-fast-cipher-option", "opts.fastCipher must be a boolean", { context: { typeof: fastCipher === null ? "null" : typeof fastCipher } });
      const { version, end: headerEnd } = readHeader(fromSource ? src.window(0, SOURCE_WINDOW).bytes : bytes), xref = { entries: {}, sections: [] }, losses = [];
      function walkChain() {
        const tail = fromSource ? src.window(Math.max(0, src.size - STARTXREF_TAIL), STARTXREF_TAIL).bytes : bytes, sxAt = locateStartXref(tail);
        if (sxAt < 0)
          throw new ParseError("pdf/document/no-startxref", "startxref keyword not found near EOF");
        const xrefAt = readStartXref(tail, sxAt), trailerDicts = [];
        let cursor = xrefAt;
        const seenSections = new Set;
        function mergeSection(at, kind, entries) {
          xref.sections.push({ at, kind, entries });
          for (const k of Object.keys(entries))
            if (!(k in xref.entries))
              xref.entries[k] = entries[k];
        }
        for (let safety = 0;safety < 32 && cursor >= 0; safety++) {
          if (seenSections.has(cursor))
            break;
          seenSections.add(cursor);
          let dict;
          const read = src.run(cursor, (b, at, end) => {
            if (startsXrefTable(b, skipWhitespace(b, at))) {
              const section = parseXrefTable(b, at);
              let trailerError = null, trailerDict;
              try {
                trailerDict = parseTrailerDict(b, section.end).dict;
              } catch (err) {
                if (!end)
                  throw err;
                trailerError = err;
              }
              return { table: section, dict: trailerDict, trailerError };
            }
            return { stream: readXrefStreamSection(b, at, end) };
          });
          if (read.table) {
            const section = read.table;
            for (const shape of section.tolerated || [])
              losses.push({
                code: "pdf/document/xref-tolerated",
                message: "a cross-reference table shape outside the standard was read",
                context: { shape, at: cursor }
              });
            mergeSection(cursor, "table", section.entries);
            if (read.trailerError)
              throw read.trailerError;
            dict = read.dict;
            const stmAt = dict && dict.entries && dict.entries.XRefStm;
            if (stmAt && stmAt.type === "int" && stmAt.value >= 0 && stmAt.value < src.size) {
              const hybrid = src.run(stmAt.value, (b, at, end) => readXrefStreamSection(b, at, end));
              mergeSection(stmAt.value, "stream", hybrid.entries);
            }
          } else {
            const section = read.stream;
            mergeSection(cursor, "stream", section.entries);
            dict = section.dict;
          }
          trailerDicts.push(dict);
          const prev = dict && dict.type === "dict" && dict.entries && dict.entries.Prev;
          if (prev && prev.type === "int" && prev.value >= 0 && prev.value !== cursor)
            cursor = prev.value;
          else
            break;
        }
        if (trailerDicts.length === 0)
          throw new ParseError("pdf/document/no-trailer", "no usable trailer dictionary found");
        return typeTrailer(mergeTrailerDicts(trailerDicts));
      }
      let trailerTyped;
      try {
        trailerTyped = walkChain();
      } catch (err) {
        if (opts.recoverXref === !1 || !(err instanceof ParseError))
          throw err;
        const rebuilt = rebuildXref(bytes || src.window(0, src.size).bytes);
        xref.entries = rebuilt.entries;
        xref.sections = [{ at: null, kind: "rebuilt", entries: xref.entries }];
        losses.push({
          code: "pdf/document/xref-rebuilt",
          message: "the cross-reference chain could not be used; the table was rebuilt from the file",
          context: { cause: err.code, entries: Object.keys(xref.entries).length }
        });
        trailerTyped = typeTrailer(rebuilt.trailer);
      }
      if (trailerTyped.encrypt && opts.allowEncrypted !== !0 && password === void 0) {
        const refused = new ParseError("pdf/document/encrypted", "document is encrypted (trailer /Encrypt present) and the empty password does not open it \u2014 " + "pass { password } to decrypt it, or { allowEncrypted: true } to read the raw ciphertext container", { context: { encrypt: trailerTyped.encrypt } });
        if (opts.emptyPassword === !1)
          throw refused;
        let opened;
        try {
          opened = readDocument(input, { ...opts, password: "" });
        } catch {
          throw refused;
        }
        const er = opened.trailer.encrypt, encNode = er && er.type === "dict" ? er : opened._raw.resolve({ type: "ref", num: er.num, gen: er.gen }), p = encNode && encNode.type === "dict" && encNode.entries.P ? encNode.entries.P.value : null;
        opened.losses.push({
          code: "pdf/document/opened-with-empty-password",
          message: "the document is encrypted; it was opened with the empty password",
          context: { permissions: p }
        });
        return opened;
      }
      const indirects = new Map, lossKeys = new Set, freeKeys = new Set, objStmMembers = new Map, resolving = new Set;
      function resolve(ref) {
        if (!ref || ref.type !== "ref")
          return ref;
        return resolveByKey(ref.num, ref.gen);
      }
      function resolveByKey(num, gen) {
        const key = num + ":" + gen;
        if (indirects.has(key))
          return indirects.get(key).value;
        if (resolving.has(key)) {
          recordLoss("cycle:" + key, {
            code: "pdf/document/reference-cycle",
            message: `object ${num} ${gen} is referenced while it is being read; the reference reads as null`,
            context: { num, gen }
          });
          return PDF_NULL;
        }
        if (resolving.size >= 32)
          throw new ParseError("pdf/document/resolve-too-deep", `object ${num} ${gen} nests more than 32 objects being read`, { context: { num, gen, depth: resolving.size } });
        resolving.add(key);
        try {
          return resolveUnguarded(num, gen, key);
        } finally {
          resolving.delete(key);
        }
      }
      function resolveUnguarded(num, gen, key) {
        let entry = xref.entries[num];
        if (!entry)
          throw new ParseError("pdf/document/missing-xref", `object ${num} ${gen} not in xref`, { context: { num, gen } });
        if (entry.free) {
          entry = resolveFreeEntry(num, gen);
          if (!entry)
            return PDF_NULL;
        }
        if (entry.type === 2) {
          const value = resolveCompressed(num, gen, entry);
          indirects.set(key, { value, offset: 0, objStm: entry.objStm });
          return value;
        }
        const offset = entry.offset;
        if (offset <= 0 || offset >= src.size)
          throw new ParseError("pdf/document/bad-offset", `object ${num} ${gen} xref offset out of range`, { context: { num, gen, offset, total: src.size } });
        const def = src.run(offset, (b, at, end) => {
          const d = parseIndirect(tokenize(b, { start: at }), resolve);
          checkStreamWindow(d.value, b, end, resolve);
          if (fromSource && d.value && d.value.type === "stream")
            d.value = { ...d.value, raw: d.value.raw.slice() };
          return d;
        });
        if (def.num !== num || def.gen !== gen)
          throw new ParseError("pdf/document/xref-mismatch", "xref points to a different object", { context: { expected: { num, gen }, found: { num: def.num, gen: def.gen } } });
        const value = decryptor ? decryptor.decrypt(num, gen, def.value) : def.value;
        indirects.set(key, { value, offset });
        return value;
      }
      function resolveFreeEntry(num, gen) {
        const key = num + ":" + gen;
        for (const section of xref.sections) {
          const e = section.entries[num];
          if (e && !e.free) {
            recordLoss("fallback:" + key, {
              code: "pdf/document/free-entry-fallback",
              message: `object ${num} is free in the newest xref section; resolved through an older section that defines it`,
              context: { num, gen, section: { at: section.at, kind: section.kind } }
            });
            return e;
          }
        }
        freeKeys.add(key);
        recordLoss("free:" + key, {
          code: "pdf/document/free-object",
          message: `object ${num} is free in every xref section; read as null`,
          context: { num, gen }
        });
        return null;
      }
      function recordLoss(dedupeKey, loss) {
        if (lossKeys.has(dedupeKey))
          return;
        lossKeys.add(dedupeKey);
        losses.push(loss);
      }
      function resolveCompressed(num, gen, entry) {
        if (trailerTyped && trailerTyped.encrypt && !decryptor)
          throw new ParseError("pdf/document/objstm-encrypted", "object streams of an encrypted document cannot be read without its password", { context: { num, gen, objStm: entry.objStm } });
        const containerNum = entry.objStm;
        let members = objStmMembers.get(containerNum);
        if (!members) {
          requireStreamWiring(0);
          const containerEntry = xref.entries[containerNum];
          if (containerEntry && containerEntry.type === 2)
            throw new ParseError("pdf/document/objstm-nested", `object stream ${containerNum} is itself stored in an object stream`, { context: { num, objStm: containerNum } });
          const container = resolveByKey(containerNum, 0);
          if (!container || container.type !== "stream")
            throw new ParseError("pdf/document/objstm-not-stream", `object ${containerNum} is not a stream and cannot hold compressed objects`, { context: {
              num,
              objStm: containerNum,
              type: container && container.type
            } });
          members = objStreamMod.parseObjectStream(filterDispatchMod.decode(container), container.dict);
          objStmMembers.set(containerNum, members);
        }
        const member = members[entry.index];
        if (!member || member.num !== num)
          throw new ParseError("pdf/document/objstm-mismatch", "object stream member does not carry the expected object number", { context: {
            num,
            objStm: containerNum,
            index: entry.index,
            found: member ? member.num : null
          } });
        return member.value;
      }
      let decryptor = null;
      if (trailerTyped.encrypt && password !== void 0) {
        const encryptNode = trailerTyped.encrypt.type === "dict" ? trailerTyped.encrypt : { type: "ref", num: trailerTyped.encrypt.num, gen: trailerTyped.encrypt.gen };
        decryptor = createDecryptor(encryptNode, trailerTyped, password, resolve, legacyRc4, fastCipher === !0);
      }
      const rootRef = trailerTyped.root, catalogDict = resolve({ type: "ref", num: rootRef.num, gen: rootRef.gen });
      if (freeKeys.has(rootRef.num + ":" + rootRef.gen))
        throw new ParseError("pdf/document/free-object", `object ${rootRef.num} is free`, { context: { num: rootRef.num, gen: rootRef.gen, role: "catalog" } });
      const catalog = typeCatalog(catalogDict);
      function resolvePageTreeNode(ref) {
        const value = resolve(ref);
        if (ref && ref.type === "ref" && freeKeys.has(ref.num + ":" + ref.gen))
          return EMPTY_PAGES_NODE;
        return value;
      }
      const pages = walkPageTree(catalog.pages, resolvePageTreeNode).map((r) => typePage(resolve({ type: "ref", num: r.num, gen: r.gen })));
      return {
        version,
        catalog,
        pages,
        trailer: trailerTyped,
        xref,
        losses,
        resolve,
        info: () => trailerTyped && trailerTyped.info ? infoText({ type: "ref", num: trailerTyped.info.num, gen: trailerTyped.info.gen }, resolve) : null,
        pageContents(i) {
          if (!Number.isInteger(i) || i < 0 || i >= pages.length)
            throw new ContractError("pdf/document/bad-page-index", `no page ${i} (the document has ${pages.length})`, { context: { index: i, pages: pages.length } });
          return contentsOf(pages[i], resolve);
        },
        _raw: fromSource ? { resolve, source: input, headerEnd, indirects } : { resolve, bytes, headerEnd, indirects }
      };
    }
    return { readDocument, readHeader };
  } });
    __register({ name: "pdfWriter", dependencies: ["pdfErrors","pdfSerializer","sha256","bitArray"], factory: function(errors, serializerMod, sha256Mod, bitArrayMod) {
    const { RenderError } = errors, serializeIndirect = serializerMod.serializeIndirect, canDerive = !!(sha256Mod && typeof sha256Mod.hash === "function" && bitArrayMod && typeof bitArrayMod.ui8_to_ba === "function");
    function derivedId(body) {
      const half = bitArrayMod.ba_to_ui8(sha256Mod.hash(bitArrayMod.ui8_to_ba(body))).slice(0, 16);
      return [half, half.slice()];
    }
    const te = new TextEncoder;
    function pad10(n) {
      return String(n).padStart(10, "0");
    }
    function hexLit(bytes) {
      let s = "<";
      for (let i = 0;i < bytes.length; i++)
        s += "0123456789ABCDEF"[bytes[i] >> 4] + "0123456789ABCDEF"[bytes[i] & 15];
      return s + ">";
    }
    function concat(arrays) {
      let n = 0;
      for (const a of arrays)
        n += a.length;
      const out = new Uint8Array(n);
      let o = 0;
      for (const a of arrays) {
        out.set(a, o);
        o += a.length;
      }
      return out;
    }
    function validateIndirects(list) {
      let prev = -1;
      for (const it of list) {
        if (!it || !Number.isFinite(it.num) || it.num < 1)
          throw new RenderError("pdf/writer/bad-indirect", "each indirect requires num >= 1", { context: { item: it } });
        if (it.num === prev)
          throw new RenderError("pdf/writer/duplicate-num", "duplicate object number", { context: { num: it.num } });
        prev = it.num;
      }
    }
    function buildXref(maxNum, offsets) {
      let s = `xref
0 ${maxNum + 1}
`;
      s += `0000000000 65535 f 
`;
      for (let n = 1;n <= maxNum; n++)
        if (offsets.has(n))
          s += pad10(offsets.get(n)) + ` 00000 n 
`;
        else
          s += `0000000000 00000 f 
`;
      return te.encode(s);
    }
    function buildTrailer(opts) {
      const parts = [`trailer
<< /Size ${opts.size}`];
      parts.push(` /Root ${opts.root.num} ${opts.root.gen | 0} R`);
      if (opts.info)
        parts.push(` /Info ${opts.info.num} ${opts.info.gen | 0} R`);
      if (opts.id) {
        parts.push(" /ID [");
        parts.push(hexLit(opts.id[0]));
        parts.push(hexLit(opts.id[1]));
        parts.push("]");
      }
      parts.push(` >>
`);
      parts.push(`startxref
${opts.xrefOffset}
%%EOF
`);
      return te.encode(parts.join(""));
    }
    function writeDocument(opts) {
      if (!opts || !Array.isArray(opts.indirects))
        throw new RenderError("pdf/writer/bad-input", "writeDocument expects { indirects: [...] }");
      if (!opts.root || !Number.isFinite(opts.root.num))
        throw new RenderError("pdf/writer/no-root", "writeDocument requires opts.root");
      const version = opts.version || "2.0";
      if (!/^\d\.\d$/.test(version))
        throw new RenderError("pdf/writer/bad-version", 'version must look like "x.y"', { context: { version } });
      const indirects = opts.indirects.slice().sort((a, b) => a.num - b.num);
      validateIndirects(indirects);
      const parts = [];
      let cursor = 0;
      const offsets = new Map;
      function push(u8) {
        parts.push(u8);
        cursor += u8.length;
      }
      push(te.encode(`%PDF-${version}
`));
      push(new Uint8Array([37, 226, 227, 207, 211, 10]));
      const maxNum = indirects.length > 0 ? indirects[indirects.length - 1].num : 0;
      for (const { num, gen, value } of indirects) {
        offsets.set(num, cursor);
        push(serializeIndirect(num, gen, value));
      }
      const xrefOffset = cursor;
      push(buildXref(maxNum, offsets));
      const size = maxNum + 1, id = opts.id || ((version === "2.0" || opts.deriveId === !0) && canDerive ? derivedId(concat(parts)) : void 0);
      push(buildTrailer({
        size,
        root: opts.root,
        info: opts.info,
        id,
        xrefOffset
      }));
      return concat(parts);
    }
    function assembleIndirects(model, opts) {
      if (!model || !model._raw || typeof model._raw.resolve !== "function")
        throw new RenderError("pdf/writer/bad-model", "assembleIndirects requires a model produced by pdf.read()");
      const skipped = [];
      for (const k of Object.keys(model.xref.entries)) {
        const e = model.xref.entries[k];
        if (e.free)
          continue;
        try {
          model._raw.resolve({ type: "ref", num: Number(k), gen: e.gen });
        } catch (err) {
          skipped.push({
            num: Number(k),
            gen: e.gen,
            code: errors.isPdfError(err) ? err.code : "unknown"
          });
        }
      }
      if (skipped.length > 0 && opts && opts.strict === !0)
        throw new RenderError("pdf/writer/unresolvable-objects", `${skipped.length} object${skipped.length === 1 ? "" : "s"} could not be resolved and would be dropped`, { context: { objects: skipped } });
      const out = [];
      for (const [key, rec] of model._raw.indirects.entries()) {
        const [n, g] = key.split(":").map(Number);
        out.push({ num: n, gen: g, value: rec.value });
      }
      out.sort((a, b) => a.num - b.num);
      Object.defineProperty(out, "skippedObjects", {
        value: skipped,
        enumerable: !1,
        writable: !0,
        configurable: !0
      });
      return out;
    }
    return { writeDocument, assembleIndirects };
  } });
    __register({ name: "pdf", dependencies: ["pdfErrors","pdfShared","pdfTokenizer","pdfParserObj","pdfParser","pdfXref","pdfTrailer","pdfSerializer","pdfCatalog","pdfPages","pdfPage","pdfDocument","pdfWriter"], factory: function(errors, shared, tokenizer, parserObj, parser, xref, trailer, serializer, catalog, pages, page, docMod, writerMod) {
    const { ContractError } = errors, readDocument = docMod.readDocument, readHeader = docMod.readHeader, writeDocument = writerMod.writeDocument, assembleIndirects = writerMod.assembleIndirects, usedExtensions = new Set, api = {
      read(input, opts) {
        return readDocument(input, opts);
      },
      header(bytes) {
        return readHeader(bytes);
      },
      write(model, opts) {
        const o = opts && typeof opts === "object" ? opts : {};
        let skipped = [], bytes;
        if (model && model._raw && typeof model._raw.resolve === "function") {
          const indirects = assembleIndirects(model, o.strict === !0 ? { strict: !0 } : void 0);
          skipped = indirects.skippedObjects || [];
          bytes = writeDocument({
            indirects,
            root: model.catalog.pages ? { num: model.trailer.root.num, gen: model.trailer.root.gen } : model.trailer.root,
            info: model.trailer.info,
            id: model.trailer.id,
            version: "2.0"
          });
        } else
          bytes = writeDocument(model);
        if (skipped.length > 0 && typeof o.onSkipped === "function")
          o.onSkipped(skipped.slice());
        Object.defineProperty(bytes, "skippedObjects", {
          value: skipped,
          enumerable: !1,
          writable: !0,
          configurable: !0
        });
        return bytes;
      },
      use(ext) {
        if (!ext || typeof ext.name !== "string" || typeof ext.register !== "function")
          throw new ContractError("pdf/use/bad-extension", ".use() requires { name: string, register: function }", { context: { keys: ext && Object.keys(ext) } });
        if (usedExtensions.has(ext.name))
          return api;
        usedExtensions.add(ext.name);
        const next = ext.register(api, { usedExtensions });
        if (next && typeof next === "object") {
          for (const k of Object.keys(next))
            if (k !== "use")
              api[k] = next[k];
        }
        return api;
      },
      usedExtension(name) {
        return usedExtensions.has(name);
      }
    };
    return api;
  } });
    __register({ name: "pdfContentOpsExtended", dependencies: ["pdfErrors","pdfParserObj"], factory: function(errors, parserObj) {
    const { ParseError } = errors, { isType } = parserObj, EXT_GSTATE_KEYS = Object.freeze({
      Type: { kind: "name", doc: "must be /ExtGState" },
      LW: { kind: "num", doc: "line width" },
      LC: { kind: "int", doc: "line cap style 0|1|2" },
      LJ: { kind: "int", doc: "line join style 0|1|2" },
      ML: { kind: "num", doc: "miter limit" },
      D: { kind: "array", doc: "[ dashArray dashPhase ]" },
      RI: { kind: "name", doc: "rendering intent" },
      OP: { kind: "bool", doc: "stroke overprint" },
      op: { kind: "bool", doc: "non-stroke overprint" },
      OPM: { kind: "int", doc: "overprint mode 0|1" },
      Font: { kind: "array", doc: "[ font size ]" },
      BG: { kind: "stream-or-func", doc: "black-generation function" },
      BG2: { kind: "stream-or-name", doc: "BG or /Default" },
      UCR: { kind: "stream-or-func", doc: "undercolor-removal function" },
      UCR2: { kind: "stream-or-name", doc: "UCR or /Default" },
      TR: { kind: "stream-or-func-or-array", doc: "transfer function" },
      TR2: { kind: "stream-or-func-or-array-or-name", doc: "transfer function or /Default" },
      HT: { kind: "dict-or-stream-or-name", doc: "halftone" },
      FL: { kind: "num", doc: "flatness tolerance" },
      SM: { kind: "num", doc: "smoothness tolerance" },
      SA: { kind: "bool", doc: "stroke adjustment" },
      BM: { kind: "name-or-array", doc: "blend mode" },
      SMask: { kind: "dict-or-name", doc: "soft mask" },
      CA: { kind: "num", doc: "stroke alpha [0,1]" },
      ca: { kind: "num", doc: "non-stroke alpha [0,1]" },
      AIS: { kind: "bool", doc: "alpha is shape" },
      TK: { kind: "bool", doc: "text knockout" },
      UseBlackPtComp: { kind: "name", doc: "ON|OFF|Default" },
      HTO: { kind: "array", doc: "halftone origin [tx ty]" },
      HTP: { kind: "array", doc: "halftone phase [x y] (PDF 1.2, deprecated in 1.3)" }
    }), NUM = (v) => v && (v.type === "int" || v.type === "real");
    function typeExtGState(dict) {
      if (!isType(dict, "dict"))
        throw new ParseError("pdf/extra/ext-gstate/not-dict", "ExtGState must be a dictionary", { context: { type: dict && dict.type } });
      const e = dict.entries;
      if (e.Type && (e.Type.type !== "name" || e.Type.value !== "ExtGState"))
        throw new ParseError("pdf/extra/ext-gstate/bad-type", "/Type entry must be /ExtGState", { context: { actual: e.Type.value } });
      const out = {
        type: e.Type ? e.Type.value : null,
        lw: NUM(e.LW) ? e.LW.value : null,
        lc: NUM(e.LC) ? e.LC.value | 0 : null,
        lj: NUM(e.LJ) ? e.LJ.value | 0 : null,
        ml: NUM(e.ML) ? e.ML.value : null,
        d: isType(e.D, "array") ? e.D : null,
        ri: isType(e.RI, "name") ? e.RI.value : null,
        op: isType(e.OP, "bool") ? e.OP.value : null,
        opNs: isType(e.op, "bool") ? e.op.value : null,
        opm: NUM(e.OPM) ? e.OPM.value | 0 : null,
        font: isType(e.Font, "array") ? e.Font : null,
        bg: e.BG || null,
        bg2: e.BG2 || null,
        ucr: e.UCR || null,
        ucr2: e.UCR2 || null,
        tr: e.TR || null,
        tr2: e.TR2 || null,
        ht: e.HT || null,
        fl: NUM(e.FL) ? e.FL.value : null,
        sm: NUM(e.SM) ? e.SM.value : null,
        sa: isType(e.SA, "bool") ? e.SA.value : null,
        bm: e.BM || null,
        sMask: e.SMask || null,
        ca: NUM(e.CA) ? e.CA.value : null,
        caNs: NUM(e.ca) ? e.ca.value : null,
        ais: isType(e.AIS, "bool") ? e.AIS.value : null,
        tk: isType(e.TK, "bool") ? e.TK.value : null,
        useBlackPtComp: isType(e.UseBlackPtComp, "name") ? e.UseBlackPtComp.value : null,
        hto: isType(e.HTO, "array") ? e.HTO : null,
        htp: isType(e.HTP, "array") ? e.HTP : null,
        raw: dict,
        _extras: {}
      };
      for (const k of Object.keys(e))
        if (!(k in EXT_GSTATE_KEYS))
          out._extras[k] = e[k];
      return out;
    }
    function decodeType3CharOp(op, operands) {
      if (op !== "d0" && op !== "d1")
        throw new ParseError("pdf/extra/content-ops/unknown", "expected d0 or d1 operator", { context: { op } });
      if (op === "d0") {
        if (!operands || operands.length !== 2)
          throw new ParseError("pdf/extra/content-ops/bad-d0", "d0 requires 2 operands wx wy", { context: { count: operands && operands.length } });
        return { kind: "d0", wx: +operands[0], wy: +operands[1] };
      }
      if (!operands || operands.length !== 6)
        throw new ParseError("pdf/extra/content-ops/bad-d1", "d1 requires 6 operands wx wy llx lly urx ury", { context: { count: operands && operands.length } });
      return {
        kind: "d1",
        wx: +operands[0],
        wy: +operands[1],
        bbox: [+operands[2], +operands[3], +operands[4], +operands[5]]
      };
    }
    const keyTypes = (text) => Object.freeze(Object.fromEntries(text.split(" ").map((p) => p.split(":")))), COMMON = "Type:name HalftoneType:int HalftoneName:string", TRANSFER = "TransferFunction:dict|name|stream", HALFTONE_TYPES = Object.freeze({
      1: keyTypes(`${COMMON} Frequency:num Angle:num SpotFunction:array|dict|name|stream AccurateScreens:bool ${TRANSFER}`),
      5: keyTypes(`${COMMON} Default:dict|stream`),
      6: keyTypes(`${COMMON} Width:int Height:int ${TRANSFER}`),
      10: keyTypes(`${COMMON} Xsquare:int Ysquare:int ${TRANSFER}`),
      16: keyTypes(`${COMMON} Width:int Height:int Width2:int Height2:int ${TRANSFER}`)
    }), HALFTONE_KEYS = Object.freeze(Object.fromEntries(Object.entries(HALFTONE_TYPES).map(([type, types]) => [type, Object.freeze(Object.keys(types))]))), STREAM_KEYS = new Set(["Length", "Filter", "DecodeParms", "F", "FFilter", "FDecodeParms", "DL"]), HALFTONE_READ = Object.freeze({
      name: (v) => isType(v, "name") ? v.value : void 0,
      string: (v) => isType(v, "string") ? v.value : void 0,
      num: (v) => NUM(v) ? v.value : void 0,
      int: (v) => isType(v, "int") ? v.value : void 0,
      bool: (v) => isType(v, "bool") ? v.value : void 0,
      array: (v) => isType(v, "array") ? v : void 0,
      dict: (v) => isType(v, "dict") ? v : void 0,
      stream: (v) => isType(v, "stream") ? v : void 0
    });
    function halftoneValue(type, v) {
      if (isType(v, "ref"))
        return v;
      const alts = type.split("|");
      if (alts.length > 1) {
        if (!alts.some((t) => HALFTONE_READ[t](v) !== void 0))
          return null;
        return isType(v, "name") ? v.value : v;
      }
      const r = HALFTONE_READ[type](v);
      return r === void 0 ? null : r;
    }
    function typeHalftone(value) {
      const dict = isType(value, "stream") ? value.dict : value;
      if (!isType(dict, "dict"))
        throw new ParseError("pdf/extra/halftone/not-dict", "a halftone must be a dictionary or a stream", { context: { type: value && value.type } });
      const e = dict.entries, t = isType(e.HalftoneType, "int") ? e.HalftoneType.value : null, types = t !== null && Object.prototype.hasOwnProperty.call(HALFTONE_TYPES, t) ? HALFTONE_TYPES[t] : null;
      if (!types)
        throw new ParseError("pdf/extra/halftone/bad-type", "/HalftoneType must be 1, 5, 6, 10 or 16", { context: { actual: t } });
      const out = { raw: value, _extras: {} };
      if (t === 5)
        out.colorants = {};
      const streamed = isType(value, "stream");
      for (const [k, v] of Object.entries(e))
        if (Object.prototype.hasOwnProperty.call(types, k))
          out[k.toLowerCase()] = halftoneValue(types[k], v);
        else if (t === 5)
          out.colorants[k] = v;
        else if (!(streamed && STREAM_KEYS.has(k)))
          out._extras[k] = v;
      return out;
    }
    return {
      typeExtGState,
      decodeType3CharOp,
      EXT_GSTATE_KEYS,
      typeHalftone,
      HALFTONE_KEYS
    };
  } });
    __register({ name: "pdfFontCidTyped", dependencies: ["pdfErrors","pdfParserObj"], factory: function(errors, parserObj) {
    const { ParseError } = errors, { isType } = parserObj, SUBTYPES = new Set(["CIDFontType0", "CIDFontType2"]), PREDEFINED_CMAPS = Object.freeze({
      "Adobe-GB1": Object.freeze([
        "GB-EUC-H",
        "GB-EUC-V",
        "GBpc-EUC-H",
        "GBpc-EUC-V",
        "GBK-EUC-H",
        "GBK-EUC-V",
        "GBKp-EUC-H",
        "GBKp-EUC-V",
        "GBK2K-H",
        "GBK2K-V",
        "UniGB-UCS2-H",
        "UniGB-UCS2-V",
        "UniGB-UTF16-H",
        "UniGB-UTF16-V"
      ]),
      "Adobe-CNS1": Object.freeze([
        "B5pc-H",
        "B5pc-V",
        "HKscs-B5-H",
        "HKscs-B5-V",
        "ETen-B5-H",
        "ETen-B5-V",
        "ETenms-B5-H",
        "ETenms-B5-V",
        "CNS-EUC-H",
        "CNS-EUC-V",
        "UniCNS-UCS2-H",
        "UniCNS-UCS2-V",
        "UniCNS-UTF16-H",
        "UniCNS-UTF16-V"
      ]),
      "Adobe-Japan1": Object.freeze([
        "83pv-RKSJ-H",
        "90ms-RKSJ-H",
        "90ms-RKSJ-V",
        "90msp-RKSJ-H",
        "90msp-RKSJ-V",
        "90pv-RKSJ-H",
        "Add-RKSJ-H",
        "Add-RKSJ-V",
        "EUC-H",
        "EUC-V",
        "Ext-RKSJ-H",
        "Ext-RKSJ-V",
        "H",
        "V",
        "UniJIS-UCS2-H",
        "UniJIS-UCS2-V",
        "UniJIS-UCS2-HW-H",
        "UniJIS-UCS2-HW-V",
        "UniJIS-UTF16-H",
        "UniJIS-UTF16-V"
      ]),
      "Adobe-Korea1": Object.freeze([
        "KSC-EUC-H",
        "KSC-EUC-V",
        "KSCms-UHC-H",
        "KSCms-UHC-V",
        "KSCms-UHC-HW-H",
        "KSCms-UHC-HW-V",
        "KSCpc-EUC-H",
        "UniKS-UCS2-H",
        "UniKS-UCS2-V",
        "UniKS-UTF16-H",
        "UniKS-UTF16-V"
      ]),
      Identity: Object.freeze(["Identity-H", "Identity-V"])
    }), KNOWN = new Set([
      "Type",
      "Subtype",
      "BaseFont",
      "CIDSystemInfo",
      "FontDescriptor",
      "DW",
      "W",
      "DW2",
      "W2",
      "CIDToGIDMap"
    ]);
    function typeCIDFont(dict) {
      if (!isType(dict, "dict"))
        throw new ParseError("pdf/extra/cid-font/not-dict", "CIDFont must be a dictionary", { context: { type: dict && dict.type } });
      const e = dict.entries;
      if (e.Type && (e.Type.type !== "name" || e.Type.value !== "Font"))
        throw new ParseError("pdf/extra/cid-font/bad-type", "/Type entry must be /Font", { context: { actual: e.Type.value } });
      if (!isType(e.Subtype, "name") || !SUBTYPES.has(e.Subtype.value))
        throw new ParseError("pdf/extra/cid-font/bad-subtype", "/Subtype must be CIDFontType0 or CIDFontType2", { context: { actual: e.Subtype && e.Subtype.value } });
      if (!isType(e.CIDSystemInfo, "dict") && !(e.CIDSystemInfo && e.CIDSystemInfo.type === "ref"))
        throw new ParseError("pdf/extra/cid-font/missing-csi", "/CIDSystemInfo is required (dict or ref)", { context: { type: e.CIDSystemInfo && e.CIDSystemInfo.type } });
      const out = {
        subtype: e.Subtype.value,
        baseFont: isType(e.BaseFont, "name") ? e.BaseFont.value : null,
        cidSystemInfo: isType(e.CIDSystemInfo, "dict") ? typeCIDSystemInfo(e.CIDSystemInfo) : e.CIDSystemInfo,
        fontDescriptor: e.FontDescriptor || null,
        dw: numVal(e.DW, 1000),
        w: isType(e.W, "array") ? decodeWidthsW(e.W) : null,
        dw2: isType(e.DW2, "array") ? toNumArray(e.DW2) : [880, -1000],
        w2: isType(e.W2, "array") ? e.W2.items.map((it) => it) : null,
        cidToGIDMap: e.CIDToGIDMap || null,
        raw: dict,
        _extras: {}
      };
      for (const k of Object.keys(e))
        if (!KNOWN.has(k))
          out._extras[k] = e[k];
      return out;
    }
    function typeCIDSystemInfo(dict) {
      if (!isType(dict, "dict"))
        throw new ParseError("pdf/extra/cid-system-info/not-dict", "CIDSystemInfo must be a dictionary", { context: { type: dict && dict.type } });
      const e = dict.entries;
      if (!isType(e.Registry, "string") || !isType(e.Ordering, "string"))
        throw new ParseError("pdf/extra/cid-system-info/incomplete", "/Registry and /Ordering are required strings");
      return {
        registry: e.Registry.value,
        ordering: e.Ordering.value,
        supplement: numVal(e.Supplement, 0)
      };
    }
    function typeStyleDict(dict) {
      if (!isType(dict, "dict"))
        throw new ParseError("pdf/extra/cid-font/style-not-dict", "/Style must be a dictionary", { context: { type: dict && dict.type } });
      const out = { raw: dict, _extras: {} };
      for (const [k, v] of Object.entries(dict.entries))
        if (k === "Panose")
          out.panose = isType(v, "string") ? v.value : null;
        else
          out._extras[k] = v;
      return out;
    }
    function decodeWidthsW(arr) {
      if (!isType(arr, "array"))
        throw new ParseError("pdf/extra/cid-font/bad-w", "/W must be an array", { context: { type: arr && arr.type } });
      const items = arr.items, out = [];
      let i = 0;
      while (i < items.length) {
        const c = items[i];
        if (!c || c.type !== "int" && c.type !== "real")
          throw new ParseError("pdf/extra/cid-font/bad-w-c", "/W expects numeric CID");
        const first = c.value | 0, nxt = items[i + 1];
        if (nxt && nxt.type === "array") {
          const widths = [];
          for (const it of nxt.items) {
            if (!it || it.type !== "int" && it.type !== "real")
              throw new ParseError("pdf/extra/cid-font/bad-w-item", "/W array sub-items must be numeric");
            widths.push(it.value);
          }
          out.push({ first, last: first + widths.length - 1, widths });
          i += 2;
        } else {
          const last = nxt, w = items[i + 2];
          if (!last || last.type !== "int" && last.type !== "real" || !w || w.type !== "int" && w.type !== "real")
            throw new ParseError("pdf/extra/cid-font/bad-w-range", "/W range form requires c_first c_last w");
          out.push({ first, last: last.value | 0, width: w.value });
          i += 3;
        }
      }
      return out;
    }
    function numVal(v, dflt) {
      if (!v)
        return dflt;
      if (v.type !== "int" && v.type !== "real")
        return dflt;
      return v.value;
    }
    function toNumArray(v) {
      if (!isType(v, "array"))
        return null;
      const out = [];
      for (const it of v.items) {
        if (!it || it.type !== "int" && it.type !== "real")
          return null;
        out.push(it.value);
      }
      return out;
    }
    return { typeCIDFont, typeCIDSystemInfo, typeStyleDict, decodeWidthsW, PREDEFINED_CMAPS };
  } });
    __register({ name: "pdfFontColorTagging", dependencies: ["pdfErrors","pdfParserObj"], factory: function(errors, parserObj) {
    const { ParseError } = errors, { isType } = parserObj, FONT_DESCRIPTOR_FLAGS = Object.freeze({
      FixedPitch: 1,
      Serif: 2,
      Symbolic: 4,
      Script: 8,
      Nonsymbolic: 32,
      Italic: 64,
      AllCap: 65536,
      SmallCap: 131072,
      ForceBold: 262144
    }), COLOR_OT_TABLES = Object.freeze(["COLR", "CPAL", "sbix", "SVG ", "CBDT", "CBLC"]);
    function decodeFontDescriptorFlags(flags) {
      if (typeof flags !== "number" || !Number.isFinite(flags))
        throw new ParseError("pdf/extra/font-flags/bad-input", "flags must be a finite number", { context: { flags } });
      const f = flags | 0, out = { raw: f };
      for (const [k, mask] of Object.entries(FONT_DESCRIPTOR_FLAGS))
        out[k.charAt(0).toLowerCase() + k.slice(1)] = (f & mask) !== 0;
      return out;
    }
    function detectColorFontTables(bytes) {
      if (!(bytes instanceof Uint8Array))
        throw new ParseError("pdf/extra/color-font/bad-input", "expected Uint8Array", { context: { kind: typeof bytes } });
      if (bytes.length < 12)
        throw new ParseError("pdf/extra/color-font/truncated", "sfnt header too short", { context: { length: bytes.length } });
      const numTables = bytes[4] << 8 | bytes[5], need = 12 + numTables * 16;
      if (bytes.length < need)
        throw new ParseError("pdf/extra/color-font/truncated", "sfnt table directory truncated", { context: { numTables, length: bytes.length } });
      const tables = [];
      for (let i = 0;i < numTables; i++) {
        const off = 12 + i * 16, tag = String.fromCharCode(bytes[off], bytes[off + 1], bytes[off + 2], bytes[off + 3]);
        tables.push(tag);
      }
      return {
        hasCOLR: tables.includes("COLR"),
        hasSbix: tables.includes("sbix"),
        hasSVG: tables.includes("SVG "),
        hasCBDT: tables.includes("CBDT"),
        tables
      };
    }
    function typeFontFile3OpenType(stream) {
      if (!isType(stream, "stream"))
        throw new ParseError("pdf/extra/fontfile3/not-stream", "/FontFile3 must be a stream", { context: { type: stream && stream.type } });
      const dict = stream.dict;
      if (!isType(dict, "dict"))
        throw new ParseError("pdf/extra/fontfile3/no-dict", "/FontFile3 stream missing dict");
      const e = dict.entries;
      if (!isType(e.Subtype, "name") || e.Subtype.value !== "OpenType")
        throw new ParseError("pdf/extra/fontfile3/bad-subtype", "/FontFile3 /Subtype must be /OpenType", { context: { actual: e.Subtype && e.Subtype.value } });
      let color = null;
      if (stream.raw instanceof Uint8Array && stream.raw.length >= 12)
        try {
          color = detectColorFontTables(stream.raw);
        } catch (_e) {
          color = null;
        }
      const out = {
        subtype: "OpenType",
        length: stream.raw instanceof Uint8Array ? stream.raw.length : null,
        metadata: e.Metadata || null,
        color,
        raw: stream,
        _extras: collectExtras(e, new Set([
          "Subtype",
          "Length",
          "Filter",
          "DecodeParms",
          "Metadata",
          "Length1",
          "Length2",
          "Length3"
        ]))
      };
      for (const [k, f] of LENGTH_KEYS)
        if (e[k] !== void 0)
          out[f] = isType(e[k], "int") ? e[k].value : null;
      if (isType(e.Filter, "name"))
        out.filter = e.Filter.value;
      else if (isType(e.Filter, "array"))
        out.filter = e.Filter;
      if (isType(e.DecodeParms, "dict") || isType(e.DecodeParms, "array"))
        out.decodeParms = e.DecodeParms;
      return out;
    }
    const LENGTH_KEYS = Object.freeze([["Length1", "length1"], ["Length2", "length2"], ["Length3", "length3"]]);
    function typeFontFileEntries(stream) {
      if (!isType(stream, "stream") || !isType(stream.dict, "dict"))
        throw new ParseError("pdf/extra/fontfile/not-stream", "a font file must be a stream", { context: { type: stream && stream.type } });
      const e = stream.dict.entries, out = { raw: stream };
      for (const [k, f] of LENGTH_KEYS)
        if (e[k] !== void 0)
          out[f] = isType(e[k], "int") ? e[k].value : null;
      if (e.Subtype !== void 0)
        out.subtype = isType(e.Subtype, "name") ? e.Subtype.value : null;
      if (e.Metadata !== void 0)
        out.metadata = isType(e.Metadata, "stream") || isType(e.Metadata, "ref") ? e.Metadata : null;
      return out;
    }
    const DESCRIPTOR_KEYS = new Set([
      "Type",
      "FontName",
      "FontFamily",
      "FontStretch",
      "FontWeight",
      "Flags",
      "FontBBox",
      "ItalicAngle",
      "Ascent",
      "Descent",
      "Leading",
      "CapHeight",
      "XHeight",
      "StemV",
      "StemH",
      "AvgWidth",
      "MaxWidth",
      "MissingWidth",
      "FontFile",
      "FontFile2",
      "FontFile3",
      "CharSet",
      "Style",
      "Lang",
      "FD",
      "CIDSet"
    ]);
    function typeFontDescriptor(dict) {
      if (!isType(dict, "dict"))
        throw new ParseError("pdf/extra/font-descriptor/not-dict", "font descriptor must be a dictionary", { context: { type: dict && dict.type } });
      const e = dict.entries, nameOf = (v) => isType(v, "name") ? v.value : null, strOf = (v) => isType(v, "string") ? v.value : null, intOf = (v) => isType(v, "int") ? v.value : null, numOf = (v, dflt) => isNum(v) ? v.value : dflt, refOf = (v) => isType(v, "ref") ? { num: v.num, gen: v.gen } : null, streamOf = (v) => refOf(v) || (isType(v, "stream") ? v : null), dictOf = (v) => refOf(v) || (isType(v, "dict") ? v : null), box = isType(e.FontBBox, "array") && e.FontBBox.items.length === 4 && e.FontBBox.items.every(isNum) ? e.FontBBox.items.map((it) => it.value) : null;
      return {
        type: nameOf(e.Type),
        fontName: nameOf(e.FontName),
        fontFamily: strOf(e.FontFamily),
        fontStretch: nameOf(e.FontStretch),
        fontWeight: intOf(e.FontWeight),
        flags: intOf(e.Flags),
        fontBBox: box,
        italicAngle: numOf(e.ItalicAngle, null),
        ascent: numOf(e.Ascent, null),
        descent: numOf(e.Descent, null),
        leading: numOf(e.Leading, 0),
        capHeight: numOf(e.CapHeight, null),
        xHeight: numOf(e.XHeight, 0),
        stemV: numOf(e.StemV, null),
        stemH: numOf(e.StemH, 0),
        avgWidth: numOf(e.AvgWidth, 0),
        maxWidth: numOf(e.MaxWidth, 0),
        missingWidth: numOf(e.MissingWidth, 0),
        fontFile: streamOf(e.FontFile),
        fontFile2: streamOf(e.FontFile2),
        fontFile3: streamOf(e.FontFile3),
        charSet: strOf(e.CharSet),
        style: dictOf(e.Style),
        lang: nameOf(e.Lang),
        fd: dictOf(e.FD),
        cidSet: streamOf(e.CIDSet),
        _extras: collectExtras(e, DESCRIPTOR_KEYS)
      };
    }
    function isNum(v) {
      return !!v && (v.type === "int" || v.type === "real");
    }
    function collectExtras(entries, known) {
      const out = {};
      for (const k of Object.keys(entries))
        if (!known.has(k))
          out[k] = entries[k];
      return out;
    }
    return {
      decodeFontDescriptorFlags,
      detectColorFontTables,
      typeFontFile3OpenType,
      typeFontFileEntries,
      typeFontDescriptor,
      FONT_DESCRIPTOR_FLAGS,
      COLOR_OT_TABLES
    };
  } });
    __register({ name: "pdfTaggedPdfTyped", dependencies: ["pdfErrors","pdfParserObj"], factory: function(errors, parserObj) {
    const { ParseError } = errors, { isType } = parserObj, OWNERS = new Set([
      "Layout",
      "List",
      "Table",
      "PrintField",
      "Artifact",
      "UserProperties",
      "NSO"
    ]), KNOWN_BY_OWNER = {
      Layout: new Set([
        "O",
        "Placement",
        "WritingMode",
        "BackgroundColor",
        "BorderColor",
        "BorderStyle",
        "BorderThickness",
        "Color",
        "Padding",
        "SpaceBefore",
        "SpaceAfter",
        "StartIndent",
        "EndIndent",
        "TextIndent",
        "TextAlign",
        "BBox",
        "Width",
        "Height",
        "BlockAlign",
        "InlineAlign",
        "TBorderStyle",
        "TPadding",
        "LineHeight",
        "BaselineShift",
        "TextPosition",
        "TextDecorationType",
        "TextDecorationColor",
        "TextDecorationThickness",
        "RubyAlign",
        "RubyPosition",
        "GlyphOrientationVertical",
        "ColumnCount",
        "ColumnGap",
        "ColumnWidths"
      ]),
      List: new Set(["O", "ListNumbering", "ContinuedList", "ContinuedFrom"]),
      Table: new Set(["O", "RowSpan", "ColSpan", "Headers", "Scope", "Summary", "Short"]),
      PrintField: new Set(["O", "Role", "checked", "Checked", "Desc"]),
      Artifact: new Set(["O", "Type", "BBox", "Attached", "Subtype"]),
      UserProperties: new Set(["O", "P"])
    };
    KNOWN_BY_OWNER.NSO = new Set(["NS", ...Object.values(KNOWN_BY_OWNER).flatMap((set) => [...set])]);
    function knownFor(owner) {
      return KNOWN_BY_OWNER[owner] || new Set(["O"]);
    }
    function typeStructAttribute(dict) {
      if (!isType(dict, "dict"))
        throw new ParseError("pdf/extra/tagged/not-dict", "attribute class must be a dictionary", { context: { type: dict && dict.type } });
      const e = dict.entries;
      if (!isType(e.O, "name"))
        throw new ParseError("pdf/extra/tagged/missing-owner", "attribute class missing /O owner name", { context: { type: e.O && e.O.type } });
      const owner = e.O.value;
      let typed;
      switch (owner) {
        case "Layout":
          typed = readLayout(e);
          break;
        case "List":
          typed = readList(e);
          break;
        case "Table":
          typed = readTable(e);
          break;
        case "PrintField":
          typed = readPrintField(e);
          break;
        case "Artifact":
          typed = readArtifact(e);
          break;
        case "UserProperties":
          typed = readUserProperties(e);
          break;
        case "NSO":
          typed = readNso(e);
          break;
        default:
          typed = { owner, vendor: !0 };
      }
      typed.owner = owner;
      typed.raw = dict;
      typed._extras = collectExtras(e, knownFor(owner));
      return typed;
    }
    function readLayout(e) {
      return {
        placement: nameVal(e.Placement),
        writingMode: nameVal(e.WritingMode),
        backgroundColor: numArr(e.BackgroundColor),
        borderColor: e.BorderColor || null,
        borderStyle: e.BorderStyle || null,
        borderThickness: e.BorderThickness || null,
        color: numArr(e.Color),
        padding: e.Padding || null,
        spaceBefore: numVal(e.SpaceBefore, null),
        spaceAfter: numVal(e.SpaceAfter, null),
        startIndent: numVal(e.StartIndent, null),
        endIndent: numVal(e.EndIndent, null),
        textIndent: numVal(e.TextIndent, null),
        textAlign: nameVal(e.TextAlign),
        bbox: numArr(e.BBox),
        width: numOrName(e.Width),
        height: numOrName(e.Height),
        blockAlign: nameVal(e.BlockAlign),
        inlineAlign: nameVal(e.InlineAlign),
        lineHeight: numOrName(e.LineHeight),
        baselineShift: numVal(e.BaselineShift, null),
        textPosition: nameVal(e.TextPosition),
        textDecorationType: nameVal(e.TextDecorationType),
        textDecorationColor: numArr(e.TextDecorationColor),
        textDecorationThickness: numVal(e.TextDecorationThickness, null),
        columnCount: numVal(e.ColumnCount, null),
        columnGap: e.ColumnGap || null,
        columnWidths: e.ColumnWidths || null,
        tBorderStyle: nameOrAsRead(e.TBorderStyle),
        tPadding: numVal(e.TPadding, null) ?? (isType(e.TPadding, "array") ? e.TPadding : null),
        rubyAlign: nameVal(e.RubyAlign),
        rubyPosition: nameVal(e.RubyPosition),
        glyphOrientationVertical: isType(e.GlyphOrientationVertical, "int") ? e.GlyphOrientationVertical.value : nameVal(e.GlyphOrientationVertical)
      };
    }
    function readNso(e) {
      return {
        ns: isType(e.NS, "dict") || isType(e.NS, "ref") ? e.NS : null,
        ...readLayout(e),
        ...readList(e),
        ...readTable(e),
        ...readPrintField(e),
        ...readArtifact(e),
        p: isType(e.P, "array") || isType(e.P, "ref") ? e.P : null
      };
    }
    function readList(e) {
      return {
        listNumbering: nameVal(e.ListNumbering),
        continuedList: isType(e.ContinuedList, "bool") ? e.ContinuedList.value : null,
        continuedFrom: e.ContinuedFrom || null
      };
    }
    function readTable(e) {
      return {
        rowSpan: numVal(e.RowSpan, null),
        colSpan: numVal(e.ColSpan, null),
        headers: e.Headers || null,
        scope: nameVal(e.Scope),
        summary: isType(e.Summary, "string") ? e.Summary.value : null,
        short: isType(e.Short, "string") ? e.Short.value : null
      };
    }
    function readPrintField(e) {
      return {
        role: nameVal(e.Role),
        checked: nameVal(e.checked) || nameVal(e.Checked),
        desc: isType(e.Desc, "string") ? e.Desc.value : null
      };
    }
    function readArtifact(e) {
      return {
        artifactType: nameVal(e.Type),
        bbox: numArr(e.BBox),
        attached: e.Attached || null,
        artifactSubtype: nameVal(e.Subtype)
      };
    }
    function readUserProperties(e) {
      const out = { properties: [] };
      if (isType(e.P, "array"))
        for (const it of e.P.items) {
          if (!isType(it, "dict"))
            throw new ParseError("pdf/extra/tagged/bad-user-property", "/P items must be dicts");
          const pe = it.entries;
          out.properties.push({
            name: isType(pe.N, "string") ? pe.N.value : null,
            value: pe.V || null,
            formatted: isType(pe.F, "string") ? pe.F.value : null,
            hidden: isType(pe.H, "bool") ? pe.H.value : !1
          });
        }
      return out;
    }
    function nameVal(v) {
      return isType(v, "name") ? v.value : null;
    }
    function numOrName(v) {
      return numVal(v, null) ?? nameVal(v);
    }
    function nameOrAsRead(v) {
      return v ? isType(v, "name") ? v.value : v : null;
    }
    function numVal(v, dflt) {
      if (!v)
        return dflt;
      return v.type === "int" || v.type === "real" ? v.value : dflt;
    }
    function numArr(v) {
      if (!isType(v, "array"))
        return null;
      const out = [];
      for (const it of v.items) {
        if (!it || it.type !== "int" && it.type !== "real")
          return null;
        out.push(it.value);
      }
      return out;
    }
    function collectExtras(entries, known) {
      const out = {};
      for (const k of Object.keys(entries))
        if (!known.has(k))
          out[k] = entries[k];
      return out;
    }
    return { typeStructAttribute, ATTRIBUTE_OWNERS: OWNERS };
  } });
    __register({ name: "pdfAnnot", dependencies: ["pdfErrors","pdfParser"], factory: function(errors, parser) {
    const { ParseError } = errors, { isType } = parser, BASE_KEYS = new Set([
      "Type",
      "Subtype",
      "Rect",
      "Contents",
      "P",
      "NM",
      "M",
      "F",
      "AP",
      "AS",
      "Border",
      "C",
      "StructParent",
      "OC",
      "AF",
      "CA",
      "BS",
      "BE"
    ]);
    function typeBaseAnnot(dict) {
      if (!isType(dict, "dict"))
        throw new ParseError("pdf/annot/not-dict", "annotation must be a dictionary", { context: { type: dict && dict.type } });
      const e = dict.entries;
      if (e.Type && (e.Type.type !== "name" || e.Type.value !== "Annot"))
        throw new ParseError("pdf/annot/bad-type", "/Type must be /Annot when present", { context: { actual: e.Type.value } });
      return {
        subtype: isType(e.Subtype, "name") ? e.Subtype.value : null,
        rect: toRect(e.Rect),
        contents: isType(e.Contents, "string") ? e.Contents.value : null,
        p: e.P && e.P.type === "ref" ? { num: e.P.num, gen: e.P.gen } : null,
        nm: isType(e.NM, "string") ? e.NM.value : null,
        m: isType(e.M, "string") ? e.M.value : null,
        f: toInt(e.F, 0),
        ap: isType(e.AP, "dict") ? e.AP : null,
        as: isType(e.AS, "name") ? e.AS.value : null,
        border: toBorder(e.Border),
        c: toNumArray(e.C),
        structParent: toInt(e.StructParent, null),
        oc: e.OC || null,
        af: e.AF || null,
        ca: toNum(e.CA, null),
        bs: isType(e.BS, "dict") ? e.BS : null,
        be: isType(e.BE, "dict") ? e.BE : null,
        raw: dict,
        _extras: {}
      };
    }
    function captureExtras(target, dict, known) {
      const e = dict.entries;
      for (const k of Object.keys(e)) {
        if (BASE_KEYS.has(k))
          continue;
        if (known && known.has(k))
          continue;
        target._extras[k] = e[k];
      }
    }
    function typeAnnot(dict, typers) {
      if (!isType(dict, "dict"))
        throw new ParseError("pdf/annot/not-dict", "annotation must be a dictionary", { context: { type: dict && dict.type } });
      const sub = dict.entries.Subtype;
      if (!isType(sub, "name"))
        throw new ParseError("pdf/annot/missing-subtype", "/Subtype is required and must be a name", { context: { kind: sub && sub.type } });
      const name = sub.value, t = typers || {};
      switch (name) {
        case "Text":
          return tag("Text", call(t.Text, dict));
        case "Link":
          return tag("Link", call(t.Link, dict));
        case "FreeText":
          return tag("FreeText", call(t.FreeText, dict));
        case "Line":
          return tag("Line", call(t.Shape, dict, "Line"));
        case "Square":
          return tag("Square", call(t.Shape, dict, "Square"));
        case "Circle":
          return tag("Circle", call(t.Shape, dict, "Circle"));
        case "Polygon":
          return tag("Polygon", call(t.Shape, dict, "Polygon"));
        case "PolyLine":
          return tag("PolyLine", call(t.Shape, dict, "PolyLine"));
        case "Highlight":
          return tag("Highlight", call(t.Markup, dict, "Highlight"));
        case "Underline":
          return tag("Underline", call(t.Markup, dict, "Underline"));
        case "Squiggly":
          return tag("Squiggly", call(t.Markup, dict, "Squiggly"));
        case "StrikeOut":
          return tag("StrikeOut", call(t.Markup, dict, "StrikeOut"));
        case "Caret":
          return tag("Caret", call(t.Markup, dict, "Caret"));
        case "Stamp":
          return tag("Stamp", call(t.Stamp, dict));
        case "Ink":
          return tag("Ink", call(t.Ink, dict));
        case "Popup":
          return tag("Popup", call(t.Popup, dict));
        case "FileAttachment":
          return tag("FileAttachment", call(t.FileAttachment, dict));
        case "Widget":
          return tag("Widget", call(t.Widget, dict));
        case "Redact":
          return tag("Redact", call(t.Redact, dict));
        case "Projection":
          return tag("Projection", call(t.Projection, dict));
        case "Sound":
        case "Movie":
        case "Screen":
        case "PrinterMark":
        case "TrapNet":
        case "Watermark":
        case "3D":
        case "RichMedia":
          return tag(name, fallback(dict));
        default:
          return { kind: name, raw: dict, _extras: collectAll(dict) };
      }
    }
    function call(fn, dict, arg) {
      if (typeof fn !== "function")
        return fallback(dict);
      return arg !== void 0 ? fn(dict, arg) : fn(dict);
    }
    function tag(kind, rec) {
      rec.kind = kind;
      return rec;
    }
    function fallback(dict) {
      const base = typeBaseAnnot(dict);
      captureExtras(base, dict, null);
      return base;
    }
    function collectAll(dict) {
      const out = {}, e = dict.entries;
      for (const k of Object.keys(e))
        out[k] = e[k];
      return out;
    }
    function toRect(v) {
      if (!v || v.type !== "array" || v.items.length !== 4)
        return null;
      const r = Array(4);
      for (let i = 0;i < 4; i++) {
        const it = v.items[i];
        if (!it || it.type !== "int" && it.type !== "real")
          return null;
        r[i] = it.value;
      }
      return r;
    }
    function toBorder(v) {
      if (!v || v.type !== "array")
        return null;
      const out = [];
      for (const it of v.items) {
        if (!it)
          return null;
        if (it.type === "int" || it.type === "real")
          out.push(it.value);
        else if (it.type === "array")
          out.push(toNumArray(it));
        else
          return null;
      }
      return out;
    }
    function toNumArray(v) {
      if (!v || v.type !== "array")
        return null;
      const out = [];
      for (const it of v.items) {
        if (!it)
          return null;
        if (it.type !== "int" && it.type !== "real")
          return null;
        out.push(it.value);
      }
      return out;
    }
    function toInt(v, dflt) {
      if (!v)
        return dflt;
      if (v.type !== "int" && v.type !== "real")
        return dflt;
      return v.value | 0;
    }
    function toNum(v, dflt) {
      if (!v)
        return dflt;
      if (v.type !== "int" && v.type !== "real")
        return dflt;
      return v.value;
    }
    return {
      BASE_KEYS,
      typeBaseAnnot,
      captureExtras,
      typeAnnot
    };
  } });
    __register({ name: "pdfAnnotExtended", dependencies: ["pdfErrors","pdfParserObj","pdfAnnot"], factory: function(errors, parserObj, annot) {
    const { ParseError, ContractError } = errors, { isType } = parserObj, { typeBaseAnnot, captureExtras } = annot, SUBTYPES = new Set([
      "Watermark",
      "3D",
      "RichMedia",
      "Sound",
      "Movie",
      "Screen",
      "PrinterMark",
      "TrapNet",
      "FreeText"
    ]), FREETEXT_LINE_ENDINGS = Object.freeze([
      "Square",
      "Circle",
      "Diamond",
      "OpenArrow",
      "ClosedArrow",
      "None",
      "Butt",
      "ROpenArrow",
      "RClosedArrow",
      "Slash"
    ]), MARKUP_SUBTYPES = Object.freeze([
      "Text",
      "FreeText",
      "Line",
      "Square",
      "Circle",
      "Polygon",
      "PolyLine",
      "Highlight",
      "Underline",
      "Squiggly",
      "StrikeOut",
      "Caret",
      "Stamp",
      "Ink",
      "FileAttachment",
      "Sound",
      "Redact",
      "Projection"
    ]), MARKUP = new Set(MARKUP_SUBTYPES);
    function typeAnnotExtended(dict) {
      if (!isType(dict, "dict"))
        throw new ParseError("pdf/extra/annot-ext/not-dict", "annotation must be a dictionary", { context: { type: dict && dict.type } });
      const sub = dict.entries.Subtype;
      if (!isType(sub, "name") || !SUBTYPES.has(sub.value))
        throw new ParseError("pdf/extra/annot-ext/unsupported", "unsupported extended annotation subtype", { context: { subtype: sub && sub.value } });
      switch (sub.value) {
        case "Watermark":
          return typeWatermarkAnnot(dict);
        case "3D":
          return type3DAnnot(dict);
        case "RichMedia":
          return typeRichMediaAnnot(dict);
        case "Sound":
          return typeSoundAnnot(dict);
        case "Movie":
          return typeMovieAnnot(dict);
        case "Screen":
          return typeScreenAnnot(dict);
        case "PrinterMark":
          return typePrinterMarkAnnot(dict);
        case "TrapNet":
          return typeTrapNetAnnot(dict);
        case "FreeText":
          return typeFreeTextExtended(dict);
      }
      throw new ParseError("pdf/extra/annot-ext/unreachable", "unreachable");
    }
    function typeWatermarkAnnot(dict) {
      const base = typeBaseAnnot(dict);
      base.kind = "Watermark";
      const e = dict.entries;
      base.fixedPrint = isType(e.FixedPrint, "dict") ? e.FixedPrint : null;
      captureExtras(base, dict, new Set(["FixedPrint"]));
      return base;
    }
    function type3DAnnot(dict) {
      const base = typeBaseAnnot(dict);
      base.kind = "3D";
      const e = dict.entries;
      base["3DD"] = e["3DD"] || null;
      base["3DV"] = e["3DV"] || null;
      base["3DA"] = e["3DA"] || null;
      base["3DI"] = isType(e["3DI"], "bool") ? e["3DI"].value : null;
      base["3DB"] = e["3DB"] || null;
      if (e["3DU"] !== void 0)
        base["3DU"] = e["3DU"];
      if (e.GEO !== void 0)
        base.GEO = e.GEO;
      captureExtras(base, dict, new Set(["3DD", "3DV", "3DA", "3DI", "3DB", "3DU", "GEO"]));
      return base;
    }
    function typeRichMediaAnnot(dict) {
      const base = typeBaseAnnot(dict);
      base.kind = "RichMedia";
      const e = dict.entries;
      base.richMediaContent = e.RichMediaContent || null;
      base.richMediaSettings = e.RichMediaSettings || null;
      captureExtras(base, dict, new Set(["RichMediaContent", "RichMediaSettings"]));
      return base;
    }
    function typeSoundAnnot(dict) {
      const base = typeBaseAnnot(dict);
      base.kind = "Sound";
      const e = dict.entries;
      base.sound = e.Sound || null;
      base.name = isType(e.Name, "name") ? e.Name.value : null;
      captureExtras(base, dict, new Set(["Sound", "Name"]));
      return base;
    }
    function typeMovieAnnot(dict) {
      const base = typeBaseAnnot(dict);
      base.kind = "Movie";
      const e = dict.entries;
      base.t = isType(e.T, "string") ? e.T.value : null;
      base.movie = e.Movie || null;
      base.activation = e.A || null;
      captureExtras(base, dict, new Set(["T", "Movie", "A"]));
      return base;
    }
    function typeScreenAnnot(dict) {
      const base = typeBaseAnnot(dict);
      base.kind = "Screen";
      const e = dict.entries;
      base.t = isType(e.T, "string") ? e.T.value : null;
      base.mk = e.MK || null;
      base.a = e.A || null;
      base.aa = e.AA || null;
      captureExtras(base, dict, new Set(["T", "MK", "A", "AA"]));
      return base;
    }
    function typePrinterMarkAnnot(dict) {
      const base = typeBaseAnnot(dict);
      base.kind = "PrinterMark";
      const e = dict.entries;
      base.mn = isType(e.MN, "name") ? e.MN.value : null;
      captureExtras(base, dict, new Set(["MN"]));
      return base;
    }
    function typeTrapNetAnnot(dict) {
      const base = typeBaseAnnot(dict);
      base.kind = "TrapNet";
      const e = dict.entries;
      base.lastModified = isType(e.LastModified, "string") ? e.LastModified.value : null;
      base.version = e.Version || null;
      base.annotStates = e.AnnotStates || null;
      base.fontFauxing = e.FontFauxing || null;
      captureExtras(base, dict, new Set(["LastModified", "Version", "AnnotStates", "FontFauxing"]));
      return base;
    }
    function typeFreeTextExtended(dict) {
      const base = typeBaseAnnot(dict);
      base.kind = "FreeText";
      const e = dict.entries;
      base.da = isType(e.DA, "string") ? e.DA.value : null;
      base.q = e.Q && (e.Q.type === "int" || e.Q.type === "real") ? e.Q.value | 0 : null;
      base.rc = isType(e.RC, "string") ? e.RC.value : isType(e.RC, "stream") ? e.RC : null;
      base.ds = isType(e.DS, "string") ? e.DS.value : null;
      base.cl = isType(e.CL, "array") ? toNumArray(e.CL) : null;
      base.it = isType(e.IT, "name") ? e.IT.value : null;
      base.be = e.BE || null;
      base.rd = isType(e.RD, "array") ? toNumArray(e.RD) : null;
      let le = null;
      if (isType(e.LE, "name"))
        le = e.LE.value;
      else if (isType(e.LE, "array"))
        le = e.LE.items.filter((it) => isType(it, "name")).map((it) => it.value);
      base.le = le;
      captureExtras(base, dict, new Set(["DA", "Q", "RC", "DS", "CL", "IT", "BE", "RD", "LE"]));
      return base;
    }
    function typeMarkupEntries(dict) {
      if (!isType(dict, "dict"))
        throw new ParseError("pdf/extra/annot-ext/not-dict", "annotation must be a dictionary", { context: { type: dict && dict.type } });
      const e = dict.entries, subtype = isType(e.Subtype, "name") ? e.Subtype.value : null, markup = subtype !== null && MARKUP.has(subtype), out = {
        subtype,
        markup,
        ca: isNum(e.ca) ? e.ca.value : null,
        bm: isType(e.BM, "name") ? e.BM.value : null,
        lang: isType(e.Lang, "string") ? e.Lang.value : null,
        t: null,
        popup: null,
        rc: null,
        creationDate: null,
        irt: null,
        subj: null,
        rt: null,
        it: null,
        exData: null
      };
      if (!markup)
        return out;
      out.t = isType(e.T, "string") ? e.T.value : null;
      out.popup = toRef(e.Popup);
      out.rc = isType(e.RC, "string") ? e.RC.value : isType(e.RC, "stream") ? e.RC : toRef(e.RC);
      out.creationDate = isType(e.CreationDate, "string") ? e.CreationDate.value : null;
      out.irt = toRef(e.IRT) || (isType(e.IRT, "dict") ? e.IRT : null);
      out.subj = isType(e.Subj, "string") ? e.Subj.value : null;
      out.rt = isType(e.RT, "name") ? e.RT.value : null;
      out.it = isType(e.IT, "name") ? e.IT.value : null;
      out.exData = toRef(e.ExData) || (isType(e.ExData, "dict") ? e.ExData : null);
      return out;
    }
    const READ = Object.freeze({
      name: (v) => isType(v, "name") ? v.value : void 0,
      string: (v) => isType(v, "string") ? v.value : void 0,
      num: (v) => isNum(v) ? v.value : void 0,
      int: (v) => isType(v, "int") ? v.value : void 0,
      bool: (v) => isType(v, "bool") ? v.value : void 0,
      array: (v) => isType(v, "array") ? v : void 0,
      dict: (v) => isType(v, "dict") ? v : void 0,
      stream: (v) => isType(v, "stream") ? v : void 0
    }), keyTypes = (text) => Object.freeze(Object.fromEntries(text.split(" ").map((p) => p.split(":")))), APPEARANCE_TYPES = Object.freeze({
      characteristics: keyTypes("R:int BC:array BG:array CA:string RC:string AC:string I:stream RI:stream IX:stream IF:dict TP:int"),
      borderStyle: keyTypes("Type:name W:num S:name D:array"),
      borderEffect: keyTypes("S:name I:num"),
      iconFit: keyTypes("SW:name S:name A:array FB:bool")
    }), APPEARANCE_KEYS = Object.freeze(Object.fromEntries(Object.entries(APPEARANCE_TYPES).map(([kind, types]) => [kind, Object.freeze(Object.keys(types))])));
    function typeAppearanceDict(dict, kind) {
      if (typeof kind !== "string" || !Object.prototype.hasOwnProperty.call(APPEARANCE_TYPES, kind))
        throw new ContractError("pdf/extra/annot-ext/appearance/kind", "kind must be characteristics, borderStyle, borderEffect or iconFit", { context: { kind } });
      if (!isType(dict, "dict"))
        throw new ParseError("pdf/extra/annot-ext/appearance/not-dict", "an appearance dictionary must be a dictionary", { context: { type: dict && dict.type } });
      const types = APPEARANCE_TYPES[kind], out = { raw: dict, _extras: {} };
      for (const [k, v] of Object.entries(dict.entries)) {
        if (!Object.prototype.hasOwnProperty.call(types, k)) {
          out._extras[k] = v;
          continue;
        }
        const r = isType(v, "ref") ? v : READ[types[k]](v);
        out[k.toLowerCase()] = r === void 0 ? null : r;
      }
      return out;
    }
    function isNum(v) {
      return !!v && (v.type === "int" || v.type === "real");
    }
    function toRef(v) {
      return isType(v, "ref") ? { num: v.num, gen: v.gen } : null;
    }
    function toNumArray(v) {
      const out = [];
      for (const it of v.items) {
        if (!it || it.type !== "int" && it.type !== "real")
          return null;
        out.push(it.value);
      }
      return out;
    }
    return {
      typeAnnotExtended,
      typeWatermarkAnnot,
      type3DAnnot,
      typeRichMediaAnnot,
      typeSoundAnnot,
      typeMovieAnnot,
      typeScreenAnnot,
      typePrinterMarkAnnot,
      typeTrapNetAnnot,
      typeFreeTextExtended,
      typeMarkupEntries,
      MARKUP_SUBTYPES,
      typeAppearanceDict,
      APPEARANCE_KEYS,
      FREETEXT_LINE_ENDINGS
    };
  } });
    __register({ name: "pdfAOutputIntent", dependencies: ["pdfErrors","pdfParser"], factory: function(errors, parser) {
    const { ParseError, ContractError } = errors, { isType } = parser, PDFA_PROFILES = Object.freeze({
      "1a": { part: 1, level: "a", iso: "ISO 19005-1:2005", notes: "accessible" },
      "1b": { part: 1, level: "b", iso: "ISO 19005-1:2005", notes: "basic" },
      "2a": { part: 2, level: "a", iso: "ISO 19005-2:2011", notes: "accessible" },
      "2b": { part: 2, level: "b", iso: "ISO 19005-2:2011", notes: "basic" },
      "2u": { part: 2, level: "u", iso: "ISO 19005-2:2011", notes: "unicode" },
      "3a": { part: 3, level: "a", iso: "ISO 19005-3:2012", notes: "accessible + embed" },
      "3b": { part: 3, level: "b", iso: "ISO 19005-3:2012", notes: "basic + embed" },
      "3u": { part: 3, level: "u", iso: "ISO 19005-3:2012", notes: "unicode + embed" },
      "4": { part: 4, level: null, iso: "ISO 19005-4:2020", notes: "PDF 2.0 base" },
      "4e": { part: 4, level: "e", iso: "ISO 19005-4:2020", notes: "engineering" },
      "4f": { part: 4, level: "f", iso: "ISO 19005-4:2020", notes: "embedded files allowed" }
    }), VALID_LEVELS = new Set([
      "1a",
      "1b",
      "2a",
      "2b",
      "2u",
      "3a",
      "3b",
      "3u",
      "4",
      "4e",
      "4f"
    ]);
    function detectPdfAProfile(dict) {
      if (!isType(dict, "dict"))
        throw new ParseError("pdf/extra/pdfa/not-dict", "OutputIntent must be a dictionary", { context: { type: dict && dict.type } });
      const e = dict.entries, s = isType(e.S, "name") ? e.S.value : null, ident = isType(e.OutputConditionIdentifier, "string") ? new TextDecoder("latin1").decode(e.OutputConditionIdentifier.value) : null, isPdfA = s === "GTS_PDFA1", profile = profileFromIdentifier(ident);
      return {
        isPdfA,
        subtype: s,
        identifier: ident,
        profile,
        part: profile ? PDFA_PROFILES[profile].part : null,
        level: profile ? PDFA_PROFILES[profile].level : null,
        catalog: profile ? PDFA_PROFILES[profile] : null,
        raw: dict
      };
    }
    function profileFromIdentifier(s) {
      if (!s)
        return null;
      const m = s.match(/PDF\/A[-\s]?(1[ab]|2[abu]|3[abu]|4[ef]?)/i);
      if (!m)
        return null;
      const tag = m[1].toLowerCase();
      return VALID_LEVELS.has(tag) ? tag : null;
    }
    const METADATA_RULE = Object.freeze({ 1: "6.7.2-t1", 2: "6.6.2.1-t1", 3: "6.6.2.1-t1", 4: "6.7.2.1-t1" }), ENCRYPT_RULE = "6.1.3-t2";
    function validatePdfABasics(typedDoc, opts) {
      if (!typedDoc || typeof typedDoc !== "object")
        throw new ParseError("pdf/extra/pdfa/lint/bad-doc", "validatePdfABasics requires a typed document object", { context: { type: typeof typedDoc } });
      const profile = opts && opts.profile !== void 0 ? opts.profile : null;
      if (profile !== null && !VALID_LEVELS.has(profile))
        throw new ContractError("pdf/extra/pdfa/bad-profile", "validatePdfABasics: opts.profile must be a PDFA_PROFILES key", { context: { received: typeof profile === "string" ? profile : typeof profile } });
      const part = profile ? PDFA_PROFILES[profile].part : null, errors = [], warnings = [], findings = [], error = (rule, message) => {
        errors.push(message);
        findings.push({ rule, severity: "error", message });
      }, warning = (rule, message) => {
        warnings.push(message);
        findings.push({ rule, severity: "warning", message });
      }, resolver = typedDoc._raw && typeof typedDoc._raw.resolve === "function" ? typedDoc._raw.resolve : null, deref = (v) => resolver && v && v.type === "ref" ? resolver(v) : v, cat = typedDoc.catalog && (typedDoc.catalog.entries || typedDoc.catalog.raw && typedDoc.catalog.raw.entries);
      if (typedDoc.encrypted || typedDoc.trailer && typedDoc.trailer.encrypt)
        error(part ? ENCRYPT_RULE : null, "PDF/A forbids encryption");
      if (!cat) {
        error(null, "catalog missing");
        return { pass: !1, errors, warnings, findings };
      }
      if (!cat.Metadata)
        error(part ? METADATA_RULE[part] : null, "catalog requires /Metadata XMP stream");
      if (cat.MarkInfo && !isType(deref(cat.MarkInfo), "dict"))
        warning(null, "/MarkInfo must be a dictionary");
      if (!cat.OutputIntents)
        warning(null, "catalog has no /OutputIntents array");
      return { pass: errors.length === 0, errors, warnings, findings };
    }
    return {
      detectPdfAProfile,
      validatePdfABasics,
      PDFA_PROFILES
    };
  } });
    __register({ name: "pdfUaTagged", dependencies: ["pdfErrors","pdfParser"], factory: function(errors, parser) {
    const { ParseError, ContractError } = errors, { isType } = parser, UA_STRUCTURE = Object.freeze({
      required: Object.freeze([
        "Document",
        "Part",
        "Sect",
        "Art",
        "H",
        "P",
        "L",
        "LI",
        "Lbl",
        "LBody",
        "Table",
        "TR",
        "TH",
        "TD",
        "Figure"
      ]),
      forbidden: Object.freeze(["Span"]),
      figure: Object.freeze(["Alt", "ActualText"]),
      headings: Object.freeze(["H", "H1", "H2", "H3", "H4", "H5", "H6"])
    }), UA_RULES = Object.freeze({
      1: Object.freeze({ structTree: "7.1-t11", marked: "6.2-t1", docTitle: "7.1-t10", lang: null, accessible: "7.16-t1" }),
      2: Object.freeze({ structTree: "8.2.1-t1", marked: "6.2-t1", docTitle: "8.11.2-t1", lang: "8.4.4-t1", accessible: null })
    });
    function lintView(doc) {
      const resolver = doc._raw && typeof doc._raw.resolve === "function" ? doc._raw.resolve : null, deref = (v) => resolver && v && v.type === "ref" ? resolver(v) : v, catalog = doc.catalog && (doc.catalog.entries || doc.catalog.raw && doc.catalog.raw.entries);
      let p = typeof doc.p === "number" ? doc.p : void 0;
      const enc = doc.trailer && doc.trailer.encrypt;
      if (p === void 0 && enc) {
        const e = deref(enc.type ? enc : { type: "ref", num: enc.num, gen: enc.gen }), P = isType(e, "dict") ? deref(e.entries.P) : null;
        if (isType(P, "int"))
          p = P.value;
      }
      return { catalog, deref, p };
    }
    function validatePdfUa(typedDoc, opts) {
      if (!typedDoc || typeof typedDoc !== "object")
        throw new ParseError("pdf/extra/pdfua/bad-doc", "validatePdfUa requires a typed document object", { context: { type: typeof typedDoc } });
      const part = opts && opts.part !== void 0 ? opts.part : 1;
      if (part !== 1 && part !== 2)
        throw new ContractError("pdf/extra/pdfua/bad-part", "validatePdfUa: opts.part must be 1 or 2", { context: { received: typeof part === "number" ? String(part) : typeof part } });
      const rules = UA_RULES[part], errors = [], warnings = [], findings = [], error = (rule, message) => {
        errors.push(message);
        findings.push({ rule, severity: "error", message });
      }, warning = (rule, message) => {
        warnings.push(message);
        findings.push({ rule, severity: "warning", message });
      }, { catalog: cat, deref, p } = lintView(typedDoc);
      if (!cat) {
        error(null, "catalog missing");
        return { pass: !1, errors, warnings, findings };
      }
      if (!cat.StructTreeRoot)
        error(rules.structTree, "catalog requires /StructTreeRoot");
      if (!isType(deref(cat.Lang), "string"))
        if (part === 2)
          error(rules.lang, "catalog requires /Lang string");
        else
          warning(rules.lang, "catalog has no /Lang string");
      const markInfo = deref(cat.MarkInfo);
      if (!markInfo)
        error(rules.marked, "catalog requires /MarkInfo dictionary");
      else if (!isType(markInfo, "dict"))
        error(rules.marked, "/MarkInfo must be a dictionary");
      else {
        const m = deref(markInfo.entries.Marked);
        if (!isType(m, "bool") || m.value !== !0)
          error(rules.marked, "/MarkInfo /Marked must be true");
      }
      const prefs = deref(cat.ViewerPreferences), ddt = isType(prefs, "dict") ? deref(prefs.entries.DisplayDocTitle) : null;
      if (!isType(ddt, "bool") || ddt.value !== !0)
        error(rules.docTitle, "catalog requires /ViewerPreferences /DisplayDocTitle true");
      if (rules.accessible && typeof p === "number" && (p & 512) === 0)
        error(rules.accessible, "permissions bit 10 (accessible) must be set");
      return { pass: errors.length === 0, errors, warnings, findings };
    }
    function validateUaStructElement(node) {
      if (!node || typeof node !== "object")
        throw new ParseError("pdf/extra/pdfua/struct/bad-node", "validateUaStructElement requires a node", { context: { type: typeof node } });
      const errors = [], warnings = [];
      if (node.s === "Figure") {
        if (!node.alt && !node.actualText)
          errors.push("Figure requires /Alt or /ActualText");
      }
      if (UA_STRUCTURE.forbidden.includes(node.s))
        warnings.push("avoid /" + node.s + " as a top-level structure type");
      return { pass: errors.length === 0, errors, warnings };
    }
    return {
      validatePdfUa,
      validateUaStructElement,
      UA_STRUCTURE
    };
  } });
    __register({ name: "pdfFormActionsExtended", dependencies: ["pdfErrors","pdfParserObj"], factory: function(errors, parserObj) {
    const { ParseError, ContractError } = errors, { isType } = parserObj, keyTypes = (text) => Object.freeze(Object.fromEntries(text ? text.split(" ").map((p) => p.split(":")) : [])), TABLE_TYPES = Object.freeze({
      Thread: keyTypes("F:dict|string D:dict|int|string B:dict|int"),
      Sound: keyTypes("Sound:stream Volume:num Synchronous:bool Repeat:bool Mix:bool"),
      Movie: keyTypes("Annotation:dict T:string Operation:name"),
      RichMediaExecute: keyTypes("TA:dict TI:dict CMD:dict"),
      GoToDp: keyTypes("Dp:dict"),
      SetState: keyTypes("T:array|dict AS:name"),
      NOP: keyTypes("")
    }), KEY_READ = Object.freeze({
      name: (v) => isType(v, "name") ? v.value : void 0,
      string: (v) => isType(v, "string") ? v.value : void 0,
      num: (v) => isType(v, "int") || isType(v, "real") ? v.value : void 0,
      int: (v) => isType(v, "int") ? v.value : void 0,
      bool: (v) => isType(v, "bool") ? v.value : void 0,
      array: (v) => isType(v, "array") ? v : void 0,
      dict: (v) => isType(v, "dict") ? v : void 0,
      stream: (v) => isType(v, "stream") ? v : void 0
    });
    function keyValue(type, v) {
      if (isType(v, "ref"))
        return v;
      for (const t of type.split("|")) {
        const r = KEY_READ[t](v);
        if (r !== void 0)
          return r;
      }
      return null;
    }
    function readTable(s, e) {
      const out = {};
      for (const [k, type] of Object.entries(TABLE_TYPES[s]))
        if (e[k] !== void 0)
          out[k.toLowerCase()] = keyValue(type, e[k]);
      return out;
    }
    const EXTENDED_ACTION_SUBTYPES = new Set([
      "GoTo3DView",
      "SetOCGState",
      "Trans",
      "Rendition",
      "Hide",
      "SubmitForm",
      "ResetForm",
      "ImportData",
      "JavaScript",
      ...Object.keys(TABLE_TYPES)
    ]), KNOWN = {
      GoTo3DView: new Set(["Type", "S", "Next", "TA", "V"]),
      SetOCGState: new Set(["Type", "S", "Next", "State", "PreserveRB"]),
      Trans: new Set(["Type", "S", "Next", "Trans"]),
      Rendition: new Set(["Type", "S", "Next", "R", "AN", "OP", "JS"]),
      Hide: new Set(["Type", "S", "Next", "T", "H"]),
      SubmitForm: new Set(["Type", "S", "Next", "F", "Fields", "Flags", "CharSet"]),
      ResetForm: new Set(["Type", "S", "Next", "Fields", "Flags"]),
      ImportData: new Set(["Type", "S", "Next", "F"]),
      JavaScript: new Set(["Type", "S", "Next", "JS"]),
      ...Object.fromEntries(Object.entries(TABLE_TYPES).map(([s, types]) => [s, new Set(["Type", "S", "Next", ...Object.keys(types)])]))
    };
    function knownFor(s) {
      return KNOWN[s] || new Set(["Type", "S", "Next"]);
    }
    function typeExtendedAction(dict) {
      if (!isType(dict, "dict"))
        throw new ParseError("pdf/extra/action-ext/not-dict", "action must be a dictionary", { context: { type: dict && dict.type } });
      const e = dict.entries;
      if (e.Type && (e.Type.type !== "name" || e.Type.value !== "Action"))
        throw new ParseError("pdf/extra/action-ext/bad-type", "/Type entry must be /Action", { context: { actual: e.Type.value } });
      if (!isType(e.S, "name") || !EXTENDED_ACTION_SUBTYPES.has(e.S.value))
        throw new ParseError("pdf/extra/action-ext/unsupported", "unsupported extended action subtype", { context: { subtype: e.S && e.S.value } });
      let rec;
      switch (e.S.value) {
        case "GoTo3DView":
          rec = readGoTo3DView(e);
          break;
        case "SetOCGState":
          rec = readSetOCGState(e);
          break;
        case "Trans":
          rec = readTrans(e);
          break;
        case "Rendition":
          rec = readRendition(e);
          break;
        case "Hide":
          rec = readHide(e);
          break;
        case "SubmitForm":
          rec = readSubmitForm(e);
          break;
        case "ResetForm":
          rec = readResetForm(e);
          break;
        case "ImportData":
          rec = readImportData(e);
          break;
        case "JavaScript":
          rec = readJavaScript(e);
          break;
        default:
          rec = readTable(e.S.value, e);
      }
      rec.kind = e.S.value;
      rec.raw = dict;
      rec._extras = collectExtras(e, knownFor(e.S.value));
      return rec;
    }
    function readGoTo3DView(e) {
      return { ta: e.TA || null, v: e.V || null };
    }
    function readSetOCGState(e) {
      if (!isType(e.State, "array"))
        throw new ParseError("pdf/extra/action-ext/bad-state", "/State must be an array", { context: { type: e.State && e.State.type } });
      return {
        state: e.State.items,
        preserveRB: isType(e.PreserveRB, "bool") ? e.PreserveRB.value : !0
      };
    }
    function readTrans(e) {
      if (!isType(e.Trans, "dict"))
        throw new ParseError("pdf/extra/action-ext/bad-trans", "/Trans must be a dict", { context: { type: e.Trans && e.Trans.type } });
      return { trans: e.Trans };
    }
    function readRendition(e) {
      const op = e.OP && (e.OP.type === "int" || e.OP.type === "real") ? e.OP.value | 0 : null, scriptObj = isType(e.JS, "stream") || isType(e.JS, "ref"), hasJs = isType(e.JS, "string") || scriptObj;
      return {
        r: e.R || null,
        an: e.AN || null,
        op,
        js: isType(e.JS, "string") ? e.JS.value : scriptObj ? e.JS : null,
        sandboxed: hasJs ? !0 : void 0
      };
    }
    function readHide(e) {
      if (!e.T)
        throw new ParseError("pdf/extra/action-ext/missing-t", "Hide action requires /T");
      let targets;
      if (isType(e.T, "string") || e.T.type === "ref")
        targets = [e.T];
      else if (isType(e.T, "array"))
        targets = e.T.items;
      else
        throw new ParseError("pdf/extra/action-ext/bad-t", "/T must be string, ref, or array", { context: { type: e.T.type } });
      return { targets, h: isType(e.H, "bool") ? e.H.value : !0 };
    }
    function readSubmitForm(e) {
      if (!e.F)
        throw new ParseError("pdf/extra/action-ext/missing-f", "SubmitForm requires /F (URL)");
      return {
        url: e.F,
        fields: isType(e.Fields, "array") ? e.Fields.items : null,
        flags: e.Flags && (e.Flags.type === "int" || e.Flags.type === "real") ? e.Flags.value | 0 : 0,
        charSet: isType(e.CharSet, "string") ? e.CharSet.value : null,
        sandboxed: !0
      };
    }
    function readResetForm(e) {
      return {
        fields: isType(e.Fields, "array") ? e.Fields.items : null,
        flags: e.Flags && (e.Flags.type === "int" || e.Flags.type === "real") ? e.Flags.value | 0 : 0
      };
    }
    function readImportData(e) {
      if (!e.F)
        throw new ParseError("pdf/extra/action-ext/missing-f", "ImportData requires /F (file spec)");
      return { file: e.F, sandboxed: !0 };
    }
    function readJavaScript(e) {
      if (!e.JS)
        throw new ParseError("pdf/extra/action-ext/missing-js", "JavaScript action requires /JS");
      if (!isType(e.JS, "string") && !isType(e.JS, "stream") && !isType(e.JS, "ref"))
        throw new ParseError("pdf/extra/action-ext/bad-js", "/JS must be a string, a stream or a reference to a stream", { context: { type: e.JS.type } });
      return { js: e.JS, sandboxed: !0 };
    }
    function collectExtras(entries, known) {
      const out = {};
      for (const k of Object.keys(entries))
        if (!known.has(k))
          out[k] = entries[k];
      return out;
    }
    const TRIGGERS = Object.freeze({
      catalog: Object.freeze(["DC", "WS", "DS", "WP", "DP"]),
      formField: Object.freeze(["K", "F", "V", "C"]),
      pageObject: Object.freeze(["O", "C"]),
      screenAnnotation: Object.freeze(["E", "X", "D", "U", "PO", "PC", "PV", "PI"]),
      widgetAnnotation: Object.freeze(["E", "X", "D", "U", "Fo", "Bl", "PO", "PC", "PV", "PI"])
    });
    function typeAdditionalActions(dict, kind) {
      if (typeof kind !== "string" || !Object.prototype.hasOwnProperty.call(TRIGGERS, kind))
        throw new ContractError("pdf/extra/action-ext/aa-kind", `kind must be one of ${Object.keys(TRIGGERS).join(", ")}`, { context: { kind } });
      if (!isType(dict, "dict"))
        throw new ParseError("pdf/extra/action-ext/aa-not-dict", "an additional-actions dictionary must be a dictionary", { context: { type: dict && dict.type } });
      const keys = TRIGGERS[kind], out = { raw: dict, _extras: {} };
      for (const [k, v] of Object.entries(dict.entries))
        if (keys.includes(k))
          out[k.toLowerCase()] = keyValue("dict", v);
        else
          out._extras[k] = v;
      return out;
    }
    const FIELD_ENTRY_TYPES = keyTypes("Parent:dict Kids:array T:string TU:string TM:string Ff:int AA:dict DS:string RV:string|stream");
    function typeFieldEntries(dict) {
      if (!isType(dict, "dict"))
        throw new ParseError("pdf/extra/action-ext/field-not-dict", "a field must be a dictionary", { context: { type: dict && dict.type } });
      const out = { raw: dict };
      for (const [k, v] of Object.entries(dict.entries))
        if (Object.prototype.hasOwnProperty.call(FIELD_ENTRY_TYPES, k))
          out[k.toLowerCase()] = keyValue(FIELD_ENTRY_TYPES[k], v);
      return out;
    }
    return {
      typeExtendedAction,
      EXTENDED_ACTION_SUBTYPES,
      typeFieldEntries,
      typeAdditionalActions,
      ADDITIONAL_ACTION_TRIGGERS: TRIGGERS
    };
  } });
    __register({ name: "pdfColorSpacesExtended", dependencies: ["pdfErrors","pdfParserObj"], factory: function(errors, parserObj) {
    const { ParseError, ContractError } = errors, { isType } = parserObj, COLOR_SPACE_FAMILIES = new Set([
      "CalGray",
      "CalRGB",
      "Lab",
      "ICCBased",
      "Indexed",
      "Separation",
      "DeviceN",
      "NChannel",
      "Pattern",
      "DeviceGray",
      "DeviceRGB",
      "DeviceCMYK"
    ]);
    function typeColorSpace(value) {
      if (isType(value, "name")) {
        if (!COLOR_SPACE_FAMILIES.has(value.value))
          return { family: "NamedResource", name: value.value, raw: value };
        return { family: value.value, raw: value };
      }
      if (!isType(value, "array") || value.items.length < 1)
        throw new ParseError("pdf/extra/colorspace/bad-shape", "color space must be name or non-empty array", { context: { type: value && value.type } });
      const head = value.items[0];
      if (!isType(head, "name"))
        throw new ParseError("pdf/extra/colorspace/bad-family", "color space array must start with a name");
      const family = head.value;
      if (!COLOR_SPACE_FAMILIES.has(family))
        throw new ParseError("pdf/extra/colorspace/unknown", "unknown color-space family", { context: { family } });
      switch (family) {
        case "CalGray":
          return { family, ...readCalGray(value), raw: value };
        case "CalRGB":
          return { family, ...readCalRGB(value), raw: value };
        case "Lab":
          return { family, ...readLab(value), raw: value };
        case "ICCBased":
          return { family, ...readICCBased(value), raw: value };
        case "Indexed":
          return { family, ...readIndexed(value), raw: value };
        case "Separation":
          return { family, ...readSeparation(value), raw: value };
        case "DeviceN":
          return { family, ...readDeviceN(value), raw: value };
        case "NChannel":
          return { family, ...readDeviceN(value), nChannel: !0, raw: value };
        case "Pattern":
          return { family, ...readPattern(value), raw: value };
        default:
          return { family, raw: value };
      }
    }
    function readCalDict(d) {
      if (!isType(d, "dict"))
        throw new ParseError("pdf/extra/colorspace/cal-no-dict", "Cal* parameters dict missing");
      return {
        whitePoint: numArr(d.entries.WhitePoint, 3),
        blackPoint: numArr(d.entries.BlackPoint, 3),
        gamma: d.entries.Gamma || null,
        matrix: numArr(d.entries.Matrix, 9)
      };
    }
    function readCalGray(arr) {
      if (arr.items.length < 2)
        throw new ParseError("pdf/extra/colorspace/cal-truncated", "CalGray needs dict");
      return { params: readCalDict(arr.items[1]) };
    }
    function readCalRGB(arr) {
      if (arr.items.length < 2)
        throw new ParseError("pdf/extra/colorspace/cal-truncated", "CalRGB needs dict");
      return { params: readCalDict(arr.items[1]) };
    }
    function readLab(arr) {
      if (arr.items.length < 2 || !isType(arr.items[1], "dict"))
        throw new ParseError("pdf/extra/colorspace/lab-truncated", "Lab needs dict");
      const d = arr.items[1].entries;
      return {
        whitePoint: numArr(d.WhitePoint, 3),
        blackPoint: numArr(d.BlackPoint, 3),
        range: numArr(d.Range, 4)
      };
    }
    function readICCBased(arr) {
      if (arr.items.length < 2 || !isType(arr.items[1], "stream"))
        throw new ParseError("pdf/extra/colorspace/icc-no-stream", "ICCBased needs a stream");
      const s = arr.items[1], e = s.dict.entries;
      return {
        n: e.N && (e.N.type === "int" || e.N.type === "real") ? e.N.value | 0 : null,
        alt: e.Alternate || null,
        range: numArr(e.Range, null),
        metadata: e.Metadata || null,
        profile: s
      };
    }
    function readIndexed(arr) {
      if (arr.items.length < 4)
        throw new ParseError("pdf/extra/colorspace/indexed-truncated", "Indexed needs [base hival lookup]");
      const hival = arr.items[2];
      if (!hival || hival.type !== "int" && hival.type !== "real")
        throw new ParseError("pdf/extra/colorspace/indexed-bad-hival", "Indexed hival must be numeric");
      return {
        base: arr.items[1],
        hival: hival.value | 0,
        lookup: arr.items[3]
      };
    }
    function readSeparation(arr) {
      if (arr.items.length < 4)
        throw new ParseError("pdf/extra/colorspace/sep-truncated", "Separation needs [name alternate tintTransform]");
      return {
        colorant: isType(arr.items[1], "name") ? arr.items[1].value : null,
        alternate: arr.items[2],
        tintTransform: arr.items[3]
      };
    }
    function readDeviceN(arr) {
      if (arr.items.length < 4)
        throw new ParseError("pdf/extra/colorspace/devn-truncated", "DeviceN needs [names alternate tintTransform attributes?]");
      let names = null;
      if (isType(arr.items[1], "array"))
        names = arr.items[1].items.map((it) => isType(it, "name") ? it.value : null);
      return {
        names,
        alternate: arr.items[2],
        tintTransform: arr.items[3],
        attributes: arr.items[4] || null
      };
    }
    function readPattern(arr) {
      return { base: arr.items[1] || null };
    }
    function numArr(v, expectedLen) {
      if (!isType(v, "array"))
        return null;
      const out = [];
      for (const it of v.items) {
        if (!it || it.type !== "int" && it.type !== "real")
          return null;
        out.push(it.value);
      }
      if (expectedLen != null && out.length !== expectedLen)
        return null;
      return out;
    }
    const COLOR_PART_READ = Object.freeze({
      name: (v) => isType(v, "name") ? v.value : void 0,
      string: (v) => isType(v, "string") ? v.value : void 0,
      num: (v) => isType(v, "int") || isType(v, "real") ? v.value : void 0,
      int: (v) => isType(v, "int") ? v.value : void 0,
      array: (v) => isType(v, "array") ? v : void 0,
      dict: (v) => isType(v, "dict") ? v : void 0,
      stream: (v) => isType(v, "stream") ? v : void 0
    });
    function colorPartValue(type, v) {
      if (isType(v, "ref"))
        return v;
      for (const t of type.split("|")) {
        const r = COLOR_PART_READ[t](v);
        if (r !== void 0)
          return r;
      }
      return null;
    }
    const keyTypes = (text) => Object.freeze(Object.fromEntries(text.split(" ").map((p) => p.split(":")))), COLOR_PART_TYPES = Object.freeze({
      deviceN: keyTypes("Subtype:name Colorants:dict Process:dict MixingHints:dict"),
      mixingHints: keyTypes("Solidities:dict PrintingOrder:array DotGain:dict"),
      process: keyTypes("ColorSpace:array|name Components:array"),
      solidities: keyTypes("Default:num"),
      colorSpaceMap: keyTypes("DefaultRGB:array DefaultCMYK:array DefaultGray:array"),
      functions: keyTypes("Default:dict|stream")
    }), COLOR_PART_KEYS = Object.freeze(Object.fromEntries(Object.entries(COLOR_PART_TYPES).map(([kind, types]) => [kind, Object.freeze(Object.keys(types))])));
    function typeColorPart(dict, kind) {
      if (typeof kind !== "string" || !Object.prototype.hasOwnProperty.call(COLOR_PART_TYPES, kind))
        throw new ContractError("pdf/extra/color-part/kind", `kind must be one of ${Object.keys(COLOR_PART_TYPES).join(", ")}`, { context: { kind } });
      if (!isType(dict, "dict"))
        throw new ParseError("pdf/extra/color-part/not-dict", "a colour dictionary must be a dictionary", { context: { type: dict && dict.type } });
      const types = COLOR_PART_TYPES[kind], out = { raw: dict, _extras: {} };
      for (const [k, v] of Object.entries(dict.entries))
        if (Object.prototype.hasOwnProperty.call(types, k))
          out[k.toLowerCase()] = colorPartValue(types[k], v);
        else
          out._extras[k] = v;
      return out;
    }
    return { typeColorSpace, COLOR_SPACE_FAMILIES, typeColorPart, COLOR_PART_KEYS };
  } });
    __register({ name: "pdfShadingTyped", dependencies: ["pdfErrors","pdfParserObj"], factory: function(errors, parserObj) {
    const { ParseError } = errors, { isType } = parserObj, NUM = (v) => v && (v.type === "int" || v.type === "real");
    function typeShading(obj_) {
      let dict;
      if (isType(obj_, "dict"))
        dict = obj_;
      else if (isType(obj_, "stream"))
        dict = obj_.dict;
      else
        throw new ParseError("pdf/extra/shading/not-dict-or-stream", "Shading must be dict or stream", { context: { type: obj_ && obj_.type } });
      const e = dict.entries;
      if (!NUM(e.ShadingType))
        throw new ParseError("pdf/extra/shading/missing-type", "/ShadingType is required and must be numeric", { context: { type: e.ShadingType && e.ShadingType.type } });
      const st = e.ShadingType.value | 0;
      if (st < 1 || st > 7)
        throw new ParseError("pdf/extra/shading/bad-type", "invalid /ShadingType (must be 1..7)", { context: { st } });
      const base = {
        shadingType: st,
        colorSpace: e.ColorSpace || null,
        background: isType(e.Background, "array") ? e.Background.items : null,
        bbox: isType(e.BBox, "array") ? e.BBox.items.map((it) => NUM(it) ? it.value : null) : null,
        antiAlias: isType(e.AntiAlias, "bool") ? e.AntiAlias.value : !1,
        raw: obj_,
        _extras: {}
      };
      let typed;
      switch (st) {
        case 1:
          typed = readFnBased(e);
          break;
        case 2:
          typed = readAxial(e);
          break;
        case 3:
          typed = readRadial(e);
          break;
        case 4:
          typed = readFreeForm(e);
          break;
        case 5:
          typed = readLattice(e);
          break;
        case 6:
          typed = readCoons(e);
          break;
        case 7:
          typed = readTensor(e);
          break;
      }
      Object.assign(base, typed);
      const known = new Set([
        "ShadingType",
        "ColorSpace",
        "Background",
        "BBox",
        "AntiAlias",
        "Domain",
        "Matrix",
        "Function",
        "Coords",
        "Extend",
        "BitsPerCoordinate",
        "BitsPerComponent",
        "BitsPerFlag",
        "Decode",
        "VerticesPerRow"
      ]);
      for (const k of Object.keys(e))
        if (!known.has(k))
          base._extras[k] = e[k];
      return base;
    }
    function readFnBased(e) {
      return {
        domain: isType(e.Domain, "array") ? toNumArr(e.Domain) : [0, 1, 0, 1],
        matrix: isType(e.Matrix, "array") ? toNumArr(e.Matrix) : [1, 0, 0, 1, 0, 0],
        function: e.Function || null
      };
    }
    function readAxial(e) {
      requireArrLen(e.Coords, 4, "Axial /Coords");
      return {
        coords: toNumArr(e.Coords),
        domain: isType(e.Domain, "array") ? toNumArr(e.Domain) : [0, 1],
        function: e.Function || null,
        extend: extendArr(e.Extend)
      };
    }
    function readRadial(e) {
      requireArrLen(e.Coords, 6, "Radial /Coords");
      return {
        coords: toNumArr(e.Coords),
        domain: isType(e.Domain, "array") ? toNumArr(e.Domain) : [0, 1],
        function: e.Function || null,
        extend: extendArr(e.Extend)
      };
    }
    function readFreeForm(e) {
      return meshCommon(e, !0);
    }
    function readLattice(e) {
      const c = meshCommon(e, !1);
      if (!NUM(e.VerticesPerRow))
        throw new ParseError("pdf/extra/shading/lattice-missing-vpr", "Lattice shading requires /VerticesPerRow");
      c.verticesPerRow = e.VerticesPerRow.value | 0;
      return c;
    }
    function readCoons(e) {
      return meshCommon(e, !0);
    }
    function readTensor(e) {
      return meshCommon(e, !0);
    }
    function meshCommon(e, hasFlag) {
      if (!NUM(e.BitsPerCoordinate) || !NUM(e.BitsPerComponent))
        throw new ParseError("pdf/extra/shading/mesh-missing-bits", "mesh shading requires /BitsPerCoordinate and /BitsPerComponent");
      if (!isType(e.Decode, "array"))
        throw new ParseError("pdf/extra/shading/mesh-missing-decode", "mesh shading requires /Decode");
      const out = {
        bitsPerCoordinate: e.BitsPerCoordinate.value | 0,
        bitsPerComponent: e.BitsPerComponent.value | 0,
        decode: toNumArr(e.Decode),
        function: e.Function || null
      };
      if (hasFlag) {
        if (!NUM(e.BitsPerFlag))
          throw new ParseError("pdf/extra/shading/mesh-missing-flag", "this mesh shading requires /BitsPerFlag");
        out.bitsPerFlag = e.BitsPerFlag.value | 0;
      }
      return out;
    }
    function extendArr(v) {
      if (!isType(v, "array") || v.items.length !== 2)
        return [!1, !1];
      return [
        isType(v.items[0], "bool") ? v.items[0].value : !1,
        isType(v.items[1], "bool") ? v.items[1].value : !1
      ];
    }
    function toNumArr(v) {
      if (!isType(v, "array"))
        return null;
      const out = [];
      for (const it of v.items) {
        if (!NUM(it))
          return null;
        out.push(it.value);
      }
      return out;
    }
    function requireArrLen(v, len, what) {
      if (!isType(v, "array") || v.items.length !== len)
        throw new ParseError("pdf/extra/shading/bad-coords", `${what} must be an array of ${len} numbers`, { context: { actualLen: v && v.items && v.items.length } });
    }
    function typeFunction(obj_) {
      let dict;
      if (isType(obj_, "dict"))
        dict = obj_;
      else if (isType(obj_, "stream"))
        dict = obj_.dict;
      else
        throw new ParseError("pdf/extra/function/not-dict-or-stream", "Function must be dict or stream", { context: { type: obj_ && obj_.type } });
      const e = dict.entries;
      if (!NUM(e.FunctionType))
        throw new ParseError("pdf/extra/function/missing-type", "/FunctionType is required");
      const ft = e.FunctionType.value | 0;
      if (![0, 2, 3, 4].includes(ft))
        throw new ParseError("pdf/extra/function/bad-type", "/FunctionType must be 0, 2, 3, or 4", { context: { ft } });
      return {
        functionType: ft,
        domain: toNumArr(e.Domain),
        range: toNumArr(e.Range),
        c0: toNumArr(e.C0),
        c1: toNumArr(e.C1),
        n: NUM(e.N) ? e.N.value : null,
        functions: isType(e.Functions, "array") ? e.Functions.items : null,
        bounds: toNumArr(e.Bounds),
        encode: toNumArr(e.Encode),
        size: toNumArr(e.Size),
        bitsPerSample: NUM(e.BitsPerSample) ? e.BitsPerSample.value | 0 : null,
        order: NUM(e.Order) ? e.Order.value | 0 : null,
        decode: toNumArr(e.Decode),
        raw: obj_
      };
    }
    const isRefV = (v) => isType(v, "ref"), KEY_READ = Object.freeze({
      name: (v) => isType(v, "name") ? v.value : void 0,
      string: (v) => isType(v, "string") ? v.value : void 0,
      num: (v) => isType(v, "int") || isType(v, "real") ? v.value : void 0,
      int: (v) => isType(v, "int") ? v.value : void 0,
      bool: (v) => isType(v, "bool") ? v.value : void 0,
      array: (v) => isType(v, "array") ? v : void 0,
      dict: (v) => isType(v, "dict") ? v : void 0,
      stream: (v) => isType(v, "stream") ? v : void 0
    });
    function keyValue(type, v) {
      if (isRefV(v))
        return v;
      for (const t of type.split("|")) {
        const r = KEY_READ[t](v);
        if (r !== void 0)
          return r;
      }
      return null;
    }
    const keyTypes = (text) => Object.freeze(Object.fromEntries(text.split(" ").map((p) => p.split(":")))), keysOf = (table) => Object.freeze(Object.fromEntries(Object.entries(table).map(([kind, types]) => [kind, Object.freeze(Object.keys(types))]))), PATTERN_TYPES = Object.freeze({
      1: keyTypes("Type:name PatternType:int PaintType:int TilingType:int BBox:array XStep:num YStep:num Resources:dict Matrix:array XUID:array"),
      2: keyTypes("Type:name PatternType:int Shading:dict|stream Matrix:array ExtGState:dict")
    }), PATTERN_KEYS = keysOf(PATTERN_TYPES), STREAM_KEYS = new Set(["Length", "Filter", "DecodeParms", "F", "FFilter", "FDecodeParms", "DL"]);
    function typePattern(value) {
      const dict = isType(value, "stream") ? value.dict : value;
      if (!isType(dict, "dict"))
        throw new ParseError("pdf/extra/shading/pattern/not-dict", "a pattern must be a dictionary or a stream", { context: { type: value && value.type } });
      const e = dict.entries, t = isType(e.PatternType, "int") ? e.PatternType.value : null, types = t !== null && Object.prototype.hasOwnProperty.call(PATTERN_TYPES, t) ? PATTERN_TYPES[t] : null;
      if (!types)
        throw new ParseError("pdf/extra/shading/pattern/bad-type", "/PatternType must be 1 or 2", { context: { actual: t } });
      const streamed = isType(value, "stream"), out = { raw: value, _extras: {} };
      for (const [k, v] of Object.entries(e))
        if (Object.prototype.hasOwnProperty.call(types, k))
          out[k.toLowerCase()] = keyValue(types[k], v);
        else if (!(streamed && STREAM_KEYS.has(k)))
          out._extras[k] = v;
      return out;
    }
    return { typeShading, typeFunction, typePattern, PATTERN_KEYS };
  } });
    __register({ name: "pdfTransparencyTyped", dependencies: ["pdfErrors","pdfParser"], factory: function(errors, parser) {
    const { ParseError } = errors, { isType } = parser, BLEND_MODES = Object.freeze([
      "Normal",
      "Compatible",
      "Multiply",
      "Screen",
      "Overlay",
      "Darken",
      "Lighten",
      "ColorDodge",
      "ColorBurn",
      "HardLight",
      "SoftLight",
      "Difference",
      "Exclusion",
      "Hue",
      "Saturation",
      "Color",
      "Luminosity"
    ]), NUM = (v) => v && (v.type === "int" || v.type === "real");
    function typeTransparencyGroup(dict) {
      if (!isType(dict, "dict"))
        throw new ParseError("pdf/extra/transparency-group/not-dict", "Transparency Group must be a dict", { context: { type: dict && dict.type } });
      const e = dict.entries;
      if (e.Type && (e.Type.type !== "name" || e.Type.value !== "Group"))
        throw new ParseError("pdf/extra/transparency-group/bad-type", "/Type entry must be /Group", { context: { actual: e.Type.value } });
      if (!isType(e.S, "name") || e.S.value !== "Transparency")
        throw new ParseError("pdf/extra/transparency-group/bad-s", "/S must be /Transparency", { context: { actual: e.S && e.S.value } });
      const known = new Set(["Type", "S", "CS", "I", "K"]), out = {
        s: "Transparency",
        cs: e.CS || null,
        isolated: isType(e.I, "bool") ? e.I.value : !1,
        knockout: isType(e.K, "bool") ? e.K.value : !1,
        raw: dict,
        _extras: {}
      };
      for (const k of Object.keys(e))
        if (!known.has(k))
          out._extras[k] = e[k];
      return out;
    }
    function typeSoftMask(dict) {
      if (!isType(dict, "dict"))
        throw new ParseError("pdf/extra/soft-mask/not-dict", "Soft Mask must be a dict", { context: { type: dict && dict.type } });
      const e = dict.entries;
      if (e.Type && (e.Type.type !== "name" || e.Type.value !== "Mask"))
        throw new ParseError("pdf/extra/soft-mask/bad-type", "/Type entry must be /Mask", { context: { actual: e.Type.value } });
      if (!isType(e.S, "name") || e.S.value !== "Alpha" && e.S.value !== "Luminosity")
        throw new ParseError("pdf/extra/soft-mask/bad-s", "/S must be /Alpha or /Luminosity", { context: { actual: e.S && e.S.value } });
      if (!e.G)
        throw new ParseError("pdf/extra/soft-mask/missing-g", "Soft Mask requires /G (transparency group XObject)");
      const known = new Set(["Type", "S", "G", "BC", "TR"]), out = {
        kind: e.S.value,
        g: e.G,
        backdrop: isType(e.BC, "array") ? toNumArr(e.BC) : null,
        transfer: e.TR || null,
        raw: dict,
        _extras: {}
      };
      for (const k of Object.keys(e))
        if (!known.has(k))
          out._extras[k] = e[k];
      return out;
    }
    function resolveBlendMode(value) {
      if (!value)
        return null;
      if (isType(value, "name"))
        return BLEND_MODES.includes(value.value) ? value.value : null;
      if (isType(value, "array")) {
        for (const it of value.items)
          if (isType(it, "name") && BLEND_MODES.includes(it.value))
            return it.value;
        return null;
      }
      throw new ParseError("pdf/extra/blend-mode/bad-type", "/BM must be name or array of names", { context: { type: value.type } });
    }
    function toNumArr(v) {
      const out = [];
      for (const it of v.items) {
        if (!NUM(it))
          return null;
        out.push(it.value);
      }
      return out;
    }
    return {
      typeTransparencyGroup,
      typeSoftMask,
      resolveBlendMode,
      BLEND_MODES
    };
  } });
    __register({ name: "pdfSigPades", dependencies: ["pdfErrors","pdfParser"], factory: function(errors, parser) {
    const { ParseError, ContractError } = errors, { isType } = parser, SIG_SUBFILTERS = Object.freeze({
      "adbe.x509.rsa_sha1": { pades: !1, kind: "legacy" },
      "adbe.pkcs7.sha1": { pades: !1, kind: "legacy" },
      "adbe.pkcs7.detached": { pades: !1, kind: "pkcs7-detached" },
      "ETSI.CAdES.detached": { pades: !0, kind: "pades-cades" },
      "ETSI.RFC3161": { pades: !0, kind: "doc-timestamp" }
    });
    function detectPadesProfile(sigDict, ctx) {
      if (!isType(sigDict, "dict"))
        throw new ParseError("pdf/extra/pades/not-dict", "signature dict must be a dictionary", { context: { type: sigDict && sigDict.type } });
      const e = sigDict.entries, sf = isType(e.SubFilter, "name") ? e.SubFilter.value : null, info = sf ? SIG_SUBFILTERS[sf] : null, isPades = !!(info && info.pades), hasTimestamp = !!(sf === "ETSI.RFC3161" || e.M && isType(e.M, "string") || ctx && ctx.hasSignatureTimestamp);
      let level = null;
      if (isPades) {
        const hasDss = !!(ctx && ctx.dss);
        if (!!(ctx && ctx.hasDocTimestampOverDss))
          level = "B-LTA";
        else if (hasDss)
          level = "B-LT";
        else if (hasTimestamp)
          level = "B-T";
        else
          level = "B-B";
      }
      return { subFilter: sf, isPades, level, hasTimestamp };
    }
    function typeReferenceArray(arr) {
      if (!isType(arr, "array"))
        throw new ParseError("pdf/extra/pades/bad-reference", "/Reference must be an array", { context: { type: arr && arr.type } });
      const out = [];
      for (const it of arr.items) {
        if (!isType(it, "dict"))
          throw new ParseError("pdf/extra/pades/bad-reference-item", "/Reference items must be dicts");
        const e = it.entries;
        if (e.Type && (e.Type.type !== "name" || e.Type.value !== "SigRef"))
          throw new ParseError("pdf/extra/pades/bad-reference-type", "/Type of /Reference item must be /SigRef", { context: { actual: e.Type.value } });
        out.push({
          transformMethod: isType(e.TransformMethod, "name") ? e.TransformMethod.value : null,
          transformParams: isType(e.TransformParams, "dict") ? e.TransformParams : null,
          data: e.Data || null,
          digestMethod: isType(e.DigestMethod, "name") ? e.DigestMethod.value : null,
          digestValue: isType(e.DigestValue, "string") ? e.DigestValue.value : null,
          digestLocation: isType(e.DigestLocation, "array") ? e.DigestLocation : null,
          raw: it
        });
      }
      return out;
    }
    function typeDSS(dict) {
      if (!isType(dict, "dict"))
        throw new ParseError("pdf/extra/pades/dss-not-dict", "DSS must be a dictionary", { context: { type: dict && dict.type } });
      const e = dict.entries;
      if (e.Type && (e.Type.type !== "name" || e.Type.value !== "DSS"))
        throw new ParseError("pdf/extra/pades/dss-bad-type", "/Type of DSS dict must be /DSS", { context: { actual: e.Type.value } });
      const out = {
        certs: refsArray(e.Certs, "DSS /Certs"),
        crls: refsArray(e.CRLs, "DSS /CRLs"),
        ocsps: refsArray(e.OCSPs, "DSS /OCSPs"),
        vri: isType(e.VRI, "dict") ? typeVRI(e.VRI) : null,
        raw: dict,
        _extras: {}
      }, known = new Set(["Type", "Certs", "CRLs", "OCSPs", "VRI"]);
      for (const k of Object.keys(e))
        if (!known.has(k))
          out._extras[k] = e[k];
      return out;
    }
    function typeVRI(dict) {
      const out = {};
      for (const k of Object.keys(dict.entries)) {
        const v = dict.entries[k];
        if (!isType(v, "dict"))
          continue;
        const ve = v.entries;
        out[k] = {
          cert: refsArray(ve.Cert, "VRI /Cert"),
          crl: refsArray(ve.CRL, "VRI /CRL"),
          ocsp: refsArray(ve.OCSP, "VRI /OCSP"),
          tu: isType(ve.TU, "string") ? ve.TU.value : null,
          ts: ve.TS || null
        };
      }
      return out;
    }
    function refsArray(v, ctxLabel) {
      if (!v)
        return null;
      if (!isType(v, "array"))
        throw new ParseError("pdf/extra/pades/dss-bad-array", `${ctxLabel} must be an array`, { context: { type: v.type } });
      return v.items;
    }
    function validateDocMdp(ref) {
      const issues = [];
      if (!ref || ref.transformMethod !== "DocMDP") {
        issues.push({
          code: "pdf/extra/pades/mdp/wrong-transform",
          message: "reference is not a DocMDP transform",
          context: { transformMethod: ref && ref.transformMethod }
        });
        return { valid: !1, level: null, issues };
      }
      if (!ref.transformParams || !isType(ref.transformParams, "dict")) {
        issues.push({
          code: "pdf/extra/pades/mdp/missing-params",
          message: "DocMDP missing /TransformParams dict"
        });
        return { valid: !1, level: null, issues };
      }
      const params = ref.transformParams.entries;
      let level = null;
      if (params.P)
        if (params.P.type !== "int")
          issues.push({
            code: "pdf/extra/pades/mdp/bad-p-type",
            message: "/P must be an integer",
            context: { type: params.P.type }
          });
        else if (params.P.value < 1 || params.P.value > 3)
          issues.push({
            code: "pdf/extra/pades/mdp/bad-p-value",
            message: "/P must be 1, 2 or 3",
            context: { value: params.P.value }
          });
        else
          level = params.P.value;
      else
        level = 2;
      if (params.V && params.V.type === "name" && params.V.value !== "1.2" && params.V.value !== "2.2")
        issues.push({
          code: "pdf/extra/pades/mdp/bad-version",
          message: "unknown DocMDP /V",
          context: { v: params.V.value }
        });
      if (!ref.digestMethod)
        issues.push({
          code: "pdf/extra/pades/mdp/missing-digest",
          message: "DocMDP reference missing /DigestMethod"
        });
      return { valid: issues.length === 0, level, issues };
    }
    function validateBLtaChain(steps) {
      if (!Array.isArray(steps))
        throw new ParseError("pdf/extra/pades/chain/bad-input", "validateBLtaChain expects an array of steps", { context: { type: typeof steps } });
      const trace = [];
      let sawDss = !1, sawDocTsOverDss = !1;
      for (let i = 0;i < steps.length; i++) {
        const step = steps[i];
        if (!step || !step.sigDict)
          throw new ParseError("pdf/extra/pades/chain/missing-sig", "step missing sigDict", { context: { index: i } });
        if (step.hasDss)
          sawDss = !0;
        if (step.hasDocTimestamp && sawDss)
          sawDocTsOverDss = !0;
        const ctx = {
          dss: sawDss ? {} : void 0,
          hasDocTimestampOverDss: sawDocTsOverDss,
          hasSignatureTimestamp: !!step.hasSignatureTimestamp
        }, detected = detectPadesProfile(step.sigDict, ctx);
        trace.push({
          index: i,
          level: detected.level,
          isPades: detected.isPades
        });
      }
      const last = trace[trace.length - 1];
      return { chainLevel: last ? last.level : null, trace };
    }
    const isRefV = (v) => isType(v, "ref"), KEY_READ = Object.freeze({
      name: (v) => isType(v, "name") ? v.value : void 0,
      string: (v) => isType(v, "string") ? v.value : void 0,
      num: (v) => isType(v, "int") || isType(v, "real") ? v.value : void 0,
      int: (v) => isType(v, "int") ? v.value : void 0,
      bool: (v) => isType(v, "bool") ? v.value : void 0,
      array: (v) => isType(v, "array") ? v : void 0,
      dict: (v) => isType(v, "dict") ? v : void 0,
      stream: (v) => isType(v, "stream") ? v : void 0
    });
    function keyValue(type, v) {
      if (isRefV(v))
        return v;
      for (const t of type.split("|")) {
        const r = KEY_READ[t](v);
        if (r !== void 0)
          return r;
      }
      return null;
    }
    const keyTypes = (text) => Object.freeze(Object.fromEntries(text.split(" ").map((p) => p.split(":")))), keysOf = (table) => Object.freeze(Object.fromEntries(Object.entries(table).map(([kind, types]) => [kind, Object.freeze(Object.keys(types))]))), SEED_VALUE_TYPES = Object.freeze({
      field: keyTypes("Type:name Ff:int Filter:name SubFilter:array DigestMethod:array V:int Cert:dict Reasons:array MDP:dict TimeStamp:dict LegalAttestation:array AddRevInfo:bool LockDocument:name AppearanceFilter:string"),
      cert: keyTypes("Type:name Ff:int Subject:array SignaturePolicyOID:string SignaturePolicyHashValue:string SignaturePolicyHashAlgorithm:name SignaturePolicyCommitmentType:array SubjectDN:array KeyUsage:array Issuer:array OID:array URL:string URLType:name"),
      mdp: keyTypes("P:int"),
      timeStamp: keyTypes("URL:string Ff:int")
    }), SEED_VALUE_KEYS = keysOf(SEED_VALUE_TYPES);
    function typeSeedValue(dict, kind) {
      if (typeof kind !== "string" || !Object.prototype.hasOwnProperty.call(SEED_VALUE_TYPES, kind))
        throw new ContractError("pdf/extra/pades/seed/kind", "kind must be field, cert, mdp or timeStamp", { context: { kind } });
      if (!isType(dict, "dict"))
        throw new ParseError("pdf/extra/pades/seed/not-dict", "a seed value must be a dictionary", { context: { type: dict && dict.type } });
      const types = SEED_VALUE_TYPES[kind], out = { raw: dict, _extras: {} };
      for (const [k, v] of Object.entries(dict.entries))
        if (Object.prototype.hasOwnProperty.call(types, k))
          out[k.toLowerCase()] = keyValue(types[k], v);
        else
          out._extras[k] = v;
      return out;
    }
    const VRI_ENTRY_TYPES = keyTypes("Type:name Cert:array CRL:array OCSP:array TU:string TS:stream");
    function typeVRIEntry(dict) {
      if (!isType(dict, "dict"))
        throw new ParseError("pdf/extra/pades/vri/not-dict", "a VRI entry must be a dictionary", { context: { type: dict && dict.type } });
      const out = { raw: dict, _extras: {} };
      for (const [k, v] of Object.entries(dict.entries))
        if (Object.prototype.hasOwnProperty.call(VRI_ENTRY_TYPES, k))
          out[k.toLowerCase()] = keyValue(VRI_ENTRY_TYPES[k], v);
        else
          out._extras[k] = v;
      return out;
    }
    const BUILD_COMMON = "Name:name Date:string R:num PreRelease:bool OS:array NonEFontNoWarn:bool TrustedMode:bool V:num", BUILD_DATA_TYPES = Object.freeze({
      data: keyTypes(BUILD_COMMON),
      app: keyTypes(`${BUILD_COMMON} REx:string`),
      sigQ: keyTypes(`${BUILD_COMMON} Preview:bool`)
    }), BUILD_DATA_KEYS = keysOf(BUILD_DATA_TYPES), BUILD_PROPERTIES = Object.freeze([
      ["Filter", "filter", "data"],
      ["PubSec", "pubSec", "data"],
      ["App", "app", "app"],
      ["SigQ", "sigQ", "sigQ"]
    ]);
    function buildNotDict(value) {
      return new ParseError("pdf/extra/pades/build/not-dict", "signature build data must be a dictionary", { context: { type: value && value.type } });
    }
    function typeBuildData(dict, kind) {
      if (typeof kind !== "string" || !Object.prototype.hasOwnProperty.call(BUILD_DATA_TYPES, kind))
        throw new ContractError("pdf/extra/pades/build/kind", "kind must be data, app or sigQ", { context: { kind } });
      if (!isType(dict, "dict"))
        throw buildNotDict(dict);
      const types = BUILD_DATA_TYPES[kind], out = { raw: dict, _extras: {} };
      for (const [k, v] of Object.entries(dict.entries))
        if (Object.prototype.hasOwnProperty.call(types, k))
          out[k.toLowerCase()] = keyValue(types[k], v);
        else
          out._extras[k] = v;
      return out;
    }
    function typeBuildProperties(dict) {
      if (!isType(dict, "dict"))
        throw buildNotDict(dict);
      const e = dict.entries, out = { raw: dict, _extras: {} }, known = new Set;
      for (const [key, field, kind] of BUILD_PROPERTIES) {
        known.add(key);
        if (e[key] === void 0)
          continue;
        const v = e[key];
        out[field] = isType(v, "ref") ? v : isType(v, "dict") ? typeBuildData(v, kind) : null;
      }
      for (const k of Object.keys(e))
        if (!known.has(k))
          out._extras[k] = e[k];
      return out;
    }
    return {
      detectPadesProfile,
      typeReferenceArray,
      typeDSS,
      typeVRIEntry,
      validateDocMdp,
      validateBLtaChain,
      typeSeedValue,
      SEED_VALUE_KEYS,
      typeBuildData,
      typeBuildProperties,
      BUILD_DATA_KEYS,
      SIG_SUBFILTERS
    };
  } });
    __register({ name: "pdfSigAesGcm", dependencies: ["pdfErrors","pdfParser"], factory: function(errors, parser) {
    const { ParseError, EncryptionError } = errors, { isType } = parser, CFM_CATALOG = Object.freeze({
      None: { cipher: "none", keyBits: 0, notes: "identity / stream-as-is" },
      V2: { cipher: "rc4", keyBits: 40, notes: "legacy RC4 (deprecated)" },
      AESV2: {
        cipher: "aes",
        keyBits: 128,
        mode: "cbc",
        notes: "AES-128 CBC (R4)"
      },
      AESV3: {
        cipher: "aes",
        keyBits: 256,
        mode: "cbc",
        notes: "AES-256 CBC (R6, ISO 32000-2)"
      },
      AESV4: {
        cipher: "aes",
        keyBits: 256,
        mode: "gcm",
        notes: "AES-256 GCM (ISO/TS 32003)"
      }
    }), ENCRYPT_KNOWN = new Set([
      "Filter",
      "SubFilter",
      "V",
      "Length",
      "CF",
      "StmF",
      "StrF",
      "EFF",
      "R",
      "O",
      "U",
      "OE",
      "UE",
      "Perms",
      "P",
      "EncryptMetadata"
    ]), CF_ENTRY_KNOWN = new Set(["Type", "CFM", "AuthEvent", "Length"]);
    function typeEncryptForGcm(dict) {
      if (!isType(dict, "dict"))
        throw new ParseError("pdf/extra/sig-aes-gcm/not-dict", "/Encrypt must be a dictionary", { context: { type: dict && dict.type } });
      const e = dict.entries, out = {
        v: isType(e.V, "int") ? e.V.value : null,
        r: isType(e.R, "int") ? e.R.value : null,
        length: isType(e.Length, "int") ? e.Length.value : null,
        stmF: isType(e.StmF, "name") ? e.StmF.value : null,
        strF: isType(e.StrF, "name") ? e.StrF.value : null,
        eff: isType(e.EFF, "name") ? e.EFF.value : null,
        cf: {},
        hasAesGcm: !1,
        raw: dict,
        _extras: {}
      };
      if (e.CF !== void 0) {
        if (!isType(e.CF, "dict"))
          throw new ParseError("pdf/extra/sig-aes-gcm/bad-cf", "/CF must be a dictionary", { context: { type: e.CF.type } });
        for (const name of Object.keys(e.CF.entries)) {
          const entry = e.CF.entries[name];
          if (!isType(entry, "dict"))
            throw new ParseError("pdf/extra/sig-aes-gcm/bad-cf-entry", "/CF entry must be a dictionary", { context: { name } });
          out.cf[name] = typeCfEntry(entry);
          if (out.cf[name].cfm === "AESV4")
            out.hasAesGcm = !0;
        }
      }
      for (const k of Object.keys(e))
        if (!ENCRYPT_KNOWN.has(k))
          out._extras[k] = e[k];
      return out;
    }
    function typeCfEntry(dict) {
      if (!isType(dict, "dict"))
        throw new ParseError("pdf/extra/sig-aes-gcm/cf-entry-not-dict", "CF entry must be a dictionary", { context: { type: dict && dict.type } });
      const e = dict.entries, cfm = isType(e.CFM, "name") ? e.CFM.value : null, out = {
        cfm,
        authEvent: isType(e.AuthEvent, "name") ? e.AuthEvent.value : null,
        length: isType(e.Length, "int") ? e.Length.value : null,
        catalog: cfm && CFM_CATALOG[cfm] ? CFM_CATALOG[cfm] : null,
        raw: dict,
        _extras: {}
      };
      if (isType(e.Type, "name"))
        out.type = e.Type.value;
      for (const k of Object.keys(e))
        if (!CF_ENTRY_KNOWN.has(k))
          out._extras[k] = e[k];
      return out;
    }
    function validateGcmFraming(framed) {
      if (!(framed instanceof Uint8Array))
        throw new EncryptionError("pdf/extra/sig-aes-gcm/bad-input", "framed input must be a Uint8Array", { context: { type: typeof framed } });
      if (framed.length < 28)
        throw new EncryptionError("pdf/extra/sig-aes-gcm/too-short", "AES-GCM framed blob must be at least 28 bytes (IV+tag)", { context: { length: framed.length } });
      return {
        iv: framed.subarray(0, 12),
        ciphertext: framed.subarray(12, framed.length - 16),
        tag: framed.subarray(framed.length - 16)
      };
    }
    return {
      typeEncryptForGcm,
      typeCfEntry,
      validateGcmFraming,
      CFM_CATALOG
    };
  } });
    __register({ name: "pdfDocumentParts", dependencies: ["pdfErrors","pdfParser"], factory: function(errors, parser) {
    const { ParseError } = errors, { isType } = parser, DPART_KNOWN = new Set([
      "Type",
      "Parent",
      "DParts",
      "Start",
      "End",
      "DPM",
      "NodeNameTree",
      "AF"
    ]), ROOT_KNOWN = new Set([
      "Type",
      "DPartRootNode",
      "RecordLevel",
      "NodeNameList"
    ]);
    function typeDPartRoot(dict) {
      if (!isType(dict, "dict"))
        throw new ParseError("pdf/extra/dparts/root/not-dict", "/DPartRoot must be a dictionary", { context: { type: dict && dict.type } });
      const e = dict.entries;
      if (e.Type && (e.Type.type !== "name" || e.Type.value !== "DPartRoot"))
        throw new ParseError("pdf/extra/dparts/root/bad-type", "/Type must be /DPartRoot when present", { context: { actual: e.Type.value } });
      if (!e.DPartRootNode)
        throw new ParseError("pdf/extra/dparts/root/missing-node", "/DPartRoot requires a /DPartRootNode entry");
      const out = {
        rootNode: e.DPartRootNode,
        recordLevel: isType(e.RecordLevel, "int") ? e.RecordLevel.value : null,
        nodeNameList: toNameList(e.NodeNameList),
        raw: dict,
        _extras: {}
      };
      for (const k of Object.keys(e))
        if (!ROOT_KNOWN.has(k))
          out._extras[k] = e[k];
      return out;
    }
    function typeDPart(dict) {
      if (!isType(dict, "dict"))
        throw new ParseError("pdf/extra/dparts/node/not-dict", "/DPart must be a dictionary", { context: { type: dict && dict.type } });
      const e = dict.entries;
      if (e.Type && (e.Type.type !== "name" || e.Type.value !== "DPart"))
        throw new ParseError("pdf/extra/dparts/node/bad-type", "/Type must be /DPart when present", { context: { actual: e.Type.value } });
      const out = {
        parent: e.Parent || null,
        dParts: toRefArray(e.DParts),
        start: pageRef(e.Start),
        end: pageRef(e.End),
        dpm: isType(e.DPM, "dict") ? typeDPM(e.DPM) : null,
        nodeNameTree: e.NodeNameTree || null,
        af: e.AF || null,
        raw: dict,
        _extras: {}
      };
      if (e.DPM && !isType(e.DPM, "dict"))
        throw new ParseError("pdf/extra/dparts/node/bad-dpm", "/DPM must be a dictionary", { context: { type: e.DPM.type } });
      for (const k of Object.keys(e))
        if (!DPART_KNOWN.has(k))
          out._extras[k] = e[k];
      return out;
    }
    function pageRef(v) {
      if (isType(v, "ref"))
        return { num: v.num, gen: v.gen };
      return isType(v, "int") ? v.value : null;
    }
    function typeDPM(dict) {
      if (!isType(dict, "dict"))
        throw new ParseError("pdf/extra/dparts/dpm/not-dict", "/DPM must be a dictionary", { context: { type: dict && dict.type } });
      const e = dict.entries, out = { entries: {}, raw: dict };
      for (const k of Object.keys(e))
        out.entries[k] = e[k];
      return out;
    }
    function walkDParts(root, visit) {
      if (!root)
        return;
      if (typeof visit !== "function")
        throw new ParseError("pdf/extra/dparts/walk/bad-visit", "walkDParts requires a visit callback");
      visit(root);
      if (!root.dParts)
        return;
      for (const child of root.dParts)
        if (isType(child, "dict"))
          walkDParts(typeDPart(child), visit);
    }
    function toRefArray(v) {
      if (!v)
        return null;
      if (v.type !== "array")
        return null;
      return v.items.slice();
    }
    function toNameList(v) {
      if (!v)
        return null;
      if (v.type !== "array")
        return null;
      const out = [];
      for (const it of v.items)
        if (isType(it, "name"))
          out.push(it.value);
        else
          out.push(it);
      return out;
    }
    return { typeDPartRoot, typeDPart, typeDPM, walkDParts };
  } });
    __register({ name: "pdfRedactionIso32005", dependencies: ["pdfErrors","pdfParser"], factory: function(errors, parser) {
    const { ParseError } = errors, { isType } = parser, KNOWN = new Set([
      "Type",
      "AppliedAt",
      "Tool",
      "Annotations",
      "RD",
      "RO",
      "IC",
      "MarkedRegions"
    ]), REDACT_MARKERS = Object.freeze({
      begin: "/Redact BMC",
      beginPropertyList: "/Redact BDC",
      end: "EMC",
      notes: "TS 32005 \xA76.3 \u2014 wraps content removed/overlaid by /RD."
    });
    function typeRedactionRecord(dict) {
      if (!isType(dict, "dict"))
        throw new ParseError("pdf/extra/redact32005/not-dict", "redaction record must be a dictionary", { context: { type: dict && dict.type } });
      const e = dict.entries, out = {
        appliedAt: isType(e.AppliedAt, "string") ? e.AppliedAt.value : null,
        tool: isType(e.Tool, "string") ? e.Tool.value : null,
        annotations: toRefArray(e.Annotations),
        rd: toRect(e.RD),
        ro: isType(e.RO, "ref") || isType(e.RO, "stream") ? e.RO : null,
        ic: toNumArray(e.IC),
        markedRegions: toMarkedRegions(e.MarkedRegions),
        raw: dict,
        _extras: {}
      };
      if (e.Annotations && e.Annotations.type !== "array")
        throw new ParseError("pdf/extra/redact32005/bad-annotations", "/Annotations must be an array", { context: { type: e.Annotations.type } });
      for (const k of Object.keys(e))
        if (!KNOWN.has(k))
          out._extras[k] = e[k];
      return out;
    }
    function findRedactMarkers(bytes) {
      if (!(bytes instanceof Uint8Array))
        throw new ParseError("pdf/extra/redact32005/scan/bad-input", "findRedactMarkers requires a Uint8Array", { context: { type: typeof bytes } });
      const text = new TextDecoder("latin1").decode(bytes), regions = [], re = /\/Redact\s+(BMC|BDC)/g;
      let m;
      while ((m = re.exec(text)) !== null) {
        const begin = m.index, tail = text.indexOf("EMC", re.lastIndex);
        regions.push({
          beginOffset: begin,
          endOffset: tail < 0 ? null : tail + 3,
          kind: m[1]
        });
        if (tail >= 0)
          re.lastIndex = tail + 3;
      }
      return { regions };
    }
    function toRect(v) {
      if (!v || v.type !== "array")
        return null;
      const out = [];
      for (const it of v.items) {
        if (!it || it.type !== "int" && it.type !== "real")
          return null;
        out.push(it.value);
      }
      return out;
    }
    function toNumArray(v) {
      if (!v || v.type !== "array")
        return null;
      const out = [];
      for (const it of v.items) {
        if (!it || it.type !== "int" && it.type !== "real")
          return null;
        out.push(it.value);
      }
      return out;
    }
    function toRefArray(v) {
      if (!v || v.type !== "array")
        return null;
      return v.items.slice();
    }
    function toMarkedRegions(v) {
      if (!v)
        return null;
      if (v.type !== "array")
        return null;
      return v.items.slice();
    }
    return {
      typeRedactionRecord,
      findRedactMarkers,
      REDACT_MARKERS
    };
  } });
    __register({ name: "pdfXPrepress", dependencies: ["pdfErrors","pdfParser"], factory: function(errors, parser) {
    const { ParseError, ContractError } = errors, { isType } = parser, PDFX_PROFILES = Object.freeze({
      "X-1a:2001": { iso: "ISO 15930-1:2001", color: "cmyk+spot", flavor: "closed" },
      "X-1a:2003": { iso: "ISO 15930-4:2003", color: "cmyk+spot", flavor: "closed" },
      "X-3:2002": { iso: "ISO 15930-3:2002", color: "any", flavor: "closed" },
      "X-3:2003": { iso: "ISO 15930-6:2003", color: "any", flavor: "closed" },
      "X-4": { iso: "ISO 15930-7:2010", color: "any", flavor: "transparency" },
      "X-4p": { iso: "ISO 15930-7:2010", color: "any", flavor: "external-profile" },
      "X-5g": { iso: "ISO 15930-8:2010", color: "any", flavor: "external-graphics" },
      "X-5n": { iso: "ISO 15930-8:2010", color: "n-channel", flavor: "external-profile" },
      "X-5pg": { iso: "ISO 15930-8:2010", color: "any", flavor: "external-both" },
      "X-6": { iso: "ISO 15930-9:2020", color: "any", flavor: "pdf-2.0" }
    }), COLOR_POLICY = Object.freeze({
      None: "no transformation",
      Convert: "convert to OutputIntent profile",
      Tag: "tag with profile only",
      Embed: "embed source profile"
    });
    function typePdfXOutputIntent(dict) {
      if (!isType(dict, "dict"))
        throw new ParseError("pdf/extra/pdfx/not-dict", "OutputIntent must be a dictionary", { context: { type: dict && dict.type } });
      const e = dict.entries, s = isType(e.S, "name") ? e.S.value : null, ident = isType(e.OutputConditionIdentifier, "string") ? new TextDecoder("latin1").decode(e.OutputConditionIdentifier.value) : null, profile = profileFromIdentifier(ident);
      return {
        isPdfX: s === "GTS_PDFX",
        subtype: s,
        identifier: ident,
        profile,
        catalog: profile ? PDFX_PROFILES[profile] : null,
        raw: dict
      };
    }
    function profileFromIdentifier(s) {
      if (!s)
        return null;
      const m = s.match(/PDF\/(X-(?:1a:200[13]|3:200[23]|4p?|5(?:g|n|pg)|6))/i);
      if (!m)
        return null;
      const key = m[1].toUpperCase().replace("X-", "X-");
      for (const k of Object.keys(PDFX_PROFILES))
        if (k.toLowerCase() === key.toLowerCase())
          return k;
      return null;
    }
    function lintPdfXPage(page) {
      if (!page || !page.entries)
        throw new ParseError("pdf/extra/pdfx/lint/bad-page", "lintPdfXPage requires a typed page dict", { context: { type: typeof page } });
      const errors = [], warnings = [], e = page.entries;
      if (!e.TrimBox && !e.ArtBox)
        errors.push("page requires /TrimBox or /ArtBox");
      if (e.TrimBox && e.ArtBox)
        errors.push("page must not have both /TrimBox and /ArtBox");
      if (!e.BleedBox)
        warnings.push("page has no /BleedBox");
      return { pass: errors.length === 0, errors, warnings };
    }
    const keyTypes = (text) => Object.freeze(Object.fromEntries(text.split(" ").map((p) => p.split(":")))), OPI_TYPES = Object.freeze({
      "1.3": keyTypes("Type:name Version:num F:dict|string ID:string Comments:string Size:array CropRect:array CropFixed:array Position:array Resolution:array ColorType:name Color:array Tint:num Overprint:bool ImageType:array GrayMap:array Transparency:bool Tags:array"),
      "2.0": keyTypes("Type:name Version:num F:dict|string MainImage:string Tags:array Size:array CropRect:array Overprint:bool Inks:array|name IncludedImageDimensions:array IncludedImageQuality:num")
    }), OPI_KEYS = Object.freeze(Object.fromEntries(Object.entries(OPI_TYPES).map(([version, types]) => [version, Object.freeze(Object.keys(types))]))), OPI_READ = Object.freeze({
      name: (v) => isType(v, "name") ? v.value : void 0,
      string: (v) => isType(v, "string") ? v.value : void 0,
      num: (v) => isType(v, "int") || isType(v, "real") ? v.value : void 0,
      bool: (v) => isType(v, "bool") ? v.value : void 0,
      array: (v) => isType(v, "array") ? v : void 0,
      dict: (v) => isType(v, "dict") ? v : void 0
    });
    function opiValue(type, v) {
      if (isType(v, "ref"))
        return v;
      const alts = type.split("|");
      if (alts.length > 1) {
        if (!alts.some((t) => OPI_READ[t](v) !== void 0))
          return null;
        return isType(v, "name") ? v.value : v;
      }
      const r = OPI_READ[type](v);
      return r === void 0 ? null : r;
    }
    function opiNotDict(value) {
      return new ParseError("pdf/extra/pdfx/opi/not-dict", "an OPI dictionary must be a dictionary", { context: { type: value && value.type } });
    }
    function typeOpiDict(dict, version) {
      if (typeof version !== "string" || !Object.prototype.hasOwnProperty.call(OPI_TYPES, version))
        throw new ContractError("pdf/extra/pdfx/opi/version", "version must be '1.3' or '2.0'", { context: { version } });
      if (!isType(dict, "dict"))
        throw opiNotDict(dict);
      const types = OPI_TYPES[version], out = { raw: dict, _extras: {} };
      for (const [k, v] of Object.entries(dict.entries))
        if (Object.prototype.hasOwnProperty.call(types, k))
          out[k.toLowerCase()] = opiValue(types[k], v);
        else
          out._extras[k] = v;
      return out;
    }
    function typeOpi(dict) {
      if (!isType(dict, "dict"))
        throw opiNotDict(dict);
      const out = { raw: dict, _extras: {} };
      for (const [k, v] of Object.entries(dict.entries)) {
        if (k !== "1.3" && k !== "2.0") {
          out._extras[k] = v;
          continue;
        }
        const field = k === "1.3" ? "version13" : "version20";
        if (isType(v, "ref"))
          out[field] = v;
        else
          out[field] = isType(v, "dict") ? typeOpiDict(v, k) : null;
      }
      return out;
    }
    const PREPRESS_PART_READ = Object.freeze({
      name: (v) => isType(v, "name") ? v.value : void 0,
      string: (v) => isType(v, "string") ? v.value : void 0,
      num: (v) => isType(v, "int") || isType(v, "real") ? v.value : void 0,
      int: (v) => isType(v, "int") ? v.value : void 0,
      array: (v) => isType(v, "array") ? v : void 0,
      dict: (v) => isType(v, "dict") ? v : void 0,
      stream: (v) => isType(v, "stream") ? v : void 0
    });
    function prepressPartValue(type, v) {
      if (isType(v, "ref"))
        return v;
      for (const t of type.split("|")) {
        const r = PREPRESS_PART_READ[t](v);
        if (r !== void 0)
          return r;
      }
      return null;
    }
    const PREPRESS_PART_TYPES = Object.freeze({
      separation: keyTypes("Pages:array DeviceColorant:name|string ColorSpace:array"),
      boxColorInfo: keyTypes("CropBox:dict BleedBox:dict TrimBox:dict ArtBox:dict"),
      boxStyle: keyTypes("C:array W:num S:name D:array"),
      trapRegion: keyTypes("TP:name TZ:array"),
      outputProfileRef: keyTypes("CheckSum:string ColorantTable:array ICCVersion:string ProfileCS:string ProfileName:string URLs:array")
    }), PREPRESS_PART_KEYS = Object.freeze(Object.fromEntries(Object.entries(PREPRESS_PART_TYPES).map(([kind, types]) => [kind, Object.freeze(Object.keys(types))])));
    function typePrepressPart(dict, kind) {
      if (typeof kind !== "string" || !Object.prototype.hasOwnProperty.call(PREPRESS_PART_TYPES, kind))
        throw new ContractError("pdf/extra/pdfx/part/kind", `kind must be one of ${Object.keys(PREPRESS_PART_TYPES).join(", ")}`, { context: { kind } });
      if (!isType(dict, "dict"))
        throw new ParseError("pdf/extra/pdfx/part/not-dict", "a prepress dictionary must be a dictionary", { context: { type: dict && dict.type } });
      const types = PREPRESS_PART_TYPES[kind], out = { raw: dict, _extras: {} };
      for (const [k, v] of Object.entries(dict.entries))
        if (Object.prototype.hasOwnProperty.call(types, k))
          out[k.toLowerCase()] = prepressPartValue(types[k], v);
        else
          out._extras[k] = v;
      return out;
    }
    return {
      typePdfXOutputIntent,
      lintPdfXPage,
      typeOpi,
      typeOpiDict,
      OPI_KEYS,
      typePrepressPart,
      PREPRESS_PART_KEYS,
      PDFX_PROFILES,
      COLOR_POLICY
    };
  } });
    __register({ name: "pdfWellTagged", dependencies: ["pdfErrors","pdfParser"], factory: function(errors, _p) {
    const { ParseError } = errors, WTPDF_RULES = Object.freeze({
      "wtpdf/artifact": "decorative content must be tagged Artifact",
      "wtpdf/span/empty": "Span used as pseudo-paragraph wrapper",
      "wtpdf/table/empty": "Table must contain at least one TR",
      "wtpdf/table/row": "TR must contain TH or TD children",
      "wtpdf/list/empty": "L must contain at least one LI",
      "wtpdf/list/item": "LI should contain Lbl + LBody",
      "wtpdf/heading/jump": "heading level jump (e.g. H1 -> H3) is discouraged"
    });
    function lintWellTagged(tree) {
      if (!tree || typeof tree !== "object")
        throw new ParseError("pdf/extra/wtpdf/bad-tree", "lintWellTagged requires a structure tree object", { context: { type: typeof tree } });
      const errs = [], warnings = [];
      let lastHeading = 0;
      function walk(node) {
        if (!node || typeof node !== "object" || !node.s)
          return;
        switch (node.s) {
          case "Table":
            checkTable(node, errs);
            break;
          case "L":
            checkList(node, errs, warnings);
            break;
          case "Span":
            if (!node.role)
              warnings.push({
                rule: "wtpdf/span/empty",
                message: WTPDF_RULES["wtpdf/span/empty"]
              });
            break;
          case "Artifact":
            break;
          default:
            break;
        }
        const m = /^H([1-6])$/.exec(node.s);
        if (m) {
          const lvl = Number(m[1]);
          if (lastHeading && lvl > lastHeading + 1)
            warnings.push({
              rule: "wtpdf/heading/jump",
              message: WTPDF_RULES["wtpdf/heading/jump"],
              from: lastHeading,
              to: lvl
            });
          lastHeading = lvl;
        }
        if (Array.isArray(node.k)) {
          for (const c of node.k)
            if (c && typeof c === "object")
              walk(c);
        }
      }
      walk(tree);
      return { pass: errs.length === 0, errors: errs, warnings };
    }
    function checkTable(node, errs) {
      const rows = (node.k || []).filter((c) => c && c.s === "TR");
      if (rows.length === 0) {
        errs.push({
          rule: "wtpdf/table/empty",
          message: WTPDF_RULES["wtpdf/table/empty"]
        });
        return;
      }
      for (const tr of rows)
        if ((tr.k || []).filter((c) => c && (c.s === "TH" || c.s === "TD")).length === 0)
          errs.push({
            rule: "wtpdf/table/row",
            message: WTPDF_RULES["wtpdf/table/row"]
          });
    }
    function checkList(node, errs, warnings) {
      const items = (node.k || []).filter((c) => c && c.s === "LI");
      if (items.length === 0) {
        errs.push({
          rule: "wtpdf/list/empty",
          message: WTPDF_RULES["wtpdf/list/empty"]
        });
        return;
      }
      for (const li of items) {
        const has = { Lbl: !1, LBody: !1 };
        for (const c of li.k || []) {
          if (c && c.s === "Lbl")
            has.Lbl = !0;
          if (c && c.s === "LBody")
            has.LBody = !0;
        }
        if (!has.Lbl || !has.LBody)
          warnings.push({
            rule: "wtpdf/list/item",
            message: WTPDF_RULES["wtpdf/list/item"]
          });
      }
    }
    function checkArtifactPlacement(regions) {
      if (!Array.isArray(regions))
        throw new ParseError("pdf/extra/wtpdf/regions/bad-input", "checkArtifactPlacement requires an array", { context: { type: typeof regions } });
      const errs = [];
      for (const r of regions) {
        if (!r || typeof r !== "object")
          continue;
        if (r.tagged === !1 && r.role !== "Artifact")
          errs.push({
            rule: "wtpdf/artifact",
            message: WTPDF_RULES["wtpdf/artifact"],
            mcid: r.mcid
          });
      }
      return { pass: errs.length === 0, errors: errs, warnings: [] };
    }
    return {
      lintWellTagged,
      checkArtifactPlacement,
      WTPDF_RULES
    };
  } });
    __register({ name: "pdfOptionalContentExtended", dependencies: ["pdfErrors","pdfParser"], factory: function(errors, parser) {
    const { ParseError, ContractError } = errors, { isType } = parser, VE_OPERATORS = Object.freeze(["And", "Or", "Not"]);
    function evaluateVE(ve, on) {
      if (!ve)
        throw new ParseError("pdf/extra/ocgx/ve/null", "VE expression is null");
      if (!(on instanceof Set))
        throw new ParseError("pdf/extra/ocgx/ve/bad-state", "evaluateVE requires a Set of on refs", { context: { type: typeof on } });
      if (ve.type === "ref")
        return on.has(ve.num + " " + ve.gen);
      if (ve.type !== "array" || ve.items.length === 0)
        throw new ParseError("pdf/extra/ocgx/ve/bad-shape", "VE must be an array starting with an operator", { context: { type: ve.type } });
      const op = ve.items[0];
      if (!isType(op, "name") || !VE_OPERATORS.includes(op.value))
        throw new ParseError("pdf/extra/ocgx/ve/bad-op", "VE operator must be /And, /Or or /Not", { context: { actual: op && op.value } });
      const operands = ve.items.slice(1);
      if (op.value === "Not") {
        if (operands.length !== 1)
          throw new ParseError("pdf/extra/ocgx/ve/not-arity", "/Not requires exactly one operand");
        return !evaluateVE(operands[0], on);
      }
      if (op.value === "And")
        return operands.every((o) => evaluateVE(o, on));
      return operands.some((o) => evaluateVE(o, on));
    }
    function typeOrderTree(arr) {
      if (!arr || arr.type !== "array")
        throw new ParseError("pdf/extra/ocgx/order/not-array", "/Order must be an array", { context: { type: arr && arr.type } });
      const out = [];
      for (const it of arr.items) {
        if (!it)
          continue;
        if (it.type === "string")
          out.push({ kind: "heading", text: it.value });
        else if (it.type === "array")
          out.push({ kind: "group", children: typeOrderTree(it) });
        else if (it.type === "ref")
          out.push({ kind: "ocg", ref: { num: it.num, gen: it.gen } });
        else
          out.push({ kind: "other", value: it });
      }
      return out;
    }
    function typeRBGroups(arr) {
      if (!arr || arr.type !== "array")
        throw new ParseError("pdf/extra/ocgx/rbg/not-array", "/RBGroups must be an array", { context: { type: arr && arr.type } });
      const out = [];
      for (const grp of arr.items) {
        if (!grp || grp.type !== "array")
          throw new ParseError("pdf/extra/ocgx/rbg/bad-group", "/RBGroups entry must be an array", { context: { type: grp && grp.type } });
        const refs = [];
        for (const r of grp.items) {
          if (!r || r.type !== "ref")
            continue;
          refs.push({ num: r.num, gen: r.gen });
        }
        out.push(refs);
      }
      return out;
    }
    function classifyOcgIntent(v) {
      if (!v)
        return { view: !1, design: !1, names: [] };
      const names = [];
      if (v.type === "name")
        names.push(v.value);
      else if (v.type === "array") {
        for (const it of v.items)
          if (isType(it, "name"))
            names.push(it.value);
      } else
        throw new ParseError("pdf/extra/ocgx/intent/bad", "/Intent must be name or array of names", { context: { type: v.type } });
      return {
        view: names.includes("View"),
        design: names.includes("Design"),
        names
      };
    }
    const keyTypes = (text) => Object.freeze(Object.fromEntries(text.split(" ").map((p) => p.split(":")))), OPTIONAL_CONTENT_TYPES = Object.freeze({
      properties: keyTypes("OCGs:array D:dict Configs:array"),
      membership: keyTypes("Type:name OCGs:array|dict P:name VE:array"),
      creatorInfo: keyTypes("Creator:string Subtype:name"),
      language: keyTypes("Lang:string Preferred:name"),
      export: keyTypes("ExportState:name"),
      zoom: keyTypes("min:num max:num"),
      print: keyTypes("Subtype:name PrintState:name"),
      view: keyTypes("ViewState:name"),
      user: keyTypes("Type:name Name:array|string"),
      pageElement: keyTypes("Subtype:name")
    }), OPTIONAL_CONTENT_KEYS = Object.freeze(Object.fromEntries(Object.entries(OPTIONAL_CONTENT_TYPES).map(([kind, types]) => [kind, Object.freeze(Object.keys(types))]))), KEY_READ = Object.freeze({
      name: (v) => isType(v, "name") ? v.value : void 0,
      string: (v) => isType(v, "string") ? v.value : void 0,
      num: (v) => isType(v, "int") || isType(v, "real") ? v.value : void 0,
      array: (v) => isType(v, "array") ? v : void 0,
      dict: (v) => isType(v, "dict") ? v : void 0
    });
    function keyValue(type, v) {
      if (isType(v, "ref"))
        return v;
      for (const t of type.split("|")) {
        const r = KEY_READ[t](v);
        if (r !== void 0)
          return r;
      }
      return null;
    }
    function typeOptionalContent(dict, kind) {
      if (typeof kind !== "string" || !Object.prototype.hasOwnProperty.call(OPTIONAL_CONTENT_TYPES, kind))
        throw new ContractError("pdf/extra/oc/kind", `kind must be one of ${Object.keys(OPTIONAL_CONTENT_TYPES).join(", ")}`, { context: { kind } });
      if (!isType(dict, "dict"))
        throw new ParseError("pdf/extra/oc/not-dict", "an optional content dictionary must be a dictionary", { context: { type: dict && dict.type } });
      const types = OPTIONAL_CONTENT_TYPES[kind], out = { raw: dict, _extras: {} };
      for (const [k, v] of Object.entries(dict.entries))
        if (Object.prototype.hasOwnProperty.call(types, k))
          out[k.toLowerCase()] = keyValue(types[k], v);
        else
          out._extras[k] = v;
      return out;
    }
    return {
      evaluateVE,
      typeOrderTree,
      typeRBGroups,
      classifyOcgIntent,
      typeOptionalContent,
      OPTIONAL_CONTENT_KEYS,
      VE_OPERATORS
    };
  } });
    __register({ name: "pdfEmbeddedFilesPortfolio", dependencies: ["pdfErrors"], factory: function(errors) {
    const { ParseError, ContractError } = errors, VIEW_MODES = new Set(["D", "T", "H", "C"]), SCHEMA_SUBTYPES = new Set([
      "S",
      "D",
      "N",
      "F",
      "Desc",
      "ModDate",
      "CreationDate",
      "Size"
    ]), KNOWN_COLLECTION = new Set([
      "Type",
      "Schema",
      "D",
      "View",
      "Sort",
      "Navigator",
      "Folders",
      "Colors",
      "Split"
    ]);
    function isDict(v) {
      return v && v.type === "dict";
    }
    function isName(v) {
      return v && v.type === "name";
    }
    function isStr(v) {
      return v && v.type === "string";
    }
    function isArr(v) {
      return v && v.type === "array";
    }
    function isBool(v) {
      return v && v.type === "bool";
    }
    function isInt(v) {
      return v && v.type === "int";
    }
    function typeSchemaField(name, fieldDict) {
      if (!isDict(fieldDict))
        throw new ParseError("pdf/portfolio/bad-schema-field", "/Schema field must be a dictionary", { context: { field: name, type: fieldDict && fieldDict.type } });
      const e = fieldDict.entries, out = { name, raw: fieldDict, _extras: {} };
      if (e.Subtype) {
        if (!isName(e.Subtype) || !SCHEMA_SUBTYPES.has(e.Subtype.value))
          throw new ParseError("pdf/portfolio/bad-schema-subtype", "/Subtype on /Schema field must be one of S,D,N,F,Desc,ModDate,CreationDate,Size", { context: { field: name, actual: e.Subtype.value } });
        out.subtype = e.Subtype.value;
      }
      if (e.N) {
        if (!isStr(e.N))
          throw new ParseError("pdf/portfolio/bad-schema-n", "/N must be a string", { context: { field: name } });
        out.displayName = e.N.value;
      }
      if (e.O != null) {
        if (!isInt(e.O))
          throw new ParseError("pdf/portfolio/bad-schema-o", "/O must be an integer", { context: { field: name } });
        out.order = e.O.value;
      }
      if (e.V != null) {
        if (!isBool(e.V))
          throw new ParseError("pdf/portfolio/bad-schema-v", "/V must be boolean", { context: { field: name } });
        out.visible = e.V.value;
      }
      if (e.E != null) {
        if (!isBool(e.E))
          throw new ParseError("pdf/portfolio/bad-schema-e", "/E must be boolean", { context: { field: name } });
        out.editable = e.E.value;
      }
      if (e.Type)
        out.type = isName(e.Type) ? e.Type.value : null;
      const KNOWN = new Set(["Type", "Subtype", "N", "O", "V", "E"]);
      for (const k of Object.keys(e))
        if (!KNOWN.has(k))
          out._extras[k] = e[k];
      return out;
    }
    function typeSchema(schemaDict) {
      if (!isDict(schemaDict))
        throw new ParseError("pdf/portfolio/bad-schema", "/Schema must be a dictionary", { context: { type: schemaDict && schemaDict.type } });
      const fields = {};
      for (const [k, v] of Object.entries(schemaDict.entries)) {
        if (k === "Type" && isName(v))
          continue;
        fields[k] = typeSchemaField(k, v);
      }
      return { fields, raw: schemaDict };
    }
    function typeSort(sortDict) {
      if (!isDict(sortDict))
        throw new ParseError("pdf/portfolio/bad-sort", "/Sort must be a dictionary");
      const e = sortDict.entries, out = { raw: sortDict, _extras: {} };
      if (e.S)
        if (isName(e.S))
          out.keys = [e.S.value];
        else if (isArr(e.S)) {
          const ks = [];
          for (const it of e.S.items) {
            if (!isName(it))
              throw new ParseError("pdf/portfolio/bad-sort-s-item", "/Sort /S array items must be names");
            ks.push(it.value);
          }
          out.keys = ks;
        } else
          throw new ParseError("pdf/portfolio/bad-sort-s", "/Sort /S must be a name or array of names");
      if (e.A != null)
        if (isBool(e.A))
          out.ascending = [e.A.value];
        else if (isArr(e.A)) {
          const as = [];
          for (const it of e.A.items) {
            if (!isBool(it))
              throw new ParseError("pdf/portfolio/bad-sort-a-item", "/Sort /A array items must be booleans");
            as.push(it.value);
          }
          out.ascending = as;
        } else
          throw new ParseError("pdf/portfolio/bad-sort-a", "/Sort /A must be a bool or array of bools");
      if (e.Type)
        out.type = isName(e.Type) ? e.Type.value : null;
      for (const k of Object.keys(e))
        if (k !== "Type" && k !== "S" && k !== "A")
          out._extras[k] = e[k];
      return out;
    }
    const keyTypes = (text) => Object.freeze(Object.fromEntries(text.split(" ").map((p) => p.split(":")))), COLLECTION_PART_TYPES = Object.freeze({
      folder: keyTypes("Type:name ID:int Name:string Parent:dict Child:dict Next:dict CI:dict Desc:string CreationDate:string ModDate:string Thumb:stream Free:array"),
      colors: keyTypes("Type:name Background:array CardBackground:array CardBorder:array PrimaryText:array SecondaryText:array"),
      split: keyTypes("Type:name Direction:name Position:num"),
      subitem: keyTypes("Type:name D:string|num P:string")
    }), COLLECTION_PART_KEYS = Object.freeze(Object.fromEntries(Object.entries(COLLECTION_PART_TYPES).map(([kind, types]) => [kind, Object.freeze(Object.keys(types))]))), KEY_READ = Object.freeze({
      name: (v) => isName(v) ? v.value : void 0,
      string: (v) => isStr(v) ? v.value : void 0,
      num: (v) => v && (v.type === "int" || v.type === "real") ? v.value : void 0,
      int: (v) => isInt(v) ? v.value : void 0,
      array: (v) => isArr(v) ? v : void 0,
      dict: (v) => isDict(v) ? v : void 0,
      stream: (v) => v && v.type === "stream" ? v : void 0
    });
    function keyValue(type, v) {
      if (v && v.type === "ref")
        return v;
      for (const t of type.split("|")) {
        const r = KEY_READ[t](v);
        if (r !== void 0)
          return r;
      }
      return null;
    }
    function typeCollectionPart(dict, kind) {
      if (typeof kind !== "string" || !Object.prototype.hasOwnProperty.call(COLLECTION_PART_TYPES, kind))
        throw new ContractError("pdf/portfolio/part/kind", `kind must be one of ${Object.keys(COLLECTION_PART_TYPES).join(", ")}`, { context: { kind } });
      if (!isDict(dict))
        throw new ParseError("pdf/portfolio/part/not-dict", "a collection dictionary must be a dictionary", { context: { type: dict && dict.type } });
      const types = COLLECTION_PART_TYPES[kind], out = { raw: dict, _extras: {} };
      for (const [k, v] of Object.entries(dict.entries))
        if (Object.prototype.hasOwnProperty.call(types, k))
          out[k.toLowerCase()] = keyValue(types[k], v);
        else
          out._extras[k] = v;
      return out;
    }
    const FILE_PART_TYPES = Object.freeze({
      ef: keyTypes("F:stream UF:stream"),
      rf: keyTypes("F:array UF:array"),
      mac: keyTypes("Subtype:int Creator:int ResFork:stream"),
      target: keyTypes("R:name N:string P:int|string A:int|string T:dict")
    }), FILE_PART_KEYS = Object.freeze(Object.fromEntries(Object.entries(FILE_PART_TYPES).map(([kind, types]) => [kind, Object.freeze(Object.keys(types))])));
    function typeFilePart(dict, kind) {
      if (typeof kind !== "string" || !Object.prototype.hasOwnProperty.call(FILE_PART_TYPES, kind))
        throw new ContractError("pdf/portfolio/file-part/kind", `kind must be one of ${Object.keys(FILE_PART_TYPES).join(", ")}`, { context: { kind } });
      if (!isDict(dict))
        throw new ParseError("pdf/portfolio/file-part/not-dict", "a file part must be a dictionary", { context: { type: dict && dict.type } });
      const types = FILE_PART_TYPES[kind], out = { raw: dict, _extras: {} };
      for (const [k, v] of Object.entries(dict.entries))
        if (Object.prototype.hasOwnProperty.call(types, k))
          out[k.toLowerCase()] = keyValue(types[k], v);
        else
          out._extras[k] = v;
      return out;
    }
    function typeNavigator(nav) {
      if (nav && nav.type === "ref")
        return { ref: { num: nav.num, gen: nav.gen }, raw: nav };
      if (!isDict(nav))
        throw new ParseError("pdf/portfolio/bad-navigator", "/Navigator must be a dict or ref");
      const out = { raw: nav, entries: nav.entries }, e = nav.entries;
      if (e.Type !== void 0)
        out.type = isName(e.Type) ? e.Type.value : null;
      if (e.Layout !== void 0)
        out.layout = isName(e.Layout) ? e.Layout.value : e.Layout && e.Layout.type === "array" ? e.Layout : null;
      return out;
    }
    function typeCustomIcon(ci) {
      if (!isDict(ci) && !(ci && ci.type === "stream"))
        throw new ParseError("pdf/portfolio/bad-ci", "/CI custom icon must be dict or stream", { context: { type: ci && ci.type } });
      return { raw: ci };
    }
    function typePortfolio(collectionDict) {
      if (!isDict(collectionDict))
        throw new ParseError("pdf/portfolio/not-dict", "Collection must be a dictionary", { context: { type: collectionDict && collectionDict.type } });
      const e = collectionDict.entries;
      if (e.Type && (!isName(e.Type) || e.Type.value !== "Collection"))
        throw new ParseError("pdf/portfolio/bad-type", "/Type must be /Collection", { context: { actual: e.Type && e.Type.value } });
      const out = { raw: collectionDict, _extras: {} };
      if (e.Schema)
        out.schema = typeSchema(e.Schema);
      if (e.D) {
        if (!isStr(e.D))
          throw new ParseError("pdf/portfolio/bad-d", "/D must be a string");
        out.initialDoc = e.D.value;
      }
      if (e.View) {
        if (!isName(e.View) || !VIEW_MODES.has(e.View.value))
          throw new ParseError("pdf/portfolio/bad-view", "/View must be one of D, T, H, C", { context: { actual: e.View && e.View.value } });
        out.view = e.View.value;
      }
      if (e.Sort)
        out.sort = typeSort(e.Sort);
      if (e.Navigator)
        out.navigator = typeNavigator(e.Navigator);
      for (const k of Object.keys(e))
        if (!KNOWN_COLLECTION.has(k))
          out._extras[k] = e[k];
      return out;
    }
    function typeCollectionItem(ciDict) {
      if (!isDict(ciDict))
        throw new ParseError("pdf/portfolio/ci-not-dict", "/CI item must be a dict");
      const out = { raw: ciDict, fields: {}, _extras: {} }, t = ciDict.entries.Type;
      if (t && t.type === "name")
        out.type = t.value;
      for (const [k, v] of Object.entries(ciDict.entries)) {
        if (k === "Type")
          continue;
        if (k === "CI")
          out.customIcon = typeCustomIcon(v);
        else
          out.fields[k] = v;
      }
      return out;
    }
    return {
      typePortfolio,
      typeSchema,
      typeSchemaField,
      typeSort,
      typeNavigator,
      typeCustomIcon,
      typeCollectionItem,
      typeCollectionPart,
      COLLECTION_PART_KEYS,
      typeFilePart,
      FILE_PART_KEYS,
      VIEW_MODES,
      SCHEMA_SUBTYPES
    };
  } });
    __register({ name: "pdfAssociatedFiles2", dependencies: ["pdfErrors"], factory: function(errors) {
    const { ParseError } = errors, STANDARD_REL = new Set([
      "Source",
      "Data",
      "Alternative",
      "Supplement",
      "EncryptedPayload",
      "FormData",
      "Schema",
      "Unspecified"
    ]), CARRIER_HINTS = new Set([
      "Catalog",
      "Page",
      "XObject",
      "StructElem",
      "Annot",
      "Mark",
      "DParams"
    ]);
    function isDict(v) {
      return v && v.type === "dict";
    }
    function isName(v) {
      return v && v.type === "name";
    }
    function isArr(v) {
      return v && v.type === "array";
    }
    function isRef(v) {
      return v && v.type === "ref";
    }
    function resolveFileSpec(entry, resolveRef) {
      if (isRef(entry)) {
        if (typeof resolveRef === "function")
          return { resolved: !0, dict: resolveRef(entry), ref: { num: entry.num, gen: entry.gen } };
        return { resolved: !1, ref: { num: entry.num, gen: entry.gen } };
      }
      if (isDict(entry))
        return { resolved: !0, dict: entry };
      throw new ParseError("pdf/af2/bad-entry", "/AF entry must be a dict or indirect reference", { context: { type: entry && entry.type } });
    }
    function typeAfEntry(entry, resolveRef, index) {
      const res = resolveFileSpec(entry, resolveRef);
      if (!res.resolved)
        return { ref: res.ref, resolved: !1 };
      const dict = res.dict;
      if (!isDict(dict))
        throw new ParseError("pdf/af2/not-filespec", "resolved /AF entry must be a dict", { context: { index } });
      const e = dict.entries;
      if (e.Type && (!isName(e.Type) || e.Type.value !== "Filespec"))
        throw new ParseError("pdf/af2/bad-filespec-type", "expected /Type /Filespec", { context: { index, actual: e.Type && e.Type.value } });
      let rel = null, standard = !1;
      if (e.AFRelationship) {
        if (!isName(e.AFRelationship))
          throw new ParseError("pdf/af2/bad-relationship", "/AFRelationship must be a name", { context: { index, type: e.AFRelationship.type } });
        rel = e.AFRelationship.value;
        standard = STANDARD_REL.has(rel);
      }
      const out = {
        filespec: dict,
        relationship: rel,
        standard,
        resolved: !0
      };
      if (res.ref)
        out.ref = res.ref;
      return out;
    }
    function typeAf(afArray, opts) {
      const resolveRef = opts && opts.resolveRef, carrier = opts && opts.carrier;
      if (carrier && !CARRIER_HINTS.has(carrier))
        throw new ParseError("pdf/af2/bad-carrier", "unknown /AF carrier hint", { context: { carrier } });
      if (!isArr(afArray))
        throw new ParseError("pdf/af2/not-array", "/AF must be an array", { context: { type: afArray && afArray.type } });
      const out = [];
      for (let i = 0;i < afArray.items.length; i++)
        out.push(typeAfEntry(afArray.items[i], resolveRef, i));
      return { entries: out, carrier: carrier || null };
    }
    function isStandardRelationship(name) {
      return STANDARD_REL.has(String(name));
    }
    function listStandardRelationships() {
      return Array.from(STANDARD_REL);
    }
    return {
      typeAf,
      typeAfEntry,
      resolveFileSpec,
      isStandardRelationship,
      listStandardRelationships,
      STANDARD_REL,
      CARRIER_HINTS
    };
  } });
    __register({ name: "pdfXmpExtended", dependencies: ["pdfErrors"], factory: function(errors) {
    const { ParseError } = errors, KNOWN_NAMESPACES = {
      "http://purl.org/dc/elements/1.1/": "dc",
      "http://ns.adobe.com/xap/1.0/": "xmp",
      "http://ns.adobe.com/xap/1.0/mm/": "xmpMM",
      "http://ns.adobe.com/pdf/1.3/": "pdf",
      "http://www.aiim.org/pdfa/ns/id/": "pdfaid",
      "http://www.aiim.org/pdfua/ns/id/": "pdfuaid"
    };
    function toText(bytes) {
      if (typeof bytes === "string")
        return bytes;
      if (bytes instanceof Uint8Array)
        return new TextDecoder("utf-8").decode(bytes);
      throw new ParseError("pdf/xmp2/bad-input", "XMP input must be string or Uint8Array", { context: { type: typeof bytes } });
    }
    function parseNamespaces(attrText) {
      const map = {}, rx = /xmlns:([\w-]+)\s*=\s*"([^"]*)"/g;
      let m;
      while (m = rx.exec(attrText))
        map[m[1]] = m[2];
      return map;
    }
    function parseAttrs(attrText) {
      const out = {}, rx = /([\w:-]+)\s*=\s*"([^"]*)"/g;
      let m;
      while (m = rx.exec(attrText))
        if (!m[1].startsWith("xmlns"))
          out[m[1]] = m[2];
      return out;
    }
    function decodeEntities(s) {
      return s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
    }
    function extract(input) {
      const text = toText(input), len = text.length, tagRx = /<\/?([\w:-]+)([^>]*?)\/?>/g, stack = [{ ns: {} }], pairs = [];
      let i = 0;
      while (i < len) {
        tagRx.lastIndex = i;
        const m = tagRx.exec(text);
        if (!m)
          break;
        const start = m.index, whole = m[0], qname = m[1], attrText = m[2] || "", isClose = whole.startsWith("</"), isSelf = whole.endsWith("/>");
        if (isClose) {
          stack.pop();
          i = start + whole.length;
          continue;
        }
        const parentNs = stack[stack.length - 1].ns, newNs = Object.assign({}, parentNs, parseNamespaces(attrText)), attrs = parseAttrs(attrText);
        let prefix = null, local = qname;
        const colon = qname.indexOf(":");
        if (colon >= 0) {
          prefix = qname.slice(0, colon);
          local = qname.slice(colon + 1);
        }
        const nsUri = prefix ? newNs[prefix] : null, knownPrefix = nsUri ? KNOWN_NAMESPACES[nsUri] : null;
        let value = null;
        if (!isSelf) {
          const closeTag = `</${qname}>`, closeAt = text.indexOf(closeTag, start + whole.length);
          if (closeAt < 0)
            throw new ParseError("pdf/xmp2/unclosed-tag", `unclosed <${qname}>`, { context: { offset: start } });
          const inner = text.slice(start + whole.length, closeAt);
          if (!/<[\w]/.test(inner))
            value = decodeEntities(inner.trim());
          stack.push({ ns: newNs, qname });
          if (value !== null) {
            stack.pop();
            i = closeAt + closeTag.length;
          } else
            i = start + whole.length;
        } else
          i = start + whole.length;
        if (knownPrefix && (value !== null || Object.keys(attrs).length > 0))
          pairs.push({
            prefix: knownPrefix,
            ns: nsUri,
            localName: local,
            value,
            attrs
          });
      }
      return pairs;
    }
    function group(pairs) {
      const out = {};
      for (const p of pairs) {
        if (!out[p.prefix])
          out[p.prefix] = {};
        const bag = out[p.prefix];
        if (bag[p.localName] === void 0)
          bag[p.localName] = p.value;
        else if (Array.isArray(bag[p.localName]))
          bag[p.localName].push(p.value);
        else
          bag[p.localName] = [bag[p.localName], p.value];
      }
      return out;
    }
    function dcTitle(input) {
      const text = toText(input), bound = /xmlns:([\w-]+)\s*=\s*["']http:\/\/purl\.org\/dc\/elements\/1\.1\/["']/.exec(text), p = bound ? bound[1] : "dc", el = new RegExp("<" + p + ":title\\b[^>]*?(?:/>|>([\\s\\S]*?)</" + p + ":title>)").exec(text);
      if (!el || el[1] === void 0)
        return null;
      const items = [...el[1].matchAll(/<([\w-]+):li\b([^>]*)>([^<]*)<\/\1:li>/g)].map((m) => ({ lang: (/xml:lang\s*=\s*["']([^"']*)["']/.exec(m[2]) || [])[1], value: decodeEntities(m[3]).trim() })), pick = items.length ? (items.find((it) => it.lang === "x-default") || items[0]).value : /<[\w]/.test(el[1]) ? "" : decodeEntities(el[1]).trim();
      return pick ? pick : null;
    }
    function parsePacket(input) {
      const pairs = extract(input);
      return { pairs, grouped: group(pairs) };
    }
    return {
      parsePacket,
      dcTitle,
      extract,
      group,
      KNOWN_NAMESPACES
    };
  } });
    __register({ name: "pdfLinearizationWrite", dependencies: ["pdfErrors","pdfParser"], factory: function(errors, parser) {
    const { RenderError } = errors, { obj } = parser, LINEARIZED_KEYS = Object.freeze([
      "Linearized",
      "L",
      "H",
      "O",
      "E",
      "N",
      "T"
    ]);
    function buildLinearizedDict(p) {
      if (!p || typeof p !== "object")
        throw new RenderError("pdf/extra/linwrite/bad-params", "buildLinearizedDict requires a parameters object", { context: { type: typeof p } });
      for (const k of [
        "fileLength",
        "firstPageObj",
        "firstPageEnd",
        "pageCount",
        "mainXrefOffset"
      ])
        if (!Number.isFinite(p[k]))
          throw new RenderError("pdf/extra/linwrite/missing-" + k, "parameter " + k + " is required and must be a number", { context: { key: k, type: typeof p[k] } });
      if (!Number.isFinite(p.hintOffset) || !Number.isFinite(p.hintLength))
        throw new RenderError("pdf/extra/linwrite/missing-hint", "hintOffset and hintLength are required", { context: { hintOffset: p.hintOffset, hintLength: p.hintLength } });
      const entries = {
        Linearized: obj.real(p.version != null ? p.version : 1),
        L: obj.int(p.fileLength),
        H: obj.array([obj.int(p.hintOffset), obj.int(p.hintLength)]),
        O: obj.int(p.firstPageObj),
        E: obj.int(p.firstPageEnd),
        N: obj.int(p.pageCount),
        T: obj.int(p.mainXrefOffset)
      };
      if (p.firstPage != null)
        entries.P = obj.int(p.firstPage);
      return obj.dict(entries);
    }
    function buildHintStreamStub() {
      const dict = obj.dict({
        Length: obj.int(0),
        S: obj.int(0)
      });
      return obj.stream(dict, new Uint8Array(0));
    }
    function validateLinearizedDict(dict) {
      if (!dict || dict.type !== "dict")
        throw new RenderError("pdf/extra/linwrite/validate/not-dict", "expected a dict", { context: { type: dict && dict.type } });
      const errs = [];
      for (const k of LINEARIZED_KEYS)
        if (!dict.entries[k])
          errs.push("missing /" + k);
      const h = dict.entries.H;
      if (h && (h.type !== "array" || h.items.length < 2))
        errs.push("/H must be an array of at least 2 integers");
      return { pass: errs.length === 0, errors: errs, warnings: [] };
    }
    return {
      buildLinearizedDict,
      buildHintStreamStub,
      validateLinearizedDict,
      LINEARIZED_KEYS
    };
  } });
    __register({ name: "pdf3dRichMedia", dependencies: ["pdfErrors","pdfParser"], factory: function(errors, parser) {
    const { ParseError, ContractError } = errors, { isType } = parser, THREE_D_KNOWN = new Set([
      "Type",
      "Subtype",
      "Rect",
      "3DD",
      "3DV",
      "3DA",
      "3DI",
      "3DB"
    ]), RM_KNOWN = new Set([
      "Type",
      "Subtype",
      "Rect",
      "RichMediaContent",
      "RichMediaSettings"
    ]), RM_INSTANCE_STATES = Object.freeze({
      A: "active",
      L: "loaded",
      U: "uninstantiated"
    }), ACTIVATION_CONDITIONS = Object.freeze({
      XA: "explicit activate",
      PO: "page open",
      PV: "page visible"
    });
    function type3DAnnot(dict) {
      if (!isType(dict, "dict"))
        throw new ParseError("pdf/extra/3d/not-dict", "3D annotation must be a dictionary", { context: { type: dict && dict.type } });
      const e = dict.entries;
      if (e.Subtype && (e.Subtype.type !== "name" || e.Subtype.value !== "3D"))
        throw new ParseError("pdf/extra/3d/bad-subtype", "/Subtype must be /3D", { context: { actual: e.Subtype.value } });
      if (!e["3DD"])
        throw new ParseError("pdf/extra/3d/missing-3dd", "3D annotation requires /3DD entry");
      const out = {
        threeDD: e["3DD"],
        threeDV: e["3DV"] || null,
        threeDA: isType(e["3DA"], "dict") ? type3DActivation(e["3DA"]) : null,
        threeDI: isType(e["3DI"], "bool") ? e["3DI"].value : null,
        threeDB: e["3DB"] || null,
        raw: dict,
        _extras: {}
      };
      for (const k of Object.keys(e))
        if (!THREE_D_KNOWN.has(k))
          out._extras[k] = e[k];
      return out;
    }
    function type3DActivation(dict) {
      if (!isType(dict, "dict"))
        throw new ParseError("pdf/extra/3d/act/not-dict", "/3DA must be a dictionary", { context: { type: dict && dict.type } });
      const e = dict.entries;
      return {
        a: isType(e.A, "name") ? e.A.value : null,
        ais: isType(e.AIS, "name") ? e.AIS.value : null,
        d: isType(e.D, "name") ? e.D.value : null,
        dis: isType(e.DIS, "name") ? e.DIS.value : null,
        tb: isType(e.TB, "bool") ? e.TB.value : null,
        np: isType(e.NP, "bool") ? e.NP.value : null,
        style: isType(e.Style, "name") ? e.Style.value : null,
        window: isType(e.Window, "dict") || isType(e.Window, "ref") ? e.Window : null,
        transparent: isType(e.Transparent, "bool") ? e.Transparent.value : null,
        raw: dict
      };
    }
    function typeRichMediaAnnot(dict) {
      if (!isType(dict, "dict"))
        throw new ParseError("pdf/extra/rm/not-dict", "RichMedia annotation must be a dictionary", { context: { type: dict && dict.type } });
      const e = dict.entries;
      if (e.Subtype && (e.Subtype.type !== "name" || e.Subtype.value !== "RichMedia"))
        throw new ParseError("pdf/extra/rm/bad-subtype", "/Subtype must be /RichMedia", { context: { actual: e.Subtype.value } });
      if (!e.RichMediaContent)
        throw new ParseError("pdf/extra/rm/missing-content", "RichMedia annotation requires /RichMediaContent");
      const out = {
        content: isType(e.RichMediaContent, "dict") ? typeRichMediaContent(e.RichMediaContent) : e.RichMediaContent,
        settings: isType(e.RichMediaSettings, "dict") ? e.RichMediaSettings : null,
        raw: dict,
        _extras: {}
      };
      for (const k of Object.keys(e))
        if (!RM_KNOWN.has(k))
          out._extras[k] = e[k];
      return out;
    }
    function typeRichMediaContent(dict) {
      if (!isType(dict, "dict"))
        throw new ParseError("pdf/extra/rm/content/not-dict", "/RichMediaContent must be a dictionary", { context: { type: dict && dict.type } });
      const e = dict.entries;
      return {
        ...e.Type ? { type: isType(e.Type, "name") ? e.Type.value : null } : {},
        assets: e.Assets || null,
        configurations: e.Configurations || null,
        views: e.Views || null,
        raw: dict
      };
    }
    function classifyRmInstanceState(name) {
      if (name == null)
        return null;
      if (typeof name !== "string")
        throw new ParseError("pdf/extra/rm/state/bad", "state must be a string", { context: { type: typeof name } });
      return RM_INSTANCE_STATES[name] || null;
    }
    const keyList = (text) => Object.freeze(text.split(" ")), MEASURE_KEYS = Object.freeze({
      RD3: keyList("Type Subtype TRL AP A1 A2 N2 A3 A4 TP TX TY EL TS C V U P UT SC R S"),
      AD3: keyList("Type Subtype TRL AP A1 D1 N1 A2 D2 N2 TP TX TY TS C V P UT DR S"),
      PD3: keyList("Type Subtype TRL AP A1 D1 N1 A2 N2 TP TY TS C V U P UT S"),
      LD3: keyList("Type Subtype TRL AP A1 N1 A2 N2 TP TY TS C V U P UT S"),
      "3DC": keyList("Type Subtype TRL A1 N1 TP TB TS C UT S")
    }), MEASURE_TEXT = new Set(["TRL", "N1", "N2", "U", "UT"]), MEASURE_NUMBER = new Set(["EL", "TS", "V"]), MEASURE_BOOL = new Set(["SC", "R", "DR"]), MEASURE_DICT = new Set(["S"]);
    function measureValue(k, v) {
      if (k === "Type" || k === "Subtype")
        return isType(v, "name") ? v.value : null;
      if (MEASURE_TEXT.has(k))
        return isType(v, "string") ? v.value : null;
      if (MEASURE_NUMBER.has(k))
        return isType(v, "int") || isType(v, "real") ? v.value : null;
      if (k === "P")
        return isType(v, "int") ? v.value : null;
      if (MEASURE_BOOL.has(k))
        return isType(v, "bool") ? v.value : null;
      if (MEASURE_DICT.has(k))
        return isType(v, "dict") || isType(v, "ref") ? v : null;
      return isType(v, "array") || isType(v, "ref") ? v : null;
    }
    function type3DMeasure(dict) {
      if (!isType(dict, "dict"))
        throw new ParseError("pdf/extra/3d/measure/not-dict", "a 3D measurement must be a dictionary", { context: { type: dict && dict.type } });
      const e = dict.entries, subtype = isType(e.Subtype, "name") ? e.Subtype.value : null, keys = subtype && Object.prototype.hasOwnProperty.call(MEASURE_KEYS, subtype) ? MEASURE_KEYS[subtype] : null;
      if (!keys)
        throw new ParseError("pdf/extra/3d/measure/bad-subtype", "/Subtype must be RD3, AD3, PD3, LD3 or 3DC", { context: { actual: subtype } });
      const out = { raw: dict, _extras: {} };
      for (const [k, v] of Object.entries(e))
        if (keys.includes(k))
          out[k.toLowerCase()] = measureValue(k, v);
        else
          out._extras[k] = v;
      return out;
    }
    const keyTypes = (text) => Object.freeze(Object.fromEntries(text.split(" ").map((p) => p.split(":")))), SCENE_TYPES = Object.freeze({
      view: keyTypes("Type:name XN:text IN:text MS:name MA:array C2W:array U3DPath:array|text CO:number P:dict O:stream BG:dict RM:dict LS:dict SA:array NA:array NR:bool Snapshot:stream Params:array"),
      crossSection: keyTypes("Type:name C:array O:array PO:number PC:array IV:bool PV:bool IC:array ST:bool SC:bool"),
      node: keyTypes("Type:name N:text O:number V:bool M:array Instance:dict Data:stream|text RM:dict"),
      renderMode: keyTypes("Type:name Subtype:name AC:array FC:array|name O:number CV:number"),
      background: keyTypes("Type:name Subtype:name CS:name C:array EA:bool"),
      lightingScheme: keyTypes("Type:name Subtype:name"),
      units: keyTypes("TSm:number TSn:number TU:text USm:number USn:number UU:text DSm:number DSn:number DU:text"),
      stream: keyTypes("Type:name Subtype:name VA:array DV:dict|int|name|text Resources:dict OnInstantiate:stream AN:dict ColorSpace:array|name"),
      animationStyle: keyTypes("Type:name Subtype:name PC:int TM:number"),
      reference: keyTypes("Type:name 3DD:stream"),
      projection: keyTypes("Subtype:name CS:name F:number N:number FOV:number PS:name|number OS:number OB:name"),
      markup: keyTypes("Type:name Subtype:name 3DA:dict|text 3DV:dict MD5:text"),
      measureRef: keyTypes("Type:name Subtype:name M3DREF:dict")
    }), STREAM_KEYS = new Set(["Length", "Filter", "DecodeParms", "F", "FFilter", "FDecodeParms", "DL"]), SCENE_KEYS = Object.freeze(Object.fromEntries(Object.entries(SCENE_TYPES).map(([kind, types]) => [kind, Object.freeze(Object.keys(types))]))), KEY_READ = Object.freeze({
      name: (v) => isType(v, "name") ? v.value : void 0,
      text: (v) => isType(v, "string") ? v.value : void 0,
      number: (v) => isType(v, "int") || isType(v, "real") ? v.value : void 0,
      int: (v) => isType(v, "int") ? v.value : void 0,
      bool: (v) => isType(v, "bool") ? v.value : void 0,
      array: (v) => isType(v, "array") || isType(v, "ref") ? v : void 0,
      dict: (v) => isType(v, "dict") || isType(v, "ref") ? v : void 0,
      stream: (v) => isType(v, "stream") || isType(v, "ref") ? v : void 0
    });
    function keyValue(type, v) {
      for (const t of type.split("|")) {
        const r = KEY_READ[t](v);
        if (r !== void 0)
          return r;
      }
      return null;
    }
    function type3DScene(value, kind) {
      if (typeof kind !== "string" || !Object.prototype.hasOwnProperty.call(SCENE_TYPES, kind))
        throw new ContractError("pdf/extra/3d/scene/kind", `kind must be one of ${Object.keys(SCENE_TYPES).join(", ")}`, { context: { kind } });
      const streamed = isType(value, "stream"), dict = streamed ? value.dict : value;
      if (!isType(dict, "dict"))
        throw new ParseError("pdf/extra/3d/scene/not-dict", "a 3D view or scene dictionary must be a dictionary or a stream", { context: { type: value && value.type } });
      const types = SCENE_TYPES[kind], out = { raw: value, _extras: {} };
      for (const [k, v] of Object.entries(dict.entries))
        if (Object.prototype.hasOwnProperty.call(types, k))
          out[k.toLowerCase()] = keyValue(types[k], v);
        else if (!(streamed && STREAM_KEYS.has(k)))
          out._extras[k] = v;
      return out;
    }
    const RICH_MEDIA_TYPES = Object.freeze({
      activation: keyTypes("Type:name Condition:name Animation:dict View:dict Configuration:dict Presentation:dict Scripts:array"),
      animation: keyTypes("Type:name Subtype:name PlayCount:int Speed:number"),
      command: keyTypes("Type:name C:text A:array|bool|int|number|text"),
      configuration: keyTypes("Type:name Subtype:name Name:text Instances:array"),
      deactivation: keyTypes("Type:name Condition:name"),
      height: keyTypes("Default:int Max:int Min:int"),
      instance: keyTypes("Type:name Subtype:name Asset:dict"),
      position: keyTypes("Type:name HAlign:name VAlign:name HOffset:number VOffset:number"),
      presentation: keyTypes("Type:name Style:name Window:dict Transparent:bool NavigationPane:bool Toolbar:bool PassContextClick:bool"),
      settings: keyTypes("Type:name Activation:dict Deactivation:dict"),
      width: keyTypes("Default:int Max:int Min:int"),
      window: keyTypes("Type:name Width:dict Height:dict Position:dict")
    }), RICH_MEDIA_KEYS = Object.freeze(Object.fromEntries(Object.entries(RICH_MEDIA_TYPES).map(([kind, types]) => [kind, Object.freeze(Object.keys(types))])));
    function typeRichMedia(dict, kind) {
      if (typeof kind !== "string" || !Object.prototype.hasOwnProperty.call(RICH_MEDIA_TYPES, kind))
        throw new ContractError("pdf/extra/rm/dict/kind", `kind must be one of ${Object.keys(RICH_MEDIA_TYPES).join(", ")}`, { context: { kind } });
      if (!isType(dict, "dict"))
        throw new ParseError("pdf/extra/rm/dict/not-dict", "a RichMedia dictionary must be a dictionary", { context: { type: dict && dict.type } });
      const types = RICH_MEDIA_TYPES[kind], out = { raw: dict, _extras: {} };
      for (const [k, v] of Object.entries(dict.entries))
        if (Object.prototype.hasOwnProperty.call(types, k))
          out[k.toLowerCase()] = keyValue(types[k], v);
        else
          out._extras[k] = v;
      return out;
    }
    return {
      type3DAnnot,
      type3DActivation,
      type3DMeasure,
      MEASURE_KEYS,
      type3DScene,
      SCENE_KEYS,
      typeRichMedia,
      RICH_MEDIA_KEYS,
      typeRichMediaAnnot,
      typeRichMediaContent,
      classifyRmInstanceState,
      RM_INSTANCE_STATES,
      ACTIVATION_CONDITIONS
    };
  } });
    __register({ name: "pdfJbig2Read", dependencies: ["pdfErrors"], factory: function(errors) {
    const { ParseError } = errors, SEGMENT_TYPES = {
      0: "symbolDictionary",
      4: "intermediateTextRegion",
      6: "immediateTextRegion",
      7: "immediateLosslessTextRegion",
      16: "patternDictionary",
      20: "intermediateHalftoneRegion",
      22: "immediateHalftoneRegion",
      23: "immediateLosslessHalftoneRegion",
      36: "intermediateGenericRegion",
      38: "immediateGenericRegion",
      39: "immediateLosslessGenericRegion",
      40: "intermediateGenericRefinementRegion",
      42: "immediateGenericRefinementRegion",
      43: "immediateLosslessGenericRefinementRegion",
      48: "pageInformation",
      49: "endOfPage",
      50: "endOfStripe",
      51: "endOfFile",
      52: "profiles",
      53: "tables",
      62: "extension"
    };
    function readUint32BE(b, o) {
      return b[o] * 16777216 + (b[o + 1] << 16 | b[o + 2] << 8 | b[o + 3]);
    }
    function readReferredSegmentCount(b, o) {
      const small = b[o] >>> 5;
      if (small !== 7)
        return { count: small, fieldBytes: 1 };
      return { count: readUint32BE(b, o) & 536870911, fieldBytes: 4 };
    }
    function refSegSize(count) {
      return Math.ceil((count + 1) / 8);
    }
    function refNumberSize(maxSegNum) {
      if (maxSegNum <= 255)
        return 1;
      if (maxSegNum <= 65535)
        return 2;
      return 4;
    }
    function parseSegments(bytes) {
      if (!(bytes instanceof Uint8Array))
        throw new ParseError("pdf/jbig2/bad-input", "JBIG2Decode expects Uint8Array");
      const out = [];
      let o = 0, lastSegNum = 0;
      while (o + 11 <= bytes.length) {
        const start = o, segNum = readUint32BE(bytes, o);
        o += 4;
        const flags = bytes[o++], type = flags & 63, retainBit = flags >> 6 & 1, deferredNonRetainBit = flags >> 7 & 1, ref = readReferredSegmentCount(bytes, o);
        o += ref.fieldBytes;
        o += refSegSize(ref.count);
        const rns = refNumberSize(Math.max(segNum, lastSegNum));
        o += ref.count * rns;
        if (o + 4 > bytes.length)
          throw new ParseError("pdf/jbig2/truncated-header", "JBIG2 segment header truncated", { context: { segNum, offset: start } });
        o += 1;
        if (o + 4 > bytes.length)
          throw new ParseError("pdf/jbig2/truncated-data-length", "JBIG2 segment data length truncated", { context: { segNum, offset: start } });
        const dataLength = readUint32BE(bytes, o);
        o += 4;
        const dataStart = o;
        if (dataLength !== 4294967295) {
          if (dataStart + dataLength > bytes.length)
            throw new ParseError("pdf/jbig2/truncated-data", "JBIG2 segment data truncated", { context: { segNum, dataLength } });
          o = dataStart + dataLength;
        } else
          o = bytes.length;
        out.push({
          segmentNumber: segNum,
          type,
          typeName: SEGMENT_TYPES[type] || "unknown",
          referredCount: ref.count,
          retain: !!retainBit,
          deferredNonRetain: !!deferredNonRetainBit,
          dataOffset: dataStart,
          dataLength: dataLength === 4294967295 ? null : dataLength,
          unknownLength: dataLength === 4294967295
        });
        lastSegNum = Math.max(lastSegNum, segNum);
        if (type === 51)
          break;
      }
      return out;
    }
    function enumerateGenericRegions(bytes) {
      return parseSegments(bytes).filter((s) => s.type === 36 || s.type === 38 || s.type === 39);
    }
    function decode(_bytes) {
      throw new ParseError("pdf/jbig2/not-implemented", "JBIG2Decode full decode not implemented \u2014 header-only", { context: { status: "partial" } });
    }
    return {
      parseSegments,
      enumerateGenericRegions,
      decode,
      SEGMENT_TYPES,
      STATUS: "partial \u2014 header-only"
    };
  } });
    __register({ name: "pdfMisc", dependencies: ["pdfErrors"], factory: function(errors) {
    const { ParseError, ContractError } = errors, REQUIREMENT_S_VALUES = new Set([
      "3DMarkup",
      "AcroFormInteract",
      "Action",
      "Attachment",
      "AttachmentEditing",
      "Collection",
      "CollectionEditing",
      "DPartInteract",
      "DigSig",
      "DigSigMDP",
      "DigSigValidation",
      "EnableJavaScripts",
      "Encryption",
      "Geospatial2D",
      "Geospatial3D",
      "Markup",
      "Multimedia",
      "Navigation",
      "OCAutoStates",
      "OCInteract",
      "PRC",
      "RichMedia",
      "STEP",
      "SeparationSimulation",
      "Transitions",
      "U3D",
      "glTF"
    ]);
    function isDict(v) {
      return v && v.type === "dict";
    }
    function isName(v) {
      return v && v.type === "name";
    }
    function isArr(v) {
      return v && v.type === "array";
    }
    function isBool(v) {
      return v && v.type === "bool";
    }
    function isInt(v) {
      return v && v.type === "int";
    }
    function isRef(v) {
      return v && v.type === "ref";
    }
    function typeSpiderInfo(dict) {
      if (!isDict(dict))
        throw new ParseError("pdf/misc/spider-not-dict", "/SpiderInfo must be a dict");
      const e = dict.entries, out = { raw: dict, _extras: {} };
      if (e.V) {
        if (!isInt(e.V) && !(e.V && e.V.type === "real"))
          throw new ParseError("pdf/misc/spider-bad-V", "/SpiderInfo /V must be numeric");
        out.version = e.V.value;
      }
      if (e.C) {
        if (!isArr(e.C))
          throw new ParseError("pdf/misc/spider-bad-C", "/SpiderInfo /C must be an array");
        out.commands = e.C.items;
      }
      const KNOWN = new Set(["V", "C"]);
      for (const k of Object.keys(e))
        if (!KNOWN.has(k))
          out._extras[k] = e[k];
      return out;
    }
    function typeThreads(arr) {
      if (!isArr(arr))
        throw new ParseError("pdf/misc/threads-not-array", "/Threads must be an array");
      const out = [];
      for (let i = 0;i < arr.items.length; i++) {
        const it = arr.items[i];
        if (it.type !== "ref" && !isDict(it))
          throw new ParseError("pdf/misc/thread-bad-entry", "/Threads entry must be a dict or ref", { context: { index: i } });
        out.push(it);
      }
      return out;
    }
    function typeLegal(dict) {
      if (!isDict(dict))
        throw new ParseError("pdf/misc/legal-not-dict", "/Legal must be a dict");
      const e = dict.entries, out = { raw: dict, flags: {}, _extras: {} }, KNOWN_FLAGS = new Set([
        "JavaScriptActions",
        "LaunchActions",
        "URIActions",
        "MovieActions",
        "SoundActions",
        "HiddenAnnotations",
        "NonEmbeddedFonts",
        "DevDepGS_OP",
        "DevDepGS_HT",
        "DevDepGS_TR",
        "DevDepGS_UCR",
        "DevDepGS_FL",
        "DevDepGS_BG",
        "Annotations",
        "ExternalRefXobjects",
        "ExternalOPIdicts",
        "ExternalStreams",
        "TrueTypeFonts",
        "AlternateImages"
      ]);
      for (const [k, v] of Object.entries(e))
        if (KNOWN_FLAGS.has(k)) {
          if (!isInt(v))
            throw new ParseError("pdf/misc/legal-bad-flag", `/Legal /${k} must be an integer count`, { context: { key: k } });
          out.flags[k] = v.value;
        } else if (k === "Attestation") {
          if (v.type !== "string")
            throw new ParseError("pdf/misc/legal-bad-attestation", "/Attestation must be a string");
          out.attestation = v.value;
        } else if ((k === "HideAnnotationActions" || k === "GoToRemoteActions") && isInt(v))
          out.flags[k] = v.value;
        else if (k === "OptionalContent" && isBool(v))
          out.optionalContent = v.value;
        else
          out._extras[k] = v;
      return out;
    }
    function typeRequirements(arr) {
      if (!isArr(arr))
        throw new ParseError("pdf/misc/req-not-array", "/Requirements must be an array");
      const out = [];
      for (let i = 0;i < arr.items.length; i++) {
        const it = arr.items[i];
        if (!isDict(it))
          throw new ParseError("pdf/misc/req-bad-entry", "/Requirements entry must be a dict", { context: { index: i } });
        const e = it.entries;
        if (!e.S || !isName(e.S))
          throw new ParseError("pdf/misc/req-missing-S", "/Requirements entry needs /S name", { context: { index: i } });
        const entry = {
          raw: it,
          s: e.S.value,
          standard: REQUIREMENT_S_VALUES.has(e.S.value),
          rh: e.RH
        };
        if (e.Type)
          entry.type = isName(e.Type) ? e.Type.value : null;
        if (e.V)
          entry.v = isName(e.V) ? e.V.value : isDict(e.V) || isRef(e.V) ? e.V : null;
        if (e.Penalty)
          entry.penalty = isInt(e.Penalty) ? e.Penalty.value : null;
        if (e.DigSig)
          entry.digSig = isDict(e.DigSig) || isRef(e.DigSig) ? e.DigSig : null;
        if (e.Encrypt)
          entry.encrypt = isDict(e.Encrypt) || isRef(e.Encrypt) ? e.Encrypt : null;
        out.push(entry);
      }
      return out;
    }
    function typeRequirementHandler(dict) {
      if (!isDict(dict))
        throw new ParseError("pdf/misc/req-handler-not-dict", "a requirement handler must be a dictionary");
      const e = dict.entries, out = {
        type: isName(e.Type) ? e.Type.value : null,
        s: isName(e.S) ? e.S.value : null,
        script: e.Script && e.Script.type === "string" ? e.Script.value : null,
        raw: dict,
        _extras: {}
      };
      for (const k of Object.keys(e))
        if (k !== "Type" && k !== "S" && k !== "Script")
          out._extras[k] = e[k];
      return out;
    }
    function typeDocMdpParams(dict) {
      if (!isDict(dict))
        throw new ParseError("pdf/misc/docmdp-not-dict", "/DocMDP transform params must be a dict");
      const e = dict.entries, out = { raw: dict, _extras: {} };
      if (e.P) {
        if (!isInt(e.P) || e.P.value < 1 || e.P.value > 3)
          throw new ParseError("pdf/misc/docmdp-bad-P", "/DocMDP /P must be 1, 2, or 3");
        out.permission = e.P.value;
      }
      if (e.V) {
        if (!isName(e.V))
          throw new ParseError("pdf/misc/docmdp-bad-V", "/DocMDP /V must be a name");
        out.version = e.V.value;
      }
      if (isName(e.Type))
        out.type = e.Type.value;
      const KNOWN = new Set(["Type", "P", "V"]);
      for (const k of Object.keys(e))
        if (!KNOWN.has(k))
          out._extras[k] = e[k];
      return out;
    }
    function typePerms(dict) {
      if (!isDict(dict))
        throw new ParseError("pdf/misc/perms-not-dict", "/Perms must be a dict");
      const e = dict.entries, out = { raw: dict, _extras: {} };
      if (e.DocMDP)
        out.docMDP = e.DocMDP;
      if (e.UR3)
        out.ur3 = e.UR3;
      if (e.UR)
        out.ur = e.UR;
      const KNOWN = new Set(["DocMDP", "UR3", "UR"]);
      for (const k of Object.keys(e))
        if (!KNOWN.has(k))
          out._extras[k] = e[k];
      return out;
    }
    function typeNeedsRendering(v) {
      if (!isBool(v))
        throw new ParseError("pdf/misc/needsrendering-bad", "/NeedsRendering must be boolean");
      return v.value;
    }
    const VIEWER_PREFS = [
      ["HideToolbar", "hideToolbar", "bool", !1],
      ["HideMenubar", "hideMenubar", "bool", !1],
      ["HideWindowUI", "hideWindowUI", "bool", !1],
      ["FitWindow", "fitWindow", "bool", !1],
      ["CenterWindow", "centerWindow", "bool", !1],
      ["DisplayDocTitle", "displayDocTitle", "bool", !1],
      ["NonFullScreenPageMode", "nonFullScreenPageMode", "name", "UseNone"],
      ["Direction", "direction", "name", "L2R"],
      ["ViewArea", "viewArea", "name", "CropBox"],
      ["ViewClip", "viewClip", "name", "CropBox"],
      ["PrintArea", "printArea", "name", "CropBox"],
      ["PrintClip", "printClip", "name", "CropBox"],
      ["PrintScaling", "printScaling", "name", "AppDefault"],
      ["Duplex", "duplex", "name", null],
      ["PickTrayByPDFSize", "pickTrayByPDFSize", "bool", !1]
    ], VIEWER_PREFS_KNOWN = new Set([
      ...VIEWER_PREFS.map((p) => p[0]),
      "PrintPageRange",
      "NumCopies",
      "Enforce"
    ]);
    function typeViewerPreferences(dict) {
      if (!isDict(dict))
        throw new ParseError("pdf/misc/viewer-prefs-not-dict", "/ViewerPreferences must be a dict");
      const e = dict.entries, out = {};
      for (const [key, field, kind, dflt] of VIEWER_PREFS) {
        const v = e[key];
        out[field] = (kind === "bool" ? isBool(v) : isName(v)) ? v.value : dflt;
      }
      const range = e.PrintPageRange;
      out.printPageRange = isArr(range) && range.items.length % 2 === 0 && range.items.every(isInt) ? range.items.reduce((acc, it, i) => {
        if (i % 2 === 0)
          acc.push([it.value]);
        else
          acc[acc.length - 1].push(it.value);
        return acc;
      }, []) : null;
      out.numCopies = isInt(e.NumCopies) && e.NumCopies.value > 0 ? e.NumCopies.value : null;
      out.enforce = isArr(e.Enforce) && e.Enforce.items.every(isName) ? e.Enforce.items.map((it) => it.value) : null;
      out.raw = dict;
      out._extras = {};
      for (const k of Object.keys(e))
        if (!VIEWER_PREFS_KNOWN.has(k))
          out._extras[k] = e[k];
      return out;
    }
    const keyTypes = (text) => Object.freeze(Object.fromEntries(text.split(" ").map((p) => p.split(":")))), MEASUREMENT_TYPES = Object.freeze({
      rectilinear: keyTypes("Type:name Subtype:name R:text X:array Y:array D:array A:array T:array S:array O:array CYX:number"),
      geospatial: keyTypes("Type:name Subtype:name Bounds:array GCS:dict DCS:dict PDU:array GPTS:array LPTS:array PCSM:array"),
      numberFormat: keyTypes("Type:name U:text C:number F:name D:int FD:bool RT:text RD:text PS:text SS:text O:name"),
      viewport: keyTypes("Type:name BBox:array Name:text Measure:dict PtData:dict"),
      pointData: keyTypes("Type:name Subtype:name Names:array XPTS:array"),
      geographicCS: keyTypes("Type:name EPSG:int WKT:text"),
      projectedCS: keyTypes("Type:name EPSG:int WKT:text"),
      markupGeo: keyTypes("Type:name Subtype:name")
    }), MEASUREMENT_KEYS = Object.freeze(Object.fromEntries(Object.entries(MEASUREMENT_TYPES).map(([kind, types]) => [kind, Object.freeze(Object.keys(types))]))), MEASUREMENT_READ = Object.freeze({
      name: (v) => isName(v) ? v.value : null,
      text: (v) => v && v.type === "string" ? v.value : null,
      number: (v) => v && (v.type === "int" || v.type === "real") ? v.value : null,
      int: (v) => isInt(v) ? v.value : null,
      bool: (v) => isBool(v) ? v.value : null,
      array: (v) => isArr(v) || isRef(v) ? v : null,
      dict: (v) => isDict(v) || isRef(v) ? v : null,
      stream: (v) => v && (v.type === "stream" || v.type === "ref") ? v : null,
      any: (v) => v === void 0 ? null : v
    });
    function readKey(type, v) {
      if (isRef(v))
        return v;
      for (const t of type.split("|")) {
        const r = MEASUREMENT_READ[t](v);
        if (r !== null)
          return r;
      }
      return null;
    }
    function typeMeasurement(dict, kind) {
      if (typeof kind !== "string" || !Object.prototype.hasOwnProperty.call(MEASUREMENT_TYPES, kind))
        throw new ContractError("pdf/misc/measurement/kind", `kind must be one of ${Object.keys(MEASUREMENT_TYPES).join(", ")}`, { context: { kind } });
      if (!isDict(dict))
        throw new ParseError("pdf/misc/measurement/not-dict", "a measurement dictionary must be a dictionary", { context: { type: dict && dict.type } });
      const types = MEASUREMENT_TYPES[kind], out = { raw: dict, _extras: {} };
      for (const [k, v] of Object.entries(dict.entries))
        if (Object.prototype.hasOwnProperty.call(types, k))
          out[k.toLowerCase()] = readKey(types[k], v);
        else
          out._extras[k] = v;
      return out;
    }
    const FORM_COMMON = "Type:name FormType:int Ref:dict PieceInfo:dict LastModified:text OPI:dict OC:dict Name:name AF:array Measure:dict PtData:dict", IMAGE_COMMON = "Alternates:array SMaskInData:int Name:name StructParent:int ID:text OPI:dict OC:dict AF:array Measure:dict PtData:dict", XOBJECT_ENTRY_TYPES = Object.freeze({
      image: keyTypes(`Type:name ${IMAGE_COMMON}`),
      imageMask: keyTypes(`Type:name ImageMask:bool ${IMAGE_COMMON}`),
      softMask: keyTypes("Type:name Name:name Matte:array AF:array"),
      form: keyTypes(`${FORM_COMMON} XUID:array`),
      printerMark: keyTypes(`${FORM_COMMON} MarkStyle:text Colorants:dict`),
      trapNet: keyTypes(`${FORM_COMMON} PCM:name SeparationColorNames:array TrapRegions:array TrapStyles:text`),
      ps: keyTypes("Level1:stream"),
      psPassthrough: keyTypes("Subtype2:name Level1:stream PS:stream FormType:int BBox:array Matrix:array")
    }), XOBJECT_ENTRY_KEYS = Object.freeze(Object.fromEntries(Object.entries(XOBJECT_ENTRY_TYPES).map(([kind, types]) => [kind, Object.freeze(Object.keys(types))])));
    function typeXObjectEntries(value, kind) {
      if (typeof kind !== "string" || !Object.prototype.hasOwnProperty.call(XOBJECT_ENTRY_TYPES, kind))
        throw new ContractError("pdf/misc/xobject/kind", `kind must be one of ${Object.keys(XOBJECT_ENTRY_TYPES).join(", ")}`, { context: { kind } });
      const dict = value && value.type === "stream" ? value.dict : value;
      if (!isDict(dict))
        throw new ParseError("pdf/misc/xobject/not-dict", "an XObject must be a stream or a dictionary", { context: { type: value && value.type } });
      const types = XOBJECT_ENTRY_TYPES[kind], out = { kind, raw: value };
      for (const [k, v] of Object.entries(dict.entries))
        if (Object.prototype.hasOwnProperty.call(types, k))
          out[k.toLowerCase()] = readKey(types[k], v);
      return out;
    }
    const WEB_CAPTURE_TYPES = Object.freeze({
      pageSet: keyTypes("Type:name S:name ID:text O:array SI:array|dict CT:text TS:text T:text TID:text"),
      imageSet: keyTypes("Type:name S:name ID:text O:array SI:array|dict CT:text TS:text R:array|int"),
      command: keyTypes("URL:text L:int F:int P:stream|text CT:text H:text S:dict"),
      commandSettings: keyTypes("G:dict C:dict")
    }), WEB_CAPTURE_KEYS = Object.freeze(Object.fromEntries(Object.entries(WEB_CAPTURE_TYPES).map(([kind, types]) => [kind, Object.freeze(Object.keys(types))])));
    function typeWebCapture(dict, kind) {
      if (typeof kind !== "string" || !Object.prototype.hasOwnProperty.call(WEB_CAPTURE_TYPES, kind))
        throw new ContractError("pdf/misc/web-capture/kind", `kind must be one of ${Object.keys(WEB_CAPTURE_TYPES).join(", ")}`, { context: { kind } });
      if (!isDict(dict))
        throw new ParseError("pdf/misc/web-capture/not-dict", "a Web Capture dictionary must be a dictionary", { context: { type: dict && dict.type } });
      const types = WEB_CAPTURE_TYPES[kind], out = { raw: dict, _extras: {} };
      for (const [k, v] of Object.entries(dict.entries))
        if (Object.prototype.hasOwnProperty.call(types, k))
          out[k.toLowerCase()] = readKey(types[k], v);
        else
          out._extras[k] = v;
      return out;
    }
    const FIELD_LOCK_TYPES = Object.freeze({
      lock: keyTypes("Type:name Action:name Fields:array P:number"),
      fieldMdp: keyTypes("Type:name Action:name Fields:array V:name"),
      urTransform: keyTypes("Type:name Document:array Msg:text V:name Annots:array Form:array Signature:array EF:array P:bool")
    });
    function typeFieldLock(dict, kind) {
      if (typeof kind !== "string" || !Object.prototype.hasOwnProperty.call(FIELD_LOCK_TYPES, kind))
        throw new ContractError("pdf/misc/field-lock/kind", "kind must be lock, fieldMdp or urTransform", { context: { kind } });
      if (!isDict(dict))
        throw new ParseError("pdf/misc/field-lock/not-dict", "a field lock must be a dictionary", { context: { type: dict && dict.type } });
      const types = FIELD_LOCK_TYPES[kind], out = { raw: dict, _extras: {} };
      for (const [k, v] of Object.entries(dict.entries))
        if (Object.prototype.hasOwnProperty.call(types, k))
          out[k.toLowerCase()] = readKey(types[k], v);
        else
          out._extras[k] = v;
      return out;
    }
    const PRESENTATION_TYPES = Object.freeze({
      floatingWindow: keyTypes("Type:name D:array RT:int P:int O:int T:bool UC:bool R:int TT:array"),
      transition: keyTypes("Type:name S:name D:number Dm:name M:name Di:int|name SS:number B:bool"),
      navNode: keyTypes("Type:name NA:dict PA:dict Next:dict Prev:dict Dur:number"),
      bead: keyTypes("Type:name T:dict N:dict V:dict P:dict R:array"),
      thread: keyTypes("Type:name F:dict I:dict Metadata:stream"),
      slideShow: keyTypes("Type:name Subtype:name Resources:dict StartResource:text"),
      pageLabel: keyTypes("Type:name S:name P:text St:int"),
      viewParams: keyTypes("Instance:dict Data:stream|text"),
      outlines: keyTypes("Type:name First:dict Last:dict Count:int")
    }), PRESENTATION_KEYS = Object.freeze(Object.fromEntries(Object.entries(PRESENTATION_TYPES).map(([kind, types]) => [kind, Object.freeze(Object.keys(types))])));
    function typePresentation(dict, kind) {
      if (typeof kind !== "string" || !Object.prototype.hasOwnProperty.call(PRESENTATION_TYPES, kind))
        throw new ContractError("pdf/misc/presentation/kind", "kind must be a key of PRESENTATION_KEYS", { context: { kind } });
      if (!isDict(dict))
        throw new ParseError("pdf/misc/presentation/not-dict", "a presentation dictionary must be a dictionary", { context: { type: dict && dict.type } });
      const types = PRESENTATION_TYPES[kind], out = { raw: dict, _extras: {} };
      for (const [k, v] of Object.entries(dict.entries))
        if (Object.prototype.hasOwnProperty.call(types, k))
          out[k.toLowerCase()] = readKey(types[k], v);
        else
          out._extras[k] = v;
      return out;
    }
    const CATALOG_PART_TYPES = Object.freeze({
      names: keyTypes("Dests:dict AP:dict JavaScript:dict Pages:dict Templates:dict IDS:dict URLS:dict EmbeddedFiles:dict AlternatePresentations:dict Renditions:dict"),
      extensions: keyTypes("Type:name ISO_:array|dict"),
      devExtensions: keyTypes("Type:name BaseVersion:name ExtensionLevel:int URL:text ExtensionRevision:text"),
      uri: keyTypes("Base:text")
    }), CATALOG_PART_KEYS = Object.freeze(Object.fromEntries(Object.entries(CATALOG_PART_TYPES).map(([kind, types]) => [kind, Object.freeze(Object.keys(types))])));
    function typeCatalogPart(dict, kind) {
      if (typeof kind !== "string" || !Object.prototype.hasOwnProperty.call(CATALOG_PART_TYPES, kind))
        throw new ContractError("pdf/misc/catalog-part/kind", "kind must be a key of CATALOG_PART_KEYS", { context: { kind } });
      if (!isDict(dict))
        throw new ParseError("pdf/misc/catalog-part/not-dict", "a catalog dictionary must be a dictionary", { context: { type: dict && dict.type } });
      const types = CATALOG_PART_TYPES[kind], out = { raw: dict, _extras: {} };
      for (const [k, v] of Object.entries(dict.entries))
        if (Object.prototype.hasOwnProperty.call(types, k))
          out[k.toLowerCase()] = readKey(types[k], v);
        else
          out._extras[k] = v;
      return out;
    }
    const OBJECT_ENTRY_TYPES = Object.freeze({
      thumbnail: keyTypes("Type:name Subtype:name Width:int Height:int ColorSpace:name|array BitsPerComponent:int Decode:array"),
      cmap: keyTypes("Type:name CMapName:name CIDSystemInfo:dict WMode:int UseCMap:name|stream"),
      iccProfile: keyTypes("N:int Alternate:name|array Range:array Metadata:stream"),
      pageTree: keyTypes("Type:name Parent:dict MediaBox:array CropBox:array Rotate:int"),
      resource: keyTypes("Properties:dict Encoding:dict"),
      encoding: keyTypes("Type:name"),
      trailer: keyTypes("XRefStm:int"),
      objectStream: keyTypes("Extends:stream")
    }), OBJECT_ENTRY_KEYS = Object.freeze(Object.fromEntries(Object.entries(OBJECT_ENTRY_TYPES).map(([kind, types]) => [kind, Object.freeze(Object.keys(types))])));
    function typeObjectEntries(value, kind) {
      if (typeof kind !== "string" || !Object.prototype.hasOwnProperty.call(OBJECT_ENTRY_TYPES, kind))
        throw new ContractError("pdf/misc/object-entries/kind", "kind must be a key of OBJECT_ENTRY_KEYS", { context: { kind } });
      const dict = value && value.type === "stream" ? value.dict : value;
      if (!isDict(dict))
        throw new ParseError("pdf/misc/object-entries/not-dict", "neither a stream nor a dictionary", { context: { type: value && value.type } });
      const types = OBJECT_ENTRY_TYPES[kind], out = { raw: value, _extras: {} };
      for (const [k, v] of Object.entries(dict.entries))
        if (Object.prototype.hasOwnProperty.call(types, k))
          out[k.toLowerCase()] = readKey(types[k], v);
        else
          out._extras[k] = v;
      return out;
    }
    const SMALL_OBJECT_TYPES = Object.freeze({
      alternateImage: keyTypes("Image:stream DefaultForPrinting:bool OC:dict"),
      data: keyTypes("LastModified:text Private:any"),
      destDict: keyTypes("D:array SD:array"),
      fixedPrint: keyTypes("Type:name Matrix:array H:number V:number"),
      markInfo: keyTypes("Marked:bool UserProperties:bool Suspects:bool"),
      markedContentReference: keyTypes("Type:name Pg:dict Stm:stream StmOwn:array|dict|stream MCID:int"),
      minimumBitDepth: keyTypes("Type:name V:int M:int"),
      namespace: keyTypes("Type:name NS:text Schema:dict|text RoleMapNS:dict"),
      objectReference: keyTypes("Type:name Pg:dict Obj:array|dict|stream"),
      reference: keyTypes("F:dict|text Page:int|text ID:array"),
      sourceInformation: keyTypes("AU:dict|text TS:text E:text S:int C:dict"),
      timespan: keyTypes("Type:name S:name V:number"),
      urlAlias: keyTypes("U:text C:array"),
      userProperty: keyTypes("N:text V:any F:text H:bool"),
      winLaunch: keyTypes("F:text D:text O:text P:text")
    }), SMALL_OBJECT_KEYS = Object.freeze(Object.fromEntries(Object.entries(SMALL_OBJECT_TYPES).map(([kind, types]) => [kind, Object.freeze(Object.keys(types))])));
    function typeSmallObject(value, kind) {
      if (typeof kind !== "string" || !Object.prototype.hasOwnProperty.call(SMALL_OBJECT_TYPES, kind))
        throw new ContractError("pdf/misc/small-object/kind", "kind must be a key of SMALL_OBJECT_KEYS", { context: { kind } });
      const dict = value && value.type === "stream" ? value.dict : value;
      if (!isDict(dict))
        throw new ParseError("pdf/misc/small-object/not-dict", "neither a stream nor a dictionary", { context: { type: value && value.type } });
      const types = SMALL_OBJECT_TYPES[kind], out = { raw: value, _extras: {} };
      for (const [k, v] of Object.entries(dict.entries))
        if (Object.prototype.hasOwnProperty.call(types, k))
          out[k.toLowerCase()] = readKey(types[k], v);
        else
          out._extras[k] = v;
      return out;
    }
    return {
      typeSmallObject,
      SMALL_OBJECT_KEYS,
      typeSpiderInfo,
      typeViewerPreferences,
      typeThreads,
      typeLegal,
      typeRequirements,
      typeRequirementHandler,
      typeDocMdpParams,
      typePerms,
      typeNeedsRendering,
      typeMeasurement,
      MEASUREMENT_KEYS,
      typeXObjectEntries,
      XOBJECT_ENTRY_KEYS,
      typeWebCapture,
      WEB_CAPTURE_KEYS,
      typeFieldLock,
      typePresentation,
      PRESENTATION_KEYS,
      typeCatalogPart,
      CATALOG_PART_KEYS,
      typeObjectEntries,
      OBJECT_ENTRY_KEYS,
      REQUIREMENT_S_VALUES
    };
  } });
    __register({ name: "pdfInfoDictDeprecated", dependencies: ["pdfErrors"], factory: function(errors) {
    const { ParseError } = errors, INFO_TO_XMP = {
      Title: { ns: "dc", field: "title" },
      Author: { ns: "dc", field: "creator" },
      Subject: { ns: "dc", field: "description" },
      Keywords: { ns: "pdf", field: "Keywords" },
      Creator: { ns: "xmp", field: "CreatorTool" },
      Producer: { ns: "pdf", field: "Producer" },
      CreationDate: { ns: "xmp", field: "CreateDate" },
      ModDate: { ns: "xmp", field: "ModifyDate" },
      Trapped: { ns: "pdf", field: "Trapped" }
    };
    function isDict(v) {
      return v && v.type === "dict";
    }
    function parsePdfVersion(v) {
      if (typeof v === "string")
        return v;
      if (v && v.type === "name")
        return v.value;
      if (v && v.type === "string") {
        const b = v.value;
        if (b instanceof Uint8Array)
          return new TextDecoder("latin1").decode(b);
        return String(b);
      }
      if (typeof v === "number")
        return String(v);
      throw new ParseError("pdf/info-deprecated/bad-version", "PDF version must be string or PDF name", { context: { type: v && v.type } });
    }
    function isVersion2OrHigher(versionStr) {
      const m = /^(\d+)\.(\d+)/.exec(versionStr || "");
      if (!m)
        return !1;
      return parseInt(m[1], 10) >= 2;
    }
    function suggestionsFor(infoDict) {
      if (!isDict(infoDict))
        return [];
      const out = [];
      for (const k of Object.keys(infoDict.entries)) {
        const map = INFO_TO_XMP[k];
        if (map)
          out.push({
            infoKey: k,
            xmpNamespace: map.ns,
            xmpField: map.field
          });
        else
          out.push({
            infoKey: k,
            xmpNamespace: null,
            xmpField: null,
            note: "no standard XMP equivalent"
          });
      }
      return out;
    }
    function lint(opts) {
      opts = opts || {};
      const version = parsePdfVersion(opts.version), info = opts.info, xmpPresent = !!opts.xmpPresent, warnings = [];
      if (info != null) {
        if (!isDict(info))
          throw new ParseError("pdf/info-deprecated/bad-info", "/Info must be a dict", { context: { type: info && info.type } });
      }
      const v2 = isVersion2OrHigher(version);
      if (v2 && info)
        warnings.push({
          code: "pdf/info-deprecated",
          severity: "warn",
          message: "/Info is deprecated in PDF 2.0 \u2014 use the XMP metadata stream instead",
          suggestions: suggestionsFor(info)
        });
      if (v2 && info && !xmpPresent)
        warnings.push({
          code: "pdf/info-without-xmp",
          severity: "warn",
          message: "PDF 2.0 document carries /Info but no XMP /Metadata stream"
        });
      return {
        version,
        isPdf2: v2,
        hasInfo: info != null,
        xmpPresent,
        warnings
      };
    }
    function mapInfoKey(name) {
      return INFO_TO_XMP[name] || null;
    }
    return {
      lint,
      mapInfoKey,
      suggestionsFor,
      INFO_TO_XMP,
      isVersion2OrHigher
    };
  } });
    __register({ name: "pdfSandbox", dependencies: ["pdfErrors"], factory: function(errors) {
    const { ContractError } = errors, ACTIVE_KINDS = {
      Launch: {
        severity: "error",
        message: "/Launch action present \u2014 external execution " + "requested by document"
      },
      JavaScript: {
        severity: "error",
        message: "/JavaScript action present \u2014 script " + "execution requested by document"
      },
      ImportData: {
        severity: "error",
        message: "/ImportData action present \u2014 file-system " + "read requested by document"
      },
      SubmitForm: {
        severity: "warning",
        message: "/SubmitForm action present \u2014 network " + "submission requested by document"
      },
      Rendition: {
        severity: "warning",
        message: "/Rendition action carries /JS payload"
      },
      URI: {
        severity: "warning",
        message: "/URI action present \u2014 external navigation " + "requested by document"
      }
    };
    function lintAction(rec) {
      if (!rec || typeof rec !== "object")
        return null;
      if (rec.kind === "Rendition" && !rec.sandboxed)
        return null;
      const profile = ACTIVE_KINDS[rec.kind];
      if (!profile)
        return null;
      return {
        kind: rec.kind,
        code: "pdf/sandbox/active-" + rec.kind.toLowerCase(),
        severity: profile.severity,
        message: profile.message,
        context: { sandboxed: rec.sandboxed === !0 }
      };
    }
    function lintActions(records) {
      if (!records || typeof records[Symbol.iterator] !== "function")
        throw new ContractError("pdf/sandbox/bad-input", "lintActions expects an iterable of action records");
      const issues = [];
      let hasErrors = !1;
      for (const rec of records) {
        const issue = lintAction(rec);
        if (issue) {
          issues.push(issue);
          if (issue.severity === "error")
            hasErrors = !0;
        }
      }
      return {
        sandboxed: !0,
        issues,
        hasActiveContent: issues.length > 0,
        hasErrors
      };
    }
    return {
      lintAction,
      lintActions,
      ACTIVE_KINDS
    };
  } });
    __register({ name: "pdfCryptPublicKey", dependencies: ["pdfErrors","pdfParser","pdfSigAesGcm"], factory: function(errors, parser, aesGcm) {
    const { ParseError } = errors, { isType } = parser;
    function dictOf(dict, what) {
      if (!isType(dict, "dict"))
        throw new ParseError("pdf/extra/crypt-public-key/not-dict", `${what} must be a dictionary`, { context: { type: dict && dict.type } });
      return dict.entries;
    }
    const nameOf = (v) => isType(v, "name") ? v.value : null, extrasOf = (e, known) => {
      const out = {};
      for (const k of Object.keys(e))
        if (!known.has(k))
          out[k] = e[k];
      return out;
    };
    function byteStrings(v) {
      if (isType(v, "string"))
        return [v.value];
      if (isType(v, "array"))
        return v.items.filter((i) => isType(i, "string")).map((i) => i.value);
      return null;
    }
    const PK_FILTER_KNOWN = new Set(["Recipients", "EncryptMetadata", "Type", "CFM", "AuthEvent", "Length"]);
    function typeCryptFilterPublicKey(dict) {
      const e = dictOf(dict, "a public-key crypt filter"), out = {
        recipients: byteStrings(e.Recipients),
        encryptMetadata: isType(e.EncryptMetadata, "bool") ? e.EncryptMetadata.value : !0,
        cfm: nameOf(e.CFM),
        authEvent: nameOf(e.AuthEvent),
        length: isType(e.Length, "int") ? e.Length.value : null,
        raw: dict,
        _extras: extrasOf(e, PK_FILTER_KNOWN)
      };
      if (isType(e.Type, "name"))
        out.type = e.Type.value;
      return out;
    }
    function typeMap(dict, what, typeOne) {
      const e = dictOf(dict, what), filters = {}, extras = {};
      for (const name of Object.keys(e))
        if (isType(e[name], "dict"))
          filters[name] = typeOne(e[name]);
        else
          extras[name] = e[name];
      return { filters, raw: dict, _extras: extras };
    }
    function typeCryptFilterPublicKeyMap(dict) {
      return typeMap(dict, "a public-key crypt filter map", typeCryptFilterPublicKey);
    }
    function typeCryptFilterMap(dict) {
      return typeMap(dict, "a crypt filter map", aesGcm.typeCfEntry);
    }
    const PAYLOAD_KNOWN = new Set(["Type", "Subtype", "Version"]);
    function typeEncryptedPayload(dict) {
      const e = dictOf(dict, "/EncryptedPayload"), out = {
        subtype: nameOf(e.Subtype),
        version: nameOf(e.Version),
        raw: dict,
        _extras: extrasOf(e, PAYLOAD_KNOWN)
      };
      if (isType(e.Type, "name"))
        out.type = e.Type.value;
      return out;
    }
    return { typeCryptFilterPublicKey, typeCryptFilterPublicKeyMap, typeCryptFilterMap, typeEncryptedPayload };
  } });

    const __core = __resolve("pdf");
    __core.use({ name: "pdfContentOpsExtended", register() { return { ["pdfContentOpsExtended"]: __resolve("pdfContentOpsExtended") }; } });
    __core.use({ name: "pdfFontCidTyped", register() { return { ["pdfFontCidTyped"]: __resolve("pdfFontCidTyped") }; } });
    __core.use({ name: "pdfFontColorTagging", register() { return { ["pdfFontColorTagging"]: __resolve("pdfFontColorTagging") }; } });
    __core.use({ name: "pdfTaggedPdfTyped", register() { return { ["pdfTaggedPdfTyped"]: __resolve("pdfTaggedPdfTyped") }; } });
    __core.use({ name: "pdfAnnotExtended", register() { return { ["pdfAnnotExtended"]: __resolve("pdfAnnotExtended") }; } });
    __core.use({ name: "pdfAOutputIntent", register() { return { ["pdfAOutputIntent"]: __resolve("pdfAOutputIntent") }; } });
    __core.use({ name: "pdfUaTagged", register() { return { ["pdfUaTagged"]: __resolve("pdfUaTagged") }; } });
    __core.use({ name: "pdfFormActionsExtended", register() { return { ["pdfFormActionsExtended"]: __resolve("pdfFormActionsExtended") }; } });
    __core.use({ name: "pdfColorSpacesExtended", register() { return { ["pdfColorSpacesExtended"]: __resolve("pdfColorSpacesExtended") }; } });
    __core.use({ name: "pdfShadingTyped", register() { return { ["pdfShadingTyped"]: __resolve("pdfShadingTyped") }; } });
    __core.use({ name: "pdfTransparencyTyped", register() { return { ["pdfTransparencyTyped"]: __resolve("pdfTransparencyTyped") }; } });
    __core.use({ name: "pdfSigPades", register() { return { ["pdfSigPades"]: __resolve("pdfSigPades") }; } });
    __core.use({ name: "pdfSigAesGcm", register() { return { ["pdfSigAesGcm"]: __resolve("pdfSigAesGcm") }; } });
    __core.use({ name: "pdfDocumentParts", register() { return { ["pdfDocumentParts"]: __resolve("pdfDocumentParts") }; } });
    __core.use({ name: "pdfRedactionIso32005", register() { return { ["pdfRedactionIso32005"]: __resolve("pdfRedactionIso32005") }; } });
    __core.use({ name: "pdfXPrepress", register() { return { ["pdfXPrepress"]: __resolve("pdfXPrepress") }; } });
    __core.use({ name: "pdfWellTagged", register() { return { ["pdfWellTagged"]: __resolve("pdfWellTagged") }; } });
    __core.use({ name: "pdfOptionalContentExtended", register() { return { ["pdfOptionalContentExtended"]: __resolve("pdfOptionalContentExtended") }; } });
    __core.use({ name: "pdfEmbeddedFilesPortfolio", register() { return { ["pdfEmbeddedFilesPortfolio"]: __resolve("pdfEmbeddedFilesPortfolio") }; } });
    __core.use({ name: "pdfAssociatedFiles2", register() { return { ["pdfAssociatedFiles2"]: __resolve("pdfAssociatedFiles2") }; } });
    __core.use({ name: "pdfXmpExtended", register() { return { ["pdfXmpExtended"]: __resolve("pdfXmpExtended") }; } });
    __core.use({ name: "pdfLinearizationWrite", register() { return { ["pdfLinearizationWrite"]: __resolve("pdfLinearizationWrite") }; } });
    __core.use({ name: "pdf3dRichMedia", register() { return { ["pdf3dRichMedia"]: __resolve("pdf3dRichMedia") }; } });
    __core.use({ name: "pdfJbig2Read", register() { return { ["pdfJbig2Read"]: __resolve("pdfJbig2Read") }; } });
    __core.use({ name: "pdfMisc", register() { return { ["pdfMisc"]: __resolve("pdfMisc") }; } });
    __core.use({ name: "pdfInfoDictDeprecated", register() { return { ["pdfInfoDictDeprecated"]: __resolve("pdfInfoDictDeprecated") }; } });
    __core.use({ name: "pdfSandbox", register() { return { ["pdfSandbox"]: __resolve("pdfSandbox") }; } });
    __core.use({ name: "pdfCryptPublicKey", register() { return { ["pdfCryptPublicKey"]: __resolve("pdfCryptPublicKey") }; } });
    return __core;
    }
};
