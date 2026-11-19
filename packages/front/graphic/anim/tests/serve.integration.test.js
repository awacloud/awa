// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview `bun run serve` (`dev-portal serve`) end to end for
 * `@awacloud/graphic-anim` — real `@awacloud/tool-local-web` server, real
 * `fetch()`, started via the programmatic seam (`servePackage()`), never a
 * child process. Task 04 of `graphic/BATCH_20`
 * (`ai/plans/2026-08-05-graphic-anim-maturity.md` W2).
 *
 * Live-export verification (graphic memory 2026-08-06, "verify-the-live-line"):
 * the plan's literal snippet reads
 * `const { servePackage } = await import('@awacloud/tool-dev-portal/serve')`,
 * with a fallback to "the root export" if task 02 exposed it there instead.
 * At task-04 execution time neither held: `@awacloud/tool-dev-portal`'s
 * `exports` map declared only `"."` (-> `src/index.ts`, the
 * discovery-generator surface, which does NOT re-export `servePackage`), so
 * the task filed the gap as an out-of-perimeter finding and reached the seam
 * by relative import. The orchestrator then applied that finding as a
 * post-wave registration — `tools/dev-portal/package.json` now declares
 * `"./serve": "./src/serve.ts"`, mirroring `@awacloud/tool-local-web`'s
 * `./server`/`./config` precedent — so this file uses the plan's literal
 * bare-specifier seam, never a cross-package relative reach.
 *
 * happy-dom order-sensitivity (lessons 2026-07-23): several sibling suites in
 * this package's `tests/` register Happy-DOM's `GlobalRegistrator` (for
 * `window`/`document`) and never unregister it; that registration patches
 * Node's HTTP internals process-wide and breaks real `fetch()` against a live
 * `Bun.serve()`-backed server in files loaded later in the same `bun test`
 * process. `beforeAll` unregisters defensively (harmless if already
 * unregistered or running standalone). Residual order-sensitivity, same as
 * the `apps/towards` / `apps/awacloud` precedents: unregistering here is
 * never undone, so a DOM-needing suite that runs AFTER this file in the same
 * process and relies on `GlobalRegistrator` already being registered from
 * another file's import-time side effect would need to re-register for
 * itself — not this file's concern to restore.
 */

// Defensively restore real networking before anything else runs — see the
// fileoverview. Never registers here (this suite needs no DOM).
import { GlobalRegistrator } from '@happy-dom/global-registrator';
if (GlobalRegistrator.isRegistered) await GlobalRegistrator.unregister();

import {
    describe, test, expect, beforeAll, afterAll,
} from 'bun:test';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const PKG_DIR = join(HERE, '..');

// The plan's literal programmatic seam — a bare specifier resolved through the
// devDependency's own `exports` map, never a cross-package relative reach.
/** @type {typeof import('@awacloud/tool-dev-portal/serve')} */
const { servePackage } = await import('@awacloud/tool-dev-portal/serve');

/** @type {import('@awacloud/tool-dev-portal/serve').ServeHandle} */
let handle;

beforeAll(async () => {
    handle = await servePackage({ pkgDir: PKG_DIR, port: 0 });
});

afterAll(async () => {
    if (handle) await handle.stop();
});

describe('dev-portal serve — @awacloud/graphic-anim package portal (real server, real fetch)', () => {
    test('/ — portal page: 200, non-empty, Demos + Playground + Docs sections, shell stylesheet link', async () => {
        // Fixed FORWARD (graphic/BATCH_21 task 05, `playground-family`):
        // packages/front/graphic/anim/playground/ now exists (that task's own
        // deliverable), so `buildPackageModel`'s `scanSlugs(pkgDir, 'playground/')`
        // finds both surfaces and `renderPortalPage` emits a real Playground
        // section — asserted positively here (both slugs present), not merely
        // "no longer absent".
        const res = await fetch(`${handle.url}/`);
        expect(res.status).toBe(200);
        const text = await res.text();
        expect(text.length).toBeGreaterThan(0);
        expect(text).toContain('<h2>Demos</h2>');
        expect(text).toContain('<h2>Playground</h2>');
        expect(text).toContain('/packages/front/graphic/anim/playground/easing-lab/index.html');
        expect(text).toContain('/packages/front/graphic/anim/playground/timeline-lab/index.html');
        expect(text).toContain('<h2>Docs</h2>');
        expect(text).toContain('/tools/dev-portal/assets/demo-shell/demo-shell.css');
    });

    test('/tools/dev-portal/assets/demo-shell/demo-shell.css — 200, non-empty', async () => {
        const res = await fetch(`${handle.url}/tools/dev-portal/assets/demo-shell/demo-shell.css`);
        expect(res.status).toBe(200);
        const text = await res.text();
        expect(text.length).toBeGreaterThan(0);
    });

    test('/packages/front/graphic/anim/demos/index.html — 200, non-empty', async () => {
        const res = await fetch(`${handle.url}/packages/front/graphic/anim/demos/index.html`);
        expect(res.status).toBe(200);
        const text = await res.text();
        expect(text.length).toBeGreaterThan(0);
    });

    test('/packages/front/fw/src/sanity/base.js — 200, non-empty', async () => {
        const res = await fetch(`${handle.url}/packages/front/fw/src/sanity/base.js`);
        expect(res.status).toBe(200);
        const text = await res.text();
        expect(text.length).toBeGreaterThan(0);
    });

    test('/packages/front/office/md/dist/standalone/md-full.min.js — 200, non-empty', async () => {
        const res = await fetch(`${handle.url}/packages/front/office/md/dist/standalone/md-full.min.js`);
        expect(res.status).toBe(200);
        const text = await res.text();
        expect(text.length).toBeGreaterThan(0);
    });

    test('/doc.html — viewer page: 200, non-empty', async () => {
        const res = await fetch(`${handle.url}/doc.html`);
        expect(res.status).toBe(200);
        const text = await res.text();
        expect(text.length).toBeGreaterThan(0);
    });

    test('a non-allowlisted path 404s — the routing gate is real, not vacuous', async () => {
        const res = await fetch(`${handle.url}/packages/back/anything`);
        expect(res.status).toBe(404);
    });
});
