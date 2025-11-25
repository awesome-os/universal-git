import { addRemote } from './addRemote.ts'
import { _checkout } from './checkout.ts'
import { _fetch } from './fetch.ts'
import { _init } from './init.ts'
import { MissingParameterError } from "../errors/MissingParameterError.ts"
import { ConfigAccess } from "../utils/configAccess.ts"
import { createFileSystem } from "../utils/createFileSystem.ts"
import { assertParameter } from "../utils/assertParameter.ts"
import { join } from "../utils/join.ts"
import { Repository } from "../core-utils/Repository.ts"
// RefManager import removed - using capability modules directly
import type { FileSystemProvider } from "../models/FileSystem.ts"
import type { BaseCommandOptions } from "../types/commandOptions.ts"
import type {
  HttpClient,
  ProgressCallback,
  AuthCallback,
  AuthFailureCallback,
  AuthSuccessCallback,
} from "../git/remote/types.ts"
import type { GitRemoteBackend } from "../git/remote/GitRemoteBackend.ts"
import type { TcpClient, TcpProgressCallback } from "../daemon/TcpClient.ts"
import type { SshClient, SshProgressCallback } from "../ssh/SshClient.ts"
import type { MessageCallback } from './push.ts'
import type { PostCheckoutCallback } from './checkout.ts'

/**
 * Clone command options
 * Note: clone is a special case that creates repositories, so it can't use normalizeCommandArgs
 * in the same way as other commands. It uses BaseCommandOptions for consistency.
 */
export type CloneOptions = BaseCommandOptions & {
  remoteBackend?: GitRemoteBackend // Optional: use provided backend or auto-detect
  http?: HttpClient // Required for HTTP/HTTPS URLs if remoteBackend not provided
  tcp?: TcpClient // Required for git:// URLs if remoteBackend not provided
  ssh?: SshClient | Promise<SshClient> // Required for SSH URLs if remoteBackend not provided
  onProgress?: ProgressCallback | TcpProgressCallback | SshProgressCallback
  onMessage?: MessageCallback
  onAuth?: AuthCallback
  onAuthSuccess?: AuthSuccessCallback
  onAuthFailure?: AuthFailureCallback
  onPostCheckout?: PostCheckoutCallback
  url: string
  corsProxy?: string
  ref?: string
  remote?: string
  depth?: number
  since?: Date
  exclude?: string[]
  relative?: boolean
  singleBranch?: boolean
  noCheckout?: boolean
  noTags?: boolean
  headers?: Record<string, string>
  nonBlocking?: boolean
  batchSize?: number
  protocolVersion?: 1 | 2
}

/**
 * Clone a repository
 */
export async function clone({
  repo: _repo,
  fs: _fs,
  remoteBackend,
  http,
  tcp,
  ssh,
  onProgress,
  onMessage,
  onAuth,
  onAuthSuccess,
  onAuthFailure,
  onPostCheckout,
  dir,
  gitdir = dir ? join(dir, '.git') : undefined,
  url,
  corsProxy,
  ref,
  remote = 'origin',
  depth,
  since,
  exclude = [],
  relative = false,
  singleBranch = false,
  noCheckout = false,
  noTags = false,
  headers = {},
  cache = {},
  nonBlocking = false,
  batchSize = 100,
  protocolVersion = 2,
}: CloneOptions): Promise<void> {
  try {
    // Backward compatibility: Create Repository if not provided
    // Note: For clone, we can't use repo until after init, so we'll pass fs/cache/gitdir
    // and let _clone create the repo after initialization
    let fs: FileSystemProvider
    let effectiveDir: string | undefined
    let effectiveGitdir: string

    if (_repo) {
      // If repo is provided, extract what we need
      fs = _repo.fs
      effectiveDir = await _repo.getDir() || dir
      effectiveGitdir = await _repo.getGitdir()
      cache = _repo.cache
    } else {
      if (!_fs) {
        throw new MissingParameterError('fs')
      }
      // Require either dir or gitdir to be provided
      if (!dir && !gitdir) {
        throw new MissingParameterError('dir OR gitdir')
      }
      const computedGitdir = gitdir || (dir ? join(dir, '.git') : undefined)
      if (!computedGitdir) {
        throw new MissingParameterError('gitdir')
      }
      effectiveGitdir = computedGitdir
      if (!noCheckout) {
        assertParameter('dir', dir)
      }
      assertParameter('url', url)
      fs = createFileSystem(_fs)
      effectiveDir = dir
    }

    // Resolve ssh if it's a Promise
    const resolvedSsh = ssh instanceof Promise ? await ssh : ssh
    
    return await _clone({
      repo: _repo,
      fs,
      cache,
      remoteBackend,
      http,
      tcp,
      ssh: resolvedSsh,
      onProgress,
      onMessage,
      onAuth,
      onAuthSuccess,
      onAuthFailure,
      onPostCheckout,
      dir: effectiveDir,
      gitdir: effectiveGitdir,
      url,
      corsProxy,
      ref,
      remote,
      depth,
      since,
      exclude,
      relative,
      singleBranch,
      noCheckout,
      noTags,
      headers,
      nonBlocking,
      batchSize,
      protocolVersion,
    })
  } catch (err) {
    ;(err as { caller?: string }).caller = 'git.clone'
    throw err
  }
}

