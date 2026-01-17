// WebSocket server for AR glasses presentation sync
// This server can be deployed to hosting services like Heroku, Render, etc.

const http = require('http');
const WebSocket = require('ws');
const url = require('url');
const fs = require('fs');
const path = require('path');

// Configuration
const PORT = process.env.PORT || 8080;

// Create HTTP server
const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url, true);
  
  // Handle HTTP requests
  if (parsedUrl.pathname === '/status') {
    // Status endpoint
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      status: 'running', 
      clients: wss.clients.size,
      uptime: process.uptime()
    }));
    return;
  }
  
  // Serve simple-control.js
  if (parsedUrl.pathname === '/simple-control.js') {
    try {
      const filePath = path.join(__dirname, 'simple-control.js');
      const content = fs.readFileSync(filePath, 'utf8');
      res.writeHead(200, { 
        'Content-Type': 'application/javascript',
        'Access-Control-Allow-Origin': '*' // Allow cross-origin requests
      });
      res.end(content);
      return;
    } catch (error) {
      console.error('Error serving simple-control.js:', error);
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('File not found');
      return;
    }
  }
  
  // Serve simple-control.html
  if (parsedUrl.pathname === '/simple-control') {
    try {
      const filePath = path.join(__dirname, 'simple-control.html');
      const content = fs.readFileSync(filePath, 'utf8');
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(content);
      return;
    } catch (error) {
      console.error('Error serving simple-control.html:', error);
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('File not found');
      return;
    }
  }
  
  if (parsedUrl.pathname === '/') {
    // Serve a simple status page
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>AR Glasses Presentation Sync Server</title>
        <style>
          body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
          .card { border: 1px solid #ddd; border-radius: 8px; padding: 15px; margin-bottom: 20px; }
          .status { font-weight: bold; color: #0f9d58; }
          pre { background: #f5f5f5; padding: 10px; border-radius: 4px; overflow-x: auto; }
          .button { display: inline-block; background-color: #4285f4; color: white; padding: 10px 20px; 
                   text-decoration: none; border-radius: 4px; margin-top: 10px; }
          .button:hover { background-color: #3367d6; }
        </style>
      </head>
      <body>
        <h1>AR Glasses Presentation Sync Server</h1>
        <div class="card">
          <h2>Server Status</h2>
          <p>Status: <span class="status">Running</span></p>
          <p>Connected Clients: ${wss.clients.size}</p>
          <p>Uptime: ${Math.floor(process.uptime())} seconds</p>
        </div>
        <div class="card">
          <h2>Usage Instructions</h2>
          <p>This server provides WebSocket connectivity for the Presentation Sync Chrome Extension.</p>
          <p>WebSocket URL: <code>ws://${req.headers.host}</code></p>
          <p>For HTTPS connections use: <code>wss://${req.headers.host}</code></p>
          <a href="/simple-control" class="button">Simple Control Interface</a>
          <a href="/test-client" class="button">Test Client</a>
        </div>
        <div class="card">
          <h2>API Documentation</h2>
          <p>WebSocket Message Format:</p>
          <pre>{
  "type": "command",
  "command": "next" | "previous"
}</pre>
        </div>
      </body>
      </html>
    `);
    return;
  }
  
  // Serve test client
  if (parsedUrl.pathname === '/test-client') {
    try {
      const testClientPath = path.join(__dirname, 'test-client.html');
      const content = fs.readFileSync(testClientPath, 'utf8');
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(content);
      return;
    } catch (error) {
      console.error('Error serving test client:', error);
    }
  }
  
  // Default response for other HTTP requests
  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not Found\n');
});

// Create WebSocket server
const wss = new WebSocket.Server({ server });

// Track connected clients
const clients = new Set();

// Handle WebSocket connections
wss.on('connection', (ws, req) => {
  console.log('Client connected');
  clients.add(ws);
  
  // Send welcome message
  ws.send(JSON.stringify({
    type: 'info',
    message: 'Connected to AR Glasses Presentation Sync Server'
  }));
  
  // Handle messages from clients
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      console.log('Received:', data);
      
      // Handle different message types
      if (data.type === 'command') {
        handleCommand(data, ws);
      } else if (data.type === 'auth') {
        handleAuth(data, ws);
      }
    } catch (error) {
      console.error('Error processing message:', error);
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Invalid message format'
      }));
    }
  });
  
  // Handle client disconnection
  ws.on('close', () => {
    console.log('Client disconnected');
    clients.delete(ws);
  });
});

// Handle navigation commands
function handleCommand(data, ws) {
  console.log(`Received command: ${data.command}`);
  
  // Create the message to broadcast
  const message = JSON.stringify({
    type: 'command',
    command: data.command
  });
  
  // Broadcast the command to ALL connected clients
  wss.clients.forEach(client => {
    // Send to all clients except the sender
    if (client !== ws && client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
  
  // Also send a confirmation back to the sender
  ws.send(JSON.stringify({
    type: 'command',
    status: 'received',
    command: data.command
  }));
  
  // Log the command to the console
  if (data.command === 'next') {
    console.log('Moving to next slide - broadcasted to all clients');
  } else if (data.command === 'previous') {
    console.log('Moving to previous slide - broadcasted to all clients');
  }
}

// Handle authentication
function handleAuth(data, ws) {
  console.log('Authentication attempt');
  
  // In a real implementation, validate credentials
  // For this demo, accept any auth attempt
  ws.send(JSON.stringify({
    type: 'auth',
    status: 'success',
    message: 'Authentication successful'
  }));
  
  ws.isAuthenticated = true;
}

// Start the server
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log('WebSocket server available at ws://localhost:${PORT}');
  console.log('Use Ctrl+C to stop the server');
});

// Handle server shutdown
process.on('SIGINT', () => {
  console.log('Shutting down server...');
  
  // Close all WebSocket connections
  wss.clients.forEach(client => {
    client.close();
  });
  
  // Close the HTTP server
  server.close(() => {
    console.log('Server shut down');
    process.exit(0);
  });
});
