import type { Order, OrderStatus } from '@repo/data-ops/providers/alpaca';
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
import { formatRelativeTime } from '@/lib/formatters';

interface OrdersTableProps {
	orders: Order[];
}

export function OrdersTable({ orders }: OrdersTableProps) {
	if (orders.length === 0) {
		return (
			<Card>
				<CardHeader>
					<CardTitle>Recent Orders</CardTitle>
				</CardHeader>
				<CardContent>
					<p className="text-muted-foreground">No orders</p>
				</CardContent>
			</Card>
		);
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle>Recent Orders</CardTitle>
			</CardHeader>
			<CardContent>
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Symbol</TableHead>
							<TableHead>Side</TableHead>
							<TableHead>Type</TableHead>
							<TableHead className="text-right">Qty</TableHead>
							<TableHead className="text-right">Filled</TableHead>
							<TableHead>Status</TableHead>
							<TableHead>Time</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{orders.map((order) => (
							<TableRow key={order.id}>
								<TableCell className="font-medium">{order.symbol}</TableCell>
								<TableCell>
									<Badge variant={order.side === 'buy' ? 'default' : 'secondary'}>
										{order.side.toUpperCase()}
									</Badge>
								</TableCell>
								<TableCell>{order.type}</TableCell>
								<TableCell className="text-right">{order.qty}</TableCell>
								<TableCell className="text-right">{order.filled_qty}</TableCell>
								<TableCell>
									<OrderStatusBadge status={order.status} />
								</TableCell>
								<TableCell className="text-sm text-muted-foreground">
									{formatRelativeTime(order.submitted_at)}
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			</CardContent>
		</Card>
	);
}

const STATUS_VARIANTS: Record<OrderStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
	filled: 'default',
	new: 'secondary',
	partially_filled: 'secondary',
	accepted: 'secondary',
	pending_new: 'outline',
	pending_cancel: 'outline',
	pending_replace: 'outline',
	canceled: 'outline',
	expired: 'outline',
	replaced: 'outline',
	done_for_day: 'secondary',
	stopped: 'outline',
	rejected: 'destructive',
	suspended: 'destructive',
	calculated: 'outline',
};

function OrderStatusBadge({ status }: { status: OrderStatus }) {
	return <Badge variant={STATUS_VARIANTS[status] ?? 'outline'}>{status.replace(/_/g, ' ')}</Badge>;
}
