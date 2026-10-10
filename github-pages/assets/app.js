(function () {
  'use strict';

  const U = window.ScheduleUtils;
  const state = { schedule: null, classId: '', week: 1 };
  const elements = {
    brandTitle: document.querySelector('#brand-title'),
    pageTitle: document.querySelector('#page-title'),
    classNote: document.querySelector('#class-note'),
    classSelect: document.querySelector('#class-select'),
    weekSelect: document.querySelector('#week-select'),
    previousWeek: document.querySelector('#previous-week'),
    nextWeek: document.querySelector('#next-week'),
    currentWeek: document.querySelector('#current-week'),
    demoNotice: document.querySelector('#demo-notice'),
    error: document.querySelector('#error'),
    errorText: document.querySelector('#error-text'),
    retry: document.querySelector('#retry'),
    scheduleSection: document.querySelector('#schedule-section'),
    weekNumber: document.querySelector('#week-number'),
    thisWeekBadge: document.querySelector('#this-week-badge'),
    termLabel: document.querySelector('#term-label'),
    courseCount: document.querySelector('#course-count'),
    timetable: document.querySelector('#timetable'),
    mobileSchedule: document.querySelector('#mobile-schedule'),
    emptyState: document.querySelector('#empty-state'),
    updatedAt: document.querySelector('#updated-at'),
    lessonDialog: document.querySelector('#lesson-dialog'),
    detailName: document.querySelector('#detail-name'),
    detailClass: document.querySelector('#detail-class'),
    detailList: document.querySelector('#detail-list'),
  };

  function option(value, label) {
    const item = document.createElement('option');
    item.value = String(value);
    item.textContent = label;
    return item;
  }

  function appendTextRow(list, label, value) {
    const term = document.createElement('dt');
    term.textContent = label;
    const detail = document.createElement('dd');
    detail.textContent = value;
    list.append(term, detail);
  }

  function lessonButton(lesson, grid) {
    const schedule = state.schedule;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `lesson ${U.COLORS.includes(lesson.color) ? lesson.color : 'blue'}`;
    if (grid) {
      button.style.gridColumn = String(lesson.day + 2);
      button.style.gridRow = `${lesson.start + 2} / ${lesson.end + 3}`;
    }
    const name = document.createElement('strong');
    name.textContent = lesson.name;
    const teacher = document.createElement('span');
    teacher.textContent = lesson.teacher || '教师待安排';
    const room = document.createElement('span');
    room.textContent = lesson.room || '地点待安排';
    const week = document.createElement('span');
    week.className = 'lesson-week';
    week.textContent = `第 ${lesson.start + 1}–${lesson.end + 1} 节 · ${lesson.from}–${lesson.to} 周${lesson.parity === 'all' ? '' : ` · ${U.PARITY_LABELS[lesson.parity]}`}`;
    button.append(name, teacher, room, week);
    button.setAttribute('aria-label', `${lesson.name}，${U.DAYS[lesson.day]}，第 ${lesson.start + 1} 至 ${lesson.end + 1} 节`);
    button.addEventListener('click', () => showLesson(lesson, schedule));
    return button;
  }

  function showLesson(lesson, schedule) {
    const schoolClass = schedule.classes.find((item) => item.id === lesson.classId);
    elements.detailName.textContent = lesson.name;
    elements.detailClass.textContent = schoolClass ? schoolClass.name : '';
    elements.detailList.replaceChildren();
    appendTextRow(elements.detailList, '任课教师', lesson.teacher || '待安排');
    appendTextRow(elements.detailList, '上课地点', lesson.room || '待安排');
    appendTextRow(elements.detailList, '上课时间', `${U.DAYS[lesson.day]} 第 ${lesson.start + 1}–${lesson.end + 1} 节（${schedule.periods[lesson.start].start}–${schedule.periods[lesson.end].end}）`);
    appendTextRow(elements.detailList, '教学周', `第 ${lesson.from}–${lesson.to} 周${lesson.parity === 'all' ? '' : `（${U.PARITY_LABELS[lesson.parity]}）`}`);
    elements.lessonDialog.showModal();
  }

  function render() {
    const schedule = state.schedule;
    if (!schedule) return;
    const schoolClass = schedule.classes.find((item) => item.id === state.classId) || schedule.classes[0];
    state.classId = schoolClass.id;
    state.week = Math.max(1, Math.min(schedule.weeks, state.week));
    const realWeek = U.currentWeek(schedule);
    const dates = U.weekDates(schedule, state.week);
    const lessons = U.visibleLessons(schedule, state.classId, state.week).sort((a, b) => a.day - b.day || a.start - b.start);

    document.title = `${schoolClass.name} · ${schedule.title}`;
    elements.brandTitle.textContent = schedule.title;
    elements.pageTitle.textContent = `${schoolClass.name}的课表`;
    elements.classNote.textContent = `${schoolClass.note ? `${schoolClass.note} · ` : ''}按周查看课程安排`;
    elements.classSelect.value = state.classId;
    elements.weekSelect.value = String(state.week);
    elements.previousWeek.disabled = state.week <= 1;
    elements.nextWeek.disabled = state.week >= schedule.weeks;
    elements.weekNumber.textContent = `第 ${state.week} 周`;
    elements.thisWeekBadge.hidden = state.week !== realWeek;
    elements.termLabel.textContent = schedule.term;
    elements.courseCount.textContent = `本周 ${lessons.length} 门次课程`;
    elements.demoNotice.hidden = !schedule.demo;
    elements.emptyState.hidden = lessons.length !== 0;

    elements.timetable.replaceChildren();
    elements.timetable.style.gridTemplateRows = `66px repeat(${schedule.periods.length}, 92px)`;
    const corner = document.createElement('div');
    corner.className = 'day-head';
    corner.textContent = '节次';
    elements.timetable.append(corner);
    U.DAYS.forEach((day, index) => {
      const head = document.createElement('div');
      head.className = 'day-head';
      head.textContent = day;
      const date = document.createElement('span');
      date.textContent = dates[index];
      head.append(date);
      elements.timetable.append(head);
    });
    schedule.periods.forEach((period, periodIndex) => {
      const periodCell = document.createElement('div');
      periodCell.className = 'period';
      periodCell.style.gridColumn = '1';
      periodCell.style.gridRow = String(periodIndex + 2);
      periodCell.textContent = period.name;
      const start = document.createElement('small');
      start.textContent = period.start;
      const end = document.createElement('small');
      end.textContent = period.end;
      periodCell.append(start, end);
      elements.timetable.append(periodCell);
      U.DAYS.forEach((_, dayIndex) => {
        const cell = document.createElement('div');
        cell.className = 'empty-cell';
        cell.style.gridColumn = String(dayIndex + 2);
        cell.style.gridRow = String(periodIndex + 2);
        elements.timetable.append(cell);
      });
    });
    lessons.forEach((lesson) => elements.timetable.append(lessonButton(lesson, true)));

    elements.mobileSchedule.replaceChildren();
    U.DAYS.forEach((day, dayIndex) => {
      const section = document.createElement('section');
      section.className = 'mobile-day';
      const heading = document.createElement('h2');
      heading.textContent = day;
      const date = document.createElement('span');
      date.textContent = dates[dayIndex];
      heading.append(date);
      section.append(heading);
      const dayLessons = lessons.filter((lesson) => lesson.day === dayIndex);
      if (dayLessons.length) dayLessons.forEach((lesson) => section.append(lessonButton(lesson, false)));
      else {
        const empty = document.createElement('p');
        empty.className = 'mobile-day-empty';
        empty.textContent = '今天没有安排课程';
        section.append(empty);
      }
      elements.mobileSchedule.append(section);
    });
  }

  function setupFilters() {
    const schedule = state.schedule;
    elements.classSelect.replaceChildren();
    schedule.classes.forEach((item) => elements.classSelect.append(option(item.id, item.name)));
    elements.weekSelect.replaceChildren();
    for (let week = 1; week <= schedule.weeks; week += 1) elements.weekSelect.append(option(week, `第 ${week} 周`));
    elements.classSelect.disabled = false;
    elements.weekSelect.disabled = false;
  }

  async function loadSchedule() {
    elements.error.hidden = true;
    elements.retry.disabled = true;
    try {
      const response = await fetch(`data/schedule.json?v=${Date.now()}`, { cache: 'no-store' });
      if (!response.ok) throw new Error(`服务器返回 ${response.status}`);
      const schedule = await response.json();
      const invalid = U.validateSchedule(schedule);
      if (invalid) throw new Error(invalid);
      state.schedule = schedule;
      state.classId = schedule.classes[0].id;
      state.week = Math.max(1, Math.min(schedule.weeks, U.currentWeek(schedule)));
      setupFilters();
      elements.updatedAt.textContent = `数据更新于 ${new Date(response.headers.get('last-modified') || Date.now()).toLocaleString('zh-CN', { hour12: false })}`;
      elements.scheduleSection.hidden = false;
      render();
    } catch (error) {
      elements.scheduleSection.hidden = true;
      elements.errorText.textContent = `课表加载失败：${error instanceof Error ? error.message : '请稍后重试。'}`;
      elements.error.hidden = false;
      elements.pageTitle.textContent = '课表暂时无法显示';
    } finally {
      elements.retry.disabled = false;
    }
  }

  elements.classSelect.addEventListener('change', (event) => {
    state.classId = event.target.value;
    render();
  });
  elements.weekSelect.addEventListener('change', (event) => {
    state.week = Number(event.target.value);
    render();
  });
  elements.previousWeek.addEventListener('click', () => {
    state.week -= 1;
    render();
  });
  elements.nextWeek.addEventListener('click', () => {
    state.week += 1;
    render();
  });
  elements.currentWeek.addEventListener('click', () => {
    state.week = Math.max(1, Math.min(state.schedule.weeks, U.currentWeek(state.schedule)));
    render();
  });
  elements.retry.addEventListener('click', loadSchedule);

  loadSchedule();
})();
