// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// Fixture consumer entry — mirrors `packages/front/office/pdf/src/main.js`:
// an fw guard plus a `pkg_require` mixing NAMESPACE SPREADS of a sibling
// package with explicitly-imported sibling descriptors.

import { localFw } from '@awacloud/fw/io/text/local-fw.js';

export const fw_require = [localFw];

import * as sib from '@fx/sibling';
import * as ghost from '@fx/ghost';          // package that does not exist
import { siblingExplicit } from '@fx/sibling/thing';

export const pkg_require = [
    ...sib.modules,
    ...ghost.modules,
    siblingExplicit,
];

import { alpha } from './mod/alpha.js';

export const modules = [alpha];
