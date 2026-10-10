# 课间 · 多班级课程表

面向访客的中文课表网站，以及通过 GitHub 仓库权限保存修改的在线管理后台。

## 在线地址

- 公开课表：<https://wangaoqi23.github.io/class-timetable/>
- 管理后台：<https://wangaoqi23.github.io/class-timetable/admin/>

GitHub Pages 发布文件位于 `github-pages/`，每次后台保存课表后，GitHub Actions 会自动更新公开网站。

## 功能

- 按班级、教学周查看周一至周日课程，手机按天展示。
- 课程详情包含任课教师、教室、节次与单双周。
- 管理员新增、修改、删除班级和课程；设置网站名称、学期开始日期、教学周数、每日作息。
- GitHub Pages 版将课表保存在 `github-pages/data/schedule.json`；公开查看无需账号，后台通过 GitHub Contents 权限保存。
- 管理后台在提交前比较 Git blob SHA，防止多人编辑时覆盖较新的内容。
- 内置明确标注的示例数据，可一键清除。修改过的示例课程转为正式课程并保留。

## GitHub Pages 管理

打开上面的管理后台，填写仓库 `wangaoqi23/class-timetable`、分支 `main`，以及仅授权此仓库且 Contents 权限为 Read and write 的 fine-grained PAT。令牌只保存在当前标签页的 `sessionStorage`，不会写入源码、课表或网址。

详细说明见 [`github-pages/README.md`](github-pages/README.md)。

## 本地开发

需要 Node.js >= 22.13 和 npm。安装依赖后启动：

```sh
npm run install:ci
npm run db:generate
npm run build
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_*.sql
npm run dev
```

迁移文件名应替换为实际生成的文件，并按顺序每个仅执行一次。
本地环境在未跟踪的 .dev.vars 中设置 ADMIN_EMAIL。只填写你实际使用的管理员邮箱，不能提交该文件。
本地预览没有线上身份转发，/admin 默认会显示登录页；线上登录由 Sites 负责。

## Sites 全栈版本

仓库也保留了原有 Vinext / React、Cloudflare Workers 与 D1 实现，Sites 保存发布版本并应用数据库迁移。
.openai/hosting.json 保存站点身份和逻辑 DB 绑定，运行时管理员邮箱通过 Sites 的 ADMIN_EMAIL secret 配置。
不要将管理员邮箱、访问令牌或本地数据库提交到源码仓库。

未经登录或未获授权的访问者无法通过隐藏 URL 或直接请求 API 修改课表。
