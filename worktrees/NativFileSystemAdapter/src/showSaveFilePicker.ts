import type FileSystemFileHandle from './FileSystemFileHandle.js'

const native = globalThis.showSaveFilePicker

type ShowSaveFilePickerOptions = {
  excludeAcceptAllOption?: boolean
  types?: any[]
  suggestedName?: string
  _name?: string
  _preferPolyfill?: boolean
}

async function showSaveFilePicker (options: ShowSaveFilePickerOptions = {}): Promise<FileSystemFileHandle> {
  if (native && !options._preferPolyfill) {
    return native(options) as Promise<FileSystemFileHandle>
  }

  if (options._name) {
    console.warn('deprecated _name, spec now have `suggestedName`')
    options.suggestedName = options._name
  }

  const { FileSystemFileHandle } = await import('./FileSystemFileHandle.js')
  const { FileHandle } = await import('./adapters/downloader.js')
  return new FileSystemFileHandle(new FileHandle(options.suggestedName))
}

export default showSaveFilePicker
export { showSaveFilePicker }
