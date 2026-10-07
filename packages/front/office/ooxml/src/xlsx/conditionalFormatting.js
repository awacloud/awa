// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview SpreadsheetML conditional formatting — `<conditionalFormatting>`
 * blocks on a worksheet (ECMA-376 part 1 §18.3.1.18 + §18.3.1.10).
 *
 * Each block targets a range (`sqref`) and contains one or more
 * `<cfRule>` rules. Rule types fall in three families :
 *
 * | Family | Types | Visualization |
 * |--------|-------|---------------|
 * | Operator-based | `cellIs`, `expression`, `containsText`, `notContainsText`, `beginsWith`, `endsWith`, `containsBlanks`, `notContainsBlanks`, `containsErrors`, `notContainsErrors`, `duplicateValues`, `uniqueValues`, `top10`, `aboveAverage`, `timePeriod` | Apply a `dxf` from `xl/styles.xml` |
 * | Color scale | `colorScale` | 2- or 3-color gradient |
 * | Data bar | `dataBar` | In-cell horizontal bar |
 * | Icon set | `iconSet` | Icon (traffic light, arrows, …) |
 *
 * Document model :
 *
 * ```js
 * { sqref: 'A1:A10' | 'A1:A5 C1:C5',
 *   rules: [{
 *     type, priority, dxfId?, stopIfTrue?,
 *     // operator-based:
 *     operator?, formulas?: [string], text?,
 *     // top10 / aboveAverage:
 *     rank?, bottom?, percent?, aboveAverage?, equalAverage?, stdDev?,
 *     // timePeriod:
 *     timePeriod?,
 *     // visualizations:
 *     colorScale?: { cfvos: [cfvo], colors: [color] },
 *     dataBar?: { cfvos: [cfvo], color: color, showValue?, minLength?, maxLength? },
 *     iconSet?: { iconSet, cfvos: [cfvo], showValue?, percent?, reverse? },
 *     _extras?
 *   }],
 *   _extras?
 * }
 *
 * cfvo := { type: 'min'|'max'|'num'|'percent'|'percentile'|'formula',
 *           val?: string, gte?: boolean }
 * color := { rgb?: 'AARRGGBB', theme?: number, tint?: number }
 * ```
 *
 * @module ooxml/xlsx/conditionalFormatting
 */

import { xml } from '@awacloud/fw/io/codec/xml.js';
import { ooxmlShared } from '../_shared/index.js';

