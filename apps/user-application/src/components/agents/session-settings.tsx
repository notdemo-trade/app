import type { SessionConfig } from '@repo/data-ops/agents/session/types';
import { Loader2, Settings } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import type { useSession } from '@/lib/session-connection';
import { OrchestrationModeSelector } from './orchestration-mode-selector';

interface SessionSettingsProps {
	session: ReturnType<typeof useSession>;
}

export function SessionSettings({ session }: SessionSettingsProps) {
	const [config, setConfig] = useState<SessionConfig | null>(null);
	const [loading, setLoading] = useState(true);
	const [watchlistInput, setWatchlistInput] = useState('');

	useEffect(() => {
		let cancelled = false;
		setLoading(true);
		session
			.getConfig()
			.then((cfg) => {
				if (cancelled) return;
				setConfig(cfg);
				setWatchlistInput(cfg.watchlistSymbols.join(', '));
			})
			.finally(() => {
				if (!cancelled) setLoading(false);
			});
		return () => {
			cancelled = true;
		};
	}, [session.getConfig]);

	const updateField = useCallback(
		<K extends keyof SessionConfig>(key: K, value: SessionConfig[K]) => {
			if (!config) return;
			setConfig({ ...config, [key]: value });
			session.updateConfig({ [key]: value });
		},
		[config, session.updateConfig],
	);

	if (loading) {
		return (
			<Card>
				<CardContent className="flex items-center justify-center py-12">
					<Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
				</CardContent>
			</Card>
		);
	}

	if (!config) {
		return (
			<Card>
				<CardContent className="py-8 text-center text-sm text-muted-foreground">
					Failed to load configuration.
				</CardContent>
			</Card>
		);
	}

	return (
		<Card>
			<CardHeader>
				<div className="flex items-center gap-2">
					<Settings className="h-5 w-5 text-muted-foreground" />
					<CardTitle className="text-lg">Session Settings</CardTitle>
				</div>
			</CardHeader>
			<CardContent className="space-y-6">
				{/* Orchestration Mode */}
				<section className="space-y-2">
					<Label className="text-sm font-medium text-foreground">Orchestration Mode</Label>
					<OrchestrationModeSelector
						value={config.orchestrationMode}
						onChange={(mode) => updateField('orchestrationMode', mode)}
					/>
				</section>

				{/* LLM Provider & Model */}
				<section className="space-y-2">
					<Label className="text-sm font-medium text-foreground">LLM Provider</Label>
					<div className="grid grid-cols-2 gap-3">
						<Select
							value={config.llmProvider}
							onChange={(e) => {
								const provider = e.target.value;
								updateField('llmProvider', provider as SessionConfig['llmProvider']);
							}}
						>
							<option value="workers-ai">Workers AI</option>
							<option value="openai">OpenAI</option>
							<option value="anthropic">Anthropic</option>
							<option value="google">Google</option>
							<option value="xai">xAI</option>
							<option value="deepseek">DeepSeek</option>
						</Select>
						<Input
							value={config.llmModel}
							onChange={(e) => updateField('llmModel', e.target.value)}
							placeholder="Model name"
						/>
					</div>
				</section>

				{/* Watchlist */}
				<section className="space-y-2">
					<Label className="text-sm font-medium text-foreground">Watchlist Symbols</Label>
					<div className="flex gap-2">
						<Input
							value={watchlistInput}
							onChange={(e) => setWatchlistInput(e.target.value)}
							placeholder="AAPL, MSFT, GOOGL"
							onBlur={() => {
								const symbols = watchlistInput
									.split(',')
									.map((s) => s.trim().toUpperCase())
									.filter(Boolean);
								updateField('watchlistSymbols', symbols);
							}}
						/>
					</div>
					<div className="flex flex-wrap gap-1">
						{config.watchlistSymbols.map((sym) => (
							<Badge key={sym} variant="secondary">
								{sym}
							</Badge>
						))}
					</div>
				</section>

				{/* Broker */}
				<section className="space-y-2">
					<Label className="text-sm font-medium text-foreground">Broker</Label>
					<Select
						value={config.brokerType}
						onChange={(e) => updateField('brokerType', e.target.value)}
					>
						<option value="alpaca">Alpaca</option>
						<option value="paper">Paper Trading</option>
					</Select>
				</section>

				{/* Advanced Settings */}
				<section className="space-y-3 rounded-md border border-border p-4">
					<h4 className="text-sm font-medium text-foreground">Advanced Settings</h4>

					<div className="grid grid-cols-2 gap-4">
						<div className="space-y-1">
							<Label className="text-xs text-muted-foreground">Analysis Interval (sec)</Label>
							<Input
								type="number"
								min={30}
								max={3600}
								value={config.analysisIntervalSec}
								onChange={(e) => updateField('analysisIntervalSec', Number(e.target.value))}
							/>
						</div>
						<div className="space-y-1">
							<Label className="text-xs text-muted-foreground">Min Confidence</Label>
							<Input
								type="number"
								min={0}
								max={1}
								step={0.05}
								value={config.minConfidenceThreshold}
								onChange={(e) => updateField('minConfidenceThreshold', Number(e.target.value))}
							/>
						</div>
						<div className="space-y-1">
							<Label className="text-xs text-muted-foreground">Position Size (% of cash)</Label>
							<Input
								type="number"
								min={0.01}
								max={0.5}
								step={0.01}
								value={config.positionSizePctOfCash}
								onChange={(e) => updateField('positionSizePctOfCash', Number(e.target.value))}
							/>
						</div>
						<div className="space-y-1">
							<Label className="text-xs text-muted-foreground">Debate Rounds</Label>
							<Input
								type="number"
								min={1}
								max={5}
								value={config.debateRounds}
								onChange={(e) => updateField('debateRounds', Number(e.target.value))}
							/>
						</div>
						<div className="space-y-1">
							<Label className="text-xs text-muted-foreground">Proposal Timeout (sec)</Label>
							<Input
								type="number"
								min={60}
								max={3600}
								value={config.proposalTimeoutSec}
								onChange={(e) => updateField('proposalTimeoutSec', Number(e.target.value))}
							/>
						</div>
						<div className="space-y-1">
							<Label className="text-xs text-muted-foreground">Strategy ID</Label>
							<Input
								value={config.activeStrategyId}
								onChange={(e) => updateField('activeStrategyId', e.target.value)}
								placeholder="Strategy ID"
							/>
						</div>
					</div>
				</section>
			</CardContent>
		</Card>
	);
}
