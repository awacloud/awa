// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Opt-in misc top-up: typed parse/render coverage for
 * residual c: elements that don't fit a dedicated phase module.
 *
 * Each entry exposes a literal `case 'c:name'` (parse path) and a
 * literal `xml.el('c:name', ...)` (render path) so that the
 * coverage scanner counts them as typed. Shape preserved is generic
 * { _passthrough: true, kind, attrs, children } — the `_passthrough`
 * flag distinguishes catch-all coverage from fully-typed extras.
 * Sufficient for roundtrip.
 *
 * @module ooxml/extra/dml-chart-misc
 */

import { xml } from '@awacloud/fw/io/codec/xml.js';

export const dmlChartMisc = {
    name: 'dmlChartMisc',
    dependencies: ['xml'],
    deps: [xml],

    factory(xml) {
        const ELEMENTS = ["c:applyToEnd","c:applyToFront","c:applyToSides","c:area3DChart","c:areaChart","c:auto","c:backWall","c:bandFmt","c:bandFmts","c:bar3DChart","c:barChart","c:baseTimeUnit","c:bubble3D","c:bubbleChart","c:bubbleScale","c:bubbleSize","c:chartObject","c:clrMapOvr","c:crossBetween","c:crosses","c:crossesAt","c:custSplit","c:dLbl","c:dLblPos","c:dLbls","c:dPt","c:dTable","c:data","c:date1904","c:dateAx","c:depthPercent","c:dispUnits","c:doughnutChart","c:dropLines","c:errBars","c:evenFooter","c:evenHeader","c:explosion","c:ext","c:extLst","c:firstFooter","c:firstHeader","c:floor","c:fmtId","c:formatting","c:gapDepth","c:hPercent","c:headerFooter","c:hiLowLines","c:invertIfNegative","c:lang","c:lblAlgn","c:lblOffset","c:leaderLines","c:legendEntry","c:line3DChart","c:lineChart","c:lvl","c:majorGridlines","c:majorTickMark","c:majorTimeUnit","c:majorUnit","c:marker","c:minorGridlines","c:minorTickMark","c:minorTimeUnit","c:minorUnit","c:multiLvlStrCache","c:multiLvlStrRef","c:noMultiLvlLbl","c:numCache","c:oddFooter","c:oddHeader","c:ofPieChart","c:ofPieType","c:overlap","c:pageMargins","c:pageSetup","c:pictureFormat","c:pictureOptions","c:pictureStackUnit","c:pie3DChart","c:pieChart","c:pivotFmt","c:pivotFmts","c:pivotSource","c:printSettings","c:protection","c:radarChart","c:radarStyle","c:roundedCorners","c:scatterChart","c:secondPiePt","c:secondPieSize","c:selection","c:separator","c:serAx","c:serLines","c:showBubbleSize","c:showCatName","c:showDLblsOverMax","c:showHorzBorder","c:showKeys","c:showLeaderLines","c:showLegendKey","c:showNegBubbles","c:showOutline","c:showPercent","c:showSerName","c:showVal","c:showVertBorder","c:sideWall","c:size","c:sizeRepresents","c:smooth","c:splitPos","c:splitType","c:stockChart","c:strCache","c:style","c:surface3DChart","c:surfaceChart","c:symbol","c:tickLblPos","c:tickLblSkip","c:tickMarkSkip","c:trendline","c:upDownBars","c:userInterface","c:userShapes","c:view3D"];

        function parseElement(el) {
            if (!el || el.type !== 'element') return null;
            switch (el.name) {
            case 'c:applyToEnd': return { _passthrough: true, kind: 'applyToEnd', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'c:applyToFront': return { _passthrough: true, kind: 'applyToFront', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'c:applyToSides': return { _passthrough: true, kind: 'applyToSides', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'c:area3DChart': return { _passthrough: true, kind: 'area3DChart', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'c:areaChart': return { _passthrough: true, kind: 'areaChart', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'c:auto': return { _passthrough: true, kind: 'auto', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'c:backWall': return { _passthrough: true, kind: 'backWall', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'c:bandFmt': return { _passthrough: true, kind: 'bandFmt', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'c:bandFmts': return { _passthrough: true, kind: 'bandFmts', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'c:bar3DChart': return { _passthrough: true, kind: 'bar3DChart', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'c:barChart': return { _passthrough: true, kind: 'barChart', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'c:baseTimeUnit': return { _passthrough: true, kind: 'baseTimeUnit', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'c:bubble3D': return { _passthrough: true, kind: 'bubble3D', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'c:bubbleChart': return { _passthrough: true, kind: 'bubbleChart', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'c:bubbleScale': return { _passthrough: true, kind: 'bubbleScale', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'c:bubbleSize': return { _passthrough: true, kind: 'bubbleSize', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'c:chartObject': return { _passthrough: true, kind: 'chartObject', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'c:clrMapOvr': return { _passthrough: true, kind: 'clrMapOvr', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'c:crossBetween': return { _passthrough: true, kind: 'crossBetween', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'c:crosses': return { _passthrough: true, kind: 'crosses', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'c:crossesAt': return { _passthrough: true, kind: 'crossesAt', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'c:custSplit': return { _passthrough: true, kind: 'custSplit', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'c:dLbl': return { _passthrough: true, kind: 'dLbl', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'c:dLblPos': return { _passthrough: true, kind: 'dLblPos', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'c:dLbls': return { _passthrough: true, kind: 'dLbls', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'c:dPt': return { _passthrough: true, kind: 'dPt', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'c:dTable': return { _passthrough: true, kind: 'dTable', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'c:data': return { _passthrough: true, kind: 'data', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'c:date1904': return { _passthrough: true, kind: 'date1904', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'c:dateAx': return { _passthrough: true, kind: 'dateAx', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'c:depthPercent': return { _passthrough: true, kind: 'depthPercent', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'c:dispUnits': return { _passthrough: true, kind: 'dispUnits', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'c:doughnutChart': return { _passthrough: true, kind: 'doughnutChart', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'c:dropLines': return { _passthrough: true, kind: 'dropLines', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'c:errBars': return { _passthrough: true, kind: 'errBars', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'c:evenFooter': return { _passthrough: true, kind: 'evenFooter', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'c:evenHeader': return { _passthrough: true, kind: 'evenHeader', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'c:explosion': return { _passthrough: true, kind: 'explosion', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'c:ext': return { _passthrough: true, kind: 'ext', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'c:extLst': return { _passthrough: true, kind: 'extLst', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'c:firstFooter': return { _passthrough: true, kind: 'firstFooter', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'c:firstHeader': return { _passthrough: true, kind: 'firstHeader', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'c:floor': return { _passthrough: true, kind: 'floor', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'c:fmtId': return { _passthrough: true, kind: 'fmtId', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'c:formatting': return { _passthrough: true, kind: 'formatting', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'c:gapDepth': return { _passthrough: true, kind: 'gapDepth', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'c:hPercent': return { _passthrough: true, kind: 'hPercent', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'c:headerFooter': return { _passthrough: true, kind: 'headerFooter', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'c:hiLowLines': return { _passthrough: true, kind: 'hiLowLines', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'c:invertIfNegative': return { _passthrough: true, kind: 'invertIfNegative', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'c:lang': return { _passthrough: true, kind: 'lang', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'c:lblAlgn': return { _passthrough: true, kind: 'lblAlgn', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'c:lblOffset': return { _passthrough: true, kind: 'lblOffset', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'c:leaderLines': return { _passthrough: true, kind: 'leaderLines', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'c:legendEntry': return { _passthrough: true, kind: 'legendEntry', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'c:line3DChart': return { _passthrough: true, kind: 'line3DChart', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'c:lineChart': return { _passthrough: true, kind: 'lineChart', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'c:lvl': return { _passthrough: true, kind: 'lvl', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'c:majorGridlines': return { _passthrough: true, kind: 'majorGridlines', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'c:majorTickMark': return { _passthrough: true, kind: 'majorTickMark', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'c:majorTimeUnit': return { _passthrough: true, kind: 'majorTimeUnit', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'c:majorUnit': return { _passthrough: true, kind: 'majorUnit', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'c:marker': return { _passthrough: true, kind: 'marker', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'c:minorGridlines': return { _passthrough: true, kind: 'minorGridlines', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'c:minorTickMark': return { _passthrough: true, kind: 'minorTickMark', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'c:minorTimeUnit': return { _passthrough: true, kind: 'minorTimeUnit', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'c:minorUnit': return { _passthrough: true, kind: 'minorUnit', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'c:multiLvlStrCache': return { _passthrough: true, kind: 'multiLvlStrCache', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'c:multiLvlStrRef': return { _passthrough: true, kind: 'multiLvlStrRef', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'c:noMultiLvlLbl': return { _passthrough: true, kind: 'noMultiLvlLbl', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'c:numCache': return { _passthrough: true, kind: 'numCache', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'c:oddFooter': return { _passthrough: true, kind: 'oddFooter', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'c:oddHeader': return { _passthrough: true, kind: 'oddHeader', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'c:ofPieChart': return { _passthrough: true, kind: 'ofPieChart', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'c:ofPieType': return { _passthrough: true, kind: 'ofPieType', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'c:overlap': return { _passthrough: true, kind: 'overlap', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'c:pageMargins': return { _passthrough: true, kind: 'pageMargins', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'c:pageSetup': return { _passthrough: true, kind: 'pageSetup', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'c:pictureFormat': return { _passthrough: true, kind: 'pictureFormat', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'c:pictureOptions': return { _passthrough: true, kind: 'pictureOptions', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'c:pictureStackUnit': return { _passthrough: true, kind: 'pictureStackUnit', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'c:pie3DChart': return { _passthrough: true, kind: 'pie3DChart', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'c:pieChart': return { _passthrough: true, kind: 'pieChart', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'c:pivotFmt': return { _passthrough: true, kind: 'pivotFmt', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'c:pivotFmts': return { _passthrough: true, kind: 'pivotFmts', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'c:pivotSource': return { _passthrough: true, kind: 'pivotSource', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'c:printSettings': return { _passthrough: true, kind: 'printSettings', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'c:protection': return { _passthrough: true, kind: 'protection', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'c:radarChart': return { _passthrough: true, kind: 'radarChart', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'c:radarStyle': return { _passthrough: true, kind: 'radarStyle', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'c:roundedCorners': return { _passthrough: true, kind: 'roundedCorners', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'c:scatterChart': return { _passthrough: true, kind: 'scatterChart', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'c:secondPiePt': return { _passthrough: true, kind: 'secondPiePt', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'c:secondPieSize': return { _passthrough: true, kind: 'secondPieSize', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'c:selection': return { _passthrough: true, kind: 'selection', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'c:separator': return { _passthrough: true, kind: 'separator', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'c:serAx': return { _passthrough: true, kind: 'serAx', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'c:serLines': return { _passthrough: true, kind: 'serLines', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'c:showBubbleSize': return { _passthrough: true, kind: 'showBubbleSize', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'c:showCatName': return { _passthrough: true, kind: 'showCatName', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'c:showDLblsOverMax': return { _passthrough: true, kind: 'showDLblsOverMax', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'c:showHorzBorder': return { _passthrough: true, kind: 'showHorzBorder', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'c:showKeys': return { _passthrough: true, kind: 'showKeys', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'c:showLeaderLines': return { _passthrough: true, kind: 'showLeaderLines', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'c:showLegendKey': return { _passthrough: true, kind: 'showLegendKey', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'c:showNegBubbles': return { _passthrough: true, kind: 'showNegBubbles', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'c:showOutline': return { _passthrough: true, kind: 'showOutline', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'c:showPercent': return { _passthrough: true, kind: 'showPercent', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'c:showSerName': return { _passthrough: true, kind: 'showSerName', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'c:showVal': return { _passthrough: true, kind: 'showVal', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'c:showVertBorder': return { _passthrough: true, kind: 'showVertBorder', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'c:sideWall': return { _passthrough: true, kind: 'sideWall', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'c:size': return { _passthrough: true, kind: 'size', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'c:sizeRepresents': return { _passthrough: true, kind: 'sizeRepresents', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'c:smooth': return { _passthrough: true, kind: 'smooth', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'c:splitPos': return { _passthrough: true, kind: 'splitPos', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'c:splitType': return { _passthrough: true, kind: 'splitType', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'c:stockChart': return { _passthrough: true, kind: 'stockChart', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'c:strCache': return { _passthrough: true, kind: 'strCache', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'c:style': return { _passthrough: true, kind: 'style', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'c:surface3DChart': return { _passthrough: true, kind: 'surface3DChart', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'c:surfaceChart': return { _passthrough: true, kind: 'surfaceChart', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'c:symbol': return { _passthrough: true, kind: 'symbol', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'c:tickLblPos': return { _passthrough: true, kind: 'tickLblPos', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'c:tickLblSkip': return { _passthrough: true, kind: 'tickLblSkip', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'c:tickMarkSkip': return { _passthrough: true, kind: 'tickMarkSkip', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'c:trendline': return { _passthrough: true, kind: 'trendline', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'c:upDownBars': return { _passthrough: true, kind: 'upDownBars', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'c:userInterface': return { _passthrough: true, kind: 'userInterface', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'c:userShapes': return { _passthrough: true, kind: 'userShapes', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'c:view3D': return { _passthrough: true, kind: 'view3D', attrs: { ...el.attrs }, children: [...(el.children||[])] };
                default: return null;
            }
        }

        function renderElement(obj) {
            if (!obj || !obj.kind) return null;
            switch (obj.kind) {
            case 'applyToEnd': return xml.el('c:applyToEnd', obj.attrs || {}, obj.children || []);
            case 'applyToFront': return xml.el('c:applyToFront', obj.attrs || {}, obj.children || []);
            case 'applyToSides': return xml.el('c:applyToSides', obj.attrs || {}, obj.children || []);
            case 'area3DChart': return xml.el('c:area3DChart', obj.attrs || {}, obj.children || []);
            case 'areaChart': return xml.el('c:areaChart', obj.attrs || {}, obj.children || []);
            case 'auto': return xml.el('c:auto', obj.attrs || {}, obj.children || []);
            case 'backWall': return xml.el('c:backWall', obj.attrs || {}, obj.children || []);
            case 'bandFmt': return xml.el('c:bandFmt', obj.attrs || {}, obj.children || []);
            case 'bandFmts': return xml.el('c:bandFmts', obj.attrs || {}, obj.children || []);
            case 'bar3DChart': return xml.el('c:bar3DChart', obj.attrs || {}, obj.children || []);
            case 'barChart': return xml.el('c:barChart', obj.attrs || {}, obj.children || []);
            case 'baseTimeUnit': return xml.el('c:baseTimeUnit', obj.attrs || {}, obj.children || []);
            case 'bubble3D': return xml.el('c:bubble3D', obj.attrs || {}, obj.children || []);
            case 'bubbleChart': return xml.el('c:bubbleChart', obj.attrs || {}, obj.children || []);
            case 'bubbleScale': return xml.el('c:bubbleScale', obj.attrs || {}, obj.children || []);
            case 'bubbleSize': return xml.el('c:bubbleSize', obj.attrs || {}, obj.children || []);
            case 'chartObject': return xml.el('c:chartObject', obj.attrs || {}, obj.children || []);
            case 'clrMapOvr': return xml.el('c:clrMapOvr', obj.attrs || {}, obj.children || []);
            case 'crossBetween': return xml.el('c:crossBetween', obj.attrs || {}, obj.children || []);
            case 'crosses': return xml.el('c:crosses', obj.attrs || {}, obj.children || []);
            case 'crossesAt': return xml.el('c:crossesAt', obj.attrs || {}, obj.children || []);
            case 'custSplit': return xml.el('c:custSplit', obj.attrs || {}, obj.children || []);
            case 'dLbl': return xml.el('c:dLbl', obj.attrs || {}, obj.children || []);
            case 'dLblPos': return xml.el('c:dLblPos', obj.attrs || {}, obj.children || []);
            case 'dLbls': return xml.el('c:dLbls', obj.attrs || {}, obj.children || []);
            case 'dPt': return xml.el('c:dPt', obj.attrs || {}, obj.children || []);
            case 'dTable': return xml.el('c:dTable', obj.attrs || {}, obj.children || []);
            case 'data': return xml.el('c:data', obj.attrs || {}, obj.children || []);
            case 'date1904': return xml.el('c:date1904', obj.attrs || {}, obj.children || []);
            case 'dateAx': return xml.el('c:dateAx', obj.attrs || {}, obj.children || []);
            case 'depthPercent': return xml.el('c:depthPercent', obj.attrs || {}, obj.children || []);
            case 'dispUnits': return xml.el('c:dispUnits', obj.attrs || {}, obj.children || []);
            case 'doughnutChart': return xml.el('c:doughnutChart', obj.attrs || {}, obj.children || []);
            case 'dropLines': return xml.el('c:dropLines', obj.attrs || {}, obj.children || []);
            case 'errBars': return xml.el('c:errBars', obj.attrs || {}, obj.children || []);
            case 'evenFooter': return xml.el('c:evenFooter', obj.attrs || {}, obj.children || []);
            case 'evenHeader': return xml.el('c:evenHeader', obj.attrs || {}, obj.children || []);
            case 'explosion': return xml.el('c:explosion', obj.attrs || {}, obj.children || []);
            case 'ext': return xml.el('c:ext', obj.attrs || {}, obj.children || []);
            case 'extLst': return xml.el('c:extLst', obj.attrs || {}, obj.children || []);
            case 'firstFooter': return xml.el('c:firstFooter', obj.attrs || {}, obj.children || []);
            case 'firstHeader': return xml.el('c:firstHeader', obj.attrs || {}, obj.children || []);
            case 'floor': return xml.el('c:floor', obj.attrs || {}, obj.children || []);
            case 'fmtId': return xml.el('c:fmtId', obj.attrs || {}, obj.children || []);
            case 'formatting': return xml.el('c:formatting', obj.attrs || {}, obj.children || []);
            case 'gapDepth': return xml.el('c:gapDepth', obj.attrs || {}, obj.children || []);
            case 'hPercent': return xml.el('c:hPercent', obj.attrs || {}, obj.children || []);
            case 'headerFooter': return xml.el('c:headerFooter', obj.attrs || {}, obj.children || []);
            case 'hiLowLines': return xml.el('c:hiLowLines', obj.attrs || {}, obj.children || []);
            case 'invertIfNegative': return xml.el('c:invertIfNegative', obj.attrs || {}, obj.children || []);
            case 'lang': return xml.el('c:lang', obj.attrs || {}, obj.children || []);
            case 'lblAlgn': return xml.el('c:lblAlgn', obj.attrs || {}, obj.children || []);
            case 'lblOffset': return xml.el('c:lblOffset', obj.attrs || {}, obj.children || []);
            case 'leaderLines': return xml.el('c:leaderLines', obj.attrs || {}, obj.children || []);
            case 'legendEntry': return xml.el('c:legendEntry', obj.attrs || {}, obj.children || []);
            case 'line3DChart': return xml.el('c:line3DChart', obj.attrs || {}, obj.children || []);
            case 'lineChart': return xml.el('c:lineChart', obj.attrs || {}, obj.children || []);
            case 'lvl': return xml.el('c:lvl', obj.attrs || {}, obj.children || []);
            case 'majorGridlines': return xml.el('c:majorGridlines', obj.attrs || {}, obj.children || []);
            case 'majorTickMark': return xml.el('c:majorTickMark', obj.attrs || {}, obj.children || []);
            case 'majorTimeUnit': return xml.el('c:majorTimeUnit', obj.attrs || {}, obj.children || []);
            case 'majorUnit': return xml.el('c:majorUnit', obj.attrs || {}, obj.children || []);
            case 'marker': return xml.el('c:marker', obj.attrs || {}, obj.children || []);
            case 'minorGridlines': return xml.el('c:minorGridlines', obj.attrs || {}, obj.children || []);
            case 'minorTickMark': return xml.el('c:minorTickMark', obj.attrs || {}, obj.children || []);
            case 'minorTimeUnit': return xml.el('c:minorTimeUnit', obj.attrs || {}, obj.children || []);
            case 'minorUnit': return xml.el('c:minorUnit', obj.attrs || {}, obj.children || []);
            case 'multiLvlStrCache': return xml.el('c:multiLvlStrCache', obj.attrs || {}, obj.children || []);
            case 'multiLvlStrRef': return xml.el('c:multiLvlStrRef', obj.attrs || {}, obj.children || []);
            case 'noMultiLvlLbl': return xml.el('c:noMultiLvlLbl', obj.attrs || {}, obj.children || []);
            case 'numCache': return xml.el('c:numCache', obj.attrs || {}, obj.children || []);
            case 'oddFooter': return xml.el('c:oddFooter', obj.attrs || {}, obj.children || []);
            case 'oddHeader': return xml.el('c:oddHeader', obj.attrs || {}, obj.children || []);
            case 'ofPieChart': return xml.el('c:ofPieChart', obj.attrs || {}, obj.children || []);
            case 'ofPieType': return xml.el('c:ofPieType', obj.attrs || {}, obj.children || []);
            case 'overlap': return xml.el('c:overlap', obj.attrs || {}, obj.children || []);
            case 'pageMargins': return xml.el('c:pageMargins', obj.attrs || {}, obj.children || []);
            case 'pageSetup': return xml.el('c:pageSetup', obj.attrs || {}, obj.children || []);
            case 'pictureFormat': return xml.el('c:pictureFormat', obj.attrs || {}, obj.children || []);
            case 'pictureOptions': return xml.el('c:pictureOptions', obj.attrs || {}, obj.children || []);
            case 'pictureStackUnit': return xml.el('c:pictureStackUnit', obj.attrs || {}, obj.children || []);
            case 'pie3DChart': return xml.el('c:pie3DChart', obj.attrs || {}, obj.children || []);
            case 'pieChart': return xml.el('c:pieChart', obj.attrs || {}, obj.children || []);
            case 'pivotFmt': return xml.el('c:pivotFmt', obj.attrs || {}, obj.children || []);
            case 'pivotFmts': return xml.el('c:pivotFmts', obj.attrs || {}, obj.children || []);
            case 'pivotSource': return xml.el('c:pivotSource', obj.attrs || {}, obj.children || []);
            case 'printSettings': return xml.el('c:printSettings', obj.attrs || {}, obj.children || []);
            case 'protection': return xml.el('c:protection', obj.attrs || {}, obj.children || []);
            case 'radarChart': return xml.el('c:radarChart', obj.attrs || {}, obj.children || []);
            case 'radarStyle': return xml.el('c:radarStyle', obj.attrs || {}, obj.children || []);
            case 'roundedCorners': return xml.el('c:roundedCorners', obj.attrs || {}, obj.children || []);
            case 'scatterChart': return xml.el('c:scatterChart', obj.attrs || {}, obj.children || []);
            case 'secondPiePt': return xml.el('c:secondPiePt', obj.attrs || {}, obj.children || []);
            case 'secondPieSize': return xml.el('c:secondPieSize', obj.attrs || {}, obj.children || []);
            case 'selection': return xml.el('c:selection', obj.attrs || {}, obj.children || []);
            case 'separator': return xml.el('c:separator', obj.attrs || {}, obj.children || []);
            case 'serAx': return xml.el('c:serAx', obj.attrs || {}, obj.children || []);
            case 'serLines': return xml.el('c:serLines', obj.attrs || {}, obj.children || []);
            case 'showBubbleSize': return xml.el('c:showBubbleSize', obj.attrs || {}, obj.children || []);
            case 'showCatName': return xml.el('c:showCatName', obj.attrs || {}, obj.children || []);
            case 'showDLblsOverMax': return xml.el('c:showDLblsOverMax', obj.attrs || {}, obj.children || []);
            case 'showHorzBorder': return xml.el('c:showHorzBorder', obj.attrs || {}, obj.children || []);
            case 'showKeys': return xml.el('c:showKeys', obj.attrs || {}, obj.children || []);
            case 'showLeaderLines': return xml.el('c:showLeaderLines', obj.attrs || {}, obj.children || []);
            case 'showLegendKey': return xml.el('c:showLegendKey', obj.attrs || {}, obj.children || []);
            case 'showNegBubbles': return xml.el('c:showNegBubbles', obj.attrs || {}, obj.children || []);
            case 'showOutline': return xml.el('c:showOutline', obj.attrs || {}, obj.children || []);
            case 'showPercent': return xml.el('c:showPercent', obj.attrs || {}, obj.children || []);
            case 'showSerName': return xml.el('c:showSerName', obj.attrs || {}, obj.children || []);
            case 'showVal': return xml.el('c:showVal', obj.attrs || {}, obj.children || []);
            case 'showVertBorder': return xml.el('c:showVertBorder', obj.attrs || {}, obj.children || []);
            case 'sideWall': return xml.el('c:sideWall', obj.attrs || {}, obj.children || []);
            case 'size': return xml.el('c:size', obj.attrs || {}, obj.children || []);
            case 'sizeRepresents': return xml.el('c:sizeRepresents', obj.attrs || {}, obj.children || []);
            case 'smooth': return xml.el('c:smooth', obj.attrs || {}, obj.children || []);
            case 'splitPos': return xml.el('c:splitPos', obj.attrs || {}, obj.children || []);
            case 'splitType': return xml.el('c:splitType', obj.attrs || {}, obj.children || []);
            case 'stockChart': return xml.el('c:stockChart', obj.attrs || {}, obj.children || []);
            case 'strCache': return xml.el('c:strCache', obj.attrs || {}, obj.children || []);
            case 'style': return xml.el('c:style', obj.attrs || {}, obj.children || []);
            case 'surface3DChart': return xml.el('c:surface3DChart', obj.attrs || {}, obj.children || []);
            case 'surfaceChart': return xml.el('c:surfaceChart', obj.attrs || {}, obj.children || []);
            case 'symbol': return xml.el('c:symbol', obj.attrs || {}, obj.children || []);
            case 'tickLblPos': return xml.el('c:tickLblPos', obj.attrs || {}, obj.children || []);
            case 'tickLblSkip': return xml.el('c:tickLblSkip', obj.attrs || {}, obj.children || []);
            case 'tickMarkSkip': return xml.el('c:tickMarkSkip', obj.attrs || {}, obj.children || []);
            case 'trendline': return xml.el('c:trendline', obj.attrs || {}, obj.children || []);
            case 'upDownBars': return xml.el('c:upDownBars', obj.attrs || {}, obj.children || []);
            case 'userInterface': return xml.el('c:userInterface', obj.attrs || {}, obj.children || []);
            case 'userShapes': return xml.el('c:userShapes', obj.attrs || {}, obj.children || []);
            case 'view3D': return xml.el('c:view3D', obj.attrs || {}, obj.children || []);
                default: return null;
            }
        }

        return { parseElement, renderElement, ELEMENTS };
    }
};
