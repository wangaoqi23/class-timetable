# GitHub Pages 课程表

这个目录是一套不依赖服务端运行环境的课程表网站。GitHub Actions 会把 `github-pages/` 目录发布到 GitHub Pages。

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

## 本地检查

在项目根目录运行：

```bash
npm run test:pages
```

本地预览需要通过 HTTP 提供静态文件，不能直接双击 `index.html`，因为浏览器会限制 `file://` 页面读取 JSON。
