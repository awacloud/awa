// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview `@awacloud/oview/cascade.js` — the viewer's own DOCX and
 * OpenDocument style cascade, for a consumer that lays documents out
 * itself (an editor, a converter) and wants the styles resolved exactly as
 * the viewer paints them.
 *
 * Contract:
 * - pure and read-only: plain objects in (the typed models of
 *   `@awacloud/ooxml`'s `docx.read()` and `@awacloud/odf`'s `odt` / `ods` /
 *   `odp` `read()`), plain objects out; the input is never mutated;
 * - no DOM, no fw runtime, no side effect at import: the entry loads and
 *   runs where no `document` exists;
 * - the same code the viewer's painters run — moved, not copied: a fix
 *   here is a fix in the viewer.
 *
 * DOCX: `createDocxCascade(read.styles)` resolves document defaults → the
 * `basedOn` chain (root first, cycles cut) → a numbering level's `pPr` →
 * the direct formatting; `run()` puts a character style between the
 * paragraph's run base and the direct run formatting; `docxParagraphCss` /
 * `docxRunCss` map the resolved bags to CSS (camelCase property names).
 *
 * ODF: `createOdfCascade(read)` folds the three style shapes into one
 * registry and resolves `parent-style-name` chains (relative font sizes
 * multiplied out) into bags keyed by attribute local name; the `odf*Css`
 * functions map those bags to CSS.
 *
 * What it does not do: numbering formats and list counters, contextual
 * spacing and the space-after / space-before sum between neighbouring
 * paragraphs, page layout (sections, page size, margins, headers and
 * footers). The painters do those while they walk the document.
 *
 * @module oview/cascade
 */
export {
    createStyles as createDocxCascade,
    merge as mergeDocxProps,
    runStyle as docxRunCss,
    paragraphStyle as docxParagraphCss
} from './render/docx-style.js';
export {
    createOdfStyles as createOdfCascade,
    textCss as odfTextCss,
    paragraphCss as odfParagraphCss,
    boxCss as odfBoxCss,
    cellCss as odfCellCss
} from './render/odf-style.js';
