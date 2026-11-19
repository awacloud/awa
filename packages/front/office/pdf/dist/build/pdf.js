/*!
 * Copyright (c) 2026 AwaCloud SAS
 * Author: Matthieu Bouilloux
 * SPDX-License-Identifier: AGPL-3.0-only
 * Dual-licensed; see the NOTICE file for licensing and any additional terms.
 */
/* GENERATED — do not edit. Source: packages/front/office/pdf/tools/generate-bundles.mjs */

/**
 * @fileoverview `@awacloud/pdf/bundles/prebuilt/pdf-package` — pre-built single-factory bundle.
 *
 * Variant **package** : declares the 26 fw modules as dependencies and inlines every
 * pdf-local factory transitively reachable from `pdf` .
 *
 * @module pdf/bundles/prebuilt/pdf-package
 */

export const pdfPackage = {
    name: "pdfPackage",
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

    const __core = __resolve("pdf");
    return __core;
    }
};
