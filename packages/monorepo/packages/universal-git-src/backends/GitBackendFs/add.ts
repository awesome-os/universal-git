import { join, normalize } from "../../core-utils/GitPath.ts"
import { UniversalBuffer } from "../../utils/UniversalBuffer.ts"
import type { GitBackendFs } from './GitBackendFs.ts'

/**
 * Add operation for GitBackendFs
 */

export async function add(
  this: GitBackendFs,
  worktreeBackend: import('../../git/worktree/GitWorktreeBackend.ts').GitWorktreeBackend,
  filepaths: string | string[],
  options?: { force?: boolean; update?: boolean; parallel?: boolean }
): Promise<void> {
  const { MissingParameterError } = await import('../../errors/MissingParameterError.ts')
  const { UnmergedPathsError } = await import('../../errors/UnmergedPathsError.ts')
  const { GitIndex } = await import('../../git/index/GitIndex.ts')
  const { writeObject } = await import('../../git/objects/writeObject.ts')
  const { basename } = await import('../../utils/basename.ts')
  
  if (filepaths == null || (Array.isArray(filepaths) && filepaths.length === 0)) {
    throw new MissingParameterError('filepath')
  }

  // Read index directly using backend
  let indexBuffer: UniversalBuffer
  try {
    indexBuffer = await this.readIndex()
  } catch {
    // Index doesn't exist - create empty index
    indexBuffer = UniversalBuffer.alloc(0)
  }

  // Parse index
  let index: InstanceType<typeof GitIndex>
  const objectFormat = await this.getObjectFormat({})
  if (indexBuffer.length === 0) {
    index = new GitIndex(null, undefined, 2)
  } else {
    index = await GitIndex.fromBuffer(indexBuffer, objectFormat)
  }

  // Check for unmerged paths
  if (index.unmergedPaths.length > 0) {
    throw new UnmergedPathsError(index.unmergedPaths)
  }

  // Normalize filepaths to array
  const filepathArray = Array.isArray(filepaths) ? filepaths : [filepaths]
  
  // Recursively find all files matching the filepath patterns
  const filesToAdd: string[] = []
  const requestedFiles = new Set<string>(filepathArray)
  
  const collectFiles = async (basePath: string): Promise<void> => {
    try {
      const entries = await worktreeBackend.readdir(basePath || '.')
      if (!entries) return

      for (const entry of entries) {
        // Skip .git directories
        if (basename(entry) === '.git') continue
        
        const fullPath = normalize(basePath ? join(basePath, entry) : entry)
        
        // Check if this path matches any of the filepath patterns
        const matches = filepathArray.some(pattern => {
          if (pattern === '.') return true
          if (fullPath === pattern) return true
          if (fullPath.startsWith(pattern + '/')) return true
          return false
        })

        if (!matches) continue

        const stat = await worktreeBackend.lstat(fullPath)
        if (!stat) continue

        if (stat.isDirectory()) {
          // Recursively collect files from directory
          await collectFiles(fullPath)
        } else {
          // Add file to list
          filesToAdd.push(fullPath)
          // Mark this file as found if it was explicitly requested
          requestedFiles.delete(fullPath)
        }
      }
    } catch {
      // Ignore errors (e.g., permission denied)
    }
  }

  // Collect files for each pattern
  for (const filepath of filepathArray) {
    const stat = await worktreeBackend.lstat(filepath).catch(() => null)
    if (stat && stat.isDirectory()) {
      await collectFiles(filepath)
      // Directory was found, remove from requested files
      requestedFiles.delete(filepath)
    } else if (stat) {
      // Single file - normalize path
      const normalizedFilepath = normalize(filepath)
      filesToAdd.push(normalizedFilepath)
      // Mark this file as found
      requestedFiles.delete(filepath)
      requestedFiles.delete(normalizedFilepath)
    }
    // If stat is null, the file doesn't exist - leave it in requestedFiles
  }

  // Check for missing files - if any explicitly requested files weren't found, throw error
  if (requestedFiles.size > 0) {
    const missingFiles = Array.from(requestedFiles)
    if (missingFiles.length === 1) {
      const { NotFoundError } = await import('../../errors/NotFoundError.ts')
      const err = new NotFoundError(`file at "${missingFiles[0]}" on disk and "remove" not set`)
      err.caller = 'git.add'
      throw err
    } else {
      // Multiple missing files - throw MultipleGitError
      const { MultipleGitError } = await import('../../errors/MultipleGitError.ts')
      const { NotFoundError } = await import('../../errors/NotFoundError.ts')
      const errors = missingFiles.map(file => 
        new NotFoundError(`file at "${file}" on disk and "remove" not set`)
      )
      const err = new MultipleGitError(errors)
      err.caller = 'git.add'
      throw err
    }
  }

  // Remove duplicates and normalize paths to forward slashes (Git convention)
  const uniqueFiles = Array.from(new Set(filesToAdd.map(normalize)))

  // Get autocrlf config for CRLF handling
  let autocrlf: string | undefined
  try {
    autocrlf = (await this.getConfig('core.autocrlf')) as string | undefined
  } catch {
    // Config not available, use default
  }

  // Process files - check ignore rules and add to index
  const processFile = async (filepath: string) => {
    // Normalize filepath to forward slashes (Git convention)
    const normalizedPath = normalize(filepath)

    // Check ignore rules using worktreeBackend
    if (!options?.force) {
      // Check if file is ignored by reading .gitignore files via worktreeBackend
      // Check .gitignore in root and parent directories
      const pathParts = normalizedPath.split('/').filter(p => p)
      let isIgnored = false
      
      // Check root .gitignore
      try {
        const rootGitignore = await worktreeBackend.read('.gitignore')
        if (rootGitignore) {
          const { isIgnored: checkIgnored } = await import('../../core-utils/filesystem/IgnoreManager.ts')
          const gitignoreContent = typeof rootGitignore === 'string' 
            ? rootGitignore 
            : new TextDecoder().decode(UniversalBuffer.isBuffer(rootGitignore) ? rootGitignore : UniversalBuffer.from(rootGitignore))
          const rules = gitignoreContent.split('\n').filter(line => line.trim().length > 0)
          if (checkIgnored({ filepath: normalizedPath, rules })) {
            isIgnored = true
          }
        }
      } catch {
        // .gitignore doesn't exist, continue
      }
      
      // Check parent directory .gitignore files
      for (let i = 1; i < pathParts.length && !isIgnored; i++) {
        const parentPath = pathParts.slice(0, i).join('/')
        const relativePath = pathParts.slice(i).join('/')
        try {
          const parentGitignore = await worktreeBackend.read(join(parentPath, '.gitignore'))
          if (parentGitignore) {
            const { isIgnored: checkIgnored } = await import('../../core-utils/filesystem/IgnoreManager.ts')
            const gitignoreContent = typeof parentGitignore === 'string' 
              ? parentGitignore 
              : new TextDecoder().decode(UniversalBuffer.isBuffer(parentGitignore) ? parentGitignore : UniversalBuffer.from(parentGitignore))
            const rules = gitignoreContent.split('\n').filter(line => line.trim().length > 0)
            if (checkIgnored({ filepath: relativePath, rules })) {
              isIgnored = true
            }
          }
        } catch {
          // .gitignore doesn't exist in this directory, continue
        }
      }
      
      if (isIgnored) {
        return // Skip ignored files
      }
    }

    // Read file stats from worktreeBackend
    const stat = await worktreeBackend.lstat(normalizedPath)
    if (!stat) {
      const { NotFoundError } = await import('../../errors/NotFoundError.ts')
      const err = new NotFoundError(`file at "${normalizedPath}" on disk and "remove" not set`)
      err.caller = 'git.add'
      throw err
    }

    if (stat.isDirectory()) {
      return // Skip directories (they're handled by collectFiles)
    }

    // Read file content from worktreeBackend
    let content: Uint8Array | string | null = null
    if (stat.isSymbolicLink()) {
      content = await worktreeBackend.readlink(normalizedPath)
      // For symlinks, normalize the target path to forward slashes (Git convention)
      if (typeof content === 'string') {
        let normalizedTarget = normalize(content)
        if (normalizedTarget.startsWith('./')) {
          normalizedTarget = normalizedTarget.substring(2)
        }
        content = normalizedTarget
      } else if (content instanceof Uint8Array || UniversalBuffer.isBuffer(content)) {
        const targetStr = new TextDecoder().decode(UniversalBuffer.isBuffer(content) ? content : UniversalBuffer.from(content))
        let normalizedTarget = normalize(targetStr)
        if (normalizedTarget.startsWith('./')) {
          normalizedTarget = normalizedTarget.substring(2)
        }
        content = normalizedTarget
      }
    } else {
      content = await worktreeBackend.read(normalizedPath)
    }

    if (content === null || content === undefined) {
      return // Skip empty files
    }

    // Convert to UniversalBuffer
    let objectBuffer: UniversalBuffer
    if (typeof content === 'string') {
      objectBuffer = UniversalBuffer.from(content, 'utf8')
    } else if (UniversalBuffer.isBuffer(content)) {
      objectBuffer = content
    } else {
      objectBuffer = UniversalBuffer.from(content)
    }

    // Handle CRLF conversion based on autocrlf config
    if ((autocrlf === 'true' || autocrlf === 'input') && !stat.isSymbolicLink()) {
      // Check if file is binary before applying CRLF conversion
      const { isBinary } = await import('../../utils/isBinary.ts')
      const isBinaryFile = isBinary(objectBuffer)
      
      if (!isBinaryFile) {
        // Normalize line endings to LF for storage (only for text files)
        const { normalizeToLF } = await import('../../core-utils/filesystem/LineEndingFilter.ts')
        objectBuffer = normalizeToLF(objectBuffer)
      }
    }

    // Write blob to object database
    const oid = await writeObject({
      fs: this.getFs(),
      gitdir: this.getGitdir(),
      type: 'blob',
      format: 'content',
      object: objectBuffer,
    })

    // Update index with the file (use normalized path)
    const { normalizeStats } = await import('../../utils/normalizeStats.ts')
    const normalizedStats = normalizeStats(stat)

    index.insert({
      filepath: normalizedPath,
      oid,
      stats: normalizedStats,
    })
  }

  // Process files in parallel or sequentially
  if (options?.parallel !== false) {
    await Promise.all(uniqueFiles.map(processFile))
  } else {
    for (const filepath of uniqueFiles) {
      await processFile(filepath)
    }
  }

  // Write index back using backend
  const updatedIndexBuffer = await index.toBuffer(objectFormat)
  await this.writeIndex(updatedIndexBuffer)
}

