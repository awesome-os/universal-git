import { test } from 'node:test'
import assert from 'node:assert'
import { 
  extendStat, 
  isExtendedStat, 
  statIsDirectory, 
  statIsFile, 
  statIsSymbolicLink,
  type ExtendedStat 
} from '@awesome-os/universal-git-src/utils/statHelpers.ts'
import type { Stat } from '@awesome-os/universal-git-src/models/FileSystem.ts'

test('isExtendedStat', async (t) => {
  await t.test('ok:returns-true-for-ExtendedStat', () => {
    const stat: ExtendedStat = {
      mode: 0o100644,
      size: 1024,
      ctimeSeconds: 1234567890,
      ctimeNanoseconds: 0,
      mtimeSeconds: 1234567890,
      mtimeNanoseconds: 0,
      dev: 0,
      ino: 0,
      uid: 0,
      gid: 0,
      isDirectory: () => false,
      isFile: () => true,
      isSymbolicLink: () => false,
      isBlockDevice: () => false,
      isCharacterDevice: () => false,
      isFIFO: () => false,
      isSocket: () => false,
    }
    
    assert.strictEqual(isExtendedStat(stat), true)
  })

  await t.test('ok:returns-false-for-regular-Stat', () => {
    const stat: Stat = {
      mode: 0o100644,
      size: 1024,
      ctimeSeconds: 1234567890,
      ctimeNanoseconds: 0,
      mtimeSeconds: 1234567890,
      mtimeNanoseconds: 0,
      dev: 0,
      ino: 0,
      uid: 0,
      gid: 0,
    }
    
    assert.strictEqual(isExtendedStat(stat), false)
  })
})

