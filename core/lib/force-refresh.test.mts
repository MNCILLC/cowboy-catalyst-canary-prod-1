import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';

import ts from 'typescript';

// Run the real server flag and client consumer with cookie/navigation boundaries mocked.
function harness(initialValue?: string) {
  const cookies = new Map<string, string>();
  if (initialValue !== undefined) cookies.set('force-refresh', initialValue);
  let pathname = '/account/orders';
  let searchParams = new URLSearchParams();
  let previousDependencies: unknown[] | undefined;
  let refreshes = 0;
  const router = {
    refresh: () => {
      assert.equal(cookies.has('force-refresh'), false, 'Consume the flag before refreshing');
      refreshes += 1;
    },
  };
  const dependencies: Record<string, unknown> = {
    'next/headers': {
      cookies: async () => ({
        get: (name: string) => (cookies.has(name) ? { value: cookies.get(name) } : undefined),
        set: (name: string, value: string, options: { path: string; httpOnly: boolean }) => {
          assert.equal(
            options.path,
            '/',
            'The refresh flag must apply to every logout destination',
          );
          assert.equal(options.httpOnly, false);
          cookies.set(name, value);
        },
        delete: (name: string) => cookies.delete(name),
      }),
    },
    'next/navigation': {
      useSearchParams: () => searchParams,
    },
    '~/i18n/routing': { usePathname: () => pathname, useRouter: () => router },
    react: {
      useEffect: (effect: () => void, nextDependencies?: unknown[]) => {
        if (
          !nextDependencies ||
          !previousDependencies ||
          nextDependencies.some((value, index) => value !== previousDependencies?.[index])
        ) {
          effect();
        }
        previousDependencies = nextDependencies;
      },
    },
  };
  function load(path: string) {
    const code = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const exports: any = {};
    runInNewContext(code, {
      exports,
      require: (name: string) => {
        assert.ok(name in dependencies, `Unexpected dependency ${name}`);
        return dependencies[name];
      },
      document: {
        get cookie() {
          return [...cookies].map(([name, value]) => `${name}=${value}`).join('; ');
        },
        set cookie(value: string) {
          const [pair] = value.split(';');
          const [name, content] = pair!.split('=');
          assert.ok(name);
          if (value.includes('Max-Age=0')) cookies.delete(name);
          else cookies.set(name, content ?? '');
        },
      },
    });
    return exports;
  }
  const clientCookies = load('./client-cookies.ts');
  dependencies['./client-cookies'] = clientCookies;
  dependencies['~/lib/client-cookies'] = clientCookies;
  const server = load('./force-refresh.ts');
  const client = load('../components/force-refresh/index.tsx');
  return {
    logout: server.setForceRefreshCookie as () => Promise<void>,
    render: () => client.ForceRefresh(),
    navigate: (url: string) => {
      const destination = new URL(url, 'https://store.example');
      pathname = destination.pathname;
      searchParams = destination.searchParams;
      client.ForceRefresh();
    },
    get refreshes() {
      return refreshes;
    },
  };
}

test('logout refreshes even when an older session left a false flag', async () => {
  for (const value of [undefined, 'false', 'true']) {
    const h = harness(value);
    await h.logout();
    h.navigate('/login');
    assert.equal(h.refreshes, 1);
    h.render();
    h.navigate('/product/1603');
    assert.equal(h.refreshes, 1, 'Consumed signals must not cause further refreshes');
  }
});

test('every logout refreshes the persistent layout, including custom redirect destinations', async () => {
  const h = harness();
  h.render();
  let expectedRefreshes = 0;
  for (const destination of [
    '/login',
    '/product/1603',
    '/login',
    '/cart',
    '/login?redirectTo=/cart',
  ]) {
    h.navigate('/account/orders');
    await h.logout();
    h.navigate(destination);
    expectedRefreshes += 1;
    assert.equal(h.refreshes, expectedRefreshes);
  }
});

test('ordinary navigation never refreshes the layout without a logout signal', () => {
  const h = harness();
  h.render();
  h.navigate('/product/1603');
  h.navigate('/login');
  h.navigate('/login?redirectTo=/cart');
  assert.equal(h.refreshes, 0);
});
