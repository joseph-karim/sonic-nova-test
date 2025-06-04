import express from 'express';
import http from 'http';
import path from 'path';
import { Server } from 'socket.io';
import { config } from 'dotenv';

// Import our organized modules
import { NovaSessionManager } from '../novaSonic/NovaSessionManager';
import { KnowledgeBaseManager } from '../knowledge/KnowledgeBaseManager';
import { AdminRoutes } from '../admin/routes';
import { AnalyticsManager } from '../admin/AnalyticsManager';
import { setupSocketHandlers } from './socketHandlers';
import { AppConfig } from '../config/config';

// Load environment variables
config();

/**
 * 🚀 Nova Sonic Voice Agent - Consolidated Server
 * 
 * This is the main server implementation that consolidates all the working
 * functionality from the previous scattered implementations into a clean,
 * organized, and maintainable structure.
 * 
 * Features:
 * - ✅ Working Nova Sonic integration (no ValidationException errors)
 * - ✅ Knowledge base management with configurable prompts
 * - ✅ Admin dashboard with analytics
 * - ✅ Debug client for testing
 * - ✅ Medical office specialized client
 * - ✅ Real-time analytics and gap detection
 * - ✅ Configurable system prompts (no more hard-coded Summerview)
 * - ✅ Modern TypeScript with proper error handling
 */
export class NovaServer {
    private app: express.Application;
    private server: http.Server;
    private io: Server;
    private knowledgeBase: KnowledgeBaseManager;
    private analytics: AnalyticsManager;
    private adminRoutes: AdminRoutes;
    private activeSessions: Map<string, NovaSessionManager>;

    constructor() {
        this.app = express();
        this.server = http.createServer(this.app);
        this.io = new Server(this.server, {
            cors: {
                origin: "*",
                methods: ["GET", "POST"]
            }
        });
        
        this.activeSessions = new Map();
        this.knowledgeBase = new KnowledgeBaseManager();
        this.analytics = new AnalyticsManager();
        this.adminRoutes = new AdminRoutes(this.analytics, this.knowledgeBase);
        
        this.setupMiddleware();
        this.setupRoutes();
        this.setupSocketHandlers();
    }

    private setupMiddleware(): void {
        // Body parsing middleware
        this.app.use(express.json({ limit: '10mb' }));
        this.app.use(express.urlencoded({ extended: true }));
        
        // Static file serving - use clean-public instead of public
        this.app.use(express.static(path.join(__dirname, '../../clean-public')));
        
        // Request logging
        this.app.use((req, res, next) => {
            console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
            next();
        });

        // Error handling middleware
        this.app.use((error: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
            console.error('Server Error:', error);
            if (!res.headersSent) {
                res.status(500).json({ 
                    error: 'Internal server error',
                    message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
                });
            }
        });
    }

    private setupRoutes(): void {
        // Health check endpoint
        this.app.get('/health', (req, res) => {
            res.json({ 
                status: 'healthy', 
                timestamp: new Date().toISOString(),
                version: process.env.npm_package_version || '1.0.0'
            });
        });

        // Client application routes
        this.app.get('/', (req, res) => {
            res.sendFile(path.join(__dirname, '../../clean-public/index.html'));
        });

        this.app.get('/debug', (req, res) => {
            res.sendFile(path.join(__dirname, '../../clean-public/debug-client.html'));
        });

        this.app.get('/admin', (req, res) => {
            res.sendFile(path.join(__dirname, '../../clean-public/enhanced-admin-dashboard.html'));
        });

        this.app.get('/medical-office', (req, res) => {
            res.sendFile(path.join(__dirname, '../../clean-public/medical-office.html'));
        });

        // API routes
        this.setupApiRoutes();
    }

