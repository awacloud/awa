// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * tools/convert/tests/shipped-surface.integration.test.ts — the shipped
 * surface of `@awacloud/tool-convert` carries no internal reference, and
 * this guard keeps it at zero (BL-1637).
 *
 * Population: read at RUN TIME from `npm pack --dry-run --json
 * --ignore-scripts`, spawned with `cwd = tools/convert`, never a hardcoded
 * list — the package declares no `prepack`/build step, so the packed set's
 * bytes are the on-disk bytes. A spawn failure or an unparseable result
 * FAILS the suite (throws at module load, before any test runs); it never
 * skips — a skip would be inconclusive, not a pass.
 *
 * Swept files = the population minus `LICENSE` (the verbatim licence text).
 * `NOTICE` IS swept, so this guard is re-run after a later merge re-stamps
 * it.
 *
 * Six legs:
 *   (a) process-token sweep over every swept file, `.ts` comments included
 *       — the lot-1 token set (`DOC_TOKENS` in `tests/helpers/internal-ref-tokens.ts`)
 *       plus five tokens this record adds (CLI_TS, PLAN_SLUG, PROCESS_REF,
 *       OWNER_RULING, ORCHESTRATOR) and tools/LIGHT_32's MERGE_PLACEHOLDER;
 *       the token set and the monorepo-path detector are importable from
 *       `./shipped-surface-detectors.ts`;
 *   (b) monorepo-path sweep — every shipped `*.md`, the source
 *       `package.json` (with `repository.directory` deleted, an
 *       L3-required field), the LIVE `--help` text and the LIVE MCP
 *       registry. Never runs over `.ts` comments: the file-self-path first
 *       line of every module (`tools/convert/src/<x>.ts — ...`) is a lot-1
 *       convention this guard does not sweep in comments;
 *   (c) link leg — every relative link of every shipped `*.md` resolves to
 *       a member of the shipped set (no escape, no dangle), and every
 *       `github.com/awacloud/awa/(blob|tree)/<release tag>/<path>` URL (the
 *       tag is `<npm name>@<version>`, read from the manifest) names a path
 *       that exists on disk and lies inside a lot-1/lot-2 distribution row
 *       or a `public-slice.json` root file — both read at run time;
 *   (d) live-string path leg — every `docs/<x>.md` path named in the live
 *       `--help` text or the MCP registry is either a shipped file or
 *       explicitly attributed to `@awacloud/oconv`;
 *   (e) README required-content leg — Installation / Licence / Project,
 *       values read from the package's own manifest and NOTICE, never
 *       invented;
 *   (f) negative controls for (a)–(d)'s own instruments.
 *
 * Masking helpers (`maskFences`, `codeSpanRanges`, `extractLinkTargets`)
 * are copied, not imported, from
 * `tests/publication-exported-docs.integration.test.ts:147-204` — that
 * file is a root test, not a module this package can import.
 */

import { describe, expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { TOOLS } from '../src/mcp.ts';
import {
    MONOREPO_PATH_RE,
    RELEASE_REF,
    RELEASE_REF_RE,
    TOKENS,
    maskGithubUrls,
    monorepoPathHits,
    tokenHits,
} from './shipped-surface-detectors.ts';

const PKG = join(import.meta.dir, '..');
const REPO_ROOT = join(PKG, '..', '..');

const toPosix = (p: string): string => p.split(sep).join('/');

/* ── population: npm pack --dry-run --json --ignore-scripts ─────────────── */

interface PackedFile {
    path: string;
}

/**
 * Read the shipped file list from `npm pack`'s own dry-run report — never a
 * hardcoded list. A spawn failure or a non-zero exit FAILS the suite with a
 * clear message; it never returns an empty/partial population silently.
 */
function readPopulation(): string[] {
    let res: ReturnType<typeof Bun.spawnSync>;
    try {
        res = Bun.spawnSync(['npm', 'pack', '--dry-run', '--json', '--ignore-scripts'], {
            cwd: PKG,
            stdout: 'pipe',
            stderr: 'pipe',
            timeout: 60_000,
        });
    } catch (e) {
        throw new Error(`shipped-surface: spawning npm failed — ${(e as Error).message}`, { cause: e });
    }
    if (res.exitCode !== 0) {
        const stderr = res.stderr ? res.stderr.toString('utf8') : '';
        throw new Error(
            `shipped-surface: npm pack --dry-run --json --ignore-scripts exited ${String(res.exitCode)}: ${stderr}`,
        );
    }
    const stdout = res.stdout ? res.stdout.toString('utf8') : '';
    let parsed: Array<{ files?: PackedFile[] }>;
    try {
        parsed = JSON.parse(stdout) as Array<{ files?: PackedFile[] }>;
    } catch (e) {
        throw new Error(
            `shipped-surface: npm pack --dry-run --json produced unparseable output — ${(e as Error).message}: ${stdout.slice(0, 500)}`,
            { cause: e },
        );
    }
    const files = parsed[0]?.files;
    if (!files || files.length === 0) {
        throw new Error('shipped-surface: npm pack --dry-run reported an empty file set');
    }
    return files.map((f) => f.path).sort();
}

const POPULATION = readPopulation();
const POPULATION_SET = new Set(POPULATION);
/** The population minus `LICENSE` (verbatim licence text) — swept by every text leg. `NOTICE` stays in. */
const SWEPT = POPULATION.filter((p) => p !== 'LICENSE');
const SWEPT_MD = SWEPT.filter((p) => p.endsWith('.md'));

/* ── live surfaces, captured once at module load ─────────────────────────── */

function spawnHelp(): string {
    const res = Bun.spawnSync(['bun', 'src/index.ts', '--help'], {
        cwd: PKG,
        stdout: 'pipe',
        stderr: 'pipe',
        timeout: 30_000,
    });
    if (res.exitCode !== 0) {
        throw new Error(`shipped-surface: bun src/index.ts --help exited ${String(res.exitCode)}: ${res.stderr.toString('utf8')}`);
    }
    return res.stdout.toString('utf8');
}

const HELP_TEXT = spawnHelp();
const MCP_REGISTRY_TEXT = JSON.stringify(
    TOOLS.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })),
);

