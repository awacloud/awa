// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Executes the external-TSA `tsaSign` example of the PAdES
 * integration guide.
 *
 * The guide's worked `fetch`-based `tsaSign` used to be the one snippet
 * nobody ran, and it did not run: it imported the asn1 DESCRIPTOR (which has
 * no encoders — `asn1.factory()` does) and read `children` / `offset` /
 * `end` fields that fw's `asn1.parseOne` never returns. This test extracts
 * the fence from the guide text and runs it against a stubbed TSA (no
 * network), so the documented example cannot drift from fw's real API again.
 *
 * Non-vacuity: the OLD fence text is kept below and run the same way; the
 * harness must reject it.
 */
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { asn1 as asn1Descriptor } from '@awacloud/fw/crypto/utils/asn1.js';

const GUIDE = join(import.meta.dir, '..', 'docs', 'guide', 'pades-integration.md');
const HEADING = '### Example — an external-TSA';
const IMPORT_LINE = "import { asn1 as asn1Descriptor } from '@awacloud/fw/crypto/utils/asn1.js';";
const TIMEOUT = 15000;

const asn1 = asn1Descriptor.factory();

/** The fence that follows the example heading, as written in the guide. */
function extractFence() {
    const md = readFileSync(GUIDE, 'utf8').replace(/\r\n/g, '\n');
    const at = md.indexOf(HEADING);
    if (at < 0) throw new Error('guide heading not found: ' + HEADING);
    const open = md.indexOf('```js\n', at);
    if (open < 0) throw new Error('no js fence after the example heading');
    const start = open + '```js\n'.length;
    const end = md.indexOf('\n```', start);
    if (end < 0) throw new Error('unterminated fence');
    return md.slice(start, end);
}

/**
 * Run a fence body (its import line already removed or replaced by `prelude`)
 * and return its `tsaSign`.
 * @param {string} body
 * @param {Function} fetchStub
 * @param {string} prelude
 */
function load(body, fetchStub, prelude = '') {
    const fn = new Function('asn1Descriptor', 'fetch', 'tsaUrl', prelude + body + '\nreturn tsaSign;');
    return fn(asn1Descriptor, fetchStub, 'https://tsa.invalid/tsr');
}

function loadGuideFence(fetchStub) {
    const fence = extractFence();
    expect(fence.split('\n')[0]).toBe(IMPORT_LINE);
    return load(fence.split('\n').slice(1).join('\n'), fetchStub);
}

const OID_SIGNED_DATA = '1.2.840.113549.1.7.2';
const OID_SHA512 = '2.16.840.1.101.3.4.2.3';

/** A distinctive token TLV: SEQUENCE { OID signedData }. */
const TOKEN = asn1.encodeSequence([asn1.encodeOid(OID_SIGNED_DATA)]);

/** TimeStampResp ::= SEQUENCE { PKIStatusInfo { INTEGER status }, token? } */
function reply(status, token) {
    const parts = [asn1.encodeSequence([asn1.encodeInteger(status)])];
    if (token) parts.push(token);
    return asn1.encodeSequence(parts);
}

/** A fetch stub answering with `bytes`; records the call in `seen`. */
function stubFetch(bytes, seen) {
    return async (url, init) => {
        if (seen) { seen.url = url; seen.init = init; }
        return {
            ok: true,
            status: 200,
            headers: { get: () => 'application/timestamp-reply' },
            arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length)
        };
    };
}

const DIGEST = Uint8Array.from({ length: 64 }, (_, i) => (i * 7 + 3) & 0xff);

