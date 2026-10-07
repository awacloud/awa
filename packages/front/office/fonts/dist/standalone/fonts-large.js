/*!
 * Copyright (c) 2026 AwaCloud SAS
 * Author: Matthieu Bouilloux
 * SPDX-License-Identifier: AGPL-3.0-only
 * Dual-licensed; see the NOTICE file for licensing and any additional terms.
 */
/* GENERATED — do not edit. Source: packages/front/office/fonts/tools/generate-bundles.mjs */

/**
 * @fileoverview `@awacloud/fonts/bundles/prebuilt/fonts-large-bundled` — pre-built single-factory bundle.
 *
 * Variant **bundled** : declares no dependencies — every fw and fonts-local
 * factory transitively reachable from `fonts` plus 2 extras is inlined.
 *
 * @module fonts/bundles/prebuilt/fonts-large-bundled
 */

export const fontsLargeBundled = {
    name: "fontsLargeBundled",
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
    __register({ name: "binaryReader", dependencies: [], factory: function() {
    const _decoder = new TextDecoder("utf-8");
    function contractError(code, msg, ctx) {
      const err = Error(msg);
      err.name = "ContractError";
      err.code = code;
      if (ctx)
        err.context = ctx;
      return err;
    }
    function create(uint8, opts) {
      if (!(uint8 instanceof Uint8Array))
        throw contractError("binary/reader-input", "binaryReader.create expects Uint8Array", { actual: typeof uint8 });
      let _endian = (opts || {}).endian === "le" ? "le" : "be";
      const _bytes = uint8, _dv = new DataView(uint8.buffer, uint8.byteOffset, uint8.byteLength), _len = uint8.byteLength;
      let _pos = 0;
      function _need(n) {
        if (_pos + n > _len)
          throw contractError("binary/reader-eof", "unexpected end of stream", {
            needed: n,
            pos: _pos,
            length: _len
          });
      }
      const le = () => _endian === "le", r = {
        get pos() {
          return _pos;
        },
        get length() {
          return _len;
        },
        eof() {
          return _pos >= _len;
        },
        tell() {
          return _pos;
        },
        seek(offset) {
          if (offset < 0 || offset > _len)
            throw contractError("binary/reader-seek", "seek out of bounds", { offset, length: _len });
          _pos = offset;
          return r;
        },
        skip(n) {
          return r.seek(_pos + n);
        },
        peek(n) {
          _need(n);
          return new Uint8Array(_bytes.buffer, _bytes.byteOffset + _pos, n);
        },
        setEndian(e) {
          if (e !== "be" && e !== "le")
            throw contractError("binary/reader-endian", 'endian must be "be" or "le"', { actual: e });
          _endian = e;
        },
        u8() {
          _need(1);
          const v = _dv.getUint8(_pos);
          _pos += 1;
          return v;
        },
        u16() {
          _need(2);
          const v = _dv.getUint16(_pos, le());
          _pos += 2;
          return v;
        },
        u24() {
          _need(3);
          let v;
          if (le())
            v = _dv.getUint8(_pos) | _dv.getUint8(_pos + 1) << 8 | _dv.getUint8(_pos + 2) << 16;
          else
            v = _dv.getUint8(_pos) << 16 | _dv.getUint8(_pos + 1) << 8 | _dv.getUint8(_pos + 2);
          _pos += 3;
          return v >>> 0;
        },
        u32() {
          _need(4);
          const v = _dv.getUint32(_pos, le());
          _pos += 4;
          return v >>> 0;
        },
        u64() {
          _need(8);
          const v = _dv.getBigUint64(_pos, le());
          _pos += 8;
          return v;
        },
        u64Safe() {
          const v = r.u64();
          if (v > BigInt(Number.MAX_SAFE_INTEGER))
            throw contractError("binary/reader-u64safe", "u64 value exceeds Number.MAX_SAFE_INTEGER", { value: v.toString() });
          return Number(v);
        },
        i8() {
          _need(1);
          const v = _dv.getInt8(_pos);
          _pos += 1;
          return v;
        },
        i16() {
          _need(2);
          const v = _dv.getInt16(_pos, le());
          _pos += 2;
          return v;
        },
        i32() {
          _need(4);
          const v = _dv.getInt32(_pos, le());
          _pos += 4;
          return v;
        },
        i64() {
          _need(8);
          const v = _dv.getBigInt64(_pos, le());
          _pos += 8;
          return v;
        },
        f32() {
          _need(4);
          const v = _dv.getFloat32(_pos, le());
          _pos += 4;
          return v;
        },
        f64() {
          _need(8);
          const v = _dv.getFloat64(_pos, le());
          _pos += 8;
          return v;
        },
        bytes(n) {
          _need(n);
          const v = new Uint8Array(_bytes.buffer, _bytes.byteOffset + _pos, n);
          _pos += n;
          return v;
        },
        utf8(n) {
          const slice = r.bytes(n);
          return _decoder.decode(slice);
        },
        ascii(n) {
          _need(n);
          let s = "";
          for (let i = 0;i < n; i++) {
            const b = _dv.getUint8(_pos + i);
            if (b > 127)
              throw contractError("binary/reader-ascii", "non-ASCII byte encountered", { byte: b, pos: _pos + i });
            s += String.fromCharCode(b);
          }
          _pos += n;
          return s;
        },
        cstring() {
          let end = _pos;
          while (end < _len && _dv.getUint8(end) !== 0)
            end++;
          if (end >= _len)
            throw contractError("binary/reader-cstring", "NUL terminator not found before end of buffer", { pos: _pos, length: _len });
          const slice = new Uint8Array(_bytes.buffer, _bytes.byteOffset + _pos, end - _pos), s = _decoder.decode(slice);
          _pos = end + 1;
          return s;
        },
        sub(offset, length) {
          if (offset < 0 || length < 0 || offset + length > _len)
            throw contractError("binary/reader-sub", "sub-reader range out of bounds", {
              offset,
              length,
              parentLength: _len
            });
          const slice = _bytes.subarray(offset, offset + length);
          return create(slice, { endian: _endian });
        }
      };
      return r;
    }
    return { create };
  } });
    __register({ name: "binaryWriter", dependencies: [], factory: function() {
    const _encoder = new TextEncoder;
    function contractError(code, msg, ctx) {
      const err = Error(msg);
      err.name = "ContractError";
      err.code = code;
      if (ctx)
        err.context = ctx;
      return err;
    }
    function create(opts) {
      const options = opts || {};
      let _endian = options.endian === "le" ? "le" : "be", _cap = options.initialSize && options.initialSize > 0 ? options.initialSize : 256, _buf = new ArrayBuffer(_cap), _u8 = new Uint8Array(_buf), _dv = new DataView(_buf), _pos = 0, _len = 0;
      const le = () => _endian === "le";
      function _ensure(needed) {
        const required = _pos + needed;
        if (required <= _cap)
          return;
        let newCap = _cap * 2;
        while (newCap < required)
          newCap *= 2;
        const newBuf = new ArrayBuffer(newCap), newU8 = new Uint8Array(newBuf);
        newU8.set(_u8.subarray(0, _len));
        _cap = newCap;
        _buf = newBuf;
        _u8 = newU8;
        _dv = new DataView(newBuf);
      }
      function _advance(n) {
        _pos += n;
        if (_pos > _len)
          _len = _pos;
      }
      const w = {
        get pos() {
          return _pos;
        },
        get length() {
          return _len;
        },
        seek(offset) {
          if (offset < 0)
            throw contractError("binary/writer-seek", "seek offset must be >= 0", { offset });
          _pos = offset;
          return w;
        },
        align(n) {
          if (n <= 0)
            throw contractError("binary/writer-align", "align argument must be > 0", { n });
          const rem = _pos % n;
          if (rem === 0)
            return w;
          const pad = n - rem;
          _ensure(pad);
          for (let i = 0;i < pad; i++)
            _u8[_pos + i] = 0;
          _advance(pad);
          return w;
        },
        u8(v) {
          _ensure(1);
          _dv.setUint8(_pos, v & 255);
          _advance(1);
          return w;
        },
        u16(v) {
          _ensure(2);
          _dv.setUint16(_pos, v & 65535, le());
          _advance(2);
          return w;
        },
        u24(v) {
          _ensure(3);
          if (le()) {
            _u8[_pos] = v & 255;
            _u8[_pos + 1] = v >>> 8 & 255;
            _u8[_pos + 2] = v >>> 16 & 255;
          } else {
            _u8[_pos] = v >>> 16 & 255;
            _u8[_pos + 1] = v >>> 8 & 255;
            _u8[_pos + 2] = v & 255;
          }
          _advance(3);
          return w;
        },
        u32(v) {
          _ensure(4);
          _dv.setUint32(_pos, v >>> 0, le());
          _advance(4);
          return w;
        },
        u64(v) {
          _ensure(8);
          _dv.setBigUint64(_pos, v, le());
          _advance(8);
          return w;
        },
        i8(v) {
          _ensure(1);
          _dv.setInt8(_pos, v);
          _advance(1);
          return w;
        },
        i16(v) {
          _ensure(2);
          _dv.setInt16(_pos, v, le());
          _advance(2);
          return w;
        },
        i32(v) {
          _ensure(4);
          _dv.setInt32(_pos, v, le());
          _advance(4);
          return w;
        },
        i64(v) {
          _ensure(8);
          _dv.setBigInt64(_pos, v, le());
          _advance(8);
          return w;
        },
        f32(v) {
          _ensure(4);
          _dv.setFloat32(_pos, v, le());
          _advance(4);
          return w;
        },
        f64(v) {
          _ensure(8);
          _dv.setFloat64(_pos, v, le());
          _advance(8);
          return w;
        },
        bytes(arr) {
          if (!(arr instanceof Uint8Array))
            throw contractError("binary/writer-bytes", "bytes() expects Uint8Array", { actual: typeof arr });
          _ensure(arr.byteLength);
          _u8.set(arr, _pos);
          _advance(arr.byteLength);
          return w;
        },
        utf8(s) {
          if (typeof s !== "string")
            throw contractError("binary/writer-utf8", "utf8() expects string", { actual: typeof s });
          const encoded = _encoder.encode(s);
          return w.bytes(encoded);
        },
        ascii(s) {
          if (typeof s !== "string")
            throw contractError("binary/writer-ascii", "ascii() expects string", { actual: typeof s });
          _ensure(s.length);
          for (let i = 0;i < s.length; i++) {
            const code = s.charCodeAt(i);
            if (code > 127)
              throw contractError("binary/writer-ascii", "non-ASCII character encountered", { char: s[i], code, index: i });
            _u8[_pos + i] = code;
          }
          _advance(s.length);
          return w;
        },
        cstring(s) {
          if (typeof s !== "string")
            throw contractError("binary/writer-cstring", "cstring() expects string", { actual: typeof s });
          w.utf8(s);
          w.u8(0);
          return w;
        },
        finalize() {
          return new Uint8Array(_buf.slice(0, _len));
        }
      };
      return w;
    }
    return { create };
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
      if ((d[0] & 15) !== 8 || d[0] >> 4 > 7 || (d[0] << 8 | d[1]) % 31) {
        const e = Error("invalid zlib data");
        e.code = 6;
        throw e;
      }
      const hasDict = d[1] >> 5 & 1;
      if (hasDict === +!dict) {
        const e = Error("invalid zlib data: " + (hasDict ? "need" : "unexpected") + " dictionary");
        e.code = 6;
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
    function unzlibSync(data, opts = {}) {
      const start = _payloadStart(data, opts.dictionary);
      return inflateSync(data.subarray(start, -4), {
        out: opts.out,
        dictionary: opts.dictionary
      });
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
    }
    UnzlibStream.prototype.push = function(chunk, final) {
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
        const newTailLen = total.length - feedLen;
        this._tailLen = newTailLen;
        this._tail.set(total.subarray(feedLen));
      } else {
        const feedLen = Math.max(0, total.length - 4);
        this._inf.push(total.subarray(0, feedLen), !0);
      }
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
    __register({ name: "brotliDict", dependencies: [], factory: function() {
    const u8 = Uint8Array, NDBITS = new u8([
      0,
      0,
      0,
      0,
      10,
      10,
      11,
      11,
      10,
      10,
      10,
      10,
      10,
      9,
      9,
      8,
      7,
      7,
      8,
      7,
      7,
      6,
      6,
      5,
      5
    ]), _nwords = new Int32Array(25);
    for (let i = 4;i <= 24; ++i)
      _nwords[i] = 1 << NDBITS[i];
    const _doffset = new Int32Array(26);
    for (let l = 0;l < 25; ++l)
      _doffset[l + 1] = _doffset[l] + l * _nwords[l];
    const DICTSIZE = _doffset[25];
    function NWORDS(length) {
      return _nwords[length] | 0;
    }
    function DOFFSET(length) {
      return _doffset[length] | 0;
    }
    const I = 0, FF = 1, FA = 2, OF = (k) => 2 + k, OL = (k) => 11 + k, enc = new TextEncoder, _bs = (s) => s.length === 0 ? new u8(0) : enc.encode(s), _spec = [
      ["", I, ""],
      ["", I, " "],
      [" ", I, " "],
      ["", OF(1), ""],
      ["", FF, " "],
      ["", I, " the "],
      [" ", I, ""],
      ["s ", I, " "],
      ["", I, " of "],
      ["", FF, ""],
      ["", I, " and "],
      ["", OF(2), ""],
      ["", OL(1), ""],
      [", ", I, " "],
      ["", I, ", "],
      [" ", FF, " "],
      ["", I, " in "],
      ["", I, " to "],
      ["e ", I, " "],
      ["", I, '"'],
      ["", I, "."],
      ["", I, '">'],
      ["", I, `
`],
      ["", OL(3), ""],
      ["", I, "]"],
      ["", I, " for "],
      ["", OF(3), ""],
      ["", OL(2), ""],
      ["", I, " a "],
      ["", I, " that "],
      [" ", FF, ""],
      ["", I, ". "],
      [".", I, ""],
      [" ", I, ", "],
      ["", OF(4), ""],
      ["", I, " with "],
      ["", I, "'"],
      ["", I, " from "],
      ["", I, " by "],
      ["", OF(5), ""],
      ["", OF(6), ""],
      [" the ", I, ""],
      ["", OL(4), ""],
      ["", I, ". The "],
      ["", FA, ""],
      ["", I, " on "],
      ["", I, " as "],
      ["", I, " is "],
      ["", OL(7), ""],
      ["", OL(1), "ing "],
      ["", I, `
	`],
      ["", I, ":"],
      [" ", I, ". "],
      ["", I, "ed "],
      ["", OF(9), ""],
      ["", OF(7), ""],
      ["", OL(6), ""],
      ["", I, "("],
      ["", FF, ", "],
      ["", OL(8), ""],
      ["", I, " at "],
      ["", I, "ly "],
      [" the ", I, " of "],
      ["", OL(5), ""],
      ["", OL(9), ""],
      [" ", FF, ", "],
      ["", FF, '"'],
      [".", I, "("],
      ["", FA, " "],
      ["", FF, '">'],
      ["", I, '="'],
      [" ", I, "."],
      [".com/", I, ""],
      [" the ", I, " of the "],
      ["", FF, "'"],
      ["", I, ". This "],
      ["", I, ","],
      [".", I, " "],
      ["", FF, "("],
      ["", FF, "."],
      ["", I, " not "],
      [" ", I, '="'],
      ["", I, "er "],
      [" ", FA, " "],
      ["", I, "al "],
      [" ", FA, ""],
      ["", I, "='"],
      ["", FA, '"'],
      ["", FF, ". "],
      [" ", I, "("],
      ["", I, "ful "],
      [" ", FF, ". "],
      ["", I, "ive "],
      ["", I, "less "],
      ["", FA, "'"],
      ["", I, "est "],
      [" ", FF, "."],
      ["", FA, '">'],
      [" ", I, "='"],
      ["", FF, ","],
      ["", I, "ize "],
      ["", FA, "."],
      ["\xA0", I, ""],
      [" ", I, ","],
      ["", FF, '="'],
      ["", FA, '="'],
      ["", I, "ous "],
      ["", FA, ", "],
      ["", FF, "='"],
      [" ", FF, ","],
      [" ", FA, '="'],
      [" ", FA, ", "],
      ["", FA, ","],
      ["", FA, "("],
      ["", FA, ". "],
      [" ", FA, "."],
      ["", FA, "='"],
      [" ", FA, ". "],
      [" ", FF, '="'],
      [" ", FA, "='"],
      [" ", FF, "='"]
    ], transforms = Array(_spec.length);
    for (let i = 0;i < _spec.length; ++i) {
      const [pfx, kind, sfx] = _spec[i];
      let param = 0;
      if (kind >= 3 && kind <= 11)
        param = kind - 2;
      else if (kind >= 12 && kind <= 20)
        param = kind - 11;
      transforms[i] = {
        prefix: _bs(pfx),
        kind,
        param,
        suffix: _bs(sfx)
      };
    }
    function _ferment(word, pos, len) {
      const b = word[pos];
      if (b < 192) {
        if (b >= 97 && b <= 122)
          word[pos] = b ^ 32;
        return 1;
      }
      if (b < 224) {
        if (pos + 1 < len)
          word[pos + 1] ^= 32;
        return 2;
      }
      if (pos + 2 < len)
        word[pos + 2] ^= 5;
      return 3;
    }
    function _fermentFirst(word, len) {
      if (len > 0)
        _ferment(word, 0, len);
    }
    function _fermentAll(word, len) {
      let i = 0;
      while (i < len)
        i += _ferment(word, i, len);
    }
    function applyTransform(id, baseWord) {
      const t = transforms[id];
      if (!t)
        throw Error(`brotliDict: unknown transform id ${id}`);
      const { prefix, kind, param, suffix } = t;
      let body;
      if (kind === 0)
        body = new u8(baseWord);
      else if (kind === 1) {
        body = new u8(baseWord);
        _fermentFirst(body, body.length);
      } else if (kind === 2) {
        body = new u8(baseWord);
        _fermentAll(body, body.length);
      } else if (kind >= 3 && kind <= 11) {
        const k = param;
        body = baseWord.length < k ? new u8(0) : new u8(baseWord.subarray(k));
      } else if (kind >= 12 && kind <= 20) {
        const k = param;
        body = baseWord.length < k ? new u8(0) : new u8(baseWord.subarray(0, baseWord.length - k));
      } else
        throw Error(`brotliDict: invalid transform kind ${kind}`);
      const out = new u8(prefix.length + body.length + suffix.length);
      out.set(prefix, 0);
      out.set(body, prefix.length);
      out.set(suffix, prefix.length + body.length);
      return out;
    }
    let _words = null;
    function setWords(blob) {
      if (!(blob instanceof u8))
        throw Error("brotliDict.setWords: expected Uint8Array");
      if (blob.length !== DICTSIZE)
        throw Error(`brotliDict.setWords: blob size ${blob.length} \u2260 DICTSIZE ${DICTSIZE}`);
      _words = blob;
    }
    function hasWords() {
      return _words !== null;
    }
    function lookupWord(length, index) {
      if (!_words) {
        const e = Error("brotliDict: static word dictionary not loaded (call setWords first)");
        e.code = "EDICT_UNLOADED";
        throw e;
      }
      if (length < 4 || length > 24)
        throw Error(`brotliDict: invalid word length ${length}`);
      const nw = _nwords[length];
      if (index < 0 || index >= nw)
        throw Error(`brotliDict: word index ${index} out of range [0, ${nw})`);
      const off = _doffset[length] + length * index;
      return _words.subarray(off, off + length);
    }
    return {
      NDBITS,
      NWORDS,
      DOFFSET,
      DICTSIZE,
      transforms,
      applyTransform,
      setWords,
      hasWords,
      lookupWord
    };
  } });
    __register({ name: "brotliDictWords", dependencies: [], factory: function() {
    const u8 = Uint8Array;
    function _crc32(buf) {
      let crc = 4294967295;
      for (let i = 0;i < buf.length; ++i) {
        let c = (crc ^ buf[i]) & 255;
        for (let k = 0;k < 8; ++k)
          c = c & 1 ? 3988292384 ^ c >>> 1 : c >>> 1;
        crc = c ^ crc >>> 8;
      }
      return (crc ^ 4294967295) >>> 0;
    }
    function _validate(buf) {
      if (!(buf instanceof u8))
        throw Error("brotliDictWords: expected Uint8Array");
      if (buf.length !== 122784)
        throw Error("brotliDictWords: size " + buf.length + " \u2260 expected " + 122784);
      const got = _crc32(buf);
      if (got !== 1362545412)
        throw Error("brotliDictWords: CRC32 mismatch (got 0x" + got.toString(16) + ", expected 0x" + 1362545412 .toString(16) + ")");
    }
    const state = {
      blob: null,
      isLoaded: !1,
      EXPECTED_SIZE: 122784,
      EXPECTED_CRC32: 1362545412
    };
    function setBlob(buf) {
      _validate(buf);
      state.blob = buf;
      state.isLoaded = !0;
      return buf;
    }
    async function load(url) {
      if (state.isLoaded)
        return state.blob;
      if (!url)
        throw Error("brotliDictWords.load: url required");
      const r = await fetch(url);
      if (!r.ok)
        throw Error("brotliDictWords.load: HTTP " + r.status + " for " + url);
      const ab = await r.arrayBuffer();
      return setBlob(new u8(ab));
    }
    state.setBlob = setBlob;
    state.load = load;
    return state;
  } });
    __register({ name: "brotli", dependencies: ["bitstream","huffman","lz77","brotliDict","brotliDictWords"], factory: function(bitstream, huffman, lz77, brotliDict, brotliDictWords) {
    const u8 = Uint8Array;
    function _err(code, msg, bitPos) {
      const e = Error("brotli: " + msg + (bitPos != null ? " @ bit " + bitPos : ""));
      e.code = code;
      throw e;
    }
    function _makeReader(data, canExpectMore) {
      const padded = new u8(data.length + 4);
      padded.set(data);
      return {
        d: padded,
        p: 0,
        eb: data.length * 8,
        rb: data.length,
        eofBits: data.length * 8,
        canExpectMore: !!canExpectMore
      };
    }
    function _eofThrow(r) {
      const e = Error(r.canExpectMore ? "EAGAIN: input exhausted, more bytes expected" : "EBADSTREAM: unexpected end of input");
      e.code = r.canExpectMore ? "EAGAIN" : "EBADSTREAM";
      throw e;
    }
    function _readBit(r) {
      if (r.p >= r.eofBits)
        _eofThrow(r);
      const v = r.d[r.p >> 3] >> (r.p & 7) & 1;
      r.p += 1;
      return v;
    }
    function _readBits(r, n) {
      if (r.p + n > r.eofBits)
        _eofThrow(r);
      const o = r.p >> 3, shift = r.p & 7, v = (r.d[o] | r.d[o + 1] << 8 | r.d[o + 2] << 16 | r.d[o + 3] << 24) >>> shift & (1 << n) - 1;
      r.p += n;
      return v;
    }
    function _readBitsBig(r, n) {
      if (n <= 24)
        return _readBits(r, n);
      if (r.p + n > r.eofBits)
        _eofThrow(r);
      const lo = _readBits(r, 24);
      return _readBits(r, n - 24) * 16777216 + lo;
    }
    function _alignToByte(r) {
      r.p = r.p + 7 & -8;
    }
    function _readBitsBigInt(r, n) {
      if (r.p + n > r.eofBits)
        _eofThrow(r);
      let v = 0n, shift = 0n, remaining = n;
      while (remaining > 24) {
        const chunk = _readBits(r, 24);
        v |= BigInt(chunk) << shift;
        shift += 24n;
        remaining -= 24;
      }
      const last = _readBits(r, remaining);
      v |= BigInt(last) << shift;
      return v;
    }
    function _verifyByteTailZero(r) {
      const bit = r.p & 7;
      if (bit === 0)
        return;
      if (r.d[r.p >> 3] >> bit !== 0)
        _err("EBADSTREAM", "non-zero fill bits", r.p);
    }
    function _verifyTrailingZero(r) {
      _verifyByteTailZero(r);
      for (let i = r.p + 7 >> 3;i < r.rb; ++i)
        if (r.d[i])
          _err("EBADSTREAM", "non-zero trailing byte at " + i);
    }
    function _readWBITS(r, allowLargeWindow) {
      if (!_readBit(r))
        return { wbits: 16, largeWindow: !1 };
      const mid = _readBits(r, 3);
      if (mid !== 0)
        return { wbits: 17 + mid, largeWindow: !1 };
      const tail = _readBits(r, 3);
      if (tail === 0)
        return { wbits: 17, largeWindow: !1 };
      if (tail === 1) {
        if (_readBit(r) !== 0)
          _err("EBADSTREAM", "invalid WBITS pattern (8th bit must be 0 for large window)", r.p);
        if (!allowLargeWindow)
          _err("EBADSTREAM", "large window brotli stream - use the brotliShared module with { allowLargeWindow: true }", r.p);
        const wbits = _readBits(r, 6);
        if (wbits < 10 || wbits > 62)
          _err("EBADSTREAM", "large window WBITS " + wbits + " out of range [10, 62]", r.p);
        return { wbits, largeWindow: !0 };
      }
      return { wbits: 8 + tail, largeWindow: !1 };
    }
    function _emitWBITS(w, wbits, largeWindow) {
      if (largeWindow) {
        if (wbits < 10 || wbits > 62)
          _err("EBADARG", "large window wbits " + wbits + " out of [10, 62]");
        w.bits(14, 17 | wbits << 8);
        return;
      }
      if (wbits === 16) {
        w.bits(1, 0);
        return;
      }
      if (wbits >= 18 && wbits <= 24) {
        w.bits(4, wbits - 17 << 1 | 1);
        return;
      }
      if (wbits === 17) {
        w.bits(7, 1);
        return;
      }
      if (wbits >= 10 && wbits <= 15) {
        w.bits(7, wbits - 8 << 4 | 1);
        return;
      }
      _err("EBADARG", "wbits " + wbits + " out of standard range [10, 24]");
    }
    function _decodeMetaBlockInto(r, state) {
      const islast = _readBit(r);
      if (islast) {
        if (_readBit(r)) {
          _verifyTrailingZero(r);
          return { done: !0, last: !0 };
        }
      }
      const mnibblesCode = _readBits(r, 2), mnibbles = mnibblesCode === 3 ? 0 : mnibblesCode + 4;
      if (mnibbles === 0) {
        if (_readBit(r))
          _err("EBADSTREAM", "metadata reserved bit must be 0", r.p);
        const mskipbytes = _readBits(r, 2);
        let mskiplen = 0;
        if (mskipbytes > 0) {
          mskiplen = mskipbytes <= 2 ? _readBits(r, mskipbytes * 8) : _readBitsBig(r, mskipbytes * 8);
          if (mskipbytes > 1) {
            if ((mskiplen >>> (mskipbytes - 1) * 8 & 255) === 0)
              _err("EBADSTREAM", "metadata MSKIPLEN top byte must be non-zero", r.p);
          }
          mskiplen += 1;
        }
        _alignToByte(r);
        if ((r.p >> 3) + mskiplen > r.rb) {
          if (r.canExpectMore)
            _eofThrow(r);
          _err("EBADSTREAM", "metadata MSKIPLEN exceeds stream");
        }
        r.p += mskiplen * 8;
        return { done: !1, last: !1 };
      }
      const mlenBits = mnibbles * 4, mlenRaw = mlenBits <= 16 ? _readBits(r, mlenBits) : _readBitsBig(r, mlenBits);
      if (mnibbles > 4) {
        if ((mlenRaw >>> (mnibbles - 1) * 4 & 15) === 0)
          _err("EBADSTREAM", "meta-block MLEN top nibble must be non-zero", r.p);
      }
      const mlen = mlenRaw + 1;
      let isuncompressed = 0;
      if (!islast)
        isuncompressed = _readBit(r);
      if (isuncompressed) {
        _verifyByteTailZero(r);
        _alignToByte(r);
        const o = r.p >> 3;
        if (o + mlen > r.rb) {
          if (r.canExpectMore)
            _eofThrow(r);
          _err("EBADSTREAM", "uncompressed MLEN exceeds stream");
        }
        _ensureCapacity(state, mlen);
        state.out.set(r.d.subarray(o, o + mlen), state.outLen);
        state.outLen += mlen;
        if (mlen >= 2) {
          state.p1 = state.out[state.outLen - 1];
          state.p2 = state.out[state.outLen - 2];
        } else if (mlen === 1) {
          state.p2 = state.p1;
          state.p1 = state.out[state.outLen - 1];
        }
        r.p += mlen * 8;
        return { done: islast === 1, last: islast === 1 };
      }
      const h = _readCompressedMetaBlockHeader(r, state.largeWindow);
      _decodeCompressedBody(r, h, state, mlen);
      return { done: islast === 1, last: islast === 1 };
    }
    const u16 = Uint16Array;
    function _alphabetBits(n) {
      let k = 0;
      while (1 << k < n)
        ++k;
      return k;
    }
    const _CL_TABLE = new u16([
      2,
      66,
      50,
      35,
      2,
      66,
      50,
      20,
      2,
      66,
      50,
      35,
      2,
      66,
      50,
      84
    ]), _CL_ORDER = new u8([
      1,
      2,
      3,
      4,
      0,
      5,
      17,
      6,
      16,
      7,
      8,
      9,
      10,
      11,
      12,
      13,
      14,
      15
    ]);
    function _makeSingleSymbolDecoder(symbol) {
      return {
        read(_r) {
          return symbol;
        },
        singleSymbol: symbol
      };
    }
    function _makeTableDecoder(codeLens, alphabetSize) {
      let maxBits = 0;
      for (let i = 0;i < codeLens.length; ++i)
        if (codeLens[i] > maxBits)
          maxBits = codeLens[i];
      if (maxBits === 0)
        _err("EBADSTREAM", "prefix code with all-zero lengths");
      const table = huffman.buildMap(codeLens, maxBits, 1), mask = (1 << maxBits) - 1;
      return {
        read(r) {
          if (r.canExpectMore && r.p + maxBits > r.eofBits)
            _eofThrow(r);
          const o = r.p >> 3, d = r.d, entry = table[(d[o] | d[o + 1] << 8 | d[o + 2] << 16) >>> (r.p & 7) & mask], len = entry & 15;
          if (len === 0)
            _err("EBADSTREAM", "undefined prefix code", r.p);
          r.p += len;
          if (r.p > r.eofBits)
            _eofThrow(r);
          return entry >>> 4;
        },
        alphabetSize
      };
    }
    function _readSimplePrefixCode(r, alphabetSize) {
      const nsym = _readBits(r, 2) + 1, abits = _alphabetBits(alphabetSize), syms = Array(nsym);
      for (let i = 0;i < nsym; ++i) {
        const s = abits === 0 ? 0 : abits <= 16 ? _readBits(r, abits) : _readBitsBig(r, abits);
        if (s >= alphabetSize)
          _err("EBADSTREAM", "simple prefix code symbol " + s + " >= alphabet " + alphabetSize, r.p);
        for (let j = 0;j < i; ++j)
          if (syms[j] === s)
            _err("EBADSTREAM", "simple prefix code duplicate symbol " + s, r.p);
        syms[i] = s;
      }
      if (nsym === 1)
        return _makeSingleSymbolDecoder(syms[0]);
      const lens = new u8(alphabetSize);
      if (nsym === 2) {
        lens[syms[0]] = 1;
        lens[syms[1]] = 1;
      } else if (nsym === 3) {
        lens[syms[0]] = 1;
        lens[syms[1]] = 2;
        lens[syms[2]] = 2;
      } else if (_readBit(r) === 0) {
        lens[syms[0]] = 2;
        lens[syms[1]] = 2;
        lens[syms[2]] = 2;
        lens[syms[3]] = 2;
      } else {
        lens[syms[0]] = 1;
        lens[syms[1]] = 2;
        lens[syms[2]] = 3;
        lens[syms[3]] = 3;
      }
      return _makeTableDecoder(lens, alphabetSize);
    }
    function _readClSymbol(r) {
      if (r.canExpectMore && r.p + 4 > r.eofBits)
        _eofThrow(r);
      const idx = bitstream.readBits(r.d, r.p, 15), entry = _CL_TABLE[idx];
      r.p += entry & 15;
      if (r.p > r.eofBits)
        _eofThrow(r);
      return entry >>> 4;
    }
    function _readComplexPrefixCode(r, alphabetSize, hskip) {
      const clOfCl = new u8(18);
      let clOfClKraft = 0;
      for (let i = hskip;i < 18; ++i) {
        const v = _readClSymbol(r);
        clOfCl[_CL_ORDER[i]] = v;
        if (v > 0) {
          clOfClKraft += 32 >> v;
          if (clOfClKraft > 32)
            _err("EBADSTREAM", "CL-of-CL Kraft > 1", r.p);
          if (clOfClKraft === 32)
            break;
        }
      }
      if (clOfClKraft !== 32) {
        let nz = 0;
        for (let i = 0;i < 18; ++i)
          if (clOfCl[i])
            ++nz;
        if (nz !== 1)
          _err("EBADSTREAM", "CL-of-CL Kraft incomplete (sum=" + clOfClKraft + ")", r.p);
      }
      const clDecoder = clOfClKraft === 32 ? _makeTableDecoder(clOfCl, 18) : (() => {
        let sym = 0;
        for (let i = 0;i < 18; ++i)
          if (clOfCl[i]) {
            sym = i;
            break;
          }
        return _makeSingleSymbolDecoder(sym);
      })(), lens = new u8(alphabetSize);
      let i = 0, prev = 8, prevRep = 0, extraTotal = 0, kraftSum = 0;
      while (i < alphabetSize) {
        const sym = clDecoder.read(r);
        if (sym < 16) {
          lens[i++] = sym;
          if (sym > 0) {
            prev = sym;
            kraftSum += 32768 >> sym;
            if (kraftSum > 32768)
              _err("EBADSTREAM", "target-alphabet Kraft > 1", r.p);
            if (kraftSum === 32768)
              break;
          }
          prevRep = 0;
        } else if (sym === 16) {
          let extra;
          if (prevRep === 16) {
            const newCount = 4 * (extraTotal - 2) + _readBits(r, 2) + 3;
            extra = newCount - extraTotal;
            extraTotal = newCount;
          } else {
            extraTotal = _readBits(r, 2) + 3;
            extra = extraTotal;
          }
          prevRep = 16;
          if (i + extra > alphabetSize)
            _err("EBADSTREAM", "CL repeat-16 overflows alphabet", r.p);
          const inc = 32768 >> prev;
          for (let k = 0;k < extra; ++k) {
            lens[i++] = prev;
            kraftSum += inc;
            if (kraftSum > 32768)
              _err("EBADSTREAM", "target-alphabet Kraft > 1 mid-repeat", r.p);
          }
          if (kraftSum === 32768)
            break;
        } else {
          let extra;
          if (prevRep === 17) {
            const newCount = 8 * (extraTotal - 2) + _readBits(r, 3) + 3;
            extra = newCount - extraTotal;
            extraTotal = newCount;
          } else {
            extraTotal = _readBits(r, 3) + 3;
            extra = extraTotal;
          }
          prevRep = 17;
          if (i + extra > alphabetSize)
            _err("EBADSTREAM", "CL repeat-17 overflows alphabet", r.p);
          for (let k = 0;k < extra; ++k)
            lens[i++] = 0;
        }
      }
      if (kraftSum === 32768)
        return _makeTableDecoder(lens, alphabetSize);
      let nz = 0, nzSym = 0;
      for (let j = 0;j < lens.length; ++j)
        if (lens[j]) {
          ++nz;
          nzSym = j;
        }
      if (nz === 1)
        return _makeSingleSymbolDecoder(nzSym);
      _err("EBADSTREAM", "target-alphabet Kraft incomplete (sum=" + kraftSum + ", non-zero=" + nz + ")", r.p);
    }
    function _readPrefixCode(r, alphabetSize) {
      if (alphabetSize < 1)
        _err("EBADARG", "prefix code alphabet size must be >= 1");
      const head = _readBits(r, 2);
      if (head === 1)
        return _readSimplePrefixCode(r, alphabetSize);
      return _readComplexPrefixCode(r, alphabetSize, head);
    }
    function _readVarLenCount(r) {
      if (!_readBit(r))
        return 1;
      const v = _readBits(r, 3);
      if (v === 0)
        return 2;
      return (1 << v) + 1 + _readBits(r, v);
    }
    const _BLOCK_COUNT_EXTRA = new u8([
      2,
      2,
      2,
      2,
      3,
      3,
      3,
      3,
      4,
      4,
      4,
      4,
      5,
      5,
      5,
      5,
      6,
      6,
      7,
      8,
      9,
      10,
      11,
      12,
      13,
      24
    ]), _BLOCK_COUNT_BASE = new Int32Array([
      1,
      5,
      9,
      13,
      17,
      25,
      33,
      41,
      49,
      65,
      81,
      97,
      113,
      145,
      177,
      209,
      241,
      305,
      369,
      497,
      753,
      1265,
      2289,
      4337,
      8433,
      16625
    ]);
    function _readBlockCount(r, blockCountCode) {
      const sym = blockCountCode.read(r);
      if (sym < 0 || sym >= 26)
        _err("EBADSTREAM", "block count code out of range", r.p);
      const extraBits = _BLOCK_COUNT_EXTRA[sym], extra = extraBits <= 16 ? _readBits(r, extraBits) : _readBitsBig(r, extraBits);
      return _BLOCK_COUNT_BASE[sym] + extra;
    }
    function _readRleMax(r) {
      if (!_readBit(r))
        return 0;
      return _readBits(r, 4) + 1;
    }
    function _inverseMoveToFront(v) {
      const mtf = new u8(256);
      for (let i = 0;i < 256; ++i)
        mtf[i] = i;
      for (let i = 0;i < v.length; ++i) {
        const idx = v[i], val = mtf[idx];
        v[i] = val;
        for (let j = idx;j > 0; --j)
          mtf[j] = mtf[j - 1];
        mtf[0] = val;
      }
    }
    function _readContextMap(r, size, ntrees) {
      const rlemax = _readRleMax(r), cmap = new u8(size), code = _readPrefixCode(r, ntrees + rlemax);
      let i = 0;
      while (i < size) {
        const sym = code.read(r);
        if (sym === 0)
          cmap[i++] = 0;
        else if (sym <= rlemax) {
          const reps = (1 << sym) + _readBits(r, sym);
          if (i + reps > size)
            _err("EBADSTREAM", "context map RLE overflow", r.p);
          for (let j = 0;j < reps; ++j)
            cmap[i++] = 0;
        } else
          cmap[i++] = sym - rlemax;
      }
      if (_readBit(r))
        _inverseMoveToFront(cmap);
      return cmap;
    }
    function _readBlockCategory(r, h, cat) {
      const nbltypes = _readVarLenCount(r);
      h["nbltypes" + cat] = nbltypes;
      if (nbltypes >= 2) {
        h["htreeBtype" + cat] = _readPrefixCode(r, nbltypes + 2);
        h["htreeBlen" + cat] = _readPrefixCode(r, 26);
        h["blen" + cat] = _readBlockCount(r, h["htreeBlen" + cat]);
      } else
        h["blen" + cat] = 16777216;
    }
    function _readCompressedMetaBlockHeader(r, largeWindow) {
      const h = {};
      _readBlockCategory(r, h, "L");
      _readBlockCategory(r, h, "I");
      _readBlockCategory(r, h, "D");
      h.npostfix = _readBits(r, 2);
      h.ndirect = _readBits(r, 4) << h.npostfix;
      h.cmode = new u8(h.nbltypesL);
      for (let i = 0;i < h.nbltypesL; ++i)
        h.cmode[i] = _readBits(r, 2);
      h.ntreesL = _readVarLenCount(r);
      const cmapLSize = 64 * h.nbltypesL;
      h.cmapL = h.ntreesL >= 2 ? _readContextMap(r, cmapLSize, h.ntreesL) : new u8(cmapLSize);
      h.ntreesD = _readVarLenCount(r);
      const cmapDSize = 4 * h.nbltypesD;
      h.cmapD = h.ntreesD >= 2 ? _readContextMap(r, cmapDSize, h.ntreesD) : new u8(cmapDSize);
      h.htreeL = Array(h.ntreesL);
      for (let i = 0;i < h.ntreesL; ++i)
        h.htreeL[i] = _readPrefixCode(r, 256);
      h.htreeI = Array(h.nbltypesI);
      for (let i = 0;i < h.nbltypesI; ++i)
        h.htreeI[i] = _readPrefixCode(r, 704);
      const distMult = largeWindow ? 124 : 48, distAlphabet = 16 + h.ndirect + (distMult << h.npostfix);
      h.htreeD = Array(h.ntreesD);
      for (let i = 0;i < h.ntreesD; ++i)
        h.htreeD[i] = _readPrefixCode(r, distAlphabet);
      h.distAlphabet = distAlphabet;
      h.largeWindow = !!largeWindow;
      return h;
    }
    const _IAC_I_BASE = new u8([0, 0, 0, 0, 8, 8, 0, 16, 8, 16, 16]), _IAC_C_BASE = new u8([0, 8, 0, 8, 0, 8, 16, 0, 16, 8, 16]), _INSERT_EXTRA = new u8([
      0,
      0,
      0,
      0,
      0,
      0,
      1,
      1,
      2,
      2,
      3,
      3,
      4,
      4,
      5,
      5,
      6,
      7,
      8,
      9,
      10,
      12,
      14,
      24
    ]), _INSERT_BASE = new Int32Array([
      0,
      1,
      2,
      3,
      4,
      5,
      6,
      8,
      10,
      14,
      18,
      26,
      34,
      50,
      66,
      98,
      130,
      194,
      322,
      578,
      1090,
      2114,
      6210,
      22594
    ]), _COPY_EXTRA = new u8([
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      1,
      1,
      2,
      2,
      3,
      3,
      4,
      4,
      5,
      5,
      6,
      7,
      8,
      9,
      10,
      24
    ]), _COPY_BASE = new Int32Array([
      2,
      3,
      4,
      5,
      6,
      7,
      8,
      9,
      10,
      12,
      14,
      18,
      22,
      30,
      38,
      54,
      70,
      102,
      134,
      198,
      326,
      582,
      1094,
      2118
    ]);
    function _splitIacSym(iacSym) {
      const cell = iacSym >> 6;
      if (cell >= 11)
        _err("EBADSTREAM", "iac symbol " + iacSym + " out of range");
      return {
        insertCode: _IAC_I_BASE[cell] + (iacSym >> 3 & 7),
        copyCode: _IAC_C_BASE[cell] + (iacSym & 7),
        distZero: cell < 2
      };
    }
    function _readLength(r, baseArr, extraArr, code) {
      const eb = extraArr[code], extra = eb <= 16 ? _readBits(r, eb) : _readBitsBig(r, eb);
      return baseArr[code] + extra;
    }
    const _SPECIAL_DIST = new Int8Array([
      0,
      0,
      1,
      0,
      2,
      0,
      3,
      0,
      0,
      -1,
      0,
      1,
      0,
      -2,
      0,
      2,
      0,
      -3,
      0,
      3,
      1,
      -1,
      1,
      1,
      1,
      -2,
      1,
      2,
      1,
      -3,
      1,
      3
    ]);
    function _decodeDistanceSymbol(r, dsym, lastDist, npostfix, ndirect) {
      if (dsym < 16) {
        const idx = _SPECIAL_DIST[dsym * 2], off = _SPECIAL_DIST[dsym * 2 + 1], d = lastDist[idx] + off;
        if (d <= 0)
          _err("EBADSTREAM", "special distance code " + dsym + " resolved to non-positive " + d, r.p);
        return d;
      }
      if (dsym < 16 + ndirect)
        return dsym - 15;
      const dcOffset = dsym - ndirect - 16, ndistbits = 1 + (dcOffset >> npostfix + 1);
      if (ndistbits > 62)
        _err("EBADSTREAM", "distance ndistbits " + ndistbits + " > 62 (spec ceiling)", r.p);
      const hcode = dcOffset >> npostfix, lcode = dcOffset & (1 << npostfix) - 1;
      if (ndistbits <= 29) {
        const dextra = _readBits(r, ndistbits);
        return ((2 + (hcode & 1) << ndistbits) - 4 + dextra << npostfix) + lcode + ndirect + 1;
      }
      if (ndistbits <= 50) {
        const dextra = _readBitsBig(r, ndistbits), pow = Math.pow(2, ndistbits);
        return ((2 + (hcode & 1)) * pow - 4 + dextra) * (1 << npostfix) + lcode + ndirect + 1;
      }
      const dextra = _readBitsBigInt(r, ndistbits), pow = 1n << BigInt(ndistbits), distBig = (BigInt(2 + (hcode & 1)) * pow - 4n + dextra) * BigInt(1 << npostfix) + BigInt(lcode + ndirect + 1);
      if (distBig > BigInt(Number.MAX_SAFE_INTEGER))
        _err("EBADSTREAM", "distance exceeds Number safe range (" + distBig + ")", r.p);
      return Number(distBig);
    }
    const _LUT0 = new u8([
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      4,
      4,
      0,
      0,
      4,
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
      0,
      0,
      0,
      8,
      12,
      16,
      12,
      12,
      20,
      12,
      16,
      24,
      28,
      12,
      12,
      32,
      12,
      36,
      12,
      44,
      44,
      44,
      44,
      44,
      44,
      44,
      44,
      44,
      44,
      32,
      32,
      24,
      40,
      28,
      12,
      12,
      48,
      52,
      52,
      52,
      48,
      52,
      52,
      52,
      48,
      52,
      52,
      52,
      52,
      52,
      48,
      52,
      52,
      52,
      52,
      52,
      48,
      52,
      52,
      52,
      52,
      52,
      24,
      12,
      28,
      12,
      12,
      12,
      56,
      60,
      60,
      60,
      56,
      60,
      60,
      60,
      56,
      60,
      60,
      60,
      60,
      60,
      56,
      60,
      60,
      60,
      60,
      60,
      56,
      60,
      60,
      60,
      60,
      60,
      24,
      12,
      28,
      12,
      0,
      0,
      1,
      0,
      1,
      0,
      1,
      0,
      1,
      0,
      1,
      0,
      1,
      0,
      1,
      0,
      1,
      0,
      1,
      0,
      1,
      0,
      1,
      0,
      1,
      0,
      1,
      0,
      1,
      0,
      1,
      0,
      1,
      0,
      1,
      0,
      1,
      0,
      1,
      0,
      1,
      0,
      1,
      0,
      1,
      0,
      1,
      0,
      1,
      0,
      1,
      0,
      1,
      0,
      1,
      0,
      1,
      0,
      1,
      0,
      1,
      0,
      1,
      0,
      1,
      2,
      3,
      2,
      3,
      2,
      3,
      2,
      3,
      2,
      3,
      2,
      3,
      2,
      3,
      2,
      3,
      2,
      3,
      2,
      3,
      2,
      3,
      2,
      3,
      2,
      3,
      2,
      3,
      2,
      3,
      2,
      3,
      2,
      3,
      2,
      3,
      2,
      3,
      2,
      3,
      2,
      3,
      2,
      3,
      2,
      3,
      2,
      3,
      2,
      3,
      2,
      3,
      2,
      3,
      2,
      3,
      2,
      3,
      2,
      3,
      2,
      3,
      2,
      3
    ]), _LUT1 = new u8([
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
      0,
      0,
      0,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      2,
      2,
      2,
      2,
      2,
      2,
      2,
      2,
      2,
      2,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      2,
      2,
      2,
      2,
      2,
      2,
      2,
      2,
      2,
      2,
      2,
      2,
      2,
      2,
      2,
      2,
      2,
      2,
      2,
      2,
      2,
      2,
      2,
      2,
      2,
      2,
      1,
      1,
      1,
      1,
      1,
      1,
      3,
      3,
      3,
      3,
      3,
      3,
      3,
      3,
      3,
      3,
      3,
      3,
      3,
      3,
      3,
      3,
      3,
      3,
      3,
      3,
      3,
      3,
      3,
      3,
      3,
      3,
      1,
      1,
      1,
      1,
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
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      2,
      2,
      2,
      2,
      2,
      2,
      2,
      2,
      2,
      2,
      2,
      2,
      2,
      2,
      2,
      2,
      2,
      2,
      2,
      2,
      2,
      2,
      2,
      2,
      2,
      2,
      2,
      2,
      2,
      2,
      2,
      2
    ]), _LUT2 = new u8([
      0,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      2,
      2,
      2,
      2,
      2,
      2,
      2,
      2,
      2,
      2,
      2,
      2,
      2,
      2,
      2,
      2,
      2,
      2,
      2,
      2,
      2,
      2,
      2,
      2,
      2,
      2,
      2,
      2,
      2,
      2,
      2,
      2,
      2,
      2,
      2,
      2,
      2,
      2,
      2,
      2,
      2,
      2,
      2,
      2,
      2,
      2,
      2,
      2,
      3,
      3,
      3,
      3,
      3,
      3,
      3,
      3,
      3,
      3,
      3,
      3,
      3,
      3,
      3,
      3,
      3,
      3,
      3,
      3,
      3,
      3,
      3,
      3,
      3,
      3,
      3,
      3,
      3,
      3,
      3,
      3,
      3,
      3,
      3,
      3,
      3,
      3,
      3,
      3,
      3,
      3,
      3,
      3,
      3,
      3,
      3,
      3,
      3,
      3,
      3,
      3,
      3,
      3,
      3,
      3,
      3,
      3,
      3,
      3,
      3,
      3,
      3,
      3,
      4,
      4,
      4,
      4,
      4,
      4,
      4,
      4,
      4,
      4,
      4,
      4,
      4,
      4,
      4,
      4,
      4,
      4,
      4,
      4,
      4,
      4,
      4,
      4,
      4,
      4,
      4,
      4,
      4,
      4,
      4,
      4,
      4,
      4,
      4,
      4,
      4,
      4,
      4,
      4,
      4,
      4,
      4,
      4,
      4,
      4,
      4,
      4,
      4,
      4,
      4,
      4,
      4,
      4,
      4,
      4,
      4,
      4,
      4,
      4,
      4,
      4,
      4,
      4,
      5,
      5,
      5,
      5,
      5,
      5,
      5,
      5,
      5,
      5,
      5,
      5,
      5,
      5,
      5,
      5,
      5,
      5,
      5,
      5,
      5,
      5,
      5,
      5,
      5,
      5,
      5,
      5,
      5,
      5,
      5,
      5,
      5,
      5,
      5,
      5,
      5,
      5,
      5,
      5,
      5,
      5,
      5,
      5,
      5,
      5,
      5,
      5,
      6,
      6,
      6,
      6,
      6,
      6,
      6,
      6,
      6,
      6,
      6,
      6,
      6,
      6,
      6,
      7
    ]);
    function _contextIdLit(mode, p1, p2) {
      if (mode === 0)
        return p1 & 63;
      if (mode === 1)
        return p1 >> 2;
      if (mode === 2)
        return _LUT0[p1] | _LUT1[p2];
      return _LUT2[p1] << 3 | _LUT2[p2];
    }
    function _decodeBlockType(code, nbltypes, current, prev, r) {
      const sym = code.read(r);
      if (sym === 0)
        return prev;
      if (sym === 1)
        return (current + 1) % nbltypes;
      const t = sym - 2;
      if (t >= nbltypes)
        _err("EBADSTREAM", "block type " + sym + " out of range", r.p);
      return t;
    }
    function _ensureCapacity(state, additional) {
      if (state.outLen + additional > state.out.length) {
        let newSize = state.out.length;
        while (newSize < state.outLen + additional)
          newSize *= 2;
        const grown = new u8(newSize);
        grown.set(state.out.subarray(0, state.outLen));
        state.out = grown;
      }
    }
    function _ensureDictLoaded(r) {
      if (brotliDict.hasWords())
        return;
      if (brotliDictWords.isLoaded) {
        brotliDict.setWords(brotliDictWords.blob);
        return;
      }
      _err("ENEEDDICT", "brotli static dictionary required for this stream - load it via brotliDictWords.setBlob(bytes) or .load(url), then the decoder will auto-wire on the next dict-ref", r.p);
    }
    function _decodeCompressedBody(r, h, state, mlen) {
      const startLen = state.outLen;
      let btypeL = 0, prevBtypeL = 1, btypeI = 0, prevBtypeI = 1, btypeD = 0, prevBtypeD = 1, blenL = h.blenL, blenI = h.blenI, blenD = h.blenD;
      while (state.outLen - startLen < mlen) {
        if (blenI === 0) {
          const nb = _decodeBlockType(h.htreeBtypeI, h.nbltypesI, btypeI, prevBtypeI, r);
          prevBtypeI = btypeI;
          btypeI = nb;
          blenI = _readBlockCount(r, h.htreeBlenI);
        }
        blenI--;
        const iacSym = h.htreeI[btypeI].read(r), { insertCode, copyCode, distZero } = _splitIacSym(iacSym), ilen = _readLength(r, _INSERT_BASE, _INSERT_EXTRA, insertCode), clen = _readLength(r, _COPY_BASE, _COPY_EXTRA, copyCode);
        if (ilen > 0) {
          _ensureCapacity(state, ilen);
          for (let k = 0;k < ilen; ++k) {
            if (blenL === 0) {
              const nb = _decodeBlockType(h.htreeBtypeL, h.nbltypesL, btypeL, prevBtypeL, r);
              prevBtypeL = btypeL;
              btypeL = nb;
              blenL = _readBlockCount(r, h.htreeBlenL);
            }
            blenL--;
            const cidL = _contextIdLit(h.cmode[btypeL], state.p1, state.p2), treeIdx = h.cmapL[64 * btypeL + cidL], lit = h.htreeL[treeIdx].read(r);
            if (state.outLen - startLen < mlen) {
              state.out[state.outLen++] = lit;
              state.p2 = state.p1;
              state.p1 = lit;
            }
          }
        }
        if (state.outLen - startLen >= mlen)
          break;
        let distance, dsym = 0;
        if (distZero)
          distance = state.lastDist[0];
        else {
          if (blenD === 0) {
            const nb = _decodeBlockType(h.htreeBtypeD, h.nbltypesD, btypeD, prevBtypeD, r);
            prevBtypeD = btypeD;
            btypeD = nb;
            blenD = _readBlockCount(r, h.htreeBlenD);
          }
          blenD--;
          const cidD = clen > 4 ? 3 : clen - 2, treeIdx = h.cmapD[4 * btypeD + cidD];
          dsym = h.htreeD[treeIdx].read(r);
          distance = _decodeDistanceSymbol(r, dsym, state.lastDist, h.npostfix, h.ndirect);
        }
        const maxAllowed = state.outLen < state.windowSize ? state.outLen : state.windowSize, lz77DictLen = state.lz77Dict ? state.lz77Dict.length : 0, isStaticDictRef = distance > maxAllowed + lz77DictLen, isLz77DictRef = !isStaticDictRef && distance > maxAllowed && lz77DictLen > 0;
        if (!distZero && dsym !== 0 && !isStaticDictRef) {
          state.lastDist[3] = state.lastDist[2];
          state.lastDist[2] = state.lastDist[1];
          state.lastDist[1] = state.lastDist[0];
          state.lastDist[0] = distance;
        }
        const remaining = mlen - (state.outLen - startLen);
        if (isStaticDictRef) {
          const wordId = distance - maxAllowed - 1 - lz77DictLen;
          let transformed;
          if (state.resolveStaticDictRef) {
            const cidL = _contextIdLit(h.cmode[btypeL], state.p1, state.p2);
            transformed = state.resolveStaticDictRef(state, wordId, clen, cidL, r);
          } else {
            if (clen < 4 || clen > 24)
              _err("EBADSTREAM", "static dict ref length " + clen + " not in [4, 24]", r.p);
            _ensureDictLoaded(r);
            const nw = brotliDict.NWORDS(clen), index = wordId % nw, transformId = (wordId - index) / nw;
            if (transformId >= 121)
              _err("EBADSTREAM", "static dict transform id " + transformId + " >= 121", r.p);
            const baseWord = brotliDict.lookupWord(clen, index);
            transformed = brotliDict.applyTransform(transformId, baseWord);
          }
          const writeLen = transformed.length < remaining ? transformed.length : remaining;
          _ensureCapacity(state, writeLen);
          state.out.set(transformed.subarray(0, writeLen), state.outLen);
          state.outLen += writeLen;
        } else if (isLz77DictRef) {
          const dictAddr = lz77DictLen + maxAllowed - distance, fromDictBytes = lz77DictLen - dictAddr, writeLen = clen < remaining ? clen : remaining;
          _ensureCapacity(state, writeLen);
          const outStart = state.outLen, windowStart = outStart > state.windowSize ? outStart - state.windowSize : 0;
          let k = 0;
          while (k < writeLen && k < fromDictBytes) {
            state.out[state.outLen++] = state.lz77Dict[dictAddr + k];
            ++k;
          }
          while (k < writeLen) {
            state.out[state.outLen++] = state.out[windowStart + (k - fromDictBytes)];
            ++k;
          }
        } else {
          const writeLen = clen < remaining ? clen : remaining;
          _ensureCapacity(state, writeLen);
          for (let k = 0;k < writeLen; ++k) {
            state.out[state.outLen] = state.out[state.outLen - distance];
            state.outLen++;
          }
        }
        if (state.outLen >= 2) {
          state.p1 = state.out[state.outLen - 1];
          state.p2 = state.out[state.outLen - 2];
        } else if (state.outLen === 1) {
          state.p2 = state.p1;
          state.p1 = state.out[state.outLen - 1];
        }
      }
    }
    function brotliDecompressSync(data, opts) {
      if (!(data instanceof u8))
        _err("EBADARG", "expected Uint8Array");
      if (data.length === 0)
        _err("EBADSTREAM", "empty input");
      const ext = opts && opts._ext || null, r = _makeReader(data), wbitsInfo = _readWBITS(r, ext && ext.allowLargeWindow), wbits = wbitsInfo.wbits, largeWindow = wbitsInfo.largeWindow, windowSize = wbits >= 31 ? Math.pow(2, wbits) - 16 : (1 << wbits) - 16, state = {
        out: new u8(Math.max(data.length * 4, 1024)),
        outLen: 0,
        p1: 0,
        p2: 0,
        lastDist: new Int32Array([4, 11, 15, 16]),
        windowSize,
        lz77Dict: ext && ext.lz77Dict || null,
        largeWindow,
        resolveStaticDictRef: ext && ext.resolveStaticDictRef || null
      };
      let sawLast = !1;
      while (!sawLast)
        if (_decodeMetaBlockInto(r, state).last)
          sawLast = !0;
      _verifyByteTailZero(r);
      return state.outLen === state.out.length ? state.out : state.out.slice(0, state.outLen);
    }
    function _encodeUncompressed(data) {
      if (data.length === 0)
        return new u8([6]);
      const numChunks = Math.ceil(data.length / 65536), buf = new u8(data.length + 5 + numChunks * 4);
      let p = 0;
      p += 1;
      for (let i = 0;i < data.length; i += 65536) {
        const chunkLen = Math.min(65536, data.length - i);
        p += 3;
        bitstream.writeBits16(buf, p, chunkLen - 1);
        p += 16;
        bitstream.writeBits(buf, p, 1);
        p += 1;
        p = p + 7 & -8;
        buf.set(data.subarray(i, i + chunkLen), p >> 3);
        p += chunkLen * 8;
      }
      bitstream.writeBits(buf, p, 3);
      p += 2;
      p = p + 7 & -8;
      return buf.slice(0, p >> 3);
    }
    const _CL_OF_CL_VAL = new u8([0, 7, 3, 2, 1, 15]), _CL_OF_CL_LEN = new u8([2, 4, 3, 2, 2, 4]);
    function _insertCodeFor(len) {
      for (let c = 23;c >= 0; --c)
        if (_INSERT_BASE[c] <= len)
          return { code: c, extra: len - _INSERT_BASE[c], extraBits: _INSERT_EXTRA[c] };
      return null;
    }
    function _copyCodeFor(len) {
      for (let c = 23;c >= 0; --c)
        if (_COPY_BASE[c] <= len)
          return { code: c, extra: len - _COPY_BASE[c], extraBits: _COPY_EXTRA[c] };
      return null;
    }
    function _findIacSym(iCode, cCode, distZero) {
      const iHi = iCode >> 3, iLo = iCode & 7, cHi = cCode >> 3, cLo = cCode & 7;
      let cell;
      if (distZero) {
        if (iHi !== 0 || cHi > 1)
          return -1;
        cell = cHi;
      } else
        cell = [[2, 3, 6], [4, 5, 8], [7, 9, 10]][iHi][cHi];
      return cell << 6 | iLo << 3 | cLo;
    }
    function _distanceCodeFor(distance, npostfix, ndirect) {
      if (npostfix == null)
        npostfix = 0;
      if (ndirect == null)
        ndirect = 0;
      if (distance >= 1 && distance <= ndirect)
        return { dsym: 16 + (distance - 1), extra: 0, extraBits: 0 };
      const dPrime = distance - ndirect - 1;
      if (dPrime < 0)
        return null;
      const lcodeMask = (1 << npostfix) - 1, lcode = dPrime & lcodeMask, rest = dPrime >> npostfix;
      for (let k = 1;k <= 24; ++k) {
        const evenLo = (1 << k + 1) - 4, evenHi = evenLo + (1 << k) - 1;
        if (rest >= evenLo && rest <= evenHi) {
          const dextra = rest - evenLo, dcOffset = (k - 1) * 2 << npostfix | lcode;
          return { dsym: 16 + ndirect + dcOffset, extra: dextra, extraBits: k };
        }
        const oddLo = (3 << k) - 4, oddHi = oddLo + (1 << k) - 1;
        if (rest >= oddLo && rest <= oddHi) {
          const dextra = rest - oddLo, dcOffset = (k - 1) * 2 + 1 << npostfix | lcode;
          return { dsym: 16 + ndirect + dcOffset, extra: dextra, extraBits: k };
        }
      }
      return null;
    }
    function _makeWriter(initialCapacity) {
      let buf = new u8(Math.max(initialCapacity | 0, 256)), bp = 0;
      function ensure(extraBits) {
        const need = (bp + extraBits + 7 >> 3) + 4;
        if (need > buf.length) {
          let n = buf.length;
          while (n < need)
            n *= 2;
          const g = new u8(n);
          g.set(buf);
          buf = g;
        }
      }
      return {
        bits(n, v) {
          ensure(n);
          bitstream.writeBits16(buf, bp, v & (1 << n) - 1);
          bp += n;
        },
        align() {
          bp = bp + 7 & -8;
          ensure(0);
        },
        bytes() {
          return buf.slice(0, bp + 7 >> 3);
        },
        pos() {
          return bp;
        }
      };
    }
    function _firstNonZero(arr) {
      for (let i = 0;i < arr.length; ++i)
        if (arr[i])
          return i;
      return -1;
    }
    function _padFreqs(freqs) {
      let nz = 0;
      for (const v of freqs)
        if (v) {
          if (++nz === 2)
            return;
        }
      let need = 2 - nz;
      for (let i = 0;i < freqs.length && need > 0; ++i)
        if (!freqs[i]) {
          freqs[i] = 1;
          --need;
        }
    }
    function _padTo(arr, n) {
      if (arr.length === n)
        return arr;
      const out = new u8(n);
      for (let i = 0;i < arr.length && i < n; ++i)
        out[i] = arr[i];
      return out;
    }
    function _emitPrefixCodeDescriptor(w, codeLens) {
      let lastNonZeroTgt = -1;
      for (let i = 0;i < codeLens.length; ++i)
        if (codeLens[i] > 0)
          lastNonZeroTgt = i;
      if (lastNonZeroTgt < 0)
        _err("EINTERNAL", "prefix code with all-zero lengths cannot be emitted");
      const clHist = new Int32Array(18);
      for (let i = 0;i <= lastNonZeroTgt; ++i)
        clHist[codeLens[i]]++;
      const { t: clOfClRaw, l: clOfClMaxBits } = huffman.buildTree(clHist, 5), clOfCl = new u8(18);
      for (let i = 0;i < clOfClRaw.length && i < 18; ++i)
        clOfCl[i] = clOfClRaw[i];
      w.bits(2, 0);
      let nzClOfCl = 0;
      for (let i = 0;i < 18; ++i)
        if (clOfCl[i])
          ++nzClOfCl;
      let stopAt = 18;
      if (nzClOfCl >= 2) {
        let last = -1;
        for (let i = 0;i < 18; ++i)
          if (clOfCl[_CL_ORDER[i]] > 0)
            last = i;
        stopAt = last + 1;
      }
      for (let i = 0;i < stopAt; ++i) {
        const v = clOfCl[_CL_ORDER[i]];
        w.bits(_CL_OF_CL_LEN[v], _CL_OF_CL_VAL[v]);
      }
      const clMap = nzClOfCl >= 1 ? huffman.buildMap(clOfCl, Math.max(clOfClMaxBits, 1), 0) : null, singleCl = nzClOfCl === 1 ? _firstNonZero(clOfCl) : -1;
      let tgtKraft = 0;
      for (let i = 0;i <= lastNonZeroTgt; ++i) {
        const v = codeLens[i];
        if (nzClOfCl === 1) {
          if (v !== singleCl)
            _err("EINTERNAL", "CL " + v + " incompatible with single-symbol CL-of-CL (" + singleCl + ")");
        } else {
          const len = clOfCl[v];
          if (len === 0)
            _err("EINTERNAL", "no CL-of-CL assignment for CL value " + v);
          w.bits(len, clMap[v]);
        }
        if (v > 0) {
          tgtKraft += 32768 >> v;
          if (tgtKraft === 32768)
            break;
        }
      }
    }
    const _NTREESL_OPT = 4;
    function _clusterContext(ctxId) {
      return ctxId >> 4;
    }
    function _pickCMode(data) {
      const SAMPLE = data.length < 16384 ? data.length : 16384;
      if (SAMPLE < 64)
        return 2;
      const NTL = _NTREESL_OPT;
      let bestMode = 2, bestBits = 1 / 0;
      for (let mode = 0;mode < 4; ++mode) {
        const freqs = Array(NTL);
        for (let t = 0;t < NTL; ++t)
          freqs[t] = new Int32Array(256);
        const totals = new Int32Array(NTL);
        let p1 = 0, p2 = 0;
        for (let i = 0;i < SAMPLE; ++i) {
          const byte = data[i], tree = _contextIdLit(mode, p1, p2) >> 4;
          ++freqs[tree][byte];
          ++totals[tree];
          p2 = p1;
          p1 = byte;
        }
        let bits = 0;
        for (let t = 0;t < NTL; ++t) {
          const total = totals[t];
          if (total === 0)
            continue;
          const f = freqs[t], logTotal = Math.log2(total);
          for (let s = 0;s < 256; ++s) {
            const c = f[s];
            if (c > 0)
              bits += c * (logTotal - Math.log2(c));
          }
        }
        if (bits < bestBits) {
          bestBits = bits;
          bestMode = mode;
        }
      }
      return bestMode;
    }
    function _emitContextMap(w, cmap, ntrees) {
      w.bits(1, 0);
      const freq = new Int32Array(ntrees);
      for (const v of cmap)
        ++freq[v];
      _padFreqs(freq);
      const { t: lens0, l: maxBits } = huffman.buildTree(freq, 15), lens = _padTo(lens0, ntrees), map = huffman.buildMap(lens, Math.max(maxBits, 1), 0);
      _emitPrefixCodeDescriptor(w, lens);
      for (const v of cmap)
        w.bits(lens[v], map[v]);
      w.bits(1, 0);
    }
    function _emitVarLenCount(w, n) {
      if (n === 1) {
        w.bits(1, 0);
        return;
      }
      if (n === 2) {
        w.bits(4, 1);
        return;
      }
      let v = 0;
      while ((1 << v) + 1 + ((1 << v) - 1) < n)
        ++v;
      const base = (1 << v) + 1, extra = n - base, valPrefix = 1 | v << 1;
      w.bits(4, valPrefix);
      if (v > 0)
        w.bits(v, extra);
    }
    let _staticDictHash = null, _staticDictHashTried = !1;
    const _OF_K_VALUES = [1, 2, 3, 4, 5, 6, 7, 9];
    function _getStaticDictHash() {
      if (_staticDictHash !== null)
        return _staticDictHash;
      if (_staticDictHashTried)
        return null;
      _staticDictHashTried = !0;
      if (!brotliDictWords.isLoaded)
        return null;
      if (!brotliDict.hasWords())
        brotliDict.setWords(brotliDictWords.blob);
      const words = brotliDictWords.blob, table = new Map, ofTables = Array(10);
      for (const k of _OF_K_VALUES)
        ofTables[k] = new Map;
      for (let len = 4;len <= 24; ++len) {
        const nwords = brotliDict.NWORDS(len);
        if (nwords === 0)
          continue;
        const dofs = brotliDict.DOFFSET(len);
        for (let idx = 0;idx < nwords; ++idx) {
          const off = dofs + len * idx, h = (words[off] | words[off + 1] << 8 | words[off + 2] << 16 | words[off + 3] << 24) >>> 0;
          let bucket = table.get(h);
          if (!bucket) {
            bucket = [];
            table.set(h, bucket);
          }
          bucket.push({ len, idx, off });
          for (const k of _OF_K_VALUES) {
            if (len < k + 4)
              continue;
            const ofh = (words[off + k] | words[off + k + 1] << 8 | words[off + k + 2] << 16 | words[off + k + 3] << 24) >>> 0, ofTable = ofTables[k];
            let ofBucket = ofTable.get(ofh);
            if (!ofBucket) {
              ofBucket = [];
              ofTable.set(ofh, ofBucket);
            }
            ofBucket.push({ len, idx, off });
          }
        }
      }
      _staticDictHash = { table, words, ofTables };
      return _staticDictHash;
    }
    const _OF_TID_BY_K = new Map([
      [1, 3],
      [2, 11],
      [3, 26],
      [4, 34],
      [5, 39],
      [6, 40],
      [7, 55],
      [9, 54]
    ]);
    let _idTransformGroups = null, _ffTransformGroups = null, _faTransformGroups = null, _olByK = null;
    function _buildEncoderTransformGroups() {
      if (_idTransformGroups !== null)
        return;
      const idByPrefix = new Map, ffByPrefix = new Map, faByPrefix = new Map, olByK = new Map, tlist = brotliDict.transforms;
      for (let id = 0;id < tlist.length; ++id) {
        const t = tlist[id];
        if (t.kind === 0 || t.kind === 1 || t.kind === 2) {
          const bucket = t.kind === 0 ? idByPrefix : t.kind === 1 ? ffByPrefix : faByPrefix, key = Array.from(t.prefix).join(",");
          let g = bucket.get(key);
          if (!g) {
            g = { prefix: t.prefix, suffixes: [] };
            bucket.set(key, g);
          }
          g.suffixes.push({ id, suffix: t.suffix });
        } else if (t.kind >= 12 && t.kind <= 20) {
          if (t.prefix.length !== 0)
            continue;
          const k = t.param;
          let arr = olByK.get(k);
          if (!arr) {
            arr = [];
            olByK.set(k, arr);
          }
          arr.push({ id, suffix: t.suffix });
        }
      }
      const finalize = (m) => {
        const groups = Array.from(m.values());
        for (const g of groups)
          g.suffixes.sort((a, b) => b.suffix.length - a.suffix.length);
        groups.sort((a, b) => a.prefix.length - b.prefix.length);
        return groups;
      };
      _idTransformGroups = finalize(idByPrefix);
      _ffTransformGroups = finalize(ffByPrefix);
      _faTransformGroups = finalize(faByPrefix);
      for (const arr of olByK.values())
        arr.sort((a, b) => b.suffix.length - a.suffix.length);
      _olByK = olByK;
    }
    function _findStaticDictMatchAt(data, pos, end, dictHash, minLen) {
      const words = dictHash.words;
      _buildEncoderTransformGroups();
      let bestOutLen = 0, bestDictLen = 0, bestIdx = 0, bestTransform = 0;
      const idGroups = _idTransformGroups;
      for (let gi = 0;gi < idGroups.length; ++gi) {
        const g = idGroups[gi], pre = g.prefix, preLen = pre.length;
        if (pos + preLen + 4 > end)
          continue;
        let mp = 0;
        while (mp < preLen && data[pos + mp] === pre[mp])
          ++mp;
        if (mp !== preLen)
          continue;
        const hashStart = pos + preLen, h = (data[hashStart] | data[hashStart + 1] << 8 | data[hashStart + 2] << 16 | data[hashStart + 3] << 24) >>> 0, bucket = dictHash.table.get(h);
        if (!bucket)
          continue;
        for (let i = 0;i < bucket.length; ++i) {
          const c = bucket[i], bodyEnd = hashStart + c.len > end ? end : hashStart + c.len;
          let m = 4;
          while (hashStart + m < bodyEnd && data[hashStart + m] === words[c.off + m])
            ++m;
          if (m === c.len) {
            const sufStart = hashStart + c.len, sufs = g.suffixes;
            for (let si = 0;si < sufs.length; ++si) {
              const sb = sufs[si].suffix, sl = sb.length;
              if (sufStart + sl > end)
                continue;
              let sm = 0;
              while (sm < sl && data[sufStart + sm] === sb[sm])
                ++sm;
              if (sm !== sl)
                continue;
              const ol = preLen + c.len + sl;
              if (ol > bestOutLen) {
                bestOutLen = ol;
                bestDictLen = c.len;
                bestIdx = c.idx;
                bestTransform = sufs[si].id;
              }
              break;
            }
          } else if (preLen === 0) {
            const k = c.len - m, olOpts = _olByK.get(k);
            if (olOpts) {
              const sufStart = hashStart + m;
              for (let oi = 0;oi < olOpts.length; ++oi) {
                const sb = olOpts[oi].suffix, sl = sb.length;
                if (sufStart + sl > end)
                  continue;
                let sm = 0;
                while (sm < sl && data[sufStart + sm] === sb[sm])
                  ++sm;
                if (sm !== sl)
                  continue;
                const ol = m + sl;
                if (ol > bestOutLen) {
                  bestOutLen = ol;
                  bestDictLen = c.len;
                  bestIdx = c.idx;
                  bestTransform = olOpts[oi].id;
                }
                break;
              }
            }
          }
        }
      }
      const ffGroups = _ffTransformGroups;
      for (let gi = 0;gi < ffGroups.length; ++gi) {
        const g = ffGroups[gi], pre = g.prefix, preLen = pre.length;
        if (pos + preLen + 4 > end)
          continue;
        let mp = 0;
        while (mp < preLen && data[pos + mp] === pre[mp])
          ++mp;
        if (mp !== preLen)
          continue;
        const hashStart = pos + preLen, b0 = data[hashStart], b1 = data[hashStart + 1], b2 = data[hashStart + 2], b3 = data[hashStart + 3];
        let u0, u1, u2, u3, cpLen;
        if (b0 >= 65 && b0 <= 90) {
          u0 = b0 | 32;
          u1 = b1;
          u2 = b2;
          u3 = b3;
          cpLen = 1;
        } else if (b0 >= 194 && b0 <= 223) {
          u0 = b0;
          u1 = b1 ^ 32;
          u2 = b2;
          u3 = b3;
          cpLen = 2;
        } else if (b0 >= 224 && b0 <= 239) {
          u0 = b0;
          u1 = b1;
          u2 = b2 ^ 5;
          u3 = b3;
          cpLen = 3;
        } else
          continue;
        const h = (u0 | u1 << 8 | u2 << 16 | u3 << 24) >>> 0, bucket = dictHash.table.get(h);
        if (!bucket)
          continue;
        for (let i = 0;i < bucket.length; ++i) {
          const c = bucket[i];
          if (hashStart + c.len > end)
            continue;
          if (words[c.off] !== u0)
            continue;
          if (cpLen >= 2 && words[c.off + 1] !== u1)
            continue;
          if (cpLen >= 3 && words[c.off + 2] !== u2)
            continue;
          let m = 4;
          while (m < c.len && data[hashStart + m] === words[c.off + m])
            ++m;
          if (m !== c.len)
            continue;
          const sufStart = hashStart + c.len, sufs = g.suffixes;
          for (let si = 0;si < sufs.length; ++si) {
            const sb = sufs[si].suffix, sl = sb.length;
            if (sufStart + sl > end)
              continue;
            let sm = 0;
            while (sm < sl && data[sufStart + sm] === sb[sm])
              ++sm;
            if (sm !== sl)
              continue;
            const ol = preLen + c.len + sl;
            if (ol > bestOutLen) {
              bestOutLen = ol;
              bestDictLen = c.len;
              bestIdx = c.idx;
              bestTransform = sufs[si].id;
            }
            break;
          }
        }
      }
      const faGroups = _faTransformGroups;
      for (let gi = 0;gi < faGroups.length; ++gi) {
        const g = faGroups[gi], pre = g.prefix, preLen = pre.length;
        if (pos + preLen + 4 > end)
          continue;
        let mp = 0;
        while (mp < preLen && data[pos + mp] === pre[mp])
          ++mp;
        if (mp !== preLen)
          continue;
        const hashStart = pos + preLen, u0a = data[hashStart], u1a = data[hashStart + 1], u2a = data[hashStart + 2], u3a = data[hashStart + 3];
        let u0, u1, u2, u3, validCp = !0, hasFermented = !1, i = 0;
        if (u0a < 128)
          if (u0a >= 97 && u0a <= 122)
            validCp = !1;
          else if (u0a >= 65 && u0a <= 90) {
            u0 = u0a | 32;
            hasFermented = !0;
            i = 1;
          } else {
            u0 = u0a;
            i = 1;
          }
        else if (u0a >= 194 && u0a <= 223) {
          u0 = u0a;
          u1 = u1a ^ 32;
          hasFermented = !0;
          i = 2;
        } else if (u0a >= 224 && u0a <= 239) {
          u0 = u0a;
          u1 = u1a;
          u2 = u2a ^ 5;
          hasFermented = !0;
          i = 3;
        } else
          validCp = !1;
        if (validCp && i < 4) {
          const b = i === 1 ? u1a : i === 2 ? u2a : u3a;
          if (b < 128)
            if (b >= 97 && b <= 122)
              validCp = !1;
            else if (b >= 65 && b <= 90) {
              if (i === 1)
                u1 = b | 32;
              else if (i === 2)
                u2 = b | 32;
              else
                u3 = b | 32;
              hasFermented = !0;
              i += 1;
            } else {
              if (i === 1)
                u1 = b;
              else if (i === 2)
                u2 = b;
              else
                u3 = b;
              i += 1;
            }
          else if (b >= 194 && b <= 223)
            if (i + 2 > 4) {
              if (i === 3)
                u3 = b;
              i = 4;
            } else {
              const nb = i === 1 ? u2a : u3a;
              if (i === 1) {
                u1 = b;
                u2 = nb ^ 32;
              } else {
                u2 = b;
                u3 = nb ^ 32;
              }
              hasFermented = !0;
              i += 2;
            }
          else if (b >= 224 && b <= 239)
            if (i + 3 > 4) {
              if (i === 1) {
                u1 = b;
                u2 = u2a;
              } else if (i === 2) {
                u2 = b;
                u3 = u3a;
              } else
                u3 = b;
              i = 4;
            } else {
              u1 = b;
              u2 = u2a;
              u3 = u3a ^ 5;
              hasFermented = !0;
              i = 4;
            }
          else
            validCp = !1;
        }
        if (validCp && i < 4) {
          const b = i === 2 ? u2a : u3a;
          if (b < 128)
            if (b >= 97 && b <= 122)
              validCp = !1;
            else if (b >= 65 && b <= 90) {
              if (i === 2)
                u2 = b | 32;
              else
                u3 = b | 32;
              hasFermented = !0;
              i += 1;
            } else {
              if (i === 2)
                u2 = b;
              else
                u3 = b;
              i += 1;
            }
          else if (b >= 194 && b <= 223)
            if (i + 2 > 4) {
              if (i === 3)
                u3 = b;
              i = 4;
            } else {
              u2 = b;
              u3 = u3a ^ 32;
              hasFermented = !0;
              i = 4;
            }
          else
            validCp = !1;
        }
        if (validCp && i < 4) {
          const b = u3a;
          if (b < 128)
            if (b >= 97 && b <= 122)
              validCp = !1;
            else if (b >= 65 && b <= 90) {
              u3 = b | 32;
              hasFermented = !0;
            } else
              u3 = b;
          else
            validCp = !1;
        }
        if (!validCp || !hasFermented)
          continue;
        const h = (u0 | u1 << 8 | u2 << 16 | u3 << 24) >>> 0, bucket = dictHash.table.get(h);
        if (!bucket)
          continue;
        for (let bi = 0;bi < bucket.length; ++bi) {
          const c = bucket[bi];
          if (hashStart + c.len > end)
            continue;
          let m = 0, ok = !0;
          while (m < c.len) {
            const w0 = words[c.off + m], cpKind = w0 < 128 ? 1 : w0 < 224 ? 2 : 3;
            if (m + cpKind > c.len) {
              while (m < c.len) {
                if (data[hashStart + m] !== words[c.off + m]) {
                  ok = !1;
                  break;
                }
                ++m;
              }
              break;
            }
            if (cpKind === 1) {
              const expected = w0 >= 97 && w0 <= 122 ? w0 ^ 32 : w0;
              if (data[hashStart + m] !== expected) {
                ok = !1;
                break;
              }
              m += 1;
            } else if (cpKind === 2) {
              if (data[hashStart + m] !== w0) {
                ok = !1;
                break;
              }
              const w1 = words[c.off + m + 1];
              if (data[hashStart + m + 1] !== (w1 ^ 32)) {
                ok = !1;
                break;
              }
              m += 2;
            } else {
              if (data[hashStart + m] !== w0) {
                ok = !1;
                break;
              }
              if (data[hashStart + m + 1] !== words[c.off + m + 1]) {
                ok = !1;
                break;
              }
              const w2 = words[c.off + m + 2];
              if (data[hashStart + m + 2] !== (w2 ^ 5)) {
                ok = !1;
                break;
              }
              m += 3;
            }
          }
          if (!ok)
            continue;
          const sufStart = hashStart + c.len, sufs = g.suffixes;
          for (let si = 0;si < sufs.length; ++si) {
            const sb = sufs[si].suffix, sl = sb.length;
            if (sufStart + sl > end)
              continue;
            let sm = 0;
            while (sm < sl && data[sufStart + sm] === sb[sm])
              ++sm;
            if (sm !== sl)
              continue;
            const ol = preLen + c.len + sl;
            if (ol > bestOutLen) {
              bestOutLen = ol;
              bestDictLen = c.len;
              bestIdx = c.idx;
              bestTransform = sufs[si].id;
            }
            break;
          }
        }
      }
      if (pos + 4 <= end && dictHash.ofTables) {
        const h = (data[pos] | data[pos + 1] << 8 | data[pos + 2] << 16 | data[pos + 3] << 24) >>> 0;
        for (let ki = 0;ki < _OF_K_VALUES.length; ++ki) {
          const k = _OF_K_VALUES[ki], ofTable = dictHash.ofTables[k];
          if (!ofTable)
            continue;
          const bucket = ofTable.get(h);
          if (!bucket)
            continue;
          const ofTid = _OF_TID_BY_K.get(k);
          for (let i = 0;i < bucket.length; ++i) {
            const c = bucket[i], bodyLen = c.len - k;
            if (pos + bodyLen > end)
              continue;
            let m = 4;
            while (m < bodyLen && data[pos + m] === words[c.off + k + m])
              ++m;
            if (m !== bodyLen)
              continue;
            if (bodyLen > bestOutLen) {
              bestOutLen = bodyLen;
              bestDictLen = c.len;
              bestIdx = c.idx;
              bestTransform = ofTid;
            }
          }
        }
      }
      return bestOutLen >= minLen ? { outputLen: bestOutLen, dictLen: bestDictLen, idx: bestIdx, transformId: bestTransform } : null;
    }
    function _augmentWithStaticDictRefs(commands, data, dictHash, windowSize, customMatchFinder, lz77PrefixLen) {
      const augmented = [];
      let outPos = 0;
      const MIN_DICT_MATCH = 6, L = lz77PrefixLen | 0;
      for (let ci = 0;ci < commands.length; ++ci) {
        const cmd = commands[ci], litEnd = cmd.insertStart + cmd.insertLen;
        let litStart = cmd.insertStart, pos = litStart;
        while (pos < litEnd) {
          let m, wordId, dictWordOff;
          if (customMatchFinder) {
            m = customMatchFinder(data, pos, litEnd, MIN_DICT_MATCH);
            if (!m) {
              pos++;
              continue;
            }
            wordId = m.wordId;
            dictWordOff = null;
          } else {
            m = _findStaticDictMatchAt(data, pos, litEnd, dictHash, MIN_DICT_MATCH);
            if (!m) {
              pos++;
              continue;
            }
            wordId = m.transformId * brotliDict.NWORDS(m.dictLen) + m.idx;
            dictWordOff = brotliDict.DOFFSET(m.dictLen) + m.dictLen * m.idx;
          }
          const outAtDictRef = outPos + (pos - litStart), dictDistance = (outAtDictRef < windowSize ? outAtDictRef : windowSize) + 1 + L + wordId;
          if (!_distanceCodeFor(dictDistance, 0, 0)) {
            pos++;
            continue;
          }
          augmented.push({
            insertStart: litStart,
            insertLen: pos - litStart,
            copyLen: m.dictLen,
            distance: dictDistance,
            isDictRef: !0,
            dictOutputLen: m.outputLen,
            dictWordOff
          });
          outPos = outAtDictRef + m.outputLen;
          pos += m.outputLen;
          litStart = pos;
        }
        if (litEnd === litStart && cmd.copyLen === 0)
          continue;
        augmented.push({
          insertStart: litStart,
          insertLen: litEnd - litStart,
          copyLen: cmd.copyLen,
          distance: cmd.distance,
          isDictRef: !1
        });
        outPos += litEnd - litStart + cmd.copyLen;
      }
      return augmented;
    }
    const _DIST_PARAM_CANDIDATES = [
      { npostfix: 0, ndirectHi: 0 },
      { npostfix: 0, ndirectHi: 4 },
      { npostfix: 0, ndirectHi: 8 },
      { npostfix: 0, ndirectHi: 12 },
      { npostfix: 1, ndirectHi: 0 },
      { npostfix: 2, ndirectHi: 0 },
      { npostfix: 3, ndirectHi: 0 }
    ];
    function _blockCountCodeFor(count) {
      for (let s = 0;s < 26; ++s) {
        const base = _BLOCK_COUNT_BASE[s], extraBits = _BLOCK_COUNT_EXTRA[s], max = base + (1 << extraBits) - 1;
        if (count >= base && count <= max)
          return { sym: s, extra: count - base, extraBits };
      }
      return null;
    }
    function _pickLitBlockSplit(data, quality) {
      if (data.length < 32768)
        return null;
      if (quality < 6)
        return null;
      const half = data.length >> 1, freqA = new Int32Array(256), freqB = new Int32Array(256);
      for (let i = 0;i < half; ++i)
        ++freqA[data[i]];
      for (let i = half;i < data.length; ++i)
        ++freqB[data[i]];
      const totalA = half, totalB = data.length - half, epsA = 1 / (totalA + 256);
      let kl = 0;
      for (let s = 0;s < 256; ++s) {
        if (freqB[s] === 0)
          continue;
        const pA = freqA[s] / totalA || epsA, pB = freqB[s] / totalB;
        kl += pB * Math.log2(pB / pA);
      }
      return kl > 0.3 ? { splitBytePos: half } : null;
    }
    function _pickDistParams(cmds) {
      const distances = [];
      for (let i = 0;i < cmds.length; ++i) {
        const c = cmds[i];
        if (c.copyLen > 0 && c.distance > 0)
          distances.push(c.distance);
      }
      if (distances.length === 0)
        return { npostfix: 0, ndirect: 0, distAlphabet: 64 };
      let bestScore = 1 / 0, bestNpost = 0, bestNdir = 0, bestAlpha = 64;
      for (const cand of _DIST_PARAM_CANDIDATES) {
        const np = cand.npostfix, nd = cand.ndirectHi << np, alpha = 16 + nd + (48 << np);
        if (alpha > 520)
          continue;
        const cnt = new Int32Array(alpha);
        let extraBitsSum = 0, valid = !0;
        for (const d of distances) {
          const enc = _distanceCodeFor(d, np, nd);
          if (!enc || enc.dsym >= alpha) {
            valid = !1;
            break;
          }
          ++cnt[enc.dsym];
          extraBitsSum += enc.extraBits;
        }
        if (!valid)
          continue;
        const total = distances.length;
        let entropyBits = 0;
        const logTotal = Math.log2(total);
        for (let s = 0;s < alpha; ++s) {
          const c = cnt[s];
          if (c > 0)
            entropyBits += c * (logTotal - Math.log2(c));
        }
        const headerOverheadBits = alpha * 5, score = entropyBits + extraBitsSum + headerOverheadBits;
        if (score < bestScore) {
          bestScore = score;
          bestNpost = np;
          bestNdir = nd;
          bestAlpha = alpha;
        }
      }
      return { npostfix: bestNpost, ndirect: bestNdir, distAlphabet: bestAlpha };
    }
    function _encodeCompressed(data, opts) {
      const len = data.length, ntreesL = _NTREESL_OPT, _ext = opts && opts._ext || null, largeWindow = !!(_ext && _ext.largeWindow), wbits = _ext && _ext.windowBits || 22;
      if (!largeWindow && (wbits < 10 || wbits > 24))
        _err("EBADARG", "wbits " + wbits + " out of RFC 7932 range [10, 24]");
      if (largeWindow && (wbits < 10 || wbits > 50))
        _err("EBADARG", "large window wbits " + wbits + " out of supported [10, 50]");
      const windowSize = wbits >= 31 ? Math.pow(2, wbits) - 16 : (1 << wbits) - 16, cmode = _pickCMode(data), ext = opts && opts._ext || null;
      let lz77Prefix = ext && ext.lz77Prefix || null;
      if (lz77Prefix && !(lz77Prefix instanceof u8))
        _err("EBADARG", "_ext.lz77Prefix must be Uint8Array");
      if (lz77Prefix && lz77Prefix.length + data.length > windowSize)
        lz77Prefix = null;
      const prefixLen = lz77Prefix ? lz77Prefix.length : 0;
      let inputBuf = data;
      if (prefixLen > 0) {
        inputBuf = new u8(prefixLen + data.length);
        inputBuf.set(lz77Prefix, 0);
        inputBuf.set(data, prefixLen);
      }
      const commands = [];
      let insertStart = 0, insertLen = 0;
      const quality = opts && opts.quality != null ? opts.quality : 6, qParams = quality <= 1 ? { chainDepth: 2, lazy: !1 } : quality <= 3 ? { chainDepth: 4, lazy: !1 } : quality <= 5 ? { chainDepth: 6, lazy: !0 } : quality <= 7 ? { chainDepth: 10, lazy: !0 } : quality <= 9 ? { chainDepth: 16, lazy: !0 } : { chainDepth: 32, lazy: !0 };
      lz77.encode(inputBuf, { windowBits: 21, minMatch: 4, ...qParams }, {
        literal(pos) {
          if (pos < prefixLen)
            return;
          const dpos = pos - prefixLen;
          if (insertLen === 0)
            insertStart = dpos;
          insertLen++;
        },
        match(pos, mlen, dist) {
          if (pos < prefixLen)
            return;
          while (insertLen > 22593) {
            commands.push({ insertStart, insertLen: 22593, copyLen: 2, distance: 1 });
            insertStart += 22593;
            insertLen -= 22593;
          }
          commands.push({ insertStart, insertLen, copyLen: mlen, distance: dist });
          insertStart = 0;
          insertLen = 0;
        }
      });
      if (insertLen > 0)
        commands.push({ insertStart, insertLen, copyLen: 0, distance: 0 });
      if (commands.length === 0)
        commands.push({ insertStart: 0, insertLen: 0, copyLen: 0, distance: 0 });
      const customMatchFinder = _ext && _ext.findCustomDictMatch, dictHash = customMatchFinder ? null : _getStaticDictHash(), cmds = customMatchFinder || dictHash ? _augmentWithStaticDictRefs(commands, data, dictHash, windowSize, customMatchFinder, prefixLen) : commands, distParams = _pickDistParams(cmds), npostfix = distParams.npostfix, ndirect = distParams.ndirect, distAlphabet = distParams.distAlphabet, splitLiteral = _pickLitBlockSplit(data, quality), useSplit = !!splitLiteral, ntreesLActual = useSplit ? 8 : ntreesL, litFreqPerTree = Array(ntreesLActual);
      for (let t = 0;t < ntreesLActual; ++t)
        litFreqPerTree[t] = new Int32Array(256);
      const iacFreq = new Int32Array(704), distFreq = new Int32Array(distAlphabet), cmdAux = Array(cmds.length);
      let outPos = 0, p1 = 0, p2 = 0;
      const splitBytePos = useSplit ? splitLiteral.splitBytePos : -1;
      let litCountBlock0 = 0, litCountBlock1 = 0;
      for (let ci = 0;ci < cmds.length; ++ci) {
        const c = cmds[ci];
        for (let k = 0;k < c.insertLen; ++k) {
          const byte = data[c.insertStart + k], ctxId = _contextIdLit(cmode, p1, p2), baseTree = _clusterContext(ctxId), inBlock1 = useSplit && outPos >= splitBytePos, treeId = inBlock1 ? 4 + baseTree : baseTree;
          ++litFreqPerTree[treeId][byte];
          if (useSplit)
            if (inBlock1)
              ++litCountBlock1;
            else
              ++litCountBlock0;
          p2 = p1;
          p1 = byte;
          ++outPos;
        }
        const isLastNoCopy = c.copyLen === 0, effCopyLen = isLastNoCopy ? 2 : c.copyLen, ic = _insertCodeFor(c.insertLen), cc = _copyCodeFor(effCopyLen);
        if (!ic || !cc)
          _err("EINTERNAL", "cannot encode I=" + c.insertLen + " C=" + effCopyLen);
        const iacSym = _findIacSym(ic.code, cc.code, !1);
        if (iacSym < 0)
          _err("EINTERNAL", "no IAC sym for I=" + ic.code + " C=" + cc.code);
        ++iacFreq[iacSym];
        let distEnc = null;
        if (!isLastNoCopy) {
          distEnc = _distanceCodeFor(c.distance, npostfix, ndirect);
          if (!distEnc || distEnc.dsym >= distAlphabet)
            _err("EINTERNAL", "distance " + c.distance + " outside alphabet");
          ++distFreq[distEnc.dsym];
          if (c.isDictRef) {
            const inputPos = c.insertStart + c.insertLen, outLen = c.dictOutputLen != null ? c.dictOutputLen : c.copyLen;
            for (let k = 0;k < outLen; ++k) {
              const byte = data[inputPos + k];
              p2 = p1;
              p1 = byte;
              ++outPos;
            }
          } else
            for (let k = 0;k < c.copyLen; ++k) {
              const srcPos = outPos - c.distance, byte = srcPos >= 0 ? data[srcPos] : lz77Prefix[prefixLen + srcPos];
              p2 = p1;
              p1 = byte;
              ++outPos;
            }
        }
        cmdAux[ci] = { ic, cc, iacSym, distEnc };
      }
      let useSplitFinal = useSplit;
      if (useSplit && (litCountBlock0 === 0 || litCountBlock1 === 0)) {
        for (let t = 0;t < 4; ++t) {
          const src = litFreqPerTree[4 + t], dst = litFreqPerTree[t];
          for (let s = 0;s < 256; ++s)
            dst[s] += src[s];
        }
        useSplitFinal = !1;
      }
      const nbltypesLFinal = useSplitFinal ? 2 : 1, ntreesLFinal = useSplitFinal ? 8 : 4;
      for (let t = 0;t < ntreesLFinal; ++t)
        _padFreqs(litFreqPerTree[t]);
      _padFreqs(iacFreq);
      _padFreqs(distFreq);
      const litTrees = Array(ntreesLFinal), litLensArr = Array(ntreesLFinal), litMapArr = Array(ntreesLFinal);
      for (let t = 0;t < ntreesLFinal; ++t) {
        const tr = huffman.buildTree(litFreqPerTree[t], 15);
        litTrees[t] = tr;
        litLensArr[t] = _padTo(tr.t, 256);
        litMapArr[t] = huffman.buildMap(litLensArr[t], Math.max(tr.l, 1), 0);
      }
      const iacTree = huffman.buildTree(iacFreq, 15), distTree = huffman.buildTree(distFreq, 15), iacLens = _padTo(iacTree.t, 704), distLens = _padTo(distTree.t, distAlphabet), iacMap = huffman.buildMap(iacLens, Math.max(iacTree.l, 1), 0), distMap = huffman.buildMap(distLens, Math.max(distTree.l, 1), 0), cmapLSize = 64 * nbltypesLFinal, cmapL = new u8(cmapLSize);
      for (let i = 0;i < 64; ++i) {
        const cl = _clusterContext(i);
        cmapL[i] = cl;
        if (useSplitFinal)
          cmapL[64 + i] = 4 + cl;
      }
      const w = _makeWriter(len + 256);
      _emitWBITS(w, wbits, largeWindow);
      w.bits(1, 1);
      w.bits(1, 0);
      let mnibbles, mnibblesCode;
      if (len <= 65536) {
        mnibbles = 4;
        mnibblesCode = 0;
      } else if (len <= 1048576) {
        mnibbles = 5;
        mnibblesCode = 1;
      } else {
        mnibbles = 6;
        mnibblesCode = 2;
      }
      w.bits(2, mnibblesCode);
      if (mnibbles <= 4)
        w.bits(mnibbles * 4, len - 1 & 65535);
      else if (mnibbles === 5)
        w.bits(20, len - 1 & 1048575);
      else
        w.bits(24, len - 1 & 16777215);
      let blTypeMap = null, blTypeLens = null, blLenMap = null, blLenLens = null, blcL1 = null;
      const splitL0 = useSplitFinal ? litCountBlock0 : 0;
      if (useSplitFinal) {
        _emitVarLenCount(w, 2);
        const blTypeFreq = new Int32Array(4);
        blTypeFreq[0] = 1;
        blTypeFreq[1] = 1;
        const blTypeTree = huffman.buildTree(blTypeFreq, 15);
        blTypeLens = _padTo(blTypeTree.t, 4);
        blTypeMap = huffman.buildMap(blTypeLens, Math.max(blTypeTree.l, 1), 0);
        _emitPrefixCodeDescriptor(w, blTypeLens);
        const blcL0 = _blockCountCodeFor(litCountBlock0);
        blcL1 = _blockCountCodeFor(litCountBlock1);
        if (!blcL0 || !blcL1)
          _err("EINTERNAL", "block-length out of range");
        const blLenFreq = new Int32Array(26);
        ++blLenFreq[blcL0.sym];
        ++blLenFreq[blcL1.sym];
        _padFreqs(blLenFreq);
        const blLenTree = huffman.buildTree(blLenFreq, 15);
        blLenLens = _padTo(blLenTree.t, 26);
        blLenMap = huffman.buildMap(blLenLens, Math.max(blLenTree.l, 1), 0);
        _emitPrefixCodeDescriptor(w, blLenLens);
        w.bits(blLenLens[blcL0.sym], blLenMap[blcL0.sym]);
        if (blcL0.extraBits > 0)
          w.bits(blcL0.extraBits, blcL0.extra);
      } else
        w.bits(1, 0);
      w.bits(1, 0);
      w.bits(1, 0);
      w.bits(2, npostfix);
      w.bits(4, ndirect >> npostfix);
      w.bits(2, cmode);
      if (useSplitFinal)
        w.bits(2, cmode);
      _emitVarLenCount(w, ntreesLFinal);
      _emitContextMap(w, cmapL, ntreesLFinal);
      w.bits(1, 0);
      for (let t = 0;t < ntreesLFinal; ++t)
        _emitPrefixCodeDescriptor(w, litLensArr[t]);
      _emitPrefixCodeDescriptor(w, iacLens);
      _emitPrefixCodeDescriptor(w, distLens);
      outPos = 0;
      p1 = 0;
      p2 = 0;
      let splitEmitted = !1, litCount = 0;
      for (let ci = 0;ci < cmds.length; ++ci) {
        const c = cmds[ci], aux = cmdAux[ci];
        w.bits(iacLens[aux.iacSym], iacMap[aux.iacSym]);
        if (aux.ic.extraBits > 0)
          w.bits(aux.ic.extraBits, aux.ic.extra);
        if (aux.cc.extraBits > 0)
          w.bits(aux.cc.extraBits, aux.cc.extra);
        for (let k = 0;k < c.insertLen; ++k) {
          if (useSplitFinal && !splitEmitted && litCount === splitL0) {
            w.bits(blTypeLens[1], blTypeMap[1]);
            w.bits(blLenLens[blcL1.sym], blLenMap[blcL1.sym]);
            if (blcL1.extraBits > 0)
              w.bits(blcL1.extraBits, blcL1.extra);
            splitEmitted = !0;
          }
          const byte = data[c.insertStart + k], ctxId = _contextIdLit(cmode, p1, p2), baseTree = _clusterContext(ctxId), treeId = useSplitFinal && litCount >= splitL0 ? 4 + baseTree : baseTree;
          w.bits(litLensArr[treeId][byte], litMapArr[treeId][byte]);
          ++litCount;
          p2 = p1;
          p1 = byte;
          ++outPos;
        }
        if (aux.distEnc) {
          w.bits(distLens[aux.distEnc.dsym], distMap[aux.distEnc.dsym]);
          if (aux.distEnc.extraBits > 0)
            w.bits(aux.distEnc.extraBits, aux.distEnc.extra);
          if (c.isDictRef) {
            const inputPos = c.insertStart + c.insertLen, outLen = c.dictOutputLen != null ? c.dictOutputLen : c.copyLen;
            for (let k = 0;k < outLen; ++k) {
              const byte = data[inputPos + k];
              p2 = p1;
              p1 = byte;
              ++outPos;
            }
          } else
            for (let k = 0;k < c.copyLen; ++k) {
              const srcPos = outPos - c.distance, byte = srcPos >= 0 ? data[srcPos] : lz77Prefix[prefixLen + srcPos];
              p2 = p1;
              p1 = byte;
              ++outPos;
            }
        }
      }
      w.align();
      return w.bytes();
    }
    function brotliCompressSync(data, opts) {
      if (!(data instanceof u8))
        _err("EBADARG", "expected Uint8Array");
      const quality = opts && opts.quality != null ? opts.quality : 6;
      if (typeof quality !== "number" || quality < 0 || quality > 11 || (quality | 0) !== quality)
        _err("EBADARG", "quality must be an integer in [0, 11], got " + quality);
      if (quality === 0 || data.length < 32 || data.length > 16777216)
        return _encodeUncompressed(data);
      try {
        const compressed = _encodeCompressed(data, opts), trivial = _encodeUncompressed(data);
        return compressed.length <= trivial.length ? compressed : trivial;
      } catch (e) {
        if (e.code === "EINTERNAL")
          return _encodeUncompressed(data);
        throw e;
      }
    }
    function brotliCompress(data, opts) {
      return new Promise((resolve, reject) => {
        queueMicrotask(() => {
          try {
            resolve(brotliCompressSync(data, opts));
          } catch (e) {
            reject(e);
          }
        });
      });
    }
    function brotliDecompress(data, opts) {
      return new Promise((resolve, reject) => {
        queueMicrotask(() => {
          try {
            resolve(brotliDecompressSync(data, opts));
          } catch (e) {
            reject(e);
          }
        });
      });
    }
    function _bufferPush(self, chunk, final) {
      if (!self.ondata)
        _err("EBADARG", "stream: no ondata handler set");
      if (self._done)
        _err("ESTREAMEND", "stream already finalised");
      if (chunk != null && chunk.length > 0) {
        if (!(chunk instanceof u8))
          _err("EBADARG", "stream.push: chunk must be Uint8Array");
        self._chunks.push(chunk);
        self._totalLen += chunk.length;
      }
      if (final) {
        self._done = !0;
        let full;
        if (self._chunks.length === 0)
          full = new u8(0);
        else if (self._chunks.length === 1)
          full = self._chunks[0];
        else {
          full = new u8(self._totalLen);
          let off = 0;
          for (const c of self._chunks) {
            full.set(c, off);
            off += c.length;
          }
        }
        self._chunks = null;
        const out = self._sync(full, self._opts);
        self.ondata(out, !0);
      }
    }
    function BrotliCompressStream(opts, ondata) {
      if (typeof opts === "function") {
        ondata = opts;
        opts = {};
      }
      this.ondata = ondata;
      this._opts = opts || {};
      this._chunks = [];
      this._totalLen = 0;
      this._done = !1;
    }
    BrotliCompressStream.prototype.push = function(chunk, final) {
      this._sync = brotliCompressSync;
      _bufferPush(this, chunk, final);
    };
    function _saveDecoderState(state) {
      return {
        outLen: state.outLen,
        p1: state.p1,
        p2: state.p2,
        lastDist: new Int32Array(state.lastDist)
      };
    }
    function _restoreDecoderState(state, saved) {
      state.outLen = saved.outLen;
      state.p1 = saved.p1;
      state.p2 = saved.p2;
      state.lastDist.set(saved.lastDist);
    }
    function BrotliDecompressStream(opts, ondata) {
      if (typeof opts === "function") {
        ondata = opts;
        opts = {};
      }
      this.ondata = ondata;
      this._opts = opts || {};
      this._chunks = [];
      this._totalLen = 0;
      this._done = !1;
      this._consumedBits = 0;
      this._emittedLen = 0;
      this._state = null;
      this._initDone = !1;
    }
    BrotliDecompressStream.prototype.push = function(chunk, final) {
      if (!this.ondata)
        _err("EBADARG", "stream: no ondata handler set");
      if (this._done)
        _err("ESTREAMEND", "stream already finalised");
      if (chunk != null && chunk.length > 0) {
        if (!(chunk instanceof u8))
          _err("EBADARG", "stream.push: chunk must be Uint8Array");
        this._chunks.push(chunk);
        this._totalLen += chunk.length;
      }
      let buf;
      if (this._chunks.length === 0)
        buf = new u8(0);
      else if (this._chunks.length === 1)
        buf = this._chunks[0];
      else {
        buf = new u8(this._totalLen);
        let off = 0;
        for (const c of this._chunks) {
          buf.set(c, off);
          off += c.length;
        }
        this._chunks = [buf];
      }
      const r = _makeReader(buf, !final);
      r.p = this._consumedBits;
      if (!this._initDone) {
        const savedP = r.p;
        try {
          const ext = this._opts && this._opts._ext || null, wbitsInfo = _readWBITS(r, ext && ext.allowLargeWindow), wbits = wbitsInfo.wbits, windowSize = wbits >= 31 ? Math.pow(2, wbits) - 16 : (1 << wbits) - 16;
          this._state = {
            out: new u8(1024),
            outLen: 0,
            p1: 0,
            p2: 0,
            lastDist: new Int32Array([4, 11, 15, 16]),
            windowSize,
            lz77Dict: ext && ext.lz77Dict || null,
            largeWindow: wbitsInfo.largeWindow,
            resolveStaticDictRef: ext && ext.resolveStaticDictRef || null
          };
          this._initDone = !0;
          this._consumedBits = r.p;
        } catch (e) {
          if (e.code === "EAGAIN") {
            r.p = savedP;
            return;
          }
          throw e;
        }
      }
      while (!this._done) {
        const savedP = r.p, savedState = _saveDecoderState(this._state);
        try {
          const res = _decodeMetaBlockInto(r, this._state);
          this._consumedBits = r.p;
          if (res.last) {
            _verifyByteTailZero(r);
            this._done = !0;
          }
        } catch (e) {
          if (e.code === "EAGAIN") {
            r.p = savedP;
            _restoreDecoderState(this._state, savedState);
            break;
          }
          throw e;
        }
      }
      if (this._state.outLen > this._emittedLen) {
        const slice = this._state.out.slice(this._emittedLen, this._state.outLen);
        this._emittedLen = this._state.outLen;
        this.ondata(slice, this._done);
      } else if (this._done)
        this.ondata(new u8(0), !0);
      else if (final && !this._done)
        _err("EBADSTREAM", "stream finalised with unconsumed input or unterminated stream");
      if (this._chunks.length === 1) {
        const consumedBytes = this._consumedBits >> 3;
        if (consumedBytes > 0 && consumedBytes < this._chunks[0].length) {
          this._chunks[0] = this._chunks[0].subarray(consumedBytes);
          this._totalLen -= consumedBytes;
          this._consumedBits &= 7;
        } else if (consumedBytes === this._chunks[0].length) {
          this._chunks = [];
          this._totalLen = 0;
          this._consumedBits = this._consumedBits & 7;
        }
      }
    };
    return {
      brotliCompressSync,
      brotliDecompressSync,
      brotliCompress,
      brotliDecompress,
      BrotliCompressStream,
      BrotliDecompressStream,
      _internal: {
        makeReader: _makeReader,
        readBit: _readBit,
        readBits: _readBits,
        readBitsBig: _readBitsBig,
        readWBITS: _readWBITS,
        readPrefixCode: _readPrefixCode,
        readVarLenCount: _readVarLenCount,
        readBlockCount: _readBlockCount,
        readRleMax: _readRleMax,
        inverseMoveToFront: _inverseMoveToFront,
        readContextMap: _readContextMap,
        readCompressedMetaBlockHeader: _readCompressedMetaBlockHeader,
        splitIacSym: _splitIacSym,
        decodeDistanceSymbol: _decodeDistanceSymbol,
        contextIdLit: _contextIdLit,
        LUT0: _LUT0,
        LUT1: _LUT1,
        LUT2: _LUT2,
        INSERT_BASE: _INSERT_BASE,
        INSERT_EXTRA: _INSERT_EXTRA,
        COPY_BASE: _COPY_BASE,
        COPY_EXTRA: _COPY_EXTRA,
        encodeUncompressed: _encodeUncompressed
      }
    };
  } });

    // fonts-local factories — inlined and topo-ordered.
    __register({ name: "fontErrors", dependencies: [], factory: function () {
        class FontError extends Error {
            constructor(code, message, opts) {
                super(message);
                this.name = new.target.name;
                this.code = code;
                if (opts && opts.context) this.context = opts.context;
                if (opts && opts.cause)   this.cause = opts.cause;
            }
        }
        class ParseError    extends FontError {}
        class RenderError   extends FontError {}
        class ContractError extends FontError {}
        function isFontError(e) { return e instanceof FontError; }
        return {
            FontError, ParseError, RenderError, ContractError,
            isFontError
        };
    } });
    __register({ name: "fontsShared", dependencies: [], factory: function() {
    const SFNT_FLAVOR = Object.freeze({
      TRUETYPE: "truetype",
      OPENTYPE: "opentype",
      APPLE_TRUE: "apple-true",
      APPLE_TYP1: "apple-typ1"
    });
    function flavorFromVersion(v) {
      switch (v >>> 0) {
        case 65536:
          return SFNT_FLAVOR.TRUETYPE;
        case 1330926671:
          return SFNT_FLAVOR.OPENTYPE;
        case 1953658213:
          return SFNT_FLAVOR.APPLE_TRUE;
        case 1954115633:
          return SFNT_FLAVOR.APPLE_TYP1;
        default:
          return null;
      }
    }
    function versionFromFlavor(f) {
      switch (f) {
        case SFNT_FLAVOR.TRUETYPE:
          return 65536;
        case SFNT_FLAVOR.OPENTYPE:
          return 1330926671;
        case SFNT_FLAVOR.APPLE_TRUE:
          return 1953658213;
        case SFNT_FLAVOR.APPLE_TYP1:
          return 1954115633;
        default:
          return 65536;
      }
    }
    function sfntSearchParams(numTables) {
      let entrySelector = 0, maxPow2 = 1;
      while (maxPow2 * 2 <= numTables) {
        maxPow2 *= 2;
        entrySelector++;
      }
      const searchRange = maxPow2 * 16, rangeShift = numTables * 16 - searchRange;
      return { searchRange, entrySelector, rangeShift };
    }
    return {
      SFNT_TT_OUTLINES: 65536,
      SFNT_CFF_OUTLINES: 1330926671,
      SFNT_APPLE_TRUE: 1953658213,
      SFNT_APPLE_TYP1: 1954115633,
      TTC_MAGIC: 1953784678,
      WOFF_MAGIC: 2001684038,
      WOFF2_MAGIC: 2001684018,
      CHECKSUM_MAGIC: 2981146554,
      SFNT_FLAVOR,
      flavorFromVersion,
      versionFromFlavor,
      sfntSearchParams
    };
  } });
    __register({ name: "fontFixed", dependencies: [], factory: function() {
    function fixedFromInt32(i) {
      const u = i >>> 0;
      return (u & 2147483648 ? u - 4294967296 : u) / 65536;
    }
    function fixedToInt32(v) {
      return Math.round(v * 65536) | 0;
    }
    function f2dot14FromInt16(i) {
      const raw = i & 65535;
      return (raw & 32768 ? raw - 65536 : raw) / 16384;
    }
    function f2dot14ToInt16(v) {
      let r = Math.round(v * 16384);
      if (r >= 32768)
        r = 32767;
      if (r < -32768)
        r = -32768;
      return r | 0;
    }
    function decodeVersion16Dot16(i) {
      return { major: i >>> 16 & 65535, minor: i & 65535 };
    }
    function encodeVersion16Dot16(major, minor) {
      return ((major & 65535) << 16 | minor & 65535) >>> 0;
    }
    return {
      fixedFromInt32,
      fixedToInt32,
      f2dot14FromInt16,
      f2dot14ToInt16,
      decodeVersion16Dot16,
      encodeVersion16Dot16
    };
  } });
    __register({ name: "fontReader", dependencies: ["fontErrors","binaryReader","fontFixed"], factory: function(errors, fwR, fixedMod) {
    const { ParseError } = errors, fwApi = fwR, { fixedFromInt32, f2dot14FromInt16 } = fixedMod;
    function _translate(e) {
      if (e && e.name === "ContractError") {
        const code = typeof e.code === "string" && e.code.startsWith("binary/reader-") ? e.code.replace("binary/reader-", "fonts/reader-") : "fonts/reader-error";
        return new ParseError(code, e.message, { context: e.context || {}, cause: e });
      }
      return e;
    }

    class BinaryReader {
      constructor(bytes, start, length) {
        if (!(bytes instanceof Uint8Array))
          throw new ParseError("fonts/reader-input", "BinaryReader expects Uint8Array", { context: { actual: typeof bytes } });
        const s = start || 0, l = length == null ? bytes.length - s : length;
        if (s < 0 || l < 0 || s + l > bytes.length)
          throw new ParseError("fonts/reader-range", "BinaryReader range out of bounds", { context: { start: s, length: l, bufferLength: bytes.length } });
        const window = bytes.subarray(s, s + l);
        this._bytes = bytes;
        this._start = s;
        this._length = l;
        this._r = fwApi.create(window, { endian: "be" });
      }
      get pos() {
        return this._r.pos;
      }
      get length() {
        return this._length;
      }
      get eof() {
        return this._r.eof();
      }
      seek(p) {
        if (p < 0 || p > this._length)
          throw new ParseError("fonts/reader-seek", "seek out of bounds", { context: { pos: p, length: this._length } });
        this._r.seek(p);
        return this;
      }
      skip(n) {
        this.seek(this._r.pos + n);
        return this;
      }
      readBytes(n) {
        try {
          return this._r.bytes(n);
        } catch (e) {
          throw _translate(e);
        }
      }
      readBytesCopy(n) {
        return new Uint8Array(this.readBytes(n));
      }
      readUint8() {
        try {
          return this._r.u8();
        } catch (e) {
          throw _translate(e);
        }
      }
      readInt8() {
        try {
          return this._r.i8();
        } catch (e) {
          throw _translate(e);
        }
      }
      readUint16() {
        try {
          return this._r.u16();
        } catch (e) {
          throw _translate(e);
        }
      }
      readInt16() {
        try {
          return this._r.i16();
        } catch (e) {
          throw _translate(e);
        }
      }
      readUint24() {
        try {
          return this._r.u24();
        } catch (e) {
          throw _translate(e);
        }
      }
      readUint32() {
        try {
          return this._r.u32();
        } catch (e) {
          throw _translate(e);
        }
      }
      readInt32() {
        try {
          return this._r.i32();
        } catch (e) {
          throw _translate(e);
        }
      }
      readFixed() {
        return fixedFromInt32(this.readInt32());
      }
      readF2Dot14() {
        return f2dot14FromInt16(this.readInt16());
      }
      readTag() {
        return this.readUint32();
      }
      readLongDateTime() {
        const hi = this.readInt32(), lo = this.readUint32();
        return hi * 4294967296 + lo;
      }
      readOffset16() {
        return this.readUint16();
      }
      readOffset32() {
        return this.readUint32();
      }
      peek(fn) {
        const p = this._r.pos;
        try {
          return fn(this);
        } finally {
          this._r.seek(p);
        }
      }
      sub(start, length) {
        if (start < 0 || start + length > this._length)
          throw new ParseError("fonts/reader-sub", "sub-reader range out of bounds", { context: { start, length, parentLength: this._length } });
        return new BinaryReader(this._bytes, this._start + start, length);
      }
    }
    function reader(bytes, start, length) {
      return new BinaryReader(bytes, start, length);
    }
    function sliceTable(bytes, offset, length) {
      if (!(bytes instanceof Uint8Array))
        throw new ParseError("fonts/reader-input", "sliceTable expects Uint8Array", { context: { actual: typeof bytes } });
      if (offset < 0 || length < 0 || offset + length > bytes.length)
        throw new ParseError("fonts/reader-sub", `sliceTable range [${offset}..${offset + length}) out of bounds (length=${bytes.length})`, { context: { offset, length, bufferLength: bytes.length } });
      return new Uint8Array(bytes.buffer, bytes.byteOffset + offset, length);
    }
    return { BinaryReader, reader, sliceTable };
  } });
    __register({ name: "fontWriter", dependencies: ["fontErrors","binaryWriter","fontFixed"], factory: function(errors, fwW, fixedMod) {
    const { ContractError } = errors, fwApi = fwW, { fixedToInt32, f2dot14ToInt16 } = fixedMod;

    class BinaryWriter {
      constructor(initialCapacity) {
        const cap = initialCapacity > 0 ? initialCapacity | 0 : 256;
        this._w = fwApi.create({ endian: "be", initialSize: cap });
      }
      get pos() {
        return this._w.pos;
      }
      get length() {
        return this._w.length;
      }
      writeUint8(v) {
        this._w.u8(v);
        return this;
      }
      writeInt8(v) {
        this._w.i8(v);
        return this;
      }
      writeUint16(v) {
        this._w.u16(v);
        return this;
      }
      writeInt16(v) {
        this._w.i16(v);
        return this;
      }
      writeUint24(v) {
        this._w.u24(v);
        return this;
      }
      writeUint32(v) {
        this._w.u32(v);
        return this;
      }
      writeInt32(v) {
        this._w.i32(v);
        return this;
      }
      writeFixed(v) {
        return this.writeInt32(fixedToInt32(v));
      }
      writeF2Dot14(v) {
        return this.writeInt16(f2dot14ToInt16(v));
      }
      writeTag(v) {
        if (typeof v === "string") {
          if (v.length !== 4)
            throw new ContractError("fonts/bad-tag", "tag must be a 4-char string", { context: { value: v } });
          for (let i = 0;i < 4; i++) {
            const c = v.charCodeAt(i);
            if (c > 127)
              throw new ContractError("fonts/bad-tag", `tag character ${i} out of ASCII range (got U+${c.toString(16)})`, { context: { value: v, index: i, charCode: c } });
            this.writeUint8(c);
          }
          return this;
        }
        return this.writeUint32(v);
      }
      writeLongDateTime(seconds) {
        const hi = Math.floor(seconds / 4294967296) | 0, lo = seconds - hi * 4294967296 >>> 0;
        this._w.i32(hi);
        this._w.u32(lo);
        return this;
      }
      writeBytes(u8) {
        if (!(u8 instanceof Uint8Array))
          throw new ContractError("fonts/writer-input", "writeBytes expects Uint8Array", { context: { actual: typeof u8 } });
        this._w.bytes(u8);
        return this;
      }
      padTo4() {
        while (this._w.pos & 3)
          this.writeUint8(0);
        return this;
      }
      padTo(align) {
        while (this._w.pos % align)
          this.writeUint8(0);
        return this;
      }
      seek(p) {
        if (p < 0 || p > this._w.length)
          throw new ContractError("fonts/writer-seek", "seek must stay within written area", { context: { pos: p, length: this._w.length } });
        this._w.seek(p);
        return this;
      }
      patchUint32(pos, value) {
        const len = this._w.length;
        if (pos < 0 || pos + 4 > len)
          throw new ContractError("fonts/writer-patch", "patch position out of bounds", { context: { pos, length: len } });
        const save = this._w.pos;
        this._w.seek(pos);
        this._w.u32(value);
        this._w.seek(save);
        return this;
      }
      patchUint16(pos, value) {
        const len = this._w.length;
        if (pos < 0 || pos + 2 > len)
          throw new ContractError("fonts/writer-patch", "patch position out of bounds", { context: { pos, length: len } });
        const save = this._w.pos;
        this._w.seek(pos);
        this._w.u16(value);
        this._w.seek(save);
        return this;
      }
      finalize() {
        return this._w.finalize();
      }
    }
    function writer(cap) {
      return new BinaryWriter(cap);
    }
    return { BinaryWriter, writer };
  } });
    __register({ name: "fontTag", dependencies: ["fontErrors"], factory: function(errors) {
    const { ContractError } = errors;
    function tag(s) {
      if (typeof s !== "string" || s.length !== 4)
        throw new ContractError("fonts/bad-tag", "tag must be a 4-char string", { context: { value: s } });
      return ((s.charCodeAt(0) & 255) << 24 | (s.charCodeAt(1) & 255) << 16 | (s.charCodeAt(2) & 255) << 8 | s.charCodeAt(3) & 255) >>> 0;
    }
    function untag(u32) {
      return String.fromCharCode(u32 >>> 24 & 255, u32 >>> 16 & 255, u32 >>> 8 & 255, u32 & 255);
    }
    function tagEquals(a, b) {
      const ta = typeof a === "string" ? tag(a) : a >>> 0, tb = typeof b === "string" ? tag(b) : b >>> 0;
      return ta === tb;
    }
    return { tag, untag, tagEquals };
  } });
    __register({ name: "fontChecksum", dependencies: [], factory: function() {
    function calcTableChecksum(bytes) {
      const n = bytes.length;
      let sum = 0, i = 0;
      const full = n & -4;
      while (i < full) {
        const w = (bytes[i] << 24 | bytes[i + 1] << 16 | bytes[i + 2] << 8 | bytes[i + 3]) >>> 0;
        sum = sum + w >>> 0;
        i += 4;
      }
      if (i < n) {
        let w = 0, shift = 24;
        while (i < n) {
          w |= bytes[i] << shift;
          shift -= 8;
          i++;
        }
        sum = sum + (w >>> 0) >>> 0;
      }
      return sum;
    }
    function computeChecksumAdjustment(entireFontBytes) {
      return 2981146554 - calcTableChecksum(entireFontBytes) >>> 0;
    }
    return { calcTableChecksum, computeChecksumAdjustment };
  } });
    __register({ name: "fontSfnt", dependencies: ["fontErrors","fontsShared","fontReader","fontWriter","fontTag","fontChecksum"], factory: function(errors, shared, readerMod, writerMod, tagMod, checksumMod) {
    const { ParseError } = errors, {
      SFNT_FLAVOR,
      flavorFromVersion,
      versionFromFlavor,
      sfntSearchParams
    } = shared, { BinaryReader } = readerMod, { BinaryWriter } = writerMod, { tag, untag } = tagMod, { calcTableChecksum, computeChecksumAdjustment } = checksumMod;
    function parseSfnt(bytes) {
      const r = new BinaryReader(bytes), sfntVersion = r.readUint32(), flavor = flavorFromVersion(sfntVersion);
      if (!flavor)
        throw new ParseError("fonts/sfnt-unknown-version", `unknown SFNT version 0x${sfntVersion.toString(16).padStart(8, "0")}`, { context: { sfntVersion } });
      const numTables = r.readUint16();
      r.readUint16();
      r.readUint16();
      r.readUint16();
      if (numTables === 0)
        throw new ParseError("fonts/sfnt-empty", "SFNT directory has zero tables", { context: { numTables } });
      if (numTables > 64)
        throw new ParseError("fonts/sfnt-too-many-tables", `SFNT directory declares ${numTables} tables (cap 64)`, { context: { numTables, cap: 64 } });
      if (12 + numTables * 16 > bytes.length)
        throw new ParseError("fonts/sfnt-truncated", "SFNT directory truncated", { context: { numTables, fileLength: bytes.length } });
      const tables = Object.create(null);
      for (let i = 0;i < numTables; i++) {
        const tagU32 = r.readUint32(), checksum = r.readUint32(), offset = r.readUint32(), length = r.readUint32(), name = untag(tagU32);
        if (offset + length > bytes.length)
          throw new ParseError("fonts/sfnt-bad-offset", `table '${name}' offset+length exceeds file (offset=${offset}, length=${length}, file=${bytes.length})`, { context: { tag: name, offset, length, fileLength: bytes.length } });
        const tBytes = new Uint8Array(bytes.buffer, bytes.byteOffset + offset, length);
        tables[name] = { tag: tagU32, checksum, offset, length, bytes: tBytes };
      }
      return { sfntVersion, flavor, tables, raw: bytes };
    }
    function packSfnt(input) {
      const tables = input.tables || {}, names = Object.keys(tables).sort(), numTables = names.length;
      if (numTables === 0)
        throw new ParseError("fonts/sfnt-empty", "cannot pack SFNT with zero tables");
      let flavor = input.flavor;
      if (!flavor)
        flavor = "CFF " in tables || "CFF2" in tables ? SFNT_FLAVOR.OPENTYPE : SFNT_FLAVOR.TRUETYPE;
      const sfntVersion = versionFromFlavor(flavor), { searchRange, entrySelector, rangeShift } = sfntSearchParams(numTables), w = new BinaryWriter(1024 + numTables * 16);
      w.writeUint32(sfntVersion);
      w.writeUint16(numTables);
      w.writeUint16(searchRange);
      w.writeUint16(entrySelector);
      w.writeUint16(rangeShift);
      const dirEntryPositions = [];
      for (let i = 0;i < numTables; i++) {
        const name = names[i];
        w.writeTag(name);
        const cksumPos = w.pos;
        w.writeUint32(0);
        const offsetPos = w.pos;
        w.writeUint32(0);
        const lengthPos = w.pos;
        w.writeUint32(0);
        dirEntryPositions.push({ name, cksumPos, offsetPos, lengthPos });
      }
      let headTableOffsetInFile = -1;
      for (const e of dirEntryPositions) {
        w.padTo4();
        const start = w.pos, tb = tables[e.name];
        if (!(tb instanceof Uint8Array))
          throw new ParseError("fonts/sfnt-bad-table-bytes", `table ${e.name} bytes must be Uint8Array`);
        w.writeBytes(tb);
        const unpaddedLen = tb.length, cksum = calcTableChecksum(tb);
        w.patchUint32(e.cksumPos, cksum);
        w.patchUint32(e.offsetPos, start);
        w.patchUint32(e.lengthPos, unpaddedLen);
        if (e.name === "head")
          headTableOffsetInFile = start;
      }
      w.padTo4();
      const finalBytes = w.finalize();
      if (headTableOffsetInFile >= 0) {
        const adjOffset = headTableOffsetInFile + 8;
        finalBytes[adjOffset] = 0;
        finalBytes[adjOffset + 1] = 0;
        finalBytes[adjOffset + 2] = 0;
        finalBytes[adjOffset + 3] = 0;
        const adj = computeChecksumAdjustment(finalBytes);
        finalBytes[adjOffset] = adj >>> 24 & 255;
        finalBytes[adjOffset + 1] = adj >>> 16 & 255;
        finalBytes[adjOffset + 2] = adj >>> 8 & 255;
        finalBytes[adjOffset + 3] = adj & 255;
      }
      return finalBytes;
    }
    return {
      parseSfnt,
      packSfnt,
      sfntSearchParams,
      SFNT_FLAVOR,
      flavorFromVersion,
      versionFromFlavor,
      SFNT_NUM_TABLES_MAX: 64,
      tag,
      untag
    };
  } });
    __register({ name: "tableHead", dependencies: ["fontErrors","fontReader","fontWriter"], factory: function(errors, reader, writer) {
    const { ParseError } = errors, { BinaryReader } = reader, { BinaryWriter } = writer;
    function parseHead(bytes) {
      if (bytes.length < 54)
        throw new ParseError("fonts/head-short", "head table must be 54 bytes", { context: { actual: bytes.length } });
      const r = new BinaryReader(bytes), majorVersion = r.readUint16(), minorVersion = r.readUint16(), fontRevision = r.readFixed(), checksumAdjustment = r.readUint32(), magicNumber = r.readUint32();
      if (magicNumber !== 1594834165)
        throw new ParseError("fonts/head-magic", `head.magicNumber expected 0x${1594834165 .toString(16)}, got 0x${magicNumber.toString(16)}`, { context: { magicNumber } });
      const flags = r.readUint16(), unitsPerEm = r.readUint16();
      if (unitsPerEm < 16 || unitsPerEm > 16384)
        throw new ParseError("fonts/head-upem", `head.unitsPerEm out of range (16..16384), got ${unitsPerEm}`, { context: { unitsPerEm } });
      const created = r.readLongDateTime(), modified = r.readLongDateTime(), xMin = r.readInt16(), yMin = r.readInt16(), xMax = r.readInt16(), yMax = r.readInt16(), macStyle = r.readUint16(), lowestRecPPEM = r.readUint16(), fontDirectionHint = r.readInt16(), indexToLocFormat = r.readInt16(), glyphDataFormat = r.readInt16();
      if (indexToLocFormat !== 0 && indexToLocFormat !== 1)
        throw new ParseError("fonts/head-itlf", `head.indexToLocFormat must be 0 or 1, got ${indexToLocFormat}`, { context: { indexToLocFormat } });
      return {
        majorVersion,
        minorVersion,
        fontRevision,
        checksumAdjustment,
        magicNumber,
        flags,
        unitsPerEm,
        created,
        modified,
        xMin,
        yMin,
        xMax,
        yMax,
        macStyle,
        lowestRecPPEM,
        fontDirectionHint,
        indexToLocFormat,
        glyphDataFormat
      };
    }
    function encodeHead(head) {
      const w = new BinaryWriter(54);
      w.writeUint16(head.majorVersion ?? 1);
      w.writeUint16(head.minorVersion ?? 0);
      w.writeFixed(head.fontRevision ?? 1);
      w.writeUint32(head.checksumAdjustment ?? 0);
      w.writeUint32(1594834165);
      w.writeUint16(head.flags ?? 0);
      w.writeUint16(head.unitsPerEm ?? 1000);
      w.writeLongDateTime(head.created ?? 0);
      w.writeLongDateTime(head.modified ?? 0);
      w.writeInt16(head.xMin ?? 0);
      w.writeInt16(head.yMin ?? 0);
      w.writeInt16(head.xMax ?? 0);
      w.writeInt16(head.yMax ?? 0);
      w.writeUint16(head.macStyle ?? 0);
      w.writeUint16(head.lowestRecPPEM ?? 8);
      w.writeInt16(head.fontDirectionHint ?? 2);
      w.writeInt16(head.indexToLocFormat ?? 0);
      w.writeInt16(head.glyphDataFormat ?? 0);
      return w.finalize();
    }
    return { parseHead, encodeHead, HEAD_MAGIC: 1594834165 };
  } });
    __register({ name: "tableHhea", dependencies: ["fontErrors","fontReader","fontWriter"], factory: function(errors, reader, writer) {
    const { ParseError } = errors, { BinaryReader } = reader, { BinaryWriter } = writer;
    function parseHhea(bytes) {
      if (bytes.length < 36)
        throw new ParseError("fonts/hhea-short", "hhea must be 36 bytes", { context: { actual: bytes.length } });
      const r = new BinaryReader(bytes), majorVersion = r.readUint16(), minorVersion = r.readUint16(), ascender = r.readInt16(), descender = r.readInt16(), lineGap = r.readInt16(), advanceWidthMax = r.readUint16(), minLeftSideBearing = r.readInt16(), minRightSideBearing = r.readInt16(), xMaxExtent = r.readInt16(), caretSlopeRise = r.readInt16(), caretSlopeRun = r.readInt16(), caretOffset = r.readInt16();
      r.skip(8);
      const metricDataFormat = r.readInt16(), numberOfHMetrics = r.readUint16();
      return {
        majorVersion,
        minorVersion,
        ascender,
        descender,
        lineGap,
        advanceWidthMax,
        minLeftSideBearing,
        minRightSideBearing,
        xMaxExtent,
        caretSlopeRise,
        caretSlopeRun,
        caretOffset,
        metricDataFormat,
        numberOfHMetrics
      };
    }
    function encodeHhea(h) {
      const w = new BinaryWriter(36);
      w.writeUint16(h.majorVersion ?? 1);
      w.writeUint16(h.minorVersion ?? 0);
      w.writeInt16(h.ascender ?? 0);
      w.writeInt16(h.descender ?? 0);
      w.writeInt16(h.lineGap ?? 0);
      w.writeUint16(h.advanceWidthMax ?? 0);
      w.writeInt16(h.minLeftSideBearing ?? 0);
      w.writeInt16(h.minRightSideBearing ?? 0);
      w.writeInt16(h.xMaxExtent ?? 0);
      w.writeInt16(h.caretSlopeRise ?? 1);
      w.writeInt16(h.caretSlopeRun ?? 0);
      w.writeInt16(h.caretOffset ?? 0);
      w.writeInt16(0).writeInt16(0).writeInt16(0).writeInt16(0);
      w.writeInt16(h.metricDataFormat ?? 0);
      w.writeUint16(h.numberOfHMetrics ?? 0);
      return w.finalize();
    }
    return { parseHhea, encodeHhea };
  } });
    __register({ name: "tableMaxp", dependencies: ["fontErrors","fontReader","fontWriter"], factory: function(errors, reader, writer) {
    const { ParseError } = errors, { BinaryReader } = reader, { BinaryWriter } = writer;
    function parseMaxp(bytes) {
      if (bytes.length < 6)
        throw new ParseError("fonts/maxp-short", "maxp must be \u2265 6 bytes", { context: { actual: bytes.length } });
      const r = new BinaryReader(bytes), version = r.readUint32(), numGlyphs = r.readUint16();
      if (numGlyphs > 65535)
        throw new ParseError("fonts/maxp-numglyphs-cap", `numGlyphs ${numGlyphs} exceeds OT cap (65535)`, { context: { numGlyphs, cap: 65535 } });
      if (version === 20480)
        return { version, numGlyphs };
      if (version === 65536) {
        if (bytes.length < 32)
          throw new ParseError("fonts/maxp-v1-short", "maxp v1.0 must be 32 bytes", { context: { actual: bytes.length } });
        return {
          version,
          numGlyphs,
          maxPoints: r.readUint16(),
          maxContours: r.readUint16(),
          maxCompositePoints: r.readUint16(),
          maxCompositeContours: r.readUint16(),
          maxZones: r.readUint16(),
          maxTwilightPoints: r.readUint16(),
          maxStorage: r.readUint16(),
          maxFunctionDefs: r.readUint16(),
          maxInstructionDefs: r.readUint16(),
          maxStackElements: r.readUint16(),
          maxSizeOfInstructions: r.readUint16(),
          maxComponentElements: r.readUint16(),
          maxComponentDepth: r.readUint16()
        };
      }
      throw new ParseError("fonts/maxp-version", `unsupported maxp version 0x${version.toString(16)}`, { context: { version } });
    }
    function encodeMaxp(m) {
      const w = new BinaryWriter;
      w.writeUint32(m.version);
      w.writeUint16(m.numGlyphs);
      if (m.version === 65536) {
        w.writeUint16(m.maxPoints ?? 0);
        w.writeUint16(m.maxContours ?? 0);
        w.writeUint16(m.maxCompositePoints ?? 0);
        w.writeUint16(m.maxCompositeContours ?? 0);
        w.writeUint16(m.maxZones ?? 2);
        w.writeUint16(m.maxTwilightPoints ?? 0);
        w.writeUint16(m.maxStorage ?? 0);
        w.writeUint16(m.maxFunctionDefs ?? 0);
        w.writeUint16(m.maxInstructionDefs ?? 0);
        w.writeUint16(m.maxStackElements ?? 0);
        w.writeUint16(m.maxSizeOfInstructions ?? 0);
        w.writeUint16(m.maxComponentElements ?? 0);
        w.writeUint16(m.maxComponentDepth ?? 0);
      }
      return w.finalize();
    }
    return { parseMaxp, encodeMaxp, MAXP_V0_5: 20480, MAXP_V1_0: 65536 };
  } });
    __register({ name: "tableHmtx", dependencies: ["fontErrors","fontReader","fontWriter"], factory: function(errors, reader, writer) {
    const { ParseError } = errors, { BinaryReader } = reader, { BinaryWriter } = writer;
    function parseHmtx(bytes, numberOfHMetrics, numGlyphs) {
      if (numberOfHMetrics < 1 || numberOfHMetrics > numGlyphs)
        throw new ParseError("fonts/hmtx-bad-count", `numberOfHMetrics (${numberOfHMetrics}) must be 1..numGlyphs (${numGlyphs})`, { context: { numberOfHMetrics, numGlyphs } });
      const expected = numberOfHMetrics * 4 + (numGlyphs - numberOfHMetrics) * 2;
      if (bytes.length < expected)
        throw new ParseError("fonts/hmtx-short", `hmtx must be \u2265 ${expected} bytes, got ${bytes.length}`, { context: { actual: bytes.length, expected } });
      const r = new BinaryReader(bytes), metrics = Array(numGlyphs);
      let lastAdvance = 0;
      for (let i = 0;i < numberOfHMetrics; i++) {
        const advanceWidth = r.readUint16(), lsb = r.readInt16();
        metrics[i] = { advanceWidth, lsb };
        lastAdvance = advanceWidth;
      }
      for (let i = numberOfHMetrics;i < numGlyphs; i++) {
        const lsb = r.readInt16();
        metrics[i] = { advanceWidth: lastAdvance, lsb };
      }
      return { metrics };
    }
    function encodeHmtx(hmtx) {
      const m = hmtx.metrics;
      if (m.length === 0)
        throw new ParseError("fonts/hmtx-empty", "hmtx requires \u2265 1 glyph");
      let n = m.length;
      while (n > 1 && m[n - 1].advanceWidth === m[n - 2].advanceWidth)
        n--;
      const numberOfHMetrics = n, w = new BinaryWriter(numberOfHMetrics * 4 + (m.length - numberOfHMetrics) * 2);
      for (let i = 0;i < numberOfHMetrics; i++) {
        w.writeUint16(m[i].advanceWidth & 65535);
        w.writeInt16(m[i].lsb | 0);
      }
      for (let i = numberOfHMetrics;i < m.length; i++)
        w.writeInt16(m[i].lsb | 0);
      return { bytes: w.finalize(), numberOfHMetrics };
    }
    return { parseHmtx, encodeHmtx };
  } });
    __register({ name: "tableCmapFormats", dependencies: ["fontErrors"], factory: function(errors) {
    const { ParseError } = errors;
    function parseFormat0(r) {
      const format = r.readUint16(), length = r.readUint16(), language = r.readUint16();
      if (length < 262)
        throw new ParseError("fonts/cmap-fmt0-len", "format 0 length must be \u2265 262", { context: { length } });
      const glyphIdArray = r.readBytesCopy(256), map = new Map;
      for (let i = 0;i < 256; i++)
        if (glyphIdArray[i])
          map.set(i, glyphIdArray[i]);
      return { format, length, language, glyphIdArray, map };
    }
    function parseFormat2(r) {
      const start = r.pos, format = r.readUint16(), length = r.readUint16(), language = r.readUint16(), subHeaderKeys = Array(256);
      let maxKey = 0;
      for (let i = 0;i < 256; i++) {
        const k = r.readUint16();
        subHeaderKeys[i] = k;
        if (k > maxKey)
          maxKey = k;
      }
      const numSubHeaders = (maxKey >>> 3) + 1, subHeaders = Array(numSubHeaders);
      for (let i = 0;i < numSubHeaders; i++)
        subHeaders[i] = {
          firstCode: r.readUint16(),
          entryCount: r.readUint16(),
          idDelta: r.readInt16(),
          idRangeOffset: r.readUint16(),
          _idRangeOffsetPos: r.pos - 2
        };
      const map = new Map;
      for (let i = 0;i < 256; i++) {
        const k = subHeaderKeys[i] >>> 3, sh = subHeaders[k];
        if (k === 0) {
          if (i >= sh.firstCode && i < sh.firstCode + sh.entryCount) {
            const gidPos = sh._idRangeOffsetPos + sh.idRangeOffset + 2 * (i - sh.firstCode);
            if (gidPos + 2 <= start + length) {
              const rel = gidPos - start;
              if (rel >= 0 && rel < length) {
                const slice = r.peek((rr) => {
                  rr.seek(gidPos - start);
                  return rr.readUint16();
                });
                if (slice)
                  map.set(i, slice + sh.idDelta & 65535);
              }
            }
          }
        }
      }
      for (let i = 0;i < 256; i++) {
        const k = subHeaderKeys[i] >>> 3;
        if (k === 0)
          continue;
        const sh = subHeaders[k];
        for (let j = 0;j < sh.entryCount; j++) {
          const low = sh.firstCode + j, cp = i << 8 | low, rel = sh._idRangeOffsetPos + sh.idRangeOffset + 2 * j - start;
          if (rel < 0 || rel + 2 > length)
            continue;
          const gid0 = r.peek((rr) => {
            rr.seek(rel);
            return rr.readUint16();
          });
          if (gid0)
            map.set(cp, gid0 + sh.idDelta & 65535);
        }
      }
      return { format, length, language, subHeaderKeys, subHeaders, map };
    }
    function parseFormat4(r) {
      const format = r.readUint16(), length = r.readUint16(), language = r.readUint16(), segCount = r.readUint16() / 2;
      r.skip(6);
      const endCode = Array(segCount);
      for (let i = 0;i < segCount; i++)
        endCode[i] = r.readUint16();
      r.readUint16();
      const startCode = Array(segCount);
      for (let i = 0;i < segCount; i++)
        startCode[i] = r.readUint16();
      const idDelta = Array(segCount);
      for (let i = 0;i < segCount; i++)
        idDelta[i] = r.readInt16();
      const idRangeOffsetPos = r.pos, idRangeOffset = Array(segCount);
      for (let i = 0;i < segCount; i++)
        idRangeOffset[i] = r.readUint16();
      const glyphIdStartPos = r.pos, remaining = length - 16 - 8 * segCount, glyphIdArray = remaining > 0 ? r.readBytesCopy(remaining) : new Uint8Array(0), map = new Map;
      for (let i = 0;i < segCount; i++) {
        const start = startCode[i], end = endCode[i];
        if (start === 65535 && end === 65535)
          continue;
        for (let c = start;c <= end; c++) {
          let glyphId;
          const idro = idRangeOffset[i];
          if (idro === 0)
            glyphId = c + idDelta[i] & 65535;
          else {
            const offsetInBytes = idRangeOffsetPos + 2 * i + idro + 2 * (c - start);
            if (offsetInBytes + 2 > glyphIdStartPos + glyphIdArray.length)
              continue;
            const gidPos = offsetInBytes - glyphIdStartPos;
            if (gidPos < 0)
              continue;
            const gid = glyphIdArray[gidPos] << 8 | glyphIdArray[gidPos + 1];
            glyphId = gid === 0 ? 0 : gid + idDelta[i] & 65535;
          }
          if (glyphId)
            map.set(c, glyphId);
        }
      }
      return { format, length, language, segments: { startCode, endCode, idDelta, idRangeOffset }, map };
    }
    function parseFormat6(r) {
      const format = r.readUint16(), length = r.readUint16(), language = r.readUint16(), firstCode = r.readUint16(), entryCount = r.readUint16(), map = new Map;
      for (let i = 0;i < entryCount; i++) {
        const gid = r.readUint16();
        if (gid)
          map.set(firstCode + i, gid);
      }
      return { format, length, language, firstCode, entryCount, map };
    }
    const UNICODE_MAX = 1114111, CMAP_RANGE_HARD_CAP = 2 * (UNICODE_MAX + 1);
    function parseFormat12(r) {
      const format = r.readUint16();
      r.skip(2);
      const length = r.readUint32(), language = r.readUint32(), numGroups = r.readUint32(), map = new Map, groups = Array(numGroups);
      let totalRange = 0;
      for (let i = 0;i < numGroups; i++) {
        const startCharCode = r.readUint32(), endCharCode = r.readUint32(), startGlyphID = r.readUint32();
        if (endCharCode < startCharCode || endCharCode > UNICODE_MAX)
          throw new ParseError("fonts/cmap-range-bomb", `cmap format 12 group ${i} out of valid Unicode range (${startCharCode}..${endCharCode})`, { context: { format: 12, group: i, startCharCode, endCharCode } });
        totalRange += endCharCode - startCharCode + 1;
        if (totalRange > CMAP_RANGE_HARD_CAP)
          throw new ParseError("fonts/cmap-range-bomb", `cmap format 12 cumulative range exceeds ${CMAP_RANGE_HARD_CAP} entries`, { context: { format: 12, group: i, totalRange, cap: CMAP_RANGE_HARD_CAP } });
        groups[i] = { startCharCode, endCharCode, startGlyphID };
        for (let c = startCharCode;c <= endCharCode; c++)
          map.set(c, startGlyphID + (c - startCharCode));
      }
      return { format, length, language, groups, map };
    }
    function parseFormat13(r) {
      const format = r.readUint16();
      r.skip(2);
      const length = r.readUint32(), language = r.readUint32(), numGroups = r.readUint32(), map = new Map, groups = Array(numGroups);
      let totalRange = 0;
      for (let i = 0;i < numGroups; i++) {
        const startCharCode = r.readUint32(), endCharCode = r.readUint32(), glyphID = r.readUint32();
        if (endCharCode < startCharCode || endCharCode > UNICODE_MAX)
          throw new ParseError("fonts/cmap-range-bomb", `cmap format 13 group ${i} out of valid Unicode range (${startCharCode}..${endCharCode})`, { context: { format: 13, group: i, startCharCode, endCharCode } });
        totalRange += endCharCode - startCharCode + 1;
        if (totalRange > CMAP_RANGE_HARD_CAP)
          throw new ParseError("fonts/cmap-range-bomb", `cmap format 13 cumulative range exceeds ${CMAP_RANGE_HARD_CAP} entries`, { context: { format: 13, group: i, totalRange, cap: CMAP_RANGE_HARD_CAP } });
        groups[i] = { startCharCode, endCharCode, glyphID };
        for (let c = startCharCode;c <= endCharCode; c++)
          map.set(c, glyphID);
      }
      return { format, length, language, groups, map };
    }
    function parseFormat14(r) {
      const start = r.pos, format = r.readUint16(), length = r.readUint32(), numVarSelectorRecords = r.readUint32(), records = Array(numVarSelectorRecords);
      for (let i = 0;i < numVarSelectorRecords; i++)
        records[i] = {
          varSelector: r.readUint24(),
          defaultUVSOffset: r.readUint32(),
          nonDefaultUVSOffset: r.readUint32()
        };
      for (const rec of records) {
        if (rec.defaultUVSOffset) {
          const rel = rec.defaultUVSOffset, sub = r.sub(rel, r.length - rel), numUnicodeValueRanges = sub.readUint32(), ranges = Array(numUnicodeValueRanges);
          for (let i = 0;i < numUnicodeValueRanges; i++)
            ranges[i] = { startUnicodeValue: sub.readUint24(), additionalCount: sub.readUint8() };
          rec.defaultUVS = ranges;
        }
        if (rec.nonDefaultUVSOffset) {
          const rel = rec.nonDefaultUVSOffset, sub = r.sub(rel, r.length - rel), numUVSMappings = sub.readUint32(), mappings = Array(numUVSMappings);
          for (let i = 0;i < numUVSMappings; i++)
            mappings[i] = { unicodeValue: sub.readUint24(), glyphID: sub.readUint16() };
          rec.nonDefaultUVS = mappings;
        }
      }
      return { format, length, records };
    }
    return { parseFormat0, parseFormat2, parseFormat4, parseFormat6, parseFormat12, parseFormat13, parseFormat14 };
  } });
    __register({ name: "tableCmap", dependencies: ["fontErrors","fontReader","tableCmapFormats"], factory: function(errors, reader, formats) {
    const { ParseError } = errors, { BinaryReader } = reader, {
      parseFormat0,
      parseFormat2,
      parseFormat4,
      parseFormat6,
      parseFormat12,
      parseFormat13,
      parseFormat14
    } = formats;
    function parseSubtable(r) {
      const format = r.peek((rr) => rr.readUint16());
      switch (format) {
        case 0:
          return parseFormat0(r);
        case 2:
          return parseFormat2(r);
        case 4:
          return parseFormat4(r);
        case 6:
          return parseFormat6(r);
        case 12:
          return parseFormat12(r);
        case 13:
          return parseFormat13(r);
        case 14:
          return parseFormat14(r);
        default: {
          const length = format <= 6 ? r.peek((rr) => {
            rr.readUint16();
            return rr.readUint16();
          }) : null;
          return { format, parsed: !1, length };
        }
      }
    }
    function parseCmap(bytes) {
      if (bytes.length < 4)
        throw new ParseError("fonts/cmap-short", "cmap header truncated");
      const r = new BinaryReader(bytes), version = r.readUint16(), numTables = r.readUint16();
      if (numTables > 64)
        throw new ParseError("fonts/cmap-too-many-subtables", `cmap declares ${numTables} subtables (cap 64)`, { context: { numTables, cap: 64 } });
      const records = Array(numTables);
      for (let i = 0;i < numTables; i++)
        records[i] = {
          platformID: r.readUint16(),
          encodingID: r.readUint16(),
          subtableOffset: r.readUint32()
        };
      const encodings = records.map((rec) => {
        if (rec.subtableOffset >= bytes.length)
          throw new ParseError("fonts/cmap-bad-offset", `cmap subtable offset ${rec.subtableOffset} exceeds table (${bytes.length})`, { context: rec });
        const sub = r.sub(rec.subtableOffset, bytes.length - rec.subtableOffset);
        return { ...rec, subtable: parseSubtable(sub) };
      });
      return { version, encodings };
    }
    function pickUnicodeMap(cmap) {
      const prefer = [
        (rec) => rec.platformID === 3 && rec.encodingID === 10,
        (rec) => rec.platformID === 0 && rec.encodingID === 4,
        (rec) => rec.platformID === 3 && rec.encodingID === 1,
        (rec) => rec.platformID === 0,
        (rec) => !!(rec.subtable && rec.subtable.map)
      ];
      for (const pred of prefer)
        for (const rec of cmap.encodings) {
          if (!rec.subtable || !rec.subtable.map)
            continue;
          if (pred(rec))
            return rec.subtable.map;
        }
      return null;
    }
    return { parseCmap, pickUnicodeMap };
  } });
    __register({ name: "fontEncoding", dependencies: ["fontErrors"], factory: function(errors) {
    const { ParseError } = errors, MAC_ROMAN_HIGH = [
      196,
      197,
      199,
      201,
      209,
      214,
      220,
      225,
      224,
      226,
      228,
      227,
      229,
      231,
      233,
      232,
      234,
      235,
      237,
      236,
      238,
      239,
      241,
      243,
      242,
      244,
      246,
      245,
      250,
      249,
      251,
      252,
      8224,
      176,
      162,
      163,
      167,
      8226,
      182,
      223,
      174,
      169,
      8482,
      180,
      168,
      8800,
      198,
      216,
      8734,
      177,
      8804,
      8805,
      165,
      181,
      8706,
      8721,
      8719,
      960,
      8747,
      170,
      186,
      937,
      230,
      248,
      191,
      161,
      172,
      8730,
      402,
      8776,
      8710,
      171,
      187,
      8230,
      160,
      192,
      195,
      213,
      338,
      339,
      8211,
      8212,
      8220,
      8221,
      8216,
      8217,
      247,
      9674,
      255,
      376,
      8260,
      8364,
      8249,
      8250,
      64257,
      64258,
      8225,
      183,
      8218,
      8222,
      8240,
      194,
      202,
      193,
      203,
      200,
      205,
      206,
      207,
      204,
      211,
      212,
      63743,
      210,
      218,
      219,
      217,
      305,
      710,
      732,
      175,
      728,
      729,
      730,
      184,
      733,
      731,
      711
    ];
    function decodeUtf16Be(bytes) {
      if (bytes.length & 1)
        throw new ParseError("fonts/utf16be-odd", "UTF-16BE byte length must be even", { context: { length: bytes.length } });
      let s = "";
      for (let i = 0;i < bytes.length; i += 2)
        s += String.fromCharCode(bytes[i] << 8 | bytes[i + 1]);
      return s;
    }
    function encodeUtf16Be(str) {
      const out = new Uint8Array(str.length * 2);
      for (let i = 0, j = 0;i < str.length; i++, j += 2) {
        const c = str.charCodeAt(i);
        out[j] = c >>> 8 & 255;
        out[j + 1] = c & 255;
      }
      return out;
    }
    function decodeMacRoman(bytes) {
      let s = "";
      for (let i = 0;i < bytes.length; i++) {
        const b = bytes[i];
        s += b < 128 ? String.fromCharCode(b) : String.fromCharCode(MAC_ROMAN_HIGH[b - 128]);
      }
      return s;
    }
    function encodeMacRoman(str) {
      const out = new Uint8Array(str.length);
      for (let i = 0;i < str.length; i++) {
        const c = str.charCodeAt(i);
        if (c < 128) {
          out[i] = c;
          continue;
        }
        let found = 0;
        for (let j = 0;j < MAC_ROMAN_HIGH.length; j++)
          if (MAC_ROMAN_HIGH[j] === c) {
            found = 128 + j;
            break;
          }
        out[i] = found || 63;
      }
      return out;
    }
    return { decodeUtf16Be, encodeUtf16Be, decodeMacRoman, encodeMacRoman };
  } });
    __register({ name: "tableName", dependencies: ["fontErrors","fontReader","fontWriter","fontEncoding"], factory: function(errors, reader, writer, encoding) {
    const { ParseError } = errors, { BinaryReader } = reader, { BinaryWriter } = writer, { decodeUtf16Be, encodeUtf16Be, decodeMacRoman, encodeMacRoman } = encoding, NAME_ID = Object.freeze({
      COPYRIGHT: 0,
      FONT_FAMILY: 1,
      FONT_SUBFAMILY: 2,
      UNIQUE_ID: 3,
      FULL_NAME: 4,
      VERSION: 5,
      POSTSCRIPT_NAME: 6,
      TRADEMARK: 7,
      MANUFACTURER: 8,
      DESIGNER: 9,
      DESCRIPTION: 10,
      VENDOR_URL: 11,
      DESIGNER_URL: 12,
      LICENSE: 13,
      LICENSE_URL: 14,
      TYPOGRAPHIC_FAMILY: 16,
      TYPOGRAPHIC_SUBFAMILY: 17
    }), PLATFORM = Object.freeze({
      UNICODE: 0,
      MAC: 1,
      ISO: 2,
      WINDOWS: 3,
      CUSTOM: 4
    });
    function decodeString(platformID, encodingID, bytes) {
      if (platformID === PLATFORM.UNICODE)
        return decodeUtf16Be(bytes);
      if (platformID === PLATFORM.WINDOWS && (encodingID === 1 || encodingID === 10))
        return decodeUtf16Be(bytes);
      if (platformID === PLATFORM.MAC && encodingID === 0)
        return decodeMacRoman(bytes);
      return null;
    }
    function encodeString(platformID, encodingID, str) {
      if (platformID === PLATFORM.UNICODE)
        return encodeUtf16Be(str);
      if (platformID === PLATFORM.WINDOWS && (encodingID === 1 || encodingID === 10))
        return encodeUtf16Be(str);
      if (platformID === PLATFORM.MAC && encodingID === 0)
        return encodeMacRoman(str);
      return null;
    }
    function parseName(bytes) {
      if (bytes.length < 6)
        throw new ParseError("fonts/name-short", "name table must be \u2265 6 bytes", { context: { actual: bytes.length } });
      const r = new BinaryReader(bytes), format = r.readUint16();
      if (format !== 0 && format !== 1)
        throw new ParseError("fonts/name-format", `unsupported name format ${format}`, { context: { format } });
      const count = r.readUint16(), stringOffset = r.readUint16();
      if (count > 32768)
        throw new ParseError("fonts/name-too-many", `name table declares ${count} records (cap 32768)`, { context: { count, cap: 32768 } });
      const records = [];
      for (let i = 0;i < count; i++)
        records.push({
          platformID: r.readUint16(),
          encodingID: r.readUint16(),
          languageID: r.readUint16(),
          nameID: r.readUint16(),
          length: r.readUint16(),
          offset: r.readUint16()
        });
      let langTagRecords;
      if (format === 1) {
        const ltc = r.readUint16();
        langTagRecords = [];
        for (let i = 0;i < ltc; i++)
          langTagRecords.push({ length: r.readUint16(), offset: r.readUint16() });
      }
      for (const rec of records) {
        const start = stringOffset + rec.offset;
        if (start + rec.length > bytes.length)
          throw new ParseError("fonts/name-bad-string-range", `name record ${rec.nameID} string range exceeds table`, { context: { start, length: rec.length, tableLength: bytes.length } });
        const raw = new Uint8Array(bytes.buffer, bytes.byteOffset + start, rec.length);
        rec.raw = raw;
        const s = decodeString(rec.platformID, rec.encodingID, raw);
        if (s != null)
          rec.string = s;
      }
      if (langTagRecords)
        for (const lt of langTagRecords) {
          const start = stringOffset + lt.offset;
          if (start + lt.length > bytes.length)
            throw new ParseError("fonts/name-bad-langtag", "langTag record range exceeds table");
          const raw = new Uint8Array(bytes.buffer, bytes.byteOffset + start, lt.length);
          lt.raw = raw;
          lt.string = decodeUtf16Be(raw);
        }
      return langTagRecords ? { format, records, langTagRecords } : { format, records };
    }
    function encodeName(name) {
      const records = name.records || [], stringBlobs = records.map((rec) => {
        if (rec.raw instanceof Uint8Array)
          return rec.raw;
        if (typeof rec.string === "string") {
          const b = encodeString(rec.platformID, rec.encodingID, rec.string);
          if (!b)
            throw new ParseError("fonts/name-unsupported-encoding", `cannot encode name record platform=${rec.platformID} encoding=${rec.encodingID}`, { context: { platformID: rec.platformID, encodingID: rec.encodingID } });
          return b;
        }
        return new Uint8Array(0);
      }), count = records.length, headerLen = 6 + count * 12, stringStorageOffset = headerLen, w = new BinaryWriter(headerLen + 256);
      w.writeUint16(0);
      w.writeUint16(count);
      w.writeUint16(stringStorageOffset);
      const offsets = Array(count);
      let cursor = 0;
      const cache = new Map, storage = new BinaryWriter;
      for (let i = 0;i < count; i++) {
        const b = stringBlobs[i];
        let key = "";
        for (let k = 0;k < b.length; k++)
          key += b[k].toString(16).padStart(2, "0");
        if (cache.has(key))
          offsets[i] = cache.get(key);
        else {
          offsets[i] = cursor;
          cache.set(key, cursor);
          storage.writeBytes(b);
          cursor += b.length;
        }
      }
      for (let i = 0;i < count; i++) {
        const rec = records[i];
        w.writeUint16(rec.platformID);
        w.writeUint16(rec.encodingID);
        w.writeUint16(rec.languageID);
        w.writeUint16(rec.nameID);
        w.writeUint16(stringBlobs[i].length);
        w.writeUint16(offsets[i]);
      }
      w.writeBytes(storage.finalize());
      return w.finalize();
    }
    function getNameString(name, nameID) {
      if (!name || !name.records)
        return;
      const prefer = [
        (rec) => rec.platformID === 3 && rec.encodingID === 1 && rec.languageID === 1033,
        (rec) => rec.platformID === 3,
        (rec) => rec.platformID === 1 && rec.languageID === 0,
        (_rec) => !0
      ];
      for (const pred of prefer)
        for (const rec of name.records) {
          if (rec.nameID !== nameID)
            continue;
          if (typeof rec.string !== "string")
            continue;
          if (pred(rec))
            return rec.string;
        }
      return;
    }
    return { parseName, encodeName, getNameString, NAME_ID, PLATFORM };
  } });
    __register({ name: "tableOs2", dependencies: ["fontErrors","fontReader","fontWriter"], factory: function(errors, reader, writer) {
    const { ParseError } = errors, { BinaryReader } = reader, { BinaryWriter } = writer;
    function parseOs2(bytes) {
      if (bytes.length < 78)
        throw new ParseError("fonts/os2-short", "OS/2 table must be \u2265 78 bytes", { context: { actual: bytes.length } });
      const r = new BinaryReader(bytes), version = r.readUint16(), out = {
        version,
        xAvgCharWidth: r.readInt16(),
        usWeightClass: r.readUint16(),
        usWidthClass: r.readUint16(),
        fsType: r.readUint16(),
        ySubscriptXSize: r.readInt16(),
        ySubscriptYSize: r.readInt16(),
        ySubscriptXOffset: r.readInt16(),
        ySubscriptYOffset: r.readInt16(),
        ySuperscriptXSize: r.readInt16(),
        ySuperscriptYSize: r.readInt16(),
        ySuperscriptXOffset: r.readInt16(),
        ySuperscriptYOffset: r.readInt16(),
        yStrikeoutSize: r.readInt16(),
        yStrikeoutPosition: r.readInt16(),
        sFamilyClass: r.readInt16(),
        panose: Array.from(r.readBytesCopy(10)),
        ulUnicodeRange1: r.readUint32(),
        ulUnicodeRange2: r.readUint32(),
        ulUnicodeRange3: r.readUint32(),
        ulUnicodeRange4: r.readUint32(),
        achVendID: String.fromCharCode(...r.readBytesCopy(4)),
        fsSelection: r.readUint16(),
        usFirstCharIndex: r.readUint16(),
        usLastCharIndex: r.readUint16(),
        sTypoAscender: r.readInt16(),
        sTypoDescender: r.readInt16(),
        sTypoLineGap: r.readInt16(),
        usWinAscent: r.readUint16(),
        usWinDescent: r.readUint16()
      };
      if (version >= 1 && bytes.length >= 86) {
        out.ulCodePageRange1 = r.readUint32();
        out.ulCodePageRange2 = r.readUint32();
      }
      if (version >= 2 && bytes.length >= 96) {
        out.sxHeight = r.readInt16();
        out.sCapHeight = r.readInt16();
        out.usDefaultChar = r.readUint16();
        out.usBreakChar = r.readUint16();
        out.usMaxContext = r.readUint16();
      }
      if (version >= 5 && bytes.length >= 100) {
        out.usLowerOpticalPointSize = r.readUint16();
        out.usUpperOpticalPointSize = r.readUint16();
      }
      return out;
    }
    function encodeOs2(os2) {
      const w = new BinaryWriter;
      w.writeUint16(os2.version);
      w.writeInt16(os2.xAvgCharWidth ?? 0);
      w.writeUint16(os2.usWeightClass ?? 400);
      w.writeUint16(os2.usWidthClass ?? 5);
      w.writeUint16(os2.fsType ?? 0);
      w.writeInt16(os2.ySubscriptXSize ?? 0);
      w.writeInt16(os2.ySubscriptYSize ?? 0);
      w.writeInt16(os2.ySubscriptXOffset ?? 0);
      w.writeInt16(os2.ySubscriptYOffset ?? 0);
      w.writeInt16(os2.ySuperscriptXSize ?? 0);
      w.writeInt16(os2.ySuperscriptYSize ?? 0);
      w.writeInt16(os2.ySuperscriptXOffset ?? 0);
      w.writeInt16(os2.ySuperscriptYOffset ?? 0);
      w.writeInt16(os2.yStrikeoutSize ?? 0);
      w.writeInt16(os2.yStrikeoutPosition ?? 0);
      w.writeInt16(os2.sFamilyClass ?? 0);
      const panose = os2.panose || Array(10).fill(0);
      for (let i = 0;i < 10; i++)
        w.writeUint8(panose[i] | 0);
      w.writeUint32(os2.ulUnicodeRange1 ?? 0);
      w.writeUint32(os2.ulUnicodeRange2 ?? 0);
      w.writeUint32(os2.ulUnicodeRange3 ?? 0);
      w.writeUint32(os2.ulUnicodeRange4 ?? 0);
      const vend = (os2.achVendID || "    ").padEnd(4).slice(0, 4);
      for (let i = 0;i < 4; i++)
        w.writeUint8(vend.charCodeAt(i) & 255);
      w.writeUint16(os2.fsSelection ?? 0);
      w.writeUint16(os2.usFirstCharIndex ?? 0);
      w.writeUint16(os2.usLastCharIndex ?? 65535);
      w.writeInt16(os2.sTypoAscender ?? 0);
      w.writeInt16(os2.sTypoDescender ?? 0);
      w.writeInt16(os2.sTypoLineGap ?? 0);
      w.writeUint16(os2.usWinAscent ?? 0);
      w.writeUint16(os2.usWinDescent ?? 0);
      if (os2.version >= 1) {
        w.writeUint32(os2.ulCodePageRange1 ?? 0);
        w.writeUint32(os2.ulCodePageRange2 ?? 0);
      }
      if (os2.version >= 2) {
        w.writeInt16(os2.sxHeight ?? 0);
        w.writeInt16(os2.sCapHeight ?? 0);
        w.writeUint16(os2.usDefaultChar ?? 0);
        w.writeUint16(os2.usBreakChar ?? 32);
        w.writeUint16(os2.usMaxContext ?? 0);
      }
      if (os2.version >= 5) {
        w.writeUint16(os2.usLowerOpticalPointSize ?? 0);
        w.writeUint16(os2.usUpperOpticalPointSize ?? 65535);
      }
      return w.finalize();
    }
    return { parseOs2, encodeOs2 };
  } });
    __register({ name: "tablePost", dependencies: ["fontErrors","fontReader","fontWriter"], factory: function(errors, reader, writer) {
    const { ParseError } = errors, { BinaryReader } = reader, { BinaryWriter } = writer, MAC_GLYPH_NAMES = [
      ".notdef",
      ".null",
      "nonmarkingreturn",
      "space",
      "exclam",
      "quotedbl",
      "numbersign",
      "dollar",
      "percent",
      "ampersand",
      "quotesingle",
      "parenleft",
      "parenright",
      "asterisk",
      "plus",
      "comma",
      "hyphen",
      "period",
      "slash",
      "zero",
      "one",
      "two",
      "three",
      "four",
      "five",
      "six",
      "seven",
      "eight",
      "nine",
      "colon",
      "semicolon",
      "less",
      "equal",
      "greater",
      "question",
      "at",
      "A",
      "B",
      "C",
      "D",
      "E",
      "F",
      "G",
      "H",
      "I",
      "J",
      "K",
      "L",
      "M",
      "N",
      "O",
      "P",
      "Q",
      "R",
      "S",
      "T",
      "U",
      "V",
      "W",
      "X",
      "Y",
      "Z",
      "bracketleft",
      "backslash",
      "bracketright",
      "asciicircum",
      "underscore",
      "grave",
      "a",
      "b",
      "c",
      "d",
      "e",
      "f",
      "g",
      "h",
      "i",
      "j",
      "k",
      "l",
      "m",
      "n",
      "o",
      "p",
      "q",
      "r",
      "s",
      "t",
      "u",
      "v",
      "w",
      "x",
      "y",
      "z",
      "braceleft",
      "bar",
      "braceright",
      "asciitilde",
      "Adieresis",
      "Aring",
      "Ccedilla",
      "Eacute",
      "Ntilde",
      "Odieresis",
      "Udieresis",
      "aacute",
      "agrave",
      "acircumflex",
      "adieresis",
      "atilde",
      "aring",
      "ccedilla",
      "eacute",
      "egrave",
      "ecircumflex",
      "edieresis",
      "iacute",
      "igrave",
      "icircumflex",
      "idieresis",
      "ntilde",
      "oacute",
      "ograve",
      "ocircumflex",
      "odieresis",
      "otilde",
      "uacute",
      "ugrave",
      "ucircumflex",
      "udieresis",
      "dagger",
      "degree",
      "cent",
      "sterling",
      "section",
      "bullet",
      "paragraph",
      "germandbls",
      "registered",
      "copyright",
      "trademark",
      "acute",
      "dieresis",
      "notequal",
      "AE",
      "Oslash",
      "infinity",
      "plusminus",
      "lessequal",
      "greaterequal",
      "yen",
      "mu",
      "partialdiff",
      "summation",
      "product",
      "pi",
      "integral",
      "ordfeminine",
      "ordmasculine",
      "Omega",
      "ae",
      "oslash",
      "questiondown",
      "exclamdown",
      "logicalnot",
      "radical",
      "florin",
      "approxequal",
      "Delta",
      "guillemotleft",
      "guillemotright",
      "ellipsis",
      "nonbreakingspace",
      "Agrave",
      "Atilde",
      "Otilde",
      "OE",
      "oe",
      "endash",
      "emdash",
      "quotedblleft",
      "quotedblright",
      "quoteleft",
      "quoteright",
      "divide",
      "lozenge",
      "ydieresis",
      "Ydieresis",
      "fraction",
      "currency",
      "guilsinglleft",
      "guilsinglright",
      "fi",
      "fl",
      "daggerdbl",
      "periodcentered",
      "quotesinglbase",
      "quotedblbase",
      "perthousand",
      "Acircumflex",
      "Ecircumflex",
      "Aacute",
      "Edieresis",
      "Egrave",
      "Iacute",
      "Icircumflex",
      "Idieresis",
      "Igrave",
      "Oacute",
      "Ocircumflex",
      "apple",
      "Ograve",
      "Uacute",
      "Ucircumflex",
      "Ugrave",
      "dotlessi",
      "circumflex",
      "tilde",
      "macron",
      "breve",
      "dotaccent",
      "ring",
      "cedilla",
      "hungarumlaut",
      "ogonek",
      "caron",
      "Lslash",
      "lslash",
      "Scaron",
      "scaron",
      "Zcaron",
      "zcaron",
      "brokenbar",
      "Eth",
      "eth",
      "Yacute",
      "yacute",
      "Thorn",
      "thorn",
      "minus",
      "multiply",
      "onesuperior",
      "twosuperior",
      "threesuperior",
      "onehalf",
      "onequarter",
      "threequarters",
      "franc",
      "Gbreve",
      "gbreve",
      "Idotaccent",
      "Scedilla",
      "scedilla",
      "Cacute",
      "cacute",
      "Ccaron",
      "ccaron",
      "dcroat"
    ];
    function parsePost(bytes, numGlyphs) {
      if (bytes.length < 32)
        throw new ParseError("fonts/post-short", "post table must be \u2265 32 bytes", { context: { actual: bytes.length } });
      const r = new BinaryReader(bytes), versionRaw = r.readUint32(), version = (versionRaw >>> 16 & 65535) + (versionRaw & 65535) / 65536, out = {
        version,
        italicAngle: r.readInt32() / 65536,
        underlinePosition: r.readInt16(),
        underlineThickness: r.readInt16(),
        isFixedPitch: r.readUint32(),
        minMemType42: r.readUint32(),
        maxMemType42: r.readUint32(),
        minMemType1: r.readUint32(),
        maxMemType1: r.readUint32()
      };
      if (version === 2) {
        if (numGlyphs == null)
          throw new ParseError("fonts/post-need-numGlyphs", "post v2.0 requires numGlyphs", {});
        const ng = r.readUint16();
        if (ng !== numGlyphs)
          throw new ParseError("fonts/post-num-mismatch", `post v2.0 numberOfGlyphs (${ng}) \u2260 maxp.numGlyphs (${numGlyphs})`, { context: { post: ng, maxp: numGlyphs } });
        const indices = Array(numGlyphs);
        let maxIdx = 257;
        for (let i = 0;i < numGlyphs; i++) {
          const idx = r.readUint16();
          indices[i] = idx;
          if (idx > maxIdx)
            maxIdx = idx;
        }
        const extra = [], customCount = maxIdx - 257;
        for (let i = 0;i < customCount; i++) {
          const len = r.readUint8(), sb = r.readBytesCopy(len);
          let s = "";
          for (let k = 0;k < len; k++)
            s += String.fromCharCode(sb[k]);
          extra.push(s);
        }
        out.glyphNames = indices.map((idx) => idx < 258 ? MAC_GLYPH_NAMES[idx] : extra[idx - 258] || `glyph${idx}`);
      } else if (version === 3)
        ;
      else if (version === 1) {
        if (numGlyphs != null) {
          out.glyphNames = Array(numGlyphs);
          for (let i = 0;i < numGlyphs; i++)
            out.glyphNames[i] = i < 258 ? MAC_GLYPH_NAMES[i] : `glyph${i}`;
        }
      } else if (version === 2.5)
        throw new ParseError("fonts/post-v2-5-unsupported", "post v2.5 is deprecated and unsupported");
      return out;
    }
    function encodePost(post) {
      const w = new BinaryWriter(32), ver = post.version || 3;
      w.writeUint32((ver | 0) << 16 | Math.round((ver - (ver | 0)) * 65536));
      w.writeInt32(Math.round((post.italicAngle ?? 0) * 65536));
      w.writeInt16(post.underlinePosition ?? -75);
      w.writeInt16(post.underlineThickness ?? 50);
      w.writeUint32(post.isFixedPitch ?? 0);
      w.writeUint32(post.minMemType42 ?? 0);
      w.writeUint32(post.maxMemType42 ?? 0);
      w.writeUint32(post.minMemType1 ?? 0);
      w.writeUint32(post.maxMemType1 ?? 0);
      return w.finalize();
    }
    return { parsePost, encodePost, MAC_GLYPH_NAMES };
  } });
    __register({ name: "tableLoca", dependencies: ["fontErrors","fontReader","fontWriter"], factory: function(errors, reader, writer) {
    const { ParseError } = errors, { BinaryReader } = reader, { BinaryWriter } = writer;
    function parseLoca(bytes, numGlyphs, indexToLocFormat) {
      const n = numGlyphs + 1, r = new BinaryReader(bytes), out = new Uint32Array(n);
      if (indexToLocFormat === 0) {
        if (bytes.length < n * 2)
          throw new ParseError("fonts/loca-short-short", `short loca too small: need ${n * 2}, got ${bytes.length}`, { context: { expected: n * 2, actual: bytes.length } });
        for (let i = 0;i < n; i++)
          out[i] = r.readUint16() * 2;
      } else if (indexToLocFormat === 1) {
        if (bytes.length < n * 4)
          throw new ParseError("fonts/loca-short-long", `long loca too small: need ${n * 4}, got ${bytes.length}`, { context: { expected: n * 4, actual: bytes.length } });
        for (let i = 0;i < n; i++)
          out[i] = r.readUint32();
      } else
        throw new ParseError("fonts/loca-bad-format", `unsupported indexToLocFormat ${indexToLocFormat}`, { context: { indexToLocFormat } });
      for (let i = 1;i < n; i++)
        if (out[i] < out[i - 1])
          throw new ParseError("fonts/loca-non-monotonic", `loca offsets must be non-decreasing (offsets[${i - 1}]=${out[i - 1]} > offsets[${i}]=${out[i]})`, { context: { i, prev: out[i - 1], curr: out[i] } });
      return out;
    }
    function encodeLoca(offsets) {
      if (!(offsets instanceof Uint32Array) && !Array.isArray(offsets))
        throw new ParseError("fonts/loca-bad-input", "offsets must be Uint32Array or array");
      const n = offsets.length;
      let short = !0;
      for (let i = 0;i < n; i++) {
        const o = offsets[i] >>> 0;
        if (o & 1) {
          short = !1;
          break;
        }
        if (o > 131070) {
          short = !1;
          break;
        }
      }
      const w = new BinaryWriter(n * (short ? 2 : 4));
      if (short)
        for (let i = 0;i < n; i++)
          w.writeUint16(offsets[i] / 2);
      else
        for (let i = 0;i < n; i++)
          w.writeUint32(offsets[i]);
      return { bytes: w.finalize(), indexToLocFormat: short ? 0 : 1 };
    }
    return { parseLoca, encodeLoca };
  } });
    __register({ name: "tableGlyf", dependencies: ["fontErrors","fontReader"], factory: function(errors, reader) {
    const { ParseError } = errors, { BinaryReader } = reader, GLYF_FLAG = Object.freeze({
      ON_CURVE: 1,
      X_SHORT: 2,
      Y_SHORT: 4,
      REPEAT: 8,
      X_SAME_OR_POS: 16,
      Y_SAME_OR_POS: 32,
      OVERLAP_SIMPLE: 64
    }), COMPONENT_FLAG = Object.freeze({
      ARG_1_AND_2_ARE_WORDS: 1,
      ARGS_ARE_XY_VALUES: 2,
      ROUND_XY_TO_GRID: 4,
      WE_HAVE_A_SCALE: 8,
      MORE_COMPONENTS: 32,
      WE_HAVE_AN_X_AND_Y_SCALE: 64,
      WE_HAVE_A_TWO_BY_TWO: 128,
      WE_HAVE_INSTRUCTIONS: 256,
      USE_MY_METRICS: 512,
      OVERLAP_COMPOUND: 1024,
      SCALED_COMPONENT_OFFSET: 2048,
      UNSCALED_COMPONENT_OFFSET: 4096
    });
    function parseGlyph(bytes) {
      if (bytes.length === 0)
        return null;
      if (bytes.length < 10)
        throw new ParseError("fonts/glyf-short", "glyph header truncated", { context: { actual: bytes.length } });
      const r = new BinaryReader(bytes), numberOfContours = r.readInt16(), xMin = r.readInt16(), yMin = r.readInt16(), xMax = r.readInt16(), yMax = r.readInt16();
      if (numberOfContours >= 0)
        return parseSimpleGlyph(r, numberOfContours, { xMin, yMin, xMax, yMax });
      return parseCompositeGlyph(r, { xMin, yMin, xMax, yMax });
    }
    function parseSimpleGlyph(r, numberOfContours, bbox) {
      const endPts = Array(numberOfContours);
      let lastPt = -1;
      for (let i = 0;i < numberOfContours; i++) {
        endPts[i] = r.readUint16();
        if (endPts[i] > 65534)
          throw new ParseError("fonts/glyf-endpts", "glyf endpoint index too large");
        lastPt = endPts[i];
      }
      const numPoints = lastPt + 1, instructionLength = r.readUint16(), instructions = instructionLength > 0 ? r.readBytesCopy(instructionLength) : new Uint8Array(0), flags = new Uint8Array(numPoints);
      let idx = 0;
      while (idx < numPoints) {
        const f = r.readUint8();
        flags[idx++] = f;
        if (f & GLYF_FLAG.REPEAT) {
          const repeat = r.readUint8();
          for (let k = 0;k < repeat; k++)
            flags[idx++] = f;
        }
      }
      const xCoords = new Int16Array(numPoints);
      let x = 0;
      for (let i = 0;i < numPoints; i++) {
        const f = flags[i];
        if (f & GLYF_FLAG.X_SHORT) {
          const d = r.readUint8();
          x += f & GLYF_FLAG.X_SAME_OR_POS ? d : -d;
        } else if (!(f & GLYF_FLAG.X_SAME_OR_POS))
          x += r.readInt16();
        xCoords[i] = x;
      }
      const yCoords = new Int16Array(numPoints);
      let y = 0;
      for (let i = 0;i < numPoints; i++) {
        const f = flags[i];
        if (f & GLYF_FLAG.Y_SHORT) {
          const d = r.readUint8();
          y += f & GLYF_FLAG.Y_SAME_OR_POS ? d : -d;
        } else if (!(f & GLYF_FLAG.Y_SAME_OR_POS))
          y += r.readInt16();
        yCoords[i] = y;
      }
      const points = Array(numPoints);
      for (let i = 0;i < numPoints; i++)
        points[i] = { x: xCoords[i], y: yCoords[i], onCurve: !!(flags[i] & GLYF_FLAG.ON_CURVE) };
      return {
        kind: "simple",
        bbox,
        numberOfContours,
        endPtsOfContours: endPts,
        instructions,
        points
      };
    }
    const MAX_COMPOSITE_COMPONENTS = 256;
    function parseCompositeGlyph(r, bbox) {
      const components = [];
      let hasInstructions = !1, flags;
      do {
        if (components.length >= MAX_COMPOSITE_COMPONENTS)
          throw new ParseError("fonts/glyf-too-many-components", `composite glyph exceeds ${MAX_COMPOSITE_COMPONENTS} components`, { context: { cap: MAX_COMPOSITE_COMPONENTS } });
        flags = r.readUint16();
        const glyphIndex = r.readUint16();
        let arg1, arg2;
        if (flags & COMPONENT_FLAG.ARG_1_AND_2_ARE_WORDS)
          if (flags & COMPONENT_FLAG.ARGS_ARE_XY_VALUES) {
            arg1 = r.readInt16();
            arg2 = r.readInt16();
          } else {
            arg1 = r.readUint16();
            arg2 = r.readUint16();
          }
        else if (flags & COMPONENT_FLAG.ARGS_ARE_XY_VALUES) {
          arg1 = r.readInt8();
          arg2 = r.readInt8();
        } else {
          arg1 = r.readUint8();
          arg2 = r.readUint8();
        }
        let a = 1, b = 0, c = 0, d = 1;
        if (flags & COMPONENT_FLAG.WE_HAVE_A_SCALE)
          a = d = r.readF2Dot14();
        else if (flags & COMPONENT_FLAG.WE_HAVE_AN_X_AND_Y_SCALE) {
          a = r.readF2Dot14();
          d = r.readF2Dot14();
        } else if (flags & COMPONENT_FLAG.WE_HAVE_A_TWO_BY_TWO) {
          a = r.readF2Dot14();
          b = r.readF2Dot14();
          c = r.readF2Dot14();
          d = r.readF2Dot14();
        }
        if (flags & COMPONENT_FLAG.WE_HAVE_INSTRUCTIONS)
          hasInstructions = !0;
        components.push({
          flags,
          glyphIndex,
          arg1,
          arg2,
          xy: !!(flags & COMPONENT_FLAG.ARGS_ARE_XY_VALUES),
          transform: { a, b, c, d },
          useMyMetrics: !!(flags & COMPONENT_FLAG.USE_MY_METRICS)
        });
      } while (flags & COMPONENT_FLAG.MORE_COMPONENTS);
      let instructions = new Uint8Array(0);
      if (hasInstructions) {
        const len = r.readUint16();
        instructions = len > 0 ? r.readBytesCopy(len) : new Uint8Array(0);
      }
      return { kind: "composite", bbox, components, instructions };
    }
    function parseGlyf(bytes, locaOffsets) {
      const out = Array(locaOffsets.length - 1);
      for (let i = 0;i < out.length; i++) {
        const start = locaOffsets[i], end = locaOffsets[i + 1];
        if (end < start || end > bytes.length)
          throw new ParseError("fonts/glyf-loca-range", `glyph ${i} loca range invalid (${start}..${end}, glyf=${bytes.length})`, { context: { glyph: i, start, end, glyfLength: bytes.length } });
        const slice = new Uint8Array(bytes.buffer, bytes.byteOffset + start, end - start);
        out[i] = parseGlyph(slice);
      }
      return out;
    }
    return { parseGlyph, parseGlyf, GLYF_FLAG, COMPONENT_FLAG };
  } });
    __register({ name: "tableGvar", dependencies: ["fontErrors","fontReader"], factory: function(errors, reader) {
    const { ParseError } = errors, { BinaryReader } = reader;
    function parseGvar(bytes) {
      if (bytes.length < 20)
        throw new ParseError("fonts/gvar-short", "gvar header truncated");
      const r = new BinaryReader(bytes), major = r.readUint16(), minor = r.readUint16();
      if (major !== 1)
        throw new ParseError("fonts/gvar-version", `unsupported gvar major ${major}`, { context: { major, minor } });
      const axisCount = r.readUint16(), sharedTupleCount = r.readUint16(), sharedTuplesOffset = r.readUint32(), glyphCount = r.readUint16(), flags = r.readUint16(), glyphVariationDataArrayOffset = r.readUint32(), useLong = (flags & 1) !== 0, offsets = Array(glyphCount + 1);
      for (let i = 0;i <= glyphCount; i++)
        offsets[i] = useLong ? r.readUint32() : r.readUint16() * 2;
      const sharedTuples = Array(sharedTupleCount);
      if (sharedTupleCount && sharedTuplesOffset) {
        const sr = new BinaryReader(bytes, sharedTuplesOffset, bytes.length - sharedTuplesOffset);
        for (let i = 0;i < sharedTupleCount; i++) {
          const tuple = Array(axisCount);
          for (let k = 0;k < axisCount; k++)
            tuple[k] = sr.readF2Dot14();
          sharedTuples[i] = tuple;
        }
      }
      return {
        majorVersion: major,
        minorVersion: minor,
        axisCount,
        glyphCount,
        flags,
        sharedTuples,
        getGlyphVariationData(gid) {
          if (gid < 0 || gid >= glyphCount)
            return null;
          const start = glyphVariationDataArrayOffset + offsets[gid], end = glyphVariationDataArrayOffset + offsets[gid + 1];
          if (end <= start)
            return null;
          return new Uint8Array(bytes.buffer, bytes.byteOffset + start, end - start);
        },
        parseGlyphVariations(gid) {
          const raw = this.getGlyphVariationData(gid);
          if (!raw)
            return null;
          return parseGlyphVariationData(raw, axisCount, sharedTuples);
        }
      };
    }
    function parseGlyphVariationData(bytes, axisCount, sharedTuples) {
      const r = new BinaryReader(bytes), tupleVariationCount = r.readUint16(), tupleVariationCountValue = tupleVariationCount & 4095, sharedPointsBit = !!(tupleVariationCount & 32768), dataOffset = r.readUint16(), headers = [];
      for (let i = 0;i < tupleVariationCountValue; i++) {
        const variationDataSize = r.readUint16(), tupleIndex = r.readUint16(), idx = tupleIndex & 4095, hasEmbedded = !!(tupleIndex & 32768), intermediate = !!(tupleIndex & 16384), privatePts = !!(tupleIndex & 8192);
        let peak;
        if (hasEmbedded) {
          peak = Array(axisCount);
          for (let k = 0;k < axisCount; k++)
            peak[k] = r.readF2Dot14();
        } else
          peak = sharedTuples[idx] || null;
        let intermediateStart, intermediateEnd;
        if (intermediate) {
          intermediateStart = Array(axisCount);
          for (let k = 0;k < axisCount; k++)
            intermediateStart[k] = r.readF2Dot14();
          intermediateEnd = Array(axisCount);
          for (let k = 0;k < axisCount; k++)
            intermediateEnd[k] = r.readF2Dot14();
        }
        headers.push({ variationDataSize, peak, intermediateStart, intermediateEnd, privatePts });
      }
      const serialised = new Uint8Array(bytes.buffer, bytes.byteOffset + dataOffset, bytes.length - dataOffset);
      return { tupleVariationCount: tupleVariationCountValue, headers, serialisedData: serialised };
    }
    function unpackPointNumbers(bytes, offset) {
      let i = offset;
      const first = bytes[i++];
      let count;
      if (first === 0)
        return { points: [], bytesConsumed: 1 };
      if (first & 128)
        count = (first & 127) << 8 | bytes[i++];
      else
        count = first;
      const points = Array(count);
      let last = 0, idx = 0;
      while (idx < count) {
        const control = bytes[i++], wordsFlag = !!(control & 128), runLen = (control & 127) + 1;
        for (let k = 0;k < runLen && idx < count; k++) {
          let delta;
          if (wordsFlag) {
            delta = bytes[i] << 8 | bytes[i + 1];
            i += 2;
          } else
            delta = bytes[i++];
          last += delta;
          points[idx++] = last;
        }
      }
      return { points, bytesConsumed: i - offset };
    }
    function unpackDeltas(bytes, offset, count) {
      let i = offset;
      const out = Array(count);
      let idx = 0;
      while (idx < count) {
        const control = bytes[i++], wordsFlag = !!(control & 64), zerosFlag = !!(control & 128), runLen = (control & 63) + 1;
        for (let k = 0;k < runLen && idx < count; k++)
          if (zerosFlag)
            out[idx++] = 0;
          else if (wordsFlag) {
            out[idx++] = bytes[i] << 24 >> 16 | bytes[i + 1];
            i += 2;
          } else {
            out[idx++] = bytes[i] << 24 >> 24;
            i++;
          }
      }
      return { deltas: out, bytesConsumed: i - offset };
    }
    return {
      parseGvar,
      parseGlyphVariationData,
      unpackPointNumbers,
      unpackDeltas,
      EMBEDDED_PEAK_TUPLE: 32768,
      INTERMEDIATE_REGION: 16384,
      PRIVATE_POINT_NUMBERS: 8192,
      TUPLE_INDEX_MASK: 4095
    };
  } });
    __register({ name: "fontGlyph", dependencies: [], factory: function() {
    class Glyph {
      constructor(init) {
        this.id = init.id | 0;
        this.name = init.name;
        this.advanceWidth = init.advanceWidth | 0;
        this.lsb = init.lsb | 0;
        this.bbox = init.bbox || null;
        this.path = init.path || null;
        this.components = init.components || null;
      }
      isEmpty() {
        return !this.path || this.path.commands.length === 0;
      }
      isComposite() {
        return !!this.components;
      }
    }
    return { Glyph };
  } });
    __register({ name: "fontPath", dependencies: [], factory: function() {
    class Path {
      constructor() {
        this.commands = [];
      }
      moveTo(x, y) {
        this.commands.push({ type: "M", x, y });
        return this;
      }
      lineTo(x, y) {
        this.commands.push({ type: "L", x, y });
        return this;
      }
      quadTo(x1, y1, x, y) {
        this.commands.push({ type: "Q", x1, y1, x, y });
        return this;
      }
      curveTo(x1, y1, x2, y2, x, y) {
        this.commands.push({ type: "C", x1, y1, x2, y2, x, y });
        return this;
      }
      close() {
        this.commands.push({ type: "Z" });
        return this;
      }
      bbox() {
        let xMin = 1 / 0, yMin = 1 / 0, xMax = -1 / 0, yMax = -1 / 0;
        for (const c of this.commands) {
          if (c.type === "Z")
            continue;
          if (typeof c.x === "number") {
            if (c.x < xMin)
              xMin = c.x;
            if (c.x > xMax)
              xMax = c.x;
            if (c.y < yMin)
              yMin = c.y;
            if (c.y > yMax)
              yMax = c.y;
          }
          if (typeof c.x1 === "number") {
            if (c.x1 < xMin)
              xMin = c.x1;
            if (c.x1 > xMax)
              xMax = c.x1;
            if (c.y1 < yMin)
              yMin = c.y1;
            if (c.y1 > yMax)
              yMax = c.y1;
          }
          if (typeof c.x2 === "number") {
            if (c.x2 < xMin)
              xMin = c.x2;
            if (c.x2 > xMax)
              xMax = c.x2;
            if (c.y2 < yMin)
              yMin = c.y2;
            if (c.y2 > yMax)
              yMax = c.y2;
          }
        }
        return this.commands.length === 0 ? { xMin: 0, yMin: 0, xMax: 0, yMax: 0 } : { xMin, yMin, xMax, yMax };
      }
      toSvgPath() {
        const out = [];
        for (const c of this.commands)
          switch (c.type) {
            case "M":
              out.push(`M${c.x} ${c.y}`);
              break;
            case "L":
              out.push(`L${c.x} ${c.y}`);
              break;
            case "Q":
              out.push(`Q${c.x1} ${c.y1} ${c.x} ${c.y}`);
              break;
            case "C":
              out.push(`C${c.x1} ${c.y1} ${c.x2} ${c.y2} ${c.x} ${c.y}`);
              break;
            case "Z":
              out.push("Z");
              break;
          }
        return out.join(" ");
      }
      transform(t) {
        const a = t.a ?? 1, b = t.b ?? 0, c = t.c ?? 0, d = t.d ?? 1, e = t.e ?? 0, f = t.f ?? 0;
        for (const cmd of this.commands) {
          if (cmd.type === "Z")
            continue;
          if (typeof cmd.x === "number") {
            const nx = a * cmd.x + c * cmd.y + e, ny = b * cmd.x + d * cmd.y + f;
            cmd.x = nx;
            cmd.y = ny;
          }
          if (typeof cmd.x1 === "number") {
            const nx = a * cmd.x1 + c * cmd.y1 + e, ny = b * cmd.x1 + d * cmd.y1 + f;
            cmd.x1 = nx;
            cmd.y1 = ny;
          }
          if (typeof cmd.x2 === "number") {
            const nx = a * cmd.x2 + c * cmd.y2 + e, ny = b * cmd.x2 + d * cmd.y2 + f;
            cmd.x2 = nx;
            cmd.y2 = ny;
          }
        }
        return this;
      }
    }
    function pathFromSimpleGlyph(glyph) {
      const path = new Path;
      if (!glyph || glyph.kind !== "simple")
        return path;
      let pIdx = 0;
      for (const endPt of glyph.endPtsOfContours) {
        const contour = glyph.points.slice(pIdx, endPt + 1);
        pIdx = endPt + 1;
        if (contour.length === 0)
          continue;
        let firstOn = contour.findIndex((p) => p.onCurve);
        if (firstOn < 0) {
          const last = contour[contour.length - 1], first = contour[0], startX = (last.x + first.x) / 2, startY = (last.y + first.y) / 2;
          path.moveTo(startX, startY);
          firstOn = -1;
        } else {
          const s = contour[firstOn];
          path.moveTo(s.x, s.y);
        }
        const startIdx = firstOn < 0 ? 0 : firstOn, ordered = [], iterCount = firstOn < 0 ? contour.length : contour.length - 1;
        for (let i = 1;i <= iterCount; i++)
          ordered.push(contour[(startIdx + i) % contour.length]);
        let pendingControl = null;
        for (const p of ordered)
          if (p.onCurve)
            if (pendingControl) {
              path.quadTo(pendingControl.x, pendingControl.y, p.x, p.y);
              pendingControl = null;
            } else
              path.lineTo(p.x, p.y);
          else {
            if (pendingControl) {
              const mx = (pendingControl.x + p.x) / 2, my = (pendingControl.y + p.y) / 2;
              path.quadTo(pendingControl.x, pendingControl.y, mx, my);
            }
            pendingControl = p;
          }
        if (pendingControl) {
          const startCmd = path.commands.find((c) => c.type === "M");
          path.quadTo(pendingControl.x, pendingControl.y, startCmd.x, startCmd.y);
        }
        path.close();
      }
      return path;
    }
    return { Path, pathFromSimpleGlyph };
  } });
    __register({ name: "fontCompositeResolve", dependencies: ["fontErrors","fontPath"], factory: function(errors, pathMod) {
    const { ContractError, RenderError } = errors, { Path, pathFromSimpleGlyph } = pathMod;
    function resolveGlyphPath(glyphs, index, visited, depth) {
      if (!Array.isArray(glyphs))
        throw new ContractError("fonts/composite-bad-input", "glyphs must be an array");
      if (index < 0 || index >= glyphs.length)
        throw new ContractError("fonts/composite-bad-index", `glyph index ${index} out of range (numGlyphs=${glyphs.length})`, { context: { index, numGlyphs: glyphs.length } });
      visited = visited || new Set;
      depth = depth || 0;
      if (depth > 16)
        throw new RenderError("fonts/composite-depth", "composite nesting exceeded 16", { context: { index, depth } });
      if (visited.has(index))
        throw new RenderError("fonts/composite-cycle", `composite cycle detected at glyph ${index}`, { context: { index, visited: Array.from(visited) } });
      const g = glyphs[index];
      if (!g)
        return new Path;
      if (g.kind === "simple")
        return pathFromSimpleGlyph(g);
      if (g.kind !== "composite")
        throw new RenderError("fonts/composite-bad-kind", `unknown glyph kind '${g.kind}'`, { context: { index, kind: g.kind } });
      visited.add(index);
      const out = new Path;
      for (const comp of g.components) {
        const sub = resolveGlyphPath(glyphs, comp.glyphIndex, visited, depth + 1), t = comp.transform || { a: 1, b: 0, c: 0, d: 1 }, e = comp.xy ? comp.arg1 || 0 : 0, f = comp.xy ? comp.arg2 || 0 : 0;
        sub.transform({ a: t.a, b: t.b, c: t.c, d: t.d, e, f });
        for (const cmd of sub.commands)
          out.commands.push(cmd);
      }
      visited.delete(index);
      return out;
    }
    return { resolveGlyphPath, MAX_DEPTH: 16 };
  } });
    __register({ name: "fonts", dependencies: ["fontErrors","fontSfnt","tableHead","tableHhea","tableMaxp","tableHmtx","tableCmap","tableName","tableOs2","tablePost","tableLoca","tableGlyf","tableGvar","fontGlyph","fontCompositeResolve"], factory: function(errors, sfntMod, headMod, hheaMod, maxpMod, hmtxMod, cmapMod, nameMod, os2Mod, postMod, locaMod, glyfMod, gvarMod, glyphMod, compositeResolveMod) {
    const KNOWN_HOOKS = [
      "hydrateFont",
      "dehydrateFont",
      "hydrateGlyph",
      "dehydrateGlyph",
      "hydrateTable",
      "dehydrateTable",
      "hydrateName",
      "dehydrateName"
    ], { ContractError, ParseError } = errors, { parseSfnt, SFNT_FLAVOR } = sfntMod, { parseHead } = headMod, { parseHhea } = hheaMod, { parseMaxp } = maxpMod, { parseHmtx } = hmtxMod, { parseCmap, pickUnicodeMap } = cmapMod, { parseName, getNameString, NAME_ID } = nameMod, { parseOs2 } = os2Mod, { parsePost } = postMod, { parseLoca } = locaMod, { parseGlyf } = glyfMod, { parseGvar } = gvarMod, { Glyph } = glyphMod, { resolveGlyphPath } = compositeResolveMod;
    function buildFont(sfnt) {
      if (!sfnt.tables.head)
        throw new ParseError("fonts/missing-head", "font is missing the required `head` table");
      if (!sfnt.tables.maxp)
        throw new ParseError("fonts/missing-maxp", "font is missing the required `maxp` table");
      if (!sfnt.tables.hhea)
        throw new ParseError("fonts/missing-hhea", "font is missing the required `hhea` table");
      if (!sfnt.tables.hmtx)
        throw new ParseError("fonts/missing-hmtx", "font is missing the required `hmtx` table");
      if (!sfnt.tables.cmap)
        throw new ParseError("fonts/missing-cmap", "font is missing the required `cmap` table");
      if (!sfnt.tables.name)
        throw new ParseError("fonts/missing-name", "font is missing the required `name` table");
      const head = parseHead(sfnt.tables.head.bytes), maxp = parseMaxp(sfnt.tables.maxp.bytes), hhea = parseHhea(sfnt.tables.hhea.bytes), hmtx = parseHmtx(sfnt.tables.hmtx.bytes, hhea.numberOfHMetrics, maxp.numGlyphs), cmap = parseCmap(sfnt.tables.cmap.bytes), nameTable = parseName(sfnt.tables.name.bytes), os2 = sfnt.tables["OS/2"] ? parseOs2(sfnt.tables["OS/2"].bytes) : null, post = sfnt.tables.post ? parsePost(sfnt.tables.post.bytes, maxp.numGlyphs) : null;
      let loca = null, glyphTable = null;
      if (sfnt.tables.loca && sfnt.tables.glyf) {
        loca = parseLoca(sfnt.tables.loca.bytes, maxp.numGlyphs, head.indexToLocFormat);
        glyphTable = parseGlyf(sfnt.tables.glyf.bytes, loca);
      }
      const unicodeMap = pickUnicodeMap(cmap) || new Map, numGlyphs = maxp.numGlyphs;
      for (const [cp, gid] of unicodeMap)
        if (gid >= numGlyphs)
          throw new ParseError("fonts/inconsistent-tables", `cmap maps U+${cp.toString(16)} to glyph ${gid} but numGlyphs=${numGlyphs}`, { context: { codePoint: cp, gid, numGlyphs } });
      if (glyphTable)
        for (let gid = 0;gid < glyphTable.length; gid++) {
          const g = glyphTable[gid];
          if (!g || g.kind !== "composite")
            continue;
          for (const comp of g.components)
            if (comp.glyphIndex >= numGlyphs)
              throw new ParseError("fonts/inconsistent-tables", `composite glyph ${gid} references component glyph ${comp.glyphIndex} but numGlyphs=${numGlyphs}`, { context: { gid, componentIndex: comp.glyphIndex, numGlyphs } });
        }
      if (sfnt.tables.gvar) {
        const gvar = parseGvar(sfnt.tables.gvar.bytes);
        if (gvar.glyphCount !== numGlyphs)
          throw new ParseError("fonts/inconsistent-tables", `gvar declares glyphCount=${gvar.glyphCount} but numGlyphs=${numGlyphs}`, { context: { gvarGlyphCount: gvar.glyphCount, numGlyphs } });
      }
      const names = {
        family: getNameString(nameTable, NAME_ID.FONT_FAMILY),
        subfamily: getNameString(nameTable, NAME_ID.FONT_SUBFAMILY),
        fullName: getNameString(nameTable, NAME_ID.FULL_NAME),
        postScriptName: getNameString(nameTable, NAME_ID.POSTSCRIPT_NAME),
        version: getNameString(nameTable, NAME_ID.VERSION),
        copyright: getNameString(nameTable, NAME_ID.COPYRIGHT),
        manufacturer: getNameString(nameTable, NAME_ID.MANUFACTURER),
        designer: getNameString(nameTable, NAME_ID.DESIGNER)
      }, font = {
        flavor: sfnt.flavor,
        sfntVersion: sfnt.sfntVersion,
        rawSfnt: sfnt,
        head,
        hhea,
        maxp,
        hmtx,
        cmap,
        name: nameTable,
        os2,
        post,
        loca,
        glyphTable,
        names,
        numGlyphs: maxp.numGlyphs,
        unitsPerEm: head.unitsPerEm,
        unicodeMap,
        advanceWidth(gid) {
          if (gid < 0 || gid >= maxp.numGlyphs)
            return 0;
          return hmtx.metrics[gid].advanceWidth;
        },
        leftSideBearing(gid) {
          if (gid < 0 || gid >= maxp.numGlyphs)
            return 0;
          return hmtx.metrics[gid].lsb;
        },
        glyphIndexForCodePoint(cp, opts) {
          const gid = unicodeMap.get(cp);
          if (gid !== void 0)
            return gid;
          return opts && opts.strict ? -1 : 0;
        },
        getGlyphByIndex(gid) {
          if (gid < 0 || gid >= maxp.numGlyphs)
            throw new ContractError("fonts/bad-gid", `glyph index ${gid} out of range (numGlyphs=${maxp.numGlyphs})`, { context: { gid, numGlyphs: maxp.numGlyphs } });
          const entry = glyphTable ? glyphTable[gid] : null, psName = post && post.glyphNames ? post.glyphNames[gid] : void 0, m = hmtx.metrics[gid], path = entry ? resolveGlyphPath(glyphTable, gid) : null, bbox = entry ? entry.bbox : null, components = entry && entry.kind === "composite" ? entry.components : null;
          return new Glyph({
            id: gid,
            name: psName,
            advanceWidth: m.advanceWidth,
            lsb: m.lsb,
            bbox,
            path,
            components
          });
        },
        getGlyphByCodePoint(cp) {
          const gid = font.glyphIndexForCodePoint(cp);
          return font.getGlyphByIndex(gid);
        }
      };
      return font;
    }
    const extensions = [];
    function notify(hook, payload) {
      for (const ext of extensions)
        if (typeof ext[hook] === "function")
          ext[hook](payload);
    }
    function read(bytes) {
      if (!(bytes instanceof Uint8Array))
        throw new ContractError("fonts/read-input", "fonts.read expects Uint8Array", { context: { actual: typeof bytes } });
      const sfnt = parseSfnt(bytes), font = buildFont(sfnt);
      notify("hydrateFont", font);
      return font;
    }
    function use(...exts) {
      for (const ext of exts) {
        if (!ext || typeof ext !== "object")
          continue;
        if (extensions.includes(ext))
          continue;
        extensions.push(ext);
      }
      return api;
    }
    const api = { read, use, buildFont, KNOWN_HOOKS, SFNT_FLAVOR };
    return api;
  } });
    __register({ name: "extraMath", dependencies: ["fontErrors","fontReader"], factory: function(errors, reader) {
    const MATH_CONSTANTS_FIELDS_ARR = Object.freeze([
      "scriptPercentScaleDown",
      "scriptScriptPercentScaleDown",
      "delimitedSubFormulaMinHeight",
      "displayOperatorMinHeight",
      "mathLeading",
      "axisHeight",
      "accentBaseHeight",
      "flattenedAccentBaseHeight",
      "subscriptShiftDown",
      "subscriptTopMax",
      "subscriptBaselineDropMin",
      "superscriptShiftUp",
      "superscriptShiftUpCramped",
      "superscriptBottomMin",
      "superscriptBaselineDropMax",
      "subSuperscriptGapMin",
      "superscriptBottomMaxWithSubscript",
      "spaceAfterScript",
      "upperLimitGapMin",
      "upperLimitBaselineRiseMin",
      "lowerLimitGapMin",
      "lowerLimitBaselineDropMin",
      "stackTopShiftUp",
      "stackTopDisplayStyleShiftUp",
      "stackBottomShiftDown",
      "stackBottomDisplayStyleShiftDown",
      "stackGapMin",
      "stackDisplayStyleGapMin",
      "stretchStackTopShiftUp",
      "stretchStackBottomShiftDown",
      "stretchStackGapAboveMin",
      "stretchStackGapBelowMin",
      "fractionNumeratorShiftUp",
      "fractionNumeratorDisplayStyleShiftUp",
      "fractionDenominatorShiftDown",
      "fractionDenominatorDisplayStyleShiftDown",
      "fractionNumeratorGapMin",
      "fractionNumeratorDisplayStyleGapMin",
      "fractionRuleThickness",
      "fractionDenominatorGapMin",
      "fractionDenominatorDisplayStyleGapMin",
      "skewedFractionHorizontalGap",
      "skewedFractionVerticalGap",
      "overbarVerticalGap",
      "overbarRuleThickness",
      "overbarExtraAscender",
      "underbarVerticalGap",
      "underbarRuleThickness",
      "underbarExtraDescender",
      "radicalVerticalGap",
      "radicalDisplayStyleVerticalGap",
      "radicalRuleThickness",
      "radicalExtraAscender",
      "radicalKernBeforeDegree",
      "radicalKernAfterDegree"
    ]), { ParseError } = errors, { BinaryReader } = reader;
    function parseMath(bytes) {
      if (!(bytes instanceof Uint8Array))
        throw new ParseError("fonts/math-input", "parseMath expects a Uint8Array", { context: { actual: typeof bytes } });
      if (bytes.length < 10)
        throw new ParseError("fonts/math-short", "MATH table header truncated", { context: { length: bytes.length } });
      const r = new BinaryReader(bytes), majorVersion = r.readUint16(), minorVersion = r.readUint16();
      if (majorVersion !== 1)
        throw new ParseError("fonts/math-version", `unsupported MATH version ${majorVersion}.${minorVersion}`, { context: { majorVersion, minorVersion } });
      const mathConstantsOffset = r.readUint16(), mathGlyphInfoOffset = r.readUint16(), mathVariantsOffset = r.readUint16(), constants = mathConstantsOffset ? readMathConstants(bytes, mathConstantsOffset) : null, glyphInfo = mathGlyphInfoOffset ? sliceBlob(bytes, mathGlyphInfoOffset) : null, variants = mathVariantsOffset ? sliceBlob(bytes, mathVariantsOffset) : null;
      return {
        majorVersion,
        minorVersion,
        mathConstantsOffset,
        mathGlyphInfoOffset,
        mathVariantsOffset,
        constants,
        glyphInfo,
        variants
      };
    }
    function sliceBlob(bytes, offset) {
      if (offset >= bytes.length)
        throw new ParseError("fonts/math-bad-offset", "MATH sub-table offset out of range", { context: { offset, length: bytes.length } });
      return {
        offset,
        bytes: new Uint8Array(bytes.buffer, bytes.byteOffset + offset, bytes.length - offset)
      };
    }
    function readMathConstants(bytes, offset) {
      const SIZE = 8 + (MATH_CONSTANTS_FIELDS_ARR.length - 4) * 4 + 2;
      if (offset + SIZE > bytes.length)
        throw new ParseError("fonts/math-constants-truncated", "MathConstants sub-table truncated", { context: { offset, need: SIZE, available: bytes.length - offset } });
      const r = new BinaryReader(bytes, offset, SIZE), out = {};
      for (let i = 0;i < 4; i++)
        out[MATH_CONSTANTS_FIELDS_ARR[i]] = r.readInt16();
      for (let i = 4;i < MATH_CONSTANTS_FIELDS_ARR.length; i++) {
        const value = r.readInt16(), deviceOffset = r.readUint16();
        out[MATH_CONSTANTS_FIELDS_ARR[i]] = { value, deviceOffset };
      }
      out.radicalDegreeBottomRaisePercent = r.readInt16();
      return out;
    }
    return { parseMath, MATH_CONSTANTS_FIELDS: MATH_CONSTANTS_FIELDS_ARR };
  } });
    __register({ name: "extraJstf", dependencies: ["fontErrors","fontReader","fontTag"], factory: function(errors, reader, tag) {
    const { ParseError } = errors, { BinaryReader } = reader, { untag } = tag;
    function parseJstf(bytes) {
      if (!(bytes instanceof Uint8Array))
        throw new ParseError("fonts/jstf-input", "parseJstf expects a Uint8Array", { context: { actual: typeof bytes } });
      if (bytes.length < 6)
        throw new ParseError("fonts/jstf-short", "JSTF header truncated", { context: { length: bytes.length } });
      const r = new BinaryReader(bytes), majorVersion = r.readUint16(), minorVersion = r.readUint16();
      if (majorVersion !== 1)
        throw new ParseError("fonts/jstf-version", `unsupported JSTF version ${majorVersion}.${minorVersion}`, { context: { majorVersion, minorVersion } });
      const scriptCount = r.readUint16();
      if (6 + scriptCount * 6 > bytes.length)
        throw new ParseError("fonts/jstf-records-truncated", "JSTF script records run past end of table", { context: { scriptCount, tableLength: bytes.length } });
      const scriptRecords = Array(scriptCount);
      for (let i = 0;i < scriptCount; i++) {
        const tagU32 = r.readUint32(), offset = r.readUint16();
        scriptRecords[i] = { tag: tagU32, tagStr: untag(tagU32), offset };
      }
      const scripts = Array(scriptCount);
      for (let i = 0;i < scriptCount; i++) {
        const rec = scriptRecords[i];
        scripts[i] = {
          tag: rec.tag,
          tagStr: rec.tagStr,
          offset: rec.offset,
          ...readJstfScript(bytes, rec.offset)
        };
      }
      return { majorVersion, minorVersion, scriptCount, scriptRecords, scripts };
    }
    function readJstfScript(bytes, offset) {
      if (offset + 6 > bytes.length)
        throw new ParseError("fonts/jstf-script-truncated", "JstfScript sub-table truncated", { context: { offset, length: bytes.length } });
      const r = new BinaryReader(bytes, offset, bytes.length - offset), extenderGlyphOffset = r.readUint16(), defaultLangSysOffset = r.readUint16(), langSysCount = r.readUint16();
      if (6 + langSysCount * 6 > r.length)
        throw new ParseError("fonts/jstf-langsys-records-truncated", "JstfScript langSys records exceed sub-table", { context: { offset, langSysCount } });
      const langSysRecords = Array(langSysCount);
      for (let i = 0;i < langSysCount; i++) {
        const tagU32 = r.readUint32(), langSysOffset = r.readUint16();
        langSysRecords[i] = {
          tag: tagU32,
          tagStr: untag(tagU32),
          offset: langSysOffset,
          bytes: langSysOffset < r.length ? new Uint8Array(bytes.buffer, bytes.byteOffset + offset + langSysOffset, r.length - langSysOffset) : new Uint8Array(0)
        };
      }
      return {
        extenderGlyphOffset,
        defaultLangSysOffset,
        langSysCount,
        langSysRecords
      };
    }
    return { parseJstf };
  } });

    const __core = __resolve("fonts");
    __core.use(__resolve("extraMath"), __resolve("extraJstf"));
    return __core;
    }
};