/* ── leg (a): the process-token set ──────────────────────────────────────── */

describe('leg (a) — process-token sweep (.ts comments included)', () => {
    test('0 hits across every swept file', () => {
        const bad: string[] = [];
        for (const rel of SWEPT) {
            const text = readFileSync(join(PKG, rel), 'utf8');
            bad.push(...tokenHits(rel, text));
        }
        expect(bad, bad.join('\n')).toEqual([]);
    });
});

/* ── leg (b): the monorepo-path leg ──────────────────────────────────────── */

describe('leg (b) — monorepo-path sweep (no .ts comments: the file-self-path convention stays)', () => {
    test('0 hits across every shipped *.md', () => {
        const bad: string[] = [];
        for (const rel of SWEPT_MD) {
            bad.push(...monorepoPathHits(rel, readFileSync(join(PKG, rel), 'utf8')));
        }
        expect(bad, bad.join('\n')).toEqual([]);
    });

    test('0 hits in the source package.json, repository.directory excluded', () => {
        const manifest = JSON.parse(readFileSync(join(PKG, 'package.json'), 'utf8')) as {
            repository?: { directory?: string };
        };
        if (manifest.repository) delete manifest.repository.directory;
        const bad = monorepoPathHits('package.json', JSON.stringify(manifest, null, 2));
        expect(bad, bad.join('\n')).toEqual([]);
    });

    test('0 hits in the live --help text', () => {
        const bad = monorepoPathHits('--help', HELP_TEXT);
        expect(bad, bad.join('\n')).toEqual([]);
    });

    test('0 hits in the live MCP registry (name, description, inputSchema)', () => {
        const bad = monorepoPathHits('mcp registry', MCP_REGISTRY_TEXT);
        expect(bad, bad.join('\n')).toEqual([]);
    });
});

/* ── leg (c): the link leg ───────────────────────────────────────────────── */

/**
 * Blank fenced code blocks, length-preservingly. CommonMark: a closing fence
 * carries NO info string and is at least as long as the opening one, so a
 * ```js opener nested inside a ```markdown block does not close it. Copied
 * from tests/publication-exported-docs.integration.test.ts (that file is
 * not importable).
 */
function maskFences(text: string): string {
    const lines = text.split('\n');
    const out: string[] = [];
    let fenceChar = '';
    let fenceLen = 0;
    for (const line of lines) {
        const open = /^\s{0,3}(`{3,}|~{3,})(.*)$/.exec(line);
        if (fenceLen === 0) {
            if (open) {
                fenceChar = (open[1] as string)[0] as string;
                fenceLen = (open[1] as string).length;
                out.push(' '.repeat(line.length));
                continue;
            }
            out.push(line);
        } else {
            if (open && (open[1] as string)[0] === fenceChar && (open[1] as string).length >= fenceLen && (open[2] ?? '').trim() === '') {
                fenceLen = 0;
                fenceChar = '';
            }
            out.push(' '.repeat(line.length));
        }
    }
    return out.join('\n');
}

function codeSpanRanges(text: string): Array<[number, number]> {
    const ranges: Array<[number, number]> = [];
    const re = /(`+)(?:(?!\1)[\s\S])*?\1/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) ranges.push([m.index, m.index + m[0].length]);
    return ranges;
}

