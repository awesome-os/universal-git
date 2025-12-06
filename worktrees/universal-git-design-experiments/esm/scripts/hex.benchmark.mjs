/**
 * On Node18 and in our case 20bytes for the sha codes our implementations are faster then native
 */
/**
 
Running "DECODING (HEX -> BYTES) - Small Data (20 bytes)" suite...
Progress: 100%

  Native: Buffer.from(hex):
    7 611 676 ops/s, ±0.38%    | slowest, 58.09% slower

  JS: hexToBytes:
    13 450 009 ops/s, ±0.47%   | 25.94% slower

  JS: hexToBytes_FAST_CLEAN:
    18 160 680 ops/s, ±0.34%   | fastest

Finished 3 cases!
  Fastest: JS: hexToBytes_FAST_CLEAN
  Slowest: Native: Buffer.from(hex)
Running "ENCODING (BYTES -> HEX) - Small Data (20 bytes)" suite...
Progress: 100%

  Native: buffer.toString(hex):
    10 463 375 ops/s, ±0.70%   | slowest, 10.75% slower

  JS: bytesToHex:
    11 723 428 ops/s, ±0.42%   | fastest

Finished 2 cases!
  Fastest: JS: bytesToHex
  Slowest: Native: buffer.toString(hex)
 */

/**
 * on node 22+ native catches up but we are only 3% slower 
 * Conclusion we do not even do a Buffer fallback!
 */

/**
 Running "DECODING (HEX -> BYTES) - Small Data (20 bytes)" suite...
Progress: 100%

  Native: Buffer.from(hex):
    14 665 873 ops/s, ±0.84%   | slowest, 31.18% slower

  JS: hexToBytes:
    17 566 111 ops/s, ±0.87%   | 17.57% slower

  JS: hexToBytes_FAST_CLEAN:
    21 310 365 ops/s, ±0.64%   | fastest

Finished 3 cases!
  Fastest: JS: hexToBytes_FAST_CLEAN
  Slowest: Native: Buffer.from(hex)
Running "ENCODING (BYTES -> HEX) - Small Data (20 bytes)" suite...
Progress: 100%

  Native: buffer.toString(hex):
    13 821 535 ops/s, ±0.58%   | fastest

  JS: bytesToHex:
    13 335 197 ops/s, ±0.71%   | slowest, 3.52% slower

Finished 2 cases!
  Fastest: Native: buffer.toString(hex)
  Slowest: JS: bytesToHex
 */


/**
 Of course. You've collected some fascinating data that reveals a lot about the evolution of the Node.js runtime. Parsing these raw logs is indeed difficult.

Here is a clear comparison table that aggregates your test results, followed by an analysis of the key takeaways.

First, I've averaged the results from your duplicate runs to get a more stable representation for each Node.js version.

### Performance Comparison: Node.js v18 vs. v24

---

#### **Task 1: DECODING (HEX -> BYTES) - Small Data (20 bytes)**

This scenario tests how quickly a short, 40-character hex string can be converted to bytes.

| Implementation              | Node v18 (ops/s) | Node v24 (ops/s) | Performance Gain (v18 -> v24) |
| :-------------------------- | ---------------: | ---------------: | :---------------------------- |
| Native: `Buffer.from(hex)`  |        6,902,360 |       13,608,450 | **+97.2%**                    |
| JS: `hexToBytes` (Robust)   |       10,692,924 |       14,279,161 | **+33.5%**                    |
| **JS: `hexToBytes_FAST_CLEAN`** | **14,702,031**   | **17,927,244**   | **+22.0%**                    |

---

#### **Task 2: ENCODING (BYTES -> HEX) - Small Data (20 bytes)**

This scenario tests how quickly a small 20-byte buffer can be converted to a hex string.

| Implementation               | Node v18 (ops/s) | Node v24 (ops/s) | Performance Gain (v18 -> v24) |
| :--------------------------- | ---------------: | ---------------: | :---------------------------- |
| Native: `buffer.toString(hex)` |        9,851,890 |       12,979,973 | **+31.8%**                    |
| **JS: `bytesToHex`**           |  **8,915,763**   | **10,305,880**   | **+15.6%**                    |

---

#### **Task 3: DECODING (HEX -> BYTES) - Large Data (16 KB)**

This scenario tests performance on larger, more demanding data sets.

| Implementation              | Node v18 (ops/s) | Node v24 (ops/s) | Performance Gain (v18 -> v24) |
| :-------------------------- | ---------------: | ---------------: | :---------------------------- |
| **Native: `Buffer.from(hex)`**  | **39,810**       | **73,556**       | **+84.8%**                    |
| JS: `hexToBytes` (Robust)   |         21,708 |         30,409 | **+40.1%**                    |
| JS: `hexToBytes_FAST_CLEAN` |         32,289 |         48,456 | **+49.0%**                    |

---

#### **Task 4: ENCODING (BYTES -> HEX) - Large Data (16 KB)**

This is the most demanding scenario for the pure JS encoding function.

| Implementation               | Node v18 (ops/s) | Node v24 (ops/s) | Performance Gain (v18 -> v24) |
| :--------------------------- | ---------------: | ---------------: | :---------------------------- |
| **Native: `buffer.toString(hex)`** | **98,569**       | **143,406**      | **+45.5%**                    |
| JS: `bytesToHex`             |          8,040 |         17,554 | **+118.3%**                   |

---

### Analysis & Key Insights

Your benchmark results tell a very compelling story about performance improvements in Node.js.

1.  **Massive Overall Gains in Node.js v24:** Every single test case is significantly faster in Node.js v24 compared to v18. The performance gains range from a respectable **+15%** to an incredible **+118%**. This is clear evidence of major optimizations in both the V8 JavaScript engine and the Node.js C++ core.

2.  **V8 Engine Optimization is Phenomenal:** Look at the "Large Data" tasks for your pure JS functions. `bytesToHex` saw a **+118.3%** speedup, and `hexToBytes_FAST_CLEAN` saw a **+49%** speedup. This indicates that V8 in Node.js v24 is much better at optimizing tight loops, string operations (`charCodeAt`), and array access than it was in v18.

3.  **The "Small Data Anomaly": Pure JS Wins:** This is the most fascinating result. For **small data decoding**, your pure JavaScript functions (`hexToBytes` and especially `hexToBytes_FAST_CLEAN`) are **faster than the native C++ `Buffer.from(hex)`** in *both* Node versions.
    *   **Why?** The overhead of transitioning from the JavaScript context to the native C++ layer (the "JS/C++ boundary") has a cost. For a tiny operation like converting 40 characters, this overhead can be greater than the time saved by the faster C++ execution. V8 is so incredibly fast at executing simple JS loops that it wins out.
    *   **In v18, your fast JS function was already 2.4x faster than native.** In v24, this lead narrowed slightly, but JS still remains the decisive winner for this specific micro-task.

4.  **Native `Buffer` Still Reigns for Large Data:** As soon as the data size increases, the cost of the JS/C++ boundary becomes negligible, and the raw speed of the native C++ implementation takes over. For large data, `Buffer.from` and `buffer.toString` are the undisputed champions in both Node versions, and their lead is substantial.

### Conclusion

Your benchmark clearly demonstrates two critical points:

*   **Upgrading Node.js provides significant, free performance wins.** The improvements from v18 to v24 are not minor; they are dramatic, especially for CPU-intensive JavaScript code.
*   **For very small, high-frequency operations, a well-optimized pure JavaScript function can outperform its native equivalent.** This is a powerful reminder that "native" isn't always faster when function call overhead is a factor. Your `hexToBytes_FAST_CLEAN` is a perfect example of a highly effective micro-optimization.
 */

