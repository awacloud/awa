// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview File intake: a hidden `<input type="file">` picker, an OS file
 * drop on a target element and a keyboard-operable dropzone, all wired to one
 * `onFiles(files, source)` callback.
 *
 * @description
 * The module wires elements the caller already owns; it never creates one and
 * never reads a file (no `text()` / `arrayBuffer()`, no filtering by type or
 * size): consumers detect and refuse. `accept` and `multiple` stay the
 * caller's attributes on the input.
 *
 * Why neither `dnd` nor `fsAccess` covers this:
 * - `dnd` is element-to-element drag-and-drop built on Pointer Events; an OS
 *   file drag raises native `dragenter` / `dragover` / `drop` events carrying
 *   `dataTransfer.files`, which `dnd` does not observe.
 * - `fsAccess` is the File System Access API (handles, `showOpenFilePicker`,
 *   OPFS); `<input type="file">` and `dataTransfer.files` are the legacy File
 *   API, which works in every browser and yields plain `File` objects.
 *
 * Accessibility (WCAG 2.2, 2.5.7 Dragging Movements): the picker is the
 * single-pointer alternative to dragging a file in, and the dropzone opens it
 * from the keyboard (Enter / Space).
 *
 * ## API
 *
 * | Method | Description |
 * |---|---|
 * | `create(opts)` | Wire the input, the drop target and the zone; returns an instance |
 *
 * Instance: `pick()`, `focus()`, `dispose()`.
 */

/**
 * @typedef {Object} FileIntakeOptions
 * @property {HTMLInputElement} input The `type="file"` picker; its `change` event is read.
 * @property {(files: File[], source: 'picker' | 'drop') => void} onFiles
 *   Every file chosen or dropped at once, in order; never called with an empty array.
 * @property {EventTarget & { setAttribute?: (name: string, value: string) => void }} [dropTarget]
 *   Where OS file drops are accepted; without it no drop wiring is made.
 * @property {HTMLElement} [zone] The keyboard-operable dropzone; without it no keyboard wiring is made.
 * @property {string} [dragoverAttribute] Attribute set to `'true'` / `'false'` on `zone` and on
 *   `dropTarget` (when it has `setAttribute`) while a file drag is over the target. Default `'data-dragover'`.
 */

/**
 * @typedef {Object} FileIntakeInstance
 * @property {() => void} pick Open the file picker (`input.click()`).
 * @property {() => void} focus Focus the zone (no-op without a zone).
 * @property {() => void} dispose Remove every listener added; `pick` and `focus` become no-ops.
 */

/**
 * @typedef {Object} FileIntakeAPI
 * @property {(opts: FileIntakeOptions) => FileIntakeInstance} create Wire an input, a drop target and a zone to one callback.
 */

export const fileIntake = {
    name: 'fileIntake',
    version: '1.0.0',
    type: 'fw.dom.fs',
    dependencies: [],

    /** @returns {FileIntakeAPI} */
    factory() {

        /**
         * Wire the intake paths and return the instance.
         *
         * @param {FileIntakeOptions} opts
         * @returns {FileIntakeInstance}
         * @throws {TypeError} when `input` is missing or `onFiles` is not a function.
         */
        function create(opts) {
            const { input, onFiles, dropTarget, zone } = opts || {};
            const attr = (opts && opts.dragoverAttribute) || 'data-dragover';
            if (!input || typeof input.addEventListener !== 'function') {
                throw new TypeError('fileIntake.create: input is required');
            }
            if (typeof onFiles !== 'function') {
                throw new TypeError('fileIntake.create: onFiles must be a function');
            }

            let disposed = false;
            let depth = 0;
            let marked = false;

            /** @param {boolean} on */
            function mark(on) {
                marked = on;
                if (zone) zone.setAttribute(attr, String(on));
                if (dropTarget && typeof dropTarget.setAttribute === 'function') {
                    dropTarget.setAttribute(attr, String(on));
                }
            }

            /** @param {any} e */
            function hasFiles(e) {
                return !!(e && e.dataTransfer && e.dataTransfer.types
                    && [...e.dataTransfer.types].includes('Files'));
            }

            function onChange() {
                const files = input.files ? Array.from(input.files) : [];
                // Reset so choosing the same file again fires `change`.
                input.value = '';
                if (files.length) onFiles(files, 'picker');
            }

            /** @param {any} e */
            function onDragEnter(e) {
                if (!hasFiles(e)) return;
                e.preventDefault();
                depth++;
                mark(true);
            }

            /** @param {any} e */
            function onDragOver(e) {
                if (!hasFiles(e)) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = 'copy';
            }

            /** @param {any} e */
            function onDragLeave(e) {
                if (!hasFiles(e)) return;
                // Nested children fire enter / leave pairs: count them.
                depth = Math.max(0, depth - 1);
                if (depth === 0) mark(false);
            }

            /** @param {any} e */
            function onDrop(e) {
                if (!hasFiles(e)) return;
                e.preventDefault();
                depth = 0;
                mark(false);
                const files = e.dataTransfer.files ? [...e.dataTransfer.files] : [];
                if (files.length) onFiles(files, 'drop');
            }

            /** @param {any} e */
            function onKeyDown(e) {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    input.click();
                }
            }

            input.addEventListener('change', onChange);
            if (dropTarget) {
                dropTarget.addEventListener('dragenter', onDragEnter);
                dropTarget.addEventListener('dragover', onDragOver);
                dropTarget.addEventListener('dragleave', onDragLeave);
                dropTarget.addEventListener('drop', onDrop);
            }
            if (zone) {
                if (!zone.hasAttribute('tabindex')) zone.tabIndex = 0;
                zone.addEventListener('keydown', onKeyDown);
            }

            return {
                pick() {
                    if (!disposed) input.click();
                },
                focus() {
                    if (!disposed && zone) zone.focus();
                },
                dispose() {
                    if (disposed) return;
                    disposed = true;
                    input.removeEventListener('change', onChange);
                    if (dropTarget) {
                        dropTarget.removeEventListener('dragenter', onDragEnter);
                        dropTarget.removeEventListener('dragover', onDragOver);
                        dropTarget.removeEventListener('dragleave', onDragLeave);
                        dropTarget.removeEventListener('drop', onDrop);
                    }
                    if (zone) zone.removeEventListener('keydown', onKeyDown);
                    if (marked) mark(false);
                    depth = 0;
                }
            };
        }

        return { create };
    }
};
