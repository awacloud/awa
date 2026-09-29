// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @description
 * Type validation + JSON Schema-like validation.
 *
 * Two surfaces:
 *   1. **Type guards** (`is`, `isNumber`, `isString`, ...) - low-level
 *      utilities kept stable (used notably by `buffer`).
 *   2. **Schema validation** (`validate`, `test`, `compile`) - pragmatic
 *      subset of JSON Schema (compatible with draft 2020-12 for handled
 *      keywords). Does not resolve `$ref`/`$defs`/JSON-Pointer - those cases
 *      would warrant a dedicated module; here the goal is validating
 *      application inputs (form data, API payloads, options).
 *
 * Supported keywords:
 *   - **type**      : 'string' | 'number' | 'integer' | 'boolean' | 'null' |
 *                     'object' | 'array' | array of these values.
 *   - **enum**      : list of allowed values (deep equality).
 *   - **const**     : exact value (deep equality).
 *   - **nullable**  : shortcut - `type` also allows `null` when `true`.
 *   - string  : minLength, maxLength, pattern (RegExp string), format.
 *   - number  : minimum, maximum, exclusiveMinimum, exclusiveMaximum, multipleOf.
 *   - array   : items (schema), minItems, maxItems, uniqueItems.
 *   - object  : properties, required, additionalProperties (bool|schema),
 *               patternProperties (Object<regex, schema>).
 *   - combinators : anyOf, allOf, oneOf, not.
 *
 * Built-in formats: 'email', 'url', 'uuid', 'date', 'datetime', 'ipv4',
 * 'ipv6', 'hex', 'base64'. Custom formats via `compile(schema, { formats })`.
 *
 * Security note: schemas must be trusted. `pattern` and `patternProperties`
 * are compiled via `new RegExp(...)` and a hostile pattern can produce a
 * catastrophic regex (DoS).
 *
 * @example
 * const v = valid.factory();
 *
 * v.is(123);           // "number"       - guards preserved
 * v.isArray([]);       // true
 *
 * v.test(42, { type: 'integer', minimum: 0 });   // true
 *
 * const { valid: ok, errors } = v.validate(
 *   { name: '', age: -5 },
 *   {
 *     type: 'object',
 *     required: ['name'],
 *     properties: {
 *       name: { type: 'string', minLength: 1 },
 *       age: { type: 'integer', minimum: 0 }
 *     }
 *   }
 * );
 * // ok === false
 * // errors: [
 * //   { path: '/name', keyword: 'minLength', message: '...' },
 * //   { path: '/age',  keyword: 'minimum',   message: '...' }
 * // ]
 *
 * const check = v.compile({ type: 'string', format: 'email' });
 * check.validate('user@host.tld');   // { valid: true, errors: [] }
 */

/**
 * A single validation error.
 * @typedef {object} ValidationError
 * @property {string} path - JSON-Pointer-like path to the offending value.
 * @property {string} keyword - The schema keyword that failed.
 * @property {string} message - Human-readable description.
 */

/**
 * Result of a validation run.
 * @typedef {object} ValidationResult
 * @property {boolean} valid - True when no errors were collected.
 * @property {ValidationError[]} errors - Collected validation errors (empty when valid).
 */

/**
 * Options accepted by validate/test/compile.
 * @typedef {object} ValidateOptions
 * @property {Object<string, RegExp|((value: string) => boolean)>} [formats] - Extra/override formats merged over the built-ins.
 */

/**
 * A schema pre-compiled with its options.
 * @typedef {object} CompiledValidator
 * @property {(value: *) => ValidationResult} validate - Validate a value, returning detailed errors.
 * @property {(value: *) => boolean} test - Validate a value, returning a boolean.
 */

/**
 * Validation helper surface returned by `factory()`.
 * @typedef {object} ValidAPI
 * @property {(obj: *) => string} is - Lower-cased internal `[[Class]]` tag of a value.
 * @property {(obj: *) => boolean} isNumber - Finite number guard.
 * @property {(obj: *) => boolean} isString - String guard (incl. boxed strings).
 * @property {(obj: *) => boolean} isBoolean - Boolean guard (incl. boxed booleans).
 * @property {(obj: *) => boolean} isArray - Array guard.
 * @property {(obj: *) => boolean} isObject - Plain object guard.
 * @property {(obj: *) => boolean} isUint8Array - Uint8Array guard.
 * @property {(obj: *) => boolean} isUint8ClampedArray - Uint8ClampedArray guard.
 * @property {(obj: *) => boolean} isFunction - Function guard.
 * @property {(value: *, schema: Object|boolean, options?: ValidateOptions) => ValidationResult} validate - Validate against a schema with detailed errors.
 * @property {(value: *, schema: Object|boolean, options?: ValidateOptions) => boolean} test - Boolean validation against a schema.
 * @property {(schema: Object|boolean, options?: ValidateOptions) => CompiledValidator} compile - Pre-compile a schema + options.
 * @property {Object<string, RegExp|((value: string) => boolean)>} formats - Read-only map of built-in formats.
 */

