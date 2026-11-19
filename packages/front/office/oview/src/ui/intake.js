// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview File intake: the empty-state dropzone, the hidden picker and
 * an OS file drop anywhere on the viewer.
 *
 * The picker, the OS drop over the whole viewer region and the
 * keyboard-operable dropzone are wired by fw `fileIntake`; this module owns
 * the markup, the labels and the samples line.
 * The picker inside the dropzone is the alternative to dragging (WCAG 2.5.7).
 *
 * @module oview/ui/intake
 */
import { h, icon } from '../render/dom.js';
import { ACCEPT } from '../core/detect.js';

/**
 * @param {{id: string, root: HTMLElement, t: (k: string, p?: object) => string,
 *   onFiles: (files: File[]) => void,
 *   samples?: {label: string}[], onSample?: (index: number) => void,
 *   fileIntake: {create: (o: object) => {pick: () => void, focus: () => void, dispose: () => void}}}} opts
 *   `fileIntake`: the resolved fw `fileIntake` instance (the viewer passes
 *   `rt.resolve('fileIntake')`); `onFiles`: every file chosen or dropped at once, in order (the viewer
 *   opens the first); `samples`: documents to try, offered under the
 *   dropzone (the host loads them: `onSample`).
 */
export function createIntake({ id, root, t, onFiles, samples = [], onSample, fileIntake }) {
    const input = /** @type {HTMLInputElement} */ (h('input', {
        type: 'file', id: `${id}-file`, class: 'awv-visually-hidden', accept: ACCEPT, tabindex: '-1', multiple: '',
        // Operated through the Open button and the dropzone: kept out of the
        // accessibility tree, where it would read as a stray, untranslated
        // "Choose File" button.
        'aria-hidden': 'true'
    }));
    const title = h('h2', { class: 'awv-intake-title', id: `${id}-intake-title` });
    const sentence = h('span', { class: 'awv-intake-drop' });
    const link = h('span', { class: 'awv-link' });
    const formats = h('span', { class: 'awv-note' });
    const privacy = h('span', { class: 'awv-note' });
    const zone = /** @type {HTMLLabelElement} */ (h('label', {
        class: 'awv-dropzone', for: input.id, role: 'button', 'data-dragover': 'false'
    }, [h('span', { class: 'awv-dropzone-icon' }, icon('document')), sentence, link, formats, privacy]));
    // "No document at hand? Try a sample: PDF · Word · …" — buttons, the host loads.
    const samplesLead = h('span', { class: 'awv-samples-lead' });
    const sampleButtons = samples.map((s, i) => {
        const b = /** @type {HTMLButtonElement} */ (h('button', { type: 'button', class: 'awv-link awv-sample', text: s.label }));
        b.addEventListener('click', () => { if (onSample) onSample(i); });
        return b;
    });
    const samplesLine = h('p', { class: 'awv-samples', hidden: !samples.length }, [samplesLead, ...sampleButtons.flatMap((b, i) => (i ? [h('span', { class: 'awv-sep', 'aria-hidden': 'true', text: '·' }), b] : [b]))]);
    const element = h('section', { class: 'awv-intake', 'aria-labelledby': title.id }, [title, zone, samplesLine]);

    // The picker, the drop over the whole region and the keyboard on the
    // dropzone (the label is the keyboard target: Enter / Space open the picker).
    const intake = fileIntake.create({ input, dropTarget: root, zone, onFiles: (files) => onFiles(files) });

    function label() {
        title.textContent = t('intake.title');
        sentence.textContent = t('intake.drop');
        link.textContent = t('intake.choose');
        formats.textContent = t('intake.formats');
        privacy.textContent = t('viewer.privacy');
        samplesLead.textContent = t('intake.samples');
    }
    label();

    return {
        element,
        input,
        label,
        /** Open the system file picker. */
        pick() { intake.pick(); },
        /** Focus the dropzone (after closing a document or an error). */
        focus() { intake.focus(); },
        destroy() { intake.dispose(); }
    };
}