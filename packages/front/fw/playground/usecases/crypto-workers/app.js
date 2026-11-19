// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// Cryptography in a worker: the keys never leave it. The page calls an RPC
// API and shows the verdicts, including the rejection of tampered data.
import fw from '@awacloud/fw';
import modules from '@awacloud/fw/core/modules.js';

fw.runtime.registerAll(modules);
const rpc = fw.runtime.resolve('processRPC');
const out = document.getElementById('out');

// Serialized into the worker with toString(): it uses `libs` only.
const cryptoService = function ({ libs }) {
    const { ed25519, chacha20poly1305, random, utf8 } = libs;
    const signing = ed25519.keyPair(random.bytes(32));   // Ed25519 key pair
    const aeadKey = random.bytes(32);                     // ChaCha20-Poly1305 key
    // processRPC exposes an object-valued property as a namespace of
    // endpoints, not as a value: bytes come back from a method.
    const api = {
        publicKey() { return signing.publicKey; },
        sign(text) { return ed25519.sign(signing.privateKey, utf8.toBytes(text)); },
        verify(text, signature) { return ed25519.verify(signing.publicKey, signature, utf8.toBytes(text)); },
        seal(text) {
            const nonce = random.bytes(12);
            const { ct, tag } = chacha20poly1305.encrypt(aeadKey, nonce, utf8.toBytes(text));
            return { nonce, ct, tag };
        },
        open({ nonce, ct, tag }) {
            const plain = chacha20poly1305.decrypt(aeadKey, nonce, ct, tag);
            return plain === false ? false : utf8.fromBytes(plain);
        },
    };
    const { port } = libs.processRPC.create(api);
    self.postMessage({ rpcReady: true }, [port[0]]);
};

const worker = fw.createWorker(cryptoService, {
    dependencies: ['processRPC', 'ed25519', 'chacha20poly1305', 'random', 'utf8'],
});

const verdict = (ok) => (ok ? 'accepted' : 'rejected');
const hex = (bytes) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

worker.addEventListener('message', async (e) => {
    if (!e.data || !e.data.rpcReady) return;
    const api = await rpc.open(e.ports[0], { timeout: 10000 });

    const publicKey = await api.publicKey();
    const message = 'Pay 10 EUR to Alice';
    const signature = await api.sign(message);
    const signedOk = await api.verify(message, signature);
    const forgedOk = await api.verify('Pay 99 EUR to Alice', signature);

    const sealed = await api.seal('meet at noon');
    const opened = await api.open(sealed);
    const tampered = { ...sealed, ct: Uint8Array.from(sealed.ct) };
    tampered.ct[0] ^= 0x01;                      // flip one bit of the ciphertext
    const openedTampered = await api.open(tampered);

    out.textContent = [
        `Ed25519 public key        : ${hex(publicKey).slice(0, 32)}…`,
        `signature, same message   : ${verdict(signedOk)}`,
        `signature, changed amount : ${verdict(forgedOk)}`,
        `AEAD decrypt              : "${opened}"`,
        `AEAD, one bit flipped     : ${openedTampered === false ? 'rejected' : 'accepted'}`,
    ].join('\n');
    worker.terminate();
});

worker.onerror = (e) => {
    out.textContent = `worker error: ${e.message}`;
};
