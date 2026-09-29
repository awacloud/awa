#!/usr/bin/env bun
// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// tools/fw-bundler/src/index.ts
/**
 * @awacloud/tool-fw-bundler — CLI dispatch for the fw production build tools.
 *
 * Three subcommands:
 *   - `bundle`     — presets × variants + side-bundles + sanity via Bun.build.
 *                    Ported logic-verbatim from fw's `build/bundler` (W1a).
 *   - `standalone` — emit one self-contained ESM per fw module.
 *                    Ported logic-verbatim from fw's `build/standalone` (W1a).
 *   - `catalog`    — emit `integrations/_shared/catalog.generated.json`, the
 *                    deterministic module-catalog artifact (+ `--check` drift
 *                    gate). Additive, fw-tools-migration W1d (contract
 *                    addendum A3 — see `../../ai/plans/fw-tools-mutualization/CALL-CONTRACT.md`).
 *
 * Discoverable via `bun cli.ts fw-bundler <command> …`.
 *
 * Exit codes: 0 ok · 1 error (subcommand failure) · 2 usage (unknown/missing
 * command).
 */

import { runCli as runBundleCli } from "./bundle/index.js";
import { runCli as runStandaloneCli } from "./standalone/index.js";
import { runCli as runCatalogCli } from "./catalog/index.js";

const USAGE = `Usage:
  bun cli.ts fw-bundler <command> [...args]   (via the monorepo CLI router)
  fw-bundler <command> [...args]              (standalone, via this package's bin)

Commands:
  bundle [target] [flags]           fw production build (presets × variants + side-bundles + sanity)
  standalone <moduleName> [flags]   emit one self-contained ESM per fw module
  catalog [--check] [flags]         emit the module-catalog artifact (+ --check drift gate)

Run \`fw-bundler bundle --help\`, \`fw-bundler standalone --help\` or
\`fw-bundler catalog --help\` for command flags.`;

const argv = process.argv.slice(2);
const cmd = argv[0];

if (cmd === undefined) {
    process.stderr.write("fw-bundler: missing command.\n" + USAGE + "\n");
    process.exit(2);
}

if (cmd === "--help" || cmd === "-h" || cmd === "help") {
    process.stdout.write(USAGE + "\n");
    process.exit(0);
}

const rest = argv.slice(1);

if (cmd === "bundle") {
    process.exit(await runBundleCli(rest));
}
if (cmd === "standalone") {
    process.exit(await runStandaloneCli(rest));
}
if (cmd === "catalog") {
    process.exit(await runCatalogCli(rest));
}

process.stderr.write(`fw-bundler: unknown command "${cmd}".\n` + USAGE + "\n");
process.exit(2);
