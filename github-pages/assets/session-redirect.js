(function () {
  'use strict';

  const Api = window.TimetableApi;
  if (!Api) return;

  const accountLink = document.querySelector('#account-link');
  if (Api.isGitHubPagesMirror()) {
    if (accountLink) accountLink.href = Api.primaryAppUrl('login/');
    return;
  }

  Api.request('/api/auth/me', { auth: false })
    .then(() => {
      if (!accountLink) return;
      accountLink.href = Api.rootUrl('app/');
      accountLink.textContent = '我的课表';
    })
    .catch((error) => {
      if (error?.status !== 401) {
        if (accountLink) accountLink.title = '账户服务暂时不可用';
      }
    });
})();
