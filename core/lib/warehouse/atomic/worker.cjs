const { loadAdapter, redisClient } = require('./test-support.cjs');

const { AtomicWarehousePersistence } = loadAdapter();

global.fetch = () => {
  throw new Error('HTTP is prohibited in atomic persistence tests');
};

const client = redisClient(process.env.ATOMIC_TEST_REDIS_CLI, process.env.ATOMIC_TEST_SOCKET);
const adapter = new AtomicWarehousePersistence(client, { namespace: 'synthetic-warehouse-test' });
let armed;

process.on('message', async ({ id, action, payload }) => {
  try {
    let result;

    if (action === 'arm') {
      armed = payload;

      const { storeHash, channelId, cartId } = payload;

      result = { pid: process.pid, observed: await adapter.read({ storeHash, channelId, cartId }) };
    } else if (action === 'release') {
      if (!armed) throw new Error('Worker was not armed');

      const request = armed;

      armed = undefined;
      result = await adapter.compareAndSet(request);
    } else if (action === 'read') result = await adapter.read(payload);
    else if (action === 'select') result = await adapter.compareAndSet(payload);
    else if (action === 'exitBefore') process.exit(85);
    else if (action === 'exitAfterCommit') {
      await adapter.compareAndSet(payload);
      process.exit(86);
    } else if (action === 'lostResponse') {
      const uncertain = new AtomicWarehousePersistence(
        {
          eval: async (...args) => {
            await client.eval(...args);
            throw new Error('Simulated response loss after Redis commit');
          },
        },
        { namespace: 'synthetic-warehouse-test' },
      );

      result = await uncertain.compareAndSet(payload);
    } else throw new Error('Unknown worker action');
    process.send({ id, ok: true, result });
  } catch (error) {
    process.send({
      id,
      ok: false,
      error: { code: error.code, status: error.status, message: error.message },
    });
  }
});
process.send({ ready: true, pid: process.pid });
