FROM node:24-alpine

WORKDIR /app

COPY package.json ./
COPY src ./src
COPY ui ./ui

EXPOSE 3000 4000 4001 4002 4003

CMD ["node", "src/local-cluster.js"]
