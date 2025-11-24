import { test } from 'node:test'
import assert from 'node:assert'
import { findRoot, init } from '@awesome-os/universal-git-src/index.ts'
import { makeFixture } from '@awesome-os/universal-git-test-helpers/helpers/fixture.ts'
import { MissingParameterError } from '@awesome-os/universal-git-src/errors/MissingParameterError.ts'
import { NotFoundError } from '@awesome-os/universal-git-src/errors/NotFoundError.ts'

test('findRoot', async (t) => {
  await t.test('param:fs-missing', async () => {
    try {
      await findRoot({
        filepath: '/tmp/test',
      } as any)
      assert.fail('Should have thrown MissingParameterError')
    } catch (error) {
      assert.ok(error instanceof MissingParameterError)
      assert.strictEqual((error as any).data?.parameter, 'fs')
    }
  })

  await t.test('param:filepath-missing', async () => {
    const { fs } = await makeFixture('test-empty')
    try {
      await findRoot({
        fs,
      } as any)
      assert.fail('Should have thrown MissingParameterError')
    } catch (error) {
      assert.ok(error instanceof MissingParameterError)
      assert.strictEqual((error as any).data?.parameter, 'filepath')
    }
  })

  await t.test('ok:from-root', async () => {
    const { fs, dir } = await makeFixture('test-empty')
    await init({ fs, dir, defaultBranch: 'main' })
    
    const root = await findRoot({ fs, filepath: dir })
    assert.strictEqual(root, dir, 'Should return the root directory')
  })

  await t.test('ok:from-subdirectory', async () => {
    const { fs, dir } = await makeFixture('test-empty')
    await init({ fs, dir, defaultBranch: 'main' })
    
    // Create a subdirectory - ensure parent directories exist first
    const subdirPath = `${dir}/subdir`
    const nestedPath = `${subdirPath}/nested`
    try {
      await fs.mkdir(subdirPath)
      await fs.mkdir(nestedPath)
    } catch {
      // Directories might already exist, that's fine
    }
    
    const root = await findRoot({ fs, filepath: nestedPath })
    assert.strictEqual(root, dir, 'Should find root directory from subdirectory')
  })

  await t.test('error:NotFoundError', async () => {
    const { fs } = await makeFixture('test-empty')
    // Don't initialize git, just use a temporary directory
    
    try {
      await findRoot({ fs, filepath: '/tmp/nonexistent' })
      assert.fail('Should have thrown NotFoundError')
    } catch (error) {
      assert.ok(error instanceof NotFoundError, 'Should throw NotFoundError when no git root found')
    }
  })

  await t.test('ok:from-git-directory', async () => {
    const { fs, dir } = await makeFixture('test-empty')
    await init({ fs, dir, defaultBranch: 'main' })
    
    const root = await findRoot({ fs, filepath: `${dir}/.git` })
    assert.strictEqual(root, dir, 'Should return the root directory even when starting from .git')
  })
})

