import 'node:process';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { config } from './lib/config.js';
import { purgeOldOrders } from './lib/db.js'; // named import также инициализирует БД
import ordersRoute from './routes/orders.js';
import profileRoute from './routes/profile.js';
import donatepayWebhook from './routes/donatepay-webhook.js';
import internalRoute from './routes/internal.js';
import { startDonatepayPoller } from './lib/donatepay-poller.js';

const app = Fastify({
    logger: {
        level: process.env.LOG_LEVEL || 'info',
        transport:
            process.env.NODE_ENV !== 'production'
                ? { target: 'pino-pretty', options: { colorize: true } }
                : undefined,
    },
    bodyLimit: 100_000,
    trustProxy: true,
});

await app.register(cors, {
    // в проде ставь allowed origin (chrome-extension://<id>) или просто '*' для расширения
    origin: true,
    credentials: false,
});

await app.register(rateLimit, {
    max: 60,
    timeWindow: '1 minute',
    allowList: [],
});

app.get('/healthz', async () => ({ ok: true, ts: Date.now() }));

await app.register(ordersRoute);
await app.register(profileRoute);
await app.register(donatepayWebhook);
await app.register(internalRoute);

try {
    await app.listen({ port: config.port, host: config.host });
    app.log.info(`PLGames Connect API listening on :${config.port}`);
    startDonatepayPoller(app);

    // Периодическая очистка старых неоплаченных заказов (раз в час).
    const purgeTick = () => {
        try {
            const n = purgeOldOrders();
            if (n > 0) app.log.info({ purged: n }, 'purged old orders');
        } catch (e) {
            app.log.warn({ err: String(e) }, 'order purge failed');
        }
    };
    purgeTick();
    setInterval(purgeTick, 60 * 60 * 1000).unref?.();
} catch (err) {
    app.log.error(err);
    process.exit(1);
}
