import type { MarketClock } from '@repo/data-ops/providers/alpaca';
import { formatDateTime, formatTime } from '@/lib/formatters';
import { cn } from '@/lib/utils';

interface MarketStatusBannerProps {
	clock: MarketClock | null;
}

export function MarketStatusBanner({ clock }: MarketStatusBannerProps) {
	if (!clock) return null;

	return (
		<div
			className={cn(
				'rounded-lg px-4 py-2 text-sm',
				clock.is_open
					? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
					: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
			)}
		>
			{clock.is_open ? (
				<span>Market Open - Closes {formatTime(clock.next_close)}</span>
			) : (
				<span>Market Closed - Opens {formatDateTime(clock.next_open)}</span>
			)}
		</div>
	);
}
