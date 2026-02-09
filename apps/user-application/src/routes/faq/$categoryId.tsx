import { createFileRoute, notFound } from "@tanstack/react-router"
import { NavigationBar } from "@/components/navigation"
import { FaqPage } from "@/components/faq/faq-page"
import { FAQ_CATEGORIES, FAQ_CATEGORY_IDS } from "@/components/landing/faq-data"
import type { FaqCategoryId } from "@/components/landing/faq-data"

export const Route = createFileRoute("/faq/$categoryId")({
  params: {
    parse: (params) => {
      if (!FAQ_CATEGORY_IDS.includes(params.categoryId as FaqCategoryId)) {
        throw notFound()
      }
      return { categoryId: params.categoryId as FaqCategoryId }
    },
    stringify: (params) => ({ categoryId: params.categoryId }),
  },
  component: FaqCategoryPage,
})

function FaqCategoryPage() {
  const { categoryId } = Route.useParams()
  const category = FAQ_CATEGORIES.find((c) => c.id === categoryId)!
  return (
    <>
      <NavigationBar />
      <FaqPage category={category} />
    </>
  )
}
