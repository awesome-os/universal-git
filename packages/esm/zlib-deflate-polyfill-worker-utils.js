// worker-util.ts
// This module isolates the logic for creating and managing web workers.

// The original code uses a custom worker spawner for Node.js compatibility.
// We'll continue to use it as an abstraction.
import wk from './node-worker';
import { FlateError, FlateErrorCode } from './flate'; // Assume error types are in a separate file or the main file

// Re-exporting types for consumers of this module
export { FlateError, FlateErrorCode };

// Type Definitions
export type FlateCallback = (err: FlateError | null, data: Uint8Array) => void;
export type AsyncFlateStreamHandler = (err: FlateError | null, data: Uint8Array, final: boolean) => void;
export type AsyncFlateDrainHandler = (size: number) => void;
export interface AsyncTerminable {
  (): void;
}
export interface AsyncOptions {
  consume?: boolean;
}
export interface AsyncStream {
    ondata: AsyncFlateStreamHandler;
    ondrain?: AsyncFlateDrainHandler;
    queuedSize: number;
    push(chunk: Uint8Array, final?: boolean): void;
    flush?(): void;
    terminate: AsyncTerminable;
}

type DependencyProvider = () => unknown[];
type CachedWorker = {
    script: string;
    data: Record<string, unknown>;
};

const workerCache: CachedWorker[] = [];

/**
 * Serializes dependencies from the main thread's scope into a script string
 * and a data object for a Web Worker. This is the core of the "magic" that
 * allows this library to work as a single file, even after minification.
 * 
 * It works by parsing the string representation of the dependency-providing
 * function (e.g., `() => [varA, varB]`) to extract the variable names (`varA`, `varB`),
 * which will be correctly minified along with the function's code.
 *
 * @param provider A function returning an array of values from its closure.
 * @param script The current script string to append to.
 * @param data The data object to populate with non-function values.
 * @returns The updated script string.
 */
function packageDependencies(
    provider: DependencyProvider,
    script: string,
    data: Record<string, unknown>
): string {
    const values = provider();
    const providerStr = provider.toString();
    const keys = providerStr
        .slice(providerStr.indexOf('[') + 1, providerStr.lastIndexOf(']'))
        .replace(/\s+/g, '')
        .split(',');

    for (let i = 0; i < values.length; ++i) {
        const value = values[i];
        const key = keys[i];

        if (typeof value === 'function') {
            script += `var ${key} = ${value.toString()};\n`;
            const proto = value.prototype;
            if (proto) {
                for (const prop in proto) {
                    if (Object.prototype.hasOwnProperty.call(proto, prop)) {
                        script += `${key}.prototype.${prop} = ${proto[prop].toString()};\n`;
                    }
                }
            }
        } else {
            data[key] = value;
        }
    }
    return script;
}

/**
 * Creates clones of TypedArrays and extracts their ArrayBuffers to be transferred to a worker,
 * which improves performance by avoiding copying. The original data object is mutated
 * to hold the clones.
 * @param data A record containing data to be sent to the worker.
 * @returns A list of transferable ArrayBuffer objects.
 */
function getTransferables(data: Record<string, unknown>): Transferable[] {
    const transferables: Transferable[] = [];
    for (const key in data) {
        const value = data[key] as any;
        if (value && value.buffer instanceof ArrayBuffer) {
            const clone = new (value.constructor)(value);
            data[key] = clone;
            transferables.push(clone.buffer);
        }
    }
    return transferables;
}

/**
 * Creates and initializes a worker. It builds the worker script from dependency providers,
 * handles caching, and sets up message handling.
 * @param dependencyProviders An array of functions that provide the worker's scope.
 * @param workerMessageHandler The primary onmessage handler to be run inside the worker.
 * @param cacheId A unique ID for caching the generated worker script.
 * @param onMainThreadMessage A callback to handle messages and errors from the worker on the main thread.
 * @returns A worker instance.
 */
