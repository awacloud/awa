// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// webpack.config.js
// Minimal Webpack 5 consumer build for `@awacloud/fw` via the official plugin.
//
// The plugin exposes scheme-based virtual modules (`virtual:@awacloud/fw/*`) using
// Webpack 5's custom-URI-scheme hooks — no `webpack-virtual-modules`, no loader.
//
// Note: `@awacloud/fw` is an ESM package (`"type": "module"`), but its `./webpack`
// export is plain JS that Node can `require()` here — this CommonJS config works
// as-is. (If you prefer ESM config, rename to `webpack.config.mjs` and use
// `import { FwWebpackPlugin } from '@awacloud/fw/webpack'`.)
const fs = require('fs');
const path = require('path');
const { FwWebpackPlugin } = require('@awacloud/fw/webpack');

// Tiny dependency-free plugin: copy index.html into the output dir so the
// built site is self-contained and `npx serve --no-clean-urls dist` Just Works.
class CopyHtmlPlugin {
    apply(compiler) {
        compiler.hooks.afterEmit.tap('CopyHtmlPlugin', (compilation) => {
            const out = compilation.options.output.path;
            fs.mkdirSync(out, { recursive: true });
            fs.copyFileSync(
                path.resolve(__dirname, 'index.html'),
                path.join(out, 'index.html')
            );
        });
    }
}

module.exports = {
    mode: 'development',
    target: 'web',
    // Development mode defaults devtool to 'eval', which the fw sanity layer
    // blocks at runtime (the bundle throws 'not allowed' on load) — use a
    // non-eval source map.
    devtool: 'source-map',
    entry: './src/app.js',
    output: {
        path: path.resolve(__dirname, 'dist'),
        filename: 'bundle.js',
    },
    plugins: [
        // `core` preset (errors, eventBus, signal, valid, ui8, abort, clock),
        // with the `base` sanity layer prepended to the entry.
        new FwWebpackPlugin({ preset: 'core', sanity: 'base' }),
        new CopyHtmlPlugin(),
    ],
};
