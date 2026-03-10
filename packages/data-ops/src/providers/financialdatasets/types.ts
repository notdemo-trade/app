export interface FinancialDatasetsConfig {
	apiKey: string;
}

export interface FDIncomeStatement {
	ticker: string;
	calendar_date: string;
	report_period: string;
	period: string;
	revenue: number;
	cost_of_revenue: number;
	gross_profit: number;
	operating_expense: number;
	operating_income: number;
	net_income: number;
	eps: number;
	eps_diluted: number;
	[key: string]: unknown;
}

export interface FDBalanceSheet {
	ticker: string;
	calendar_date: string;
	report_period: string;
	period: string;
	total_assets: number;
	total_liabilities: number;
	total_equity: number;
	cash_and_equivalents: number;
	total_debt: number;
	[key: string]: unknown;
}

export interface FDCashFlow {
	ticker: string;
	calendar_date: string;
	report_period: string;
	period: string;
	operating_cash_flow: number;
	investing_cash_flow: number;
	financing_cash_flow: number;
	free_cash_flow: number;
	[key: string]: unknown;
}

export interface FDInsiderTrade {
	ticker: string;
	filing_date: string;
	transaction_date: string;
	name: string;
	title: string;
	is_board_director: boolean;
	transaction_shares: number;
	transaction_price_per_share: number;
	transaction_value: number;
	shares_owned_before_transaction: number;
	shares_owned_after_transaction: number;
	security_title: string;
	issuer: string;
	[key: string]: unknown;
}

export interface FDInstitutionalHolding {
	ticker: string;
	investor: string;
	report_period: string;
	price: number;
	shares: number;
	market_value: number;
	[key: string]: unknown;
}

export interface FDEarnings {
	ticker: string;
	calendar_date: string;
	report_period: string;
	period: string;
	eps_estimate: number | null;
	eps_actual: number | null;
	revenue_estimate: number | null;
	revenue_actual: number | null;
	surprise: number | null;
	surprise_pct: number | null;
	[key: string]: unknown;
}

export interface FDListResponse<T> {
	[key: string]: T[] | unknown;
}
