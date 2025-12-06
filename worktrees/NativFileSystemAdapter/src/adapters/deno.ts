import { join, basename } from 'https://deno.land/std@0.108.0/path/mod.ts'
import { errors } from '../util.js'

const { INVALID, GONE, MISMATCH, MOD_ERR, SYNTAX } = errors

// TODO:
// - either depend on fetch-blob.
// - push for https://github.com/denoland/deno/pull/10969
// - or extend the File class like i did in that PR
async function fileFrom (path: string): Promise<File> {
  const e = Deno.readFileSync(path)
  const s = await Deno.stat(path)
  return new File([e], basename(path), { lastModified: Number(s.mtime) })
}

export class Sink {
  fileHandle: Deno.FsFile
  size: number
  position: number

  constructor (fileHandle: Deno.FsFile, size: number) {
    this.fileHandle = fileHandle
    this.size = size
    this.position = 0
  }

  async abort(): Promise<void> {
    await this.fileHandle.close()
  }

  async write (chunk: any): Promise<void> {
    if (typeof chunk === 'object') {
      if (chunk.type === 'write') {
        if (Number.isInteger(chunk.position) && chunk.position >= 0) {
          this.position = chunk.position
        }
        if (!('data' in chunk)) {
          await this.fileHandle.close()
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
          await this.fileHandle.close()
          throw new DOMException(...SYNTAX('seek requires a position argument'))
        }
      } else if (chunk.type === 'truncate') {
        if (Number.isInteger(chunk.size) && chunk.size >= 0) {
          await this.fileHandle.truncate(chunk.size)
          this.size = chunk.size
          if (this.position > this.size) {
            this.position = this.size
          }
          return
        } else {
          await this.fileHandle.close()
          throw new DOMException(...SYNTAX('truncate requires a size argument'))
        }
      }
    }

    if (chunk instanceof ArrayBuffer) {
      chunk = new Uint8Array(chunk)
    } else if (typeof chunk === 'string') {
      chunk = new TextEncoder().encode(chunk)
    } else if (chunk instanceof Blob) {
      await this.fileHandle.seek(this.position, Deno.SeekMode.Start)
      for await (const data of chunk.stream()) {
        const written = await this.fileHandle.write(data)
        this.position += written
        this.size += written
      }
      return
    }
    await this.fileHandle.seek(this.position, Deno.SeekMode.Start)
    const written = await this.fileHandle.write(chunk)
    this.position += written
    this.size += written
  }

  async close (): Promise<void> {
    await this.fileHandle.close()
  }
}

export class FileHandle {
  #path: string
  name: string
  kind: string

  constructor (path: string, name: string) {
    this.#path = path
    this.name = name
    this.kind = 'file'
  }

  async getFile (): Promise<File> {
    await Deno.stat(this.#path).catch(err => {
      if (err.name === 'NotFound') throw new DOMException(...GONE)
    })
    return fileFrom(this.#path)
  }

  async isSameEntry (other: FileHandle): Promise<boolean> {
    return this.#path === (other as any).#getPath()
  }

  #getPath(): string {
    return this.#path
  }

  async createWritable (opts: { keepExistingData?: boolean } = {}): Promise<Sink> {
    const fileHandle = await Deno.open(this.#path, { write: true, truncate: !opts.keepExistingData }).catch(err => {
      if (err.name === 'NotFound') throw new DOMException(...GONE)
      throw err
    })

    const { size } = await fileHandle.stat()
    return new Sink(fileHandle, size)
  }
}

export class FolderHandle {
  #path: string
  name: string
  kind: string

  constructor (path: string, name: string = '') {
    this.name = name
    this.kind = 'directory'
    this.#path = join(path)
  }

  async isSameEntry (other: FolderHandle): Promise<boolean> {
    return this.#path === (other as any).#getPath()
  }

  #getPath(): string {
    return this.#path
  }

  async * entries (): AsyncGenerator<[string, FileHandle | FolderHandle]> {
    const dir = this.#path
    try {
      for await (const dirEntry of Deno.readDir(dir)) {
        const { name } = dirEntry
        const path = join(dir, name)
        const stat = await Deno.lstat(path)
        if (stat.isFile) {
          yield [name, new FileHandle(path, name)]
        } else if (stat.isDirectory) {
          yield [name, new FolderHandle(path, name)]
        }
      }
    } catch (err: any) {
      throw err.name === 'NotFound' ? new DOMException(...GONE) : err
    }
  }

  async getDirectoryHandle (name: string, opts: { create: boolean }): Promise<FolderHandle> {
    const path = join(this.#path, name)
    const stat = await Deno.lstat(path).catch(err => {
      if (err.name !== 'NotFound') throw err
      return null
    })
    const isDirectory = stat?.isDirectory
    if (stat && isDirectory) return new FolderHandle(path, name)
    if (stat && !isDirectory) throw new DOMException(...MISMATCH)
    if (!opts.create) throw new DOMException(...GONE)
    await Deno.mkdir(path)
    return new FolderHandle(path, name)
  }

  async getFileHandle (name: string, opts: { create: any }): Promise<FileHandle> {
    const path = join(this.#path, name)
    const stat = await Deno.lstat(path).catch(err => {
      if (err.name !== 'NotFound') throw err
      return null
    })

    const isFile = stat?.isFile
    if (stat && isFile) return new FileHandle(path, name)
    if (stat && !isFile) throw new DOMException(...MISMATCH)
    if (!opts.create) throw new DOMException(...GONE)
    const c = await Deno.open(path, {
      create: true,
      write: true,
    })
    c.close()
    return new FileHandle(path, name)
  }

  async queryPermission (): Promise<PermissionState> {
    return 'granted'
  }

  async removeEntry (name: string, opts: { recursive?: boolean } = {}): Promise<void> {
    const path = join(this.#path, name)
    const stat = await Deno.lstat(path).catch(err => {
      if (err.name === 'NotFound') throw new DOMException(...GONE)
      throw err
    })

    if (stat.isDirectory) {
      if (opts.recursive) {
        await Deno.remove(path, { recursive: true }).catch(err => {
          if (err.code === 'ENOTEMPTY') throw new DOMException(...MOD_ERR)
          throw err
        })
      } else {
        await Deno.remove(path).catch(() => {
          throw new DOMException(...MOD_ERR)
        })
      }
    } else {
      await Deno.remove(path)
    }
  }
}

export default (path: string): FolderHandle => new FolderHandle(join(Deno.cwd(), path))
