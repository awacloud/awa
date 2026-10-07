// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { xml as fwXml } from '@awacloud/fw/io/codec/xml.js';
import { chartTyped } from './chart-typed.js';
import { odfTypedHelper } from './_typed-helper.js';

const xml = fwXml.factory();
const helper = odfTypedHelper.factory(xml);
const ext = chartTyped.factory(xml, helper);

describe('chartTyped', () => {
    test('contract', () => {
        expect(chartTyped.name).toBe('chartTyped');
        expect(chartTyped.dependencies).toEqual(['xml', 'odfTypedHelper']);
    });
    test('parses deep chart tree', () => {
        const el = xml.el('chart:chart', { 'chart:class': 'bar' }, [
            xml.el('chart:title', {}, []),
            xml.el('chart:plot-area', {}, [
                xml.el('chart:axis', { 'chart:dimension': 'x' }, []),
                xml.el('chart:series', { 'chart:class': 'bar' }, [
                    xml.el('chart:data-point', {}, [])
                ])
            ])
        ]);
        const p = ext.parseChart(el);
        expect(p.kind).toBe('chart');
        expect(p.children).toHaveLength(2);
        expect(p.children[1].children[1].kind).toBe('series');
        const back = ext.renderChart(p);
        expect(back.name).toBe('chart:chart');
    });
});
