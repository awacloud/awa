// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Build the viewer's showcase samples (`public/samples/{en,fr}/`):
 * one document per format, each presenting one of our licences with the
 * web site's own copy (one source: the site's own copy).
 *
 * | Sample | Made by | Presents |
 * |---|---|---|
 * | `awa-pdf.pdf` | `@awacloud/pdf` builder, drawn as a brochure (`designs.js`) | AWA PDF |
 * | `awa-office.docx` | `@awacloud/ooxml` Word writer, a brochure (`designs.js`) | AWA Office |
 * | `awa-convert.odt` | `@awacloud/oconv` (Markdown → OpenDocument), then a reference stylesheet | AWA Convert |
 * | `offers.xlsx` | `@awacloud/ooxml` Excel writer, a styled price list | the four offers, prices |
 * | `offers.pptx` | `@awacloud/ooxml` PowerPoint writer | the four offers |
 * | `awa-markdown.md` | — (rendered by `@awacloud/md` in the viewer) | AWA Markdown |
 *
 * One source: the text is READ from the site's published offer pages
 * (`apps/awacloud/content/pages/offers*.{en,fr}.json`) at build time,
 * never retyped; a guard test rebuilds the samples and compares them with
 * the committed files, so a sentence or a price changed on the site
 * reddens it until this tool is run again. The only new sentences are the
 * colophon, the diagram labels and the sample names, validated by the
 * owner. Deterministic: fixed dates, no random identifier.
 *
 * Usage: `bun tools/build-samples.js` from the app directory (`bun run samples`).
 *
 * @module viewer/tools/build-samples
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { fw_require, modules } from '@awacloud/oconv';
import { xlsx as xlsxModule, pptx as pptxModule } from '@awacloud/ooxml';
import { INK, brochureDocx, brochurePdf, styleOdt } from './designs.js';

const app = resolve(import.meta.dir, '..');
const SITE = resolve(app, '../../awacloud/content/pages');
const LOGO = resolve(app, '../../awacloud/assets/img/icons/icon-128.png');

/** The samples, in the order the empty state lists them. */
export const SAMPLES = Object.freeze([
    { file: 'awa-pdf.pdf', label: 'PDF' },
    { file: 'awa-office.docx', label: 'Word' },
    { file: 'awa-convert.odt', label: 'OpenDocument' },
    { file: 'offers.xlsx', label: 'Excel' },
    { file: 'offers.pptx', label: 'PowerPoint' },
    { file: 'awa-markdown.md', label: 'Markdown' }
]);

/** The owner-validated sentences. Their French uses no-break spaces the PDF fonts can draw. */
const WORDS = {
    en: {
        colophon: (licence) => `Made with ${licence} by AwaCloud. Opened here by AWA Viewer, on your device: nothing was uploaded. Offers and pricing: [awacloud.com/offers](https://awacloud.com/offers)`,
        convert: 'Written in Markdown, converted to OpenDocument by AWA Convert.',
        code: 'In your code',
        codeLead: 'A few lines in the browser, no server and no upload: this page is rendered the same way.',
        diagram: ['Your file', 'Your browser', 'Your screen'],
        nothing: 'nothing leaves your device',
        offersUrl: 'https://awacloud.com/offers'
    },
    fr: {
        colophon: (licence) => `Réalisé avec ${licence} par AwaCloud. Ouvert ici par AWA Viewer, sur votre appareil\u00a0: rien n’a été envoyé. Offres et tarifs\u00a0: [awacloud.com/fr/offers](https://awacloud.com/fr/offers)`,
        convert: 'Écrit en Markdown, converti en OpenDocument par AWA Convert.',
        code: 'Dans votre code',
        codeLead: 'Quelques lignes dans le navigateur, sans serveur ni envoi\u00a0: cette page est rendue de la même façon.',
        diagram: ['Votre fichier', 'Votre navigateur', 'Votre écran'],
        nothing: 'rien ne quitte votre appareil',
        offersUrl: 'https://awacloud.com/fr/offers'
    }
};

