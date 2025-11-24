import { test } from 'node:test'
import assert from 'node:assert'
import { Errors } from '@awesome-os/universal-git-src/index.ts'
import { getRemoteHelperFor, type RemoteHelper } from '@awesome-os/universal-git-src/git/remote/getRemoteHelper.ts'
import { GitRemoteHTTP } from '@awesome-os/universal-git-src/git/remote/GitRemoteHTTP.ts'

test('getRemoteHelperFor', async (t) => {
  await t.test('getRemoteHelperFor (http)', async () => {
    // Test
    let helper: RemoteHelper | null = null
    let error: Error | null = null
    try {
      helper = getRemoteHelperFor({
        url: 'http://github.com/isomorphic-git-isomorphic-git',
      })
    } catch (err) {
      error = err as Error
    }
    assert.strictEqual(error, null)
    assert.strictEqual(helper, GitRemoteHTTP)
  })

  await t.test('getRemoteHelperFor (http override)', async () => {
    // Test
    let helper: RemoteHelper | null = null
    let error: Error | null = null
    try {
      helper = getRemoteHelperFor({
        url: 'http::https://github.com/isomorphic-git-isomorphic-git',
      })
    } catch (err) {
      error = err
    }
    assert.strictEqual(error, null)
    assert.strictEqual(helper, GitRemoteHTTP)
  })

  await t.test('getRemoteHelperFor (https)', async () => {
    // Test
    let helper: RemoteHelper | null = null
    let error: Error | null = null
    try {
      helper = getRemoteHelperFor({
        url: 'https://github.com/isomorphic-git-isomorphic-git',
      })
    } catch (err) {
      error = err
    }
    assert.strictEqual(error, null)
    assert.strictEqual(helper, GitRemoteHTTP)
  })

  await t.test('getRemoteHelperFor (unknown)', async () => {
    // Test
    let helper: RemoteHelper | null = null
    let error: Error | null = null
    try {
      helper = getRemoteHelperFor({
        url: 'hypergit://5701a1c08ae15dba17e181b1a9a28bdfb8b95200d77a25be6051bb018e25439a',
      })
    } catch (err) {
      error = err
    }
    assert.strictEqual(helper, null)
    assert.ok(error)
    assert.strictEqual((error as any).code, Errors.UnknownTransportError.code)
  })

  await t.test('getRemoteHelperFor (unknown override)', async () => {
    // Test
    let helper: RemoteHelper | null = null
    let error: Error | null = null
    try {
      helper = getRemoteHelperFor({
        url: 'oid::c3c2a92aa2bda58d667cb57493270b83bd14d1ed',
      })
    } catch (err) {
      error = err
    }
    assert.strictEqual(helper, null)
    assert.ok(error)
    assert.strictEqual((error as any).code, Errors.UnknownTransportError.code)
  })

  await t.test('getRemoteHelperFor (unparseable)', async () => {
    // Test
    let helper: RemoteHelper | null = null
    let error: Error | null = null
    try {
      helper = getRemoteHelperFor({
        url: 'oid:c3c2a92aa2bda58d667cb57493270b83bd14d1ed',
      })
    } catch (err) {
      error = err
    }
    assert.strictEqual(helper, null)
    assert.ok(error)
    assert.strictEqual((error as any).code, Errors.UrlParseError.code)
  })
})

