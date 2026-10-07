// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Shared test helpers — minimal factory wiring for unit
 * suites that need just a subset of the ooxml stack.
 *
 * The package's modules follow the `factory(...deps)` pattern, so each
 * test traditionally rebuilds the dependency chain at the top of its
 * file. This helper centralises the most common combinations so adding
 * a new test file is a one-import affair :
 *
 * ```js
 * import { buildXml, buildDocxProps, buildDocxStack } from '../../tests/_helpers/build.js';
 *
 * const xml = buildXml();
 * const props = buildDocxProps();
 * const docx = buildDocxStack();
 * ```
 *
 * Each helper instantiates fresh modules — no shared state between
 * calls — so tests stay isolated.
 *
 * @module tests/_helpers/build
 */

import { xml as ooxmlXml } from '@awacloud/fw/io/codec/xml.js';
import { ooxmlMath } from '../../src/math/math.js';
import { markupCompatibility } from '../../src/mc/markupCompatibility.js';
import { opcContentTypes } from '../../src/opc/contentTypes.js';
import { opcRelationships } from '../../src/opc/relationships.js';
import { opcPackage } from '../../src/opc/package.js';

import { docxProperties } from '../../src/docx/properties.js';
import { docxDrawing } from '../../src/docx/drawing.js';
import { docxStructure } from '../../src/docx/structure.js';
import { docxStyles } from '../../src/docx/styles.js';
import { docxNumbering } from '../../src/docx/numbering.js';
import { docxSettings } from '../../src/docx/settings.js';
import { docxComments } from '../../src/docx/comments.js';
import { docxFootnotes } from '../../src/docx/footnotes.js';
import { docxHeaders } from '../../src/docx/headers.js';
import { docxCustomXml } from '../../src/docx/customXml.js';
import { docxWalker } from '../../src/docx/docx-walker.js';
import { docx as docxMod } from '../../src/docx/docx.js';
import { drawingml } from '../../src/drawingml/drawingml.js';
import { drawingmlChart } from '../../src/drawingml/chart.js';
import { drawingmlShape } from '../../src/drawingml/shape.js';

/**
 * Returns a fresh `ooxmlXml` instance. Common entry-point — most other
 * helpers consume this one.
 */
export function buildXml() {
    return ooxmlXml.factory();
}

/**
 * Returns `{ xml, props }` — the most common pair for unit tests on
 * docx properties + structure modules.
 */
export function buildDocxProps(xml) {
    const x = xml || buildXml();
    return { xml: x, props: docxProperties.factory(x) };
}

/**
 * Returns the full OPC stack `{ xml, ct, rels, opc }` ready for any
 * package-level orchestrator.
 *
 * Requires `zip` + `crc32` from `@awacloud/fw` — pass them in via `deps` if
 * you don't want to import them yourself.
 */
export function buildOpc(deps) {
    const xml = (deps && deps.xml) || buildXml();
    const ct = opcContentTypes.factory(xml);
    const rels = opcRelationships.factory(xml);
    const opc = opcPackage.factory(deps.zip, ct, rels);
    return { xml, ct, rels, opc };
}

/**
 * Build the entire docx orchestrator with default modules wired.
 * Useful for tests that exercise read/write end-to-end.
 *
 * @param {{ zip: object }} deps — `zip` factory from `@awacloud/fw`
 *                                 (the only non-package dep).
 */
export function buildDocxStack(deps) {
    const opcStack = buildOpc(deps);
    const xml = opcStack.xml;
    const props = docxProperties.factory(xml);
    const dml = drawingml.factory(xml, ooxmlMath.factory(xml));
    const drawing = docxDrawing.factory(xml, opcStack.rels);
    const structure = docxStructure.factory(xml, props, drawing,
        drawingmlShape.factory(xml, dml));
    const styles = docxStyles.factory(xml, props);
    const numbering = docxNumbering.factory(xml, props);
    const settings = docxSettings.factory(xml);
    const comments = docxComments.factory(xml, structure);
    const footnotes = docxFootnotes.factory(xml, structure);
    const headers = docxHeaders.factory(xml, structure);
    const customXml = docxCustomXml.factory(xml);
    const mc = markupCompatibility.factory(xml);
    const chart = drawingmlChart.factory(xml);
    const walker = docxWalker.factory();
    const docx = docxMod.factory(opcStack.opc, xml, opcStack.rels,
        structure, styles, numbering, settings, comments, footnotes,
        headers, drawing, mc, chart, customXml, walker);
    return { ...opcStack, props, structure, styles, numbering,
             settings, comments, footnotes, headers, customXml,
             drawing, mc, chart, walker, docx };
}
