import { join } from "../../core-utils/GitPath.ts"
import { UniversalBuffer } from "../../utils/UniversalBuffer.ts"
import type { GitBackendFs } from './GitBackendFs.ts'
import type { FileSystem } from "../../models/FileSystem.ts"
import type { Repository } from "../../core-utils/Repository.ts"

/**
 * Commit operation for GitBackendFs
 * Creates a commit from the current staging area
 */

export async function commit(
  this: GitBackendFs,
  worktreeBackend: import('../../git/worktree/GitWorktreeBackend.ts').GitWorktreeBackend,
  message: string,
  options?: {
    author?: Partial<import('../../models/GitCommit.ts').Author>
    committer?: Partial<import('../../models/GitCommit.ts').Author>
    noVerify?: boolean
    amend?: boolean
    dryRun?: boolean
    noUpdateBranch?: boolean
    ref?: string
    parent?: string[]
    tree?: string
    signingKey?: string
    onSign?: import('../../core-utils/Signing.ts').SignCallback
  }
): Promise<string> {
  const cache: Record<string, unknown> = {}
  
  // Import dependencies
  const { MissingNameError } = await import('../../errors/MissingNameError.ts')
  const { MissingParameterError } = await import('../../errors/MissingParameterError.ts')
  const { NoCommitError } = await import('../../errors/NoCommitError.ts')
  const { UnmergedPathsError } = await import('../../errors/UnmergedPathsError.ts')
  const { GitIndex } = await import('../../git/index/GitIndex.ts')
  const { logRefUpdate } = await import('../../git/logs/logRefUpdate.ts')
  const { REFLOG_MESSAGES } = await import('../../git/logs/messages.ts')
  const { writeCommit } = await import('../../commands/writeCommit.ts')
  const { writeTree } = await import('../../commands/writeTree.ts')
  const { parse: parseCommit } = await import('../../core-utils/parsers/Commit.ts')
  const { signCommit } = await import('../../core-utils/Signing.ts')
  const { formatAuthor } = await import('../../utils/formatAuthor.ts')
  const { flatFileListToDirectoryStructure } = await import('../../utils/flatFileListToDirectoryStructure.ts')
  const { normalizeAuthorObject } = await import('../../utils/normalizeAuthorObject.ts')
  const { normalizeCommitterObject } = await import('../../utils/normalizeCommitterObject.ts')
  const { readObject } = await import('../../git/objects/readObject.ts')
  const AsyncLock = (await import('async-lock')).default
  const { getOidLength } = await import('../../utils/detectObjectFormat.ts')
  type CommitObject = import('../../models/GitCommit.ts').CommitObject
  type Author = import('../../models/GitCommit.ts').Author
  type ObjectFormat = import('../../utils/detectObjectFormat.ts').ObjectFormat

  const {
    author: _author,
    committer: _committer,
    amend = false,
    dryRun = false,
    noUpdateBranch = false,
    ref,
    parent,
    tree,
    signingKey,
    onSign,
  } = options || {}

  if (!amend && !message) {
    throw new MissingParameterError('message')
  }
  if (signingKey && !onSign) {
    throw new MissingParameterError('onSign')
  }

  // Get object format
  const objectFormat: ObjectFormat = await this.getObjectFormat(cache)

  // Determine ref and the commit pointed to by ref, and if it is the initial commit
  let initialCommit = false
  let effectiveRef = ref
  if (!effectiveRef) {
    // Try to resolve HEAD to get the ref (e.g., 'refs/heads/master')
    // If HEAD doesn't exist (fresh repo), we'll determine the default branch
    try {
      // Use depth 1 to get the ref name (e.g., 'refs/heads/main'), not the OID
      const headRef = await this.readRef('HEAD', 1, cache)
      if (headRef && headRef.startsWith('ref: ')) {
        effectiveRef = headRef.replace('ref: ', '').trim()
      } else {
        // HEAD is detached, use it as the ref
        effectiveRef = 'HEAD'
      }
    } catch {
      // HEAD doesn't exist - get default branch from config (defaults to 'master')
      let defaultBranch = 'master'
      try {
        const initDefaultBranch = await this.getConfig('init.defaultBranch')
        if (initDefaultBranch && typeof initDefaultBranch === 'string') {
          defaultBranch = initDefaultBranch
        }
      } catch {
        // Config doesn't exist or can't be read, use 'master'
      }
      // Default to the branch ref (will create branch and set HEAD to point to it)
      effectiveRef = `refs/heads/${defaultBranch}`
    }
  }

  // Try to resolve the ref to get the commit OID
  let refOid: string | undefined
  let refCommit: CommitObject | undefined
  try {
    refOid = await this.readRef(effectiveRef, 5, cache) || undefined
    if (refOid) {
      const commitResult = await readObject({ fs: this.getFs(), cache, gitdir: this.getGitdir(), oid: refOid, format: 'content' })
      if (commitResult.type === 'commit') {
        refCommit = parseCommit(commitResult.object) as CommitObject
      }
    } else {
      // refOid is null/undefined - this is an initial commit
      initialCommit = true
    }
  } catch {
    // We assume that there's no commit and this is the initial commit
    initialCommit = true
  }

  // If amend is requested but there's no commit to amend, throw error
  if (amend && initialCommit) {
    throw new NoCommitError(effectiveRef)
  }

  // Determine author and committer information
  // Use gitBackend directly to maintain isolation - no Repository instance needed
  const author = !amend
    ? await normalizeAuthorObject({ gitBackend: this, author: _author })
    : await normalizeAuthorObject({
        gitBackend: this,
        author: _author,
        commit: refCommit,
      })
  if (!author) throw new MissingNameError('author')

  const committer = !amend
    ? await normalizeCommitterObject({
        gitBackend: this,
        author,
        committer: _committer,
      })
    : await normalizeCommitterObject({
        gitBackend: this,
        author,
        committer: _committer,
        commit: refCommit,
        amend: true,
      })
  if (!committer) throw new MissingNameError('committer')

  // Acquire index lock
  let indexLock: InstanceType<typeof AsyncLock> | undefined
  if (!indexLock) {
    indexLock = new AsyncLock({ maxPending: Infinity })
  }

  const indexPath = join(this.getGitdir(), 'index')
  
  // Helper function to render commit headers
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

  // Helper function to construct tree from inode structure
  type InodeChild = {
    type: string
    basename: string
    metadata: { mode?: string; oid?: string }
    children?: InodeChild[]
  }

  type Inode = {
    children: InodeChild[]
  }

  async function constructTree({
    repo,
    fs,
    gitdir,
    inode,
    dryRun,
    cache,
    objectFormat = 'sha1',
  }: {
    repo: InstanceType<typeof Repository> | undefined
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
    const entries = children.map(child => {
      // Convert numeric mode to octal string (e.g., 33188 -> '100644')
      const metadata = child.metadata as { mode?: number | string; oid?: string; [key: string]: unknown }
      let mode: string
      if (metadata.mode !== undefined && metadata.mode !== null) {
        if (typeof metadata.mode === 'number') {
          mode = metadata.mode.toString(8).padStart(6, '0')
        } else {
          mode = String(metadata.mode)
        }
      } else {
        mode = '100644' // Default mode for regular files
      }
      return {
        mode,
        path: child.basename,
        oid: metadata.oid || '',
        type: child.type as 'tree' | 'blob' | 'commit',
      }
    })
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
  
  return indexLock.acquire(indexPath, async () => {
    // Read index using this.readIndex()
    let index: InstanceType<typeof GitIndex>
    let indexBuffer: UniversalBuffer = UniversalBuffer.alloc(0)
    
    try {
      indexBuffer = await this.readIndex()
    } catch {
      // Index doesn't exist yet
    }

    // Handle empty index - create an empty index object instead of parsing
    if (indexBuffer.length === 0) {
      // Empty index - create a minimal index object with default version
      index = new GitIndex(null, undefined, 2)
    } else {
      // Parse index with detected object format
      index = await GitIndex.fromBuffer(indexBuffer, objectFormat)
    }

    // Check for unmerged paths
    if (index.unmergedPaths.length > 0) {
      throw new UnmergedPathsError(index.unmergedPaths)
    }

    // Build tree from index
    // Only include stage 0 entries (normal entries, not conflicted)
    const entries = index.entries.flatMap(entry => {
      // For normal entries, entry itself is stage 0 and entry.stages = [entry]
      // For conflicted entries, we need to find the stage 0 entry in entry.stages
      if (entry.flags.stage === 0) {
        // Entry itself is stage 0 - use it directly
        return [entry]
      } else {
        // Entry is not stage 0 (conflicted) - find stage 0 in stages array
        const stage0Entry = entry.stages.find(s => s && s.flags.stage === 0)
        return stage0Entry ? [stage0Entry] : []
      }
    })

    const inodes = flatFileListToDirectoryStructure(entries)
    const inode = inodes.get('.')
    let effectiveTree = tree
    if (!effectiveTree) {
      if (!inode) {
        throw new Error('Root inode not found')
      }
      effectiveTree = await constructTree({ 
        repo: undefined, 
        fs: this.getFs(), 
        gitdir: this.getGitdir(), 
        inode, 
        dryRun, 
        cache, 
        objectFormat 
      })
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
      commitParents = await Promise.all(
        parent.map(p => this.readRef(p, 5, cache).then(oid => oid || p))
      )
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
    if (!dryRun && !options?.noVerify) {
      try {
        const { runHook } = await import('../../git/hooks/runHook.ts')
        await runHook({
          fs: this.getFs(),
          gitdir: this.getGitdir(),
          hookName: 'pre-commit',
          context: {
            gitdir: this.getGitdir(),
            workTree: undefined, // worktreeBackend is a black box
            indexFile: indexPath,
            branch: effectiveRef?.replace('refs/heads/', ''),
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
    if (!dryRun && commitMessage && !options?.noVerify) {
      try {
        const { runHook } = await import('../../git/hooks/runHook.ts')
        
        // Create a temporary file for the commit message (hooks expect a file path)
        let commitMsgPath: string | undefined
        try {
          const os = await import('os')
          const nodeFs = await import('fs/promises')
          commitMsgPath = join(os.tmpdir(), `git-commit-msg-${Date.now()}-${Math.random().toString(36).substring(7)}`)
          
          await nodeFs.writeFile(commitMsgPath, commitMessage, 'utf8')
          
          await runHook({
            fs: this.getFs(),
            gitdir: this.getGitdir(),
            hookName: 'prepare-commit-msg',
            context: {
              gitdir: this.getGitdir(),
              workTree: undefined,
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
          if (tempFileError.code === 'MODULE_NOT_FOUND' || !commitMsgPath) {
            // Not in Node.js environment, skip hook but continue with commit
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
        if (!hookError.message?.includes('hook')) {
          throw hookError
        }
      }
    }

    // Get empty tree OID based on format
    const emptyTreeOid = objectFormat === 'sha256' 
      ? '0'.repeat(getOidLength('sha256'))
      : '4b825dc642cb6eb9a060e54bf8d69288fbee4904'
    
    // Create commit object
    let commitObj: CommitObject = {
      tree: effectiveTree || emptyTreeOid, // empty tree
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
    if (!dryRun && commitMessage && !options?.noVerify) {
      try {
        const { runHook } = await import('../../git/hooks/runHook.ts')
        
        // Create a temporary file for the commit message
        let commitMsgPath: string | undefined
        try {
          const os = await import('os')
          const nodeFs = await import('fs/promises')
          commitMsgPath = join(os.tmpdir(), `git-commit-msg-${Date.now()}-${Math.random().toString(36).substring(7)}`)
          
          await nodeFs.writeFile(commitMsgPath, commitMessage, 'utf8')
          
          await runHook({
            fs: this.getFs(),
            gitdir: this.getGitdir(),
            hookName: 'commit-msg',
            context: {
              gitdir: this.getGitdir(),
              workTree: undefined,
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
          if (tempFileError.code === 'MODULE_NOT_FOUND' || !commitMsgPath) {
            // Not in Node.js environment, skip hook but continue with commit
          } else {
            throw tempFileError
          }
        } finally {
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
        if (!hookError.message?.includes('hook')) {
          throw hookError
        }
      }
    }

    // Write commit object using writeCommit with dryRun support
    // Pass undefined for repo to maintain isolation - use fs/gitdir directly
    const oid = await writeCommit({
      repo: undefined,
      fs: this.getFs(),
      gitdir: this.getGitdir(),
      commit: commitObj,
      dryRun,
      cache,
    })

    if (!noUpdateBranch && !dryRun) {
      // Get zero OID based on format
      const zeroOid = '0'.repeat(getOidLength(objectFormat))
      
      // Read old OID before updating (for reflog)
      let oldOid: string = zeroOid
      try {
        const resolved = await this.readRef(effectiveRef, 5, cache)
        oldOid = resolved || zeroOid
      } catch {
        // Ref doesn't exist yet, use zero OID
        oldOid = zeroOid
      }
      
      // Update branch pointer
      // For initial commits, we need to:
      // 1. Create the branch ref (e.g., refs/heads/master)
      // 2. Set HEAD to point to that branch (if HEAD doesn't exist or is detached)
      if (initialCommit && effectiveRef.startsWith('refs/heads/')) {
        // Write the branch ref
        await this.writeRef(effectiveRef, oid, true, cache) // skipReflog=true: commit will create its own reflog entry
        
        // Set HEAD to point to this branch (if HEAD doesn't exist or is detached)
        try {
          // Try to read HEAD to see if it exists and what it points to
          const headRef = await this.readRef('HEAD', 1, cache)
          // If HEAD exists and is already a symbolic ref pointing to our branch, we're good
          if (headRef && typeof headRef === 'string' && headRef.startsWith('ref: ') && headRef.includes(effectiveRef)) {
            // HEAD already points to this branch, nothing to do
          } else {
            // HEAD is detached or doesn't exist, update it
            const branchName = effectiveRef.replace('refs/heads/', '')
            // Read old HEAD OID for reflog before updating
            let oldHeadOid: string | undefined
            try {
              oldHeadOid = await this.readRef('HEAD', 5, cache) || undefined
            } catch {
              oldHeadOid = undefined
            }
            await this.writeSymbolicRef('HEAD', `refs/heads/${branchName}`, oldHeadOid, cache)
          }
        } catch {
          // HEAD doesn't exist, create it as a symbolic ref pointing to the branch
          const branchName = effectiveRef.replace('refs/heads/', '')
          // Read old HEAD OID for reflog before updating
          let oldHeadOid: string | undefined
          try {
            oldHeadOid = await this.readRef('HEAD', 5, cache) || undefined
          } catch {
            oldHeadOid = undefined
          }
          await this.writeSymbolicRef('HEAD', `refs/heads/${branchName}`, oldHeadOid, cache)
        }
      } else {
        // Normal commit - just update the ref
        await this.writeRef(effectiveRef, oid, true, cache) // skipReflog=true: commit will create its own reflog entry
      }

      // Write reflog entry with detailed commit information
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
        fs: this.getFs(),
        gitdir: this.getGitdir(),
        ref: effectiveRef,
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
      if (!options?.noVerify) {
        try {
          const { runHook } = await import('../../git/hooks/runHook.ts')
          await runHook({
            fs: this.getFs(),
            gitdir: this.getGitdir(),
            hookName: 'post-commit',
            context: {
              gitdir: this.getGitdir(),
              workTree: undefined,
              commitOid: oid,
              branch: effectiveRef?.replace('refs/heads/', ''),
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
    }

    return oid
  })
}

