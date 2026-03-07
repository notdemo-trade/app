import { sql } from 'drizzle-orm';
import { initDatabase } from '../setup';

async function seedDb() {
	console.log('Initializing database connection...');

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
	console.log('Database connection OK');

	console.log('\n[START] Seeding data...\n');

	// Add seed operations here

	console.log('\n[END] Seeding data...\n');

	process.exit(0);
}

seedDb().catch((error) => {
	console.error('Error:', error);
	process.exit(1);
});
