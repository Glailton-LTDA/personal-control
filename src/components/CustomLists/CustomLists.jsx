import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { 
  List, Plus, Search, Settings, Trash2, Edit2, 
  ChevronRight, Save, X, Loader2, Info, 
  CheckCircle, Circle, Calendar, Hash, Type, AlignLeft,
  MapPin, CheckSquare as CheckboxIcon, Box, ExternalLink,
  Users, Share2, Mail, Lock, ChevronDown, ChevronUp,
  FileText, BookOpen
} from 'lucide-react';
import { motion as Motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../../lib/supabase';
import toast from 'react-hot-toast';
import AddressInput from '../Trips/AddressInput';

const FIELD_TYPES = [
  { id: 'text', icon: Type },
  { id: 'textarea', icon: AlignLeft },
  { id: 'markdown', icon: FileText },
  { id: 'number', icon: Hash },
  { id: 'date', icon: Calendar },
  { id: 'checkbox', icon: CheckCircle },
  { id: 'address', icon: MapPin },
  { id: 'link', icon: ExternalLink },
];

const TEXT_CLAMP_THRESHOLD = 80;
const TEXT_CLAMP_LINES = 3;

function ExpandableText({ text }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const [clamped, setClamped] = useState(false);
  const textRef = useRef(null);

  useEffect(() => {
    const el = textRef.current;
    if (el) {
      setClamped(el.scrollHeight > el.clientHeight + 1);
    }
  }, [text]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
      <div
        ref={textRef}
        style={{
          fontSize: '0.9rem',
          color: 'var(--text-main)',
          fontWeight: 500,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          lineHeight: 1.5,
          ...(expanded ? {} : {
            display: '-webkit-box',
            WebkitLineClamp: TEXT_CLAMP_LINES,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          })
        }}
      >
        {text}
      </div>
      {(clamped || expanded) && (
        <button
          onClick={(e) => { e.stopPropagation(); setExpanded(v => !v); }}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--primary)',
            cursor: 'pointer',
            padding: '0.15rem 0',
            fontSize: '0.75rem',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: '0.3rem',
            alignSelf: 'flex-start'
          }}
        >
          {expanded ? <><ChevronUp size={12} /> {t('lists.ver_menos')}</> : <><ChevronDown size={12} /> {t('lists.ver_mais')}</>}
        </button>
      )}
    </div>
  );
}

function AutoResizeTextarea({ value, onChange, placeholder, className, style }) {
  const textareaRef = useRef(null);

  const adjustHeight = useCallback(() => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = '44px';
      const newHeight = Math.max(el.scrollHeight, 44);
      el.style.height = newHeight + 'px';
    }
  }, []);

  useEffect(() => {
    adjustHeight();
  }, [value, adjustHeight]);

  return (
    <textarea
      ref={textareaRef}
      value={value}
      onChange={(e) => {
        onChange(e);
        adjustHeight();
      }}
      placeholder={placeholder}
      className={className}
      rows={1}
      style={{
        resize: 'none',
        overflow: 'hidden',
        minHeight: '44px',
        lineHeight: 1.5,
        paddingTop: '0.75rem',
        paddingBottom: '0.75rem',
        ...style
      }}
    />
  );
}

function parseTableLines(tableLines) {
  if (tableLines.length < 1) return '';
  const headerCells = tableLines[0].split('|').slice(1, -1).map(c => inlineStyles(c.trim()));
  let dataStart = 1;
  if (tableLines.length > 1 && /^[\s:|]-+[\s:|]-+/.test(tableLines[1])) {
    dataStart = 2;
  }
  let tbl = '<table style="width:100%;border-collapse:collapse;margin:0.5rem 0;border:1px solid var(--glass-border);border-radius:8px;overflow:hidden;">';
  tbl += '<thead><tr>';
  headerCells.forEach(c => {
    tbl += `<th style="border:1px solid var(--glass-border);padding:0.5rem 0.75rem;background:rgba(255,255,255,0.03);font-weight:700;text-align:left;color:var(--text-main);font-size:0.9em;">${c}</th>`;
  });
  tbl += '</tr></thead><tbody>';
  for (let r = dataStart; r < tableLines.length; r++) {
    const cells = tableLines[r].split('|').slice(1, -1).map(c => inlineStyles(c.trim()));
    tbl += '<tr>';
    cells.forEach(c => {
      tbl += `<td style="border:1px solid var(--glass-border);padding:0.4rem 0.75rem;color:var(--text-main);font-size:0.9em;">${c || '&nbsp;'}</td>`;
    });
    tbl += '</tr>';
  }
  tbl += '</tbody></table>';
  return tbl;
}

// Custom Markdown Parser & Editor Components
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
          .replace(/>/g, '&gt;');
        html.push(`<pre style="background: rgba(0,0,0,0.35); padding: 0.75rem; border-radius: 8px; border: 1px solid var(--glass-border); font-family: monospace; font-size: 0.85rem; overflow-x: auto; color: #a5b4fc; margin: 0.5rem 0; line-height: 1.4;"><code>${escapedCode}</code></pre>`);
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
      .replace(/>/g, '&gt;');
    
    const trimmed = line.trim();
    const indent = getIndent(line);
    const listLevel = Math.floor(indent / 2);
    
    if (/^(?:-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      closeListToLevel(0);
      html.push('<hr style="border: none; border-top: 1px solid var(--text-muted); opacity: 0.25; margin: 1rem 0;" />');
      continue;
    }
    
    if (trimmed.startsWith('# ')) {
      closeListToLevel(0);
      html.push(`<h1 style="font-size: 1.5rem; font-weight: 800; margin: 1rem 0 0.5rem; color: var(--text-main); line-height: 1.3;">${inlineStyles(trimmed.substring(2))}</h1>`);
      continue;
    }
    if (trimmed.startsWith('## ')) {
      closeListToLevel(0);
      html.push(`<h2 style="font-size: 1.25rem; font-weight: 800; margin: 0.85rem 0 0.4rem; color: var(--text-main); line-height: 1.3;">${inlineStyles(trimmed.substring(3))}</h2>`);
      continue;
    }
    if (trimmed.startsWith('### ')) {
      closeListToLevel(0);
      html.push(`<h3 style="font-size: 1.1rem; font-weight: 800; margin: 0.75rem 0 0.3rem; color: var(--text-main); line-height: 1.3;">${inlineStyles(trimmed.substring(4))}</h3>`);
      continue;
    }
    
    if (trimmed.startsWith('|')) {
      closeListToLevel(0);
      let tableLines = [trimmed];
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
        <li style="display: flex; align-items: flex-start; gap: 0.5rem; font-size: 0.95rem; line-height: 1.5; color: var(--text-main);">
          <span style="display: inline-flex; align-items: center; justify-content: center; width: 16px; height: 16px; border-radius: 4px; border: 1.5px solid ${checked ? 'var(--success)' : 'var(--text-muted)'}; background: ${checked ? 'var(--success)' : 'transparent'}; margin-top: 3px; flex-shrink: 0;">
            ${checked ? '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>' : ''}
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
      html.push(`<li style="font-size: 0.95rem; line-height: 1.5; color: var(--text-main);">${inlineStyles(orderedMatch[2])}</li>`);
      continue;
    }
    
    const listMatch = trimmed.match(/^[-*]\s+(.*)/);
    if (listMatch) {
      closeListToLevel(listLevel);
      if (listStack.length <= listLevel) {
        html.push('<ul style="list-style-type: disc; padding-left: 1.25rem; margin: 0.5rem 0; display: flex; flex-direction: column; gap: 0.25rem;">');
        listStack.push('ul');
      }
      html.push(`<li style="font-size: 0.95rem; line-height: 1.5; color: var(--text-main);">${inlineStyles(listMatch[1])}</li>`);
      continue;
    }
    
    if (trimmed === '') {
      closeListToLevel(0);
      html.push('<div style="height: 0.5rem;"></div>');
    } else {
      closeListToLevel(0);
      html.push(`<p style="font-size: 0.95rem; line-height: 1.6; margin: 0.5rem 0; color: var(--text-main);">${inlineStyles(trimmed)}</p>`);
    }
  }
  
  closeListToLevel(0);
  if (inCodeBlock) {
    const escapedCode = codeContent.join('\n')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    html.push(`<pre style="background: rgba(0,0,0,0.35); padding: 0.75rem; border-radius: 8px; border: 1px solid var(--glass-border); font-family: monospace; font-size: 0.85rem; overflow-x: auto; color: #a5b4fc; margin: 0.5rem 0; line-height: 1.4;"><code>${escapedCode}</code></pre>`);
  }
  
  return html.join('\n');
}

