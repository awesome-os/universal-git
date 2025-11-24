import { test } from 'node:test'
import assert from 'node:assert'
import { GitCommit } from '@awesome-os/universal-git-src/models/GitCommit.ts'
import { InternalError } from '@awesome-os/universal-git-src/errors/InternalError.ts'

test('GitCommit', async (t) => {
  await t.test('constructor with string', () => {
    // Test - line 49: string branch
    const commitStr = `tree abc123
parent def456
author Test <test@example.com> 1234567890 -0500
committer Test <test@example.com> 1234567890 -0500

Test commit message`
    const commit = new GitCommit(commitStr)
    assert.ok(commit instanceof GitCommit)
    assert.ok(commit.render().includes('Test commit message'))
  })

  await t.test('constructor with Buffer', () => {
    // Test - lines 50-51: Buffer branch
    const commitStr = `tree abc123
author Test <test@example.com> 1234567890 -0500
committer Test <test@example.com> 1234567890 -0500

Test commit`
    const commit = new GitCommit(Buffer.from(commitStr, 'utf8'))
    assert.ok(commit instanceof GitCommit)
    assert.ok(commit.render().includes('Test commit'))
  })

  await t.test('constructor with CommitObject', () => {
    // Test - lines 52-53: object branch
    const commitObj = {
      tree: 'abc123',
      parent: [],
      author: {
        name: 'Test',
        email: 'test@example.com',
        timestamp: 1234567890,
        timezoneOffset: -300,
      },
      committer: {
        name: 'Test',
        email: 'test@example.com',
        timestamp: 1234567890,
        timezoneOffset: -300,
      },
      message: 'Test commit',
    }
    const commit = new GitCommit(commitObj)
    assert.ok(commit instanceof GitCommit)
    assert.ok(commit.render().includes('Test commit'))
  })

  await t.test('constructor throws error for invalid type', () => {
    // Test - lines 55-56: throw InternalError for invalid type
    let error: unknown = null
    try {
      // @ts-expect-error - intentionally invalid type
      new GitCommit(123)
    } catch (err) {
      error = err
    }
    assert.notStrictEqual(error, null)
    assert.ok(error instanceof InternalError)
    assert.ok((error as Error).message.includes('invalid type'))
  })

  await t.test('fromPayloadSignature creates commit with signature', () => {
    // Test - lines 60-70: fromPayloadSignature
    const payload = `tree abc123
author Test <test@example.com> 1234567890 -0500
committer Test <test@example.com> 1234567890 -0500

Test message`
    const signature = `-----BEGIN PGP SIGNATURE-----
Version: GnuPG v1

iQIcBAABAgAGBQJZjhboAAoJEJYJuKWSi6a5V5UP
-----END PGP SIGNATURE-----`
    const commit = GitCommit.fromPayloadSignature({ payload, signature })
    assert.ok(commit instanceof GitCommit)
    assert.ok(commit.render().includes('gpgsig'))
    assert.ok(commit.render().includes('Test message'))
  })

  await t.test('renderHeaders uses null tree when tree is missing', () => {
    // Test - lines 141-142: use null tree
    const commitObj = {
      parent: [],
      author: {
        name: 'Test',
        email: 'test@example.com',
        timestamp: 1234567890,
        timezoneOffset: -300,
      },
      committer: {
        name: 'Test',
        email: 'test@example.com',
        timestamp: 1234567890,
        timezoneOffset: -300,
      },
      message: 'Test',
    }
    const headers = GitCommit.renderHeaders(commitObj as any)
    assert.ok(headers.includes('tree 4b825dc642cb6eb9a060e54bf8d69288fbee4904'))
  })

  await t.test('renderHeaders throws error when parent is not array', () => {
    // Test - lines 145-146: throw error when parent is not array
    const commitObj = {
      tree: 'abc123',
      parent: 'not-an-array' as any,
      author: {
        name: 'Test',
        email: 'test@example.com',
        timestamp: 1234567890,
        timezoneOffset: -300,
      },
      committer: {
        name: 'Test',
        email: 'test@example.com',
        timestamp: 1234567890,
        timezoneOffset: -300,
      },
      message: 'Test',
    }
    let error: unknown = null
    try {
      GitCommit.renderHeaders(commitObj as any)
    } catch (err) {
      error = err
    }
    assert.notStrictEqual(error, null)
    assert.ok(error instanceof InternalError)
    assert.ok((error as Error).message.includes('parent'))
  })

  await t.test('render returns commit string', () => {
    // Test - line 166-167: render method
    const commitStr = `tree abc123
author Test <test@example.com> 1234567890 -0500
committer Test <test@example.com> 1234567890 -0500

Test message`
    const commit = new GitCommit(commitStr)
    const rendered = commit.render()
    assert.strictEqual(rendered, commitStr)
  })

  await t.test('withoutSignature returns commit without signature', () => {
    // Test - lines 180-185: withoutSignature
    const commitStr = `tree abc123
author Test <test@example.com> 1234567890 -0500
committer Test <test@example.com> 1234567890 -0500
gpgsig -----BEGIN PGP SIGNATURE-----
Version: GnuPG v1
iQIcBAABAgAGBQJZjhboAAoJEJYJuKWSi6a5V5UP
-----END PGP SIGNATURE-----

Test message`
    const commit = new GitCommit(commitStr)
    const withoutSig = commit.withoutSignature()
    assert.ok(!withoutSig.includes('gpgsig'))
    assert.ok(withoutSig.includes('Test message'))
  })

  await t.test('isolateSignature extracts signature', () => {
    // Test - lines 180-185: isolateSignature
    const commitStr = `tree abc123
author Test <test@example.com> 1234567890 -0500
committer Test <test@example.com> 1234567890 -0500
gpgsig -----BEGIN PGP SIGNATURE-----
Version: GnuPG v1
iQIcBAABAgAGBQJZjhboAAoJEJYJuKWSi6a5V5UP
-----END PGP SIGNATURE-----

Test message`
    const commit = new GitCommit(commitStr)
    const signature = commit.isolateSignature()
    assert.ok(signature.includes('BEGIN PGP SIGNATURE'))
    assert.ok(signature.includes('END PGP SIGNATURE'))
  })

  await t.test('isolateSignature returns empty when no signature', () => {
    // Test - lines 182-183: return empty when no signature
    const commitStr = `tree abc123
author Test <test@example.com> 1234567890 -0500
committer Test <test@example.com> 1234567890 -0500

Test message`
    const commit = new GitCommit(commitStr)
    const signature = commit.isolateSignature()
    assert.strictEqual(signature, '')
  })

  await t.test('sign creates signed commit', async () => {
    // Test - lines 188-201: sign method
    const commitStr = `tree abc123
author Test <test@example.com> 1234567890 -0500
committer Test <test@example.com> 1234567890 -0500

Test message`
    const commit = new GitCommit(commitStr)
    
    const signCallback = async ({ payload }: { payload: string; secretKey: string }) => {
      return {
        signature: `-----BEGIN PGP SIGNATURE-----
Version: GnuPG v1
test-signature
-----END PGP SIGNATURE-----`,
      }
    }
    
    const signedCommit = await GitCommit.sign(commit, signCallback)
    assert.ok(signedCommit instanceof GitCommit)
    assert.ok(signedCommit.render().includes('gpgsig'))
    assert.ok(signedCommit.render().includes('Test message'))
  })

  await t.test('sign uses provided secretKey', async () => {
    // Test - lines 194: use secretKey
    const commitStr = `tree abc123
author Test <test@example.com> 1234567890 -0500
committer Test <test@example.com> 1234567890 -0500

Test message`
    const commit = new GitCommit(commitStr)
    
    let receivedSecretKey = ''
    const signCallback = async ({ payload, secretKey }: { payload: string; secretKey: string }) => {
      receivedSecretKey = secretKey
      return {
        signature: `-----BEGIN PGP SIGNATURE-----
Version: GnuPG v1
test
-----END PGP SIGNATURE-----`,
      }
    }
    
    const testKey = 'test-secret-key'
    await GitCommit.sign(commit, signCallback, testKey)
    assert.strictEqual(receivedSecretKey, testKey)
  })
})






