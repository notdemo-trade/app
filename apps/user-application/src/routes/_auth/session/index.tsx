import { createFileRoute } from '@tanstack/react-router';
import { Bot, Play, RefreshCw, Send, Settings, User } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { DiscussionThread, SessionSettings, TradeProposalCard } from '@/components/agents';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
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

function SessionDashboard({ userId }: SessionDashboardProps) {
	const session = useSession(userId);
	const feed = useDiscussionFeed(session.state);
	const [showSettings, setShowSettings] = useState(false);

	const isEnabled = session.state?.enabled ?? false;
	const cycleCount = session.state?.cycleCount ?? 0;
	const errorCount = session.state?.errorCount ?? 0;
	const pendingProposalCount = session.state?.pendingProposalCount ?? 0;
	const pendingProposal =
		session.state?.activeThread?.proposal?.status === 'pending'
			? session.state.activeThread.proposal
			: null;

	return (
		<div className="space-y-4">
			{/* Header */}
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-2xl font-bold text-foreground">Session Agent</h1>
					<p className="text-sm text-muted-foreground">AI-powered trade analysis and execution</p>
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
							<span className="text-sm font-medium text-foreground">Agent</span>
							<Switch
								checked={isEnabled}
								onCheckedChange={(checked) => (checked ? session.start() : session.stop())}
							/>
							<Badge variant={isEnabled ? 'success' : 'secondary'}>
								{isEnabled ? 'Running' : 'Stopped'}
							</Badge>
						</div>
						<div className="hidden items-center gap-4 text-sm sm:flex">
							<div className="text-muted-foreground">
								Cycles: <span className="font-mono text-foreground">{cycleCount}</span>
							</div>
							<div className="text-muted-foreground">
								Errors: <span className="font-mono text-foreground">{errorCount}</span>
							</div>
							{pendingProposalCount > 0 && (
								<Badge variant="warning">{pendingProposalCount} pending</Badge>
							)}
						</div>
					</div>
					<div className="flex gap-2">
						{isEnabled && (
							<Button
								variant="outline"
								size="sm"
								onClick={() =>
									session.triggerAnalysis(session.state?.activeThread?.symbol ?? 'AAPL')
								}
							>
								<RefreshCw className="h-4 w-4" />
								Trigger
							</Button>
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
						/>
					) : (
						<Card>
							<CardContent className="flex flex-col items-center justify-center py-12 text-center">
								<Bot className="mb-3 h-10 w-10 text-muted-foreground" />
								<h3 className="text-sm font-medium text-foreground">No active analysis</h3>
								<p className="mt-1 text-xs text-muted-foreground">
									Start the agent or trigger a manual analysis to begin.
								</p>
								{!isEnabled && (
									<Button className="mt-4" size="sm" onClick={() => session.start()}>
										<Play className="h-4 w-4" />
										Start Agent
									</Button>
								)}
							</CardContent>
						</Card>
					)}

					{/* Chat Messages */}
					{session.messages.length > 0 && <ChatMessages session={session} />}

					{/* Chat Input */}
					<ChatInput session={session} />
				</div>

				{/* Sidebar: Pending Proposals */}
				<div className="space-y-3">
					<h3 className="text-sm font-semibold text-muted-foreground">Pending Proposals</h3>
					{pendingProposal ? (
						<TradeProposalCard
							proposal={pendingProposal}
							onApprove={() => session.approveProposal(pendingProposal.id)}
							onReject={() => session.rejectProposal(pendingProposal.id)}
						/>
					) : (
						<Card>
							<CardContent className="py-6 text-center text-sm text-muted-foreground">
								No pending proposals
							</CardContent>
						</Card>
					)}

					{/* Last Error */}
					{session.state?.lastError && (
						<Card className="border-destructive/50">
							<CardHeader className="pb-2">
								<CardTitle className="text-sm text-destructive">Last Error</CardTitle>
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

function ChatMessages({ session }: { session: ReturnType<typeof useSession> }) {
	const scrollRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
	});

	return (
		<Card>
			<CardContent className="py-3">
				<ScrollArea className="max-h-[300px]" ref={scrollRef}>
					<div className="space-y-3 pr-2">
						{session.messages.map((msg) => {
							const textParts = (msg.parts ?? []).filter(
								(p): p is { type: 'text'; text: string } => p.type === 'text',
							);
							const text = textParts.length > 0 ? textParts.map((p) => p.text).join('') : '';
							if (!text) return null;

							return (
								<div
									key={msg.id}
									className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
								>
									{msg.role !== 'user' && (
										<Bot className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
									)}
									<div
										className={`max-w-[80%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap ${
											msg.role === 'user'
												? 'bg-primary text-primary-foreground'
												: 'bg-muted text-foreground'
										}`}
									>
										{text}
									</div>
									{msg.role === 'user' && (
										<User className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
									)}
								</div>
							);
						})}
					</div>
				</ScrollArea>
			</CardContent>
		</Card>
	);
}

interface ChatInputProps {
	session: ReturnType<typeof useSession>;
}

function ChatInput({ session }: ChatInputProps) {
	const [input, setInput] = useState('');

	return (
		<Card>
			<CardContent className="py-3">
				<form
					onSubmit={(e) => {
						e.preventDefault();
						if (!input.trim()) return;
						session.sendMessage({ text: input });
						setInput('');
					}}
					className="flex gap-2"
				>
					<Input
						value={input}
						onChange={(e) => setInput(e.target.value)}
						placeholder="Ask the agent to analyze a symbol, check positions, etc."
						className="flex-1"
					/>
					<Button type="submit" size="icon" disabled={!input.trim()}>
						<Send className="h-4 w-4" />
					</Button>
				</form>
			</CardContent>
		</Card>
	);
}
