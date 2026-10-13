import { describe, it, expect } from 'vitest';

/**
 * Static contract tests for supabase/migrations/20261013_security_hardening.sql.
 *
 * The migration is applied by hand in the Supabase SQL editor, so nothing else
 * would notice if a later edit re-introduced the "trust p_actor_id" admin hole
 * or renamed an RPC parameter that the client sends by name.
 */
const MIGRATION_PATH = '/supabase/migrations/20261013_security_hardening.sql';

const migrations = import.meta.glob<string>('/supabase/migrations/*.sql', {
  query: '?raw',
  import: 'default',
  eager: true,
});

const clientSources = import.meta.glob<string>(['/src/**/*.ts', '/src/**/*.tsx', '!/src/**/*.test.ts', '!/src/**/*.test.tsx'], {
  query: '?raw',
  import: 'default',
  eager: true,
});

interface SqlFunction {
  name: string;
  params: string[];
  header: string;
  body: string;
}

/** Extracts `CREATE OR REPLACE FUNCTION public.x(...) RETURNS ... AS $$ body $$;` blocks. */
function parseSqlFunctions(sql: string): SqlFunction[] {
  const re = /CREATE OR REPLACE FUNCTION public\.(\w+)\(([\s\S]*?)\)\s*RETURNS ([\s\S]*?)\nAS \$\$\n([\s\S]*?)\n\$\$;/g;
  const result: SqlFunction[] = [];
  for (const m of sql.matchAll(re)) {
    const params = m[2]
      .split(',')
      .map((p) => p.trim().split(/\s+/)[0])
      .filter((p) => p.length > 0);
    result.push({ name: m[1], params, header: m[3], body: m[4] });
  }
  return result;
}

/** Extracts `.rpc('name', { key: ... })` calls and the argument keys the client sends. */
function parseRpcCalls(source: string): { name: string; keys: string[] }[] {
  const re = /\.rpc\(\s*'(\w+)'\s*(?:,\s*\{([^}]*)\})?/g;
  const calls: { name: string; keys: string[] }[] = [];
  for (const m of source.matchAll(re)) {
    const keys = [...(m[2] ?? '').matchAll(/(?:^|[{,])\s*(\w+)\s*:/g)].map((k) => k[1]);
    calls.push({ name: m[1], keys });
  }
  return calls;
}

const sql = migrations[MIGRATION_PATH] ?? '';
const functions = parseSqlFunctions(sql);
const byName = new Map(functions.map((f) => [f.name, f]));

const ADMIN_RPCS = [
  'admin_grant_stars',
  'admin_set_pro',
  'admin_set_ban',
  'admin_set_role',
  'admin_remove_role',
  'admin_get_kpis',
  'admin_get_users',
];

describe('parsers', () => {
  it('parseSqlFunctions reads name, params, header and body', () => {
    const fns = parseSqlFunctions(
      'CREATE OR REPLACE FUNCTION public.f(a uuid, b text DEFAULT NULL)\nRETURNS void\nLANGUAGE sql\nAS $$\n  SELECT 1;\n$$;',
    );
    expect(fns).toEqual([{ name: 'f', params: ['a', 'b'], header: 'void\nLANGUAGE sql', body: '  SELECT 1;' }]);
  });

  it('parseRpcCalls reads rpc names and argument keys', () => {
    const calls = parseRpcCalls(
      "await supabase.rpc('x', { p_a: 1, p_b: opts.b ?? null });\nawait supabase.rpc('y');",
    );
    expect(calls).toEqual([
      { name: 'x', keys: ['p_a', 'p_b'] },
      { name: 'y', keys: [] },
    ]);
  });
});

describe('20261013_security_hardening.sql', () => {
  it('exists and runs in a single transaction', () => {
    expect(sql.length).toBeGreaterThan(0);
    expect(sql).toMatch(/^BEGIN;$/m);
    expect(sql.trimEnd().endsWith('COMMIT;')).toBe(true);
  });

  it('never drops or truncates tables', () => {
    const code = sql.replace(/--[^\n]*/g, '');
    expect(code).not.toMatch(/\bDROP\s+TABLE\b/i);
    expect(code).not.toMatch(/\bTRUNCATE\b/i);
  });

  it.each(ADMIN_RPCS)('%s authorises the session user, not the client-supplied actor id', (name) => {
    const fn = byName.get(name);
    expect(fn, `${name} must be (re)defined by the migration`).toBeDefined();
    expect(fn.params[0]).toBe('p_actor_id');
    expect(fn.body).toMatch(/jf_assert_staff\(p_actor_id,/);
    expect(fn.body).not.toMatch(/(get_user_role|is_admin|jf_staff_role)\(p_actor_id\)/);
    expect(fn.body).not.toMatch(/WHERE\s+\w*\.?id\s*=\s*p_actor_id/);
  });

  it.each(ADMIN_RPCS)('%s is not executable by PUBLIC/anon', (name) => {
    expect(sql).toMatch(new RegExp(`REVOKE ALL ON FUNCTION public\\.${name}\\([^)]*\\)\\s+FROM PUBLIC, anon;`));
    expect(sql).toMatch(new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${name}\\([^)]*\\)\\s+TO authenticated, service_role;`));
  });

  it('pins search_path on every SECURITY DEFINER function', () => {
    const definers = functions.filter((f) => /SECURITY DEFINER/.test(f.header));
    expect(definers.length).toBeGreaterThanOrEqual(ADMIN_RPCS.length);
    for (const fn of definers) {
      expect(fn.header, fn.name).toMatch(/SET search_path = /);
    }
  });

  it('guard trigger functions run as the invoker (current_user must reflect the API role)', () => {
    for (const name of ['jf_guard_user_profiles', 'jf_guard_stars_ledger']) {
      const fn = byName.get(name);
      expect(fn, name).toBeDefined();
      expect(fn.header).not.toMatch(/SECURITY DEFINER/);
      expect(fn.body).toMatch(/current_user NOT IN \('anon', 'authenticated'\)/);
    }
  });

  it('keeps every RPC parameter name the client sends', () => {
    const calls = Object.values(clientSources).flatMap(parseRpcCalls);
    const covered = calls.filter((c) => byName.has(c.name));
    // adminService + use-full-access call these by named arguments.
    expect(covered.map((c) => c.name)).toEqual(expect.arrayContaining([...ADMIN_RPCS, 'get_user_role']));
    for (const call of covered) {
      const params = byName.get(call.name).params;
      for (const key of call.keys) {
        expect(params, `${call.name} must accept "${key}"`).toContain(key);
      }
    }
  });
});
