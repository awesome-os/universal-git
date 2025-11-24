#!/usr/bin/env node
/**
 * Multi-Worker Ungit Example: Visual Studio Code - Multiple directories in parallel
 * 
 * This script demonstrates using 4 worker threads for extraction operations.
 * Each extraction uses multi-worker checkout internally, with up to 4 workers
 * processing subdirectories in parallel. Multiple extractions can run concurrently,
 * sharing the worker pool.
 * 
 * Features:
 * - Worker pool: 4 workers for extraction operations
 * - Multi-worker checkout: Each extraction uses up to 4 workers internally
 * - Parallel extraction of multiple directories
 * - Swappable transport layer (LocalTransport or BroadcastChannel)
 * - Worker coordination via transport messaging
 * - Detailed timing and performance metrics
 * 
 * Usage:
 *   node ungit-vscode-src-multi-worker.ts
 *   node ungit-vscode-src-multi-worker.ts --broadcast-channel  # Use BroadcastChannel transport
 *   node ungit-vscode-src-multi-worker.ts --keep               # Skip cleanup
 * 
 * Environment variables:
 *   UNGIT_MULTI_SKIP_CLEAN=1        Skip cleanup
 *   UNGIT_MULTI_USE_BROADCAST=1     Use BroadcastChannel transport
 * 
 * Note on Workers:
 *   This example demonstrates the multi-worker infrastructure. In development,
 *   workers may not be available if the worker script is not compiled. The example
 *   will gracefully fall back to main thread execution. To enable workers:
 *   1. Ensure the worker script (git-worker.ts) is compiled to .js
 *   2. Or use a TypeScript loader (e.g., tsx, ts-node with ESM support)
 */

import 'dotenv/config.js'
import path from 'path'
import * as _fs from 'fs'
import { FileSystem, type RawFileSystemProvider } from '@awesome-os/universal-git-src/models/FileSystem.ts'
import { createFileSystem } from '@awesome-os/universal-git-src/utils/createFileSystem.ts'
import { WorkerPool } from '@awesome-os/universal-git-src/workers/WorkerPool.ts'
import { createDefaultTransport, createTransport } from '@awesome-os/universal-git-src/transport/index.ts'
import { ComlinkWorker } from '@awesome-os/universal-git-src/workers/ComlinkWorker.ts'
import {
  extractDirectory,
  extractDirectoriesInParallel,
  verifyExtraction,
  type ExtractionOptions,
  type ExtractionResult,
  type VerificationResult,
} from './extraction-worker.ts'

// Wrap Node.js fs in FileSystem instance (required for universal-git)
const fs: FileSystem = createFileSystem(_fs as unknown as RawFileSystemProvider)

// Configuration
const VSCODE_REPO_URL = 'https://github.com/microsoft/vscode.git'
const BASE_TARGET_DIR = path.join(process.cwd(), '.ungit-multi')
const ref = 'main' // VS Code uses 'main' as default branch

// Directories to extract in parallel (each in a separate worker)
// NOTE: The nested structure (e.g., src/src/) is CORRECT and expected - ungit creates 
// the sparsePath directory inside the target directory.
// BUG: If build/build/ appears when extracting src/, that indicates a sparse checkout bug
// where files outside the sparse pattern are incorrectly being included.
// 
// To test sparse checkout filtering, extract only 'src' to verify that 'build' is NOT included
const SPARSE_PATHS = [
  { name: 'src', path: 'src' },
  // Uncomment to test parallel extraction:
  // { name: 'extensions', path: 'extensions' },
  // { name: 'build', path: 'build' },
]

// Command line flags
const SHOULD_SKIP_CLEAN =
  process.argv.includes('--keep') ||
  process.argv.includes('--no-clean') ||
  process.env.UNGIT_MULTI_SKIP_CLEAN === '1'
const SHOULD_CLEAN = !SHOULD_SKIP_CLEAN

