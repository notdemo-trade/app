import type { NotificationSettingsInput } from '@repo/data-ops/notification-settings';
import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
	getSettings,
	getTelegramStatus,
	sendTestMessage,
	updateSettings,
} from '@/core/functions/telegram/direct';

export const notificationSettingsQueryOptions = () =>
	queryOptions({
		queryKey: ['telegram', 'settings'],
		queryFn: () => getSettings(),
		staleTime: 60_000,
	});

export const telegramStatusQueryOptions = () =>
	queryOptions({
		queryKey: ['telegram', 'status'],
		queryFn: () => getTelegramStatus(),
		staleTime: 30_000,
	});

export const useNotificationSettings = () => useQuery(notificationSettingsQueryOptions());
export const useTelegramStatus = () => useQuery(telegramStatusQueryOptions());

export const useUpdateSettings = () => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (data: NotificationSettingsInput) => updateSettings({ data }),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ['telegram', 'settings'] });
		},
	});
};

export const useSendTestMessage = () => {
	return useMutation({
		mutationFn: () => sendTestMessage(),
	});
};
