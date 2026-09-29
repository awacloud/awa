// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * ed25519.kat.test.ts — package-local build + zero-import + ABI + RFC 8032 §7.1
 * KAT for the own-layer Ed25519 shim (shims/ed25519.c over the vendored libsodium
 * ref10 closure + the csrc/sha2 SHA-512 seam + the csrc/rng staged-entropy seam,
 * targets.json `ed25519`, productionized from the W6 spike-GO gate BATCH_25/01).
 *
 * Toolchain-gated, mirroring shims/chacha20poly1305.kat.test.ts (PRIOR ART — not
 * imported). When a WASI SDK is discoverable (`WASI_SDK_PATH` env →
 * `discoverWasiSdk()`), this builds the scalar variant (the `ed25519` target is
 * `simd:false` — ref10 is scalar, no simd128 lane) via the frozen `build --pkg`,
 * then:
 *
 *   - asserts the zero-import invariant + the 8 ABI exports
 *     (memory/alloc/free/ed25519_keypair/ed25519_sign/ed25519_verify/rng_stage/
 *      rng_reset),
 *   - runs the RFC 8032 §7.1 ed25519 known-answer test byte-for-byte per vector:
 *       keygen (feed the 32-byte secret seed → ed25519_keypair; derived pk ==
 *       RFC pk), sign (64-byte detached sig == RFC sig, incl. the 1023-byte
 *       multi-block message exercising the incremental SHA-512 seam), verify
 *       (==0 valid; a one-bit-tampered sig → non-zero negative control).
 *
 * The frozen `ed25519_keypair` is SEED-EXPLICIT (it derives from the supplied
 * 32-byte seed via crypto_sign_ed25519_seed_keypair, NOT from the rng seam). The
 * rng seam is still exported (rng_stage/rng_reset) for host entropy staging; this
 * KAT does not rely on it for keygen.
 *
 * The RFC 8032 §7.1 vectors are transcribed verbatim from the spike's run-spike.ts
 * (RFC8032_ED25519 TEST 1/2/3 + RFC8032_ED25519_LONG the 1023-byte message),
 * themselves quoted from references/SPEC/RFC/rfc8032.txt §7.1.
 *
 * Honesty rules (never fabricate a KAT pass):
 *   - no toolchain → assert manifest wiring + RFC text on disk, record the build
 *     + KAT as deferred; do NOT claim a pass.
 *   - any byte mismatch / non-zero status → the test FAILS.
 */

import { describe, test, expect, beforeAll } from "bun:test";
import { join } from "node:path";

import { run as runWasmCrypto, type WasmCryptoConfig } from "../../../../tools/wasm-crypto/src/index.ts";
import { resolveClang, wasmImportNames, wasmExportNames } from "../../../../tools/wasm-crypto/src/cmd/build.ts";
import { discoverWasiSdk } from "../../../../tools/wasm-crypto/build-env/toolchain.ts";
import { AbiHost, type WasmDataModule, type LoadedWasm } from "../../../../tools/wasm-crypto/src/abi-host.ts";
import { validateTargets, type Target } from "../../../../tools/wasm-crypto/src/targets.schema.ts";
import { katDeferral } from "./_kat-toolchain.ts";

// ─── Paths ──────────────────────────────────────────────────────────────────

const SHIMS_DIR = import.meta.dir;
const PKG_DIR = join(SHIMS_DIR, "..");
const REPO_ROOT = join(PKG_DIR, "..", "..", "..");
const TARGETS_FILE = join(PKG_DIR, "targets.json");
const OUT_DIR = join(PKG_DIR, "dist");

const RFC8032_TXT = join(REPO_ROOT, "references/SPEC/RFC/rfc8032.txt");

// ─── ABI constants ────────────────────────────────────────────────────────────

const ABI_EXPORTS = [
    "memory",
    "alloc",
    "free",
    "ed25519_keypair",
    "ed25519_sign",
    "ed25519_verify",
    "rng_stage",
    "rng_reset",
];

// ─── RFC 8032 §7.1 ed25519 test vectors ──────────────────────────────────────
// Each: 32-byte secret key (seed), 32-byte public key, message (hex), 64-byte
// signature. Transcribed verbatim from the W6 spike run-spike.ts (RFC8032_ED25519
// + RFC8032_ED25519_LONG), quoted from references/SPEC/RFC/rfc8032.txt §7.1.

