(function () {
  'use strict';

  const Api = window.TimetableApi;
  if (!Api || Api.redirectAccountPageToPrimary()) return;

  const elements = {
    form: document.querySelector('#auth-form'),
    loginTab: document.querySelector('#login-tab'),
    registerTab: document.querySelector('#register-tab'),
    registerFields: document.querySelector('#register-fields'),
    fullName: document.querySelector('#auth-full-name'),
    classSelect: document.querySelector('#auth-class'),
    username: document.querySelector('#auth-username'),
    password: document.querySelector('#auth-password'),
    kicker: document.querySelector('#auth-kicker'),
    title: document.querySelector('#auth-title'),
    submit: document.querySelector('#auth-submit'),
    error: document.querySelector('#auth-error'),
  };
  let mode = new URLSearchParams(window.location.search).get('mode') === 'login' ? 'login' : 'register';
  let submitting = false;
  let baseSchedule = null;

  function authErrorMessage(error) {
    const detail = error?.payload?.error;
    if (detail?.code === 'username_taken') return '这个用户名已经注册，请直接登录或换一个用户名。';
    if (detail?.code === 'invalid_credentials') return '用户名或密码不正确。';
    if (detail?.code === 'rate_limited') return '尝试次数过多，请稍后再试。';
    if (detail?.code === 'invalid_input' && detail?.field === 'username') {
      return '用户名需为 3–32 位，可使用中英文字母、数字、点、下划线和连字符。';
    }
    if (detail?.code === 'invalid_input' && detail?.field === 'password') {
      return '密码需为 8–128 位。';
    }
    if (detail?.code === 'invalid_input' && detail?.field === 'fullName') return '姓名需为 2–30 位。';
    if (detail?.code === 'invalid_input' && detail?.field === 'classId') return detail.message || '请选择专业班级。';
    return error instanceof Error ? error.message : '操作失败，请稍后重试。';
  }

  function showError(message) {
    elements.error.textContent = message;
    elements.error.hidden = !message;
  }

  function updateSubmit() {
    elements.submit.disabled = submitting;
    elements.submit.textContent = submitting
      ? mode === 'register' ? '正在注册…' : '正在登录…'
      : mode === 'register' ? '注册并创建课表' : '登录并进入';
  }

  function setMode(nextMode) {
    mode = nextMode;
    const registering = mode === 'register';
    elements.loginTab.classList.toggle('active', !registering);
    elements.registerTab.classList.toggle('active', registering);
    elements.loginTab.setAttribute('aria-selected', String(!registering));
    elements.registerTab.setAttribute('aria-selected', String(registering));
    elements.password.autocomplete = registering ? 'new-password' : 'current-password';
    elements.registerFields.hidden = !registering;
    elements.fullName.required = registering;
    elements.classSelect.required = registering;
    elements.kicker.textContent = registering ? 'CREATE ACCOUNT' : 'WELCOME BACK';
    elements.title.textContent = registering ? '创建个人账户' : '登录你的账户';
    showError('');
    updateSubmit();
  }

  function continueToNextPage() {
    const fragment = new URLSearchParams(window.location.hash.slice(1));
    window.location.replace(Api.safeNext(fragment.get('next'), 'app/'));
  }

  elements.loginTab.addEventListener('click', () => setMode('login'));
  elements.registerTab.addEventListener('click', () => setMode('register'));
  elements.form.addEventListener('submit', async (event) => {
    event.preventDefault();
    showError('');
    submitting = true;
    updateSubmit();
    try {
      if (mode === 'register' && !baseSchedule) throw new Error('基础课表尚未加载，请刷新页面后重试。');
      const selectedClass = baseSchedule?.classes?.find((item) => item.id === elements.classSelect.value);
      const body = {
        username: elements.username.value.trim(),
        password: elements.password.value,
        ...(mode === 'register' ? {
          fullName: elements.fullName.value.trim(),
          classId: selectedClass?.id || '',
          className: selectedClass?.name || '',
          baseSchedule,
        } : {}),
      };
      await Api.request(`/api/auth/${mode}`, { method: 'POST', auth: false, body: JSON.stringify(body) });
      continueToNextPage();
    } catch (error) {
      showError(authErrorMessage(error));
    } finally {
      submitting = false;
      updateSubmit();
    }
  });

  async function loadClasses() {
    try {
      const response = await fetch(Api.rootUrl('data/schedule.json'), { cache: 'force-cache' });
      if (!response.ok) throw new Error('班级数据加载失败。');
      const data = await response.json();
      if (!Array.isArray(data.classes) || !data.classes.length) throw new Error('暂时没有可选班级。');
      baseSchedule = data;
      elements.classSelect.replaceChildren();
      data.classes.forEach((schoolClass) => {
        const option = document.createElement('option');
        option.value = schoolClass.id;
        option.textContent = schoolClass.note ? `${schoolClass.name} · ${schoolClass.note}` : schoolClass.name;
        elements.classSelect.append(option);
      });
      elements.classSelect.disabled = false;
    } catch (error) {
      const option = document.createElement('option');
      option.value = '';
      option.textContent = '班级加载失败';
      elements.classSelect.replaceChildren(option);
      showError(error instanceof Error ? error.message : '班级数据加载失败。');
    }
  }

  async function restoreSession() {
    setMode(mode);
    const localUser = Api.localSessionUser();
    if (localUser) {
      continueToNextPage();
      return;
    }
    await loadClasses();
    if (Api.isGitHubPagesMirror()) return;
    try {
      await Api.request('/api/auth/me', { auth: false });
      continueToNextPage();
    } catch (error) {
      if (error?.status !== 401) showError(error instanceof Error ? error.message : '暂时无法检查登录状态。');
    }
  }

  restoreSession();
})();
