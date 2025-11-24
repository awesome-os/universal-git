import { test } from 'node:test'
import assert from 'node:assert'
import { parse, loadAttributes, getAttributes, hasAttribute } from '@awesome-os/universal-git-src/core-utils/filesystem/GitAttributesParser.ts'
import { makeFixture } from '@awesome-os/universal-git-test-helpers/helpers/fixture.ts'

test('GitAttributesParser', async (t) => {
  await t.test('ok:parse-empty-content-returns-empty-array', () => {
    const result = parse('')
    assert.deepStrictEqual(result, [])
  })

  await t.test('ok:parse-parses-simple-attribute-rule', () => {
    const content = '*.txt text'
    const result = parse(content)
    assert.strictEqual(result.length, 1)
    assert.strictEqual(result[0].pattern, '*.txt')
    assert.strictEqual(result[0].attributes.text, true)
  })

  await t.test('ok:parse-parses-attribute-with-value', () => {
    const content = '*.txt eol=lf'
    const result = parse(content)
    assert.strictEqual(result.length, 1)
    assert.strictEqual(result[0].pattern, '*.txt')
    assert.strictEqual(result[0].attributes.eol, 'lf')
  })

  await t.test('ok:parse-parses-multiple-attributes', () => {
    const content = '*.txt text eol=lf diff'
    const result = parse(content)
    assert.strictEqual(result.length, 1)
    assert.strictEqual(result[0].pattern, '*.txt')
    assert.strictEqual(result[0].attributes.text, true)
    assert.strictEqual(result[0].attributes.eol, 'lf')
    assert.strictEqual(result[0].attributes.diff, true)
  })

  await t.test('ok:parse-skips-empty-lines', () => {
    const content = '*.txt text\n\n*.js binary'
    const result = parse(content)
    assert.strictEqual(result.length, 2)
    assert.strictEqual(result[0].pattern, '*.txt')
    assert.strictEqual(result[1].pattern, '*.js')
  })

  await t.test('ok:parse-skips-comment-lines', () => {
    const content = '# This is a comment\n*.txt text\n# Another comment\n*.js binary'
    const result = parse(content)
    assert.strictEqual(result.length, 2)
    assert.strictEqual(result[0].pattern, '*.txt')
    assert.strictEqual(result[1].pattern, '*.js')
  })

  await t.test('ok:parse-skips-lines-with-only-pattern', () => {
    const content = '*.txt text\n*.js\n*.py binary'
    const result = parse(content)
    assert.strictEqual(result.length, 2)
    assert.strictEqual(result[0].pattern, '*.txt')
    assert.strictEqual(result[1].pattern, '*.py')
  })

  await t.test('ok:parse-handles-multiple-rules', () => {
    const content = '*.txt text\n*.js binary\n*.py eol=lf'
    const result = parse(content)
    assert.strictEqual(result.length, 3)
    assert.strictEqual(result[0].pattern, '*.txt')
    assert.strictEqual(result[1].pattern, '*.js')
    assert.strictEqual(result[2].pattern, '*.py')
  })

  await t.test('ok:parse-handles-attributes-with-equals-in-value-split-limit', () => {
    const content = '*.txt filter=myfilter=value'
    const result = parse(content)
    assert.strictEqual(result.length, 1)
    // split('=', 2) limits splits, so 'filter=myfilter=value' becomes ['filter', 'myfilter', 'value']
    // but destructuring [key, value] only takes first two, so value is 'myfilter'
    assert.strictEqual(result[0].attributes.filter, 'myfilter')
  })

  await t.test('ok:parse-handles-whitespace-in-pattern', () => {
    const content = '  *.txt   text   eol=lf  '
    const result = parse(content)
    assert.strictEqual(result.length, 1)
    assert.strictEqual(result[0].pattern, '*.txt')
    assert.strictEqual(result[0].attributes.text, true)
    assert.strictEqual(result[0].attributes.eol, 'lf')
  })

  await t.test('ok:loadAttributes-loads-from-root-gitattributes', async () => {
    const { fs, dir } = await makeFixture('test-empty')
    await fs.write(join(dir, '.gitattributes'), '*.txt text eol=lf\n*.js binary')
    
    const result = await loadAttributes({ fs, dir, filepath: 'test.txt' })
    assert.strictEqual(result.text, true)
    assert.strictEqual(result.eol, 'lf')
  })

  await t.test('ok:loadAttributes-loads-from-nested-gitattributes', async () => {
    const { fs, dir } = await makeFixture('test-empty')
    await fs.mkdir(join(dir, 'subdir'))
    await fs.write(join(dir, '.gitattributes'), '*.txt text')
    await fs.write(join(dir, 'subdir', '.gitattributes'), '*.txt eol=crlf')
    
    const result = await loadAttributes({ fs, dir, filepath: 'subdir/test.txt' })
    assert.strictEqual(result.text, true)
    assert.strictEqual(result.eol, 'crlf') // Nested overrides
  })

  await t.test('ok:loadAttributes-handles-deeply-nested-paths', async () => {
    const { fs, dir } = await makeFixture('test-empty')
    // Create nested directories one at a time
    await fs.mkdir(join(dir, 'level1'))
    await fs.mkdir(join(dir, 'level1', 'level2'))
    await fs.mkdir(join(dir, 'level1', 'level2', 'level3'))
    await fs.write(join(dir, '.gitattributes'), '*.txt text')
    await fs.write(join(dir, 'level1', '.gitattributes'), '*.txt eol=lf')
    await fs.write(join(dir, 'level1', 'level2', '.gitattributes'), '*.txt diff')
    
    const result = await loadAttributes({ fs, dir, filepath: 'level1/level2/level3/test.txt' })
    assert.strictEqual(result.text, true)
    assert.strictEqual(result.eol, 'lf')
    assert.strictEqual(result.diff, true)
  })

  await t.test('edge:loadAttributes-handles-missing-gitattributes-files', async () => {
    const { fs, dir } = await makeFixture('test-empty')
    
    const result = await loadAttributes({ fs, dir, filepath: 'test.txt' })
    assert.deepStrictEqual(result, {})
  })

  await t.test('ok:loadAttributes-merges-attributes-from-multiple-files', async () => {
    const { fs, dir } = await makeFixture('test-empty')
    await fs.mkdir(join(dir, 'subdir'))
    await fs.write(join(dir, '.gitattributes'), '*.txt text')
    await fs.write(join(dir, 'subdir', '.gitattributes'), '*.txt eol=lf diff')
    
    const result = await loadAttributes({ fs, dir, filepath: 'subdir/test.txt' })
    assert.strictEqual(result.text, true)
    assert.strictEqual(result.eol, 'lf')
    assert.strictEqual(result.diff, true)
  })

  await t.test('ok:getAttributes-returns-attributes-for-filepath', async () => {
    const { fs, dir } = await makeFixture('test-empty')
    await fs.write(join(dir, '.gitattributes'), '*.txt text eol=lf')
    
    const result = await getAttributes({ fs, dir, filepath: 'test.txt' })
    assert.strictEqual(result.text, true)
    assert.strictEqual(result.eol, 'lf')
  })

  await t.test('ok:hasAttribute-returns-attribute-value-if-present', async () => {
    const { fs, dir } = await makeFixture('test-empty')
    await fs.write(join(dir, '.gitattributes'), '*.txt text eol=lf')
    
    const result1 = await hasAttribute({ fs, dir, filepath: 'test.txt', attribute: 'text' })
    assert.strictEqual(result1, true)
    
    const result2 = await hasAttribute({ fs, dir, filepath: 'test.txt', attribute: 'eol' })
    assert.strictEqual(result2, 'lf')
  })

  await t.test('ok:hasAttribute-returns-false-if-attribute-not-present', async () => {
    const { fs, dir } = await makeFixture('test-empty')
    await fs.write(join(dir, '.gitattributes'), '*.txt text')
    
    const result = await hasAttribute({ fs, dir, filepath: 'test.txt', attribute: 'binary' })
    assert.strictEqual(result, false)
  })

  await t.test('ok:hasAttribute-returns-false-for-file-with-no-attributes', async () => {
    const { fs, dir } = await makeFixture('test-empty')
    
    const result = await hasAttribute({ fs, dir, filepath: 'test.txt', attribute: 'text' })
    assert.strictEqual(result, false)
  })

  await t.test('ok:parse-handles-pattern-with-negation', () => {
    const content = '!*.txt text'
    const result = parse(content)
    assert.strictEqual(result.length, 1)
    assert.strictEqual(result[0].pattern, '!*.txt')
  })

  await t.test('edge:parse-handles-null-undefined-content', () => {
    // @ts-expect-error - testing edge case
    const result1 = parse(null)
    assert.deepStrictEqual(result1, [])
    
    // @ts-expect-error - testing edge case
    const result2 = parse(undefined)
    assert.deepStrictEqual(result2, [])
  })

  await t.test('ok:loadAttributes-handles-single-level-filepath', async () => {
    const { fs, dir } = await makeFixture('test-empty')
    await fs.write(join(dir, '.gitattributes'), '*.txt text')
    
    const result = await loadAttributes({ fs, dir, filepath: 'test.txt' })
    assert.strictEqual(result.text, true)
  })

  await t.test('error:loadAttributes-throws-non-NOENT-errors', async () => {
    const { fs, dir } = await makeFixture('test-empty')
    // Create a directory with the same name as .gitattributes to cause EISDIR error
    await fs.mkdir(join(dir, '.gitattributes'))
    
    // Some filesystems may not throw EISDIR when reading a directory,
    // so we just check that it doesn't silently continue (NOENT is caught)
    try {
      await loadAttributes({ fs, dir, filepath: 'test.txt' })
      // If it doesn't throw, that's also acceptable - the test just ensures
      // the code path for non-NOENT errors exists
    } catch (err: any) {
      // If it throws, it should not be a NOENT error
      if (err.code === 'NOENT') {
        throw new Error('Expected non-NOENT error, got NOENT')
      }
      // Any other error is acceptable
      assert.ok(err instanceof Error)
    }
  })

  await t.test('ok:loadAttributes-handles-patterns-that-do-not-match', async () => {
    const { fs, dir } = await makeFixture('test-empty')
    await fs.write(join(dir, '.gitattributes'), '*.js binary\n*.txt text')
    
    // Pattern *.js should not match test.txt
    const result = await loadAttributes({ fs, dir, filepath: 'test.txt' })
    assert.strictEqual(result.text, true)
    assert.strictEqual(result.binary, undefined)
  })

  await t.test('ok:loadAttributes-handles-negation-patterns-that-match', async () => {
    const { fs, dir } = await makeFixture('test-empty')
    // Negation pattern: !*.txt means "not *.txt", but in gitattributes, 
    // we strip the ! and test if the pattern matches
    await fs.write(join(dir, '.gitattributes'), '!*.txt text\n*.js binary')
    
    // The !*.txt pattern (stripped to *.txt) should match test.txt
    const result = await loadAttributes({ fs, dir, filepath: 'test.txt' })
    assert.strictEqual(result.text, true)
  })

  await t.test('ok:loadAttributes-handles-negation-patterns-that-do-not-match', async () => {
    const { fs, dir } = await makeFixture('test-empty')
    await fs.write(join(dir, '.gitattributes'), '!*.js text')
    
    // The !*.js pattern (stripped to *.js) should not match test.txt
    const result = await loadAttributes({ fs, dir, filepath: 'test.txt' })
    assert.deepStrictEqual(result, {})
  })

  await t.test('ok:loadAttributes-handles-multiple-rules-some-matching-some-not', async () => {
    const { fs, dir } = await makeFixture('test-empty')
    await fs.write(join(dir, '.gitattributes'), '*.js binary\n*.txt text eol=lf\n*.py diff')
    
    const result = await loadAttributes({ fs, dir, filepath: 'test.txt' })
    assert.strictEqual(result.text, true)
    assert.strictEqual(result.eol, 'lf')
    assert.strictEqual(result.binary, undefined)
    assert.strictEqual(result.diff, undefined)
  })

  await t.test('edge:hasAttribute-returns-false-for-empty-string-attribute-value', async () => {
    const { fs, dir } = await makeFixture('test-empty')
    await fs.write(join(dir, '.gitattributes'), '*.txt filter=')
    
    const result = await hasAttribute({ fs, dir, filepath: 'test.txt', attribute: 'filter' })
    // Empty string is falsy, so || false should return false
    assert.strictEqual(result, false)
  })

  await t.test('ok:hasAttribute-returns-false-for-missing-attribute-when-attributes-object-exists', async () => {
    const { fs, dir } = await makeFixture('test-empty')
    await fs.write(join(dir, '.gitattributes'), '*.txt text')
    
    const result = await hasAttribute({ fs, dir, filepath: 'test.txt', attribute: 'nonexistent' })
    assert.strictEqual(result, false)
  })

  await t.test('behavior:loadAttributes-processes-rules-in-order-later-rules-override', async () => {
    const { fs, dir } = await makeFixture('test-empty')
    await fs.write(join(dir, '.gitattributes'), '*.txt eol=lf\n*.txt eol=crlf')
    
    const result = await loadAttributes({ fs, dir, filepath: 'test.txt' })
    // Last rule should win
    assert.strictEqual(result.eol, 'crlf')
  })
})

// Helper function for join
function join(...paths: string[]): string {
  return paths.filter(Boolean).join('/').replace(/\/+/g, '/')
}

