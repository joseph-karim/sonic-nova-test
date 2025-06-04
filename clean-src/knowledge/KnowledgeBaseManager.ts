import { promises as fs } from 'fs';
import path from 'path';
import { KnowledgeBase, QuestionAnswer } from '../types';

export class KnowledgeBaseManager {
  private currentKnowledgeBase: KnowledgeBase;
  private knowledgeBaseDir: string;
  private templatesDir: string;

  constructor() {
    this.knowledgeBaseDir = path.join(process.cwd(), 'clean-public', 'knowledge');
    this.templatesDir = path.join(process.cwd(), 'clean-public', 'prompts');
    
    // Default knowledge base
    this.currentKnowledgeBase = {
      industry: 'general',
      systemPrompt: this.getDefaultSystemPrompt(),
      companyInfo: {
        name: 'Demo Company',
        description: 'AI-powered voice assistant demonstration',
        contactInfo: {
          email: 'demo@example.com',
          phone: '(555) 123-4567'
        }
      },
      products: [],
      commonQuestions: [],
      qualificationCriteria: {
        requiredFields: ['budget', 'timeline', 'decision_maker'],
        scoringRules: [],
        thresholds: {
          qualified: 7,
          maybeQualified: 5
        }
      }
    };
  }

  public async initialize(): Promise<void> {
    console.log('🧠 Initializing Knowledge Base Manager...');
    
    try {
      // Ensure directories exist
      await this.ensureDirectories();
      
      // Load existing knowledge base if available
      await this.loadKnowledgeBase();
      
      console.log('✅ Knowledge Base Manager initialized');
    } catch (error) {
      console.error('❌ Failed to initialize Knowledge Base Manager:', error);
      throw error;
    }
  }

  private async ensureDirectories(): Promise<void> {
    try {
      await fs.mkdir(this.knowledgeBaseDir, { recursive: true });
      await fs.mkdir(this.templatesDir, { recursive: true });
    } catch (error) {
      console.error('Failed to create directories:', error);
      throw error;
    }
  }

  private async loadKnowledgeBase(): Promise<void> {
    try {
      const knowledgeBasePath = path.join(this.knowledgeBaseDir, 'current.json');
      const data = await fs.readFile(knowledgeBasePath, 'utf-8');
      this.currentKnowledgeBase = JSON.parse(data);
      console.log(`📚 Loaded knowledge base for industry: ${this.currentKnowledgeBase.industry}`);
    } catch (error) {
      // If no existing knowledge base, use default
      console.log('📚 Using default knowledge base');
      await this.saveKnowledgeBase();
    }
  }

  private async saveKnowledgeBase(): Promise<void> {
    try {
      const knowledgeBasePath = path.join(this.knowledgeBaseDir, 'current.json');
      await fs.writeFile(
        knowledgeBasePath, 
        JSON.stringify(this.currentKnowledgeBase, null, 2), 
        'utf-8'
      );
    } catch (error) {
      console.error('Failed to save knowledge base:', error);
      throw error;
    }
  }

  public getCurrentKnowledgeBase(): KnowledgeBase {
    return { ...this.currentKnowledgeBase };
  }

  public getSystemPrompt(): string {
    return this.currentKnowledgeBase.systemPrompt;
  }

  public getCurrentIndustry(): string {
    return this.currentKnowledgeBase.industry;
  }

  public async updateKnowledgeBase(updates: Partial<KnowledgeBase>): Promise<void> {
    console.log('🔄 Updating knowledge base...');
    
    this.currentKnowledgeBase = {
      ...this.currentKnowledgeBase,
      ...updates
    };
    
    await this.saveKnowledgeBase();
    console.log('✅ Knowledge base updated successfully');
  }

  public async updateSystemPrompt(prompt: string, industry?: string): Promise<void> {
    console.log('🔄 Updating system prompt...');
    
    this.currentKnowledgeBase.systemPrompt = prompt;
    if (industry) {
      this.currentKnowledgeBase.industry = industry;
    }
    
    await this.saveKnowledgeBase();
    console.log('✅ System prompt updated successfully');
  }

  public async loadIndustryTemplate(industry: string): Promise<KnowledgeBase | null> {
    try {
      const templatePath = path.join(this.templatesDir, `${industry}.json`);
      const data = await fs.readFile(templatePath, 'utf-8');
      return JSON.parse(data);
    } catch (error) {
      console.log(`📝 No template found for industry: ${industry}`);
      return null;
    }
  }

