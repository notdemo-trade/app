import { useForm } from '@tanstack/react-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { ArrowLeft, ChevronDown } from 'lucide-react';
import { ConfidencePreview } from '@/components/settings/confidence-preview';
import { ScoreWindowsEditor } from '@/components/settings/score-windows-editor';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
	getUserTradingConfig,
	updateUserTradingConfig,
} from '@/core/functions/trading-config/direct';

export const Route = createFileRoute('/_auth/settings/trading')({
	component: TradingConfigPage,
});

const TRADING_CONFIG_QUERY_KEY = ['trading-config'] as const;

function TradingConfigPage() {
	const queryClient = useQueryClient();

	const configQuery = useQuery({
		queryKey: TRADING_CONFIG_QUERY_KEY,
		queryFn: () => getUserTradingConfig(),
	});

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
					Back to Dashboard
				</Link>
				<h1 className="text-2xl font-bold text-foreground">Trading Configuration</h1>
				<p className="text-muted-foreground text-sm mt-1">
					Configure position limits, risk management, and trading hours.
				</p>
			</div>

			{config && <TradingConfigForm config={config} updateMutation={updateMutation} />}
		</div>
	);
}

interface TradingConfigFormProps {
	config: Record<string, unknown>;
	updateMutation: ReturnType<typeof useMutation<unknown, Error, Record<string, unknown>>>;
}

