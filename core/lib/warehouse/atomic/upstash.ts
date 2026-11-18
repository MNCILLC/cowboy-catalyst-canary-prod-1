import 'server-only';

import { Redis } from '@upstash/redis';
import { z } from 'zod';

import { AtomicWarehousePersistence } from './persistence';

// Explicit opt-in; never reads environment variables or registers a live provider.
export function createUpstashWarehousePersistence(options: {
  url: string;
  token: string;
  namespace: string;
  timeoutMs?: number;
  maxOperations?: number;
}) {
  const url = z.string().url().startsWith('https://').parse(options.url);
  const token = z.string().min(1).parse(options.token);
  const timeoutMs = z
    .number()
    .int()
    .min(100)
    .max(30000)
    .parse(options.timeoutMs ?? 5000);

  return new AtomicWarehousePersistence(
    {
      eval: (script, keys, args) => {
        // Fresh deadline per operation; no process-local record cache or auto-pipeline.
        const redis = new Redis({
          url,
          token,
          retry: false,
          enableAutoPipelining: false,
          automaticDeserialization: false,
          enableTelemetry: false,
          cache: 'no-store',
          signal: AbortSignal.timeout(timeoutMs),
        });

        return redis.eval(script, keys, args);
      },
    },
    { namespace: options.namespace, maxOperations: options.maxOperations },
  );
}
