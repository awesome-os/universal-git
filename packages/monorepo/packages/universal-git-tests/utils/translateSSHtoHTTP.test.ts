import { test } from 'node:test'
import assert from 'node:assert'
import { translateSSHtoHTTP } from '@awesome-os/universal-git-src/utils/translateSSHtoHTTP.ts'

test('translateSSHtoHTTP', async (t) => {
  await t.test('ok:translates-scp-syntax', () => {
    const result = translateSSHtoHTTP('git@github.com:user/repo.git')
    assert.strictEqual(result, 'https://github.com/user/repo.git')
  })

  await t.test('ok:translates-SSH-URL', () => {
    const result = translateSSHtoHTTP('ssh://git@github.com/user/repo.git')
    assert.strictEqual(result, 'https://git@github.com/user/repo.git')
  })

  await t.test('ok:scp-different-host', () => {
    const result = translateSSHtoHTTP('git@gitlab.com:group/project.git')
    assert.strictEqual(result, 'https://gitlab.com/group/project.git')
  })

  await t.test('ok:SSH-URL-no-user', () => {
    const result = translateSSHtoHTTP('ssh://github.com/user/repo.git')
    assert.strictEqual(result, 'https://github.com/user/repo.git')
  })

  await t.test('ok:HTTP-URLs-unchanged', () => {
    const result = translateSSHtoHTTP('https://github.com/user/repo.git')
    assert.strictEqual(result, 'https://github.com/user/repo.git')
  })

  await t.test('ok:HTTPS-URLs-unchanged', () => {
    const result = translateSSHtoHTTP('https://github.com/user/repo.git')
    assert.strictEqual(result, 'https://github.com/user/repo.git')
  })

  await t.test('ok:scp-port-in-host', () => {
    const result = translateSSHtoHTTP('git@github.com:2222:user/repo.git')
    assert.strictEqual(result, 'https://github.com:2222/user/repo.git')
  })

  await t.test('ok:scp-complex-paths', () => {
    const result = translateSSHtoHTTP('git@example.com:path/to/deep/repo.git')
    assert.strictEqual(result, 'https://example.com/path/to/deep/repo.git')
  })
})

