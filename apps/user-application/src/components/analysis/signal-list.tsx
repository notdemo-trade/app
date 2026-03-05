import type { TechnicalSignal } from '@repo/data-ops/agents/ta/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface SignalListProps {
	signals: TechnicalSignal[];
}

function DirectionIcon({ direction }: { direction: string }) {
	if (direction === 'bullish') {
		return <span className="text-green-500 font-bold">&#9650;</span>;
	}
	if (direction === 'bearish') {
		return <span className="text-red-500 font-bold">&#9660;</span>;
	}
	return <span className="text-muted-foreground font-bold">&#8212;</span>;
}

function StrengthBar({ strength }: { strength: number }) {
	const pct = Math.round(strength * 100);
	return (
		<div className="flex items-center gap-2 min-w-[80px]">
			<div className="flex-1 h-2 rounded bg-muted overflow-hidden">
				<div className="h-full rounded bg-primary" style={{ width: `${pct}%` }} />
			</div>
			<span className="text-xs text-muted-foreground w-8 text-right">{strength.toFixed(1)}</span>
		</div>
	);
}

export function SignalList({ signals }: SignalListProps) {
	const sorted = [...signals].sort((a, b) => b.strength - a.strength);

	return (
		<Card>
			<CardHeader className="pb-3">
				<CardTitle className="text-base">Signals ({signals.length})</CardTitle>
			</CardHeader>
			<CardContent>
				{sorted.length === 0 ? (
					<p className="text-sm text-muted-foreground">No signals detected</p>
				) : (
					<div className="space-y-2">
						{sorted.map((sig) => (
							<div key={sig.type} className="flex items-center gap-3 text-sm">
								<DirectionIcon direction={sig.direction} />
								<span className="flex-1 text-foreground">{sig.description}</span>
								<StrengthBar strength={sig.strength} />
							</div>
						))}
					</div>
				)}
			</CardContent>
		</Card>
	);
}
