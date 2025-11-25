import { test } from 'node:test'
import assert from 'node:assert'
import { readPackedRefs } from '@awesome-os/universal-git-src/git/refs/packedRefs.ts'
import { makeFixture } from '@awesome-os/universal-git-test-helpers/helpers/fixture.ts'

test('readPackedRefs', async (t) => {
  await t.test('ok:reads-packed-refs', async () => {
    const { fs, gitdir } = await makeFixture('test-GitRefManager')
    const refs = await readPackedRefs({ fs, gitdir })
    
    // Verify expected refs exist
    assert.strictEqual(refs.get('refs/remotes/origin/develop'), 'dba5b92408549e55c36e16c89e2b4a4e4cbc8c8f')
    assert.strictEqual(refs.get('refs/remotes/origin/dist'), 'a2dd810e222b7b02fc53760037d9928cb97c645d')
    assert.strictEqual(refs.get('refs/remotes/origin/gh-pages'), '1bfb4d0bce3fda5b26f189311dfef0a94390be38')
    assert.strictEqual(refs.get('refs/remotes/origin/git-fetch'), '5741bed81a5e38744ec8ca88b5aa4f058467d4bf')
    assert.strictEqual(refs.get('refs/remotes/origin/greenkeeper/semantic-release-11.0.2'), '665910e9294fe796499917c472b4ead573a11b06')
    assert.strictEqual(refs.get('refs/remotes/origin/master'), 'dba5b92408549e55c36e16c89e2b4a4e4cbc8c8f')
    assert.strictEqual(refs.get('refs/remotes/origin/test-branch'), 'e10ebb90d03eaacca84de1af0a59b444232da99e')
    assert.strictEqual(refs.get('refs/remotes/origin/test-branch-shallow-clone'), '92e7b4123fbf135f5ffa9b6fe2ec78d07bbc353e')
    assert.strictEqual(refs.get('refs/tags/test-tag'), '1e40fdfba1cf17f3c9f9f3d6b392b1865e5147b9')
    assert.strictEqual(refs.get('refs/tags/v0.0.1'), '1a2149e96a9767b281a8f10fd014835322da2d14')
    assert.strictEqual(refs.get('refs/tags/v0.0.10'), '0a117b8378f5e5323d15694c7eb8f62c4bea152b')
    assert.strictEqual(refs.get('refs/tags/v0.0.10^{}'), 'ce03143bd6567fc7063549c204e877834cda5645')
    assert.strictEqual(refs.get('refs/tags/v0.1.0'), 'dba5b92408549e55c36e16c89e2b4a4e4cbc8c8f')
    // Verify total count is reasonable (should have many tags)
    assert.ok(refs.size > 40, 'Should have many refs')
  })
})

