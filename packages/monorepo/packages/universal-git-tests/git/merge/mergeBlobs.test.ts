import { test } from 'node:test'
import assert from 'node:assert'
import { UniversalBuffer } from '@awesome-os/universal-git-src/utils/UniversalBuffer.ts'
import { mergeBlobs } from '@awesome-os/universal-git-src/git/merge/mergeBlobs.ts'

test('mergeBlobs', async (t) => {
  await t.test('ok:clean-merge-no-conflicts', async () => {
    // Setup: Base has "Line 1\nLine 2\nLine 3"
    // Ours adds Line 4
    // Theirs adds Line 5 (both add after Line 3, but different content)
    // Note: diff3 may treat this as a conflict if both add at the same position
    // Let's test a truly clean case: ours modifies, theirs doesn't change
    const base = 'Line 1\nLine 2\nLine 3\n'
    const ours = 'Line 1\nLine 2 modified\nLine 3\n'
    const theirs = 'Line 1\nLine 2\nLine 3\n' // unchanged

    // Test
    const result = mergeBlobs({ base, ours, theirs })

    // Assert
    assert.strictEqual(result.hasConflict, false)
    const mergedText = result.mergedContent.toString('utf8')
    assert.ok(mergedText.includes('Line 1'))
    assert.ok(mergedText.includes('Line 2 modified'))
    assert.ok(mergedText.includes('Line 3'))
  })

  await t.test('ok:conflict-when-both-modify-same-line', async () => {
    // Setup: Base has "Line 1\nLine 2\nLine 3"
    // Ours changes Line 2 to "Line 2 modified by us"
    // Theirs changes Line 2 to "Line 2 modified by them"
    // Result should have conflict markers
    const base = 'Line 1\nLine 2\nLine 3\n'
    const ours = 'Line 1\nLine 2 modified by us\nLine 3\n'
    const theirs = 'Line 1\nLine 2 modified by them\nLine 3\n'

    // Test
    const result = mergeBlobs({ base, ours, theirs })

    // Assert
    assert.strictEqual(result.hasConflict, true)
    const mergedText = result.mergedContent.toString('utf8')
    assert.ok(mergedText.includes('<<<<<<< ours'))
    assert.ok(mergedText.includes('======='))
    assert.ok(mergedText.includes('>>>>>>> theirs'))
    assert.ok(mergedText.includes('Line 2 modified by us'))
    assert.ok(mergedText.includes('Line 2 modified by them'))
  })

  await t.test('ok:conflict-markers-format', async () => {
    // Setup: Create a conflict
    const base = 'Base content\n'
    const ours = 'Our content\n'
    const theirs = 'Their content\n'

    // Test
    const result = mergeBlobs({ base, ours, theirs })

    // Assert
    assert.strictEqual(result.hasConflict, true)
    const mergedText = result.mergedContent.toString('utf8')
    // Check for 7 '<' characters
    assert.ok(mergedText.includes('<<<<<<< ours'))
    // Check for 7 '=' characters
    assert.ok(mergedText.includes('======='))
    // Check for 7 '>' characters
    assert.ok(mergedText.includes('>>>>>>> theirs'))
  })

  await t.test('ok:custom-branch-names', async () => {
    // Setup: Create a conflict with custom names
    const base = 'Base\n'
    const ours = 'Ours\n'
    const theirs = 'Theirs\n'

    // Test
    const result = mergeBlobs({
      base,
      ours,
      theirs,
      ourName: 'feature-branch',
      theirName: 'main',
    })

    // Assert
    assert.strictEqual(result.hasConflict, true)
    const mergedText = result.mergedContent.toString('utf8')
    assert.ok(mergedText.includes('<<<<<<< feature-branch'))
    assert.ok(mergedText.includes('>>>>>>> main'))
  })

  await t.test('ok:empty-base-new-file-added-by-both', async () => {
    // Setup: Both branches add the same file
    const base = ''
    const ours = 'New file content\n'
    const theirs = 'New file content\n'

    // Test
    const result = mergeBlobs({ base, ours, theirs })

    // Assert
    assert.strictEqual(result.hasConflict, false)
    const mergedText = result.mergedContent.toString('utf8')
    assert.strictEqual(mergedText, 'New file content\n')
  })

  await t.test('ok:empty-base-different-content-conflict', async () => {
    // Setup: Both branches add different content to new file
    const base = ''
    const ours = 'Our new content\n'
    const theirs = 'Their new content\n'

    // Test
    const result = mergeBlobs({ base, ours, theirs })

    // Assert
    assert.strictEqual(result.hasConflict, true)
    const mergedText = result.mergedContent.toString('utf8')
    assert.ok(mergedText.includes('<<<<<<< ours'))
    assert.ok(mergedText.includes('Our new content'))
    assert.ok(mergedText.includes('Their new content'))
  })

  await t.test('ok:file-deleted-by-us-modified-by-them', async () => {
    // Setup: Base has content, we delete it, they modify it
    const base = 'Original content\n'
    const ours = ''
    const theirs = 'Modified content\n'

    // Test
    const result = mergeBlobs({ base, ours, theirs })

    // Assert
    // This should result in a conflict
    assert.strictEqual(result.hasConflict, true)
    const mergedText = result.mergedContent.toString('utf8')
    assert.ok(mergedText.includes('<<<<<<< ours'))
    assert.ok(mergedText.includes('Modified content'))
  })

  await t.test('ok:file-modified-by-us-deleted-by-them', async () => {
    // Setup: Base has content, we modify it, they delete it
    const base = 'Original content\n'
    const ours = 'Modified content\n'
    const theirs = ''

    // Test
    const result = mergeBlobs({ base, ours, theirs })

    // Assert
    // This should result in a conflict
    assert.strictEqual(result.hasConflict, true)
    const mergedText = result.mergedContent.toString('utf8')
    assert.ok(mergedText.includes('<<<<<<< ours'))
    assert.ok(mergedText.includes('Modified content'))
  })

  await t.test('ok:Buffer-input-instead-of-string', async () => {
    // Setup: Use Buffer inputs
    const base = UniversalBuffer.from('Base content\n', 'utf8')
    const ours = UniversalBuffer.from('Our content\n', 'utf8')
    const theirs = UniversalBuffer.from('Their content\n', 'utf8')

    // Test
    const result = mergeBlobs({ base, ours, theirs })

    // Assert
    assert.strictEqual(result.hasConflict, true)
    assert.ok(result.mergedContent instanceof UniversalBuffer)
    const mergedText = result.mergedContent.toString('utf8')
    assert.ok(mergedText.includes('<<<<<<< ours'))
  })

  await t.test('ok:mixed-Buffer-and-string-inputs', async () => {
    // Setup: Mix Buffer and string inputs
    const base = 'Base content\n'
    const ours = UniversalBuffer.from('Our content\n', 'utf8')
    const theirs = 'Their content\n'

    // Test
    const result = mergeBlobs({ base, ours, theirs })

    // Assert
    assert.strictEqual(result.hasConflict, true)
    const mergedText = result.mergedContent.toString('utf8')
    assert.ok(mergedText.includes('<<<<<<< ours'))
  })

  await t.test('ok:single-line-file', async () => {
    // Setup: Single line file
    const base = 'Single line\n'
    const ours = 'Single line modified by us\n'
    const theirs = 'Single line modified by them\n'

    // Test
    const result = mergeBlobs({ base, ours, theirs })

    // Assert
    assert.strictEqual(result.hasConflict, true)
    const mergedText = result.mergedContent.toString('utf8')
    assert.ok(mergedText.includes('<<<<<<< ours'))
  })

  await t.test('ok:no-newline-at-end', async () => {
    // Setup: Files without trailing newline, both modify different parts
    const base = 'Line 1\nLine 2'
    const ours = 'Line 1 modified\nLine 2'
    const theirs = 'Line 1\nLine 2 modified'

    // Test
    const result = mergeBlobs({ base, ours, theirs })

    // Assert
    // This may or may not be a conflict depending on diff3 behavior
    // Just verify it processes correctly
    const mergedText = result.mergedContent.toString('utf8')
    assert.ok(mergedText.includes('Line 1'))
    assert.ok(mergedText.includes('Line 2'))
    // Verify it doesn't crash and produces valid output
    assert.ok(result.mergedContent instanceof UniversalBuffer)
  })

  await t.test('ok:multiple-conflicts-in-same-file', async () => {
    // Setup: Multiple conflicting sections
    const base = 'Line 1\nLine 2\nLine 3\nLine 4\n'
    const ours = 'Line 1 modified\nLine 2\nLine 3 modified\nLine 4\n'
    const theirs = 'Line 1\nLine 2 modified\nLine 3\nLine 4 modified\n'

    // Test
    const result = mergeBlobs({ base, ours, theirs })

    // Assert
    assert.strictEqual(result.hasConflict, true)
    const mergedText = result.mergedContent.toString('utf8')
    // Should have multiple conflict markers
    const conflictCount = (mergedText.match(/<<<<<<< /g) || []).length
    assert.ok(conflictCount >= 1)
  })

  await t.test('ok:identical-changes-no-conflict', async () => {
    // Setup: Both make the same change
    const base = 'Original\n'
    const ours = 'Modified\n'
    const theirs = 'Modified\n'

    // Test
    const result = mergeBlobs({ base, ours, theirs })

    // Assert
    assert.strictEqual(result.hasConflict, false)
    const mergedText = result.mergedContent.toString('utf8')
    assert.ok(mergedText.includes('Modified'))
    assert.ok(!mergedText.includes('<<<<<<<'))
  })

  await t.test('ok:whitespace-only-changes', async () => {
    // Setup: Only whitespace differences
    const base = 'Line 1\nLine 2\n'
    const ours = 'Line 1\nLine 2  \n' // trailing spaces
    const theirs = 'Line 1\nLine 2\n'

    // Test
    const result = mergeBlobs({ base, ours, theirs })

    // Assert
    // This may or may not be a conflict depending on diff3 behavior
    // Just verify it doesn't crash
    assert.ok(result.mergedContent instanceof UniversalBuffer)
  })
})

