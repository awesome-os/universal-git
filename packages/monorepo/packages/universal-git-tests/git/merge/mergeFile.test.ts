import { describe, it } from 'node:test'
import assert from 'node:assert'
import { mergeFile } from '@awesome-os/universal-git-src/git/merge/mergeFile.ts'
import { makeFixture } from '@awesome-os/universal-git-test-helpers/helpers/fixture.ts'

describe('mergeFile', () => {
  it('ok:clean-merge', async () => {
    // Setup
    const { fs, dir } = await makeFixture('test-mergeFile')
    // Test
    const ourContentRaw = await fs.read(`${dir}/a.txt`, 'utf8')
    const baseContentRaw = await fs.read(`${dir}/o.txt`, 'utf8')
    const theirContentRaw = await fs.read(`${dir}/b.txt`, 'utf8')
    
    const ourContent = typeof ourContentRaw === 'string' ? ourContentRaw : ourContentRaw?.toString('utf8') || ''
    const baseContent = typeof baseContentRaw === 'string' ? baseContentRaw : baseContentRaw?.toString('utf8') || ''
    const theirContent = typeof theirContentRaw === 'string' ? theirContentRaw : theirContentRaw?.toString('utf8') || ''

    const { cleanMerge, mergedText } = mergeFile({
      contents: [baseContent, ourContent, theirContent],
      branches: ['base', 'ours', 'theirs'],
    })
    assert.strictEqual(cleanMerge, true)
    assert.strictEqual(mergedText, await fs.read(`${dir}/aob.txt`, 'utf8'))
  })

  it('ok:conflict-merge', async () => {
    // Setup
    const { fs, dir } = await makeFixture('test-mergeFile')
    // Test
    const ourContentRaw = await fs.read(`${dir}/a.txt`, 'utf8')
    const baseContentRaw = await fs.read(`${dir}/o.txt`, 'utf8')
    const theirContentRaw = await fs.read(`${dir}/c.txt`, 'utf8')
    
    const ourContent = typeof ourContentRaw === 'string' ? ourContentRaw : ourContentRaw?.toString('utf8') || ''
    const baseContent = typeof baseContentRaw === 'string' ? baseContentRaw : baseContentRaw?.toString('utf8') || ''
    const theirContent = typeof theirContentRaw === 'string' ? theirContentRaw : theirContentRaw?.toString('utf8') || ''

    const { cleanMerge, mergedText } = mergeFile({
      contents: [baseContent, ourContent, theirContent],
      branches: ['base', 'ours', 'theirs'],
    })
    assert.strictEqual(cleanMerge, false)
    const expectedRaw = await fs.read(`${dir}/aoc.txt`, 'utf8')
    const expected = typeof expectedRaw === 'string' ? expectedRaw : expectedRaw?.toString('utf8') || ''
    assert.strictEqual(mergedText, expected)
  })
})

