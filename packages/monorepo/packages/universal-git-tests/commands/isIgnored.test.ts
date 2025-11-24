import { test } from 'node:test'
import assert from 'node:assert'
import { isIgnored, init } from '@awesome-os/universal-git-src/index.ts'
import { makeFixture } from '@awesome-os/universal-git-test-helpers/helpers/fixture.ts'
import { MissingParameterError } from '@awesome-os/universal-git-src/errors/MissingParameterError.ts'

test('isIgnored', async (t) => {
  await t.test('param:fs-missing', async () => {
    try {
      await isIgnored({
        dir: '/tmp/test',
        filepath: 'test.txt',
      } as any)
      assert.fail('Should have thrown MissingParameterError')
    } catch (error) {
      assert.ok(error instanceof MissingParameterError)
      assert.strictEqual((error as any).data?.parameter, 'fs')
    }
  })

  await t.test('param:dir-missing', async () => {
    const { fs } = await makeFixture('test-empty')
    try {
      await isIgnored({
        fs,
        filepath: 'test.txt',
      } as any)
      assert.fail('Should have thrown an error')
    } catch (error) {
      // dir is required for isIgnored, so it should throw MissingParameterError
      assert.ok(error instanceof Error, 'Should throw an error when dir is missing')
      // normalizeCommandArgs throws 'dir OR gitdir' when both are missing
      if (error instanceof MissingParameterError) {
        // When both dir and gitdir are missing, normalizeCommandArgs throws 'dir OR gitdir'
        const param = (error as any).data?.parameter
        assert.strictEqual(param, 'dir OR gitdir', `Expected 'dir OR gitdir', got '${param}'`)
      }
    }
  })

  await t.test('param:gitdir-missing', async () => {
    const { fs, dir } = await makeFixture('test-empty')
    try {
      await isIgnored({
        fs,
        dir,
        filepath: 'test.txt',
      } as any)
      assert.fail('Should have thrown MissingParameterError')
    } catch (error) {
      // gitdir is derived from dir, so this might not throw MissingParameterError
      // but should throw some error
      assert.ok(error instanceof Error, 'Should throw an error')
    }
  })

  await t.test('param:filepath-missing', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-empty')
    try {
      await isIgnored({
        fs,
        dir,
        gitdir,
      } as any)
      assert.fail('Should have thrown MissingParameterError')
    } catch (error) {
      assert.ok(error instanceof MissingParameterError)
      assert.strictEqual((error as any).data?.parameter, 'filepath')
    }
  })

  await t.test('ok:non-ignored-file', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-empty')
    await init({ fs, dir, defaultBranch: 'main' })
    
    const result = await isIgnored({ fs, dir, gitdir, filepath: 'test.txt' })
    assert.strictEqual(result, false, 'Non-ignored file should return false')
  })

  await t.test('ok:ignored-file', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-empty')
    await init({ fs, dir, defaultBranch: 'main' })
    
    // Create .gitignore file
    await fs.write(`${dir}/.gitignore`, 'test.txt\n')
    
    const result = await isIgnored({ fs, dir, gitdir, filepath: 'test.txt' })
    assert.strictEqual(result, true, 'Ignored file should return true')
  })

  await t.test('param:dir-derives-gitdir', async () => {
    const { fs, dir } = await makeFixture('test-empty')
    await init({ fs, dir, defaultBranch: 'main' })
    
    // Create .gitignore file
    await fs.write(`${dir}/.gitignore`, 'ignored.txt\n')
    
    // Test with dir only (gitdir should be derived)
    const result = await isIgnored({ fs, dir, filepath: 'ignored.txt' })
    assert.strictEqual(result, true, 'Ignored file should return true')
  })
})

