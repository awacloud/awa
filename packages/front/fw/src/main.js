// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// packages/front/fw/src/main.js
import { logger } from './core/logger.js';
import { ModuleRuntime, runtimeSource } from './core/runtime.js';
import { createWorkerRuntime } from './core/worker-helper.js';
import { readyState } from './core/readyState.js';


const ENV = {
    DEV: false,
    LOG: true
};

/* dev_only */
ENV.DEV = true;
/* !dev_only */

const log = ENV.LOG ? logger.main(ENV.DEV) : false;
const runtime = new ModuleRuntime();
// @ts-ignore - runtime is ModuleRuntime from runtime.js; worker-helper.js has its own compatible typedef
const createWorker = createWorkerRuntime(ENV, runtime, runtimeSource, log, logger.worker.toString());
const domReady = readyState();

export { ENV, log, runtime, createWorker, domReady };
export default { ENV, log, runtime, createWorker, domReady };

/* ── Inline module registration:
    import { hex } from './io/codec/hex.js';
    import { uid } from './io/utils/uid.js';
    const runtime = new ModuleRuntime()
        .register(hex)
        .register(uid);
*/

/* ── Import module registration:
    import modules from './core/modules.js';
    fw.runtime.registerAll(modules);
 */