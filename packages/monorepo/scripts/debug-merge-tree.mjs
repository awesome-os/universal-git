import { execSync } from 'child_process'
import { readFileSync, writeFileSync, rmSync, mkdirSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

// Create a temporary directory
const tmpDir = join(tmpdir(), `git-merge-test-${Date.now()}`)
mkdirSync(tmpDir, { recursive: true })

try {
  // Initialize git repo
  execSync('git init', { cwd: tmpDir, stdio: 'pipe' })
  execSync('git config user.name "Test"', { cwd: tmpDir, stdio: 'pipe' })
  execSync('git config user.email "test@test.com"', { cwd: tmpDir, stdio: 'pipe' })

  // Create initial commit with .gitkeep
  writeFileSync(join(tmpDir, '.gitkeep'), '')
  execSync('git add .gitkeep', { cwd: tmpDir, stdio: 'pipe' })
  execSync('git commit -m "initial commit"', { 
    cwd: tmpDir, 
    stdio: 'pipe',
    env: { ...process.env, GIT_AUTHOR_DATE: '1262356927 +0000', GIT_COMMITTER_DATE: '1262356927 +0000' }
  })

  // Create delete-first-half branch with files 1-10, then delete 1-5
  execSync('git checkout -b delete-first-half', { cwd: tmpDir, stdio: 'pipe' })
  for (let i = 1; i <= 10; i++) {
    writeFileSync(join(tmpDir, `file${i}.txt`), `content ${i}\n`)
  }
  execSync('git add file*.txt', { cwd: tmpDir, stdio: 'pipe' })
  execSync('git commit -m "add files 1-10"', { 
    cwd: tmpDir, 
    stdio: 'pipe',
    env: { ...process.env, GIT_AUTHOR_DATE: '1262356928 +0000', GIT_COMMITTER_DATE: '1262356928 +0000' }
  })
  for (let i = 1; i <= 5; i++) {
    execSync(`git rm file${i}.txt`, { cwd: tmpDir, stdio: 'pipe' })
  }
  execSync('git commit -m "delete first half"', { 
    cwd: tmpDir, 
    stdio: 'pipe',
    env: { ...process.env, GIT_AUTHOR_DATE: '1262356929 +0000', GIT_COMMITTER_DATE: '1262356929 +0000' }
  })

  // Create delete-second-half branch with files 1-10, then delete 6-10
  execSync('git checkout -b delete-second-half master', { cwd: tmpDir, stdio: 'pipe' })
  for (let i = 1; i <= 10; i++) {
    writeFileSync(join(tmpDir, `file${i}.txt`), `content ${i}\n`)
  }
  execSync('git add file*.txt', { cwd: tmpDir, stdio: 'pipe' })
  execSync('git commit -m "add files 1-10"', { 
    cwd: tmpDir, 
    stdio: 'pipe',
    env: { ...process.env, GIT_AUTHOR_DATE: '1262356930 +0000', GIT_COMMITTER_DATE: '1262356930 +0000' }
  })
  for (let i = 6; i <= 10; i++) {
    execSync(`git rm file${i}.txt`, { cwd: tmpDir, stdio: 'pipe' })
  }
  execSync('git commit -m "delete second half"', { 
    cwd: tmpDir, 
    stdio: 'pipe',
    env: { ...process.env, GIT_AUTHOR_DATE: '1262356931 +0000', GIT_COMMITTER_DATE: '1262356931 +0000' }
  })

  // Show merge base
  const mergeBase = execSync('git merge-base delete-first-half delete-second-half', { 
    cwd: tmpDir, 
    encoding: 'utf-8' 
  }).trim()
  console.log(`\nMerge base: ${mergeBase}`)
  const baseFiles = execSync(`git ls-tree -r ${mergeBase}`, { 
    cwd: tmpDir, 
    encoding: 'utf-8' 
  })
  console.log(`\nBase tree contents:`)
  console.log(baseFiles)

  // Show files in delete-first-half (ours)
  const oursFiles = execSync('git ls-tree -r delete-first-half', { 
    cwd: tmpDir, 
    encoding: 'utf-8' 
  })
  console.log(`\nOurs (delete-first-half) tree contents:`)
  console.log(oursFiles)

  // Show files in delete-second-half (theirs)
  const theirsFiles = execSync('git ls-tree -r delete-second-half', { 
    cwd: tmpDir, 
    encoding: 'utf-8' 
  })
  console.log(`\nTheirs (delete-second-half) tree contents:`)
  console.log(theirsFiles)

  // Perform merge with native git
  execSync('git checkout delete-first-half', { cwd: tmpDir, stdio: 'pipe' })
  try {
    execSync('git merge --no-ff -m "Merge branch \'delete-second-half\' into delete-first-half" delete-second-half', { 
      cwd: tmpDir,
      env: { ...process.env, GIT_AUTHOR_DATE: '1262356942 +0000', GIT_COMMITTER_DATE: '1262356942 +0000' },
      stdio: 'pipe'
    })
  } catch (e) {
    console.log('\nMerge had conflicts, checking status...')
    const status = execSync('git status --porcelain', { cwd: tmpDir, encoding: 'utf-8' })
    console.log('Status:', status)
  }

  // Show files in native git merged tree
  const nativeFiles = execSync('git ls-tree -r HEAD', { 
    cwd: tmpDir, 
    encoding: 'utf-8' 
  })
  console.log(`\nNative git merged tree contents:`)
  console.log(nativeFiles)

  const nativeFileList = nativeFiles.split('\n').filter(l => l.trim()).map(l => l.split('\t')[1]).filter(Boolean)
  console.log(`\nNative git files: ${nativeFileList.join(', ')}`)

} finally {
  // Cleanup
  rmSync(tmpDir, { recursive: true, force: true })
}

