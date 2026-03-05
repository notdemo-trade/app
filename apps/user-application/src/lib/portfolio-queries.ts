import { queryOptions, useQuery } from '@tanstack/react-query';
import {
	getAccount,
	getClock,
	getOrders,
	getPortfolioHistory,
	getPositions,
} from '@/core/functions/portfolio/direct';

const PORTFOLIO_REFETCH = {
	staleTime: 30_000,
	refetchInterval: 30_000,
	refetchIntervalInBackground: false,
	refetchOnWindowFocus: true,
} as const;

export const accountQueryOptions = () =>
	queryOptions({
		queryKey: ['account'],
		queryFn: () => getAccount(),
		...PORTFOLIO_REFETCH,
	});

export const positionsQueryOptions = () =>
	queryOptions({
		queryKey: ['positions'],
		queryFn: () => getPositions(),
		...PORTFOLIO_REFETCH,
	});

export const ordersQueryOptions = (params?: {
	status?: 'open' | 'closed' | 'all';
	limit?: number;
}) =>
	queryOptions({
		queryKey: ['orders', params],
		queryFn: () => getOrders({ data: params ?? {} }),
		...PORTFOLIO_REFETCH,
	});

export const clockQueryOptions = () =>
	queryOptions({
		queryKey: ['clock'],
		queryFn: () => getClock(),
		staleTime: 60_000,
		refetchInterval: 60_000,
		refetchIntervalInBackground: false,
		refetchOnWindowFocus: true,
	});

export const portfolioHistoryQueryOptions = (params?: {
	period?: '1D' | '1W' | '1M' | '3M' | '1A' | 'all';
	timeframe?: '1Min' | '5Min' | '15Min' | '1H' | '1D';
}) =>
	queryOptions({
		queryKey: ['portfolio-history', params],
		queryFn: () => getPortfolioHistory({ data: params ?? {} }),
		staleTime: 60_000,
		refetchInterval: 60_000,
		refetchIntervalInBackground: false,
		refetchOnWindowFocus: true,
	});

export const useAccount = () => useQuery(accountQueryOptions());
export const usePositions = () => useQuery(positionsQueryOptions());
export const useOrders = (params?: { status?: 'open' | 'closed' | 'all'; limit?: number }) =>
	useQuery(ordersQueryOptions(params));
export const useClock = () => useQuery(clockQueryOptions());
export const usePortfolioHistory = (params?: {
	period?: '1D' | '1W' | '1M' | '3M' | '1A' | 'all';
	timeframe?: '1Min' | '5Min' | '15Min' | '1H' | '1D';
}) => useQuery(portfolioHistoryQueryOptions(params));