function createWorker<T, R>(
    dependencyProviders: DependencyProvider[],
    workerMessageHandler: (ev: MessageEvent<T>) => void,
    cacheId: number,
    onMainThreadMessage: (err: FlateError, msg: R) => void
) {
    if (!workerCache[cacheId]) {
        let script = '';
        const data: Record<string, unknown> = {};
        for (const provider of dependencyProviders) {
            script = packageDependencies(provider, script, data);
        }
        workerCache[cacheId] = { script, data };
    }

    const { script: baseScript, data: baseData } = workerCache[cacheId];
    
    const data = { ...baseData };
    const transferables = getTransferables(data);

    // The worker's initial message handler injects data into its global scope,
    // then replaces itself with the actual message handler for the task.
    const bootstrapScript = `
        ${baseScript}
        self.onmessage = function(e) {
            for (var k in e.data) {
                self[k] = e.data[k];
            }
            self.onmessage = ${workerMessageHandler.toString()};
        };
    `;

    return wk(bootstrapScript, cacheId, data, transferables, onMainThreadMessage);
}

/**
 * Runs a single, non-streaming task in a worker.
 * The worker is created, performs one task, sends back the result, and is terminated.
 * @returns A function to terminate the worker prematurely.
 */
export function runTaskInWorker<T extends AsyncOptions>(
    data: Uint8Array,
    options: T,
    dependencyProviders: DependencyProvider[],
    task: (ev: MessageEvent<[Uint8Array, T]>) => void,
    cacheId: number,
    callback: FlateCallback
): AsyncTerminable {
    const worker = createWorker(
        dependencyProviders,
        task,
        cacheId,
        (err, result: Uint8Array) => {
            worker.terminate();
            callback(err, result);
        }
    );
    worker.postMessage([data, options], options.consume ? [data.buffer] : []);
    return () => worker.terminate();
}

/**
 * Runs a streaming task in a worker, proxying the stream's methods.
 * The worker remains active to process multiple chunks of data.
 */
export function runStreamInWorker<T>(
    stream: AsyncStream,
    options: T,
    dependencyProviders: DependencyProvider[],
    init: (ev: MessageEvent<T>) => void,
    cacheId: number,
    flushable: boolean,
    onExtraMessage?: (msg: unknown) => void
): void {
    let terminated = false;
    const err = (code: number, msg: string) => {
        const e: Partial<FlateError> = new Error(msg);
        e.code = code;
        return e as FlateError;
    }

    const worker = createWorker<T, [number] | [Uint8Array, boolean]>(
        dependencyProviders,
        init,
        cacheId,
        (err, data) => {
            if (err) {
                worker.terminate();
                stream.ondata.call(stream, err, null, false);
            } else if (!Array.isArray(data)) {
                if (onExtraMessage) onExtraMessage(data);
            } else if (data.length === 1) { // Drain message
                stream.queuedSize -= data[0];
                if (stream.ondrain) stream.ondrain(data[0]);
            } else { // Data message
                if (data[1]) { // Final chunk
                    worker.terminate();
                    terminated = true;
                }
                stream.ondata.call(stream, null, data[0], data[1]);
            }
        }
    );

    worker.postMessage(options);
    
    stream.queuedSize = 0;

    stream.push = (chunk, final) => {
        if (!stream.ondata) throw err(FlateErrorCode.NoStreamHandler, 'No stream handler');
        if (terminated) {
            stream.ondata(err(FlateErrorCode.StreamFinished, 'Stream finished'), null, !!final);
            return;
        }
        stream.queuedSize += chunk.length;
        worker.postMessage([chunk, !!final], [chunk.buffer]);
    };

    stream.terminate = () => {
        worker.terminate();
        terminated = true;
    };

    if (flushable) {
        stream.flush = () => {
            if (terminated) return;
            worker.postMessage([]);
        };
    }
}
