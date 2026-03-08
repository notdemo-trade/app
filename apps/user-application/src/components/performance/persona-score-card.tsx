import type { CalibrationRating, PersonaScore } from '@repo/data-ops/agents/memory/types';
import { useTranslations } from 'use-intl';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface PersonaScoreCardProps {
	score: PersonaScore;
	personaName?: string;
}

function getCalibrationRating(calibration: number | null): CalibrationRating {
	if (calibration === null) return 'poor';
	if (calibration >= 0.5) return 'good';
	if (calibration >= 0.2) return 'fair';
	return 'poor';
}

const calibrationColors: Record<CalibrationRating, string> = {
	good: 'bg-green-500/10 text-green-600',
	fair: 'bg-yellow-500/10 text-yellow-600',
	poor: 'bg-red-500/10 text-red-600',
};

export function PersonaScoreCard({ score, personaName }: PersonaScoreCardProps) {
	const t = useTranslations('performance');
	const calibration = getCalibrationRating(score.confidenceCalibration);
	const winRatePct = score.winRate !== null ? (score.winRate * 100).toFixed(1) : '—';
	const avgPnl =
		score.avgPnlPct !== null
			? `${score.avgPnlPct >= 0 ? '+' : ''}${score.avgPnlPct.toFixed(2)}%`
			: '—';
	const sharpe = score.sharpeRatio !== null ? score.sharpeRatio.toFixed(2) : '—';

	return (
		<Card>
			<CardHeader className="pb-3">
				<div className="flex items-center justify-between">
					<CardTitle className="text-sm font-medium">{personaName ?? score.personaId}</CardTitle>
					<Badge className={calibrationColors[calibration]} variant="outline">
						{t(`calibration.${calibration}`)}
					</Badge>
				</div>
			</CardHeader>
			<CardContent className="space-y-3">
				<div className="grid grid-cols-3 gap-3">
					<div>
						<p className="text-xs text-muted-foreground">{t('winRate')}</p>
						<p className="text-lg font-semibold text-foreground">{winRatePct}%</p>
						<p className="text-xs text-muted-foreground">
							{score.correctProposals}/{score.totalProposals}
						</p>
					</div>
					<div>
						<p className="text-xs text-muted-foreground">{t('avgReturn')}</p>
						<p
							className={`text-lg font-semibold ${score.avgPnlPct !== null && score.avgPnlPct >= 0 ? 'text-green-600' : 'text-red-600'}`}
						>
							{avgPnl}
						</p>
					</div>
					<div>
						<p className="text-xs text-muted-foreground">{t('sharpe')}</p>
						<p className="text-lg font-semibold text-foreground">{sharpe}</p>
					</div>
				</div>
				{(score.bestSymbol || score.worstSymbol) && (
					<div className="flex gap-4 border-t border-border pt-3 text-xs">
						{score.bestSymbol && (
							<div>
								<span className="text-muted-foreground">{t('bestSymbol')}: </span>
								<span className="font-medium text-green-600">
									{score.bestSymbol} (
									{score.bestSymbolPnlPct !== null ? `+${score.bestSymbolPnlPct.toFixed(1)}%` : ''})
								</span>
							</div>
						)}
						{score.worstSymbol && (
							<div>
								<span className="text-muted-foreground">{t('worstSymbol')}: </span>
								<span className="font-medium text-red-600">
									{score.worstSymbol} (
									{score.worstSymbolPnlPct !== null ? `${score.worstSymbolPnlPct.toFixed(1)}%` : ''}
									)
								</span>
							</div>
						)}
					</div>
				)}
			</CardContent>
		</Card>
	);
}
