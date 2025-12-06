/* global Blob, DOMException, FileWriter, FileEntry, DirectoryEntry */
/* global FileSystemEntry, FileSystem */

import { errors } from '../util.js'

// Legacy File System API types - using any to avoid conflicts with @types/filesystem
type FileWriter = any
type FileEntry = any
type DirectoryEntry = any
type FileSystemEntry = any
type FileSystemDirectoryEntry = any
type FileSystem = any

const { DISALLOWED } = errors

class Sink {
  writer: FileWriter
  fileEntry: FileEntry

  constructor (writer: FileWriter, fileEntry: FileEntry) {
    this.writer = writer
    this.fileEntry = fileEntry
  }

  async write (chunk: BlobPart | any): Promise<void> {
    if (typeof chunk === 'object') {
      if (chunk.type === 'write') {
        if (Number.isInteger(chunk.position) && chunk.position >= 0) {
          this.writer.seek(chunk.position)
          if (this.writer.position !== chunk.position) {
            await new Promise<void>((resolve, reject) => {
              this.writer.onwriteend = () => resolve()
              this.writer.onerror = (err) => reject(err)
              this.writer.truncate(chunk.position)
            })
            this.writer.seek(chunk.position)
          }
        }
        if (!('data' in chunk)) {
          throw new DOMException('Failed to execute \'write\' on \'UnderlyingSinkBase\': Invalid params passed. write requires a data argument', 'SyntaxError')
        }
        chunk = chunk.data
      } else if (chunk.type === 'seek') {
        if (Number.isInteger(chunk.position) && chunk.position >= 0) {
          this.writer.seek(chunk.position)
          if (this.writer.position !== chunk.position) {
            throw new DOMException('seeking position failed', 'InvalidStateError')
          }
          return
        } else {
          throw new DOMException('Failed to execute \'write\' on \'UnderlyingSinkBase\': Invalid params passed. seek requires a position argument', 'SyntaxError')
        }
      } else if (chunk.type === 'truncate') {
        return new Promise<void>(resolve => {
          if (Number.isInteger(chunk.size) && chunk.size >= 0) {
            this.writer.onwriteend = () => resolve()
            this.writer.truncate(chunk.size)
          } else {
            throw new DOMException('Failed to execute \'write\' on \'UnderlyingSinkBase\': Invalid params passed. truncate requires a size argument', 'SyntaxError')
          }
        })
      }
    }
    await new Promise<void>((resolve, reject) => {
      this.writer.onwriteend = () => resolve()
      this.writer.onerror = (err) => reject(err)
      this.writer.write(new Blob([chunk]))
    })
  }

  close (): Promise<File> {
    return new Promise(this.fileEntry.file.bind(this.fileEntry))
  }
}

export class FileHandle {
  file: FileEntry
  kind: string
  writable: boolean
  readable: boolean

  constructor (file: FileEntry, writable: boolean = true) {
    this.file = file
    this.kind = 'file'
    this.writable = writable
    this.readable = true
  }

  get name (): string {
    return this.file.name
  }

  isSameEntry (other: { file: { toURL: () => string } }): boolean {
    return this.file.toURL() === other.file.toURL()
  }

  getFile (): Promise<File> {
    return new Promise(this.file.file.bind(this.file))
  }

  createWritable (opts: { keepExistingData?: boolean } = {}): Promise<Sink> {
    if (!this.writable) throw new DOMException(...DISALLOWED)

    return new Promise<Sink>((resolve, reject) =>
      this.file.createWriter((fileWriter) => {
        if (opts.keepExistingData === false) {
          fileWriter.onwriteend = () => resolve(new Sink(fileWriter, this.file))
          fileWriter.truncate(0)
        } else {
          resolve(new Sink(fileWriter, this.file))
        }
      }, reject)
    )
  }
}

export class FolderHandle {
  dir: FileSystemDirectoryEntry
  writable: boolean
  readable: boolean
  kind: string
  name: string

  constructor (dir: DirectoryEntry, writable: boolean = true) {
    this.dir = dir
    this.writable = writable
    this.readable = true
    this.kind = 'directory'
    this.name = dir.name
  }

  isSameEntry (other: FolderHandle): boolean {
    return this.dir.fullPath === other.dir.fullPath
  }

  async * entries (): AsyncGenerator<[string, FileHandle | FolderHandle]> {
    const reader = this.dir.createReader()
    const entries = await new Promise<FileSystemEntry[]>((resolve, reject) => {
      reader.readEntries(resolve, reject)
    })
    for (const x of entries) {
      yield [x.name, x.isFile ? new FileHandle(x as FileEntry, this.writable) : new FolderHandle(x as DirectoryEntry, this.writable)]
    }
  }

  getDirectoryHandle (name: string, opts: { create: boolean }): Promise<FolderHandle> {
    return new Promise<FolderHandle>((resolve, reject) => {
      this.dir.getDirectory(name, opts, (dir) => {
        resolve(new FolderHandle(dir))
      }, reject)
    })
  }

  getFileHandle (name: string, opts: { create: boolean }): Promise<FileHandle> {
    return new Promise<FileHandle>((resolve, reject) =>
      this.dir.getFile(name, opts, (file) => resolve(new FileHandle(file)), reject)
    )
  }

  async removeEntry (name: string, opts: { recursive: boolean }): Promise<void> {
    const entry: Error | FolderHandle | FileHandle = await this.getDirectoryHandle(name, { create: false }).catch(err =>
      err.name === 'TypeMismatchError' ? this.getFileHandle(name, { create: false }) : err
    ) as any

    if (entry instanceof Error) throw entry

    return new Promise<void>((resolve, reject) => {
      if (entry instanceof FolderHandle) {
        opts.recursive
          ? entry.dir.removeRecursively(() => resolve(), reject)
          : entry.dir.remove(() => resolve(), reject)
      } else if ((entry as FileHandle).file) {
        (entry as FileHandle).file.remove(() => resolve(), reject)
      }
    })
  }
}

export default (opts: { _persistent?: boolean } = {}): Promise<FolderHandle> => new Promise<FolderHandle>((resolve, reject) =>
  (window as any).webkitRequestFileSystem(
    opts._persistent, 0,
    (e: FileSystem) => resolve(new FolderHandle(e.root)),
    reject
  )
)
