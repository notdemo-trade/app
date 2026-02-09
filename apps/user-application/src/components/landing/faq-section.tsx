import { Link } from "@tanstack/react-router"
import { BookOpen, TrendingUp, Code2, ArrowRight } from "lucide-react"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { FAQ_CATEGORIES } from "./faq-data"

const categoryIcons = {
  beginner: BookOpen,
  trader: TrendingUp,
  developer: Code2,
} as const

export function FaqSection() {
  return (
    <section id="faq" className="pt-12 sm:pt-16 pb-24 sm:pb-32">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Frequently Asked Questions
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Everything you need to know about notdemo.trade
          </p>
        </div>

        <div className="mx-auto mt-16 grid max-w-2xl grid-cols-1 gap-6 sm:mt-20 lg:mx-0 lg:max-w-none lg:grid-cols-3">
          {FAQ_CATEGORIES.map((cat) => {
            const Icon = categoryIcons[cat.id]
            return (
              <Link
                key={cat.id}
                to={cat.route}
                className="no-underline"
              >
                <Card className="group h-full hover:shadow-lg transition-all duration-300 hover:-translate-y-1 cursor-pointer">
                  <CardHeader>
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                      <Icon className="h-5 w-5 text-primary" />
                    </div>
                    <CardTitle className="text-lg">{cat.label}</CardTitle>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-4">
                    <CardDescription className="text-sm leading-relaxed">
                      {cat.description}
                    </CardDescription>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">
                        <span className="text-secondary">{cat.items.length}</span> questions
                      </span>
                      <span className="flex items-center gap-1 text-accent group-hover:gap-2 transition-all">
                        Browse
                        <ArrowRight className="h-4 w-4" />
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            )
          })}
        </div>
      </div>
    </section>
  )
}
