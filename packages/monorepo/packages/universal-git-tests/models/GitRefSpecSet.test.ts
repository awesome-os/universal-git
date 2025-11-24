import { describe, it } from 'node:test'
import assert from 'node:assert'
import { GitRefSpecSet } from '@awesome-os/universal-git-src/models/GitRefSpecSet.ts'

describe('GitRefSpecSet', () => {
  it('fetch = +refs/heads/*:refs/remotes/origin/*', async () => {
    const refspec = GitRefSpecSet.from(['+refs/heads/*:refs/remotes/origin/*'])
    const result = refspec.translate([
      'refs/heads/master',
      'refs/heads/develop',
    ])
    assert.deepStrictEqual(result, [
      ['refs/heads/master', 'refs/remotes/origin/master'],
      ['refs/heads/develop', 'refs/remotes/origin/develop'],
    ])
  })

  it('fetch = refs/heads/master:refs/foo/master', async () => {
    const refspec = new GitRefSpecSet()
    refspec.add('+refs/heads/*:refs/remotes/origin/*')
    refspec.add('refs/heads/master:refs/foo/master')
    const result = refspec.translate([
      'refs/heads/master',
      'refs/heads/develop',
    ])
    assert.deepStrictEqual(result, [
      ['refs/heads/master', 'refs/remotes/origin/master'],
      ['refs/heads/develop', 'refs/remotes/origin/develop'],
      ['refs/heads/master', 'refs/foo/master'],
    ])
  })

  it('weird HEAD implicit rule', async () => {
    const refspec = new GitRefSpecSet()
    refspec.add('+HEAD:refs/remotes/origin/HEAD')
    const result = refspec.translate(['HEAD'])
    assert.deepStrictEqual(result, [['HEAD', 'refs/remotes/origin/HEAD']])
  })
})

