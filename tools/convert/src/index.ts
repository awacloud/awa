// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * tools/convert/src/index.ts — `@awacloud/tool-convert` CLI entry.
 *
 *   bun src/index.ts to-md <file> [--format <fmt>] [--at <iso>] [--out <file>]
 *   bun src/index.ts from-md <file.md> --target <fmt> [--out <file>]
 *   bun src/index.ts convert <file> --target <fmt> [--format <fmt>] [--out <file>]
 *   bun src/index.ts to-html <file.md> [--out <file>]
 *   bun src/index.ts --help | -h
 *   bun src/index.ts --version | -v
 *
 * Thin CLI shell over the runtime-agnostic core (`./core.ts`): argv parsing,
 * file I/O and process/signal handling live here ONLY — the core touches
 * none of it (proved on Node/Deno by the runtime matrix).
 *
 * stdout/stderr discipline: with no `--out`, the converted bytes go to
 * stdout so the tool composes in a pipeline; every diagnostic, warning and
 * loss count goes to stderr. A conversion that records losses still exits 0
 * — losses are output, not failure. With `--out`, the bytes are written to
 * that file instead (never duplicated to stdout), and the file's bytes are
 * byte-identical to what stdout would have carried.
 *
 * Exit codes: 0 success · 1 generic error · 2 usage/config error (unknown
 * command, missing/unsupported `--target`, unsupported format/target/pair)
 * · 130 SIGINT · 143 SIGTERM. `--help`/`--version` always exit 0. No ANSI
 * escape is ever written to stdout (none is used anywhere in this module).
 *
 * @module tool-convert/cli
 */

import { basename } from 'node:path';
import pkg from '../package.json' with { type: 'json' };
import { convert, fromMd, isCoreError, toHtml, toMd, TO_MD_FORMATS, FROM_MD_TARGETS, CONVERT_PAIRS } from './core.ts';
import { timestampError } from './timestamp.ts';
import {
    argv as runtimeArgv,
    exit,
    installShutdownHandlers,
    isEntryPoint,
    readFileBytes,
    readFileText,
    writeFileOut,
    writeStderr,
    writeStdout,
} from './runtime.ts';

const EXIT_OK = 0;
const EXIT_ERROR = 1;
const EXIT_USAGE = 2;

const VERSION: string = typeof pkg.version === 'string' ? pkg.version : '0.0.0';

const HELP = `convert ${VERSION} — document conversion (@awacloud/oconv) at the command line

Usage:
  bun src/index.ts to-md <file> [--format <fmt>] [--at <iso>] [--out <file>]
  bun src/index.ts from-md <file.md> --target <fmt> [--out <file>]
  bun src/index.ts convert <file> --target <fmt> [--format <fmt>] [--out <file>]
  bun src/index.ts to-html <file.md> [--out <file>]
  bun src/index.ts --help | -h
  bun src/index.ts --version | -v

node src/index.ts takes the same arguments as the bun form above. So does
deno run --allow-read --allow-write src/index.ts.

Verbs:
  to-md      any supported input format to structured Markdown
             supported input formats: ${TO_MD_FORMATS.join(', ')}
  from-md    Markdown to a target format
             supported targets: ${FROM_MD_TARGETS.join(', ')}
  convert    a cross-format pair, direct (no Markdown pivot in the CLI output)
             supported pairs: ${CONVERT_PAIRS.join(', ')}
  to-html    Markdown to HTML through @awacloud/md's renderHtmlMod — a plain
             HTML fragment: no embedded CSS, no table of contents.

Flags:
  --format <fmt>   override extension-based source-format detection
  --target <fmt>   target format (required for from-md and convert)
  --out <file>     write output bytes here instead of stdout
  --at <iso>       to-md only: pin the provenance timestamp (default: now).
                   Must be an RFC 3339 date-time (e.g.
                   2026-01-01T00:00:00.000Z); anything else is a usage
                   error (exit 2), checked before any file I/O.
                   Reproducibility of the markdown output is caller-owned
                   (@awacloud/oconv never defaults this itself).

stdout/stderr: with no --out, converted bytes go to stdout (pipeable) and
every diagnostic/warning/loss count goes to stderr. A conversion with
losses still exits 0 — losses are output, not failure. With --out, bytes go
to that file only (never duplicated to stdout).

Exit codes: 0 ok · 1 generic error · 2 usage/config error · 130 SIGINT · 143 SIGTERM

No conversion pair is advertised beyond what @awacloud/oconv measurably
delivers, and a lossy pair records its loss count on stderr — see
@awacloud/oconv's docs/loss-matrix.md for the fidelity table per pair.
`;

interface Flags {
    command: string | undefined;
    file: string | undefined;
    format: string | undefined;
    target: string | undefined;
    out: string | undefined;
    at: string | undefined;
    help: boolean;
    version: boolean;
}

class CliError extends Error {}