function TradingConfigForm({ config, updateMutation }: TradingConfigFormProps) {
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
			tradingHoursOnly: (config.tradingHoursOnly as boolean) ?? true,
			extendedHoursAllowed: (config.extendedHoursAllowed as boolean) ?? false,
			allowShortSelling: (config.allowShortSelling as boolean) ?? false,
			proposalTimeoutSec: (config.proposalTimeoutSec as number) ?? 900,
			llmTemperature: (config.llmTemperature as number) ?? 0.3,
			llmMaxTokens: (config.llmMaxTokens as number) ?? 1000,
			scoreWindows: (config.scoreWindows as number[]) ?? [30, 90, 180],
			confidenceDisplayHigh: (config.confidenceDisplayHigh as number) ?? 0.7,
			confidenceDisplayMed: (config.confidenceDisplayMed as number) ?? 0.4,
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

			{/* Advanced Settings - Collapsible */}
			<Collapsible>
				<Card>
					<CardHeader>
						<CollapsibleTrigger asChild>
							<div className="flex items-center justify-between cursor-pointer">
								<div>
									<CardTitle>Advanced Settings</CardTitle>
									<CardDescription>
										Fine-tune proposal timing, AI model behavior, and display preferences.
									</CardDescription>
								</div>
								<ChevronDown className="h-4 w-4 text-muted-foreground transition-transform" />
							</div>
						</CollapsibleTrigger>
					</CardHeader>
					<CollapsibleContent>
						<CardContent className="space-y-8">
							{/* Proposals */}
							<div className="space-y-4">
								<h4 className="text-sm font-medium text-foreground">Proposals</h4>
								<form.Field name="proposalTimeoutSec">
									{(field) => (
										<div className="space-y-2">
											<Label htmlFor="proposalTimeoutSec">
												Proposal Timeout ({Math.floor(field.state.value / 60)}m{' '}
												{field.state.value % 60}s)
											</Label>
											<Input
												id="proposalTimeoutSec"
												type="number"
												min={60}
												max={3600}
												step={60}
												value={field.state.value}
												onChange={(e) => field.handleChange(Number(e.target.value))}
											/>
											<p className="text-xs text-muted-foreground">
												How long a trade proposal stays active before auto-expiring (60s - 3600s).
											</p>
										</div>
									)}
								</form.Field>
							</div>

							{/* AI Model */}
							<div className="space-y-4">
								<h4 className="text-sm font-medium text-foreground">AI Model</h4>
								<form.Field name="llmTemperature">
									{(field) => (
										<div className="space-y-2">
											<Label htmlFor="llmTemperature">
												Temperature ({field.state.value.toFixed(2)})
											</Label>
											<Input
												id="llmTemperature"
												type="range"
												min={0}
												max={1}
												step={0.05}
												value={field.state.value}
												onChange={(e) => field.handleChange(Number(e.target.value))}
												className="w-full"
											/>
											<div className="flex justify-between text-xs text-muted-foreground">
												<span>Conservative (0.0)</span>
												<span>Balanced (0.3)</span>
												<span>Creative (1.0)</span>
											</div>
											<p className="text-xs text-muted-foreground">
												Controls AI creativity. Lower = more deterministic, higher = more varied
												analysis.
											</p>
										</div>
									)}
								</form.Field>

								<form.Field name="llmMaxTokens">
									{(field) => (
										<div className="space-y-2">
											<Label htmlFor="llmMaxTokens">
												Max Response Length ({field.state.value} tokens)
											</Label>
											<Input
												id="llmMaxTokens"
												type="range"
												min={200}
												max={4000}
												step={100}
												value={field.state.value}
												onChange={(e) => field.handleChange(Number(e.target.value))}
												className="w-full"
											/>
											<div className="flex justify-between text-xs text-muted-foreground">
												<span>Concise (200)</span>
												<span>Standard (1000)</span>
												<span>Detailed (4000)</span>
											</div>
											<p className="text-xs text-muted-foreground">
												Maximum AI response length. Higher values allow more detailed analysis but
												cost more tokens.
											</p>
										</div>
									)}
								</form.Field>
							</div>

							{/* Display */}
							<div className="space-y-4">
								<h4 className="text-sm font-medium text-foreground">Display</h4>

								<form.Field name="scoreWindows">
									{(field) => (
										<div className="space-y-2">
											<Label>Performance Windows (days)</Label>
											<ScoreWindowsEditor value={field.state.value} onChange={field.handleChange} />
											<p className="text-xs text-muted-foreground">
												Time periods shown in the performance dashboard. 1-5 windows, each 7-365
												days.
											</p>
										</div>
									)}
								</form.Field>

								<form.Field
									name="confidenceDisplayHigh"
									validators={{
										onChange: ({ value, fieldApi }) => {
											const med = fieldApi.form.getFieldValue('confidenceDisplayMed');
											if (value <= med) return 'Must be greater than medium threshold';
											return undefined;
										},
									}}
								>
									{(field) => (
										<div className="space-y-2">
											<Label htmlFor="confidenceDisplayHigh">
												High Confidence Threshold ({(field.state.value * 100).toFixed(0)}%)
											</Label>
											<Input
												id="confidenceDisplayHigh"
												type="range"
												min={0.5}
												max={1.0}
												step={0.05}
												value={field.state.value}
												onChange={(e) => field.handleChange(Number(e.target.value))}
												className="w-full"
											/>
											<p className="text-xs text-muted-foreground">
												Confidence at or above this value is shown in green.
											</p>
											{field.state.meta.errors.length > 0 && (
												<p className="text-xs text-destructive">{field.state.meta.errors[0]}</p>
											)}
										</div>
									)}
								</form.Field>

								<form.Field
									name="confidenceDisplayMed"
									validators={{
										onChange: ({ value, fieldApi }) => {
											const high = fieldApi.form.getFieldValue('confidenceDisplayHigh');
											if (value >= high) return 'Must be less than high threshold';
											return undefined;
										},
									}}
								>
									{(field) => (
										<div className="space-y-2">
											<Label htmlFor="confidenceDisplayMed">
												Medium Confidence Threshold ({(field.state.value * 100).toFixed(0)}%)
											</Label>
											<Input
												id="confidenceDisplayMed"
												type="range"
												min={0.1}
												max={0.7}
												step={0.05}
												value={field.state.value}
												onChange={(e) => field.handleChange(Number(e.target.value))}
												className="w-full"
											/>
											<p className="text-xs text-muted-foreground">
												Confidence at or above this (but below high) is shown in yellow. Below this
												is red.
											</p>
											{field.state.meta.errors.length > 0 && (
												<p className="text-xs text-destructive">{field.state.meta.errors[0]}</p>
											)}
										</div>
									)}
								</form.Field>

								<ConfidencePreview
									high={form.getFieldValue('confidenceDisplayHigh')}
									med={form.getFieldValue('confidenceDisplayMed')}
								/>
							</div>
						</CardContent>
					</CollapsibleContent>
				</Card>
			</Collapsible>

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
