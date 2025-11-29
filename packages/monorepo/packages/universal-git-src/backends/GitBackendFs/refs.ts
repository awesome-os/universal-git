import { join } from "../../core-utils/GitPath.ts"
import { UniversalBuffer } from "../../utils/UniversalBuffer.ts"
import type { GitBackendFs } from './GitBackendFs.ts'

/**
 * Reference operations for GitBackendFs
 */

// Helper for recursive file listing
async function listFilesRecursive(
  fs: import('../../models/FileSystem.ts').FileSystem,
  dirPath: string,
  prefix: string,
  files: string[]
): Promise<void> {
  try {
    const entries = await fs.readdir(dirPath)
    if (!entries) {
      return
    }
    for (const entry of entries) {
      if (typeof entry === 'string') {
        const fullPath = join(dirPath, entry)
        const relPath = prefix ? join(prefix, entry) : entry
        const stats = await fs.lstat(fullPath)
        if (stats && stats.isDirectory()) {
          await listFilesRecursive(fs, fullPath, relPath, files)
        } else {
          files.push(relPath)
        }
      }
    }
  } catch {
    // Ignore errors
  }
}

export async function readRef(this: GitBackendFs, ref: string, depth: number = 5, cache: Record<string, unknown> = {}): Promise<string | null> {
  const { readRef } = await import('../../git/refs/readRef.ts')
  const { isWorktreeGitdir, getMainGitdir, isWorktreeSpecificRef } = await import('../../git/refs/worktreeRefs.ts')
  
  // Handle worktree context: HEAD goes to worktree gitdir, other refs go to main gitdir
  let effectiveGitdir = this.getGitdir()
  if (isWorktreeGitdir(this.getGitdir())) {
    if (isWorktreeSpecificRef(ref)) {
      // HEAD and worktree-specific refs go to worktree gitdir
      effectiveGitdir = this.getGitdir()
    } else {
      // Other refs go to main gitdir
      effectiveGitdir = await getMainGitdir({ fs: this.getFs(), worktreeGitdir: this.getGitdir() })
    }
  }
  // In a normal repository (not a worktree gitdir), HEAD is in the main gitdir (this.getGitdir())
  
  const objectFormat = await this.getObjectFormat(cache)
  return readRef({
    fs: this.getFs(),
    gitdir: effectiveGitdir,
    ref,
    depth,
    objectFormat,
    cache,
  })
}

export async function writeRef(this: GitBackendFs, ref: string, value: string, skipReflog: boolean = false, cache: Record<string, unknown> = {}): Promise<void> {
  const { writeRef } = await import('../../git/refs/writeRef.ts')
  const { isWorktreeGitdir, getMainGitdir, isWorktreeSpecificRef } = await import('../../git/refs/worktreeRefs.ts')
  
  // Handle worktree context: HEAD goes to worktree gitdir, other refs go to main gitdir
  let effectiveGitdir = this.getGitdir()
  if (isWorktreeGitdir(this.getGitdir())) {
    if (isWorktreeSpecificRef(ref)) {
      // HEAD and worktree-specific refs go to worktree gitdir
      effectiveGitdir = this.getGitdir()
    } else {
      // Other refs go to main gitdir
      effectiveGitdir = await getMainGitdir({ fs: this.getFs(), worktreeGitdir: this.getGitdir() })
    }
  }
  
  const objectFormat = await this.getObjectFormat(cache)
  return writeRef({
    fs: this.getFs(),
    gitdir: effectiveGitdir,
    ref,
    value,
    objectFormat,
    skipReflog,
  })
}

