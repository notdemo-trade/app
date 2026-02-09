export interface FaqItem {
  id: string
  question: string
  answer: string
}

export const FAQ_CATEGORY_IDS = ["beginner", "trader", "developer"] as const
export type FaqCategoryId = (typeof FAQ_CATEGORY_IDS)[number]

export interface FaqCategory {
  id: FaqCategoryId
  label: string
  description: string
  route: string
  items: FaqItem[]
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
}

function faq(question: string, answer: string): FaqItem {
  return { id: slugify(question), question, answer: answer.trim() }
}

const beginnerItems: FaqItem[] = [
  faq("What is notdemo.trade?", `It's a platform that runs an AI trading assistant for you. Think of it like having a robot that watches the market 24/7, suggests trades based on social media buzz and technical analysis, and can execute them with your approval or automatically.`),
]

const traderItems: FaqItem[] = [
  faq("I already do my own TA. Why would I need this?", `Three reasons:
1. **24/7 monitoring**: You can't watch 50 stocks across multiple timeframes constantly. The agent does.
2. **Signal aggregation**: Combines social sentiment (often leading indicator) with your TA in real-time. Catches momentum before it shows up on charts.
3. **Systematic execution**: Removes emotional trading. Your rules + AI analysis + automatic execution = discipline.

Think of it as your trading strategy, systematized and scaled.`),
]

const developerItems: FaqItem[] = [
  faq("What's the high-level architecture?", `**Three-tier edge-native stack**:

\`\`\`
┌─────────────────────────────────────────────────────────┐
│  User Application (TanStack Start SSR)                  │
│  ├─ React + TanStack Router                             │
│  ├─ Server functions (createServerFn)                   │
│  └─ Deployed: Cloudflare Workers                        │
└─────────────────────────────────────────────────────────┘
                          ↓ HTTP/WebSocket
┌─────────────────────────────────────────────────────────┐
│  Data Service (Hono REST API)                           │
│  ├─ Handlers → Services → Queries pattern               │
│  ├─ Zod validation, error handling                      │
│  └─ Deployed: Cloudflare Workers                        │
└─────────────────────────────────────────────────────────┘
                          ↓ RPC/WebSocket
┌─────────────────────────────────────────────────────────┐
│  Trading Agent (Cloudflare Agents SDK)                  │
│  ├─ Durable Object per user                             │
│  ├─ Scheduled loops (signal gathering, analysis)        │
│  ├─ WebSocket for real-time state sync                  │
│  └─ SQLite for per-agent logs + config                  │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│  Data Layer (data-ops package)                          │
│  ├─ Drizzle ORM → Neon Postgres                         │
│  ├─ Zod schemas for validation                          │
│  ├─ Type-safe queries + Better Auth integration         │
│  └─ Shared across all services                          │
└─────────────────────────────────────────────────────────┘
\`\`\`

**Key characteristics**:
- **Edge-first**: Everything runs on Cloudflare's edge network (low latency globally)
- **Monorepo**: Shared types and logic across frontend/backend/agents
- **Serverless**: No VMs to manage, infinite scaling
- **Multi-tenant**: Per-user isolation via Durable Objects`),
]

export const FAQ_CATEGORIES: FaqCategory[] = [
  {
    id: "beginner",
    label: "Beginners",
    description: "New to trading? Start here.",
    route: "/faq/beginner",
    items: beginnerItems,
  },
  {
    id: "trader",
    label: "Experienced Traders",
    description: "For traders familiar with TA and systematic trading.",
    route: "/faq/trader",
    items: traderItems,
  },
  {
    id: "developer",
    label: "Developers",
    description: "Technical deep-dive into architecture and stack.",
    route: "/faq/developer",
    items: developerItems,
  },
]
