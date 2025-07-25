#!/usr/bin/env node

/**
 * Servidor MCP para Trae IDE Monitor - Streamable HTTP Transport
 * 
 * Este servidor implementa el protocolo MCP moderno usando Streamable HTTP
 * para conectarse con Trae IDE y enviar eventos al monitor a través de WebSocket.
 * 
 * Características:
 * - Streamable HTTP Transport (MCP 2025-03-26)
 * - Reconexión automática WebSocket
 * - Manejo robusto de errores
 * - Logs estructurados
 * - Variables de entorno configurables
 * - Health checks
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import WebSocket from 'ws';
import express from 'express';
import cors from 'cors';

class TraeMcpMonitor {
  constructor() {
    this.monitorWs = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
    this.reconnectDelay = 5000;
    this.isShuttingDown = false;
    
    // Configuración desde variables de entorno
    this.config = {
      monitorUrl: process.env.MCP_MONITOR_URL || process.env.MONITOR_URL || 'ws://localhost:2200',
      logLevel: process.env.LOG_LEVEL || 'info',
      userId: process.env.USER_ID || '687a8418096ca32b8c045cf8',
      sourceName: process.env.SOURCE_NAME || 'trae-mcp-monitor'
    };
    
    this.server = new Server(
      {
        name: 'trae-mcp-monitor',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
          resources: {},
        },
      }
    );
    
    this.setupTools();
    this.connectToMonitor();
    this.setupGracefulShutdown();
  }

  log(level, message, data = {}) {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level,
      message,
      service: 'trae-mcp-monitor',
      ...data
    };
    
    // Usar stderr para logs para no interferir con el protocolo MCP
    console.error(JSON.stringify(logEntry));
  }

  setupTools() {
    // Herramientas disponibles
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'send_task_event',
            description: 'Enviar evento de tarea al monitor',
            inputSchema: {
              type: 'object',
              properties: {
                taskId: { type: 'string', description: 'ID único de la tarea' },
                type: { 
                  type: 'string', 
                  enum: ['task_completed', 'task_started', 'task_failed'],
                  description: 'Tipo de evento de tarea'
                },
                description: { type: 'string', description: 'Descripción del evento' },
                userId: { type: 'string', description: 'ID del usuario' },
                metadata: { type: 'object', description: 'Metadatos adicionales' }
              },
              required: ['taskId', 'type', 'description', 'userId']
            }
          },
          {
            name: 'request_authorization',
            description: 'Solicitar autorización para una acción',
            inputSchema: {
              type: 'object',
              properties: {
                taskId: { type: 'string', description: 'ID de la tarea' },
                action: { type: 'string', description: 'Acción que requiere autorización' },
                description: { type: 'string', description: 'Descripción de la acción' },
                userId: { type: 'string', description: 'ID del usuario' },
                requiredBy: { type: 'string', description: 'Fecha límite (ISO string)' },
                metadata: { type: 'object', description: 'Metadatos adicionales' }
              },
              required: ['taskId', 'action', 'description', 'userId', 'requiredBy']
            }
          }
        ]
      };
    });

    // Manejar llamadas a herramientas
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      
      try {
        switch (name) {
          case 'send_task_event':
            return await this.sendTaskEvent(args);
          case 'request_authorization':
            return await this.requestAuthorization(args);
          default:
            throw new Error(`Herramienta desconocida: ${name}`);
        }
      } catch (error) {
        this.log('error', 'Error ejecutando herramienta', { tool: name, error: error.message });
        throw error;
      }
    });
  }

  async sendTaskEvent(args) {
    const event = {
      type: 'task_event',
      payload: {
        taskId: args.taskId,
        type: args.type,
        description: args.description,
        userId: args.userId || this.config.userId,
        metadata: {
          ...args.metadata,
          source: this.config.sourceName,
          timestamp: new Date().toISOString()
        }
      }
    };

    if (this.isWebSocketConnected()) {
      this.monitorWs.send(JSON.stringify(event));
      this.log('info', 'Evento de tarea enviado', { taskId: args.taskId, type: args.type });
      
      return {
        content: [{
          type: 'text',
          text: `✅ Evento de tarea enviado: ${args.type} para tarea ${args.taskId}`
        }]
      };
    } else {
      this.log('error', 'Monitor no conectado al enviar evento', { taskId: args.taskId });
      throw new Error('Monitor no conectado. Verificar conexión WebSocket.');
    }
  }

  async requestAuthorization(args) {
    const request = {
      type: 'authorization_request',
      payload: {
        requestId: `auth-${Date.now()}`,
        taskId: args.taskId,
        action: args.action,
        description: args.description,
        userId: args.userId || this.config.userId,
        requiredBy: args.requiredBy,
        metadata: {
          ...args.metadata,
          source: this.config.sourceName,
          timestamp: new Date().toISOString()
        }
      }
    };

    if (this.isWebSocketConnected()) {
      this.monitorWs.send(JSON.stringify(request));
      this.log('info', 'Solicitud de autorización enviada', { taskId: args.taskId, action: args.action });
      
      return {
        content: [{
          type: 'text',
          text: `🔐 Solicitud de autorización enviada: ${args.action} para tarea ${args.taskId}`
        }]
      };
    } else {
      this.log('error', 'Monitor no conectado al solicitar autorización', { taskId: args.taskId });
      throw new Error('Monitor no conectado. Verificar conexión WebSocket.');
    }
  }

  isWebSocketConnected() {
    return this.monitorWs && this.monitorWs.readyState === WebSocket.OPEN;
  }

  connectToMonitor() {
    if (this.isShuttingDown) return;
    
    const connectWs = () => {
      if (this.isShuttingDown) return;
      
      try {
        this.log('info', 'Intentando conectar al monitor', { url: this.config.monitorUrl });
        this.monitorWs = new WebSocket(this.config.monitorUrl);
        
        this.monitorWs.on('open', () => {
          this.log('info', 'Conectado al monitor MCP exitosamente');
          this.reconnectAttempts = 0;
          
          // Enviar mensaje de identificación
          const identifyMessage = {
            type: 'mcp_client_identify',
            payload: {
              clientId: this.config.sourceName,
              version: '1.0.0',
              capabilities: ['task_events', 'authorization_requests'],
              timestamp: new Date().toISOString()
            }
          };
          
          this.monitorWs.send(JSON.stringify(identifyMessage));
        });
        
        this.monitorWs.on('close', (code, reason) => {
          this.log('warn', 'Desconectado del monitor MCP', { code, reason: reason.toString() });
          this.scheduleReconnect();
        });
        
        this.monitorWs.on('error', (error) => {
          this.log('error', 'Error de conexión WebSocket', { error: error.message });
        });
        
        this.monitorWs.on('message', (data) => {
          try {
            const message = JSON.parse(data.toString());
            this.log('debug', 'Mensaje recibido del monitor', { type: message.type });
          } catch (error) {
            this.log('error', 'Error procesando mensaje del monitor', { error: error.message });
          }
        });
        
      } catch (error) {
        this.log('error', 'Error al crear conexión WebSocket', { error: error.message });
        this.scheduleReconnect();
      }
    };
    
    connectWs();
  }

  scheduleReconnect() {
    if (this.isShuttingDown) return;
    
    this.reconnectAttempts++;
    
    if (this.reconnectAttempts > this.maxReconnectAttempts) {
      this.log('error', 'Máximo número de intentos de reconexión alcanzado');
      return;
    }
    
    const delay = Math.min(this.reconnectDelay * this.reconnectAttempts, 30000);
    this.log('info', 'Programando reconexión', { 
      attempt: this.reconnectAttempts, 
      delay: delay,
      maxAttempts: this.maxReconnectAttempts 
    });
    
    setTimeout(() => this.connectToMonitor(), delay);
  }

  setupGracefulShutdown() {
    const shutdown = (signal) => {
      this.log('info', 'Iniciando cierre graceful', { signal });
      this.isShuttingDown = true;
      
      if (this.monitorWs) {
        this.monitorWs.close();
      }
      
      if (this.httpServer) {
        this.httpServer.close();
      }
      
      process.exit(0);
    };
    
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
  }

  async start() {
    try {
      const app = express();
      app.use(cors({
        origin: '*',
        methods: ['GET', 'POST', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization', 'Mcp-Session-Id'],
        exposedHeaders: ['Mcp-Session-Id']
      }));
      app.use(express.json({ limit: '10mb' }));
      
      // Streamable HTTP MCP endpoint
      app.post('/mcp', async (req, res) => {
        try {
          const sessionId = req.headers['mcp-session-id'] || `session-${Date.now()}`;
          
          // Set session header
          res.setHeader('Mcp-Session-Id', sessionId);
          res.setHeader('Content-Type', 'application/json');
          
          // Handle MCP request
          const request = req.body;
          let response;
          
          switch (request.method) {
            case 'tools/list':
              response = {
                jsonrpc: '2.0',
                id: request.id,
                result: {
                  tools: [
                    {
                      name: 'send_task_event',
                      description: 'Envía un evento de tarea al monitor de Trae IDE',
                      inputSchema: {
                        type: 'object',
                        properties: {
                          event_type: {
                            type: 'string',
                            description: 'Tipo de evento (task_start, task_progress, task_complete, task_error)',
                            enum: ['task_start', 'task_progress', 'task_complete', 'task_error']
                          },
                          task_id: {
                            type: 'string',
                            description: 'ID único de la tarea'
                          },
                          message: {
                            type: 'string',
                            description: 'Mensaje descriptivo del evento'
                          },
                          progress: {
                            type: 'number',
                            description: 'Progreso de la tarea (0-100)',
                            minimum: 0,
                            maximum: 100
                          },
                          metadata: {
                            type: 'object',
                            description: 'Metadatos adicionales del evento'
                          }
                        },
                        required: ['event_type', 'task_id', 'message']
                      }
                    },
                    {
                      name: 'request_authorization',
                      description: 'Solicita autorización del usuario para una acción específica',
                      inputSchema: {
                        type: 'object',
                        properties: {
                          action: {
                            type: 'string',
                            description: 'Acción que requiere autorización'
                          },
                          resource: {
                            type: 'string',
                            description: 'Recurso al que se quiere acceder'
                          },
                          reason: {
                            type: 'string',
                            description: 'Razón por la que se necesita la autorización'
                          },
                          timeout: {
                            type: 'number',
                            description: 'Tiempo límite en segundos para la respuesta',
                            default: 30
                          }
                        },
                        required: ['action', 'resource', 'reason']
                      }
                    }
                  ]
                }
              };
              break;
              
            case 'tools/call':
              const toolName = request.params?.name;
              const toolArgs = request.params?.arguments || {};
              
              if (toolName === 'send_task_event') {
                const result = await this.sendTaskEvent(toolArgs);
                response = {
                  jsonrpc: '2.0',
                  id: request.id,
                  result: { content: [{ type: 'text', text: result }] }
                };
              } else if (toolName === 'request_authorization') {
                const result = await this.requestAuthorization(toolArgs);
                response = {
                  jsonrpc: '2.0',
                  id: request.id,
                  result: { content: [{ type: 'text', text: result }] }
                };
              } else {
                response = {
                  jsonrpc: '2.0',
                  id: request.id,
                  error: {
                    code: -32601,
                    message: `Tool not found: ${toolName}`
                  }
                };
              }
              break;
              
            default:
              response = {
                jsonrpc: '2.0',
                id: request.id,
                error: {
                  code: -32601,
                  message: `Method not found: ${request.method}`
                }
              };
          }
          
          res.json(response);
          
        } catch (error) {
          this.log('error', 'Error procesando solicitud MCP', { error: error.message });
          res.status(500).json({
            jsonrpc: '2.0',
            id: req.body?.id || null,
            error: {
              code: -32603,
              message: 'Internal error',
              data: error.message
            }
          });
        }
      });
      
      // Health check endpoint
      app.get('/health', (req, res) => {
        res.json({
          status: 'ok',
          service: 'trae-mcp-monitor',
          version: '1.0.0',
          transport: 'streamable-http',
          timestamp: new Date().toISOString(),
          websocket: this.isWebSocketConnected() ? 'connected' : 'disconnected',
          monitor_url: this.config.monitorUrl
        });
      });
      
      app.get('/', (req, res) => {
        res.json({
          status: 'ok',
          service: 'trae-mcp-monitor',
          transport: 'streamable-http',
          endpoints: ['/mcp', '/health'],
          version: '1.0.0'
        });
      });
      
      const port = process.env.PORT || 3000;
      this.httpServer = app.listen(port, () => {
        this.log('info', 'Servidor MCP Streamable HTTP iniciado', { port, transport: 'streamable-http', config: this.config });
      });
      
    } catch (error) {
      this.log('error', 'Error al iniciar servidor MCP', { error: error.message });
      throw error;
    }
  }
}

// Iniciar servidor
const server = new TraeMcpMonitor();
server.start().catch((error) => {
  console.error('Error fatal:', error);
  process.exit(1);
});