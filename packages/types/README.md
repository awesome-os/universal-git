# Legacy Type Emitting
rollup did create a cjs bundle that included the type comments then we emitted the .d.ts files from it.

## Moderinisation
We do not Inline the types to create them we directly author types in d.ts files that we reference from this package

## Why?
In 2025 all the hacks are not needed anymore because of the new unified module-sync target that is require and import compatible
It is ESM without TLA (Top Level Await). Also TypeScripts Bundler moduleResolution will pickup all types correct.
