// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * build-fixtures.ts — generate binary test fixtures for toolchain.test.ts.
 *
 * Run once to (re-)generate the committed fixture archives:
 *   bun tools/wasm-crypto/build-env/__fixtures__/build-fixtures.ts
 *
 * Produces:
 *   fake-sdk-linux.tar.gz   — tiny tar.gz containing wasi-sdk-24.0/bin/clang
 *   fake-sdk-win.zip        — tiny stored-method ZIP containing wasi-sdk-24.0/bin/clang.exe
 *   gnu-features.tar.gz     — tar.gz exercising the B-2 entry kinds: GNU long
 *                             name ('L'), pax extended header ('x'), directory
 *                             ('5'), symlink ('2') and hardlink ('1')
 *
 * Uses node:zlib only — NEVER PowerShell Compress-Archive (backslash entry names).
 */

import { createHash } from "node:crypto";
import { deflateRawSync, gzipSync } from "node:zlib";
import { join } from "node:path";

const FIXTURES_DIR = join(import.meta.dir);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function writeU16LE(buf: Buffer, offset: number, value: number): void {
    buf[offset] = value & 0xff;
    buf[offset + 1] = (value >> 8) & 0xff;
}

function writeU32LE(buf: Buffer, offset: number, value: number): void {
    buf[offset] = value & 0xff;
    buf[offset + 1] = (value >> 8) & 0xff;
    buf[offset + 2] = (value >> 16) & 0xff;
    buf[offset + 3] = (value >> 24) & 0xff;
}

// ─── TAR.GZ fixture ──────────────────────────────────────────────────────────

/**
 * Build a minimal TAR byte buffer with one file entry.
 *
 * TAR block = 512 bytes. Entry: header (512) + data blocks + two zero-block terminator.
 */
function buildTar(entries: Array<{ name: string; data: Uint8Array }>): Uint8Array {
    const BLOCK = 512;
    const chunks: Uint8Array[] = [];

    for (const { name, data } of entries) {
        // Build 512-byte header.
        const header = Buffer.alloc(BLOCK, 0);

        // Name field (0..99).
        const nameBytes = Buffer.from(name, "utf8");
        nameBytes.copy(header, 0, 0, Math.min(nameBytes.length, 100));

        // Mode (100..107).
        Buffer.from("0000755\0", "utf8").copy(header, 100);

        // UID / GID (108..115, 116..123).
        Buffer.from("0000000\0", "utf8").copy(header, 108);
        Buffer.from("0000000\0", "utf8").copy(header, 116);

        // Size (124..135) — octal string.
        const sizeOctal = data.length.toString(8).padStart(11, "0") + "\0";
        Buffer.from(sizeOctal, "utf8").copy(header, 124);

        // Mtime (136..147).
        Buffer.from("00000000000\0", "utf8").copy(header, 136);

        // Typeflag (156): '0' = regular file.
        header[156] = 0x30; // '0'

        // Magic "ustar" (257..262) + version "00" (263..264).
        Buffer.from("ustar\0", "utf8").copy(header, 257);
        Buffer.from("00", "utf8").copy(header, 263);

        // Compute checksum (bytes 148..155 set to spaces for calculation).
        header.fill(0x20, 148, 156);
        let checksum = 0;
        for (let i = 0; i < BLOCK; i++) checksum += header[i] ?? 0;
        const chkStr = checksum.toString(8).padStart(6, "0") + "\0 ";
        Buffer.from(chkStr, "utf8").copy(header, 148);

        chunks.push(new Uint8Array(header));

        // Data blocks (padded to 512-byte boundary).
        const dataBlocks = Math.ceil(data.length / BLOCK);
        const dataPadded = Buffer.alloc(dataBlocks * BLOCK, 0);
        Buffer.from(data).copy(dataPadded, 0);
        chunks.push(new Uint8Array(dataPadded));
    }

    // Two zero-block terminator.
    chunks.push(new Uint8Array(BLOCK));
    chunks.push(new Uint8Array(BLOCK));

    const total = chunks.reduce((s, c) => s + c.length, 0);
    const out = new Uint8Array(total);
    let off = 0;
    for (const c of chunks) {
        out.set(c, off);
        off += c.length;
    }
    return out;
}

