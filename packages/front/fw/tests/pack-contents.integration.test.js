// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { describe, test, expect } from 'bun:test';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

/**
 * @fileoverview Guard test — what the published tarball carries.
 *
 * The WASM tier (`src/crypto/wasm/`) fetches its `.wasm` binaries by name,
 * next to `runtime.js` (`import.meta.url`), so a tarball without them leaves
 * every `wasm*` module unavailable at run time, silently (the tier is
 * no-throw). The `files[]` list once omitted them; this test asks npm itself
 * (`npm pack --dry-run --ignore-scripts --json`, which writes nothing and
 * runs no lifecycle script) for the file list and asserts:
 *   1. every tracked `src/crypto/wasm/*.wasm` and `src/io/**\/*.bin` asset is
 *      in the tarball;
 *   2. the licence texts the binaries need ship with them:
 *      `third-party/NOTICE-fw-wasm-crypto.txt` is in the tarball, and so is
 *      the root `NOTICE` (stamped from the repository's licence templates)
 *      that lists every `third-party/` file; likewise the notices of the two
 *      inlined tables (the Brotli dictionary, the WHATWG entity table);
 *   3. provenance: the colocated binaries are byte-identical to the build of
 *      the sibling `@awacloud/fw-wasm-crypto` package (`dist/MANIFEST.sha256`)
 *      and the attribution copy equals its `vendor/NOTICE` — checked only in a
 *      monorepo checkout, where the sibling exists.
 * Skipped where npm is not on PATH.
 */

const PKG = join(dirname(fileURLToPath(import.meta.url)), '..');
const SIBLING = join(PKG, '..', 'fw-wasm-crypto');
const WASM_DIR = join(PKG, 'src', 'crypto', 'wasm');

/** @returns {Set<string> | null} the tarball's file paths, or null when npm is unavailable */
function packedFiles() {
	const r = spawnSync('npm', ['pack', '--dry-run', '--ignore-scripts', '--json'], {
		cwd: PKG,
		encoding: 'utf8',
		shell: process.platform === 'win32',
		maxBuffer: 64 * 1024 * 1024,
	});
	if (r.status !== 0) return null;
	const [entry] = JSON.parse(r.stdout);
	return new Set(entry.files.map((/** @type {{path: string}} */ f) => f.path.replace(/\\/g, '/')));
}

const packed = packedFiles();
const PKG_JSON = JSON.parse(readFileSync(join(PKG, 'package.json'), 'utf8'));
const wasmFiles = readdirSync(WASM_DIR).filter((f) => f.endsWith('.wasm')).sort();

describe('fw published tarball', () => {
	test('the WASM tier has binaries to ship', () => {
		expect(wasmFiles.length).toBeGreaterThan(0);
	});

	test.skipIf(packed === null)('every WASM binary is in the tarball', () => {
		const missing = wasmFiles.map((f) => `src/crypto/wasm/${f}`).filter((p) => !packed?.has(p));
		expect(missing).toEqual([]);
	});

	test.skipIf(packed === null)('the Brotli dictionary is in the tarball', () => {
		expect(packed?.has('src/io/compress/brotli_dict.bin')).toBe(true);
	});

	test.skipIf(packed === null)('the notices of the inlined third-party tables ship', () => {
		expect(packed?.has('third-party/NOTICE-brotli-dictionary.txt')).toBe(true);
		expect(packed?.has('third-party/NOTICE-whatwg-entities.txt')).toBe(true);
	});

	test('files[] ships the root NOTICE', () => {
		expect(PKG_JSON.files).toContain('NOTICE');
	});

	test.skipIf(packed === null)('the root NOTICE is in the tarball', () => {
		expect(packed?.has('NOTICE')).toBe(true);
		expect(packed?.has('third-party/NOTICE-sjcl')).toBe(true);
		expect(packed?.has('third-party/NOTICE-penner-easing')).toBe(true);
	});

	test.skipIf(packed === null)('the licence texts of the WASM binaries ship with them', () => {
		expect(packed?.has('third-party/NOTICE-fw-wasm-crypto.txt')).toBe(true);
	});

	test('files[] negates the *.reference.js sources', () => {
		expect(PKG_JSON.files).toContain('!src/**/*.reference.js');
	});

	test.skipIf(packed === null)('no *.reference.js is in the tarball', () => {
		expect([...(packed ?? [])].filter((p) => /\.reference\.js$/.test(p))).toEqual([]);
	});

	test.skipIf(!existsSync(join(SIBLING, 'dist', 'MANIFEST.sha256')))('the binaries are the fw-wasm-crypto build, byte for byte', () => {
		const manifest = readFileSync(join(SIBLING, 'dist', 'MANIFEST.sha256'), 'utf8')
			.split('\n').filter(Boolean)
			.map((l) => l.trim().split(/\s+\*?/))
			.map(([hash, name]) => `${name} ${hash}`).sort();
		const local = wasmFiles.map((f) => `${f} ${createHash('sha256').update(readFileSync(join(WASM_DIR, f))).digest('hex')}`);
		expect(local).toEqual(manifest);
	});

	test.skipIf(!existsSync(join(SIBLING, 'vendor', 'NOTICE')))('the attribution copy equals fw-wasm-crypto vendor/NOTICE', () => {
		const copy = join(PKG, 'third-party', 'NOTICE-fw-wasm-crypto.txt');
		expect(existsSync(copy)).toBe(true);
		expect(readFileSync(copy, 'utf8')).toBe(readFileSync(join(SIBLING, 'vendor', 'NOTICE'), 'utf8'));
	});
});
