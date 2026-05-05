FROM node:20-slim AS builder

WORKDIR /app

# Instala OpenSSL (necessário para Prisma funcionar corretamente)
RUN apt-get update && apt-get install -y openssl

# 1. Copia apenas os manifestos de pacotes primeiro
COPY . .

# 2. Instala as dependências (isso cria a CLI do Prisma no node_modules)
RUN npm install

# 3. COPIA A PASTA PRISMA (Onde está o seu schema.prisma)
# Fazemos isso antes do restante do código para otimizar o cache do Docker

# 6. Copia o restante do código fonte (src, nest-cli.json, etc.)

EXPOSE 3001

# DICA: Para produção, use "start:prod". Se for desenvolvimento local, "start:dev"
CMD ["npm", "run", "start:dev"]