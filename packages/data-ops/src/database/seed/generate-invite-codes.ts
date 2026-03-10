import { sql } from 'drizzle-orm';
import { generateInviteCodes } from '../../invite-code/queries';
import { initDatabase } from '../setup';

async function generate() {
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

	const codes = await generateInviteCodes(20);

	console.log(`Generated ${codes.length} invite codes:\n`);
	for (const code of codes) {
		console.log(`  ${code}`);
	}

	process.exit(0);
}

generate().catch((error) => {
	console.error('Error:', error);
	process.exit(1);
});