function inlineStyles(text) {
  // Bold: **text**
  text = text.replace(/\*\*([\s\S]*?)\*\*/g, '<strong style="font-weight: 700; color: var(--text-main);">$1</strong>');
  
  // Italic: *text*
  text = text.replace(/\*([\s\S]*?)\*/g, '<em style="font-style: italic; opacity: 0.9;">$1</em>');
  
  // Inline code: `code`
  text = text.replace(/`([^`]+)`/g, '<code style="background: rgba(255,255,255,0.08); padding: 0.15rem 0.4rem; border-radius: 4px; font-family: monospace; font-size: 0.85rem; color: #f472b6;">$1</code>');
  
  return text;
}

function MarkdownRenderer({ content }) {
  const html = parseMarkdown(content);
  return (
    <div 
      className="markdown-body" 
      style={{ 
        color: 'var(--text-main)', 
        fontSize: '0.95rem', 
        lineHeight: 1.6,
        wordBreak: 'break-word',
      }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function MarkdownEditor({ value, onChange, placeholder }) {
  const { t } = useTranslation();
  const [mode, setMode] = useState('edit');
  const textareaRef = useRef(null);

  const insertHelper = (syntax) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;
    const before = text.substring(0, start);
    const after = text.substring(end, text.length);
    
    const hasSelection = start !== end;
    const selected = hasSelection ? text.substring(start, end) : '';

    let replacement = '';
    let cursorOffset = 0;

    if (syntax === 'bold') {
      replacement = `**${selected}**`;
      cursorOffset = hasSelection ? replacement.length : 2;
    } else if (syntax === 'italic') {
      replacement = `*${selected}*`;
      cursorOffset = hasSelection ? replacement.length : 1;
    } else if (syntax === 'code') {
      replacement = `\`${selected}\``;
      cursorOffset = hasSelection ? replacement.length : 1;
    } else if (syntax === 'codeblock') {
      replacement = `\`\`\`\n${selected}\n\`\`\``;
      cursorOffset = hasSelection ? replacement.length : 4;
    } else if (syntax === 'h1') {
      replacement = `# ${selected}`;
      cursorOffset = hasSelection ? replacement.length : 2;
    } else if (syntax === 'h2') {
      replacement = `## ${selected}`;
      cursorOffset = hasSelection ? replacement.length : 3;
    } else if (syntax === 'list') {
      replacement = `- ${selected}`;
      cursorOffset = hasSelection ? replacement.length : 2;
    } else if (syntax === 'checkbox') {
      replacement = `- [ ] ${selected}`;
      cursorOffset = hasSelection ? replacement.length : 6;
    } else if (syntax === 'ordered-list') {
      replacement = `1. ${selected}`;
      cursorOffset = hasSelection ? replacement.length : 3;
    } else if (syntax === 'table') {
      replacement = `| Coluna 1 | Coluna 2 |\n|----------|----------|\n|  |  |`;
      cursorOffset = 0;
    }

    const newValue = before + replacement + after;
    
    onChange({ target: { value: newValue } });

    setTimeout(() => {
      if (textarea) {
        textarea.focus();
        const newCursorPos = start + cursorOffset;
        textarea.setSelectionRange(newCursorPos, newCursorPos);
      }
    }, 0);
  };

  const toolbarButtonStyle = {
    background: 'rgba(255, 255, 255, 0.05)',
    border: '1px solid var(--glass-border)',
    borderRadius: '6px',
    color: 'var(--text-main)',
    padding: '0.2rem 0.5rem',
    fontSize: '0.75rem',
    cursor: 'pointer',
    minWidth: '24px',
    textAlign: 'center',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '24px',
    fontWeight: '600',
    transition: 'background-color 0.2s'
  };

  return (
    <div style={{ 
      display: 'flex', 
      flexDirection: 'column', 
      gap: '0.75rem', 
      width: '100%',
      background: 'rgba(255, 255, 255, 0.02)',
      border: '1px solid var(--glass-border)',
      borderRadius: '16px',
      overflow: 'hidden',
      boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1)'
    }}>
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        padding: '0.5rem 0.75rem', 
        borderBottom: '1px solid var(--glass-border)',
        background: 'rgba(0, 0, 0, 0.2)',
        flexWrap: 'wrap',
        gap: '0.5rem'
      }}>
        <div style={{ display: 'flex', gap: '0.35rem' }}>
          <button
            type="button"
            onClick={() => setMode('edit')}
            style={{
              padding: '0.4rem 0.85rem',
              borderRadius: '8px',
              border: 'none',
              background: mode === 'edit' ? 'var(--primary)' : 'transparent',
              color: mode === 'edit' ? 'white' : 'var(--text-muted)',
              fontSize: '0.8rem',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              transition: 'all 0.2s'
            }}
          >
            <Edit2 size={12} />
            {t('lists.edit_mode')}
          </button>
          <button
            type="button"
            onClick={() => setMode('preview')}
            style={{
              padding: '0.4rem 0.85rem',
              borderRadius: '8px',
              border: 'none',
              background: mode === 'preview' ? 'var(--primary)' : 'transparent',
              color: mode === 'preview' ? 'white' : 'var(--text-muted)',
              fontSize: '0.8rem',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              transition: 'all 0.2s'
            }}
          >
            <BookOpen size={12} />
            {t('lists.preview_mode')}
          </button>
        </div>
        
        {mode === 'edit' && (
          <div style={{ display: 'flex', gap: '0.25rem', overflowX: 'auto', maxWidth: '100%', paddingBottom: '2px' }}>
            <button
              type="button"
              onClick={() => insertHelper('h1')}
              style={toolbarButtonStyle}
              title={t('lists.notes_view.h1')}
            >
              H1
            </button>
            <button
              type="button"
              onClick={() => insertHelper('h2')}
              style={toolbarButtonStyle}
              title={t('lists.notes_view.h2')}
            >
              H2
            </button>
            <button
              type="button"
              onClick={() => insertHelper('bold')}
              style={{ ...toolbarButtonStyle, fontWeight: 800 }}
              title={t('lists.notes_view.bold')}
            >
              B
            </button>
            <button
              type="button"
              onClick={() => insertHelper('italic')}
              style={{ ...toolbarButtonStyle, fontStyle: 'italic' }}
              title={t('lists.notes_view.italic')}
            >
              I
            </button>
            <button
              type="button"
              onClick={() => insertHelper('list')}
              style={toolbarButtonStyle}
              title={t('lists.notes_view.unordered_list')}
            >
              •
            </button>
            <button
              type="button"
              onClick={() => insertHelper('ordered-list')}
              style={toolbarButtonStyle}
              title={t('lists.notes_view.ordered_list')}
            >
              1.
            </button>
            <button
              type="button"
              onClick={() => insertHelper('table')}
              style={toolbarButtonStyle}
              title={t('lists.notes_view.table_tool')}
            >
              ▤
            </button>
            <button
              type="button"
              onClick={() => insertHelper('checkbox')}
              style={toolbarButtonStyle}
              title={t('lists.notes_view.checklist_tool')}
            >
              [ ]
            </button>
            <button
              type="button"
              onClick={() => insertHelper('code')}
              style={toolbarButtonStyle}
              title={t('lists.notes_view.code_tool')}
            >
              {`</>`}
            </button>
          </div>
        )}
      </div>

      <div style={{ padding: '0.75rem', minHeight: '180px', display: 'flex', flexDirection: 'column', background: 'rgba(0, 0, 0, 0.1)' }}>
        {mode === 'edit' ? (
          <textarea
            ref={textareaRef}
            value={value}
            onChange={onChange}
            placeholder={placeholder || t('lists.markdown_placeholder')}
            style={{
              width: '100%',
              minHeight: '180px',
              background: 'transparent',
              border: 'none',
              outline: 'none',
              resize: 'vertical',
              color: 'var(--text-main)',
              fontSize: '0.95rem',
              lineHeight: 1.6,
              fontFamily: 'inherit',
              padding: '0.25rem'
            }}
          />
        ) : (
          <div 
            style={{ 
              width: '100%',
              minHeight: '180px',
              overflowY: 'auto',
              padding: '0.25rem'
            }}
          >
            {value.trim() ? (
              <MarkdownRenderer content={value} />
            ) : (
              <div style={{ color: 'var(--text-muted)', fontStyle: 'italic', fontSize: '0.95rem' }}>
                {t('lists.empty_preview')}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function CustomLists({ user, refreshKey, mode = 'manager' }) {
  const { t, i18n } = useTranslation();
  const [lists, setLists] = useState([]);
  const [selectedList, setSelectedList] = useState(null);
  const [items, setItems] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalType, setModalType] = useState('list'); // 'list', 'item', 'share'
  const [editingItem, setEditingItem] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [activeShares, setActiveShares] = useState([]);
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);

  const [newList, setNewList] = useState({
    name: '',
    icon: 'List',
    description: '',
    fields: [{ id: Math.random().toString(36).substr(2, 9), name: t('lists.item_default'), type: 'text' }]
  });

  const [editingListId, setEditingListId] = useState(null);

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const fetchLists = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);
    try {
      const { data: ownedData } = await supabase.from('custom_lists').select('*').eq('user_id', user.id).order('created_at', { ascending: false });
      const { data: sharedData } = await supabase
        .from('custom_lists')
        .select('*, custom_list_shares!inner(shared_with_email)')
        .eq('custom_list_shares.shared_with_email', user?.email?.toLowerCase().trim() || '')
        .order('created_at', { ascending: false });

      const allData = [...(ownedData || []), ...(sharedData || [])];
      const filteredData = allData.filter(item => item.description !== '__markdown_notes__');
      const uniqueData = Array.from(new Map(filteredData.map(item => [item.id, item])).values());

      if (uniqueData) {
        setLists(uniqueData);
      }
    } catch (err) {
      console.error('Error fetching lists:', err);
      toast.error(t('finances.error_loading'));
    } finally {
      setIsLoading(false);
    }
  }, [user, t]);

  const fetchShares = useCallback(async () => {
    if (!selectedList || selectedList.user_id !== user.id) {
      setActiveShares([]);
      return;
    }
    const { data } = await supabase.from('custom_list_shares').select('*').eq('list_id', selectedList.id);
    if (data) setActiveShares(data);
  }, [selectedList, user?.id]);

  const fetchItems = useCallback(async (listId) => {
    if (!listId) return;
    try {
      const { data, error } = await supabase
        .from('custom_list_items')
        .select('*')
        .eq('list_id', listId)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      
      if (data) {
        const decrypted = data;
        
        const itemsWithData = decrypted.map(item => ({
          ...item,
          data: JSON.parse(item.content)
        }));
        
        // Smart Sort: Pending first, then by date desc
        const sortedItems = [...itemsWithData].sort((a, b) => {
          if (a.completed === b.completed) return 0;
          return a.completed ? 1 : -1;
        });
        
        setItems(sortedItems);
      }
    } catch (err) {
      console.error('Error fetching items:', err);
      toast.error(t('finances.error_loading'));
    }
  }, [t]);

  useEffect(() => {
    fetchLists();
  }, [fetchLists, refreshKey]);

  // Handle selection sync separately to avoid loops
  useEffect(() => {
    if (lists.length > 0) {
      if (!selectedList) {
        if (mode === 'manager') setSelectedList(lists[0]);
      } else {
        const updated = lists.find(l => l.id === selectedList.id);
        if (updated && updated !== selectedList) {
          setSelectedList(updated);
        } else if (!updated && mode === 'manager') {
          setSelectedList(lists[0]);
        }
      }
    } else {
      setSelectedList(null);
    }
  }, [lists, mode, selectedList]);

  useEffect(() => {
    fetchShares();
  }, [selectedList, fetchShares]);

  useEffect(() => {
    if (selectedList && mode === 'manager') {
      fetchItems(selectedList.id);
    }
  }, [selectedList, fetchItems, mode]);

  const handleSaveList = async () => {
    if (!newList.name) {
      toast.error(t('lists.list_name') + ' ' + t('finances.required_field'));
      return;
    }
    setIsSaving(true);
    try {
      if (editingListId) {
        const { error } = await supabase
          .from('custom_lists')
          .update({
            name: newList.name,
            icon: newList.icon,
            description: newList.description,
            fields: newList.fields
          })
          .eq('id', editingListId);
        if (error) throw error;
        toast.success(t('finances.success_update'));
      } else {
        const { error } = await supabase
          .from('custom_lists')
          .insert([{
            user_id: user.id,
            name: newList.name,
            icon: newList.icon,
            description: newList.description,
            fields: newList.fields
          }]);
        if (error) throw error;
        toast.success(t('finances.success_save'));
      }
      
      setIsModalOpen(false);
      setEditingListId(null);
      setNewList({ name: '', icon: 'List', description: '', fields: [{ id: Math.random().toString(36).substr(2, 9), name: t('lists.item_default'), type: 'text' }] });
      fetchLists();
    } catch (err) {
      console.error('Error saving list:', err);
      toast.error(t('finances.error_save'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteList = async (id) => {
    const list = lists.find(l => l.id === id);
    if (!list) return;

    if (list.user_id === user.id) {
      if (confirm(t('finances.delete_confirm'))) {
        const { error } = await supabase.from('custom_lists').delete().eq('id', id);
        if (!error) {
          toast.success(t('finances.success_delete'));
          if (selectedList?.id === id) setSelectedList(null);
          fetchLists();
        }
      }
    } else {
      if (confirm(t('finances.delete_confirm'))) {
        const { error } = await supabase
          .from('custom_list_shares')
          .delete()
          .eq('list_id', id)
          .eq('shared_with_email', user.email.toLowerCase().trim());
        
        if (!error) {
          toast.success(t('finances.success_delete'));
          if (selectedList?.id === id) setSelectedList(null);
          fetchLists();
        }
      }
    }
  };

  const handleSaveItem = async (itemData) => {
    if (!selectedList) return;
    setIsSaving(true);
    try {
      const encryptedContent = JSON.stringify(itemData);

      if (editingItem) {
        const { error } = await supabase
          .from('custom_list_items')
          .update({ content: encryptedContent })
          .eq('id', editingItem.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('custom_list_items')
          .insert([{
            list_id: selectedList.id,
            user_id: user.id,
            content: encryptedContent
          }]);
        if (error) throw error;
      }

      fetchItems(selectedList.id);
      setIsModalOpen(false);
      setEditingItem(null);
      toast.success(editingItem ? t('finances.success_update') : t('finances.success_save'));
    } catch (err) {
      console.error('Save error:', err);
      toast.error(t('finances.error_save'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteItem = async (id) => {
    if (!confirm(t('finances.delete_confirm'))) return;
    try {
      const { error } = await supabase.from('custom_list_items').delete().eq('id', id);
      if (error) throw error;
      setItems(items.filter(i => i.id !== id));
      toast.success(t('finances.success_delete'));
    } catch (err) {
      console.error('Delete error:', err);
      toast.error(t('finances.error_delete'));
    }
  };

  const toggleItemCompletion = async (item) => {
    try {
      const { error } = await supabase
        .from('custom_list_items')
        .update({ completed: !item.completed })
        .eq('id', item.id);
      if (error) throw error;
      
      const newItems = items.map(i => i.id === item.id ? { ...i, completed: !item.completed } : i);
      
      // Re-sort after toggle
      const sortedItems = [...newItems].sort((a, b) => {
        if (a.completed === b.completed) return 0;
        return a.completed ? 1 : -1;
      });
      
      setItems(sortedItems);
    } catch (err) {
      console.error('Toggle error:', err);
    }
  };

  const addField = () => setNewList({...newList, fields: [...newList.fields, { id: Math.random().toString(36).substr(2, 9), name: '', type: 'text' }]});
  const updateField = (id, key, val) => setNewList({...newList, fields: newList.fields.map(f => f.id === id ? {...f, [key]: val} : f)});
  const removeField = (id) => setNewList({...newList, fields: newList.fields.filter(f => f.id !== id)});

  const isMobile = windowWidth < 1024;

  const renderFieldContent = (field, item) => {
    if (field.type === 'checkbox') {
      return (
        <div style={{ display: 'flex', justifyContent: 'flex-start', alignItems: 'center', gap: '0.5rem' }}>
          {item.data[field.id] ? 
            <div style={{ background: 'var(--success)', borderRadius: '50%', padding: '2px', display: 'flex' }}><CheckCircle size={16} color="white" /></div> : 
            <Circle size={18} style={{ color: 'var(--text-muted)', opacity: 0.3 }} />
          }
          <span style={{ fontSize: '0.85rem', color: item.data[field.id] ? 'var(--success)' : 'var(--text-muted)' }}>
            {item.data[field.id] ? t('common.yes', 'Sim') : t('common.no', 'Não')}
          </span>
        </div>
      );
    }
    if (field.type === 'date') {
      return (
        <div style={{ 
          display: 'inline-flex', 
          alignItems: 'center', 
          gap: '0.4rem', 
          background: 'var(--card-action-bg)', 
          padding: '0.3rem 0.75rem', 
          borderRadius: '8px',
          color: 'var(--primary)',
          fontSize: '0.8rem',
          fontWeight: 800,
          border: '1px solid var(--glass-border)'
        }}>
          <Calendar size={12} strokeWidth={3} />
          {item.data[field.id] ? new Date(item.data[field.id] + 'T00:00:00').toLocaleDateString(i18n.language) : '-'}
        </div>
      );
    }
    if (field.type === 'address' && item.data[field.id]) {
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, fontSize: '0.9rem', color: 'var(--text-main)', fontWeight: 600 }} title={item.data[field.id]}>{item.data[field.id]}</span>
          <button 
            onClick={() => window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(item.data[field.id])}`, '_blank')}
            className="icon-btn" 
            style={{ 
              width: 32, 
              height: 32, 
              color: 'var(--primary)', 
              background: 'var(--card-action-bg)', 
              border: '1px solid var(--glass-border)', 
              borderRadius: '10px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.05)'
            }}
          >
            <MapPin size={14} strokeWidth={2.5} />
          </button>
        </div>
      );
    }
    if (field.type === 'link' && item.data[field.id]) {
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <a 
            href={item.data[field.id].startsWith('http') ? item.data[field.id] : `https://${item.data[field.id]}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{ 
              overflow: 'hidden', 
              textOverflow: 'ellipsis', 
              whiteSpace: 'nowrap', 
              flex: 1, 
              color: 'var(--primary)', 
              textDecoration: 'none',
              fontWeight: 800,
              borderBottom: '2px solid rgba(99, 102, 241, 0.2)',
              paddingBottom: '1px'
            }} 
            title={item.data[field.id]}
          >
            {item.data[field.id]}
          </a>
          <ExternalLink size={12} style={{ color: 'var(--primary)', flexShrink: 0 }} />
        </div>
      );
    }
    if (field.type === 'markdown') {
      const markdownValue = item.data[field.id] || '';
      if (!markdownValue) return <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem', fontStyle: 'italic' }}>-</span>;
      return (
        <div style={{
          background: 'rgba(255, 255, 255, 0.01)',
          border: '1px solid var(--glass-border)',
          borderRadius: '12px',
          padding: '0.75rem 1rem',
          marginTop: '0.25rem',
          maxHeight: '250px',
          overflowY: 'auto',
          boxShadow: 'inset 0 2px 4px rgba(0, 0, 0, 0.05)'
        }}>
          <MarkdownRenderer content={markdownValue} />
        </div>
      );
    }
    if (field.type === 'textarea') {
      const textareaValue = item.data[field.id] || '-';
      return <ExpandableText text={textareaValue} />;
    }
    const textValue = item.data[field.id] || '-';
    if (textValue.length > TEXT_CLAMP_THRESHOLD || textValue.includes('\n')) {
      return <ExpandableText text={textValue} />;
    }
    return <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600, color: 'var(--text-main)' }} title={textValue}>{textValue}</div>;
  };

  if (mode === 'settings') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem', maxWidth: '900px', margin: '0 auto', width: '100%' }}>
        <div className="glass-card" style={{ padding: '2.5rem', background: 'var(--bg-card)', position: 'relative', overflow: 'hidden' }}>
          {/* Accent Glow */}
          <div style={{ position: 'absolute', top: -50, right: -50, width: 200, height: 200, background: 'var(--primary)', opacity: 0.1, filter: 'blur(80px)', pointerEvents: 'none' }} />
          
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: isMobile ? 'flex-start' : 'center', 
            marginBottom: '3rem', 
            position: 'relative', 
            zIndex: 1,
            flexDirection: isMobile ? 'column' : 'row',
            gap: '1.5rem'
          }}>
            <div style={{ flex: '1 1 auto', minWidth: '200px' }}>
              <h2 style={{ 
                margin: 0, 
                fontSize: isMobile ? '1.5rem' : '2rem', 
                fontWeight: 900, 
                color: 'var(--text-main)', 
                letterSpacing: '-0.03em' 
              }}>
                {t('lists.settings_title')}
              </h2>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem', fontWeight: 500 }}>{t('lists.settings_desc')}</p>
            </div>
            <button 
              onClick={() => { setEditingListId(null); setNewList({ name: '', icon: 'List', description: '', fields: [{ id: Math.random().toString(36).substr(2, 9), name: t('lists.item_default'), type: 'text' }] }); setModalType('list'); setIsModalOpen(true); }} 
              className="btn-primary" 
              style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: '0.75rem', 
                padding: isMobile ? '1rem 1.5rem' : '0.8rem 1.5rem', 
                borderRadius: '16px', 
                boxShadow: '0 8px 20px rgba(99, 102, 241, 0.3)',
                fontSize: isMobile ? '0.95rem' : '1rem',
                width: isMobile ? '100%' : 'auto',
                justifyContent: 'center'
              }}
              data-testid="btn-add-collection-settings"
            >
              <Plus size={isMobile ? 22 : 20} strokeWidth={3} /> <span style={{ fontWeight: 800 }}>{t('lists.new_list')}</span>
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {isLoading && lists.length === 0 ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '5rem' }}><Loader2 className="animate-spin" size={40} style={{ color: 'var(--primary)' }} /></div>
            ) : lists.length === 0 ? (
              <div style={{ padding: '5rem', textAlign: 'center', background: 'rgba(255,255,255,0.02)', borderRadius: '24px', border: '1px dashed var(--glass-border)' }}>
                <Box size={60} style={{ margin: '0 auto 1.5rem', opacity: 0.2 }} />
                <p style={{ fontWeight: 600, color: 'var(--text-muted)' }}>{t('lists.no_lists')}</p>
              </div>
            ) : lists.map(list => (
              <Motion.div 
                whileHover={{ x: 5 }}
                key={list.id} 
                className="glass-card" 
                style={{ 
                  padding: '1.5rem', 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  alignItems: 'center', 
                  background: 'rgba(255,255,255,0.03)', 
                  border: '1px solid var(--glass-border)', 
                  borderRadius: '20px',
                  flexWrap: 'wrap', 
                  gap: '1.5rem' 
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
                  <div style={{ 
                    width: 52, 
                    height: 52, 
                    borderRadius: '16px', 
                    background: 'linear-gradient(135deg, var(--primary), #818cf8)', 
                    color: 'white', 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center',
                    boxShadow: '0 8px 15px rgba(99, 102, 241, 0.2)'
                  }}>
                    <List size={26} strokeWidth={2.5} />
                  </div>
                  <div>
                    <h4 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-main)' }}>{list.name}</h4>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.2rem' }}>
                      <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--primary)', background: 'rgba(99, 102, 241, 0.1)', padding: '0.1rem 0.6rem', borderRadius: '6px' }}>{t('lists.fields_count', { count: list.fields?.length || 0 })}</span>
                      <span style={{ fontSize: '0.8rem', fontWeight: 500, color: 'var(--text-muted)' }}>{list.user_id === user.id ? t('lists.owner') : t('lists.shared')}</span>
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '0.75rem' }}>
                  {list.user_id === user.id && (
                    <button 
                      onClick={() => { 
                        setEditingListId(list.id); 
                        setNewList({ name: list.name, description: list.description || '', fields: list.fields || [], icon: list.icon || 'List' }); 
                        setModalType('list'); 
                        setIsModalOpen(true); 
                      }} 
                      className="icon-btn" 
                      style={{ background: 'rgba(255,255,255,0.05)', width: 44, height: 44 }}
                      title={t('lists.edit_structure')}
                    >
                      <Edit2 size={18} />
                    </button>
                  )}
                  <button onClick={() => handleDeleteList(list.id)} className="icon-btn" style={{ background: 'rgba(239, 68, 68, 0.1)', color: 'var(--danger)', width: 44, height: 44 }} title={t('lists.delete_collection')}>
                    <Trash2 size={18} />
                  </button>
                </div>
              </Motion.div>
            ))}
          </div>
        </div>
        <AnimatePresence>
          {isModalOpen && (
            <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
              <Motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsModalOpen(false)} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(4px)' }} />
              <Motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="glass-card" style={{ position: 'relative', width: '100%', maxWidth: '550px', maxHeight: '90vh', overflowY: 'auto', padding: isMobile ? '1.5rem' : '2.5rem' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3 style={{ margin: 0, color: 'var(--text-main)' }}>{editingListId ? t('lists.edit_list') : t('lists.new_list')}</h3>
                    <button onClick={() => setIsModalOpen(false)} className="icon-btn"><X size={20} /></button>
                  </div>
                  <div className="glass-input-container">
                    <label style={{ color: 'var(--text-muted)' }}>{t('lists.list_name')}</label>
                    <input data-testid="input-list-name" className="glass-input" value={newList.name} onChange={e => setNewList({...newList, name: e.target.value})} placeholder={t('lists.name_placeholder')} />
                  </div>
                  <div className="glass-input-container">
                    <label style={{ color: 'var(--text-muted)' }}>{t('lists.description_label')}</label>
                    <textarea className="glass-input" value={newList.description} onChange={e => setNewList({...newList, description: e.target.value})} placeholder={t('lists.optional_placeholder')} rows={2} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)' }}>{t('lists.table_fields')}</label>
                    <button onClick={addField} style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', fontWeight: 700, fontSize: '0.75rem' }}>{t('lists.add_field')}</button>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {newList.fields.map((f) => (
                      <div key={f.id} style={{ display: 'grid', gridTemplateColumns: '1fr 120px 40px', gap: '0.5rem' }}>
                        <input className="glass-input" value={f.name} onChange={e => updateField(f.id, 'name', e.target.value)} placeholder={t('lists.field_name_placeholder')} />
                        <select className="glass-input" value={f.type} onChange={e => updateField(f.id, 'type', e.target.value)}>
                          {FIELD_TYPES.map(type => <option key={type.id} value={type.id}>{t(`lists.field_types.${type.id}`)}</option>)}
                        </select>
                        <button onClick={() => removeField(f.id)} className="icon-btn" style={{ color: 'var(--danger)' }} disabled={newList.fields.length === 1}><Trash2 size={16} /></button>
                      </div>
                    ))}
                  </div>
                  <button data-testid="btn-save-collection" onClick={handleSaveList} disabled={isSaving} className="btn-primary" style={{ padding: '1rem', marginTop: '1rem' }}>
                    {isSaving ? <Loader2 className="spin" size={18} /> : (editingListId ? t('lists.save_changes') : t('lists.create_list'))}
                  </button>
                </div>
              </Motion.div>
            </div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', maxWidth: '1200px', margin: '0 auto', width: '100%' }}>
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '320px 1fr', gap: '1.5rem', alignItems: 'start' }}>
        
        {!isMobile && (
          <aside className="glass-card" style={{ 
            padding: '1.5rem', 
            display: 'flex', 
            flexDirection: 'column', 
            gap: '1.25rem', 
            height: 'fit-content', 
            position: 'sticky', 
            top: '1.5rem',
            background: 'var(--bg-card)',
            border: '1px solid var(--glass-border)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '0.5rem' }}>
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 900, color: 'var(--text-main)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t('lists.collections')}</h3>
              <button 
                onClick={() => { setEditingListId(null); setNewList({ name: '', icon: 'List', description: '', fields: [{ id: Math.random().toString(36).substr(2, 9), name: t('lists.item_default'), type: 'text' }] }); setModalType('list'); setIsModalOpen(true); }} 
                style={{ 
                  width: 36, 
                  height: 36, 
                  background: 'var(--primary)', 
                  color: 'white', 
                  border: 'none',
                  borderRadius: '10px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  boxShadow: '0 4px 12px rgba(99, 102, 241, 0.2)',
                  flexShrink: 0
                }}
                data-testid="btn-add-collection"
              >
                <Plus size={18} strokeWidth={3} />
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxHeight: 'calc(100vh - 250px)', overflowY: 'auto', paddingRight: '4px' }}>
              {isLoading && lists.length === 0 ? (
                <div style={{ padding: '2rem', textAlign: 'center' }}><Loader2 className="animate-spin" size={24} style={{ color: 'var(--primary)', margin: '0 auto' }} /></div>
              ) : lists.map(list => {
                const isActive = selectedList?.id === list.id;
                return (
                  <div key={list.id} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <Motion.button 
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => setSelectedList(list)} 
                      style={{ 
                        display: 'flex', alignItems: 'center', gap: '0.85rem', padding: '1rem', 
                        borderRadius: '16px', 
                        background: isActive ? 'linear-gradient(135deg, rgba(99, 102, 241, 0.15), rgba(99, 102, 241, 0.05))' : 'rgba(255,255,255,0.02)', 
                        border: '1px solid', 
                        borderColor: isActive ? 'var(--primary)' : 'var(--glass-border)', 
                        boxShadow: isActive ? '0 8px 20px rgba(99, 102, 241, 0.15)' : 'none',
                        cursor: 'pointer', textAlign: 'left', transition: 'all 0.2s', flex: 1, overflow: 'hidden'
                      }}
                    >
                      <div style={{ 
                        width: 40, height: 40, borderRadius: '12px', 
                        background: isActive ? 'var(--primary)' : 'rgba(99, 102, 241, 0.1)', 
                        color: isActive ? 'white' : 'var(--primary)', 
                        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                        transition: 'all 0.2s'
                      }}>
                        <List size={20} strokeWidth={2.5} />
                      </div>
                      <div style={{ flex: 1, overflow: 'hidden' }}>
                        <div style={{ fontWeight: 800, fontSize: '0.95rem', color: isActive ? 'var(--text-main)' : 'var(--text-muted)', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>{list.name}</div>
                        <div style={{ fontSize: '0.75rem', fontWeight: 600, opacity: 0.6, color: isActive ? 'var(--primary)' : 'var(--text-muted)' }}>{t('lists.fields_count', { count: list.fields?.length || 0 })}</div>
                      </div>
                    </Motion.button>
                    <button 
                      onClick={() => { setSelectedList(list); setModalType('share'); setIsModalOpen(true); }}
                      className="icon-btn" style={{ width: 32, height: 32, opacity: isActive ? 1 : 0.4 }} title={t('lists.share')}
                      data-testid="btn-share-collection"
                    >
                      <Users size={16} />
                    </button>
                  </div>
                );
              })}
            </div>
          </aside>
        )}

        <main style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', minWidth: 0 }}>
          {isMobile && (
            <div className="glass-card" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{t('lists.select_collection')}</label>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <select 
                  className="glass-input" 
                  style={{ flex: 1 }}
                  value={selectedList?.id || ''} 
                  onChange={(e) => setSelectedList(lists.find(l => l.id === e.target.value))}
                >
                  <option value="" disabled>{t('lists.select_list')}</option>
                  {lists.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
                <button 
                  onClick={() => { setEditingListId(null); setModalType('list'); setIsModalOpen(true); }} 
                  className="icon-btn"
                  style={{ background: 'var(--primary)', color: 'white', border: 'none' }}
                >
                  <Plus size={20} />
                </button>
              </div>
            </div>
          )}

          {selectedList ? (
            <>
              <div className="glass-card" style={{ padding: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                <div style={{ flex: 1, minWidth: '200px' }}>
                  <h2 style={{ margin: 0, fontSize: '1.25rem', color: 'var(--text-main)' }}>{selectedList.name}</h2>
                  <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>{selectedList.description || t('lists.dynamic_list')}</p>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  {selectedList.user_id === user.id && (
                    <button 
                      onClick={() => { setModalType('share'); setIsModalOpen(true); }} 
                      className="icon-btn" 
                      title={t('lists.share')}
                      data-testid="btn-share-collection"
                    >
                      <Users size={20} />
                    </button>
                  )}
                  <button onClick={() => { setModalType('item'); setEditingItem(null); setIsModalOpen(true); }} className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', height: '44px' }}><Plus size={18} /> {t('lists.new_item')}</button>
                </div>
              </div>

              <div className="responsive-grid" style={{ 
                display: 'grid', 
                gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', 
                gap: '1.25rem' 
              }}>
                {items.length > 0 ? items.map(item => (
                  <Motion.div 
                    layout
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    key={item.id} 
                    className="glass-card" 
                    style={{ 
                      padding: '1.5rem', 
                      display: 'flex', 
                      flexDirection: 'column', 
                      gap: '1.25rem', 
                      border: item.completed ? '1px solid var(--success)' : '1px solid var(--glass-border)', 
                      background: item.completed ? 'rgba(34, 197, 94, 0.05)' : 'var(--bg-card)',
                      opacity: item.completed ? 0.8 : 1, 
                      transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                      position: 'relative',
                      overflow: 'hidden'
                    }}
                  >
                    {/* Status Glow for Pending */}
                    {!item.completed && (
                      <div style={{ 
                        position: 'absolute', 
                        top: 0, 
                        left: 0, 
                        width: '4px', 
                        height: '100%', 
                        background: 'var(--primary)',
                        boxShadow: '0 0 15px var(--primary)'
                      }} />
                    )}

                    {/* Card Header */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <button 
                        onClick={() => toggleItemCompletion(item)} 
                        style={{ 
                          background: 'none', 
                          border: 'none', 
                          cursor: 'pointer', 
                          color: item.completed ? 'var(--success)' : 'var(--text-muted)', 
                          display: 'flex', 
                          alignItems: 'center', 
                          gap: '0.75rem', 
                          padding: 0 
                        }}
                      >
                        <div style={{ 
                          width: 24, 
                          height: 24, 
                          borderRadius: '50%', 
                          border: `2px solid ${item.completed ? 'var(--success)' : 'var(--text-muted)'}`,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          background: item.completed ? 'var(--success)' : 'transparent',
                          transition: 'all 0.2s'
                        }}>
                          {item.completed && <CheckCircle size={16} color="white" />}
                        </div>
                        <span style={{ 
                          fontWeight: 900, 
                          color: item.completed ? 'var(--success)' : 'var(--text-main)', 
                          fontSize: '0.85rem',
                          textTransform: 'uppercase',
                          letterSpacing: '0.05em'
                        }}>
                          {item.completed ? t('common.completed', 'Concluído') : t('common.pending', 'Pendente')}
                        </span>
                      </button>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button onClick={() => { setModalType('item'); setEditingItem(item); setIsModalOpen(true); }} className="icon-btn" style={{ width: 32, height: 32 }}><Edit2 size={14} /></button>
                        <button onClick={() => handleDeleteItem(item.id)} className="icon-btn" style={{ width: 32, height: 32, color: 'var(--danger)' }}><Trash2 size={14} /></button>
                      </div>
                    </div>
                    
                    {/* Card Body - Fields */}
                    <div style={{ 
                      display: 'flex', 
                      flexDirection: 'column', 
                      gap: '1rem',
                      padding: '1.25rem',
                      background: 'rgba(255,255,255,0.03)',
                      borderRadius: '16px',
                      border: '1px solid rgba(255,255,255,0.05)'
                    }}>
                      {selectedList.fields?.map((field, idx) => {
                        const isTitle = idx === 0;
                        return (
                          <div key={field.id} style={{ 
                            display: 'flex', 
                            flexDirection: 'column', 
                            gap: '0.4rem', 
                            minWidth: 0,
                            borderBottom: idx < selectedList.fields.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none',
                            paddingBottom: idx < selectedList.fields.length - 1 ? '0.75rem' : 0
                          }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                               {FIELD_TYPES.find(t => t.id === field.type)?.icon && React.createElement(FIELD_TYPES.find(t => t.id === field.type).icon, { size: 12, style: { opacity: 0.4 } })}
                               <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 800, letterSpacing: '0.06em' }}>{field.name}</span>
                            </div>
                            <div style={{ 
                              fontSize: isTitle ? '1.1rem' : '0.95rem', 
                              color: 'var(--text-main)', 
                              fontWeight: isTitle ? 900 : 600,
                              lineHeight: 1.4
                            }}>
                              {renderFieldContent(field, item)}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </Motion.div>
                )) : (
                  <div className="glass-card" style={{ padding: '4rem', textAlign: 'center', opacity: 0.3, gridColumn: '1 / -1' }}>
                    <Box size={48} style={{ margin: '0 auto 1rem' }} />
                    <p style={{ color: 'var(--text-main)', fontSize: '1.1rem' }}>{t('lists.no_items', 'Nenhum item nesta lista ainda')}</p>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="glass-card" style={{ height: '400px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', opacity: 0.5 }}>
              <List size={48} style={{ marginBottom: '1rem', color: 'var(--text-main)' }} />
              <h3 style={{ color: 'var(--text-main)' }}>{t('lists.select_collection')}</h3>
            </div>
          )}
        </main>
      </div>

      <AnimatePresence>
        {isModalOpen && (
          <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
            <Motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsModalOpen(false)} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(4px)' }} />
            <Motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="glass-card" style={{ position: 'relative', width: '100%', maxWidth: '550px', maxHeight: isMobile ? '85vh' : '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: 0 }}>
              {modalType === 'list' ? (
                <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
                  <div style={{ flex: 1, overflowY: 'auto', padding: isMobile ? '1.5rem' : '2.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3 style={{ margin: 0, color: 'var(--text-main)' }}>{editingListId ? t('lists.edit_list') : t('lists.new_list')}</h3>
                    <button onClick={() => setIsModalOpen(false)} className="icon-btn"><X size={20} /></button>
                  </div>
                  <div className="glass-input-container">
                    <label style={{ color: 'var(--text-muted)' }}>{t('lists.list_name')}</label>
                    <input className="glass-input" value={newList.name} onChange={e => setNewList({...newList, name: e.target.value})} placeholder={t('lists.name_placeholder')} data-testid="input-list-name" />
                  </div>
                  <div className="glass-input-container">
                    <label style={{ color: 'var(--text-muted)' }}>{t('lists.description_label')}</label>
                    <textarea className="glass-input" value={newList.description} onChange={e => setNewList({...newList, description: e.target.value})} placeholder={t('lists.description_placeholder')} rows={2} data-testid="input-list-description" />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)' }}>{t('lists.table_fields')}</label>
                    <button onClick={addField} style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', fontWeight: 700, fontSize: '0.75rem' }}>{t('lists.add_field')}</button>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {newList.fields.map((f) => (
                      <div key={f.id} style={{ display: 'grid', gridTemplateColumns: '1fr 120px 40px', gap: '0.5rem' }}>
                        <input className="glass-input" value={f.name} onChange={e => updateField(f.id, 'name', e.target.value)} placeholder={t('lists.field_name_placeholder')} />
                        <select className="glass-input" value={f.type} onChange={e => updateField(f.id, 'type', e.target.value)}>
                          {FIELD_TYPES.map(type => <option key={type.id} value={type.id}>{t(`lists.field_types.${type.id}`)}</option>)}
                        </select>
                        <button onClick={() => removeField(f.id)} className="icon-btn" style={{ color: 'var(--danger)' }} disabled={newList.fields.length === 1}><Trash2 size={16} /></button>
                      </div>
                    ))}
                  </div>
                  </div>
                  <div style={{ padding: isMobile ? '1.25rem 1.5rem' : '1.5rem 2.5rem', background: 'var(--bg-card)', borderTop: '1px solid var(--glass-border)' }}>
                    <button onClick={handleSaveList} disabled={isSaving} className="btn-primary" style={{ width: '100%', padding: '1rem' }}>
                      {isSaving ? <Loader2 className="spin" size={18} /> : (editingListId ? t('lists.save_changes') : t('lists.create_list'))}
                    </button>
                  </div>
                </div>
              ) : modalType === 'share' ? (
                <div style={{ padding: isMobile ? '1.5rem' : '2.5rem', overflowY: 'auto' }}>
                  <ShareListModal 
                    user={user}
                    list={selectedList}
                    activeShares={activeShares}
                    onClose={() => setIsModalOpen(false)}
                    onRefresh={fetchShares}
                  />
                </div>
              ) : (
                <ItemForm 
                  selectedList={selectedList} 
                  editingItem={editingItem} 
                  onSave={handleSaveItem} 
                  onCancel={() => setIsModalOpen(false)}
                  isSaving={isSaving}
                  isMobile={isMobile}
                />
              )}
            </Motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ShareListModal({ user, list, activeShares, onClose, onRefresh }) {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [permission, setPermission] = useState('WRITE');
  const [isLoading, setIsLoading] = useState(false);

  const handleShare = async (e) => {
    e.preventDefault();
    if (!email) return;
    setIsLoading(true);

    try {

      const { error } = await supabase.from('custom_list_shares').insert([{
        list_id: list.id,
        shared_by: user.id,
        shared_by_email: user.email?.toLowerCase().trim() || null,
        shared_with_email: email.toLowerCase().trim(),
        permission
      }]);

      if (error) throw error;

      toast.success(t('lists.share_success'));
      setEmail('');
      onRefresh();
    } catch (error) {
      toast.error(t('lists.share_error', { error: error.message }));
    } finally {
      setIsLoading(false);
    }
  };

  const handleRevoke = async (shareId) => {
    if (!confirm(t('lists.confirm_revoke_share'))) return;
    const { error } = await supabase.from('custom_list_shares').delete().eq('id', shareId);
    if (!error) {
      toast.success(t('lists.share_revoked'));
      onRefresh();
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ margin: 0, color: 'var(--text-main)' }} data-testid="modal-title">{t('lists.share_title', 'Compartilhar Lista')}</h3>
        <button onClick={onClose} className="icon-btn"><X size={20} /></button>
      </div>
      <form onSubmit={handleShare} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div className="glass-input-container">
          <label style={{ color: 'var(--text-muted)' }}>{t('lists.email_label')}</label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} className="glass-input" required placeholder={t('lists.email_placeholder')} />
        </div>
        <div className="glass-input-container">
          <label style={{ color: 'var(--text-muted)' }}>{t('lists.permission_label')}</label>
          <select value={permission} onChange={e => setPermission(e.target.value)} className="glass-input">
            <option value="READ">{t('lists.read_only')}</option>
            <option value="WRITE">{t('lists.read_write')}</option>
          </select>
        </div>
        <button type="submit" disabled={isLoading} className="btn-primary" style={{ padding: '0.75rem' }}>
          {isLoading ? <Loader2 className="spin" size={18} /> : t('lists.share', 'Compartilhar')}
        </button>
      </form>
      {activeShares.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <label style={{ fontSize: '0.8rem', fontWeight: 600, opacity: 0.5, color: 'var(--text-main)' }}>{t('lists.active_shares')}</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '200px', overflowY: 'auto' }}>
            {activeShares.map(s => (
              <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.03)', padding: '0.75rem', borderRadius: '8px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-main)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.shared_with_email}</span>
                  <span style={{ fontSize: '0.7rem', color: 'var(--primary)' }}>{s.permission === 'WRITE' ? t('lists.editor', 'EDITOR') : t('lists.reader', 'LEITOR')}</span>
                </div>
                <button onClick={() => handleRevoke(s.id)} className="icon-btn" style={{ color: 'var(--danger)', flexShrink: 0 }}><Trash2 size={14} /></button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ItemForm({ selectedList, editingItem, onSave, onCancel, isSaving, isMobile }) {
  const { t } = useTranslation();
  const [formData, setFormData] = useState(() => {
    if (editingItem) return editingItem.data;
    const initial = {};
    selectedList.fields.forEach(f => {
      initial[f.id] = f.type === 'checkbox' ? false : '';
    });
    return initial;
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ flex: 1, overflowY: 'auto', padding: isMobile ? '1.5rem' : '2.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ margin: 0, color: 'var(--text-main)' }}>{t(editingItem ? 'lists.edit_item' : 'lists.new_item')}</h3>
        <button onClick={onCancel} className="icon-btn"><X size={20} /></button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {selectedList.fields.map(field => (
          <div key={field.id} className="glass-input-container">
            <label style={{ color: 'var(--text-muted)' }}>{field.name}</label>
            {field.type === 'checkbox' ? (
              <button 
                onClick={() => setFormData({...formData, [field.id]: !formData[field.id]})}
                style={{ 
                  display: 'flex', alignItems: 'center', gap: '1rem', width: '100%', 
                  padding: '0.85rem', borderRadius: '12px', background: 'rgba(255,255,255,0.05)', 
                  border: '1px solid var(--glass-border)', cursor: 'pointer', color: 'var(--text-main)'
                }}
              >
                {formData[field.id] ? <CheckCircle className="text-primary" /> : <Circle />}
                <span style={{ fontWeight: 600 }}>{field.name}</span>
              </button>
            ) : field.type === 'address' ? (
              <AddressInput 
                value={formData[field.id] || ''}
                onChange={(val) => setFormData({...formData, [field.id]: val})}
                placeholder={t('lists.address_placeholder')}
              />
            ) : field.type === 'date' ? (
              <input 
                type="date" value={formData[field.id] || ''} 
                onChange={e => setFormData({...formData, [field.id]: e.target.value})}
                className="glass-input"
              />
            ) : field.type === 'number' ? (
              <input 
                type="number" value={formData[field.id] || ''} 
                onChange={e => setFormData({...formData, [field.id]: e.target.value})}
                className="glass-input" placeholder={t('lists.number_placeholder')}
              />
            ) : field.type === 'link' ? (
              <input 
                type="url" value={formData[field.id] || ''} 
                onChange={e => setFormData({...formData, [field.id]: e.target.value})}
                className="glass-input" placeholder={t('lists.url_placeholder')}
              />
            ) : field.type === 'markdown' ? (
              <MarkdownEditor 
                value={formData[field.id] || ''} 
                onChange={e => setFormData({...formData, [field.id]: e.target.value})}
                placeholder={t('lists.markdown_placeholder_item')}
              />
            ) : field.type === 'textarea' ? (
              <textarea 
                value={formData[field.id] || ''} 
                onChange={e => setFormData({...formData, [field.id]: e.target.value})}
                className="glass-input" 
                placeholder={t('lists.text_placeholder')}
                rows={3}
                style={{ resize: 'vertical', minHeight: '80px', lineHeight: 1.6 }}
              />
            ) : (
              <AutoResizeTextarea 
                value={formData[field.id] || ''} 
                onChange={e => setFormData({...formData, [field.id]: e.target.value})}
                className="glass-input" placeholder={t('lists.default_placeholder')}
              />
            )}
          </div>
        ))}
      </div>
      </div>
      <div style={{ 
        display: 'flex', 
        gap: '1rem', 
        padding: isMobile ? '1.25rem 1.5rem' : '1.5rem 2.5rem',
        background: 'var(--bg-card)',
        backdropFilter: 'blur(10px)',
        borderTop: '1px solid var(--glass-border)',
        marginTop: 'auto',
        flexShrink: 0
      }}>
        {!isMobile && <button onClick={onCancel} className="btn-secondary" style={{ flex: 1 }}>{t('lists.cancel_item')}</button>}
        <button onClick={() => onSave(formData)} disabled={isSaving} className="btn-primary" style={{ flex: 1, padding: '1rem' }}>
          {isSaving ? <Loader2 size={18} className="animate-spin" /> : t('lists.save_item')}
        </button>
      </div>
    </div>
  );
}
