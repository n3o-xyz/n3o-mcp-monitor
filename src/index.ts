#!/usr/bin/env node

/**
 * Servidor MCP para Trae IDE Monitor - TypeScript con Streamable HTTP Transport
 * 
 * Este servidor implementa el protocolo MCP moderno usando Streamable HTTP
 * para conectarse con Trae IDE y enviar eventos al monitor a través de WebSocket.
 * 
 * Características:
 * - TypeScript con tipos estrictos
 * - Validación con Zod
 * - Streamable HTTP Transport (MCP 2025-03-26)
 * - Reconexión automática WebSocket
 * - Manejo robusto de errores
 * - Logs estructurados
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import WebSocket from 'ws';
import express, { Request, Response } from 'express';
import cors from 'cors';
import { z } from 'zod';
import { createServer, Server as HttpServer } from 'http';

// Schemas de validación con Zod
const TaskEventSchema = z.object({
  taskId: z.string().min(1, 'Task ID es requerido'),
  type: z.enum(['task_completed', 'task_started', 'task_failed'], {
    errorMap: () => ({ message: 'Tipo de evento debe ser: task_completed, task_started, o task_failed' })
  }),
  description: z.string().min(1, 'Descripción es requerida'),
  userId: z.string().optional(),
  metadata: z.record(z.any()).optional()
});

const AuthorizationRequestSchema = z.object({
  taskId: z.string().min(1, 'Task ID es requerido'),
  action: z.string().min(1, 'Acción es requerida'),
  description: z.string().min(1, 'Descripción es requerida'),
  userId: z.string().optional(),
  requiredBy: z.string().datetime('Fecha requerida debe ser ISO string válido'),
  metadata: z.record(z.any()).optional()
});

const ConfigSchema = z.object({
  monitorUrl: z.string().url('URL del monitor debe ser válida'),
  logLevel: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  userId: z.string().min(1, 'User ID es requerido'),
  sourceName: z.string().min(1, 'Source name es requerido'),
  port: z.number().int().min(1).max(65535).default(3000)
});

// Tipos TypeScript
type TaskEventInput = z.infer<typeof TaskEventSchema>;
type AuthorizationRequestInput = z.infer<typeof AuthorizationRequestSchema>;
type Config = z.infer<typeof ConfigSchema>;

interface LogEntry {
  timestamp: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  service: string;
  [key: string]: any;
}

interface McpToolResult {
  content: Array<{
    type: 'text';
    text: string;
  }>;
  isError?: boolean;
}

interface WebSocketMessage {
  type: string;
  payload: Record<string, any>;
}

class TraeMcpMonitor {
  private monitorWs: WebSocket | null = null;
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 10;
  private readonly reconnectDelay = 5000;
  private isShuttingDown = false;
  private httpServer: HttpServer | null = null;
  private readonly config: Config;
  private readonly server: Server;

  constructor() {
    // Validar y configurar desde variables de entorno
    const rawConfig = {
      monitorUrl: process.env.MCP_MONITOR_URL || process.env.MONITOR_URL || 'ws://localhost:2200',
      logLevel: process.env.LOG_LEVEL || 'info',
      userId: process.env.USER_ID || '687a8418096ca32b8c045cf8',
      sourceName: process.env.SOURCE_NAME || 'trae-mcp-monitor',
      port: parseInt(process.env.PORT || '3000', 10)
    };

    try {
      this.config = ConfigSchema.parse(rawConfig);
    } catch (error) {
      if (error instanceof z.ZodError) {
        console.error('❌ Error de configuración:', error.errors);
        process.exit(1);
      }
      throw error;
    }

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

  private log(level: LogEntry['level'], message: string, data: Record<string, any> = {}): void {
    const timestamp = new Date().toISOString();
    const logEntry: LogEntry = {
      timestamp,
      level,
      message,
      service: 'trae-mcp-monitor',
      ...data
    };

    // Usar stderr para logs para no interferir con el protocolo MCP
    console.error(JSON.stringify(logEntry));
  }

  private setupTools(): void {
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
              required: ['taskId', 'type', 'description']
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
              required: ['taskId', 'action', 'description', 'requiredBy']
            }
          }
        ]
      };
    });

    // Manejar llamadas a herramientas
    this.server.setRequestHandler(CallToolRequestSchema, async (request): Promise<any> => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'send_task_event':
            return await this.sendTaskEvent(args as TaskEventInput);
          case 'request_authorization':
            return await this.requestAuthorization(args as AuthorizationRequestInput);
          default:
            throw new Error(`Herramienta desconocida: ${name}`);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
        this.log('error', 'Error ejecutando herramienta', { tool: name, error: errorMessage });
        throw error;
      }
    });
  }

  private async sendTaskEvent(args: unknown): Promise<McpToolResult> {
    // Validar entrada con Zod
    const validatedArgs = TaskEventSchema.parse(args);

    const event: WebSocketMessage = {
      type: 'task_event',
      payload: {
        taskId: validatedArgs.taskId,
        type: validatedArgs.type,
        description: validatedArgs.description,
        userId: validatedArgs.userId || this.config.userId,
        metadata: {
          ...validatedArgs.metadata,
          source: this.config.sourceName,
          timestamp: new Date().toISOString()
        }
      }
    };

    if (this.isWebSocketConnected()) {
      this.monitorWs!.send(JSON.stringify(event));
      this.log('info', 'Evento de tarea enviado', { taskId: validatedArgs.taskId, type: validatedArgs.type });

      return {
        content: [{
          type: 'text',
          text: `✅ Evento de tarea enviado: ${validatedArgs.type} para tarea ${validatedArgs.taskId}`
        }]
      };
    } else {
      this.log('error', 'Monitor no conectado al enviar evento', { taskId: validatedArgs.taskId });
      throw new Error('Monitor no conectado. Verificar conexión WebSocket.');
    }
  }

  private async requestAuthorization(args: unknown): Promise<McpToolResult> {
    // Validar entrada con Zod
    const validatedArgs = AuthorizationRequestSchema.parse(args);

    const request: WebSocketMessage = {
      type: 'authorization_request',
      payload: {
        requestId: `auth-${Date.now()}`,
        taskId: validatedArgs.taskId,
        action: validatedArgs.action,
        description: validatedArgs.description,
        userId: validatedArgs.userId || this.config.userId,
        requiredBy: validatedArgs.requiredBy,
        metadata: {
          ...validatedArgs.metadata,
          source: this.config.sourceName,
          timestamp: new Date().toISOString()
        }
      }
    };

    if (this.isWebSocketConnected()) {
      this.monitorWs!.send(JSON.stringify(request));
      this.log('info', 'Solicitud de autorización enviada', { taskId: validatedArgs.taskId, action: validatedArgs.action });

      return {
        content: [{
          type: 'text',
          text: `🔐 Solicitud de autorización enviada: ${validatedArgs.action} para tarea ${validatedArgs.taskId}`
        }]
      };
    } else {
      this.log('error', 'Monitor no conectado al solicitar autorización', { taskId: validatedArgs.taskId });
      throw new Error('Monitor no conectado. Verificar conexión WebSocket.');
    }
  }

  private isWebSocketConnected(): boolean {
    return this.monitorWs !== null && this.monitorWs.readyState === WebSocket.OPEN;
  }

  private connectToMonitor(): void {
    if (this.isShuttingDown) return;

    const connectWs = (): void => {
      if (this.isShuttingDown) return;

      try {
        this.log('info', 'Intentando conectar al monitor', { url: this.config.monitorUrl });
        this.monitorWs = new WebSocket(this.config.monitorUrl);

        this.monitorWs.on('open', () => {
          this.log('info', 'Conectado al monitor MCP exitosamente');
          this.reconnectAttempts = 0;

          // Enviar mensaje de identificación
          const identifyMessage: WebSocketMessage = {
            type: 'mcp_client_identify',
            payload: {
              clientId: this.config.sourceName,
              version: '1.0.0',
              capabilities: ['task_events', 'authorization_requests'],
              timestamp: new Date().toISOString()
            }
          };

          this.monitorWs!.send(JSON.stringify(identifyMessage));
        });

        this.monitorWs.on('close', (code: number, reason: Buffer) => {
          this.log('warn', 'Desconectado del monitor MCP', { code, reason: reason.toString() });
          this.scheduleReconnect();
        });

        this.monitorWs.on('error', (error: Error) => {
          this.log('error', 'Error de conexión WebSocket', { error: error.message });
        });

        this.monitorWs.on('message', (data: WebSocket.Data) => {
          try {
            const message = JSON.parse(data.toString()) as WebSocketMessage;
            this.log('debug', 'Mensaje recibido del monitor', { type: message.type });
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
            this.log('error', 'Error procesando mensaje del monitor', { error: errorMessage });
          }
        });

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
        this.log('error', 'Error al crear conexión WebSocket', { error: errorMessage });
        this.scheduleReconnect();
      }
    };

    connectWs();
  }

  private scheduleReconnect(): void {
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

  private setupGracefulShutdown(): void {
    const shutdown = (signal: string): void => {
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

  public async start(): Promise<void> {
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
      app.post('/mcp', async (req: Request, res: Response) => {
        try {
          const sessionId = req.headers['mcp-session-id'] as string || `session-${Date.now()}`;

          // Set session header
          res.setHeader('Mcp-Session-Id', sessionId);
          res.setHeader('Content-Type', 'application/json');

          // Handle MCP request
          const request = req.body;
          let response: any;

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
                  result: { content: result.content }
                };
              } else if (toolName === 'request_authorization') {
                const result = await this.requestAuthorization(toolArgs);
                response = {
                  jsonrpc: '2.0',
                  id: request.id,
                  result: { content: result.content }
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
          const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
          this.log('error', 'Error procesando solicitud MCP', { error: errorMessage });
          res.status(500).json({
            jsonrpc: '2.0',
            id: req.body?.id || null,
            error: {
              code: -32603,
              message: 'Internal error',
              data: errorMessage
            }
          });
        }
      });

      // Health check endpoint
      app.get('/health', (req: Request, res: Response) => {
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

      app.get('/', (req: Request, res: Response) => {
        res.json({
          status: 'ok',
          service: 'trae-mcp-monitor',
          transport: 'streamable-http',
          endpoints: ['/mcp', '/health'],
          version: '1.0.0'
        });
      });

      this.httpServer = app.listen(this.config.port, () => {
        this.log('info', 'Servidor MCP Streamable HTTP iniciado', {
          port: this.config.port,
          transport: 'streamable-http',
          config: this.config
        });
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
      this.log('error', 'Error al iniciar servidor MCP', { error: errorMessage });
      throw error;
    }
  }
}

// Iniciar servidor
async function main(): Promise<void> {
  try {
    const server = new TraeMcpMonitor();
    await server.start();
    console.error('✅ Servidor MCP TypeScript iniciado exitosamente');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
    console.error('❌ Error fatal:', errorMessage);
    process.exit(1);
  }
}

main().catch(console.error);