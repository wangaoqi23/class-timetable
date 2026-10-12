(function () {
  'use strict';

  const Api = window.TimetableApi;
  if (!Api || Api.redirectAccountPageToPrimary()) return;

  const U = window.ScheduleUtils;
  const FACE_SHARE_API = 'https://class-timetable.wangaoqi23.workers.dev/api/face-shares/preview';
  const state = { shareId: '', shareCode: '', share: null, schedule: null, user: null, classId: '', week: 1, importing: false };
  const byId = (id) => document.getElementById(id);
  const elements = {
    loading: byId('import-loading'),
    codeEntry: byId('import-code-entry'),
    codeForm: byId('import-code-form'),
    codeInput: byId('import-code'),
    codeSubmit: byId('import-code-submit'),
    codeError: byId('import-code-error'),
    error: byId('import-error'),
    errorText: byId('import-error-text'),
    retry: byId('import-retry'),
    enterCode: byId('import-enter-code'),
    content: byId('import-content'),
    name: byId('shared-name'),
    title: byId('shared-title'),
    term: byId('shared-term'),
    classCount: byId('shared-class-count'),
    lessonCount: byId('shared-lesson-count'),
    weekCount: byId('shared-week-count'),
    shareCode: byId('shared-code'),
    expiry: byId('shared-expiry'),
    classSelect: byId('import-class'),
    weekSelect: byId('import-week'),
    courseCount: byId('import-course-count'),
    dayList: byId('import-day-list'),
    account: byId('import-account'),
    form: byId('import-form'),
    importName: byId('import-name'),
    submit: byId('import-submit'),
    actionError: byId('import-action-error'),
  };

  function option(value, label) {
    const item = document.createElement('option');
    item.value = String(value);
    item.textContent = label;
    return item;
  }

  function shareIdFromLocation() {
    const encoded = window.location.hash.slice(1);
    try {
      return decodeURIComponent(encoded).trim();
    } catch {
      return '';
    }
  }

  function parseShare(payload) {
    const body = payload?.data || payload;
    const share = body?.share || body;
    const schedule = share?.data || body?.schedule?.data || body?.schedule;
    if (!share || typeof share !== 'object' || !schedule || typeof schedule !== 'object') {
      throw new Error('分享响应格式无效。');
    }
    const invalid = U.validateSchedule(schedule);
    if (invalid) throw new Error('分享课表无法预览：' + invalid);
    return { share, schedule };
  }

  function showFatalError(message) {
    elements.codeEntry.hidden = true;
    elements.loading.hidden = true;
    elements.content.hidden = true;
    elements.error.hidden = false;
    elements.errorText.textContent = message;
  }

  function showCodeEntry() {
    elements.loading.hidden = true;
    elements.error.hidden = true;
    elements.content.hidden = true;
    elements.codeEntry.hidden = false;
    elements.codeError.hidden = true;
    elements.codeInput.focus();
  }

  async function resolveFaceCode(event) {
    event.preventDefault();
    const code = elements.codeInput.value.replace(/\D/g, '').slice(0, 6);
    elements.codeInput.value = code;
    elements.codeError.hidden = true;
    if (!/^\d{6}$/.test(code)) {
      elements.codeInput.setCustomValidity('请输入 6 位数字分享码。');
      elements.codeInput.reportValidity();
      return;
    }
    elements.codeInput.setCustomValidity('');
    elements.codeSubmit.disabled = true;
    elements.codeSubmit.textContent = '正在查找…';
    try {
      const response = await fetch(FACE_SHARE_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
        signal: AbortSignal.timeout(6000),
      });
      let payload = null;
      try { payload = await response.json(); } catch { payload = null; }
      if (!response.ok || !payload?.share?.token) {
        throw new Error(response.status === 410 ? '分享码已过期，请让对方重新生成。' : '没有找到这个分享码，请检查后重试。');
      }
      window.location.hash = payload.share.token;
    } catch (error) {
      elements.codeError.textContent = error instanceof Error ? error.message : '暂时无法读取分享码。';
      elements.codeError.hidden = false;
    } finally {
      elements.codeSubmit.disabled = false;
      elements.codeSubmit.textContent = '打开课表';
    }
  }

  function showActionError(message) {
    elements.actionError.textContent = message;
    elements.actionError.hidden = !message;
  }

  function formatExpiry(value) {
    if (!value) return '未注明';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '未注明' : date.toLocaleString('zh-CN', { hour12: false });
  }

  function renderSummary() {
    const share = state.share;
    const schedule = state.schedule;
    const sharedName = share.name || schedule.title || '分享课表';
    elements.name.textContent = sharedName;
    elements.title.textContent = schedule.title;
    elements.term.textContent = schedule.term;
    elements.classCount.textContent = schedule.classes.length + ' 个';
    elements.lessonCount.textContent = schedule.lessons.length + ' 门次';
    elements.weekCount.textContent = schedule.weeks + ' 周';
    elements.shareCode.textContent = state.shareCode;
    elements.expiry.textContent = formatExpiry(share.expiresAt);
    elements.importName.value = sharedName.slice(0, 50);
  }

  function renderFilters() {
    const schedule = state.schedule;
    elements.classSelect.replaceChildren();
    schedule.classes.forEach((schoolClass) => elements.classSelect.append(option(schoolClass.id, schoolClass.name)));
    if (!schedule.classes.some((item) => item.id === state.classId)) state.classId = schedule.classes[0].id;
    elements.classSelect.value = state.classId;

    elements.weekSelect.replaceChildren();
    for (let week = 1; week <= schedule.weeks; week += 1) {
      elements.weekSelect.append(option(week, '第 ' + week + ' 周'));
    }
    state.week = Math.max(1, Math.min(schedule.weeks, state.week));
    elements.weekSelect.value = String(state.week);
  }

  function lessonCard(lesson) {
    const card = document.createElement('article');
    card.className = 'import-lesson ' + (U.COLORS.includes(lesson.color) ? lesson.color : 'blue');
    const name = document.createElement('strong');
    name.textContent = lesson.name;
    const detail = document.createElement('span');
    const start = state.schedule.periods[lesson.start];
    const end = state.schedule.periods[lesson.end];
    detail.textContent = start.start + '–' + end.end + ' · ' + (lesson.room || '地点待安排');
    const meta = document.createElement('span');
    meta.textContent = (lesson.teacher || '教师待安排') + ' · 第 ' + (lesson.start + 1) + '–' + (lesson.end + 1) + ' 节';
    card.append(name, detail, meta);
    return card;
  }

  function renderPreview() {
    const lessons = U.visibleLessons(state.schedule, state.classId, state.week);
    const dates = U.weekDates(state.schedule, state.week);
    elements.courseCount.textContent = '第 ' + state.week + ' 周共 ' + lessons.length + ' 门次课程';
    elements.dayList.replaceChildren();
    U.DAYS.forEach((day, dayIndex) => {
      const dayLessons = lessons.filter((lesson) => lesson.day === dayIndex).sort((a, b) => a.start - b.start);
      const section = document.createElement('section');
      section.className = 'import-day';
      const heading = document.createElement('h3');
      const label = document.createElement('span');
      label.textContent = day;
      const date = document.createElement('small');
      date.textContent = dates[dayIndex];
      heading.append(label, date);
      section.append(heading);
      if (dayLessons.length) {
        dayLessons.forEach((lesson) => section.append(lessonCard(lesson)));
      } else {
        const empty = document.createElement('p');
        empty.className = 'import-day-empty';
        empty.textContent = '无课程';
        section.append(empty);
      }
      elements.dayList.append(section);
    });
  }

  async function checkAccount() {
    try {
      const payload = await Api.request('/api/auth/me', { auth: false });
      const body = payload?.data || payload;
      state.user = body?.user || body;
      elements.account.textContent = '将导入到 ' + (state.user?.username || '当前账户') + '，之后可独立编辑。';
      elements.submit.disabled = false;
    } catch (error) {
      if (error?.status === 401) {
        elements.account.textContent = '需要先登录，登录后会自动返回这个分享链接。';
        elements.submit.disabled = true;
        window.location.replace(Api.loginUrl());
        return;
      }
      elements.account.textContent = '暂时无法确认登录状态，请稍后重试。';
      elements.submit.disabled = true;
      showActionError(error instanceof Error ? error.message : '账户服务暂时不可用。');
    }
  }

  async function loadShare() {
    state.shareId = shareIdFromLocation();
    elements.error.hidden = true;
    elements.content.hidden = true;
    elements.codeEntry.hidden = true;
    elements.loading.hidden = false;
    showActionError('');
    if (!state.shareId) {
      showCodeEntry();
      return;
    }
    if (state.shareId.length > 100000) {
      showFatalError('分享数据无效或不完整。');
      return;
    }
    try {
      const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(state.shareId)));
      state.shareCode = String(new DataView(digest.buffer).getUint32(0) % 1000000).padStart(6, '0');
      const payload = await Api.request('/api/shares/preview', {
        method: 'POST',
        auth: false,
        body: JSON.stringify({ token: state.shareId }),
      });
      const parsed = parseShare(payload);
      state.share = parsed.share;
      state.schedule = parsed.schedule;
      state.classId = state.schedule.classes[0].id;
      state.week = Math.max(1, Math.min(state.schedule.weeks, U.currentWeek(state.schedule)));
      renderSummary();
      renderFilters();
      renderPreview();
      elements.loading.hidden = true;
      elements.content.hidden = false;
      await checkAccount();
    } catch (error) {
      const message = error?.status === 404 || error?.status === 410
        ? '这条分享链接不存在或已经过期。'
        : error instanceof Error ? error.message : '加载分享课表失败。';
      showFatalError(message);
    }
  }

  async function importSchedule(event) {
    event.preventDefault();
    if (state.importing || !state.shareId) return;
    state.importing = true;
    showActionError('');
    elements.submit.disabled = true;
    elements.submit.textContent = '正在导入…';
    try {
      const name = elements.importName.value.trim();
      if (!name) throw new Error('请填写导入后的课表名称。');
      const payload = await Api.request('/api/shares/import', {
        method: 'POST',
        body: JSON.stringify({ token: state.shareId, name }),
      });
      const body = payload?.data || payload;
      const record = body?.schedule || body;
      if (!record?.id) throw new Error('导入成功，但响应缺少课表编号。');
      const target = new URL('app/', Api.rootUrl(''));
      target.searchParams.set('schedule', record.id);
      window.location.replace(target.href);
    } catch (error) {
      const message = error?.status === 409
        ? '你的账户中已有同名课表，请修改上面的名称后重试。'
        : error instanceof Error ? error.message : '导入失败，请稍后重试。';
      showActionError(message);
      state.importing = false;
      elements.submit.disabled = false;
      elements.submit.textContent = '一键导入';
    }
  }

  elements.classSelect.addEventListener('change', () => {
    state.classId = elements.classSelect.value;
    renderPreview();
  });
  elements.weekSelect.addEventListener('change', () => {
    state.week = Number(elements.weekSelect.value);
    renderPreview();
  });
  elements.form.addEventListener('submit', importSchedule);
  elements.retry.addEventListener('click', loadShare);
  elements.enterCode.addEventListener('click', showCodeEntry);
  elements.codeForm.addEventListener('submit', resolveFaceCode);
  elements.codeInput.addEventListener('input', () => {
    elements.codeInput.value = elements.codeInput.value.replace(/\D/g, '').slice(0, 6);
    elements.codeInput.setCustomValidity('');
    elements.codeError.hidden = true;
  });
  window.addEventListener('hashchange', loadShare);

  loadShare();
})();
