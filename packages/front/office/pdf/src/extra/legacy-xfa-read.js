// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Opt-in: LEGACY read-only /XFA reader.
 *
 * PDF 2.0 forbids XFA on write, but legacy documents still need to be
 * parsed. The /XFA entry on the AcroForm dict comes in two shapes:
 *
 *   (a) a single stream containing a complete XDP document, or
 *   (b) an array alternating string-keys and streams, e.g.
 *       ['preamble', stream, 'config', stream, 'template', stream, …].
 *
 * This extra surfaces the packets as opaque XML byte buffers on a
 * `_legacy.xfa` object — no further interpretation is attempted.
 *
 * @module pdf/extra/legacy-xfa-read
 */

import { pdfErrors } from '../errors.js';

export const pdfLegacyXfaRead = {
    name: 'pdfLegacyXfaRead',
    dependencies: ['pdfErrors'],
    deps: [pdfErrors],

    factory(errors) {
        const { ParseError } = errors;
        const KNOWN_PACKETS = new Set([
            'xdp', 'preamble', 'config', 'template', 'localeSet',
            'datasets', 'form', 'connectionSet', 'sourceSet',
            'stylesheet', 'xmpmeta', 'signature', 'postamble', 'pdf'
        ]);

        function isStream(v) { return v && v.type === 'stream'; }
        function isStr(v) { return v && v.type === 'string'; }
        function isArr(v) { return v && v.type === 'array'; }

        function streamBytes(s) {
            if (!isStream(s)) {
                throw new ParseError('pdf/xfa/bad-packet',
                    'XFA packet must be a stream',
                    { context: { type: s && s.type } });
            }
            return s.raw;
        }

        function decodeString(v) {
            if (!isStr(v)) {
                throw new ParseError('pdf/xfa/bad-key',
                    'XFA array key must be a PDF string',
                    { context: { type: v && v.type } });
            }
            const b = v.value;
            if (b instanceof Uint8Array) return new TextDecoder('latin1').decode(b);
            return String(b);
        }

        function readXfa(xfa) {
            if (isStream(xfa)) {
                return {
                    _legacy: { xfa: { shape: 'stream', xdp: streamBytes(xfa) } }
                };
            }
            if (isArr(xfa)) {
                if (xfa.items.length % 2 !== 0) {
                    throw new ParseError('pdf/xfa/odd-array',
                        'XFA array must have even item count (key/stream pairs)',
                        { context: { length: xfa.items.length } });
                }
                const packets = {};
                const order = [];
                const unknown = [];
                for (let i = 0; i < xfa.items.length; i += 2) {
                    const key = decodeString(xfa.items[i]);
                    const bytes = streamBytes(xfa.items[i + 1]);
                    packets[key] = bytes;
                    order.push(key);
                    if (!KNOWN_PACKETS.has(key)) unknown.push(key);
                }
                return {
                    _legacy: {
                        xfa: { shape: 'array', packets, order, unknownPackets: unknown }
                    }
                };
            }
            throw new ParseError('pdf/xfa/bad-shape',
                '/XFA must be a stream or array',
                { context: { type: xfa && xfa.type } });
        }

        function isKnownPacket(name) {
            return KNOWN_PACKETS.has(String(name));
        }

        return {
            readXfa,
            isKnownPacket,
            KNOWN_PACKETS
        };
    }
};
