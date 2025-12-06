import { errors } from '../util.js'

const { INVALID, GONE, MISMATCH, MOD_ERR, SYNTAX, SECURITY, DISALLOWED } = errors

export class Sink {
  constructor () {
  }
  write (chunk: any): void {
  }
  close (): void {
  }
}

export class FileHandle {
  _path: string

  constructor () {
    this._path = ''
  }

  /**
   * @public - publicly available to the wrapper
   */
  async getFile (): Promise<File> {
    return new File([], '')
  }

  async createWritable (): Promise<Sink> {
    return new Sink()
  }

  /**
   * @public - Publicly available to the wrapper
   */
  async isSameEntry (other: FileHandle): Promise<boolean> {
    return other._path === this._path
  }
}

export class FolderHandle {
  _path: string

  constructor () {
    this._path = ''
  }

  /**
   * @public - Publicly available to the wrapper
   */
  async * entries (): AsyncGenerator<[string, FileHandle | FolderHandle]> {
    yield ['', new FileHandle()]
  }

  /**
   * @public - Publicly available to the wrapper
   */
  async isSameEntry (other: FolderHandle): Promise<boolean> {
    return other._path === this._path
  }

  /**
   * @public - Publicly available to the wrapper
   */
  async getDirectoryHandle (name: string, options: { create: boolean }): Promise<FolderHandle> {
    return new FolderHandle()
  }

  /**
   * @public - Publicly available to the wrapper
   */
  async getFileHandle (name: string, options: { create: boolean }): Promise<FileHandle> {
    return new FileHandle()
  }

  /**
   * Removes the entry named `name` in the directory represented
   * by directoryHandle. If that entry is a directory, its
   * contents will also be deleted recursively.
   *
   * Attempting to delete a file or directory that does not
   * exist is considered success.
   *
   * @public - Publicly available to the wrapper
   */
  async removeEntry (name: string, options: { recursive: boolean }): Promise<void> {
  }
}

const fs = new FolderHandle()

export default () => fs
