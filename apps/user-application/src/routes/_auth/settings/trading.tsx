import { useForm } from '@tanstack/react-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { ArrowLeft, ChevronDown } from 'lucide-react';
import { useTranslations } from 'use-intl';
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
	const t = useTranslations();
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
					{t('common.backToDashboard')}
				</Link>
				<h1 className="text-2xl font-bold text-foreground">{t('tradingPage.title')}</h1>
				<p className="text-muted-foreground text-sm mt-1">{t('tradingPage.description')}</p>
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
	const t = useTranslations();
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

			{updateMutation.isSuccess && <Alert variant="success">{t('tradingPage.configSaved')}</Alert>}

			<Card>
				<CardHeader>
					<CardTitle>{t('tradingPage.positionLimits.title')}</CardTitle>
					<CardDescription>{t('tradingPage.positionLimits.description')}</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					<form.Field name="maxPositions">
						{(field) => (
							<div className="space-y-2">
								<Label htmlFor="maxPositions">{t('tradingPage.maxPositions')}</Label>
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
								<Label htmlFor="maxPositionValue">{t('tradingPage.maxPositionValue')}</Label>
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
								<Label htmlFor="maxNotionalPerTrade">{t('tradingPage.maxPerTrade')}</Label>
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
					<CardTitle>{t('tradingPage.riskManagement.title')}</CardTitle>
					<CardDescription>{t('tradingPage.riskManagement.description')}</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					<form.Field name="stopLossPct">
						{(field) => (
							<div className="space-y-2">
								<Label htmlFor="stopLossPct">
									{t('tradingPage.stopLoss', { pct: (field.state.value * 100).toFixed(1) })}
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
								<p className="text-xs text-muted-foreground">{t('tradingPage.stopLossHelp')}</p>
							</div>
						)}
					</form.Field>

					<form.Field name="takeProfitPct">
						{(field) => (
							<div className="space-y-2">
								<Label htmlFor="takeProfitPct">
									{t('tradingPage.takeProfit', { pct: (field.state.value * 100).toFixed(1) })}
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
								<p className="text-xs text-muted-foreground">{t('tradingPage.takeProfitHelp')}</p>
							</div>
						)}
					</form.Field>

					<form.Field name="maxDailyLossPct">
						{(field) => (
							<div className="space-y-2">
								<Label htmlFor="maxDailyLossPct">
									{t('tradingPage.maxDailyLoss', { pct: (field.state.value * 100).toFixed(1) })}
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
								<p className="text-xs text-muted-foreground">{t('tradingPage.maxDailyLossHelp')}</p>
							</div>
						)}
					</form.Field>

					<form.Field name="positionSizePctOfCash">
						{(field) => (
							<div className="space-y-2">
								<Label htmlFor="positionSizePctOfCash">
									{t('tradingPage.positionSize', { pct: (field.state.value * 100).toFixed(1) })}
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
								<Label htmlFor="cooldownMinutesAfterLoss">
									{t('tradingPage.cooldownAfterLoss')}
								</Label>
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
					<CardTitle>{t('tradingPage.tradingHours')}</CardTitle>
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
								<Label htmlFor="tradingHoursOnly">{t('tradingPage.marketHoursOnly')}</Label>
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
								<Label htmlFor="extendedHoursAllowed">{t('tradingPage.extendedHours')}</Label>
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
								<Label htmlFor="allowShortSelling">{t('tradingPage.allowShortSelling')}</Label>
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
									<CardTitle>{t('tradingPage.advanced.title')}</CardTitle>
									<CardDescription>{t('tradingPage.advanced.description')}</CardDescription>
								</div>
								<ChevronDown className="h-4 w-4 text-muted-foreground transition-transform" />
							</div>
						</CollapsibleTrigger>
					</CardHeader>
					<CollapsibleContent>
						<CardContent className="space-y-8">
							{/* Proposals */}
							<div className="space-y-4">
								<h4 className="text-sm font-medium text-foreground">
									{t('tradingPage.proposals')}
								</h4>
								<form.Field name="proposalTimeoutSec">
									{(field) => (
										<div className="space-y-2">
											<Label htmlFor="proposalTimeoutSec">
												{t('tradingPage.proposalTimeout', {
													time: `${Math.floor(field.state.value / 60)}m ${field.state.value % 60}s`,
												})}
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
												{t('tradingPage.proposalTimeoutHelp')}
											</p>
										</div>
									)}
								</form.Field>
							</div>

							{/* AI Model */}
							<div className="space-y-4">
								<h4 className="text-sm font-medium text-foreground">{t('tradingPage.aiModel')}</h4>
								<form.Field name="llmTemperature">
									{(field) => (
										<div className="space-y-2">
											<Label htmlFor="llmTemperature">
												{t('tradingPage.temperature', { value: field.state.value.toFixed(2) })}
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
												<span>{t('tradingPage.conservative')}</span>
												<span>{t('tradingPage.balanced')}</span>
												<span>{t('tradingPage.creative')}</span>
											</div>
											<p className="text-xs text-muted-foreground">
												{t('tradingPage.temperatureHelp')}
											</p>
										</div>
									)}
								</form.Field>

								<form.Field name="llmMaxTokens">
									{(field) => (
										<div className="space-y-2">
											<Label htmlFor="llmMaxTokens">
												{t('tradingPage.maxResponseLength', { value: field.state.value })}
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
												<span>{t('tradingPage.concise')}</span>
												<span>{t('tradingPage.standard')}</span>
												<span>{t('tradingPage.detailed')}</span>
											</div>
											<p className="text-xs text-muted-foreground">
												{t('tradingPage.maxResponseLengthHelp')}
											</p>
										</div>
									)}
								</form.Field>
							</div>

							{/* Display */}
							<div className="space-y-4">
								<h4 className="text-sm font-medium text-foreground">{t('tradingPage.display')}</h4>

								<form.Field name="scoreWindows">
									{(field) => (
										<div className="space-y-2">
											<Label>{t('tradingPage.performanceWindows')}</Label>
											<ScoreWindowsEditor value={field.state.value} onChange={field.handleChange} />
											<p className="text-xs text-muted-foreground">
												{t('tradingPage.performanceWindowsHelp')}
											</p>
										</div>
									)}
								</form.Field>

								<form.Field
									name="confidenceDisplayHigh"
									validators={{
										onChange: ({ value, fieldApi }) => {
											const med = fieldApi.form.getFieldValue('confidenceDisplayMed');
											if (value <= med) return t('tradingPage.mustBeGreaterThanMed');
											return undefined;
										},
									}}
								>
									{(field) => (
										<div className="space-y-2">
											<Label htmlFor="confidenceDisplayHigh">
												{t('tradingPage.highConfidence', {
													pct: (field.state.value * 100).toFixed(0),
												})}
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
												{t('tradingPage.highConfidenceHelp')}
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
											if (value >= high) return t('tradingPage.mustBeLessThanHigh');
											return undefined;
										},
									}}
								>
									{(field) => (
										<div className="space-y-2">
											<Label htmlFor="confidenceDisplayMed">
												{t('tradingPage.medConfidence', {
													pct: (field.state.value * 100).toFixed(0),
												})}
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
												{t('tradingPage.medConfidenceHelp')}
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
						{updateMutation.isPending ? t('common.saving') : t('tradingPage.saveConfiguration')}
					</Button>
				)}
			</form.Subscribe>
		</form>
	);
}
