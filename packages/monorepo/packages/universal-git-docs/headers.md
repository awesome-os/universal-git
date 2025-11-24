---
title: headers
sidebar_label: headers
---

# `Authorization` header

Plain old HTTP Basic auth can be handled elegantly using the `onAuth` handler.
But if you want to use Bearer auth or something, any value you manually set for the `Authorization` header will override the derived value.

# `User-Agent` header

Regretably, some git hosting services have User-Agent specific behavior.
For instance, GitHub will correctly interpret git HTTP requests made to a repository URL that is missing the `.git` suffix but _ONLY_ if the User-Agent starts with `git/`.
And in fact, does not interpret git HTTP requests for _gists_ correctly _at all_ unless the User-Agent start with `git/` (bug [#259](https://github.com/universal-git/universal-git/issues/259)).

Since 2015 the specs state that setting a custom User-Agent header in `fetch` should override the default. This works in Firefox (bug [#247](https://github.com/universal-git/universal-git/issues/247)), but Chrome has a bug so setting a custom User-Agent doesn't work at all (chrome bug [#571722](https://bugs.chromium.org/p/chromium/issues/detail?id=571722)).

The [`@universal-git/cors-proxy`](https://github.com/universal-git/cors-proxy) solves some of this problem by checking if the User-Agent starts with `git/` and if it doesn't, it sets the User-Agent to `git/@universal-git/cors-proxy`. So cloning gists using a proxy works.

Alternatively, you can use Chrome DevTools to override headers:
- **Network Panel**: Right-click on a request → "Override headers" to modify request headers. This works for the current browser session only.
- **Overrides Panel**: Use the Sources → Overrides panel to create persistent overrides. You can override both headers and files:
  - For **session-only** header overrides: Use the Network panel's "Override headers" feature.
  - For **persistent** overrides: Use the Overrides panel with Filesystem Overrides to save changes to disk, which persist across browser sessions.

CORS also has a strange relationship with the User-Agent header. Setting a custom User-Agent header requires that 'User-Agent' be explicitly whitelisted in the CORS pre-flight request (bug [#555](https://github.com/universal-git/universal-git/issues/555)).

As you can see, User-Agent is basically a mine field. Which is why as of version 1.0 this library doesn't touch it. There is no solution that works for everything (GitHub handling URLs without .git, cloning gists, setting it in Chrome, setting it in a proxy, CORS). This is your problem now, not mine. Go bug GitHub, Inc to stop using user-agent filtering.

# `X-` headers

There is nothing stopping you from setting custom headers if you really want. But if you're doing it in a browser you'll either need to run the CORS proxy on the same domain or
run a custom CORS proxy to whitelist those headers if they aren't [already whitelisted](https://github.com/universal-git/cors-proxy/blob/master/middleware.js#L7-L25).

Alternatively, you can use Chrome DevTools to override headers and files:
- **Network Panel**: Right-click on a request → "Override headers" to modify request headers. This works for the current browser session only.
- **Overrides Panel**: Use the Sources → Overrides panel to create persistent overrides. You can override both headers and files:
  - For **session-only** header overrides: Use the Network panel's "Override headers" feature.
  - For **persistent** overrides: Use the Overrides panel with Filesystem Overrides to save changes to disk, which persist across browser sessions.
