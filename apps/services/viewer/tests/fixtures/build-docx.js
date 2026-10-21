// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Builds `rich.docx`: hand-written WordprocessingML in the
 * shape Word 2013+ writes (packed with fw `zip`, like `build-odf.js`) — the
 * document defaults Word ships (11 pt, 8 pt after, 1.08 lines), heading and
 * title styles, a numbered list, a "Table Grid" table and a "Grid Table 4"
 * table whose look turns on the header row and the row bands (the
 * conditional formats of `w:tblStylePr`), a default header and footer, A4
 * paper with 2.5 cm margins. The repository's DOCX corpus has none of the
 * table-style conditional formats.
 *
 * Run: `bun apps/services/viewer/tests/fixtures/build-docx.js` (the output
 * is committed).
 *
 * @module viewer/tests/fixtures/build-docx
 */
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { zip as zipModule } from '@awacloud/fw/io/compress/zip.js';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const rt = new ModuleRuntime();
rt.registerDeep(zipModule);
const enc = (s) => new TextEncoder().encode(s);
const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';

const border = (color) => ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map((s) => `<w:${s} w:val="single" w:sz="4" w:space="0" w:color="${color}"/>`).join('');
const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles ${W}>
<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="22"/><w:lang w:val="en-GB"/></w:rPr></w:rPrDefault>
<w:pPrDefault><w:pPr><w:spacing w:after="160" w:line="259" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>
<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/><w:contextualSpacing/></w:pPr><w:rPr><w:rFonts w:ascii="Calibri Light" w:hAnsi="Calibri Light"/><w:spacing w:val="-10"/><w:kern w:val="28"/><w:sz w:val="56"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="240" w:after="0"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:rFonts w:ascii="Calibri Light" w:hAnsi="Calibri Light"/><w:color w:val="2F5496"/><w:sz w:val="32"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/><w:basedOn w:val="Normal"/><w:pPr><w:ind w:left="720"/><w:contextualSpacing/></w:pPr></w:style>
<w:style w:type="table" w:default="1" w:styleId="TableNormal"><w:name w:val="Normal Table"/><w:tblPr><w:tblInd w:w="0" w:type="dxa"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="108" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style>
<w:style w:type="table" w:styleId="TableGrid"><w:name w:val="Table Grid"/><w:basedOn w:val="TableNormal"/><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr><w:tblPr><w:tblBorders>${border('auto')}</w:tblBorders></w:tblPr></w:style>
<w:style w:type="table" w:styleId="GridTable4-Accent1"><w:name w:val="Grid Table 4 Accent 1"/><w:basedOn w:val="TableNormal"/><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr>
<w:tblPr><w:tblStyleRowBandSize w:val="1"/><w:tblStyleColBandSize w:val="1"/><w:tblBorders>${border('8EAADB')}</w:tblBorders></w:tblPr>
<w:tblStylePr w:type="firstRow"><w:rPr><w:b/><w:bCs/><w:color w:val="FFFFFF"/></w:rPr><w:tblPr/><w:tcPr><w:tcBorders>${border('4472C4').replace('<w:insideH w:val="single" w:sz="4" w:space="0" w:color="4472C4"/>', '<w:insideH w:val="nil"/>').replace('<w:insideV w:val="single" w:sz="4" w:space="0" w:color="4472C4"/>', '<w:insideV w:val="nil"/>')}</w:tcBorders><w:shd w:val="clear" w:color="auto" w:fill="4472C4"/></w:tcPr></w:tblStylePr>
<w:tblStylePr w:type="lastRow"><w:rPr><w:b/><w:bCs/></w:rPr><w:tblPr/><w:tcPr><w:tcBorders><w:top w:val="double" w:sz="4" w:space="0" w:color="4472C4"/></w:tcBorders></w:tcPr></w:tblStylePr>
<w:tblStylePr w:type="firstCol"><w:rPr><w:b/><w:bCs/></w:rPr></w:tblStylePr>
<w:tblStylePr w:type="band1Horz"><w:tblPr/><w:tcPr><w:shd w:val="clear" w:color="auto" w:fill="D9E2F3"/></w:tcPr></w:tblStylePr>
</w:style>
</w:styles>`;

const numbering = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering ${W}>
<w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="hybridMultilevel"/>
<w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr></w:lvl>
<w:lvl w:ilvl="1"><w:start w:val="1"/><w:numFmt w:val="lowerLetter"/><w:lvlText w:val="%2."/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="1440" w:hanging="360"/></w:pPr></w:lvl>
</w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>
</w:numbering>`;

