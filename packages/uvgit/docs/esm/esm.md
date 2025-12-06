# How to Patch ESM Code without Recompilation
This is a critical question in the Universal Git Ecosystem as we want to avoid fragmentation
so we cover it

## How to depend on universal-git
Here is a very good and standard way to do this in ESM. The key is to create a "proxy" or "facade" module. Since ESM `export` bindings are immutable (you can't change what a module exports after it's been defined), you can't modify the original module in-place. Instead, you create a new module that re-exports everything from the original *except* for the one you want to override, which you provide yourself.

This new module then has the identical "shape" and can be used as a drop-in replacement.

### The "Proxy Module" Pattern

Let's say you have a library called `original-library.js` and you want to override its `doSomething` function.

#### 1. The Original Module (`original-library.js`)

```javascript
// original-library.js

export const doSomething = () => {
  console.log("Doing the original thing.");
  return "original_value";
};

export const doSomethingElse = () => {
  console.log("Doing something else.");
  return "another_value";
};

export const PI = 3.14159;
```

#### 2. The Patched Proxy Module (`patched-library.js`)

This is where the magic happens. We'll create a new file that acts as our replacement.

```javascript
// patched-library.js

// Step 1: Re-export ALL named exports from the original module.
// This is the most crucial part. It passes through everything we don't touch.
export * from './original-library.js';

// Step 2: Define your new, overriding implementation.
const patchedDoSomething = () => {
  console.log("Doing the NEW, patched thing!");
  // You can even call the original if you need to wrap it (see advanced example below)
  return "patched_value";
};

// Step 3: Export your patched function USING THE ORIGINAL NAME.
// This explicit export takes precedence over the one from the wildcard (*) export.
export { patchedDoSomething as doSomething };
```

**How it works:**
The `export * from './original-library.js'` statement re-exports `doSomething`, `doSomethingElse`, and `PI`. However, the next line, `export { patchedDoSomething as doSomething }`, creates a *second* export named `doSomething`. In ESM, explicit named exports in the current file always win over re-exports from another module.

#### 3. Using the Patched Module (`main.js`)

Now, any code that needs the patched behavior simply imports from your new module instead of the original one.

```javascript
// main.js

// Instead of: import * as lib from './original-library.js';
import * as lib from './patched-library.js';

// --- The code below doesn't need to change at all! ---

const result1 = lib.doSomething(); // Will call the patched version
const result2 = lib.doSomethingElse(); // Will call the original version
const piValue = lib.PI; // Will use the original constant

console.log({ result1, result2, piValue });
```

**Running this would produce:**

```
Doing the NEW, patched thing!
Doing something else.
{ result1: 'patched_value', result2: 'another_value', piValue: 3.14159 }
```

As you can see, the `lib` object has the exact same shape, but the `doSomething` function has been successfully replaced.

---

### Advanced Use Case: Wrapping the Original Function

Sometimes you don't want to completely replace a function, but rather add behavior around it (like logging, caching, or validation). The pattern supports this beautifully.

```javascript
// patched-wrapper-library.js

// Re-export everything to maintain the module shape
export * from './original-library.js';

// Import the specific function we want to wrap, but give it an alias
import { doSomething as originalDoSomething } from './original-library.js';

// Define our new wrapper function that CALLS the original
const wrappedDoSomething = () => {
  console.log("LOG: 'doSomething' is about to be called.");
  const startTime = performance.now();

  const result = originalDoSomething(); // <-- Call the original!

  const endTime = performance.now();
  console.log(`LOG: 'doSomething' finished in ${endTime - startTime}ms.`);

  // You can even modify the result if you want
  return `wrapped(${result})`;
};

// Export our wrapper using the original name
export { wrappedDoSomething as doSomething };
```

### create a Bundle of multiple entryPoints into a single entryPoint that exports everything.
```js
import multi from '@rollup/plugin-multi-entry';

export default {
  input: ["node_modules/universal-git/universal-git.js",""],
  output: {
    dir: 'output'
  },
  plugins: [multi()]
};
```