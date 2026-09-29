// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// Runtime registration of the @awacloud/fw Bun plugin (see bunfig.toml `preload`).
// Mirrors the "Usage — at runtime" section of integrations/bun/index.js.
// Keep the preset in sync with build.ts.
import { plugin } from 'bun';
import fwBun from '@awacloud/fw/bun';

plugin(fwBun({ preset: 'core' }));
