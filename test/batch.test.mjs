// 整批登记契约：assembleBatch + validatePlan 要么全过、要么整批拒绝。
import assert from 'node:assert/strict';
import { validatePlan } from '../src/net/validate.js';
import { assembleBatch } from '../src/net/batch.js';

const prev = {
  segments: [{ id: 's0', name: 'core', cidr: '10.0.0.0/24', vlan: '10' }],
  nodes: [{ id: 'gw', name: 'gw', type: 'router', segmentId: 's0', vlan: '10', ip: '10.0.0.1' }],
  edges: [],
};

let pass = 0;
const ok = (n, fn) => { fn(); pass++; console.log('  ✓', n); };

ok('合法整批：新网段 + 设备 + 跨网段连接（带网关）通过', () => {
  const { candidate } = assembleBatch(prev, {
    segments: [{ ref: 's1', name: 'dmz', cidr: '172.16.10.0/28', vlan: '100' }],
    nodes: [
      { ref: 'n1', name: 'fw', type: 'router', segmentRef: 's1', vlan: '100', ip: '172.16.10.1' },
      { ref: 'n2', name: 'app', type: 'server', segmentRef: 's1', vlan: '100', ip: '172.16.10.2' },
    ],
    edges: [{ a: 'n1', b: 'n2' }, { a: 'n1', b: 'gw', gateway: '10.0.0.1' }],
  }, 't1');
  const r = validatePlan(candidate);
  assert.equal(r.valid, true, JSON.stringify(r.errors, null, 1));
});

ok('非法整批：IP 重复 + 缺网关同时出现，错误可逐字段定位', () => {
  const { candidate } = assembleBatch(prev, {
    segments: [{ ref: 's1', name: 'dmz', cidr: '172.16.10.0/28', vlan: '100' }],
    nodes: [
      { ref: 'n1', name: 'fw', type: 'router', segmentRef: 's1', vlan: '100', ip: '172.16.10.1' },
      { ref: 'n2', name: 'dup', type: 'device', segmentRef: 's1', vlan: '100', ip: '172.16.10.1' },
    ],
    edges: [{ a: 'n1', b: 'gw' }], // 跨网段没网关
  }, 't2');
  const r = validatePlan(candidate);
  assert.equal(r.valid, false);
  assert.ok(r.errors.some((e) => e.kind === 'ip-duplicate'));
  assert.ok(r.errors.some((e) => e.kind === 'gateway-missing' && e.field === 'gateway'));
});

ok('引用不存在的设备 id → 悬空连接错误', () => {
  const { candidate } = assembleBatch(prev, { edges: [{ a: 'gw', b: 'ghost' }] }, 't3');
  const r = validatePlan(candidate);
  assert.ok(r.errors.some((e) => e.kind === 'edge-dangling'));
});

ok('容量不足的整批被拒（/30 塞不下 1 网关 + 2 设备 + 交换预留）', () => {
  const { candidate } = assembleBatch({ segments: [], nodes: [], edges: [] }, {
    segments: [{ ref: 's', name: 'tiny', cidr: '192.168.7.0/30', vlan: '7' }],
    nodes: [
      { ref: 'a', name: 'sw', type: 'switch', segmentRef: 's', vlan: '7', ip: '192.168.7.1' },
      { ref: 'b', name: 'pc', type: 'device', segmentRef: 's', vlan: '7', ip: '192.168.7.2' },
    ],
    edges: [],
  }, 't4');
  const r = validatePlan(candidate);
  assert.ok(r.errors.some((e) => e.kind === 'capacity-overflow'));
});

console.log(`\n${pass} 项全部通过`);
