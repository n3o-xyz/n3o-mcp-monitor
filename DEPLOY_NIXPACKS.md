# Despliegue con Nixpacks - Trae MCP Monitor

## Configuración para Dokploy

### 1. Configuración del Proyecto

**Tipo de Build:** Nixpacks

**Configuración de Build:**
- Nixpacks detectará automáticamente Node.js
- Usará pnpm como package manager
- No requiere configuración adicional

### 2. Variables de Entorno

```env
NODE_ENV=production
LOG_LEVEL=info
MCP_MONITOR_URL=ws://tu-monitor-url:2200
USER_ID=687a8418096ca32b8c045cf8
SOURCE_NAME=trae-mcp-monitor
PORT=3000
```

### 3. Puerto

**Puerto:** 3000 (por defecto para aplicaciones Node.js)

### 4. Health Check

**Endpoints Disponibles:**
- `GET /` - Health check principal
- `GET /health` - Status detallado del servicio

Ambos endpoints devuelven información sobre:
- Estado del servicio
- Conexión WebSocket al monitor
- Timestamp y versión

**Comando:** `pnpm start`

## Ventajas de Nixpacks

- ✅ Detección automática de Node.js
- ✅ Configuración simplificada
- ✅ Mejor manejo de dependencias
- ✅ Builds más rápidos
- ✅ Menos configuración manual

## Estructura del Proyecto

```
mcp-monitor/
├── server.js              # Servidor MCP principal
├── package.json           # Dependencias y scripts
├── nixpacks.toml         # Configuración de Nixpacks
├── .nixpacks             # Configuración adicional
├── .env.example          # Variables de entorno ejemplo
└── DEPLOY_NIXPACKS.md    # Esta guía
```

## Comandos

- **Desarrollo:** `pnpm dev`
- **Producción:** `pnpm start`
- **Build:** `pnpm build` (no requerido)

## Solución de Problemas

### Error de Conexión WebSocket
- Verificar `MCP_MONITOR_URL`
- Asegurar que el monitor esté ejecutándose
- Revisar logs del contenedor

### Error de Dependencias
- Verificar que `package.json` esté correcto
- Limpiar caché: eliminar `node_modules` y reinstalar

### Logs
- Los logs se envían a stderr para no interferir con MCP
- Usar `docker logs <container-id>` para ver logs

## Configuración del Cliente MCP

Para conectar desde Trae IDE, usar la configuración:

```json
{
  "mcpServers": {
    "trae-monitor": {
      "command": "node",
      "args": ["/path/to/server.js"],
      "env": {
        "MCP_MONITOR_URL": "ws://your-monitor-url:2200"
      }
    }
  }
}
```