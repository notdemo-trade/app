import { z } from 'zod';

export const OrderRequestSchema = z
	.object({
		symbol: z.string(),
		side: z.enum(['buy', 'sell']),
		type: z.enum(['market', 'limit', 'stop', 'stop_limit']),
		qty: z.number().optional(),
		notional: z.number().optional(),
		limitPrice: z.number().optional(),
		stopPrice: z.number().optional(),
		timeInForce: z.enum(['day', 'gtc', 'ioc', 'foc']).default('day'),
	})
	.refine((data) => data.qty !== undefined || data.notional !== undefined, {
		message: 'Either qty or notional must be provided',
	});

export type OrderRequestInput = z.infer<typeof OrderRequestSchema>;
