// eslint.config.mjs
import globals from "globals";
import pluginJs from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  // 1. Configuración global (sin typed linting) - para todos los archivos
  {
    files: ["**/*.{js,mjs,cjs,ts}"],
    ignores: [
      "node_modules/**",
      "dist/**",
      "eslint.config.mjs",    // ← Ignoramos este archivo
      "package*.json",
      "*.config.js",
      "*.config.mjs",
      "*.config.cjs"
    ],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
    rules: {
      "no-console": "off",
      "eqeqeq": ["warn", "always"],
      "no-var": "error",
      "prefer-const": "error",
    },
  },

  // 2. Configuración solo para archivos TS reales (typed linting)
  {
    files: ["src/**/*.ts"],
    plugins: {
      "@typescript-eslint": tseslint.plugin,
    },
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        project: true,                    // o "./tsconfig.json" si prefieres
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      ...tseslint.configs.recommended.rules,
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "no-console": "off",
    },
  }
);