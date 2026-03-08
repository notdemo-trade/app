import { Label } from '@/components/ui/label';

interface ConfidencePreviewProps {
	high: number;
	med: number;
}

export function ConfidencePreview({ high, med }: ConfidencePreviewProps) {
	const lowPct = med * 100;
	const medPct = (high - med) * 100;
	const highPct = (1 - high) * 100;

	return (
		<div className="space-y-1">
			<Label className="text-xs text-muted-foreground">Confidence Band Preview</Label>
			<div className="flex h-6 w-full overflow-hidden rounded-md border border-border">
				<div
					className="flex items-center justify-center bg-red-500/20 text-xs text-red-700 dark:text-red-400"
					style={{ width: `${lowPct}%` }}
				>
					{lowPct > 15 && 'Low'}
				</div>
				<div
					className="flex items-center justify-center bg-yellow-500/20 text-xs text-yellow-700 dark:text-yellow-400"
					style={{ width: `${medPct}%` }}
				>
					{medPct > 15 && 'Med'}
				</div>
				<div
					className="flex items-center justify-center bg-green-500/20 text-xs text-green-700 dark:text-green-400"
					style={{ width: `${highPct}%` }}
				>
					{highPct > 15 && 'High'}
				</div>
			</div>
			<div className="flex justify-between text-xs text-muted-foreground">
				<span>0%</span>
				<span>{(med * 100).toFixed(0)}%</span>
				<span>{(high * 100).toFixed(0)}%</span>
				<span>100%</span>
			</div>
		</div>
	);
}
