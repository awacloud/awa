// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview `video.link` — the video codec in a worker, from the grab
 * of a camera or screen track to the picture shown, its packets sent in
 * `media.frame` frames.
 *
 * A worker attaches it to its own scope (`attach(self)`). The page sends
 * an `open` message with the encoder's configuration and, to show the
 * picture, a canvas it gave up (`transferControlToOffscreen`), then hands
 * the worker its grab (`video.grab.source(track).attach(worker)`): the
 * worker grabs, encodes, decodes and draws, and the page's thread only
 * composes the canvas.
 *
 * The picture is drawn on the GPU (`video.gl.render`) where WebGL2 is there
 * and the stream is one the GPU draws (the exact pyramid; the colour
 * filter or none), on the canvas's 2D context otherwise; with no canvas,
 * each picture is posted to the scope.
 *
 * What travels (row B5b2, ruling D19): a frame a unit of each packet — the
 * base, the colour, each detail level — its layer the unit's type, its
 * media time the picture's (the grab's timestamp in milliseconds, modulo
 * 2³², moved one on when the frame clock stands still or goes back), its
 * payload the unit's bytes. Frames loop back inside the worker,
 * or — given a `transport` port — leave on it, and the frames that arrive
 * on it are put back together and shown. Every packet holds the base, the
 * colour and one detail unit a level, and the base says the levels: a
 * picture is decoded as soon as every unit not dropped has come. One left
 * incomplete (a frame lost) is decoded with what came when a later
 * picture begins, if its base came; without its base it is not shown.
 * A frame behind the last picture shown is late, and dropped.
 *
 * Messages to the scope:
 *   { type: 'open', config, canvas?, transport?, show?, surface?, deflate? }  → { type: 'opened', coded, display }
 *   the grab's messages ('grab-stream', 'grab-frame', see video.grab)
 *   { type: 'drop', details, colour }   frames are dropped by their header before they are put
 *                       together — the `details` finest detail levels and, with `colour`, the colour —
 *                       as a relay holding no key would; { details: 0, colour: false } is the whole stream
 *   { type: 'stats' }   → { type: 'stats', grabbed, skipped, coded, packets, units, bytes, wireBytes,
 *                       keptWireBytes, lost, late, shown, display, encodeMs, decodeMs }
 *   { type: 'close' }   → { type: 'closed' }
 * Without a canvas each picture goes out as { type: 'picture', picture, width, height }.
 * A failure — a bad configuration, a damaged frame — is answered with
 * { type: 'error', message }; the link goes on.
 *
 * `show: 'cpu'` forces the 2D way; `surface` is where the grab draws the
 * frames it reads (a new OffscreenCanvas by default). The module reads no
 * clock: a timer is given to `attach` (`now`, ms), or nothing is timed;
 * `observe` hooks (`grabbed(rgba, timestamp)`, `shown(peek)`) let a check see
 * each frame and each picture: `peek()` gives the picture shown, as RGBA
 * (read back from the GPU when it drew it).
 *
 * The lossless stage (rows B4c, B5b2): with `deflate: true` (level 6) or
 * `deflate: { level }` in `open`, each frame keeps the smaller of its
 * payload deflated or stored. The DEFLATE itself is the fw `deflate`
 * module, given to `attach` by the worker that registers it.
 */

import { codecModule } from '../codec/codec.js';
import { packModule } from '../pack/pack.js';
import { grabModule } from '../grab/grab.js';
import { glModule } from '../gl/gl.js';
import { glRenderModule } from '../gl/render.js';
import { frameModule } from '@awacloud/media-stream/frame';

/**
 * @typedef {object} VideoLinkApi
 * @property {(scope: EventTarget & { postMessage: Function }, options?: { now?: () => number, deflate?: { deflateSync: (data: Uint8Array, options?: { level?: number }) => Uint8Array, inflateSync: (data: Uint8Array) => Uint8Array }, observe?: { grabbed?: (rgba: Uint8ClampedArray, timestamp: number) => void, shown?: (peek: () => Uint8ClampedArray) => void } }) => void} attach
 */

