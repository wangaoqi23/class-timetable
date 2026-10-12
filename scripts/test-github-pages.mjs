import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { webcrypto } from 'node:crypto';
import vm from 'node:vm';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const [
  sharedSource,
  appSource,
  adminSource,
  apiClientSource,
  authSource,
  sessionRedirectSource,
  workspaceSource,
  importSource,
  indexHtml,
  adminHtml,
  loginHtml,
  workspaceHtml,
  importHtml,
  stylesSource,
  dataSource,
  workflow,
] = await Promise.all([
  read('github-pages/assets/shared.js'),
  read('github-pages/assets/app.js'),
  read('github-pages/assets/admin.js'),
  read('github-pages/assets/api-client.js'),
  read('github-pages/assets/auth.js'),
  read('github-pages/assets/session-redirect.js'),
  read('github-pages/assets/workspace.js'),
  read('github-pages/assets/import.js'),
  read('github-pages/index.html'),
  read('github-pages/admin/index.html'),
  read('github-pages/login/index.html'),
  read('github-pages/app/index.html'),
  read('github-pages/import/index.html'),
  read('github-pages/assets/styles.css'),
  read('github-pages/data/schedule.json'),
  read('.github/workflows/deploy-pages.yml'),
]);

const context = { window: {}, Intl, Date, crypto: webcrypto };
vm.createContext(context);
vm.runInContext(sharedSource, context, { filename: 'shared.js' });
const utils = context.window.ScheduleUtils;
const schedule = JSON.parse(dataSource);

let capturedRequest;
const apiContext = {
  window: {
    location: { href: 'https://example.test/class-timetable/app/', origin: 'https://example.test', replace() {} },
  },
  document: {
    cookie: 'other=value; tt_csrf=csrf-test-value',
    querySelector: () => ({ content: '../' }),
  },
  Headers,
  FormData,
  URL,
  Set,
  fetch: async (target, options) => {
    capturedRequest = { target, options };
    return {
      status: 200,
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () => ({ ok: true }),
    };
  },
};
vm.createContext(apiContext);
vm.runInContext(apiClientSource, apiContext, { filename: 'api-client.js' });
await apiContext.window.TimetableApi.request('/api/schedules', { method: 'POST', body: '{}' });
assert.equal(capturedRequest.target, '/api/schedules');
assert.equal(capturedRequest.options.credentials, 'same-origin');
assert.equal(capturedRequest.options.headers.get('X-CSRF-Token'), 'csrf-test-value');
assert.equal(capturedRequest.options.headers.has('Authorization'), false);

apiContext.window.location.href = 'https://example.test/class-timetable/import/#private-share-token';
const loginTarget = new URL(apiContext.window.TimetableApi.loginUrl());
assert.equal(loginTarget.pathname, '/class-timetable/login/');
assert.equal(loginTarget.search, '', 'the return URL must stay out of the login query string');
assert.equal(
  new URLSearchParams(loginTarget.hash.slice(1)).get('next'),
  'https://example.test/class-timetable/import/#private-share-token',
  'the login fragment should preserve an import fragment without sending it to the server',
);
assert.equal(
  apiContext.window.TimetableApi.safeNext('https://attacker.test/collect', 'app/'),
  'https://example.test/class-timetable/app/',
  'login return paths must remain on the current origin',
);

function loadApiAt(pathname, search = '', hash = '') {
  let replaced = '';
  const origin = 'https://wangaoqi23.github.io';
  const pageContext = {
    window: {
      location: {
        href: `${origin}${pathname}${search}${hash}`,
        origin,
        pathname,
        search,
        hash,
        replace(value) { replaced = value; },
      },
    },
    document: { cookie: '', querySelector: () => ({ content: '../' }) },
    Headers,
    FormData,
    URL,
    Set,
    fetch: async () => { throw new Error('unexpected API request'); },
  };
  vm.createContext(pageContext);
  vm.runInContext(apiClientSource, pageContext, { filename: 'api-client.js' });
  return { context: pageContext, api: pageContext.window.TimetableApi, replaced: () => replaced };
}

for (const [pathname, search, hash, expected] of [
  ['/class-timetable/app/', '?schedule=123', '', 'https://class-timetable.wangaoqi23.workers.dev/app/?schedule=123'],
  ['/class-timetable/import/', '', '#share-token', 'https://class-timetable.wangaoqi23.workers.dev/import/#share-token'],
  ['/class-timetable/login/', '?mode=register', '#next=app%2F', 'https://class-timetable.wangaoqi23.workers.dev/login/?mode=register#next=app%2F'],
]) {
  const page = loadApiAt(pathname, search, hash);
  assert.equal(page.api.redirectAccountPageToPrimary(), true);
  assert.equal(page.replaced(), expected, 'account routes should move from GitHub Pages to the primary app');
}

