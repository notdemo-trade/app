import type { PersonaScore, ProposalOutcome } from '@repo/data-ops/agents/memory/types';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { useTranslations } from 'use-intl';
import { ColdStartMessage } from '@/components/performance/cold-start-message';
import { OutcomeHistoryFeed } from '@/components/performance/outcome-history-feed';
import { OutcomeSnapshotCard } from '@/components/performance/outcome-snapshot';
import { PatternHighlights } from '@/components/performance/pattern-highlights';
import { PersonaScoreCard } from '@/components/performance/persona-score-card';
import { WindowSelector } from '@/components/performance/window-selector';
import { Button } from '@/components/ui/button';
import { getUserTradingConfig } from '@/core/functions/trading-config/direct';
import { useOutcomes, usePatterns, useScores, useSnapshots } from '@/lib/performance-queries';

export const Route = createFileRoute('/_auth/performance/')({
	component: PerformancePage,
});

const MIN_OUTCOMES_FOR_DISPLAY = 5;

function PerformancePage() {
	const t = useTranslations('performance');
	const [windowDays, setWindowDays] = useState<number>(30);
	const [_selectedOutcome, setSelectedOutcome] = useState<ProposalOutcome | null>(null);

	const { data: tradingConfig } = useQuery({
		queryKey: ['trading-config'],
		queryFn: () => getUserTradingConfig(),
	});
	const userWindows = (tradingConfig?.scoreWindows as number[]) ?? [30, 90, 180];

	const scores = useScores(windowDays);
	const resolvedOutcomes = useOutcomes('resolved');
	const trackingOutcomes = useOutcomes('tracking');

	const firstPersonaId =
		scores.data?.mode === 'debate' && scores.data.scores.length > 0
			? (scores.data.scores[0] as PersonaScore).personaId
			: null;
	const patterns = usePatterns(firstPersonaId ?? '');

	const firstTrackingOutcome = trackingOutcomes.data?.[0] ?? null;
	const snapshots = useSnapshots(firstTrackingOutcome?.id ?? '');
	const latestSnapshot = snapshots.data?.[0] ?? null;

	const totalResolved = resolvedOutcomes.data?.length ?? 0;
	const isLoading = scores.isLoading || resolvedOutcomes.isLoading;

	return (
		<div className="space-y-6">
			{/* Header */}
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-2xl font-bold text-foreground">{t('title')}</h1>
					<p className="text-sm text-muted-foreground">{t('description')}</p>
				</div>
				<div className="flex items-center gap-3">
					<WindowSelector value={windowDays} onChange={setWindowDays} windows={userWindows} />
					<Button
						variant="outline"
						size="icon"
						onClick={() => {
							scores.refetch();
							resolvedOutcomes.refetch();
							trackingOutcomes.refetch();
						}}
						disabled={isLoading}
					>
						<RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
					</Button>
				</div>
			</div>

			{/* Cold Start Check */}
			{totalResolved < MIN_OUTCOMES_FOR_DISPLAY ? (
				<ColdStartMessage
					totalOutcomes={totalResolved}
					requiredOutcomes={MIN_OUTCOMES_FOR_DISPLAY}
				/>
			) : (
				<div className="grid gap-6 lg:grid-cols-3">
					{/* Main Content */}
					<div className="space-y-6 lg:col-span-2">
						{/* Score Cards */}
						{scores.data && scores.data.scores.length > 0 && (
							<div>
								<h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
									{scores.data.mode === 'debate' ? t('personaScores') : t('pipelineScores')}
								</h2>
								<div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
									{scores.data.scores.map((score) => {
										const id = 'personaId' in score ? score.personaId : score.strategyId;
										return (
											<PersonaScoreCard key={id} score={score as PersonaScore} personaName={id} />
										);
									})}
								</div>
							</div>
						)}

						{/* Patterns */}
						{patterns.data && patterns.data.length > 0 && (
							<PatternHighlights patterns={patterns.data} />
						)}
					</div>

					{/* Sidebar */}
					<div className="space-y-4">
						{/* Active Positions */}
						{trackingOutcomes.data && trackingOutcomes.data.length > 0 && (
							<div>
								<h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
									{t('activePositions')}
								</h2>
								<div className="space-y-3">
									{trackingOutcomes.data.map((outcome) => (
										<OutcomeSnapshotCard
											key={outcome.id}
											outcome={outcome}
											snapshot={outcome.id === firstTrackingOutcome?.id ? latestSnapshot : null}
										/>
									))}
								</div>
							</div>
						)}

						{/* Outcome History */}
						<OutcomeHistoryFeed
							outcomes={resolvedOutcomes.data ?? []}
							onSelect={setSelectedOutcome}
						/>
					</div>
				</div>
			)}
		</div>
	);
}
