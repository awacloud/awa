// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview `media.frame` — the frame around each unit the media codecs
 * send (row B5a, ruling D19).
 *
 * A frame is one message (a port's, a datagram's): a 12-byte header, then
 * the payload to the end. Big-endian.
 *
 * | Bytes | Field |
 * |---|---|
 * | 0 | version (high 4 bits, 1), kind (2 bits: 0 audio, 1 video), 2 bits reserved, zero |
 * | 1 | flags: bit 0 deflated, bit 1 encrypted (row B5c); the others reserved, zero |
 * | 2 | layer: a video unit's type (`video.pack`), 0 for audio |
 * | 3 | key id (row B5c; 0 in the clear) |
 * | 4–7 | sequence, 32 bits, counted per layer |
 * | 8–11 | media time, 32 bits, in the link's own unit; the units of one picture share it |
 *
 * The sequence counts per layer, not per stream: a layer a relay drops
 * leaves no gap in the others, and (key id, layer, sequence) stays unique
 * for a cipher's nonce.
 *
 * The lossless stage is an option of the writer: it deflates each payload
 * and keeps the deflated bytes only when they are smaller, the flag saying
 * which. The DEFLATE is the fw `deflate` module (`deflateSync`,
 * `inflateSync`), given by the caller: this module imports nothing.
 *
 * `header(frame)` is a relay's view: the 12 bytes, without the payload.
 * `read` inflates at most `maxPayload` bytes (`MAX_PAYLOAD`, 16 MiB, unless
 * given): a deflated payload from a hostile peer cannot grow past it.
 * `createTracker()` counts, per layer, the frames missing before each one
 * that comes, a late one and a repeat — across the 2³² wrap. A sequence
 * more than `RESYNC` (2¹⁶) away from the last one, ahead or behind, starts
 * the layer again (`resync`): a forged or damaged number cannot freeze a
 * layer, and a sender that started again from 0 is followed. `forget(layer)`
 * starts a layer again by hand — for a layer a relay stopped dropping, whose
 * gap is not a loss. The first frame of a layer counts no loss before it.
 * A frame behind the last one is `late` (a repeat of an older one too), and
 * a frame counted missing that comes late is counted again as late.
 */

/**
 * @typedef {object} FrameHeader
 * @property {number} version
 * @property {'audio'|'video'} kind
 * @property {number} layer
 * @property {number} keyId
 * @property {number} sequence
 * @property {number} time
 * @property {boolean} deflated
 * @property {boolean} encrypted
 */

/**
 * @typedef {{ deflateSync: (data: Uint8Array, options?: { level?: number }) => Uint8Array, inflateSync: (data: Uint8Array) => Uint8Array }} Deflate
 */

/**
 * @typedef {object} FrameApi
 * @property {number} HEADER The header's length in bytes.
 * @property {number} VERSION
 * @property {(options: { kind: 'audio'|'video', keyId?: number, deflate?: Deflate, lossless?: boolean|{ level?: number }, start?: number }) => { write: (payload: Uint8Array, at: { layer?: number, time: number }) => Uint8Array }} createWriter
 * @property {(frame: Uint8Array) => FrameHeader} header
 * @property {number} MAX_PAYLOAD The most bytes `read` inflates unless told otherwise.
 * @property {number} RESYNC The distance beyond which a sequence starts its layer again.
 * @property {(frame: Uint8Array, options?: { deflate?: Deflate, maxPayload?: number }) => FrameHeader & { payload: Uint8Array }} read
 *   The payload of a frame stored as it was is a view on the frame's own buffer.
 * @property {() => { accept: (at: { layer: number, sequence: number }) => { missing: number, late: boolean, repeat: boolean, resync: boolean }, forget: (layer: number) => void, counts: { frames: number, missing: number, late: number, repeats: number, resyncs: number } }} createTracker
 */

