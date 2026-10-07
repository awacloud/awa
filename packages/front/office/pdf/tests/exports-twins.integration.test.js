// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

// packages/front/office/pdf/tests/exports-twins.integration.test.js
//
// office/BATCH_51 task 03 — verifies that the additive `<family>/*.js` export
// twins resolve to the same module files as their `<family>/*` counterparts
// (BL-2053). For each wildcard family, picks one real module file, resolves
// `@awacloud/pdf/<family>/<file>.js` and `@awacloud/pdf/<family>/<file>`
// through import.meta.resolve, and asserts both land on the same existing
// `src/**/<file>.js` (no `.js.js`).

import { describe, test, expect } from 'bun:test';
import { resolve, relative } from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const PKG_DIR = resolve(import.meta.dir, '..');
const PKG_NAME = '@awacloud/pdf';

// Sample files for each family: one real module file to test resolution
const FAMILIES = [
  { family: 'filters', sample: 'ascii85.js' },
  { family: 'annot', sample: 'annot.js' },
  { family: 'tagged', sample: 'classMap.js' },
  { family: 'crypto', sample: 'aesGcm.js' },
  { family: 'sig', sample: 'byteRange.js' },
  { family: 'ocg', sample: 'config.js' },
  { family: 'action', sample: 'action.js' },
  { family: 'embedded', sample: 'collection.js' },
  { family: 'metadata', sample: 'info.js' },
  { family: 'prepress', sample: 'outputIntent.js' },
  { family: 'extra', sample: '3d-richmedia.js' },
  { family: 'bundles', sample: 'pdf-full.js' },
];

describe('@awacloud/pdf export twins (BL-2053)', () => {
  test('both specifier forms resolve identically for every family', async () => {
    for (const { family, sample } of FAMILIES) {
      const sampleNoExt = sample.replace(/\.js$/, '');

      // Resolve both forms
      const jsFormSpecifier = `${PKG_NAME}/${family}/${sample}`;
      const noJsFormSpecifier = `${PKG_NAME}/${family}/${sampleNoExt}`;

      let jsResolved, noJsResolved;
      try {
        jsResolved = await import.meta.resolve(jsFormSpecifier);
      } catch (e) {
        throw new Error(
          `Failed to resolve "${jsFormSpecifier}": ${e.message}`
        );
      }

      try {
        noJsResolved = await import.meta.resolve(noJsFormSpecifier);
      } catch (e) {
        throw new Error(
          `Failed to resolve "${noJsFormSpecifier}": ${e.message}`
        );
      }

      // Both must resolve to the same file
      expect(jsResolved, `${family}/${sample}.js form`).toBe(noJsResolved);

      // Convert file URL to path for existence check
      const jsPath = jsResolved.startsWith('file://') ? fileURLToPath(jsResolved) : jsResolved;

      // The resolved path must exist and must not be .js.js (double extension)
      expect(existsSync(jsPath), `${family}: resolved file exists`).toBe(true);
      expect(jsPath).not.toMatch(/\.js\.js$/);

      // The resolved path should end with .js
      expect(jsPath, `${family}: resolved file is .js`).toMatch(/\.js$/);
    }
  });

});
