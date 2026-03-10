import type { TradeProposal } from '../agents/session/types';
import type { TelegramInlineKeyboard } from './types';

export function buildProposalMessage(proposal: TradeProposal): {
	text: string;
	keyboard: TelegramInlineKeyboard;
} {
	const actionEmoji = proposal.action === 'buy' ? '📈' : '📉';
	const actionText = proposal.action.toUpperCase();
	const expiresIn = Math.round((proposal.expiresAt - Date.now()) / 60000);
	const totalValue = proposal.notional
		? `$${proposal.notional.toFixed(2)}`
		: proposal.qty && proposal.entryPrice
			? `$${(proposal.qty * proposal.entryPrice).toFixed(2)}`
			: 'N/A';

	const text = `${actionEmoji} <b>Trade Proposal</b>

<b>Symbol:</b> ${proposal.symbol}
<b>Action:</b> ${actionText}
<b>Qty:</b> ${proposal.qty ?? 'TBD'}
<b>Est. Price:</b> ${proposal.entryPrice ? `$${proposal.entryPrice.toFixed(2)}` : 'market'}
<b>Notional:</b> ${totalValue}
<b>Confidence:</b> ${(proposal.confidence * 100).toFixed(0)}%

<b>Rationale:</b>
${proposal.rationale}
${proposal.risks.length > 0 ? `\n<b>Risks:</b> ${proposal.risks.join(', ')}` : ''}
${proposal.warnings.length > 0 ? `\n<b>Warnings:</b> ${proposal.warnings.join(', ')}` : ''}

<i>Expires in ${expiresIn} minutes</i>`;

	const keyboard: TelegramInlineKeyboard = {
		inline_keyboard: [
			[
				{ text: 'Approve', callback_data: `approve:${proposal.id}` },
				{ text: 'Reject', callback_data: `reject:${proposal.id}` },
			],
		],
	};

	return { text, keyboard };
}

export function buildTradeExecutedMessage(params: {
	symbol: string;
	action: 'buy' | 'sell';
	filledQty: number;
	filledAvgPrice: number;
	orderId: string;
}): string {
	const emoji = params.action === 'buy' ? 'BUY' : 'SELL';
	const totalValue = (params.filledQty * params.filledAvgPrice).toFixed(2);

	return `<b>Trade Executed — ${emoji}</b>

<b>Symbol:</b> ${params.symbol}
<b>Qty:</b> ${params.filledQty}
<b>Fill Price:</b> $${params.filledAvgPrice.toFixed(2)}
<b>Total Value:</b> $${totalValue}
<b>Order ID:</b> <code>${params.orderId}</code>`;
}

export function buildTradeRejectedMessage(params: {
	symbol: string;
	action: 'buy' | 'sell';
	reason: string;
}): string {
	return `<b>Trade Rejected</b>

<b>Symbol:</b> ${params.symbol}
<b>Action:</b> ${params.action.toUpperCase()}
<b>Reason:</b> ${params.reason}`;
}

export function buildTradeFailedMessage(params: {
	symbol: string;
	action: 'buy' | 'sell';
	error: string;
}): string {
	return `<b>Trade Failed</b>

<b>Symbol:</b> ${params.symbol}
<b>Action:</b> ${params.action.toUpperCase()}
<b>Error:</b> ${params.error}`;
}

export function buildDailySummaryMessage(params: {
	date: string;
	totalTrades: number;
	wins: number;
	losses: number;
	pnlUsd: number;
	pnlPct: number;
	equity: number;
}): string {
	const pnlSign = params.pnlUsd >= 0 ? '+' : '';
	const winRate =
		params.totalTrades > 0 ? ((params.wins / params.totalTrades) * 100).toFixed(0) : '0';

	return `<b>Daily Summary — ${params.date}</b>

<b>Trades:</b> ${params.totalTrades}
<b>Win Rate:</b> ${winRate}% (${params.wins}W/${params.losses}L)
<b>P&amp;L:</b> ${pnlSign}$${params.pnlUsd.toFixed(2)} (${pnlSign}${params.pnlPct.toFixed(2)}%)
<b>Equity:</b> $${params.equity.toFixed(2)}`;
}

export function buildRiskAlertMessage(params: {
	type: 'daily_loss_limit' | 'kill_switch';
	reason: string;
	details?: string;
}): string {
	const title =
		params.type === 'daily_loss_limit' ? 'Daily Loss Limit Reached' : 'Kill Switch Activated';

	let text = `<b>${title}</b>

<b>Reason:</b> ${params.reason}`;

	if (params.details) {
		text += `\n<b>Details:</b> ${params.details}`;
	}

	text += '\n\n<i>Trading has been paused.</i>';
	return text;
}

export function buildProposalUpdatedMessage(
	proposal: TradeProposal,
	status: 'approved' | 'rejected' | 'expired',
): string {
	const statusText = status.charAt(0).toUpperCase() + status.slice(1);

	return `<b>Trade ${statusText}</b>

<b>Symbol:</b> ${proposal.symbol}
<b>Action:</b> ${proposal.action.toUpperCase()}
<b>Qty:</b> ${proposal.qty ?? 'N/A'}
<b>Est. Price:</b> ${proposal.entryPrice ? `$${proposal.entryPrice.toFixed(2)}` : 'market'}`;
}
