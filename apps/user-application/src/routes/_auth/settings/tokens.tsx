import type { TokenResponse, TokenType } from '@repo/data-ops/api-token';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { ArrowLeft, Copy, Key, RefreshCw, Trash2 } from 'lucide-react';
import { z } from 'zod';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
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
import { createToken, listTokens, revokeToken } from '@/core/functions/tokens/direct';

const searchSchema = z.object({
	revoke: z.enum(['access', 'kill_switch']).optional(),
});

export const Route = createFileRoute('/_auth/settings/tokens')({
	component: TokensPage,
	validateSearch: searchSchema,
});

const TOKEN_QUERY_KEY = ['tokens'] as const;

function TokensPage() {
	const queryClient = useQueryClient();
	const navigate = Route.useNavigate();
	const { revoke } = Route.useSearch();

	const tokensQuery = useQuery({
		queryKey: TOKEN_QUERY_KEY,
		queryFn: () => listTokens(),
	});

	const generateMutation = useMutation({
		mutationFn: (type: TokenType) => createToken({ data: { type } }),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: TOKEN_QUERY_KEY });
		},
	});

	const revokeMutation = useMutation({
		mutationFn: (type: TokenType) => revokeToken({ data: { type } }),
		onSuccess: () => {
			navigate({ search: { revoke: undefined } });
			queryClient.invalidateQueries({ queryKey: TOKEN_QUERY_KEY });
		},
	});

	const handleCopy = async (token: string) => {
		await navigator.clipboard.writeText(token);
	};

	const newToken = generateMutation.data?.token;
	const accessToken = tokensQuery.data?.find((t: TokenResponse) => t.type === 'access');
	const killSwitchToken = tokensQuery.data?.find((t: TokenResponse) => t.type === 'kill_switch');

	return (
		<div className="max-w-2xl mx-auto space-y-8">
			<div>
				<Link
					to="/dashboard"
					className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4"
				>
					<ArrowLeft className="h-4 w-4" />
					Back to Dashboard
				</Link>
				<h1 className="text-2xl font-bold text-foreground">API Tokens</h1>
				<p className="text-muted-foreground text-sm mt-1">
					Manage access tokens for API integrations and emergency controls.
				</p>
			</div>
			<p className="text-muted-foreground mb-6">
				Manage bearer tokens for API and Telegram access. Tokens are shown once on creation.
			</p>

			{generateMutation.isError && (
				<Alert variant="destructive" className="mb-4">
					{generateMutation.error.message}
				</Alert>
			)}

			{newToken && (
				<Alert variant="success" className="mb-4">
					<Key className="h-4 w-4" />
					<AlertTitle>Token created — copy it now</AlertTitle>
					<AlertDescription>
						<p className="text-muted-foreground mb-2">
							This is the only time you'll see the full token.
						</p>
						<div className="flex items-center gap-2">
							<code className="flex-1 rounded bg-muted px-3 py-2 font-mono text-sm text-foreground break-all select-all">
								{newToken}
							</code>
							<Button
								variant="outline"
								size="sm"
								onClick={() => handleCopy(newToken)}
								className="shrink-0"
							>
								<Copy className="h-4 w-4 mr-1" />
								Copy
							</Button>
						</div>
					</AlertDescription>
				</Alert>
			)}

			<div className="space-y-4">
				<TokenCard
					title="Access Token"
					description="General API access for trading, data queries, and Telegram bot"
					token={accessToken}
					onGenerate={() => {
						generateMutation.reset();
						generateMutation.mutate('access');
					}}
					onRevoke={() => navigate({ search: { revoke: 'access' } })}
					isPending={generateMutation.isPending}
				/>

				<TokenCard
					title="Kill Switch Token"
					description="Emergency token to halt all trading activity"
					token={killSwitchToken}
					onGenerate={() => {
						generateMutation.reset();
						generateMutation.mutate('kill_switch');
					}}
					onRevoke={() => navigate({ search: { revoke: 'kill_switch' } })}
					isPending={generateMutation.isPending}
				/>
			</div>

			<Dialog
				open={!!revoke}
				onOpenChange={(open) => {
					if (!open) navigate({ search: { revoke: undefined } });
				}}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Revoke token?</DialogTitle>
						<DialogDescription>
							This will immediately invalidate the{' '}
							{revoke === 'kill_switch' ? 'kill switch' : 'access'} token. Any integrations using it
							will stop working.
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button variant="outline" onClick={() => navigate({ search: { revoke: undefined } })}>
							Cancel
						</Button>
						<Button
							variant="destructive"
							disabled={revokeMutation.isPending}
							onClick={() => revoke && revokeMutation.mutate(revoke)}
						>
							{revokeMutation.isPending ? 'Revoking...' : 'Revoke'}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}

interface TokenCardProps {
	title: string;
	description: string;
	token?: TokenResponse;
	onGenerate: () => void;
	onRevoke: () => void;
	isPending: boolean;
}

function TokenCard({ title, description, token, onGenerate, onRevoke, isPending }: TokenCardProps) {
	return (
		<Card>
			<CardHeader>
				<div className="flex items-center justify-between">
					<div>
						<CardTitle className="flex items-center gap-2">
							<Key className="h-4 w-4" />
							{title}
						</CardTitle>
						<CardDescription>{description}</CardDescription>
					</div>
					{token && <Badge variant="secondary">Active</Badge>}
				</div>
			</CardHeader>
			<CardContent>
				{token ? (
					<div className="space-y-3">
						<div className="flex items-center gap-4 text-sm">
							<div>
								<span className="text-muted-foreground">Prefix: </span>
								<code className="text-foreground">{token.tokenPrefix}...</code>
							</div>
							<div>
								<span className="text-muted-foreground">Expires: </span>
								<span className="text-foreground">
									{new Date(token.expiresAt).toLocaleDateString()}
								</span>
							</div>
							{token.lastUsedAt && (
								<div>
									<span className="text-muted-foreground">Last used: </span>
									<span className="text-foreground">
										{new Date(token.lastUsedAt).toLocaleDateString()}
									</span>
								</div>
							)}
						</div>
						<div className="flex gap-2">
							<Button variant="outline" size="sm" onClick={onGenerate} disabled={isPending}>
								<RefreshCw className="h-4 w-4 mr-1" />
								Regenerate
							</Button>
							<Button variant="destructive" size="sm" onClick={onRevoke}>
								<Trash2 className="h-4 w-4 mr-1" />
								Revoke
							</Button>
						</div>
					</div>
				) : (
					<Button onClick={onGenerate} disabled={isPending}>
						<Key className="h-4 w-4 mr-1" />
						{isPending ? 'Generating...' : 'Generate Token'}
					</Button>
				)}
			</CardContent>
		</Card>
	);
}
