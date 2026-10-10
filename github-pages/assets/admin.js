(function () {
  'use strict';

  const U = window.ScheduleUtils;
  const DATA_PATH = 'github-pages/data/schedule.json';
  const API_VERSION = '2022-11-28';
  const state = {
    schedule: null,
    sha: '',
    owner: '',
    repo: '',
    branch: 'main',
    classId: '',
    dirty: false,
    busy: false,
  };

  const byId = (id) => document.getElementById(id);
  const elements = {
    connectionStatus: byId('connection-status'),
    connectionForm: byId('connection-form'),
    owner: byId('repo-owner'),
    repo: byId('repo-name'),
    branch: byId('repo-branch'),
    token: byId('github-token'),
    connect: byId('connect'),
    disconnect: byId('disconnect'),
    error: byId('admin-error'),
    success: byId('admin-success'),
    editor: byId('editor'),
    siteTitle: byId('site-title'),
    termName: byId('term-name'),
    startDate: byId('start-date'),
    weekCount: byId('week-count'),
    periods: byId('periods'),
    classAdmin: byId('class-admin'),
    addClass: byId('add-class'),
    lessonClassName: byId('lesson-class-name'),
    lessonList: byId('lesson-admin-list'),
    addLesson: byId('add-lesson'),
    reload: byId('reload-repository'),
    save: byId('save-repository'),
    dirtyLabel: byId('dirty-label'),
    classDialog: byId('class-dialog'),
    classForm: byId('class-form'),
    classDialogTitle: byId('class-dialog-title'),
    classId: byId('class-id'),
    className: byId('class-name'),
    classNote: byId('class-note-input'),
    lessonDialog: byId('lesson-editor-dialog'),
    lessonForm: byId('lesson-form'),
    lessonDialogTitle: byId('lesson-dialog-title'),
    lessonId: byId('lesson-id'),
    lessonName: byId('lesson-name'),
    lessonTeacher: byId('lesson-teacher'),
    lessonRoom: byId('lesson-room'),
    lessonDay: byId('lesson-day'),
    lessonParity: byId('lesson-parity'),
    lessonStart: byId('lesson-start'),
    lessonEnd: byId('lesson-end'),
    lessonFrom: byId('lesson-from'),
    lessonTo: byId('lesson-to'),
    lessonColor: byId('lesson-color'),
  };

  function showMessage(kind, message) {
    const target = kind === 'error' ? elements.error : elements.success;
    const other = kind === 'error' ? elements.success : elements.error;
    other.hidden = true;
    target.textContent = message;
    target.hidden = false;
  }

  function clearMessages() {
    elements.error.hidden = true;
    elements.success.hidden = true;
  }

  function setBusy(busy, label) {
    state.busy = busy;
    elements.connect.disabled = busy;
    elements.save.disabled = busy || !state.dirty;
    elements.reload.disabled = busy;
    elements.addClass.disabled = busy;
    elements.addLesson.disabled = busy;
    if (label) elements.connectionStatus.textContent = label;
  }

  function setDirty(dirty = true) {
    state.dirty = dirty;
    elements.save.disabled = state.busy || !dirty;
    elements.dirtyLabel.textContent = dirty ? '有尚未提交的更改' : '当前没有未保存更改';
  }

  function apiUrl(withReference = true) {
    const base = `https://api.github.com/repos/${encodeURIComponent(state.owner)}/${encodeURIComponent(state.repo)}/contents/${DATA_PATH}`;
    return withReference ? `${base}?ref=${encodeURIComponent(state.branch)}` : base;
  }

  async function githubRequest(url, options = {}) {
    const token = sessionStorage.getItem('timetable_github_pat');
    if (!token) throw new Error('当前标签页没有 GitHub 令牌，请重新连接。');
    const response = await fetch(url, {
      ...options,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': API_VERSION,
        ...(options.headers || {}),
      },
    });
    if (!response.ok) {
      let detail = '';
      try {
        const body = await response.json();
        detail = body.message || '';
      } catch {
        detail = '';
      }
      const hints = {
        401: '令牌无效或已过期。',
        403: '令牌权限不足：Fine-grained 需要 Contents 写入权限，Classic 需要 public_repo。',
        404: `找不到 ${DATA_PATH}，请检查仓库、分支和令牌授权范围。`,
        409: '仓库中的课表已被其他人更新，请重载后再编辑。',
      };
      throw new Error(hints[response.status] || detail || `GitHub API 返回 ${response.status}`);
    }
    return response.json();
  }

  function decodeBase64(value) {
    const binary = atob(value.replace(/\s/g, ''));
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }

  function encodeBase64(value) {
    const bytes = new TextEncoder().encode(value);
    let binary = '';
    const size = 0x8000;
    for (let index = 0; index < bytes.length; index += size) {
      binary += String.fromCharCode(...bytes.subarray(index, index + size));
    }
    return btoa(binary);
  }

  function inferRepository() {
    const host = location.hostname.toLowerCase();
    if (!host.endsWith('.github.io')) return;
    const owner = host.slice(0, -'.github.io'.length);
    const parts = location.pathname.split('/').filter(Boolean);
    elements.owner.value ||= owner;
    elements.repo.value ||= parts[0] && parts[0] !== 'admin' ? parts[0] : `${owner}.github.io`;
  }

  function persistConnectionFields() {
    localStorage.setItem('timetable_repo_owner', state.owner);
    localStorage.setItem('timetable_repo_name', state.repo);
    localStorage.setItem('timetable_repo_branch', state.branch);
  }

  function restoreConnectionFields() {
    elements.owner.value = localStorage.getItem('timetable_repo_owner') || '';
    elements.repo.value = localStorage.getItem('timetable_repo_name') || '';
    elements.branch.value = localStorage.getItem('timetable_repo_branch') || 'main';
    inferRepository();
    const sessionToken = sessionStorage.getItem('timetable_github_pat');
    if (sessionToken) elements.token.value = sessionToken;
  }

  function normalizeConnection() {
    const owner = elements.owner.value.trim();
    const repo = elements.repo.value.trim().replace(/\.git$/i, '');
    const branch = elements.branch.value.trim();
    if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/.test(owner)) throw new Error('仓库所有者名称格式不正确。');
    if (!/^[A-Za-z0-9._-]{1,100}$/.test(repo)) throw new Error('仓库名称格式不正确。');
    if (!branch || branch.length > 255 || /[~^:?*[\\\s]/.test(branch)) throw new Error('分支名称格式不正确。');
    state.owner = owner;
    state.repo = repo;
    state.branch = branch;
  }

  function syncSettingsFromInputs() {
    state.schedule.title = elements.siteTitle.value.trim();
    state.schedule.term = elements.termName.value.trim();
    state.schedule.startDate = elements.startDate.value;
    state.schedule.weeks = Number(elements.weekCount.value);
    const lines = elements.periods.value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    state.schedule.periods = lines.map((line, index) => {
      const parts = line.split('|').map((part) => part.trim());
      if (parts.length !== 3) throw new Error(`节次第 ${index + 1} 行格式不正确，请用“名称 | 开始 | 结束”。`);
      return { name: parts[0], start: parts[1], end: parts[2] };
    });
  }

  function fillSettings() {
    const schedule = state.schedule;
    elements.siteTitle.value = schedule.title;
    elements.termName.value = schedule.term;
    elements.startDate.value = schedule.startDate;
    elements.weekCount.value = String(schedule.weeks);
    elements.periods.value = schedule.periods.map((period) => `${period.name} | ${period.start} | ${period.end}`).join('\n');
  }

  function miniButton(label, handler, danger = false) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `mini-button${danger ? ' danger' : ''}`;
    button.textContent = label;
    button.addEventListener('click', handler);
    return button;
  }

  function renderClasses() {
    elements.classAdmin.replaceChildren();
    state.schedule.classes.forEach((schoolClass) => {
      const card = document.createElement('article');
      card.className = `class-card${schoolClass.id === state.classId ? ' selected' : ''}`;
      const select = document.createElement('button');
      select.type = 'button';
      select.className = 'class-card-select';
      const name = document.createElement('strong');
      name.textContent = schoolClass.name;
      const note = document.createElement('span');
      note.textContent = schoolClass.note || '暂无备注';
      select.append(name, note);
      select.addEventListener('click', () => {
        state.classId = schoolClass.id;
        renderClasses();
        renderLessons();
      });
      const actions = document.createElement('div');
      actions.className = 'class-actions';
      actions.append(
        miniButton('编辑', () => openClassDialog(schoolClass)),
        miniButton('删除', () => deleteClass(schoolClass), true),
      );
      if (state.schedule.classes.length === 1) actions.lastElementChild.disabled = true;
      card.append(select, actions);
      elements.classAdmin.append(card);
    });
  }

  function lessonTimeLabel(lesson) {
    const periods = state.schedule.periods;
    const start = periods[lesson.start];
    const end = periods[lesson.end];
    const clock = start && end ? `${start.start}–${end.end}` : '节次待修正';
    return `${U.DAYS[lesson.day]} · 第 ${lesson.start + 1}–${lesson.end + 1} 节 · ${clock}`;
  }

  function renderLessons() {
    const schoolClass = state.schedule.classes.find((item) => item.id === state.classId) || state.schedule.classes[0];
    state.classId = schoolClass.id;
    elements.lessonClassName.textContent = `当前班级：${schoolClass.name}`;
    elements.lessonList.replaceChildren();
    const lessons = state.schedule.lessons
      .filter((lesson) => lesson.classId === state.classId)
      .sort((a, b) => a.day - b.day || a.start - b.start || a.name.localeCompare(b.name, 'zh-CN'));
    if (!lessons.length) {
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.textContent = '这个班级还没有课程，点击“新增课程”开始排课。';
      elements.lessonList.append(empty);
      return;
    }
    lessons.forEach((lesson) => {
      const row = document.createElement('article');
      row.className = 'admin-lesson';
      const identity = document.createElement('div');
      const title = document.createElement('strong');
      const dot = document.createElement('i');
      dot.className = `lesson-color-dot ${lesson.color}`;
      title.append(dot, document.createTextNode(lesson.name));
      const staff = document.createElement('span');
      staff.textContent = `${lesson.teacher || '教师待安排'} · ${lesson.room || '地点待安排'}`;
      identity.append(title, staff);
      const time = document.createElement('div');
      time.textContent = lessonTimeLabel(lesson);
      const weeks = document.createElement('div');
      weeks.textContent = `第 ${lesson.from}–${lesson.to} 周 · ${U.PARITY_LABELS[lesson.parity]}`;
      const actions = document.createElement('div');
      actions.className = 'admin-lesson-actions';
      actions.append(
        miniButton('编辑', () => openLessonDialogSafely(lesson)),
        miniButton('删除', () => deleteLesson(lesson), true),
      );
      row.append(identity, time, weeks, actions);
      elements.lessonList.append(row);
    });
  }

  function renderEditor() {
    fillSettings();
    renderClasses();
    renderLessons();
    elements.editor.hidden = false;
    elements.disconnect.hidden = false;
    elements.connectionStatus.textContent = `已连接 ${state.owner}/${state.repo}`;
    elements.connectionStatus.classList.add('connected');
    setDirty(false);
  }

  function openClassDialog(schoolClass) {
    elements.classDialogTitle.textContent = schoolClass ? '编辑班级' : '新增班级';
    elements.classId.value = schoolClass ? schoolClass.id : '';
    elements.className.value = schoolClass ? schoolClass.name : '';
    elements.classNote.value = schoolClass ? schoolClass.note : '';
    elements.classDialog.showModal();
    elements.className.focus();
  }

  function deleteClass(schoolClass) {
    if (state.schedule.classes.length === 1) return;
    if (!confirm(`删除“${schoolClass.name}”及该班级的所有课程？`)) return;
    state.schedule.classes = state.schedule.classes.filter((item) => item.id !== schoolClass.id);
    state.schedule.lessons = state.schedule.lessons.filter((lesson) => lesson.classId !== schoolClass.id);
    if (state.classId === schoolClass.id) state.classId = state.schedule.classes[0].id;
    setDirty();
    renderClasses();
    renderLessons();
  }

  function fillPeriodOptions(selectedStart, selectedEnd) {
    elements.lessonStart.replaceChildren();
    elements.lessonEnd.replaceChildren();
    state.schedule.periods.forEach((period, index) => {
      const startOption = document.createElement('option');
      startOption.value = String(index);
      startOption.textContent = `${period.name} ${period.start}`;
      elements.lessonStart.append(startOption);
      if (index >= selectedStart) {
        const endOption = document.createElement('option');
        endOption.value = String(index);
        endOption.textContent = `${period.name} ${period.end}`;
        elements.lessonEnd.append(endOption);
      }
    });
    elements.lessonStart.value = String(selectedStart);
    elements.lessonEnd.value = String(Math.max(selectedStart, selectedEnd));
  }

  function openLessonDialog(lesson) {
    const draft = lesson || {
      id: '',
      name: '',
      teacher: '',
      room: '',
      day: 0,
      start: 0,
      end: Math.min(1, state.schedule.periods.length - 1),
      from: 1,
      to: state.schedule.weeks,
      parity: 'all',
      color: 'blue',
    };
    elements.lessonDialogTitle.textContent = lesson ? '编辑课程' : '新增课程';
    elements.lessonId.value = draft.id;
    elements.lessonName.value = draft.name;
    elements.lessonTeacher.value = draft.teacher;
    elements.lessonRoom.value = draft.room;
    elements.lessonDay.value = String(draft.day);
    elements.lessonParity.value = draft.parity;
    elements.lessonFrom.value = String(draft.from);
    elements.lessonFrom.max = String(state.schedule.weeks);
    elements.lessonTo.value = String(draft.to);
    elements.lessonTo.max = String(state.schedule.weeks);
    elements.lessonColor.value = draft.color;
    fillPeriodOptions(draft.start, draft.end);
    elements.lessonDialog.showModal();
    elements.lessonName.focus();
  }

  function openLessonDialogSafely(lesson) {
    try {
      syncSettingsFromInputs();
      if (!state.schedule.periods.length) throw new Error('请先设置至少一个有效节次。');
      openLessonDialog(lesson);
    } catch (error) {
      showMessage('error', error instanceof Error ? error.message : '节次设置无效。');
    }
  }

  function deleteLesson(lesson) {
    if (!confirm(`删除课程“${lesson.name}”？`)) return;
    state.schedule.lessons = state.schedule.lessons.filter((item) => item.id !== lesson.id);
    state.schedule.demo = state.schedule.lessons.some((item) => item.id.startsWith('sample-'));
    setDirty();
    renderLessons();
  }

  async function loadRepository() {
    clearMessages();
    setBusy(true, '正在读取仓库…');
    try {
      const file = await githubRequest(apiUrl());
      if (file.type !== 'file' || typeof file.content !== 'string' || typeof file.sha !== 'string') throw new Error('GitHub 返回的课表文件格式无效。');
      const schedule = JSON.parse(decodeBase64(file.content));
      const invalid = U.validateSchedule(schedule);
      if (invalid) throw new Error(`仓库中的课表无法编辑：${invalid}`);
      state.schedule = U.clone(schedule);
      state.sha = file.sha;
      state.classId = schedule.classes[0].id;
      persistConnectionFields();
      renderEditor();
      showMessage('success', `已从 ${state.owner}/${state.repo}@${state.branch} 加载课表。`);
    } finally {
      setBusy(false, state.schedule ? `已连接 ${state.owner}/${state.repo}` : '连接失败');
    }
  }

  async function saveRepository() {
    clearMessages();
    try {
      syncSettingsFromInputs();
      state.schedule.demo = state.schedule.lessons.some((lesson) => lesson.id.startsWith('sample-'));
      const invalid = U.validateSchedule(state.schedule);
      if (invalid) throw new Error(invalid);
      setBusy(true, '正在提交更新…');
      const latest = await githubRequest(apiUrl());
      if (latest.sha !== state.sha) throw new Error('仓库中的课表已被其他人更新，请点击“放弃更改并重载”后再编辑。');
      const content = `${JSON.stringify(state.schedule, null, 2)}\n`;
      const result = await githubRequest(apiUrl(false), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `更新课程表（${new Date().toLocaleString('zh-CN', { hour12: false })}）`,
          content: encodeBase64(content),
          sha: state.sha,
          branch: state.branch,
        }),
      });
      state.sha = result.content.sha;
      setDirty(false);
      showMessage('success', '课表已提交。GitHub Actions 通常会在 1–2 分钟内更新公开网站。');
    } catch (error) {
      showMessage('error', error instanceof Error ? error.message : '保存失败，请稍后重试。');
    } finally {
      setBusy(false, state.schedule ? `已连接 ${state.owner}/${state.repo}` : '尚未连接');
    }
  }

  elements.connectionForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearMessages();
    try {
      normalizeConnection();
      const token = elements.token.value.trim();
      if (!token) throw new Error('请输入 GitHub 访问令牌。');
      sessionStorage.setItem('timetable_github_pat', token);
      elements.token.value = '';
      await loadRepository();
    } catch (error) {
      if (!state.schedule) sessionStorage.removeItem('timetable_github_pat');
      showMessage('error', error instanceof Error ? error.message : '连接失败，请稍后重试。');
      setBusy(false, '连接失败');
    }
  });

  elements.disconnect.addEventListener('click', () => {
    if (state.dirty && !confirm('当前有未提交的更改，仍要断开连接吗？')) return;
    sessionStorage.removeItem('timetable_github_pat');
    state.schedule = null;
    state.sha = '';
    state.dirty = false;
    elements.editor.hidden = true;
    elements.disconnect.hidden = true;
    elements.connectionStatus.textContent = '尚未连接';
    elements.connectionStatus.classList.remove('connected');
    clearMessages();
  });

  [elements.siteTitle, elements.termName, elements.startDate, elements.weekCount, elements.periods].forEach((input) => {
    input.addEventListener('input', () => setDirty());
  });

  elements.addClass.addEventListener('click', () => openClassDialog(null));
  elements.classForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const id = elements.classId.value || U.makeId('class');
    const name = elements.className.value.trim();
    const note = elements.classNote.value.trim();
    if (!name) return;
    if (state.schedule.classes.some((item) => item.name === name && item.id !== id)) {
      elements.className.setCustomValidity('班级名称不能重复。');
      elements.className.reportValidity();
      return;
    }
    elements.className.setCustomValidity('');
    const schoolClass = { id, name, note };
    const index = state.schedule.classes.findIndex((item) => item.id === id);
    if (index >= 0) state.schedule.classes[index] = schoolClass;
    else state.schedule.classes.push(schoolClass);
    state.classId = id;
    elements.classDialog.close();
    setDirty();
    renderClasses();
    renderLessons();
  });

  U.DAYS.forEach((day, index) => {
    const option = document.createElement('option');
    option.value = String(index);
    option.textContent = day;
    elements.lessonDay.append(option);
  });
  elements.lessonStart.addEventListener('change', () => {
    const start = Number(elements.lessonStart.value);
    const end = Math.max(start, Number(elements.lessonEnd.value));
    fillPeriodOptions(start, end);
  });
  elements.addLesson.addEventListener('click', () => {
    try {
      syncSettingsFromInputs();
      if (!state.schedule.periods.length) throw new Error('请先设置至少一个有效节次。');
      openLessonDialog(null);
    } catch (error) {
      showMessage('error', error instanceof Error ? error.message : '节次设置无效。');
    }
  });
  elements.lessonForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const previousId = elements.lessonId.value;
    const lesson = {
      id: previousId && !previousId.startsWith('sample-') ? previousId : U.makeId('lesson'),
      classId: state.classId,
      name: elements.lessonName.value.trim(),
      teacher: elements.lessonTeacher.value.trim(),
      room: elements.lessonRoom.value.trim(),
      day: Number(elements.lessonDay.value),
      start: Number(elements.lessonStart.value),
      end: Number(elements.lessonEnd.value),
      from: Number(elements.lessonFrom.value),
      to: Number(elements.lessonTo.value),
      parity: elements.lessonParity.value,
      color: elements.lessonColor.value,
    };
    const index = state.schedule.lessons.findIndex((item) => item.id === previousId);
    const previousLesson = index >= 0 ? state.schedule.lessons[index] : null;
    if (index >= 0) state.schedule.lessons[index] = lesson;
    else state.schedule.lessons.push(lesson);
    const invalid = U.validateSchedule(state.schedule);
    if (invalid) {
      if (index >= 0) state.schedule.lessons[index] = previousLesson;
      else state.schedule.lessons.pop();
      elements.lessonName.setCustomValidity(invalid);
      elements.lessonName.reportValidity();
      return;
    }
    elements.lessonName.setCustomValidity('');
    state.schedule.demo = state.schedule.lessons.some((item) => item.id.startsWith('sample-'));
    elements.lessonDialog.close();
    setDirty();
    renderLessons();
  });

  document.querySelectorAll('[data-close-dialog]').forEach((button) => {
    button.addEventListener('click', () => byId(button.dataset.closeDialog).close());
  });
  elements.className.addEventListener('input', () => elements.className.setCustomValidity(''));
  elements.lessonName.addEventListener('input', () => elements.lessonName.setCustomValidity(''));
  elements.reload.addEventListener('click', async () => {
    if (state.dirty && !confirm('放弃当前未提交的更改，并从仓库重新加载吗？')) return;
    try {
      await loadRepository();
    } catch (error) {
      showMessage('error', error instanceof Error ? error.message : '重新加载失败。');
    }
  });
  elements.save.addEventListener('click', saveRepository);
  window.addEventListener('beforeunload', (event) => {
    if (!state.dirty) return;
    event.preventDefault();
    event.returnValue = '';
  });

  restoreConnectionFields();
})();
