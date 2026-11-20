# <div align="center">🚀 ZMAIL - 24-hour Anonymous Email Service</div>

<div align="center">
  <p>
    <strong>English</strong> | <a href="./README.zh-CN.md">中文</a>
  </p>

  <img src="frontend/public/favicon.svg" alt="ZMAIL Logo" width="120" height="120" style="background-color: #4f46e5; padding: 20px; border-radius: 12px; margin: 20px 0;">
  
  <h3>💌 Secure, Simple, Disposable Email Service</h3>

  <p>
    <a href="https://mail.mdzz.uk" target="_blank"><strong>🌐 Live Demo</strong></a> •
    <a href="#features"><strong>✨ Features</strong></a> •
    <a href="#quick-deployment"><strong>🚀 Deployment</strong></a> •
    <a href="#local-development"><strong>💻 Development</strong></a> •
    <a href="#tech-stack"><strong>🔧 Tech Stack</strong></a>
  </p>
  
  <div style="display: flex; gap: 10px; justify-content: center; margin: 25px 0;">
    <a href="https://dash.cloudflare.com/" target="_blank">
      <img src="https://img.shields.io/badge/Cloudflare-F38020?style=for-the-badge&logo=cloudflare&logoColor=white" alt="Cloudflare" />
    </a>
  </div>
</div>

---

## ✨ Features

<div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; margin: 20px 0;">
  <div>
    <h4>✨ Instant Creation</h4>
    <p>Get a temporary email address instantly, no registration required</p>
  </div>
  <div>
    <h4>🔒 Privacy Protection</h4>
    <p>Protect your real email from spam and data leaks</p>
  </div>
  <div>
    <h4>⚡ Real-time Reception</h4>
    <p>Receive emails in real-time without refreshing the page</p>
  </div>
  <div>
    <h4>🌐 Global Availability</h4>
    <p>Built on Cloudflare's global edge network for fast access worldwide</p>
  </div>
  <div>
    <h4>🔄 Auto-refresh</h4>
    <p>Automatically check for new emails, never miss important messages</p>
  </div>
  <div>
    <h4>📱 Responsive Design</h4>
    <p>Perfect fit for all devices, from mobile to desktop</p>
  </div>
</div>

---

## 🚀 Quick Deployment

Deploy to your own Cloudflare account with one click. No terminal, no config edits:

<div align="center">
  <a href="https://deploy.workers.cloudflare.com/?url=https://github.com/lxffuq/zmail" target="_blank">
    <img src="https://deploy.workers.cloudflare.com/button" alt="Deploy to Cloudflare" />
  </a>
</div>

Click the button → authorize with GitHub → sign in to Cloudflare → confirm the deploy. A few minutes later you get your site URL. The D1 database is created automatically, and the frontend and backend deploy together.

Two steps remain after deploy (needed to receive mail): add an `EMAIL_DOMAIN` variable (your domain) in the Worker settings, and point your domain's Email Routing at the Worker. Full steps and the local one-command deploy are in **[DEPLOY.md](./DEPLOY.md)**.

---

## 💻 Local Development

### 🎨 Frontend Development

<div style="background-color: #2d2d2d; color: #ffffff; padding: 15px; border-radius: 5px; margin: 15px 0;">

```bash
# Navigate to frontend directory
cd frontend

# Install dependencies
yarn install

# Start development server
yarn dev
```

</div>

### ⚙️ Worker Development

<div style="background-color: #2d2d2d; color: #ffffff; padding: 15px; border-radius: 5px; margin: 15px 0;">

```bash
# Build the frontend and deploy everything at once
npm run build
npm run deploy

# To deploy from the worker directory only
cd worker
yarn deploy
```

</div>

---

## 🔧 Tech Stack

<div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px; margin: 20px 0;">
  <div>
    <h3>🎨 Frontend</h3>
    <ul>
      <li><strong>React</strong> - UI library</li>
      <li><strong>TypeScript</strong> - Type-safe JavaScript</li>
      <li><strong>Tailwind CSS</strong> - Utility-first CSS framework</li>
      <li><strong>Vite</strong> - Modern frontend build tool</li>
    </ul>
  </div>
  <div>
    <h3>⚙️ Backend</h3>
    <ul>
      <li><strong>Cloudflare Workers</strong> - Edge computing platform</li>
      <li><strong>Cloudflare D1</strong> - Edge SQL database</li>
      <li><strong>Cloudflare Email Workers</strong> - Email processing service</li>
    </ul>
  </div>
</div>

---

## 👥 Contributing

Contributions via Pull Requests or Issues are welcome!

## 📄 License

[MIT License](./LICENSE)
