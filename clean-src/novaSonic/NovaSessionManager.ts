import { 
  BedrockRuntimeClient, 
  ConverseStreamCommand,
  ConverseStreamCommandInput,
  ConverseStreamCommandOutput
} from '@aws-sdk/client-bedrock-runtime';
import { fromNodeProviderChain } from '@aws-sdk/credential-providers';
import { 
  SessionConfig, 
  ConversationTurn, 
  AudioChunk, 
  SessionStatus, 
  ClientInfo,
  BedrockStreamEvent,
  CallAnalytics,
  ErrorLog
} from '../types';
import { config } from '../config/config';

/**
 * 🎯 Nova Sonic Session Manager
 * 
 * This class manages the lifecycle of Nova Sonic sessions, prompts, and content
 * to prevent ValidationException errors. It ensures proper state management and
 * prevents the "unclosed prompts" and "contents with no data" errors.
 */
export class NovaSessionManager {
    private sessionId: string;
    private bedrockClient: BedrockRuntimeClient;
    private conversation: ConversationTurn[];
    private status: SessionStatus;
    private startTime: number;
    private endTime?: number;
    private clientInfo?: ClientInfo;
    private systemPrompt: string;
    private knowledgeBase: any;
    private analytics: CallAnalytics;
    private errors: ErrorLog[];

    constructor(sessionConfig: SessionConfig) {
        this.sessionId = sessionConfig.sessionId;
        this.conversation = [];
        this.status = 'initializing';
        this.startTime = Date.now();
        this.clientInfo = sessionConfig.clientInfo;
        this.systemPrompt = sessionConfig.systemPrompt;
        this.knowledgeBase = sessionConfig.knowledgeBase;
        this.errors = [];
        
        // Initialize analytics
        this.analytics = {
            sessionId: this.sessionId,
            startTime: this.startTime,
            turnCount: 0,
            transcript: [],
            knowledgeGaps: [],
            errors: []
        };

        // Initialize Bedrock client
        this.bedrockClient = new BedrockRuntimeClient({
            region: config.aws.region,
            credentials: fromNodeProviderChain({
                timeout: 30000,
                maxRetries: 3
            })
        });

        console.log(`✅ Nova session ${this.sessionId} initialized`);
    }

    public async startSession(): Promise<void> {
        try {
            this.status = 'active';
            console.log(`🎯 Session ${this.sessionId} started`);
            
            // Add system prompt as first conversation turn
            this.conversation.push({
                role: 'assistant',
                content: 'Hello! I\'m your voice assistant. How can I help you today?',
                timestamp: Date.now()
            });
            
        } catch (error) {
            this.handleError('Failed to start session', error);
            throw error;
        }
    }

    public async processAudioChunk(audioChunk: AudioChunk): Promise<string | null> {
        if (this.status !== 'active') {
            throw new Error(`Session ${this.sessionId} is not active`);
        }

        try {
            this.status = 'processing';
            
            // Convert audio chunk to base64 for Bedrock
            const audioBase64 = Buffer.from(audioChunk.data).toString('base64');
            
            // Prepare the conversation for Bedrock
            const messages = this.prepareMessages();
            
            // Add the audio input
            messages.push({
                role: 'user',
                content: [
                    {
                        audio: {
                            format: 'pcm',
                            data: audioBase64
                        }
                    }
                ]
            });

            const input: ConverseStreamCommandInput = {
                modelId: config.bedrock.modelId,
                messages: messages,
                system: [{ text: this.systemPrompt }],
                inferenceConfig: {
                    maxTokens: config.bedrock.maxTokens,
                    temperature: config.bedrock.temperature,
                    topP: config.bedrock.topP,
                    stopSequences: config.bedrock.stopSequences
                }
            };

            const command = new ConverseStreamCommand(input);
            const response = await this.bedrockClient.send(command);
            const responseText = await this.processStreamResponse(response);
            
            this.status = 'active';
            return responseText;
            
        } catch (error) {
            this.status = 'active'; // Reset to active state
            this.handleError('Failed to process audio chunk', error);
            return null;
        }
    }

