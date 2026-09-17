const express = require('express');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 10000;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'your-secure-token-here';

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// In-memory key storage (replace with database in production)
const keys = new Map();

// Helper: Generate a random key
function generateKey() {
  return `ECLIPSE-${Math.random().toString(36).substring(2, 15)}${Math.random().toString(36).substring(2, 15)}`.toUpperCase();
}

// Helper: Validate admin token
function validateAdminToken(token) {
  return token === ADMIN_TOKEN;
}

// Routes

// Serve index.html on root
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Public: Generate a key (limited)
app.post('/api/keys/public-generate', (req, res) => {
  const key = generateKey();
  keys.set(key, { claimed: false, createdAt: new Date() });
  res.json({ success: true, key });
});

// Public: Claim/validate a key
app.post('/api/keys/claim', (req, res) => {
  const { key } = req.body;
  if (!key) {
    return res.status(400).json({ success: false, message: 'Key is required' });
  }

  const keyData = keys.get(key);
  if (!keyData) {
    return res.status(404).json({ success: false, message: 'Key not found' });
  }

  if (keyData.claimed) {
    return res.status(409).json({ success: false, message: 'Key already claimed' });
  }

  keyData.claimed = true;
  keyData.claimedAt = new Date();
  res.json({ success: true, message: 'Key claimed successfully' });
});

// Public: Check key status
app.get('/api/keys/check', (req, res) => {
  const { key } = req.query;
  if (!key) {
    return res.status(400).json({ success: false, message: 'Key is required' });
  }

  const keyData = keys.get(key);
  if (!keyData) {
    return res.status(404).json({ success: false, message: 'Key not found' });
  }

  res.json({ 
    success: true, 
    key,
    claimed: keyData.claimed,
    createdAt: keyData.createdAt,
    claimedAt: keyData.claimedAt || null
  });
});

// Admin: Generate keys
app.post('/api/keys/generate', (req, res) => {
  const { token, count = 1 } = req.body;

  if (!validateAdminToken(token)) {
    return res.status(403).json({ success: false, message: 'Unauthorized' });
  }

  const generatedKeys = [];
  for (let i = 0; i < count; i++) {
    const key = generateKey();
    keys.set(key, { claimed: false, createdAt: new Date() });
    generatedKeys.push(key);
  }

  res.json({ success: true, keys: generatedKeys });
});

// Admin: Delete a key
app.post('/api/keys/delete', (req, res) => {
  const { token, key } = req.body;

  if (!validateAdminToken(token)) {
    return res.status(403).json({ success: false, message: 'Unauthorized' });
  }

  if (!key) {
    return res.status(400).json({ success: false, message: 'Key is required' });
  }

  if (keys.has(key)) {
    keys.delete(key);
    res.json({ success: true, message: 'Key deleted' });
  } else {
    res.status(404).json({ success: false, message: 'Key not found' });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date() });
});

// 404 handler for unknown API routes
app.use('/api', (req, res) => {
  res.status(404).json({ success: false, message: 'API endpoint not found' });
});

// Catch-all for other routes (serve index.html for SPA support)
app.get(/.*/, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Error handling
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ success: false, message: 'Internal server error' });
});

// Start server
app.listen(PORT, () => {
  console.log(`Eclipse Hub Key System running on port ${PORT}`);
});
