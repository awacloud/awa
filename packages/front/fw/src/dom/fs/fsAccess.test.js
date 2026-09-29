// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { describe, test, expect, beforeEach } from 'bun:test';
import { fsAccess } from './fsAccess.js';

// ─── helpers ────────────────────────────────────────────────────────────────

/** Builds a simulated in-memory OPFS FileSystemFileHandle. */
async function makeOPFSHandle(root, name) {
    return root.getFileHandle(name, { create: true });
}

// ─── metadata ─────────────────────────────────────────────────────────────────

describe('fsAccess module', () => {
    test('has correct module metadata', () => {
        expect(fsAccess.name).toBe('fsAccess');
        expect(fsAccess.version).toBe('1.0.0');
        expect(fsAccess.type).toBe('fw.dom.fs');
        expect(fsAccess.dependencies).toEqual([]);
        expect(typeof fsAccess.factory).toBe('function');
    });

    // ─── API shape ────────────────────────────────────────────────────────────

    describe('factory', () => {
        test('returns all expected public members', () => {
            const inst = fsAccess.factory();
            const expected = [
                'pickFile', 'pickFiles', 'pickDirectory', 'pickSave',
                'read', 'write', 'opfs', 'support',
                'getFile', 'getFileHandle', 'getDirectoryHandle',
                'list', 'remove',
            ];
            for (const key of expected) {
                expect(typeof inst[key]).toBe('function');
            }
        });
    });

    // ─── support() ────────────────────────────────────────────────────────────

    describe('support', () => {
        test('returns object with three boolean fields', () => {
            const inst = fsAccess.factory();
            const s = inst.support();
            expect(typeof s).toBe('object');
            expect(s).not.toBeNull();
            expect(typeof s.fsa).toBe('boolean');
            expect(typeof s.opfs).toBe('boolean');
            expect(typeof s.writableStreams).toBe('boolean');
        });

        test('fsa is false in non-browser env (bun)', () => {
            const inst = fsAccess.factory();
            const s = inst.support();
            // bun does not expose showOpenFilePicker
            expect(s.fsa).toBe(false);
        });
    });

    // ─── error branches: invalid handles ─────────────────────────────────────

    describe('read - invalid handle', () => {
        test('throws TypeError on null handle', async () => {
            const inst = fsAccess.factory();
            await expect(inst.read(null)).rejects.toThrow(TypeError);
        });

        test('throws TypeError on plain object without getFile', async () => {
            const inst = fsAccess.factory();
            await expect(inst.read({})).rejects.toThrow(TypeError);
        });
    });

    describe('write - invalid handle', () => {
        test('throws TypeError on null handle', async () => {
            const inst = fsAccess.factory();
            await expect(inst.write(null, 'data')).rejects.toThrow(TypeError);
        });

        test('throws TypeError on plain object without createWritable', async () => {
            const inst = fsAccess.factory();
            await expect(inst.write({}, 'data')).rejects.toThrow(TypeError);
        });
    });

    describe('getFile - invalid handle', () => {
        test('throws TypeError on null', async () => {
            const inst = fsAccess.factory();
            await expect(inst.getFile(null)).rejects.toThrow(TypeError);
        });
    });

    describe('getFileHandle - invalid dirHandle', () => {
        test('throws TypeError on null', async () => {
            const inst = fsAccess.factory();
            await expect(inst.getFileHandle(null, 'test.txt')).rejects.toThrow(TypeError);
        });
    });

    describe('getDirectoryHandle - invalid dirHandle', () => {
        test('throws TypeError on null', async () => {
            const inst = fsAccess.factory();
            await expect(inst.getDirectoryHandle(null, 'subdir')).rejects.toThrow(TypeError);
        });
    });

    describe('list - invalid dirHandle', () => {
        test('throws TypeError on null', async () => {
            const inst = fsAccess.factory();
            const gen = inst.list(null);
            await expect(gen.next()).rejects.toThrow(TypeError);
        });

        test('throws TypeError on plain object without entries', async () => {
            const inst = fsAccess.factory();
            const gen = inst.list({});
            await expect(gen.next()).rejects.toThrow(TypeError);
        });
    });

    describe('remove - invalid dirHandle', () => {
        test('throws TypeError on null', async () => {
            const inst = fsAccess.factory();
            await expect(inst.remove(null, 'file.txt')).rejects.toThrow(TypeError);
        });
    });

    // ─── OPFS (if available in the environment) ───────────────────────────────

    const opfsAvailable =
        typeof globalThis.navigator !== 'undefined' &&
        typeof globalThis.navigator?.storage?.getDirectory === 'function';

    describe('opfs', () => {
        if (!opfsAvailable) {
            test('throws when OPFS not available', async () => {
                const inst = fsAccess.factory();
                await expect(inst.opfs()).rejects.toThrow('OPFS');
            });
        } else {
            let inst;
            let root;
            const testFile = `__fw_test_${Date.now()}.txt`;

            beforeEach(async () => {
                inst = fsAccess.factory();
                root = await inst.opfs();
            });

            test('returns FileSystemDirectoryHandle', async () => {
                expect(root).toBeDefined();
                expect(root.kind).toBe('directory');
            });

            test('opfs() returns same root on successive calls', async () => {
                const root2 = await inst.opfs();
                expect(root2).toBe(await inst.opfs()); // cache
            });

            test('getFileHandle creates a file in OPFS', async () => {
                const fh = await inst.getFileHandle(root, testFile, { create: true });
                expect(fh.kind).toBe('file');
                expect(fh.name).toBe(testFile);
                // cleanup
                await inst.remove(root, testFile).catch(() => {});
            });

            test('write + read round-trip (bytes)', async () => {
                const fh = await makeOPFSHandle(root, testFile);
                const data = new Uint8Array([72, 101, 108, 108, 111]); // "Hello"
                await inst.write(fh, data);
                const back = await inst.read(fh);
                expect(back).toBeInstanceOf(Uint8Array);
                expect(Array.from(back)).toEqual(Array.from(data));
                await inst.remove(root, testFile).catch(() => {});
            });

            test('write + read round-trip (text)', async () => {
                const fh = await makeOPFSHandle(root, testFile);
                const msg = 'Hello OPFS - unicode éàü';
                await inst.write(fh, msg);
                const back = await inst.read(fh, { as: 'text' });
                expect(back).toBe(msg);
                await inst.remove(root, testFile).catch(() => {});
            });

            test('read as stream returns ReadableStream', async () => {
                const fh = await makeOPFSHandle(root, testFile);
                await inst.write(fh, 'stream-test');
                const stream = await inst.read(fh, { as: 'stream' });
                expect(typeof stream.getReader).toBe('function');
                await inst.remove(root, testFile).catch(() => {});
            });

            test('list yields entries in a directory', async () => {
                const fh = await makeOPFSHandle(root, testFile);
                await inst.write(fh, 'x');
                const entries = [];
                for await (const entry of inst.list(root)) {
                    entries.push(entry);
                }
                const found = entries.find(e => e.name === testFile);
                expect(found).toBeDefined();
                expect(found.kind).toBe('file');
                await inst.remove(root, testFile).catch(() => {});
            });

            test('getDirectoryHandle creates a subdirectory', async () => {
                const dirName = `__fw_test_dir_${Date.now()}`;
                const dh = await inst.getDirectoryHandle(root, dirName, { create: true });
                expect(dh.kind).toBe('directory');
                await inst.remove(root, dirName, { recursive: true }).catch(() => {});
            });

            test('getFile returns a File object', async () => {
                const fh = await makeOPFSHandle(root, testFile);
                await inst.write(fh, 'content');
                const file = await inst.getFile(fh);
                expect(file).toBeInstanceOf(globalThis.File);
                await inst.remove(root, testFile).catch(() => {});
            });
        }
    });

    // ─── DOM-bound pickers: only "not supported" error in test env ────────────

    describe('pickFile', () => {
        test('throws when FSA not available', async () => {
            if (typeof globalThis.showOpenFilePicker === 'function') return; // skip if available
            const inst = fsAccess.factory();
            await expect(inst.pickFile()).rejects.toThrow('File System Access API not supported');
        });
    });

    describe('pickFiles', () => {
        test('throws when FSA not available', async () => {
            if (typeof globalThis.showOpenFilePicker === 'function') return;
            const inst = fsAccess.factory();
            await expect(inst.pickFiles()).rejects.toThrow('File System Access API not supported');
        });
    });

    describe('pickDirectory', () => {
        test('throws when FSA not available', async () => {
            if (typeof globalThis.showDirectoryPicker === 'function') return;
            const inst = fsAccess.factory();
            await expect(inst.pickDirectory()).rejects.toThrow('File System Access API not supported');
        });
    });

    describe('pickSave', () => {
        test('throws when FSA not available', async () => {
            if (typeof globalThis.showSaveFilePicker === 'function') return;
            const inst = fsAccess.factory();
            await expect(inst.pickSave()).rejects.toThrow('File System Access API not supported');
        });
    });
});
