FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY erp-webhook/ ./erp-webhook/

ENV NODE_ENV=production
ENV ERP_PORT=8080

EXPOSE 8080

CMD ["node", "--loader", "ts-node/esm", "erp-webhook/index.ts"]
