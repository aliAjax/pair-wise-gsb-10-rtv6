import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  loadState, saveState, publish, beginVersion, commitVersion, cancelVersion,
  isNodeFrozen, isEdgeFrozen, FROZEN_NODE_FIELDS, FROZEN_EDGE_FIELDS,
} from '../model/store.js';
import { validateGraph } from '../model/validate.js';
import { parseCidr, cidrToString } from '../model/ip.js';
import { suggestIp, typeLabel } from '../model/subnet.js';
import Inventory from './Inventory.jsx';
import Canvas from './Canvas.jsx';
import Inspector from './Inspector.jsx';

let seq = 0;
const uid = (p) => `${p}${Date.now().toString(36)}${(seq++).toString(36)}`;

export default function App() {
  const [state, setState] = useState(loadState);
  const [selected, setSelected] = useState({ kind: 'node', id: 'gw' });
  const [tool, setTool] = useState('select');
  const [connectFrom, setConnectFrom] = useState(null);
  const [notice, setNotice] = useState('');
  const [reasonOpen, setReasonOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [drag, setDrag] = useState(null);
  const board = useRef(null);

  useEffect(() => saveState(state), [state]);
  useEffect(() => {
    if (!notice) return undefined;
    const t = setTimeout(() => setNotice(''), 3600);
    return () => clearTimeout(t);
  }, [notice]);

  // 预检台：冲突实时计算，界面随时标出设备、连接与字段
  const result = useMemo(() => validateGraph(state), [state]);
  const errFor = (scope, id, field) =>
    result.errors.find((e) => e.scope === scope && e.id === id && (!field || e.field === field));

  const notify = (msg) => setNotice(msg);
  const select = (kind, id) => setSelected({ kind, id });

  // ---- 设备 ----
  const addNode = (type) => {
    const subnet = state.subnets[0];
    const node = {
      id: uid('n'),
      name: typeLabel(type),
      type,
      x: 480,
      y: 300,
      subnetId: subnet?.id ?? '',
      vlan: subnet?.vlan ?? 1,
      ip: subnet ? suggestIp(state, subnet.id) : '',
    };
    setState({ ...state, nodes: [...state.nodes, node] });
    select('node', node.id);
    notify('已添加设备，请核对网段与 IP');
  };

  const updateNode = (id, field, value) => {
    if (FROZEN_NODE_FIELDS.includes(field) && isNodeFrozen(state, id)) {
      notify('已发布冻结：请新建版本后再调整地址');
      return;
    }
    setState({
      ...state,
      nodes: state.nodes.map((n) => {
        if (n.id !== id) return n;
        const next = { ...n, [field]: value };
        if (field === 'subnetId') {
          const s = state.subnets.find((x) => x.id === value);
          if (s) {
            next.vlan = s.vlan;
            next.ip = suggestIp(state, value) || n.ip;
          }
        }
        return next;
      }),
    });
  };

  const removeNode = (id) => {
    if (isNodeFrozen(state, id)) {
      notify('已发布设备需新建版本后才能删除');
      return;
    }
    setState({
      ...state,
      nodes: state.nodes.filter((n) => n.id !== id),
      edges: state.edges.filter((e) => e.a !== id && e.b !== id),
    });
    setSelected({ kind: null, id: null });
    notify('设备已删除');
  };

  // ---- 连接 ----
  const handleNodeClick = (id) => {
    if (tool !== 'connect') {
      select('node', id);
      return;
    }
    if (!connectFrom) {
      setConnectFrom(id);
      return;
    }
    if (connectFrom === id) {
      setConnectFrom(null);
      return;
    }
    const exists = state.edges.some(
      (e) => (e.a === connectFrom && e.b === id) || (e.a === id && e.b === connectFrom),
    );
    if (exists) {
      notify('两个设备之间已存在连接');
      setConnectFrom(null);
      setTool('select');
      return;
    }
    const edge = { id: uid('e'), a: connectFrom, b: id, gateway: '' };
    const a = state.nodes.find((n) => n.id === connectFrom);
    const b = state.nodes.find((n) => n.id === id);
    const cross = a && b && a.subnetId !== b.subnetId;
    setState({ ...state, edges: [...state.edges, edge] });
    setConnectFrom(null);
    setTool('select');
    select('edge', edge.id);
    notify(cross ? '已创建跨网段连接，请登记网关' : '连接已创建');
  };

  const updateEdge = (id, field, value) => {
    if (FROZEN_EDGE_FIELDS.includes(field) && isEdgeFrozen(state, id)) {
      notify('已发布冻结：请新建版本后再调整网关');
      return;
    }
    setState({ ...state, edges: state.edges.map((e) => (e.id === id ? { ...e, [field]: value } : e)) });
  };

  const removeEdge = (id) => {
    if (isEdgeFrozen(state, id)) {
      notify('已发布连接需新建版本后才能删除');
      return;
    }
    setState({ ...state, edges: state.edges.filter((e) => e.id !== id) });
    setSelected({ kind: null, id: null });
    notify('连接已删除');
  };

  const startConnect = (id) => {
    setTool('connect');
    setConnectFrom(id);
    notify('连接模式：点击另一个设备完成连线');
  };

  // ---- 网段：同一 CIDR 只能生成一次 ----
  const addSubnet = ({ name, cidr, vlan }) => {
    const c = parseCidr(cidr);
    if (!c) return 'CIDR 格式无效，例如 192.168.10.0/24';
    const key = cidrToString(c);
    const dup = state.subnets.some((s) => {
      const x = parseCidr(s.cidr);
      return x && cidrToString(x) === key;
    });
    if (dup) return `网段 ${key} 已存在，同一 CIDR 只能生成一次`;
    if (!(Number(vlan) >= 1 && Number(vlan) <= 4094)) return 'VLAN 需在 1–4094 之间';
    const subnet = { id: uid('s'), name: name || key, cidr: key, vlan: Number(vlan) };
    setState({ ...state, subnets: [...state.subnets, subnet] });
    select('subnet', subnet.id);
    notify(`网段 ${subnet.cidr} 已生成`);
    return null;
  };

  // ---- 预检 / 发布 / 版本 ----
  const runCheck = () => {
    notify(
      result.ok
        ? '预检通过：网段、地址与网关均无冲突'
        : `预检发现 ${result.errors.length} 项冲突，已标出设备、连接与字段`,
    );
  };

  const doPublish = () => {
    const { state: next, result: r } = publish(state);
    if (!r.ok) {
      notify(`整批拒绝：${r.errors.length} 项冲突未解决，不得发布`);
      return;
    }
    setState(next);
    notify('已发布 v1，设备地址与连接网关已冻结');
  };

  const confirmVersion = () => {
    if (!reason.trim()) return;
    setState(beginVersion(state, reason.trim()));
    setReasonOpen(false);
    notify(`版本草稿 v${(state.published?.version ?? 0) + 1} 已开始，冻结字段已解锁`);
  };

  const doCommit = () => {
    const out = commitVersion(state);
    if (out.error) {
      notify(out.error);
      return;
    }
    if (out.result && !out.result.ok) {
      notify(`整批拒绝：${out.result.errors.length} 项冲突未解决`);
      return;
    }
    setState(out.state);
    notify(`版本 v${out.state.published.version} 已提交，旧值保留在版本链中`);
  };

  const doCancelVersion = () => {
    setState(cancelVersion(state));
    notify('已放弃版本草稿，恢复已发布取值');
  };

  const exportJson = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' }));
    a.download = 'network-topology.json';
    a.click();
    notify('JSON 已导出');
  };

  // ---- 画布拖动 ----
  const move = (e) => {
    if (!drag) return;
    const r = board.current.getBoundingClientRect();
    setState({
      ...state,
      nodes: state.nodes.map((n) =>
        n.id === drag
          ? { ...n, x: Math.max(35, e.clientX - r.left), y: Math.max(35, e.clientY - r.top) }
          : n,
      ),
    });
  };

  const nodeDown = (id) => {
    select('node', id);
    if (tool === 'select') setDrag(id);
  };

  const blank = () => {
    setSelected({ kind: null, id: null });
    setConnectFrom(null);
  };

  const status = state.draft
    ? `版本草稿 v${(state.published?.version ?? 0) + 1} 编辑中`
    : state.published
      ? `已发布 v${state.published.version}`
      : '未发布';

  return (
    <div className="app">
      <header>
        <div className="brand">
          <span className="brand-mark">⌁</span>
          <div>
            <strong>NETSCAPE</strong>
            <small>ADDRESS CONSOLE</small>
          </div>
        </div>
        <div className="file">
          <span className="dot"></span>
          <div>
            <strong>office-network.json</strong>
            <small>自动保存到本地</small>
          </div>
        </div>
        <span className={'status' + (state.draft ? ' draft' : state.published ? ' pub' : '')}>{status}</span>
        <div className="top-actions">
          <button onClick={runCheck}>✓ 预检</button>
          <button onClick={exportJson}>↓ 导出</button>
          {!state.published && (
            <button className="save" onClick={doPublish}>发布</button>
          )}
          {state.published && !state.draft && (
            <button className="save" onClick={() => { setReason(''); setReasonOpen(true); }}>＋ 新建版本</button>
          )}
          {state.draft && (
            <>
              <button className="save" onClick={doCommit}>提交版本</button>
              <button onClick={doCancelVersion}>放弃</button>
            </>
          )}
        </div>
      </header>

      <div className="toolbar">
        <div className="tool-group">
          <span>工具</span>
          <button className={tool === 'select' ? 'on' : ''} onClick={() => { setTool('select'); setConnectFrom(null); }}>↖ 选择</button>
          <button className={tool === 'connect' ? 'on' : ''} onClick={() => setTool('connect')}>⌁ 连接</button>
          <button onClick={() => addNode('device')}>＋ 设备</button>
        </div>
        <div className="tool-group zoom">
          <button>−</button><span>100%</span><button>＋</button>
          <button onClick={() => notify('画布已居中')}>⌗</button>
        </div>
      </div>

      {state.draft && (
        <div className="draft-bar">
          ✎ 版本草稿 v{(state.published?.version ?? 0) + 1} · {state.draft.reason} —— 冻结字段已解锁，提交时整批预检
        </div>
      )}

      <div className="workspace">
        <Inventory
          state={state}
          selected={selected}
          result={result}
          onSelect={select}
          onAddNode={addNode}
          onAddSubnet={addSubnet}
        />
        <Canvas
          state={state}
          selected={selected}
          result={result}
          tool={tool}
          connectFrom={connectFrom}
          boardRef={board}
          onMove={move}
          onUp={() => setDrag(null)}
          onNodeDown={nodeDown}
          onNodeClick={handleNodeClick}
          onEdgeClick={(id) => select('edge', id)}
          onBlank={blank}
          onSelectError={(e) => select(e.scope, e.id)}
        />
        <Inspector
          state={state}
          selected={selected}
          errFor={errFor}
          onUpdateNode={updateNode}
          onRemoveNode={removeNode}
          onUpdateEdge={updateEdge}
          onRemoveEdge={removeEdge}
          onSelect={select}
          onConnect={startConnect}
        />
      </div>

      {reasonOpen && (
        <div className="modal-mask" onClick={() => setReasonOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>新建调整版本</h3>
            <p>发布后设备地址与连接网关已冻结。提交版本时整批预检，旧值保留在版本链中。</p>
            <input
              autoFocus
              placeholder="调整原因（必填）"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
            <div className="row">
              <button onClick={() => setReasonOpen(false)}>取消</button>
              <button className="ok" disabled={!reason.trim()} onClick={confirmVersion}>开始调整</button>
            </div>
          </div>
        </div>
      )}

      {notice && <div className="toast">{notice}</div>}
    </div>
  );
}
