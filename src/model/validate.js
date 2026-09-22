// 地址判定：对整张图做批量预检，任何一项冲突都导致整批拒绝。
// 返回 { ok, errors }，每条错误标出范围（设备/连接/网段）、对象 id 与冲突字段。
import { parseIp, parseCidr, cidrContains, cidrToString } from './ip.js';
import { subnetUsage } from './subnet.js';

export function validateGraph(state) {
  const errors = [];
  const push = (scope, id, field, message) => errors.push({ scope, id, field, message });

  // ---- 网段：CIDR 合法且全图只能生成一次，VLAN 合法，容量足够 ----
  const seenCidr = new Map();
  for (const s of state.subnets) {
    const cidr = parseCidr(s.cidr);
    if (!cidr) {
      push('subnet', s.id, 'cidr', 'CIDR 格式无效');
    } else {
      const key = cidrToString(cidr);
      if (seenCidr.has(key)) {
        push('subnet', s.id, 'cidr', `CIDR 与「${seenCidr.get(key)}」重复，同一网段只能生成一次`);
      } else {
        seenCidr.set(key, s.name);
      }
    }
    if (!(Number(s.vlan) >= 1 && Number(s.vlan) <= 4094)) {
      push('subnet', s.id, 'vlan', 'VLAN 需在 1–4094 之间');
    }
    const usage = subnetUsage(state, s.id);
    if (usage && !usage.ok) {
      push('subnet', s.id, 'capacity', `预留地址 ${usage.reserved} 个超出网段容量 ${usage.capacity} 个`);
    }
  }

  // ---- 设备：登记网段，IP 合法、在网段内、全图不重复，VLAN 与网段一致 ----
  const ipOwner = new Map();
  for (const n of state.nodes) {
    const subnet = state.subnets.find((s) => s.id === n.subnetId);
    if (!subnet) push('node', n.id, 'subnetId', '未登记所在网段');
    const ip = parseIp(n.ip);
    if (ip == null) {
      push('node', n.id, 'ip', 'IP 格式无效');
    } else {
      if (subnet) {
        const cidr = parseCidr(subnet.cidr);
        if (cidr && !cidrContains(cidr, ip)) {
          push('node', n.id, 'ip', `IP 不在网段 ${cidrToString(cidr)} 内`);
        }
      }
      if (ipOwner.has(ip)) {
        push('node', n.id, 'ip', `IP 与「${ipOwner.get(ip)}」在全图重复`);
      } else {
        ipOwner.set(ip, n.name);
      }
    }
    if (subnet && Number(n.vlan) !== Number(subnet.vlan)) {
      push('node', n.id, 'vlan', `VLAN 与网段 VLAN ${subnet.vlan} 不一致`);
    }
  }

  // ---- 连接：跨网段必须登记网关，网关须落在任一相连网段内 ----
  for (const e of state.edges) {
    const a = state.nodes.find((n) => n.id === e.a);
    const b = state.nodes.find((n) => n.id === e.b);
    if (!a || !b) {
      push('edge', e.id, 'endpoints', '连接端点不存在');
      continue;
    }
    if (a.subnetId === b.subnetId) continue;
    if (!e.gateway) {
      push('edge', e.id, 'gateway', '跨网段连接必须登记网关');
      continue;
    }
    const gw = parseIp(e.gateway);
    if (gw == null) {
      push('edge', e.id, 'gateway', '网关 IP 格式无效');
      continue;
    }
    const inSubnet = (subnetId) => {
      const s = state.subnets.find((x) => x.id === subnetId);
      const cidr = s && parseCidr(s.cidr);
      return Boolean(cidr && cidrContains(cidr, gw));
    };
    if (!inSubnet(a.subnetId) && !inSubnet(b.subnetId)) {
      push('edge', e.id, 'gateway', '网关不在任一相连网段内');
    }
  }

  return { ok: errors.length === 0, errors };
}