const insideSpan = (ranges: Array<[number, number]>, a: number, b: number): boolean =>
    ranges.some(([s, e]) => a >= s && b <= e);

/** Every real `[label](target)` target of `text` — fenced blocks and whole-span matches excluded. */
function extractLinkTargets(text: string): string[] {
    const masked = maskFences(text);
    const spans = codeSpanRanges(masked);
    const out: string[] = [];
    const re = /\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
        if (masked.slice(m.index, m.index + m[0].length) !== m[0]) continue;
        if (insideSpan(spans, m.index, m.index + m[0].length)) continue;
        out.push(m[1] ?? '');
    }
    return out;
}

const isAbsoluteUrlOrAnchor = (t: string): boolean => /^[a-z][a-z0-9+.-]*:/i.test(t) || t.startsWith('#');
const stripFragment = (t: string): string => (t.indexOf('#') === -1 ? t : t.slice(0, t.indexOf('#')));

/**
 * Resolve every RELATIVE link of `absFile` against the package: "shipped"
 * means the resolved path is a member of the npm-reported population, not
 * merely `existsSync` — the package directory also holds `tests/`,
 * `node_modules/`, `eslint.config.js`, `tsconfig.json`, none of which ship.
 *
 * Fragment trap (publication memory 2026-09-23): a `#fragment` is stripped
 * and only the PATH is checked against the shipped set — this leg never
 * verifies the fragment names a real heading in the target file. Same
 * design as `tests/publication-exported-docs.integration.test.ts`'s link
 * model (see its header comment, § "Link model").
 */
function resolveRelativeLinks(absFile: string): Array<{ target: string; shipped: boolean; escapes: boolean }> {
    const rows: Array<{ target: string; shipped: boolean; escapes: boolean }> = [];
    const srcDir = dirname(absFile);
    for (const target of extractLinkTargets(readFileSync(absFile, 'utf8'))) {
        if (isAbsoluteUrlOrAnchor(target)) continue;
        const stripped = stripFragment(target);
        if (stripped === '') continue;
        const resolvedAbs = join(srcDir, stripped);
        const relFromPkg = toPosix(relative(PKG, resolvedAbs));
        const escapes = relFromPkg.startsWith('..') || relFromPkg === '..';
        rows.push({ target, shipped: !escapes && POPULATION_SET.has(relFromPkg), escapes });
    }
    return rows;
}

function extractGithubAwaUrls(text: string): Array<{ kind: 'blob' | 'tree'; path: string }> {
    const out: Array<{ kind: 'blob' | 'tree'; path: string }> = [];
    const re = new RegExp(`https://github\\.com/awacloud/awa/(blob|tree)/${RELEASE_REF_RE}/([^\\s)"'\\]]+)`, 'g');
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
        out.push({ kind: m[1] as 'blob' | 'tree', path: (m[2] ?? '').replace(/[).,]+$/, '') });
    }
    return out;
}

/** `distribution.packages[]` dirs whose `lot` is in `lots`, read at run time (never pinned). */
function distributionDirs(lots: number[]): string[] {
    const raw = JSON.parse(readFileSync(join(REPO_ROOT, 'awf.config.json'), 'utf8')) as {
        distribution?: { packages?: Array<{ dir: string; lot?: number }> };
    };
    return (raw.distribution?.packages ?? []).filter((r) => r.lot !== undefined && lots.includes(r.lot)).map((r) => r.dir);
}

/** `public-slice.json`'s `rootFiles`, read at run time (never pinned). */
function sliceRootFiles(): string[] {
    const raw = JSON.parse(readFileSync(join(REPO_ROOT, 'docs/publication/public-slice.json'), 'utf8')) as {
        rootFiles?: string[];
    };
    return raw.rootFiles ?? [];
}

function isInDistOrSlice(relPath: string, dirs: string[], rootFiles: string[]): boolean {
    const norm = toPosix(relPath);
    for (const d of dirs) if (norm === d || norm.startsWith(`${d}/`)) return true;
    for (const f of rootFiles) if (norm === f || norm.startsWith(`${f}/`)) return true;
    return false;
}

