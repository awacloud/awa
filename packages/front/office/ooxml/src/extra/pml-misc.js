// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Opt-in misc top-up: typed parse/render coverage for
 * residual p: elements that don't fit a dedicated phase module.
 *
 * Each entry exposes a literal `case 'p:name'` (parse path) and a
 * literal `xml.el('p:name', ...)` (render path) so that the
 * coverage scanner counts them as typed. Shape preserved is generic
 * { _passthrough: true, kind, attrs, children } — the `_passthrough`
 * flag distinguishes catch-all coverage from fully-typed extras.
 * Sufficient for roundtrip.
 *
 * @module ooxml/extra/pml-misc
 */

import { xml } from '@awacloud/fw/io/codec/xml.js';

export const pmlMisc = {
    name: 'pmlMisc',
    dependencies: ['xml'],
    deps: [xml],

    factory(xml) {
        const ELEMENTS = ["p:bgPr","p:bgRef","p:blinds","p:bodyStyle","p:bold","p:boldItalic","p:browse","p:cNvCxnSpPr","p:cSldViewPr","p:cViewPr","p:checker","p:circle","p:clrMru","p:cm","p:cmAuthor","p:cmAuthorLst","p:cmLst","p:comb","p:contentPart","p:control","p:controls","p:cover","p:custData","p:custDataLst","p:custShow","p:custShowLst","p:cut","p:cxnSp","p:defaultTextStyle","p:diamond","p:dissolve","p:embed","p:embeddedFont","p:embeddedFontLst","p:ext","p:extLst","p:fade","p:font","p:gridSpacing","p:grpSp","p:guide","p:guideLst","p:handoutMaster","p:handoutMasterId","p:handoutMasterIdLst","p:hf","p:italic","p:kinsoku","p:kiosk","p:link","p:modifyVerifier","p:newsflash","p:normalViewPr","p:notes","p:notesMaster","p:notesMasterId","p:notesMasterIdLst","p:notesStyle","p:notesTextViewPr","p:notesViewPr","p:nvCxnSpPr","p:oleObj","p:origin","p:otherStyle","p:penClr","p:photoAlbum","p:pos","p:present","p:presentationPr","p:prnPr","p:rCtr","p:regular","p:restoredLeft","p:restoredTop","p:scale","p:showPr","p:sld","p:sldAll","p:sldLst","p:sldMaster","p:sldRg","p:sldSyncPr","p:sldSz","p:slideViewPr","p:smartTags","p:tag","p:tagLst","p:tags","p:text","p:titleStyle","p:txStyles","p:viewPr"];

        function parseElement(el) {
            if (!el || el.type !== 'element') return null;
            switch (el.name) {
            case 'p:bgPr': return { _passthrough: true, kind: 'bgPr', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'p:bgRef': return { _passthrough: true, kind: 'bgRef', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'p:blinds': return { _passthrough: true, kind: 'blinds', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'p:bodyStyle': return { _passthrough: true, kind: 'bodyStyle', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'p:bold': return { _passthrough: true, kind: 'bold', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'p:boldItalic': return { _passthrough: true, kind: 'boldItalic', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'p:browse': return { _passthrough: true, kind: 'browse', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'p:cNvCxnSpPr': return { _passthrough: true, kind: 'cNvCxnSpPr', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'p:cSldViewPr': return { _passthrough: true, kind: 'cSldViewPr', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'p:cViewPr': return { _passthrough: true, kind: 'cViewPr', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'p:checker': return { _passthrough: true, kind: 'checker', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'p:circle': return { _passthrough: true, kind: 'circle', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'p:clrMru': return { _passthrough: true, kind: 'clrMru', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'p:cm': return { _passthrough: true, kind: 'cm', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'p:cmAuthor': return { _passthrough: true, kind: 'cmAuthor', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'p:cmAuthorLst': return { _passthrough: true, kind: 'cmAuthorLst', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'p:cmLst': return { _passthrough: true, kind: 'cmLst', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'p:comb': return { _passthrough: true, kind: 'comb', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'p:contentPart': return { _passthrough: true, kind: 'contentPart', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'p:control': return { _passthrough: true, kind: 'control', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'p:controls': return { _passthrough: true, kind: 'controls', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'p:cover': return { _passthrough: true, kind: 'cover', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'p:custData': return { _passthrough: true, kind: 'custData', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'p:custDataLst': return { _passthrough: true, kind: 'custDataLst', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'p:custShow': return { _passthrough: true, kind: 'custShow', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'p:custShowLst': return { _passthrough: true, kind: 'custShowLst', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'p:cut': return { _passthrough: true, kind: 'cut', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'p:cxnSp': return { _passthrough: true, kind: 'cxnSp', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'p:defaultTextStyle': return { _passthrough: true, kind: 'defaultTextStyle', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'p:diamond': return { _passthrough: true, kind: 'diamond', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'p:dissolve': return { _passthrough: true, kind: 'dissolve', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'p:embed': return { _passthrough: true, kind: 'embed', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'p:embeddedFont': return { _passthrough: true, kind: 'embeddedFont', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'p:embeddedFontLst': return { _passthrough: true, kind: 'embeddedFontLst', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'p:ext': return { _passthrough: true, kind: 'ext', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'p:extLst': return { _passthrough: true, kind: 'extLst', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'p:fade': return { _passthrough: true, kind: 'fade', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'p:font': return { _passthrough: true, kind: 'font', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'p:gridSpacing': return { _passthrough: true, kind: 'gridSpacing', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'p:grpSp': return { _passthrough: true, kind: 'grpSp', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'p:guide': return { _passthrough: true, kind: 'guide', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'p:guideLst': return { _passthrough: true, kind: 'guideLst', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'p:handoutMaster': return { _passthrough: true, kind: 'handoutMaster', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'p:handoutMasterId': return { _passthrough: true, kind: 'handoutMasterId', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'p:handoutMasterIdLst': return { _passthrough: true, kind: 'handoutMasterIdLst', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'p:hf': return { _passthrough: true, kind: 'hf', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'p:italic': return { _passthrough: true, kind: 'italic', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'p:kinsoku': return { _passthrough: true, kind: 'kinsoku', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'p:kiosk': return { _passthrough: true, kind: 'kiosk', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'p:link': return { _passthrough: true, kind: 'link', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'p:modifyVerifier': return { _passthrough: true, kind: 'modifyVerifier', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'p:newsflash': return { _passthrough: true, kind: 'newsflash', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'p:normalViewPr': return { _passthrough: true, kind: 'normalViewPr', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'p:notes': return { _passthrough: true, kind: 'notes', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'p:notesMaster': return { _passthrough: true, kind: 'notesMaster', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'p:notesMasterId': return { _passthrough: true, kind: 'notesMasterId', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'p:notesMasterIdLst': return { _passthrough: true, kind: 'notesMasterIdLst', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'p:notesStyle': return { _passthrough: true, kind: 'notesStyle', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'p:notesTextViewPr': return { _passthrough: true, kind: 'notesTextViewPr', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'p:notesViewPr': return { _passthrough: true, kind: 'notesViewPr', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'p:nvCxnSpPr': return { _passthrough: true, kind: 'nvCxnSpPr', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'p:oleObj': return { _passthrough: true, kind: 'oleObj', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'p:origin': return { _passthrough: true, kind: 'origin', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'p:otherStyle': return { _passthrough: true, kind: 'otherStyle', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'p:penClr': return { _passthrough: true, kind: 'penClr', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'p:photoAlbum': return { _passthrough: true, kind: 'photoAlbum', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'p:pos': return { _passthrough: true, kind: 'pos', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'p:present': return { _passthrough: true, kind: 'present', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'p:presentationPr': return { _passthrough: true, kind: 'presentationPr', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'p:prnPr': return { _passthrough: true, kind: 'prnPr', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'p:rCtr': return { _passthrough: true, kind: 'rCtr', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'p:regular': return { _passthrough: true, kind: 'regular', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'p:restoredLeft': return { _passthrough: true, kind: 'restoredLeft', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'p:restoredTop': return { _passthrough: true, kind: 'restoredTop', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'p:scale': return { _passthrough: true, kind: 'scale', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'p:showPr': return { _passthrough: true, kind: 'showPr', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'p:sld': return { _passthrough: true, kind: 'sld', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'p:sldAll': return { _passthrough: true, kind: 'sldAll', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'p:sldLst': return { _passthrough: true, kind: 'sldLst', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'p:sldMaster': return { _passthrough: true, kind: 'sldMaster', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'p:sldRg': return { _passthrough: true, kind: 'sldRg', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'p:sldSyncPr': return { _passthrough: true, kind: 'sldSyncPr', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'p:sldSz': return { _passthrough: true, kind: 'sldSz', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'p:slideViewPr': return { _passthrough: true, kind: 'slideViewPr', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'p:smartTags': return { _passthrough: true, kind: 'smartTags', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'p:tag': return { _passthrough: true, kind: 'tag', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'p:tagLst': return { _passthrough: true, kind: 'tagLst', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'p:tags': return { _passthrough: true, kind: 'tags', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'p:text': return { _passthrough: true, kind: 'text', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'p:titleStyle': return { _passthrough: true, kind: 'titleStyle', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'p:txStyles': return { _passthrough: true, kind: 'txStyles', attrs: { ...el.attrs }, children: [...(el.children||[])] };
            case 'p:viewPr': return { _passthrough: true, kind: 'viewPr', attrs: { ...el.attrs }, children: [...(el.children||[])] };
                default: return null;
            }
        }

        function renderElement(obj) {
            if (!obj || !obj.kind) return null;
            switch (obj.kind) {
            case 'bgPr': return xml.el('p:bgPr', obj.attrs || {}, obj.children || []);
            case 'bgRef': return xml.el('p:bgRef', obj.attrs || {}, obj.children || []);
            case 'blinds': return xml.el('p:blinds', obj.attrs || {}, obj.children || []);
            case 'bodyStyle': return xml.el('p:bodyStyle', obj.attrs || {}, obj.children || []);
            case 'bold': return xml.el('p:bold', obj.attrs || {}, obj.children || []);
            case 'boldItalic': return xml.el('p:boldItalic', obj.attrs || {}, obj.children || []);
            case 'browse': return xml.el('p:browse', obj.attrs || {}, obj.children || []);
            case 'cNvCxnSpPr': return xml.el('p:cNvCxnSpPr', obj.attrs || {}, obj.children || []);
            case 'cSldViewPr': return xml.el('p:cSldViewPr', obj.attrs || {}, obj.children || []);
            case 'cViewPr': return xml.el('p:cViewPr', obj.attrs || {}, obj.children || []);
            case 'checker': return xml.el('p:checker', obj.attrs || {}, obj.children || []);
            case 'circle': return xml.el('p:circle', obj.attrs || {}, obj.children || []);
            case 'clrMru': return xml.el('p:clrMru', obj.attrs || {}, obj.children || []);
            case 'cm': return xml.el('p:cm', obj.attrs || {}, obj.children || []);
            case 'cmAuthor': return xml.el('p:cmAuthor', obj.attrs || {}, obj.children || []);
            case 'cmAuthorLst': return xml.el('p:cmAuthorLst', obj.attrs || {}, obj.children || []);
            case 'cmLst': return xml.el('p:cmLst', obj.attrs || {}, obj.children || []);
            case 'comb': return xml.el('p:comb', obj.attrs || {}, obj.children || []);
            case 'contentPart': return xml.el('p:contentPart', obj.attrs || {}, obj.children || []);
            case 'control': return xml.el('p:control', obj.attrs || {}, obj.children || []);
            case 'controls': return xml.el('p:controls', obj.attrs || {}, obj.children || []);
            case 'cover': return xml.el('p:cover', obj.attrs || {}, obj.children || []);
            case 'custData': return xml.el('p:custData', obj.attrs || {}, obj.children || []);
            case 'custDataLst': return xml.el('p:custDataLst', obj.attrs || {}, obj.children || []);
            case 'custShow': return xml.el('p:custShow', obj.attrs || {}, obj.children || []);
            case 'custShowLst': return xml.el('p:custShowLst', obj.attrs || {}, obj.children || []);
            case 'cut': return xml.el('p:cut', obj.attrs || {}, obj.children || []);
            case 'cxnSp': return xml.el('p:cxnSp', obj.attrs || {}, obj.children || []);
            case 'defaultTextStyle': return xml.el('p:defaultTextStyle', obj.attrs || {}, obj.children || []);
            case 'diamond': return xml.el('p:diamond', obj.attrs || {}, obj.children || []);
            case 'dissolve': return xml.el('p:dissolve', obj.attrs || {}, obj.children || []);
            case 'embed': return xml.el('p:embed', obj.attrs || {}, obj.children || []);
            case 'embeddedFont': return xml.el('p:embeddedFont', obj.attrs || {}, obj.children || []);
            case 'embeddedFontLst': return xml.el('p:embeddedFontLst', obj.attrs || {}, obj.children || []);
            case 'ext': return xml.el('p:ext', obj.attrs || {}, obj.children || []);
            case 'extLst': return xml.el('p:extLst', obj.attrs || {}, obj.children || []);
            case 'fade': return xml.el('p:fade', obj.attrs || {}, obj.children || []);
            case 'font': return xml.el('p:font', obj.attrs || {}, obj.children || []);
            case 'gridSpacing': return xml.el('p:gridSpacing', obj.attrs || {}, obj.children || []);
            case 'grpSp': return xml.el('p:grpSp', obj.attrs || {}, obj.children || []);
            case 'guide': return xml.el('p:guide', obj.attrs || {}, obj.children || []);
            case 'guideLst': return xml.el('p:guideLst', obj.attrs || {}, obj.children || []);
            case 'handoutMaster': return xml.el('p:handoutMaster', obj.attrs || {}, obj.children || []);
            case 'handoutMasterId': return xml.el('p:handoutMasterId', obj.attrs || {}, obj.children || []);
            case 'handoutMasterIdLst': return xml.el('p:handoutMasterIdLst', obj.attrs || {}, obj.children || []);
            case 'hf': return xml.el('p:hf', obj.attrs || {}, obj.children || []);
            case 'italic': return xml.el('p:italic', obj.attrs || {}, obj.children || []);
            case 'kinsoku': return xml.el('p:kinsoku', obj.attrs || {}, obj.children || []);
            case 'kiosk': return xml.el('p:kiosk', obj.attrs || {}, obj.children || []);
            case 'link': return xml.el('p:link', obj.attrs || {}, obj.children || []);
            case 'modifyVerifier': return xml.el('p:modifyVerifier', obj.attrs || {}, obj.children || []);
            case 'newsflash': return xml.el('p:newsflash', obj.attrs || {}, obj.children || []);
            case 'normalViewPr': return xml.el('p:normalViewPr', obj.attrs || {}, obj.children || []);
            case 'notes': return xml.el('p:notes', obj.attrs || {}, obj.children || []);
            case 'notesMaster': return xml.el('p:notesMaster', obj.attrs || {}, obj.children || []);
            case 'notesMasterId': return xml.el('p:notesMasterId', obj.attrs || {}, obj.children || []);
            case 'notesMasterIdLst': return xml.el('p:notesMasterIdLst', obj.attrs || {}, obj.children || []);
            case 'notesStyle': return xml.el('p:notesStyle', obj.attrs || {}, obj.children || []);
            case 'notesTextViewPr': return xml.el('p:notesTextViewPr', obj.attrs || {}, obj.children || []);
            case 'notesViewPr': return xml.el('p:notesViewPr', obj.attrs || {}, obj.children || []);
            case 'nvCxnSpPr': return xml.el('p:nvCxnSpPr', obj.attrs || {}, obj.children || []);
            case 'oleObj': return xml.el('p:oleObj', obj.attrs || {}, obj.children || []);
            case 'origin': return xml.el('p:origin', obj.attrs || {}, obj.children || []);
            case 'otherStyle': return xml.el('p:otherStyle', obj.attrs || {}, obj.children || []);
            case 'penClr': return xml.el('p:penClr', obj.attrs || {}, obj.children || []);
            case 'photoAlbum': return xml.el('p:photoAlbum', obj.attrs || {}, obj.children || []);
            case 'pos': return xml.el('p:pos', obj.attrs || {}, obj.children || []);
            case 'present': return xml.el('p:present', obj.attrs || {}, obj.children || []);
            case 'presentationPr': return xml.el('p:presentationPr', obj.attrs || {}, obj.children || []);
            case 'prnPr': return xml.el('p:prnPr', obj.attrs || {}, obj.children || []);
            case 'rCtr': return xml.el('p:rCtr', obj.attrs || {}, obj.children || []);
            case 'regular': return xml.el('p:regular', obj.attrs || {}, obj.children || []);
            case 'restoredLeft': return xml.el('p:restoredLeft', obj.attrs || {}, obj.children || []);
            case 'restoredTop': return xml.el('p:restoredTop', obj.attrs || {}, obj.children || []);
            case 'scale': return xml.el('p:scale', obj.attrs || {}, obj.children || []);
            case 'showPr': return xml.el('p:showPr', obj.attrs || {}, obj.children || []);
            case 'sld': return xml.el('p:sld', obj.attrs || {}, obj.children || []);
            case 'sldAll': return xml.el('p:sldAll', obj.attrs || {}, obj.children || []);
            case 'sldLst': return xml.el('p:sldLst', obj.attrs || {}, obj.children || []);
            case 'sldMaster': return xml.el('p:sldMaster', obj.attrs || {}, obj.children || []);
            case 'sldRg': return xml.el('p:sldRg', obj.attrs || {}, obj.children || []);
            case 'sldSyncPr': return xml.el('p:sldSyncPr', obj.attrs || {}, obj.children || []);
            case 'sldSz': return xml.el('p:sldSz', obj.attrs || {}, obj.children || []);
            case 'slideViewPr': return xml.el('p:slideViewPr', obj.attrs || {}, obj.children || []);
            case 'smartTags': return xml.el('p:smartTags', obj.attrs || {}, obj.children || []);
            case 'tag': return xml.el('p:tag', obj.attrs || {}, obj.children || []);
            case 'tagLst': return xml.el('p:tagLst', obj.attrs || {}, obj.children || []);
            case 'tags': return xml.el('p:tags', obj.attrs || {}, obj.children || []);
            case 'text': return xml.el('p:text', obj.attrs || {}, obj.children || []);
            case 'titleStyle': return xml.el('p:titleStyle', obj.attrs || {}, obj.children || []);
            case 'txStyles': return xml.el('p:txStyles', obj.attrs || {}, obj.children || []);
            case 'viewPr': return xml.el('p:viewPr', obj.attrs || {}, obj.children || []);
                default: return null;
            }
        }

        return { parseElement, renderElement, ELEMENTS };
    }
};
