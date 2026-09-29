// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// Fixture core stub — just enough surface for entry-gen to import.
export class ModuleRuntime {
    constructor() { this.mods = []; }
    registerAllDeep(mods) { this.mods.push(...(mods || [])); return this; }
}

export const runtimeSource = 'ModuleRuntime';
