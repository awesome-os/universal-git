# Complete GitHub Workflow Example

This example demonstrates a complete workflow:
1. Creating a new repository programmatically
2. Making an initial commit and pushing to GitHub
3. Making local changes
4. Fetching and merging changes from GitHub
5. Resolving conflicts if they occur

## Prerequisites

```bash
npm install universal-git universal-git/http/node
```

## Complete Example

```js
const path = require('path')
const _fs = require('fs')
const { FileSystem } = require('universal-git/models')
const git = require('universal-git')
const http = require('universal-git/http/node')

// Wrap Node.js fs in FileSystem instance (required for universal-git)
const fs = new FileSystem(_fs)

// Configuration
const GITHUB_USERNAME = 'your-username'
const GITHUB_TOKEN = 'your-personal-access-token' // Generate at https://github.com/settings/tokens
const REPO_NAME = 'my-test-repo'
const WORK_DIR = path.join(process.cwd(), REPO_NAME)
const GITHUB_REPO_URL = `https://github.com/${GITHUB_USERNAME}/${REPO_NAME}.git`

async function main() {
  try {
    // ============================================
    // Step 1: Initialize a new repository
    // ============================================
    console.log('Step 1: Initializing repository...')
    
    // Create the directory if it doesn't exist
    if (!(await fs.exists(WORK_DIR))) {
      await fs.mkdir(WORK_DIR, { recursive: true })
    }
    
    // Initialize git repository
    await git.init({
      fs,
      dir: WORK_DIR,
      defaultBranch: 'main'
    })
    console.log('✓ Repository initialized')
    
    // ============================================
    // Step 2: Create initial files and commit
    // ============================================
    console.log('\nStep 2: Creating initial files...')
    
    // Create a README file
    await fs.write(
      path.join(WORK_DIR, 'README.md'),
      '# My Test Repository\n\nThis is a test repository created programmatically.\n'
    )
    
    // Create a simple JavaScript file
    await fs.write(
      path.join(WORK_DIR, 'app.js'),
      'console.log("Hello, World!");\n'
    )
    
    // Add files to staging
    await git.add({
      fs,
      dir: WORK_DIR,
      filepath: '.'
    })
    console.log('✓ Files added to staging')
    
    // Make initial commit
    await git.commit({
      fs,
      dir: WORK_DIR,
      message: 'Initial commit',
      author: {
        name: 'Your Name',
        email: 'your.email@example.com'
      }
    })
    console.log('✓ Initial commit created')
    
    // ============================================
    // Step 3: Add remote and push to GitHub
    // ============================================
    console.log('\nStep 3: Pushing to GitHub...')
    
    // Note: You need to create the repository on GitHub first!
    // You can do this via GitHub API or manually at https://github.com/new
    
    // Add remote
    await git.addRemote({
      fs,
      dir: WORK_DIR,
      remote: 'origin',
      url: GITHUB_REPO_URL
    })
    console.log('✓ Remote added')
    
    // Push to GitHub
    await git.push({
      fs,
      http,
      dir: WORK_DIR,
      remote: 'origin',
      ref: 'main',
      onAuth: () => ({
        username: GITHUB_USERNAME,
        password: GITHUB_TOKEN
      })
    })
    console.log('✓ Pushed to GitHub')
    
    // ============================================
    // Step 4: Make local changes
    // ============================================
    console.log('\nStep 4: Making local changes...')
    
    // Modify the JavaScript file
    const appJsPath = path.join(WORK_DIR, 'app.js')
    const appJsContent = String(await fs.read(appJsPath))
    await fs.write(
      appJsPath,
      appJsContent + '\nconsole.log("Local change made!");\n'
    )
    
    // Create a new file
    await fs.write(
      path.join(WORK_DIR, 'local-feature.js'),
      '// This is a local feature\nfunction localFeature() {\n  return "Local change";\n}\n'
    )
    
    // Add and commit local changes
    await git.add({
      fs,
      dir: WORK_DIR,
      filepath: '.'
    })
    
    await git.commit({
      fs,
      dir: WORK_DIR,
      message: 'Add local changes',
      author: {
        name: 'Your Name',
        email: 'your.email@example.com'
      }
    })
    console.log('✓ Local changes committed')
    
    // ============================================
    // Step 5: Simulate remote changes
    // ============================================
    console.log('\nStep 5: Simulating remote changes...')
    console.log('(In a real scenario, someone else would push changes to GitHub)')
    console.log('For this example, we\'ll fetch and see if there are any remote changes...')
    
    // Fetch from remote
    const fetchResult = await git.fetch({
      fs,
      http,
      dir: WORK_DIR,
      remote: 'origin',
      ref: 'main',
      onAuth: () => ({
        username: GITHUB_USERNAME,
        password: GITHUB_TOKEN
      })
    })
    console.log('✓ Fetched from remote')
    
    // ============================================
    // Step 6: Check status before merge
    // ============================================
    console.log('\nStep 6: Checking status...')
    
    const statusMatrix = await git.statusMatrix({
      fs,
      dir: WORK_DIR
    })
    
    console.log('Status matrix:')
    statusMatrix.forEach(([filepath, head, workdir, stage]) => {
      console.log(`  ${filepath}: HEAD=${head}, WORKDIR=${workdir}, STAGE=${stage}`)
    })
    
    // ============================================
    // Step 7: Merge remote changes
    // ============================================
    console.log('\nStep 7: Merging remote changes...')
    
    // Get current branch
    const currentBranch = await git.currentBranch({
      fs,
      dir: WORK_DIR,
      fullname: false
    })
    console.log(`Current branch: ${currentBranch}`)
    
    // Pull (fetch + merge)
    try {
      await git.pull({
        fs,
        http,
        dir: WORK_DIR,
        remote: 'origin',
        ref: 'main',
        author: {
          name: 'Your Name',
          email: 'your.email@example.com'
        },
        onAuth: () => ({
          username: GITHUB_USERNAME,
          password: GITHUB_TOKEN
        })
      })
      console.log('✓ Successfully merged remote changes')
    } catch (error) {
      if (error.code === 'MergeConflictError') {
        console.log('⚠ Merge conflict detected!')
        console.log('Conflicts:', error.data)
        
        // Handle merge conflicts
        await handleMergeConflicts(WORK_DIR, error.data)
      } else {
        throw error
      }
    }
    
    // ============================================
    // Step 8: Push merged changes
    // ============================================
    console.log('\nStep 8: Pushing merged changes...')
    
    await git.push({
      fs,
      http,
      dir: WORK_DIR,
      remote: 'origin',
      ref: 'main',
      onAuth: () => ({
        username: GITHUB_USERNAME,
        password: GITHUB_TOKEN
      })
    })
    console.log('✓ Pushed merged changes to GitHub')
    
    console.log('\n✅ Workflow complete!')
    
  } catch (error) {
    console.error('Error:', error)
    throw error
  }
}

