import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import AddressInput from './AddressInput';
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key) => key, i18n: { resolvedLanguage: 'en' } }) }));
beforeEach(() => { vi.useFakeTimers(); vi.stubGlobal('fetch', vi.fn()); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
const mount = (props = {}) => {
  const onChange = vi.fn();
  const view = render(<AddressInput id="address" value="" allowFreeText onChange={onChange} {...props} />);
  return { ...view, onChange, input: screen.getByRole('combobox') };
};
const waitSearch = () => act(async () => { await vi.advanceTimersByTimeAsync(1000); });
describe('shared address search', () => {
  it('persists manual text immediately even if the provider is unavailable', async () => {
    fetch.mockRejectedValue(new Error('offline'));
    const { input, onChange } = mount();
    fireEvent.change(input, { target: { value: 'Manual address, 42' } });
    expect(onChange).toHaveBeenLastCalledWith('Manual address, 42', null);
    await waitSearch();
    expect(input).toHaveValue('Manual address, 42');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });
  it('cancels a pending lookup when cleared and never restores stale results', async () => {
    let resolve;
    fetch.mockImplementation(() => new Promise((r) => { resolve = r; }));
    const { input, onChange } = mount();
    fireEvent.change(input, { target: { value: 'Old address' } });
    await waitSearch();
    const signal = fetch.mock.calls[0][1].signal;
    fireEvent.change(input, { target: { value: '' } });
    expect(signal.aborted).toBe(true);
    await act(async () => { resolve({ ok: true, json: async () => [{ display_name: 'Stale', lon: '1', lat: '2' }] }); });
    expect(onChange).toHaveBeenLastCalledWith('', null);
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });
  it('uses the active language and supports choosing a result with the keyboard and adding a number', async () => {
    fetch.mockResolvedValue({ ok: true, json: async () => [{ display_name: 'Test street', lon: '1', lat: '2' }] });
    const { input, onChange } = mount();
    fireEvent.change(input, { target: { value: 'Test' } });
    await waitSearch();
    const url = new URL(fetch.mock.calls[0][0]);
    expect(url.hostname).toBe('nominatim.openstreetmap.org');
    expect(url.searchParams.get('accept-language')).toBe('en');
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).toHaveBeenLastCalledWith('Test street', [1, 2]);
    fireEvent.change(screen.getByLabelText('trips.address_complement'), { target: { value: '12, suite 3' } });
    expect(onChange).toHaveBeenLastCalledWith('12, suite 3, Test street', [1, 2]);
  });
  it('preserves the existing selection-only contract used by trips', () => {
    const { input, onChange } = mount({ allowFreeText: false });
    fireEvent.change(input, { target: { value: 'Unselected address' } });
    expect(onChange).not.toHaveBeenCalled();
  });
});
