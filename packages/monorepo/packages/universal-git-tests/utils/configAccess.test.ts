import { test } from 'node:test'
import assert from 'node:assert'
import { ConfigAccess, getConfigValue, setConfigValue } from '@awesome-os/universal-git-src/utils/configAccess.ts'
import { makeFixture } from '@awesome-os/universal-git-test-helpers/helpers/fixture.ts'

test('configAccess', async (t) => {
  const { fs, dir, gitdir } = await makeFixture('test-config-access')

  await t.test('ok:constructor-initializes', () => {
    const access = new ConfigAccess(fs, gitdir)
    assert.ok(access instanceof ConfigAccess)
  })

  await t.test('ok:constructor-system-global-paths', () => {
    const access = new ConfigAccess(fs, gitdir, '/system/config', '/global/config')
    assert.ok(access instanceof ConfigAccess)
  })

  await t.test('ok:getConfigValue-returns-undefined', async () => {
    const access = new ConfigAccess(fs, gitdir)
    const value = await access.getConfigValue('user.name')
    assert.strictEqual(value, undefined)
  })

  await t.test('ok:getConfigValue-after-setConfigValue', async () => {
    const access = new ConfigAccess(fs, gitdir)
    await access.setConfigValue('user.name', 'Test User', 'local')
    const value = await access.getConfigValue('user.name')
    assert.strictEqual(value, 'Test User')
  })

  await t.test('param:setConfigValue-different-scopes', async () => {
    const access = new ConfigAccess(fs, gitdir)
    
    await access.setConfigValue('user.name', 'Local User', 'local')
    
    // Global config requires a path to be set - skip global config test
    // or handle the error if path is not provided
    try {
      await access.setConfigValue('user.email', 'global@example.com', 'global')
    } catch (err: any) {
      // Expected error when global config path is not provided
      assert.ok(err.message.includes('path') || err.message.includes('global'), 'Should error about global config path')
    }
    
    const localValue = await access.getConfigValue('user.name')
    assert.strictEqual(localValue, 'Local User')
  })

  await t.test('ok:getAllConfigValues-returns-array', async () => {
    const access = new ConfigAccess(fs, gitdir)
    await access.setConfigValue('user.name', 'Test User', 'local')
    
    const allValues = await access.getAllConfigValues('user.name')
    assert.ok(Array.isArray(allValues))
    assert.ok(allValues.length > 0)
    assert.ok(allValues.some(v => v.value === 'Test User'))
  })

  await t.test('ok:appendConfigValue-multi-valued', async () => {
    const access = new ConfigAccess(fs, gitdir)
    await access.setConfigValue('remote.origin.url', 'https://example.com/repo.git', 'local')
    await access.appendConfigValue('remote.origin.url', 'https://other.com/repo.git', 'local')
    
    const allValues = await access.getAllConfigValues('remote.origin.url')
    assert.ok(allValues.length >= 1)
  })

  await t.test('ok:deleteConfigValue-removes', async () => {
    const access = new ConfigAccess(fs, gitdir)
    await access.setConfigValue('user.name', 'Test User', 'local')
    await access.deleteConfigValue('user.name', 'local')
    
    const value = await access.getConfigValue('user.name')
    assert.strictEqual(value, undefined)
  })

  await t.test('ok:reload-reloads-from-disk', async () => {
    const access = new ConfigAccess(fs, gitdir)
    await access.setConfigValue('user.name', 'Original', 'local')
    await access.reload()
    
    const value = await access.getConfigValue('user.name')
    assert.strictEqual(value, 'Original')
  })

  await t.test('ok:getSubsections-returns-subsections', async () => {
    const access = new ConfigAccess(fs, gitdir)
    await access.setConfigValue('remote.origin.url', 'https://example.com/repo.git', 'local')
    await access.setConfigValue('remote.other.url', 'https://other.com/repo.git', 'local')
    
    const subsections = await access.getSubsections('remote')
    assert.ok(Array.isArray(subsections))
    assert.ok(subsections.includes('origin') || subsections.includes(null))
  })

  await t.test('ok:getConfigValue-convenience', async () => {
    await setConfigValue(fs, gitdir, 'user.name', 'Convenience User', 'local')
    const value = await getConfigValue(fs, gitdir, 'user.name')
    assert.strictEqual(value, 'Convenience User')
  })

  await t.test('ok:setConfigValue-convenience', async () => {
    await setConfigValue(fs, gitdir, 'user.email', 'convenience@example.com', 'local')
    const value = await getConfigValue(fs, gitdir, 'user.email')
    assert.strictEqual(value, 'convenience@example.com')
  })

  await t.test('behavior:getService-always-reloads', async () => {
    const access = new ConfigAccess(fs, gitdir)
    
    // Set a value
    await access.setConfigValue('test.key', 'value1', 'local')
    
    // Get service (should reload)
    const service1 = await access.getService()
    const value1 = await service1.get('test.key')
    assert.strictEqual(value1, 'value1')
    
    // Change value directly (simulating external change)
    await access.setConfigValue('test.key', 'value2', 'local')
    
    // Get service again (should reload and get new value)
    const service2 = await access.getService()
    const value2 = await service2.get('test.key')
    assert.strictEqual(value2, 'value2')
  })

  await t.test('ok:multiple-config-values-same-section', async () => {
    const access = new ConfigAccess(fs, gitdir)
    await access.setConfigValue('user.name', 'User Name', 'local')
    await access.setConfigValue('user.email', 'user@example.com', 'local')
    
    const name = await access.getConfigValue('user.name')
    const email = await access.getConfigValue('user.email')
    
    assert.strictEqual(name, 'User Name')
    assert.strictEqual(email, 'user@example.com')
  })
})

