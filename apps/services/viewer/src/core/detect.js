// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview `detect(bytes, name)` — which renderer a file needs.
 *
 * Magic bytes decide first, the file name only breaks ties a signature
 * cannot (a ZIP that is neither OOXML nor ODF, a text file that is
 * Markdown). The function never parses a document: it reads at most the
 * first and last 64 KiB.
 *
 * @module viewer/core/detect
 */

/**
 * @typedef {'pdf'|'docx'|'xlsx'|'pptx'|'odt'|'ods'|'odp'|'md'|'text'
 *   |'legacy-doc'|'legacy-xls'|'legacy-ppt'|'legacy'|'encrypted'|'unknown'} Format
 * @typedef {'portable'|'document'|'sheet'|'slides'|'text'|'legacy'|'encrypted'|'unknown'} Family
 */

/** @type {Readonly<Record<Format, Family>>} */
export const FAMILY = Object.freeze({
    pdf: 'portable',
    docx: 'document', odt: 'document',
    xlsx: 'sheet', ods: 'sheet',
    pptx: 'slides', odp: 'slides',
    md: 'text', text: 'text',
    'legacy-doc': 'legacy', 'legacy-xls': 'legacy', 'legacy-ppt': 'legacy', legacy: 'legacy',
    encrypted: 'encrypted',
    unknown: 'unknown'
});

/** The `accept` list of the file picker: every format the viewer opens or explains. */
export const ACCEPT = [
    '.pdf', '.docx', '.docm', '.dotx', '.xlsx', '.xlsm', '.xltx', '.pptx', '.pptm', '.potx',
    '.odt', '.ott', '.ods', '.ots', '.odp', '.otp',
    '.md', '.markdown', '.txt', '.text', '.csv', '.tsv', '.log', '.json', '.xml', '.yaml', '.yml', '.ini',
    '.doc', '.xls', '.ppt'
].join(',');

const SCAN = 64 * 1024;

const ODF_MIMETYPES = Object.freeze({
    'application/vnd.oasis.opendocument.text': 'odt',
    'application/vnd.oasis.opendocument.text-template': 'odt',
    'application/vnd.oasis.opendocument.spreadsheet': 'ods',
    'application/vnd.oasis.opendocument.spreadsheet-template': 'ods',
    'application/vnd.oasis.opendocument.presentation': 'odp',
    'application/vnd.oasis.opendocument.presentation-template': 'odp'
});

const MARKDOWN_EXT = new Set(['md', 'markdown', 'mdown', 'mkd']);
/** Extensions that are text whatever their encoding (a windows-1252 CSV from a French Excel…). */
const TEXT_EXT = new Set(['txt', 'text', 'csv', 'tsv', 'log', 'ini', 'cfg', 'conf', 'json', 'xml', 'yaml', 'yml', ...MARKDOWN_EXT]);
const LEGACY_EXT = Object.freeze({ doc: 'legacy-doc', dot: 'legacy-doc', xls: 'legacy-xls', xlt: 'legacy-xls', ppt: 'legacy-ppt', pps: 'legacy-ppt', pot: 'legacy-ppt' });

/**
 * Lower-case extension of a file name, without the dot ('' when none).
 * @param {string} name
 * @returns {string}
 */
export function extensionOf(name) {
    const base = String(name || '').split(/[\\/]/).pop() || '';
    const dot = base.lastIndexOf('.');
    return dot > 0 ? base.slice(dot + 1).toLowerCase() : '';
}

/**
 * @param {Uint8Array} bytes
 * @param {number[]} sig
 * @param {number} [at]
 */
function startsWith(bytes, sig, at = 0) {
    if (bytes.length < at + sig.length) return false;
    for (let i = 0; i < sig.length; i++) if (bytes[at + i] !== sig[i]) return false;
    return true;
}

/**
 * Index of an ASCII needle inside `bytes[from, to)`, or -1.
 * @param {Uint8Array} bytes
 * @param {string} needle
 * @param {number} from
 * @param {number} to
 */
function indexOfAscii(bytes, needle, from, to) {
    const n = needle.length;
    const first = needle.charCodeAt(0);
    for (let i = from; i <= to - n; i++) {
        if (bytes[i] !== first) continue;
        let k = 1;
        while (k < n && bytes[i + k] === needle.charCodeAt(k)) k++;
        if (k === n) return i;
    }
    return -1;
}