describe('leg (c) — link leg', () => {
    test('every relative link of every shipped *.md resolves to a shipped file — no escape, no dangle', () => {
        let checked = 0;
        const bad: string[] = [];
        for (const rel of SWEPT_MD) {
            for (const link of resolveRelativeLinks(join(PKG, rel))) {
                checked++;
                if (link.escapes) bad.push(`${rel}: ESCAPES -> ${link.target}`);
                else if (!link.shipped) bad.push(`${rel}: DANGLES (not in the shipped set) -> ${link.target}`);
            }
        }
        expect(checked, 'non-vacuity: at least one relative link must be checked').toBeGreaterThan(0);
        expect(bad, bad.join('\n')).toEqual([]);
    });

    test('every github.com/awacloud/awa/(blob|tree)/<release tag>/<path> URL names a real, in-lot (1 or 2) or in-slice path', () => {
        const dirs = distributionDirs([1, 2]);
        const rootFiles = sliceRootFiles();
        let checked = 0;
        const bad: string[] = [];
        for (const rel of SWEPT_MD) {
            const text = readFileSync(join(PKG, rel), 'utf8');
            for (const url of extractGithubAwaUrls(text)) {
                checked++;
                const exists = existsSync(join(REPO_ROOT, url.path));
                const inScope = isInDistOrSlice(url.path, dirs, rootFiles);
                if (!exists || !inScope) bad.push(`${rel}: ${url.kind} ${url.path} (exists=${String(exists)}, inScope=${String(inScope)})`);
            }
        }
        expect(checked, 'non-vacuity: at least one github.com/awacloud/awa URL must be checked').toBeGreaterThan(0);
        expect(bad, bad.join('\n')).toEqual([]);
    });
});

/* ── leg (d): the live-string path leg ───────────────────────────────────── */

/**
 * Every `docs/<x>.md` path mentioned in `text`, with whether the ~40 chars
 * right before it read as an attribution to oconv ("@awacloud/oconv's " or
 * "office/oconv's ", both used across this package's live strings today).
 */
function docsMdClaims(text: string): Array<{ path: string; attributedToOconv: boolean }> {
    const out: Array<{ path: string; attributedToOconv: boolean }> = [];
    const re = /docs\/[\w./-]+\.md\b/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
        const before = text.slice(Math.max(0, m.index - 40), m.index);
        out.push({ path: m[0], attributedToOconv: /oconv's\s*$/.test(before) });
    }
    return out;
}

describe('leg (d) — live-string path leg', () => {
    test('every docs/<x>.md path named in --help or the MCP registry is shipped or explicitly attributed to @awacloud/oconv', () => {
        const claims = [
            ...docsMdClaims(HELP_TEXT).map((c) => ({ ...c, source: '--help' })),
            ...docsMdClaims(MCP_REGISTRY_TEXT).map((c) => ({ ...c, source: 'mcp registry' })),
        ];
        expect(claims.length, 'non-vacuity: at least one docs/<x>.md path must be named').toBeGreaterThan(0);
        const bad = claims.filter((c) => !c.attributedToOconv && !POPULATION_SET.has(c.path)).map((c) => `${c.source}: ${c.path}`);
        expect(bad, bad.join('\n')).toEqual([]);
    });
});

/* ── leg (e): README required-content leg ────────────────────────────────── */

/** The body of a `## <heading>` section, up to the next `## ` heading (or "" if absent). */
function sectionOf(text: string, heading: string): string {
    const lines = text.split(/\r?\n/);
    const start = lines.findIndex((l) => l.trim() === heading);
    if (start === -1) return '';
    let end = lines.length;
    for (let i = start + 1; i < lines.length; i++) {
        if (/^##\s/.test(lines[i] ?? '')) {
            end = i;
            break;
        }
    }
    return lines.slice(start, end).join('\n');
}

describe('leg (e) — README required-content (values read from the manifest and NOTICE)', () => {
    const readmeText = readFileSync(join(PKG, 'README.md'), 'utf8');
    const manifest = JSON.parse(readFileSync(join(PKG, 'package.json'), 'utf8')) as {
        name: string;
        license: string;
        repository: { directory: string };
    };
    const noticeText = readFileSync(join(PKG, 'NOTICE'), 'utf8');
    const copyrightLine = noticeText.split(/\r?\n/).find((l) => l.startsWith('Copyright (c)'));

    test('line 1 is the package heading', () => {
        expect(readmeText.split(/\r?\n/)[0]).toBe(`# ${manifest.name}`);
    });

    test('## Installation names the npm install command', () => {
        const section = sectionOf(readmeText, '## Installation');
        expect(section, '## Installation section must exist').not.toBe('');
        expect(section).toContain(`npm install ${manifest.name}`);
    });

    test("## Licence names the licence, links LICENSE, and quotes NOTICE's copyright line", () => {
        expect(copyrightLine, 'NOTICE must carry a Copyright (c) line').toBeDefined();
        const section = sectionOf(readmeText, '## Licence');
        expect(section, '## Licence section must exist').not.toBe('');
        expect(section).toContain(manifest.license);
        expect(section).toMatch(/\]\(\.?\/?LICENSE\)/);
        expect(section).toContain(copyrightLine as string);
    });

    test('## Project names the site, the issues tracker, SECURITY.md and the source tree', () => {
        const section = sectionOf(readmeText, '## Project');
        expect(section, '## Project section must exist').not.toBe('');
        expect(section).toContain('https://awaforge.eu');
        expect(section).toContain('https://github.com/awacloud/awa/issues');
        expect(section).toContain(`https://github.com/awacloud/awa/blob/${RELEASE_REF}/SECURITY.md`);
        expect(section).toContain(`https://github.com/awacloud/awa/tree/${RELEASE_REF}/${manifest.repository.directory}`);
    });
});

