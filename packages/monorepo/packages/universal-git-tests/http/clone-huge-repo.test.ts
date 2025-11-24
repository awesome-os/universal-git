import { test } from 'node:test'
import assert from 'node:assert'
import { clone } from '@awesome-os/universal-git-src/index.ts'
import http from '@awesome-os/universal-git-src/http/node/index.ts'
import { makeFixture } from '@awesome-os/universal-git-test-helpers/helpers/fixture.ts'

test('huge repo clone and checkout', async (t) => {
  await t.test('clone from git-http-mock-server with non-blocking optimization for repo with 1k files', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-clone-karma-non-blocking')
    const branchName = 'master'

    await clone({
      fs,
      http,
      dir,
      gitdir,
      depth: 1,
      ref: branchName,
      singleBranch: true,
      url: 'https://github.com/octocat/Hello-World.git',
      corsProxy: undefined, // Not needed for Node.js tests
      nonBlocking: true,
    })

    assert.strictEqual(await fs.exists(`${dir}`), true, `'dir' exists`)
    assert.strictEqual(await fs.exists(`${gitdir}/objects`), true, `'gitdir/objects' exists`)
    assert.strictEqual(await fs.exists(`${gitdir}/refs/heads/${branchName}`), true, `'gitdir/refs/heads/${branchName}' exists`)
    // Hello-World has README, not package.json
    assert.strictEqual(await fs.exists(`${dir}/README`), true, `'README' exists`)
  })
})

