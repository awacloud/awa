// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

// packages/front/office/oview/eslint.config.js
//
// Package-local ESLint flat config for @awacloud/oview — thin re-export of
// the shared office preset. See packages/front/office/_eslint/preset.mjs for
// the config shape and rationale.
//
// Run: bunx eslint --no-warn-ignored .   (from this package's dir)

import officeEslintPreset from '../_eslint/preset.mjs';

export default officeEslintPreset(import.meta.url);
