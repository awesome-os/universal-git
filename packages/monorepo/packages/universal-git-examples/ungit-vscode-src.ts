#!/usr/bin/env node
/**
 * Ungit Example: Visual Studio Code - src directory only
 * 
 * This script uses ungit to extract only the src/ directory from VS Code repository
 * into a .ungit directory. Unlike clone, ungit doesn't create a .git directory,
 * making it perfect for CI/CD pipelines and production deployments.
 */

import 'dotenv/config.js'
import path from 'path'
import * as _fs from 'fs'
import { FileSystem, type RawFileSystemProvider } from '@awesome-os/universal-git-src/models/FileSystem.ts'
import { createFileSystem } from '@awesome-os/universal-git-src/utils/createFileSystem.ts'
import * as git from '@awesome-os/universal-git-src/index.ts'
import http from '@awesome-os/universal-git-src/http/node/index.ts'

// Wrap Node.js fs in FileSystem instance (required for universal-git)
const fs: FileSystem = createFileSystem(_fs as unknown as RawFileSystemProvider)

// Configuration
const VSCODE_REPO_URL = 'https://github.com/microsoft/vscode.git'
const TARGET_DIR = path.join(process.cwd(), '.ungit')
const ref = 'main' // VS Code uses 'main' as default branch
const sparsePath = 'src'

// Helper to format time
function formatTime(ms) {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`
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
  
  console.log('🚀 Ungit Example: VS Code src directory')
  console.log('=' .repeat(60))
  console.log(`Repository: ${VSCODE_REPO_URL}`)
  console.log(`Target directory: ${TARGET_DIR}`)
  console.log(`Sparse path: src/`)
  console.log('=' .repeat(60))
  console.log()

  try {
    // Check if target directory already exists
    if (await fs.exists(TARGET_DIR)) {
      console.log(`⚠️  Target directory ${TARGET_DIR} already exists`)
      console.log('   Removing existing directory...')
      await fs.rmdir(TARGET_DIR, { recursive: true })
    }

    console.log('📥 Extracting src/ directory from VS Code repository...')
    console.log('   Using shallow clone (depth=1) and single branch for faster download')
    console.log('   This may take a few minutes depending on your connection speed.')
    console.log()

    // Use ungit to extract only the src directory
    // Try 'main' first, fallback to 'master' if needed
    try {
      await git.ungit({
        fs,
        http,
        dir: TARGET_DIR,
        url: VSCODE_REPO_URL,
        ref, // VS Code uses 'main' as default branch
        sparsePath,
        cone: true, // Use cone mode for better performance
        depth: 1, // Shallow clone: only get the latest commit
        singleBranch: true, // Only fetch the main branch
        onProgress: logProgress,
      })
    } catch (error) {
      // If 'main' fails, try 'master' (for older repositories)
      if (error.message && error.message.includes('not found')) {
        console.log('   Trying master branch instead...')
        await git.ungit({
          fs,
          http,
          dir: TARGET_DIR,
          url: VSCODE_REPO_URL,
          ref: 'master',
          sparsePath: 'src',
          cone: true,
          depth: 1, // Shallow clone: only get the latest commit
          singleBranch: true,
          onProgress: logProgress,
        })
      } else {
        throw error
      }
    }

    console.log() // New line after progress
    console.log()

    // Verify the extraction
    const srcDir = path.join(TARGET_DIR, 'src')
    const srcExists = await fs.exists(srcDir)
    
    if (srcExists) {
      // Count files in src directory
      async function countFiles(dir) {
        let count = 0
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
        return count
      }

      const fileCount = await countFiles(srcDir)
      const elapsed = formatTime(Date.now() - startTime)

      console.log('✅ Success!')
      console.log('=' .repeat(60))
      console.log(`Extracted ${fileCount} files from src/ directory`)
      console.log(`Time elapsed: ${elapsed}`)
      console.log(`Target directory: ${TARGET_DIR}`)
      console.log()
      console.log('📁 Directory structure:')
      console.log(`   ${TARGET_DIR}/`)
      console.log(`   └── src/`)
      console.log()
      console.log('ℹ️  Note: No .git directory was created (this is the point of ungit!)')
      console.log('   The target directory contains only working tree files.')
      console.log()

      // Verify no .git directory exists
      const gitDir = path.join(TARGET_DIR, '.git')
      const gitExists = await fs.exists(gitDir)
      
      if (gitExists) {
        console.log('⚠️  Warning: .git directory found (this shouldn\'t happen with ungit)')
      } else {
        console.log('✅ Verified: No .git directory (as expected)')
      }
    } else {
      console.log('❌ Error: src/ directory not found after extraction')
      process.exit(1)
    }

  } catch (error) {
    console.error()
    console.error('❌ Error:', error.message)
    if (error.stack) {
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

