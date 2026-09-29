// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @typedef {{ description?: string, accept?: Object.<string, string[]> }} FilePickerAcceptType
 */

/**
 * Object returned by `fsAccess.factory()`. File System Access pickers are
 * DOM-bound (main thread only); OPFS and handle helpers are worker-safe.
 *
 * @typedef {Object} FsAccessAPI
 * @property {(opts?: { types?: FilePickerAcceptType[], excludeAcceptAllOption?: boolean }) => Promise<FileSystemFileHandle|null>} pickFile Open a single-file picker (`null` if cancelled).
 * @property {(opts?: { types?: FilePickerAcceptType[], excludeAcceptAllOption?: boolean }) => Promise<FileSystemFileHandle[]>} pickFiles Open a multi-select file picker (empty array if cancelled).
 * @property {(opts?: { mode?: 'read'|'readwrite' }) => Promise<FileSystemDirectoryHandle|null>} pickDirectory Open a directory picker (`null` if cancelled).
 * @property {(opts?: { suggestedName?: string, types?: FilePickerAcceptType[] }) => Promise<FileSystemFileHandle|null>} pickSave Open a "Save As" picker (`null` if cancelled).
 * @property {(handle: FileSystemFileHandle, opts?: { as?: 'bytes'|'text'|'stream' }) => Promise<Uint8Array|string|ReadableStream>} read Read a file handle's contents.
 * @property {(handle: FileSystemFileHandle, data: Uint8Array|string|Blob|ReadableStream, opts?: { append?: boolean }) => Promise<void>} write Write data to a file handle.
 * @property {() => Promise<FileSystemDirectoryHandle>} opfs Return the OPFS root for the current origin (cached).
 * @property {() => { fsa: boolean, opfs: boolean, writableStreams: boolean }} support Report capabilities available in the current context.
 * @property {(handle: FileSystemFileHandle) => Promise<File>} getFile Return the native `File` from a file handle.
 * @property {(dirHandle: FileSystemDirectoryHandle, name: string, opts?: { create?: boolean }) => Promise<FileSystemFileHandle>} getFileHandle Get (or create) a file handle inside a directory.
 * @property {(dirHandle: FileSystemDirectoryHandle, name: string, opts?: { create?: boolean }) => Promise<FileSystemDirectoryHandle>} getDirectoryHandle Get (or create) a directory handle inside a directory.
 * @property {(dirHandle: FileSystemDirectoryHandle) => AsyncGenerator<{ name: string, kind: 'file'|'directory', handle: FileSystemHandle }>} list Iterate over the contents of a directory.
 * @property {(dirHandle: FileSystemDirectoryHandle, name: string, opts?: { recursive?: boolean }) => Promise<void>} remove Remove an entry from a directory.
 */

/**
 * @description
 * Uniform wrapper over two browser file-system APIs:
 *
 *  - **File System Access API** (`showOpenFilePicker`, `showSaveFilePicker`,
 *    `showDirectoryPicker`) - user-gesture triggered, restricted to the main
 *    thread (DOM-bound).
 *  - **Origin Private File System / OPFS** (`navigator.storage.getDirectory()`)
 *    - origin-isolated sandbox, available inside Workers.
 *
 * The API is uniform for: pick / read / write / list / directory traversal.
 *
 * **Worker-safe:** partial - OPFS and handle helpers yes; pickers no (DOM-bound).
 *
 * Out of MVP scope: file drag-and-drop (see `dnd` P2 module),
 * legacy File API (`<input type=file>`).
 *
 * @example
 * const fs = runtime.resolve('fsAccess');
 * const root = await fs.opfs();
 * const fh = await fs.getFileHandle(root, 'notes.txt', { create: true });
 * await fs.write(fh, 'Hello OPFS');
 * const text = await fs.read(fh, { as: 'text' });
 */
