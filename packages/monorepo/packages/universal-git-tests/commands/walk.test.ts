import { describe, it } from 'node:test'
import assert from 'node:assert'
import { walk, WORKDIR, TREE, STAGE, setConfig } from '@awesome-os/universal-git-src/index.ts'
import { makeFixture } from '@awesome-os/universal-git-test-helpers/helpers/fixture.ts'

describe('walk', () => {
  it('ok:can-walk-using-WORKDIR-TREE-and-STAGE', async () => {
    // Setup
    const { fs, dir, gitdir } = await makeFixture('test-walk')
    // Test
    const matrix = await walk({
      fs,
      dir,
      gitdir,
      trees: [WORKDIR(), TREE(), STAGE()],
      map: (filepath, [workdir, tree, stage]) => [
        filepath,
        !!workdir,
        !!tree,
        !!stage,
      ],
    })
    assert.deepStrictEqual(matrix, [
      ['.', true, true, true],
      ['a.txt', true, true, true],
      ['b.txt', true, true, true],
      ['c.txt', false, true, true],
      ['d.txt', true, false, false],
      ['folder', true, true, true],
      ['folder/1.txt', true, true, true],
      ['folder/2.txt', true, false, false],
      ['folder/3.txt', true, false, true],
    ])
  })

  it('ok:can-populate-type-mode-oid-and-content', async () => {
    // Setup
    const { fs, dir, gitdir } = await makeFixture('test-walk')

    // BrowserFS has a design quirk where HTTPRequestFS has a default mode of 555 for everything,
    // meaning that files have the executable bit set by default!
    const isBrowserFS = !!(fs as any)._original_unwrapped_fs?.getRootFS
    const FILEMODE = isBrowserFS ? 0o100755 : 0o100644
    const SYMLINKMODE = isBrowserFS ? 0o100755 : 0o120000

    // Test
    const matrix = await walk({
      fs,
      dir,
      gitdir,
      trees: [WORKDIR(), TREE({ ref: 'HEAD' }), STAGE()],
      map: async (filepath, [workdir, tree, stage]) => [
        filepath,
        workdir && {
          type: await workdir.type(),
          mode: await workdir.mode(),
          oid: await workdir.oid(),
          content:
            (await workdir.content()) &&
            Buffer.from(await workdir.content()).toString('utf8'),
          hasStat: !!(await workdir.stat()),
        },
        tree && {
          type: await tree.type(),
          mode: await tree.mode(),
          oid: await tree.oid(),
          content:
            (await tree.content()) &&
            Buffer.from(await tree.content()).toString('utf8'),
          hasStat: !!(await tree.stat()),
        },
        stage && {
          type: await stage.type(),
          mode: await stage.mode(),
          oid: await stage.oid(),
          content:
            (await stage.content()) &&
            Buffer.from(await stage.content()).toString('utf8'),
          hasStat: !!(await stage.stat()),
        },
      ],
    })
    assert.deepStrictEqual(matrix[0], [
      '.',
      {
        type: 'tree',
        mode: 0o40000,
        content: undefined,
        oid: undefined,
        hasStat: true,
      },
      {
        type: 'tree',
        mode: 0o40000,
        content: undefined,
        oid: '49a23584c8bc3a928250e5fd164131f2eb0f2e4c',
        hasStat: false,
      },
      {
        type: 'tree',
        mode: undefined,
        content: undefined,
        oid: undefined,
        hasStat: false,
      },
    ])
    // Verify a.txt entry
    const aEntry = matrix.find(([path]) => path === 'a.txt')
    assert.ok(aEntry)
    assert.strictEqual(aEntry[1]?.type, 'blob')
    assert.strictEqual(aEntry[1]?.mode, FILEMODE)
    assert.strictEqual(aEntry[1]?.content, 'Hello\n')
    assert.strictEqual(aEntry[1]?.oid, 'e965047ad7c57865823c7d992b1d046ea66edf78')
  })

  it('ok:autocrlf-respected-when-gitconfig-changes', async () => {
    // Setup
    const { fs, dir, gitdir } = await makeFixture('test-walk')
    // BrowserFS has a design quirk where HTTPRequestFS has a default mode of 555 for everything,
    // meaning that files have the executable bit set by default!

    const isBrowserFS = !!(fs as any)._original_unwrapped_fs?.getRootFS
    const FILEMODE = isBrowserFS ? 0o100755 : 0o100644
    const toWalkerResult = async (walker: any) => {
      return {
        type: await walker.type(),
        mode: await walker.mode(),
        oid: await walker.oid(),
        content:
          (await walker.content()) &&
          Buffer.from(await walker.content()).toString('utf8'),
        hasStat: !!(await walker.stat()),
      }
    }

    // Test
    let matrix = await walk({
      fs,
      dir,
      gitdir,
      trees: [WORKDIR(), TREE({ ref: 'HEAD' }), STAGE()],
      map: async (filepath, [workdir, tree, stage]) => [
        filepath,
        workdir && (await toWalkerResult(workdir)),
        tree && (await toWalkerResult(tree)),
        stage && (await toWalkerResult(stage)),
      ],
    })

    const aEntry = matrix.find(([path]) => path === 'a.txt')
    assert.ok(aEntry)
    assert.strictEqual(aEntry[1]?.content, 'Hello\n')

    // Check oid + content updates when changing autocrlf to true
    await setConfig({
      fs,
      gitdir,
      path: 'core.autocrlf',
      value: true,
    })
    await fs.write(dir + '/a.txt', 'Hello\r\nagain', {
      mode: 0o666,
    })

    matrix = await walk({
      fs,
      dir,
      gitdir,
      trees: [WORKDIR(), TREE({ ref: 'HEAD' }), STAGE()],
      map: async (filepath, [workdir, tree, stage]) => [
        filepath,
        workdir && (await toWalkerResult(workdir)),
        tree && (await toWalkerResult(tree)),
        stage && (await toWalkerResult(stage)),
      ],
    })

    // core.autocrlf is true \r\n should be replaced with \n
    const aEntryAfter = matrix.find(([path]) => path === 'a.txt')
    assert.ok(aEntryAfter)
    assert.strictEqual(aEntryAfter[1]?.content, 'Hello\nagain')
    assert.strictEqual(aEntryAfter[1]?.oid, 'e855bd8b67cc7ee321e4dec1b9e5b17e13aec8e1')

    // Check oid + content updates when changing autocrlf back to false
    await setConfig({
      fs,
      gitdir,
      path: 'core.autocrlf',
      value: false,
    })

    matrix = await walk({
      fs,
      dir,
      gitdir,
      trees: [WORKDIR(), TREE({ ref: 'HEAD' }), STAGE()],
      map: async (filepath, [workdir, tree, stage]) => [
        filepath,
        workdir && (await toWalkerResult(workdir)),
        tree && (await toWalkerResult(tree)),
        stage && (await toWalkerResult(stage)),
      ],
    })

    // core.autocrlf is false \r\n should not be replaced with \n
    const aEntryFinal = matrix.find(([path]) => path === 'a.txt')
    assert.ok(aEntryFinal)
    assert.strictEqual(aEntryFinal[1]?.content, 'Hello\r\nagain')
    assert.strictEqual(aEntryFinal[1]?.oid, '8d4f7af538be6af26291dc33eb1fde39b558dbea')
  })
})

