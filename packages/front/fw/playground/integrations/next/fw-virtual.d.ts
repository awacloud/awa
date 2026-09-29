// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// Virtual modules provided by the `@awacloud/fw/webpack` plugin that `withFw`
// wires into the Next build. Minimal declarations for the editor and
// `next build`'s type-check pass — the real resolution happens in Webpack.
declare module 'virtual:@awacloud/fw/preset/*' {
    export const runtime: {
        resolve(name: string): any;
        registerAllDeep(mods: any[]): void;
    };
    export const moduleNames: string[];
}

declare module 'virtual:@awacloud/fw/side-bundle/*' {
    export const modules: any[];
    export const moduleNames: string[];
    export function install(runtime: { registerAllDeep(mods: any[]): void }): void;
}
