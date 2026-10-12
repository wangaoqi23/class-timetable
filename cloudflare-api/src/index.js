import {
  AUTH_RATE_BLOCK_SECONDS,
  AUTH_RATE_WINDOW_SECONDS,
  CSRF_COOKIE,
  DEFAULT_APP_ORIGIN,
  LOGIN_ACCOUNT_RATE_LIMIT,
  LOGIN_IP_RATE_LIMIT,
  MAX_JSON_BYTES,
  MAX_SCHEDULES_PER_USER,
  MAX_SHARES_PER_USER,
  REGISTER_RATE_LIMIT,
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
} from './constants.js';
import {
  constantTimeEqual,
  createPasswordRecord,
  derivePasswordHash,
  parsePasswordIterations,
  randomToken,
  sha256Base64Url,
  verifyPassword,
} from './security.js';
import {
  InputError,
  validateCredentials,
  validateScheduleData,
  validateScheduleWrite,
  validateShareImport,
  validateShareOptions,
  validateSharePreview,
} from './validation.js';

class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const jsonHeaders = { 'Content-Type': 'application/json; charset=utf-8' };
const privateHeaders = { 'Cache-Control': 'no-store, max-age=0' };

function timestamp(value) {
  return new Date(Number(value)).toISOString();
}

function json(body, status = 200, headers = {}) {
  const responseHeaders = new Headers(headers);
  responseHeaders.set('Content-Type', jsonHeaders['Content-Type']);
  return new Response(JSON.stringify(body), {
    status,
    headers: responseHeaders,
  });
}

function empty(status = 204, headers = {}) {
  return new Response(null, { status, headers: new Headers(headers) });
}

function apiError(error, requestId) {
  if (error instanceof InputError) {
    return json(
      { error: { code: error.code, message: error.message, field: error.field, requestId } },
      422,
      privateHeaders,
    );
  }
  if (error instanceof ApiError) {
    const payload = { code: error.code, message: error.message, requestId };
    if (error.details !== undefined) payload.details = error.details;
    const headers = new Headers(privateHeaders);
    if (error.status === 429 && Number.isInteger(error.details?.retryAfterSeconds)) {
      headers.set('Retry-After', String(error.details.retryAfterSeconds));
    }
    return json({ error: payload }, error.status, headers);
  }
  console.error('Unhandled API error', requestId, error);
  return json(
    { error: { code: 'internal_error', message: 'The server could not complete the request.', requestId } },
    500,
    privateHeaders,
  );
}

function parseCookies(request) {
  const result = {};
  const header = request.headers.get('Cookie') || '';
  for (const entry of header.split(';')) {
    const separator = entry.indexOf('=');
    if (separator < 1) continue;
    const name = entry.slice(0, separator).trim();
    const value = entry.slice(separator + 1).trim();
    if (name && !(name in result)) result[name] = value;
  }
  return result;
}

