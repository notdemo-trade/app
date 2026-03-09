import type { ResetResult } from '@repo/data-ops/agents/session/types';
import { AlertTriangle, Loader2, Trash2 } from 'lucide-react';
import { useCallback, useState } from 'react';
import { useTranslations } from 'use-intl';
import { Button } from '@/components/ui/button';
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from '@/components/ui/dialog';
import type { useSession } from '@/lib/session-connection';

interface SessionResetDialogProps {
	session: ReturnType<typeof useSession>;
}

export function SessionResetDialog({ session }: SessionResetDialogProps) {
	const t = useTranslations('sessionSettings.resetData');
	const [open, setOpen] = useState(false);
	const [resetting, setResetting] = useState(false);
	const [result, setResult] = useState<ResetResult | null>(null);

	const isRunning = session.state?.enabled ?? false;

	const handleReset = useCallback(async () => {
		setResetting(true);
		setResult(null);
		try {
			const res = await session.resetData();
			setResult(res);
			if (res.status === 'success') {
				session.clearMessages();
				setTimeout(() => setOpen(false), 1500);
			}
		} catch {
			setResult({
				status: 'error',
				message: t('error'),
				cleared: { threads: 0, messages: 0, proposals: 0, outcomes: 0, snapshots: 0 },
			});
		} finally {
			setResetting(false);
		}
	}, [session.resetData, session.clearMessages, t]);

	const clearList = t('clearList').split(', ');
	const preserveList = t('preserveList').split(', ');

	return (
		<Dialog
			open={open}
			onOpenChange={(v) => {
				setOpen(v);
				if (!v) setResult(null);
			}}
		>
			<DialogTrigger asChild>
				<Button variant="destructive" size="sm" disabled={isRunning}>
					<Trash2 className="size-4" />
					{t('button')}
				</Button>
			</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<AlertTriangle className="size-5 text-destructive" />
						{t('title')}
					</DialogTitle>
					<DialogDescription>{t('description')}</DialogDescription>
				</DialogHeader>

				<div className="space-y-3 text-sm">
					<div>
						<p className="font-medium text-destructive">{t('willClear')}</p>
						<ul className="mt-1 list-inside list-disc space-y-0.5 text-muted-foreground">
							{clearList.map((item) => (
								<li key={item}>{item}</li>
							))}
						</ul>
					</div>
					<div>
						<p className="font-medium text-foreground">{t('willPreserve')}</p>
						<ul className="mt-1 list-inside list-disc space-y-0.5 text-muted-foreground">
							{preserveList.map((item) => (
								<li key={item}>{item}</li>
							))}
						</ul>
					</div>
				</div>

				{result && (
					<p
						className={`text-sm ${result.status === 'success' ? 'text-green-600 dark:text-green-400' : 'text-destructive'}`}
					>
						{result.message}
					</p>
				)}

				<DialogFooter>
					<DialogClose asChild>
						<Button variant="outline" disabled={resetting}>
							{t('cancel')}
						</Button>
					</DialogClose>
					<Button variant="destructive" onClick={handleReset} disabled={resetting}>
						{resetting && <Loader2 className="size-4 animate-spin" />}
						{t('confirm')}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