interface Ed25519Vector {
    name: string;
    sk: string; // 32-byte seed
    pk: string; // 32-byte public key
    msg: string; // message (hex; may be empty)
    sig: string; // 64-byte signature
}

const RFC8032_ED25519: Ed25519Vector[] = [
    {
        name: "TEST 1 (empty message)",
        sk: "9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60",
        pk: "d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a",
        msg: "",
        sig:
            "e5564300c360ac729086e2cc806e828a84877f1eb8e5d974d873e06522490155" +
            "5fb8821590a33bacc61e39701cf9b46bd25bf5f0595bbe24655141438e7a100b",
    },
    {
        name: "TEST 2 (1-byte message 0x72)",
        sk: "4ccd089b28ff96da9db6c346ec114e0f5b8a319f35aba624da8cf6ed4fb8a6fb",
        pk: "3d4017c3e843895a92b70aa74d1b7ebc9c982ccf2ec4968cc0cd55f12af4660c",
        msg: "72",
        sig:
            "92a009a9f0d4cab8720e820b5f642540a2b27b5416503f8fb3762223ebdb69da" +
            "085ac1e43e15996e458f3613d0f11d8c387b2eaeb4302aeeb00d291612bb0c00",
    },
    {
        name: "TEST 3 (2-byte message af82)",
        sk: "c5aa8df43f9f837bedb7442f31dcb7b166d38535076f094b85ce3a2e0b4458f7",
        pk: "fc51cd8e6218a1a38da47ed00230f0580816ed13ba3303ac5deb911548908025",
        msg: "af82",
        sig:
            "6291d657deec24024827e69c3abe01a30ce548a284743a445e3680d7db5ac3ac" +
            "18ff9b538d16f290ae67f760984dc6594a7c15e9716ed28dc027beceea1ec40a",
    },
];

// RFC 8032 §7.1 "TEST 1024" — a 1023-byte message exercising a multi-block
// message hash so the incremental crypto_hash_sha512 seam is covered.
const RFC8032_ED25519_LONG: Ed25519Vector = {
    name: "TEST 1024 (1023-byte multi-block message)",
    sk: "f5e5767cf153319517630f226876b86c8160cc583bc013744c6bf255f5cc0ee5",
    pk: "278117fc144c72340f67d0f2316e8386ceffbf2b2428c9c51fef7c597f1d426e",
    msg:
        "08b8b2b733424243760fe426a4b54908632110a66c2f6591eabd3345e3e4eb98" +
        "fa6e264bf09efe12ee50f8f54e9f77b1e355f6c50544e23fb1433ddf73be84d8" +
        "79de7c0046dc4996d9e773f4bc9efe5738829adb26c81b37c93a1b270b20329d" +
        "658675fc6ea534e0810a4432826bf58c941efb65d57a338bbd2e26640f89ffbc" +
        "1a858efcb8550ee3a5e1998bd177e93a7363c344fe6b199ee5d02e82d522c4fe" +
        "ba15452f80288a821a579116ec6dad2b3b310da903401aa62100ab5d1a36553e" +
        "06203b33890cc9b832f79ef80560ccb9a39ce767967ed628c6ad573cb116dbef" +
        "efd75499da96bd68a8a97b928a8bbc103b6621fcde2beca1231d206be6cd9ec7" +
        "aff6f6c94fcd7204ed3455c68c83f4a41da4af2b74ef5c53f1d8ac70bdcb7ed1" +
        "85ce81bd84359d44254d95629e9855a94a7c1958d1f8ada5d0532ed8a5aa3fb2" +
        "d17ba70eb6248e594e1a2297acbbb39d502f1a8c6eb6f1ce22b3de1a1f40cc24" +
        "554119a831a9aad6079cad88425de6bde1a9187ebb6092cf67bf2b13fd65f270" +
        "88d78b7e883c8759d2c4f5c65adb7553878ad575f9fad878e80a0c9ba63bcbcc" +
        "2732e69485bbc9c90bfbd62481d9089beccf80cfe2df16a2cf65bd92dd597b07" +
        "07e0917af48bbb75fed413d238f5555a7a569d80c3414a8d0859dc65a46128ba" +
        "b27af87a71314f318c782b23ebfe808b82b0ce26401d2e22f04d83d1255dc51a" +
        "ddd3b75a2b1ae0784504df543af8969be3ea7082ff7fc9888c144da2af58429e" +
        "c96031dbcad3dad9af0dcbaaaf268cb8fcffead94f3c7ca495e056a9b47acdb7" +
        "51fb73e666c6c655ade8297297d07ad1ba5e43f1bca32301651339e22904cc8c" +
        "42f58c30c04aafdb038dda0847dd988dcda6f3bfd15c4b4c4525004aa06eeff8" +
        "ca61783aacec57fb3d1f92b0fe2fd1a85f6724517b65e614ad6808d6f6ee34df" +
        "f7310fdc82aebfd904b01e1dc54b2927094b2db68d6f903b68401adebf5a7e08" +
        "d78ff4ef5d63653a65040cf9bfd4aca7984a74d37145986780fc0b16ac451649" +
        "de6188a7dbdf191f64b5fc5e2ab47b57f7f7276cd419c17a3ca8e1b939ae49e4" +
        "88acba6b965610b5480109c8b17b80e1b7b750dfc7598d5d5011fd2dcc5600a3" +
        "2ef5b52a1ecc820e308aa342721aac0943bf6686b64b2579376504ccc493d97e" +
        "6aed3fb0f9cd71a43dd497f01f17c0e2cb3797aa2a2f256656168e6c496afc5f" +
        "b93246f6b1116398a346f1a641f3b041e989f7914f90cc2c7fff357876e506b5" +
        "0d334ba77c225bc307ba537152f3f1610e4eafe595f6d9d90d11faa933a15ef1" +
        "369546868a7f3a45a96768d40fd9d03412c091c6315cf4fde7cb68606937380d" +
        "b2eaaa707b4c4185c32eddcdd306705e4dc1ffc872eeee475a64dfac86aba41c" +
        "0618983f8741c5ef68d3a101e8a3b8cac60c905c15fc910840b94c00a0b9d0",
    sig:
        "0aab4c900501b3e24d7cdf4663326a3a87df5e4843b2cbdb67cbf6e460fec350" +
        "aa5371b1508f9f4528ecea23c436d94b5e8fcd4f681e30a6ac00a9704a188a03",
};

