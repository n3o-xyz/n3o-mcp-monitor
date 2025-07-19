# Trae MCP Monitor - TypeScript

Servidor MCP (Model Context Protocol) desarrollado en TypeScript que permite monitorear y gestionar tareas a través de un sistema de eventos y autorizaciones.

## 🚀 Características

- ✅ **TypeScript**: Código tipado con validación estricta
- ✅ **Validación con Zod**: Esquemas de validación robustos
- ✅ **Streamable HTTP Transport**: Compatible con el protocolo MCP
- ✅ **WebSocket Monitor**: Conexión en tiempo real con el monitor
- ✅ **Logging estructurado**: Sistema de logs con Winston
- ✅ **Reconexión automática**: Manejo resiliente de conexiones
- ✅ **Cierre graceful**: Manejo adecuado de señales del sistema
- 🐳 **Optimizado para Docker/Dokploy**: Listo para despliegue

## 📦 Instalación

```bash
# Instalar dependencias
pnpm install

# Compilar el proyecto
pnpm run build

# Iniciar el servidor
pnpm start
```

## 🛠️ Scripts disponibles

- `pnpm run build` - Compila TypeScript a JavaScript
- `pnpm start` - Inicia el servidor compilado
- `pnpm run dev` - Modo desarrollo con recarga automática
- `pnpm run dev:run` - Compila y ejecuta en modo desarrollo
- `pnpm test` - Ejecuta las pruebas

## ⚙️ Configuración

El servidor utiliza las siguientes variables de entorno:

| Variable | Descripción | Valor por Defecto | Requerido |
|----------|-------------|-------------------|----------|
| `MONITOR_URL` | URL del WebSocket del backend | `ws://localhost:2200` | ✅ |
| `LOG_LEVEL` | Nivel de logging | `info` | ❌ |
| `USER_ID` | ID del usuario por defecto | `687a8418096ca32b8c045cf8` | ❌ |
| `SOURCE_NAME` | Nombre identificador del cliente | `trae-mcp-monitor` | ❌ |
| `PORT` | Puerto del servidor HTTP | `3000` | ❌ |
| `NODE_ENV` | Entorno de Node.js | `production` | ❌ |

## 🔧 Herramientas MCP disponibles

### 1. send_task_event
Envía eventos de tareas al monitor.

**Parámetros:**
- `taskId` (string): ID único de la tarea
- `event` (string): Tipo de evento (start, progress, complete, error)
- `data` (object, opcional): Datos adicionales del evento

**Ejemplo:**
```json
{
  "taskId": "task-123",
  "event": "complete",
  "data": {
    "result": "Tarea completada exitosamente",
    "duration": 5000
  }
}
```

### 2. request_authorization
Solicita autorización para ejecutar una acción.

**Parámetros:**
- `action` (string): Acción que requiere autorización
- `resource` (string): Recurso sobre el que se ejecuta la acción
- `metadata` (object, opcional): Metadatos adicionales

**Ejemplo:**
```json
{
  "action": "delete_file",
  "resource": "/path/to/important/file.txt",
  "metadata": {
    "reason": "Limpieza de archivos temporales"
  }
}
```

## 🌐 Endpoints HTTP

### POST /mcp
Endpoint principal para solicitudes MCP usando JSON-RPC 2.0.

**Ejemplo de solicitud:**
```bash
curl -X POST -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' \
  http://localhost:3000/mcp
```

**Respuesta:**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "tools": [
      {
        "name": "send_task_event",
        "description": "Envía eventos de tareas al monitor",
        "inputSchema": {
          "type": "object",
          "properties": {
            "taskId": {"type": "string"},
            "event": {"type": "string"},
            "data": {"type": "object"}
          },
          "required": ["taskId", "event"]
        }
      }
    ]
  }
}
```

### GET /health
Endpoint de verificación de salud del servidor.

**Respuesta:**
```json
{
  "status": "ok",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "uptime": 3600,
  "version": "1.0.0"
}
```

### GET /
Endpoint raíz con información básica del servidor.

## 🔗 Configuración en Trae IDE

Crea o actualiza el archivo `mcp.json` en tu proyecto:

```json
{
  "servers": {
    "trae-monitor": {
      "type": "http",
      "url": "http://localhost:3000/mcp"
    }
  }
}
```

## 🎯 Configuración en Claude Desktop

Edita el archivo de configuración de Claude Desktop:

**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "trae-monitor": {
      "command": "node",
      "args": ["/ruta/completa/al/proyecto/build/index.js"],
      "env": {
        "MONITOR_URL": "ws://localhost:2200",
        "LOG_LEVEL": "info",
        "USER_ID": "tu-user-id"
      }
    }
  }
}
```

