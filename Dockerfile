FROM php:8.2-apache

# Ativa módulos
RUN a2enmod rewrite
RUN docker-php-ext-install mysqli pdo pdo_mysql

# Copia os arquivos e ajusta as permissões
COPY . /var/www/html/
RUN chown -R www-data:www-data /var/www/html/ && chmod -R 755 /var/www/html/

EXPOSE 80

# O PULO DO GATO DEFINITIVO: Escrevemos apenas as variáveis do banco, linha por linha, de forma super limpa!
CMD echo "DB_CONNECTION=${DB_CONNECTION}" > /var/www/html/.env && \
    echo "DB_HOST=${DB_HOST}" >> /var/www/html/.env && \
    echo "DB_PORT=${DB_PORT}" >> /var/www/html/.env && \
    echo "DB_DATABASE=${DB_DATABASE}" >> /var/www/html/.env && \
    echo "DB_USERNAME=${DB_USERNAME}" >> /var/www/html/.env && \
    echo "DB_PASSWORD=${DB_PASSWORD}" >> /var/www/html/.env && \
    chown www-data:www-data /var/www/html/.env && \
    apache2-foreground
