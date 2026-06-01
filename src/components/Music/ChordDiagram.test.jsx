import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';
import ChordDiagram from './ChordDiagram';

describe('ChordDiagram Component', () => {
  it('renders chord name correctly', () => {
    const { getByText } = render(<ChordDiagram name="C9" />);
    expect(getByText('C9')).toBeDefined();
  });

  it('renders SVG element with correct dimension and lines', () => {
    const { container } = render(<ChordDiagram name="C" stringsCount={4} />);
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    
    // Check that there are lines drawn
    const lines = svg.querySelectorAll('line');
    expect(lines.length).toBeGreaterThan(0);
  });

  it('renders fret numbers when startFret is greater than 1', () => {
    const { getByText } = render(
      <ChordDiagram name="D#" stringsCount={6} frets={[-1, 6, 8, 8, 8, 6]} startFret={6} />
    );
    // Should display the 6th fret index label
    expect(getByText('6ª')).toBeDefined();
  });
});
