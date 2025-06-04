"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const http_1 = __importDefault(require("http"));
const path_1 = __importDefault(require("path"));
const socket_io_1 = require("socket.io");
const dotenv_1 = require("dotenv");
const client_bedrock_runtime_1 = require("@aws-sdk/client-bedrock-runtime");
const node_http_handler_1 = require("@smithy/node-http-handler");
const node_crypto_1 = require("node:crypto");
// Load environment variables
(0, dotenv_1.config)();
// Create Express app and HTTP server
const app = (0, express_1.default)();
const server = http_1.default.createServer(app);
const io = new socket_io_1.Server(server);
// Create the AWS Bedrock client with HTTP/2 support
const nodeHttp2Handler = new node_http_handler_1.NodeHttp2Handler({
    requestTimeout: 300000,
    sessionTimeout: 300000,
});
const bedrockClient = new client_bedrock_runtime_1.BedrockRuntimeClient({
    region: process.env.AWS_REGION || 'us-east-1',
    requestHandler: nodeHttp2Handler,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    }
});
// Class to manage Nova Sonic sessions with proper lifecycle management
class NovaSessionManager {
    constructor(client) {
        this.sessionId = null;
        this.promptId = null;
        this.contentId = null;
        this.isSessionActive = false;
        this.isPromptActive = false;
        this.isContentActive = false;
        this.client = client;
    }
    async startSession() {
        if (this.isSessionActive) {
            throw new Error('Session already active');
        }
        this.sessionId = (0, node_crypto_1.randomUUID)();
        this.isSessionActive = true;
        console.log(`Session started: ${this.sessionId}`);
        return this.sessionId;
    }
    async startPrompt() {
        if (!this.isSessionActive) {
            throw new Error('No active session');
        }
        if (this.isPromptActive) {
            throw new Error('Prompt already active');
        }
        this.promptId = (0, node_crypto_1.randomUUID)();
        this.isPromptActive = true;
        console.log(`Prompt started: ${this.promptId}`);
        return this.promptId;
    }
    async startContent() {
        if (!this.isPromptActive) {
            throw new Error('No active prompt');
        }
        if (this.isContentActive) {
            throw new Error('Content already active');
        }
        this.contentId = (0, node_crypto_1.randomUUID)();
        this.isContentActive = true;
        console.log(`Content started: ${this.contentId}`);
        return this.contentId;
    }
    async endContent() {
        if (!this.isContentActive) {
            throw new Error('No active content to end');
        }
        this.isContentActive = false;
        console.log(`Content ended: ${this.contentId}`);
        this.contentId = null;
    }
    async endPrompt() {
        if (!this.isPromptActive) {
            throw new Error('No active prompt to end');
        }
        // Ensure content is closed first
        if (this.isContentActive) {
            await this.endContent();
        }
        this.isPromptActive = false;
        console.log(`Prompt ended: ${this.promptId}`);
        this.promptId = null;
    }
    async endSession() {
        if (!this.isSessionActive) {
            return; // Already ended
        }
        // Ensure prompt is closed first
        if (this.isPromptActive) {
            await this.endPrompt();
        }
        this.isSessionActive = false;
        console.log(`Session ended: ${this.sessionId}`);
        this.sessionId = null;
    }
    getSessionId() {
        return this.sessionId;
    }
    getPromptId() {
        return this.promptId;
    }
    getContentId() {
        return this.contentId;
    }
    isActive() {
        return this.isSessionActive;
    }
}
// Store active sessions
const activeSessions = new Map();
// Serve static files from the public directory
app.use(express_1.default.static(path_1.default.join(__dirname, '../public')));
// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});
// Handle Socket.IO connections
io.on('connection', (socket) => {
    console.log('New client connected:', socket.id);
    // Create session manager for this client
    const sessionManager = new NovaSessionManager(bedrockClient);
    activeSessions.set(socket.id, sessionManager);
    // Handle session start
    socket.on('start_session', async (data) => {
        try {
            console.log('Starting Nova Sonic session for client:', socket.id);
            // Start session
            const sessionId = await sessionManager.startSession();
            // Configure system prompt
            const systemPrompt = process.env.SYSTEM_PROMPT ||
                "You are a helpful voice assistant. Respond naturally and conversationally.";
            // Create the bidirectional streaming command with correct format
            const command = new client_bedrock_runtime_1.InvokeModelWithBidirectionalStreamCommand({
                modelId: "amazon.nova-sonic-v1:0",
                body: createEventStream(sessionManager, systemPrompt)
            });
            // Start streaming
            const response = await bedrockClient.send(command);
            if (response.body) {
                processResponseStream(response.body, socket, sessionManager);
            }
            socket.emit('session_ready');
        }
        catch (error) {
            console.error('Error starting session:', error);
            socket.emit('error', { message: 'Failed to start session' });
            await sessionManager.endSession();
        }
    });
    // Handle audio input
    socket.on('audio_input', async (data) => {
        try {
            const sessionManager = activeSessions.get(socket.id);
            if (!sessionManager || !sessionManager.isActive()) {
                socket.emit('error', { message: 'No active session' });
                return;
            }
            // Process audio input - this would need to be sent to the active stream
            // For now, we'll log it
            console.log('Received audio data:', data.length, 'bytes');
        }
        catch (error) {
            console.error('Error processing audio input:', error);
            socket.emit('error', { message: 'Failed to process audio' });
        }
    });
    // Handle disconnect
    socket.on('disconnect', async () => {
        console.log('Client disconnected:', socket.id);
        const sessionManager = activeSessions.get(socket.id);
        if (sessionManager) {
            await sessionManager.endSession();
            activeSessions.delete(socket.id);
        }
    });
});
// Create event stream with proper AWS SDK format
async function* createEventStream(sessionManager, systemPrompt) {
    try {
        // 1. Start session event
        const sessionId = sessionManager.getSessionId();
        if (!sessionId) {
            throw new Error('No active session');
        }
        yield {
            chunk: {
                bytes: new TextEncoder().encode(JSON.stringify({
                    sessionStart: {
                        sessionId: sessionId,
                        inferenceConfiguration: {
                            maxTokens: 1024,
                            topP: 0.9,
                            temperature: 0.7
                        }
                    }
                }))
            }
        };
        // 2. Start prompt event
        const promptId = await sessionManager.startPrompt();
        yield {
            chunk: {
                bytes: new TextEncoder().encode(JSON.stringify({
                    promptStart: {
                        promptId: promptId,
                        textOutputConfiguration: {
                            mediaType: "text/plain"
                        },
                        audioOutputConfiguration: {
                            audioType: "SPEECH",
                            encoding: "base64",
                            mediaType: "audio/lpcm",
                            sampleRateHertz: 24000,
                            sampleSizeBits: 16,
                            channelCount: 1,
                            voiceId: "tiffany"
                        }
                    }
                }))
            }
        };
        // 3. Start content event
        const contentId = await sessionManager.startContent();
        yield {
            chunk: {
                bytes: new TextEncoder().encode(JSON.stringify({
                    contentStart: {
                        promptId: promptId,
                        contentId: contentId,
                        type: "TEXT",
                        role: "SYSTEM",
                        textInputConfiguration: {
                            mediaType: "text/plain"
                        }
                    }
                }))
            }
        };
        // 4. Send system prompt as text input
        yield {
            chunk: {
                bytes: new TextEncoder().encode(JSON.stringify({
                    textInput: {
                        promptId: promptId,
                        contentId: contentId,
                        content: systemPrompt
                    }
                }))
            }
        };
        // 5. End content
        await sessionManager.endContent();
        yield {
            chunk: {
                bytes: new TextEncoder().encode(JSON.stringify({
                    contentEnd: {
                        promptId: promptId,
                        contentId: contentId
                    }
                }))
            }
        };
        // 6. End prompt  
        await sessionManager.endPrompt();
        yield {
            chunk: {
                bytes: new TextEncoder().encode(JSON.stringify({
                    promptEnd: {
                        promptId: promptId
                    }
                }))
            }
        };
        console.log('Initial session setup completed successfully');
        // Keep the stream alive for future interactions
        // In a real implementation, we would yield new events as they come
    }
    catch (error) {
        console.error('Error in event stream:', error);
        // Ensure cleanup on error
        await sessionManager.endSession();
        throw error;
    }
}
// Process response stream from Nova Sonic
async function processResponseStream(stream, socket, sessionManager) {
    try {
        for await (const event of stream) {
            if (event.chunk?.bytes) {
                try {
                    const textResponse = new TextDecoder().decode(event.chunk.bytes);
                    const jsonResponse = JSON.parse(textResponse);
                    console.log('📨 Received event:', Object.keys(jsonResponse));
                    if (jsonResponse.textOutput) {
                        const content = jsonResponse.textOutput.content;
                        const role = jsonResponse.textOutput.role || 'assistant';
                        console.log(`💬 Text output (${role}):`, content);
                        socket.emit('transcript', {
                            role: role,
                            content: content
                        });
                    }
                    else if (jsonResponse.audioOutput) {
                        console.log('🔊 Audio output received, sending to client');
                        const audioBase64 = jsonResponse.audioOutput.content;
                        socket.emit('audioResponse', audioBase64);
                    }
                    else if (jsonResponse.contentStart) {
                        console.log('📝 Content start:', jsonResponse.contentStart.type);
                    }
                    else if (jsonResponse.contentEnd) {
                        console.log('📝 Content end');
                    }
                    else if (jsonResponse.completionEnd) {
                        console.log('🏁 Completion end - conversation finished');
                    }
                }
                catch (parseError) {
                    console.error('❌ Error parsing response:', parseError);
                    console.log('Raw response:', new TextDecoder().decode(event.chunk.bytes).substring(0, 200));
                }
            }
            else if (event.modelStreamErrorException) {
                console.error('❌ Model stream error:', event.modelStreamErrorException);
                socket.emit('error', { message: 'Model stream error' });
            }
            else if (event.internalServerException) {
                console.error('❌ Internal server error:', event.internalServerException);
                socket.emit('error', { message: 'Internal server error' });
            }
            else if (event.error) {
                console.error('Stream error:', event.error);
                socket.emit('error', { message: event.error.message });
                break;
            }
        }
    }
    catch (error) {
        console.error('Error processing response stream:', error);
        socket.emit('error', { message: 'Stream processing failed' });
    }
    finally {
        // Ensure session cleanup
        await sessionManager.endSession();
    }
}
// Start the server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
    console.log(`Open http://localhost:${PORT} in your browser to access the application`);
});
// Graceful shutdown
process.on('SIGTERM', async () => {
    console.log('SIGTERM received, shutting down gracefully');
    // Close all active sessions
    for (const [clientId, sessionManager] of activeSessions) {
        await sessionManager.endSession();
    }
    activeSessions.clear();
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});
process.on('SIGINT', async () => {
    console.log('SIGINT received, shutting down gracefully');
    // Close all active sessions
    for (const [clientId, sessionManager] of activeSessions) {
        await sessionManager.endSession();
    }
    activeSessions.clear();
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});
