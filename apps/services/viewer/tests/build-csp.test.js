// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview `tools/build-csp.js` on a minimal dist page: the meta CSP
 * goes in, and `dist/_headers.json` comes out valid for the site host
 * (its own validator, `services/site-host/src/host/header-rules.ts`), with
 * the header CSP equal to the meta CSP plus `frame-ancestors 'none'` and
 * `/sw.js` uncached (the host sends `Cache-Control: no-cache`).
 *
 * @module viewer/tests/build-csp.test
 */
import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseHeaderRules } from '../../../../services/site-host/src/host/header-rules.ts';

const app = fileURLToPath(new URL('..', import.meta.url));
const PAGE = `<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta property="og:url" content="https://viewer.awacloud.com/">
    <meta property="og:type" content="website">
    <script type="importmap">{ "imports": { "a": "./a.js" } }</script>
</head>
<body></body>
</html>
`;

describe('build-csp emits the header rules', () => {
    let dist = '';
    let run;
    beforeAll(() => {
        dist = mkdtempSync(join(tmpdir(), 'viewer-csp-'));
        writeFileSync(join(dist, 'index.html'), PAGE);
        run = Bun.spawnSync(['bun', 'tools/build-csp.js', '--dist', dist], { cwd: app });
    });
    afterAll(() => rmSync(dist, { recursive: true, force: true }));

    test('the script exits 0', () => {
        expect(run.exitCode, run.stderr.toString()).toBe(0);
    });

    test('_headers.json validates against the site host rules', () => {
        const doc = JSON.parse(readFileSync(join(dist, '_headers.json'), 'utf8'));
        const rules = parseHeaderRules(doc, 'viewer');
        expect(rules.byPath.get('/sw.js')?.get('cache-control')).toBe('no-cache');
        expect(rules.defaults.get('x-content-type-options')).toBe('nosniff');
        expect(rules.defaults.get('referrer-policy')).toBe('no-referrer');
        expect(rules.defaults.get('cross-origin-opener-policy')).toBe('same-origin');
        for (const feature of ['camera', 'microphone', 'geolocation', 'payment', 'usb']) {
            expect(rules.defaults.get('permissions-policy')).toContain(`${feature}=()`);
        }
    });

    test("the header CSP is the meta CSP plus frame-ancestors 'none'", () => {
        const html = readFileSync(join(dist, 'index.html'), 'utf8');
        const meta = /<meta http-equiv="Content-Security-Policy" content="([^"]+)">/.exec(html)?.[1];
        expect(meta).toBeDefined();
        expect(meta).not.toContain('frame-ancestors');
        const doc = JSON.parse(readFileSync(join(dist, '_headers.json'), 'utf8'));
        const header = doc.rules.find((r) => r.path === '*').headers['content-security-policy'];
        expect(header).toBe(`${meta}; frame-ancestors 'none'`);
    });
});
