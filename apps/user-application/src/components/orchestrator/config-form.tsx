import type { OrchestratorConfig } from '@repo/data-ops/agents/orchestrator/types';
import { useForm } from '@tanstack/react-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Settings } from 'lucide-react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useOrchestrator } from '@/lib/orchestrator-connection';

interface ConfigFormProps {
	userId: string;
}

interface ConfigFormValues {
	dataPollIntervalSec: number;
	analystIntervalSec: number;
	minSentimentScore: number;
	minAnalystConfidence: number;
	positionSizePctOfCash: number;
	maxPositionValue: number;
	maxPositions: number;
	takeProfitPct: number;
	stopLossPct: number;
	autoApproveEnabled: boolean;
	autoApproveMaxNotional: number;
	watchlistSymbols: string;
	tickerBlacklist: string;
	activeStrategyId: string;
}

const NUMBER_FIELDS: Array<{ name: keyof ConfigFormValues; label: string; step: number }> = [
	{ name: 'dataPollIntervalSec', label: 'Data Poll Interval (s)', step: 1 },
	{ name: 'analystIntervalSec', label: 'Analyst Interval (s)', step: 1 },
	{ name: 'minSentimentScore', label: 'Min Sentiment Score', step: 0.05 },
	{ name: 'minAnalystConfidence', label: 'Min Analyst Confidence', step: 0.05 },
	{ name: 'positionSizePctOfCash', label: 'Position Size (% of cash)', step: 0.01 },
	{ name: 'maxPositionValue', label: 'Max Position Value ($)', step: 1 },
	{ name: 'maxPositions', label: 'Max Positions', step: 1 },
	{ name: 'takeProfitPct', label: 'Take Profit (%)', step: 0.01 },
	{ name: 'stopLossPct', label: 'Stop Loss (%)', step: 0.01 },
	{ name: 'autoApproveMaxNotional', label: 'Auto-Approve Max ($)', step: 1 },
];

function parseCommaSeparated(value: string): string[] {
	return value
		.split(',')
		.map((s) => s.trim())
		.filter(Boolean);
}

export function ConfigForm({ userId }: ConfigFormProps) {
	const orch = useOrchestrator(userId);
	const queryClient = useQueryClient();

	const { data: config } = useQuery<OrchestratorConfig>({
		queryKey: ['orchestrator', userId, 'config'],
		queryFn: () => orch.getConfig(),
		enabled: !!orch.ready,
	});

	const mutation = useMutation({
		mutationFn: (updates: Partial<OrchestratorConfig>) => orch.updateConfig(updates),
		onSuccess: () =>
			queryClient.invalidateQueries({ queryKey: ['orchestrator', userId, 'config'] }),
	});

	const form = useForm({
		defaultValues: {
			dataPollIntervalSec: config?.dataPollIntervalSec ?? 60,
			analystIntervalSec: config?.analystIntervalSec ?? 120,
			minSentimentScore: config?.minSentimentScore ?? 0.3,
			minAnalystConfidence: config?.minAnalystConfidence ?? 0.6,
			positionSizePctOfCash: config?.positionSizePctOfCash ?? 0.05,
			maxPositionValue: config?.maxPositionValue ?? 5000,
			maxPositions: config?.maxPositions ?? 5,
			takeProfitPct: config?.takeProfitPct ?? 0.1,
			stopLossPct: config?.stopLossPct ?? 0.05,
			autoApproveEnabled: config?.autoApproveEnabled ?? false,
			autoApproveMaxNotional: config?.autoApproveMaxNotional ?? 1000,
			watchlistSymbols: config?.watchlistSymbols?.join(', ') ?? '',
			tickerBlacklist: config?.tickerBlacklist?.join(', ') ?? '',
			activeStrategyId: config?.activeStrategyId ?? '',
		},
		onSubmit: ({ value }) => {
			mutation.reset();
			const payload: Partial<OrchestratorConfig> = {
				...value,
				watchlistSymbols: parseCommaSeparated(value.watchlistSymbols),
				tickerBlacklist: parseCommaSeparated(value.tickerBlacklist),
			};
			mutation.mutate(payload);
		},
	});

	if (!config) return null;

	return (
		<Card>
			<CardHeader>
				<div className="flex items-center gap-2">
					<Settings className="h-5 w-5" />
					<CardTitle className="text-lg">Configuration</CardTitle>
				</div>
			</CardHeader>
			<CardContent>
				{mutation.isError && (
					<Alert variant="destructive" className="mb-4">
						{mutation.error.message}
					</Alert>
				)}
				{mutation.isSuccess && <Alert className="mb-4">Configuration saved.</Alert>}
				<form
					onSubmit={(e) => {
						e.preventDefault();
						form.handleSubmit();
					}}
					className="space-y-4"
				>
					<div className="grid grid-cols-2 gap-4">
						{NUMBER_FIELDS.map(({ name, label, step }) => (
							<form.Field key={name} name={name}>
								{(field) => (
									<div className="space-y-1">
										<Label>{label}</Label>
										<Input
											type="number"
											step={step}
											value={field.state.value as number}
											onChange={(e) => field.handleChange(Number(e.target.value))}
											onBlur={field.handleBlur}
										/>
									</div>
								)}
							</form.Field>
						))}
					</div>

					<form.Field name="autoApproveEnabled">
						{(field) => (
							<div className="flex items-center justify-between">
								<Label>Auto-Approve Trades</Label>
								<Switch
									checked={field.state.value}
									onCheckedChange={(v) => field.handleChange(v)}
								/>
							</div>
						)}
					</form.Field>

					<form.Field name="activeStrategyId">
						{(field) => (
							<div className="space-y-1">
								<Label>Active Strategy ID</Label>
								<Input
									value={field.state.value}
									onChange={(e) => field.handleChange(e.target.value)}
									onBlur={field.handleBlur}
									placeholder="e.g. momentum-v1"
								/>
							</div>
						)}
					</form.Field>

					<form.Field name="watchlistSymbols">
						{(field) => (
							<div className="space-y-1">
								<Label>Watchlist Symbols (comma-separated)</Label>
								<Input
									value={field.state.value}
									onChange={(e) => field.handleChange(e.target.value)}
									onBlur={field.handleBlur}
									placeholder="AAPL, MSFT, GOOGL"
								/>
							</div>
						)}
					</form.Field>

					<form.Field name="tickerBlacklist">
						{(field) => (
							<div className="space-y-1">
								<Label>Ticker Blacklist (comma-separated)</Label>
								<Input
									value={field.state.value}
									onChange={(e) => field.handleChange(e.target.value)}
									onBlur={field.handleBlur}
									placeholder="MEME, PUMP"
								/>
							</div>
						)}
					</form.Field>

					<form.Subscribe selector={(s) => s.canSubmit}>
						{(canSubmit) => (
							<Button type="submit" disabled={!canSubmit || mutation.isPending}>
								{mutation.isPending ? 'Saving...' : 'Save Configuration'}
							</Button>
						)}
					</form.Subscribe>
				</form>
			</CardContent>
		</Card>
	);
}
