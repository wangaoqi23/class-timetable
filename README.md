# 课间 · 多班级课程表

面向访客的中文课表网站，以及仅管理员可编辑的在线后台。

## 功能

- 按班级、教学周查看周一至周日课程，手机按天展示。
- 课程详情包含任课教师、教室、节次与单双周。
- 管理员新增、修改、删除班级和课程；设置网站名称、学期开始日期、教学周数、每日作息。
- 课表存储在云端 D1 数据库。公开查看无需账号，后台使用 ChatGPT 登录并校验管理员邮箱。
- 服务端校验课程时间冲突，数据库版本比较防止多窗口编辑覆盖。
- 内置明确标注的示例数据，可一键清除。修改过的示例课程转为正式课程并保留。

## 使用

查看网站根路径；后台路径为 /admin。管理员使用发布时指定的 ChatGPT 账号登录。
上线后可先编辑班级名称，再点击课程卡片编辑，或清空示例课程后重新排课。

访客课表在重新打开、切回页面或每隔一分钟刷新数据。每次后台保存会立即写入共享数据库。

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

## 发布

本项目使用 Vinext / React、Cloudflare Workers 与 D1，Sites 保存发布版本并应用数据库迁移。
.openai/hosting.json 保存站点身份和逻辑 DB 绑定，运行时管理员邮箱通过 Sites 的 ADMIN_EMAIL secret 配置。
不要将管理员邮箱、访问令牌或本地数据库提交到源码仓库。

未经登录或未获授权的访问者无法通过隐藏 URL 或直接请求 API 修改课表。
