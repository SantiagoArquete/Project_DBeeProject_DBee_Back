const express = require('express');
const router  = express.Router();
const cm      = require('../services/connectionManager');

/* ── Execute raw SQL ────────────────────────────────────── */
router.post('/execute', async (req, res) => {
  const { connectionId, sql } = req.body;
  if (!connectionId || !sql) return res.status(400).json({ error: 'connectionId e sql são obrigatórios' });

  try {
    // Split on semicolons, run each non-empty statement
    const stmts = sql.split(';').map(s => s.trim()).filter(Boolean);
    if (stmts.length <= 1) {
      return res.json(await cm.executeQuery(connectionId, sql));
    }
    const results = [];
    for (const s of stmts) results.push(await cm.executeQuery(connectionId, s));
    res.json({ multipleResults: results, rowCount: results.length });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/* ── Paginated table read ────────────────────────────────── */
router.get('/table/:connectionId', async (req, res) => {
  const { connectionId } = req.params;
  const { schema, table, page = 1, pageSize = 100, orderBy, orderDir = 'ASC' } = req.query;
  if (!schema || !table) return res.status(400).json({ error: 'schema e table são obrigatórios' });

  try {
    const conn    = cm._get(connectionId);
    const offset  = (parseInt(page) - 1) * parseInt(pageSize);
    const safeDir = orderDir === 'DESC' ? 'DESC' : 'ASC';

    // Build table reference
    const q   = (s) => conn.type === 'mysql' ? `\`${s}\`` : `"${s}"`;
    const ref  = conn.type === 'sqlite' ? q(table) : `${q(schema)}.${q(table)}`;
    const ord  = orderBy ? `ORDER BY ${q(orderBy)} ${safeDir}` : '';

    let countSql, dataSql;
    if (conn.type === 'mysql') {
      countSql = `SELECT COUNT(*) AS total FROM ${ref}`;
      dataSql  = `SELECT * FROM ${ref} ${ord} LIMIT ${pageSize} OFFSET ${offset}`;
    } else {
      countSql = `SELECT COUNT(*) AS total FROM ${ref}`;
      dataSql  = `SELECT * FROM ${ref} ${ord} LIMIT ${pageSize} OFFSET ${offset}`;
    }

    const [cntRes, dataRes] = await Promise.all([
      cm.executeQuery(connectionId, countSql),
      cm.executeQuery(connectionId, dataSql),
    ]);

    const total = parseInt(
      cntRes.rows[0]?.total ?? cntRes.rows[0]?.count ?? 0
    );

    res.json({
      rows:       dataRes.rows,
      fields:     dataRes.fields,
      total,
      page:       parseInt(page),
      pageSize:   parseInt(pageSize),
      totalPages: Math.ceil(total / parseInt(pageSize)),
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/* ── Insert ─────────────────────────────────────────────── */
router.post('/table/:connectionId/row', async (req, res) => {
  const { connectionId } = req.params;
  const { schema, table, data } = req.body;
  try {
    res.json({ success: true, result: await cm.insertRow(connectionId, schema, table, data) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/* ── Update ─────────────────────────────────────────────── */
router.put('/table/:connectionId/row', async (req, res) => {
  const { connectionId } = req.params;
  const { schema, table, data, where } = req.body;
  try {
    res.json({ success: true, result: await cm.updateRow(connectionId, schema, table, data, where) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/* ── Delete ─────────────────────────────────────────────── */
router.delete('/table/:connectionId/row', async (req, res) => {
  const { connectionId } = req.params;
  const { schema, table, where } = req.body;
  try {
    res.json({ success: true, result: await cm.deleteRow(connectionId, schema, table, where) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
