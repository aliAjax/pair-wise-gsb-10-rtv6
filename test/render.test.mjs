// SSR 冒烟运行器：经 Vite 的开发服务器加载 .jsx，验证组件树在
// 正常态 / 冻结态 / 冲突态下都能完整服务端渲染（无渲染期崩溃）。
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { seed } from '../src/net/store.js';

const server = await createServer({ server: { middlewareMode: true }, logLevel: 'error', configFile: false });
try {
  const mod = await server.ssrLoadModule('/test/render-case.jsx');
  const { html, lockedHtml, badHtml, result, badResult } = mod.renderSmoke(seed);

  assert.ok(html.includes('核心路由器'), '应渲染设备名');
  assert.ok(html.includes('10.0.0.1'), '应渲染设备 IP');
  assert.ok(html.includes('核心区'), '应渲染网段');
  assert.ok(html.includes('地址冲突预检'), '应渲染预检栏');
  assert.ok(html.includes('全部规则通过'), '种子数据应通过全部规则');
  assert.ok(lockedHtml.includes('冻结'), '冻结态应出现冻结标记');
  assert.ok(lockedHtml.includes('pub-1'), '应显示发布版本号');
  assert.ok(badHtml.includes('IP 冲突'), '冲突报告应包含 IP 冲突类型');

  console.log('✓ SSR 冒烟通过：正常态 / 冻结态 / 冲突态组件树均渲染成功');
  console.log('  种子数据错误数：', result.errors.length,
    '| 冲突态错误数：', badResult.errors.filter((e) => e.level === 'error').length);
} finally {
  await server.close();
}
