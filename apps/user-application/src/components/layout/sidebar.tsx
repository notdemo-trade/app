import { useNavigate, useRouterState } from '@tanstack/react-router';
import {
	Bot,
	BrainCircuit,
	Coins,
	Home,
	KeyRound,
	LineChart,
	Menu,
	MessageSquare,
	Shield,
	TrendingUp,
	User,
} from 'lucide-react';
import { useState } from 'react';
import { useTranslations } from 'use-intl';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

interface NavigationItem {
	nameKey: string;
	icon: React.ComponentType<{ className?: string }>;
	href: string;
	badge?: string | number;
}

interface NavigationGroup {
	labelKey?: string;
	items: NavigationItem[];
}

const navigationGroups: NavigationGroup[] = [
	{
		items: [
			{
				nameKey: 'sidebar.dashboard',
				icon: Home,
				href: '/dashboard',
			},
			{
				nameKey: 'sidebar.session',
				icon: Bot,
				href: '/session',
			},
			{
				nameKey: 'sidebar.performance',
				icon: TrendingUp,
				href: '/performance',
			},
		],
	},
	{
		labelKey: 'sidebar.strategyGroup',
		items: [
			{
				nameKey: 'sidebar.trading',
				icon: Coins,
				href: '/settings/trading',
			},
			{
				nameKey: 'sidebar.models',
				icon: BrainCircuit,
				href: '/settings/models',
			},
			{
				nameKey: 'sidebar.technicalAnalysis',
				icon: LineChart,
				href: '/settings/technical-analysis',
			},
			{
				nameKey: 'sidebar.debate',
				icon: MessageSquare,
				href: '/settings/debate',
			},
		],
	},
	{
		labelKey: 'sidebar.accountGroup',
		items: [
			{
				nameKey: 'sidebar.credentials',
				icon: KeyRound,
				href: '/settings/credentials',
			},
			{
				nameKey: 'sidebar.tokens',
				icon: Shield,
				href: '/settings/tokens',
			},
			{
				nameKey: 'sidebar.profile',
				icon: User,
				href: '/profile',
			},
		],
	},
];

interface SidebarProps {
	className?: string;
}

export function Sidebar({ className }: SidebarProps) {
	const navigate = useNavigate();
	const routerState = useRouterState();
	const currentPath = routerState.location.pathname;
	const [isCollapsed, setIsCollapsed] = useState(false);
	const t = useTranslations();

	return (
		<>
			{/* Desktop Sidebar */}
			<div
				className={cn(
					'hidden lg:flex lg:flex-col lg:border-r lg:border-border lg:bg-background',
					isCollapsed ? 'lg:w-16' : 'lg:w-64',
					'transition-all duration-300 ease-in-out',
					className,
				)}
			>
				<div className="flex h-16 items-center justify-between px-6 border-b border-border">
					{!isCollapsed && (
						<h1 className="text-xl font-semibold tracking-tight text-foreground">notdemo.trade</h1>
					)}
					<Button
						variant="ghost"
						size="icon"
						onClick={() => setIsCollapsed(!isCollapsed)}
						className="h-8 w-8"
					>
						<Menu className="h-4 w-4 text-foreground" />
					</Button>
				</div>

				<ScrollArea className="flex-1 px-3 py-4">
					<nav className="space-y-6">
						{navigationGroups.map((group) => (
							<div key={group.labelKey ?? 'main'} className="space-y-1">
								{group.labelKey && !isCollapsed && (
									<p className="px-3 pb-1 text-xs font-medium uppercase tracking-wider text-muted-foreground/70">
										{t(group.labelKey)}
									</p>
								)}
								{group.items.map((item) => {
									const isActive =
										currentPath === item.href ||
										(item.href.startsWith('/session') && currentPath.startsWith('/session')) ||
										(item.href.startsWith('/performance') &&
											currentPath.startsWith('/performance'));

									return (
										<Button
											key={item.nameKey}
											variant={isActive ? 'default' : 'ghost'}
											className={cn(
												'w-full justify-start gap-3 h-10',
												isCollapsed && 'px-2 justify-center',
												isActive && 'bg-primary text-primary-foreground shadow-sm',
												!isActive && 'text-muted-foreground hover:text-foreground hover:bg-accent',
											)}
											onClick={() => navigate({ to: item.href })}
										>
											<item.icon className="h-4 w-4 flex-shrink-0" />
											{!isCollapsed && (
												<>
													<span className="truncate">{t(item.nameKey)}</span>
													{item.badge && (
														<span className="ml-auto flex h-5 w-5 items-center justify-center rounded-full bg-primary text-xs font-medium text-primary-foreground">
															{item.badge}
														</span>
													)}
												</>
											)}
										</Button>
									);
								})}
							</div>
						))}
					</nav>
				</ScrollArea>
			</div>

			{/* Mobile Sidebar Overlay */}
			<div className="lg:hidden">
				{/* Mobile implementation can be added here with a sheet/drawer */}
			</div>
		</>
	);
}
