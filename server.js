/**
 * Delivery Dashboards — Local Proxy Server
 * Run with: node server.js
 * Then open:
 *   http://localhost:3000/aipl-delivery-stats
 *   http://localhost:3000/llm-model-usage
 */
const http = require('http');
const https = require('https');
const fs = require('fs');
const url = require('url');

const PORT = process.env.PORT || 3000;
const JIRA_HOST = 'cultureamp.atlassian.net';
const DD_HOST = 'api.datadoghq.com';

const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url, true);

  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Authorization, Accept, Content-Type, x-jira-auth, x-dd-api-key, x-dd-app-key',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    });
    res.end();
    return;
  }

  // Serve landing page
  if (parsedUrl.pathname === '/' || parsedUrl.pathname === '/index.html') {
    const file = fs.readFileSync('./index.html', 'utf8');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(file);
    return;
  }

  // Serve AIPL Jira dashboard
  if (parsedUrl.pathname === '/aipl-delivery-stats') {
    const file = fs.readFileSync('./aipl-dashboard-standalone.html', 'utf8');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(file);
    return;
  }

  // Serve LLM model usage dashboard
  if (parsedUrl.pathname === '/llm-model-usage') {
    const file = fs.readFileSync('./llm-model-usage.html', 'utf8');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(file);
    return;
  }

  // Proxy Jira API requests
  if (parsedUrl.pathname.startsWith('/jira-api/')) {
    const jiraPath = parsedUrl.pathname.replace('/jira-api', '') +
      (req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : '');
    const authHeader = req.headers['x-jira-auth'] || req.headers['authorization'];
    if (!authHeader) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing x-jira-auth header' }));
      return;
    }
    let body = [];
    req.on('data', chunk => body.push(chunk));
    req.on('end', () => {
      const bodyBuffer = Buffer.concat(body);
      const options = {
        hostname: JIRA_HOST,
        path: jiraPath,
        method: req.method,
        headers: {
          'Authorization': authHeader,
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'Content-Length': bodyBuffer.length,
        }
      };
      console.log(`→ Jira ${req.method} ${jiraPath}`);
      const proxyReq = https.request(options, (proxyRes) => {
        console.log(`← Jira ${proxyRes.statusCode}`);
        res.writeHead(proxyRes.statusCode, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        proxyRes.pipe(res);
      });
      proxyReq.on('error', (e) => {
        res.writeHead(500, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ error: e.message }));
      });
      proxyReq.write(bodyBuffer);
      proxyReq.end();
    });
    return;
  }

  // Proxy DataDog API requests
  if (parsedUrl.pathname.startsWith('/dd-api/')) {
    const ddPath = parsedUrl.pathname.replace('/dd-api', '') +
      (req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : '');
    const apiKey = req.headers['x-dd-api-key'];
    const appKey = req.headers['x-dd-app-key'];
    if (!apiKey || !appKey) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing x-dd-api-key or x-dd-app-key headers' }));
      return;
    }
    let body = [];
    req.on('data', chunk => body.push(chunk));
    req.on('end', () => {
      const bodyBuffer = Buffer.concat(body);
      const options = {
        hostname: DD_HOST,
        path: ddPath,
        method: req.method,
        headers: {
          'DD-API-KEY': apiKey,
          'DD-APPLICATION-KEY': appKey,
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'Content-Length': bodyBuffer.length,
        }
      };
      console.log(`→ DataDog ${req.method} ${ddPath}`);
      const proxyReq = https.request(options, (proxyRes) => {
        console.log(`← DataDog ${proxyRes.statusCode}`);
        res.writeHead(proxyRes.statusCode, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        proxyRes.pipe(res);
      });
      proxyReq.on('error', (e) => {
        res.writeHead(500, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ error: e.message }));
      });
      proxyReq.write(bodyBuffer);
      proxyReq.end();
    });
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, () => {
  console.log(`\n✅ Dashboards running at:`);
  console.log(`   http://localhost:${PORT}  ← Landing page`);
  console.log(`   http://localhost:${PORT}/aipl-delivery-stats`);
  console.log(`   http://localhost:${PORT}/llm-model-usage\n`);
});
