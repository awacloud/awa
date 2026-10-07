// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * Worker integration test — `src/worker.js`'s F6 message contract
 * (`ai/plans/oconv/spikes/w0-core/FINDINGS.md` Axis 4, verbatim): one
 * conversion is one message, `{ id, name, bytes: ArrayBuffer, at?, sha256? }`
 * in (bytes transferred), `{ id, ms, error, chars, warnings, losses, markdown }`
 * out — errors returned as DATA, never thrown across the boundary.
 *
 * Spawns the REAL worker file via
 * `new Worker(new URL('../src/worker.js', import.meta.url), { type: 'module' })`
 * under Bun — the same call a browser host makes (no host branch in the
 * worker source).
 */
/* global Bun */
import { describe, test, expect, beforeAll } from 'bun:test';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { fw_require, modules } from '../src/main.js';
// office/BATCH_38 task 05 (BL-1267) — this HOST-side test loads the REAL
// vendored face pack to post over the worker envelope; the worker file
// itself never imports `@awacloud/oconv-fonts` (checked by the static pin
// below, over `src/worker.js`'s own source).
import { loadDefaultFaces } from '../../oconv-fonts/src/loader.js';

const FIXED_AT = '2026-07-20T00:00:00Z';

// One in-thread runtime, used only to build fixture bytes (never to run the
// conversion itself — that's the worker's job, under test).
const fixtureRuntime = new ModuleRuntime();
fixtureRuntime.registerAll(fw_require);
fixtureRuntime.registerAll(modules);
const docxApi = fixtureRuntime.resolve('docx');
const odtApi = fixtureRuntime.resolve('odt');
const xlsxApi = fixtureRuntime.resolve('xlsx');
const pdfApi = fixtureRuntime.resolve('pdf');

function docxFixtureBytes() {
    return docxApi.write({
        body: [
            docxApi.paragraph('Hello worker', { pPr: { pStyle: 'Heading1' } }),
            docxApi.paragraph('Converted off the main thread.')
        ]
    });
}

/** A W2 format (BATCH_14) — one sheet, two rows, no losses. */
function xlsxFixtureBytes() {
    return xlsxApi.write({
        sheets: [{
            name: 'Worker',
            rows: [['Name', 'Score'], ['Alice', 10]]
        }]
    });
}

/** A fresh, independently-owned `ArrayBuffer` copy, safe to transfer. */
function transferableCopy(bytes) {
    return bytes.slice().buffer;
}

function spawnWorker() {
    return new Worker(new URL('../src/worker.js', import.meta.url), { type: 'module' });
}

function nextMessage(worker) {
    return new Promise((resolve) => {
        worker.onmessage = (ev) => resolve(ev.data);
    });
}

