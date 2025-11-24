import { test } from 'node:test'
import assert from 'node:assert'
import { flatFileListToDirectoryStructure } from '@awesome-os/universal-git-src/utils/flatFileListToDirectoryStructure.ts'

test('flatFileListToDirectoryStructure', async (t) => {
  await t.test('ok:simple-structure', async () => {
    const inodes = flatFileListToDirectoryStructure([
      { path: 'hello/there.txt' },
    ])
    const inode = inodes.get('.')
    
    assert.ok(inode, 'Root inode should exist')
    assert.strictEqual(inode.fullpath, '.', 'Root fullpath should be "."')
    assert.strictEqual(inode.type, 'tree', 'Root type should be "tree"')
    assert.strictEqual(inode.children.length, 1, 'Root should have one child')
    
    const hello = inode.children[0]
    assert.strictEqual(hello.type, 'tree', 'hello should be a tree')
    assert.strictEqual(hello.fullpath, 'hello', 'hello fullpath should be "hello"')
    assert.strictEqual(hello.basename, 'hello', 'hello basename should be "hello"')
    assert.strictEqual(hello.parent, inode, 'hello parent should be root')
    assert.strictEqual(hello.children.length, 1, 'hello should have one child')
    
    const there = hello.children[0]
    assert.strictEqual(there.type, 'blob', 'there should be a blob')
    assert.strictEqual(there.fullpath, 'hello/there.txt', 'there fullpath should be "hello/there.txt"')
    assert.strictEqual(there.basename, 'there.txt', 'there basename should be "there.txt"')
  })

  await t.test('ok:advanced-structure', async () => {
    const filelist = [
      '.babelrc',
      '.editorconfig',
      '.flowconfig',
      '.gitignore',
      '.travis.yml',
      'LICENSE.md',
      'README.md',
      'package-lock.json',
      'package.json',
      'shrinkwrap.yaml',
      'src/commands/checkout.js',
      'src/commands/config.js',
      'src/commands/fetch.js',
      'src/commands/init.js',
      'src/index.js',
      'src/models/GitBlob.js',
      'src/models/GitCommit.js',
      'src/models/GitConfig.js',
      'src/models/GitObject.js',
      'src/models/GitTree.js',
      'src/utils/exists.js',
      'src/utils/mkdirs.js',
      'src/utils/read.js',
      'src/utils/resolveRef.js',
      'src/utils/write.js',
      'test/_helpers.js',
      'test/snapshots/test-resolveRef.js.md',
      'test/snapshots/test-resolveRef.js.snap',
      'test/test-clone.js',
      'test/test-config.js',
      'test/test-init.js',
      'test/test-resolveRef.js',
    ]
    const files = filelist.map(f => ({ path: f, someMeta: f.length }))
    const inodes = flatFileListToDirectoryStructure(files)
    const root = inodes.get('.')
    
    assert.ok(root, 'Root inode should exist')
    assert.strictEqual(root.type, 'tree', 'Root should be a tree')
    assert.ok(root.children.length > 0, 'Root should have children')
    
    // Verify some specific files exist
    const babelrc = root.children.find(c => c.basename === '.babelrc')
    assert.ok(babelrc, '.babelrc should exist')
    assert.strictEqual(babelrc.type, 'blob', '.babelrc should be a blob')
    assert.strictEqual(babelrc.fullpath, '.babelrc', '.babelrc fullpath should be correct')
    
    // Verify directory structure
    const src = root.children.find(c => c.basename === 'src')
    assert.ok(src, 'src directory should exist')
    assert.strictEqual(src.type, 'tree', 'src should be a tree')
    
    if (src.type === 'tree') {
      const commands = src.children.find(c => c.basename === 'commands')
      assert.ok(commands, 'src/commands directory should exist')
      assert.strictEqual(commands.type, 'tree', 'commands should be a tree')
      
      if (commands.type === 'tree') {
        const checkout = commands.children.find(c => c.basename === 'checkout.js')
        assert.ok(checkout, 'checkout.js should exist')
        assert.strictEqual(checkout.fullpath, 'src/commands/checkout.js', 'checkout.js fullpath should be correct')
      }
    }
    
    // Verify metadata is preserved
    const packageJson = root.children.find(c => c.basename === 'package.json')
    assert.ok(packageJson, 'package.json should exist')
    if (packageJson && 'metadata' in packageJson) {
      const metadata = packageJson.metadata as { path: string; someMeta: number }
      assert.strictEqual(metadata.path, 'package.json', 'Metadata path should be preserved')
      assert.strictEqual(metadata.someMeta, 12, 'Metadata someMeta should be preserved')
    }
  })
})

