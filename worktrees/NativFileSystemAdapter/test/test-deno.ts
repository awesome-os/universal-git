/** global Deno */
import * as fs from '../src/NativeFileSystemAdapter.js'
import steps from './test.js'
import {
  cleanupSandboxedFileSystem
} from '../test/util.js'

const { getOriginPrivateDirectory } = fs

async function test (fs: string, step: { desc: string; fn: (root: any) => Promise<void> }, root: any): Promise<boolean> {
  try {
    await cleanupSandboxedFileSystem(root)
    await step.fn(root)
    console.log(`[OK]: ${fs} ${step.desc}`)
    return false
  } catch (err: any) {
    console.log(`[ERR]: ${fs} ${step.desc}`)
    return true
  }
}

async function start (): Promise<void> {
  globalThis.Deno.mkdirSync('testfolder', { recursive: true })

  const root = await getOriginPrivateDirectory(import('../src/adapters/deno.js'), './testfolder')
  const memory = await getOriginPrivateDirectory(import('../src/adapters/memory.js'))

  let hasFailures = false

  for (const step of steps) {
    if (step.desc.includes('atomic')) continue
    if (await test('server', step, root)) {
      hasFailures = true
    }
  }

  console.log('\n\n\n')

  for (const step of steps) {
    if (await test('memory', step, memory)) {
      hasFailures = true
    }
  }

  if (hasFailures) {
    console.log(`\n\nSome tests failed. See output above.`)
    globalThis.Deno.exit(1)
  }
}

start()
