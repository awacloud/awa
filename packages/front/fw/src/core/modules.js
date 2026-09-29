// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// packages/front/fw/src/core/modules.js
import { processMessage } from '../process/message.js';
import { processRPC } from '../process/rpc.js';
import { workerPool } from '../process/workerPool.js';

// dom/display
import { animate } from '../dom/display/animate.js';
import { fullscreen } from '../dom/display/fullscreen.js';

// dom/fs
import { download } from '../dom/fs/download.js';
import { fsAccess } from '../dom/fs/fsAccess.js';
import { indexedDB } from '../dom/fs/indexedDB.js';
import { remoteStore } from '../dom/fs/remoteStore.js';
import { storage } from '../dom/fs/storage.js';

// dom/lifecycle
import { visibility } from '../dom/lifecycle/visibility.js';
import { idle } from '../dom/lifecycle/idle.js';
import { wakeLock } from '../dom/lifecycle/wakeLock.js';

// dom/net
import { ajax } from '../dom/net/ajax.js';
import { ws } from '../dom/net/ws.js';
import { sse } from '../dom/net/sse.js';
import { webrtc } from '../dom/net/webrtc.js';
import { broadcastChannel } from '../dom/net/broadcastChannel.js';
import { network } from '../dom/net/network.js';

// dom/query
import { dnd } from '../dom/query/dnd.js';
import { dom } from '../dom/query/dom.js';
import { events } from '../dom/query/events.js';
import { gesture } from '../dom/query/gesture.js';
import { media } from '../dom/query/media.js';

// dom/rendering
import { chart } from '../dom/rendering/chart.js';
import { component } from '../dom/rendering/component.js';
import { devtools }  from '../dom/rendering/devtools.js';
import { devtoolsUI } from '../dom/rendering/devtools-ui.js';
import { parser } from '../dom/rendering/parser.js';
import { reactiveBind } from '../dom/rendering/reactiveBind.js';
import { render } from '../dom/rendering/render.js';
import { sanitize } from '../dom/rendering/sanitize.js';
import { secPolicy } from '../dom/rendering/secPolicy.js';
import { template } from '../dom/rendering/template.js';
import { themeTokens } from '../dom/rendering/themeTokens.js';
import { uiSession } from '../dom/rendering/uiSession.js';
import { uiSessionCore }   from '../dom/rendering/uiSession-core.js';
import { uiSessionDirect } from '../dom/rendering/uiSession-direct.js';
import { uiSessionList }   from '../dom/rendering/uiSession-list.js';
import { virtualScroll } from '../dom/rendering/virtualScroll.js';

// dom/sensors
import { geolocation } from '../dom/sensors/geolocation.js';
import { battery } from '../dom/sensors/battery.js';
import { networkInfo } from '../dom/sensors/networkInfo.js';
import { sensors } from '../dom/sensors/sensors.js';

// dom/sw
import { backgroundSync } from '../dom/sw/backgroundSync.js';
import { cache } from '../dom/sw/cache.js';
import { push } from '../dom/sw/push.js';
import { serviceWorker } from '../dom/sw/serviceWorker.js';
import { sharedWorker } from '../dom/sw/sharedWorker.js';

// dom/utils
import { a11y } from '../dom/utils/a11y.js';
import { clipboard } from '../dom/utils/clipboard.js';
import { entropyCollector } from '../dom/utils/entropyCollector.js';
import { focus } from '../dom/utils/focus.js';
import { form } from '../dom/utils/form.js';
import { formKit } from '../dom/utils/formKit.js';
import { keybindings } from '../dom/utils/keybindings.js';
import { leaderElection } from '../dom/utils/leaderElection.js';
import { notifications } from '../dom/utils/notifications.js';
import { permissions } from '../dom/utils/permissions.js';
import { route } from '../dom/utils/route.js';
import { ua } from '../dom/utils/ua.js';
import { webauthn } from '../dom/utils/webauthn.js';

