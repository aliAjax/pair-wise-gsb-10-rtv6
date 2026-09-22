// IPv4 与 CIDR 基础运算：全部基于 32 位整数，不依赖第三方包。

export function parseIp(value) {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(String(value ?? '').trim());
  if (!m) return null;
  const parts = m.slice(1).map(Number);
  if (parts.some((p) => p > 255)) return null;
  return parts[0] * 2 ** 24 + parts[1] * 2 ** 16 + parts[2] * 2 ** 8 + parts[3];
}

export function intToIp(n) {
  return [
    Math.floor(n / 2 ** 24) % 256,
    Math.floor(n / 2 ** 16) % 256,
    Math.floor(n / 2 ** 8) % 256,
    n % 256,
  ].join('.');
}

// 解析并归一化 CIDR（主机位清零），非法输入返回 null
export function parseCidr(value) {
  const [ipPart, prefixPart] = String(value ?? '').trim().split('/');
  const base = parseIp(ipPart);
  const prefix = Number(prefixPart);
  if (base == null || !Number.isInteger(prefix) || prefix < 0 || prefix > 32) return null;
  const size = 2 ** (32 - prefix);
  const network = Math.floor(base / size) * size;
  return { network, prefix, size, broadcast: network + size - 1 };
}

export function cidrToString(cidr) {
  return `${intToIp(cidr.network)}/${cidr.prefix}`;
}

export function cidrContains(cidr, ipInt) {
  return ipInt >= cidr.network && ipInt <= cidr.broadcast;
}

// 可用主机地址数；/31、/32 按约定不扣网络与广播地址
export function usableCapacity(cidr) {
  if (cidr.prefix >= 31) return cidr.size;
  return Math.max(0, cidr.size - 2);
}
