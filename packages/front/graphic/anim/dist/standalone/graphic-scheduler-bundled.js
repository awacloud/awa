/* GENERATED — do not edit. Source: tools/generate-prebuilds.mjs */

/**
 * @fileoverview `@awacloud/graphic/bundles/prebuilt/graphic-scheduler-bundled` — pre-built single-factory bundle.
 *
 * Variant **bundled** : declares no dependencies — every fw and graphic-local
 * factory transitively reachable from `graphic.scheduler`  is inlined.
 *
 * @module graphic/bundles/prebuilt/graphic-scheduler-bundled
 */

export const graphicSchedulerBundled = {
    name: "graphicSchedulerBundled",
    dependencies: [],
    factory() {
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

    // fw modules — inlined (bundled variant).
    __register({ name: "clock", dependencies: [], factory: function() {
    let _lastMono = Date.now();
    function now() {
      return Date.now();
    }
    function monotonic() {
      const t = Date.now();
      if (t < _lastMono)
        return _lastMono;
      _lastMono = t;
      return t;
    }
    function since(t0) {
      return Math.max(0, monotonic() - t0);
    }
    function iso() {
      return new Date().toISOString();
    }
    function format(ms) {
      const n = Number(ms);
      if (!Number.isFinite(n))
        return String(ms);
      const abs = Math.abs(n);
      if (abs < 1)
        return n.toFixed(3) + " ms";
      if (abs < 1000)
        return n.toFixed(1) + " ms";
      if (abs < 60000)
        return (n / 1000).toFixed(3) + " s";
      if (abs < 3600000)
        return (n / 60000).toFixed(2) + " min";
      return (n / 3600000).toFixed(2) + " h";
    }
    return { now, monotonic, since, iso, format };
  } });

    // graphic-local factories — inlined and topo-ordered.
    __register({ name: "graphic.scheduler", dependencies: ["clock"], factory: function(clockApi) {

    class Scheduler {
      constructor(clock) {
        this.active = new Set;
        this._raf = 0;
        this._running = !1;
        const g = globalThis;
        this._now = clock && clock.now || clockApi.monotonic;
        this._schedule = clock && clock.schedule || ((cb) => g.requestAnimationFrame(cb));
        this._cancel = clock && clock.cancel || ((id) => {
          if (g.cancelAnimationFrame)
            g.cancelAnimationFrame(id);
        });
      }
      now() {
        return this._now();
      }
      add(tween) {
        this.active.add(tween);
        if (!this._running)
          this._start();
      }
      remove(tween) {
        this.active.delete(tween);
      }
      _start() {
        this._running = !0;
        const loop = (ts) => {
          this.tick(ts);
          if (this.active.size > 0)
            this._raf = this._schedule(loop);
          else
            this._running = !1;
        };
        this._raf = this._schedule(loop);
      }
      tick(ts) {
        const t = ts == null ? this._now() : ts;
        for (const tween of [...this.active])
          tween._step(t);
      }
      stop() {
        if (this._raf)
          this._cancel(this._raf);
        this._raf = 0;
        this._running = !1;
        this.active.clear();
      }
    }
    const scheduler = new Scheduler;
    return { Scheduler, scheduler };
  } });

    const __core = __resolve("graphic.scheduler");
    return __core;
    }
};
