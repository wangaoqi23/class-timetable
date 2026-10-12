(function () {
  'use strict';

  const Api = window.TimetableApi;
  if (!Api || Api.redirectAccountPageToPrimary()) return;

  const U = window.ScheduleUtils;
  const PUBLIC_SCHEDULE_ID = 'public-base';
  const FACE_SHARE_API = 'https://class-timetable.wangaoqi23.workers.dev/api/face-shares';
  const state = {
    user: null,
    schedules: [],
    publicRecord: null,
    record: null,
    schedule: null,
    classId: '',
    week: 1,
    dirty: false,
    dialogMode: 'create',
    saving: false,
  };

  const byId = (id) => document.getElementById(id);
  const elements = {
    userName: byId('user-name'), logout: byId('logout'), list: byId('schedule-list'), loading: byId('workspace-loading'), empty: byId('workspace-empty'), editor: byId('workspace-editor'), error: byId('workspace-error'), success: byId('workspace-success'),
    activeName: byId('active-schedule-name'), scheduleKind: byId('schedule-kind'), saveStatus: byId('save-status'), storageStatus: byId('storage-status'), newSchedule: byId('new-schedule'), newScheduleSecondary: byId('new-schedule-secondary'), emptyCreate: byId('empty-create'), rename: byId('rename-schedule'), share: byId('share-schedule'), remove: byId('delete-schedule'),
    viewButton: byId('view-mode-button'), editButton: byId('edit-mode-button'), view: byId('schedule-view'), edit: byId('schedule-edit'),
    viewClass: byId('view-class'), viewWeek: byId('view-week'), previousWeek: byId('view-previous-week'), nextWeek: byId('view-next-week'), currentWeek: byId('view-current-week'), weekNumber: byId('view-week-number'), thisWeek: byId('view-this-week'), term: byId('view-term'), courseCount: byId('view-course-count'), timetable: byId('workspace-timetable'), mobile: byId('workspace-mobile-schedule'), noLessons: byId('workspace-no-lessons'),
    title: byId('edit-title'), termInput: byId('edit-term'), startDate: byId('edit-start-date'), weeks: byId('edit-weeks'), periods: byId('edit-periods'), save: byId('save-schedule'), saveSecondary: byId('save-schedule-secondary'), discard: byId('discard-changes'), dirtyLabel: byId('dirty-label'),
    classList: byId('workspace-class-list'), editingClassName: byId('editing-class-name'), lessonList: byId('workspace-lesson-list'), addClass: byId('add-class'), addLesson: byId('add-lesson'),
    scheduleDialog: byId('schedule-dialog'), scheduleForm: byId('schedule-form'), scheduleDialogTitle: byId('schedule-dialog-title'), scheduleDialogName: byId('schedule-dialog-name'),
    classDialog: byId('class-dialog'), classForm: byId('class-form'), classDialogTitle: byId('class-dialog-title'), classId: byId('class-id'), className: byId('class-name'), classNote: byId('class-note'),
    lessonDialog: byId('lesson-editor-dialog'), lessonForm: byId('lesson-form'), lessonDialogTitle: byId('lesson-dialog-title'), lessonId: byId('lesson-id'), lessonName: byId('lesson-name'), lessonTeacher: byId('lesson-teacher'), lessonRoom: byId('lesson-room'), lessonDay: byId('lesson-day'), lessonParity: byId('lesson-parity'), lessonStart: byId('lesson-start'), lessonEnd: byId('lesson-end'), lessonFrom: byId('lesson-from'), lessonTo: byId('lesson-to'), lessonColor: byId('lesson-color'),
    detailDialog: byId('lesson-detail-dialog'), detailName: byId('detail-name'), detailClass: byId('detail-class'), detailList: byId('detail-list'),
    shareDialog: byId('share-dialog'), shareLink: byId('share-link'), copyShareLink: byId('copy-share-link'), shareExpiry: byId('share-expiry'), shareQr: byId('share-qr'), shareCode: byId('share-code'),
  };

  function mondayDate() {
    const date = new Date();
    const day = (date.getDay() + 6) % 7;
    date.setDate(date.getDate() - day);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const number = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${number}`;
  }

  function defaultSchedule(name) {
    return {
      title: name || '我的课表', term: '新学期', startDate: mondayDate(), weeks: 18,
      periods: [
        ['第 1 节', '08:30', '09:15'], ['第 2 节', '09:15', '10:00'], ['第 3 节', '10:20', '11:05'], ['第 4 节', '11:05', '11:50'], ['第 5 节', '13:00', '13:45'],
        ['第 6 节', '13:45', '14:30'], ['第 7 节', '14:50', '15:35'], ['第 8 节', '15:35', '16:20'], ['第 9 节', '18:00', '18:45'], ['第 10 节', '18:45', '19:30'],
      ].map(([periodName, start, end]) => ({ name: periodName, start, end })),
      classes: [{ id: U.makeId('class'), name: '我的班级', note: '' }], lessons: [], demo: false,
    };
  }

  function unwrap(payload, key) {
    const value = payload?.data || payload;
    return value?.[key] ?? value;
  }

  function showMessage(type, message) {
    elements.error.hidden = type !== 'error' || !message;
    elements.success.hidden = type !== 'success' || !message;
    if (type === 'error') elements.error.textContent = message || '';
    if (type === 'success') elements.success.textContent = message || '';
  }

  function clearMessages() {
    elements.error.hidden = true;
    elements.success.hidden = true;
  }

  function option(value, label) {
    const item = document.createElement('option');
    item.value = String(value);
    item.textContent = label;
    return item;
  }

  function setDirty(value) {
    state.dirty = value !== false;
    elements.save.disabled = !state.dirty || state.saving;
    elements.saveSecondary.disabled = !state.dirty || state.saving;
    elements.dirtyLabel.textContent = state.dirty ? '有尚未保存的更改' : '所有更改已保存';
    elements.saveStatus.textContent = state.dirty ? '有尚未保存的更改' : '所有更改已保存';
  }

  function setSaving(value) {
    state.saving = value;
    elements.save.textContent = value ? '正在保存…' : '保存更改';
    elements.saveSecondary.textContent = value ? '正在保存…' : '保存更改';
    setDirty(state.dirty);
  }

  function isPublicSchedule() {
    return state.record?.id === PUBLIC_SCHEDULE_ID;
  }

  function publicScheduleForUser(data) {
    const schedule = U.clone(data);
    const selected = schedule.classes.find((item) => item.id === state.user?.classId) || schedule.classes[0];
    schedule.classes = selected ? [selected] : [];
    schedule.lessons = selected ? schedule.lessons.filter((lesson) => lesson.classId === selected.id) : [];
    return schedule;
  }

  function personalScheduleFromPublic(data) {
    const schedule = publicScheduleForUser(data);
    schedule.title = `${state.user?.fullName || state.user?.username || '我的'}的课表`;
    schedule.demo = false;
    return schedule;
  }

  function applySchedulePermissions() {
    const publicView = isPublicSchedule();
    elements.scheduleKind.textContent = publicView ? 'PUBLIC BASE TIMETABLE' : 'PERSONAL TIMETABLE';
    elements.rename.disabled = publicView;
    elements.share.disabled = publicView;
    elements.remove.disabled = publicView;
    elements.editButton.disabled = publicView;
    elements.storageStatus.textContent = publicView ? '公共基础课表 · 只读' : '个人课表已保存到当前设备';
    if (publicView) {
      elements.saveStatus.textContent = '公共基础课表 · 由管理员发布';
      setMode('view');
    }
  }

  function renderScheduleList() {
    elements.list.replaceChildren();
    if (state.publicRecord) {
      const publicButton = document.createElement('button');
      publicButton.type = 'button';
      publicButton.className = 'schedule-list-item public-schedule-item';
      publicButton.classList.toggle('active', isPublicSchedule());
      const name = document.createElement('strong');
      name.textContent = '公共基础课表';
      const detail = document.createElement('span');
      detail.textContent = state.user?.className || state.publicRecord.data.classes[0]?.name || '学校统一课程';
      publicButton.append(name, detail);
      publicButton.addEventListener('click', selectPublicSchedule);
      elements.list.append(publicButton);
    }
    state.schedules.forEach((item) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'schedule-list-item';
      button.classList.toggle('active', state.record?.id === item.id);
      const name = document.createElement('strong');
      name.textContent = item.name;
      const detail = document.createElement('span');
      detail.textContent = item.term || item.title || '尚未设置学期';
      button.append(name, detail);
      button.addEventListener('click', () => selectSchedule(item.id));
      elements.list.append(button);
    });
  }

  function normalizeRecord(raw) {
    if (!raw || typeof raw !== 'object') throw new Error('课表响应格式无效。');
    const data = raw.data || raw.scheduleData || raw.content;
    if (!data || typeof data !== 'object') throw new Error('课表数据为空。');
    const invalid = U.validateSchedule(data);
    if (invalid) throw new Error(`课表无法打开：${invalid}`);
    return { ...raw, data };
  }

  function recordSummary(record) {
    return { id: record.id, name: record.name, title: record.data.title, term: record.data.term, version: record.version, createdAt: record.createdAt, updatedAt: record.updatedAt };
  }

  function updateSummary(record) {
    const index = state.schedules.findIndex((item) => item.id === record.id);
    const nextSummary = recordSummary(record);
    if (index >= 0) state.schedules[index] = { ...state.schedules[index], ...nextSummary };
    else state.schedules.push(nextSummary);
    renderScheduleList();
  }

  function updateScheduleUrl(id) {
    const url = new URL(window.location.href);
    if (id) url.searchParams.set('schedule', id);
    else url.searchParams.delete('schedule');
    history.replaceState(null, '', url);
  }

  function populateSettings() {
    elements.activeName.textContent = state.record.name;
    elements.title.value = state.schedule.title;
    elements.termInput.value = state.schedule.term;
    elements.startDate.value = state.schedule.startDate;
    elements.weeks.value = String(state.schedule.weeks);
    elements.periods.value = state.schedule.periods.map((period) => `${period.name} | ${period.start} | ${period.end}`).join('\n');
  }

  function syncSettings() {
    const periods = elements.periods.value.split('\n').map((line) => line.trim()).filter(Boolean).map((line, index) => {
      const [name, start, end, ...rest] = line.split('|').map((item) => item.trim());
      if (!name || !start || !end || rest.length) throw new Error(`第 ${index + 1} 行节次格式无效。`);
      return { name, start, end };
    });
    state.schedule.title = elements.title.value.trim();
    state.schedule.term = elements.termInput.value.trim();
    state.schedule.startDate = elements.startDate.value;
    state.schedule.weeks = Number(elements.weeks.value);
    state.schedule.periods = periods;
  }

  function setupViewerFilters() {
    elements.viewClass.replaceChildren();
    state.schedule.classes.forEach((schoolClass) => elements.viewClass.append(option(schoolClass.id, schoolClass.name)));
    if (!state.schedule.classes.some((item) => item.id === state.classId)) state.classId = state.schedule.classes[0].id;
    elements.viewClass.value = state.classId;
    elements.viewWeek.replaceChildren();
    for (let week = 1; week <= state.schedule.weeks; week += 1) elements.viewWeek.append(option(week, `第 ${week} 周`));
    state.week = Math.max(1, Math.min(state.schedule.weeks, state.week));
    elements.viewWeek.value = String(state.week);
  }

  function appendDetail(list, label, value) {
    const term = document.createElement('dt');
    term.textContent = label;
    const detail = document.createElement('dd');
    detail.textContent = value;
    list.append(term, detail);
  }

  function showLessonDetail(lesson) {
    const schoolClass = state.schedule.classes.find((item) => item.id === lesson.classId);
    elements.detailName.textContent = lesson.name;
    elements.detailClass.textContent = schoolClass?.name || '';
    elements.detailList.replaceChildren();
    appendDetail(elements.detailList, '任课教师', lesson.teacher || '待安排');
    appendDetail(elements.detailList, '上课地点', lesson.room || '待安排');
    appendDetail(elements.detailList, '上课时间', `${U.DAYS[lesson.day]} 第 ${lesson.start + 1}–${lesson.end + 1} 节（${state.schedule.periods[lesson.start].start}–${state.schedule.periods[lesson.end].end}）`);
    appendDetail(elements.detailList, '教学周', `第 ${lesson.from}–${lesson.to} 周${lesson.parity === 'all' ? '' : `（${U.PARITY_LABELS[lesson.parity]}）`}`);
    elements.detailDialog.showModal();
  }

  function lessonCard(lesson, grid) {
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
    button.addEventListener('click', () => showLessonDetail(lesson));
    return button;
  }

  function renderViewer() {
    setupViewerFilters();
    const schedule = state.schedule;
    const dates = U.weekDates(schedule, state.week);
    const actualWeek = U.currentWeek(schedule);
    const lessons = U.visibleLessons(schedule, state.classId, state.week).sort((a, b) => a.day - b.day || a.start - b.start);
    elements.previousWeek.disabled = state.week <= 1;
    elements.nextWeek.disabled = state.week >= schedule.weeks;
    elements.weekNumber.textContent = `第 ${state.week} 周`;
    elements.thisWeek.hidden = state.week !== actualWeek;
    elements.term.textContent = schedule.term;
    elements.courseCount.textContent = `本周 ${lessons.length} 门次课程`;
    elements.noLessons.hidden = lessons.length !== 0;
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
      const start = document.createElement('small'); start.textContent = period.start;
      const end = document.createElement('small'); end.textContent = period.end;
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
    lessons.forEach((lesson) => elements.timetable.append(lessonCard(lesson, true)));
    elements.mobile.replaceChildren();
    U.DAYS.forEach((day, dayIndex) => {
      const section = document.createElement('section');
      section.className = 'mobile-day';
      const heading = document.createElement('h2');
      heading.textContent = day;
      const date = document.createElement('span'); date.textContent = dates[dayIndex];
      heading.append(date); section.append(heading);
      const dayLessons = lessons.filter((lesson) => lesson.day === dayIndex);
      if (dayLessons.length) dayLessons.forEach((lesson) => section.append(lessonCard(lesson, false)));
      else { const empty = document.createElement('p'); empty.className = 'mobile-day-empty'; empty.textContent = '今天没有安排课程'; section.append(empty); }
      elements.mobile.append(section);
    });
  }

  function renderClasses() {
    elements.classList.replaceChildren();
    state.schedule.classes.forEach((schoolClass) => {
      const card = document.createElement('article');
      card.className = 'class-card';
      card.classList.toggle('selected', schoolClass.id === state.classId);
      const select = document.createElement('button'); select.type = 'button'; select.className = 'class-card-select';
      const name = document.createElement('strong'); name.textContent = schoolClass.name;
      const note = document.createElement('span'); note.textContent = schoolClass.note || '无备注';
      select.append(name, note); select.addEventListener('click', () => { state.classId = schoolClass.id; renderClasses(); renderLessons(); });
      const actions = document.createElement('div'); actions.className = 'class-actions';
      const edit = document.createElement('button'); edit.type = 'button'; edit.className = 'mini-button'; edit.textContent = '编辑'; edit.addEventListener('click', () => openClassDialog(schoolClass));
      const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'mini-button danger'; remove.textContent = '删除'; remove.disabled = state.schedule.classes.length === 1; remove.addEventListener('click', () => deleteClass(schoolClass));
      actions.append(edit, remove); card.append(select, actions); elements.classList.append(card);
    });
  }

  function renderLessons() {
    elements.lessonList.replaceChildren();
    const schoolClass = state.schedule.classes.find((item) => item.id === state.classId) || state.schedule.classes[0];
    state.classId = schoolClass.id;
    elements.editingClassName.textContent = `正在编辑：${schoolClass.name}`;
    const lessons = state.schedule.lessons.filter((item) => item.classId === schoolClass.id).sort((a, b) => a.day - b.day || a.start - b.start);
    if (!lessons.length) {
      const empty = document.createElement('p'); empty.className = 'empty-inline'; empty.textContent = '这个班级还没有课程。'; elements.lessonList.append(empty); return;
    }
    lessons.forEach((lesson) => {
      const row = document.createElement('article'); row.className = 'admin-lesson';
      const identity = document.createElement('div'); const name = document.createElement('strong'); name.textContent = lesson.name; const teacher = document.createElement('span'); teacher.textContent = `${lesson.teacher || '教师待安排'} · ${lesson.room || '地点待安排'}`; identity.append(name, teacher);
      const time = document.createElement('div'); const dot = document.createElement('i'); dot.className = `lesson-color-dot ${lesson.color}`; const timeStrong = document.createElement('strong'); timeStrong.append(dot, `${U.DAYS[lesson.day]} 第 ${lesson.start + 1}–${lesson.end + 1} 节`); const timeDetail = document.createElement('span'); timeDetail.textContent = `${state.schedule.periods[lesson.start]?.start || ''}–${state.schedule.periods[lesson.end]?.end || ''}`; time.append(timeStrong, timeDetail);
      const weeks = document.createElement('div'); const weeksStrong = document.createElement('strong'); weeksStrong.textContent = `第 ${lesson.from}–${lesson.to} 周`; const parity = document.createElement('span'); parity.textContent = U.PARITY_LABELS[lesson.parity]; weeks.append(weeksStrong, parity);
      const actions = document.createElement('div'); actions.className = 'admin-lesson-actions'; const edit = document.createElement('button'); edit.type = 'button'; edit.className = 'mini-button'; edit.textContent = '编辑'; edit.addEventListener('click', () => openLessonDialog(lesson)); const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'mini-button danger'; remove.textContent = '删除'; remove.addEventListener('click', () => deleteLesson(lesson)); actions.append(edit, remove);
      row.append(identity, time, weeks, actions); elements.lessonList.append(row);
    });
  }

  function renderWorkspace() {
    populateSettings();
    renderScheduleList();
    renderViewer();
    renderClasses();
    renderLessons();
    elements.loading.hidden = true;
    elements.empty.hidden = true;
    elements.editor.hidden = false;
    setDirty(false);
    applySchedulePermissions();
  }

  function rememberSelection(id) {
    if (state.user?.id) localStorage.setItem(`timetable_last_schedule_${state.user.id}`, id);
  }

  async function selectPublicSchedule() {
    if (!state.publicRecord || state.record?.id === PUBLIC_SCHEDULE_ID) return;
    if (state.dirty && !window.confirm('当前有未保存的更改，仍要切换课表吗？')) return;
    clearMessages();
    state.record = state.publicRecord;
    state.schedule = U.clone(state.publicRecord.data);
    state.classId = state.schedule.classes[0]?.id || '';
    state.week = Math.max(1, Math.min(state.schedule.weeks, U.currentWeek(state.schedule)));
    renderWorkspace();
    updateScheduleUrl(PUBLIC_SCHEDULE_ID);
    rememberSelection(PUBLIC_SCHEDULE_ID);
  }

  async function selectSchedule(id, options) {
    if (id === PUBLIC_SCHEDULE_ID) return selectPublicSchedule();
    if (!id || (id === state.record?.id && !options?.reload)) return;
    if (state.dirty && !options?.force && !window.confirm('当前有未保存的更改，仍要切换课表吗？')) return;
    clearMessages();
    try {
      const payload = await Api.request(`/api/schedules/${encodeURIComponent(id)}`);
      const record = normalizeRecord(unwrap(payload, 'schedule'));
      state.record = record;
      state.schedule = U.clone(record.data);
      state.classId = state.schedule.classes[0].id;
      state.week = Math.max(1, Math.min(state.schedule.weeks, U.currentWeek(state.schedule)));
      renderWorkspace();
      updateScheduleUrl(record.id);
      rememberSelection(record.id);
    } catch (error) { showMessage('error', error instanceof Error ? error.message : '课表加载失败。'); }
  }

  async function loadAccount() {
    try {
      const [mePayload, schedulesPayload, publicResponse] = await Promise.all([
        Api.request('/api/auth/me'),
        Api.request('/api/schedules'),
        fetch(Api.rootUrl('data/schedule.json'), { cache: 'force-cache' }),
      ]);
      if (!publicResponse.ok) throw new Error('公共基础课表加载失败。');
      const publicData = await publicResponse.json();
      state.user = unwrap(mePayload, 'user');
      state.schedules = unwrap(schedulesPayload, 'schedules') || [];
      const matchedClass = publicData.classes.find((item) => item.id === state.user?.classId) || publicData.classes[0];
      if (!state.user.classId && matchedClass) state.user.classId = matchedClass.id;
      if (!state.user.className && matchedClass) state.user.className = matchedClass.name;
      state.publicRecord = {
        id: PUBLIC_SCHEDULE_ID,
        name: '公共基础课表',
        data: publicScheduleForUser(publicData),
        version: 0,
        createdAt: null,
        updatedAt: null,
      };
      elements.userName.textContent = [state.user?.fullName || state.user?.username, state.user?.className].filter(Boolean).join(' · ');

      if (!state.schedules.length) {
        const payload = await Api.request('/api/schedules', {
          method: 'POST',
          body: JSON.stringify({ name: '我的课表', data: personalScheduleFromPublic(publicData) }),
        });
        const record = normalizeRecord(unwrap(payload, 'schedule'));
        state.schedules = [recordSummary(record)];
      }
      renderScheduleList();
      const requested = new URLSearchParams(window.location.search).get('schedule');
      const remembered = localStorage.getItem(`timetable_last_schedule_${state.user.id}`);
      const preferred = requested || remembered;
      if (preferred === PUBLIC_SCHEDULE_ID) await selectPublicSchedule();
      else {
        const first = state.schedules.find((item) => item.id === preferred) || state.schedules[0];
        await selectSchedule(first.id, { force: true });
      }
    } catch (error) {
      elements.loading.hidden = true;
      showMessage('error', error instanceof Error ? error.message : '账户加载失败。');
    }
  }

  function openScheduleDialog(mode) {
    if (state.dirty) {
      const action = mode === 'create' ? '新建课表' : '重命名';
      showMessage('error', `请先保存或放弃当前更改，再${action}。`);
      return;
    }
    state.dialogMode = mode;
    elements.scheduleDialogTitle.textContent = mode === 'create' ? '新建课表' : '重命名课表';
    elements.scheduleDialogName.value = mode === 'create' ? '' : state.record.name;
    elements.scheduleDialog.showModal();
    elements.scheduleDialogName.focus();
  }

  async function submitScheduleDialog(event) {
    event.preventDefault();
    const name = elements.scheduleDialogName.value.trim();
    if (!name) return;
    const submit = elements.scheduleForm.querySelector('[type="submit"]');
    submit.disabled = true;
    try {
      if (state.dialogMode === 'create') {
        const data = defaultSchedule(name);
        const payload = await Api.request('/api/schedules', { method: 'POST', body: JSON.stringify({ name, data }) });
        const record = normalizeRecord(unwrap(payload, 'schedule'));
        state.record = record; state.schedule = U.clone(record.data); state.classId = state.schedule.classes[0].id; state.week = 1;
        updateSummary(record); renderWorkspace(); updateScheduleUrl(record.id); showMessage('success', '课表已创建。');
      } else {
        const payload = await Api.request(`/api/schedules/${encodeURIComponent(state.record.id)}`, { method: 'PUT', body: JSON.stringify({ name, data: state.schedule, version: state.record.version }) });
        const record = normalizeRecord(unwrap(payload, 'schedule'));
        state.record = record; updateSummary(record); elements.activeName.textContent = record.name; showMessage('success', '课表名称已更新。');
      }
      elements.scheduleDialog.close();
    } catch (error) { showMessage('error', error instanceof Error ? error.message : '操作失败。'); }
    finally { submit.disabled = false; }
  }

  async function deleteSchedule() {
    if (!window.confirm(`永久删除“${state.record.name}”及其中的所有课程？`)) return;
    try {
      await Api.request(`/api/schedules/${encodeURIComponent(state.record.id)}`, { method: 'DELETE' });
      state.schedules = state.schedules.filter((item) => item.id !== state.record.id); state.record = null; state.schedule = null; state.dirty = false;
      elements.editor.hidden = true; renderScheduleList();
      if (state.schedules.length) await selectSchedule(state.schedules[0].id, { force: true });
      else { elements.empty.hidden = false; updateScheduleUrl(''); }
      showMessage('success', '课表已删除。');
    } catch (error) { showMessage('error', error instanceof Error ? error.message : '删除失败。'); }
  }

  async function saveSchedule() {
    clearMessages();
    try {
      syncSettings();
      const invalid = U.validateSchedule(state.schedule);
      if (invalid) throw new Error(invalid);
      setSaving(true);
      const payload = await Api.request(`/api/schedules/${encodeURIComponent(state.record.id)}`, { method: 'PUT', body: JSON.stringify({ name: state.record.name, data: state.schedule, version: state.record.version }) });
      const record = normalizeRecord(unwrap(payload, 'schedule'));
      state.record = record; state.schedule = U.clone(record.data); updateSummary(record); populateSettings(); renderViewer(); renderClasses(); renderLessons(); setDirty(false); showMessage('success', '课表已保存。');
    } catch (error) {
      if (error?.status === 409) showMessage('error', '这份课表已在其他设备更新。请放弃本地更改并重新加载后再编辑。');
      else showMessage('error', error instanceof Error ? error.message : '保存失败。');
    } finally { setSaving(false); }
  }

  async function shareSchedule() {
    if (state.dirty) {
      showMessage('error', '请先保存当前更改，再创建分享链接。');
      return;
    }
    elements.share.disabled = true;
    try {
      let link;
      let share;
      let codeText = '';
      let faceShareExpiresAt = null;
      let faceShareAvailable = false;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const payload = await Api.request(`/api/schedules/${encodeURIComponent(state.record.id)}/shares`, { method: 'POST', body: JSON.stringify({ expiresInDays: 30 }) });
        share = unwrap(payload, 'share');
        if (!share?.shareUrl) throw new Error('分享响应缺少可用链接。');
        link = new URL(share.shareUrl, window.location.href);
        if (link.origin !== window.location.origin) throw new Error('分享响应指向了无效站点。');
        const token = decodeURIComponent(link.hash.slice(1));
        const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token)));
        codeText = String(new DataView(digest.buffer).getUint32(0) % 1000000).padStart(6, '0');
        try {
          const response = await fetch(FACE_SHARE_API, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code: codeText, token }),
            signal: AbortSignal.timeout(6000),
          });
          if (response.status === 409) continue;
          if (!response.ok) throw new Error(`face share ${response.status}`);
          const facePayload = await response.json();
          faceShareExpiresAt = facePayload?.share?.expiresAt || null;
          faceShareAvailable = true;
        } catch {
          faceShareAvailable = false;
        }
        break;
      }
      if (!link || !share) throw new Error('暂时无法创建分享，请稍后重试。');
      elements.shareLink.value = link.href;
      elements.shareCode.textContent = codeText;
      elements.shareQr.replaceChildren();
      try {
        if (typeof window.qrcode !== 'function') throw new Error('二维码组件未加载');
        const code = window.qrcode(0, 'L');
        code.addData(link.href);
        code.make();
        const image = document.createElement('img');
        image.src = code.createDataURL(6, 12);
        image.alt = `课表分享二维码，面对面码 ${elements.shareCode.textContent}`;
        elements.shareQr.append(image);
      } catch {
        const fallback = document.createElement('p');
        fallback.textContent = '课表内容较多，请使用下方备用链接分享。';
        elements.shareQr.append(fallback);
      }
      elements.shareExpiry.textContent = faceShareAvailable
        ? `6 位码有效期至 ${new Date(faceShareExpiresAt).toLocaleString('zh-CN', { hour12: false })}；二维码和备用链接可继续使用。`
        : '二维码和备用链接已创建；6 位码中转服务暂时不可用。';
      elements.shareDialog.showModal();
    } catch (error) { showMessage('error', error instanceof Error ? error.message : '创建分享失败。'); }
    finally { elements.share.disabled = false; }
  }

  async function copyShareLink() {
    try { await navigator.clipboard.writeText(elements.shareLink.value); elements.copyShareLink.textContent = '已复制'; }
    catch { elements.shareLink.select(); document.execCommand('copy'); elements.copyShareLink.textContent = '已复制'; }
    setTimeout(() => { elements.copyShareLink.textContent = '复制链接'; }, 1500);
  }

  function openClassDialog(schoolClass) {
    elements.classDialogTitle.textContent = schoolClass ? '编辑班级' : '新增班级';
    elements.classId.value = schoolClass?.id || '';
    elements.className.value = schoolClass?.name || '';
    elements.classNote.value = schoolClass?.note || '';
    elements.classDialog.showModal(); elements.className.focus();
  }

  function deleteClass(schoolClass) {
    if (state.schedule.classes.length === 1 || !window.confirm(`删除班级“${schoolClass.name}”及其全部课程？`)) return;
    state.schedule.classes = state.schedule.classes.filter((item) => item.id !== schoolClass.id);
    state.schedule.lessons = state.schedule.lessons.filter((item) => item.classId !== schoolClass.id);
    state.classId = state.schedule.classes[0].id; setDirty(); renderClasses(); renderLessons(); renderViewer();
  }

  function fillPeriodOptions(start, end) {
    elements.lessonStart.replaceChildren(); elements.lessonEnd.replaceChildren();
    state.schedule.periods.forEach((period, index) => {
      const label = `${period.name}（${period.start}–${period.end}）`;
      elements.lessonStart.append(option(index, label)); elements.lessonEnd.append(option(index, label));
    });
    elements.lessonStart.value = String(Math.min(start, state.schedule.periods.length - 1));
    elements.lessonEnd.value = String(Math.max(start, Math.min(end, state.schedule.periods.length - 1)));
  }

  function openLessonDialog(lesson) {
    try { syncSettings(); } catch (error) { showMessage('error', error.message); return; }
    if (!state.schedule.periods.length) { showMessage('error', '请先设置至少一个有效节次。'); return; }
    const draft = lesson || { id: '', name: '', teacher: '', room: '', day: 0, start: 0, end: 0, from: 1, to: state.schedule.weeks, parity: 'all', color: U.COLORS[state.schedule.lessons.length % U.COLORS.length] };
    elements.lessonDialogTitle.textContent = lesson ? '编辑课程' : '新增课程';
    elements.lessonId.value = draft.id; elements.lessonName.value = draft.name; elements.lessonTeacher.value = draft.teacher; elements.lessonRoom.value = draft.room; elements.lessonDay.value = String(draft.day); elements.lessonParity.value = draft.parity; elements.lessonFrom.value = String(draft.from); elements.lessonTo.value = String(draft.to); elements.lessonFrom.max = String(state.schedule.weeks); elements.lessonTo.max = String(state.schedule.weeks); elements.lessonColor.value = draft.color; fillPeriodOptions(draft.start, draft.end);
    elements.lessonDialog.showModal(); elements.lessonName.focus();
  }

  function deleteLesson(lesson) {
    if (!window.confirm(`删除课程“${lesson.name}”？`)) return;
    state.schedule.lessons = state.schedule.lessons.filter((item) => item.id !== lesson.id); setDirty(); renderLessons(); renderViewer();
  }

  function setMode(mode) {
    const editing = mode === 'edit';
    elements.view.hidden = editing; elements.edit.hidden = !editing;
    elements.viewButton.classList.toggle('active', !editing); elements.editButton.classList.toggle('active', editing);
    elements.viewButton.setAttribute('aria-selected', String(!editing)); elements.editButton.setAttribute('aria-selected', String(editing));
    if (editing) { renderClasses(); renderLessons(); } else { try { syncSettings(); renderViewer(); } catch (error) { showMessage('error', error.message); setMode('edit'); } }
  }

  [elements.title, elements.termInput, elements.startDate, elements.weeks, elements.periods].forEach((input) => input.addEventListener('input', () => setDirty()));
  [elements.newSchedule, elements.newScheduleSecondary, elements.emptyCreate].forEach((button) => button.addEventListener('click', () => openScheduleDialog('create')));
  elements.rename.addEventListener('click', () => openScheduleDialog('rename'));
  elements.scheduleForm.addEventListener('submit', submitScheduleDialog);
  elements.remove.addEventListener('click', deleteSchedule);
  elements.share.addEventListener('click', shareSchedule);
  elements.copyShareLink.addEventListener('click', copyShareLink);
  elements.viewButton.addEventListener('click', () => setMode('view'));
  elements.editButton.addEventListener('click', () => setMode('edit'));
  elements.viewClass.addEventListener('change', () => { state.classId = elements.viewClass.value; renderViewer(); });
  elements.viewWeek.addEventListener('change', () => { state.week = Number(elements.viewWeek.value); renderViewer(); });
  elements.previousWeek.addEventListener('click', () => { state.week -= 1; renderViewer(); });
  elements.nextWeek.addEventListener('click', () => { state.week += 1; renderViewer(); });
  elements.currentWeek.addEventListener('click', () => { state.week = Math.max(1, Math.min(state.schedule.weeks, U.currentWeek(state.schedule))); renderViewer(); });
  elements.save.addEventListener('click', saveSchedule); elements.saveSecondary.addEventListener('click', saveSchedule);
  elements.discard.addEventListener('click', () => { if (!state.dirty || window.confirm('放弃当前未保存的更改？')) selectSchedule(state.record.id, { force: true, reload: true }); });
  elements.addClass.addEventListener('click', () => openClassDialog(null));
  elements.classForm.addEventListener('submit', (event) => {
    event.preventDefault(); const id = elements.classId.value || U.makeId('class'); const name = elements.className.value.trim(); const note = elements.classNote.value.trim();
    if (state.schedule.classes.some((item) => item.name === name && item.id !== id)) { elements.className.setCustomValidity('班级名称不能重复。'); elements.className.reportValidity(); return; }
    elements.className.setCustomValidity(''); const schoolClass = { id, name, note }; const index = state.schedule.classes.findIndex((item) => item.id === id); if (index >= 0) state.schedule.classes[index] = schoolClass; else state.schedule.classes.push(schoolClass); state.classId = id; elements.classDialog.close(); setDirty(); renderClasses(); renderLessons(); renderViewer();
  });
  U.DAYS.forEach((day, index) => elements.lessonDay.append(option(index, day)));
  elements.lessonStart.addEventListener('change', () => fillPeriodOptions(Number(elements.lessonStart.value), Math.max(Number(elements.lessonStart.value), Number(elements.lessonEnd.value))));
  elements.addLesson.addEventListener('click', () => openLessonDialog(null));
  elements.lessonForm.addEventListener('submit', (event) => {
    event.preventDefault(); const previousId = elements.lessonId.value; const lesson = { id: previousId || U.makeId('lesson'), classId: state.classId, name: elements.lessonName.value.trim(), teacher: elements.lessonTeacher.value.trim(), room: elements.lessonRoom.value.trim(), day: Number(elements.lessonDay.value), start: Number(elements.lessonStart.value), end: Number(elements.lessonEnd.value), from: Number(elements.lessonFrom.value), to: Number(elements.lessonTo.value), parity: elements.lessonParity.value, color: elements.lessonColor.value };
    const index = state.schedule.lessons.findIndex((item) => item.id === previousId); const previous = index >= 0 ? state.schedule.lessons[index] : null; if (index >= 0) state.schedule.lessons[index] = lesson; else state.schedule.lessons.push(lesson); const invalid = U.validateSchedule(state.schedule); if (invalid) { if (index >= 0) state.schedule.lessons[index] = previous; else state.schedule.lessons.pop(); elements.lessonName.setCustomValidity(invalid); elements.lessonName.reportValidity(); return; }
    elements.lessonName.setCustomValidity(''); elements.lessonDialog.close(); setDirty(); renderLessons(); renderViewer();
  });
  document.querySelectorAll('[data-close-dialog]').forEach((button) => button.addEventListener('click', () => byId(button.dataset.closeDialog).close()));
  elements.className.addEventListener('input', () => elements.className.setCustomValidity('')); elements.lessonName.addEventListener('input', () => elements.lessonName.setCustomValidity(''));
  elements.logout.addEventListener('click', async () => {
    elements.logout.disabled = true;
    try {
      await Api.request('/api/auth/logout', { method: 'POST' });
      window.location.replace(Api.rootUrl('login/'));
    } catch (error) {
      showMessage('error', error instanceof Error ? error.message : '退出失败，请稍后重试。');
      elements.logout.disabled = false;
    }
  });
  window.addEventListener('beforeunload', (event) => { if (!state.dirty) return; event.preventDefault(); event.returnValue = ''; });

  loadAccount();
})();
