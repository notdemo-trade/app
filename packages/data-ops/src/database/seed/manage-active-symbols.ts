import { sql } from 'drizzle-orm';
import { deactivateSymbol, listAllSymbols, upsertActiveSymbols } from '../../active-symbol/queries';
import { initDatabase } from '../setup';

async function main() {
	const host = process.env.DATABASE_HOST;
	const username = process.env.DATABASE_USERNAME;
	const password = process.env.DATABASE_PASSWORD;

	if (!host || !username || !password) {
		throw new Error(
			'Missing required DATABASE_HOST, DATABASE_USERNAME, or DATABASE_PASSWORD env vars',
		);
	}

	const db = initDatabase({ host, username, password });

	console.log('Checking database connection...');
	await db.execute(sql`SELECT 1`);
	console.log('Database connection OK\n');

	// Skip any '--' separators injected by pnpm/dotenvx passthrough
	const rawArgs = process.argv.slice(2).filter((a) => a !== '--');
	const command = rawArgs[0];
	const args = rawArgs.slice(1);

	switch (command) {
		case 'add': {
			if (args.length === 0) {
				console.error('Usage: pnpm run symbols:dev -- add AAPL MSFT GOOGL');
				process.exit(1);
			}
			const symbols = args.map((s) => ({ symbol: s.toUpperCase(), assetClass: 'stock' as const }));
			const result = await upsertActiveSymbols(symbols);
			console.log(`Added ${result.length} symbol(s):`);
			for (const r of result) {
				console.log(`  ${r.symbol}`);
			}
			if (result.length < symbols.length) {
				console.log(`  (${symbols.length - result.length} already existed)`);
			}
			break;
		}

		case 'remove': {
			if (args.length === 0) {
				console.error('Usage: pnpm run symbols:dev -- remove TSLA');
				process.exit(1);
			}
			for (const symbol of args) {
				const removed = await deactivateSymbol(symbol);
				console.log(`  ${symbol.toUpperCase()}: ${removed ? 'deactivated' : 'not found'}`);
			}
			break;
		}

		case 'list': {
			const all = await listAllSymbols();
			if (all.length === 0) {
				console.log('No active symbols configured.');
			} else {
				console.log(`${all.length} symbol(s):\n`);
				for (const s of all) {
					const status = s.isActive ? 'active' : 'inactive';
					console.log(`  ${s.symbol.padEnd(8)} ${s.assetClass.padEnd(6)} [${status}]`);
				}
			}
			break;
		}

		default: {
			console.log('Usage:');
			console.log('  pnpm run symbols:dev -- add AAPL MSFT GOOGL');
			console.log('  pnpm run symbols:dev -- remove TSLA');
			console.log('  pnpm run symbols:dev -- list');
			process.exit(1);
		}
	}

	process.exit(0);
}

main().catch((error) => {
	console.error('Error:', error);
	process.exit(1);
});
