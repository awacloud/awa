// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * tools/convert/tests/runtime-matrix.integration.test.ts — proves the
 * convert CLI runs on bun, node AND deno, and produces the SAME output
 * bytes on all three (task 02, owner ruling c: node + bun + deno; no
 * compiled executable).
 *
 * ## Self-skipping
 *
 * Each runtime is probed with `<bin> --version` before use; an absent
 * runtime is skipped with `test.skip`, never silently omitted and never
 * reported as passing. This suite must stay green on a station missing
 * Node or Deno.
 *
 * ## The one place raw byte-equality does not hold: zip-container targets
 *
 * `docx`/`odt` outputs are ZIP containers written by
 * `packages/front/office/oconv/src/write/ir-to-odt.js` (and its docx
 * counterpart), whose zip writer stamps each entry with
 * `mtime ?? Date.now()` — verified here to vary between ANY two
 * invocations, including two `bun` invocations back to back, not just
 * across runtimes. This is a pre-existing upstream non-determinism (task 01
 * / `@awacloud/oconv`'s own writer, outside `packages/front/office/**`
 * which this task may not touch), not a portability difference introduced
 * by node/deno. To keep the acceptance criterion meaningful, this suite:
 *   - asserts RAW byte-equality for every verb/pair whose output carries no
 *     wall-clock field (`to-md` with `--at` pinned, `to-html`, and any
 *     `pdf` target — measured deterministic across repeated same-runtime
 *     runs before being trusted here);
 *   - for `docx`/`odt` targets, masks the exact 4 timestamp bytes zip
 *     dedicates to each entry's DOS date/time (local file header offset
 *     +10/+12, central directory header offset +12/+14 — see `maskZipTimestamps`
 *     below) and asserts byte-equality of the MASKED buffers, which
 *     isolates "did the runtime change anything" from "did the wall clock
 *     move between invocations".
 *
 * This distinction — and the underlying finding — is also filed as an
 * out-of-perimeter defect in the task report; it is not fixed here.
 */

import { describe, expect, test } from 'bun:test';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ROOT = join(import.meta.dir, '..', '..', '..');
const CLI_ENTRY = join(ROOT, 'tools', 'convert', 'src', 'index.ts');
const SAMPLE_DOCX = join(import.meta.dir, 'fixtures', 'sample.docx');
const CONVERTED_AT = '2026-01-01T00:00:00.000Z';

interface Runtime {
    name: 'bun' | 'node' | 'deno';
    /** Build the full spawn argv for running the CLI with these CLI args. */
    spawn(args: string[]): { cmd: string; args: string[] };
}

const RUNTIMES: Runtime[] = [
    { name: 'bun', spawn: (args) => ({ cmd: 'bun', args: [CLI_ENTRY, ...args] }) },
    { name: 'node', spawn: (args) => ({ cmd: 'node', args: [CLI_ENTRY, ...args] }) },
    {
        name: 'deno',
        // Minimal, justified permissions (README "Running it" documents the same set):
        //   --allow-read  the CLI reads the input file and its own package.json
        //   --allow-write the CLI writes --out files (this suite always passes --out)
        // No --allow-env is granted: a regression that reads the environment fails this
        // leg. --no-prompt makes that failure deterministic instead of prompting.
        spawn: (args) => ({ cmd: 'deno', args: ['run', '--no-prompt', '--allow-read', '--allow-write', CLI_ENTRY, ...args] }),
    },
];

function isAvailable(bin: string): boolean {
    try {
        const r = spawnSync(bin, ['--version'], { stdio: 'ignore' });
        return r.error === undefined && r.status === 0;
    } catch {
        return false;
    }
}

const AVAILABLE = RUNTIMES.filter((r) => isAvailable(r.name));
const SKIPPED = RUNTIMES.filter((r) => !isAvailable(r.name)).map((r) => r.name);

console.log(`runtime-matrix: exercising [${AVAILABLE.map((r) => r.name).join(', ')}]${SKIPPED.length ? `, skipping [${SKIPPED.join(', ')}] (not installed on this station)` : ''}`);

interface RunResult {
    code: number;
    stdout: Buffer;
    stderr: string;
}

function run(rt: Runtime, args: string[]): RunResult {
    const { cmd, args: fullArgs } = rt.spawn(args);
    const r = spawnSync(cmd, fullArgs);
    if (r.error) throw r.error;
    return { code: r.status ?? -1, stdout: r.stdout ?? Buffer.alloc(0), stderr: (r.stderr ?? Buffer.alloc(0)).toString('utf8') };
}

const tmpDirs: string[] = [];
function tmpFile(name: string): string {
    const dir = mkdtempSync(join(tmpdir(), 'convert-matrix-'));
    tmpDirs.push(dir);
    return join(dir, name);
}

process.once('exit', () => {
    for (const d of tmpDirs) {
        try {
            rmSync(d, { recursive: true, force: true });
        } catch {
            /* best-effort cleanup */
        }
    }
});

