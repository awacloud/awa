// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * tools/convert/src/index.ts — `@awacloud/tool-convert` CLI entry.
 *
 *   bun src/index.ts to-md <file> [--format <fmt>] [--at <iso>] [--out <file>] [to-md options]
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
 * The `to-md` options mirror `@awacloud/oconv`'s `toMd` inputs one to one
 * (`TO_MD_VALUE_FLAGS`, `TO_MD_SWITCHES`); `oconv` validates every value,
 * and its refusal is a usage error. A pdf password is read from a file
 * (`--password-file`), never taken from argv, where the process list
 * would show it.
 *
 * @module tool-convert/cli
 */

import { basename } from 'node:path';
import pkg from '../package.json' with { type: 'json' };
import {
    assetFiles,
    convert,
    fromMd,
    isCoreError,
    toHtml,
    toMd,
    TO_MD_FORMATS,
    FROM_MD_TARGETS,
    CONVERT_PAIRS,
    type Asset,
    type ToMdInput,
} from './core.ts';
import { passwordFromFile } from './password.ts';
import { timestampError } from './timestamp.ts';
import {
    argv as runtimeArgv,
    exit,
    installShutdownHandlers,
    isEntryPoint,
    readFileBytes,
    readFileText,
    writeFileOut,
    writeFileUnder,
    writeStderr,
    writeStdout,
} from './runtime.ts';

const EXIT_OK = 0;
const EXIT_ERROR = 1;
const EXIT_USAGE = 2;

const VERSION: string = typeof pkg.version === 'string' ? pkg.version : '0.0.0';

