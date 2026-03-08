import {
	PRESET_DESCRIPTIONS,
	PRESET_LABELS,
	type PresetName,
	type TechnicalAnalysisConfig,
} from '@repo/data-ops/ta-config';
import { useForm } from '@tanstack/react-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { ArrowLeft, ChevronDown } from 'lucide-react';
import { useState } from 'react';
import { useTranslations } from 'use-intl';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import {
	applyTaPreset,
	getUserTaConfig,
	resetUserTaConfig,
	updateUserTaConfig,
} from '@/core/functions/ta-config/direct';
import { taConfigKeys } from '@/lib/query-keys';

export const Route = createFileRoute('/_auth/settings/technical-analysis')({
	component: TechnicalAnalysisConfigPage,
});

function TechnicalAnalysisConfigPage() {
	const t = useTranslations('taConfig');
	const queryClient = useQueryClient();

	const configQuery = useQuery({
		queryKey: taConfigKeys.detail(),
		queryFn: () => getUserTaConfig(),
	});

	const updateMutation = useMutation({
		mutationFn: (config: TechnicalAnalysisConfig) => updateUserTaConfig({ data: config }),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: taConfigKeys.all }),
	});

	const presetMutation = useMutation({
		mutationFn: (presetName: PresetName) => applyTaPreset({ data: { presetName } }),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: taConfigKeys.all }),
	});

	const resetMutation = useMutation({
		mutationFn: () => resetUserTaConfig(),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: taConfigKeys.all }),
	});

	if (configQuery.isPending) {
		return (
			<div className="max-w-2xl mx-auto p-6">
				<p className="text-muted-foreground">Loading...</p>
			</div>
		);
	}

	if (configQuery.isError) {
		return (
			<div className="max-w-2xl mx-auto p-6">
				<Alert variant="destructive">
					<AlertDescription>Failed to load configuration</AlertDescription>
				</Alert>
			</div>
		);
	}

	return (
		<ConfigForm
			config={configQuery.data}
			onSave={(config) => {
				updateMutation.reset();
				updateMutation.mutate(config);
			}}
			onApplyPreset={(preset) => {
				presetMutation.reset();
				presetMutation.mutate(preset);
			}}
			onReset={() => {
				resetMutation.reset();
				resetMutation.mutate();
			}}
			isSaving={updateMutation.isPending}
			isResetting={resetMutation.isPending}
			saveSuccess={updateMutation.isSuccess}
			saveError={updateMutation.isError ? updateMutation.error.message : null}
			t={t}
		/>
	);
}

interface ConfigFormProps {
	config: TechnicalAnalysisConfig;
	onSave: (config: TechnicalAnalysisConfig) => void;
	onApplyPreset: (preset: PresetName) => void;
	onReset: () => void;
	isSaving: boolean;
	isResetting: boolean;
	saveSuccess: boolean;
	saveError: string | null;
	t: ReturnType<typeof useTranslations>;
}

