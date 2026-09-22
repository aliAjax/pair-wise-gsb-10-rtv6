import React from 'react';

export const ICONS = { router: '◉', switch: '▦', server: '▣', device: '▱' };
export const iconOf = (t) => ICONS[t] || ICONS.device;

export function Field({ label, error, children, hint, locked }) {
  return (
    <label className={'field' + (error ? ' bad' : '') + (locked ? ' locked' : '')}>
      <span className="field-label">
        {label}
        {locked && <em className="lock-tag">冻结</em>}
        {error && <em className="err-tag">{error.kind === 'ip-duplicate' ? '冲突' : '错误'}</em>}
      </span>
      {children}
      {error
        ? <small className="field-msg danger">{error.message}</small>
        : hint ? <small className="field-msg">{hint}</small> : null}
    </label>
  );
}

export function Badge({ children, tone = 'gray' }) {
  return <span className={'badge tone-' + tone}>{children}</span>;
}
