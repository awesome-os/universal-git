import { join } from "../../core-utils/GitPath.ts"
import { UniversalBuffer } from "../../utils/UniversalBuffer.ts"
import type { GitBackendFs } from './GitBackendFs.ts'

/**
 * LFS (Large File Storage) operations for GitBackendFs
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

export async function readLFSFile(this: GitBackendFs, path: string): Promise<UniversalBuffer | null> {
  const fullPath = join(this.getGitdir(), 'lfs', path)
  try {
    const data = await this.getFs().read(fullPath)
    if (data === null || data === undefined) {
      return null
    }
    const buffer = UniversalBuffer.from(data as string | Uint8Array)
    return buffer.length === 0 ? null : buffer
  } catch {
    return null
  }
}

export async function writeLFSFile(this: GitBackendFs, path: string, data: UniversalBuffer): Promise<void> {
  const lfsDir = join(this.getGitdir(), 'lfs')
  const fileDir = join(lfsDir, path.substring(0, path.lastIndexOf('/')))
  if (fileDir !== lfsDir && !(await this.getFs().exists(fileDir))) {
    await this.getFs().mkdir(fileDir)
  }
  const fullPath = join(lfsDir, path)
  await this.getFs().write(fullPath, data)
}

export async function listLFSFiles(this: GitBackendFs, prefix?: string): Promise<string[]> {
  const lfsDir = join(this.getGitdir(), 'lfs')
  const files: string[] = []
  try {
    await listFilesRecursive(this.getFs(), lfsDir, prefix || '', files)
  } catch {
    // Ignore errors
  }
  return files
}

