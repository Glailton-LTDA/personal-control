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
