import { test } from 'node:test'
import assert from 'node:assert'
import { hashBlob } from '@awesome-os/universal-git-src/index.ts'

const string = `#!/usr/bin/env node
const minimisted = require('minimisted')
const git = require('.')

// This really isn't much of a CLI. It's mostly for testing.
// But it's very versatile and works surprisingly well.

minimisted(async function ({ _: [command, ...args], ...opts }) {
  const dir = process.cwd()
  const repo = git(dir)
  let cmd = \`git('\${dir}')\`
  for (let key of Object.keys(opts)) {
    // This is how you check for an array, right?
    if (opts[key].length === undefined) {
      repo[key](opts[key])
      cmd += \`.\${key}('\${opts[key]}')\`
    } else {
      repo[key](...opts[key])
      cmd += \`.\${key}(\${opts[key].map(x => \`'\${x}'\`).join(', ')})\`
    }
  }
  cmd += \`.\${command}(\${args.map(x => \`'\${x}'\`).join(', ')})\`
  console.log(cmd)
  let result = await repo[command](...args)
  if (result === undefined) return
  console.log(JSON.stringify(result, null, 2))
})
`

const buffer = Buffer.from(string, 'utf8')

const wrapped = Buffer.concat([
  Buffer.from(`blob ${buffer.byteLength}\x00`),
  buffer,
])

test('hashBlob', async (t) => {
  await t.test('ok:object-Uint8Array', async () => {
    // Test
    const { oid, object, format } = await hashBlob({
      object: buffer,
    })
    assert.strictEqual(oid, '4551a1856279dde6ae9d65862a1dff59a5f199d8')
    assert.strictEqual(format, 'wrapped')
    assert.strictEqual(Buffer.compare(Buffer.from(object), wrapped), 0)
  })

  await t.test('ok:object-String', async () => {
    // Test
    const { oid, object, format } = await hashBlob({
      object: string,
    })
    assert.strictEqual(oid, '4551a1856279dde6ae9d65862a1dff59a5f199d8')
    assert.strictEqual(format, 'wrapped')
    assert.strictEqual(Buffer.compare(Buffer.from(object), wrapped), 0)
  })

  await t.test('edge:hash-empty-string', async () => {
    // Test
    const { oid, type, format, object } = await hashBlob({
      object: '',
    })
    assert.strictEqual(type, 'blob')
    assert.strictEqual(format, 'wrapped')
    assert.strictEqual(oid, 'e69de29bb2d1d6434b8b29ae775ad8c2e48c5391')
    assert.ok(object instanceof Uint8Array)
  })

  await t.test('ok:hash-multiline-string', async () => {
    // Test
    const { oid, type, format, object } = await hashBlob({
      object: 'Line 1\nLine 2\nLine 3',
    })
    assert.strictEqual(type, 'blob')
    assert.strictEqual(format, 'wrapped')
    assert.ok(/^[0-9a-f]{40}$/.test(oid))
    assert.ok(object instanceof Uint8Array)
  })

  await t.test('ok:hash-binary-data', async () => {
    // Test
    const binaryData = new Uint8Array([0x00, 0x01, 0x02, 0xFF, 0xFE, 0xFD])
    const { oid, type, format, object } = await hashBlob({
      object: binaryData,
    })
    assert.strictEqual(type, 'blob')
    assert.strictEqual(format, 'wrapped')
    assert.ok(/^[0-9a-f]{40}$/.test(oid))
    assert.ok(object instanceof Uint8Array)
  })

  await t.test('ok:hash-unicode-string', async () => {
    // Test
    const { oid, type, format, object } = await hashBlob({
      object: 'Hello 世界 🌍',
    })
    assert.strictEqual(type, 'blob')
    assert.strictEqual(format, 'wrapped')
    assert.ok(/^[0-9a-f]{40}$/.test(oid))
    assert.ok(object instanceof Uint8Array)
  })

  await t.test('ok:hash-large-string', async () => {
    // Test
    const largeString = 'x'.repeat(10000)
    const { oid, type, format, object } = await hashBlob({
      object: largeString,
    })
    assert.strictEqual(type, 'blob')
    assert.strictEqual(format, 'wrapped')
    assert.ok(/^[0-9a-f]{40}$/.test(oid))
    assert.ok(object instanceof Uint8Array)
  })

  await t.test('ok:consistent-hashes-same-input', async () => {
    // Test
    const input = 'Hello world!'
    const result1 = await hashBlob({ object: input })
    const result2 = await hashBlob({ object: input })
    assert.strictEqual(result1.oid, result2.oid)
    assert.strictEqual(result1.type, result2.type)
    assert.strictEqual(result1.format, result2.format)
  })

  await t.test('ok:different-hashes-different-inputs', async () => {
    // Test
    const result1 = await hashBlob({ object: 'Hello' })
    const result2 = await hashBlob({ object: 'World' })
    assert.notStrictEqual(result1.oid, result2.oid)
  })

  await t.test('ok:wrapped-object-format', async () => {
    // Test
    const result = await hashBlob({
      object: 'test',
    })
    // The wrapped format should be: "blob 4\0test"
    const wrapped = Buffer.from(result.object)
    assert.strictEqual(wrapped.toString('utf8', 0, 4), 'blob')
    assert.strictEqual(wrapped[4], 0x20) // space
    assert.strictEqual(wrapped[5], 0x34) // '4'
    assert.strictEqual(wrapped[6], 0x00) // null terminator
  })
})