  public async saveIndustryTemplate(industry: string, template: KnowledgeBase): Promise<void> {
    try {
      const templatePath = path.join(this.templatesDir, `${industry}.json`);
      await fs.writeFile(
        templatePath, 
        JSON.stringify(template, null, 2), 
        'utf-8'
      );
      console.log(`✅ Saved template for industry: ${industry}`);
    } catch (error) {
      console.error(`Failed to save template for industry ${industry}:`, error);
      throw error;
    }
  }

  public findAnswer(query: string): QuestionAnswer | null {
    const normalizedQuery = query.toLowerCase();
    
    // Find best match based on keywords
    const matches = this.currentKnowledgeBase.commonQuestions.filter(qa => 
      qa.keywords.some(keyword => 
        normalizedQuery.includes(keyword.toLowerCase())
      )
    );
    
    if (matches.length === 0) {
      return null;
    }
    
    // Return the match with the most keyword matches
    return matches.reduce((best, current) => {
      const bestScore = best.keywords.filter(kw => 
        normalizedQuery.includes(kw.toLowerCase())
      ).length;
      
      const currentScore = current.keywords.filter(kw => 
        normalizedQuery.includes(kw.toLowerCase())
      ).length;
      
      return currentScore > bestScore ? current : best;
    });
  }

  public addQuestion(question: string, answer: string, keywords: string[], category?: string): void {
    const newQA: QuestionAnswer = {
      question,
      answer,
      keywords,
      category
    };
    
    this.currentKnowledgeBase.commonQuestions.push(newQA);
  }

  public async getAvailableTemplates(): Promise<string[]> {
    try {
      const files = await fs.readdir(this.templatesDir);
      return files
        .filter(file => file.endsWith('.json'))
        .map(file => file.replace('.json', ''));
    } catch (error) {
      console.error('Failed to get available templates:', error);
      return [];
    }
  }

  public generateContextualPrompt(userMessage: string): string {
    let prompt = this.currentKnowledgeBase.systemPrompt;
    
    // Add company information context
    const companyInfo = this.currentKnowledgeBase.companyInfo;
    prompt += `\n\nCompany Information:
- Name: ${companyInfo.name}
- Description: ${companyInfo.description}`;
    
    if (companyInfo.contactInfo.phone) {
      prompt += `\n- Phone: ${companyInfo.contactInfo.phone}`;
    }
    
    if (companyInfo.contactInfo.email) {
      prompt += `\n- Email: ${companyInfo.contactInfo.email}`;
    }
    
    // Add relevant FAQ if found
    const relevantQA = this.findAnswer(userMessage);
    if (relevantQA) {
      prompt += `\n\nRelevant Information:
Q: ${relevantQA.question}
A: ${relevantQA.answer}`;
    }
    
    return prompt;
  }

  private getDefaultSystemPrompt(): string {
    return `You are Revive, a professional voice assistant for qualifying prospects who submit demo requests. Your goal is to have a natural conversation to understand their needs and determine if they're a good fit.

Key Information to Gather:
1. Monthly lead volume (how many leads do they get per month?)
2. Follow-up timing (how quickly do they follow up with leads?)
3. Current automation (what tools/processes do they use now?)
4. Pain points (what challenges are they facing?)
5. Decision making (are they the decision maker?)
6. Timeline (when are they looking to implement?)
7. Budget awareness (do they have budget allocated?)

Conversation Guidelines:
- Be conversational and natural, not robotic
- Ask one question at a time
- Listen actively and build on their responses
- Use phrases like "That's interesting," "Tell me more about that," "I see"
- Keep questions open-ended when possible
- Transition smoothly between topics

Qualification Criteria:
✅ QUALIFIED: 50+ leads/month, quick follow-up issues, decision maker, ready in 3 months
⚠️ MAYBE: 20-49 leads/month, some pain points, involved in decision, 3-6 month timeline
❌ NOT QUALIFIED: <20 leads/month, no urgency, not decision maker, no timeline

Next Steps:
- If qualified: Offer to schedule a demo with our team
- If maybe qualified: Gather more info, then potentially schedule
- If not qualified: Politely thank them and suggest they reach out when ready

Remember: Be helpful and professional regardless of qualification status.`;
  }
} 