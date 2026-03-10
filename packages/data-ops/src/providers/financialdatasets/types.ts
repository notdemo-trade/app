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
	trade_date: string;
	owner_name: string;
	owner_title: string;
	transaction_type: string;
	shares_traded: number;
	price_per_share: number;
	total_value: number;
	[key: string]: unknown;
}

export interface FDInstitutionalHolding {
	ticker: string;
	filing_date: string;
	investor_name: string;
	shares: number;
	value: number;
	change_in_shares: number;
	change_in_shares_pct: number;
	[key: string]: unknown;
}

export interface FDPriceTarget {
	ticker: string;
	published_date: string;
	analyst_company: string;
	analyst_name: string;
	price_target: number;
	rating: string;
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
