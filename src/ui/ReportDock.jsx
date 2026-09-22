import React, { useState } from 'react';

const KIND_LABEL = {
  'cidr-invalid': 'CIDR 非法',
  'cidr-duplicate': 'CIDR 重复',
  'cidr-not-network': '非网络地址',
  'vlan-invalid': 'VLAN 非法',
  'node-vlan-invalid': 'VLAN 非法',
  'node-vlan-mismatch': 'VLAN 不一致',
  'node-no-segment': '未登记网段',
  'ip-invalid': 'IP 非法',
  'ip-outside': 'IP 越界',
  'ip-reserved': '保留地址',
  'ip-duplicate': 'IP 冲突',
  'gateway-missing': '缺网关',
  'gateway-outside': '网关越界',
  'gateway-unneeded': '多余网关',
  'edge-dangling': '悬空连接',
  'edge-self': '自连',
  'edge-duplicate': '重复连接',
  'capacity-overflow': '容量超限',
};

export default function ReportDock({ topology, onSelect }) {
  const [open, setOpen] = useState(true);
  const errors = topology.result.errors.filter((e) => e.level === 'error');
  const warns = topology.result.errors.filter((e) => e.level === 'warn');

  const jump = (e) => {
    if (e.target === 'node') onSelect({ type: 'node', id: e.id });
    if (e.target === 'edge') onSelect({ type: 'edge', key: e.id });
    if (e.target === 'segment') onSelect({ type: 'segment', id: e.id });
  };

  const rows = (list, tone) => list.map((e, i) => {
    const [a, b] = e.target === 'edge' ? e.id.split('|') : [];
    const name = e.target === 'edge'
      ? `${nameOf(topology, a)} ↔ ${nameOf(topology, b)}`
      : nameOf(topology, e.id, e.target);
    return (
      <tr key={i} className={tone} onClick={() => jump(e)}>
        <td>{({ node: '设备', edge: '连接', segment: '网段' })[e.target]}</td>
        <td>{name}</td>
        <td><code>{e.field}</code></td>
        <td><span className={'kind-tag k-' + e.kind}>{KIND_LABEL[e.kind] || e.kind}</span></td>
        <td>{e.message}</td>
      </tr>
    );
  });

  return (
    <div className={'report-dock' + (open ? ' open' : '')}>
      <div className="dock-head" onClick={() => setOpen(!open)}>
        <span>地址冲突预检</span>
        <b className={errors.length ? 'bad' : 'ok'}>{errors.length} 错误</b>
        <b className="muted">{warns.length} 警告</b>
        <span className="dock-toggle">{open ? '▾' : '▴'}</span>
      </div>
      {open && (
        <div className="dock-body">
          {errors.length + warns.length === 0 ? (
            <p className="all-clear">✓ 全部规则通过：网段唯一、IP 全图无重复且位于网段内、跨网段连接均已登记网关、容量满足类型预留。</p>
          ) : (
            <table>
              <thead><tr><th>对象</th><th>名称</th><th>冲突字段</th><th>类型</th><th>说明</th></tr></thead>
              <tbody>{rows(errors, 'err')}{rows(warns, 'warn')}</tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

function nameOf(topology, id, target) {
  if (target === 'node') return topology.state.nodes.find((n) => n.id === id)?.name || id;
  if (target === 'segment') return topology.state.segments.find((s) => s.id === id)?.name || id;
  return topology.state.nodes.find((n) => n.id === id)?.name || id;
}
