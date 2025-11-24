# Sparse Checkout Example: Visual Studio Code

This example demonstrates how to use sparse checkout to clone only the `src` folder from the Visual Studio Code repository into a `.dump` directory.

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
const VSCODE_REPO_URL = 'https://github.com/microsoft/vscode.git'
const DUMP_DIR = path.join(process.cwd(), '.dump')
const GITDIR = path.join(DUMP_DIR, '.git')

async function sparseCheckoutVSCode() {
  try {
    console.log('Starting sparse checkout of VS Code src folder...')
    
    // ============================================
    // Step 1: Create .dump directory
    // ============================================
    console.log('\nStep 1: Creating .dump directory...')
    if (!(await fs.exists(DUMP_DIR))) {
      await fs.mkdir(DUMP_DIR, { recursive: true })
    }
    console.log(`✓ Directory created: ${DUMP_DIR}`)
    
    // ============================================
    // Step 2: Add .dump to .gitignore
    // ============================================
    console.log('\nStep 2: Adding .dump to .gitignore...')
    const gitignorePath = path.join(process.cwd(), '.gitignore')
    let gitignoreContent = ''
    
    // Read existing .gitignore if it exists
    if (await fs.exists(gitignorePath)) {
      gitignoreContent = String(await fs.read(gitignorePath))
    }
    
    // Add .dump if not already present
    if (!gitignoreContent.includes('.dump')) {
      gitignoreContent += (gitignoreContent ? '\n' : '') + '.dump\n'
      await fs.write(gitignorePath, gitignoreContent)
      console.log('✓ Added .dump to .gitignore')
    } else {
      console.log('✓ .dump already in .gitignore')
    }
    
    // ============================================
    // Step 3: Clone repository (bare clone)
    // ============================================
    console.log('\nStep 3: Cloning VS Code repository...')
    console.log('This may take a while as VS Code is a large repository...')
    
    await git.clone({
      fs,
      http,
      dir: DUMP_DIR,
      gitdir: GITDIR,
      url: VSCODE_REPO_URL,
      noCheckout: true, // Don't checkout files yet
      corsProxy: 'https://cors.universal-git.org' // Only needed for browser
    })
    console.log('✓ Repository cloned')
    
    // ============================================
    // Step 4: Initialize sparse checkout
    // ============================================
    console.log('\nStep 4: Initializing sparse checkout...')
    await git.sparseCheckout({
      fs,
      dir: DUMP_DIR,
      gitdir: GITDIR,
      init: true,
      cone: true // Use cone mode for better performance
    })
    console.log('✓ Sparse checkout initialized')
    
    // ============================================
    // Step 5: Set sparse checkout pattern to src/
    // ============================================
    console.log('\nStep 5: Setting sparse checkout pattern to src/...')
    await git.sparseCheckout({
      fs,
      dir: DUMP_DIR,
      gitdir: GITDIR,
      set: ['src/'],
      cone: true
    })
    console.log('✓ Pattern set to src/')
    
    // ============================================
    // Step 6: Checkout files matching the pattern
    // ============================================
    console.log('\nStep 6: Checking out src/ folder...')
    await git.checkout({
      fs,
      dir: DUMP_DIR,
      gitdir: GITDIR,
      ref: 'HEAD',
      force: true
    })
    console.log('✓ Checkout complete')
    
    // ============================================
    // Step 7: Verify the result
    // ============================================
    console.log('\nStep 7: Verifying sparse checkout...')
    const files = await git.listFiles({
      fs,
      dir: DUMP_DIR,
      gitdir: GITDIR
    })
    
    console.log(`\n✓ Sparse checkout complete!`)
    console.log(`  Total files checked out: ${files.length}`)
    console.log(`  Files in src/: ${files.filter(f => f.startsWith('src/')).length}`)
    
    // Show first few files as examples
    const srcFiles = files.filter(f => f.startsWith('src/')).slice(0, 10)
    console.log(`\n  Example files:`)
    srcFiles.forEach(file => {
      console.log(`    - ${file}`)
    })
    if (files.filter(f => f.startsWith('src/')).length > 10) {
      console.log(`    ... and ${files.filter(f => f.startsWith('src/')).length - 10} more`)
    }
    
    console.log(`\n✅ Sparse checkout complete!`)
    console.log(`   Location: ${DUMP_DIR}`)
    console.log(`   Only the src/ folder has been checked out.`)
    
  } catch (error) {
    console.error('Error:', error)
    throw error
  }
}

