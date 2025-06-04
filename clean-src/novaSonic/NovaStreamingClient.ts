import { fromIni } from '@aws-sdk/credential-providers';

/**
 * 🌊 Nova Sonic Streaming Client
 * 
 * Wraps the Nova Sonic bidirectional streaming client with proper session management
 * to prevent ValidationException errors. This implementation ensures proper lifecycle
 * management of sessions, prompts, and content.
 */
export interface NovaClientConfig {
    region: string;
    profile: string;
    maxConcurrentStreams?: number;
}

export interface StreamEventHandlers {
    textOutput?: (data: any) => void;
    audioOutput?: (data: any) => void;
    toolUse?: (data: any) => void;
    toolResult?: (data: any) => void;
    contentStart?: (data: any) => void;
    error?: (error: any) => void;
    streamComplete?: () => void;
}

export class NovaStreamingClient {
    private clientConfig: NovaClientConfig;
    private nativeClient: any;
    private activeSessions: Map<string, any>;

    constructor(config: NovaClientConfig) {
        this.clientConfig = config;
        this.activeSessions = new Map();
        this.initializeClient();
    }

    private async initializeClient(): Promise<void> {
        try {
            // Dynamically import the working Nova Sonic client
            const { NovaSonicBidirectionalStreamClient } = require('../../backup-working/dist/client');
            
            this.nativeClient = new NovaSonicBidirectionalStreamClient({
                requestHandlerConfig: {
                    maxConcurrentStreams: this.clientConfig.maxConcurrentStreams || 10,
                },
                clientConfig: {
                    region: this.clientConfig.region,
                    credentials: fromIni({ profile: this.clientConfig.profile })
                }
            });

            console.log('✅ Nova Sonic client initialized successfully');
        } catch (error) {
            console.error('❌ Failed to initialize Nova Sonic client:', error);
            throw error;
        }
    }

    public createStreamSession(sessionId: string): any {
        if (!this.nativeClient) {
            throw new Error('Nova Sonic client not initialized');
        }

        const session = this.nativeClient.createStreamSession(sessionId);
        this.activeSessions.set(sessionId, session);
        
        console.log(`🌊 Stream session created: ${sessionId}`);
        return session;
    }

    public getStreamSession(sessionId: string): any {
        return this.activeSessions.get(sessionId);
    }

    public closeStreamSession(sessionId: string): void {
        const session = this.activeSessions.get(sessionId);
        if (session) {
            try {
                session.close();
            } catch (error) {
                console.error(`Error closing session ${sessionId}:`, error);
            }
            this.activeSessions.delete(sessionId);
            console.log(`🛑 Stream session closed: ${sessionId}`);
        }
    }

    public isSessionActive(sessionId: string): boolean {
        return this.activeSessions.has(sessionId);
    }

    public setExternalToolProcessor(processor: (toolName: string, toolContent: any) => Promise<any>): void {
        if (this.nativeClient) {
            this.nativeClient.setExternalToolProcessor(processor);
        }
    }

    public getAllActiveSessions(): string[] {
        return Array.from(this.activeSessions.keys());
    }

    public closeAllSessions(): void {
        this.activeSessions.forEach((session, sessionId) => {
            this.closeStreamSession(sessionId);
        });
    }
} 