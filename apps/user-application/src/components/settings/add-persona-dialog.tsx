import type { CreateDebatePersonaRequest, PersonaBias } from '@repo/data-ops/debate-persona';
import { useForm } from '@tanstack/react-form';
import { useTranslations } from 'use-intl';
import { Button } from '@/components/ui/button';
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
import { Select } from '@/components/ui/select';

interface AddPersonaDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onSubmit: (data: CreateDebatePersonaRequest) => void;
	isSubmitting: boolean;
}

export function AddPersonaDialog({
	open,
	onOpenChange,
	onSubmit,
	isSubmitting,
}: AddPersonaDialogProps) {
	const t = useTranslations();
	const form = useForm({
		defaultValues: {
			name: '',
			displayName: '',
			role: '',
			systemPrompt: '',
			bias: 'neutral' as PersonaBias,
		},
		onSubmit: async ({ value }) => {
			onSubmit(value);
		},
	});

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>{t('addPersonaDialog.title')}</DialogTitle>
					<DialogDescription>{t('addPersonaDialog.description')}</DialogDescription>
				</DialogHeader>

				<form
					onSubmit={(e) => {
						e.preventDefault();
						form.handleSubmit();
					}}
					className="space-y-4"
				>
					<form.Field name="name">
						{(field) => (
							<div className="space-y-1">
								<Label>{t('addPersonaDialog.identifier')}</Label>
								<Input
									placeholder={t('addPersonaDialog.identifierPlaceholder')}
									value={field.state.value}
									onChange={(e) => field.handleChange(e.target.value)}
								/>
								<p className="text-xs text-muted-foreground">
									{t('addPersonaDialog.identifierHint')}
								</p>
							</div>
						)}
					</form.Field>

					<form.Field name="displayName">
						{(field) => (
							<div className="space-y-1">
								<Label>{t('addPersonaDialog.displayName')}</Label>
								<Input
									placeholder={t('addPersonaDialog.displayNamePlaceholder')}
									value={field.state.value}
									onChange={(e) => field.handleChange(e.target.value)}
								/>
							</div>
						)}
					</form.Field>

					<form.Field name="role">
						{(field) => (
							<div className="space-y-1">
								<Label>{t('addPersonaDialog.role')}</Label>
								<Input
									placeholder={t('addPersonaDialog.rolePlaceholder')}
									value={field.state.value}
									onChange={(e) => field.handleChange(e.target.value)}
								/>
							</div>
						)}
					</form.Field>

					<form.Field name="bias">
						{(field) => (
							<div className="space-y-1">
								<Label>{t('addPersonaDialog.bias')}</Label>
								<Select
									value={field.state.value}
									onChange={(e) => field.handleChange(e.target.value as PersonaBias)}
								>
									<option value="bullish">{t('persona.bullish')}</option>
									<option value="bearish">{t('persona.bearish')}</option>
									<option value="neutral">{t('persona.neutral')}</option>
								</Select>
							</div>
						)}
					</form.Field>

					<form.Field name="systemPrompt">
						{(field) => (
							<div className="space-y-1">
								<Label>{t('addPersonaDialog.systemPrompt')}</Label>
								<textarea
									value={field.state.value}
									onChange={(e) => field.handleChange(e.target.value)}
									placeholder={t('addPersonaDialog.systemPromptPlaceholder')}
									rows={6}
									maxLength={2000}
									className="w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-sm text-foreground ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
								/>
								<p className="text-xs text-muted-foreground text-right">
									{field.state.value.length}/2000
								</p>
							</div>
						)}
					</form.Field>

					<DialogFooter>
						<Button type="submit" disabled={isSubmitting}>
							{isSubmitting ? t('addPersonaDialog.creating') : t('addPersonaDialog.createPersona')}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
