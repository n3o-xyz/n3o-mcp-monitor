# Trae MCP Monitor

Servidor MCP optimizado para Trae IDE Monitor - Diseñado para despliegue en línea.

## 🚀 Características

- ✅ Protocolo MCP estándar
- 🔄 Reconexión automática al WebSocket
- 📊 Logs estructurados en JSON
- 🐳 Optimizado para Docker/Dokploy
- 🛡️ Manejo robusto de errores
- 🔧 Configuración por variables de entorno

## 📦 Instalación

```bash
# Instalar dependencias
pnpm install

# Configurar variables de entorno
cp .env.example .env
# Editar .env con tu configuración

# Ejecutar en desarrollo
pnpm dev

# Ejecutar en producción
pnpm start
```

## 🌐 Despliegue en Dokploy

### 1. Crear Aplicación en Dokploy

- **Tipo:** Application
- **Source:** Git Repository
- **Build Command:** `pnpm install`
- **Start Command:** `pnpm start`
- **Port:** 3000 (para health checks)

### 2. Variables de Entorno en Dokploy

```env
MCP_MONITOR_URL=ws://tu-backend:2200
LOG_LEVEL=info
NODE_ENV=production
USER_ID=687a8418096ca32b8c045cf8
SOURCE_NAME=trae-mcp-monitor
```

### 3. Configuración de Red

Si tu backend está en otro servicio de Dokploy:
```env
MCP_MONITOR_URL=ws://nombre-del-backend:2200
```

Si tu backend tiene dominio público:
```env
MCP_MONITOR_URL=wss://api.tudominio.com:2200
```

## 🐳 Despliegue con Docker

```bash
# Construir imagen
docker build -t trae-mcp-monitor .

# Ejecutar contenedor
docker run -d \
  --name trae-mcp-monitor \
  -e MCP_MONITOR_URL=ws://tu-backend:2200 \
  -e LOG_LEVEL=info \
  -e NODE_ENV=production \
  trae-mcp-monitor
```

## ⚙️ Configuración del Cliente (Trae IDE)

### Opción 1: Configuración Local

Si el servidor MCP está desplegado pero quieres usarlo localmente:

1. **Descargar el servidor:**
```bash
# Clonar o descargar este directorio
git clone [tu-repo] trae-mcp-monitor
cd trae-mcp-monitor
pnpm install
```

2. **Configurar variables de entorno:**
```bash
# Crear .env
echo "MCP_MONITOR_URL=wss://tu-servidor-desplegado.com:2200" > .env
```

3. **Configurar en Trae IDE:**

En la configuración de MCP de Trae IDE (`~/.config/trae/mcp.json` o similar):

```json
{
  "mcpServers": {
    "trae-monitor": {
      "command": "node",
      "args": ["/ruta/completa/al/trae-mcp-monitor/server.js"],
      "env": {
        "MCP_MONITOR_URL": "wss://tu-servidor-desplegado.com:2200",
        "LOG_LEVEL": "info",
        "USER_ID": "tu-user-id"
      }
    }
  }
}
```

### Opción 2: Configuración con Ejecutable

Si prefieres un ejecutable independiente:

```json
{
  "mcpServers": {
    "trae-monitor": {
      "command": "npx",
      "args": [
        "--yes", 
        "@trae/mcp-monitor@latest"
      ],
      "env": {
        "MCP_MONITOR_URL": "wss://tu-servidor-desplegado.com:2200",
        "LOG_LEVEL": "info"
      }
    }
  }
}
```

### Opción 3: Configuración con Docker

Si quieres ejecutar el cliente también en Docker:

```json
{
  "mcpServers": {
    "trae-monitor": {
      "command": "docker",
      "args": [
        "run", "--rm", "-i",
        "-e", "MCP_MONITOR_URL=wss://tu-servidor-desplegado.com:2200",
        "trae-mcp-monitor"
      ]
    }
  }
}
```

## 🔧 Variables de Entorno

| Variable | Descripción | Valor por Defecto | Requerido |
|----------|-------------|-------------------|----------|
| `MCP_MONITOR_URL` | URL del WebSocket del backend | `ws://localhost:2200` | ✅ |
| `LOG_LEVEL` | Nivel de logging | `info` | ❌ |
| `USER_ID` | ID del usuario por defecto | `687a8418096ca32b8c045cf8` | ❌ |
| `SOURCE_NAME` | Nombre identificador del cliente | `trae-mcp-monitor` | ❌ |
| `NODE_ENV` | Entorno de Node.js | `production` | ❌ |

## 🛠️ Herramientas MCP Disponibles

### `send_task_event`
Envía eventos de tareas al monitor.

**Parámetros:**
- `taskId` (string): ID único de la tarea
- `type` (string): Tipo de evento (`task_completed`, `task_started`, `task_failed`)
- `description` (string): Descripción del evento
- `userId` (string): ID del usuario
- `metadata` (object, opcional): Metadatos adicionales

### `request_authorization`
Solicita autorización para una acción.

**Parámetros:**
- `taskId` (string): ID de la tarea
- `action` (string): Acción que requiere autorización
- `description` (string): Descripción de la acción
- `userId` (string): ID del usuario
- `requiredBy` (string): Fecha límite (ISO string)
- `metadata` (object, opcional): Metadatos adicionales

## 📊 Logs y Monitoreo

El servidor genera logs estructurados en JSON:

```json
{
  "timestamp": "2024-01-15T10:30:00.000Z",
  "level": "info",
  "message": "Conectado al monitor MCP exitosamente",
  "service": "trae-mcp-monitor"
}
```

### Verificar Logs en Dokploy
1. Ve a tu aplicación en Dokploy
2. Sección "Logs"
3. Busca mensajes como "Conectado al monitor MCP exitosamente"

## 🔍 Troubleshooting

### Error: "Monitor no conectado"
**Causa:** El WebSocket no puede conectarse al backend.

**Soluciones:**
1. Verificar que `MCP_MONITOR_URL` sea correcta
2. Confirmar que el backend esté corriendo
3. Verificar que el puerto 2200 esté expuesto
4. Revisar logs del backend para errores

### Error: "Herramienta desconocida"
**Causa:** Se está llamando una herramienta que no existe.

**Solución:** Verificar que estés usando `send_task_event` o `request_authorization`.

### Reconexiones constantes
**Causa:** Problemas de red o backend inestable.

**Solución:** 
1. Verificar estabilidad del backend
2. Revisar configuración de red en Dokploy
3. Aumentar recursos del contenedor si es necesario

## 📝 Ejemplo de Uso

Una vez configurado en Trae IDE, puedes usar las herramientas:

```javascript
// Enviar evento de tarea completada
await mcp.call('send_task_event', {
  taskId: 'task-123',
  type: 'task_completed',
  description: 'Implementación de nueva funcionalidad completada',
  userId: 'user-456',
  metadata: {
    duration: 1800,
    linesOfCode: 150
  }
});

// Solicitar autorización para despliegue
await mcp.call('request_authorization', {
  taskId: 'deploy-789',
  action: 'deploy_to_production',
  description: 'Desplegar versión 2.1.0 a producción',
  userId: 'user-456',
  requiredBy: new Date(Date.now() + 3600000).toISOString() // 1 hora
});
```

## 🤝 Soporte

Para problemas o preguntas:
1. Revisar logs del servidor MCP
2. Verificar logs del backend
3. Confirmar configuración de red
4. Contactar al equipo de Trae