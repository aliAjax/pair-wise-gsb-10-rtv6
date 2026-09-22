// 纯逻辑冒烟测试（不依赖任何第三方包，直接用 node 运行）。
import assert from 'node:assert/strict';
import { parseCidr, ipToInt, intToIp, sameCidr, isValidVlan, suggestNextIp } from '../src/net/net.js';
import { validatePlan } from '../src/net/validate.js';
import { snapshot, diffWorking } from '../src/net/publish.js';

let pass = 0;
const ok = (name, fn) => { fn(); pass++; console.log('  ✓', name); };

// ---- 地址判定 ----
ok('parseCidr 边界与容量', () => {
  const c = parseCidr('10.0.1.20/24');
  assert.equal(c.networkIp, '10.0.1.0');
  assert.equal(c.broadcastIp, '10.0.1.255');
  assert.equal(c.gatewayIp, '10.0.1.1');
  assert.equal(c.usable, 253);
  assert.equal(c.within(ipToInt('10.0.1.1')), true);
  assert.equal(c.within(ipToInt('10.0.2.1')), false);
});
ok('CIDR 规范化：写法不同但同一网络视为重复', () => {
  assert.equal(sameCidr('10.0.0.0/16', '10.0.5.9/16'), true);
  assert.equal(sameCidr('10.0.0.0/24', '10.0.1.0/24'), false);
});
ok('/30 只剩 1 个可用地址', () => {
  const c = parseCidr('192.168.1.0/30');
  assert.equal(c.size, 4);
  assert.equal(c.systemReserved, 3);
  assert.equal(c.usable, 1);
});
ok('非法 IP / VLAN 判定', () => {
  assert.equal(ipToInt('10.0.0.256'), null);
  assert.equal(ipToInt('10.0.0'), null);
  assert.equal(isValidVlan('0'), false);
  assert.equal(isValidVlan('4094'), true);
  assert.equal(isValidVlan('4095'), false);
});
ok('suggestNextIp 避开占用', () => {
  const c = parseCidr('192.168.0.0/29'); // .1 网关, .6 广播
  const used = new Set([ipToInt('192.168.0.2'), ipToInt('192.168.0.3')]);
  assert.equal(suggestNextIp(c, used), '192.168.0.4');
});

// ---- 校验规则 ----
const base = () => ({
  segments: [
    { id: 's1', name: 'A', cidr: '10.0.1.0/24', vlan: '10' },
    { id: 's2', name: 'B', cidr: '10.0.2.0/24', vlan: '20' },
  ],
  nodes: [
    { id: 'n1', name: 'r1', type: 'router', segmentId: 's1', vlan: '10', ip: '10.0.1.1' },
    { id: 'n2', name: 'h1', type: 'device', segmentId: 's2', vlan: '20', ip: '10.0.2.5' },
  ],
  edges: [
    { a: 'n1', b: 'n2', gateway: '10.0.1.1' },
  ],
});

ok('基线合法：跨网段带网关通过', () => {
  const r = validatePlan(base());
  assert.equal(r.valid, true, JSON.stringify(r.errors));
});

ok('同一 CIDR 只能登记一次', () => {
  const s = base();
  s.segments.push({ id: 's3', name: 'C', cidr: '10.0.1.5/24', vlan: '30' });
  const r = validatePlan(s);
  assert.ok(r.errors.some((e) => e.kind === 'cidr-duplicate'));
  assert.ok(r.errors.some((e) => e.kind === 'cidr-not-network'));
});

ok('IP 必须位于网段内', () => {
  const s = base();
  s.nodes[0].ip = '10.0.9.9';
  const r = validatePlan(s);
  assert.ok(r.errors.some((e) => e.kind === 'ip-outside' && e.id === 'n1' && e.field === 'ip'));
});

ok('全图 IP 不得重复，冲突双方都被标出', () => {
  const s = base();
  s.nodes[1].ip = '10.0.1.1';
  const r = validatePlan(s);
  const dup = r.errors.filter((e) => e.kind === 'ip-duplicate');
  assert.equal(dup.length, 2);
  assert.deepEqual(dup.map((e) => e.id).sort(), ['n1', 'n2']);
  assert.ok(dup.every((e) => e.field === 'ip'));
});

