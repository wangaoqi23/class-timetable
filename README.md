# 课间 · 多用户课程表

支持公开查看、个人账户、独立课表编辑和链接分享的中文课程表网站。

## 在线地址

- 网站入口：<https://wangaoqi23.github.io/class-timetable/>
- 登录 / 注册：<https://wangaoqi23.github.io/class-timetable/login/>
- 个人课表：<https://wangaoqi23.github.io/class-timetable/app/>
- 公共课表：<https://wangaoqi23.github.io/class-timetable/>
- GitHub 课表管理后台：<https://wangaoqi23.github.io/class-timetable/admin/>

GitHub Pages 版本不再依赖国内网络不稳定的 `workers.dev`。首次打开会要求注册；账号和个人课表保存在当前浏览器中，登录状态保存 30 天，分享链接可在其他设备预览并一键导入。

## 功能

- 注册时填写姓名并选择专业班级，系统会自动复制对应公共基础课表作为“我的课表”。
- 公共基础课表与个人课表在同一课表中心切换；个人副本可修改班级、课程、周次、单双周、教室、教师和每日作息。
- 登录状态和上次查看的课表会保留 30 天；老用户再次打开时直接进入课表中心。
- 生成课表分享链接；接收者可先预览，再一键复制到自己的账户中独立编辑。
- 按班级和教学周查看课程，桌面显示周表，手机显示按天日程卡片。
- 默认 10 节作息：08:30–09:15、09:15–10:00、10:20–11:05、11:05–11:50、13:00–13:45、13:45–14:30、14:50–15:35、15:35–16:20、18:00–18:45、18:45–19:30。
- GitHub 管理后台直接维护 `github-pages/data/schedule.json`，登录用户查看公共课表时会读取最新版本。

## 结构

- `github-pages/`：公开课表、账户工作台和响应式前端静态资源。
- `cloudflare-api/`：Cloudflare Worker API、D1 迁移、验证和集成测试。
- `.github/workflows/deploy-pages.yml`：GitHub Pages 自动发布流程。

## 检查与部署

前端检查：

```sh
npm run test:pages
```

Worker 检查和本地集成测试：

```sh
cd cloudflare-api
npm test
npm run check
npm run db:migrate:local
npm run dev
# 在另一个终端运行 npm run test:integration
```

远端部署使用被 Git 忽略的 `cloudflare-api/wrangler.toml`。创建 D1 并填写数据库 ID 后，依次运行 `npm run db:migrate:remote` 和 `npm run deploy`。详细说明见 [`cloudflare-api/README.md`](cloudflare-api/README.md) 与 [`github-pages/README.md`](github-pages/README.md)。
