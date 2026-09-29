// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// Fixture package entry — mirrors an office package manifest: static
// `@awacloud/fw/...` imports plus the `fw_require` guard array enumerating exactly
// the fw modules injected in package mode.
//
// Never imported or executed by the injector — parsed statically only.

import { htmlEntities } from '@awacloud/fw/io/text/html-entities.js';
import { url } from '@awacloud/fw/io/codec/url.js';
import { sanitize as sanitizeFw } from '@awacloud/fw/dom/rendering/sanitize.js';
// Imported but deliberately ABSENT from `fw_require` — the guard must reject it.
import { secPolicy } from '@awacloud/fw/dom/rendering/secPolicy.js';

export const fw_require = [htmlEntities, url, sanitizeFw];

import { alpha } from './mod/alpha.js';

export const modules = [alpha];
export const extras = [secPolicy];
