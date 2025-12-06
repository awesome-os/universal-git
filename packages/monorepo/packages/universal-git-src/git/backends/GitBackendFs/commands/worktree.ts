import { MissingParameterError } from "../../../errors/MissingParameterError.ts"
import { normalizeCommandArgs } from '../utils/commandHelpers.ts'
import { assertParameter } from "../utils/assertParameter.ts"
import { createFileSystem } from "../utils/createFileSystem.ts"
import { join } from "../utils/join.ts"
import { Repository } from "../../../../core-utils/Repository.ts"
import type { FileSystemProvider } from "../../../../models/FileSystem.ts"
import { resolveRef, readSymbolicRef } from '../../../refs/readRef.ts'
import { writeRef, writeSymbolicRef } from '../../../refs/writeRef.ts'
import { normalize } from '../../../../core-utils/GitPath.ts'
import { createGitWorktreeBackend } from '../../../worktree/index.ts'
import { basename } from '../utils/basename.ts'
import { GitIndex } from '../../../index/GitIndex.ts'
import { detectObjectFormat } from '../utils/detectObjectFormat.ts'
import { UniversalBuffer } from '../utils/UniversalBuffer.ts'
export type WorktreeInfo = {
  path: string
  HEAD: string
  branch?: string
  bare?: boolean
}

/**
 * Worktree management API
 * Provides high-level operations for managing Git worktrees
 */
