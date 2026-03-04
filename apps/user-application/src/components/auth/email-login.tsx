import { useForm } from '@tanstack/react-form';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { authClient } from '@/lib/auth-client';

type AuthMode = 'signin' | 'signup';

export function EmailLogin() {
	const [mode, setMode] = useState<AuthMode>('signin');

	const mutation = useMutation({
		mutationFn: async (data: { email: string; password: string; name?: string }) => {
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
	};

	return (
		<div className="min-h-screen flex items-center justify-center bg-background p-4">
			<Card className="w-full max-w-md">
				<CardHeader className="text-center">
					<CardTitle className="text-2xl font-bold">
						{mode === 'signin' ? 'Welcome back' : 'Create account'}
					</CardTitle>
					<CardDescription>
						{mode === 'signin' ? 'Sign in to your account' : 'Sign up to get started'}
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
										mode === 'signup' && !value ? 'Name required' : undefined,
								}}
							>
								{(field) => (
									<div className="space-y-1">
										<label htmlFor="name" className="text-sm font-medium text-foreground">
											Name
										</label>
										<Input
											id="name"
											type="text"
											placeholder="Your name"
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
								onChange: ({ value }) => (!value ? 'Email required' : undefined),
							}}
						>
							{(field) => (
								<div className="space-y-1">
									<label htmlFor="email" className="text-sm font-medium text-foreground">
										Email
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
									!value ? 'Password required' : value.length < 8 ? 'Min 8 characters' : undefined,
							}}
						>
							{(field) => (
								<div className="space-y-1">
									<label htmlFor="password" className="text-sm font-medium text-foreground">
										Password
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

						<form.Subscribe selector={(s) => s.canSubmit}>
							{(canSubmit) => (
								<Button
									type="submit"
									className="w-full h-12 text-base"
									disabled={!canSubmit || mutation.isPending}
								>
									{mutation.isPending ? 'Loading...' : mode === 'signin' ? 'Sign In' : 'Sign Up'}
								</Button>
							)}
						</form.Subscribe>

						<div className="text-center text-sm text-muted-foreground">
							{mode === 'signin' ? (
								<>
									No account?{' '}
									<button type="button" onClick={toggleMode} className="text-primary underline">
										Sign up
									</button>
								</>
							) : (
								<>
									Already have an account?{' '}
									<button type="button" onClick={toggleMode} className="text-primary underline">
										Sign in
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
