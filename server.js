require('dotenv').config();
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const readline = require('readline');
const { HfInference } = require('@huggingface/inference');
const SentimentLocal = require('sentiment');

const app = express();
const PORT = process.env.PORT || 3000;
const localSentiment = new SentimentLocal();

// Configure Multer for in-memory file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 } // 25MB limit
});

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Initialize Hugging Face Inference
const hfApiKey = process.env.HUGGINGFACE_API_KEY;
const hf = hfApiKey ? new HfInference(hfApiKey) : null;
const HF_MODEL = 'distilbert/distilbert-base-uncased-finetuned-sst-2-english';

// Topic definition taxonomy
const TOPIC_KEYWORDS = {
  'Quality & Durability': ['quality', 'defect', 'broke', 'broken', 'durable', 'durability', 'delicate', 'build', 'material', 'plastic', 'sturdy', 'cheap', 'crack'],
  'Performance & Cooling': ['power', 'speed', 'cooling', 'cool', 'fan', 'noise', 'sound', 'loud', 'defrost', 'flow', 'battery', 'charge', 'working', 'air', 'motor', 'heat'],
  'Pricing & Value': ['price', 'budget', 'worth', 'value', 'cost', 'expensive', 'money', 'deal', 'discount', 'affordable', 'waste'],
  'Design & Build': ['look', 'looks', 'design', 'color', 'size', 'compact', 'interior', 'fit', 'finish', 'style', 'appearance', 'space'],
  'Packaging & Delivery': ['delivery', 'package', 'packaging', 'box', 'damaged', 'late', 'arrive', 'shipping', 'courier', 'fast'],
  'Customer Support': ['support', 'service', 'warranty', 'replace', 'replacement', 'refund', 'return', 'help', 'response', 'care']
};

// Urgency keywords
const HIGH_URGENCY_KEYWORDS = [
  'worst', 'terrible', 'horrible', 'damaged', 'scam', 'broken', 'danger',
  'hazardous', 'useless', 'disaster', 'refund', 'poor', 'defective', 'cheat',
  'pathetic', 'fraud', 'fire', 'shock', 'waste of money'
];

// Helper: Determine Topic from Text
function detectTopic(text) {
  const lower = (text || '').toLowerCase();
  for (const [topic, words] of Object.entries(TOPIC_KEYWORDS)) {
    if (words.some(w => lower.includes(w))) {
      return topic;
    }
  }
  return 'General Feedback';
}

// Helper: Determine Urgency
function detectUrgency(sentimentLabel, score, text, rating) {
  const lower = (text || '').toLowerCase();
  const hasUrgentKeyword = HIGH_URGENCY_KEYWORDS.some(w => lower.includes(w));
  const isNumericLow = rating && Number(rating) <= 1;

  if (sentimentLabel === 'NEGATIVE' && (score >= 0.85 || hasUrgentKeyword || isNumericLow)) {
    return 'High';
  }
  if (sentimentLabel === 'NEGATIVE' || (rating && Number(rating) <= 2) || hasUrgentKeyword) {
    return 'Medium';
  }
  return 'Low';
}

// Helper: Run Sentiment Analysis (HF with graceful local fallback)
async function analyzeSentiment(text) {
  const cleanText = (text || '').trim();
  if (!cleanText) {
    return { label: 'NEUTRAL', score: 0.5 };
  }

  if (hf) {
    try {
      const response = await hf.textClassification({
        model: HF_MODEL,
        inputs: cleanText
      });
      if (Array.isArray(response) && response.length > 0) {
        const top = response.reduce((max, cur) => cur.score > max.score ? cur : max, response[0]);
        return {
          label: top.label.toUpperCase(),
          score: top.score
        };
      }
    } catch (err) {
      console.warn('Hugging Face Inference call failed, falling back to local sentiment engine:', err.message);
    }
  }

  // Fallback to local rule-based engine
  const res = localSentiment.analyze(cleanText);
  if (res.score > 0) {
    return { label: 'POSITIVE', score: Math.min(0.99, 0.6 + Math.abs(res.comparative) * 0.4) };
  } else if (res.score < 0) {
    return { label: 'NEGATIVE', score: Math.min(0.99, 0.6 + Math.abs(res.comparative) * 0.4) };
  }
  return { label: 'NEUTRAL', score: 0.5 };
}

