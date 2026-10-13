// supabase/functions/finance-ai/index.ts
// -------------------------------------------------------------
// Fase 8 — Assistente Felix (Personal Control)
// Chat com function calling no Gemini (mesmo padrão/secret da
// baby-ai-insights do projeto babylog: GEMINI_API_KEY).
// RLS preservada: a função usa o JWT do usuário (anon key +
// Authorization header) — nunca service role.
// Tools: buscar_lancamentos, resumo_mes, criar_lancamento,
// efetivar_lancamento.
// -------------------------------------------------------------
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

interface ContextAccount {
  id: string
  name: string
  type?: string
  currency?: string
}

interface ContextCategory {
  id: string
  name: string
  parent_id?: string | null
}

interface FelixContext {
  language?: string
  accounts?: ContextAccount[]
  categories?: ContextCategory[]
}

interface RequestPayload {
  messages: ChatMessage[]
  context?: FelixContext
}

const GEMINI_MODEL = 'gemini-3.6-flash'
const MAX_TOOL_ROUNDS = 8

// -------------------------------------------------------------
// Declaração das tools (Gemini function calling / JSON Schema)
// -------------------------------------------------------------
const toolDeclarations = [
  {
    name: 'buscar_lancamentos',
    description:
      'Lista lançamentos (receitas e despesas) com filtros opcionais por período, tipo, categoria, status e texto na descrição. Use para perguntas detalhadas e listagens.',
    parameters: {
      type: 'object',
      properties: {
        start_date: { type: 'string', description: 'Data inicial YYYY-MM-DD (inclusiva)' },
        end_date: { type: 'string', description: 'Data final YYYY-MM-DD (inclusiva)' },
        type: { type: 'string', enum: ['RECEITA', 'DESPESA'], description: 'Filtra por tipo' },
        category_id: { type: 'string', description: 'ID da categoria (use o contexto)' },
        status: { type: 'string', enum: ['PENDENTE', 'PAGO'], description: 'Filtra por status' },
        query: { type: 'string', description: 'Texto para buscar na descrição' },
        limit: { type: 'integer', description: 'Máximo de itens (padrão 20, máximo 100)' },
      },
    },
  },
  {
    name: 'resumo_mes',
    description:
      'Resumo financeiro de um mês: receitas, despesas, saldo, pagas/pendentes e ranking de despesas por categoria. Use para "quanto gastei", "como foi meu mês" etc.',
    parameters: {
      type: 'object',
      properties: {
        month: { type: 'string', description: 'Mês no formato YYYY-MM' },
        category_id: { type: 'string', description: 'Restringe o resumo a uma categoria' },
      },
      required: ['month'],
    },
  },
  {
    name: 'criar_lancamento',
    description:
      'Cria um lançamento (receita ou despesa). Use quando o usuário pedir para registrar algo. Se faltar valor, descrição ou data, pergunte antes de chamar.',
    parameters: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['RECEITA', 'DESPESA'] },
        description: { type: 'string', description: 'Descrição do lançamento' },
        amount: { type: 'number', description: 'Valor sempre POSITIVO, ex: 45.9' },
        payment_date: { type: 'string', description: 'YYYY-MM-DD (hoje, se não informado)' },
        status: {
          type: 'string',
          enum: ['PENDENTE', 'PAGO'],
          description: 'Padrão PENDENTE; PAGO quando o usuário disse que já pagou',
        },
        account_id: { type: 'string', description: 'ID da conta (use o contexto)' },
        category_id: { type: 'string', description: 'ID da categoria (use o contexto), se houver' },
      },
      required: ['type', 'description', 'amount', 'payment_date'],
    },
  },
  {
    name: 'efetivar_lancamento',
    description:
      'Marca um lançamento existente como PAGO (efetiva). Use quando o usuário disser que já pagou um lançamento pendente.',
    parameters: {
      type: 'object',
      properties: {
        transaction_id: { type: 'string', description: 'ID do lançamento (mf_transactions.id)' },
      },
      required: ['transaction_id'],
    },
  },
]

