import type { PersonaPattern } from '@repo/data-ops/agents/memory/types';
import { Lightbulb } from 'lucide-react';
import { useTranslations } from 'use-intl';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface PatternHighlightsProps {
	patterns: PersonaPattern[];
	personaName?: string;
}

const patternTypeLabels: Record<string, string> = {
	indicator_outcome: 'Indicator',
	market_regime: 'Market Regime',
	sector: 'Sector',
	symbol: 'Symbol',
};

export function PatternHighlights({ patterns, personaName }: PatternHighlightsProps) {
	const t = useTranslations('performance');
	const filtered = patterns.filter((p) => p.sampleSize >= 5);

	if (filtered.length === 0) {
		return null;
	}

	return (
		<Card>
			<CardHeader className="pb-2">
				<div className="flex items-center gap-2">
					<Lightbulb className="h-4 w-4 text-yellow-500" />
					<CardTitle className="text-sm font-medium">
						{personaName ? `${personaName} ${t('patterns')}` : t('patterns')}
					</CardTitle>
				</div>
			</CardHeader>
			<CardContent className="space-y-2">
				{filtered.map((pattern) => {
					const isPositive = pattern.avgPnlPct >= 0;
					return (
						<div key={pattern.id} className="rounded-md bg-muted/50 px-3 py-2">
							<div className="flex items-start justify-between">
								<div className="flex-1">
									<p className="text-sm text-foreground">{pattern.description}</p>
									<div className="mt-1 flex gap-3 text-xs text-muted-foreground">
										<span>{patternTypeLabels[pattern.patternType] ?? pattern.patternType}</span>
										<span>{t('sampleSize', { count: pattern.sampleSize })}</span>
									</div>
								</div>
								<div className="text-right">
									<p className="text-sm font-medium text-foreground">
										{(pattern.successRate * 100).toFixed(0)}%
									</p>
									<p className={`text-xs ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
										{isPositive ? '+' : ''}
										{pattern.avgPnlPct.toFixed(2)}%
									</p>
								</div>
							</div>
						</div>
					);
				})}
			</CardContent>
		</Card>
	);
}
