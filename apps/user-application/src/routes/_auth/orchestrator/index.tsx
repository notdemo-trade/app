import { createFileRoute } from '@tanstack/react-router';
import {
	ActivityLog,
	ConfigForm,
	EntitlementManager,
	OrchestratorStatusCard,
	RecommendationsList,
} from '@/components/orchestrator';
import { authClient } from '@/lib/auth-client';

export const Route = createFileRoute('/_auth/orchestrator/')({
	component: OrchestratorPage,
});

function OrchestratorPage() {
	const { data: session } = authClient.useSession();
	const userId = session?.user?.id;

	if (!userId) return null;

	return (
		<div className="space-y-6">
			<h1 className="text-2xl font-bold text-foreground">AI Orchestrator</h1>
			<p className="text-muted-foreground text-sm">
				Manage your AI trading agents, view recommendations, and configure analysis parameters.
			</p>

			<div className="grid gap-6 lg:grid-cols-2">
				<OrchestratorStatusCard userId={userId} />
				<EntitlementManager userId={userId} />
			</div>

			<RecommendationsList userId={userId} />

			<div className="grid gap-6 lg:grid-cols-2">
				<ConfigForm userId={userId} />
				<ActivityLog userId={userId} />
			</div>
		</div>
	);
}
