#!/usr/bin/env bash
# ============================================================================
# ZMAIL 一键部署脚本（本地一条命令版）
# 前后端已合并成一个 Worker：前端作为静态资源由 Worker 同源提供，
# 一次 wrangler deploy 全部部署完。不想用终端的话，直接点 README 里的
# Deploy to Cloudflare 按钮，效果一样。
#
# 用法：
#   git clone https://github.com/lxffuq/zmail.git
#   cd zmail
#   ./deploy.sh
#
# 需要：Node.js 18+、一个 Cloudflare 账号（免费即可）、
#       一个已把 NS 接入 Cloudflare 的域名（用于收信，没有也可先部署演示站）
# ============================================================================
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
FRONTEND_DIR="$REPO_DIR/frontend"
DB_NAME="tempmail"
WORKER_NAME="zmail"
WRANGLER="npx -y wrangler@4"

say() { printf '\n==> %s\n' "$*"; }
die() { printf '\n✖ %s\n' "$*" >&2; exit 1; }

# --- 0. 环境检查 ------------------------------------------------------------
command -v node >/dev/null 2>&1 || die "没找到 Node.js，请先安装 Node.js 18+（https://nodejs.org），再重新运行。"
command -v npx  >/dev/null 2>&1 || die "没找到 npx，请确认 Node.js 安装完整。"

# --- 1. 登录 Cloudflare -----------------------------------------------------
say "检查 Cloudflare 登录状态…"
if ! $WRANGLER whoami >/dev/null 2>&1; then
  say "还没登录 Cloudflare，正在打开授权页面…"
  $WRANGLER login || die "登录失败，请手动运行 npx wrangler login 后再试。"
fi

# --- 2. 收信域名 ------------------------------------------------------------
say "请输入你的收信域名（必须已把 NS 改到 Cloudflare，例如 example.com）"
printf '域名（没有域名可直接回车，先部署演示站，收信以后再配）: '
read -r EMAIL_DOMAIN || true
EMAIL_DOMAIN="${EMAIL_DOMAIN:-example.com}"
if [ "$EMAIL_DOMAIN" = "example.com" ]; then
  say "未填写域名，先部署演示站；拿到域名后在控制台 Worker → 设置 → 变量里添加 EMAIL_DOMAIN 即可，无需重新构建。"
fi

# --- 3. D1 数据库：部署时自动处理 -------------------------------------------
# wrangler.toml 里不写数据库 ID；部署时 Wrangler 4 会按名字自动处理：
# 账号里已有同名库（tempmail）就直接复用，没有就新建一个。
# 不用手动建库，也不用往 wrangler.toml 里填 ID。
say "D1 数据库（$DB_NAME）由部署时自动处理（已有同名库则复用，没有则新建）…"
cd "$REPO_DIR"

# --- 4. 构建前端 ------------------------------------------------------------
say "安装前端依赖并构建…"
cd "$FRONTEND_DIR"
[ -d node_modules ] || npm install --no-audit --no-fund || die "前端依赖安装失败。"
VITE_EMAIL_DOMAIN="$EMAIL_DOMAIN" npm run build || die "前端构建失败。"

# --- 5. 部署（Worker + 前端静态资源一次完成）--------------------------------
say "部署到 Cloudflare…"
cd "$REPO_DIR"
if [ "$EMAIL_DOMAIN" = "example.com" ]; then
  DEPLOY_OUT="$($WRANGLER deploy 2>&1 | tee /dev/stderr)"
else
  DEPLOY_OUT="$($WRANGLER deploy --var "EMAIL_DOMAIN:$EMAIL_DOMAIN" 2>&1 | tee /dev/stderr)"
fi
WORKER_URL="$(printf '%s' "$DEPLOY_OUT" | grep -oE 'https://[A-Za-z0-9_.-]+\.workers\.dev' | head -n 1)"
[ -n "$WORKER_URL" ] || die "部署后没拿到 workers.dev 地址，请看上面的输出。"

# --- 完成 --------------------------------------------------------------------
say "部署完成！"
echo "  网站：$WORKER_URL"
echo "  域名：$EMAIL_DOMAIN"
echo ""
echo "最后两步（收信必须做，约 3 分钟）："
echo "  1. 设置收信域名：控制台 → Workers & Pages → $WORKER_NAME → 设置 → 变量，"
echo "     添加变量 EMAIL_DOMAIN = $EMAIL_DOMAIN，保存。（deploy.sh 已自动帮你设好，跳过这步也行）"
echo "  2. 接通收信：控制台 → 你的域名 $EMAIL_DOMAIN → 左侧 Email → Email Routing →"
echo "     点“启用 Email Routing”，路由规则 → 创建地址：自定义地址填 * ，"
echo "     目标选“发送到 Worker”，选 $WORKER_NAME → 保存"
echo ""
echo "验证：给任意地址（如 test@$EMAIL_DOMAIN）发一封邮件，打开网站就能看到。"
echo "重新部署：改完代码后，再跑一次 ./deploy.sh 即可。"
