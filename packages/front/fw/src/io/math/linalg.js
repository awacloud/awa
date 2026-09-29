// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @description
 * Linear algebra for 2D/3D/4D graphics - column-major Float32Array, out-parameter style (gl-matrix compatible).
 */

/**
 * 2-component vector namespace (Float32Array(2), out-parameter convention).
 * @typedef {object} Vec2API
 * @property {(arr?: ArrayLike<number>) => Float32Array} create
 * @property {(out: Float32Array, a: ArrayLike<number>) => Float32Array} copy
 * @property {(out: Float32Array, x: number, y: number) => Float32Array} set
 * @property {(out: Float32Array, a: ArrayLike<number>, b: ArrayLike<number>) => Float32Array} add
 * @property {(out: Float32Array, a: ArrayLike<number>, b: ArrayLike<number>) => Float32Array} sub
 * @property {(out: Float32Array, a: ArrayLike<number>, b: ArrayLike<number>) => Float32Array} mul
 * @property {(out: Float32Array, v: ArrayLike<number>, s: number) => Float32Array} scale
 * @property {(a: ArrayLike<number>, b: ArrayLike<number>) => number} dot
 * @property {(v: ArrayLike<number>) => number} length
 * @property {(v: ArrayLike<number>) => number} lengthSq
 * @property {(out: Float32Array, v: ArrayLike<number>) => Float32Array} normalize
 * @property {(a: ArrayLike<number>, b: ArrayLike<number>) => number} distance
 * @property {(out: Float32Array, a: ArrayLike<number>, b: ArrayLike<number>, t: number) => Float32Array} lerp
 * @property {(a: ArrayLike<number>, b: ArrayLike<number>, eps?: number) => boolean} equals
 */

/**
 * 3-component vector namespace (Float32Array(3), out-parameter convention).
 * @typedef {object} Vec3API
 * @property {(arr?: ArrayLike<number>) => Float32Array} create
 * @property {(out: Float32Array, a: ArrayLike<number>) => Float32Array} copy
 * @property {(out: Float32Array, x: number, y: number, z: number) => Float32Array} set
 * @property {(out: Float32Array, a: ArrayLike<number>, b: ArrayLike<number>) => Float32Array} add
 * @property {(out: Float32Array, a: ArrayLike<number>, b: ArrayLike<number>) => Float32Array} sub
 * @property {(out: Float32Array, a: ArrayLike<number>, b: ArrayLike<number>) => Float32Array} mul
 * @property {(out: Float32Array, v: ArrayLike<number>, s: number) => Float32Array} scale
 * @property {(a: ArrayLike<number>, b: ArrayLike<number>) => number} dot
 * @property {(out: Float32Array, a: ArrayLike<number>, b: ArrayLike<number>) => Float32Array} cross
 * @property {(v: ArrayLike<number>) => number} length
 * @property {(v: ArrayLike<number>) => number} lengthSq
 * @property {(out: Float32Array, v: ArrayLike<number>) => Float32Array} normalize
 * @property {(a: ArrayLike<number>, b: ArrayLike<number>) => number} distance
 * @property {(out: Float32Array, a: ArrayLike<number>, b: ArrayLike<number>, t: number) => Float32Array} lerp
 * @property {(a: ArrayLike<number>, b: ArrayLike<number>, eps?: number) => boolean} equals
 */

/**
 * 4-component vector namespace (Float32Array(4), out-parameter convention).
 * @typedef {object} Vec4API
 * @property {(arr?: ArrayLike<number>) => Float32Array} create
 * @property {(out: Float32Array, a: ArrayLike<number>) => Float32Array} copy
 * @property {(out: Float32Array, x: number, y: number, z: number, w: number) => Float32Array} set
 * @property {(out: Float32Array, a: ArrayLike<number>, b: ArrayLike<number>) => Float32Array} add
 * @property {(out: Float32Array, a: ArrayLike<number>, b: ArrayLike<number>) => Float32Array} sub
 * @property {(out: Float32Array, a: ArrayLike<number>, b: ArrayLike<number>) => Float32Array} mul
 * @property {(out: Float32Array, v: ArrayLike<number>, s: number) => Float32Array} scale
 * @property {(a: ArrayLike<number>, b: ArrayLike<number>) => number} dot
 * @property {(v: ArrayLike<number>) => number} length
 * @property {(v: ArrayLike<number>) => number} lengthSq
 * @property {(out: Float32Array, v: ArrayLike<number>) => Float32Array} normalize
 * @property {(a: ArrayLike<number>, b: ArrayLike<number>) => number} distance
 * @property {(out: Float32Array, a: ArrayLike<number>, b: ArrayLike<number>, t: number) => Float32Array} lerp
 * @property {(a: ArrayLike<number>, b: ArrayLike<number>, eps?: number) => boolean} equals
 */

