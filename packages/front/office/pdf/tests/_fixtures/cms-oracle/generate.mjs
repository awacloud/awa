// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Generator of the external-oracle CMS fixtures — MANUAL,
 * owner-station only. It shells out to `openssl`; no test ever runs it and
 * no test ever calls `openssl` (the tests read the committed PDFs).
 *
 * Usage (from the repository root):
 *
 *     bun packages/front/office/pdf/tests/_fixtures/cms-oracle/generate.mjs \
 *         packages/front/office/pdf/tests/_fixtures/cms-oracle [--keys <dir>]
 *
 * `--keys` defaults to `<repo>/tmp/cms-oracle-keys/` (git-ignored). Keys and
 * self-signed certificates are created there when absent and NEVER
 * committed — they are throwaway material, never an identity. The
 * certificates still travel inside each fixture's CMS `certificates` field.
 *
 * Steps:
 *   1. base: a one-page PDF (Helvetica, one text line) from `pdfBuilder`;
 *   2. for each case (ECDSA P-256 / SHA-256, Ed25519 / SHA-512):
 *      `pdfSign._emitWithPlaceholder` reserves the signature dictionary,
 *      the `/ByteRange`-covered content goes to `openssl cms -sign`
 *      (detached, DER), `openssl cms -verify -noverify` self-checks it, and
 *      the upper-case hex is patched into `/Contents` (zero-padded);
 *   3. reverse oracle: the same base signed by OUR `sign()` with the same
 *      OpenSSL keys, each output checked with `openssl cms -verify`;
 *   4. prints the sha256 of every fixture written, for the README.
 *
 * @module pdf/tests/_fixtures/cms-oracle/generate
 */

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getRuntime, concat } from '../../_helpers/build.js';

const HERE = dirname(fileURLToPath(import.meta.url));
// <repo>/packages/front/office/pdf/tests/_fixtures/cms-oracle → <repo>
const REPO = resolve(HERE, '..', '..', '..', '..', '..', '..', '..');
const NULL_DEVICE = process.platform === 'win32' ? 'NUL' : '/dev/null';

/** Text line drawn on the single page of the base document. */
const BASE_TEXT = 'awa pdf CMS oracle';

/** The two oracle cases: fixture name stem, OpenSSL digest, key/cert files. */
const CASES = [
    { name: 'ecdsa-p256-sha256', md: 'sha256', key: 'p256-key.pem', cert: 'p256-cert.pem' },
    { name: 'ed25519-sha512',    md: 'sha512', key: 'ed-key.pem',   cert: 'ed-cert.pem' }
];

function usage(msg) {
    if (msg) console.error(msg);
    console.error('usage: bun generate.mjs <outDir> [--keys <dir>]');
    process.exit(2);
}

function parseArgs(argv) {
    let outDir = null;
    let keys = join(REPO, 'tmp', 'cms-oracle-keys');
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === '--keys') {
            if (!argv[i + 1]) usage('--keys needs a directory');
            keys = resolve(argv[++i]);
        } else if (a.startsWith('--')) {
            usage('unknown option: ' + a);
        } else if (outDir === null) {
            outDir = resolve(a);
        } else {
            usage('unexpected argument: ' + a);
        }
    }
    if (!outDir) usage('missing <outDir>');
    const norm = (p) => p.replace(/\\/g, '/').toLowerCase();
    if (norm(outDir).includes('/apps/') || norm(keys).includes('/apps/')) {
        usage('refusing to write under apps/');
    }
    return { outDir, keys };
}

/** Run openssl with an argv array (no shell); throw on a non-zero exit. */
function openssl(args) {
    const r = spawnSync('openssl', args, { encoding: 'utf8' });
    if (r.error) throw new Error('openssl not runnable: ' + r.error.message);
    if (r.status !== 0) {
        throw new Error(`openssl ${args.join(' ')} exited ${r.status}\n${r.stderr}`);
    }
    return r.stdout;
}

