// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview XMP metadata stream typing per ISO 32000-2:2020 §14.3.2.
 *
 * The Catalog's `/Metadata` entry points to a stream object with
 * `/Type /Metadata` and `/Subtype /XML`. The stream content is an XMP
 * packet (an RDF/XML document); RDF parsing is out of scope here — we
 * only expose the raw bytes and the dict typing. `packet` writes one: the
 * PDF/A identification (`pdfaid`) and the document information fields,
 * for a document that claims a PDF/A profile.
 *
 * @module pdf/metadata/xmp
 */

/**
 * Module factory.
 */
import { pdfErrors } from '../errors.js';
import { pdfParser } from '../syntax/parser.js';

export const pdfXmp = {
    name: 'pdfXmp',
    dependencies: ['pdfErrors', 'pdfParser'],
    deps: [pdfErrors, pdfParser],
    factory(errors, parser) {
        const { ParseError, ContractError } = errors;
        const { isType } = parser;
        const te = new TextEncoder();

        /** `s` escaped for XML text. */
        function esc(s) {
            return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        }

        /**
         * A PDF date (`D:YYYY[MM[DD[HH[mm[SS]]]]][Z|±HH'mm']`, ISO 32000-2
         * § 7.9.4) as an XMP date (ISO 8601). Throws `pdf/xmp/bad-date`.
         */
        function xmpDate(key, value) {
            const m = /^D:(\d{4})(\d{2})?(\d{2})?(\d{2})?(\d{2})?(\d{2})?(Z|[+-]\d{2}(?:'\d{2}'?)?)?$/.exec(String(value));
            if (!m) {
                throw new ContractError('pdf/xmp/bad-date',
                    `xmp packet: ${key} is not a PDF date`,
                    { context: { key } });
            }
            const [, y, mo, d, h, mi, s, tz] = m;
            let out = y + (mo ? '-' + mo : '') + (mo && d ? '-' + d : '');
            if (mo && d && h) out += 'T' + h + ':' + (mi || '00') + ':' + (s || '00');
            if (mo && d && h && tz) out += tz === 'Z' ? 'Z' : tz.slice(0, 3) + ':' + (tz.slice(4, 6) || '00');
            return out;
        }

        /**
         * An XMP packet (UTF-8 bytes): `fields.pdfaid` (`part`, `rev`,
         * `conformance`, each when given), `fields.pdfuaid` (`part`, `rev`)
         * and the Info fields of
         * `fields.info` — Title (`dc:title`), Author (`dc:creator`),
         * Subject (`dc:description`), Keywords (`pdf:Keywords`), Creator
         * (`xmp:CreatorTool`), Producer (`pdf:Producer`), CreationDate and
         * ModDate (`xmp:CreateDate`, `xmp:ModifyDate`, from PDF dates).
         * Other keys are ignored.
         */
        function packet(fields) {
            const f = fields || {};
            const id = f.pdfaid || {};
            const info = f.info || {};
            const has = (k) => info[k] !== undefined && info[k] !== null;
            const props = [];
            if (id.part !== undefined) props.push(`<pdfaid:part>${esc(id.part)}</pdfaid:part>`);
            if (id.rev !== undefined) props.push(`<pdfaid:rev>${esc(id.rev)}</pdfaid:rev>`);
            if (id.conformance !== undefined) props.push(`<pdfaid:conformance>${esc(id.conformance)}</pdfaid:conformance>`);
            const ua = f.pdfuaid || {};
            if (ua.part !== undefined) props.push(`<pdfuaid:part>${esc(ua.part)}</pdfuaid:part>`);
            if (ua.rev !== undefined) props.push(`<pdfuaid:rev>${esc(ua.rev)}</pdfuaid:rev>`);
            const alt = (v) => `<rdf:Alt><rdf:li xml:lang="x-default">${esc(v)}</rdf:li></rdf:Alt>`;
            if (has('Title')) props.push(`<dc:title>${alt(info.Title)}</dc:title>`);
            if (has('Author')) props.push(`<dc:creator><rdf:Seq><rdf:li>${esc(info.Author)}</rdf:li></rdf:Seq></dc:creator>`);
            if (has('Subject')) props.push(`<dc:description>${alt(info.Subject)}</dc:description>`);
            if (has('Keywords')) props.push(`<pdf:Keywords>${esc(info.Keywords)}</pdf:Keywords>`);
            if (has('Producer')) props.push(`<pdf:Producer>${esc(info.Producer)}</pdf:Producer>`);
            if (has('Creator')) props.push(`<xmp:CreatorTool>${esc(info.Creator)}</xmp:CreatorTool>`);
            if (has('CreationDate')) props.push(`<xmp:CreateDate>${xmpDate('CreationDate', info.CreationDate)}</xmp:CreateDate>`);
            if (has('ModDate')) props.push(`<xmp:ModifyDate>${xmpDate('ModDate', info.ModDate)}</xmp:ModifyDate>`);
            const text = '<?xpacket begin="\uFEFF" id="W5M0MpCehiHzreSzNTczkc9d"?>\n'
                + '<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">'
                + '<rdf:Description rdf:about=""'
                + ' xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/" xmlns:pdfuaid="http://www.aiim.org/pdfua/ns/id/"'
                + ' xmlns:dc="http://purl.org/dc/elements/1.1/"'
                + ' xmlns:pdf="http://ns.adobe.com/pdf/1.3/" xmlns:xmp="http://ns.adobe.com/xap/1.0/">'
                + props.join('')
                + '</rdf:Description></rdf:RDF></x:xmpmeta>\n'
                + '<?xpacket end="w"?>';
            return te.encode(text);
        }

        function typeXmpStream(stream) {
            if (!isType(stream, 'stream')) {
                throw new ParseError('pdf/xmp/not-stream',
                    'XMP metadata must be a stream',
                    { context: { type: stream && stream.type } });
            }
            if (!stream.dict || stream.dict.type !== 'dict') {
                throw new ParseError('pdf/xmp/no-dict',
                    'XMP stream missing dict');
            }
            const e = stream.dict.entries;
            if (!e.Type || e.Type.type !== 'name' || e.Type.value !== 'Metadata') {
                throw new ParseError('pdf/xmp/bad-type',
                    '/Type must be /Metadata',
                    { context: { actual: e.Type && e.Type.value } });
            }
            if (!e.Subtype || e.Subtype.type !== 'name' || e.Subtype.value !== 'XML') {
                throw new ParseError('pdf/xmp/bad-subtype',
                    '/Subtype must be /XML',
                    { context: { actual: e.Subtype && e.Subtype.value } });
            }
            return {
                type: 'Metadata',
                subtype: 'XML',
                bytes: stream.raw,
                raw: stream
            };
        }

        return { typeXmpStream, packet };
    }
};
