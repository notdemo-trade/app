import { Info } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface InfoTipProps {
	content: string;
	side?: 'top' | 'bottom' | 'left' | 'right';
	className?: string;
}

export function InfoTip({ content, side = 'top', className }: InfoTipProps) {
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<button
					type="button"
					className={cn(
						'inline-flex items-center justify-center rounded-full text-muted-foreground/50 hover:text-muted-foreground transition-colors',
						className,
					)}
				>
					<Info className="h-3.5 w-3.5" />
				</button>
			</TooltipTrigger>
			<TooltipContent side={side} className="max-w-xs">
				{content}
			</TooltipContent>
		</Tooltip>
	);
}
