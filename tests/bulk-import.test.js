// Phase 2C — License Inventory bulk Excel import (views/bulk_import.js).
// Loads app.js -> views/license.js -> views/bulk_import.js into the same VM
// context, mirroring index.html's real script load order, so bulk_import.js's
// references to license.js/app.js globals (loadManualLicenses, storeManualLicenses,
// saveLicenseAsync, renderLicense) resolve exactly as they do in the browser.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const nodeCrypto = require('node:crypto');

const root = path.resolve(__dirname, '..');
const appCode = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const licenseCode = fs.readFileSync(path.join(root, 'views/license.js'), 'utf8');
const bulkImportCode = fs.readFileSync(path.join(root, 'views/bulk_import.js'), 'utf8');

function createBulkImportContext() {
  const storage = new Map();
  const elements = {
    'sb-uname': { textContent: 'PMO Admin' },
    'sb-urole': { textContent: 'PMO' },
  };
  const context = {
    console,
    Date,
    Intl,
    URL,
    Blob,
    crypto: nodeCrypto,
    setTimeout,
    clearTimeout,
    alert: () => {},
    confirm: () => true,
    prompt: () => null,
    // Simulate Supabase unavailable (offline/local-only), not "available but
    // empty" — importLicenses() calls the full renderLicense(), which
    // (unlike saveLicenseManual()'s narrower _renderLicTab()) reloads via
    // loadManualLicensesAsync(); an "available but empty" stub would race
    // that reload against this test's own assertions and wipe localStorage
    // out from under a second import. Offline keeps loadManualLicenses()/
    // storeManualLicenses() (plain localStorage) as the single source of
    // truth throughout, which is what these dedup-key tests are about.
    fetch: async () => { throw new Error('offline'); },
    localStorage: {
      getItem: key => storage.has(key) ? storage.get(key) : null,
      setItem: (key, value) => storage.set(key, String(value)),
      removeItem: key => storage.delete(key),
    },
    document: {
      getElementById: id => elements[id] || null,
      querySelector: () => null,
      querySelectorAll: () => [],
      createElement: () => ({ style: {}, click() {}, remove() {}, appendChild() {} }),
      body: { appendChild() {}, removeChild() {}, classList: { add() {}, remove() {} } },
      addEventListener: () => {},
    },
    window: {},
    location: { reload() {} },
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(appCode, context, { filename: 'app.js' });
  vm.runInContext(licenseCode, context, { filename: 'views/license.js' });
  vm.runInContext(bulkImportCode, context, { filename: 'views/bulk_import.js' });
  return { context, storage };
}

test('importLicenses: same Software+Plan+dates but different Project create two separate inventory records, not one overwritten', async () => {
  const { context } = createBulkImportContext();
  const rows = [
    { Name: 'Figma', Plan: 'Professional', Project: 'Geo9', Seats: 5, 'Purchase Date': '2025-01-01', 'Expiry Date': '2026-01-01' },
    { Name: 'Figma', Plan: 'Professional', Project: 'AOA-MP', Seats: 3, 'Purchase Date': '2025-01-01', 'Expiry Date': '2026-01-01' },
  ];
  await context.importLicenses(rows);
  const saved = context.loadManualLicenses();
  assert.equal(saved.length, 2, 'expected two distinct per-project records, not one overwriting the other');
  const geo9 = saved.find(l => l.project === 'Geo9');
  const aoa = saved.find(l => l.project === 'AOA-MP');
  assert.ok(geo9, 'Geo9 record must exist');
  assert.ok(aoa, 'AOA-MP record must exist');
  assert.equal(geo9.seats, 5);
  assert.equal(aoa.seats, 3);
});

test('importLicenses: an exact duplicate row within the same file collapses to one record (update), not two', async () => {
  const { context } = createBulkImportContext();
  const row = { Name: 'GitHub Copilot', Plan: 'Business', Project: 'AOA-MP', Seats: 10, 'Purchase Date': '2025-01-01', 'Expiry Date': '2026-01-01' };
  await context.importLicenses([row, { ...row }]);
  const saved = context.loadManualLicenses();
  const matches = saved.filter(l => l.name === 'GitHub Copilot' && l.project === 'AOA-MP');
  assert.equal(matches.length, 1, 'duplicate row in the same file must not create two records');
});

test('importLicenses: re-importing the same Software+Plan+Project updates the existing record instead of adding a new one', async () => {
  const { context } = createBulkImportContext();
  const row = { Name: 'Figma', Plan: 'Professional', Project: 'Geo9', Seats: 5, 'Purchase Date': '2025-01-01', 'Expiry Date': '2026-01-01' };
  await context.importLicenses([row]);
  await context.importLicenses([{ ...row, Seats: 8 }]);
  const saved = context.loadManualLicenses();
  const matches = saved.filter(l => l.name === 'Figma' && l.project === 'Geo9');
  assert.equal(matches.length, 1, 'a second import of the same identity must update, not duplicate');
  assert.equal(matches[0].seats, 8);
});
