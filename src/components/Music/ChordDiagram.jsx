import React from 'react';

/**
 * Componente que renderiza um diagrama de acordes em SVG para violão (6 cordas),
 * ukulele/cavaquinho/bandolim (4 cordas).
 * 
 * Propriedades:
 * - name: Nome do acorde (ex: "C", "D9/F#")
 * - stringsCount: Número de cordas (4 ou 6)
 * - frets: Array de trastes por corda, de cima para baixo ou da esquerda para direita
 *          (ex: [-1, 3, 2, 0, 1, 0] para dó maior no violão. -1 = X (abafado), 0 = Solta)
 * - fingers: Array correspondente de dedos (1 a 4, ou 0 para livre)
 * - startFret: O traste de início do diagrama (padrão: 1)
 */
export default function ChordDiagram({
  name = 'C',
  stringsCount = 6,
  frets = [0, 0, 0, 3], // Default para C no Ukulele
  fingers = [0, 0, 0, 1],
  startFret = 1,
  instrument = 'violão'
}) {
  const width = 150;
  const topMargin = 48; // Aumentado para acomodar as notas soltas no topo
  const bottomMargin = 20; // Reduzido de volta para o padrão
  const leftMargin = 30;
  const rightMargin = 30;
  
  const gridWidth = width - leftMargin - rightMargin;
  
  // Calcula a maior casa pressionada para definir a escala do diagrama
  const maxFretValue = Math.max(...frets.filter(f => f > 0), 1);
  const span = maxFretValue - startFret + 1;
  const fretsInGrid = Math.max(5, span); // Mostra no mínimo 5 trastes, mas expande se necessário
  
  const ySpacing = 24; // Espaçamento fixo por traste para manter escala consistente
  const gridHeight = fretsInGrid * ySpacing;
  const height = topMargin + gridHeight + bottomMargin;
  
  const strings = stringsCount;
  const xSpacing = gridWidth / (strings - 1);

  // Procura por uma possível pestana (barre)
  // Ocorre se uma casa F (F > 0) tiver pelo menos 2 cordas pressionadas nessa casa,
  // e nenhuma corda intermediária for solta (0) ou estiver em uma casa menor do que F.
  let barreFret = null;
  let barreStartString = -1;
  let barreEndString = -1;

  const fretCounts = {};
  frets.forEach(f => {
    if (f > 0) {
      fretCounts[f] = (fretCounts[f] || 0) + 1;
    }
  });

  const candidateFrets = Object.keys(fretCounts)
    .map(Number)
    .filter(f => fretCounts[f] >= 2)
    .sort((a, b) => a - b);

  for (const f of candidateFrets) {
    const stringIndices = [];
    frets.forEach((fretVal, idx) => {
      if (fretVal === f) {
        stringIndices.push(idx);
      }
    });

    if (stringIndices.length >= 2) {
      const start = stringIndices[0];
      const end = stringIndices[stringIndices.length - 1];

      // A pestana deve abranger pelo menos 3 cordas
      if (end - start + 1 >= 3) {
        let isValidBarre = true;
        for (let i = start; i <= end; i++) {
          const fretVal = frets[i];
          if (stringsCount === 4) {
            // Para instrumentos de 4 cordas (ukulele/cavaquinho),
            // todas as cordas no intervalo devem ter o traste exatamente igual a f (ou -1 se abafada)
            if (fretVal !== f && fretVal !== -1) {
              isValidBarre = false;
              break;
            }
          } else {
            // Para violão, as cordas intermediárias devem ser >= f ou -1
            if (fretVal === 0 || (fretVal > 0 && fretVal < f)) {
              isValidBarre = false;
              break;
            }
          }
        }
        if (isValidBarre) {
          barreFret = f;
          barreStartString = start;
          barreEndString = end;
          break; // Encontramos a pestana (menor traste elegível)
        }
      }
    }
  }

  // Mapeamento de afinações padrão (grave para agudo / esquerda para direita no diagrama)
  const tuningNotes = {
    'violão': ['E', 'A', 'D', 'G', 'B', 'E'],
    'violao': ['E', 'A', 'D', 'G', 'B', 'E'],
    'cavaquinho': ['D', 'G', 'B', 'D'],
    'ukulele': ['G', 'C', 'E', 'A'],
    'bandolim': ['G', 'D', 'A', 'E']
  };

  const getTuning = () => {
    const nameNorm = String(instrument || '').toLowerCase().trim();
    if (tuningNotes[nameNorm]) return tuningNotes[nameNorm];
    if (stringsCount === 4) return tuningNotes['cavaquinho']; // Cavaquinho/Ukulele padrão para 4 cordas
    return tuningNotes['violão']; // Violão padrão para 6 cordas
  };

  const tuning = getTuning();

  // Renderiza marcadores no topo da corda (X ou O)
  const renderStringHeader = (fret, index) => {
    const x = leftMargin + index * xSpacing;
    const y = topMargin - 10;
    
    if (fret === -1) {
      // Abafada (X)
      return (
        <g key={`header-${index}`} style={{ stroke: 'var(--danger)', strokeWidth: 2 }}>
          <line x1={x - 4} y1={y - 4} x2={x + 4} y2={y + 4} />
          <line x1={x + 4} y1={y - 4} x2={x - 4} y2={y + 4} />
        </g>
      );
    } else if (fret === 0) {
      // Solta (O)
      return (
        <circle
          key={`header-${index}`}
          cx={x}
          cy={y}
          r={4}
          fill="none"
          stroke="var(--text-muted)"
          strokeWidth={1.5}
        />
      );
    }
    return null;
  };

  // Renderiza a barra de pestana (barre)
  const renderBarre = () => {
    if (barreFret === null) return null;

    const relativeFret = barreFret - startFret + 1;
    if (relativeFret < 1 || relativeFret > fretsInGrid) return null;

    const x1 = leftMargin + barreStartString * xSpacing;
    const x2 = leftMargin + barreEndString * xSpacing;
    const cy = topMargin + (relativeFret - 0.5) * ySpacing;

    return (
      <rect
        key="barre-rect"
        x={x1 - 9}
        y={cy - 9}
        width={x2 - x1 + 18}
        height={18}
        rx={9}
        ry={9}
        fill="var(--primary)"
        stroke="var(--bg-canvas)"
        strokeWidth={1.5}
        style={{ filter: 'drop-shadow(0px 2px 4px rgba(99, 102, 241, 0.3))' }}
      />
    );
  };

  // Renderiza os pontos das notas pressionadas (bolinhas com números de dedos)
  const renderNotes = () => {
    return frets.map((fret, stringIdx) => {
      if (fret <= 0) return null;
      
      const relativeFret = fret - startFret + 1;
      if (relativeFret < 1 || relativeFret > fretsInGrid) return null;
      
      const cx = leftMargin + stringIdx * xSpacing;
      const cy = topMargin + (relativeFret - 0.5) * ySpacing;
      const finger = fingers[stringIdx];

      // Se esta nota faz parte de uma pestana
      if (barreFret !== null && fret === barreFret && stringIdx >= barreStartString && stringIdx <= barreEndString) {
        // Desenhamos o dedo apenas na primeira corda da pestana
        if (stringIdx === barreStartString) {
          const fingerLabel = fingers[stringIdx] || 1;
          return (
            <g key={`barre-finger-${stringIdx}`}>
              <text
                x={cx}
                y={cy + 3.5}
                textAnchor="middle"
                fontSize="10"
                fontWeight="bold"
                fill="white"
              >
                {fingerLabel}
              </text>
            </g>
          );
        }
        return null; // Omitir círculos individuais dentro da pestana
      }
      
      return (
        <g key={`note-${stringIdx}`}>
          <circle
            cx={cx}
            cy={cy}
            r={9}
            fill="var(--primary)"
            stroke="var(--bg-canvas)"
            strokeWidth={1.5}
            style={{ filter: 'drop-shadow(0px 2px 4px rgba(99, 102, 241, 0.3))' }}
          />
          {finger > 0 && (
            <text
              x={cx}
              y={cy + 3.5}
              textAnchor="middle"
              fontSize="10"
              fontWeight="bold"
              fill="white"
            >
              {finger}
            </text>
          )}
        </g>
      );
    });
  };

  return (
    <div className="chord-diagram-container" style={{
      width: `${width}px`,
      background: 'rgba(255,255,255,0.02)',
      borderRadius: '16px',
      border: '1px solid var(--glass-border)',
      padding: '0.5rem',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      boxShadow: 'var(--shadow)',
      position: 'relative'
    }}>
      {/* Nome do Acorde */}
      <div style={{
        fontSize: '1.2rem',
        fontWeight: 800,
        color: 'var(--text-main)',
        marginBottom: '0.2rem',
        letterSpacing: '0.02em',
        fontFamily: 'monospace'
      }}>
        {name}
      </div>

      <svg width={width} height={height} style={{ overflow: 'visible' }}>
        {/* Nut (Pestana do topo) se startFret for 1 */}
        {startFret === 1 ? (
          <line
            x1={leftMargin}
            y1={topMargin}
            x2={width - rightMargin}
            y2={topMargin}
            stroke="var(--text-main)"
            strokeWidth={4}
          />
        ) : (
          // Linha de traste normal no topo se for transposto
          <line
            x1={leftMargin}
            y1={topMargin}
            x2={width - rightMargin}
            y2={topMargin}
            stroke="var(--text-muted)"
            strokeWidth={1.5}
          />
        )}

        {/* Linhas de Trastes (Horizontais) */}
        {Array.from({ length: fretsInGrid }).map((_, idx) => {
          const y = topMargin + (idx + 1) * ySpacing;
          return (
            <line
              key={`fret-line-${idx}`}
              x1={leftMargin}
              y1={y}
              x2={width - rightMargin}
              y2={y}
              stroke="var(--glass-border)"
              strokeWidth={1.5}
            />
          );
        })}

        {/* Linhas de Cordas (Verticais) */}
        {Array.from({ length: strings }).map((_, idx) => {
          const x = leftMargin + idx * xSpacing;
          return (
            <line
              key={`string-line-${idx}`}
              x1={x}
              y1={topMargin}
              x2={x}
              y2={topMargin + gridHeight}
              stroke="var(--text-muted)"
              strokeWidth={1.5}
            />
          );
        })}

        {/* Indicador de Traste Inicial (ex: "3ª" se começar no traste 3, e sempre mostrando de 1ª em diante) */}
        {startFret >= 1 && (
          <text
            x={leftMargin - 10}
            y={topMargin + ySpacing / 2 + 4}
            textAnchor="end"
            fontSize="10.5"
            fontWeight="800"
            fill="var(--primary)"
          >
            {startFret}ª
          </text>
        )}

        {/* Cabeçalho de cordas soltas / abafadas */}
        {frets.map((fret, idx) => renderStringHeader(fret, idx))}

        {/* Pestana (Barre) */}
        {renderBarre()}

        {/* Notas pressionadas */}
        {renderNotes()}

        {/* Notas soltas (afinação) no topo */}
        {tuning && tuning.slice(0, stringsCount).map((note, idx) => {
          const x = leftMargin + idx * xSpacing;
          const y = topMargin - 22;
          return (
            <text
              key={`tuning-note-${idx}`}
              x={x}
              y={y}
              textAnchor="middle"
              fontSize="10.5"
              fontWeight="bold"
              fill="var(--text-muted)"
            >
              {note}
            </text>
          );
        })}
      </svg>
    </div>
  );
}
