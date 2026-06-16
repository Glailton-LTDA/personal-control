import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Play, Pause, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, Music, RotateCcw, Volume2, Type, Edit, ExternalLink, Maximize2, Minimize2 } from 'lucide-react';
import ChordDiagram from './ChordDiagram';

// Escala de notas cromáticas para transposição
const NOTES_SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const NOTES_FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

// Acordes padrão para Violão, Ukulele e Cavaquinho (Fallback caso não esteja no banco)
const DEFAULT_CHORDS = {
  violao: {
    'C': { frets: [-1, 3, 2, 0, 1, 0], fingers: [0, 3, 2, 0, 1, 0], startFret: 1 },
    'C#': { frets: [-1, 4, 6, 6, 6, 4], fingers: [0, 1, 2, 3, 4, 1], startFret: 4 },
    'Db': { frets: [-1, 4, 6, 6, 6, 4], fingers: [0, 1, 2, 3, 4, 1], startFret: 4 },
    'D': { frets: [-1, -1, 0, 2, 3, 2], fingers: [0, 0, 0, 1, 3, 2], startFret: 1 },
    'D#': { frets: [-1, 6, 8, 8, 8, 6], fingers: [0, 1, 2, 3, 4, 1], startFret: 6 },
    'Eb': { frets: [-1, 6, 8, 8, 8, 6], fingers: [0, 1, 2, 3, 4, 1], startFret: 6 },
    'E': { frets: [0, 2, 2, 1, 0, 0], fingers: [0, 2, 3, 1, 0, 0], startFret: 1 },
    'F': { frets: [1, 3, 3, 2, 1, 1], fingers: [1, 3, 4, 2, 1, 1], startFret: 1 },
    'F#': { frets: [2, 4, 4, 3, 2, 2], fingers: [1, 3, 4, 2, 1, 1], startFret: 2 },
    'Gb': { frets: [2, 4, 4, 3, 2, 2], fingers: [1, 3, 4, 2, 1, 1], startFret: 2 },
    'G': { frets: [3, 2, 0, 0, 0, 3], fingers: [2, 1, 0, 0, 0, 3], startFret: 1 },
    'G#': { frets: [4, 6, 6, 5, 4, 4], fingers: [1, 3, 4, 2, 1, 1], startFret: 4 },
    'Ab': { frets: [4, 6, 6, 5, 4, 4], fingers: [1, 3, 4, 2, 1, 1], startFret: 4 },
    'A': { frets: [-1, 0, 2, 2, 2, 0], fingers: [0, 0, 1, 2, 3, 0], startFret: 1 },
    'A#': { frets: [-1, 1, 3, 3, 3, 1], fingers: [0, 1, 2, 3, 4, 1], startFret: 1 },
    'Bb': { frets: [-1, 1, 3, 3, 3, 1], fingers: [0, 1, 2, 3, 4, 1], startFret: 1 },
    'B': { frets: [-1, 2, 4, 4, 4, 2], fingers: [0, 1, 2, 3, 4, 1], startFret: 2 },
    'Am': { frets: [-1, 0, 2, 2, 1, 0], fingers: [0, 0, 2, 3, 1, 0], startFret: 1 },
    'Bm': { frets: [-1, 2, 4, 4, 3, 2], fingers: [0, 1, 3, 4, 2, 1], startFret: 2 },
    'Cm': { frets: [-1, 3, 5, 5, 4, 3], fingers: [0, 1, 3, 4, 2, 1], startFret: 3 },
    'Dm': { frets: [-1, -1, 0, 2, 3, 1], fingers: [0, 0, 0, 2, 3, 1], startFret: 1 },
    'Em': { frets: [0, 2, 2, 0, 0, 0], fingers: [0, 2, 3, 0, 0, 0], startFret: 1 },
    'Fm': { frets: [1, 3, 3, 1, 1, 1], fingers: [1, 3, 4, 1, 1, 1], startFret: 1 },
    'Gm': { frets: [3, 5, 5, 3, 3, 3], fingers: [1, 3, 4, 1, 1, 1], startFret: 3 }
  },
  ukulele: {
    'C': { frets: [0, 0, 0, 3], fingers: [0, 0, 0, 3], startFret: 1 },
    'C#': { frets: [1, 1, 1, 4], fingers: [1, 1, 1, 4], startFret: 1 },
    'Db': { frets: [1, 1, 1, 4], fingers: [1, 1, 1, 4], startFret: 1 },
    'D': { frets: [2, 2, 2, 0], fingers: [1, 2, 3, 0], startFret: 1 },
    'D#': { frets: [3, 3, 3, 1], fingers: [3, 3, 3, 1], startFret: 1 },
    'Eb': { frets: [3, 3, 3, 1], fingers: [3, 3, 3, 1], startFret: 1 },
    'E': { frets: [4, 4, 4, 2], fingers: [2, 3, 4, 1], startFret: 1 },
    'F': { frets: [2, 0, 1, 0], fingers: [2, 0, 1, 0], startFret: 1 },
    'F#': { frets: [3, 1, 2, 1], fingers: [3, 1, 2, 1], startFret: 1 },
    'Gb': { frets: [3, 1, 2, 1], fingers: [3, 1, 2, 1], startFret: 1 },
    'G': { frets: [0, 2, 3, 2], fingers: [0, 1, 3, 2], startFret: 1 },
    'G#': { frets: [5, 3, 4, 3], fingers: [3, 1, 2, 1], startFret: 3 },
    'Ab': { frets: [5, 3, 4, 3], fingers: [3, 1, 2, 1], startFret: 3 },
    'A': { frets: [2, 1, 0, 0], fingers: [2, 1, 0, 0], startFret: 1 },
    'A#': { frets: [3, 2, 1, 1], fingers: [3, 2, 1, 1], startFret: 1 },
    'Bb': { frets: [3, 2, 1, 1], fingers: [3, 2, 1, 1], startFret: 1 },
    'B': { frets: [4, 3, 2, 2], fingers: [3, 2, 1, 1], startFret: 2 },
    'Am': { frets: [2, 0, 0, 0], fingers: [2, 0, 0, 0], startFret: 1 },
    'Bm': { frets: [4, 2, 2, 2], fingers: [3, 1, 1, 1], startFret: 2 },
    'Cm': { frets: [0, 3, 3, 3], fingers: [0, 1, 2, 3], startFret: 1 },
    'Dm': { frets: [2, 2, 1, 0], fingers: [2, 3, 1, 0], startFret: 1 },
    'Em': { frets: [0, 4, 3, 2], fingers: [0, 3, 2, 1], startFret: 1 },
    'Fm': { frets: [1, 0, 1, 3], fingers: [1, 0, 2, 4], startFret: 1 },
    'Gm': { frets: [0, 2, 3, 1], fingers: [0, 2, 3, 1], startFret: 1 }
  },
  cavaquinho: {
    'C': { frets: [2, 0, 1, 2], fingers: [2, 0, 1, 3], startFret: 1 },
    'D': { frets: [2, 2, 2, 4], fingers: [1, 1, 1, 3], startFret: 1 },
    'G': { frets: [0, 0, 0, 0], fingers: [0, 0, 0, 0], startFret: 1 },
    'Am': { frets: [2, 2, 1, 2], fingers: [2, 3, 1, 4], startFret: 1 }
  },
  bandolim: {
    'C': { frets: [5, 2, 3, 0], fingers: [4, 1, 2, 0], startFret: 1 },
    'D': { frets: [2, 0, 0, 2], fingers: [1, 0, 0, 2], startFret: 1 },
    'G': { frets: [0, 0, 2, 3], fingers: [0, 0, 1, 2], startFret: 1 },
    'Am': { frets: [2, 2, 0, 0], fingers: [1, 2, 0, 0], startFret: 1 }
  }
};

