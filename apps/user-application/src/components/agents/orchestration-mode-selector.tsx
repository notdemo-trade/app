import { GitBranch, List } from 'lucide-react';
import type { ReactNode } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

type OrchestrationMode = 'debate' | 'pipeline';

interface ModeOption {
	value: OrchestrationMode;
	title: string;
	description: string;
	icon: ReactNode;
}

const MODE_OPTIONS: ModeOption[] = [
	{
		value: 'debate',
		title: 'Multi-Persona Debate',
		description:
			'3 AI personas (Bull, Bear, Risk Manager) analyze independently, then debate in rounds to reach consensus.',
		icon: <GitBranch className="h-5 w-5" />,
	},
	{
		value: 'pipeline',
		title: 'Sequential Pipeline',
		description:
			'Linear analysis chain: fetch data, compute indicators, LLM analysis, risk validation, generate proposal.',
		icon: <List className="h-5 w-5" />,
	},
];

interface OrchestrationModeSelectorProps {
	value: OrchestrationMode;
	onChange: (mode: OrchestrationMode) => void;
	disabled?: boolean;
}

export function OrchestrationModeSelector({
	value,
	onChange,
	disabled,
}: OrchestrationModeSelectorProps) {
	return (
		<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
			{MODE_OPTIONS.map((option) => {
				const isActive = value === option.value;
				return (
					<button
						key={option.value}
						type="button"
						disabled={disabled}
						onClick={() => onChange(option.value)}
						className="text-left"
					>
						<Card
							className={cn(
								'cursor-pointer transition-colors',
								isActive ? 'border-primary bg-primary/5' : 'hover:border-primary/50',
								disabled && 'cursor-not-allowed opacity-50',
							)}
						>
							<CardContent className="flex gap-3 pt-4">
								<div
									className={cn(
										'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg',
										isActive
											? 'bg-primary text-primary-foreground'
											: 'bg-muted text-muted-foreground',
									)}
								>
									{option.icon}
								</div>
								<div>
									<div className="text-sm font-medium text-foreground">{option.title}</div>
									<div className="mt-0.5 text-xs text-muted-foreground">{option.description}</div>
								</div>
							</CardContent>
						</Card>
					</button>
				);
			})}
		</div>
	);
}
