import {
	CreateDebatePersonaRequestSchema,
	countUserPersonas,
	createDebatePersona,
	type DebatePersona,
	type DebatePersonaListResponse,
	deleteDebatePersona,
	deleteUserCustomPersonas,
	getDebatePersonaById,
	getDebatePersonaByName,
	getDebatePersonas,
	seedDefaultPersonas,
	UpdateDebatePersonaRequestSchema,
	UpdateModeratorPromptRequestSchema,
	updateDebatePersona,
} from '@repo/data-ops/debate-persona';
import { getTradingConfig, upsertTradingConfig } from '@repo/data-ops/trading-config';
import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { protectedFunctionMiddleware } from '@/core/middleware/auth';

const MAX_PERSONAS = 5;
const MIN_ACTIVE_PERSONAS = 2;

export const getDebatePersonaList = createServerFn({ method: 'GET' })
	.middleware([protectedFunctionMiddleware])
	.handler(async ({ context }): Promise<DebatePersonaListResponse> => {
		let personas = await getDebatePersonas(context.userId);

		if (personas.length === 0) {
			personas = await seedDefaultPersonas(context.userId);
		}

		const tradingConfig = await getTradingConfig(context.userId);
		const moderatorPrompt = tradingConfig?.moderatorPrompt ?? null;

		return { personas, moderatorPrompt };
	});

export const createDebatePersonaFn = createServerFn({ method: 'POST' })
	.middleware([protectedFunctionMiddleware])
	.inputValidator(CreateDebatePersonaRequestSchema)
	.handler(async ({ data, context }): Promise<DebatePersona> => {
		const currentCount = await countUserPersonas(context.userId);
		if (currentCount >= MAX_PERSONAS) {
			throw new Error(
				`Maximum of ${MAX_PERSONAS} personas allowed. Delete a custom persona first.`,
			);
		}

		const existing = await getDebatePersonaByName(context.userId, data.name);
		if (existing) {
			throw new Error(`A persona with name '${data.name}' already exists.`);
		}

		const personas = await getDebatePersonas(context.userId);
		if (personas.length === 0) {
			await seedDefaultPersonas(context.userId);
		}

		const nextSortOrder = Math.max(0, ...personas.map((p) => p.sortOrder)) + 1;

		return createDebatePersona(context.userId, {
			...data,
			isDefault: false,
			sortOrder: nextSortOrder,
		});
	});

export const updateDebatePersonaFn = createServerFn({ method: 'POST' })
	.middleware([protectedFunctionMiddleware])
	.inputValidator(z.object({ id: z.string().uuid() }).merge(UpdateDebatePersonaRequestSchema))
	.handler(async ({ data, context }): Promise<DebatePersona> => {
		const { id, ...updates } = data;

		const existing = await getDebatePersonaById(context.userId, id);
		if (!existing) {
			throw new Error('Persona not found.');
		}

		if (updates.isActive === false && existing.isActive) {
			const allPersonas = await getDebatePersonas(context.userId);
			const activeCount = allPersonas.filter((p) => p.isActive).length;
			if (activeCount <= MIN_ACTIVE_PERSONAS) {
				throw new Error(`At least ${MIN_ACTIVE_PERSONAS} personas must remain active for debates.`);
			}
		}

		const updated = await updateDebatePersona(context.userId, id, updates);
		if (!updated) {
			throw new Error('Failed to update persona.');
		}

		return updated;
	});

export const deleteDebatePersonaFn = createServerFn({ method: 'POST' })
	.middleware([protectedFunctionMiddleware])
	.inputValidator(z.object({ id: z.string().uuid() }))
	.handler(async ({ data, context }): Promise<{ deleted: true }> => {
		const existing = await getDebatePersonaById(context.userId, data.id);
		if (!existing) {
			throw new Error('Persona not found.');
		}

		if (existing.isDefault) {
			throw new Error('Default personas cannot be deleted. You can disable them instead.');
		}

		if (existing.isActive) {
			const allPersonas = await getDebatePersonas(context.userId);
			const activeCount = allPersonas.filter((p) => p.isActive).length;
			if (activeCount <= MIN_ACTIVE_PERSONAS) {
				throw new Error(
					`At least ${MIN_ACTIVE_PERSONAS} active personas are required. Enable another persona before deleting this one.`,
				);
			}
		}

		await deleteDebatePersona(context.userId, data.id);
		return { deleted: true };
	});

export const resetDebatePersonasFn = createServerFn({ method: 'POST' })
	.middleware([protectedFunctionMiddleware])
	.handler(async ({ context }): Promise<DebatePersonaListResponse> => {
		await deleteUserCustomPersonas(context.userId);

		const existing = await getDebatePersonas(context.userId);
		for (const persona of existing) {
			if (persona.isDefault) {
				await deleteDebatePersona(context.userId, persona.id);
			}
		}

		const personas = await seedDefaultPersonas(context.userId);
		await upsertTradingConfig(context.userId, { moderatorPrompt: null });

		return { personas, moderatorPrompt: null };
	});

export const updateModeratorPromptFn = createServerFn({ method: 'POST' })
	.middleware([protectedFunctionMiddleware])
	.inputValidator(UpdateModeratorPromptRequestSchema)
	.handler(async ({ data, context }): Promise<{ moderatorPrompt: string | null }> => {
		await upsertTradingConfig(context.userId, { moderatorPrompt: data.moderatorPrompt });
		return { moderatorPrompt: data.moderatorPrompt };
	});
