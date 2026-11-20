import * as PostalMimeModule from 'postal-mime';
import { Env, ParsedEmail, SaveAttachmentParams } from './types';
import { getMailbox, saveEmailWithAttachments } from './database';

const PostalMime = PostalMimeModule.default;

// 收信大小上限：10MB，超过直接丢弃（记日志，不 throw，避免重试）
const MAX_EMAIL_SIZE = 10 * 1024 * 1024;

/**
 * 处理接收到的邮件
 * @param message 邮件消息
 * @param env 环境变量
 */
export async function handleEmail(message: any, env: Env): Promise<void> {
  try {
    const raw = await new Response(message.raw).arrayBuffer() as ArrayBuffer;

    if (raw.byteLength > MAX_EMAIL_SIZE) {
      console.log(`邮件过大，跳过处理: ${raw.byteLength} 字节，超过 ${MAX_EMAIL_SIZE} 字节上限`);
      return;
    }

    const parser = new PostalMime();
    const email = await parser.parse(raw) as ParsedEmail;

    console.log('邮件解析结果:', {
      subject: email.subject,
      from: email.from,
      to: email.to,
      hasHtml: !!email.html,
      hasText: !!email.text,
      attachmentsCount: email.attachments?.length || 0
    });

    // 无收件人：记一条带 Message-ID 的日志
    if (!email.to || email.to.length === 0) {
      const messageId = message.headers?.get?.('Message-ID') || '';
      console.log(`收信无收件人，Message-ID: ${messageId || '未知'}`);
      return;
    }

    // 遍历全部收件人逐个处理，单个地址失败不拖垮整封
    for (const recipient of email.to) {
      try {
        await processRecipient(email, recipient.address, env);
      } catch (error) {
        console.error(`处理收件人 ${recipient.address} 失败:`, error);
      }
    }
  } catch (error) {
    console.error('处理邮件失败:', error);
  }
}

/**
 * 处理单个收件人：查邮箱、保存邮件和附件（一次 batch 原子提交）
 */
async function processRecipient(email: ParsedEmail, recipientAddress: string, env: Env): Promise<void> {
  // 提取邮箱地址部分
  const mailboxAddress = recipientAddress.split('@')[0];
  
  // 查找对应的邮箱
  const mailbox = await getMailbox(env.DB, mailboxAddress);
  
  if (!mailbox) {
    console.log(`邮箱不存在: ${mailboxAddress}`);
    return;
  }

  // 准备附件参数（单个附件转换失败记日志跳过，不中断整封）
  const attachmentParams: SaveAttachmentParams[] = [];
  if (email.attachments && email.attachments.length > 0) {
    console.log(`开始处理 ${email.attachments.length} 个附件`);
    
    for (const attachment of email.attachments) {
      try {
        // 将 ArrayBuffer 转换为 Base64 字符串
        const base64Content = arrayBufferToBase64(attachment.content);
        
        // 计算附件大小（字节）
        const size = attachment.size || attachment.content.byteLength;
        
        attachmentParams.push({
          emailId: '', // 由 saveEmailWithAttachments 在生成邮件 ID 后填入
          filename: attachment.filename,
          mimeType: attachment.mimeType,
          content: base64Content,
          size: size
        });
        
        console.log(`附件 ${attachment.filename} 已准备`);
      } catch (attachmentError) {
        console.error(`处理附件 ${attachment.filename} 失败:`, attachmentError);
        // 继续处理其他附件，不中断流程
      }
    }
  }

  // 保存邮件 + 附件（一次 batch 原子提交；附件 emailId 由函数内生成的邮件 ID 填入）
  const savedEmail = await saveEmailWithAttachments(env.DB, {
    mailboxId: mailbox.id,
    fromAddress: email.from.address,
    fromName: email.from.name || '',
    toAddress: mailboxAddress,
    subject: email.subject || '',
    textContent: email.text || '',
    htmlContent: email.html || '',
    hasAttachments: attachmentParams.length > 0,
  }, attachmentParams);

  console.log(`邮件已保存到邮箱 ${mailboxAddress}: ${savedEmail.id}`);
}

/**
 * 将 ArrayBuffer 转换为 Base64 字符串
 * @param buffer ArrayBuffer 数据
 * @returns Base64 字符串
 */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}
