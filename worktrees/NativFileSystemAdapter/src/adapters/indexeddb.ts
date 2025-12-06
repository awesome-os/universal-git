/* global indexedDB, Blob, File, DOMException */

import { errors } from '../util.js'

const { INVALID, GONE, MISMATCH, MOD_ERR, SYNTAX, ABORT } = errors

function setupTxErrorHandler (tx: IDBTransaction, onerror: (err: any) => void): void {
  tx.onerror = () => onerror(tx.error)
  tx.onabort = () => onerror(tx.error || new DOMException(...ABORT))
}

class Sink {
  db: IDBDatabase
  id: IDBValidKey
  size: number
  position: number
  file: File

  constructor (db: IDBDatabase, id: IDBValidKey, size: number, file: File) {
    this.db = db
    this.id = id
    this.size = size
    this.position = 0
    this.file = file
  }

  write (chunk: any): void {
    if (typeof chunk === 'object') {
      if (chunk.type === 'write') {
        if (Number.isInteger(chunk.position) && chunk.position >= 0) {
          if (this.size < chunk.position) {
            this.file = new File(
              [this.file, new ArrayBuffer(chunk.position - this.size)],
              this.file.name,
              this.file
            )
          }
          this.position = chunk.position
        }
        if (!('data' in chunk)) {
          throw new DOMException(...SYNTAX('write requires a data argument'))
        }
        chunk = chunk.data
      } else if (chunk.type === 'seek') {
        if (Number.isInteger(chunk.position) && chunk.position >= 0) {
          if (this.size < chunk.position) {
            throw new DOMException(...INVALID)
          }
          this.position = chunk.position
          return
        } else {
          throw new DOMException(...SYNTAX('seek requires a position argument'))
        }
      } else if (chunk.type === 'truncate') {
        if (Number.isInteger(chunk.size) && chunk.size >= 0) {
          let file = this.file
          file = chunk.size < this.size
            ? new File([file.slice(0, chunk.size)], file.name, file)
            : new File([file, new Uint8Array(chunk.size - this.size)], file.name, file)

          this.size = file.size
          if (this.position > file.size) {
            this.position = file.size
          }
          this.file = file
          return
        } else {
          throw new DOMException(...SYNTAX('truncate requires a size argument'))
        }
      }
    }

    chunk = new Blob([chunk])

    let blob = this.file
    // Calc the head and tail fragments
    const head = blob.slice(0, this.position)
    const tail = blob.slice(this.position + chunk.size)

    // Calc the padding
    let padding = this.position - head.size
    if (padding < 0) {
      padding = 0
    }
    blob = new File([
      head,
      new Uint8Array(padding),
      chunk,
      tail
    ], blob.name)
    this.size = blob.size
    this.position += chunk.size
    this.file = blob
  }

  close (): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const [tx, table] = store(this.db)
      table.get(this.id).onsuccess = (evt) => {
        const result = (evt.target as IDBRequest).result
        result
          ? table.put(this.file, this.id)
          : reject(new DOMException(...GONE))
      }
      tx.oncomplete = () => resolve()
      tx.onerror = reject
      tx.onabort = reject
    })
  }
}

class FileHandle {
  _db: IDBDatabase
  _id: IDBValidKey
  name: string
  kind: string
  readable: boolean
  writable: boolean

  constructor (db: IDBDatabase, id: IDBValidKey, name: string) {
    this._db = db
    this._id = id
    this.name = name
    this.kind = 'file'
    this.readable = true
    this.writable = true
  }

  async isSameEntry (other: FileHandle): Promise<boolean> {
    return this._id === other._id
  }

  async getFile (): Promise<File> {
    const file = await new Promise<File | null>((resolve, reject) => {
      const req = store(this._db)[1].get(this._id)
      req.onsuccess = (evt) => resolve((evt.target as IDBRequest).result)
      req.onerror = (evt) => reject((evt.target as IDBRequest).error)
    })
    if (!file) throw new DOMException(...GONE)
    return file
  }

  async createWritable (opts: { keepExistingData?: boolean } = {}): Promise<Sink> {
    let file = await this.getFile() // Used directly to test existences
    file = opts.keepExistingData ? file : new File([], this.name)
    return new Sink(this._db, this._id, file.size, file)
  }
}

function store (db: IDBDatabase): [IDBTransaction, IDBObjectStore] {
  const tx = db.transaction('entries', 'readwrite', { durability: 'relaxed' })
  return [tx, tx.objectStore('entries')]
}

