/// <reference lib="webworker" />

// Want to remove this postMessage hack, tell them u want transferable streams:
// https://bugs.webkit.org/show_bug.cgi?id=215485

const sw = self as unknown as ServiceWorkerGlobalScope

const WRITE = 0
const PULL = 0
const ERROR = 1
const ABORT = 1
const CLOSE = 2
const PING = 3

class MessagePortSource {
  controller?: ReadableStreamController<any>
  port: MessagePort

  constructor (port: MessagePort) {
    this.port = port;
    this.port.onmessage = (evt: MessageEvent) => this.onMessage(evt.data)
  }

  start (controller: ReadableStreamController<any>): void {
    this.controller = controller
  }

  pull (): void {
    this.port.postMessage({ type: PULL })
  }

  cancel (reason: Error): void {
    // Firefox can notify a cancel event, chrome can't
    // https://bugs.chromium.org/p/chromium/issues/detail?id=638494
    this.port.postMessage({ type: ERROR, reason: reason.message })
    this.port.close()
  }

  onMessage (message: { type: number; chunk: Uint8Array; reason: any }): void {
    // enqueue() will call pull() if needed when there's no backpressure
    if (message.type === WRITE) {
      this.controller!.enqueue(message.chunk as any)
    }
    if (message.type === ABORT) {
      this.controller!.error(message.reason)
      this.port.close()
    }
    if (message.type === CLOSE) {
      this.controller!.close()
      this.port.close()
    }
  }
}

sw.addEventListener('install', () => {
  sw.skipWaiting()
})

sw.addEventListener('activate', (event: ExtendableEvent) => {
  event.waitUntil(sw.clients.claim());
})

interface MessageData {
  url: string
  readablePort: MessagePort
  rs?: ReadableStream
  headers: HeadersInit
}

const map = new Map<string, MessageData>()

// This should be called once per download
// Each event has a dataChannel that the data will be piped through
sw.addEventListener('message', (evt: ExtendableMessageEvent) => {
  const data = evt.data as MessageData
  if (data.url && data.readablePort) {
    const messageData: MessageData = {
      ...data,
      rs: new ReadableStream(
        new MessagePortSource(data.readablePort),
        new CountQueuingStrategy({ highWaterMark: 4 })
      )
    }
    map.set(data.url, messageData)
  }
})

sw.addEventListener('fetch', (evt: FetchEvent) => {
  const url = evt.request.url
  const data = map.get(url)
  if (!data) return
  map.delete(url)
  evt.respondWith(new Response(data.rs, {
    headers: data.headers
  }))
})
