import React from 'react';
import { isNodeFrozen, isEdgeFrozen } from '../model/store.js';
import { subnetUsage, DEVICE_TYPES, typeLabel } from '../model/subnet.js';

const FIELD_LABEL = { ip: '静态 IP', subnetId: '网段', vlan: 'VLAN', gateway: '网关' };
const fmtTime = (iso) => new Date(iso).toLocaleString('zh-CN', { hour12: false });

function NodeForm({ state, node, errFor, onUpdate, onRemove, onConnect, onSelectEdge }) {
  const frozen = isNodeFrozen(state, node.id);
  const err = (f) => errFor('node', node.id, f)?.message;
  const edges = state.edges.filter((x) => x.a === node.id || x.b === node.id);
  return (
    <>
      <div className="section-title"><span>设备属性</span><small>{typeLabel(node.type)}</small></div>
      {frozen && <p className="freeze-note">🔒 已发布：地址字段冻结，需新建版本调整</p>}
      <label>设备名称
        <input value={node.name} onChange={(e) => onUpdate(node.id, 'name', e.target.value)} />
      </label>
      <label>设备类型
        <select value={node.type} onChange={(e) => onUpdate(node.id, 'type', e.target.value)}>
          {DEVICE_TYPES.map(([k, , l]) => <option key={k} value={k}>{l}</option>)}
        </select>
      </label>
      <label>所在网段 {frozen && <em className="lock">🔒 已冻结</em>}
        <select
          className={err('subnetId') ? 'bad' : ''}
          disabled={frozen}
          value={node.subnetId}
          onChange={(e) => onUpdate(node.id, 'subnetId', e.target.value)}
        >
          {state.subnets.map((s) => <option key={s.id} value={s.id}>{s.name} · {s.cidr}</option>)}
        </select>
        {err('subnetId') && <em className="field-err">{err('subnetId')}</em>}
      </label>
      <label>VLAN {frozen && <em className="lock">🔒 已冻结</em>}
        <input
          className={err('vlan') ? 'bad' : ''}
          disabled={frozen}
          type="number"
          value={node.vlan}
          onChange={(e) => onUpdate(node.id, 'vlan', Number(e.target.value))}
        />
        {err('vlan') && <em className="field-err">{err('vlan')}</em>}
      </label>
      <label>静态 IP {frozen && <em className="lock">🔒 已冻结</em>}
        <input
          className={err('ip') ? 'bad' : ''}
          disabled={frozen}
          value={node.ip}
          onChange={(e) => onUpdate(node.id, 'ip', e.target.value)}
        />
        {err('ip') && <em className="field-err">{err('ip')}</em>}
      </label>
      <div className="inspector-actions">
        <button onClick={() => onConnect(node.id)}>⌁ 添加连接</button>
        <button className="danger" onClick={() => onRemove(node.id)}>删除设备</button>
      </div>
      <div className="connections">
        <div className="section-title"><span>连接</span><small>{edges.length} 条</small></div>
        {edges.map((ed) => {
          const other = state.nodes.find((n) => n.id === (ed.a === node.id ? ed.b : ed.a));
          const cross = other && other.subnetId !== node.subnetId;
          return (
            <button className="connection" key={ed.id} onClick={() => onSelectEdge(ed.id)}>
              <span className={'mini ' + (other?.type || '')}></span>
              <strong>{other?.name}</strong>
              <small>{cross ? `跨网段 · 网关 ${ed.gateway || '未登记'}` : '同网段'}</small>
            </button>
          );
        })}
      </div>
    </>
  );
}

function EdgeForm({ state, edge, errFor, onUpdate, onRemove }) {
  const a = state.nodes.find((n) => n.id === edge.a);
  const b = state.nodes.find((n) => n.id === edge.b);
  const cross = a && b && a.subnetId !== b.subnetId;
  const frozen = isEdgeFrozen(state, edge.id);
  const err = (f) => errFor('edge', edge.id, f)?.message;
  return (
    <>
      <div className="section-title"><span>连接属性</span><small>{cross ? '跨网段' : '同网段'}</small></div>
      {frozen && <p className="freeze-note">🔒 已发布：网关冻结，需新建版本调整</p>}
      <div className="edge-ends">
        <span><i className={'mini ' + (a?.type || '')}></i>{a?.name}</span>
        <b>⇄</b>
        <span><i className={'mini ' + (b?.type || '')}></i>{b?.name}</span>
      </div>
      {cross ? (
        <label>网关地址 {frozen && <em className="lock">🔒 已冻结</em>}
          <input
            className={err('gateway') ? 'bad' : ''}
            disabled={frozen}
            placeholder="例如 10.0.0.1"
            value={edge.gateway}
            onChange={(e) => onUpdate(edge.id, 'gateway', e.target.value)}
          />
          {err('gateway') && <em className="field-err">{err('gateway')}</em>}
        </label>
      ) : (
        <p className="hint">同网段连接无需登记网关。</p>
      )}
      <div className="inspector-actions">
        <button className="danger" onClick={() => onRemove(edge.id)}>删除连接</button>
      </div>
    </>
  );
}

