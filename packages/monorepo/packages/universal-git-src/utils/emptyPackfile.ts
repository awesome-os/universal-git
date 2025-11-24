import { UniversalBuffer } from './UniversalBuffer.ts'

// TODO: make a function that just returns obCount. then emptyPackfile = () => sizePack(pack) === 0
export function emptyPackfile(pack: UniversalBuffer | Uint8Array): boolean {
  const pheader = '5041434b'
  const version = '00000002'
  const obCount = '00000000'
  const header = pheader + version + obCount
  const packBuffer = UniversalBuffer.isBuffer(pack) ? pack : UniversalBuffer.from(pack)
  return packBuffer.slice(0, 12).toString('hex') === header
}

