import type FileSystemDirectoryHandle from '../src/FileSystemDirectoryHandle.js'

export function streamFromFetch (data: string): ReadableStream {
  return new ReadableStream({
    start (ctrl: ReadableStreamDefaultController) {
      ctrl.enqueue(data)
      ctrl.close()
    }
  })
}

export function arrayEqual (a1: any, a2: any): void {
  assert(JSON.stringify(a1) === JSON.stringify(a2), `expected ${a2} to equal ${a1}`)
}

export function assert (r: boolean, msg: string = 'Assertion failed'): void {
  if (!r) throw new Error(msg)
}

export function capture<T> (p: Promise<T>): Promise<T | Error> {
  return p.catch(_ => _)
}

export async function cleanupSandboxedFileSystem (root: FileSystemDirectoryHandle): Promise<void> {
  for await (const [name, entry] of root) {
    await root.removeEntry(name, { recursive: entry.kind === 'directory' })
  }
}

export async function getFileSize (handle: any): Promise<number> {
  const file = await handle.getFile()
  return file.size
}

export async function getFileContents (handle: any): Promise<string> {
  const file = await handle.getFile()
  return file.text()
}

export async function getDirectoryEntryCount (handle: FileSystemDirectoryHandle): Promise<number> {
  let result = 0
  for await (const {} of handle.entries()) {
    result++
  }
  return result
}

export async function createEmptyFile (name: string, parent: FileSystemDirectoryHandle): Promise<any> {
  const handle = await parent.getFileHandle(name, { create: true })
  // Make sure the file is empty.
  assert(await getFileSize(handle) === 0)
  return handle
}

export async function createFileWithContents (fileName: string, contents: string, parent: FileSystemDirectoryHandle): Promise<any> {
  const handle = await createEmptyFile(fileName, parent)
  const Writable = await handle.createWritable()
  await Writable.write(contents)
  await Writable.close()
  return handle
}

export async function getSortedDirectoryEntries (handle: FileSystemDirectoryHandle): Promise<string[]> {
  const result: string[] = []
  for await (const [name, entry] of handle) {
    result.push(name + (entry.kind === 'directory' ? '/' : ''))
  }
  result.sort()
  return result
}

export async function createDirectory (name: string, parent: FileSystemDirectoryHandle): Promise<FileSystemDirectoryHandle> {
  return parent.getDirectoryHandle(name, { create: true })
}
