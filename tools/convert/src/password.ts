// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * tools/convert/src/password.ts — how the CLI `--password-file` flag and the
 * MCP `pdfPasswordPath` argument turn a password file into the `pdfPassword`
 * bytes `toMd` forwards to `@awacloud/oconv`.
 *
 * Pure: no import, no side effect, and not published under `exports` — this
 * module is internal, reached only by a relative import from `./index.ts`
 * and `./mcp.ts`. It exports exactly one function.
 *
 * A password is read from a file only, never taken as an argument: argv
 * shows in the process list, and an MCP argument in the caller's
 * transcript.
 *
 * @module tool-convert/password
 */

/**
 * A password file's bytes with one trailing line break (`\n` or `\r\n`)
 * removed, so a file written by `echo` holds the password itself. Every
 * other byte is kept, a leading or inner space included.
 */
export function passwordFromFile(bytes: Uint8Array): Uint8Array {
    let end = bytes.length;
    if (end > 0 && bytes[end - 1] === 0x0a) {
        end -= 1;
        if (end > 0 && bytes[end - 1] === 0x0d) end -= 1;
    }
    return bytes.subarray(0, end);
}
