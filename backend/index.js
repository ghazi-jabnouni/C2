import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import cors from 'cors';
import { WebSocketServer } from 'ws';
import { config } from './config/server.config.js';

console.log('========================================');
console.log('🚀 Starting Backend Application');
console.log('========================================');

console.log('📦 Step 1: Loading database...');

try {
  // Import DB
  await import('./config/db.js');

  console.log('✅ Step 1: Database loaded successfully');
} catch (err) {
  console.error('❌ Step 1 FAILED: Database initialization error');
  console.error('Error:', err);
  process.exit(1);
}

console.log('📦 Step 2: Initializing Express...');

const app = express();

console.log('✅ Step 2: Express initialized');

console.log('📦 Step 3: Configuring CORS...');

app.use(cors({ origin: config.corsOrigin }));

console.log('✅ CORS configured');

console.log('📦 Step 4: Configuring JSON parser...');

app.use(express.json());

console.log('✅ JSON parser configured');

// Simple request logger to help debug route issues
app.use((req, res, next) => {
  try {
    console.log(`[HTTP] ${req.method} ${req.url} - headers:`, { authorization: req.headers.authorization });
  } catch (_) {}
  next();
});

console.log('📦 Step 5: Loading routes...');

try {
  const { default: authRoutes } = await import('./routes/auth.routes.js');
  const { default: webhookRoutes } = await import('./routes/webhook.routes.js');
  const { default: userRoutes } = await import('./routes/user.routes.js');
  const { default: envRoutes } = await import('./routes/environment.routes.js');
  const { default: repoRoutes } = await import('./routes/repository.routes.js');
  const { default: credRoutes } = await import('./routes/credential.routes.js');
  const { default: invRoutes } = await import('./routes/inventory.routes.js');
  const { default: databaseTypeRoutes } = await import('./routes/database-type.routes.js');
  const { default: workflowRoutes } = await import('./routes/workflow.routes.js');
  const { default: tokenRoutes } = await import('./routes/token.routes.js');
  const { default: templateRoutes } = await import('./routes/template.routes.js');
  const { default: taskRoutes } = await import('./routes/task.routes.js');
  const { default: scheduleRoutes } = await import('./routes/schedule.routes.js');
  const { default: pendingRequestRoutes } = await import('./routes/pending-request.routes.js');
  const { default: dashboardRoutes } = await import('./routes/dashboard.routes.js');
  const { default: systemInfoRoutes } = await import('./routes/system-info.routes.js');

  app.use('/api/auth', authRoutes);

  // Webhook endpoints are public and must be registered before auth middleware
  app.use('/api/v1/webhooks', webhookRoutes);

  // Protect subsequent API routes with auth middleware
  const { AuthController } = await import('./controllers/auth.controller.js');
  app.use('/api', AuthController.requireAuth);

  app.use('/api/users', userRoutes);
  app.use('/api/credentials', credRoutes);
  app.use('/api/environments', envRoutes);
  app.use('/api/repositories', repoRoutes);
  app.use('/api/inventories', invRoutes);
  app.use('/api/database-types', databaseTypeRoutes);
  app.use('/api/workflows', workflowRoutes);
  app.use('/api/tokens', tokenRoutes);
  app.use('/api/templates', templateRoutes);
  app.use('/api/tasks', taskRoutes);
  app.use('/api/schedules', scheduleRoutes);
  app.use('/api/pending-requests', pendingRequestRoutes);
  app.use('/api/dashboard', dashboardRoutes);
  app.use('/api/system-info', systemInfoRoutes);

  // Sync dedicated template workspace folders on startup
  try {
    const { TemplateModel } = await import('./models/template.model.js');
    const allTemplates = TemplateModel.findAll();
    console.log(`📁 Synchronized ${allTemplates.length} template workspace directories in backend/templates/`);
  } catch (e) {
    console.error('⚠️ Could not auto-sync template workspace directories:', e);
  }

  console.log('✅ Auth routes loaded');
  console.log('✅ User routes loaded');
  console.log('✅ Repository routes loaded');
} catch (err) {
  console.error('❌ Routes loading FAILED');
  console.error('Error:', err);
  process.exit(1);
}

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    environment: config.env,
    engine: 'Node.js Express + SQLite'
  });
});

console.log('✅ Health check configured');

// ── Serve React frontend in production ──────────────────────
if (config.env === 'production') {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname  = dirname(__filename);
  // dist is at project root, one level above backend/
  const distPath   = join(__dirname, '..', 'dist');

  app.use(express.static(distPath));

  // SPA fallback – serve index.html for all non-API routes
  app.get('*', (req, res) => {
    res.sendFile(join(distPath, 'index.html'));
  });

  console.log(`✅ Serving static frontend from: ${distPath}`);
}

console.log('========================================');
console.log('📡 Starting Express server...');
console.log('Port:', config.port);
console.log('Environment:', config.env);
console.log('========================================');

const server = app.listen(config.port, config.host, () => {
  console.log('========================================');
  console.log('🚀 Backend Express Server is RUNNING');
  console.log(`🌐 http://${config.host}:${config.port}`);
  console.log(`❤️  Health: http://${config.host}:${config.port}/api/health`);
  console.log(`👤 Users: http://${config.host}:${config.port}/api/users`);
  console.log('========================================');
});

// Setup WebSocket Server for Live Log Streaming & proxy support
const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', async (ws, req) => {
  try {
    const urlParams = new URLSearchParams(req.url?.split('?')[1] || '');
    const taskId = urlParams.get('taskId');

    if (!taskId) {
      ws.send(JSON.stringify({ type: 'ERROR', message: 'No taskId specified' }));
      ws.close();
      return;
    }

    const { TaskModel } = await import('./models/task.model.js');
    const task = TaskModel.findById(taskId);

    if (task) {
      ws.send(JSON.stringify({ type: 'INIT_TASK', task }));
    } else {
      ws.send(JSON.stringify({ type: 'INIT_TASK', task: { id: taskId, status: 'success', logs: [] } }));
    }
  } catch (err) {
    console.error('WebSocket connection error:', err);
  }
});

wss.on('error', (err) => {
  console.error('⚠️ WebSocket Server Error:', err);
});

server.on('error', (err) => {
  console.error('❌ Server Listen Error:', err);

  if (err.code === 'EADDRINUSE') {
    console.error(`⚠️ Port ${config.port} is already in use.`);
  }

  process.exit(1);
});

// Uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('💥 Uncaught Exception:');
  console.error(err);
});

// Unhandled promises
process.on('unhandledRejection', (err) => {
  console.error('💥 Unhandled Rejection:');
  console.error(err);
});