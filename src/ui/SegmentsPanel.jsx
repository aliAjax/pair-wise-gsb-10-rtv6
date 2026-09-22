import React from 'react';
import { parseCidr } from '../net/segments.js';

export default function SegmentsPanel({ topology, selectedId, onSelect, errIdx }) {
  const { state, result, locked } = topology;

  return (
    <aside className="inventory">
      <div className="section-title">
        <span>网段登记</span>
        <small>{state.segments.length} 个</small>
      </div>
      <div className="seg-list">
        {state.segments.map((s) => {
          const cap = result.capacity.find((c) => c.segmentId === s.id);
          const fields = errIdx.segment[s.id] || {};
          const errs = Object.values(fields).flat();
          const info = parseCidr(s.cidr);
          const ratio = cap && cap.usable > 0 ? Math.min(1, (cap.used + cap.typeReserve) / cap.usable) : 0;
          return (
            <div
              key={s.id}
              className={'seg-card' + (selectedId === 'segment:' + s.id ? ' sel' : '') + (errs.length ? ' bad' : '')}
              onClick={() => onSelect('segment:' + s.id)}
            >
              <div className="seg-head">
                <input
                  className="seg-name"
                  value={s.name}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => topology.patchSegment(s.id, { name: e.target.value })}
                />
                <button
                  className="icon-btn"
                  title="删除网段"
                  disabled={locked}
                  onClick={(e) => { e.stopPropagation(); topology.removeSegment(s.id); }}
                >×</button>
              </div>
              <div className={'seg-row' + (fields.cidr ? ' bad' : '')}>
                <label>CIDR
                  <input
                    value={s.cidr}
                    disabled={locked}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => topology.patchSegment(s.id, { cidr: e.target.value })}
                  />
                </label>
                <label className="vlan">VLAN
                  <input
                    value={s.vlan}
                    disabled={locked}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => topology.patchSegment(s.id, { vlan: e.target.value.replace(/[^\d]/g, '') })}
                  />
                </label>
              </div>
              {info && (
                <div className="seg-meta">
                  <span>网关 {info.gatewayIp ?? '—'}</span>
                  <span>范围 {info.networkIp} – {info.broadcastIp}</span>
                </div>
              )}
              {cap && (
                <div className="capacity">
                  <div className="cap-bar">
                    <i style={{ width: `${ratio * 100}%` }} className={cap.free < 0 ? 'over' : ''} />
                  </div>
                  <small className={cap.free < 0 ? 'danger' : ''}>
                    可用 {cap.usable} · 已用 {cap.used} · 类型预留 {cap.typeReserve} · 余 {cap.free}
                  </small>
                </div>
              )}
              {errs.map((e, i) => (
                <p key={i} className="inline-err">⚠ {e.message}</p>
              ))}
            </div>
          );
        })}
      </div>
      <button className="block-btn" disabled={locked} onClick={() => {
        const id = topology.addSegment();
        onSelect('segment:' + id);
      }}>＋ 新建网段{locked ? '（已冻结）' : ''}</button>

      <div className="section-title nodes-head">
        <span>图中设备</span>
        <small>点击查看</small>
      </div>
      <div className="node-list">
        {state.nodes.map((n) => {
          const errs = errIdx.node[n.id];
          const seg = state.segments.find((s) => s.id === n.segmentId);
          return (
            <button
              key={n.id}
              className={selectedId === 'node:' + n.id ? 'sel' : ''}
              onClick={() => onSelect('node:' + n.id)}
            >
              <i className={n.type}>{({ router: '◉', switch: '▦', server: '▣', device: '▱' })[n.type]}</i>
              <span>
                <strong>{n.name}</strong>
                <small>{seg ? seg.name + ' · ' : ''}{n.ip || '无 IP'}{errs ? ' ⚠' : ''}</small>
              </span>
            </button>
          );
        })}
      </div>
    </aside>
  );
}
