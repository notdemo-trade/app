import type { CredentialInfo, CredentialProvider } from '@repo/data-ops/credential';
import { useForm } from '@tanstack/react-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { ArrowLeft, Eye, EyeOff, Key, Shield, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslations } from 'use-intl';
import { Alert, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
	deleteUserCredential,
	listUserCredentials,
	saveUserCredential,
} from '@/core/functions/credentials/direct';

export const Route = createFileRoute('/_auth/settings/credentials')({
	component: CredentialsPage,
});

const CREDENTIALS_QUERY_KEY = ['credentials'] as const;

interface LLMProviderInfo {
	id: CredentialProvider;
	name: string;
	models: string[];
}

const LLM_PROVIDERS: LLMProviderInfo[] = [
	{ id: 'openai', name: 'OpenAI', models: ['gpt-4o-mini', 'gpt-4o', 'o1', 'o1-mini'] },
	{
		id: 'anthropic',
		name: 'Anthropic',
		models: [
			'claude-3-7-sonnet-latest',
			'claude-sonnet-4-0',
			'claude-opus-4-1',
			'claude-3-5-haiku-latest',
		],
	},
	{
		id: 'google',
		name: 'Google',
		models: ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-3-pro-preview'],
	},
	{ id: 'xai', name: 'xAI (Grok)', models: ['grok-4', 'grok-3', 'grok-4-fast-reasoning'] },
	{ id: 'deepseek', name: 'DeepSeek', models: ['deepseek-chat', 'deepseek-reasoner'] },
];

function CredentialsPage() {
	const t = useTranslations();
	const credentialsQuery = useQuery({
		queryKey: CREDENTIALS_QUERY_KEY,
		queryFn: () => listUserCredentials(),
	});

	const alpacaCred = credentialsQuery.data?.find((c) => c.provider === 'alpaca');

	return (
		<div className="max-w-2xl mx-auto space-y-8">
			<div>
				<Link
					to="/dashboard"
					className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4"
				>
					<ArrowLeft className="h-4 w-4" />
					{t('common.backToDashboard')}
				</Link>
				<h1 className="text-2xl font-bold text-foreground">{t('credentials.title')}</h1>
				<p className="text-muted-foreground text-sm mt-1">{t('credentials.description')}</p>
			</div>

			<section className="space-y-4">
				<div>
					<h2 className="text-lg font-semibold text-foreground">{t('credentials.alpaca.title')}</h2>
					<p className="text-muted-foreground text-sm">{t('credentials.alpaca.description')}</p>
				</div>
				<AlpacaCredentialForm existing={alpacaCred} />
			</section>

			<section className="space-y-4">
				<div>
					<h2 className="text-lg font-semibold text-foreground">
						{t('credentials.llmProviders.title')}
					</h2>
					<p className="text-muted-foreground text-sm">
						{t('credentials.llmProviders.description')}
					</p>
				</div>
				<div className="space-y-4">
					{LLM_PROVIDERS.map((provider) => (
						<LLMCredentialCard
							key={provider.id}
							provider={provider}
							existing={credentialsQuery.data?.find((c) => c.provider === provider.id)}
						/>
					))}
				</div>
			</section>
		</div>
	);
}

interface AlpacaCredentialFormProps {
	existing?: CredentialInfo;
}

