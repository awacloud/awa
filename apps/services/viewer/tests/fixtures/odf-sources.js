// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview XML sources of the OpenDocument fixtures (see
 * `build-odf.js`). French content on purpose: the fixtures also exercise
 * `lang` propagation and non-ASCII text.
 *
 * @module viewer/tests/fixtures/odf-sources
 */

/** A 1×1 red PNG (scaled by its frame). */
export const PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

const NS = [
    'xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"',
    'xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0"',
    'xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"',
    'xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0"',
    'xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0"',
    'xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0"',
    'xmlns:xlink="http://www.w3.org/1999/xlink"',
    'xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0"',
    'xmlns:dc="http://purl.org/dc/elements/1.1/"',
    'xmlns:meta="urn:oasis:names:tc:opendocument:xmlns:meta:1.0"',
    'xmlns:presentation="urn:oasis:names:tc:opendocument:xmlns:presentation:1.0"',
    'xmlns:number="urn:oasis:names:tc:opendocument:xmlns:datastyle:1.0"',
    'xmlns:of="urn:oasis:names:tc:opendocument:xmlns:of:1.2"'
].join(' ');

const FONTS = `<office:font-face-decls>
<style:font-face style:name="Liberation Serif" svg:font-family="'Liberation Serif'" style:font-family-generic="roman"/>
<style:font-face style:name="Liberation Sans" svg:font-family="'Liberation Sans'" style:font-family-generic="swiss"/>
<style:font-face style:name="Liberation Mono" svg:font-family="'Liberation Mono'" style:font-pitch="fixed"/>
</office:font-face-decls>`;

const meta = (title) => `<?xml version="1.0" encoding="UTF-8"?><office:document-meta ${NS} office:version="1.3"><office:meta><dc:title>${title}</dc:title><dc:creator>awa fixture</dc:creator></office:meta></office:document-meta>`;

