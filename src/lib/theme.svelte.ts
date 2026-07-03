// Theme preference store (runes). Three modes:
//   'system' — follow the OS (the default; no data-theme attribute set).
//   'light'  — force light, even on a dark OS.
//   'dark'   — force dark, even on a light OS.
// The choice is persisted in localStorage and mirrored onto <html> so the
// tokens.scss selectors and the anti-flash script in app.html stay in sync.

export type Theme = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'theme';
const ORDER: Theme[] = ['system', 'light', 'dark'];

function read(): Theme {
	if (typeof localStorage === 'undefined') return 'system';
	const stored = localStorage.getItem(STORAGE_KEY);
	return stored === 'light' || stored === 'dark' ? stored : 'system';
}

function apply(theme: Theme) {
	if (typeof document === 'undefined') return;
	const root = document.documentElement;
	if (theme === 'system') {
		root.removeAttribute('data-theme');
		root.style.colorScheme = 'light dark';
		try {
			localStorage.removeItem(STORAGE_KEY);
		} catch {
			// ignore storage failures (private mode, etc.)
		}
	} else {
		root.setAttribute('data-theme', theme);
		root.style.colorScheme = theme;
		try {
			localStorage.setItem(STORAGE_KEY, theme);
		} catch {
			// ignore storage failures
		}
	}
}

class ThemeStore {
	/** Current preference. Defaults to 'system' until init() reads storage on the client. */
	current = $state<Theme>('system');

	/** Sync reactive state with what the browser already has. Call once on mount. */
	init() {
		this.current = read();
	}

	set(theme: Theme) {
		this.current = theme;
		apply(theme);
	}

	/** Advance System → Light → Dark → System. */
	cycle() {
		const next = ORDER[(ORDER.indexOf(this.current) + 1) % ORDER.length];
		this.set(next);
	}
}

export const theme = new ThemeStore();