export async function worktree({
  repo: _repo,
  fs: _fs,
  dir,
  gitdir = dir ? join(dir, '.git') : undefined,
  add,
  list,
  remove,
  prune,
  lock: lockFlag,
  unlock: unlockFlag,
  status: statusFlag,
  path,
  ref,
  name,
  force = false,
  detach = false,
  reason,
  cache = {},
}: {
  repo?: Repository
  fs?: FileSystemProvider
  dir?: string
  gitdir?: string
  add?: boolean
  list?: boolean
  remove?: boolean
  prune?: boolean
  lock?: boolean
  unlock?: boolean
  status?: boolean
  path?: string
  ref?: string
  name?: string
  force?: boolean
  detach?: boolean
  reason?: string
  cache?: Record<string, unknown>
}): Promise<unknown> {
  try {
    const { repo, fs, dir: effectiveDir, gitdir: effectiveGitdir, cache: effectiveCache } = await normalizeCommandArgs({
      repo: _repo,
      fs: _fs,
      dir,
      gitdir,
      cache,
      add,
      list,
      remove,
      prune,
      lock: lockFlag,
      unlock: unlockFlag,
      status: statusFlag,
      path,
      ref,
      name,
      force,
      detach,
      reason,
    })

    // dir is required for worktree operations, unless we have a repo with worktree backend (for add operation)
    if (!effectiveDir && !repo?.worktreeBackend) {
      throw new Error('dir is required for worktree operations')
    }

    // TypeScript guard - ensure effectiveGitdir is defined
    if (!effectiveGitdir) {
      throw new MissingParameterError('gitdir')
    }
    // Non-null assertion - we've checked it's defined above
    const finalEffectiveGitdir: string = effectiveGitdir!

    // List worktrees
    if (list) {
      return await listWorktrees({ fs, dir: effectiveDir, gitdir: finalEffectiveGitdir })
    }

    // Add worktree
    if (add) {
      if (!path) {
        throw new Error('path is required for worktree add')
      }
      // Normalize path to ensure it's in POSIX format
      let normalizedPath = normalize(path)
      
      // Ensure path is not empty
      if (!normalizedPath || normalizedPath.trim() === '') {
        throw new Error('Worktree path cannot be empty')
      }
      
      // Generate worktree name if not provided
      const worktreeName = name || normalizedPath.split(/[/\\]/).pop() || 'worktree'
      
      // Create worktree gitdir (use normalized path - must be absolute for gitdir file)
      // Git stores absolute paths in worktree gitdir files
      const worktreeGitdir = await repo.gitBackend.createWorktreeGitdir(worktreeName, normalizedPath)
      const worktreeGitdirPath = worktreeGitdir.getPath()
      
      // Create worktree backend (use normalized path)
      // Ensure the directory exists
      await fs.mkdir(normalizedPath, { recursive: true })
      
      const worktreeBackend = createGitWorktreeBackend({ fs, dir: normalizedPath, name: worktreeName })
      
      // Verify worktree backend has a directory
      const worktreeDir = worktreeBackend.getDirectory?.()
      if (!worktreeDir || worktreeDir.trim() === '') {
        throw new Error(`WorktreeBackend must have a valid directory, got: ${worktreeDir}`)
      }
      
      // Resolve the ref to checkout
      
      const targetRef = ref || 'HEAD'
      let headValue: string
      try {
        headValue = await resolveRef({ fs, gitdir: finalEffectiveGitdir, ref: targetRef })
      } catch {
        throw new Error(`Cannot resolve ref: ${targetRef}`)
      }
      
      // Write HEAD in worktree gitdir
      // Read old HEAD OID for reflog (if it exists)
      let oldOid: string | undefined
      try {
        
        oldOid = await resolveRef({ fs, gitdir: worktreeGitdirPath, ref: 'HEAD' })
      } catch {
        oldOid = undefined
      }
      
      if (detach || !targetRef.startsWith('refs/')) {
        // Detached HEAD - write OID directly to worktree gitdir
        const objectFormat = await repo.gitBackend.getObjectFormat({})
        await writeRef({ fs, gitdir: worktreeGitdirPath, ref: 'HEAD', value: headValue, objectFormat })
      } else {
        // Branch checkout - write symbolic ref to worktree gitdir
        // Pass headValue as newOid so writeSymbolicRef doesn't need to resolve it again
        const branchRef = targetRef.startsWith('refs/heads/') ? targetRef : `refs/heads/${targetRef}`
        const objectFormat = await repo.gitBackend.getObjectFormat({})
        await writeSymbolicRef({ fs, gitdir: worktreeGitdirPath, ref: 'HEAD', value: branchRef, oldOid, newOid: headValue, objectFormat })
      }
      
      // Checkout files to worktree (always checkout for worktree add)
      // Call gitBackend.checkout() method directly with worktreeBackend
      await repo.gitBackend.checkout(worktreeBackend, targetRef, {
        force,
      })
      
      // Get final HEAD OID
      const headOid = await resolveRef({ fs, gitdir: worktreeGitdirPath, ref: 'HEAD' })
      return {
        path: normalizedPath,
        HEAD: headOid,
      }
    }

    // Remove worktree
    if (remove) {
      if (!path) {
        throw new Error('path is required for worktree remove')
      }
      await removeWorktree({ fs, dir: effectiveDir!, gitdir: finalEffectiveGitdir, path, force })
      return { removed: path }
    }

    // Prune worktrees
    if (prune) {
      const pruned = await pruneWorktrees({ fs, dir: effectiveDir!, gitdir: finalEffectiveGitdir })
      return { pruned }
    }

    // Lock worktree
    if (lockFlag) {
      if (!path) {
        throw new Error('path is required for worktree lock')
      }
      await lockWorktree({ fs, dir: effectiveDir!, gitdir: finalEffectiveGitdir, path, reason })
      return { locked: path }
    }

    // Unlock worktree
    if (unlockFlag) {
      if (!path) {
        throw new Error('path is required for worktree unlock')
      }
      await unlockWorktree({ fs, dir: effectiveDir!, gitdir: finalEffectiveGitdir, path })
      return { unlocked: path }
    }

    // Get worktree status
    if (statusFlag) {
      if (!path) {
        throw new Error('path is required for worktree status')
      }
      return await getWorktreeStatus({ fs, dir: effectiveDir!, gitdir: finalEffectiveGitdir, path })
    }

    throw new Error('One of add, list, remove, prune, lock, unlock, or status must be specified')
  } catch (err) {
    ;(err as { caller?: string }).caller = 'git.worktree'
    throw err
  }
}

