# syntax=docker/dockerfile:1

FROM nginxinc/nginx-unprivileged:1.27-alpine@sha256:65e3e85dbaed8ba248841d9d58a899b6197106c23cb0ff1a132b7bfe0547e4c0

LABEL org.opencontainers.image.title="dataset-analis" \
      org.opencontainers.image.description="Dashboard statis analisis dataset penjualan" \
      org.opencontainers.image.licenses="MIT"

COPY --chown=101:0 nginx.conf /etc/nginx/conf.d/default.conf
COPY --chown=101:0 index.html /usr/share/nginx/html/index.html
COPY --chown=101:0 assets/ /usr/share/nginx/html/assets/
COPY --chown=101:0 data/ /usr/share/nginx/html/data/

USER 101

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget -qO- http://127.0.0.1:8080/healthz || exit 1
