// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview `video.gl` — a small WebGL2 helper for image passes.
 *
 * Written inside the video package because its GPU implementation needs
 * it and nothing else does yet (owner decision D12); shaped as an fw
 * descriptor, with no dependency, so that it can move into the framework
 * as it is.
 *
 * It does one thing: run a fragment program over a full target, from
 * textures to textures, and read a target back. Textures hold bytes or
 * 16-bit integers — never floats: a pass can then be, bit for bit, the
 * loop it replaces. Nothing is flipped and nothing is displayed; row 0
 * of an uploaded array is row 0 of what a pass sees and of what is read
 * back.
 *
 * A pass draws one triangle that covers the target, without a vertex
 * buffer; a fragment program reads its inputs with `texelFetch` at
 * `ivec2(gl_FragCoord.xy)`.
 */

/**
 * @typedef {'rgba8ui'|'rgba16i'|'r8ui'|'r16i'} GlFormat Unsigned bytes or signed 16-bit integers, four channels or one.
 *
 * @typedef {object} GlTexture
 * @property {WebGLTexture} handle
 * @property {number} width
 * @property {number} height
 * @property {GlFormat} format
 *
 * @typedef {object} GlTarget
 * @property {WebGLFramebuffer} handle
 * @property {GlTexture[]} textures
 * @property {number} width
 * @property {number} height
 *
 * @typedef {object} GlContext
 * @property {WebGL2RenderingContext} gl
 * @property {(fragment: string) => WebGLProgram} program Compiles a fragment program with the shared vertex stage.
 * @property {(shape: { width: number, height: number, format: GlFormat }) => GlTexture} texture
 * @property {(texture: GlTexture, data: ArrayBufferView) => void} upload Bytes for `rgba8ui`, an `Int16Array` for `rgba16i`.
 * @property {(textures: GlTexture[]) => GlTarget} target Textures of one size, written together by a pass.
 * @property {(program: WebGLProgram, pass: { target: GlTarget|null, inputs?: Record<string, GlTexture>, ints?: Record<string, number> }) => void} run A null target is the canvas.
 * @property {(target: GlTarget, index: number) => Int16Array|Int32Array|Uint32Array} read Four integers a pixel, row 0 first, in an array the target keeps and reuses at the next read.
 * @property {() => Uint8ClampedArray} readCanvas The canvas as RGBA, row 0 of the picture first.
 * @property {() => void} dispose Frees every program, texture and target it made.
 *
 * @typedef {object} GlApi
 * @property {() => boolean} supported WebGL2 on an `OffscreenCanvas` is there.
 * @property {(options: { width: number, height: number, canvas?: OffscreenCanvas|HTMLCanvasElement }) => GlContext} create
 */

