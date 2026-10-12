import assert from 'node:assert/strict';

const baseUrl = process.env.API_BASE_URL || 'http://127.0.0.1:8787';
const sameOrigin = new URL(baseUrl).origin;
const loginAccountLimit = Number(process.env.TEST_LOGIN_ACCOUNT_LIMIT || 8);

class ApiClient {
  constructor(address) {
    this.address = address;
    this.cookies = new Map();
  }

  captureCookies(headers) {
    const values = typeof headers.getSetCookie === 'function'
      ? headers.getSetCookie()
      : [headers.get('set-cookie')].filter(Boolean);
    for (const value of values) {
      const firstPart = value.split(';', 1)[0];
      const separator = firstPart.indexOf('=');
      if (separator < 1) continue;
      const name = firstPart.slice(0, separator);
      const content = firstPart.slice(separator + 1);
      if (content) this.cookies.set(name, content);
      else this.cookies.delete(name);
    }
  }

  async api(
    path,
    {
      method = 'GET',
      body,
      csrf = false,
      authenticated = true,
      origin = method === 'GET' ? null : sameOrigin,
    } = {},
  ) {
    const headers = { 'CF-Connecting-IP': this.address };
    if (origin !== null) headers.Origin = origin;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (authenticated && this.cookies.size) {
      headers.Cookie = [...this.cookies].map(([key, value]) => `${key}=${value}`).join('; ');
    }
    if (csrf) headers['X-CSRF-Token'] = this.cookies.get('tt_csrf');
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    this.captureCookies(response.headers);
    const text = await response.text();
    const data = text ? JSON.parse(text) : null;
    return { response, data };
  }
}

async function register(client, username, password) {
  const result = await client.api('/api/auth/register', {
    method: 'POST',
    body: { username, password },
    authenticated: false,
  });
  assert.equal(result.response.status, 201, JSON.stringify(result.data));
  assert.ok(client.cookies.get('tt_session'));
  assert.ok(client.cookies.get('tt_csrf'));
  assert.equal('token' in result.data.session, false);
  return result.data.user;
}

const health = await fetch(`${baseUrl}/api/health`);
assert.equal(health.status, 200);
assert.deepEqual(await health.json(), { ok: true });

for (const path of ['/', '/login/', '/app/', '/import/']) {
  const response = await fetch(`${baseUrl}${path}`);
  assert.equal(response.status, 200, `${path} should be served by the static-assets binding`);
  assert.match(response.headers.get('content-type') || '', /text\/html/i);
}

const suffix = crypto.randomUUID().slice(0, 12);
const password = 'integration-password-123';
const owner = new ApiClient('203.0.113.10');
const importer = new ApiClient('203.0.113.20');
const attacker = new ApiClient('203.0.113.30');

const ownerUser = await register(owner, `owner_${suffix}`, password);
const me = await owner.api('/api/auth/me');
assert.equal(me.response.status, 200, JSON.stringify(me.data));
assert.equal(me.data.user.id, ownerUser.id);

const timetable = {
  title: '课间',
  term: '2026-2027 第1学期',
  startDate: '2026-09-07',
  weeks: 18,
  periods: [
    { name: '第1节', start: '08:30', end: '09:15' },
    { name: '第2节', start: '09:15', end: '10:00' },
  ],
  classes: [{ id: 'class-1', name: '游戏艺术设计1班', note: '2026' }],
  lessons: [],
  demo: false,
};

const missingCsrf = await owner.api('/api/schedules', {
  method: 'POST',
  body: { name: '不会创建', data: timetable },
});
assert.equal(missingCsrf.response.status, 403, JSON.stringify(missingCsrf.data));
assert.equal(missingCsrf.data.error.code, 'csrf_failed');

const evilOrigin = await owner.api('/api/schedules', {
  method: 'POST',
  csrf: true,
  origin: 'https://attacker.example',
  body: { name: '不会创建', data: timetable },
});
assert.equal(evilOrigin.response.status, 403, JSON.stringify(evilOrigin.data));
assert.equal(evilOrigin.data.error.code, 'origin_forbidden');

const created = await owner.api('/api/schedules', {
  method: 'POST',
  csrf: true,
  body: { name: '我的课表', data: timetable },
});
assert.equal(created.response.status, 201, JSON.stringify(created.data));
assert.equal(created.data.schedule.version, 1);

const scheduleId = created.data.schedule.id;
const updated = await owner.api(`/api/schedules/${scheduleId}`, {
  method: 'PUT',
  csrf: true,
  body: { name: '我的课表', data: { ...timetable, term: '更新后的学期' }, version: 1 },
});
assert.equal(updated.response.status, 200, JSON.stringify(updated.data));
assert.equal(updated.data.schedule.version, 2);
assert.equal(updated.data.schedule.createdAt, created.data.schedule.createdAt);

const stale = await owner.api(`/api/schedules/${scheduleId}`, {
  method: 'PUT',
  csrf: true,
  body: { name: '我的课表', data: timetable, version: 1 },
});
assert.equal(stale.response.status, 409, JSON.stringify(stale.data));
assert.equal(stale.data.error.code, 'version_conflict');

