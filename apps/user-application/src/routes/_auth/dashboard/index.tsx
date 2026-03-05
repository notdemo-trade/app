import { createFileRoute } from '@tanstack/react-router';
import { AccountSummary } from '@/components/portfolio/account-summary';
import { MarketStatusBanner } from '@/components/portfolio/market-status-banner';
import { OrdersTable } from '@/components/portfolio/orders-table';
import { PortfolioErrorBoundary } from '@/components/portfolio/portfolio-error-boundary';
import { PositionsTable } from '@/components/portfolio/positions-table';
import { formatTime } from '@/lib/formatters';
import { useAccount, useClock, useOrders, usePositions } from '@/lib/portfolio-queries';

export const Route = createFileRoute('/_auth/dashboard/')({
	component: DashboardPage,
});

function DashboardPage() {
	const account = useAccount();
	const positions = usePositions();
	const orders = useOrders({ limit: 10 });
	const clock = useClock();

	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between">
				<MarketStatusBanner clock={clock.data ?? null} />
				{account.dataUpdatedAt > 0 && (
					<span className="text-xs text-muted-foreground">
						Updated {formatTime(new Date(account.dataUpdatedAt).toISOString())}
					</span>
				)}
			</div>
			{account.error ? (
				<PortfolioErrorBoundary error={account.error} />
			) : (
				<AccountSummary account={account.data ?? null} />
			)}
			<PositionsTable positions={positions.data ?? []} />
			<OrdersTable orders={orders.data ?? []} />
		</div>
	);
}
