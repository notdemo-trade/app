import { BarChart3 } from 'lucide-react';
import { useTranslations } from 'use-intl';
import { Card, CardContent } from '@/components/ui/card';

interface ColdStartMessageProps {
	totalOutcomes: number;
	requiredOutcomes?: number;
}

export function ColdStartMessage({ totalOutcomes, requiredOutcomes = 5 }: ColdStartMessageProps) {
	const t = useTranslations('performance');
	const remaining = Math.max(0, requiredOutcomes - totalOutcomes);

	return (
		<Card>
			<CardContent className="flex flex-col items-center justify-center py-12 text-center">
				<BarChart3 className="mb-3 h-10 w-10 text-muted-foreground" />
				<h3 className="text-sm font-medium text-foreground">{t('coldStart.title')}</h3>
				<p className="mt-1 max-w-sm text-xs text-muted-foreground">
					{t('coldStart.description', { remaining, required: requiredOutcomes })}
				</p>
				{totalOutcomes > 0 && (
					<div className="mt-4 flex items-center gap-2">
						<div className="h-2 w-32 overflow-hidden rounded-full bg-muted">
							<div
								className="h-full rounded-full bg-primary transition-all"
								style={{
									width: `${(totalOutcomes / requiredOutcomes) * 100}%`,
								}}
							/>
						</div>
						<span className="text-xs text-muted-foreground">
							{totalOutcomes}/{requiredOutcomes}
						</span>
					</div>
				)}
			</CardContent>
		</Card>
	);
}
