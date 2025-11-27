import { MissingNameError } from "../errors/MissingNameError.ts"
import { MissingParameterError } from "../errors/MissingParameterError.ts"
import { NoCommitError } from "../errors/NoCommitError.ts"
import { UnmergedPathsError } from "../errors/UnmergedPathsError.ts"
import { GitIndex } from "../git/index/GitIndex.ts"
// RefManager import removed - using Repository.resolveRef/writeRef methods instead
import { logRefUpdate } from "../git/logs/logRefUpdate.ts"
import { REFLOG_MESSAGES } from "../git/logs/messages.ts"
import { writeCommit } from "./writeCommit.ts"
import { writeTree } from "./writeTree.ts"
import { parse as parseCommit, serialize as serializeCommit } from "../core-utils/parsers/Commit.ts"
import { parse as parseTree, serialize as serializeTree } from "../core-utils/parsers/Tree.ts"
import { signCommit } from "../core-utils/Signing.ts"
import { formatAuthor } from "../utils/formatAuthor.ts"
import { flatFileListToDirectoryStructure } from "../utils/flatFileListToDirectoryStructure.ts"
import { normalizeAuthorObject } from "../utils/normalizeAuthorObject.ts"
import { normalizeCommitterObject } from "../utils/normalizeCommitterObject.ts"
import { readObject } from "../git/objects/readObject.ts"
import { Repository } from "../core-utils/Repository.ts"
import { normalizeCommandArgs } from '../utils/commandHelpers.ts'
import { assertParameter } from "../utils/assertParameter.ts"
import { join } from "../utils/join.ts"
import type { ObjectFormat } from "../utils/detectObjectFormat.ts"
import AsyncLock from 'async-lock'
import type { FileSystem } from "../models/FileSystem.ts"
import type { CommitObject, Author } from "../models/GitCommit.ts"
import type { SignCallback } from "../core-utils/Signing.ts"
import { UniversalBuffer } from "../utils/UniversalBuffer.ts"

let indexLock: AsyncLock | undefined

/**
 * Create a new commit
 */
export async function commit({
  repo: _repo,
  fs: _fs,
  onSign,
  dir,
  gitdir = dir ? join(dir, '.git') : undefined,
  message,
  author,
  committer,
  signingKey,
  amend = false,
  dryRun = false,
  noUpdateBranch = false,
  ref,
  parent,
  tree,
  cache = {},
  autoDetectConfig = true,
}: {
  repo?: Repository
  fs?: FileSystem
  onSign?: SignCallback
  dir?: string
  gitdir?: string
  message?: string
  author?: Partial<Author>
  committer?: Partial<Author>
  signingKey?: string
  amend?: boolean
  dryRun?: boolean
  noUpdateBranch?: boolean
  ref?: string
  parent?: string[]
  tree?: string
  cache?: Record<string, unknown>
  autoDetectConfig?: boolean
}): Promise<string> {
  try {
    const { repo, fs: effectiveFs, gitdir: effectiveGitdir, cache: effectiveCache } = await normalizeCommandArgs({
      repo: _repo,
      fs: _fs,
      dir,
      gitdir,
      cache,
      autoDetectConfig,
      onSign,
      message,
      author,
      committer,
      signingKey,
      amend,
      dryRun,
      noUpdateBranch,
      ref,
      parent,
      tree,
    })

    assertParameter('gitdir', effectiveGitdir)
    if (!amend) {
      assertParameter('message', message)
    }
    if (signingKey) {
      assertParameter('onSign', onSign)
    }

    return await _commit({
      fs: effectiveFs,
      cache: effectiveCache,
      onSign,
      gitdir: effectiveGitdir,
      originalGitdir: gitdir, // Pass original gitdir for reflog consistency
      message,
      author,
      committer,
      signingKey,
      amend,
      dryRun,
      noUpdateBranch,
      ref,
      parent,
      tree,
      repo,
    })
  } catch (err) {
    ;(err as { caller?: string }).caller = 'git.commit'
    throw err
  }
}

