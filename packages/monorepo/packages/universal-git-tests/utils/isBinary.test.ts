import { test } from 'node:test'
import assert from 'node:assert'
import * as path from 'path'
import { isBinary } from '@awesome-os/universal-git-src/utils/isBinary.ts'
import { makeFixture } from '@awesome-os/universal-git-test-helpers/helpers/fixture.ts'

const binaryFiles = [
  'browserconfig.gz',
  'browserconfig.zip',
  'favicon-16x16.gif',
  'favicon-16x16.png',
]
const textFiles = ['browserconfig.xml', 'manifest.json']

test('isBinary', async (t) => {
  for (const file of binaryFiles) {
    await t.test(`ok:${path.extname(file)}-is-binary`, async () => {
      // Setup
      const { repo, fs, dir, gitdir } = await makeFixture('test-isBinary', { init: true })
      const buffer = await fs.read(`${dir}/${file}`)
      // Test
      if (!buffer) throw new Error('Buffer is null')
      const bufferData = typeof buffer === 'string' 
        ? new TextEncoder().encode(buffer) 
        : buffer instanceof Uint8Array 
          ? buffer 
          : new Uint8Array(buffer)
      assert.strictEqual(isBinary(bufferData), true)
    })
  }

  for (const file of textFiles) {
    await t.test(`ok:${path.extname(file)}-not-binary`, async () => {
      // Setup
      const { repo, fs, dir, gitdir } = await makeFixture('test-isBinary', { init: true })
      const buffer = await fs.read(`${dir}/${file}`)
      // Test
      if (!buffer) throw new Error('Buffer is null')
      const bufferData = typeof buffer === 'string' 
        ? new TextEncoder().encode(buffer) 
        : buffer instanceof Uint8Array 
          ? buffer 
          : new Uint8Array(buffer)
      assert.strictEqual(isBinary(bufferData), false)
    })
  }
})

