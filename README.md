# 🌌 Personal Control - Orbit Design System

Personal Control is a high-performance personal management platform, developed with a **premium and minimalist** aesthetic based on the **Orbit Design System**. The system centralizes finances, investments, fleet maintenance, and trip planning into a single unified and responsive interface.

## 🚀 Core Modules

### 💰 Finance & Automation
- **Executive Dashboard:** Clear view of income, expenses, and monthly cash flow.
- **Email Automation:** Integration with **Supabase Edge Functions** and **Google Apps Script** for automated dispatch of payment reports and notifications.
- **Transaction Management:** Advanced filtering and intelligent categorization.

### 📈 Investments
- **Portfolio Analysis:** Interactive charts (Recharts) showing allocation by institution and asset type.
- **Yield Evolution:** Monthly tracking of yields and historical performance.
- **Secure Visualization:** Privacy mode to toggle visibility of sensitive values.

### 🚗 My Cars (Fleet Management)
- **Maintenance Log:** Complete records of services, fueling, and operational costs.
- **Shared Access:** Invitation system to share vehicle data between users.
- **Service Templates:** Standardized checklists for recurring maintenance.

### ✈️ My Journey (Trips)
- **Map Statistics:** Global visualization of visited countries with support for microstates (Vatican City, Monaco, etc.).
- **Itinerary Planning:** Management of schedules, accommodations, and document attachments.
- **Expense Tracking:** Currency conversion and expense tracking per trip.

### 📝 Custom Lists
- **Total Flexibility:** Creation of dynamic lists for any type of control with support for multi-line text fields.

## 🛠️ Technology Stack

- **Frontend:** React + Vite
- **Styling:** Vanilla CSS (Orbit Design System Custom)
- **Animations:** Framer Motion
- **Icons:** Lucide React
- **Backend:** Supabase (Auth, Database, Storage, Edge Functions)
- **Charts:** Recharts
- **Testing:** Vitest (Unit) & Playwright (E2E)

## 📦 Installation & Development

1. **Clone the repository:**
   ```bash
   git clone https://github.com/Glailton-LTDA/personal-control.git
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure environment variables:**
   Create a `.env` file based on `.env.example` with your Supabase credentials.

4. **Start the development server:**
   ```bash
   npm run dev
   ```

### 🐘 Supabase local (Docker) — ambiente de desenvolvimento

Desenvolver contra produção é a maior fonte de egress do projeto (o dev server sozinho chegou a ~148 MB em 24 h). O repositório já traz a configuração do Supabase local (`supabase/config.toml`), o schema completo (`supabase/migrations/20200101000000_baseline_schema.sql`) e um seed mínimo (`supabase/seed.sql`).

**Pré-requisitos:** Docker Desktop rodando e Node 18+.

#### Passo a passo

**1. Suba o stack** (na raiz do repositório):
```bash
npx supabase start
```
Na primeira vez baixa as imagens (~1–2 GB) e leva alguns minutos; depois aplica as 26 migrations + o baseline + o seed. No fim ele imprime as URLs e a **anon key**. Rodar de novo é seguro: religa os containers e revalida a configuração.

**2. Aponte o app para o banco local:**
```bash
cp .env.local.example .env.local
# PowerShell:
Copy-Item .env.local.example .env.local
```

**3. Rode o app:**
```bash
npm run dev
```

#### “Não basta subir o container no Docker?”

Não. São duas coisas independentes:

- **O banco**: `npx supabase start` cria/religa o banco e aplica migrations + seed. Se os containers já existem, um `docker start` (ou o próprio Docker Desktop religando) traz tudo de volta **com os dados** — isso funciona.
- **O app**: o Vite lê `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` do `.env`, que aponta para **produção**. O `.env.local` é o override local e é **ignorado pelo git** (por isso existe o `.env.local.example`). Sem ele, o `npm run dev` continua falando com produção, mesmo com o container no ar — e o egress continua.

Ou seja: na primeira vez, `npx supabase start` + copiar o `.env.local`. Depois disso, religar o Docker já basta.

#### Comandos do dia a dia

| Comando | O que faz |
|---|---|
| `npx supabase start` | sobe/religa o stack e revalida a config |
| `npx supabase stop` | para o stack (mantém os dados) |
| `npx supabase stop --no-backup` | para e descarta os dados |
| `npx supabase db reset` | reaplica migrations + seed do zero (UUIDs fixos) |
| `npx supabase status` | mostra URLs, portas e chaves |
| `http://127.0.0.1:54423` | Studio (navegar nas tabelas) |

As portas ficam em **544xx** (API 54421, banco 54422, Studio 54423, e-mail 54424, analytics 54427) para conviver com outro projeto Supabase local nas portas padrão.

#### Se o Docker Desktop reiniciar

Os containers sobem sozinhos, mas o `auth` pode entrar em *crash-loop* até o banco terminar de subir. Espere ~30 s; se não voltar, rode `npx supabase start` de novo.

#### O que o seed tem (mínimo, não é dump de produção)

4 contas (corrente, cartão, poupança e carteira em **USD**), 7 categorias + 1 subcategoria, fatura **paga** (R$ 409,90) e **em aberto** (R$ 395,50), fatura corrente, parcela **3/10**, gasto fixo mensal, transferência entre contas, receita, viagem passada e futura (com despesa e itinerário) e investimento **Rendimentos / Mercado Pago** com 2 registros.

#### Como confirmar que você não está em produção

Com o app aberto: DevTools → **Network** → filtre por `rest`. Todas as chamadas devem ir para `127.0.0.1:54421`; nenhuma para `*.supabase.co`.


## 🧪 Test Suite

The project adheres to rigorous quality standards:
- **Unit Tests:** `npm run test`
- **E2E Tests:** `npm run test:e2e`
- **Linting:** `npm run lint`
- **Build Validation:** `npm run build`

## 🛡️ Design Guidelines
The project follows the **Orbit Design System** philosophy:
- **Clean Business Aesthetics:** Slate color palette (#0f172a).
- **Responsive-First:** Full adaptability across Mobile, Tablet, and Web.
- **High Fidelity:** Glassmorphism, smooth gradients, and micro-animations.

---
Developed by **Glailton LTDA** | Orbit Style 🌌
