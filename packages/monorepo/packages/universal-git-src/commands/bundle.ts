/**
 * Git Bundle Command
 * 
 * Creates, verifies, and unbundles Git bundle files
 */

import { MissingParameterError } from '../errors/MissingParameterError.ts'
import { createFileSystem } from '../utils/createFileSystem.ts'
import { assertParameter } from '../utils/assertParameter.ts'
import { join } from '../utils/join.ts'
import { normalizeCommandArgs } from '../utils/commandHelpers.ts'
import { listRefs } from '../git/refs/listRefs.ts'
import { listObjects } from './listObjects.ts'
import { _pack } from './pack.ts'
import { writeBundle } from '../git/bundle/writeBundle.ts'
import { parseBundle, parseBundleHeader } from '../git/bundle/parseBundle.ts'
import { readObject } from '../git/objects/readObject.ts'
import { writeRef } from '../git/refs/writeRef.ts'
import { readRef } from '../git/refs/readRef.ts'
import { detectObjectFormat } from '../utils/detectObjectFormat.ts'
import { Repository } from '../core-utils/Repository.ts'
import type { FileSystemProvider } from '../models/FileSystem.ts'
import { UniversalBuffer } from '../utils/UniversalBuffer.ts'
import type { BaseCommandOptions } from '../types/commandOptions.ts'

export type BundleOptions = BaseCommandOptions & {
  filepath: string
  refs?: string[]
  all?: boolean
  version?: 2 | 3
}

export interface BundleResult {
  filepath: string
  refs: Map<string, string>
  objectCount: number
}

/**
 * Creates a Git bundle file
 * 
 * @param options - Bundle creation options
 * @returns Bundle result with filepath, refs, and object count
 * 
 * @example
 * ```typescript
 * const result = await bundle({
 *   fs,
 *   gitdir: '/path/to/.git',
 *   filepath: '/path/to/repo.bundle',
 *   refs: ['refs/heads/master', 'refs/tags/v1.0.0']
 * })
 * ```
 */
export async function bundle({
  repo: _repo,
  fs: _fs,
  dir,
  gitdir = dir ? join(dir, '.git') : undefined,
  filepath,
  refs: _refs,
  all = false,
  version = 2,
  cache = {},
}: BundleOptions): Promise<BundleResult> {
  const { repo, fs, gitdir: effectiveGitdir } = await normalizeCommandArgs({
    repo: _repo,
    fs: _fs,
    dir,
    gitdir,
    cache,
    filepath,
    refs: _refs,
    all,
    version,
  })

  assertParameter('filepath', filepath)
  
  // Detect object format
  const objectFormat = await detectObjectFormat(fs, effectiveGitdir)
  
  // Get refs to bundle
  let refsToBundle: string[]
  if (all) {
    // Get all refs by listing refs/heads, refs/tags, etc.
    const heads = await listRefs({ fs, gitdir: effectiveGitdir, filepath: 'refs/heads' })
    const tags = await listRefs({ fs, gitdir: effectiveGitdir, filepath: 'refs/tags' })
    const remotes = await listRefs({ fs, gitdir: effectiveGitdir, filepath: 'refs/remotes' })
    
    refsToBundle = [
      ...heads.map(h => `refs/heads/${h}`),
      ...tags.map(t => `refs/tags/${t}`),
      ...remotes.map(r => `refs/remotes/${r}`),
    ]
    
    // Also include HEAD if it's a symbolic ref
    try {
      const headRef = await readRef({ fs, gitdir: effectiveGitdir, ref: 'HEAD' })
      if (headRef && headRef.startsWith('ref: ')) {
        const headTarget = headRef.slice(5)
        if (!refsToBundle.includes(headTarget)) {
          refsToBundle.push(headTarget)
        }
      }
    } catch {
      // HEAD not found, that's okay
    }
  } else if (_refs && _refs.length > 0) {
    refsToBundle = _refs
  } else {
    // Default: bundle HEAD
    try {
      const headRef = await readRef({ fs, gitdir: effectiveGitdir, ref: 'HEAD' })
      if (headRef && headRef.startsWith('ref: ')) {
        refsToBundle = [headRef.slice(5)] // Remove "ref: " prefix
      } else {
        refsToBundle = ['HEAD']
      }
    } catch {
      throw new Error('No refs specified and HEAD not found')
    }
  }
  
  // Resolve refs to OIDs
  const refsMap = new Map<string, string>()
  for (const ref of refsToBundle) {
    try {
      const oid = await readRef({ fs, gitdir: effectiveGitdir, ref })
      if (!oid) {
        throw new Error(`Ref not found: ${ref}`)
      }
      refsMap.set(ref, oid)
    } catch (err: any) {
      if (err.message && err.message.includes('Ref not found')) {
        throw err
      }
      throw new Error(`Ref not found: ${ref}`)
    }
  }
  
  if (refsMap.size === 0) {
    throw new Error('No refs to bundle')
  }
  
  // Collect all objects reachable from these refs
  const oids = Array.from(refsMap.values())
  const allObjects = await listObjects({ repo, fs, cache, gitdir: effectiveGitdir, oids })
  
  // Create packfile
  const packfileBuffers = await _pack({
    fs,
    cache,
    gitdir: effectiveGitdir,
    oids: Array.from(allObjects),
  })
  
  // Concatenate packfile buffers
  const packfileLength = packfileBuffers.reduce((sum, buf) => sum + buf.length, 0)
  const packfile = UniversalBuffer.alloc(packfileLength)
  let offset = 0
  for (const buf of packfileBuffers) {
    buf.copy(packfile, offset)
    offset += buf.length
  }
  
  // Create bundle file
  const bundleData = await writeBundle(refsMap, packfile, version)
  
  // Write bundle to file
  await fs.write(filepath, bundleData)
  
  return {
    filepath,
    refs: refsMap,
    objectCount: allObjects.size,
  }
}