function ConfigForm({
	config,
	onSave,
	onApplyPreset,
	onReset,
	isSaving,
	isResetting,
	saveSuccess,
	saveError,
	t,
}: ConfigFormProps) {
	const form = useForm({
		defaultValues: config,
		onSubmit: ({ value }) => onSave(value),
	});

	return (
		<div className="max-w-2xl mx-auto p-6 space-y-6">
			<div>
				<Link
					to="/settings/trading"
					className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1 mb-4"
				>
					<ArrowLeft className="h-3 w-3" />
					Back to Settings
				</Link>
				<h1 className="text-2xl font-bold text-foreground">{t('title')}</h1>
				<p className="text-muted-foreground mt-1">{t('description')}</p>
			</div>

			{saveSuccess && (
				<Alert>
					<AlertDescription>{t('saved')}</AlertDescription>
				</Alert>
			)}
			{saveError && (
				<Alert variant="destructive">
					<AlertDescription>{saveError}</AlertDescription>
				</Alert>
			)}

			{/* Preset Selector */}
			<Card>
				<CardHeader className="pb-3">
					<CardTitle className="text-sm text-muted-foreground">{t('preset')}</CardTitle>
				</CardHeader>
				<CardContent>
					<div className="flex items-center gap-3">
						<Select
							value={config.profileName}
							onChange={(e) => onApplyPreset(e.target.value as PresetName)}
							className="flex-1"
						>
							{Object.entries(PRESET_LABELS).map(([key, label]) => (
								<option key={key} value={key}>
									{label} — {PRESET_DESCRIPTIONS[key as PresetName]}
								</option>
							))}
						</Select>
						<Button
							variant="outline"
							onClick={onReset}
							disabled={isResetting || config.profileName === 'default'}
						>
							{isResetting ? t('resetting') : t('resetToDefault')}
						</Button>
					</div>
				</CardContent>
			</Card>

			<form
				onSubmit={(e) => {
					e.preventDefault();
					form.handleSubmit();
				}}
			>
				{/* Indicator Periods */}
				<Card className="mb-6">
					<CardHeader>
						<CardTitle>{t('indicatorPeriods')}</CardTitle>
						<CardDescription>{t('indicatorPeriodsDesc')}</CardDescription>
					</CardHeader>
					<CardContent className="space-y-4">
						<form.Field name="smaPeriods">
							{(field) => (
								<div>
									<Label>{t('smaPeriods')}</Label>
									<PeriodArrayInput
										values={field.state.value}
										onChange={field.handleChange}
										min={5}
										max={500}
									/>
									<p className="text-xs text-muted-foreground mt-1">{t('smaPeriodsHint')}</p>
								</div>
							)}
						</form.Field>

						<form.Field name="emaPeriods">
							{(field) => (
								<div>
									<Label>{t('emaPeriods')}</Label>
									<PeriodArrayInput
										values={field.state.value}
										onChange={field.handleChange}
										min={5}
										max={500}
									/>
									<p className="text-xs text-muted-foreground mt-1">{t('emaPeriodsHint')}</p>
								</div>
							)}
						</form.Field>

						<div className="grid grid-cols-2 gap-4">
							<NumberField
								form={form}
								name="rsiPeriod"
								label={t('rsiPeriod')}
								min={5}
								max={50}
								hint={t('rsiPeriodHint')}
							/>
							<NumberField
								form={form}
								name="bollingerPeriod"
								label={t('bollingerPeriod')}
								min={10}
								max={50}
								hint={t('bollingerPeriodHint')}
							/>
							<NumberField
								form={form}
								name="bollingerStdDev"
								label={t('bollingerStdDev')}
								min={1.0}
								max={3.0}
								step={0.1}
								hint={t('bollingerStdDevHint')}
							/>
							<NumberField
								form={form}
								name="atrPeriod"
								label={t('atrPeriod')}
								min={5}
								max={50}
								hint={t('atrPeriodHint')}
							/>
							<NumberField
								form={form}
								name="volumeSmaPeriod"
								label={t('volumeSmaPeriod')}
								min={5}
								max={50}
								hint={t('volumeSmaPeriodHint')}
							/>
							<NumberField
								form={form}
								name="macdSignalPeriod"
								label={t('macdSignalPeriod')}
								min={5}
								max={20}
								hint={t('macdSignalPeriodHint')}
							/>
						</div>
					</CardContent>
				</Card>

				{/* Signal Thresholds */}
				<Card className="mb-6">
					<CardHeader>
						<CardTitle>{t('signalThresholds')}</CardTitle>
						<CardDescription>{t('signalThresholdsDesc')}</CardDescription>
					</CardHeader>
					<CardContent className="space-y-4">
						<form.Field name="rsiOversold">
							{(field) => (
								<div>
									<Label>{t('rsiOversold')}</Label>
									<Input
										type="number"
										value={field.state.value}
										onChange={(e) => field.handleChange(Number(e.target.value))}
										onBlur={field.handleBlur}
										min={10}
										max={40}
									/>
									<p className="text-xs text-green-500 mt-1">
										{t('rsiOversoldHint', { value: field.state.value })}
									</p>
								</div>
							)}
						</form.Field>

						<form.Field name="rsiOverbought">
							{(field) => (
								<div>
									<Label>{t('rsiOverbought')}</Label>
									<Input
										type="number"
										value={field.state.value}
										onChange={(e) => field.handleChange(Number(e.target.value))}
										onBlur={field.handleBlur}
										min={60}
										max={90}
									/>
									<p className="text-xs text-red-500 mt-1">
										{t('rsiOverboughtHint', { value: field.state.value })}
									</p>
								</div>
							)}
						</form.Field>

						<form.Field name="volumeSpikeMultiplier">
							{(field) => (
								<div>
									<Label>{t('volumeSpikeMultiplier')}</Label>
									<Input
										type="number"
										value={field.state.value}
										onChange={(e) => field.handleChange(Number(e.target.value))}
										onBlur={field.handleBlur}
										min={1.2}
										max={5.0}
										step={0.1}
									/>
									<p className="text-xs text-yellow-500 mt-1">
										{t('volumeSpikeMultiplierHint', { value: field.state.value })}
									</p>
								</div>
							)}
						</form.Field>
					</CardContent>
				</Card>

				{/* Analysis Settings (collapsed by default) */}
				<Collapsible defaultOpen={false} className="mb-6">
					<CollapsibleTrigger asChild>
						<Button variant="ghost" className="w-full justify-between px-4 py-2 text-foreground">
							<span className="text-sm font-medium text-foreground">{t('showAdvanced')}</span>
							<ChevronDown className="h-4 w-4" />
						</Button>
					</CollapsibleTrigger>
					<CollapsibleContent>
						<Card className="mt-2">
							<CardHeader>
								<CardTitle>{t('analysisSettings')}</CardTitle>
								<CardDescription>{t('analysisSettingsDesc')}</CardDescription>
							</CardHeader>
							<CardContent>
								<div className="grid grid-cols-2 gap-4">
									<NumberField
										form={form}
										name="minBarsRequired"
										label={t('minBarsRequired')}
										min={20}
										max={200}
										hint={t('minBarsRequiredHint')}
									/>
									<NumberField
										form={form}
										name="defaultBarsToFetch"
										label={t('defaultBarsToFetch')}
										min={100}
										max={500}
										hint={t('defaultBarsToFetchHint')}
									/>
								</div>
								<div className="mt-4">
									<NumberField
										form={form}
										name="cacheFreshnessSec"
										label={t('cacheFreshnessSec')}
										min={10}
										max={300}
										hint={t('cacheFreshnessSecHint')}
									/>
								</div>
							</CardContent>
						</Card>
					</CollapsibleContent>
				</Collapsible>

				<form.Subscribe selector={(s) => s.canSubmit}>
					{(canSubmit) => (
						<Button type="submit" disabled={!canSubmit || isSaving} className="w-full">
							{isSaving ? t('saving') : t('save')}
						</Button>
					)}
				</form.Subscribe>
			</form>
		</div>
	);
}

