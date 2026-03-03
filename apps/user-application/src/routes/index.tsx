import { createFileRoute } from '@tanstack/react-router';
import { FaqSection } from '@/components/landing/faq-section';
import { FeaturesSection } from '@/components/landing/features-section';
import { Footer } from '@/components/landing/footer';
import { HeroSection } from '@/components/landing/hero-section';
import { NavigationBar } from '@/components/navigation';

export const Route = createFileRoute('/')({
	component: LandingPage,
});

function LandingPage() {
	return (
		<div className="min-h-screen bg-background">
			<NavigationBar />
			<main>
				<HeroSection />
				<FeaturesSection />
				<FaqSection />
			</main>
			<Footer />
		</div>
	);
}
