## Running the Example
Save the two files (preflight.js and main.js).
Run node main.js.
Expected Output
You will get two distinct JSON outputs, demonstrating the function's ability to handle both modern and legacy servers.
Output for the Modern Repo (GitHub):
```js
--- Checking modern repo: https://github.com/sveltejs/svelte.git ---
{
  "protocolVersion": 2,
  "objectFormat": "sha1",
  "capabilities": {
    "version": "2",
    "ls-refs": true,
    "fetch": "filter shallow",
    "server-option": true,
    "object-format": "sha1"
  },
  "refs": {
    "branches": {
      "main": "2d4314c1f96e053a4730b912f71933a255ce3dba",
      "v3": "f9aa73489e211b439556819b168a623f95e55e00",
      ...
    },
    "tags": {
      "v1.0.0": {
        "sha": "9e54a377484a6012879685600c02919379659341",
        "peeled": "b6a8a2a86c67d3e601556e522f6d2e6191a27e02"
      },
      ...
    },
    "head": {
      "pointsTo": "refs/heads/main",
      "sha": "2d4314c1f96e053a4730b912f71933a255ce3dba"
    }
  }
}
```
Output for the Legacy Repo (Samba):
```js
--- Checking legacy repo: https://git.samba.org/samba.git ---
Protocol v2 not detected. Falling back to v1 parsing.
{
  "protocolVersion": 1,
  "objectFormat": "sha1",
  "capabilities": {
    "multi_ack": true,
    "thin-pack": true,
    "side-band": true,
    "side-band-64k": true,
    "ofs-delta": true,
    "shallow": true,
    "deepen-since": true,
    "deepen-not": true,
    "deepen-relative": true,
    "no-progress": true,
    "include-tag": true,
    "multi_ack_detailed": true,
    "allow-tip-sha1-in-want": true,
    "allow-reachable-sha1-in-want": true,
    "no-done": true,
    "symref": "HEAD:refs/heads/master",
    "agent": "git/2.30.2"
  },
  "refs": {
    "branches": {
      "master": "921869e944f2b4517855359b31d8a8a478c956de",
      ...
    },
    "tags": {
      "samba-3.0.0": {
        "sha": "2858ae831a19053894747c32757279c65a794098",
        "peeled": null
      },
      ...
    },
    "head": {
      "pointsTo": "refs/heads/master",
      "sha": "921869e944f2b4517855359b31d8a8a478c956de"
    }
  }
}
```