export const xlsxConditionalFormatting = {
    name: 'xlsxConditionalFormatting',
    dependencies: ['xml', 'ooxmlShared'],
    deps: [xml, ooxmlShared],

    factory(xml, shared) {
        const { readBoolAttr, writeBoolAttr } = shared;

        // --- color — backed by the shared xlsx color codec. The cf
        //     flavour historically did not surface `auto`; the unified
        //     codec writes `auto` only when truthy, so inputs without
        //     it round-trip identically (no attribute leakage).
        const _xlsxColor = shared.createXlsxColorCodec(xml);
        const parseColor = _xlsxColor.parseColor;
        const renderColor = _xlsxColor.renderColor;

        // --- cfvo (Conditional Formatting Value Object) ---

        function parseCfvo(el) {
            const out = { type: el.attrs.type };
            if (el.attrs.val != null) out.val = el.attrs.val;
            if (el.attrs.gte != null) out.gte = readBoolAttr(el.attrs.gte);
            return out;
        }

        function renderCfvo(c) {
            const a = { type: c.type };
            if (c.val != null) a.val = String(c.val);
            if (c.gte != null) a.gte = writeBoolAttr(c.gte);
            return xml.el('cfvo', a);
        }

        // --- Visualization elements ---

        function parseColorScale(el) {
            return {
                cfvos: xml.findAll(el, 'cfvo').map(parseCfvo),
                colors: xml.findAll(el, 'color').map(parseColor)
            };
        }

        function renderColorScale(cs) {
            const children = [];
            for (const v of cs.cfvos || []) children.push(renderCfvo(v));
            for (const c of cs.colors || []) children.push(renderColor('color', c));
            return xml.el('colorScale', {}, children);
        }

        function parseDataBar(el) {
            const out = { cfvos: [] };
            for (const c of el.children) {
                if (c.type !== 'element') continue;
                if (c.name === 'cfvo')  out.cfvos.push(parseCfvo(c));
                else if (c.name === 'color') out.color = parseColor(c);
            }
            for (const k of ['minLength', 'maxLength']) {
                if (el.attrs[k] != null) out[k] = Number(el.attrs[k]);
            }
            if (el.attrs.showValue != null) out.showValue = readBoolAttr(el.attrs.showValue);
            return out;
        }

        function renderDataBar(db) {
            const a = {};
            if (db.minLength != null)  a.minLength = String(db.minLength);
            if (db.maxLength != null)  a.maxLength = String(db.maxLength);
            if (db.showValue != null)  a.showValue = writeBoolAttr(db.showValue);
            const children = [];
            for (const v of db.cfvos || []) children.push(renderCfvo(v));
            if (db.color) children.push(renderColor('color', db.color));
            return xml.el('dataBar', a, children);
        }

        function parseIconSet(el) {
            const out = {
                iconSet: el.attrs.iconSet || '3TrafficLights1',
                cfvos: xml.findAll(el, 'cfvo').map(parseCfvo)
            };
            if (el.attrs.showValue != null) out.showValue = readBoolAttr(el.attrs.showValue);
            if (el.attrs.percent != null)   out.percent = readBoolAttr(el.attrs.percent);
            if (el.attrs.reverse != null)   out.reverse = readBoolAttr(el.attrs.reverse);
            return out;
        }

        function renderIconSet(is) {
            const a = { iconSet: is.iconSet || '3TrafficLights1' };
            if (is.showValue != null) a.showValue = writeBoolAttr(is.showValue);
            if (is.percent != null)   a.percent = writeBoolAttr(is.percent);
            if (is.reverse != null)   a.reverse = writeBoolAttr(is.reverse);
            return xml.el('iconSet', a, (is.cfvos || []).map(renderCfvo));
        }

        // --- cfRule ---

        const RULE_FLAG_ATTRS = [
            'aboveAverage', 'equalAverage', 'bottom', 'percent'
        ];

        function parseRule(el) {
            const a = el.attrs;
            const out = { type: a.type, priority: Number(a.priority) };

            if (a.dxfId != null)        out.dxfId = Number(a.dxfId);
            if (a.stopIfTrue != null)   out.stopIfTrue = readBoolAttr(a.stopIfTrue);
            if (a.operator)             out.operator = a.operator;
            if (a.text != null)         out.text = a.text;
            if (a.rank != null)         out.rank = Number(a.rank);
            if (a.stdDev != null)       out.stdDev = Number(a.stdDev);
            if (a.timePeriod)           out.timePeriod = a.timePeriod;
            for (const k of RULE_FLAG_ATTRS) {
                if (a[k] != null) out[k] = readBoolAttr(a[k]);
            }

            const formulas = [];
            const extras = [];
            for (const c of el.children) {
                if (c.type !== 'element') continue;
                switch (c.name) {
                    case 'formula':    formulas.push(xml.textContent(c)); break;
                    case 'colorScale': out.colorScale = parseColorScale(c); break;
                    case 'dataBar':    out.dataBar = parseDataBar(c); break;
                    case 'iconSet':    out.iconSet = parseIconSet(c); break;
                    default:           extras.push(c);
                }
            }
            if (formulas.length) out.formulas = formulas;
            if (extras.length)   out._extras = extras;
            return out;
        }

        function renderRule(r) {
            const a = { type: r.type, priority: String(r.priority) };
            if (r.dxfId != null)        a.dxfId = String(r.dxfId);
            if (r.stopIfTrue != null)   a.stopIfTrue = writeBoolAttr(r.stopIfTrue);
            if (r.operator)             a.operator = r.operator;
            if (r.text != null)         a.text = r.text;
            if (r.rank != null)         a.rank = String(r.rank);
            if (r.stdDev != null)       a.stdDev = String(r.stdDev);
            if (r.timePeriod)           a.timePeriod = r.timePeriod;
            for (const k of RULE_FLAG_ATTRS) {
                if (r[k] != null) a[k] = writeBoolAttr(r[k]);
            }

            const children = [];
            for (const f of r.formulas || []) {
                children.push(xml.el('formula', {}, [xml.text(f)]));
            }
            if (r.colorScale) children.push(renderColorScale(r.colorScale));
            if (r.dataBar)    children.push(renderDataBar(r.dataBar));
            if (r.iconSet)    children.push(renderIconSet(r.iconSet));
            if (r._extras) for (const ex of r._extras) children.push(ex);
            return xml.el('cfRule', a, children);
        }

        // --- conditionalFormatting block ---

        function parseBlock(el) {
            const out = {
                sqref: el.attrs.sqref,
                rules: xml.findAll(el, 'cfRule').map(parseRule)
            };
            const extras = el.children.filter(n =>
                n.type === 'element' && n.name !== 'cfRule');
            if (extras.length) out._extras = extras;
            return out;
        }

        function renderBlock(b) {
            const a = { sqref: b.sqref };
            const children = (b.rules || []).map(renderRule);
            if (b._extras) for (const ex of b._extras) children.push(ex);
            return xml.el('conditionalFormatting', a, children);
        }

        return {
            parseBlock, renderBlock,
            parseRule, renderRule,
            parseCfvo, renderCfvo,
            parseColorScale, renderColorScale,
            parseDataBar, renderDataBar,
            parseIconSet, renderIconSet,
            parseColor, renderColor
        };
    }
};
