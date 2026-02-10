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

interface TranslationFn {
  (key: string): string
}

interface CategoryConfig {
  id: FaqCategoryId
  questionCount: number
}

const CATEGORY_CONFIGS: CategoryConfig[] = [
  { id: "beginner", questionCount: 1 },
  { id: "trader", questionCount: 1 },
  { id: "developer", questionCount: 1 },
]

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
}

export function buildFaqCategories(t: TranslationFn): FaqCategory[] {
  return CATEGORY_CONFIGS.map((config) => {
    const items: FaqItem[] = []
    for (let i = 1; i <= config.questionCount; i++) {
      const question = t(`faq.${config.id}.q${i}`)
      const answer = t(`faq.${config.id}.a${i}`)
      items.push({ id: slugify(question), question, answer })
    }

    return {
      id: config.id,
      label: t(`faq.${config.id}.label`),
      description: t(`faq.${config.id}.description`),
      route: `/faq/${config.id}`,
      items,
    }
  })
}
