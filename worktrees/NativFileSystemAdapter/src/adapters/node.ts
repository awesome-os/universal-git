import fs from 'node:fs/promises'
import { join } from 'node:path'
import { errors } from '../util.js'

import config from '../config.js'

const {
  DOMException
} = config

const { INVALID, GONE, MISMATCH, MOD_ERR, SYNTAX } = errors

/**
 * @see https://github.com/node-fetch/fetch-blob/blob/0455796ede330ecffd9eb6b9fdf206cc15f90f3e/index.js#L232
 */
function isBlob(object: any): object is Blob {
  return (
    object &&
    typeof object === 'object' &&
    typeof object.constructor === 'function' &&
    (
      typeof object.stream === 'function' ||
      typeof object.arrayBuffer === 'function'
    ) &&
    /^(Blob|File)$/.test(object[Symbol.toStringTag])
  )
}

export class Sink {
  _fileHandle: fs.FileHandle
  _size: number
  _position: number

  constructor(fileHandle: fs.FileHandle, size: number) {
    this._fileHandle = fileHandle
    this._size = size
    this._position = 0
  }

  async abort(): Promise<void> {
    await this._fileHandle.close()
  }

  async write(chunk: any): Promise<void> {
    if (typeof chunk === 'object') {
      if (chunk.type === 'write') {
        if (Number.isInteger(chunk.position) && chunk.position >= 0) {
          this._position = chunk.position
        }
        if (!('data' in chunk)) {
          await this._fileHandle.close()
          throw new DOMException(...SYNTAX('write requires a data argument'))
        }
        chunk = chunk.data
      } else if (chunk.type === 'seek') {
        if (Number.isInteger(chunk.position) && chunk.position >= 0) {
          if (this._size < chunk.position) {
            throw new DOMException(...INVALID)
          }
          this._position = chunk.position
          return
        } else {
          await this._fileHandle.close()
          throw new DOMException(...SYNTAX('seek requires a position argument'))
        }
      } else if (chunk.type === 'truncate') {
        if (Number.isInteger(chunk.size) && chunk.size >= 0) {
          await this._fileHandle.truncate(chunk.size)
          this._size = chunk.size
          if (this._position > this._size) {
            this._position = this._size
          }
          return
        } else {
          await this._fileHandle.close()
          throw new DOMException(...SYNTAX('truncate requires a size argument'))
        }
      }
    }

    if (chunk instanceof ArrayBuffer) {
      chunk = new Uint8Array(chunk)
    } else if (typeof chunk === 'string') {
      chunk = Buffer.from(chunk)
    } else if (isBlob(chunk)) {
      for await (const data of chunk.stream()) {
        const res = await this._fileHandle.writev([data as any], this._position)
        this._position += res.bytesWritten
        this._size += res.bytesWritten
      }
      return
    }

    const res = await this._fileHandle.writev([chunk], this._position)
    this._position += res.bytesWritten
    this._size += res.bytesWritten
  }

  async close (): Promise<void> {
    // First make sure we close the handle
    await this._fileHandle.close()
  }
}

export class FileHandle {
  _path: string
  name: string
  kind: string

  constructor(path: string, name: string) {
    this._path = path
    this.name = name
    this.kind = 'file'
  }

  getFile() {
    return Promise.all([
      fs.stat(this._path),
      fs.readFile(this._path)
    ]).then(([stat, buffer]) => {
      return new File([buffer], this.name, { lastModified: stat.mtimeMs })
    })
  }

  async isSameEntry(other: FileHandle): Promise<boolean> {
    return this._path === other._getPath()
  }

  _getPath(): string {
    return this._path
  }

  async createWritable(opts: { keepExistingData?: boolean } = {}): Promise<Sink> {
    const fileHandle = await fs.open(this._path, opts.keepExistingData ? 'r+' : 'w+').catch(err => {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') throw new DOMException(...GONE)
      throw err
    })
    const { size } = await fileHandle.stat()
    return new Sink(fileHandle, size)
  }
}

export class FolderHandle {
  _path: string
  name: string
  kind: string

  constructor(path: string = '', name: string = '') {
    this.name = name
    this.kind = 'directory'
    this._path = path
  }

  async isSameEntry(other: FolderHandle): Promise<boolean> {
    return this._path === other._path
  }

  async * entries(): AsyncGenerator<[string, FileHandle | FolderHandle]> {
    const dir = this._path
    const items = await fs.readdir(dir).catch(err => {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') throw new DOMException(...GONE)
      throw err
    })
    for (let name of items) {
      const path = join(dir, name)
      const stat = await fs.lstat(path)
      if (stat.isFile()) {
        yield [name, new FileHandle(path, name)]
      } else if (stat.isDirectory()) {
        yield [name, new FolderHandle(path, name)]
      }
    }
  }

  async getDirectoryHandle(name: string, opts: { create: boolean }): Promise<FolderHandle> {
    const path = join(this._path, name)
    const stat = await fs.lstat(path).catch(err => {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
      return null
    })
    const isDirectory = stat?.isDirectory()
    if (stat && isDirectory) return new FolderHandle(path, name)
    if (stat && !isDirectory) throw new DOMException(...MISMATCH)
    if (!opts.create) throw new DOMException(...GONE)
    await fs.mkdir(path)
    return new FolderHandle(path, name)
  }

  async getFileHandle(name="", { create = false }) {
    const path = join(this._path, name)
    return fs.lstat(path).catch((err: NodeJS.ErrnoException) => {
      return err.code !== 'ENOENT' ? Promise.reject(err) : null
    }).then(stat =>   
      stat?.isFile()
        ? new FileHandle(path, name) 
        : stat ? Promise.reject(new DOMException(...MISMATCH)) 
        : !create ? Promise.reject(new DOMException(...GONE)) 
        : fs.open(path, 'w').then(
            fileHandle => fileHandle.close()
          ).then(() => new FileHandle(path, name))
    )
  }

  async queryPermission (): Promise<PermissionState> {
    return 'granted'
  }

  async removeEntry(name ="", { recursive = false }) {
    const path = join(this._path, name)
    return fs.lstat(path).then(
      stat => stat.isDirectory() 
        ? recursive  
          ? fs.rm(path, { recursive }).catch((err: NodeJS.ErrnoException) => 
                err.code === 'ENOTEMPTY' 
                  ? Promise.reject(new DOMException(...MOD_ERR))
                  : Promise.reject(err)            
              ) 
          : fs.rmdir(path).catch(
              (err: NodeJS.ErrnoException) => {
                return Promise.reject(err.code === 'ENOTEMPTY' ? new DOMException(...MOD_ERR) : err)
              })
        : fs.unlink(path).catch(
            (err: NodeJS.ErrnoException) => Promise.reject(
              err.code === 'ENOENT' 
                ? new DOMException(...GONE) 
                : err
            )
          )
    )
  }
}

export default (path: string): FolderHandle => new FolderHandle(path)
