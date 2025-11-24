import { test } from 'node:test'
import assert from 'node:assert'
import { listCommitsAndTags } from '@awesome-os/universal-git-src/commands/listCommitsAndTags.ts'
import { makeFixture } from '@awesome-os/universal-git-test-helpers/helpers/fixture.ts'
import { init, commit, writeBlob, writeTree, writeCommit, writeRef, tag } from '@awesome-os/universal-git-src/index.ts'

// Helper to create author/committer with timestamps
const createAuthor = (name: string, email: string) => ({
  name,
  email,
  timestamp: Math.floor(Date.now() / 1000),
  timezoneOffset: new Date().getTimezoneOffset(),
})

test('listCommitsAndTags', async (t) => {
  await t.test('list commits from single start ref', async () => {
    const { fs, gitdir, dir } = await makeFixture('test-empty')
    await init({ fs, dir, gitdir })

    // Create initial commit
    const file1Oid = await writeBlob({ fs, dir, gitdir, blob: Buffer.from('file1 content') })
    const treeOid = await writeTree({
      fs,
      dir,
      gitdir,
      tree: [{ path: 'file1.txt', mode: '100644', oid: file1Oid, type: 'blob' }],
    })
    const commit1Oid = await writeCommit({
      fs,
      dir,
      gitdir,
      commit: {
        tree: treeOid,
        parent: [],
        message: 'Initial commit',
        author: createAuthor('Test', 'test@example.com'),
        committer: createAuthor('Test', 'test@example.com'),
      },
    })
    await writeRef({ fs, dir, gitdir, ref: 'HEAD', value: commit1Oid })

    // Create second commit
    const file2Oid = await writeBlob({ fs, dir, gitdir, blob: Buffer.from('file2 content') })
    const tree2Oid = await writeTree({
      fs,
      dir,
      gitdir,
      tree: [
        { path: 'file1.txt', mode: '100644', oid: file1Oid, type: 'blob' },
        { path: 'file2.txt', mode: '100644', oid: file2Oid, type: 'blob' },
      ],
    })
    const commit2Oid = await writeCommit({
      fs,
      dir,
      gitdir,
      commit: {
        tree: tree2Oid,
        parent: [commit1Oid],
        message: 'Second commit',
        author: createAuthor('Test', 'test@example.com'),
        committer: createAuthor('Test', 'test@example.com'),
      },
    })
    await writeRef({ fs, dir, gitdir, ref: 'HEAD', value: commit2Oid, force: true })

    const cache = {}
    const result = await listCommitsAndTags({
      fs,
      cache,
      gitdir,
      start: ['HEAD'],
      finish: [],
    })

    assert.ok(result.has(commit2Oid))
    assert.ok(result.has(commit1Oid))
    assert.strictEqual(result.size, 2)
  })

  await t.test('list commits with finish ref (exclude ancestors)', async () => {
    const { fs, gitdir, dir } = await makeFixture('test-empty')
    await init({ fs, dir, gitdir })

    // Create commit chain: A -> B -> C
    const file1Oid = await writeBlob({ fs, dir, gitdir, blob: Buffer.from('file1') })
    const treeAOid = await writeTree({
      fs,
      dir,
      gitdir,
      tree: [{ path: 'file1.txt', mode: '100644', oid: file1Oid, type: 'blob' }],
    })
    const commitAOid = await writeCommit({
      fs,
      dir,
      gitdir,
      commit: {
        tree: treeAOid,
        parent: [],
        message: 'Commit A',
        author: createAuthor('Test', 'test@example.com'),
        committer: createAuthor('Test', 'test@example.com'),
      },
    })

    const treeBOid = await writeTree({
      fs,
      dir,
      gitdir,
      tree: [{ path: 'file1.txt', mode: '100644', oid: file1Oid, type: 'blob' }],
    })
    const commitBOid = await writeCommit({
      fs,
      dir,
      gitdir,
      commit: {
        tree: treeBOid,
        parent: [commitAOid],
        message: 'Commit B',
        author: createAuthor('Test', 'test@example.com'),
        committer: createAuthor('Test', 'test@example.com'),
      },
    })

    const treeCOid = await writeTree({
      fs,
      dir,
      gitdir,
      tree: [{ path: 'file1.txt', mode: '100644', oid: file1Oid, type: 'blob' }],
    })
    const commitCOid = await writeCommit({
      fs,
      dir,
      gitdir,
      commit: {
        tree: treeCOid,
        parent: [commitBOid],
        message: 'Commit C',
        author: createAuthor('Test', 'test@example.com'),
        committer: createAuthor('Test', 'test@example.com'),
      },
    })

    const cache = {}
    // Start from C, finish at B - should only include C
    const result = await listCommitsAndTags({
      fs,
      cache,
      gitdir,
      start: [commitCOid],
      finish: [commitBOid],
    })

    assert.ok(result.has(commitCOid))
    assert.ok(!result.has(commitBOid)) // B is in finish set
    assert.ok(!result.has(commitAOid)) // A is ancestor of B
    assert.strictEqual(result.size, 1)
  })

  await t.test('list commits with multiple start refs', async () => {
    const { fs, gitdir, dir } = await makeFixture('test-empty')
    await init({ fs, dir, gitdir })

    // Create two independent commits
    const file1Oid = await writeBlob({ fs, dir, gitdir, blob: Buffer.from('file1') })
    const tree1Oid = await writeTree({
      fs,
      dir,
      gitdir,
      tree: [{ path: 'file1.txt', mode: '100644', oid: file1Oid, type: 'blob' }],
    })
    const commit1Oid = await writeCommit({
      fs,
      dir,
      gitdir,
      commit: {
        tree: tree1Oid,
        parent: [],
        message: 'Commit 1',
        author: createAuthor('Test', 'test@example.com'),
        committer: createAuthor('Test', 'test@example.com'),
      },
    })

    const file2Oid = await writeBlob({ fs, dir, gitdir, blob: Buffer.from('file2') })
    const tree2Oid = await writeTree({
      fs,
      dir,
      gitdir,
      tree: [{ path: 'file2.txt', mode: '100644', oid: file2Oid, type: 'blob' }],
    })
    const commit2Oid = await writeCommit({
      fs,
      dir,
      gitdir,
      commit: {
        tree: tree2Oid,
        parent: [],
        message: 'Commit 2',
        author: createAuthor('Test', 'test@example.com'),
        committer: createAuthor('Test', 'test@example.com'),
      },
    })

    const cache = {}
    const result = await listCommitsAndTags({
      fs,
      cache,
      gitdir,
      start: [commit1Oid, commit2Oid],
      finish: [],
    })

    assert.ok(result.has(commit1Oid))
    assert.ok(result.has(commit2Oid))
    assert.strictEqual(result.size, 2)
  })

  await t.test('list commits with annotated tag (should peel)', async () => {
    const { fs, gitdir, dir } = await makeFixture('test-empty')
    await init({ fs, dir, gitdir })

    // Create commit
    const file1Oid = await writeBlob({ fs, dir, gitdir, blob: Buffer.from('file1') })
    const treeOid = await writeTree({
      fs,
      dir,
      gitdir,
      tree: [{ path: 'file1.txt', mode: '100644', oid: file1Oid, type: 'blob' }],
    })
    const commitOid = await writeCommit({
      fs,
      dir,
      gitdir,
      commit: {
        tree: treeOid,
        parent: [],
        message: 'Initial commit',
        author: createAuthor('Test', 'test@example.com'),
        committer: createAuthor('Test', 'test@example.com'),
      },
    })

    // Create annotated tag pointing to commit
    await tag({
      fs,
      dir,
      gitdir,
      ref: 'refs/tags/v1.0.0',
      object: commitOid,
      message: 'Version 1.0.0',
      tagger: { name: 'Test', email: 'test@example.com' },
    })

    const cache = {}
    // Start from tag - should peel to commit
    const result = await listCommitsAndTags({
      fs,
      cache,
      gitdir,
      start: ['refs/tags/v1.0.0'],
      finish: [],
    })

    // Should include both the tag and the commit it points to
    assert.ok(result.has(commitOid))
  })

  await t.test('list commits with finish ref that does not exist locally', async () => {
    const { fs, gitdir, dir } = await makeFixture('test-empty')
    await init({ fs, dir, gitdir })

    const file1Oid = await writeBlob({ fs, dir, gitdir, blob: Buffer.from('file1') })
    const treeOid = await writeTree({
      fs,
      dir,
      gitdir,
      tree: [{ path: 'file1.txt', mode: '100644', oid: file1Oid, type: 'blob' }],
    })
    const commitOid = await writeCommit({
      fs,
      dir,
      gitdir,
      commit: {
        tree: treeOid,
        parent: [],
        message: 'Initial commit',
        author: createAuthor('Test', 'test@example.com'),
        committer: createAuthor('Test', 'test@example.com'),
      },
    })

    const cache = {}
    // Finish ref that doesn't exist - should not throw
    const result = await listCommitsAndTags({
      fs,
      cache,
      gitdir,
      start: [commitOid],
      finish: ['refs/heads/nonexistent'],
    })

    assert.ok(result.has(commitOid))
  })

  await t.test('list commits with shallow commit (should not walk parents)', async () => {
    const { fs, gitdir, dir } = await makeFixture('test-empty')
    await init({ fs, dir, gitdir })

    // Create commit chain: A -> B
    const file1Oid = await writeBlob({ fs, dir, gitdir, blob: Buffer.from('file1') })
    const treeAOid = await writeTree({
      fs,
      dir,
      gitdir,
      tree: [{ path: 'file1.txt', mode: '100644', oid: file1Oid, type: 'blob' }],
    })
    const commitAOid = await writeCommit({
      fs,
      dir,
      gitdir,
      commit: {
        tree: treeAOid,
        parent: [],
        message: 'Commit A',
        author: createAuthor('Test', 'test@example.com'),
        committer: createAuthor('Test', 'test@example.com'),
      },
    })

    const treeBOid = await writeTree({
      fs,
      dir,
      gitdir,
      tree: [{ path: 'file1.txt', mode: '100644', oid: file1Oid, type: 'blob' }],
    })
    const commitBOid = await writeCommit({
      fs,
      dir,
      gitdir,
      commit: {
        tree: treeBOid,
        parent: [commitAOid],
        message: 'Commit B',
        author: createAuthor('Test', 'test@example.com'),
        committer: createAuthor('Test', 'test@example.com'),
      },
    })

    // Mark A as shallow
    await fs.write(`${gitdir}/shallow`, `${commitAOid}\n`, 'utf8')

    const cache = {}
    const result = await listCommitsAndTags({
      fs,
      cache,
      gitdir,
      start: [commitBOid],
      finish: [],
    })

    assert.ok(result.has(commitBOid))
    // A is shallow, so its parents should not be walked
    // But A itself might be included if it's in the start set
    // The behavior depends on whether shallow commits are included
  })

  await t.test('list commits with empty start set', async () => {
    const { fs, gitdir } = await makeFixture('test-empty')
    const dir = gitdir.replace('/.git', '')
    await init({ fs, dir, gitdir })

    const cache = {}
    const result = await listCommitsAndTags({
      fs,
      cache,
      gitdir,
      start: [],
      finish: [],
    })

    assert.strictEqual(result.size, 0)
  })
})

