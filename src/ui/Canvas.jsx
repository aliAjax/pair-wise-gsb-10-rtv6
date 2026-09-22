import React, { useRef, useState } from 'react';
import { edgeKeyOf, isCrossSegment } from '../net/segments.js';
import { iconOf } from './widgets.jsx';

export default function Canvas({ topology, selectedId, onSelect, errIdx }) {
  const { state } = topology;
  const boardRef = useRef(null);
  const [drag, setDrag] = useState(null);
  const nodeById = new Map(state.nodes.map((n) => [n.id, n]));
  const crossSet = new Set(state.edges.filter((e) => isCrossSegment(state.nodes, e)).map(edgeKeyOf));

  const onMove = (e) => {
    if (!drag || topology.locked) return;
    const r = boardRef.current.getBoundingClientRect();
    const node = nodeById.get(drag);
    if (!node) return;
    topology.patchNode(drag, {
      x: Math.max(50, Math.min(r.width - 50, e.clientX - r.left)),
      y: Math.max(40, Math.min(r.height - 40, e.clientY - r.top)),
    });
  };

  return (
    <section className="canvas-wrap">
      <div
        className="canvas"
        ref={boardRef}
        onMouseMove={onMove}
        onMouseUp={() => setDrag(null)}
        onMouseLeave={() => setDrag(null)}
      >
        <svg className="edge-layer">
          {state.edges.map((e) => {
            const a = nodeById.get(e.a);
            const b = nodeById.get(e.b);
            if (!a || !b) return null;
            const key = edgeKeyOf(e);
            const cross = crossSet.has(key);
            const edgeErr = errIdx.edge[key] ? Object.values(errIdx.edge[key])[0][0] : null;
            const mx = (a.x + b.x) / 2;
            const my = (a.y + b.y) / 2;
            return (
              <g key={key} className={edgeErr ? 'edge-bad' : ''} onClick={() => onSelect('edge:' + key)}>
                <line className="hit" x1={a.x} y1={a.y} x2={b.x} y2={b.y} />
                <line
                  className={'vis ' + (cross ? 'cross' : 'same')}
                  x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                />
                {(cross || edgeErr) && (
                  <g className="edge-tag" transform={`translate(${mx},${my})`}>
                    <rect
                      x={-58} y={-11} width={116} height={22} rx={4}
                      className={edgeErr ? 'tag-bg bad' : 'tag-bg'}
                    />
                    <text textAnchor="middle" dy="4" className={edgeErr ? 'bad' : ''}>
                      {edgeErr ? (edgeErr.field === 'gateway' ? '⚠ 缺网关' : '⚠ 冲突') : `GW ${e.gateway}`}
                    </text>
                  </g>
                )}
              </g>
            );
          })}
        </svg>

        {state.nodes.map((n) => {
          const nodeErrs = errIdx.node[n.id];
          const hasErr = !!nodeErrs;
          const seg = state.segments.find((s) => s.id === n.segmentId);
          return (
            <button
              key={n.id}
              className={
                'node ' + n.type +
                (selectedId === 'node:' + n.id ? ' picked' : '') +
                (hasErr ? ' has-err' : '')
              }
              style={{ left: n.x - 46, top: n.y - 34, borderColor: segColor(seg?.id) }}
              onMouseDown={(e) => {
                e.stopPropagation();
                onSelect('node:' + n.id);
                setDrag(n.id);
              }}
            >
              <i>{iconOf(n.type)}</i>
              <strong>{n.name}</strong>
              <small>{n.ip || '未分配 IP'}</small>
              <small className="vlan-tag">{seg ? `${seg.name} · VLAN ${n.vlan || '?'}` : '未归网段'}</small>
            </button>
          );
        })}

        <div className="canvas-tools">
          {[['router', '路由器'], ['switch', '交换机'], ['server', '服务器'], ['device', '终端']].map(([t, l]) => (
            <button key={t} title={'添加' + l} onClick={() => {
              const id = topology.addNode(t);
              onSelect('node:' + id);
            }}><i className={t}>{iconOf(t)}</i><span>{l}</span></button>
          ))}
        </div>

        <div className="legend">
          <span><i className="line-same"></i>同网段</span>
          <span><i className="line-cross"></i>跨网段（需网关）</span>
        </div>
      </div>
      <div className="canvas-footer">
        <span>{state.nodes.length} 台设备 · {state.edges.length} 条连接 · {state.segments.length} 个网段</span>
        <span>{topology.locked ? '已发布冻结：仅名称/位置可改，地址调整请新建修订' : '工作稿可编辑'}</span>
      </div>
    </section>
  );
}

const SEG_COLORS = ['#b78137', '#4b8468', '#577aa1', '#8a6192', '#a15b4b', '#3d8b8b'];
const colorMap = new Map();
function segColor(id) {
  if (!id) return undefined;
  if (!colorMap.has(id)) colorMap.set(id, SEG_COLORS[colorMap.size % SEG_COLORS.length]);
  return colorMap.get(id);
}
