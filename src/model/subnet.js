// 网段模型：设备类型元数据、地址预留规则、容量核算与空闲地址推荐。
import { parseCidr, parseIp, intToIp, usableCapacity } from './ip.js';

export const DEVICE_TYPES = [
  ['router', '◉', '路由器'],
  ['switch', '▦', '交换机'],
  ['server', '▣', '服务器'],
  ['device', '▱', '终端设备'],
];

export const typeLabel = (t) => (DEVICE_TYPES.find(([k]) => k === t) || [])[2] || t;
export const typeIcon = (t) => (DEVICE_TYPES.find(([k]) => k === t) || [])[1] || '▱';

// 各设备类型在网段内需预留的地址数（含自身）：路由器/交换机预留冗余与管理地址
export const RESERVED_BY_TYPE = { router: 2, switch: 2, server: 1, device: 1 };

// 核算单个网段的容量与预留占用
export function subnetUsage(state, subnetId) {
  const subnet = state.subnets.find((s) => s.id === subnetId);
  if (!subnet) return null;
  const cidr = parseCidr(subnet.cidr);
  const capacity = cidr ? usableCapacity(cidr) : 0;
  const members = state.nodes.filter((n) => n.subnetId === subnetId);
  const reserved = members.reduce((sum, n) => sum + (RESERVED_BY_TYPE[n.type] ?? 1), 0);
  return { subnet, capacity, reserved, free: capacity - reserved, ok: reserved <= capacity, members };
}

// 在网段内推荐一个未被设备或网关占用的空闲地址
export function suggestIp(state, subnetId) {
  const subnet = state.subnets.find((s) => s.id === subnetId);
  const cidr = subnet && parseCidr(subnet.cidr);
  if (!cidr) return '';
  const used = new Set();
  for (const n of state.nodes) {
    const v = parseIp(n.ip);
    if (v != null) used.add(v);
  }
  for (const e of state.edges) {
    const v = parseIp(e.gateway || '');
    if (v != null) used.add(v);
  }
  const start = cidr.prefix >= 31 ? cidr.network : cidr.network + 1;
  const end = cidr.prefix >= 31 ? cidr.broadcast : cidr.broadcast - 1;
  for (let ip = start; ip <= end && ip < start + 65536; ip++) {
    if (!used.has(ip)) return intToIp(ip);
  }
  return '';
}