describe('oconv worker — F6 message contract', () => {
    test('a valid docx message returns a valid reply', async () => {
        const worker = spawnWorker();
        try {
            const reply = nextMessage(worker);
            const buffer = transferableCopy(docxFixtureBytes());
            worker.postMessage(
                { id: 1, name: 'hello.docx', bytes: buffer, at: FIXED_AT },
                [buffer]
            );
            const data = await reply;

            expect(data.id).toBe(1);
            expect(data.error).toBeNull();
            expect(typeof data.ms).toBe('number');
            expect(data.chars).toBeGreaterThan(0);
            expect(data.warnings).toBe(0);
            expect(typeof data.markdown).toBe('string');
            expect(data.markdown).toContain('Hello worker');
            expect(data.markdown).toContain('sourceFormat: docx');
        } finally {
            worker.terminate();
        }
    });

    // BATCH_14 W2: at least one new (non-W1) input format through the
    // worker path, F6 shape unchanged — same message contract as docx.
    test('a valid xlsx message returns a valid reply (W2 format, F6 shape intact)', async () => {
        const worker = spawnWorker();
        try {
            const reply = nextMessage(worker);
            const buffer = transferableCopy(xlsxFixtureBytes());
            worker.postMessage(
                { id: 4, name: 'sheet.xlsx', bytes: buffer, at: FIXED_AT },
                [buffer]
            );
            const data = await reply;

            expect(data.id).toBe(4);
            expect(data.error).toBeNull();
            expect(typeof data.ms).toBe('number');
            expect(data.chars).toBeGreaterThan(0);
            expect(data.warnings).toBe(0);
            expect(typeof data.markdown).toBe('string');
            expect(data.markdown).toContain('Worker');
            expect(data.markdown).toContain('Alice');
            expect(data.markdown).toContain('sourceFormat: xlsx');
        } finally {
            worker.terminate();
        }
    });

    test('corrupt bytes return an error as data, never a thrown exception', async () => {
        const worker = spawnWorker();
        try {
            const reply = nextMessage(worker);
            const buffer = new Uint8Array([1, 2, 3, 4]).buffer;
            worker.postMessage(
                { id: 2, name: 'bad.docx', bytes: buffer, at: FIXED_AT },
                [buffer]
            );
            const data = await reply;

            expect(data.id).toBe(2);
            expect(typeof data.error).toBe('string');
            expect(data.chars).toBe(0);
            expect(data.warnings).toBe(0);
            expect(data.markdown).toBeNull();
        } finally {
            worker.terminate();
        }
    });

    test('the transferred buffer is detached on the caller side', async () => {
        const worker = spawnWorker();
        try {
            const reply = nextMessage(worker);
            const buffer = transferableCopy(docxFixtureBytes());
            worker.postMessage(
                { id: 3, name: 'x.docx', bytes: buffer, at: FIXED_AT },
                [buffer]
            );
            expect(buffer.byteLength).toBe(0);
            await reply;
        } finally {
            worker.terminate();
        }
    });
});

// office/BATCH_26 task 04 — additive fromMd message kind (owner ruling 2:
// the toMd envelope above stays byte-unchanged, proven by the unmodified
// tests in the describe block above running green, unedited, in this same
// file).
describe('oconv worker — fromMd (additive message kind)', () => {
    test('a fromMd message routes past the toMd discriminator and returns bytes docx.read can parse', async () => {
        const worker = spawnWorker();
        try {
            const reply = nextMessage(worker);
            worker.postMessage({
                id: 10, name: 'out.docx', markdown: '# Worker Title\n\nFrom the worker.'
            });
            const data = await reply;

            expect(data.id).toBe(10);
            expect(data.error).toBeNull();
            expect(typeof data.ms).toBe('number');
            expect(data.warnings).toBe(0);
            expect(data.bytes).not.toBeNull();

            const read = docxApi.read(new Uint8Array(data.bytes));
            expect(read.document.body[0].pPr.pStyle).toBe('Heading1');
            expect(read.document.body[0].children[0].children[0].value)
                .toBe('Worker Title');
        } finally {
            worker.terminate();
        }
    });

    test('a fromMd message with an unresolvable target returns the error as data, never a thrown exception', async () => {
        const worker = spawnWorker();
        try {
            const reply = nextMessage(worker);
            worker.postMessage({ id: 11, name: 'x.rtf', markdown: '# T' });
            const data = await reply;

            expect(data.id).toBe(11);
            expect(typeof data.error).toBe('string');
            expect(data.error).toMatch(/oconv: unsupported target/);
            expect(data.bytes).toBeNull();
            expect(data.warnings).toBe(0);
        } finally {
            worker.terminate();
        }
    });

    test('the pre-existing toMd message shape is byte-identical after the fromMd addition (regression)', async () => {
        const worker = spawnWorker();
        try {
            const reply = nextMessage(worker);
            const buffer = transferableCopy(docxFixtureBytes());
            worker.postMessage(
                { id: 12, name: 'again.docx', bytes: buffer, at: FIXED_AT },
                [buffer]
            );
            const data = await reply;

            expect(Object.keys(data).sort()).toEqual(
                ['chars', 'error', 'id', 'losses', 'markdown', 'ms', 'warnings'].sort()
            );
            expect(data.id).toBe(12);
            expect(data.error).toBeNull();
            expect(data.markdown).toContain('Hello worker');
        } finally {
            worker.terminate();
        }
    });

    // office/BATCH_33 task 07 — the `pdf` target crosses the worker boundary
    // unchanged. The whole `md → pdf` pipeline is pure composition, so the
    // only thing worth proving is that the bytes survive the structured
    // clone and still parse as a PDF on the main thread.
    test('a fromMd message with target pdf returns bytes pdf.read can parse', async () => {
        const worker = spawnWorker();
        try {
            const reply = nextMessage(worker);
            worker.postMessage({
                id: 13, name: 'out.pdf',
                markdown: '# Worker PDF\n\nTypeset off the main thread.'
            });
            const data = await reply;

            expect(data.id).toBe(13);
            expect(data.error).toBeNull();
            expect(data.warnings).toBe(0);
            expect(data.bytes).not.toBeNull();

            const doc = pdfApi.read(new Uint8Array(data.bytes));
            expect(doc.pages.length).toBe(1);

            // And the bytes are IDENTICAL to what the main thread produces:
            // the pdf target is deterministic, so the worker leg is not a
            // second, subtly different pipeline.
            const inThread = await fixtureRuntime.resolve('oconv').fromMd({
                name: 'out.pdf',
                markdown: '# Worker PDF\n\nTypeset off the main thread.'
            });
            const fromWorker = new Uint8Array(data.bytes);
            expect(fromWorker.length).toBe(inThread.bytes.length);
            expect(fromWorker.every((v, i) => v === inThread.bytes[i])).toBe(true);
        } finally {
            worker.terminate();
        }
    });
});