/**
 * Zero the 4 DOS date/time bytes zip dedicates to each entry — the ONLY
 * bytes `packages/front/office/oconv`'s zip writer varies run to run
 * (`mtime ?? Date.now()`, see this file's module doc). Walks local file
 * headers (`PK\x03\x04`) then central directory headers (`PK\x01\x02`) in
 * order; throws if the structure is not what oconv's writer produces
 * (no data-descriptor bit, no zip64) so a genuinely unexpected difference
 * is never silently swallowed.
 */
function maskZipTimestamps(input: Buffer): Buffer {
    const buf = Buffer.from(input);
    let offset = 0;
    while (offset + 4 <= buf.length && buf.readUInt32LE(offset) === 0x04034b50) {
        const flags = buf.readUInt16LE(offset + 6);
        if ((flags & 0x0008) !== 0) throw new Error('maskZipTimestamps: data-descriptor bit set, unexpected for this fixture');
        buf.writeUInt16LE(0, offset + 10); // last mod file time
        buf.writeUInt16LE(0, offset + 12); // last mod file date
        const compressedSize = buf.readUInt32LE(offset + 18);
        const fnLen = buf.readUInt16LE(offset + 26);
        const extraLen = buf.readUInt16LE(offset + 28);
        offset += 30 + fnLen + extraLen + compressedSize;
    }
    while (offset + 4 <= buf.length && buf.readUInt32LE(offset) === 0x02014b50) {
        buf.writeUInt16LE(0, offset + 12); // last mod file time
        buf.writeUInt16LE(0, offset + 14); // last mod file date
        const fnLen = buf.readUInt16LE(offset + 28);
        const extraLen = buf.readUInt16LE(offset + 30);
        const commentLen = buf.readUInt16LE(offset + 32);
        offset += 46 + fnLen + extraLen + commentLen;
    }
    if (offset + 4 <= buf.length && buf.readUInt32LE(offset) !== 0x06054b50) {
        throw new Error(`maskZipTimestamps: expected end-of-central-directory at ${offset}, got signature 0x${buf.readUInt32LE(offset).toString(16)}`);
    }
    return buf;
}

describe.skipIf(AVAILABLE.length < 2)('convert CLI — runtime matrix (byte identity)', () => {
    test('to-md: identical bytes across every available runtime (--at pinned)', () => {
        const outputs = AVAILABLE.map((rt) => {
            const out = tmpFile(`${rt.name}.md`);
            const r = run(rt, ['to-md', SAMPLE_DOCX, '--at', CONVERTED_AT, '--out', out]);
            expect(r.code).toBe(0);
            return { name: rt.name, bytes: readFileSync(out) };
        });
        for (const o of outputs.slice(1)) {
            expect(o.bytes.equals(outputs[0]!.bytes)).toBe(true);
        }
    });

    test('to-html: identical bytes across every available runtime (no timestamp field)', () => {
        const mdFile = tmpFile('shared.md');
        const seed = run(AVAILABLE[0]!, ['to-md', SAMPLE_DOCX, '--at', CONVERTED_AT, '--out', mdFile]);
        expect(seed.code).toBe(0);

        const outputs = AVAILABLE.map((rt) => {
            const out = tmpFile(`${rt.name}.html`);
            const r = run(rt, ['to-html', mdFile, '--out', out]);
            expect(r.code).toBe(0);
            return { name: rt.name, bytes: readFileSync(out) };
        });
        for (const o of outputs.slice(1)) {
            expect(o.bytes.equals(outputs[0]!.bytes)).toBe(true);
        }
    });

    test('convert docx>pdf: identical bytes across every available runtime (pdf carries no zip timestamp)', () => {
        const outputs = AVAILABLE.map((rt) => {
            const out = tmpFile(`${rt.name}.pdf`);
            const r = run(rt, ['convert', SAMPLE_DOCX, '--target', 'pdf', '--out', out]);
            expect(r.code).toBe(0);
            return { name: rt.name, bytes: readFileSync(out) };
        });
        for (const o of outputs.slice(1)) {
            expect(o.bytes.equals(outputs[0]!.bytes)).toBe(true);
        }
    });

    test('convert docx>odt: identical bytes across every available runtime once the zip mtime field is masked', () => {
        const outputs = AVAILABLE.map((rt) => {
            const out = tmpFile(`${rt.name}.odt`);
            const r = run(rt, ['convert', SAMPLE_DOCX, '--target', 'odt', '--out', out]);
            expect(r.code).toBe(0);
            return { name: rt.name, bytes: readFileSync(out) };
        });
        const masked = outputs.map((o) => maskZipTimestamps(o.bytes));
        for (const m of masked.slice(1)) {
            expect(m.equals(masked[0]!)).toBe(true);
        }
        // Documents (does not re-assert) the raw non-determinism this masking works around —
        // see the module doc and the task report's out-of-perimeter finding.
    });

    test('from-md: identical bytes across every available runtime, target pdf', () => {
        const mdFile = tmpFile('shared2.md');
        const seed = run(AVAILABLE[0]!, ['to-md', SAMPLE_DOCX, '--at', CONVERTED_AT, '--out', mdFile]);
        expect(seed.code).toBe(0);

        const outputs = AVAILABLE.map((rt) => {
            const out = tmpFile(`${rt.name}-from.pdf`);
            const r = run(rt, ['from-md', mdFile, '--target', 'pdf', '--out', out]);
            expect(r.code).toBe(0);
            return { name: rt.name, bytes: readFileSync(out) };
        });
        for (const o of outputs.slice(1)) {
            expect(o.bytes.equals(outputs[0]!.bytes)).toBe(true);
        }
    });
});

