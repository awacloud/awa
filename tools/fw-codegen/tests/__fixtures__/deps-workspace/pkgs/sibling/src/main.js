// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// Fixture sibling package entry — mirrors an office manifest.
//
// `modules` is what the consumer spreads into its `pkg_require`; `extras` is
// deliberately NOT spread, so its entries must stay unresolvable.

import { sharedFw } from '@awacloud/fw/io/text/shared-fw.js';

export const fw_require = [sharedFw];

import { siblingThing } from './thing.js';
import { siblingHidden } from './hidden.js';
import { siblingExtra } from './extra/one.js';
import { siblingUnguarded } from './unguarded.js';

export const modules = [sharedFw, siblingThing, siblingHidden, siblingExtra];
export const extras = [siblingUnguarded];