// io/binary
import { binaryReader } from '../io/binary/reader.js';
import { binaryWriter } from '../io/binary/writer.js';

// io/calc
import { easing }   from '../io/calc/easing.js';
import { crc32 }    from '../io/calc/crc32.js';
import { adler32 }  from '../io/calc/adler32.js';
import { bigint }   from '../io/calc/bigint.js';

// io/codec
import { b64 } from '../io/codec/b64.js';
import { base32 } from '../io/codec/base32.js';
import { base58 } from '../io/codec/base58.js';
import { buffer } from '../io/codec/buffer.js';
import { cbor } from '../io/codec/cbor.js';
import { csv } from '../io/codec/csv.js';
import { hex } from '../io/codec/hex.js';
import { mime } from '../io/codec/mime.js';
import { msgpack } from '../io/codec/msgpack.js';
import { url } from '../io/codec/url.js';
import { utf8 } from '../io/codec/utf8.js';
import { xml } from '../io/codec/xml.js';

// io/compress
import { lz4 }      from '../io/compress/lz4.js';
import { bitstream } from '../io/compress/bitstream.js';
import { huffman }  from '../io/compress/huffman.js';
import { lz77 }     from '../io/compress/lz77.js';
import { lzw }      from '../io/compress/lzw.js';
import { deflate }  from '../io/compress/deflate.js';
import { gzip }     from '../io/compress/gzip.js';
import { zlib }     from '../io/compress/zlib.js';
import { zip }      from '../io/compress/zip.js';
import { brotliDict } from '../io/compress/brotli_dict.js';
import { brotliDictWords } from '../io/compress/brotli_dict_words.js';
import { brotli }   from '../io/compress/brotli.js';
import { brotliShared } from '../io/compress/brotli_shared.js';
import { brotliFrame } from '../io/compress/brotli_frame.js';

// io/i18n
import { i18n } from '../io/i18n/i18n.js';

// io/Math
import { linalg }   from '../io/math/linalg.js';
import { stats }    from '../io/math/stats.js';
import { geom }     from '../io/math/geom.js';
import { interp }   from '../io/math/interp.js';
import { fixedPoint } from '../io/math/fixed-point.js';

// io/structures
import { lruCache } from '../io/structures/lruCache.js';
import { heap } from '../io/structures/heap.js';
import { ringBuffer } from '../io/structures/ringBuffer.js';
import { trie } from '../io/structures/trie.js';
import { btree } from '../io/structures/btree.js';
import { treeWalker } from '../io/structures/tree-walker.js';

// io/sync
import { abort } from '../io/sync/abort.js';
import { mutex } from '../io/sync/mutex.js';
import { semaphore } from '../io/sync/semaphore.js';
import { channel } from '../io/sync/channel.js';
import { atomics } from '../io/sync/atomics.js';
import { cancellable } from '../io/sync/cancellable.js';
import { tokenBucket } from '../io/sync/tokenBucket.js';

// io/text
import { ansi } from '../io/text/ansi.js';
import { htmlEntities } from '../io/text/html-entities.js';
import { semver } from '../io/text/semver.js';
import { str } from '../io/text/str.js';
import { unicode } from '../io/text/unicode.js';

// io/time
import { date } from '../io/time/date.js';

// io/timing
import { clock } from '../io/timing/clock.js';
import { rateLimit } from '../io/timing/rateLimit.js';
import { scheduler } from '../io/timing/scheduler.js';

// io/utils
import { errors } from '../io/utils/errors.js';
import { eventBus } from '../io/utils/eventBus.js';
import { bitmap } from '../io/utils/bitmap.js';
import { queue } from '../io/utils/queue.js';
import { signal } from '../io/utils/signal.js';
import { ui8 } from '../io/utils/ui8.js';
import { valid } from '../io/utils/valid.js';

// crypto/cipher
import { aes } from '../crypto/cipher/aes.js';
import { chacha20 } from '../crypto/cipher/chacha20.js';

