import type { Account } from '@repo/data-ops/providers/alpaca';
import { Link } from '@tanstack/react-router';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCurrency } from '@/lib/formatters';
import { cn } from '@/lib/utils';

interface AccountSummaryProps {
	account: Account | null;
}

export function AccountSummary({ account }: AccountSummaryProps) {
	if (!account) {
		return (
			<Card>
				<CardContent className="py-8 text-center">
					<h3 className="text-lg font-semibold text-foreground">Connect Your Broker</h3>
					<p className="text-muted-foreground mt-2">
						Add your Alpaca API credentials to view your portfolio.
					</p>
					<Button asChild className="mt-4">
						<Link to="/settings/credentials">Add Credentials</Link>
					</Button>
				</CardContent>
			</Card>
		);
	}

	const dayChange = account.equity - account.last_equity;
	const dayChangePct = account.last_equity > 0 ? (dayChange / account.last_equity) * 100 : 0;

	return (
		<Card>
			<CardHeader>
				<CardTitle>Account Overview</CardTitle>
				{account.trading_blocked && <Badge variant="destructive">Trading Blocked</Badge>}
			</CardHeader>
			<CardContent>
				<div className="grid grid-cols-2 md:grid-cols-4 gap-4">
					<StatCard
						label="Equity"
						value={formatCurrency(account.equity)}
						change={dayChange}
						changePct={dayChangePct}
					/>
					<StatCard label="Cash" value={formatCurrency(account.cash)} />
					<StatCard label="Buying Power" value={formatCurrency(account.buying_power)} />
					<StatCard label="Portfolio Value" value={formatCurrency(account.portfolio_value)} />
				</div>
			</CardContent>
		</Card>
	);
}

interface StatCardProps {
	label: string;
	value: string;
	change?: number;
	changePct?: number;
}

function StatCard({ label, value, change, changePct }: StatCardProps) {
	return (
		<div>
			<p className="text-sm text-muted-foreground">{label}</p>
			<p className="text-2xl font-semibold text-foreground">{value}</p>
			{change !== undefined && (
				<p className={cn('text-sm', change >= 0 ? 'text-green-600' : 'text-red-600')}>
					{change >= 0 ? '+' : ''}
					{formatCurrency(change)}
					{changePct !== undefined && ` (${changePct.toFixed(2)}%)`}
				</p>
			)}
		</div>
	);
}
