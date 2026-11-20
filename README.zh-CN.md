# 24小时匿名邮箱

<div align="center">

**中文** | [English](./README.md)

安全、简单、即用即走的临时邮箱服务：打开网站就能创建一个 24 小时有效的匿名邮箱地址，接收验证码和邮件，用完自动销毁，不用注册，不留真实邮箱。

🌐 **在线演示：[zmail.lxffuq.dpdns.org](https://zmail.lxffuq.dpdns.org)**（首次打开需设置管理员密码）

[✨ 功能特点](#-功能特点) • [🚀 快速部署](#-快速部署) • [📖 使用说明](#-使用说明) • [🔐 管理员密码](#-管理员密码) • [🔌 API 接口](#-api-接口) • [🛡️ 安全设计](#️-安全设计) • [💻 本地开发](#-本地开发)

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/lxffuq/zmail)

</div>

> 本项目 fork 自 [zaunist/zmail](https://github.com/zaunist/zmail)，在原版基础上做了大量改造：前后端合并成一个 Worker、加了管理员密码认证和邮箱归属校验、修掉了 XSS 和开放发信接口等安全问题、做了额度优化，并把界面重做成深色液态玻璃风格。

---

## ✨ 功能特点

### 📮 临时邮箱

- **随机创建**：一点就生成一个随机邮箱地址，不用注册、不用填任何信息。
- **自定义地址**：可以自己起地址名，只允许小写字母、数字、点、下划线、连字符，长度 3–32 个字符（例如 `mybox123@你的域名`）。
- **24 小时有效**：每个邮箱从创建起 24 小时后自动过期；每小时有定时任务清理过期邮箱和邮件。
- **邮箱归属校验**：创建邮箱时会返回一个一次性的 `accessToken`，浏览器保存后，读邮箱、读邮件、读附件、删邮箱、删邮件都要带上它校验，别人就算猜到地址也打不开你的邮件。早期没有 token 的旧邮箱仍按地址访问，不会被锁死。

### 📥 收信

- **实时接收**：通过 Cloudflare Email Routing 收信，邮件一到就存进数据库。
- **自动刷新**：默认每 30 秒自动拉一次新邮件，页面切到后台时自动暂停，切回来立即刷新一次，不浪费额度。
- **只收已创建的邮箱**：只有先在网站上创建过的地址才能收到邮件，往没创建过的地址发的信会被丢弃（这是有意为之，不是 bug）。
- **附件支持**：支持收附件，整封邮件超过 10MB 会拒收；附件预览只允许 PDF 和常见图片格式，其他类型只能下载。
- **邮件列表上限**：每次最多返回 100 封，按收到时间倒序。

### 🔐 管理与安全

- **管理员密码**：整个网站要密码才能进。第一次打开网站会让你设置管理密码（至少 6 位），之后每次访问都要登录；顶部可以修改密码、退出登录。密码用 PBKDF2-SHA256（10 万次迭代）加盐存，不存明文；登录会话有效期 7 天。
- **邮件内容净化**：邮件里的 HTML 先经过 DOMPurify 净化再渲染，PDF 预览 iframe 带 `sandbox`，附件下载带 `nosniff` 和 `sandbox` 响应头，防存储型 XSS。
- **没有发信功能**：发信接口和调试接口已经全部删掉，这个服务只能收信，不能用来发垃圾邮件。
- **报错不泄密**：接口出错只返回通用提示，不把数据库报错原文吐给客户端。
- **额度友好**：数据库初始化一次批量建表（不是每次请求都建），读邮箱不再每次写库，轮询 30 秒 + 后台暂停，定时清理用集合式删除，小流量下远够 D1 免费额度用。

### 🎨 界面

- **深色液态玻璃**：深蓝黑底 + 蓝紫环境光，半透明毛玻璃卡片、蓝紫渐变主按钮、玻璃小按钮，手机 Safari 上正常显示。
- **仪表盘布局**：顶部吸顶玻璃横条（logo + 修改密码 / 退出 / 语言切换），大标题 + 副标题，邮箱地址卡片，创建时间 / 过期时间 / 剩余时间 / 邮件数四格统计，收件箱独立卡片。
- **移动端优先**：手机上邮箱地址整行显示不截断，顶部按钮自动变成图标按钮，按钮最小 44px 高，点按不费劲。
- **中英文切换**：界面支持中文和英文。

---

## 🚀 快速部署

点一下按钮就能部署到你自己的 Cloudflare 账号，不用终端、不用改配置：

<div align="center">
  <a href="https://deploy.workers.cloudflare.com/?url=https://github.com/lxffuq/zmail" target="_blank">
    <img src="https://deploy.workers.cloudflare.com/button" alt="Deploy to Cloudflare" />
  </a>
</div>

点按钮 → GitHub 授权 → 登录 Cloudflare → 确认部署，几分钟后拿到网站地址。Cloudflare 会自动做这些事：复制仓库、构建前端、创建 D1 数据库 `tempmail`、部署 Worker，前后端一次部署完成。

部署完还差两步才能收信（约 3 分钟，Cloudflare 不提供 API，只能在网页上点）：

1. **设置收信域名**：控制台 → Workers & Pages → `zmail` → 设置 → 变量，添加变量 `EMAIL_DOMAIN`，值是你的域名（例如 `example.com`）。保存即生效，不用重新构建。
2. **接通收信**：打开你的域名 → 左侧 **Email → Email Routing** → 启用 → 路由规则里创建地址，自定义地址填 `*`，目标选 **发送到 Worker**，Worker 选 `zmail`，保存。

不想点按钮也可以本地一条命令部署（电脑上装好 Node.js 18+ 和 Git）：

```bash
git clone https://github.com/lxffuq/zmail.git
cd zmail
./deploy.sh
```

脚本会问登录和收信域名，剩下的全自动。**完整的傻瓜式教程、手动部署步骤和常见问题见 [DEPLOY.md](./DEPLOY.md)。**

> 注意：Deploy to Cloudflare 按钮只支持公开仓库。部署时 D1 数据库按名字自动处理：账号里已有同名 `tempmail` 库就直接复用，没有就新建，不用手动建库、不用改配置（详见 DEPLOY.md）。用 API Token 在本地跑 `wrangler deploy` 的话，Token 里要有 D1 权限，否则部署会在确认数据库那步报 `Authentication error [code: 10000]`。

---

## 📖 使用说明

1. 打开网站，第一次会让你设置管理员密码（至少 6 位），设完直接登录。
2. 点「创建随机邮箱」或自己起一个自定义地址，得到一个邮箱地址（例如 `abc123@example.com`）。
3. 把这个地址填到需要收验证码、收确认信的地方。
4. 邮件到了会自动出现在收件箱里（默认 30 秒一刷，也可以点刷新按钮），点一封就能看全文、下载附件。
5. 不想要了点「删除」删掉邮箱；24 小时后邮箱和里面的邮件会自动清理，不用管。

几点提醒：

- 邮件只能收、不能发；也不要拿它收特别重要的邮件，24 小时就没了。
- 只有先在网站上创建过的地址才能收信，往没创建过的地址发信会被丢弃。
- 换设备、清浏览器数据后，之前创建的邮箱就打不开了（归属 token 存在浏览器本地），记得及时把验证码用掉。

---

## 🔐 管理员密码

| 操作 | 怎么做 |
|---|---|
| 首次设置 | 第一次打开网站，输入两次密码（至少 6 位），设完直接登录 |
| 登录 | 打开网站，输入管理密码 |
| 修改密码 | 登录后点顶部钥匙图标，输入旧密码 + 新密码 |
| 退出登录 | 登录后点顶部退出图标 |
| 忘记密码 | 没有“找回密码”。去 Cloudflare 控制台 → D1 → `tempmail` → 执行 `DELETE FROM settings WHERE key = 'admin_password_hash';`，再打开网站就会重新出现设置密码的界面 |

实现细节：密码 hash 存在 D1 的 `settings` 表里，key 是 `admin_password_hash`，格式是 `pbkdf2-sha256$100000$<盐>$<hash>`；登录成功后发一个随机会话 token，库里只存它的 SHA-256 值，有效期 7 天，前端存在 `localStorage`，每次请求带 `Authorization: Bearer <token>`。

---

## ⚙️ 配置说明

| 配置 | 在哪 | 说明 |
|---|---|---|
| `EMAIL_DOMAIN` | `wrangler.toml` 的 `[vars]` / Worker → 设置 → 变量 | 收信域名，例如 `example.com`。点按钮部署时控制台会让你填；不填的话创建的邮箱只显示一串字符、没有 `@域名` 后缀 |
| D1 数据库 | `wrangler.toml` 的 `[[d1_databases]]` | 绑定名 `DB`，库名 `tempmail`。表结构首次请求时自动创建，不用手动建表 |
| 定时清理 | `wrangler.toml` 的 `[triggers]` | 每小时整点（`0 * * * *`）清理过期邮箱和邮件 |
| `keep_vars = true` | `wrangler.toml` | 重新部署时保留控制台里手动设置的变量；但 `EMAIL_DOMAIN` 写在配置文件里，从仓库重新部署时会按文件里的值来，丢了就去变量里重新填 |
| 自定义域名 | Worker → 设置 → 域 | 给 Worker 绑自己的域名后直接用新域名打开；如果 `workers.dev` 在你的网络下打不开，绑域名就能解决 |

---

## 🔌 API 接口

所有 `/api/*` 接口（除 `/api/auth/*` 和 `/api/config` 外）都要先登录，请求头带 `Authorization: Bearer <管理员会话 token>`，未登录返回 401。邮箱相关的读写删还要再带 `X-Mailbox-Token: <邮箱归属 token>`。

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/auth/status` | 查认证状态：`{ setupRequired, authenticated }` |
| POST | `/api/auth/setup` | 首次设置管理密码（仅未设密码时可用），body：`{ password, confirmPassword }` |
| POST | `/api/auth/login` | 登录，body：`{ password }`，成功返回会话 token |
| POST | `/api/auth/logout` | 退出登录（作废当前会话） |
| POST | `/api/auth/change` | 改密码，body：`{ oldPassword, newPassword }` |
| GET | `/api/config` | 读公开配置：`{ emailDomain }` |
| POST | `/api/mailboxes` | 创建邮箱，body：`{ address?, expiresInHours }`；成功时返回邮箱信息和一次性的 `accessToken` |
| GET | `/api/mailboxes/:address` | 读一个邮箱的信息 |
| DELETE | `/api/mailboxes/:address` | 删除邮箱（连同里面的邮件一起删） |
| GET | `/api/mailboxes/:address/emails` | 读一个邮箱的邮件列表（最多 100 封） |
| GET | `/api/emails/:id` | 读一封邮件的全文 |
| DELETE | `/api/emails/:id` | 删除一封邮件 |
| GET | `/api/emails/:id/attachments` | 读一封邮件的附件列表 |
| GET | `/api/attachments/:id` | 下载一个附件 |

---

## 🗄️ 数据模型

数据存在 Cloudflare D1（SQLite）数据库 `tempmail` 里，表结构首次请求时自动创建：

| 表 | 存什么 |
|---|---|
| `mailboxes` | 邮箱：地址（唯一）、创建时间、过期时间、归属 token（`access_token`） |
| `emails` | 邮件：所属邮箱、发件人、收件人、主题、纯文本 / HTML 正文、收到时间、是否已读、有无附件 |
| `attachments` | 附件：所属邮件、文件名、类型、大小 |
| `attachment_chunks` | 附件内容分块存储（单块 500KB 左右，大附件拆多块存） |
| `settings` | 键值配置：管理员密码 hash（key 是 `admin_password_hash`） |
| `sessions` | 管理员会话：会话 token 的 SHA-256 值 + 过期时间 |

---

## 🛡️ 安全设计

- 管理员密码：PBKDF2-SHA256，10 万次迭代，16 字节随机盐，32 字节 hash，只存 hash 不存明文；会话 token 库里只存 SHA-256。
- 邮箱归属：每个邮箱有独立的随机 `accessToken`，读写删邮箱和邮件都要校验；token 只在创建时返回一次。
- 邮件 HTML：DOMPurify 净化后渲染；PDF 预览 iframe 带 `sandbox`；附件下载带 `X-Content-Type-Options: nosniff` 和 `Content-Security-Policy: sandbox`；附件预览只放行 PDF 和常见图片。
- 没有发信功能，也没有调试接口（`/api/send-email`、`/api/parse-email`、`/api/debug/db` 均已删除）。
- SQL 全部用参数绑定，没有拼接；接口报错只返回通用提示，不泄露内部错误。
- 附件整封超过 10MB 拒收；附件分块一次批量写入，不会出现存一半的情况。

---

## 🗂️ 目录结构

```
zmail
├── wrangler.toml              # Worker 配置：D1 绑定、定时任务、前端静态资源
├── deploy.sh                  # 本地一键部署脚本
├── DEPLOY.md                  # 傻瓜式部署教程
├── package.json               # 根脚本：npm run build / npm run deploy
├── frontend/                  # 前端：React 18 + Vite 4 + TypeScript + Tailwind
│   ├── src/
│   │   ├── App.tsx            # 启动时先查认证状态，未登录显示登录/设置密码页
│   │   ├── components/        # Header、邮箱卡片、邮件列表、邮件详情、登录界面等
│   │   ├── contexts/          # 邮箱状态、轮询（30 秒 + 后台暂停）
│   │   ├── utils/api.ts       # 请求封装（自动带管理员 token 和邮箱 token）
│   │   └── index.css          # 深色液态玻璃样式
│   ├── i18n/locales/          # 中英文翻译（zh-CN.json、en.json）
│   └── public/manifest.json   # PWA 清单
└── worker/                    # 后端：Hono + Cloudflare Workers
    └── src/
        ├── index.ts           # 入口：HTTP 请求 + 收信处理 + 每小时定时清理
        ├── routes.ts          # 全部 /api/* 接口
        ├── auth.ts            # 管理员密码（PBKDF2）与会话 token
        ├── database.ts        # D1 建表与查询（初始化一次批量执行）
        ├── email-handler.ts   # 收信：解析邮件、10MB 上限、批量入库
        └── email-builder.ts   # 邮件原始内容解析（parseRawEmail）
```

---

## 💻 本地开发

```bash
# 克隆
git clone https://github.com/lxffuq/zmail.git
cd zmail

# 前端开发（热更新）
cd frontend
npm install
npm run dev

# 后端本地跑（带本地模拟 D1）
npx wrangler dev

# 构建前端 + 一次部署前后端
npm run build
npm run deploy
```

---

## ❓ 常见问题

部署、收信、域名相关的常见问题（D1 名字冲突、收不到邮件、workers.dev 打不开、EMAIL_DOMAIN 没生效等）都在 **[DEPLOY.md](./DEPLOY.md)** 里有排查步骤。

---

## 👥 贡献指南

欢迎提交 Pull Request 或 Issue 来改进这个项目！

## 🙏 致谢

- 原项目：[zaunist/zmail](https://github.com/zaunist/zmail)
- 部署在 Cloudflare Workers + D1 + Email Routing 上

## 📄 许可证

[MIT License](./LICENSE)