// Helper function to handle merge conflicts
async function handleMergeConflicts(dir, conflicts) {
  console.log('\nResolving merge conflicts...')
  
  for (const filepath of conflicts) {
    console.log(`  Resolving conflict in: ${filepath}`)
    
    // Read the conflicted file
    const filePath = path.join(dir, filepath)
    let content = String(await fs.read(filePath))
    
    // Simple conflict resolution: keep both changes
    // In a real application, you'd want more sophisticated conflict resolution
    content = content
      .replace(/<<<<<<< HEAD\n/g, '')
      .replace(/=======\n/g, '\n')
      .replace(/>>>>>>> [^\n]+\n/g, '\n')
    
    // Write resolved content
    await fs.write(filePath, content)
    
    // Add resolved file
    await git.add({
      fs,
      dir,
      filepath
    })
  }
  
  // Complete the merge with a commit
  await git.commit({
    fs,
    dir,
    message: 'Merge remote changes',
    author: {
      name: 'Your Name',
      email: 'your.email@example.com'
    }
  })
  
  console.log('✓ Conflicts resolved and merge committed')
}

// Run the example
main().catch(console.error)
```

## Step-by-Step Breakdown

### 1. Initialize Repository
```js
await git.init({
  fs,
  dir: WORK_DIR,
  defaultBranch: 'main'
})
```

### 2. Create and Commit Initial Files
```js
// Create files
await fs.write(path.join(WORK_DIR, 'README.md'), '# My Repo\n')

// Add to staging
await git.add({ fs, dir: WORK_DIR, filepath: '.' })

