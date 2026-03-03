import { Link } from '@tanstack/react-router';
import { ExternalLink, Github, Menu } from 'lucide-react';
import * as React from 'react';
import { useTranslations } from 'use-intl';
import { AccountDialog } from '@/components/auth/account-dialog';
import { LanguageToggle } from '@/components/i18n/language-toggle';
import { ThemeToggle } from '@/components/theme';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
	SheetTrigger,
} from '@/components/ui/sheet';
import { authClient } from '@/lib/auth-client';
import { cn } from '@/lib/utils';

interface NavigationItem {
	labelKey: string;
	href: string;
	isExternal?: boolean;
}

const navigationItems: NavigationItem[] = [
	{ labelKey: 'nav.features', href: '/#features' },
	{ labelKey: 'nav.faq', href: '/#faq' },
];

export function NavigationBar() {
	const [isOpen, setIsOpen] = React.useState(false);
	const [isScrolled, setIsScrolled] = React.useState(false);
	const { data: session } = authClient.useSession();
	const t = useTranslations();

	const user = session?.user;
	const fallbackText = user?.name
		? user.name.charAt(0).toUpperCase()
		: user?.email?.charAt(0).toUpperCase() || 'U';

	React.useEffect(() => {
		const handleScroll = () => {
			setIsScrolled(window.scrollY > 20);
		};

		window.addEventListener('scroll', handleScroll);
		return () => window.removeEventListener('scroll', handleScroll);
	}, []);

	const closeMenu = () => setIsOpen(false);

	return (
		<nav
			className={cn(
				'fixed top-0 left-0 right-0 z-50 transition-all duration-500 ease-out',
				isScrolled
					? 'bg-background/80 backdrop-blur-xl border-b border-border/50 shadow-lg shadow-primary/5'
					: 'bg-transparent',
			)}
		>
			<div className="container mx-auto px-4 sm:px-6 lg:px-8">
				<div className="flex items-center justify-between h-16 lg:h-20">
					{/* Logo and Brand */}
					<Link to="/" className="group flex items-center space-x-3 no-underline">
						<div className="flex flex-col">
							<span className="text-lg lg:text-xl font-bold bg-gradient-to-r from-foreground to-foreground/80 bg-clip-text text-transparent group-hover:from-primary group-hover:to-primary/80 transition-all duration-300">
								notdemo<span className="text-destructive">.</span>trade
							</span>
						</div>
					</Link>

					{/* Desktop Navigation */}
					<div className="hidden lg:flex items-center space-x-1">
						{navigationItems.map((item) => (
							<div key={item.labelKey} className="relative group">
								{item.isExternal ? (
									<a
										href={item.href}
										target="_blank"
										rel="noopener noreferrer"
										className="flex items-center space-x-2 px-4 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground transition-all duration-300 hover:bg-accent/50 group"
									>
										<span>{t(item.labelKey)}</span>
										<ExternalLink className="h-4 w-4" />
									</a>
								) : (
									<Link
										to={item.href}
										onClick={closeMenu}
										className="px-4 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground transition-all duration-300 hover:bg-accent/50 block"
									>
										{t(item.labelKey)}
									</Link>
								)}
								<div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 w-0 h-0.5 bg-gradient-to-r from-primary to-primary/80 transition-all duration-300 group-hover:w-3/4" />
							</div>
						))}

						{/* Language Toggle, Theme Toggle & GitHub */}
						<div className="ml-2 pl-2 border-l border-border/30 flex items-center">
							<LanguageToggle variant="ghost" align="end" />
							<ThemeToggle variant="ghost" align="end" />
							<Button variant="ghost" size="icon" asChild>
								<a
									href="https://github.com/notdemo-trade/app"
									target="_blank"
									rel="noopener noreferrer"
									aria-label="GitHub repository"
								>
									<Github className="h-4 w-4 text-foreground" />
								</a>
							</Button>
						</div>
					</div>

					{/* Auth Button - Desktop */}
					<div className="hidden lg:block">
						{session ? (
							<AccountDialog>
								<Button variant="ghost" className="flex items-center gap-2 px-3">
									<Avatar className="h-7 w-7">
										<AvatarImage src={user?.image || undefined} alt={user?.name || 'User'} />
										<AvatarFallback className="bg-primary text-primary-foreground text-xs">
											{fallbackText}
										</AvatarFallback>
									</Avatar>
									<span className="text-sm font-medium text-foreground">
										{user?.name || 'Account'}
									</span>
								</Button>
							</AccountDialog>
						) : null}
					</div>

					{/* Mobile Menu Button + Theme Toggle */}
					<div className="lg:hidden flex items-center space-x-2">
						<Button variant="ghost" size="icon" asChild>
							<a
								href="https://github.com/notdemo-trade/app"
								target="_blank"
								rel="noopener noreferrer"
								aria-label="GitHub repository"
							>
								<Github className="h-4 w-4 text-foreground" />
							</a>
						</Button>
						<LanguageToggle variant="ghost" align="end" />
						<ThemeToggle variant="ghost" align="end" />
						<Sheet open={isOpen} onOpenChange={setIsOpen}>
							<SheetTrigger asChild>
								<Button
									variant="ghost"
									size="icon"
									className="relative h-10 w-10 hover:bg-accent/50"
								>
									<Menu className="h-5 w-5" />
									<span className="sr-only">Open navigation menu</span>
								</Button>
							</SheetTrigger>
							<SheetContent
								side="right"
								className="w-[300px] bg-background/95 backdrop-blur-xl border-l border-border/50"
							>
								<SheetHeader className="text-left space-y-1 pb-6">
									<SheetTitle className="text-xl font-bold bg-gradient-to-r from-primary to-primary/80 bg-clip-text text-transparent">
										{t('nav.navigation')}
									</SheetTitle>
									<SheetDescription className="text-muted-foreground">
										{t('nav.navigate')}
									</SheetDescription>
								</SheetHeader>

								<div className="flex flex-col space-y-2 pb-6">
									{navigationItems.map((item) => (
										<div key={item.labelKey} className="relative group">
											{item.isExternal ? (
												<a
													href={item.href}
													target="_blank"
													rel="noopener noreferrer"
													className="flex items-center justify-between w-full px-4 py-3 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground transition-all duration-300 hover:bg-accent/50"
													onClick={() => setIsOpen(false)}
												>
													<span>{t(item.labelKey)}</span>
													<ExternalLink className="h-4 w-4" />
												</a>
											) : (
												<Link
													to={item.href}
													onClick={closeMenu}
													className="flex items-center w-full px-4 py-3 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground transition-all duration-300 hover:bg-accent/50 text-left"
												>
													{t(item.labelKey)}
												</Link>
											)}
										</div>
									))}
								</div>

								{/* Mobile Auth */}
								<div className="pt-4 border-t border-border/50">
									{session ? (
										<div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-accent/30">
											<Avatar className="h-10 w-10">
												<AvatarImage src={user?.image || undefined} alt={user?.name || 'User'} />
												<AvatarFallback className="bg-primary text-primary-foreground text-sm">
													{fallbackText}
												</AvatarFallback>
											</Avatar>
											<div className="flex-1">
												<p className="text-sm font-medium">{user?.name || 'User'}</p>
												<p className="text-xs text-muted-foreground">{user?.email}</p>
											</div>
										</div>
									) : null}
								</div>
							</SheetContent>
						</Sheet>
					</div>
				</div>
			</div>
		</nav>
	);
}