export const ODT = {
    meta: meta('Rapport trimestriel'),
    styles: `<?xml version="1.0" encoding="UTF-8"?>
<office:document-styles ${NS} office:version="1.3">${FONTS}
<office:styles>
<style:default-style style:family="paragraph"><style:paragraph-properties fo:orphans="2"/><style:text-properties style:font-name="Liberation Serif" fo:font-size="12pt" fo:language="fr" fo:country="FR"/></style:default-style>
<style:style style:name="Standard" style:family="paragraph" style:class="text"/>
<style:style style:name="Heading" style:family="paragraph" style:parent-style-name="Standard" style:next-style-name="Text_20_body"><style:paragraph-properties fo:margin-top="0.423cm" fo:margin-bottom="0.212cm" fo:keep-with-next="always"/><style:text-properties style:font-name="Liberation Sans" fo:font-size="14pt"/></style:style>
<style:style style:name="Heading_20_1" style:display-name="Heading 1" style:family="paragraph" style:parent-style-name="Heading" style:default-outline-level="1"><style:text-properties fo:font-size="130%" fo:font-weight="bold" fo:color="#1c3a5e"/></style:style>
<style:style style:name="Heading_20_2" style:display-name="Heading 2" style:family="paragraph" style:parent-style-name="Heading" style:default-outline-level="2"><style:text-properties fo:font-size="115%" fo:font-weight="bold"/></style:style>
<style:style style:name="Text_20_body" style:display-name="Text body" style:family="paragraph" style:parent-style-name="Standard"><style:paragraph-properties fo:margin-top="0cm" fo:margin-bottom="0.247cm" fo:line-height="115%"/></style:style>
<style:style style:name="Title" style:family="paragraph" style:parent-style-name="Heading"><style:paragraph-properties fo:text-align="center"/><style:text-properties fo:font-size="28pt" fo:font-weight="bold"/></style:style>
<style:style style:name="Emphasis" style:family="text"><style:text-properties fo:font-style="italic"/></style:style>
<style:style style:name="Source_20_Text" style:display-name="Source Text" style:family="text"><style:text-properties style:font-name="Liberation Mono"/></style:style>
<text:list-style style:name="Numbering_20_123"><text:list-level-style-number text:level="1" style:num-suffix="." style:num-format="1"><style:list-level-properties text:list-level-position-and-space-mode="label-alignment"><style:list-level-label-alignment text:label-followed-by="listtab" fo:text-indent="-0.635cm" fo:margin-left="0.635cm"/></style:list-level-properties></text:list-level-style-number><text:list-level-style-number text:level="2" style:num-suffix=")" style:num-format="a"><style:list-level-properties text:list-level-position-and-space-mode="label-alignment"><style:list-level-label-alignment fo:text-indent="-0.635cm" fo:margin-left="1.27cm"/></style:list-level-properties></text:list-level-style-number></text:list-style>
<text:list-style style:name="List_20_1"><text:list-level-style-bullet text:level="1" text:bullet-char="•"><style:list-level-properties text:list-level-position-and-space-mode="label-alignment"><style:list-level-label-alignment fo:text-indent="-0.635cm" fo:margin-left="0.635cm"/></style:list-level-properties></text:list-level-style-bullet><text:list-level-style-bullet text:level="2" text:bullet-char="◦"><style:list-level-properties text:list-level-position-and-space-mode="label-alignment"><style:list-level-label-alignment fo:text-indent="-0.635cm" fo:margin-left="1.27cm"/></style:list-level-properties></text:list-level-style-bullet></text:list-style>
</office:styles>
<office:automatic-styles>
<style:page-layout style:name="pm1"><style:page-layout-properties fo:page-width="21.001cm" fo:page-height="29.7cm" fo:margin-top="2cm" fo:margin-bottom="2cm" fo:margin-left="2cm" fo:margin-right="2cm"/></style:page-layout>
<style:style style:name="MP1" style:family="paragraph"><style:paragraph-properties fo:text-align="center"/><style:text-properties fo:font-size="9pt" fo:color="#666666"/></style:style>
</office:automatic-styles>
<office:master-styles><style:master-page style:name="Standard" style:page-layout-name="pm1"><style:footer><text:p text:style-name="MP1">Pied de page — fixture du viewer</text:p></style:footer></style:master-page></office:master-styles>
</office:document-styles>`,
    content: `<?xml version="1.0" encoding="UTF-8"?>
<office:document-content ${NS} office:version="1.3">
<office:automatic-styles>
<style:style style:name="P1" style:family="paragraph" style:parent-style-name="Text_20_body"><style:paragraph-properties fo:text-align="justify" fo:text-indent="0.5cm"/></style:style>
<style:style style:name="P2" style:family="paragraph" style:parent-style-name="Text_20_body"><style:paragraph-properties fo:background-color="#fff3cd" fo:padding="0.2cm" fo:border="0.5pt solid #e0a800" fo:margin-left="1cm" fo:margin-right="1cm"/></style:style>
<style:style style:name="P3" style:family="paragraph" style:parent-style-name="Text_20_body"><style:paragraph-properties fo:break-before="page"/></style:style>
<style:style style:name="P4" style:family="paragraph"><style:text-properties fo:color="#ffffff" fo:font-weight="bold"/></style:style>
<style:style style:name="T1" style:family="text"><style:text-properties fo:color="#c00000" fo:font-weight="bold"/></style:style>
<style:style style:name="T2" style:family="text"><style:text-properties style:text-underline-style="solid" style:text-underline-width="auto" style:text-underline-color="font-color"/></style:style>
<style:style style:name="T3" style:family="text"><style:text-properties style:text-position="super 58%"/></style:style>
<style:style style:name="T4" style:family="text"><style:text-properties fo:background-color="#ffff00" style:text-line-through-style="solid"/></style:style>
<style:style style:name="Table1" style:family="table"><style:table-properties style:width="12cm" table:align="center"/></style:style>
<style:style style:name="Table1.A" style:family="table-column"><style:table-column-properties style:column-width="4cm"/></style:style>
<style:style style:name="Table1.A1" style:family="table-cell"><style:table-cell-properties fo:background-color="#1c3a5e" fo:padding="0.1cm" fo:border="0.5pt solid #000000"/></style:style>
<style:style style:name="Table1.A2" style:family="table-cell"><style:table-cell-properties fo:padding="0.1cm" fo:border="0.5pt solid #000000"/></style:style>
<style:style style:name="fr1" style:family="graphic"><style:graphic-properties style:wrap="none"/></style:style>
</office:automatic-styles>
<office:body><office:text>
<text:p text:style-name="Title">Rapport trimestriel</text:p>
<text:h text:style-name="Heading_20_1" text:outline-level="1">1. Introduction</text:h>
<text:p text:style-name="P1">Ce document teste le rendu d’un fichier OpenDocument : un paragraphe justifié avec un retrait de première ligne, du <text:span text:style-name="T1">texte rouge en gras</text:span>, du <text:span text:style-name="T2">texte souligné</text:span>, un exposant<text:span text:style-name="T3">2</text:span>, du <text:span text:style-name="T4">texte surligné barré</text:span>, de l’<text:span text:style-name="Emphasis">emphase</text:span> et du <text:span text:style-name="Source_20_Text">code source</text:span>. Voir <text:a xlink:type="simple" xlink:href="https://example.org/">example.org</text:a>.<text:tab/>Après une tabulation.<text:line-break/>Après un saut de ligne.</text:p>
<text:p text:style-name="P2">Encadré : un paragraphe avec fond, bordure et retraits.</text:p>
<text:h text:style-name="Heading_20_2" text:outline-level="2">1.1 Listes</text:h>
<text:list text:style-name="Numbering_20_123"><text:list-item><text:p text:style-name="Text_20_body">Premier point</text:p><text:list><text:list-item><text:p text:style-name="Text_20_body">Sous-point a</text:p></text:list-item><text:list-item><text:p text:style-name="Text_20_body">Sous-point b</text:p></text:list-item></text:list></text:list-item><text:list-item><text:p text:style-name="Text_20_body">Deuxième point</text:p></text:list-item></text:list>
<text:list text:style-name="List_20_1"><text:list-item><text:p text:style-name="Text_20_body">Puce un</text:p></text:list-item><text:list-item><text:p text:style-name="Text_20_body">Puce deux</text:p></text:list-item></text:list>
<text:h text:style-name="Heading_20_2" text:outline-level="2">1.2 Tableau et image</text:h>
<table:table table:name="Table1" table:style-name="Table1"><table:table-column table:style-name="Table1.A" table:number-columns-repeated="3"/>
<table:table-row><table:table-cell table:style-name="Table1.A1" office:value-type="string"><text:p text:style-name="P4">Région</text:p></table:table-cell><table:table-cell table:style-name="Table1.A1" office:value-type="string"><text:p text:style-name="P4">T1</text:p></table:table-cell><table:table-cell table:style-name="Table1.A1" office:value-type="string"><text:p text:style-name="P4">T2</text:p></table:table-cell></table:table-row>
<table:table-row><table:table-cell table:style-name="Table1.A2" office:value-type="string"><text:p>Nord</text:p></table:table-cell><table:table-cell table:style-name="Table1.A2" office:value-type="float" office:value="12"><text:p>12</text:p></table:table-cell><table:table-cell table:style-name="Table1.A2" office:value-type="float" office:value="15"><text:p>15</text:p></table:table-cell></table:table-row>
<table:table-row><table:table-cell table:style-name="Table1.A2" table:number-columns-spanned="2" office:value-type="string"><text:p>Fusion sur deux colonnes</text:p></table:table-cell><table:covered-table-cell/><table:table-cell table:style-name="Table1.A2" office:value-type="float" office:value="27"><text:p>27</text:p></table:table-cell></table:table-row>
</table:table>
<text:p text:style-name="Text_20_body"><draw:frame draw:style-name="fr1" draw:name="Image1" text:anchor-type="as-char" svg:width="2cm" svg:height="2cm"><draw:image xlink:href="Pictures/img.png" xlink:type="simple"/><svg:title>Carré de test</svg:title></draw:frame> Image en ligne.</text:p>
<text:p text:style-name="P3">Deuxième page, après un saut de page.</text:p>
</office:text></office:body></office:document-content>`
};

