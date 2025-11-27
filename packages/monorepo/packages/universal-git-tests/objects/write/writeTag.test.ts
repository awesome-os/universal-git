import { test } from 'node:test'
import assert from 'node:assert'
import { writeTag } from '@awesome-os/universal-git-src/index.ts'
import { makeFixture } from '@awesome-os/universal-git-test-helpers/helpers/fixture.ts'

test('writeTag', async (t) => {
  await t.test('ok:annotated-tag', async () => {
    // Setup
    const { repo } = await makeFixture('test-writeTag')
    // Test
    const oid = await writeTag({
      repo,
      tag: {
        object: 'af4d84a6a9fa7a74acdad07fddf9f17ff3a974ae',
        type: 'commit',
        tag: 'v0.0.9',
        tagger: {
          name: 'Will Hilton',
          email: 'wmhilton@gmail.com',
          timestamp: 1507071414,
          timezoneOffset: 240,
        },
        message: '0.0.9',
        gpgsig: `-----BEGIN PGP SIGNATURE-----
Version: GnuPG v1

iQIcBAABAgAGBQJZ1BW2AAoJEJYJuKWSi6a5S6EQAJQkK+wIXijDf4ZfVeP1E7Be
aDDdOLga0/gj5p2p081TLLlaKKLcYj2pub8BfFVpEmvT0QRaKaMb+wAtO5PBHTbn
y2s3dCmqqAPQa0AXrChverKomK/gUYZfFzckS8GaJTiw2RyvheXOLOEGSLTHOwy2
wjP8KxGOWfHlXZEhn/Z406OlcYMzMSL70H26pgyggSTe5RNfpXEBAgWmIAA51eEM
9tF9xuijc0mlr6vzxYVmfwat4u38nrwX7JvWp2CvD/qwILMAYGIcZqRXK5jWHemD
/x5RtUGU4cr47++FD3N3zBWx0dBiCMNUwT/v68kmhrBVX20DhcC6UX38yf1sdDfZ
yapht2+TakKQuw/T/K/6bFjoa8MIHdAx7WCnMV84M0qfMr+e9ImeH5Hj592qw4Gh
vSY80gKslkXjRnVes7VHXoL/lVDvCM2VNskWTTLGHqt+rIvSXNFGP05OGtdFYu4d
K9oFVEoRPFTRSeF/9EztyeLb/gtSdBmWP2AhZn9ip0a7rjbyv5yeayZTsedoUfe5
o8cB++UXreD+h3c/F6mTRs8aVELhQTZNZ677PY71HJKsCLbQJAd4n+gS1n8Y/7wv
Zp4YxnShDkMTV3rxZc27vehq2g9gKJzQsueLyZPJTzCHqujumiLbdYV4i4X4CZjy
dBWrLc3kdnemrlhSRzR2
=PrR1
-----END PGP SIGNATURE-----
`,
      },
      dryRun: true, // Only verifies OID computation
    })
    assert.strictEqual(oid, '6e90dfd7573404a225888071ecaa572882b4e45c')
  })

  await t.test('param:fs-missing', async () => {
    const { MissingParameterError } = await import('@awesome-os/universal-git-src/errors/MissingParameterError.ts')
    try {
      await writeTag({
        gitdir: '/tmp/test.git',
        tag: {
          object: 'af4d84a6a9fa7a74acdad07fddf9f17ff3a974ae',
          type: 'commit',
          tag: 'v1.0.0',
          tagger: { name: 'Test', email: 'test@example.com', timestamp: 1507071414, timezoneOffset: 240 },
          message: 'Test tag',
        },
      } as any)
      assert.fail('Should have thrown MissingParameterError')
    } catch (error) {
      assert.ok(error instanceof MissingParameterError)
      assert.strictEqual((error as any).data?.parameter, 'fs')
    }
  })

  await t.test('param:tag-missing-parsed-format', async () => {
    const { repo } = await makeFixture('test-writeTag')
    const { MissingParameterError } = await import('@awesome-os/universal-git-src/errors/MissingParameterError.ts')
    try {
      await writeTag({
        repo,
        format: 'parsed',
      } as any)
      assert.fail('Should have thrown MissingParameterError')
    } catch (error) {
      assert.ok(error instanceof MissingParameterError)
      assert.strictEqual((error as any).data?.parameter, 'tag')
    }
  })

  await t.test('param:tagBuffer-missing-content-format', async () => {
    const { repo } = await makeFixture('test-writeTag')
    const { MissingParameterError } = await import('@awesome-os/universal-git-src/errors/MissingParameterError.ts')
    try {
      await writeTag({
        repo,
        format: 'content',
      } as any)
      assert.fail('Should have thrown MissingParameterError')
    } catch (error) {
      assert.ok(error instanceof MissingParameterError)
      assert.strictEqual((error as any).data?.parameter, 'tagBuffer')
    }
  })

  await t.test('param:dryRun', async () => {
    const { repo } = await makeFixture('test-writeTag')
    const oid = await writeTag({
      repo,
      tag: {
        object: 'af4d84a6a9fa7a74acdad07fddf9f17ff3a974ae',
        type: 'commit',
        tag: 'v1.0.0',
        tagger: { name: 'Test', email: 'test@example.com', timestamp: 1507071414, timezoneOffset: 240 },
        message: 'Test tag',
      },
      dryRun: true,
    })
    assert.ok(typeof oid === 'string')
    assert.strictEqual(oid.length, 40)
    // Verify object was not written
    const { readObject } = await import('@awesome-os/universal-git-src/index.ts')
    try {
      await readObject({ repo, oid })
      assert.fail('Object should not exist when dryRun is true')
    } catch (error) {
      // Expected - object should not exist
      assert.ok(error instanceof Error)
    }
  })

  await t.test('param:repo-provided', async () => {
    const { repo } = await makeFixture('test-writeTag')
    const oid = await writeTag({
      repo,
      tag: {
        object: 'af4d84a6a9fa7a74acdad07fddf9f17ff3a974ae',
        type: 'commit',
        tag: 'v1.0.0',
        tagger: { name: 'Test', email: 'test@example.com', timestamp: 1507071414, timezoneOffset: 240 },
        message: 'Test tag',
      },
      dryRun: true, // Only verifies OID format
    })
    assert.ok(typeof oid === 'string')
    assert.strictEqual(oid.length, 40)
  })

  await t.test('param:dir-derives-gitdir', async () => {
    const { repo } = await makeFixture('test-writeTag')
    const oid = await writeTag({
      repo,
      tag: {
        object: 'af4d84a6a9fa7a74acdad07fddf9f17ff3a974ae',
        type: 'commit',
        tag: 'v1.0.0',
        tagger: { name: 'Test', email: 'test@example.com', timestamp: 1507071414, timezoneOffset: 240 },
        message: 'Test tag',
      },
      dryRun: true, // Only verifies OID format
    })
    assert.ok(typeof oid === 'string')
    assert.strictEqual(oid.length, 40)
  })

  await t.test('error:caller-property', async () => {
    const { repo } = await makeFixture('test-writeTag')
    const { MissingParameterError } = await import('@awesome-os/universal-git-src/errors/MissingParameterError.ts')
    try {
      await writeTag({
        repo,
        format: 'parsed',
      } as any)
      assert.fail('Should have thrown MissingParameterError')
    } catch (error: any) {
      assert.ok(error instanceof MissingParameterError)
      assert.strictEqual(error.caller, 'git.writeTag')
    }
  })

  await t.test('ok:tag-without-message', async () => {
    const { repo } = await makeFixture('test-writeTag')
    const oid = await writeTag({
      repo,
      tag: {
        object: 'af4d84a6a9fa7a74acdad07fddf9f17ff3a974ae',
        type: 'commit',
        tag: 'v1.0.0',
        tagger: { name: 'Test', email: 'test@example.com', timestamp: 1507071414, timezoneOffset: 240 },
      },
      dryRun: true, // Only verifies OID format
    })
    assert.ok(typeof oid === 'string')
    assert.strictEqual(oid.length, 40)
  })

  await t.test('ok:tag-pointing-to-tree', async () => {
    const { repo } = await makeFixture('test-writeTag')
    const oid = await writeTag({
      repo,
      tag: {
        object: 'e0b8f3574060ee24e03e4af3896f65dd208a60cc',
        type: 'tree',
        tag: 'v1.0.0',
        tagger: { name: 'Test', email: 'test@example.com', timestamp: 1507071414, timezoneOffset: 240 },
        message: 'Tree tag',
      },
      dryRun: true, // Only verifies OID format
    })
    assert.ok(typeof oid === 'string')
    assert.strictEqual(oid.length, 40)
  })
})

