// 状态存储：本地持久化、发布快照、带原因的版本链与发布后冻结规则。
import { validateGraph } from './validate.js';

export const STORAGE_KEY = 'netalloc-console-v1';

// 发布后冻结的字段：设备地址类与连接网关
export const FROZEN_NODE_FIELDS = ['subnetId', 'vlan', 'ip'];
export const FROZEN_EDGE_FIELDS = ['gateway'];

const clone = (v) => JSON.parse(JSON.stringify(v));
const snapshotOf = (state) => clone({ subnets: state.subnets, nodes: state.nodes, edges: state.edges });

export function seedState() {
  return {
    subnets: [
      { id: 'core', name: '核心网段', cidr: '10.0.0.0/24', vlan: 10 },
      { id: 'office-a', name: '办公网 A', cidr: '10.0.1.0/24', vlan: 20 },
      { id: 'office-b', name: '办公网 B', cidr: '10.0.2.0/24', vlan: 30 },
    ],
    nodes: [
      { id: 'gw', name: '核心路由器', type: 'router', x: 470, y: 200, subnetId: 'core', vlan: 10, ip: '10.0.0.1' },
      { id: 'sw1', name: '交换机 A', type: 'switch', x: 250, y: 350, subnetId: 'office-a', vlan: 20, ip: '10.0.1.1' },
      { id: 'sw2', name: '交换机 B', type: 'switch', x: 690, y: 350, subnetId: 'office-b', vlan: 30, ip: '10.0.2.1' },
      { id: 'web', name: 'Web Server', type: 'server', x: 100, y: 500, subnetId: 'office-a', vlan: 20, ip: '10.0.1.10' },
      { id: 'db', name: 'Database', type: 'server', x: 400, y: 530, subnetId: 'office-a', vlan: 20, ip: '10.0.1.20' },
      { id: 'user', name: '办公终端', type: 'device', x: 820, y: 510, subnetId: 'office-b', vlan: 30, ip: '10.0.2.22' },
    ],
    edges: [
      { id: 'e-gw-sw1', a: 'gw', b: 'sw1', gateway: '10.0.0.1' },
      { id: 'e-gw-sw2', a: 'gw', b: 'sw2', gateway: '10.0.0.1' },
      { id: 'e-sw1-web', a: 'sw1', b: 'web', gateway: '' },
      { id: 'e-sw1-db', a: 'sw1', b: 'db', gateway: '' },
      { id: 'e-sw2-user', a: 'sw2', b: 'user', gateway: '' },
    ],
    published: null,
    versions: [],
    draft: null,
  };
}

export function loadState() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (raw && Array.isArray(raw.subnets) && Array.isArray(raw.nodes) && Array.isArray(raw.edges)) {
      return { published: null, versions: [], draft: null, ...raw };
    }
  } catch {
    /* 本地数据损坏时回退到种子数据 */
  }
  return seedState();
}

export function saveState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* 存储不可用时静默忽略 */
  }
}

// 已发布快照中的实体在非草稿模式下被冻结
export function isNodeFrozen(state, id) {
  return Boolean(state.published && !state.draft && state.published.snapshot.nodes.some((n) => n.id === id));
}

export function isEdgeFrozen(state, id) {
  return Boolean(state.published && !state.draft && state.published.snapshot.edges.some((e) => e.id === id));
}

// 首次发布：整批预检通过后生成 v1 快照
export function publish(state) {
  if (state.published) return { state, result: { ok: false, errors: [] } };
  const result = validateGraph(state);
  if (!result.ok) return { state, result };
  const version = {
    version: 1,
    reason: '首次发布',
    createdAt: new Date().toISOString(),
    changes: [],
    snapshot: snapshotOf(state),
  };
  const next = {
    ...state,
    versions: [version],
    published: { version: 1, publishedAt: version.createdAt, snapshot: version.snapshot },
  };
  return { state: next, result };
}

// 开始一个带原因的调整版本：记录基线，解冻字段
export function beginVersion(state, reason) {
  if (!state.published || state.draft) return state;
  return { ...state, draft: { reason, base: snapshotOf(state), startedAt: new Date().toISOString() } };
}

// 放弃草稿：回滚到已发布取值
export function cancelVersion(state) {
  if (!state.draft) return state;
  const { base } = state.draft;
  return { ...state, ...clone(base), draft: null };
}

// 对比基线与当前状态，记录地址/网关字段的旧值与新值，以及增删的实体
function diffChanges(base, current) {
  const changes = [];
  const nodeName = (list, id) => list.find((n) => n.id === id)?.name;
  for (const n of current.nodes) {
    const old = base.nodes.find((o) => o.id === n.id);
    if (!old) {
      changes.push({ scope: 'node', id: n.id, name: n.name, field: '*', from: '', to: '新增' });
      continue;
    }
    for (const f of FROZEN_NODE_FIELDS) {
      if (String(old[f]) !== String(n[f])) {
        changes.push({ scope: 'node', id: n.id, name: n.name, field: f, from: old[f], to: n[f] });
      }
    }
  }
  for (const old of base.nodes) {
    if (!current.nodes.some((n) => n.id === old.id)) {
      changes.push({ scope: 'node', id: old.id, name: old.name, field: '*', from: '', to: '删除' });
    }
  }
  for (const e of current.edges) {
    const old = base.edges.find((o) => o.id === e.id);
    const label = `${nodeName(current.nodes, e.a) ?? e.a}⇄${nodeName(current.nodes, e.b) ?? e.b}`;
    if (!old) {
      changes.push({ scope: 'edge', id: e.id, name: label, field: '*', from: '', to: '新增' });
      continue;
    }
    for (const f of FROZEN_EDGE_FIELDS) {
      if (String(old[f] ?? '') !== String(e[f] ?? '')) {
        changes.push({ scope: 'edge', id: e.id, name: label, field: f, from: old[f] ?? '', to: e[f] ?? '' });
      }
    }
  }
  for (const old of base.edges) {
    if (!current.edges.some((e) => e.id === old.id)) {
      const label = `${nodeName(base.nodes, old.a) ?? old.a}⇄${nodeName(base.nodes, old.b) ?? old.b}`;
      changes.push({ scope: 'edge', id: old.id, name: label, field: '*', from: '', to: '删除' });
    }
  }
  return changes;
}

// 提交版本：整批预检，任何冲突都整批拒绝并保留草稿；通过后旧值进入版本链
export function commitVersion(state) {
  if (!state.draft) return { state, result: null };
  const result = validateGraph(state);
  if (!result.ok) return { state, result };
  const changes = diffChanges(state.draft.base, state);
  if (changes.length === 0) return { state, error: '没有需要提交的调整' };
  const versionNo = state.published.version + 1;
  const version = {
    version: versionNo,
    reason: state.draft.reason,
    createdAt: new Date().toISOString(),
    changes,
    snapshot: snapshotOf(state),
  };
  const next = {
    ...state,
    draft: null,
    versions: [...state.versions, version],
    published: { version: versionNo, publishedAt: version.createdAt, snapshot: version.snapshot },
  };
  return { state: next, result };
}