const HELP = `convert ${VERSION} — document conversion (@awacloud/oconv) at the command line

Usage:
  bun src/index.ts to-md <file> [--format <fmt>] [--at <iso>] [--out <file>] [to-md options]
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
  --sheets <mode>  to-md only, xlsx and ods sources: table (default, GFM
                   tables), csv or tsv (each sheet a fenced csv / tsv block,
                   much smaller on a dense sheet); another value, or another
                   source format, is a usage error (exit 2)
  --at <iso>       to-md only: pin the provenance timestamp (default: now).
                   Must be an RFC 3339 date-time (e.g.
                   2026-01-01T00:00:00.000Z); anything else is a usage
                   error (exit 2), checked before any file I/O.
                   Reproducibility of the markdown output is caller-owned
                   (@awacloud/oconv never defaults this itself).

to-md options (each one @awacloud/oconv's toMd input of the same name; on
another verb, on a source format it does not apply to, or with a value
oconv refuses, it is a usage error, exit 2; lists are comma-separated):
  --pdf-infer <list>      pdf: inference on an untagged pdf — headings, tables,
                          running (headers and footers left out)
  --pdf-declare <list>    pdf: record a silent case — positional
  --pdf-include <list>    pdf: parts brought back — images (see --assets-dir)
  --pdf-recover-xref      pdf: rebuild an unusable cross-reference chain
  --pdf-line-hyphens <m>  pdf: join a word a hyphen cuts at a line end —
                          drop (without the hyphen) or keep (with it)
  --password-file <file>  pdf: read the user or owner password from this
                          file (one trailing line break is dropped); a
                          password is never taken on the command line
  --form-op-budget <n>    pdf: per-page Form XObject operator budget
                          (default 1000000)
  --odt-include <list>    odt: parts brought back — toc
  --docx-include <list>   docx: parts brought back — toc
  --sheet-cell-budget <n> xlsx, ods: a sheet whose padded table would hold
                          more cells is written unpadded, one addressed
                          line per value (sheet/sparse-form)
  --max-parts <n>, --max-uncompressed <bytes>, --max-ratio <n>,
  --max-depth <n>         office formats: the reader's archive limits
                          (archiveLimits; 0 disables a check; odt, ods
                          and odp take the first three)
  --output-budget <bytes> every format: a bound on the document's text,
                          checked before the markdown is built; past it
                          the conversion fails (exit 1) unless
  --output-overflow <m>   is truncate: keep what fits (doc/truncated);
                          throw is the default
  --include-notes         pptx, odp: render speaker notes
  --front-matter <mode>   full (default), compact or none
  --assets-dir <dir>      write each image whose bytes the conversion
                          returned under <dir>, at the path the markdown
                          names; an image without bytes or with an unsafe
                          name is reported on stderr and not written

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
    sheets: string | undefined;
    pdfInfer: string | undefined;
    pdfDeclare: string | undefined;
    pdfInclude: string | undefined;
    odtInclude: string | undefined;
    docxInclude: string | undefined;
    formOpBudget: string | undefined;
    frontMatter: string | undefined;
    passwordFile: string | undefined;
    assetsDir: string | undefined;
    sheetCellBudget: string | undefined;
    maxParts: string | undefined;
    maxUncompressed: string | undefined;
    maxRatio: string | undefined;
    maxDepth: string | undefined;
    outputBudget: string | undefined;
    outputOverflow: string | undefined;
    pdfLineHyphens: string | undefined;
    includeNotes: boolean;
    pdfRecoverXref: boolean;
    help: boolean;
    version: boolean;
}

type ToMdValueKey = 'sheets' | 'pdfInfer' | 'pdfDeclare' | 'pdfInclude' | 'odtInclude' | 'docxInclude' | 'formOpBudget' | 'frontMatter' | 'passwordFile' | 'assetsDir'
    | 'sheetCellBudget' | 'maxParts' | 'maxUncompressed' | 'maxRatio' | 'maxDepth' | 'outputBudget' | 'outputOverflow' | 'pdfLineHyphens';

/** The `to-md`-only flags that take a value, each with the field `parseArgs` fills. */
const TO_MD_VALUE_FLAGS = new Map<string, ToMdValueKey>([
    ['--sheets', 'sheets'],
    ['--pdf-infer', 'pdfInfer'],
    ['--pdf-declare', 'pdfDeclare'],
    ['--pdf-include', 'pdfInclude'],
    ['--odt-include', 'odtInclude'],
    ['--docx-include', 'docxInclude'],
    ['--form-op-budget', 'formOpBudget'],
    ['--front-matter', 'frontMatter'],
    ['--password-file', 'passwordFile'],
    ['--assets-dir', 'assetsDir'],
    ['--sheet-cell-budget', 'sheetCellBudget'],
    ['--max-parts', 'maxParts'],
    ['--max-uncompressed', 'maxUncompressed'],
    ['--max-ratio', 'maxRatio'],
    ['--max-depth', 'maxDepth'],
    ['--output-budget', 'outputBudget'],
    ['--output-overflow', 'outputOverflow'],
    ['--pdf-line-hyphens', 'pdfLineHyphens'],
]);

/** The `to-md`-only switches. */
const TO_MD_SWITCHES = new Map<string, 'includeNotes' | 'pdfRecoverXref'>([
    ['--include-notes', 'includeNotes'],
    ['--pdf-recover-xref', 'pdfRecoverXref'],
]);

class CliError extends Error {}

function parseArgs(argv: string[]): Flags {
    const flags: Flags = {
        command: undefined,
        file: undefined,
        format: undefined,
        target: undefined,
        out: undefined,
        at: undefined,
        sheets: undefined,
        pdfInfer: undefined,
        pdfDeclare: undefined,
        pdfInclude: undefined,
        odtInclude: undefined,
        docxInclude: undefined,
        formOpBudget: undefined,
        frontMatter: undefined,
        passwordFile: undefined,
        assetsDir: undefined,
        sheetCellBudget: undefined,
        maxParts: undefined,
        maxUncompressed: undefined,
        maxRatio: undefined,
        maxDepth: undefined,
        outputBudget: undefined,
        outputOverflow: undefined,
        pdfLineHyphens: undefined,
        includeNotes: false,
        pdfRecoverXref: false,
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
            default: {
                const valueKey = TO_MD_VALUE_FLAGS.get(a);
                if (valueKey !== undefined) {
                    flags[valueKey] = needValue(a, argv[i + 1]);
                    i += 1;
                    break;
                }
                const switchKey = TO_MD_SWITCHES.get(a);
                if (switchKey !== undefined) {
                    flags[switchKey] = true;
                    break;
                }
                if (a.startsWith('-')) throw new CliError(`convert: unknown flag: ${a}`);
                if (flags.command === undefined) flags.command = a;
                else if (flags.file === undefined) flags.file = a;
                else throw new CliError(`convert: unexpected argument: ${a}`);
            }
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

/** The `toMd` options the flags carry — only those given, so an absent flag leaves oconv's default. */
function toMdOptions(flags: Flags): Partial<ToMdInput> {
    const list = (value: string | undefined): string[] | undefined => value?.split(',');
    const num = (value: string | undefined): number | undefined => (value === undefined ? undefined : Number(value));
    // The archive limits given, as one object; oconv refuses a bad number.
    const limits = Object.fromEntries(Object.entries({
        maxParts: num(flags.maxParts),
        maxUncompressed: num(flags.maxUncompressed),
        maxRatio: num(flags.maxRatio),
        maxDepth: num(flags.maxDepth),
    }).filter(([, v]) => v !== undefined));
    // `--output-overflow` alone reaches oconv without `bytes`: its refusal names the mistake.
    const outputBudget = flags.outputBudget === undefined && flags.outputOverflow === undefined ? undefined
        : Object.fromEntries(Object.entries({ bytes: num(flags.outputBudget), overflow: flags.outputOverflow }).filter(([, v]) => v !== undefined));
    const options: Partial<ToMdInput> = {
        sheets: flags.sheets,
        pdfInfer: list(flags.pdfInfer),
        pdfDeclare: list(flags.pdfDeclare),
        pdfInclude: list(flags.pdfInclude),
        odtInclude: list(flags.odtInclude),
        docxInclude: list(flags.docxInclude),
        formOpBudget: flags.formOpBudget === undefined ? undefined : Number(flags.formOpBudget),
        pdfPassword: flags.passwordFile === undefined ? undefined : passwordFromFile(readFileBytes(flags.passwordFile)),
        pdfRecoverXref: flags.pdfRecoverXref || undefined,
        pdfLineHyphens: flags.pdfLineHyphens,
        includeNotes: flags.includeNotes || undefined,
        sheetCellBudget: num(flags.sheetCellBudget),
        archiveLimits: Object.keys(limits).length ? limits : undefined,
        outputBudget: outputBudget as ToMdInput['outputBudget'],
        opts: flags.frontMatter === undefined ? undefined : { frontMatter: flags.frontMatter },
    };
    return Object.fromEntries(Object.entries(options).filter(([, v]) => v !== undefined));
}

/** Write the assets `assetFiles` accepts under `dir`; one stderr line per skipped asset. */
function writeAssets(dir: string, assets: Asset[]): void {
    const { files, skipped } = assetFiles(assets);
    for (const f of files) writeFileUnder(dir, f.name, f.bytes);
    for (const a of skipped) writeStderr(`convert: asset ${JSON.stringify(a.name)} not written (${a.reason})\n`);
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

    if (flags.command !== 'to-md') {
        const misplaced =
            [...TO_MD_VALUE_FLAGS].find(([, key]) => flags[key] !== undefined) ?? [...TO_MD_SWITCHES].find(([, key]) => flags[key]);
        if (misplaced !== undefined) {
            writeStderr(`convert: ${misplaced[0]} is a to-md flag\n`);
            return EXIT_USAGE;
        }
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
            const result = await toMd({ name, bytes, convertedAt, format: flags.format, ...toMdOptions(flags) });
            if (isCoreError(result)) {
                writeStderr(`convert: ${result.error}\n`);
                return result.usage ? EXIT_USAGE : EXIT_ERROR;
            }
            emitOutput(result.markdown, flags.out);
            if (flags.assetsDir !== undefined) writeAssets(flags.assetsDir, result.assets);
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