// Componente para exibir um diagrama de acordes com suporte a navegação de variações
function ChordDiagramWithVariations({ name, instrument, variations }) {
  const [activeIdx, setActiveIdx] = useState(0);
  const currentVar = variations[activeIdx] || variations[0];
  const stringsCount = instrument === 'violao' ? 6 : 4;

  if (!currentVar) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.4rem' }}>
      <ChordDiagram
        name={name}
        stringsCount={stringsCount}
        frets={currentVar.frets}
        fingers={currentVar.fingers}
        startFret={currentVar.startFret || 1}
        instrument={instrument}
      />
      {variations.length > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', gap: '0.25rem', padding: '0 0.5rem' }}>
          <button
            type="button"
            className="icon-btn"
            style={{ padding: '2px 4px' }}
            disabled={activeIdx === 0}
            onClick={() => setActiveIdx(prev => prev - 1)}
            title="Variação Anterior"
          >
            <ChevronLeft size={12} />
          </button>
          <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 'bold' }}>
            Var. {activeIdx + 1}/{variations.length}
          </span>
          <button
            type="button"
            className="icon-btn"
            style={{ padding: '2px 4px' }}
            disabled={activeIdx === variations.length - 1}
            onClick={() => setActiveIdx(prev => prev + 1)}
            title="Próxima Variação"
          >
            <ChevronRight size={12} />
          </button>
        </div>
      )}
    </div>
  );
}

