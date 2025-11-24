#! /usr/bin/env node

var fs = require('fs')
var path = require('path')

var superblocktxt = require('@isomorphic-git/lightning-fs/src/superblocktxt.js')

// Use the new fixture location: tests/__fixtures__/
const fixturesPath = path.join(__dirname, '..', 'tests', '__fixtures__')

fs.writeFileSync(
  path.join(fixturesPath, '.superblock.txt'),
  superblocktxt(fixturesPath),
  { encoding: 'utf8' }
)

