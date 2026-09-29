// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview formKit — RHF-like ergonomic layer over `form` + `valid` + `reactiveBind` + `signal`.
 *
 * `formKit` is a **thin wrapper** around the existing `form` module that adds:
 *   - A JSON-Schema resolver via `valid.compile(schema)`.
 *   - A declarative `register(name)` helper returning the props needed to bind
 *     an `<input>` without calling `form.attach` manually.
 *   - A `watch(name?)` subscription backed by `signal` that fires only for the
 *     requested field (or for any change when no name is given).
 *   - A `dispose()` that tears down all subscriptions and DOM bindings.
 *
 * It does NOT reimplement form state, dirty/touched tracking, array handling,
 * async validation, or submit — those all live in `form.js`.
 *
 * Worker-safe: **no** — DOM-coupled via `form`/`reactiveBind`.
 *
 * @example
 * const fk = formKit.create({
 *     schema: {
 *         type: 'object',
 *         required: ['email'],
 *         properties: { email: { type: 'string', format: 'email' } }
 *     },
 *     defaultValues: { email: '' },
 * });
 *
 * // In a component render:
 * const emailProps = fk.register('email');
 * // → { name: 'email', value: '', onInput: fn, onChange: fn }
 *
 * const { value, unsubscribe } = fk.watch('email');
 * // fires whenever 'email' changes
 */

/**
 * Props returned by `register(name)` — spread onto an `<input>`.
 * @typedef {object} FieldProps
 * @property {string}   name     Field name (mirrors the registered name).
 * @property {*}        value    Current field value (read from the form controller).
 * @property {Function} onInput  Handler for the `input` event (text inputs).
 * @property {Function} onChange Handler for the `change` event (checkboxes / selects).
 */

/**
 * Subscription handle returned by `watch`.
 * @typedef {object} WatchHandle
 * @property {*}          value       Current value (field or whole-values snapshot).
 * @property {Function}   subscribe   Add a further subscriber; returns unsubscribe.
 * @property {() => void} unsubscribe Detach this watch subscription.
 */

/**
 * Array accessor returned by `array(name)` — same surface as `form.array()` plus `fields`.
 * @typedef {object} FormKitArrayAccessor
 * @property {Array<*>}   fields  Alias for the current array values (defensive copy).
 * @property {Array<*>}   values  Defensive copy of current array values.
 * @property {number}     length  Current array length.
 * @property {Function}   push    Append an item; returns its index.
 * @property {Function}   remove  Remove at index; `false` when out of range.
 * @property {Function}   move    Move item; `false` when out of range.
 * @property {Function}   set     Replace at index; `false` when out of range.
 * @property {Function}   clear   Empty the array.
 * @property {Function}   get     Read a single item by index.
 */

/**
 * A `formKit` instance returned by `formKit.create(...)`.
 * @typedef {object} FormKitInstance
 * @property {(name: string) => FieldProps}                               register   Return input props for a field.
 * @property {(name?: string) => WatchHandle}                             watch      Subscribe to a field (or all fields).
 * @property {(values?: Object<string, *>) => void}                       reset      Reset to defaults or given values.
 * @property {(name: string, value: *) => void}                           setValue   Set one field value.
 * @property {(name?: string) => * | Object<string, *>}                   getValues  Get one field or all values.
 * @property {(name: string, message: string) => void}                    setError   Set an error on a field.
 * @property {(name: string) => FormKitArrayAccessor}                     array      Array-field accessor.
 * @property {(onValid: Function, onInvalid?: Function) => Promise<void>} submit     Submit the form.
 * @property {object}                                                      form       Escape hatch: the underlying controller.
 * @property {() => void}                                                  dispose    Detach all subscriptions and bindings.
 */

/**
 * Public shape returned by `formKit.factory()`.
 * @typedef {object} FormKitAPI
 * @property {(spec: { schema?: Object, defaultValues?: Object<string, *> }) => FormKitInstance} create
 *   Create a new formKit instance.
 */

import { form } from './form.js';
import { valid } from '../../io/utils/valid.js';
import { reactiveBind } from '../rendering/reactiveBind.js';
import { signal } from '../../io/utils/signal.js';

