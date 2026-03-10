import { type BetterAuthOptions, betterAuth } from 'better-auth';

export const createBetterAuth = (config: {
	database: BetterAuthOptions['database'];
	baseURL?: BetterAuthOptions['baseURL'];
	secret?: BetterAuthOptions['secret'];
	socialProviders?: BetterAuthOptions['socialProviders'];
}): ReturnType<typeof betterAuth> => {
	return betterAuth({
		database: config.database,
		baseURL: config.baseURL,
		secret: config.secret,
		emailAndPassword: {
			enabled: true,
			requireEmailVerification: false,
		},
		socialProviders: config.socialProviders,
		user: {
			modelName: 'auth_user',
			additionalFields: {
				activated: {
					type: 'boolean',
					required: true,
					defaultValue: false,
					input: false,
				},
			},
		},
		session: {
			modelName: 'auth_session',
		},
		verification: {
			modelName: 'auth_verification',
		},
		account: {
			modelName: 'auth_account',
		},
	});
};
