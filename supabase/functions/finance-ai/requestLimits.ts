export class RequestLimitError extends Error {}

export async function readFelixBody(req: Request, maxBytes = 65536): Promise<unknown> {
  if (Number(req.headers.get('content-length')) > maxBytes) throw new RequestLimitError('payload_too_large');
  const reader = req.body?.getReader();
  if (!reader) throw new RequestLimitError('empty_body');
  const decoder = new TextDecoder();
  let size = 0;
  let text = '';
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new RequestLimitError('payload_too_large');
      }
      text += decoder.decode(value, { stream: true });
    }
    return JSON.parse(text + decoder.decode());
  } finally { reader.releaseLock(); }
}

export function validFelixPayload(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const p = value as { messages?: unknown; context?: { accounts?: unknown; categories?: unknown; language?: unknown } };
  if (!Array.isArray(p.messages) || p.messages.length < 1 || p.messages.length > 40) return false;
  let chars = 0;
  for (const m of p.messages) {
    if (!m || !['user', 'assistant'].includes(m.role) || typeof m.content !== 'string' || !m.content.trim() || m.content.length > 8000) return false;
    chars += m.content.length;
  }
  if (chars > 48000) return false;
  if (p.context !== undefined && (!p.context || typeof p.context !== 'object' || Array.isArray(p.context))) return false;
  for (const list of [p.context?.accounts, p.context?.categories]) {
    if (list !== undefined && (!Array.isArray(list) || list.length > 500 || list.some((r) => !r || typeof r.id !== 'string' || typeof r.name !== 'string' || r.name.length > 200))) return false;
  }
  return true;
}