export interface VerifyBundleOptions {
  fs: FileSystemProvider
  filepath: string
  cache?: Record<string, unknown>
}

export interface VerifyBundleResult {
  valid: boolean
  version: 2 | 3
  refs: Array<{ ref: string; oid: string }>
  error?: string
}

/**
 * Verifies a Git bundle file
 * 
 * @param options - Bundle verification options
 * @returns Verification result
 * 
 * @example
 * ```typescript
 * const result = await verifyBundle({
 *   fs,
 *   filepath: '/path/to/repo.bundle'
 * })
 * 
 * if (result.valid) {
 *   console.log(`Bundle is valid with ${result.refs.length} refs`)
 * } else {
 *   console.error(`Bundle is invalid: ${result.error}`)
 * }
 * ```
 */
export async function verifyBundle({
  fs: _fs,
  filepath,
  cache = {},
}: VerifyBundleOptions): Promise<VerifyBundleResult> {
  assertParameter('fs', _fs)
  assertParameter('filepath', filepath)
  
  const fs = createFileSystem(_fs)
  
  try {
    // Read bundle file
    const bundleData = await fs.read(filepath)
    const buffer = UniversalBuffer.from(bundleData)
    
    // Parse bundle header
    const header = await parseBundleHeader(buffer)
    
    // Extract packfile
    const { extractPackfileFromBundle } = await import('../git/bundle/parseBundle.ts')
    const packfile = await extractPackfileFromBundle(buffer)
    
    // Verify packfile format (starts with "PACK")
    if (packfile.subarray(0, 4).toString('utf8') !== 'PACK') {
      return {
        valid: false,
        version: header.version,
        refs: header.refs.map(r => ({ ref: r.ref, oid: r.oid })),
        error: 'Invalid packfile format',
      }
    }
    
    // Verify packfile checksum (last 20 bytes for SHA-1, 32 bytes for SHA-256)
    // This is a basic check - full verification would require parsing the packfile
    const packfileLength = packfile.length
    if (packfileLength < 24) { // Minimum: "PACK" (4) + version (4) + object count (4) + checksum (20 for SHA-1)
      return {
        valid: false,
        version: header.version,
        refs: header.refs.map(r => ({ ref: r.ref, oid: r.oid })),
        error: 'Packfile too short',
      }
    }
    
    // Basic validation passed
    return {
      valid: true,
      version: header.version,
      refs: header.refs.map(r => ({ ref: r.ref, oid: r.oid })),
    }
  } catch (err: any) {
    return {
      valid: false,
      version: 2,
      refs: [],
      error: err.message || String(err),
    }
  }
}

export interface UnbundleOptions extends BaseCommandOptions {
  filepath: string
  refs?: string[]
}

export interface UnbundleResult {
  imported: Map<string, string>
  rejected: Map<string, string>
}

