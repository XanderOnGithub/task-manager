import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import jsxA11y from 'eslint-plugin-jsx-a11y'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  // media/ holds the README GIF and trailer tools, each with its own setup.
  { ignores: ['dist', 'target', 'media'] },
  {
    // jsx-a11y catches accessibility mistakes in the markup as it is written
    // (buttons without names, clickable divs, labels with no field).
    extends: [js.configs.recommended, ...tseslint.configs.recommended, jsxA11y.flatConfigs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // Every autoFocus here is a field or dialog that appeared because of something
      // you just did (a click on "Add", a shortcut), where focus belongs. Nothing
      // grabs focus on page load. Dialogs also move focus in (lib/modalLayer.ts).
      'jsx-a11y/no-autofocus': 'off',
      // Label text sits a couple of elements deep (a title and a help line).
      'jsx-a11y/label-has-associated-control': ['error', { depth: 3 }],
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
    },
  },
)
