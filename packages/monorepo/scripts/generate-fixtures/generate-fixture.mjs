/**
 * Fixture Generator
 * 
 * Uses native git CLI commands to build fixtures from scratch
 */

import { execSync } from 'child_process'
import { join } from 'path'
import { existsSync, rmSync, mkdirSync, writeFileSync, readFileSync, readdirSync, renameSync } from 'fs'
import { tmpdir } from 'os'
import { analyzeTests } from './analyze-tests.mjs'
import { fileURLToPath } from 'url'
import { dirname } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const projectRoot = join(__dirname, '..', '..')

/**
 * Generate a fixture using git CLI commands
 * @param {string} fixtureName - Name of the fixture (e.g., 'test-merge')
 * @param {string} fixturesDir - Directory where fixtures are stored
 * @param {string} objectFormat - Object format: 'sha1' or 'sha256' (default: 'sha1')
 */
export async function generateFixture(fixtureName, fixturesDir, objectFormat = 'sha1') {
  const fixturePath = join(fixturesDir, `${fixtureName}.git`)
  
  // Find the test file for this fixture
  const testFile = findTestFile(fixtureName)
  if (!testFile) {
    throw new Error(`Could not find test file for fixture: ${fixtureName}`)
  }

  // Analyze the test file
  const definition = await analyzeTests(testFile)
  
  // Generate fixture based on fixture name
  if (fixtureName === 'test-merge') {
    await generateTestMergeFixture(fixturePath, definition, objectFormat)
  } else {
    throw new Error(`Fixture generation not yet implemented for: ${fixtureName}`)
  }
}

/**
 * Find the test file that uses this fixture
 */
function findTestFile(fixtureName) {
  const testFiles = [
    join(projectRoot, 'tests', 'commands', 'merge.test.ts'),
    join(projectRoot, 'tests', 'commands', 'abortMerge.test.ts'),
  ]
  
  for (const testFile of testFiles) {
    if (existsSync(testFile)) {
      const content = readFileSync(testFile, 'utf-8')
      if (content.includes(`makeFixture('${fixtureName}')`) || 
          content.includes(`makeFixture("${fixtureName}")`)) {
        return testFile
      }
    }
  }
  return null
}

/**
 * Validate fixture integrity by checking all referenced objects exist
 * @param {string} fixturePath - Path to the bare git repository fixture
 */
export async function validateFixtureIntegrity(fixturePath) {
  try {
    // Get all refs
    const refsOutput = execSync('git for-each-ref --format="%(refname:short) %(objectname)"', {
      cwd: fixturePath,
      encoding: 'utf-8'
    })
    
    const refs = refsOutput.trim().split('\n').filter(line => line.trim())
    const missingObjects = []
    
    // Function to recursively check tree entries
    async function checkTree(oid, path = 'root') {
      try {
        // Check if object exists
        execSync(`git cat-file -e ${oid}`, { cwd: fixturePath, stdio: 'pipe' })
        
        // Get object type
        const type = execSync(`git cat-file -t ${oid}`, { 
          cwd: fixturePath, 
          encoding: 'utf-8' 
        }).trim()
        
        if (type === 'tree') {
          // Get tree entries
          const treeOutput = execSync(`git ls-tree ${oid}`, {
            cwd: fixturePath,
            encoding: 'utf-8'
          })
          
          const entries = treeOutput.trim().split('\n').filter(line => line.trim())
          for (const entry of entries) {
            // Parse entry: mode type oid\tpath
            const match = entry.match(/^(\d+) (\S+) ([a-f0-9]+)\t(.+)$/)
            if (match) {
              const [, mode, entryType, entryOid, entryPath] = match
              const fullPath = path === 'root' ? entryPath : `${path}/${entryPath}`
              
              // Check if the referenced object exists
              try {
                execSync(`git cat-file -e ${entryOid}`, { 
                  cwd: fixturePath, 
                  stdio: 'pipe' 
                })
                
                // If it's a tree, recursively check it
                if (entryType === 'tree') {
                  await checkTree(entryOid, fullPath)
                }
              } catch (e) {
                missingObjects.push({
                  oid: entryOid,
                  type: entryType,
                  path: fullPath,
                  referencedBy: path,
                  entryName: entryPath
                })
              }
            }
          }
        } else if (type === 'commit') {
          // Get commit tree and check it
          try {
            const treeOid = execSync(`git rev-parse "${oid}^{tree}"`, {
              cwd: fixturePath,
              encoding: 'utf-8'
            }).trim()
            await checkTree(treeOid, `commit ${oid}`)
          } catch (e) {
            // Commit doesn't exist or can't get tree
            missingObjects.push({
              oid,
              path: `commit ${oid}`,
              error: e.message
            })
          }
        }
      } catch (e) {
        // Object doesn't exist
        missingObjects.push({
          oid,
          path,
          error: e.message
        })
      }
    }
    
    // Check all refs
    for (const refLine of refs) {
      const [ref, oid] = refLine.split(' ')
      if (oid) {
        await checkTree(oid, `ref ${ref}`)
      }
    }
    
    if (missingObjects.length > 0) {
      console.error('\n❌ Fixture integrity validation failed!')
      console.error(`Found ${missingObjects.length} missing object(s):\n`)
      for (const missing of missingObjects) {
        if (missing.entryName) {
          console.error(
            `  - Tree object ${missing.oid} (${missing.type}) referenced by entry "${missing.entryName}" ` +
            `in ${missing.referencedBy} at path "${missing.path}" does not exist`
          )
        } else {
          console.error(`  - Object ${missing.oid} at ${missing.path} does not exist: ${missing.error}`)
        }
      }
      throw new Error(
        `Fixture validation failed: ${missingObjects.length} missing object(s). ` +
        `This indicates the fixture was generated incorrectly. All tree entries must reference valid objects.`
      )
    }
    
    console.log('✓ All referenced objects exist')
  } catch (error) {
    if (error.message.includes('Fixture validation failed')) {
      throw error
    }
    console.warn(`Warning: Could not validate fixture integrity: ${error.message}`)
    // Don't fail fixture generation if validation itself fails, but log the warning
  }
}

