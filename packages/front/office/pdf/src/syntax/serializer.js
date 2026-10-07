// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Serialize typed PDF objects back to bytes per
 * ISO 32000-2:2020 §7.3 / §7.5.
 *
 * Public API (via factory):
 *
 * - `serializeObject(obj)` → `Uint8Array`
 * - `serializeIndirect(num, gen, obj)` → `Uint8Array`
 * - `formatReal(n)` → `string`
 *
 * @module pdf/syntax/serializer
 */

/**
 * Module factory — worker-safe, self-contained.
 */
import { pdfErrors } from '../errors.js';

export const pdfSerializer = {
    name: 'pdfSerializer',
    dependencies: ['pdfErrors'],
    deps: [pdfErrors],
    factory(errors) {
        const { RenderError } = errors;
        const te = new TextEncoder();

        function serializeObject(obj) {
            if (!obj || typeof obj.type !== 'string') {
                throw new RenderError('pdf/serializer/bad-input',
                    'serializeObject expects a typed object',
                    { context: { typeof: typeof obj } });
            }
            return concat(emitObject(obj));
        }

        function serializeIndirect(num, gen, body) {
            if (!Number.isFinite(num) || num < 0) {
                throw new RenderError('pdf/serializer/bad-num',
                    'object number must be a non-negative integer',
                    { context: { num } });
            }
            if (!Number.isFinite(gen) || gen < 0) {
                throw new RenderError('pdf/serializer/bad-gen',
                    'generation number must be a non-negative integer',
                    { context: { gen } });
            }
            const head = te.encode(`${num | 0} ${gen | 0} obj\n`);
            const tail = te.encode('\nendobj\n');

            if (body && body.type === 'stream') {
                const raw = body.raw instanceof Uint8Array ? body.raw : new Uint8Array(0);
                const dict = body.dict || { type: 'dict', entries: {} };
                const updated = {
                    type: 'dict',
                    entries: {
                        ...dict.entries,
                        Length: { type: 'int', value: raw.length }
                    }
                };
                const dictBytes  = concat(emitObject(updated));
                const streamHead = te.encode('\nstream\n');
                const streamTail = te.encode('\nendstream');
                return concatU8([head, dictBytes, streamHead, raw, streamTail, tail]);
            }
            return concatU8([head, concat(emitObject(body)), tail]);
        }

        function formatReal(n) {
            if (!Number.isFinite(n)) {
                throw new RenderError('pdf/serializer/bad-real',
                    'real number must be finite', { context: { value: n } });
            }
            if (Number.isInteger(n)) {
                return `${n}`;
            }
            let s = n.toFixed(5);
            if (s.indexOf('.') >= 0) {
                s = s.replace(/0+$/, '');
                if (s.endsWith('.')) s = s.slice(0, -1);
            }
            if (s === '-0') s = '0';
            return s;
        }

        function emitObject(o) {
            switch (o.type) {
                case 'null':  return ['null'];
                case 'bool':  return [o.value ? 'true' : 'false'];
                case 'int':   return [`${o.value | 0}`];
                case 'real':  return [formatReal(o.value)];
                case 'name':  return [emitName(o.value)];
                case 'string':return [emitString(o)];
                case 'array': return emitArray(o);
                case 'dict':  return emitDict(o);
                case 'ref':   return [`${o.num | 0} ${o.gen | 0} R`];
                case 'stream':
                    throw new RenderError('pdf/serializer/inline-stream',
                        'stream objects must be serialized via serializeIndirect');
                default:
                    throw new RenderError('pdf/serializer/unknown-type',
                        `unknown object type "${o.type}"`,
                        { context: { type: o.type } });
            }
        }

        function emitName(value) {
            let out = '/';
            for (let i = 0; i < value.length; i++) {
                const cp = value.codePointAt(i);
                if (cp > 0xFFFF) i++;
                if (cp < 0x21 || cp > 0x7E
                        || cp === 0x23 || cp === 0x2F
                        || cp === 0x28 || cp === 0x29 || cp === 0x3C || cp === 0x3E
                        || cp === 0x5B || cp === 0x5D || cp === 0x7B || cp === 0x7D
                        || cp === 0x25) {
                    const enc = te.encode(String.fromCodePoint(cp));
                    for (const b of enc) out += '#' + b.toString(16).padStart(2, '0').toUpperCase();
                } else {
                    out += String.fromCharCode(cp);
                }
            }
            return out;
        }

        function emitString(o) {
            const bytes = o.value;
            if (!(bytes instanceof Uint8Array)) {
                throw new RenderError('pdf/serializer/bad-string',
                    'string value must be Uint8Array',
                    { context: { typeof: typeof bytes } });
            }
            if (o.syntax === 'hex' || shouldUseHex(bytes)) return emitHexString(bytes);
            return emitLiteralString(bytes);
        }

        function shouldUseHex(bytes) {
            let bad = 0;
            for (let i = 0; i < bytes.length; i++) {
                const b = bytes[i];
                if (b < 0x09 || (b > 0x0D && b < 0x20) || b >= 0x7F) bad++;
                if (bad > bytes.length / 4) return true;
            }
            return false;
        }

        function emitLiteralString(bytes) {
            const out = ['('];
            for (let i = 0; i < bytes.length; i++) {
                const b = bytes[i];
                if (b === 0x5C) out.push('\\\\');
                else if (b === 0x28) out.push('\\(');
                else if (b === 0x29) out.push('\\)');
                else if (b === 0x0A) out.push('\\n');
                else if (b === 0x0D) out.push('\\r');
                else if (b === 0x09) out.push('\\t');
                else if (b === 0x08) out.push('\\b');
                else if (b === 0x0C) out.push('\\f');
                else if (b < 0x20 || b > 0x7E) {
                    out.push('\\' + b.toString(8).padStart(3, '0'));
                } else out.push(String.fromCharCode(b));
            }
            out.push(')');
            return out.join('');
        }

        function emitHexString(bytes) {
            const H = '0123456789ABCDEF';
            let s = '<';
            for (let i = 0; i < bytes.length; i++) {
                s += H[bytes[i] >> 4] + H[bytes[i] & 0xF];
            }
            return s + '>';
        }

        function emitArray(o) {
            const parts = ['['];
            let first = true;
            for (const it of o.items) {
                if (!first) parts.push(' ');
                first = false;
                for (const p of emitObject(it)) parts.push(p);
            }
            parts.push(']');
            return parts;
        }

        function emitDict(o) {
            const parts = ['<<'];
            for (const k of Object.keys(o.entries)) {
                parts.push(' ');
                parts.push(emitName(k));
                parts.push(' ');
                for (const p of emitObject(o.entries[k])) parts.push(p);
            }
            parts.push(' >>');
            return parts;
        }

        function concat(parts) {
            let s = '';
            for (const p of parts) s += p;
            return te.encode(s);
        }

        function concatU8(arrays) {
            let n = 0;
            for (const a of arrays) n += a.length;
            const out = new Uint8Array(n);
            let o = 0;
            for (const a of arrays) { out.set(a, o); o += a.length; }
            return out;
        }

        return { serializeObject, serializeIndirect, formatReal };
    }
};