// Commit
await git.commit({
  fs,
  dir: WORK_DIR,
  message: 'Initial commit',
  author: { name: 'Your Name', email: 'your.email@example.com' }
})
```

### 3. Push to GitHub
```js
// Add remote
await git.addRemote({
  fs,
  dir: WORK_DIR,
  remote: 'origin',
  url: GITHUB_REPO_URL
})

// Push
await git.push({
  fs,
  http,
  dir: WORK_DIR,
  remote: 'origin',
  ref: 'main',
  onAuth: () => ({
    username: GITHUB_USERNAME,
    password: GITHUB_TOKEN
  })
})
```

### 4. Make Local Changes
```js
// Modify files
const appJsPath = path.join(WORK_DIR, 'app.js')
const appJsContent = String(await fs.read(appJsPath))
await fs.write(appJsPath, appJsContent + '\n// Local change\n')

// Commit local changes
await git.add({ fs, dir: WORK_DIR, filepath: '.' })
await git.commit({
  fs,
  dir: WORK_DIR,
  message: 'Local changes',
  author: { name: 'Your Name', email: 'your.email@example.com' }
})
```

### 5. Fetch and Merge Remote Changes
```js
// Fetch from remote
await git.fetch({
  fs,
  http,
  dir: WORK_DIR,
  remote: 'origin',
  ref: 'main',
  onAuth: () => ({
    username: GITHUB_USERNAME,
    password: GITHUB_TOKEN
  })
})

// Pull (fetch + merge)
await git.pull({
  fs,
  http,
  dir: WORK_DIR,
  remote: 'origin',
  ref: 'main',
  author: { name: 'Your Name', email: 'your.email@example.com' },
  onAuth: () => ({
    username: GITHUB_USERNAME,
    password: GITHUB_TOKEN
  })
})
```

### 6. Handle Merge Conflicts (if any)
```js
try {
  await git.pull({ /* ... */ })
} catch (error) {
  if (error.code === 'MergeConflictError') {
    // Resolve conflicts
    for (const filepath of error.data) {
      // Read, resolve, and write conflicted file
      let content = String(await fs.read(path.join(dir, filepath)))
      content = content
        .replace(/<<<<<<< HEAD\n/g, '')
        .replace(/=======\n/g, '\n')
        .replace(/>>>>>>> [^\n]+\n/g, '\n')
      await fs.write(path.join(dir, filepath), content)
      
      // Add resolved file
      await git.add({ fs, dir, filepath })
    }
    
    // Complete merge
    await git.commit({
      fs,
      dir,
      message: 'Merge remote changes',
      author: { name: 'Your Name', email: 'your.email@example.com' }
    })
  }
}
```

## Important Notes

1. **Create GitHub Repository First**: Before pushing, you need to create the repository on GitHub. You can do this:
   - Manually at https://github.com/new
   - Using the GitHub API
   - Using the GitHub CLI: `gh repo create ${REPO_NAME} --public`

2. **Personal Access Token**: Generate a token at https://github.com/settings/tokens with `repo` scope for private repos or `public_repo` for public repos.

3. **Authentication**: Always use a Personal Access Token, never your password. The token should have appropriate scopes for the operations you need.

4. **Error Handling**: The example includes basic error handling for merge conflicts. In production, you'd want more sophisticated conflict resolution.

5. **Cache Object**: For better performance and consistency, you can reuse a cache object across operations:
   ```js
   const cache = {}
   await git.add({ fs, dir, filepath: '.', cache })
   await git.commit({ fs, dir, message: '...', cache })
   ```

## Running the Example

1. Create a GitHub repository first (manually or via API)
2. Update the configuration variables at the top of the script
3. Run: `node github-workflow-example.js`

## Alternative: Using Pull Instead of Fetch + Merge

You can use `pull` which combines fetch and merge:

```js
await git.pull({
  fs,
  http,
  dir: WORK_DIR,
  remote: 'origin',
  ref: 'main',
  author: {
    name: 'Your Name',
    email: 'your.email@example.com'
  },
  onAuth: () => ({
    username: GITHUB_USERNAME,
    password: GITHUB_TOKEN
  })
})
```

This is equivalent to:
1. `git.fetch()` - Download changes from remote
2. `git.merge()` - Merge remote changes into current branch

