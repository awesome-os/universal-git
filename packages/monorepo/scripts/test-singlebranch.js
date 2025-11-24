// Quick test to verify singleBranch regression
import * as _fs from 'fs'
import { FileSystem } from '@awesome-os/universal-git-src/models/FileSystem.ts'
import * as git from '@awesome-os/universal-git-src'
import http from '@awesome-os/universal-git-src/http/node/index.ts'
import { join } from '@awesome-os/universal-git-src/utils/join.ts'
import { execSync } from 'child_process'
import { tmpdir } from 'os'
import { mkdtemp, rm } from 'fs/promises'

const fs = new FileSystem(_fs)

async function testSingleBranch() {
  // Create temporary directories
  const sourceDir = await mkdtemp(join(tmpdir(), 'test-source-'))
  const targetDir = await mkdtemp(join(tmpdir(), 'test-target-'))
  
  try {
    // Create source repository
    execSync('git init', { cwd: sourceDir })
    execSync('git config user.name "Test"', { cwd: sourceDir })
    execSync('git config user.email "test@test.com"', { cwd: sourceDir })
    
    // Create main branch
    await fs.write(join(sourceDir, 'main.txt'), 'main content')
    execSync('git add main.txt', { cwd: sourceDir })
    execSync('git commit -m "Main commit"', { cwd: sourceDir })
    
    // Create feature branch
    execSync('git checkout -b feature', { cwd: sourceDir })
    await fs.write(join(sourceDir, 'feature.txt'), 'feature content')
    execSync('git add feature.txt', { cwd: sourceDir })
    execSync('git commit -m "Feature commit"', { cwd: sourceDir })
    execSync('git checkout main', { cwd: sourceDir })
    
    console.log('Source repo created with main and feature branches')
    
    // Clone with singleBranch: true
    console.log('Cloning with singleBranch: true, ref: feature...')
    await git.clone({
      fs,
      http,
      dir: targetDir,
      gitdir: join(targetDir, '.git'),
      url: sourceDir,
      ref: 'feature',
      singleBranch: true,
    })
    
    // Check what branches exist
    const branches = await git.listBranches({ fs, gitdir: join(targetDir, '.git') })
    console.log('Branches after clone:', branches)
    
    // DEBUG: Check reflog for each branch to see when/how they were created
    // Use dynamic import with .ts extension (Node.js with --experimental-strip-types or tsx)
    const readLogModule = await import('@awesome-os/universal-git-src/git/logs/readLog.ts')
    const { readLog } = readLogModule
    const { getConfig } = await import('@awesome-os/universal-git-src/commands/getConfig.ts')
    
    // Check if reflog is enabled
    try {
      const logAllRefUpdates = await getConfig({
        fs,
        gitdir: join(targetDir, '.git'),
        path: 'core.logAllRefUpdates'
      })
      console.log(`\n[DEBUG] core.logAllRefUpdates: ${logAllRefUpdates}`)
    } catch (e) {
      console.log(`\n[DEBUG] Could not read core.logAllRefUpdates config: ${e.message}`)
    }
    
    // Also check the actual ref files to see their OIDs
    console.log('\n[DEBUG] Checking ref files directly:')
    for (const branch of branches) {
      try {
        const refPath = join(targetDir, '.git', 'refs', 'heads', branch)
        const refContent = await fs.read(refPath, 'utf8')
        console.log(`  ${branch}: ${refContent.trim().substring(0, 8)}`)
        
        // Check if reflog file exists
        const reflogPath = join(targetDir, '.git', 'logs', 'refs', 'heads', branch)
        const reflogExists = await fs.exists(reflogPath)
        console.log(`    Reflog file exists: ${reflogExists}`)
        
        // Check reflog
        const reflog = await readLog({ 
          fs, 
          gitdir: join(targetDir, '.git'), 
          ref: `refs/heads/${branch}`, 
          parsed: true 
        })
        if (reflog.length > 0) {
          console.log(`    [REFLOG] ${branch}:`)
          reflog.forEach((entry, idx) => {
            console.log(`      ${idx}: ${entry.oldOid.substring(0, 8)} -> ${entry.newOid.substring(0, 8)} | ${entry.message}`)
          })
        } else {
          console.log(`    [REFLOG] ${branch}: (no reflog entries)`)
        }
      } catch (e) {
        console.log(`  ${branch}: (error: ${e.message})`)
      }
    }
    
    // Check remote branches
    const remoteBranches = await git.listBranches({ 
      fs, 
      gitdir: join(targetDir, '.git'),
      remote: 'origin'
    })
    console.log('Remote branches after clone:', remoteBranches)
    
    // Verify feature branch was checked out
    const currentBranch = await git.currentBranch({ fs, gitdir: join(targetDir, '.git') })
    console.log('Current branch:', currentBranch)
    
    // Check if feature.txt exists
    const featureExists = await fs.exists(join(targetDir, 'feature.txt'))
    console.log('feature.txt exists:', featureExists)
    
    if (branches.length === 1 && branches[0] === 'feature' && featureExists) {
      console.log('✅ singleBranch: true is working correctly!')
    } else {
      console.log('❌ singleBranch: true is NOT working correctly!')
      console.log('Expected: 1 branch (feature), feature.txt exists')
      console.log(`Got: ${branches.length} branches, feature.txt exists: ${featureExists}`)
    }
    
  } finally {
    // Cleanup
    await rm(sourceDir, { recursive: true, force: true }).catch(() => {})
    await rm(targetDir, { recursive: true, force: true }).catch(() => {})
  }
}

testSingleBranch().catch(console.error)

