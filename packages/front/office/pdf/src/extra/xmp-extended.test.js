// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { pdfErrors } from '../errors.js';
const _pdfErrors_TD1 = pdfErrors.factory();
const { ParseError } = _pdfErrors_TD1;
import { pdfXmpExtended } from './xmp-extended.js';

const m = pdfXmpExtended.factory(_pdfErrors_TD1);

const SAMPLE = `<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
 <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
          xmlns:dc="http://purl.org/dc/elements/1.1/"
          xmlns:pdf="http://ns.adobe.com/pdf/1.3/"
          xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/">
  <rdf:Description rdf:about="">
   <dc:title>Hello</dc:title>
   <dc:creator>Alice</dc:creator>
   <pdf:Producer>awa</pdf:Producer>
   <pdfaid:part>2</pdfaid:part>
   <pdfaid:conformance>B</pdfaid:conformance>
  </rdf:Description>
 </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`;

describe('extra/xmp-extended', () => {
    test('extracts leaf values for known namespaces', () => {
        const r = m.parsePacket(SAMPLE);
        expect(r.grouped.dc.title).toBe('Hello');
        expect(r.grouped.dc.creator).toBe('Alice');
        expect(r.grouped.pdf.Producer).toBe('awa');
        expect(r.grouped.pdfaid.part).toBe('2');
        expect(r.grouped.pdfaid.conformance).toBe('B');
    });

    test('accepts Uint8Array input', () => {
        const bytes = new TextEncoder().encode(SAMPLE);
        const r = m.parsePacket(bytes);
        expect(r.pairs.length).toBeGreaterThan(0);
    });

    test('ignores unknown namespaces', () => {
        const r = m.parsePacket(`
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
         xmlns:foo="http://example.com/foo/">
  <rdf:Description><foo:bar>x</foo:bar></rdf:Description>
</rdf:RDF>`);
        expect(r.pairs.length).toBe(0);
    });

    test('groups repeated entries into arrays', () => {
        const r = m.parsePacket(`
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
         xmlns:dc="http://purl.org/dc/elements/1.1/">
  <rdf:Description>
    <dc:subject>a</dc:subject>
    <dc:subject>b</dc:subject>
  </rdf:Description>
</rdf:RDF>`);
        expect(r.grouped.dc.subject).toEqual(['a', 'b']);
    });

    test('decodes XML entities', () => {
        const r = m.parsePacket(`
<rdf:RDF xmlns:rdf="x" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <X><dc:title>A &amp; B &lt;c&gt;</dc:title></X>
</rdf:RDF>`);
        expect(r.grouped.dc.title).toBe('A & B <c>');
    });

    test('rejects bad input type', () => {
        expect(() => m.parsePacket(42)).toThrow(ParseError);
    });

    test('throws on unclosed tag', () => {
        expect(() => m.parsePacket(
            `<rdf:RDF xmlns:rdf="x" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>x</dc:RDF>`
        )).toThrow(ParseError);
    });

    test('factory shape', () => {
        expect(pdfXmpExtended.name).toBe('pdfXmpExtended');
        expect(pdfXmpExtended.dependencies).toEqual(['pdfErrors']);
        expect(pdfXmpExtended.factory.toString()).toContain('function');
    });
});
