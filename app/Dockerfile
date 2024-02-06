
FROM nginx:latest

COPY ./ /usr/share/nginx/html

COPY ./nginx-custom.conf /etc/nginx/conf.d/default.conf

EXPOSE 4200

# Inicia Nginx
CMD ["nginx", "-g", "daemon off;"]
