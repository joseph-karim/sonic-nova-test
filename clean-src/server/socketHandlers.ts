import { Server, Socket } from 'socket.io';
import { NovaSessionManager } from '../novaSonic/NovaSessionManager';
import { KnowledgeBaseManager } from '../knowledge/KnowledgeBaseManager';
import { AnalyticsManager } from '../admin/AnalyticsManager';
import { 
  SessionConfig, 
  AudioChunk, 
  ClientInfo,
  SocketEvents 
} from '../types';
import { generateSessionId, validateAudioChunk, getClientIP } from '../utils';

export function setupSocketHandlers(
    io: Server,
    activeSessions: Map<string, NovaSessionManager>,
    knowledgeBase: KnowledgeBaseManager,
    analytics: AnalyticsManager
): void {
    io.on('connection', (socket: Socket) => {
        console.log(`🎯 New client connected: ${socket.id}`);
        
        let currentSession: NovaSessionManager | null = null;

        socket.on('disconnect', () => {
            console.log(`📞 Client disconnected: ${socket.id}`);
            
            if (currentSession) {
                const analytics_data = currentSession.endSession();
                analytics.recordCall(analytics_data);
                activeSessions.delete(socket.id);
                currentSession = null;
            }
        });

        // Handle session start
        socket.on('start-session', async (config: Partial<SessionConfig>) => {
            try {
                console.log(`🚀 Starting session for client ${socket.id}`);
                
                // Generate session ID and prepare config
                const sessionId = generateSessionId();
                const knowledgeBase_data = knowledgeBase.getCurrentKnowledgeBase();
                
                const clientInfo: ClientInfo = {
                    userAgent: socket.handshake.headers['user-agent'] || 'unknown',
                    ipAddress: getClientIP(socket.request),
                    sessionStartTime: Date.now(),
                    lastActivity: Date.now()
                };

                const sessionConfig: SessionConfig = {
                    sessionId,
                    systemPrompt: config.systemPrompt || knowledgeBase.getSystemPrompt(),
                    knowledgeBase: knowledgeBase_data,
                    industry: config.industry || knowledgeBase.getCurrentIndustry(),
                    clientInfo
                };

                // Create and start session
                currentSession = new NovaSessionManager(sessionConfig);
                activeSessions.set(socket.id, currentSession);
                
                await currentSession.startSession();
                
                socket.emit('session-started', sessionId);
                console.log(`✅ Session ${sessionId} started successfully`);
                
            } catch (error) {
                console.error('❌ Session start error:', error);
                socket.emit('error', { 
                    message: 'Failed to start session',
                    code: 'SESSION_START_ERROR'
                });
            }
        });

        // Handle audio chunks
        socket.on('audio-chunk', async (chunk: AudioChunk) => {
            try {
                if (!currentSession || !currentSession.isActive()) {
                    socket.emit('error', { 
                        message: 'No active session',
                        code: 'NO_ACTIVE_SESSION'
                    });
                    return;
                }

                if (!validateAudioChunk(chunk)) {
                    socket.emit('error', { 
                        message: 'Invalid audio chunk format',
                        code: 'INVALID_AUDIO_CHUNK'
                    });
                    return;
                }

                console.log(`🎵 Processing audio chunk for session ${currentSession.getSessionId()}`);
                
                // Update last activity
                currentSession.updateClientInfo({ lastActivity: Date.now() });
                
                // Process audio with Nova Sonic
                const response = await currentSession.processAudioChunk(chunk);
                
                if (response) {
                    // Send text response back to client
                    socket.emit('text-response', response);
                    
                    // Send conversation update
                    const conversation = currentSession.getConversation();
                    socket.emit('conversation-update', conversation);
                    
                    console.log(`✅ Audio processed, response sent for session ${currentSession.getSessionId()}`);
                } else {
                    console.log(`⚠️ No response generated for audio chunk`);
                }
                
            } catch (error) {
                console.error('❌ Audio processing error:', error);
                socket.emit('error', { 
                    message: 'Audio processing failed',
                    code: 'AUDIO_PROCESSING_ERROR'
                });
            }
        });

        // Handle text messages
        socket.on('text-message', async (message: string) => {
            try {
                if (!currentSession || !currentSession.isActive()) {
                    socket.emit('error', { 
                        message: 'No active session',
                        code: 'NO_ACTIVE_SESSION'
                    });
                    return;
                }

                if (!message || typeof message !== 'string' || message.trim().length === 0) {
                    socket.emit('error', { 
                        message: 'Invalid message format',
                        code: 'INVALID_MESSAGE'
                    });
                    return;
                }

                console.log(`💬 Processing text message for session ${currentSession.getSessionId()}: "${message.substring(0, 50)}..."`);
                
                // Update last activity
                currentSession.updateClientInfo({ lastActivity: Date.now() });
                
                // Process text with Nova Sonic
                const response = await currentSession.processTextMessage(message.trim());
                
                if (response) {
                    // Send response back to client
                    socket.emit('text-response', response);
                    
                    // Send conversation update
                    const conversation = currentSession.getConversation();
                    socket.emit('conversation-update', conversation);
                    
                    console.log(`✅ Text processed, response sent for session ${currentSession.getSessionId()}`);
                } else {
                    console.log(`⚠️ No response generated for text message`);
                }
                
            } catch (error) {
                console.error('❌ Text processing error:', error);
                socket.emit('error', { 
                    message: 'Text processing failed',
                    code: 'TEXT_PROCESSING_ERROR'
                });
            }
        });

        // Handle session end
        socket.on('end-session', async () => {
            try {
                if (currentSession) {
                    console.log(`🏁 Ending session ${currentSession.getSessionId()}`);
                    
                    const analytics_data = currentSession.endSession();
                    analytics.recordCall(analytics_data);
                    
                    socket.emit('session-ended', analytics_data);
                    
                    activeSessions.delete(socket.id);
                    currentSession = null;
                    
                    console.log(`✅ Session ended successfully`);
                } else {
                    console.log(`⚠️ No active session to end`);
                }
            } catch (error) {
                console.error('❌ Session end error:', error);
                socket.emit('error', { 
                    message: 'Failed to end session',
                    code: 'SESSION_END_ERROR'
                });
            }
        });

        // Handle real-time analytics requests
        socket.on('get-analytics', () => {
            try {
                if (currentSession) {
                    const analytics_data = currentSession.getAnalytics();
                    socket.emit('analytics-update', analytics_data);
                }
            } catch (error) {
                console.error('❌ Analytics request error:', error);
                socket.emit('error', { 
                    message: 'Failed to get analytics',
                    code: 'ANALYTICS_ERROR'
                });
            }
        });

        // Handle knowledge base queries
        socket.on('search-knowledge', (query: string) => {
            try {
                if (!query || typeof query !== 'string') {
                    socket.emit('error', { 
                        message: 'Invalid search query',
                        code: 'INVALID_SEARCH'
                    });
                    return;
                }

                const result = knowledgeBase.findAnswer(query);
                socket.emit('knowledge-result', result);
                
            } catch (error) {
                console.error('❌ Knowledge search error:', error);
                socket.emit('error', { 
                    message: 'Knowledge search failed',
                    code: 'KNOWLEDGE_SEARCH_ERROR'
                });
            }
        });

        // Send initial system status
        socket.emit('system-status', {
            connected: true,
            timestamp: Date.now(),
            industry: knowledgeBase.getCurrentIndustry(),
            systemPrompt: knowledgeBase.getSystemPrompt()
        });
    });
} 