const ED_VECTORS: Ed25519Vector[] = [...RFC8032_ED25519, RFC8032_ED25519_LONG];

// ─── Helpers ────────────────────────────────────────────────────────────────

function hexToBytes(hex: string): Uint8Array {
    if (hex.length === 0) return new Uint8Array(0);
    const out = new Uint8Array(hex.length / 2);
    for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    return out;
}

function bytesToHex(b: Uint8Array): string {
    let s = "";
    for (let i = 0; i < b.length; i++) s += b[i].toString(16).padStart(2, "0");
    return s;
}

async function makeConfig(wasiSdkPath: string): Promise<WasmCryptoConfig> {
    return {
        wasiSdkPath,
        srcDir: PKG_DIR,
        outDir: OUT_DIR,
        targetsFile: TARGETS_FILE,
        pkgDir: PKG_DIR,
    };
}

/** Load the scalar variant directly from its raw `.wasm` bytes. */
async function loadScalar(host: AbiHost): Promise<LoadedWasm> {
    const bytes = new Uint8Array(await Bun.file(join(OUT_DIR, "ed25519.scalar.wasm")).arrayBuffer());
    const dataModule: WasmDataModule = {
        name: "ed25519Wasm",
        type: "fw.crypto.wasm.data",
        bytes,
        abi: "1",
        simd: false,
    };
    return host.load(dataModule);
}

/** Allocate `n` bytes of scratch in linear memory; returns the pointer. */
function allocOut(loaded: LoadedWasm, n: number): number {
    return (loaded.exports["alloc"] as (n: number) => number)(n);
}

/** Write `bytes` into freshly allocated linear memory; returns the pointer. */
function stageBytes(host: AbiHost, loaded: LoadedWasm, bytes: Uint8Array): number {
    // host.withBytes can't return a stable pointer past .free(); use alloc+write
    // so all buffers stay live for the whole vector (the arena never frees).
    const ptr = allocOut(loaded, bytes.length || 1);
    if (bytes.length) new Uint8Array(loaded.mem.buffer, ptr, bytes.length).set(bytes);
    return ptr;
}