function sessionCookie(token, maxAge = SESSION_TTL_SECONDS) {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

function csrfCookie(token, maxAge = SESSION_TTL_SECONDS) {
  return `${CSRF_COOKIE}=${token}; Path=/; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

function clearSessionCookie() {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

function clearCsrfCookie() {
  return `${CSRF_COOKIE}=; Path=/; Secure; SameSite=Lax; Max-Age=0`;
}

function addLoginCookies(headers, sessionToken, csrfToken) {
  headers.append('Set-Cookie', sessionCookie(sessionToken));
  headers.append('Set-Cookie', csrfCookie(csrfToken));
}

function addLogoutCookies(headers) {
  headers.append('Set-Cookie', clearSessionCookie());
  headers.append('Set-Cookie', clearCsrfCookie());
}

function configuredOrigin(env) {
  try {
    return new URL(env.APP_ORIGIN || DEFAULT_APP_ORIGIN).origin;
  } catch {
    throw new Error('APP_ORIGIN must be an absolute URL');
  }
}

function isLocalhostOrigin(origin) {
  try {
    const url = new URL(origin);
    return (url.protocol === 'http:' || url.protocol === 'https:') && url.hostname === 'localhost';
  } catch {
    return false;
  }
}

export function isAllowedOrigin(origin, requestUrl, env = {}) {
  if (!origin) return false;
  let normalized;
  try {
    normalized = new URL(origin).origin;
  } catch {
    return false;
  }
  return (
    normalized === configuredOrigin(env) ||
    normalized === new URL(requestUrl).origin ||
    (String(env.ALLOW_LOCALHOST_ORIGIN || '').toLowerCase() === 'true' && isLocalhostOrigin(normalized))
  );
}

function corsify(response, request, env) {
  const origin = request.headers.get('Origin');
  if (!origin || !isAllowedOrigin(origin, request.url, env)) return response;
  const headers = new Headers(response.headers);
  headers.set('Access-Control-Allow-Origin', new URL(origin).origin);
  headers.set('Access-Control-Allow-Credentials', 'true');
  headers.append('Vary', 'Origin');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function preflight(request, env) {
  const origin = request.headers.get('Origin');
  if (!origin || !isAllowedOrigin(origin, request.url, env)) {
    throw new ApiError(403, 'origin_forbidden', 'This origin is not allowed.');
  }
  const requestedMethod = request.headers.get('Access-Control-Request-Method') || '';
  if (!['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'].includes(requestedMethod.toUpperCase())) {
    throw new ApiError(405, 'method_not_allowed', 'The requested method is not allowed.');
  }
  const requestedHeaders = (request.headers.get('Access-Control-Request-Headers') || '')
    .split(',')
    .map((header) => header.trim().toLowerCase())
    .filter(Boolean);
  const allowedHeaders = new Set(['authorization', 'content-type', 'if-match', 'x-csrf-token']);
  if (requestedHeaders.some((header) => !allowedHeaders.has(header))) {
    throw new ApiError(403, 'headers_forbidden', 'One or more requested headers are not allowed.');
  }
  return empty(204, {
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, If-Match, X-CSRF-Token',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Max-Age': '86400',
  });
}

function requireWriteOrigin(request, env) {
  const origin = request.headers.get('Origin');
  if (!origin || !isAllowedOrigin(origin, request.url, env)) {
    throw new ApiError(403, 'origin_forbidden', 'Write requests must come from the timetable site.');
  }
}

function positiveIntegerSetting(value, fallback, name) {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 10_000) {
    throw new Error(`${name} must be an integer from 1 to 10000`);
  }
  return parsed;
}

function clientAddress(request) {
  const address = (request.headers.get('CF-Connecting-IP') || '').trim();
  return address && address.length <= 64 ? address : 'address-unavailable';
}

async function authRateKey(request, scope, subject = '') {
  return sha256Base64Url(`auth-rate-v1\u0000${scope}\u0000${clientAddress(request)}\u0000${subject}`);
}

async function consumeAuthRateLimit(request, env, scope, subject, limit) {
  const now = Date.now();
  const windowMilliseconds = AUTH_RATE_WINDOW_SECONDS * 1000;
  const blockMilliseconds = AUTH_RATE_BLOCK_SECONDS * 1000;
  const keyHash = await authRateKey(request, scope, subject);
  await env.DB
    .prepare('DELETE FROM auth_rate_limits WHERE updated_at < ?1')
    .bind(now - 7 * 24 * 60 * 60 * 1000)
    .run();
  const row = await env.DB
    .prepare(
      `INSERT INTO auth_rate_limits
       (key_hash, window_started_at, request_count, blocked_until, updated_at)
       VALUES (?1, ?2, 1, 0, ?2)
       ON CONFLICT(key_hash) DO UPDATE SET
         request_count = CASE
           WHEN auth_rate_limits.blocked_until <= ?2
                AND auth_rate_limits.window_started_at <= ?3 THEN 1
           ELSE auth_rate_limits.request_count + 1
         END,
         window_started_at = CASE
           WHEN auth_rate_limits.blocked_until <= ?2
                AND auth_rate_limits.window_started_at <= ?3 THEN ?2
           ELSE auth_rate_limits.window_started_at
         END,
         blocked_until = CASE
           WHEN auth_rate_limits.blocked_until > ?2 THEN auth_rate_limits.blocked_until
           WHEN auth_rate_limits.window_started_at <= ?3 THEN 0
           WHEN auth_rate_limits.request_count >= ?4 THEN ?2 + ?5
           ELSE 0
         END,
         updated_at = ?2
       RETURNING request_count, blocked_until`,
    )
    .bind(keyHash, now, now - windowMilliseconds, limit, blockMilliseconds)
    .first();
  if (!row) throw new Error('The authentication rate limiter did not return a result');
  if (Number(row.blocked_until) > now) {
    const retryAfterSeconds = Math.max(1, Math.ceil((Number(row.blocked_until) - now) / 1000));
    throw new ApiError(
      429,
      'rate_limited',
      'Too many authentication attempts. Please try again later.',
      { retryAfterSeconds },
    );
  }
  return keyHash;
}

async function clearAuthRateLimit(env, keyHash) {
  await env.DB.prepare('DELETE FROM auth_rate_limits WHERE key_hash = ?1').bind(keyHash).run();
}

async function readJson(request, { optional = false } = {}) {
  const contentLength = request.headers.get('Content-Length');
  if (contentLength && Number(contentLength) > MAX_JSON_BYTES) {
    throw new ApiError(413, 'body_too_large', `JSON bodies are limited to ${MAX_JSON_BYTES} bytes.`);
  }
  if (!request.body) {
    if (optional) return undefined;
    throw new ApiError(400, 'body_required', 'A JSON request body is required.');
  }
  const contentType = request.headers.get('Content-Type') || '';
  if (!/^application\/(?:[a-z0-9.+-]*\+)?json(?:\s*;|$)/i.test(contentType)) {
    throw new ApiError(415, 'unsupported_media_type', 'Content-Type must be application/json.');
  }
  const reader = request.body.getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_JSON_BYTES) {
      await reader.cancel();
      throw new ApiError(413, 'body_too_large', `JSON bodies are limited to ${MAX_JSON_BYTES} bytes.`);
    }
    chunks.push(value);
  }
  if (total === 0 && optional) return undefined;
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    throw new ApiError(400, 'invalid_json', 'The request body is not valid UTF-8 JSON.');
  }
}

function isConstraintError(error) {
  const message = String(error && (error.message || error));
  return /UNIQUE constraint failed|SQLITE_CONSTRAINT/i.test(message);
}

function userPayload(row) {
  return { id: row.id, username: row.username, createdAt: timestamp(row.created_at) };
}

function schedulePayload(row, includeData = true) {
  const payload = {
    id: row.id,
    name: row.name,
    title: row.title,
    term: row.term,
    version: Number(row.version),
    createdAt: timestamp(row.created_at),
    updatedAt: timestamp(row.updated_at),
  };
  if (includeData) {
    try {
      payload.data = JSON.parse(row.data_json);
    } catch {
      throw new ApiError(500, 'corrupt_record', 'Stored schedule data is not readable.');
    }
  }
  return payload;
}

function shareUrl(request, shareToken) {
  const url = new URL('/import/', request.url);
  url.hash = shareToken;
  return url.toString();
}

function shareMetadata(row, request, shareToken = null) {
  const metadata = {
    id: row.id,
    scheduleId: row.source_schedule_id || null,
    name: row.name,
    createdAt: timestamp(row.created_at),
    expiresAt: row.expires_at === null || row.expires_at === undefined ? null : timestamp(row.expires_at),
  };
  if (shareToken !== null) metadata.shareUrl = shareUrl(request, shareToken);
  return metadata;
}

async function createSession(env, userId, now) {
  const token = randomToken(32);
  const tokenHash = await sha256Base64Url(token);
  const expiresAt = now + SESSION_TTL_SECONDS * 1000;
  await env.DB.batch([
    env.DB.prepare('DELETE FROM sessions WHERE expires_at <= ?1').bind(now),
    env.DB
      .prepare(
        `DELETE FROM sessions
         WHERE user_id = ?1 AND token_hash NOT IN (
           SELECT token_hash FROM sessions WHERE user_id = ?1 ORDER BY created_at DESC LIMIT 19
         )`,
      )
      .bind(userId),
    env.DB
      .prepare(
        'INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?1, ?2, ?3, ?4)',
      )
      .bind(tokenHash, userId, now, expiresAt),
  ]);
  return { token, tokenHash, expiresAt };
}

async function authenticate(request, env) {
  const authorization = request.headers.get('Authorization') || '';
  const bearerMatch = authorization.match(/^Bearer ([A-Za-z0-9_-]{40,100})$/);
  const cookies = parseCookies(request);
  const token = bearerMatch ? bearerMatch[1] : cookies[SESSION_COOKIE];
  const mode = bearerMatch ? 'bearer' : 'cookie';
  if (!token || !/^[A-Za-z0-9_-]{40,100}$/.test(token)) {
    throw new ApiError(401, 'authentication_required', 'Please sign in to continue.');
  }
  const tokenHash = await sha256Base64Url(token);
  const now = Date.now();
  const row = await env.DB
    .prepare(
      `SELECT u.id, u.username, u.created_at, s.expires_at
       FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ?1 AND s.expires_at > ?2`,
    )
    .bind(tokenHash, now)
    .first();
  if (!row) throw new ApiError(401, 'session_invalid', 'Your session is invalid or has expired.');
  return { user: row, tokenHash, mode, expiresAt: Number(row.expires_at) };
}

function requireCsrf(request, auth) {
  if (auth.mode === 'bearer') return;
  const cookies = parseCookies(request);
  const cookieToken = cookies[CSRF_COOKIE] || '';
  const headerToken = request.headers.get('X-CSRF-Token') || '';
  if (
    !/^[A-Za-z0-9_-]{24,100}$/.test(cookieToken) ||
    !/^[A-Za-z0-9_-]{24,100}$/.test(headerToken) ||
    !constantTimeEqual(cookieToken, headerToken)
  ) {
    throw new ApiError(403, 'csrf_failed', 'The CSRF token is missing or invalid.');
  }
}

async function register(request, env) {
  const body = validateCredentials(await readJson(request));
  await consumeAuthRateLimit(
    request,
    env,
    'register-ip',
    '',
    positiveIntegerSetting(env.AUTH_REGISTER_RATE_LIMIT, REGISTER_RATE_LIMIT, 'AUTH_REGISTER_RATE_LIMIT'),
  );
  const iterations = parsePasswordIterations(env.PASSWORD_ITERATIONS);
  const password = await createPasswordRecord(body.password, iterations);
  const now = Date.now();
  const userId = crypto.randomUUID();
  const token = randomToken(32);
  const tokenHash = await sha256Base64Url(token);
  const expiresAt = now + SESSION_TTL_SECONDS * 1000;
  try {
    await env.DB.batch([
      env.DB
        .prepare(
          `INSERT INTO users
           (id, username, username_key, password_hash, password_salt, password_iterations, created_at)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`,
        )
        .bind(userId, body.username, body.usernameKey, password.hash, password.salt, password.iterations, now),
      env.DB
        .prepare(
          'INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?1, ?2, ?3, ?4)',
        )
        .bind(tokenHash, userId, now, expiresAt),
    ]);
  } catch (error) {
    if (isConstraintError(error)) {
      throw new ApiError(409, 'username_taken', 'That username is already registered.');
    }
    throw error;
  }
  const headers = new Headers(privateHeaders);
  addLoginCookies(headers, token, randomToken(24));
  return json(
    { user: { id: userId, username: body.username, createdAt: timestamp(now) }, session: { expiresAt: timestamp(expiresAt) } },
    201,
    headers,
  );
}

async function login(request, env) {
  const body = validateCredentials(await readJson(request));
  await consumeAuthRateLimit(
    request,
    env,
    'login-ip',
    '',
    positiveIntegerSetting(env.AUTH_LOGIN_IP_RATE_LIMIT, LOGIN_IP_RATE_LIMIT, 'AUTH_LOGIN_IP_RATE_LIMIT'),
  );
  const accountRateKey = await consumeAuthRateLimit(
    request,
    env,
    'login-account',
    body.usernameKey,
    positiveIntegerSetting(
      env.AUTH_LOGIN_ACCOUNT_RATE_LIMIT,
      LOGIN_ACCOUNT_RATE_LIMIT,
      'AUTH_LOGIN_ACCOUNT_RATE_LIMIT',
    ),
  );
  const row = await env.DB
    .prepare(
      `SELECT id, username, password_hash, password_salt, password_iterations, created_at
       FROM users WHERE username_key = ?1`,
    )
    .bind(body.usernameKey)
    .first();
  let valid = false;
  if (row) {
    valid = await verifyPassword(body.password, {
      hash: row.password_hash,
      salt: row.password_salt,
      iterations: Number(row.password_iterations),
    });
  } else {
    // Keep unknown-user requests close to the cost of a normal password check.
    await derivePasswordHash(body.password, 'AAECAwQFBgcICQoLDA0ODw', parsePasswordIterations(env.PASSWORD_ITERATIONS));
  }
  if (!valid) throw new ApiError(401, 'invalid_credentials', 'The username or password is incorrect.');

  await clearAuthRateLimit(env, accountRateKey);
  const now = Date.now();
  const session = await createSession(env, row.id, now);
  const targetIterations = parsePasswordIterations(env.PASSWORD_ITERATIONS);
  if (Number(row.password_iterations) < targetIterations) {
    const upgraded = await createPasswordRecord(body.password, targetIterations);
    await env.DB
      .prepare(
        `UPDATE users SET password_hash = ?1, password_salt = ?2, password_iterations = ?3
         WHERE id = ?4`,
      )
      .bind(upgraded.hash, upgraded.salt, upgraded.iterations, row.id)
      .run();
  }
  const headers = new Headers(privateHeaders);
  addLoginCookies(headers, session.token, randomToken(24));
  return json(
    { user: userPayload(row), session: { expiresAt: timestamp(session.expiresAt) } },
    200,
    headers,
  );
}

async function currentUser(request, env) {
  const auth = await authenticate(request, env);
  const headers = new Headers(privateHeaders);
  const cookies = parseCookies(request);
  if (auth.mode === 'cookie' && !/^[A-Za-z0-9_-]{24,100}$/.test(cookies[CSRF_COOKIE] || '')) {
    const secondsRemaining = Math.max(1, Math.floor((auth.expiresAt - Date.now()) / 1000));
    headers.append('Set-Cookie', csrfCookie(randomToken(24), secondsRemaining));
  }
  return json(
    { user: userPayload(auth.user), session: { expiresAt: timestamp(auth.expiresAt) } },
    200,
    headers,
  );
}

async function issueCsrf(request, env) {
  const auth = await authenticate(request, env);
  const csrfToken = randomToken(24);
  const secondsRemaining = Math.max(1, Math.floor((auth.expiresAt - Date.now()) / 1000));
  const headers = new Headers(privateHeaders);
  headers.append('Set-Cookie', csrfCookie(csrfToken, secondsRemaining));
  return json({ csrfToken }, 200, headers);
}

async function logout(request, env) {
  const auth = await authenticate(request, env);
  requireCsrf(request, auth);
  await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?1').bind(auth.tokenHash).run();
  const headers = new Headers(privateHeaders);
  addLogoutCookies(headers);
  return empty(204, headers);
}

async function listSchedules(request, env) {
  const auth = await authenticate(request, env);
  const result = await env.DB
    .prepare(
      `SELECT id, name, title, term, version, created_at, updated_at
       FROM schedules WHERE user_id = ?1 ORDER BY updated_at DESC, id ASC LIMIT ?2`,
    )
    .bind(auth.user.id, MAX_SCHEDULES_PER_USER)
    .all();
  return json({ schedules: (result.results || []).map((row) => schedulePayload(row, false)) }, 200, privateHeaders);
}

async function insertSchedule(env, userId, name, data) {
  const countRow = await env.DB
    .prepare('SELECT COUNT(*) AS count FROM schedules WHERE user_id = ?1')
    .bind(userId)
    .first();
  if (Number(countRow.count) >= MAX_SCHEDULES_PER_USER) {
    throw new ApiError(409, 'schedule_limit_reached', `Each account may store ${MAX_SCHEDULES_PER_USER} schedules.`);
  }
  const id = crypto.randomUUID();
  const now = Date.now();
  const nameKey = name.normalize('NFKC').toLocaleLowerCase('und');
  try {
    await env.DB
      .prepare(
        `INSERT INTO schedules
         (id, user_id, name, name_key, title, term, data_json, version, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 1, ?8, ?8)`,
      )
      .bind(
        id,
        userId,
        name,
        nameKey,
        data.title,
        data.term,
        JSON.stringify(data),
        now,
      )
      .run();
  } catch (error) {
    if (isConstraintError(error)) {
      throw new ApiError(409, 'schedule_name_taken', 'You already have a schedule with that name.');
    }
    throw error;
  }
  return schedulePayload({
    id,
    name,
    title: data.title,
    term: data.term,
    data_json: JSON.stringify(data),
    version: 1,
    created_at: now,
    updated_at: now,
  });
}

async function createSchedule(request, env) {
  const auth = await authenticate(request, env);
  requireCsrf(request, auth);
  const body = validateScheduleWrite(await readJson(request));
  const schedule = await insertSchedule(env, auth.user.id, body.name, body.data);
  return json({ schedule }, 201, { ...privateHeaders, ETag: '"1"' });
}

async function getSchedule(request, env, scheduleId) {
  const auth = await authenticate(request, env);
  const row = await env.DB
    .prepare(
      `SELECT id, name, title, term, data_json, version, created_at, updated_at
       FROM schedules WHERE id = ?1 AND user_id = ?2`,
    )
    .bind(scheduleId, auth.user.id)
    .first();
  if (!row) throw new ApiError(404, 'schedule_not_found', 'Schedule not found.');
  return json({ schedule: schedulePayload(row) }, 200, { ...privateHeaders, ETag: `"${row.version}"` });
}

async function updateSchedule(request, env, scheduleId) {
  const auth = await authenticate(request, env);
  requireCsrf(request, auth);
  const body = validateScheduleWrite(await readJson(request), { requireVersion: true });
  const now = Date.now();
  const nameKey = body.name.normalize('NFKC').toLocaleLowerCase('und');
  let result;
  try {
    result = await env.DB
      .prepare(
        `UPDATE schedules
         SET name = ?1, name_key = ?2, title = ?3, term = ?4, data_json = ?5,
             version = version + 1, updated_at = ?6
         WHERE id = ?7 AND user_id = ?8 AND version = ?9`,
      )
      .bind(
        body.name,
        nameKey,
        body.data.title,
        body.data.term,
        JSON.stringify(body.data),
        now,
        scheduleId,
        auth.user.id,
        body.version,
      )
      .run();
  } catch (error) {
    if (isConstraintError(error)) {
      throw new ApiError(409, 'schedule_name_taken', 'You already have a schedule with that name.');
    }
    throw error;
  }
  if (!result.meta || Number(result.meta.changes) === 0) {
    const exists = await env.DB
      .prepare('SELECT version FROM schedules WHERE id = ?1 AND user_id = ?2')
      .bind(scheduleId, auth.user.id)
      .first();
    if (!exists) throw new ApiError(404, 'schedule_not_found', 'Schedule not found.');
    throw new ApiError(409, 'version_conflict', 'This schedule was changed elsewhere.', {
      currentVersion: Number(exists.version),
    });
  }
  const updated = await env.DB
    .prepare(
      `SELECT id, name, title, term, data_json, version, created_at, updated_at
       FROM schedules WHERE id = ?1 AND user_id = ?2`,
    )
    .bind(scheduleId, auth.user.id)
    .first();
  const nextVersion = Number(updated.version);
  return json(
    { schedule: schedulePayload(updated) },
    200,
    { ...privateHeaders, ETag: `"${nextVersion}"` },
  );
}

async function deleteSchedule(request, env, scheduleId) {
  const auth = await authenticate(request, env);
  requireCsrf(request, auth);
  const result = await env.DB
    .prepare('DELETE FROM schedules WHERE id = ?1 AND user_id = ?2')
    .bind(scheduleId, auth.user.id)
    .run();
  if (!result.meta || Number(result.meta.changes) === 0) {
    throw new ApiError(404, 'schedule_not_found', 'Schedule not found.');
  }
  return empty(204, privateHeaders);
}

async function listShares(request, env) {
  const auth = await authenticate(request, env);
  const result = await env.DB
    .prepare(
      `SELECT id, source_schedule_id, name, created_at, expires_at
       FROM shares WHERE owner_user_id = ?1 ORDER BY created_at DESC LIMIT ?2`,
    )
    .bind(auth.user.id, MAX_SHARES_PER_USER)
    .all();
  return json({ shares: (result.results || []).map((row) => shareMetadata(row, request)) }, 200, privateHeaders);
}

async function createShare(request, env, scheduleId) {
  const auth = await authenticate(request, env);
  requireCsrf(request, auth);
  const options = validateShareOptions(await readJson(request, { optional: true }));
  const countRow = await env.DB
    .prepare('SELECT COUNT(*) AS count FROM shares WHERE owner_user_id = ?1')
    .bind(auth.user.id)
    .first();
  if (Number(countRow.count) >= MAX_SHARES_PER_USER) {
    throw new ApiError(409, 'share_limit_reached', `Each account may keep ${MAX_SHARES_PER_USER} share links.`);
  }
  const schedule = await env.DB
    .prepare('SELECT id, name, data_json FROM schedules WHERE id = ?1 AND user_id = ?2')
    .bind(scheduleId, auth.user.id)
    .first();
  if (!schedule) throw new ApiError(404, 'schedule_not_found', 'Schedule not found.');
  const now = Date.now();
  const expiresAt = options.expiresInDays === null ? null : now + options.expiresInDays * 86_400_000;
  const id = crypto.randomUUID();
  const shareToken = randomToken(32);
  const tokenHash = await sha256Base64Url(shareToken);
  await env.DB
    .prepare(
      `INSERT INTO shares
       (id, token_hash, owner_user_id, source_schedule_id, name, data_json, created_at, expires_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`,
    )
    .bind(id, tokenHash, auth.user.id, schedule.id, schedule.name, schedule.data_json, now, expiresAt)
    .run();
  return json(
    {
      share: shareMetadata(
        { id, source_schedule_id: schedule.id, name: schedule.name, created_at: now, expires_at: expiresAt },
        request,
        shareToken,
      ),
    },
    201,
    privateHeaders,
  );
}

async function getShare(request, env) {
  const { token: shareToken } = validateSharePreview(await readJson(request));
  const tokenHash = await sha256Base64Url(shareToken);
  const row = await env.DB
    .prepare('SELECT id, name, data_json, created_at, expires_at FROM shares WHERE token_hash = ?1')
    .bind(tokenHash)
    .first();
  if (!row) throw new ApiError(404, 'share_not_found', 'Share link not found.');
  if (row.expires_at !== null && row.expires_at !== undefined && Number(row.expires_at) <= Date.now()) {
    throw new ApiError(410, 'share_expired', 'This share link has expired.');
  }
  let data;
  try {
    data = JSON.parse(row.data_json);
  } catch {
    throw new ApiError(500, 'corrupt_record', 'Stored share data is not readable.');
  }
  return json(
    {
      share: {
        id: row.id,
        name: row.name,
        data,
        createdAt: timestamp(row.created_at),
        expiresAt: row.expires_at === null || row.expires_at === undefined ? null : timestamp(row.expires_at),
      },
    },
    200,
    privateHeaders,
  );
}

async function importShare(request, env) {
  const auth = await authenticate(request, env);
  requireCsrf(request, auth);
  const options = validateShareImport(await readJson(request));
  const shareToken = options.token;
  const tokenHash = await sha256Base64Url(shareToken);
  const row = await env.DB
    .prepare('SELECT name, data_json, expires_at FROM shares WHERE token_hash = ?1')
    .bind(tokenHash)
    .first();
  if (!row) throw new ApiError(404, 'share_not_found', 'Share link not found.');
  if (row.expires_at !== null && row.expires_at !== undefined && Number(row.expires_at) <= Date.now()) {
    throw new ApiError(410, 'share_expired', 'This share link has expired.');
  }
  let parsed;
  try {
    parsed = JSON.parse(row.data_json);
  } catch {
    throw new ApiError(500, 'corrupt_record', 'Stored share data is not readable.');
  }
  const data = validateScheduleData(parsed);
  const schedule = await insertSchedule(env, auth.user.id, options.name || row.name, data);
  return json({ schedule }, 201, { ...privateHeaders, ETag: '"1"' });
}

async function deleteShare(request, env, shareId) {
  const auth = await authenticate(request, env);
  requireCsrf(request, auth);
  const result = await env.DB
    .prepare('DELETE FROM shares WHERE id = ?1 AND owner_user_id = ?2')
    .bind(shareId, auth.user.id)
    .run();
  if (!result.meta || Number(result.meta.changes) === 0) {
    throw new ApiError(404, 'share_not_found', 'Share link not found.');
  }
  return empty(204, privateHeaders);
}

function validateScheduleId(value) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new ApiError(404, 'schedule_not_found', 'Schedule not found.');
  }
  return value;
}

function validateShareRecordId(value) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new ApiError(404, 'share_not_found', 'Share link not found.');
  }
  return value;
}

async function routeApi(request, env) {
  const url = new URL(request.url);
  const path = url.pathname.length > 1 ? url.pathname.replace(/\/$/, '') : url.pathname;
  const method = request.method.toUpperCase();
  if (method === 'OPTIONS') return preflight(request, env);
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) requireWriteOrigin(request, env);

  if (method === 'GET' && path === '/api/health') return json({ ok: true });
  if (method === 'POST' && path === '/api/auth/register') return register(request, env);
  if (method === 'POST' && path === '/api/auth/login') return login(request, env);
  if (method === 'POST' && path === '/api/auth/logout') return logout(request, env);
  if (method === 'GET' && path === '/api/auth/me') return currentUser(request, env);
  if (method === 'GET' && path === '/api/auth/csrf') return issueCsrf(request, env);
  if (method === 'GET' && path === '/api/schedules') return listSchedules(request, env);
  if (method === 'POST' && path === '/api/schedules') return createSchedule(request, env);
  if (method === 'GET' && path === '/api/shares') return listShares(request, env);
  if (method === 'POST' && path === '/api/shares/preview') return getShare(request, env);
  if (method === 'POST' && path === '/api/shares/import') return importShare(request, env);

  const scheduleMatch = path.match(/^\/api\/schedules\/([^/]+)$/);
  if (scheduleMatch) {
    const scheduleId = validateScheduleId(scheduleMatch[1]);
    if (method === 'GET') return getSchedule(request, env, scheduleId);
    if (method === 'PUT') return updateSchedule(request, env, scheduleId);
    if (method === 'DELETE') return deleteSchedule(request, env, scheduleId);
  }

  const shareCreateMatch = path.match(/^\/api\/schedules\/([^/]+)\/shares$/);
  if (shareCreateMatch && method === 'POST') {
    return createShare(request, env, validateScheduleId(shareCreateMatch[1]));
  }

  const shareMatch = path.match(/^\/api\/shares\/([^/]+)$/);
  if (shareMatch && method === 'DELETE') {
    return deleteShare(request, env, validateShareRecordId(shareMatch[1]));
  }

  throw new ApiError(404, 'not_found', 'API endpoint not found.');
}

async function servePublicSchedule(request, env) {
  const sourceUrl = env.PUBLIC_SCHEDULE_URL;
  if (sourceUrl) {
    try {
      const upstream = await fetch(sourceUrl, {
        headers: { Accept: 'application/json' },
        cf: { cacheTtl: 0 },
      });
      if (upstream.ok) {
        return new Response(upstream.body, {
          status: 200,
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-store, max-age=0',
            'X-Content-Type-Options': 'nosniff',
          },
        });
      }
    } catch {
      // Fall back to the last schedule bundled with the deployment.
    }
  }
  return env.ASSETS.fetch(request);
}

async function fetchHandler(request, env) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/api/')) {
    if (request.method === 'GET' && url.pathname === '/data/schedule.json' && env.ASSETS) {
      return servePublicSchedule(request, env);
    }
    if (env.ASSETS && typeof env.ASSETS.fetch === 'function') return env.ASSETS.fetch(request);
    return json({ error: { code: 'not_found', message: 'Not found.' } }, 404);
  }

  const requestId = crypto.randomUUID();
  let response;
  try {
    const origin = request.headers.get('Origin');
    if (origin && !isAllowedOrigin(origin, request.url, env)) {
      throw new ApiError(403, 'origin_forbidden', 'This origin is not allowed.');
    }
    response = await routeApi(request, env);
  } catch (error) {
    response = apiError(error, requestId);
  }
  const headers = new Headers(response.headers);
  headers.set('X-Request-Id', requestId);
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Referrer-Policy', 'no-referrer');
  headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  response = new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
  return corsify(response, request, env);
}

export default { fetch: fetchHandler };
export { ApiError, fetchHandler, readJson };
