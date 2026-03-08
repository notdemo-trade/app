import type { ScoreWindow } from '@repo/data-ops/agents/memory/types';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface WindowSelectorProps {
	value: ScoreWindow;
	onChange: (window: ScoreWindow) => void;
}

const WINDOWS: ScoreWindow[] = [30, 90, 180];

export function WindowSelector({ value, onChange }: WindowSelectorProps) {
	return (
		<div className="flex gap-1 rounded-lg border border-border bg-muted p-1">
			{WINDOWS.map((w) => (
				<Button
					key={w}
					variant="ghost"
					size="sm"
					className={cn(
						'h-7 px-3 text-xs font-medium',
						value === w && 'bg-background text-foreground shadow-sm',
						value !== w && 'text-muted-foreground hover:text-foreground',
					)}
					onClick={() => onChange(w)}
				>
					{w}d
				</Button>
			))}
		</div>
	);
}
