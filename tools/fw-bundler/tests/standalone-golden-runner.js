// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// tools/fw-bundler/tests/standalone-golden-runner.js
//
// Child-process runner for the standalone golden compare (BL-1223).
// `standalone` serializes each factory with `Function.prototype.toString`,
// i.e. the source as Bun's runtime transpiler served it. Under
// `bun test --coverage` Bun serves an uncompacted transpile (braced `if`s,
// `new Error`, unmerged `const`s), so the emitted bytes depend on the
// coverage flag of the process that runs the generator. The golden suite
// therefore runs the generator here, in a plain `bun` process, and compares
// the written bytes in the parent.
//
// Usage: bun standalone-golden-runner.js <moduleName> <out> <pkg>

import { generateStandalone } from '../src/standalone/index.js';

const [moduleName, out, pkg] = process.argv.slice(2);
if (!moduleName || !out || !pkg) {
    process.stderr.write('usage: bun standalone-golden-runner.js <moduleName> <out> <pkg>\n');
    process.exit(2);
}

const res = await generateStandalone(moduleName, { out, pkg });
process.stdout.write(JSON.stringify({ moduleCount: res.moduleCount }) + '\n');