// ─── GNU / pax TAR fixture ───────────────────────────────────────────────────

/** One fully-specified TAR entry (superset of the simple `buildTar` shape). */
interface TarEntry {
    /** Value written into the 100-byte name field (may be a placeholder). */
    name: string;
    /** Entry payload (empty for dirs/links/metadata-consuming entries). */
    data?: Uint8Array;
    /** TAR typeflag: `0` file, `5` dir, `2` symlink, `1` hardlink, `L`/`x` meta. */
    typeflag?: string;
    /** Link target (symlink/hardlink), written into the 100-byte linkname field. */
    linkname?: string;
    /** Octal mode, default `0000755`. */
    mode?: string;
}

/** Build one 512-byte TAR header + padded data blocks for `entry`. */
function buildTarEntry(entry: TarEntry): Uint8Array[] {
    const BLOCK = 512;
    const data = entry.data ?? new Uint8Array(0);
    const header = Buffer.alloc(BLOCK, 0);

    Buffer.from(entry.name, "utf8").copy(header, 0, 0, Math.min(Buffer.byteLength(entry.name), 100));
    Buffer.from(`${entry.mode ?? "0000755"}\0`, "utf8").copy(header, 100);
    Buffer.from("0000000\0", "utf8").copy(header, 108);
    Buffer.from("0000000\0", "utf8").copy(header, 116);
    Buffer.from(data.length.toString(8).padStart(11, "0") + "\0", "utf8").copy(header, 124);
    Buffer.from("00000000000\0", "utf8").copy(header, 136);
    header[156] = (entry.typeflag ?? "0").charCodeAt(0);
    if (entry.linkname) {
        Buffer.from(entry.linkname, "utf8").copy(header, 157, 0, Math.min(entry.linkname.length, 100));
    }
    Buffer.from("ustar\0", "utf8").copy(header, 257);
    Buffer.from("00", "utf8").copy(header, 263);

    header.fill(0x20, 148, 156);
    let checksum = 0;
    for (let i = 0; i < BLOCK; i++) checksum += header[i] ?? 0;
    Buffer.from(checksum.toString(8).padStart(6, "0") + "\0 ", "utf8").copy(header, 148);

    const chunks: Uint8Array[] = [new Uint8Array(header)];
    if (data.length > 0) {
        const padded = Buffer.alloc(Math.ceil(data.length / BLOCK) * BLOCK, 0);
        Buffer.from(data).copy(padded, 0);
        chunks.push(new Uint8Array(padded));
    }
    return chunks;
}

/** Concatenate entries + the two-zero-block terminator into a TAR buffer. */
function buildTarEx(entries: TarEntry[]): Uint8Array {
    const chunks: Uint8Array[] = [];
    for (const entry of entries) chunks.push(...buildTarEntry(entry));
    chunks.push(new Uint8Array(512));
    chunks.push(new Uint8Array(512));
    const total = chunks.reduce((s, c) => s + c.length, 0);
    const out = new Uint8Array(total);
    let off = 0;
    for (const c of chunks) {
        out.set(c, off);
        off += c.length;
    }
    return out;
}

/** Encode pax extended-header records (`"<len> <key>=<value>\n"`). */
function paxRecords(pairs: Record<string, string>): Uint8Array {
    let text = "";
    for (const [key, value] of Object.entries(pairs)) {
        const body = `${key}=${value}\n`;
        let len = body.length + 2;
        // The length prefix is part of the counted length — settle the fixpoint.
        while (`${len} `.length + body.length !== len) len = `${len} `.length + body.length;
        text += `${len} ${body}`;
    }
    return new TextEncoder().encode(text);
}

// ─── ZIP fixture (stored method = 0) ─────────────────────────────────────────

