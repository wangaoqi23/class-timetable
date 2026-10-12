# 课程表多用户 API

这是一个零运行时依赖的 Cloudflare Worker。它使用 D1 保存用户、会话、个人课表和不可变分享快照，并可通过 Workers Static Assets 与 `github-pages/` 前端同源部署。

当前生产账户入口：<https://class-timetable.wangaoqi23.workers.dev/login/>

## 安全模型

- 用户名使用 NFKC 规范化后做唯一性比较，可使用中英文、数字、点、下划线和连字符。
- 密码使用 Web Crypto `PBKDF2-HMAC-SHA-256`、16 字节随机盐和默认 210,000 次迭代。每条用户记录保存自己的迭代次数，登录时可自动升级旧参数。
- 会话令牌是 32 字节随机不透明值，有效期 30 天。原始值只进入 `Secure; HttpOnly; SameSite=Lax` Cookie，D1 仅保存 SHA-256 摘要。
- 分享令牌同样使用 32 字节随机值，链接放在 `/import/#<token>` 的 URL 片段中，D1 只保存 SHA-256 摘要。拥有者列表只返回用于撤销的记录 ID，无法重新导出原分享链接。
- 登录和注册严格校验 `Origin`。其他写操作还要求 `X-CSRF-Token` 与可读的 `tt_csrf` Cookie 常量时间相等。
- 登录和注册在执行 PBKDF2 前经过 D1 原子限流。默认每 15 分钟允许同一地址注册 5 次、登录 20 次，并允许同一地址和用户名组合尝试登录 8 次；超限封锁 15 分钟并返回 `429` 与 `Retry-After`。
- JSON 请求最大 384 KiB。课表字段、日期、时间、周次、颜色和关联关系都经过服务端校验；同一班级在实际生效周的重叠课程会返回 `lesson_conflict`。
- 生产允许的跨域来源默认为 `https://wangaoqi23.github.io`，并始终允许当前 Worker 同源。不允许来源后缀或通配符；只有显式设置 `ALLOW_LOCALHOST_ORIGIN="true"` 时才允许 `http(s)://localhost[:port]`。

## 本地准备

1. 将 `wrangler.toml.example` 复制为被 Git 忽略的 `wrangler.toml`。
2. 创建 D1 数据库，并把返回的 ID 写入 `database_id`。
3. 执行本地迁移和测试：

```text
npm install
npm run db:migrate:local
npm test
npm run dev
```

Worker 启动后，可在另一个终端执行 `npm run test:integration`；如改了端口，可先设置 `API_BASE_URL`。该流程验证静态资源、双用户隔离、CSRF、恶意 Origin、分享导入与撤销、版本冲突和认证限流。

远程部署前执行 `npm run db:migrate:remote`，再执行 `npm run deploy`。实际 D1 ID 只写在被 Git 忽略的 `wrangler.toml` 中；`wrangler.toml.example` 保留占位符，仓库不保存账户部署标识或凭据。

## 响应格式

错误统一为：

```json
{
  "error": {
    "code": "lesson_conflict",
    "message": "...",
    "field": "data.lessons",
    "requestId": "..."
  }
}
```

认证响应和公开分享响应都带 `Cache-Control: no-store`。登录令牌不会出现在 JSON 或前端存储中。

## API 契约

除公开分享读取和健康检查外，所有接口都需要有效会话 Cookie。测试客户端可把 Cookie 中的原始会话值作为 `Authorization: Bearer <token>` 使用；生产前端不应读取或保存该值。

| 方法 | 路径 | 请求体 | 成功响应 |
|---|---|---|---|
| `GET` | `/api/health` | 无 | `200 {ok:true}` |
| `POST` | `/api/auth/register` | `{username,password}` | `201 {user,session:{expiresAt}}`，设置会话和 CSRF Cookie |
| `POST` | `/api/auth/login` | `{username,password}` | `200 {user,session:{expiresAt}}`，设置会话和 CSRF Cookie |
| `GET` | `/api/auth/me` | 无 | `200 {user,session:{expiresAt}}` |
| `GET` | `/api/auth/csrf` | 无 | `200 {csrfToken}`，刷新 CSRF Cookie |
| `POST` | `/api/auth/logout` | 无 | `204`，删除会话并清除两个 Cookie |
| `GET` | `/api/schedules` | 无 | `200 {schedules:[metadata...]}` |
| `POST` | `/api/schedules` | `{name,data}` | `201 {schedule}` |
| `GET` | `/api/schedules/:id` | 无 | `200 {schedule}`，包含完整 `data` |
| `PUT` | `/api/schedules/:id` | `{name,data,version}` | `200 {schedule}`；版本过期返回 `409 version_conflict` |
| `DELETE` | `/api/schedules/:id` | 无 | `204` |
| `GET` | `/api/shares` | 无 | `200 {shares:[...]}` |
| `POST` | `/api/schedules/:id/shares` | `{expiresInDays?:1..365}` 或空体 | `201 {share:{id,name,shareUrl,...}}` |
| `POST` | `/api/shares/preview` | `{token}`，公开 | `200 {share:{id,name,data,createdAt,expiresAt}}`；服务端先摘要令牌再查询 |
| `POST` | `/api/shares/import` | `{token,name?:string}` | `201 {schedule}`，把分享快照复制到当前用户 |
| `DELETE` | `/api/shares/:id` | 无 | `204`，使用拥有者列表中的记录 ID，且仅创建者可撤销 |

`schedule` 的完整字段为 `{id,name,title,term,data,version,createdAt,updatedAt}`。列表响应省略 `data`。`data` 与现有 `schedule.json` 格式一致。

登录后写请求示例：

```js
const csrf = document.cookie
  .split('; ')
  .find((item) => item.startsWith('tt_csrf='))
  ?.split('=')[1];

await fetch('/api/schedules', {
  method: 'POST',
  credentials: 'same-origin',
  headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
  body: JSON.stringify({ name: '我的课表', data }),
});
```

创建分享时返回的 `shareUrl` 与当前 Worker 同源，格式为 `/import/#<token>`。前端从 URL 片段取得令牌，并通过固定路径的 JSON 请求预览或导入。令牌不会出现在页面请求、API URL 或常规路径访问日志中。
