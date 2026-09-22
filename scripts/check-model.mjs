// 模型层自检：node scripts/check-model.mjs
import { parseIp, parseCidr, cidrContains, cidrToString, usableCapacity, intToIp } from '../src/model/ip.js';
import { subnetUsage, suggestIp } from '../src/model/subnet.js';
import { validateGraph } from '../src/model/validate.js';
import { seedState, publish, beginVersion, commitVersion, cancelVersion, isNodeFrozen } from '../src/model/store.js';

let failed = 0;
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) { failed++; console.error(`✕ ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); }
  else console.log(`✓ ${name}`);
};

// IP/CIDR 基础
eq('parseIp 10.0.0.1', parseIp('10.0.0.1'), 167772161);
eq('parseIp 255.255.255.255', parseIp('255.255.255.255'), 4294967295);
eq('parseIp 非法', parseIp('10.0.0.256'), null);
eq('intToIp 回环', intToIp(parseIp('192.168.1.7')), '192.168.1.7');
eq('parseCidr 归一化', cidrToString(parseCidr('10.0.0.1/24')), '10.0.0.0/24');
eq('cidrContains 内', cidrContains(parseCidr('10.0.0.0/24'), parseIp('10.0.0.254')), true);
eq('cidrContains 外', cidrContains(parseCidr('10.0.0.0/24'), parseIp('10.0.1.1')), false);
eq('容量 /24', usableCapacity(parseCidr('10.0.0.0/24')), 254);
eq('容量 /30', usableCapacity(parseCidr('10.0.0.0/30')), 2);
eq('容量 /31', usableCapacity(parseCidr('10.0.0.0/31')), 2);

// 种子数据预检通过
const seed = seedState();
eq('种子预检通过', validateGraph(seed).ok, true);

// IP 重复
let s = seedState();
s.nodes[3].ip = '10.0.1.1';
let r = validateGraph(s);
eq('IP 重复被标出', r.errors.some((e) => e.scope === 'node' && e.id === 'web' && e.field === 'ip'), true);

// IP 不在网段内
s = seedState();
s.nodes[3].ip = '10.9.9.9';
r = validateGraph(s);
eq('IP 出网段被标出', r.errors.some((e) => e.id === 'web' && e.field === 'ip'), true);

// 跨网段缺网关
s = seedState();
s.edges[0].gateway = '';
r = validateGraph(s);
eq('跨网段缺网关被标出', r.errors.some((e) => e.scope === 'edge' && e.id === 'e-gw-sw1' && e.field === 'gateway'), true);

// 网关不在相连网段
s = seedState();
s.edges[0].gateway = '192.168.1.1';
r = validateGraph(s);
eq('网关越界被标出', r.errors.some((e) => e.id === 'e-gw-sw1' && e.field === 'gateway'), true);

// CIDR 重复
s = seedState();
s.subnets.push({ id: 's2', name: '重复网段', cidr: '10.0.0.9/24', vlan: 11 });
r = validateGraph(s);
eq('CIDR 重复被标出', r.errors.some((e) => e.scope === 'subnet' && e.id === 's2' && e.field === 'cidr'), true);

// VLAN 与网段不一致
s = seedState();
s.nodes[3].vlan = 99;
r = validateGraph(s);
eq('VLAN 不一致被标出', r.errors.some((e) => e.id === 'web' && e.field === 'vlan'), true);

// 容量：/30 容量 2，一台交换机预留 2 即可占满，再加一台服务器即超
s = seedState();
s.subnets.push({ id: 'tiny', name: '小网段', cidr: '10.9.0.0/30', vlan: 40 });
s.nodes.push({ id: 'x1', name: 'X1', type: 'switch', x: 0, y: 0, subnetId: 'tiny', vlan: 40, ip: '10.9.0.1' });
eq('容量刚好', subnetUsage(s, 'tiny').ok, true);
s.nodes.push({ id: 'x2', name: 'X2', type: 'server', x: 0, y: 0, subnetId: 'tiny', vlan: 40, ip: '10.9.0.2' });
r = validateGraph(s);
eq('容量超限被标出', r.errors.some((e) => e.scope === 'subnet' && e.id === 'tiny' && e.field === 'capacity'), true);

// 空闲地址推荐：跳过已用与网关
s = seedState();
eq('推荐空闲 IP', suggestIp(s, 'core'), '10.0.0.2');

// 发布 → 冻结 → 版本链
s = seedState();
eq('未发布不冻结', isNodeFrozen(s, 'web'), false);
let out = publish(s);
eq('发布成功', out.result.ok, true);
s = out.state;
eq('发布后冻结', isNodeFrozen(s, 'web'), true);
eq('新设备不冻结', isNodeFrozen({ ...s, nodes: [...s.nodes, { id: 'new1' }] }), false);

// 冻结状态下直接改无效（由 UI 层守卫），走版本流程
s = beginVersion(s, '调整 Web 服务器地址');
eq('草稿中解冻', isNodeFrozen(s, 'web'), false);
s = { ...s, nodes: s.nodes.map((n) => (n.id === 'web' ? { ...n, ip: '10.0.1.11' } : n)) };
out = commitVersion(s);
eq('版本提交成功', out.result.ok, true);
s = out.state;
eq('版本号递增', s.published.version, 2);
eq('版本链长度', s.versions.length, 2);
const v2 = s.versions[1];
eq('版本记录原因', v2.reason, '调整 Web 服务器地址');
eq('旧值保留在版本链', JSON.stringify(v2.changes), JSON.stringify([{ scope: 'node', id: 'web', name: 'Web Server', field: 'ip', from: '10.0.1.10', to: '10.0.1.11' }]));
eq('发布后重新冻结', isNodeFrozen(s, 'web'), true);

// 提交时整批拒绝：草稿里制造冲突
s = beginVersion(s, '制造冲突');
s = { ...s, nodes: s.nodes.map((n) => (n.id === 'web' ? { ...n, ip: '10.0.1.1' } : n)) };
out = commitVersion(s);
eq('冲突整批拒绝', out.result.ok, false);
eq('拒绝后仍是草稿', out.state.draft !== null, true);
eq('拒绝后版本不变', out.state.published.version, 2);
s = cancelVersion(out.state);
eq('放弃草稿回滚', s.nodes.find((n) => n.id === 'web').ip, '10.0.1.11');

// 发布也被容量拦截
s = seedState();
s.subnets.push({ id: 'tiny', name: '小网段', cidr: '10.9.0.0/30', vlan: 40 });
s.nodes.push({ id: 'x1', name: 'X1', type: 'switch', x: 0, y: 0, subnetId: 'tiny', vlan: 40, ip: '10.9.0.1' });
s.nodes.push({ id: 'x2', name: 'X2', type: 'server', x: 0, y: 0, subnetId: 'tiny', vlan: 40, ip: '10.9.0.2' });
out = publish(s);
eq('超容量不得发布', out.result.ok, false);

console.log(failed ? `\n${failed} 项失败` : '\n全部通过');
process.exit(failed ? 1 : 0);