/**
 * 3×3 column-major matrix namespace (Float32Array(9), out-parameter convention).
 * @typedef {object} Mat3API
 * @property {() => Float32Array} create
 * @property {(out: Float32Array) => Float32Array} identity
 * @property {(out: Float32Array, src: ArrayLike<number>) => Float32Array} copy
 * @property {(out: Float32Array, a: ArrayLike<number>, b: ArrayLike<number>) => Float32Array} multiply
 * @property {(out: Float32Array, m: ArrayLike<number>, v: ArrayLike<number>) => Float32Array} translate
 * @property {(out: Float32Array, m: ArrayLike<number>, rad: number) => Float32Array} rotate
 * @property {(out: Float32Array, m: ArrayLike<number>, v: ArrayLike<number>) => Float32Array} scale
 * @property {(m: ArrayLike<number>) => number} determinant
 * @property {(out: Float32Array, m: ArrayLike<number>) => boolean} invert
 * @property {(out: Float32Array, m: ArrayLike<number>) => Float32Array} transpose
 * @property {(outV2: Float32Array, m: ArrayLike<number>, v: ArrayLike<number>) => Float32Array} transform
 */

/**
 * 4×4 column-major matrix namespace (Float32Array(16), out-parameter convention).
 * @typedef {object} Mat4API
 * @property {() => Float32Array} create
 * @property {(out: Float32Array) => Float32Array} identity
 * @property {(out: Float32Array, src: ArrayLike<number>) => Float32Array} copy
 * @property {(out: Float32Array, a: ArrayLike<number>, b: ArrayLike<number>) => Float32Array} multiply
 * @property {(out: Float32Array, m: ArrayLike<number>, v: ArrayLike<number>) => Float32Array} translate
 * @property {(out: Float32Array, m: ArrayLike<number>, rad: number, axis: ArrayLike<number>) => Float32Array} rotate
 * @property {(out: Float32Array, m: ArrayLike<number>, v: ArrayLike<number>) => Float32Array} scale
 * @property {(out: Float32Array, m: ArrayLike<number>) => boolean} invert
 * @property {(out: Float32Array, m: ArrayLike<number>) => Float32Array} transpose
 * @property {(out: Float32Array, fovY: number, aspect: number, near: number, far: number) => Float32Array} perspective
 * @property {(out: Float32Array, left: number, right: number, bottom: number, top: number, near: number, far: number) => Float32Array} ortho
 * @property {(out: Float32Array, eye: ArrayLike<number>, center: ArrayLike<number>, up: ArrayLike<number>) => Float32Array} lookAt
 * @property {(outV3: Float32Array, m: ArrayLike<number>, v: ArrayLike<number>) => Float32Array} transform
 * @property {(outV4: Float32Array, m: ArrayLike<number>, v: ArrayLike<number>) => Float32Array} transform4
 */

/**
 * Object returned by `linalg.factory()`.
 * @typedef {object} LinalgAPI
 * @property {Vec2API} vec2
 * @property {Vec3API} vec3
 * @property {Vec4API} vec4
 * @property {Mat3API} mat3
 * @property {Mat4API} mat4
 */

