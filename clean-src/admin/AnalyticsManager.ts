/**
 * 📊 Analytics Manager
 * 
 * Tracks call analytics, knowledge gaps, and system performance metrics
 */
import { promises as fs } from 'fs';
import path from 'path';
import { CallAnalytics, DailyStats, ErrorLog } from '../types';

export class AnalyticsManager {
    private analyticsDir: string;
    private dailyStats: Map<string, DailyStats>;
    private recentCalls: CallAnalytics[];
    private knowledgeGaps: string[];
    private maxRecentCalls: number = 100;

    constructor() {
        this.analyticsDir = path.join(process.cwd(), 'clean-public', 'analytics');
        this.dailyStats = new Map();
        this.recentCalls = [];
        this.knowledgeGaps = [];
    }

    public async initialize(): Promise<void> {
        console.log('📊 Initializing Analytics Manager...');
        
        try {
            // Ensure analytics directory exists
            await fs.mkdir(this.analyticsDir, { recursive: true });
            
            // Load existing analytics data
            await this.loadAnalyticsData();
            
            console.log('✅ Analytics Manager initialized');
        } catch (error) {
            console.error('❌ Failed to initialize Analytics Manager:', error);
            throw error;
        }
    }

    private async loadAnalyticsData(): Promise<void> {
        try {
            // Load daily stats
            const statsPath = path.join(this.analyticsDir, 'daily-stats.json');
            try {
                const statsData = await fs.readFile(statsPath, 'utf-8');
                const stats = JSON.parse(statsData);
                this.dailyStats = new Map(Object.entries(stats));
                console.log(`📈 Loaded ${this.dailyStats.size} days of statistics`);
            } catch {
                console.log('📈 No existing daily stats found, starting fresh');
            }

            // Load recent calls
            const callsPath = path.join(this.analyticsDir, 'recent-calls.json');
            try {
                const callsData = await fs.readFile(callsPath, 'utf-8');
                this.recentCalls = JSON.parse(callsData);
                console.log(`📞 Loaded ${this.recentCalls.length} recent calls`);
            } catch {
                console.log('📞 No existing call data found, starting fresh');
            }

            // Load knowledge gaps
            const gapsPath = path.join(this.analyticsDir, 'knowledge-gaps.json');
            try {
                const gapsData = await fs.readFile(gapsPath, 'utf-8');
                this.knowledgeGaps = JSON.parse(gapsData);
                console.log(`🧠 Loaded ${this.knowledgeGaps.length} knowledge gaps`);
            } catch {
                console.log('🧠 No existing knowledge gaps found, starting fresh');
            }
        } catch (error) {
            console.error('Failed to load analytics data:', error);
        }
    }

    private async saveAnalyticsData(): Promise<void> {
        try {
            // Save daily stats
            const statsPath = path.join(this.analyticsDir, 'daily-stats.json');
            const statsObj = Object.fromEntries(this.dailyStats);
            await fs.writeFile(statsPath, JSON.stringify(statsObj, null, 2), 'utf-8');

            // Save recent calls
            const callsPath = path.join(this.analyticsDir, 'recent-calls.json');
            await fs.writeFile(callsPath, JSON.stringify(this.recentCalls, null, 2), 'utf-8');

            // Save knowledge gaps
            const gapsPath = path.join(this.analyticsDir, 'knowledge-gaps.json');
            await fs.writeFile(gapsPath, JSON.stringify(this.knowledgeGaps, null, 2), 'utf-8');
        } catch (error) {
            console.error('Failed to save analytics data:', error);
        }
    }

    public recordCall(analytics: CallAnalytics): void {
        console.log(`📈 Recording call analytics for session ${analytics.sessionId}`);
        
        // Add to recent calls
        this.recentCalls.unshift(analytics);
        
        // Keep only recent calls
        if (this.recentCalls.length > this.maxRecentCalls) {
            this.recentCalls = this.recentCalls.slice(0, this.maxRecentCalls);
        }

        // Update daily stats
        this.updateDailyStats(analytics);
        
        // Extract knowledge gaps
        if (analytics.knowledgeGaps && analytics.knowledgeGaps.length > 0) {
            analytics.knowledgeGaps.forEach(gap => {
                if (!this.knowledgeGaps.includes(gap)) {
                    this.knowledgeGaps.push(gap);
                }
            });
        }

        // Auto-save analytics data
        this.saveAnalyticsData().catch(error => {
            console.error('Failed to save analytics after recording call:', error);
        });
    }

