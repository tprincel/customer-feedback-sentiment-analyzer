require('dotenv').config();
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { HfInference } = require('@huggingface/inference');

// Validate API Key
if (!process.env.HUGGINGFACE_API_KEY) {
  console.error('Error: HUGGINGFACE_API_KEY is not defined in .env file.');
  process.exit(1);
}

const hf = new HfInference(process.env.HUGGINGFACE_API_KEY);

// Locate dataset file (handles both dataset.csv as file or dataset.csv directory containing sentiment.csv)
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
  throw new Error('dataset.csv was not found in the project root.');
}

// Simple robust CSV line parser handling quoted commas
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

// Read first N rows from dataset
async function getFirstReviews(filePath, limit = 5) {
  const fileStream = fs.createReadStream(filePath);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  let headers = null;
  const reviews = [];

  for await (const line of rl) {
    if (!line.trim()) continue;
    if (!headers) {
      headers = parseCSVLine(line);
      continue;
    }

    const values = parseCSVLine(line);
    const row = {};
    headers.forEach((header, index) => {
      row[header] = values[index] || '';
    });

    reviews.push(row);
    if (reviews.length >= limit) {
      rl.close();
      break;
    }
  }

  return { headers, reviews };
}

async function run() {
  try {
    const datasetPath = getDatasetPath();
    console.log(`Reading dataset from: ${path.relative(__dirname, datasetPath)}\n`);

    const { headers, reviews } = await getFirstReviews(datasetPath, 5);
    console.log('Columns detected:', headers.join(', '));
    console.log(`\nProcessing first ${reviews.length} reviews with Hugging Face...\n`);

    for (let i = 0; i < reviews.length; i++) {
      const row = reviews[i];
      // Use Summary (full review text) if available, otherwise Review headline or text
      const reviewText = row.Summary || row.Review || row.text || row.review;
      const headline = row.Review ? `"${row.Review}"` : 'N/A';

      const response = await hf.textClassification({
        model: 'distilbert/distilbert-base-uncased-finetuned-sst-2-english',
        inputs: reviewText
      });

      // Find top predicted sentiment
      const topPrediction = response.reduce((max, curr) => curr.score > max.score ? curr : max, response[0]);

      console.log(`--- Review #${i + 1} ---`);
      if (row.ProductName) console.log(`Product:  ${row.ProductName.substring(0, 60)}...`);
      if (row.Rate) console.log(`Rating:   ${row.Rate} / 5`);
      console.log(`Headline: ${headline}`);
      console.log(`Review:   "${reviewText}"`);
      if (row.Sentiment) console.log(`Actual:   ${row.Sentiment}`);
      console.log(`HF Pred:  ${topPrediction.label} (Score: ${(topPrediction.score * 100).toFixed(2)}%)`);
      console.log();
    }

    console.log('Sentiment analysis pipeline completed successfully.');
  } catch (error) {
    console.error('Error running sentiment analysis:', error.message);
  }
}

run();
