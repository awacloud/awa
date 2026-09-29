// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import withFw from '@awacloud/fw/next';

// Multiple lockfiles exist (root bun.lock + this playground's) → pin the
// workspace root EXPLICITLY to the monorepo root. It must be the repo root
// (not this dir): `node_modules/@awacloud/fw` is a junction to the in-repo fw
// sources, and Turbopack only resolves files under `turbopack.root`.
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..', '..');

// `withFw` plugs the `@awacloud/fw/webpack` plugin into the Next build (Webpack
// only — NOT Turbopack), exposing the `virtual:@awacloud/fw/preset/*` modules.
// `site-interactive` is the preset documented by the integration: it bundles
// the DOM modules the islands resolve (uiSession, form, signal, render,
// parser, template…). The community sanity layer is NOT injected by the
// build — it is mounted client-side by `components/Sanity.tsx` (see README).
// community leaves history.pushState intact, enabling Next <Link> navigation.
export default withFw(
    {
        reactStrictMode: true,
        outputFileTracingRoot: REPO_ROOT,
        turbopack: { root: REPO_ROOT },
    },
    { preset: 'site-interactive' },
);
