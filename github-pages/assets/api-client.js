(function () {
  'use strict';

  const CSRF_COOKIE = 'tt_csrf';
  const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
  const PRIMARY_APP_ORIGIN = 'https://class-timetable.wangaoqi23.workers.dev';
  const GITHUB_PAGES_ORIGIN = 'https://wangaoqi23.github.io';
  const GITHUB_PROJECT_PATH = '/class-timetable';
  const LOCAL_STATE_KEY = 'timetable_local_state_v1';
  const LOCAL_SESSION_MS = 30 * 24 * 60 * 60 * 1000;

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

  function registrationUrl() {
    const target = new URL(rootUrl('login/'));
    target.searchParams.set('mode', 'register');
    return target.href;
  }

  function redirectAccountPageToPrimary() {
    return false;
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
    login.searchParams.set('mode', 'login');
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

  function localError(status, code, message, field) {
    const error = new Error(message);
    error.status = status;
    error.payload = { error: { code, message, ...(field ? { field } : {}) } };
    return error;
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function loadLocalState() {
    try {
      const parsed = JSON.parse(localStorage.getItem(LOCAL_STATE_KEY) || 'null');
      if (parsed && Array.isArray(parsed.users) && Array.isArray(parsed.schedules)) return parsed;
    } catch {
      // Replace a damaged local record with an empty account store.
    }
    return { version: 1, users: [], schedules: [], session: null };
  }

  function saveLocalState(state) {
    localStorage.setItem(LOCAL_STATE_KEY, JSON.stringify(state));
  }

  function base64Url(bytes) {
    let binary = '';
    bytes.forEach((value) => { binary += String.fromCharCode(value); });
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  }

  function fromBase64Url(value) {
    const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
    const binary = atob(normalized + '='.repeat((4 - normalized.length % 4) % 4));
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  }

  async function passwordHash(password, salt) {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', hash: 'SHA-256', salt: fromBase64Url(salt), iterations: 100000 },
      key,
      256,
    );
    return base64Url(new Uint8Array(bits));
  }

  function credentialBody(settings) {
    let body;
    try { body = typeof settings.body === 'string' ? JSON.parse(settings.body) : settings.body; }
    catch { throw localError(400, 'invalid_json', '提交的数据格式无效。'); }
    const username = typeof body?.username === 'string' ? body.username.trim().normalize('NFKC') : '';
    const password = typeof body?.password === 'string' ? body.password : '';
    if (!/^[\p{L}\p{N}._-]{3,32}$/u.test(username)) {
      throw localError(422, 'invalid_input', '用户名格式无效。', 'username');
    }
    if (password.length < 8 || password.length > 128) {
      throw localError(422, 'invalid_input', '密码长度无效。', 'password');
    }
    return { username, usernameKey: username.toLocaleLowerCase('und'), password, raw: body || {} };
  }

  function registrationProfile(raw) {
    const fullName = typeof raw?.fullName === 'string' ? raw.fullName.trim().normalize('NFKC') : '';
    const classId = typeof raw?.classId === 'string' ? raw.classId.trim() : '';
    const baseSchedule = raw?.baseSchedule;
    if (fullName.length < 2 || fullName.length > 30) {
      throw localError(422, 'invalid_input', '姓名需为 2–30 位。', 'fullName');
    }
    if (!baseSchedule || !Array.isArray(baseSchedule.classes) || !Array.isArray(baseSchedule.lessons)) {
      throw localError(422, 'invalid_input', '基础课表暂时不可用，请刷新页面。', 'classId');
    }
    const selectedClass = baseSchedule.classes.find((item) => item.id === classId);
    if (!selectedClass) throw localError(422, 'invalid_input', '请选择专业班级。', 'classId');
    return { fullName, classId, className: selectedClass.name, baseSchedule };
  }

  function personalizedBase(baseSchedule, classId, fullName) {
    const selectedClass = baseSchedule.classes.find((item) => item.id === classId) || baseSchedule.classes[0];
    const data = clone(baseSchedule);
    data.title = `${fullName}的课表`;
    data.classes = [clone(selectedClass)];
    data.lessons = data.lessons.filter((lesson) => lesson.classId === selectedClass.id);
    data.demo = false;
    return data;
  }

  function requireLocalUser(state) {
    if (!state.session || Number(state.session.expiresAt) <= Date.now()) {
      state.session = null;
      saveLocalState(state);
      throw localError(401, 'unauthorized', '请先登录。');
    }
    const user = state.users.find((item) => item.id === state.session.userId);
    if (!user) throw localError(401, 'unauthorized', '请先登录。');
    return user;
  }

  function userPayload(user) {
    return {
      id: user.id,
      username: user.username,
      fullName: user.fullName || user.username,
      classId: user.classId || '',
      className: user.className || '',
      createdAt: user.createdAt,
    };
  }

  function localSessionUser() {
    if (!isGitHubPagesMirror()) return null;
    const state = loadLocalState();
    if (!state.session || Number(state.session.expiresAt) <= Date.now()) return null;
    const user = state.users.find((item) => item.id === state.session.userId);
    return user ? userPayload(user) : null;
  }

  function summary(record) {
    return {
      id: record.id, name: record.name, title: record.data.title, term: record.data.term,
      version: record.version, createdAt: record.createdAt, updatedAt: record.updatedAt,
    };
  }

  function scheduleName(value) {
    const name = typeof value === 'string' ? value.trim() : '';
    if (!name || name.length > 50) throw localError(422, 'invalid_input', '课表名称需为 1–50 位。', 'name');
    return name;
  }

  function findOwnedSchedule(state, user, id) {
    const record = state.schedules.find((item) => item.id === id && item.userId === user.id);
    if (!record) throw localError(404, 'schedule_not_found', '课表不存在。');
    return record;
  }

  function ensureUniqueScheduleName(state, user, name, exceptId) {
    const key = name.normalize('NFKC').toLocaleLowerCase('und');
    if (state.schedules.some((item) => item.userId === user.id && item.nameKey === key && item.id !== exceptId)) {
      throw localError(409, 'schedule_name_taken', '已有同名课表。');
    }
    return key;
  }

  function createLocalSchedule(state, user, name, data) {
    const now = new Date().toISOString();
    const record = {
      id: crypto.randomUUID(), userId: user.id, name,
      nameKey: ensureUniqueScheduleName(state, user, name), data: clone(data),
      version: 1, createdAt: now, updatedAt: now,
    };
    state.schedules.push(record);
    saveLocalState(state);
    return clone(record);
  }

  function encodeShare(value) {
    return base64Url(new TextEncoder().encode(JSON.stringify(value)));
  }

  function decodeShare(token) {
    try {
      if (typeof token !== 'string' || !token || token.length > 100000) throw new Error();
      const value = JSON.parse(new TextDecoder().decode(fromBase64Url(token)));
      if (value?.v !== 1 || typeof value.name !== 'string' || !value.data || typeof value.data !== 'object') throw new Error();
      return value;
    } catch {
      throw localError(404, 'share_not_found', '分享链接无效或不完整。');
    }
  }

  async function localRequest(path, settings) {
    const method = String(settings.method || 'GET').toUpperCase();
    const state = loadLocalState();
    const readBody = () => {
      try { return typeof settings.body === 'string' ? JSON.parse(settings.body) : (settings.body || {}); }
      catch { throw localError(400, 'invalid_json', '提交的数据格式无效。'); }
    };

    if (method === 'POST' && path === '/api/auth/register') {
      const body = credentialBody(settings);
      const profile = registrationProfile(body.raw);
      if (state.users.some((item) => item.usernameKey === body.usernameKey)) {
        throw localError(409, 'username_taken', '这个用户名已经注册。');
      }
      const saltBytes = new Uint8Array(16);
      crypto.getRandomValues(saltBytes);
      const salt = base64Url(saltBytes);
      const now = new Date().toISOString();
      const user = {
        id: crypto.randomUUID(), username: body.username, usernameKey: body.usernameKey,
        fullName: profile.fullName, classId: profile.classId, className: profile.className,
        passwordSalt: salt, passwordHash: await passwordHash(body.password, salt), createdAt: now,
      };
      state.users.push(user);
      createLocalSchedule(state, user, '我的课表', personalizedBase(profile.baseSchedule, profile.classId, profile.fullName));
      state.session = { userId: user.id, expiresAt: Date.now() + LOCAL_SESSION_MS };
      saveLocalState(state);
      return { user: userPayload(user), session: { expiresAt: new Date(state.session.expiresAt).toISOString() } };
    }
    if (method === 'POST' && path === '/api/auth/login') {
      const body = credentialBody(settings);
      const user = state.users.find((item) => item.usernameKey === body.usernameKey);
      if (!user || await passwordHash(body.password, user.passwordSalt) !== user.passwordHash) {
        throw localError(401, 'invalid_credentials', '用户名或密码不正确。');
      }
      state.session = { userId: user.id, expiresAt: Date.now() + LOCAL_SESSION_MS };
      saveLocalState(state);
      return { user: userPayload(user), session: { expiresAt: new Date(state.session.expiresAt).toISOString() } };
    }
    if (method === 'POST' && path === '/api/auth/logout') {
      state.session = null;
      saveLocalState(state);
      return null;
    }
    if (method === 'GET' && path === '/api/auth/me') {
      return { user: userPayload(requireLocalUser(state)), session: { expiresAt: new Date(state.session.expiresAt).toISOString() } };
    }
    if (method === 'POST' && path === '/api/shares/preview') {
      const shared = decodeShare(readBody().token);
      return { share: { name: shared.name, data: clone(shared.data), createdAt: shared.createdAt || null, expiresAt: null } };
    }

    const user = requireLocalUser(state);
    if (method === 'GET' && path === '/api/schedules') {
      return { schedules: state.schedules.filter((item) => item.userId === user.id).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map(summary) };
    }
    if (method === 'POST' && path === '/api/schedules') {
      const body = readBody();
      return { schedule: createLocalSchedule(state, user, scheduleName(body.name), body.data) };
    }
    if (method === 'POST' && path === '/api/shares/import') {
      const body = readBody();
      const shared = decodeShare(body.token);
      return { schedule: createLocalSchedule(state, user, scheduleName(body.name), shared.data) };
    }

    const shareMatch = path.match(/^\/api\/schedules\/([^/]+)\/shares$/);
    if (method === 'POST' && shareMatch) {
      const record = findOwnedSchedule(state, user, decodeURIComponent(shareMatch[1]));
      const token = encodeShare({ v: 1, name: record.name, data: record.data, createdAt: new Date().toISOString() });
      return { share: { shareUrl: `${rootUrl('import/')}#${token}`, expiresAt: null } };
    }

    const scheduleMatch = path.match(/^\/api\/schedules\/([^/]+)$/);
    if (scheduleMatch) {
      const id = decodeURIComponent(scheduleMatch[1]);
      const record = findOwnedSchedule(state, user, id);
      if (method === 'GET') return { schedule: clone(record) };
      if (method === 'DELETE') {
        state.schedules = state.schedules.filter((item) => item.id !== record.id);
        saveLocalState(state);
        return null;
      }
      if (method === 'PUT') {
        const body = readBody();
        if (Number(body.version) !== record.version) throw localError(409, 'version_conflict', '课表已在其他页面更新。');
        record.name = scheduleName(body.name);
        record.nameKey = ensureUniqueScheduleName(state, user, record.name, record.id);
        record.data = clone(body.data);
        record.version += 1;
        record.updatedAt = new Date().toISOString();
        saveLocalState(state);
        return { schedule: clone(record) };
      }
    }
    throw localError(404, 'not_found', '请求不存在。');
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
    if (isGitHubPagesMirror()) return localRequest(target, settings);
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
    registrationUrl,
    redirectAccountPageToPrimary,
    localSessionUser,
    request,
  };
})();
