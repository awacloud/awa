// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * tools/convert/tests/docs-mirror.integration.test.ts — keeps `docs/api/`
 * a complete mirror of the package's public surface.
 *
 * The surface is read from the SOURCE at run time, never listed here:
 *   - core runtime exports: the live module namespace of `src/core.ts`;
 *   - core type exports: `export interface|type` declarations in `src/core.ts`;
 *   - CLI verbs: the `commands` set in `src/index.ts`;
 *   - MCP tools and their arguments: the live `TOOLS` registry of `src/mcp.ts`.
 * Each item must have its page or section, and every relative link under
 * `docs/` must resolve to an existing file and heading inside the package.
 * The non-vacuity leg pins the population sizes, so an extractor that
 * silently matches nothing fails instead of passing.
 */

import { describe, expect, test } from 'bun:test';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import * as core from '../src/core.ts';
import { TOOLS } from '../src/mcp.ts';

const PKG = join(import.meta.dir, '..');
const API = join(PKG, 'docs', 'api');
const read = (p: string): string => readFileSync(p, 'utf8');

const coreSource = read(join(PKG, 'src', 'core.ts'));
const runtimeExports = Object.keys(core).sort();
const functionExports = runtimeExports.filter((k) => typeof (core as Record<string, unknown>)[k] === 'function');
const constantExports = runtimeExports.filter((k) => typeof (core as Record<string, unknown>)[k] !== 'function');
const typeExports = [...coreSource.matchAll(/^export (?:interface|type) (\w+)/gm)].map((m) => m[1] as string).sort();

const commandsLiteral = read(join(PKG, 'src', 'index.ts')).match(/const commands = new Set\(\[([^\]]*)\]\)/);
const cliVerbs = commandsLiteral ? [...(commandsLiteral[1] as string).matchAll(/'([^']+)'/g)].map((m) => m[1] as string) : [];

/** GitHub-style heading anchor: lowercase, drop everything but letters, digits, spaces, `_` and `-`, spaces to `-`. */
function slug(heading: string): string {
    return heading.toLowerCase().replace(/[^a-z0-9 _-]/g, '').replace(/ /g, '-');
}

function headings(md: string): string[] {
    return [...md.matchAll(/^#{1,6} (.+)$/gm)].map((m) => (m[1] as string).trim());
}

/** The body of the `## <title>` section, up to the next `## ` heading. */
function section(md: string, title: string): string {
    const start = md.indexOf(`\n## ${title}\n`);
    if (start === -1) return '';
    const next = md.indexOf('\n## ', start + 1);
    return md.slice(start, next === -1 ? undefined : next);
}

function markdownFiles(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
        const p = join(dir, name);
        return statSync(p).isDirectory() ? markdownFiles(p) : p.endsWith('.md') ? [p] : [];
    });
}

describe('docs mirror — population (non-vacuity)', () => {
    test('the extractors see the whole surface', () => {
        expect(functionExports).toEqual(['convert', 'fromMd', 'isCoreError', 'toHtml', 'toMd']);
        expect(constantExports).toEqual(['CONVERT_PAIRS', 'FROM_MD_TARGETS', 'TO_MD_FORMATS']);
        expect(typeExports.length).toBe(14);
        expect(cliVerbs).toEqual(['to-md', 'from-md', 'convert', 'to-html']);
        expect(TOOLS.map((t) => t.name)).toEqual(['to_md', 'from_md', 'convert', 'to_html']);
    });
});

describe('docs mirror — core', () => {
    const index = read(join(API, 'README.md'));
    const types = read(join(API, 'types.md'));

    for (const name of functionExports) {
        test(`function ${name}: has docs/api/${name}.md with signature, input, output, errors and example`, () => {
            const page = join(API, `${name}.md`);
            expect(existsSync(page)).toBe(true);
            const md = read(page);
            expect(md.startsWith(`# \`${name}\`\n`)).toBe(true);
            expect(md).toContain(`function ${name}(`);
            for (const h of ['Input', 'Output', 'Errors', 'Example']) {
                expect(headings(md).some((x) => x === h || x.startsWith(`${h} `))).toBe(true);
            }
            expect(index).toContain(`[${name}.md](./${name}.md)`);
        });
    }

    for (const name of constantExports) {
        test(`constant ${name}: listed in types.md and the index`, () => {
            expect(section(types, 'Constants')).toContain(`| \`${name}\` |`);
            expect(index).toContain(`\`${name}\``);
        });
    }

    for (const name of typeExports) {
        test(`type ${name}: has a types.md section and an index entry`, () => {
            expect(headings(types)).toContain(`\`${name}\``);
            expect(section(types, `\`${name}\``)).toMatch(new RegExp(`(interface|type) ${name}\\b`));
            expect(index).toContain(`\`${name}\``);
        });
    }
});

