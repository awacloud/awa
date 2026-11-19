# Use case — cryptography in a worker

Keys generated and used inside a Web Worker, behind an RPC API: Ed25519 signatures and ChaCha20-Poly1305 encryption. The page shows the verdicts, including the rejection of a forged message and of a ciphertext with one flipped bit.

## Run

From this directory (no install, no build: the page imports fw's sources
through an import map):

```sh
node ../../_tools/serve.mjs ../../..
```

Then open http://127.0.0.1:4800/playground/usecases/crypto-workers/ — the server's
docroot is the fw package root, so the import map reaches `src/`.

## Files

- `app.js` — `createWorker` runs the crypto service with the modules it names;
  `processRPC` exposes it to the page. An object-valued property would be
  exposed as a namespace of endpoints, so the public key comes from a method.
- A rejected decryption logs one `[crypto] CORRUPT:` line at warn level: it is
  the expected outcome, not an error.