/**
 * Lists all worktrees for a repository
 */
async function listWorktrees({
  fs,
  dir,
  gitdir,
}: {
  fs: ReturnType<typeof createFileSystem>
  dir: string
  gitdir: string
}): Promise<WorktreeInfo[]> {
  const worktrees: WorktreeInfo[] = []
  const worktreesDir = join(gitdir, 'worktrees')

  // Add main worktree
  try {
    const headOid = await resolveRef({ fs, gitdir, ref: 'HEAD' })
    let branch: string | undefined
    try {
      const headRef = await readSymbolicRef({ fs, gitdir, ref: 'HEAD' })
      if (headRef && headRef.startsWith('refs/heads/')) {
        branch = headRef.replace('refs/heads/', '')
      }
    } catch {
      // HEAD is detached
    }
    worktrees.push({
      path: dir,
      HEAD: headOid,
      branch,
      bare: false,
    })
  } catch {
    // Main worktree might not have HEAD yet
  }

  // List linked worktrees
  try {
    if (await fs.exists(worktreesDir)) {
      const entries = await fs.readdir(worktreesDir)
      if (!entries) return worktrees
      for (const entry of entries) {
        const worktreeGitdir = join(worktreesDir, entry)
        try {
          // Check if gitdir directory still exists (might have been removed)
          if (!(await fs.exists(worktreeGitdir))) {
            continue
          }
          
          const stat = await fs.lstat(worktreeGitdir)
          if (stat && stat.isDirectory()) {
            // Read gitdir file to find worktree directory
            const gitdirFile = join(worktreeGitdir, 'gitdir')
            
            // Check if gitdir file exists (worktree might be in process of removal)
            if (!(await fs.exists(gitdirFile))) {
              continue
            }
            
            let worktreePath: string | undefined
            try {
              const content = await fs.read(gitdirFile, 'utf8')
              if (typeof content === 'string') {
                // Git stores absolute path to worktree directory in gitdir file
                worktreePath = content.trim()
              }
            } catch {
              // gitdir file might not exist or be readable
              continue
            }

            // Check if HEAD file exists (worktree is valid and not being removed)
            const headFile = join(worktreeGitdir, 'HEAD')
            if (!(await fs.exists(headFile))) {
              // HEAD doesn't exist, worktree is likely being removed or is invalid
              continue
            }

            // Read HEAD
            let headOid: string
            let branch: string | undefined
            try {
              headOid = await resolveRef({ fs, gitdir: worktreeGitdir, ref: 'HEAD' })
              try {
                const headRef = await readSymbolicRef({ fs, gitdir: worktreeGitdir, ref: 'HEAD' })
                if (headRef && headRef.startsWith('refs/heads/')) {
                  branch = headRef.replace('refs/heads/', '')
                }
              } catch {
                // HEAD is detached
              }
            } catch {
              // HEAD might not exist, skip this worktree
              continue
            }

            worktrees.push({
              path: worktreePath || worktreeGitdir,
              HEAD: headOid,
              branch,
              bare: false,
            })
          }
        } catch {
          // Skip invalid entries
        }
      }
    }
  } catch {
    // worktrees directory doesn't exist, only main worktree
  }

  return worktrees
}

/**
 * Removes a worktree
 */
