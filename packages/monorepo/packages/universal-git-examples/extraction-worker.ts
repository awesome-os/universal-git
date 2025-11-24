#!/usr/bin/env node
/**
 * Centralized Extraction Worker
 * 
 * Handles git extraction operations with proper error handling,
 * symlink management, and progress tracking.
 */

import path from 'path'
import * as _fs from 'fs'
import { FileSystem, type RawFileSystemProvider } from '@awesome-os/universal-git-src/models/FileSystem.ts'
import { createFileSystem } from '@awesome-os/universal-git-src/utils/createFileSystem.ts'
import * as git from '@awesome-os/universal-git-src/index.ts'
import http from '@awesome-os/universal-git-src/http/node/index.ts'

// Wrap Node.js fs in FileSystem instance
const fs: FileSystem = createFileSystem(_fs as unknown as RawFileSystemProvider)

export interface ExtractionOptions {
  url: string
  ref?: string
  sparsePath: string
  targetDir: string
  cone?: boolean
  depth?: number
  singleBranch?: boolean
  onProgress?: (event: any) => void
  workerId?: string
  useWorkers?: boolean
  maxWorkers?: number
  workerScript?: string
  transport?: unknown
}

export interface ExtractionResult {
  success: boolean
  fileCount: number
  error?: Error
  duration: number
}

/**
 * Extract a directory from a git repository using ungit
 * Handles errors gracefully and provides detailed results
 */
export async function extractDirectory(options: ExtractionOptions): Promise<ExtractionResult> {
  const startTime = Date.now()
  const {
    url,
    ref = 'HEAD',
    sparsePath,
    targetDir,
    cone = true,
    depth,
    singleBranch = true,
    onProgress,
    workerId,
  } = options

  try {
    // Ensure target directory exists
    await fs.mkdir(targetDir, { recursive: true })

    // Wrap progress callback to include worker ID
    const progressCallback = onProgress
      ? (event: any) => {
          onProgress({
            ...event,
            workerId,
          })
        }
      : undefined

    // Perform extraction
    const extractionStartTime = Date.now()
    console.log(`[Extraction ${options.workerId || 'main'}] Starting extraction: ${sparsePath}`)
    if (options.useWorkers && options.maxWorkers) {
      console.log(`[Extraction ${options.workerId || 'main'}] Multi-worker checkout enabled: ${options.maxWorkers} workers`)
    } else {
      console.log(`[Extraction ${options.workerId || 'main'}] Single-threaded checkout`)
    }
    
    await git.ungit({
      fs,
      http,
      dir: targetDir,
      url,
      ref,
      sparsePath,
      cone,
      depth,
      singleBranch,
      onProgress: progressCallback,
      useWorkers: options.useWorkers,
      maxWorkers: options.maxWorkers,
      workerScript: options.workerScript,
      transport: options.transport,
    })
    
    const extractionDuration = Date.now() - extractionStartTime
    console.log(`[Extraction ${options.workerId || 'main'}] Extraction completed in ${extractionDuration}ms`)

    // Count extracted files
    const fileCount = await countFiles(targetDir)

    const duration = Date.now() - startTime

    return {
      success: true,
      fileCount,
      duration,
    }
  } catch (error) {
    const duration = Date.now() - startTime

    return {
      success: false,
      fileCount: 0,
      error: error as Error,
      duration,
    }
  }
}

/**
 * Count files in a directory recursively
 */
async function countFiles(dir: string): Promise<number> {
  let count = 0
  try {
    const entries = await fs.readdir(dir)
    if (!entries) return count

    for (const entry of entries) {
      // Skip .git directory
      if (entry === '.git') continue

      const fullPath = path.join(dir, entry)
      const stats = await fs.lstat(fullPath)

      if (stats && stats.isDirectory()) {
        count += await countFiles(fullPath)
      } else if (stats && (stats.isFile() || stats.isSymbolicLink())) {
        count++
      }
    }
  } catch {
    // Ignore errors
  }
  return count
}

/**
 * Extract multiple directories in parallel
 */
export async function extractDirectoriesInParallel(
  extractions: ExtractionOptions[],
  maxConcurrency: number = 4
): Promise<ExtractionResult[]> {
  const results: ExtractionResult[] = []
  const executing: Promise<void>[] = []

  for (const extraction of extractions) {
    const promise = extractDirectory(extraction).then((result) => {
      results.push(result)
    })

    executing.push(promise)

    // Limit concurrency
    if (executing.length >= maxConcurrency) {
      await Promise.race(executing)
      executing.splice(
        executing.findIndex((p) => p === promise),
        1
      )
    }
  }

  // Wait for all remaining extractions
  await Promise.all(executing)

  return results
}

/**
 * Verify extraction results
 */
export interface VerificationResult {
  path: string
  exists: boolean
  fileCount: number
  hasNestedStructure: boolean
  unexpectedSiblings: string[]
}

export async function verifyExtraction(
  targetDir: string,
  sparsePath: string,
  expectedSiblingPaths: string[] = []
): Promise<VerificationResult> {
  const result: VerificationResult = {
    path: sparsePath,
    exists: false,
    fileCount: 0,
    hasNestedStructure: false,
    unexpectedSiblings: [],
  }

  try {
    // Check if nested structure exists (old behavior)
    const nestedPath = path.join(targetDir, sparsePath)
    const nestedExists = await fs.exists(nestedPath)

    // Check if contents are directly in targetDir (new behavior)
    const entries = await fs.readdir(targetDir)
    const hasDirectContents = entries && entries.some((e) => e !== '.git' && e !== sparsePath)

    if (nestedExists) {
      result.hasNestedStructure = true
      result.exists = true
      result.fileCount = await countFiles(nestedPath)
    } else if (hasDirectContents) {
      result.exists = true
      result.fileCount = await countFiles(targetDir)
    }

    // Check for unexpected sibling directories
    // Only flag directories that match OTHER sparse paths (sibling directories at repo root)
    // Subdirectories of the sparse path (like typings/, vs/, vscode-dts/ inside src/) are valid
    if (entries) {
      // Get list of top-level sparse path names to check against
      const siblingPathNames = expectedSiblingPaths.map((sp) => {
        const parts = sp.split('/').filter((p) => p)
        return parts[0] || sp
      })
      
      for (const entry of entries) {
        if (entry === '.git' || entry === sparsePath) continue

        // Only flag if this entry matches another sparse path name (sibling at repo root)
        // Subdirectories of the sparse path are valid and should NOT be flagged
        const isOtherSparsePath = siblingPathNames.some((siblingName) => {
          return entry === siblingName
        })

        if (isOtherSparsePath) {
          const entryPath = path.join(targetDir, entry)
          const stats = await fs.lstat(entryPath)
          if (stats && stats.isDirectory()) {
            // Check if it's a nested structure (e.g., build/build/)
            const nestedEntryPath = path.join(entryPath, entry)
            const nestedEntryExists = await fs.exists(nestedEntryPath)
            if (nestedEntryExists) {
              result.unexpectedSiblings.push(`${entry}/${entry}`)
            } else {
              result.unexpectedSiblings.push(entry)
            }
          }
        }
        // Note: We don't flag other directories as they are valid subdirectories
        // of the sparse path (e.g., src/typings/, src/vs/, src/vscode-dts/ are all valid)
      }
    }
  } catch (error) {
    // Verification failed
  }

  return result
}