/* ── leg (f): negative controls ──────────────────────────────────────────── */

describe('leg (f) — negative controls', () => {
    test('every process-token pattern matches its own negative control', () => {
        for (const tok of TOKENS) {
            expect(tok.re.test(tok.negativeControl), `token ${tok.id} did not match its own negative control`).toBe(true);
        }
    });

    test('AI_PATH does not fire inside a longer word (chai/)', () => {
        expect(TOKENS.find((t) => t.id === 'AI_PATH')?.re.test('chai/index.js')).toBe(false);
    });

    test('WAVE_ID does not fire on W3C', () => {
        expect(TOKENS.find((t) => t.id === 'WAVE_ID')?.re.test('a W3C recommendation')).toBe(false);
    });

    test('PROCESS_REF fires on plain-language process wording', () => {
        const processRef = TOKENS.find((t) => t.id === 'PROCESS_REF')!.re;
        for (const line of ['The plan requires a rewrite', "Per the plan's instruction", 'See the task report']) {
            expect(processRef.test(line), line).toBe(true);
        }
    });

    test('PROCESS_REF does not fire on ordinary words', () => {
        const processRef = TOKENS.find((t) => t.id === 'PROCESS_REF')!.re;
        for (const line of ['the planner', 'the planar graph', 'a test report']) {
            expect(processRef.test(line), line).toBe(false);
        }
    });

    test('the monorepo-path leg does not fire on the MCP method names tools/list, tools/call', () => {
        expect(MONOREPO_PATH_RE.test('tools/list')).toBe(false);
        expect(MONOREPO_PATH_RE.test('tools/call')).toBe(false);
    });

    test('the monorepo-path leg masks a github blob/tree URL before matching', () => {
        const url = `https://github.com/awacloud/awa/tree/${RELEASE_REF}/packages/front/office/oconv`;
        expect(MONOREPO_PATH_RE.test(maskGithubUrls(url))).toBe(false);
        // Unmasked, the same URL's path DOES match — proving the mask, not the
        // pattern, is what keeps this control quiet.
        expect(MONOREPO_PATH_RE.test(url)).toBe(true);
    });

    test('the link extractor is falsified in both directions', () => {
        expect(extractLinkTargets('see [x](./a.md) here')).toEqual(['./a.md']);
        expect(extractLinkTargets('```markdown\n[x](./a.md)\n```\n')).toEqual([]);
        expect(extractLinkTargets('write `[x](./a.md)` like this')).toEqual([]);
    });
});

/* ── population — non-vacuity pins ───────────────────────────────────────── */

describe('population — non-vacuity pins', () => {
    test('required root files are present', () => {
        for (const f of ['package.json', 'README.md', 'CHANGELOG.md', 'NOTICE', 'LICENSE']) {
            expect(POPULATION, `missing ${f}`).toContain(f);
        }
    });

    test('at least one docs/api/*.md ships', () => {
        expect(POPULATION.filter((p) => p.startsWith('docs/api/') && p.endsWith('.md')).length).toBeGreaterThan(0);
    });

    test('exactly the 6 src/*.ts ship, pinned by name', () => {
        const srcTs = POPULATION.filter((p) => p.startsWith('src/') && p.endsWith('.ts')).sort();
        expect(srcTs).toEqual([
            'src/core.ts',
            'src/descriptors.ts',
            'src/index.ts',
            'src/mcp.ts',
            'src/runtime.ts',
            'src/timestamp.ts',
        ]);
    });

    test('0 *.test.ts and 0 tests/** entries ship', () => {
        const bad = POPULATION.filter((p) => p.endsWith('.test.ts') || p.startsWith('tests/'));
        expect(bad).toEqual([]);
    });
});
