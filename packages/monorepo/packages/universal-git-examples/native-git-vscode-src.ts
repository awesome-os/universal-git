#!/usr/bin/env node
/**
 * Native Git Example: Visual Studio Code - src directory only
 * 
 * This script uses native git commands to extract only the src/ directory from VS Code repository
 * into a .native-git directory. This demonstrates the same operation using native git
 * and shows detailed timings for comparison with universal-git.
 */

import 'dotenv/config.js'
import path from 'path'
import { exec } from 'child_process'
import { promisify } from 'util'
import { promises as fs } from 'fs'

const execAsync = promisify(exec)

// Configuration
const VSCODE_REPO_URL = 'https://github.com/microsoft/vscode.git'
const TARGET_DIR = path.join(process.cwd(), '.native-git')
const ref = 'main' // VS Code uses 'main' as default branch
const sparsePath = 'src'

// Command line flags
const SHOULD_SKIP_CLEAN =
  process.argv.includes('--keep') ||
  process.argv.includes('--no-clean') ||
  process.env.NATIVE_GIT_SKIP_CLEAN === '1'
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
  console.log(`✓ ${label}: ${formatTime(duration)}`)
}

function logDetail(message: string): void {
  console.log(`  ${message}`)
}

async function runGitCommand(command: string, cwd?: string): Promise<{ stdout: string; stderr: string }> {
  try {
    const result = await execAsync(command, {
      cwd: cwd || process.cwd(),
      maxBuffer: 10 * 1024 * 1024, // 10MB buffer for large outputs
    })
    return result
  } catch (error: any) {
    // Git commands often return non-zero exit codes but still produce useful output
    if (error.stdout || error.stderr) {
      return { stdout: error.stdout || '', stderr: error.stderr || '' }
    }
    throw error
  }
}

async function cleanupTargetDir(): Promise<void> {
  try {
    if (await fs.access(TARGET_DIR).then(() => true).catch(() => false)) {
      await fs.rm(TARGET_DIR, { recursive: true, force: true })
      logDetail('Removed existing directory')
    }
  } catch (err) {
    console.warn('  ⚠️  Cleanup encountered an issue:', (err as Error).message)
  }
}

async function countFiles(dir: string): Promise<number> {
  let count = 0
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true })
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)
      
      if (entry.isDirectory()) {
        count += await countFiles(fullPath)
      } else if (entry.isFile()) {
        count++
      }
    }
  } catch (err) {
    // Ignore permission errors or missing directories
  }
  return count
}

