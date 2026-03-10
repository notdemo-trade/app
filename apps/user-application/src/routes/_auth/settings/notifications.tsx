import { createFileRoute } from '@tanstack/react-router';
import { useTranslations } from 'use-intl';
import { NotificationPreferences } from '@/components/telegram/notification-preferences';
import { TelegramSetupWizard } from '@/components/telegram/telegram-setup-wizard';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export const Route = createFileRoute('/_auth/settings/notifications')({
	component: NotificationsPage,
});

function NotificationsPage() {
	const t = useTranslations();

	return (
		<div className="space-y-6">
			<h1 className="text-2xl font-bold text-foreground">{t('notifications.title')}</h1>

			<Tabs defaultValue="setup">
				<TabsList>
					<TabsTrigger value="setup">{t('notifications.tabs.setup')}</TabsTrigger>
					<TabsTrigger value="preferences">{t('notifications.tabs.preferences')}</TabsTrigger>
				</TabsList>

				<TabsContent value="setup" className="mt-4">
					<TelegramSetupWizard />
				</TabsContent>

				<TabsContent value="preferences" className="mt-4">
					<NotificationPreferences />
				</TabsContent>
			</Tabs>
		</div>
	);
}
