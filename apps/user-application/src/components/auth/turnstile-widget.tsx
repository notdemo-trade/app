import { Turnstile } from '@marsidev/react-turnstile';

interface TurnstileWidgetProps {
	onSuccess: (token: string) => void;
	onError?: () => void;
	onExpire?: () => void;
}

const SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY ?? '1x00000000000000000000AA';

export function TurnstileWidget({ onSuccess, onError, onExpire }: TurnstileWidgetProps) {
	return (
		<Turnstile
			siteKey={SITE_KEY}
			onSuccess={onSuccess}
			onError={onError}
			onExpire={onExpire}
			options={{ theme: 'auto', size: 'flexible' }}
		/>
	);
}
