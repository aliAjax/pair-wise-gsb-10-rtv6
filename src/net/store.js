// 状态层：唯一的事实来源。持久化到 localStorage，刷新后与发布快照、版本链一致。
// 不引入状态管理库，仅用 React hooks。

import { useCallback, useEffect, useMemo, useState } from 'react';
import { edgeKeyOf, normalizeEdges, normalizeState } from './segments.js';
import { validatePlan } from './validate.js';
import { diffWorking, snapshot, STORAGE_KEY } from './publish.js';
import { assembleBatch } from './batch.js';

export const seed = {
  segments: [
    { id: 'seg-core', name: '核心区', cidr: '10.0.0.0/24', vlan: '10' },
    { id: 'seg-a', name: '办公区 A', cidr: '10.0.1.0/24', vlan: '20' },
    { id: 'seg-b', name: '办公区 B', cidr: '10.0.2.0/24', vlan: '30' },
  ],
  nodes: [
    { id: 'gw', name: '核心路由器', type: 'router', x: 470, y: 200, segmentId: 'seg-core', vlan: '10', ip: '10.0.0.1' },
    { id: 'sw1', name: '交换机 A', type: 'switch', x: 250, y: 350, segmentId: 'seg-a', vlan: '20', ip: '10.0.1.1' },
    { id: 'sw2', name: '交换机 B', type: 'switch', x: 690, y: 350, segmentId: 'seg-b', vlan: '30', ip: '10.0.2.1' },
    { id: 'web', name: 'Web Server', type: 'server', x: 110, y: 500, segmentId: 'seg-a', vlan: '20', ip: '10.0.1.10' },
    { id: 'db', name: 'Database', type: 'server', x: 400, y: 530, segmentId: 'seg-a', vlan: '20', ip: '10.0.1.20' },
    { id: 'user', name: '办公终端', type: 'device', x: 830, y: 510, segmentId: 'seg-b', vlan: '30', ip: '10.0.2.22' },
  ],
  edges: [
    { a: 'gw', b: 'sw1', gateway: '10.0.0.1' },
    { a: 'gw', b: 'sw2', gateway: '10.0.0.1' },
    { a: 'sw1', b: 'web', gateway: null },
    { a: 'sw1', b: 'db', gateway: null },
    { a: 'sw2', b: 'user', gateway: null },
  ],
};

// 迁移旧版编辑器数据（{nodes:[{ip}],edges:[[a,b]]}）：无网段信息时归入占位网段
function migrateLegacy(raw) {
  if (raw && Array.isArray(raw.nodes) && !Array.isArray(raw.segments)) {
    const seg = { id: 'seg-imported', name: '迁移网段', cidr: '192.168.0.0/16', vlan: '1' };
    return {
      segments: [seg],
      nodes: raw.nodes.map((n) => ({ ...n, segmentId: 'seg-imported', vlan: '1' })),
      edges: normalizeEdges(raw.edges),
    };
  }
  return null;
}

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (raw) {
      const norm = normalizeState(raw);
      if (norm) {
        return {
          ...norm,
          publication: raw.publication?.snapshots
            ? { snapshots: raw.publication.snapshots, revision: raw.publication.revision || null }
            : { snapshots: [], revision: null },
        };
      }
    }
    const legacy = JSON.parse(localStorage.getItem('topology') || 'null');
    const mig = migrateLegacy(legacy);
    if (mig) return { ...mig, publication: { snapshots: [], revision: null } };
  } catch {
    /* 损坏的存档退回种子 */
  }
  return { ...structuredClone(seed), publication: { snapshots: [], revision: null } };
}

const FROZEN_NODE_FIELDS = new Set(['segmentId', 'vlan', 'ip']);