test('extendStat', async (t) => {
  await t.test('ok:returns-ExtendedStat-if-already-extended', () => {
    const stat: ExtendedStat = {
      mode: 0o100644,
      size: 1024,
      ctimeSeconds: 1234567890,
      ctimeNanoseconds: 0,
      mtimeSeconds: 1234567890,
      mtimeNanoseconds: 0,
      dev: 0,
      ino: 0,
      uid: 0,
      gid: 0,
      isDirectory: () => false,
      isFile: () => true,
      isSymbolicLink: () => false,
      isBlockDevice: () => false,
      isCharacterDevice: () => false,
      isFIFO: () => false,
      isSocket: () => false,
    }
    
    const result = extendStat(stat)
    assert.strictEqual(result, stat) // Should return same object
  })

  await t.test('ok:creates-ExtendedStat-from-regular-Stat', () => {
    const stat: Stat = {
      mode: 0o100644,
      size: 1024,
      ctimeSeconds: 1234567890,
      ctimeNanoseconds: 0,
      mtimeSeconds: 1234567890,
      mtimeNanoseconds: 0,
      dev: 0,
      ino: 0,
      uid: 0,
      gid: 0,
    }
    
    const extended = extendStat(stat)
    
    assert.ok(isExtendedStat(extended))
    assert.strictEqual(typeof extended.isDirectory, 'function')
    assert.strictEqual(typeof extended.isFile, 'function')
    assert.strictEqual(typeof extended.isSymbolicLink, 'function')
    assert.strictEqual(typeof extended.isBlockDevice, 'function')
    assert.strictEqual(typeof extended.isCharacterDevice, 'function')
    assert.strictEqual(typeof extended.isFIFO, 'function')
    assert.strictEqual(typeof extended.isSocket, 'function')
  })

  await t.test('ok:isDirectory-directory-mode', () => {
    const stat: Stat = {
      mode: 0o040755, // Directory
      size: 0,
      ctimeSeconds: 1234567890,
      ctimeNanoseconds: 0,
      mtimeSeconds: 1234567890,
      mtimeNanoseconds: 0,
      dev: 0,
      ino: 0,
      uid: 0,
      gid: 0,
    }
    
    const extended = extendStat(stat)
    assert.strictEqual(extended.isDirectory(), true)
    assert.strictEqual(extended.isFile(), false)
  })

  await t.test('ok:isFile-regular-file-mode', () => {
    const stat: Stat = {
      mode: 0o100644, // Regular file
      size: 1024,
      ctimeSeconds: 1234567890,
      ctimeNanoseconds: 0,
      mtimeSeconds: 1234567890,
      mtimeNanoseconds: 0,
      dev: 0,
      ino: 0,
      uid: 0,
      gid: 0,
    }
    
    const extended = extendStat(stat)
    assert.strictEqual(extended.isFile(), true)
    assert.strictEqual(extended.isDirectory(), false)
  })

  await t.test('ok:isSymbolicLink-symlink-mode', () => {
    const stat: Stat = {
      mode: 0o120000, // Symbolic link
      size: 0,
      ctimeSeconds: 1234567890,
      ctimeNanoseconds: 0,
      mtimeSeconds: 1234567890,
      mtimeNanoseconds: 0,
      dev: 0,
      ino: 0,
      uid: 0,
      gid: 0,
    }
    
    const extended = extendStat(stat)
    assert.strictEqual(extended.isSymbolicLink(), true)
    assert.strictEqual(extended.isFile(), false)
    assert.strictEqual(extended.isDirectory(), false)
  })

  await t.test('ok:isBlockDevice-block-device-mode', () => {
    const stat: Stat = {
      mode: 0o060644, // Block device
      size: 0,
      ctimeSeconds: 1234567890,
      ctimeNanoseconds: 0,
      mtimeSeconds: 1234567890,
      mtimeNanoseconds: 0,
      dev: 0,
      ino: 0,
      uid: 0,
      gid: 0,
    }
    
    const extended = extendStat(stat)
    assert.strictEqual(extended.isBlockDevice(), true)
    assert.strictEqual(extended.isFile(), false)
    assert.strictEqual(extended.isDirectory(), false)
  })

  await t.test('ok:isCharacterDevice-character-device-mode', () => {
    const stat: Stat = {
      mode: 0o020644, // Character device
      size: 0,
      ctimeSeconds: 1234567890,
      ctimeNanoseconds: 0,
      mtimeSeconds: 1234567890,
      mtimeNanoseconds: 0,
      dev: 0,
      ino: 0,
      uid: 0,
      gid: 0,
    }
    
    const extended = extendStat(stat)
    assert.strictEqual(extended.isCharacterDevice(), true)
    assert.strictEqual(extended.isFile(), false)
    assert.strictEqual(extended.isDirectory(), false)
  })

  await t.test('ok:isFIFO-FIFO-mode', () => {
    const stat: Stat = {
      mode: 0o010644, // FIFO (named pipe)
      size: 0,
      ctimeSeconds: 1234567890,
      ctimeNanoseconds: 0,
      mtimeSeconds: 1234567890,
      mtimeNanoseconds: 0,
      dev: 0,
      ino: 0,
      uid: 0,
      gid: 0,
    }
    
    const extended = extendStat(stat)
    assert.strictEqual(extended.isFIFO(), true)
    assert.strictEqual(extended.isFile(), false)
    assert.strictEqual(extended.isDirectory(), false)
  })

  await t.test('ok:isSocket-socket-mode', () => {
    const stat: Stat = {
      mode: 0o140644, // Socket
      size: 0,
      ctimeSeconds: 1234567890,
      ctimeNanoseconds: 0,
      mtimeSeconds: 1234567890,
      mtimeNanoseconds: 0,
      dev: 0,
      ino: 0,
      uid: 0,
      gid: 0,
    }
    
    const extended = extendStat(stat)
    assert.strictEqual(extended.isSocket(), true)
    assert.strictEqual(extended.isFile(), false)
    assert.strictEqual(extended.isDirectory(), false)
  })

  await t.test('ok:preserves-original-stat-properties', () => {
    const stat: Stat = {
      mode: 0o100644,
      size: 1024,
      ctimeSeconds: 1234567890,
      ctimeNanoseconds: 123456,
      mtimeSeconds: 987654321,
      mtimeNanoseconds: 987654,
      dev: 1,
      ino: 2,
      uid: 1000,
      gid: 2000,
    }
    
    const extended = extendStat(stat)
    
    assert.strictEqual(extended.mode, stat.mode)
    assert.strictEqual(extended.size, stat.size)
    assert.strictEqual(extended.ctimeSeconds, stat.ctimeSeconds)
    assert.strictEqual(extended.ctimeNanoseconds, stat.ctimeNanoseconds)
    assert.strictEqual(extended.mtimeSeconds, stat.mtimeSeconds)
    assert.strictEqual(extended.mtimeNanoseconds, stat.mtimeNanoseconds)
    assert.strictEqual(extended.dev, stat.dev)
    assert.strictEqual(extended.ino, stat.ino)
    assert.strictEqual(extended.uid, stat.uid)
    assert.strictEqual(extended.gid, stat.gid)
  })
})

