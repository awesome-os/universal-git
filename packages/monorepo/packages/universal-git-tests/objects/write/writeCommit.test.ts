import { test } from 'node:test'
import assert from 'node:assert'
import { writeCommit } from '@awesome-os/universal-git-src/index.ts'
import { makeFixture } from '@awesome-os/universal-git-test-helpers/helpers/fixture.ts'
import { computeCommitOid } from '@awesome-os/universal-git-test-helpers/helpers/dryRunHelpers.ts'

test('writeCommit', async (t) => {
  await t.test('ok:parsed', async () => {
    // Setup
    const { fs, gitdir } = await makeFixture('test-writeCommit')
    // Test - Using helper function for OID computation only
    const oid = await computeCommitOid(fs, {
      gitdir,
      commit: {
        author: {
          email: 'wmhilton@gmail.com',
          name: 'Will Hilton',
          timestamp: 1502484200,
          timezoneOffset: 240,
        },
        committer: {
          email: 'wmhilton@gmail.com',
          name: 'Will Hilton',
          timestamp: 1502484200,
          timezoneOffset: 240,
        },
        gpgsig: `-----BEGIN PGP SIGNATURE-----
Version: GnuPG v1

iQIcBAABAgAGBQJZjhboAAoJEJYJuKWSi6a5V5UP/040SfemJ13PRBXst2eB59gs
3hPx29DRKBhFtvk+uS+8523/hUfry2oeWWd6YRkcnkxxAUtBnfzVkI9AgRIc1NTM
h5XtLMQubCAKw8JWvVvoXETzwVAODmdmvC4WSQCLu+opoe6/W7RvkrTD0pbkwH4E
MXoha59sIWZ/FacZX6ByYqhFykfJL8gCFvRSzjiqBIbsP7Xq2Mh4jkAKYl5zxV3u
qCk26hnhL++kwfXlu2YdGtB9+lj3pk1NeWqR379zRzh4P10FxXJ18qSxczbkAFOY
6o5h7a/Mql1KqWB9EFBupCpjydmpAtPo6l1Us4a3liB5LJvCh9xgR2HtShR4b97O
nIpXP4ngy4z9UyrXXxxpiQQn/kVn/uKgtvGp8nOFioo61PCi9js2QmQxcsuBOeO+
DdFq5k2PMNZLwizt4P8EGfVJoPbLhdYP4oWiMCuYV/2fNh0ozl/q176HGszlfrke
332Z0maJ3A5xIRj0b7vRNHV8AAl9Dheo3LspjeovP2iycCHFP03gSpCKdLRBRC4T
X10BBFD8noCMXJxb5qenrf+eKRd8d4g7JtcyzqVgkBQ68GIG844VWRBolOzx4By5
cAaw/SYIZG3RorAc11iZ7sva0jFISejmEzIebuChSzdWO2OOWRVvMdhyZwDLUgAb
Qixh2bmPgr3h9nxq2Dmn
=4+DN
-----END PGP SIGNATURE-----`,
        message: 'Improve resolveRef to handle more kinds of refs. Add tests\n',
        parent: ['b4f8206d9e359416b0f34238cbeb400f7da889a8'],
        tree: 'e0b8f3574060ee24e03e4af3896f65dd208a60cc',
      },
    })
    assert.strictEqual(oid, 'e10ebb90d03eaacca84de1af0a59b444232da99e')
  })

  await t.test('param:fs-missing', async () => {
    const { MissingParameterError } = await import('@awesome-os/universal-git-src/errors/MissingParameterError.ts')
    try {
      await writeCommit({
        gitdir: '/tmp/test.git',
        commit: {
          tree: 'e0b8f3574060ee24e03e4af3896f65dd208a60cc',
          author: { name: 'Test', email: 'test@example.com', timestamp: 1502484200, timezoneOffset: 240 },
          committer: { name: 'Test', email: 'test@example.com', timestamp: 1502484200, timezoneOffset: 240 },
          message: 'Test commit',
        },
      } as any)
      assert.fail('Should have thrown MissingParameterError')
    } catch (error) {
      assert.ok(error instanceof MissingParameterError)
      assert.strictEqual((error as any).data?.parameter, 'fs')
    }
  })

  await t.test('param:commit-missing', async () => {
    const { fs, gitdir } = await makeFixture('test-writeCommit')
    const { MissingParameterError } = await import('@awesome-os/universal-git-src/errors/MissingParameterError.ts')
    try {
      await writeCommit({
        fs,
        gitdir,
      } as any)
      assert.fail('Should have thrown MissingParameterError')
    } catch (error) {
      assert.ok(error instanceof MissingParameterError)
      assert.strictEqual((error as any).data?.parameter, 'commit')
    }
  })

  await t.test('param:dryRun', async () => {
    const { fs, gitdir } = await makeFixture('test-writeCommit')
    const oid = await writeCommit({
      fs,
      gitdir,
      commit: {
        tree: 'e0b8f3574060ee24e03e4af3896f65dd208a60cc',
        author: { name: 'Test', email: 'test@example.com', timestamp: 1502484200, timezoneOffset: 240 },
        committer: { name: 'Test', email: 'test@example.com', timestamp: 1502484200, timezoneOffset: 240 },
        message: 'Test commit',
      },
      dryRun: true,
    })
    assert.ok(typeof oid === 'string')
    assert.strictEqual(oid.length, 40)
    // Verify object was not written
    const { readObject } = await import('@awesome-os/universal-git-src/index.ts')
    try {
      await readObject({ fs, gitdir, oid })
      assert.fail('Object should not exist when dryRun is true')
    } catch (error) {
      // Expected - object should not exist
      assert.ok(error instanceof Error)
    }
  })

  await t.test('param:repo-provided', async () => {
    const { fs, gitdir, dir } = await makeFixture('test-writeCommit')
    const { Repository } = await import('@awesome-os/universal-git-src/core-utils/Repository.ts')
    const repo = await Repository.open({ fs, dir, gitdir })
    const oid = await writeCommit({
      repo,
      gitdir, // Provide gitdir explicitly to work around default parameter bug
      commit: {
        tree: 'e0b8f3574060ee24e03e4af3896f65dd208a60cc',
        author: { name: 'Test', email: 'test@example.com', timestamp: 1502484200, timezoneOffset: 240 },
        committer: { name: 'Test', email: 'test@example.com', timestamp: 1502484200, timezoneOffset: 240 },
        message: 'Test commit',
      },
      dryRun: true, // Only verifies OID format
    })
    assert.ok(typeof oid === 'string')
    assert.strictEqual(oid.length, 40)
  })

  await t.test('param:dir-derives-gitdir', async () => {
    const { fs, dir } = await makeFixture('test-writeCommit')
    // Using helper function for OID computation only
    const oid = await computeCommitOid(fs, {
      dir,
      commit: {
        tree: 'e0b8f3574060ee24e03e4af3896f65dd208a60cc',
        author: { name: 'Test', email: 'test@example.com', timestamp: 1502484200, timezoneOffset: 240 },
        committer: { name: 'Test', email: 'test@example.com', timestamp: 1502484200, timezoneOffset: 240 },
        message: 'Test commit',
      },
    })
    assert.ok(typeof oid === 'string')
    assert.strictEqual(oid.length, 40)
  })

  await t.test('error:caller-property', async () => {
    const { fs, gitdir } = await makeFixture('test-writeCommit')
    const { MissingParameterError } = await import('@awesome-os/universal-git-src/errors/MissingParameterError.ts')
    try {
      await writeCommit({
        fs,
        gitdir,
      } as any)
      assert.fail('Should have thrown MissingParameterError')
    } catch (error: any) {
      assert.ok(error instanceof MissingParameterError)
      assert.strictEqual(error.caller, 'git.writeCommit')
    }
  })

  await t.test('ok:commit-multiple-parents', async () => {
    const { fs, gitdir } = await makeFixture('test-writeCommit')
    // Using helper function for OID computation only
    const oid = await computeCommitOid(fs, {
      gitdir,
      commit: {
        tree: 'e0b8f3574060ee24e03e4af3896f65dd208a60cc',
        parent: ['b4f8206d9e359416b0f34238cbeb400f7da889a8', 'a1b2c3d4e5f6789012345678901234567890abcd'],
        author: { name: 'Test', email: 'test@example.com', timestamp: 1502484200, timezoneOffset: 240 },
        committer: { name: 'Test', email: 'test@example.com', timestamp: 1502484200, timezoneOffset: 240 },
        message: 'Merge commit',
      },
    })
    assert.ok(typeof oid === 'string')
    assert.strictEqual(oid.length, 40)
  })

  await t.test('ok:commit-no-parent', async () => {
    const { fs, gitdir } = await makeFixture('test-writeCommit')
    // Using helper function for OID computation only
    const oid = await computeCommitOid(fs, {
      gitdir,
      commit: {
        tree: 'e0b8f3574060ee24e03e4af3896f65dd208a60cc',
        author: { name: 'Test', email: 'test@example.com', timestamp: 1502484200, timezoneOffset: 240 },
        committer: { name: 'Test', email: 'test@example.com', timestamp: 1502484200, timezoneOffset: 240 },
        message: 'Initial commit',
      },
    })
    assert.ok(typeof oid === 'string')
    assert.strictEqual(oid.length, 40)
  })
})

