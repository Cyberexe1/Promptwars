import eslint from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/**', 'coverage/**'] },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  reactHooks.configs.flat.recommended,
  reactRefresh.configs.vite,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    rules: {
      // Data fetching and controlled-form synchronization are intentional effects.
      'react-hooks/set-state-in-effect': 'off',
      // Date-derived dashboard summaries are refreshed with the fetched plan.
      'react-hooks/purity': 'off',
      // This small app colocates each context provider and its consumer hook.
      'react-refresh/only-export-components': 'off',
    },
  },
);
