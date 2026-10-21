// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Realm hardening for the STANDALONE page — fw sanity `base`
 * (bans `eval` / `Function`, `Math.random`, `history.*`, iframe / object
 * sources, redirects `innerHTML` writes, freezes the built-in prototypes —
 * `@awacloud/fw/docs/guide/security.md`).
 *
 * Side effect at import BY DESIGN, like `apps/demo/pades/src/sanity.js`:
 * `src/main.js` imports it FIRST so it runs before any other module
 * evaluates. The embeddable component never imports it — hardening a realm
 * is the host page's decision, not a component's. No test imports it
 * (Happy-DOM would apply it to the whole `bun test` process).
 *
 * @module viewer/sanity
 */
import { applyBase } from '@awacloud/fw/sanity/base.js';

export const sanity = applyBase();
