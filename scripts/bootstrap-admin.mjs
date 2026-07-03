// One-off: generate the SQL to insert the first admin user.
//
// Usage (PowerShell / bash):
//   node scripts/bootstrap-admin.mjs "<username>" "<full name>" "<password>"
//
// It Argon2id-hashes the password (same parameters as
// src/lib/server/password.ts) and prints an INSERT statement. Hand that SQL
// back to be applied via the Supabase MCP — the plaintext password never
// leaves your machine; only the hash appears in the SQL.

import { hash } from '@node-rs/argon2';

// Keep in sync with src/lib/server/password.ts
const ARGON2_OPTIONS = { memoryCost: 19456, timeCost: 2, parallelism: 1 };

const [, , username, fullName, password] = process.argv;

if (!username || !fullName || !password) {
	console.error('Usage: node scripts/bootstrap-admin.mjs "<username>" "<full name>" "<password>"');
	process.exit(1);
}

/** Escape a string literal for SQL (double any single quotes). */
const sql = (value) => `'${value.replace(/'/g, "''")}'`;

const passwordHash = await hash(password, ARGON2_OPTIONS);

const statement = `insert into public.users (username, full_name, password_hash, role, status)
values (${sql(username)}, ${sql(fullName)}, ${sql(passwordHash)}, 'admin', 'active');`;

console.log('\n-- Copy the statement below and apply it to the database:\n');
console.log(statement);
console.log('');