// Run the example
sparseCheckoutVSCode().catch(console.error)
```

## Step-by-Step Breakdown

### 1. Create .dump Directory
```js
const DUMP_DIR = path.join(process.cwd(), '.dump')
if (!(await fs.exists(DUMP_DIR))) {
  await fs.mkdir(DUMP_DIR, { recursive: true })
}
```

### 2. Add .dump to .gitignore
```js
const gitignorePath = path.join(process.cwd(), '.gitignore')
let gitignoreContent = (await fs.exists(gitignorePath))
  ? String(await fs.read(gitignorePath))
  : ''

if (!gitignoreContent.includes('.dump')) {
  gitignoreContent += '\n.dump\n'
  await fs.write(gitignorePath, gitignoreContent)
}
```

### 3. Clone Repository (No Checkout)
```js
await git.clone({
  fs,
  http,
  dir: DUMP_DIR,
  gitdir: GITDIR,
  url: 'https://github.com/microsoft/vscode.git',
  noCheckout: true // Important: don't checkout all files yet
})
```

### 4. Initialize Sparse Checkout
```js
await git.sparseCheckout({
  fs,
  dir: DUMP_DIR,
  gitdir: GITDIR,
  init: true,
  cone: true // Cone mode is faster and recommended
})
```

### 5. Set Pattern to src/
```js
await git.sparseCheckout({
  fs,
  dir: DUMP_DIR,
  gitdir: GITDIR,
  set: ['src/'],
  cone: true
})
```

### 6. Checkout Files
```js
await git.checkout({
  fs,
  dir: DUMP_DIR,
  gitdir: GITDIR,
  ref: 'HEAD',
  force: true
})
```

## Running the Example

### Quick Start

A ready-to-run script is available at [sparse-checkout-vscode.js](./sparse-checkout-vscode.js):

```bash
node examples/sparse-checkout-vscode.js
```

### Manual Setup

1. Save the code to a file (e.g., `sparse-checkout-vscode.js`)
2. Run: `node sparse-checkout-vscode.js`

The script will:
- Create a `.dump` directory in your current working directory
- Add `.dump` to `.gitignore` (if not already present)
- Clone the VS Code repository
- Configure sparse checkout to only include the `src/` folder
- Checkout only the files matching the pattern

## What Gets Checked Out

With the pattern `src/`, you'll get:
- ✅ All files in `src/` directory and subdirectories
- ❌ No files outside of `src/` (like `package.json`, `README.md`, etc.)

## Alternative: Multiple Folders

If you want to checkout multiple folders, you can specify multiple patterns:

```js
await git.sparseCheckout({
  fs,
  dir: DUMP_DIR,
  gitdir: GITDIR,
  set: ['src/', 'extensions/'],
  cone: true
})
```

## Notes

- **Cone Mode**: Using `cone: true` provides better performance and is recommended for directory-based patterns like `src/`
- **Large Repository**: VS Code is a large repository, so the initial clone may take several minutes
- **Disk Space**: Even with sparse checkout, you'll still download the full git history, but only checkout the `src/` folder
- **CORS Proxy**: The example includes `corsProxy` for browser usage. In Node.js, you can remove this parameter

## Cleanup

To remove the sparse checkout:

```js
// Delete the .dump directory
const _fs = require('fs')
const { FileSystem } = require('universal-git/models')
const path = require('path')
const fs = new FileSystem(_fs)
const DUMP_DIR = path.join(process.cwd(), '.dump')

if (await fs.exists(DUMP_DIR)) {
  await fs.rm(DUMP_DIR, { recursive: true, force: true })
  console.log('✓ .dump directory removed')
}
```

