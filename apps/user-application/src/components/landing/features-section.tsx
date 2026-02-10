import { useTranslations } from "use-intl"
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
import type { LucideIcon } from "lucide-react"

interface FeatureItem {
  icon: LucideIcon
  titleKey: string
  descriptionKey: string
  badgeKey: string
}

const features: FeatureItem[] = [
  { icon: Bot, titleKey: "features.ai.title", descriptionKey: "features.ai.description", badgeKey: "features.ai.badge" },
  { icon: TrendingUp, titleKey: "features.multiasset.title", descriptionKey: "features.multiasset.description", badgeKey: "features.multiasset.badge" },
  { icon: MessageSquare, titleKey: "features.signals.title", descriptionKey: "features.signals.description", badgeKey: "features.signals.badge" },
  { icon: Smartphone, titleKey: "features.telegram.title", descriptionKey: "features.telegram.description", badgeKey: "features.telegram.badge" },
  { icon: Shield, titleKey: "features.risk.title", descriptionKey: "features.risk.description", badgeKey: "features.risk.badge" },
  { icon: BarChart3, titleKey: "features.journal.title", descriptionKey: "features.journal.description", badgeKey: "features.journal.badge" },
  { icon: Key, titleKey: "features.byok.title", descriptionKey: "features.byok.description", badgeKey: "features.byok.badge" },
  { icon: Zap, titleKey: "features.templates.title", descriptionKey: "features.templates.description", badgeKey: "features.templates.badge" },
]

export function FeaturesSection() {
  const t = useTranslations()

  return (
    <section id="features" className="pt-12 sm:pt-16 pb-24 sm:pb-32">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            {t("features.title")}
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            {t("features.subtitle")}
          </p>
        </div>

        <div className="mx-auto mt-16 grid max-w-2xl grid-cols-1 gap-6 sm:mt-20 lg:mx-0 lg:max-w-none lg:grid-cols-2 xl:grid-cols-4">
          {features.map((feature) => {
            const IconComponent = feature.icon
            return (
              <Card key={feature.titleKey} className="group hover:shadow-lg transition-all duration-300 hover:-translate-y-1">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                      <IconComponent className="h-5 w-5 text-primary" />
                    </div>
                    <Badge variant="outline" className="text-xs text-secondary">
                      {t(feature.badgeKey)}
                    </Badge>
                  </div>
                  <CardTitle className="text-lg">{t(feature.titleKey)}</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-sm leading-relaxed">
                    {t(feature.descriptionKey)}
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
