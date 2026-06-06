import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { 
  Plus, Search, Trash2, Edit2, BookOpen, 
  Loader2, Save, Check, FileText, X, ChevronLeft, Users
} from 'lucide-react';
import { motion as Motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../../lib/supabase';
import toast from 'react-hot-toast';

// Re-use Markdown parsing logic with horizontal rule support
function parseMarkdown(md) {
  if (!md) return '';
  
  const lines = md.split('\n');
  let html = [];
  let inCodeBlock = false;
  let codeContent = [];
  let inList = false;
  
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    
    // Code block toggle
    if (line.trim().startsWith('```')) {
      if (inCodeBlock) {
        inCodeBlock = false;
        const escapedCode = codeContent.join('\n')
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;');
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
    
    // Escape HTML to prevent XSS
    line = line
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
      
    // Horizontal Rule: 3 or more dashes, asterisks, or underscores
    if (/^(?:-{3,}|\*{3,}|_{3,})$/.test(line.trim())) {
      if (inList) { html.push('</ul>'); inList = false; }
      html.push('<hr style="border: none; border-top: 1px solid var(--text-muted); opacity: 0.25; margin: 1.5rem 0;" />');
      continue;
    }

    // Headers
    if (line.startsWith('# ')) {
      if (inList) { html.push('</ul>'); inList = false; }
      html.push(`<h1 style="font-size: 1.5em; font-weight: 800; margin: 1rem 0 0.5rem; color: var(--text-main); line-height: 1.3;">${inlineStyles(line.substring(2))}</h1>`);
      continue;
    }
    if (line.startsWith('## ')) {
      if (inList) { html.push('</ul>'); inList = false; }
      html.push(`<h2 style="font-size: 1.25em; font-weight: 800; margin: 0.85rem 0 0.4rem; color: var(--text-main); line-height: 1.3;">${inlineStyles(line.substring(3))}</h2>`);
      continue;
    }
    if (line.startsWith('### ')) {
      if (inList) { html.push('</ul>'); inList = false; }
      html.push(`<h3 style="font-size: 1.1em; font-weight: 800; margin: 0.75rem 0 0.3rem; color: var(--text-main); line-height: 1.3;">${inlineStyles(line.substring(4))}</h3>`);
      continue;
    }
    
    // Checkboxes: - [ ] or - [x]
    const checkboxMatch = line.match(/^-\s+\[([ xX])\]\s+(.*)/);
    if (checkboxMatch) {
      if (!inList) {
        html.push('<ul style="list-style: none; padding-left: 0; margin: 0.5rem 0; display: flex; flex-direction: column; gap: 0.4rem;">');
        inList = true;
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
    
    // Unordered List item: - item or * item
    const listMatch = line.match(/^[-*]\s+(.*)/);
    if (listMatch) {
      if (!inList) {
        html.push('<ul style="list-style-type: disc; padding-left: 1.25rem; margin: 0.5rem 0; display: flex; flex-direction: column; gap: 0.25rem;">');
        inList = true;
      }
      html.push(`<li style="font-size: 0.95em; line-height: 1.5; color: var(--text-main);">${inlineStyles(listMatch[1])}</li>`);
      continue;
    }
    
    // If we are in a list and the line is empty/plain, close list
    if (inList && line.trim() === '') {
      html.push('</ul>');
      inList = false;
      continue;
    }
    
    // Normal paragraph or empty line
    if (line.trim() === '') {
      if (inList) { html.push('</ul>'); inList = false; }
      html.push('<div style="height: 0.5rem;"></div>');
    } else {
      if (inList) { html.push('</ul>'); inList = false; }
      html.push(`<p style="font-size: 0.95em; line-height: 1.6; margin: 0.5rem 0; color: var(--text-main);">${inlineStyles(line)}</p>`);
    }
  }
  
  if (inList) {
    html.push('</ul>');
  }
  if (inCodeBlock) {
    const escapedCode = codeContent.join('\n')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    html.push(`<pre style="background: rgba(0,0,0,0.35); padding: 0.75rem; border-radius: 8px; border: 1px solid var(--glass-border); font-family: monospace; font-size: 0.85em; overflow-x: auto; color: #a5b4fc; margin: 0.5rem 0; line-height: 1.4;"><code>${escapedCode}</code></pre>`);
  }
  
  return html.join('\n');
}

function inlineStyles(text) {
  text = text.replace(/\*\*([\s\S]*?)\*\*/g, '<strong style="font-weight: 700; color: var(--text-main);">$1</strong>');
  text = text.replace(/\*([\s\S]*?)\*/g, '<em style="font-style: italic; opacity: 0.9;">$1</em>');
  text = text.replace(/`([^`]+)`/g, '<code style="background: rgba(255,255,255,0.08); padding: 0.15rem 0.4rem; border-radius: 4px; font-family: monospace; font-size: 0.85em; color: #f472b6;">$1</code>');
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" style="color: var(--primary); text-decoration: underline; font-weight: 600;">$1</a>');
  return text;
}

function MarkdownRenderer({ content, onToggleCheckbox, fontSize }) {
  const html = parseMarkdown(content);
  
  const handleClick = (e) => {
    const checkbox = e.target.closest('.preview-checkbox-toggle');
    if (checkbox && onToggleCheckbox) {
      const lineIndex = parseInt(checkbox.getAttribute('data-line-index'), 10);
      onToggleCheckbox(lineIndex);
    }
  };

  return (
    <div 
      className="markdown-body" 
      onClick={handleClick}
      style={{ 
        color: 'var(--text-main)', 
        fontSize: fontSize ? `${fontSize}px` : '0.95rem', 
        lineHeight: 1.6,
        wordBreak: 'break-word',
      }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

export default function MarkdownNotes({ user, refreshKey }) {
  const { t } = useTranslation();
  const [notesList, setNotesList] = useState(null);
  const [notes, setNotes] = useState([]);
  const [selectedNote, setSelectedNote] = useState(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Note edit state
  const [editorTitle, setEditorTitle] = useState('');
  const [editorContent, setEditorContent] = useState('');
  const [editorMode, setEditorMode] = useState('edit'); // 'edit' | 'preview'
  const [saveStatus, setSaveStatus] = useState('saved'); // 'saved' | 'saving' | 'error'
  
  // Sidebar state & Mobile support
  const [showSidebar, setShowSidebar] = useState(true);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 900);

  // Font adjustment state
  const [fontSize, setFontSize] = useState(() => {
    const saved = localStorage.getItem('notes_font_size');
    return saved ? parseInt(saved, 10) : 16;
  });

  // Sharing states
  const [collections, setCollections] = useState([]);
  const [selectedCollectionId, setSelectedCollectionId] = useState('');
  const [responsiblesMap, setResponsiblesMap] = useState({});
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [activeShares, setActiveShares] = useState([]);
  const [shareEmail, setShareEmail] = useState('');
  const [sharePermission, setSharePermission] = useState('WRITE');
  const [sharingLoading, setSharingLoading] = useState(false);

  // Note-level sharing states
  const [isNoteShareModalOpen, setIsNoteShareModalOpen] = useState(false);
  const [activeNoteShares, setActiveNoteShares] = useState([]);
  const [noteShareEmail, setNoteShareEmail] = useState('');
  const [noteSharePermission, setNoteSharePermission] = useState('WRITE');
  const [noteSharingLoading, setNoteSharingLoading] = useState(false);

  // Compute permissions
  const shareRelation = notesList?.markdown_notebook_shares;
  const permission = notesList?.user_id === user.id 
    ? 'WRITE' 
    : (Array.isArray(shareRelation) 
        ? shareRelation[0]?.permission 
        : (shareRelation?.permission || 'READ'));

  const isCollectionReadOnly = notesList?.id?.startsWith('shared-by-email-') || (notesList?.user_id !== user.id && permission === 'READ');

  const getNotePermission = useCallback((note) => {
    if (!note) return 'READ';
    if (note.user_id === user.id) return 'WRITE';
    if (note.permission) return note.permission;
    // Fallback to collection-level permission
    const shareRelation = notesList?.markdown_notebook_shares;
    const nbPermission = notesList?.user_id === user.id 
      ? 'WRITE' 
      : (Array.isArray(shareRelation) 
          ? shareRelation[0]?.permission 
          : (shareRelation?.permission || 'READ'));
    return nbPermission;
  }, [notesList, user?.id]);

  const isCurrentNoteReadOnly = selectedNote ? (getNotePermission(selectedNote) === 'READ') : true;

  // Enforce preview-only mode if read-only
  useEffect(() => {
    if (isCurrentNoteReadOnly) {
      setEditorMode('preview');
    }
  }, [isCurrentNoteReadOnly]);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 900);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const textareaRef = useRef(null);
  const saveTimeoutRef = useRef(null);

  const handleIncreaseFont = () => {
    setFontSize(prev => {
      const next = Math.min(prev + 2, 32);
      localStorage.setItem('notes_font_size', next.toString());
      return next;
    });
  };

  const handleDecreaseFont = () => {
    setFontSize(prev => {
      const next = Math.max(prev - 2, 10);
      localStorage.setItem('notes_font_size', next.toString());
      return next;
    });
  };

  const fetchNotes = useCallback(async (notebookId) => {
    try {
      if (notebookId.startsWith('shared-by-email-')) {
        const senderEmail = notebookId.replace('shared-by-email-', '');
        const userEmail = user?.email?.toLowerCase().trim() || '';
        
        const { data: noteShares, error: noteSharesErr } = await supabase
          .from('markdown_note_shares')
          .select('note_id, permission, shared_by_email')
          .eq('shared_with_email', userEmail)
          .eq('shared_by_email', senderEmail);

        if (noteSharesErr) throw noteSharesErr;

        if (noteShares && noteShares.length > 0) {
          const sharedNoteIds = noteShares.map(ns => ns.note_id);
          const { data: sharedNotesData, error: sharedNotesErr } = await supabase
            .from('markdown_notes')
            .select('*')
            .in('id', sharedNoteIds);

          if (sharedNotesErr) throw sharedNotesErr;

          if (sharedNotesData) {
            const enriched = sharedNotesData.map(note => {
              const share = noteShares.find(ns => ns.note_id === note.id);
              return {
                ...note,
                permission: share?.permission || 'READ',
                shared_by_email: share?.shared_by_email || ''
              };
            });
            setNotes(enriched);
          } else {
            setNotes([]);
          }
        } else {
          setNotes([]);
        }
        return;
      }

      const { data, error } = await supabase
        .from('markdown_notes')
        .select('*')
        .eq('notebook_id', notebookId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      if (data) {
        setNotes(data);
      }
    } catch (err) {
      console.error('Error loading notes:', err);
      toast.error(t('lists.notes_view.error_load'));
    }
  }, [t, user?.email]);

  // Setup/Fetch notebooks (owned + shared + virtual note shares)
  const initializeNotesCollection = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      // 1. Fetch owned notebooks
      const { data: owned, error: fetchErr } = await supabase
        .from('markdown_notebooks')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true });

      if (fetchErr) throw fetchErr;

      let notebooksList = owned || [];

      // Create a default notebook if none exists
      if (notebooksList.length === 0) {
        const { data: created, error: createErr } = await supabase
          .from('markdown_notebooks')
          .insert([{
            user_id: user.id,
            name: 'Minhas Notas'
          }])
          .select()
          .limit(1);

        if (createErr) throw createErr;
        if (created && created.length > 0) {
          notebooksList = [created[0]];
        } else {
          throw new Error('Falha ao criar caderno de notas padrão');
        }
      }

      // 2. Fetch shared notebooks
      const userEmail = user?.email?.toLowerCase().trim() || '';
      const { data: myShares, error: sharesErr } = await supabase
        .from('markdown_notebook_shares')
        .select('notebook_id, id, permission, shared_with_email, shared_by_email')
        .eq('shared_with_email', userEmail);

      if (sharesErr) {
        console.error('Error fetching share records:', sharesErr);
      }

      let shared = [];
      if (myShares && myShares.length > 0) {
        const sharedNotebookIds = myShares.map(s => s.notebook_id);
        const { data: sharedNotebooks, error: sharedNotebooksErr } = await supabase
          .from('markdown_notebooks')
          .select('*')
          .in('id', sharedNotebookIds);

        if (sharedNotebooksErr) {
          console.error('Error fetching shared notebooks:', sharedNotebooksErr);
        }

        if (sharedNotebooks) {
          shared = sharedNotebooks.map(notebook => {
            const shareRecord = myShares.find(s => s.notebook_id === notebook.id);
            return {
              ...notebook,
              markdown_notebook_shares: shareRecord ? [shareRecord] : [],
              shared_by_email: shareRecord?.shared_by_email || null
            };
          });
        }
      }

      // 2.5 Fetch individually shared notes
      const { data: noteShares, error: noteSharesErr } = await supabase
        .from('markdown_note_shares')
        .select('shared_by_email')
        .eq('shared_with_email', userEmail);

      if (noteSharesErr) {
        console.error('Error fetching note shares metadata:', noteSharesErr);
      }

      let virtualNotebooks = [];
      if (noteShares && noteShares.length > 0) {
        const uniqueSenders = Array.from(new Set(noteShares.map(ns => ns.shared_by_email.toLowerCase().trim())));
        uniqueSenders.forEach(senderEmail => {
          virtualNotebooks.push({
            id: `shared-by-email-${senderEmail}`,
            name: `Notas Compartilhadas`,
            user_id: 'shared-notes-sender',
            shared_by_email: senderEmail,
            isVirtual: true
          });
        });
      }

      const allNotebooks = [...notebooksList, ...shared, ...virtualNotebooks];
      const uniqueNotebooks = Array.from(new Map(allNotebooks.map(item => [item.id, item])).values());
      setCollections(uniqueNotebooks);

      // 3. Determine selected notebook
      let activeNotebook = uniqueNotebooks[0];
      const savedNotebookId = localStorage.getItem('notes_active_collection_id');
      if (savedNotebookId) {
        const found = uniqueNotebooks.find(c => c.id === savedNotebookId);
        if (found) activeNotebook = found;
      }

      setNotesList(activeNotebook);
      setSelectedCollectionId(activeNotebook.id);
      localStorage.setItem('notes_active_collection_id', activeNotebook.id);

      // 4. Fetch family members/responsibles mapping
      const { data: responsibles } = await supabase
        .from('finance_responsibles')
        .select('user_id, name, email');
      
      const rMap = {};
      if (responsibles) {
        responsibles.forEach(r => {
          rMap[r.user_id] = r.name || r.email;
          if (r.email) {
            rMap[r.email.toLowerCase().trim()] = r.name || r.email;
          }
        });
      }
      setResponsiblesMap(rMap);

      // 5. Fetch notes for the active notebook
      await fetchNotes(activeNotebook.id);
    } catch (err) {
      console.error('Error initializing notes collection:', err);
      toast.error(t('lists.notes_view.error_init'));
    } finally {
      setLoading(false);
    }
  }, [user, t, fetchNotes]);

  useEffect(() => {
    initializeNotesCollection();
  }, [initializeNotesCollection, refreshKey]);

  // Handle Switch collection
  const handleSwitchCollection = async (collectionId) => {
    // Flush pending saves
    if (saveTimeoutRef.current && selectedNote) {
      clearTimeout(saveTimeoutRef.current);
      await triggerSave(selectedNote.id, editorTitle, editorContent);
    }

    const found = collections.find(c => c.id === collectionId);
    if (found) {
      setNotesList(found);
      setSelectedCollectionId(found.id);
      localStorage.setItem('notes_active_collection_id', found.id);
      setSelectedNote(null);
      setEditorTitle('');
      setEditorContent('');
      setSaveStatus('saved');
      setLoading(true);
      await fetchNotes(found.id);
      setLoading(false);
    }
  };

  // Handle Note selection
  const selectNote = (note) => {
    // If there is a pending auto-save, flush it immediately before switching
    if (saveTimeoutRef.current && selectedNote) {
      clearTimeout(saveTimeoutRef.current);
      triggerSave(selectedNote.id, editorTitle, editorContent);
    }
    
    setSelectedNote(note);
    setEditorTitle(note.title);
    setEditorContent(note.content);
    const noteReadOnly = getNotePermission(note) === 'READ';
    setEditorMode(noteReadOnly ? 'preview' : 'edit');
    setSaveStatus('saved');
    if (isMobile) {
      setShowSidebar(false);
    }
  };

  // Create new note
  const handleCreateNote = async () => {
    if (!notesList || isCollectionReadOnly) return;
    try {
      const { data, error } = await supabase
        .from('markdown_notes')
        .insert([{
          notebook_id: notesList.id,
          user_id: user.id,
          title: t('lists.notes_view.untitled'),
          content: ''
        }])
        .select()
        .limit(1);

      if (error) throw error;

      const createdNote = data && data.length > 0 ? data[0] : null;
      if (!createdNote) throw new Error('Falha ao criar nota no banco');

      setNotes(prev => [createdNote, ...prev]);
      selectNote(createdNote);
      toast.success(t('lists.notes_view.note_created'));
    } catch (err) {
      console.error('Error creating note:', err);
      toast.error(t('lists.notes_view.error_load'));
    }
  };

  // Delete note
  const handleDeleteNote = async (id, e) => {
    e.stopPropagation();
    const noteToDelete = notes.find(n => n.id === id);
    if (!noteToDelete || getNotePermission(noteToDelete) === 'READ') return;
    if (!confirm(t('lists.notes_view.confirm_delete'))) return;
    
    try {
      const { error } = await supabase
        .from('markdown_notes')
        .delete()
        .eq('id', id);

      if (error) throw error;

      setNotes(prev => prev.filter(n => n.id !== id));
      if (selectedNote?.id === id) {
        setSelectedNote(null);
        if (isMobile) {
          setShowSidebar(true);
        }
      }
      toast.success(t('lists.notes_view.note_deleted'));
    } catch (err) {
      console.error('Error deleting note:', err);
      toast.error(t('lists.notes_view.error_delete'));
    }
  };

  // Create New Notebook
  const handleCreateNotebook = async () => {
    const name = prompt(t('lists.notes_view.prompt_notebook_name', 'Digite o nome do novo Bloco de Notas:'));
    if (!name || !name.trim()) return;

    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('markdown_notebooks')
        .insert([{
          user_id: user.id,
          name: name.trim()
        }])
        .select()
        .limit(1);

      if (error) throw error;

      const newNotebook = data && data.length > 0 ? data[0] : null;
      if (!newNotebook) throw new Error('Erro ao criar bloco de notas');

      toast.success(t('lists.notes_view.notebook_created', 'Bloco de Notas criado com sucesso!'));
      
      await initializeNotesCollection();
      
      setNotesList(newNotebook);
      setSelectedCollectionId(newNotebook.id);
      localStorage.setItem('notes_active_collection_id', newNotebook.id);
      setSelectedNote(null);
      setEditorTitle('');
      setEditorContent('');
      setSaveStatus('saved');
      await fetchNotes(newNotebook.id);
    } catch (err) {
      console.error('Error creating notebook:', err);
      toast.error(t('lists.notes_view.error_create_notebook', 'Erro ao criar bloco de notas'));
    } finally {
      setLoading(false);
    }
  };

  // Delete Notebook
  const handleDeleteNotebook = async () => {
    if (!notesList || notesList.user_id !== user.id) return;
    
    const ownedCount = collections.filter(c => c.user_id === user.id).length;
    if (ownedCount <= 1) {
      toast.error(t('lists.notes_view.cannot_delete_only_notebook', 'Você não pode excluir seu único bloco de notas'));
      return;
    }

    if (!confirm(t('lists.notes_view.confirm_delete_notebook', 'Tem certeza que deseja excluir este Bloco de Notas? Todas as notas dentro dele serão excluídas permanentemente.'))) return;

    try {
      setLoading(true);
      
      const { error: sharesErr } = await supabase
        .from('markdown_notebook_shares')
        .delete()
        .eq('notebook_id', notesList.id);

      if (sharesErr) throw sharesErr;

      const { error: notesErr } = await supabase
        .from('markdown_notes')
        .delete()
        .eq('notebook_id', notesList.id);

      if (notesErr) throw notesErr;

      const { error: listErr } = await supabase
        .from('markdown_notebooks')
        .delete()
        .eq('id', notesList.id);

      if (listErr) throw listErr;

      toast.success(t('lists.notes_view.notebook_deleted', 'Bloco de Notas excluído!'));
      
      localStorage.removeItem('notes_active_collection_id');
      await initializeNotesCollection();
    } catch (err) {
      console.error('Error deleting notebook:', err);
      toast.error(t('lists.notes_view.error_delete_notebook', 'Erro ao excluir bloco de notas'));
    } finally {
      setLoading(false);
    }
  };

  // Move note to another notebook
  const handleMoveNote = async (targetCollectionId) => {
    if (!selectedNote || selectedNote.user_id !== user.id) return;
    try {
      setLoading(true);
      const { error } = await supabase
        .from('markdown_notes')
        .update({ notebook_id: targetCollectionId })
        .eq('id', selectedNote.id);

      if (error) throw error;

      setNotes(prev => prev.filter(n => n.id !== selectedNote.id));
      setSelectedNote(null);
      setEditorTitle('');
      setEditorContent('');
      toast.success(t('lists.notes_view.note_moved', 'Nota movida com sucesso!'));
    } catch (err) {
      console.error('Error moving note:', err);
      toast.error(t('lists.notes_view.error_move_note', 'Erro ao mover nota'));
    } finally {
      setLoading(false);
    }
  };

  // Immediate Save API Call
  const triggerSave = async (id, title, content) => {
    if (isCurrentNoteReadOnly) return;
    try {
      const { error } = await supabase
        .from('markdown_notes')
        .update({
          title,
          content,
          updated_at: new Date().toISOString()
        })
        .eq('id', id);

      if (error) throw error;

      // Update list items local state
      setNotes(prev => prev.map(n => n.id === id ? { ...n, title, content, updated_at: new Date().toISOString() } : n));
      setSaveStatus('saved');
    } catch (err) {
      console.error('Auto-save error:', err);
      setSaveStatus('error');
    }
  };

  // Auto-save Debouncer
  const queueAutoSave = (noteId, newTitle, newContent) => {
    if (isCurrentNoteReadOnly) return;
    setSaveStatus('saving');
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    saveTimeoutRef.current = setTimeout(() => {
      triggerSave(noteId, newTitle, newContent);
    }, 1000);
  };

  // Handle inputs changes
  const handleTitleChange = (e) => {
    if (isCurrentNoteReadOnly) return;
    const val = e.target.value;
    setEditorTitle(val);
    if (selectedNote) {
      queueAutoSave(selectedNote.id, val, editorContent);
    }
  };

  const handleContentChange = (e) => {
    if (isCurrentNoteReadOnly) return;
    const val = e.target.value;
    setEditorContent(val);
    if (selectedNote) {
      queueAutoSave(selectedNote.id, editorTitle, val);
    }
  };

  const handleToggleCheckbox = (lineIndex) => {
    if (!selectedNote || isCurrentNoteReadOnly) return;

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    const lines = editorContent.split('\n');
    const line = lines[lineIndex];
    if (line === undefined) return;

    const checkboxMatch = line.match(/^(-\s+\[)([ xX])(\]\s+.*)/);
    if (checkboxMatch) {
      const isChecked = checkboxMatch[2].toLowerCase() === 'x';
      const newMark = isChecked ? ' ' : 'x';
      lines[lineIndex] = `${checkboxMatch[1]}${newMark}${checkboxMatch[3]}`;
      
      const newContent = lines.join('\n');
      setEditorContent(newContent);
      setSelectedNote(prev => ({ ...prev, content: newContent }));
      
      setSaveStatus('saving');
      triggerSave(selectedNote.id, editorTitle, newContent);
    }
  };

  // Helper buttons inserts
  const insertSyntax = (syntax, placeholderText = '') => {
    if (isCurrentNoteReadOnly) return;
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;
    const before = text.substring(0, start);
    const after = text.substring(end, text.length);
    const selected = text.substring(start, end) || placeholderText;

    let replacement = '';
    if (syntax === 'bold') replacement = `**${selected}**`;
    else if (syntax === 'italic') replacement = `*${selected}*`;
    else if (syntax === 'code') replacement = `\`${selected}\``;
    else if (syntax === 'codeblock') replacement = `\`\`\`\n${selected}\n\`\`\``;
    else if (syntax === 'h1') replacement = `# ${selected}`;
    else if (syntax === 'h2') replacement = `## ${selected}`;
    else if (syntax === 'h3') replacement = `### ${selected}`;
    else if (syntax === 'list') replacement = `- ${selected}`;
    else if (syntax === 'checkbox') replacement = `- [ ] ${selected}`;
    else if (syntax === 'link') replacement = `[${selected}](url)`;
    else if (syntax === 'hr') replacement = `\n---\n`;

    const newValue = before + replacement + after;
    setEditorContent(newValue);
    if (selectedNote) {
      queueAutoSave(selectedNote.id, editorTitle, newValue);
    }

    setTimeout(() => {
      textarea.focus();
      const newCursorPos = start + replacement.length;
      textarea.setSelectionRange(newCursorPos, newCursorPos);
    }, 0);
  };

  // Share Management Handlers
  const fetchShares = useCallback(async () => {
    if (!notesList || notesList.user_id !== user.id) {
      setActiveShares([]);
      return;
    }
    const { data } = await supabase.from('markdown_notebook_shares').select('*').eq('notebook_id', notesList.id);
    if (data) setActiveShares(data);
  }, [notesList, user?.id]);

  useEffect(() => {
    if (isShareModalOpen) {
      fetchShares();
    }
  }, [isShareModalOpen, fetchShares]);

  const handleShareNotes = async (e) => {
    e.preventDefault();
    if (!shareEmail || !notesList) return;
    setSharingLoading(true);

    try {
      const { error } = await supabase.from('markdown_notebook_shares').insert([{
        notebook_id: notesList.id,
        shared_by: user.id,
        shared_by_email: user.email?.toLowerCase().trim() || null,
        shared_with_email: shareEmail.toLowerCase().trim(),
        permission: sharePermission
      }]);

      if (error) throw error;

      toast.success('Bloco de Notas compartilhado!');
      setShareEmail('');
      fetchShares();
    } catch (err) {
      toast.error('Erro ao compartilhar: ' + err.message);
    } finally {
      setSharingLoading(false);
    }
  };

  const handleRevokeShare = async (shareId) => {
    if (!confirm('Revogar acesso?')) return;
    const { error } = await supabase.from('markdown_notebook_shares').delete().eq('id', shareId);
    if (!error) {
      toast.success('Acesso revogado');
      fetchShares();
    }
  };

  // Note Share Management Handlers
  const fetchNoteShares = useCallback(async () => {
    if (!selectedNote || selectedNote.user_id !== user.id) {
      setActiveNoteShares([]);
      return;
    }
    const { data } = await supabase.from('markdown_note_shares').select('*').eq('note_id', selectedNote.id);
    if (data) setActiveNoteShares(data);
  }, [selectedNote, user?.id]);

  useEffect(() => {
    if (isNoteShareModalOpen) {
      fetchNoteShares();
    }
  }, [isNoteShareModalOpen, fetchNoteShares]);

  const handleShareNote = async (e) => {
    e.preventDefault();
    if (!noteShareEmail || !selectedNote) return;
    setNoteSharingLoading(true);

    try {
      const { error } = await supabase.from('markdown_note_shares').insert([{
        note_id: selectedNote.id,
        shared_by: user.id,
        shared_by_email: user.email?.toLowerCase().trim() || null,
        shared_with_email: noteShareEmail.toLowerCase().trim(),
        permission: noteSharePermission
      }]);

      if (error) throw error;

      toast.success(t('lists.notes_view.note_shared_success', 'Nota compartilhada!'));
      setNoteShareEmail('');
      fetchNoteShares();
    } catch (err) {
      toast.error('Erro ao compartilhar nota: ' + err.message);
    } finally {
      setNoteSharingLoading(false);
    }
  };

  const handleRevokeNoteShare = async (shareId) => {
    if (!confirm(t('lists.notes_view.confirm_revoke_note_share', 'Revogar acesso a esta nota?'))) return;
    const { error } = await supabase.from('markdown_note_shares').delete().eq('id', shareId);
    if (!error) {
      toast.success(t('lists.notes_view.note_share_revoked', 'Acesso revogado'));
      fetchNoteShares();
    }
  };

  const filteredNotes = notes.filter(n => 
    n.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    n.content.toLowerCase().includes(searchTerm.toLowerCase())
  );

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

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '5rem' }}>
        <Loader2 className="animate-spin" size={40} style={{ color: 'var(--primary)' }} />
      </div>
    );
  }

  return (
    <>
      <style>{`
        .notes-layout-container {
          display: grid;
          grid-template-columns: 300px 1fr;
          height: calc(100vh - 180px);
          min-height: 500px;
          overflow: hidden;
          background: var(--bg-card);
          border: 1px solid var(--glass-border);
          border-radius: 24px;
        }
        
        .notes-sidebar-pane {
          display: flex;
          flex-direction: column;
          border-right: 1px solid var(--glass-border);
          background: rgba(0,0,0,0.1);
          height: 100%;
          width: 100%;
          min-height: 0;
          overflow: hidden;
        }
        
        .notes-editor-pane {
          display: flex;
          flex-direction: column;
          height: 100%;
          background: rgba(0,0,0,0.02);
          width: 100%;
          min-height: 0;
          overflow: hidden;
        }
        
        .notes-layout-container.sidebar-collapsed {
          grid-template-columns: 1fr !important;
        }
        
        .notes-layout-container.sidebar-collapsed .notes-sidebar-pane {
          display: none !important;
        }
        
        .notes-back-btn-mobile {
          display: none;
        }
        
        .notes-toggle-btn-desktop {
          display: flex;
        }
        
        @media (max-width: 900px) {
          .notes-layout-container {
            grid-template-columns: 1fr !important;
            height: calc(100vh - 120px) !important;
            min-height: 400px !important;
          }
          
          .notes-layout-container.sidebar-visible .notes-sidebar-pane {
            display: flex !important;
          }
          
          .notes-layout-container.sidebar-visible .notes-editor-pane {
            display: none !important;
          }
          
          .notes-layout-container.sidebar-collapsed .notes-sidebar-pane {
            display: none !important;
          }
          
          .notes-layout-container.sidebar-collapsed .notes-editor-pane {
            display: flex !important;
          }
          
          .notes-back-btn-mobile {
            display: flex !important;
          }
          
          .notes-toggle-btn-desktop {
            display: none !important;
          }
        }
      `}</style>
      
      <div className={`glass-card notes-layout-container ${showSidebar ? 'sidebar-visible' : 'sidebar-collapsed'}`}>
        
        {/* LEFT SIDEBAR: Notes List */}
        <div className="notes-sidebar-pane">
          {/* Collection Selector */}
          {collections.length > 0 && (
            <div style={{ padding: '1.25rem 1.25rem 0 1.25rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <select
                value={selectedCollectionId}
                onChange={(e) => handleSwitchCollection(e.target.value)}
                className="glass-input"
                style={{
                  flex: 1,
                  borderRadius: '10px',
                  fontSize: '0.85rem',
                  fontWeight: 800,
                  color: 'var(--text-main)',
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid var(--glass-border)',
                  cursor: 'pointer',
                  height: '36px',
                  padding: '0 0.5rem'
                }}
              >
                {collections.map(c => {
                  const isOwner = c.user_id === user.id;
                  let ownerName = null;
                  if (!isOwner) {
                    const emailKey = c.shared_by_email?.toLowerCase().trim();
                    if (emailKey && responsiblesMap[emailKey]) {
                      ownerName = responsiblesMap[emailKey];
                    } else if (responsiblesMap[c.user_id]) {
                      ownerName = responsiblesMap[c.user_id];
                    } else {
                      ownerName = c.shared_by_email || c.user_id;
                    }
                  }
                  const label = isOwner 
                    ? (c.name === 'Minhas Notas' || c.name === 'Listas' || c.name === 'Notas Markdown' ? t('lists.notes_view.my_notes', 'Minhas Notas') : c.name)
                    : `${c.name} (${ownerName})`;
                  return (
                    <option key={c.id} value={c.id} style={{ background: 'var(--bg-card)', color: 'var(--text-main)' }}>
                      {label}
                    </option>
                  );
                })}
              </select>
              
              {!isCollectionReadOnly && (
                <button
                  type="button"
                  onClick={handleCreateNotebook}
                  style={{
                    width: '36px',
                    height: '36px',
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid var(--glass-border)',
                    borderRadius: '10px',
                    color: 'var(--text-main)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    flexShrink: 0
                  }}
                  title={t('lists.notes_view.new_notebook', 'Novo Bloco de Notas')}
                >
                  <Plus size={16} />
                </button>
              )}

              {notesList && notesList.user_id === user.id && collections.filter(c => c.user_id === user.id).length > 1 && (
                <button
                  type="button"
                  onClick={handleDeleteNotebook}
                  style={{
                    width: '36px',
                    height: '36px',
                    background: 'rgba(239, 68, 68, 0.1)',
                    border: '1px solid rgba(239, 68, 68, 0.2)',
                    borderRadius: '10px',
                    color: 'var(--danger)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    flexShrink: 0
                  }}
                  title={t('lists.notes_view.delete_notebook', 'Excluir Bloco de Notas')}
                >
                  <Trash2 size={16} />
                </button>
              )}
            </div>
          )}

          {/* Sidebar Header */}
          <div style={{ 
            padding: '1.25rem', 
            borderBottom: '1px solid var(--glass-border)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '0.75rem'
          }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <Search style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} size={16} />
              <input 
                type="text" 
                placeholder={t('lists.notes_view.search_placeholder')} 
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="glass-input"
                style={{ paddingLeft: '2.5rem', paddingRight: '0.75rem', height: '36px', borderRadius: '10px', fontSize: '0.85rem' }}
              />
            </div>
            
            {!isCollectionReadOnly && (
              <button 
                onClick={handleCreateNote}
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
                title={t('lists.notes_view.new_note')}
              >
                <Plus size={18} strokeWidth={3} />
              </button>
            )}

            <button 
              onClick={() => setShowSidebar(false)}
              style={{ 
                width: 36, 
                height: 36, 
                background: 'rgba(255, 255, 255, 0.05)', 
                color: 'var(--text-muted)', 
                border: '1px solid var(--glass-border)',
                borderRadius: '10px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                flexShrink: 0,
                transition: 'all 0.2s'
              }}
              title={t('lists.notes_view.hide_sidebar')}
            >
              <ChevronLeft size={18} />
            </button>
          </div>

          {/* Notes List */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '0.75rem', WebkitOverflowScrolling: 'touch' }} className="custom-scrollbar">
            {filteredNotes.length === 0 ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                {t('lists.notes_view.no_notes')}
              </div>
            ) : (
              filteredNotes.map(n => {
                const isSelected = selectedNote?.id === n.id;
                // Excerpt (first line of markdown content, stripped from headers symbols)
                const plainContent = n.content.replace(/[#*`[\]-]/g, '').trim();
                const snippet = plainContent.substring(0, 60) || t('lists.notes_view.untitled');
                
                return (
                  <div 
                    key={n.id}
                    onClick={() => selectNote(n)}
                    style={{
                      padding: '1rem',
                      borderRadius: '16px',
                      background: isSelected ? 'linear-gradient(135deg, rgba(99, 102, 241, 0.15), rgba(99, 102, 241, 0.05))' : 'transparent',
                      border: '1px solid',
                      borderColor: isSelected ? 'var(--primary)' : 'transparent',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      marginBottom: '0.5rem',
                      position: 'relative',
                      group: 'true'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
                      <div style={{ 
                        fontWeight: 800, 
                        fontSize: '0.95rem', 
                        color: isSelected ? 'var(--text-main)' : 'var(--text-muted)',
                        whiteSpace: 'nowrap',
                        textOverflow: 'ellipsis',
                        overflow: 'hidden',
                        flex: 1
                      }}>
                        {n.title}
                      </div>
                      
                      {getNotePermission(n) === 'WRITE' && (
                        <button
                          onClick={(e) => handleDeleteNote(n.id, e)}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            color: 'var(--danger)',
                            cursor: 'pointer',
                            padding: '2px',
                            borderRadius: '4px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            opacity: isSelected ? 0.7 : 0,
                            transition: 'opacity 0.2s'
                          }}
                          className="note-delete-btn"
                          title={t('lists.notes_view.delete_note')}
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                    
                    <div style={{ 
                      fontSize: '0.8rem', 
                      color: 'var(--text-muted)', 
                      marginTop: '0.25rem',
                      whiteSpace: 'nowrap',
                      textOverflow: 'ellipsis',
                      overflow: 'hidden',
                      opacity: 0.8
                    }}>
                      {snippet}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* RIGHT PANE: Selected Note Editor / Viewer */}
        <div className="notes-editor-pane">
          {/* Editor Toolbar */}
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center', 
            padding: '0.75rem 1.5rem', 
            borderBottom: '1px solid var(--glass-border)',
            background: 'rgba(0, 0, 0, 0.15)',
            flexWrap: 'wrap',
            gap: '0.75rem',
            minHeight: '53px'
          }}>
            {/* Edit / Preview Tabs */}
            <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center' }}>
              <button
                className="notes-back-btn-mobile"
                onClick={() => setShowSidebar(true)}
                style={{
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid var(--glass-border)',
                  borderRadius: '8px',
                  color: 'var(--primary)',
                  padding: '0.35rem 0.85rem',
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  alignItems: 'center',
                  gap: '0.25rem',
                  marginRight: '0.5rem',
                  transition: 'all 0.2s'
                }}
              >
                <ChevronLeft size={14} strokeWidth={3} />
                {t('lists.notes_view.back')}
              </button>

              <button
                className="notes-toggle-btn-desktop"
                onClick={() => setShowSidebar(!showSidebar)}
                style={{
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid var(--glass-border)',
                  borderRadius: '8px',
                  color: 'var(--text-muted)',
                  width: '32px',
                  height: '32px',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  marginRight: '0.5rem',
                  transition: 'all 0.2s'
                }}
                title={showSidebar ? t('lists.notes_view.hide_sidebar') : t('lists.notes_view.show_sidebar')}
              >
                <ChevronLeft size={16} style={{ transform: showSidebar ? 'none' : 'rotate(180deg)', transition: 'transform 0.2s' }} />
              </button>

              {selectedNote && !isCurrentNoteReadOnly && (
                <div style={{ display: 'flex', gap: '0.35rem', background: 'rgba(0,0,0,0.2)', padding: '2px', borderRadius: '8px' }}>
                  <button
                    onClick={() => setEditorMode('edit')}
                    style={{
                      padding: '0.35rem 0.85rem',
                      borderRadius: '6px',
                      border: 'none',
                      background: editorMode === 'edit' ? 'var(--primary)' : 'transparent',
                      color: editorMode === 'edit' ? 'white' : 'var(--text-muted)',
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
                    {t('lists.notes_view.edit')}
                  </button>
                  <button
                    onClick={() => setEditorMode('preview')}
                    style={{
                      padding: '0.35rem 0.85rem',
                      borderRadius: '6px',
                      border: 'none',
                      background: editorMode === 'preview' ? 'var(--primary)' : 'transparent',
                      color: editorMode === 'preview' ? 'white' : 'var(--text-muted)',
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
                    {t('lists.notes_view.preview')}
                  </button>
                </div>
              )}

              {notesList && notesList.user_id === user.id && (
                <button
                  onClick={() => setIsShareModalOpen(true)}
                  style={{
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid var(--glass-border)',
                    borderRadius: '8px',
                    color: 'var(--text-muted)',
                    width: '32px',
                    height: '32px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    marginLeft: '0.5rem'
                  }}
                  title={t('lists.notes_view.share_notes', 'Compartilhar Bloco de Notas')}
                >
                  <Users size={16} />
                </button>
              )}

              {selectedNote && selectedNote.user_id === user.id && (
                <button
                  onClick={() => setIsNoteShareModalOpen(true)}
                  style={{
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid var(--glass-border)',
                    borderRadius: '8px',
                    color: 'var(--text-muted)',
                    width: '32px',
                    height: '32px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    marginLeft: '0.5rem'
                  }}
                  title={t('lists.notes_view.share_note', 'Compartilhar Nota')}
                >
                  <Users size={16} style={{ color: 'var(--primary)' }} />
                </button>
              )}

              {/* Move Note Dropdown */}
              {selectedNote && selectedNote.user_id === user.id && collections.filter(c => c.user_id === user.id && c.id !== notesList?.id).length > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', marginLeft: '0.5rem' }}>
                  <select
                    onChange={(e) => {
                      if (e.target.value) {
                        handleMoveNote(e.target.value);
                        e.target.value = ''; // Reset selection
                      }
                    }}
                    className="glass-input"
                    style={{
                      borderRadius: '8px',
                      fontSize: '0.75rem',
                      height: '32px',
                      padding: '0 0.5rem',
                      background: 'rgba(255, 255, 255, 0.05)',
                      border: '1px solid var(--glass-border)',
                      color: 'var(--text-muted)',
                      cursor: 'pointer',
                      maxWidth: '120px'
                    }}
                    defaultValue=""
                  >
                    <option value="" disabled>{t('lists.notes_view.move_to', 'Mover para...')}</option>
                    {collections.filter(c => c.user_id === user.id && c.id !== notesList?.id).map(oc => (
                      <option key={oc.id} value={oc.id} style={{ background: 'var(--bg-card)', color: 'var(--text-main)' }}>
                        {oc.name === 'Minhas Notas' || oc.name === 'Listas' || oc.name === 'Notas Markdown' ? t('lists.notes_view.my_notes', 'Minhas Notas') : oc.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* Toolbar Actions */}
            {selectedNote && editorMode === 'edit' && (
              <div style={{ display: 'flex', gap: '0.3rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <button type="button" onClick={() => insertSyntax('h1', 'Título 1')} style={toolbarButtonStyle} title="Título 1">H1</button>
                <button type="button" onClick={() => insertSyntax('h2', 'Título 2')} style={toolbarButtonStyle} title="Título 2">H2</button>
                <button type="button" onClick={() => insertSyntax('h3', 'Título 3')} style={toolbarButtonStyle} title="Título 3">H3</button>
                <button type="button" onClick={() => insertSyntax('bold', 'negrito')} style={{ ...toolbarButtonStyle, fontWeight: 800 }} title="Negrito">B</button>
                <button type="button" onClick={() => insertSyntax('italic', 'itálico')} style={{ ...toolbarButtonStyle, fontStyle: 'italic' }} title="Itálico">I</button>
                <button type="button" onClick={() => insertSyntax('list', 'item')} style={toolbarButtonStyle} title="Lista">•</button>
                <button type="button" onClick={() => insertSyntax('checkbox', 'tarefa')} style={toolbarButtonStyle} title="Checklist">[ ]</button>
                <button type="button" onClick={() => insertSyntax('code', 'código')} style={toolbarButtonStyle} title="Código em linha">{`</>`}</button>
                <button type="button" onClick={() => insertSyntax('link', 'link')} style={toolbarButtonStyle} title="Link">Link</button>
                <button type="button" onClick={() => insertSyntax('hr')} style={{ ...toolbarButtonStyle, fontSize: '0.7rem' }} title="Linha divisória">---</button>
              </div>
            )}

            {/* Font Size Adjust & Save Status */}
            {selectedNote && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                {/* Font controls */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', background: 'rgba(0,0,0,0.2)', padding: '2px', borderRadius: '8px' }}>
                  <button
                    type="button"
                    onClick={handleDecreaseFont}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--text-muted)',
                      padding: '0.2rem 0.4rem',
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      borderRadius: '4px',
                      transition: 'all 0.2s',
                      width: '24px',
                      height: '24px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                    title={t('lists.notes_view.zoom_out', 'Diminuir texto')}
                  >
                    A-
                  </button>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', minWidth: '32px', textAlign: 'center', fontWeight: 'bold', userSelect: 'none' }}>
                    {fontSize}px
                  </span>
                  <button
                    type="button"
                    onClick={handleIncreaseFont}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--text-muted)',
                      padding: '0.2rem 0.4rem',
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      borderRadius: '4px',
                      transition: 'all 0.2s',
                      width: '24px',
                      height: '24px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                    title={t('lists.notes_view.zoom_in', 'Aumentar texto')}
                  >
                    A+
                  </button>
                </div>

                {/* Save status indicator */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  {saveStatus === 'saving' && (
                    <>
                      <Loader2 size={12} className="animate-spin" />
                      <span>{t('lists.notes_view.saving')}</span>
                    </>
                  )}
                  {saveStatus === 'saved' && (
                    <>
                      <Check size={12} style={{ color: 'var(--success)' }} />
                      <span style={{ color: 'var(--success)', fontWeight: 600 }}>{t('lists.notes_view.saved')}</span>
                    </>
                  )}
                  {saveStatus === 'error' && (
                    <span style={{ color: 'var(--danger)', fontWeight: 600 }}>{t('lists.notes_view.error_save')}</span>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Note Editor Content Area or Empty State */}
          {!selectedNote ? (
            <div style={{ 
              flex: 1, 
              display: 'flex', 
              flexDirection: 'column', 
              alignItems: 'center', 
              justifyContent: 'center', 
              color: 'var(--text-muted)',
              gap: '1rem'
            }}>
              <FileText size={48} style={{ opacity: 0.15 }} />
              <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>{t('lists.notes_view.select_or_create')}</span>
            </div>
          ) : (
            <div style={{ 
              flex: 1, 
              minHeight: 0,
              display: 'flex', 
              flexDirection: 'column', 
              padding: '2rem', 
              overflowY: 'auto',
              WebkitOverflowScrolling: 'touch'
            }} className="custom-scrollbar">
              
              {/* Title input (Simplenote style: borderless, bold, large) */}
              <input
                type="text"
                value={editorTitle}
                onChange={handleTitleChange}
                placeholder={t('lists.notes_view.title_placeholder')}
                readOnly={isCurrentNoteReadOnly}
                disabled={isCurrentNoteReadOnly}
                style={{
                  width: '100%',
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  fontSize: '1.8rem',
                  fontWeight: 900,
                  color: 'var(--text-main)',
                  letterSpacing: '-0.02em',
                  marginBottom: '1.5rem',
                  padding: 0
                }}
              />

              {/* Note Content / Preview */}
              {editorMode === 'edit' ? (
                <textarea
                  ref={textareaRef}
                  value={editorContent}
                  onChange={handleContentChange}
                  placeholder={t('lists.notes_view.content_placeholder')}
                  readOnly={isCurrentNoteReadOnly}
                  disabled={isCurrentNoteReadOnly}
                  style={{
                    width: '100%',
                    flex: 1,
                    background: 'transparent',
                    border: 'none',
                    outline: 'none',
                    resize: 'none',
                    color: 'var(--text-main)',
                    fontSize: `${fontSize}px`,
                    lineHeight: 1.6,
                    fontFamily: 'inherit',
                    padding: 0,
                    overflowY: 'auto',
                    WebkitOverflowScrolling: 'touch'
                  }}
                />
              ) : (
                editorContent.trim() ? (
                  <MarkdownRenderer content={editorContent} onToggleCheckbox={handleToggleCheckbox} fontSize={fontSize} />
                ) : (
                  <div style={{ color: 'var(--text-muted)', fontStyle: 'italic', fontSize: '1rem' }}>
                    {t('lists.notes_view.no_content')}
                  </div>
                )
              )}
            </div>
          )}
        </div>

        {/* Styled JSX for note item delete hover visibility */}
        <style>{`
          .note-delete-btn {
            opacity: 0 !important;
          }
          div:hover > div > .note-delete-btn {
            opacity: 0.7 !important;
          }
          .note-delete-btn:hover {
            opacity: 1 !important;
            transform: scale(1.1);
          }
        `}</style>
      </div>

      {/* Share Notes Modal Overlay */}
      <AnimatePresence>
        {isShareModalOpen && (
          <div style={{ 
            position: 'fixed', 
            inset: 0, 
            display: 'flex', 
            alignItems: 'flex-start', 
            justifyContent: 'center', 
            zIndex: 1000, 
            padding: '1.5rem 1rem',
            background: 'rgba(0,0,0,0.5)',
            backdropFilter: 'blur(4px)',
            overflowY: 'auto'
          }}>
            <Motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              style={{
                width: '100%',
                maxWidth: '450px',
                background: 'var(--bg-card)',
                border: '1px solid var(--glass-border)',
                borderRadius: '24px',
                padding: '2rem',
                boxShadow: '0 20px 40px rgba(0,0,0,0.4)',
                position: 'relative',
                margin: 'auto'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                <h3 style={{ margin: 0, color: 'var(--text-main)', fontWeight: 800 }}>{t('lists.notes_view.share_notes', 'Compartilhar Bloco de Notas')}</h3>
                <button onClick={() => setIsShareModalOpen(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}><X size={20} /></button>
              </div>

              <form onSubmit={handleShareNotes} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{t('lists.notes_view.share_with_email', 'Compartilhar com E-mail')}</label>
                  <input 
                    type="email" 
                    value={shareEmail} 
                    onChange={e => setShareEmail(e.target.value)} 
                    className="glass-input" 
                    required 
                    placeholder="exemplo@email.com" 
                    style={{ height: '40px', borderRadius: '10px' }}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{t('lists.notes_view.permission', 'Permissão')}</label>
                  <select 
                    value={sharePermission} 
                    onChange={e => setSharePermission(e.target.value)} 
                    className="glass-input"
                    style={{ borderRadius: '10px', cursor: 'pointer' }}
                  >
                    <option value="READ">{t('lists.notes_view.read_only', 'Apenas Visualizar')}</option>
                    <option value="WRITE">{t('lists.notes_view.read_write', 'Pode Editar')}</option>
                  </select>
                </div>
                <button type="submit" disabled={sharingLoading} className="btn-primary" style={{ padding: '0.75rem', borderRadius: '10px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {sharingLoading ? <Loader2 className="animate-spin" size={18} /> : t('lists.share', 'Compartilhar')}
                </button>
              </form>

              {activeShares.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '1.5rem' }}>
                  <label style={{ fontSize: '0.8rem', fontWeight: 800, opacity: 0.5, color: 'var(--text-main)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t('lists.notes_view.active_shares', 'Acessos Ativos')}</label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '180px', overflowY: 'auto' }} className="custom-scrollbar">
                    {activeShares.map(s => (
                      <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.03)', padding: '0.75rem', borderRadius: '12px', border: '1px solid var(--glass-border)' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, gap: '0.15rem' }}>
                          <span style={{ fontSize: '0.85rem', color: 'var(--text-main)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600 }}>{s.shared_with_email}</span>
                          <span style={{ fontSize: '0.7rem', color: 'var(--primary)', fontWeight: 800 }}>{s.permission === 'WRITE' ? t('lists.notes_view.read_write', 'Pode Editar').toUpperCase() : t('lists.notes_view.read_only', 'Apenas Visualizar').toUpperCase()}</span>
                        </div>
                        <button onClick={() => handleRevokeShare(s.id)} style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', padding: '4px' }} title="Revogar acesso"><Trash2 size={14} /></button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Share Note Modal Overlay */}
      <AnimatePresence>
        {isNoteShareModalOpen && (
          <div style={{ 
            position: 'fixed', 
            inset: 0, 
            display: 'flex', 
            alignItems: 'flex-start', 
            justifyContent: 'center', 
            zIndex: 1000, 
            padding: '1.5rem 1rem',
            background: 'rgba(0,0,0,0.5)',
            backdropFilter: 'blur(4px)',
            overflowY: 'auto'
          }}>
            <Motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              style={{
                width: '100%',
                maxWidth: '450px',
                background: 'var(--bg-card)',
                border: '1px solid var(--glass-border)',
                borderRadius: '24px',
                padding: '2rem',
                boxShadow: '0 20px 40px rgba(0,0,0,0.4)',
                position: 'relative',
                margin: 'auto'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                <h3 style={{ margin: 0, color: 'var(--text-main)', fontWeight: 800 }}>{t('lists.notes_view.share_note', 'Compartilhar Nota')}</h3>
                <button onClick={() => setIsNoteShareModalOpen(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}><X size={20} /></button>
              </div>

              <form onSubmit={handleShareNote} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{t('lists.notes_view.share_with_email', 'Compartilhar com E-mail')}</label>
                  <input 
                    type="email" 
                    value={noteShareEmail} 
                    onChange={e => setNoteShareEmail(e.target.value)} 
                    className="glass-input" 
                    required 
                    placeholder="exemplo@email.com" 
                    style={{ height: '40px', borderRadius: '10px' }}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{t('lists.notes_view.permission', 'Permissão')}</label>
                  <select 
                    value={noteSharePermission} 
                    onChange={e => setNoteSharePermission(e.target.value)} 
                    className="glass-input"
                    style={{ borderRadius: '10px', cursor: 'pointer' }}
                  >
                    <option value="READ">{t('lists.notes_view.read_only', 'Apenas Visualizar')}</option>
                    <option value="WRITE">{t('lists.notes_view.read_write', 'Pode Editar')}</option>
                  </select>
                </div>
                <button type="submit" disabled={noteSharingLoading} className="btn-primary" style={{ padding: '0.75rem', borderRadius: '10px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {noteSharingLoading ? <Loader2 className="animate-spin" size={18} /> : t('lists.share', 'Compartilhar')}
                </button>
              </form>

              {activeNoteShares.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '1.5rem' }}>
                  <label style={{ fontSize: '0.8rem', fontWeight: 800, opacity: 0.5, color: 'var(--text-main)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t('lists.notes_view.active_shares', 'Acessos Ativos')}</label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '180px', overflowY: 'auto' }} className="custom-scrollbar">
                    {activeNoteShares.map(s => (
                      <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.03)', padding: '0.75rem', borderRadius: '12px', border: '1px solid var(--glass-border)' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, gap: '0.15rem' }}>
                          <span style={{ fontSize: '0.85rem', color: 'var(--text-main)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600 }}>{s.shared_with_email}</span>
                          <span style={{ fontSize: '0.7rem', color: 'var(--primary)', fontWeight: 800 }}>{s.permission === 'WRITE' ? t('lists.notes_view.read_write', 'Pode Editar').toUpperCase() : t('lists.notes_view.read_only', 'Apenas Visualizar').toUpperCase()}</span>
                        </div>
                        <button onClick={() => handleRevokeNoteShare(s.id)} style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', padding: '4px' }} title="Revogar acesso"><Trash2 size={14} /></button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