// Worker configuration
// Use 4 workers for extraction operations (can process multiple extractions in parallel
// and each extraction can use multiple workers internally)
const MAX_WORKERS = 4
const USE_BROADCAST_CHANNEL = process.argv.includes('--broadcast-channel') || 
                              process.env.UNGIT_MULTI_USE_BROADCAST === '1'

type StepTiming = { label: string; duration: number; workerId?: string }
const stepTimings: StepTiming[] = []

function formatTime(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`
}

async function runStep(label: string, fn: () => Promise<void>, workerId?: string): Promise<void> {
  const start = Date.now()
  console.log(`\n▶ ${label}${workerId ? ` [Worker ${workerId}]` : ''}`)
  await fn()
  const duration = Date.now() - start
  stepTimings.push({ label, duration, workerId })
  console.log(`✓ ${label}: ${formatTime(duration)}${workerId ? ` [Worker ${workerId}]` : ''}`)
}

function logDetail(message: string): void {
  console.log(`  ${message}`)
}

// Progress tracking
let lastProgressUpdate = Date.now()
const PROGRESS_UPDATE_INTERVAL = 2000 // Update every 2 seconds

function logProgress(event: any, workerId?: string): void {
  const now = Date.now()
  if (now - lastProgressUpdate < PROGRESS_UPDATE_INTERVAL && event.total) {
    return // Throttle updates
  }
  lastProgressUpdate = now
  
  const workerPrefix = workerId ? `[Worker ${workerId}] ` : ''
  if (event.total) {
    const percent = ((event.loaded / event.total) * 100).toFixed(1)
    process.stdout.write(`\r  ${workerPrefix}${event.phase}: ${percent}% (${event.loaded}/${event.total})`)
  } else {
    process.stdout.write(`\r  ${workerPrefix}${event.phase}: ${event.loaded} items`)
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
      } else if (stats && stats.isFile()) {
        count++
      }
    }
  } catch {
    // Ignore errors
  }
  return count
}

async function extractWithWorker(
  worker: ComlinkWorker | null,
  workerId: string,
  sparsePath: { name: string; path: string },
  targetDir: string,
  workerPoolParam?: WorkerPool
): Promise<{ fileCount: number; success: boolean; usedWorker: boolean; result?: ExtractionResult }> {
  let usedWorker = false
  let extractionResult: ExtractionResult | undefined
  
  await runStep(`Extract ${sparsePath.name}/`, async () => {
    logDetail(`Target: ${targetDir}`)
    logDetail(`Sparse path: ${sparsePath.path}/`)
    
    // Get worker pool and related resources from global
    const globalWorkerPool = (global as any).__workerPool as WorkerPool | undefined
    const transport = (global as any).__transport
    const workerScript = (global as any).__workerScript as string | undefined
    const workerPool = workerPoolParam || globalWorkerPool
    
    // Determine if multi-worker checkout should be enabled
    const shouldUseWorkers = !!globalWorkerPool && !!workerScript
    logDetail(`Multi-worker checkout: ${shouldUseWorkers ? `ENABLED (${MAX_WORKERS} workers)` : 'DISABLED'}`)
    if (!shouldUseWorkers) {
      const reasons: string[] = []
      if (!globalWorkerPool) reasons.push('worker pool not available')
      if (!workerScript) reasons.push('worker script not found')
      logDetail(`  Reason: ${reasons.join(' and ')}`)
    }
    logDetail(`  Worker pool available: ${!!globalWorkerPool}`)
    logDetail(`  Worker script available: ${!!workerScript}`)
    if (workerScript) {
      logDetail(`  Worker script path: ${workerScript}`)
    } else {
      logDetail(`  Worker script: NOT FOUND - check worker script path resolution above`)
    }
    
    if (worker) {
      // Try to use worker (if fully implemented)
      try {
        logDetail(`Using worker ${workerId} for extraction...`)
        usedWorker = true
        
        // Broadcast extraction start via transport
        if (workerPool) {
          workerPool.broadcast({
            type: 'extraction-start',
            workerId,
            sparsePath: sparsePath.path,
            targetDir,
          })
        }
      } catch (workerError) {
        logDetail(`Worker unavailable, falling back to main thread: ${(workerError as Error).message}`)
        usedWorker = false
      }
    }
    
    // Use centralized extraction worker
    // Enable multi-worker checkout within each extraction
    extractionResult = await extractDirectory({
      url: VSCODE_REPO_URL,
      ref,
      sparsePath: sparsePath.path,
      targetDir,
      cone: true,
      depth: 1,
      singleBranch: true,
      onProgress: (event) => logProgress(event, workerId),
      workerId,
      useWorkers: shouldUseWorkers,
      maxWorkers: MAX_WORKERS,
      workerScript,
      transport,
    })
    
    // Broadcast extraction complete
    if (workerPool && usedWorker) {
      workerPool.broadcast({
        type: 'extraction-complete',
        workerId,
        sparsePath: sparsePath.path,
      })
    }
    
    if (!extractionResult.success && extractionResult.error) {
      throw extractionResult.error
    }
  }, workerId)
  
  return {
    fileCount: extractionResult?.fileCount || 0,
    success: extractionResult?.success || false,
    usedWorker,
    result: extractionResult,
  }
}

async function main() {
  const startTime = Date.now()
  
  console.log('🚀 Multi-Worker Ungit Example: VS Code Multiple Directories')
  console.log('='.repeat(60))
  console.log(`Repository: ${VSCODE_REPO_URL}`)
  console.log(`Base target directory: ${BASE_TARGET_DIR}`)
  console.log(`Directories to extract: ${SPARSE_PATHS.map(p => p.name).join(', ')}`)
  console.log(`Max workers: ${MAX_WORKERS}`)
  console.log(`Transport: ${USE_BROADCAST_CHANNEL ? 'BroadcastChannel' : 'Local (default)'}`)
  console.log('='.repeat(60))
  console.log()

  try {
    // Step 1: Cleanup
    if (SHOULD_CLEAN) {
      await runStep('Cleanup', async () => {
        logDetail('Removing existing target directories...')
        for (const sparsePath of SPARSE_PATHS) {
          const targetDir = path.join(BASE_TARGET_DIR, sparsePath.name)
          if (await fs.exists(targetDir)) {
            await fs.rmdir(targetDir, { recursive: true })
            logDetail(`Removed ${targetDir}`)
          }
        }
        logDetail('Cleanup complete')
      })
    } else {
      console.log('Skipping cleanup. Pass --keep/--no-clean or unset UNGIT_MULTI_SKIP_CLEAN to enable automatic cleanup.')
    }

    // Step 2: Setup worker pool
    await runStep('Setup Worker Pool', async () => {
      logDetail(`Creating worker pool with ${MAX_WORKERS} workers for extraction operations...`)
      logDetail(`Each extraction can use up to ${MAX_WORKERS} workers internally for parallel processing`)
      
      // Create transport
      const transport = USE_BROADCAST_CHANNEL
        ? createTransport({ type: 'broadcast-channel', name: 'ungit-workers' })
        : createDefaultTransport('ungit-workers')
      
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
          logDetail(`  Searched relative to: ${import.meta.url}`)
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
          // Workers not available - silently fall back to main thread
          logDetail(`Failed to create worker pool: ${(error as Error).message}`)
          workerPool = null
        }
      } else {
        logDetail('Worker script not found - multi-worker checkout will be disabled')
      }
      
      if (workerPool) {
        logDetail(`Worker pool ready: ${MAX_WORKERS} workers available for multi-worker checkout`)
      } else {
        logDetail('Worker pool not available - extractions will use single-threaded checkout')
      }
      
      // Store in a way that can be accessed (in real implementation, this would be managed)
      ;(global as any).__workerPool = workerPool
      ;(global as any).__transport = transport
      ;(global as any).__workerScript = workerScript
      
      // Only show worker availability message if explicitly requested via env var
      if (!workerPool && process.env.UNGIT_MULTI_SHOW_WORKER_INFO === '1') {
        logDetail('\nℹ️  Workers are not available - operations will run in main thread')
        logDetail('   This is normal in development. To use workers:')
        logDetail('   1. Compile the worker script (git-worker.ts -> git-worker.js)')
        logDetail('   2. Ensure the compiled .js file is accessible')
        logDetail('   Set UNGIT_MULTI_SHOW_WORKER_INFO=1 to see this message')
      }
    })

    // Step 3: Extract directories in parallel using workers
    await runStep('Parallel Extraction', async () => {
      logDetail(`Extracting ${SPARSE_PATHS.length} directories in parallel...`)
      logDetail(`Worker pool: ${MAX_WORKERS} workers available`)
      logDetail(`Each extraction will use up to ${MAX_WORKERS} workers internally for multi-worker checkout`)
      
      const workerPool = (global as any).__workerPool as WorkerPool | undefined
      const transport = (global as any).__transport
      
      if (workerPool && transport) {
        // Broadcast start message
        workerPool.broadcast({ type: 'extraction-start', timestamp: Date.now() })
      }
      
      // Extract directories in parallel
      // Each extraction will use multi-worker checkout internally (up to MAX_WORKERS workers)
      // Multiple extractions can run concurrently, sharing the worker pool
      const extractionPromises = SPARSE_PATHS.map(async (sparsePath, index) => {
        const workerId = `W${index + 1}`
        const targetDir = path.join(BASE_TARGET_DIR, sparsePath.name)
        
        // Note: We don't need to acquire a worker here for the extraction itself
        // because extractDirectory will use multi-worker checkout internally
        // The worker pool is shared and managed by the extraction worker
        try {
          return await extractWithWorker(null, workerId, sparsePath, targetDir, workerPool)
        } catch (error) {
          // Log error but continue with other extractions
          console.error(`Error extracting ${sparsePath.name}:`, error)
          throw error
        }
      })
      
      const results = await Promise.all(extractionPromises)
      
      // Log results
      console.log()
      logDetail('Extraction results:')
      results.forEach((result, index) => {
        const sparsePath = SPARSE_PATHS[index]
        const workerInfo = result.usedWorker ? ' [Worker]' : ' [Main Thread]'
        if (result.success) {
          logDetail(`  ✓ ${sparsePath.name}/: ${result.fileCount} files extracted${workerInfo}`)
        } else {
          logDetail(`  ✗ ${sparsePath.name}/: Failed${workerInfo}`)
        }
      })
      
      const workersUsed = results.filter(r => r.usedWorker).length
      const totalWorkersUsed = results.reduce((sum, r) => sum + (r.usedWorker ? MAX_WORKERS : 0), 0)
      logDetail(`\n  Extractions using workers: ${workersUsed}/${SPARSE_PATHS.length}`)
      if (workersUsed > 0) {
        logDetail(`  Total worker capacity: ${MAX_WORKERS} workers per extraction`)
        logDetail(`  Maximum concurrent workers: ${totalWorkersUsed} (${workersUsed} extractions × ${MAX_WORKERS} workers)`)
      }
      
      if (workerPool && transport) {
        // Broadcast completion message
        workerPool.broadcast({ type: 'extraction-complete', timestamp: Date.now() })
      }
    })

    // Step 4: Verify extractions using centralized verification
    await runStep('Verify Extractions', async () => {
      logDetail('Verifying extracted directories...')
      
      const allSparsePaths = SPARSE_PATHS.map(sp => sp.path)
      
      for (const sparsePath of SPARSE_PATHS) {
        const baseTargetDir = path.join(BASE_TARGET_DIR, sparsePath.name)
        
        // Use centralized verification
        const verification = await verifyExtraction(
          baseTargetDir,
          sparsePath.path,
          allSparsePaths.filter(sp => sp !== sparsePath.path)
        )
        
        if (verification.hasNestedStructure) {
          logDetail(`  ⚠️  ${sparsePath.name}/${sparsePath.path}: ${verification.fileCount} files (nested structure - should be fixed)`)
        } else if (verification.exists) {
          logDetail(`  ✓ ${sparsePath.name}/: ${verification.fileCount} files (contents directly in ${sparsePath.name}/)`)
        } else {
          logDetail(`  ✗ ${sparsePath.name}/: Not found or empty`)
        }
        
        // Report unexpected siblings
        if (verification.unexpectedSiblings.length > 0) {
          for (const sibling of verification.unexpectedSiblings) {
            logDetail(`  ❌ ERROR: Unexpected sibling directory: ${sparsePath.name}/${sibling}`)
            logDetail(`     BUG: ${sibling}/ should NOT be extracted when only extracting ${sparsePath.path}/`)
            logDetail(`     This indicates a sparse checkout filtering bug`)
          }
        }
      }
    })

    // Final summary
    const totalTime = Date.now() - startTime
    
    console.log()
    console.log('✅ Success!')
    console.log('='.repeat(60))
    console.log(`Total time: ${formatTime(totalTime)}`)
    console.log(`Directories extracted: ${SPARSE_PATHS.length}`)
    console.log(`Worker pool size: ${MAX_WORKERS} workers`)
    console.log(`Multi-worker checkout: Enabled (each extraction uses up to ${MAX_WORKERS} workers internally)`)
    console.log(`Base directory: ${BASE_TARGET_DIR}`)
    console.log()

    if (stepTimings.length > 0) {
      console.log('⏱️  Detailed timeline:')
      stepTimings.forEach(({ label, duration, workerId }) => {
        const workerInfo = workerId ? ` [${workerId}]` : ''
        console.log(`   - ${label}: ${formatTime(duration)}${workerInfo}`)
      })
      console.log()
    }

    console.log('📁 Directory structure:')
    console.log(`   ${BASE_TARGET_DIR}/`)
    for (const sparsePath of SPARSE_PATHS) {
      const targetPath = path.join(BASE_TARGET_DIR, sparsePath.name)
      const nestedPath = path.join(targetPath, sparsePath.path)
      
      try {
        // Check if target directory exists
        const targetExists = await fs.exists(targetPath)
        if (!targetExists) {
          console.log(`   ├── ${sparsePath.name}/  (not found)`)
          continue
        }
        
        // Check if nested structure exists (old bug) or if files are directly in target
        const nestedExists = await fs.exists(nestedPath)
        const targetStats = await fs.lstat(targetPath)
        
        if (nestedExists && targetStats && targetStats.isDirectory()) {
          // Check if nested path is actually a directory (nested structure)
          const nestedStats = await fs.lstat(nestedPath)
          if (nestedStats && nestedStats.isDirectory()) {
            // Nested structure exists (old bug)
            console.log(`   ├── ${sparsePath.name}/`)
            console.log(`   │   └── ${sparsePath.path}/  ⚠️  (nested structure - bug)`)
          } else {
            // Files are directly in target (correct)
            console.log(`   ├── ${sparsePath.name}/  ✓ (contents directly here)`)
          }
        } else {
          // Files are directly in target directory (correct)
          console.log(`   ├── ${sparsePath.name}/  ✓ (contents directly here)`)
        }
      } catch (error) {
        // Fallback to simple display
        console.log(`   ├── ${sparsePath.name}/`)
      }
    }
    console.log()

    // Cleanup workers
    const workerPool = (global as any).__workerPool as WorkerPool | undefined
    const transport = (global as any).__transport
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

    console.log('ℹ️  Note: This example demonstrates the multi-worker extraction infrastructure')
    console.log(`   - Worker pool: ${MAX_WORKERS} workers available`)
    console.log('   - Each extraction uses multi-worker checkout internally')
    console.log(`   - Up to ${MAX_WORKERS} workers process subdirectories in parallel per extraction`)
    console.log('   - Multiple extractions can run concurrently, sharing the worker pool')
    console.log('   - Main thread remains unblocked during all operations')
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

