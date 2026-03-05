import type { Bar, TechnicalIndicators } from '@repo/data-ops/agents/ta/types';
import { useEffect, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';

interface PriceChartProps {
	bars: Bar[];
	indicators: TechnicalIndicators;
	height?: number;
}

function toUTCTimestamp(isoStr: string): number {
	return Math.floor(new Date(isoStr).getTime() / 1000);
}

function isDarkMode(): boolean {
	if (typeof document === 'undefined') return false;
	return document.documentElement.classList.contains('dark');
}

function getChartColors() {
	const dark = isDarkMode();
	return {
		background: 'transparent',
		text: dark ? '#a1a1aa' : '#71717a',
		grid: dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
		bullish: dark ? '#4ade80' : '#16a34a',
		bearish: dark ? '#f87171' : '#dc2626',
		sma20: dark ? '#60a5fa' : '#2563eb',
		sma50: dark ? '#fb923c' : '#ea580c',
		sma200: dark ? '#c084fc' : '#9333ea',
	};
}

export function PriceChart({ bars, indicators, height = 400 }: PriceChartProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const chartRef = useRef<ReturnType<typeof import('lightweight-charts').createChart> | null>(null);

	useEffect(() => {
		const container = containerRef.current;
		if (!container || bars.length === 0) return;

		let disposed = false;

		async function initChart() {
			const lc = await import('lightweight-charts');
			if (disposed || !container) return;

			if (chartRef.current) {
				chartRef.current.remove();
				chartRef.current = null;
			}

			const colors = getChartColors();

			const chart = lc.createChart(container, {
				height,
				layout: {
					background: { color: colors.background },
					textColor: colors.text,
				},
				grid: {
					vertLines: { color: colors.grid },
					horzLines: { color: colors.grid },
				},
				crosshair: { mode: 0 },
				rightPriceScale: { borderColor: colors.grid },
				timeScale: { borderColor: colors.grid },
			});

			chartRef.current = chart;

			const candlestickData = bars.map((bar) => ({
				time: toUTCTimestamp(bar.t) as unknown as import('lightweight-charts').UTCTimestamp,
				open: bar.o,
				high: bar.h,
				low: bar.l,
				close: bar.c,
			}));

			const candleSeries = chart.addSeries(lc.CandlestickSeries, {
				upColor: colors.bullish,
				downColor: colors.bearish,
				borderUpColor: colors.bullish,
				borderDownColor: colors.bearish,
				wickUpColor: colors.bullish,
				wickDownColor: colors.bearish,
			});
			candleSeries.setData(candlestickData);

			const volumeData = bars.map((bar) => ({
				time: toUTCTimestamp(bar.t) as unknown as import('lightweight-charts').UTCTimestamp,
				value: bar.v,
				color: bar.c >= bar.o ? `${colors.bullish}4D` : `${colors.bearish}4D`,
			}));
			const volumeSeries = chart.addSeries(lc.HistogramSeries, {
				priceFormat: { type: 'volume' },
				priceScaleId: 'volume',
			});
			volumeSeries.setData(volumeData);
			chart.priceScale('volume').applyOptions({
				scaleMargins: { top: 0.8, bottom: 0 },
			});

			if (indicators.sma_20 !== null) {
				addSMALine(chart, lc, bars, 20, colors.sma20);
			}
			if (indicators.sma_50 !== null) {
				addSMALine(chart, lc, bars, 50, colors.sma50);
			}
			if (indicators.sma_200 !== null) {
				addSMALine(chart, lc, bars, 200, colors.sma200);
			}

			renderLegend(container, colors, indicators);
			chart.timeScale().fitContent();
		}

		initChart();

		const observer = new ResizeObserver((entries) => {
			if (chartRef.current && entries[0]) {
				chartRef.current.applyOptions({ width: entries[0].contentRect.width });
			}
		});
		observer.observe(container);

		return () => {
			disposed = true;
			observer.disconnect();
			if (chartRef.current) {
				chartRef.current.remove();
				chartRef.current = null;
			}
		};
	}, [bars, indicators, height]);

	return (
		<Card>
			<CardContent className="p-0 relative">
				<div ref={containerRef} className="w-full" />
			</CardContent>
		</Card>
	);
}

function renderLegend(
	container: HTMLElement,
	colors: ReturnType<typeof getChartColors>,
	indicators: TechnicalIndicators,
) {
	const existing = container.querySelector('[data-chart-legend]');
	if (existing) existing.remove();

	const items: { label: string; color: string }[] = [];
	if (indicators.sma_20 !== null) items.push({ label: 'SMA 20', color: colors.sma20 });
	if (indicators.sma_50 !== null) items.push({ label: 'SMA 50', color: colors.sma50 });
	if (indicators.sma_200 !== null) items.push({ label: 'SMA 200', color: colors.sma200 });
	if (items.length === 0) return;

	const legend = document.createElement('div');
	legend.setAttribute('data-chart-legend', '');
	legend.style.cssText =
		'position:absolute;top:8px;left:8px;display:flex;gap:12px;z-index:10;font-size:12px;pointer-events:none;';

	for (const item of items) {
		const entry = document.createElement('div');
		entry.style.cssText = 'display:flex;align-items:center;gap:4px;';
		const dot = document.createElement('span');
		dot.style.cssText = `width:10px;height:3px;border-radius:1px;background:${item.color};display:inline-block;`;
		const text = document.createElement('span');
		text.style.color = colors.text;
		text.textContent = item.label;
		entry.appendChild(dot);
		entry.appendChild(text);
		legend.appendChild(entry);
	}

	container.style.position = 'relative';
	container.appendChild(legend);
}

function addSMALine(
	chart: ReturnType<typeof import('lightweight-charts').createChart>,
	lc: typeof import('lightweight-charts'),
	bars: Bar[],
	period: number,
	color: string,
) {
	const closes = bars.map((b) => b.c);
	if (closes.length < period) return;

	const smaData: { time: import('lightweight-charts').UTCTimestamp; value: number }[] = [];
	for (let i = period - 1; i < closes.length; i++) {
		const bar = bars[i];
		if (!bar) continue;
		const slice = closes.slice(i - period + 1, i + 1);
		const avg = slice.reduce((a, b) => a + b, 0) / period;
		smaData.push({
			time: toUTCTimestamp(bar.t) as unknown as import('lightweight-charts').UTCTimestamp,
			value: avg,
		});
	}

	const series = chart.addSeries(lc.LineSeries, {
		color,
		lineWidth: 1,
		priceLineVisible: false,
		lastValueVisible: false,
		crosshairMarkerVisible: false,
	});
	series.setData(smaData);
}
