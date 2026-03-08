import {
	type CreateDebatePersonaRequest,
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
	type UpdateDebatePersonaRequest,
	updateDebatePersona as updateDebatePersonaQuery,
} from '@repo/data-ops/debate-persona';
import { getTradingConfig, upsertTradingConfig } from '@repo/data-ops/trading-config';
import type { Result } from '../types/result';
import { AppError, err, ok } from '../types/result';

const MAX_PERSONAS = 5;
const MIN_ACTIVE_PERSONAS = 2;

export async function listPersonas(userId: string): Promise<Result<DebatePersonaListResponse>> {
	let personas = await getDebatePersonas(userId);

	// Lazy seeding: if user has no personas, create defaults
	if (personas.length === 0) {
		personas = await seedDefaultPersonas(userId);
	}

	const tradingConfig = await getTradingConfig(userId);
	const moderatorPrompt = tradingConfig?.moderatorPrompt ?? null;

	return ok({ personas, moderatorPrompt });
}

export async function createPersona(
	userId: string,
	data: CreateDebatePersonaRequest,
): Promise<Result<DebatePersona>> {
	// Enforce max persona count
	const currentCount = await countUserPersonas(userId);
	if (currentCount >= MAX_PERSONAS) {
		return err(
			new AppError(
				`Maximum of ${MAX_PERSONAS} personas allowed. Delete a custom persona first.`,
				400,
				'MAX_PERSONAS_EXCEEDED',
			),
		);
	}

	// Enforce unique name per user
	const existing = await getDebatePersonaByName(userId, data.name);
	if (existing) {
		return err(
			new AppError(
				`A persona with name '${data.name}' already exists.`,
				409,
				'PERSONA_NAME_CONFLICT',
			),
		);
	}

	// Ensure defaults are seeded before adding custom persona
	const personas = await getDebatePersonas(userId);
	if (personas.length === 0) {
		await seedDefaultPersonas(userId);
	}

	const nextSortOrder = Math.max(0, ...personas.map((p) => p.sortOrder)) + 1;

	const persona = await createDebatePersona(userId, {
		...data,
		isDefault: false,
		sortOrder: nextSortOrder,
	});

	return ok(persona);
}

export async function updatePersona(
	userId: string,
	personaId: string,
	data: UpdateDebatePersonaRequest,
): Promise<Result<DebatePersona>> {
	const existing = await getDebatePersonaById(userId, personaId);
	if (!existing) {
		return err(new AppError('Persona not found.', 404, 'PERSONA_NOT_FOUND'));
	}

	// Prevent disabling too many personas
	if (data.isActive === false && existing.isActive) {
		const allPersonas = await getDebatePersonas(userId);
		const activeCount = allPersonas.filter((p) => p.isActive).length;
		if (activeCount <= MIN_ACTIVE_PERSONAS) {
			return err(
				new AppError(
					`At least ${MIN_ACTIVE_PERSONAS} personas must remain active for debates.`,
					400,
					'MIN_ACTIVE_PERSONAS',
				),
			);
		}
	}

	const updated = await updateDebatePersonaQuery(userId, personaId, data);
	if (!updated) {
		return err(new AppError('Failed to update persona.', 500, 'UPDATE_FAILED'));
	}

	return ok(updated);
}

export async function removePersona(
	userId: string,
	personaId: string,
): Promise<Result<{ deleted: true }>> {
	const existing = await getDebatePersonaById(userId, personaId);
	if (!existing) {
		return err(new AppError('Persona not found.', 404, 'PERSONA_NOT_FOUND'));
	}

	// Cannot delete default personas
	if (existing.isDefault) {
		return err(
			new AppError(
				'Default personas cannot be deleted. You can disable them instead.',
				400,
				'CANNOT_DELETE_DEFAULT',
			),
		);
	}

	// Prevent deleting if it would leave fewer than MIN_ACTIVE active personas
	if (existing.isActive) {
		const allPersonas = await getDebatePersonas(userId);
		const activeCount = allPersonas.filter((p) => p.isActive).length;
		if (activeCount <= MIN_ACTIVE_PERSONAS) {
			return err(
				new AppError(
					`At least ${MIN_ACTIVE_PERSONAS} active personas are required. Enable another persona before deleting this one.`,
					400,
					'MIN_ACTIVE_PERSONAS',
				),
			);
		}
	}

	await deleteDebatePersona(userId, personaId);
	return ok({ deleted: true });
}

export async function resetPersonas(userId: string): Promise<Result<DebatePersonaListResponse>> {
	// Delete all custom personas
	await deleteUserCustomPersonas(userId);

	// Delete all existing defaults (to reset their prompts/settings)
	const existing = await getDebatePersonas(userId);
	for (const persona of existing) {
		if (persona.isDefault) {
			await deleteDebatePersona(userId, persona.id);
		}
	}

	// Re-seed defaults
	const personas = await seedDefaultPersonas(userId);

	// Reset moderator prompt to default (set to NULL)
	await upsertTradingConfig(userId, { moderatorPrompt: null });

	return ok({ personas, moderatorPrompt: null });
}

export async function updateModeratorPrompt(
	userId: string,
	moderatorPrompt: string | null,
): Promise<Result<{ moderatorPrompt: string | null }>> {
	await upsertTradingConfig(userId, { moderatorPrompt });
	return ok({ moderatorPrompt });
}
