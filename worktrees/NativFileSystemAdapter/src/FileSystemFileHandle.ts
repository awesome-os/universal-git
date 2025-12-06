import FileSystemHandle from './FileSystemHandle.js'
import FileSystemWritableFileStream from './FileSystemWritableFileStream.js'
import './createWritable.js'

const kAdapter = Symbol('adapter')

class FileSystemFileHandle extends FileSystemHandle {
  [kAdapter]: any

  constructor (adapter: any) {
    super(adapter)
    this[kAdapter] = adapter
  }

  async createWritable (options: { keepExistingData?: boolean } = {}): Promise<FileSystemWritableFileStream> {
    return new FileSystemWritableFileStream(
      await this[kAdapter].createWritable(options)
    )
  }

  async getFile (): Promise<File> {
    return this[kAdapter].getFile()
  }
}

Object.defineProperty(FileSystemFileHandle.prototype, Symbol.toStringTag, {
  value: 'FileSystemFileHandle',
  writable: false,
  enumerable: false,
  configurable: true
})

Object.defineProperties(FileSystemFileHandle.prototype, {
  createWritable: { enumerable: true },
  getFile: { enumerable: true }
})

export default FileSystemFileHandle
export { FileSystemFileHandle }
