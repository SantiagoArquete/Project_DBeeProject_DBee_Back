const express = require('express');
const router  = express.Router();
const cm      = require('../services/connectionManager');

router.get('/:id/schemas', async (req, res) => {
  try { res.json(await cm.getSchemas(req.params.id)); }
  catch (err) { res.status(400).json({ error: err.message }); }
});

router.get('/:id/tables', async (req, res) => {
  try { res.json(await cm.getTables(req.params.id, req.query.schema)); }
  catch (err) { res.status(400).json({ error: err.message }); }
});

router.get('/:id/columns', async (req, res) => {
  try { res.json(await cm.getColumns(req.params.id, req.query.schema, req.query.table)); }
  catch (err) { res.status(400).json({ error: err.message }); }
});

module.exports = router;
