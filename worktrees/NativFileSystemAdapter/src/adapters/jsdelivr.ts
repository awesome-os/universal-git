import { errors } from '../util.js'

const { GONE, MISMATCH, SYNTAX, DISALLOWED } = errors

export class FileHandle {
  name: string
  kind: string
  _deleted: boolean
  _root: string
  _entry: any
  writable: boolean
  readable: boolean

  constructor (entry: any, root: string) {
    this.name = entry.name
    this.kind = 'file'
    this._deleted = false
    this._root = root
    this._entry = entry
    this.writable = false
    this.readable = true
  }

  async getFile (): Promise<File> {
    const res = await fetch(`https://cdn.jsdelivr.net/${this._root}/${this.name}`)
    const blob = await res.blob()

    return new File([blob], this.name, {
      type: blob.type,
      lastModified: this._entry.time
    })
  }

  async createWritable (): Promise<never> {
    throw new DOMException(...DISALLOWED)
  }

  async isSameEntry (other: FileHandle): Promise<boolean> {
    return this === other
  }
}

function toDic(files: any[], root: string): { [key: string]: FileHandle | FolderHandle } {
  const dic: { [key: string]: FileHandle | FolderHandle } = {}
  for (const x of files) {
    x.time = +new Date(x.time)
    if (x.type === 'file') {
      dic[x.name] = new FileHandle(x, root)
    } else {
      dic[x.name] = new FolderHandle(x.files, `${root}/${x.name}`, x.name)
    }
  }
  return dic
}

export class FolderHandle {
  name: string
  kind: string
  _deleted: boolean
  _entries: { [key: string]: FileHandle | FolderHandle }
  writable: boolean
  readable: boolean

  constructor (files: any[], root: string, name: string = '') {
    this.name = name
    this.kind = 'directory'
    this._deleted = false
    this._entries = toDic(files, root)
    this.writable = false
    this.readable = true
  }

  async * entries (): AsyncGenerator<[string, FileHandle | FolderHandle]> {
    yield* Object.entries(this._entries) as any
  }

  async isSameEntry (other: FolderHandle): Promise<boolean> {
    return this === other
  }

  async getDirectoryHandle (name: string, opts: { create: boolean }): Promise<FolderHandle> {
    if (this._deleted) throw new DOMException(...GONE)
    const entry = this._entries[name]
    if (entry) { // entry exist
      if (entry instanceof FileHandle) {
        throw new DOMException(...MISMATCH)
      } else {
        return entry
      }
    } else {
      if (opts.create) {
        throw new DOMException(...DISALLOWED)
      } else {
        throw new DOMException(...GONE)
      }
    }
  }

  async getFileHandle (name: string, opts: { create: boolean }): Promise<FileHandle> {
    const entry = this._entries[name]
    const isFile = entry instanceof FileHandle
    if (entry && isFile) return entry
    if (entry && !isFile) throw new DOMException(...MISMATCH)
    if (!entry && !opts.create) throw new DOMException(...GONE)
    if (!entry && opts.create) {
      throw new DOMException(...DISALLOWED)
    }
    throw new Error('Unreachable')
  }

  async removeEntry (name: string, opts: any): Promise<never> {
    throw new DOMException(...DISALLOWED)
  }
}

export default async (root: string): Promise<FolderHandle> => {
  const res = await fetch(`https://data.jsdelivr.com/v1/package/${root}`)
  const { files } = await res.json()
  return new FolderHandle(files, root)
}