export const ODS = {
    meta: meta('Ventes 2026'),
    styles: `<?xml version="1.0" encoding="UTF-8"?>
<office:document-styles ${NS} office:version="1.3">${FONTS}
<office:styles>
<style:default-style style:family="table-cell"><style:text-properties style:font-name="Liberation Sans" fo:font-size="10pt"/></style:default-style>
<style:style style:name="Default" style:family="table-cell"/>
<number:number-style style:name="N2"><number:number number:decimal-places="2" number:min-decimal-places="2" number:min-integer-digits="1" number:grouping="true"/></number:number-style>
</office:styles>
</office:document-styles>`,
    content: `<?xml version="1.0" encoding="UTF-8"?>
<office:document-content ${NS} office:version="1.3">
<office:automatic-styles>
<style:style style:name="co1" style:family="table-column"><style:table-column-properties style:column-width="3.5cm"/></style:style>
<style:style style:name="co2" style:family="table-column"><style:table-column-properties style:column-width="2.5cm"/></style:style>
<style:style style:name="ro1" style:family="table-row"><style:table-row-properties style:row-height="0.6cm"/></style:style>
<style:style style:name="ce1" style:family="table-cell" style:parent-style-name="Default"><style:table-cell-properties fo:background-color="#1c3a5e" style:vertical-align="middle"/><style:paragraph-properties fo:text-align="center"/><style:text-properties fo:color="#ffffff" fo:font-weight="bold"/></style:style>
<style:style style:name="ce2" style:family="table-cell" style:parent-style-name="Default" style:data-style-name="N2"><style:paragraph-properties fo:text-align="end"/></style:style>
<style:style style:name="ce3" style:family="table-cell" style:parent-style-name="Default"><style:table-cell-properties fo:border-top="1pt solid #000000"/><style:text-properties fo:font-weight="bold"/></style:style>
</office:automatic-styles>
<office:body><office:spreadsheet>
<table:table table:name="Ventes">
<table:table-column table:style-name="co1"/><table:table-column table:style-name="co2" table:number-columns-repeated="3"/>
<table:table-row table:style-name="ro1"><table:table-cell table:style-name="ce1" office:value-type="string"><text:p>Région</text:p></table:table-cell><table:table-cell table:style-name="ce1" office:value-type="string"><text:p>T1</text:p></table:table-cell><table:table-cell table:style-name="ce1" office:value-type="string"><text:p>T2</text:p></table:table-cell><table:table-cell table:style-name="ce1" office:value-type="string"><text:p>Total</text:p></table:table-cell></table:table-row>
<table:table-row table:style-name="ro1"><table:table-cell office:value-type="string"><text:p>Nord</text:p></table:table-cell><table:table-cell table:style-name="ce2" office:value-type="float" office:value="1234.5"><text:p>1 234,50</text:p></table:table-cell><table:table-cell table:style-name="ce2" office:value-type="float" office:value="980"><text:p>980,00</text:p></table:table-cell><table:table-cell table:style-name="ce2" table:formula="of:=[.B2]+[.C2]" office:value-type="float" office:value="2214.5"><text:p>2 214,50</text:p></table:table-cell></table:table-row>
<table:table-row table:style-name="ro1"><table:table-cell office:value-type="string"><text:p>Sud</text:p></table:table-cell><table:table-cell table:style-name="ce2" office:value-type="float" office:value="760"><text:p>760,00</text:p></table:table-cell><table:table-cell table:style-name="ce2" office:value-type="float" office:value="1120.25"><text:p>1 120,25</text:p></table:table-cell><table:table-cell table:style-name="ce2" table:formula="of:=[.B3]+[.C3]" office:value-type="float" office:value="1880.25"><text:p>1 880,25</text:p></table:table-cell></table:table-row>
<table:table-row table:style-name="ro1"><table:table-cell table:style-name="ce3" office:value-type="string"><text:p>Total</text:p></table:table-cell><table:table-cell table:style-name="ce3" table:formula="of:=SUM([.B2:.B3])" office:value-type="float" office:value="1994.5"><text:p>1994,5</text:p></table:table-cell><table:table-cell table:style-name="ce3" table:formula="of:=SUM([.C2:.C3])" office:value-type="float" office:value="2100.25"><text:p>2100,25</text:p></table:table-cell><table:table-cell table:style-name="ce3" table:formula="of:=SUM([.D2:.D3])" office:value-type="float" office:value="4094.75"><text:p>4094,75</text:p></table:table-cell></table:table-row>
<table:table-row table:number-rows-repeated="2"><table:table-cell table:number-columns-repeated="4"/></table:table-row>
<table:table-row><table:table-cell table:number-columns-spanned="3" office:value-type="string"><text:p>Note : cellule fusionnée sur trois colonnes.</text:p></table:table-cell><table:covered-table-cell table:number-columns-repeated="2"/><table:table-cell office:value-type="date" office:date-value="2026-10-10"><text:p>10/10/2026</text:p></table:table-cell></table:table-row>
</table:table>
<table:table table:name="Notes"><table:table-column/><table:table-row><table:table-cell office:value-type="string"><text:p>Deuxième feuille.</text:p></table:table-cell></table:table-row></table:table>
</office:spreadsheet></office:body></office:document-content>`
};