    private setupApiRoutes(): void {
        const router = express.Router();

        // Analytics endpoints
        router.get('/stats', (req, res) => {
            const stats = this.analytics.getDailyStats();
            res.json(stats || {
                date: new Date().toISOString().split('T')[0],
                totalCalls: 0,
                qualifiedCalls: 0,
                averageDuration: 0,
                commonTopics: {},
                errorCount: 0
            });
        });

        router.get('/calls', (req, res) => {
            const limit = parseInt(req.query.limit as string || '20', 10);
            res.json(this.analytics.getRecentCalls(limit));
        });

        router.get('/knowledge-gaps', (req, res) => {
            res.json(this.analytics.getKnowledgeGaps());
        });

        // Knowledge base endpoints
        router.get('/knowledge-base', (req, res) => {
            res.json(this.knowledgeBase.getCurrentKnowledgeBase());
        });

        router.post('/knowledge-base', async (req, res) => {
            try {
                await this.knowledgeBase.updateKnowledgeBase(req.body);
                res.json({ success: true, message: 'Knowledge base updated successfully' });
            } catch (error) {
                console.error('Failed to update knowledge base:', error);
                res.status(500).json({ 
                    error: 'Failed to update knowledge base',
                    message: error instanceof Error ? error.message : 'Unknown error'
                });
            }
        });

        // System prompt configuration endpoints
        router.get('/system-prompt', (req, res) => {
            res.json({ 
                prompt: this.knowledgeBase.getSystemPrompt(),
                industry: this.knowledgeBase.getCurrentIndustry(),
                configurable: true
            });
        });

        router.post('/system-prompt', async (req, res) => {
            try {
                const { prompt, industry } = req.body;
                await this.knowledgeBase.updateSystemPrompt(prompt, industry);
                res.json({ success: true, message: 'System prompt updated successfully' });
            } catch (error) {
                console.error('Failed to update system prompt:', error);
                res.status(500).json({ 
                    error: 'Failed to update system prompt',
                    message: error instanceof Error ? error.message : 'Unknown error'
                });
            }
        });

        // Session management endpoints
        router.get('/sessions', (req, res) => {
            const sessions = Array.from(this.activeSessions.entries()).map(([id, session]) => ({
                id,
                startTime: session.getStartTime(),
                status: session.getStatus(),
                clientInfo: session.getClientInfo()
            }));
            res.json(sessions);
        });

        // Admin routes
        this.app.use('/api/admin', this.adminRoutes.getRouter());
        this.app.use('/api', router);
    }

    private setupSocketHandlers(): void {
        setupSocketHandlers(this.io, this.activeSessions, this.knowledgeBase, this.analytics);
    }

    public async start(port: number = 3000): Promise<void> {
        return new Promise((resolve, reject) => {
            // Initialize all managers
            Promise.all([
                this.knowledgeBase.initialize(),
                this.analytics.initialize()
            ]).then(() => {
                console.log('✅ All managers initialized successfully');
                
                // Start server
                this.server.listen(port, () => {
                    console.log('\n🏥 Nova Sonic Voice Agent System');
                    console.log(`📍 Server running on port ${port}`);
                    console.log(`🌐 Main Client: http://localhost:${port}/`);
                    console.log(`🔧 Debug Client: http://localhost:${port}/debug`);
                    console.log(`👨‍💼 Admin Dashboard: http://localhost:${port}/admin`);
                    console.log(`🏥 Medical Office: http://localhost:${port}/medical-office`);
                    console.log(`📊 Health Check: http://localhost:${port}/health`);
                    console.log(`📊 API Endpoints: http://localhost:${port}/api/`);
                    console.log('');
                    resolve();
                });
                
                this.server.on('error', (error) => {
                    console.error('❌ Server failed to start:', error);
                    reject(error);
                });
                
            }).catch((error) => {
                console.error('❌ Failed to initialize managers:', error);
                reject(error);
            });
        });
    }

    public async stop(): Promise<void> {
        return new Promise((resolve) => {
            console.log('🛑 Shutting down server...');
            
            // Close all active sessions
            this.activeSessions.forEach((session, id) => {
                console.log(`Closing session ${id}`);
                session.endSession();
            });
            this.activeSessions.clear();
            
            // Close server
            this.server.close(() => {
                console.log('✅ Server shutdown complete');
                resolve();
            });
        });
    }
}

// Graceful shutdown handling
process.on('SIGTERM', async () => {
    console.log('SIGTERM received, shutting down gracefully');
    if (globalServer) {
        await globalServer.stop();
    }
    process.exit(0);
});

process.on('SIGINT', async () => {
    console.log('SIGINT received, shutting down gracefully');
    if (globalServer) {
        await globalServer.stop();
    }
    process.exit(0);
});

// Global server instance for shutdown handling
let globalServer: NovaServer;

// Main execution
if (require.main === module) {
    const server = new NovaServer();
    globalServer = server;
    
    const port = parseInt(process.env.PORT || '3000', 10);
    
    server.start(port).catch((error) => {
        console.error('❌ Failed to start server:', error);
        process.exit(1);
    });
}

export default NovaServer; 