/** The site's HTML fragments as plain text (inline code kept as code spans). */
function plain(html) {
    return String(html || '')
        .replace(/<code>([^<]*)<\/code>/g, '`$1`')
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, '\u00a0').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"').replace(/&#39;/g, '\'')
        .replace(/\s*\{#[a-z0-9-]+\}\s*$/, '')
        // The site's "opens elsewhere" arrow is page chrome, not text (and no PDF base font has it).
        .replace(/\s*↗/g, '')
        .replace(/[ \t]+\n/g, '\n')
        .trim();
}

/** Text a Markdown paragraph can hold as is (only the inline markers escaped; code spans kept). */
function md(text) {
    return text.split(/(`[^`]*`)/).map((part, i) => (i % 2 ? part : part.replace(/([\\*_[\]<>#|])/g, '\\$1'))).join('');
}

/** One page of the site: its title, description, strings and loops. */
function page(id, lang) {
    const d = JSON.parse(readFileSync(join(SITE, `${id}.${lang}.json`), 'utf8'));
    const loops = Object.fromEntries((d.loops || []).map((l) => [l.name, l.rows || []]));
    const str = (key) => plain(d.strings?.[key]);
    return { title: plain(d.title), description: plain(d.description), str, raw: (key) => String(d.strings?.[key] || ''), loop: (name) => loops[name] || [] };
}

/**
 * The site's licence paragraph for the samples: the "free under the AGPL if
 * your application complies" sentence becomes "Commercial licence or
 * AGPL-3.0-only" (owner, 2026-10-19).
 * @param {string} text
 * @param {'en'|'fr'} lang
 */
function licenceText(text, lang) {
    const said = lang === 'fr' ? 'Licence commerciale ou AGPL-3.0-only.' : 'Commercial licence or AGPL-3.0-only.';
    const out = text.replace(/(?:Free|Gratuite?s?) (?:under|sous) AGPL-3\.0-only[^.]*\./, said);
    if (out === text && text) throw new Error(`build-samples: the site's licence sentence changed (${lang}): ${text.slice(0, 80)}`);
    return out;
}

/** An offer page, the fields the samples use. */
function offer(id, lang) {
    const p = page(`offers-${id}`, lang);
    const [name, tagline] = p.title.split(/\s+—\s+/);
    const pairs = (loop) => p.loop(loop).map((r) => ({ lead: plain(r.lead), text: plain(r.text).replace(/^[:—–]\s*/, '') }));
    // The designed documents set the amount apart; the licence paragraph then
    // starts after its own restatement of the price.
    const [, amount = '', priceRest = ''] = /^<strong>(.*?)<\/strong>\s*(.*)$/s.exec(p.raw('price')) || [];
    // The site's paragraph may end on a download link: a call to action of the page, not a sentence.
    const licence = p.raw('licence.text').replace(/\s*<a\s[^>]*>.*?<\/a>/gs, '');
    const terms = licenceText(plain(licence.replace(/^<strong>.*?<\/strong>,?\s*/s, '')), lang);
    return {
        name, tagline, intro: p.str('intro'), price: p.str('price'),
        amount: plain(amount), priceRest: plain(priceRest), terms: terms.charAt(0).toUpperCase() + terms.slice(1),
        heads: { use: p.str('use.heading'), features: p.str('features.heading'), strengths: p.str('strengths.heading'), limits: p.str('limits.heading'), licence: p.str('licence.heading') },
        uses: p.loop('use.items').map((r) => plain(r.item)),
        features: pairs('features.items'),
        strengths: pairs('strengths.items'),
        limits: p.loop('limits.items').map((r) => plain(r.item))
    };
}

/** `**Lead** text` lines, as a list. */
const list = (pairs) => pairs.map((f) => `- **${md(f.lead.replace(/[.:]\s*$/, ''))}**${f.text ? ` — ${md(f.text)}` : ''}`).join('\n');
const bullets = (items) => items.map((i) => `- ${md(i)}`).join('\n');
const section = (heading, body) => (heading && body ? `## ${md(heading)}\n\n${body}\n` : '');

/** The Markdown of an offer document (PDF, Word and OpenDocument samples). */
function offerMarkdown(o, lang, { logo = false, diagram = false, extra = '' } = {}) {
    const w = WORDS[lang];
    return [
        logo ? '![AwaCloud](logo.png)\n' : '',
        `# ${md(o.name)}\n\n**${md(o.tagline)}**\n`,
        `${md(o.intro)}\n`,
        diagram ? `| ${w.diagram.join(' | ')} |\n|---|---|---|\n\n*${w.nothing}*\n` : '',
        section(o.heads.use, bullets(o.uses)),
        section(o.heads.features, list(o.features)),
        section(o.heads.strengths, list(o.strengths)),
        section(o.heads.limits, bullets(o.limits)),
        section(o.heads.licence, `> **${md(o.amount)}** ${md(o.priceRest)}\n\n${md(o.terms)}`),
        '---\n',
        extra ? `*${extra}*\n` : '',
        `${w.colophon(o.name)}\n`
    ].filter(Boolean).join('\n');
}

/** AWA Markdown in a page: the README's bootstrap example, with its output. */
const CODE_MD = [
    '```js',
    "import { bootstrapMd } from '@awacloud/md/bootstrap.js';",
    '',
    'const { md } = bootstrapMd();',
    "md.renderHtml('# Hello\\n\\n*world*');",
    "// → '<h1>Hello</h1>\\n<p><em>world</em></p>\\n'",
    '```'
].join('\n');

/** The Markdown sample: AWA Markdown's page as a guide, with a table of contents. */
function markdownSample(lang) {
    const o = offer('markdown', lang);
    const w = WORDS[lang];
    const slug = (s) => s.trim().toLowerCase().replace(/[^\p{L}\p{N}\s_-]/gu, '').replace(/\s/g, '-');
    const heads = [o.heads.features, o.heads.strengths, w.code, o.heads.licence].filter(Boolean);
    const table = [`| ${md(o.heads.strengths)} | |`, '|---|---|', ...o.strengths.map((s) => `| **${md(s.lead.replace(/[.:]\s*$/, ''))}** | ${md(s.text)} |`)].join('\n');
    return [
        `# ${md(o.name)}\n\n> **${md(o.tagline)}**\n`,
        `${md(o.intro)}\n`,
        heads.map((h) => `- [${md(h)}](#${slug(h)})`).join('\n') + '\n',
        section(o.heads.features, list(o.features)),
        section(o.heads.strengths, table),
        section(w.code, `${w.codeLead}\n\n${CODE_MD}`),
        section(o.heads.licence, `> **${md(o.amount)}** ${md(o.priceRest)}\n\n${md(o.terms)}`),
        '---\n',
        `*${w.colophon(o.name)}*\n`
    ].filter(Boolean).join('\n');
}

/** The four offers as rows: name, what it does, price as a number. */
function offerRows(lang) {
    const p = page('offers', lang);
    return {
        title: p.title,
        heads: [p.str('table.col_offer'), p.str('table.col_what'), p.str('table.col_price')],
        rows: p.loop('offers.table').map((r) => ({
            offer: plain(r.offer), what: plain(r.what),
            // A price with a currency is a number; anything else (the free
            // foundation: "Gratuit, Apache-2.0") is kept as the site says it.
            price: /€/.test(plain(r.price)) ? Number(plain(r.price).replace(/[^\d]/g, '')) : plain(r.price)
        })),
        discounts: p.loop('discounts.items').map((r) => ({ lead: plain(r.lead), text: plain(r.text).replace(/^[:—–]\s*/, '') })),
        discountsHead: p.str('discounts.heading'),
        intro: p.str('intro'),
        demos: p.str('hero.demos.text'),
        buy: p.str('hero.buy.text')
    };
}

/** The Excel sample: the offers and their prices, the discounts. */
function workbook(lang, xlsx) {
    const t = offerRows(lang);
    const c = (value, s, extra = {}) => ({ type: 'cell', value, t: typeof value === 'number' ? 'n' : 'inlineStr', s, ...extra });
    const argb = (hex) => ({ rgb: `FF${hex}` });
    const thin = { style: 'thin', color: argb(INK.sky) };
    const solid = (hex) => ({ patternType: 'solid', fgColor: argb(hex) });
    const styles = {
        numFmts: [{ id: 164, formatCode: lang === 'fr' ? '#,##0 [$€-40C]' : '[$€-809]#,##0' }],
        fonts: [
            { size: 11, name: 'Calibri', color: argb(INK.ink) },                          // 0 body
            { size: 11, name: 'Calibri', bold: true, color: argb(INK.white) },            // 1 header
            { size: 20, name: 'Calibri', bold: true, color: argb(INK.white) },            // 2 title
            { size: 10, name: 'Calibri', italic: true, color: argb(INK.muted) },          // 3 colophon
            { size: 11, name: 'Calibri', bold: true, color: argb(INK.navy) },             // 4 offer, price
            { size: 11, name: 'Calibri', color: argb(INK.sky) }                           // 5 intro on the band
        ],
        fills: [{ patternType: 'none' }, { patternType: 'gray125' }, solid(INK.navy), solid(INK.blue), solid(INK.mist), solid(INK.white)],
        borders: [{}, { left: thin, right: thin, top: thin, bottom: thin }],
        cellStyleXfs: [{ numFmtId: 0, fontId: 0, fillId: 0, borderId: 0 }],
        cellXfs: [
            { numFmtId: 0, fontId: 0, fillId: 0, borderId: 0, xfId: 0 },
            // 1 header: white on blue
            { numFmtId: 0, fontId: 1, fillId: 3, borderId: 1, xfId: 0, applyFont: true, applyFill: true, applyBorder: true, applyAlignment: true, alignment: { vertical: 'center', indent: 1 } },
            // 2 title band
            { numFmtId: 0, fontId: 2, fillId: 2, borderId: 0, xfId: 0, applyFont: true, applyFill: true, applyAlignment: true, alignment: { vertical: 'center', indent: 1 } },
            // 3 intro on the band
            { numFmtId: 0, fontId: 5, fillId: 2, borderId: 0, xfId: 0, applyFont: true, applyFill: true, applyAlignment: true, alignment: { vertical: 'top', wrapText: true, indent: 1 } },
            // 4, 5 offer name (banded), 6, 7 text (banded), 8, 9 euro price (banded), 10, 11 text price (banded)
            ...[4, 5].map((fill) => ({ numFmtId: 0, fontId: 4, fillId: fill, borderId: 1, xfId: 0, applyFont: true, applyFill: true, applyBorder: true, applyAlignment: true, alignment: { vertical: 'top', wrapText: true, indent: 1 } })),
            ...[4, 5].map((fill) => ({ numFmtId: 0, fontId: 0, fillId: fill, borderId: 1, xfId: 0, applyFill: true, applyBorder: true, applyAlignment: true, alignment: { vertical: 'top', wrapText: true } })),
            ...[4, 5].map((fill) => ({ numFmtId: 164, fontId: 4, fillId: fill, borderId: 1, xfId: 0, applyNumberFormat: true, applyFont: true, applyFill: true, applyBorder: true, applyAlignment: true, alignment: { horizontal: 'right', vertical: 'top', indent: 1 } })),
            ...[4, 5].map((fill) => ({ numFmtId: 0, fontId: 4, fillId: fill, borderId: 1, xfId: 0, applyFont: true, applyFill: true, applyBorder: true, applyAlignment: true, alignment: { horizontal: 'right', vertical: 'top', wrapText: true, indent: 1 } })),
            // 12 colophon
            { numFmtId: 0, fontId: 3, fillId: 0, borderId: 0, xfId: 0, applyFont: true, applyAlignment: true, alignment: { wrapText: true, vertical: 'top' } }
        ],
        cellStyles: [{ name: 'Normal', xfId: 0, builtinId: 0 }]
    };
    const colophon = WORDS[lang].colophon('AWA Office').replace(/\[([^\]]+)\]\([^)]+\)/, '$1');
    const band = (i) => i % 2;   // 0: mist, 1: white
    const view = (ySplit) => [{ showGridLines: false, pane: { ySplit, topLeftCell: `A${ySplit + 1}`, activePane: 'bottomLeft', state: 'frozen' } }];
    // The writer's model: rows are arrays of cells, in order; `[]` is an empty row.
    const offersSheet = {
        name: lang === 'fr' ? 'Offres' : 'Offers',
        cols: [{ min: 1, max: 1, width: 24 }, { min: 2, max: 2, width: 84 }, { min: 3, max: 3, width: 24 }],
        merges: ['A1:C1', 'A2:C2', `A${t.rows.length + 6}:C${t.rows.length + 6}`],
        rowProps: { 0: { height: 42, customHeight: true }, 1: { height: 48, customHeight: true }, 2: { height: 8, customHeight: true }, 3: { height: 24, customHeight: true }, [t.rows.length + 5]: { height: 30, customHeight: true } },
        sheetViews: view(4),
        rows: [
            [c(t.title, 2), c('', 2), c('', 2)],
            [c(t.intro, 3), c('', 3), c('', 3)],
            [],
            t.heads.map((h) => c(h, 1)),
            ...t.rows.map((row, i) => [
                c(row.offer, 4 + band(i)),
                c(row.what, 6 + band(i)),
                c(row.price, (typeof row.price === 'number' ? 8 : 10) + band(i))
            ]),
            [],
            [c(colophon, 12)]
        ]
    };
    const discountSheet = {
        name: lang === 'fr' ? 'Remises' : 'Discounts',
        cols: [{ min: 1, max: 1, width: 40 }, { min: 2, max: 2, width: 80 }],
        merges: ['A1:B1'],
        rowProps: { 0: { height: 42, customHeight: true }, 1: { height: 8, customHeight: true } },
        sheetViews: [{ showGridLines: false }],
        rows: [
            [c(t.discountsHead, 2), c('', 2)],
            [],
            ...t.discounts.map((d, i) => [c(d.lead, 4 + band(i)), c(d.text, 6 + band(i))])
        ]
    };
    return xlsx.write({ type: 'workbook', styles, sheets: [offersSheet, discountSheet] });
}

