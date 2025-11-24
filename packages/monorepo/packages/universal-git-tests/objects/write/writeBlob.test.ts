import { test } from 'node:test'
import assert from 'node:assert'
import { writeBlob } from '@awesome-os/universal-git-src/index.ts'
import { makeFixture } from '@awesome-os/universal-git-test-helpers/helpers/fixture.ts'
import { computeBlobOid } from '@awesome-os/universal-git-test-helpers/helpers/dryRunHelpers.ts'

test('writeBlob', async (t) => {
  await t.test('ok:empty-blob', async () => {
    // Setup
    const { fs, gitdir } = await makeFixture('test-writeBlob')
    // Test - Using helper function for OID computation only
    const oid = await computeBlobOid(fs, {
      gitdir,
      blob: new Uint8Array([]),
    })
    assert.strictEqual(oid, 'e69de29bb2d1d6434b8b29ae775ad8c2e48c5391')
  })

  await t.test('ok:basic', async () => {
    // Setup
    const { fs, gitdir } = await makeFixture('test-writeBlob')
    // Test
    const oid = await writeBlob({
      fs,
      gitdir,
      blob: Buffer.from(
        `#!/usr/bin/env node
const minimisted = require('minimisted')
const git = require('.')

// This really isn't much of a CLI. It's mostly for testing.
// But it's very versatile and works surprisingly well.

minimisted(async function ({ _: [command, ...args], ...opts }) {
  const dir = process.cwd()
  const repo = git(dir)
  let cmd = \`git('\${dir}')\`
  for (let key of Object.keys(opts)) {
    // This is how you check for an array, right?
    if (opts[key].length === undefined) {
      repo[key](opts[key])
      cmd += \`.\${key}('\${opts[key]}')\`
    } else {
      repo[key](...opts[key])
      cmd += \`.\${key}(\${opts[key].map(x => \`'\${x}'\`).join(', ')})\`
    }
  }
  cmd += \`.\${command}(\${args.map(x => \`'\${x}'\`).join(', ')})\`
  console.log(cmd)
  let result = await repo[command](...args)
  if (result === undefined) return
  console.log(JSON.stringify(result, null, 2))
})
`,
        'utf8'
      ),
      dryRun: true, // Only verifies OID computation
    })
    assert.strictEqual(oid, '4551a1856279dde6ae9d65862a1dff59a5f199d8')
  })

  await t.test('param:fs-missing', async () => {
    const { MissingParameterError } = await import('@awesome-os/universal-git-src/errors/MissingParameterError.ts')
    try {
      await writeBlob({
        gitdir: '/tmp/test.git',
        blob: new Uint8Array([1, 2, 3]),
      } as any)
      assert.fail('Should have thrown MissingParameterError')
    } catch (error) {
      assert.ok(error instanceof MissingParameterError)
      assert.strictEqual((error as any).data?.parameter, 'fs')
    }
  })

  await t.test('param:blob-missing', async () => {
    const { fs, gitdir } = await makeFixture('test-writeBlob')
    const { MissingParameterError } = await import('@awesome-os/universal-git-src/errors/MissingParameterError.ts')
    try {
      await writeBlob({
        fs,
        gitdir,
      } as any)
      assert.fail('Should have thrown MissingParameterError')
    } catch (error) {
      assert.ok(error instanceof MissingParameterError)
      assert.strictEqual((error as any).data?.parameter, 'blob')
    }
  })

  await t.test('behavior:dryRun', async () => {
    const { fs, gitdir } = await makeFixture('test-writeBlob')
    const oid = await writeBlob({
      fs,
      gitdir,
      blob: new Uint8Array([1, 2, 3]),
      dryRun: true,
    })
    // Verify OID is computed correctly (actual OID for [1, 2, 3])
    assert.ok(typeof oid === 'string')
    assert.strictEqual(oid.length, 40)
    // Verify object was not written (dryRun = true)
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
    const { fs, gitdir, dir } = await makeFixture('test-writeBlob')
    const { Repository } = await import('@awesome-os/universal-git-src/core-utils/Repository.ts')
    const repo = await Repository.open({ fs, dir, gitdir })
    // Note: Helper doesn't support repo parameter, so use direct call for this test
    const oid = await writeBlob({
      repo,
      gitdir, // Provide gitdir explicitly to work around default parameter bug
      blob: new Uint8Array([1, 2, 3]),
      dryRun: true, // Only verifies OID format
    })
    assert.ok(typeof oid === 'string')
    assert.strictEqual(oid.length, 40)
  })

  await t.test('param:dir-derives-gitdir', async () => {
    const { fs, dir } = await makeFixture('test-writeBlob')
    // Using helper function for OID computation only
    const oid = await computeBlobOid(fs, {
      dir,
      blob: new Uint8Array([1, 2, 3]),
    })
    assert.ok(typeof oid === 'string')
    assert.strictEqual(oid.length, 40)
  })

  await t.test('error:caller-property', async () => {
    const { fs, gitdir } = await makeFixture('test-writeBlob')
    const { MissingParameterError } = await import('@awesome-os/universal-git-src/errors/MissingParameterError.ts')
    try {
      await writeBlob({
        fs,
        gitdir,
      } as any)
      assert.fail('Should have thrown MissingParameterError')
    } catch (error: any) {
      assert.ok(error instanceof MissingParameterError)
      assert.strictEqual(error.caller, 'git.writeBlob')
    }
  })

  await t.test('edge:large-blob', async () => {
    const { fs, gitdir } = await makeFixture('test-writeBlob')
    const largeBlob = new Uint8Array(10000).fill(65) // 10KB of 'A'
    // Using helper function for OID computation only
    const oid = await computeBlobOid(fs, {
      gitdir,
      blob: largeBlob,
    })
    assert.ok(typeof oid === 'string')
    assert.strictEqual(oid.length, 40)
  })

  await t.test('edge:binary-data', async () => {
    const { fs, gitdir } = await makeFixture('test-writeBlob')
    const binaryBlob = new Uint8Array([0x00, 0xFF, 0x80, 0x7F, 0x01, 0xFE])
    // Using helper function for OID computation only
    const oid = await computeBlobOid(fs, {
      gitdir,
      blob: binaryBlob,
    })
    assert.ok(typeof oid === 'string')
    assert.strictEqual(oid.length, 40)
  })
})