/** Run the full RFC 8032 §7.1 KAT (keygen + sign + verify±) on the loaded module. */
function runRfcKat(host: AbiHost, loaded: LoadedWasm): void {
    for (const v of ED_VECTORS) {
        const seed = hexToBytes(v.sk);
        const msg = hexToBytes(v.msg);
        const expectedPk = hexToBytes(v.pk);
        const expectedSig = hexToBytes(v.sig);

        // ── keygen: seed-explicit ed25519_keypair(seedPtr, pkPtr, skPtr). ──
        const seedPtr = stageBytes(host, loaded, seed);
        const pkPtr = allocOut(loaded, 32);
        const skPtr = allocOut(loaded, 64);
        const kgRc = host.run(loaded, "ed25519_keypair", [seedPtr, pkPtr, skPtr]);
        expect(kgRc, `[${v.name}] ed25519_keypair rc`).toBe(0);
        const pk = host.readBytes(loaded, pkPtr, 32);
        expect(bytesToHex(pk), `[${v.name}] derived pk == RFC pk`).toBe(bytesToHex(expectedPk));

        // ── sign: ed25519_sign(skPtr, msgPtr, msgLen, sigPtr) → 64-byte sig. ──
        const msgPtr = stageBytes(host, loaded, msg);
        const sigPtr = allocOut(loaded, 64);
        const signRc = host.run(loaded, "ed25519_sign", [skPtr, msgPtr, msg.length, sigPtr]);
        expect(signRc, `[${v.name}] ed25519_sign rc`).toBe(0);
        const sig = host.readBytes(loaded, sigPtr, 64);
        expect(bytesToHex(sig), `[${v.name}] detached sig == RFC sig`).toBe(bytesToHex(expectedSig));

        // ── verify: ed25519_verify(pkPtr, sigPtr, msgPtr, msgLen) == 0 valid. ──
        // (Frozen ABI order: sig BEFORE msg — verbatim from shims/sodium.c.)
        const okRc = host.run(loaded, "ed25519_verify", [pkPtr, sigPtr, msgPtr, msg.length]);
        expect(okRc, `[${v.name}] ed25519_verify accepts the RFC signature`).toBe(0);

        // ── negative control: flip one signature bit → must reject (non-zero). ──
        const tampered = new Uint8Array(expectedSig);
        tampered[0] ^= 0x01;
        const tPtr = stageBytes(host, loaded, tampered);
        const badRc = host.run(loaded, "ed25519_verify", [pkPtr, tPtr, msgPtr, msg.length]);
        expect(badRc, `[${v.name}] ed25519_verify rejects a tampered signature`).not.toBe(0);
    }
}

// ─── Toolchain discovery ──────────────────────────────────────────────────────

let wasiSdkPath = "";
let toolchainPresent = false;

beforeAll(async () => {
    const envPath = process.env["WASI_SDK_PATH"];
    wasiSdkPath = envPath ? envPath : ((await discoverWasiSdk()) ?? "");
    if (wasiSdkPath) {
        const clang = await resolveClang(await makeConfig(wasiSdkPath));
        toolchainPresent = clang !== null;
    }
});

// ─── Manifest + source presence (toolchain-independent) ───────────────────────

