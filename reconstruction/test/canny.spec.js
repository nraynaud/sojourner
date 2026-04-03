import { test, expect } from '@playwright/test';
import path from 'path';

test('Canny QUnit test', async ({ page }) => {
  await page.goto('/tests.html');

  // Wait for QUnit to finish
  const qunitResults = page.locator('#qunit-testresult');
  // Wait for the final result text that includes "total" number of tests
  await expect(qunitResults).toContainText('completed', { timeout: 20000 });
  await expect(qunitResults).not.toContainText('Running:', { timeout: 20000 });
  
  const resultsText = await qunitResults.innerText();
  console.log('Final QUnit Results:', resultsText);

  // Verify that all tests passed and total count matches 11
  const failedTests = await page.locator('li.fail').count();
  
  expect(failedTests, `There are ${failedTests} failed QUnit tests`).toBe(0);
  expect(resultsText).toContain('11 tests completed');
});
