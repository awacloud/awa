// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// Links @awacloud/fw into the CURRENT example's node_modules as a symlink/junction
// pointing at the real fw package root (live source, no copy).
//
// Why not `"@awacloud/fw": "workspace:*"`  → playground dirs are NOT monorepo
//   workspaces (deliberate: their heavy devDeps must stay out of root installs).
// Why not `"file:../../.."`           → bun COPIES the folder (≈64 MB, ignores
//   `files`, embeds playground/ → recursive growth on reinstalls).
// Why not `"link:../../.."`           → bun mis-resolves the relative target.
//
// Usage (cwd = the example folder):
//   node ../../_tools/link-fw.mjs     — or via the example's postinstall hook.
// Idempotent. Windows uses a junction (no admin rights needed).

import { existsSync, lstatSync, mkdirSync, rmSync, symlinkSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const fwRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const target = resolve(process.cwd(), 'node_modules', '@awacloud', 'fw');

if (!existsSync(resolve(fwRoot, 'package.json'))) {
    console.error(`[link-fw] fw root not found at ${fwRoot}`);
    process.exit(1);
}

// Replace whatever is there (stale copy from a previous file:-install, dead
// symlink…) — node_modules content is disposable by definition.
if (existsSync(target) || isLink(target)) rmSync(target, { recursive: true, force: true });
mkdirSync(dirname(target), { recursive: true });
symlinkSync(fwRoot, target, process.platform === 'win32' ? 'junction' : 'dir');
console.log(`[link-fw] node_modules/@awacloud/fw -> ${fwRoot}`);

function isLink(p) {
    try { return lstatSync(p).isSymbolicLink(); } catch { return false; }
}
