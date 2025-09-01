// Deprecated: is now part of the Buffer Pollyfill.


/**
 * Reads a 32-bit unsigned integer in Big-Endian format from a Uint8Array at a specified offset.
 * Mimics Buffer.prototype.readUInt32BE behavior.
 *
 * @param {Uint8Array} uint8Array The Uint8Array to read from.
 * @param {number} offset The byte offset at which to begin reading.
 * @returns {number} The 32-bit unsigned integer.
 * @throws {RangeError} If the offset is out of bounds for a 4-byte read.
 */
function readUInt32BE(uint8Array: Uint8Array, offset: number = 0): number {
  if (offset < 0 || offset + 4 > uint8Array.length) {
    throw new RangeError(`Offset ${offset} is out of bounds for 4-byte read in a Uint8Array of length ${uint8Array.length}`);
  }

  // Create a DataView on the underlying ArrayBuffer
  // The second argument to DataView constructor is `byteOffset` within the ArrayBuffer,
  // and the third is `byteLength`. We make a view of just the 4 bytes needed.
  const dataView = new DataView(
    uint8Array.buffer,
    uint8Array.byteOffset + offset, // Account for the Uint8Array's own offset
    4 // Read 4 bytes
  );

  // Use DataView's getUint32 method (true for big-endian)
  return dataView.getUint32(0, false); // `false` indicates Big-Endian (BE)
}

// // Example Usage:
// const data = new Uint8Array([0x00, 0x00, 0x01, 0xFF, 0xAA, 0xBB, 0xCC, 0xDD]);

// const val1 = readUInt32BE(data, 0); // Reads [0x00, 0x00, 0x01, 0xFF] -> 511
// console.log(val1); // Output: 511

// const val2 = readUInt32BE(data, 4); // Reads [0xAA, 0xBB, 0xCC, 0xDD] -> 2862677213
// console.log(val2); // Output: 2862677213

// try {
//   readUInt32BE(data, 6); // This will throw RangeError
// } catch (e) {
//   console.error(e.message); // Output: Offset 6 is out of bounds...
// }

// How it compares to Buffer (if Node.js Buffer were available)
// const nodeBuffer = Buffer.from([0x00, 0x00, 0x01, 0xFF, 0xAA, 0xBB, 0xCC, 0xDD]);
// console.log(nodeBuffer.readUInt32BE(0)); // 511
// console.log(nodeBuffer.readUInt32BE(4)); // 2862677213