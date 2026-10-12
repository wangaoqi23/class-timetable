import test from 'node:test';
import assert from 'node:assert/strict';

import {
  adminPasswordInput,
  adminSetupInput,
  faceShareCodeInput,
  faceShareInput,
  isAllowedOrigin,
} from '../src/index.js';
import {
  constantTimeEqual,
  createPasswordRecord,
  randomToken,
  sha256Base64Url,
  verifyPassword,
} from '../src/security.js';
import { InputError, normalizeUsername, validateScheduleData } from '../src/validation.js';

function validSchedule() {
  return {
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
}

function lesson(overrides = {}) {
  return {
    id: 'lesson-1',
    classId: 'class-1',
    name: '设计基础',
    teacher: '王老师',
    room: 'C1-608',
    day: 0,
    start: 0,
    end: 1,
    from: 1,
    to: 18,
    parity: 'all',
    color: 'blue',
    ...overrides,
  };
}

test('normalizes Unicode usernames and preserves display spelling', () => {
  assert.deepEqual(normalizeUsername('  学生A_01  '), {
    username: '学生A_01',
    usernameKey: '学生a_01',
  });
  assert.deepEqual(normalizeUsername('  Student.Name-01  '), {
    username: 'Student.Name-01',
    usernameKey: 'student.name-01',
  });
});

test('accepts a valid timetable and returns a detached normalized copy', () => {
  const input = validSchedule();
  const result = validateScheduleData(input);
  assert.deepEqual(result, input);
  assert.notEqual(result, input);
});

test('allows odd and even lessons in the same slot', () => {
  const input = validSchedule();
  input.lessons = [
    lesson({ id: 'odd', parity: 'odd' }),
    lesson({ id: 'even', name: '色彩基础', parity: 'even' }),
  ];
  assert.doesNotThrow(() => validateScheduleData(input));
});

test('rejects an actual lesson conflict', () => {
  const input = validSchedule();
  input.lessons = [lesson(), lesson({ id: 'lesson-2', name: '色彩基础', start: 1, end: 1 })];
  assert.throws(
    () => validateScheduleData(input),
    (error) => error instanceof InputError && error.code === 'lesson_conflict',
  );
});

test('rejects overlapping periods and non-Monday semester starts', () => {
  const overlapping = validSchedule();
  overlapping.periods[1].start = '09:00';
  assert.throws(
    () => validateScheduleData(overlapping),
    (error) => error instanceof InputError && error.code === 'period_conflict',
  );

  const wrongDay = validSchedule();
  wrongDay.startDate = '2026-09-08';
  assert.throws(() => validateScheduleData(wrongDay), /Monday/);
});

test('PBKDF2 password records verify without storing plaintext', async () => {
  const record = await createPasswordRecord('正确马电池订书钉8', 100_000);
  assert.equal(await verifyPassword('正确马电池订书钉8', record), true);
  assert.equal(await verifyPassword('错误密码123456', record), false);
  assert.equal(record.hash.includes('正确'), false);
  assert.equal(record.salt.includes('正确'), false);
});

test('opaque tokens are random and are represented in storage by a digest', async () => {
  const first = randomToken(32);
  const second = randomToken(32);
  assert.notEqual(first, second);
  const digest = await sha256Base64Url(first);
  assert.notEqual(digest, first);
  assert.equal(digest.length, 43);
  assert.equal(constantTimeEqual(digest, await sha256Base64Url(first)), true);
  assert.equal(constantTimeEqual(digest, await sha256Base64Url(second)), false);
});

test('CORS origin checks are exact and localhost needs an explicit development flag', () => {
  const requestUrl = 'https://api.example.workers.dev/api/health';
  assert.equal(isAllowedOrigin('https://wangaoqi23.github.io', requestUrl), true);
  assert.equal(isAllowedOrigin('https://api.example.workers.dev', requestUrl), true);
  assert.equal(isAllowedOrigin('http://localhost:5173', requestUrl), false);
  assert.equal(isAllowedOrigin('http://localhost:5173', requestUrl, { ALLOW_LOCALHOST_ORIGIN: 'true' }), true);
  assert.equal(isAllowedOrigin('http://localhost:5173', requestUrl, { ALLOW_LOCALHOST_ORIGIN: 'false' }), false);
  assert.equal(isAllowedOrigin('https://wangaoqi23.github.io.attacker.example', requestUrl), false);
  assert.equal(isAllowedOrigin('http://127.0.0.1:5173', requestUrl), false);
});

test('face-to-face shares require a six digit code and bounded encoded payload', () => {
  const input = { code: '012345', token: `z.${'A'.repeat(40)}` };
  assert.deepEqual(faceShareInput(input), input);
  assert.equal(faceShareCodeInput({ code: '012345' }), '012345');
  assert.throws(() => faceShareInput({ code: '12345', token: input.token }), /6 digits/);
  assert.throws(() => faceShareInput({ code: '123456', token: 'bad token' }), /payload/);
  assert.throws(() => faceShareCodeInput({ code: 'abcdef' }), /6 digits/);
});

test('administrator setup requires a strong one-time setup key and password', () => {
  assert.equal(adminPasswordInput({ password: '管理员密码123' }), '管理员密码123');
  assert.deepEqual(adminSetupInput({ password: '管理员密码123', setupKey: 'OWNER-ABCD1234' }), {
    password: '管理员密码123',
    setupKey: 'OWNER-ABCD1234',
  });
  assert.throws(() => adminPasswordInput({ password: 'short' }), /8 to 128/);
  assert.throws(() => adminSetupInput({ password: '管理员密码123', setupKey: 'short' }), /setup key/);
});
