import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Bot,
  TrendingUp,
  MessageSquare,
  Shield,
  Smartphone,
  BarChart3,
  Key,
  Zap
} from "lucide-react"

const features = [
  {
    icon: Bot,
    title: "AI Analysis",
    description: "LLM-powered trade recommendations using OpenAI, Anthropic, Google, xAI, or DeepSeek.",
    badge: "Core"
  },
  {
    icon: TrendingUp,
    title: "Multi-Asset",
    description: "Trade stocks, crypto (24/7), and options with delta targeting strategies.",
    badge: "Trading"
  },
  {
    icon: MessageSquare,
    title: "Signal Aggregation",
    description: "Monitors StockTwits, Reddit, Twitter, and SEC filings for sentiment and momentum.",
    badge: "Signals"
  },
  {
    icon: Smartphone,
    title: "Telegram Approvals",
    description: "Approve or reject trades from your phone via Telegram, or enable autonomous mode.",
    badge: "Mobile"
  },
  {
    icon: Shield,
    title: "Risk Guardrails",
    description: "Kill switches, position limits, daily loss caps, and staleness detection built in.",
    badge: "Safety"
  },
  {
    icon: BarChart3,
    title: "Trade Journal",
    description: "Track outcomes for learning and pattern extraction across all your trades.",
    badge: "Analytics"
  },
  {
    icon: Key,
    title: "Bring Your Own Keys",
    description: "Use your own broker (Alpaca) and LLM API keys. Your capital, your control.",
    badge: "BYOK"
  },
  {
    icon: Zap,
    title: "Strategy Templates",
    description: "Shareable templates for custom prompt engineering approaches. Publish and fork strategies.",
    badge: "Community"
  }
]

export function FeaturesSection() {
  return (
    <section id="features" className="pt-12 sm:pt-16 pb-24 sm:pb-32">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Your AI Trading Agent
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Institutional-grade infrastructure for retail algorithmic traders
          </p>
        </div>

        <div className="mx-auto mt-16 grid max-w-2xl grid-cols-1 gap-6 sm:mt-20 lg:mx-0 lg:max-w-none lg:grid-cols-2 xl:grid-cols-4">
          {features.map((feature) => {
            const IconComponent = feature.icon
            return (
              <Card key={feature.title} className="group hover:shadow-lg transition-all duration-300 hover:-translate-y-1">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                      <IconComponent className="h-5 w-5 text-primary" />
                    </div>
                    <Badge variant="outline" className="text-xs text-secondary">
                      {feature.badge}
                    </Badge>
                  </div>
                  <CardTitle className="text-lg">{feature.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-sm leading-relaxed">
                    {feature.description}
                  </CardDescription>
                </CardContent>
              </Card>
            )
          })}
        </div>
      </div>
    </section>
  )
}