/** `openssl … -noout -text` → the `priv:` block as a lower-case hex string. */
function privHex(text) {
    const m = text.match(/priv:\s*\n((?:\s+[0-9a-fA-F:]+\n?)+)/);
    if (!m) throw new Error('no priv: block in openssl -text output');
    return m[1].replace(/[\s:]/g, '').toLowerCase();
}

function hexToBytes(h) {
    const out = new Uint8Array(h.length >>> 1);
    for (let i = 0; i < out.length; i++) out[i] = parseInt(h.substr(i * 2, 2), 16);
    return out;
}

function sha256Hex(bytes) {
    return createHash('sha256').update(bytes).digest('hex');
}

function ensureKeys(keys) {
    mkdirSync(keys, { recursive: true });
    const p256Key = join(keys, 'p256-key.pem');
    const p256Cert = join(keys, 'p256-cert.pem');
    if (!existsSync(p256Key) || !existsSync(p256Cert)) {
        openssl(['req', '-x509', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:P-256',
            '-nodes', '-keyout', p256Key, '-out', p256Cert,
            '-subj', '/CN=awa pdf CMS oracle P-256', '-days', '3650']);
    }
    const edKey = join(keys, 'ed-key.pem');
    const edCert = join(keys, 'ed-cert.pem');
    if (!existsSync(edKey) || !existsSync(edCert)) {
        openssl(['req', '-x509', '-newkey', 'ed25519', '-nodes',
            '-keyout', edKey, '-out', edCert,
            '-subj', '/CN=awa pdf CMS oracle Ed25519', '-days', '3650']);
    }
}

/** Bytes covered by a `/ByteRange` (the two spans, concatenated). */
function coveredBytes(bytes, br) {
    return concat([bytes.subarray(br[0], br[0] + br[1]),
                   bytes.subarray(br[2], br[2] + br[3])]);
}

/**
 * Split a signed PDF by its LAST `/ByteRange`: the covered content and the
 * DER CMS from the `/Contents` gap (trailing zero padding stripped).
 */
function splitByLastByteRange(bytes) {
    const s = Buffer.from(bytes).toString('latin1');
    const all = [...s.matchAll(/\/ByteRange\s*\[\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*\]/g)];
    if (!all.length) throw new Error('no /ByteRange');
    const br = all[all.length - 1].slice(1, 5).map(Number);
    let hex = s.slice(br[0] + br[1] + 1, br[2] - 1).replace(/0+$/, '');
    if (hex.length % 2) hex += '0';
    return { content: coveredBytes(bytes, br), cms: hexToBytes(hex) };
}

function opensslVerify(cmsPath, contentPath) {
    openssl(['cms', '-verify', '-binary', '-inform', 'DER', '-in', cmsPath,
        '-content', contentPath, '-noverify', '-out', NULL_DEVICE]);
}

/** The DER must be a ContentInfo carrying id-signedData (RFC 5652 §3). */
function assertSignedData(asn1, der) {
    const top = asn1.parseOne(der, 0);
    const kids = top && top.tag === 0x30 ? asn1.parseChildren(top.value) : null;
    if (!kids || kids.length < 2 || asn1.readOid(kids[0]) !== '1.2.840.113549.1.7.2') {
        throw new Error('openssl output is not a CMS SignedData ContentInfo');
    }
}

function buildBase(rt) {
    const { builder } = rt.resolve('pdfBuilder');
    return builder()
        .addPage()
        .addFont({ name: 'F1', baseFont: 'Helvetica' })
        .addContent(`BT /F1 12 Tf 72 720 Td (${BASE_TEXT}) Tj ET`)
        .build();
}