// office/LIGHT_2 task 02 (BL-1007) — `opts` crosses the worker boundary, so
// the typesetter's option block is reachable off the main thread. The
// forwarding is CONDITIONAL on the caller having sent the key, which is what
// keeps the `fromMd` legs above byte-equivalent in behaviour; the `toMd`
// envelope is untouched by construction (a different handler).
describe('oconv worker — fromMd forwards `opts` (BL-1007)', () => {
    const MD = '# Worker PDF\n\nTypeset off the main thread.';

    /** Latin-1 view of the emitted bytes — a PDF header is not UTF-8. */
    function latin1(bytes) {
        let out = '';
        for (const b of bytes) out += String.fromCharCode(b);
        return out;
    }

    /** The one `/MediaBox` array the document declares, as written. */
    function mediaBox(bytes) {
        const found = latin1(bytes).match(/\/MediaBox[^\]]*\]/g);
        expect(found).toHaveLength(1);
        return found[0];
    }

    /** One request in, one reply out, on a worker of its own. */
    async function ask(message) {
        const worker = spawnWorker();
        try {
            const reply = nextMessage(worker);
            worker.postMessage(message);
            return await reply;
        } finally {
            worker.terminate();
        }
    }

    test('`opts.pdf` reaches the typesetter — the same markdown lays out on Letter instead of A4', async () => {
        const [dflt, letter] = await Promise.all([
            ask({ id: 20, name: 'out.pdf', markdown: MD }),
            ask({ id: 21, name: 'out.pdf', markdown: MD, opts: { pdf: { pageSize: 'Letter' } } })
        ]);

        expect(dflt.error).toBeNull();
        expect(letter.error).toBeNull();
        expect(dflt.bytes).toBeInstanceOf(Uint8Array);
        expect(letter.bytes).toBeInstanceOf(Uint8Array);

        // The option CHANGED the output — not merely "was accepted".
        expect(latin1(letter.bytes)).not.toBe(latin1(dflt.bytes));

        // MEASURED literals, read out of the produced bytes rather than
        // assumed: the writer emits A4 as `595.276 841.89` and US Letter as
        // the integral `612 792` (no trailing `.0`).
        expect(mediaBox(dflt.bytes)).toBe('/MediaBox [0 0 595.276 841.89]');
        expect(mediaBox(letter.bytes)).toBe('/MediaBox [0 0 612 792]');
    });

    test('a bad pdf option comes back as DATA in `error`, never thrown across the boundary', async () => {
        const data = await ask({
            id: 22, name: 'out.pdf', markdown: MD, opts: { pdf: { bogus: 1 } }
        });
        expect(data.id).toBe(22);
        expect(typeof data.error).toBe('string');
        expect(data.error).toContain('bad pdf option bogus');
        expect(data.bytes).toBeNull();
        expect(data.warnings).toBe(0);
    });

    test('`opts.pdf` on a non-pdf target returns the facade\'s own refusal as data', async () => {
        const data = await ask({
            id: 23, name: 'out.docx', target: 'docx', markdown: MD,
            opts: { pdf: { pageSize: 'Letter' } }
        });
        expect(data.id).toBe(23);
        expect(typeof data.error).toBe('string');
        expect(data.error).toContain('pdf options need target pdf');
        expect(data.bytes).toBeNull();
    });
});

