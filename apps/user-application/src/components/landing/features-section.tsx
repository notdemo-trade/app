import type { LucideIcon } from 'lucide-react';
import {
	BarChart3,
	Bot,
	CheckCircle,
	GitBranch,
	Key,
	MessageCircle,
	Shield,
	TrendingUp,
} from 'lucide-react';
import { useTranslations } from 'use-intl';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

interface FeatureItem {
	icon: LucideIcon;
	titleKey: string;
	descriptionKey: string;
	badgeKey: string;
}

const features: FeatureItem[] = [
	{
		icon: Bot,
		titleKey: 'features.ai.title',
		descriptionKey: 'features.ai.description',
		badgeKey: 'features.ai.badge',
	},
	{
		icon: TrendingUp,
		titleKey: 'features.multiasset.title',
		descriptionKey: 'features.multiasset.description',
		badgeKey: 'features.multiasset.badge',
	},
	{
		icon: MessageCircle,
		titleKey: 'features.discussion.title',
		descriptionKey: 'features.discussion.description',
		badgeKey: 'features.discussion.badge',
	},
	{
		icon: CheckCircle,
		titleKey: 'features.approval.title',
		descriptionKey: 'features.approval.description',
		badgeKey: 'features.approval.badge',
	},
	{
		icon: Shield,
		titleKey: 'features.risk.title',
		descriptionKey: 'features.risk.description',
		badgeKey: 'features.risk.badge',
	},
	{
		icon: BarChart3,
		titleKey: 'features.performance.title',
		descriptionKey: 'features.performance.description',
		badgeKey: 'features.performance.badge',
	},
	{
		icon: Key,
		titleKey: 'features.byok.title',
		descriptionKey: 'features.byok.description',
		badgeKey: 'features.byok.badge',
	},
	{
		icon: GitBranch,
		titleKey: 'features.orchestration.title',
		descriptionKey: 'features.orchestration.description',
		badgeKey: 'features.orchestration.badge',
	},
];

export function FeaturesSection() {
	const t = useTranslations();

	return (
		<section id="features" className="pt-12 sm:pt-16 pb-24 sm:pb-32">
			<div className="mx-auto max-w-7xl px-6 lg:px-8">
				<div className="mx-auto max-w-2xl text-center">
					<h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
						{t('features.title')}
					</h2>
					<p className="mt-4 text-lg text-muted-foreground">{t('features.subtitle')}</p>
				</div>

				<div className="mx-auto mt-16 grid max-w-2xl grid-cols-1 gap-6 sm:mt-20 lg:mx-0 lg:max-w-none lg:grid-cols-2 xl:grid-cols-4">
					{features.map((feature) => {
						const IconComponent = feature.icon;
						return (
							<Card
								key={feature.titleKey}
								className="group hover:shadow-lg transition-all duration-300 hover:-translate-y-1"
							>
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
						);
					})}
				</div>
			</div>
		</section>
	);
}
