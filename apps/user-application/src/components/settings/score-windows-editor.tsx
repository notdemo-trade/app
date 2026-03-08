import { X } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface ScoreWindowsEditorProps {
	value: number[];
	onChange: (windows: number[]) => void;
}

export function ScoreWindowsEditor({ value, onChange }: ScoreWindowsEditorProps) {
	const [input, setInput] = useState('');

	function addWindow() {
		const n = Number(input);
		if (Number.isNaN(n) || n < 7 || n > 365) return;
		if (value.includes(n)) return;
		if (value.length >= 5) return;
		const next = [...value, n].sort((a, b) => a - b);
		onChange(next);
		setInput('');
	}

	function removeWindow(w: number) {
		if (value.length <= 1) return;
		onChange(value.filter((v) => v !== w));
	}

	return (
		<div className="space-y-2">
			<div className="flex flex-wrap gap-2">
				{value.map((w) => (
					<Badge key={w} variant="secondary" className="gap-1">
						{w}d
						{value.length > 1 && (
							<button
								type="button"
								onClick={() => removeWindow(w)}
								className="ml-1 text-muted-foreground hover:text-foreground"
							>
								<X className="h-3 w-3" />
							</button>
						)}
					</Badge>
				))}
			</div>
			{value.length < 5 && (
				<div className="flex gap-2">
					<Input
						type="number"
						min={7}
						max={365}
						placeholder="Add window (days)"
						value={input}
						onChange={(e) => setInput(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === 'Enter') {
								e.preventDefault();
								addWindow();
							}
						}}
						className="w-40"
					/>
					<Button type="button" variant="outline" size="sm" onClick={addWindow}>
						Add
					</Button>
				</div>
			)}
		</div>
	);
}