// -------------------------------------------------------------
// System prompt (persona + contexto de IDs reais)
// -------------------------------------------------------------
function buildSystemPrompt(context: FelixContext = {}): string {
  const language = context.language || 'pt-BR'
  const accounts = (context.accounts ?? [])
    .map((a) => `- ${a.id}: ${a.name} (${a.type ?? 'CONTA'}${a.currency ? `, ${a.currency}` : ''})`)
    .join('\n') || '- (nenhuma conta cadastrada)'
  const categories = (context.categories ?? [])
    .map((c) => `- ${c.id}: ${c.name}${c.parent_id ? ' (subcategoria)' : ''}`)
    .join('\n') || '- (nenhuma categoria)'

  return `Você é o Felix, o assistente de IA do Personal Control — um gato que cuida das finanças da casa (os gatinhos conferem tudo por você 🐱).

SUA MISSÃO
- Responder perguntas financeiras com precisão usando as ferramentas.
- Criar e efetivar lançamentos quando o usuário pedir.

REGRAS FUNDAMENTAIS
1. Para qualquer valor, total, saldo ou listagem: SEMPRE chame uma ferramenta antes de responder. NUNCA invente números.
2. Se a ferramenta não trouxe o dado, diga que não encontrou — não estime nem aproxime.
3. Formate valores como R$ 1.234,56 (ou a moeda da conta) e datas por extenso quando útil.
4. Responda no idioma solicitado (padrão: ${language}). Seja direto, amigável e um pouco espíritoso — sem exageros.
5. Para criar lançamentos: chame criar_lancamento com dados completos; se faltar valor, descrição ou data, pergunte ao usuário antes.
6. Após criar ou efetivar, confirme o que foi feito (descrição, valor, data, status).
7. Não faça transferências nem altere/apague dados além das ferramentas oferecidas.
8. Não é aconselhamento de investimento; para decisões grandes, sugira pensar com calma.

CONTEXTO DO USUÁRIO (IDs reais — use somente estes)
Contas:
${accounts}

Categorias:
${categories}`
}