function main() {
    const { outDir, keys } = parseArgs(process.argv.slice(2));
    mkdirSync(outDir, { recursive: true });
    const version = openssl(['version']).trim();
    console.log('openssl:', version);
    ensureKeys(keys);

    const rt = getRuntime();
    const pdfSign = rt.resolve('pdfSign');
    const asn1 = rt.resolve('asn1');
    const base = buildBase(rt);
    writeFileSync(join(keys, 'base.pdf'), base);

    // ── 1. OpenSSL-signed fixtures ────────────────────────────────────
    const written = [];
    for (const c of CASES) {
        const e = pdfSign._emitWithPlaceholder(base, 8192, 'ETSI.CAdES.detached');
        const br = e.byteRange;
        const contentPath = join(keys, `content-${c.name}.bin`);
        const cmsPath = join(keys, `cms-${c.name}.der`);
        writeFileSync(contentPath, coveredBytes(e.bytes, br));
        // Detached by default — never pass -nodetach.
        openssl(['cms', '-sign', '-binary', '-nosmimecap', '-md', c.md,
            '-signer', join(keys, c.cert), '-inkey', join(keys, c.key),
            '-in', contentPath, '-outform', 'DER', '-out', cmsPath]);
        opensslVerify(cmsPath, contentPath);
        const der = new Uint8Array(readFileSync(cmsPath));
        assertSignedData(asn1, der);
        const hex = Buffer.from(der).toString('hex').toUpperCase();
        if (hex.length > e.contentsLength) {
            throw new Error(`CMS hex (${hex.length}) exceeds /Contents (${e.contentsLength})`);
        }
        const out = new Uint8Array(e.bytes);
        out.set(new TextEncoder().encode(hex), e.contentsOffset);
        for (let i = hex.length; i < e.contentsLength; i++) {
            out[e.contentsOffset + i] = 0x30; // '0'
        }
        const file = join(outDir, `${c.name}-openssl.pdf`);
        writeFileSync(file, out);
        written.push(file);
        console.log(`fixture ${c.name}: CMS ${der.length} bytes, openssl self-verify OK`);
    }

    // ── 2. Reverse oracle: OUR sign() checked by openssl ─────────────
    const ecc = rt.resolve('ecc');
    const bn = rt.resolve('bn');
    const ed25519 = rt.resolve('ed25519');
    const d = privHex(openssl(['ec', '-in', join(keys, 'p256-key.pem'), '-noout', '-text']));
    const p256 = { curve: ecc.curves.c256,
                   secretKey: new ecc.ecdsa.secretKey(ecc.curves.c256, new bn.bn(d)) };
    const seed = hexToBytes(privHex(openssl(['pkey', '-in', join(keys, 'ed-key.pem'), '-noout', '-text'])));
    if (seed.length !== 32) throw new Error('Ed25519 seed is not 32 bytes');
    const edPriv = ed25519.keyPair(seed).privateKey;
    const reverse = [
        { name: 'ecdsa', opts: { algorithm: 'ecdsa', hashAlg: 'sha256', privateKey: p256,
                                 cert: readFileSync(join(keys, 'p256-cert.pem'), 'utf8') } },
        { name: 'ed25519', opts: { algorithm: 'ed25519', privateKey: edPriv,
                                   cert: readFileSync(join(keys, 'ed-cert.pem'), 'utf8') } }
    ];
    const forms = [
        { name: 'default', extra: {} },
        { name: 'pades', extra: { subFilter: 'ETSI.CAdES.detached', useSignedAttrs: true } }
    ];
    const date = new Date().toISOString().slice(0, 10);
    for (const r of reverse) {
        for (const f of forms) {
            const tag = `${r.name}-${f.name}`;
            let verdict = 'OK';
            try {
                const signed = pdfSign.sign(base, Object.assign({}, r.opts, f.extra));
                writeFileSync(join(keys, `ours-${tag}.pdf`), signed);
                const { content, cms } = splitByLastByteRange(signed);
                writeFileSync(join(keys, `ours-${tag}.bin`), content);
                writeFileSync(join(keys, `ours-${tag}.der`), cms);
                opensslVerify(join(keys, `ours-${tag}.der`), join(keys, `ours-${tag}.bin`));
            } catch (err) {
                verdict = 'FAIL — ' + String(err && err.message).split('\n')[0];
            }
            console.log(`reverse oracle ${tag}: ${verdict} (${version}, ${date})`);
        }
    }

    // ── 3. sha256 of every fixture written ───────────────────────────
    for (const file of written) {
        console.log(`sha256 ${sha256Hex(readFileSync(file))}  ${file.split(/[\\/]/).pop()}`);
    }
}

main();
