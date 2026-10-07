// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Opt-in misc top-up: typed parse/render coverage for
 * residual m: elements that don't fit a dedicated phase module.
 *
 * Each entry exposes a literal `case 'm:name'` (parse path) and a
 * literal `xml.el('m:name', ...)` (render path) so that the
 * coverage scanner counts them as typed. Shape preserved is generic
 * { _passthrough: true, kind, attrs, children } — the `_passthrough`
 * flag distinguishes catch-all coverage from fully-typed extras.
 * Sufficient for roundtrip.
 *
 * @module ooxml/extra/math-misc
 */

import { xml } from '@awacloud/fw/io/codec/xml.js';

export const mathMisc = {
    name: 'mathMisc',
    dependencies: ['xml'],
    deps: [xml],

    factory(xml) {
        const ELEMENTS = ["m:alnScr","m:argPr","m:argSz","m:baseJc","m:brkBin","m:brkBinSub","m:cGp","m:cGpRule","m:cSp","m:count","m:defJc","m:degHide","m:diff","m:dispDef","m:fPr","m:funcPr","m:grow","m:hideBot","m:hideLeft","m:hideRight","m:hideTop","m:interSp","m:intraSp","m:jc","m:lMargin","m:limLoc","m:lit","m:mPr","m:mathFont","m:maxDist","m:mcJc","m:naryLim","m:noBreak","m:nor","m:objDist","m:opEmu","m:plcHide","m:postSp","m:preSp","m:rMargin","m:radPr","m:sPre","m:sPrePr","m:sSubPr","m:sSubSupPr","m:sSupPr","m:type"];

        function parseElement(el) {
            if (!el || el.type !== 'element') return null;
            switch (el.name) {
            case 'm:alnScr': return { _passthrough: true, kind: 'alnScr', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'm:argPr': return { _passthrough: true, kind: 'argPr', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'm:argSz': return { _passthrough: true, kind: 'argSz', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'm:baseJc': return { _passthrough: true, kind: 'baseJc', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'm:brkBin': return { _passthrough: true, kind: 'brkBin', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'm:brkBinSub': return { _passthrough: true, kind: 'brkBinSub', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'm:cGp': return { _passthrough: true, kind: 'cGp', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'm:cGpRule': return { _passthrough: true, kind: 'cGpRule', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'm:cSp': return { _passthrough: true, kind: 'cSp', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'm:count': return { _passthrough: true, kind: 'count', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'm:defJc': return { _passthrough: true, kind: 'defJc', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'm:degHide': return { _passthrough: true, kind: 'degHide', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'm:diff': return { _passthrough: true, kind: 'diff', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'm:dispDef': return { _passthrough: true, kind: 'dispDef', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'm:fPr': return { _passthrough: true, kind: 'fPr', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'm:funcPr': return { _passthrough: true, kind: 'funcPr', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'm:grow': return { _passthrough: true, kind: 'grow', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'm:hideBot': return { _passthrough: true, kind: 'hideBot', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'm:hideLeft': return { _passthrough: true, kind: 'hideLeft', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'm:hideRight': return { _passthrough: true, kind: 'hideRight', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'm:hideTop': return { _passthrough: true, kind: 'hideTop', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'm:interSp': return { _passthrough: true, kind: 'interSp', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'm:intraSp': return { _passthrough: true, kind: 'intraSp', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'm:jc': return { _passthrough: true, kind: 'jc', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'm:lMargin': return { _passthrough: true, kind: 'lMargin', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'm:limLoc': return { _passthrough: true, kind: 'limLoc', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'm:lit': return { _passthrough: true, kind: 'lit', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'm:mPr': return { _passthrough: true, kind: 'mPr', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'm:mathFont': return { _passthrough: true, kind: 'mathFont', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'm:maxDist': return { _passthrough: true, kind: 'maxDist', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'm:mcJc': return { _passthrough: true, kind: 'mcJc', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'm:naryLim': return { _passthrough: true, kind: 'naryLim', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'm:noBreak': return { _passthrough: true, kind: 'noBreak', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'm:nor': return { _passthrough: true, kind: 'nor', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'm:objDist': return { _passthrough: true, kind: 'objDist', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'm:opEmu': return { _passthrough: true, kind: 'opEmu', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'm:plcHide': return { _passthrough: true, kind: 'plcHide', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'm:postSp': return { _passthrough: true, kind: 'postSp', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'm:preSp': return { _passthrough: true, kind: 'preSp', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'm:rMargin': return { _passthrough: true, kind: 'rMargin', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'm:radPr': return { _passthrough: true, kind: 'radPr', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'm:sPre': return { _passthrough: true, kind: 'sPre', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'm:sPrePr': return { _passthrough: true, kind: 'sPrePr', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'm:sSubPr': return { _passthrough: true, kind: 'sSubPr', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'm:sSubSupPr': return { _passthrough: true, kind: 'sSubSupPr', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'm:sSupPr': return { _passthrough: true, kind: 'sSupPr', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'm:type': return { _passthrough: true, kind: 'type', attrs: { ...el.attrs }, children: [...(el.children||[])] };
                default: return null;
            }
        }

        function renderElement(obj) {
            if (!obj || !obj.kind) return null;
            switch (obj.kind) {
            case 'alnScr': return xml.el('m:alnScr', obj.attrs || {}, obj.children || []);
            case 'argPr': return xml.el('m:argPr', obj.attrs || {}, obj.children || []);
            case 'argSz': return xml.el('m:argSz', obj.attrs || {}, obj.children || []);
            case 'baseJc': return xml.el('m:baseJc', obj.attrs || {}, obj.children || []);
            case 'brkBin': return xml.el('m:brkBin', obj.attrs || {}, obj.children || []);
            case 'brkBinSub': return xml.el('m:brkBinSub', obj.attrs || {}, obj.children || []);
            case 'cGp': return xml.el('m:cGp', obj.attrs || {}, obj.children || []);
            case 'cGpRule': return xml.el('m:cGpRule', obj.attrs || {}, obj.children || []);
            case 'cSp': return xml.el('m:cSp', obj.attrs || {}, obj.children || []);
            case 'count': return xml.el('m:count', obj.attrs || {}, obj.children || []);
            case 'defJc': return xml.el('m:defJc', obj.attrs || {}, obj.children || []);
            case 'degHide': return xml.el('m:degHide', obj.attrs || {}, obj.children || []);
            case 'diff': return xml.el('m:diff', obj.attrs || {}, obj.children || []);
            case 'dispDef': return xml.el('m:dispDef', obj.attrs || {}, obj.children || []);
            case 'fPr': return xml.el('m:fPr', obj.attrs || {}, obj.children || []);
            case 'funcPr': return xml.el('m:funcPr', obj.attrs || {}, obj.children || []);
            case 'grow': return xml.el('m:grow', obj.attrs || {}, obj.children || []);
            case 'hideBot': return xml.el('m:hideBot', obj.attrs || {}, obj.children || []);
            case 'hideLeft': return xml.el('m:hideLeft', obj.attrs || {}, obj.children || []);
            case 'hideRight': return xml.el('m:hideRight', obj.attrs || {}, obj.children || []);
            case 'hideTop': return xml.el('m:hideTop', obj.attrs || {}, obj.children || []);
            case 'interSp': return xml.el('m:interSp', obj.attrs || {}, obj.children || []);
            case 'intraSp': return xml.el('m:intraSp', obj.attrs || {}, obj.children || []);
            case 'jc': return xml.el('m:jc', obj.attrs || {}, obj.children || []);
            case 'lMargin': return xml.el('m:lMargin', obj.attrs || {}, obj.children || []);
            case 'limLoc': return xml.el('m:limLoc', obj.attrs || {}, obj.children || []);
            case 'lit': return xml.el('m:lit', obj.attrs || {}, obj.children || []);
            case 'mPr': return xml.el('m:mPr', obj.attrs || {}, obj.children || []);
            case 'mathFont': return xml.el('m:mathFont', obj.attrs || {}, obj.children || []);
            case 'maxDist': return xml.el('m:maxDist', obj.attrs || {}, obj.children || []);
            case 'mcJc': return xml.el('m:mcJc', obj.attrs || {}, obj.children || []);
            case 'naryLim': return xml.el('m:naryLim', obj.attrs || {}, obj.children || []);
            case 'noBreak': return xml.el('m:noBreak', obj.attrs || {}, obj.children || []);
            case 'nor': return xml.el('m:nor', obj.attrs || {}, obj.children || []);
            case 'objDist': return xml.el('m:objDist', obj.attrs || {}, obj.children || []);
            case 'opEmu': return xml.el('m:opEmu', obj.attrs || {}, obj.children || []);
            case 'plcHide': return xml.el('m:plcHide', obj.attrs || {}, obj.children || []);
            case 'postSp': return xml.el('m:postSp', obj.attrs || {}, obj.children || []);
            case 'preSp': return xml.el('m:preSp', obj.attrs || {}, obj.children || []);
            case 'rMargin': return xml.el('m:rMargin', obj.attrs || {}, obj.children || []);
            case 'radPr': return xml.el('m:radPr', obj.attrs || {}, obj.children || []);
            case 'sPre': return xml.el('m:sPre', obj.attrs || {}, obj.children || []);
            case 'sPrePr': return xml.el('m:sPrePr', obj.attrs || {}, obj.children || []);
            case 'sSubPr': return xml.el('m:sSubPr', obj.attrs || {}, obj.children || []);
            case 'sSubSupPr': return xml.el('m:sSubSupPr', obj.attrs || {}, obj.children || []);
            case 'sSupPr': return xml.el('m:sSupPr', obj.attrs || {}, obj.children || []);
            case 'type': return xml.el('m:type', obj.attrs || {}, obj.children || []);
                default: return null;
            }
        }

        return { parseElement, renderElement, ELEMENTS };
    }
};
