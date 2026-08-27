// Сборка Express-приложения без запуска сервера: index.js слушает порт,
// а тесты поднимают то же приложение на произвольном порту.

import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import { adminRouter } from './admin.js';
import { analyticsRouter } from './analytics.js';
import { authRouter } from './auth.js';
import { catalogRouter } from './catalog.js';
import { pool } from './db.js';
import { meRouter } from './me.js';
import { plansRouter } from './plans.js';
import { settingsRouter } from './settings.js';
import { studentsRouter } from './students.js';

export function createApp() {
  const app = express();

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
  app.use('/api/me', meRouter);
  app.use('/api/admin/analytics', analyticsRouter);
  app.use('/api/admin/students', studentsRouter);
  app.use('/api/admin/settings', settingsRouter);
  app.use('/api/admin', plansRouter);
  app.use('/api/admin', adminRouter);
  app.use('/api/catalog', catalogRouter);

  return app;
}
