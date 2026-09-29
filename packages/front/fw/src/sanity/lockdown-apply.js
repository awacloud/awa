// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

'use strict';

/**
 * sanity/lockdown-apply — the SELF-APPLYING entry point of the lockdown tier.
 *
 * ⚠️ **Side effect at import, BY DESIGN.** Evaluating this module calls
 * `lockdown()`. That is a deliberate, sanctioned exception to fw's "no side
 * effects at import" rule — the same exception class as the built `.classic`
 * sanity artifacts (`sanity/base.classic`, `sanity/community.classic`), which
 * self-apply on import for exactly the same reason.
 *
 * Why it exists: some hosts can only PREPEND A MODULE SPECIFIER to an entry.
 * Webpack has no snippet-injection seam (unlike Vite / esbuild / Rollup / Bun,
 * which are driven by `core.sanityImportLine` and can inject
 * `import {lockdown} …; lockdown();`), so `sanity: 'lockdown'` had nothing to
 * prepend but a bare `@awacloud/fw/sanity/lockdown` — and since the sanity
 * tiers became explicit-call ES modules (BATCH_20), a bare import of that
 * hardens NOTHING. `sanity: 'lockdown'` was therefore silently a no-op (BL-45).
 * This module is the specifier such a host can prepend.
 *
 * `./lockdown.js` itself is UNCHANGED and stays explicit-call: importing it
 * still hardens nothing, which is the property SSR and the test suite rely on.
 * Import THIS module only from an application entry point (or let a bundler
 * plugin prepend it); anywhere else, import `./lockdown.js` and call
 * `lockdown()` yourself.
 *
 * **No exports — importing it IS the API.** `harden()` stays on
 * `./lockdown.js`; a consumer needing it imports that module directly, and the
 * module-level guard in `lockdown()` makes the two entry points idempotent in
 * either order (whichever runs first applies; the other is a no-op).
 *
 * Worker-safe: **partial** — inherited verbatim from `lockdown()`. The
 * integrity steps (tame constructors, capture/remove evaluators, poison the
 * sync wasm constructors, harden intrinsics, arm the wasm gate) run in any
 * realm including Workers and SSR; the composed DOM/XSS layer is browser-gated.
 * The wrapper adds no realm requirement of its own: it applies wherever
 * `lockdown()` applies.
 *
 * Because it is side-effect-only, this file is listed in the package's
 * `sideEffects` array — without that, a production bundler flags it pure and
 * deletes the prepended import, silently re-opening BL-45.
 *
 * Related: `./lockdown.js` (the tier), `../../integrations/webpack/index.js`
 * (the only consumer of this subpath) and `docs/api/sanity/lockdown.md`
 * § Notes, which documents when each of the two import forms is correct.
 * A `@see` tag is deliberately NOT used for those: tsc parses its argument as
 * a name reference and a relative path emits TS1003 under the types build.
 *
 * @module sanity/lockdown-apply
 */

import { lockdown } from './lockdown.js';

lockdown();