describe('oconv worker — fromMd forwards `assets` (BL-980)', () => {
    const MD = '# Worker Image\n\n![Alt](diagram.png)\n';
    const ASSET_DIR = new URL('./_fixtures/corpus/assets/', import.meta.url);

    /** One request in, one reply out, on a worker of its own. */
    async function ask(message) {
        const worker = spawnWorker();
        try {
            const reply = nextMessage(worker);
            worker.postMessage(message);
            return await reply;
        } finally {
            worker.terminate();
        }
    }

    /** Latin-1 view of the emitted bytes. */
    function latin1(bytes) {
        let out = '';
        for (const b of bytes) out += String.fromCharCode(b);
        return out;
    }

    test('`assets` survives structured clone and reaches the docx writer', async () => {
        const png = new Uint8Array(
            await Bun.file(new URL('px.png', ASSET_DIR)).arrayBuffer()
        );
        const [bare, withAssets] = await Promise.all([
            ask({ id: 30, name: 'out.docx', markdown: MD }),
            ask({ id: 31, name: 'out.docx', markdown: MD, assets: { 'diagram.png': png } })
        ]);

        expect(bare.error).toBeNull();
        expect(withAssets.error).toBeNull();
        // Without the manifest the image is dropped; with it, it is placed.
        expect(Object.keys(docxApi.read(new Uint8Array(bare.bytes)).images)).toHaveLength(0);
        expect(Object.keys(docxApi.read(new Uint8Array(withAssets.bytes)).images)).toHaveLength(1);
        // Both record exactly one image loss — a drop, then a degrade.
        expect(bare.warnings).toBe(1);
        expect(withAssets.warnings).toBe(1);
    });

    test('`assets` reaches the pdf typesetter — a JPEG is PLACED off the main thread', async () => {
        const jpeg = new Uint8Array(
            await Bun.file(new URL('px.jpg', ASSET_DIR)).arrayBuffer()
        );
        const reply = await ask({
            id: 32, name: 'out.pdf', markdown: MD, assets: { 'diagram.png': jpeg }
        });

        expect(reply.error).toBeNull();
        expect(reply.warnings).toBe(0);
        expect(latin1(new Uint8Array(reply.bytes))).toContain('/Im0 Do Q');
    });

    test('a malformed `assets` comes back as DATA in `error`, never thrown across the boundary', async () => {
        const reply = await ask({
            id: 33, name: 'out.docx', markdown: MD, assets: { 'diagram.png': [1, 2, 3] }
        });
        expect(reply.error).toBe('oconv: bad assets');
        expect(reply.bytes).toBeNull();
    });

    test('a message WITHOUT `assets` produces a reply of exactly the same key shape', async () => {
        const png = new Uint8Array(
            await Bun.file(new URL('px.png', ASSET_DIR)).arrayBuffer()
        );
        const [bare, withAssets] = await Promise.all([
            ask({ id: 34, name: 'out.docx', markdown: MD }),
            ask({ id: 35, name: 'out.docx', markdown: MD, assets: { 'diagram.png': png } })
        ]);
        const KEYS = ['bytes', 'error', 'id', 'losses', 'ms', 'warnings'];
        expect(Object.keys(bare).sort()).toEqual(KEYS);
        expect(Object.keys(withAssets).sort()).toEqual(KEYS);
    });
});

