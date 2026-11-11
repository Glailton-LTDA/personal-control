import React, { useMemo } from 'react';
import { renderMarkdown } from '../lib/markdown';

export default function MarkdownRenderer({ content, onToggleCheckbox, fontSize, className = '' }) {
  const html = useMemo(() => renderMarkdown(content), [content]);
  const handleClick = (event) => {
    const checkbox = event.target.closest('.preview-checkbox-toggle');
    if (checkbox && onToggleCheckbox) {
      onToggleCheckbox(Number.parseInt(checkbox.getAttribute('data-line-index'), 10));
    }
  };
  return (
    <div className={`markdown-body ${className}`} onClick={onToggleCheckbox ? handleClick : undefined}
      style={{ color: 'var(--text-main)', fontSize: fontSize ? `${fontSize}px` : '0.95rem', lineHeight: 1.6, wordBreak: 'break-word' }}
      dangerouslySetInnerHTML={{ __html: html }} />
  );
}