const outsideMirror = loadApiAt('/class-timetable-evil/app/');
assert.equal(outsideMirror.api.isGitHubPagesMirror(), false, 'similar path prefixes must not be treated as this project');
assert.equal(outsideMirror.api.redirectAccountPageToPrimary(), false);
assert.equal(outsideMirror.replaced(), '');

const nestedPath = loadApiAt('/class-timetable/app//evil');
assert.equal(nestedPath.api.redirectAccountPageToPrimary(), true);
assert.equal(new URL(nestedPath.replaced()).origin, 'https://class-timetable.wangaoqi23.workers.dev', 'redirect paths must not change the trusted Worker origin');
assert.equal(new URL(nestedPath.api.primaryAppUrl('//evil')).origin, 'https://class-timetable.wangaoqi23.workers.dev');

const mirrorRoot = loadApiAt('/class-timetable/');
const mirrorAccountLink = {};
let mirrorRequestCount = 0;
mirrorRoot.context.document.querySelector = (selector) => selector === '#account-link' ? mirrorAccountLink : null;
mirrorRoot.context.window.TimetableApi.request = async () => { mirrorRequestCount += 1; };
vm.runInContext(sessionRedirectSource, mirrorRoot.context, { filename: 'session-redirect.js' });
assert.equal(mirrorRoot.replaced(), '', 'the public GitHub timetable should remain visible');
assert.equal(mirrorRequestCount, 0, 'the GitHub mirror must not call an API that only exists on the Worker');
assert.equal(mirrorAccountLink.href, 'https://class-timetable.wangaoqi23.workers.dev/login/');

const workerPage = loadApiAt('/class-timetable/app/');
workerPage.context.window.location.origin = 'https://class-timetable.wangaoqi23.workers.dev';
assert.equal(workerPage.api.isGitHubPagesMirror(), false);
assert.equal(workerPage.api.redirectAccountPageToPrimary(), false, 'the primary app must keep using its same-origin API');

apiContext.fetch = async () => ({
  status: 409,
  ok: false,
  headers: { get: () => 'application/json' },
  json: async () => ({ error: { code: 'schedule_name_taken', message: '课表名称已存在。' } }),
});
await assert.rejects(
  apiContext.window.TimetableApi.request('/api/schedules', { method: 'POST', body: '{}' }),
  (error) => error.status === 409 && error.message === '课表名称已存在。',
  'nested API errors should display their message instead of [object Object]',
);

assert.equal(utils.validateSchedule(schedule), null, 'sample schedule should pass validation');
assert.deepEqual(
  schedule.periods.map(({ start, end }) => `${start}-${end}`),
  ['08:30-09:15', '09:15-10:00', '10:20-11:05', '11:05-11:50', '13:00-13:45', '13:45-14:30', '14:50-15:35', '15:35-16:20', '18:00-18:45', '18:45-19:30'],
  'period times should match the ten-period school day',
);
assert.ok(schedule.classes.length >= 1, 'schedule should include at least one class');
assert.ok(Array.isArray(schedule.lessons), 'schedule lessons should be an array');
assert.ok(Array.isArray(utils.visibleLessons(schedule, schedule.classes[0].id, 5)), 'class/week filtering should return a list');
assert.equal(utils.weekDates(schedule, 1).length, 7, 'a week should expose seven dates');

