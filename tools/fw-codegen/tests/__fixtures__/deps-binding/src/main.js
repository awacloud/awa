// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// Fixture package entry — mirrors an office package manifest: a static
// `@awacloud/fw/...` import plus the `fw_require` guard array.
//
// Never imported or executed by the injector — parsed statically only.

import { htmlEntities } from '@awacloud/fw/io/text/html-entities.js';

export const fw_require = [htmlEntities];

import { alpha } from './mod/alpha.js';
import { renamedMod } from './mod/renamed.js';

export const modules = [alpha, renamedMod];
