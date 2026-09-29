# polyfill/

Reserved location for minimal polyfills needed when a browser API targeted
by a framework module is not available in the runtime environment.

No polyfill is bundled by default: each addition must stay optional,
explicitly loaded by the consuming application, and comply with the policy
defined by `src/sanity/base.js` (freezing of globals, no implicit
modification of native prototypes).
