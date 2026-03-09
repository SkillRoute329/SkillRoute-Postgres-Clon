/**
 * mass_fix_imports.cjs
 * Removes specific unused named imports from TypeScript/TSX files.
 * Uses precise regex replacements per file.
 */
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'src');

function readFile(relPath) {
  return fs.readFileSync(path.join(SRC, relPath), 'utf8');
}
function writeFile(relPath, content) {
  fs.writeFileSync(path.join(SRC, relPath), content, 'utf8');
  console.log('✅ Fixed:', relPath);
}

// Helper: removes an import name from a named import group
function removeImport(content, importName) {
  // Remove with trailing comma: `Foo, ` or `, Foo`
  let result = content
    .replace(new RegExp(`\\b${importName}\\b,\\s*`, 'g'), '')
    .replace(new RegExp(`,\\s*\\b${importName}\\b`, 'g'), '')
    .replace(new RegExp(`^\\s*\\b${importName}\\b\\s*$`, 'gm'), '');
  // Clean up empty import lines
  result = result.replace(/import\s*\{\s*\}\s*from\s*'[^']+';?\n?/g, '');
  return result;
}

// Helper: remove multiple imports at once
function removeImports(content, names) {
  let result = content;
  for (const name of names) {
    result = removeImport(result, name);
  }
  return result;
}

// Helper: rename variable
function renameVar(content, from, to) {
  return content.replace(new RegExp(`\\b${from}\\b`, 'g'), to);
}

// =========================================
// ServiceMatrix.tsx - remove unused lucide icons
// =========================================
{
  let c = readFile('pages/traffic/ServiceMatrix.tsx');
  c = removeImports(c, [
    'Database',
    'Bus',
    'Cloud',
    'RefreshCw',
    'Search',
    'ChevronRight',
    'FileText',
    'LayoutList',
  ]);
  writeFile('pages/traffic/ServiceMatrix.tsx', c);
}

// =========================================
// TransitSeeder.ts - remove unused imports
// =========================================
{
  let c = readFile('services/TransitSeeder.ts');
  c = removeImports(c, ['setDoc', 'query', 'where', 'getDoc']);
  // Remove unused type imports
  c = c.replace(
    "import type { DailyShift, ServiceDefinition, ScheduleMatrix } from '../types/traffic';",
    "import type { DailyShift, ServiceDefinition } from '../types/traffic';",
  );
  c = c.replace(
    "import type { ParsedData, ServiceData } from '../utils/ExcelParserV2';",
    "import type { ParsedData } from '../utils/ExcelParserV2';",
  );
  // Rename unused variable 'timestamp' to '_timestamp'
  c = c.replace('    const timestamp = new Date();', '    const _timestamp = new Date();');
  // Remove 'firstRow' unused (line 163 is used, line 153 firstRow is used - check context)
  writeFile('services/TransitSeeder.ts', c);
}

// =========================================
// AdminConfig.tsx - prefix unused error vars with _
// =========================================
{
  let c = readFile('pages/admin/AdminConfig.tsx');
  // catch (error) -> catch (_error) for unused error vars
  // Replace patterns where error is caught but not used meaningfully
  c = c.replace(/catch \(error\) \{(\s*\/\/ [^\n]*\s*)?\}/g, 'catch (_error) {}');
  // Replace `} catch (e) {` where e is unused
  c = c.replace(/\} catch \(e\) \{(\s*)\}/g, '} catch (_e) {$1}');
  writeFile('pages/admin/AdminConfig.tsx', c);
}

// =========================================
// AdminRRHH - remove Download icon, prefix unused catch vars
// =========================================
{
  let c = readFile('pages/admin/AdminRRHH.tsx');
  c = removeImports(c, ['Download']);
  // Fix catch (e) and catch (err) where unused
  c = c.replace(
    /\} catch \(e\) \{(\s*)(console\.(error|warn)|alert|setError)/g,
    '} catch (err) {$1$2',
  );
  writeFile('pages/admin/AdminRRHH.tsx', c);
}

// =========================================
// ExcelUploader.tsx - remove unused imports
// =========================================
{
  let c = readFile('components/ExcelUploader.tsx');
  c = removeImports(c, ['XLSX', 'FileSpreadsheet', 'AlertTriangle', 'Database', 'Server']);
  // The file says `import * as XLSX` - handle separately
  c = c.replace(/^import \* as XLSX from 'xlsx';\n/m, '');
  writeFile('components/ExcelUploader.tsx', c);
}

// =========================================
// TrafficReferenceService.ts - remove unused firestore imports and type
// =========================================
{
  let c = readFile('services/TrafficReferenceService.ts');
  c = removeImports(c, ['query', 'where', 'doc', 'updateDoc']);
  c = c.replace(/,?\s*ServiceData\b/g, '').replace(/\bServiceData\s*,?/g, '');
  writeFile('services/TrafficReferenceService.ts', c);
}

// =========================================
// ServiceVisualizer.tsx - remove unused firestore imports
// =========================================
{
  let c = readFile('components/ServiceVisualizer.tsx');
  c = removeImports(c, ['doc', 'getDoc', 'where', 'limit']);
  writeFile('components/ServiceVisualizer.tsx', c);
}

// =========================================
// AdminOrganization.tsx - check and fix
// =========================================
{
  const filePath = 'pages/admin/AdminOrganization.tsx';
  const lintData = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'lint_results_new.json'), 'utf8'),
  );
  const fileData = lintData.find((f) => f.filePath.includes('AdminOrganization'));
  if (fileData) {
    let c = readFile(filePath);
    const unusedVars = fileData.messages
      .filter((m) => m.ruleId === '@typescript-eslint/no-unused-vars')
      .map((m) => m.message.match(/'([^']+)'/)?.[1])
      .filter(Boolean);
    console.log('AdminOrganization unused:', unusedVars);
    c = removeImports(c, unusedVars);
    writeFile(filePath, c);
  }
}