export const glModule = {
    name: 'video.gl',
    version: '0.3.0',
    type: 'lib.media.video',
    dependencies: [],
    deps: [],

    /** @returns {GlApi} */
    factory() {
        const VERTEX = `#version 300 es
void main() {
    // One triangle over the whole target, from the vertex index alone.
    vec2 corner = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
    gl_Position = vec4(corner * 2.0 - 1.0, 0.0, 1.0);
}`;

        /** A context on a canvas of the given size, or null. */
        function open(canvas, width, height) {
            if (!canvas && typeof OffscreenCanvas === 'undefined') return null;
            const surface = canvas ?? new OffscreenCanvas(width, height);
            return surface.getContext('webgl2', { antialias: false, depth: false, stencil: false, alpha: false, preserveDrawingBuffer: false });
        }

        /** Probed once: a WebGL2 context a call is what browsers limit. */
        let known = null;

        function supported() {
            if (known !== null) return known;
            try {
                const probe = open(null, 1, 1);
                known = probe !== null;
                // The probe's context is given back at once, not left to the collector.
                if (probe) {
                    const lose = probe.getExtension('WEBGL_lose_context');
                    if (lose) lose.loseContext();
                }
            } catch {
                known = false;
            }
            return known;
        }

        /**
         * @param {object} options
         * @param {number} options.width
         * @param {number} options.height
         * @param {OffscreenCanvas|HTMLCanvasElement} [options.canvas] A canvas to use; an `OffscreenCanvas` is made otherwise.
         * @returns {GlContext}
         * @throws {Error} When WebGL2 is not available; later, when a shader does not compile or a target is incomplete.
         */
        function create({ width, height, canvas }) {
            const gl = open(canvas, width, height);
            if (!gl) throw new Error('video.gl: WebGL2 is not available here');
            const FORMATS = {
                rgba8ui: { internal: gl.RGBA8UI, format: gl.RGBA_INTEGER, type: gl.UNSIGNED_BYTE },
                rgba16i: { internal: gl.RGBA16I, format: gl.RGBA_INTEGER, type: gl.SHORT },
                r8ui: { internal: gl.R8UI, format: gl.RED_INTEGER, type: gl.UNSIGNED_BYTE },
                r16i: { internal: gl.R16I, format: gl.RED_INTEGER, type: gl.SHORT },
            };
            const made = { programs: [], textures: [], targets: [] };
            // WebGL2 wants a vertex array bound, even an empty one.
            const vertices = gl.createVertexArray();
            gl.bindVertexArray(vertices);
            gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
            gl.pixelStorei(gl.PACK_ALIGNMENT, 1);

            function stage(type, source) {
                const shader = gl.createShader(type);
                gl.shaderSource(shader, source);
                gl.compileShader(shader);
                if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
                    const log = gl.getShaderInfoLog(shader);
                    gl.deleteShader(shader);
                    throw new Error(`video.gl: a shader does not compile — ${log}`);
                }
                return shader;
            }

            function program(fragment) {
                const handle = gl.createProgram();
                const vertex = stage(gl.VERTEX_SHADER, VERTEX);
                const pixel = stage(gl.FRAGMENT_SHADER, fragment);
                gl.attachShader(handle, vertex);
                gl.attachShader(handle, pixel);
                gl.linkProgram(handle);
                gl.deleteShader(vertex);
                gl.deleteShader(pixel);
                if (!gl.getProgramParameter(handle, gl.LINK_STATUS)) {
                    const log = gl.getProgramInfoLog(handle);
                    gl.deleteProgram(handle);
                    throw new Error(`video.gl: a program does not link — ${log}`);
                }
                made.programs.push(handle);
                return handle;
            }

            function texture({ width: w, height: h, format }) {
                const kind = FORMATS[format];
                if (!kind) throw new RangeError(`video.gl: format ${format}`);
                const handle = gl.createTexture();
                gl.bindTexture(gl.TEXTURE_2D, handle);
                gl.texStorage2D(gl.TEXTURE_2D, 1, kind.internal, w, h);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
                const made1 = { handle, width: w, height: h, format };
                made.textures.push(made1);
                return made1;
            }

            function upload(tex, data) {
                const kind = FORMATS[tex.format];
                // A clamped array is bytes all the same.
                const view = data instanceof Uint8ClampedArray ? new Uint8Array(data.buffer, data.byteOffset, data.length) : data;
                gl.bindTexture(gl.TEXTURE_2D, tex.handle);
                gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, tex.width, tex.height, kind.format, kind.type, view);
            }

            function target(textures) {
                const handle = gl.createFramebuffer();
                gl.bindFramebuffer(gl.FRAMEBUFFER, handle);
                textures.forEach((tex, k) => gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + k, gl.TEXTURE_2D, tex.handle, 0));
                gl.drawBuffers(textures.map((_, k) => gl.COLOR_ATTACHMENT0 + k));
                if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('video.gl: a target is not complete');
                const made1 = { handle, textures, width: textures[0].width, height: textures[0].height };
                made.targets.push(made1);
                return made1;
            }

            function run(handle, { target: to, inputs = {}, ints = {} }) {
                // No target: the canvas itself.
                gl.bindFramebuffer(gl.FRAMEBUFFER, to ? to.handle : null);
                gl.viewport(0, 0, to ? to.width : gl.drawingBufferWidth, to ? to.height : gl.drawingBufferHeight);
                gl.useProgram(handle);
                let unit = 0;
                for (const [name, tex] of Object.entries(inputs)) {
                    gl.activeTexture(gl.TEXTURE0 + unit);
                    gl.bindTexture(gl.TEXTURE_2D, tex.handle);
                    gl.uniform1i(gl.getUniformLocation(handle, name), unit);
                    unit++;
                }
                for (const [name, value] of Object.entries(ints)) gl.uniform1i(gl.getUniformLocation(handle, name), value);
                gl.drawArrays(gl.TRIANGLES, 0, 3);
            }

            // Signed 16-bit targets read back as shorts where the implementation says so (half the transfer),
            // as INT otherwise: the one pairing every WebGL2 accepts.
            let shorts = null;

            function read(from, index) {
                gl.bindFramebuffer(gl.READ_FRAMEBUFFER, from.handle);
                gl.readBuffer(gl.COLOR_ATTACHMENT0 + index);
                const count = from.width * from.height * 4;
                const buffers = (from.buffers ??= []);
                if (from.textures[index].format !== 'rgba16i') {
                    const out = (buffers[index] ??= new Uint32Array(count));
                    gl.readPixels(0, 0, from.width, from.height, gl.RGBA_INTEGER, gl.UNSIGNED_INT, out);
                    return out;
                }
                if (shorts === null) {
                    shorts = gl.getParameter(gl.IMPLEMENTATION_COLOR_READ_FORMAT) === gl.RGBA_INTEGER && gl.getParameter(gl.IMPLEMENTATION_COLOR_READ_TYPE) === gl.SHORT;
                }
                const out = (buffers[index] ??= shorts ? new Int16Array(count) : new Int32Array(count));
                gl.readPixels(0, 0, from.width, from.height, gl.RGBA_INTEGER, shorts ? gl.SHORT : gl.INT, out);
                return out;
            }

            /** The canvas as RGBA bytes, row 0 of the picture first (the canvas keeps its first row at the bottom). */
            function readCanvas() {
                const w = gl.drawingBufferWidth;
                const h = gl.drawingBufferHeight;
                const raw = new Uint8Array(w * h * 4);
                gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
                gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, raw);
                const out = new Uint8ClampedArray(w * h * 4);
                for (let y = 0; y < h; y++) out.set(raw.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4);
                return out;
            }

            function dispose() {
                for (const handle of made.programs) gl.deleteProgram(handle);
                for (const tex of made.textures) gl.deleteTexture(tex.handle);
                for (const to of made.targets) gl.deleteFramebuffer(to.handle);
                gl.deleteVertexArray(vertices);
                made.programs.length = 0;
                made.textures.length = 0;
                made.targets.length = 0;
            }

            return { gl, program, texture, upload, target, run, read, readCanvas, dispose };
        }

        return { supported, create };
    },
};
