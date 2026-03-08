import type { TradeProposal } from '@repo/data-ops/agents/session/types';
import { AlertTriangle, ArrowDown, ArrowUp, Check, Clock, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslations } from 'use-intl';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import { InfoTip } from '@/components/ui/info-tip';
import { cn } from '@/lib/utils';

function formatCurrency(value: number): string {
	return new Intl.NumberFormat('en-US', {
		style: 'currency',
		currency: 'USD',
		minimumFractionDigits: 2,
	}).format(value);
}

function formatDuration(ms: number): string {
	if (ms <= 0) return 'Expired';
	const seconds = Math.floor(ms / 1000);
	if (seconds < 60) return `${seconds}s`;
	const minutes = Math.floor(seconds / 60);
	const remainingSeconds = seconds % 60;
	return `${minutes}m ${remainingSeconds}s`;
}

function useCountdown(expiresAt: number): number {
	const [timeLeft, setTimeLeft] = useState(() => Math.max(0, expiresAt - Date.now()));

	useEffect(() => {
		if (timeLeft <= 0) return;

		const interval = setInterval(() => {
			const remaining = Math.max(0, expiresAt - Date.now());
			setTimeLeft(remaining);
			if (remaining <= 0) {
				clearInterval(interval);
			}
		}, 1000);

		return () => clearInterval(interval);
	}, [expiresAt, timeLeft]);

	return timeLeft;
}

const PROPOSAL_STATUS_CONFIG: Record<
	TradeProposal['status'],
	{
		label: string;
		variant: 'default' | 'secondary' | 'success' | 'destructive' | 'warning' | 'outline';
	}
> = {
	pending: { label: 'Pending', variant: 'warning' },
	approved: { label: 'Approved', variant: 'success' },
	rejected: { label: 'Rejected', variant: 'destructive' },
	expired: { label: 'Expired', variant: 'secondary' },
	executed: { label: 'Executed', variant: 'success' },
};

interface StatProps {
	label: string;
	value: string;
	tip?: string;
}

function Stat({ label, value, tip }: StatProps) {
	return (
		<div>
			<div className="flex items-center gap-1 text-xs text-muted-foreground">
				{label}
				{tip && <InfoTip content={tip} side="top" />}
			</div>
			<div className="font-mono text-sm text-foreground">{value}</div>
		</div>
	);
}

interface TradeProposalCardProps {
	proposal: TradeProposal;
	onApprove?: () => void;
	onReject?: () => void;
}

export function TradeProposalCard({ proposal, onApprove, onReject }: TradeProposalCardProps) {
	const t = useTranslations();
	const timeLeft = useCountdown(proposal.expiresAt);
	const isPending = proposal.status === 'pending';
	const isBuy = proposal.action === 'buy';

	return (
		<Card
			className={cn(
				'border-2',
				isBuy
					? 'border-green-500/30 dark:border-green-500/20'
					: 'border-red-500/30 dark:border-red-500/20',
			)}
		>
			<CardHeader className="pb-3">
				<div className="flex items-center justify-between">
					<div className="flex items-center gap-2">
						{isBuy ? (
							<ArrowUp className="h-5 w-5 text-green-600 dark:text-green-400" />
						) : (
							<ArrowDown className="h-5 w-5 text-red-600 dark:text-red-400" />
						)}
						<Badge variant={isBuy ? 'success' : 'destructive'}>
							{proposal.action.toUpperCase()}
						</Badge>
						<span className="text-lg font-bold text-foreground">{proposal.symbol}</span>
					</div>
					<div className="flex items-center gap-1">
						<Badge
							variant={
								proposal.confidence >= 0.7
									? 'success'
									: proposal.confidence >= 0.4
										? 'warning'
										: 'destructive'
							}
						>
							{(proposal.confidence * 100).toFixed(0)}%
						</Badge>
						<InfoTip content={t('session.tips.confidence')} side="left" />
					</div>
				</div>
			</CardHeader>

			<CardContent className="space-y-3 pt-0">
				<p className="text-sm text-foreground">{proposal.rationale}</p>

				<div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
					{proposal.entryPrice !== null && (
						<Stat
							label="Entry"
							value={formatCurrency(proposal.entryPrice)}
							tip={t('session.tips.entry')}
						/>
					)}
					{proposal.targetPrice !== null && (
						<Stat
							label="Target"
							value={formatCurrency(proposal.targetPrice)}
							tip={t('session.tips.target')}
						/>
					)}
					{proposal.stopLoss !== null && (
						<Stat
							label="Stop Loss"
							value={formatCurrency(proposal.stopLoss)}
							tip={t('session.tips.stopLoss')}
						/>
					)}
					<Stat
						label="Size"
						value={`${(proposal.positionSizePct * 100).toFixed(1)}%`}
						tip={t('session.tips.size')}
					/>
					{proposal.qty !== null && (
						<Stat label="Qty" value={String(proposal.qty)} tip={t('session.tips.qty')} />
					)}
					{proposal.notional !== null && (
						<Stat
							label="Notional"
							value={formatCurrency(proposal.notional)}
							tip={t('session.tips.notional')}
						/>
					)}
				</div>

				{proposal.risks.length > 0 && (
					<div className="rounded-md bg-muted p-2">
						<div className="mb-1 flex items-center gap-1 text-xs font-medium text-warning-foreground">
							<AlertTriangle className="h-3 w-3" />
							Risks
						</div>
						<ul className="list-inside list-disc space-y-0.5 text-xs text-muted-foreground">
							{proposal.risks.map((risk) => (
								<li key={risk}>{risk}</li>
							))}
						</ul>
					</div>
				)}
			</CardContent>

			{isPending && onApprove && onReject && (
				<CardFooter className="flex items-center justify-between border-t border-border pt-4">
					<span className="flex items-center gap-1 text-xs text-muted-foreground">
						<Clock className="h-3 w-3" />
						{formatDuration(timeLeft)}
					</span>
					<div className="flex gap-2">
						<Button variant="outline" size="sm" onClick={onReject}>
							<X className="h-4 w-4" />
							Reject
						</Button>
						<Button variant={isBuy ? 'default' : 'destructive'} size="sm" onClick={onApprove}>
							<Check className="h-4 w-4" />
							Approve {proposal.action.toUpperCase()}
						</Button>
					</div>
				</CardFooter>
			)}

			{!isPending && (
				<CardFooter className="border-t border-border pt-4">
					<Badge variant={PROPOSAL_STATUS_CONFIG[proposal.status].variant}>
						{PROPOSAL_STATUS_CONFIG[proposal.status].label}
					</Badge>
					{proposal.decidedAt && (
						<span className="ml-2 text-xs text-muted-foreground">
							{new Date(proposal.decidedAt).toLocaleString()}
						</span>
					)}
				</CardFooter>
			)}
		</Card>
	);
}
