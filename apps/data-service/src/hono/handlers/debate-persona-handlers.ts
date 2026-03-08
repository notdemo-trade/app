import { zValidator } from '@hono/zod-validator';
import {
	CreateDebatePersonaRequestSchema,
	UpdateDebatePersonaRequestSchema,
	UpdateModeratorPromptRequestSchema,
} from '@repo/data-ops/debate-persona';
import { Hono } from 'hono';
import { sessionAuthMiddleware } from '../middleware/session-auth';
import {
	createPersona,
	listPersonas,
	removePersona,
	resetPersonas,
	updateModeratorPrompt,
	updatePersona,
} from '../services/debate-persona-service';
import { resultToResponse } from '../utils/result-to-response';

const debatePersonas = new Hono<{ Bindings: Env; Variables: { userId: string } }>();

debatePersonas.use('*', sessionAuthMiddleware);

// List all personas for the authenticated user
debatePersonas.get('/', async (c) => {
	const userId = c.get('userId');
	const result = await listPersonas(userId);
	return resultToResponse(c, result);
});

// Create a new custom persona
debatePersonas.post('/', zValidator('json', CreateDebatePersonaRequestSchema), async (c) => {
	const userId = c.get('userId');
	const data = c.req.valid('json');
	const result = await createPersona(userId, data);
	return resultToResponse(c, result, 201);
});

// Reset all personas to defaults
debatePersonas.post('/reset', async (c) => {
	const userId = c.get('userId');
	const result = await resetPersonas(userId);
	return resultToResponse(c, result);
});

// Update moderator prompt
debatePersonas.patch(
	'/moderator-prompt',
	zValidator('json', UpdateModeratorPromptRequestSchema),
	async (c) => {
		const userId = c.get('userId');
		const { moderatorPrompt } = c.req.valid('json');
		const result = await updateModeratorPrompt(userId, moderatorPrompt);
		return resultToResponse(c, result);
	},
);

// Update an existing persona
debatePersonas.put('/:id', zValidator('json', UpdateDebatePersonaRequestSchema), async (c) => {
	const userId = c.get('userId');
	const personaId = c.req.param('id');
	const data = c.req.valid('json');
	const result = await updatePersona(userId, personaId, data);
	return resultToResponse(c, result);
});

// Delete a custom persona
debatePersonas.delete('/:id', async (c) => {
	const userId = c.get('userId');
	const personaId = c.req.param('id');
	const result = await removePersona(userId, personaId);
	return resultToResponse(c, result);
});

export default debatePersonas;
