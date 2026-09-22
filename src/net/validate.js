// 预检规则层：网段唯一性、地址归属、全图去重、跨网段网关、容量与类型预留。
// 只产出结构化结果，不修改数据，也不碰界面。

import { ipToInt, isNetworkOrBroadcast, isValidVlan, parseCidr } from './net.js';
import {
  edgeKeyOf,
  findDuplicateCidr,
  isCrossSegment,
  reserveByType,
  segmentIndexOf,
} from './segments.js';

// error: { level:'error'|'warn', kind, target:'node'|'edge'|'segment', id, field, message }
export function validatePlan(state) {
  const errors = [];
  const segments = state.segments || [];
  const nodes = state.nodes || [];
  const edges = state.edges || [];
  const segById = new Map(segments.map((s) => [s.id, s]));
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const push = (e) => errors.push({ level: 'error', ...e });

  // ---- 网段：CIDR 合法性、同网络只能生成一次、VLAN ----
  const cidrInfo = new Map();
  for (const s of segments) {
    const info = parseCidr(s.cidr);
    if (!info) {
      push({ kind: 'cidr-invalid', target: 'segment', id: s.id, field: 'cidr', message: `网段「${s.name}」CIDR 非法：${s.cidr}` });
      continue;
    }
    const enteredBase = ipToInt(s.cidr.split('/')[0]);
    if (enteredBase !== info.network) {
      push({ kind: 'cidr-not-network', target: 'segment', id: s.id, field: 'cidr', message: `网段「${s.name}」应从网络地址 ${info.networkIp}/${info.prefix} 开始登记` });
    }
    if (findDuplicateCidr(segments, s.cidr, s.id)) {
      push({ kind: 'cidr-duplicate', target: 'segment', id: s.id, field: 'cidr', message: `网段 CIDR ${s.cidr} 已登记，同一网段只能生成一次` });
    }
    if (!isValidVlan(s.vlan)) {
      push({ kind: 'vlan-invalid', target: 'segment', id: s.id, field: 'vlan', message: `网段「${s.name}」VLAN 非法（需 1-4094）：${s.vlan}` });
    }
    cidrInfo.set(s.id, info);
  }

  // ---- 设备：归属、VLAN、静态 IP ----
  const ipOwners = new Map(); // ipInt -> nodeId[]
  for (const n of nodes) {
    const seg = segById.get(n.segmentId);
    if (!seg) {
      push({ kind: 'node-no-segment', target: 'node', id: n.id, field: 'segmentId', message: `设备「${n.name}」未登记所在网段` });
    }
    if (!isValidVlan(n.vlan)) {
      push({ kind: 'node-vlan-invalid', target: 'node', id: n.id, field: 'vlan', message: `设备「${n.name}」VLAN 非法（需 1-4094）：${n.vlan}` });
    } else if (seg && isValidVlan(seg.vlan) && Number(n.vlan) !== Number(seg.vlan)) {
      push({ kind: 'node-vlan-mismatch', target: 'node', id: n.id, field: 'vlan', message: `设备「${n.name}」VLAN ${n.vlan} 与所在网段 VLAN ${seg.vlan} 不一致` });
    }
    const ip = ipToInt(n.ip);
    if (ip === null) {
      push({ kind: 'ip-invalid', target: 'node', id: n.id, field: 'ip', message: `设备「${n.name}」静态 IP 非法：${n.ip || '（空）'}` });
    } else if (seg && cidrInfo.has(seg.id)) {
      const info = cidrInfo.get(seg.id);
      if (!info.within(ip)) {
        push({ kind: 'ip-outside', target: 'node', id: n.id, field: 'ip', message: `设备「${n.name}」IP ${n.ip} 不在网段 ${seg.cidr} 内` });
      } else if (info.prefix <= 30 && isNetworkOrBroadcast(info, ip)) {
        push({ kind: 'ip-reserved', target: 'node', id: n.id, field: 'ip', message: `设备「${n.name}」IP ${n.ip} 是网络/广播保留地址` });
      }
      if (!ipOwners.has(ip)) ipOwners.set(ip, []);
      ipOwners.get(ip).push(n.id);
    }
  }

  // ---- 全图 IP 去重（只比较能解析、且归属合法网段的地址）----
  for (const [ipInt, owners] of ipOwners) {
    if (owners.length > 1) {
      const names = owners.map((id) => nodeById.get(id)?.name || id).join('、');
      for (const id of owners) {
        push({ kind: 'ip-duplicate', target: 'node', id, field: 'ip', message: `IP ${nodeById.get(id).ip} 在全图重复，冲突设备：${names}` });
      }
    }
  }

  // ---- 连接：端点、重复连线、跨网段网关 ----
  const seenEdge = new Set();
  for (const e of edges) {
    const key = edgeKeyOf(e);
    const a = nodeById.get(e.a);
    const b = nodeById.get(e.b);
    if (!a || !b) {
      push({
        kind: 'edge-dangling', target: 'edge', id: key, field: 'endpoints',
        message: `连接引用了不存在的设备：${a ? '' : e.a + ' '}${b ? '' : e.b}`.trim(),
      });
      continue;
    }
    if (e.a === e.b) {
      push({ kind: 'edge-self', target: 'edge', id: key, field: 'endpoints', message: `设备「${a.name}」不能与自身连线` });
    }
    if (seenEdge.has(key)) {
      push({ kind: 'edge-duplicate', target: 'edge', id: key, field: 'endpoints', message: `「${a.name}」与「${b.name}」之间存在重复连接` });
    }
    seenEdge.add(key);

    if (isCrossSegment(nodes, e)) {
      const segA = segById.get(a.segmentId);
      const segB = segById.get(b.segmentId);
      const gw = ipToInt(e.gateway);
      if (gw === null) {
        push({ kind: 'gateway-missing', target: 'edge', id: key, field: 'gateway', message: `跨网段连接「${a.name} ↔ ${b.name}」未登记网关，整批登记将被拒绝` });
      } else {
        const inA = cidrInfo.get(segA?.id)?.within(gw);
        const inB = cidrInfo.get(segB?.id)?.within(gw);
        if (!inA && !inB) {
          push({ kind: 'gateway-outside', target: 'edge', id: key, field: 'gateway', message: `连接「${a.name} ↔ ${b.name}」网关 ${e.gateway} 不属于任一端网段（${segA?.cidr} / ${segB?.cidr}）` });
        }
      }
    } else if (e.gateway) {
      errors.push({ level: 'warn', kind: 'gateway-unneeded', target: 'edge', id: key, field: 'gateway', message: `同网段连接「${a.name} ↔ ${b.name}」无需网关，登记值将被忽略` });
    }
  }

  // ---- 容量：网段可用地址 vs 设备数 + 按类型预留 ----
  const capacity = [];
  for (const s of segments) {
    const info = cidrInfo.get(s.id);
    if (!info) continue;
    const members = nodes.filter((n) => n.segmentId === s.id);
    const typeReserve = members.reduce((sum, n) => sum + reserveByType(n), 0);
    const need = members.length + typeReserve;
    const stat = {
      segmentId: s.id, name: s.name, cidr: s.cidr,
      usable: info.usable, used: members.length, typeReserve, free: info.usable - need,
    };
    capacity.push(stat);
    if (need > info.usable) {
      push({
        kind: 'capacity-overflow', target: 'segment', id: s.id, field: 'capacity',
        message: `网段「${s.name}」${s.cidr} 需 ${need} 个地址（${members.length} 设备 + ${typeReserve} 类型预留），可用仅 ${info.usable} 个`,
      });
    }
  }

  const nodeSeg = segmentIndexOf(nodes);
  const linked = new Set(edges.flatMap((e) => [e.a, e.b]));
  const isolated = nodes.filter((n) => !linked.has(n.id)).map((n) => ({ id: n.id, name: n.name }));

  return {
    valid: errors.every((e) => e.level !== 'error'),
    errors,
    capacity,
    isolated,
    nodeSeg,
  };
}

// 错误索引：供界面给具体字段标红
export function errorIndex(result) {
  const idx = { node: {}, edge: {}, segment: {} };
  for (const e of result.errors) {
    const bucket = idx[e.target] || (idx[e.target] = {});
    const slot = bucket[e.id] || (bucket[e.id] = {});
    (slot[e.field] || (slot[e.field] = [])).push(e);
  }
  return idx;
}