/**
 * Generate the test-merge fixture
 */
async function generateTestMergeFixture(fixturePath, definition, objectFormat = 'sha1') {
  console.log(`Generating test-merge fixture with ${objectFormat.toUpperCase()}...`)
  
  // Create temporary directory for git operations
  const tempDir = join(tmpdir(), `fixture-gen-${Date.now()}`)
  const workTree = join(tempDir, 'repo')
  mkdirSync(workTree, { recursive: true })
  
  try {
    // Initialize regular repository (we'll convert to bare later)
    const initArgs = objectFormat === 'sha256' 
      ? `git init --object-format=sha256 "${workTree}"`
      : `git init "${workTree}"`
    execSync(initArgs, { 
      stdio: 'inherit'
    })
    
    // Set git config
    execSync(`git config user.name "Mr. Test"`, { 
      cwd: workTree,
      stdio: 'inherit'
    })
    execSync(`git config user.email "mrtest@example.com"`, { 
      cwd: workTree,
      stdio: 'inherit'
    })
    
    // Create the fixture structure
    await buildTestMergeStructure(workTree, fixturePath)
    
    // Convert to bare repository
    // Backup existing fixture if it exists
    const backupPath = `${fixturePath}.backup`
    if (existsSync(fixturePath)) {
      try {
        if (existsSync(backupPath)) {
          rmSync(backupPath, { recursive: true, force: true })
        }
        // Try to rename instead of delete to avoid permission issues
        renameSync(fixturePath, backupPath)
      } catch (e) {
        console.warn(`Warning: Could not backup existing fixture: ${e.message}`)
        // Try to delete anyway
        try {
          rmSync(fixturePath, { recursive: true, force: true })
        } catch (e2) {
          throw new Error(`Cannot remove existing fixture at ${fixturePath}. Please close any programs using it and try again.`)
        }
      }
    }
    mkdirSync(fixturePath, { recursive: true })
    
    // Copy git directory contents to bare repo
    // Use --no-local to ensure all objects are copied (including packfiles)
    execSync(`git clone --bare --no-local "${workTree}" "${fixturePath}"`, {
      stdio: 'inherit'
    })
    
    // Ensure all objects are accessible by running fsck
    // This will detect any missing objects
    try {
      execSync('git fsck --full --no-progress', {
        cwd: fixturePath,
        stdio: 'pipe'
      })
    } catch (e) {
      console.warn(`Warning: git fsck reported issues: ${e.message}`)
      // Don't fail, but log the warning - validation will catch missing objects
    }
    
    // Remove the temporary .git directory from the clone
    const gitDirInBare = join(fixturePath, '.git')
    if (existsSync(gitDirInBare)) {
      // Move contents of .git to root
      const files = readdirSync(gitDirInBare)
      for (const file of files) {
        const src = join(gitDirInBare, file)
        const dst = join(fixturePath, file)
        if (existsSync(dst)) {
          rmSync(dst, { recursive: true, force: true })
        }
        renameSync(src, dst)
      }
      rmSync(gitDirInBare, { recursive: true, force: true })
    }
    
    // Validate fixture integrity: ensure all referenced objects exist
    console.log('Validating fixture integrity...')
    await validateFixtureIntegrity(fixturePath)
    
    console.log('✓ Fixture generated successfully')
  } catch (error) {
    // Clean up on error
    if (existsSync(fixturePath)) {
      rmSync(fixturePath, { recursive: true, force: true })
    }
    throw error
  } finally {
    // Clean up temp directory
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true })
    }
  }
}

