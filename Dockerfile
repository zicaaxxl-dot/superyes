FROM node:20-alpine

WORKDIR /app
COPY package.json package.json
RUN npm install --omit=dev
COPY . .

RUN mkdir -p /data
ENV NODE_ENV=production
ENV DATA_DIR=/data
EXPOSE 10000

CMD ["node", "server/index.js"]