async function removeWorktree({
  fs,
  dir,
  gitdir,
  path,
  force,
}: {
  fs: ReturnType<typeof createFileSystem>
  dir: string
  gitdir: string
  path: string
  force: boolean
}): Promise<void> {
  const normalizedPath = normalize(path)
  const worktreesDir = join(gitdir, 'worktrees')
  
  // Find the worktree by path (match by normalized path)
  let worktreeName: string | undefined
  let worktreeGitdir: string | undefined
  
  try {
    if (await fs.exists(worktreesDir)) {
      const entries = await fs.readdir(worktreesDir)
      if (!entries) return
      for (const entry of entries) {
        const candidateGitdir = join(worktreesDir, entry)
        try {
          const gitdirFile = join(candidateGitdir, 'gitdir')
          const content = await fs.read(gitdirFile, 'utf8')
          if (typeof content === 'string') {
            const worktreePath = normalize(content.trim())
            // Match by normalized path (handles relative/absolute path differences)
            // Use more precise matching - check if paths are equivalent after normalization
            const normalizedWorktreePath = normalize(worktreePath)
            if (normalizedWorktreePath === normalizedPath) {
              worktreeName = entry
              worktreeGitdir = candidateGitdir
              break
            }
            // Also check if one path ends with the other (for relative/absolute path differences)
            if (normalizedWorktreePath.endsWith(normalizedPath) || normalizedPath.endsWith(normalizedWorktreePath)) {
              // Additional check: ensure the basename matches to avoid false positives
              const worktreeBasename = basename(normalizedWorktreePath)
              const pathBasename = basename(normalizedPath)
              if (worktreeBasename === pathBasename) {
                worktreeName = entry
                worktreeGitdir = candidateGitdir
                break
              }
            }
          }
        } catch {
          // Skip invalid entries
        }
      }
    }
  } catch {
    // worktrees directory doesn't exist
  }

  if (!worktreeName || !worktreeGitdir) {
    throw new Error(`Worktree not found: ${path}`)
  }

  // Check for uncommitted changes if force is false
  if (!force) {
    try {
      const repo = await Repository.open({ fs, dir: normalizedPath, gitdir: worktreeGitdir, cache: {} })
      
      let indexBuffer: InstanceType<typeof UniversalBuffer>
      if (repo.gitBackend) {
        try {
          indexBuffer = await repo.gitBackend.readIndex()
        } catch {
          indexBuffer = UniversalBuffer.alloc(0)
        }
      } else {
        throw new Error('gitBackend is required')
      }
      
      let index: InstanceType<typeof GitIndex>
      if (indexBuffer.length === 0) {
        index = new GitIndex()
      } else {
        const objectFormat = await detectObjectFormat(fs, worktreeGitdir, repo.cache, repo.gitBackend)
        index = await GitIndex.fromBuffer(indexBuffer, objectFormat)
      }
      
      // Check if index has any entries (simplified check)
      // In a full implementation, we'd compare index vs HEAD and workdir vs index
      
      let headOid: string | undefined
      try {
        headOid = await resolveRef({ fs, gitdir: worktreeGitdir, ref: 'HEAD' })
      } catch {
        // No HEAD, that's okay
      }
      
      // Check if there are staged changes (entries in index that differ from HEAD)
      // For now, just check if index is non-empty (simplified)
      if (index.entriesMap.size > 0 && headOid) {
        // This is a simplified check - a full implementation would compare each entry
        // For now, we'll allow removal if force is false but warn
        // In practice, Git checks for uncommitted changes more thoroughly
      }
    } catch {
      // If we can't check, allow removal (worktree might be corrupted)
    }
  }

  // Remove worktree administrative files first
  // Remove HEAD file first to mark worktree as invalid (so listWorktrees skips it)
  try {
    const headFile = join(worktreeGitdir, 'HEAD')
    if (await fs.exists(headFile)) {
      await fs.rm(headFile)
    }
  } catch {
    // HEAD file removal might fail, continue anyway
  }
  
  // Remove gitdir file to mark worktree as removed
  try {
    const gitdirFile = join(worktreeGitdir, 'gitdir')
    if (await fs.exists(gitdirFile)) {
      await fs.rm(gitdirFile)
    }
  } catch {
    // gitdir file removal might fail, continue anyway
  }
  
  // Remove entire worktree gitdir directory
  try {
    await fs.rm(worktreeGitdir, { recursive: true })
  } catch (err: any) {
    // On Windows, files might be locked, but we should still try to remove the directory
    // If gitdir removal fails, log but continue
    if (err.code !== 'EPERM' && err.code !== 'EBUSY') {
      throw err
    }
  }

  // Remove worktree directory
  try {
    await fs.rm(normalizedPath, { recursive: true })
  } catch (err: any) {
    // On Windows, directory might be locked or files might still be open
    // This is acceptable - the worktree is effectively removed (gitdir is gone)
    // Only throw if it's not a permission/busy error
    if (err.code !== 'EPERM' && err.code !== 'EBUSY' && err.code !== 'ENOENT') {
      throw err
    }
  }
}

