import type { CredentialProvider } from '@repo/data-ops/credential';
import { useForm } from '@tanstack/react-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useMemo } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { listUserCredentials } from '@/core/functions/credentials/direct';
import {
	getUserTradingConfig,
	updateUserTradingConfig,
} from '@/core/functions/trading-config/direct';

export const Route = createFileRoute('/_auth/settings/trading')({
	component: TradingConfigPage,
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

function TradingConfigPage() {
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
				<h1 className="text-2xl font-bold text-foreground">Trading Configuration</h1>
				<p className="text-muted-foreground text-sm mt-1">
					Configure position limits, risk management, and AI model selection.
				</p>
			</div>

			{config && (
				<TradingConfigForm
					config={config}
					availableModels={availableModels}
					updateMutation={updateMutation}
				/>
			)}
		</div>
	);
}

interface TradingConfigFormProps {
	config: Record<string, unknown>;
	availableModels: string[];
	updateMutation: ReturnType<typeof useMutation<unknown, Error, Record<string, unknown>>>;
}

function TradingConfigForm({ config, availableModels, updateMutation }: TradingConfigFormProps) {
	const form = useForm({
		defaultValues: {
			maxPositions: (config.maxPositions as number) ?? 10,
			maxPositionValue: (config.maxPositionValue as number) ?? 5000,
			maxNotionalPerTrade: (config.maxNotionalPerTrade as number) ?? 5000,
			stopLossPct: (config.stopLossPct as number) ?? 0.08,
			takeProfitPct: (config.takeProfitPct as number) ?? 0.15,
			maxDailyLossPct: (config.maxDailyLossPct as number) ?? 0.02,
			positionSizePctOfCash: (config.positionSizePctOfCash as number) ?? 0.1,
			cooldownMinutesAfterLoss: (config.cooldownMinutesAfterLoss as number) ?? 30,
			researchModel: (config.researchModel as string) ?? 'openai/gpt-4o-mini',
			analystModel: (config.analystModel as string) ?? 'openai/gpt-4o',
			tradingHoursOnly: (config.tradingHoursOnly as boolean) ?? true,
			extendedHoursAllowed: (config.extendedHoursAllowed as boolean) ?? false,
			allowShortSelling: (config.allowShortSelling as boolean) ?? false,
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

			{updateMutation.isSuccess && <Alert variant="success">Configuration saved.</Alert>}

			<Card>
				<CardHeader>
					<CardTitle>Position Limits</CardTitle>
					<CardDescription>Control maximum exposure per position and overall.</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					<form.Field name="maxPositions">
						{(field) => (
							<div className="space-y-2">
								<Label htmlFor="maxPositions">Max Concurrent Positions</Label>
								<Input
									id="maxPositions"
									type="number"
									min={1}
									max={50}
									value={field.state.value}
									onChange={(e) => field.handleChange(Number(e.target.value))}
								/>
							</div>
						)}
					</form.Field>

					<form.Field name="maxPositionValue">
						{(field) => (
							<div className="space-y-2">
								<Label htmlFor="maxPositionValue">Max Position Value ($)</Label>
								<Input
									id="maxPositionValue"
									type="number"
									min={100}
									max={100000}
									value={field.state.value}
									onChange={(e) => field.handleChange(Number(e.target.value))}
								/>
							</div>
						)}
					</form.Field>

					<form.Field name="maxNotionalPerTrade">
						{(field) => (
							<div className="space-y-2">
								<Label htmlFor="maxNotionalPerTrade">Max per Trade ($)</Label>
								<Input
									id="maxNotionalPerTrade"
									type="number"
									min={100}
									max={100000}
									value={field.state.value}
									onChange={(e) => field.handleChange(Number(e.target.value))}
								/>
							</div>
						)}
					</form.Field>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Risk Management</CardTitle>
					<CardDescription>Set stop loss, take profit, and daily loss limits.</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					<form.Field name="stopLossPct">
						{(field) => (
							<div className="space-y-2">
								<Label htmlFor="stopLossPct">
									Stop Loss ({(field.state.value * 100).toFixed(1)}%)
								</Label>
								<Input
									id="stopLossPct"
									type="number"
									min={0.01}
									max={0.5}
									step={0.01}
									value={field.state.value}
									onChange={(e) => field.handleChange(Number(e.target.value))}
								/>
								<p className="text-xs text-muted-foreground">
									Auto-close position at this loss percentage
								</p>
							</div>
						)}
					</form.Field>

					<form.Field name="takeProfitPct">
						{(field) => (
							<div className="space-y-2">
								<Label htmlFor="takeProfitPct">
									Take Profit ({(field.state.value * 100).toFixed(1)}%)
								</Label>
								<Input
									id="takeProfitPct"
									type="number"
									min={0.01}
									max={1.0}
									step={0.01}
									value={field.state.value}
									onChange={(e) => field.handleChange(Number(e.target.value))}
								/>
								<p className="text-xs text-muted-foreground">
									Auto-close position at this gain percentage
								</p>
							</div>
						)}
					</form.Field>

					<form.Field name="maxDailyLossPct">
						{(field) => (
							<div className="space-y-2">
								<Label htmlFor="maxDailyLossPct">
									Max Daily Loss ({(field.state.value * 100).toFixed(1)}%)
								</Label>
								<Input
									id="maxDailyLossPct"
									type="number"
									min={0.001}
									max={0.1}
									step={0.001}
									value={field.state.value}
									onChange={(e) => field.handleChange(Number(e.target.value))}
								/>
								<p className="text-xs text-muted-foreground">
									Halt trading when daily loss exceeds this % of equity
								</p>
							</div>
						)}
					</form.Field>

					<form.Field name="positionSizePctOfCash">
						{(field) => (
							<div className="space-y-2">
								<Label htmlFor="positionSizePctOfCash">
									Position Size ({(field.state.value * 100).toFixed(1)}% of cash)
								</Label>
								<Input
									id="positionSizePctOfCash"
									type="number"
									min={0.01}
									max={1.0}
									step={0.01}
									value={field.state.value}
									onChange={(e) => field.handleChange(Number(e.target.value))}
								/>
							</div>
						)}
					</form.Field>

					<form.Field name="cooldownMinutesAfterLoss">
						{(field) => (
							<div className="space-y-2">
								<Label htmlFor="cooldownMinutesAfterLoss">Cooldown After Loss (minutes)</Label>
								<Input
									id="cooldownMinutesAfterLoss"
									type="number"
									min={0}
									max={1440}
									value={field.state.value}
									onChange={(e) => field.handleChange(Number(e.target.value))}
								/>
							</div>
						)}
					</form.Field>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>AI Models</CardTitle>
					<CardDescription>
						Select models for research and trading decisions. Add provider API keys in the
						Credentials tab first.
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					<form.Field name="researchModel">
						{(field) => (
							<div className="space-y-2">
								<Label htmlFor="researchModel">Research Model</Label>
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
								<p className="text-xs text-muted-foreground">
									Used for market research and sentiment analysis
								</p>
							</div>
						)}
					</form.Field>

					<form.Field name="analystModel">
						{(field) => (
							<div className="space-y-2">
								<Label htmlFor="analystModel">Analyst Model</Label>
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
								<p className="text-xs text-muted-foreground">Used for trade decisions</p>
							</div>
						)}
					</form.Field>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Trading Hours</CardTitle>
				</CardHeader>
				<CardContent className="space-y-4">
					<form.Field name="tradingHoursOnly">
						{(field) => (
							<div className="flex items-center gap-3">
								<Switch
									id="tradingHoursOnly"
									checked={field.state.value}
									onCheckedChange={field.handleChange}
								/>
								<Label htmlFor="tradingHoursOnly">Trade during market hours only</Label>
							</div>
						)}
					</form.Field>

					<form.Field name="extendedHoursAllowed">
						{(field) => (
							<div className="flex items-center gap-3">
								<Switch
									id="extendedHoursAllowed"
									checked={field.state.value}
									onCheckedChange={field.handleChange}
								/>
								<Label htmlFor="extendedHoursAllowed">Allow extended hours trading</Label>
							</div>
						)}
					</form.Field>

					<form.Field name="allowShortSelling">
						{(field) => (
							<div className="flex items-center gap-3">
								<Switch
									id="allowShortSelling"
									checked={field.state.value}
									onCheckedChange={field.handleChange}
								/>
								<Label htmlFor="allowShortSelling">Allow short selling</Label>
							</div>
						)}
					</form.Field>
				</CardContent>
			</Card>

			<form.Subscribe selector={(s) => s.canSubmit}>
				{(canSubmit) => (
					<Button type="submit" disabled={!canSubmit || updateMutation.isPending}>
						{updateMutation.isPending ? 'Saving...' : 'Save Configuration'}
					</Button>
				)}
			</form.Subscribe>
		</form>
	);
}
