import type { CredentialProvider } from '@repo/data-ops/credential';
import { useForm } from '@tanstack/react-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { ArrowLeft } from 'lucide-react';
import { useMemo } from 'react';
import { useTranslations } from 'use-intl';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { listUserCredentials } from '@/core/functions/credentials/direct';
import {
	getUserTradingConfig,
	updateUserTradingConfig,
} from '@/core/functions/trading-config/direct';

export const Route = createFileRoute('/_auth/settings/models')({
	component: ModelsPage,
});

const TRADING_CONFIG_QUERY_KEY = ['trading-config'] as const;
const CREDENTIALS_QUERY_KEY = ['credentials'] as const;

const PROVIDER_MODELS: Record<string, string[]> = {
	openai: ['gpt-4o-mini', 'gpt-4o', 'o1', 'o1-mini'],
	anthropic: [
		'claude-3-7-sonnet-latest',
		'claude-sonnet-4-0',
		'claude-opus-4-1',
		'claude-3-5-haiku-latest',
	],
	google: ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-3-pro-preview'],
	xai: ['grok-4', 'grok-3', 'grok-4-fast-reasoning'],
	deepseek: ['deepseek-chat', 'deepseek-reasoner'],
};

const LLM_PROVIDER_IDS: CredentialProvider[] = ['openai', 'anthropic', 'google', 'xai', 'deepseek'];

function ModelsPage() {
	const t = useTranslations();
	const queryClient = useQueryClient();

	const configQuery = useQuery({
		queryKey: TRADING_CONFIG_QUERY_KEY,
		queryFn: () => getUserTradingConfig(),
	});

	const credentialsQuery = useQuery({
		queryKey: CREDENTIALS_QUERY_KEY,
		queryFn: () => listUserCredentials(),
	});

	const availableModels = useMemo(() => {
		const models: string[] = [];
		credentialsQuery.data?.forEach((cred) => {
			if (LLM_PROVIDER_IDS.includes(cred.provider as CredentialProvider)) {
				const providerModels = PROVIDER_MODELS[cred.provider];
				providerModels?.forEach((model) => {
					models.push(`${cred.provider}/${model}`);
				});
			}
		});
		return models;
	}, [credentialsQuery.data]);

	const updateMutation = useMutation({
		mutationFn: (value: Record<string, unknown>) => updateUserTradingConfig({ data: value }),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: TRADING_CONFIG_QUERY_KEY });
		},
	});

	if (configQuery.isLoading) {
		return (
			<div className="max-w-2xl mx-auto flex items-center justify-center py-12">
				<div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
			</div>
		);
	}

	const config = configQuery.data;

	return (
		<div className="max-w-2xl mx-auto space-y-8">
			<div>
				<Link
					to="/dashboard"
					className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4"
				>
					<ArrowLeft className="h-4 w-4" />
					{t('common.backToDashboard')}
				</Link>
				<h1 className="text-2xl font-bold text-foreground">{t('modelsPage.title')}</h1>
				<p className="text-muted-foreground text-sm mt-1">{t('modelsPage.description')}</p>
			</div>

			{config && (
				<ModelsForm
					config={config}
					availableModels={availableModels}
					updateMutation={updateMutation}
				/>
			)}
		</div>
	);
}

interface ModelsFormProps {
	config: Record<string, unknown>;
	availableModels: string[];
	updateMutation: ReturnType<typeof useMutation<unknown, Error, Record<string, unknown>>>;
}

function ModelsForm({ config, availableModels, updateMutation }: ModelsFormProps) {
	const t = useTranslations();
	const form = useForm({
		defaultValues: {
			researchModel: (config.researchModel as string) ?? 'openai/gpt-4o-mini',
			analystModel: (config.analystModel as string) ?? 'openai/gpt-4o',
		},
		onSubmit: async ({ value }) => {
			updateMutation.reset();
			updateMutation.mutate(value);
		},
	});

	return (
		<form
			onSubmit={(e) => {
				e.preventDefault();
				form.handleSubmit();
			}}
			className="space-y-6"
		>
			{updateMutation.isError && (
				<Alert variant="destructive">{updateMutation.error.message}</Alert>
			)}

			{updateMutation.isSuccess && <Alert variant="success">{t('modelsPage.modelSaved')}</Alert>}

			<Card>
				<CardHeader>
					<CardTitle>{t('modelsPage.researchModel.title')}</CardTitle>
					<CardDescription>{t('modelsPage.researchModel.description')}</CardDescription>
				</CardHeader>
				<CardContent>
					<form.Field name="researchModel">
						{(field) => (
							<div className="space-y-2">
								<Label htmlFor="researchModel">{t('modelsPage.modelLabel')}</Label>
								<Select
									id="researchModel"
									value={field.state.value}
									onChange={(e) => field.handleChange(e.target.value)}
								>
									{availableModels.length === 0 ? (
										<option value={field.state.value}>{field.state.value}</option>
									) : (
										availableModels.map((model) => (
											<option key={model} value={model}>
												{model}
											</option>
										))
									)}
								</Select>
							</div>
						)}
					</form.Field>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>{t('modelsPage.analystModel.title')}</CardTitle>
					<CardDescription>{t('modelsPage.analystModel.description')}</CardDescription>
				</CardHeader>
				<CardContent>
					<form.Field name="analystModel">
						{(field) => (
							<div className="space-y-2">
								<Label htmlFor="analystModel">{t('modelsPage.modelLabel')}</Label>
								<Select
									id="analystModel"
									value={field.state.value}
									onChange={(e) => field.handleChange(e.target.value)}
								>
									{availableModels.length === 0 ? (
										<option value={field.state.value}>{field.state.value}</option>
									) : (
										availableModels.map((model) => (
											<option key={model} value={model}>
												{model}
											</option>
										))
									)}
								</Select>
							</div>
						)}
					</form.Field>
				</CardContent>
			</Card>

			<form.Subscribe selector={(s) => s.canSubmit}>
				{(canSubmit) => (
					<Button type="submit" disabled={!canSubmit || updateMutation.isPending}>
						{updateMutation.isPending ? t('common.saving') : t('modelsPage.saveModels')}
					</Button>
				)}
			</form.Subscribe>
		</form>
	);
}
