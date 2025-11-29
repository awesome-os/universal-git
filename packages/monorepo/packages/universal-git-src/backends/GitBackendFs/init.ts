import { join } from "../../core-utils/GitPath.ts"
import { UniversalBuffer } from "../../utils/UniversalBuffer.ts"
import type { GitBackendFs } from './GitBackendFs.ts'

/**
 * Initialization operations for GitBackendFs
 */

export async function initialize(this: GitBackendFs): Promise<void> {
  const dirs = [
    'hooks',
    'info',
    'objects/info',
    'objects/pack',
    'refs/heads',
    'refs/tags',
    'refs/remotes',
    'refs/notes',
    'refs/replace',
    'logs/refs/heads',
    'logs/refs/remotes',
  ]
  for (const dir of dirs) {
    const path = join(this.getGitdir(), dir)
    if (!(await this.getFs().exists(path))) {
      await this.getFs().mkdir(path)
    }
  }
}

export async function isInitialized(this: GitBackendFs): Promise<boolean> {
  const configPath = join(this.getGitdir(), 'config')
  return this.getFs().exists(configPath)
}

export async function init(this: GitBackendFs, options: {
  defaultBranch?: string
  objectFormat?: 'sha1' | 'sha256'
} = {}): Promise<void> {
  const { ConfigAccess } = await import('../../utils/configAccess.ts')
  
  // Check if already initialized
  if (await this.isInitialized()) {
    // If already initialized, check if objectFormat is explicitly set in config
    // If it is, don't allow changing it
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
          // objectFormat is already explicitly set, don't modify it
          return
        }
      }
    }
    // Config exists but objectFormat not explicitly set (defaults to sha1)
    // Still return early to prevent overwriting existing config
    return
  }

  // Initialize backend structure (create directories)
  await this.initialize()

  // Use ConfigAccess to set initial config values
  const configAccess = new ConfigAccess(this.getFs(), this.getGitdir())
  
  const defaultBranch = options.defaultBranch || 'master'
  const objectFormat = options.objectFormat || 'sha1'
  
  // Set repository format version and object format
  if (objectFormat === 'sha256') {
    // SHA-256 requires repository format version 1 (for extensions)
    await configAccess.setConfigValue('core.repositoryformatversion', '1', 'local')
    await configAccess.setConfigValue('extensions.objectformat', 'sha256', 'local')
  } else {
    // SHA-1 uses repository format version 0
    await configAccess.setConfigValue('core.repositoryformatversion', '0', 'local')
  }
  
  // init() always creates a bare repository
  await configAccess.setConfigValue('core.filemode', 'false', 'local')
  await configAccess.setConfigValue('core.bare', 'true', 'local')
  await configAccess.setConfigValue('core.symlinks', 'false', 'local')
  await configAccess.setConfigValue('core.ignorecase', 'true', 'local')

  // Set HEAD to default branch
  await this.writeHEAD(`ref: refs/heads/${defaultBranch}`)
}

export async function existsFile(this: GitBackendFs, path: string): Promise<boolean> {
  const filePath = join(this.getGitdir(), path)
  return this.getFs().exists(filePath)
}

export async function readShallow(this: GitBackendFs): Promise<string | null> {
  const path = join(this.getGitdir(), 'shallow')
  try {
    const data = await this.getFs().read(path)
    return UniversalBuffer.isBuffer(data) ? data.toString('utf8') : (data as string)
  } catch {
    return null
  }
}

export async function writeShallow(this: GitBackendFs, data: string): Promise<void> {
  const path = join(this.getGitdir(), 'shallow')
  await this.getFs().write(path, UniversalBuffer.from(data, 'utf8'))
}

export async function deleteShallow(this: GitBackendFs): Promise<void> {
  const path = join(this.getGitdir(), 'shallow')
  try {
    await this.getFs().rm(path)
  } catch {
    // Ignore if file doesn't exist
  }
}

export async function readGitDaemonExportOk(this: GitBackendFs): Promise<boolean> {
  const path = join(this.getGitdir(), 'git-daemon-export-ok')
  return this.getFs().exists(path)
}

export async function writeGitDaemonExportOk(this: GitBackendFs): Promise<void> {
  const path = join(this.getGitdir(), 'git-daemon-export-ok')
  await this.getFs().write(path, UniversalBuffer.alloc(0))
}

export async function deleteGitDaemonExportOk(this: GitBackendFs): Promise<void> {
  const path = join(this.getGitdir(), 'git-daemon-export-ok')
  try {
    await this.getFs().rm(path)
  } catch {
    // Ignore if file doesn't exist
  }
}

export async function close(this: GitBackendFs): Promise<void> {
  // No cleanup needed for filesystem backend
}

