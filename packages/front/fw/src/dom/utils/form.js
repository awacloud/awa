// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview Form binding + state primitive.
 *
 * Provides two layers :
 *   1. `form.bind(element, getter, setter, opts)` - low-level two-way sync
 *      between a single input element and an external value source.
 *   2. `form.create(spec)` - high-level form state machine : multi-field
 *      values + dirty/touched/errors tracking + sync **and async** validation
 *      + array fields + submit.
 *
 * The high-level form is **DOM-aware but not DOM-coupled**. You connect a
 * `form.attach(name, element)` mapping to wire each field's value/checked to
 * the underlying state.
 *
 * **Async validators (v1.1)** :
 *
 *   form.create({
 *       fields: {
 *           username: {
 *               type: 'string',
 *               validate: async (v) => {
 *                   if (!v) return 'Required';
 *                   const ok = await fetch(`/api/check?u=${v}`).then(r => r.json());
 *                   return ok ? null : 'Already taken';
 *               },
 *           },
 *       },
 *   });
 *
 * `validating[name]` flag tracks pending validations. `isValid` returns
 * `false` while any field is validating (conservative). `submit()` awaits
 * all pending validations before deciding to run `onSubmit`.
 *
 * **Array fields (v1.1)** :
 *
 *   form.create({
 *       fields: {
 *           emails: {
 *               type: 'array',
 *               default: () => [''],
 *               itemValidate: (v) => v.includes('@') ? null : 'Invalid email',
 *           },
 *       },
 *   });
 *
 *   const arr = controller.array('emails');
 *   arr.push('a@b.com');
 *   arr.remove(0);
 *   arr.move(0, 2);
 *   arr.length;            // → number
 *
 * Per-item errors live in `errors[name]` as an array of strings, indexed
 * along the values.
 *
 */

/**
 * Low-level binding handle returned by `bind()`.
 * @typedef {object} FormBinding
 * @property {() => void} refresh Re-apply the current value from the getter to the element.
 * @property {() => void} destroy Detach the bound input listener.
 */

/**
 * Array-field accessor returned by `controller.array(name)`.
 * @typedef {object} FormArrayAccessor
 * @property {Array<*>} values Defensive copy of the current array values (read-only getter).
 * @property {number} length Current array length (read-only getter).
 * @property {(item: *) => number} push Append an item; returns its index.
 * @property {(idx: number) => boolean} remove Remove at index; `false` when out of range.
 * @property {(from: number, to: number) => boolean} move Move item; `false` when out of range.
 * @property {(idx: number, item: *) => boolean} set Replace at index; `false` when out of range.
 * @property {() => void} clear Empty the array.
 * @property {(idx: number) => *} get Read a single item by index.
 */

/**
 * Immutable snapshot of the form state.
 * @typedef {object} FormSnapshot
 * @property {Object<string, *>} values
 * @property {Object<string, string|Array<string|null>>} errors
 * @property {Object<string, boolean>} touched
 * @property {Object<string, boolean>} dirty
 * @property {Object<string, boolean>} validating
 * @property {boolean} isValid
 * @property {boolean} submitting
 */

/**
 * High-level form controller returned by `create()`.
 * @typedef {object} FormController
 * @property {Object<string, *>} values Current values (defensive copy, read-only getter).
 * @property {Object<string, string|Array<string|null>>} errors Current errors (read-only getter).
 * @property {Object<string, boolean>} touched Touched flags (read-only getter).
 * @property {Object<string, boolean>} dirty Dirty flags (read-only getter).
 * @property {Object<string, boolean>} validating Pending-validation flags (read-only getter).
 * @property {boolean} submitting `true` while `submit()` runs (read-only getter).
 * @property {boolean} isValid `false` when any error exists or any field is validating (read-only getter).
 * @property {(name: string) => *} get Read one field value.
 * @property {(name: string, val: *) => void} set Set one field value and refresh its binding.
 * @property {(name: string) => void} touch Mark a field touched.
 * @property {(name: string) => FormArrayAccessor} array Array-field accessor (throws for non-array fields).
 * @property {(name: string, element: Element, opts?: { event?: string }) => void} attach
 *   Wire a field to a DOM element's value/checked plus a blur→touch listener.
 * @property {() => void} detach Detach all field bindings.
 * @property {() => boolean} validate Run all validators synchronously; returns `isValid`.
 * @property {() => Promise<boolean>} validateAsync Run validators and await in-flight async ones; resolves `isValid`.
 * @property {(fn: (snapshot: FormSnapshot) => void) => (() => void)} subscribe
 *   Subscribe to state changes; returns an unsubscribe function.
 * @property {() => FormSnapshot} snapshot Build an immutable state snapshot.
 * @property {(overrides?: Object<string, *>) => void} reset Reset to defaults, optionally overriding values.
 * @property {() => Promise<boolean>} submit
 *   Touch all fields, validate (awaiting async), run `onSubmit`; resolves `true` on success.
 */

