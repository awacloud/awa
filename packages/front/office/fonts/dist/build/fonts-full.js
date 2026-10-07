/*!
 * Copyright (c) 2026 AwaCloud SAS
 * Author: Matthieu Bouilloux
 * SPDX-License-Identifier: AGPL-3.0-only
 * Dual-licensed; see the NOTICE file for licensing and any additional terms.
 */
/* GENERATED — do not edit. Source: packages/front/office/fonts/tools/generate-bundles.mjs */

/**
 * @fileoverview `@awacloud/fonts/bundles/prebuilt/fonts-full-package` — pre-built single-factory bundle.
 *
 * Variant **package** : declares the 11 fw modules as dependencies and inlines every
 * fonts-local factory transitively reachable from `fonts` plus 8 extras.
 *
 * @module fonts/bundles/prebuilt/fonts-full-package
 */

export const fontsFullPackage = {
    name: "fontsFullPackage",
    dependencies: ["binaryReader","binaryWriter","bitstream","huffman","lz77","deflate","adler32","zlib","brotliDict","brotliDictWords","brotli"],
    factory(binaryReader, binaryWriter, bitstream, huffman, lz77, deflate, adler32, zlib, brotliDict, brotliDictWords, brotli) {
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
    __cache["binaryReader"] = binaryReader;
    __cache["binaryWriter"] = binaryWriter;
    __cache["bitstream"] = bitstream;
    __cache["huffman"] = huffman;
    __cache["lz77"] = lz77;
    __cache["deflate"] = deflate;
    __cache["adler32"] = adler32;
    __cache["zlib"] = zlib;
    __cache["brotliDict"] = brotliDict;
    __cache["brotliDictWords"] = brotliDictWords;
    __cache["brotli"] = brotli;

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
    __register({ name: "ttHintingGs", dependencies: [], factory: function() {
    class GraphicsState {
      constructor() {
        this.projection_vector = [16384, 0];
        this.freedom_vector = [16384, 0];
        this.dual_proj_vector = [16384, 0];
        this.rp0 = 0;
        this.rp1 = 0;
        this.rp2 = 0;
        this.gep0 = 1;
        this.gep1 = 1;
        this.gep2 = 1;
        this.zp0 = 1;
        this.zp1 = 1;
        this.zp2 = 1;
        this.control_value_cut_in = 68;
        this.single_width_value = 0;
        this.single_width_cut_in = 0;
        this.minimum_distance = 64;
        this.loop = 1;
        this.scan_control_flag = 0;
        this.scan_type = 0;
        this.instruct_control = 0;
        this.delta_base = 9;
        this.delta_shift = 3;
        this.round_state = 1;
        this.auto_flip = !0;
      }
    }

    class Zone {
      constructor(n) {
        const k = n || 0;
        this.x = new Float64Array(k);
        this.y = new Float64Array(k);
        this.origX = new Float64Array(k);
        this.origY = new Float64Array(k);
        this.onCurve = new Uint8Array(k);
        this.touched = new Uint8Array(k);
      }
      get length() {
        return this.x.length;
      }
    }
    return { F26DOT6: 64, F2DOT14_ONE: 16384, MAX_STEPS: 1e6, MAX_STACK: 1e4, GraphicsState, Zone };
  } });
    __register({ name: "ttHintingOpCatalog", dependencies: [], factory: function() {
    function buildOpcodeTable() {
      const t = Object.create(null), add = (c, name, extra) => {
        t[c] = Object.assign({ code: c, name }, extra || {});
      };
      add(0, "SVTCA[0]");
      add(1, "SVTCA[1]");
      add(2, "SPVTCA[0]");
      add(3, "SPVTCA[1]");
      add(4, "SFVTCA[0]");
      add(5, "SFVTCA[1]");
      add(6, "SPVTL[0]");
      add(7, "SPVTL[1]");
      add(8, "SFVTL[0]");
      add(9, "SFVTL[1]");
      add(10, "SPVFS");
      add(11, "SFVFS");
      add(12, "GPV");
      add(13, "GFV");
      add(14, "SFVTPV");
      add(15, "ISECT");
      add(16, "SRP0");
      add(17, "SRP1");
      add(18, "SRP2");
      add(19, "SZP0");
      add(20, "SZP1");
      add(21, "SZP2");
      add(22, "SZPS");
      add(23, "SLOOP");
      add(24, "RTG");
      add(25, "RTHG");
      add(26, "SMD");
      add(27, "ELSE");
      add(28, "JMPR");
      add(29, "SCVTCI");
      add(30, "SSWCI");
      add(31, "SSW");
      add(32, "DUP");
      add(33, "POP");
      add(34, "CLEAR");
      add(35, "SWAP");
      add(36, "DEPTH");
      add(37, "CINDEX");
      add(38, "MINDEX");
      add(39, "ALIGNPTS");
      add(41, "UTP");
      add(42, "LOOPCALL");
      add(43, "CALL");
      add(44, "FDEF");
      add(45, "ENDF");
      add(46, "MDAP[0]");
      add(47, "MDAP[1]");
      add(48, "IUP[0]");
      add(49, "IUP[1]");
      add(50, "SHP[0]");
      add(51, "SHP[1]");
      add(52, "SHC[0]");
      add(53, "SHC[1]");
      add(54, "SHZ[0]");
      add(55, "SHZ[1]");
      add(56, "SHPIX");
      add(57, "IP");
      add(58, "MSIRP[0]");
      add(59, "MSIRP[1]");
      add(60, "ALIGNRP");
      add(61, "RTDG");
      add(62, "MIAP[0]");
      add(63, "MIAP[1]");
      add(64, "NPUSHB");
      add(65, "NPUSHW");
      add(66, "WS");
      add(67, "RS");
      add(68, "WCVTP");
      add(69, "RCVT");
      add(70, "GC[0]");
      add(71, "GC[1]");
      add(72, "SCFS");
      add(73, "MD[0]");
      add(74, "MD[1]");
      add(75, "MPPEM");
      add(76, "MPS");
      add(77, "FLIPON");
      add(78, "FLIPOFF");
      add(79, "DEBUG");
      add(80, "LT");
      add(81, "LTEQ");
      add(82, "GT");
      add(83, "GTEQ");
      add(84, "EQ");
      add(85, "NEQ");
      add(86, "ODD");
      add(87, "EVEN");
      add(88, "IF");
      add(89, "EIF");
      add(90, "AND");
      add(91, "OR");
      add(92, "NOT");
      add(93, "DELTAP1");
      add(94, "SDB");
      add(95, "SDS");
      add(96, "ADD");
      add(97, "SUB");
      add(98, "DIV");
      add(99, "MUL");
      add(100, "ABS");
      add(101, "NEG");
      add(102, "FLOOR");
      add(103, "CEILING");
      add(104, "ROUND[00]");
      add(105, "ROUND[01]");
      add(106, "ROUND[10]");
      add(107, "ROUND[11]");
      add(108, "NROUND[00]");
      add(109, "NROUND[01]");
      add(110, "NROUND[10]");
      add(111, "NROUND[11]");
      add(112, "WCVTF");
      add(113, "DELTAP2");
      add(114, "DELTAP3");
      add(115, "DELTAC1");
      add(116, "DELTAC2");
      add(117, "DELTAC3");
      add(118, "SROUND");
      add(119, "S45ROUND");
      add(120, "JROT");
      add(121, "JROF");
      add(122, "ROFF");
      add(124, "RUTG");
      add(125, "RDTG");
      add(126, "SANGW");
      add(127, "AA");
      add(128, "FLIPPT");
      add(129, "FLIPRGON");
      add(130, "FLIPRGOFF");
      add(133, "SCANCTRL");
      add(134, "SDPVTL[0]");
      add(135, "SDPVTL[1]");
      add(136, "GETINFO");
      add(137, "IDEF");
      add(138, "ROLL");
      add(139, "MAX");
      add(140, "MIN");
      add(141, "SCANTYPE");
      add(142, "INSTCTRL");
      add(145, "GETVARIATION");
      for (let i = 0;i < 8; i++)
        add(176 + i, "PUSHB[" + i + "]", { args: i + 1 });
      for (let i = 0;i < 8; i++)
        add(184 + i, "PUSHW[" + i + "]", { args: 2 * (i + 1) });
      for (let i = 192;i <= 223; i++)
        add(i, "MDRP[" + (i & 31).toString(16) + "]");
      for (let i = 224;i <= 255; i++)
        add(i, "MIRP[" + (i & 31).toString(16) + "]");
      return t;
    }
    const RM05_OPCODES = buildOpcodeTable(), IMPLEMENTED = new Set([
      27,
      28,
      32,
      33,
      34,
      35,
      36,
      37,
      38,
      64,
      65,
      66,
      67,
      68,
      69,
      70,
      71,
      75,
      76,
      80,
      81,
      82,
      83,
      84,
      85,
      88,
      89,
      90,
      91,
      92,
      96,
      97,
      98,
      99,
      100,
      101,
      102,
      103,
      104,
      105,
      106,
      107,
      112,
      120,
      121,
      138,
      139,
      140,
      12,
      13,
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
      10,
      11,
      14,
      16,
      17,
      18,
      19,
      20,
      21,
      22,
      23,
      24,
      25,
      26,
      29,
      30,
      31,
      61,
      77,
      78,
      118,
      119,
      122,
      124,
      125,
      133,
      141,
      142,
      39,
      46,
      47,
      48,
      49,
      50,
      51,
      52,
      53,
      54,
      55,
      56,
      57,
      60,
      62,
      63,
      15,
      93,
      113,
      114,
      115,
      116,
      117
    ]);
    for (let i = 176;i <= 191; i++)
      IMPLEMENTED.add(i);
    for (let i = 192;i <= 255; i++)
      IMPLEMENTED.add(i);
    const RM05_DEFERRED_COUNT = Object.keys(RM05_OPCODES).length - IMPLEMENTED.size;
    return { RM05_OPCODES, RM05_DEFERRED_COUNT, IMPLEMENTED };
  } });
    __register({ name: "ttHintingOpPush", dependencies: [], factory: function() {
    function handlePushOp(op, vm) {
      const { push, reader } = vm;
      if (op >= 176 && op <= 183) {
        const n = op - 176 + 1;
        for (let i = 0;i < n; i++)
          push(reader.readUint8());
        return !0;
      }
      if (op >= 184 && op <= 191) {
        const n = op - 184 + 1;
        for (let i = 0;i < n; i++)
          push(reader.readInt16());
        return !0;
      }
      if (op === 64) {
        const n = reader.readUint8();
        for (let i = 0;i < n; i++)
          push(reader.readUint8());
        return !0;
      }
      if (op === 65) {
        const n = reader.readUint8();
        for (let i = 0;i < n; i++)
          push(reader.readInt16());
        return !0;
      }
      return !1;
    }
    return { handlePushOp };
  } });
    __register({ name: "ttHintingOpStack", dependencies: [], factory: function() {
    function handleStackOp(op, vm) {
      const { stack, push, pop, RenderError } = vm;
      switch (op) {
        case 32: {
          const v = pop();
          push(v);
          push(v);
          return !0;
        }
        case 33:
          pop();
          return !0;
        case 34:
          stack.length = 0;
          return !0;
        case 35: {
          const a = pop(), b = pop();
          push(a);
          push(b);
          return !0;
        }
        case 36:
          push(stack.length);
          return !0;
        case 37: {
          const k = pop();
          if (k < 1 || k > stack.length)
            throw new RenderError("fonts/tt-hinting-cindex", "CINDEX out of range", { context: { k, depth: stack.length } });
          push(stack[stack.length - k]);
          return !0;
        }
        case 38: {
          const k = pop();
          if (k < 1 || k > stack.length)
            throw new RenderError("fonts/tt-hinting-mindex", "MINDEX out of range", { context: { k, depth: stack.length } });
          const v = stack.splice(stack.length - k, 1)[0];
          push(v);
          return !0;
        }
        case 138: {
          const c3 = pop(), b3 = pop(), a3 = pop();
          push(b3);
          push(c3);
          push(a3);
          return !0;
        }
      }
      return !1;
    }
    return { handleStackOp };
  } });
    __register({ name: "ttHintingOpMath", dependencies: [], factory: function() {
    function handleMathOp(op, vm) {
      const { push, pop, opPos, RenderError } = vm;
      switch (op) {
        case 96: {
          const b = pop(), a = pop();
          push(a + b);
          return !0;
        }
        case 97: {
          const b = pop(), a = pop();
          push(a - b);
          return !0;
        }
        case 99: {
          const b = pop(), a = pop();
          push(Math.trunc(a * b / 64));
          return !0;
        }
        case 98: {
          const b = pop(), a = pop();
          if (b === 0)
            throw new RenderError("fonts/tt-hinting-div-zero", "DIV by zero", { context: { pos: opPos } });
          push(Math.trunc(a * 64 / b));
          return !0;
        }
        case 100:
          push(Math.abs(pop()));
          return !0;
        case 101:
          push(-pop());
          return !0;
        case 102: {
          const v = pop();
          push(Math.floor(v / 64) * 64);
          return !0;
        }
        case 103: {
          const v = pop();
          push(Math.ceil(v / 64) * 64);
          return !0;
        }
        case 139: {
          const b = pop(), a = pop();
          push(a > b ? a : b);
          return !0;
        }
        case 140: {
          const b = pop(), a = pop();
          push(a < b ? a : b);
          return !0;
        }
        case 90: {
          const b = pop(), a = pop();
          push(a && b ? 1 : 0);
          return !0;
        }
        case 91: {
          const b = pop(), a = pop();
          push(a || b ? 1 : 0);
          return !0;
        }
        case 92:
          push(pop() ? 0 : 1);
          return !0;
        case 84: {
          const b = pop(), a = pop();
          push(a === b ? 1 : 0);
          return !0;
        }
        case 85: {
          const b = pop(), a = pop();
          push(a !== b ? 1 : 0);
          return !0;
        }
        case 80: {
          const b = pop(), a = pop();
          push(a < b ? 1 : 0);
          return !0;
        }
        case 81: {
          const b = pop(), a = pop();
          push(a <= b ? 1 : 0);
          return !0;
        }
        case 82: {
          const b = pop(), a = pop();
          push(a > b ? 1 : 0);
          return !0;
        }
        case 83: {
          const b = pop(), a = pop();
          push(a >= b ? 1 : 0);
          return !0;
        }
      }
      return !1;
    }
    return { handleMathOp };
  } });
    __register({ name: "ttHintingOpControl", dependencies: [], factory: function() {
    function handleControlOp(op, vm) {
      const { pop, reader, bytes, opPos, skipTo, RenderError } = vm;
      switch (op) {
        case 88: {
          if (!pop()) {
            const hit = skipTo([27, 89]);
          }
          return !0;
        }
        case 27: {
          skipTo([89]);
          return !0;
        }
        case 89:
          return !0;
        case 28: {
          const off = pop(), tgt = opPos + off;
          if (tgt < 0 || tgt > bytes.length)
            throw new RenderError("fonts/tt-hinting-jump-range", "JMPR target out of range", { context: { tgt, length: bytes.length } });
          reader.seek(tgt);
          return !0;
        }
        case 120: {
          const e = pop(), off = pop();
          if (e) {
            const tgt = opPos + off;
            if (tgt < 0 || tgt > bytes.length)
              throw new RenderError("fonts/tt-hinting-jump-range", "JROT target out of range", { context: { tgt, length: bytes.length } });
            reader.seek(tgt);
          }
          return !0;
        }
        case 121: {
          const e = pop(), off = pop();
          if (!e) {
            const tgt = opPos + off;
            if (tgt < 0 || tgt > bytes.length)
              throw new RenderError("fonts/tt-hinting-jump-range", "JROF target out of range", { context: { tgt, length: bytes.length } });
            reader.seek(tgt);
          }
          return !0;
        }
      }
      return !1;
    }
    return { handleControlOp };
  } });
    __register({ name: "ttHintingOpGs", dependencies: [], factory: function() {
    function handleGsOp(op, vm) {
      const { push, pop, gs, zones, ppem, pointSize, round, RenderError } = vm;
      switch (op) {
        case 75:
          push(ppem);
          return !0;
        case 76:
          push(pointSize);
          return !0;
        case 12: {
          push(gs.projection_vector[0]);
          push(gs.projection_vector[1]);
          return !0;
        }
        case 13: {
          push(gs.freedom_vector[0]);
          push(gs.freedom_vector[1]);
          return !0;
        }
        case 70:
        case 71: {
          const p = pop(), z = zones[gs.zp2];
          if (p < 0 || p >= z.length)
            throw new RenderError("fonts/tt-hinting-bad-point", "GC point out of range", { context: { point: p, zone: gs.zp2, length: z.length } });
          const useOrig = (op & 1) === 1, x = useOrig ? z.origX[p] : z.x[p], y = useOrig ? z.origY[p] : z.y[p], pv = gs.projection_vector;
          push(Math.trunc((x * pv[0] + y * pv[1]) / 16384));
          return !0;
        }
        case 104:
        case 105:
        case 106:
        case 107: {
          push(round(pop()));
          return !0;
        }
        case 0:
        case 1: {
          const x = op & 1 ? 16384 : 0, y = op & 1 ? 0 : 16384;
          gs.projection_vector = [x, y];
          gs.freedom_vector = [x, y];
          gs.dual_proj_vector = [x, y];
          return !0;
        }
        case 2:
        case 3: {
          const x = op & 1 ? 16384 : 0, y = op & 1 ? 0 : 16384;
          gs.projection_vector = [x, y];
          gs.dual_proj_vector = [x, y];
          return !0;
        }
        case 4:
        case 5: {
          const x = op & 1 ? 16384 : 0, y = op & 1 ? 0 : 16384;
          gs.freedom_vector = [x, y];
          return !0;
        }
        case 6:
        case 7: {
          const p1 = pop(), p2 = pop(), z1 = zones[gs.zp1], z2 = zones[gs.zp2];
          let dx = 0, dy = 0;
          if (p1 < z1.length && p2 < z2.length) {
            dx = z2.x[p2] - z1.x[p1];
            dy = z2.y[p2] - z1.y[p1];
          }
          if (op & 1) {
            const t = dx;
            dx = -dy;
            dy = t;
          }
          const len = Math.hypot(dx, dy) || 1;
          gs.projection_vector = [
            Math.trunc(dx / len * 16384),
            Math.trunc(dy / len * 16384)
          ];
          gs.dual_proj_vector = gs.projection_vector.slice();
          return !0;
        }
        case 8:
        case 9: {
          const p1 = pop(), p2 = pop(), z1 = zones[gs.zp1], z2 = zones[gs.zp2];
          let dx = 0, dy = 0;
          if (p1 < z1.length && p2 < z2.length) {
            dx = z2.x[p2] - z1.x[p1];
            dy = z2.y[p2] - z1.y[p1];
          }
          if (op & 1) {
            const t = dx;
            dx = -dy;
            dy = t;
          }
          const len = Math.hypot(dx, dy) || 1;
          gs.freedom_vector = [
            Math.trunc(dx / len * 16384),
            Math.trunc(dy / len * 16384)
          ];
          return !0;
        }
        case 10: {
          const y = pop(), x = pop();
          gs.projection_vector = [x | 0, y | 0];
          gs.dual_proj_vector = [x | 0, y | 0];
          return !0;
        }
        case 11: {
          const y = pop(), x = pop();
          gs.freedom_vector = [x | 0, y | 0];
          return !0;
        }
        case 14: {
          gs.freedom_vector = gs.projection_vector.slice();
          return !0;
        }
        case 16:
          gs.rp0 = pop() | 0;
          return !0;
        case 17:
          gs.rp1 = pop() | 0;
          return !0;
        case 18:
          gs.rp2 = pop() | 0;
          return !0;
        case 19:
          gs.zp0 = pop() | 0;
          return !0;
        case 20:
          gs.zp1 = pop() | 0;
          return !0;
        case 21:
          gs.zp2 = pop() | 0;
          return !0;
        case 22: {
          const z = pop() | 0;
          gs.zp0 = z;
          gs.zp1 = z;
          gs.zp2 = z;
          return !0;
        }
        case 23: {
          const v = pop() | 0;
          if (v < 1)
            throw new RenderError("fonts/tt-hinting-bad-loop", "SLOOP value must be \u2265 1", { context: { v } });
          gs.loop = v;
          return !0;
        }
        case 24:
          gs.round_state = 1;
          return !0;
        case 25:
          gs.round_state = 0;
          return !0;
        case 26:
          gs.minimum_distance = pop() | 0;
          return !0;
        case 29:
          gs.control_value_cut_in = pop() | 0;
          return !0;
        case 30:
          gs.single_width_cut_in = pop() | 0;
          return !0;
        case 31:
          gs.single_width_value = pop() | 0;
          return !0;
        case 61:
          gs.round_state = 2;
          return !0;
        case 77:
          gs.auto_flip = !0;
          return !0;
        case 78:
          gs.auto_flip = !1;
          return !0;
        case 118: {
          const n = pop() & 255;
          gs.round_state = 5;
          gs.round_period = n >> 6 & 3;
          gs.round_phase = n >> 4 & 3;
          gs.round_threshold = n & 15;
          return !0;
        }
        case 119: {
          const n = pop() & 255;
          gs.round_state = 6;
          gs.round_period = n >> 6 & 3;
          gs.round_phase = n >> 4 & 3;
          gs.round_threshold = n & 15;
          return !0;
        }
        case 122:
          gs.round_state = 3;
          return !0;
        case 124:
          gs.round_state = 4;
          return !0;
        case 125:
          gs.round_state = 7;
          return !0;
        case 133:
          gs.scan_control_flag = pop() | 0;
          return !0;
        case 141:
          gs.scan_type = pop() | 0;
          return !0;
        case 142: {
          pop();
          gs.instruct_control = pop() | 0;
          return !0;
        }
      }
      return !1;
    }
    return { handleGsOp };
  } });
    __register({ name: "ttHintingOpOutline", dependencies: [], factory: function() {
    function handleOutlineOp(op, vm) {
      const { pop, gs } = vm;
      if (op >= 192 && op <= 223) {
        const p = pop() | 0;
        gs.rp1 = gs.rp0;
        gs.rp2 = p;
        if (op & 16)
          gs.rp0 = p;
        return !0;
      }
      if (op >= 224 && op <= 255) {
        pop();
        const p = pop() | 0;
        gs.rp1 = gs.rp0;
        gs.rp2 = p;
        if (op & 16)
          gs.rp0 = p;
        return !0;
      }
      switch (op) {
        case 39: {
          pop();
          pop();
          return !0;
        }
        case 46:
        case 47: {
          const p = pop() | 0;
          gs.rp0 = p;
          gs.rp1 = p;
          return !0;
        }
        case 48:
        case 49:
          return !0;
        case 50:
        case 51: {
          for (let i = 0;i < gs.loop; i++)
            pop();
          gs.loop = 1;
          return !0;
        }
        case 52:
        case 53: {
          pop();
          return !0;
        }
        case 54:
        case 55: {
          pop();
          return !0;
        }
        case 56: {
          pop();
          for (let i = 0;i < gs.loop; i++)
            pop();
          gs.loop = 1;
          return !0;
        }
        case 57: {
          for (let i = 0;i < gs.loop; i++)
            pop();
          gs.loop = 1;
          return !0;
        }
        case 60: {
          for (let i = 0;i < gs.loop; i++)
            pop();
          gs.loop = 1;
          return !0;
        }
        case 62:
        case 63: {
          pop();
          const p = pop() | 0;
          gs.rp0 = p;
          gs.rp1 = p;
          return !0;
        }
        case 15: {
          pop();
          pop();
          pop();
          pop();
          pop();
          return !0;
        }
      }
      return !1;
    }
    return { handleOutlineOp };
  } });
    __register({ name: "ttHintingOpCvt", dependencies: [], factory: function() {
    function handleCvtOp(op, vm) {
      const { push, pop, cvt, storage, RenderError } = vm;
      switch (op) {
        case 68: {
          const v = pop(), idx = pop();
          if (idx < 0)
            throw new RenderError("fonts/tt-hinting-bad-cvt", "WCVTP negative index", { context: { idx } });
          cvt[idx] = v | 0;
          return !0;
        }
        case 112: {
          const v = pop(), idx = pop();
          if (idx < 0)
            throw new RenderError("fonts/tt-hinting-bad-cvt", "WCVTF negative index", { context: { idx } });
          cvt[idx] = v | 0;
          return !0;
        }
        case 69: {
          const idx = pop();
          push(cvt[idx] | 0);
          return !0;
        }
        case 66: {
          const v = pop(), idx = pop();
          if (idx < 0)
            throw new RenderError("fonts/tt-hinting-bad-storage", "WS negative index", { context: { idx } });
          storage[idx] = v | 0;
          return !0;
        }
        case 67: {
          const idx = pop();
          push(storage[idx] | 0);
          return !0;
        }
        case 93:
        case 113:
        case 114: {
          const n = pop() | 0;
          for (let i = 0;i < n; i++) {
            pop();
            pop();
          }
          return !0;
        }
        case 115:
        case 116:
        case 117: {
          const n = pop() | 0;
          for (let i = 0;i < n; i++) {
            pop();
            pop();
          }
          return !0;
        }
      }
      return !1;
    }
    return { handleCvtOp };
  } });
    __register({ name: "extraTtHinting", dependencies: ["fontErrors","fontReader","ttHintingGs","ttHintingOpCatalog","ttHintingOpPush","ttHintingOpStack","ttHintingOpMath","ttHintingOpControl","ttHintingOpGs","ttHintingOpOutline","ttHintingOpCvt"], factory: function(errors, reader, gsMod, catalogMod, pushMod, stackMod, mathMod, controlMod, gsOpMod, outlineMod, cvtMod) {
    const { ParseError, RenderError } = errors, { BinaryReader } = reader, { GraphicsState, Zone, MAX_STEPS, MAX_STACK, F26DOT6 } = gsMod, { RM05_OPCODES, RM05_DEFERRED_COUNT } = catalogMod, { handlePushOp } = pushMod, { handleStackOp } = stackMod, { handleMathOp } = mathMod, { handleControlOp } = controlMod, { handleGsOp } = gsOpMod, { handleOutlineOp } = outlineMod, { handleCvtOp } = cvtMod;
    function interpret(bytes, ctx) {
      if (!(bytes instanceof Uint8Array))
        throw new ParseError("fonts/tt-hinting-input", "interpret expects Uint8Array bytecode", { context: { actual: typeof bytes } });
      const c = ctx || {}, gs = c.gs || new GraphicsState, zones = [c.zone0 || new Zone(0), c.zone1 || new Zone(0)], cvt = Array.from(c.cvt || []), storage = Array.from(c.storage || []), ppem = c.ppem != null ? c.ppem : 12, pointSize = c.pointSize != null ? c.pointSize : 9, maxSteps = c.maxSteps != null ? c.maxSteps : MAX_STEPS, readerInst = new BinaryReader(bytes), stack = [];
      let executed = 0;
      const vm = {
        stack,
        push: (v) => {
          if (stack.length >= MAX_STACK)
            throw new RenderError("fonts/tt-hinting-stack-overflow", "TT VM stack overflow", { context: { limit: MAX_STACK } });
          stack.push(v | 0);
        },
        pop: () => {
          if (stack.length === 0)
            throw new RenderError("fonts/tt-hinting-stack-underflow", "TT VM stack underflow", { context: { pos: readerInst.pos } });
          return stack.pop();
        },
        gs,
        zones,
        cvt,
        storage,
        ppem,
        pointSize,
        reader: readerInst,
        bytes,
        skipTo: (targets) => {
          let depth = 0;
          while (!readerInst.eof) {
            const op = readerInst.readUint8();
            if (op === 88)
              depth++;
            else if (op === 89) {
              if (depth === 0 && targets.indexOf(89) >= 0)
                return 89;
              depth--;
            } else if (op === 27 && depth === 0 && targets.indexOf(27) >= 0)
              return 27;
            else if (op >= 176 && op <= 183)
              readerInst.skip(op - 176 + 1);
            else if (op >= 184 && op <= 191)
              readerInst.skip(2 * (op - 184 + 1));
            else if (op === 64)
              readerInst.skip(readerInst.readUint8());
            else if (op === 65)
              readerInst.skip(2 * readerInst.readUint8());
          }
          throw new RenderError("fonts/tt-hinting-unbalanced-if", "unterminated IF block", { context: {} });
        },
        round: (v, period) => {
          const p = period || F26DOT6, half = p >> 1;
          return v >= 0 ? Math.trunc((v + half) / p) * p : -Math.trunc((-v + half) / p) * p;
        },
        opPos: 0,
        RenderError
      };
      while (!readerInst.eof) {
        if (++executed > maxSteps)
          throw new RenderError("fonts/tt-hinting-step-limit", "TT VM step limit exceeded", { context: { maxSteps, pos: readerInst.pos } });
        const opPos = readerInst.pos, op = readerInst.readUint8();
        vm.opPos = opPos;
        if (handlePushOp(op, vm))
          continue;
        if (handleStackOp(op, vm))
          continue;
        if (handleMathOp(op, vm))
          continue;
        if (handleControlOp(op, vm))
          continue;
        if (handleGsOp(op, vm))
          continue;
        if (handleCvtOp(op, vm))
          continue;
        if (handleOutlineOp(op, vm))
          continue;
        const info = RM05_OPCODES[op];
        if (info)
          throw new RenderError("fonts/tt-hinting-unimplemented", "TT opcode not implemented: " + info.name + " (0x" + op.toString(16) + ")", { context: { op, name: info.name, pos: opPos } });
        throw new RenderError("fonts/tt-hinting-unknown-op", "unknown TT opcode 0x" + op.toString(16), { context: { op, pos: opPos } });
      }
      return { stack, gs, zones, executed, cvt, storage };
    }
    return { interpret, RM05_OPCODES, RM05_DEFERRED_COUNT, GraphicsState, Zone };
  } });
    __register({ name: "extraShaperArabic", dependencies: ["fontErrors"], factory: function(errors) {
    const { ContractError } = errors, JOINING_TYPES_CONST = Object.freeze({
      1536: "U",
      1537: "U",
      1538: "U",
      1539: "U",
      1548: "U",
      1549: "U",
      1563: "U",
      1567: "U",
      1569: "U",
      1570: "R",
      1571: "R",
      1572: "R",
      1573: "R",
      1574: "D",
      1575: "R",
      1576: "D",
      1577: "R",
      1578: "D",
      1579: "D",
      1580: "D",
      1581: "D",
      1582: "D",
      1583: "R",
      1584: "R",
      1585: "R",
      1586: "R",
      1587: "D",
      1588: "D",
      1589: "D",
      1590: "D",
      1591: "D",
      1592: "D",
      1593: "D",
      1594: "D",
      1595: "D",
      1596: "D",
      1597: "D",
      1598: "D",
      1599: "D",
      1600: "C",
      1601: "D",
      1602: "D",
      1603: "D",
      1604: "D",
      1605: "D",
      1606: "D",
      1607: "D",
      1608: "R",
      1609: "D",
      1610: "D",
      1611: "T",
      1612: "T",
      1613: "T",
      1614: "T",
      1615: "T",
      1616: "T",
      1617: "T",
      1618: "T",
      1619: "T",
      1620: "T",
      1621: "T",
      1622: "T",
      1623: "T",
      1624: "T",
      1625: "T",
      1626: "T",
      1627: "T",
      1628: "T",
      1629: "T",
      1630: "T",
      1631: "T",
      1648: "T",
      8204: "U",
      8205: "C"
    });
    function joiningType(cp) {
      return JOINING_TYPES_CONST[cp] || "U";
    }
    function joinsLeft(t) {
      return t === "L" || t === "D" || t === "C";
    }
    function joinsRight(t) {
      return t === "R" || t === "D" || t === "C";
    }
    function prevNonT(types, i) {
      for (let k = i - 1;k >= 0; k--)
        if (types[k] !== "T")
          return k;
      return -1;
    }
    function nextNonT(types, i) {
      for (let k = i + 1;k < types.length; k++)
        if (types[k] !== "T")
          return k;
      return -1;
    }
    function arabicShape(codePoints) {
      if (!Array.isArray(codePoints))
        throw new ContractError("fonts/arabic-input", "arabicShape expects an array of code points");
      const n = codePoints.length, cps = Array(n), types = Array(n);
      for (let i = 0;i < n; i++) {
        const v = codePoints[i];
        let cp;
        if (typeof v === "number")
          cp = v;
        else if (typeof v === "string" && v.length > 0)
          cp = v.codePointAt(0);
        else
          throw new ContractError("fonts/arabic-input", `invalid code point at index ${i}`, { context: { index: i, value: v } });
        cps[i] = cp;
        types[i] = joiningType(cp);
      }
      const forms = Array(n);
      for (let i = 0;i < n; i++) {
        if (types[i] === "T") {
          forms[i] = "isol";
          continue;
        }
        const p = prevNonT(types, i), q = nextNonT(types, i), prevT = p >= 0 ? types[p] : "U", nextT = q >= 0 ? types[q] : "U", joinPrev = joinsRight(types[i]) && joinsLeft(prevT), joinNext = joinsLeft(types[i]) && joinsRight(nextT);
        if (joinPrev && joinNext)
          forms[i] = "medi";
        else if (joinPrev)
          forms[i] = "fina";
        else if (joinNext)
          forms[i] = "init";
        else
          forms[i] = "isol";
      }
      return forms;
    }
    function arabicShapeString(str) {
      if (typeof str !== "string")
        throw new ContractError("fonts/arabic-input", "expected string");
      const cps = [];
      for (const ch of str)
        cps.push(ch.codePointAt(0));
      return arabicShape(cps);
    }
    return {
      arabicShape,
      arabicShapeString,
      joiningType,
      JOINING_TYPES: JOINING_TYPES_CONST
    };
  } });
    __register({ name: "extraShaperIndic", dependencies: ["fontErrors"], factory: function(errors) {
    const { ContractError } = errors, DEVANAGARI_CATEGORIES_CONST = Object.freeze({
      2304: "mark",
      2305: "mark",
      2306: "mark",
      2307: "vowel_mark_post",
      2308: "vowel",
      2309: "vowel",
      2310: "vowel",
      2311: "vowel",
      2312: "vowel",
      2313: "vowel",
      2314: "vowel",
      2315: "vowel",
      2316: "vowel",
      2317: "vowel",
      2318: "vowel",
      2319: "vowel",
      2320: "vowel",
      2321: "vowel",
      2322: "vowel",
      2323: "vowel",
      2324: "vowel",
      2364: "nukta",
      2365: "mark",
      2362: "vowel_mark_above",
      2363: "vowel_mark_post",
      2366: "vowel_mark_post",
      2367: "vowel_mark_pre",
      2368: "vowel_mark_post",
      2369: "vowel_mark_below",
      2370: "vowel_mark_below",
      2371: "vowel_mark_below",
      2372: "vowel_mark_below",
      2373: "vowel_mark_above",
      2374: "vowel_mark_above",
      2375: "vowel_mark_above",
      2376: "vowel_mark_above",
      2377: "vowel_mark_post",
      2378: "vowel_mark_post",
      2379: "vowel_mark_post",
      2380: "vowel_mark_post",
      2381: "virama",
      2382: "vowel_mark_pre",
      2383: "vowel_mark_post",
      2385: "mark",
      2386: "mark",
      2387: "mark",
      2388: "mark",
      2400: "vowel",
      2401: "vowel",
      2402: "vowel_mark_below",
      2403: "vowel_mark_below",
      2404: "other",
      2405: "other",
      2406: "other",
      2407: "other",
      2408: "other",
      2409: "other",
      2410: "other",
      2411: "other",
      2412: "other",
      2413: "other",
      2414: "other",
      2415: "other"
    }), _devaMut = { ...DEVANAGARI_CATEGORIES_CONST };
    for (let cp = 2325;cp <= 2361; cp++)
      _devaMut[cp] = "consonant";
    for (let cp = 2392;cp <= 2399; cp++)
      _devaMut[cp] = "consonant";
    for (let cp = 2424;cp <= 2431; cp++)
      _devaMut[cp] = "consonant";
    const DEVA_CATEGORIES_CONST = Object.freeze(_devaMut), INDIC_SCRIPTS_CONST = Object.freeze({
      deva: DEVA_CATEGORIES_CONST
    }), DEVA_RA_CONST = 2352;
    function categorize(cp, script = "deva") {
      return (INDIC_SCRIPTS_CONST[script] || DEVA_CATEGORIES_CONST)[cp] || "other";
    }
    function isBase(c) {
      return c === "consonant" || c === "vowel";
    }
    function splitClusters(cps, script = "deva") {
      const clusters = [];
      let start = 0, cats = [], lastWasVirama = !1;
      for (let i = 0;i < cps.length; i++) {
        const c = categorize(cps[i], script);
        if (isBase(c) && cats.length > 0 && !lastWasVirama) {
          clusters.push({ start, end: i, cats });
          start = i;
          cats = [];
        }
        cats.push(c);
        lastWasVirama = c === "virama";
      }
      if (cats.length > 0)
        clusters.push({ start, end: cps.length, cats });
      return clusters;
    }
    function reorderCluster(cps, cl, script) {
      const len = cl.end - cl.start;
      if (len <= 1)
        return cps.slice(cl.start, cl.end);
      let rephSlice = null, bodyStart = cl.start;
      if (len >= 3 && cps[cl.start] === DEVA_RA_CONST && cl.cats[1] === "virama" && cl.cats[2] === "consonant") {
        rephSlice = [cps[cl.start], cps[cl.start + 1]];
        bodyStart = cl.start + 2;
      }
      let baseIdx = -1;
      for (let i = bodyStart;i < cl.end; i++) {
        const c = categorize(cps[i], script);
        if (isBase(c)) {
          baseIdx = i;
          break;
        }
      }
      if (baseIdx < 0)
        return cps.slice(cl.start, cl.end);
      const preBase = [], postBase = [];
      for (let i = baseIdx + 1;i < cl.end; i++)
        if (categorize(cps[i], script) === "vowel_mark_pre")
          preBase.push(cps[i]);
        else
          postBase.push(cps[i]);
      const prefix = [];
      for (let i = bodyStart;i < baseIdx; i++)
        prefix.push(cps[i]);
      const out = [];
      for (const x of preBase)
        out.push(x);
      for (const x of prefix)
        out.push(x);
      out.push(cps[baseIdx]);
      for (const x of postBase)
        out.push(x);
      if (rephSlice)
        for (const x of rephSlice)
          out.push(x);
      return out;
    }
    function indicReorder(codePoints, script = "deva") {
      if (!Array.isArray(codePoints))
        throw new ContractError("fonts/indic-input", "indicReorder expects an array");
      if (typeof script !== "string")
        throw new ContractError("fonts/indic-script", "script must be a string");
      const cps = Array(codePoints.length);
      for (let i = 0;i < codePoints.length; i++) {
        const v = codePoints[i];
        if (typeof v === "number")
          cps[i] = v;
        else if (typeof v === "string" && v.length > 0)
          cps[i] = v.codePointAt(0);
        else
          throw new ContractError("fonts/indic-input", `invalid code point at index ${i}`, { context: { index: i, value: v } });
      }
      const clusters = splitClusters(cps, script), out = [];
      for (const cl of clusters) {
        const r = reorderCluster(cps, cl, script);
        for (const x of r)
          out.push(x);
      }
      return out;
    }
    return {
      indicReorder,
      categorize,
      splitClusters,
      INDIC_SCRIPTS: INDIC_SCRIPTS_CONST,
      DEVA_CATEGORIES: DEVA_CATEGORIES_CONST,
      DEVANAGARI_CATEGORIES: DEVANAGARI_CATEGORIES_CONST,
      DEVA_RA: DEVA_RA_CONST
    };
  } });
    __register({ name: "extraShaperCjk", dependencies: ["fontErrors"], factory: function(errors) {
    const { ContractError } = errors, VERTICAL_FORMS_CONST = Object.freeze({
      12289: 65041,
      12290: 65042,
      12296: 65087,
      12297: 65088,
      12298: 65085,
      12299: 65086,
      12300: 65089,
      12301: 65090,
      12302: 65091,
      12303: 65092,
      12304: 65083,
      12305: 65084,
      12308: 65081,
      12309: 65082,
      12310: 65047,
      12311: 65048,
      40: 65077,
      41: 65078,
      123: 65079,
      125: 65080,
      91: 65095,
      93: 65096,
      8212: 65073,
      8211: 65074,
      8229: 65072,
      8230: 65049,
      65292: 65040,
      65294: 65042,
      65306: 65043,
      65307: 65044,
      65281: 65045,
      65311: 65046
    }), VERTICAL_ROTATE_RANGES_CONST = Object.freeze([
      [32, 126],
      [160, 255],
      [8192, 8303]
    ]);
    function isVariationSelector(cp) {
      return cp >= 65024 && cp <= 65039 || cp >= 917760 && cp <= 917999;
    }
    function isIdeographicVS(cp) {
      return cp >= 917760 && cp <= 917999;
    }
    function isCJKIdeograph(cp) {
      return cp >= 19968 && cp <= 40959 || cp >= 13312 && cp <= 19903 || cp >= 131072 && cp <= 173791 || cp >= 173824 && cp <= 177983 || cp >= 63744 && cp <= 64255;
    }
    function hasVerticalForm(cp) {
      return Object.prototype.hasOwnProperty.call(VERTICAL_FORMS_CONST, cp);
    }
    function cjkVertical(codePoints, isVertical) {
      if (!Array.isArray(codePoints))
        throw new ContractError("fonts/cjk-input", "cjkVertical expects an array");
      if (typeof isVertical !== "boolean")
        throw new ContractError("fonts/cjk-input", "isVertical must be a boolean");
      const out = Array(codePoints.length);
      for (let i = 0;i < codePoints.length; i++) {
        const v = codePoints[i];
        let cp;
        if (typeof v === "number")
          cp = v;
        else if (typeof v === "string" && v.length > 0)
          cp = v.codePointAt(0);
        else
          throw new ContractError("fonts/cjk-input", `invalid code point at index ${i}`, { context: { index: i } });
        if (isVertical && VERTICAL_FORMS_CONST[cp] != null)
          out[i] = VERTICAL_FORMS_CONST[cp];
        else
          out[i] = cp;
      }
      return out;
    }
    function extractIVS(codePoints) {
      if (!Array.isArray(codePoints))
        throw new ContractError("fonts/cjk-input", "extractIVS expects an array");
      const cps = Array(codePoints.length);
      for (let i = 0;i < codePoints.length; i++) {
        const v = codePoints[i];
        if (typeof v === "number")
          cps[i] = v;
        else if (typeof v === "string" && v.length > 0)
          cps[i] = v.codePointAt(0);
        else
          throw new ContractError("fonts/cjk-input", `invalid code point at index ${i}`, { context: { index: i } });
      }
      const out = [];
      for (let i = 0;i < cps.length; i++) {
        const cp = cps[i];
        if (isVariationSelector(cp))
          continue;
        let selector = null;
        if (i + 1 < cps.length && isIdeographicVS(cps[i + 1]) && isCJKIdeograph(cp)) {
          selector = cps[i + 1];
          i++;
        }
        out.push({ base: cp, selector });
      }
      return out;
    }
    function shouldRotateVertical(cp) {
      if (hasVerticalForm(cp))
        return !1;
      if (isCJKIdeograph(cp))
        return !1;
      for (const [a, b] of VERTICAL_ROTATE_RANGES_CONST)
        if (cp >= a && cp <= b)
          return !0;
      return !1;
    }
    return {
      cjkVertical,
      extractIVS,
      isVariationSelector,
      isIdeographicVS,
      isCJKIdeograph,
      hasVerticalForm,
      shouldRotateVertical,
      VERTICAL_FORMS: VERTICAL_FORMS_CONST,
      VERTICAL_ROTATE_RANGES: VERTICAL_ROTATE_RANGES_CONST,
      VS1: 65024,
      VS16: 65039,
      VS17: 917760,
      VS256: 917999
    };
  } });
    __register({ name: "extraWoff2Write", dependencies: ["fontErrors","fontWriter","fontSfnt","brotli"], factory: function(errors, writer, sfntMod, brotliMod) {
    const { ContractError, ParseError } = errors, { BinaryWriter } = writer, { parseSfnt } = sfntMod;
    function writeBase128(w, v) {
      if (v < 0 || v > 4294967295)
        throw new ContractError("fonts/woff2w-base128-range", "UIntBase128 value out of range", { context: { value: v } });
      const bytes = [];
      let n = v >>> 0;
      do {
        bytes.unshift(n & 127);
        n = n >>> 7;
      } while (n !== 0);
      for (let i = 0;i < bytes.length - 1; i++)
        w.writeUint8(bytes[i] | 128);
      w.writeUint8(bytes[bytes.length - 1]);
    }
    function encodeWoff2(sfntBytes, brotli) {
      if (!(sfntBytes instanceof Uint8Array))
        throw new ContractError("fonts/woff2w-input", "encodeWoff2 expects a Uint8Array", { context: { actual: typeof sfntBytes } });
      if (!brotli || typeof brotli.brotliCompressSync !== "function")
        throw new ContractError("fonts/woff2w-no-brotli", "encodeWoff2 requires a brotli module with brotliCompressSync");
      const sfnt = parseSfnt(sfntBytes), names = Object.keys(sfnt.tables);
      if (names.length === 0)
        throw new ParseError("fonts/woff2w-empty", "cannot encode WOFF2 with zero tables");
      let bodyLen = 0;
      for (const n of names)
        bodyLen += sfnt.tables[n].bytes.length;
      const body = new Uint8Array(bodyLen);
      let off = 0;
      for (const n of names) {
        const t = sfnt.tables[n];
        body.set(t.bytes, off);
        off += t.bytes.length;
      }
      const compressed = brotli.brotliCompressSync(body);
      if (!(compressed instanceof Uint8Array))
        throw new ContractError("fonts/woff2w-brotli-output", "brotli.brotliCompressSync must return Uint8Array");
      const totalSfntSize = sfntBytes.length, w = new BinaryWriter(64 + names.length * 12 + compressed.length);
      w.writeUint32(2001684018);
      w.writeUint32(sfnt.sfntVersion);
      const lengthPos = w.pos;
      w.writeUint32(0);
      w.writeUint16(names.length);
      w.writeUint16(0);
      w.writeUint32(totalSfntSize);
      w.writeUint32(compressed.length);
      w.writeUint16(1);
      w.writeUint16(0);
      w.writeUint32(0);
      w.writeUint32(0);
      w.writeUint32(0);
      w.writeUint32(0);
      w.writeUint32(0);
      for (const n of names) {
        const t = sfnt.tables[n], transformVersion = n === "glyf" || n === "loca" ? 3 : 0;
        w.writeUint8(63 | transformVersion << 6);
        w.writeTag(n);
        writeBase128(w, t.bytes.length);
      }
      w.writeBytes(compressed);
      const out = w.finalize();
      new DataView(out.buffer, out.byteOffset, out.byteLength).setUint32(lengthPos, out.length >>> 0, !1);
      return out;
    }
    function encode(sfntBytes) {
      return encodeWoff2(sfntBytes, brotliMod);
    }
    return { encode, encodeWoff2, WOFF2_MAGIC: 2001684018 };
  } });
    __register({ name: "extraDsig", dependencies: ["fontErrors","fontReader"], factory: function(errors, reader) {
    const { ParseError } = errors, { BinaryReader } = reader;
    function parseDsig(bytes) {
      if (!(bytes instanceof Uint8Array))
        throw new ParseError("fonts/dsig-input", "parseDsig expects a Uint8Array", { context: { actual: typeof bytes } });
      if (bytes.length < 8)
        throw new ParseError("fonts/dsig-short", "DSIG table truncated", { context: { length: bytes.length } });
      const r = new BinaryReader(bytes), version = r.readUint32();
      if (version !== 1)
        throw new ParseError("fonts/dsig-version", `unsupported DSIG version ${version}`, { context: { version } });
      const numSignatures = r.readUint16(), flags = r.readUint16();
      if (8 + numSignatures * 12 > bytes.length)
        throw new ParseError("fonts/dsig-records-truncated", "DSIG signature records run past end of table", { context: { numSignatures, tableLength: bytes.length } });
      const records = Array(numSignatures);
      for (let i = 0;i < numSignatures; i++)
        records[i] = {
          format: r.readUint32(),
          length: r.readUint32(),
          offset: r.readUint32()
        };
      const signatures = Array(numSignatures);
      for (let i = 0;i < numSignatures; i++) {
        const rec = records[i];
        if (rec.offset + rec.length > bytes.length)
          throw new ParseError("fonts/dsig-block-truncated", `DSIG signature block #${i} extends past table`, { context: { index: i, offset: rec.offset, length: rec.length, tableLength: bytes.length } });
        if (rec.length < 8)
          throw new ParseError("fonts/dsig-block-short", `DSIG signature block #${i} too short for header`, { context: { index: i, length: rec.length } });
        const sub = r.sub(rec.offset, rec.length), reserved1 = sub.readUint16(), reserved2 = sub.readUint16(), signatureLength = sub.readUint32();
        if (8 + signatureLength > rec.length)
          throw new ParseError("fonts/dsig-blob-truncated", `DSIG signature blob #${i} declared length exceeds block`, { context: { index: i, signatureLength, blockLength: rec.length } });
        const signature = sub.readBytesCopy(signatureLength);
        signatures[i] = {
          format: rec.format,
          length: rec.length,
          offset: rec.offset,
          reserved1,
          reserved2,
          signatureLength,
          signature
        };
      }
      return { version, numSignatures, flags, signatures };
    }
    return {
      parseDsig,
      DSIG_VERSION: 1,
      DSIG_FORMAT_PKCS7: 1
    };
  } });

    const __core = __resolve("fonts");
    __core.use(__resolve("extraMath"), __resolve("extraJstf"), __resolve("extraTtHinting"), __resolve("extraShaperArabic"), __resolve("extraShaperIndic"), __resolve("extraShaperCjk"), __resolve("extraWoff2Write"), __resolve("extraDsig"));
    return __core;
    }
};
