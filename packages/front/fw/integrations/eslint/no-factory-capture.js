// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// packages/front/fw/integrations/eslint/no-factory-capture.js
/**
 * @fileoverview Custom ESLint rule — `fw/no-factory-capture`.
 *
 * Flags, at edit time, any identifier referenced inside a module's `factory()`
 * that resolves to a **module-scope binding** (a top-level `import` / `const` /
 * `class` / `function`) rather than to a factory parameter or an ambient global.
 *
 * Why : `runtime.serialize()` ships `factory.toString()` into a Worker and the
 * `standalone` tool inlines the factory — both execute the factory source in a
 * clean scope with no access to the module's outer bindings. A captured
 * module-scope binding therefore breaks worker bootstrap / standalone builds.
 * This is the same invariant the `standalone` closure-capture detector enforces
 * at build time, lifted to edit time with proper scope analysis (more accurate
 * than the build-time regex).
 *
 * Mechanism (no allow-list needed) : a reference is a capture iff its resolved
 * variable (a) has at least one definition node (`defs.length > 0` — excludes
 * ambient globals declared via `languageOptions.globals`, which have none) and
 * (b) is declared in a scope strictly ABOVE the factory function. Factory
 * parameters live in the function scope itself and are thus never flagged;
 * factory-local declarations live in descendant scopes and are never flagged.
 */

/** @type {import('eslint').Rule.RuleModule} */
const rule = {
    meta: {
        type: 'problem',
        docs: {
            description:
                'Disallow factory closures from capturing module-scope bindings (worker-serialization safety).',
        },
        schema: [],
        messages: {
            capture:
                'Factory captures module-scope `{{name}}` — not serializable to a Worker ' +
                '(runtime.serialize / standalone). Define it inside the factory, or pass it as a dependency.',
        },
    },

    create(context) {
        const sourceCode = context.sourceCode;

        function checkFactory(fnNode) {
            const fnScope = sourceCode.getScope(fnNode);

            // Scopes strictly above the factory function — capturing from any of
            // these is what breaks serialization.
            const ancestors = new Set();
            for (let s = fnScope.upper; s; s = s.upper) ancestors.add(s);

            const seen = new Set();
            const visit = (scope) => {
                for (const ref of scope.references) {
                    const v = ref.resolved;
                    if (!v || v.defs.length === 0) continue;     // ambient/global → fine
                    if (!ancestors.has(v.scope)) continue;        // factory-local → fine
                    const key = v.name + '@' + ref.identifier.range[0];
                    if (seen.has(key)) continue;
                    seen.add(key);
                    context.report({
                        node: ref.identifier,
                        messageId: 'capture',
                        data: { name: v.name },
                    });
                }
                scope.childScopes.forEach(visit);
            };
            visit(fnScope);
        }

        return {
            'Property[key.name="factory"]'(node) {
                const fn = node.value;
                if (!fn || (fn.type !== 'FunctionExpression' && fn.type !== 'ArrowFunctionExpression')) {
                    return;
                }
                // Only treat it as a module descriptor factory when the sibling
                // shape is present (avoids flagging unrelated `factory` keys).
                const obj = node.parent;
                const isDescriptor =
                    obj &&
                    obj.type === 'ObjectExpression' &&
                    obj.properties.some(
                        (p) => p.key && (p.key.name === 'dependencies' || p.key.name === 'name'),
                    );
                if (isDescriptor) checkFactory(fn);
            },
        };
    },
};

export default {
    rules: { 'no-factory-capture': rule },
};
