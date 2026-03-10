import { useForm } from '@tanstack/react-form';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckCircle, Circle } from 'lucide-react';
import { useState } from 'react';
import { useTranslations } from 'use-intl';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { saveTelegramBot } from '@/core/functions/telegram/direct';
import { useSendTestMessage, useTelegramStatus } from '@/lib/telegram-queries';

type Step = 1 | 2 | 3;

export function TelegramSetupWizard() {
	const [step, setStep] = useState<Step>(1);
	const { data: status, refetch } = useTelegramStatus();
	const testMutation = useSendTestMessage();
	const queryClient = useQueryClient();
	const t = useTranslations();

	const saveMutation = useMutation({
		mutationFn: (value: { botToken: string }) => saveTelegramBot({ data: value }),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ['telegram', 'status'] });
			setStep(2);
		},
	});

	const form = useForm({
		defaultValues: { botToken: '' },
		onSubmit: ({ value }) => {
			saveMutation.reset();
			saveMutation.mutate(value);
		},
	});

	const handleCheckConnection = async () => {
		const result = await refetch();
		if (result.data?.connected) {
			setStep(3);
		}
	};

	if (status?.connected && step === 1) {
		return (
			<Card>
				<CardHeader>
					<div className="flex items-center justify-between">
						<CardTitle>{t('notifications.setup.connectedTitle')}</CardTitle>
						<Badge variant="default">{t('notifications.setup.connectedBadge')}</Badge>
					</div>
					<CardDescription>
						{t('notifications.setup.botLabel', { username: status.botUsername ?? '' })}
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-2">
					<Button onClick={() => testMutation.mutate()} disabled={testMutation.isPending}>
						{testMutation.isPending
							? t('notifications.setup.sending')
							: t('notifications.setup.sendTest')}
					</Button>
					{testMutation.isSuccess && (
						<p className="text-sm text-muted-foreground">{t('notifications.setup.testSent')}</p>
					)}
				</CardContent>
			</Card>
		);
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle>{t('notifications.setup.title')}</CardTitle>
				<CardDescription>{t('notifications.setup.description')}</CardDescription>
			</CardHeader>
			<CardContent className="space-y-6">
				<div className="flex items-center gap-4">
					<StepIndicator step={1} current={step} label={t('notifications.setup.step1Label')} />
					<div className="h-px flex-1 bg-border" />
					<StepIndicator step={2} current={step} label={t('notifications.setup.step2Label')} />
					<div className="h-px flex-1 bg-border" />
					<StepIndicator step={3} current={step} label={t('notifications.setup.step3Label')} />
				</div>

				{step === 1 && (
					<form
						onSubmit={(e) => {
							e.preventDefault();
							form.handleSubmit();
						}}
						className="space-y-4"
					>
						{saveMutation.isError && (
							<Alert variant="destructive">
								<AlertDescription>{saveMutation.error.message}</AlertDescription>
							</Alert>
						)}
						<div className="space-y-2">
							<p className="text-sm text-foreground">
								{t('notifications.setup.step1Instruction1')} <code>@BotFather</code>
							</p>
							<p className="text-sm text-foreground">
								{t('notifications.setup.step1Instruction2', { command: '/newbot' })}
							</p>
							<p className="text-sm text-foreground">
								{t('notifications.setup.step1Instruction3')}
							</p>
						</div>
						<form.Field name="botToken">
							{(field) => (
								<Input
									placeholder={t('notifications.setup.tokenPlaceholder')}
									value={field.state.value}
									onChange={(e) => field.handleChange(e.target.value)}
								/>
							)}
						</form.Field>
						<form.Subscribe selector={(s) => s.canSubmit}>
							{(canSubmit) => (
								<Button disabled={!canSubmit || saveMutation.isPending}>
									{saveMutation.isPending
										? t('notifications.setup.saving')
										: t('notifications.setup.continue')}
								</Button>
							)}
						</form.Subscribe>
					</form>
				)}

				{step === 2 && (
					<div className="space-y-4">
						<div className="space-y-2">
							<p className="text-sm text-foreground">
								{t('notifications.setup.step2Instruction1', {
									botUsername: status?.botUsername || 'your_bot',
								})}
							</p>
							<p className="text-sm text-foreground">
								{t('notifications.setup.step2Instruction2', { command: '/start' })}
							</p>
							<p className="text-sm text-foreground">
								{t('notifications.setup.step2Instruction3')}
							</p>
						</div>
						<Button onClick={handleCheckConnection}>
							{t('notifications.setup.checkConnection')}
						</Button>
						{status && !status.connected && (
							<p className="text-sm text-muted-foreground">
								{t('notifications.setup.waitingForStart')}
							</p>
						)}
					</div>
				)}

				{step === 3 && (
					<div className="space-y-4 text-center">
						<CheckCircle className="mx-auto h-12 w-12 text-green-500" />
						<p className="text-lg font-medium text-foreground">
							{t('notifications.setup.completeTitle')}
						</p>
						<p className="text-sm text-muted-foreground">
							{t('notifications.setup.completeDescription')}
						</p>
						<Button onClick={() => testMutation.mutate()} disabled={testMutation.isPending}>
							{testMutation.isPending
								? t('notifications.setup.sending')
								: t('notifications.setup.sendTest')}
						</Button>
					</div>
				)}
			</CardContent>
		</Card>
	);
}

function StepIndicator({ step, current, label }: { step: Step; current: Step; label: string }) {
	const isComplete = current > step;
	const isCurrent = current === step;

	return (
		<div className="flex flex-col items-center gap-1">
			{isComplete ? (
				<CheckCircle className="h-6 w-6 text-green-500" />
			) : isCurrent ? (
				<div className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-primary">
					<span className="text-xs font-medium text-foreground">{step}</span>
				</div>
			) : (
				<Circle className="h-6 w-6 text-muted-foreground" />
			)}
			<span className="text-xs text-muted-foreground">{label}</span>
		</div>
	);
}