export const linkModule = {
    name: 'video.link',
    version: '0.5.2',
    type: 'lib.media.video',
    dependencies: ['video.codec', 'video.pack', 'video.grab', 'video.gl', 'video.gl.render', 'media.frame'],
    deps: [codecModule, packModule, grabModule, glModule, glRenderModule, frameModule],

    /** @returns {VideoLinkApi} */
    factory(codec, pack, grab, gl, render, framing) {
        /** The filters the GPU draws. */
        const GPU_FILTERS = ['none', 'chroma'];
        const WRAP = 2 ** 32;
        const { BASE, COLOUR, DETAIL } = pack.types;
        /** The most pictures waiting for their units. */
        const PENDING = 8;

        /** A buffer of its own, to transfer: a view may sit on a larger one. */
        const own = (bytes) => (bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength ? bytes : bytes.slice());
        /** `a` comes after `b` on the 32-bit circle of media times. */
        const after = (a, b) => a !== b && (a - b + WRAP) % WRAP < WRAP / 2;
        const message = (error) => String(error && error.message ? error.message : error);

        function attach(scope, { now, observe = {}, deflate: lossless = null } = {}) {
            let open = null;
            const timed = (fn) => {
                if (!now) return fn();
                const t0 = now();
                const out = fn();
                return [out, now() - t0];
            };

            function close() {
                if (!open) return;
                if (open.transport) open.transport.close();
                if (open.renderer) open.renderer.dispose();
                open = null;
            }

            function start({ config, canvas = null, transport = null, show = 'gpu', surface, deflate = false }) {
                if (deflate && !lossless) throw new Error('video.link: deflate asked, but no deflate was given to attach');
                const writer = framing.createWriter({ kind: 'video', deflate: lossless, lossless: deflate });
                const encoder = codec.createEncoder(config);
                const coded = encoder.coded;
                const intended = canvas ? (show !== 'cpu' && gl.supported() ? 'gpu' : 'cpu') : 'none';
                const link = {
                    encoder, coded, canvas, transport, writer, tracker: framing.createTracker(),
                    display: intended, renderer: null, decoder: null, context: null,
                    levels: 0, drop: { details: 0, colour: false },
                    pending: new Map(), shownTime: null, sentTime: null,
                    counts: {
                        coded: 0, packets: 0, units: 0, bytes: 0, wireBytes: 0, keptWireBytes: 0, lost: 0, late: 0,
                        shown: 0, encodeMs: now ? 0 : null, decodeMs: now ? 0 : null,
                    },
                };
                link.reader = grab.reader({ width: config.width, height: config.height, fps: config.fps, canvas: surface });
                if (canvas) {
                    canvas.width = coded.width;
                    canvas.height = coded.height;
                }
                open = link;
                if (transport) {
                    transport.onmessage = ({ data }) => {
                        if (!(data instanceof Uint8Array)) return;
                        try {
                            arrive(data);
                        } catch (error) {
                            scope.postMessage({ type: 'error', message: message(error) });
                        }
                    };
                }
                scope.postMessage({ type: 'opened', coded, display: intended });
            }

            /** The decoder and the way to show, settled on the first packet: the stream says its shape. */
            function settle(packet) {
                const { coded } = open;
                const shape = codec.describe(packet);
                if (open.display === 'gpu' && shape.exact) {
                    let renderer;
                    try {
                        renderer = render.create({ width: coded.width, height: coded.height, levels: shape.levels, diagonal: shape.diagonal, canvas: open.canvas });
                    } catch (error) {
                        // The canvas holds a WebGL2 context now: no 2D one can be had on it. The pictures are
                        // posted to the page instead, and the page is told why.
                        open.display = 'none';
                        open.canvas = null;
                        open.decoder = codec.createDecoder({ width: coded.width, height: coded.height });
                        scope.postMessage({ type: 'error', message: `video.link: the GPU cannot draw this stream (${message(error)}); the pictures are posted instead` });
                        return;
                    }
                    open.renderer = renderer;
                    open.decoder = codec.createDecoder({
                        width: coded.width,
                        height: coded.height,
                        present: (pyramid, filter) => {
                            if (filter && !GPU_FILTERS.includes(filter.mode)) throw new RangeError(`video.link: the GPU does not draw the filter ${filter.mode}`);
                            renderer.draw(pyramid, filter);
                        },
                    });
                    return;
                }
                if (open.display === 'gpu') open.display = 'cpu';
                open.decoder = codec.createDecoder({ width: coded.width, height: coded.height });
                if (open.canvas) open.context = open.canvas.getContext('2d');
            }

            /** The first detail type a relay's drop leaves out: more levels than the stream has means all of them. */
            function finestKept() {
                return DETAIL + open.levels - Math.min(open.drop.details, open.levels);
            }

            /** A frame a relay holding no key drops, by its header alone. */
            function dropped(layer) {
                if (layer === BASE) return false;
                if (layer === COLOUR) return open.drop.colour;
                // Before any base, the levels are not known: nothing is taken.
                return open.levels > 0 && layer >= finestKept();
            }

            /** Every unit a picture should get once the drop is applied, all of them in. */
            function whole(picture) {
                const base = picture.units.get(BASE);
                if (!base) return false;
                if (!open.drop.colour && !picture.units.has(COLOUR)) return false;
                for (let type = DETAIL; type < finestKept(); type++) if (!picture.units.has(type)) return false;
                return true;
            }

            /** A picture put back together and shown; without its base it is not. */
            function finish(time, picture) {
                open.pending.delete(time);
                if (!picture.units.has(BASE)) return;
                const units = [...picture.units].sort(([a], [b]) => a - b).map(([type, bytes]) => ({ type, bytes }));
                open.shownTime = time;
                play(pack.writeUnits(units));
            }

            /** A frame from the way: dropped as a relay would, or put with its picture. */
            function arrive(bytes) {
                const head = framing.header(bytes);
                if (head.kind !== 'video') throw new RangeError(`video.link: a ${head.kind} frame on the video link`);
                if (head.layer === BASE && open.levels === 0) {
                    // The base says the levels: what a drop of the finest details means.
                    open.levels = codec.describe(pack.writeUnits([{ type: BASE, bytes: framing.read(bytes, { deflate: lossless }).payload }])).levels;
                }
                if (dropped(head.layer)) return;
                const { payload } = framing.read(bytes, { deflate: lossless });
                const { counts } = open;
                counts.keptWireBytes += bytes.length;
                const seen = open.tracker.accept(head);
                if (seen.repeat) return;
                counts.lost += seen.missing;
                if (seen.late || (open.shownTime !== null && !after(head.time, open.shownTime))) {
                    counts.late++;
                    return;
                }
                // A later picture begins: those before it are finished with what came.
                for (const [time, picture] of [...open.pending].sort(([a], [b]) => (after(a, b) ? 1 : -1))) {
                    if (after(head.time, time)) finish(time, picture);
                }
                let picture = open.pending.get(head.time);
                if (!picture) {
                    picture = { units: new Map() };
                    open.pending.set(head.time, picture);
                    // Bounded: past PENDING pictures waiting, the oldest is finished with what came.
                    if (open.pending.size > PENDING) {
                        const [oldest] = [...open.pending.keys()].sort((a, b) => (after(a, b) ? 1 : -1));
                        finish(oldest, open.pending.get(oldest));
                    }
                }
                picture.units.set(head.layer, payload);
                if (whole(picture)) finish(head.time, picture);
            }

            function play(packet) {
                if (!open.decoder) settle(packet);
                const { coded, counts } = open;
                const t = timed(() => {
                    const picture = open.decoder.push(packet);
                    open.last = picture;
                    if (picture && open.context) {
                        const image = open.context.createImageData(coded.width, coded.height);
                        image.data.set(picture);
                        open.context.putImageData(image, 0, 0);
                    } else if (picture) {
                        const copy = picture.slice();
                        scope.postMessage({ type: 'picture', picture: copy, width: coded.width, height: coded.height }, [copy.buffer]);
                    }
                });
                if (now) counts.decodeMs += t[1];
                counts.shown++;
                if (observe.shown) observe.shown(() => peek());
            }

            /** The picture last shown, RGBA: read back from the GPU when it drew it. */
            function peek() {
                if (open.renderer) return open.renderer.read();
                if (open.context) return open.context.getImageData(0, 0, open.coded.width, open.coded.height).data;
                return open.last.slice();
            }

            function onFrame(rgba, timestamp) {
                if (!open) return;
                if (observe.grabbed) observe.grabbed(rgba, timestamp);
                const { counts } = open;
                const out = timed(() => open.encoder.push(rgba));
                const packets = now ? out[0] : out;
                if (now) counts.encodeMs += out[1];
                counts.coded++;
                // The picture's media time: its timestamp in ms, but never at or behind the last one sent; a
                // frame clock that stands still or went back (row B2d) must not make the receiver drop it as late.
                let time = Math.round(timestamp / 1000) % WRAP;
                if (open.sentTime !== null && !after(time, open.sentTime)) time = (open.sentTime + 1) % WRAP;
                open.sentTime = time;
                for (const packet of packets) {
                    counts.packets++;
                    counts.bytes += packet.length;
                    for (const unit of pack.readUnits(packet)) {
                        const bytes = own(open.writer.write(unit.bytes, { layer: unit.type, time }));
                        counts.units++;
                        counts.wireBytes += bytes.length;
                        if (open.transport) open.transport.postMessage(bytes, [bytes.buffer]);
                        else arrive(bytes);
                    }
                }
            }

            // The grab's messages: frames are pushed through the reader of the open link, or let go.
            const through = {
                get counts() {
                    return open ? open.reader.counts : { kept: 0, skipped: 0 };
                },
                push(frame, timestamp) {
                    if (!open) {
                        frame.close();
                        return null;
                    }
                    return open.reader.push(frame, timestamp);
                },
            };
            const report = (error) => scope.postMessage({ type: 'error', message: message(error) });
            const receiving = grab.receive(scope, through, (rgba, timestamp) => {
                try {
                    onFrame(rgba, timestamp);
                } catch (error) {
                    report(error);
                }
            }, report);

            const none = { coded: 0, packets: 0, units: 0, bytes: 0, wireBytes: 0, keptWireBytes: 0, lost: 0, late: 0, shown: 0, encodeMs: null, decodeMs: null };

            scope.addEventListener('message', ({ data }) => {
                try {
                    if (!data || typeof data !== 'object') return;
                    if (data.type === 'open') {
                        close();
                        start(data);
                    } else if (data.type === 'drop') {
                        if (!open) return;
                        const details = data.details ?? 0;
                        if (!Number.isInteger(details) || details < 0) throw new RangeError(`video.link: drop details ${details}`);
                        open.drop = { details, colour: Boolean(data.colour) };
                        // A layer given back after a drop starts again: its gap is not a loss.
                        for (let layer = COLOUR; layer < 256; layer++) open.tracker.forget(layer);
                    } else if (data.type === 'stats') {
                        const counts = open ? open.counts : none;
                        const { kept, skipped } = through.counts;
                        scope.postMessage({ type: 'stats', grabbed: kept, skipped, display: open ? open.display : 'none', ...counts });
                    } else if (data.type === 'close') {
                        receiving.stop();
                        close();
                        scope.postMessage({ type: 'closed' });
                    }
                } catch (error) {
                    scope.postMessage({ type: 'error', message: message(error) });
                }
            });
        }

        return { attach };
    },
};
