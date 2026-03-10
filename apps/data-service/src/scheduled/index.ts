import { getAgentByName } from 'agents';
import type { DataSchedulerAgent } from '../agents/data-scheduler-agent';

export async function handleScheduled(
	_controller: ScheduledController,
	env: Env,
	_ctx: ExecutionContext,
) {
	// Ensure the global DataSchedulerAgent is running
	const scheduler = await getAgentByName<DataSchedulerAgent>(env.DataSchedulerAgent, 'global');
	await scheduler.startScheduling();
}