export async function writeSymbolicRef(this: GitBackendFs, ref: string, value: string, oldOid?: string, cache: Record<string, unknown> = {}): Promise<void> {
  const { writeSymbolicRef } = await import('../../git/refs/writeRef.ts')
  const { isWorktreeGitdir, getMainGitdir, isWorktreeSpecificRef } = await import('../../git/refs/worktreeRefs.ts')
  
  // Handle worktree context: HEAD goes to worktree gitdir, other refs go to main gitdir
  let effectiveGitdir = this.getGitdir()
  if (isWorktreeGitdir(this.getGitdir())) {
    if (isWorktreeSpecificRef(ref)) {
      // HEAD and worktree-specific refs go to worktree gitdir
      effectiveGitdir = this.getGitdir()
    } else {
      // Other refs go to main gitdir
      effectiveGitdir = await getMainGitdir({ fs: this.getFs(), worktreeGitdir: this.getGitdir() })
    }
  }
  
  const objectFormat = await this.getObjectFormat(cache)
  return writeSymbolicRef({
    gitBackend: this,
    ref,
    value,
    oldOid,
    objectFormat,
  })
}

export async function readSymbolicRef(this: GitBackendFs, ref: string): Promise<string | null> {
  const { readSymbolicRef } = await import('../../git/refs/readRef.ts')
  const { isWorktreeGitdir, getMainGitdir, isWorktreeSpecificRef } = await import('../../git/refs/worktreeRefs.ts')
  
  // Handle worktree context: HEAD goes to worktree gitdir, other refs go to main gitdir
  let effectiveGitdir = this.getGitdir()
  if (isWorktreeGitdir(this.getGitdir())) {
    if (isWorktreeSpecificRef(ref)) {
      // HEAD and worktree-specific refs go to worktree gitdir
      effectiveGitdir = this.getGitdir()
    } else {
      // Other refs go to main gitdir
      effectiveGitdir = await getMainGitdir({ fs: this.getFs(), worktreeGitdir: this.getGitdir() })
    }
  }
  
  return readSymbolicRef({
    fs: this.getFs(),
    gitdir: effectiveGitdir,
    ref,
  })
}

export async function deleteRef(this: GitBackendFs, ref: string, cache: Record<string, unknown> = {}): Promise<void> {
  const { deleteRef } = await import('../../git/refs/deleteRef.ts')
  const { isWorktreeGitdir, getMainGitdir, isWorktreeSpecificRef } = await import('../../git/refs/worktreeRefs.ts')
  
  // Handle worktree context: HEAD goes to worktree gitdir, other refs go to main gitdir
  let effectiveGitdir = this.getGitdir()
  if (isWorktreeGitdir(this.getGitdir())) {
    if (isWorktreeSpecificRef(ref)) {
      // HEAD and worktree-specific refs go to worktree gitdir
      effectiveGitdir = this.getGitdir()
    } else {
      // Other refs go to main gitdir
      effectiveGitdir = await getMainGitdir({ fs: this.getFs(), worktreeGitdir: this.getGitdir() })
    }
  }
  
  return deleteRef({
    fs: this.getFs(),
    gitdir: effectiveGitdir,
    ref,
  })
}

export async function listRefs(this: GitBackendFs, filepath: string): Promise<string[]> {
  const { listRefs } = await import('../../git/refs/listRefs.ts')
  return listRefs({
    fs: this.getFs(),
    gitdir: this.getGitdir(),
    filepath,
  })
}

export async function readReflog(this: GitBackendFs, ref: string): Promise<string | null> {
  const path = join(this.getGitdir(), 'logs', ref)
  try {
    const data = await this.getFs().read(path)
    return UniversalBuffer.isBuffer(data) ? data.toString('utf8') : (data as string)
  } catch {
    return null
  }
}

export async function writeReflog(this: GitBackendFs, ref: string, data: string): Promise<void> {
  const path = join(this.getGitdir(), 'logs', ref)
  const logDir = path.substring(0, path.lastIndexOf('/'))
  if (logDir && !(await this.getFs().exists(logDir))) {
    await this.getFs().mkdir(logDir)
  }
  await this.getFs().write(path, UniversalBuffer.from(data, 'utf8'))
}

