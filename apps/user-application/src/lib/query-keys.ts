import { queryOptions } from '@tanstack/react-query';

type PaginationParams = { limit: number; offset: number };
type DataPattern = 'direct' | 'binding' | 'api';

export function createEntityQueryKeys<TEntity extends string>(entity: TEntity) {
	return {
		all: [entity] as const,
		lists: () => [entity, 'list'] as const,
		list: (params: PaginationParams, pattern: DataPattern) =>
			[entity, 'list', params, pattern] as const,
		details: () => [entity, 'detail'] as const,
		detail: (id: string, pattern: DataPattern) => [entity, 'detail', id, pattern] as const,
	};
}

export function createEntityQueryOptions<T>(
	key: readonly unknown[],
	queryFn: () => Promise<T>,
	opts?: { staleTime?: number; placeholderData?: (prev: T | undefined) => T | undefined },
) {
	return queryOptions({
		queryKey: key,
		queryFn,
		...opts,
	});
}

export const taConfigKeys = {
	all: ['ta-config'] as const,
	detail: () => ['ta-config', 'detail'] as const,
};