export function useTopology() {
  const [state, setState] = useState(load);
  const [notice, setNotice] = useState({ text: '', kind: '' });
  const flash = useCallback((text, kind = 'info') => setNotice({ text, kind, at: Date.now() }), []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  const result = useMemo(() => validatePlan(state), [state]);
  const pub = state.publication;
  const locked = pub.snapshots.length > 0 && !pub.revision;
  const currentSnapshot = pub.snapshots[pub.snapshots.length - 1] || null;

  const patchNode = useCallback((id, patch) => {
    if (locked) {
      const f = currentSnapshot?.nodes.find((n) => n.id === id);
      if (f) {
        for (const k of Object.keys(patch)) {
          if (FROZEN_NODE_FIELDS.has(k)) {
            flash(`设备「${f.name}」已随版本 ${currentSnapshot.id} 冻结：${k} 锁定为「${f[k]}」。调整需先新建带原因的修订版本。`, 'error');
            return;
          }
        }
      }
    }
    setState((s) => ({ ...s, nodes: s.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)) }));
  }, [locked, currentSnapshot, flash]);

  const addNode = useCallback((type = 'device') => {
    if (locked) { flash('发布已冻结，新增设备需先新建修订版本。', 'error'); return null; }
    const id = 'node-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
    setState((s) => {
      const first = s.segments[0];
      return {
        ...s,
        nodes: [...s.nodes, {
          id, name: '新设备', type,
          x: 500 + Math.round(Math.random() * 80 - 40), y: 300,
          segmentId: first?.id || '', vlan: first?.vlan || '', ip: '',
        }],
      };
    });
    return id;
  }, [locked, flash]);

  const removeNode = useCallback((id) => {
    if (locked) { flash('设备已冻结，删除设备需先新建修订版本。', 'error'); return; }
    setState((s) => ({
      ...s,
      nodes: s.nodes.filter((n) => n.id !== id),
      edges: s.edges.filter((e) => e.a !== id && e.b !== id),
    }));
  }, [locked, flash]);

  const addSegment = useCallback(() => {
    if (locked) { flash('发布已冻结，新增网段需先新建修订版本。', 'error'); return null; }
    const id = 'seg-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
    setState((s) => ({
      ...s,
      segments: [...s.segments, { id, name: '新网段', cidr: '192.168.0.0/24', vlan: '1' }],
    }));
    return id;
  }, [locked, flash]);

  // 名称随时可改；CIDR/VLAN 属于发布冻结范围，由 locked 调用方守卫
  const patchSegment = useCallback((id, patch) => {
    setState((s) => ({ ...s, segments: s.segments.map((x) => (x.id === id ? { ...x, ...patch } : x)) }));
  }, []);

  const removeSegment = useCallback((id) => {
    if (locked) { flash('已发布，删除网段需先新建修订版本。', 'error'); return false; }
    let blocked = false;
    setState((s) => {
      const users = s.nodes.filter((n) => n.segmentId === id);
      if (users.length) { blocked = true; return s; }
      return { ...s, segments: s.segments.filter((x) => x.id !== id) };
    });
    if (blocked) { flash('网段下仍有设备，无法删除', 'error'); return false; }
    return true;
  }, [locked, flash]);

  const addEdge = useCallback((a, b, gateway = null) => {
    if (a === b) { flash('不能连接设备自身', 'error'); return false; }
    const candidate = { a, b, gateway };
    if (state.edges.some((e) => edgeKeyOf(e) === edgeKeyOf(candidate))) {
      flash('两设备之间已有连接', 'error');
      return false;
    }
    setState((s) => ({ ...s, edges: [...s.edges, candidate] }));
    return true;
  }, [flash, state.edges]);

  const patchEdge = useCallback((key, patch) => {
    if (locked && 'gateway' in patch) {
      const f = currentSnapshot?.edges.find((e) => edgeKeyOf(e) === key);
      flash(`连接网关已冻结为「${f?.gateway ?? '同网段无网关'}」，调整需先新建修订版本。`, 'error');
      return;
    }
    setState((s) => ({ ...s, edges: s.edges.map((e) => (edgeKeyOf(e) === key ? { ...e, ...patch } : e)) }));
  }, [locked, currentSnapshot, flash]);

  const removeEdge = useCallback((key) => {
    setState((s) => ({ ...s, edges: s.edges.filter((e) => edgeKeyOf(e) !== key) }));
  }, []);

  // 整批登记：在候选状态上预检，任一错误则整批拒绝，不写入任何数据。
  // incoming.edges 的 a/b 可引用已有设备 id，或引用本次新建设备的 ref。
  const applyBatch = useCallback((incoming) => {
    if (locked) {
      return { ok: false, errors: [{ level: 'error', kind: 'frozen', target: 'segment', id: '-', field: 'publication', message: '发布已冻结，整批登记请先新建带原因的修订版本' }] };
    }
    const { candidate, newSegs, newNodes, incomingEdges } = assembleBatch(state, incoming);
    const check = validatePlan(candidate);
    if (!check.valid) {
      return {
        ok: false,
        errors: check.errors.filter((e) => e.level === 'error'),
        capacity: check.capacity,
        names: {
          node: new Map(candidate.nodes.map((n) => [n.id, n.name])),
          segment: new Map(candidate.segments.map((s) => [s.id, s.name])),
        },
      };
    }
    setState((s) => ({ ...s, segments: candidate.segments, nodes: candidate.nodes, edges: candidate.edges }));
    return {
      ok: true,
      added: { segments: newSegs.length, nodes: newNodes.length, edges: incomingEdges.length },
    };
  }, [state, locked]);

  const publish = useCallback((reason = '') => {
    const check = validatePlan(state);
    if (!check.valid) {
      return { ok: false, errors: check.errors.filter((e) => e.level === 'error') };
    }
    const basedOn = state.publication.revision?.basedOn ?? (state.publication.snapshots.at(-1)?.id || null);
    const snap = snapshot(state, { reason: reason || state.publication.revision?.reason || '', basedOn });
    setState((s) => ({ ...s, publication: { snapshots: [...s.publication.snapshots, snap], revision: null } }));
    return { ok: true, snapshot: snap };
  }, [state]);

  // 新建带原因的修订版本：立即解锁冻结字段；旧快照原样保留，发布时形成新版本节点
  const startRevision = useCallback((reason) => {
    if (!reason.trim()) { flash('修订必须填写原因', 'error'); return false; }
    let ok = false;
    setState((s) => {
      if (!s.publication.snapshots.length || s.publication.revision) return s;
      ok = true;
      return {
        ...s,
        publication: {
          ...s.publication,
          revision: { reason: reason.trim(), basedOn: s.publication.snapshots.at(-1).id, startedAt: new Date().toISOString() },
        },
      };
    });
    return ok;
  }, [flash]);

  const resetAll = useCallback(() => {
    if (!window.confirm('清空全部草稿、发布快照与版本链，恢复示例数据？')) return;
    localStorage.removeItem(STORAGE_KEY);
    setState({ ...structuredClone(seed), publication: { snapshots: [], revision: null } });
  }, []);

  const revisionDiff = useMemo(
    () => (currentSnapshot ? diffWorking(currentSnapshot, state) : null),
    [currentSnapshot, state]
  );

  return {
    state, result, notice, flash,
    locked, currentSnapshot, revisionDiff,
    patchNode, addNode, removeNode, addSegment, patchSegment, removeSegment,
    addEdge, patchEdge, removeEdge, applyBatch, publish, startRevision, resetAll,
  };
}
