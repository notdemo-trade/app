import type {
	DebatePersona,
	PersonaBias,
	UpdateDebatePersonaRequest,
} from '@repo/data-ops/debate-persona';
import { useForm } from '@tanstack/react-form';
import { ChevronRight, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslations } from 'use-intl';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';

const BIAS_STYLES: Record<PersonaBias, string> = {
	bullish: 'text-green-500',
	bearish: 'text-red-500',
	neutral: 'text-muted-foreground',
};

interface PersonaCardProps {
	persona: DebatePersona;
	onUpdate: (id: string, data: UpdateDebatePersonaRequest) => void;
	onDelete: (id: string) => void;
	isUpdating: boolean;
	activeCount: number;
}

export function PersonaCard({
	persona,
	onUpdate,
	onDelete,
	isUpdating,
	activeCount,
}: PersonaCardProps) {
	const t = useTranslations();
	const [isPromptExpanded, setIsPromptExpanded] = useState(false);

	const form = useForm({
		defaultValues: {
			displayName: persona.displayName,
			role: persona.role,
			systemPrompt: persona.systemPrompt,
			bias: persona.bias as PersonaBias,
		},
		onSubmit: async ({ value }) => {
			onUpdate(persona.id, value);
		},
	});

	const canDisable = persona.isActive && activeCount > 2;

	return (
		<Card>
			<CardHeader className="flex flex-row items-center justify-between">
				<div className="flex items-center gap-3">
					{persona.isDefault ? (
						<CardTitle className="text-base">{persona.displayName}</CardTitle>
					) : (
						<form.Field name="displayName">
							{(field) => (
								<Input
									value={field.state.value}
									onChange={(e) => field.handleChange(e.target.value)}
									className="text-base font-semibold h-8 w-48"
								/>
							)}
						</form.Field>
					)}
					<form.Field name="bias">
						{(field) => (
							<Select
								value={field.state.value}
								onChange={(e) => field.handleChange(e.target.value as PersonaBias)}
								className={cn('h-7 w-24 text-xs', BIAS_STYLES[field.state.value])}
							>
								<option value="bullish">{t('persona.bullish')}</option>
								<option value="bearish">{t('persona.bearish')}</option>
								<option value="neutral">{t('persona.neutral')}</option>
							</Select>
						)}
					</form.Field>
				</div>
				<Switch
					checked={persona.isActive}
					disabled={!canDisable && persona.isActive}
					onCheckedChange={(checked) => onUpdate(persona.id, { isActive: checked })}
				/>
			</CardHeader>

			<CardContent className="space-y-4">
				<form.Field name="role">
					{(field) => (
						<div className="space-y-1">
							<Label className="text-xs text-muted-foreground">{t('persona.role')}</Label>
							<Input
								value={field.state.value}
								onChange={(e) => field.handleChange(e.target.value)}
								className="text-sm h-8"
							/>
						</div>
					)}
				</form.Field>

				<Collapsible open={isPromptExpanded} onOpenChange={setIsPromptExpanded}>
					<CollapsibleTrigger className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
						<ChevronRight
							className={cn('h-4 w-4 transition-transform', isPromptExpanded && 'rotate-90')}
						/>
						{t('persona.systemPrompt')}
						<span className="text-xs">({persona.systemPrompt.length}/2000)</span>
					</CollapsibleTrigger>
					<CollapsibleContent className="mt-2">
						<form.Field name="systemPrompt">
							{(field) => (
								<textarea
									value={field.state.value}
									onChange={(e) => field.handleChange(e.target.value)}
									rows={8}
									maxLength={2000}
									className="w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-sm text-foreground ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
								/>
							)}
						</form.Field>
					</CollapsibleContent>
				</Collapsible>

				<div className="flex justify-between items-center pt-2">
					<form.Subscribe selector={(s) => s.isDirty}>
						{(isDirty) =>
							isDirty ? (
								<Button
									type="button"
									size="sm"
									disabled={isUpdating}
									onClick={() => form.handleSubmit()}
								>
									{isUpdating ? t('common.saving') : t('common.saveChanges')}
								</Button>
							) : (
								<div />
							)
						}
					</form.Subscribe>

					{!persona.isDefault && (
						<Button
							variant="ghost"
							size="sm"
							className="text-destructive hover:text-destructive"
							onClick={() => onDelete(persona.id)}
						>
							<Trash2 className="h-4 w-4 mr-1" />
							{t('common.delete')}
						</Button>
					)}
				</div>
			</CardContent>
		</Card>
	);
}
