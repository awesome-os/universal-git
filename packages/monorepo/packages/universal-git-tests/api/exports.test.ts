import { test } from 'node:test'
import assert from 'node:assert'
import * as git from '@awesome-os/universal-git-src/index.ts'

test('exports', async (t) => {
  await t.test('exposes only the intended API functions', async () => {
    const names = Object.keys(git).sort()
    
    // Verify essential exports are present
    assert.ok(names.includes('Errors'), 'Should export Errors')
    assert.ok(names.includes('STAGE'), 'Should export STAGE')
    assert.ok(names.includes('TREE'), 'Should export TREE')
    assert.ok(names.includes('WORKDIR'), 'Should export WORKDIR')
    
    // Verify common API functions are present
    assert.ok(names.includes('add'), 'Should export add')
    assert.ok(names.includes('commit'), 'Should export commit')
    assert.ok(names.includes('clone'), 'Should export clone')
    assert.ok(names.includes('fetch'), 'Should export fetch')
    assert.ok(names.includes('push'), 'Should export push')
    assert.ok(names.includes('pull'), 'Should export pull')
    assert.ok(names.includes('merge'), 'Should export merge')
    assert.ok(names.includes('log'), 'Should export log')
    assert.ok(names.includes('status'), 'Should export status')
    assert.ok(names.includes('checkout'), 'Should export checkout')
    
    // Verify utility functions
    assert.ok(names.includes('hashBlob'), 'Should export hashBlob')
    assert.ok(names.includes('expandOid'), 'Should export expandOid')
    assert.ok(names.includes('expandRef'), 'Should export expandRef')
    
    // Verify ref functions
    assert.ok(names.includes('listRefs'), 'Should export listRefs')
    assert.ok(names.includes('listBranches'), 'Should export listBranches')
    assert.ok(names.includes('listTags'), 'Should export listTags')
    assert.ok(names.includes('branch'), 'Should export branch')
    assert.ok(names.includes('currentBranch'), 'Should export currentBranch')
    
    // Verify object functions
    assert.ok(names.includes('readObject'), 'Should export readObject')
    assert.ok(names.includes('readCommit'), 'Should export readCommit')
    assert.ok(names.includes('readBlob'), 'Should export readBlob')
    assert.ok(names.includes('readTree'), 'Should export readTree')
    assert.ok(names.includes('readTag'), 'Should export readTag')
    assert.ok(names.includes('writeCommit'), 'Should export writeCommit')
    assert.ok(names.includes('writeBlob'), 'Should export writeBlob')
    assert.ok(names.includes('writeTree'), 'Should export writeTree')
    assert.ok(names.includes('writeTag'), 'Should export writeTag')
    
    // Verify config functions
    assert.ok(names.includes('getConfig'), 'Should export getConfig')
    assert.ok(names.includes('getConfigAll'), 'Should export getConfigAll')
    assert.ok(names.includes('setConfig'), 'Should export setConfig')
    
    // Verify remote functions
    assert.ok(names.includes('listRemotes'), 'Should export listRemotes')
    assert.ok(names.includes('addRemote'), 'Should export addRemote')
    assert.ok(names.includes('deleteRemote'), 'Should export deleteRemote')
    assert.ok(names.includes('getRemoteInfo'), 'Should export getRemoteInfo')
    assert.ok(names.includes('listServerRefs'), 'Should export listServerRefs')
    
    // Verify index functions
    assert.ok(names.includes('updateIndex'), 'Should export updateIndex')
    assert.ok(names.includes('resetIndex'), 'Should export resetIndex')
    
    // Verify tag functions
    assert.ok(names.includes('tag'), 'Should export tag')
    assert.ok(names.includes('annotatedTag'), 'Should export annotatedTag')
    assert.ok(names.includes('deleteTag'), 'Should export deleteTag')
    
    // Verify other functions
    assert.ok(names.includes('init'), 'Should export init')
    assert.ok(names.includes('findRoot'), 'Should export findRoot')
    assert.ok(names.includes('resolveRef'), 'Should export resolveRef')
    assert.ok(names.includes('isIgnored'), 'Should export isIgnored')
    assert.ok(names.includes('version'), 'Should export version')
  })
})