// =========================================
// DataIngestion.tsx - fix unused vars
// =========================================
{
  const filePath = 'pages/admin/DataIngestion.tsx';
  const lintData = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'lint_results_new.json'), 'utf8'),
  );
  const fileData = lintData.find(
    (f) => f.filePath.includes('DataIngestion') && !f.filePath.includes('Legacy'),
  );
  if (fileData) {
    let c = readFile(filePath);
    const unusedImports = fileData.messages
      .filter((m) => m.ruleId === '@typescript-eslint/no-unused-vars' && m.line < 20)
      .map((m) => m.message.match(/'([^']+)'/)?.[1])
      .filter(Boolean);
    console.log('DataIngestion unused imports:', unusedImports);
    c = removeImports(c, unusedImports);
    writeFile(filePath, c);
  }
}

// =========================================
// DriverNavigation & BusNavigation - fix unused vars
// =========================================
['pages/driver/DriverNavigation.tsx', 'pages/driver/BusNavigation.tsx'].forEach((filePath) => {
  const lintData = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'lint_results_new.json'), 'utf8'),
  );
  const fileData = lintData.find((f) =>
    f.filePath.includes(path.basename(filePath).replace('.tsx', '')),
  );
  if (fileData) {
    let c = readFile(filePath);
    const unusedImports = fileData.messages
      .filter((m) => m.ruleId === '@typescript-eslint/no-unused-vars' && m.line < 25)
      .map((m) => m.message.match(/'([^']+)'/)?.[1])
      .filter(Boolean);
    if (unusedImports.length) {
      console.log(filePath, 'unused imports:', unusedImports);
      c = removeImports(c, unusedImports);
      writeFile(filePath, c);
    }
  }
});

// =========================================
// Other small files with 1-3 unused imports
// =========================================
const lintData = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'lint_results_new.json'), 'utf8'),
);

const smallFiles = [
  'components/ImageUploader.tsx',
  'components/UserList.tsx',
  'hooks/useCamera.ts',
  'pages/admin/rrhh/RotationManager.tsx',
  'components/RoadAlertsWidget.tsx',
  'components/admin/ConnectivityDebugWidget.tsx',
  'components/fleet/VehicleHistoryModal.tsx',
  'components/traffic/PersonalBulkUpload.tsx',
  'pages/admin/AdminCartones.tsx',
  'pages/admin/AppMaintenance.tsx',
  'pages/driver/NewReport.tsx',
  'pages/fleet/InspectionForm.tsx',
  'pages/talento/TalentCenter.tsx',
  'pages/traffic/ServiceStatistics.tsx',
  'services/DatabaseBootstrapper.ts',
  'services/IncidentService.ts',
  'services/trafficService.ts',
  'components/NotificationsDropdown.tsx',
  'components/Sidebar.tsx',
  'components/UniversalResourceManager.tsx',
  'components/admin/SystemHealthPanel.tsx',
  'components/operations/QuickDispatchPanel.tsx',
  'components/traffic/CartonFisicoView.tsx',
  'components/traffic/QuickSearchControl.tsx',
  'components/traffic/RouteMap.tsx',
  'config/firebase.ts',
  'hooks/useFirestoreCollection.ts',
  'hooks/useVersionCheck.ts',
  'pages/abl/ABLPage.tsx',
  'pages/abl/penalizations/RulesManager.tsx',
  'pages/admin/AdminStressTest.tsx',
  'pages/admin/MaintenanceDashboard.tsx',
  'pages/admin/SystemParamsPage.tsx',
  'pages/fleet/VehicleList.tsx',
  'pages/traffic/CartonDetail.tsx',
  'pages/traffic/DailyListManager.tsx',
  'pages/traffic/FleetMonitorModule.tsx',
  'pages/traffic/NavigationModule.tsx',
  'services/CompetitorIntelligence.ts',
  'services/ConnectivityGuard.ts',
  'services/SystemIntegrity.ts',
  'services/firestore/assignmentConflicts.ts',
  'services/firestore/departments.ts',
  'services/firestore/discounts.ts',
  'services/firestore/logsIncidencias.ts',
  'services/firestore/penalties.ts',
  'services/firestore/roadAlerts.ts',
  'simulation/ChaosEngine.ts',
  'utils/ExcelParserV2.ts',
  'utils/HRRotationParser.ts',
  'services/firestore/cartons.ts',
  'pages/admin/Employees.tsx',
  'pages/admin/UserManagement.tsx',
  'pages/admin/AdminConfig.tsx',
];

for (const relPath of smallFiles) {
  const absPath = path.join(SRC, relPath);
  if (!fs.existsSync(absPath)) continue;

  const fileData = lintData.find((f) =>
    f.filePath.includes(path.basename(relPath).replace('.tsx', '').replace('.ts', '')),
  );
  if (!fileData) continue;

  const unusedVars = fileData.messages
    .filter((m) => m.ruleId === '@typescript-eslint/no-unused-vars')
    .map((m) => ({ name: m.message.match(/'([^']+)'/)?.[1], line: m.line }))
    .filter((v) => v.name && v.line < 30); // Only import-level (first 30 lines)

  if (!unusedVars.length) continue;

  let c = fs.readFileSync(absPath, 'utf8');
  const names = unusedVars.map((v) => v.name);
  const original = c;
  c = removeImports(c, names);

  if (c !== original) {
    fs.writeFileSync(absPath, c, 'utf8');
    console.log('✅ Fixed imports in:', relPath, '(removed:', names.join(', ') + ')');
  }
}

console.log('\n🚀 Mass import fix complete!');
