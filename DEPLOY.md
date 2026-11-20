# ZMAIL 傻瓜式部署教程

ZMAIL 现在是**一个 Worker**：前端作为静态资源由 Worker 同源提供，一次部署全部完成。部署一次，全程约 5 分钟。

## 准备工作

| 需要的东西 | 说明 |
|---|---|
| Cloudflare 账号 | 免费即可，[注册](https://dash.cloudflare.com/sign-up) |
| 域名 | 必须已把 NS（域名服务器）改到 Cloudflare；没有域名也可以先部署演示站，收信以后再配 |
| GitHub 账号 | 一键部署会把仓库复制到你的 GitHub 账号下 |

## 方式一：一键部署（推荐，不用终端）

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/lxffuq/zmail)

1. 点上面按钮 → 用 GitHub 账号授权 → 登录 Cloudflare 账号
2. 在设置页确认三项（一般不用改）：仓库名、Worker 名 `zmail`、D1 数据库名 `tempmail`
3. 点部署，等几分钟，拿到网站地址（例如 `https://zmail.<你的子域名>.workers.dev`）

Cloudflare 会自动做这些事：复制仓库、构建前端、创建 D1 数据库 `tempmail`、部署 Worker。

## 方式二：本地一条命令

电脑上装好 Node.js 18+ 和 Git：

```bash
git clone https://github.com/lxffuq/zmail.git
cd zmail
./deploy.sh
```

脚本会问你两件事：登录 Cloudflare（第一次自动打开浏览器授权）、输入收信域名。剩下的全自动：复用或创建 D1 数据库、构建前端、一次部署完成。

## 部署后必须做的两步（收信要用，约 3 分钟）

这两步 Cloudflare 不提供 API，只能在网页上点：

### 1. 设置收信域名

点 Deploy to Cloudflare 按钮部署时，控制台会弹出 `EMAIL_DOMAIN` 让你填写，填了域名，创建的邮箱才会显示完整地址；如果当时留空、或用别的方式部署，部署后再到这里补：

控制台 → Workers & Pages → `zmail` → 设置 → 变量，添加变量：

- 变量名：`EMAIL_DOMAIN`
- 值：你的域名，例如 `example.com`

保存即生效，**无需重新构建**（前端启动时从 `/api/config` 读取）。

> 用 `./deploy.sh` 部署时脚本已经自动帮你设好了，跳过这步也行。

### 2. 接通收信

1. 打开 https://dash.cloudflare.com，点进你的域名（例如 `example.com`）
2. 左侧菜单找到 **Email → Email Routing**，点 **启用 Email Routing**，按提示完成
3. 在 **路由规则** 里点 **创建地址**：
   - 自定义地址填 `*`（意思是这个域名的所有地址都能收）
   - 目标选 **发送到 Worker**
   - Worker 选 `zmail`，保存

## 验证

1. 打开网站地址
2. 点「创建随机邮箱」，得到一个地址
3. 从你自己的邮箱给这个地址发一封测试邮件
4. 回到页面刷新，就能看到这封邮件

## 重新部署 / 更新

- 一键部署的：往你 GitHub 上复制的那个仓库推代码，Cloudflare 会自动重新部署。
- 本地脚本的：改完代码后，在仓库根目录再跑一次 `./deploy.sh`。
- 手动：`npm run build && npm run deploy`（先构建前端，再部署）。

重新部署会保留控制台里设置的变量（`keep_vars = true`），但 `EMAIL_DOMAIN` 写在 `wrangler.toml` 里，从仓库重新部署时会按文件里的值来——如果部署后发现邮箱又只显示前缀，去 Worker 设置 → 变量里重新填好你的域名。

## 常见问题

**Q：点按钮后提示仓库必须是公开的？**
A：Deploy to Cloudflare 按钮只支持公开仓库。确认仓库是 public 再点。

**Q：账号里已经有一个同名 `tempmail` 数据库，部署会冲突吗？**
A：不会。`wrangler.toml` 里不写数据库 ID，部署时 Wrangler 4 会按名字自动处理：已有同名库就直接复用，没有就新建一个。不用手动建库、不用改配置。

**Q：部署时报 D1 `Authentication error [code: 10000]`？**
A：部署用的 API Token 没有 D1 权限。Wrangler 4 在部署时要调 D1 接口确认/创建数据库，Token 里必须有 D1 权限。解决办法（二选一）：① 去控制台新建一个自定义 Token，加上 Account → D1 → Edit（同时保留 Workers 相关权限），用新 Token 部署；② 直接点 Deploy to Cloudflare 按钮部署——按钮走的是浏览器里的 Cloudflare 登录（完整账号权限），不受 API Token 限制。

**Q：部署失败，提示找不到 frontend/dist？**
A：前端没构建出来。确认构建步骤跑过：本地跑 `npm run build`，看有没有报错；一键部署则检查 Cloudflare 构建日志里前端构建那一步。

**Q：网站能打开，但创建的邮箱没有域名后缀（只显示一串字符）？**
A：`EMAIL_DOMAIN` 没设置。按上面「部署后必须做的两步」第 1 步，在 Worker 设置 → 变量里添加，刷新页面即可。

**Q：能创建邮箱，但收不到邮件？**
A：按这个顺序查：
1. Worker 变量 `EMAIL_DOMAIN` 是不是你的域名
2. Email Routing 有没有启用，规则里的 Worker 是不是 `zmail`
3. 域名是不是 Cloudflare 托管（NS 在 Cloudflare），MX 记录有没有自动加上
4. 去控制台 Workers → `zmail` → 日志，看有没有收到邮件的记录

**Q：workers.dev 在国内打不开？**
A：给 Worker 绑一个自己的域名：控制台 → Workers & Pages → `zmail` → 设置 → 域 → 添加自定义域。绑完直接用新域名打开，不用重新构建。

**Q：我想把前后端分开部署（以前的老方式）？**
A：不推荐。前端构建时留空 `VITE_API_BASE_URL` 就是同源；非要分开，把前端部署到 Pages，构建时传入 `VITE_API_BASE_URL=https://你的 Worker 地址` 即可。

## 手动部署（备用）

```bash
# 1. 构建前端
npm run build

# 2. 部署（自动创建 D1 数据库并上传 Worker + 前端）
npx wrangler deploy

# 3. 设置收信域名（也可以在控制台设置）
npx wrangler deploy --var EMAIL_DOMAIN:example.com
```

然后同样做上面「部署后必须做的两步」。

## 部署结构

```
Cloudflare（一次部署，全部完成）
└── Workers：zmail
    ├── 前端静态资源（React + Vite，frontend/dist）
    ├── 后端 API（Hono，/api/*）
    ├── D1：tempmail（邮箱、邮件、附件存在这里，表结构首次请求时自动创建）
    ├── Email Routing：*@域名 → zmail
    └── 定时任务：每小时清理过期邮箱和邮件
```

以前的前后端分离部署（Pages + Workers）已不再使用。
