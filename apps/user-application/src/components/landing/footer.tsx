import { ExternalLink } from "lucide-react";

const navigation = {
  main: [
    { name: "OpenAI", href: "https://openai.com" },
    { name: "Anthropic", href: "https://anthropic.com" },
    { name: "Google Gemini", href: "https://gemini.google.com/app" },
    { name: "xAI", href: "https://x.ai" },
    { name: "DeepSeek", href: "https://deepseek.com" },
  ],
  tools: [
    { name: "StockTwits", href: "https://stocktwits.com" },
    { name: "Reddit", href: "https://reddit.com" },
    { name: "Twitter", href: "https://x.com" },
    { name: "SEC Filings", href: "https://www.sec.gov/edgar" },
    { name: "and more..", href: "" },
  ],
};

export function Footer() {
  return (
    <footer className="border-t bg-background">
      <div className="mx-auto max-w-7xl px-6 py-12 md:flex md:items-center md:justify-between lg:px-8">
        <div className="flex flex-col md:flex-row md:items-center md:space-x-8 space-y-6 md:space-y-0">
          <div>
            <h3 className="text-sm font-semibold text-foreground">
              LLM Providers
            </h3>
            <ul role="list" className="mt-2 space-y-1">
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

          <div>
            <h3 className="text-sm font-semibold text-foreground">
              Signal Sources
            </h3>
            <ul role="list" className="mt-2 space-y-1">
              {navigation.tools.map((item) => (
                <li key={item.name}>
                  {item.href ? (
                    <a
                      href={item.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center group"
                    >
                      {item.name}
                      <ExternalLink className="ml-1 h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </a>
                  ) : (
                    <span className="text-sm text-muted-foreground">{item.name}</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-8 md:mt-0">
          <div className="text-center md:text-right">
            <a
              href="https://x.com/tomkowalczyk"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Built by @tomkowalczyk
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
