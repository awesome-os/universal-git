/**
 * Git HTTP Transport
 * Handles Git protocol over HTTP/HTTPS
 */
import type {
  HttpClient,
  GitAuth,
  RemoteDiscoverOptions,
  RemoteDiscoverResult,
  RemoteConnectOptions,
  RemoteConnection,
  AuthCallback,
  AuthSuccessCallback,
  AuthFailureCallback,
} from './types.ts';
import { parseRefAdvertisement } from '../wire/parseRefAdvertisement.ts';

const corsProxify = (corsProxy: string, url: string): string =>
  corsProxy.endsWith('?')
    ? `${corsProxy}${url}`
    : `${corsProxy}/${url.replace(/^https?:\/\//, '')}`;

const calculateBasicAuthHeader = (auth: GitAuth): string => {
  if (!auth.username || !auth.password) {
    return '';
  }
  const credentials = `${auth.username}:${auth.password}`;
  return `Basic ${btoa(credentials)}`;
};

const extractAuthFromUrl = (url: string): { url: string; auth: GitAuth } => {
  try {
    const parsed = new URL(url);
    const auth: GitAuth = {};
    
    if (parsed.username) {
      auth.username = decodeURIComponent(parsed.username);
    }
    if (parsed.password) {
      auth.password = decodeURIComponent(parsed.password);
    }
    
    // Remove auth from URL
    parsed.username = '';
    parsed.password = '';
    
    return { url: parsed.toString(), auth };
  } catch {
    return { url, auth: {} };
  }
};

const updateHeaders = (
  headers: Record<string, string>,
  auth: GitAuth
): void => {
  if (auth.username || auth.password) {
    headers.Authorization = calculateBasicAuthHeader(auth);
  }
  if (auth.headers) {
    Object.assign(headers, auth.headers);
  }
};

export class GitHttpTransport {
  /**
   * Discovers remote repository capabilities and refs
   */
  static async discover(
    options: RemoteDiscoverOptions
  ): Promise<RemoteDiscoverResult> {
    const {
      http,
      onProgress,
      onAuth,
      onAuthSuccess,
      onAuthFailure,
      corsProxy,
      service,
      url: _origUrl,
      protocolVersion = 1,
    } = options;

    if (!http) {
      throw new Error('GitHttpTransport requires http client');
    }

    const requestHeaders = options.headers ?? {};
    let { url, auth } = extractAuthFromUrl(_origUrl);
    const proxifiedURL = corsProxy ? corsProxify(corsProxy, url) : url;

    if (auth.username || auth.password) {
      requestHeaders.Authorization = calculateBasicAuthHeader(auth);
    }

    if (protocolVersion === 2) {
      requestHeaders['Git-Protocol'] = 'version=2';
    }

    let res;
    let tryAgain: boolean;
    let providedAuthBefore = false;

    do {
      res = await http.request({
        onProgress,
        method: 'GET',
        url: `${proxifiedURL}/info/refs?service=${service}`,
        headers: requestHeaders,
      });

      tryAgain = false;

      if (res.statusCode === 401 || res.statusCode === 203) {
        const getAuth = providedAuthBefore ? onAuthFailure : onAuth;
        if (getAuth) {
          const newAuth = await getAuth(url, {
            ...auth,
            headers: { ...requestHeaders },
          });
          if (newAuth && newAuth.cancel) {
            throw new Error('Authentication canceled');
          } else if (newAuth) {
            auth = newAuth;
            updateHeaders(requestHeaders, auth);
            providedAuthBefore = true;
            tryAgain = true;
          }
        }
      } else if (
        res.statusCode === 200 &&
        providedAuthBefore &&
        onAuthSuccess
      ) {
        await onAuthSuccess(url, auth);
      }
    } while (tryAgain);

    if (res.statusCode !== 200) {
      throw new Error(
        `HTTP ${res.statusCode} ${res.statusMessage}: Failed to discover refs`
      );
    }

    if (!res.body) {
      throw new Error('No response body');
    }

    // Parse ref advertisement
    const advertisement = await parseRefAdvertisement(res.body, service);

    if (advertisement.protocolVersion === 1) {
      return {
        protocolVersion: 1,
        refs: advertisement.refs,
        symrefs: advertisement.symrefs,
        capabilities: advertisement.capabilities,
        auth,
      };
    } else {
      return {
        protocolVersion: 2,
        capabilities2: advertisement.capabilities2 || {},
        auth,
      };
    }
  }

  /**
   * Connects to remote repository for upload-pack operation
   */
  static async connect(
    options: RemoteConnectOptions
  ): Promise<RemoteConnection> {
    const {
      http,
      onProgress,
      corsProxy,
      service,
      url,
      auth,
      body,
      protocolVersion,
      command,
    } = options;

    if (!http) {
      throw new Error('GitHttpTransport requires http client');
    }

    const requestHeaders = options.headers ?? {};
    const urlAuth = extractAuthFromUrl(url);
    let finalUrl = urlAuth.url;

    if (corsProxy) {
      finalUrl = corsProxify(corsProxy, finalUrl);
    }

    requestHeaders['content-type'] = `application/x-${service}-request`;
    requestHeaders.accept = `application/x-${service}-result`;

    if (auth) {
      updateHeaders(requestHeaders, auth);
    } else if (urlAuth.auth) {
      updateHeaders(requestHeaders, urlAuth.auth);
    }

    let bodyIterator: AsyncIterableIterator<Uint8Array> | undefined;
    if (body) {
      if (Array.isArray(body)) {
        bodyIterator = (async function* () {
          for (const buf of body) {
            yield new Uint8Array(buf);
          }
        })();
      } else if (body instanceof Uint8Array) {
        bodyIterator = (async function* () {
          yield new Uint8Array(body);
        })();
      } else {
        bodyIterator = body;
      }
    }

    let requestUrl = `${finalUrl}/${service}`;
    if (protocolVersion === 2 && command) {
      const separator = requestUrl.includes('?') ? '&' : '?';
      requestUrl = `${requestUrl}${separator}command=${command}`;
    }

    const res = await http.request({
      onProgress,
      method: 'POST',
      url: requestUrl,
      body: bodyIterator,
      headers: requestHeaders,
    });

    if (res.statusCode !== 200) {
      throw new Error(
        `HTTP ${res.statusCode} ${res.statusMessage}: Failed to connect`
      );
    }

    return res;
  }
}