test('statIsDirectory', async (t) => {
  await t.test('ok:statIsDirectory-ExtendedStat', () => {
    const stat: ExtendedStat = {
      mode: 0o040755,
      size: 0,
      ctimeSeconds: 1234567890,
      ctimeNanoseconds: 0,
      mtimeSeconds: 1234567890,
      mtimeNanoseconds: 0,
      dev: 0,
      ino: 0,
      uid: 0,
      gid: 0,
      isDirectory: () => true,
      isFile: () => false,
      isSymbolicLink: () => false,
      isBlockDevice: () => false,
      isCharacterDevice: () => false,
      isFIFO: () => false,
      isSocket: () => false,
    }
    
    assert.strictEqual(statIsDirectory(stat), true)
  })

  await t.test('ok:statIsDirectory-regular-Stat', () => {
    const stat: Stat = {
      mode: 0o040755, // Directory
      size: 0,
      ctimeSeconds: 1234567890,
      ctimeNanoseconds: 0,
      mtimeSeconds: 1234567890,
      mtimeNanoseconds: 0,
      dev: 0,
      ino: 0,
      uid: 0,
      gid: 0,
    }
    
    assert.strictEqual(statIsDirectory(stat), true)
  })

  await t.test('returns false for regular Stat file', () => {
    const stat: Stat = {
      mode: 0o100644, // Regular file
      size: 1024,
      ctimeSeconds: 1234567890,
      ctimeNanoseconds: 0,
      mtimeSeconds: 1234567890,
      mtimeNanoseconds: 0,
      dev: 0,
      ino: 0,
      uid: 0,
      gid: 0,
    }
    
    assert.strictEqual(statIsDirectory(stat), false)
  })
})

test('statIsFile', async (t) => {
  await t.test('ok:statIsFile-ExtendedStat', () => {
    const stat: ExtendedStat = {
      mode: 0o100644,
      size: 1024,
      ctimeSeconds: 1234567890,
      ctimeNanoseconds: 0,
      mtimeSeconds: 1234567890,
      mtimeNanoseconds: 0,
      dev: 0,
      ino: 0,
      uid: 0,
      gid: 0,
      isDirectory: () => false,
      isFile: () => true,
      isSymbolicLink: () => false,
      isBlockDevice: () => false,
      isCharacterDevice: () => false,
      isFIFO: () => false,
      isSocket: () => false,
    }
    
    assert.strictEqual(statIsFile(stat), true)
  })

  await t.test('ok:statIsFile-regular-Stat', () => {
    const stat: Stat = {
      mode: 0o100644, // Regular file
      size: 1024,
      ctimeSeconds: 1234567890,
      ctimeNanoseconds: 0,
      mtimeSeconds: 1234567890,
      mtimeNanoseconds: 0,
      dev: 0,
      ino: 0,
      uid: 0,
      gid: 0,
    }
    
    assert.strictEqual(statIsFile(stat), true)
  })

  await t.test('ok:statIsFile-false-for-directory', () => {
    const stat: Stat = {
      mode: 0o040755, // Directory
      size: 0,
      ctimeSeconds: 1234567890,
      ctimeNanoseconds: 0,
      mtimeSeconds: 1234567890,
      mtimeNanoseconds: 0,
      dev: 0,
      ino: 0,
      uid: 0,
      gid: 0,
    }
    
    assert.strictEqual(statIsFile(stat), false)
  })
})

test('statIsSymbolicLink', async (t) => {
  await t.test('ok:statIsSymbolicLink-ExtendedStat', () => {
    const stat: ExtendedStat = {
      mode: 0o120000,
      size: 0,
      ctimeSeconds: 1234567890,
      ctimeNanoseconds: 0,
      mtimeSeconds: 1234567890,
      mtimeNanoseconds: 0,
      dev: 0,
      ino: 0,
      uid: 0,
      gid: 0,
      isDirectory: () => false,
      isFile: () => false,
      isSymbolicLink: () => true,
      isBlockDevice: () => false,
      isCharacterDevice: () => false,
      isFIFO: () => false,
      isSocket: () => false,
    }
    
    assert.strictEqual(statIsSymbolicLink(stat), true)
  })

  await t.test('ok:statIsSymbolicLink-regular-Stat', () => {
    const stat: Stat = {
      mode: 0o120000, // Symbolic link
      size: 0,
      ctimeSeconds: 1234567890,
      ctimeNanoseconds: 0,
      mtimeSeconds: 1234567890,
      mtimeNanoseconds: 0,
      dev: 0,
      ino: 0,
      uid: 0,
      gid: 0,
    }
    
    assert.strictEqual(statIsSymbolicLink(stat), true)
  })

  await t.test('ok:statIsSymbolicLink-false-for-file', () => {
    const stat: Stat = {
      mode: 0o100644, // Regular file
      size: 1024,
      ctimeSeconds: 1234567890,
      ctimeNanoseconds: 0,
      mtimeSeconds: 1234567890,
      mtimeNanoseconds: 0,
      dev: 0,
      ino: 0,
      uid: 0,
      gid: 0,
    }
    
    assert.strictEqual(statIsSymbolicLink(stat), false)
  })
})

