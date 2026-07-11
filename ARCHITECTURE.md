# Agent.fun — Foundation Architecture

## 1. Folder Structure

```
src/
├── app/
│   ├── layout.tsx                 # Geist font, shell, global nav
│   ├── globals.css                # Design tokens, typography base
│   ├── page.tsx                   # Redirect → /marketplace
│   ├── marketplace/
│   │   └── page.tsx               # Agent discovery (FULL BUILD)
│   ├── agents/
│   │   └── [slug]/
│   │       └── page.tsx           # Agent profile (FULL: whale-hunter)
│   ├── launch/page.tsx            # Stub
│   ├── arena/page.tsx             # Stub
│   └── portfolio/page.tsx         # Stub
├── components/
│   ├── layout/
│   │   ├── site-header.tsx        # Horizontal nav, 1440px container
│   │   ├── site-footer.tsx
│   │   └── container.tsx          # max-w-[1440px] mx-auto px-6
│   ├── ui/
│   │   ├── button.tsx             # Primary / secondary / ghost
│   │   ├── badge.tsx
│   │   ├── divider.tsx
│   │   └── stat.tsx
│   ├── typography/
│   │   └── index.tsx              # PageTitle, SectionTitle, Text, Muted, Label
│   ├── marketplace/
│   │   ├── marketplace-toolbar.tsx
│   │   ├── agent-table.tsx
│   │   └── agent-table-row.tsx
│   └── agent/
│       ├── agent-header.tsx
│       ├── agent-metrics.tsx
│       ├── performance-chart.tsx  # Recharts
│       ├── activity-list.tsx
│       ├── access-panel.tsx
│       └── strategy-section.tsx
└── lib/
    ├── types.ts                   # Agent, Activity, PerformancePoint
    ├── utils.ts                   # cn, formatters
    └── data/
        ├── agents.ts              # Mock agent registry
        ├── whale-hunter.ts        # Rich profile data
        └── index.ts               # getAgentBySlug, listAgents
```

## 2. Component List

| Component | Purpose |
|-----------|---------|
| `Container` | 1440px max-width, responsive padding |
| `SiteHeader` | Logo, nav links, CTA — no sidebar |
| `SiteFooter` | Minimal legal + links |
| `Button` | 3 variants, 8–14px radius |
| `Badge` | Status, category, risk |
| `Divider` | 1px rgba border, replaces card borders |
| `Stat` | Label + value pair for metrics |
| `PageTitle` / `SectionTitle` / `Muted` / `Label` | Typography system |
| `MarketplaceToolbar` | Search + category filter |
| `AgentTable` | List layout, not card grid |
| `AgentTableRow` | Single agent row with key metrics |
| `AgentHeader` | Name, creator, status, one-line thesis |
| `AgentMetrics` | Horizontal stat strip |
| `PerformanceChart` | Recharts line chart, real data only |
| `ActivityList` | Recent trades / events |
| `AccessPanel` | Subscribe / buy / invest options |
| `StrategySection` | What the agent does, plain prose |

## 3. Page Hierarchy

```
SiteHeader (all routes)
├── /marketplace          ← primary discovery (built)
│   └── AgentTable
├── /agents/[slug]        ← profile (built: whale-hunter)
│   ├── AgentHeader
│   ├── AgentMetrics
│   ├── PerformanceChart
│   ├── StrategySection
│   ├── ActivityList
│   └── AccessPanel
├── /launch               ← stub
├── /arena                ← stub
└── /portfolio            ← stub
SiteFooter
```

## 4. Data Model

```typescript
type AgentCategory = "trading" | "defi" | "analytics" | "arbitrage" | "social";
type AgentStatus = "live" | "beta" | "paused";
type PricingModel = "subscription" | "one-time" | "invest";
type RiskLevel = "low" | "medium" | "high";

interface AgentCreator {
  name: string;
  handle: string;
  verified: boolean;
}

interface AgentPricing {
  model: PricingModel;
  amount: number;
  currency: "USD" | "USDC";
  period?: "month" | "year";
  minInvestment?: number;
}

interface AgentPerformance {
  totalReturnPct: number;      // e.g. 24.3
  return30dPct: number;
  winRatePct: number;
  maxDrawdownPct: number;
  sharpeRatio: number;
  asOf: string;                // ISO date
}

interface AgentSummary {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  category: AgentCategory;
  status: AgentStatus;
  riskLevel: RiskLevel;
  creator: AgentCreator;
  pricing: AgentPricing;
  performance: AgentPerformance;
  subscribers: number;
  createdAt: string;
  tags: string[];
}

interface AgentProfile extends AgentSummary {
  description: string;
  strategy: string;
  instruments: string[];
  chainId: 4663;
  performanceHistory: PerformancePoint[];
  activity: AgentActivity[];
}

interface PerformancePoint {
  date: string;
  value: number;               // cumulative return index, base 100
}

interface AgentActivity {
  id: string;
  timestamp: string;
  type: "trade" | "rebalance" | "signal" | "deposit";
  summary: string;
  pnlUsd?: number;
}
```

## 5. Visual Rationale

**Reference mood:** Linear's typographic clarity + Robinhood's financial confidence + Stripe's information density without ornament.

- **Near-black canvas (#0A0A0A)** keeps focus on data; elevated surfaces (#111) only where grouping is necessary.
- **Lime accent (#C8FF00)** used sparingly for primary actions and positive performance — same family as Robinhood Chain energy without copying their brand.
- **No cards everywhere:** agent list is a table with row dividers; profile sections separated by 1px lines and whitespace, not boxed panels.
- **Typography does the work:** Geist at clear size steps (32/24/16/14/12) with tight tracking on headings, relaxed line-height on body.
- **Motion:** 150–200ms opacity/translate on row hover only — nothing decorative.
- **Charts:** one Recharts line on the profile page, labeled axes, no sparklines or fake dashboards.
- **Credibility:** real-sounding strategy copy, plausible metrics, no fake TVL banners or platform-wide stat hero.