/**
 * Build the test-merge repository structure
 */
async function buildTestMergeStructure(workTree, gitdir) {
  // Create initial commit on master
  writeFileSync(join(workTree, 'o.txt'), 'original content\n')
  execSync('git add o.txt', { cwd: workTree, stdio: 'inherit' })
  execSync('git commit -m "initial commit"', { 
    cwd: workTree,
    env: { ...process.env, GIT_AUTHOR_DATE: '1262356920 +0000', GIT_COMMITTER_DATE: '1262356920 +0000' },
    stdio: 'inherit'
  })
  
  const masterCommit = execSync('git rev-parse HEAD', { 
    cwd: workTree, 
    encoding: 'utf-8' 
  }).trim()
  
  // Create linear chain: oldest -> medium -> master -> newest
  execSync(`git branch oldest ${masterCommit}`, { cwd: workTree, stdio: 'inherit' })
  execSync(`git branch medium ${masterCommit}`, { cwd: workTree, stdio: 'inherit' })
  execSync(`git branch newest ${masterCommit}`, { cwd: workTree, stdio: 'inherit' })
  
  // Add commits to newest (fast-forward from master)
  execSync('git checkout newest', { cwd: workTree, stdio: 'inherit' })
  writeFileSync(join(workTree, 'newfile.txt'), 'new content\n')
  execSync('git add newfile.txt', { cwd: workTree, stdio: 'inherit' })
  execSync('git commit -m "add newfile"', { 
    cwd: workTree,
    env: { ...process.env, GIT_AUTHOR_DATE: '1262356921 +0000', GIT_COMMITTER_DATE: '1262356921 +0000' },
    stdio: 'inherit'
  })
  
  // Create feature branches from master
  const baseCommit = masterCommit
  
  // Branch 'a' - modify o.txt (add line at end)
  execSync(`git checkout -b a ${baseCommit}`, { cwd: workTree, stdio: 'inherit' })
  writeFileSync(join(workTree, 'o.txt'), 'original content\nmodified by a\n')
  execSync('git add o.txt', { cwd: workTree, stdio: 'inherit' })
  execSync('git commit -m "change o.txt"', { 
    cwd: workTree,
    env: { ...process.env, GIT_AUTHOR_DATE: '1262356922 +0000', GIT_COMMITTER_DATE: '1262356922 +0000' },
    stdio: 'inherit'
  })
  
  // Branch 'b' - modify o.txt differently (add different line)
  execSync(`git checkout -b b ${baseCommit}`, { cwd: workTree, stdio: 'inherit' })
  writeFileSync(join(workTree, 'o.txt'), 'original content\nmodified by b\n')
  execSync('git add o.txt', { cwd: workTree, stdio: 'inherit' })
  execSync('git commit -m "change o.txt"', { 
    cwd: workTree,
    env: { ...process.env, GIT_AUTHOR_DATE: '1262356923 +0000', GIT_COMMITTER_DATE: '1262356923 +0000' },
    stdio: 'inherit'
  })
  
  // Branch 'c' - modify o.txt with conflict
  execSync(`git checkout -b c ${baseCommit}`, { cwd: workTree, stdio: 'inherit' })
  writeFileSync(join(workTree, 'o.txt'), 'modified by c\n')
  execSync('git add o.txt', { cwd: workTree, stdio: 'inherit' })
  execSync('git commit -m "add file c"', { 
    cwd: workTree,
    env: { ...process.env, GIT_AUTHOR_DATE: '1262356924 +0000', GIT_COMMITTER_DATE: '1262356924 +0000' },
    stdio: 'inherit'
  })
  
  // Branch 'd' - modify file mode (o.txt already exists from base)
  execSync(`git checkout -b d ${baseCommit}`, { cwd: workTree, stdio: 'inherit' })
  // Change file mode (make executable) - use git update-index
  execSync('git update-index --chmod=+x o.txt', { cwd: workTree, stdio: 'inherit' })
  execSync('git commit -m "change file mode"', { 
    cwd: workTree,
    env: { ...process.env, GIT_AUTHOR_DATE: '1262356925 +0000', GIT_COMMITTER_DATE: '1262356925 +0000' },
    stdio: 'inherit'
  })
  
  // Branch 'add-files' - add files
  execSync(`git checkout -b add-files ${baseCommit}`, { cwd: workTree, stdio: 'inherit' })
  writeFileSync(join(workTree, 'file1.txt'), 'file1\n')
  writeFileSync(join(workTree, 'file2.txt'), 'file2\n')
  execSync('git add file1.txt file2.txt', { cwd: workTree, stdio: 'inherit' })
  execSync('git commit -m "add files"', { 
    cwd: workTree,
    env: { ...process.env, GIT_AUTHOR_DATE: '1262356926 +0000', GIT_COMMITTER_DATE: '1262356926 +0000' },
    stdio: 'inherit'
  })
  
  // Branch 'remove-files' - remove o.txt
  execSync(`git checkout -b remove-files ${baseCommit}`, { cwd: workTree, stdio: 'inherit' })
  execSync('git rm o.txt', { cwd: workTree, stdio: 'inherit' })
  execSync('git commit -m "remove o.txt"', { 
    cwd: workTree,
    env: { ...process.env, GIT_AUTHOR_DATE: '1262356927 +0000', GIT_COMMITTER_DATE: '1262356927 +0000' },
    stdio: 'inherit'
  })
  
  // Branch 'delete-first-half' - delete first half of files
  execSync(`git checkout -b delete-first-half ${baseCommit}`, { cwd: workTree, stdio: 'inherit' })
  // Create multiple files
  for (let i = 1; i <= 10; i++) {
    writeFileSync(join(workTree, `file${i}.txt`), `content ${i}\n`)
  }
  execSync('git add file*.txt', { cwd: workTree, stdio: 'inherit' })
  execSync('git commit -m "add files 1-10"', { 
    cwd: workTree,
    env: { ...process.env, GIT_AUTHOR_DATE: '1262356928 +0000', GIT_COMMITTER_DATE: '1262356928 +0000' },
    stdio: 'inherit'
  })
  // Delete first half
  for (let i = 1; i <= 5; i++) {
    execSync(`git rm file${i}.txt`, { cwd: workTree, stdio: 'inherit' })
  }
  execSync('git commit -m "delete first half"', { 
    cwd: workTree,
    env: { ...process.env, GIT_AUTHOR_DATE: '1262356929 +0000', GIT_COMMITTER_DATE: '1262356929 +0000' },
    stdio: 'inherit'
  })
  
  // Branch 'delete-second-half' - delete second half of files
  execSync(`git checkout -b delete-second-half ${baseCommit}`, { cwd: workTree, stdio: 'inherit' })
  // Create multiple files
  for (let i = 1; i <= 10; i++) {
    writeFileSync(join(workTree, `file${i}.txt`), `content ${i}\n`)
  }
  execSync('git add file*.txt', { cwd: workTree, stdio: 'inherit' })
  execSync('git commit -m "add files 1-10"', { 
    cwd: workTree,
    env: { ...process.env, GIT_AUTHOR_DATE: '1262356930 +0000', GIT_COMMITTER_DATE: '1262356930 +0000' },
    stdio: 'inherit'
  })
  // Delete second half
  for (let i = 6; i <= 10; i++) {
    execSync(`git rm file${i}.txt`, { cwd: workTree, stdio: 'inherit' })
  }
  execSync('git commit -m "delete second half"', { 
    cwd: workTree,
    env: { ...process.env, GIT_AUTHOR_DATE: '1262356931 +0000', GIT_COMMITTER_DATE: '1262356931 +0000' },
    stdio: 'inherit'
  })
  
  // Branch 'g' - has a file
  execSync(`git checkout -b g ${baseCommit}`, { cwd: workTree, stdio: 'inherit' })
  writeFileSync(join(workTree, 'g.txt'), 'g content\n')
  execSync('git add g.txt', { cwd: workTree, stdio: 'inherit' })
  execSync('git commit -m "add g.txt"', { 
    cwd: workTree,
    env: { ...process.env, GIT_AUTHOR_DATE: '1262356932 +0000', GIT_COMMITTER_DATE: '1262356932 +0000' },
    stdio: 'inherit'
  })
  
  // Branch 'g-delete-file' - deletes g.txt
  execSync(`git checkout -b g-delete-file ${baseCommit}`, { cwd: workTree, stdio: 'inherit' })
  writeFileSync(join(workTree, 'g.txt'), 'g content\n')
  execSync('git add g.txt', { cwd: workTree, stdio: 'inherit' })
  execSync('git commit -m "add g.txt"', { 
    cwd: workTree,
    env: { ...process.env, GIT_AUTHOR_DATE: '1262356933 +0000', GIT_COMMITTER_DATE: '1262356933 +0000' },
    stdio: 'inherit'
  })
  execSync('git rm g.txt', { cwd: workTree, stdio: 'inherit' })
  execSync('git commit -m "delete g.txt"', { 
    cwd: workTree,
    env: { ...process.env, GIT_AUTHOR_DATE: '1262356934 +0000', GIT_COMMITTER_DATE: '1262356934 +0000' },
    stdio: 'inherit'
  })
  
  // Branch 'i' - has o.txt
  execSync(`git checkout -b i ${baseCommit}`, { cwd: workTree, stdio: 'inherit' })
  writeFileSync(join(workTree, 'o.txt'), 'i content\n')
  execSync('git add o.txt', { cwd: workTree, stdio: 'inherit' })
  execSync('git commit -m "modify o.txt"', { 
    cwd: workTree,
    env: { ...process.env, GIT_AUTHOR_DATE: '1262356935 +0000', GIT_COMMITTER_DATE: '1262356935 +0000' },
    stdio: 'inherit'
  })
  
  // Branch 'i-delete-both' - deletes o.txt
  execSync(`git checkout -b i-delete-both ${baseCommit}`, { cwd: workTree, stdio: 'inherit' })
  execSync('git rm o.txt', { cwd: workTree, stdio: 'inherit' })
  execSync('git commit -m "delete o.txt too"', { 
    cwd: workTree,
    env: { ...process.env, GIT_AUTHOR_DATE: '1262356936 +0000', GIT_COMMITTER_DATE: '1262356936 +0000' },
    stdio: 'inherit'
  })
  
  // Branch 'a-file' - creates a file
  execSync(`git checkout -b a-file ${baseCommit}`, { cwd: workTree, stdio: 'inherit' })
  writeFileSync(join(workTree, 'a'), 'file content\n')
  execSync('git add a', { cwd: workTree, stdio: 'inherit' })
  execSync('git commit -m "add file a"', { 
    cwd: workTree,
    env: { ...process.env, GIT_AUTHOR_DATE: '1262356937 +0000', GIT_COMMITTER_DATE: '1262356937 +0000' },
    stdio: 'inherit'
  })
  
  // Branch 'a-folder' - creates a folder
  execSync(`git checkout -b a-folder ${baseCommit}`, { cwd: workTree, stdio: 'inherit' })
  mkdirSync(join(workTree, 'a'), { recursive: true })
  writeFileSync(join(workTree, 'a', 'file.txt'), 'folder content\n')
  execSync('git add a', { cwd: workTree, stdio: 'inherit' })
  execSync('git commit -m "add folder a"', { 
    cwd: workTree,
    env: { ...process.env, GIT_AUTHOR_DATE: '1262356938 +0000', GIT_COMMITTER_DATE: '1262356938 +0000' },
    stdio: 'inherit'
  })
  
  // Branch 'h' - add h.txt
  execSync(`git checkout -b h ${baseCommit}`, { cwd: workTree, stdio: 'inherit' })
  writeFileSync(join(workTree, 'h.txt'), 'h content\n')
  execSync('git add h.txt', { cwd: workTree, stdio: 'inherit' })
  execSync('git commit -m "added h.txt"', { 
    cwd: workTree,
    env: { ...process.env, GIT_AUTHOR_DATE: '1262356939 +0000', GIT_COMMITTER_DATE: '1262356939 +0000' },
    stdio: 'inherit'
  })
  
  // Now create merge result branches
  await createMergeResultBranches(workTree, gitdir)
  
  // All branches are already in the repository, no need to push
}