/**
 * Public surface returned by `form.factory()`.
 * @typedef {object} FormAPI
 * @property {(name: string, element: Element, getter: () => *, setter: (value: *) => void, opts?: { event?: string, checked?: boolean }) => FormBinding} bind
 *   Low-level two-way bind between a single input and an external value source.
 * @property {(spec: { fields: Object<string, *>, validate?: (values: Object<string, *>) => Object<string, string>, onSubmit?: (values: Object<string, *>) => (void|Promise<void>) }) => FormController} create
 *   High-level multi-field form controller.
 */

import { dom } from '../query/dom.js';
import { events } from '../query/events.js';

export const form = {
    name: 'form',
    version: '1.1.0',
    type: 'fw.dom.utils',
    dependencies: ['dom', 'events'],
    deps: [dom, events],

    /** @returns {FormAPI} */
    factory(dom, events) {

        // ── Low-level bind ──────────────────────────────────────────────────

        function bind(name, element, getter, setter, opts = {}) {
            const ev      = opts.event   || 'input';
            const checked = !!opts.checked;
            const apply = checked
                ? () => dom.checked(element, !!getter())
                : () => dom.val(element, getter() == null ? '' : String(getter()));
            apply();
            events.on(name, element, ev, () => {
                setter(checked ? dom.checkedGet(element) : dom.valGet(element));
            });
            return {
                refresh: apply,
                destroy() { events.off(name); },
            };
        }

        // ── High-level form state ───────────────────────────────────────────

        function _defaultFor(fs) {
            if (Object.prototype.hasOwnProperty.call(fs, 'default')) {
                return typeof fs.default === 'function' ? fs.default() : fs.default;
            }
            if (fs.type === 'boolean') return false;
            if (fs.type === 'array')   return [];
            return '';
        }

        function create(spec) {
            if (!spec || typeof spec.fields !== 'object')
                throw new Error('form.create: spec.fields is required');

            // Internal state.
            const fields      = spec.fields;
            const values      = Object.create(null);
            const errors      = Object.create(null);
            const touched     = Object.create(null);
            const dirty       = Object.create(null);
            const validating  = Object.create(null);     // fieldName → boolean
            const bindings    = new Map();
            const subscribers = new Set();
            let submitting    = false;

            // Per-field token to ignore stale async validation results.
            const _validationToken = Object.create(null);

            // Initialise from spec defaults.
            for (const name in fields) {
                values[name]      = _defaultFor(fields[name]);
                touched[name]     = false;
                dirty[name]       = false;
                validating[name]  = false;
                _validationToken[name] = 0;
            }

            function notify() {
                const snap = controller.snapshot();
                for (const sub of subscribers) {
                    try { sub(snap); } catch { /* swallow */ }
                }
            }

            /**
             * Validate one field. Handles : required, item-array iteration,
             * sync validator, async validator. Returns void ; errors are
             * written to `errors[name]` directly (synchronously for the sync
             * path, asynchronously when validator returns a Promise).
             */
            function validateField(name) {
                const fs = fields[name];
                if (!fs) return;
                const value = values[name];

                // Required check (shared by all field types).
                let err = null;
                if (fs.required) {
                    if (fs.type === 'array') {
                        if (!Array.isArray(value) || value.length === 0) {
                            err = fs.requiredMessage || 'Required';
                        }
                    } else if (value === '' || value == null) {
                        err = fs.requiredMessage || 'Required';
                    }
                }

                // Array per-item validation.
                if (!err && fs.type === 'array' && Array.isArray(value)) {
                    const itemErrors = [];
                    let anyItemErr = false;
                    for (let i = 0; i < value.length; ++i) {
                        let ie = null;
                        if (typeof fs.itemValidate === 'function') {
                            ie = fs.itemValidate(value[i], i, values) || null;
                        }
                        itemErrors.push(ie);
                        if (ie) anyItemErr = true;
                    }
                    if (anyItemErr) {
                        errors[name] = itemErrors;
                        return;
                    }
                    delete errors[name];
                    return;
                }

                if (!err && typeof fs.validate === 'function') {
                    const r = fs.validate(value, values);
                    if (r && typeof r.then === 'function') {
                        // Async path.
                        const token = ++_validationToken[name];
                        validating[name] = true;
                        notify();
                        r.then(
                            (asyncErr) => {
                                if (token !== _validationToken[name]) return;
                                if (asyncErr) errors[name] = asyncErr;
                                else delete errors[name];
                                validating[name] = false;
                                notify();
                            },
                            (e) => {
                                if (token !== _validationToken[name]) return;
                                errors[name] = (e && e.message) || 'Validation error';
                                validating[name] = false;
                                notify();
                            },
                        );
                        return;
                    }
                    err = r || null;
                }

                if (err) errors[name] = err;
                else delete errors[name];
            }

            function validateAll() {
                for (const name in fields) validateField(name);
                if (typeof spec.validate === 'function') {
                    const cross = spec.validate(values) || {};
                    for (const k in cross) {
                        if (cross[k]) errors[k] = cross[k]; else delete errors[k];
                    }
                }
            }

            function setValue(name, val) {
                if (!(name in fields)) return;
                values[name] = val;
                dirty[name]  = true;
                validateField(name);
                notify();
            }

            // ── Array field helper accessor ─────────────────────────────────

            function arrayAccessor(name) {
                const fs = fields[name];
                if (!fs || fs.type !== 'array')
                    throw new Error(`form.array: field '${name}' is not declared as type:'array'`);

                function get() {
                    return [...(values[name] || [])];
                }

                function push(item) {
                    const arr = Array.isArray(values[name]) ? values[name].slice() : [];
                    arr.push(item);
                    setValue(name, arr);
                    return arr.length - 1;
                }

                function remove(idx) {
                    if (!Array.isArray(values[name])) return false;
                    if (idx < 0 || idx >= values[name].length) return false;
                    const arr = values[name].slice();
                    arr.splice(idx, 1);
                    setValue(name, arr);
                    return true;
                }

                function move(from, to) {
                    if (!Array.isArray(values[name])) return false;
                    const arr = values[name].slice();
                    if (from < 0 || from >= arr.length) return false;
                    if (to < 0 || to >= arr.length) return false;
                    const [item] = arr.splice(from, 1);
                    arr.splice(to, 0, item);
                    setValue(name, arr);
                    return true;
                }

                function set(idx, item) {
                    if (!Array.isArray(values[name])) return false;
                    if (idx < 0 || idx >= values[name].length) return false;
                    const arr = values[name].slice();
                    arr[idx] = item;
                    setValue(name, arr);
                    return true;
                }

                function clear() {
                    setValue(name, []);
                }

                return {
                    get values()   { return get(); },
                    get length()   { return Array.isArray(values[name]) ? values[name].length : 0; },
                    push, remove, move, set, clear,
                    get(idx)       { return values[name]?.[idx]; },
                };
            }

            // ── Wait for pending validations to settle ──────────────────────

            function _pendingValidations() {
                const promises = [];
                for (const name in validating) {
                    if (validating[name]) {
                        // Build a promise that resolves when the field flips to
                        // not-validating. Use subscribe as the wakeup.
                        promises.push(new Promise(resolve => {
                            const off = controller.subscribe((s) => {
                                if (!s.validating[name]) { off(); resolve(); }
                            });
                        }));
                    }
                }
                return promises;
            }

            const controller = {
                get values() { return { ...values }; },
                get errors() {
                    // Deep-clone array errors (per-item) so external mutation
                    // cannot reach into internal state - matches snapshot().
                    const out = Object.create(null);
                    for (const k in errors) {
                        const v = errors[k];
                        out[k] = Array.isArray(v) ? v.slice() : v;
                    }
                    return out;
                },
                get touched() { return { ...touched }; },
                get dirty() { return { ...dirty }; },
                get validating() { return { ...validating }; },
                get submitting() { return submitting; },
                get isValid() {
                    if (Object.keys(errors).length > 0) return false;
                    for (const k in validating) if (validating[k]) return false;
                    return true;
                },

                get(name) { return values[name]; },

                set(name, val) {
                    setValue(name, val);
                    const b = bindings.get(name);
                    if (b) b.refresh();
                },

                touch(name) {
                    if (name in fields && !touched[name]) {
                        touched[name] = true;
                        notify();
                    }
                },

                /** Array field helper. Throws when the field is not declared `type:'array'`. */
                array(name) { return arrayAccessor(name); },

                attach(name, element, opts = {}) {
                    if (!(name in fields)) throw new Error(`form.attach: unknown field '${name}'`);
                    const fs = fields[name];
                    const isCheckbox = fs.type === 'boolean';
                    const ev = opts.event || (isCheckbox ? 'change' : 'input');
                    const bindName = `fw:form:${name}`;
                    // Detach previous bind AND its companion blur listener so
                    // a second attach(name, ...) on a different element does
                    // not leave the original element's blur handler firing.
                    const prev = bindings.get(name);
                    if (prev) {
                        prev.destroy();
                        events.off(`${bindName}:blur`);
                    }
                    const h = bind(
                        bindName, element,
                        () => values[name],
                        (v) => setValue(name, v),
                        { event: ev, checked: isCheckbox },
                    );
                    bindings.set(name, h);
                    events.on(`${bindName}:blur`, element, 'blur', () => controller.touch(name));
                },

                detach() {
                    for (const [name, h] of bindings) {
                        h.destroy();
                        events.off(`fw:form:${name}:blur`);
                    }
                    bindings.clear();
                },

                validate() {
                    validateAll();
                    notify();
                    return controller.isValid;
                },

                /** Wait for all async validations currently in flight to settle. */
                async validateAsync() {
                    validateAll();
                    notify();
                    const pending = _pendingValidations();
                    if (pending.length) await Promise.all(pending);
                    return controller.isValid;
                },

                subscribe(fn) {
                    if (typeof fn !== 'function') return () => {};
                    subscribers.add(fn);
                    return () => subscribers.delete(fn);
                },

                snapshot() {
                    // Errors may be arrays (per-item errors for `type:'array'`
                    // fields). A shallow `{...errors}` would share those array
                    // refs with internal state - callers mutating snapshot
                    // arrays could corrupt the controller. Clone arrays.
                    const errorsCopy = Object.create(null);
                    for (const k in errors) {
                        const v = errors[k];
                        errorsCopy[k] = Array.isArray(v) ? v.slice() : v;
                    }
                    return {
                        values:     { ...values },
                        errors:     errorsCopy,
                        touched:    { ...touched },
                        dirty:      { ...dirty },
                        validating: { ...validating },
                        isValid:    controller.isValid,
                        submitting,
                    };
                },

                reset(overrides) {
                    for (const name in fields) {
                        values[name]      = _defaultFor(fields[name]);
                        touched[name]     = false;
                        dirty[name]       = false;
                        validating[name]  = false;
                        _validationToken[name]++;   // invalidate in-flight async
                        delete errors[name];
                    }
                    if (overrides) {
                        for (const k in overrides) {
                            if (k in fields) values[k] = overrides[k];
                        }
                    }
                    for (const [, h] of bindings) h.refresh();
                    notify();
                },

                async submit() {
                    for (const name in fields) touched[name] = true;
                    validateAll();
                    notify();
                    // Wait for async validators in flight.
                    const pending = _pendingValidations();
                    if (pending.length) await Promise.all(pending);
                    if (!controller.isValid) return false;
                    if (typeof spec.onSubmit !== 'function') return true;
                    submitting = true;
                    notify();
                    try {
                        await spec.onSubmit({ ...values });
                        return true;
                    } finally {
                        submitting = false;
                        notify();
                    }
                },
            };

            // Initial validation (so isValid reflects defaults).
            validateAll();

            return controller;
        }

        return { bind, create };
    },
};
