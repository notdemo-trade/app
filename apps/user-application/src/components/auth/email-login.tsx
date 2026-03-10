import type { TurnstileInstance } from '@marsidev/react-turnstile';
import { useForm } from '@tanstack/react-form';
import { useMutation } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { useTranslations } from 'use-intl';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { verifyTurnstile } from '@/core/functions/auth/turnstile';
import { authClient } from '@/lib/auth-client';
import { TurnstileWidget } from './turnstile-widget';

type AuthMode = 'signin' | 'signup';

export function EmailLogin() {
	const t = useTranslations();
	const [mode, setMode] = useState<AuthMode>('signin');
	const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
	const turnstileRef = useRef<TurnstileInstance | null>(null);

	const mutation = useMutation({
		mutationFn: async (data: { email: string; password: string; name?: string }) => {
			if (!turnstileToken) {
				throw new Error(t('turnstile.verificationRequired'));
			}

			await verifyTurnstile({ data: { token: turnstileToken } });

			if (mode === 'signup') {
				const result = await authClient.signUp.email({
					email: data.email,
					password: data.password,
					name: data.name || data.email.split('@')[0] || 'User',
				});
				if (result.error) throw new Error(result.error.message);
				return result;
			}
			const result = await authClient.signIn.email({
				email: data.email,
				password: data.password,
			});
			if (result.error) throw new Error(result.error.message);
			return result;
		},
		onError: () => {
			setTurnstileToken(null);
			turnstileRef.current?.reset();
		},
	});

	const form = useForm({
		defaultValues: { email: '', password: '', name: '' },
		onSubmit: async ({ value }) => {
			mutation.reset();
			await mutation.mutateAsync(value);
		},
	});

	const toggleMode = () => {
		setMode((m) => (m === 'signin' ? 'signup' : 'signin'));
		mutation.reset();
		setTurnstileToken(null);
		turnstileRef.current?.reset();
	};

	return (
		<div className="min-h-screen flex items-center justify-center bg-background p-4">
			<Card className="w-full max-w-md">
				<CardHeader className="text-center">
					<CardTitle className="text-2xl font-bold">
						{mode === 'signin' ? t('emailLogin.welcomeBack') : t('emailLogin.createAccount')}
					</CardTitle>
					<CardDescription>
						{mode === 'signin'
							? t('emailLogin.signInDescription')
							: t('emailLogin.signUpDescription')}
					</CardDescription>
				</CardHeader>
				<CardContent>
					<form
						onSubmit={(e) => {
							e.preventDefault();
							form.handleSubmit();
						}}
						className="space-y-4"
					>
						{mutation.isError && <Alert variant="destructive">{mutation.error.message}</Alert>}

						{mode === 'signup' && (
							<form.Field
								name="name"
								validators={{
									onChange: ({ value }) =>
										mode === 'signup' && !value ? t('emailLogin.nameRequired') : undefined,
								}}
							>
								{(field) => (
									<div className="space-y-1">
										<label htmlFor="name" className="text-sm font-medium text-foreground">
											{t('emailLogin.nameLabel')}
										</label>
										<Input
											id="name"
											type="text"
											placeholder={t('emailLogin.namePlaceholder')}
											value={field.state.value}
											onChange={(e) => field.handleChange(e.target.value)}
											onBlur={field.handleBlur}
										/>
										{field.state.meta.errors.length > 0 && (
											<p className="text-sm text-destructive">{field.state.meta.errors[0]}</p>
										)}
									</div>
								)}
							</form.Field>
						)}

						<form.Field
							name="email"
							validators={{
								onChange: ({ value }) => (!value ? t('emailLogin.emailRequired') : undefined),
							}}
						>
							{(field) => (
								<div className="space-y-1">
									<label htmlFor="email" className="text-sm font-medium text-foreground">
										{t('emailLogin.emailLabel')}
									</label>
									<Input
										id="email"
										type="email"
										placeholder="you@example.com"
										value={field.state.value}
										onChange={(e) => field.handleChange(e.target.value)}
										onBlur={field.handleBlur}
									/>
									{field.state.meta.errors.length > 0 && (
										<p className="text-sm text-destructive">{field.state.meta.errors[0]}</p>
									)}
								</div>
							)}
						</form.Field>

						<form.Field
							name="password"
							validators={{
								onChange: ({ value }) =>
									!value
										? t('emailLogin.passwordRequired')
										: value.length < 8
											? t('emailLogin.minChars')
											: undefined,
							}}
						>
							{(field) => (
								<div className="space-y-1">
									<label htmlFor="password" className="text-sm font-medium text-foreground">
										{t('emailLogin.passwordLabel')}
									</label>
									<Input
										id="password"
										type="password"
										placeholder="••••••••"
										value={field.state.value}
										onChange={(e) => field.handleChange(e.target.value)}
										onBlur={field.handleBlur}
									/>
									{field.state.meta.errors.length > 0 && (
										<p className="text-sm text-destructive">{field.state.meta.errors[0]}</p>
									)}
								</div>
							)}
						</form.Field>

						<TurnstileWidget
							onSuccess={(token) => setTurnstileToken(token)}
							onError={() => setTurnstileToken(null)}
							onExpire={() => setTurnstileToken(null)}
						/>

						<form.Subscribe selector={(s) => s.canSubmit}>
							{(canSubmit) => (
								<Button
									type="submit"
									className="w-full h-12 text-base"
									disabled={!canSubmit || !turnstileToken || mutation.isPending}
								>
									{mutation.isPending
										? t('common.loading')
										: mode === 'signin'
											? t('emailLogin.signIn')
											: t('emailLogin.signUp')}
								</Button>
							)}
						</form.Subscribe>

						<div className="text-center text-sm text-muted-foreground">
							{mode === 'signin' ? (
								<>
									{t('emailLogin.noAccount')}{' '}
									<button type="button" onClick={toggleMode} className="text-primary underline">
										{t('emailLogin.signUpLink')}
									</button>
								</>
							) : (
								<>
									{t('emailLogin.haveAccount')}{' '}
									<button type="button" onClick={toggleMode} className="text-primary underline">
										{t('emailLogin.signInLink')}
									</button>
								</>
							)}
						</div>
					</form>
				</CardContent>
			</Card>
		</div>
	);
}