/**
 * Clones a repository from a remote URL
 */
export async function _clone({
  repo: _repo,
  fs: _fs,
  cache: _cache,
  remoteBackend,
  http,
  tcp,
  ssh,
  onProgress,
  onMessage,
  onAuth,
  onAuthSuccess,
  onAuthFailure,
  onPostCheckout,
  dir: _dir,
  gitdir: _gitdir,
  url,
  corsProxy,
  ref,
  remote = 'origin',
  depth,
  since,
  exclude,
  relative,
  singleBranch = false,
  noCheckout = false,
  noTags = false,
  headers,
  nonBlocking = false,
  batchSize = 100,
  protocolVersion = 2,
}: {
  repo?: Repository
  fs?: FileSystemProvider
  cache?: Record<string, unknown>
  remoteBackend?: GitRemoteBackend // Optional: use provided backend or auto-detect
  http?: HttpClient // Required for HTTP/HTTPS URLs if remoteBackend not provided
  tcp?: TcpClient // Required for git:// URLs if remoteBackend not provided
  ssh?: SshClient // Required for SSH URLs if remoteBackend not provided
  onProgress?: ProgressCallback
  onMessage?: MessageCallback
  onAuth?: AuthCallback
  onAuthSuccess?: AuthSuccessCallback
  onAuthFailure?: AuthFailureCallback
  onPostCheckout?: PostCheckoutCallback
  dir?: string
  gitdir?: string
  url: string
  corsProxy?: string
  ref?: string
  remote?: string
  depth?: number
  since?: Date
  exclude?: string[]
  relative?: boolean
  singleBranch?: boolean
  noCheckout?: boolean
  noTags?: boolean
  headers?: Record<string, string>
  nonBlocking?: boolean
  batchSize?: number
  protocolVersion?: 1 | 2
}): Promise<void> {
  // Note: For clone, we can't use repo until after init
  // So we'll work with fs/cache/gitdir and create repo after initialization
  let fs: FileSystemProvider
  let cache: Record<string, unknown>
  let dir: string | undefined
  let gitdir: string

  if (_repo) {
    fs = _repo.fs
    cache = _repo.cache
    dir = await _repo.getDir() || _dir
    gitdir = await _repo.getGitdir()
  } else {
    if (!_fs) {
      throw new MissingParameterError('fs')
    }
    if (!_gitdir) {
      throw new MissingParameterError('gitdir')
    }
    fs = createFileSystem(_fs)
    cache = _cache || {}
    dir = _dir
    gitdir = _gitdir
  }
  try {
    // Check if this is a local file path (file:// URL or absolute path)
    const isLocalPath = url.startsWith('file://') || (!url.includes('://') && (url.startsWith('/') || /^[A-Za-z]:/.test(url)))
    
    if (isLocalPath) {
      // Handle local file cloning
      let sourcePath = url
      if (url.startsWith('file://')) {
        sourcePath = url.slice(7) // Remove 'file://' prefix
        // Handle Windows paths: file:///C:/path -> C:/path
        if (sourcePath.startsWith('/') && /^[A-Za-z]:/.test(sourcePath.slice(1))) {
          sourcePath = sourcePath.slice(1)
        }
      }
      
      // Normalize path separators
      sourcePath = sourcePath.replace(/\\/g, '/')
      
      // Use native fs to access the source repository
      const sourceFs = createFileSystem(fs)
      const sourceGitDir = join(sourcePath, '.git')
      
      // Check if source repository exists
      if (!(await sourceFs.exists(sourceGitDir))) {
        throw new Error(`Source repository not found at ${sourcePath}`)
      }
      
      // Initialize target repository (non-bare if dir is provided)
      await _init({ fs, dir, gitdir, bare: false })
      
      // Add remote
      await addRemote({ fs, gitdir, remote, url, force: false })
      
      // Copy objects directory
      const sourceObjectsDir = join(sourceGitDir, 'objects')
      const targetObjectsDir = join(gitdir, 'objects')
      await copyDirectory(sourceFs, sourceObjectsDir, fs, targetObjectsDir)
      
      // Copy refs
      // CRITICAL FIX: When singleBranch is true, don't copy all refs - only copy the requested ref
      // This prevents copying unwanted branches (e.g., 'main' when we only want 'feature')
      if (singleBranch && ref) {
        // Only copy the specific ref that was requested
        // Resolve the ref to get the full path (e.g., 'feature' -> 'refs/heads/feature')
        const { resolveRef } = await import('../git/refs/readRef.ts')
        let sourceRefPath: string | null = null
        const possibleRefPaths = [
          ref,
          `refs/heads/${ref}`,
          `refs/tags/${ref}`,
          `refs/remotes/origin/${ref}`,
        ]
        
        for (const possiblePath of possibleRefPaths) {
          try {
            const sourceRefFile = join(sourceGitDir, possiblePath)
            if (await sourceFs.exists(sourceRefFile)) {
              sourceRefPath = possiblePath
              break
            }
          } catch {
            // Continue to next path
          }
        }
        
        if (sourceRefPath) {
          // Copy only the specific ref using centralized writeRef to ensure reflog
          const sourceRefFile = join(sourceGitDir, sourceRefPath)
          const refContent = await sourceFs.read(sourceRefFile, 'utf8')
          if (refContent) {
            // Parse ref content (remove newline, handle symbolic refs)
            const trimmedContent = (typeof refContent === 'string' ? refContent : refContent.toString('utf8')).trim()
            
            // Use centralized writeRef to ensure reflog entries are created
            // Import here to avoid circular dependencies
            const { writeRef, writeSymbolicRef } = await import('../git/refs/writeRef.ts')
            if (trimmedContent.startsWith('ref: ')) {
              // Symbolic ref
              const targetRef = trimmedContent.substring(5) // Remove 'ref: ' prefix
              await writeSymbolicRef({ fs, gitdir, ref: sourceRefPath, value: targetRef })
            } else {
              // Direct ref (OID)
              await writeRef({ fs, gitdir, ref: sourceRefPath, value: trimmedContent })
            }
          }
        }
      } else {
        // Copy all refs (normal multi-branch clone)
        // NOTE: Bulk copy is used for performance when copying many refs from local source.
        // However, this bypasses reflog creation. For correctness, we should iterate and
        // use writeRef for each ref, but that would be slower for repositories with many refs.
        // Native Git also doesn't create reflog entries during clone - they're created on first update.
        // For now, we use bulk copy but document this as a known limitation.
        const sourceRefsDir = join(sourceGitDir, 'refs')
        const targetRefsDir = join(gitdir, 'refs')
        await copyDirectory(sourceFs, sourceRefsDir, fs, targetRefsDir)
        
        // TODO: Consider iterating through copied refs and calling writeRef for each
        // to ensure reflog entries are created, at the cost of performance
      }
      
      // Copy packed-refs if it exists
      // NOTE: packed-refs is a bulk storage format that doesn't require reflog entries.
      // Direct copy is acceptable here as packed-refs is handled separately from loose refs.
      const sourcePackedRefs = join(sourceGitDir, 'packed-refs')
      if (await sourceFs.exists(sourcePackedRefs)) {
        const packedRefsContent = await sourceFs.read(sourcePackedRefs)
        if (packedRefsContent !== null) {
          await fs.write(join(gitdir, 'packed-refs'), packedRefsContent)
        }
      }
      
      // Don't copy HEAD from source - we'll set it after creating the branch ref
      // This ensures HEAD points to the correct branch we're cloning
      
      // Initialize empty index (don't copy from source)
      // Create an empty index file with version 2 header and proper checksum
      const { GitIndex } = await import('../git/index/GitIndex.ts')
      const emptyIndex = new GitIndex()
      const indexBuffer = await emptyIndex.toObject()
      await fs.write(join(gitdir, 'index'), indexBuffer)
      
      // Don't copy config - let _init create a fresh one, then add remote
      // (we already added remote above, so config should be set up)
      
      // Resolve the ref to checkout from source repository first
      const checkoutRef = ref || 'HEAD'
      let fetchHead: string | null = null
      
      // CRITICAL: Use resolveRef, writeRef, and writeSymbolicRef directly to avoid circular import issues with RefManager
      const { resolveRef } = await import('../git/refs/readRef.ts')
      const { writeRef, writeSymbolicRef } = await import('../git/refs/writeRef.ts')
      
      // Try to resolve from source repository first
      // CRITICAL: Try multiple resolution strategies to find the ref
      try {
        fetchHead = await resolveRef({ fs: sourceFs as any, gitdir: sourceGitDir, ref: checkoutRef })
      } catch {
        // Try to resolve as branch in source
        try {
          fetchHead = await resolveRef({ fs: sourceFs as any, gitdir: sourceGitDir, ref: `refs/heads/${checkoutRef}` })
        } catch {
          // Try to resolve as tag in source
          try {
            fetchHead = await resolveRef({ fs: sourceFs as any, gitdir: sourceGitDir, ref: `refs/tags/${checkoutRef}` })
          } catch {
            // Try to get default branch from source HEAD
            try {
              const sourceHeadContent = await sourceFs.read(join(sourceGitDir, 'HEAD'), 'utf8')
              if (typeof sourceHeadContent === 'string' && sourceHeadContent.startsWith('ref: ')) {
                const sourceRef = sourceHeadContent.slice(5).trim()
                try {
                  fetchHead = await resolveRef({ fs: sourceFs as any, gitdir: sourceGitDir, ref: sourceRef })
                } catch {
                  fetchHead = null
                }
              } else {
                fetchHead = null
              }
            } catch {
              fetchHead = null
            }
          }
        }
      }
      
      if (fetchHead === null) return
      // Determine what to checkout
      const baseRef = checkoutRef.replace('refs/heads/', '').replace('refs/tags/', '')
      // CRITICAL: Use Repository to ensure consistent fs instance
      // After init, we can use the provided repo or create a new one
      let repo: Repository
      if (_repo) {
        repo = _repo
      } else {
        const { Repository } = await import('../core-utils/Repository.ts')
        repo = await Repository.open({ fs, dir, gitdir, cache, autoDetectConfig: true })
      }
      const normalizedFs = repo.fs
      const tagRefPath = join(gitdir, 'refs', 'tags', baseRef)
      const isTag = await normalizedFs.exists(tagRefPath)
      
      // If it's a branch (not a tag), create the local branch ref pointing to fetchHead
      if (!isTag) {
        await writeRef({
          fs: normalizedFs,
          gitdir,
          ref: `refs/heads/${baseRef}`,
          value: fetchHead,
        })
      }
      
      // If noCheckout is true, just update HEAD without checking out files
      if (noCheckout) {
        // Update HEAD to point to the branch or tag
        // For tags, use the OID directly (detached HEAD)
        // For branches, use the ref name (symbolic ref)
        if (isTag) {
          await writeRef({
            fs: normalizedFs,
            gitdir,
            ref: 'HEAD',
            value: fetchHead,
          })
        } else {
          // For branches, write HEAD as a symbolic ref pointing to the branch
          await writeSymbolicRef({
            fs: normalizedFs,
            gitdir,
            ref: 'HEAD',
            value: `refs/heads/${baseRef}`,
          })
        }
      } else {
        // CRITICAL: Set up HEAD before checkout to ensure it exists
        // This prevents "Could not find HEAD" errors during checkout
        if (isTag) {
          // For tags, set HEAD to point to the tag OID (detached HEAD)
          await writeRef({
            fs: normalizedFs,
            gitdir,
            ref: 'HEAD',
            value: fetchHead,
          })
        } else {
          // For branches, set HEAD as a symbolic ref pointing to the branch
          await writeSymbolicRef({
            fs: normalizedFs,
            gitdir,
            ref: 'HEAD',
            value: `refs/heads/${baseRef}`,
          })
        }
        
        // Checkout (use force to overwrite any existing files)
        // CRITICAL: Set noUpdateHead: true since we already set HEAD above
        // This prevents checkout from trying to update HEAD and potentially removing it
        // Use repo.cache for consistency
        const effectiveCache = repo.cache
        if (isTag) {
          await _checkout({
            fs: normalizedFs,
            cache: effectiveCache,
            onProgress,
            onPostCheckout,
            dir: dir!,
            gitdir,
            ref: `refs/tags/${baseRef}`,
            remote,
            noCheckout: false,
            noUpdateHead: true, // We already set HEAD above
            nonBlocking,
            batchSize,
            force: true, // Force checkout to overwrite any existing files
          })
        } else {
          await _checkout({
            fs: normalizedFs,
            cache: effectiveCache,
            onProgress,
            onPostCheckout,
            dir: dir!,
            gitdir,
            ref: baseRef,
            remote,
            noCheckout: false,
            noUpdateHead: true, // We already set HEAD above
            track: !singleBranch, // When singleBranch is true, don't set up tracking (prevents creating extra branches)
            nonBlocking,
            batchSize,
            force: true, // Force checkout to overwrite any existing files
          })
        }
      }
      
      return
    }
    
    // Initialize repository (non-bare if dir is provided)
    await _init({ fs, dir, gitdir, bare: false })
    
    // Initialize empty index file (required for checkout)
    const { GitIndex } = await import('../git/index/GitIndex.ts')
    const emptyIndex = new GitIndex()
    const indexBuffer = await emptyIndex.toObject()
    await fs.write(join(gitdir, 'index'), indexBuffer)
    
    // Add remote (allow overwriting if URL matches)
    try {
      await addRemote({ fs, gitdir, remote, url, force: false })
    } catch (err) {
      // If remote already exists with different URL, use force to overwrite
      if ((err as { code?: string }).code === 'AlreadyExistsError') {
        await addRemote({ fs, gitdir, remote, url, force: true })
      } else {
        throw err
      }
    }
    
    // Set corsProxy if provided
    if (corsProxy) {
      // CRITICAL: Use Repository to ensure consistent config access
      // After init, we can use the provided repo or create a new one
      let repo: Repository
      if (_repo) {
        repo = _repo
      } else {
        const { Repository } = await import('../core-utils/Repository.ts')
        repo = await Repository.open({ fs, dir, gitdir, cache, autoDetectConfig: true })
      }
      const configService = await repo.getConfig()
      await configService.set('http.corsProxy', corsProxy, 'local')
    }
    
    // Fetch from remote
    console.log(`[Git Protocol] Starting clone operation from ${url}`)
    // After init, we can use the provided repo or create a new one for fetch
    let repoForFetch: Repository | undefined
    if (_repo) {
      repoForFetch = _repo
    } else {
      const { Repository } = await import('../core-utils/Repository.ts')
      repoForFetch = await Repository.open({ fs, dir, gitdir, cache, autoDetectConfig: true })
    }
    
    const { defaultBranch, fetchHead, fetchHeadDescription } = await _fetch({
      repo: repoForFetch,
      fs,
      cache,
      remoteBackend,
      http,
      tcp,
      ssh,
      onProgress,
      onMessage,
      onAuth,
      onAuthSuccess,
      onAuthFailure,
      gitdir,
      ref,
      remote,
      corsProxy,
      depth,
      since,
      exclude,
      relative,
      singleBranch,
      headers,
      tags: !noTags,
      protocolVersion,
    })
    
    // DEBUG: Log fetch results
    console.log('[DEBUG clone] Fetch complete.')
    console.log(`[DEBUG clone] fetchHead: ${fetchHead}`)
    console.log(`[DEBUG clone] defaultBranch: ${defaultBranch}`)
    console.log(`[DEBUG clone] fetchHeadDescription: ${fetchHeadDescription}`)
    console.log(`[DEBUG clone] DEBUG_CLONE_REFS env: ${process.env.DEBUG_CLONE_REFS}`)
    
    if (fetchHead === null) {
      console.log('[DEBUG clone] fetchHead is null, returning early.')
      return
    }
    
    // Note: The fetched object should be available in the packfile that was just written.
    // We don't need to verify it here because checkout will handle reading it.
    
    // CRITICAL: Use Repository to ensure consistent fs instance
    // Reuse the repo we already have
    const repo = repoForFetch
    const normalizedFs = repo.fs
    
    // CRITICAL: Import ref functions directly to avoid circular import issues with RefManager
    const { resolveRef: resolveRefRemote } = await import('../git/refs/readRef.ts')
    const { writeRef: writeRefRemote, writeSymbolicRef: writeSymbolicRefRemote } = await import('../git/refs/writeRef.ts')
    
    // Determine what to checkout
    // When singleBranch is true, only use the explicitly provided ref, not defaultBranch
    // This ensures we only create the branch that was requested
    let checkoutRef = ref || (singleBranch ? null : defaultBranch)
    console.log(`[DEBUG clone] Determined checkoutRef: ${checkoutRef} (singleBranch: ${singleBranch})`)
    
    // If singleBranch is true and we have a ref, don't search for default branches
    // This prevents creating extra branches when singleBranch is enabled
    if (!singleBranch) {
      // If no ref specified and defaultBranch is not available, try to find a default branch
      // from the remote refs (e.g., 'master', 'main', 'trunk')
      if (!checkoutRef && fetchHead) {
        // Try common default branch names
        const commonDefaultBranches = ['master', 'main', 'trunk', 'develop', 'default']
        for (const branchName of commonDefaultBranches) {
          const remoteBranchRef = `refs/remotes/${remote}/${branchName}`
          try {
            const branchOid = await resolveRefRemote({ fs: normalizedFs, gitdir, ref: remoteBranchRef })
            if (branchOid === fetchHead) {
              checkoutRef = branchName
              console.log(`[DEBUG clone] Found default branch '${branchName}' from remote refs`)
              break
            }
          } catch {
            // Branch doesn't exist, try next
          }
        }
      }
    }
    
    // If still no checkoutRef but we have fetchHead, try to create a branch
    // First, try to find any remote branch that matches fetchHead
    // Skip this if singleBranch is true and we already have a ref
    if (!checkoutRef && fetchHead && !(singleBranch && ref)) {
      // List all remote branches and find one that matches fetchHead
      try {
        const remoteRefsDir = join(gitdir, 'refs', 'remotes', remote)
        const remoteBranches: string[] = []
        
        // Recursively read remote refs directory
        const readRemoteRefs = async (dir: string, prefix: string = ''): Promise<void> => {
          try {
            const entries = await normalizedFs.readdir(dir)
            if (!entries) return
            for (const entry of entries) {
              const fullPath = join(dir, entry)
              const stat = await normalizedFs.lstat(fullPath)
              if (stat && stat.isDirectory()) {
                await readRemoteRefs(fullPath, prefix ? `${prefix}/${entry}` : entry)
              } else {
                const refPath = prefix ? `${prefix}/${entry}` : entry
                remoteBranches.push(refPath)
              }
            }
          } catch {
            // Directory doesn't exist or can't be read
          }
        }
        
        await readRemoteRefs(remoteRefsDir)
        
        // Find a branch that matches fetchHead
        for (const branchName of remoteBranches) {
          try {
            const remoteBranchRef = `refs/remotes/${remote}/${branchName}`
            const branchOid = await resolveRefRemote({ fs: normalizedFs, gitdir, ref: remoteBranchRef })
            if (branchOid === fetchHead) {
              checkoutRef = branchName
              console.log(`[DEBUG clone] Found matching branch '${branchName}' from remote refs`)
              break
            }
          } catch {
            // Branch doesn't exist or can't be resolved, try next
          }
        }
      } catch {
        // Can't read remote refs, will fall back to creating a branch
      }
      
      // If still no checkoutRef, create a branch with a default name
      if (!checkoutRef && fetchHead) {
        // Use 'master' as the default branch name (common default)
        checkoutRef = 'master'
        console.log(`[DEBUG clone] No branch found, using default branch name '${checkoutRef}'`)
      }
    }
    
    if (!checkoutRef) {
      console.log('[DEBUG clone] No ref to checkout, finishing clone.')
      return
    }
    
    // Remove 'refs/heads/' or 'refs/tags/' prefix if present to get the base name
    const baseRef = checkoutRef.replace('refs/heads/', '').replace('refs/tags/', '')
    console.log(`[DEBUG clone] baseRef: ${baseRef}`)
    
    // Check if ref is a tag by checking if the tag ref file exists
    const tagRefPath = join(gitdir, 'refs', 'tags', baseRef)
    const isTag = await normalizedFs.exists(tagRefPath)
    console.log(`[DEBUG clone] isTag: ${isTag}`)
    
    // If it's a branch (not a tag), create the local branch ref pointing to fetchHead
    if (!isTag) {
      console.log(`[DEBUG clone] Attempting to write local branch 'refs/heads/${baseRef}' to point to ${fetchHead}`)
      
      // DEBUG: Check what branches exist before creating
      if (process.env.DEBUG_CLONE_REFS === 'true') {
        try {
          const { listRefs } = await import('../git/refs/listRefs.ts')
          const existingBranches = await listRefs({ fs: normalizedFs, gitdir, filepath: 'refs/heads' })
          console.log(`[DEBUG clone] Existing branches BEFORE creating ${baseRef}:`, existingBranches)
        } catch (e) {
          console.log(`[DEBUG clone] Could not list branches before creation:`, e)
        }
      }
      
      await writeRefRemote({
        fs: normalizedFs,
        gitdir,
        ref: `refs/heads/${baseRef}`,
        value: fetchHead,
      })
      console.log(`[DEBUG clone] Successfully wrote local branch 'refs/heads/${baseRef}'.`)
      
      // DEBUG: Check what branches exist after creating
      if (process.env.DEBUG_CLONE_REFS === 'true') {
        try {
          const { listRefs } = await import('../git/refs/listRefs.ts')
          const existingBranches = await listRefs({ fs: normalizedFs, gitdir, filepath: 'refs/heads' })
          console.log(`[DEBUG clone] Existing branches AFTER creating ${baseRef}:`, existingBranches)
        } catch (e) {
          console.log(`[DEBUG clone] Could not list branches after creation:`, e)
        }
      }
      
      // Verify the ref was written correctly
      try {
        const localOid = await resolveRefRemote({ fs: normalizedFs, gitdir, ref: `refs/heads/${baseRef}` })
        console.log(`[DEBUG clone] Verified local branch 'refs/heads/${baseRef}' exists and points to ${localOid}`)
      } catch (e) {
        console.error(`[DEBUG clone] FAILED to verify local branch 'refs/heads/${baseRef}':`, e)
      }
    }
    
    // If noCheckout is true, just update HEAD without checking out files
    if (noCheckout) {
      // Update HEAD to point to the branch or tag
      // For tags, use the OID directly (detached HEAD)
      // For branches, use the ref name (symbolic ref)
      if (isTag) {
        await writeRefRemote({
          fs: normalizedFs,
          gitdir,
          ref: 'HEAD',
          value: fetchHead,
        })
      } else {
        // For branches, write HEAD as a symbolic ref pointing to the branch
        await writeSymbolicRefRemote({
          fs: normalizedFs,
          gitdir,
          ref: 'HEAD',
          value: `refs/heads/${baseRef}`,
        })
      }
      console.log(`[DEBUG clone] Updated HEAD without checkout (noCheckout=true)`)
    } else {
      // Ensure dir is provided when noCheckout is false
      if (!dir) {
        throw new Error('dir is required when noCheckout is false')
      }
      
      // CRITICAL: Set up HEAD before checkout to ensure it exists
      // This prevents "Could not find HEAD" errors during checkout
      if (isTag) {
        // For tags, set HEAD to point to the tag OID (detached HEAD)
        await writeRefRemote({
          fs: normalizedFs,
          gitdir,
          ref: 'HEAD',
          value: fetchHead,
        })
      } else {
        // For branches, set HEAD as a symbolic ref pointing to the branch
        await writeSymbolicRefRemote({
          fs: normalizedFs,
          gitdir,
          ref: 'HEAD',
          value: `refs/heads/${baseRef}`,
        })
      }
      
      // Use repo.cache which has been updated during fetch
      // Don't clear instance cache - we want to reuse the same repo instance
      // to ensure the cache is properly shared
      const effectiveCache = repo.cache
      
      // If it's a tag, checkout the tag directly (detached HEAD)
      // Otherwise checkout as a branch
      if (isTag) {
        // For tags, checkout the tag ref directly
        console.log(`[DEBUG clone] Attempting to checkout tag ref: 'refs/tags/${baseRef}'`)
        await _checkout({
          fs: normalizedFs,
          cache: effectiveCache,
          onProgress,
          onPostCheckout,
          dir,
          gitdir,
          ref: `refs/tags/${baseRef}`,
          remote,
          noCheckout: false,
          noUpdateHead: false,
          nonBlocking,
          batchSize,
          force: true, // Force checkout to overwrite any existing files
        })
        console.log(`[DEBUG clone] Successfully checked out tag 'refs/tags/${baseRef}'`)
      } else {
        // For branches, checkout normally
        // CRITICAL FIX: When singleBranch is true, checkout the exact commit OID
        // instead of the branch name to prevent checkout from creating branches
        // from remote refs that weren't fetched
        if (singleBranch) {
          // When singleBranch is true, we've already created the local branch
          // and set HEAD. Now just checkout the exact commit to populate workdir/index.
          // This prevents checkout from trying to be "smart" about creating branches.
          console.log(`[DEBUG clone] singleBranch=true: Checking out exact commit ${fetchHead} (noUpdateHead=true)`)
          await _checkout({
            fs: normalizedFs,
            cache: effectiveCache,
            onProgress,
            onPostCheckout,
            dir,
            gitdir,
            ref: fetchHead, // Check out the exact commit OID, not the branch name
            remote,
            noCheckout: false,
            noUpdateHead: true, // We already set HEAD manually above
            track: false, // No tracking needed for singleBranch
            nonBlocking,
            batchSize,
            force: true, // Force checkout to overwrite any existing files
          })
          console.log(`[DEBUG clone] Successfully checked out commit ${fetchHead} for singleBranch clone`)
          
          // DEBUG: After checkout, check what branches exist
          if (process.env.DEBUG_CLONE_REFS === 'true') {
            try {
              const { listRefs } = await import('../git/refs/listRefs.ts')
              const existingBranches = await listRefs({ fs: normalizedFs, gitdir, filepath: 'refs/heads' })
              console.log(`[DEBUG clone] Branches AFTER checkout (singleBranch):`, existingBranches)
              
              // Also check reflog for branch creations
              const { readLog } = await import('../git/logs/readLog.ts')
              for (const branch of existingBranches) {
                try {
                  const reflog = await readLog({ fs: normalizedFs, gitdir, ref: branch, parsed: true })
                  if (reflog.length > 0) {
                    console.log(`[DEBUG clone] Reflog for ${branch}:`, reflog.map((e: any) => ({
                      oldOid: e.oldOid.substring(0, 8),
                      newOid: e.newOid.substring(0, 8),
                      message: e.message,
                      author: e.author,
                    })))
                  }
                } catch (e) {
                  // Reflog might not exist
                }
              }
            } catch (e) {
              console.log(`[DEBUG clone] Could not list branches after checkout:`, e)
            }
          }
        } else {
          // Normal multi-branch clone: checkout by branch name
          console.log(`[DEBUG clone] Attempting to checkout branch ref: '${baseRef}'`)
          await _checkout({
            fs: normalizedFs,
            cache: effectiveCache,
            onProgress,
            onPostCheckout,
            dir,
            gitdir,
            ref: baseRef,
            remote,
            noCheckout: false,
            noUpdateHead: false,
            track: true, // Normal tracking for multi-branch clones
            nonBlocking,
            batchSize,
            force: true, // Force checkout to overwrite any existing files
          })
          console.log(`[DEBUG clone] Successfully checked out branch '${baseRef}'`)
        }
      }
    }
  } catch (err) {
    // Remove partial local repository on error
    // Ignore any error as we are already failing.
    // The catch is necessary so the original error is not masked.
    await fs.rmdir(gitdir, { recursive: true }).catch(() => undefined)
    throw err
  }
}

/**
 * Recursively copy a directory from source to target
 */
async function copyDirectory(
  sourceFs: ReturnType<typeof createFileSystem>,
  sourcePath: string,
  targetFs: FileSystemProvider,
  targetPath: string
): Promise<void> {
  const normalizedTargetFs = createFileSystem(targetFs)
  
  // Create target directory
  // FileSystem.mkdir already implements recursive directory creation
  await normalizedTargetFs.mkdir(targetPath)
  
  // List source directory
  const entries = await sourceFs.readdir(sourcePath)
  if (!entries) return
  
  for (const entry of entries) {
    const sourceEntryPath = join(sourcePath, entry)
    const targetEntryPath = join(targetPath, entry)
    
    const stats = await sourceFs.lstat(sourceEntryPath)
    if (stats && stats.isDirectory()) {
      // Recursively copy subdirectory
      await copyDirectory(sourceFs, sourceEntryPath, targetFs, targetEntryPath)
    } else {
      // Copy file
      const content = await sourceFs.read(sourceEntryPath)
      if (content !== null) {
        await normalizedTargetFs.write(targetEntryPath, content)
      }
    }
  }
}

