import type {
	DiscussionMessage as DiscussionMessageType,
	DiscussionPhase,
	MessageSender,
} from '@repo/data-ops/agents/session/types';
import {
	BarChart3,
	Bot,
	Database,
	Gavel,
	ShieldCheck,
	TrendingDown,
	TrendingUp,
	User,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface SenderDisplay {
	icon: ReactNode;
	name: string;
	colorClass: string;
}

function getSenderDisplay(sender: MessageSender): SenderDisplay {
	switch (sender.type) {
		case 'system':
			return {
				icon: <Bot className="h-4 w-4" />,
				name: 'System',
				colorClass: 'text-muted-foreground bg-muted',
			};
		case 'data_agent':
			return {
				icon: <Database className="h-4 w-4" />,
				name: sender.name,
				colorClass: 'text-blue-600 bg-blue-100 dark:text-blue-400 dark:bg-blue-950',
			};
		case 'analysis_agent':
			return {
				icon: <BarChart3 className="h-4 w-4" />,
				name: sender.name,
				colorClass: 'text-purple-600 bg-purple-100 dark:text-purple-400 dark:bg-purple-950',
			};
		case 'persona':
			return getPersonaDisplay(sender.persona);
		case 'moderator':
			return {
				icon: <Gavel className="h-4 w-4" />,
				name: 'Moderator',
				colorClass: 'text-amber-600 bg-amber-100 dark:text-amber-400 dark:bg-amber-950',
			};
		case 'broker':
			return {
				icon: <ShieldCheck className="h-4 w-4" />,
				name: sender.name,
				colorClass: 'text-green-600 bg-green-100 dark:text-green-400 dark:bg-green-950',
			};
		case 'user':
			return {
				icon: <User className="h-4 w-4" />,
				name: 'You',
				colorClass: 'text-indigo-600 bg-indigo-100 dark:text-indigo-400 dark:bg-indigo-950',
			};
	}
}

function getPersonaDisplay(persona: string): SenderDisplay {
	switch (persona) {
		case 'bull_analyst':
			return {
				icon: <TrendingUp className="h-4 w-4" />,
				name: 'Bull Analyst',
				colorClass: 'text-green-600 bg-green-100 dark:text-green-400 dark:bg-green-950',
			};
		case 'bear_analyst':
			return {
				icon: <TrendingDown className="h-4 w-4" />,
				name: 'Bear Analyst',
				colorClass: 'text-red-600 bg-red-100 dark:text-red-400 dark:bg-red-950',
			};
		case 'risk_manager':
			return {
				icon: <ShieldCheck className="h-4 w-4" />,
				name: 'Risk Manager',
				colorClass: 'text-yellow-600 bg-yellow-100 dark:text-yellow-400 dark:bg-yellow-950',
			};
		default:
			return {
				icon: <Bot className="h-4 w-4" />,
				name: persona,
				colorClass: 'text-muted-foreground bg-muted',
			};
	}
}

const PHASE_CONFIG: Record<
	DiscussionPhase,
	{
		label: string;
		variant: 'default' | 'secondary' | 'outline' | 'destructive' | 'success' | 'warning';
	}
> = {
	data_collection: { label: 'Data', variant: 'secondary' },
	analysis: { label: 'Analysis', variant: 'secondary' },
	debate_round: { label: 'Debate', variant: 'warning' },
	consensus: { label: 'Consensus', variant: 'success' },
	proposal: { label: 'Proposal', variant: 'default' },
	human_decision: { label: 'Awaiting Decision', variant: 'warning' },
	execution: { label: 'Executing', variant: 'success' },
	completed: { label: 'Done', variant: 'outline' },
};

function formatRelativeTime(timestamp: number): string {
	const seconds = Math.floor((Date.now() - timestamp) / 1000);
	if (seconds < 60) return `${seconds}s ago`;
	const minutes = Math.floor(seconds / 60);
	if (minutes < 60) return `${minutes}m ago`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h ago`;
	const days = Math.floor(hours / 24);
	return `${days}d ago`;
}

interface DiscussionMessageProps {
	message: DiscussionMessageType;
}

export function DiscussionMessage({ message }: DiscussionMessageProps) {
	const { icon, name, colorClass } = getSenderDisplay(message.sender);
	const phaseConfig = PHASE_CONFIG[message.phase];

	return (
		<div className="flex gap-3 py-2">
			<div
				className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-full', colorClass)}
			>
				{icon}
			</div>
			<div className="min-w-0 flex-1">
				<div className="flex items-center gap-2">
					<span className="text-sm font-medium text-foreground">{name}</span>
					<Badge variant={phaseConfig.variant} className="text-[10px] px-1.5 py-0">
						{phaseConfig.label}
					</Badge>
					<span className="text-xs text-muted-foreground">
						{formatRelativeTime(message.timestamp)}
					</span>
				</div>
				<div className="mt-0.5 whitespace-pre-wrap text-sm text-foreground">{message.content}</div>
				{message.metadata.confidence !== undefined && (
					<Badge
						variant={
							(message.metadata.confidence as number) >= 0.7
								? 'success'
								: (message.metadata.confidence as number) >= 0.4
									? 'warning'
									: 'destructive'
						}
						className="mt-1"
					>
						{((message.metadata.confidence as number) * 100).toFixed(0)}% confidence
					</Badge>
				)}
				{message.metadata.action && (
					<Badge
						variant={(message.metadata.action as string) === 'buy' ? 'success' : 'destructive'}
						className="mt-1 ml-1"
					>
						{(message.metadata.action as string).toUpperCase()}
					</Badge>
				)}
			</div>
		</div>
	);
}
