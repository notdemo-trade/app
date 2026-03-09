import type { ProposalOutcome } from '@repo/data-ops/agents/memory/types';
import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { useTranslations } from 'use-intl';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';

interface OutcomeHistoryFeedProps {
	outcomes: ProposalOutcome[];
	onSelect?: (outcome: ProposalOutcome) => void;
}

function formatDuration(ms: number | null): string {
	if (ms === null) return '—';
	const hours = Math.floor(ms / 3_600_000);
	if (hours < 24) return `${hours}h`;
	const days = Math.floor(hours / 24);
	return `${days}d`;
}

const exitReasonKeys: Record<string, string> = {
	stop_loss: 'exitReason.stopLoss',
	target_hit: 'exitReason.targetHit',
	manual_close: 'exitReason.manualClose',
	time_exit: 'exitReason.timeExit',
};

export function OutcomeHistoryFeed({ outcomes, onSelect }: OutcomeHistoryFeedProps) {
	const t = useTranslations('performance');

	if (outcomes.length === 0) {
		return (
			<Card>
				<CardContent className="py-8 text-center text-sm text-muted-foreground">
					{t('noOutcomes')}
				</CardContent>
			</Card>
		);
	}

	return (
		<Card>
			<CardHeader className="pb-2">
				<CardTitle className="text-sm font-medium">{t('outcomeHistory')}</CardTitle>
			</CardHeader>
			<CardContent className="p-0">
				<ScrollArea className="max-h-[500px]">
					<div className="divide-y divide-border">
						{outcomes.map((outcome) => {
							const isPositive = outcome.realizedPnl !== null && outcome.realizedPnl >= 0;
							const PnlIcon = isPositive ? ArrowUpRight : ArrowDownRight;

							return (
								<button
									key={outcome.id}
									type="button"
									className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-accent/50"
									onClick={() => onSelect?.(outcome)}
								>
									<div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted">
										<PnlIcon
											className={`h-4 w-4 ${isPositive ? 'text-green-600' : 'text-red-600'}`}
										/>
									</div>
									<div className="min-w-0 flex-1">
										<div className="flex items-center gap-2">
											<span className="font-medium text-foreground">{outcome.symbol}</span>
											<Badge
												variant={outcome.action === 'buy' ? 'default' : 'secondary'}
												className="text-xs"
											>
												{outcome.action.toUpperCase()}
											</Badge>
											{outcome.exitReason && (
												<span className="text-xs text-muted-foreground">
													{t(exitReasonKeys[outcome.exitReason] ?? outcome.exitReason)}
												</span>
											)}
										</div>
										<div className="flex gap-3 text-xs text-muted-foreground">
											<span>
												${outcome.entryPrice.toFixed(2)} →{' '}
												{outcome.exitPrice !== null ? `$${outcome.exitPrice.toFixed(2)}` : '...'}
											</span>
											<span>{formatDuration(outcome.holdingDurationMs)}</span>
										</div>
									</div>
									<div className="text-right">
										{outcome.realizedPnlPct !== null ? (
											<>
												<p
													className={`text-sm font-semibold ${isPositive ? 'text-green-600' : 'text-red-600'}`}
												>
													{isPositive ? '+' : ''}
													{outcome.realizedPnlPct.toFixed(2)}%
												</p>
												<p className={`text-xs ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
													{isPositive ? '+' : ''}${outcome.realizedPnl?.toFixed(2)}
												</p>
											</>
										) : (
											<Badge variant="outline" className="text-xs">
												{t('tracking')}
											</Badge>
										)}
									</div>
								</button>
							);
						})}
					</div>
				</ScrollArea>
			</CardContent>
		</Card>
	);
}