export async function appendReflog(this: GitBackendFs, ref: string, entry: string): Promise<void> {
  const path = join(this.getGitdir(), 'logs', ref)
  const logDir = path.substring(0, path.lastIndexOf('/'))
  if (logDir && !(await this.getFs().exists(logDir))) {
    await this.getFs().mkdir(logDir)
  }
  const existing = await this.readReflog(ref)
  const newContent = existing ? existing + entry : entry
  await this.writeReflog(ref, newContent)
}

export async function deleteReflog(this: GitBackendFs, ref: string): Promise<void> {
  const path = join(this.getGitdir(), 'logs', ref)
  try {
    await this.getFs().rm(path)
  } catch {
    // Ignore if file doesn't exist
  }
}

export async function listReflogs(this: GitBackendFs): Promise<string[]> {
  const logsDir = join(this.getGitdir(), 'logs')
  const refs: string[] = []
  try {
    await listFilesRecursive(this.getFs(), logsDir, 'logs', refs)
  } catch {
    // Ignore errors
  }
  return refs
}

export async function readPackedRefs(this: GitBackendFs): Promise<string | null> {
  const { createFileSystem } = await import('../../utils/createFileSystem.ts')
  const normalizedFs = createFileSystem(this.getFs())
  const packedRefsPath = join(this.getGitdir(), 'packed-refs')
  try {
    const content = await normalizedFs.read(packedRefsPath, 'utf8')
    if (typeof content === 'string') {
      return content
    }
    return content ? content.toString('utf8') : null
  } catch {
    return null
  }
}

export async function writePackedRefs(this: GitBackendFs, data: string): Promise<void> {
  const { createFileSystem } = await import('../../utils/createFileSystem.ts')
  const normalizedFs = createFileSystem(this.getFs())
  const packedRefsPath = join(this.getGitdir(), 'packed-refs')
  await normalizedFs.write(packedRefsPath, data, 'utf8')
}

export async function expandRef(this: GitBackendFs, ref: string, cache: Record<string, unknown> = {}): Promise<string> {
  const { NotFoundError } = await import('../../errors/NotFoundError.ts')
  const { parsePackedRefs } = await import('../../git/refs/packedRefs.ts')
  
  // Is it a complete and valid SHA?
  if (ref.length === 40 && /[0-9a-f]{40}/.test(ref)) {
    return ref
  }
  
  // Read packed refs
  let packedMap = new Map<string, string>()
  try {
    const content = await this.readPackedRefs()
    if (content) {
      packedMap = parsePackedRefs(content)
    }
  } catch {
    // packed-refs doesn't exist, that's okay
  }
  
  // Define refpaths in the same order as the command
  const refpaths = [
    `${ref}`,
    `refs/${ref}`,
    `refs/tags/${ref}`,
    `refs/heads/${ref}`,
    `refs/remotes/${ref}`,
    `refs/remotes/${ref}/HEAD`,
  ]
  
  // Look in all the proper paths, in this order
  // We need to check each path directly (not using readRef which expands internally)
  for (const refPath of refpaths) {
    // Check if ref file exists at this specific path
    const refFilePath = join(this.getGitdir(), refPath)
    try {
      const exists = await this.getFs().exists(refFilePath)
      if (exists) {
        // File exists, verify it's a valid ref by reading it
        try {
          const content = await this.getFs().read(refFilePath, 'utf8')
          if (content) {
            const contentStr = typeof content === 'string' ? content : content.toString('utf8')
            if (contentStr.trim().length > 0) {
              // Valid ref file exists at this path
              return refPath
            }
          }
        } catch {
          // Error reading file, continue to next path
        }
      }
    } catch {
      // File doesn't exist, continue to next path
    }
    // Also check packed refs
    if (packedMap.has(refPath)) return refPath
  }
  
  // Do we give up?
  throw new NotFoundError(ref)
}

