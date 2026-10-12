(function () {
  'use strict';

  const Api = window.TimetableApi;
  if (!Api || Api.redirectAccountPageToPrimary()) return;

  const elements = {
    form: document.querySelector('#auth-form'),
    loginTab: document.querySelector('#login-tab'),
    registerTab: document.querySelector('#register-tab'),
    username: document.querySelector('#auth-username'),
    password: document.querySelector('#auth-password'),
    kicker: document.querySelector('#auth-kicker'),
    title: document.querySelector('#auth-title'),
    submit: document.querySelector('#auth-submit'),
    error: document.querySelector('#auth-error'),
  };
  let mode = new URLSearchParams(window.location.search).get('mode') === 'register' ? 'register' : 'login';
  let submitting = false;

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
      const body = { username: elements.username.value.trim(), password: elements.password.value };
      await Api.request(`/api/auth/${mode}`, { method: 'POST', auth: false, body: JSON.stringify(body) });
      continueToNextPage();
    } catch (error) {
      showError(error instanceof Error ? error.message : '操作失败，请稍后重试。');
    } finally {
      submitting = false;
      updateSubmit();
    }
  });

  async function restoreSession() {
    setMode(mode);
    try {
      await Api.request('/api/auth/me', { auth: false });
      continueToNextPage();
    } catch (error) {
      if (error?.status !== 401) showError(error instanceof Error ? error.message : '暂时无法检查登录状态。');
    }
  }

  restoreSession();
})();
