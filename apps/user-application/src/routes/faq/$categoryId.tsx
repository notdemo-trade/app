import { createFileRoute, notFound } from '@tanstack/react-router';
import { useTranslations } from 'use-intl';
import { FaqPage } from '@/components/faq/faq-page';
import type { FaqCategoryId } from '@/components/landing/faq-data';
import { buildFaqCategories, FAQ_CATEGORY_IDS } from '@/components/landing/faq-data';
import { NavigationBar } from '@/components/navigation';

export const Route = createFileRoute('/faq/$categoryId')({
	params: {
		parse: (params) => {
			if (!FAQ_CATEGORY_IDS.includes(params.categoryId as FaqCategoryId)) {
				throw notFound();
			}
			return { categoryId: params.categoryId as FaqCategoryId };
		},
		stringify: (params) => ({ categoryId: params.categoryId }),
	},
	component: FaqCategoryPage,
});

function FaqCategoryPage() {
	const { categoryId } = Route.useParams();
	const t = useTranslations();
	const categories = buildFaqCategories(t);
	// Category is guaranteed to exist — params.parse() throws notFound() for invalid IDs
	// biome-ignore lint/style/noNonNullAssertion: validated by route params.parse
	const category = categories.find((c) => c.id === categoryId)!;
	return (
		<>
			<NavigationBar />
			<FaqPage category={category} />
		</>
	);
}
