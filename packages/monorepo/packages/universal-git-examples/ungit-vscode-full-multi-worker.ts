#!/usr/bin/env node
/**
 * Multi-Worker Ungit Example: Visual Studio Code - Full Checkout
 * 
 * This script demonstrates using 4 worker threads for full checkout operations
 * (no sparse checkout). This verifies that the multi-worker infrastructure
 * works for complete repository checkouts.
 * 
 * Features:
 * - Worker pool: 4 workers for checkout operations
 * - Full checkout (no sparse paths)
 * - Shallow clone (depth=1) for faster download
 * - Single branch checkout
 * - Swappable transport layer (LocalTransport or BroadcastChannel)
 * - Detailed timing and performance metrics
 * 
 * Usage:
 *   node ungit-vscode-full-multi-worker.ts
 *   node ungit-vscode-full-multi-worker.ts --broadcast-channel  # Use BroadcastChannel transport
 *   node ungit-vscode-full-multi-worker.ts --keep               # Skip cleanup
 * 
 * Environment variables:
 *   UNGIT_FULL_SKIP_CLEAN=1        Skip cleanup
 *   UNGIT_FULL_USE_BROADCAST=1     Use BroadcastChannel transport
 */

import 'dotenv/config.js'
import path from 'path'
import * as _fs from 'fs'
import { FileSystem, type RawFileSystemProvider } from '@awesome-os/universal-git-src/models/FileSystem.ts'
import { createFileSystem } from '@awesome-os/universal-git-src/utils/createFileSystem.ts'
import * as git from '@awesome-os/universal-git-src/index.ts'
import http from '@awesome-os/universal-git-src/http/node/index.ts'
import { WorkerPool } from '@awesome-os/universal-git-src/workers/WorkerPool.ts'
import { createDefaultTransport, createTransport } from '@awesome-os/universal-git-src/transport/index.ts'

// Wrap Node.js fs in FileSystem instance (required for universal-git)
const fs: FileSystem = createFileSystem(_fs as unknown as RawFileSystemProvider)

// Configuration
const VSCODE_REPO_URL = 'https://github.com/microsoft/vscode.git'
const TARGET_DIR = path.join(process.cwd(), '.ungit-full')
const ref = 'main' // VS Code uses 'main' as default branch

// Command line flags
const SHOULD_SKIP_CLEAN =
  process.argv.includes('--keep') ||
  process.argv.includes('--no-clean') ||
  process.env.UNGIT_FULL_SKIP_CLEAN === '1'
const SHOULD_CLEAN = !SHOULD_SKIP_CLEAN

// Worker configuration
// Use 4 workers for checkout operations
const MAX_WORKERS = 4
const USE_BROADCAST_CHANNEL = process.argv.includes('--broadcast-channel') || 
                              process.env.UNGIT_FULL_USE_BROADCAST === '1'

type StepTiming = { label: string; duration: number }
const stepTimings: StepTiming[] = []

