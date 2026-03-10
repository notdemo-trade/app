import { useTranslations } from 'use-intl';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useNotificationSettings, useUpdateSettings } from '@/lib/telegram-queries';

export function NotificationPreferences() {
	const { data: settings, isLoading } = useNotificationSettings();
	const updateMutation = useUpdateSettings();
	const t = useTranslations();

	if (isLoading || !settings) {
		return (
			<div className="animate-pulse text-muted-foreground">{t('notifications.prefs.loading')}</div>
		);
	}

	const handleToggle = (key: string, value: boolean) => {
		updateMutation.mutate({ [key]: value });
	};

	const handleChange = (key: string, value: string | null) => {
		updateMutation.mutate({ [key]: value });
	};

	return (
		<div className="space-y-6">
			<Card>
				<CardHeader>
					<CardTitle>{t('notifications.prefs.typesTitle')}</CardTitle>
					<CardDescription>{t('notifications.prefs.typesDescription')}</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					<div className="flex items-center justify-between">
						<Label htmlFor="proposals">{t('notifications.prefs.tradeProposals')}</Label>
						<Switch
							id="proposals"
							checked={settings.enableTradeProposals}
							onCheckedChange={(v) => handleToggle('enableTradeProposals', v)}
						/>
					</div>
					<div className="flex items-center justify-between">
						<Label htmlFor="results">{t('notifications.prefs.tradeResults')}</Label>
						<Switch
							id="results"
							checked={settings.enableTradeResults}
							onCheckedChange={(v) => handleToggle('enableTradeResults', v)}
						/>
					</div>
					<div className="flex items-center justify-between">
						<Label htmlFor="summary">{t('notifications.prefs.dailySummary')}</Label>
						<Switch
							id="summary"
							checked={settings.enableDailySummary}
							onCheckedChange={(v) => handleToggle('enableDailySummary', v)}
						/>
					</div>
					<div className="flex items-center justify-between">
						<Label htmlFor="alerts">{t('notifications.prefs.riskAlerts')}</Label>
						<Switch
							id="alerts"
							checked={settings.enableRiskAlerts}
							onCheckedChange={(v) => handleToggle('enableRiskAlerts', v)}
						/>
					</div>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>{t('notifications.prefs.scheduleTitle')}</CardTitle>
				</CardHeader>
				<CardContent className="space-y-4">
					<div className="space-y-2">
						<Label>{t('notifications.prefs.dailySummaryTime')}</Label>
						<Input
							type="time"
							value={settings.dailySummaryTime}
							onChange={(e) => handleChange('dailySummaryTime', e.target.value)}
							className="w-32"
						/>
					</div>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>{t('notifications.prefs.quietHoursTitle')}</CardTitle>
					<CardDescription>{t('notifications.prefs.quietHoursDescription')}</CardDescription>
				</CardHeader>
				<CardContent className="flex items-center gap-4">
					<div className="space-y-1">
						<Label>{t('notifications.prefs.quietStart')}</Label>
						<Input
							type="time"
							value={settings.quietHoursStart ?? ''}
							onChange={(e) => handleChange('quietHoursStart', e.target.value || null)}
							className="w-32"
						/>
					</div>
					<span className="mt-6 text-muted-foreground">{t('notifications.prefs.quietTo')}</span>
					<div className="space-y-1">
						<Label>{t('notifications.prefs.quietEnd')}</Label>
						<Input
							type="time"
							value={settings.quietHoursEnd ?? ''}
							onChange={(e) => handleChange('quietHoursEnd', e.target.value || null)}
							className="w-32"
						/>
					</div>
				</CardContent>
			</Card>
		</div>
	);
}
