// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * tools/convert/src/runtime.ts — the single per-runtime adapter for
 * `@awacloud/tool-convert`.
 *
 * Every capability that could conceivably differ between Bun, Node and Deno
 * — reading a file, writing a file, reading argv, writing to stdout/stderr,
 * exiting with a code, installing SIGINT/SIGTERM handlers — is declared
 * here, exactly once, and nowhere else in this package. `./index.ts` (the
 * CLI shell) calls only these functions; `./core.ts` (the conversion core)
 * touches none of them.
 *
 * ## Why there is no `if (runtime === ...)` branch anywhere below
 *
 * Empirically verified (bun 1.3.13, node 24.16.0, deno 2.8.3):
 * `node:fs`/`node:path` built-ins, the `process` global (argv, stdout/stderr,
 * exit, once('SIGINT'|'SIGTERM')) and `import.meta.main` behave IDENTICALLY
 * across all three — Deno's Node-compatibility layer and modern Node both
 * implement the same surface Bun already exposed. There is therefore
 * nothing to branch on for THIS CLI's capability set today. The rule is to
 * prefer the form that all three runtimes accept natively and to branch
 * only where the runtimes genuinely differ, so this module is a thin,
 * single-path wrapper — not three parallel implementations kept "just in
 * case". If a future capability needs a real branch, add it here with a
 * comment naming exactly what differs, never in `index.ts` or `core.ts`.
 *
 * @module tool-convert/runtime
 */

import { readFileSync, writeFileSync } from 'node:fs';

/** Read a file's raw bytes (binary-safe). */
export function readFileBytes(path: string): Uint8Array {
    return new Uint8Array(readFileSync(path));
}

/** Read a file as UTF-8 text. */
export function readFileText(path: string): string {
    return readFileSync(path, 'utf8');
}

/** Write bytes or text to a file, replacing it. */
export function writeFileOut(path: string, data: Uint8Array | string): void {
    writeFileSync(path, data);
}

/** Write bytes or text to stdout — the CLI's only success-output channel. */
export function writeStdout(data: Uint8Array | string): void {
    process.stdout.write(typeof data === 'string' ? data : Buffer.from(data));
}

/** Write text to stderr — diagnostics, warnings, loss counts. */
export function writeStderr(text: string): void {
    process.stderr.write(text);
}

/** The process argv, with the runtime/script leaders already stripped. */
export function argv(): string[] {
    return process.argv.slice(2);
}

/** Terminate the process with the given exit code. */
export function exit(code: number): never {
    process.exit(code);
}

/**
 * Install the SIGINT (→130) / SIGTERM (→143) handlers, once. On Windows —
 * this station's platform — libuv's POSIX-signal emulation is limited (Node,
 * Bun and Deno docs all note SIGINT/SIGTERM delivery to a *child* process is
 * unreliable there); the handlers are still installed unconditionally so
 * behaviour is identical everywhere a real signal DOES arrive (every POSIX
 * host), and the CLI's own exit-code contract is exercised directly by the
 * test suite rather than relying on OS signal delivery.
 */
export function installShutdownHandlers(): void {
    process.once('SIGINT', () => exit(130));
    process.once('SIGTERM', () => exit(143));
}

/** `true` when this module is the process entry point (not merely imported). */
export function isEntryPoint(meta: ImportMeta): boolean {
    return meta.main === true;
}
