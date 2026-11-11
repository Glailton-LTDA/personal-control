import DOMPurify from 'dompurify';

function escapeHtml(value) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function splitTableRow(line) {
  // Protect escaped pipes and pipes within inline code when splitting columns.
  const cells = [];
  let cell = '';
  let code = false;
  for (let index = 0; index < line.length; index++) {
    const char = line[index];
    if (char === '\\' && line[index + 1] === '|') { cell += '|'; index++; }
    else if (char === '`') { code = !code; cell += char; }
    else if (char === '|' && !code) { cells.push(cell); cell = ''; }
    else cell += char;
  }
  cells.push(cell);
  if (!cells[0].trim()) cells.shift();
  if (!cells.at(-1)?.trim()) cells.pop();
  return cells;
}

function parseTableLines(tableLines) {
  const headers = splitTableRow(tableLines[0]);
  const headerCells = headers.map(c => inlineStyles(escapeHtml(c.trim())));
  let dataStart = 1;
  if (tableLines.length > 1 && splitTableRow(tableLines[1]).every(cell => /^:?-{3,}:?$/.test(cell.trim()))) {
    dataStart = 2;
  }
  let tbl = '<table style="width:100%;border-collapse:collapse;margin:0.5rem 0;border:1px solid var(--glass-border);border-radius:8px;overflow:hidden;">';
  tbl += '<thead><tr>';
  headerCells.forEach(c => {
    tbl += `<th style="border:1px solid var(--glass-border);padding:0.5rem 0.75rem;background:rgba(255,255,255,0.03);font-weight:700;text-align:left;color:var(--text-main);font-size:0.9em;">${c}</th>`;
  });
  tbl += '</tr></thead><tbody>';
  for (let r = dataStart; r < tableLines.length; r++) {
    const cells = splitTableRow(tableLines[r]).map(c => inlineStyles(escapeHtml(c.trim())));
    tbl += '<tr>';
    cells.forEach((c, index) => {
      tbl += `<td data-label="${escapeHtml(headers[index]?.trim() || '')}" style="border:1px solid var(--glass-border);padding:0.4rem 0.75rem;color:var(--text-main);font-size:0.9em;">${c || '&nbsp;'}</td>`;
    });
    tbl += '</tr>';
  }
  tbl += '</tbody></table>';
  return tbl;
}