/**
 * Unbundles a Git bundle file into a repository
 * 
 * @param options - Unbundle options
 * @returns Unbundle result with imported and rejected refs
 * 
 * @example
 * ```typescript
 * const result = await unbundle({
 *   fs,
 *   gitdir: '/path/to/.git',
 *   filepath: '/path/to/repo.bundle'
 * })
 * 
 * console.log(`Imported ${result.imported.size} refs`)
 * if (result.rejected.size > 0) {
 *   console.log(`Rejected ${result.rejected.size} refs`)
 * }
 * ```
 */
export async function unbundle({
  repo: _repo,
  fs: _fs,
  gitBackend,
  worktree,
  dir,
  gitdir = dir ? join(dir, '.git') : undefined,
  filepath,
  refs: _refs,
  cache = {},
}: UnbundleOptions): Promise<UnbundleResult> {
  const { repo, fs, gitdir: effectiveGitdir, cache: effectiveCache } = await normalizeCommandArgs({
    repo: _repo,
    fs: _fs,
    gitBackend,
    worktree,
    dir,
    gitdir,
    cache,
    filepath,
    refs: _refs,
  })

  assertParameter('filepath', filepath)
  
  // Detect object format
  const objectFormat = await detectObjectFormat(fs, effectiveGitdir)
  
  // Read and parse bundle
  const bundleData = await fs.read(filepath)
  if (!bundleData) {
    throw new Error(`Bundle file not found: ${filepath}`)
  }
  const buffer = UniversalBuffer.isBuffer(bundleData) ? bundleData : UniversalBuffer.from(bundleData)
  
  const { header, packfile } = await parseBundle(buffer)
  
  // Determine which refs to import
  const refsToImport = _refs && _refs.length > 0 
    ? header.refs.filter(r => _refs.includes(r.ref))
    : header.refs
  
  if (refsToImport.length === 0) {
    throw new Error('No refs to import')
  }
  
  // Write packfile to objects/pack/
  // Ensure pack directory exists
  const packDir = join(effectiveGitdir, 'objects', 'pack')
  try {
    await fs.mkdir(packDir, { recursive: true })
  } catch {
    // Directory might already exist
  }
  
  // Extract packfile hash from packfile (last 20 bytes for SHA-1, 32 for SHA-256)
  const oidLength = objectFormat === 'sha256' ? 64 : 40
  const packfileHash = packfile.subarray(packfile.length - oidLength / 2).toString('hex')
  const packfileName = `pack-${packfileHash}`
  const packfilePath = join(packDir, `${packfileName}.pack`)
  
  // Write packfile
  await fs.write(packfilePath, packfile)
  
  // Create packfile index (.idx file)
  const { indexPack } = await import('./indexPack.ts')
  // indexPack expects filepath relative to dir
  // Since we're writing to gitdir/objects/pack/, we need to use a path relative to gitdir
  // For bare repositories, pass gitBackend if available, otherwise use dir/gitdir
  const relativePackPath = join('objects', 'pack', `${packfileName}.pack`)
  // Try to get gitBackend from repo if available (for bare repos, dir should equal gitdir)
  const repoGitBackend = repo ? (repo as any)._gitBackend : undefined
  await indexPack({
    fs,
    gitBackend: repoGitBackend,
    dir: effectiveGitdir, // Use gitdir as the base directory (bare repo)
    gitdir: effectiveGitdir,
    filepath: relativePackPath,
    cache: effectiveCache,
  })
  
  const imported = new Map<string, string>()
  const rejected = new Map<string, string>()
  
  // Import refs
  for (const bundleRef of refsToImport) {
    try {
      // Check if ref already exists
      let currentOid: string | undefined
      try {
        const refValue = await readRef({ fs, gitdir: effectiveGitdir, ref: bundleRef.ref })
        currentOid = refValue || undefined
      } catch {
        // Ref doesn't exist - that's fine
      }
      
      // If ref exists and is different, reject (unless it's a fast-forward)
      if (currentOid && currentOid !== bundleRef.oid) {
        // Check if bundle OID is a descendant of current OID
        // For now, we'll just reject non-matching refs
        // In a full implementation, we'd check ancestry
        rejected.set(bundleRef.ref, `Ref ${bundleRef.ref} already exists with different OID`)
        continue
      }
      
      // Write ref
      await writeRef({
        fs,
        gitdir: effectiveGitdir,
        ref: bundleRef.ref,
        value: bundleRef.oid,
        objectFormat,
      })
      
      imported.set(bundleRef.ref, bundleRef.oid)
    } catch (err: any) {
      rejected.set(bundleRef.ref, err.message || String(err))
    }
  }
  
  return { imported, rejected }
}

