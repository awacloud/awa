// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

/**
 * @fileoverview Guard test — the package README follows the published-package
 * skeleton: purpose (text before the first `##`), then the `##` sections
 * install, quick start, the package-specific ones, sub-paths, maturity,
 * licence, links, in that order; the sub-paths section holds one table headed
 * `Sub-path | Target | Usage` with one row per `exports` key that resolves
 * (null keys and `./package.json` excluded), and every row names a real key.
 * The heading aliases mirror the repository's README rule, so a section
 * renamed out of its alias fails here first.
 */

const PKG = join(dirname(fileURLToPath(import.meta.url)), '..');
const README = readFileSync(join(PKG, 'README.md'), 'utf8');
const MANIFEST = JSON.parse(readFileSync(join(PKG, 'package.json'), 'utf8'));

const ALIASES = [
	['install', /^install(?:ation)?$/i],
	['quick start', /^(?:quick[\s-]*start|getting started)$/i],
	['sub-paths', /^(?:(?:exposed\s+)?sub-?paths|exports|exposed\s+surface)$/i],
	['maturity', /^(?:maturity|status)$/i],
	['licence', /^licen[cs]e$/i],
	['links', /^(?:links|project)$/i],
];

/** @returns {{ title: string, key: string | null, at: number }[]} the `##` headings outside fences */
function headings() {
	const out = [];
	let fence = false;
	README.split('\n').forEach((line, at) => {
		if (/^\s*(```|~~~)/.test(line)) fence = !fence;
		const m = !fence && /^##[ \t]+(.+?)[ \t]*$/.exec(line);
		if (m) out.push({ title: m[1], key: ALIASES.find(([, re]) => re.test(m[1].trim()))?.[0] ?? null, at });
	});
	return out;
}

/** @param {string} key @returns {string} the body of the section whose alias is `key` */
function section(key) {
	const hs = headings();
	const i = hs.findIndex((h) => h.key === key);
	const lines = README.split('\n');
	return lines.slice(hs[i].at + 1, hs[i + 1]?.at ?? lines.length).join('\n');
}

/** @param {string} line @returns {string[]} */
const cells = (line) => line.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map((c) => c.trim());

describe('fw README skeleton', () => {
	test('purpose, then the fixed sections in order, package-specific ones between quick start and sub-paths', () => {
		const hs = headings();
		const keyed = hs.filter((h) => h.key !== null).map((h) => h.key);
		expect(keyed).toEqual(ALIASES.map(([k]) => k));
		const at = (/** @type {string} */ k) => /** @type {{at: number}} */ (hs.find((h) => h.key === k)).at;
		const misplaced = hs.filter((h) => h.key === null && (h.at < at('quick start') || h.at > at('sub-paths'))).map((h) => h.title);
		expect(misplaced).toEqual([]);
		const purpose = README.split('\n').slice(0, hs[0].at).filter((l) => !/^#\s/.test(l)).join('\n').trim();
		expect(purpose.length).toBeGreaterThan(0);
	});

	test('the sub-paths table lists every resolving exports key, and only those', () => {
		const lines = section('sub-paths').split('\n');
		const head = lines.findIndex((l) => l.trim().startsWith('|'));
		expect(cells(lines[head])).toEqual(['Sub-path', 'Target', 'Usage']);
		const rows = [];
		for (let i = head + 2; i < lines.length && lines[i].trim().startsWith('|'); i++) rows.push(cells(lines[i]));
		expect(rows.filter((r) => r.length !== 3)).toEqual([]);
		const named = rows.map((r) => {
			const c = r[0].replace(/^`|`$/g, '');
			return c === MANIFEST.name ? '.' : `./${c.slice(MANIFEST.name.length + 1)}`;
		});
		const wanted = Object.entries(MANIFEST.exports).filter(([k, v]) => v !== null && k !== './package.json').map(([k]) => k);
		expect(named.slice().sort()).toEqual(wanted.slice().sort());
	});

	test('each row targets what the exports map resolves the key to', () => {
		const lines = section('sub-paths').split('\n').filter((l) => l.trim().startsWith('|')).slice(2);
		const wrong = lines.map(cells).filter(([sub, target]) => {
			const c = sub.replace(/^`|`$/g, '');
			const key = c === MANIFEST.name ? '.' : `./${c.slice(MANIFEST.name.length + 1)}`;
			const v = MANIFEST.exports[key];
			const resolved = typeof v === 'string' ? v : (v.default ?? v.types);
			return target.replace(/^`|`$/g, '') !== resolved.replace(/^\.\//, '');
		});
		expect(wrong).toEqual([]);
	});
});
