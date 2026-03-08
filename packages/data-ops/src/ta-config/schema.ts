import { z } from 'zod';

const periodArray = z.array(z.number().int().min(5).max(500)).min(1).max(10);

/**
 * Full configuration schema with validation ranges.
 * Used for PUT /api/technical-config requests.
 */
/**
 * Base object schema without cross-field refinements.
 * Use this for .partial() and .extend() since Zod v4 disallows those on refined schemas.
 */
const TechnicalAnalysisConfigBaseSchema = z.object({
	profileName: z.string().min(1).max(50).default('custom'),

	// Indicator periods
	smaPeriods: periodArray.default([20, 50, 200]),
	emaPeriods: periodArray.default([12, 26]),
	rsiPeriod: z.number().int().min(5).max(50).default(14),
	bollingerPeriod: z.number().int().min(10).max(50).default(20),
	bollingerStdDev: z.number().min(1.0).max(3.0).default(2.0),
	atrPeriod: z.number().int().min(5).max(50).default(14),
	volumeSmaPeriod: z.number().int().min(5).max(50).default(20),
	macdSignalPeriod: z.number().int().min(5).max(20).default(9),

	// Signal thresholds
	rsiOversold: z.number().int().min(10).max(40).default(30),
	rsiOverbought: z.number().int().min(60).max(90).default(70),
	volumeSpikeMultiplier: z.number().min(1.2).max(5.0).default(2.0),

	// Analysis settings
	minBarsRequired: z.number().int().min(20).max(200).default(50),
	defaultBarsToFetch: z.number().int().min(100).max(500).default(250),
	cacheFreshnessSec: z.number().int().min(10).max(300).default(60),
});

/**
 * Full configuration schema with cross-field validation.
 * Used for PUT /api/technical-config requests.
 */
export const TechnicalAnalysisConfigSchema = TechnicalAnalysisConfigBaseSchema.refine(
	(data) => data.rsiOversold < data.rsiOverbought,
	{
		message: 'rsiOversold must be less than rsiOverbought',
		path: ['rsiOversold'],
	},
)
	.refine((data) => data.minBarsRequired <= data.defaultBarsToFetch, {
		message: 'minBarsRequired must not exceed defaultBarsToFetch',
		path: ['minBarsRequired'],
	})
	.refine(
		(data) => {
			const maxSmaPeriod = Math.max(...data.smaPeriods);
			return data.defaultBarsToFetch >= maxSmaPeriod;
		},
		{ message: 'defaultBarsToFetch must be >= largest SMA period', path: ['defaultBarsToFetch'] },
	);

export type TechnicalAnalysisConfig = z.infer<typeof TechnicalAnalysisConfigBaseSchema>;

/**
 * Partial update schema — allows updating individual fields.
 */
export const TechnicalAnalysisConfigUpdateSchema = TechnicalAnalysisConfigBaseSchema.partial();

export type TechnicalAnalysisConfigUpdate = z.infer<typeof TechnicalAnalysisConfigUpdateSchema>;

/**
 * Response schema — includes server-generated fields.
 */
export const TechnicalAnalysisConfigResponseSchema = TechnicalAnalysisConfigBaseSchema.extend({
	id: z.string().uuid(),
	userId: z.string(),
	createdAt: z.string().datetime(),
	updatedAt: z.string().datetime(),
});

export type TechnicalAnalysisConfigResponse = z.infer<typeof TechnicalAnalysisConfigResponseSchema>;

/**
 * Preset name enum for the apply-preset endpoint.
 */
export const PresetNameSchema = z.enum([
	'default',
	'day-trader',
	'swing-trader',
	'position-trader',
]);

export type PresetName = z.infer<typeof PresetNameSchema>;

/**
 * Param schema for the apply-preset endpoint (wraps PresetNameSchema in an object).
 */
export const PresetNameParamSchema = z.object({ name: PresetNameSchema });
