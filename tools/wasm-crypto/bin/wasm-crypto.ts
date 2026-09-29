#!/usr/bin/env bun
// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// tools/wasm-crypto/bin/wasm-crypto.ts
/**
 * Standalone CLI entry point for `@awacloud/tool-wasm-crypto` (BL-642, O4
 * ruling — `ai/program/PUBLICATION-DECISIONS.md` § O4 — tools/* lot rows
 * are autonomous).
 *
 * Thin delegate only: `../src/index.ts` gates its own dispatch behind
 * `import.meta.main`, so a bare re-export import (the pattern used by the
 * fw-bundler/fw-codegen bins) would silently do nothing here — this file
 * is not the module Bun was invoked with. Calling the exported, side-effect
 * free `run()` instead reaches the exact same argument parsing, config
 * loading and subcommand dispatch `../src/index.ts` uses for itself; nothing
 * is re-implemented or duplicated. SIGINT/SIGTERM handling mirrors
 * `../src/index.ts`'s own `import.meta.main` block so the exit-code contract
 * (0 ok · 1 generic error · 2 config error · 130 SIGINT · 143 SIGTERM) is
 * preserved exactly, including wasm-crypto's own choice of `1` — not the
 * generic `2` — for a missing/unknown subcommand.
 */
import { run } from "../src/index.ts";

process.on("SIGINT", () => process.exit(130));
process.on("SIGTERM", () => process.exit(143));

const code = await run({ args: Bun.argv.slice(2) });
process.exit(code);
