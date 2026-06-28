FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends android-tools-adb ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json /app/
RUN npm ci --omit=dev

COPY . /app

ENV PORT=3000
ENV DRIVER=google-tv
ENV ADB_CONNECT_TIMEOUT_SECONDS=8

EXPOSE 3000

CMD ["sh", "-c", "if [ -n \"$GOOGLE_TV_ADDR\" ]; then timeout \"$ADB_CONNECT_TIMEOUT_SECONDS\" adb connect \"$GOOGLE_TV_ADDR\" || true; fi; npm start"]
