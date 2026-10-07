// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Shared test helpers — minimal factory wiring for unit
 * suites that need just a subset of the odf stack.
 *
 * Each helper instantiates fresh modules — no shared state between
 * calls — so tests stay isolated.
 *
 * @module tests/_helpers/build
 */

import { xml as fwXml } from '@awacloud/fw/io/codec/xml.js';
import { odfErrors } from '../../src/errors.js';
import { odfShared as odfSharedMod } from '../../src/_shared/index.js';
import { odfWalker as odfWalkerMod } from '../../src/_shared/walker.js';
import { pkgMimetype } from '../../src/pkg/mimetype.js';
import { pkgManifest } from '../../src/pkg/manifest.js';
import { pkgPackage } from '../../src/pkg/package.js';
import { odfMeta } from '../../src/meta/meta.js';
import { odfSettings } from '../../src/settings/settings.js';
import { odfStyles } from '../../src/style/styles.js';
import { textParagraph } from '../../src/text/paragraph.js';
import { textHeading } from '../../src/text/heading.js';
import { textList } from '../../src/text/list.js';
import { textSection } from '../../src/text/section.js';
import { textBookmarks } from '../../src/text/bookmarks.js';
import { textFields } from '../../src/text/fields.js';
import { textTracked } from '../../src/text/tracked.js';
import { textContent } from '../../src/text/content.js';
import { tableCell } from '../../src/table/cell.js';
import { tableRow } from '../../src/table/row.js';
import { tableTable } from '../../src/table/table.js';
import { drawImage } from '../../src/draw/image.js';
import { drawFrame } from '../../src/draw/frame.js';
import { drawShape } from '../../src/draw/shape.js';
import { styleAutomatic } from '../../src/style/automaticStyles.js';
import { textStyleRegistry as textStyleRegistryMod } from '../../src/text/style-registry.js';
import { stylePageLayout } from '../../src/style/pageLayout.js';
import { styleMasterPage } from '../../src/style/masterPage.js';
import { numberFormats } from '../../src/number/numberFormats.js';
import { odt as odtMod } from '../../src/odt/odt.js';
import { odtWalker as odtWalkerMod } from '../../src/odt/odt-walker.js';
import { spreadsheet as spreadsheetMod } from '../../src/ods/spreadsheet.js';
import { ods as odsMod } from '../../src/ods/ods.js';
import { odsWalker as odsWalkerMod } from '../../src/ods/ods-walker.js';
import { presentationStyle as presentationStyleMod } from '../../src/odp/presentationStyle.js';
import { odpAnimations as odpAnimationsMod } from '../../src/odp/animations.js';
import { slide as slideMod } from '../../src/odp/slide.js';
import { odp as odpMod } from '../../src/odp/odp.js';
import { odpWalker as odpWalkerMod } from '../../src/odp/odp-walker.js';
import { chartChart as chartChartMod } from '../../src/chart/chart.js';
import { mathMath as mathMathMod } from '../../src/math/math.js';
import { formForms as formFormsMod } from '../../src/form/forms.js';
import { dr3dScene as dr3dSceneMod } from '../../src/dr3d/dr3d.js';
import { odfMc as odfMcMod } from '../../src/mc/markupCompatibility.js';

/** Returns a fresh `xml` instance. */
export function buildXml() {
    return fwXml.factory();
}

/**
 * Build the OPC-equivalent pkg stack `{ xml, mimetype, manifest, pkg }`.
 *
 * @param {{ zip: object }} deps — `zip` already instantiated (from fw).
 */
export function buildPkg(deps) {
    const xml = (deps && deps.xml) || buildXml();
    const errors = (deps && deps.errors) || odfErrors.factory();
    const shared = (deps && deps.shared) || odfSharedMod.factory(errors, xml);
    const mimetype = pkgMimetype.factory(errors, shared);
    const manifest = pkgManifest.factory(errors, shared, xml);
    const pkg = pkgPackage.factory(errors, shared, deps.zip, mimetype, manifest);
    return { xml, errors, shared, mimetype, manifest, pkg };
}

/**
 * Build the entire odt orchestrator with default modules wired,
 * including the full L1 surface (textContent, tables, draw, styles,
 * number formats).
 *
 * @param {{ zip: object }} deps — `zip` factory output from `@awacloud/fw`.
 */
