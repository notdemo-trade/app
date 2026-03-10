import { INVITE_CODE_REGEX } from '@repo/data-ops/invite-code';
import { useForm } from '@tanstack/react-form';
import { useMutation } from '@tanstack/react-query';
import { useTranslations } from 'use-intl';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { activateAccount } from '@/core/functions/auth/activate';
import { authClient } from '@/lib/auth-client';

interface ActivationFormProps {
	userId: string;
}

const ERROR_MESSAGE_MAP: Record<string, string> = {
	ALREADY_USED: 'activation.alreadyUsed',
	INVALID_CODE: 'activation.invalidCode',
};

export function ActivationForm({ userId }: ActivationFormProps) {
	const t = useTranslations();

	const mutation = useMutation({
		mutationFn: async (data: { code: string }) => {
			return activateAccount({ data: { code: data.code.toUpperCase(), userId } });
		},
		onSuccess: () => {
			window.location.reload();
		},
	});

	const form = useForm({
		defaultValues: { code: '' },
		onSubmit: async ({ value }) => {
			mutation.reset();
			await mutation.mutateAsync(value);
		},
	});

	const getErrorMessage = (error: Error): string => {
		const mapped = ERROR_MESSAGE_MAP[error.message];
		if (mapped) return t(mapped);
		return error.message;
	};

	return (
		<div className="min-h-screen flex items-center justify-center bg-background p-4">
			<Card className="w-full max-w-md">
				<CardHeader className="text-center">
					<CardTitle className="text-2xl font-bold">{t('activation.title')}</CardTitle>
					<CardDescription>{t('activation.description')}</CardDescription>
				</CardHeader>
				<CardContent>
					<form
						onSubmit={(e) => {
							e.preventDefault();
							form.handleSubmit();
						}}
						className="space-y-4"
					>
						{mutation.isError && (
							<Alert variant="destructive">{getErrorMessage(mutation.error)}</Alert>
						)}

						<form.Field
							name="code"
							validators={{
								onChange: ({ value }) => {
									if (!value) return t('activation.codeRequired');
									const upper = value.toUpperCase();
									if (!INVITE_CODE_REGEX.test(upper)) return t('activation.invalidFormat');
									return undefined;
								},
							}}
						>
							{(field) => (
								<div className="space-y-1">
									<label htmlFor="code" className="text-sm font-medium text-foreground">
										{t('activation.codeLabel')}
									</label>
									<Input
										id="code"
										type="text"
										placeholder={t('activation.codePlaceholder')}
										value={field.state.value}
										onChange={(e) => field.handleChange(e.target.value.toUpperCase())}
										onBlur={field.handleBlur}
										className="font-mono text-center text-lg tracking-wider"
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
									{mutation.isPending ? t('common.loading') : t('activation.activate')}
								</Button>
							)}
						</form.Subscribe>

						<div className="text-center">
							<button
								type="button"
								onClick={() => authClient.signOut()}
								className="text-sm text-muted-foreground hover:text-foreground underline"
							>
								{t('auth.signout')}
							</button>
						</div>
					</form>
				</CardContent>
			</Card>
		</div>
	);
}
