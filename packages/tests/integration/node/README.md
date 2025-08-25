## Node Integration tests for backward compatability on best effort base

## First try 
Node 24+ // shows warning
Node 16  // JSON shows warning
Node 12 // known issues not ESM compatible without flags does not hornor * exports in package.json

### Smalles denominator
- in the CJS version simple inline JSON produce single file bundle because of the not existing exports support.
- for ESM go all in and publish the single file bundle types and the singleFile Bundle only.
  - Add wrapper exports for the new added functionality.
  - reship the umd crap but only document ESM


we should make a static umd shim detect all used node modules and build a wrapper via webpack 4 so that we get a useable result