// office/BATCH_35 task 04 — additive third message kind. The `toMd` and
// `fromMd` envelopes above are untouched by construction (the three-way
// discriminator checks `data.markdown` first, `data.target` second — a
// convert message carries neither `markdown` nor a `bytes`-less shape, so
// it can never be mistaken for either of the other two).
describe('oconv worker — convert (additive third message kind)', () => {
    test('a docx -> odt convert message routes past both discriminators and returns bytes odt.read can parse', async () => {
        const worker = spawnWorker();
        try {
            const reply = nextMessage(worker);
            const buffer = transferableCopy(docxFixtureBytes());
            worker.postMessage(
                { id: 40, name: 'hello.docx', bytes: buffer, target: 'odt' },
                [buffer]
            );
            const data = await reply;

            expect(data.id).toBe(40);
            expect(data.error).toBeNull();
            expect(typeof data.ms).toBe('number');
            expect(data.warnings).toBe(0);
            expect(data.bytes).not.toBeNull();

            const read = odtApi.read(new Uint8Array(data.bytes));
            expect(read.body[0].type).toBe('heading');
        } finally {
            worker.terminate();
        }
    });

    test('an unsupported pair comes back as an error in the reply data, never a thrown exception', async () => {
        const worker = spawnWorker();
        try {
            const reply = nextMessage(worker);
            const buffer = transferableCopy(docxFixtureBytes());
            worker.postMessage(
                { id: 41, name: 'hello.docx', bytes: buffer, target: 'docx' },
                [buffer]
            );
            const data = await reply;

            expect(data.id).toBe(41);
            expect(typeof data.error).toBe('string');
            expect(data.error).toMatch(/oconv: unsupported pair/);
            expect(data.bytes).toBeNull();
            expect(data.warnings).toBe(0);
        } finally {
            worker.terminate();
        }
    });

    test('a convert message reply carries exactly the fromMd reply key set', async () => {
        const worker = spawnWorker();
        try {
            const reply = nextMessage(worker);
            const buffer = transferableCopy(docxFixtureBytes());
            worker.postMessage(
                { id: 42, name: 'hello.docx', bytes: buffer, target: 'odt' },
                [buffer]
            );
            const data = await reply;

            expect(Object.keys(data).sort()).toEqual(
                ['bytes', 'error', 'id', 'losses', 'ms', 'warnings'].sort()
            );
        } finally {
            worker.terminate();
        }
    });

    test('the pre-existing toMd and fromMd message shapes are byte-identical after the convert addition (regression)', async () => {
        const toMdWorker = spawnWorker();
        try {
            const toMdReply = nextMessage(toMdWorker);
            const buffer = transferableCopy(docxFixtureBytes());
            toMdWorker.postMessage(
                { id: 43, name: 'again.docx', bytes: buffer, at: FIXED_AT },
                [buffer]
            );
            const toMdData = await toMdReply;
            expect(Object.keys(toMdData).sort()).toEqual(
                ['chars', 'error', 'id', 'losses', 'markdown', 'ms', 'warnings'].sort()
            );
            expect(toMdData.error).toBeNull();
        } finally {
            toMdWorker.terminate();
        }

        const fromMdWorker = spawnWorker();
        try {
            const fromMdReply = nextMessage(fromMdWorker);
            fromMdWorker.postMessage({ id: 44, name: 'out.docx', markdown: '# T' });
            const fromMdData = await fromMdReply;
            expect(Object.keys(fromMdData).sort()).toEqual(
                ['bytes', 'error', 'id', 'losses', 'ms', 'warnings'].sort()
            );
            expect(fromMdData.error).toBeNull();
        } finally {
            fromMdWorker.terminate();
        }
    });
});