/**
 * The PowerPoint sample, designed as a sales deck on a 16:9 page: a cover,
 * the four licences as cards with their prices, one slide per licence
 * (a band with its name and price, three feature cards), and a closing
 * call to action. Every sentence is the site's (or the validated colophon).
 * @param {'en'|'fr'} lang
 * @param {any} pptx
 * @param {Uint8Array} logo
 */
function deck(lang, pptx, logo) {
    const t = offerRows(lang);
    const money = (n) => (typeof n !== 'number' ? n
        : lang === 'fr' ? `${n.toLocaleString('fr-FR').replace(/\s/g, '\u00a0')}\u00a0€` : `€${n.toLocaleString('en-GB')}`);
    const perYear = lang === 'fr' ? 'HT par application et par an' : 'excl. VAT per application per year';
    const EMU = 914400;
    const W = 13.333, H = 7.5;
    const el = (name, attrs = {}, children = []) => ({ type: 'element', name, attrs, children });
    const fill = (rgb) => el('a:solidFill', {}, [el('a:srgbClr', { val: rgb })]);
    let id = 1;
    /**
     * A shape: a box (inches), its fill and outline, and paragraphs of runs.
     * @param {{x: number, y: number, w: number, h: number, bg?: string, line?: string, round?: boolean,
     *   anchor?: string, inset?: number, paras?: {text: string, size: number, color?: string, bold?: boolean, align?: string}[][]}} s
     */
    const shape = (s) => {
        id++;
        const inset = String(Math.round((s.inset ?? 0.15) * EMU));
        return {
            type: 'shape', id, name: `Shape ${id}`,
            spPr: el('p:spPr', {}, [
                el('a:xfrm', {}, [
                    el('a:off', { x: String(Math.round(s.x * EMU)), y: String(Math.round(s.y * EMU)) }),
                    el('a:ext', { cx: String(Math.round(s.w * EMU)), cy: String(Math.round(s.h * EMU)) })
                ]),
                el('a:prstGeom', { prst: s.round ? 'roundRect' : 'rect' }, [el('a:avLst')]),
                s.bg ? fill(s.bg) : el('a:noFill'),
                s.line ? el('a:ln', { w: '19050' }, [fill(s.line)]) : el('a:ln', {}, [el('a:noFill')])
            ]),
            txBody: {
                bodyPr: el('a:bodyPr', { wrap: 'square', lIns: inset, tIns: inset, rIns: inset, bIns: inset, anchor: s.anchor || 't' }),
                paragraphs: (s.paras || [[{ text: '', size: 1200 }]]).map((runs) => ({
                    pPr: { align: runs[0]?.align || 'l' },
                    runs: runs.map((r) => ({ type: 'text', value: r.text, rPr: { lang: lang === 'fr' ? 'fr-FR' : 'en-GB', size: r.size, bold: !!r.bold, color: r.color || INK.navy } }))
                }))
            }
        };
    };
    const picture = (x, y, size) => {
        id++;
        return {
            type: 'picture', id, name: `Picture ${id}`, description: 'AwaCloud', prstGeom: 'rect',
            offsetX: Math.round(x * EMU), offsetY: Math.round(y * EMU), cx: Math.round(size * EMU), cy: Math.round(size * EMU),
            image: { data: logo, contentType: 'image/png' }
        };
    };
    const text = (value, size, color, bold = false, align = 'l') => [{ text: value, size, color, bold, align }];
    // The first sentence (or clause up to a semicolon), ending with a full stop.
    const firstSentence = (s) => (/^(.+?[.;])(\s|$)/.exec(s)?.[1] || s).replace(/\s*;$/, '.');

    const offers = ['convert', 'pdf', 'office', 'markdown'].map((key) => {
        const o = offer(key, lang);
        const row = t.rows.find((r) => r.offer === o.name);
        return { o, price: row?.price, what: row?.what || '' };
    });
    const colophon = WORDS[lang].colophon('AWA Office').replace(/\[([^\]]+)\]\([^)]+\)/, '$1');
    const slides = [];

    // 1. Cover: navy page, the logo, the offers title and the site's opening sentence.
    slides.push({ type: 'slide', shapes: [
        shape({ x: 0, y: 0, w: W, h: H, bg: INK.navy }),
        shape({ x: 0, y: H - 0.18, w: W, h: 0.18, bg: INK.sky }),
        picture(0.9, 0.9, 1.4),
        shape({ x: 0.9, y: 2.7, w: 11.5, h: 1.3, anchor: 'b', paras: [text(t.title, 4800, INK.white, true)] }),
        shape({ x: 0.9, y: 4.1, w: 10.5, h: 1.6, paras: [text(firstSentence(t.intro), 2000, INK.sky)] }),
        shape({ x: 0.9, y: 6.4, w: 6, h: 0.5, paras: [text('awacloud.com', 1400, INK.sky, true)] })
    ] });

    // 2. The four licences as cards, with their prices.
    const cardW = (W - 1.8 - 3 * 0.3) / 4;
    slides.push({ type: 'slide', shapes: [
        shape({ x: 0, y: 0, w: W, h: H, bg: INK.mist }),
        shape({ x: 0.9, y: 0.5, w: 11.5, h: 0.9, anchor: 'ctr', paras: [text(t.title, 3200, INK.navy, true)] }),
        ...offers.flatMap(({ o, price, what }, k) => {
            const x = 0.9 + k * (cardW + 0.3);
            return [
                shape({ x, y: 1.6, w: cardW, h: 5.0, bg: INK.white, line: INK.sky, round: true, inset: 0.25, paras: [
                    text(o.name, 2200, INK.navy, true),
                    text(o.tagline, 1300, INK.navy2, true),
                    // What it does, up to its first semicolon (the site's table cell).
                    text(what.split(';')[0].trim(), 1000, INK.muted)
                ] }),
                shape({ x: x + 0.25, y: 5.55, w: cardW - 0.5, h: 0.85, bg: INK.navy, round: true, anchor: 'ctr', paras: [
                    text(String(money(price ?? '')), 2000, INK.white, true, 'ctr'),
                    text(perYear, 900, INK.sky, false, 'ctr')
                ] })
            ];
        }),
        // A free row of the site's table (the foundation, French page) under the cards.
        ...t.rows.filter((r) => typeof r.price !== 'number').map((r) => shape({
            x: 0.9, y: 6.75, w: 11.5, h: 0.5, paras: [text(`${r.offer} — ${r.price}`, 1200, INK.muted)]
        }))
    ] });

    // 3-6. One slide per licence: a navy band with name and price, the tagline, three feature cards.
    for (const { o, price } of offers) {
        const feats = o.features.slice(0, 3);
        const fw = (W - 4.2 - 0.9 - 2 * 0.3) / 3;
        slides.push({ type: 'slide', shapes: [
            shape({ x: 0, y: 0, w: W, h: H, bg: INK.white }),
            shape({ x: 0, y: 0, w: 3.6, h: H, bg: INK.navy }),
            shape({ x: 0.5, y: 0.8, w: 2.7, h: 2.2, anchor: 'b', paras: [text(o.name, 3200, INK.white, true)] }),
            shape({ x: 0.5, y: 3.2, w: 2.7, h: 1.2, paras: [text(String(money(price ?? '')), 2800, INK.sky, true), text(perYear, 1000, INK.sky)] }),
            shape({ x: 0.5, y: 6.5, w: 2.8, h: 0.5, paras: [text('awacloud.com', 1200, INK.sky, true)] }),
            shape({ x: 4.2, y: 0.8, w: 8.2, h: 1.6, anchor: 'b', paras: [text(o.tagline, 2800, INK.navy, true)] }),
            shape({ x: 4.2, y: 2.5, w: 8.2, h: 1.1, paras: [text(firstSentence(o.intro), 1400, INK.navy2)] }),
            ...feats.map((f, k) => shape({
                x: 4.2 + k * (fw + 0.3), y: 3.9, w: fw, h: 2.9, bg: INK.mist, line: INK.sky, round: true, inset: 0.2, paras: [
                    text(f.lead.replace(/[.:]\s*$/, ''), 1600, INK.blue, true),
                    text(firstSentence(f.text), 1150, INK.navy)
                ]
            }))
        ] });
    }

    // 7. Call to action: demos, buying, the address; the colophon.
    slides.push({ type: 'slide', shapes: [
        shape({ x: 0, y: 0, w: W, h: H, bg: INK.navy }),
        picture(W / 2 - 0.7, 0.9, 1.4),
        shape({ x: 1, y: 2.6, w: W - 2, h: 1.1, anchor: 'ctr', paras: [text(`${t.demos} · ${t.buy}`, 3600, INK.white, true, 'ctr')] }),
        shape({ x: 1, y: 3.8, w: W - 2, h: 0.8, anchor: 'ctr', paras: [text(WORDS[lang].offersUrl.replace(/^https:\/\//, ''), 2400, INK.sky, true, 'ctr')] }),
        shape({ x: 1.5, y: 6.1, w: W - 3, h: 0.9, anchor: 'b', paras: [text(colophon, 1100, INK.sky, false, 'ctr')] })
    ] });

    return pptx.write({ sldSize: { cx: Math.round(W * EMU), cy: Math.round(H * EMU) }, slides });
}

/**
 * Build every sample.
 * @returns {Promise<Map<string, Uint8Array>>} `lang/file` → bytes
 */
export async function buildSamples() {
    const rt = new ModuleRuntime();
    rt.registerAll(fw_require);
    rt.registerAll(modules);
    rt.registerAllDeep([xlsxModule, pptxModule]);
    const oconv = rt.resolve('oconv');
    const xlsx = rt.resolve('xlsx');
    const pptx = rt.resolve('pptx');
    const logo = new Uint8Array(readFileSync(LOGO));
    const out = new Map();
    for (const lang of /** @type {const} */ (['en', 'fr'])) {
        const w = WORDS[lang];
        const site = w.offersUrl.replace(/^https:\/\//, '');
        // AWA PDF and AWA Office draw their own brochures; AWA Convert's stays a conversion from Markdown, given a reference stylesheet.
        out.set(`${lang}/awa-pdf.pdf`, brochurePdf(offer('pdf', lang), { lang, diagram: w.diagram, nothing: w.nothing, colophon: w.colophon('AWA PDF'), site }, rt, logo));
        out.set(`${lang}/awa-office.docx`, brochureDocx(offer('office', lang), { lang, colophon: w.colophon('AWA Office'), site }, rt.resolve('docx'), logo));
        const odt = await oconv.fromMd({ markdown: offerMarkdown(offer('convert', lang), lang, { logo: true, extra: w.convert }), target: 'odt', assets: { 'logo.png': logo } });
        out.set(`${lang}/awa-convert.odt`, styleOdt(odt.bytes, rt.resolve('zip')));
        out.set(`${lang}/offers.xlsx`, workbook(lang, xlsx));
        out.set(`${lang}/offers.pptx`, deck(lang, pptx, logo));
        out.set(`${lang}/awa-markdown.md`, new TextEncoder().encode(markdownSample(lang)));
        if (odt.losses?.length) process.stderr.write(`build-samples: ${lang}/awa-convert.odt losses ${JSON.stringify(odt.losses.slice(0, 5))}\n`);
    }
    return out;
}

if (import.meta.main) {
    const dir = join(app, 'public', 'samples');
    for (const [name, bytes] of await buildSamples()) {
        mkdirSync(dirname(join(dir, name)), { recursive: true });
        writeFileSync(join(dir, name), bytes);
        process.stdout.write(`build-samples: ${name} ${bytes.length} bytes\n`);
    }
}
