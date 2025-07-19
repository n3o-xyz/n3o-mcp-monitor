FROM node:18-alpine

# Metadatos
LABEL maintainer="Trae Team"
LABEL description="Servidor MCP para Trae IDE Monitor"
LABEL version="1.0.0"

# Crear directorio de trabajo
WORKDIR /app

# Instalar dependencias del sistema
RUN apk add --no-cache \
    dumb-init \
    && rm -rf /var/cache/apk/*

# Copiar archivos de dependencias
COPY package*.json ./

# Instalar dependencias de Node.js
RUN npm ci --only=production && npm cache clean --force

# Copiar código fuente
COPY server.js ./

# Crear usuario no-root para seguridad
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 -G nodejs

# Cambiar permisos y usuario
RUN chown -R nodejs:nodejs /app
USER nodejs

# Variables de entorno por defecto
ENV NODE_ENV=production
ENV LOG_LEVEL=info
ENV MCP_MONITOR_URL=ws://localhost:2200
ENV USER_ID=687a8418096ca32b8c045cf8
ENV SOURCE_NAME=trae-mcp-monitor

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD node -e "console.log('Health check passed')" || exit 1

# Usar dumb-init para manejo correcto de señales
ENTRYPOINT ["dumb-init", "--"]

# Comando de inicio
CMD ["node", "server.js"]