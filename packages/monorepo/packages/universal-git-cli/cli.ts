#!/usr/bin/env node
import * as fs from 'fs'
import minimisted from 'minimisted'
import * as git from '@awesome-os/universal-git-src/index.ts'
import http from '@awesome-os/universal-git-src/http/node/index.ts'
import type { Readable } from 'stream'

// This really isn't much of a CLI. It's mostly for testing.
// But it's very versatile and works surprisingly well.

interface CliOptions {
  _: string[]
  username?: string
  password?: string
  [key: string]: unknown
}

// minimisted expects (argv, options, handler) but TypeScript types may be incomplete
// Using type assertion since the original JS code worked with just the handler
;(minimisted as unknown as (handler: (opts: CliOptions) => Promise<void>) => void)(
  async function({ _: [command, ...args], ...opts }: CliOptions) {
  try {
    if (!command) {
      console.error('Error: No command specified')
      process.exit(1)
      return
    }

    const gitCommand = (git as Record<string, unknown>)[command]
    if (typeof gitCommand !== 'function') {
      console.error(`Error: Unknown command "${command}"`)
      process.exit(1)
      return
    }

    const result = await (gitCommand as (...args: unknown[]) => Promise<unknown>)(
      Object.assign(
        {
          fs,
          http,
          dir: '.',
          onAuth: () => ({ username: opts.username, password: opts.password }),
          headers: {
            'User-Agent': `git/ugit-${git.version()}`,
          },
        },
        opts
      )
    )
    if (result === undefined) return
    // detect streams
    if (result && typeof result === 'object' && 'on' in result && typeof (result as Readable).on === 'function') {
      ;(result as Readable).pipe(process.stdout)
    } else {
      console.log(JSON.stringify(result, null, 2))
    }
  } catch (err) {
    const error = err as Error
    process.stderr.write(error.message + '\n')
    console.log(err)
    process.exit(1)
  }
})
