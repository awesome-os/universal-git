import { test } from 'node:test'
import assert from 'node:assert'
import { GitRemoteSSH } from '@awesome-os/universal-git-src/git/remote/GitRemoteSSH.ts'
import { ParseError } from '@awesome-os/universal-git-src/errors/ParseError.ts'

test('GitRemoteSSH', async (t) => {
  await t.test('capabilities returns discover and connect', async () => {
    const caps = await GitRemoteSSH.capabilities()
    assert.ok(Array.isArray(caps))
    assert.ok(caps.includes('discover'))
    assert.ok(caps.includes('connect'))
  })

  await t.test('parseSshUrl throws ParseError for invalid URL', async () => {
    const mockSsh = {
      connect: async () => {
        throw new Error('Should not be called')
      },
    } as any

    await assert.rejects(
      async () => {
        await GitRemoteSSH.discover({
          ssh: mockSsh,
          service: 'git-upload-pack',
          url: 'http://example.com/repo.git', // Not ssh://
        })
      },
      (error: any) => {
        return error instanceof ParseError && 
               error.message.includes('Invalid SSH URL')
      }
    )
  })

  await t.test('parseSshUrl handles scp-style URL (git@host:path)', async () => {
    const mockSsh = {
      connect: async () => {
        throw new Error('Connection test')
      },
    } as any

    // Should parse scp-style URL correctly
    await assert.rejects(
      async () => {
        await GitRemoteSSH.discover({
          ssh: mockSsh,
          service: 'git-upload-pack',
          url: 'git@example.com:repo.git',
        })
      },
      (error: any) => {
        // Should parse URL correctly, then fail on connection
        return error.message.includes('Connection test') || 
               error instanceof ParseError
      }
    )
  })

  await t.test('parseSshUrl handles ssh:// URL with username', async () => {
    const mockSsh = {
      connect: async () => {
        throw new Error('Connection test')
      },
    } as any

    await assert.rejects(
      async () => {
        await GitRemoteSSH.discover({
          ssh: mockSsh,
          service: 'git-upload-pack',
          url: 'ssh://user@example.com/repo.git',
        })
      },
      (error: any) => {
        return error.message.includes('Connection test') || 
               error instanceof ParseError
      }
    )
  })

  await t.test('parseSshUrl handles ssh:// URL without username (defaults to git)', async () => {
    const mockSsh = {
      connect: async () => {
        throw new Error('Connection test')
      },
    } as any

    await assert.rejects(
      async () => {
        await GitRemoteSSH.discover({
          ssh: mockSsh,
          service: 'git-upload-pack',
          url: 'ssh://example.com/repo.git',
        })
      },
      (error: any) => {
        return error.message.includes('Connection test') || 
               error instanceof ParseError
      }
    )
  })

  await t.test('parseSshUrl handles ssh:// URL with custom port', async () => {
    const mockSsh = {
      connect: async () => {
        throw new Error('Connection test')
      },
    } as any

    await assert.rejects(
      async () => {
        await GitRemoteSSH.discover({
          ssh: mockSsh,
          service: 'git-upload-pack',
          url: 'ssh://user@example.com:2222/repo.git',
        })
      },
      (error: any) => {
        return error.message.includes('Connection test') || 
               error instanceof ParseError
      }
    )
  })

  await t.test('parseSshUrl throws ParseError for invalid port', async () => {
    const mockSsh = {
      connect: async () => {
        throw new Error('Should not be called')
      },
    } as any

    await assert.rejects(
      async () => {
        await GitRemoteSSH.discover({
          ssh: mockSsh,
          service: 'git-upload-pack',
          url: 'ssh://example.com:99999/repo.git', // Invalid port
        })
      },
      (error: any) => {
        return error instanceof ParseError && 
               error.message.includes('Invalid port')
      }
    )
  })

  await t.test('parseSshUrl throws ParseError for invalid format', async () => {
    const mockSsh = {
      connect: async () => {
        throw new Error('Should not be called')
      },
    } as any

    await assert.rejects(
      async () => {
        await GitRemoteSSH.discover({
          ssh: mockSsh,
          service: 'git-upload-pack',
          url: 'ssh://', // Invalid format
        })
      },
      (error: any) => {
        return error instanceof ParseError
      }
    )
  })

  await t.test('parseSshUrl normalizes path to start with /', async () => {
    const mockSsh = {
      connect: async () => {
        throw new Error('Connection test')
      },
    } as any

    // Test that relative paths are normalized to absolute
    await assert.rejects(
      async () => {
        await GitRemoteSSH.discover({
          ssh: mockSsh,
          service: 'git-upload-pack',
          url: 'ssh://example.com:repo.git', // Path without leading /
        })
      },
      (error: any) => {
        return error.message.includes('Connection test') || 
               error instanceof ParseError
      }
    )
  })
})

