/**
 * AIPL Delivery Dashboard — Local Proxy Server
 * Run with: node server.js
 * Then open: http://localhost:3000
 */
const http = require('http');
const https = require('https');
const fs = require('fs');
const url = require('url');

const PORT = 3000;
const JIRA_HOST = 'cultureamp.atlassian.net';

const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url, true);

  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Authorization, Accept, Content-Type, x-jira-auth',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    });
    res.end();
    return;
  }

  // Serve the dashboard HTML
  if (parsedUrl.pathname === '/' || parsedUrl.pathname === '/index.html') {
    const file = fs.readFileSync('./aipl-dashboard-standalone.html', 'utf8');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(file);
    return;
  }

  // Proxy Jira API requests: /jira-api/rest/api/3/...
  if (parsedUrl.pathname.startsWith('/jira-api/')) {
    const jiraPath = parsedUrl.pathname.replace('/jira-api', '') +
      (req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : '');

    const authHeader = req.headers['x-jira-auth'] || req.headers['authorization'];

    if (!authHeader) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing x-jira-auth header' }));
      return;
    }

    // Collect full request body first, then forward
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

      console.log(`→ ${req.method} https://${JIRA_HOST}${jiraPath}`);

      const proxyReq = https.request(options, (proxyRes) => {
        console.log(`← ${proxyRes.statusCode}`);
        res.writeHead(proxyRes.statusCode, {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        });
        proxyRes.pipe(res);
      });

      proxyReq.on('error', (e) => {
        console.error('Proxy error:', e.message);
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
  console.log(`\n✅ Dashboard running at http://localhost:${PORT}\n`);
});
