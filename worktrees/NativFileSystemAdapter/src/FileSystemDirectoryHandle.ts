import FileSystemHandle from './FileSystemHandle.js'
import { errors } from './util.js'
import { FileSystemFileHandle } from './FileSystemFileHandle.js'

const { GONE, MOD_ERR } = errors

const kAdapter = Symbol('adapter')

class FileSystemDirectoryHandle extends FileSystemHandle {
  [kAdapter]: any

  constructor (adapter: any) {
    super(adapter)
    this[kAdapter] = adapter
  }

  async getDirectoryHandle (name: string, options: { create?: boolean } = {}): Promise<FileSystemDirectoryHandle> {
    if (name === '') {
      throw new TypeError(`Name can't be an empty string.`)
    }
    if (name === '.' || name === '..' || name.includes('/')) {
      throw new TypeError(`Name contains invalid characters.`)
    }
    options.create = !!options.create
    const handle = await this[kAdapter].getDirectoryHandle(name, options)
    return new FileSystemDirectoryHandle(handle)
  }

  async * entries (): AsyncGenerator<[string, FileSystemHandle | FileSystemDirectoryHandle]> {

    for await (const [_, entry] of this[kAdapter].entries())
      yield [entry.name, entry.kind === 'file'
        ? new FileSystemFileHandle(entry)
        : new FileSystemDirectoryHandle(entry)]
  }

  /** @deprecated use .entries() instead */
  async * getEntries(): AsyncGenerator<FileSystemFileHandle | FileSystemDirectoryHandle> {
    console.warn('deprecated, use .entries() instead')
    for await (let entry of this[kAdapter].entries())
      yield entry.kind === 'file'
        ? new FileSystemFileHandle(entry)
        : new FileSystemDirectoryHandle(entry)
  }

  async getFileHandle (name: string, options: { create?: boolean } = {}): Promise<FileSystemFileHandle> {
    if (name === '') throw new TypeError(`Name can't be an empty string.`)
    if (name === '.' || name === '..' || name.includes('/')) {
      throw new TypeError(`Name contains invalid characters.`)
    }
    options.create = !!options.create
    const handle = await this[kAdapter].getFileHandle(name, options)
    return new FileSystemFileHandle(handle)
  }

  async removeEntry (name: string, options: { recursive?: boolean } = {}): Promise<void> {
    if (name === '') {
      throw new TypeError(`Name can't be an empty string.`)
    }
    if (name === '.' || name === '..' || name.includes('/')) {
      throw new TypeError(`Name contains invalid characters.`)
    }
    options.recursive = !!options.recursive // cuz node's fs.rm require boolean
    return this[kAdapter].removeEntry(name, options)
  }

  async resolve (possibleDescendant: FileSystemHandle): Promise<string[] | null> {
    if (await possibleDescendant.isSameEntry(this)) {
      return []
    }

    const openSet: Array<{ handle: FileSystemDirectoryHandle; path: string[] }> = [{ handle: this, path: [] }]

    while (openSet.length) {
      let { handle: current, path } = openSet.pop()!

      for await (const entry of current.values()) {
        if (await entry.isSameEntry(possibleDescendant)) {
          return [...path, entry.name]
        }
        if (entry.kind === 'directory') {
          openSet.push({ handle: entry as FileSystemDirectoryHandle, path: [...path, entry.name] })
        }
      }
    }

    return null
  }

  async * keys (): AsyncGenerator<string> {
    for await (const [name] of this[kAdapter].entries())
      yield name
  }

  async * values (): AsyncGenerator<FileSystemHandle | FileSystemDirectoryHandle> {
    for await (const [_, entry] of this)
      yield entry
  }

  [Symbol.asyncIterator](): AsyncGenerator<[string, FileSystemHandle | FileSystemDirectoryHandle]> {
    return this.entries()
  }
}

Object.defineProperty(FileSystemDirectoryHandle.prototype, Symbol.toStringTag, {
	value: 'FileSystemDirectoryHandle',
	writable: false,
	enumerable: false,
	configurable: true
})

Object.defineProperties(FileSystemDirectoryHandle.prototype, {
	getDirectoryHandle: { enumerable: true },
	entries: { enumerable: true },
	getFileHandle: { enumerable: true },
	removeEntry: { enumerable: true }
})

if (globalThis.FileSystemDirectoryHandle) {
  const proto = globalThis.FileSystemDirectoryHandle.prototype

  proto.resolve = async function resolve (possibleDescendant: FileSystemHandle): Promise<string[] | null> {
    if (await possibleDescendant.isSameEntry(this)) {
      return []
    }

    const openSet: Array<{ handle: FileSystemDirectoryHandle; path: string[] }> = [{ handle: this as any, path: [] }]

    while (openSet.length) {
      let { handle: current, path } = openSet.pop()!

      for await (const entry of current.values()) {
        if (await entry.isSameEntry(possibleDescendant)) {
          return [...path, entry.name]
        }
        if (entry.kind === 'directory') {
          openSet.push({ handle: entry as any, path: [...path, entry.name] })
        }
      }
    }

    return null
  }

  // Safari allows us operate on deleted files,
  // so we need to check if they still exist.
  // Hope to remove this one day.
  // TODO: Remove this once Safari supports entries()
  async function ensureDoActuallyStillExist (handle: FileSystemDirectoryHandle): Promise<void> {
    const root = await navigator.storage.getDirectory()
    const path = await root.resolve(handle as any)
    if (path === null) { throw new DOMException(...GONE) }
  }

  const origEntries = (proto as any).entries
  if ('entries' in proto) {
    Object.defineProperty(proto, 'entries', {
      enumerable: true,
      configurable: true,
      writable: true,
      value: async function * () {
        await ensureDoActuallyStillExist(this as any)
        yield* (origEntries as Function).apply(this)
      }
    });
  }
  proto[Symbol.asyncIterator] = async function * () {
    yield * this.entries()
  }

  const removeEntry = proto.removeEntry
  proto.removeEntry = async function (name: string, options: { recursive?: boolean } = {}): Promise<void> {
    return removeEntry.call(this, name, options).catch(async (err: Error) => {
      const unknown = err instanceof DOMException && err.name === 'UnknownError'
      if (unknown && !options.recursive) {
        const empty = (await origEntries.call(this).next()).done
        if (!empty) { throw new DOMException(...MOD_ERR) }
      }
      throw err
    })
  }
}

export default FileSystemDirectoryHandle
export { FileSystemDirectoryHandle }
