// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

// apps/services/notepad/eslint.config.js
//
// Package-local ESLint flat config for @awacloud/notepad — thin
// re-export of the shared office preset. See
// packages/front/office/_eslint/preset.mjs for the config shape and
// rationale. Same shape as apps/services/viewer/eslint.config.js.
//
// Run: bunx eslint --no-warn-ignored .   (from this app's dir)

import officeEslintPreset from '../../../packages/front/office/_eslint/preset.mjs';

export default officeEslintPreset(import.meta.url);
