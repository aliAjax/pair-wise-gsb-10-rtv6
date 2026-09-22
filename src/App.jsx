import React, { useMemo, useState } from 'react';
import { useTopology } from './net/store.js';
import { errorIndex } from './net/validate.js';
import { edgeKeyOf } from './net/segments.js';
import Canvas from './ui/Canvas.jsx';
import SegmentsPanel from './ui/SegmentsPanel.jsx';
import Inspector from './ui/Inspector.jsx';
import PublishBar from './ui/PublishBar.jsx';
import ReportDock from './ui/ReportDock.jsx';
import BatchModal from './ui/BatchModal.jsx';

export default function App() {
  const topology = useTopology();
  const [selected, setSelected] = useState({ type: 'node', id: 'gw' });
  const [showBatch, setShowBatch] = useState(false);
  const errIdx = useMemo(() => errorIndex(topology.result), [topology.result]);

  // 选择仍存在的对象（删除后回退）
  const selection = useMemo(() => {
    if (selected?.type === 'node') {
      return topology.state.nodes.some((n) => n.id === selected.id)
        ? selected
        : { type: 'node', id: topology.state.nodes[0]?.id };
    }
    if (selected?.type === 'edge') {
      const exists = topology.state.edges.some((e) => edgeKeyOf(e) === selected.key);
      return exists ? selected : { type: 'node', id: topology.state.nodes[0]?.id };
    }
    if (selected?.type === 'segment') {
      return topology.state.segments.some((s) => s.id === selected.id)
        ? selected
        : { type: 'node', id: topology.state.nodes[0]?.id };
    }
    return { type: 'node', id: topology.state.nodes[0]?.id };
  }, [selected, topology.state]);

  const canvasSelectedId =
    selected?.type === 'node' ? 'node:' + selected.id : selected?.type === 'edge' ? 'edge:' + selected.key : null;

  return (
    <div className="app">
      <header>
        <div className="brand">
          <span className="brand-mark">⌁</span>
          <div><strong>IPAM FABRIC</strong><small>SUBNET ALLOCATION &amp; CONFLICT DESK</small></div>
        </div>
        <div className="file">
          <span className={'dot ' + (topology.locked ? 'locked' : 'draft')}></span>
          <div>
            <strong>{topology.currentSnapshot ? topology.currentSnapshot.id : '工作草稿'}</strong>
            <small>{topology.locked ? '已冻结 · 调整需修订版本' : topology.state.publication.revision ? '修订中' : '未发布'}</small>
          </div>
        </div>
        <div className="top-actions">
          <button onClick={topology.resetAll}>重置示例</button>
        </div>
      </header>

      <PublishBar topology={topology} onOpenBatch={() => setShowBatch(true)} />

      <div className="workspace">
        <SegmentsPanel topology={topology} selectedId={canvasSelectedId} onSelect={(k) => {
          const [t, id] = k.split(':');
          setSelected(t === 'edge' ? { type: 'edge', key: id } : { type: t, id });
        }} errIdx={errIdx} />
        <Canvas topology={topology} selectedId={canvasSelectedId} onSelect={(k) => {
          const [t, id] = k.split(':');
          setSelected(t === 'edge' ? { type: 'edge', key: id } : { type: t, id });
        }} errIdx={errIdx} />
        <Inspector topology={topology} selection={selection} onSelect={setSelected} errIdx={errIdx} />
      </div>

      <ReportDock topology={topology} onSelect={setSelected} />

      {showBatch && <BatchModal topology={topology} onClose={() => setShowBatch(false)} />}
      {topology.notice.text && <Toast notice={topology.notice} />}
    </div>
  );
}

function Toast({ notice }) {
  return <div key={notice.at} className={'toast ' + (notice.kind || 'info')}>{notice.text}</div>;
}