/**
 * Internal commit implementation
 * @internal - Exported for use by other commands (e.g., addNote, removeNote, merge)
 */
export async function _commit({
  fs: _fs,
  cache: _cache,
  onSign,
  gitdir: _gitdir,
  originalGitdir,
  message,
  author: _author,
  committer: _committer,
  signingKey,
  amend = false,
  dryRun = false,
  noUpdateBranch = false,
  ref,
  parent,
  tree,
  repo,
}: {
  fs?: FileSystem
  cache?: Record<string, unknown>
  onSign?: SignCallback
  gitdir?: string
  originalGitdir?: string
  message?: string
  author?: Partial<Author>
  committer?: Partial<Author>
  signingKey?: string
  amend?: boolean
  dryRun?: boolean
  noUpdateBranch?: boolean
  ref?: string
  parent?: string[]
  tree?: string
  repo?: Repository
}): Promise<string> {
  // Extract parameters from Repository if provided
  const fs = repo?.fs || _fs!
  const cache = repo?.cache || _cache || {}
  let gitdir = _gitdir || (repo ? await repo.getGitdir() : undefined)
  
  if (!fs) throw new MissingParameterError('fs')
  if (!gitdir) throw new MissingParameterError('gitdir')
  
  // If Repository is provided, use worktree's gitdir to ensure we're using the correct index
  if (repo) {
    const worktree = repo.getWorktree()
    if (worktree) {
      gitdir = await worktree.getGitdir()
    }
  }
  
  // Detect object format from repository or gitdir
  let objectFormat: ObjectFormat = 'sha1'
  if (repo) {
    objectFormat = await repo.getObjectFormat()
  } else {
    const { detectObjectFormat } = await import('../utils/detectObjectFormat.ts')
    objectFormat = await detectObjectFormat(fs, gitdir)
  }
  // Determine ref and the commit pointed to by ref, and if it is the initial commit
  let initialCommit = false
  if (!ref) {
    // Try to resolve HEAD to get the ref (e.g., 'refs/heads/master')
    // If HEAD doesn't exist (fresh repo), we'll determine the default branch
    try {
      // Use Repository.resolveRef() or direct resolveRef() for consistency
      // Use depth 1 to get the ref name (e.g., 'refs/heads/main'), not the OID
      // We'll resolve the ref to OID separately below
      if (repo) {
        ref = await repo.resolveRef('HEAD', 1) // depth 1 to get ref name from symbolic ref
      } else {
        const { resolveRef } = await import('../git/refs/readRef.ts')
        ref = await resolveRef({ fs, gitdir, ref: 'HEAD', depth: 1 })
      }
    } catch {
      // HEAD doesn't exist - get default branch from config (defaults to 'master')
      let defaultBranch = 'master'
      try {
        const { ConfigAccess } = await import('../utils/configAccess.ts')
        const configAccess = new ConfigAccess(fs, gitdir)
        const initDefaultBranch = await configAccess.getConfigValue('init.defaultBranch')
        if (initDefaultBranch && typeof initDefaultBranch === 'string') {
          defaultBranch = initDefaultBranch
        }
      } catch {
        // Config doesn't exist or can't be read, use 'master'
      }
      // Default to the branch ref (will create branch and set HEAD to point to it)
      ref = `refs/heads/${defaultBranch}`
    }
  }

  // Try to resolve the ref to get the commit OID
  let refOid: string | undefined
  let refCommit: CommitObject | undefined
  try {
    // Use Repository.resolveRef() or direct resolveRef() for consistency
    if (repo) {
      refOid = await repo.resolveRef(ref)
    } else {
      const { resolveRef } = await import('../git/refs/readRef.ts')
      refOid = await resolveRef({ fs, gitdir, ref })
    }
    const commitResult = await readObject({ fs, cache, gitdir, oid: refOid, format: 'content' })
    if (commitResult.type === 'commit') {
      refCommit = parseCommit(commitResult.object) as CommitObject
    }
  } catch {
    // We assume that there's no commit and this is the initial commit
    initialCommit = true
  }

  // If amend is requested but there's no commit to amend, throw error
  if (amend && initialCommit) {
    throw new NoCommitError(ref)
  }

  // Determine author and committer information
  // CRITICAL: repo is required for normalizeAuthorObject and normalizeCommitterObject
  if (!repo) {
    throw new Error('Repository instance is required for commit')
  }
  
  const author = !amend
    ? await normalizeAuthorObject({ repo, author: _author })
    : await normalizeAuthorObject({
        repo,
        author: _author,
        commit: refCommit,
      })
  if (!author) throw new MissingNameError('author')

  const committer = !amend
    ? await normalizeCommitterObject({
        repo,
        author,
        committer: _committer,
      })
    : await normalizeCommitterObject({
        repo,
        author,
        committer: _committer,
        commit: refCommit,
        amend: true,
      })
  if (!committer) throw new MissingNameError('committer')

  // Acquire index lock
  if (!indexLock) {
    indexLock = new AsyncLock({ maxPending: Infinity })
  }

  const indexPath = join(gitdir, 'index')
  return indexLock.acquire(indexPath, async () => {
    // Read index using Repository.readIndexDirect() if repo is available
    // This ensures proper unmerged paths detection
    let index
    if (repo) {
      try {
        index = await repo.readIndexDirect(false, false) // Force fresh read, allowUnmerged: false
        // If there are unmerged paths, readIndexDirect will throw UnmergedPathsError
      } catch (error) {
        // If readIndexDirect throws UnmergedPathsError, re-throw it
        if (error instanceof UnmergedPathsError) {
          throw error
        }
        // For other errors, fall back to direct file read
        let indexBuffer: UniversalBuffer = UniversalBuffer.alloc(0)
        try {
          const indexData = await fs.read(indexPath)
          indexBuffer = UniversalBuffer.from(indexData as string | Uint8Array)
        } catch {
          // Index doesn't exist yet
        }
        if (indexBuffer.length === 0) {
          index = new GitIndex(null, undefined, 2)
        } else {
          index = await GitIndex.fromBuffer(indexBuffer, objectFormat)
        }
        if (index.unmergedPaths.length > 0) {
          throw new UnmergedPathsError(index.unmergedPaths)
        }
      }
    } else {
      // Fallback: read index directly from file
      let indexBuffer: UniversalBuffer = UniversalBuffer.alloc(0)
      try {
        const indexData = await fs.read(indexPath)
        indexBuffer = UniversalBuffer.from(indexData as string | Uint8Array)
      } catch {
        // Index doesn't exist yet
      }

      // Handle empty index - create an empty index object instead of parsing
      if (indexBuffer.length === 0) {
        // Empty index - create a minimal index object with default version
        index = new GitIndex(null, undefined, 2)
      } else {
        // Detect object format for index parsing
        const { detectObjectFormat } = await import('../utils/detectObjectFormat.ts')
        const format = await detectObjectFormat(fs, gitdir)
        index = await GitIndex.fromBuffer(indexBuffer, format)
      }

      // Check for unmerged paths
      if (index.unmergedPaths.length > 0) {
        throw new UnmergedPathsError(index.unmergedPaths)
      }
    }

    // Build tree from index
    const entries = index.entries.flatMap(entry => {
      // Get the main entry (stage 0) or the first stage
      const mainEntry = entry.stages.length > 0 ? entry.stages[0] : entry
      return mainEntry ? [mainEntry] : []
    })

    const inodes = flatFileListToDirectoryStructure(entries)
    const inode = inodes.get('.')
    if (!tree) {
      if (!inode) {
        throw new Error('Root inode not found')
      }
      tree = await constructTree({ repo, fs, gitdir, inode, dryRun, cache, objectFormat })
    }

    // Determine parents of this commit
    let commitParents: string[]
    if (!parent) {
      if (!amend) {
        commitParents = refOid ? [refOid] : []
      } else {
        commitParents = refCommit?.parent || []
      }
    } else {
      // ensure that the parents are oids, not refs
      // Use Repository.resolveRef() or direct resolveRef() for consistency
      if (repo) {
        commitParents = await Promise.all(
          parent.map(p => repo.resolveRef(p))
        )
      } else {
        const { resolveRef } = await import('../git/refs/readRef.ts')
        commitParents = await Promise.all(
          parent.map(p => resolveRef({ fs, gitdir, ref: p }))
        )
      }
    }

    // Determine message of this commit
    let commitMessage: string
    if (!message) {
      if (!amend) {
        throw new MissingParameterError('message')
      } else {
        commitMessage = refCommit?.message || ''
      }
    } else {
      commitMessage = message
    }

    // Run pre-commit hook (before creating commit object)
    if (!dryRun) {
      try {
        const { runHook } = await import('../git/hooks/runHook.ts')
        const worktree = repo?.getWorktree()
        const workTree = worktree?.dir || undefined
        await runHook({
          fs,
          gitdir,
          hookName: 'pre-commit',
          context: {
            gitdir,
            workTree,
            indexFile: indexPath,
            branch: ref?.replace('refs/heads/', ''),
          },
        })
      } catch (hookError: any) {
        // If hook fails, abort the commit
        if (hookError.exitCode !== undefined) {
          throw new Error(`pre-commit hook failed: ${hookError.stderr || hookError.message}`)
        }
        throw hookError
      }
    }

    // Run prepare-commit-msg hook (after message is determined, before finalizing)
    // This hook can modify the commit message
    if (!dryRun && commitMessage) {
      try {
        const { runHook } = await import('../git/hooks/runHook.ts')
        const worktree = repo?.getWorktree()
        const workTree = worktree?.dir || undefined
        
        // Create a temporary file for the commit message (hooks expect a file path)
        // Only works in Node.js environments (hooks don't work in browsers anyway)
        let commitMsgPath: string | undefined
        try {
          const os = await import('os')
          const { join } = await import('../utils/join.ts')
          const nodeFs = await import('fs/promises')
          commitMsgPath = join(os.tmpdir(), `git-commit-msg-${Date.now()}-${Math.random().toString(36).substring(7)}`)
          
          await nodeFs.writeFile(commitMsgPath, commitMessage, 'utf8')
          
          await runHook({
            fs,
            gitdir,
            hookName: 'prepare-commit-msg',
            context: {
              gitdir,
              workTree,
              commitMessage: commitMsgPath,
            },
            stdin: commitMessage,
          })
          
          // Read the modified message from the file
          const modifiedMessage = await nodeFs.readFile(commitMsgPath, 'utf8')
          if (modifiedMessage.trim() !== commitMessage.trim()) {
            commitMessage = modifiedMessage.trim()
          }
        } catch (tempFileError: any) {
          // If we can't create temp file (e.g., browser environment), skip the hook
          // This is okay - hooks are optional and may not work in all environments
          if (tempFileError.code === 'MODULE_NOT_FOUND' || !commitMsgPath) {
            // Not in Node.js environment, skip hook but continue with commit
            // Don't throw - just skip hook execution
          } else {
            throw tempFileError
          }
        } finally {
          // Clean up temporary file
          if (commitMsgPath) {
            try {
              const nodeFs = await import('fs/promises')
              await nodeFs.unlink(commitMsgPath)
            } catch {
              // Ignore cleanup errors
            }
          }
        }
      } catch (hookError: any) {
        // If hook fails, abort the commit
        if (hookError.exitCode !== undefined) {
          throw new Error(`prepare-commit-msg hook failed: ${hookError.stderr || hookError.message}`)
        }
        // If it's not a hook execution error, re-throw
        if (!hookError.message?.includes('hook')) {
          throw hookError
        }
      }
    }

    // Get empty tree OID based on format
    const { getOidLength } = await import('../utils/detectObjectFormat.ts')
    const emptyTreeOid = objectFormat === 'sha256' 
      ? '0'.repeat(getOidLength('sha256'))
      : '4b825dc642cb6eb9a060e54bf8d69288fbee4904'
    
    // Create commit object
    let commitObj: CommitObject = {
      tree: tree || emptyTreeOid, // empty tree
      parent: commitParents,
      author,
      committer,
      message: commitMessage,
    }

    // Sign commit if requested
    if (signingKey && onSign) {
      const headers = renderCommitHeaders(commitObj)
      const signedHeaders = await signCommit({
        headers,
        message: commitMessage,
        signer: onSign,
        secretKey: signingKey,
      })
      // Parse the signed commit to get the gpgsig
      const signedCommit = parseCommit(signedHeaders)
      commitObj = { ...commitObj, gpgsig: signedCommit.gpgsig }
    }

    // Run commit-msg hook (after commit object is created but before writing)
    // This hook validates the commit message
    if (!dryRun && commitMessage) {
      try {
        const { runHook } = await import('../git/hooks/runHook.ts')
        const worktree = repo?.getWorktree()
        const workTree = worktree?.dir || undefined
        
        // Create a temporary file for the commit message (hooks expect a file path)
        // Only works in Node.js environments (hooks don't work in browsers anyway)
        let commitMsgPath: string | undefined
        try {
          const os = await import('os')
          const { join } = await import('../utils/join.ts')
          const nodeFs = await import('fs/promises')
          commitMsgPath = join(os.tmpdir(), `git-commit-msg-${Date.now()}-${Math.random().toString(36).substring(7)}`)
          
          await nodeFs.writeFile(commitMsgPath, commitMessage, 'utf8')
          
          await runHook({
            fs,
            gitdir,
            hookName: 'commit-msg',
            context: {
              gitdir,
              workTree,
              commitMessage: commitMsgPath,
            },
            stdin: commitMessage,
          })
          
          // Read the validated/modified message from the file
          const validatedMessage = await nodeFs.readFile(commitMsgPath, 'utf8')
          if (validatedMessage.trim() !== commitMessage.trim()) {
            commitMessage = validatedMessage.trim()
            // Update commit object with new message
            commitObj = { ...commitObj, message: commitMessage }
          }
        } catch (tempFileError: any) {
          // If we can't create temp file (e.g., browser environment), skip the hook
          // This is okay - hooks are optional and may not work in all environments
          if (tempFileError.code === 'MODULE_NOT_FOUND' || !commitMsgPath) {
            // Not in Node.js environment, skip hook but continue with commit
            // Don't throw - just skip hook execution
          } else {
            throw tempFileError
          }
        } finally {
          // Clean up temporary file
          if (commitMsgPath) {
            try {
              const nodeFs = await import('fs/promises')
              await nodeFs.unlink(commitMsgPath)
            } catch {
              // Ignore cleanup errors
            }
          }
        }
      } catch (hookError: any) {
        // If hook fails, abort the commit
        if (hookError.exitCode !== undefined) {
          throw new Error(`commit-msg hook failed: ${hookError.stderr || hookError.message}`)
        }
        // If it's not a hook execution error, re-throw
        if (!hookError.message?.includes('hook')) {
          throw hookError
        }
      }
    }

    // Write commit object using writeCommit with dryRun support
    const oid = await writeCommit({
      repo,
      fs,
      gitdir,
      commit: commitObj,
      dryRun,
      cache,
    })

    if (!noUpdateBranch && !dryRun) {
      // Get zero OID based on format
      const { getOidLength } = await import('../utils/detectObjectFormat.ts')
      const zeroOid = '0'.repeat(getOidLength(objectFormat))
      
      // Read old OID before updating (for reflog)
      let oldOid: string = zeroOid
      try {
        if (repo) {
          oldOid = await repo.resolveRef(ref) || zeroOid
        } else {
          const { resolveRef } = await import('../git/refs/readRef.ts')
          const resolved = await resolveRef({ fs, gitdir, ref, objectFormat })
          oldOid = resolved || zeroOid
        }
      } catch {
        // Ref doesn't exist yet, use zero OID
        oldOid = zeroOid
      }
      
      // Update branch pointer
      
      // For initial commits, we need to:
      // 1. Create the branch ref (e.g., refs/heads/master)
      // 2. Set HEAD to point to that branch (if HEAD doesn't exist or is detached)
      if (initialCommit && ref.startsWith('refs/heads/')) {
        // Write the branch ref
        if (repo) {
          await repo.writeRef(ref, oid, true) // skipReflog=true: commit will create its own reflog entry
        } else {
          const { writeRef } = await import('../git/refs/writeRef.ts')
          await writeRef({ fs, gitdir, ref, value: oid, objectFormat, skipReflog: true }) // skipReflog=true: commit will create its own reflog entry
        }
        
        // Set HEAD to point to this branch (if HEAD doesn't exist or is detached)
        try {
          // Try to read HEAD to see if it exists and what it points to
          const { readRef } = await import('../git/refs/readRef.ts')
          const headRef = await readRef({ fs, gitdir, ref: 'HEAD' })
          // If HEAD exists and is already a symbolic ref pointing to our branch, we're good
          if (headRef && typeof headRef === 'string' && headRef.startsWith('ref: ') && headRef.includes(ref)) {
            // HEAD already points to this branch, nothing to do
          } else {
            // HEAD is detached or doesn't exist, update it
            const branchName = ref.replace('refs/heads/', '')
            if (repo) {
              // Read old HEAD OID for reflog before updating
              let oldOid: string | undefined
              try {
                oldOid = await repo.resolveRef('HEAD')
              } catch {
                oldOid = undefined
              }
              await repo.writeSymbolicRefDirect('HEAD', `refs/heads/${branchName}`, oldOid)
            } else {
              const { writeSymbolicRef } = await import('../git/refs/writeRef.ts')
              // Read old HEAD OID for reflog before updating
              let oldOid: string | undefined
              try {
                const { resolveRef } = await import('../git/refs/readRef.ts')
                oldOid = await resolveRef({ fs, gitdir, ref: 'HEAD', objectFormat })
              } catch {
                oldOid = undefined
              }
              await writeSymbolicRef({ fs, gitdir, ref: 'HEAD', value: `refs/heads/${branchName}`, oldOid, objectFormat })
            }
          }
        } catch {
          // HEAD doesn't exist, create it as a symbolic ref pointing to the branch
          const branchName = ref.replace('refs/heads/', '')
          if (repo) {
            // Read old HEAD OID for reflog before updating
            let oldOid: string | undefined
            try {
              oldOid = await repo.resolveRef('HEAD')
            } catch {
              oldOid = undefined
            }
            await repo.writeSymbolicRefDirect('HEAD', `refs/heads/${branchName}`, oldOid)
          } else {
            const { writeSymbolicRef } = await import('../git/refs/writeRef.ts')
            // Read old HEAD OID for reflog before updating
            let oldOid: string | undefined
            try {
              const { resolveRef } = await import('../git/refs/readRef.ts')
              oldOid = await resolveRef({ fs, gitdir, ref: 'HEAD', objectFormat })
            } catch {
              oldOid = undefined
            }
            await writeSymbolicRef({ fs, gitdir, ref: 'HEAD', value: `refs/heads/${branchName}`, oldOid, objectFormat })
          }
        }
      } else {
        // Normal commit - just update the ref
        // Use Repository.writeRef() or direct writeRef() for consistency
        // DEBUG: Log ref and OID being written for native git compatibility debugging
        if (process.env.DEBUG_COMMIT_REFS === 'true') {
          console.log(`[DEBUG] Writing ref: ${ref} -> ${oid}`)
        }
        if (repo) {
          await repo.writeRef(ref, oid, true) // skipReflog=true: commit will create its own reflog entry
        } else {
          const { writeRef } = await import('../git/refs/writeRef.ts')
          await writeRef({ fs, gitdir, ref, value: oid, objectFormat, skipReflog: true }) // skipReflog=true: commit will create its own reflog entry
        }
      }

      // Write reflog entry with detailed commit information
      // Use originalGitdir if provided (for test consistency), otherwise use gitdir
      const reflogGitdir = originalGitdir || gitdir
      const commitMessageFirstLine = commitMessage.split('\n')[0]
      // Format timezone offset correctly (convert minutes to +HHMM or -HHMM format)
      const formatTimezoneOffset = (minutes: number): string => {
        const sign = minutes < 0 ? '-' : '+'
        const absMinutes = Math.abs(minutes)
        const hours = Math.floor(absMinutes / 60)
        const remainingMinutes = absMinutes - hours * 60
        const strHours = String(hours).padStart(2, '0')
        const strMinutes = String(remainingMinutes).padStart(2, '0')
        return `${sign}${strHours}${strMinutes}`
      }
      
      await logRefUpdate({
        fs,
        gitdir: reflogGitdir,
        ref,
        oldOid,
        newOid: oid,
        message: amend 
          ? REFLOG_MESSAGES.COMMIT_AMEND(commitMessageFirstLine)
          : REFLOG_MESSAGES.COMMIT(commitMessageFirstLine),
        author: `${committer.name} <${committer.email}>`,
        timestamp: committer.timestamp,
        timezoneOffset: formatTimezoneOffset(committer.timezoneOffset),
      }).catch(() => {
        // Reflog might not be enabled, ignore (handled by logRefUpdate)
      })

      // Run post-commit hook (after successful commit)
      try {
        const { runHook } = await import('../git/hooks/runHook.ts')
        const worktree = repo?.getWorktree()
        const workTree = worktree?.dir || undefined
        await runHook({
          fs,
          gitdir,
          hookName: 'post-commit',
          context: {
            gitdir,
            workTree,
            commitOid: oid,
            branch: ref?.replace('refs/heads/', ''),
          },
        })
      } catch (hookError: any) {
        // Post-commit hook failures don't abort the commit (it's already done)
        // But we log the error for debugging
        if (process.env.DEBUG_HOOKS === 'true') {
          console.warn(`post-commit hook failed: ${hookError.stderr || hookError.message}`)
        }
      }
    }

    return oid
  })
}

