import { join } from "../../core-utils/GitPath.ts"
import { UniversalBuffer } from "../../utils/UniversalBuffer.ts"
import type { GitBackendFs } from './GitBackendFs.ts'

/**
 * Object database operations for GitBackendFs
 */

// Helper function for OID to path conversion
function oidToPath(oid: string): { dir: string; file: string } {
  return {
    dir: oid.substring(0, 2),
    file: oid.substring(2),
  }
}

export async function readLooseObject(this: GitBackendFs, oid: string): Promise<UniversalBuffer | null> {
  const { dir, file } = oidToPath(oid)
  const path = join(this.getGitdir(), 'objects', dir, file)
  try {
    const data = await this.getFs().read(path)
    if (data === null || data === undefined) {
      return null
    }
    const buffer = UniversalBuffer.from(data as string | Uint8Array)
    return buffer.length === 0 ? null : buffer
  } catch {
    return null
  }
}

export async function writeLooseObject(this: GitBackendFs, oid: string, data: UniversalBuffer): Promise<void> {
  const { dir, file } = oidToPath(oid)
  const objectDir = join(this.getGitdir(), 'objects', dir)
  if (!(await this.getFs().exists(objectDir))) {
    await this.getFs().mkdir(objectDir)
  }
  const path = join(objectDir, file)
  // Don't overwrite existing objects
  if (!(await this.getFs().exists(path))) {
    await this.getFs().write(path, data)
  }
}

export async function hasLooseObject(this: GitBackendFs, oid: string): Promise<boolean> {
  const { dir, file } = oidToPath(oid)
  const path = join(this.getGitdir(), 'objects', dir, file)
  return this.getFs().exists(path)
}

export async function listLooseObjects(this: GitBackendFs): Promise<string[]> {
  const objectsDir = join(this.getGitdir(), 'objects')
  const oids: string[] = []
  try {
    const dirs = await this.getFs().readdir(objectsDir)
    if (!dirs) {
      return oids
    }
    for (const dir of dirs) {
      if (typeof dir === 'string' && dir.length === 2 && /^[0-9a-f]{2}$/i.test(dir)) {
        const subDir = join(objectsDir, dir)
        const files = await this.getFs().readdir(subDir)
        if (!files) {
          continue
        }
        for (const file of files) {
          if (typeof file === 'string' && file.length === 38) {
            oids.push(dir + file)
          }
        }
      }
    }
  } catch {
    // Ignore errors
  }
  return oids
}

export async function readPackfile(this: GitBackendFs, name: string): Promise<UniversalBuffer | null> {
  const path = join(this.getGitdir(), 'objects', 'pack', name)
  try {
    const data = await this.getFs().read(path)
    if (data === null || data === undefined) {
      return null
    }
    const buffer = UniversalBuffer.from(data as string | Uint8Array)
    return buffer.length === 0 ? null : buffer
  } catch {
    return null
  }
}

export async function writePackfile(this: GitBackendFs, name: string, data: UniversalBuffer): Promise<void> {
  const packDir = join(this.getGitdir(), 'objects', 'pack')
  if (!(await this.getFs().exists(packDir))) {
    await this.getFs().mkdir(packDir)
  }
  const path = join(packDir, name)
  await this.getFs().write(path, data)
}

export async function listPackfiles(this: GitBackendFs): Promise<string[]> {
  const packDir = join(this.getGitdir(), 'objects', 'pack')
  try {
    const files = await this.getFs().readdir(packDir)
    if (!files) {
      return []
    }
    return files
      .filter((f: string) => typeof f === 'string' && f.endsWith('.pack'))
      .map((f: string) => f)
  } catch {
    return []
  }
}

export async function readPackIndex(this: GitBackendFs, name: string): Promise<UniversalBuffer | null> {
  const path = join(this.getGitdir(), 'objects', 'pack', name)
  try {
    const data = await this.getFs().read(path)
    if (data === null || data === undefined) {
      return null
    }
    const buffer = UniversalBuffer.from(data as string | Uint8Array)
    return buffer.length === 0 ? null : buffer
  } catch {
    return null
  }
}

export async function writePackIndex(this: GitBackendFs, name: string, data: UniversalBuffer): Promise<void> {
  const packDir = join(this.getGitdir(), 'objects', 'pack')
  if (!(await this.getFs().exists(packDir))) {
    await this.getFs().mkdir(packDir)
  }
  const path = join(packDir, name)
  await this.getFs().write(path, data)
}

export async function readPackBitmap(this: GitBackendFs, name: string): Promise<UniversalBuffer | null> {
  const path = join(this.getGitdir(), 'objects', 'pack', name)
  try {
    const data = await this.getFs().read(path)
    if (data === null || data === undefined) {
      return null
    }
    const buffer = UniversalBuffer.from(data as string | Uint8Array)
    return buffer.length === 0 ? null : buffer
  } catch {
    return null
  }
}

export async function writePackBitmap(this: GitBackendFs, name: string, data: UniversalBuffer): Promise<void> {
  const packDir = join(this.getGitdir(), 'objects', 'pack')
  if (!(await this.getFs().exists(packDir))) {
    await this.getFs().mkdir(packDir)
  }
  const path = join(packDir, name)
  await this.getFs().write(path, data)
}

