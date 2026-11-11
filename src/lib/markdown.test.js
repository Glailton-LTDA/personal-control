// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { renderMarkdown } from './markdown';
const dom = (source) => {
  const element = document.createElement('div');
  element.innerHTML = renderMarkdown(source);
  return element;
};
describe('shared Markdown rendering', () => {
  it('supports existing headings, paragraphs, emphasis and inline code', () => {
    const result = dom('# Title\n## Section\n### Detail\n\nA **bold** and *italic* `code` value.\n---');
    expect(result.querySelector('h1').textContent).toBe('Title');
    expect(result.querySelector('h2').textContent).toBe('Section');
    expect(result.querySelector('h3').textContent).toBe('Detail');
    expect(result.querySelector('strong').textContent).toBe('bold');
    expect(result.querySelector('em').textContent).toBe('italic');
    expect(result.querySelector('code').textContent).toBe('code');
    expect(result.querySelector('hr')).not.toBeNull();
  });
  it('renders aligned medical tables without showing the separator as a result', () => {
    const result = dom('| Exame | Resultado | Referência | Situação |\n| :--- | ---: | :---: | --- |\n| **Indicador A** | 12 unidades | 10 a 15 | *Texto* |\n| B | | | |');
    expect(result.querySelectorAll('th')).toHaveLength(4);
    expect(result.querySelectorAll('tbody tr')).toHaveLength(2);
    expect(result.querySelector('td strong').textContent).toBe('Indicador A');
    expect(result.querySelector('td').dataset.label).toBe('Exame');
    expect(result.querySelectorAll('tbody tr')[1].children[1].innerHTML).toBe('&nbsp;');
  });
  it('keeps escaped pipes and code pipes in one table cell, including a missing trailing border', () => {
    const result = dom('| Name | Result\n| --- | ---\n| A\\|B | `x|y`');
    expect(result.querySelectorAll('tbody td')).toHaveLength(2);
    expect(result.querySelector('td').textContent).toBe('A|B');
    expect(result.querySelector('code').textContent).toBe('x|y');
  });
  it('preserves a non-separator second row and allows an empty heading cell', () => {
    const result = dom('| | Result |\n| A | B |\n| C | D |');
    expect(result.querySelectorAll('tbody tr')).toHaveLength(2);
  });
  it('supports nested unordered lists, numbered lists and legacy note checkboxes', () => {
    const result = dom('- one\n  * nested\n1. first\n2. second\n- [ ] unchecked\n- [X] checked');
    expect(result.querySelector('ul')).not.toBeNull();
    expect(result.querySelectorAll('ol li')).toHaveLength(2);
    const checks = result.querySelectorAll('.preview-checkbox-toggle');
    expect(checks).toHaveLength(2);
    expect(checks[0].dataset.lineIndex).toBe('4');
    expect(checks[1].querySelector('svg')).not.toBeNull();
  });
  it.each(['```\n<script>bad()</script>\n```', '```js\n<script>bad()</script>'])('escapes closed and unclosed fenced code', (source) => {
    const result = dom(source);
    expect(result.querySelector('pre code').textContent).toBe('<script>bad()</script>');
    expect(result.querySelector('script')).toBeNull();
  });
  it.each(['', undefined, null])('handles an empty document (%s)', (source) => {
    expect(renderMarkdown(source)).toBe('');
  });
  it('keeps safe external links without leaking the document URL as a referrer', () => {
    const result = dom('[Web](https://example.com?q=1&b=2) [Email](mailto:test@example.com) [Http](http://example.com)');
    const links = result.querySelectorAll('a');
    expect(links).toHaveLength(3);
    expect(links[0].getAttribute('href')).toBe('https://example.com?q=1&b=2');
    expect(links[0].rel).toBe('noopener noreferrer');
    expect(links[0].getAttribute('referrerpolicy')).toBe('no-referrer');
  });
  it.each(['javascript:alert%281%29', 'JaVaScRiPt:alert%281%29', 'data:text/html,bad', '//example.com', 'file:///private', '#anchor'])('blocks unsafe or unsupported link targets %s', (url) => {
    const result = dom(`[label](${url})`);
    expect(result.querySelector('a')).toBeNull();
    expect(result.textContent).toContain('label');
  });
  it('treats raw HTML as text in all table cells and blocks attribute injection', () => {
    const result = dom('| <img src=x onerror=alert(1)> | Heading |\n| --- | --- |\n| <script>alert(1)</script> | [link](https://example.com/" onmouseover="alert(1)) |');
    expect(result.querySelectorAll('img,script,iframe')).toHaveLength(0);
    expect(result.querySelector('th').textContent).toContain('<img');
    expect(result.querySelector('td').textContent).toContain('<script>');
    for (const node of result.querySelectorAll('*')) {
      expect(node.getAttributeNames().some((name) => name.startsWith('on'))).toBe(false);
    }
  });
  it('does not load remote images or interpret SVG/HTML in paragraphs', () => {
    const result = dom('<svg onload=alert(1)><script>alert(1)</script></svg>\n![image](https://example.com/tracker.png)');
    expect(result.querySelector('img,script,svg')).toBeNull();
  });
  it('accepts the maximum report size without mutating the source', () => {
    const source = 'a'.repeat(100000);
    expect(dom(source).textContent).toBe(source);
  });
});