interface NumberFieldProps {
	form: ReturnType<typeof useForm>;
	name: string;
	label: string;
	min: number;
	max: number;
	step?: number;
	hint?: string;
}

function NumberField({ form, name, label, min, max, step = 1, hint }: NumberFieldProps) {
	return (
		<form.Field name={name}>
			{(field: {
				state: { value: number };
				handleChange: (v: number) => void;
				handleBlur: () => void;
			}) => (
				<div>
					<Label>{label}</Label>
					<Input
						type="number"
						value={field.state.value}
						onChange={(e) => field.handleChange(Number(e.target.value))}
						onBlur={field.handleBlur}
						min={min}
						max={max}
						step={step}
					/>
					{hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
					<p className="text-xs text-muted-foreground">
						Range: {min}-{max}
					</p>
				</div>
			)}
		</form.Field>
	);
}

interface PeriodArrayInputProps {
	values: number[];
	onChange: (values: number[]) => void;
	min: number;
	max: number;
}

function PeriodArrayInput({ values, onChange, min, max }: PeriodArrayInputProps) {
	const [newValue, setNewValue] = useState('');

	function addPeriod() {
		const num = Number(newValue);
		if (num >= min && num <= max && !values.includes(num)) {
			onChange([...values, num].sort((a, b) => a - b));
			setNewValue('');
		}
	}

	function removePeriod(index: number) {
		onChange(values.filter((_, i) => i !== index));
	}

	return (
		<div className="flex flex-wrap items-center gap-2">
			{values.map((v, i) => (
				<span
					key={v}
					className="inline-flex items-center gap-1 px-2 py-1 rounded bg-muted text-sm text-foreground"
				>
					{v}
					<button
						type="button"
						onClick={() => removePeriod(i)}
						className="text-muted-foreground hover:text-destructive"
						aria-label={`Remove period ${v}`}
					>
						x
					</button>
				</span>
			))}
			<div className="flex items-center gap-1">
				<Input
					type="number"
					value={newValue}
					onChange={(e) => setNewValue(e.target.value)}
					onKeyDown={(e) => {
						if (e.key === 'Enter') {
							e.preventDefault();
							addPeriod();
						}
					}}
					className="w-20"
					min={min}
					max={max}
					placeholder="Add"
				/>
				<Button type="button" variant="outline" size="sm" onClick={addPeriod}>
					+
				</Button>
			</div>
		</div>
	);
}
