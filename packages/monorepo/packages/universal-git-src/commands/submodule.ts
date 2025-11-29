import { MissingParameterError } from "../errors/MissingParameterError.ts"
// import { parseGitmodules, initSubmodule, updateSubmoduleUrl, getSubmoduleByName, getSubmoduleGitdir } from "../git/worktree/SubmoduleManager.ts"
import { normalizeCommandArgs } from '../utils/commandHelpers.ts'
import { assertParameter } from "../utils/assertParameter.ts"
import { join } from "../utils/join.ts"
import { Repository } from "../core-utils/Repository.ts"
import { readObject } from "../git/objects/readObject.ts"
import type { FileSystemProvider } from "../models/FileSystem.ts"
import type { HttpClient } from "../git/remote/types.ts"

/**
 * Submodule management API
 * Provides high-level operations for managing Git submodules
 */
export type SubmoduleStatus = {
  name: string
  path: string
  url: string
  expectedOid: string
  actualOid: string | null
  status: 'uninitialized' | 'mismatch' | 'match' | 'missing'
}

export async function submodule({
  repo: _repo,
  fs: _fs,
  dir,
  gitdir = dir ? join(dir, '.git') : undefined,
  init,
  update,
  status: statusFlag,
  sync: syncFlag,
  recursive = false,
  name,
  url,
  http,
  cache = {},
}: {
  repo?: Repository
  fs?: FileSystemProvider
  dir?: string
  gitdir?: string
  init?: boolean
  update?: boolean
  status?: boolean
  sync?: boolean
  recursive?: boolean
  name?: string
  url?: string
  http?: HttpClient
  cache?: Record<string, unknown>
}): Promise<unknown> {
  try {
    const { repo, fs, dir: effectiveDir, gitdir: effectiveGitdir, cache: effectiveCache } = await normalizeCommandArgs({
      repo: _repo,
      fs: _fs,
      dir,
      gitdir,
      cache,
      init,
      update,
      status: statusFlag,
      sync: syncFlag,
      recursive,
      name,
      url,
      http,
    })

    // dir is required for submodule operations
    if (!effectiveDir) {
      throw new Error('dir is required for submodule operations')
    }
    // TypeScript guard - effectiveGitdir is always defined after normalizeCommandArgs
    const finalEffectiveGitdir: string = effectiveGitdir
    const finalDir: string = effectiveDir

    // List submodules (default behavior when no operation specified)
    if (!init && !update && !statusFlag && !syncFlag && !name) {
      const submodules = await parseGitmodules({ fs, dir: effectiveDir })
      return Array.from(submodules.entries()).map(([name, info]) => ({
        name,
        ...info,
      }))
    }

    // Get submodule status
    if (statusFlag) {
      const { resolveRef } = await import('../git/refs/readRef.ts')
      const { resolveFilepath } = await import('../utils/resolveFilepath.ts')
      
      // Get parent repository's HEAD tree
      const headOid = await resolveRef({ fs: repo.fs, gitdir: finalEffectiveGitdir, ref: 'HEAD' })
      const { object: commitObject } = await readObject({ fs: repo.fs, cache: repo.cache, gitdir: finalEffectiveGitdir, oid: headOid })
      const { parse: parseCommit } = await import('../core-utils/parsers/Commit.ts')
      const commit = parseCommit(commitObject as Buffer)
      const treeOid = commit.tree
      
      // Get all submodules or specific one
      let submodules: Array<{ name: string; path: string; url: string; branch?: string }>
      if (name) {
        const submodule = await getSubmoduleByName({ fs, dir: effectiveDir, name })
        if (!submodule) {
          throw new Error(`Submodule ${name} not found in .gitmodules`)
        }
        submodules = [submodule]
      } else {
        const parsed = await parseGitmodules({ fs, dir: effectiveDir })
        submodules = Array.from(parsed.entries()).map(([name, info]) => ({ name, ...info }))
      }
      
      const results: SubmoduleStatus[] = []
      
      for (const submodule of submodules) {
        if (!submodule) continue
        
        // Get expected commit OID from parent tree
        let expectedOid: string
        try {
          expectedOid = await resolveFilepath({ fs: repo.fs, cache: effectiveCache, gitdir: finalEffectiveGitdir, oid: treeOid, filepath: submodule.path })
        } catch {
          // Submodule not in tree - might be uninitialized
          results.push({
            name: submodule.name,
            path: submodule.path,
            url: submodule.url,
            expectedOid: '',
            actualOid: null,
            status: 'missing',
          })
          continue
        }
        
        // Get actual commit OID from submodule
        const submoduleDir = join(finalDir, submodule.path)
        const submoduleGitdir = getSubmoduleGitdir({ gitdir: finalEffectiveGitdir, path: submodule.path })
        
        let actualOid: string | null = null
        let status: SubmoduleStatus['status'] = 'uninitialized'
        
        // Check if submodule directory and gitdir exist
        const submoduleDirExists = await fs.exists(submoduleDir)
        const submoduleGitdirExists = await fs.exists(submoduleGitdir)
        
        if (submoduleDirExists && submoduleGitdirExists) {
          try {
            // Try to resolve submodule's HEAD
            actualOid = await resolveRef({ fs: repo.fs, gitdir: submoduleGitdir, ref: 'HEAD' })
            status = actualOid === expectedOid ? 'match' : 'mismatch'
          } catch {
            // Submodule exists but HEAD can't be resolved
            status = 'uninitialized'
          }
        } else {
          status = 'uninitialized'
        }
        
        results.push({
          name: submodule.name,
          path: submodule.path,
          url: submodule.url,
          expectedOid,
          actualOid,
          status,
        })
      }
      
      return name ? results[0] : results
    }

    // Initialize submodule
    if (init) {
      if (!name) {
        throw new Error('name is required for submodule init')
      }
      await initSubmodule({ fs, dir: finalDir, gitdir: finalEffectiveGitdir, name })
      return { initialized: name }
    }

    // Update submodule
    if (update) {
      if (!name) {
        throw new Error('name is required for submodule update')
      }
      
      // Get submodule info from .gitmodules
      const submodule = await getSubmoduleByName({ fs, dir: finalDir, name })
      if (!submodule) {
        throw new Error(`Submodule ${name} not found in .gitmodules`)
      }
      
      // Step 1: Read parent repository's HEAD tree to find the commit OID for the submodule entry
      const { resolveRef } = await import('../git/refs/readRef.ts')
      const { resolveFilepath } = await import('../utils/resolveFilepath.ts')
      
      const headOid = await resolveRef({ fs: repo.fs, gitdir: finalEffectiveGitdir, ref: 'HEAD' })
      const { object: commitObject } = await readObject({ fs: repo.fs, cache: repo.cache, gitdir: finalEffectiveGitdir, oid: headOid })
      const { parse: parseCommit } = await import('../core-utils/parsers/Commit.ts')
      const commit = parseCommit(commitObject as Buffer)
      const treeOid = commit.tree
      
      // Find the submodule entry in the tree
      let submoduleCommitOid: string
      try {
        submoduleCommitOid = await resolveFilepath({ fs: repo.fs, cache: effectiveCache, gitdir: finalEffectiveGitdir, oid: treeOid, filepath: submodule.path })
      } catch (err) {
        throw new Error(`Submodule ${name} (path: ${submodule.path}) not found in HEAD tree`)
      }
      
      // Step 2: Check if submodule directory exists
      const submoduleDir = join(finalDir, submodule.path)
      const submoduleGitdir = getSubmoduleGitdir({ gitdir: finalEffectiveGitdir, path: submodule.path })
      const submoduleGitFile = join(submoduleDir, '.git')
      
      const submoduleDirExists = await fs.exists(submoduleDir)
      const submoduleGitdirExists = await fs.exists(submoduleGitdir)
      
      // Step 3: If submodule doesn't exist, clone it
      if (!submoduleDirExists || !submoduleGitdirExists) {
        if (!http) {
          throw new Error('http client is required for submodule clone')
        }
        
        // Ensure parent directory exists
        const parentDir = submoduleDir.substring(0, submoduleDir.lastIndexOf('/'))
        if (parentDir) {
          await fs.mkdir(parentDir)
        }
        
        // Clone the submodule into .git/modules/<path>
        const { clone } = await import('./clone.ts')
        await clone({
          fs: repo.fs,
          http,
          dir: submoduleDir,
          gitdir: submoduleGitdir,
          url: submodule.url,
          noCheckout: false,
          cache: effectiveCache,
        })
        
        // After clone, create .git file pointing to the gitdir
        // Use absolute path for simplicity (Git supports both absolute and relative paths)
        // The gitdir is at <parent-gitdir>/modules/<submodule.path>
        await fs.write(submoduleGitFile, `gitdir: ${submoduleGitdir}\n`, 'utf8')
        
        // Now checkout the specific commit
        const { checkout } = await import('./checkout.ts')
        await checkout({
          fs: repo.fs,
          dir: submoduleDir,
          gitdir: submoduleGitdir,
          ref: submoduleCommitOid,
          noUpdateHead: false,
        })
      } else {
        // Submodule exists, just checkout the correct commit
        // Step 4: Checkout the specific commit OID in the submodule
        const { checkout } = await import('./checkout.ts')
        await checkout({
          fs: repo.fs,
          dir: submoduleDir,
          gitdir: submoduleGitdir,
          ref: submoduleCommitOid,
          noUpdateHead: false,
        })
      }
      
      // Step 5: If recursive, update nested submodules
      if (recursive) {
        try {
          // Check if submodule has its own .gitmodules file
          const submoduleGitmodules = join(submoduleDir, '.gitmodules')
          const submoduleGitmodulesExists = await fs.exists(submoduleGitmodules)
          
          if (submoduleGitmodulesExists) {
            // Submodule has nested submodules, recursively update them
            const nestedSubmodules = await parseGitmodules({ fs, dir: submoduleDir })
            
            for (const [nestedName, nestedInfo] of nestedSubmodules.entries()) {
              // Recursively update nested submodule
              // Import the function to avoid circular reference issues
              const { submodule: submoduleFn } = await import('./submodule.ts')
              await submoduleFn({
                fs: repo.fs,
                dir: submoduleDir,
                gitdir: submoduleGitdir,
                update: true,
                recursive: true, // Continue recursion
                name: nestedName,
                http,
                cache: effectiveCache,
              })
            }
          }
        } catch (err) {
          // If recursive update fails, log but don't fail the main update
          // This matches Git's behavior - it continues even if nested submodules fail
          console.warn(`Failed to recursively update submodules in ${submodule.path}:`, err)
        }
      }
      
      return { updated: name, commitOid: submoduleCommitOid }
    }

    // Sync submodule URLs
    if (syncFlag) {
      const { ConfigAccess } = await import('../utils/configAccess.ts')
      const configAccess = new ConfigAccess(fs, finalEffectiveGitdir)
      
      // Get all submodules or specific one
      let submodules: Array<{ name: string; path: string; url: string; branch?: string }>
      if (name) {
        const submodule = await getSubmoduleByName({ fs, dir: effectiveDir, name })
        if (!submodule) {
          throw new Error(`Submodule ${name} not found in .gitmodules`)
        }
        submodules = [submodule]
      } else {
        const parsed = await parseGitmodules({ fs, dir: effectiveDir })
        submodules = Array.from(parsed.entries()).map(([name, info]) => ({ name, ...info }))
      }
      
      const synced: Array<{ name: string; url: string }> = []
      
      for (const submodule of submodules) {
        // Update URL in .git/config from .gitmodules
        // This overwrites any existing URL in config (sync behavior)
        await configAccess.setConfigValue(`submodule.${submodule.name}.url`, submodule.url, 'local')
        
        // If submodule is initialized (exists), also update its remote URL
        const submoduleDir = join(finalDir, submodule.path)
        const submoduleGitdir = getSubmoduleGitdir({ gitdir: finalEffectiveGitdir, path: submodule.path })
        
        const submoduleDirExists = await fs.exists(submoduleDir)
        const submoduleGitdirExists = await fs.exists(submoduleGitdir)
        
        if (submoduleDirExists && submoduleGitdirExists) {
          // Submodule is initialized, update its remote URL
          try {
            const submoduleConfigAccess = new ConfigAccess(fs, submoduleGitdir)
            // Update the 'origin' remote URL (default remote for submodules)
            await submoduleConfigAccess.setConfigValue('remote.origin.url', submodule.url, 'local')
          } catch {
            // If submodule config update fails, continue (submodule might be corrupted)
            // The parent config update already succeeded
          }
        }
        
        synced.push({ name: submodule.name, url: submodule.url })
      }
      
      return name ? synced[0] : synced
    }

    // Update submodule URL
    if (url && name) {
      await updateSubmoduleUrl({ fs, dir: finalDir, name, url })
      return { updated: name, url }
    }

    throw new Error('Invalid submodule operation: specify init, update, status, sync, or provide name/url')
  } catch (err) {
    ;(err as { caller?: string }).caller = 'git.submodule'
    throw err
  }
}