function AlpacaCredentialForm({ existing }: AlpacaCredentialFormProps) {
	const t = useTranslations();
	const [isEditing, setIsEditing] = useState(false);
	const [showSecret, setShowSecret] = useState(false);
	const queryClient = useQueryClient();

	const saveMutation = useMutation({
		mutationFn: (value: { apiKey: string; apiSecret: string; paper: boolean }) =>
			saveUserCredential({
				data: { provider: 'alpaca', data: value, validate: true },
			}),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: CREDENTIALS_QUERY_KEY });
			setIsEditing(false);
		},
	});

	const deleteMutation = useMutation({
		mutationFn: () => deleteUserCredential({ data: { provider: 'alpaca' } }),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: CREDENTIALS_QUERY_KEY });
		},
	});

	const [deleteOpen, setDeleteOpen] = useState(false);

	const form = useForm({
		defaultValues: { apiKey: '', apiSecret: '', paper: true },
		onSubmit: async ({ value }) => {
			saveMutation.reset();
			saveMutation.mutate(value);
		},
	});

	return (
		<Card>
			<CardContent className="pt-6">
				{existing && !isEditing ? (
					<div className="space-y-3">
						<div className="flex items-center gap-2">
							<Badge variant={existing.validationError ? 'destructive' : 'success'}>
								{existing.validationError
									? t('credentials.badge.invalid')
									: t('credentials.badge.connected')}
							</Badge>
							{existing.paperMode !== null && (
								<Badge variant="outline">
									{existing.paperMode ? t('credentials.badge.paper') : t('credentials.badge.live')}
								</Badge>
							)}
						</div>
						{existing.lastValidatedAt && (
							<p className="text-xs text-muted-foreground">
								{t('credentials.verified', {
									date: new Date(existing.lastValidatedAt).toLocaleDateString(),
								})}
							</p>
						)}
						{existing.validationError && (
							<p className="text-xs text-destructive">{existing.validationError}</p>
						)}
						<div className="flex gap-2">
							<Button variant="outline" size="sm" onClick={() => setIsEditing(true)}>
								{t('credentials.updateCredentials')}
							</Button>
							<Button variant="destructive" size="sm" onClick={() => setDeleteOpen(true)}>
								<Trash2 className="h-4 w-4 mr-1" />
								{t('common.remove')}
							</Button>
						</div>
					</div>
				) : (
					<div>
						{saveMutation.isError && (
							<Alert variant="destructive" className="mb-4">
								<AlertTitle>{saveMutation.error.message}</AlertTitle>
							</Alert>
						)}

						{saveMutation.isSuccess &&
							saveMutation.data &&
							'success' in saveMutation.data &&
							saveMutation.data.success && (
								<Alert variant="success" className="mb-4">
									<AlertTitle>{t('credentials.savedSuccess')}</AlertTitle>
								</Alert>
							)}

						<form
							onSubmit={(e) => {
								e.preventDefault();
								form.handleSubmit();
							}}
						>
							<div className="space-y-4">
								<form.Field name="apiKey">
									{(field) => (
										<div className="space-y-2">
											<Label htmlFor="alpaca-key">{t('credentials.apiKey')}</Label>
											<Input
												id="alpaca-key"
												type="text"
												placeholder={t('credentials.placeholderKey')}
												value={field.state.value}
												onChange={(e) => field.handleChange(e.target.value)}
												onBlur={field.handleBlur}
											/>
										</div>
									)}
								</form.Field>

								<form.Field name="apiSecret">
									{(field) => (
										<div className="space-y-2">
											<Label htmlFor="alpaca-secret">{t('credentials.apiSecret')}</Label>
											<div className="relative">
												<Input
													id="alpaca-secret"
													type={showSecret ? 'text' : 'password'}
													placeholder={t('credentials.placeholderSecret')}
													value={field.state.value}
													onChange={(e) => field.handleChange(e.target.value)}
													onBlur={field.handleBlur}
												/>
												<Button
													type="button"
													variant="ghost"
													size="sm"
													className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0"
													onClick={() => setShowSecret(!showSecret)}
												>
													{showSecret ? (
														<EyeOff className="h-4 w-4" />
													) : (
														<Eye className="h-4 w-4" />
													)}
												</Button>
											</div>
										</div>
									)}
								</form.Field>

								<form.Field name="paper">
									{(field) => (
										<div className="flex items-center gap-2">
											<Switch
												id="alpaca-paper"
												checked={field.state.value}
												onCheckedChange={field.handleChange}
											/>
											<Label htmlFor="alpaca-paper">{t('credentials.paperTrading')}</Label>
										</div>
									)}
								</form.Field>
							</div>

							<div className="flex gap-2 mt-6">
								<form.Subscribe selector={(s) => s.canSubmit}>
									{(canSubmit) => (
										<Button type="submit" disabled={!canSubmit || saveMutation.isPending}>
											<Shield className="h-4 w-4 mr-1" />
											{saveMutation.isPending
												? t('credentials.validating')
												: t('credentials.saveValidate')}
										</Button>
									)}
								</form.Subscribe>
								{isEditing && (
									<Button type="button" variant="outline" onClick={() => setIsEditing(false)}>
										{t('common.cancel')}
									</Button>
								)}
							</div>
						</form>
					</div>
				)}
			</CardContent>

			<Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>{t('credentials.removeAlpaca.title')}</DialogTitle>
						<DialogDescription>{t('credentials.removeAlpaca.description')}</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button variant="outline" onClick={() => setDeleteOpen(false)}>
							{t('common.cancel')}
						</Button>
						<Button
							variant="destructive"
							disabled={deleteMutation.isPending}
							onClick={() => {
								deleteMutation.mutate(undefined, {
									onSuccess: () => setDeleteOpen(false),
								});
							}}
						>
							{deleteMutation.isPending ? t('common.removing') : t('common.remove')}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</Card>
	);
}

interface LLMCredentialCardProps {
	provider: LLMProviderInfo;
	existing?: CredentialInfo;
}

