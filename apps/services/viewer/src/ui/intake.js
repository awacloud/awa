// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview File intake: the empty-state dropzone, the hidden picker and
 * an OS file drop anywhere on the viewer.
 *
 * fw ships no OS-file-drop / `<input type=file>` adapter (`dnd` is pointer
 * element DnD, `fsAccess` excludes the legacy File
 * API, reported to fw); this is
 * the viewer's own, the same shape as `apps/demo/pades/src/file-intake.js`.
 * The picker inside the dropzone is the alternative to dragging (WCAG 2.5.7).
 *
 * @module viewer/ui/intake
 */
import { h, icon } from '../render/dom.js';
import { ACCEPT } from '../core/detect.js';

/**
 * @param {{id: string, root: HTMLElement, t: (k: string, p?: object) => string,
 *   onFiles: (files: File[]) => void,
 *   samples?: {label: string}[], onSample?: (index: number) => void}} opts
 *   `onFiles`: every file chosen or dropped at once, in order (the viewer
 *   opens the first); `samples`: documents to try, offered under the
 *   dropzone (the host loads them: `onSample`).
 */
export function createIntake({ id, root, t, onFiles, samples = [], onSample }) {
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
    // The label is the keyboard target: Enter / Space open the picker.
    zone.tabIndex = 0;
    zone.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); }
    });
    // "No document at hand? Try a sample: PDF · Word · …" — buttons, the host loads.
    const samplesLead = h('span', { class: 'awv-samples-lead' });
    const sampleButtons = samples.map((s, i) => {
        const b = /** @type {HTMLButtonElement} */ (h('button', { type: 'button', class: 'awv-link awv-sample', text: s.label }));
        b.addEventListener('click', () => { if (onSample) onSample(i); });
        return b;
    });
    const samplesLine = h('p', { class: 'awv-samples', hidden: !samples.length }, [samplesLead, ...sampleButtons.flatMap((b, i) => (i ? [h('span', { class: 'awv-sep', 'aria-hidden': 'true', text: '·' }), b] : [b]))]);
    const element = h('section', { class: 'awv-intake', 'aria-labelledby': title.id }, [title, zone, samplesLine]);

    input.addEventListener('change', () => {
        const files = input.files ? [...input.files] : [];
        input.value = '';
        if (files.length) onFiles(files);
    });

    /** @param {DragEvent} e */
    const hasFiles = (e) => !!e.dataTransfer && [...e.dataTransfer.types].includes('Files');
    let depth = 0;
    /** @param {boolean} on */
    const mark = (on) => {
        zone.dataset.dragover = String(on);
        root.dataset.dragover = String(on);
    };
    const onEnter = (/** @type {DragEvent} */ e) => { if (!hasFiles(e)) return; e.preventDefault(); depth++; mark(true); };
    const onOver = (/** @type {DragEvent} */ e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    };
    const onLeave = () => { depth = Math.max(0, depth - 1); if (depth === 0) mark(false); };
    const onDrop = (/** @type {DragEvent} */ e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        depth = 0;
        mark(false);
        const files = e.dataTransfer ? [...e.dataTransfer.files] : [];
        if (files.length) onFiles(files);
    };
    root.addEventListener('dragenter', onEnter);
    root.addEventListener('dragover', onOver);
    root.addEventListener('dragleave', onLeave);
    root.addEventListener('drop', onDrop);

    function label() {
        title.textContent = t('intake.title');
        sentence.textContent = t('intake.drop');
        link.textContent = t('intake.choose');
        formats.textContent = t('intake.formats');
        privacy.textContent = t('app.privacy');
        samplesLead.textContent = t('intake.samples');
    }
    label();

    return {
        element,
        input,
        label,
        /** Open the system file picker. */
        pick() { input.click(); },
        /** Focus the dropzone (after closing a document or an error). */
        focus() { zone.focus(); },
        destroy() {
            root.removeEventListener('dragenter', onEnter);
            root.removeEventListener('dragover', onOver);
            root.removeEventListener('dragleave', onLeave);
            root.removeEventListener('drop', onDrop);
        }
    };
}