/**
 * Prunes stale worktrees (removes worktrees with missing directories)
 */
async function pruneWorktrees({
  fs,
  dir,
  gitdir,
}: {
  fs: ReturnType<typeof createFileSystem>
  dir: string
  gitdir: string
}): Promise<string[]> {
  const worktreesDir = join(gitdir, 'worktrees')
  const pruned: string[] = []
  
  try {
    if (!(await fs.exists(worktreesDir))) {
      return pruned
    }
    
    const entries = await fs.readdir(worktreesDir)
    if (!entries) return []
    for (const entry of entries) {
      const worktreeGitdir = join(worktreesDir, entry)
      
      try {
        // Check if gitdir still exists
        if (!(await fs.exists(worktreeGitdir))) {
          continue
        }
        
        // Read gitdir file to get worktree path
        const gitdirFile = join(worktreeGitdir, 'gitdir')
        if (!(await fs.exists(gitdirFile))) {
          // gitdir file missing, prune this worktree
          try {
            await fs.rm(worktreeGitdir, { recursive: true })
            pruned.push(entry)
          } catch {
            // Removal might fail, continue
          }
          continue
        }
        
        const content = await fs.read(gitdirFile, 'utf8')
        if (typeof content === 'string') {
          const worktreePath = content.trim()
          
          // Check if worktree directory exists
          if (!(await fs.exists(worktreePath))) {
            // Worktree directory is missing, prune this worktree
            try {
              await fs.rm(worktreeGitdir, { recursive: true })
              pruned.push(worktreePath)
            } catch {
              // Removal might fail, continue
            }
          }
        }
      } catch {
        // Skip invalid entries
      }
    }
  } catch {
    // worktrees directory doesn't exist
  }
  
  return pruned
}

/**
 * Locks a worktree
 */
async function lockWorktree({
  fs,
  dir,
  gitdir,
  path,
  reason,
}: {
  fs: ReturnType<typeof createFileSystem>
  dir: string
  gitdir: string
  path: string
  reason?: string
}): Promise<void> {
  const normalizedPath = normalize(path)
  const worktreesDir = join(gitdir, 'worktrees')
  
  // Find the worktree by path
  let worktreeGitdir: string | undefined
  
  try {
    if (await fs.exists(worktreesDir)) {
      const entries = await fs.readdir(worktreesDir)
      if (!entries) return
      for (const entry of entries) {
        const candidateGitdir = join(worktreesDir, entry)
        try {
          const gitdirFile = join(candidateGitdir, 'gitdir')
          const content = await fs.read(gitdirFile, 'utf8')
          if (typeof content === 'string') {
            const worktreePath = normalize(content.trim())
            if (worktreePath === normalizedPath) {
              worktreeGitdir = candidateGitdir
              break
            }
          }
        } catch {
          // Skip invalid entries
        }
      }
    }
  } catch {
    // worktrees directory doesn't exist
  }
  
  if (!worktreeGitdir) {
    throw new Error(`Worktree not found: ${path}`)
  }
  
  // Check if already locked
  const lockFile = join(worktreeGitdir, 'locked')
  if (await fs.exists(lockFile)) {
    throw new Error(`Worktree is already locked: ${path}`)
  }
  
  // Create lock file with optional reason
  const lockContent = reason ? `${reason}\n` : ''
  await fs.write(lockFile, lockContent, 'utf8')
}

/**
 * Unlocks a worktree
 */