// BATCH_39 task 04 (claim pinning, FINDINGS § 5.4 C30) — `handleConvert`
// (`src/worker.js:129,136`) unconditionally threads `format` and
// `includeNotes` into the `convert()` request object (unlike `opts`/
// `defaultFaces`, which are conditional on the key being present), and
// `opts` conditionally, same discipline as `fromMd`. Every convert worker
// test above sends `{id, name, bytes, target}` only — none of the three
// fields had a producing test before this one.
describe('oconv worker — convert forwards `format`, `includeNotes`, `opts` (C30)', () => {
    /** One request in, one reply out, on a worker of its own. */
    async function ask(message) {
        const worker = spawnWorker();
        try {
            const reply = nextMessage(worker);
            worker.postMessage(message);
            return await reply;
        } finally {
            worker.terminate();
        }
    }

    /** Latin-1 view of the emitted bytes — a PDF header is not UTF-8. */
    function latin1(bytes) {
        let out = '';
        for (const b of bytes) out += String.fromCharCode(b);
        return out;
    }

    test('`format` overrides name-extension detection — an unrecognised extension succeeds only WITH it', async () => {
        const withFormat = await ask({
            id: 60, name: 'payload.bin', bytes: transferableCopy(docxFixtureBytes()),
            target: 'odt', format: 'docx'
        });
        expect(withFormat.error).toBeNull();
        expect(withFormat.bytes).not.toBeNull();
        const read = odtApi.read(new Uint8Array(withFormat.bytes));
        expect(read.body[0].type).toBe('heading');

        // Non-vacuity: the SAME message, minus the explicit `format`, cannot
        // resolve a format from `payload.bin`'s extension and is refused —
        // proving `format` really reached `convert()`, not merely accepted.
        const withoutFormat = await ask({
            id: 61, name: 'payload.bin', bytes: transferableCopy(docxFixtureBytes()), target: 'odt'
        });
        expect(withoutFormat.error).toBe('oconv: unsupported format');
        expect(withoutFormat.bytes).toBeNull();
    });

    test('`opts.pdf` reaches the typesetter through convert — Letter vs default MediaBox (mirrors the fromMd BL-1007 leg)', async () => {
        const [dflt, letter] = await Promise.all([
            ask({ id: 62, name: 'hello.docx', bytes: transferableCopy(docxFixtureBytes()), target: 'pdf' }),
            ask({
                id: 63, name: 'hello.docx', bytes: transferableCopy(docxFixtureBytes()), target: 'pdf',
                opts: { pdf: { pageSize: 'Letter' } }
            })
        ]);
        expect(dflt.error).toBeNull();
        expect(letter.error).toBeNull();
        // The option CHANGED the output, same measured literals as the
        // fromMd leg above (A4 vs US Letter, no trailing `.0`).
        expect(latin1(new Uint8Array(dflt.bytes))).toContain('/MediaBox [0 0 595.276 841.89]');
        expect(latin1(new Uint8Array(letter.bytes))).toContain('/MediaBox [0 0 612 792]');
        expect(latin1(new Uint8Array(letter.bytes))).not.toBe(latin1(new Uint8Array(dflt.bytes)));
    });

    test('`includeNotes` is threaded through without error, but is a no-op for every SHIPPED convert pair', async () => {
        // `oconv.js`'s `readToIr` only consults `includeNotes` on the
        // `pptx`/`odp` branches, and `SUPPORTED_PAIRS` never carries either
        // as a `convert` source (docx/odt/pdf only) — so, unlike `opts`
        // above, this field cannot change a `convert` reply's bytes today
        // (the same fact `docs/convert.md`'s C33 claim states). The
        // producing test for THIS claim (C30, forwarding) is therefore that
        // the field is accepted with no error and the reply is otherwise
        // byte-identical with and without it — never that it is unknown or
        // rejected.
        const [withoutNotes, withNotes] = await Promise.all([
            ask({ id: 64, name: 'hello.docx', bytes: transferableCopy(docxFixtureBytes()), target: 'odt' }),
            ask({
                id: 65, name: 'hello.docx', bytes: transferableCopy(docxFixtureBytes()), target: 'odt',
                includeNotes: true
            })
        ]);
        expect(withoutNotes.error).toBeNull();
        expect(withNotes.error).toBeNull();
        const a = new Uint8Array(withoutNotes.bytes);
        const b = new Uint8Array(withNotes.bytes);
        expect(b.length).toBe(a.length);
        expect(b.every((v, i) => v === a[i])).toBe(true);
    });
});