// Locate dataset file path (file or folder containing sentiment.csv)
function getDatasetPath() {
  const datasetPath = path.join(__dirname, 'dataset.csv');
  if (fs.existsSync(datasetPath)) {
    const stat = fs.statSync(datasetPath);
    if (stat.isDirectory()) {
      const preferred = path.join(datasetPath, 'sentiment.csv');
      if (fs.existsSync(preferred)) return preferred;
      const files = fs.readdirSync(datasetPath).filter(f => f.endsWith('.csv'));
      if (files.length > 0) return path.join(datasetPath, files[0]);
    }
    return datasetPath;
  }
  return null;
}

// Parse CSV Line handling quoted commas
function parseCSVLine(line) {
  const values = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      values.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  values.push(current.trim());
  return values;
}

// Parse CSV buffer or stream into rows
function parseCSVString(csvContent, limit = 50) {
  const lines = csvContent.split(/\r?\n/).filter(l => l.trim().length > 0);
  if (lines.length === 0) return { headers: [], rows: [] };

  const headers = parseCSVLine(lines[0]);
  const rows = [];
  for (let i = 1; i < lines.length && rows.length < limit; i++) {
    const vals = parseCSVLine(lines[i]);
    const row = {};
    headers.forEach((h, idx) => {
      row[h] = vals[idx] || '';
    });
    rows.push(row);
  }
  return { headers, rows };
}

// Aggregate metrics from processed reviews
function aggregateKPIs(processedReviews) {
  const total = processedReviews.length;
  let positive = 0;
  let negative = 0;
  let neutral = 0;
  let highUrgency = 0;
  const topicCounts = {};

  for (const r of processedReviews) {
    if (r.sentiment === 'POSITIVE') positive++;
    else if (r.sentiment === 'NEGATIVE') negative++;
    else neutral++;

    if (r.urgency === 'High') highUrgency++;

    const topic = r.topic || 'General Feedback';
    topicCounts[topic] = (topicCounts[topic] || 0) + 1;
  }

  return {
    total,
    breakdown: {
      positive,
      negative,
      neutral
    },
    positivePct: total ? Math.round((positive / total) * 100) : 0,
    negativePct: total ? Math.round((negative / total) * 100) : 0,
    neutralPct: total ? Math.round((neutral / total) * 100) : 0,
    highUrgencyCount: highUrgency,
    topicCounts
  };
}

// ---------------- API ENDPOINTS ----------------

// Health check endpoint
app.get('/api/health', (req, res) => {
  const datasetAvailable = !!getDatasetPath();
  res.json({
    status: 'ok',
    hfConfigured: !!hfApiKey,
    datasetAvailable,
    timestamp: new Date().toISOString()
  });
});

// Live Single Review Analysis
app.post('/api/analyze', async (req, res) => {
  try {
    const { text, rating, headline } = req.body;
    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: 'Please provide valid review text to analyze.' });
    }

    const sentimentResult = await analyzeSentiment(text);
    const topic = detectTopic(`${headline || ''} ${text}`);
    const urgency = detectUrgency(sentimentResult.label, sentimentResult.score, `${headline || ''} ${text}`, rating);

    res.json({
      success: true,
      text,
      headline: headline || '',
      rating: rating || null,
      sentiment: sentimentResult.label,
      score: sentimentResult.score,
      topic,
      urgency,
      analyzedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('Analysis error:', error);
    res.status(500).json({ error: 'Failed to analyze sentiment: ' + error.message });
  }
});

