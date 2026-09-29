// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// Bun consumer build — uses the official `@awacloud/fw/bun` plugin at build time.
// Distinct from fw's internal builder (tools/build/bundler/): this is a
// third-party app bundling its own entry with the consumer plugin.
import fwBun from '@awacloud/fw/bun';

const result = await Bun.build({
    entrypoints: ['./src/app.js'],
    outdir: './dist',
    plugins: [fwBun({ preset: 'core' })],
});

if (!result.success) {
    for (const log of result.logs) console.error(log);
    process.exit(1);
}

for (const out of result.outputs) {
    console.log(`built ${out.path} (${out.kind})`);
}
