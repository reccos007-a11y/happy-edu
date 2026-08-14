import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import { adminRouter } from './admin.js';
import { authRouter } from './auth.js';
import { pool } from './db.js';
import { initSchema } from './schema.js';

const app = express();
const port = process.env.PORT || 3000;

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(cookieParser());

app.get('/api/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', db: 'connected' });
  } catch (err) {
    res.status(500).json({ status: 'error', db: 'disconnected', error: err.message });
  }
});

app.get('/api/hello', (_req, res) => {
  res.json({ message: 'Hello from backend' });
});

app.use('/api/auth', authRouter);
app.use('/api/admin', adminRouter);

initSchema()
  .then(() => {
    app.listen(port, () => {
      console.log(`Backend listening on port ${port}`);
    });
  })
  .catch((err) => {
    console.error('Не удалось инициализировать схему БД:', err);
    process.exit(1);
  });
