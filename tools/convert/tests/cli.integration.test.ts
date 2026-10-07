// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * tools/convert/tests/cli.integration.test.ts — the spawned CLI contract
 * (`bun tools/convert/src/index.ts …`, `ai/conventions/tool.md`).
 */

import { describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ROOT = join(import.meta.dir, '..', '..', '..');
const CLI_ENTRY = join(ROOT, 'tools', 'convert', 'src', 'index.ts');
const SAMPLE_DOCX = join(import.meta.dir, 'fixtures', 'sample.docx');

interface Result {
    code: number;
    stdout: Buffer;
    stderr: string;
}

function spawnCli(args: string[]): Result {
    const r = spawnSync('bun', [CLI_ENTRY, ...args]);
    return {
        code: r.status ?? -1,
        stdout: r.stdout ?? Buffer.alloc(0),
        stderr: (r.stderr ?? Buffer.alloc(0)).toString('utf8'),
    };
}

const outFiles: string[] = [];
function freshOutFile(name: string): string {
    const dir = mkdtempSync(join(tmpdir(), 'convert-cli-it-'));
    const path = join(dir, name);
    outFiles.push(dir);
    return path;
}

process.once('exit', () => {
    for (const d of outFiles) {
        try {
            rmSync(d, { recursive: true, force: true });
        } catch {
            /* best-effort */
        }
    }
});

describe('convert CLI — contract', () => {
    test('--help exits 0 and prints usage', () => {
        const r = spawnCli(['--help']);
        expect(r.code).toBe(0);
        expect(r.stdout.toString('utf8')).toContain('Usage:');
    });

    test('-h exits 0', () => {
        const r = spawnCli(['-h']);
        expect(r.code).toBe(0);
    });

    test('--version exits 0 and prints a version string', () => {
        const r = spawnCli(['--version']);
        expect(r.code).toBe(0);
        expect(r.stdout.toString('utf8').trim()).toMatch(/^\d+\.\d+\.\d+$/);
    });

    test('unknown command exits 1', () => {
        const r = spawnCli(['bogus-command', 'file.txt']);
        expect(r.code).toBe(1);
        expect(r.stderr).toContain('unknown command');
    });

    test('missing --target on from-md exits 2', () => {
        const r = spawnCli(['from-md', SAMPLE_DOCX]);
        expect(r.code).toBe(2);
        expect(r.stderr).toContain('--target');
    });

    test('unsupported --target on convert exits 2', () => {
        const r = spawnCli(['convert', SAMPLE_DOCX, '--target', 'pptx']);
        expect(r.code).toBe(2);
        expect(r.stderr).toContain('unsupported target');
    });

    test('to-md writes bytes to stdout and diagnostics to stderr, byte-identical to --out', () => {
        // --at pins the provenance timestamp so both invocations produce
        // byte-identical markdown (oconv's convertedAt is never defaulted).
        const AT = '2026-01-01T00:00:00.000Z';
        const stdoutResult = spawnCli(['to-md', SAMPLE_DOCX, '--at', AT]);
        expect(stdoutResult.code).toBe(0);
        expect(stdoutResult.stdout.length).toBeGreaterThan(0);

        const outPath = freshOutFile('out.md');
        const fileResult = spawnCli(['to-md', SAMPLE_DOCX, '--at', AT, '--out', outPath]);
        expect(fileResult.code).toBe(0);
        const fileContent = readFileSync(outPath);
        expect(fileContent.equals(stdoutResult.stdout)).toBe(true);
    });

    test('convert (docx -> pdf, lossy) exits 0 and reports losses on stderr', () => {
        const r = spawnCli(['convert', SAMPLE_DOCX, '--target', 'pdf']);
        expect(r.code).toBe(0);
        expect(r.stdout.length).toBeGreaterThan(0);
        // pdf magic header
        expect(r.stdout.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    });

    test('to-html emits HTML with no ANSI escape when stdout is piped', () => {
        const mdPath = freshOutFile('sample.md');
        writeFileSync(mdPath, '# Title\n\nSome *text*.\n');
        const r = spawnCli(['to-html', mdPath]);
        expect(r.code).toBe(0);
        const out = r.stdout.toString('utf8');
        expect(out).toContain('<h1>Title</h1>');
        // eslint-disable-next-line no-control-regex
        expect(/\u001b\[/.test(out)).toBe(false);
    });

    test('to-html renders hostile input inert (javascript: link, raw HTML, Mermaid) and sanitised', () => {
        const mdPath = freshOutFile('hostile.md');
        writeFileSync(
            mdPath,
            [
                '[x](javascript:alert(1))',
                '',
                '<img src=x onerror=alert(1)>',
                '',
                '```mermaid',
                '</div><script>alert(1)</script>',
                '```',
                '',
                '- [x] done',
                '',
            ].join('\n'),
        );
        const r = spawnCli(['to-html', mdPath]);
        expect(r.code).toBe(0);
        const out = r.stdout.toString('utf8');
        expect(out).not.toMatch(/href\s*=\s*["']?\s*javascript:/i);
        expect(out).not.toMatch(/<img\b/i);
        expect(out).not.toMatch(/<script\b/i);
        expect(out).not.toMatch(/<[^>]*\son\w+\s*=/i);
        const inputs = out.match(/<input\b[^>]*>/gi) ?? [];
        expect(inputs.length).toBe(1);
        expect(inputs[0]!).toMatch(/^<input (checked="" )?disabled="" type="checkbox" \/>$/);
        expect(out).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    });
});

describe('convert CLI — --at validation (BL-1639)', () => {
    test('--at not-a-date exits 2 with the prefixed message, empty stdout', () => {
        const r = spawnCli(['to-md', SAMPLE_DOCX, '--at', 'not-a-date']);
        expect(r.code).toBe(2);
        expect(r.stderr).toContain('convert: --at: invalid timestamp "not-a-date"');
        expect(r.stdout.length).toBe(0);
    });

    test('--at not-a-date with --out creates no output file', () => {
        const outPath = freshOutFile('should-not-exist.md');
        const r = spawnCli(['to-md', SAMPLE_DOCX, '--at', 'not-a-date', '--out', outPath]);
        expect(r.code).toBe(2);
        expect(existsSync(outPath)).toBe(false);
    });

    test('--at "" exits 2 (today it is 1)', () => {
        const r = spawnCli(['to-md', SAMPLE_DOCX, '--at', '']);
        expect(r.code).toBe(2);
        expect(r.stderr).toContain('convert: --at: invalid timestamp ""');
    });

    test('precedence: a usage error in --at wins before any I/O, even on a non-existent input file', () => {
        const r = spawnCli(['to-md', 'does-not-exist.docx', '--at', 'not-a-date']);
        expect(r.code).toBe(2);
        expect(r.stderr).toContain('convert: --at: invalid timestamp "not-a-date"');
    });

    test('a valid --at with an offset is accepted verbatim into the front matter', () => {
        const AT = '2026-01-01T00:00:00+02:00';
        const r = spawnCli(['to-md', SAMPLE_DOCX, '--at', AT]);
        expect(r.code).toBe(0);
        expect(r.stdout.toString('utf8')).toContain(`convertedAt: ${AT}`);
    });
});
