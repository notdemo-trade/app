import type {
	CreateDebatePersonaRequest,
	UpdateDebatePersonaRequest,
} from '@repo/data-ops/debate-persona';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { ArrowLeft, Plus } from 'lucide-react';
import { useState } from 'react';
import { useTranslations } from 'use-intl';
import { AddPersonaDialog } from '@/components/settings/add-persona-dialog';
import { ModeratorPromptSection } from '@/components/settings/moderator-prompt-section';
import { PersonaCard } from '@/components/settings/persona-card';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog';
import {
	createDebatePersonaFn,
	deleteDebatePersonaFn,
	getDebatePersonaList,
	resetDebatePersonasFn,
	updateDebatePersonaFn,
	updateModeratorPromptFn,
} from '@/core/functions/debate-persona/direct';

export const Route = createFileRoute('/_auth/settings/debate')({
	component: DebateSettingsPage,
});

const DEBATE_PERSONAS_QUERY_KEY = ['debate-personas'] as const;

function DebateSettingsPage() {
	const t = useTranslations();
	const queryClient = useQueryClient();
	const [showAddDialog, setShowAddDialog] = useState(false);
	const [showResetConfirm, setShowResetConfirm] = useState(false);
	const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

	const personasQuery = useQuery({
		queryKey: DEBATE_PERSONAS_QUERY_KEY,
		queryFn: () => getDebatePersonaList(),
	});

	const invalidate = () => queryClient.invalidateQueries({ queryKey: DEBATE_PERSONAS_QUERY_KEY });

	const createMutation = useMutation({
		mutationFn: (data: CreateDebatePersonaRequest) => createDebatePersonaFn({ data }),
		onSuccess: () => {
			invalidate();
			setShowAddDialog(false);
		},
	});

	const updateMutation = useMutation({
		mutationFn: (vars: { id: string } & UpdateDebatePersonaRequest) =>
			updateDebatePersonaFn({ data: vars }),
		onSuccess: () => invalidate(),
	});

	const deleteMutation = useMutation({
		mutationFn: (id: string) => deleteDebatePersonaFn({ data: { id } }),
		onSuccess: () => {
			invalidate();
			setDeleteTarget(null);
		},
	});

	const resetMutation = useMutation({
		mutationFn: () => resetDebatePersonasFn(),
		onSuccess: () => {
			invalidate();
			setShowResetConfirm(false);
		},
	});

	const moderatorMutation = useMutation({
		mutationFn: (prompt: string | null) =>
			updateModeratorPromptFn({ data: { moderatorPrompt: prompt } }),
		onSuccess: () => invalidate(),
	});

	if (personasQuery.isLoading) {
		return (
			<div className="max-w-2xl mx-auto flex items-center justify-center py-12">
				<div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
			</div>
		);
	}

	if (personasQuery.isError) {
		return (
			<div className="max-w-2xl mx-auto py-12">
				<Alert variant="destructive">{t('debatePage.failedToLoad')}</Alert>
			</div>
		);
	}

	const personas = personasQuery.data?.personas ?? [];
	const activeCount = personas.filter((p) => p.isActive).length;

	const handleUpdate = (id: string, data: UpdateDebatePersonaRequest) => {
		updateMutation.reset();
		updateMutation.mutate({ id, ...data });
	};

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
				<h1 className="text-2xl font-bold text-foreground">{t('debatePage.title')}</h1>
				<p className="text-muted-foreground text-sm mt-1">{t('debatePage.description')}</p>
			</div>

			{updateMutation.isError && (
				<Alert variant="destructive">{updateMutation.error.message}</Alert>
			)}
			{createMutation.isError && (
				<Alert variant="destructive">{createMutation.error.message}</Alert>
			)}
			{deleteMutation.isError && (
				<Alert variant="destructive">{deleteMutation.error.message}</Alert>
			)}

			<div className="space-y-4">
				{personas.map((persona) => (
					<PersonaCard
						key={persona.id}
						persona={persona}
						onUpdate={handleUpdate}
						onDelete={(id) => setDeleteTarget(id)}
						isUpdating={updateMutation.isPending}
						activeCount={activeCount}
					/>
				))}
			</div>

			<Button
				variant="outline"
				onClick={() => setShowAddDialog(true)}
				disabled={personas.length >= 5}
				className="w-full text-foreground"
			>
				<Plus className="h-4 w-4 mr-2" />
				{personas.length >= 5 ? t('debatePage.maxPersonasReached') : t('debatePage.addPersona')}
			</Button>

			<ModeratorPromptSection
				currentPrompt={personasQuery.data?.moderatorPrompt ?? null}
				onUpdate={(prompt) => {
					moderatorMutation.reset();
					moderatorMutation.mutate(prompt);
				}}
				isUpdating={moderatorMutation.isPending}
			/>

			<div className="border-t border-border pt-6">
				<div className="flex items-center justify-between">
					<div>
						<h3 className="text-sm font-medium text-foreground">
							{t('debatePage.resetToDefaults')}
						</h3>
						<p className="text-xs text-muted-foreground mt-1">{t('debatePage.resetDescription')}</p>
					</div>
					<Button
						variant="outline"
						size="sm"
						className="text-destructive"
						onClick={() => setShowResetConfirm(true)}
					>
						{t('debatePage.resetAll')}
					</Button>
				</div>
			</div>

			{/* Add Persona Dialog */}
			<AddPersonaDialog
				open={showAddDialog}
				onOpenChange={setShowAddDialog}
				onSubmit={(data) => {
					createMutation.reset();
					createMutation.mutate(data);
				}}
				isSubmitting={createMutation.isPending}
			/>

			{/* Delete Confirmation Dialog */}
			<Dialog open={deleteTarget !== null} onOpenChange={() => setDeleteTarget(null)}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>{t('debatePage.deletePersona.title')}</DialogTitle>
						<DialogDescription>{t('debatePage.deletePersona.description')}</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<DialogClose asChild>
							<Button variant="outline">{t('common.cancel')}</Button>
						</DialogClose>
						<Button
							variant="destructive"
							disabled={deleteMutation.isPending}
							onClick={() => {
								if (deleteTarget) {
									deleteMutation.reset();
									deleteMutation.mutate(deleteTarget);
								}
							}}
						>
							{deleteMutation.isPending ? t('common.deleting') : t('common.delete')}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* Reset Confirmation Dialog */}
			<Dialog open={showResetConfirm} onOpenChange={setShowResetConfirm}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>{t('debatePage.resetConfirm.title')}</DialogTitle>
						<DialogDescription>{t('debatePage.resetConfirm.description')}</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<DialogClose asChild>
							<Button variant="outline">{t('common.cancel')}</Button>
						</DialogClose>
						<Button
							variant="destructive"
							disabled={resetMutation.isPending}
							onClick={() => {
								resetMutation.reset();
								resetMutation.mutate();
							}}
						>
							{resetMutation.isPending
								? t('debatePage.resetting')
								: t('debatePage.resetToDefaults')}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}
