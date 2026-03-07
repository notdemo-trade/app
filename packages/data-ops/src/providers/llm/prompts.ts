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

export const PERSONA_ANALYSIS_PROMPT = `Analyze the following market data from your specific perspective.

Return a JSON object with these fields:
- action: "buy" | "sell" | "hold"
- confidence: 0-1
- rationale: detailed explanation from your perspective
- keyPoints: string[] of 3-5 key supporting arguments

Market data and strategy context:
`;

export const DEBATE_ROUND_PROMPT = `You are participating in a structured debate about a trading decision. You have seen the initial analyses from all participants. Now respond to the other analysts' arguments.

Consider their points carefully. You may adjust your position if their arguments are compelling, but argue your perspective vigorously if you believe you are correct.

Return a JSON object with:
- content: your response addressing the other analysts' arguments
- revisedConfidence: 0-1 (your updated confidence after considering their arguments)
- revisedAction: "buy" | "sell" | "hold" (your updated recommendation)

Previous analyses and debate context:
`;

export const CONSENSUS_SYNTHESIS_PROMPT = `Synthesize the following multi-perspective market analyses and debate into a single consensus recommendation.

Return a JSON object with:
- action: "buy" | "sell" | "hold"
- confidence: 0-1
- rationale: comprehensive synthesis explanation
- dissent: string or null (minority opinion if no full consensus)
- entryPrice: number or null
- targetPrice: number or null
- stopLoss: number or null
- positionSizePct: number or null (1-10)
- risks: string[] of key risk factors

Debate transcript:
`;

export const RISK_VALIDATION_PROMPT = `You are a portfolio risk manager. Evaluate the following trade recommendation against the current portfolio state.

Return a JSON object with:
- approved: boolean (whether the trade should proceed)
- adjustedPositionSize: number or null (adjusted size if needed)
- warnings: string[] of risk warnings
- rationale: explanation of your risk assessment

Consider: position concentration, portfolio correlation, available capital, existing exposure, and overall risk.
`;

export const EVENT_CLASSIFICATION_PROMPT = `Classify the following financial event. Return JSON with:
- event_type: one of "earnings", "merger", "insider", "regulatory", "macro", "rumor", "other"
- symbols: array of affected ticker symbols
- summary: one-sentence summary
- confidence: 0-1

Event content:
`;
