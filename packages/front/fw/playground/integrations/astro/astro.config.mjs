// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { defineConfig } from 'astro/config';
import fwAstro from '@awacloud/fw/astro';

// fwAstro re-injects the @awacloud/fw/vite plugin via astro:config:setup,
// making the `virtual:@awacloud/fw/preset/*` modules available everywhere in
// the app (SSR frontmatter + island <script>s).
//
// `site-interactive` is the preset documented by the integration: it
// bundles the DOM modules used by the islands (uiSession, form, signal,
// render, parser, template…). `sanity: 'community'` is injected by the
// integration as a CLIENT-ONLY script (never at SSR). The community layer
// is framework-friendly: it leaves history.pushState intact and does not
// interfere with the Astro dev toolbar.
export default defineConfig({
    integrations: [fwAstro({ preset: 'site-interactive', sanity: 'community' })],
});
