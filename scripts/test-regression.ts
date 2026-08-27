// Regression test runner using Bun.WebView (built into Bun 1.4)
// Run: bun run scripts/test-regression.ts [url] [outDir]
// Requires: Bun runtime + an installed Chromium/Chrome (for the "chrome" backend)

import { existsSync } from "node:fs";

interface TestCase {
  url: string;
  label: string;
  checks: { selector: string; description: string }[];
}

const BASE_URL = process.argv[2] ?? "https://jso-crescendo.ch";

const tests: TestCase[] = [
  {
    url: `${BASE_URL}/`,
    label: "Homepage",
    checks: [
      { selector: "h1", description: "has heading" },
      { selector: "main", description: "has main content" },
    ],
  },
  {
    url: `${BASE_URL}/konzerte`,
    label: "Konzerte overview",
    checks: [
      { selector: "h1", description: "has heading" },
      { selector: "main", description: "has main content" },
    ],
  },
  {
    url: `${BASE_URL}/ueber-uns`,
    label: "Über uns",
    checks: [
      { selector: "h1", description: "has heading" },
      { selector: "main", description: "has main content" },
    ],
  },
];

const outDir = process.argv[3] ?? "/tmp/regression-screenshots";
if (!existsSync(outDir)) {
  require("node:fs").mkdirSync(outDir, { recursive: true });
}

async function runTest(test: TestCase) {
  const view = new Bun.WebView({ backend: "chrome", width: 1280, height: 720 });

  try {
    await view.navigate(test.url);
    // Wait for client-side JS / animations to settle
    await new Promise((r) => setTimeout(r, 2000));

    // Sequential evaluate calls — only one pending at a time
    const results: typeof test.checks & { passes: boolean }[] = [];
    for (const check of test.checks) {
      const count = Number(
        await view.evaluate(
          `document.querySelectorAll('${check.selector}').length`,
        ),
      );
      results.push({ ...check, passes: count > 0 });
    }

    // Screenshot
    const buffer = await view.screenshot({
      format: "png",
      encoding: "buffer",
    });
    const safeName = test.label.replace(/\s+/g, "-").toLowerCase();
    const path = `${outDir}/${safeName}.png`;
    await Bun.write(path, buffer);

    const failures = results.filter((r) => !r.passes);
    return {
      ...test,
      screenshot: path,
      checks: results,
      pass: failures.length === 0,
      error: null,
    };
  } catch (err) {
    return {
      ...test,
      screenshot: null,
      checks: [],
      pass: false,
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    view.close();
  }
}

// --- Main ---
console.log(`Regression tests — base URL: ${BASE_URL}\n`);

let passed = 0,
  failed = 0;
for (const test of tests) {
  const result = await runTest(test);
  const status = result.pass ? "✓" : "✗";
  if (result.pass) passed++;
  else failed++;

  console.log(`  ${status} ${result.label} (${new URL(result.url).pathname})`);
  for (const c of result.checks) {
    const cs = c.passes ? "✓" : "✗";
    console.log(`    ${cs} ${c.description} (${c.selector})`);
  }
  if (result.screenshot) console.log(`    📷 ${result.screenshot}`);
  if (result.error) console.log(`    ⚠️  ${result.error}`);
}

console.log(`\n${passed}/${tests.length} passed`);
if (failed > 0) {
  console.log(`${failed} test(s) failed`);
  process.exit(1);
}