function LLMCredentialCard({ provider, existing }: LLMCredentialCardProps) {
	const t = useTranslations();
	const [isEditing, setIsEditing] = useState(false);
	const [showKey, setShowKey] = useState(false);
	const queryClient = useQueryClient();

	const saveMutation = useMutation({
		mutationFn: (value: { apiKey: string }) =>
			saveUserCredential({
				data: { provider: provider.id, data: value, validate: true },
			}),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: CREDENTIALS_QUERY_KEY });
			setIsEditing(false);
		},
	});

	const deleteMutation = useMutation({
		mutationFn: () => deleteUserCredential({ data: { provider: provider.id } }),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: CREDENTIALS_QUERY_KEY });
		},
	});

	const [deleteOpen, setDeleteOpen] = useState(false);

	const form = useForm({
		defaultValues: { apiKey: '' },
		onSubmit: async ({ value }) => {
			saveMutation.reset();
			saveMutation.mutate(value);
		},
	});

	return (
		<Card>
			<CardHeader className="pb-3">
				<div className="flex items-center justify-between">
					<div>
						<CardTitle className="text-base flex items-center gap-2">
							<Key className="h-4 w-4" />
							{provider.name}
						</CardTitle>
						<CardDescription className="text-xs">
							{t('credentials.models', { models: provider.models.join(', ') })}
						</CardDescription>
					</div>
					{existing && (
						<Badge variant={existing.validationError ? 'destructive' : 'success'}>
							{existing.validationError
								? t('credentials.badge.invalid')
								: t('credentials.badge.connected')}
						</Badge>
					)}
				</div>
			</CardHeader>
			<CardContent>
				{existing && !isEditing ? (
					<div className="space-y-3">
						{existing.validationError && (
							<p className="text-xs text-destructive">{existing.validationError}</p>
						)}
						{existing.lastValidatedAt && (
							<p className="text-xs text-muted-foreground">
								{t('credentials.verified', {
									date: new Date(existing.lastValidatedAt).toLocaleDateString(),
								})}
							</p>
						)}
						<div className="flex gap-2">
							<Button variant="outline" size="sm" onClick={() => setIsEditing(true)}>
								{t('credentials.updateKey')}
							</Button>
							<Button variant="destructive" size="sm" onClick={() => setDeleteOpen(true)}>
								<Trash2 className="h-4 w-4 mr-1" />
								{t('common.remove')}
							</Button>
						</div>
					</div>
				) : (
					<div>
						{saveMutation.isError && (
							<Alert variant="destructive" className="mb-3">
								<AlertTitle>{saveMutation.error.message}</AlertTitle>
							</Alert>
						)}
						<form
							onSubmit={(e) => {
								e.preventDefault();
								form.handleSubmit();
							}}
						>
							<form.Field name="apiKey">
								{(field) => (
									<div className="space-y-2">
										<Label htmlFor={`${provider.id}-key`}>{t('credentials.apiKey')}</Label>
										<div className="relative">
											<Input
												id={`${provider.id}-key`}
												type={showKey ? 'text' : 'password'}
												placeholder={t('credentials.placeholderApiKey')}
												value={field.state.value}
												onChange={(e) => field.handleChange(e.target.value)}
												onBlur={field.handleBlur}
											/>
											<Button
												type="button"
												variant="ghost"
												size="sm"
												className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0"
												onClick={() => setShowKey(!showKey)}
											>
												{showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
											</Button>
										</div>
									</div>
								)}
							</form.Field>
							<div className="flex gap-2 mt-4">
								<form.Subscribe selector={(s) => s.canSubmit}>
									{(canSubmit) => (
										<Button type="submit" size="sm" disabled={!canSubmit || saveMutation.isPending}>
											{saveMutation.isPending
												? t('credentials.validating')
												: t('credentials.saveValidate')}
										</Button>
									)}
								</form.Subscribe>
								{isEditing && (
									<Button
										type="button"
										variant="outline"
										size="sm"
										onClick={() => setIsEditing(false)}
									>
										{t('common.cancel')}
									</Button>
								)}
							</div>
						</form>
					</div>
				)}
			</CardContent>

			<Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>
							{t('credentials.removeLlm.title', { provider: provider.name })}
						</DialogTitle>
						<DialogDescription>
							{t('credentials.removeLlm.description', { provider: provider.name })}
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button variant="outline" onClick={() => setDeleteOpen(false)}>
							{t('common.cancel')}
						</Button>
						<Button
							variant="destructive"
							disabled={deleteMutation.isPending}
							onClick={() => {
								deleteMutation.mutate(undefined, {
									onSuccess: () => setDeleteOpen(false),
								});
							}}
						>
							{deleteMutation.isPending ? t('common.removing') : t('common.remove')}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</Card>
	);
}
