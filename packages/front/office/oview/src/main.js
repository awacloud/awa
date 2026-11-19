// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview `@awacloud/oview` — the embeddable core of AWA Viewer: the
 * package entry. `mountViewer()` mounts a browser-only document viewer inside
 * any element; `defineViewerElement()` registers the `<awa-viewer>` element
 * (nothing registers at import).
 *
 * @module oview
 */
export { mountViewer, MAX_DOCUMENT_BYTES, detect, negotiateLocale, LOCALES } from './viewer.js';
export { defineViewerElement } from './element.js';
