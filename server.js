const express = require('express');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 10000;

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Environment variables
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'default-admin-token';

// In-memory key storage
let keys = {};

// Helper: Generate random key
function generateKey() {
  return 'ECLIPSE-' + Math.random().toString(36).substr(2, 9).toUpperCase();
}

// Helper: Validate key format
function isValidKey(key) {
  return typeof key === 'string' && key.startsWith('ECLIPSE-');
}

// Routes

// Serve index.html
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Public: Generate a new key
app.post('/api/keys/public-generate', (req, res) => {
  const newKey = generateKey();
  keys[newKey] = { status: 'unclaimed', createdAt: new Date() };
  res.json({ key: newKey });
});

// Public: Claim a key
app.post('/api/keys/claim', (req, res) => {
  const { key, username } = req.body;
  if (!isValidKey(key) || !keys[key]) {
    return res.status(400).json({ error: 'Invalid key' });
  }
  if (keys[key].status === 'claimed') {
    return res.status(400).json({ error: 'Key already claimed' });
  }
  keys[key].status = 'claimed';
  keys[key].username = username;
  keys[key].claimedAt = new Date();
  res.json({ message: 'Key claimed successfully', key: keys[key] });
});

// Public: Check key status
app.get('/api/keys/check', (req, res) => {
  const { key } = req.query;
  if (!isValidKey(key) || !keys[key]) {
    return res.status(400).json({ error: 'Invalid key' });
  }
  res.json({ key, status: keys[key].status });
});

// Admin: Generate key
app.post('/api/keys/generate', (req, res) => {
  const { token } = req.body;
  if (token !== ADMIN_TOKEN) {
    return res.status(403).json({ error: 'Unauthorized' });
  }
  const newKey = generateKey();
  keys[newKey] = { status: 'unclaimed', createdAt: new Date() };
  res.json({ key: newKey });
});

// Admin: Delete key
app.post('/api/keys/delete', (req, res) => {
  const { token, key } = req.body;
  if (token !== ADMIN_TOKEN) {
    return res.status(403).json({ error: 'Unauthorized' });
  }
  if (!isValidKey(key) || !keys[key]) {
    return res.status(400).json({ error: 'Invalid key' });
  }
  delete keys[key];
  res.json({ message: 'Key deleted' });
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date() });
});

// 404 handler for unknown API routes
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'API route not found' });
});

// Catch-all for non-API routes (serve index.html)
app.get(/.*/, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
app.listen(PORT, () => {
  console.log(`Eclipse Hub Key System running on port ${PORT}`);
});
