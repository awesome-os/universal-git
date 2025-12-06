import pkg from './package.json' with { type: "json"};
// TODO: Merge with rollup-plugin-polyfill-node/polyfills/__zlib-lib/binding.js
const banner = {
  banner() {
    return `/*! ${pkg.name} ${pkg.version} https://github.com/${pkg.repository} @license ${pkg.license} */`;
  }
}

const plugins = [ 
  banner 
];

export default [
  // es6
  {
    input: 'index.js',
    output: [
      { exports: 'named', file: 'dist/pako.js' },
      // { format: 'umd', file: 'dist/pako.umd.js', name: 'pako', exports: 'named' }
    ],
    plugins: plugins
  }
];
