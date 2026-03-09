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
If portfolio context is provided, factor in existing positions, pending proposals, and tracking outcomes. Avoid recommending buys that would create excessive concentration. If a pending proposal already exists for the symbol, acknowledge it and adjust accordingly.

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

If portfolio context is provided, factor the user's existing positions into your analysis. Consider whether to add to, hold, or exit an existing position rather than treating every analysis as a fresh entry.

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

If portfolio context is provided, weigh whether to add to, hold, or exit an existing position. Consider pending proposals and tracking outcomes to avoid duplicate or conflicting recommendations.

Debate transcript:
`;

export const RISK_VALIDATION_PROMPT = `You are a portfolio risk manager. Evaluate the following trade recommendation against the current portfolio state.

Return a JSON object with:
- approved: boolean (whether the trade should proceed)
- adjustedPositionSize: number or null (adjusted size if needed)
- warnings: string[] of risk warnings
- rationale: explanation of your risk assessment

Focus your assessment on the PROPOSED TRADE's symbol only. Evaluate whether:
1. The proposed position size is appropriate given available capital and buying power
2. The trade would create excessive concentration in the TARGET symbol specifically
3. The entry/stop-loss/target prices imply acceptable risk-reward
4. There are pending proposals for the same symbol that would create duplicate exposure
5. Total exposure including pending and tracking positions stays within acceptable limits

Existing positions in OTHER symbols are portfolio context for diversification — they are NOT a reason to reject a trade in a different asset. A portfolio holding BTCUSD does not make an AAPL trade risky. Only flag other positions if the proposed trade would push total portfolio leverage or margin usage to dangerous levels.
`;

export const EVENT_CLASSIFICATION_PROMPT = `Classify the following financial event. Return JSON with:
- event_type: one of "earnings", "merger", "insider", "regulatory", "macro", "rumor", "other"
- symbols: array of affected ticker symbols
- summary: one-sentence summary
- confidence: 0-1

Event content:
`;
