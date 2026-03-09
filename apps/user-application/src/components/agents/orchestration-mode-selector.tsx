import { GitBranch, List } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslations } from 'use-intl';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

type OrchestrationMode = 'debate' | 'pipeline';

interface ModeOption {
	value: OrchestrationMode;
	titleKey: string;
	descriptionKey: string;
	icon: ReactNode;
}

const MODE_OPTIONS: ModeOption[] = [
	{
		value: 'debate',
		titleKey: 'orchestrationMode.debate.title',
		descriptionKey: 'orchestrationMode.debate.description',
		icon: <GitBranch className="h-5 w-5" />,
	},
	{
		value: 'pipeline',
		titleKey: 'orchestrationMode.pipeline.title',
		descriptionKey: 'orchestrationMode.pipeline.description',
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
	const t = useTranslations();
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
									<div className="text-sm font-medium text-foreground">{t(option.titleKey)}</div>
									<div className="mt-0.5 text-xs text-muted-foreground">
										{t(option.descriptionKey)}
									</div>
								</div>
							</CardContent>
						</Card>
					</button>
				);
			})}
		</div>
	);
}
