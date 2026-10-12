import { COLORS, PARITIES } from './constants.js';

export class InputError extends Error {
  constructor(message, field, code = 'invalid_input') {
    super(message);
    this.name = 'InputError';
    this.field = field;
    this.code = code;
  }
}

function fail(message, field, code) {
  throw new InputError(message, field, code);
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function object(value, field) {
  if (!isPlainObject(value)) fail(`${field} must be an object`, field);
  return value;
}

function onlyKeys(value, keys, field) {
  const allowed = new Set(keys);
  const unknown = Object.keys(value).find((key) => !allowed.has(key));
  if (unknown) fail(`${field}.${unknown} is not supported`, `${field}.${unknown}`);
}

function string(value, field, { min = 0, max, pattern, allowControl = false } = {}) {
  if (typeof value !== 'string') fail(`${field} must be a string`, field);
  const normalized = value.trim();
  const length = Array.from(normalized).length;
  if (length < min || (max !== undefined && length > max)) {
    fail(`${field} must contain ${min}-${max ?? '∞'} characters`, field);
  }
  if (!allowControl && /[\u0000-\u001f\u007f]/.test(normalized)) {
    fail(`${field} contains control characters`, field);
  }
  if (pattern && !pattern.test(normalized)) fail(`${field} has an invalid format`, field);
  return normalized;
}

function integer(value, field, min, max) {
  if (!Number.isInteger(value) || value < min || value > max) {
    fail(`${field} must be an integer from ${min} to ${max}`, field);
  }
  return value;
}

function canonical(value) {
  return value.normalize('NFKC').toLocaleLowerCase('und');
}

export function normalizeUsername(value) {
  if (typeof value !== 'string') fail('username must be a string', 'username');
  const username = value.trim().normalize('NFKC');
  const length = Array.from(username).length;
  if (length < 3 || length > 32) fail('username must contain 3-32 characters', 'username');
  if (!/^[\p{L}\p{N}][\p{L}\p{N}._-]*$/u.test(username)) {
    fail('username may contain letters, numbers, dot, underscore, and hyphen', 'username');
  }
  return { username, usernameKey: canonical(username) };
}

export function validatePassword(value) {
  if (typeof value !== 'string') fail('password must be a string', 'password');
  const length = Array.from(value).length;
  const byteLength = new TextEncoder().encode(value).byteLength;
  if (length < 8 || length > 128 || byteLength > 256 || value.includes('\0')) {
    fail('password must contain 8-128 characters and at most 256 UTF-8 bytes', 'password');
  }
  return value;
}

export function validateCredentials(value) {
  const input = object(value, 'body');
  onlyKeys(input, ['username', 'password'], 'body');
  const { username, usernameKey } = normalizeUsername(input.username);
  return { username, usernameKey, password: validatePassword(input.password) };
}

export function validateScheduleName(value) {
  return string(value, 'name', { min: 1, max: 60 });
}

const idPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;
const shareTokenPattern = /^[A-Za-z0-9_-]{43}$/;

function validateDate(value) {
  const startDate = string(value, 'data.startDate', { min: 10, max: 10, pattern: datePattern });
  const parsed = new Date(`${startDate}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== startDate) {
    fail('data.startDate must be a real calendar date', 'data.startDate');
  }
  if (parsed.getUTCDay() !== 1) fail('data.startDate must be a Monday', 'data.startDate');
  return startDate;
}

function lessonAppliesInWeek(lesson, week) {
  if (week < lesson.from || week > lesson.to) return false;
  if (lesson.parity === 'odd') return week % 2 === 1;
  if (lesson.parity === 'even') return week % 2 === 0;
  return true;
}

export function validateScheduleData(value) {
  const input = object(value, 'data');
  onlyKeys(input, ['title', 'term', 'startDate', 'weeks', 'periods', 'classes', 'lessons', 'demo'], 'data');

  const schedule = {
    title: string(input.title, 'data.title', { min: 1, max: 24 }),
    term: string(input.term, 'data.term', { min: 1, max: 80 }),
    startDate: validateDate(input.startDate),
    weeks: integer(input.weeks, 'data.weeks', 1, 30),
    periods: [],
    classes: [],
    lessons: [],
    demo: input.demo === undefined ? false : input.demo,
  };
  if (typeof schedule.demo !== 'boolean') fail('data.demo must be a boolean', 'data.demo');

  if (!Array.isArray(input.periods) || input.periods.length < 1 || input.periods.length > 16) {
    fail('data.periods must contain 1-16 periods', 'data.periods');
  }
  const periods = [];
  for (let index = 0; index < input.periods.length; index += 1) {
    const rawPeriod = input.periods[index];
    const field = `data.periods[${index}]`;
    const period = object(rawPeriod, field);
    onlyKeys(period, ['name', 'start', 'end'], field);
    const normalized = {
      name: string(period.name, `${field}.name`, { min: 1, max: 20 }),
      start: string(period.start, `${field}.start`, { min: 5, max: 5, pattern: timePattern }),
      end: string(period.end, `${field}.end`, { min: 5, max: 5, pattern: timePattern }),
    };
    if (normalized.start >= normalized.end) fail('period end time must be after start time', field);
    if (index > 0 && normalized.start < periods[index - 1].end) {
      fail('periods must be chronological and may not overlap', field, 'period_conflict');
    }
    periods.push(normalized);
  }
  schedule.periods = periods;

  if (!Array.isArray(input.classes) || input.classes.length < 1 || input.classes.length > 30) {
    fail('data.classes must contain 1-30 classes', 'data.classes');
  }
  const classIds = new Set();
  const classNames = new Set();
  schedule.classes = input.classes.map((rawClass, index) => {
    const field = `data.classes[${index}]`;
    const schoolClass = object(rawClass, field);
    onlyKeys(schoolClass, ['id', 'name', 'note'], field);
    const normalized = {
      id: string(schoolClass.id, `${field}.id`, { min: 1, max: 80, pattern: idPattern }),
      name: string(schoolClass.name, `${field}.name`, { min: 1, max: 40 }),
      note: string(schoolClass.note ?? '', `${field}.note`, { max: 80 }),
    };
    const nameKey = canonical(normalized.name);
    if (classIds.has(normalized.id) || classNames.has(nameKey)) {
      fail('class IDs and names must be unique', field, 'duplicate_class');
    }
    classIds.add(normalized.id);
    classNames.add(nameKey);
    return normalized;
  });

  if (!Array.isArray(input.lessons) || input.lessons.length > 500) {
    fail('data.lessons must contain at most 500 lessons', 'data.lessons');
  }
  const lessonIds = new Set();
  schedule.lessons = input.lessons.map((rawLesson, index) => {
    const field = `data.lessons[${index}]`;
    const lesson = object(rawLesson, field);
    onlyKeys(
      lesson,
      ['id', 'classId', 'name', 'teacher', 'room', 'day', 'start', 'end', 'from', 'to', 'parity', 'color'],
      field,
    );
    const normalized = {
      id: string(lesson.id, `${field}.id`, { min: 1, max: 80, pattern: idPattern }),
      classId: string(lesson.classId, `${field}.classId`, { min: 1, max: 80, pattern: idPattern }),
      name: string(lesson.name, `${field}.name`, { min: 1, max: 60 }),
      teacher: string(lesson.teacher ?? '', `${field}.teacher`, { max: 60 }),
      room: string(lesson.room ?? '', `${field}.room`, { max: 80 }),
      day: integer(lesson.day, `${field}.day`, 0, 6),
      start: integer(lesson.start, `${field}.start`, 0, schedule.periods.length - 1),
      end: integer(lesson.end, `${field}.end`, 0, schedule.periods.length - 1),
      from: integer(lesson.from, `${field}.from`, 1, schedule.weeks),
      to: integer(lesson.to, `${field}.to`, 1, schedule.weeks),
      parity: lesson.parity,
      color: lesson.color,
    };
    if (lessonIds.has(normalized.id)) fail('lesson IDs must be unique', `${field}.id`, 'duplicate_lesson');
    lessonIds.add(normalized.id);
    if (!classIds.has(normalized.classId)) fail('lesson references an unknown class', `${field}.classId`);
    if (normalized.end < normalized.start) fail('lesson end period must not precede start period', field);
    if (normalized.to < normalized.from) fail('lesson ending week must not precede starting week', field);
    if (!PARITIES.includes(normalized.parity)) fail('lesson parity is invalid', `${field}.parity`);
    if (!COLORS.includes(normalized.color)) fail('lesson color is invalid', `${field}.color`);
    if (
      normalized.from === normalized.to &&
      ((normalized.parity === 'odd' && normalized.from % 2 === 0) ||
        (normalized.parity === 'even' && normalized.from % 2 === 1))
    ) {
      fail('lesson parity excludes its only teaching week', field);
    }
    return normalized;
  });

  const occupied = new Map();
  for (const lesson of schedule.lessons) {
    for (let week = lesson.from; week <= lesson.to; week += 1) {
      if (!lessonAppliesInWeek(lesson, week)) continue;
      for (let period = lesson.start; period <= lesson.end; period += 1) {
        const slot = `${lesson.classId}:${week}:${lesson.day}:${period}`;
        const previous = occupied.get(slot);
        if (previous) {
          fail(
            `lesson "${lesson.name}" conflicts with "${previous}" in week ${week}`,
            'data.lessons',
            'lesson_conflict',
          );
        }
        occupied.set(slot, lesson.name);
      }
    }
  }
  return schedule;
}

export function validateScheduleWrite(value, { requireVersion = false } = {}) {
  const input = object(value, 'body');
  onlyKeys(input, requireVersion ? ['name', 'data', 'version'] : ['name', 'data'], 'body');
  const result = { name: validateScheduleName(input.name), data: validateScheduleData(input.data) };
  if (requireVersion) result.version = integer(input.version, 'version', 1, Number.MAX_SAFE_INTEGER);
  return result;
}

export function validateShareOptions(value) {
  if (value === undefined || value === null) return { expiresInDays: null };
  const input = object(value, 'body');
  onlyKeys(input, ['expiresInDays'], 'body');
  if (input.expiresInDays === undefined || input.expiresInDays === null) return { expiresInDays: null };
  return { expiresInDays: integer(input.expiresInDays, 'expiresInDays', 1, 365) };
}

export function validateSharePreview(value) {
  const input = object(value, 'body');
  onlyKeys(input, ['token'], 'body');
  return { token: string(input.token, 'token', { min: 43, max: 43, pattern: shareTokenPattern }) };
}

export function validateShareImport(value) {
  const input = object(value, 'body');
  onlyKeys(input, ['token', 'name'], 'body');
  return {
    token: string(input.token, 'token', { min: 43, max: 43, pattern: shareTokenPattern }),
    name: input.name === undefined || input.name === null ? null : validateScheduleName(input.name),
  };
}
