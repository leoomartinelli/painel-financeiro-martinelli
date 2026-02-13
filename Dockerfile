FROM php:8.2-apache

# Ativa o módulo de reescrita do Apache (muito usado em sistemas PHP)
RUN a2enmod rewrite

# Instala as extensões para o PHP conseguir conversar com o Banco de Dados
RUN docker-php-ext-install mysqli pdo pdo_mysql

# Copia os arquivos e ajusta as permissões corretas
COPY . /var/www/html/
RUN chown -R www-data:www-data /var/www/html/ && chmod -R 755 /var/www/html/

EXPOSE 80
