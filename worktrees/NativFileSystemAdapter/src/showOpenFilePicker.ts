import type FileSystemFileHandle from './FileSystemFileHandle.js'

const def = { accepts: [] }
const native = globalThis.showOpenFilePicker

interface ShowOpenFilePickerOptions {
  multiple?: boolean
  excludeAcceptAllOption?: boolean
  accepts?: Array<{ extensions?: string[]; mimeTypes?: string[] }>
  _preferPolyfill?: boolean
}

async function showOpenFilePicker (options: ShowOpenFilePickerOptions = {}): Promise<FileSystemFileHandle[]> {
  const opts = { ...def, ...options }

  if (native && !options._preferPolyfill) {
    return native(opts) as Promise<FileSystemFileHandle[]>
  }

  const input = document.createElement('input')
  input.type = 'file'
  input.multiple = opts.multiple
  input.accept = (opts.accepts || [])
    .map(e => [
      ...(e.extensions || []).map(e => '.' + e),
      ...e.mimeTypes || []]
    )
    .flat()
    .join(',')

  // See https://stackoverflow.com/questions/47664777/javascript-file-input-onchange-not-working-ios-safari-only
  Object.assign(input.style, {
    position: 'fixed',
    top: '-100000px',
    left: '-100000px'
  })

  document.body.appendChild(input)

  // Lazy load while the user is choosing the directory
  const p = import('./util.js')

  await new Promise<void>(resolve => {
    input.addEventListener('change', () => resolve(), { once: true })
    input.click()
  })
  input.remove()

  return p.then(m => m.getFileHandlesFromInput(input))
}

export default showOpenFilePicker
export { showOpenFilePicker }
