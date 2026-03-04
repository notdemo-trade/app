import { Hono } from 'hono';
import { apiTokenMiddleware } from '../middleware/auth';
import { getStatus } from '../services/status-service';
import { resultToResponse } from '../utils/result-to-response';

const status = new Hono<{ Bindings: Env }>();

status.get('/', apiTokenMiddleware, async (c) => {
	const userId = c.get('userId');
	const result = await getStatus(userId);
	return resultToResponse(c, result);
});

export default status;
