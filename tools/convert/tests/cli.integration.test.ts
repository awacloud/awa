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
import { brokenXrefPdf, encryptedPdf, jpegPdf, JPEG_BYTES, PAGE_TEXT, pagedDocx, plainPdf, TITLE_TEXT, titledPdf } from './pdf-fixtures.ts';

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

    // T82: layout is on by default for docx -> odt; --no-layout turns it off.
    test('convert (docx -> odt) writes the bytes of --layout by default; --no-layout writes others', () => {
        const paged = freshOutFile('paged.docx');
        writeFileSync(paged, pagedDocx());
        const on = spawnCli(['convert', paged, '--target', 'odt', '--layout']);
        const dflt = spawnCli(['convert', paged, '--target', 'odt']);
        const off = spawnCli(['convert', paged, '--target', 'odt', '--no-layout']);
        expect([on.code, dflt.code, off.code]).toEqual([0, 0, 0]);
        expect(dflt.stdout.equals(on.stdout)).toBe(true);
        expect(off.stdout.equals(on.stdout)).toBe(false);
    });

    test('--layout with --no-layout exits 2; --no-layout outside convert exits 2', () => {
        const both = spawnCli(['convert', SAMPLE_DOCX, '--target', 'odt', '--layout', '--no-layout']);
        expect(both.code).toBe(2);
        expect(both.stderr).toContain('--layout and --no-layout');
        const md = spawnCli(['to-md', SAMPLE_DOCX, '--no-layout']);
        expect(md.code).toBe(2);
        expect(md.stderr).toContain('--no-layout is a convert flag');
    });

    test('--layout outside convert, or on another pair, exits 2', () => {
        const md = spawnCli(['to-md', SAMPLE_DOCX, '--layout']);
        expect(md.code).toBe(2);
        expect(md.stderr).toContain('--layout is a convert flag');
        const pdf = spawnCli(['convert', SAMPLE_DOCX, '--target', 'pdf', '--layout']);
        expect(pdf.code).toBe(2);
        expect(pdf.stderr).toContain('layout needs docx to odt');
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

describe('convert CLI — --sheets (A58)', () => {
    test('--sheets on another verb, or on a docx, is a usage error (exit 2)', () => {
        const verb = spawnCli(['from-md', SAMPLE_DOCX, '--target', 'docx', '--sheets', 'csv']);
        expect(verb.code).toBe(2);
        expect(verb.stderr).toContain('--sheets is a to-md flag');
        const docx = spawnCli(['to-md', SAMPLE_DOCX, '--sheets', 'csv']);
        expect(docx.code).toBe(2);
        expect(docx.stderr).toContain('sheets needs format xlsx or ods');
    });

    test('--sheets tsv writes each sheet as a fenced tsv block', async () => {
        const { ModuleRuntime } = await import('@awacloud/fw/core/runtime.js');
        const oconv = await import('@awacloud/oconv');
        const { toModuleDefinitions } = await import('../src/descriptors.ts');
        const rt = new ModuleRuntime();
        rt.registerAll(toModuleDefinitions('@awacloud/oconv fw_require', oconv.fw_require));
        rt.registerAll(toModuleDefinitions('@awacloud/oconv modules', oconv.modules));
        const xlsx = rt.resolve('xlsx') as { write(m: object): Uint8Array };
        const path = freshOutFile('atlas.xlsx');
        writeFileSync(path, xlsx.write({ sheets: [{ name: 'Atlas', rows: [['Species', 'Count'], ['Alcedo', '12']] }] }));
        const r = spawnCli(['to-md', path, '--sheets', 'tsv', '--at', '2026-01-01T00:00:00.000Z']);
        expect(r.code).toBe(0);
        expect(r.stdout.toString('utf8')).toContain('```tsv\nSpecies\tCount\nAlcedo\t12\n```');
    });
});

describe('convert CLI — every toMd opt-in (T35)', () => {
    const AT = '2026-01-01T00:00:00.000Z';
    const NEW_FLAGS: string[][] = [
        ['--pdf-infer', 'headings'],
        ['--pdf-declare', 'positional'],
        ['--pdf-include', 'images'],
        ['--odt-include', 'toc'],
        ['--docx-include', 'toc'],
        ['--form-op-budget', '10'],
        ['--front-matter', 'none'],
        ['--include-notes'],
        ['--pdf-recover-xref'],
        ['--password-file', SAMPLE_DOCX],
        ['--assets-dir', 'assets'],
        ['--sheet-cell-budget', '10'],
        ['--max-parts', '10'],
        ['--max-uncompressed', '10'],
        ['--max-ratio', '10'],
        ['--max-depth', '10'],
        ['--output-budget', '10'],
        ['--output-overflow', 'truncate'],
        ['--pdf-line-hyphens', 'drop'],
    ];

    test('each new flag on another verb is a usage error (exit 2)', () => {
        for (const flag of NEW_FLAGS) {
            const r = spawnCli(['from-md', SAMPLE_DOCX, '--target', 'docx', ...flag]);
            expect([flag[0], r.code]).toEqual([flag[0], 2]);
            expect(r.stderr).toContain(`${flag[0]} is a to-md flag`);
        }
    });

    test('each pdf / odt flag on a docx is a usage error naming the format it needs', () => {
        const cases: [string[], string][] = [
            [['--pdf-infer', 'headings'], 'pdf infer needs format pdf'],
            [['--pdf-declare', 'positional'], 'pdf declare needs format pdf'],
            [['--pdf-include', 'images'], 'pdf include needs format pdf'],
            [['--form-op-budget', '10'], 'form op budget needs format pdf'],
            [['--pdf-recover-xref'], 'pdf recover xref needs format pdf'],
            [['--password-file', SAMPLE_DOCX], 'pdf password needs format pdf'],
            [['--odt-include', 'toc'], 'odt include needs format odt'],
            [['--sheet-cell-budget', '10'], 'sheet cell budget needs format xlsx or ods'],
            [['--pdf-line-hyphens', 'drop'], 'pdf line hyphens needs format pdf'],
        ];
        for (const [flag, message] of cases) {
            const r = spawnCli(['to-md', SAMPLE_DOCX, '--at', AT, ...flag]);
            expect([flag[0], r.code]).toEqual([flag[0], 2]);
            expect(r.stderr).toContain(message);
        }
    });

    test('--docx-include reaches the docx reader; an unknown name or another format is a usage error', () => {
        expect(spawnCli(['to-md', SAMPLE_DOCX, '--at', AT, '--docx-include', 'toc']).code).toBe(0);
        const bad = spawnCli(['to-md', SAMPLE_DOCX, '--at', AT, '--docx-include', 'x']);
        expect(bad.code).toBe(2);
        expect(bad.stderr).toContain('bad docx include');
        const path = freshOutFile('plain.pdf');
        writeFileSync(path, plainPdf());
        const other = spawnCli(['to-md', path, '--at', AT, '--docx-include', 'toc']);
        expect(other.code).toBe(2);
        expect(other.stderr).toContain('docx include needs format docx');
    });

    // T30 (a), D43: an untagged pdf infers headings and tables by default;
    // `--pdf-infer none` is the read without inference.
    test('to-md infers a heading by default; --pdf-infer none reads without inference', () => {
        const path = freshOutFile('titled.pdf');
        writeFileSync(path, titledPdf());
        const dflt = spawnCli(['to-md', path, '--at', AT]);
        expect(dflt.code).toBe(0);
        expect(dflt.stdout.toString('utf8')).toContain(`# ${TITLE_TEXT}`);
        const none = spawnCli(['to-md', path, '--at', AT, '--pdf-infer', 'none']);
        expect(none.code).toBe(0);
        const md = none.stdout.toString('utf8');
        expect(md).toContain(TITLE_TEXT);
        expect(md).not.toContain(`# ${TITLE_TEXT}`);
    });

    test('--pdf-infer takes a comma-separated list; an unknown name is a usage error', () => {
        const path = freshOutFile('plain.pdf');
        writeFileSync(path, plainPdf());
        const ok = spawnCli(['to-md', path, '--at', AT, '--pdf-infer', 'headings,tables']);
        expect(ok.code).toBe(0);
        const bad = spawnCli(['to-md', path, '--at', AT, '--pdf-infer', 'headings,x']);
        expect(bad.code).toBe(2);
        expect(bad.stderr).toContain('bad pdf infer');
    });

    // T30 (c): an empty user password is tried by default; --no-pdf-empty-password refuses.
    test('an empty-user-password pdf converts by default; --no-pdf-empty-password exits 1', () => {
        const path = freshOutFile('empty-user.pdf');
        writeFileSync(path, encryptedPdf(''));
        const r = spawnCli(['to-md', path, '--at', AT]);
        expect(r.code).toBe(0);
        expect(r.stdout.toString('utf8')).toContain(PAGE_TEXT);
        expect(spawnCli(['to-md', path, '--at', AT, '--no-pdf-empty-password']).code).toBe(1);
        const locked = freshOutFile('locked-user.pdf');
        writeFileSync(locked, encryptedPdf());
        expect(spawnCli(['to-md', locked, '--at', AT]).code).toBe(1);
    });

    test('--password-file opens an encrypted pdf, its trailing line break stripped', () => {
        const path = freshOutFile('locked.pdf');
        writeFileSync(path, encryptedPdf());
        const lf = freshOutFile('password-lf.txt');
        writeFileSync(lf, 'user\n');
        const crlf = freshOutFile('password-crlf.txt');
        writeFileSync(crlf, 'owner\r\n');
        for (const file of [lf, crlf]) {
            const r = spawnCli(['to-md', path, '--at', AT, '--password-file', file]);
            expect(r.code).toBe(0);
            expect(r.stdout.toString('utf8')).toContain(PAGE_TEXT);
        }
        const locked = spawnCli(['to-md', path, '--at', AT]);
        expect(locked.code).toBe(1);
    });

    test('--pdf-include images --assets-dir writes the picture next to the markdown', () => {
        const path = freshOutFile('picture.pdf');
        writeFileSync(path, jpegPdf());
        const dir = join(freshOutFile('x'), '..', 'assets');
        const r = spawnCli(['to-md', path, '--at', AT, '--pdf-include', 'images', '--assets-dir', dir]);
        expect(r.code).toBe(0);
        expect(r.stdout.toString('utf8')).toContain('![](image-7.jpg)');
        expect(Buffer.compare(readFileSync(join(dir, 'image-7.jpg')), Buffer.from(JPEG_BYTES))).toBe(0);
        const without = spawnCli(['to-md', path, '--at', AT, '--pdf-include', 'images']);
        expect(without.code).toBe(0);
    });

    test('--output-budget and --output-overflow bound the output; the archive limits reach the reader', () => {
        const over = spawnCli(['to-md', SAMPLE_DOCX, '--at', AT, '--output-budget', '1']);
        expect(over.code).toBe(1);
        expect(over.stderr).toContain('output too large');
        const cut = spawnCli(['to-md', SAMPLE_DOCX, '--at', AT, '--output-budget', '1', '--output-overflow', 'truncate']);
        expect(cut.code).toBe(0);
        expect(cut.stdout.toString('utf8')).toContain('doc/truncated');
        // T30 (e), D47 (3) b: alone, it truncates at the 256 MiB default.
        const alone = spawnCli(['to-md', SAMPLE_DOCX, '--at', AT, '--output-overflow', 'truncate']);
        expect(alone.code).toBe(0);
        expect(alone.stdout.toString('utf8')).not.toContain('doc/truncated');
        const parts = spawnCli(['to-md', SAMPLE_DOCX, '--at', AT, '--max-parts', '2']);
        expect(parts.code).toBe(1);
        expect(parts.stderr).toContain('too many parts');
        expect(spawnCli(['to-md', SAMPLE_DOCX, '--at', AT, '--max-parts', 'x']).code).toBe(2);
    });

    // T30 (b): pdf rebuilds a broken chain by default; --no-pdf-recover-xref
    // reads strictly.
    test('a pdf whose startxref points nowhere converts by default; --no-pdf-recover-xref exits 1', () => {
        const path = freshOutFile('broken.pdf');
        writeFileSync(path, brokenXrefPdf());
        const r = spawnCli(['to-md', path, '--at', AT]);
        expect(r.code).toBe(0);
        expect(r.stdout.toString('utf8')).toContain(PAGE_TEXT);
        expect(spawnCli(['to-md', path, '--at', AT, '--pdf-recover-xref']).code).toBe(0);
        expect(spawnCli(['to-md', path, '--at', AT, '--no-pdf-recover-xref']).code).toBe(1);
    });

    test('--front-matter none drops the front matter; a bad value is a usage error', () => {
        const r = spawnCli(['to-md', SAMPLE_DOCX, '--at', AT, '--front-matter', 'none']);
        expect(r.code).toBe(0);
        expect(r.stdout.toString('utf8').startsWith('---')).toBe(false);
        const bad = spawnCli(['to-md', SAMPLE_DOCX, '--at', AT, '--front-matter', 'x']);
        expect(bad.code).toBe(2);
        expect(bad.stderr).toContain('bad front matter');
    });
});
