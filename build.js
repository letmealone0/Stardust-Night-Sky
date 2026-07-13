// Vercel 构建脚本 — 使用 Vite Node API，绕过二进制执行权限问题
import { build } from 'vite';

try {
  await build();
  console.log('[build] Vite 构建完成');
} catch (err) {
  console.error('[build] 构建失败:', err);
  process.exit(1);
}
