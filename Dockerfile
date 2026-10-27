FROM node:20-alpine

WORKDIR /app

COPY server/pan-search.js ./server/
COPY config.json ./

ENV PORT=8889 \
    NODE_ENV=production

EXPOSE 8889

CMD ["node", "server/pan-search.js"]
