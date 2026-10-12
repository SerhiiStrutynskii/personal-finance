# Образ застосунку: API, який роздає зібраний фронтенд із того самого домену.

FROM node:24-slim AS build
WORKDIR /app
# Спершу лише маніфести — так шар із залежностями кешується між збірками.
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN npm ci
COPY . .
RUN npm run build

FROM node:24-slim
ENV NODE_ENV=production \
    PORT=3000 \
    WEB_DIST_DIR=../web/dist \
    TRUST_PROXY=1
WORKDIR /app
COPY --from=build /app/package.json /app/package-lock.json /app/tsconfig.base.json ./
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/packages packages
COPY --from=build /app/apps/api apps/api
COPY --from=build /app/apps/web/dist apps/web/dist
USER node
EXPOSE 3000
# Застосовує міграції й запускає сервер.
CMD ["npm", "start"]
