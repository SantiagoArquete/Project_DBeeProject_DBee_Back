require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

const connectionsRouter = require('./routes/connections');
const queryRouter      = require('./routes/query');
const schemaRouter     = require('./routes/schema');

const app  = express();
const PORT = process.env.PORT || 3001;

/* ── Middleware ─────────────────────────────────────────── */
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));
app.use(morgan('dev'));
app.use(express.json({ limit: '10mb' }));

/* ── Routes ─────────────────────────────────────────────── */
app.use('/api/connections', connectionsRouter);
app.use('/api/query',       queryRouter);
app.use('/api/schema',      schemaRouter);

app.get('/api/health', (_req, res) =>
  res.json({ status: 'ok', ts: new Date().toISOString() })
);

/* ── Error handler ──────────────────────────────────────── */
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Internal Server Error' });
});

app.listen(PORT, () =>
  console.log(`🚀  DBClient API  →  http://localhost:${PORT}`)
);

module.exports = app;
