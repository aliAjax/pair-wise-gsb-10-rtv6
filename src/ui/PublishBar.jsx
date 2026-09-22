import React, { useState } from 'react';
import { TYPE_LABEL } from '../net/segments.js';

export default function PublishBar({ topology, onOpenBatch }) {
  const { state, result, locked, currentSnapshot, revisionDiff } = topology;
  const [reason, setReason] = useState('');
  const [publishErrors, setPublishErrors] = useState(null);
  const [showVersions, setShowVersions] = useState(false);
  const errors = result.errors.filter((e) => e.level === 'error');
  const warns = result.errors.filter((e) => e.level === 'warn');

  const doPublish = () => {
    const out = topology.publish(reason);
    if (out.ok) {
      setPublishErrors(null);
      setReason('');
      topology.flash(`已发布版本 ${out.snapshot.id}（基于 ${out.snapshot.basedOn ?? '初始'}），地址与网关已冻结`, 'ok');
    } else {
      setPublishErrors(out.errors);
    }
  };

  const startRev = () => {
    if (topology.startRevision(reason)) {
      setReason('');
      topology.flash('修订版本已开启：设备地址与连接网关解冻，发布后生成新版本且旧值保留', 'ok');
    }
  };

  const fmt = (iso) => new Date(iso).toLocaleString('zh-CN', { hour12: false });

  return (
    <>
      <div className={'publish-bar' + (locked ? ' locked' : '')}>
        <div className="pub-status">
          {currentSnapshot ? (
            <>
              <span className="pub-dot"></span>
              <div>
                <strong>当前版本 {currentSnapshot.id}</strong>
                <small>{fmt(currentSnapshot.at)} · {currentSnapshot.reason || '（首次发布，无原因）'}</small>
              </div>
            </>
          ) : (
            <>
              <span className="pub-dot draft"></span>
              <div><strong>工作稿</strong><small>尚未发布：所有内容可编辑</small></div>
            </>
          )}
          {state.publication.snapshots.length > 0 && (
            <button className="link" onClick={() => setShowVersions(true)}>
              版本链（{state.publication.snapshots.length}）
            </button>
          )}
          {state.publication.revision && (
            <span className="badge tone-amber rev-badge">
              修订中：{state.publication.revision.reason}
            </span>
          )}
        </div>

        <div className="pub-checks">
          <span className={errors.length ? 'stat bad' : 'stat ok'}>{errors.length} 错误</span>
          <span className="stat">{warns.length} 警告</span>
          {result.isolated.length > 0 && <span className="stat warn">{result.isolated.length} 孤立设备</span>}
        </div>

        <div className="pub-actions">
          <button onClick={onOpenBatch}>整批登记</button>
          {locked ? (
            <>
              <input
                className="reason-input"
                placeholder="调整原因（必填），如：办公区扩容改 /23"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
              <button className="warn-btn" disabled={!reason.trim()} onClick={startRev}>新建修订版本</button>
            </>
          ) : (
            <>
              {currentSnapshot && (
                <input
                  className="reason-input"
                  placeholder="本次修订原因（发布时写入版本）"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              )}
              <button className="primary" onClick={doPublish}>发布冻结</button>
            </>
          )}
        </div>
      </div>

      {revisionDiff && (currentSnapshot && !locked) && (
        <RevisionDiff diff={revisionDiff} topology={topology} />
      )}

      {publishErrors && (
        <div className="publish-errors">
          <strong>无法发布：{publishErrors.length} 项预检未通过</strong>
          <ul>
            {publishErrors.slice(0, 8).map((e, i) => (
              <li key={i}>[{({ node: '设备', edge: '连接', segment: '网段' })[e.target]}] {e.message}</li>
            ))}
          </ul>
          <button onClick={() => setPublishErrors(null)}>知道了</button>
        </div>
      )}

      {showVersions && (
        <VersionChain topology={topology} onClose={() => setShowVersions(false)} />
      )}
    </>
  );
}

function RevisionDiff({ diff, topology }) {
  const nameOf = (id) => topology.state.nodes.find((n) => n.id === id)?.name || id;
  const segName = (id) => topology.state.segments.find((s) => s.id === id)?.name || id;
  const fieldLabel = (k) => ({ segmentId: '网段', vlan: 'VLAN', ip: 'IP', name: '名称', type: '类型', cidr: 'CIDR', gateway: '网关' })[k] || k;
  const valOf = (k, v) => k === 'segmentId' ? segName(v) : (v ?? '∅');
  return (
    <div className="rev-diff">
      <strong>本次修订相对 {topology.currentSnapshot.id} 的改动（发布后旧值随版本链保留）</strong>
      {diff.nodes.map((d) => (
        <div key={d.id} className="diff-line">
          设备「{d.name}」：
          {Object.entries(d.fields).map(([k, v]) => (
            <span key={k} className="chg">{fieldLabel(k)} <del>{valOf(k, v.from)}</del> → <b>{valOf(k, v.to)}</b></span>
          ))}
        </div>
      ))}
      {diff.segments.map((d) => (
        <div key={d.id} className="diff-line">
          网段「{d.name}」：
          {Object.entries(d.fields).map(([k, v]) => (
            <span key={k} className="chg">{fieldLabel(k)} <del>{v.from ?? '∅'}</del> → <b>{v.to ?? '∅'}</b></span>
          ))}
        </div>
      ))}
      {diff.edges.map((d) => (
        <div key={d.key} className="diff-line">
          连接「{nameOf(d.a)} ↔ {nameOf(d.b)}」：
          <span className="chg">网关 <del>{d.from ?? '∅'}</del> → <b>{d.to ?? '∅'}</b></span>
        </div>
      ))}
      {diff.added.length > 0 && <div className="diff-line">新增设备：{diff.added.map((n) => n.name).join('、')}</div>}
      {diff.removed.length > 0 && <div className="diff-line">删除设备：{diff.removed.map((n) => n.name).join('、')}</div>}
      {!diff.nodes.length && !diff.segments.length && !diff.edges.length && !diff.added.length && !diff.removed.length && (
        <div className="diff-line muted">暂无改动</div>
      )}
    </div>
  );
}

function VersionChain({ topology, onClose }) {
  const snaps = topology.state.publication.snapshots;
  const fmt = (iso) => new Date(iso).toLocaleString('zh-CN', { hour12: false });
  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="modal wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head"><strong>发布版本链</strong><button className="icon-btn" onClick={onClose}>×</button></div>
        <ol className="version-chain">
          {snaps.map((s, i) => (
            <li key={s.id}>
              <div className="ver-node">
                <b>v{i + 1} · {s.id}</b>
                <small>{fmt(s.at)}</small>
                <p>{s.reason || '（无原因）'}</p>
                <small className="muted">基于：{s.basedOn ?? '初始'} · {s.nodes.length} 设备 / {s.segments.length} 网段 / {s.edges.length} 连接</small>
                <details>
                  <summary>冻结值快照</summary>
                  <div className="snapshot-grid">
                    {s.nodes.map((n) => (
                      <div key={n.id} className="snap-node">
                        <b>{n.name}</b>
                        <small>{TYPE_LABEL[n.type]} · {n.ip} · VLAN {n.vlan}</small>
                      </div>
                    ))}
                  </div>
                  <div className="snapshot-edges">
                    {s.edges.map((e, j) => {
                      const a = s.nodes.find((n) => n.id === e.a);
                      const b = s.nodes.find((n) => n.id === e.b);
                      return <small key={j}>{a?.name || e.a} ↔ {b?.name || e.b}：网关 {e.gateway ?? '同网段无'}</small>;
                    })}
                  </div>
                </details>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