// crypto/hash
import { sha256 } from '../crypto/hash/sha256.js';
import { sha224 } from '../crypto/hash/sha224.js';
import { sha512 } from '../crypto/hash/sha512.js';
import { sha512_224 } from '../crypto/hash/sha512_224.js';
import { sha512_256 } from '../crypto/hash/sha512_256.js';
import { sha384 } from '../crypto/hash/sha384.js';
import { hmac } from '../crypto/hash/hmac.js';
import { pbkdf2 } from '../crypto/hash/pbkdf2.js';
import { hkdf } from '../crypto/hash/hkdf.js';
import { sha3 } from '../crypto/hash/sha3.js';
import { adf } from '../crypto/hash/adf.js';
import { poly1305 } from '../crypto/hash/poly1305.js';
import { blake2b } from '../crypto/hash/blake2b.js';
import { argon2 } from '../crypto/hash/argon2.js';

// crypto/mode
import { ctr } from '../crypto/mode/ctr.js';
import { cbc } from '../crypto/mode/cbc.js';
import { gcm } from '../crypto/mode/gcm.js';
import { cmac } from '../crypto/mode/cmac.js';
import { kw } from '../crypto/mode/kw.js';
import { chacha20poly1305 } from '../crypto/mode/chacha20poly1305.js';

// crypto/pkc
import { ecc } from '../crypto/pkc/ecc.js';
import { x25519 } from '../crypto/pkc/x25519.js';
import { ed25519 } from '../crypto/pkc/ed25519.js';
import { rsa } from '../crypto/pkc/rsa.js';
import { ml_kem } from '../crypto/pkc/ml_kem.js';
import { ml_dsa } from '../crypto/pkc/ml_dsa.js';
import { slh_dsa } from '../crypto/pkc/slh_dsa.js';
import { hybridKem } from '../crypto/pkc/hybridKem.js';
import { hybridSign } from '../crypto/pkc/hybridSign.js';

// crypto/utils
import { bitArray } from '../crypto/utils/bitArray.js';
import { asn1 } from '../crypto/utils/asn1.js';
import { asn1Oid } from '../crypto/utils/asn1-oid.js';
import { pem } from '../crypto/utils/pem.js';
import { aes_modes } from '../crypto/utils/aes_modes.js';
import { bn } from '../crypto/utils/bn.js';
import { pad } from '../crypto/utils/pad.js';
import { random } from '../crypto/utils/random.js';
import { aes_ctr } from '../crypto/utils/aes_ctr.js';
import { uuid } from '../crypto/utils/uuid.js';
import { rsaKeygen } from '../crypto/utils/rsaKeygen.js';
import { jws } from '../crypto/utils/jws.js';
import { keyformat } from '../crypto/utils/keyformat.js';
import { totp } from '../crypto/utils/totp.js';

// crypto/webcrypto
import { webcryptoDigest } from '../crypto/webcrypto/digest.js';
import { webcryptoHmac } from '../crypto/webcrypto/hmac.js';
import { webcryptoPbkdf2 } from '../crypto/webcrypto/pbkdf2.js';
import { webcryptoHkdf } from '../crypto/webcrypto/hkdf.js';
import { webcryptoAes } from '../crypto/webcrypto/aes.js';
import { webcryptoAesKw } from '../crypto/webcrypto/aeskw.js';
import { webcryptoRsa } from '../crypto/webcrypto/rsa.js';
import { webcryptoEcc } from '../crypto/webcrypto/ecc.js';
import { webcryptoEd25519 } from '../crypto/webcrypto/ed25519.js';
import { webcryptoX25519 } from '../crypto/webcrypto/x25519.js';

