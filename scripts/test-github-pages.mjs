import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { webcrypto } from 'node:crypto';
import vm from 'node:vm';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const [sharedSource, appSource, adminSource, indexHtml, adminHtml, dataSource, workflow] = await Promise.all([
  read('github-pages/assets/shared.js'),
  read('github-pages/assets/app.js'),
  read('github-pages/assets/admin.js'),
  read('github-pages/index.html'),
  read('github-pages/admin/index.html'),
  read('github-pages/data/schedule.json'),
  read('.github/workflows/deploy-pages.yml'),
]);

const context = { window: {}, Intl, Date, crypto: webcrypto };
vm.createContext(context);
vm.runInContext(sharedSource, context, { filename: 'shared.js' });
const utils = context.window.ScheduleUtils;
const schedule = JSON.parse(dataSource);

assert.equal(utils.validateSchedule(schedule), null, 'sample schedule should pass validation');
assert.equal(schedule.classes.length, 3, 'sample should include three classes');
assert.equal(schedule.lessons.length, 27, 'sample should preserve twenty-seven lessons');
assert.equal(utils.visibleLessons(schedule, 'cs-01', 5).length, 9, 'class/week filtering should return its lessons');
assert.equal(utils.weekDates(schedule, 1).length, 7, 'a week should expose seven dates');

assert.match(indexHtml, /assets\/shared\.js/);
assert.match(indexHtml, /assets\/app\.js/);
assert.match(indexHtml, /Content-Security-Policy/);
assert.match(adminHtml, /\.\.\/assets\/admin\.js/);
assert.match(adminHtml, /https:\/\/api\.github\.com/);
assert.match(adminHtml, /scopes=public_repo/);
assert.match(adminHtml, /ghp_/);
assert.match(adminSource, /sessionStorage\.setItem\('timetable_github_pat'/);
assert.doesNotMatch(adminSource, /localStorage\.setItem\('timetable_github_pat'/);
assert.doesNotMatch(appSource, /innerHTML\s*=/, 'public renderer should not inject schedule text as HTML');
assert.match(workflow, /actions\/configure-pages@v5/);
assert.match(workflow, /actions\/upload-pages-artifact@v4/);
assert.match(workflow, /actions\/deploy-pages@v4/);
assert.match(workflow, /path: github-pages/);

console.log('GitHub Pages checks passed: data, paths, token storage, CSP, and deployment workflow.');
