import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './test',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'line',
  webServer: {
    command: 'npx servor . index.html 8080',
    port: 8080,
    reuseExistingServer: !process.env.CI,
  },
  use: {
    trace: 'on-first-retry',
    viewport: { width: 1280, height: 720 },
    baseURL: 'http://localhost:8080',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
