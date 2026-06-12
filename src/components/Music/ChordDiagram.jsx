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
  startFret = 1
}) {
  const width = 150;
  const topMargin = 40;
  const bottomMargin = 20;
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

  // Renderiza os pontos das notas pressionadas (bolinhas com números de dedos)
  const renderNotes = () => {
    return frets.map((fret, stringIdx) => {
      if (fret <= 0) return null;
      
      // Fret relativo no diagrama desenhado
      const relativeFret = fret - startFret + 1;
      
      // Se estiver fora do limite visível do diagrama de trastes, não renderiza
      if (relativeFret < 1 || relativeFret > fretsInGrid) return null;
      
      const cx = leftMargin + stringIdx * xSpacing;
      const cy = topMargin + (relativeFret - 0.5) * ySpacing;
      const finger = fingers[stringIdx];
      
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

        {/* Notas pressionadas */}
        {renderNotes()}
      </svg>
    </div>
  );
}