describe("ed25519 manifest wiring", () => {
    test("targets.json `ed25519` retargeted to shims/ed25519.c over libsodium ref10", async () => {
        const targets: Target[] = validateTargets(JSON.parse(await Bun.file(TARGETS_FILE).text()));
        const t = targets.find(x => x.wasmModule === "ed25519");
        expect(t, "no ed25519 target").toBeDefined();
        // 17-module count preserved.
        expect(targets.length).toBe(17);
        // Own-layer over vendored libsodium.
        expect(t!.source).toBe("libsodium");
        expect(t!.sourceKind).toBe("vendored");
        expect(t!.shim).toBe("shims/ed25519.c");
        // The vendored ref10 closure + the SHA-512/rng seams are compiled in.
        expect(t!.cSources.some(c => c.includes("crypto_sign/ed25519/ref10/keypair.c"))).toBe(true);
        expect(t!.cSources.some(c => c.includes("crypto_sign/ed25519/ref10/sign.c"))).toBe(true);
        expect(t!.cSources.some(c => c.includes("crypto_sign/ed25519/ref10/open.c"))).toBe(true);
        expect(t!.cSources.some(c => c.includes("crypto_core/ed25519/ref10/ed25519_ref10.c"))).toBe(true);
        expect(t!.cSources.some(c => c.includes("csrc/libsodium-compat/sodium_sha512_seam.c"))).toBe(true);
        expect(t!.cSources.some(c => c.includes("csrc/libsodium-compat/sodium_util_seam.c"))).toBe(true);
        expect(t!.cSources.some(c => c.includes("csrc/sha2/sha2.c"))).toBe(true);
        expect(t!.cSources.some(c => c.includes("csrc/rng/rng.c"))).toBe(true);
        // fe_25_5 path: NATIVE_LITTLE_ENDIAN, no HAVE_TI_MODE; vendored ref10 → c11.
        expect(t!.cStd).toBe("c11");
        expect(t!.cflags.join(" ")).toContain("-DNATIVE_LITTLE_ENDIAN");
        expect(t!.cflags.join(" ")).not.toContain("HAVE_TI_MODE");
        // compat AHEAD of vendor on package-qualified -I.
        const flags = t!.cflags;
        const compatIdx = flags.findIndex(f => f.includes("csrc/libsodium-compat"));
        const vendorIdx = flags.findIndex(f => f === "-Ipackages/front/fw-wasm-crypto/vendor/libsodium");
        expect(compatIdx).toBeGreaterThanOrEqual(0);
        expect(vendorIdx).toBeGreaterThan(compatIdx);
        // Scalar only (ref10 has no simd128 lane).
        expect(t!.simd).toBe(false);
        // The frozen 8-export ABI (3 ed25519 ops + arena + rng seam).
        for (const e of ABI_EXPORTS) expect(t!.exports).toContain(e);
        // Corrected vectors path (stale rfc8032-ed25519.json → rfc8032.txt).
        expect(t!.vectors).toContain("references/SPEC/RFC/rfc8032.txt");
    });

    test("RFC 8032 spec text exists on disk (KAT anchor)", async () => {
        expect(await Bun.file(RFC8032_TXT).exists()).toBe(true);
    });

    test("shim exports the FROZEN 3-export ABI (seed-explicit keypair)", async () => {
        const src = await Bun.file(join(SHIMS_DIR, "ed25519.c")).text();
        expect(src).toContain("int ed25519_keypair(const uint8_t* seedPtr");
        expect(src).toContain("int ed25519_sign(const uint8_t* skPtr");
        expect(src).toContain("int ed25519_verify(const uint8_t* pkPtr");
        // Seed-explicit derivation (NOT the spike's rng path).
        expect(src).toContain("crypto_sign_ed25519_seed_keypair");
        // Shares the package arena + the rng seam header.
        expect(src).toContain('#include "_arena.h"');
        expect(src).toContain('#include "csrc/rng/rng.h"');
        // No <sodium.h> include, no export_name wrapper on the rng seam.
        expect(src).not.toContain("#include <sodium.h>");
        expect(src).not.toContain('export_name("rng_stage")');
    });
});

// ─── Build + KAT (toolchain-gated) ────────────────────────────────────────────

describe("ed25519 build + RFC 8032 §7.1 KAT (toolchain-gated)", () => {
    test("builds scalar, zero imports, ABI exports, RFC §7.1 keygen+sign+verify±", async () => {
        if (katDeferral("ed25519", toolchainPresent, "RFC 8032 §7.1 KAT")) return;

        const cfg = await makeConfig(wasiSdkPath);

        // ── Build the scalar variant (simd:false → scalar only). ──
        const code = await runWasmCrypto({
            args: ["build", "--pkg", PKG_DIR, "--target", "ed25519"],
            config: cfg,
        });
        expect(code, "wasm-crypto build ed25519 exit code").toBe(0);

        // ── Zero-import + ABI-export invariants on the produced binary. ──
        const bytes = new Uint8Array(await Bun.file(join(OUT_DIR, "ed25519.scalar.wasm")).arrayBuffer());
        const imports = await wasmImportNames(bytes);
        expect(imports, "ed25519 scalar must import nothing").toEqual([]);
        const exports = await wasmExportNames(bytes);
        for (const e of ABI_EXPORTS) {
            expect(exports.has(e), `scalar missing export ${e}`).toBe(true);
        }

        // ── RFC 8032 §7.1 KAT through the emitted scalar variant. ──
        const host = new AbiHost();
        const scalar = await loadScalar(host);
        runRfcKat(host, scalar);

        console.warn(
            `[ed25519.kat] RFC 8032 §7.1 byte-for-byte OK (keygen + sign + verify±) ` +
                `on ${ED_VECTORS.length} vectors (incl. the 1023-byte multi-block message).`,
        );
    }, 120_000);
});