const run = (t, rPr = '') => `<w:r>${rPr ? `<w:rPr>${rPr}</w:rPr>` : ''}<w:t xml:space="preserve">${t}</w:t></w:r>`;
const p = (body, pPr = '') => `<w:p>${pPr ? `<w:pPr>${pPr}</w:pPr>` : ''}${body}</w:p>`;
const item = (t, lvl = 0) => p(run(t), `<w:pStyle w:val="ListParagraph"/><w:numPr><w:ilvl w:val="${lvl}"/><w:numId w:val="1"/></w:numPr>`);
const cell = (t, w) => `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/></w:tcPr>${p(run(t))}</w:tc>`;
const table = (style, look, rows) => `<w:tbl><w:tblPr><w:tblStyle w:val="${style}"/><w:tblW w:w="0" w:type="auto"/><w:tblLook ${look}/></w:tblPr>`
    + `<w:tblGrid><w:gridCol w:w="3005"/><w:gridCol w:w="3005"/><w:gridCol w:w="3006"/></w:tblGrid>`
    + rows.map((r) => `<w:tr>${r.map((t, i) => cell(t, i === 2 ? 3006 : 3005)).join('')}</w:tr>`).join('') + '</w:tbl>';
const ROWS = [['Region', 'Q1', 'Q2'], ['North', '12', '15'], ['South', '9', '11'], ['East', '14', '13'], ['Total', '35', '39']];

const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document ${W}><w:body>
${p(run('Quarterly report'), '<w:pStyle w:val="Title"/>')}
${p(run('Introduction'), '<w:pStyle w:val="Heading1"/>')}
${p(run('This document carries the defaults Word writes today: Calibri 11 pt, 8 pt after each paragraph, 1.08 lines. ') + run('Bold', '<w:b/>') + run(' and ') + run('italic', '<w:i/>') + run(' text, then a second paragraph.'))}
${p(run('A second paragraph, so the spacing between paragraphs shows: Word adds the space after one paragraph to the space before the next.'))}
${p(run('Lists'), '<w:pStyle w:val="Heading1"/>')}
${item('First point')}${item('A sub-point', 1)}${item('Another sub-point', 1)}${item('Second point')}
${p(run('Tables'), '<w:pStyle w:val="Heading1"/>')}
${p(run('Table Grid: single borders, no spacing after the cell paragraphs.'))}
${table('TableGrid', 'w:val="04A0" w:firstRow="1" w:lastRow="0" w:firstColumn="1" w:lastColumn="0" w:noHBand="0" w:noVBand="1"', ROWS)}
${p(run(''))}
${p(run('Grid Table 4 Accent 1: header row, banded rows, total row.'))}
${table('GridTable4-Accent1', 'w:val="04E0" w:firstRow="1" w:lastRow="1" w:firstColumn="1" w:lastColumn="0" w:noHBand="0" w:noVBand="1"', ROWS)}
${p(run('The end.'))}
<w:sectPr><w:headerReference w:type="default" r:id="rIdH"/><w:footerReference w:type="default" r:id="rIdF"/>
<w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1417" w:right="1417" w:bottom="1417" w:left="1417" w:header="567" w:footer="850" w:gutter="0"/></w:sectPr>
</w:body></w:document>`;

const header = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:hdr ${W}>${p(run('awa viewer fixture — header'), '<w:jc w:val="right"/>')}</w:hdr>`;
const footer = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:ftr ${W}>${p(run('Footer text'), '<w:jc w:val="center"/>')}</w:ftr>`;

const MAIN = 'application/vnd.openxmlformats-officedocument.wordprocessingml';
const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="${MAIN}.document.main+xml"/>
<Override PartName="/word/styles.xml" ContentType="${MAIN}.styles+xml"/>
<Override PartName="/word/numbering.xml" ContentType="${MAIN}.numbering+xml"/>
<Override PartName="/word/header1.xml" ContentType="${MAIN}.header+xml"/>
<Override PartName="/word/footer1.xml" ContentType="${MAIN}.footer+xml"/>
</Types>`;
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/officeDocument" Target="word/document.xml"/></Relationships>`;
const docRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rIdS" Type="${REL}/styles" Target="styles.xml"/><Relationship Id="rIdN" Type="${REL}/numbering" Target="numbering.xml"/>
<Relationship Id="rIdH" Type="${REL}/header" Target="header1.xml"/><Relationship Id="rIdF" Type="${REL}/footer" Target="footer1.xml"/></Relationships>`;

writeFileSync(fileURLToPath(new URL('rich.docx', import.meta.url)), rt.resolve('zip').zipSync({
    '[Content_Types].xml': enc(contentTypes),
    '_rels/.rels': enc(rels),
    'word/document.xml': enc(document),
    'word/styles.xml': enc(styles),
    'word/numbering.xml': enc(numbering),
    'word/header1.xml': enc(header),
    'word/footer1.xml': enc(footer),
    'word/_rels/document.xml.rels': enc(docRels)
}));
