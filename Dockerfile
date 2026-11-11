# Static site - no build step, no backend. Just nginx serving 2 things.
FROM nginx:alpine
COPY index.html sitemap.xml robots.txt /usr/share/nginx/html/
COPY assets/ /usr/share/nginx/html/assets/
EXPOSE 80
