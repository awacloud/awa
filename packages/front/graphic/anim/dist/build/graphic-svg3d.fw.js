/* GENERATED — do not edit. Source: tools/generate-prebuilds.mjs */

/**
 * @fileoverview `@awacloud/graphic/bundles/prebuilt/graphic-svg3d-package` — pre-built single-factory bundle.
 *
 * Variant **package** : declares the 5 fw modules as dependencies and inlines every
 * graphic-local factory transitively reachable from `graphic.svg3d` .
 *
 * Sibling modules DECLARED (not inlined), DI-injected: graphic.scopedIds, graphic.svgApply, graphic.svgBuild, graphic.scheduler, graphic.tween, graphic.timeline.
 *
 * @module graphic/bundles/prebuilt/graphic-svg3d-package
 */

export const graphicSvg3dPackage = {
    name: "graphicSvg3dPackage",
    dependencies: ["secPolicy","dom","interp","easing","clock","graphic.scopedIds","graphic.svgApply","graphic.svgBuild","graphic.scheduler","graphic.tween","graphic.timeline"],
    factory(secPolicy, dom, interp, easing, clock, __ext_graphic_scopedIds, __ext_graphic_svgApply, __ext_graphic_svgBuild, __ext_graphic_scheduler, __ext_graphic_tween, __ext_graphic_timeline) {
    const __reg = Object.create(null);
    const __cache = Object.create(null);
    function __register(m) { __reg[m.name] = m; }
    function __resolve(name) {
        if (name in __cache) return __cache[name];
        const def = __reg[name];
        if (!def) throw new Error('prebuilt: unknown module ' + name);
        const args = def.dependencies.map(__resolve);
        return (__cache[name] = def.factory.apply({}, args));
    }

    // fw modules — injected by DI.
    __cache["secPolicy"] = secPolicy;
    __cache["dom"] = dom;
    __cache["interp"] = interp;
    __cache["easing"] = easing;
    __cache["clock"] = clock;

    // sibling package modules — injected by DI (declared, not inlined).
    __cache["graphic.scopedIds"] = __ext_graphic_scopedIds;
    __cache["graphic.svgApply"] = __ext_graphic_svgApply;
    __cache["graphic.svgBuild"] = __ext_graphic_svgBuild;
    __cache["graphic.scheduler"] = __ext_graphic_scheduler;
    __cache["graphic.tween"] = __ext_graphic_tween;
    __cache["graphic.timeline"] = __ext_graphic_timeline;

    // graphic-local factories — inlined and topo-ordered.
    __register({ name: "svg3d.vec3", dependencies: [], factory: function() {
    function dot3(ax, ay, az, bx, by, bz) {
      return ax * bx + ay * by + az * bz;
    }
    function cross3(ax, ay, az, bx, by, bz, out) {
      out[0] = ay * bz - az * by;
      out[1] = az * bx - ax * bz;
      out[2] = ax * by - ay * bx;
      return out;
    }
    function length3(x, y, z) {
      return Math.sqrt(x * x + y * y + z * z);
    }
    function rotationMatrix3(rx, ry, rz, out) {
      const m = out || new Float64Array(9), cx = Math.cos(rx), sx = Math.sin(rx), cy = Math.cos(ry), sy = Math.sin(ry), cz = Math.cos(rz), sz = Math.sin(rz);
      m[0] = cz * cy + sz * sx * sy;
      m[1] = sz * cx;
      m[2] = cz * sy - sz * sx * cy;
      m[3] = -sz * cy + cz * sx * sy;
      m[4] = cz * cx;
      m[5] = -sz * sy - cz * sx * cy;
      m[6] = -cx * sy;
      m[7] = sx;
      m[8] = cx * cy;
      return m;
    }
    function applyMatrix3(m, x, y, z, out) {
      out[0] = m[0] * x + m[1] * y + m[2] * z;
      out[1] = m[3] * x + m[4] * y + m[5] * z;
      out[2] = m[6] * x + m[7] * y + m[8] * z;
      return out;
    }
    return { dot3, cross3, length3, rotationMatrix3, applyMatrix3 };
  } });
    __register({ name: "svg3d.mesh", dependencies: ["svg3d.vec3"], factory: function(vec3) {
    function decodeHeightmap(source) {
      if (source === null || typeof source !== "object")
        throw TypeError("svg3d.mesh: heightmap must be { side, heights } or { data, width, height }");
      if (source.data !== void 0 && source.data !== null) {
        const { width, height } = source;
        if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1)
          throw TypeError("svg3d.mesh: image heightmap needs integer width/height \u2265 1");
        if (width !== height)
          throw TypeError(`svg3d.mesh: image heightmap must be square (got ${width}\xD7${height})`);
        const n = width * height;
        if (source.data.length < n * 4)
          throw RangeError(`svg3d.mesh: image heightmap needs ${n * 4} bytes, got ${source.data.length}`);
        const heights = new Float64Array(n);
        for (let p = 0;p < n; p += 1)
          heights[p] = source.data[p * 4] / 255;
        return { side: width, heights };
      }
      if (source.heights !== void 0 && source.heights !== null) {
        const side = source.side;
        if (!Number.isInteger(side) || side < 1)
          throw TypeError("svg3d.mesh: sample heightmap needs an integer side \u2265 1");
        const src = source.heights;
        if (src.length !== side * side)
          throw RangeError(`svg3d.mesh: sample heightmap needs ${side * side} values, got ${src.length}`);
        const heights = new Float64Array(side * side);
        for (let p = 0;p < heights.length; p += 1)
          heights[p] = src[p];
        return { side, heights };
      }
      throw TypeError("svg3d.mesh: heightmap must be { side, heights } or { data, width, height }");
    }
    function hex2(c) {
      let v = Math.round(c);
      if (v < 0)
        v = 0;
      if (v > 255)
        v = 255;
      const s = v.toString(16);
      return s.length === 1 ? `0${s}` : s;
    }
    function buildColorLut() {
      const lut = Array(528);
      for (let b = 0;b < 16; b += 1) {
        const h = b / 15, r0 = 129 - h * 127, g0 = 128 + h * 127;
        for (let s = 0;s < 33; s += 1) {
          const amt = Math.round(2.55 * -(s / 32 * 50));
          lut[b * 33 + s] = `#${hex2(r0 + amt)}${hex2(g0 + amt)}${hex2(51 + amt)}`;
        }
      }
      return lut;
    }
    function buildWaterLut() {
      const lut = Array(33);
      for (let s = 0;s < 33; s += 1) {
        const amt = Math.round(2.55 * -(s / 32 * 50));
        lut[s] = `#${hex2(amt)}${hex2(amt)}${hex2(221 + amt)}`;
      }
      return lut;
    }
    function normaliseHeights(heights, side) {
      const n = side * side;
      if (heights === void 0 || heights === null)
        return new Float64Array(n);
      if (typeof heights.length === "number") {
        if (heights.length !== n)
          throw RangeError(`svg3d.mesh: heights needs ${n} values for cells=${side - 1}, got ${heights.length}`);
        const out = new Float64Array(n);
        for (let p = 0;p < n; p += 1)
          out[p] = heights[p];
        return out;
      }
      const decoded = decodeHeightmap(heights);
      if (decoded.side !== side)
        throw RangeError(`svg3d.mesh: heightmap side ${decoded.side} does not match cells=${side - 1} (needs ${side})`);
      return decoded.heights;
    }
    function buildGridMesh(opts) {
      const o = opts || {}, cells = o.cells;
      if (!Number.isInteger(cells) || cells < 1)
        throw TypeError("svg3d.mesh: cells must be an integer \u2265 1");
      const side = cells + 1, spacing = o.spacing === void 0 ? 40 : o.spacing, heightScale = o.heightScale === void 0 ? 220 : o.heightScale, heights = normaliseHeights(o.heights, side), vertexCount = side * side, triangleCount = 2 * cells * cells, positions = new Float64Array(vertexCount * 3), half = cells * spacing / 2;
      for (let j = 0;j < side; j += 1)
        for (let i = 0;i < side; i += 1) {
          const v = j * side + i;
          positions[v * 3] = i * spacing - half;
          positions[v * 3 + 1] = -heights[v] * heightScale;
          positions[v * 3 + 2] = j * spacing - half;
        }
      const indices = new Uint32Array(triangleCount * 3);
      let t = 0;
      for (let j = 0;j < cells; j += 1)
        for (let i = 0;i < cells; i += 1) {
          const v00 = j * side + i, v10 = v00 + 1, v01 = v00 + side, v11 = v01 + 1;
          indices[t * 3] = v00;
          indices[t * 3 + 1] = v11;
          indices[t * 3 + 2] = v10;
          t += 1;
          indices[t * 3] = v00;
          indices[t * 3 + 1] = v01;
          indices[t * 3 + 2] = v11;
          t += 1;
        }
      const normals = new Float64Array(triangleCount * 3), normalLen = new Float64Array(triangleCount), centroids = new Float64Array(triangleCount * 3), baseQ = new Uint8Array(triangleCount), water = new Uint8Array(triangleCount), n = new Float64Array(3);
      for (let f = 0;f < triangleCount; f += 1) {
        const i1 = indices[f * 3] * 3, i2 = indices[f * 3 + 1] * 3, i3 = indices[f * 3 + 2] * 3, p1x = positions[i1], p1y = positions[i1 + 1], p1z = positions[i1 + 2], p2x = positions[i2], p2y = positions[i2 + 1], p2z = positions[i2 + 2], p3x = positions[i3], p3y = positions[i3 + 1], p3z = positions[i3 + 2];
        vec3.cross3(p1x - p2x, p1y - p2y, p1z - p2z, p3x - p2x, p3y - p2y, p3z - p2z, n);
        normals[f * 3] = n[0];
        normals[f * 3 + 1] = n[1];
        normals[f * 3 + 2] = n[2];
        normalLen[f] = vec3.length3(n[0], n[1], n[2]);
        const cx = (p1x + p2x + p3x) / 3, cy = (p1y + p2y + p3y) / 3, cz = (p1z + p2z + p3z) / 3;
        centroids[f * 3] = cx;
        centroids[f * 3 + 1] = cy;
        centroids[f * 3 + 2] = cz;
        const hNorm = heightScale > 0 ? Math.min(1, Math.max(0, -cy / heightScale)) : 0;
        let q = Math.round(hNorm * 15);
        if (q < 0)
          q = 0;
        if (q > 15)
          q = 15;
        baseQ[f] = q;
        water[f] = heights[indices[f * 3]] === 0 && heights[indices[f * 3 + 1]] === 0 && heights[indices[f * 3 + 2]] === 0 ? 1 : 0;
      }
      return {
        cells,
        side,
        vertexCount,
        triangleCount,
        spacing,
        heightScale,
        positions,
        indices,
        normals,
        normalLen,
        centroids,
        baseQ,
        water,
        baseLevels: 16,
        shadeLevels: 33,
        colorLut: buildColorLut(),
        waterLut: buildWaterLut()
      };
    }
    return {
      BASE_LEVELS: 16,
      SHADE_LEVELS: 33,
      decodeHeightmap,
      buildColorLut,
      buildGridMesh
    };
  } });
    __register({ name: "svg3d.project", dependencies: ["svg3d.vec3"], factory: function(vec3) {
    function createCamera(opts) {
      const o = opts || {}, width = o.width === void 0 ? 1280 : o.width, height = o.height === void 0 ? 800 : o.height;
      return {
        x: o.x === void 0 ? 0 : o.x,
        y: o.y === void 0 ? -900 : o.y,
        z: o.z === void 0 ? 0 : o.z,
        rx: o.rx === void 0 ? 0.55 : o.rx,
        ry: o.ry === void 0 ? 0 : o.ry,
        rz: o.rz === void 0 ? 0 : o.rz,
        depth: o.depth === void 0 ? 900 : o.depth,
        near: o.near === void 0 ? 1 : o.near,
        offsetX: width / 2,
        offsetY: height / 2
      };
    }
    function createFrameBuffers(mesh) {
      return {
        px: new Float64Array(mesh.vertexCount),
        py: new Float64Array(mesh.vertexCount),
        pz: new Float64Array(mesh.vertexCount),
        depth: new Float64Array(mesh.triangleCount),
        shadeQ: new Uint8Array(mesh.triangleCount),
        order: new Uint32Array(mesh.triangleCount),
        scratch: new Uint32Array(mesh.triangleCount),
        m: new Float64Array(9)
      };
    }
    const frameBufferCache = new WeakMap;
    function bufferFor(mesh) {
      let b = frameBufferCache.get(mesh);
      if (b === void 0) {
        b = createFrameBuffers(mesh);
        frameBufferCache.set(mesh, b);
      }
      return b;
    }
    function projectFrame(mesh, camera, buf) {
      const b = buf || bufferFor(mesh), m = vec3.rotationMatrix3(camera.rx, camera.ry, camera.rz, b.m), m0 = m[0], m1 = m[1], m2 = m[2], m3 = m[3], m4 = m[4], m5 = m[5], m6 = m[6], m7 = m[7], m8 = m[8], pos = mesh.positions, px = b.px, py = b.py, pz = b.pz, camX = camera.x, camY = camera.y, camZ = camera.z, fd = camera.depth, ox = camera.offsetX, oy = camera.offsetY, near = camera.near === void 0 ? 1 : Math.max(camera.near, 0.000000001);
      for (let v = 0, nv = mesh.vertexCount;v < nv; v += 1) {
        const dx = pos[v * 3] - camX, dy = pos[v * 3 + 1] - camY, dz = pos[v * 3 + 2] - camZ, rxv = m0 * dx + m1 * dy + m2 * dz, ryv = m3 * dx + m4 * dy + m5 * dz, rzv = m6 * dx + m7 * dy + m8 * dz, scale = fd / rzv;
        px[v] = scale * rxv + ox;
        py[v] = scale * ryv + oy;
        pz[v] = rzv < near ? 0 : scale;
      }
      const { indices: idx, normals: nrm, normalLen: nlen, centroids: cen } = mesh, depth = b.depth, shadeQ = b.shadeQ, order = b.order, shadeMax = (mesh.shadeLevels > 0 ? mesh.shadeLevels : 33) - 1;
      let count = 0;
      for (let f = 0, tc = mesh.triangleCount;f < tc; f += 1) {
        const a = idx[f * 3], bb = idx[f * 3 + 1], c = idx[f * 3 + 2], za = pz[a], zb = pz[bb], zc = pz[c];
        if (za <= 0 || zb <= 0 || zc <= 0)
          continue;
        const vx = camX - cen[f * 3], vy = camY - cen[f * 3 + 1], vz = camZ - cen[f * 3 + 2], nx = nrm[f * 3], ny = nrm[f * 3 + 1], nz = nrm[f * 3 + 2], dp = nx * vx + ny * vy + nz * vz;
        if (dp <= 0)
          continue;
        const lenCam = Math.sqrt(vx * vx + vy * vy + vz * vz);
        let sq = Math.round((1 - dp / lenCam / nlen[f]) * shadeMax);
        if (sq < 0)
          sq = 0;
        if (sq > shadeMax)
          sq = shadeMax;
        shadeQ[f] = sq;
        depth[f] = (za + zb + zc) / 3;
        order[count] = f;
        count += 1;
      }
      sortByDepth(order, b.scratch, depth, count);
      return count;
    }
    function sortByDepth(order, scratch, depth, count) {
      let src = order, dst = scratch;
      for (let width = 1;width < count; width *= 2) {
        for (let lo = 0;lo < count; lo += width * 2) {
          let mid = lo + width;
          if (mid > count)
            mid = count;
          let hi = lo + width * 2;
          if (hi > count)
            hi = count;
          let i = lo, j = mid, k = lo;
          while (i < mid && j < hi) {
            if (depth[src[j]] < depth[src[i]]) {
              dst[k] = src[j];
              j += 1;
            } else {
              dst[k] = src[i];
              i += 1;
            }
            k += 1;
          }
          while (i < mid) {
            dst[k] = src[i];
            i += 1;
            k += 1;
          }
          while (j < hi) {
            dst[k] = src[j];
            j += 1;
            k += 1;
          }
        }
        const tmp = src;
        src = dst;
        dst = tmp;
      }
      if (src !== order)
        for (let k = 0;k < count; k += 1)
          order[k] = src[k];
    }
    return { SHADE_LEVELS: 33, createCamera, createFrameBuffers, projectFrame };
  } });
    __register({ name: "svg3d.apply", dependencies: [], factory: function() {
    const round1 = (v) => Math.round(v * 10) / 10;
    function createPolygonRig(opts) {
      const { svgBuild, svgApply, mesh } = opts, width = opts.width === void 0 ? 1280 : opts.width, height = opts.height === void 0 ? 800 : opts.height, writeFill = opts.writeFill !== !1, capacity = mesh.triangleCount, children = Array(capacity);
      for (let k = 0;k < capacity; k += 1)
        children[k] = { tag: "polygon", attrs: { points: "", fill: "#000000" } };
      const root = svgBuild.build({
        tag: "svg",
        attrs: { id: "root", width, height, viewBox: `0 0 ${width} ${height}` },
        children: [{ tag: "g", attrs: { id: "faces" }, children }]
      }, { idScope: opts.idScope }), group = root.childNodes[0], els = Array(capacity);
      for (let k = 0;k < capacity; k += 1)
        els[k] = group.childNodes[k];
      const { svgAttr } = svgApply, idx = mesh.indices, baseQ = mesh.baseQ, lut = mesh.colorLut, shadeLevels = mesh.shadeLevels;
      let prevCount = 0;
      function update(buf, count) {
        const { px, py, order, shadeQ } = buf;
        let writes = 0;
        for (let k = 0;k < count; k += 1) {
          const f = order[k], a = idx[f * 3], b = idx[f * 3 + 1], c = idx[f * 3 + 2], points = `${round1(px[a])},${round1(py[a])} ${round1(px[b])},${round1(py[b])} ${round1(px[c])},${round1(py[c])}`, el = els[k];
          svgAttr(el, "points", points);
          writes += 1;
          if (writeFill) {
            svgAttr(el, "fill", lut[baseQ[f] * shadeLevels + shadeQ[f]]);
            writes += 1;
          }
        }
        for (let k = count;k < prevCount; k += 1) {
          svgAttr(els[k], "points", "");
          writes += 1;
        }
        prevCount = count;
        return writes;
      }
      return { root, nodeCount: capacity, update };
    }
    function createPathRig(opts) {
      if (opts.faceColors)
        return createClassedPathRig(opts);
      const { svgBuild, svgApply, mesh } = opts, buckets = opts.buckets === void 0 ? 16 : opts.buckets, width = opts.width === void 0 ? 1280 : opts.width, height = opts.height === void 0 ? 800 : opts.height, children = Array(buckets);
      for (let k = 0;k < buckets; k += 1)
        children[k] = { tag: "path", attrs: { d: "", fill: "#000000" } };
      const root = svgBuild.build({
        tag: "svg",
        attrs: { id: "root", width, height, viewBox: `0 0 ${width} ${height}` },
        children: [{ tag: "g", attrs: { id: "faces" }, children }]
      }, { idScope: opts.idScope }), group = root.childNodes[0], paths = Array(buckets);
      for (let k = 0;k < buckets; k += 1)
        paths[k] = group.childNodes[k];
      const { svgAttr } = svgApply, idx = mesh.indices, baseQ = mesh.baseQ, lut = mesh.colorLut, shadeLevels = mesh.shadeLevels;
      function update(buf, count) {
        const { px, py, order, shadeQ } = buf, per = Math.ceil(count / buckets) || 1;
        let writes = 0;
        for (let bkt = 0;bkt < buckets; bkt += 1) {
          const start = bkt * per, end = Math.min(count, start + per);
          let d = "", sumShade = 0, sumBase = 0;
          for (let k = start;k < end; k += 1) {
            const f = order[k], a = idx[f * 3], b = idx[f * 3 + 1], c = idx[f * 3 + 2];
            d += `M${round1(px[a])} ${round1(py[a])}L${round1(px[b])} ${round1(py[b])}L${round1(px[c])} ${round1(py[c])}Z`;
            sumShade += shadeQ[f];
            sumBase += baseQ[f];
          }
          const n = end - start;
          svgAttr(paths[bkt], "d", d);
          writes += 1;
          if (n > 0) {
            const sq = Math.round(sumShade / n), bq = Math.round(sumBase / n);
            svgAttr(paths[bkt], "fill", lut[bq * shadeLevels + sq]);
            writes += 1;
          }
        }
        return writes;
      }
      return { root, nodeCount: buckets, update };
    }
    function createClassedPathRig(opts) {
      const { svgBuild, svgApply, mesh } = opts, fc = typeof opts.faceColors === "object" ? opts.faceColors : {}, buckets = opts.buckets === void 0 ? 16 : opts.buckets, width = opts.width === void 0 ? 1280 : opts.width, height = opts.height === void 0 ? 800 : opts.height, base = fc.base > 0 ? fc.base : 6, shade = fc.shade > 0 ? fc.shade : 6, classes = (base + 1) * shade, baseLevels = mesh.baseLevels, shadeLevels = mesh.shadeLevels, lut = mesh.colorLut, fills = Array(classes);
      for (let b = 0;b <= base; b += 1)
        for (let s = 0;s < shade; s += 1) {
          const sl = Math.round((s + 0.5) / shade * (shadeLevels - 1));
          fills[b * shade + s] = b === base ? mesh.waterLut[sl] : lut[Math.round((b + 0.5) / base * (baseLevels - 1)) * shadeLevels + sl];
        }
      const total = buckets * classes, children = Array(total);
      for (let k = 0;k < total; k += 1) {
        const fill = fills[k % classes];
        children[k] = { tag: "path", attrs: { d: "", fill, stroke: fill, "stroke-width": 1, "stroke-linejoin": "round" } };
      }
      const root = svgBuild.build({
        tag: "svg",
        attrs: { id: "root", width, height, viewBox: `0 0 ${width} ${height}` },
        children: [{ tag: "g", attrs: { id: "faces" }, children }]
      }, { idScope: opts.idScope }), group = root.childNodes[0], paths = Array(total);
      for (let k = 0;k < total; k += 1)
        paths[k] = group.childNodes[k];
      const written = Array(total).fill(""), acc = Array(classes).fill(""), { svgAttr } = svgApply, idx = mesh.indices, baseQ = mesh.baseQ, water = mesh.water;
      function update(buf, count) {
        const { px, py, order, shadeQ } = buf, per = Math.ceil(count / buckets) || 1;
        let writes = 0;
        for (let bkt = 0;bkt < buckets; bkt += 1) {
          const start = bkt * per, end = Math.min(count, start + per);
          for (let c = 0;c < classes; c += 1)
            acc[c] = "";
          for (let k = start;k < end; k += 1) {
            const f = order[k];
            let sc = Math.floor(shadeQ[f] / shadeLevels * shade);
            if (sc > shade - 1)
              sc = shade - 1;
            let bc = base;
            if (!water[f]) {
              bc = Math.floor(baseQ[f] / baseLevels * base);
              if (bc > base - 1)
                bc = base - 1;
            }
            const a = idx[f * 3], b = idx[f * 3 + 1], c = idx[f * 3 + 2];
            acc[bc * shade + sc] += `M${round1(px[a])} ${round1(py[a])}L${round1(px[b])} ${round1(py[b])}L${round1(px[c])} ${round1(py[c])}Z`;
          }
          const off = bkt * classes;
          for (let c = 0;c < classes; c += 1) {
            const d = acc[c];
            if (written[off + c] !== d) {
              svgAttr(paths[off + c], "d", d);
              written[off + c] = d;
              writes += 1;
            }
          }
        }
        return writes;
      }
      return { root, nodeCount: total, update };
    }
    return { createPolygonRig, createPathRig };
  } });
    __register({ name: "graphic.svg3d", dependencies: ["svg3d.vec3","svg3d.mesh","svg3d.project","svg3d.apply","graphic.svgBuild","graphic.scopedIds","graphic.timeline","graphic.tween","graphic.svgApply","graphic.scheduler"], factory: function(vec3Api, meshApi, projectApi, applyApi, svgBuild, scopedIds, timelineMod, tweenMod, svgApply, schedulerMod) {
    const { Timeline } = timelineMod, { Tween } = tweenMod;
    let _instanceSeq = 0;

    class Svg3d {
      constructor(host, heightmap, opts) {
        const o = opts || {}, decoded = meshApi.decodeHeightmap(heightmap), cells = decoded.side - 1;
        if (!Number.isInteger(cells) || cells < 1)
          throw Error(`graphic.svg3d: heightmap side ${decoded.side} is too small (needs >= 2)`);
        const triangleCount = 2 * cells * cells;
        this.mode = o.mode === "polygons" ? "polygons" : "path";
        if (this.mode === "polygons") {
          if (triangleCount > 2048)
            throw Error(`graphic.svg3d: mode:'polygons' supports at most 2048 triangles, got ${triangleCount} \u2014 use the default path mode instead`);
        } else {
          const ceiling = o.maxTriangles === void 0 ? 8192 : o.maxTriangles;
          if (ceiling > 51200)
            throw Error(`graphic.svg3d: maxTriangles ${ceiling} exceeds the measured hard ceiling 51200 (unmeasured territory)`);
          if (triangleCount > ceiling)
            throw Error(`graphic.svg3d: mesh has ${triangleCount} triangles, exceeds the ${ceiling}-triangle ceiling (path mode; override via maxTriangles up to 51200)`);
        }
        this.mesh = meshApi.buildGridMesh({
          cells,
          heights: decoded.heights,
          spacing: o.spacing,
          heightScale: o.heightScale
        });
        const width = o.width > 0 ? o.width : 1280, height = o.height > 0 ? o.height : 800;
        this.camera = projectApi.createCamera(Object.assign({ width, height }, o.camera));
        this._buf = projectApi.createFrameBuffers(this.mesh);
        this.prefix = o.prefix || `svg3d-${_instanceSeq++}`;
        this._scope = scopedIds.createScope(this.prefix);
        const rigOpts = {
          svgBuild,
          svgApply,
          mesh: this.mesh,
          width,
          height,
          idScope: this._scope
        };
        this._rig = this.mode === "polygons" ? applyApi.createPolygonRig(rigOpts) : applyApi.createPathRig(Object.assign(rigOpts, {
          buckets: o.buckets > 0 ? o.buckets : 16,
          faceColors: o.faceColors || !1
        }));
        this.node = this._rig.root;
        if (host && typeof host.appendChild === "function")
          host.appendChild(this.node);
        this._scheduler = o.scheduler || schedulerMod.scheduler;
        this._duration = o.duration > 0 ? o.duration : 4000;
        this._yawTurns = o.yawTurns === void 0 ? 1 : o.yawTurns;
        this._pitchSpan = o.pitchSpan === void 0 ? 0 : o.pitchSpan;
        this._loop = o.loop !== !1;
        this._timeline = null;
        this._playing = !1;
        this._disposed = !1;
        this._renderTickable = { _step: () => this._render() };
        this._pointerScope = null;
        this._drag = null;
        if (o.events && typeof o.events.scope === "function")
          this._bindPointer(o.events, width, height);
        this._render();
      }
      _bindPointer(events, width, height) {
        const scope = events.scope(`${this.prefix}-look`), half = Math.PI / 2, hit = svgBuild.build({
          tag: "rect",
          attrs: { x: 0, y: 0, width, height, fill: "transparent" }
        });
        this.node.insertBefore(hit, this.node.firstChild);
        scope.on("down", this.node, "pointerdown", (e) => {
          if (this._disposed)
            return;
          this.pause();
          this._drag = { x: e.clientX, y: e.clientY, ry: this.camera.ry, rx: this.camera.rx };
          e.preventDefault();
          try {
            this.node.setPointerCapture(e.pointerId);
          } catch {}
        });
        scope.on("move", this.node, "pointermove", (e) => {
          const d = this._drag;
          if (this._disposed || !d)
            return;
          this.camera.ry = d.ry + (d.x - e.clientX) / width * Math.PI;
          const rx = d.rx - (d.y - e.clientY) / height * half;
          this.camera.rx = rx > half ? half : rx < -half ? -half : rx;
          this._render();
        });
        const end = () => {
          this._drag = null;
        };
        scope.on("up", this.node, "pointerup", end);
        scope.on("cancel", this.node, "pointercancel", end);
        this._pointerScope = scope;
      }
      _render() {
        const count = projectApi.projectFrame(this.mesh, this.camera, this._buf);
        this._rig.update(this._buf, count);
      }
      _startCycle() {
        const startRy = this.camera.ry, startRx = this.camera.rx, tl = new Timeline({
          scheduler: this._scheduler,
          onComplete: () => {
            this._timeline = null;
            if (this._loop && this._playing && !this._disposed)
              this._startCycle();
            else {
              this._playing = !1;
              this._scheduler.remove(this._renderTickable);
            }
          }
        });
        tl.add(new Tween({
          target: this.camera,
          property: "ry",
          from: startRy,
          to: startRy + Math.PI * 2 * this._yawTurns,
          duration: this._duration,
          easing: "linear",
          scheduler: this._scheduler,
          apply: (v, target) => {
            target.ry = Number(v);
          }
        }), 0);
        tl.add(new Tween({
          target: this.camera,
          property: "rx",
          from: startRx,
          to: startRx + this._pitchSpan,
          duration: this._duration,
          easing: "linear",
          scheduler: this._scheduler,
          apply: (v, target) => {
            target.rx = Number(v);
          }
        }), 0);
        this._timeline = tl;
        tl.play();
        this._scheduler.remove(this._renderTickable);
        this._scheduler.add(this._renderTickable);
      }
      play() {
        if (this._disposed || this._playing)
          return this;
        this._playing = !0;
        this._startCycle();
        return this;
      }
      pause() {
        if (this._disposed || !this._playing)
          return this;
        this._playing = !1;
        if (this._timeline) {
          this._scheduler.remove(this._timeline);
          this._timeline = null;
        }
        this._scheduler.remove(this._renderTickable);
        return this;
      }
      seek(ms) {
        if (this._disposed)
          return this;
        if (this._restRy === void 0) {
          this._restRy = this.camera.ry;
          this._restRx = this.camera.rx;
        }
        const duration = this._duration, frac = (ms % duration + duration) % duration / duration;
        this.camera.ry = this._restRy + Math.PI * 2 * this._yawTurns * frac;
        this.camera.rx = this._restRx + this._pitchSpan * frac;
        this._render();
        return this;
      }
      setCamera(partial) {
        if (this._disposed)
          return this;
        Object.assign(this.camera, partial || {});
        this._render();
        return this;
      }
      dispose() {
        if (this._disposed)
          return;
        if (this._pointerScope)
          this._pointerScope.clear();
        this._pointerScope = null;
        this._drag = null;
        if (this._timeline)
          this._scheduler.remove(this._timeline);
        this._scheduler.remove(this._renderTickable);
        this._playing = !1;
        this._disposed = !0;
        if (this.node && this.node.parentNode)
          this.node.parentNode.removeChild(this.node);
      }
    }
    function createTerrain(host, heightmap, opts) {
      return new Svg3d(host, heightmap, opts);
    }
    return { Svg3d, createTerrain };
  } });

    const __core = __resolve("graphic.svg3d");
    return __core;
    }
};
