import { test } from 'node:test'
import assert from 'node:assert'
import { writeRefsAdResponse } from '@awesome-os/universal-git-src/wire/writeRefsAdResponse.ts'
import { collect } from '@awesome-os/universal-git-src/utils/collect.ts'

test('writeRefsAdResponse', async (t) => {
  await t.test('write refs advertisement with multiple refs and capabilities (plain objects/arrays)', async () => {
    const res = await writeRefsAdResponse({
      capabilities: [
        'multi_ack',
        'thin-pack',
        'side-band',
        'side-band-64k',
        'ofs-delta',
        'shallow',
        'deepen-since',
        'deepen-not',
        'deepen-relative',
        'no-progress',
        'include-tag',
        'multi_ack_detailed',
        'no-done',
      ],
      symrefs: { HEAD: 'refs/heads/master' },
      refs: {
        HEAD: '9ea43b479f5fedc679e3eb37803275d727bf51b7',
        'refs/heads/js2': 'fb74ea1a9b6a9601df18c38d3de751c51f064bf7',
        'refs/heads/js3': '5faa96fe725306e060386975a70e4b6eacb576ed',
        'refs/heads/master': '9ea43b479f5fedc679e3eb37803275d727bf51b7',
        'refs/heads/master2': 'c1751a5447a7b025e5bca507af483dde7b0b956f',
        'refs/heads/master3': 'd85135a47c42c9c906e20c08def2fbceac4c2a4f',
        'refs/heads/master4': '18f4b62440abf61285fbfdcbfd990ab8434ff35c',
        'refs/heads/master5': 'e5c144897b64a44bd1164a0db60738452c9eaf87',
      },
    })
    
    const buffer = Buffer.from(await collect(res))
    const result = buffer.toString('utf8')
    
    // Verify HEAD is first
    assert.ok(result.includes('9ea43b479f5fedc679e3eb37803275d727bf51b7 HEAD'), 'HEAD should be first')
    // Verify capabilities
    assert.ok(result.includes('multi_ack'), 'Should contain multi_ack')
    assert.ok(result.includes('thin-pack'), 'Should contain thin-pack')
    assert.ok(result.includes('symref=HEAD:refs/heads/master'), 'Should contain symref')
    // Verify refs
    assert.ok(result.includes('refs/heads/js2'), 'Should contain refs/heads/js2')
    assert.ok(result.includes('refs/heads/master'), 'Should contain refs/heads/master')
    assert.ok(result.includes('refs/heads/master5'), 'Should contain refs/heads/master5')
  })

  await t.test('write refs advertisement with Map and Set (Map/Set branches)', async () => {
    // Test the Map/Set branches that weren't covered
    const capabilitiesSet = new Set([
      'multi_ack',
      'thin-pack',
      'side-band',
      'ofs-delta',
    ])
    
    const symrefsMap = new Map<string, string>([
      ['HEAD', 'refs/heads/main'],
      ['refs/heads/master', 'refs/heads/main'],
    ])
    
    const refsMap = new Map<string, string>([
      ['HEAD', '9ea43b479f5fedc679e3eb37803275d727bf51b7'],
      ['refs/heads/main', '9ea43b479f5fedc679e3eb37803275d727bf51b7'],
      ['refs/heads/develop', 'fb74ea1a9b6a9601df18c38d3de751c51f064bf7'],
    ])
    
    const res = await writeRefsAdResponse({
      capabilities: capabilitiesSet,
      symrefs: symrefsMap,
      refs: refsMap,
    })
    
    const buffer = Buffer.from(await collect(res))
    const result = buffer.toString('utf8')
    
    // Verify capabilities from Set
    assert.ok(result.includes('multi_ack'), 'Should contain multi_ack')
    assert.ok(result.includes('thin-pack'), 'Should contain thin-pack')
    assert.ok(result.includes('side-band'), 'Should contain side-band')
    
    // Verify symrefs from Map
    assert.ok(result.includes('symref=HEAD:refs/heads/main'), 'Should contain symref from Map')
    assert.ok(result.includes('symref=refs/heads/master:refs/heads/main'), 'Should contain second symref from Map')
    
    // Verify refs from Map
    assert.ok(result.includes('9ea43b479f5fedc679e3eb37803275d727bf51b7 HEAD'), 'Should contain HEAD ref from Map')
    assert.ok(result.includes('refs/heads/main'), 'Should contain refs/heads/main from Map')
    assert.ok(result.includes('refs/heads/develop'), 'Should contain refs/heads/develop from Map')
  })

  await t.test('write refs advertisement with empty collections', async () => {
    // Test edge case: empty collections (brand new repo)
    // When there are no refs, the for loop doesn't execute, so only flush is written
    const res = await writeRefsAdResponse({
      capabilities: [],
      symrefs: {},
      refs: {},
    })
    
    // Should only contain flush packet (no refs means no pkt-lines, just flush)
    assert.ok(Array.isArray(res), 'Should return array of buffers')
    assert.strictEqual(res.length, 1, 'Should only contain flush packet when no refs')
    
    // The flush packet should be the GitPktLine.flush() marker (0000)
    const { GitPktLine } = await import('@awesome-os/universal-git-src/models/GitPktLine.ts')
    const flushMarker = GitPktLine.flush()
    assert.deepStrictEqual(res[0], flushMarker, 'Should contain flush packet')
  })

  await t.test('write refs advertisement with mixed Map/Set and plain objects/arrays', async () => {
    // Test mixed: Set for capabilities, Map for refs, plain object for symrefs
    const capabilitiesSet = new Set(['multi_ack', 'thin-pack'])
    const symrefsPlain = { HEAD: 'refs/heads/main' }
    const refsMap = new Map<string, string>([
      ['HEAD', '9ea43b479f5fedc679e3eb37803275d727bf51b7'],
      ['refs/heads/main', '9ea43b479f5fedc679e3eb37803275d727bf51b7'],
    ])
    
    const res = await writeRefsAdResponse({
      capabilities: capabilitiesSet,
      symrefs: symrefsPlain,
      refs: refsMap,
    })
    
    const buffer = Buffer.from(await collect(res))
    const result = buffer.toString('utf8')
    
    // Verify capabilities from Set
    assert.ok(result.includes('multi_ack'), 'Should contain multi_ack from Set')
    assert.ok(result.includes('thin-pack'), 'Should contain thin-pack from Set')
    
    // Verify symrefs from plain object
    assert.ok(result.includes('symref=HEAD:refs/heads/main'), 'Should contain symref from plain object')
    
    // Verify refs from Map
    assert.ok(result.includes('9ea43b479f5fedc679e3eb37803275d727bf51b7 HEAD'), 'Should contain HEAD ref from Map')
    assert.ok(result.includes('refs/heads/main'), 'Should contain refs/heads/main from Map')
  })
})

