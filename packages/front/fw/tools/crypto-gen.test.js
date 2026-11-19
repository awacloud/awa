// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { describe, test, expect } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TARGETS, check, generate, locate, write } from './crypto-gen.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CLI = join(ROOT, 'tools', 'crypto-gen.js');
const IDS = ['aes-gf', 'field25519-ed', 'field25519-x', 'chacha20-block', 'poly1305-blocks',
    'sha256-compress', 'keccak-f1600', 'blake2b-compress'];

describe('crypto-gen targets', () => {
    test('the eight ids of the table, in order, each file exists', () => {
        expect(TARGETS.map((t) => t.id)).toEqual(IDS);
        expect(Object.isFrozen(TARGETS)).toBe(true);
        for (const t of TARGETS) expect(existsSync(join(ROOT, t.file))).toBe(true);
    });

    test('check() on the live package: every fragment is byte-identical', () => {
        const rows = check(ROOT);
        expect(rows).toHaveLength(8);
        for (const r of rows) expect({ id: r.id, ok: r.ok, reason: r.reason }).toEqual({ id: r.id, ok: true, reason: '' });
    });

    test('field25519-ed and field25519-x share one fragment', () => {
        expect(generate('field25519-ed')).toBe(generate('field25519-x'));
    });

    test('generate() throws RangeError on an unknown id', () => {
        expect(() => generate('nope')).toThrow(RangeError);
        expect(() => generate('nope')).toThrow('crypto-gen: unknown target nope');
        expect(() => generate('toString')).toThrow(RangeError);
    });
});

describe('locate', () => {
    const frag = '        function f() {\n            return 1;\n        }';

    test('finds the fragment once', () => {
        const content = `head\n${frag}\ntail\n`;
        const { start, end } = locate(content, frag);
        expect(content.slice(start, end)).toBe(frag);
    });

    test('throws when the first line is absent', () => {
        expect(() => locate('nothing here\n', frag)).toThrow('crypto-gen:');
    });

    test('throws when the first line occurs twice', () => {
        expect(() => locate(`${frag}\nmid\n${frag}\n`, frag)).toThrow('occurs 2 times');
    });

    test('throws when the last line is not found after the first', () => {
        expect(() => locate('        function f() {\n            return 1;\n', frag)).toThrow('last line not found');
    });
});

describe('sensitivity', () => {
    for (const { id, file } of TARGETS) {
        test(`${id}: one changed character is detected`, () => {
            const content = readFileSync(join(ROOT, file), 'utf8');
            const fragment = generate(id);
            const { start, end } = locate(content, fragment);
            expect(content.slice(start, end)).toBe(fragment);
            let at = start + Math.floor((end - start) / 2);
            while (content[at] === '\n') at++;
            const mutated = content.slice(0, at) + (content[at] === 'X' ? 'Y' : 'X') + content.slice(at + 1);
            const m = locate(mutated, fragment);
            expect(mutated.slice(m.start, m.end) === fragment).toBe(false);
        });
    }
});

describe('write', () => {
    test('restores corrupted copies byte-identically, then is a no-op', () => {
        const dir = mkdtempSync(join(tmpdir(), 'crypto-gen-'));
        try {
            const originals = new Map();
            for (const { file } of TARGETS) {
                if (originals.has(file)) continue;
                originals.set(file, readFileSync(join(ROOT, file)));
            }
            for (const { id, file } of TARGETS) {
                const path = join(dir, file);
                mkdirSync(dirname(path), { recursive: true });
                const text = (existsSync(path) ? readFileSync(path, 'utf8') : originals.get(file).toString('utf8'));
                const { start, end } = locate(text, generate(id));
                const at = start + Math.floor((end - start) / 2);
                writeFileSync(path, text.slice(0, at) + '#CORRUPT#' + text.slice(at));
            }
            expect(check(dir).every((r) => !r.ok)).toBe(true);
            const changed = write(dir);
            expect(changed.sort()).toEqual([...IDS].sort());
            for (const [file, bytes] of originals) {
                expect(Buffer.compare(readFileSync(join(dir, file)), bytes)).toBe(0);
            }
            expect(write(dir)).toEqual([]);
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });
});

describe('CLI', () => {
    const run = (...args) => spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8', cwd: ROOT });

    test('--check: exit 0 and eight OK lines (also the default)', () => {
        for (const args of [['--check'], []]) {
            const r = run(...args);
            expect(r.status).toBe(0);
            const lines = r.stdout.trim().split('\n');
            expect(lines).toHaveLength(8);
            expect(lines.every((l) => l.startsWith('OK '))).toBe(true);
        }
    });

    test('--print sha256-compress starts with the indented function head', () => {
        const r = run('--print', 'sha256-compress');
        expect(r.status).toBe(0);
        expect(r.stdout.startsWith('        function _compress(h, w) {')).toBe(true);
    });

    test('--help exits 0', () => {
        const r = run('--help');
        expect(r.status).toBe(0);
        expect(r.stdout).toContain('Usage');
    });

    test('an unknown id or flag exits 2 with usage on stderr', () => {
        for (const args of [['--print', 'nope'], ['--bogus'], ['--print']]) {
            const r = run(...args);
            expect(r.status).toBe(2);
            expect(r.stderr).toContain('Usage');
        }
    });
});
