# <div align="center">🚀 ZMAIL - 24小时匿名邮箱服务</div>

<div align="center">
  <p>
    <a href="./README.md">English</a> | <strong>中文</strong>
  </p>

  <img src="frontend/public/favicon.svg" alt="ZMAIL Logo" width="120" height="120" style="background-color: #4f46e5; padding: 20px; border-radius: 12px; margin: 20px 0;">
  
  <h3>💌 安全、简单、即用即走的临时邮箱服务</h3>

  <p>
    <a href="https://mail.mdzz.uk" target="_blank"><strong>🌐 在线体验</strong></a> •
    <a href="#功能特点"><strong>✨ 功能特点</strong></a> •
    <a href="#快速部署"><strong>🚀 快速部署</strong></a> •
    <a href="#本地开发"><strong>💻 本地开发</strong></a> •
    <a href="#技术栈"><strong>🔧 技术栈</strong></a>
  </p>
  
  <div style="display: flex; gap: 10px; justify-content: center; margin: 25px 0;">
    <a href="https://dash.cloudflare.com/" target="_blank">
      <img src="https://img.shields.io/badge/Cloudflare-F38020?style=for-the-badge&logo=cloudflare&logoColor=white" alt="Cloudflare" />
    </a>
  </div>
</div>

---

## ✨ 功能特点

<div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; margin: 20px 0;">
  <div>
    <h4>✨ 即时创建</h4>
    <p>无需注册，立即获得一个临时邮箱地址</p>
  </div>
  <div>
    <h4>🔒 隐私保护</h4>
    <p>保护您的真实邮箱，避免垃圾邮件和信息泄露</p>
  </div>
  <div>
    <h4>⚡ 高速接收</h4>
    <p>实时接收邮件，无需刷新页面</p>
  </div>
  <div>
    <h4>🌐 全球可用</h4>
    <p>基于Cloudflare构建，全球边缘网络加速</p>
  </div>
  <div>
    <h4>🔄 自动刷新</h4>
    <p>自动检查新邮件，确保不错过任何重要信息</p>
  </div>
  <div>
    <h4>📱 响应式设计</h4>
    <p>完美适配各种设备，从手机到桌面</p>
  </div>
</div>

---

## 🚀 快速部署

点一下按钮就能部署到你自己的 Cloudflare 账号，不用终端、不用改配置：

<div align="center">
  <a href="https://deploy.workers.cloudflare.com/?url=https://github.com/lxffuq/zmail" target="_blank">
    <img src="https://deploy.workers.cloudflare.com/button" alt="Deploy to Cloudflare" />
  </a>
</div>

点按钮 → GitHub 授权 → 登录 Cloudflare → 确认部署，几分钟后拿到网站地址。D1 数据库会自动创建，前后端一次部署完成。

部署完还差两步（收信要用）：在 Worker 设置 → 变量里添加 `EMAIL_DOMAIN`（你的域名），再把域名的 Email Routing 接到 Worker 上。详细步骤和本地一条命令部署见 **[DEPLOY.md](./DEPLOY.md)**。

---

## 💻 本地开发

### 🎨 前端开发

<div style="background-color: #2d2d2d; color: #ffffff; padding: 15px; border-radius: 5px; margin: 15px 0;">

```bash
# 进入前端目录
cd frontend

# 安装依赖
yarn install

# 启动开发服务器
yarn dev
```

</div>

### ⚙️ Worker开发

<div style="background-color: #2d2d2d; color: #ffffff; padding: 15px; border-radius: 5px; margin: 15px 0;">

```bash
# 构建前端 + 部署（前后端一次完成）
npm run build
npm run deploy

# 只改后端代码时，也可以在 worker 目录部署
cd worker
yarn deploy
```

</div>

---

## 🔧 技术栈

<div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px; margin: 20px 0;">
  <div>
    <h3>🎨 前端</h3>
    <ul>
      <li><strong>React</strong> - 用户界面库</li>
      <li><strong>TypeScript</strong> - 类型安全的JavaScript超集</li>
      <li><strong>Tailwind CSS</strong> - 实用优先的CSS框架</li>
      <li><strong>Vite</strong> - 现代前端构建工具</li>
    </ul>
  </div>
  <div>
    <h3>⚙️ 后端</h3>
    <ul>
      <li><strong>Cloudflare Workers</strong> - 边缘计算平台</li>
      <li><strong>Cloudflare D1</strong> - 边缘SQL数据库</li>
      <li><strong>Cloudflare Email Workers</strong> - 邮件处理服务</li>
    </ul>
  </div>
</div>

---

## 👥 贡献指南

欢迎提交Pull Request或Issue来改进这个项目！

## 📄 许可证

[MIT License](./LICENSE) 
