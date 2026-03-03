import { sql } from 'drizzle-orm';
import { initDatabase } from '../setup';

async function seedDb() {
	console.log('Initializing database connection...');

	const db = initDatabase({
		host: process.env.DATABASE_HOST!,
		username: process.env.DATABASE_USERNAME!,
		password: process.env.DATABASE_PASSWORD!,
	});

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