/**
 * Build a minimal stored-method ZIP containing one file.
 * Uses forward-slash entry names only (no backslash).
 */
function buildStoredZip(entries: Array<{ name: string; data: Uint8Array }>): Uint8Array {
    const localHeaders: Uint8Array[] = [];
    const centralHeaders: Uint8Array[] = [];
    let localOffset = 0;

    const encoder = new TextEncoder();

    for (const { name, data } of entries) {
        const nameBytes = encoder.encode(name);
        const crc32 = computeCrc32(data);
        const compSize = data.length;
        const uncompSize = data.length;

        // Local file header: 30 bytes + filename.
        const lh = Buffer.alloc(30 + nameBytes.length, 0);
        writeU32LE(lh, 0, 0x04034b50); // signature
        writeU16LE(lh, 4, 20);          // version needed
        writeU16LE(lh, 6, 0);           // flags
        writeU16LE(lh, 8, 0);           // method: stored
        writeU16LE(lh, 10, 0);          // mod time
        writeU16LE(lh, 12, 0);          // mod date
        writeU32LE(lh, 14, crc32);      // CRC-32
        writeU32LE(lh, 18, compSize);   // compressed size
        writeU32LE(lh, 22, uncompSize); // uncompressed size
        writeU16LE(lh, 26, nameBytes.length); // file name length
        writeU16LE(lh, 28, 0);          // extra field length
        lh.set(nameBytes, 30);

        const localEntry = Buffer.concat([lh, Buffer.from(data)]);
        localHeaders.push(new Uint8Array(localEntry));

        // Central directory header.
        const ch = Buffer.alloc(46 + nameBytes.length, 0);
        writeU32LE(ch, 0, 0x02014b50); // signature
        writeU16LE(ch, 4, 20);          // version made by
        writeU16LE(ch, 6, 20);          // version needed
        writeU16LE(ch, 8, 0);           // flags
        writeU16LE(ch, 10, 0);          // method: stored
        writeU16LE(ch, 12, 0);          // mod time
        writeU16LE(ch, 14, 0);          // mod date
        writeU32LE(ch, 16, crc32);      // CRC-32
        writeU32LE(ch, 20, compSize);   // compressed size
        writeU32LE(ch, 24, uncompSize); // uncompressed size
        writeU16LE(ch, 28, nameBytes.length); // file name length
        writeU16LE(ch, 30, 0);          // extra field length
        writeU16LE(ch, 32, 0);          // file comment length
        writeU16LE(ch, 34, 0);          // disk number start
        writeU16LE(ch, 36, 0);          // internal attributes
        writeU32LE(ch, 38, 0);          // external attributes
        writeU32LE(ch, 42, localOffset); // relative offset of local header
        ch.set(nameBytes, 46);

        centralHeaders.push(new Uint8Array(ch));
        localOffset += localEntry.length;
    }

    // End of central directory record.
    const eocd = Buffer.alloc(22, 0);
    const cdSize = centralHeaders.reduce((s, c) => s + c.length, 0);
    writeU32LE(eocd, 0, 0x06054b50);        // signature
    writeU16LE(eocd, 4, 0);                  // disk number
    writeU16LE(eocd, 6, 0);                  // disk with central dir
    writeU16LE(eocd, 8, entries.length);     // entries on disk
    writeU16LE(eocd, 10, entries.length);    // total entries
    writeU32LE(eocd, 12, cdSize);            // size of central dir
    writeU32LE(eocd, 16, localOffset);       // offset of central dir
    writeU16LE(eocd, 20, 0);                 // comment length

    const parts = [...localHeaders, ...centralHeaders, new Uint8Array(eocd)];
    const total = parts.reduce((s, c) => s + c.length, 0);
    const out = new Uint8Array(total);
    let off = 0;
    for (const p of parts) {
        out.set(p, off);
        off += p.length;
    }
    return out;
}

// ─── CRC-32 ───────────────────────────────────────────────────────────────────

