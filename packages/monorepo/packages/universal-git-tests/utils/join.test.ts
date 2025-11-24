import { test } from 'node:test'
import assert from 'node:assert'
import * as path from 'path/posix'
import { join } from '@awesome-os/universal-git-src/utils/join.ts'

test('join', async (t) => {
  await t.test('ok:matches-path-join', async (t) => {
    // Tests adapted from path-browserify
    const fixtures = [
      ['/foo/bar', 'baz'],
      ['foo/bar', 'baz'],
      ['foo', 'bar', 'baz'],
      ['/', 'foo', 'bar', 'baz'],
      ['.', 'foo'],
      ['foo', '.'],
      ['.', '.'],
      ['.', 'foo', '.'],
      ['.', '.', '.'],
      ['/', '.'],
      ['/', '.git'],
      ['.', '.git'],
      [],
      ['foo/x', './bar'],
      ['foo/x/', './bar'],
      ['foo/x/', '.', 'bar'],
      ['.', '.', '.'],
      ['.', './', '.'],
      ['.', '/./', '.'],
      ['.', '/////./', '.'],
      ['.'],
      ['', '.'],
      ['foo', '/bar'],
      ['foo', ''],
      ['foo', '', '/bar'],
      ['/'],
      ['/', '.'],
      [''],
      ['', ''],
      ['', 'foo'],
      ['', '', 'foo'],
      [' /foo'],
      [' ', 'foo'],
      [' ', '.'],
      [' ', ''],
      ['/', '/foo'],
      ['/', '//foo'],
      ['/', '', '/foo'],
    ]
    for (const fixture of fixtures) {
      const fixtureKey = fixture.length > 0 ? fixture.join('-').replace(/[^a-zA-Z0-9-]/g, '') : 'empty'
      await t.test(`ok:join-${fixtureKey}`, () => {
        assert.strictEqual(join(...fixture), path.join(...fixture))
      })
    }
  })

  await t.test('ok:handles-parent-directory', async (t) => {
    // Test cases that trigger the .. handling code (lines 22-50)
    const fixtures = [
      ['foo', '..'],
      ['foo/bar', '..'],
      ['foo/bar', '../baz'],
      ['foo/bar', '..', 'baz'],
      ['foo', 'bar', '..'],
      ['foo', 'bar', '..', 'baz'],
      ['foo/bar/baz', '../qux'],
      ['foo/bar/baz', '../../qux'],
      ['foo/bar/baz', '../../../qux'],
      ['/', 'foo', '..'],
      ['/', 'foo', 'bar', '..'],
      ['/', 'foo', 'bar', '..', 'baz'],
      ['foo', '..', 'bar'],
      ['foo/bar', '..', 'baz', 'qux'],
      ['a', 'b', '..', 'c'],
      ['a', 'b', 'c', '..', 'd'],
      ['a', 'b', 'c', '..', '..', 'd'],
      ['a', 'b', 'c', '..', '..', '..', 'd'],
      ['..', 'foo'],
      ['..', '..', 'foo'],
      ['..', '..', '..', 'foo'],
      ['foo', '..', '..'],
      ['foo', 'bar', '..', '..'],
      ['foo', 'bar', 'baz', '..', '..', '..'],
      ['/', '..'],
      ['/', '..', 'foo'],
      ['/', '..', '..', 'foo'],
      ['foo/bar', '../..'],
      ['foo/bar/baz', '../..'],
      ['foo/bar/baz', '../../..'],
      // Edge cases for res.length < 2
      ['a', '..'],
      ['ab', '..'],
      // Edge cases for lastSegmentLength !== 2
      ['abc', '..'],
      ['abcd', '..'],
      // Edge cases for res.length > 2
      ['foo/bar', '..'],
      ['foo/bar/baz', '..'],
      ['foo/bar/baz/qux', '..'],
      // Edge cases for res.length !== 0 but <= 2
      ['a', '..', 'b'],
      ['ab', '..', 'c'],
    ]
    for (const fixture of fixtures) {
      await t.test(`"${JSON.stringify(fixture)}" should join to "${path.join(...fixture)}"`, () => {
        assert.strictEqual(join(...fixture), path.join(...fixture))
      })
    }
  })

  await t.test('handles trailing separators correctly', async (t) => {
    // Test cases that trigger trailing separator handling (lines 77-79)
    const fixtures = [
      ['foo/', 'bar'],
      ['foo/', 'bar/'],
      ['foo/', 'bar/', 'baz/'],
      ['foo', 'bar/'],
      ['foo', 'bar/', 'baz/'],
      ['foo/', '.'],
      ['foo/', '..'],
      ['foo/', '../'],
      ['foo/bar/', '..'],
      ['foo/bar/', '../'],
      ['foo/bar/', '../baz/'],
      ['/', '..'],
      ['/', '../'],
      ['', 'foo/'],
      ['', '', 'foo/'],
      ['foo/', ''],
      ['foo/', '', 'bar/'],
      ['foo/', 'bar/', ''],
    ]
    for (const fixture of fixtures) {
      await t.test(`"${JSON.stringify(fixture)}" should join to "${path.join(...fixture)}"`, () => {
        assert.strictEqual(join(...fixture), path.join(...fixture))
      })
    }
  })

  await t.test('handles complex .. patterns with absolute paths', async (t) => {
    // Test cases for absolute paths with .. (aar = false for absolute paths)
    const fixtures = [
      ['/foo', '..'],
      ['/foo', 'bar', '..'],
      ['/foo', 'bar', '..', 'baz'],
      ['/foo/bar', '..'],
      ['/foo/bar', '../baz'],
      ['/foo/bar/baz', '..'],
      ['/foo/bar/baz', '../qux'],
      ['/foo/bar/baz', '../../qux'],
      ['/foo/bar/baz', '../../../qux'],
      ['/foo/bar/baz', '../../..'],
      ['/..'],
      ['/..', 'foo'],
      ['/..', '..', 'foo'],
      ['/foo', '..', 'bar'],
      ['/foo/bar', '..', 'baz'],
      ['/foo/bar/baz', '..', 'qux'],
      ['/a', '..'],
      ['/ab', '..'],
      ['/abc', '..'],
      ['/a', 'b', '..'],
      ['/a', 'b', 'c', '..'],
      ['/a', 'b', 'c', '..', 'd'],
    ]
    for (const fixture of fixtures) {
      await t.test(`"${JSON.stringify(fixture)}" should join to "${path.join(...fixture)}"`, () => {
        assert.strictEqual(join(...fixture), path.join(...fixture))
      })
    }
  })

  await t.test('handles edge cases for .. normalization', async (t) => {
    // Test cases that specifically target the condition checks in lines 22-27
    // These test res.length < 2, lastSegmentLength !== 2, res.at(-1) !== '.', res.at(-2) !== '.'
    const fixtures = [
      // Cases where res.length < 2
      ['a', '..'],
      ['b', '..'],
      // Cases where lastSegmentLength !== 2
      ['abc', '..'],
      ['abcd', '..'],
      ['abcde', '..'],
      // Cases where res.at(-1) !== '.' or res.at(-2) !== '.'
      ['foo', 'bar', '..'],
      ['foo', 'bar', 'baz', '..'],
      ['foo', 'bar', 'baz', 'qux', '..'],
      // Cases where the condition is false (should keep ..)
      ['..', 'foo'],
      ['..', '..', 'foo'],
      ['..', '..', '..', 'foo'],
      // Cases with res.length > 2 that should remove parent
      ['foo/bar', '..'],
      ['foo/bar/baz', '..'],
      ['foo/bar/baz/qux', '..'],
      // Cases with res.length !== 0 but <= 2
      ['a', '..', 'b'],
      ['ab', '..', 'c'],
      // Cases where lastSlashIndex === -1
      ['a', '..'],
      ['b', '..'],
    ]
    for (const fixture of fixtures) {
      await t.test(`"${JSON.stringify(fixture)}" should join to "${path.join(...fixture)}"`, () => {
        assert.strictEqual(join(...fixture), path.join(...fixture))
      })
    }
  })

  await t.test('handles mixed .. and . patterns', async (t) => {
    const fixtures = [
      ['foo', '.', '..'],
      ['foo', '..', '.'],
      ['foo', '.', '..', 'bar'],
      ['foo', '..', '.', 'bar'],
      ['foo', '.', 'bar', '..'],
      ['foo', 'bar', '.', '..'],
      ['foo', 'bar', '..', '.'],
      ['foo', 'bar', '..', '.', 'baz'],
      ['foo', '.', '..', '.', 'bar'],
      ['foo', '..', '.', '..', 'bar'],
      ['foo', '.', 'bar', '..', 'baz'],
      ['foo', 'bar', '.', '..', '.', 'baz'],
    ]
    for (const fixture of fixtures) {
      const fixtureKey = fixture.length > 0 ? fixture.join('-').replace(/[^a-zA-Z0-9-]/g, '') : 'empty'
      await t.test(`ok:join-parent-${fixtureKey}`, () => {
        assert.strictEqual(join(...fixture), path.join(...fixture))
      })
    }
  })
})