export const valid = {
    name: 'valid',
    version: '1.0.0',
    type: 'fw.io.utils',
    dependencies: [],

    /**
     * Factory function.
     * @returns {ValidAPI} Validation helper - see module description.
     */
    factory() {

        // ----------------------------------------------------------------
        // Type guards (legacy API - keys are used in other modules)
        // ----------------------------------------------------------------

        const api = {
            is(obj) {
                return Object.prototype.toString.call(obj).slice(8, -1).toLowerCase();
            },
            isNumber(obj)             { return typeof obj === 'number' && Number.isFinite(obj); },
            isString(obj)             { return Object.prototype.toString.call(obj) === '[object String]'; },
            // The toString branch handles boxed booleans (`new Boolean(true)`),
            // which are `!== true` and `!== false` but match `[object Boolean]`.
            isBoolean(obj)            { return obj === true || obj === false || Object.prototype.toString.call(obj) === '[object Boolean]'; },
            isArray(obj)              { return Object.prototype.toString.call(obj) === '[object Array]'; },
            isObject(obj)             { return Object.prototype.toString.call(obj) === '[object Object]'; },
            isUint8Array(obj)         { return Object.prototype.toString.call(obj) === '[object Uint8Array]'; },
            isUint8ClampedArray(obj)  { return Object.prototype.toString.call(obj) === '[object Uint8ClampedArray]'; },
            isFunction(obj)           { return Object.prototype.toString.call(obj) === '[object Function]'; }
        };

        // ----------------------------------------------------------------
        // Built-in string formats
        // ----------------------------------------------------------------

        // -- Email (WHATWG HTML5 + RFC 5321 limits, ReDoS-safe) ----------
        //
        // WHATWG §4.10.5.1.5 (<input type=email>) defines a regex that is
        // "willfully non-compliant" with RFC 5322 but practical:
        //   - Covers all real-world email cases (RFC 5322 dot-atom
        //     characters: letters, digits, `.!#$%&'*+/=?^_`{|}~-`).
        //   - Domain = sequence of LDH labels (letter/digit/hyphen), each
        //     label in [a-zA-Z0-9] with internal hyphens only, <= 63 chars.
        //   - No catastrophic backtracking (each char class is linear,
        //     anchored, non-overlapping).
        //
        // RFC 5321 §4.5.3.1 overlay:
        //   - local-part <= 64 octets
        //   - domain <= 255 octets
        //   - total <= 254 octets (forwarding buffer)
        //   - local-part: no leading, trailing, or consecutive dot
        //     (strict RFC 5321 §4.1.2 dot-atom). Quoted local-parts
        //     `"..."@` are intentionally rejected - barely supported by
        //     real-world providers and a frequent injection-bug source.
        //
        // No internationalized email (RFC 6531 / SMTPUTF8) by default:
        // Unicode chars in local-part/domain are not accepted because most
        // MTAs do not support them. For IDN cases, pass a custom `format`.

        const _EMAIL_RE = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

        function _emailCheck(s) {
            if (typeof s !== 'string') return false;
            if (s.length === 0 || s.length > 254) return false;

            const at = s.lastIndexOf('@');
            if (at < 1 || at === s.length - 1) return false;
            const local = s.slice(0, at);
            const domain = s.slice(at + 1);

            // RFC 5321 length limits
            if (local.length > 64 || domain.length > 255) return false;

            // RFC 5321 §4.1.2 dot-atom: no boundary dot and no consecutive dots
            if (local.charCodeAt(0) === 46 /* . */) return false;
            if (local.charCodeAt(local.length - 1) === 46) return false;
            if (local.indexOf('..') >= 0) return false;

            // Domain: at least one compound label. TLD >= 2 chars
            // (defensive - rejects `a@b` but accepts `a@b.co`).
            const lastDot = domain.lastIndexOf('.');
            if (lastDot < 0) return false;
            if (domain.length - lastDot - 1 < 2) return false;

            // Char-level + label structure + per-label length 63 via regex.
            return _EMAIL_RE.test(s);
        }

        // -- IPv6 (RFC 4291 §2.2, all forms + IPv4-mapped + zone id) ----
        //
        // Coverage:
        //   - Preferred form: 8 groups of 1-4 hex separated by ':'
        //     (e.g. `2001:db8:85a3:0:0:8a2e:370:7334`)
        //   - Compressed form `::` (RFC 4291 §2.2.2) - only one `::` per
        //     address, all positions (start, middle, end, lone `::` =
        //     unspecified, `::1` = loopback).
        //   - IPv4-mapped (§2.5.5.2): `::ffff:192.0.2.1`
        //   - IPv4-translated (§2.5.5.1): `::192.0.2.1` (legacy)
        //   - IPv4-embedded (RFC 6052): `64:ff9b::192.0.2.1`
        //   - Zone ID link-local (RFC 4007 §11, RFC 6874): `fe80::1%eth0`
        //
        // Non-overlapping alternatives -> no ReDoS.

        const _IPV6_RE = new RegExp(
            '^(' +
                // 1:2:3:4:5:6:7:8
                '([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}' + '|' +
                // 1::                              1:2:3:4:5:6:7::
                '([0-9a-fA-F]{1,4}:){1,7}:' + '|' +
                // 1::8      1:2:3:4:5:6::8
                '([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}' + '|' +
                // 1::7:8    1:2:3:4:5::7:8
                '([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}' + '|' +
                '([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}' + '|' +
                '([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}' + '|' +
                '([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}' + '|' +
                '[0-9a-fA-F]{1,4}:(:[0-9a-fA-F]{1,4}){1,6}' + '|' +
                // ::8  ::1:2:3:4:5:6:7  ::  (all-zero)
                ':(:[0-9a-fA-F]{1,4}){1,7}' + '|' +
                '::' + '|' +
                // fe80::... with zone id (%eth0 / %1)
                'fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z.\\-_~]+' + '|' +
                // ::ffff:192.0.2.1  /  ::ffff:0:192.0.2.1  (IPv4-mapped)
                '::(ffff(:0{1,4})?:)?((25[0-5]|(2[0-4]|1?[0-9])?[0-9])\\.){3}(25[0-5]|(2[0-4]|1?[0-9])?[0-9])' + '|' +
                // 2001:db8:3:4::192.0.2.1  (IPv4-embedded)
                '([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1?[0-9])?[0-9])\\.){3}(25[0-5]|(2[0-4]|1?[0-9])?[0-9])' +
            ')$'
        );

        const FORMATS = {
            email:    _emailCheck,
            // http(s)://host[:port][/path]
            url:      /^https?:\/\/[^\s/$.?#].[^\s]*$/i,
            // UUID v1-v5 lowercase/uppercase
            uuid:     /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
            // ISO 8601 date (YYYY-MM-DD)
            date:     /^\d{4}-\d{2}-\d{2}$/,
            // ISO 8601 date-time (with Z or offset)
            datetime: /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/,
            ipv4:     /^(25[0-5]|2[0-4]\d|[01]?\d\d?)(\.(25[0-5]|2[0-4]\d|[01]?\d\d?)){3}$/,
            ipv6:     _IPV6_RE,
            hex:      /^[0-9a-f]+$/i,
            base64:   /^[A-Za-z0-9+/]*={0,2}$/
        };

        // ----------------------------------------------------------------
        // Deep equality (for enum / const)
        // ----------------------------------------------------------------

        function deepEq(a, b) {
            if (a === b) return true;
            if (typeof a !== typeof b) return false;
            if (a === null || b === null) return a === b;
            if (Array.isArray(a)) {
                if (!Array.isArray(b) || a.length !== b.length) return false;
                for (let i = 0; i < a.length; i++) if (!deepEq(a[i], b[i])) return false;
                return true;
            }
            if (typeof a === 'object') {
                if (Array.isArray(b)) return false;
                const ka = Object.keys(a), kb = Object.keys(b);
                if (ka.length !== kb.length) return false;
                for (const k of ka) if (!deepEq(a[k], b[k])) return false;
                return true;
            }
            return false;
        }

        // ----------------------------------------------------------------
        // Type checking (JSON Schema types)
        // ----------------------------------------------------------------

        function jsonType(v) {
            if (v === null) return 'null';
            if (Array.isArray(v)) return 'array';
            if (typeof v === 'number') {
                if (!Number.isFinite(v)) return 'number'; // NaN/+-Inf -> type 'number' but will fail finite check
                return Number.isInteger(v) ? 'integer' : 'number';
            }
            if (typeof v === 'object') return 'object';
            return typeof v; // string | boolean | undefined | bigint | symbol | function
        }

        function matchesType(value, type) {
            const t = jsonType(value);
            if (type === 'number') return t === 'number' || t === 'integer';
            return t === type;
        }

        // ----------------------------------------------------------------
        // Core validator
        // ----------------------------------------------------------------

        function pushError(errors, path, keyword, message) {
            errors.push({ path: path || '/', keyword, message });
        }

        function validateNode(value, schema, path, errors, formats) {
            // Boolean schema: true accepts everything, false rejects everything.
            if (schema === true) return;
            if (schema === false) { pushError(errors, path, 'false', 'schema is false'); return; }
            if (!schema || typeof schema !== 'object') return;

            // const
            if ('const' in schema) {
                if (!deepEq(value, schema.const)) {
                    pushError(errors, path, 'const', 'must equal const');
                }
            }

            // enum
            if (Array.isArray(schema.enum)) {
                let found = false;
                for (const e of schema.enum) if (deepEq(value, e)) { found = true; break; }
                if (!found) pushError(errors, path, 'enum', 'must be one of enum values');
            }

            // type (+ nullable shortcut)
            if (schema.type !== undefined) {
                const types = Array.isArray(schema.type) ? schema.type : [schema.type];
                const allowed = schema.nullable ? types.concat('null') : types;
                let ok = false;
                for (const t of allowed) if (matchesType(value, t)) { ok = true; break; }
                if (!ok) {
                    pushError(errors, path, 'type', 'must be ' + allowed.join(' | '));
                    return; // no point continuing type-specific checks
                }
            } else if (schema.nullable && value === null) {
                // `nullable` alone (without type) -> short-circuit null
                return;
            }

            const t = jsonType(value);

            // -- string --
            if (t === 'string') {
                if (typeof schema.minLength === 'number' && value.length < schema.minLength)
                    pushError(errors, path, 'minLength', 'string shorter than ' + schema.minLength);
                if (typeof schema.maxLength === 'number' && value.length > schema.maxLength)
                    pushError(errors, path, 'maxLength', 'string longer than ' + schema.maxLength);
                if (schema.pattern !== undefined) {
                    const re = schema.pattern instanceof RegExp
                        ? schema.pattern
                        : new RegExp(schema.pattern);
                    if (!re.test(value)) pushError(errors, path, 'pattern', 'does not match pattern');
                }
                if (schema.format) {
                    const fn = formats[schema.format];
                    if (fn instanceof RegExp) {
                        if (!fn.test(value)) pushError(errors, path, 'format', 'does not match format ' + schema.format);
                    } else if (typeof fn === 'function') {
                        if (!fn(value)) pushError(errors, path, 'format', 'does not match format ' + schema.format);
                    }
                    // Unknown format: silent (JSON Schema default "annotation only" behavior)
                }
            }

            // -- number / integer --
            if (t === 'number' || t === 'integer') {
                if (!Number.isFinite(value)) {
                    pushError(errors, path, 'type', 'number must be finite');
                } else {
                    if (typeof schema.minimum === 'number' && value < schema.minimum)
                        pushError(errors, path, 'minimum', 'must be >= ' + schema.minimum);
                    if (typeof schema.maximum === 'number' && value > schema.maximum)
                        pushError(errors, path, 'maximum', 'must be <= ' + schema.maximum);
                    if (typeof schema.exclusiveMinimum === 'number' && value <= schema.exclusiveMinimum)
                        pushError(errors, path, 'exclusiveMinimum', 'must be > ' + schema.exclusiveMinimum);
                    if (typeof schema.exclusiveMaximum === 'number' && value >= schema.exclusiveMaximum)
                        pushError(errors, path, 'exclusiveMaximum', 'must be < ' + schema.exclusiveMaximum);
                    if (typeof schema.multipleOf === 'number' && schema.multipleOf > 0) {
                        const div = value / schema.multipleOf;
                        if (!Number.isFinite(div) || Math.abs(div - Math.round(div)) > 1e-12)
                            pushError(errors, path, 'multipleOf', 'must be multiple of ' + schema.multipleOf);
                    }
                }
            }

            // -- array --
            if (t === 'array') {
                if (typeof schema.minItems === 'number' && value.length < schema.minItems)
                    pushError(errors, path, 'minItems', 'array shorter than ' + schema.minItems);
                if (typeof schema.maxItems === 'number' && value.length > schema.maxItems)
                    pushError(errors, path, 'maxItems', 'array longer than ' + schema.maxItems);
                if (schema.uniqueItems) {
                    for (let i = 0; i < value.length; i++) {
                        for (let j = i + 1; j < value.length; j++) {
                            if (deepEq(value[i], value[j])) {
                                pushError(errors, path, 'uniqueItems', 'duplicate items at [' + i + '] and [' + j + ']');
                                i = value.length; break;
                            }
                        }
                    }
                }
                if (schema.items) {
                    for (let i = 0; i < value.length; i++) {
                        validateNode(value[i], schema.items, path + '/' + i, errors, formats);
                    }
                }
            }

            // -- object --
            if (t === 'object') {
                if (Array.isArray(schema.required)) {
                    for (const key of schema.required) {
                        if (!(key in value)) {
                            pushError(errors, path + '/' + key, 'required', 'missing required property');
                        }
                    }
                }
                const props = schema.properties || null;
                const patProps = schema.patternProperties
                    ? Object.keys(schema.patternProperties).map(p => ({
                        re: new RegExp(p), schema: schema.patternProperties[p]
                    }))
                    : null;
                const addProps = schema.additionalProperties;

                for (const key of Object.keys(value)) {
                    const subPath = path + '/' + key;
                    let matched = false;
                    if (props && key in props) {
                        validateNode(value[key], props[key], subPath, errors, formats);
                        matched = true;
                    }
                    if (patProps) {
                        for (const p of patProps) {
                            if (p.re.test(key)) {
                                validateNode(value[key], p.schema, subPath, errors, formats);
                                matched = true;
                            }
                        }
                    }
                    if (!matched) {
                        if (addProps === false) {
                            pushError(errors, subPath, 'additionalProperties', 'additional property not allowed');
                        } else if (addProps && typeof addProps === 'object') {
                            validateNode(value[key], addProps, subPath, errors, formats);
                        }
                    }
                }
            }

            // -- combinators --
            if (Array.isArray(schema.allOf)) {
                for (const sub of schema.allOf) validateNode(value, sub, path, errors, formats);
            }
            if (Array.isArray(schema.anyOf)) {
                let any = false;
                const subErr = [];
                for (const sub of schema.anyOf) {
                    const e = [];
                    validateNode(value, sub, path, e, formats);
                    if (e.length === 0) { any = true; break; }
                    subErr.push(e);
                }
                if (!any) pushError(errors, path, 'anyOf', 'did not match any schema in anyOf');
            }
            if (Array.isArray(schema.oneOf)) {
                let count = 0;
                for (const sub of schema.oneOf) {
                    const e = [];
                    validateNode(value, sub, path, e, formats);
                    if (e.length === 0) count++;
                    if (count > 1) break;
                }
                if (count !== 1) pushError(errors, path, 'oneOf', 'must match exactly one schema in oneOf (matched ' + count + ')');
            }
            if (schema.not !== undefined) {
                const e = [];
                validateNode(value, schema.not, path, e, formats);
                if (e.length === 0) pushError(errors, path, 'not', 'must not match schema');
            }
        }

        // ----------------------------------------------------------------
        // Public schema API
        // ----------------------------------------------------------------

        /**
         * Validate `value` against `schema`.
         * @param {*} value
         * @param {Object|boolean} schema
         * @param {{formats?: Object<string, RegExp|Function>}} [options]
         * @returns {{valid: boolean, errors: Array<{path:string, keyword:string, message:string}>}}
         */
        api.validate = function (value, schema, options) {
            const formats = (options && options.formats)
                ? Object.assign({}, FORMATS, options.formats)
                : FORMATS;
            const errors = [];
            validateNode(value, schema, '', errors, formats);
            return { valid: errors.length === 0, errors };
        };

        /**
         * Boolean version (faster when you just want a yes/no).
         * @param {*} value
         * @param {Object|boolean} schema
         * @param {Object} [options]
         * @returns {boolean}
         */
        api.test = function (value, schema, options) {
            return api.validate(value, schema, options).valid;
        };

        /**
         * Pre-compile a schema into `validate`/`test` functions closed over
         * the schema + formats - useful for validating many values against
         * the same schema without re-resolving the options.
         *
         * @param {Object|boolean} schema
         * @param {Object} [options]
         * @returns {{validate: Function, test: Function}}
         */
        api.compile = function (schema, options) {
            const formats = (options && options.formats)
                ? Object.assign({}, FORMATS, options.formats)
                : FORMATS;
            return {
                validate(value) {
                    const errors = [];
                    validateNode(value, schema, '', errors, formats);
                    return { valid: errors.length === 0, errors };
                },
                test(value) {
                    const errors = [];
                    validateNode(value, schema, '', errors, formats);
                    return errors.length === 0;
                }
            };
        };

        /**
         * Read-only list of built-in formats. To add formats, pass
         * `{ formats: { myFormat: /regex/ } }` to `validate`, `test`,
         * or `compile`.
         */
        api.formats = FORMATS;

        return /** @type {ValidAPI} */ (/** @type {any} */ (api));
    }
};
