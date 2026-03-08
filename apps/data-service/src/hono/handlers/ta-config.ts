import { zValidator } from '@hono/zod-validator';
import { PresetNameParamSchema, TechnicalAnalysisConfigSchema } from '@repo/data-ops/ta-config';
import { Hono } from 'hono';
import { sessionAuthMiddleware } from '../middleware/session-auth';
import {
	applyPresetService,
	getTaConfigService,
	resetTaConfigService,
	updateTaConfigService,
} from '../services/ta-config';
import { resultToResponse } from '../utils/result-to-response';

export const taConfigRoutes = new Hono<{ Bindings: Env }>();

taConfigRoutes.use('*', sessionAuthMiddleware);

/**
 * GET /api/technical-config
 * Returns user's config or defaults if no custom config exists.
 */
taConfigRoutes.get('/', async (c) => {
	const userId = c.get('userId');
	const result = await getTaConfigService(userId);
	return resultToResponse(c, result);
});

/**
 * PUT /api/technical-config
 * Full update of user's config. Validates all fields.
 */
taConfigRoutes.put('/', zValidator('json', TechnicalAnalysisConfigSchema), async (c) => {
	const userId = c.get('userId');
	const config = c.req.valid('json');
	const result = await updateTaConfigService(userId, config);
	return resultToResponse(c, result);
});

/**
 * POST /api/technical-config/preset/:name
 * Apply a preset profile. Overwrites all fields with preset values.
 */
taConfigRoutes.post('/preset/:name', zValidator('param', PresetNameParamSchema), async (c) => {
	const userId = c.get('userId');
	const { name } = c.req.valid('param');
	const result = await applyPresetService(userId, name);
	return resultToResponse(c, result);
});

/**
 * POST /api/technical-config/reset
 * Delete user's config row, reverting to defaults.
 */
taConfigRoutes.post('/reset', async (c) => {
	const userId = c.get('userId');
	const result = await resetTaConfigService(userId);
	return resultToResponse(c, result);
});
