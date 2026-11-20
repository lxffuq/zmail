#!/usr/bin/env bash
# ============================================================================
# ZMAIL 一键部署脚本
# 一条命令部署前后端：D1 数据库 + Worker 后端 + Pages 前端
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
WORKER_DIR="$REPO_DIR/worker"
FRONTEND_DIR="$REPO_DIR/frontend"
DB_NAME="tempmail"
WORKER_NAME="zmail-backend"
PAGES_PROJECT="zmail"
WRANGLER="npx -y wrangler@3"

say()  { printf '\n==> %s\n' "$*"; }
die()  { printf '\n✖ %s\n' "$*" >&2; exit 1; }

# --- 0. 环境检查 ------------------------------------------------------------
command -v node    >/dev/null 2>&1 || die "没找到 Node.js，请先安装 Node.js 18+（https://nodejs.org），再重新运行。"
command -v npx     >/dev/null 2>&1 || die "没找到 npx，请确认 Node.js 安装完整。"
command -v python3 >/dev/null 2>&1 || die "没找到 python3，脚本用它来读写 wrangler.toml。"

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
  say "未填写域名，先用 example.com 占位部署；拿到自己的域名后，改前端环境变量重新构建即可。"
fi

# --- 3. D1 数据库：存在则复用，不存在则创建 ---------------------------------
say "准备 D1 数据库（$DB_NAME）…"
cd "$WORKER_DIR"

DB_ID="$($WRANGLER d1 list --json 2>/dev/null | python3 -c "
import json, sys
try:
    data = json.load(sys.stdin)
    rows = data if isinstance(data, list) else data.get('result', [])
    print(next((d.get('uuid', '') for d in rows if d.get('name') == '$DB_NAME'), ''))
except Exception:
    print('')
" 2>/dev/null || true)"

if [ -z "$DB_ID" ]; then
  say "正在创建 D1 数据库 $DB_NAME…"
  CREATE_OUT="$($WRANGLER d1 create "$DB_NAME" 2>&1 || true)"
  DB_ID="$(printf '%s' "$CREATE_OUT" | grep -oE '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' | head -n 1)"
fi

if [ -z "$DB_ID" ]; then
  # 数据库可能已存在但上面没解析到，让用户贴一下 ID
  say "没能自动拿到 D1 的 ID（数据库可能已经存在）。"
  printf '请打开 https://dash.cloudflare.com → Workers & Pages → D1，点开 %s，把 database_id 粘贴到这里: ' "$DB_NAME"
  read -r DB_ID || true
  [ -n "$DB_ID" ] || die "没有数据库 ID，无法继续。请检查 D1 后重新运行脚本。"
fi
say "D1 数据库 ID：$DB_ID"

# 把 database_id 写进 wrangler.toml（替换占位符或旧值）
python3 - "$DB_ID" <<'PYEOF'
import re, sys
p = 'wrangler.toml'
s = open(p).read()
db = sys.argv[1]
s2, n = re.subn(r'(?m)^database_id\s*=.*$', 'database_id = "%s"' % db, s)
if n == 0:
    raise SystemExit('wrangler.toml 里找不到 database_id 这一行')
open(p, 'w').write(s2)
print('已把 database_id 写入 wrangler.toml')
PYEOF

# --- 4. 部署后端 Worker ------------------------------------------------------
say "部署后端 Worker…"
DEPLOY_OUT="$($WRANGLER deploy 2>&1 | tee /dev/stderr)"
WORKER_URL="$(printf '%s' "$DEPLOY_OUT" | grep -oE 'https://[A-Za-z0-9_.-]+\.workers\.dev' | head -n 1)"
[ -n "$WORKER_URL" ] || die "部署 Worker 后没拿到 workers.dev 地址，请看上面的输出。"
say "后端地址：$WORKER_URL"

# --- 5. 构建并部署前端 -------------------------------------------------------
say "安装前端依赖…"
cd "$FRONTEND_DIR"
[ -d node_modules ] || npm install --no-audit --no-fund || die "前端依赖安装失败。"

say "构建前端（API 指向 $WORKER_URL，域名 $EMAIL_DOMAIN）…"
VITE_API_BASE_URL="$WORKER_URL" VITE_EMAIL_DOMAIN="$EMAIL_DOMAIN" npm run build \
  || die "前端构建失败。"

say "部署前端到 Cloudflare Pages…"
PAGES_OUT="$($WRANGLER pages deploy dist --project-name "$PAGES_PROJECT" --commit-dirty=true 2>&1 | tee /dev/stderr)"
PAGES_URL="$(printf '%s' "$PAGES_OUT" | grep -oE "https://$PAGES_PROJECT\.pages\.dev" | head -n 1)"
if [ -z "$PAGES_URL" ]; then
  PAGES_URL="$(printf '%s' "$PAGES_OUT" | grep -oE 'https://[A-Za-z0-9_.-]+\.pages\.dev' | head -n 1)"
fi

# --- 完成 --------------------------------------------------------------------
say "部署完成！"
echo "  前端：${PAGES_URL:-（见上方输出）}"
echo "  后端：$WORKER_URL"
echo "  域名：$EMAIL_DOMAIN"
echo ""
echo "最后一步（收信必须做，约 2 分钟，控制台里点几下）："
echo "  1. 打开 https://dash.cloudflare.com → 左侧找到你的域名 $EMAIL_DOMAIN 点进去"
echo "  2. 左侧菜单 Email → Email Routing → 点“启用 Email Routing”，按提示完成"
echo "  3. 路由规则 → 创建地址：自定义地址填 * ，目标选“发送到 Worker”，选 $WORKER_NAME → 保存"
echo ""
echo "验证：给任意地址（如 test@$EMAIL_DOMAIN）发一封邮件，打开前端页面就能看到。"
echo "重新部署：改完代码后，再跑一次 ./deploy.sh 即可。"
