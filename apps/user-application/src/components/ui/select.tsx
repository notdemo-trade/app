import type * as React from 'react';

import { cn } from '@/lib/utils';

function Select({ className, children, ...props }: React.ComponentProps<'select'>) {
	return (
		<select
			data-slot="select"
			className={cn(
				'border-input bg-transparent text-foreground h-9 w-full rounded-md border px-3 py-1 text-sm shadow-xs transition-colors focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50',
				className,
			)}
			{...props}
		>
			{children}
		</select>
	);
}

export { Select };
