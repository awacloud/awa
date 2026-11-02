// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * tools/convert/tests/pdf-fixtures.ts — first-party pdf and odt fixtures
 * for the `toMd` opt-in tests, written in memory through `@awacloud/oconv`'s
 * own runtime (its `pdf`, `pdfParser`, `pdfEncryptedWriter` and `oconv`
 * modules). Nothing here is read from disk.
 */

import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { fw_require as oconvFwRequire, modules as oconvModules } from '@awacloud/oconv';
import { toModuleDefinitions } from '../src/descriptors.ts';

/** The pdf object builders this file uses (`pdfParser`'s `obj`). */
interface PdfObj {
    dict(entries: Record<string, unknown>): unknown;
    name(n: string): unknown;
    int(n: number): unknown;
    ref(num: number, gen: number): unknown;
    array(items: unknown[]): unknown;
    stream(dict: unknown, bytes: Uint8Array): unknown;
}

interface Indirect {
    num: number;
    gen: number;
    value: unknown;
}

function runtime(): ModuleRuntime {
    const rt = new ModuleRuntime();
    rt.registerAll(toModuleDefinitions('@awacloud/oconv fw_require', oconvFwRequire));
    rt.registerAll(toModuleDefinitions('@awacloud/oconv modules', oconvModules));
    return rt;
}

/** A synthetic JPEG: the pdf reader passes `DCTDecode` bytes through on their `FF D8 FF` signature. */
export const JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xdb, 0x00, 0x04, 0x00, 0x00, 0xff, 0xd9]);

/** The text every fixture page carries. */
export const PAGE_TEXT = 'Fixture page text';

/** One untagged page, Standard 14 Helvetica, one line of text; `image` adds a JPEG XObject `/Im1` (object 7) drawn below it. */
function pageIndirects(obj: PdfObj, image: boolean): Indirect[] {
    const content = `BT /F1 12 Tf 72 720 Td (${PAGE_TEXT}) Tj ET\n` + (image ? 'q 100 0 0 100 72 500 cm /Im1 Do Q\n' : '');
    const bytes = new TextEncoder().encode(content);
    const resources: Record<string, unknown> = { Font: obj.dict({ F1: obj.ref(5, 0) }) };
    if (image) resources.XObject = obj.dict({ Im1: obj.ref(7, 0) });
    const list: Indirect[] = [
        { num: 1, gen: 0, value: obj.dict({ Type: obj.name('Catalog'), Pages: obj.ref(2, 0) }) },
        { num: 2, gen: 0, value: obj.dict({ Type: obj.name('Pages'), Kids: obj.array([obj.ref(3, 0)]), Count: obj.int(1) }) },
        {
            num: 3,
            gen: 0,
            value: obj.dict({
                Type: obj.name('Page'),
                Parent: obj.ref(2, 0),
                MediaBox: obj.array([obj.int(0), obj.int(0), obj.int(612), obj.int(792)]),
                Contents: obj.ref(4, 0),
                Resources: obj.dict(resources),
            }),
        },
        { num: 4, gen: 0, value: obj.stream(obj.dict({ Length: obj.int(bytes.length) }), bytes) },
        { num: 5, gen: 0, value: obj.dict({ Type: obj.name('Font'), Subtype: obj.name('Type1'), BaseFont: obj.name('Helvetica') }) },
    ];
    if (image) {
        list.push({
            num: 7,
            gen: 0,
            value: obj.stream(
                obj.dict({
                    Type: obj.name('XObject'),
                    Subtype: obj.name('Image'),
                    Width: obj.int(1),
                    Height: obj.int(1),
                    ColorSpace: obj.name('DeviceGray'),
                    BitsPerComponent: obj.int(8),
                    Filter: obj.name('DCTDecode'),
                    Length: obj.int(JPEG_BYTES.length),
                }),
                JPEG_BYTES,
            ),
        });
    }
    return list;
}

function writePdf(image: boolean): Uint8Array {
    const rt = runtime();
    const obj = (rt.resolve('pdfParser') as { obj: PdfObj }).obj;
    const pdf = rt.resolve('pdf') as { write(doc: object): Uint8Array };
    return pdf.write({ indirects: pageIndirects(obj, image), root: { num: 1, gen: 0 }, version: '1.7' });
}

/** The plain one-page pdf. */
export function plainPdf(): Uint8Array {
    return writePdf(false);
}

/** The page with a JPEG picture (asset `image-7.jpg` under `pdfInclude: ['images']`). */
export function jpegPdf(): Uint8Array {
    return writePdf(true);
}

/** The page AES-128 encrypted (V4 AESV2), user password `user`, owner password `owner`. Not R6: its key hardening is slow under `--coverage`. */
export function encryptedPdf(): Uint8Array {
    const rt = runtime();
    const obj = (rt.resolve('pdfParser') as { obj: PdfObj }).obj;
    const writer = rt.resolve('pdfEncryptedWriter') as { writeEncryptedDocument(doc: object): { bytes: Uint8Array } };
    let n = 7;
    const randomBytes = (len: number): Uint8Array => {
        const out = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            n = (Math.imul(n, 1103515245) + 12345) >>> 0;
            out[i] = n >>> 24;
        }
        return out;
    };
    return writer.writeEncryptedDocument({
        indirects: pageIndirects(obj, false),
        root: { num: 1, gen: 0 },
        encrypt: { version: 4, revision: 4, method: 'AESV2', ownerPassword: 'owner', userPassword: 'user', permissions: -4, randomBytes },
    }).bytes;
}

/** The plain page with a `startxref` offset that points past the end of the file. */
export function brokenXrefPdf(): Uint8Array {
    const text = new TextDecoder('latin1').decode(plainPdf());
    const broken = text.replace(/startxref\s+(\d+)/, (m, d: string) => m.replace(d, String(Number(d) + 100000)));
    if (broken === text) throw new Error('pdf-fixtures: no startxref to break');
    return Uint8Array.from(broken, (c) => c.charCodeAt(0));
}

/** A one-paragraph odt, written by oconv's own `fromMd`. */
export async function plainOdt(): Promise<Uint8Array> {
    const oconv = runtime().resolve('oconv') as { fromMd(req: object): Promise<{ bytes: Uint8Array }> };
    return (await oconv.fromMd({ markdown: `${PAGE_TEXT}\n`, target: 'odt' })).bytes;
}
