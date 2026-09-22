import React from 'react';
import { typeIcon } from '../model/subnet.js';

export default function Canvas({
  state, selected, result, tool, connectFrom, boardRef,
  onMove, onUp, onNodeDown, onNodeClick, onEdgeClick, onBlank, onSelectError,
}) {
  const nodeErr = new Set(result.errors.filter((e) => e.scope === 'node').map((e) => e.id));
  const edgeErr = new Set(result.errors.filter((e) => e.scope === 'edge').map((e) => e.id));
  const nameOf = (id) => state.nodes.find((n) => n.id === id)?.name ?? id;

  const errLabel = (e) => {
    if (e.scope === 'node') return `设备「${nameOf(e.id)}」`;
    if (e.scope === 'subnet') return `网段「${state.subnets.find((s) => s.id === e.id)?.name ?? e.id}」`;
    const ed = state.edges.find((x) => x.id === e.id);
    return ed ? `连接 ${nameOf(ed.a)}⇄${nameOf(ed.b)}` : '连接';
  };

  return (
    <section className="canvas-wrap">
      <div
        className="canvas"
        ref={boardRef}
        onMouseMove={onMove}
        onMouseUp={onUp}
        onMouseDown={(e) => { if (e.target === e.currentTarget) onBlank(); }}
      >
        {state.edges.map((ed) => {
          const n1 = state.nodes.find((n) => n.id === ed.a);
          const n2 = state.nodes.find((n) => n.id === ed.b);
          if (!n1 || !n2) return null;
          const dx = n2.x - n1.x;
          const dy = n2.y - n1.y;
          const len = Math.hypot(dx, dy);
          const ang = (Math.atan2(dy, dx) * 180) / Math.PI;
          const cross = n1.subnetId !== n2.subnetId;
          const cls =
            'edge' +
            (edgeErr.has(ed.id) ? ' bad' : '') +
            (selected.kind === 'edge' && selected.id === ed.id ? ' sel' : '');
          return (
            <React.Fragment key={ed.id}>
              <div
                className={cls}
                style={{ left: n1.x, top: n1.y, width: len, transform: `rotate(${ang}deg)` }}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={() => onEdgeClick(ed.id)}
              >
                <div className="line"></div>
              </div>
              {cross && (
                <button
                  className={'edge-label' + (ed.gateway ? '' : ' miss')}
                  style={{ left: n1.x + dx / 2, top: n1.y + dy / 2 }}
                  onClick={() => onEdgeClick(ed.id)}
                >
                  {ed.gateway ? `⇄ ${ed.gateway}` : '⚠ 缺网关'}
                </button>
              )}
            </React.Fragment>
          );
        })}

        {state.nodes.map((n) => (
          <button
            key={n.id}
            className={
              'node ' + n.type +
              (selected.kind === 'node' && selected.id === n.id ? ' picked' : '') +
              (nodeErr.has(n.id) ? ' bad' : '') +
              (connectFrom === n.id ? ' src' : '')
            }
            style={{ left: n.x - 42, top: n.y - 31 }}
            onMouseDown={(e) => { e.stopPropagation(); onNodeDown(n.id); }}
            onClick={() => onNodeClick(n.id)}
          >
            <i>{typeIcon(n.type)}</i>
            <strong>{n.name}</strong>
            <small>{n.ip || '未设 IP'}</small>
          </button>
        ))}

        <div className={result.ok ? 'report ok' : 'report'}>
          {result.ok ? (
            '✓ 预检通过：网段、地址与网关无冲突'
          ) : (
            <>
              <div className="report-head">✕ {result.errors.length} 项冲突 · 整批拒绝</div>
              <ul>
                {result.errors.map((e, i) => (
                  <li key={i}>
                    <button onClick={() => onSelectError(e)}>{errLabel(e)} · {e.message}</button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        <div className="legend">
          <span><i className="router"></i>路由器</span>
          <span><i className="switch"></i>交换机</span>
          <span><i className="server"></i>服务器</span>
        </div>
      </div>
      <div className="canvas-footer">
        <span>
          {tool === 'connect'
            ? connectFrom
              ? `连接模式：已选 ${nameOf(connectFrom)}，点击另一个设备`
              : '连接模式：点击第一个设备'
            : `拖动节点调整位置 · ${state.edges.length} 条连接 · ${state.subnets.length} 个网段`}
        </span>
        <span>{state.published ? `已发布 v${state.published.version}` : '未发布'}</span>
      </div>
    </section>
  );
}
