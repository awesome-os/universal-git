export const isPromiseLike = (obj: unknown): obj is PromiseLike<unknown> => {
  return isObject(obj) && isFunction((obj as { then?: unknown }).then) && isFunction((obj as { catch?: unknown }).catch)
}

export const isObject = (obj: unknown): obj is Record<string, unknown> => {
  return obj !== null && typeof obj === 'object'
}

export const isFunction = (obj: unknown): obj is (...args: unknown[]) => unknown => {
  return typeof obj === 'function'
}