// office/BATCH_38 task 05 (BL-1267 hard constraint) — the `oconvDefaultFaces`
// descriptor closes over its bytes inside `factory()` and is main-thread-
// only, so a worker never sees the registration. The HOST resolves the real
// face pack on its own thread (here, via `loadDefaultFaces()`) and POSTS the
// bytes as a `defaultFaces` envelope field on `fromMd` and `convert`,
// forwarded VERBATIM and only when present — same discipline as `opts` and
// `assets` above.
describe('oconv worker — fromMd/convert forward `defaultFaces` (BL-1267)', () => {
    /** One request in, one reply out, on a worker of its own. */
    async function ask(message) {
        const worker = spawnWorker();
        try {
            const reply = nextMessage(worker);
            worker.postMessage(message);
            return await reply;
        } finally {
            worker.terminate();
        }
    }

    /** Latin-1 view of the emitted bytes — a PDF header is not UTF-8. */
    function latin1(bytes) {
        let out = '';
        for (const b of bytes) out += String.fromCharCode(b);
        return out;
    }

    /** @type {Readonly<{regular: Uint8Array, bold: Uint8Array, italic: Uint8Array, boldItalic: Uint8Array, mono: Uint8Array}>} */
    let realFaces;

    beforeAll(async () => {
        realFaces = await loadDefaultFaces();
    });

    test('a fromMd pdf message carrying defaultFaces embeds the posted faces', async () => {
        const reply = await ask({
            id: 50, name: 'out.pdf',
            markdown: '# Worker Default Faces\n\nPosted off the main thread.',
            defaultFaces: { ...realFaces }
        });
        expect(reply.error).toBeNull();
        expect(reply.bytes).not.toBeNull();

        const bytes = latin1(new Uint8Array(reply.bytes));
        expect(bytes).toContain('/FontFile2');
        expect(bytes).toMatch(/\/BaseFont \/[A-Z0-9]{6}\+LiberationSans/);

        const doc = pdfApi.read(new Uint8Array(reply.bytes));
        expect(doc.pages.length).toBeGreaterThanOrEqual(1);
    });

    test('a convert docx->pdf message carrying defaultFaces embeds the posted faces', async () => {
        const buffer = transferableCopy(docxFixtureBytes());
        const reply = await ask({
            id: 51, name: 'hello.docx', bytes: buffer, target: 'pdf',
            defaultFaces: { ...realFaces }
        });
        expect(reply.error).toBeNull();
        expect(reply.bytes).not.toBeNull();

        const bytes = latin1(new Uint8Array(reply.bytes));
        expect(bytes).toContain('/FontFile2');
        expect(bytes).toMatch(/\/BaseFont \/[A-Z0-9]{6}\+LiberationSans/);
    });

    test('a malformed defaultFaces comes back as DATA in `error`, never thrown across the boundary', async () => {
        const reply = await ask({
            id: 52, name: 'out.pdf', markdown: '# T', defaultFaces: { regular: [1, 2, 3] }
        });
        expect(reply.error).toBe('oconv: bad default faces');
        expect(reply.bytes).toBeNull();
    });

    test('defaultFaces on a non-pdf target comes back as the facade\'s own refusal, as data', async () => {
        const reply = await ask({
            id: 53, name: 'out.docx', target: 'docx', markdown: '# T',
            defaultFaces: { regular: realFaces.regular }
        });
        expect(reply.error).toBe('oconv: default faces need target pdf');
        expect(reply.bytes).toBeNull();
    });

    test('a message WITHOUT `defaultFaces` produces a reply of exactly the same key shape (regression)', async () => {
        const [bare, withFaces] = await Promise.all([
            ask({ id: 54, name: 'out.pdf', markdown: '# T' }),
            ask({ id: 55, name: 'out.pdf', markdown: '# T', defaultFaces: { ...realFaces } })
        ]);
        const KEYS = ['bytes', 'error', 'id', 'losses', 'ms', 'warnings'];
        expect(Object.keys(bare).sort()).toEqual(KEYS);
        expect(Object.keys(withFaces).sort()).toEqual(KEYS);
        expect(bare.error).toBeNull();
        expect(withFaces.error).toBeNull();
    });
});

