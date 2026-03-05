export const TRADE_RECOMMENDATION_PROMPT = `Analyze the following market data and produce a JSON trade recommendation.

Required JSON fields:
- action: "buy" | "sell" | "hold"
- confidence: 0-1
- rationale: string explanation
- entry_price: number (optional)
- target_price: number (optional)
- stop_loss: number (optional)
- position_size_pct: 1-10 (optional)
- timeframe: "intraday" | "swing" | "position" (optional)
- risks: string[] of key risk factors

Consider all signals holistically. Weight recent signals higher. Account for the user's strategy parameters.

Market data:
`;

export const RESEARCH_REPORT_PROMPT = `You are an equity research analyst. Generate a concise research report covering:
1. Technical outlook (trend, support/resistance, momentum)
2. Signal summary (what signals are saying)
3. Risk factors
4. Actionable conclusion

Write in professional, concise prose. No markdown headers — use short paragraphs.`;

export const EVENT_CLASSIFICATION_PROMPT = `Classify the following financial event. Return JSON with:
- event_type: one of "earnings", "merger", "insider", "regulatory", "macro", "rumor", "other"
- symbols: array of affected ticker symbols
- summary: one-sentence summary
- confidence: 0-1

Event content:
`;