export const linalg = {
    name: 'linalg',
    version: '1.0.0',
    type: 'fw.io.math',
    dependencies: [],

    /** @returns {LinalgAPI} */
    factory() {
        const EPSILON = 1e-6;

        // ── vec2 ──────────────────────────────────────────────
        /**
         * 2-component vectors backed by Float32Array. Operations follow the
         * gl-matrix out-parameter convention: the first argument is the
         * destination (may alias any input).
         * @namespace vec2
         */
        const vec2 = {
            /** @param {ArrayLike<number>} [arr] @returns {Float32Array} */
            create(arr) { const v = new Float32Array(2); if (arr) { v[0] = arr[0]; v[1] = arr[1]; } return v; },
            /** @param {Float32Array} out @param {ArrayLike<number>} a @returns {Float32Array} */
            copy(out, a) { out[0] = a[0]; out[1] = a[1]; return out; },
            /** @param {Float32Array} out @param {number} x @param {number} y @returns {Float32Array} */
            set(out, x, y) { out[0] = x; out[1] = y; return out; },
            /** @param {Float32Array} out @param {ArrayLike<number>} a @param {ArrayLike<number>} b @returns {Float32Array} */
            add(out, a, b) { out[0] = a[0] + b[0]; out[1] = a[1] + b[1]; return out; },
            /** @param {Float32Array} out @param {ArrayLike<number>} a @param {ArrayLike<number>} b @returns {Float32Array} */
            sub(out, a, b) { out[0] = a[0] - b[0]; out[1] = a[1] - b[1]; return out; },
            /** Component-wise multiply. @param {Float32Array} out @param {ArrayLike<number>} a @param {ArrayLike<number>} b @returns {Float32Array} */
            mul(out, a, b) { out[0] = a[0] * b[0]; out[1] = a[1] * b[1]; return out; },
            /** @param {Float32Array} out @param {ArrayLike<number>} v @param {number} s @returns {Float32Array} */
            scale(out, v, s) { out[0] = v[0] * s; out[1] = v[1] * s; return out; },
            /** @param {ArrayLike<number>} a @param {ArrayLike<number>} b @returns {number} */
            dot(a, b) { return a[0] * b[0] + a[1] * b[1]; },
            /** @param {ArrayLike<number>} v @returns {number} */
            length(v) { return Math.sqrt(v[0] * v[0] + v[1] * v[1]); },
            /** @param {ArrayLike<number>} v @returns {number} */
            lengthSq(v) { return v[0] * v[0] + v[1] * v[1]; },
            /** Normalize v into out (returns zero vector for zero input). @param {Float32Array} out @param {ArrayLike<number>} v @returns {Float32Array} */
            normalize(out, v) { const l = Math.sqrt(v[0]*v[0]+v[1]*v[1]) || 1; out[0] = v[0]/l; out[1] = v[1]/l; return out; },
            /** @param {ArrayLike<number>} a @param {ArrayLike<number>} b @returns {number} */
            distance(a, b) { const dx = a[0]-b[0], dy = a[1]-b[1]; return Math.sqrt(dx*dx+dy*dy); },
            /** Linear interpolation a→b by t. @param {Float32Array} out @param {ArrayLike<number>} a @param {ArrayLike<number>} b @param {number} t @returns {Float32Array} */
            lerp(out, a, b, t) { out[0] = a[0]+(b[0]-a[0])*t; out[1] = a[1]+(b[1]-a[1])*t; return out; },
            /** @param {ArrayLike<number>} a @param {ArrayLike<number>} b @param {number} [eps=1e-6] @returns {boolean} */
            equals(a, b, eps = EPSILON) { return Math.abs(a[0]-b[0]) <= eps && Math.abs(a[1]-b[1]) <= eps; },
        };

        // ── vec3 ──────────────────────────────────────────────
        /**
         * 3-component vectors backed by Float32Array. Out-parameter convention.
         * @namespace vec3
         */
        const vec3 = {
            /** @param {ArrayLike<number>} [arr] @returns {Float32Array} */
            create(arr) { const v = new Float32Array(3); if (arr) { v[0]=arr[0]; v[1]=arr[1]; v[2]=arr[2]; } return v; },
            copy(out, a) { out[0]=a[0]; out[1]=a[1]; out[2]=a[2]; return out; },
            set(out, x, y, z) { out[0]=x; out[1]=y; out[2]=z; return out; },
            add(out, a, b) { out[0]=a[0]+b[0]; out[1]=a[1]+b[1]; out[2]=a[2]+b[2]; return out; },
            sub(out, a, b) { out[0]=a[0]-b[0]; out[1]=a[1]-b[1]; out[2]=a[2]-b[2]; return out; },
            mul(out, a, b) { out[0]=a[0]*b[0]; out[1]=a[1]*b[1]; out[2]=a[2]*b[2]; return out; },
            scale(out, v, s) { out[0]=v[0]*s; out[1]=v[1]*s; out[2]=v[2]*s; return out; },
            dot(a, b) { return a[0]*b[0]+a[1]*b[1]+a[2]*b[2]; },
            /** Cross product. @param {Float32Array} out @param {ArrayLike<number>} a @param {ArrayLike<number>} b @returns {Float32Array} */
            cross(out, a, b) {
                const ax=a[0],ay=a[1],az=a[2], bx=b[0],by=b[1],bz=b[2];
                out[0]=ay*bz-az*by; out[1]=az*bx-ax*bz; out[2]=ax*by-ay*bx;
                return out;
            },
            length(v) { return Math.sqrt(v[0]*v[0]+v[1]*v[1]+v[2]*v[2]); },
            lengthSq(v) { return v[0]*v[0]+v[1]*v[1]+v[2]*v[2]; },
            normalize(out, v) { const l=Math.sqrt(v[0]*v[0]+v[1]*v[1]+v[2]*v[2])||1; out[0]=v[0]/l; out[1]=v[1]/l; out[2]=v[2]/l; return out; },
            distance(a, b) { const dx=a[0]-b[0],dy=a[1]-b[1],dz=a[2]-b[2]; return Math.sqrt(dx*dx+dy*dy+dz*dz); },
            lerp(out, a, b, t) { out[0]=a[0]+(b[0]-a[0])*t; out[1]=a[1]+(b[1]-a[1])*t; out[2]=a[2]+(b[2]-a[2])*t; return out; },
            equals(a, b, eps=EPSILON) { return Math.abs(a[0]-b[0])<=eps && Math.abs(a[1]-b[1])<=eps && Math.abs(a[2]-b[2])<=eps; },
        };

        // ── vec4 ──────────────────────────────────────────────
        /**
         * 4-component vectors backed by Float32Array. Out-parameter convention.
         * @namespace vec4
         */
        const vec4 = {
            /** @param {ArrayLike<number>} [arr] @returns {Float32Array} */
            create(arr) { const v=new Float32Array(4); if(arr){v[0]=arr[0];v[1]=arr[1];v[2]=arr[2];v[3]=arr[3];} return v; },
            copy(out,a){out[0]=a[0];out[1]=a[1];out[2]=a[2];out[3]=a[3];return out;},
            set(out,x,y,z,w){out[0]=x;out[1]=y;out[2]=z;out[3]=w;return out;},
            add(out,a,b){out[0]=a[0]+b[0];out[1]=a[1]+b[1];out[2]=a[2]+b[2];out[3]=a[3]+b[3];return out;},
            sub(out,a,b){out[0]=a[0]-b[0];out[1]=a[1]-b[1];out[2]=a[2]-b[2];out[3]=a[3]-b[3];return out;},
            mul(out,a,b){out[0]=a[0]*b[0];out[1]=a[1]*b[1];out[2]=a[2]*b[2];out[3]=a[3]*b[3];return out;},
            scale(out,v,s){out[0]=v[0]*s;out[1]=v[1]*s;out[2]=v[2]*s;out[3]=v[3]*s;return out;},
            dot(a,b){return a[0]*b[0]+a[1]*b[1]+a[2]*b[2]+a[3]*b[3];},
            length(v){return Math.sqrt(v[0]*v[0]+v[1]*v[1]+v[2]*v[2]+v[3]*v[3]);},
            lengthSq(v){return v[0]*v[0]+v[1]*v[1]+v[2]*v[2]+v[3]*v[3];},
            normalize(out,v){const l=Math.sqrt(v[0]*v[0]+v[1]*v[1]+v[2]*v[2]+v[3]*v[3])||1;out[0]=v[0]/l;out[1]=v[1]/l;out[2]=v[2]/l;out[3]=v[3]/l;return out;},
            distance(a,b){const dx=a[0]-b[0],dy=a[1]-b[1],dz=a[2]-b[2],dw=a[3]-b[3];return Math.sqrt(dx*dx+dy*dy+dz*dz+dw*dw);},
            lerp(out,a,b,t){out[0]=a[0]+(b[0]-a[0])*t;out[1]=a[1]+(b[1]-a[1])*t;out[2]=a[2]+(b[2]-a[2])*t;out[3]=a[3]+(b[3]-a[3])*t;return out;},
            equals(a,b,eps=EPSILON){return Math.abs(a[0]-b[0])<=eps&&Math.abs(a[1]-b[1])<=eps&&Math.abs(a[2]-b[2])<=eps&&Math.abs(a[3]-b[3])<=eps;},
        };

        // ── mat3 (column-major, 3x3) ──────────────────────────
        /**
         * 3×3 column-major matrices backed by Float32Array(9). All ops use
         * out-parameter convention; `out` may alias `m`.
         * @namespace mat3
         */
        const mat3 = {
            /** Create a new identity matrix. @returns {Float32Array} */
            create() { const m=new Float32Array(9); m[0]=1;m[4]=1;m[8]=1; return m; },
            /** Reset to identity. @param {Float32Array} out @returns {Float32Array} */
            identity(out) { out.fill(0); out[0]=1;out[4]=1;out[8]=1; return out; },
            /** @param {Float32Array} out @param {ArrayLike<number>} src @returns {Float32Array} */
            copy(out,src) { for(let i=0;i<9;i++) out[i]=src[i]; return out; },
            /** out = a · b. @param {Float32Array} out @param {ArrayLike<number>} a @param {ArrayLike<number>} b @returns {Float32Array} */
            multiply(out, a, b) {
                // @ts-ignore - Float32Array/number[] is iterable at runtime; ArrayLike<number> lacks Symbol.iterator in TS types
                const [a0,a1,a2,a3,a4,a5,a6,a7,a8] = a;
                // @ts-ignore - Float32Array/number[] is iterable at runtime; ArrayLike<number> lacks Symbol.iterator in TS types
                const [b0,b1,b2,b3,b4,b5,b6,b7,b8] = b;
                out[0]=a0*b0+a3*b1+a6*b2; out[1]=a1*b0+a4*b1+a7*b2; out[2]=a2*b0+a5*b1+a8*b2;
                out[3]=a0*b3+a3*b4+a6*b5; out[4]=a1*b3+a4*b4+a7*b5; out[5]=a2*b3+a5*b4+a8*b5;
                out[6]=a0*b6+a3*b7+a6*b8; out[7]=a1*b6+a4*b7+a7*b8; out[8]=a2*b6+a5*b7+a8*b8;
                return out;
            },
            /** out = m · translation(v). @param {Float32Array} out @param {ArrayLike<number>} m @param {ArrayLike<number>} v @returns {Float32Array} */
            translate(out, m, v) {
                // @ts-ignore - Float32Array/number[] is iterable at runtime; ArrayLike<number> lacks Symbol.iterator in TS types
                const [m0,m1,m2,m3,m4,m5,m6,m7,m8] = m, tx=v[0], ty=v[1];
                out[0]=m0;out[1]=m1;out[2]=m2;
                out[3]=m3;out[4]=m4;out[5]=m5;
                out[6]=m0*tx+m3*ty+m6; out[7]=m1*tx+m4*ty+m7; out[8]=m2*tx+m5*ty+m8;
                return out;
            },
            /** out = m · rotation(rad). @param {Float32Array} out @param {ArrayLike<number>} m @param {number} rad @returns {Float32Array} */
            rotate(out, m, rad) {
                const c=Math.cos(rad), s=Math.sin(rad);
                // @ts-ignore - Float32Array/number[] is iterable at runtime; ArrayLike<number> lacks Symbol.iterator in TS types
                const [m0,m1,m2,m3,m4,m5,m6,m7,m8] = m;
                out[0]=m0*c+m3*s; out[1]=m1*c+m4*s; out[2]=m2*c+m5*s;
                out[3]=m3*c-m0*s; out[4]=m4*c-m1*s; out[5]=m5*c-m2*s;
                out[6]=m6;out[7]=m7;out[8]=m8;
                return out;
            },
            /** out = m · scale(v). @param {Float32Array} out @param {ArrayLike<number>} m @param {ArrayLike<number>} v @returns {Float32Array} */
            scale(out, m, v) {
                const sx=v[0], sy=v[1];
                // @ts-ignore - Float32Array/number[] is iterable at runtime; ArrayLike<number> lacks Symbol.iterator in TS types
                const [m0,m1,m2,m3,m4,m5,m6,m7,m8] = m;
                out[0]=m0*sx;out[1]=m1*sx;out[2]=m2*sx;
                out[3]=m3*sy;out[4]=m4*sy;out[5]=m5*sy;
                out[6]=m6;out[7]=m7;out[8]=m8;
                return out;
            },
            /** @param {ArrayLike<number>} m @returns {number} */
            determinant(m) {
                // @ts-ignore - Float32Array/number[] is iterable at runtime; ArrayLike<number> lacks Symbol.iterator in TS types
                const [a,b,c,d,e,f,g,h,i] = m;
                return a*(e*i-f*h)-d*(b*i-c*h)+g*(b*f-c*e);
            },
            /** Invert m into out. Returns false (and leaves out untouched) if m is singular. @param {Float32Array} out @param {ArrayLike<number>} m @returns {boolean} */
            invert(out, m) {
                const det = mat3.determinant(m);
                if (Math.abs(det) < 1e-10) return false;
                const inv = 1/det;
                // @ts-ignore - Float32Array/number[] is iterable at runtime; ArrayLike<number> lacks Symbol.iterator in TS types
                const [a,b,c,d,e,f,g,h,i] = m;
                out[0]=(e*i-f*h)*inv; out[1]=(c*h-b*i)*inv; out[2]=(b*f-c*e)*inv;
                out[3]=(f*g-d*i)*inv; out[4]=(a*i-c*g)*inv; out[5]=(c*d-a*f)*inv;
                out[6]=(d*h-e*g)*inv; out[7]=(b*g-a*h)*inv; out[8]=(a*e-b*d)*inv;
                return true;
            },
            /** Transpose m into out. @param {Float32Array} out @param {ArrayLike<number>} m @returns {Float32Array} */
            transpose(out, m) {
                out[0]=m[0];out[1]=m[3];out[2]=m[6];
                out[3]=m[1];out[4]=m[4];out[5]=m[7];
                out[6]=m[2];out[7]=m[5];out[8]=m[8];
                return out;
            },
            /** Multiply a 2D point by the affine 3×3 m (ignores translation row). @param {Float32Array} outV2 @param {ArrayLike<number>} m @param {ArrayLike<number>} v @returns {Float32Array} */
            transform(outV2, m, v) {
                const x=v[0], y=v[1];
                outV2[0]=m[0]*x+m[3]*y+m[6];
                outV2[1]=m[1]*x+m[4]*y+m[7];
                return outV2;
            },
        };

        // ── mat4 (column-major, 4x4) ──────────────────────────
        /**
         * 4×4 column-major matrices backed by Float32Array(16). All ops use
         * out-parameter convention; `out` may alias `m`.
         * @namespace mat4
         */
        const mat4 = {
            /** Create a new identity matrix. @returns {Float32Array} */
            create() { const m=new Float32Array(16); m[0]=1;m[5]=1;m[10]=1;m[15]=1; return m; },
            /** Reset to identity. @param {Float32Array} out @returns {Float32Array} */
            identity(out) { out.fill(0); out[0]=1;out[5]=1;out[10]=1;out[15]=1; return out; },
            /** @param {Float32Array} out @param {ArrayLike<number>} src @returns {Float32Array} */
            copy(out,src) { for(let i=0;i<16;i++) out[i]=src[i]; return out; },
            /** out = a · b. @param {Float32Array} out @param {ArrayLike<number>} a @param {ArrayLike<number>} b @returns {Float32Array} */
            multiply(out, a, b) {
                const a0=a[0],a1=a[1],a2=a[2],a3=a[3],a4=a[4],a5=a[5],a6=a[6],a7=a[7];
                const a8=a[8],a9=a[9],a10=a[10],a11=a[11],a12=a[12],a13=a[13],a14=a[14],a15=a[15];
                let b0=b[0],b1=b[1],b2=b[2],b3=b[3];
                out[0]=a0*b0+a4*b1+a8*b2+a12*b3; out[1]=a1*b0+a5*b1+a9*b2+a13*b3;
                out[2]=a2*b0+a6*b1+a10*b2+a14*b3; out[3]=a3*b0+a7*b1+a11*b2+a15*b3;
                b0=b[4];b1=b[5];b2=b[6];b3=b[7];
                out[4]=a0*b0+a4*b1+a8*b2+a12*b3; out[5]=a1*b0+a5*b1+a9*b2+a13*b3;
                out[6]=a2*b0+a6*b1+a10*b2+a14*b3; out[7]=a3*b0+a7*b1+a11*b2+a15*b3;
                b0=b[8];b1=b[9];b2=b[10];b3=b[11];
                out[8]=a0*b0+a4*b1+a8*b2+a12*b3; out[9]=a1*b0+a5*b1+a9*b2+a13*b3;
                out[10]=a2*b0+a6*b1+a10*b2+a14*b3; out[11]=a3*b0+a7*b1+a11*b2+a15*b3;
                b0=b[12];b1=b[13];b2=b[14];b3=b[15];
                out[12]=a0*b0+a4*b1+a8*b2+a12*b3; out[13]=a1*b0+a5*b1+a9*b2+a13*b3;
                out[14]=a2*b0+a6*b1+a10*b2+a14*b3; out[15]=a3*b0+a7*b1+a11*b2+a15*b3;
                return out;
            },
            /** out = m · translation(v). @param {Float32Array} out @param {ArrayLike<number>} m @param {ArrayLike<number>} v @returns {Float32Array} */
            translate(out, m, v) {
                const tx=v[0],ty=v[1],tz=v[2];
                if (out !== m) { for(let i=0;i<16;i++) out[i]=m[i]; }
                out[12]=m[0]*tx+m[4]*ty+m[8]*tz+m[12];
                out[13]=m[1]*tx+m[5]*ty+m[9]*tz+m[13];
                out[14]=m[2]*tx+m[6]*ty+m[10]*tz+m[14];
                out[15]=m[3]*tx+m[7]*ty+m[11]*tz+m[15];
                return out;
            },
            /** out = m · rotation around `axis` by `rad` (axis normalized internally). @param {Float32Array} out @param {ArrayLike<number>} m @param {number} rad @param {ArrayLike<number>} axis @returns {Float32Array} */
            rotate(out, m, rad, axis) {
                let x=axis[0],y=axis[1],z=axis[2];
                const len=Math.sqrt(x*x+y*y+z*z)||1; x/=len;y/=len;z/=len;
                const c=Math.cos(rad),s=Math.sin(rad),t=1-c;
                const b00=x*x*t+c,b01=y*x*t+z*s,b02=z*x*t-y*s;
                const b10=x*y*t-z*s,b11=y*y*t+c,b12=z*y*t+x*s;
                const b20=x*z*t+y*s,b21=y*z*t-x*s,b22=z*z*t+c;
                // @ts-ignore - Float32Array/number[] is iterable at runtime; ArrayLike<number> lacks Symbol.iterator in TS types
                const [a0,a1,a2,a3,a4,a5,a6,a7,a8,a9,a10,a11] = m;
                out[0]=a0*b00+a4*b01+a8*b02; out[1]=a1*b00+a5*b01+a9*b02;
                out[2]=a2*b00+a6*b01+a10*b02; out[3]=a3*b00+a7*b01+a11*b02;
                out[4]=a0*b10+a4*b11+a8*b12; out[5]=a1*b10+a5*b11+a9*b12;
                out[6]=a2*b10+a6*b11+a10*b12; out[7]=a3*b10+a7*b11+a11*b12;
                out[8]=a0*b20+a4*b21+a8*b22; out[9]=a1*b20+a5*b21+a9*b22;
                out[10]=a2*b20+a6*b21+a10*b22; out[11]=a3*b20+a7*b21+a11*b22;
                if (out !== m) { out[12]=m[12];out[13]=m[13];out[14]=m[14];out[15]=m[15]; }
                return out;
            },
            /** out = m · scale(v). @param {Float32Array} out @param {ArrayLike<number>} m @param {ArrayLike<number>} v @returns {Float32Array} */
            scale(out, m, v) {
                const sx=v[0],sy=v[1],sz=v[2];
                out[0]=m[0]*sx;out[1]=m[1]*sx;out[2]=m[2]*sx;out[3]=m[3]*sx;
                out[4]=m[4]*sy;out[5]=m[5]*sy;out[6]=m[6]*sy;out[7]=m[7]*sy;
                out[8]=m[8]*sz;out[9]=m[9]*sz;out[10]=m[10]*sz;out[11]=m[11]*sz;
                out[12]=m[12];out[13]=m[13];out[14]=m[14];out[15]=m[15];
                return out;
            },
            /** Invert m into out. Returns false if m is singular. @param {Float32Array} out @param {ArrayLike<number>} m @returns {boolean} */
            invert(out, m) {
                // @ts-ignore - Float32Array/number[] is iterable at runtime; ArrayLike<number> lacks Symbol.iterator in TS types
                const [a00,a01,a02,a03,a10,a11,a12,a13,a20,a21,a22,a23,a30,a31,a32,a33] = m;
                const b00=a00*a11-a01*a10, b01=a00*a12-a02*a10, b02=a00*a13-a03*a10;
                const b03=a01*a12-a02*a11, b04=a01*a13-a03*a11, b05=a02*a13-a03*a12;
                const b06=a20*a31-a21*a30, b07=a20*a32-a22*a30, b08=a20*a33-a23*a30;
                const b09=a21*a32-a22*a31, b10=a21*a33-a23*a31, b11=a22*a33-a23*a32;
                let det=b00*b11-b01*b10+b02*b09+b03*b08-b04*b07+b05*b06;
                if (!det) return false;
                det=1/det;
                out[0]=(a11*b11-a12*b10+a13*b09)*det; out[1]=(a02*b10-a01*b11-a03*b09)*det;
                out[2]=(a31*b05-a32*b04+a33*b03)*det; out[3]=(a22*b04-a21*b05-a23*b03)*det;
                out[4]=(a12*b08-a10*b11-a13*b07)*det; out[5]=(a00*b11-a02*b08+a03*b07)*det;
                out[6]=(a32*b02-a30*b05-a33*b01)*det; out[7]=(a20*b05-a22*b02+a23*b01)*det;
                out[8]=(a10*b10-a11*b08+a13*b06)*det; out[9]=(a01*b08-a00*b10-a03*b06)*det;
                out[10]=(a30*b04-a31*b02+a33*b00)*det; out[11]=(a21*b02-a20*b04-a23*b00)*det;
                out[12]=(a11*b07-a10*b09-a12*b06)*det; out[13]=(a00*b09-a01*b07+a02*b06)*det;
                out[14]=(a31*b01-a30*b03-a32*b00)*det; out[15]=(a20*b03-a21*b01+a22*b00)*det;
                return true;
            },
            /** Transpose m into out. @param {Float32Array} out @param {ArrayLike<number>} m @returns {Float32Array} */
            transpose(out, m) {
                if (out === m) {
                    let t;
                    t=m[1];out[1]=m[4];out[4]=t; t=m[2];out[2]=m[8];out[8]=t;
                    t=m[3];out[3]=m[12];out[12]=t; t=m[6];out[6]=m[9];out[9]=t;
                    t=m[7];out[7]=m[13];out[13]=t; t=m[11];out[11]=m[14];out[14]=t;
                } else {
                    out[0]=m[0];out[1]=m[4];out[2]=m[8];out[3]=m[12];
                    out[4]=m[1];out[5]=m[5];out[6]=m[9];out[7]=m[13];
                    out[8]=m[2];out[9]=m[6];out[10]=m[10];out[11]=m[14];
                    out[12]=m[3];out[13]=m[7];out[14]=m[11];out[15]=m[15];
                }
                return out;
            },
            /** Build a perspective projection matrix. @param {Float32Array} out @param {number} fovY radians @param {number} aspect @param {number} near @param {number} far @returns {Float32Array} */
            perspective(out, fovY, aspect, near, far) {
                const f=1/Math.tan(fovY/2);
                const nf = 1/(near-far);
                out.fill(0);
                out[0]=f/aspect; out[5]=f;
                out[10]=(far+near)*nf; out[11]=-1;
                out[14]=(2*far*near)*nf;
                return out;
            },
            /** Build an orthographic projection matrix. @param {Float32Array} out @param {number} left @param {number} right @param {number} bottom @param {number} top @param {number} near @param {number} far @returns {Float32Array} */
            ortho(out, left, right, bottom, top, near, far) {
                const lr=1/(left-right), bt=1/(bottom-top), nf=1/(near-far);
                out[0]=-2*lr; out[1]=0; out[2]=0; out[3]=0;
                out[4]=0; out[5]=-2*bt; out[6]=0; out[7]=0;
                out[8]=0; out[9]=0; out[10]=2*nf; out[11]=0;
                out[12]=(left+right)*lr; out[13]=(top+bottom)*bt; out[14]=(far+near)*nf; out[15]=1;
                return out;
            },
            /** Build a view matrix looking from `eye` toward `center` with `up` reference. @param {Float32Array} out @param {ArrayLike<number>} eye @param {ArrayLike<number>} center @param {ArrayLike<number>} up @returns {Float32Array} */
            lookAt(out, eye, center, up) {
                const ex=eye[0],ey=eye[1],ez=eye[2];
                const cx=center[0],cy=center[1],cz=center[2];
                let fx=ex-cx,fy=ey-cy,fz=ez-cz;
                const fl=Math.sqrt(fx*fx+fy*fy+fz*fz)||1; fx/=fl;fy/=fl;fz/=fl;
                let rx=up[1]*fz-up[2]*fy, ry=up[2]*fx-up[0]*fz, rz=up[0]*fy-up[1]*fx;
                const rl=Math.sqrt(rx*rx+ry*ry+rz*rz)||1; rx/=rl;ry/=rl;rz/=rl;
                const ux=fy*rz-fz*ry, uy=fz*rx-fx*rz, uz=fx*ry-fy*rx;
                out[0]=rx;out[1]=ux;out[2]=fx;out[3]=0;
                out[4]=ry;out[5]=uy;out[6]=fy;out[7]=0;
                out[8]=rz;out[9]=uz;out[10]=fz;out[11]=0;
                out[12]=-(rx*ex+ry*ey+rz*ez);
                out[13]=-(ux*ex+uy*ey+uz*ez);
                out[14]=-(fx*ex+fy*ey+fz*ez);
                out[15]=1;
                return out;
            },
            /**
             * Transform a 3D point by m, performing perspective divide.
             * If the computed w is 0 it falls back to 1 (degenerate inputs
             * silently produce uniform-scaled output).
             * @param {Float32Array} outV3
             * @param {ArrayLike<number>} m
             * @param {ArrayLike<number>} v
             * @returns {Float32Array}
             */
            transform(outV3, m, v) {
                const x=v[0],y=v[1],z=v[2];
                const w = m[3]*x+m[7]*y+m[11]*z+m[15] || 1;
                outV3[0]=(m[0]*x+m[4]*y+m[8]*z+m[12])/w;
                outV3[1]=(m[1]*x+m[5]*y+m[9]*z+m[13])/w;
                outV3[2]=(m[2]*x+m[6]*y+m[10]*z+m[14])/w;
                return outV3;
            },
            /** Transform a 4D vector by m without perspective divide. @param {Float32Array} outV4 @param {ArrayLike<number>} m @param {ArrayLike<number>} v @returns {Float32Array} */
            transform4(outV4, m, v) {
                const x=v[0],y=v[1],z=v[2],w=v[3];
                outV4[0]=m[0]*x+m[4]*y+m[8]*z+m[12]*w;
                outV4[1]=m[1]*x+m[5]*y+m[9]*z+m[13]*w;
                outV4[2]=m[2]*x+m[6]*y+m[10]*z+m[14]*w;
                outV4[3]=m[3]*x+m[7]*y+m[11]*z+m[15]*w;
                return outV4;
            },
        };

        return { vec2, vec3, vec4, mat3, mat4 };
    },
};
