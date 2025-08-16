# Legacy Type Emitting
rollup did create a cjs bundle that included the type comments then we emitted the .d.ts files from it.

## Moderinisation
We do not Inline the types to create them we directly author types in d.ts files that we reference from this package

## Why?
In 2025 all the hacks are not needed anymore because of the new unified module-sync target that is require and import compatible
It is ESM without TLA (Top Level Await). Also TypeScripts Bundler moduleResolution will pickup all types correct.

## How?

1. create legacy types emit them in packages/types
2. create d.ts files inside the source and use module resolution without extension-
3. edit package.json use the mappings to rewrite from extension less to *.d.ts *.js
4. Incremental goal reached package is useable via module resolution that will not work in the browser.
5. packages/browser-isomorphic-git/* needs to use extensions and needs to create matching d.ts files that reference the @isomorphic-git/types package.
