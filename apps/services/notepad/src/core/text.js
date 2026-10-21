// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Bytes ⇄ text, the way a notepad does it: detect the
 * encoding (byte order mark first, then strict UTF-8, else Windows-1252),
 * the line endings, and whether the file is text at all; encode back with
 * the encoding and line endings the user keeps or picks.
 *
 * Inside the editor the text always uses `\n` (a `<textarea>` normalises
 * line breaks anyway); the file's own line endings are applied on save.
 *
 * UTF-8 goes through fw `utf8` and the byte order mark is joined with fw
 * `ui8` (`createCodec`). What fw does not have is here, and small: the
 * STRICT UTF-8 check that tells UTF-8 from a legacy code page (fw `utf8`
 * is lenient by design, so the platform's fatal `TextDecoder` answers),
 * UTF-16 and Windows-1252. Pure functions, no DOM.
 *
 * @module notepad/core/text
 */

/** @typedef {'utf-8'|'utf-8-bom'|'utf-16le'|'utf-16be'|'windows-1252'} Encoding */
/** @typedef {'crlf'|'lf'|'cr'} Eol */

/** The encodings the notepad reads and writes, in menu order. */
export const ENCODINGS = Object.freeze(/** @type {Encoding[]} */ (['utf-8', 'utf-8-bom', 'utf-16le', 'utf-16be', 'windows-1252']));

/** The line endings, in menu order. */
export const EOLS = Object.freeze(/** @type {Eol[]} */ (['crlf', 'lf', 'cr']));

/** The bytes each line ending writes. */
export const EOL_CHARS = Object.freeze({ crlf: '\r\n', lf: '\n', cr: '\r' });

/** Above this size a file is refused: a `<textarea>` stops being usable long before. */
export const MAX_BYTES = 16 * 1024 * 1024;

/**
 * Windows-1252 bytes 0x80–0x9F (the rest of the code page is Latin-1);
 * `0` marks the five unassigned bytes, read as their C1 control.
 */
const CP1252 = [
    0x20ac, 0, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160, 0x2039, 0x0152, 0, 0x017d, 0,
    0, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0, 0x017e, 0x0178
];
/** Code point → Windows-1252 byte, for the 0x80–0x9F block. */
const CP1252_REVERSE = new Map(CP1252.map((cp, i) => [cp || 0x80 + i, 0x80 + i]));

/**
 * The line-ending convention a new document uses: the platform's.
 * @param {{platform?: string, userAgentData?: {platform?: string}}|undefined} [nav]
 * @returns {Eol}
 */
export function platformEol(nav = typeof navigator !== 'undefined' ? navigator : undefined) {
    const platform = String(nav?.userAgentData?.platform || nav?.platform || '');
    return /^win/i.test(platform) ? 'crlf' : 'lf';
}

/**
 * The dominant line ending of a text, `null` when it has no line break.
 * @param {string} text
 * @returns {Eol|null}
 */
export function detectEol(text) {
    let crlf = 0, lf = 0, cr = 0;
    for (let i = 0; i < text.length; i++) {
        const c = text.charCodeAt(i);
        if (c === 13) {
            if (text.charCodeAt(i + 1) === 10) { crlf++; i++; } else cr++;
        } else if (c === 10) lf++;
    }
    if (crlf === 0 && lf === 0 && cr === 0) return null;
    if (crlf >= lf && crlf >= cr) return 'crlf';
    return lf >= cr ? 'lf' : 'cr';
}

/**
 * Every line break as `\n`.
 * @param {string} text
 */
export function normalizeEol(text) {
    return text.replace(/\r\n?/g, '\n');
}

/** @param {Uint8Array} bytes @param {number} from @param {boolean} littleEndian */
function decodeUtf16(bytes, from, littleEndian) {
    const parts = [];
    const end = bytes.length - ((bytes.length - from) % 2);
    for (let i = from; i < end; i += 8192) {
        const units = [];
        for (let j = i; j < Math.min(end, i + 8192); j += 2) {
            units.push(littleEndian ? bytes[j] | (bytes[j + 1] << 8) : (bytes[j] << 8) | bytes[j + 1]);
        }
        parts.push(String.fromCharCode(...units));
    }
    return parts.join('');
}

/** @param {Uint8Array} bytes */
function decodeCp1252(bytes) {
    const parts = [];
    for (let i = 0; i < bytes.length; i += 8192) {
        const units = [];
        for (let j = i; j < Math.min(bytes.length, i + 8192); j++) {
            const b = bytes[j];
            units.push(b >= 0x80 && b <= 0x9f ? CP1252[b - 0x80] || b : b);
        }
        parts.push(String.fromCharCode(...units));
    }
    return parts.join('');
}

/**
 * Whether the bytes are well-formed UTF-8 (fw `utf8` replaces errors with
 * U+FFFD and cannot tell; the platform's fatal decoder can).
 * @param {Uint8Array} bytes
 */
function isUtf8(bytes) {
    try {
        new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
        return true;
    } catch {
        return false;
    }
}

/**
 * @param {string} raw @param {Encoding} encoding @param {boolean} binary
 * @returns {{text: string, encoding: Encoding, eol: Eol|null, binary: boolean}}
 */
function finish(raw, encoding, binary) {
    return { text: normalizeEol(raw), encoding, eol: detectEol(raw), binary };
}

/**
 * How many characters of `text` the encoding cannot write (they would be
 * saved as `?`). Only Windows-1252 can lose any.
 * @param {string} text
 * @param {Encoding} encoding
 */
export function unencodable(text, encoding) {
    if (encoding !== 'windows-1252') return 0;
    let lost = 0;
    for (const ch of text) {
        const cp = /** @type {number} */ (ch.codePointAt(0));
        if (cp > 0xff ? !CP1252_REVERSE.has(cp) : cp >= 0x80 && cp <= 0x9f && CP1252[cp - 0x80] !== 0) lost++;
    }
    return lost;
}

/** @param {string} body @param {boolean} le */
function encodeUtf16(body, le, bom = true) {
    const head = bom ? 2 : 0;
    const out = new Uint8Array(head + body.length * 2);
    if (bom) out.set(le ? [0xff, 0xfe] : [0xfe, 0xff]);
    for (let i = 0; i < body.length; i++) {
        const u = body.charCodeAt(i);
        out[head + i * 2] = le ? u & 0xff : u >> 8;
        out[head + 1 + i * 2] = le ? u >> 8 : u & 0xff;
    }
    return out;
}

/** Characters per piece when a text is written in pieces. */
export const CHUNK_CHARS = 1 << 20;

/** @param {string} body */
function encodeCp1252(body) {
    const out = [];
    for (const ch of body) {
        const cp = /** @type {number} */ (ch.codePointAt(0));
        if (cp < 0x80 || (cp >= 0xa0 && cp <= 0xff)) out.push(cp);
        else if (cp >= 0x80 && cp <= 0x9f) out.push(CP1252[cp - 0x80] === 0 ? cp : 0x3f);
        else out.push(CP1252_REVERSE.get(cp) ?? 0x3f);
    }
    return Uint8Array.from(out);
}

const UTF8_BOM = Uint8Array.of(0xef, 0xbb, 0xbf);

/**
 * The encoder / decoder, on fw's `utf8` and `ui8` instances.
 *
 * @param {{utf8: {toBytes: (s: string) => Uint8Array, fromBytes: (b: Uint8Array) => string},
 *   ui8: {join: (a: Uint8Array, b: Uint8Array) => Uint8Array}}} fw
 */
export function createCodec({ utf8, ui8 }) {
    /**
     * Read a file's bytes as text.
     *
     * `binary` is true when the bytes hold a NUL in their first 8 KiB without a
     * UTF-16 byte order mark: an executable, an image, an archive — editing it
     * as text would destroy it.
     *
     * @param {Uint8Array} bytes
     * @returns {{text: string, encoding: Encoding, eol: Eol|null, binary: boolean}}
     */
    function decode(bytes) {
        if (bytes[0] === 0xff && bytes[1] === 0xfe) return finish(decodeUtf16(bytes, 2, true), 'utf-16le', false);
        if (bytes[0] === 0xfe && bytes[1] === 0xff) return finish(decodeUtf16(bytes, 2, false), 'utf-16be', false);
        const binary = bytes.subarray(0, 8192).includes(0);
        if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
            return finish(utf8.fromBytes(bytes.subarray(3)), 'utf-8-bom', binary);
        }
        if (isUtf8(bytes)) return finish(utf8.fromBytes(bytes), 'utf-8', binary);
        return finish(decodeCp1252(bytes), 'windows-1252', binary);
    }

    /**
     * Write text as bytes, with the given encoding and line endings.
     * @param {string} text Text with any line breaks (normalised first).
     * @param {{encoding: Encoding, eol: Eol}} opts
     * @returns {Uint8Array}
     * @throws {RangeError} For an encoding the codec does not know.
     */
    function encode(text, { encoding, eol }) {
        const body = normalizeEol(text).replace(/\n/g, EOL_CHARS[eol] || '\n');
        switch (encoding) {
            case 'utf-8': return utf8.toBytes(body);
            case 'utf-8-bom': return ui8.join(UTF8_BOM, utf8.toBytes(body));
            case 'utf-16le': return encodeUtf16(body, true);
            case 'utf-16be': return encodeUtf16(body, false);
            case 'windows-1252': return encodeCp1252(body);
        }
        throw new RangeError(`notepad: unknown encoding "${encoding}"`);
    }

    /**
     * The same bytes as `encode`, in pieces of about `size` characters (never
     * splitting a surrogate pair), so a large text is written without one
     * copy of it all in memory: the pieces go into a Blob or a writable
     * stream as they are. The byte order mark leads the first piece only.
     * @param {string} text
     * @param {{encoding: Encoding, eol: Eol}} opts
     * @param {number} [size]
     * @returns {Uint8Array[]}
     * @throws {RangeError} For an encoding the codec does not know.
     */
    function encodeChunks(text, { encoding, eol }, size = CHUNK_CHARS) {
        const body = normalizeEol(text);
        const nl = EOL_CHARS[eol] || '\n';
        const pieces = [];
        for (let at = 0; at < body.length || at === 0;) {
            let end = Math.min(body.length, at + size);
            const last = body.charCodeAt(end - 1);
            // Never split a surrogate pair: end before it, or after it when the piece would be empty.
            if (end < body.length && last >= 0xd800 && last <= 0xdbff) end = end - 1 > at ? end - 1 : end + 1;
            const part = body.slice(at, end).replace(/\n/g, nl);
            const first = at === 0;
            switch (encoding) {
                case 'utf-8': pieces.push(utf8.toBytes(part)); break;
                case 'utf-8-bom': pieces.push(first ? ui8.join(UTF8_BOM, utf8.toBytes(part)) : utf8.toBytes(part)); break;
                case 'utf-16le': pieces.push(encodeUtf16(part, true, first)); break;
                case 'utf-16be': pieces.push(encodeUtf16(part, false, first)); break;
                case 'windows-1252': pieces.push(encodeCp1252(part)); break;
                default: throw new RangeError(`notepad: unknown encoding "${encoding}"`);
            }
            if (end >= body.length) break;
            at = end;
        }
        return pieces;
    }

    return { decode, encode, encodeChunks };
}

/**
 * The 1-based line and column of an offset (the column counts UTF-16
 * units, like the selection it comes from).
 * @param {string} text
 * @param {number} offset
 * @returns {{line: number, col: number}}
 */
export function position(text, offset) {
    const at = Math.max(0, Math.min(offset, text.length));
    let line = 1, start = 0;
    for (let i = text.indexOf('\n'); i !== -1 && i < at; i = text.indexOf('\n', i + 1)) {
        line++;
        start = i + 1;
    }
    return { line, col: at - start + 1 };
}

/**
 * The offset where a 1-based line starts, clamped to the text's lines.
 * @param {string} text
 * @param {number} line
 */
export function lineOffset(text, line) {
    let offset = 0;
    for (let n = 1; n < line; n++) {
        const i = text.indexOf('\n', offset);
        if (i === -1) break;
        offset = i + 1;
    }
    return offset;
}

/**
 * How many lines a text has (an empty text has one).
 * @param {string} text
 */
export function lineCount(text) {
    let n = 1;
    for (let i = text.indexOf('\n'); i !== -1; i = text.indexOf('\n', i + 1)) n++;
    return n;
}