function makeCrcTable(): Uint32Array {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) {
            c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
        }
        table[n] = c;
    }
    return table;
}

const CRC_TABLE = makeCrcTable();

function computeCrc32(data: Uint8Array): number {
    let crc = 0xffffffff;
    for (const byte of data) {
        crc = (CRC_TABLE[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
}

// ─── SHA-256 helper ───────────────────────────────────────────────────────────

function sha256Hex(data: Uint8Array): string {
    return createHash("sha256").update(data).digest("hex");
}

// ─── Generate & write ─────────────────────────────────────────────────────────

const CLANG_PLACEHOLDER = new TextEncoder().encode("#!/bin/sh\nexec clang-wasm \"$@\"\n");
const CLANG_EXE_PLACEHOLDER = new TextEncoder().encode("MZ stub\r\n");

// tar.gz: wasi-sdk-24.0-x86_64-linux/bin/clang
const tarBytes = buildTar([
    { name: "wasi-sdk-24.0-x86_64-linux/bin/clang", data: CLANG_PLACEHOLDER },
]);
const tarGzBytes = gzipSync(Buffer.from(tarBytes));

// zip: wasi-sdk-24.0-x86_64-windows/bin/clang.exe (stored)
const zipBytes = buildStoredZip([
    { name: "wasi-sdk-24.0-x86_64-windows/bin/clang.exe", data: CLANG_EXE_PLACEHOLDER },
]);

// gnu-features.tar.gz — exercises every entry kind the B-2 fix added.
const enc = new TextEncoder();
const GNU_LONG_NAME =
    "fake-sdk-gnu/lib/a-directory-with-a-deliberately-very-long-name-exceeding-one-hundred-bytes/deep-file.txt";
const GNU_PAX_NAME = "fake-sdk-gnu/share/pax-named-file.txt";

const gnuTarBytes = buildTarEx([
    { name: "fake-sdk-gnu/bin/", typeflag: "5" },
    { name: "fake-sdk-gnu/bin/clang", data: enc.encode("#!/bin/sh\nexec clang-wasm \"$@\"\n") },
    // GNU long name: an 'L' metadata entry carrying the real path.
    { name: "././@LongLink", typeflag: "L", data: enc.encode(`${GNU_LONG_NAME}\0`) },
    { name: GNU_LONG_NAME.slice(0, 100), data: enc.encode("long-name payload\n") },
    // pax extended header overriding the following entry's path.
    { name: "PaxHeaders.0/placeholder", typeflag: "x", data: paxRecords({ path: GNU_PAX_NAME }) },
    { name: "fake-sdk-gnu/share/placeholder", data: enc.encode("pax payload\n") },
    // symlink + hardlink to the clang placeholder.
    { name: "fake-sdk-gnu/bin/clang-link", typeflag: "2", linkname: "clang" },
    { name: "fake-sdk-gnu/bin/clang-hard", typeflag: "1", linkname: "fake-sdk-gnu/bin/clang" },
]);
const gnuTarGzBytes = gzipSync(Buffer.from(gnuTarBytes));

const tarGzPath = join(FIXTURES_DIR, "fake-sdk-linux.tar.gz");
const zipPath = join(FIXTURES_DIR, "fake-sdk-win.zip");
const gnuPath = join(FIXTURES_DIR, "gnu-features.tar.gz");

await Bun.write(tarGzPath, tarGzBytes);
await Bun.write(zipPath, zipBytes);
await Bun.write(gnuPath, gnuTarGzBytes);

// Print hashes so tests can reference them without computing at runtime.
console.log(`fake-sdk-linux.tar.gz sha256: ${sha256Hex(new Uint8Array(tarGzBytes))}`);
console.log(`fake-sdk-win.zip       sha256: ${sha256Hex(new Uint8Array(zipBytes))}`);
console.log(`gnu-features.tar.gz    sha256: ${sha256Hex(new Uint8Array(gnuTarGzBytes))}`);
console.log("Fixtures written.");