/**
 * Create merge result branches by performing merges
 * We use a separate worktree to avoid polluting the branch history
 */
async function createMergeResultBranches(workTree, gitdir) {
  // Create a separate worktree for merge operations to avoid polluting branch history
  const mergeWorkTree = join(workTree, '..', 'merge-worktree')
  if (existsSync(mergeWorkTree)) {
    rmSync(mergeWorkTree, { recursive: true, force: true })
  }
  mkdirSync(mergeWorkTree, { recursive: true })
  
  try {
    // Clone the repo to a new location for merge operations
    // Use --no-single-branch to get all branches
    execSync(`git clone --no-single-branch "${workTree}" "${mergeWorkTree}"`, { stdio: 'inherit' })
    
    // Fetch all branches from origin to make them available locally
    execSync('git fetch origin', { cwd: mergeWorkTree, stdio: 'inherit' })
    
    // Add mergeWorkTree as a remote in workTree for fetching merge commits
    execSync(`git remote add merge-source "${mergeWorkTree}"`, { cwd: workTree, stdio: 'pipe' })
    
    // Merge add-files and remove-files
    execSync('git checkout add-files', { cwd: mergeWorkTree, stdio: 'inherit' })
    try {
      execSync('git merge --no-ff -m "Merge branch \'remove-files\' into add-files" origin/remove-files', { 
        cwd: mergeWorkTree,
        env: { ...process.env, GIT_AUTHOR_DATE: '1262356940 +0000', GIT_COMMITTER_DATE: '1262356940 +0000' },
        stdio: 'pipe' // Suppress output for expected conflicts
      })
    } catch (e) {
      // Merge might have conflicts, resolve them
      // For add-files + remove-files: keep add-files files, remove o.txt
      if (existsSync(join(mergeWorkTree, 'o.txt'))) {
        execSync('git rm o.txt', { cwd: mergeWorkTree, stdio: 'inherit' })
      }
      execSync('git commit -m "Merge branch \'remove-files\' into add-files"', { 
        cwd: mergeWorkTree,
        env: { ...process.env, GIT_AUTHOR_DATE: '1262356940 +0000', GIT_COMMITTER_DATE: '1262356940 +0000' },
        stdio: 'inherit'
      })
    }
    const addFilesMergeCommit = execSync('git rev-parse HEAD', { 
      cwd: mergeWorkTree, 
      encoding: 'utf-8' 
    }).trim()
    // Fetch the commit from mergeWorkTree to workTree
    try {
      execSync(`git fetch merge-source HEAD:add-files-merge-remove-files`, { 
        cwd: workTree, 
        stdio: 'pipe' 
      })
    } catch (e) {
      // If fetch fails, try using the OID directly
      execSync(`git branch add-files-merge-remove-files ${addFilesMergeCommit}`, { 
        cwd: workTree, 
        stdio: 'inherit' 
      })
    }
  
    // Merge remove-files and add-files
    execSync('git checkout remove-files', { cwd: mergeWorkTree, stdio: 'inherit' })
    try {
      execSync('git merge --no-ff -m "Merge branch \'add-files\' into remove-files" origin/add-files', { 
        cwd: mergeWorkTree,
        env: { ...process.env, GIT_AUTHOR_DATE: '1262356941 +0000', GIT_COMMITTER_DATE: '1262356941 +0000' },
        stdio: 'pipe'
      })
    } catch (e) {
      // Resolve: keep add-files files
      if (existsSync(join(mergeWorkTree, 'file1.txt'))) {
        execSync('git checkout --theirs file1.txt', { cwd: mergeWorkTree, stdio: 'inherit' })
      }
      if (existsSync(join(mergeWorkTree, 'file2.txt'))) {
        execSync('git checkout --theirs file2.txt', { cwd: mergeWorkTree, stdio: 'inherit' })
      }
      execSync('git add -A', { cwd: mergeWorkTree, stdio: 'inherit' })
      execSync('git commit -m "Merge branch \'add-files\' into remove-files"', { 
        cwd: mergeWorkTree,
        env: { ...process.env, GIT_AUTHOR_DATE: '1262356941 +0000', GIT_COMMITTER_DATE: '1262356941 +0000' },
        stdio: 'inherit'
      })
    }
    const removeFilesMergeCommit = execSync('git rev-parse HEAD', { 
      cwd: mergeWorkTree, 
      encoding: 'utf-8' 
    }).trim()
    try {
      execSync(`git fetch merge-source HEAD:remove-files-merge-add-files`, { 
        cwd: workTree, 
        stdio: 'pipe' 
      })
    } catch (e) {
      execSync(`git branch remove-files-merge-add-files ${removeFilesMergeCommit}`, { 
        cwd: workTree, 
        stdio: 'inherit' 
      })
    }
  
    // Merge delete-first-half and delete-second-half
    execSync('git checkout delete-first-half', { cwd: mergeWorkTree, stdio: 'inherit' })
    try {
      execSync('git merge --no-ff -m "Merge branch \'delete-second-half\' into delete-first-half" origin/delete-second-half', { 
        cwd: mergeWorkTree,
        env: { ...process.env, GIT_AUTHOR_DATE: '1262356942 +0000', GIT_COMMITTER_DATE: '1262356942 +0000' },
        stdio: 'pipe'
      })
    } catch (e) {
      // Resolve: both deleted different files, result should have no files
      const filesToRemove = execSync('git ls-files file*.txt', { cwd: mergeWorkTree, encoding: 'utf8' }).trim().split('\n').filter(f => f)
      if (filesToRemove.length > 0) {
        execSync(`git rm ${filesToRemove.join(' ')}`, { cwd: mergeWorkTree, stdio: 'inherit' })
        execSync('git commit -m "Merge branch \'delete-second-half\' into delete-first-half"', { 
          cwd: mergeWorkTree,
          env: { ...process.env, GIT_AUTHOR_DATE: '1262356942 +0000', GIT_COMMITTER_DATE: '1262356942 +0000' },
          stdio: 'inherit'
        })
      } else {
        // No files to remove, just complete the merge
        execSync('git commit -m "Merge branch \'delete-second-half\' into delete-first-half"', { 
          cwd: mergeWorkTree,
          env: { ...process.env, GIT_AUTHOR_DATE: '1262356942 +0000', GIT_COMMITTER_DATE: '1262356942 +0000' },
          stdio: 'inherit'
        })
      }
    }
    const deleteFirstHalfMergeCommit = execSync('git rev-parse HEAD', { 
      cwd: mergeWorkTree, 
      encoding: 'utf-8' 
    }).trim()
    try {
      execSync(`git fetch merge-source HEAD:delete-first-half-merge-delete-second-half`, { 
        cwd: workTree, 
        stdio: 'pipe' 
      })
    } catch (e) {
      execSync(`git branch delete-first-half-merge-delete-second-half ${deleteFirstHalfMergeCommit}`, { 
        cwd: workTree, 
        stdio: 'inherit' 
      })
    }
    
    // Merge a and b (no conflict - different changes, should merge cleanly)
    execSync('git checkout a', { cwd: mergeWorkTree, stdio: 'inherit' })
    try {
      execSync('git merge --no-ff -m "Merge branch \'b\' into a" origin/b', { 
        cwd: mergeWorkTree,
        env: { ...process.env, GIT_AUTHOR_DATE: '1262356943 +0000', GIT_COMMITTER_DATE: '1262356943 +0000' },
        stdio: 'pipe'
      })
    } catch (e) {
      // If there's a conflict, resolve it by combining both changes
      writeFileSync(join(mergeWorkTree, 'o.txt'), 'original content\nmodified by a\nmodified by b\n')
      execSync('git add o.txt', { cwd: mergeWorkTree, stdio: 'inherit' })
      execSync('git commit -m "Merge branch \'b\' into a"', { 
        cwd: mergeWorkTree,
        env: { ...process.env, GIT_AUTHOR_DATE: '1262356943 +0000', GIT_COMMITTER_DATE: '1262356943 +0000' },
        stdio: 'inherit'
      })
    }
    const aMergeBCommit = execSync('git rev-parse HEAD', { 
      cwd: mergeWorkTree, 
      encoding: 'utf-8' 
    }).trim()
    try {
      execSync(`git fetch merge-source HEAD:a-merge-b`, { 
        cwd: workTree, 
        stdio: 'pipe' 
      })
    } catch (e) {
      execSync(`git branch a-merge-b ${aMergeBCommit}`, { 
        cwd: workTree, 
        stdio: 'inherit' 
      })
    }
    
    // Merge a and d (mode change)
    execSync('git checkout a', { cwd: mergeWorkTree, stdio: 'inherit' })
    execSync('git checkout -b a-d-merge', { cwd: mergeWorkTree, stdio: 'inherit' })
    execSync('git merge --no-ff -m "Merge branch \'d\' into a" origin/d', { 
      cwd: mergeWorkTree,
      env: { ...process.env, GIT_AUTHOR_DATE: '1262356944 +0000', GIT_COMMITTER_DATE: '1262356944 +0000' },
      stdio: 'inherit'
    })
    const aMergeDCommit = execSync('git rev-parse HEAD', { 
      cwd: mergeWorkTree, 
      encoding: 'utf-8' 
    }).trim()
    try {
      execSync(`git fetch merge-source HEAD:a-merge-d`, { 
        cwd: workTree, 
        stdio: 'pipe' 
      })
    } catch (e) {
      execSync(`git branch a-merge-d ${aMergeDCommit}`, { 
        cwd: workTree, 
        stdio: 'inherit' 
      })
    }
    
    // Merge a and c with recursive-ours strategy
    execSync('git checkout a', { cwd: mergeWorkTree, stdio: 'inherit' })
    execSync('git checkout -b a-c-merge', { cwd: mergeWorkTree, stdio: 'inherit' })
    try {
      execSync('git merge --no-ff -m "Merge branch \'c\' into a" -X ours origin/c', { 
        cwd: mergeWorkTree,
        env: { ...process.env, GIT_AUTHOR_DATE: '1262356945 +0000', GIT_COMMITTER_DATE: '1262356945 +0000' },
        stdio: 'pipe'
      })
    } catch (e) {
      // Check if merge is in progress
      const mergeHead = execSync('git rev-parse --verify MERGE_HEAD 2>/dev/null || echo ""', { 
        cwd: mergeWorkTree, 
        encoding: 'utf-8' 
      }).trim()
      if (mergeHead) {
        // Resolve conflict by taking ours
        execSync('git checkout --ours o.txt', { cwd: mergeWorkTree, stdio: 'inherit' })
        execSync('git add o.txt', { cwd: mergeWorkTree, stdio: 'inherit' })
        execSync('git commit -m "Merge branch \'c\' into a"', { 
          cwd: mergeWorkTree,
          env: { ...process.env, GIT_AUTHOR_DATE: '1262356945 +0000', GIT_COMMITTER_DATE: '1262356945 +0000' },
          stdio: 'inherit'
        })
      }
      // If no merge head, the merge completed successfully, no need to commit
    }
    const aMergeCRecursiveOursCommit = execSync('git rev-parse HEAD', { 
      cwd: mergeWorkTree, 
      encoding: 'utf-8' 
    }).trim()
    try {
      execSync(`git fetch merge-source HEAD:a-merge-c-recursive-ours`, { 
        cwd: workTree, 
        stdio: 'pipe' 
      })
    } catch (e) {
      execSync(`git branch a-merge-c-recursive-ours ${aMergeCRecursiveOursCommit}`, { 
        cwd: workTree, 
        stdio: 'inherit' 
      })
    }
    
    // Create conflict example file for test
    execSync('git checkout a', { cwd: mergeWorkTree, stdio: 'inherit' })
    execSync('git checkout -b conflict-test', { cwd: mergeWorkTree, stdio: 'inherit' })
    try {
      execSync('git merge --no-ff origin/c', { 
        cwd: mergeWorkTree,
        env: { ...process.env, GIT_AUTHOR_DATE: '1262356946 +0000', GIT_COMMITTER_DATE: '1262356946 +0000' },
        stdio: 'pipe'
      })
    } catch (e) {
      // Check if there's a conflict
      const conflictFile = join(mergeWorkTree, 'o.txt')
      if (existsSync(conflictFile)) {
        const conflictContent = readFileSync(conflictFile, 'utf-8')
        // Only save if it contains conflict markers
        if (conflictContent.includes('<<<<<<<') || conflictContent.includes('=======')) {
          const exampleDir = join(workTree, '.git')
          if (!existsSync(exampleDir)) {
            mkdirSync(exampleDir, { recursive: true })
          }
          writeFileSync(join(exampleDir, 'o.conflict.example'), conflictContent)
        }
      }
      execSync('git merge --abort', { cwd: mergeWorkTree, stdio: 'inherit' })
    }
  } finally {
    // Remove remote
    try {
      execSync('git remote remove merge-source', { cwd: workTree, stdio: 'pipe' })
    } catch {
      // Remote might not exist, ignore
    }
    // Clean up merge worktree
    if (existsSync(mergeWorkTree)) {
      rmSync(mergeWorkTree, { recursive: true, force: true })
    }
  }
}

