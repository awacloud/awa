// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { describe, test, expect } from 'bun:test';
import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

/**
 * @fileoverview Guard test — the byte encoding of every tracked text file of
 * the package: UTF-8 without a byte-order mark, LF line endings only.
 *
 * `packages/front/fw/.gitattributes` stores every text file as LF; this test
 * reads the files the index tracks (`git ls-files --eol`), skips the entries
 * git classifies as binary, and asserts on the working-tree bytes. A BOM is
 * invisible to JS engines and Markdown renderers but not to a frontmatter or
 * header parser, and a CR breaks byte-level reproducibility across hosts.
 * Outside a git checkout (a published tarball) the test is skipped: the
 * tarball is built from these bytes.
 */

const PKG = join(dirname(fileURLToPath(import.meta.url)), '..');
const BOM = [0xef, 0xbb, 0xbf];

/** @returns {string[] | null} tracked text paths relative to PKG, or null outside git */
function trackedText() {
	const r = spawnSync('git', ['ls-files', '--eol', '-z', '.'], { cwd: PKG, encoding: 'utf8' });
	if (r.status !== 0) return null;
	return r.stdout.split('\0').filter(Boolean).flatMap((line) => {
		const tab = line.indexOf('\t');
		const meta = line.slice(0, tab);
		return meta.startsWith('i/-text') ? [] : [line.slice(tab + 1)];
	});
}

const files = trackedText();

describe('fw encoding', () => {
	test.skipIf(files === null)('the package is tracked as text with a binary remainder', () => {
		expect(/** @type {string[]} */ (files).length).toBeGreaterThan(500);
		expect(existsSync(join(PKG, '.gitattributes'))).toBe(true);
	});

	test.skipIf(files === null)('no tracked text file starts with a UTF-8 BOM', () => {
		const bad = /** @type {string[]} */ (files).filter((f) => {
			const b = readFileSync(join(PKG, f));
			return b.length >= 3 && b[0] === BOM[0] && b[1] === BOM[1] && b[2] === BOM[2];
		});
		expect(bad).toEqual([]);
	});

	test.skipIf(files === null)('no tracked text file holds a CR byte', () => {
		const bad = /** @type {string[]} */ (files).filter((f) => readFileSync(join(PKG, f)).includes(0x0d));
		expect(bad).toEqual([]);
	});
});
