import { createFileRoute, Link } from '@tanstack/react-router';
import { Bot, Clock, History, Play, RefreshCw, Settings } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'use-intl';
import { DiscussionThread, SessionSettings, TradeProposalCard } from '@/components/agents';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { InfoTip } from '@/components/ui/info-tip';
import { Switch } from '@/components/ui/switch';
import { useDiscussionFeed } from '@/hooks/use-discussion-feed';
import { authClient } from '@/lib/auth-client';
import { useSession } from '@/lib/session-connection';

export const Route = createFileRoute('/_auth/session/')({
	component: SessionPage,
});

function SessionPage() {
	const { data: authSession } = authClient.useSession();
	const userId = authSession?.user?.id;

	if (!userId) return null;

	return <SessionDashboard userId={userId} />;
}

interface SessionDashboardProps {
	userId: string;
}

function useNextCycleCountdown(enabled: boolean, lastCycleAt: number | null, intervalSec: number) {
	const computeRemaining = useCallback(() => {
		if (!enabled || !lastCycleAt) return null;
		const nextAt = lastCycleAt + intervalSec * 1000;
		const remaining = Math.max(0, Math.ceil((nextAt - Date.now()) / 1000));
		return remaining;
	}, [enabled, lastCycleAt, intervalSec]);

	const [remaining, setRemaining] = useState(computeRemaining);

	useEffect(() => {
		setRemaining(computeRemaining());
		if (!enabled || !lastCycleAt) return;
		const id = setInterval(() => setRemaining(computeRemaining()), 1000);
		return () => clearInterval(id);
	}, [enabled, lastCycleAt, computeRemaining]);

	if (remaining === null) return null;
	if (remaining === 0) return 'Due...';
	const mins = Math.floor(remaining / 60);
	const secs = remaining % 60;
	return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function SessionDashboard({ userId }: SessionDashboardProps) {
	const t = useTranslations();
	const session = useSession(userId);
	const feed = useDiscussionFeed(session.state);
	const [showSettings, setShowSettings] = useState(false);

	const isEnabled = session.state?.enabled ?? false;
	const cycleCount = session.state?.cycleCount ?? 0;
	const errorCount = session.state?.errorCount ?? 0;
	const countdown = useNextCycleCountdown(
		isEnabled,
		session.state?.lastCycleAt ?? null,
		session.state?.analysisIntervalSec ?? 120,
	);
	const pendingProposalCount = session.state?.pendingProposalCount ?? 0;
	const activeProposal = session.state?.activeThread?.proposal ?? null;
	const pendingProposal = activeProposal?.status === 'pending' ? activeProposal : null;
	const failedProposal = activeProposal?.status === 'failed' ? activeProposal : null;

	return (
		<div className="space-y-4">
			{/* Header */}
			<div className="flex items-center justify-between">
				<div>
					<div className="flex items-center gap-2">
						<h1 className="text-2xl font-bold text-foreground">{t('session.title')}</h1>
						<InfoTip content={t('session.tips.title')} side="right" />
					</div>
					<p className="text-sm text-muted-foreground">{t('session.subtitle')}</p>
				</div>
				<div className="flex items-center gap-3">
					<Button
						variant="ghost"
						size="icon"
						onClick={() => setShowSettings(!showSettings)}
						aria-label="Toggle settings"
					>
						<Settings className="h-5 w-5 text-muted-foreground" />
					</Button>
				</div>
			</div>

			{/* Status Bar */}
			<Card>
				<CardContent className="flex items-center justify-between py-3">
					<div className="flex items-center gap-4">
						<div className="flex items-center gap-2">
							<Bot className="h-5 w-5 text-muted-foreground" />
							<span className="text-sm font-medium text-foreground">{t('sessionPage.agent')}</span>
							<Switch
								checked={isEnabled}
								onCheckedChange={(checked) => (checked ? session.start() : session.stop())}
							/>
							<Badge variant={isEnabled ? 'success' : 'secondary'}>
								{isEnabled ? t('sessionPage.running') : t('sessionPage.stopped')}
							</Badge>
							<InfoTip content={t('session.tips.agentToggle')} side="bottom" />
						</div>
						<div className="hidden items-center gap-4 text-sm sm:flex">
							<div className="flex items-center gap-1 text-muted-foreground">
								{t('sessionPage.cycles')}{' '}
								<span className="font-mono text-foreground">{cycleCount}</span>
								<InfoTip content={t('session.tips.cycles')} side="bottom" />
							</div>
							<div className="flex items-center gap-1 text-muted-foreground">
								{t('sessionPage.errors')}{' '}
								<span className="font-mono text-foreground">{errorCount}</span>
								<InfoTip content={t('session.tips.errors')} side="bottom" />
							</div>
							{countdown && (
								<div className="flex items-center gap-1 text-muted-foreground">
									<Clock className="h-3.5 w-3.5" />
									{t('sessionPage.next')}{' '}
									<span className="font-mono text-foreground">{countdown}</span>
								</div>
							)}
							{pendingProposalCount > 0 && (
								<div className="flex items-center gap-1">
									<Badge variant="warning">
										{t('sessionPage.pending', { count: pendingProposalCount })}
									</Badge>
									<InfoTip content={t('session.tips.pending')} side="bottom" />
								</div>
							)}
						</div>
					</div>
					<div className="flex items-center gap-2">
						{isEnabled && (
							<>
								<Button
									variant="outline"
									size="sm"
									onClick={() =>
										session.triggerAnalysis(session.state?.activeThread?.symbol ?? 'AAPL')
									}
								>
									<RefreshCw className="h-4 w-4" />
									{t('sessionPage.trigger')}
								</Button>
								<InfoTip content={t('session.tips.trigger')} side="left" />
							</>
						)}
					</div>
				</CardContent>
			</Card>

			{/* Settings Panel (conditional) */}
			{showSettings && <SessionSettings session={session} />}

			{/* Main Content */}
			<div className="grid gap-4 lg:grid-cols-3">
				{/* Discussion Feed (main area) */}
				<div className="space-y-4 lg:col-span-2">
					{feed.thread ? (
						<DiscussionThread
							thread={feed.thread}
							onApproveProposal={(id) => session.approveProposal(id)}
							onRejectProposal={(id) => session.rejectProposal(id)}
							onRetryProposal={(id) => session.retryProposal(id)}
						/>
					) : (
						<Card>
							<CardContent className="flex flex-col items-center justify-center py-12 text-center">
								<Bot className="mb-3 h-10 w-10 text-muted-foreground" />
								<h3 className="text-sm font-medium text-foreground">
									{t('sessionPage.noActiveAnalysis')}
								</h3>
								<p className="mt-1 text-xs text-muted-foreground">{t('session.tips.noAnalysis')}</p>
								{!isEnabled && (
									<Button className="mt-4" size="sm" onClick={() => session.start()}>
										<Play className="h-4 w-4" />
										{t('sessionPage.startAgent')}
									</Button>
								)}
							</CardContent>
						</Card>
					)}
				</div>

				{/* Sidebar: Pending Proposals */}
				<div className="space-y-3">
					<div className="flex items-center gap-1">
						<h3 className="text-sm font-semibold text-muted-foreground">
							{t('sessionPage.pendingProposals')}
						</h3>
						<InfoTip content={t('session.tips.pendingProposals')} side="left" />
					</div>
					{pendingProposal ? (
						<TradeProposalCard
							proposal={pendingProposal}
							onApprove={() => session.approveProposal(pendingProposal.id)}
							onReject={() => session.rejectProposal(pendingProposal.id)}
						/>
					) : failedProposal ? (
						<TradeProposalCard
							proposal={failedProposal}
							onRetry={() => session.retryProposal(failedProposal.id)}
						/>
					) : (
						<Card>
							<CardContent className="py-6 text-center text-sm text-muted-foreground">
								{t('sessionPage.noPendingProposals')}
							</CardContent>
						</Card>
					)}

					{/* Proposal History Link */}
					<Link
						to="/session/proposals"
						className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
					>
						<History className="h-4 w-4" />
						{t('sessionPage.proposalHistory')}
					</Link>

					{/* Last Error */}
					{session.state?.lastError && (
						<Card className="border-destructive/50">
							<CardHeader className="pb-2">
								<div className="flex items-center gap-1">
									<CardTitle className="text-sm text-destructive">
										{t('sessionPage.lastError')}
									</CardTitle>
									<InfoTip content={t('session.tips.lastError')} side="left" />
								</div>
							</CardHeader>
							<CardContent>
								<p className="text-xs text-muted-foreground">{session.state.lastError}</p>
							</CardContent>
						</Card>
					)}
				</div>
			</div>
		</div>
	);
}
