(function () {
  'use strict';

  const CSRF_COOKIE = 'tt_csrf';
  const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
  const PRIMARY_APP_ORIGIN = 'https://class-timetable.wangaoqi23.workers.dev';
  const GITHUB_PAGES_ORIGIN = 'https://wangaoqi23.github.io';
  const GITHUB_PROJECT_PATH = '/class-timetable';
  const ACCOUNT_ROUTES = new Set(['login', 'app', 'import']);

  function isGitHubPagesMirror(locationLike) {
    const location = locationLike || window.location;
    if (location.origin !== GITHUB_PAGES_ORIGIN) return false;
    const pathname = location.pathname || '';
    return pathname === GITHUB_PROJECT_PATH || pathname.startsWith(`${GITHUB_PROJECT_PATH}/`);
  }

  function primaryAppUrl(path) {
    const target = new URL(PRIMARY_APP_ORIGIN);
    const safePath = String(path || '').replace(/^\/+/, '');
    target.pathname = `/${safePath}`;
    target.search = '';
    target.hash = '';
    return target.href;
  }

  function redirectAccountPageToPrimary() {
    if (!isGitHubPagesMirror()) return false;
    const relativePath = (window.location.pathname || '').slice(GITHUB_PROJECT_PATH.length);
    const route = relativePath.replace(/^\/+/, '').split('/')[0];
    if (!ACCOUNT_ROUTES.has(route)) return false;

    const target = new URL(PRIMARY_APP_ORIGIN);
    target.pathname = relativePath.startsWith('/') ? relativePath : `/${relativePath}`;
    target.search = window.location.search || '';
    target.hash = window.location.hash || '';
    window.location.replace(target.href);
    return true;
  }

  function rootUrl(path) {
    const meta = document.querySelector('meta[name="app-root"]');
    const root = new URL(meta ? meta.content : './', window.location.href);
    return new URL(path || '', root).href;
  }

  function safeNext(value, fallback) {
    if (!value) return rootUrl(fallback || 'app/');
    try {
      const next = new URL(value, window.location.href);
      return next.origin === window.location.origin ? next.href : rootUrl(fallback || 'app/');
    } catch {
      return rootUrl(fallback || 'app/');
    }
  }

  function readCookie(name) {
    const prefix = `${encodeURIComponent(name)}=`;
    const item = document.cookie.split(';').map((part) => part.trim()).find((part) => part.startsWith(prefix));
    if (!item) return '';
    try {
      return decodeURIComponent(item.slice(prefix.length));
    } catch {
      return '';
    }
  }

  function loginUrl() {
    const login = new URL(rootUrl('login/'));
    const next = safeNext(window.location.href, 'app/');
    login.hash = `next=${encodeURIComponent(next)}`;
    return login.href;
  }

  function errorMessage(payload, status) {
    if (payload && typeof payload === 'object') {
      if (typeof payload.message === 'string' && payload.message) return payload.message;
      if (typeof payload.error === 'string' && payload.error) return payload.error;
      if (payload.error && typeof payload.error.message === 'string' && payload.error.message) {
        return payload.error.message;
      }
    }
    return typeof payload === 'string' && payload ? payload : `请求失败（${status}）`;
  }

  async function request(path, options) {
    const settings = options || {};
    const fetchSettings = { ...settings };
    delete fetchSettings.auth;
    const method = String(settings.method || 'GET').toUpperCase();
    const headers = new Headers(settings.headers || {});
    headers.set('Accept', 'application/json');
    if (settings.body && !(settings.body instanceof FormData) && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }

    if (!SAFE_METHODS.has(method)) {
      const csrfToken = readCookie(CSRF_COOKIE);
      if (csrfToken) headers.set('X-CSRF-Token', csrfToken);
    }

    const target = path.startsWith('/api/') ? path : '/api/' + String(path).replace(/^\/+/, '');
    const response = await fetch(target, {
      ...fetchSettings,
      method,
      headers,
      credentials: 'same-origin',
      cache: 'no-store',
    });
    const type = response.headers.get('content-type') || '';
    const payload = response.status === 204
      ? null
      : type.includes('application/json')
        ? await response.json()
        : await response.text();

    if (response.status === 401 && settings.auth !== false) {
      window.location.replace(loginUrl());
      const error = new Error('登录已过期，请重新登录。');
      error.status = 401;
      error.payload = payload;
      throw error;
    }
    if (!response.ok) {
      const error = new Error(errorMessage(payload, response.status));
      error.status = response.status;
      error.payload = payload;
      throw error;
    }
    return payload;
  }

  window.TimetableApi = {
    CSRF_COOKIE,
    PRIMARY_APP_ORIGIN,
    rootUrl,
    safeNext,
    readCookie,
    loginUrl,
    isGitHubPagesMirror,
    primaryAppUrl,
    redirectAccountPageToPrimary,
    request,
  };
})();
