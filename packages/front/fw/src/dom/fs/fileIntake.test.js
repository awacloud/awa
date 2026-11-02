// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { describe, test, expect, beforeEach } from 'bun:test';
import { GlobalRegistrator } from '@happy-dom/global-registrator';
try { GlobalRegistrator.register(); } catch { /* already registered */ }
import { fileIntake } from './fileIntake.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** A bare File stand-in is enough: the module never reads a file. */
const mkFile = (name) => new File(['x'], name, { type: 'text/plain' });

/** A drag/drop event carrying a stub `dataTransfer` (viewer.test.js idiom). */
function dragEvent(type, { types = ['Files'], files = [] } = {}) {
    const ev = new Event(type, { bubbles: true, cancelable: true });
    Object.defineProperty(ev, 'dataTransfer', { value: { types, files, dropEffect: '' } });
    return ev;
}

/** A `change` event on an input whose `files` is overridden. */
function pickFiles(input, files) {
    Object.defineProperty(input, 'files', { value: files, configurable: true });
    input.dispatchEvent(new Event('change', { bubbles: true }));
}

/** Replace `input.click` with a call counter. */
function spyClick(input) {
    const spy = { calls: 0 };
    input.click = () => { spy.calls++; };
    return spy;
}

describe('fileIntake module', () => {
    test('should have correct module metadata', () => {
        expect(fileIntake.name).toBe('fileIntake');
        expect(fileIntake.type).toBe('fw.dom.fs');
        expect(fileIntake.dependencies).toEqual([]);
        expect(typeof fileIntake.factory).toBe('function');
    });

    describe('factory', () => {
        test('returns { create } only', () => {
            const api = fileIntake.factory();
            expect(Object.keys(api)).toEqual(['create']);
            expect(typeof api.create).toBe('function');
        });
    });

    describe('create', () => {
        let api, input, zone, target, calls;
        const onFiles = (files, source) => { calls.push({ files, source }); };

        beforeEach(() => {
            api = fileIntake.factory();
            input = document.createElement('input');
            input.type = 'file';
            zone = document.createElement('label');
            target = document.createElement('div');
            calls = [];
        });

        test('throws when input is missing', () => {
            expect(() => api.create({ onFiles })).toThrow(new TypeError('fileIntake.create: input is required'));
            expect(() => api.create()).toThrow(TypeError);
            expect(() => api.create({ input: {}, onFiles })).toThrow('fileIntake.create: input is required');
        });

        test('throws when onFiles is not a function', () => {
            expect(() => api.create({ input })).toThrow(new TypeError('fileIntake.create: onFiles must be a function'));
            expect(() => api.create({ input, onFiles: 'nope' })).toThrow('fileIntake.create: onFiles must be a function');
        });

        describe('picker', () => {
            test('a change with two files calls onFiles once and resets the input', () => {
                api.create({ input, onFiles });
                const f1 = mkFile('a.txt');
                const f2 = mkFile('b.txt');
                pickFiles(input, [f1, f2]);
                expect(calls.length).toBe(1);
                expect(calls[0].files).toEqual([f1, f2]);
                expect(calls[0].source).toBe('picker');
                expect(input.value).toBe('');
            });

            test('a change with no files does not call onFiles', () => {
                api.create({ input, onFiles });
                pickFiles(input, []);
                expect(calls.length).toBe(0);
            });

            test('a change with a null files list does not call onFiles', () => {
                api.create({ input, onFiles });
                pickFiles(input, null);
                expect(calls.length).toBe(0);
            });
        });

        describe('drop', () => {
            test('dragenter marks both elements and prevents default', () => {
                api.create({ input, onFiles, dropTarget: target, zone });
                const ev = dragEvent('dragenter');
                target.dispatchEvent(ev);
                expect(ev.defaultPrevented).toBe(true);
                expect(zone.getAttribute('data-dragover')).toBe('true');
                expect(target.getAttribute('data-dragover')).toBe('true');
            });

            test('dragover prevents default and sets dropEffect copy', () => {
                api.create({ input, onFiles, dropTarget: target });
                const ev = dragEvent('dragover');
                target.dispatchEvent(ev);
                expect(ev.defaultPrevented).toBe(true);
                expect(ev.dataTransfer.dropEffect).toBe('copy');
            });

            test('nested enter/leave pairs keep the mark until the depth reaches 0', () => {
                api.create({ input, onFiles, dropTarget: target, zone });
                target.dispatchEvent(dragEvent('dragenter'));
                target.dispatchEvent(dragEvent('dragenter'));
                target.dispatchEvent(dragEvent('dragleave'));
                expect(zone.getAttribute('data-dragover')).toBe('true');
                expect(target.getAttribute('data-dragover')).toBe('true');
                target.dispatchEvent(dragEvent('dragleave'));
                expect(zone.getAttribute('data-dragover')).toBe('false');
                expect(target.getAttribute('data-dragover')).toBe('false');
            });

            test('an unbalanced dragleave never drives the depth negative', () => {
                api.create({ input, onFiles, dropTarget: target, zone });
                target.dispatchEvent(dragEvent('dragleave'));
                target.dispatchEvent(dragEvent('dragenter'));
                expect(zone.getAttribute('data-dragover')).toBe('true');
                target.dispatchEvent(dragEvent('dragleave'));
                expect(zone.getAttribute('data-dragover')).toBe('false');
            });

            test('drop with files calls onFiles, unmarks and prevents default', () => {
                api.create({ input, onFiles, dropTarget: target, zone });
                const files = [mkFile('a.pdf'), mkFile('b.pdf')];
                target.dispatchEvent(dragEvent('dragenter'));
                const ev = dragEvent('drop', { files });
                target.dispatchEvent(ev);
                expect(ev.defaultPrevented).toBe(true);
                expect(calls.length).toBe(1);
                expect(calls[0].files).toEqual(files);
                expect(calls[0].source).toBe('drop');
                expect(zone.getAttribute('data-dragover')).toBe('false');
                expect(target.getAttribute('data-dragover')).toBe('false');
            });

            test('a drop resets the depth counter', () => {
                api.create({ input, onFiles, dropTarget: target, zone });
                target.dispatchEvent(dragEvent('dragenter'));
                target.dispatchEvent(dragEvent('dragenter'));
                target.dispatchEvent(dragEvent('drop', { files: [mkFile('a')] }));
                target.dispatchEvent(dragEvent('dragenter'));
                target.dispatchEvent(dragEvent('dragleave'));
                expect(zone.getAttribute('data-dragover')).toBe('false');
            });

            test('a drop with an empty file list does not call onFiles', () => {
                api.create({ input, onFiles, dropTarget: target });
                target.dispatchEvent(dragEvent('drop', { files: [] }));
                expect(calls.length).toBe(0);
            });

            test('a drop whose dataTransfer has no files list does not call onFiles', () => {
                api.create({ input, onFiles, dropTarget: target });
                const ev = new Event('drop', { bubbles: true, cancelable: true });
                Object.defineProperty(ev, 'dataTransfer', { value: { types: ['Files'] } });
                target.dispatchEvent(ev);
                expect(calls.length).toBe(0);
            });

            test('a text drag is ignored entirely', () => {
                api.create({ input, onFiles, dropTarget: target, zone });
                const events = ['dragenter', 'dragover', 'dragleave', 'drop']
                    .map((t) => dragEvent(t, { types: ['text/plain'], files: [mkFile('a')] }));
                for (const ev of events) {
                    target.dispatchEvent(ev);
                    expect(ev.defaultPrevented).toBe(false);
                }
                expect(zone.hasAttribute('data-dragover')).toBe(false);
                expect(target.hasAttribute('data-dragover')).toBe(false);
                expect(calls.length).toBe(0);
            });

            test('an event without dataTransfer is ignored', () => {
                api.create({ input, onFiles, dropTarget: target, zone });
                const ev = new Event('dragenter', { bubbles: true, cancelable: true });
                target.dispatchEvent(ev);
                expect(ev.defaultPrevented).toBe(false);
                expect(zone.hasAttribute('data-dragover')).toBe(false);
            });

            test('without dropTarget there is no drop wiring', () => {
                api.create({ input, onFiles, zone });
                const ev = dragEvent('drop', { files: [mkFile('a')] });
                zone.dispatchEvent(ev);
                expect(ev.defaultPrevented).toBe(false);
                expect(calls.length).toBe(0);
            });

            test('a custom dragoverAttribute is set on the custom name only', () => {
                api.create({ input, onFiles, dropTarget: target, zone, dragoverAttribute: 'data-drag' });
                target.dispatchEvent(dragEvent('dragenter'));
                expect(zone.getAttribute('data-drag')).toBe('true');
                expect(target.getAttribute('data-drag')).toBe('true');
                expect(zone.hasAttribute('data-dragover')).toBe(false);
                expect(target.hasAttribute('data-dragover')).toBe(false);
            });

            test('a bare EventTarget drop target still works', () => {
                const bare = new EventTarget();
                api.create({ input, onFiles, dropTarget: bare, zone });
                const files = [mkFile('a')];
                expect(() => bare.dispatchEvent(dragEvent('dragenter'))).not.toThrow();
                expect(zone.getAttribute('data-dragover')).toBe('true');
                bare.dispatchEvent(dragEvent('drop', { files }));
                expect(calls.length).toBe(1);
                expect(calls[0].files).toEqual(files);
                expect(zone.getAttribute('data-dragover')).toBe('false');
            });

            test('a bare EventTarget without a zone marks nothing and does not throw', () => {
                const bare = new EventTarget();
                api.create({ input, onFiles, dropTarget: bare });
                expect(() => bare.dispatchEvent(dragEvent('dragenter'))).not.toThrow();
                expect(() => bare.dispatchEvent(dragEvent('dragleave'))).not.toThrow();
            });
        });

        describe('keyboard', () => {
            test('Enter and Space on the zone open the picker', () => {
                const spy = spyClick(input);
                api.create({ input, onFiles, zone });
                const enter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
                zone.dispatchEvent(enter);
                expect(spy.calls).toBe(1);
                expect(enter.defaultPrevented).toBe(true);
                const space = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true });
                zone.dispatchEvent(space);
                expect(spy.calls).toBe(2);
                expect(space.defaultPrevented).toBe(true);
            });

            test('other keys are untouched', () => {
                const spy = spyClick(input);
                api.create({ input, onFiles, zone });
                const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
                zone.dispatchEvent(tab);
                expect(spy.calls).toBe(0);
                expect(tab.defaultPrevented).toBe(false);
            });

            test('tabIndex becomes 0 when absent and an existing tabindex is respected', () => {
                api.create({ input, onFiles, zone });
                expect(zone.tabIndex).toBe(0);
                const marked = document.createElement('label');
                marked.setAttribute('tabindex', '-1');
                api.create({ input, onFiles, zone: marked });
                expect(marked.tabIndex).toBe(-1);
            });

            test('without a zone there is no keyboard wiring', () => {
                const spy = spyClick(input);
                api.create({ input, onFiles });
                zone.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
                expect(spy.calls).toBe(0);
            });
        });

        describe('instance', () => {
            test('pick() clicks the input', () => {
                const spy = spyClick(input);
                const inst = api.create({ input, onFiles });
                inst.pick();
                expect(spy.calls).toBe(1);
            });

            test('focus() focuses the zone', () => {
                document.body.appendChild(zone);
                const inst = api.create({ input, onFiles, zone });
                inst.focus();
                expect(document.activeElement === zone).toBe(true);
                zone.remove();
            });

            test('focus() without a zone does not throw', () => {
                const inst = api.create({ input, onFiles });
                expect(() => inst.focus()).not.toThrow();
            });

            test('dispose() removes every listener', () => {
                const spy = spyClick(input);
                const inst = api.create({ input, onFiles, dropTarget: target, zone });
                inst.dispose();
                pickFiles(input, [mkFile('a')]);
                const ev = dragEvent('drop', { files: [mkFile('b')] });
                target.dispatchEvent(ev);
                zone.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
                expect(calls.length).toBe(0);
                expect(ev.defaultPrevented).toBe(false);
                expect(spy.calls).toBe(0);
            });

            test('dispose() resets a marked drag to false', () => {
                const inst = api.create({ input, onFiles, dropTarget: target, zone });
                target.dispatchEvent(dragEvent('dragenter'));
                expect(zone.getAttribute('data-dragover')).toBe('true');
                inst.dispose();
                expect(zone.getAttribute('data-dragover')).toBe('false');
                expect(target.getAttribute('data-dragover')).toBe('false');
            });

            test('dispose() leaves the attribute alone when no drag was marked', () => {
                const inst = api.create({ input, onFiles, dropTarget: target, zone });
                inst.dispose();
                expect(zone.hasAttribute('data-dragover')).toBe(false);
                expect(target.hasAttribute('data-dragover')).toBe(false);
            });

            test('pick() and focus() are no-ops after dispose, and dispose is idempotent', () => {
                document.body.appendChild(zone);
                const spy = spyClick(input);
                const inst = api.create({ input, onFiles, zone });
                inst.dispose();
                inst.pick();
                inst.focus();
                expect(() => inst.dispose()).not.toThrow();
                expect(spy.calls).toBe(0);
                expect(document.activeElement === zone).toBe(false);
                zone.remove();
            });
        });
    });
});
