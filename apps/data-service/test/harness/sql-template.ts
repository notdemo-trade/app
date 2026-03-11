import type Database from 'better-sqlite3';

export function createSqlTag(db: Database.Database) {
	return function sql<T = Record<string, unknown>>(
		strings: TemplateStringsArray,
		...values: (string | number | boolean | null)[]
	): T[] {
		let query = '';
		for (let i = 0; i < strings.length; i++) {
			query += strings[i];
			if (i < values.length) query += '?';
		}
		query = query.trim();

		const isSelect = /^\s*(SELECT|PRAGMA)/i.test(query);
		const stmt = db.prepare(query);
		if (isSelect) {
			return stmt.all(...values) as T[];
		}
		stmt.run(...values);
		return [] as T[];
	};
}
