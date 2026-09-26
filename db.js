const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const DB_PATH = path.join(__dirname, 'sentimentpulse.db');
const db = new sqlite3.Database(DB_PATH);

// Helper for promise-based queries
function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve({ id: this.lastID, changes: this.changes });
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

// Initialize tables and seed initial rows for testing
async function initDB() {
  await run('PRAGMA foreign_keys = ON;');

  // 1. Users table (id, username, email, created_at)
  await run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 2. Sentiment History table (id, user_id, text, label, score, timestamp)
  await run(`
    CREATE TABLE IF NOT EXISTS sentiment_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      text TEXT NOT NULL,
      label TEXT NOT NULL,
      score REAL NOT NULL,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    )
  `);

  // 3. Chatbot Logs table (id, user_id, prompt, response, timestamp)
  await run(`
    CREATE TABLE IF NOT EXISTS chatbot_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      prompt TEXT NOT NULL,
      response TEXT NOT NULL,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    )
  `);

  // 4. API Usage & Analytics table (id, user_id, endpoint, timestamp)
  await run(`
    CREATE TABLE IF NOT EXISTS api_usage (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      endpoint TEXT NOT NULL,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    )
  `);

  // Check if users table is empty; if so, populate dummy rows for testing
  const userCount = await get('SELECT COUNT(*) as count FROM users');
  if (userCount.count === 0) {
    console.log('Seeding initial SQLite database rows for testing...');

    // Seed Users
    const u1 = await run('INSERT INTO users (username, email, created_at) VALUES (?, ?, ?)',
      ['princel_tixeira', 'princel@sentimentpulse.ai', '2026-09-24 10:15:00']);
    const u2 = await run('INSERT INTO users (username, email, created_at) VALUES (?, ?, ?)',
      ['sarah_analyst', 'sarah.analyst@company.com', '2026-09-25 08:30:00']);
    const u3 = await run('INSERT INTO users (username, email, created_at) VALUES (?, ?, ?)',
      ['alex_product_mgr', 'alex.pm@company.com', '2026-09-25 14:45:00']);
    const u4 = await run('INSERT INTO users (username, email, created_at) VALUES (?, ?, ?)',
      ['elena_qa_lead', 'elena.qa@retailhq.com', '2026-09-26 09:00:00']);

    // Seed Sentiment History
    await run('INSERT INTO sentiment_history (user_id, text, label, score, timestamp) VALUES (?, ?, ?, ?, ?)',
      [u1.id, 'Super! great cooler excellent air flow and for this price its so amazing and unbelievable just love it', 'POSITIVE', 0.985, '2026-09-25 11:20:00']);
    await run('INSERT INTO sentiment_history (user_id, text, label, score, timestamp) VALUES (?, ?, ?, ?, ?)',
      [u2.id, 'Useless product, very bad product its only a noisy fan and leaked water everywhere!', 'NEGATIVE', 0.991, '2026-09-25 12:45:00']);
    await run('INSERT INTO sentiment_history (user_id, text, label, score, timestamp) VALUES (?, ?, ?, ?, ?)',
      [u3.id, 'Best cooler in this budget, air throw is superb and noise is very low even at high speed', 'POSITIVE', 0.964, '2026-09-25 16:10:00']);
    await run('INSERT INTO sentiment_history (user_id, text, label, score, timestamp) VALUES (?, ?, ?, ?, ?)',
      [u1.id, 'Defective piece received, motor stopped working in 3 days and service center refuses refund', 'NEGATIVE', 0.978, '2026-09-26 09:15:00']);
    await run('INSERT INTO sentiment_history (user_id, text, label, score, timestamp) VALUES (?, ?, ?, ?, ?)',
      [u4.id, 'The product quality is good but power of air is decent, okay for the price.', 'NEUTRAL', 0.550, '2026-09-26 10:05:00']);
    await run('INSERT INTO sentiment_history (user_id, text, label, score, timestamp) VALUES (?, ?, ?, ?, ?)',
      [u2.id, 'Box arrived damaged with a cracked water tank, worst delivery experience', 'NEGATIVE', 0.988, '2026-09-26 11:30:00']);

    // Seed Chatbot Logs
    await run('INSERT INTO chatbot_logs (user_id, prompt, response, timestamp) VALUES (?, ?, ?, ?)',
      [u1.id, 'The cooler stopped working after 2 days and water leaked all over the floor', 'Classified as NEGATIVE (99% confidence). Urgency: High. Category: Performance & Cooling. Recommended engineering tips: Reinforce ultrasonic weld seams, add silicone gaskets, and install acoustic vibration dampeners.', '2026-09-25 13:00:00']);
    await run('INSERT INTO chatbot_logs (user_id, prompt, response, timestamp) VALUES (?, ?, ?, ?)',
      [u2.id, 'Motor sound is very loud like a tractor running', 'Classified as NEGATIVE (96% confidence). Urgency: Medium. Category: Performance & Cooling. Recommended engineering tips: Install acoustic vibration dampening mounts on fan assembly.', '2026-09-25 17:22:00']);
    await run('INSERT INTO chatbot_logs (user_id, prompt, response, timestamp) VALUES (?, ?, ?, ?)',
      [u3.id, 'Super airflow and extremely silent, works like a charm!', 'Classified as POSITIVE (98% confidence). Urgency: Low. Category: Performance & Cooling. Benchmark product quality standard.', '2026-09-26 09:40:00']);
    await run('INSERT INTO chatbot_logs (user_id, prompt, response, timestamp) VALUES (?, ?, ?, ?)',
      [u4.id, 'Plastic quality is average and hinge feels delicate.', 'Classified as NEUTRAL (60% confidence). Urgency: Low. Category: Quality & Durability. Recommended tip: Transition fragile casing components to high-impact ABS / polycarbonate blend.', '2026-09-26 10:50:00']);

    // Seed API Usage
    await run('INSERT INTO api_usage (user_id, endpoint, timestamp) VALUES (?, ?, ?)',
      [u1.id, '/api/analyze', '2026-09-25 11:19:58']);
    await run('INSERT INTO api_usage (user_id, endpoint, timestamp) VALUES (?, ?, ?)',
      [u2.id, '/api/analyze', '2026-09-25 12:44:50']);
    await run('INSERT INTO api_usage (user_id, endpoint, timestamp) VALUES (?, ?, ?)',
      [u1.id, '/api/chat', '2026-09-25 12:59:55']);
    await run('INSERT INTO api_usage (user_id, endpoint, timestamp) VALUES (?, ?, ?)',
      [u3.id, '/api/dataset/batch', '2026-09-25 14:30:10']);
    await run('INSERT INTO api_usage (user_id, endpoint, timestamp) VALUES (?, ?, ?)',
      [u3.id, '/api/analyze', '2026-09-25 16:09:45']);
    await run('INSERT INTO api_usage (user_id, endpoint, timestamp) VALUES (?, ?, ?)',
      [u2.id, '/api/chat', '2026-09-25 17:21:50']);
    await run('INSERT INTO api_usage (user_id, endpoint, timestamp) VALUES (?, ?, ?)',
      [u1.id, '/api/upload-dataset', '2026-09-26 08:45:00']);
    await run('INSERT INTO api_usage (user_id, endpoint, timestamp) VALUES (?, ?, ?)',
      [u1.id, '/api/analyze', '2026-09-26 09:14:52']);
    await run('INSERT INTO api_usage (user_id, endpoint, timestamp) VALUES (?, ?, ?)',
      [u3.id, '/api/chat', '2026-09-26 09:39:50']);
    await run('INSERT INTO api_usage (user_id, endpoint, timestamp) VALUES (?, ?, ?)',
      [u4.id, '/api/analyze', '2026-09-26 10:04:48']);
    await run('INSERT INTO api_usage (user_id, endpoint, timestamp) VALUES (?, ?, ?)',
      [u4.id, '/api/chat', '2026-09-26 10:49:40']);
    await run('INSERT INTO api_usage (user_id, endpoint, timestamp) VALUES (?, ?, ?)',
      [u2.id, '/api/analyze', '2026-09-26 11:29:50']);

    console.log('Database seeded successfully with dummy records.');
  }
}

