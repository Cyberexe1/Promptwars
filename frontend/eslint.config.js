import eslint from '@eslint/js';
import globals from 'globals';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/**', 'coverage/**'] },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  jsxA11y.flatConfigs.strict,
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
      // WAI-ARIA recommends a focusable tabpanel, and a scrollable region must
      // be focusable so keyboard users can scroll it (axe: scrollable-region-focusable).
      'jsx-a11y/no-noninteractive-tabindex': [
        'error',
        {
          tags: [],
          roles: ['tabpanel', 'region'],
          allowExpressionValues: true,
        },
      ],
      // A modal dialog owns Escape and Tab handling for its focus trap.
      'jsx-a11y/no-noninteractive-element-interactions': [
        'error',
        {
          handlers: [
            'onClick',
            'onError',
            'onLoad',
            'onMouseDown',
            'onMouseUp',
            'onKeyPress',
            'onKeyDown',
            'onKeyUp',
          ],
          alert: ['onKeyUp', 'onKeyDown', 'onKeyPress'],
          body: ['onError', 'onLoad'],
          dialog: ['onKeyUp', 'onKeyDown', 'onKeyPress'],
          iframe: ['onError', 'onLoad'],
          img: ['onError', 'onLoad'],
        },
      ],
      // Task labels wrap the checkbox and nest their text two elements deep.
      'jsx-a11y/label-has-associated-control': ['error', { depth: 3 }],
    },
  },
);