// -------------------------------------------------------------
// Execução das tools (com o client do usuário → RLS vale)
// -------------------------------------------------------------
async function runTool(
  client: ReturnType<typeof createClient>,
  name: string,
  args: Record<string, unknown>,
  userId: string,
): Promise<Record<string, unknown>> {
  const r2 = (n: number) => Math.round(n * 100) / 100

  if (name === 'buscar_lancamentos') {
    const limit = Math.min(Number(args.limit) || 20, 100)
    let q = client
      .from('mf_transactions')
      .select(
        'id, type, description, amount, payment_date, status, category:mf_categories(id, name), account:mf_accounts(id, name)',
      )
      .neq('type', 'TRANSFERENCIA')
      .neq('status', 'CANCELADO')
      .order('payment_date', { ascending: false })
      .limit(limit)
    if (args.start_date) q = q.gte('payment_date', String(args.start_date))
    if (args.end_date) q = q.lte('payment_date', String(args.end_date))
    if (args.type) q = q.eq('type', String(args.type))
    if (args.status) q = q.eq('status', String(args.status))
    if (args.category_id) q = q.eq('category_id', String(args.category_id))
    if (args.query) q = q.ilike('description', `%${String(args.query).replace(/[%_\\]/g, ' ')}%`)
    const { data, error } = await q
    if (error) return { erro: error.message }
    return {
      total: (data ?? []).length,
      lancamentos: (data ?? []).map((tx: Record<string, unknown>) => ({
        id: tx.id,
        data: tx.payment_date,
        descricao: tx.description,
        tipo: tx.type,
        valor: Number(tx.amount),
        status: tx.status,
        categoria: (tx.category as { name?: string } | null)?.name ?? null,
        conta: (tx.account as { name?: string } | null)?.name ?? null,
      })),
    }
  }

  if (name === 'resumo_mes') {
    const month = String(args.month ?? '')
    const match = month.match(/^(\d{4})-(\d{2})$/)
    if (!match) return { erro: 'Formato de mês inválido; use YYYY-MM' }
    const year = Number(match[1])
    const monthNum = Number(match[2])
    if (monthNum < 1 || monthNum > 12) return { erro: 'Mês inválido; use YYYY-MM' }
    const lastDay = new Date(Date.UTC(year, monthNum, 0)).getUTCDate()
    const start = `${month}-01`
    const end = `${month}-${String(lastDay).padStart(2, '0')}`

    let q = client
      .from('mf_transactions')
      .select('type, amount, status, category_id, category:mf_categories(name)')
      .neq('type', 'TRANSFERENCIA')
      .neq('status', 'CANCELADO')
      .gte('payment_date', start)
      .lte('payment_date', end)
    if (args.category_id) q = q.eq('category_id', String(args.category_id))
    const { data, error } = await q
    if (error) return { erro: error.message }

    let receitas = 0
    let despesas = 0
    let despesasPagas = 0
    let despesasPendentes = 0
    let receitasPendentes = 0
    const porCategoria = new Map<string, number>()
    for (const tx of (data ?? []) as Array<Record<string, unknown>>) {
      const amount = Math.abs(Number(tx.amount))
      if (tx.type === 'RECEITA') {
        receitas += amount
        if (tx.status !== 'PAGO') receitasPendentes += amount
      } else if (tx.type === 'DESPESA') {
        despesas += amount
        if (tx.status === 'PAGO') despesasPagas += amount
        else despesasPendentes += amount
        const key =
          (tx.category as { name?: string } | null)?.name ?? 'Sem categoria'
        porCategoria.set(key, (porCategoria.get(key) ?? 0) + amount)
      }
    }
    const ranking = [...porCategoria.entries()]
      .map(([categoria, total]) => ({ categoria, total: r2(total) }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10)

    return {
      mes: month,
      receitas: r2(receitas),
      despesas: r2(despesas),
      saldo: r2(receitas - despesas),
      despesas_pagas: r2(despesasPagas),
      despesas_pendentes: r2(despesasPendentes),
      receitas_pendentes: r2(receitasPendentes),
      contagem_lancamentos: (data ?? []).length,
      despesas_por_categoria: ranking,
    }
  }

  if (name === 'criar_lancamento') {
    const type = args.type === 'RECEITA' ? 'RECEITA' : args.type === 'DESPESA' ? 'DESPESA' : null
    const description = String(args.description ?? '').trim()
    const amount = Math.abs(Number(args.amount))
    const paymentDate = String(args.payment_date ?? '').trim()
    if (!type) return { erro: 'type deve ser RECEITA ou DESPESA' }
    if (!description || !Number.isFinite(amount) || amount === 0) {
      return { erro: 'description e amount são obrigatórios' }
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(paymentDate)) {
      return { erro: 'payment_date deve ser YYYY-MM-DD' }
    }
    const accountId = String(args.account_id ?? '')
    if (!accountId) return { erro: 'Informe account_id usando o contexto de contas' }
    const status = args.status === 'PAGO' ? 'PAGO' : 'PENDENTE'

    const { data, error } = await client
      .from('mf_transactions')
      .insert({
        user_id: userId,
        account_id: accountId,
        category_id: args.category_id ? String(args.category_id) : null,
        type,
        description,
        amount: r2(amount),
        payment_date: paymentDate,
        status,
      })
      .select('id, type, description, amount, payment_date, status')
      .single()
    if (error) return { erro: error.message }
    return {
      ok: true,
      lancamento: {
        id: data.id,
        descricao: data.description,
        valor: Number(data.amount),
        data: data.payment_date,
        tipo: data.type,
        status: data.status,
      },
    }
  }

  if (name === 'efetivar_lancamento') {
    const id = String(args.transaction_id ?? '')
    if (!id) return { erro: 'transaction_id obrigatório' }
    const { data, error } = await client
      .from('mf_transactions')
      .update({ status: 'PAGO' })
      .eq('id', id)
      .select('id, description, amount, status')
      .maybeSingle()
    if (error) return { erro: error.message }
    if (!data) return { erro: 'Lançamento não encontrado (ou sem permissão).' }
    return {
      ok: true,
      lancamento: {
        id: data.id,
        descricao: data.description,
        valor: Number(data.amount),
        status: data.status,
      },
    }
  }

  return { erro: `Ferramenta desconhecida: ${name}` }
}

// -------------------------------------------------------------
// Chamada ao Gemini
// -------------------------------------------------------------
async function callGemini(opts: {
  apiKey: string
  contents: Array<Record<string, unknown>>
  systemInstruction: string
}) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 30000)
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${opts.apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: opts.contents,
          tools: [{ functionDeclarations: toolDeclarations }],
          systemInstruction: { parts: [{ text: opts.systemInstruction }] },
          generationConfig: { temperature: 0.4 },
        }),
        signal: controller.signal,
      },
    )
    const data = await res.json().catch(() => null)
    return { ok: res.ok, status: res.status, data }
  } finally {
    clearTimeout(timeoutId)
  }
}

