# Despliegue con Nixpacks - Trae MCP Monitor

## 🚀 Configuración en Dokploy

### Tipo de Build
- **Build Type**: `nixpacks`
- **Puerto**: `3000`
- **Protocolo**: HTTP (Dokploy maneja HTTPS automáticamente)

### Variables de Entorno Requeridas
```bash
NODE_ENV=production
LOG_LEVEL=info
MCP_MONITOR_URL=ws://your-backend-domain:2200
USER_ID=your-user-id
SOURCE_NAME=trae-mcp-monitor
PORT=3000
```

### Endpoints Disponibles
- `GET /` - Información del servicio
- `GET /health` - Health check detallado
- `GET /sse` - **Endpoint MCP Server-Sent Events**

### Configuración para Trae IDE

El servidor ahora utiliza **Streamable HTTP Transport**, el protocolo MCP moderno que reemplaza a SSE para servidores remotos.

```json
{
  "mcpServers": {
    "trae-monitor": {
      "type": "http",
      "url": "https://tu-dominio.com/mcp"
    }
  }
}
```

### Cambios Importantes

- **Transporte**: Cambiado de SSE a Streamable HTTP
- **Endpoint**: Ahora usa `/mcp` en lugar de `/sse`
- **Protocolo**: Implementa JSON-RPC 2.0 sobre HTTP POST
- **Compatibilidad**: Funciona mejor con servidores remotos y clientes modernos

## Pasos para Redesplegar

1. **Commit y push de los cambios**:
   ```bash
   git add .
   git commit -m "Actualizar a Streamable HTTP Transport"
   git push
   ```

2. **Redesplegar en Dokploy**:
   - Ve a tu proyecto en Dokploy
   - Haz clic en "Redeploy" o "Deploy"
   - Espera a que termine el despliegue

3. **Verificar el despliegue**:
   ```bash
   curl http://mcp-monitor-mcp-zawhow-f642d8-31-97-138-49.traefik.me/health
   ```

4. **Actualizar configuración de Trae IDE**:
   - Usar la configuración HTTP mostrada arriba
   - Reiniciar Trae IDE

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
      "type": "http",
      "url": "http://mcp-monitor-mcp-zawhow-f642d8-31-97-138-49.traefik.me/mcp"
    }
  }
}
```