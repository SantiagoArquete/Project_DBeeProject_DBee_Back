const express = require('express');
const router  = express.Router();
const cm      = require('../services/connectionManager');

router.get('/', (_req, res) => res.json(cm.listConnections()));

router.post('/test', async (req, res) => {
  try {
    const r = await cm.createConnection(req.body);
    await cm.closeConnection(r.id);
    res.json({ success: true, message: 'Conexão bem-sucedida!' });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const r = await cm.createConnection(req.body);
    res.status(201).json(r);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  await cm.closeConnection(req.params.id).catch(() => {});
  res.json({ success: true });
});

module.exports = router;