/**
 * True when an MS-CFB container holds an `EncryptionInfo` stream — a
 * password-protected OOXML file (MS-OFFCRYPTO wraps it in CFB), not a
 * legacy binary. Directory entry names are UTF-16LE.
 * @param {Uint8Array} bytes
 */
function isEncryptedPackage(bytes) {
    const name = 'EncryptionInfo';
    const needle = new Uint8Array(name.length * 2);
    for (let i = 0; i < name.length; i++) needle[i * 2] = name.charCodeAt(i);
    outer: for (let i = 512; i <= bytes.length - needle.length; i++) {
        for (let k = 0; k < needle.length; k++) if (bytes[i + k] !== needle[k]) continue outer;
        return true;
    }
    return false;
}

/**
 * Classify a ZIP container: the ODF `mimetype` entry (stored first,
 * uncompressed, by the specification), else the OOXML part folders named in
 * the central directory at the end of the archive.
 * @param {Uint8Array} bytes
 * @returns {Format|null}
 */
function zipFormat(bytes) {
    // Local file header: name length at 26, extra length at 28, name at 30.
    const nameLen = bytes[26] | (bytes[27] << 8);
    const extraLen = bytes[28] | (bytes[29] << 8);
    if (nameLen === 8 && indexOfAscii(bytes, 'mimetype', 30, 38) === 30) {
        // Stored entry: its content is `compressed size` bytes (offset 18).
        const size = (bytes[18] | (bytes[19] << 8) | (bytes[20] << 16)) >>> 0;
        const start = 30 + nameLen + extraLen;
        const end = Math.min(bytes.length, start + Math.min(size, 80));
        let mime = '';
        for (let i = start; i < end; i++) mime += String.fromCharCode(bytes[i]);
        mime = mime.trim();
        if (ODF_MIMETYPES[mime]) return ODF_MIMETYPES[mime];
    }
    const from = Math.max(0, bytes.length - SCAN);
    if (indexOfAscii(bytes, 'word/', from, bytes.length) >= 0) return 'docx';
    if (indexOfAscii(bytes, 'xl/', from, bytes.length) >= 0) return 'xlsx';
    if (indexOfAscii(bytes, 'ppt/', from, bytes.length) >= 0) return 'pptx';
    return null;
}

/**
 * True when the head of the file reads as text: a BOM, or valid UTF-8 with
 * no NUL byte in the scanned window.
 * @param {Uint8Array} bytes
 */
function looksLikeText(bytes) {
    if (startsWith(bytes, [0xef, 0xbb, 0xbf]) || startsWith(bytes, [0xff, 0xfe]) || startsWith(bytes, [0xfe, 0xff])) return true;
    const head = bytes.subarray(0, SCAN);
    if (head.includes(0)) return false;
    try {
        // A multi-byte sequence cut at the window edge is not an error.
        new TextDecoder('utf-8', { fatal: true }).decode(head, { stream: head.length === SCAN });
        return true;
    } catch {
        return false;
    }
}

/**
 * Decide which renderer a file needs.
 *
 * @param {Uint8Array} bytes The whole file, or at least its head and tail.
 * @param {string} [name] The file name, for tie-breaks.
 * @returns {{format: Format, family: Family}}
 */
export function detect(bytes, name = '') {
    const ext = extensionOf(name);
    /** @type {Format} */
    let format = 'unknown';
    if (indexOfAscii(bytes, '%PDF-', 0, Math.min(bytes.length, 1024)) >= 0) {
        format = 'pdf';
    } else if (startsWith(bytes, [0x50, 0x4b, 0x03, 0x04])) {
        format = zipFormat(bytes) || 'unknown';
    } else if (startsWith(bytes, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) {
        format = isEncryptedPackage(bytes) ? 'encrypted' : (LEGACY_EXT[ext] || 'legacy');
    } else if (looksLikeText(bytes) || (TEXT_EXT.has(ext) && !bytes.subarray(0, SCAN).includes(0))) {
        format = MARKDOWN_EXT.has(ext) ? 'md' : 'text';
    }
    return { format, family: FAMILY[format] };
}
