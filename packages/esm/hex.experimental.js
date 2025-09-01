// A larger lookup table using character codes as indices.
// 'f'.charCodeAt(0) is 102. 'F' is 70. We'll make it size 103.
const hexCodeToValue = new Int8Array(103).fill(-1);

for (let i = 0; i <= 9; i++)  hexCodeToValue[i + 48] = i; // '0'..'9'
for (let i = 10; i <= 15; i++) hexCodeToValue[i + 87] = i; // 'a'..'f'
for (let i = 10; i <= 15; i++) hexCodeToValue[i + 55] = i; // 'A'..'F'
/**
 * OPTIMIZED VERSION 1: Uses a character code lookup table.
 * still handles wrong length not needed for git.
 */
export function hexToBytes(hexString) {
  const bytes = new Uint8Array(Math.ceil(hexString.length / 2));
  let byteIndex = 0;
  let i = 0;

  while (i < hexString.length) {
    const highCode = hexString.charCodeAt(i);
    const highVal = hexCodeToValue[highCode]; // Faster lookup
    i++;

    if (highVal === -1) { // Check against our sentinel value
      continue;
    }
    
    let lowVal = 0;
   
    while (i < hexString.length) {
      const lowCode = hexString.charCodeAt(i);
      const val = hexCodeToValue[lowCode]; // Faster lookup
      i++;
      if (val !== -1) {
        lowVal = val;
        break;
      }
    }
    
    bytes[byteIndex] = (highVal << 4) | lowVal;
    byteIndex++;
  }

  return byteIndex === bytes.length ? bytes : bytes.slice(0, byteIndex);
}

/**
 * Converts a Uint8Array to a hexadecimal string.
 * This is the modern, cross-platform equivalent of Buffer.toString('hex').
 * @param {Uint8Array} bytes The Uint8Array to convert.
 * @returns {string} The hexadecimal string.
 */
export function bytesToHexSlow(bytes) {
  // Create a new array of strings, one for each byte.
  const hexBytes = [];
  for (let i = 0; i < bytes.length; ++i) {
    // Convert the byte to a 2-digit hex string and pad with a zero if needed.
    const hex = bytes[i].toString(16).padStart(2, '0');
    hexBytes.push(hex);
  }
  // Join all the hex strings into a single string.
  return hexBytes.join('');
}

/**
 * OPTIMIZED VERSION 2: A specialized function for clean, even-length hex strings.
 * This is the fastest possible pure JS implementation. Ideal for git as we do handle fixed size
 */
export function hexToBytes_FAST_CLEAN(hexString) {
  const bytes = new Uint8Array(hexString.length / 2);
  for (let i = 0, byteIndex = 0; i < hexString.length; i += 2, byteIndex++) {
    const highCode = hexString.charCodeAt(i);
    const lowCode = hexString.charCodeAt(i + 1);
    
    const highVal = hexCodeToValue[highCode];
    const lowVal = hexCodeToValue[lowCode];
    
    bytes[byteIndex] = (highVal << 4) | lowVal;
  }
  return bytes;
}


// Pre-compute the lookup table for decoding.
// This is a one-time cost when the module is loaded.
export const hexCharToValue = {
  '0': 0, '1': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
  'a': 10, 'b': 11, 'c': 12, 'd': 13, 'e': 14, 'f': 15,
  'A': 10, 'B': 11, 'C': 12, 'D': 13, 'E': 14, 'F': 15
};

/**
 * A highly optimized function to convert a hexadecimal string to a Uint8Array.
 * Designed for performance-critical tasks like processing Git object hashes.
 * @param {string} hexString The hexadecimal string to convert.
 * @returns {Uint8Array} A Uint8Array containing the decoded bytes.
 */
export function hexToBytes(hexString) {
  const bytes = new Uint8Array(Math.ceil(hexString.length / 2));
  let byteIndex = 0;
  let i = 0;

  // Loop through the string to find pairs of valid hex characters.
  while (i < hexString.length) {
    const highChar = hexString[i];
    const highVal = hexCharToValue[highChar];
    i++;

    // If the character is not a valid hex char, skip it.
    if (highVal === undefined) {
      continue;
    }
    
    let lowVal = 0; // Default to 0 for odd-length strings' final character.
   
    // Find the next valid hex character for the low nibble.
    while (i < hexString.length) {
      const lowChar = hexString[i];
      lowVal = hexCharToValue[lowChar];
      i++;
      if (lowVal !== undefined) {
        break;
      }
    }
    
    // Combine the high and low nibbles into a single byte.
    bytes[byteIndex] = (highVal << 4) | lowVal;
    byteIndex++;
  }

  // If we allocated too much space due to invalid chars, return a slice.
  return byteIndex === bytes.length ? bytes : bytes.slice(0, byteIndex);
}