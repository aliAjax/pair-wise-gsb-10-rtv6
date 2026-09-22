import React, { useState } from 'react';
import { edgeKeyOf, isCrossSegment, TYPE_LABEL, DEVICE_TYPES } from '../net/segments.js';
import { Field, iconOf } from './widgets.jsx';

export default function Inspector({ topology, selection, onSelect, errIdx }) {
  const { state, locked, currentSnapshot } = topology;

  if (selection?.type === 'edge') {
    const edge = state.edges.find((e) => edgeKeyOf(e) === selection.key);
    if (!edge) return <aside className="inspector"><p className="empty">连接已删除</p></aside>;
    return <EdgeInspector edge={edge} topology={topology} errIdx={errIdx} onSelect={onSelect} />;
  }

  if (selection?.type === 'segment') {
    const seg = state.segments.find((s) => s.id === selection.id);
    if (!seg) return <aside className="inspector"><p className="empty">网段已删除</p></aside>;
    return <SegmentInspector seg={seg} topology={topology} errIdx={errIdx} onSelect={onSelect} />;
  }

  const node = state.nodes.find((n) => n.id === selection?.id) || state.nodes[0];
  if (!node) return <aside className="inspector"><p className="empty">选择一个设备</p></aside>;

  const seg = state.segments.find((s) => s.id === node.segmentId) || null;
  const nodeErrs = errIdx.node[node.id] || {};
  const frozen = currentSnapshot?.nodes.find((n) => n.id === node.id) || null;
  const isFrozen = locked && !!frozen;
  const lockHint = (field) => isFrozen ? `发布值 ${frozen[field]}` : null;

  return (
    <aside className="inspector">
      <div className="section-title">
        <span>设备属性</span>
        <small>{isFrozen ? `冻结于 ${currentSnapshot.id}` : TYPE_LABEL[node.type]}</small>
      </div>

      <Field label="设备名称">
        <input value={node.name} onChange={(e) => topology.patchNode(node.id, { name: e.target.value })} />
      </Field>
      <Field label="设备类型">
        <select value={node.type} onChange={(e) => topology.patchNode(node.id, { type: e.target.value })}>
          {DEVICE_TYPES.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
        </select>
      </Field>
      <Field
        label="所在网段"
        error={nodeErrs.segmentId?.[0]}
        locked={isFrozen}
        hint={lockHint('segmentId')}
      >
        <select
          value={node.segmentId}
          disabled={isFrozen}
          onChange={(e) => {
            const next = state.segments.find((s) => s.id === e.target.value);
            topology.patchNode(node.id, { segmentId: e.target.value, vlan: next?.vlan ?? node.vlan });
          }}
        >
          <option value="">（未登记）</option>
          {state.segments.map((s) => <option key={s.id} value={s.id}>{s.name}（{s.cidr}）</option>)}
        </select>
      </Field>
      <Field
        label="VLAN"
        error={nodeErrs.vlan?.[0]}
        locked={isFrozen}
        hint={lockHint('vlan')}
      >
        <input
          value={node.vlan}
          disabled={isFrozen}
          onChange={(e) => topology.patchNode(node.id, { vlan: e.target.value.replace(/[^\d]/g, '') })}
        />
      </Field>
      <Field
        label="静态 IP"
        error={nodeErrs.ip?.[0]}
        locked={isFrozen}
        hint={lockHint('ip') || (seg ? `须位于 ${seg.cidr}` : '先选择网段')}
      >
        <input
          value={node.ip}
          disabled={isFrozen}
          placeholder="如 10.0.1.12"
          onChange={(e) => topology.patchNode(node.id, { ip: e.target.value.trim() })}
        />
      </Field>

      <div className="inspector-actions">
        <button className="danger" disabled={isFrozen} onClick={() => {
          topology.removeNode(node.id);
          onSelect({ type: 'node', id: state.nodes.find((n) => n.id !== node.id)?.id });
        }}>删除设备{isFrozen ? '（冻结）' : ''}</button>
      </div>

      <Connections node={node} topology={topology} errIdx={errIdx} onSelect={onSelect} />
    </aside>
  );
};

function Connections({ node, topology, errIdx, onSelect }) {
  const { state } = topology;
  const [peer, setPeer] = useState('');
  const [gateway, setGateway] = useState('');
  const edges = state.edges.filter((e) => e.a === node.id || e.b === node.id);
  const usedPeerIds = new Set(edges.flatMap((e) => [e.a, e.b]));
  const candidates = state.nodes.filter((n) => n.id !== node.id && !usedPeerIds.has(n.id));

  const peerNode = state.nodes.find((n) => n.id === peer);
  const wouldCross = peerNode && node.segmentId && peerNode.segmentId && node.segmentId !== peerNode.segmentId;

  return (
    <div className="connections">
      <div className="section-title"><span>连接</span><small>{edges.length} 条</small></div>
      {edges.map((e) => {
        const key = edgeKeyOf(e);
        const other = state.nodes.find((n) => n.id === (e.a === node.id ? e.b : e.a));
        const cross = isCrossSegment(state.nodes, e);
        const errs = errIdx.edge[key] || {};
        const flat = Object.values(errs).flat();
        const frozenGw = topology.locked && topology.currentSnapshot?.edges.find((x) => edgeKeyOf(x) === key);
        return (
          <div key={key} className={'connection' + (flat.length ? ' bad' : '')}>
            <div className="conn-row" onClick={() => onSelect({ type: 'edge', key })}>
              <span className={'mini ' + other?.type}>{iconOf(other?.type)}</span>
              <strong>{other?.name}</strong>
              <span className={'badge ' + (cross ? 'tone-amber' : 'tone-green')}>{cross ? '跨网段' : '同网段'}</span>
            </div>
            <label className="gw-row">
              网关
              <input
                value={e.gateway ?? ''}
                disabled={topology.locked && !!frozenGw}
                placeholder={cross ? '跨网段必填' : '同网段无需填写'}
                onChange={(ev) => topology.patchEdge(key, { gateway: ev.target.value.trim() || null })}
              />
            </label>
            {flat.map((x, i) => <p key={i} className="inline-err">⚠ {x.message}</p>)}
            <button className="link-danger" onClick={() => topology.removeEdge(key)}>移除连接</button>
          </div>
        );
      })}

      <div className="add-conn">
        <select value={peer} onChange={(e) => { setPeer(e.target.value); setGateway(''); }}>
          <option value="">选择对端设备…</option>
          {candidates.map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}
        </select>
        {wouldCross && (
          <input
            value={gateway}
            placeholder="跨网段：登记网关 IP"
            onChange={(e) => setGateway(e.target.value.trim())}
          />
        )}
        <button disabled={!peer || (wouldCross && !gateway)} onClick={() => {
          topology.addEdge(node.id, peer, wouldCross ? gateway : null);
          setPeer(''); setGateway('');
        }}>＋ 建立连接</button>
        {wouldCross && !gateway && <small className="field-msg">跨网段连线必须先登记网关，否则整批拒绝</small>}
      </div>
    </div>
  );
}

function EdgeInspector({ edge, topology, errIdx, onSelect }) {
  const { state, locked, currentSnapshot } = topology;
  const key = edgeKeyOf(edge);
  const a = state.nodes.find((n) => n.id === edge.a);
  const b = state.nodes.find((n) => n.id === edge.b);
  const cross = isCrossSegment(state.nodes, edge);
  const flat = Object.values(errIdx.edge[key] || {}).flat();
  const frozen = locked ? currentSnapshot?.edges.find((e) => edgeKeyOf(e) === key) : null;
  return (
    <aside className="inspector">
      <div className="section-title"><span>连接详情</span>
        <small>{cross ? '跨网段' : '同网段'}</small>
      </div>
      <div className="edge-endpoints">
        <button onClick={() => onSelect({ type: 'node', id: a?.id })}>{a?.name}</button>
        <span>⌁</span>
        <button onClick={() => onSelect({ type: 'node', id: b?.id })}>{b?.name}</button>
      </div>
      <Field
        label="网关 IP"
        error={flat[0]}
        locked={!!frozen}
        hint={frozen ? `发布值 ${frozen.gateway ?? '（无）'}` : cross ? '网关须位于任一端网段内' : '同网段连接不需要网关'}
      >
        <input
          value={edge.gateway ?? ''}
          disabled={!!frozen}
          onChange={(e) => topology.patchEdge(key, { gateway: e.target.value.trim() || null })}
        />
      </Field>
      <div className="inspector-actions">
        <button className="danger" onClick={() => { topology.removeEdge(key); onSelect(null); }}>移除连接</button>
      </div>
    </aside>
  );
}

function SegmentInspector({ seg, topology, errIdx, onSelect }) {
  const { state, result } = topology;
  const members = state.nodes.filter((n) => n.segmentId === seg.id);
  const cap = result.capacity.find((c) => c.segmentId === seg.id);
  const flat = Object.values(errIdx.segment[seg.id] || {}).flat();
  return (
    <aside className="inspector">
      <div className="section-title"><span>网段详情</span><small>{seg.cidr}</small></div>
      {cap && (
        <div className="cap-detail">
          <div>可用地址 <b>{cap.usable}</b></div>
          <div>设备占用 <b>{cap.used}</b></div>
          <div>类型预留 <b>{cap.typeReserve}</b>（交换机管理地址）</div>
          <div className={cap.free < 0 ? 'danger' : ''}>发布后剩余 <b>{cap.free}</b></div>
        </div>
      )}
      {flat.map((e, i) => <p key={i} className="inline-err">⚠ {e.message}</p>)}
      <div className="section-title nodes-head"><span>成员设备</span><small>{members.length}</small></div>
      <div className="node-list">
        {members.map((n) => (
          <button key={n.id} onClick={() => onSelect({ type: 'node', id: n.id })}>
            <i className={n.type}>{iconOf(n.type)}</i>
            <span><strong>{n.name}</strong><small>{n.ip}</small></span>
          </button>
        ))}
      </div>
    </aside>
  );
}