import benny from 'benny';
import { randomBytes } from 'crypto';
import { hexToBytes, bytesToHex } from '../hex.mjs';
import { bytesToHexSlow, hexToBytes_FAST_CLEAN  } from '../hex.experimental.js';

// --- Configuration ---
const LARGE_DATA_SIZE_BYTES = 16384; // 16 KB

// --- Test Data Generation ---
const smallHexString = 'e6708f5e7146d24b27a3878b277b5a37f551a3a4';
const smallBytes = hexToBytes(smallHexString);
const smallBuffer = Buffer.from(smallBytes);

const largeBuffer = randomBytes(LARGE_DATA_SIZE_BYTES);
const largeHexString = largeBuffer.toString('hex');
const largeBytes = new Uint8Array(largeBuffer);

console.log(`Node.js version: ${process.version}\n`);

async function runBenchmarks() {
  // --- Group 2: Decoding Large Strings ---
  await benny.suite(
    'DECODING (HEX -> BYTES) - Large Data (16 KB)',
    benny.add('Native: Buffer.from(hex)', () => {
      Buffer.from(largeHexString, 'hex');
    }),
    benny.add('JS: hexToBytes', () => {
      hexToBytes(largeHexString);
    }),
    benny.add('JS: hexToBytes_FAST_CLEAN', () => {
      hexToBytes_FAST_CLEAN(largeHexString);
    }),
    benny.cycle(),
    benny.complete()
  );
  // --- Group 4: Encoding Large Buffers ---
  await benny.suite(
    'ENCODING (BYTES -> HEX) - Large Data (16 KB)',
    benny.add('Native: buffer.toString(hex)', () => {
      largeBuffer.toString('hex');
    }),
    benny.add('JS: bytesToHex', () => {
      bytesToHex(largeBytes);
    }),
    benny.add('JS: bytesToHexSlow', () => {
      bytesToHexSlow(largeBytes);
    }),
    benny.cycle(),
    benny.complete()
  );

    // --- Group 1: Decoding Small Strings ---
  await benny.suite(
    'DECODING (HEX -> BYTES) - Small Data (20 bytes)',
    benny.add('Native: Buffer.from(hex)', () => {
      Buffer.from(smallHexString, 'hex');
    }),
    benny.add('JS: hexToBytes', () => {
      hexToBytes(smallHexString);
    }),
    benny.add('JS: hexToBytes_FAST_CLEAN', () => {
      hexToBytes_FAST_CLEAN(smallHexString);
    }),
    benny.cycle(),
    benny.complete()
  );



  // --- Group 3: Encoding Small Buffers ---
  await benny.suite(
    'ENCODING (BYTES -> HEX) - Small Data (20 bytes)',
    benny.add('Native: buffer.toString(hex)', () => {
      smallBuffer.toString('hex');
    }),
    benny.add('JS: bytesToHex', () => {
      bytesToHex(smallBytes);
    }),
    benny.add('JS: bytesToHexSlow', () => {
      bytesToHex(smallBytes);
    }),
    benny.cycle(),
    benny.complete()
  );


}

runBenchmarks().catch(console.error);