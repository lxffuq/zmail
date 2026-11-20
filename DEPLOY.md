# ZMAIL 傻瓜式部署教程

部署一次，全程约 5 分钟。只需要三样东西：一个 Cloudflare 账号（免费）、一个域名、电脑上装了 Node.js。

## 准备工作

| 需要的东西 | 说明 |
|---|---|
| Cloudflare 账号 | 免费即可，[注册](https://dash.cloudflare.com/sign-up) |
| 域名 | 必须已把 NS（域名服务器）改到 Cloudflare；没有域名也可以先部署演示站，收信以后再配 |
| Node.js 18+ | [官网下载](https://nodejs.org)，装完在终端跑 `node -v` 能看到版本号就行 |
| Git | 用来拉代码，装完跑 `git --version` 能看到版本号就行 |

## 一键部署（推荐）

```bash
git clone https://github.com/lxffuq/zmail.git
cd zmail
./deploy.sh
```

脚本会一步步问你，整个过程只需要你做两件事：

1. **登录 Cloudflare**：第一次运行时会自动打开浏览器授权，点一下允许就行。
2. **输入域名**：输入你的收信域名，例如 `example.com`。没有域名直接回车，会先部署一个演示站。

脚本自动帮你做完这些事：

- 创建 D1 数据库 `tempmail`（已存在就直接复用），并把 ID 写进 `wrangler.toml`
- 部署后端 Worker，拿到 `https://zmail-backend.<你的子域名>.workers.dev`
- 用这个后端地址自动构建前端，部署到 Cloudflare Pages，拿到 `https://zmail.pages.dev`

最后脚本会打印出前端和后端的地址。

## 最后一步：接通收信（2 分钟，控制台里点几下）

这一步 Cloudflare 不提供 API，只能在网页上点，没法写进脚本：

1. 打开 https://dash.cloudflare.com，点进你的域名（例如 `example.com`）
2. 左侧菜单找到 **Email → Email Routing**，点 **启用 Email Routing**，按提示完成
3. 在 **路由规则** 里点 **创建地址**：
   - 自定义地址填 `*`（意思是这个域名的所有地址都能收）
   - 目标选 **发送到 Worker**
   - Worker 选 `zmail-backend`，保存

## 验证

1. 打开前端地址（例如 `https://zmail.pages.dev`）
2. 点「创建随机邮箱」，得到一个 `xxxx@example.com` 的地址
3. 从你自己的邮箱给这个地址发一封测试邮件
4. 回到页面刷新，就能看到这封邮件

## 重新部署 / 更新

改完代码后，在仓库根目录再跑一次：

```bash
./deploy.sh
```

脚本会复用已有的 D1 数据库和 Pages 项目，只更新代码。

## 常见问题

**Q：脚本提示没找到 Node.js？**
A：去 https://nodejs.org 装 Node.js 18 以上版本，装完重开一个终端再跑。

**Q：登录 Cloudflare 一直失败？**
A：手动跑一次 `npx wrangler login`，按提示在浏览器里授权，成功后再跑 `./deploy.sh`。

**Q：提示 D1 数据库已存在？**
A：脚本会自动复用已有的 `tempmail` 数据库。如果它要你手动贴 database_id，去控制台 Workers & Pages → D1，点开 `tempmail` 复制 ID 粘贴即可。

**Q：前端打开是空白，或提示连不上后端？**
A：前端构建时用的后端地址是脚本部署完自动填的，不用手动改。先确认后端地址能打开（访问 `https://zmail-backend.<你的子域名>.workers.dev` 应返回 JSON）；如果后端正常，重新跑一次 `./deploy.sh` 即可。

**Q：能创建邮箱，但收不到邮件？**
A：按这个顺序查：
1. Email Routing 有没有启用，规则里的 Worker 是不是 `zmail-backend`
2. 域名是不是 Cloudflare 托管（NS 在 Cloudflare），MX 记录有没有自动加上
3. 去控制台 Workers → `zmail-backend` → 日志，看有没有收到邮件的记录

**Q：workers.dev / pages.dev 在国内打不开？**
A：给前端和 Worker 各绑一个自己的域名：Pages 项目 → 自定义域；Worker → 设置 → 域。绑完后前端要重新构建一次（`VITE_API_BASE_URL` 改成 Worker 的自定义域名）。

**Q：我不想用脚本，想手动部署？**
A：可以，看下面。

## 手动部署（备用）

```bash
# 1. 后端：创建 D1 并部署 Worker
cd worker
npx wrangler d1 create tempmail        # 记下返回的 database_id
# 把 database_id 填进 wrangler.toml
npx wrangler deploy                    # 记下 workers.dev 地址

# 2. 前端：填入后端地址和域名，构建并部署
cd ../frontend
npm install
VITE_API_BASE_URL=https://zmail-backend.<你的子域名>.workers.dev \
VITE_EMAIL_DOMAIN=example.com \
npm run build
npx wrangler pages deploy dist --project-name zmail --commit-dirty=true
```

然后同样做上面「接通收信」的三步。

## 部署结构

```
Cloudflare
├── Pages：zmail            前端（React + Vite）
├── Workers：zmail-backend  后端 API + 收信入口（Hono）
├── D1：tempmail            邮箱、邮件、附件存在这里，表结构首次请求时自动创建
└── Email Routing：*@域名 → zmail-backend
```

定时任务每小时清理一次过期邮箱和邮件。
