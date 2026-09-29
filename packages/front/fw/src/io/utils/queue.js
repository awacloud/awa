// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * Queue module factory.
 * Exposes a factory that returns the Queue class.
 *
 * @example
 * const Queue = queue.factory();
 * const q = new Queue(2);
 * q.onData = (job, end) => end();
 * q.onEnd = () => {};
 */

/**
 * A concurrency queue instance.
 * @typedef {object} QueueInstance
 * @property {number} concurrency Max number of concurrent jobs.
 * @property {number} length Number of jobs currently queued or running.
 * @property {number} running Number of jobs currently in flight.
 * @property {*} error Error that closed the queue, if any.
 * @property {boolean} stopped Whether `stop()` has been called.
 * @property {(jobs: Array<*>) => void} concat Push an array of jobs in order.
 * @property {(error?: *) => void} end Signal EOF (no more jobs).
 * @property {(job: *, end: Function) => void} onData Job handler; must call `end(error)` when finished.
 * @property {(error: *) => void} onEnd Called once when the queue closes.
 * @property {(job: *) => void} push Push a single job.
 * @property {(error?: *) => void} stop Stop processing; optional error closes with failure.
 */

/**
 * Constructor returned by `queue.factory()`.
 * @typedef {(new (concurrency?: number|boolean) => QueueInstance) & { parseConcurrency: (concurrency: number|boolean) => number }} QueueCtor
 */

export const queue = {
    name: 'queue',
    version: '1.0.0',
    type: 'fw.io.utils',
    dependencies: [],

    /** @returns {QueueCtor} */
    factory() {

        const FLAGS = {
            PROCESSING: 1,
            EOF: 2,
            CLOSING: 4,
            CLOSED: 8
        };
        const CLOSED_CLOSING = FLAGS.CLOSED | FLAGS.CLOSING;

        /**
         * Simple concurrency queue with explicit callbacks.
         * Call `end()` when no more jobs will be pushed.
         */
        class Queue {
            /**
             * @param {number|boolean} [concurrency=1] Max number of concurrent jobs.
             */
            constructor(concurrency) {
                if (arguments.length > 1) {
                    throw new Error('too many arguments');
                }
                this.concurrency = Queue.parseConcurrency(concurrency);
                this.length = 0;
                this.running = 0;
                this.error = undefined;
                this.stopped = false;
                this._flags = 0;
                this._array = [];
                // Using a closure is significantly faster than using Function.bind():
                this._callbackBound = (error) => {
                    this._callback(error);
                };
            }

            /**
             * Push an array of jobs in order.
             * @param {Array<*>} jobs
             */
            concat(jobs) {
                if (!jobs || jobs.constructor !== Array) {
                    throw new Error('jobs must be an Array');
                }
                for (let index = 0, length = jobs.length; index < length; index++) {
                    this.push(jobs[index]);
                }
            }

            /**
             * Signal EOF (no more jobs). Triggers processing completion.
             * @param {*} [error]
             */
            end(error) {
                if (this._flags & FLAGS.EOF) return;
                this._flags |= FLAGS.EOF;
                if (this._flags & CLOSED_CLOSING) return;
                this._tick(error);
            }

            /**
             * Job handler, must call `end(error)` when finished.
             * @param {*} job
             * @param {Function} end
             */
            onData(job, end) {
                throw new Error('Queue.onData callback must be defined');
            }

            /**
             * Called once when the queue closes.
             * @param {*} error
             */
            onEnd(error) {
                throw new Error('Queue.onEnd callback must be defined');
            }

            /**
             * Push a single job.
             * @param {*} job
             */
            push(job) {
                if (this._flags & FLAGS.EOF) {
                    throw new Error('Queue.push() was called after Queue.end()');
                }
                if (this._flags & CLOSED_CLOSING) return;
                this._array.push(job);
                this.length++;
                if (!(this._flags & FLAGS.PROCESSING)) this._process();
            }

            /**
             * Stop processing. Optional error closes the queue with failure.
             * @param {*} [error]
             */
            stop(error) {
                if (this._flags & CLOSED_CLOSING) return;
                // If error is provided, _tick will set this.error and CLOSING.
                // If we set CLOSING here, _tick will not set this.error.
                if (!error) this._flags |= FLAGS.CLOSING;
                this.stopped = true;
                this._tick(error);
            }

            _callback(error) {
                if (this._flags & FLAGS.CLOSED) {
                    throw new Error('an onData handler called end() more than once');
                }
                this.length--;
                this.running--;
                this._tick(error);
            }

            _process() {
                if (this._flags & CLOSED_CLOSING) return;
                if (this._flags & FLAGS.PROCESSING) return;
                this._flags |= FLAGS.PROCESSING;
                while (this._array.length) {
                    if (
                        (this._flags & CLOSED_CLOSING) ||
                        (this.running >= this.concurrency)
                    ) {
                        this._flags &= ~FLAGS.PROCESSING;
                        return;
                    }
                    this.running++;
                    this.onData(this._array.shift(), this._callbackBound);
                }
                this._flags &= ~FLAGS.PROCESSING;
            }

            _tick(error) {
                if (this._flags & FLAGS.CLOSED) return;
                if (error && !(this._flags & FLAGS.CLOSING)) {
                    this._flags |= FLAGS.CLOSING;
                    this.error = error;
                }
                if (this._flags & FLAGS.CLOSING) {
                    if (this.running === 0) {
                        // If stop() was called then this.error will be undefined.
                        // If error was returned then this.error will be defined.
                        this._flags |= FLAGS.CLOSED;
                        this.onEnd(this.error);
                        return;
                    } else {
                        return;
                    }
                }
                if ((this._flags & FLAGS.EOF) && this.length === 0) {
                    this._flags |= FLAGS.CLOSED;
                    this.onEnd(undefined);
                    return;
                }
                this._process();
            }

            /**
             * Normalize concurrency values.
             * @param {number|boolean} concurrency
             * @returns {number}
             */
            static parseConcurrency(concurrency) {
                if (concurrency === undefined) return 1;
                if (concurrency === false) return 1;
                if (concurrency === true) return 1024;
                if (typeof concurrency !== 'number') {
                    throw new Error('concurrency must be a number');
                }
                if (Math.floor(concurrency) !== concurrency) {
                    throw new Error('concurrency must be an integer');
                }
                if (concurrency < 1) {
                    throw new Error('concurrency must be at least 1');
                }
                return concurrency;
            }
        }

        return Queue;
    }
}