describe('docs mirror — CLI and MCP', () => {
    const cli = read(join(API, 'cli.md'));
    const mcp = read(join(API, 'mcp.md'));

    for (const verb of cliVerbs) {
        test(`CLI verb ${verb}: has a cli.md section with an example`, () => {
            const body = section(cli, `\`${verb}\``);
            expect(body).not.toBe('');
            expect(body).toContain(`$ bun src/index.ts ${verb}`);
        });
    }

    for (const tool of TOOLS) {
        test(`MCP tool ${tool.name}: has an mcp.md section listing every argument, with an example`, () => {
            const body = section(mcp, `\`${tool.name}\``);
            expect(body).not.toBe('');
            for (const arg of Object.keys(tool.inputSchema.properties)) {
                expect(body).toContain(`| \`${arg}\` |`);
            }
            for (const arg of tool.inputSchema.required ?? []) {
                expect(body).toMatch(new RegExp(`\\| \`${arg}\` \\| [^|]+ \\| yes \\|`));
            }
            expect(body).toContain(`${tool.name} {`);
        });
    }
});

describe('docs links', () => {
    const files = markdownFiles(join(PKG, 'docs'));

    test('docs/ holds the guide and the api pages', () => {
        expect(files.length).toBeGreaterThanOrEqual(10);
    });

    for (const file of files) {
        test(`${relative(PKG, file).split(sep).join('/')}: every relative link resolves inside the package`, () => {
            // Fenced blocks and inline code spans are literal text, never links. A
            // code span inside a link label (`[`x`](y)`) still leaves `](y)` behind.
            const md = read(file).replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '');
            for (const m of md.matchAll(/\]\(([^)\s]+)\)/g)) {
                const target = m[1] as string;
                if (/^[a-z]+:/.test(target)) continue;
                const [path, anchor] = target.split('#') as [string, string | undefined];
                const abs = path === '' ? file : resolve(dirname(file), path);
                expect(`${target} -> ${relative(PKG, abs).startsWith('..') ? 'OUTSIDE' : 'inside'}`).toBe(`${target} -> inside`);
                expect(`${target} -> ${existsSync(abs) ? 'exists' : 'missing'}`).toBe(`${target} -> exists`);
                if (anchor !== undefined && abs.endsWith('.md')) {
                    expect(headings(read(abs)).map(slug)).toContain(anchor);
                }
            }
        });
    }
});

describe('docs mirror — --help stays in step with docs/api/cli.md', () => {
    test('the live Usage: block is byte-identical, line for line, to the cli.md fenced usage block', () => {
        // Keeps HELP (src/index.ts) and the reference (docs/api/cli.md) from
        // drifting apart again — BL-1637 (tools/LIGHT_33/01).
        const res = Bun.spawnSync(['bun', 'src/index.ts', '--help'], {
            cwd: PKG,
            stdout: 'pipe',
            stderr: 'pipe',
            timeout: 30_000,
        });
        expect(res.exitCode).toBe(0);
        const helpLines = res.stdout.toString('utf8').split(/\r?\n/);

        const start = helpLines.findIndex((l) => l.trim() === 'Usage:');
        expect(start, 'the --help text must have a Usage: header').toBeGreaterThanOrEqual(0);
        const end = helpLines.findIndex((l, i) => i > start && l.trim() === '');
        expect(end, 'the Usage: block must be followed by a blank line').toBeGreaterThan(start);
        const usageBlock = helpLines.slice(start + 1, end).map((l) => l.trim());

        const cli = read(join(API, 'cli.md'));
        const fenceMatch = /```text\n([\s\S]*?)\n```/.exec(cli);
        expect(fenceMatch, 'docs/api/cli.md must carry a ```text usage fence').not.toBeNull();
        const fenceBlock = (fenceMatch as RegExpExecArray)[1]!.split(/\r?\n/).map((l) => l.trim());

        expect(usageBlock.length, 'non-vacuity: the Usage: block must not be empty').toBeGreaterThan(0);
        expect(usageBlock).toEqual(fenceBlock);
    });
});