/**
 * Renders commit headers (without message)
 */
function renderCommitHeaders(commit: CommitObject): string {
  let headers = ''
  if (commit.tree) {
    headers += `tree ${commit.tree}\n`
  }
  if (commit.parent) {
    for (const p of commit.parent) {
      headers += `parent ${p}\n`
    }
  }
  headers += `author ${formatAuthor(commit.author)}\n`
  headers += `committer ${formatAuthor(commit.committer || commit.author)}\n`
  return headers
}


/**
 * Type for inode structure used in constructTree
 */
type InodeChild = {
  type: string
  basename: string
  metadata: { mode?: string; oid?: string }
  children?: InodeChild[]
}

type Inode = {
  children: InodeChild[]
}

/**
 * Constructs a tree from an inode structure
 */
async function constructTree({
  repo,
  fs,
  gitdir,
  inode,
  dryRun,
  cache,
  objectFormat = 'sha1',
}: {
  repo?: Repository
  fs: FileSystem
  gitdir: string
  inode: Inode  
  dryRun: boolean
  cache: Record<string, unknown>
  objectFormat?: ObjectFormat
}): Promise<string> {
  // use depth first traversal
  const children = inode.children
  for (const child of children) {
    if (child.type === 'tree') {
      child.metadata.mode = '040000'
      // Ensure child has children array for recursive call
      if (!child.children) {
        child.children = []
      }
      child.metadata.oid = await constructTree({ repo, fs, gitdir, inode: child as Inode, dryRun, cache, objectFormat })
    }
  }
  const entries = children.map(child => ({
    mode: child.metadata.mode || '100644',
    path: child.basename,
    oid: child.metadata.oid || '',
    type: child.type as 'tree' | 'blob' | 'commit',
  }))
  // Write tree using writeTree with dryRun support
  const oid = await writeTree({
    repo,
    fs,
    gitdir,
    tree: entries,
    objectFormat,
    dryRun,
    cache,
  })
  return oid
}

