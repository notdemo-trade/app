import { useTranslations } from "use-intl";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Zap, Shield, LogIn } from "lucide-react";

export function HeroSection() {
  const t = useTranslations();

  return (
    <section className="relative px-6 lg:px-8 pt-24 sm:pt-32 pb-12 sm:pb-16">
      <div className="mx-auto max-w-4xl text-center">
        <div className="mb-8 flex flex-wrap justify-center gap-2">
          <Badge variant="secondary" className="mb-4">
            <Sparkles className="mr-1 h-3 w-3" />
            {t("hero.badge.ai")}
          </Badge>
          <Badge variant="secondary" className="mb-4">
            <Zap className="mr-1 h-3 w-3" />
            {t("hero.badge.monitoring")}
          </Badge>
          <Badge variant="secondary" className="mb-4">
            <Shield className="mr-1 h-3 w-3" />
            {t("hero.badge.byok")}
          </Badge>
        </div>

        <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-6xl lg:text-7xl">
          {t("hero.title.part1")}
          <span className="block text-primary">{t("hero.title.part2")}</span>
        </h1>

        <p className="mt-6 text-lg leading-8 text-muted-foreground max-w-2xl mx-auto">
          {t("hero.description")}
        </p>

        <div className="mt-10 flex flex-col items-center justify-center gap-2">
          <Button size="lg" disabled className="gap-2">
            <LogIn className="h-4 w-4" />
            {t("hero.cta.label")}
          </Button>
          <span className="text-sm text-muted-foreground">{t("hero.cta.soon")}</span>
        </div>
      </div>

      {/* Background gradient */}
      <div className="absolute inset-x-0 -top-40 -z-10 transform-gpu overflow-hidden blur-3xl sm:-top-80">
        <div
          className="relative left-[calc(50%-11rem)] aspect-[1155/678] w-[36.125rem] -translate-x-1/2 rotate-[30deg] bg-gradient-to-tr from-primary to-secondary opacity-20 sm:left-[calc(50%-30rem)] sm:w-[72.1875rem]"
          style={{
            clipPath:
              "polygon(74.1% 44.1%, 100% 61.6%, 97.5% 26.9%, 85.5% 0.1%, 80.7% 2%, 72.5% 32.5%, 60.2% 62.4%, 52.4% 68.1%, 47.5% 58.3%, 45.2% 34.5%, 27.5% 76.7%, 0.1% 64.9%, 17.9% 100%, 27.6% 76.8%, 76.1% 97.7%, 74.1% 44.1%)",
          }}
        />
      </div>
    </section>
  );
}