    public async processTextMessage(message: string): Promise<string | null> {
        if (this.status !== 'active') {
            throw new Error(`Session ${this.sessionId} is not active`);
        }

        try {
            this.status = 'processing';
            
            // Add user message to conversation
            const userTurn: ConversationTurn = {
                role: 'user',
                content: message,
                timestamp: Date.now()
            };
            this.conversation.push(userTurn);
            this.analytics.turnCount++;

            // Prepare messages for Bedrock
            const messages = this.prepareMessages();

            const input: ConverseStreamCommandInput = {
                modelId: config.bedrock.modelId,
                messages: messages,
                system: [{ text: this.systemPrompt }],
                inferenceConfig: {
                    maxTokens: config.bedrock.maxTokens,
                    temperature: config.bedrock.temperature,
                    topP: config.bedrock.topP,
                    stopSequences: config.bedrock.stopSequences
                }
            };

            const command = new ConverseStreamCommand(input);
            const response = await this.bedrockClient.send(command);
            const responseText = await this.processStreamResponse(response);
            
            if (responseText) {
                // Add assistant response to conversation
                const assistantTurn: ConversationTurn = {
                    role: 'assistant',
                    content: responseText,
                    timestamp: Date.now()
                };
                this.conversation.push(assistantTurn);
                this.analytics.transcript = [...this.conversation];
            }
            
            this.status = 'active';
            return responseText;
            
        } catch (error) {
            this.status = 'active'; // Reset to active state
            this.handleError('Failed to process text message', error);
            return null;
        }
    }

    private async processStreamResponse(response: ConverseStreamCommandOutput): Promise<string | null> {
        let fullText = '';
        
        try {
            if (response.stream) {
                for await (const chunk of response.stream) {
                    if (chunk.contentBlockDelta?.delta?.text) {
                        fullText += chunk.contentBlockDelta.delta.text;
                    }
                    
                    if (chunk.messageStop) {
                        break;
                    }
                }
            }
            
            return fullText || null;
        } catch (error) {
            this.handleError('Failed to process stream response', error);
            return null;
        }
    }

    private prepareMessages(): any[] {
        return this.conversation.map(turn => ({
            role: turn.role,
            content: [{ text: turn.content }]
        }));
    }

    public endSession(): CallAnalytics {
        console.log(`🏁 Ending session ${this.sessionId}`);
        
        this.status = 'ended';
        this.endTime = Date.now();
        
        // Finalize analytics
        this.analytics.endTime = this.endTime;
        this.analytics.duration = this.endTime - this.startTime;
        this.analytics.transcript = [...this.conversation];
        this.analytics.errors = [...this.errors];
        
        // Determine outcome based on conversation
        this.analytics.outcome = this.determineOutcome();
        
        return this.analytics;
    }

    private determineOutcome(): 'qualified' | 'not-qualified' | 'incomplete' {
        // Simple heuristic - can be enhanced with more sophisticated logic
        if (this.conversation.length < 3) {
            return 'incomplete';
        }
        
        const conversationText = this.conversation
            .map(turn => turn.content.toLowerCase())
            .join(' ');
        
        // Look for qualification indicators
        const qualificationKeywords = [
            'interested', 'schedule', 'meeting', 'demo', 'qualified',
            'budget', 'decision maker', 'timeline'
        ];
        
        const hasQualificationIndicators = qualificationKeywords.some(keyword => 
            conversationText.includes(keyword)
        );
        
        return hasQualificationIndicators ? 'qualified' : 'not-qualified';
    }

    private handleError(context: string, error: any): void {
        const errorLog: ErrorLog = {
            timestamp: Date.now(),
            error: error instanceof Error ? error.message : String(error),
            context,
            severity: 'medium'
        };
        
        this.errors.push(errorLog);
        console.error(`❌ Session ${this.sessionId} - ${context}:`, error);
        
        if (this.status !== 'ended') {
            this.status = 'error';
        }
    }

    // Getters
    public getSessionId(): string {
        return this.sessionId;
    }

    public getStatus(): SessionStatus {
        return this.status;
    }

    public getStartTime(): number {
        return this.startTime;
    }

    public getConversation(): ConversationTurn[] {
        return [...this.conversation];
    }

    public getClientInfo(): ClientInfo | undefined {
        return this.clientInfo;
    }

    public getAnalytics(): CallAnalytics {
        return {
            ...this.analytics,
            transcript: [...this.conversation],
            errors: [...this.errors]
        };
    }

    // Session management
    public isActive(): boolean {
        return this.status === 'active' || this.status === 'processing';
    }

    public updateClientInfo(clientInfo: Partial<ClientInfo>): void {
        if (this.clientInfo) {
            this.clientInfo = {
                ...this.clientInfo,
                ...clientInfo,
                lastActivity: Date.now()
            };
        } else {
            this.clientInfo = {
                sessionStartTime: Date.now(),
                lastActivity: Date.now(),
                ...clientInfo
            };
        }
    }
} 