assert.match(indexHtml, /assets\/shared\.js/);
assert.match(indexHtml, /assets\/app\.js/);
assert.match(indexHtml, /id="account-link"/);
assert.match(indexHtml, /href="https:\/\/class-timetable\.wangaoqi23\.workers\.dev\/login\/"/);
assert.match(indexHtml, /assets\/api-client\.js/);
assert.match(indexHtml, /assets\/session-redirect\.js/);
assert.match(indexHtml, /Content-Security-Policy/);
assert.match(adminHtml, /\.\.\/assets\/admin\.js/);
assert.match(adminHtml, /https:\/\/api\.github\.com/);
assert.match(adminHtml, /scopes=public_repo/);
assert.match(adminHtml, /ghp_/);
assert.match(adminSource, /sessionStorage\.setItem\('timetable_github_pat'/);
assert.doesNotMatch(adminSource, /localStorage\.setItem\('timetable_github_pat'/);
assert.doesNotMatch(appSource, /innerHTML\s*=/, 'public renderer should not inject schedule text as HTML');
assert.match(apiClientSource, /credentials:\s*'same-origin'/, 'API requests should send same-origin cookies');
assert.match(apiClientSource, /X-CSRF-Token/);
assert.match(apiClientSource, /document\.cookie/);
assert.match(apiClientSource, /\/api\//);
assert.doesNotMatch(apiClientSource, /localStorage|sessionStorage|Authorization|Bearer|API_BASE_URL/);
assert.match(authSource, /\/api\/auth\/me/);
assert.match(authSource, /redirectAccountPageToPrimary\(\)/);
assert.match(authSource, /window\.location\.hash\.slice\(1\)/);
assert.doesNotMatch(authSource, /query\.get\('next'\)/);
assert.doesNotMatch(authSource, /accessToken|setSession|getToken/);
assert.match(sessionRedirectSource, /\/api\/auth\/me/);
assert.match(sessionRedirectSource, /accountLink\.textContent\s*=\s*'我的课表'/);
assert.doesNotMatch(sessionRedirectSource, /location\.replace/, 'signed-in users should still be able to view the public timetable');
assert.match(workspaceSource, /\/api\/auth\/me/);
assert.match(workspaceSource, /redirectAccountPageToPrimary\(\)/);
assert.match(workspaceSource, /updateScheduleUrl\(record\.id\)/);
assert.match(workspaceSource, /请先保存当前更改，再创建分享链接/);
assert.match(workspaceSource, /share\.shareUrl/);
assert.match(workspaceSource, /link\.origin\s*!==\s*window\.location\.origin/);
assert.doesNotMatch(workspaceSource, /link\.hash\s*=\s*encodeURIComponent\(share\.id\)/);
assert.doesNotMatch(workspaceSource, /getToken|clearSession|Authorization|Bearer/);
assert.match(loginHtml, /assets\/api-client\.js/);
assert.doesNotMatch(loginHtml, /id="auth-username"[^>]*\spattern=/, 'browser username rules should defer to the Unicode-aware API validator');
assert.match(loginHtml, /href="https:\/\/wangaoqi23\.github\.io\/class-timetable\/"/);
assert.match(workspaceHtml, /assets\/workspace\.js/);
assert.match(workspaceHtml, /href="https:\/\/wangaoqi23\.github\.io\/class-timetable\/"/);
assert.match(importHtml, /assets\/import\.js/);
assert.match(importHtml, /href="https:\/\/wangaoqi23\.github\.io\/class-timetable\/"/);
assert.match(importHtml, /meta name="app-root" content="\.\.\/"/);
assert.match(importSource, /\/api\/shares\/preview/);
assert.match(importSource, /\/api\/shares\/import/);
assert.doesNotMatch(importSource, /encodeURIComponent\(state\.shareId\)/, 'share bearer tokens must not be placed in API URLs');
assert.doesNotMatch(importSource, /location\.search[^\n]*share|searchParams[^\n]*share/i, 'share bearer tokens must only be read from the URL fragment');
assert.match(importSource, /redirectAccountPageToPrimary\(\)/);
assert.match(importSource, /\/import'/);
assert.match(importSource, /Api\.loginUrl\(\)/);
assert.doesNotMatch(importSource, /innerHTML\s*=/, 'share preview should not inject schedule text as HTML');
assert.match(stylesSource, /\.import-day-list/);
assert.match(stylesSource, /\.workspace-shell/);
assert.match(stylesSource, /@media \(max-width: 680px\)/);

for (const [source, html, label] of [
  [workspaceSource, workspaceHtml, 'workspace'],
  [importSource, importHtml, 'import'],
]) {
  for (const match of source.matchAll(/byId\('([^']+)'\)/g)) {
    assert.match(html, new RegExp(`id=["']${match[1]}["']`), `${label} page should include #${match[1]}`);
  }
}
assert.match(workflow, /actions\/configure-pages@v5/);
assert.match(workflow, /actions\/upload-pages-artifact@v4/);
assert.match(workflow, /actions\/deploy-pages@v4/);
assert.match(workflow, /path: github-pages/);

console.log('GitHub Pages checks passed: data, account cookies, CSRF, sharing, responsive pages, CSP, and deployment workflow.');
