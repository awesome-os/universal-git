/**
 * A mapping from zlib status codes to human-readable error messages.
 * Based on the standard zlib constants (e.g., Z_OK, Z_STREAM_END).
 */
export const ZLIB_MESSAGES = {
  2: 'need dictionary',
  1: 'stream end',
  0: '', // Z_OK is not an error, so the message is empty.
  '-1': 'file error',
  '-2': 'stream error',
  '-3': 'data error',
  '-4': 'insufficient memory',
  '-5': 'UInt8Array error',
  '-6': 'incompatible version',
};
