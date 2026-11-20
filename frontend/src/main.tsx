import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './index.css'
import './i18n'
import { initRuntimeConfig } from './config'

// 创建路由器配置，添加未来标志
const router = {
  future: {
    v7_startTransition: true,
    v7_relativeSplatPath: true,
  },
};

// 全站默认深色：给 <html> 加 dark 类，让 tailwind 的 dark: 变体也生效
//（:root 变量本身也已是深色，双保险）。
document.documentElement.classList.add('dark');

// 先从后端拉取运行时配置（收信域名等），再渲染首屏；
// 拉取失败时用构建时默认值，不阻塞页面。
initRuntimeConfig().finally(() => {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <BrowserRouter {...router}>
        <App />
      </BrowserRouter>
    </React.StrictMode>,
  )
})