// Helper logging functions
async function logSentiment(userId, text, label, score) {
  try {
    return await run(
      'INSERT INTO sentiment_history (user_id, text, label, score) VALUES (?, ?, ?, ?)',
      [userId || null, text, label, score]
    );
  } catch (err) {
    console.error('Error logging sentiment to DB:', err.message);
  }
}

async function logChat(userId, prompt, response) {
  try {
    return await run(
      'INSERT INTO chatbot_logs (user_id, prompt, response) VALUES (?, ?, ?)',
      [userId || null, prompt, response]
    );
  } catch (err) {
    console.error('Error logging chat to DB:', err.message);
  }
}

async function logApiUsage(userId, endpoint) {
  try {
    return await run(
      'INSERT INTO api_usage (user_id, endpoint) VALUES (?, ?)',
      [userId || null, endpoint]
    );
  } catch (err) {
    console.error('Error logging API usage to DB:', err.message);
  }
}

async function recordUser(username, email) {
  try {
    const existing = await get('SELECT id FROM users WHERE email = ?', [email]);
    if (existing) return existing.id;
    const res = await run('INSERT INTO users (username, email) VALUES (?, ?)', [username, email]);
    return res.id;
  } catch (err) {
    console.error('Error recording user in DB:', err.message);
    return null;
  }
}

module.exports = {
  db,
  run,
  all,
  get,
  initDB,
  logSentiment,
  logChat,
  logApiUsage,
  recordUser
};
