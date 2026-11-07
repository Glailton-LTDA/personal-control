import { beforeEach, describe, expect, it, vi } from 'vitest';
import pt from '../locales/health-pt.json';
import en from '../locales/health-en.json';
import es from '../locales/health-es.json';

const { fetchMock } = vi.hoisted(() => ({ fetchMock: vi.fn() }));
vi.mock('./supabase', async () => {
  const { createClient } = await import('@supabase/supabase-js');
  return {
    supabase: createClient('https://health.test', 'test-key', {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: fetchMock },
    }),
  };
});
import {
  deleteHealth,
  downloadHealth,
  getHealth,
  listHealth,
  saveHealth,
  snoozeHealth,
  uploadHealth,
} from './health';

const OWNER = '11111111-1111-4111-8111-111111111111';
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
beforeEach(() => {
  fetchMock.mockReset();
});

describe('medical guide data boundary', () => {
  it('requests only a bounded page with an owner filter and summary fields', async () => {
    fetchMock.mockResolvedValueOnce(
      json(Array.from({ length: 21 }, (_, id) => ({ id }))),
    );
    const result = await listHealth(OWNER, 'exams', { page: 2 });
    const url = new URL(fetchMock.mock.calls[0][0]);
    expect(url.searchParams.get('user_id')).toBe(`eq.${OWNER}`);
    expect(url.searchParams.get('offset')).toBe('40');
    expect(url.searchParams.get('limit')).toBe('21');
    expect(url.searchParams.get('select')).not.toMatch(
      /\*|report|notes|preparation/,
    );
    expect(result.rows).toHaveLength(20);
    expect(result.hasNext).toBe(true);
  });
  it('loads the report only in an owner-scoped detail request', async () => {
    fetchMock.mockResolvedValueOnce(json({ id: 'exam', report: 'private' }));
    await getHealth(OWNER, 'exams', 'exam');
    const url = new URL(fetchMock.mock.calls[0][0]);
    expect(url.searchParams.get('user_id')).toBe(`eq.${OWNER}`);
    expect(url.searchParams.get('id')).toBe('eq.exam');
    expect(url.searchParams.get('select')).toContain('report');
    expect(url.searchParams.get('select')).not.toContain('*');
  });
  it('cannot replace the owner or inject unexpected columns through a form', async () => {
    fetchMock.mockResolvedValueOnce(json({ id: 'new' }));
    await saveHealth(OWNER, 'conditions', {
      name: 'Example',
      user_id: 'attacker',
      id: 'forged',
      delivered_at: 'forged',
    });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      name: 'Example',
      user_id: OWNER,
    });
  });
  it('scopes update and delete to the owner as well as the record id', async () => {
    fetchMock.mockImplementation(async () => json({ id: 'record' }));
    await saveHealth(OWNER, 'conditions', { name: 'Changed' }, 'record');
    await deleteHealth(OWNER, 'conditions', 'record');
    for (const [request] of fetchMock.mock.calls) {
      const url = new URL(request);
      expect(url.searchParams.get('user_id')).toBe(`eq.${OWNER}`);
      expect(url.searchParams.get('id')).toBe('eq.record');
      expect(url.searchParams.get('select')).toBe('id');
    }
  });
  it('snoozes only the reminder without changing scheduled time', async () => {
    fetchMock.mockResolvedValueOnce(json({ id: 'reminder' }));
    await snoozeHealth(OWNER, 'reminder');
    expect(Object.keys(JSON.parse(fetchMock.mock.calls[0][1].body))).toEqual([
      'remind_at',
    ]);
  });
  it('does not bring a future reminder forward when snoozing', async () => {
    fetchMock.mockResolvedValueOnce(json({ id: 'reminder' }));
    const future = new Date(Date.now() + 86400000).toISOString();
    await snoozeHealth(OWNER, 'reminder', 10, future);
    const value = JSON.parse(fetchMock.mock.calls[0][1].body).remind_at;
    expect(new Date(value).getTime()).toBe(new Date(future).getTime() + 600000);
  });
  it('searches by indexed prefix bounds without wildcard or OR interpolation', async () => {
    fetchMock.mockResolvedValueOnce(json([]));
    await listHealth(OWNER, 'exams', { search: ' HEMO ' });
    const url = new URL(fetchMock.mock.calls[0][0]);
    expect(url.searchParams.getAll('name_search')).toEqual([
      'gte.hemo',
      'lt.hemp',
    ]);
    expect(url.searchParams.has('or')).toBe(false);
    expect(url.searchParams.get('order')).toBe('name_search.asc,id.asc');
  });
  it('fails closed when there is no authenticated owner or a read is denied', async () => {
    await expect(listHealth(null, 'conditions')).rejects.toThrow(
      'health_auth_required',
    );
    expect(fetchMock).not.toHaveBeenCalled();
    fetchMock.mockResolvedValueOnce(
      json({ message: 'Forbidden', code: '42501' }, 403),
    );
    await expect(listHealth(OWNER, 'conditions')).rejects.toMatchObject({
      code: '42501',
    });
  });
  it('rejects unsupported uploads before writing metadata', async () => {
    await expect(
      uploadHealth(
        OWNER,
        new File(['<script>'], 'test.html', { type: 'text/html' }),
        'other',
      ),
    ).rejects.toThrow('health_invalid_file');
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('rolls back metadata when a private upload fails', async () => {
    fetchMock
      .mockResolvedValueOnce(json(null, 201))
      .mockResolvedValueOnce(json({ message: 'Upload denied' }, 403))
      .mockResolvedValueOnce(json(null));
    await expect(
      uploadHealth(
        OWNER,
        new File(['%PDF-'], 'report.pdf', { type: 'application/pdf' }),
        'report',
      ),
    ).rejects.toBeTruthy();
    expect(fetchMock.mock.calls.at(-1)[1].method).toBe('DELETE');
    expect(
      new URL(fetchMock.mock.calls.at(-1)[0]).searchParams.get('user_id'),
    ).toBe(`eq.${OWNER}`);
  });
  it('downloads through the authenticated storage endpoint, without a public or signed URL', async () => {
    fetchMock
      .mockResolvedValueOnce(
        json({
          id: 'doc',
          name: 'Report.pdf',
          storage_path: `${OWNER}/doc.pdf`,
        }),
      )
      .mockResolvedValueOnce(
        new Response('%PDF-', {
          headers: { 'content-type': 'application/pdf' },
        }),
      );
    const result = await downloadHealth(OWNER, 'doc');
    expect(fetchMock.mock.calls[1][0]).toContain(
      `/storage/v1/object/health-documents/${OWNER}/doc.pdf`,
    );
    expect(
      new Headers(fetchMock.mock.calls[1][1].headers).get('Authorization'),
    ).toBe('Bearer test-key');
    expect(await result.blob.text()).toBe('%PDF-');
    expect(
      fetchMock.mock.calls.some(([url]) =>
        /\/public\/|\/sign\//.test(String(url)),
      ),
    ).toBe(false);
  });
  it('has every medical guide and navigation key in all three supported languages', () => {
    for (const resource of [en, es]) {
      expect(Object.keys(resource.health).sort()).toEqual(
        Object.keys(pt.health).sort(),
      );
      expect(Object.keys(resource.nav.sub.health).sort()).toEqual(
        Object.keys(pt.nav.sub.health).sort(),
      );
      expect(
        Object.values(resource.health).every(
          (value) => typeof value === 'string' && value.trim(),
        ),
      ).toBe(true);
    }
  });
});
