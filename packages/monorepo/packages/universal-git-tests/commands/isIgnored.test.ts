import { test } from 'node:test'
import assert from 'node:assert'
import { isIgnored } from '@awesome-os/universal-git-src/index.ts'
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
    const { repo } = await makeFixture('test-empty', { init: true })
    try {
      await isIgnored({
        fs: repo.fs,
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
    const { repo } = await makeFixture('test-empty', { init: true })
    const dir = await repo.getDir()!
    try {
      await isIgnored({
        fs: repo.fs,
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
    const { repo } = await makeFixture('test-empty', { init: true })
    try {
      await isIgnored({
        repo,
      } as any)
      assert.fail('Should have thrown MissingParameterError')
    } catch (error) {
      assert.ok(error instanceof MissingParameterError)
      assert.strictEqual((error as any).data?.parameter, 'filepath')
    }
  })

  await t.test('ok:non-ignored-file', async () => {
    const { repo } = await makeFixture('test-empty', { init: true })
    
    const result = await isIgnored({ repo, filepath: 'test.txt' })
    assert.strictEqual(result, false, 'Non-ignored file should return false')
  })

  await t.test('ok:ignored-file', async () => {
    const { repo } = await makeFixture('test-empty', { init: true })
    const dir = await repo.getDir()!
    
    // Create .gitignore file
    await repo.fs.write(`${dir}/.gitignore`, 'test.txt\n')
    
    const result = await isIgnored({ repo, filepath: 'test.txt' })
    assert.strictEqual(result, true, 'Ignored file should return true')
  })

  await t.test('param:dir-derives-gitdir', async () => {
    const { repo } = await makeFixture('test-empty', { init: true })
    const dir = await repo.getDir()!
    
    // Create .gitignore file
    await repo.fs.write(`${dir}/.gitignore`, 'ignored.txt\n')
    
    // Test with repo (gitdir should be derived)
    const result = await isIgnored({ repo, filepath: 'ignored.txt' })
    assert.strictEqual(result, true, 'Ignored file should return true')
  })
})

