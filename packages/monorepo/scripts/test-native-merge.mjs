import { execSync } from 'child_process'
import { mkdtemp, rm } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'

const tmpDir = await mkdtemp(join(tmpdir(), 'test-merge-'))

try {
  // Initialize repo
  execSync('git init', { cwd: tmpDir, stdio: 'pipe' })
  execSync('git config user.name "Test"', { cwd: tmpDir, stdio: 'pipe' })
  execSync('git config user.email "test@test.com"', { cwd: tmpDir, stdio: 'pipe' })
  
  // Create initial commit with files 1-10
  for (let i = 1; i <= 10; i++) {
    const fs = await import('fs/promises')
    await fs.writeFile(join(tmpDir, `file${i}.txt`), `content ${i}\n`)
  }
  execSync('git add .', { cwd: tmpDir, stdio: 'pipe' })
  execSync('git commit -m "add files 1-10"', { cwd: tmpDir, stdio: 'pipe' })
  
  // Create delete-first-half branch and delete files 1-5
  execSync('git checkout -b delete-first-half', { cwd: tmpDir, stdio: 'pipe' })
  for (let i = 1; i <= 5; i++) {
    execSync(`git rm file${i}.txt`, { cwd: tmpDir, stdio: 'pipe' })
  }
  execSync('git commit -m "delete first half"', { cwd: tmpDir, stdio: 'pipe' })
  
  // Create delete-second-half branch and delete files 6-10
  execSync('git checkout -b delete-second-half main', { cwd: tmpDir, stdio: 'pipe' })
  for (let i = 6; i <= 10; i++) {
    execSync(`git rm file${i}.txt`, { cwd: tmpDir, stdio: 'pipe' })
  }
  execSync('git commit -m "delete second half"', { cwd: tmpDir, stdio: 'pipe' })
  
  // Show trees
  console.log('=== OURS (delete-first-half) ===')
  console.log(execSync('git ls-tree -r delete-first-half', { cwd: tmpDir, encoding: 'utf-8' }))
  
  console.log('=== THEIRS (delete-second-half) ===')
  console.log(execSync('git ls-tree -r delete-second-half', { cwd: tmpDir, encoding: 'utf-8' }))
  
  console.log('=== BASE ===')
  const baseOid = execSync('git merge-base delete-first-half delete-second-half', { cwd: tmpDir, encoding: 'utf-8' }).trim()
  console.log(execSync(`git ls-tree -r ${baseOid}`, { cwd: tmpDir, encoding: 'utf-8' }))
  
  // Perform merge
  execSync('git checkout delete-first-half', { cwd: tmpDir, stdio: 'pipe' })
  execSync('git merge delete-second-half --no-edit', { cwd: tmpDir, stdio: 'pipe' })
  
  console.log('=== MERGED ===')
  const merged = execSync('git ls-tree -r HEAD', { cwd: tmpDir, encoding: 'utf-8' })
  console.log(merged)
  
  // Get tree OID
  const treeOid = execSync('git rev-parse HEAD^{tree}', { cwd: tmpDir, encoding: 'utf-8' }).trim()
  console.log(`\nTree OID: ${treeOid}`)
  
} finally {
  await rm(tmpDir, { recursive: true, force: true })
}

