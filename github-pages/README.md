# GitHub Pages 课程表

这个目录包含 GitHub Pages 网站入口和 Cloudflare Worker 同源提供的账户前端资源。访问入口会先进入注册页；注册、登录、公共课表、个人课表与分享导入在 <https://class-timetable.wangaoqi23.workers.dev/> 使用同源 `/api`。

## 发布

1. 把本项目推送到 GitHub 仓库的 `main` 分支。
2. 打开仓库 **Settings → Pages**，在 **Build and deployment** 中选择 **GitHub Actions**。
3. 打开 **Actions**，等待 **Deploy timetable to GitHub Pages** 工作流完成。
4. 公开地址通常是 `https://<用户名>.github.io/<仓库名>/`，管理页地址在公开地址后加 `admin/`。

工作流也可以在 Actions 页面手动运行。每次管理后台提交 `data/schedule.json` 后，它会自动重新发布网站。

## 管理后台

管理页通过 GitHub Contents API 直接修改仓库中的 `github-pages/data/schedule.json`。优先创建一个 fine-grained personal access token：

- Repository access 只选择本课程表仓库。
- Repository permissions 中把 **Contents** 设为 **Read and write**。
- 建议设置较短的有效期，并在不再使用时删除令牌。

如果账号中没有 Fine-grained PAT 入口，可以使用 [Classic token](https://github.com/settings/tokens/new?description=Class%20Timetable%20Admin&scopes=public_repo)，只勾选 `public_repo`。管理后台同时接受 `github_pat_…` 和 `ghp_…` 两种令牌。

令牌只写入当前标签页的 `sessionStorage`，不会加入课表 JSON、Git 提交或网址。仓库名称和分支保存在浏览器 `localStorage`，便于下次填写。

多人同时编辑时，管理页会检查 Git blob SHA。如果远程文件在当前编辑期间发生变化，保存会停止并要求先重载，以免覆盖别人的更新。

## 数据与功能

- `data/schedule.json`：唯一的课表数据源。
- `index.html`：访客查看页，支持多班级、教学周切换、单双周、桌面表格和手机日程卡片。
- `admin/index.html`：班级、课程、学期和节次管理。
- `assets/shared.js`：数据校验、周次和日期计算。
- `assets/app.js`：公开课表交互。
- `assets/admin.js`：管理界面和 GitHub API 提交。
- `login/`：注册和登录入口，使用服务端 HttpOnly Cookie 保持会话。
- `app/`：每位用户独立的多课表工作台，可查看、编辑和分享课表。
- `import/#<分享编号>`：分享预览和一键导入页；未登录时会先跳转登录并保留原链接。
- `assets/api-client.js`：同源 API 客户端。写请求从 `tt_csrf` Cookie 读取令牌并发送 `X-CSRF-Token`，不在浏览器存储访问令牌。

账户接口与完整网站同源提供在 `/api` 下。GitHub Pages 入口和 `login/`、`app/`、`import/` 页面会转到 Worker，并保留分享链接的查询参数和 URL 片段。未登录访问公共课表时会先进入注册页；登录成功后服务端设置 `tt_session`（HttpOnly）和 `tt_csrf` Cookie。Worker 的公共课表接口从 GitHub 仓库读取最新 `schedule.json`，前端源码中不需要填写 API 密钥。

## 本地检查

在项目根目录运行：

```bash
npm run test:pages
```

本地预览需要通过 HTTP 提供静态文件，不能直接双击 `index.html`，因为浏览器会限制 `file://` 页面读取 JSON。
