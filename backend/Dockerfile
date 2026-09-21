# --- build stage ------------------------------------------------------------
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig*.json nest-cli.json ./
COPY src ./src
RUN npm run build

# --- runtime stage ----------------------------------------------------------
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
# Only production dependencies ship; the Nest CLI and test tooling stay behind.
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
# Run unprivileged; the node image already provides this user.
USER node
EXPOSE 4000
CMD ["node", "dist/main.js"]
