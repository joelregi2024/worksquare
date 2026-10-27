FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=8080
COPY package.json server.js ./
COPY public ./public
USER node
EXPOSE 8080
CMD ["node", "server.js"]
