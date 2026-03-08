import type { TechnicalIndicators } from '@repo/data-ops/agents/ta/types';
import type { TechnicalAnalysisConfig } from '@repo/data-ops/ta-config';
import { DEFAULT_TA_CONFIG } from '@repo/data-ops/ta-config';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface IndicatorPanelsProps {
	indicators: TechnicalIndicators;
	config?: TechnicalAnalysisConfig;
}

function rsiColor(value: number | null, config: TechnicalAnalysisConfig): string {
	if (value === null) return 'text-muted-foreground';
	if (value < config.rsiOversold) return 'text-green-500';
	if (value > config.rsiOverbought) return 'text-red-500';
	return 'text-foreground';
}

function rsiLabel(value: number | null, config: TechnicalAnalysisConfig): string {
	if (value === null) return '--';
	if (value < config.rsiOversold) return 'Oversold';
	if (value > config.rsiOverbought) return 'Overbought';
	return 'Neutral';
}

function RSIPanel({ value, config }: { value: number | null; config: TechnicalAnalysisConfig }) {
	return (
		<Card>
			<CardHeader className="pb-2">
				<CardTitle className="text-sm text-muted-foreground">RSI ({config.rsiPeriod})</CardTitle>
			</CardHeader>
			<CardContent>
				<div className={`text-2xl font-bold ${rsiColor(value, config)}`}>
					{value !== null ? value.toFixed(1) : '--'}
				</div>
				{value !== null && (
					<>
						<div className="mt-2 h-2 rounded bg-muted overflow-hidden">
							<div className="h-full rounded bg-primary" style={{ width: `${value}%` }} />
						</div>
						<p className="text-xs text-muted-foreground mt-1">{rsiLabel(value, config)}</p>
					</>
				)}
			</CardContent>
		</Card>
	);
}

function MACDPanel({ macd }: { macd: { macd: number; signal: number; histogram: number } | null }) {
	return (
		<Card>
			<CardHeader className="pb-2">
				<CardTitle className="text-sm text-muted-foreground">MACD</CardTitle>
			</CardHeader>
			<CardContent>
				{macd ? (
					<div className="space-y-1">
						<div className="flex justify-between text-sm">
							<span className="text-muted-foreground">MACD</span>
							<span className="text-foreground font-mono">{macd.macd.toFixed(3)}</span>
						</div>
						<div className="flex justify-between text-sm">
							<span className="text-muted-foreground">Signal</span>
							<span className="text-foreground font-mono">{macd.signal.toFixed(3)}</span>
						</div>
						<div className="flex justify-between text-sm">
							<span className="text-muted-foreground">Hist</span>
							<span
								className={`font-mono font-bold ${macd.histogram > 0 ? 'text-green-500' : 'text-red-500'}`}
							>
								{macd.histogram.toFixed(3)}
							</span>
						</div>
					</div>
				) : (
					<div className="text-2xl font-bold text-muted-foreground">--</div>
				)}
			</CardContent>
		</Card>
	);
}

function ATRPanel({
	value,
	price,
	config,
}: {
	value: number | null;
	price: number;
	config: TechnicalAnalysisConfig;
}) {
	return (
		<Card>
			<CardHeader className="pb-2">
				<CardTitle className="text-sm text-muted-foreground">ATR ({config.atrPeriod})</CardTitle>
			</CardHeader>
			<CardContent>
				<div className="text-2xl font-bold text-foreground">
					{value !== null ? `$${value.toFixed(2)}` : '--'}
				</div>
				{value !== null && price > 0 && (
					<p className="text-xs text-muted-foreground mt-1">
						{((value / price) * 100).toFixed(2)}% of price
					</p>
				)}
			</CardContent>
		</Card>
	);
}

function VolumePanel({
	relativeVolume,
	volumeSma,
	config,
}: {
	relativeVolume: number | null;
	volumeSma: number | null;
	config: TechnicalAnalysisConfig;
}) {
	return (
		<Card>
			<CardHeader className="pb-2">
				<CardTitle className="text-sm text-muted-foreground">Rel Volume</CardTitle>
			</CardHeader>
			<CardContent>
				<div
					className={`text-2xl font-bold ${relativeVolume !== null && relativeVolume > config.volumeSpikeMultiplier ? 'text-yellow-500' : 'text-foreground'}`}
				>
					{relativeVolume !== null ? `${relativeVolume.toFixed(1)}x` : '--'}
				</div>
				{volumeSma !== null && (
					<p className="text-xs text-muted-foreground mt-1">
						Avg: {Math.round(volumeSma).toLocaleString()}
					</p>
				)}
			</CardContent>
		</Card>
	);
}

export function IndicatorPanels({ indicators, config = DEFAULT_TA_CONFIG }: IndicatorPanelsProps) {
	return (
		<div className="grid grid-cols-2 md:grid-cols-4 gap-4">
			<RSIPanel value={indicators.rsi} config={config} />
			<MACDPanel macd={indicators.macd} />
			<ATRPanel value={indicators.atr} price={indicators.price} config={config} />
			<VolumePanel
				relativeVolume={indicators.relativeVolume}
				volumeSma={indicators.volumeSma}
				config={config}
			/>
		</div>
	);
}
