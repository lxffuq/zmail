// 配置文件，用于管理域名和API地址设置

// API 地址：留空表示同源调用（前后端部署在同一个 Worker 上时直接可用，
// 一键部署就是这种情况）。只有把前后端分开部署时，才需要填 Worker 地址。
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

// 邮箱域名：优先使用后端 /api/config 返回的运行时域名（部署后在控制台
// Worker → 设置 → 变量里改 EMAIL_DOMAIN，保存即生效，无需重新构建）；
// 其次使用构建时传入的 VITE_EMAIL_DOMAIN；都没设置时为空，
// 页面只显示用户名部分并提示去设置域名。
export let EMAIL_DOMAIN = import.meta.env.VITE_EMAIL_DOMAIN || '';

// 启动时从后端拉取运行时配置（主要是 EMAIL_DOMAIN），必须在首屏渲染前调用。
// 拉取失败（例如后端是旧版本、没有 /api/config）时静默使用构建时默认值。
export async function initRuntimeConfig(): Promise<void> {
  try {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 2000);
    const res = await fetch(`${API_BASE_URL}/api/config`, { signal: controller.signal });
    window.clearTimeout(timer);
    if (!res.ok) return;
    const data = await res.json();
    if (data && typeof data.emailDomain === 'string' && data.emailDomain) {
      EMAIL_DOMAIN = data.emailDomain;
    }
  } catch {
    // 忽略：使用构建时默认值
  }
}

// 其他配置
export const DEFAULT_AUTO_REFRESH = true;
export const AUTO_REFRESH_INTERVAL = 30000; // 30秒

// 邮箱有效期（小时）：创建随机/自定义邮箱的默认有效期
export const MAILBOX_TTL_HOURS = 24;
