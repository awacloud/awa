// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { describe, test, expect } from 'bun:test';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';
import { expandExports } from '../tools/api-surface.js';
import { check, TARGETS } from '../tools/crypto-gen.js';

/**
 * @fileoverview Gate — the logical crypto references hold their contract.
 *
 * Each flattened crypto module keeps a `<module>.reference.js` in git only
 * (see docs/dev/crypto-references.md). This test measures the whole
 * perimeter: every reference exists, is proven by a differential test, and
 * leaves no trace outside the monorepo (tarball, exports map, registry,
 * catalog, typed registry, API surface, declarations). `pbkdf2` has no
 * reference by owner amendment OP-B35-1116 (differential test only), so it
 * is not in the ledger.
 */

const PKG = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(PKG, 'src');
const posix = (/** @type {string} */ p) => p.replace(/\\/g, '/');
const read = (/** @type {string} */ rel) => readFileSync(join(PKG, rel), 'utf8');

/** @type {Array<{module: string, dir: string, generated: string[]}>} */
const LEDGER = [
	{ module: 'aes', dir: 'crypto/cipher', generated: ['aes-gf'] },
	{ module: 'ed25519', dir: 'crypto/pkc', generated: ['field25519-ed'] },
	{ module: 'x25519', dir: 'crypto/pkc', generated: ['field25519-x'] },
	{ module: 'chacha20', dir: 'crypto/cipher', generated: ['chacha20-block'] },
	{ module: 'poly1305', dir: 'crypto/hash', generated: ['poly1305-blocks'] },
	{ module: 'blake2b', dir: 'crypto/hash', generated: ['blake2b-compress'] },
	{ module: 'sha3', dir: 'crypto/hash', generated: ['keccak-f1600'] },
	{ module: 'sha256', dir: 'crypto/hash', generated: ['sha256-compress'] },
];

/**
 * @param {string} dir
 * @returns {string[]} every file under `dir`, recursively
 */
function walk(dir) {
	/** @type {string[]} */
	const out = [];
	for (const name of readdirSync(dir)) {
		const p = join(dir, name);
		if (name === 'node_modules') continue;
		if (statSync(p).isDirectory()) out.push(...walk(p));
		else out.push(p);
	}
	return out;
}

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

const PKG_JSON = JSON.parse(read('package.json'));
const refPath = (/** @type {{module: string, dir: string}} */ e) => `src/${e.dir}/${e.module}.reference.js`;
const testPath = (/** @type {{module: string, dir: string}} */ e) => `src/${e.dir}/${e.module}.reference.test.js`;
const fastPath = (/** @type {{module: string, dir: string}} */ e) => `src/${e.dir}/${e.module}.js`;

describe('crypto references: the ledger', () => {
	test('the references on disk are exactly the ledger', () => {
		const onDisk = walk(SRC)
			.map((f) => posix(relative(PKG, f)))
			.filter((f) => f.endsWith('.reference.js'))
			.sort();
		expect(onDisk).toEqual(LEDGER.map(refPath).sort());
	});

	test.each(LEDGER.map((e) => [e.module, e]))('%s has its differential test and its fast module', (_m, e) => {
		expect(existsSync(join(PKG, testPath(e)))).toBe(true);
		expect(existsSync(join(PKG, fastPath(e)))).toBe(true);
	});

	test.each(LEDGER.map((e) => [e.module, e]))('%s: shape of the reference', (_m, e) => {
		const text = read(refPath(e));
		const head = text.split('\n').slice(0, 3);
		expect(head).toEqual([
			'// Copyright (c) 2026 AwaCloud SAS',
			'// Author: Matthieu Bouilloux',
			'// SPDX-License-Identifier: Apache-2.0',
		]);
		expect(text.match(/^export function create[A-Z]\w*Reference\(/gm)?.length).toBe(1);
		expect(/^export\s+(const|let|var|default|class|\{)/m.test(text)).toBe(false);
		expect(/^\s*import[\s{*'"]/m.test(text)).toBe(false);
	});

	test('the ledger is not empty and matches the rows of the page', () => {
		const page = read('docs/dev/crypto-references.md');
		const header = '| Module | Flattened by | Reference | What the reference is | Generated region (crypto-gen id) | Differential test |';
		const lines = page.split('\n');
		const start = lines.indexOf(header);
		expect(start).toBeGreaterThanOrEqual(0);
		let rows = 0;
		for (let i = start + 2; i < lines.length && lines[i].startsWith('|'); i++) rows++;
		expect(LEDGER.length).toBeGreaterThanOrEqual(1);
		expect(LEDGER.length).toBe(rows);
	});
});

describe('crypto references: leave no trace outside the monorepo', () => {
	test('nothing wires a reference', () => {
		/** @type {string[]} */
		const hits = [];
		for (const root of ['src', 'integrations', 'tools']) {
			const dir = join(PKG, root);
			if (!existsSync(dir)) continue;
			for (const f of walk(dir)) {
				const rel = posix(relative(PKG, f));
				if (!/\.(js|mjs|cjs|ts|json|html)$/.test(rel)) continue;
				if (root === 'src' && /\.test\.[a-z]+$/.test(rel)) continue;
				if (readFileSync(f, 'utf8').includes('.reference.js')) hits.push(rel);
			}
		}
		expect(hits).toEqual([]);
	});

	test.each([
		'src/core/modules.js',
		'integrations/_shared/catalog.generated.json',
		'types/registry.generated.d.ts',
		'docs/api/surface.json',
	])('%s does not mention a reference', (rel) => {
		expect(read(rel).includes('.reference')).toBe(false);
	});

	test('the exports map exposes no reference and blocks the four trees', () => {
		const bad = expandExports(PKG_JSON.exports).filter((e) => /\.reference/.test(`${e.subpath} ${e.file ?? ''}`));
		expect(bad).toEqual([]);
		const nulls = Object.entries(PKG_JSON.exports).filter(([k, v]) => v === null && /\.reference/.test(k)).map(([k]) => k);
		expect(nulls.length).toBe(8);
	});

	test('the declaration tree excludes the references', () => {
		const ts = JSON.parse(read('tsconfig.types.json'));
		expect(ts.exclude).toContain('src/**/*.reference.js');
		const types = join(PKG, 'dist', 'types');
		if (existsSync(types)) {
			expect(walk(types).filter((f) => f.endsWith('.reference.d.ts'))).toEqual([]);
		}
	});

	const packed = packedFiles();

	test('files[] negates the reference sources', () => {
		expect(PKG_JSON.files).toContain('!src/**/*.reference.js');
	});

	test.skipIf(packed === null)('the tarball has the fast modules and no reference nor its test', () => {
		const p = packed ?? new Set();
		for (const e of LEDGER) {
			expect(p.has(fastPath(e))).toBe(true);
			expect(p.has(refPath(e))).toBe(false);
			expect(p.has(testPath(e))).toBe(false);
		}
	});
});

describe('crypto references: generators', () => {
	test('every generated region is up to date', () => {
		const rows = check(PKG);
		expect(rows.filter((r) => !r.ok)).toEqual([]);
		expect(rows.length).toBe(TARGETS.length);
	});

	test('every generated id of the ledger is a generator target', () => {
		const ids = new Set(check(PKG).map((r) => r.id));
		for (const e of LEDGER) for (const id of e.generated) expect(ids.has(id)).toBe(true);
	});
});
