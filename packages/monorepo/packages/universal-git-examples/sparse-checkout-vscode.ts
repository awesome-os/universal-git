#!/usr/bin/env node
/**
 * Sparse Checkout Example: Visual Studio Code
 * 
 * This script clones only the src/ folder from VS Code repository
 * into a .dump directory and adds .dump to .gitignore
 */

import 'dotenv/config.js'
import path from 'path'
import * as _fs from 'fs'
import { FileSystem, type RawFileSystemProvider } from '@awesome-os/universal-git-src/models/FileSystem.ts'
import { createFileSystem } from '@awesome-os/universal-git-src/utils/createFileSystem.ts'
import * as git from '@awesome-os/universal-git-src/index.ts'
import { sparseCheckout } from '@awesome-os/universal-git-src/commands/sparseCheckout.ts'
import http from '@awesome-os/universal-git-src/http/node/index.ts'

// Wrap Node.js fs in FileSystem instance (required for universal-git)
const fs: FileSystem = createFileSystem(_fs as unknown as RawFileSystemProvider)

// Configuration
const VSCODE_REPO_URL = 'https://github.com/microsoft/vscode.git'
const DUMP_DIR = path.join(process.cwd(), '.dump')
const SHOULD_SKIP_CLEAN =
  process.argv.includes('--keep') ||
  process.argv.includes('--no-clean') ||
  process.env.SPARSE_CHECKOUT_SKIP_CLEAN === '1'
const SHOULD_CLEAN = !SHOULD_SKIP_CLEAN

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
  console.log(`${label}: ${formatTime(duration)}`)
}

function logDetail(message: string): void {
  console.log(`  ${message}`)
}

async function cleanupDumpDir(): Promise<void> {
  try {
    await _fs.promises.rm(DUMP_DIR, { recursive: true, force: true })
  } catch (err) {
    console.warn('  ⚠️  Cleanup encountered an issue:', (err as Error).message)
  }
}

// Progress tracking
let lastProgressUpdate = Date.now()
const PROGRESS_UPDATE_INTERVAL = 2000 // Update every 2 seconds