// Batch Process from dataset.csv
app.get('/api/dataset/batch', async (req, res) => {
  try {
    const datasetPath = getDatasetPath();
    if (!datasetPath) {
      return res.status(404).json({ error: 'dataset.csv not found in project root.' });
    }

    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 30);
    const fileStream = fs.createReadStream(datasetPath);
    const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

    let headers = null;
    const rawRows = [];

    for await (const line of rl) {
      if (!line.trim()) continue;
      if (!headers) {
        headers = parseCSVLine(line);
        continue;
      }
      const vals = parseCSVLine(line);
      const row = {};
      headers.forEach((h, idx) => { row[h] = vals[idx] || ''; });
      rawRows.push(row);
      if (rawRows.length >= limit) {
        rl.close();
        break;
      }
    }

    const processed = [];
    for (let i = 0; i < rawRows.length; i++) {
      const r = rawRows[i];
      const reviewBody = r.Summary || r.Review || r.text || r.review || '';
      const headline = r.Review || '';
      const productName = r.ProductName || r.product_name || 'E-Commerce Product';
      const rating = r.Rate || r.rating || null;
      const groundTruth = r.Sentiment || null;

      const sentimentResult = await analyzeSentiment(reviewBody);
      const topic = detectTopic(`${headline} ${reviewBody} ${productName}`);
      const urgency = detectUrgency(sentimentResult.label, sentimentResult.score, `${headline} ${reviewBody}`, rating);

      processed.push({
        id: i + 1,
        product: productName,
        headline,
        text: reviewBody,
        rating,
        sentiment: sentimentResult.label,
        score: sentimentResult.score,
        topic,
        urgency,
        groundTruth
      });
    }

    const kpis = aggregateKPIs(processed);
    res.json({
      success: true,
      source: path.basename(datasetPath),
      totalProcessed: processed.length,
      kpis,
      reviews: processed
    });
  } catch (error) {
    console.error('Batch dataset error:', error);
    res.status(500).json({ error: 'Failed to process dataset: ' + error.message });
  }
});

// CSV File Upload Batch Analysis
app.post('/api/upload-dataset', upload.single('dataset'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No CSV file uploaded.' });
    }

    const csvContent = req.file.buffer.toString('utf-8');
    const limit = Math.min(Math.max(parseInt(req.body.limit, 10) || 15, 1), 30);
    const { headers, rows } = parseCSVString(csvContent, limit);

    if (rows.length === 0) {
      return res.status(400).json({ error: 'Uploaded CSV is empty or invalid.' });
    }

    const processed = [];
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const reviewBody = r.Summary || r.Review || r.text || r.review || r.Comment || r.comment || Object.values(r)[0] || '';
      const headline = r.Review || r.Headline || r.title || '';
      const productName = r.ProductName || r.product_name || r.Product || 'Product Feedback';
      const rating = r.Rate || r.rating || r.Rating || null;
      const groundTruth = r.Sentiment || r.sentiment || null;

      const sentimentResult = await analyzeSentiment(reviewBody);
      const topic = detectTopic(`${headline} ${reviewBody} ${productName}`);
      const urgency = detectUrgency(sentimentResult.label, sentimentResult.score, `${headline} ${reviewBody}`, rating);

      processed.push({
        id: i + 1,
        product: productName,
        headline,
        text: reviewBody,
        rating,
        sentiment: sentimentResult.label,
        score: sentimentResult.score,
        topic,
        urgency,
        groundTruth
      });
    }

    const kpis = aggregateKPIs(processed);
    res.json({
      success: true,
      filename: req.file.originalname,
      totalProcessed: processed.length,
      headers,
      kpis,
      reviews: processed
    });
  } catch (error) {
    console.error('File upload analysis error:', error);
    res.status(500).json({ error: 'Failed to process uploaded CSV: ' + error.message });
  }
});

// Start listening
app.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(` Sentiment Analytics Dashboard Server Started!`);
  console.log(` Local URL: http://localhost:${PORT}`);
  console.log(` Hugging Face Inference: ${hf ? 'Configured (Active)' : 'Local Engine'}`);
  console.log(`====================================================`);
});
