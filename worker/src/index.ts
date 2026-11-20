import { D1Database } from '@cloudflare/workers-types';
import { Env } from './types';
import { initializeDatabase, cleanupExpiredMailboxes, cleanupExpiredMails } from './database';
import { handleEmail } from './email-handler';
import app from './routes';

// 模块级初始化守卫：同一 isolate 内只初始化一次；失败时重置为 null 以便下次重试
let initPromise: Promise<void> | null = null;

function ensureDatabaseInitialized(db: D1Database): Promise<void> {
  if (!initPromise) {
    initPromise = initializeDatabase(db).catch((error) => {
      initPromise = null;
      throw error;
    });
  }
  return initPromise;
}

// 导出Worker处理函数
export default {
  // 处理HTTP请求
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    try {
      // 同一 isolate 内只初始化一次数据库
      await ensureDatabaseInitialized(env.DB);
      
      // 处理API请求
      return app.fetch(request, env, ctx);
    } catch (error) {
      console.error('请求处理失败:', error);
      
      // 只返回通用错误，不泄露内部细节
      return new Response(JSON.stringify({
        success: false,
        error: '服务器内部错误'
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  },
  
  // 处理邮件
  async email(message: any, env: Env, _ctx: ExecutionContext): Promise<void> {
    try {
      await ensureDatabaseInitialized(env.DB);
      await handleEmail(message, env);
    } catch (error) {
      // 只记日志，绝不 throw，避免 Email Routing 无意义重试
      console.error('处理邮件失败:', error);
    }
  },
  
  // 定时任务 - 每小时清理过期邮箱以及过期邮件
  async scheduled(_event: ScheduledEvent, env: Env, _ctx: ExecutionContext): Promise<void> {
    try {
      await ensureDatabaseInitialized(env.DB);
    } catch (error) {
      console.error('定时任务初始化数据库失败:', error);
      return;
    }

    // 两个清理各自独立 try/catch，一个失败不影响另一个
    try {
      const deleted = await cleanupExpiredMailboxes(env.DB);
      console.log(`已清理 ${deleted} 个过期邮箱`);
    } catch (error) {
      console.error('清理过期邮箱失败:', error);
    }

    try {
      const deletedMail = await cleanupExpiredMails(env.DB);
      console.log(`已清理 ${deletedMail} 个过期邮件`);
    } catch (error) {
      console.error('清理过期邮件失败:', error);
    }
  },
};