export const formKit = {
    name: 'formKit',
    version: '1.0.0',
    type: 'fw.dom.utils',
    dependencies: ['form', 'valid', 'reactiveBind', 'signal'],
    deps: [form, valid, reactiveBind, signal],

    /** @returns {FormKitAPI} */
    factory(form, valid, _reactiveBind, signal) {

        /**
         * Create a new `formKit` instance.
         *
         * @param {object} [spec]
         * @param {object} [spec.schema]         JSON Schema compiled once via `valid.compile(schema)`.
         * @param {object} [spec.defaultValues]  Initial field values keyed by field name.
         * @returns {FormKitInstance}
         */
        function create(spec) {
            spec = spec || {};

            const schema        = spec.schema        || null;
            const defaultValues = spec.defaultValues || {};

            // ── Extra errors set via setError() ──────────────────────────────
            // Live object — per-field validate closures read from this map so
            // manually-set errors surface on the next validate cycle.
            const _extraErrors = Object.create(null);

            // ── Build form.create spec ───────────────────────────────────────
            const schemaProperties = (schema && schema.properties) ? schema.properties : {};
            const schemaRequired   = (schema && Array.isArray(schema.required)) ? schema.required : [];

            const formFields = Object.create(null);

            // Collect field names from both defaultValues and schema.properties.
            const fieldNames = new Set([
                ...Object.keys(defaultValues),
                ...Object.keys(schemaProperties),
            ]);

            for (const name of fieldNames) {
                const propSchema = schemaProperties[name] || null;
                const defVal     = Object.prototype.hasOwnProperty.call(defaultValues, name)
                    ? defaultValues[name]
                    : (propSchema && propSchema.type === 'boolean' ? false
                        : propSchema && propSchema.type === 'array' ? []
                        : '');
                const isRequired = schemaRequired.includes(name);

                // Compile a per-field validator that checks propSchema + _extraErrors.
                const fieldValidator = propSchema
                    ? (function makeValidator(fieldName, ps) {
                        const compiled = valid.compile(ps);
                        return function validate(value) {
                            if (Object.prototype.hasOwnProperty.call(_extraErrors, fieldName)) {
                                return _extraErrors[fieldName];
                            }
                            const r = compiled.validate(value);
                            return r.valid ? null : (r.errors[0] ? r.errors[0].message : 'Invalid');
                        };
                    }(name, propSchema))
                    : (function makeExtraOnlyValidator(fieldName) {
                        return function validate(_value) {
                            if (Object.prototype.hasOwnProperty.call(_extraErrors, fieldName)) {
                                return _extraErrors[fieldName];
                            }
                            return null;
                        };
                    }(name));

                formFields[name] = {
                    default: defVal,
                    // Set type for array/boolean fields so form internals work correctly.
                    ...(propSchema && propSchema.type === 'array'   ? { type: 'array' }   : {}),
                    ...(propSchema && propSchema.type === 'boolean' ? { type: 'boolean' } : {}),
                    ...(isRequired ? { required: true } : {}),
                    validate: fieldValidator,
                };
            }

            // Form-level cross-field validation runs the full schema resolver
            // and also surfaces any remaining extra errors not covered by fields.
            const resolver = schema ? valid.compile(schema) : null;

            const formSpec = {
                fields: formFields,
                ...(resolver
                    ? {
                        validate(values) {
                            const r = resolver.validate(values);
                            const out = {};
                            if (!r.valid) {
                                for (const err of r.errors) {
                                    const key = err.path
                                        ? err.path.replace(/^\//, '').split('/')[0]
                                        : '';
                                    if (key && !(key in out)) out[key] = err.message;
                                }
                            }
                            // Merge any manually-set errors not yet consumed.
                            for (const k in _extraErrors) {
                                if (!(k in out)) out[k] = _extraErrors[k];
                            }
                            return out;
                        },
                    }
                    : {
                        validate() {
                            const out = {};
                            for (const k in _extraErrors) out[k] = _extraErrors[k];
                            return out;
                        },
                    }),
            };

            const controller = form.create(formSpec);

            // ── Track all subscriptions for dispose() ────────────────────────
            /** @type {Array<() => void>} */
            const _disposers = [];

            // ── register(name) ────────────────────────────────────────────────

            /**
             * Return props to spread onto an `<input>` element, wiring the field
             * value and change events to the form controller.
             *
             * @param {string} name
             * @returns {FieldProps}
             */
            function register(name) {
                function onInput(event) {
                    const el = event && event.target ? event.target : event;
                    const value = el && el.type === 'checkbox'
                        ? el.checked
                        : (el != null ? el.value : el);
                    controller.set(name, value);
                    controller.touch(name);
                }

                function onChange(event) {
                    onInput(event);
                }

                return {
                    name,
                    get value() { return controller.get(name); },
                    onInput,
                    onChange,
                };
            }

            // ── watch(name?) ─────────────────────────────────────────────────

            /**
             * Subscribe to changes on a specific field (`name`) or the whole
             * form (no argument). Returns a handle with a current `value` and
             * an `unsubscribe`.
             *
             * @param {string} [name]
             * @returns {WatchHandle}
             */
            function watch(name) {
                const initial = name !== undefined
                    ? controller.get(name)
                    : controller.values;

                const sig = signal.create(initial);

                const off = controller.subscribe((snapshot) => {
                    if (name !== undefined) {
                        const next = snapshot.values[name];
                        if (!Object.is(next, sig.peek())) {
                            sig.set(next);
                        }
                    } else {
                        // Whole-form watch: always notify (values is a new object each time).
                        sig.set(snapshot.values);
                    }
                });

                _disposers.push(off);

                let _unsubscribed = false;
                function unsubscribe() {
                    if (_unsubscribed) return;
                    _unsubscribed = true;
                    off();
                    const idx = _disposers.indexOf(off);
                    if (idx !== -1) _disposers.splice(idx, 1);
                }

                return {
                    get value() { return sig.peek(); },
                    subscribe: (fn) => sig.subscribe(fn),
                    unsubscribe,
                };
            }

            // ── reset(values?) ───────────────────────────────────────────────

            /**
             * Reset the form to defaults (or provided overrides).
             * Also clears any manually-set errors.
             *
             * @param {Object<string, *>} [values]
             */
            function reset(values) {
                // Clear extra errors so they don't persist after reset.
                for (const k in _extraErrors) delete _extraErrors[k];
                controller.reset(values);
            }

            // ── setValue(name, value) ─────────────────────────────────────────

            /**
             * Set one field value.
             * @param {string} name
             * @param {*}      value
             */
            function setValue(name, value) {
                controller.set(name, value);
            }

            // ── getValues(name?) ──────────────────────────────────────────────

            /**
             * Read one field value or all values.
             * @param {string} [name]
             * @returns {* | Object<string, *>}
             */
            function getValues(name) {
                if (name !== undefined) return controller.get(name);
                return controller.values;
            }

            // ── setError(name, message) ───────────────────────────────────────

            /**
             * Manually set an error message on a field.
             * The error persists until the field is validated again (via user input)
             * or the form is reset.
             *
             * @param {string} name
             * @param {string} message
             */
            function setError(name, message) {
                _extraErrors[name] = message;
                // Re-run validation so the error surfaces in the form state.
                controller.validate();
            }

            // ── array(name) ───────────────────────────────────────────────────

            /**
             * Return an RHF-style array accessor for a field declared `type: 'array'`.
             * Wraps `form.array(name)` with an additional `fields` getter.
             *
             * @param {string} name
             * @returns {FormKitArrayAccessor}
             */
            function array(name) {
                const acc = controller.array(name);
                return {
                    get fields()  { return acc.values; },
                    get values()  { return acc.values; },
                    get length()  { return acc.length; },
                    push:   (item)      => acc.push(item),
                    remove: (idx)       => acc.remove(idx),
                    move:   (from, to)  => acc.move(from, to),
                    set:    (idx, item) => acc.set(idx, item),
                    clear:  ()          => acc.clear(),
                    get:    (idx)       => acc.get(idx),
                };
            }

            // ── submit(onValid, onInvalid?) ───────────────────────────────────

            /**
             * Submit the form. Touches all fields, runs async validation, then
             * calls `onValid(values)` when valid or `onInvalid(errors)` otherwise.
             *
             * @param {(values: Object<string, *>) => void | Promise<void>} onValid
             * @param {(errors: Object<string, string|Array>) => void}       [onInvalid]
             * @returns {Promise<void>}
             */
            async function submit(onValid, onInvalid) {
                const isValid = await controller.validateAsync();
                if (isValid) {
                    if (typeof onValid === 'function') {
                        await onValid(controller.values);
                    }
                } else {
                    if (typeof onInvalid === 'function') {
                        onInvalid(controller.errors);
                    }
                }
            }

            // ── dispose() ────────────────────────────────────────────────────

            /**
             * Detach all subscriptions and DOM bindings created by this instance.
             * Idempotent.
             */
            function dispose() {
                for (const off of _disposers) {
                    try { off(); } catch { /* swallow */ }
                }
                _disposers.length = 0;
                controller.detach();
            }

            return {
                register,
                watch,
                reset,
                setValue,
                getValues,
                setError,
                array,
                submit,
                get form() { return controller; },
                dispose,
            };
        }

        return { create };
    },
};
