import * as React from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { Link } from "@tanstack/react-router"
import { useTranslations } from "use-intl"
import { Link2, ArrowLeft } from "lucide-react"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import type { FaqCategory, FaqItem } from "@/components/landing/faq-data"

interface FaqPageProps {
  category: FaqCategory
}

function slugToAnchor(id: string) {
  return `faq-${id}`
}

function normalizeMarkdown(md: string): string {
  const lines = md.split("\n")
  const result: string[] = []
  const isList = (l: string) => /^\s*[-*+]\s|^\s*\d+\.\s/.test(l)
  const isTable = (l: string) => /^\s*\|/.test(l)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!
    const prev = result[result.length - 1] ?? ""
    if (i > 0 && line.trim() !== "" && prev.trim() !== "") {
      const bothList = isList(line) && isList(prev)
      const bothTable = isTable(line) && isTable(prev)
      if (!bothList && !bothTable) result.push("")
    }
    result.push(line)
  }
  return result.join("\n")
}

export function FaqPage({ category }: FaqPageProps) {
  const [openItems, setOpenItems] = React.useState<string[]>([])
  const [copiedId, setCopiedId] = React.useState<string | null>(null)
  const t = useTranslations()

  React.useEffect(() => {
    const hash = window.location.hash.slice(1)
    if (!hash || !hash.startsWith("faq-")) return

    const itemId = hash.slice(4)
    if (category.items.some((item) => item.id === itemId)) {
      setOpenItems([itemId])
      setTimeout(() => {
        document
          .getElementById(hash)
          ?.scrollIntoView({ behavior: "smooth", block: "center" })
      }, 150)
    }
  }, [category.items])

  const handleCopyLink = (item: FaqItem, e: React.MouseEvent) => {
    e.stopPropagation()
    const anchor = slugToAnchor(item.id)
    const url = `${window.location.origin}${category.route}#${anchor}`
    navigator.clipboard.writeText(url)
    setCopiedId(item.id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-4xl px-6 lg:px-8 pt-24 pb-24">
        <Link
          to="/"
          hash="faq"
          className="inline-flex items-center gap-1.5 text-sm text-accent hover:text-accent/80 transition-colors mb-8"
        >
          <ArrowLeft className="h-4 w-4" />
          {t("faq.back")}
        </Link>

        <div className="mb-12">
          <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            {category.label} FAQ
          </h1>
          <p className="mt-4 text-lg text-muted-foreground">
            {category.description}
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            <span className="text-secondary">{category.items.length}</span>{" "}
            {t("faq.count", { count: category.items.length })}
          </p>
        </div>

        <Accordion
          type="multiple"
          value={openItems}
          onValueChange={setOpenItems}
          className="flex flex-col gap-3"
        >
          {category.items.map((item, index) => (
            <AccordionItem
              key={item.id}
              value={item.id}
              id={slugToAnchor(item.id)}
              className="rounded-lg border bg-card px-5"
            >
              <AccordionTrigger className="text-left text-base py-5">
                <span className="flex items-center gap-3 flex-1">
                  <span className="shrink-0 text-sm font-normal text-secondary tabular-nums">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span>{item.question}</span>
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => handleCopyLink(item, e)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault()
                        handleCopyLink(item, e as unknown as React.MouseEvent)
                      }
                    }}
                    className="relative shrink-0 cursor-pointer opacity-0 group-hover:opacity-100 hover:text-primary transition-opacity"
                    aria-label={`Copy link to "${item.question}"`}
                  >
                    <Link2 className="size-3.5" />
                    {copiedId === item.id && (
                      <span className="absolute -top-8 left-1/2 -translate-x-1/2 rounded bg-foreground px-2 py-1 text-xs text-background whitespace-nowrap">
                        Copied!
                      </span>
                    )}
                  </span>
                </span>
              </AccordionTrigger>
              <AccordionContent className="px-9 pb-5">
                <div className="prose prose-sm dark:prose-invert max-w-none prose-p:leading-relaxed prose-li:my-0.5 prose-ul:my-2 prose-ol:my-2 prose-table:my-3 prose-pre:bg-muted prose-pre:text-foreground prose-code:text-foreground prose-th:text-left prose-th:px-3 prose-th:py-2 prose-td:px-3 prose-td:py-2 prose-table:border-collapse prose-headings:mt-4 prose-headings:mb-2">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {normalizeMarkdown(item.answer)}
                  </ReactMarkdown>
                </div>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </div>
  )
}