function SubnetView({ state, subnet }) {
  const u = subnetUsage(state, subnet.id);
  if (!u) return null;
  return (
    <>
      <div className="section-title"><span>网段</span><small>VLAN {subnet.vlan}</small></div>
      <div className="subnet-detail">
        <strong>{subnet.name}</strong>
        <code>{subnet.cidr}</code>
        <div className="usage">
          <i
            className={u.ok ? '' : 'over'}
            style={{ width: Math.min(100, u.capacity ? (u.reserved / u.capacity) * 100 : 100) + '%' }}
          ></i>
        </div>
        <small>预留 {u.reserved} / 容量 {u.capacity} · 剩余 {u.free}</small>
        {!u.ok && <em className="field-err">预留地址超出容量，不得发布</em>}
        <p className="hint">预留规则：路由器/交换机各 2 个地址，服务器/终端各 1 个；/31、/32 不扣网络与广播地址。</p>
      </div>
      <div className="connections">
        <div className="section-title"><span>成员设备</span><small>{u.members.length} 台</small></div>
        {u.members.map((m) => (
          <div className="connection" key={m.id}>
            <span className={'mini ' + m.type}></span>
            <strong>{m.name}</strong>
            <small>{m.ip}</small>
          </div>
        ))}
      </div>
    </>
  );
}

function Versions({ state }) {
  const describe = (c) => {
    if (c.field === '*') return `${c.scope === 'node' ? '设备' : '连接'}「${c.name || c.id}」${c.to}`;
    let from = c.from === '' ? '—' : c.from;
    let to = c.to === '' ? '—' : c.to;
    if (c.field === 'subnetId') {
      from = state.subnets.find((s) => s.id === c.from)?.name ?? from;
      to = state.subnets.find((s) => s.id === c.to)?.name ?? to;
    }
    return `「${c.name || c.id}」${FIELD_LABEL[c.field] || c.field}：${from} → ${to}`;
  };
  return (
    <div className="versions">
      <div className="section-title">
        <span>发布与版本链</span>
        <small>{state.published ? `已发布 v${state.published.version}` : '未发布'}</small>
      </div>
      {state.published && (
        <p className="hint">
          快照：{state.published.snapshot.nodes.length} 设备 · {state.published.snapshot.subnets.length} 网段 ·{' '}
          {state.published.snapshot.edges.length} 连接 · {fmtTime(state.published.publishedAt)}
        </p>
      )}
      {state.versions.length === 0 && <p className="hint">尚未发布。发布后地址与网关冻结，调整需新建带原因的版本。</p>}
      {[...state.versions].reverse().map((v) => (
        <details className="version-item" key={v.version}>
          <summary>
            <b>v{v.version}</b>{v.reason}
            <small>{fmtTime(v.createdAt)} · {v.changes.length} 项调整</small>
          </summary>
          <ul>
            {v.changes.length === 0 && <li>首次发布快照</li>}
            {v.changes.map((c, i) => <li key={i}>{describe(c)}</li>)}
          </ul>
        </details>
      ))}
    </div>
  );
}

export default function Inspector({
  state, selected, errFor,
  onUpdateNode, onRemoveNode, onUpdateEdge, onRemoveEdge, onSelect, onConnect,
}) {
  const node = selected.kind === 'node' ? state.nodes.find((n) => n.id === selected.id) : null;
  const edge = selected.kind === 'edge' ? state.edges.find((e) => e.id === selected.id) : null;
  const subnet = selected.kind === 'subnet' ? state.subnets.find((s) => s.id === selected.id) : null;
  return (
    <aside className="inspector">
      {node && (
        <NodeForm
          state={state}
          node={node}
          errFor={errFor}
          onUpdate={onUpdateNode}
          onRemove={onRemoveNode}
          onConnect={onConnect}
          onSelectEdge={(id) => onSelect('edge', id)}
        />
      )}
      {edge && <EdgeForm state={state} edge={edge} errFor={errFor} onUpdate={onUpdateEdge} onRemove={onRemoveEdge} />}
      {subnet && <SubnetView state={state} subnet={subnet} />}
      {!node && !edge && !subnet && <p className="hint">在画布或列表中选择设备、连接或网段。</p>}
      <Versions state={state} />
    </aside>
  );
}
