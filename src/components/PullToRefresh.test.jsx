import React from 'react';
import { render, fireEvent, cleanup } from '@testing-library/react';
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import PullToRefresh from './PullToRefresh';

let reload;
const touch = (target, kind, x, y) => fireEvent[kind](target, {
  touches: kind === 'touchEnd' || kind === 'touchCancel' ? [] : [{ clientX: x, clientY: y }],
});

beforeEach(() => {
  vi.useFakeTimers();
  Object.defineProperty(navigator, 'standalone', { configurable: true, value: true });
  Object.defineProperty(window, 'scrollY', { configurable: true, value: 0 });
  reload = vi.spyOn(window.location, 'reload').mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('PullToRefresh', () => {
  it('um toque após arrastar não reutiliza a distância anterior', () => {
    render(<PullToRefresh />);
    touch(document.body, 'touchStart', 10, 500);
    touch(document.body, 'touchMove', 10, 540); // insuficiente para atualizar
    touch(document.body, 'touchEnd');
    touch(document.body, 'touchStart', 10, 100);
    touch(document.body, 'touchEnd');
    vi.advanceTimersByTime(1000);
    expect(reload).not.toHaveBeenCalled();
  });

  it('mantém o gesto intencional de puxar para atualizar', () => {
    render(<PullToRefresh />);
    touch(document.body, 'touchStart', 10, 100);
    touch(document.body, 'touchMove', 10, 190);
    touch(document.body, 'touchEnd');
    vi.advanceTimersByTime(800);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('não atualiza ao interagir com uma aba', () => {
    const { getByRole } = render(<><PullToRefresh /><button role="tab"><span>Resumo</span></button></>);
    const label = getByRole('tab').firstChild;
    touch(label, 'touchStart', 10, 100);
    touch(label, 'touchMove', 10, 200);
    touch(label, 'touchEnd');
    vi.advanceTimersByTime(1000);
    expect(reload).not.toHaveBeenCalled();
  });

  it.each(['dialog', 'aria-modal'])('não recarrega ao arrastar conteúdo de um modal: %s', (kind) => {
    const { getByText } = render(<><PullToRefresh /><section
      role={kind === 'dialog' ? 'dialog' : undefined}
      aria-modal={kind === 'aria-modal' ? 'true' : undefined}
    ><p>Listas de outras viagens</p></section></>);
    const content = getByText('Listas de outras viagens');
    touch(content, 'touchStart', 10, 100);
    touch(content, 'touchMove', 10, 200);
    touch(content, 'touchEnd');
    vi.advanceTimersByTime(1000);
    expect(reload).not.toHaveBeenCalled();
  });

  it.each(['touchCancel', 'horizontal', 'unmount'])('cancela o reload: %s', (kind) => {
    const { unmount } = render(<PullToRefresh />);
    touch(document.body, 'touchStart', 10, 100);
    touch(document.body, 'touchMove', 10, 190);
    if (kind === 'touchCancel') touch(document.body, 'touchCancel');
    if (kind === 'horizontal') touch(document.body, 'touchMove', 300, 190);
    touch(document.body, 'touchEnd');
    if (kind === 'unmount') unmount();
    vi.advanceTimersByTime(1000);
    expect(reload).not.toHaveBeenCalled();
  });
});
