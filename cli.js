const minimisted = require('minimisted')
const git = require('./src/index.js')

// Implementations that get Injected
const fs = require('node:fs')
const http = require('./src/http.js')

// This really isn't much of a CLI. It's mostly for testing.
// But it's very versatile and works surprisingly well.
minimisted(function({ _: [command, ...args], ...opts }) {
  git[command]({
    fs, http,
    dir: '.',
    onAuth() { 
      return { username: opts.username, password: opts.password }; 
    },
    headers: {
      'User-Agent': `git/isogit-${git.version()}`,
    },
    opts,
  }).then(
    (result) => {
      if (result === undefined) return;
      // detect streams
      if (typeof result.on === 'function') {
        result.pipe(process.stdout)
      } else {
        console.log(JSON.stringify(result, null, 2))
      }
    },
    (err) => {
      // process.stderr.write(err.message + '\n')
      console.error(err)
      process.exit(1)
    }
  );
})
