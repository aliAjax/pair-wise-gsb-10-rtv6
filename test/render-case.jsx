// 被 Vite SSR 加载的渲染用例（.jsx 可被 esbuild 转译）。
import React from 'react';
import { renderToString } from 'react-dom/server';
import { validatePlan, errorIndex } from '../src/net/validate.js';
import Canvas from '../src/ui/Canvas.jsx';
import SegmentsPanel from '../src/ui/SegmentsPanel.jsx';
import Inspector from '../src/ui/Inspector.jsx';
import ReportDock from '../src/ui/ReportDock.jsx';

export function renderSmoke(seed) {
  const state = { ...seed, publication: { snapshots: [], revision: null } };
  const result = validatePlan(state);
  const errIdx = errorIndex(result);

  const topology = {
    state, result,
    locked: false, currentSnapshot: null, revisionDiff: null,
    notice: { text: '' },
    flash() {}, patchNode() {}, addNode() {}, removeNode() {},
    addSegment() {}, patchSegment() {}, removeSegment() {},
    addEdge() {}, patchEdge() {}, removeEdge() {},
    applyBatch() {}, publish() {}, startRevision() {}, resetAll() {},
  };
  const noop = () => {};
  let html = '';
  html += renderToString(React.createElement(Canvas, { topology, selectedId: 'node:gw', onSelect: noop, errIdx }));
  html += renderToString(React.createElement(SegmentsPanel, { topology, selectedId: 'node:gw', onSelect: noop, errIdx }));
  html += renderToString(React.createElement(Inspector, {
    topology, selection: { type: 'node', id: 'gw' }, onSelect: noop, errIdx,
  }));
  html += renderToString(React.createElement(ReportDock, { topology, onSelect: noop }));

  const snap = {
    id: 'pub-1', at: new Date().toISOString(), reason: '首版', basedOn: null,
    segments: state.segments.map((s) => ({ ...s })),
    nodes: state.nodes.map((n) => ({ ...n })),
    edges: state.edges.map((e) => ({ ...e })),
  };
  const lockedTopology = { ...topology, locked: true, currentSnapshot: snap };
  const lockedHtml = renderToString(React.createElement(Inspector, {
    topology: lockedTopology, selection: { type: 'node', id: 'gw' }, onSelect: noop, errIdx,
  }));

  const badState = structuredClone(state);
  badState.nodes[0].ip = '10.0.1.1'; // 与 sw1 冲突，且越出自身网段
  const badResult = validatePlan(badState);
  const badIdx = errorIndex(badResult);
  const badTopology = { ...topology, state: badState, result: badResult };
  const badHtml = renderToString(React.createElement(ReportDock, { topology: badTopology, onSelect: noop }));

  return { html, lockedHtml, badHtml, result, badResult };
}
