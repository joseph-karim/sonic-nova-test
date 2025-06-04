import { Router, Request, Response } from 'express';
import { AnalyticsManager } from './AnalyticsManager';
import { KnowledgeBaseManager } from '../knowledge/KnowledgeBaseManager';

export class AdminRoutes {
  private router: Router;
  private analytics: AnalyticsManager;
  private knowledgeBase: KnowledgeBaseManager;

  constructor(analytics: AnalyticsManager, knowledgeBase: KnowledgeBaseManager) {
    this.router = Router();
    this.analytics = analytics;
    this.knowledgeBase = knowledgeBase;
    this.setupRoutes();
  }

  private setupRoutes(): void {
    // Dashboard data endpoint
    this.router.get('/dashboard', async (req: Request, res: Response) => {
      try {
        const stats = this.analytics.getDailyStats();
        const recentCalls = this.analytics.getRecentCalls(10);
        const knowledgeGaps = this.analytics.getKnowledgeGaps();
        const systemHealth = this.analytics.getSystemHealth();

        res.json({
          stats: stats || {
            date: new Date().toISOString().split('T')[0],
            totalCalls: 0,
            qualifiedCalls: 0,
            averageDuration: 0,
            commonTopics: {},
            errorCount: 0
          },
          recentCalls,
          knowledgeGaps,
          systemHealth,
          activeSessions: 0 // This would be passed from the main server
        });
      } catch (error) {
        console.error('Error getting dashboard data:', error);
        res.status(500).json({ error: 'Failed to get dashboard data' });
      }
    });

    // Analytics report endpoint
    this.router.get('/report/:days?', async (req: Request, res: Response) => {
      try {
        const days = parseInt(req.params.days || '30', 10);
        const report = this.analytics.generateReport(days);
        res.json(report);
      } catch (error) {
        console.error('Error generating report:', error);
        res.status(500).json({ error: 'Failed to generate report' });
      }
    });

    // Historical stats endpoint
    this.router.get('/stats/history/:weeks?', async (req: Request, res: Response) => {
      try {
        const weeks = parseInt(req.params.weeks || '4', 10);
        const weeklyStats = this.analytics.getWeeklyStats(weeks);
        res.json(weeklyStats);
      } catch (error) {
        console.error('Error getting historical stats:', error);
        res.status(500).json({ error: 'Failed to get historical stats' });
      }
    });

    // Qualification rate endpoint
    this.router.get('/qualification-rate/:days?', async (req: Request, res: Response) => {
      try {
        const days = parseInt(req.params.days || '30', 10);
        const rate = this.analytics.getQualificationRate(days);
        res.json({ 
          qualificationRate: rate,
          period: `${days} days`
        });
      } catch (error) {
        console.error('Error getting qualification rate:', error);
        res.status(500).json({ error: 'Failed to get qualification rate' });
      }
    });

    // Top topics endpoint
    this.router.get('/topics/:days?', async (req: Request, res: Response) => {
      try {
        const days = parseInt(req.params.days || '30', 10);
        const limit = parseInt(req.query.limit as string || '10', 10);
        const topics = this.analytics.getTopTopics(days, limit);
        res.json(topics);
      } catch (error) {
        console.error('Error getting top topics:', error);
        res.status(500).json({ error: 'Failed to get top topics' });
      }
    });

    // Knowledge gaps management
    this.router.post('/knowledge-gaps', async (req: Request, res: Response) => {
      try {
        const { gap } = req.body;
        if (!gap || typeof gap !== 'string') {
          return res.status(400).json({ error: 'Gap is required and must be a string' });
        }
        
        this.analytics.addKnowledgeGap(gap);
        res.json({ success: true, message: 'Knowledge gap added' });
      } catch (error) {
        console.error('Error adding knowledge gap:', error);
        res.status(500).json({ error: 'Failed to add knowledge gap' });
      }
    });

    this.router.delete('/knowledge-gaps', async (req: Request, res: Response) => {
      try {
        const { gap } = req.body;
        if (!gap || typeof gap !== 'string') {
          return res.status(400).json({ error: 'Gap is required and must be a string' });
        }
        
        this.analytics.removeKnowledgeGap(gap);
        res.json({ success: true, message: 'Knowledge gap removed' });
      } catch (error) {
        console.error('Error removing knowledge gap:', error);
        res.status(500).json({ error: 'Failed to remove knowledge gap' });
      }
    });

    // Knowledge base templates
    this.router.get('/templates', async (req: Request, res: Response) => {
      try {
        const templates = await this.knowledgeBase.getAvailableTemplates();
        res.json(templates);
      } catch (error) {
        console.error('Error getting templates:', error);
        res.status(500).json({ error: 'Failed to get templates' });
      }
    });

    this.router.get('/templates/:industry', async (req: Request, res: Response) => {
      try {
        const { industry } = req.params;
        const template = await this.knowledgeBase.loadIndustryTemplate(industry);
        
        if (!template) {
          return res.status(404).json({ error: 'Template not found' });
        }
        
        res.json(template);
      } catch (error) {
        console.error('Error getting template:', error);
        res.status(500).json({ error: 'Failed to get template' });
      }
    });

    this.router.post('/templates/:industry', async (req: Request, res: Response) => {
      try {
        const { industry } = req.params;
        const template = req.body;
        
        await this.knowledgeBase.saveIndustryTemplate(industry, template);
        res.json({ success: true, message: 'Template saved' });
      } catch (error) {
        console.error('Error saving template:', error);
        res.status(500).json({ error: 'Failed to save template' });
      }
    });

    // Knowledge base search
    this.router.post('/search', async (req: Request, res: Response) => {
      try {
        const { query } = req.body;
        if (!query || typeof query !== 'string') {
          return res.status(400).json({ error: 'Query is required and must be a string' });
        }
        
        const result = this.knowledgeBase.findAnswer(query);
        res.json(result);
      } catch (error) {
        console.error('Error searching knowledge base:', error);
        res.status(500).json({ error: 'Failed to search knowledge base' });
      }
    });

    // Add FAQ entry
    this.router.post('/faq', async (req: Request, res: Response) => {
      try {
        const { question, answer, keywords, category } = req.body;
        
        if (!question || !answer || !keywords) {
          return res.status(400).json({ 
            error: 'Question, answer, and keywords are required' 
          });
        }
        
        this.knowledgeBase.addQuestion(question, answer, keywords, category);
        res.json({ success: true, message: 'FAQ entry added' });
      } catch (error) {
        console.error('Error adding FAQ entry:', error);
        res.status(500).json({ error: 'Failed to add FAQ entry' });
      }
    });

    // Export data
    this.router.get('/export/calls/:days?', async (req: Request, res: Response) => {
      try {
        const days = parseInt(req.params.days || '30', 10);
        const limit = parseInt(req.query.limit as string || '1000', 10);
        const calls = this.analytics.getRecentCalls(limit);
        
        // Filter by date range
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - days);
        
        const filteredCalls = calls.filter(call => 
          new Date(call.startTime) >= cutoffDate
        );
        
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename="calls-export-${new Date().toISOString().split('T')[0]}.json"`);
        res.json(filteredCalls);
      } catch (error) {
        console.error('Error exporting calls:', error);
        res.status(500).json({ error: 'Failed to export calls' });
      }
    });

    this.router.get('/export/stats/:weeks?', async (req: Request, res: Response) => {
      try {
        const weeks = parseInt(req.params.weeks || '12', 10);
        const stats = this.analytics.getWeeklyStats(weeks);
        
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename="stats-export-${new Date().toISOString().split('T')[0]}.json"`);
        res.json(stats);
      } catch (error) {
        console.error('Error exporting stats:', error);
        res.status(500).json({ error: 'Failed to export stats' });
      }
    });

    // System health check
    this.router.get('/health', async (req: Request, res: Response) => {
      try {
        const health = this.analytics.getSystemHealth();
        const currentKB = this.knowledgeBase.getCurrentKnowledgeBase();
        
        res.json({
          ...health,
          knowledgeBase: {
            industry: currentKB.industry,
            questionsCount: currentKB.commonQuestions.length,
            productsCount: currentKB.products.length
          }
        });
      } catch (error) {
        console.error('Error getting system health:', error);
        res.status(500).json({ error: 'Failed to get system health' });
      }
    });
  }

  public getRouter(): Router {
    return this.router;
  }
} 