async function main() {
  const startTime = Date.now()
  
  console.log('🚀 Native Git Example: VS Code src directory')
  console.log('='.repeat(60))
  console.log(`Repository: ${VSCODE_REPO_URL}`)
  console.log(`Target directory: ${TARGET_DIR}`)
  console.log(`Sparse path: src/`)
  console.log('='.repeat(60))
  console.log()

  try {
    // Step 1: Cleanup
    if (SHOULD_CLEAN) {
      await runStep('Cleanup', async () => {
        logDetail('Removing existing target directory if it exists...')
        await cleanupTargetDir()
        logDetail('Cleanup complete')
      })
    } else {
      console.log('Skipping cleanup. Pass --keep/--no-clean or unset NATIVE_GIT_SKIP_CLEAN to enable automatic cleanup.')
    }

    // Step 2: Create target directory
    await runStep('Setup', async () => {
      logDetail('Creating target directory...')
      await fs.mkdir(TARGET_DIR, { recursive: true })
      logDetail('Target directory created')
    })

    // Step 3: Initialize git repository
    await runStep('Initialize Git Repository', async () => {
      logDetail('Running: git init')
      await runGitCommand('git init', TARGET_DIR)
      logDetail('Git repository initialized')
    })

    // Step 4: Configure sparse checkout
    await runStep('Configure Sparse Checkout', async () => {
      logDetail('Enabling sparse checkout (cone mode)...')
      await runGitCommand('git config core.sparseCheckout true', TARGET_DIR)
      await runGitCommand('git config core.sparseCheckoutCone true', TARGET_DIR)
      logDetail('Sparse checkout configured')
    })

    // Step 5: Set sparse checkout patterns
    await runStep('Set Sparse Checkout Patterns', async () => {
      logDetail('Setting sparse checkout pattern to src/...')
      const sparseCheckoutFile = path.join(TARGET_DIR, '.git', 'info', 'sparse-checkout')
      await fs.mkdir(path.dirname(sparseCheckoutFile), { recursive: true })
      await fs.writeFile(sparseCheckoutFile, 'src/\n', 'utf8')
      logDetail('Sparse checkout pattern set')
    })

    // Step 6: Add remote
    await runStep('Add Remote', async () => {
      logDetail(`Adding remote origin: ${VSCODE_REPO_URL}`)
      await runGitCommand(`git remote add origin ${VSCODE_REPO_URL}`, TARGET_DIR)
      logDetail('Remote added')
    })

    // Step 7: Fetch repository (shallow, single branch)
    await runStep('Fetch Repository', async () => {
      logDetail('Fetching repository (shallow clone, depth=1, single branch)...')
      logDetail('This may take a few minutes depending on your connection speed...')
      
      const fetchCommand = `git fetch --depth=1 --no-tags origin ${ref}`
      const result = await runGitCommand(fetchCommand, TARGET_DIR)
      
      if (result.stderr && !result.stderr.includes('remote:') && !result.stderr.includes('Receiving objects')) {
        // If main branch fails, try master
        if (result.stderr.includes('not found') || result.stderr.includes('fatal')) {
          logDetail('main branch not found, trying master...')
          await runGitCommand('git fetch --depth=1 --no-tags origin master', TARGET_DIR)
        }
      }
      
      logDetail('Repository fetched')
    })

    // Step 8: Checkout files
    await runStep('Checkout Files', async () => {
      logDetail('Checking out files with sparse checkout...')
      
      // Try to checkout the fetched branch
      try {
        await runGitCommand('git checkout FETCH_HEAD', TARGET_DIR)
      } catch (error) {
        // If FETCH_HEAD doesn't work, try the branch name directly
        try {
          await runGitCommand(`git checkout ${ref}`, TARGET_DIR)
        } catch (error2) {
          await runGitCommand('git checkout master', TARGET_DIR)
        }
      }
      
      logDetail('Files checked out')
    })

    // Step 9: Verify extraction
    await runStep('Verify Extraction', async () => {
      logDetail('Verifying extracted files...')
      const srcDir = path.join(TARGET_DIR, 'src')
      const srcExists = await fs.access(srcDir).then(() => true).catch(() => false)
      
      if (srcExists) {
        const fileCount = await countFiles(srcDir)
        logDetail(`Found ${fileCount} files in src/ directory`)
      } else {
        throw new Error('src/ directory not found after extraction')
      }
    })

    // Final summary
    const totalTime = Date.now() - startTime
    const srcDir = path.join(TARGET_DIR, 'src')
    const fileCount = await countFiles(srcDir)

    console.log()
    console.log('✅ Success!')
    console.log('='.repeat(60))
    console.log(`Extracted ${fileCount} files from src/ directory`)
    console.log(`Total time: ${formatTime(totalTime)}`)
    console.log(`Target directory: ${TARGET_DIR}`)
    console.log()

    if (stepTimings.length > 0) {
      console.log('⏱️  Detailed timeline:')
      stepTimings.forEach(({ label, duration }) => {
        console.log(`   - ${label}: ${formatTime(duration)}`)
      })
      console.log()
    }

    console.log('📁 Directory structure:')
    console.log(`   ${TARGET_DIR}/`)
    console.log(`   ├── .git/`)
    console.log(`   └── src/`)
    console.log()
    console.log('ℹ️  Note: This uses native git commands with sparse checkout')
    console.log('   Compare timings with the universal-git version for performance analysis.')
    console.log()

  } catch (error: any) {
    console.error()
    console.error('❌ Error:', error.message)
    if (error.stack) {
      console.error('\nStack trace:')
      console.error(error.stack)
    }
    process.exit(1)
  }
}

// Run the example
main().catch((error) => {
  console.error('Fatal error:', error)
  process.exit(1)
})

