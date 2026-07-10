import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import dns from 'dns';
import { createServer } from 'http';
import { Server } from 'socket.io';
import connectDB from './config/db.js';
import initCronJobs from './cron.js';

// Configure DNS resolution servers to resolve MongoDB Atlas SRV links
dns.setServers(['8.8.8.8', '1.1.1.1']);

// Route imports
import authRoutes from './routes/auth.js';
import slotRoutes from './routes/slots.js';
import bookingRoutes from './routes/bookings.js';
import membershipRoutes from './routes/membership.js';

// Load env variables
dotenv.config();

// Connect to MongoDB
connectDB();

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE']
  }
});

// Store socket io instance in express app for access in routes
app.set('io', io);

io.on('connection', (socket) => {
  console.log(`[Socket] New client connected: ${socket.id}`);
  socket.on('disconnect', () => {
    console.log(`[Socket] Client disconnected: ${socket.id}`);
  });
});

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/slots', slotRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/membership', membershipRoutes);

// Simple Health Check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Gym Booking Backend API running smoothly' });
});

// Start Cron Scheduler
initCronJobs();

// Serve static assets in production if built
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distPath = path.resolve(__dirname, '../../dist');

if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  // Serve index.html for any client-side routing
  app.get('*', (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

// Start Server
const PORT = process.env.PORT || 5000;
httpServer.listen(PORT, () => {
  console.log(`Server running in development mode on port ${PORT}`);
});