describe('convert CLI — runtime matrix (exit codes)', () => {
    for (const rt of RUNTIMES) {
        const available = AVAILABLE.includes(rt);
        const t = available ? test : test.skip;

        t(`${rt.name}: --help exits 0`, () => {
            expect(run(rt, ['--help']).code).toBe(0);
        });

        t(`${rt.name}: --version exits 0`, () => {
            expect(run(rt, ['--version']).code).toBe(0);
        });

        t(`${rt.name}: unknown command exits 1`, () => {
            expect(run(rt, ['bogus-command']).code).toBe(1);
        });

        t(`${rt.name}: usage error (missing file) exits 2`, () => {
            expect(run(rt, ['to-md']).code).toBe(2);
        });
    }

    // 4 cases x every available runtime, spawned serially: measured ~5.5-6 s
    // idle with bun + node + deno present, over bun's 5 s default. The budget
    // is explicit and ~10x the idle figure so a loaded station does not
    // turn a slow spawn into a false red.
    test('exit codes agree across every available runtime', () => {
        const cases: Array<{ label: string; args: string[]; expect: number }> = [
            { label: '--help', args: ['--help'], expect: 0 },
            { label: '--version', args: ['--version'], expect: 0 },
            { label: 'unknown command', args: ['bogus-command'], expect: 1 },
            { label: 'usage error', args: ['to-md'], expect: 2 },
        ];
        for (const c of cases) {
            for (const rt of AVAILABLE) {
                expect(run(rt, c.args).code).toBe(c.expect);
            }
        }
    }, 60_000);
});

/**
 * Spawn `<cmd args>`, send `signal` almost immediately, and resolve with the
 * exit code libuv/the runtime reports. `--out` targets a throwaway path in a
 * fresh tmp dir so a completed-before-the-signal run (a real race — the
 * conversion is fast) does not touch shared fixtures.
 */
function sendSignal(cmd: string, args: string[], signal: NodeJS.Signals): Promise<number | null> {
    return new Promise((resolve, reject) => {
        const child = spawn(cmd, args);
        const timer = setTimeout(() => {
            child.kill('SIGKILL');
            reject(new Error(`${cmd} did not exit within 5s of ${signal}`));
        }, 5000);
        child.on('exit', (code) => {
            clearTimeout(timer);
            resolve(code);
        });
        child.on('error', (e) => {
            clearTimeout(timer);
            reject(e);
        });
        // Fire as soon as possible: `installShutdownHandlers` (src/runtime.ts)
        // registers the handler synchronously before any async work starts.
        child.kill(signal);
    });
}

describe('convert CLI — SIGINT/SIGTERM handler presence', () => {
    // This station is Windows (win32): POSIX signal delivery to a child
    // process via child_process.kill('SIGINT'/'SIGTERM') is documented as
    // unreliable there for Node, Bun AND Deno alike (libuv signal
    // emulation) — sending the signal proves nothing here, so this block
    // self-skips on win32 rather than assert on flaky delivery. On a POSIX
    // host it sends the real signal and checks the mapped exit code
    // (130 / 143, `src/runtime.ts`'s `installShutdownHandlers`).
    const posix = process.platform !== 'win32';
    const t = posix ? test : test.skip;

    for (const rt of AVAILABLE) {
        t(`${rt.name}: SIGINT yields exit code 130`, async () => {
            const { cmd, args } = rt.spawn(['to-md', SAMPLE_DOCX, '--out', tmpFile(`${rt.name}-sigint.md`)]);
            const code = await sendSignal(cmd, args, 'SIGINT');
            expect(code).toBe(130);
        });

        t(`${rt.name}: SIGTERM yields exit code 143`, async () => {
            const { cmd, args } = rt.spawn(['to-md', SAMPLE_DOCX, '--out', tmpFile(`${rt.name}-sigterm.md`)]);
            const code = await sendSignal(cmd, args, 'SIGTERM');
            expect(code).toBe(143);
        });
    }

    if (!posix) {
        test.skip('win32: SIGINT/SIGTERM delivery to a child process is not reliably testable here — see the task report', () => {});
    }
});