function parseMarkdown(md) {
  if (!md) return '';

  const lines = md.split('\n');
  let html = [];
  let inCodeBlock = false;
  let codeContent = [];
  let listStack = [];

  function closeListToLevel(target) {
    while (listStack.length > target) {
      html.push(`</${listStack.pop()}>`);
    }
  }

  function getIndent(line) {
    const trimmed = line.trimStart();
    return line.length - trimmed.length;
  }

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];

    if (line.trim().startsWith('```')) {
      closeListToLevel(0);
      if (inCodeBlock) {
        inCodeBlock = false;
        const escapedCode = codeContent.join('\n')
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
        html.push(`<pre style="background: rgba(0,0,0,0.35); padding: 0.75rem; border-radius: 8px; border: 1px solid var(--glass-border); font-family: monospace; font-size: 0.85em; overflow-x: auto; color: #a5b4fc; margin: 0.5rem 0; line-height: 1.4;"><code>${escapedCode}</code></pre>`);
        codeContent = [];
      } else {
        inCodeBlock = true;
      }
      continue;
    }

    if (inCodeBlock) {
      codeContent.push(line);
      continue;
    }

    line = line
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

    const trimmed = line.trim();
    const indent = getIndent(line);
    const listLevel = Math.floor(indent / 2);

    if (/^(?:-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      closeListToLevel(0);
      html.push('<hr style="border: none; border-top: 1px solid var(--text-muted); opacity: 0.25; margin: 1.5rem 0;" />');
      continue;
    }

    if (trimmed.startsWith('# ')) {
      closeListToLevel(0);
      html.push(`<h1 style="font-size: 1.5em; font-weight: 800; margin: 1rem 0 0.5rem; color: var(--text-main); line-height: 1.3;">${inlineStyles(trimmed.substring(2))}</h1>`);
      continue;
    }
    if (trimmed.startsWith('## ')) {
      closeListToLevel(0);
      html.push(`<h2 style="font-size: 1.25em; font-weight: 800; margin: 0.85rem 0 0.4rem; color: var(--text-main); line-height: 1.3;">${inlineStyles(trimmed.substring(3))}</h2>`);
      continue;
    }
    if (trimmed.startsWith('### ')) {
      closeListToLevel(0);
      html.push(`<h3 style="font-size: 1.1em; font-weight: 800; margin: 0.75rem 0 0.3rem; color: var(--text-main); line-height: 1.3;">${inlineStyles(trimmed.substring(4))}</h3>`);
      continue;
    }

    if (trimmed.startsWith('|')) {
      closeListToLevel(0);
      let tableLines = [lines[i].trim()];
      while (i + 1 < lines.length && lines[i + 1].trim().startsWith('|')) {
        i++;
        tableLines.push(lines[i].trim());
      }
      html.push(parseTableLines(tableLines));
      continue;
    }

    const checkboxMatch = trimmed.match(/^-\s+\[([ xX])\]\s+(.*)/);
    if (checkboxMatch) {
      closeListToLevel(listLevel);
      if (listStack.length <= listLevel) {
        html.push('<ul style="list-style: none; padding-left: 0; margin: 0.5rem 0; display: flex; flex-direction: column; gap: 0.4rem;">');
        listStack.push('ul');
      }
      const checked = checkboxMatch[1].toLowerCase() === 'x';
      const text = checkboxMatch[2];
      html.push(`
        <li style="display: flex; align-items: flex-start; gap: 0.5rem; font-size: 0.95em; line-height: 1.5; color: var(--text-main);">
          <span
            class="preview-checkbox-toggle"
            data-line-index="${i}"
            style="display: inline-flex; align-items: center; justify-content: center; width: 16px; height: 16px; border-radius: 4px; border: 1.5px solid ${checked ? 'var(--success)' : 'var(--text-muted)'}; background: ${checked ? 'var(--success)' : 'transparent'}; margin-top: 3px; flex-shrink: 0; cursor: pointer;"
          >
            ${checked ? '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" style="pointer-events: none;"><polyline points="20 6 9 17 4 12"></polyline></svg>' : ''}
          </span>
          <span style="${checked ? 'text-decoration: line-through; opacity: 0.6;' : ''}">${inlineStyles(text)}</span>
        </li>
      `);
      continue;
    }

    const orderedMatch = trimmed.match(/^(\d+)\.\s+(.*)/);
    if (orderedMatch) {
      closeListToLevel(listLevel);
      if (listStack.length <= listLevel) {
        html.push('<ol style="padding-left: 1.5rem; margin: 0.5rem 0; display: flex; flex-direction: column; gap: 0.25rem; list-style-type: decimal;">');
        listStack.push('ol');
      }
      html.push(`<li style="font-size: 0.95em; line-height: 1.5; color: var(--text-main);">${inlineStyles(orderedMatch[2])}</li>`);
      continue;
    }

    const listMatch = trimmed.match(/^[-*]\s+(.*)/);
    if (listMatch) {
      closeListToLevel(listLevel);
      if (listStack.length <= listLevel) {
        html.push('<ul style="list-style-type: disc; padding-left: 1.25rem; margin: 0.5rem 0; display: flex; flex-direction: column; gap: 0.25rem;">');
        listStack.push('ul');
      }
      html.push(`<li style="font-size: 0.95em; line-height: 1.5; color: var(--text-main);">${inlineStyles(listMatch[1])}</li>`);
      continue;
    }

    if (trimmed === '') {
      closeListToLevel(0);
      html.push('<div style="height: 0.5rem;"></div>');
    } else {
      closeListToLevel(0);
      html.push(`<p style="font-size: 0.95em; line-height: 1.6; margin: 0.5rem 0; color: var(--text-main);">${inlineStyles(trimmed)}</p>`);
    }
  }

  closeListToLevel(0);
  if (inCodeBlock) {
    const escapedCode = codeContent.join('\n')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
    html.push(`<pre style="background: rgba(0,0,0,0.35); padding: 0.75rem; border-radius: 8px; border: 1px solid var(--glass-border); font-family: monospace; font-size: 0.85em; overflow-x: auto; color: #a5b4fc; margin: 0.5rem 0; line-height: 1.4;"><code>${escapedCode}</code></pre>`);
  }

  return html.join('\n');
}

function inlineStyles(text) {
  text = text.replace(/\*\*([\s\S]*?)\*\*/g, '<strong style="font-weight: 700; color: var(--text-main);">$1</strong>');
  text = text.replace(/\*([\s\S]*?)\*/g, '<em style="font-style: italic; opacity: 0.9;">$1</em>');
  text = text.replace(/`([^`]+)`/g, '<code style="background: rgba(255,255,255,0.08); padding: 0.15rem 0.4rem; border-radius: 4px; font-family: monospace; font-size: 0.85em; color: #f472b6;">$1</code>');
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, label, href) => {
    if (!/^(?:https?:\/\/|mailto:)/i.test(href.trim())) return label;
    return `<a href="${href}" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer" style="color: var(--primary); text-decoration: underline; font-weight: 600;">${label}</a>`;
  });
  return text;
}


// Raw HTML is displayed as text. Sanitize generated markup as defense in depth.
export function renderMarkdown(content) {
  return DOMPurify.sanitize(parseMarkdown(content), {
    ALLOWED_TAGS: ['h1', 'h2', 'h3', 'p', 'strong', 'em', 'code', 'pre', 'a', 'hr', 'div', 'ul', 'ol', 'li', 'span', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'svg', 'polyline'],
    ALLOWED_ATTR: ['class', 'style', 'href', 'target', 'rel', 'referrerpolicy', 'width', 'height', 'viewBox', 'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'points', 'data-line-index', 'data-label'],
  });
}
