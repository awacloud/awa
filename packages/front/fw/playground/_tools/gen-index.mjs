// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// Generates playground/examples.json — the data source consumed by
// playground/index.html (the navigable index rendered with @awacloud/fw itself).
//
// Purely directory-driven: scans playground/{integrations}/*
// (directories only, `_tools` excluded) and extracts, from each example's
// README.md :
//   - title       : first `# ` heading (fallback: folder name)
//   - description : first non-empty paragraph after the heading, markdown
//                   stripped, truncated ~160 chars (fallback: '')
//   - run         : first shell-looking line of the first fenced code block
// Capabilities are detected from the folder contents :
//   - package.json → install: true   (the example needs `npm i`)
//   - index.html   → browser: './<axis>/<name>/index.html' (openable link)
//
// No timestamp on purpose — output is stable so diffs stay quiet.
//
// Usage (any cwd — paths are resolved from this file's location):
//   node playground/_tools/gen-index.mjs
// Idempotent; zero dependencies (same contract as link-fw.mjs).

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const playgroundRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Axis order is fixed (matches playground/README.md) — stable JSON ordering.
const AXES = [
    { id: 'integrations', label: 'Integrations' },
];

const DESC_MAX = 160;

/** Strip the markdown inline syntax we expect in these READMEs. */
function stripMarkdown(s) {
    return s
        .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')   // images → alt text
        .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')    // links  → label
        .replace(/`([^`]*)`/g, '$1')                // inline code
        .replace(/\*\*([^*]+)\*\*/g, '$1')          // bold
        .replace(/\*([^*]+)\*/g, '$1')              // italic
        .replace(/__([^_]+)__/g, '$1')              // bold (underscore)
        .replace(/\s+/g, ' ')
        .trim();
}

/** Truncate at a word boundary, append an ellipsis when cut. */
function truncate(s, max) {
    if (s.length <= max) return s;
    const cut = s.slice(0, max - 1);
    const atWord = cut.lastIndexOf(' ');
    return (atWord > max / 2 ? cut.slice(0, atWord) : cut).trimEnd() + '…';
}

/**
 * Extract { title, description, run } from a README.md source.
 * Every field degrades gracefully (missing README, no heading, no
 * paragraph, no fenced block) — callers apply the fallbacks.
 */
function parseReadme(md) {
    const lines = md.split(/\r?\n/);
    let title = null;
    let description = null;
    let run; // unconditionally assigned below (no useful initial value)

    let i = 0;

    // 1. Title: first `# ` heading.
    for (; i < lines.length; i++) {
        const m = /^#\s+(.+)$/.exec(lines[i]);
        if (m) { title = stripMarkdown(m[1]); i++; break; }
    }

    // 2. Description: first non-empty plain paragraph after the heading
    //    (skips sub-headings, fenced blocks, quotes, lists and tables).
    let inFence = false;
    for (let j = i; j < lines.length && description === null; j++) {
        const line = lines[j];
        if (/^\s*```/.test(line)) { inFence = !inFence; continue; }
        if (inFence) continue;
        const t = line.trim();
        if (t === '' || /^(#|>|\||[-*+]\s|\d+\.\s)/.test(t)) continue;
        // Collect the consecutive lines of this paragraph.
        const para = [t];
        for (let k = j + 1; k < lines.length; k++) {
            const next = lines[k].trim();
            if (next === '' || /^(#|>|\||```|[-*+]\s|\d+\.\s)/.test(next)) break;
            para.push(next);
        }
        description = truncate(stripMarkdown(para.join(' ')), DESC_MAX);
    }

    // 3. Run command: first usable line of the first fenced code block,
    //    preferring shell-tagged fences (```sh / ```bash / …) over the very
    //    first block when the README opens with a JS snippet.
    //    `#`-prefixed shell comments skipped, trailing comments stripped.
    const SHELL_TAG_RE = /^\s*```\s*(sh|bash|shell|zsh|console)\s*$/;
    function firstCommand(requireShellTag) {
        let fence = null;                   // null = outside, 'shell' | 'other'
        for (const line of lines) {
            if (/^\s*```/.test(line)) {
                if (fence !== null) {
                    if (!requireShellTag) return null;  // first block ended, no command
                    fence = null;
                    continue;
                }
                fence = SHELL_TAG_RE.test(line) ? 'shell' : 'other';
                continue;
            }
            if (fence === null) continue;
            if (requireShellTag && fence !== 'shell') continue;
            const t = line.trim();
            if (t === '' || t.startsWith('#')) continue;
            return t.replace(/\s{2,}#.*$/, '').trim();
        }
        return null;
    }
    run = firstCommand(true) ?? firstCommand(false);

    return { title, description, run };
}

/** Build the items of one axis (sorted by folder name). */
function scanAxis(axisId) {
    const axisDir = join(playgroundRoot, axisId);
    if (!existsSync(axisDir)) return [];

    return readdirSync(axisDir, { withFileTypes: true })
        .filter((e) => e.isDirectory() && e.name !== '_tools' && !e.name.startsWith('.'))
        .map((e) => e.name)
        .sort()
        .map((name) => {
            const dir = join(axisDir, name);
            const readmePath = join(dir, 'README.md');
            let meta = { title: null, description: null, run: null };
            if (existsSync(readmePath)) {
                try { meta = parseReadme(readFileSync(readmePath, 'utf8')); }
                catch { /* unreadable README → fallbacks below */ }
            }
            const hasIndex = existsSync(join(dir, 'index.html'));
            return {
                name,
                dir: `./${axisId}/${name}/`,
                title: meta.title ?? name,
                description: meta.description ?? '',
                run: meta.run ?? '',
                browser: hasIndex ? `./${axisId}/${name}/index.html` : false,
                install: existsSync(join(dir, 'package.json')),
            };
        });
}

const out = {
    generated: 'generated file — run `node _tools/gen-index.mjs` to refresh (do not edit by hand)',
    axes: AXES.map(({ id, label }) => ({ id, label, items: scanAxis(id) })),
};

const target = join(playgroundRoot, 'examples.json');
writeFileSync(target, JSON.stringify(out, null, 4) + '\n', 'utf8');

const total = out.axes.reduce((n, a) => n + a.items.length, 0);
console.log(`[gen-index] ${target} — ${total} exemples (${out.axes.map((a) => `${a.id}:${a.items.length}`).join(', ')})`);
