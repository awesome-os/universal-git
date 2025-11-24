#! /usr/bin/env node

// DEPRECATED: This script is no longer needed - lightning-fs replaced with WorktreeBackend
// superblock.txt generation was specific to lightning-fs HTTP backend functionality

var fs = require('fs')
var path = require('path')

// var superblocktxt = require('@isomorphic-git/lightning-fs/src/superblocktxt.js')

// Use the new fixture location: tests/__fixtures__/
const fixturesPath = path.join(__dirname, '..', 'tests', '__fixtures__')

// DEPRECATED: superblock.txt generation removed - lightning-fs replaced with WorktreeBackend
// fs.writeFileSync(
//   path.join(fixturesPath, '.superblock.txt'),
//   superblocktxt(fixturesPath),
//   { encoding: 'utf8' }
// )

