// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import * as esbuild from 'esbuild';
import fwEsbuild from '@awacloud/fw/esbuild';

await esbuild.build({
    entryPoints: ['src/app.js'],
    bundle: true,
    format: 'esm',
    outfile: 'dist/app.js',
    plugins: [fwEsbuild({ preset: 'core', sanity: 'base' })],
});

console.log('[playground/esbuild] built dist/app.js');
