FROM php:8.2-apache

# Ativa módulos
RUN a2enmod rewrite
RUN docker-php-ext-install mysqli pdo pdo_mysql

# Copia os arquivos e ajusta as permissões
COPY . /var/www/html/
RUN chown -R www-data:www-data /var/www/html/ && chmod -R 755 /var/www/html/

EXPOSE 80

# O PULO DO GATO 2.0: Pega as variáveis, coloca aspas em tudo para não quebrar, e liga o servidor
CMD printenv | sed 's/=\(.*\)/="\1"/' > /var/www/html/.env && chown www-data:www-data /var/www/html/.env && apache2-foreground
