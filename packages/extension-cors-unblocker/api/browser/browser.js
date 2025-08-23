// Note: Safari and FireFox do implement this compat shim.
export const isExtension = globalThis.chrome && globalThis.chrome.runtime && globalThis.chrome.runtime.id;
export const isFirefox = globalThis.browser && globalThis.browser.runtime && globalThis.browser.runtime.id;
export const isChrome = isExtension && !isFirefox;
export const browserPromise = isChrome ? import('./mozilla-browser-polyfill.js') : Promise.resolve(globalThis.browser);