export const frameModule = {
    name: 'media.frame',
    version: '0.2.0',
    type: 'lib.media.stream',
    dependencies: [],
    deps: [],

    /** @returns {FrameApi} */
    factory() {
        const HEADER = 12;
        const VERSION = 1;
        const KINDS = ['audio', 'video'];
        const DEFLATED = 1;
        const ENCRYPTED = 2;
        const WRAP = 2 ** 32;
        /** The level of every bench table. */
        const LEVEL = 6;
        const MAX_PAYLOAD = 16 * 2 ** 20;
        const RESYNC = 2 ** 16;
        /** The inflate's output, grown by doubling up to the cap a read allows, and kept. */
        let scratch = new Uint8Array(65536);

        const byte = (value, what) => {
            if (!Number.isInteger(value) || value < 0 || value > 255) throw new RangeError(`media.frame: ${what} ${value}, 0 to 255`);
            return value;
        };
        const word = (value, what) => {
            if (!Number.isInteger(value) || value < 0 || value >= WRAP) throw new RangeError(`media.frame: ${what} ${value}, 0 to 2^32 - 1`);
            return value;
        };

        function createWriter({ kind, keyId = 0, deflate = null, lossless = false, start = 0 }) {
            const k = KINDS.indexOf(kind);
            if (k < 0) throw new RangeError(`media.frame: kind ${kind}, audio or video`);
            byte(keyId, 'key id');
            word(start, 'start');
            let level = null;
            if (lossless !== false && lossless !== true && (lossless === null || typeof lossless !== 'object')) throw new RangeError(`media.frame: lossless ${lossless}, true, false or { level }`);
            if (lossless) {
                if (!deflate) throw new Error('media.frame: lossless asked, but no deflate was given');
                level = lossless === true ? LEVEL : lossless.level ?? LEVEL;
                if (!Number.isInteger(level) || level < 0 || level > 9) throw new RangeError(`media.frame: deflate level ${level}, 0 to 9`);
            }
            /** The next sequence of each layer. */
            const next = new Map();
            return {
                write(payload, { layer = 0, time }) {
                    if (!(payload instanceof Uint8Array)) throw new TypeError('media.frame: a payload is a Uint8Array');
                    byte(layer, 'layer');
                    word(time, 'time');
                    let body = payload;
                    let flags = 0;
                    if (level !== null) {
                        const packed = deflate.deflateSync(payload, { level });
                        if (packed.length < payload.length) {
                            body = packed;
                            flags |= DEFLATED;
                        }
                    }
                    const sequence = next.has(layer) ? next.get(layer) : start;
                    next.set(layer, (sequence + 1) % WRAP);
                    const out = new Uint8Array(HEADER + body.length);
                    const view = new DataView(out.buffer);
                    out[0] = (VERSION << 4) | (k << 2);
                    out[1] = flags;
                    out[2] = layer;
                    out[3] = keyId;
                    view.setUint32(4, sequence);
                    view.setUint32(8, time);
                    out.set(body, HEADER);
                    return out;
                },
            };
        }

        function header(frame) {
            if (!(frame instanceof Uint8Array) || frame.length < HEADER) throw new RangeError(`media.frame: a frame too short (${frame && frame.length} bytes, a header is ${HEADER})`);
            const version = frame[0] >> 4;
            if (version !== VERSION) throw new RangeError(`media.frame: version ${version}, this reader knows ${VERSION}`);
            if (frame[0] & 3) throw new RangeError('media.frame: reserved bits set in byte 0');
            const kind = KINDS[(frame[0] >> 2) & 3];
            if (!kind) throw new RangeError(`media.frame: kind ${(frame[0] >> 2) & 3} unknown`);
            if (frame[1] & ~(DEFLATED | ENCRYPTED)) throw new RangeError('media.frame: reserved flags set');
            const view = new DataView(frame.buffer, frame.byteOffset, HEADER);
            return {
                version,
                kind,
                layer: frame[2],
                keyId: frame[3],
                sequence: view.getUint32(4),
                time: view.getUint32(8),
                deflated: Boolean(frame[1] & DEFLATED),
                encrypted: Boolean(frame[1] & ENCRYPTED),
            };
        }

        /** Inflates into a buffer that grows up to `cap`: past it, the payload is refused. */
        function inflate(deflate, payload, cap) {
            for (;;) {
                const room = Math.min(cap, scratch.length);
                try {
                    return deflate.inflateSync(payload, { out: scratch.subarray(0, room) }).slice();
                } catch (error) {
                    const message = String(error && error.message ? error.message : error);
                    // Only an output too large for the buffer grows it; a damaged stream is refused at once.
                    if (!/exceeds provided buffer/.test(message)) throw new RangeError(`media.frame: the payload does not inflate (${message})`, { cause: error });
                    if (room >= cap) throw new RangeError(`media.frame: the payload inflates past maxPayload ${cap}`, { cause: error });
                    scratch = new Uint8Array(Math.min(cap, scratch.length * 2));
                }
            }
        }

        function read(frame, { deflate = null, maxPayload = MAX_PAYLOAD } = {}) {
            if (!(Number.isInteger(maxPayload) && maxPayload > 0)) throw new RangeError(`media.frame: maxPayload ${maxPayload}, a whole number of bytes`);
            const head = header(frame);
            if (head.encrypted) throw new RangeError('media.frame: an encrypted frame, and no cipher here yet (row B5c)');
            let payload = frame.subarray(HEADER);
            if (head.deflated) {
                if (!deflate) throw new RangeError('media.frame: a deflated frame, and no deflate given to read it');
                payload = inflate(deflate, payload, maxPayload);
            }
            return { ...head, payload };
        }

        function createTracker() {
            /** The highest sequence seen, per layer. */
            const last = new Map();
            const counts = { frames: 0, missing: 0, late: 0, repeats: 0, resyncs: 0 };
            return {
                get counts() {
                    return { ...counts };
                },
                forget(layer) {
                    last.delete(layer);
                },
                accept({ layer, sequence }) {
                    counts.frames++;
                    const out = { missing: 0, late: false, repeat: false, resync: false };
                    if (!last.has(layer)) {
                        last.set(layer, sequence);
                        return out;
                    }
                    // The distance forward, modulo 2^32: up to RESYNC ahead is a gap, up to RESYNC behind is late,
                    // anything farther starts the layer again.
                    const ahead = (sequence - last.get(layer) + WRAP) % WRAP;
                    if (ahead === 0) {
                        out.repeat = true;
                        counts.repeats++;
                    } else if (ahead <= RESYNC) {
                        out.missing = ahead - 1;
                        counts.missing += out.missing;
                        last.set(layer, sequence);
                    } else if (WRAP - ahead <= RESYNC) {
                        out.late = true;
                        counts.late++;
                    } else {
                        out.resync = true;
                        counts.resyncs++;
                        last.set(layer, sequence);
                    }
                    return out;
                },
            };
        }

        return { HEADER, VERSION, MAX_PAYLOAD, RESYNC, createWriter, header, read, createTracker };
    },
};
