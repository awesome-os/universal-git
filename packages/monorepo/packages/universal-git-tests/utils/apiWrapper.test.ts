import { test } from 'node:test'
import assert from 'node:assert'
import { createApiWrapper } from '@awesome-os/universal-git-src/utils/apiWrapper.ts'
import { makeFixture } from '@awesome-os/universal-git-test-helpers/helpers/fixture.ts'
import type { FileSystemProvider } from '@awesome-os/universal-git-src/models/FileSystem.ts'

test('apiWrapper', async (t) => {
  await t.test('param:validates-required-parameters', async () => {
    const commandFn = async (args: { fs: any; gitdir: string; value: string }) => {
      return `result: ${args.value}`
    }
    
    const wrapped = createApiWrapper(commandFn, 'git.test', ['fs', 'gitdir', 'value'])
    
    // Missing fs
    await assert.rejects(
      async () => {
        await wrapped({ gitdir: '.git', value: 'test' } as any)
      },
      (error: any) => {
        return error.message.includes('fs') || error.message.includes('required')
      }
    )
    
    // Missing gitdir
    await assert.rejects(
      async () => {
        await wrapped({ fs: {}, value: 'test' } as any)
      },
      (error: any) => {
        return error.message.includes('gitdir') || error.message.includes('required')
      }
    )
    
    // Missing value
    await assert.rejects(
      async () => {
        await wrapped({ fs: {}, gitdir: '.git' } as any)
      },
      (error: any) => {
        return error.message.includes('value') || error.message.includes('required')
      }
    )
  })

  await t.test('param:resolves-gitdir-from-dir', async () => {
    const commandFn = async (args: { fs: any; gitdir: string }) => {
      return args.gitdir
    }
    
    // Create wrapper without requiring gitdir (since it can be resolved from dir)
    const wrapped = createApiWrapper(commandFn, 'git.test', ['fs'])
    
    const result = await wrapped({ fs: {} as FileSystemProvider, dir: '/repo' } as any)
    assert.strictEqual(result, '/repo/.git')
  })

  await t.test('param:uses-provided-gitdir-over-dir', async () => {
    const commandFn = async (args: { fs: any; gitdir: string }) => {
      return args.gitdir
    }
    
    const wrapped = createApiWrapper(commandFn, 'git.test')
    
    const result = await wrapped({ fs: {} as FileSystemProvider, dir: '/repo', gitdir: '/custom/.git' })
    assert.strictEqual(result, '/custom/.git')
  })

  await t.test('ok:passes-through-arguments', async () => {
    const commandFn = async (args: { fs: any; gitdir: string; extra: string; cache?: any }) => {
      return { gitdir: args.gitdir, extra: args.extra, cache: args.cache }
    }
    
    const wrapped = createApiWrapper(commandFn, 'git.test')
    const cache = {}
    
    const result = await wrapped({ fs: {} as FileSystemProvider, gitdir: '.git', extra: 'value', cache })
    assert.deepStrictEqual(result, { gitdir: '.git', extra: 'value', cache })
  })

  await t.test('error:caller-property', async () => {
    const commandFn = async (args: { fs: any; gitdir: string }) => {
      throw new Error('Command error')
    }
    
    const wrapped = createApiWrapper(commandFn, 'git.test')
    
    try {
      await wrapped({ fs: {} as FileSystemProvider, gitdir: '.git' })
      assert.fail('Should have thrown')
    } catch (error: any) {
      assert.strictEqual(error.caller, 'git.test')
      assert.strictEqual(error.message, 'Command error')
    }
  })

  await t.test('param:default-required-params', async () => {
    const commandFn = async (args: { fs: any; gitdir: string }) => {
      return 'success'
    }
    
    const wrapped = createApiWrapper(commandFn, 'git.test')
    
    // Should work with just fs and gitdir (default required params)
    const result = await wrapped({ fs: {} as FileSystemProvider, gitdir: '.git' })
    assert.strictEqual(result, 'success')
  })

  await t.test('error:gitdir-cannot-be-resolved', async () => {
    const commandFn = async (args: { fs: any; gitdir: string }) => {
      return 'success'
    }
    
    // Create wrapper without requiring gitdir (to test resolution)
    const wrapped = createApiWrapper(commandFn, 'git.test', ['fs'])
    
    // Neither gitdir nor dir provided - should fail during gitdir resolution
    await assert.rejects(
      async () => {
        await wrapped({ fs: {} } as any)
      },
      (error: any) => {
        return error.message.includes('gitdir is required') || error.message.includes('gitdir')
      }
    )
  })

  await t.test('param:custom-required-params', async () => {
    const commandFn = async (args: { fs: any; gitdir: string; custom: string }) => {
      return args.custom
    }
    
    const wrapped = createApiWrapper(commandFn, 'git.test', ['fs', 'gitdir', 'custom'])
    
    // Missing custom param
    await assert.rejects(
      async () => {
        await wrapped({ fs: {}, gitdir: '.git' } as any)
      },
      (error: any) => {
        return error.message.includes('custom') || error.message.includes('required')
      }
    )
    
    // With custom param
    const result = await wrapped({ fs: {} as FileSystemProvider, gitdir: '.git', custom: 'value' })
    assert.strictEqual(result, 'value')
  })

  await t.test('ok:preserves-return-value', async () => {
    const commandFn = async (args: { fs: any; gitdir: string }) => {
      return { nested: { value: 'test' } }
    }
    
    const wrapped = createApiWrapper(commandFn, 'git.test')
    
    const result = await wrapped({ fs: {} as FileSystemProvider, gitdir: '.git' })
    assert.deepStrictEqual(result, { nested: { value: 'test' } })
  })

  await t.test('ok:handles-async-command-functions', async () => {
    const commandFn = async (args: { fs: any; gitdir: string }) => {
      await new Promise(resolve => setTimeout(resolve, 10))
      return 'async result'
    }
    
    const wrapped = createApiWrapper(commandFn, 'git.test')
    
    const result = await wrapped({ fs: {} as FileSystemProvider, gitdir: '.git' })
    assert.strictEqual(result, 'async result')
  })
})

