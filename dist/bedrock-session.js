"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BedrockSessionManager = exports.StreamSession = void 0;
const client_bedrock_runtime_1 = require("@aws-sdk/client-bedrock-runtime");
const node_http_handler_1 = require("@smithy/node-http-handler");
const node_crypto_1 = require("node:crypto");
const rxjs_1 = require("rxjs");
const rxjs_2 = require("rxjs");
const consts_1 = require("./consts");
const hotel_confirmation_1 = require("./hotel-confirmation");
class StreamSession {
    constructor(sessionId, client // Updated class name reference
    ) {
        this.sessionId = sessionId;
        this.client = client;
        this.audioBufferQueue = [];
        this.maxQueueSize = 200; // Maximum number of audio chunks to queue
        this.isProcessingAudio = false;
        this.isActive = true;
    }
    // Register event handlers for this specific session
    onEvent(eventType, handler) {
        this.client.registerEventHandler(this.sessionId, eventType, handler);
        return this; // For chaining
    }
    async setupPromptStart() {
        this.client.setupPromptStartEvent(this.sessionId);
    }
    async setupSystemPrompt(textConfig = consts_1.DefaultTextConfiguration, systemPromptContent = consts_1.DefaultSystemPrompt) {
        this.client.setupSystemPromptEvent(this.sessionId, textConfig, systemPromptContent);
    }
    async setupHistoryForConversationResumtion(textConfig = consts_1.DefaultTextConfiguration, content, role) {
        this.client.setupHistoryEventForConversationResumption(this.sessionId, textConfig, content, role);
    }
    async setupStartAudio(audioConfig = consts_1.DefaultAudioInputConfiguration) {
        this.client.setupStartAudioEvent(this.sessionId, audioConfig);
    }
    // Stream audio for this session
    async streamAudio(audioData) {
        // Check queue size to avoid memory issues
        if (this.audioBufferQueue.length >= this.maxQueueSize) {
            // Queue is full, drop oldest chunk
            this.audioBufferQueue.shift();
            console.log("Audio queue full, dropping oldest chunk");
        }
        // Queue the audio chunk for streaming
        this.audioBufferQueue.push(audioData);
        this.processAudioQueue();
    }
    // Process audio queue for continuous streaming
    async processAudioQueue() {
        if (this.isProcessingAudio || this.audioBufferQueue.length === 0 || !this.isActive)
            return;
        this.isProcessingAudio = true;
        try {
            // Process all chunks in the queue, up to a reasonable limit
            let processedChunks = 0;
            const maxChunksPerBatch = 5; // Process max 5 chunks at a time to avoid overload
            while (this.audioBufferQueue.length > 0 && processedChunks < maxChunksPerBatch && this.isActive) {
                const audioChunk = this.audioBufferQueue.shift();
                if (audioChunk) {
                    await this.client.streamAudioChunk(this.sessionId, audioChunk);
                    processedChunks++;
                }
            }
        }
        finally {
            this.isProcessingAudio = false;
            // If there are still items in the queue, schedule the next processing using setTimeout
            if (this.audioBufferQueue.length > 0 && this.isActive) {
                setTimeout(() => this.processAudioQueue(), 0);
            }
        }
    }
    // Get session ID
    getSessionId() {
        return this.sessionId;
    }
    async endAudioContent() {
        if (!this.isActive)
            return;
        await this.client.sendContentEnd(this.sessionId);
    }
    async endPrompt() {
        if (!this.isActive)
            return;
        await this.client.sendPromptEnd(this.sessionId);
    }
    async close() {
        if (!this.isActive)
            return;
        this.isActive = false;
        this.audioBufferQueue = []; // Clear any pending audio
        await this.client.sendSessionEnd(this.sessionId);
        console.log(`Session ${this.sessionId} close completed`);
    }
}
exports.StreamSession = StreamSession;
class BedrockSessionManager {
    constructor(config) {
        this.activeSessions = new Map();
        this.sessionLastActivity = new Map();
        this.sessionCleanupInProgress = new Set();
        const nodeHttp2Handler = new node_http_handler_1.NodeHttp2Handler({
            requestTimeout: 300000,
            sessionTimeout: 300000,
            disableConcurrentStreams: false,
            maxConcurrentStreams: 20,
            ...config.requestHandlerConfig,
        });
        if (!config.clientConfig.credentials) {
            throw new Error("No credentials provided");
        }
        this.bedrockRuntimeClient = new client_bedrock_runtime_1.BedrockRuntimeClient({
            ...config.clientConfig,
            credentials: config.clientConfig.credentials,
            region: config.clientConfig.region || "us-east-1",
            requestHandler: nodeHttp2Handler
        });
        this.inferenceConfig = config.inferenceConfig ?? {
            maxTokens: 1024,
            topP: 0.9,
            temperature: 0.7,
        };
        // Start the inactivity cleanup interval
        setInterval(() => this.cleanupInactiveSessions(), 60000); // Check every minute
    }
    isSessionActive(sessionId) {
        const session = this.activeSessions.get(sessionId);
        return !!session && session.isActive;
    }
    updateLastActivity(sessionId) {
        this.sessionLastActivity.set(sessionId, Date.now());
    }
    // Register an event handler for a specific session and event type
    registerEventHandler(sessionId, eventType, handler) {
        const session = this.activeSessions.get(sessionId);
        if (session) {
            session.responseHandlers.set(eventType, handler);
            this.updateLastActivity(sessionId);
        }
    }
    // Unregister an event handler
    unregisterEventHandler(sessionId, eventType) {
        const session = this.activeSessions.get(sessionId);
        if (session) {
            session.responseHandlers.delete(eventType);
            this.updateLastActivity(sessionId);
        }
    }
    // Dispatch an event to the appropriate handler for the session
    dispatchEvent(sessionId, eventType, data) {
        const session = this.activeSessions.get(sessionId);
        if (session && session.isActive) {
            this.updateLastActivity(sessionId);
            const handler = session.responseHandlers.get(eventType);
            if (handler) {
                try {
                    handler(data);
                }
                catch (error) {
                    console.error(`Error handling event ${eventType} for session ${sessionId}:`, error);
                    // Optionally, handle the error further (e.g., notify the client, close the session)
                }
            }
            else {
                // console.log(`No handler registered for event ${eventType} in session ${sessionId}`);
            }
        }
        else {
            // console.log(`Attempted to dispatch event ${eventType} to inactive or non-existent session ${sessionId}`);
        }
    }
    createNewSession(sessionId = (0, node_crypto_1.randomUUID)()) {
        if (this.activeSessions.has(sessionId)) {
            throw new Error(`Session with ID ${sessionId} already exists`);
        }
        console.log(`Creating new session: ${sessionId}`);
        const sessionData = {
            queue: [],
            queueSignal: new rxjs_1.Subject(),
            closeSignal: new rxjs_1.Subject(),
            responseSubject: new rxjs_1.Subject(),
            responseHandlers: new Map(), // Initialize response handlers map
            toolUseContent: {},
            toolUseId: "",
            toolName: "",
            promptName: "",
            inferenceConfig: { ...this.inferenceConfig }, // Copy default config
            isActive: true,
            isPromptStartSent: false,
            isAudioContentStartSent: false,
            audioContentId: (0, node_crypto_1.randomUUID)(), // Unique ID for audio content within the session
        };
        this.activeSessions.set(sessionId, sessionData);
        this.updateLastActivity(sessionId);
        // Start the Bedrock stream immediately for this session
        this.startBedrockStream(sessionId);
        return new StreamSession(sessionId, this);
    }
    async cleanupInactiveSessions() {
        const now = Date.now();
        const inactivityThreshold = 30 * 60 * 1000; // 30 minutes
        for (const [sessionId, lastActivity] of this.sessionLastActivity.entries()) {
            if (now - lastActivity > inactivityThreshold && !this.sessionCleanupInProgress.has(sessionId)) {
                console.log(`Session ${sessionId} inactive for over ${inactivityThreshold / 60000} minutes. Initiating cleanup.`);
                this.sessionCleanupInProgress.add(sessionId); // Mark as cleanup in progress
                try {
                    const session = this.activeSessions.get(sessionId);
                    if (session && session.isActive) {
                        // Attempt to gracefully close the session
                        const streamSession = new StreamSession(sessionId, this);
                        await streamSession.close(); // This calls sendSessionEnd
                    }
                    else {
                        // If already inactive or doesn't exist, just remove data
                        this.removeSessionData(sessionId);
                    }
                }
                catch (error) {
                    console.error(`Error during automatic cleanup of session ${sessionId}:`, error);
                    // Ensure removal even if close fails
                    this.removeSessionData(sessionId);
                }
                finally {
                    this.sessionCleanupInProgress.delete(sessionId); // Cleanup finished
                }
            }
        }
    }
    removeSessionData(sessionId) {
        this.activeSessions.delete(sessionId);
        this.sessionLastActivity.delete(sessionId);
        console.log(`Session ${sessionId} data removed.`);
    }
    getSessionData(sessionId) {
        const session = this.activeSessions.get(sessionId);
        if (!session || !session.isActive) {
            console.warn(`Attempted to access inactive or non-existent session: ${sessionId}`);
            return undefined; // Or throw an error if preferred
        }
        this.updateLastActivity(sessionId); // Update activity on access
        return session;
    }
    // --------------- Stream Management ---------------
    async *createInputStream(sessionId) {
        const session = this.getSessionData(sessionId);
        if (!session) {
            console.error(`Session ${sessionId} not found or inactive for input stream creation.`);
            // If session is gone, we should stop yielding to prevent hanging
            return;
        }
        while (session.isActive) {
            // Wait for an item to be added to the queue or for the session to close
            await Promise.race([
                (0, rxjs_2.firstValueFrom)(session.queueSignal), // Signal that an item is ready
                (0, rxjs_2.firstValueFrom)(session.closeSignal), // Signal that the session is closing
            ]);
            // If the session is no longer active after waiting, break the loop
            if (!session.isActive) {
                console.log(`Input stream for session ${sessionId} stopping: session inactive.`);
                break;
            }
            // Process items currently in the queue
            while (session.queue.length > 0) {
                const event = session.queue.shift();
                if (event) {
                    // console.log("Sending event:", JSON.stringify(event));
                    yield event; // Yield the event directly
                }
            }
        }
        console.log(`Input stream generator for session ${sessionId} ended.`);
    }
    async processOutputStream(sessionId, stream) {
        const session = this.getSessionData(sessionId);
        if (!session) {
            console.error(`Session ${sessionId} not found or inactive for output stream processing.`);
            return; // Stop processing if session is invalid
        }
        console.log(`Starting to process output stream for session: ${sessionId}`);
        try {
            for await (const eventWrapper of stream) {
                // Ensure session is still active before processing
                if (!session.isActive) {
                    console.log(`Output stream processing stopped for session ${sessionId}: session became inactive.`);
                    break; // Exit the loop if the session is closed externally
                }
                // Extract the actual event payload
                const event = eventWrapper.payload;
                // console.log("Received event:", JSON.stringify(event)); // Detailed logging
                if (event.invocationType === "START") {
                    this.dispatchEvent(sessionId, 'invocationStart', event);
                }
                else if (event.invocationType === "FINISH") {
                    this.dispatchEvent(sessionId, 'invocationFinish', event);
                }
                else if (event.invocationType === "MODEL_STREAM") {
                    this.dispatchEvent(sessionId, 'modelStream', event);
                    if (event.action === 'TEXT_CHUNK') {
                        this.dispatchEvent(sessionId, 'textChunk', event.chunk);
                    }
                    else if (event.action === 'AUDIO_CHUNK') {
                        this.dispatchEvent(sessionId, 'audioChunk', event.chunk);
                    }
                }
                else if (event.invocationType === 'TOOL_START') {
                    console.log("Tool Start Event Received:", JSON.stringify(event, null, 2));
                    this.dispatchEvent(sessionId, 'toolStart', event);
                    if (event.action === 'TOOL_USE_START') {
                        session.toolUseContent = {}; // Reset tool content for new use
                        session.toolUseId = event.toolUseId;
                        session.toolName = event.toolConfiguration.name;
                        console.log(`Tool Use Started: ID=${session.toolUseId}, Name=${session.toolName}`);
                        this.dispatchEvent(sessionId, 'toolUseStart', { toolUseId: session.toolUseId, toolName: session.toolName });
                    }
                    else if (event.action === 'TOOL_INPUT_CHUNK') {
                        const chunkContent = event.chunk.content;
                        // Assuming chunk content is always a string for now
                        session.toolUseContent[chunkContent.key] = (session.toolUseContent[chunkContent.key] || '') + chunkContent.value;
                        console.log(`Tool Input Chunk Received: ID=${session.toolUseId}, Key=${chunkContent.key}`);
                        this.dispatchEvent(sessionId, 'toolInputChunk', { toolUseId: session.toolUseId, key: chunkContent.key, value: chunkContent.value });
                    }
                }
                else if (event.invocationType === 'TOOL_END') {
                    console.log("Tool End Event Received:", JSON.stringify(event, null, 2));
                    this.dispatchEvent(sessionId, 'toolEnd', event);
                    if (event.action === 'TOOL_USE_END') {
                        console.log(`Tool Use Ended: ID=${session.toolUseId}. Invoking tool: ${session.toolName} with content:`, session.toolUseContent);
                        this.dispatchEvent(sessionId, 'toolUseEnd', { toolUseId: session.toolUseId, toolName: session.toolName, toolInput: session.toolUseContent });
                        // Call the tool handler
                        try {
                            const toolResult = await (0, hotel_confirmation_1.handleToolCall)({
                                toolUseId: session.toolUseId,
                                toolName: session.toolName,
                                toolInput: session.toolUseContent
                            });
                            console.log(`Tool ${session.toolName} executed. Result:`, toolResult);
                            this.dispatchEvent(sessionId, 'toolResult', { toolUseId: session.toolUseId, toolName: session.toolName, toolResult });
                            // Send the tool result back to Bedrock
                            await this.sendToolResult(sessionId, session.toolUseId, toolResult);
                        }
                        catch (error) {
                            console.error(`Error executing tool ${session.toolName}:`, error);
                            this.dispatchEvent(sessionId, 'toolError', { toolUseId: session.toolUseId, toolName: session.toolName, error });
                            // Send an error result back? Or handle differently?
                            // For now, sending an error status back.
                            await this.sendToolError(sessionId, session.toolUseId, error instanceof Error ? error.message : String(error));
                        }
                        // Reset tool tracking info after handling
                        session.toolUseContent = {};
                        session.toolUseId = "";
                        session.toolName = "";
                    }
                    else if (event.action === 'TOOL_ERROR') {
                        console.error(`Tool Error Reported by Bedrock: ID=${event.toolUseId}, Message=${event.message}`);
                        this.dispatchEvent(sessionId, 'toolUseError', { toolUseId: event.toolUseId, message: event.message });
                        // Handle Bedrock-reported tool errors if needed
                    }
                }
                else if (event.invocationType === "INTENT") {
                    console.log("Intent Event Received:", JSON.stringify(event, null, 2));
                    this.dispatchEvent(sessionId, 'intent', event);
                }
                else if (event.invocationType === "ERROR") {
                    console.error("Bedrock Error Event Received:", JSON.stringify(event, null, 2));
                    this.dispatchEvent(sessionId, 'error', event);
                    // Consider closing the session or taking other error-handling actions
                    // For now, just log and dispatch
                }
                else {
                    console.warn(`Received unhandled event type: ${event.invocationType}`, JSON.stringify(event));
                    this.dispatchEvent(sessionId, 'unknownEvent', event);
                }
            }
        }
        catch (error) {
            console.error(`Error processing output stream for session ${sessionId}:`, error);
            this.dispatchEvent(sessionId, 'streamError', { error }); // Dispatch a specific stream error event
            // Consider closing the session on stream error
            if (session.isActive) {
                console.log(`Closing session ${sessionId} due to stream error.`);
                this.sendSessionEnd(sessionId).catch(e => console.error(`Error sending session end after stream error for ${sessionId}:`, e)); // Attempt to end session
            }
        }
        finally {
            console.log(`Finished processing output stream for session: ${sessionId}`);
            // Ensure the session is marked as inactive if it hasn't been closed yet
            // This handles cases where the stream ends unexpectedly without a FINISH event
            if (session && session.isActive) { // Check if session still exists before accessing isActive
                console.warn(`Output stream for session ${sessionId} ended unexpectedly. Marking session as inactive.`);
                session.isActive = false; // Mark session as inactive
                session.closeSignal.next(); // Signal closure
                session.closeSignal.complete();
                this.dispatchEvent(sessionId, 'streamEndedUnexpectedly', {});
                // No need to call removeSessionData here, rely on cleanup or explicit close
            }
        }
    }
    async startBedrockStream(sessionId) {
        const session = this.getSessionData(sessionId);
        if (!session) {
            console.error(`Cannot start Bedrock stream: Session ${sessionId} not found or inactive.`);
            return;
        }
        console.log(`Initiating Bedrock stream for session: ${sessionId}`);
        const params = {
            modelId: process.env.BEDROCK_MODEL_ID || 'anthropic.claude-3-sonnet-20240229-v1:0', // Replace with your model ID
            // contentType: "application/json", // Removed - Not part of CommandInput
            // accept: "application/json", // Removed - Not part of CommandInput
            // --- Body is now an async generator ---
            body: this.createInputStream(sessionId), // Use the async generator
            // --- Additional Bedrock parameters ---
            // trace: "ENABLED", // Optional: Enable trace for debugging Bedrock interactions
            // guardrailIdentifier: "your-guardrail-id", // Optional: Specify Guardrail ID
            // guardrailVersion: "your-guardrail-version", // Optional: Specify Guardrail version
        };
        try {
            const command = new client_bedrock_runtime_1.InvokeModelWithBidirectionalStreamCommand(params);
            const response = await this.bedrockRuntimeClient.send(command);
            if (response.body) {
                console.log(`Bedrock stream connection established for session: ${sessionId}`);
                // Start processing the output stream in the background, without awaiting it here
                this.processOutputStream(sessionId, response.body).catch((error) => {
                    console.error(`Unhandled error in processOutputStream for session ${sessionId}:`, error);
                    // Ensure session cleanup even if processing crashes unexpectedly
                    if (this.isSessionActive(sessionId)) {
                        this.sendSessionEnd(sessionId).catch(e => console.error(`Error sending session end after processOutputStream crash for ${sessionId}:`, e));
                    }
                });
            }
            else {
                console.error(`Failed to establish Bedrock stream for session ${sessionId}: No response body.`);
                this.dispatchEvent(sessionId, 'error', { message: 'Failed to establish Bedrock stream: No response body.' });
                // Clean up the session if stream fails to start
                this.removeSessionData(sessionId);
            }
        }
        catch (error) {
            console.error(`Error invoking Bedrock stream for session ${sessionId}:`, error);
            this.dispatchEvent(sessionId, 'error', { message: 'Error invoking Bedrock stream.', details: error });
            // Clean up the session if invocation fails
            this.removeSessionData(sessionId);
        }
    }
    // --------------- Event Sending Methods ---------------
    // Add an event to the session's queue and signal
    enqueueEvent(sessionId, eventData) {
        const session = this.getSessionData(sessionId);
        if (session) {
            session.queue.push(eventData);
            session.queueSignal.next(); // Signal that a new item is available
            this.updateLastActivity(sessionId); // Update activity timestamp
        }
        else {
            console.warn(`Attempted to enqueue event for inactive/non-existent session: ${sessionId}`);
        }
    }
    setupPromptStartEvent(sessionId) {
        const session = this.getSessionData(sessionId);
        if (!session)
            return;
        if (session.isPromptStartSent) {
            console.warn(`Prompt start already sent for session ${sessionId}. Ignoring.`);
            return;
        }
        const event = {
            promptEvent: {
                invocationType: "START",
                promptId: (0, node_crypto_1.randomUUID)(),
            }
        };
        this.enqueueEvent(sessionId, event);
        session.isPromptStartSent = true; // Mark as sent
        console.log(`Enqueued Prompt START for session: ${sessionId}`);
    }
    setupSystemPromptEvent(sessionId, textConfig, systemPromptContent = consts_1.DefaultSystemPrompt) {
        const session = this.getSessionData(sessionId);
        if (!session || !session.isPromptStartSent) {
            console.warn(`Cannot send system prompt for session ${sessionId}: Prompt START not sent or session inactive.`);
            return;
        }
        const event = {
            promptEvent: {
                invocationType: "PRELUDE",
                prelude: {
                    systemPrompt: {
                        text: {
                            text: systemPromptContent,
                            generationConfiguration: {
                                textConfig: textConfig
                            }
                        }
                    },
                    tools: {
                        toolConfiguration: [
                            {
                                name: "get_reservation_details",
                                description: "Get reservation details based on confirmation number.",
                                inputSchema: consts_1.GetReservationToolSchema,
                            },
                            {
                                name: "cancel_reservation",
                                description: "Cancel a reservation based on confirmation number.",
                                inputSchema: consts_1.CancelReservationToolSchema,
                            },
                        ],
                    },
                    audioOutput: {
                        default: consts_1.DefaultAudioOutputConfiguration,
                    },
                }
            }
        };
        this.enqueueEvent(sessionId, event);
        console.log(`Enqueued System Prompt (PRELUDE) for session: ${sessionId}`);
    }
    setupHistoryEventForConversationResumption(sessionId, textConfig, content, role) {
        const session = this.getSessionData(sessionId);
        if (!session || !session.isPromptStartSent) {
            console.warn(`Cannot send history event for session ${sessionId}: Prompt START not sent or session inactive.`);
            return;
        }
        if (!['USER', 'ASSISTANT'].includes(role.toUpperCase())) {
            console.error(`Invalid role '${role}' for history event in session ${sessionId}. Must be USER or ASSISTANT.`);
            return;
        }
        const event = {
            promptEvent: {
                invocationType: "HISTORY",
                history: {
                    messages: [
                        {
                            role: role.toUpperCase(),
                            content: {
                                text: {
                                    text: content,
                                    generationConfiguration: {
                                        textConfig: textConfig
                                    }
                                }
                            }
                        }
                    ]
                }
            }
        };
        this.enqueueEvent(sessionId, event);
        console.log(`Enqueued History (${role}) event for session: ${sessionId}`);
    }
    setupStartAudioEvent(sessionId, audioConfig = consts_1.DefaultAudioInputConfiguration) {
        const session = this.getSessionData(sessionId);
        if (!session || !session.isPromptStartSent) {
            console.warn(`Cannot send audio start for session ${sessionId}: Prompt START not sent or session inactive.`);
            return;
        }
        if (session.isAudioContentStartSent) {
            console.warn(`Audio content start already sent for session ${sessionId}. Ignoring.`);
            return;
        }
        const event = {
            promptEvent: {
                invocationType: "CONTENT_START",
                contentId: session.audioContentId, // Use session-specific audio content ID
                contentType: "AUDIO",
                content: {
                    audio: {
                        audioConfig: audioConfig
                    }
                }
            }
        };
        this.enqueueEvent(sessionId, event);
        session.isAudioContentStartSent = true; // Mark as sent
        console.log(`Enqueued Audio Content START for session: ${sessionId} with ID: ${session.audioContentId}`);
    }
    // Stream an audio chunk
    async streamAudioChunk(sessionId, audioData) {
        const session = this.getSessionData(sessionId);
        // Check if audio content start has been sent AND the session is active
        if (!session || !session.isAudioContentStartSent || !session.isActive) {
            // console.warn(`Cannot stream audio chunk for session ${sessionId}: Audio Content START not sent, session inactive, or session closed.`);
            return; // Don't enqueue if conditions aren't met
        }
        const event = {
            promptEvent: {
                invocationType: "CONTENT_CHUNK",
                contentId: session.audioContentId, // Use session-specific audio content ID
                chunk: {
                    audioChunk: {
                        chunk: audioData
                    }
                }
            }
        };
        this.enqueueEvent(sessionId, event);
        // console.log(`Enqueued Audio Chunk for session: ${sessionId}, size: ${audioData.length}`);
    }
    // Send content end marker
    async sendContentEnd(sessionId) {
        const session = this.getSessionData(sessionId);
        // Check if audio content start has been sent AND the session is active
        if (!session || !session.isAudioContentStartSent || !session.isActive) {
            console.warn(`Cannot send content end for session ${sessionId}: Audio Content START not sent or session inactive.`);
            return;
        }
        const event = {
            promptEvent: {
                invocationType: "CONTENT_END",
                contentId: session.audioContentId, // Use session-specific audio content ID
            }
        };
        this.enqueueEvent(sessionId, event);
        session.isAudioContentStartSent = false; // Reset flag after sending end
        session.audioContentId = (0, node_crypto_1.randomUUID)(); // Generate a new ID for the next potential content stream
        console.log(`Enqueued Content END for session: ${sessionId}. New audio content ID: ${session.audioContentId}`);
    }
    // Send prompt end marker
    async sendPromptEnd(sessionId) {
        const session = this.getSessionData(sessionId);
        if (!session || !session.isPromptStartSent || !session.isActive) {
            console.warn(`Cannot send prompt end for session ${sessionId}: Prompt START not sent or session inactive.`);
            return;
        }
        const event = {
            promptEvent: {
                invocationType: "FINISH"
            }
        };
        this.enqueueEvent(sessionId, event);
        session.isPromptStartSent = false; // Reset prompt start flag
        // Also reset audio start flag, as a prompt finish implies content is also finished
        session.isAudioContentStartSent = false;
        console.log(`Enqueued Prompt FINISH for session: ${sessionId}`);
    }
    async sendToolResult(sessionId, toolUseId, result) {
        const session = this.getSessionData(sessionId);
        if (!session || !session.isActive) {
            console.warn(`Cannot send tool result for inactive/non-existent session: ${sessionId}`);
            return;
        }
        const event = {
            toolEvent: {
                invocationType: "TOOL_RESULT",
                toolUseId: toolUseId,
                result: {
                    // Structure based on Bedrock's expected format
                    // Assuming the result is JSON-compatible; adjust if needed
                    json: result,
                }
            }
        };
        this.enqueueEvent(sessionId, event);
        console.log(`Enqueued Tool Result for session: ${sessionId}, toolUseId: ${toolUseId}`);
    }
    async sendToolError(sessionId, toolUseId, errorMessage) {
        const session = this.getSessionData(sessionId);
        if (!session || !session.isActive) {
            console.warn(`Cannot send tool error for inactive/non-existent session: ${sessionId}`);
            return;
        }
        const event = {
            toolEvent: {
                invocationType: "TOOL_ERROR",
                toolUseId: toolUseId,
                error: {
                    message: errorMessage
                }
            }
        };
        this.enqueueEvent(sessionId, event);
        console.log(`Enqueued Tool Error for session: ${sessionId}, toolUseId: ${toolUseId}`);
    }
    // Send session end (cleans up resources)
    async sendSessionEnd(sessionId) {
        const session = this.activeSessions.get(sessionId); // Get session even if inactive for cleanup
        if (!session) {
            console.warn(`Session ${sessionId} already ended or never existed.`);
            return; // Nothing to do if session doesn't exist
        }
        if (!session.isActive) {
            console.warn(`Session ${sessionId} is already marked as inactive. Running cleanup.`);
            // Still run cleanup steps in case something was missed
        }
        else {
            console.log(`Sending Session END signal for session: ${sessionId}`);
            session.isActive = false; // Mark as inactive *before* signaling/cleaning
            // Send a specific end event if the protocol requires it (Bedrock might not need this)
            // For example:
            // const endEvent = { sessionEvent: { type: "END" } };
            // this.enqueueEvent(sessionId, endEvent); // May not be necessary
            // Signal closure to input stream generator and output stream processor
            session.closeSignal.next();
            session.closeSignal.complete(); // Complete the signal subject
        }
        // Clean up resources associated with the session
        session.queue = []; // Clear the queue
        session.responseSubject.complete(); // Complete the response subject
        session.responseHandlers.clear(); // Clear handlers
        // Remove the session from active tracking AFTER signaling and cleanup attempts
        this.removeSessionData(sessionId);
        console.log(`Session ${sessionId} ended and resources cleaned up.`);
    }
}
exports.BedrockSessionManager = BedrockSessionManager;
