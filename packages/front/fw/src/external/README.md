# external/

Reserved location for external scripts possibly integrated into the
framework (vendored third-party libraries, code fragments taken from other
projects, etc.).

No external script is bundled by default. Any future integration must:

- justify the absence of an internal alternative (see `src/core/runtime.js`
  and the framework's "zero dependency" philosophy);
- comply with the security policy set by `src/sanity/base.js` (freezing of
  globals, prototype control, etc.) — adapt the external module as needed
  before integration;
- preserve the original license headers and document the provenance
  (URL, version, hash) in the file or a neighboring `LICENSE.md`.
