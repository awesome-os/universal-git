const deepget = <K, V>(keys: K[], map: Map<K, Map<K, V> | V>): Map<K, V> => {
  for (const key of keys) {
    if (!map.has(key)) map.set(key, new Map() as Map<K, V>)
    map = map.get(key) as Map<K, V>
  }
  return map as Map<K, V>
}

export class DeepMap<K, V> {
  private _root: Map<K, Map<K, V> | V>

  constructor() {
    this._root = new Map()
  }

  set(keys: K[], value: V): void {
    const keysCopy = [...keys]
    const lastKey = keysCopy.pop()!
    const lastMap = deepget(keysCopy, this._root)
    lastMap.set(lastKey, value)
  }

  get(keys: K[]): V | undefined {
    const keysCopy = [...keys]
    const lastKey = keysCopy.pop()!
    const lastMap = deepget(keysCopy, this._root)
    return lastMap.get(lastKey) as V | undefined
  }

  has(keys: K[]): boolean {
    const keysCopy = [...keys]
    const lastKey = keysCopy.pop()!
    const lastMap = deepget(keysCopy, this._root)
    return lastMap.has(lastKey)
  }
}