    private updateDailyStats(analytics: CallAnalytics): void {
        const dateKey = new Date(analytics.startTime).toISOString().split('T')[0];
        const currentStats = this.dailyStats.get(dateKey) || {
            date: dateKey,
            totalCalls: 0,
            qualifiedCalls: 0,
            averageDuration: 0,
            commonTopics: {},
            errorCount: 0
        };

        // Update totals
        currentStats.totalCalls++;
        
        if (analytics.outcome === 'qualified') {
            currentStats.qualifiedCalls++;
        }

        // Update average duration
        if (analytics.duration) {
            const totalDuration = (currentStats.averageDuration * (currentStats.totalCalls - 1)) + analytics.duration;
            currentStats.averageDuration = Math.round(totalDuration / currentStats.totalCalls);
        }

        // Extract topics from transcript
        if (analytics.transcript && analytics.transcript.length > 0) {
            const topics = this.extractTopics(analytics.transcript);
            topics.forEach(topic => {
                currentStats.commonTopics[topic] = (currentStats.commonTopics[topic] || 0) + 1;
            });
        }

        // Count errors
        if (analytics.errors && analytics.errors.length > 0) {
            currentStats.errorCount += analytics.errors.length;
        }

        this.dailyStats.set(dateKey, currentStats);
    }

    private extractTopics(transcript: any[]): string[] {
        const topics: string[] = [];
        const topicKeywords = {
            'leads': ['lead', 'leads', 'prospect', 'prospects'],
            'budget': ['budget', 'cost', 'price', 'pricing', 'money'],
            'timeline': ['timeline', 'when', 'time', 'schedule', 'urgency'],
            'decision_maker': ['decision', 'decide', 'approve', 'authority'],
            'automation': ['automation', 'automate', 'tool', 'software', 'system'],
            'follow_up': ['follow', 'contact', 'reach', 'response'],
            'demo': ['demo', 'demonstration', 'show', 'meeting'],
            'qualification': ['qualify', 'qualified', 'fit', 'match']
        };

        const fullText = transcript
            .map(turn => turn.content?.toLowerCase() || '')
            .join(' ');

        Object.entries(topicKeywords).forEach(([topic, keywords]) => {
            if (keywords.some(keyword => fullText.includes(keyword))) {
                topics.push(topic);
            }
        });

        return topics;
    }

    public getDailyStats(date?: string): DailyStats | null {
        const dateKey = date || new Date().toISOString().split('T')[0];
        return this.dailyStats.get(dateKey) || null;
    }

    public getRecentCalls(limit: number = 20): CallAnalytics[] {
        return this.recentCalls.slice(0, limit);
    }

    public getKnowledgeGaps(): string[] {
        return [...this.knowledgeGaps];
    }

    public getAllDailyStats(): DailyStats[] {
        return Array.from(this.dailyStats.values())
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }

    public getWeeklyStats(weeksBack: number = 4): DailyStats[] {
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - (7 * weeksBack));
        
