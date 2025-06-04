# 🧹 Clean Source Directory

This directory contains the consolidated, organized source code for the Nova Sonic Voice Agent platform.

## 📁 Directory Structure

### `/server` - Server Implementation
- **Purpose**: Single consolidated server with Express.js
- **Contains**: Main server entry point, middleware, routing
- **Entry Point**: `server.ts`

### `/client` - Client Components  
- **Purpose**: Reusable client-side components and utilities
- **Contains**: TypeScript modules for browser clients
- **Usage**: Imported by various client applications

### `/novaSonic` - Nova Sonic Integration
- **Purpose**: AWS Nova Sonic API integration and session management
- **Contains**: Session managers, event handlers, streaming utilities
- **Key Files**: `NovaSessionManager.ts`, `eventHandlers.ts`

### `/admin` - Admin Dashboard Components
- **Purpose**: Administrative interface components and logic
- **Contains**: Dashboard controllers, analytics, user management
- **Features**: Knowledge base editing, system monitoring

### `/knowledge` - Knowledge Base Management
- **Purpose**: Knowledge base storage, indexing, and retrieval
- **Contains**: KB loaders, search functionality, content management
- **Formats**: JSON, Markdown, Database integration

### `/config` - Configuration Management
- **Purpose**: Environment configs, settings, and constants
- **Contains**: Environment variables, default settings, validation
- **Files**: `config.ts`, `constants.ts`, `environment.ts`

### `/utils` - Shared Utilities
- **Purpose**: Common utility functions used across the application
- **Contains**: Helpers, formatters, validators, common algorithms
- **Examples**: Audio processing, text formatting, data validation

### `/types` - TypeScript Type Definitions
- **Purpose**: Centralized type definitions and interfaces
- **Contains**: API types, component props, data models
- **Usage**: Imported throughout the application for type safety

## 🚀 Getting Started

1. Install dependencies: `npm install`
2. Build the project: `npm run build`
3. Start the server: `npm start`
4. Access admin dashboard: `http://localhost:3000/admin`

## 🔧 Development

- **Build**: `npm run build`
- **Dev Mode**: `npm run dev`
- **Type Check**: `npm run type-check`
- **Lint**: `npm run lint`
- **Format**: `npm run format`

## 📖 Documentation

See the `/docs` directory for detailed documentation on each component and API reference. 