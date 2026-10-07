/*!
 * Copyright (c) 2026 AwaCloud SAS
 * Author: Matthieu Bouilloux
 * SPDX-License-Identifier: AGPL-3.0-only
 * Dual-licensed; see the NOTICE file for licensing and any additional terms.
 */
/* GENERATED — do not edit. Source: packages/front/office/pdf/tools/generate-bundles.mjs */

/**
 * @fileoverview `@awacloud/pdf/bundles/prebuilt/pdf-legacy-package` — pre-built single-factory bundle.
 *
 * Variant **package** : declares the 26 fw modules as dependencies and inlines every
 * pdf-local factory transitively reachable from `pdf` plus 31 extras.
 *
 * @module pdf/bundles/prebuilt/pdf-legacy-package
 */

export const pdfLegacyPackage = {
    name: "pdfLegacyPackage",
    dependencies: ["bitstream","huffman","lz77","deflate","adler32","b64","hex","zlib","lzw","utf8","aes","cbc","gcm","sha256","sha384","sha512","bitArray","asn1","asn1Oid","pem","random","bn","hmac","rsa","ecc","ed25519"],
    factory(bitstream, huffman, lz77, deflate, adler32, b64, hex, zlib, lzw, utf8, aes, cbc, gcm, sha256, sha384, sha512, bitArray, asn1, asn1Oid, pem, random, bn, hmac, rsa, ecc, ed25519) {
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
    __cache["bitstream"] = bitstream;
    __cache["huffman"] = huffman;
    __cache["lz77"] = lz77;
    __cache["deflate"] = deflate;
    __cache["adler32"] = adler32;
    __cache["b64"] = b64;
    __cache["hex"] = hex;
    __cache["zlib"] = zlib;
    __cache["lzw"] = lzw;
    __cache["utf8"] = utf8;
    __cache["aes"] = aes;
    __cache["cbc"] = cbc;
    __cache["gcm"] = gcm;
    __cache["sha256"] = sha256;
    __cache["sha384"] = sha384;
    __cache["sha512"] = sha512;
    __cache["bitArray"] = bitArray;
    __cache["asn1"] = asn1;
    __cache["asn1Oid"] = asn1Oid;
    __cache["pem"] = pem;
    __cache["random"] = random;
    __cache["bn"] = bn;
    __cache["hmac"] = hmac;
    __cache["rsa"] = rsa;
    __cache["ecc"] = ecc;
    __cache["ed25519"] = ed25519;

    // pdf-local factories — inlined and topo-ordered.
    __register({ name: "pdfErrors", dependencies: [], factory: function() {
    class PdfError extends Error {
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
      const entries = {};
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
        let p = tok.pos();
        if (p < bytes.length && bytes[p] === 13)
          p++;
        if (p < bytes.length && bytes[p] === 10)
          p++;
        for (let k = 0;k < cnt.value; k++) {
          if (p + 20 > bytes.length)
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
          p += 20;
        }
        tok.seek(p);
      }
      return { entries, end: tok.pos() };
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
      if (e.Encrypt)
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
      "DPartRoot"
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
        const kids = node.entries.Kids;
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
      "AssociatedFiles"
    ]);
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
          case 4:
            out[i] = v - paeth(left, up, upLeft) & 255;
            break;
          default:
            throw new ParseError("pdf/flate/bad-png-filter", "unknown PNG filter tag", { context: { tag: filter } });
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
      return !!e && e.code === 0;
    }
    function inflatePrefix(bytes) {
      const chunks = [];
      let total = 0;
      new fwZlib.UnzlibStream((chunk) => {
        chunks.push(chunk);
        total += chunk.length;
      }).push(bytes, !1);
      const out = new Uint8Array(total);
      let off = 0;
      for (const chunk of chunks) {
        out.set(chunk, off);
        off += chunk.length;
      }
      return out;
    }
    function markTruncated(out) {
      Object.defineProperty(out, "truncated", { value: !0, enumerable: !1 });
      return out;
    }
    function decode(bytes, params) {
      if (!(bytes instanceof Uint8Array))
        throw new ParseError("pdf/flate/bad-input", "FlateDecode expects Uint8Array");
      let raw, truncated = !1;
      try {
        raw = fwZlib.unzlibSync(bytes);
      } catch (e) {
        const inflateFailed = () => new ParseError("pdf/flate/inflate-failed", "inflate failed: " + (e && e.message), { context: { length: bytes.length }, cause: e });
        if (!endedBeforeFinalBlock(e) || typeof fwZlib.UnzlibStream !== "function")
          throw inflateFailed();
        let prefix;
        try {
          prefix = inflatePrefix(bytes);
        } catch {
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
    return { decode, encode };
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
    const { ParseError } = errors;
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
    return {
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
    __register({ name: "pdfDocument", dependencies: ["pdfErrors","pdfTokenizer","pdfParser","pdfXref","pdfTrailer","pdfCatalog","pdfPage","pdfPages","pdfCrossRefStream","pdfObjStream","pdfFilterDispatch"], factory: function(errors, tokenizerMod, parserMod, xrefMod, trailerMod, catalogMod, pageMod, pagesMod, crossRefStreamMod, objStreamMod, filterDispatchMod) {
    const { ParseError } = errors, tokenize = tokenizerMod && tokenizerMod.tokenize, parseIndirect = parserMod && parserMod.parseIndirect, locateStartXref = xrefMod && xrefMod.locateStartXref, readStartXref = xrefMod && xrefMod.readStartXref, parseXrefTable = xrefMod && xrefMod.parseXrefTable, parseTrailerDict = xrefMod && xrefMod.parseTrailerDict, typeTrailer = trailerMod && trailerMod.typeTrailer, typeCatalog = catalogMod && catalogMod.typeCatalog, typePage = pageMod && pageMod.typePage, walkPageTree = pagesMod && pagesMod.walkPageTree, HEADER_PREFIX = new Uint8Array([37, 80, 68, 70, 45]), XREF_KEYWORD = new Uint8Array([120, 114, 101, 102]), PDF_NULL = Object.freeze({ type: "null" }), SECTION_LOCAL_KEYS = new Set([
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
    function readXrefStreamSection(bytes, at) {
      requireStreamWiring(at);
      const tok = tokenize(bytes, { start: at }), streamObj = parseIndirect(tok, refuseIndirectLength).value, typeEntry = streamObj && streamObj.dict && streamObj.dict.entries && streamObj.dict.entries.Type;
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
    function readDocument(bytes, opts = {}) {
      if (!(bytes instanceof Uint8Array))
        throw new ParseError("pdf/document/bad-input", "readDocument expects a Uint8Array", { context: { typeof: typeof bytes } });
      const { version, end: headerEnd } = readHeader(bytes), sxAt = locateStartXref(bytes);
      if (sxAt < 0)
        throw new ParseError("pdf/document/no-startxref", "startxref keyword not found near EOF");
      const xrefAt = readStartXref(bytes, sxAt), xref = { entries: {}, sections: [] }, losses = [], trailerDicts = [];
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
        if (startsXrefTable(bytes, skipWhitespace(bytes, cursor))) {
          const section = parseXrefTable(bytes, cursor);
          mergeSection(cursor, "table", section.entries);
          dict = parseTrailerDict(bytes, section.end).dict;
          const stmAt = dict && dict.entries && dict.entries.XRefStm;
          if (stmAt && stmAt.type === "int" && stmAt.value >= 0 && stmAt.value < bytes.length) {
            const hybrid = readXrefStreamSection(bytes, stmAt.value);
            mergeSection(stmAt.value, "stream", hybrid.entries);
          }
        } else {
          const section = readXrefStreamSection(bytes, cursor);
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
      const trailerTyped = typeTrailer(mergeTrailerDicts(trailerDicts));
      if (trailerTyped.encrypt && opts.allowEncrypted !== !0)
        throw new ParseError("pdf/document/encrypted", "document is encrypted (trailer /Encrypt present) \u2014 " + "no decrypt path is composed for readDocument; pass { allowEncrypted: true } to read the raw ciphertext container", { context: { encrypt: trailerTyped.encrypt } });
      const indirects = new Map, lossKeys = new Set, freeKeys = new Set, objStmMembers = new Map;
      function resolve(ref) {
        if (!ref || ref.type !== "ref")
          return ref;
        return resolveByKey(ref.num, ref.gen);
      }
      function resolveByKey(num, gen) {
        const key = num + ":" + gen;
        if (indirects.has(key))
          return indirects.get(key).value;
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
        if (offset <= 0 || offset >= bytes.length)
          throw new ParseError("pdf/document/bad-offset", `object ${num} ${gen} xref offset out of range`, { context: { num, gen, offset, total: bytes.length } });
        const tok = tokenize(bytes, { start: offset }), def = parseIndirect(tok, resolve);
        if (def.num !== num || def.gen !== gen)
          throw new ParseError("pdf/document/xref-mismatch", "xref points to a different object", { context: { expected: { num, gen }, found: { num: def.num, gen: def.gen } } });
        indirects.set(key, { value: def.value, offset });
        return def.value;
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
        if (trailerTyped && trailerTyped.encrypt)
          throw new ParseError("pdf/document/objstm-encrypted", "object streams of an encrypted document cannot be " + "read \u2014 no decrypt path is composed for readDocument", { context: { num, gen, objStm: entry.objStm } });
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
        _raw: {
          resolve,
          bytes,
          headerEnd,
          indirects
        }
      };
    }
    return { readDocument, readHeader };
  } });
    __register({ name: "pdfWriter", dependencies: ["pdfErrors","pdfSerializer"], factory: function(errors, serializerMod) {
    const { RenderError } = errors, serializeIndirect = serializerMod.serializeIndirect, te = new TextEncoder;
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
      const size = maxNum + 1;
      push(buildTrailer({
        size,
        root: opts.root,
        info: opts.info,
        id: opts.id,
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
      read(bytes, opts) {
        return readDocument(bytes, opts);
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
      HTO: { kind: "array", doc: "halftone origin [tx ty]" }
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
    return {
      typeExtGState,
      decodeType3CharOp,
      EXT_GSTATE_KEYS
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
    return { typeCIDFont, typeCIDSystemInfo, decodeWidthsW, PREDEFINED_CMAPS };
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
      return {
        subtype: "OpenType",
        length: stream.raw instanceof Uint8Array ? stream.raw.length : null,
        metadata: e.Metadata || null,
        color,
        raw: stream,
        _extras: collectExtras(e, new Set(["Subtype", "Length", "Filter", "DecodeParms", "Metadata"]))
      };
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
      "UserProperties"
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
      Table: new Set(["O", "RowSpan", "ColSpan", "Headers", "Scope", "Summary"]),
      PrintField: new Set(["O", "Role", "checked", "Desc"]),
      Artifact: new Set(["O", "Type", "BBox", "Attached", "Subtype"]),
      UserProperties: new Set(["O", "P"])
    };
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
        width: numVal(e.Width, null),
        height: numVal(e.Height, null),
        blockAlign: nameVal(e.BlockAlign),
        inlineAlign: nameVal(e.InlineAlign),
        lineHeight: numVal(e.LineHeight, null),
        baselineShift: numVal(e.BaselineShift, null),
        textPosition: nameVal(e.TextPosition),
        textDecorationType: nameVal(e.TextDecorationType),
        textDecorationColor: numArr(e.TextDecorationColor),
        textDecorationThickness: numVal(e.TextDecorationThickness, null),
        columnCount: numVal(e.ColumnCount, null),
        columnGap: e.ColumnGap || null,
        columnWidths: e.ColumnWidths || null
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
        summary: isType(e.Summary, "string") ? e.Summary.value : null
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
    const { ParseError } = errors, { isType } = parserObj, { typeBaseAnnot, captureExtras } = annot, SUBTYPES = new Set([
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
    ]);
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
      captureExtras(base, dict, new Set(["3DD", "3DV", "3DA", "3DI", "3DB"]));
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
      FREETEXT_LINE_ENDINGS
    };
  } });
    __register({ name: "pdfAOutputIntent", dependencies: ["pdfErrors","pdfParser"], factory: function(errors, parser) {
    const { ParseError } = errors, { isType } = parser, PDFA_PROFILES = Object.freeze({
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
    function validatePdfABasics(typedDoc) {
      if (!typedDoc || typeof typedDoc !== "object")
        throw new ParseError("pdf/extra/pdfa/lint/bad-doc", "validatePdfABasics requires a typed document object", { context: { type: typeof typedDoc } });
      const errors = [], warnings = [], cat = typedDoc.catalog && typedDoc.catalog.entries;
      if (typedDoc.encrypted)
        errors.push("PDF/A forbids encryption");
      if (!cat) {
        errors.push("catalog missing");
        return { pass: !1, errors, warnings };
      }
      if (!cat.Metadata)
        errors.push("catalog requires /Metadata XMP stream");
      if (cat.MarkInfo && !isType(cat.MarkInfo, "dict"))
        errors.push("/MarkInfo must be a dictionary");
      if (!cat.OutputIntents)
        warnings.push("catalog has no /OutputIntents array");
      return { pass: errors.length === 0, errors, warnings };
    }
    return {
      detectPdfAProfile,
      validatePdfABasics,
      PDFA_PROFILES
    };
  } });
    __register({ name: "pdfUaTagged", dependencies: ["pdfErrors","pdfParser"], factory: function(errors, parser) {
    const { ParseError } = errors, { isType } = parser, UA_STRUCTURE = Object.freeze({
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
    });
    function validatePdfUa(typedDoc) {
      if (!typedDoc || typeof typedDoc !== "object")
        throw new ParseError("pdf/extra/pdfua/bad-doc", "validatePdfUa requires a typed document object", { context: { type: typeof typedDoc } });
      const errors = [], warnings = [], cat = typedDoc.catalog && typedDoc.catalog.entries;
      if (!cat) {
        errors.push("catalog missing");
        return { pass: !1, errors, warnings };
      }
      if (!cat.StructTreeRoot)
        errors.push("catalog requires /StructTreeRoot");
      if (!cat.Lang || !isType(cat.Lang, "string"))
        errors.push("catalog requires /Lang string");
      if (!cat.MarkInfo)
        errors.push("catalog requires /MarkInfo dictionary");
      else if (!isType(cat.MarkInfo, "dict"))
        errors.push("/MarkInfo must be a dictionary");
      else {
        const m = cat.MarkInfo.entries.Marked;
        if (!isType(m, "bool") || m.value !== !0)
          errors.push("/MarkInfo /Marked must be true");
      }
      if (cat.ViewerPreferences && isType(cat.ViewerPreferences, "dict")) {
        const ddt = cat.ViewerPreferences.entries.DisplayDocTitle;
        if (!isType(ddt, "bool") || ddt.value !== !0)
          warnings.push("/ViewerPreferences /DisplayDocTitle should be true");
      } else
        warnings.push("catalog should have /ViewerPreferences");
      if (typeof typedDoc.p === "number") {
        if ((typedDoc.p & 512) === 0)
          errors.push("permissions bit 10 (accessible) must be set");
      }
      return { pass: errors.length === 0, errors, warnings };
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
    const { ParseError } = errors, { isType } = parserObj, EXTENDED_ACTION_SUBTYPES = new Set([
      "GoTo3DView",
      "SetOCGState",
      "Trans",
      "Rendition",
      "Hide",
      "SubmitForm",
      "ResetForm",
      "ImportData",
      "JavaScript"
    ]), KNOWN = {
      GoTo3DView: new Set(["Type", "S", "Next", "TA", "V"]),
      SetOCGState: new Set(["Type", "S", "Next", "State", "PreserveRB"]),
      Trans: new Set(["Type", "S", "Next", "Trans"]),
      Rendition: new Set(["Type", "S", "Next", "R", "AN", "OP", "JS"]),
      Hide: new Set(["Type", "S", "Next", "T", "H"]),
      SubmitForm: new Set(["Type", "S", "Next", "F", "Fields", "Flags", "CharSet"]),
      ResetForm: new Set(["Type", "S", "Next", "Fields", "Flags"]),
      ImportData: new Set(["Type", "S", "Next", "F"]),
      JavaScript: new Set(["Type", "S", "Next", "JS"])
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
      const op = e.OP && (e.OP.type === "int" || e.OP.type === "real") ? e.OP.value | 0 : null, hasJs = isType(e.JS, "string") || isType(e.JS, "stream");
      return {
        r: e.R || null,
        an: e.AN || null,
        op,
        js: isType(e.JS, "string") ? e.JS.value : isType(e.JS, "stream") ? e.JS : null,
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
      if (!isType(e.JS, "string") && !isType(e.JS, "stream"))
        throw new ParseError("pdf/extra/action-ext/bad-js", "/JS must be string or stream", { context: { type: e.JS.type } });
      return { js: e.JS, sandboxed: !0 };
    }
    function collectExtras(entries, known) {
      const out = {};
      for (const k of Object.keys(entries))
        if (!known.has(k))
          out[k] = entries[k];
      return out;
    }
    return { typeExtendedAction, EXTENDED_ACTION_SUBTYPES };
  } });
    __register({ name: "pdfColorSpacesExtended", dependencies: ["pdfErrors","pdfParserObj"], factory: function(errors, parserObj) {
    const { ParseError } = errors, { isType } = parserObj, COLOR_SPACE_FAMILIES = new Set([
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
    return { typeColorSpace, COLOR_SPACE_FAMILIES };
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
    return { typeShading, typeFunction };
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
    const { ParseError } = errors, { isType } = parser, SIG_SUBFILTERS = Object.freeze({
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
    return {
      detectPadesProfile,
      typeReferenceArray,
      typeDSS,
      validateDocMdp,
      validateBLtaChain,
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
      "NodeNameTree"
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
        start: isType(e.Start, "int") ? e.Start.value : null,
        end: isType(e.End, "int") ? e.End.value : null,
        dpm: isType(e.DPM, "dict") ? typeDPM(e.DPM) : null,
        nodeNameTree: e.NodeNameTree || null,
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
    const { ParseError } = errors, { isType } = parser, PDFX_PROFILES = Object.freeze({
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
    return {
      typePdfXOutputIntent,
      lintPdfXPage,
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
    const { ParseError } = errors, { isType } = parser, VE_OPERATORS = Object.freeze(["And", "Or", "Not"]);
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
    return {
      evaluateVE,
      typeOrderTree,
      typeRBGroups,
      classifyOcgIntent,
      VE_OPERATORS
    };
  } });
    __register({ name: "pdfEmbeddedFilesPortfolio", dependencies: ["pdfErrors"], factory: function(errors) {
    const { ParseError } = errors, VIEW_MODES = new Set(["D", "T", "H", "C"]), SCHEMA_SUBTYPES = new Set([
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
      const KNOWN = new Set(["Subtype", "N", "O", "V", "E"]);
      for (const k of Object.keys(e))
        if (!KNOWN.has(k))
          out._extras[k] = e[k];
      return out;
    }
    function typeSchema(schemaDict) {
      if (!isDict(schemaDict))
        throw new ParseError("pdf/portfolio/bad-schema", "/Schema must be a dictionary", { context: { type: schemaDict && schemaDict.type } });
      const fields = {};
      for (const [k, v] of Object.entries(schemaDict.entries))
        fields[k] = typeSchemaField(k, v);
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
      for (const k of Object.keys(e))
        if (k !== "S" && k !== "A")
          out._extras[k] = e[k];
      return out;
    }
    function typeNavigator(nav) {
      if (nav && nav.type === "ref")
        return { ref: { num: nav.num, gen: nav.gen }, raw: nav };
      if (!isDict(nav))
        throw new ParseError("pdf/portfolio/bad-navigator", "/Navigator must be a dict or ref");
      return { raw: nav, entries: nav.entries };
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
      const out = { raw: ciDict, fields: {}, _extras: {} };
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
    function parsePacket(input) {
      const pairs = extract(input);
      return { pairs, grouped: group(pairs) };
    }
    return {
      parsePacket,
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
    const { ParseError } = errors, { isType } = parser, THREE_D_KNOWN = new Set([
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
    return {
      type3DAnnot,
      type3DActivation,
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
    const { ParseError } = errors, REQUIREMENT_S_VALUES = new Set([
      "EnableJavaScripts"
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
        } else
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
        out.push({
          raw: it,
          s: e.S.value,
          standard: REQUIREMENT_S_VALUES.has(e.S.value),
          rh: e.RH
        });
      }
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
    return {
      typeSpiderInfo,
      typeThreads,
      typeLegal,
      typeRequirements,
      typeDocMdpParams,
      typePerms,
      typeNeedsRendering,
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
    __register({ name: "pdfLegacyXfaRead", dependencies: ["pdfErrors"], factory: function(errors) {
    const { ParseError } = errors, KNOWN_PACKETS = new Set([
      "xdp",
      "preamble",
      "config",
      "template",
      "localeSet",
      "datasets",
      "form",
      "connectionSet",
      "sourceSet",
      "stylesheet",
      "xmpmeta",
      "signature",
      "postamble",
      "pdf"
    ]);
    function isStream(v) {
      return v && v.type === "stream";
    }
    function isStr(v) {
      return v && v.type === "string";
    }
    function isArr(v) {
      return v && v.type === "array";
    }
    function streamBytes(s) {
      if (!isStream(s))
        throw new ParseError("pdf/xfa/bad-packet", "XFA packet must be a stream", { context: { type: s && s.type } });
      return s.raw;
    }
    function decodeString(v) {
      if (!isStr(v))
        throw new ParseError("pdf/xfa/bad-key", "XFA array key must be a PDF string", { context: { type: v && v.type } });
      const b = v.value;
      if (b instanceof Uint8Array)
        return new TextDecoder("latin1").decode(b);
      return String(b);
    }
    function readXfa(xfa) {
      if (isStream(xfa))
        return {
          _legacy: { xfa: { shape: "stream", xdp: streamBytes(xfa) } }
        };
      if (isArr(xfa)) {
        if (xfa.items.length % 2 !== 0)
          throw new ParseError("pdf/xfa/odd-array", "XFA array must have even item count (key/stream pairs)", { context: { length: xfa.items.length } });
        const packets = {}, order = [], unknown = [];
        for (let i = 0;i < xfa.items.length; i += 2) {
          const key = decodeString(xfa.items[i]), bytes = streamBytes(xfa.items[i + 1]);
          packets[key] = bytes;
          order.push(key);
          if (!KNOWN_PACKETS.has(key))
            unknown.push(key);
        }
        return {
          _legacy: {
            xfa: { shape: "array", packets, order, unknownPackets: unknown }
          }
        };
      }
      throw new ParseError("pdf/xfa/bad-shape", "/XFA must be a stream or array", { context: { type: xfa && xfa.type } });
    }
    function isKnownPacket(name) {
      return KNOWN_PACKETS.has(String(name));
    }
    return {
      readXfa,
      isKnownPacket,
      KNOWN_PACKETS
    };
  } });
    __register({ name: "pdfLegacyRc4Read", dependencies: ["pdfErrors"], factory: function(errors) {
    const { EncryptionError } = errors, PASSWORD_PADDING = new Uint8Array([
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
    ]);
    function rc4(key, data) {
      if (!(key instanceof Uint8Array) || !(data instanceof Uint8Array))
        throw new EncryptionError("pdf/rc4/bad-input", "RC4 expects Uint8Array key and data");
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
      if (!(bytes instanceof Uint8Array))
        throw new EncryptionError("pdf/md5/bad-input", "md5 expects Uint8Array");
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
      if (typeof pw === "string")
        pw = new TextEncoder().encode(pw);
      if (!(pw instanceof Uint8Array))
        throw new EncryptionError("pdf/rc4/bad-password", "password must be string or Uint8Array");
      const out = new Uint8Array(32), take = Math.min(32, pw.length);
      out.set(pw.subarray(0, take));
      out.set(PASSWORD_PADDING.subarray(0, 32 - take), take);
      return out;
    }
    function computeFileKey(pw, params) {
      const { O, P, idFirst, revision, keyLength, encryptMetadata } = params;
      if (!(O instanceof Uint8Array) || O.length !== 32)
        throw new EncryptionError("pdf/rc4/bad-O", "/O must be a 32-byte Uint8Array");
      if (!(idFirst instanceof Uint8Array))
        throw new EncryptionError("pdf/rc4/bad-id", "first /ID element required");
      const padded = padPassword(pw), extra = revision >= 4 && encryptMetadata === !1 ? 4 : 0, buf = new Uint8Array(68 + idFirst.length + extra);
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
      const nBytes = keyLength / 8;
      if (revision >= 3)
        for (let i = 0;i < 50; i++)
          h = md5(h.subarray(0, nBytes));
      return h.subarray(0, nBytes);
    }
    function computeU(fileKey, idFirst, revision) {
      if (revision === 2)
        return rc4(fileKey, PASSWORD_PADDING);
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
    function bytesEqual(a, b, n) {
      const len = n === void 0 ? Math.min(a.length, b.length) : n;
      for (let i = 0;i < len; i++)
        if (a[i] !== b[i])
          return !1;
      return !0;
    }
    function validateUserPassword(pw, params) {
      const fk = computeFileKey(pw, params), u = computeU(fk, params.idFirst, params.revision);
      return (params.revision === 2 ? bytesEqual(u, params.U, 32) : bytesEqual(u, params.U, 16)) ? { ok: !0, fileKey: fk } : { ok: !1 };
    }
    function objectKey(fileKey, objNum, gen) {
      const buf = new Uint8Array(fileKey.length + 5);
      buf.set(fileKey, 0);
      buf[fileKey.length + 0] = objNum & 255;
      buf[fileKey.length + 1] = objNum >> 8 & 255;
      buf[fileKey.length + 2] = objNum >> 16 & 255;
      buf[fileKey.length + 3] = gen & 255;
      buf[fileKey.length + 4] = gen >> 8 & 255;
      return md5(buf).subarray(0, Math.min(fileKey.length + 5, 16));
    }
    function decryptString(fileKey, objNum, gen, bytes) {
      return rc4(objectKey(fileKey, objNum, gen), bytes);
    }
    function decryptStream(fileKey, objNum, gen, bytes) {
      return rc4(objectKey(fileKey, objNum, gen), bytes);
    }
    return {
      rc4,
      md5,
      padPassword,
      computeFileKey,
      computeU,
      validateUserPassword,
      objectKey,
      decryptString,
      decryptStream,
      PASSWORD_PADDING
    };
  } });
    __register({ name: "pdfCcittFaxDecoder", dependencies: ["pdfErrors"], factory: function(errors) {
    const { ParseError } = errors, WHITE_TERM = [
      "00110101",
      "000111",
      "0111",
      "1000",
      "1011",
      "1100",
      "1110",
      "1111",
      "10011",
      "10100",
      "00111",
      "01000",
      "001000",
      "000011",
      "110100",
      "110101",
      "101010",
      "101011",
      "0100111",
      "0001100",
      "0001000",
      "0010111",
      "0000011",
      "0000100",
      "0101000",
      "0101011",
      "0010011",
      "0100100",
      "0011000",
      "00000010",
      "00000011",
      "00011010",
      "00011011",
      "00010010",
      "00010011",
      "00010100",
      "00010101",
      "00010110",
      "00010111",
      "00101000",
      "00101001",
      "00101010",
      "00101011",
      "00101100",
      "00101101",
      "00000100",
      "00000101",
      "00001010",
      "00001011",
      "01010010",
      "01010011",
      "01010100",
      "01010101",
      "00100100",
      "00100101",
      "01011000",
      "01011001",
      "01011010",
      "01011011",
      "01001010",
      "01001011",
      "00110010",
      "00110011",
      "00110100"
    ], WHITE_MAKEUP = {
      64: "11011",
      128: "10010",
      192: "010111",
      256: "0110111",
      320: "00110110",
      384: "00110111",
      448: "01100100",
      512: "01100101",
      576: "01101000",
      640: "01100111",
      704: "011001100",
      768: "011001101",
      832: "011010010",
      896: "011010011",
      960: "011010100",
      1024: "011010101",
      1088: "011010110",
      1152: "011010111",
      1216: "011011000",
      1280: "011011001",
      1344: "011011010",
      1408: "011011011",
      1472: "010011000",
      1536: "010011001",
      1600: "010011010",
      1664: "011000",
      1728: "010011011"
    }, BLACK_TERM = [
      "0000110111",
      "010",
      "11",
      "10",
      "011",
      "0011",
      "0010",
      "00011",
      "000101",
      "000100",
      "0000100",
      "0000101",
      "0000111",
      "00000100",
      "00000111",
      "000011000",
      "0000010111",
      "0000011000",
      "0000001000",
      "00001100111",
      "00001101000",
      "00001101100",
      "00000110111",
      "00000101000",
      "00000010111",
      "00000011000",
      "000011001010",
      "000011001011",
      "000011001100",
      "000011001101",
      "000001101000",
      "000001101001",
      "000001101010",
      "000001101011",
      "000011010010",
      "000011010011",
      "000011010100",
      "000011010101",
      "000011010110",
      "000011010111",
      "000001101100",
      "000001101101",
      "000011011010",
      "000011011011",
      "000001010100",
      "000001010101",
      "000001010110",
      "000001010111",
      "000001100100",
      "000001100101",
      "000001010010",
      "000001010011",
      "000000100100",
      "000000110111",
      "000000111000",
      "000000100111",
      "000000101000",
      "000001011000",
      "000001011001",
      "000000101011",
      "000000101100",
      "000001011010",
      "000001100110",
      "000001100111"
    ], BLACK_MAKEUP = {
      64: "0000001111",
      128: "000011001000",
      192: "000011001001",
      256: "000001011011",
      320: "000000110011",
      384: "000000110100",
      448: "000000110101",
      512: "0000001101100",
      576: "0000001101101",
      640: "0000001001010",
      704: "0000001001011",
      768: "0000001001100",
      832: "0000001001101",
      896: "0000001110010",
      960: "0000001110011",
      1024: "0000001110100",
      1088: "0000001110101",
      1152: "0000001110110",
      1216: "0000001110111",
      1280: "0000001010010",
      1344: "0000001010011",
      1408: "0000001010100",
      1472: "0000001010101",
      1536: "0000001011010",
      1600: "0000001011011",
      1664: "0000001100100",
      1728: "0000001100101"
    }, COMMON_MAKEUP = {
      1792: "00000001000",
      1856: "00000001100",
      1920: "00000001101",
      1984: "000000010010",
      2048: "000000010011",
      2112: "000000010100",
      2176: "000000010101",
      2240: "000000010110",
      2304: "000000010111",
      2368: "000000011100",
      2432: "000000011101",
      2496: "000000011110",
      2560: "000000011111"
    }, MODE_CODES = {
      "0001": "P",
      "001": "H",
      "1": "V0",
      "011": "VR1",
      "010": "VL1",
      "000011": "VR2",
      "000010": "VL2",
      "0000011": "VR3",
      "0000010": "VL3",
      "0000001": "EXT2D"
    };
    function buildTermMap(arr, kind) {
      const m = new Map;
      for (let i = 0;i < arr.length; i++)
        m.set(arr[i], { kind, run: i, terminating: !0 });
      return m;
    }
    function buildMakeupMap(obj, kind) {
      const m = new Map;
      for (const k of Object.keys(obj))
        m.set(obj[k], { kind, run: k | 0, terminating: !1 });
      return m;
    }
    const WHITE_MAP = new Map([
      ...buildTermMap(WHITE_TERM, "W"),
      ...buildMakeupMap(WHITE_MAKEUP, "W"),
      ...buildMakeupMap(COMMON_MAKEUP, "W")
    ]), BLACK_MAP = new Map([
      ...buildTermMap(BLACK_TERM, "B"),
      ...buildMakeupMap(BLACK_MAKEUP, "B"),
      ...buildMakeupMap(COMMON_MAKEUP, "B")
    ]), MAX_RUN_BITS = 13;
    function makeBitReader(bytes) {
      let bytePos = 0, bitPos = 0;
      return {
        readBit() {
          if (bytePos >= bytes.length)
            return -1;
          const bit = bytes[bytePos] >>> 7 - bitPos & 1;
          bitPos++;
          if (bitPos === 8) {
            bitPos = 0;
            bytePos++;
          }
          return bit;
        },
        alignToByte() {
          if (bitPos !== 0) {
            bitPos = 0;
            bytePos++;
          }
        },
        eof() {
          return bytePos >= bytes.length;
        },
        pos() {
          return { bytePos, bitPos };
        },
        seek(p) {
          bytePos = p.bytePos;
          bitPos = p.bitPos;
        }
      };
    }
    function readRun(reader, mapFor) {
      let total = 0;
      for (;; ) {
        let code = "", entry = null;
        for (let i = 0;i < MAX_RUN_BITS; i++) {
          const b = reader.readBit();
          if (b < 0)
            return -1;
          code += b;
          entry = mapFor.get(code);
          if (entry)
            break;
        }
        if (!entry)
          throw new ParseError("pdf/ccitt/bad-runcode", "unrecognised CCITT run-length code", { context: { bits: code } });
        total += entry.run;
        if (entry.terminating)
          return total;
      }
    }
    function readMode(reader) {
      let code = "";
      for (let i = 0;i < 7; i++) {
        const b = reader.readBit();
        if (b < 0)
          return null;
        code += b;
        const m = MODE_CODES[code];
        if (m)
          return m;
      }
      throw new ParseError("pdf/ccitt/bad-2d-mode", "unrecognised CCITT 2D mode code", { context: { bits: code } });
    }
    function readEolMaybe(reader) {
      const save = reader.pos();
      let zeros = 0;
      for (let i = 0;i < 24; i++) {
        const b = reader.readBit();
        if (b < 0) {
          reader.seek(save);
          return !1;
        }
        if (b === 0) {
          zeros++;
          continue;
        }
        if (b === 1 && zeros >= 11)
          return !0;
        reader.seek(save);
        return !1;
      }
      reader.seek(save);
      return !1;
    }
    function peekEols(reader, n) {
      const save = reader.pos();
      let ok = !0;
      for (let k = 0;k < n; k++)
        if (!readEolMaybe(reader)) {
          ok = !1;
          break;
        }
      reader.seek(save);
      return ok;
    }
    function skipToEol(reader) {
      let zeros = 0;
      for (;; ) {
        const b = reader.readBit();
        if (b < 0)
          return !1;
        if (b === 0) {
          zeros++;
          continue;
        }
        if (b === 1 && zeros >= 11)
          return !0;
        zeros = 0;
      }
    }
    function decode1DLine(reader, columns) {
      const line = new Uint8Array(columns);
      let pos = 0, colour = 0;
      while (pos < columns) {
        const run = readRun(reader, colour === 0 ? WHITE_MAP : BLACK_MAP);
        if (run < 0)
          return null;
        const end = Math.min(pos + run, columns);
        if (colour === 1)
          for (let i = pos;i < end; i++)
            line[i] = 1;
        pos = end;
        colour ^= 1;
      }
      return line;
    }
    function decode2DLine(reader, refLine, columns) {
      const line = new Uint8Array(columns);
      let a0 = -1, a0Colour = 0;
      while (a0 < columns) {
        const b1 = findB1(refLine, a0, a0Colour, columns), b2 = findNextChange(refLine, b1, columns), mode = readMode(reader);
        if (mode === null)
          return null;
        if (mode === "P") {
          const start = a0 < 0 ? 0 : a0;
          paint(line, start, b2, a0Colour);
          a0 = b2;
        } else if (mode === "H") {
          const r1 = readRun(reader, a0Colour === 0 ? WHITE_MAP : BLACK_MAP), r2 = readRun(reader, a0Colour === 0 ? BLACK_MAP : WHITE_MAP);
          if (r1 < 0 || r2 < 0)
            return null;
          const start = a0 < 0 ? 0 : a0;
          paint(line, start, Math.min(start + r1, columns), a0Colour);
          paint(line, Math.min(start + r1, columns), Math.min(start + r1 + r2, columns), a0Colour ^ 1);
          a0 = start + r1 + r2;
        } else {
          let offset;
          if (mode === "V0")
            offset = 0;
          else if (mode === "VR1")
            offset = 1;
          else if (mode === "VR2")
            offset = 2;
          else if (mode === "VR3")
            offset = 3;
          else if (mode === "VL1")
            offset = -1;
          else if (mode === "VL2")
            offset = -2;
          else if (mode === "VL3")
            offset = -3;
          else
            throw new ParseError("pdf/ccitt/unsupported-2d-mode", "unsupported 2D mode", { context: { mode } });
          const a1 = b1 + offset, start = a0 < 0 ? 0 : a0;
          paint(line, start, Math.min(Math.max(a1, 0), columns), a0Colour);
          a0 = a1;
          a0Colour ^= 1;
        }
      }
      return line;
    }
    function paint(line, from, to, colour) {
      if (colour === 0)
        return;
      const a = Math.max(0, from), b = Math.min(line.length, to);
      for (let i = a;i < b; i++)
        line[i] = 1;
    }
    function colourAt(refLine, pos) {
      if (pos < 0 || pos >= refLine.length)
        return 0;
      return refLine[pos];
    }
    function findB1(refLine, a0, a0Colour, columns) {
      let start = a0 < 0 ? 0 : a0 + 1, prev = a0 < 0 ? 0 : colourAt(refLine, a0);
      for (let i = start;i < columns; i++) {
        const c = refLine[i];
        if (c !== prev) {
          if (c !== a0Colour)
            return i;
          prev = c;
        }
      }
      return columns;
    }
    function findNextChange(refLine, from, columns) {
      if (from >= columns)
        return columns;
      const start = Math.max(0, from), cur = start < columns ? refLine[start] : 0;
      for (let i = start + 1;i < columns; i++)
        if (refLine[i] !== cur)
          return i;
      return columns;
    }
    function packBits(line, polarityInvert) {
      const n = line.length, out = new Uint8Array(n + 7 >>> 3);
      for (let i = 0;i < n; i++)
        if (polarityInvert ? line[i] : line[i] ^ 1)
          out[i >>> 3] |= 1 << 7 - (i & 7);
      return out;
    }
    function decode(bytes, parms) {
      if (!(bytes instanceof Uint8Array))
        throw new ParseError("pdf/ccitt/bad-input", "CCITT input must be Uint8Array");
      const columns = parms.Columns | 0;
      if (columns <= 0 || columns > 65535)
        throw new ParseError("pdf/ccitt/bad-columns", "CCITT /Columns out of range", { context: { columns } });
      const rows = parms.Rows | 0, K = parms.K | 0, reader = makeBitReader(bytes), lines = [];
      let refLine = new Uint8Array(columns);
      function expectEolMaybe() {
        if (parms.EndOfLine) {
          if (!readEolMaybe(reader)) {
            if (!skipToEol(reader))
              return !1;
          }
          return !0;
        }
        readEolMaybe(reader);
        return !0;
      }
      function alignMaybe() {
        if (parms.EncodedByteAlign)
          reader.alignToByte();
      }
      let rowIndex = 0, kPhase = 0;
      try {
        while (rows === 0 || rowIndex < rows) {
          alignMaybe();
          if (K < 0) {
            if (peekEols(reader, 2))
              break;
          } else if (K > 0 || parms.EndOfLine) {
            const sv = reader.pos();
            if (readEolMaybe(reader)) {
              if (K > 0) {
                if (reader.readBit() < 0) {
                  reader.seek(sv);
                  break;
                }
              }
              const isRtc = readEolMaybe(reader);
              reader.seek(sv);
              if (isRtc)
                break;
            } else
              reader.seek(sv);
          }
          let is2D;
          if (K < 0)
            is2D = !0;
          else if (K === 0) {
            is2D = !1;
            if (parms.EndOfLine) {
              if (!expectEolMaybe())
                break;
            } else
              readEolMaybe(reader);
          } else if (kPhase === 0)
            if (parms.EndOfLine) {
              if (!expectEolMaybe())
                break;
              const tag = reader.readBit();
              if (tag < 0)
                break;
              is2D = tag === 0;
            } else {
              readEolMaybe(reader);
              const tag = reader.readBit();
              if (tag < 0)
                break;
              is2D = tag === 0;
            }
          else if (parms.EndOfLine) {
            if (!expectEolMaybe())
              break;
            const tag = reader.readBit();
            if (tag < 0)
              break;
            is2D = tag === 0;
          } else {
            readEolMaybe(reader);
            const tag = reader.readBit();
            if (tag < 0)
              break;
            is2D = tag === 0;
          }
          let line;
          if (is2D)
            line = decode2DLine(reader, refLine, columns);
          else
            line = decode1DLine(reader, columns);
          if (line === null) {
            if (rows === 0)
              break;
            if ((parms.DamagedRowsBeforeError | 0) > 0)
              line = new Uint8Array(columns);
            else
              throw new ParseError("pdf/ccitt/truncated", "CCITT stream truncated mid-line", { context: { row: rowIndex } });
          }
          lines.push(line);
          refLine = line;
          rowIndex++;
          if (K > 0)
            kPhase = (kPhase + 1) % K;
          if (reader.eof())
            break;
        }
      } catch (e) {
        if (e instanceof ParseError)
          throw e;
        throw new ParseError("pdf/ccitt/decode-failed", "CCITT decoder error: " + e.message, { cause: e });
      }
      const polarityInvert = !!parms.BlackIs1, rowBytes = columns + 7 >>> 3, out = new Uint8Array(rowBytes * lines.length);
      for (let r = 0;r < lines.length; r++) {
        const packed = packBits(lines[r], polarityInvert);
        out.set(packed, r * rowBytes);
      }
      return out;
    }
    function makeBitWriter() {
      const bytes = [];
      let cur = 0, n = 0;
      function writeBit(b) {
        cur = cur << 1 | b & 1;
        n++;
        if (n === 8) {
          bytes.push(cur & 255);
          cur = 0;
          n = 0;
        }
      }
      function writeBits(s) {
        for (let i = 0;i < s.length; i++)
          writeBit(s.charCodeAt(i) - 48);
      }
      function alignToByte() {
        while (n !== 0)
          writeBit(0);
      }
      function flush() {
        if (n > 0) {
          cur <<= 8 - n;
          bytes.push(cur & 255);
          cur = 0;
          n = 0;
        }
        return new Uint8Array(bytes);
      }
      function bitCount() {
        return bytes.length * 8 + n;
      }
      return { writeBit, writeBits, alignToByte, flush, bitCount };
    }
    const WHITE_MAKEUP_KEYS = Object.keys(WHITE_MAKEUP).map((k) => k | 0).sort((a, b) => b - a), BLACK_MAKEUP_KEYS = Object.keys(BLACK_MAKEUP).map((k) => k | 0).sort((a, b) => b - a), COMMON_MAKEUP_KEYS = Object.keys(COMMON_MAKEUP).map((k) => k | 0).sort((a, b) => b - a), COMMON_MAKEUP_MAX = COMMON_MAKEUP_KEYS[0];
    function codeForRun(run, colour) {
      const term = colour === 0 ? WHITE_TERM : BLACK_TERM, make = colour === 0 ? WHITE_MAKEUP : BLACK_MAKEUP, makeKeys = colour === 0 ? WHITE_MAKEUP_KEYS : BLACK_MAKEUP_KEYS;
      let bits = "";
      while (run >= COMMON_MAKEUP_MAX + 64) {
        bits += COMMON_MAKEUP[COMMON_MAKEUP_MAX];
        run -= COMMON_MAKEUP_MAX;
      }
      if (run >= 1792)
        for (let i = 0;i < COMMON_MAKEUP_KEYS.length; i++) {
          const v = COMMON_MAKEUP_KEYS[i];
          if (v <= run) {
            bits += COMMON_MAKEUP[v];
            run -= v;
            break;
          }
        }
      if (run >= 64)
        for (let i = 0;i < makeKeys.length; i++) {
          const v = makeKeys[i];
          if (v <= run) {
            bits += make[v];
            run -= v;
            break;
          }
        }
      bits += term[run];
      return bits;
    }
    function encode1DLine(line, columns, writer) {
      let pos = 0, colour = 0;
      while (pos < columns) {
        let run = 0;
        while (pos + run < columns && (line[pos + run] | 0) === colour)
          run++;
        writer.writeBits(codeForRun(run, colour));
        pos += run;
        colour ^= 1;
      }
    }
    function encode2DLine(line, refLine, columns, writer) {
      let a0 = -1, a0Colour = 0;
      while (a0 < columns) {
        const a1 = findChangeFrom(line, a0, a0Colour, columns), b1 = findB1(refLine, a0, a0Colour, columns), b2 = findNextChange(refLine, b1, columns);
        if (b2 < a1) {
          writer.writeBits("0001");
          a0 = b2;
        } else {
          const diff = a1 - b1;
          if (diff >= -3 && diff <= 3) {
            if (diff === 0)
              writer.writeBits("1");
            else if (diff === 1)
              writer.writeBits("011");
            else if (diff === 2)
              writer.writeBits("000011");
            else if (diff === 3)
              writer.writeBits("0000011");
            else if (diff === -1)
              writer.writeBits("010");
            else if (diff === -2)
              writer.writeBits("000010");
            else if (diff === -3)
              writer.writeBits("0000010");
            a0 = a1;
            a0Colour ^= 1;
          } else {
            const a2 = findChangeFrom(line, a1, a0Colour ^ 1, columns), r1 = a1 - (a0 < 0 ? 0 : a0), r2 = a2 - a1;
            writer.writeBits("001");
            writer.writeBits(codeForRun(r1, a0Colour));
            writer.writeBits(codeForRun(r2, a0Colour ^ 1));
            a0 = a2;
          }
        }
      }
    }
    function findChangeFrom(line, a0, a0Colour, columns) {
      const start = a0 < 0 ? 0 : a0 + 1;
      let prev = a0 < 0 ? 0 : line[a0] | 0;
      for (let i = start;i < columns; i++) {
        const c = line[i] | 0;
        if (c !== prev) {
          if (c !== a0Colour)
            return i;
          prev = c;
        }
      }
      return columns;
    }
    function encode(lines, parms) {
      const columns = (parms && parms.Columns) | 0 || 1728, K = parms && parms.K != null ? parms.K | 0 : 0, endOfLine = !!(parms && parms.EndOfLine), byteAlign = !!(parms && parms.EncodedByteAlign), endOfBlock = !parms || parms.EndOfBlock !== !1, writeEol = endOfLine || K > 0, writer = makeBitWriter();
      let refLine = new Uint8Array(columns);
      for (let r = 0;r < lines.length; r++) {
        const line = lines[r];
        if (byteAlign)
          writer.alignToByte();
        if (writeEol) {
          writer.writeBits("000000000001");
          if (K > 0) {
            const is1D = r % K === 0;
            writer.writeBit(is1D ? 1 : 0);
            if (is1D)
              encode1DLine(line, columns, writer);
            else
              encode2DLine(line, refLine, columns, writer);
          } else if (K === 0)
            encode1DLine(line, columns, writer);
          else
            encode2DLine(line, refLine, columns, writer);
        } else if (K < 0)
          encode2DLine(line, refLine, columns, writer);
        else
          encode1DLine(line, columns, writer);
        refLine = line;
      }
      if (endOfBlock) {
        if (K < 0) {
          if (byteAlign)
            writer.alignToByte();
          writer.writeBits("000000000001");
          writer.writeBits("000000000001");
        } else if (writeEol) {
          if (byteAlign)
            writer.alignToByte();
          for (let i = 0;i < 6; i++) {
            writer.writeBits("000000000001");
            if (K > 0)
              writer.writeBit(1);
          }
        }
      }
      return writer.flush();
    }
    return {
      decode,
      encode,
      _internals: {
        WHITE_MAP,
        BLACK_MAP,
        MODE_CODES,
        EOL_BITS: "000000000001",
        codeForRun,
        encode1DLine,
        encode2DLine,
        decode1DLine,
        decode2DLine,
        makeBitReader,
        makeBitWriter,
        findB1,
        findNextChange,
        findChangeFrom
      }
    };
  } });
    __register({ name: "pdfLegacyDeprecatedFilters", dependencies: ["pdfErrors","lzw","pdfCcittFaxDecoder"], factory: function(errors, lzwImpl, ccittImpl) {
    const { ParseError } = errors, CCITT_KEYS = new Set([
      "K",
      "EndOfLine",
      "EncodedByteAlign",
      "Columns",
      "Rows",
      "EndOfBlock",
      "BlackIs1",
      "DamagedRowsBeforeError"
    ]);
    if (!lzwImpl || typeof lzwImpl.decode !== "function" || typeof lzwImpl.encode !== "function")
      throw new ParseError("pdf/filters/missing-lzw", "legacy-deprecated-filters requires the @awacloud/fw lzw factory output");
    if (!ccittImpl || typeof ccittImpl.decode !== "function")
      throw new ParseError("pdf/filters/missing-ccitt", "legacy-deprecated-filters requires the pdfCcittFaxDecoder factory output");
    function asBytes(x) {
      if (x instanceof Uint8Array)
        return x;
      throw new ParseError("pdf/filters/bad-input", "filter input must be Uint8Array", { context: { type: typeof x } });
    }
    function lzwDecode(bytes, decodeParms) {
      asBytes(bytes);
      const earlyChange = decodeParms && decodeParms.EarlyChange != null ? decodeParms.EarlyChange : 1;
      if (earlyChange !== 0 && earlyChange !== 1)
        throw new ParseError("pdf/lzw/bad-earlychange", "/EarlyChange must be 0 or 1", { context: { value: earlyChange } });
      try {
        return lzwImpl.decode(bytes, {
          bigEndian: !0,
          minCodeBits: 8,
          maxBits: 12,
          useClearEnd: !0
        });
      } catch (cause) {
        throw new ParseError("pdf/lzw/decode-failed", "LZWDecode failed: " + cause.message, { cause });
      }
    }
    function lzwEncode(bytes) {
      asBytes(bytes);
      try {
        return lzwImpl.encode(bytes, {
          bigEndian: !0,
          minCodeBits: 8,
          maxBits: 12,
          useClearEnd: !0
        });
      } catch (cause) {
        throw new ParseError("pdf/lzw/encode-failed", "LZWEncode failed: " + cause.message, { cause });
      }
    }
    function validateCcittParms(parms) {
      if (parms == null)
        return { K: 0 };
      if (typeof parms !== "object")
        throw new ParseError("pdf/ccitt/bad-parms", "CCITT DecodeParms must be an object");
      for (const k of Object.keys(parms))
        if (!CCITT_KEYS.has(k))
          throw new ParseError("pdf/ccitt/unknown-parm", "unknown CCITT DecodeParm", { context: { key: k } });
      return {
        K: parms.K != null ? parms.K | 0 : 0,
        EndOfLine: !!parms.EndOfLine,
        EncodedByteAlign: !!parms.EncodedByteAlign,
        Columns: parms.Columns != null ? parms.Columns | 0 : 1728,
        Rows: parms.Rows != null ? parms.Rows | 0 : 0,
        EndOfBlock: parms.EndOfBlock !== !1,
        BlackIs1: !!parms.BlackIs1,
        DamagedRowsBeforeError: parms.DamagedRowsBeforeError | 0
      };
    }
    function ccittFaxDecode(bytes, decodeParms) {
      asBytes(bytes);
      const parms = validateCcittParms(decodeParms);
      return ccittImpl.decode(bytes, parms);
    }
    function dctDecode(bytes) {
      asBytes(bytes);
      if (bytes.length >= 2 && (bytes[0] !== 255 || bytes[1] !== 216))
        throw new ParseError("pdf/dct/bad-soi", "DCTDecode input missing JPEG SOI marker");
      return bytes;
    }
    function jpxDecode(bytes) {
      asBytes(bytes);
      if (bytes.length >= 2) {
        if (bytes[0] === 255 && bytes[1] === 79)
          return bytes;
        if (bytes.length >= 12 && bytes[4] === 106 && bytes[5] === 80 && bytes[6] === 32 && bytes[7] === 32)
          return bytes;
      }
      throw new ParseError("pdf/jpx/bad-signature", "JPXDecode input does not look like JPEG 2000");
    }
    return {
      lzwDecode,
      lzwEncode,
      validateCcittParms,
      ccittFaxDecode,
      dctDecode,
      jpxDecode,
      CCITT_KEYS
    };
  } });
    __register({ name: "pdfLegacyDeprecatedAnnots", dependencies: ["pdfErrors"], factory: function(errors) {
    const { ParseError } = errors, SOUND_MODES = new Set(["Mono", "Stereo"]), MOVIE_OP_MODES = new Set(["Once", "Open", "Repeat", "Palindrome"]);
    function isDict(v) {
      return v && v.type === "dict";
    }
    function isName(v) {
      return v && v.type === "name";
    }
    function isStr(v) {
      return v && v.type === "string";
    }
    function isStream(v) {
      return v && v.type === "stream";
    }
    function isBool(v) {
      return v && v.type === "bool";
    }
    function isNum(v) {
      return v && (v.type === "int" || v.type === "real");
    }
    function expectSubtype(dict, expected) {
      if (!isDict(dict))
        throw new ParseError("pdf/legacy-annot/not-dict", "annotation must be a dictionary", { context: { expected } });
      const st = dict.entries.Subtype;
      if (!isName(st) || st.value !== expected)
        throw new ParseError("pdf/legacy-annot/bad-subtype", `/Subtype must be /${expected}`, { context: { actual: st && st.value, expected } });
    }
    function typeSoundAnnot(dict) {
      expectSubtype(dict, "Sound");
      const e = dict.entries, out = { subtype: "Sound", raw: dict, _extras: {} };
      if (!e.Sound)
        throw new ParseError("pdf/legacy-annot/sound-missing", "Sound annot requires /Sound stream");
      if (!isStream(e.Sound) && e.Sound.type !== "ref")
        throw new ParseError("pdf/legacy-annot/sound-bad-stream", "/Sound must be a stream or ref", { context: { type: e.Sound.type } });
      out.sound = e.Sound;
      if (e.Name) {
        if (!isName(e.Name))
          throw new ParseError("pdf/legacy-annot/sound-bad-name", "/Name must be a name");
        out.iconName = e.Name.value;
      }
      const KNOWN = new Set(["Type", "Subtype", "Sound", "Name"]);
      for (const k of Object.keys(e))
        if (!KNOWN.has(k))
          out._extras[k] = e[k];
      return out;
    }
    function typeSoundStream(stream) {
      if (!isStream(stream))
        throw new ParseError("pdf/legacy-annot/sound-stream", "sound payload must be a stream");
      const e = stream.dict ? stream.dict.entries : {}, out = { raw: stream, _extras: {} };
      if (e.R) {
        if (!isNum(e.R))
          throw new ParseError("pdf/legacy-annot/sound-bad-R", "/R must be numeric");
        out.samplingRate = e.R.value;
      }
      if (e.C) {
        if (!isNum(e.C))
          throw new ParseError("pdf/legacy-annot/sound-bad-C", "/C must be numeric");
        out.channels = e.C.value;
      }
      if (e.B) {
        if (!isNum(e.B))
          throw new ParseError("pdf/legacy-annot/sound-bad-B", "/B must be numeric");
        out.bitsPerSample = e.B.value;
      }
      if (e.E) {
        if (!isName(e.E))
          throw new ParseError("pdf/legacy-annot/sound-bad-E", "/E must be a name");
        out.encoding = e.E.value;
      }
      if (e.CO) {
        if (!isName(e.CO))
          throw new ParseError("pdf/legacy-annot/sound-bad-CO", "/CO must be a name");
        out.compression = e.CO.value;
      }
      if (e.Mode) {
        if (!isName(e.Mode) || !SOUND_MODES.has(e.Mode.value))
          throw new ParseError("pdf/legacy-annot/sound-bad-mode", "/Mode must be Mono or Stereo");
        out.mode = e.Mode.value;
      }
      const KNOWN = new Set(["Type", "R", "C", "B", "E", "CO", "Mode", "Length", "Filter", "DecodeParms"]);
      for (const k of Object.keys(e))
        if (!KNOWN.has(k))
          out._extras[k] = e[k];
      return out;
    }
    function typeMovieAnnot(dict) {
      expectSubtype(dict, "Movie");
      const e = dict.entries, out = { subtype: "Movie", raw: dict, _extras: {} };
      if (!e.Movie)
        throw new ParseError("pdf/legacy-annot/movie-missing", "Movie annot requires /Movie dict");
      if (!isDict(e.Movie))
        throw new ParseError("pdf/legacy-annot/movie-bad", "/Movie must be a dict");
      out.movie = e.Movie;
      if (e.T) {
        if (!isStr(e.T))
          throw new ParseError("pdf/legacy-annot/movie-bad-T", "/T must be a text string");
        out.title = e.T.value;
      }
      if (e.A) {
        if (!isBool(e.A) && !isDict(e.A))
          throw new ParseError("pdf/legacy-annot/movie-bad-A", "/A must be bool or dict");
        if (isBool(e.A))
          out.activation = { auto: e.A.value };
        else {
          const ae = e.A.entries, act = { raw: e.A };
          if (ae.Mode && isName(ae.Mode)) {
            if (!MOVIE_OP_MODES.has(ae.Mode.value))
              throw new ParseError("pdf/legacy-annot/movie-bad-mode", "/Mode must be Once, Open, Repeat or Palindrome");
            act.mode = ae.Mode.value;
          }
          out.activation = act;
        }
      }
      const KNOWN = new Set(["Type", "Subtype", "Movie", "T", "A"]);
      for (const k of Object.keys(e))
        if (!KNOWN.has(k))
          out._extras[k] = e[k];
      return out;
    }
    function typeScreenAnnot(dict) {
      expectSubtype(dict, "Screen");
      const e = dict.entries, out = { subtype: "Screen", raw: dict, _extras: {} };
      if (e.T) {
        if (!isStr(e.T))
          throw new ParseError("pdf/legacy-annot/screen-bad-T", "/T must be a string");
        out.title = e.T.value;
      }
      if (e.MK) {
        if (!isDict(e.MK))
          throw new ParseError("pdf/legacy-annot/screen-bad-MK", "/MK must be a dict");
        out.mk = e.MK;
      }
      if (e.A) {
        if (!isDict(e.A))
          throw new ParseError("pdf/legacy-annot/screen-bad-A", "/A must be an action dict");
        out.action = e.A;
      }
      if (e.AA) {
        if (!isDict(e.AA))
          throw new ParseError("pdf/legacy-annot/screen-bad-AA", "/AA must be a dict");
        out.additionalActions = e.AA;
      }
      if (e.P) {
        if (e.P.type !== "ref" && !isDict(e.P))
          throw new ParseError("pdf/legacy-annot/screen-bad-P", "/P must be a page ref or dict");
        out.page = e.P;
      }
      const KNOWN = new Set(["Type", "Subtype", "T", "MK", "A", "AA", "P", "Rect", "Contents"]);
      for (const k of Object.keys(e))
        if (!KNOWN.has(k))
          out._extras[k] = e[k];
      return out;
    }
    return {
      typeSoundAnnot,
      typeSoundStream,
      typeMovieAnnot,
      typeScreenAnnot,
      SOUND_MODES,
      MOVIE_OP_MODES
    };
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
    __core.use({ name: "pdfLegacyXfaRead", register() { return { ["pdfLegacyXfaRead"]: __resolve("pdfLegacyXfaRead") }; } });
    __core.use({ name: "pdfLegacyRc4Read", register() { return { ["pdfLegacyRc4Read"]: __resolve("pdfLegacyRc4Read") }; } });
    __core.use({ name: "pdfLegacyDeprecatedFilters", register() { return { ["pdfLegacyDeprecatedFilters"]: __resolve("pdfLegacyDeprecatedFilters") }; } });
    __core.use({ name: "pdfLegacyDeprecatedAnnots", register() { return { ["pdfLegacyDeprecatedAnnots"]: __resolve("pdfLegacyDeprecatedAnnots") }; } });
    return __core;
    }
};