export function buildOdtStack(deps) {
    const pkgStack = buildPkg(deps);
    const xml = pkgStack.xml;
    const errors = pkgStack.errors;
    const shared = pkgStack.shared;
    const meta = odfMeta.factory(errors, shared, xml);
    const settings = odfSettings.factory(errors, shared, xml);
    const styles = odfStyles.factory(errors, shared, xml);

    const paragraph = textParagraph.factory(xml);
    const heading = textHeading.factory(xml, paragraph);
    const list = textList.factory(xml, paragraph);
    const section = textSection.factory(xml);
    const bookmarks = textBookmarks.factory(xml);
    const fields = textFields.factory(xml);
    const tracked = textTracked.factory(xml);

    const cell = tableCell.factory(errors, shared, xml);
    const row = tableRow.factory(errors, shared, xml, cell);
    const table = tableTable.factory(xml, row);

    const content = textContent.factory(xml, paragraph, heading, list, section, table);

    const image = drawImage.factory(xml);
    const frame = drawFrame.factory(xml, image);
    const shape = drawShape.factory(xml);

    const automaticStyles = styleAutomatic.factory(xml);
    const pageLayout = stylePageLayout.factory(xml);
    const masterPage = styleMasterPage.factory(xml);
    const numbers = numberFormats.factory(xml);

    const chart = chartChartMod.factory(errors, shared, xml);
    const math = mathMathMod.factory(errors, shared, xml);
    const forms = formFormsMod.factory(xml);
    const dr3d = dr3dSceneMod.factory(xml);
    const mc = odfMcMod.factory(xml);

    const odtWalker = odtWalkerMod.factory(odfWalkerMod.factory());
    const styleRegistry = textStyleRegistryMod.factory(xml);
    const odt = odtMod.factory(errors, shared, pkgStack.pkg, xml, pkgStack.mimetype, pkgStack.manifest,
        meta, settings, styles, paragraph, content, odtWalker, automaticStyles, styleRegistry,
        frame, image);

    return {
        ...pkgStack,
        meta, settings, styles,
        paragraph, heading, list, section, bookmarks, fields, tracked, content,
        cell, row, table,
        image, frame, shape,
        automaticStyles, pageLayout, masterPage, numbers,
        styleRegistry,
        chart, math, forms, dr3d, mc,
        odt
    };
}

/**
 * Build the entire ods orchestrator with default modules wired (L2).
 *
 * @param {{ zip: object }} deps — `zip` factory output from `@awacloud/fw`.
 */
export function buildOdsStack(deps) {
    const pkgStack = buildPkg(deps);
    const xml = pkgStack.xml;
    const errors = pkgStack.errors;
    const shared = pkgStack.shared;
    const meta = odfMeta.factory(errors, shared, xml);
    const settings = odfSettings.factory(errors, shared, xml);
    const styles = odfStyles.factory(errors, shared, xml);

    const paragraph = textParagraph.factory(xml);

    const cell = tableCell.factory(errors, shared, xml);
    const row = tableRow.factory(errors, shared, xml, cell);
    const table = tableTable.factory(xml, row);

    const automaticStyles = styleAutomatic.factory(xml);

    const sheet = spreadsheetMod.factory(xml, table);

    const odsWalker = odsWalkerMod.factory(odfWalkerMod.factory());
    const ods = odsMod.factory(errors, shared, pkgStack.pkg, xml, pkgStack.mimetype, pkgStack.manifest,
        meta, settings, styles, sheet, automaticStyles,
        table, row, cell, paragraph, odsWalker);

    return {
        ...pkgStack,
        meta, settings, styles,
        paragraph,
        cell, row, table,
        automaticStyles, sheet,
        ods
    };
}

/**
 * Build the entire odp orchestrator with default modules wired (L2).
 *
 * @param {{ zip: object }} deps — `zip` factory output from `@awacloud/fw`.
 */
export function buildOdpStack(deps) {
    const pkgStack = buildPkg(deps);
    const xml = pkgStack.xml;
    const errors = pkgStack.errors;
    const shared = pkgStack.shared;
    const meta = odfMeta.factory(errors, shared, xml);
    const settings = odfSettings.factory(errors, shared, xml);
    const styles = odfStyles.factory(errors, shared, xml);

    const paragraph = textParagraph.factory(xml);
    const heading = textHeading.factory(xml, paragraph);
    const list = textList.factory(xml, paragraph);
    const section = textSection.factory(xml);

    const cell = tableCell.factory(errors, shared, xml);
    const row = tableRow.factory(errors, shared, xml, cell);
    const table = tableTable.factory(xml, row);

    const content = textContent.factory(xml, paragraph, heading, list, section, table);

    const image = drawImage.factory(xml);
    const frame = drawFrame.factory(xml, image);

    const automaticStyles = styleAutomatic.factory(xml);
    const masterPage = styleMasterPage.factory(xml);

    const presentationStyle = presentationStyleMod.factory(xml);
    const animations = odpAnimationsMod.factory(xml);
    const slide = slideMod.factory(xml, paragraph, content, frame);

    const odpWalker = odpWalkerMod.factory(odfWalkerMod.factory());
    const odp = odpMod.factory(errors, shared, pkgStack.pkg, xml, pkgStack.mimetype, pkgStack.manifest,
        meta, settings, styles,
        slide, presentationStyle,
        automaticStyles, masterPage,
        frame, paragraph, odpWalker);

    return {
        ...pkgStack,
        meta, settings, styles,
        paragraph, heading, list, section, content,
        image, frame,
        automaticStyles, masterPage,
        presentationStyle, animations, slide,
        odp
    };
}
