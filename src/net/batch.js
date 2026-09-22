// 整批登记的纯装配：把输入合并到现状上生成候选状态，不做任何写入。
// 校验交给 validatePlan；store 在校验通过后才提交候选，保证整批原子性。

const VALID_TYPES = ['router', 'switch', 'server', 'device'];

export function assembleBatch(prev, incoming, stamp = Date.now().toString(36) + Math.random().toString(36).slice(2, 6)) {
  const candidate = structuredClone({
    segments: prev.segments || [], nodes: prev.nodes || [], edges: prev.edges || [],
  });
  const refMap = new Map(); // 导入行内引用 -> 正式 id

  const newSegs = Array.isArray(incoming.segments) ? incoming.segments : [];
  newSegs.forEach((s, i) => {
    const sid = `bseg-${stamp}-${i}`;
    candidate.segments.push({
      id: sid,
      name: String(s.name ?? '批量网段'),
      cidr: String(s.cidr ?? ''),
      vlan: String(s.vlan ?? ''),
    });
    refMap.set(String(s.ref ?? i), sid);
  });

  const newNodes = Array.isArray(incoming.nodes) ? incoming.nodes : [];
  newNodes.forEach((n, i) => {
    const nid = `bnode-${stamp}-${i}`;
    const segRef = n.segmentRef ?? n.ref;
    const segId = segRef !== undefined
      ? (refMap.get(String(segRef)) || candidate.segments.find((s) => s.id === segRef)?.id || '')
      : '';
    const seg = candidate.segments.find((s) => s.id === segId);
    candidate.nodes.push({
      id: nid,
      name: String(n.name ?? '批量设备'),
      type: VALID_TYPES.includes(n.type) ? n.type : 'device',
      x: 420 + (i % 4) * 70, y: 250 + Math.floor(i / 4) * 80,
      segmentId: segId,
      vlan: String(n.vlan ?? seg?.vlan ?? ''),
      ip: String(n.ip ?? ''),
    });
    refMap.set(String(n.ref ?? i), nid);
  });

  for (const e of Array.isArray(incoming.edges) ? incoming.edges : []) {
    candidate.edges.push({
      a: refMap.get(String(e.a)) ?? (candidate.nodes.some((n) => n.id === e.a) ? e.a : `__missing_${e.a}`),
      b: refMap.get(String(e.b)) ?? (candidate.nodes.some((n) => n.id === e.b) ? e.b : `__missing_${e.b}`),
      gateway: e.gateway ? String(e.gateway) : null,
    });
  }

  return { candidate, newSegs, newNodes, incomingEdges: Array.isArray(incoming.edges) ? incoming.edges : [] };
}
