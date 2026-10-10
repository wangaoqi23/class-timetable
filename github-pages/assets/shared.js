(function () {
  'use strict';

  const DAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
  const COLORS = ['blue', 'violet', 'orange', 'teal', 'rose'];
  const PARITY_LABELS = { all: '每周', odd: '单周', even: '双周' };

  function chinaToday() {
    return new Intl.DateTimeFormat('sv-SE', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
  }

  function currentWeek(schedule) {
    const today = Date.parse(`${chinaToday()}T00:00:00Z`);
    const start = Date.parse(`${schedule.startDate}T00:00:00Z`);
    return Math.floor((today - start) / 604800000) + 1;
  }

  function weekDates(schedule, week) {
    const start = Date.parse(`${schedule.startDate}T00:00:00Z`);
    return DAYS.map((_, day) => {
      const date = new Date(start + ((week - 1) * 7 + day) * 86400000);
      return `${date.getUTCMonth() + 1}/${date.getUTCDate()}`;
    });
  }

  function visibleLessons(schedule, classId, week) {
    return schedule.lessons.filter((lesson) => {
      if (lesson.classId !== classId || week < lesson.from || week > lesson.to) return false;
      if (lesson.parity === 'odd') return week % 2 === 1;
      if (lesson.parity === 'even') return week % 2 === 0;
      return true;
    });
  }

  function cleanString(value, max) {
    return typeof value === 'string' ? value.trim().slice(0, max) : '';
  }

  function validateSchedule(input) {
    if (!input || typeof input !== 'object') return '课表数据格式无效。';
    const schedule = input;
    if (!cleanString(schedule.title, 24)) return '请填写网站名称。';
    if (!cleanString(schedule.term, 80)) return '请填写学期名称。';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(schedule.startDate || '')) return '请填写有效的学期开始日期。';
    const startDate = new Date(`${schedule.startDate}T00:00:00Z`);
    if (Number.isNaN(startDate.getTime()) || startDate.toISOString().slice(0, 10) !== schedule.startDate || startDate.getUTCDay() !== 1) {
      return '学期开始日期必须是有效的周一。';
    }
    if (!Number.isInteger(schedule.weeks) || schedule.weeks < 1 || schedule.weeks > 30) return '教学周数必须在 1 到 30 之间。';
    if (!Array.isArray(schedule.periods) || schedule.periods.length < 1 || schedule.periods.length > 16) return '节次数量必须在 1 到 16 之间。';
    const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;
    for (let index = 0; index < schedule.periods.length; index += 1) {
      const period = schedule.periods[index];
      if (!cleanString(period.name, 20) || !timePattern.test(period.start || '') || !timePattern.test(period.end || '')) return `第 ${index + 1} 节的名称或时间无效。`;
      if (period.start >= period.end || (index > 0 && period.start < schedule.periods[index - 1].end)) return '节次时间应按顺序排列，且结束时间晚于开始时间。';
    }
    if (!Array.isArray(schedule.classes) || schedule.classes.length < 1 || schedule.classes.length > 30) return '班级数量必须在 1 到 30 之间。';
    const classIds = new Set();
    const classNames = new Set();
    for (const schoolClass of schedule.classes) {
      const id = cleanString(schoolClass.id, 80);
      const name = cleanString(schoolClass.name, 40);
      if (!id || !name) return '每个班级都必须有名称和编号。';
      if (classIds.has(id) || classNames.has(name)) return '班级名称或编号重复。';
      classIds.add(id);
      classNames.add(name);
    }
    if (!Array.isArray(schedule.lessons) || schedule.lessons.length > 500) return '课程数量不能超过 500 门次。';
    const lessonIds = new Set();
    const occupied = new Map();
    for (const lesson of schedule.lessons) {
      if (!cleanString(lesson.id, 80) || lessonIds.has(lesson.id)) return '课程编号为空或重复。';
      lessonIds.add(lesson.id);
      if (!classIds.has(lesson.classId) || !cleanString(lesson.name, 60)) return '课程的班级或名称无效。';
      if (!Number.isInteger(lesson.day) || lesson.day < 0 || lesson.day > 6) return `课程“${lesson.name}”的星期无效。`;
      if (!Number.isInteger(lesson.start) || !Number.isInteger(lesson.end) || lesson.start < 0 || lesson.end < lesson.start || lesson.end >= schedule.periods.length) return `课程“${lesson.name}”的节次无效。`;
      if (!Number.isInteger(lesson.from) || !Number.isInteger(lesson.to) || lesson.from < 1 || lesson.from > lesson.to || lesson.to > schedule.weeks) return `课程“${lesson.name}”的教学周无效。`;
      if (!['all', 'odd', 'even'].includes(lesson.parity) || !COLORS.includes(lesson.color)) return `课程“${lesson.name}”的周次规则或颜色无效。`;
      for (let week = lesson.from; week <= lesson.to; week += 1) {
        if ((lesson.parity === 'odd' && week % 2 === 0) || (lesson.parity === 'even' && week % 2 === 1)) continue;
        for (let period = lesson.start; period <= lesson.end; period += 1) {
          const key = `${lesson.classId}:${week}:${lesson.day}:${period}`;
          if (occupied.has(key)) return `课程“${lesson.name}”与“${occupied.get(key)}”在第 ${week} 周时间重叠。`;
          occupied.set(key, lesson.name);
        }
      }
    }
    return null;
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function makeId(prefix) {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  window.ScheduleUtils = {
    DAYS,
    COLORS,
    PARITY_LABELS,
    currentWeek,
    weekDates,
    visibleLessons,
    validateSchedule,
    clone,
    makeId,
  };
})();