// Transpõe um único acorde pelo offset dado
function transposeChord(chord, offset) {
  if (offset === 0) return chord;
  
  // Regra de regex para extrair a tônica do acorde (ex: C#, Bb, D)
  const regex = /^([A-G][b#]?)(.*)$/;
  const match = chord.match(regex);
  if (!match) return chord;
  
  const root = match[1];
  const rest = match[2];
  
  // Se for com baixo invertido (ex: C/E)
  if (rest.includes('/')) {
    const parts = rest.split('/');
    return transposeChord(root + parts[0], offset) + '/' + transposeChord(parts[1], offset);
  }
  
  // Acha o índice cromático
  let idx = NOTES_SHARP.indexOf(root);
  if (idx === -1) {
    idx = NOTES_FLAT.indexOf(root);
  }
  
  if (idx === -1) return chord;
  
  // Aplica offset com wrap
  let newIdx = (idx + offset) % 12;
  if (newIdx < 0) newIdx += 12;
  
  // Usa sustenidos ou bemóis dependendo do acorde original
  const usesFlat = root.includes('b') || ['Db', 'Eb', 'Gb', 'Ab', 'Bb'].includes(root);
  const newRoot = usesFlat ? NOTES_FLAT[newIdx] : NOTES_SHARP[newIdx];
  
  return newRoot + rest;
}

// Regex para identificar linhas de tablatura
const isTabLine = (line) => {
  return (
    line.includes('|--') || 
    line.trim().match(/^[A-Ga-g]?[#b]?\|-/) || 
    line.trim().match(/^\|-/)
  );
};

// Regex para identificar linhas de acordes
const isChordLine = (line) => {
  if (line.trim() === '') return false;
  
  const cleanToken = (tok) => {
    let cleaned = tok.trim();
    while (
      (cleaned.startsWith('(') && cleaned.endsWith(')')) ||
      (cleaned.startsWith('[') && cleaned.endsWith(']')) ||
      (cleaned.startsWith('{') && cleaned.endsWith('}'))
    ) {
      cleaned = cleaned.substring(1, cleaned.length - 1).trim();
    }
    return cleaned;
  };

  const tokens = line.trim().split(/\s+/);
  const chordRegex = /^[A-G][b#]?(?:m|M|maj|min|dim|aug|sus|add|alt|º|°|ø|Ø|[-+#b\d]|\([^)]+\))*(?:\/[A-G][b#]?(?:m|M|maj|min|dim|aug|sus|add|alt|º|°|ø|Ø|[-+#b\d]|\([^)]+\))*)?$/i;
  
  let chordsCount = 0;
  let relevantTokensCount = 0;

  tokens.forEach(tok => {
    const rawClean = tok.trim();
    if (rawClean === '') return;
    
    if (['/', '|', '(', ')', '[', ']', '{', '}'].includes(rawClean)) {
      return;
    }
    
    relevantTokensCount++;
    const cleaned = cleanToken(rawClean);
    if (cleaned.match(chordRegex)) {
      chordsCount++;
    }
  });
  
  if (relevantTokensCount === 0) return false;
  return chordsCount / relevantTokensCount >= 0.7;
};

export default function CifraViewer({ song, customChords = {}, onEdit = null }) {
  const [instrument, setInstrument] = useState(() => localStorage.getItem('pc_active_instrument') || 'violao');
  const [transpose, setTranspose] = useState(0);
  const [autoScrollSpeed, setAutoScrollSpeed] = useState(0); // 0 = Pausado, 1-10 = Velocidade
  const [savedSpeed, setSavedSpeed] = useState(3);
  const [fontSize, setFontSize] = useState(14); // Em pixels
  const [isFullScreen, setIsFullScreen] = useState(false);
  const scrollRef = useRef(null);
  const mobileScrollRef = useRef(null);
  const intervalRef = useRef(null);

  // Estados e Refs do Tooltip de Acordes (tipo Cifra Club)
  const [activeTooltip, setActiveTooltip] = useState(null); // { chord: string, rect: DOMRect, trigger: 'hover' | 'click' }
  const hideTimeoutRef = useRef(null);

  const handleMouseOver = (e) => {
    if (e.target.classList.contains('chord-highlight')) {
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current);
        hideTimeoutRef.current = null;
      }
      
      const chord = e.target.textContent;
      const rect = e.target.getBoundingClientRect();
      
      setActiveTooltip(prev => {
        if (prev && prev.trigger === 'click') {
          return prev;
        }
        return { chord, rect, trigger: 'hover' };
      });
    }
  };

  const handleMouseOut = (e) => {
    if (e.target.classList.contains('chord-highlight')) {
      hideTimeoutRef.current = setTimeout(() => {
        setActiveTooltip(prev => {
          if (prev && prev.trigger === 'hover') {
            return null;
          }
          return prev;
        });
      }, 300);
    }
  };

  const handleChordClick = (e) => {
    if (e.target.classList.contains('chord-highlight')) {
      e.stopPropagation();
      const chord = e.target.textContent;
      const rect = e.target.getBoundingClientRect();
      
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current);
        hideTimeoutRef.current = null;
      }

      setActiveTooltip(prev => {
        if (prev && prev.chord === chord && prev.trigger === 'click') {
          return null;
        }
        return { chord, rect, trigger: 'click' };
      });
    }
  };

  const handleTooltipMouseEnter = () => {
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
  };

  const handleTooltipMouseLeave = () => {
    setActiveTooltip(prev => {
      if (prev && prev.trigger === 'hover') {
        return null;
      }
      return prev;
    });
  };

  useEffect(() => {
    const handleGlobalClick = () => {
      setActiveTooltip(null);
    };
    window.addEventListener('click', handleGlobalClick);
    return () => window.removeEventListener('click', handleGlobalClick);
  }, []);

  useEffect(() => {
    localStorage.setItem('pc_active_instrument', instrument);
  }, [instrument]);

  // Efeito para rolagem automática
  useEffect(() => {
    if (autoScrollSpeed === 0) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }

    // Mapeia velocidade (1-10) para atraso em ms (200ms a 20ms)
    const delay = 220 - autoScrollSpeed * 20;

    intervalRef.current = setInterval(() => {
      if (scrollRef.current) {
        scrollRef.current.scrollTop += 1;
      }
      if (mobileScrollRef.current) {
        mobileScrollRef.current.scrollTop += 1;
      }
    }, delay);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [autoScrollSpeed]);

  // Efeito para atalho Escape do teclado
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isFullScreen) {
        setIsFullScreen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFullScreen]);

  // Transpõe o texto inteiro da cifra e gerencia tags de instrumentos
  const processContent = () => {
    if (!song?.content) return [];
    
    const lines = song.content.split('\n');
    const processedLines = [];
    let isTabBlock = false;
    let currentTabLines = [];
    let currentBlockInstrument = null;

    // Regex para tags de instrumentos, ex: [violao], [ukulele], [cavaquinho], [bandolim]
    const instrumentBlockRegex = /^\[(violao|ukulele|cavaquinho|bandolim)\]$/i;
    const resetBlockRegex = /^\[(geral|all|todos|cifra)\]$/i;

    const shouldBeInTabBlock = (line, index) => {
      if (isTabLine(line)) return true;
      
      const trimmed = line.trim();
      if (trimmed === '') {
        if (isTabBlock) {
          // Se as próximas linhas até encontrar conteúdo forem de tablatura
          for (let i = index + 1; i < lines.length; i++) {
            const nextTrimmed = lines[i].trim();
            if (nextTrimmed === '') continue;
            return isTabLine(lines[i]);
          }
        }
        return false;
      }
      
      if (isChordLine(line)) {
        // Se a próxima linha de conteúdo for tablatura
        for (let i = index + 1; i < lines.length; i++) {
          const nextTrimmed = lines[i].trim();
          if (nextTrimmed === '') continue;
          return isTabLine(lines[i]);
        }
        return false;
      }
      
      return false;
    };

    const flushTabBlock = () => {
      if (currentTabLines.length > 0) {
        processedLines.push({
          type: 'tablature',
          content: currentTabLines.join('\n'),
          instrument: currentBlockInstrument
        });
        currentTabLines = [];
      }
      isTabBlock = false;
    };

    lines.forEach((line, index) => {
      const trimmed = line.trim();
      const instMatch = trimmed.match(instrumentBlockRegex);
      const resetMatch = trimmed.match(resetBlockRegex);

      if (instMatch) {
        flushTabBlock();
        currentBlockInstrument = instMatch[1].toLowerCase();
      } else if (resetMatch) {
        flushTabBlock();
        currentBlockInstrument = null;
      } else if (shouldBeInTabBlock(line, index)) {
        isTabBlock = true;
        currentTabLines.push(line);
      } else {
        if (isTabBlock) {
          flushTabBlock();
        }
        
        if (isChordLine(line)) {
          // Processa acordes individuais da linha para transposição
          processedLines.push({
            type: 'chords',
            content: line,
            instrument: currentBlockInstrument
          });
        } else {
          processedLines.push({
            type: 'lyrics',
            content: line,
            instrument: currentBlockInstrument
          });
        }
      }
    });

    if (isTabBlock) {
      flushTabBlock();
    }

    return processedLines;
  };

  const processedLines = processContent();

  // Extrai acordes únicos da música para mostrar no rodapé
  const getUniqueChords = () => {
    if (!song?.content) return [];
    
    const chords = new Set();
    const chordRegex = /[A-G][b#]?(?:m|M|maj|min|dim|aug|sus|add|alt|º|°|ø|Ø|[-+#b\d]|\([^)]+\))*(?:\/[A-G][b#]?(?:m|M|maj|min|dim|aug|sus|add|alt|º|°|ø|Ø|[-+#b\d]|\([^)]+\))*)?/g;
    const bracketRegex = /\[([A-G][b#]?[^\]]*)\]/gi;
    
    processedLines.forEach(line => {
      let match;
      const content = line.content;
      while ((match = bracketRegex.exec(content)) !== null) {
        chords.add(match[1]);
      }
      
      if (line.type === 'chords' && !/\[[A-G][b#]?[^\]]*\]/i.test(content)) {
        const matches = content.match(chordRegex);
        if (matches) {
          matches.forEach(c => chords.add(c));
        }
      }
    });

    return Array.from(chords).map(c => transposeChord(c, transpose));
  };

  const uniqueChords = getUniqueChords();

  // Transpõe e destaca os acordes em uma linha de texto preservando espaços
  const transposeChordLine = (lineContent) => {
    const chordRegex = /([A-G][b#]?(?:m|M|maj|min|dim|aug|sus|add|alt|º|°|ø|Ø|[-+#b\d]|\([^)]+\))*(?:\/[A-G][b#]?(?:m|M|maj|min|dim|aug|sus|add|alt|º|°|ø|Ø|[-+#b\d]|\([^)]+\))*)?)/g;
    let result = '';
    let lastIndex = 0;
    let match;

    while ((match = chordRegex.exec(lineContent)) !== null) {
      result += lineContent.substring(lastIndex, match.index);
      const transposed = transposeChord(match[1], transpose);
      result += `<span class="chord-highlight" style="color: var(--primary); font-weight: bold; cursor: pointer;">${transposed}</span>`;
      lastIndex = chordRegex.lastIndex;
    }
    
    result += lineContent.substring(lastIndex);
    return result;
  };

  // Transpõe e destaca os acordes e labels [Intro/Final] em uma linha de acordes
  const highlightChordsAndLabels = (lineContent) => {
    const regex = /(\[[^\]]+\]|[^\s[\]]+)/g;
    let result = '';
    let lastIndex = 0;
    let match;
    
    const chordRegex = /^[A-G][b#]?(?:m|M|maj|min|dim|aug|sus|add|alt|º|°|ø|Ø|[-+#b\d]|\([^)]+\))*(?:\/[A-G][b#]?(?:m|M|maj|min|dim|aug|sus|add|alt|º|°|ø|Ø|[-+#b\d]|\([^)]+\))*)?$/i;

    while ((match = regex.exec(lineContent)) !== null) {
      result += lineContent.substring(lastIndex, match.index);
      const token = match[1];
      
      if (token.startsWith('[') && token.endsWith(']')) {
        const innerText = token.slice(1, -1).trim();
        if (innerText.match(chordRegex)) {
          const transposed = transposeChord(innerText, transpose);
          result += `<span class="chord-highlight" style="color: var(--primary); font-weight: bold; background: rgba(99,102,241,0.08); padding: 2px 4px; border-radius: 4px; border: 1px solid rgba(99,102,241,0.15); margin: 0 2px; font-family: monospace; cursor: pointer;">${transposed}</span>`;
        } else {
          result += `<span class="label-badge" style="background: var(--bg-card, #1e293b); color: var(--text-main, #fff); border: 1px solid var(--glass-border, rgba(255,255,255,0.08)); padding: 2px 8px; border-radius: 6px; font-size: 0.8em; font-weight: bold; font-family: sans-serif; margin-right: 4px; display: inline-block;">${innerText}</span>`;
        }
      } else {
        if (token.match(chordRegex)) {
          const transposed = transposeChord(token, transpose);
          result += `<span class="chord-highlight" style="color: var(--primary); font-weight: bold; cursor: pointer;">${transposed}</span>`;
        } else {
          result += token;
        }
      }
      lastIndex = regex.lastIndex;
    }
    result += lineContent.substring(lastIndex);
    return result;
  };

  // Transpõe e destaca acordes entre colchetes [C] em linhas de letra
  const transposeBracketedChords = (lineContent) => {
    const bracketRegex = /\[([^\]]+)\]/g;
    let result = '';
    let lastIndex = 0;
    let match;
    
    const chordRegex = /^[A-G][b#]?(?:m|M|maj|min|dim|aug|sus|add|alt|º|°|ø|Ø|[-+#b\d]|\([^)]+\))*(?:\/[A-G][b#]?(?:m|M|maj|min|dim|aug|sus|add|alt|º|°|ø|Ø|[-+#b\d]|\([^)]+\))*)?$/i;

    while ((match = bracketRegex.exec(lineContent)) !== null) {
      result += lineContent.substring(lastIndex, match.index);
      const innerText = match[1].trim();
      if (innerText.match(chordRegex)) {
        const transposed = transposeChord(innerText, transpose);
        result += `<span class="chord-highlight" style="color: var(--primary); font-weight: bold; background: rgba(99,102,241,0.08); padding: 2px 4px; border-radius: 4px; border: 1px solid rgba(99,102,241,0.15); margin: 0 2px; font-family: monospace; cursor: pointer;">${transposed}</span>`;
      } else {
        result += `[${innerText}]`;
      }
      lastIndex = bracketRegex.lastIndex;
    }
    
    result += lineContent.substring(lastIndex);
    return result;
  };

  const renderLine = (line, idx) => {
    if (line.instrument && line.instrument !== instrument) {
      return null;
    }
    if (line.type === 'tablature' && !line.instrument) {
      const tabLinesCount = line.content.split('\n').filter(l => isTabLine(l)).length;
      if (tabLinesCount === 6 && instrument !== 'violao') {
        return null;
      }
      if (tabLinesCount === 4 && instrument === 'violao') {
        return null;
      }
    }

    const hasBrackets = /\[[^\]]+\]/i.test(line.content);

    if (line.type === 'chords') {
      const html = highlightChordsAndLabels(line.content);
      return (
        <div key={`line-${idx}`} style={{ marginBottom: '2px' }}>
          <div dangerouslySetInnerHTML={{ __html: html }} style={{ fontFamily: 'monospace', whiteSpace: 'pre', fontSize: `${fontSize}px`, lineHeight: 2 }} />
        </div>
      );
    } else if (line.type === 'tablature') {
      return (
        <pre
          key={`line-${idx}`}
          style={{
            fontFamily: 'Courier New, Courier, Monaco, monospace',
            background: 'rgba(255, 255, 255, 0.015)',
            padding: '0.75rem 1rem',
            borderRadius: '8px',
            borderLeft: '3px solid var(--primary)',
            borderTop: 'none',
            borderRight: 'none',
            borderBottom: 'none',
            overflowX: 'auto',
            margin: '1rem 0',
            fontSize: `${fontSize - 1}px`,
            lineHeight: 1.25,
            color: 'var(--text-main)',
            whiteSpace: 'pre'
          }}
        >
          {line.content.split('\n').map((subLine, subIdx) => {
            const subHasBrackets = /\[[A-G][b#]?[^\]]*\]/i.test(subLine);
            if (isChordLine(subLine) || subHasBrackets) {
              const html = subHasBrackets ? transposeBracketedChords(subLine) : transposeChordLine(subLine);
              return (
                <div
                  key={subIdx}
                  dangerouslySetInnerHTML={{ __html: html }}
                  style={{ color: 'var(--primary)', fontWeight: 'bold', minHeight: '1.2em' }}
                />
              );
            }
            return (
              <div key={subIdx} style={{ minHeight: '1.2em' }}>
                {subLine}
              </div>
            );
          })}
        </pre>
      );
    } else {
      if (hasBrackets) {
        const html = transposeBracketedChords(line.content);
        return (
          <div
            key={`line-${idx}`}
            dangerouslySetInnerHTML={{ __html: html }}
            style={{
              fontSize: `${fontSize}px`,
              fontFamily: 'sans-serif',
              color: 'var(--text-muted)',
              minHeight: '1.2em',
              marginBottom: '1rem',
              lineHeight: 1.8
            }}
          />
        );
      }
      return (
        <div
          key={`line-${idx}`}
          style={{
            fontSize: `${fontSize}px`,
            fontFamily: 'sans-serif',
            color: 'var(--text-muted)',
            minHeight: '1.2em',
            marginBottom: '1rem'
          }}
        >
          {line.content}
        </div>
      );
    }
  };

  return (
    <>
      <style>{`
        .cifra-main-container {
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
          height: 100%;
          min-width: 0;
          width: 100%;
        }

        .cifra-fullscreen {
          position: fixed !important;
          top: 0 !important;
          left: 0 !important;
          width: 100vw !important;
          height: 100vh !important;
          z-index: 1040 !important;
          background: var(--bg-canvas) !important;
          padding: 1.5rem !important;
          overflow: hidden !important;
        }

        .cifra-fullscreen .cifra-main-container {
          height: 100% !important;
          min-height: 0 !important;
        }

        .cifra-layout-grid {
          display: grid;
          grid-template-columns: 1fr 200px;
          gap: 1.5rem;
          align-items: start;
        }

        .cifra-fullscreen .cifra-layout-grid {
          flex: 1 !important;
          min-height: 0 !important;
          height: 100% !important;
          align-items: stretch !important;
        }

        .cifra-sheet-card {
          padding: 2.5rem;
          overflow-y: auto;
          font-family: monospace;
        }

        .cifra-layout-grid:not(.cifra-fullscreen) .cifra-sheet-card {
          max-height: 65vh !important;
        }

        .cifra-fullscreen .cifra-sheet-card {
          height: 100% !important;
          max-height: none !important;
        }

        .cifra-sidebar-card {
          display: flex;
          flex-direction: column;
          gap: 1rem;
          overflow-y: auto;
          padding-right: 4px;
        }

        .cifra-layout-grid:not(.cifra-fullscreen) .cifra-sidebar-card {
          max-height: 65vh !important;
        }

        .cifra-fullscreen .cifra-sidebar-card {
          height: 100% !important;
          max-height: none !important;
        }

        @media (max-width: 768px) {
          .cifra-fullscreen {
            padding: 0.5rem !important;
            gap: 0.5rem !important;
          }

          .cifra-info-section {
            display: none !important;
          }
          
          .cifra-control-bar {
            padding: 0.35rem 0.5rem !important;
            gap: 0.35rem !important;
            border-radius: 8px !important;
            flex-direction: row !important;
            flex-wrap: nowrap !important;
            overflow-x: auto !important;
            justify-content: flex-start !important;
            width: 100% !important;
            max-width: 100% !important;
            box-sizing: border-box !important;
            -webkit-overflow-scrolling: touch;
            -ms-overflow-style: none;
            scrollbar-width: none;
          }

          .cifra-control-bar::-webkit-scrollbar {
            display: none;
          }

          .cifra-controls-wrapper {
            display: flex !important;
            flex-direction: row !important;
            flex-wrap: nowrap !important;
            align-items: center !important;
            gap: 0.25rem !important;
            width: auto !important;
          }

          .cifra-control-bar button,
          .cifra-control-bar select {
            padding: 6px !important;
            border-radius: 8px !important;
            font-size: 0.75rem !important;
            height: auto !important;
            flex-shrink: 0 !important;
          }

          /* Fullscreen mobile layout container */
          .cifra-fullscreen .mobile-only {
            flex: 1 !important;
            min-height: 0 !important;
            height: 100% !important;
            display: flex !important;
            flex-direction: column !important;
          }

          /* Fullscreen mobile scroll card */
          .cifra-fullscreen .mobile-only > .glass-card {
            flex: 1 !important;
            min-height: 0 !important;
            height: 100% !important;
            overflow-y: auto !important;
            max-height: none !important;
            padding: 1rem !important;
          }

          .cifra-fullscreen .cifra-floating-scroll {
            bottom: 1rem !important;
            right: 1rem !important;
            padding: 0.5rem !important;
            gap: 0.5rem !important;
          }

          .cifra-fullscreen .cifra-floating-scroll input[type="range"] {
            width: 60px !important;
          }
        }

        @media (max-height: 500px) and (max-width: 950px) {
          .cifra-fullscreen {
            padding: 0.25rem !important;
            gap: 0.25rem !important;
          }
          
          .cifra-fullscreen .cifra-control-bar {
            padding: 0.25rem 0.5rem !important;
            gap: 0.25rem !important;
          }
        }
      `}</style>

      <div 
        className={`cifra-main-container ${isFullScreen ? 'cifra-fullscreen' : ''}`}
      >
        
        {/* ── Control Bar ── */}
        <div className="glass-card cifra-control-bar" style={{
          padding: '1rem 1.5rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        flexWrap: 'wrap',
        gap: '1rem'
      }}>
        {/* Info */}
        <div className="cifra-info-section">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <h2 style={{ fontSize: '1.4rem', fontWeight: 900, margin: 0, color: 'var(--text-main)' }}>{song?.title}</h2>
            {onEdit && (
              <button
                className="icon-btn"
                onClick={() => onEdit(song)}
                style={{ padding: '5px 10px', display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.75rem', fontWeight: 700 }}
                title="Editar música"
              >
                <Edit size={13} /> Editar
              </button>
            )}
          </div>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: '0.2rem 0 0 0' }}>{song?.artist || 'Artista Desconhecido'}</p>
          {song?.music_link && (
            <a
              href={song.music_link}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.3rem',
                marginTop: '0.4rem',
                fontSize: '0.75rem',
                color: 'var(--primary)',
                textDecoration: 'none',
                background: 'rgba(99,102,241,0.08)',
                padding: '3px 8px',
                borderRadius: '6px',
                border: '1px solid rgba(99,102,241,0.2)',
                fontWeight: 600
              }}
            >
              <ExternalLink size={11} /> Abrir Link de Referência
            </a>
          )}
        </div>

        {/* Controls */}
        <div className="cifra-controls-wrapper" style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          
          {/* Instrument select */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span className="hide-mobile" style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)' }}>INSTRUMENTO:</span>
            <select
              className="select-filter"
              value={instrument}
              onChange={e => setInstrument(e.target.value)}
              style={{ padding: '0.4rem 2rem 0.4rem 0.8rem', fontSize: '0.8rem' }}
            >
              <option value="violao">Violão / Guitarra</option>
              <option value="ukulele">Ukulele</option>
              <option value="cavaquinho">Cavaquinho</option>
              <option value="bandolim">Bandolim</option>
            </select>
          </div>

          {/* Transposição */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', borderRight: '1px solid var(--glass-border)', paddingRight: '1rem' }}>
            <span className="hide-mobile" style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)', marginRight: '0.25rem' }}>TOM:</span>
            <button className="icon-btn" onClick={() => setTranspose(prev => prev - 1)} style={{ padding: '6px' }} title="Diminuir Meio Tom">
              <ChevronDown size={14} />
            </button>
            <span style={{ minWidth: '35px', textAlign: 'center', fontWeight: 'bold', fontSize: '0.9rem', color: 'var(--primary)' }}>
              {transpose > 0 ? `+${transpose}` : transpose}
            </span>
            <button className="icon-btn" onClick={() => setTranspose(prev => prev + 1)} style={{ padding: '6px' }} title="Aumentar Meio Tom">
              <ChevronUp size={14} />
            </button>
            {transpose !== 0 && (
              <button className="icon-btn" onClick={() => setTranspose(0)} style={{ padding: '6px', color: 'var(--text-muted)' }} title="Restaurar Tom Original">
                <RotateCcw size={12} />
              </button>
            )}
          </div>

          {/* Tamanho da Fonte */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', borderRight: '1px solid var(--glass-border)', paddingRight: '1rem' }}>
            <Type size={14} style={{ color: 'var(--text-muted)', marginRight: '0.25rem' }} />
            <button className="icon-btn" onClick={() => setFontSize(prev => Math.max(10, prev - 1))} style={{ padding: '6px' }}>-</button>
            <span style={{ fontSize: '0.8rem', fontWeight: 'bold', minWidth: '30px', textAlign: 'center' }}>{fontSize}px</span>
            <button className="icon-btn" onClick={() => setFontSize(prev => Math.min(24, prev + 1))} style={{ padding: '6px' }}>+</button>
          </div>

          {/* Tela Cheia */}
          <div style={{ display: 'flex', alignItems: 'center', borderRight: '1px solid var(--glass-border)', paddingRight: '1rem' }}>
            <button
              className="icon-btn"
              onClick={() => setIsFullScreen(prev => !prev)}
              style={{
                padding: '6px',
                color: isFullScreen ? 'var(--primary)' : 'var(--text-main)',
                background: isFullScreen ? 'rgba(99, 102, 241, 0.1)' : 'transparent',
                borderColor: isFullScreen ? 'var(--primary)' : 'var(--glass-border)'
              }}
              title={isFullScreen ? 'Sair de Tela Cheia' : 'Tela Cheia'}
            >
              {isFullScreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </button>
          </div>

          {/* Auto-Scroll */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <button
              className="btn-primary"
              onClick={() => setAutoScrollSpeed(prev => prev > 0 ? 0 : savedSpeed)}
              style={{
                padding: '0.4rem 1rem',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                fontSize: '0.8rem',
                background: autoScrollSpeed > 0 ? 'var(--success)' : 'var(--primary)'
              }}
            >
              {autoScrollSpeed > 0 ? <Pause size={14} /> : <Play size={14} />}
              <span className="hide-mobile">{autoScrollSpeed > 0 ? 'Pausar Rolagem' : 'Rolar Tela'}</span>
            </button>
            
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>VEL:</span>
              <input
                type="range"
                min="1"
                max="10"
                value={autoScrollSpeed > 0 ? autoScrollSpeed : savedSpeed}
                onChange={e => {
                  const val = parseInt(e.target.value);
                  setSavedSpeed(val);
                  if (autoScrollSpeed > 0) {
                    setAutoScrollSpeed(val);
                  }
                }}
                style={{ width: '80px', accentColor: 'var(--primary)' }}
              />
              <span style={{ fontSize: '0.8rem', fontWeight: 'bold', width: '20px', textAlign: 'center' }}>
                {autoScrollSpeed > 0 ? autoScrollSpeed : savedSpeed}
              </span>
            </div>
          </div>

        </div>
      </div>

      {/* ── Main Sheet Body ── */}
      <div className="cifra-layout-grid hide-mobile">
        
        {/* Core Sheet Content */}
        <div
          ref={scrollRef}
          className="glass-card cifra-sheet-card"
          style={{
            scrollBehavior: autoScrollSpeed > 0 ? 'auto' : 'smooth'
          }}
          onMouseOver={handleMouseOver}
          onMouseOut={handleMouseOut}
          onClick={handleChordClick}
        >
          {processedLines.map((line, idx) => renderLine(line, idx))}
        </div>

        {/* Right Sidebar Chord Diagrams */}
        <div className="cifra-sidebar-card">
          <h3 style={{
            fontSize: '0.8rem',
            fontWeight: 800,
            color: 'var(--text-muted)',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            margin: '0 0 0.5rem 0'
          }}>
            Acordes da Música
          </h3>
          {uniqueChords.length === 0 ? (
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Nenhum acorde detectado.</span>
          ) : (
            uniqueChords.map(c => {
              const chordKey = c.toUpperCase();
              const details = customChords[instrument]?.[chordKey] || DEFAULT_CHORDS[instrument]?.[chordKey];
              const variations = details ? (Array.isArray(details) ? details : [details]) : [];

              return (
                <div key={`diagram-${c}`}>
                  {variations.length > 0 ? (
                    <ChordDiagramWithVariations
                      name={c}
                      instrument={instrument}
                      variations={variations}
                    />
                  ) : (
                    // Desenho vazio se não cadastrado
                    <div style={{
                      padding: '1rem',
                      border: '1px dashed var(--glass-border)',
                      borderRadius: '12px',
                      textAlign: 'center',
                      fontSize: '0.75rem',
                      color: 'var(--text-muted)'
                    }}>
                      <Music size={16} style={{ margin: '0 auto 0.5rem' }} />
                      Acorde <b>{c}</b> sem diagrama.
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

      </div>

      {/* ── Mobile Layout (Stacked) ── */}
      <div className="mobile-only" style={{ display: 'none', flexDirection: 'column', gap: '1rem' }}>
        <div 
          ref={mobileScrollRef}
          className="glass-card" 
          style={{ 
            padding: '1.5rem', 
            fontFamily: 'monospace', 
            overflowX: 'auto',
            scrollBehavior: autoScrollSpeed > 0 ? 'auto' : 'smooth'
          }}
          onMouseOver={handleMouseOver}
          onMouseOut={handleMouseOut}
          onClick={handleChordClick}
        >
          {processedLines.map((line, idx) => renderLine(line, idx))}
        </div>

        {/* Mobile Chord Diagrams */}
        <div className="glass-card" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <h3 style={{
            fontSize: '0.8rem',
            fontWeight: 800,
            color: 'var(--text-muted)',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            margin: 0
          }}>
            Acordes da Música
          </h3>
          <div style={{ display: 'flex', gap: '1rem', overflowX: 'auto', paddingBottom: '0.5rem' }}>
            {uniqueChords.length === 0 ? (
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Nenhum acorde detectado.</span>
            ) : (
              uniqueChords.map(c => {
                const chordKey = c.toUpperCase();
                const details = customChords[instrument]?.[chordKey] || DEFAULT_CHORDS[instrument]?.[chordKey];
                const variations = details ? (Array.isArray(details) ? details : [details]) : [];

                return (
                  <div key={`mobile-diagram-${c}`} style={{ flexShrink: 0 }}>
                    {variations.length > 0 ? (
                      <ChordDiagramWithVariations
                        name={c}
                        instrument={instrument}
                        variations={variations}
                      />
                    ) : (
                      <div style={{
                        padding: '1rem',
                        border: '1px dashed var(--glass-border)',
                        borderRadius: '12px',
                        textAlign: 'center',
                        fontSize: '0.75rem',
                        color: 'var(--text-muted)',
                        minWidth: '120px'
                      }}>
                        <Music size={16} style={{ margin: '0 auto 0.5rem' }} />
                        <b>{c}</b>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Floating Scroll Controls */}
      <div 
        className="cifra-floating-scroll"
        style={{
          position: 'fixed',
          bottom: '2rem',
          right: '2rem',
          zIndex: 1090,
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          padding: '0.75rem 1rem',
          background: 'rgba(30, 41, 59, 0.75)',
          backdropFilter: 'blur(12px)',
          border: '1px solid var(--glass-border, rgba(255, 255, 255, 0.1))',
          borderRadius: '9999px',
          boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.3), 0 8px 10px -6px rgba(0, 0, 0, 0.3)'
        }}
      >
        <button
          onClick={() => setAutoScrollSpeed(prev => prev > 0 ? 0 : savedSpeed)}
          style={{
            width: '36px',
            height: '36px',
            borderRadius: '50%',
            border: 'none',
            background: autoScrollSpeed > 0 ? 'var(--success, #10b981)' : 'var(--primary, #6366f1)',
            color: 'white',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)',
            transition: 'background 0.2s'
          }}
          title={autoScrollSpeed > 0 ? 'Pausar Rolagem' : 'Iniciar Rolagem'}
        >
          {autoScrollSpeed > 0 ? <Pause size={18} /> : <Play size={18} />}
        </button>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', borderLeft: '1px solid rgba(255,255,255,0.15)', paddingLeft: '0.75rem' }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted, rgba(255,255,255,0.6))' }}>VEL:</span>
          <input
            type="range"
            min="1"
            max="10"
            value={autoScrollSpeed > 0 ? autoScrollSpeed : savedSpeed}
            onChange={e => {
              const val = parseInt(e.target.value);
              setSavedSpeed(val);
              if (autoScrollSpeed > 0) {
                setAutoScrollSpeed(val);
              }
            }}
            style={{ width: '80px', accentColor: 'var(--primary, #6366f1)', cursor: 'pointer' }}
          />
          <span style={{ fontSize: '0.8rem', fontWeight: 'bold', color: 'var(--text-main, white)', width: '15px', textAlign: 'center' }}>
            {autoScrollSpeed > 0 ? autoScrollSpeed : savedSpeed}
          </span>
        </div>
      {/* ── Hover/Click Floating Chord Tooltip (Cifra Club style) ── */}
      {activeTooltip && createPortal(
        <div
          style={{
            position: 'fixed',
            top: `${activeTooltip.rect.top - 10}px`,
            left: `${activeTooltip.rect.left + activeTooltip.rect.width / 2}px`,
            transform: 'translate(-50%, -100%)',
            zIndex: 99999,
            background: 'var(--bg-card, #1e293b)',
            border: '1px solid var(--glass-border, rgba(255,255,255,0.08))',
            borderRadius: '12px',
            padding: '0.75rem',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.5)',
            minWidth: '130px',
            pointerEvents: 'auto',
          }}
          onMouseEnter={handleTooltipMouseEnter}
          onMouseLeave={handleTooltipMouseLeave}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Arrow */}
          <div style={{
            position: 'absolute',
            bottom: '0',
            left: '50%',
            transform: 'translate(-50%, 50%) rotate(45deg)',
            width: '8px',
            height: '8px',
            background: 'var(--bg-card, #1e293b)',
            borderRight: '1px solid var(--glass-border, rgba(255,255,255,0.08))',
            borderBottom: '1px solid var(--glass-border, rgba(255,255,255,0.08))',
          }} />
          {(() => {
            const chordKey = activeTooltip.chord.toUpperCase();
            const details = customChords[instrument]?.[chordKey] || DEFAULT_CHORDS[instrument]?.[chordKey];
            const variations = details ? (Array.isArray(details) ? details : [details]) : [];
            return (
              <div style={{ position: 'relative', zIndex: 1 }}>
                {variations.length > 0 ? (
                  <ChordDiagramWithVariations
                    name={activeTooltip.chord}
                    instrument={instrument}
                    variations={variations}
                  />
                ) : (
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'center', padding: '0.5rem 0' }}>
                    Sem diagrama
                  </div>
                )}
              </div>
            );
          })()}
        </div>,
        document.body
      )}

      </div>

    </div>
    </>
  );
}
