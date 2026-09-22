import React, { useState } from 'react';
import { DEVICE_TYPES, typeIcon, subnetUsage } from '../model/subnet.js';

export default function Inventory({ state, selected, result, onSelect, onAddNode, onAddSubnet }) {
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState({ name: '', cidr: '', vlan: 40 });
  const [formErr, setFormErr] = useState('');

  const nodeErr = new Set(result.errors.filter((e) => e.scope === 'node').map((e) => e.id));
  const subnetErr = new Set(result.errors.filter((e) => e.scope === 'subnet').map((e) => e.id));

  const submitSubnet = () => {
    const err = onAddSubnet(form);
    if (err) {
      setFormErr(err);
    } else {
      setFormOpen(false);
      setFormErr('');
      setForm({ name: '', cidr: '', vlan: 40 });
    }
  };

  return (
    <aside className="inventory">
      <div className="section-title">
        <span>设备库</span>
        <small>{state.nodes.length} 个节点</small>
      </div>
      <div className="device-types">
        {DEVICE_TYPES.map(([t, i, l]) => (
          <button onClick={() => onAddNode(t)} key={t}>
            <i className={t}>{i}</i>
            {l}
            <span>＋</span>
          </button>
        ))}
      </div>

      <div className="section-title nodes-head">
        <span>网段</span>
        <button className="mini-btn" onClick={() => setFormOpen(!formOpen)}>
          {formOpen ? '收起' : '＋ 新增'}
        </button>
      </div>
      {formOpen && (
        <div className="subnet-form">
          <input placeholder="名称（可选）" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <input placeholder="CIDR，如 192.168.10.0/24" value={form.cidr} onChange={(e) => setForm({ ...form, cidr: e.target.value })} />
          <input placeholder="VLAN（1–4094）" type="number" value={form.vlan} onChange={(e) => setForm({ ...form, vlan: e.target.value })} />
          {formErr && <em className="field-err">{formErr}</em>}
          <button className="mini-btn solid" onClick={submitSubnet}>生成网段</button>
        </div>
      )}
      <div className="subnet-list">
        {state.subnets.map((s) => {
          const u = subnetUsage(state, s.id);
          const pct = u.capacity ? Math.min(100, (u.reserved / u.capacity) * 100) : 100;
          return (
            <button
              key={s.id}
              className={'subnet-item' + (selected.kind === 'subnet' && selected.id === s.id ? ' sel' : '')}
              onClick={() => onSelect('subnet', s.id)}
            >
              <span className="subnet-head">
                <strong>{s.name}</strong>
                {subnetErr.has(s.id) && <i className="dot-err"></i>}
              </span>
              <small>{s.cidr} · VLAN {s.vlan}</small>
              <span className="usage">
                <i className={u.ok ? '' : 'over'} style={{ width: pct + '%' }}></i>
              </span>
              <small className="usage-text">预留 {u.reserved}/{u.capacity}</small>
            </button>
          );
        })}
      </div>

      <div className="section-title nodes-head">
        <span>图中节点</span>
        <small>点击查看</small>
      </div>
      <div className="node-list">
        {state.nodes.map((n) => (
          <button
            className={selected.kind === 'node' && selected.id === n.id ? 'sel' : ''}
            onClick={() => onSelect('node', n.id)}
            key={n.id}
          >
            <i className={n.type}>{typeIcon(n.type)}</i>
            <span>
              <strong>{n.name}</strong>
              <small>{n.ip || '未设 IP'}</small>
            </span>
            {nodeErr.has(n.id) ? <i className="dot-err"></i> : <b>›</b>}
          </button>
        ))}
      </div>
    </aside>
  );
}
