import { hash, verify } from '@node-rs/argon2';

/**
 * Argon2id parameters. OWASP-recommended baseline (19 MiB, 2 iterations,
 * 1 lane). These are encoded in the resulting hash string, so verification
 * stays correct even if we tune these later.
 */
const ARGON2_OPTIONS = {
	memoryCost: 19456,
	timeCost: 2,
	parallelism: 1
} as const;

export function hashPassword(password: string): Promise<string> {
	return hash(password, ARGON2_OPTIONS);
}

export function verifyPassword(storedHash: string, password: string): Promise<boolean> {
	return verify(storedHash, password, ARGON2_OPTIONS);
}
