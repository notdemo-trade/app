import { Menu, Search } from 'lucide-react';
import { useState } from 'react';
import { useTranslations } from 'use-intl';
import { AccountDialog } from '@/components/auth/account-dialog';
import { LanguageToggle } from '@/components/i18n/language-toggle';
import { ThemeToggle } from '@/components/theme/theme-toggle';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { authClient } from '@/lib/auth-client';
import { cn } from '@/lib/utils';

interface HeaderProps {
	className?: string;
	onMobileMenuToggle?: () => void;
}

export function Header({ className, onMobileMenuToggle }: HeaderProps) {
	const [searchQuery, setSearchQuery] = useState('');
	const { data: session } = authClient.useSession();
	const t = useTranslations();

	const user = session?.user;
	const fallbackText = user?.name
		? user.name.charAt(0).toUpperCase()
		: user?.email?.charAt(0).toUpperCase() || 'U';

	return (
		<header
			className={cn(
				'flex h-16 items-center justify-between border-b border-border bg-background px-6',
				className,
			)}
		>
			{/* Left side - Mobile menu button and search */}
			<div className="flex items-center gap-4">
				<Button variant="ghost" size="icon" className="lg:hidden" onClick={onMobileMenuToggle}>
					<Menu className="h-5 w-5 text-foreground" />
				</Button>

				<div className="relative">
					<Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
					<Input
						placeholder={t('header.search')}
						value={searchQuery}
						onChange={(e) => setSearchQuery(e.target.value)}
						className="w-64 pl-9 bg-muted/50 border-0 focus-visible:ring-1 focus-visible:ring-ring"
					/>
				</div>
			</div>

			{/* Right side - Settings and user menu */}
			<div className="flex items-center gap-2">
				<LanguageToggle variant="ghost" align="end" />
				<ThemeToggle variant="ghost" align="end" />
				<AccountDialog>
					<Button variant="ghost" className="flex items-center gap-2 px-3">
						<Avatar className="h-8 w-8">
							<AvatarImage src={user?.image || undefined} alt={user?.name || 'User'} />
							<AvatarFallback className="bg-primary text-primary-foreground text-sm">
								{fallbackText}
							</AvatarFallback>
						</Avatar>
						<div className="hidden sm:flex flex-col items-start">
							<span className="text-sm font-medium text-foreground">{user?.name || 'User'}</span>
							<span className="text-xs text-muted-foreground">{t('auth.online')}</span>
						</div>
					</Button>
				</AccountDialog>
			</div>
		</header>
	);
}