// crypto/wasm
import { wasmRuntime } from '../crypto/wasm/runtime.js';
import { wasmArgon2 } from '../crypto/wasm/argon2.js';
import { wasmMlKem } from '../crypto/wasm/ml_kem.js';
import { wasmMlDsa } from '../crypto/wasm/ml_dsa.js';
import { wasmSlhDsa } from '../crypto/wasm/slh_dsa.js';
import { wasmSha3 } from '../crypto/wasm/sha3.js';
import { wasmBlake2b } from '../crypto/wasm/blake2b.js';
import { wasmChacha20poly1305 } from '../crypto/wasm/chacha20poly1305.js';
import { wasmCmac } from '../crypto/wasm/cmac.js';
import { wasmSha2 } from '../crypto/wasm/sha2.js';
import { wasmHmac } from '../crypto/wasm/hmac.js';
import { wasmPbkdf2 } from '../crypto/wasm/pbkdf2.js';
import { wasmHkdf } from '../crypto/wasm/hkdf.js';
import { wasmAes } from '../crypto/wasm/aes.js';
import { wasmRsa } from '../crypto/wasm/rsa.js';
import { wasmEcc } from '../crypto/wasm/ecc.js';
import { wasmEd25519 } from '../crypto/wasm/ed25519.js';
import { wasmX25519 } from '../crypto/wasm/x25519.js';

/* dev_only */
// import here isn't loaded in prod

/* !dev_only */

export default [
    processMessage, processRPC, workerPool, clock, rateLimit, scheduler, sse, webrtc, broadcastChannel, network,
    backgroundSync, cache, push, serviceWorker, sharedWorker, date, i18n, ansi, htmlEntities, semver, str, unicode,
    lruCache, heap, ringBuffer, trie, btree, treeWalker, abort, mutex, semaphore, channel, atomics, cancellable,
    tokenBucket, binaryReader, binaryWriter, easing, crc32, adler32, bigint, linalg, stats, geom, interp, fixedPoint,
    geolocation, battery, networkInfo, sensors, a11y, focus, form, formKit, keybindings, leaderElection, notifications,
    permissions, route, webauthn, visibility, idle, wakeLock, lz4, bitstream, huffman, lz77, lzw, deflate, gzip, zlib,
    zip, brotliDict, brotliDictWords, brotli, brotliShared, brotliFrame, b64, base32, base58, buffer, cbor, csv, hex,
    mime, msgpack, url, utf8, xml, errors, eventBus, bitmap, queue, signal, ui8, uuid, valid, chart, component, parser,
    reactiveBind, render, sanitize, secPolicy, template, themeTokens, devtools, devtoolsUI, uiSession, uiSessionCore, uiSessionDirect,
    uiSessionList, virtualScroll, dnd, dom, events, gesture, media, animate, fullscreen, download, fsAccess,
    indexedDB, remoteStore, storage, ajax, ws, entropyCollector, clipboard, ua, bitArray, asn1, asn1Oid, pem,
    aes_modes, bn, pad, random, aes_ctr, sha256, sha224, sha512, sha512_224, sha512_256, sha384, hmac, pbkdf2,
    hkdf, sha3, adf, poly1305, blake2b, argon2, aes, chacha20, ctr, cbc, gcm, cmac, kw, chacha20poly1305, ecc,
    x25519, ed25519, rsa, ml_kem, ml_dsa, slh_dsa, hybridKem, hybridSign, rsaKeygen, jws, keyformat, totp,
    webcryptoDigest, webcryptoHmac, webcryptoPbkdf2, webcryptoHkdf, webcryptoAes, webcryptoAesKw, webcryptoRsa,
    webcryptoEcc, webcryptoEd25519, webcryptoX25519,
    wasmRuntime, wasmArgon2, wasmMlKem, wasmMlDsa, wasmSlhDsa, wasmSha3, wasmBlake2b, wasmChacha20poly1305,
    wasmCmac, wasmSha2, wasmHmac, wasmPbkdf2, wasmHkdf, wasmAes, wasmRsa, wasmEcc, wasmEd25519, wasmX25519
];