// IPv4 / CIDR 纯计算层：所有地址判定只能走这里，界面与存储不自行解析 IP。
// 不依赖任何第三方包。

const RE_OCTET = /^(0|[1-9]\d{0,2})$/;

// 点分十进制 -> 无符号 32 位整数；非法输入返回 null
export function ipToInt(ip) {
  if (typeof ip !== 'string') return null;
  const parts = ip.trim().split('.');
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    if (!RE_OCTET.test(p)) return null;
    const v = Number(p);
    if (v > 255) return null;
    n = n * 256 + v;
  }
  return n >>> 0;
}

export function intToIp(n) {
  return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.');
}

// 解析 CIDR，返回网段边界、容量与判定函数；非法返回 null
export function parseCidr(cidr) {
  if (typeof cidr !== 'string') return null;
  const m = cidr.trim().match(/^(\d{1,3}(?:\.\d{1,3}){3})\/(\d{1,2})$/);
  if (!m) return null;
  const base = ipToInt(m[1]);
  const prefix = Number(m[2]);
  if (base === null || prefix > 32) return null;

  const size = prefix === 32 ? 1 : 2 ** (32 - prefix);
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  const network = (base & mask) >>> 0;
  const broadcast = (network + size - 1) >>> 0;
  const standard = prefix <= 30; // /31、/32 无网络/广播地址预留概念
  const gateway = standard ? network + 1 : null;
  // 系统预留：网络地址、广播地址、网关
  const systemReserved = standard ? 3 : 0;

  return {
    network,
    broadcast,
    prefix,
    size,
    mask,
    gateway,
    systemReserved,
    usable: size - systemReserved,
    networkIp: intToIp(network),
    broadcastIp: intToIp(broadcast),
    gatewayIp: gateway === null ? null : intToIp(gateway),
    within: (ipInt) => ipInt >= network && ipInt <= broadcast,
  };
}

// 规范化后比较：同一网络地址 + 同一前缀即视为同一网段
export function sameCidr(a, b) {
  const x = parseCidr(a);
  const y = parseCidr(b);
  return !!x && !!y && x.network === y.network && x.prefix === y.prefix;
}

export function isValidIp(ip) {
  return ipToInt(ip) !== null;
}

// 合法 VLAN：1-4094
export function isValidVlan(vlan) {
  const n = Number(vlan);
  return Number.isInteger(n) && n >= 1 && n <= 4094;
}

export function isNetworkOrBroadcast(info, ipInt) {
  return ipInt === info.network || ipInt === info.broadcast;
}

// 在网段内寻找未被占用的主机地址（避开网络/广播地址与已用地址）
export function suggestNextIp(info, usedSet) {
  if (info.prefix >= 31) {
    for (let a = info.network; a <= info.broadcast; a++) {
      if (!usedSet.has(a)) return intToIp(a);
    }
    return null;
  }
  for (let a = info.gateway + 1; a <= info.broadcast - 1; a++) {
    if (!usedSet.has(a)) return intToIp(a);
  }
  return intToIp(info.gateway); // 仅余网关槽位时退回（设备可登记为网关）
}