describe('oconv worker — BL-1267 static pin', () => {
    test('src/worker.js contains no `.serialize(` and no `registerDeep(` call', async () => {
        const src = await Bun.file(
            new URL('../src/worker.js', import.meta.url)
        ).text();
        expect(src).not.toContain('.serialize(');
        expect(src).not.toContain('registerDeep(');
    });
});

// office/BATCH_54 task 04 (BL-1337, BL-1636) — the three reply shapes carry
// the facade's `losses` array, structured-cloned; `warnings` stays the count.
// Falsification: every "exact reply key set" pin above lists `losses`, so
// removing the key from any handler in `src/worker.js` fails those tests.
describe('oconv worker — the reply carries the full `losses` array', () => {
    async function ask(message, transfer) {
        const worker = spawnWorker();
        try {
            const reply = nextMessage(worker);
            worker.postMessage(message, transfer || []);
            return await reply;
        } finally {
            worker.terminate();
        }
    }

    test('a lossy toMd replies the two list/numbering-unresolved records, warnings === 2', async () => {
        const bytes = new Uint8Array(await Bun.file(
            new URL('./_fixtures/corpus/docx/docx-structured.docx', import.meta.url)
        ).arrayBuffer());
        const buffer = transferableCopy(bytes);
        const data = await ask(
            { id: 60, name: 'docx-structured.docx', bytes: buffer, at: FIXED_AT },
            [buffer]
        );

        expect(data.error).toBeNull();
        expect(data.warnings).toBe(2);
        expect(data.losses).toEqual([
            { code: 'list/numbering-unresolved', detail: 'numId 1' },
            { code: 'list/numbering-unresolved', detail: 'numId 2' }
        ]);
        expect(data.warnings).toBe(data.losses.length);
    });

    test('a lossy fromMd (front matter fence, docx target) replies frontmatter/stripped', async () => {
        const data = await ask({
            id: 61, name: 'out.docx',
            markdown: '---\ntitle: Doc\n---\n\n# Title\n\nBody.\n'
        });

        expect(data.error).toBeNull();
        expect(data.losses[0].code).toBe('frontmatter/stripped');
        expect(data.warnings).toBe(data.losses.length);
        expect(data.warnings).toBeGreaterThan(0);
    });

    test('a lossy convert replies the facade losses array too, identical in shape to fromMd', async () => {
        const bytes = new Uint8Array(await Bun.file(
            new URL('./_fixtures/corpus/docx/docx-structured.docx', import.meta.url)
        ).arrayBuffer());
        const buffer = transferableCopy(bytes);
        const data = await ask(
            { id: 62, name: 'docx-structured.docx', bytes: buffer, target: 'odt' },
            [buffer]
        );

        expect(data.error).toBeNull();
        expect(Array.isArray(data.losses)).toBe(true);
        expect(data.warnings).toBe(data.losses.length);
        const inThread = await fixtureRuntime.resolve('oconv').convert({
            name: 'docx-structured.docx', bytes, target: 'odt'
        });
        expect(data.losses).toEqual(inThread.losses);
    });

    test('an OBJECT detail (pdf writer) survives the structured clone', async () => {
        const data = await ask({
            id: 63, name: 'out.pdf', markdown: '# T\n\n![alt](missing.png)\n'
        });

        expect(data.error).toBeNull();
        const dropped = data.losses.find((l) => l.code === 'layout/image-dropped');
        expect(dropped).toBeDefined();
        expect(typeof dropped.detail).toBe('object');
        expect(dropped.detail.reason).toBe('no-bytes');
        expect(data.warnings).toBe(data.losses.length);
    });

    test('on error `losses` is [], `warnings` 0 and `error` a string — all three kinds', async () => {
        const buffer = transferableCopy(docxFixtureBytes());
        const replies = await Promise.all([
            ask({ id: 64, name: 'x.rtf', markdown: '# T' }),
            ask({ id: 65, name: 'hello.docx', bytes: buffer, target: 'docx' }, [buffer]),
            ask({ id: 66, name: 'x.bin', bytes: new ArrayBuffer(4), at: FIXED_AT })
        ]);

        for (const data of replies) {
            expect(typeof data.error).toBe('string');
            expect(data.losses).toEqual([]);
            expect(data.warnings).toBe(0);
        }
    });
});
