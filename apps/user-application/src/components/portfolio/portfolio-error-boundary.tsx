import { Link } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

interface PortfolioErrorBoundaryProps {
	error: Error;
}

export function PortfolioErrorBoundary({ error }: PortfolioErrorBoundaryProps) {
	if (error.message.includes('credentials not configured')) {
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

	if (error.message.includes('authentication failed')) {
		return (
			<Card>
				<CardContent className="py-8 text-center">
					<h3 className="text-lg font-semibold text-destructive">Credentials Invalid</h3>
					<p className="text-muted-foreground mt-2">Your Alpaca credentials are no longer valid.</p>
					<Button asChild className="mt-4" variant="outline">
						<Link to="/settings/credentials">Update Credentials</Link>
					</Button>
				</CardContent>
			</Card>
		);
	}

	return (
		<Card>
			<CardContent className="py-8 text-center">
				<h3 className="text-lg font-semibold text-destructive">Failed to Load Portfolio</h3>
				<p className="text-muted-foreground mt-2">{error.message}</p>
				<Button onClick={() => window.location.reload()} className="mt-4">
					Retry
				</Button>
			</CardContent>
		</Card>
	);
}
