import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser', fullyParallel: false, workers: 1, timeout: 60000,
  expect: { timeout: 10000 }, reporter: 'list',
  use: { viewport: { width: 1280, height: 800 }, headless: true, trace: 'retain-on-failure', screenshot: 'only-on-failure',
    launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } },
});
