#!/usr/bin/env bun
// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// tools/fw-bundler/bin/fw-bundler.ts
/**
 * Standalone CLI entry point for `@awacloud/tool-fw-bundler` (BL-642, O4
 * ruling — `ai/program/PUBLICATION-DECISIONS.md` § O4 — tools/* lot rows
 * are autonomous).
 *
 * Thin delegate only: importing `../src/index.ts` re-runs its dispatch
 * unchanged — same argument parsing, same `bundle` / `standalone` / `catalog`
 * subcommand routing, same `0`/`1`/`2` exit-code contract — so this file
 * duplicates none of it. It exists so an npm consumer of the exported
 * package can run `fw-bundler <command> [...args]` directly (via
 * `node_modules/.bin/fw-bundler`, `npx fw-bundler`, or `bun bin/fw-bundler.ts`)
 * without this monorepo's `cli.ts` router, which does not travel with an
 * exported sub-repo.
 */
import "../src/index.ts";