function logProgress(event) {
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

async function main() {
  const startTime = Date.now()
  console.log('🚀 Starting sparse checkout of VS Code src/ folder with DETAILED TIMERS...\n')
  
  if (SHOULD_CLEAN) {
    await runStep('Cleanup', async () => {
      logDetail('Performing cleanup for a fresh run...')
      await cleanupDumpDir()
      logDetail('Cleanup complete.')
    })
  } else {
    console.log('Skipping cleanup. Pass --fresh/--clean or unset SPARSE_CHECKOUT_SKIP_CLEAN to enable automatic cleanup.')
  }
  
  await runStep('Step 1-2: Setup', async () => {
    logDetail('Ensuring .dump directory exists...')
    if (!(await fs.exists(DUMP_DIR))) {
      await fs.mkdir(DUMP_DIR, { recursive: true })
      logDetail('✓ Created .dump directory')
    } else {
      logDetail('✓ .dump directory already exists')
    }
    
    const gitignorePath = path.join(process.cwd(), '.gitignore')
    let gitignore = (await fs.exists(gitignorePath))
      ? String(await fs.read(gitignorePath))
      : ''
    
    if (!gitignore.includes('.dump')) {
      gitignore += (gitignore ? '\n' : '') + '.dump\n'
      await fs.write(gitignorePath, gitignore)
      logDetail('✓ Added .dump to .gitignore')
    } else {
      logDetail('✓ .dump already in .gitignore')
    }
  })
  
  await runStep('Step 3: Clone repository (no checkout)', async () => {
    logDetail('Using depth=1 and singleBranch=true for faster cloning')
    logDetail('Using Git protocol v1 (v2 has issues with singleBranch shallow clones)')
    logDetail('Downloading only the latest commit (shallow clone)')
    
    let clonePhase = 'Starting...'
    let cloneProgress = { loaded: 0, total: 0 }
    
    await git.clone({
      fs,
      http,
      dir: DUMP_DIR,
      url: VSCODE_REPO_URL,
      noCheckout: true,
      depth: 1,
      singleBranch: true,
      protocolVersion: 1,
      onProgress: (event) => {
        clonePhase = event.phase
        cloneProgress = { loaded: event.loaded, total: event.total }
        logProgress(event)
      },
      onMessage: (message) => {
        if (message.trim()) {
          console.log(`\n  [Git] ${message.trim()}`)
        }
      }
    })
    
    process.stdout.write('\r' + ' '.repeat(80) + '\r')
    logDetail('✓ Repository cloned')
    if (cloneProgress.total) {
      logDetail(`Final progress: ${clonePhase} - ${cloneProgress.loaded}/${cloneProgress.total}`)
    }
  })
  
  await runStep('Step 4: Initialize sparse checkout', async () => {
    logDetail('Creating sparse-checkout configuration files (cone mode)...')
    await sparseCheckout({
      fs,
      dir: DUMP_DIR,
      init: true,
      cone: true
    })
    logDetail('✓ Sparse checkout initialized (cone mode enabled)')
  })
  
  await runStep('Step 5: Configure sparse patterns & checkout', async () => {
    logDetail('Setting sparse checkout pattern to src/ (cone mode)')
    logDetail('Checkout will start automatically after updating patterns...')
    await sparseCheckout({
      fs,
      dir: DUMP_DIR,
      set: ['src/'],
      cone: true
    })
    logDetail('✓ Sparse checkout pattern applied')
  })
  
  await runStep('Step 6: Verify sparse checkout configuration', async () => {
    logDetail('Reading .git/info/sparse-checkout...')
    const sparseCheckoutFile = path.join(DUMP_DIR, '.git', 'info', 'sparse-checkout')
    try {
      const sparseContent = String(await fs.read(sparseCheckoutFile))
      console.log('   Sparse-checkout patterns:')
      sparseContent.split('\n').forEach(line => {
        const trimmed = line.trim()
        if (trimmed && !trimmed.startsWith('#')) {
          console.log(`     - ${trimmed}`)
        }
      })
    } catch (err) {
      console.log('   ⚠️  Sparse-checkout file not found!')
    }
    
    const configFile = path.join(DUMP_DIR, '.git', 'config')
    try {
      const configContent = String(await fs.read(configFile))
      if (configContent.includes('sparseCheckout')) {
        logDetail('Sparse checkout enabled in config')
      }
    } catch (err) {
      console.log('   ⚠️  Config file not found!')
    }
  })
  
  let files: string[] = []
  let srcFiles: string[] = []
  let nonSrcFiles: string[] = []
  await runStep('Step 7: Verify working tree contents', async () => {
    logDetail('Gathering file list via git.listFiles...')
    files = await git.listFiles({ fs, dir: DUMP_DIR })
    srcFiles = files.filter(f => f.startsWith('src/'))
    nonSrcFiles = files.filter(f => !f.startsWith('src/') && !f.startsWith('.git/'))
    logDetail(`Files discovered: total=${files.length}, src=${srcFiles.length}, outside src=${nonSrcFiles.length}`)
  })
  
  const totalTime = Date.now() - startTime
  console.log(`\n✅ Complete!`)
  console.log(`   Location: ${DUMP_DIR}`)
  console.log(`   Total files in index: ${files.length}`)
  console.log(`   Files in src/: ${srcFiles.length}`)
  console.log(`   Files NOT in src/: ${nonSrcFiles.length}`)
  
  if (nonSrcFiles.length > 0) {
    console.log(`\n   ⚠️  WARNING: Found ${nonSrcFiles.length} files outside of src/!`)
    console.log(`   This suggests sparse checkout may not be working correctly.`)
    console.log(`   Example non-src files:`)
    nonSrcFiles.slice(0, 10).forEach(file => {
      console.log(`     - ${file}`)
    })
    if (nonSrcFiles.length > 10) {
      console.log(`     ... and ${nonSrcFiles.length - 10} more`)
    }
  }
  
  if (srcFiles.length > 0) {
    console.log(`\n   Example src/ files:`)
    srcFiles.slice(0, 5).forEach(file => {
      console.log(`     - ${file}`)
    })
    if (srcFiles.length > 5) {
      console.log(`     ... and ${srcFiles.length - 5} more`)
    }
  }
  console.log(`\n   Total time: ${formatTime(totalTime)}`)
  
  if (stepTimings.length > 0) {
    console.log('\n⏱️  Detailed timeline:')
    stepTimings.forEach(({ label, duration }) => {
      console.log(`   - ${label}: ${formatTime(duration)}`)
    })
  }
}

main().catch(err => {
  console.error('\n❌ Error:', err.message)
  if (err.stack) {
    console.error('\nStack trace:')
    console.error(err.stack)
  }
  process.exit(1)
})

