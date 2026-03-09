import { Link } from '@tanstack/react-router';
import { useTranslations } from 'use-intl';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

interface PortfolioErrorBoundaryProps {
	error: Error;
}

export function PortfolioErrorBoundary({ error }: PortfolioErrorBoundaryProps) {
	const t = useTranslations();

	if (error.message.includes('credentials not configured')) {
		return (
			<Card>
				<CardContent className="py-8 text-center">
					<h3 className="text-lg font-semibold text-foreground">{t('portfolio.connectBroker')}</h3>
					<p className="text-muted-foreground mt-2">{t('portfolio.connectBrokerDesc')}</p>
					<Button asChild className="mt-4">
						<Link to="/settings/credentials">{t('portfolio.addCredentials')}</Link>
					</Button>
				</CardContent>
			</Card>
		);
	}

	if (error.message.includes('authentication failed')) {
		return (
			<Card>
				<CardContent className="py-8 text-center">
					<h3 className="text-lg font-semibold text-destructive">
						{t('portfolio.credentialsInvalid')}
					</h3>
					<p className="text-muted-foreground mt-2">{t('portfolio.credentialsInvalidDesc')}</p>
					<Button asChild className="mt-4" variant="outline">
						<Link to="/settings/credentials">{t('portfolio.updateCredentials')}</Link>
					</Button>
				</CardContent>
			</Card>
		);
	}

	return (
		<Card>
			<CardContent className="py-8 text-center">
				<h3 className="text-lg font-semibold text-destructive">{t('portfolio.failedToLoad')}</h3>
				<p className="text-muted-foreground mt-2">{error.message}</p>
				<Button onClick={() => window.location.reload()} className="mt-4">
					{t('common.retry')}
				</Button>
			</CardContent>
		</Card>
	);
}
