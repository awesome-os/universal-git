import type FileSystemDirectoryHandle from './FileSystemDirectoryHandle.js'

if (globalThis.DataTransferItem && !(DataTransferItem.prototype as any).getAsFileSystemHandle) {
  (DataTransferItem.prototype as any).getAsFileSystemHandle = async function (): Promise<FileSystemDirectoryHandle | FileSystemFileHandle> {
    const entry = this.webkitGetAsEntry()
    const [
      { FileHandle, FolderHandle },
      { FileSystemDirectoryHandle },
      { FileSystemFileHandle }
    ] = await Promise.all([
      import('./adapters/sandbox.js'),
      import('./FileSystemDirectoryHandle.js'),
      import('./FileSystemFileHandle.js')
    ])

    return entry.isFile
      ? new FileSystemFileHandle(new FileHandle(entry, false))
      : new FileSystemDirectoryHandle(new FolderHandle(entry, false))
  }
}

import type FileSystemFileHandle from './FileSystemFileHandle.js'

async function getOriginPrivateDirectory (driver?: any, options: any = {}): Promise<FileSystemDirectoryHandle> {
  if (!driver) {
    return (globalThis.navigator?.storage?.getDirectory() || (globalThis as any).getOriginPrivateDirectory()) as Promise<FileSystemDirectoryHandle>
  }
  const {FileSystemDirectoryHandle} = await import('./FileSystemDirectoryHandle.js')
  const module = await driver
  const sandbox = await (module.default
    ? module.default(options)
    : module(options)
  )
  return new FileSystemDirectoryHandle(sandbox)
}

export default getOriginPrivateDirectory
