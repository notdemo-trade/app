import type { AnalysisResult, Timeframe } from '@repo/data-ops/agents/ta/types';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { ArrowLeft } from 'lucide-react';
import { useState } from 'react';
import { IndicatorPanels } from '@/components/analysis/indicator-panels';
import { PriceChart } from '@/components/analysis/price-chart';
import { SignalList } from '@/components/analysis/signal-list';
import { TimeframeSelector } from '@/components/analysis/timeframe-selector';
import { analysisQueryOptions } from '@/lib/analysis-queries';

export const Route = createFileRoute('/_auth/analysis/$symbol')({
	component: AnalysisPage,
});

function AnalysisPage() {
	const { symbol } = Route.useParams();
	const [timeframe, setTimeframe] = useState<Timeframe>('1Day');

	const { data, isLoading, error } = useQuery(analysisQueryOptions(symbol, timeframe));
	const result = data as AnalysisResult | undefined;

	return (
		<div className="space-y-6">
			<div>
				<Link
					to="/dashboard"
					className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4"
				>
					<ArrowLeft className="h-4 w-4" />
					Back to Dashboard
				</Link>

				<div className="flex items-center justify-between">
					<div>
						<h1 className="text-2xl font-bold text-foreground">{symbol.toUpperCase()}</h1>
						{result && (
							<p className="text-muted-foreground text-sm">${result.indicators.price.toFixed(2)}</p>
						)}
					</div>
					<TimeframeSelector value={timeframe} onChange={setTimeframe} />
				</div>
			</div>

			{isLoading && (
				<div className="flex items-center justify-center py-12">
					<div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
				</div>
			)}

			{error && (
				<div className="rounded-md bg-destructive/10 p-4 text-destructive text-sm">
					{error.message}
				</div>
			)}

			{result && (
				<>
					<PriceChart bars={result.bars} indicators={result.indicators} />
					<IndicatorPanels indicators={result.indicators} />
					<SignalList signals={result.signals} />
				</>
			)}
		</div>
	);
}
