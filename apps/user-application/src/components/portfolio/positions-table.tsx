import type { Position } from '@repo/data-ops/providers/alpaca';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@/components/ui/table';
import { formatCurrency } from '@/lib/formatters';
import { cn } from '@/lib/utils';

interface PositionsTableProps {
	positions: Position[];
}

export function PositionsTable({ positions }: PositionsTableProps) {
	const sorted = [...positions].sort((a, b) => b.market_value - a.market_value);

	if (sorted.length === 0) {
		return (
			<Card>
				<CardHeader>
					<CardTitle>Positions</CardTitle>
				</CardHeader>
				<CardContent>
					<p className="text-muted-foreground">No open positions</p>
				</CardContent>
			</Card>
		);
	}

	const totalPL = positions.reduce((sum, p) => sum + p.unrealized_pl, 0);

	return (
		<Card>
			<CardHeader>
				<CardTitle>Positions ({positions.length})</CardTitle>
				<p className={cn('text-sm', totalPL >= 0 ? 'text-green-600' : 'text-red-600')}>
					Total P&L: {formatCurrency(totalPL)}
				</p>
			</CardHeader>
			<CardContent>
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Symbol</TableHead>
							<TableHead className="text-right">Qty</TableHead>
							<TableHead className="text-right">Avg Cost</TableHead>
							<TableHead className="text-right">Price</TableHead>
							<TableHead className="text-right">Value</TableHead>
							<TableHead className="text-right">P&L</TableHead>
							<TableHead className="text-right">%</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{sorted.map((pos) => (
							<TableRow key={pos.asset_id}>
								<TableCell className="font-medium">
									{pos.symbol}
									<Badge variant="outline" className="ml-2">
										{pos.side}
									</Badge>
								</TableCell>
								<TableCell className="text-right">{pos.qty}</TableCell>
								<TableCell className="text-right">{formatCurrency(pos.avg_entry_price)}</TableCell>
								<TableCell className="text-right">{formatCurrency(pos.current_price)}</TableCell>
								<TableCell className="text-right">{formatCurrency(pos.market_value)}</TableCell>
								<TableCell
									className={cn(
										'text-right',
										pos.unrealized_pl >= 0 ? 'text-green-600' : 'text-red-600',
									)}
								>
									{formatCurrency(pos.unrealized_pl)}
								</TableCell>
								<TableCell
									className={cn(
										'text-right',
										pos.unrealized_plpc >= 0 ? 'text-green-600' : 'text-red-600',
									)}
								>
									{(pos.unrealized_plpc * 100).toFixed(2)}%
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			</CardContent>
		</Card>
	);
}
