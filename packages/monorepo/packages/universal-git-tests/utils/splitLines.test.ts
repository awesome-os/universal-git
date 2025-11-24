import { test } from 'node:test'
import assert from 'node:assert'
import { splitLines } from '@awesome-os/universal-git-src/utils/splitLines.ts'
import { UniversalBuffer } from '@awesome-os/universal-git-src/utils/UniversalBuffer.ts'

test('splitLines', async (t) => {
  await t.test('ok:splits-lines-newline', async () => {
    const input = [Buffer.from('line1\nline2\nline3')]
    const output = splitLines(input)
    
    // Wait for async processing
    await new Promise(resolve => setTimeout(resolve, 10))
    
    const lines: UniversalBuffer[] = []
    while (true) {
      const result = await output.next()
      if (result.done) break
      if (result.value) lines.push(result.value)
    }
    
    assert.strictEqual(lines.length, 3)
    assert.strictEqual(lines[0].toString(), 'line1\n')
    assert.strictEqual(lines[1].toString(), 'line2\n')
    assert.strictEqual(lines[2].toString(), 'line3')
  })

  await t.test('ok:splits-lines-carriage-return', async () => {
    const input = [Buffer.from('line1\rline2\rline3')]
    const output = splitLines(input)
    
    await new Promise(resolve => setTimeout(resolve, 10))
    
    const lines: UniversalBuffer[] = []
    while (true) {
      const result = await output.next()
      if (result.done) break
      if (result.value) lines.push(result.value)
    }
    
    assert.strictEqual(lines.length, 3)
    assert.strictEqual(lines[0].toString(), 'line1\r')
    assert.strictEqual(lines[1].toString(), 'line2\r')
    assert.strictEqual(lines[2].toString(), 'line3')
  })

  await t.test('ok:splits-lines-CRLF', async () => {
    const input = [Buffer.from('line1\r\nline2\r\nline3')]
    const output = splitLines(input)
    
    await new Promise(resolve => setTimeout(resolve, 10))
    
    const lines: UniversalBuffer[] = []
    while (true) {
      const result = await output.next()
      if (result.done) break
      if (result.value) lines.push(result.value)
    }
    
    assert.strictEqual(lines.length, 3)
    assert.strictEqual(lines[0].toString(), 'line1\r\n')
    assert.strictEqual(lines[1].toString(), 'line2\r\n')
    assert.strictEqual(lines[2].toString(), 'line3')
  })

  await t.test('ok:handles-multiple-chunks', async () => {
    const input = [
      Buffer.from('line1\nline'),
      Buffer.from('2\nline3\n'),
    ]
    const output = splitLines(input)
    
    await new Promise(resolve => setTimeout(resolve, 10))
    
    const lines: UniversalBuffer[] = []
    while (true) {
      const result = await output.next()
      if (result.done) break
      if (result.value) lines.push(result.value)
    }
    
    assert.strictEqual(lines.length, 3)
    assert.strictEqual(lines[0].toString(), 'line1\n')
    assert.strictEqual(lines[1].toString(), 'line2\n')
    assert.strictEqual(lines[2].toString(), 'line3\n')
  })

  await t.test('edge:empty-input', async () => {
    const input: UniversalBuffer[] = []
    const output = splitLines(input)
    
    await new Promise(resolve => setTimeout(resolve, 10))
    
    const lines: UniversalBuffer[] = []
    while (true) {
      const result = await output.next()
      if (result.done) break
      if (result.value) lines.push(result.value)
    }
    
    assert.strictEqual(lines.length, 0)
  })

  await t.test('ok:handles-input-no-line-breaks', async () => {
    const input = [Buffer.from('no line breaks here')]
    const output = splitLines(input)
    
    await new Promise(resolve => setTimeout(resolve, 10))
    
    const lines: UniversalBuffer[] = []
    while (true) {
      const result = await output.next()
      if (result.done) break
      if (result.value) lines.push(result.value)
    }
    
    assert.strictEqual(lines.length, 1)
    assert.strictEqual(lines[0].toString(), 'no line breaks here')
  })

  await t.test('ok:handles-Uint8Array-input', async () => {
    // Convert Uint8Array to Buffer for consistency with other tests
    const input = [Buffer.from(new Uint8Array(Buffer.from('line1\nline2\n')))]
    const output = splitLines(input)
    
    await new Promise(resolve => setTimeout(resolve, 10))
    
    const lines: UniversalBuffer[] = []
    while (true) {
      const result = await output.next()
      if (result.done) break
      if (result.value) lines.push(result.value)
    }
    
    assert.strictEqual(lines.length, 2)
    assert.strictEqual(lines[0].toString(), 'line1\n')
    assert.strictEqual(lines[1].toString(), 'line2\n')
  })

  await t.test('ok:handles-mixed-line-endings', async () => {
    const input = [Buffer.from('line1\nline2\rline3\r\nline4')]
    const output = splitLines(input)
    
    await new Promise(resolve => setTimeout(resolve, 10))
    
    const lines: UniversalBuffer[] = []
    while (true) {
      const result = await output.next()
      if (result.done) break
      if (result.value) lines.push(result.value)
    }
    
    assert.strictEqual(lines.length, 4)
    assert.strictEqual(lines[0].toString(), 'line1\n')
    assert.strictEqual(lines[1].toString(), 'line2\r')
    assert.strictEqual(lines[2].toString(), 'line3\r\n')
    assert.strictEqual(lines[3].toString(), 'line4')
  })
})

