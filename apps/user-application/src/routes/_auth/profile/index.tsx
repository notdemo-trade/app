import { createFileRoute, Link } from '@tanstack/react-router';
import { ArrowLeft } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { authClient } from '@/lib/auth-client';

export const Route = createFileRoute('/_auth/profile/')({
	component: ProfilePage,
});

function ProfilePage() {
	const { data: session } = authClient.useSession();
	const user = session?.user;

	if (!user) return null;

	const fallbackText = user.name
		? user.name.charAt(0).toUpperCase()
		: user.email?.charAt(0).toUpperCase() || 'U';

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
				<h1 className="text-2xl font-bold text-foreground">Profile</h1>
			</div>
			<Card>
				<CardHeader>
					<CardTitle>Account Details</CardTitle>
				</CardHeader>
				<CardContent className="flex flex-col items-center gap-6 sm:flex-row sm:items-start">
					<Avatar className="h-20 w-20">
						<AvatarImage src={user.image || undefined} alt={user.name || 'User'} />
						<AvatarFallback className="text-2xl font-semibold">{fallbackText}</AvatarFallback>
					</Avatar>
					<div className="space-y-3 text-center sm:text-left">
						<div>
							<p className="text-sm text-muted-foreground">Name</p>
							<p className="text-lg font-medium text-foreground">{user.name || '—'}</p>
						</div>
						<div>
							<p className="text-sm text-muted-foreground">Email</p>
							<p className="text-lg font-medium text-foreground">{user.email}</p>
						</div>
					</div>
				</CardContent>
			</Card>
		</div>
	);
}
