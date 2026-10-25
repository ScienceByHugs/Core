const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
function load(file) {
 const source = fs.readFileSync(path.join(__dirname, '../expo/src/services/', file), 'utf8');
 const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
 const context = { exports: {}, require: () => ({}), Error, Date, Math, Set };
 vm.runInNewContext(code, context); return context.exports;
}
const model = load('research-model.ts');
const row = (over = {}) => ({ id: 'a-1', status: 'pending', institution_name: 'Test University', department: null, role_title: 'Postdoc',
 principal_investigator: 'Dr. Example', institutional_email: 'p@test.edu', email_domain: 'test.edu', research_summary: 'x'.repeat(40),
 document_path: null, terms_version: '2026-10-25', free_domain_override: false, submitted_at: '2026-10-25T12:00:00Z',
 reviewed_at: null, decision_reason: null, expires_at: null, ...over });

test('applications are validated and malformed responses are refused', () => {
 assert.equal(model.validateApplications({ applications: [row()] }).length, 1);
 assert.throws(() => model.validateApplications({}), /unexpected response/);
 assert.throws(() => model.validateApplications({ applications: [row({ status: 'maybe' })] }), /incomplete/);
 assert.throws(() => model.validateApplications({ applications: [row({ institutional_email: '' })] }), /incomplete/);
});

test('review rules match the database: reason to deny, override for webmail, pending only', () => {
 assert.equal(model.decisionProblem(row(), 'approved', '', false), null);
 assert.match(model.decisionProblem(row(), 'denied', ' no ', false), /reason/);
 assert.equal(model.decisionProblem(row(), 'denied', 'Could not confirm the lab.', false), null);
 assert.match(model.decisionProblem(row({ email_domain: 'gmail.com' }), 'approved', '', false), /personal email/);
 assert.equal(model.decisionProblem(row({ email_domain: 'Gmail.com' }), 'approved', '', true), null);
 assert.match(model.decisionProblem(row({ status: 'approved' }), 'denied', 'Second look', false), /waiting/);
});

const migration = path.join(__dirname, '../supabase/migrations/20261025200000_research_verification.sql');
test('webmail list stays in step with the database function', { skip: !fs.existsSync(migration) && 'runs once the research migration (Core #14) is on this branch' }, () => {
 const sql = fs.readFileSync(migration, 'utf8');
 const db = [...sql.match(/is_free_email_domain\(p_domain text\)[\s\S]*?array\[([\s\S]*?)\]/)[1].matchAll(/'([^']+)'/g)].map(m => m[1]);
 assert.ok(db.length > 20);
 for (const domain of db) assert.equal(model.isFreeEmailDomain(domain), true, domain);
 assert.equal(model.isFreeEmailDomain('unlv.edu'), false);
});

test('days left counts up to expiry and goes negative after', () => {
 const now = new Date('2026-10-25T00:00:00Z');
 assert.equal(model.daysLeft('2026-11-04T00:00:00Z', now), 10);
 assert.ok(model.daysLeft('2026-10-20T00:00:00Z', now) < 0);
 assert.equal(model.daysLeft(null, now), null);
});
