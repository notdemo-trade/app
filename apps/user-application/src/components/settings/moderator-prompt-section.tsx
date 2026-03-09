import { useState } from 'react';
import { useTranslations } from 'use-intl';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

const DEFAULT_MODERATOR_PROMPT_PREVIEW =
	'You are a neutral market analysis moderator. Synthesize the analyses and debate from multiple market perspectives into a single consensus recommendation...';

interface ModeratorPromptSectionProps {
	currentPrompt: string | null;
	onUpdate: (prompt: string | null) => void;
	isUpdating: boolean;
}

export function ModeratorPromptSection({
	currentPrompt,
	onUpdate,
	isUpdating,
}: ModeratorPromptSectionProps) {
	const t = useTranslations();
	const [value, setValue] = useState(currentPrompt ?? '');
	const isCustom = currentPrompt !== null;

	return (
		<Card>
			<Collapsible>
				<CardHeader>
					<CollapsibleTrigger className="flex items-center gap-2 w-full text-left">
						<CardTitle className="text-base">{t('moderator.title')}</CardTitle>
						{isCustom && (
							<span className="text-xs bg-blue-500/10 text-blue-500 px-2 py-0.5 rounded">
								{t('moderator.custom')}
							</span>
						)}
					</CollapsibleTrigger>
					<CardDescription>{t('moderator.description')}</CardDescription>
				</CardHeader>
				<CollapsibleContent>
					<CardContent className="space-y-4">
						<textarea
							value={value}
							onChange={(e) => setValue(e.target.value)}
							placeholder={DEFAULT_MODERATOR_PROMPT_PREVIEW}
							rows={6}
							maxLength={2000}
							className="w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-sm text-foreground ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
						/>
						<div className="flex gap-2">
							<Button size="sm" disabled={isUpdating} onClick={() => onUpdate(value || null)}>
								{isUpdating ? t('common.saving') : t('moderator.savePrompt')}
							</Button>
							{isCustom && (
								<Button
									variant="outline"
									size="sm"
									onClick={() => {
										setValue('');
										onUpdate(null);
									}}
								>
									{t('moderator.resetToDefault')}
								</Button>
							)}
						</div>
					</CardContent>
				</CollapsibleContent>
			</Collapsible>
		</Card>
	);
}
