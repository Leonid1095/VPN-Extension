import 'node:process';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { config } from './lib/config.js';
import './lib/db.js'; // инициализация
import ordersRoute from './routes/orders.js';
import profileRoute from './routes/profile.js';
import donatepayWebhook from './routes/donatepay-webhook.js';

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

try {
    await app.listen({ port: config.port, host: config.host });
    app.log.info(`PLGames Connect API listening on :${config.port}`);
} catch (err) {
    app.log.error(err);
    process.exit(1);
}
