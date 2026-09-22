import React, { useState } from 'react';

// 整批登记台：粘贴 JSON（网段/设备/连接一次提交）。
// 规则在 net/validate.js 中判定；这里只负责采集、展示被整批拒绝时的设备/连接/字段标记。
const SAMPLE = {
  segments: [
    { ref: 's1', name: 'DMZ', cidr: '172.16.10.0/28', vlan: '100' },
  ],
  nodes: [
    { ref: 'n1', name: '防火墙', type: 'router', segmentRef: 's1', vlan: '100', ip: '172.16.10.1' },
    { ref: 'n2', name: '应用服务器', type: 'server', segmentRef: 's1', vlan: '100', ip: '172.16.10.2' },
  ],
  edges: [
    { a: 'n1', b: 'n2' },
    { a: 'n1', b: 'gw', gateway: '10.0.0.1' },
  ],
};

export default function BatchModal({ topology, onClose }) {
  const [text, setText] = useState(() => JSON.stringify(SAMPLE, null, 2));
  const [rejection, setRejection] = useState(null);

  const submit = () => {
    let incoming;
    try {
      incoming = JSON.parse(text);
    } catch (e) {
      setRejection({ parseError: 'JSON 解析失败：' + e.message });
      return;
    }
    const out = topology.applyBatch(incoming);
    if (out.ok) {
      topology.flash(`整批登记成功：新增 ${out.added.segments} 个网段、${out.added.nodes} 台设备、${out.added.edges} 条连接`, 'ok');
      onClose();
    } else {
      setRejection(out);
    }
  };

  const targetName = (e) => {
    if (e.target === 'node') {
      return rejection.names?.node.get(e.id) || topology.state.nodes.find((n) => n.id === e.id)?.name || e.id;
    }
    if (e.target === 'edge') {
      const [a, b] = e.id.split('|');
      const nm = (x) => x.startsWith('__missing_')
        ? `${x.replace('__missing_', '')}（未找到）`
        : rejection.names?.node.get(x) || topology.state.nodes.find((n) => n.id === x)?.name || x;
      return `${nm(a)} ↔ ${nm(b)}`;
    }
    if (e.target === 'segment') {
      return rejection.names?.segment.get(e.id) || topology.state.segments.find((s) => s.id === e.id)?.name || e.id;
    }
    return e.id;
  };

  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <strong>整批登记</strong>
          <button className="icon-btn" onClick={onClose}>×</button>
        </div>
        <p className="modal-tip">
          一次提交网段、设备与连接。任一项违反规则（CIDR 重复、IP 越界/重复、跨网段缺网关、容量超限）将
          <b>整批拒绝</b>，已存在的数据不会发生任何变化。
          <code>ref / segmentRef</code> 用于在本批数据内互相引用；<code>a/b</code> 也可直接写已有设备 ID。
        </p>
        <textarea className="batch-text" value={text} onChange={(e) => setText(e.target.value)} spellCheck="false" />
        {rejection?.parseError && <p className="inline-err">⚠ {rejection.parseError}</p>}
        {rejection?.errors && (
          <div className="reject-box">
            <div className="reject-head">整批拒绝：{rejection.errors.length} 项冲突，未写入任何数据</div>
            <table>
              <thead><tr><th>对象</th><th>设备 / 连接 / 网段</th><th>冲突字段</th><th>说明</th></tr></thead>
              <tbody>
                {rejection.errors.map((e, i) => (
                  <tr key={i} className={'row-' + e.target}>
                    <td>{({ node: '设备', edge: '连接', segment: '网段' })[e.target]}</td>
                    <td>{targetName(e)}</td>
                    <td><code>{e.field}</code></td>
                    <td>{e.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="modal-actions">
          <button onClick={onClose}>取消</button>
          <button className="primary" onClick={submit}>预检并提交整批</button>
        </div>
      </div>
    </div>
  );
}