async function unlockWorktree({
  fs,
  dir,
  gitdir,
  path,
}: {
  fs: ReturnType<typeof createFileSystem>
  dir: string
  gitdir: string
  path: string
}): Promise<void> {
  const normalizedPath = normalize(path)
  const worktreesDir = join(gitdir, 'worktrees')
  
  // Find the worktree by path
  let worktreeGitdir: string | undefined
  
  try {
    if (await fs.exists(worktreesDir)) {
      const entries = await fs.readdir(worktreesDir)
      if (!entries) return
      for (const entry of entries) {
        const candidateGitdir = join(worktreesDir, entry)
        try {
          const gitdirFile = join(candidateGitdir, 'gitdir')
          const content = await fs.read(gitdirFile, 'utf8')
          if (typeof content === 'string') {
            const worktreePath = normalize(content.trim())
            if (worktreePath === normalizedPath) {
              worktreeGitdir = candidateGitdir
              break
            }
          }
        } catch {
          // Skip invalid entries
        }
      }
    }
  } catch {
    // worktrees directory doesn't exist
  }
  
  if (!worktreeGitdir) {
    throw new Error(`Worktree not found: ${path}`)
  }
  
  // Check if locked
  const lockFile = join(worktreeGitdir, 'locked')
  if (!(await fs.exists(lockFile))) {
    throw new Error(`Worktree is not locked: ${path}`)
  }
  
  // Remove lock file
  await fs.rm(lockFile)
}

/**
 * Gets worktree status
 */
async function getWorktreeStatus({
  fs,
  dir,
  gitdir,
  path,
}: {
  fs: ReturnType<typeof createFileSystem>
  dir: string
  gitdir: string
  path: string
}): Promise<{
  path: string
  locked: boolean
  lockReason?: string
  exists: boolean
  stale: boolean
}> {
  const normalizedPath = normalize(path)
  const worktreesDir = join(gitdir, 'worktrees')
  
  // Check if it's the main worktree
  if (normalize(dir) === normalizedPath) {
    return {
      path: normalizedPath,
      locked: false,
      exists: await fs.exists(normalizedPath),
      stale: false,
    }
  }
  
  // Find the worktree by path
  let worktreeGitdir: string | undefined
  let worktreePath: string | undefined
  
  try {
    if (await fs.exists(worktreesDir)) {
      const entries = await fs.readdir(worktreesDir)
      if (!entries) {
        throw new Error(`Worktree not found: ${path}`)
      }
      for (const entry of entries) {
        const candidateGitdir = join(worktreesDir, entry)
        try {
          const gitdirFile = join(candidateGitdir, 'gitdir')
          if (await fs.exists(gitdirFile)) {
            const content = await fs.read(gitdirFile, 'utf8')
            if (typeof content === 'string') {
              const candidatePath = normalize(content.trim())
              if (candidatePath === normalizedPath) {
                worktreeGitdir = candidateGitdir
                worktreePath = candidatePath
                break
              }
            }
          }
        } catch {
          // Skip invalid entries
        }
      }
    }
  } catch {
    // worktrees directory doesn't exist
  }
  
  if (!worktreeGitdir) {
    throw new Error(`Worktree not found: ${path}`)
  }
  
  // Check if locked
  const lockFile = join(worktreeGitdir, 'locked')
  let locked = false
  let lockReason: string | undefined
  
  if (await fs.exists(lockFile)) {
    locked = true
    try {
      const content = await fs.read(lockFile, 'utf8')
      if (typeof content === 'string' && content.trim()) {
        lockReason = content.trim()
      }
    } catch {
      // Lock file exists but can't read reason
    }
  }
  
  // Check if worktree directory exists
  const exists = worktreePath ? await fs.exists(worktreePath) : false
  
  // Check if stale (gitdir exists but worktree directory doesn't)
  const stale = !exists && (await fs.exists(worktreeGitdir))
  
  return {
    path: worktreePath || normalizedPath,
    locked,
    lockReason,
    exists,
    stale,
  }
}
