// worker-streams.ts
// This module provides utilities to run tasks and streams in a Web Worker
// using the native Web Streams API.

import wk from './node-worker';
import { FlateError, FlateErrorCode } from './flate'; // Assume error types are in a separate file

// --- Type Definitions ---
export type FlateCallback = (err: FlateError | null, data: Uint8Array) => void;
export interface AsyncOptions {
  consume?: boolean;
}
export interface AsyncTerminable {
  (): void;
}

type DependencyProvider = () => unknown[];
type CachedWorker = {
    script: string;
    data: Record<string, unknown>;
};

const workerCache: CachedWorker[] = [];

// --- Core Worker Creation and Dependency Packaging (largely unchanged) ---

/**
 * Serializes dependencies from the main thread's scope into a script string
 * and a data object for a Web Worker.
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

    values.forEach((value, i) => {
        const key = keys[i];
        if (typeof value === 'function') {
            script += `var ${key} = ${value.toString()};\n`;
            if (value.prototype) {
                for (const prop in value.prototype) {
                    script += `${key}.prototype.${prop} = ${value.prototype[prop].toString()};\n`;
                }
            }
        } else {
            data[key] = value;
        }
    });
    return script;
}

function getTransferables(data: Record<string, unknown>): Transferable[] {
    const transferables: Transferable[] = [];
    for (const key in data) {
        const value = data[key] as any;
        if (value?.buffer instanceof ArrayBuffer) {
            const clone = new (value.constructor)(value);
            data[key] = clone;
            transferables.push(clone.buffer);
        }
    }
    return transferables;
}

function createWorker(
    dependencyProviders: DependencyProvider[],
    cacheId: number,
    onMessage: (ev: MessageEvent) => void,
    onError: (ev: ErrorEvent) => void,
): Worker {
    if (!workerCache[cacheId]) {
        let script = '';
        const data: Record<string, unknown> = {};
        dependencyProviders.forEach(provider => {
            script = packageDependencies(provider, script, data);
        });
        workerCache[cacheId] = { script, data };
    }

    const { script: baseScript, data: baseData } = workerCache[cacheId];
    const data = { ...baseData };

    const bootstrapScript = `
        let isInitialized = false;
        self.onmessage = (e) => {
            if (!isInitialized) {
                ${baseScript}
                for (const k in e.data.env) self[k] = e.data.env[k];
                isInitialized = true;

                // The first message after initialization contains the streams
                handleStreamSetup(e.data.streams);
            }
        };

        function handleStreamSetup({ readable, writable, streamClass, options }) {
            try {
                const transform = new self[streamClass](options);
                readable.pipeThrough(transform).pipeTo(writable);
            } catch (err) {
                // Forward any errors from the worker's stream setup
                self.postMessage({ error: err });
            }
        }
    `;

    const worker = wk(bootstrapScript, cacheId, {}, [], (err, msg) => {
      if (err) onError(new ErrorEvent('error', { error: err }));
      else onMessage(new MessageEvent('message', { data: msg }));
    });
    
    // Send initial environment data
    const transferables = getTransferables(data);
    worker.postMessage({ env: data }, transferables);

    return worker;
}

// --- Modern, Stream-based API ---

/**
 * Creates a TransformStream that pipes data through a Web Worker for processing.
 * @param dependencyProviders Functions that provide the worker's scope.
 * @param streamClass The name of the class (as a string) to instantiate inside the worker.
 * @param options The options to pass to the stream class constructor.
 * @param cacheId A unique ID for caching the worker script.
 * @returns A TransformStream and a function to terminate the underlying worker.
 */
export function createTransformStreamInWorker(
    dependencyProviders: DependencyProvider[],
    streamClass: string,
    options: any,
    cacheId: number,
): { stream: TransformStream<Uint8Array, Uint8Array>, terminate: AsyncTerminable } {
    
    let worker: Worker | null = null;
    
    const stream = new TransformStream<Uint8Array, Uint8Array>({
        start(controller) {
            worker = createWorker(
                dependencyProviders,
                cacheId,
                (msg) => {
                    // Check for errors sent from the worker
                    if (msg.data && msg.data.error) {
                        controller.error(msg.data.error);
                        if (worker) worker.terminate();
                        worker = null;
                    }
                },
                (err) => {
                    controller.error(err.error || new Error('Unknown worker error'));
                    if (worker) worker.terminate();
                    worker = null;
                }
            );

            const { readable, writable } = new TransformStream();
            
            worker.postMessage({
                streams: {
                    readable,
                    writable: controller.writable, // Directly use the controller's writable
                    streamClass,
                    options,
                }
            }, [readable, controller.writable]);
            
            // This stream's writable is now the writable end of our new inner stream
            // This is a bit of a mind-bender, but we are creating a proxy.
            const proxyWritable = writable;
            Object.defineProperty(this, 'writable', { value: proxyWritable, configurable: true });
        },
        flush() {
             // The flush is handled by the streams closing.
        },
        cancel(reason) {
            if (worker) {
                worker.terminate();
                worker = null;
            }
        }
    });

    const terminate = () => {
        if (worker) {
            worker.terminate();
            worker = null;
            // Aborting the stream will signal cancellation to consumers
            const writer = stream.writable.getWriter();
            writer.abort('Terminated by user');
            writer.releaseLock();
        }
    };

    // We must return the stream itself, but redefine its writable property.
    // A bit of a hack to make the API clean.
    const writable = (stream as any).writable;
    const finalStream = new TransformStream();
    Object.defineProperty(finalStream, 'writable', { value: writable });

    return { stream: finalStream, terminate };
}

// The one-shot task function can be simplified as it's a specific case of a stream
export async function runTaskInWorker(
    data: Uint8Array,
    dependencyProviders: DependencyProvider[],
    streamClass: string,
    options: any,
    cacheId: number,
): Promise<Uint8Array> {
    const { stream, terminate } = createTransformStreamInWorker(
      dependencyProviders,
      streamClass,
      options,
      cacheId
    );
    
    // Write the single chunk of data to the stream
    const writer = stream.writable.getWriter();
    writer.write(data);
    writer.close();

    // Read all chunks from the stream and concatenate them
    const reader = stream.readable.getReader();
    const chunks: Uint8Array[] = [];
    let totalLength = 0;

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        totalLength += value.length;
    }

    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
        result.set(chunk, offset);
        offset += chunk.length;
    }

    terminate();
    return result;
}