export const fsAccess = {
    name: 'fsAccess',
    version: '1.0.0',
    type: 'fw.dom.fs',
    dependencies: [],

    /** @returns {FsAccessAPI} */
    factory() {
        // Cached OPFS root promise (navigator.storage.getDirectory() can be
        // called multiple times but we avoid redundant calls).
        let _opfsRoot = null;

        // --- support probe ---------------------------------------------------

        /**
         * Returns the capabilities available in the current context.
         * @returns {{ fsa: boolean, opfs: boolean, writableStreams: boolean }}
         */
        function support() {
            const fsa = typeof globalThis.showOpenFilePicker === 'function';
            const opfs = typeof globalThis.navigator !== 'undefined' &&
                         typeof globalThis.navigator.storage !== 'undefined' &&
                         typeof globalThis.navigator.storage.getDirectory === 'function';
            // @note OPFS implies a writable stream is available in workers
            // (sync access handles / FileSystemWritableFileStream), so we
            // treat OPFS presence as a writable-streams shortcut.
            const writableStreams = typeof globalThis.FileSystemWritableFileStream !== 'undefined' ||
                                    opfs;
            return { fsa, opfs, writableStreams };
        }

        // --- internal helpers ------------------------------------------------

        function _assertFSA() {
            if (!support().fsa) {
                throw new Error('fsAccess: File System Access API not supported');
            }
        }

        function _assertOPFS() {
            if (!support().opfs) {
                throw new Error('fsAccess: OPFS (navigator.storage.getDirectory) not supported');
            }
        }

        // --- pickers (DOM-bound, main thread only) ---------------------------

        /**
         * Opens a single-file picker.
         * @param {{ types?: FilePickerAcceptType[], excludeAcceptAllOption?: boolean }} [opts]
         * @returns {Promise<FileSystemFileHandle|null>} null if the user cancels.
         */
        async function pickFile(opts) {
            _assertFSA();
            try {
                const [handle] = await globalThis.showOpenFilePicker(opts ?? {});
                return handle;
            } catch (err) {
                if (err instanceof globalThis.DOMException && err.name === 'AbortError') return null;
                throw err;
            }
        }

        /**
         * Opens a multi-select file picker.
         * @param {{ types?: FilePickerAcceptType[], excludeAcceptAllOption?: boolean }} [opts]
         * @returns {Promise<FileSystemFileHandle[]>} empty array if cancelled.
         */
        async function pickFiles(opts) {
            _assertFSA();
            try {
                return await globalThis.showOpenFilePicker({ ...(opts ?? {}), multiple: true });
            } catch (err) {
                if (err instanceof globalThis.DOMException && err.name === 'AbortError') return [];
                throw err;
            }
        }

        /**
         * Opens a directory picker.
         * @param {{ mode?: 'read'|'readwrite' }} [opts]
         * @returns {Promise<FileSystemDirectoryHandle|null>} null if cancelled.
         */
        async function pickDirectory(opts) {
            _assertFSA();
            try {
                return await globalThis.showDirectoryPicker(opts ?? {});
            } catch (err) {
                if (err instanceof globalThis.DOMException && err.name === 'AbortError') return null;
                throw err;
            }
        }

        /**
         * Opens a "Save As" picker.
         * @param {{ suggestedName?: string, types?: FilePickerAcceptType[] }} [opts]
         * @returns {Promise<FileSystemFileHandle|null>} null if cancelled.
         */
        async function pickSave(opts) {
            _assertFSA();
            try {
                return await globalThis.showSaveFilePicker(opts ?? {});
            } catch (err) {
                if (err instanceof globalThis.DOMException && err.name === 'AbortError') return null;
                throw err;
            }
        }

        // --- read / write ----------------------------------------------------

        /**
         * Reads the contents of a FileSystemFileHandle.
         * @param {FileSystemFileHandle} handle
         * @param {{ as?: 'bytes'|'text'|'stream' }} [opts]
         * @returns {Promise<Uint8Array|string|ReadableStream>}
         */
        async function read(handle, opts) {
            if (!handle || typeof handle.getFile !== 'function') {
                throw new TypeError('fsAccess.read: invalid handle (FileSystemFileHandle expected)');
            }
            const as = (opts && opts.as) || 'bytes';
            const file = await handle.getFile();
            if (as === 'stream') return file.stream();
            if (as === 'text') return await file.text();
            // bytes (default)
            const ab = await file.arrayBuffer();
            return new Uint8Array(ab);
        }

        /**
         * Writes data to a FileSystemFileHandle.
         * @param {FileSystemFileHandle} handle
         * @param {Uint8Array|string|Blob|ReadableStream} data
         * @param {{ append?: boolean }} [opts]
         * @returns {Promise<void>}
         */
        async function write(handle, data, opts) {
            if (!handle || typeof handle.createWritable !== 'function') {
                throw new TypeError('fsAccess.write: invalid handle (FileSystemFileHandle expected)');
            }
            const append = opts && opts.append === true;
            const writable = await handle.createWritable({ keepExistingData: append });
            if (append) {
                // Seek to the end of the existing file
                const file = await handle.getFile();
                await writable.seek(file.size);
            }
            // @ts-ignore - Uint8Array<ArrayBufferLike> is valid write chunk; TS strict SharedArrayBuffer check is overly conservative
            await writable.write(data);
            await writable.close();
        }

        // --- OPFS ------------------------------------------------------------

        /**
         * Returns the OPFS root for the current origin.
         * The promise is cached after the first call.
         * @returns {Promise<FileSystemDirectoryHandle>}
         */
        async function opfs() {
            _assertOPFS();
            if (!_opfsRoot) {
                _opfsRoot = globalThis.navigator.storage.getDirectory();
            }
            return _opfsRoot;
        }

        // --- handle helpers --------------------------------------------------

        /**
         * Returns the native File object from a FileSystemFileHandle.
         * @param {FileSystemFileHandle} handle
         * @returns {Promise<File>}
         */
        async function getFile(handle) {
            if (!handle || typeof handle.getFile !== 'function') {
                throw new TypeError('fsAccess.getFile: invalid handle');
            }
            return handle.getFile();
        }

        /**
         * Returns (or creates) a FileSystemFileHandle inside a directory.
         * @param {FileSystemDirectoryHandle} dirHandle
         * @param {string} name
         * @param {{ create?: boolean }} [opts]
         * @returns {Promise<FileSystemFileHandle>}
         */
        async function getFileHandle(dirHandle, name, opts) {
            if (!dirHandle || typeof dirHandle.getFileHandle !== 'function') {
                throw new TypeError('fsAccess.getFileHandle: invalid dirHandle');
            }
            return dirHandle.getFileHandle(name, opts ?? {});
        }

        /**
         * Returns (or creates) a FileSystemDirectoryHandle inside a directory.
         * @param {FileSystemDirectoryHandle} dirHandle
         * @param {string} name
         * @param {{ create?: boolean }} [opts]
         * @returns {Promise<FileSystemDirectoryHandle>}
         */
        async function getDirectoryHandle(dirHandle, name, opts) {
            if (!dirHandle || typeof dirHandle.getDirectoryHandle !== 'function') {
                throw new TypeError('fsAccess.getDirectoryHandle: invalid dirHandle');
            }
            return dirHandle.getDirectoryHandle(name, opts ?? {});
        }

        /**
         * Iterates over the contents of a directory.
         * @param {FileSystemDirectoryHandle} dirHandle
         * @returns {AsyncGenerator<{name: string, kind: 'file'|'directory', handle: FileSystemHandle}>}
         */
        async function* list(dirHandle) {
            if (!dirHandle || typeof (/** @type {any} */ (dirHandle)).entries !== 'function') {
                throw new TypeError('fsAccess.list: invalid dirHandle');
            }
            // @ts-ignore - entries() is a WICG File System Access API method not yet in TS lib types
            for await (const [name, handle] of dirHandle.entries()) {
                yield { name, kind: handle.kind, handle };
            }
        }

        /**
         * Removes an entry from a directory.
         * @param {FileSystemDirectoryHandle} dirHandle
         * @param {string} name
         * @param {{ recursive?: boolean }} [opts]
         * @returns {Promise<void>}
         */
        async function remove(dirHandle, name, opts) {
            if (!dirHandle || typeof dirHandle.removeEntry !== 'function') {
                throw new TypeError('fsAccess.remove: invalid dirHandle');
            }
            return dirHandle.removeEntry(name, opts ?? {});
        }

        return {
            pickFile,
            pickFiles,
            pickDirectory,
            pickSave,
            read,
            write,
            opfs,
            support,
            getFile,
            getFileHandle,
            getDirectoryHandle,
            list,
            remove,
        };
    }
};