export async function readODBInfoFile(this: GitBackendFs, name: string): Promise<string | null> {
  const path = join(this.getGitdir(), 'objects', 'info', name)
  try {
    const data = await this.getFs().read(path)
    return UniversalBuffer.isBuffer(data) ? data.toString('utf8') : (data as string)
  } catch {
    return null
  }
}

export async function writeODBInfoFile(this: GitBackendFs, name: string, data: string): Promise<void> {
  const infoDir = join(this.getGitdir(), 'objects', 'info')
  if (!(await this.getFs().exists(infoDir))) {
    await this.getFs().mkdir(infoDir)
  }
  const path = join(infoDir, name)
  await this.getFs().write(path, UniversalBuffer.from(data, 'utf8'))
}

export async function deleteODBInfoFile(this: GitBackendFs, name: string): Promise<void> {
  const path = join(this.getGitdir(), 'objects', 'info', name)
  try {
    await this.getFs().rm(path)
  } catch {
    // Ignore if file doesn't exist
  }
}

export async function readMultiPackIndex(this: GitBackendFs): Promise<UniversalBuffer | null> {
  const path = join(this.getGitdir(), 'objects', 'info', 'multi-pack-index')
  try {
    const data = await this.getFs().read(path)
    if (data === null || data === undefined) {
      return null
    }
    const buffer = UniversalBuffer.from(data as string | Uint8Array)
    return buffer.length === 0 ? null : buffer
  } catch {
    return null
  }
}

export async function writeMultiPackIndex(this: GitBackendFs, data: UniversalBuffer): Promise<void> {
  const infoDir = join(this.getGitdir(), 'objects', 'info')
  if (!(await this.getFs().exists(infoDir))) {
    await this.getFs().mkdir(infoDir)
  }
  const path = join(infoDir, 'multi-pack-index')
  await this.getFs().write(path, data)
}

export async function hasMultiPackIndex(this: GitBackendFs): Promise<boolean> {
  const path = join(this.getGitdir(), 'objects', 'info', 'multi-pack-index')
  return this.getFs().exists(path)
}

export async function getObjectFormat(this: GitBackendFs, cache?: Record<string, unknown>): Promise<'sha1' | 'sha256'> {
  // OPTIMIZATION: Cache object format per gitdir to avoid repeated config reads
  const { detectObjectFormat } = await import('../../utils/detectObjectFormat.ts')
  return detectObjectFormat(this.getFs(), this.getGitdir(), cache, this)
}

export async function setObjectFormat(this: GitBackendFs, objectFormat: 'sha1' | 'sha256'): Promise<void> {
  // Check if repository is already initialized
  if (await this.isInitialized()) {
    const configBuffer = await this.readConfig()
    if (configBuffer.length > 0) {
      const configContent = configBuffer.toString('utf8')
      const lines = configContent.split('\n')
      let inExtensions = false
      for (const line of lines) {
        const trimmed = line.trim()
        if (trimmed === '[extensions]') {
          inExtensions = true
        } else if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
          inExtensions = false
        } else if (inExtensions && trimmed.startsWith('objectformat')) {
          // objectFormat is already explicitly set, check if trying to change it
          const match = trimmed.match(/objectformat\s*=\s*(\w+)/i)
          if (match) {
            const currentFormat = match[1].toLowerCase() === 'sha256' ? 'sha256' : 'sha1'
            if (currentFormat !== objectFormat) {
              throw new Error(`Cannot change objectFormat from ${currentFormat} to ${objectFormat} on an already initialized repository`)
            }
            // Same format, no-op
            return
          }
        }
      }
      // Config exists but objectFormat not explicitly set (defaults to sha1)
      // If trying to set to sha256, that's a change from the implicit sha1
      if (objectFormat !== 'sha1') {
        throw new Error(`Cannot change objectFormat from sha1 to ${objectFormat} on an already initialized repository`)
      }
      // Setting to sha1 when it's already implicitly sha1, no-op
      return
    }
  }
  
  await this.setConfig('extensions.objectformat', objectFormat, 'local')
  
  // Also set repository format version
  if (objectFormat === 'sha256') {
    await this.setConfig('core.repositoryformatversion', '1', 'local')
  } else {
    await this.setConfig('core.repositoryformatversion', '0', 'local')
  }
}

export async function readObject(
  this: GitBackendFs,
  oid: string,
  format: 'deflated' | 'wrapped' | 'content' = 'content',
  cache: Record<string, unknown> = {}
): Promise<{
  type: string
  object: UniversalBuffer
  format: string
  source?: string
  oid?: string
}> {
  const { readObject } = await import('../../git/objects/readObject.ts')
  const objectFormat = await this.getObjectFormat(cache)
  return readObject({
    fs: this.getFs(),
    cache,
    gitdir: this.getGitdir(),
    oid,
    format,
    objectFormat,
  })
}

export async function writeObject(
  this: GitBackendFs,
  type: string,
  object: UniversalBuffer | Uint8Array,
  format: 'wrapped' | 'deflated' | 'content' = 'content',
  oid?: string,
  dryRun: boolean = false,
  cache: Record<string, unknown> = {}
): Promise<string> {
  const { writeObject } = await import('../../git/objects/writeObject.ts')
  const objectFormat = await this.getObjectFormat(cache)
  return writeObject({
    fs: this.getFs(),
    gitdir: this.getGitdir(),
    type,
    object: UniversalBuffer.from(object),
    format,
    oid,
    dryRun,
    objectFormat,
  })
}

