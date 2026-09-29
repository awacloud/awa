// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// tools/fw-bundler/src/bundle/lib/banner.test.js
//
// Unit tests for the opt-in legal-comment banner (pure text + one file).

import { describe, test, expect, afterAll } from 'bun:test';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { renderBanner, loadBannerFile, applyBanner, measure } from './banner.js';

const TMP = mkdtempSync(join(tmpdir(), 'fw-bundler-banner-'));
afterAll(() => rmSync(TMP, { recursive: true, force: true }));

const LINES = 'Banner line one\nBanner line two\nBanner line three\n';

describe('renderBanner', () => {
    test('dresses plain lines as ONE legal comment, LF-terminated', () => {
        expect(renderBanner(LINES)).toBe(
            '/*!\n * Banner line one\n * Banner line two\n * Banner line three\n */\n',
        );
    });

    test('is deterministic: EOL style, BOM, trailing whitespace and outer blank lines do not matter', () => {
        const crlf = '﻿\r\n\r\nBanner line one  \r\nBanner line two\t\r\nBanner line three\r\n\r\n';
        expect(renderBanner(crlf)).toBe(renderBanner(LINES));
        expect(renderBanner(LINES)).toBe(renderBanner(LINES));
    });

    test('an inner blank line renders as a bare " *"', () => {
        expect(renderBanner('a\n\nb')).toBe('/*!\n * a\n *\n * b\n */\n');
    });

    test('refuses a comment terminator (would close the comment and inject code)', () => {
        expect(() => renderBanner('ok\nevil */ alert(1)')).toThrow(/\*\//);
    });

    test('refuses empty / whitespace-only text and non-strings', () => {
        expect(() => renderBanner('')).toThrow(/empty/);
        expect(() => renderBanner(' \n\t\n')).toThrow(/empty/);
        expect(() => renderBanner(null)).toThrow(/string/);
    });
});

describe('loadBannerFile', () => {
    test('reads and renders a banner file', () => {
        const f = join(TMP, 'banner.txt');
        writeFileSync(f, LINES);
        expect(loadBannerFile(f)).toBe(renderBanner(LINES));
    });

    test('a missing file names the path', () => {
        expect(() => loadBannerFile(join(TMP, 'nope.txt'))).toThrow(/--banner-file .*nope\.txt/);
    });
});

describe('applyBanner', () => {
    test('writes the banner at byte 0 and measures the FINAL bytes', () => {
        const f = join(TMP, 'b1.min.js');
        writeFileSync(f, 'var a=1;');
        const banner = renderBanner(LINES);
        const m = applyBanner(f, banner, 'bun');
        const final = readFileSync(f);
        expect(final.toString('utf8')).toBe(`${banner}var a=1;`);
        expect(m.bytes).toBe(final.byteLength);
        expect(m.hashSha256).toBe(createHash('sha256').update(final).digest('hex'));
        expect(m.gzBytes).toBeGreaterThan(0);
    });

    test('re-applying never stacks a second copy', () => {
        const f = join(TMP, 'b2.min.js');
        writeFileSync(f, 'var b=2;');
        const banner = renderBanner(LINES);
        const first = applyBanner(f, banner, 'bun');
        const second = applyBanner(f, banner, 'bun');
        const text = readFileSync(f, 'utf8');
        expect(text.split('/*!').length - 1).toBe(1);
        expect(second).toEqual(first);
    });

    test('measure: the non-bun backends use node:zlib (same bytes/hash, a gzip size)', () => {
        const buf = Buffer.from('x'.repeat(1000));
        const a = measure(buf, 'bun');
        const b = measure(buf, 'esbuild');
        expect(a.bytes).toBe(b.bytes);
        expect(a.hashSha256).toBe(b.hashSha256);
        expect(b.gzBytes).toBeGreaterThan(0);
        expect(b.gzBytes).toBeLessThan(1000);
    });
});
