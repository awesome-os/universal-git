import { isFirefox, isChrome, isExtension } from './detect-environment.js';

const browser = isChrome ? import('./')
