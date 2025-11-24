import { test } from 'node:test'
import assert from 'node:assert'
import { GitConfig } from '@awesome-os/universal-git-src/models/GitConfig.ts'

test('GitConfig', async (t) => {
  await t.test('get value', async (t) => {
    await t.test('simple (foo)', async () => {
      const config = GitConfig.from(`[foo]
      keyaaa = valfoo
      [bar]
      keyaaa = valbar`)
      const a = await config.get('foo.keyaaa')
      assert.strictEqual(a, 'valfoo')
    })

    await t.test('simple (bar)', async () => {
      const config = GitConfig.from(`[foo]
      keyaaa = valfoo
      [bar]
      keyaaa = valbar`)
      const a = await config.get('bar.keyaaa')
      assert.strictEqual(a, 'valbar')
    })

    await t.test('implicit boolean value', async () => {
      const config = GitConfig.from(`[foo]
      keyaaa = valaaa
      keybbb
      keyccc = valccc`)
      const a = await config.get('foo.keybbb')
      assert.strictEqual(a, 'true')
    })

    await t.test('section case insensitive', async () => {
      const config = GitConfig.from(`[Foo]
      keyaaa = valaaa`)
      const a = await config.get('FOO.keyaaa')
      assert.strictEqual(a, 'valaaa')
    })

    await t.test('subsection case sensitive', async () => {
      const config = GitConfig.from(`[Foo "BAR"]
      keyaaa = valaaa`)
      const a = await config.get('Foo.bar.keyaaa')
      assert.strictEqual(a, undefined)
      const b = await config.get('Foo.BAR.keyaaa')
      assert.strictEqual(b, 'valaaa')
    })

    await t.test('variable name insensitive', async () => {
      const config = GitConfig.from(`[foo]
      KeyAaa = valaaa`)
      const a = await config.get('foo.KEYaaa')
      assert.strictEqual(a, 'valaaa')
    })

    await t.test('last (when several)', async () => {
      const config = GitConfig.from(`[foo]
      keyaaa = valaaa
      keybbb = valbbb
      keybbb = valBBB`)
      const a = await config.get('foo.keybbb')
      assert.strictEqual(a, 'valBBB')
    })

    await t.test('multiple', async () => {
      const config = GitConfig.from(`[foo]
      keyaaa = valaaa
      keybbb = valbbb
      keybbb = valBBB`)
      const a = await config.getall('foo.keybbb')
      assert.deepStrictEqual(a, ['valbbb', 'valBBB'])
    })

    await t.test('multiple (case insensitive)', async () => {
      const config = GitConfig.from(`[foo]
      keyaaa = valaaa
      keybbb = valbbb
      KEYBBB = valBBB`)
      const a = await config.getall('foo.keybbb')
      assert.deepStrictEqual(a, ['valbbb', 'valBBB'])
      const b = await config.getall('foo.KEYBBB')
      assert.deepStrictEqual(b, ['valbbb', 'valBBB'])
    })

    await t.test('subsection', async () => {
      const config = GitConfig.from(`[remote "foo"]
      url = https://foo.com/project.git
      [remote "bar"]
      url = https://bar.com/project.git`)
      const a = await config.get('remote.bar.url')
      assert.strictEqual(a, 'https://bar.com/project.git')
    })
  })

  await t.test('handle comments', async (t) => {
    await t.test('lines starting with # or ;', async () => {
      const config = GitConfig.from(`[foo]
      #keyaaa = valaaa
      ;keybbb = valbbb
      keyccc = valccc`)
      const a = await config.get('foo.#keyaaa')
      assert.strictEqual(a, undefined)
      const b = await config.get('foo.;keybbb')
      assert.strictEqual(b, undefined)
    })

    await t.test('variable lines with # or ; at the end (get)', async () => {
      const config = GitConfig.from(`[foo]
      keyaaa = valaaa #comment #aaa
      keybbb = valbbb ;comment ;bbb
      keyccc = valccc`)
      const a = await config.get('foo.keyaaa')
      assert.strictEqual(a, 'valaaa')
      const b = await config.get('foo.keybbb')
      assert.strictEqual(b, 'valbbb')
    })

    await t.test('variable lines with # or ; at the end (set)', async () => {
      const config = GitConfig.from(`[foo]
      keyaaa = valaaa #comment #aaa
      keybbb = valbbb ;comment ;bbb
      keyccc = valccc`)
      await config.set('foo.keyaaa', 'newvalaaa')
      await config.set('foo.keybbb', 'newvalbbb')
      assert.strictEqual(config.toString(), `[foo]
\tkeyaaa = newvalaaa
\tkeybbb = newvalbbb
      keyccc = valccc`)
    })

    await t.test('ignore quoted # or ;', async () => {
      const config = GitConfig.from(`[foo]
      keyaaa = valaaa " #commentaaa"
      keybbb = valbbb " ;commentbbb"
      keyccc = valccc`)
      const a = await config.get('foo.keyaaa')
      assert.strictEqual(a, 'valaaa  #commentaaa')
      const b = await config.get('foo.keybbb')
      assert.strictEqual(b, 'valbbb  ;commentbbb')
    })
  })

  await t.test('handle quotes', async (t) => {
    await t.test('simple', async () => {
      const config = GitConfig.from(`[foo]
      keyaaa = "valaaa"`)
      const a = await config.get('foo.keyaaa')
      assert.strictEqual(a, 'valaaa')
    })

    await t.test('escaped', async () => {
      const config = GitConfig.from(`[foo]
      keyaaa = \\"valaaa`)
      const a = await config.get('foo.keyaaa')
      assert.strictEqual(a, '"valaaa')
    })

    await t.test('multiple', async () => {
      const config = GitConfig.from(`[foo]
      keyaaa = "val" aaa
      keybbb = val "a" a"a"`)
      const a = await config.get('foo.keyaaa')
      assert.strictEqual(a, 'val aaa')
      const b = await config.get('foo.keybbb')
      assert.strictEqual(b, 'val a aa')
    })

    await t.test('odd number of quotes', async () => {
      const config = GitConfig.from(`[foo]
      keyaaa = "val" a "aa`)
      const a = await config.get('foo.keybbb')
      assert.strictEqual(a, undefined)
    })

    await t.test('# in quoted values', async () => {
      const config = GitConfig.from(`[foo]
      keyaaa = "#valaaa"`)
      const a = await config.get('foo.keyaaa')
      assert.strictEqual(a, '#valaaa')
    })

    await t.test('; in quoted values', async () => {
      const config = GitConfig.from(`[foo]
      keyaaa = "val;a;a;a"`)
      const a = await config.get('foo.keyaaa')
      assert.strictEqual(a, 'val;a;a;a')
    })

    await t.test('# after quoted values', async () => {
      const config = GitConfig.from(`[foo]
      keyaaa = "valaaa" # comment`)
      const a = await config.get('foo.keyaaa')
      assert.strictEqual(a, 'valaaa')
    })

    await t.test('; after quoted values', async () => {
      const config = GitConfig.from(`[foo]
      keyaaa = "valaaa" ; comment`)
      const a = await config.get('foo.keyaaa')
      assert.strictEqual(a, 'valaaa')
    })
  })

  await t.test('get cast value', async (t) => {
    await t.test('using schema', async () => {
      const config = GitConfig.from(`[core]
      repositoryformatversion = 0
      filemode = true
      bare = false
      logallrefupdates = true
      symlinks = false
      ignorecase = true
      bigFileThreshold = 2`)
      const a = await config.get('core.repositoryformatversion')
      const b = await config.get('core.filemode')
      const c = await config.get('core.bare')
      const d = await config.get('core.logallrefupdates')
      const e = await config.get('core.symlinks')
      const f = await config.get('core.ignorecase')
      const g = await config.get('core.bigFileThreshold')
      assert.strictEqual(a, '0')
      assert.strictEqual(b, true)
      assert.strictEqual(c, false)
      assert.strictEqual(d, true)
      assert.strictEqual(e, false)
      assert.strictEqual(f, true)
      assert.strictEqual(g, 2)
    })

    await t.test('special boolean', async () => {
      const config = GitConfig.from(`[core]
      filemode = off
      bare = on
      logallrefupdates = no
      symlinks = true`)
      const a = await config.get('core.filemode')
      const b = await config.get('core.bare')
      const c = await config.get('core.logallrefupdates')
      const d = await config.get('core.symlinks')
      assert.strictEqual(a, false)
      assert.strictEqual(b, true)
      assert.strictEqual(c, false)
      assert.strictEqual(d, true)
    })

    await t.test('numeric suffix', async () => {
      const configA = GitConfig.from(`[core]
      bigFileThreshold = 2k`)
      const configB = GitConfig.from(`[core]
      bigFileThreshold = 2m`)
      const configC = GitConfig.from(`[core]
      bigFileThreshold = 2g`)
      const a = await configA.get('core.bigFileThreshold')
      const b = await configB.get('core.bigFileThreshold')
      const c = await configC.get('core.bigFileThreshold')
      assert.strictEqual(a, 2048)
      assert.strictEqual(b, 2097152)
      assert.strictEqual(c, 2147483648)
    })
  })

  await t.test('insert new value', async (t) => {
    await t.test('existing section', async () => {
      const config = GitConfig.from(`[foo]
      keyaaa = valaaa`)
      await config.set('foo.keybbb', 'valbbb')
      assert.strictEqual(config.toString(), `[foo]
\tkeybbb = valbbb
      keyaaa = valaaa`)
    })

    await t.test('existing section (case insensitive)', async () => {
      const config = GitConfig.from(`[foo]
      keyaaa = valaaa`)
      await config.set('FOO.keybbb', 'valbbb')
      assert.strictEqual(config.toString(), `[foo]
\tkeybbb = valbbb
      keyaaa = valaaa`)
    })

    await t.test('existing subsection', async () => {
      const config = GitConfig.from(`[remote "foo"]
      url = https://foo.com/project.git`)
      await config.set('remote.foo.fetch', 'foo')
      assert.strictEqual(config.toString(), `[remote "foo"]
\tfetch = foo
      url = https://foo.com/project.git`)
    })

    await t.test('existing subsection (case insensitive)', async () => {
      const config = GitConfig.from(`[remote "foo"]
      url = https://foo.com/project.git`)
      await config.set('REMOTE.foo.fetch', 'foo')
      assert.strictEqual(config.toString(), `[remote "foo"]
\tfetch = foo
      url = https://foo.com/project.git`)
    })

    await t.test('existing subsection with dots in key', async () => {
      const config = GitConfig.from(`[remote "foo.bar"]
      url = https://foo.com/project.git`)
      await config.set('remote.foo.bar.url', 'https://bar.com/project.git')
      assert.strictEqual(config.toString(), `[remote "foo.bar"]
\turl = https://bar.com/project.git`)
    })

    await t.test('new section', async () => {
      const config = GitConfig.from(`[foo]
      keyaaa = valaaa`)
      await config.set('bar.keyaaa', 'valaaa')
      assert.strictEqual(config.toString(), `[foo]
      keyaaa = valaaa
[bar]
\tkeyaaa = valaaa`)
    })

    await t.test('new subsection', async () => {
      const config = GitConfig.from(`[remote "foo"]
      url = https://foo.com/project.git`)
      await config.set('remote.bar.url', 'https://bar.com/project.git')
      assert.strictEqual(config.toString(), `[remote "foo"]
      url = https://foo.com/project.git
[remote "bar"]
\turl = https://bar.com/project.git`)
    })

    await t.test('new subsection with dots in key', async () => {
      const config = GitConfig.from(`[remote "foo"]
      url = https://foo.com/project.git`)
      await config.set('remote.bar.baz.url', 'https://bar.com/project.git')
      assert.strictEqual(config.toString(), `[remote "foo"]
      url = https://foo.com/project.git
[remote "bar.baz"]
\turl = https://bar.com/project.git`)
    })

    await t.test('new value with #', async () => {
      const config = GitConfig.from(`[remote "foo"]
      url = https://foo.com/project.git`)
      await config.set('remote.foo.bar', 'hello#world')
      assert.strictEqual(config.toString(), `[remote "foo"]
\tbar = "hello#world"
      url = https://foo.com/project.git`)
    })

    await t.test('new value with ;', async () => {
      const config = GitConfig.from(`[remote "foo"]
      url = https://foo.com/project.git`)
      await config.set('remote.foo.bar', 'hello;world')
      assert.strictEqual(config.toString(), `[remote "foo"]
\tbar = "hello;world"
      url = https://foo.com/project.git`)
    })
  })

  await t.test('replace value', async (t) => {
    await t.test('simple', async () => {
      const config = GitConfig.from(`[foo]
      keyaaa = valfoo
      [bar]
      keyaaa = valbar
      keybbb = valbbb`)
      await config.set('bar.keyaaa', 'newvalbar')
      assert.strictEqual(config.toString(), `[foo]
      keyaaa = valfoo
      [bar]
\tkeyaaa = newvalbar
      keybbb = valbbb`)
    })

    await t.test('simple (case insensitive)', async () => {
      const config = GitConfig.from(`[foo]
      keyaaa = valfoo
      [bar]
      keyaaa = valbar
      keybbb = valbbb`)
      await config.set('BAR.keyaaa', 'newvalbar')
      assert.strictEqual(config.toString(), `[foo]
      keyaaa = valfoo
      [bar]
\tkeyaaa = newvalbar
      keybbb = valbbb`)
    })

    await t.test('simple (case sensitive key)', async () => {
      const config = GitConfig.from(`[foo]
      keyaaa = valfoo
      [bar]
      keyaaa = valbar
      keybbb = valbbb`)
      await config.set('BAR.KEYAAA', 'newvalbar')
      assert.strictEqual(config.toString(), `[foo]
      keyaaa = valfoo
      [bar]
\tKEYAAA = newvalbar
      keybbb = valbbb`)
    })

    await t.test('last (when several)', async () => {
      const config = GitConfig.from(`[foo]
      keyaaa = valaaa
      keybbb = valbbb
      keybbb = valBBB`)
      await config.set('foo.keybbb', 'newvalBBB')
      assert.strictEqual(config.toString(), `[foo]
      keyaaa = valaaa
      keybbb = valbbb
\tkeybbb = newvalBBB`)
    })

    await t.test('subsection', async () => {
      const config = GitConfig.from(`[remote "foo"]
      url = https://foo.com/project.git
      [remote "bar"]
      url = https://bar.com/project.git`)
      await config.set('remote.foo.url', 'https://foo.com/project-foo.git')
      assert.strictEqual(config.toString(), `[remote "foo"]
\turl = https://foo.com/project-foo.git
      [remote "bar"]
      url = https://bar.com/project.git`)
    })
  })

  await t.test('append a value to existing key', async (t) => {
    await t.test('simple', async () => {
      const config = GitConfig.from(`[foo]
      keyaaa = valfoo
      [bar]
      keyaaa = valbar
      keybbb = valbbb`)
      await config.append('bar.keyaaa', 'newvalbar')
      assert.strictEqual(config.toString(), `[foo]
      keyaaa = valfoo
      [bar]
      keyaaa = valbar
\tkeyaaa = newvalbar
      keybbb = valbbb`)
    })

    await t.test('simple (case insensitive)', async () => {
      const config = GitConfig.from(`[foo]
      keyaaa = valfoo
      [bar]
      keyaaa = valbar
      keybbb = valbbb`)
      await config.append('bar.KEYAAA', 'newvalbar')
      assert.strictEqual(config.toString(), `[foo]
      keyaaa = valfoo
      [bar]
      keyaaa = valbar
\tKEYAAA = newvalbar
      keybbb = valbbb`)
    })

    await t.test('subsection', async () => {
      const config = GitConfig.from(`[remote "foo"]
      url = https://foo.com/project.git
      [remote "bar"]
      url = https://bar.com/project.git`)
      await config.append('remote.baz.url', 'https://baz.com/project.git')
      assert.strictEqual(config.toString(), `[remote "foo"]
      url = https://foo.com/project.git
      [remote "bar"]
      url = https://bar.com/project.git
[remote "baz"]
\turl = https://baz.com/project.git`)
    })
  })

  await t.test('remove value', async (t) => {
    await t.test('simple', async () => {
      const config = GitConfig.from(`[foo]
      keyaaa = valaaa
      keybbb = valbbb`)
      await config.set('foo.keyaaa', undefined)
      assert.strictEqual(config.toString(), `[foo]
      keybbb = valbbb`)
    })

    await t.test('simple (case insensitive)', async () => {
      const config = GitConfig.from(`[foo]
      keyaaa = valaaa
      keybbb = valbbb`)
      await config.set('FOO.keyaaa', undefined)
      assert.strictEqual(config.toString(), `[foo]
      keybbb = valbbb`)
    })

    await t.test('last (when several)', async () => {
      const config = GitConfig.from(`[foo]
      keyaaa = valone
      keyaaa = valtwo`)
      await config.set('foo.keyaaa', undefined)
      assert.strictEqual(config.toString(), `[foo]
      keyaaa = valone`)
    })

    await t.test('subsection', async () => {
      const config = GitConfig.from(`[remote "foo"]
      url = https://foo.com/project.git
      [remote "bar"]
      url = https://bar.com/project.git`)
      await config.set('remote.foo.url', undefined)
      assert.strictEqual(config.toString(), `[remote "foo"]
      [remote "bar"]
      url = https://bar.com/project.git`)
    })
  })

  await t.test('handle errors', async (t) => {
    await t.test('get unknown key', async () => {
      const config = GitConfig.from(`[foo]
      keyaaa = valaaa
      keybbb = valbbb`)
      const a = await config.get('foo.unknown')
      assert.strictEqual(a, undefined)
    })

    await t.test('get unknown section', async () => {
      const config = GitConfig.from(`[foo]
      keyaaa = valaaa
      keybbb = valbbb`)
      const a = await config.get('bar.keyaaa')
      assert.strictEqual(a, undefined)
    })

    await t.test('get unknown subsection', async () => {
      const config = GitConfig.from(`[remote "foo"]
      url = https://foo.com/project.git
      [remote "bar"]
      url = https://bar.com/project.git`)
      const a = await config.get('remote.unknown.url')
      assert.strictEqual(a, undefined)
    })

    await t.test('section is only alphanum _ and . (get)', async () => {
      const config = GitConfig.from(`[fo o]
      keyaaa = valaaa
      [ba~r]
      keyaaa = valaaa
      [ba?z]
      keyaaa = valaaa`)
      const a = await config.get('fo o.keyaaa')
      assert.strictEqual(a, undefined)
      const b = await config.get('ba~r.keyaaa')
      assert.strictEqual(b, undefined)
      const c = await config.get('ba?z.keyaaa')
      assert.strictEqual(c, undefined)
    })

    await t.test('section is only alphanum _ and . (set)', async () => {
      const config = GitConfig.from(`[foo]
      keyaaa = valfoo`)
      await config.set('ba?r.keyaaa', 'valbar')
      assert.strictEqual(config.toString(), `[foo]
      keyaaa = valfoo`)
    })

    await t.test('variable name is only alphanum _ (get)', async () => {
      const config = GitConfig.from(`[foo]
      key aaa = valaaa
      key?bbb = valbbb
      key%ccc = valccc
      key.ddd = valddd`)
      const a = await config.get('foo.key aaa')
      assert.strictEqual(a, undefined)
      const b = await config.get('foo.key?bbb')
      assert.strictEqual(b, undefined)
      const c = await config.get('foo.key%ccc')
      assert.strictEqual(c, undefined)
      const d = await config.get('foo.key.ddd')
      assert.strictEqual(d, undefined)
    })

    await t.test('variable name is only alphanum _ (set)', async () => {
      const config = GitConfig.from(`[foo]
      keyaaa = valaaa`)
      await config.set('foo.key bbb', 'valbbb')
      await config.set('foo.key?ccc', 'valccc')
      await config.set('foo.key%ddd', 'valddd')
      assert.strictEqual(config.toString(), `[foo]
      keyaaa = valaaa`)
    })
  })

  await t.test('get subsections', async (t) => {
    await t.test('simple', async () => {
      const config = GitConfig.from(`[one]
      keyaaa = valaaa
          
      [remote "foo"]
      url = https://foo.com/project.git

      [remote "bar"]
      url = https://bar.com/project.git
            
      [two]
      keyaaa = valaaa`)
      const subsections = await config.getSubsections('remote')
      assert.deepStrictEqual(subsections, ['foo', 'bar'])
    })
  })

  await t.test('delete section', async (t) => {
    await t.test('simple', async () => {
      const config = GitConfig.from(`[one]
      keyaaa = valaaa
[two]
      keybbb = valbbb`)
      await config.deleteSection('one')
      assert.strictEqual(config.toString(), `[two]
      keybbb = valbbb`)
    })

    await t.test('subsection', async () => {
      const config = GitConfig.from(`[one]
      keyaaa = valaaa
      
      [remote "foo"]
      url = https://foo.com/project.git
      ; this is a comment
      
      [remote "bar"]
      url = https://bar.com/project.git`)
      await config.deleteSection('remote', 'foo')
      assert.strictEqual(config.toString(), `[one]
      keyaaa = valaaa
      
      [remote "bar"]
      url = https://bar.com/project.git`)
    })
  })
})
