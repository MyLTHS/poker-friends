# Production image of the web app (docker-compose.prod.yml). Built from the repository root
# because the app imports the API contract from docs/api/; web/Dockerfile.dockerignore keeps
# the rest of the repository out. One stage on purpose: `next start` runs with the same
# node_modules the build used.
FROM node:24-slim

WORKDIR /app/web
ENV NEXT_TELEMETRY_DISABLED=1

COPY web/package.json web/package-lock.json ./
RUN npm ci

COPY docs/api /app/docs/api
COPY web/ ./
# Read at build time: Next.js writes NEXT_PUBLIC_* values into the browser bundle.
ARG NEXT_PUBLIC_DJANGO_WS
ENV NEXT_PUBLIC_DJANGO_WS=$NEXT_PUBLIC_DJANGO_WS
ARG NEXT_PUBLIC_RELEASE
ENV NEXT_PUBLIC_RELEASE=$NEXT_PUBLIC_RELEASE
RUN npm run build

ENV NODE_ENV=production
EXPOSE 3000
CMD ["npx", "next", "start", "-H", "0.0.0.0", "-p", "3000"]
