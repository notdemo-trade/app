import { ExternalLink } from 'lucide-react';
import { useTranslations } from 'use-intl';

const navigation = {
	main: [
		{ name: 'Workers AI', href: 'https://ai.cloudflare.com' },
		{ name: 'OpenAI', href: 'https://openai.com' },
		{ name: 'Anthropic', href: 'https://anthropic.com' },
		{ name: 'Google Gemini', href: 'https://gemini.google.com/app' },
		{ name: 'xAI', href: 'https://x.ai' },
		{ name: 'DeepSeek', href: 'https://deepseek.com' },
	],
};

export function Footer() {
	const t = useTranslations();

	return (
		<footer className="border-t bg-background">
			<div className="mx-auto max-w-7xl px-6 py-12 md:flex md:items-center md:justify-between lg:px-8">
				<div>
					<h3 className="text-sm font-semibold text-foreground">{t('footer.llm_providers')}</h3>
					<ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
						{navigation.main.map((item) => (
							<li key={item.name}>
								<a
									href={item.href}
									target="_blank"
									rel="noopener noreferrer"
									className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center group"
								>
									{item.name}
									<ExternalLink className="ml-1 h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
								</a>
							</li>
						))}
					</ul>
				</div>

				<div className="mt-8 md:mt-0">
					<div className="text-center md:text-right">
						<a
							href="https://x.com/tomkowalczyk"
							target="_blank"
							rel="noopener noreferrer"
							className="text-xs text-muted-foreground hover:text-foreground transition-colors"
						>
							{t('footer.built_by')}
						</a>
						<p className="text-xs text-muted-foreground mt-1">
							&copy; {new Date().getFullYear()} notdemo.trade
						</p>
					</div>
				</div>
			</div>
		</footer>
	);
}