function json(obj: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

// -------------------------------------------------------------
// Handler
// -------------------------------------------------------------
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Não autenticado' }, 401)

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    const client = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const {
      data: { user },
    } = await client.auth.getUser()
    if (!user) return json({ error: 'Não autenticado' }, 401)

    const payload: RequestPayload = await req.json()
    const messages = (payload.messages ?? []).filter(
      (m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string',
    )
    if (messages.length === 0) return json({ error: 'Nenhuma mensagem enviada' }, 400)

    const apiKey =
      Deno.env.get('GEMINI_API_KEY') ||
      Deno.env.get('GOOGLE_AI_KEY') ||
      Deno.env.get('SUPABASE_GEMINI_KEY') ||
      Deno.env.get('GEMINI_KEY')
    if (!apiKey) {
      // Sem secret: o cliente mostra a mensagem i18n de "não ativada"
      return json({ reply: '', configured: false, toolsUsed: [] })
    }

    const systemInstruction = buildSystemPrompt(payload.context)
    const contents: Array<Record<string, unknown>> = messages.map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }))
    const toolsUsed: string[] = []
    let reply = ''

    for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
      const geminiRes = await callGemini({ apiKey, contents, systemInstruction })
      if (!geminiRes.ok) {
        console.error('Gemini error:', geminiRes.status, JSON.stringify(geminiRes.data))
        return json({ error: `Gemini respondeu ${geminiRes.status}` }, 502)
      }
      const parts = (geminiRes.data?.candidates?.[0]?.content?.parts ?? []) as Array<{
        text?: string
        functionCall?: { name: string; args?: Record<string, unknown> }
      }>
      const functionCalls = parts
        .map((p) => p.functionCall)
        .filter((fc): fc is { name: string; args?: Record<string, unknown> } => !!fc)

      if (functionCalls.length === 0) {
        reply = parts
          .map((p) => p.text ?? '')
          .filter(Boolean)
          .join('\n')
          .trim()
        break
      }

      contents.push({
        role: 'model',
        parts: functionCalls.map((fc) => ({ functionCall: fc })),
      })
      const responseParts: Array<Record<string, unknown>> = []
      for (const fc of functionCalls) {
        toolsUsed.push(fc.name)
        let result: Record<string, unknown>
        try {
          result = await runTool(client, fc.name, fc.args ?? {}, user.id)
        } catch (toolError) {
          result = { erro: (toolError as Error).message }
        }
        responseParts.push({ functionResponse: { name: fc.name, response: result } })
      }
      contents.push({ role: 'user', parts: responseParts })
    }

    if (!reply) {
      reply = 'Não consegui concluir a resposta a tempo. Pode reformular a pergunta?'
    }
    return json({ reply, configured: true, toolsUsed })
  } catch (error) {
    console.error('finance-ai error:', error)
    return json({ error: (error as Error).message }, 500)
  }
})
