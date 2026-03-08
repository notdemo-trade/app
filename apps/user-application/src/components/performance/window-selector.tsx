import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface WindowSelectorProps {
	value: number;
	onChange: (window: number) => void;
	windows?: number[];
}

export function WindowSelector({ value, onChange, windows }: WindowSelectorProps) {
	const displayWindows = windows ?? [30, 90, 180];

	return (
		<div className="flex gap-1 rounded-lg border border-border bg-muted p-1">
			{displayWindows.map((w) => (
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
