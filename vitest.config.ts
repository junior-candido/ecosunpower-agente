import { configDefaults, defineConfig } from 'vitest/config';

// .claude/worktrees/ guarda cópias do repo de outras sessões — os testes de lá não
// são deste checkout (e dobravam a suíte).
export default defineConfig({
  test: {
    exclude: [...configDefaults.exclude, '.claude/**'],
  },
});