const shared = await owner.api(`/api/schedules/${scheduleId}/shares`, {
  method: 'POST',
  csrf: true,
  body: { expiresInDays: 30 },
});
assert.equal(shared.response.status, 201, JSON.stringify(shared.data));
const shareRecordId = shared.data.share.id;
const shareUrl = new URL(shared.data.share.shareUrl);
assert.equal(shareUrl.origin, sameOrigin);
assert.equal(shareUrl.pathname, '/import/');
assert.equal(shareUrl.search, '');
const shareToken = decodeURIComponent(shareUrl.hash.slice(1));
assert.match(shareToken, /^[A-Za-z0-9_-]{43}$/);
assert.notEqual(shareRecordId, shareToken);

const ownerShares = await owner.api('/api/shares');
assert.equal(ownerShares.response.status, 200, JSON.stringify(ownerShares.data));
assert.equal(ownerShares.data.shares.length, 1);
assert.equal(ownerShares.data.shares[0].id, shareRecordId);
assert.equal('shareUrl' in ownerShares.data.shares[0], false);

const preview = await attacker.api('/api/shares/preview', {
  method: 'POST',
  authenticated: false,
  body: { token: shareToken },
});
assert.equal(preview.response.status, 200, JSON.stringify(preview.data));
assert.match(preview.response.headers.get('cache-control') || '', /no-store/i);
assert.equal(preview.data.share.data.term, '更新后的学期');

await register(importer, `importer_${suffix}`, password);
const ownerScheduleFromImporter = await importer.api(`/api/schedules/${scheduleId}`);
assert.equal(ownerScheduleFromImporter.response.status, 404, JSON.stringify(ownerScheduleFromImporter.data));

const revokeFromImporter = await importer.api(`/api/shares/${shareRecordId}`, {
  method: 'DELETE',
  csrf: true,
});
assert.equal(revokeFromImporter.response.status, 404, JSON.stringify(revokeFromImporter.data));

const imported = await importer.api('/api/shares/import', {
  method: 'POST',
  csrf: true,
  body: { token: shareToken, name: '导入的课表' },
});
assert.equal(imported.response.status, 201, JSON.stringify(imported.data));
assert.notEqual(imported.data.schedule.id, scheduleId);

const importerList = await importer.api('/api/schedules');
assert.equal(importerList.response.status, 200, JSON.stringify(importerList.data));
assert.equal(importerList.data.schedules.length, 1);
assert.equal(importerList.data.schedules[0].id, imported.data.schedule.id);

const revoked = await owner.api(`/api/shares/${shareRecordId}`, {
  method: 'DELETE',
  csrf: true,
});
assert.equal(revoked.response.status, 204);

const revokedPreview = await attacker.api('/api/shares/preview', {
  method: 'POST',
  authenticated: false,
  body: { token: shareToken },
});
assert.equal(revokedPreview.response.status, 404, JSON.stringify(revokedPreview.data));

for (let attempt = 1; attempt <= loginAccountLimit; attempt += 1) {
  const rejected = await attacker.api('/api/auth/login', {
    method: 'POST',
    authenticated: false,
    body: { username: `missing_${suffix}`, password: 'wrong-password-123' },
  });
  assert.equal(rejected.response.status, 401, `attempt ${attempt}: ${JSON.stringify(rejected.data)}`);
}
const limited = await attacker.api('/api/auth/login', {
  method: 'POST',
  authenticated: false,
  body: { username: `missing_${suffix}`, password: 'wrong-password-123' },
});
assert.equal(limited.response.status, 429, JSON.stringify(limited.data));
assert.equal(limited.data.error.code, 'rate_limited');
assert.ok(Number(limited.response.headers.get('retry-after')) >= 1);

const registrar = new ApiClient('203.0.113.40');
for (let attempt = 1; attempt <= 5; attempt += 1) {
  const accepted = await registrar.api('/api/auth/register', {
    method: 'POST',
    authenticated: false,
    body: { username: `register_${attempt}_${suffix}`, password },
  });
  assert.equal(accepted.response.status, 201, `registration ${attempt}: ${JSON.stringify(accepted.data)}`);
}
const registrationLimited = await registrar.api('/api/auth/register', {
  method: 'POST',
  authenticated: false,
  body: { username: `register_6_${suffix}`, password },
});
assert.equal(registrationLimited.response.status, 429, JSON.stringify(registrationLimited.data));
assert.equal(registrationLimited.data.error.code, 'rate_limited');
assert.ok(Number(registrationLimited.response.headers.get('retry-after')) >= 1);

const ownerLogout = await owner.api('/api/auth/logout', { method: 'POST', csrf: true });
assert.equal(ownerLogout.response.status, 204);
const signedOut = await owner.api('/api/auth/me');
assert.equal(signedOut.response.status, 401);

console.log('Live integration flow passed.');
