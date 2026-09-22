// 网段模型：网段登记、设备归属、连接网关。
// 所有结构变更通过本模块的纯函数完成，store 只负责保存与调用。

import { ipToInt, parseCidr, sameCidr } from './net.js';

export const DEVICE_TYPES = ['router', 'switch', 'server', 'device'];
export const TYPE_LABEL = { router: '路由器', switch: '交换机', server: '服务器', device: '终端设备' };

// 连接：a/b 为设备 id；同网段连接 gateway=null，跨网段连接必须登记网关 IP（字符串）
export const edgeKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);
export const edgeKeyOf = (e) => edgeKey(e.a, e.b);

export function normalizeEdges(edges) {
  // 兼容旧数据 [id, id] 元组形式
  return (edges || []).map((e) =>
    Array.isArray(e) ? { a: e[0], b: e[1], gateway: null } : { a: e.a, b: e.b, gateway: e.gateway ?? null }
  );
}

export function normalizeState(raw) {
  if (raw && Array.isArray(raw.segments) && Array.isArray(raw.nodes)) {
    return {
      segments: raw.segments.map((s) => ({ ...s })),
      nodes: raw.nodes.map((n) => ({
        id: n.id, name: n.name, type: n.type, x: n.x, y: n.y,
        segmentId: n.segmentId ?? '', vlan: n.vlan ?? '', ip: n.ip ?? '',
      })),
      edges: normalizeEdges(raw.edges),
    };
  }
  return null;
}

// nodeId -> segmentId 归属索引
export const segmentIndexOf = (nodes) => new Map(nodes.map((n) => [n.id, n.segmentId || null]));

export function isCrossSegment(nodes, edge) {
  const idx = segmentIndexOf(nodes);
  const sa = idx.get(edge.a);
  const sb = idx.get(edge.b);
  return !!sa && !!sb && sa !== sb;
}

export function findDuplicateCidr(segments, cidr, exceptId = null) {
  return segments.find((s) => s.id !== exceptId && sameCidr(s.cidr, cidr)) || null;
}

// 按设备类型的额外地址预留：
// router 占用网关角色，网关即路由器自身登记地址，不额外扣减；
// switch 每台额外预留 1 个带外管理地址；
// server/device 不额外预留。
export function reserveByType(node) {
  return node.type === 'switch' ? 1 : 0;
}

export function segmentCapacity(segments, nodes, segmentId) {
  const seg = segments.find((s) => s.id === segmentId);
  if (!seg) return null;
  const info = parseCidr(seg.cidr);
  if (!info) return null;
  const members = nodes.filter((n) => n.segmentId === segmentId);
  const typeReserve = members.reduce((sum, n) => sum + reserveByType(n), 0);
  return {
    usable: info.usable,
    used: members.length,
    typeReserve,
    free: info.usable - members.length - typeReserve,
  };
}

export { parseCidr, ipToInt };