describe('guide — external-TSA tsaSign fence (executed)', () => {
    test('uses the exact import line the guide documents', () => {
        expect(extractFence().split('\n')[0]).toBe(IMPORT_LINE);
    }, TIMEOUT);

    test('granted (status 0): returns the token TLV byte for byte', async () => {
        const tsaSign = loadGuideFence(stubFetch(reply(0, TOKEN)));
        const out = await tsaSign({ digest: DIGEST, hashAlg: 'sha512' });
        expect(out).toBeInstanceOf(Uint8Array);
        expect(Array.from(out)).toEqual(Array.from(TOKEN));
    }, TIMEOUT);

    test('grantedWithMods (status 1): returns the token TLV byte for byte', async () => {
        const tsaSign = loadGuideFence(stubFetch(reply(1, TOKEN)));
        const out = await tsaSign({ digest: DIGEST, hashAlg: 'sha512' });
        expect(Array.from(out)).toEqual(Array.from(TOKEN));
    }, TIMEOUT);

    test('rejection (status 2): rejects with "TSA refused"', async () => {
        const tsaSign = loadGuideFence(stubFetch(reply(2)));
        await expect(tsaSign({ digest: DIGEST, hashAlg: 'sha512' })).rejects.toThrow('TSA refused');
    }, TIMEOUT);

    test('granted reply carrying no token: rejects', async () => {
        const tsaSign = loadGuideFence(stubFetch(reply(0)));
        await expect(tsaSign({ digest: DIGEST, hashAlg: 'sha512' })).rejects.toThrow();
    }, TIMEOUT);

    test('the request handed to fetch is a well-formed TimeStampReq', async () => {
        const seen = {};
        const tsaSign = loadGuideFence(stubFetch(reply(0, TOKEN), seen));
        await tsaSign({ digest: DIGEST, hashAlg: 'sha512' });

        expect(seen.url).toBe('https://tsa.invalid/tsr');
        expect(seen.init.method).toBe('POST');
        expect(seen.init.headers['content-type']).toBe('application/timestamp-query');

        const req = asn1.parseOne(seen.init.body, 0);
        expect(req.tag).toBe(0x30);
        expect(req.next).toBe(seen.init.body.length);
        const [version, imprint, certReq] = asn1.parseChildren(req.value);
        // version INTEGER 1
        expect(Array.from(asn1.readInteger(version))).toEqual([1]);
        // messageImprint SEQUENCE { AlgorithmIdentifier { OID sha512, NULL }, OCTET STRING digest }
        expect(imprint.tag).toBe(0x30);
        const [algId, hashed] = asn1.parseChildren(imprint.value);
        const [oid] = asn1.parseChildren(algId.value);
        expect(asn1.readOid(oid)).toBe(OID_SHA512);
        expect(hashed.tag).toBe(0x04);
        expect(Array.from(hashed.value)).toEqual(Array.from(DIGEST));
        // certReq BOOLEAN TRUE
        expect(certReq.tag).toBe(0x01);
        expect(Array.from(certReq.value)).toEqual([0xff]);
    }, TIMEOUT);

    test('non-vacuity: the previous fence text does not survive the same harness', async () => {
        // The text the guide carried before it was made runnable. `import { asn1 }`
        // bound the DESCRIPTOR, so the prelude below reproduces that binding.
        const OLD_FENCE = `
function encodeBoolean(v) {
    return Uint8Array.of(0x01, 0x01, v ? 0xff : 0x00);
}
const HASH_OIDS = {
    sha256: '2.16.840.1.101.3.4.2.1',
    sha384: '2.16.840.1.101.3.4.2.2',
    sha512: '2.16.840.1.101.3.4.2.3'
};
function buildTimeStampReq(digest, hashAlg) {
    const messageImprint = asn1.encodeSequence([
        asn1.encodeSequence([ asn1.encodeOid(HASH_OIDS[hashAlg]), asn1.encodeNull() ]),
        asn1.encodeOctetString(digest)
    ]);
    return asn1.encodeSequence([
        asn1.encodeInteger(1),
        messageImprint,
        encodeBoolean(true)
    ]);
}
async function tsaSign({ digest, hashAlg }) {
    const body = buildTimeStampReq(digest, hashAlg);
    const res = await fetch(tsaUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/timestamp-query' },
        body
    });
    if (!res.ok || res.headers.get('content-type') !== 'application/timestamp-reply') {
        throw new Error('TSA request failed: ' + res.status);
    }
    const replyBytes = new Uint8Array(await res.arrayBuffer());
    const resp = asn1.parseOne(replyBytes, 0);
    const statusInfo = resp.children[0];
    const status = statusInfo.children[0].value;
    if (status !== 0 && status !== 1) {
        throw new Error('TSA refused: status ' + status);
    }
    const timeStampToken = resp.children[1];
    return replyBytes.subarray(timeStampToken.offset, timeStampToken.end);
}`;
        const tsaSign = load(OLD_FENCE, stubFetch(reply(0, TOKEN)), 'const asn1 = asn1Descriptor;\n');
        await expect(tsaSign({ digest: DIGEST, hashAlg: 'sha512' }))
            .rejects.toThrow(/asn1\.encode\w+ is not a function/);
    }, TIMEOUT);
});
