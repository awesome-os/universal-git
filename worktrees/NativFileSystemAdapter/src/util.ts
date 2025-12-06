export const errors = {
  INVALID: ['seeking position failed.', 'InvalidStateError'],
  GONE: ['A requested file or directory could not be found at the time an operation was processed.', 'NotFoundError'],
  MISMATCH: ['The path supplied exists, but was not an entry of requested type.', 'TypeMismatchError'],
  MOD_ERR: ['The object can not be modified in this way.', 'InvalidModificationError'],
  SYNTAX: (m: string) => [`Failed to execute 'write' on 'UnderlyingSinkBase': Invalid params passed. ${m}`, 'SyntaxError'],
  SECURITY: ['It was determined that certain files are unsafe for access within a Web application, or that too many calls are being made on file resources.', 'SecurityError'],
  DISALLOWED: ['The request is not allowed by the user agent or the platform in the current context.', 'NotAllowedError']
}

export const config = {
  writable: globalThis.WritableStream
}

import type FileSystemDirectoryHandle from './FileSystemDirectoryHandle.js'
import type FileSystemFileHandle from './FileSystemFileHandle.js'

export async function fromDataTransfer (entries: DataTransferItemList | DataTransferItem[]): Promise<FileSystemDirectoryHandle> {
  console.warn('deprecated fromDataTransfer - use `dt.items[0].getAsFileSystemHandle()` instead')
  const [memory, sandbox, fs] = await Promise.all([
    import('./adapters/memory.js'),
    import('./adapters/sandbox.js'),
    import('./FileSystemDirectoryHandle.js')
  ])

  const folder = new memory.FolderHandle('', false)
  const entriesObj: { [key: string]: any } = {}
  for (const entry of Array.from(entries)) {
    const fsEntry = (entry as any).webkitGetAsEntry()
    if (fsEntry) {
      entriesObj[fsEntry.name] = fsEntry.isFile
        ? new sandbox.FileHandle(fsEntry, false)
        : new sandbox.FolderHandle(fsEntry, false)
    }
  }
  folder._entries = entriesObj

  return new fs.FileSystemDirectoryHandle(folder)
}

export async function getDirHandlesFromInput (input: HTMLInputElement): Promise<FileSystemDirectoryHandle> {
  const { FolderHandle, FileHandle } = await import('./adapters/memory.js')
  const { FileSystemDirectoryHandle } = await import('./FileSystemDirectoryHandle.js')

  const files = Array.from(input.files || [])
  const rootName = files[0]?.webkitRelativePath.split('/', 1)[0] || ''
  const root = new FolderHandle(rootName, false)

  files.forEach(file => {
    const path = file.webkitRelativePath.split('/')
    path.shift()
    const name = path.pop() || ''

    let dir: InstanceType<typeof FolderHandle> = root
    for (const pathSegment of path) {
      if (!dir._entries[pathSegment]) {
        dir._entries[pathSegment] = new FolderHandle(pathSegment, false)
      }
      dir = dir._entries[pathSegment] as InstanceType<typeof FolderHandle>
    }

    dir._entries[name] = new FileHandle(file.name, file, false)
  })

  return new FileSystemDirectoryHandle(root)
}

export async function getFileHandlesFromInput (input: HTMLInputElement): Promise<FileSystemFileHandle[]> {
  const { FileHandle } = await import('./adapters/memory.js')
  const { FileSystemFileHandle } = await import('./FileSystemFileHandle.js')

  return Array.from(input.files || []).map(file =>
    new FileSystemFileHandle(new FileHandle(file.name, file, false))
  )
}