function rimraf (evt: Event, toDelete: any, recursive: boolean = true): void {
  const { source, result } = evt.target as any
  for (const [id, isFile] of Object.values(toDelete || result || {})) {
    if (isFile) source.delete(id)
    else if (recursive) {
      source.get(id).onsuccess = (e: Event) => rimraf(e, undefined, recursive)
      source.delete(id)
    } else {
      source.get(id).onsuccess = (evt: Event) => {
        const res = (evt.target as IDBRequest).result
        if (Object.keys(res || {}).length !== 0) {
          (evt.target as IDBRequest).transaction?.abort()
        } else {
          source.delete(id)
        }
      }
    }
  }
}

class FolderHandle {
  _db: IDBDatabase
  _id: IDBValidKey
  kind: string
  name: string
  readable: boolean
  writable: boolean

  constructor (db: IDBDatabase, id: IDBValidKey, name: string) {
    this._db = db
    this._id = id
    this.kind = 'directory'
    this.name = name
    this.readable = true
    this.writable = true
  }

  async * entries (): AsyncGenerator<[string, FileHandle | FolderHandle]> {
    const req = store(this._db)[1].get(this._id);
    await new Promise<void>((rs, rj) => {
      req.onsuccess = () => rs()
      req.onerror = () => rj(req.error)
    })
    const entries = req.result
    if (!entries) throw new DOMException(...GONE)
    for (const [name, [id, isFile]] of Object.entries(entries)) {
      yield [name, isFile
        ? new FileHandle(this._db, id, name)
        : new FolderHandle(this._db, id, name)
      ]
    }
  }

  isSameEntry (other: FolderHandle): boolean {
    return this._id === other._id
  }

  getDirectoryHandle (name: string, opts: { create: boolean }): Promise<FolderHandle> {
    return new Promise<FolderHandle>((resolve, reject) => {
      const table = store(this._db)[1]
      const req = table.get(this._id)
      req.onsuccess = () => {
        const entries = req.result
        const entry = entries[name]
        if (entry) { // entry exist
          if (entry[1]) { // isFile?
            reject(new DOMException(...MISMATCH))
          } else {
            resolve(new FolderHandle(this._db, entry[0], name))
          }
        } else {
          if (opts.create) {
            const addReq = table.add({})
            addReq.onsuccess = (evt) => {
              const id = (evt.target as IDBRequest).result
              entries[name] = [id, false]
              const putReq = table.put(entries, this._id)
              putReq.onsuccess = () => resolve(new FolderHandle(this._db, id, name))
            }
          } else {
            reject(new DOMException(...GONE))
          }
        }
      }
    })
  }

  getFileHandle (name: string, opts: { create: boolean }): Promise<FileHandle> {
    return new Promise<FileHandle>((resolve, reject) => {
      const table = store(this._db)[1]
      const query = table.get(this._id)
      query.onsuccess = () => {
        const entries = query.result
        const entry = entries[name]
        if (entry && entry[1]) resolve(new FileHandle(this._db, entry[0], name))
        if (entry && !entry[1]) reject(new DOMException(...MISMATCH))
        if (!entry && !opts.create) reject(new DOMException(...GONE))
        if (!entry && opts.create) {
          const q = table.put(new File([], name))
          q.onsuccess = () => {
            const id = q.result
            entries[name] = [id, true]
            const query = table.put(entries, this._id)
            query.onsuccess = () => {
              resolve(new FileHandle(this._db, id, name))
            }
          }
        }
      }
    })
  }

  async removeEntry (name: string, opts: { recursive?: boolean } = {}): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const [tx, table] = store(this._db)
      const cwdQ = table.get(this._id)
      cwdQ.onsuccess = (evt) => {
        const cwd = cwdQ.result
        const toDelete = { _: cwd[name] }
        if (!toDelete._) {
          return reject(new DOMException(...GONE))
        }
        delete cwd[name]
        table.put(cwd, this._id)
        rimraf(evt, toDelete, !!opts.recursive)
      }
      tx.oncomplete = () => resolve()
      tx.onerror = reject
      tx.onabort = () => {
        reject(new DOMException(...MOD_ERR))
      }
    })
  }
}

export default (opts: { persistent?: boolean } = {}): Promise<FolderHandle> => new Promise<FolderHandle>((resolve) => {
  const request = indexedDB.open('fileSystem')

  request.onupgradeneeded = () => {
    const db = request.result
    db.createObjectStore('entries', { autoIncrement: true }).transaction.oncomplete = () => {
      db.transaction('entries', 'readwrite').objectStore('entries').add({})
    }
  }

  request.onsuccess = () => {
    resolve(new FolderHandle(request.result, 1, ''))
  }
})
