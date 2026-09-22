FROM nginx:alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY . /usr/share/nginx/html

RUN rm -f /usr/share/nginx/html/Dockerfile \
    /usr/share/nginx/html/nginx.conf \
    /usr/share/nginx/html/.dockerignore

EXPOSE 80

CMD ["/bin/sh", "-c", "sed -i \"s/LISTEN_PORT/${PORT:-80}/\" /etc/nginx/conf.d/default.conf && nginx -g 'daemon off;'"]