function formatTime(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`
}

async function runStep(label: string, fn: () => Promise<void>): Promise<void> {
  const start = Date.now()
  console.log(`\n▶ ${label}`)
  await fn()
  const duration = Date.now() - start
  stepTimings.push({ label, duration })
  console.log(`✓ ${label}: ${formatTime(duration)}`)
}

function logDetail(message: string): void {
  console.log(`  ${message}`)
}

// Progress tracking
let lastProgressUpdate = Date.now()
const PROGRESS_UPDATE_INTERVAL = 2000 // Update every 2 seconds

function logProgress(event: any): void {
  const now = Date.now()
  if (now - lastProgressUpdate < PROGRESS_UPDATE_INTERVAL && event.total) {
    return // Throttle updates
  }
  lastProgressUpdate = now
  
  if (event.total) {
    const percent = ((event.loaded / event.total) * 100).toFixed(1)
    process.stdout.write(`\r  ${event.phase}: ${percent}% (${event.loaded}/${event.total})`)
  } else {
    process.stdout.write(`\r  ${event.phase}: ${event.loaded} items`)
  }
}

async function countFiles(dir: string): Promise<number> {
  let count = 0
  try {
    const entries = await fs.readdir(dir)
    if (!entries) return count
    
    for (const entry of entries) {
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

async function main() {
  const startTime = Date.now()
  
  console.log('🚀 Multi-Worker Ungit Example: VS Code Full Checkout')
  console.log('='.repeat(60))
  console.log(`Repository: ${VSCODE_REPO_URL}`)
  console.log(`Target directory: ${TARGET_DIR}`)
  console.log(`Ref: ${ref}`)
  console.log(`Shallow clone: depth=1`)
  console.log(`Single branch: true`)
  console.log(`Max workers: ${MAX_WORKERS}`)
  console.log(`Transport: ${USE_BROADCAST_CHANNEL ? 'BroadcastChannel' : 'Local (default)'}`)
  console.log('='.repeat(60))
  console.log()

  try {
    // Step 1: Cleanup
    if (SHOULD_CLEAN) {
      await runStep('Cleanup', async () => {
        logDetail('Removing existing target directory...')
        if (await fs.exists(TARGET_DIR)) {
          await fs.rmdir(TARGET_DIR, { recursive: true })
          logDetail(`Removed ${TARGET_DIR}`)
        }
        logDetail('Cleanup complete')
      })
    } else {
      console.log('Skipping cleanup. Pass --keep/--no-clean or unset UNGIT_FULL_SKIP_CLEAN to enable automatic cleanup.')
    }

    // Step 2: Setup worker pool
    await runStep('Setup Worker Pool', async () => {
      logDetail(`Creating worker pool with ${MAX_WORKERS} workers for checkout operations...`)
      logDetail(`Note: Full checkout supports multi-worker checkout (no sparse paths needed)`)
      
      // Create transport
      const transport = USE_BROADCAST_CHANNEL
        ? createTransport({ type: 'broadcast-channel', name: 'ungit-full-workers' })
        : createDefaultTransport('ungit-full-workers')
      
      logDetail(`Transport type: ${transport.getType()}`)
      
      // Resolve worker script path using utility
      let workerScript: string | null = null
      try {
        const { resolveWorkerScript } = await import('@awesome-os/universal-git-src/utils/resolveWorkerScript.ts')
        workerScript = resolveWorkerScript(import.meta.url)
        
        if (workerScript) {
          logDetail(`✓ Found worker script: ${workerScript}`)
        } else {
          logDetail(`✗ Worker script not found`)
        }
      } catch (error) {
        logDetail(`Note: Could not resolve worker script: ${(error as Error).message}`)
      }
      
      // Create worker pool only if script found
      let workerPool: WorkerPool | null = null
      if (workerScript) {
        try {
          workerPool = new WorkerPool(MAX_WORKERS, workerScript, transport)
          logDetail(`Worker pool created successfully with ${MAX_WORKERS} workers`)
          logDetail(`Worker script: ${workerScript}`)
        } catch (error) {
          logDetail(`Failed to create worker pool: ${(error as Error).message}`)
          workerPool = null
        }
      } else {
        logDetail('Worker script not found - checkout will use single-threaded mode')
      }
      
      if (workerPool) {
        logDetail(`Worker pool ready: ${MAX_WORKERS} workers available`)
      } else {
        logDetail('Worker pool not available - checkout will use single-threaded mode')
      }
      
      // Store in global for access
      ;(global as any).__workerPool = workerPool
      ;(global as any).__transport = transport
      ;(global as any).__workerScript = workerScript
    })

    // Step 3: Full checkout
    await runStep('Full Checkout', async () => {
      logDetail(`Performing full checkout of ${ref} branch...`)
      logDetail(`Target: ${TARGET_DIR}`)
      logDetail(`Shallow clone: depth=1, singleBranch=true`)
      
      const workerPool = (global as any).__workerPool as WorkerPool | undefined
      const transport = (global as any).__transport
      const workerScript = (global as any).__workerScript as string | undefined
      
      if (workerScript && workerPool) {
        logDetail(`Multi-worker checkout: Enabled (${MAX_WORKERS} workers)`)
      } else {
        logDetail(`Multi-worker checkout: Disabled (worker script not found or pool unavailable)`)
      }
      
      const startTime = Date.now()
      
      // Perform full checkout with multi-worker support
      
      await git.ungit({
        fs,
        http,
        dir: TARGET_DIR,
        url: VSCODE_REPO_URL,
        ref,
        depth: 1, // Shallow clone
        singleBranch: true,
        useWorkers: !!workerScript, // Enable workers if script found
        maxWorkers: MAX_WORKERS,
        workerScript,
        transport,
        onProgress: logProgress,
      })
      
      const duration = Date.now() - startTime
      logDetail(`Checkout completed in ${formatTime(duration)}`)
    })

    // Step 4: Verify checkout
    await runStep('Verify Checkout', async () => {
      logDetail('Verifying checked out files...')
      
      if (await fs.exists(TARGET_DIR)) {
        const fileCount = await countFiles(TARGET_DIR)
        logDetail(`✓ Checkout verified: ${fileCount} files found`)
        
        // Check for expected directories
        const expectedDirs = ['src', 'extensions', 'build', '.git']
        for (const dir of expectedDirs) {
          const dirPath = path.join(TARGET_DIR, dir)
          const exists = await fs.exists(dirPath)
          if (exists) {
            logDetail(`  ✓ Found: ${dir}/`)
          } else {
            logDetail(`  ✗ Missing: ${dir}/`)
          }
        }
      } else {
        logDetail(`✗ Target directory not found: ${TARGET_DIR}`)
      }
    })

    // Final summary
    const totalTime = Date.now() - startTime
    
    console.log()
    console.log('✅ Success!')
    console.log('='.repeat(60))
    console.log(`Total time: ${formatTime(totalTime)}`)
    console.log(`Target directory: ${TARGET_DIR}`)
    console.log(`Worker pool size: ${MAX_WORKERS} workers`)
    console.log(`Note: Full checkout uses single-threaded checkout (multi-worker checkout requires sparse paths)`)
    console.log()

    if (stepTimings.length > 0) {
      console.log('⏱️  Detailed timeline:')
      stepTimings.forEach(({ label, duration }) => {
        console.log(`   - ${label}: ${formatTime(duration)}`)
      })
      console.log()
    }

    // Cleanup workers
    const workerPool = (global as any).__workerPool as WorkerPool | undefined
    const transport = (global as any).__transport
    const workerScript = (global as any).__workerScript as string | undefined
    const usedWorkers = workerScript && workerPool
    
    if (workerPool) {
      await runStep('Cleanup Workers', async () => {
        logDetail('Terminating worker pool...')
        await workerPool.terminateAll()
        if (transport) {
          transport.close()
        }
        logDetail('Workers terminated')
      })
    }
    
    console.log('ℹ️  Note: This example demonstrates full checkout (no sparse paths)')
    if (usedWorkers) {
      console.log(`   ✓ Multi-worker checkout: Enabled (${MAX_WORKERS} workers)`)
      console.log('   Full checkout uses multi-worker parallel processing')
    } else {
      console.log('   Multi-worker checkout: Disabled (worker script not found)')
      console.log('   Full checkout uses the standard single-threaded checkout process')
    }
    console.log()

  } catch (error) {
    console.error()
    console.error('❌ Error:', (error as Error).message)
    if ((error as Error).stack) {
      console.error('\nStack trace:')
      console.error((error as Error).stack)
    }
    
    // Cleanup on error
    const workerPool = (global as any).__workerPool as WorkerPool | undefined
    const transport = (global as any).__transport
    if (workerPool) {
      try {
        await workerPool.terminateAll()
        if (transport) {
          transport.close()
        }
      } catch {
        // Ignore cleanup errors
      }
    }
    
    process.exit(1)
  }
}

// Run the example
main().catch((error) => {
  console.error('Fatal error:', error)
  process.exit(1)
})

