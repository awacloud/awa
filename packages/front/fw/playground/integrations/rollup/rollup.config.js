// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import fwRollup from '@awacloud/fw/rollup';
import { nodeResolve } from '@rollup/plugin-node-resolve';

export default {
    input: 'src/app.js',
    output: { file: 'dist/app.js', format: 'es' },
    plugins: [
        fwRollup({ preset: 'core' }),
        nodeResolve({ exportConditions: ['browser', 'import', 'default'] }),
    ],
};