        return this.getAllDailyStats()
            .filter(stats => new Date(stats.date) >= weekAgo);
    }

    public getQualificationRate(days: number = 30): number {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - days);
        
        const recentStats = this.getAllDailyStats()
            .filter(stats => new Date(stats.date) >= cutoffDate);
        
        if (recentStats.length === 0) {
            return 0;
        }

        const totalCalls = recentStats.reduce((sum, stats) => sum + stats.totalCalls, 0);
        const qualifiedCalls = recentStats.reduce((sum, stats) => sum + stats.qualifiedCalls, 0);
        
        return totalCalls > 0 ? Math.round((qualifiedCalls / totalCalls) * 100) : 0;
    }

    public getAverageDuration(days: number = 30): number {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - days);
        
        const recentStats = this.getAllDailyStats()
            .filter(stats => new Date(stats.date) >= cutoffDate);
        
        if (recentStats.length === 0) {
            return 0;
        }

        const totalDuration = recentStats.reduce((sum, stats) => 
            sum + (stats.averageDuration * stats.totalCalls), 0);
        const totalCalls = recentStats.reduce((sum, stats) => sum + stats.totalCalls, 0);
        
        return totalCalls > 0 ? Math.round(totalDuration / totalCalls) : 0;
    }

    public getTopTopics(days: number = 30, limit: number = 10): Array<{topic: string, count: number}> {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - days);
        
        const recentStats = this.getAllDailyStats()
            .filter(stats => new Date(stats.date) >= cutoffDate);
        
        const topicCounts: Record<string, number> = {};
        
        recentStats.forEach(stats => {
            Object.entries(stats.commonTopics).forEach(([topic, count]) => {
                topicCounts[topic] = (topicCounts[topic] || 0) + count;
            });
        });

        return Object.entries(topicCounts)
            .map(([topic, count]) => ({ topic, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, limit);
    }

    public addKnowledgeGap(gap: string): void {
        if (!this.knowledgeGaps.includes(gap)) {
            this.knowledgeGaps.push(gap);
            console.log(`🧠 Added knowledge gap: ${gap}`);
            
            this.saveAnalyticsData().catch(error => {
                console.error('Failed to save analytics after adding knowledge gap:', error);
            });
        }
    }

    public removeKnowledgeGap(gap: string): void {
        const index = this.knowledgeGaps.indexOf(gap);
        if (index > -1) {
            this.knowledgeGaps.splice(index, 1);
            console.log(`🧠 Removed knowledge gap: ${gap}`);
            
            this.saveAnalyticsData().catch(error => {
                console.error('Failed to save analytics after removing knowledge gap:', error);
            });
        }
    }

    public getSystemHealth(): { status: 'healthy' | 'warning' | 'error'; lastCheck: number; issues: string[] } {
        const now = Date.now();
        const issues: string[] = [];
        
        // Check recent error rate
        const recentCalls = this.getRecentCalls(50);
        const errorRate = recentCalls.length > 0 ? 
            recentCalls.filter(call => call.errors && call.errors.length > 0).length / recentCalls.length : 0;
        
        if (errorRate > 0.2) {
            issues.push('High error rate detected');
        }
        
        // Check qualification rate
        const qualificationRate = this.getQualificationRate(7);
        if (qualificationRate < 10) {
            issues.push('Low qualification rate');
        }
        
        // Check average duration
        const avgDuration = this.getAverageDuration(7);
        if (avgDuration < 30000) { // Less than 30 seconds
            issues.push('Conversations are very short');
        }
        
        // Check knowledge gaps
        if (this.knowledgeGaps.length > 10) {
            issues.push('Many knowledge gaps identified');
        }

        let status: 'healthy' | 'warning' | 'error' = 'healthy';
        if (issues.length > 2) {
            status = 'error';
        } else if (issues.length > 0) {
            status = 'warning';
        }

        return {
            status,
            lastCheck: now,
            issues
        };
    }

    public generateReport(days: number = 30): any {
        const qualificationRate = this.getQualificationRate(days);
        const avgDuration = this.getAverageDuration(days);
        const topTopics = this.getTopTopics(days);
        const systemHealth = this.getSystemHealth();
        const recentStats = this.getWeeklyStats(Math.ceil(days / 7));

        return {
            period: `${days} days`,
            qualificationRate: `${qualificationRate}%`,
            averageDurationMinutes: Math.round(avgDuration / 60000),
            topTopics,
            systemHealth,
            dailyBreakdown: recentStats,
            knowledgeGaps: this.knowledgeGaps,
            totalCallsAnalyzed: this.recentCalls.length
        };
    }
} 