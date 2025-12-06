import { errors } from '../util.js'
import config from '../config.js'

const {
  WritableStream,
  TransformStream,
  DOMException,
  Blob
} = config

const { GONE } = errors
// @ts-ignore - Don't match newer versions of Safari, but that's okay
const isOldSafari = /constructor/i.test(window.HTMLElement)

export class FileHandle {
  name: string
  kind: string

  constructor (name: string = 'unkown') {
    this.name = name
    this.kind = 'file'
  }

  async getFile (): Promise<never> {
    throw new DOMException(...GONE)
  }

  async isSameEntry(other: any): Promise<boolean> {
    return this === other
  }

  async createWritable (options: object = {}): Promise<WritableStreamDefaultWriter<any>> {
    const sw = await navigator.serviceWorker?.getRegistration()
    const link = document.createElement('a')
    const ts = new TransformStream()
    const sink = ts.writable

    link.download = this.name

    if (isOldSafari || !sw) {
      let chunks: Blob[] = []
      ts.readable.pipeTo(new WritableStream({
        write (chunk: any) {
          chunks.push(new Blob([chunk]))
        },
        close () {
          const blob = new Blob(chunks, { type: 'application/octet-stream; charset=utf-8' })
          chunks = []
          link.href = URL.createObjectURL(blob)
          link.click()
          setTimeout(() => URL.revokeObjectURL(link.href), 10000)
        }
      }))
    } else {
      const { writable, readablePort } = new RemoteWritableStream(WritableStream)
      // Make filename RFC5987 compatible
      const fileName = encodeURIComponent(this.name).replace(/['()]/g, escape).replace(/\*/g, '%2A')
      const headers: HeadersInit = {
        'content-disposition': "attachment; filename*=UTF-8''" + fileName,
        'content-type': 'application/octet-stream; charset=utf-8',
        ...(options && 'size' in options ? { 'content-length': String((options as any).size) } : {})
      }

      const keepAlive = setInterval(() => sw.active?.postMessage(0), 10000)

      ts.readable.pipeThrough(new TransformStream({
        transform (chunk: any, ctrl: TransformStreamDefaultController) {
          if (chunk instanceof Uint8Array) return ctrl.enqueue(chunk)
          const reader = new Response(chunk).body!.getReader()
          const pump = (): Promise<void> => reader.read().then(e => e.done ? Promise.resolve() : pump().then(() => ctrl.enqueue(e.value)))
          return pump()
        }
      })).pipeTo(writable).finally(() => {
        clearInterval(keepAlive)
      })

      // Transfer the stream to service worker
      sw.active?.postMessage({
        url: sw.scope + fileName,
        headers,
        readablePort
      }, [readablePort])

      // Trigger the download with a hidden iframe
      const iframe = document.createElement('iframe')
      iframe.hidden = true
      iframe.src = sw.scope + fileName
      document.body.appendChild(iframe)
    }

    return sink.getWriter()
  }
}

// Want to remove this postMessage hack, tell them u want transferable streams:
// https://bugs.webkit.org/show_bug.cgi?id=215485

const WRITE = 0
const PULL = 0
const ERROR = 1
const ABORT = 1
const CLOSE = 2

class MessagePortSink {
  _port: MessagePort
  _controller?: WritableStreamDefaultController
  _readyPromise: Promise<void>
  _readyResolve?: () => void
  _readyReject?: (reason: any) => void
  _readyPending: boolean

  constructor (port: MessagePort) {
    port.onmessage = (event: MessageEvent) => this._onMessage(event.data)
    this._port = port
    this._resetReady()
  }

  start (controller: WritableStreamDefaultController): Promise<void> {
    this._controller = controller
    // Apply initial backpressure
    return this._readyPromise
  }

  write (chunk: any): Promise<void> {
    const message = { type: WRITE, chunk }

    // Send chunk
    this._port.postMessage(message, [chunk.buffer])

    // Assume backpressure after every write, until sender pulls
    this._resetReady()

    // Apply backpressure
    return this._readyPromise
  }

  close (): void {
    this._port.postMessage({ type: CLOSE })
    this._port.close()
  }

  abort (reason: any): void {
    this._port.postMessage({ type: ABORT, reason })
    this._port.close()
  }

  _onMessage (message: any): void {
    if (message.type === PULL) this._resolveReady()
    if (message.type === ERROR) this._onError(message.reason)
  }

  _onError (reason: any): void {
    this._controller?.error(reason)
    this._rejectReady(reason)
    this._port.close()
  }

  _resetReady (): void {
    this._readyPromise = new Promise<void>((resolve, reject) => {
      this._readyResolve = resolve
      this._readyReject = reject
    })
    this._readyPending = true
  }

  _resolveReady (): void {
    this._readyResolve?.()
    this._readyPending = false
  }

  _rejectReady (reason: any): void {
    if (!this._readyPending) this._resetReady()
    this._readyPromise.catch(() => {})
    this._readyReject?.(reason)
    this._readyPending = false
  }
}

class RemoteWritableStream {
  readablePort: MessagePort
  writable: WritableStream

  constructor (WritableStream: typeof globalThis.WritableStream) {
    const channel = new MessageChannel()
    this.readablePort = channel.port1
    this.writable = new WritableStream(
      new MessagePortSink(channel.port2) as any
    )
  }
}
