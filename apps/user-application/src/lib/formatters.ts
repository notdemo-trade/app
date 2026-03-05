const currencyFmt = new Intl.NumberFormat('en-US', {
	style: 'currency',
	currency: 'USD',
});

const timeFmt = new Intl.DateTimeFormat('en-US', {
	hour: 'numeric',
	minute: '2-digit',
	timeZoneName: 'short',
});

const dateTimeFmt = new Intl.DateTimeFormat('en-US', {
	month: 'short',
	day: 'numeric',
	hour: 'numeric',
	minute: '2-digit',
	timeZoneName: 'short',
});

export function formatCurrency(value: number): string {
	return currencyFmt.format(value);
}

export function formatTime(iso: string): string {
	return timeFmt.format(new Date(iso));
}

export function formatDateTime(iso: string): string {
	return dateTimeFmt.format(new Date(iso));
}

export function formatRelativeTime(iso: string): string {
	const diff = Date.now() - new Date(iso).getTime();
	const seconds = Math.floor(diff / 1000);
	if (seconds < 60) return 'just now';
	const minutes = Math.floor(seconds / 60);
	if (minutes < 60) return `${minutes}m ago`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h ago`;
	return dateTimeFmt.format(new Date(iso));
}