## 🐳 Despliegue con Docker

```bash
# Construir imagen
docker build -t trae-mcp-monitor .

# Ejecutar contenedor
docker run -d \
  --name trae-mcp-monitor \
  -p 3000:3000 \
  -e MONITOR_URL=ws://tu-backend:2200 \
  -e LOG_LEVEL=info \
  -e NODE_ENV=production \
  trae-mcp-monitor
```

## 🌐 Despliegue en Dokploy

### 1. Crear Aplicación en Dokploy

- **Tipo:** Application
- **Source:** Git Repository
- **Build Command:** `pnpm install && pnpm run build`
- **Start Command:** `pnpm start`
- **Port:** 3000

### 2. Variables de Entorno en Dokploy

```env
MONITOR_URL=ws://tu-backend:2200
LOG_LEVEL=info
NODE_ENV=production
USER_ID=687a8418096ca32b8c045cf8
SOURCE_NAME=trae-mcp-monitor
PORT=3000
```

## 🔍 Desarrollo

### Estructura del proyecto

```
mcp-monitor/
├── src/
│   └── index.ts          # Código fuente principal
├── build/                # Código compilado
├── package.json          # Configuración del proyecto
├── tsconfig.json         # Configuración de TypeScript
├── .env.example          # Variables de entorno de ejemplo
└── README.md            # Este archivo
```

### Debugging

Para debuggear el servidor:

```bash
# Compilar en modo desarrollo
pnpm run dev

# Ejecutar con logs detallados
LOG_LEVEL=debug pnpm start

# Probar con Inspector MCP
npx @modelcontextprotocol/inspector build/index.js
```

### Testing

```bash
# Ejecutar pruebas
pnpm test

# Probar endpoint manualmente
curl -X POST -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"send_task_event","arguments":{"taskId":"test-123","event":"start"}}}' \
  http://localhost:3000/mcp
```

## 📊 Logs y Monitoreo

El servidor genera logs estructurados en JSON:

```json
{
  "timestamp": "2024-01-15T10:30:00.000Z",
  "level": "info",
  "message": "Conectado al monitor MCP exitosamente",
  "service": "trae-mcp-monitor",
  "url": "ws://localhost:2200"
}
```

### Niveles de log disponibles:
- `error`: Errores críticos
- `warn`: Advertencias
- `info`: Información general
- `debug`: Información detallada para debugging

## 🔄 Migración desde JavaScript

Este proyecto es una migración completa del servidor original `server.js` a TypeScript, incluyendo:

- ✅ Tipado estricto de todas las interfaces
- ✅ Validación de esquemas con Zod
- ✅ Mejor manejo de errores
- ✅ Documentación de tipos
- ✅ Configuración de build optimizada
- ✅ Compatibilidad completa con el protocolo MCP

## 🤝 Contribuir

1. Fork el proyecto
2. Crea una rama para tu feature (`git checkout -b feature/nueva-funcionalidad`)
3. Commit tus cambios (`git commit -am 'Agrega nueva funcionalidad'`)
4. Push a la rama (`git push origin feature/nueva-funcionalidad`)
5. Crea un Pull Request

## 📄 Licencia

Este proyecto está bajo la licencia MIT.

## 🆘 Soporte

Si encuentras algún problema:

1. Revisa los logs del servidor
2. Verifica la configuración de variables de entorno
3. Asegúrate de que el monitor WebSocket esté ejecutándose
4. Consulta la documentación del protocolo MCP

---

**¡Tu servidor MCP TypeScript está listo para usar!** 🎉