export const ODP = {
    meta: meta('Présentation de test'),
    styles: `<?xml version="1.0" encoding="UTF-8"?>
<office:document-styles ${NS} office:version="1.3">${FONTS}
<office:styles>
<style:default-style style:family="graphic"><style:paragraph-properties fo:text-align="start"/><style:text-properties style:font-name="Liberation Sans" fo:font-size="18pt"/></style:default-style>
</office:styles>
<office:automatic-styles>
<style:page-layout style:name="PM1"><style:page-layout-properties fo:page-width="28cm" fo:page-height="15.75cm" style:print-orientation="landscape"/></style:page-layout>
<style:style style:name="dp1" style:family="drawing-page"><style:drawing-page-properties draw:fill="solid" draw:fill-color="#f4f9fc"/></style:style>
</office:automatic-styles>
<office:master-styles><style:master-page style:name="Default" style:page-layout-name="PM1" draw:style-name="dp1"/></office:master-styles>
</office:document-styles>`,
    content: `<?xml version="1.0" encoding="UTF-8"?>
<office:document-content ${NS} office:version="1.3">
<office:automatic-styles>
<style:style style:name="dp2" style:family="drawing-page"><style:drawing-page-properties draw:fill="solid" draw:fill-color="#00263d"/></style:style>
<style:style style:name="gr1" style:family="graphic"><style:graphic-properties draw:fill="solid" draw:fill-color="#b3dfef" draw:stroke="solid" svg:stroke-color="#003462" svg:stroke-width="0.05cm"/></style:style>
<style:style style:name="gr2" style:family="graphic"><style:graphic-properties draw:fill="none" draw:stroke="none"/></style:style>
<style:style style:name="P1" style:family="paragraph"><style:paragraph-properties fo:text-align="center"/><style:text-properties fo:font-size="40pt" fo:font-weight="bold" fo:color="#ffffff"/></style:style>
<style:style style:name="P2" style:family="paragraph"><style:paragraph-properties fo:text-align="center"/><style:text-properties fo:font-size="22pt" fo:color="#b3dfef"/></style:style>
<style:style style:name="P3" style:family="paragraph"><style:text-properties fo:font-size="28pt" fo:font-weight="bold" fo:color="#00263d"/></style:style>
<style:style style:name="P4" style:family="paragraph"><style:paragraph-properties fo:text-align="center"/><style:text-properties fo:font-size="16pt" fo:color="#00263d"/></style:style>
<text:list-style style:name="L1"><text:list-level-style-bullet text:level="1" text:bullet-char="●"><style:list-level-properties text:space-before="0.3cm" text:min-label-width="0.6cm"/></text:list-level-style-bullet></text:list-style>
</office:automatic-styles>
<office:body><office:presentation>
<draw:page draw:name="page1" draw:style-name="dp2" draw:master-page-name="Default">
<draw:frame presentation:class="title" svg:x="2cm" svg:y="4cm" svg:width="24cm" svg:height="3cm"><draw:text-box><text:p text:style-name="P1">Bilan du trimestre</text:p></draw:text-box></draw:frame>
<draw:frame presentation:class="subtitle" svg:x="2cm" svg:y="8cm" svg:width="24cm" svg:height="2cm"><draw:text-box><text:p text:style-name="P2">awa viewer — fixture ODP</text:p></draw:text-box></draw:frame>
</draw:page>
<draw:page draw:name="page2" draw:master-page-name="Default">
<draw:frame presentation:class="title" svg:x="1.5cm" svg:y="0.8cm" svg:width="25cm" svg:height="2cm"><draw:text-box><text:p text:style-name="P3">Points clés</text:p></draw:text-box></draw:frame>
<draw:frame presentation:class="outline" svg:x="1.5cm" svg:y="3.5cm" svg:width="14cm" svg:height="9cm"><draw:text-box><text:list text:style-name="L1"><text:list-item><text:p>Croissance de 12 %</text:p></text:list-item><text:list-item><text:p>Deux nouvelles régions</text:p></text:list-item><text:list-item><text:p>Objectifs atteints</text:p></text:list-item></text:list></draw:text-box></draw:frame>
<draw:custom-shape draw:style-name="gr1" svg:x="17cm" svg:y="4cm" svg:width="9cm" svg:height="5cm"><text:p text:style-name="P4">Forme avec texte</text:p><draw:enhanced-geometry draw:type="round-rectangle"/></draw:custom-shape>
<draw:frame draw:style-name="gr2" svg:x="20cm" svg:y="10cm" svg:width="3cm" svg:height="3cm"><draw:image xlink:href="Pictures/img.png" xlink:type="simple"/><svg:title>Carré de test</svg:title></draw:frame>
</draw:page>
</office:presentation></office:body></office:document-content>`
};
