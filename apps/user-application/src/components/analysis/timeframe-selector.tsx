import type { Timeframe } from '@repo/data-ops/agents/ta/types';
import { Button } from '@/components/ui/button';

interface TimeframeSelectorProps {
	value: Timeframe;
	onChange: (tf: Timeframe) => void;
}

const TIMEFRAMES: { value: Timeframe; label: string }[] = [
	{ value: '1Min', label: '1m' },
	{ value: '5Min', label: '5m' },
	{ value: '15Min', label: '15m' },
	{ value: '1Hour', label: '1h' },
	{ value: '1Day', label: '1D' },
];

export function TimeframeSelector({ value, onChange }: TimeframeSelectorProps) {
	return (
		<div className="flex gap-1">
			{TIMEFRAMES.map((tf) => (
				<Button
					key={tf.value}
					variant={value === tf.value ? 'default' : 'outline'}
					size="sm"
					onClick={() => onChange(tf.value)}
					className="min-w-[40px]"
				>
					{tf.label}
				</Button>
			))}
		</div>
	);
}
