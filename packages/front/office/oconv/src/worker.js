// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview `@awacloud/oconv` worker entry — one conversion per message
 * (the frozen worker contract, verbatim for the `toMd` direction).
 *
 * ## toMd (read direction)
 *
 * In: `{ id, name, bytes: ArrayBuffer, at?, sha256? }` (`bytes` is
 * transferred, zero-copy). Out: `{ id, ms, error, chars, warnings, losses,
 * markdown }` — errors are returned as DATA (`error` is a string), never
 * thrown across the worker boundary; `error` is `null` on success.
 * `warnings` is the count (`losses.length`, kept for existing callers) and
 * `losses` is the array itself — the facade's `{ code, detail }` records,
 * verbatim, structured-cloned (`[]` on error).
 * `sha256` is part of the frozen message envelope but unused here: the facade's `toMd` computes its own
 * `sourceSha256` and takes no override.
 *
 * ## fromMd (write direction)
 *
 * ADDITIVE second message kind — the `toMd` request envelope above stays
 * BYTE-UNCHANGED (the protocol only ever grows additively, never breaking; the reply
 * gained the additive `losses` key and lost none). The discriminator is `typeof data.markdown === 'string'`: a message carrying
 * a `markdown` string routes to `fromMd`, everything else routes to the
 * `convert` or `toMd` path below.
 *
 * ## convert (cross-format pair)
 *
 * ADDITIVE third message kind — the `toMd` and `fromMd` request envelopes
 * above stay BYTE-UNCHANGED. A `toMd` message never carries `target`, so the
 * three-way discriminator is unambiguous: `typeof data.markdown ===
 * 'string'` routes to `fromMd` first (a `fromMd` message MAY also carry a
 * `target`), then `typeof data.target === 'string'` routes to `convert`,
 * everything else routes to `toMd`.
 *
 * In: `{ id, name?, bytes: ArrayBuffer, format?, target, includeNotes?,
 * opts?, defaultFaces? }` → `convert({ name, bytes: new Uint8Array(bytes),
 * format, target, includeNotes, opts, defaultFaces })` (`opts` and
 * `defaultFaces` each forwarded only when present). Out:
 * `{ id, ms, error, bytes, warnings, losses }` — IDENTICAL shape to the
 * `fromMd` reply.
 *
 * In: `{ id, name?, markdown, target?, opts?, assets?, defaultFaces? }`. Out:
 * `{ id, ms, error, bytes, warnings, losses }` — `bytes` is a `Uint8Array`
 * (structured-cloned, NOT transferred on the response in v1 — transfer
 * optimization is the caller's concern) or `null` on error; `warnings =
 * losses.length` and `losses` is the array itself (the facade's
 * `{ code, detail }` records, verbatim — reader codes carry a string
 * `detail`, the pdf writer's `layout/*`, `text/unencodable` and `inline/*`
 * codes an object one; both structured-clone unchanged); `error` a string or
 * `null`, same data-not-thrown contract as `toMd`.
 *
 * `opts` is the facade's own per-target option block (`OconvFromMdInput`),
 * forwarded VERBATIM and only when the caller supplied the key — an absent
 * `opts` produces exactly the call this handler made before the key
 * existed. Its one defined member today is `opts.pdf`, the
 * `OconvPdfOptions` block of `./oconv.js`: geometry keys (`pageSize`,
 * `margin`, `baseSize`, …) plus `fonts`, a per-face map of `Uint8Array`
 * font programs — both structured-clone across `postMessage`, so no
 * transfer list is needed in v1. Validation stays on the facade side
 * (`oconvPdfBox.resolveLayout` is the single validator): a bad key, or
 * `opts.pdf` on a non-pdf target, comes back as DATA in `error` — never
 * thrown across the boundary, same contract as every other failure here.
 *
 * `assets` is the facade's image manifest —
 * `Object<string, Uint8Array>`, keyed by the markdown image destination —
 * forwarded the same way, VERBATIM and only when the key is present. A
 * plain object of `Uint8Array`s is structured-cloneable as-is, so nothing
 * special is required of the caller; a caller that wants to avoid the copy
 * MAY put the buffers in `postMessage`'s transfer list, which is a
 * documented option, never a requirement. The reply keys are the `fromMd`
 * ones above, `losses` included.
 *
 * `defaultFaces` is a
 * posted default-face map on BOTH the `fromMd` and `convert` envelopes,
 * forwarded VERBATIM and only when the key is present, same discipline as
 * `opts`/`assets`. It is the HOST's own
 * `runtime.resolve('oconvDefaultFaces').defaultFaces()` result, posted here
 * by structured clone (MAY be transferred) — NEVER the `oconvDefaultFaces`
 * descriptor itself: that descriptor closes over its bytes inside
 * `factory()`, so `ModuleRuntime#serialize` cannot ship it and a worker
 * never sees the registration. Only the PAYLOAD (a plain map of
 * `Uint8Array`) structured-clones; the descriptor is main-thread-only, by
 * construction, and is never serialized into the worker. A plain object of
 * `Uint8Array`s needs nothing special of the caller, same as `assets` above.
 * The reply keys are the same for both message kinds.
 *
 * DOM-free by construction: this file builds its own
 * `ModuleRuntime` from `./main.js`'s manifest and runs unmodified in a
 * browser `Worker` and a Bun `Worker` — same file, same call:
 * `new Worker(new URL('./worker.js', import.meta.url), { type: 'module' })`.
 *
 * @module oconv/worker
 */

import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { fw_require, modules } from './main.js';

const runtime = new ModuleRuntime();
runtime.registerAll(fw_require);
runtime.registerAll(modules);
const { toMd, fromMd, convert } = runtime.resolve('oconv');

/** `{ id, ms, error, bytes, warnings, losses }` — the fromMd response shape. */
async function handleFromMd(data) {
    const { id, name, markdown, target, opts, assets, defaultFaces } = data;
    const t0 = performance.now();
    let result = null;
    let error = null;
    try {
        // `opts`, `assets` and `defaultFaces` are threaded ONLY when the
        // caller sent the key, so a message without them produces the exact
        // same facade call as before any of them existed.
        const req = { name, markdown, target };
        if (opts !== undefined) req.opts = opts;
        if (assets !== undefined) req.assets = assets;
        if (defaultFaces !== undefined) req.defaultFaces = defaultFaces;
        result = await fromMd(req);
    } catch (e) {
        error = (e && e.message) || String(e);
    }
    const ms = performance.now() - t0;

    return {
        id,
        ms,
        error,
        bytes: result ? result.bytes : null,
        warnings: result ? result.losses.length : 0,
        losses: result ? result.losses : []
    };
}

/** `{ id, ms, error, bytes, warnings, losses }` — the convert response shape, identical to fromMd's. */
async function handleConvert(data) {
    const { id, name, bytes, format, target, includeNotes, opts, defaultFaces } = data;
    const t0 = performance.now();
    let result = null;
    let error = null;
    try {
        // `opts` and `defaultFaces` are threaded ONLY when the caller sent
        // the key — same discipline as `handleFromMd`.
        const req = { name, bytes: new Uint8Array(bytes), format, target, includeNotes };
        if (opts !== undefined) req.opts = opts;
        if (defaultFaces !== undefined) req.defaultFaces = defaultFaces;
        result = await convert(req);
    } catch (e) {
        error = (e && e.message) || String(e);
    }
    const ms = performance.now() - t0;

    return {
        id,
        ms,
        error,
        bytes: result ? result.bytes : null,
        warnings: result ? result.losses.length : 0,
        losses: result ? result.losses : []
    };
}

/** `{ id, ms, error, chars, warnings, losses, markdown }` — the toMd response shape. */
async function handleToMd(data) {
    const { id, name, bytes, at, sha256 } = data;
    void sha256; // frozen envelope field, unused — see the fileoverview note.

    const t0 = performance.now();
    let result = null;
    let error = null;
    try {
        result = await toMd({
            name,
            bytes: new Uint8Array(bytes),
            convertedAt: at
        });
    } catch (e) {
        error = (e && e.message) || String(e);
    }
    const ms = performance.now() - t0;

    return {
        id,
        ms,
        error,
        chars: result ? result.markdown.length : 0,
        warnings: result ? result.losses.length : 0,
        losses: result ? result.losses : [],
        markdown: result ? result.markdown : null
    };
}

self.onmessage = async (ev) => {
    const data = ev.data || {};
    const reply = typeof data.markdown === 'string' ? await handleFromMd(data)
        : typeof data.target === 'string' ? await handleConvert(data)
        : await handleToMd(data);
    self.postMessage(reply);
};
