/**
 * 解析原始邮件内容
 * @param rawEmail 原始邮件内容
 * @returns 解析后的邮件对象
 */
export async function parseRawEmail(rawEmail: ArrayBuffer): Promise<any> {
  try {
    // 动态导入PostalMime
    const PostalMimeModule = await import('postal-mime');
    
    // 获取构造函数
    const PostalMimeConstructor = PostalMimeModule.default || PostalMimeModule;
    
    // 创建解析器实例
    const parser = new PostalMimeConstructor();
    
    // 解析邮件
    return await parser.parse(rawEmail);
  } catch (error) {
    console.error('PostalMime解析错误:', error);
    throw error; // 重新抛出错误，让调用者处理
  }
} 