function parseArgs(argv: string[]): Flags {
    const flags: Flags = {
        command: undefined,
        file: undefined,
        format: undefined,
        target: undefined,
        out: undefined,
        at: undefined,
        help: false,
        version: false,
    };
    const needValue = (flag: string, value: string | undefined): string => {
        if (value === undefined || value.startsWith('-')) throw new CliError(`convert: ${flag} requires a value`);
        return value;
    };
    for (let i = 0; i < argv.length; i += 1) {
        const a = argv[i] as string;
        switch (a) {
            case '-h':
            case '--help':
                flags.help = true;
                break;
            case '-v':
            case '--version':
                flags.version = true;
                break;
            case '--format':
                flags.format = needValue(a, argv[i + 1]);
                i += 1;
                break;
            case '--target':
                flags.target = needValue(a, argv[i + 1]);
                i += 1;
                break;
            case '--out':
                flags.out = needValue(a, argv[i + 1]);
                i += 1;
                break;
            case '--at':
                flags.at = needValue(a, argv[i + 1]);
                i += 1;
                break;
            default:
                if (a.startsWith('-')) throw new CliError(`convert: unknown flag: ${a}`);
                if (flags.command === undefined) flags.command = a;
                else if (flags.file === undefined) flags.file = a;
                else throw new CliError(`convert: unexpected argument: ${a}`);
        }
    }
    return flags;
}

function emitOutput(bytes: Uint8Array | string, out: string | undefined): void {
    if (out !== undefined) {
        writeFileOut(out, bytes);
        return;
    }
    writeStdout(bytes);
}

function reportLosses(lossy: boolean, count: number): void {
    if (lossy) writeStderr(`convert: ${count} loss${count === 1 ? '' : 'es'} recorded\n`);
}

async function run(argv: string[]): Promise<number> {
    let flags: Flags;
    try {
        flags = parseArgs(argv);
    } catch (e) {
        writeStderr(`${(e as Error).message}\n`);
        return EXIT_USAGE;
    }

    if (flags.help) {
        writeStdout(HELP);
        return EXIT_OK;
    }
    if (flags.version) {
        writeStdout(`${VERSION}\n`);
        return EXIT_OK;
    }

    if (flags.command === undefined) {
        writeStderr('convert: missing command (to-md | from-md | convert | to-html)\n');
        return EXIT_USAGE;
    }

    const commands = new Set(['to-md', 'from-md', 'convert', 'to-html']);
    if (!commands.has(flags.command)) {
        writeStderr(`convert: unknown command: ${flags.command}\n`);
        return EXIT_ERROR;
    }

    if (flags.file === undefined) {
        writeStderr(`convert: ${flags.command} requires a file argument\n`);
        return EXIT_USAGE;
    }

    if ((flags.command === 'from-md' || flags.command === 'convert') && flags.target === undefined) {
        writeStderr(`convert: ${flags.command} requires --target\n`);
        return EXIT_USAGE;
    }

    // `--at` is checked BEFORE any I/O — a usage error here must win even
    // when the input file does not exist.
    const convertedAt = flags.at ?? new Date().toISOString();
    if (flags.command === 'to-md') {
        const atError = timestampError(convertedAt);
        if (atError !== null) {
            writeStderr(`convert: --at: ${atError}\n`);
            return EXIT_USAGE;
        }
    }

    const name = basename(flags.file);

    try {
        if (flags.command === 'to-md') {
            const bytes = readFileBytes(flags.file);
            const result = await toMd({
                name,
                bytes,
                convertedAt,
                format: flags.format,
            });
            if (isCoreError(result)) {
                writeStderr(`convert: ${result.error}\n`);
                return result.usage ? EXIT_USAGE : EXIT_ERROR;
            }
            emitOutput(result.markdown, flags.out);
            reportLosses(result.lossy, result.losses.length);
            return EXIT_OK;
        }

        if (flags.command === 'from-md') {
            const markdown = readFileText(flags.file);
            const result = await fromMd({ markdown, name, target: flags.target });
            if (isCoreError(result)) {
                writeStderr(`convert: ${result.error}\n`);
                return result.usage ? EXIT_USAGE : EXIT_ERROR;
            }
            emitOutput(result.bytes, flags.out);
            reportLosses(result.lossy, result.losses.length);
            return EXIT_OK;
        }

        if (flags.command === 'convert') {
            const bytes = readFileBytes(flags.file);
            const target = flags.target as string;
            const result = await convert({ name, bytes, format: flags.format, target });
            if (isCoreError(result)) {
                writeStderr(`convert: ${result.error}\n`);
                return result.usage ? EXIT_USAGE : EXIT_ERROR;
            }
            emitOutput(result.bytes, flags.out);
            reportLosses(result.lossy, result.losses.length);
            return EXIT_OK;
        }

        // to-html
        const markdown = readFileText(flags.file);
        const result = await toHtml({ markdown });
        if (isCoreError(result)) {
            writeStderr(`convert: ${result.error}\n`);
            return result.usage ? EXIT_USAGE : EXIT_ERROR;
        }
        emitOutput(result.html, flags.out);
        return EXIT_OK;
    } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        writeStderr(`convert: ${message}\n`);
        return EXIT_ERROR;
    }
}

if (isEntryPoint(import.meta)) {
    installShutdownHandlers();

    run(runtimeArgv())
        .then((code) => exit(code))
        .catch((e: unknown) => {
            writeStderr(`convert: ${(e as Error).message}\n`);
            exit(EXIT_ERROR);
        });
}