ok('跨网段连接缺网关 → 拒绝并定位到该连接的 gateway 字段', () => {
  const s = base();
  s.edges[0].gateway = null;
  const r = validatePlan(s);
  assert.equal(r.valid, false);
  const e = r.errors.find((x) => x.kind === 'gateway-missing');
  assert.ok(e);
  assert.equal(e.target, 'edge');
  assert.equal(e.field, 'gateway');
});

ok('网关不属于任一端网段 → 拒绝', () => {
  const s = base();
  s.edges[0].gateway = '10.9.9.1';
  const r = validatePlan(s);
  assert.ok(r.errors.some((e) => e.kind === 'gateway-outside'));
});

ok('同网段连接不需要网关', () => {
  const s = base();
  s.nodes[1] = { id: 'n2', name: 'h1', type: 'device', segmentId: 's1', vlan: '10', ip: '10.0.1.9' };
  s.edges[0] = { a: 'n1', b: 'n2', gateway: null };
  const r = validatePlan(s);
  assert.equal(r.valid, true);
});

ok('VLAN 与网段不一致 → 标出设备 vlan 字段', () => {
  const s = base();
  s.nodes[0].vlan = '99';
  const r = validatePlan(s);
  assert.ok(r.errors.some((e) => e.kind === 'node-vlan-mismatch' && e.id === 'n1' && e.field === 'vlan'));
});

ok('容量超限：/30 两台设备不可发布（含交换机类型预留）', () => {
  const s = {
    segments: [{ id: 's', name: 'X', cidr: '192.168.1.0/30', vlan: '1' }],
    nodes: [
      { id: 'a', name: 'sw', type: 'switch', segmentId: 's', vlan: '1', ip: '192.168.1.1' },
      { id: 'b', name: 'pc', type: 'device', segmentId: 's', vlan: '1', ip: '192.168.1.2' },
    ],
    edges: [],
  };
  const r = validatePlan(s);
  // 1 可用 - 2 设备 - 1 交换机管理预留 < 0
  const cap = r.capacity[0];
  assert.equal(cap.usable, 1);
  assert.equal(cap.typeReserve, 1);
  assert.equal(cap.free, 1 - 2 - 1);
  assert.ok(r.errors.some((e) => e.kind === 'capacity-overflow'));
});

ok('网络/广播地址不能分配给设备', () => {
  const s = {
    segments: [{ id: 's', name: 'X', cidr: '10.1.1.0/29', vlan: '1' }],
    nodes: [{ id: 'a', name: 'x', type: 'device', segmentId: 's', vlan: '1', ip: '10.1.1.0' }],
    edges: [],
  };
  const r = validatePlan(s);
  assert.ok(r.errors.some((e) => e.kind === 'ip-reserved'));
});

// ---- 发布快照与版本链 ----
ok('发布快照冻结旧值，diff 可还原 from/to', () => {
  const s = base();
  const snap = snapshot(s, { reason: '首版' });
  assert.equal(snap.nodes.length, 2);
  assert.equal(snap.edges[0].gateway, '10.0.1.1');

  const next = structuredClone(s);
  next.nodes[0].ip = '10.0.1.254';
  next.edges[0].gateway = '10.0.2.1';
  const d = diffWorking(snap, next);
  assert.deepEqual(d.nodes[0].fields.ip, { from: '10.0.1.1', to: '10.0.1.254' });
  assert.deepEqual(d.edges[0], { key: 'n1|n2', a: 'n1', b: 'n2', from: '10.0.1.1', to: '10.0.2.1' });

  const snap2 = snapshot(next, { reason: '改网关', basedOn: snap.id });
  assert.equal(snap2.basedOn, snap.id); // 版本链链接保留
  assert.notEqual(snap2.id, snap.id);
});

ok('新增/删除设备出现在 diff 中', () => {
  const s = base();
  const snap = snapshot(s, {});
  const next = structuredClone(s);
  next.nodes = next.nodes.filter((n) => n.id !== 'n2');
  next.nodes.push({ id: 'n3', name: '新', type: 'server', segmentId: 's1', vlan: '10', ip: '10.0.1.7' });
  const d = diffWorking(snap, next);
  assert.deepEqual(d.removed, [{ id: 'n2', name: 'h1' }]);
  assert.deepEqual(d.added, [{ id: 'n3', name: '新' }]);
});

console.log(`\n${pass} 项全部通过`);
