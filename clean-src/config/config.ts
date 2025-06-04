import { config as loadEnv } from 'dotenv';

// Load environment variables
loadEnv();

export interface AppConfig {
    server: {
        port: number;
        host: string;
        environment: 'development' | 'production' | 'test';
    };
    aws: {
        region: string;
        accessKeyId?: string;
        secretAccessKey?: string;
        sessionToken?: string;
    };
    bedrock: {
        modelId: string;
        maxTokens: number;
        temperature: number;
        topP: number;
        stopSequences?: string[];
    };
    audio: {
        sampleRate: number;
        channels: number;
        format: 'pcm' | 'opus';
        chunkSize: number;
    };
    session: {
        timeout: number;
        maxConcurrentSessions: number;
        enableAnalytics: boolean;
    };
    security: {
        corsOrigins: string[];
        rateLimitWindowMs: number;
        rateLimitMaxRequests: number;
    };
}

export const config: AppConfig = {
    server: {
        port: parseInt(process.env.PORT || '3000', 10),
        host: process.env.HOST || 'localhost',
        environment: (process.env.NODE_ENV as AppConfig['server']['environment']) || 'development',
    },
    aws: {
        region: process.env.AWS_REGION || 'us-east-1',
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        sessionToken: process.env.AWS_SESSION_TOKEN,
    },
    bedrock: {
        modelId: process.env.BEDROCK_MODEL_ID || 'amazon.nova-micro-v1:0',
        maxTokens: parseInt(process.env.BEDROCK_MAX_TOKENS || '4096', 10),
        temperature: parseFloat(process.env.BEDROCK_TEMPERATURE || '0.7'),
        topP: parseFloat(process.env.BEDROCK_TOP_P || '0.9'),
        stopSequences: process.env.BEDROCK_STOP_SEQUENCES?.split(','),
    },
    audio: {
        sampleRate: parseInt(process.env.AUDIO_SAMPLE_RATE || '16000', 10),
        channels: parseInt(process.env.AUDIO_CHANNELS || '1', 10),
        format: (process.env.AUDIO_FORMAT as AppConfig['audio']['format']) || 'pcm',
        chunkSize: parseInt(process.env.AUDIO_CHUNK_SIZE || '1024', 10),
    },
    session: {
        timeout: parseInt(process.env.SESSION_TIMEOUT || '300000', 10), // 5 minutes
        maxConcurrentSessions: parseInt(process.env.MAX_CONCURRENT_SESSIONS || '10', 10),
        enableAnalytics: process.env.ENABLE_ANALYTICS !== 'false',
    },
    security: {
        corsOrigins: process.env.CORS_ORIGINS?.split(',') || ['*'],
        rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10), // 15 minutes
        rateLimitMaxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10),
    },
};

export default config; 