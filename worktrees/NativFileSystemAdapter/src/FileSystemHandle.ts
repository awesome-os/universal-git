const kAdapter = Symbol('adapter')

export interface FileSystemHandlePermissionDescriptor {
  mode?: 'read' | 'readwrite'
}

class FileSystemHandle {
  [kAdapter]: FileSystemHandle & { writable?: boolean }

  name: string
  kind: 'file' | 'directory'

  constructor (adapter: FileSystemHandle & { writable?: boolean }) {
    this.kind = adapter.kind
    this.name = adapter.name
    this[kAdapter] = adapter
  }

  async queryPermission (descriptor: FileSystemHandlePermissionDescriptor = {}): Promise<PermissionState> {
    const { mode = 'read' } = descriptor
    const handle = this[kAdapter]

    if (handle.queryPermission) {
      return handle.queryPermission({mode}) as Promise<PermissionState>
    }

    if (mode === 'read') {
      return 'granted'
    } else if (mode === 'readwrite') {
      return handle.writable ? 'granted' : 'denied'
    } else {
      throw new TypeError(`Mode ${mode} must be 'read' or 'readwrite'`)
    }
  }

  async requestPermission ({mode = 'read'}: FileSystemHandlePermissionDescriptor = {}): Promise<PermissionState> {
    const handle = this[kAdapter]
    if (handle.requestPermission) {
      return handle.requestPermission({mode}) as Promise<PermissionState>
    }

    if (mode === 'read') {
      return 'granted'
    } else if (mode === 'readwrite') {
      return handle.writable ? 'granted' : 'denied'
    } else {
      throw new TypeError(`Mode ${mode} must be 'read' or 'readwrite'`)
    }
  }

  async remove (options: { recursive?: boolean } = {}): Promise<void> {
    await this[kAdapter].remove(options)
  }

  async isSameEntry (other: FileSystemHandle): Promise<boolean> {
    if (this === other) return true
    if (
      (!other) ||
      (typeof other !== 'object') ||
      (this.kind !== other.kind) ||
      (!other[kAdapter])
    ) return false
    return this[kAdapter].isSameEntry(other[kAdapter])
  }
}

Object.defineProperty(FileSystemHandle.prototype, Symbol.toStringTag, {
  value: 'FileSystemHandle',
  writable: false,
  enumerable: false,
  configurable: true
})

// Safari safari doesn't support writable streams yet.
if (globalThis.FileSystemHandle) {
  globalThis.FileSystemHandle.prototype.queryPermission ??= function (descriptor: FileSystemHandlePermissionDescriptor) {
    return 'granted'
  }
}

export default FileSystemHandle
export { FileSystemHandle }
