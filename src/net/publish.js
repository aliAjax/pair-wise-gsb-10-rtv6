// 发布快照与版本链：发布即冻结，调整只能新建带原因的版本，旧值全部保留。

import { edgeKeyOf } from './segments.js';

export const STORAGE_KEY = 'ipam-topology-v1';

export function snapshot(state, meta = {}) {
  return {
    id: 'pub-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6),
    at: new Date().toISOString(),
    reason: meta.reason || '',
    basedOn: meta.basedOn || null,
    segments: state.segments.map((s) => ({ ...s })),
    nodes: state.nodes.map((n) => ({ ...n })),
    edges: state.edges.map((e) => ({ ...e })),
  };
}

export function findFrozenNode(snap, nodeId) {
  return snap?.nodes.find((n) => n.id === nodeId) || null;
}

export function findFrozenEdge(snap, edge) {
  const key = edgeKeyOf(edge);
  return snap?.edges.find((e) => edgeKeyOf(e) === key) || null;
}

// 已发布后，设备的地址三字段（网段/VLAN/IP）与连接的网关被冻结
export function frozenNodeFields(snap, node) {
  if (!snap) return {};
  const f = findFrozenNode(snap, node.id);
  if (!f) return {};
  const out = {};
  for (const k of ['segmentId', 'vlan', 'ip']) {
    if (String(f[k] ?? '') !== String(node[k] ?? '')) out[k] = f[k];
  }
  return out;
}

export function frozenEdgeGateway(snap, edge) {
  if (!snap) return undefined;
  const f = findFrozenEdge(snap, edge);
  return f ? f.gateway : undefined;
}

// 计算当前工作稿相对最新发布快照的改动（供新建版本时展示）
export function diffWorking(snap, state) {
  if (!snap) return { nodes: [], edges: [], segments: [], added: [], removed: [] };
  const frozenNode = new Map(snap.nodes.map((n) => [n.id, n]));
  const frozenEdge = new Map(snap.edges.map((e) => [edgeKeyOf(e), e]));
  const frozenSeg = new Map(snap.segments.map((s) => [s.id, s]));

  const nodes = [];
  for (const n of state.nodes) {
    const f = frozenNode.get(n.id);
    if (!f) continue;
    const fields = {};
    for (const k of ['name', 'type', 'segmentId', 'vlan', 'ip']) {
      if (String(f[k] ?? '') !== String(n[k] ?? '')) fields[k] = { from: f[k], to: n[k] };
    }
    if (Object.keys(fields).length) nodes.push({ id: n.id, name: n.name, fields });
  }
  const edges = [];
  for (const e of state.edges) {
    const f = frozenEdge.get(edgeKeyOf(e));
    if (!f) continue;
    if ((f.gateway ?? null) !== (e.gateway ?? null)) {
      edges.push({ key: edgeKeyOf(e), a: e.a, b: e.b, from: f.gateway, to: e.gateway });
    }
  }
  const segments = [];
  for (const s of state.segments) {
    const f = frozenSeg.get(s.id);
    if (!f) continue;
    const fields = {};
    for (const k of ['name', 'cidr', 'vlan']) {
      if (String(f[k] ?? '') !== String(s[k] ?? '')) fields[k] = { from: f[k], to: s[k] };
    }
    if (Object.keys(fields).length) segments.push({ id: s.id, name: s.name, fields });
  }
  return {
    nodes,
    edges,
    segments,
    added: state.nodes.filter((n) => !frozenNode.has(n.id)).map((n) => ({ id: n.id, name: n.name })),
    removed: snap.nodes.filter((n) => !state.nodes.some((x) => x.id === n.id)).map((n) => ({ id: n.id, name: n.name })),
  };
}
