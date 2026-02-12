# Financeiro Martinelli

Sistema web simples para **controle financeiro pessoal**, com:
- **Fluxo de Caixa** (Receitas/Despesas, pago x pendente, saldo atual e previsto)
- **Categorias** (gerenciar receitas e despesas por categoria)
- **Cofrinhos / Caixinhas** (guardar e resgatar valores para objetivos)
- **Cartão de Crédito** (histórico da fatura e ação de “Pagar Fatura”)

Frontend em HTML/JS (com Tailwind e Chart.js) e backend em PHP (API) com banco MySQL.

---

## 📌 Finalidade

Organizar finanças do dia a dia em um painel único:
- Registrar transações (entrada/saída), data, categoria e status (pago/pendente)
- Visualizar resumo do mês e gráfico anual
- Separar dinheiro por objetivos (cofrinhos)
- Controlar compras no crédito e a fatura do cartão

---

## ✅ Requisitos

Para rodar localmente (recomendado):
- **Windows + XAMPP** (Apache + MySQL)
- **PHP** (via XAMPP)
- **MySQL/MariaDB** (via XAMPP)
- (Opcional) **Composer** (caso precise reinstalar dependências)

---

## 📁 Estrutura do projeto (visão rápida)

- `/api` → API em PHP (controllers, models e config)
- `/public` → CSS/JS e arquivos do front (assets)
- `/vendor` → dependências PHP (composer)
- `index.php` → entrada do backend/roteamento
- `.htaccess` → regras de rewrite (importante para rotas amigáveis da API)

O Front usa `public/js/app.js` :contentReference[oaicite:2]{index=2}.

---

## 🚀 Instalação (PC novo com XAMPP)

### 1) Copiar o projeto para o XAMPP
1. Instale o **XAMPP**
2. Copie a pasta do projeto para:
   `C:\xampp\htdocs\financeiro_martinelli`

> IMPORTANTE: o nome da pasta **financeiro_martinelli** é usado no JavaScript para montar a URL da API:
`const API_BASE = '/financeiro_martinelli/api';`  
Se você mudar o nome da pasta, ajuste esse caminho em `public/js/app.js`.

---

### 2) Criar o banco de dados
1. Abra o **phpMyAdmin**:
   http://localhost/phpmyadmin
2. Crie um banco, por exemplo:
   `financeiro_martinelli`
3. Execute o script SQL para criar as tabelas.

📌 Onde está o SQL?
- Verifique em: `api/config/banco/querrys.txt`  
(ali normalmente ficam as queries de criação de tabelas e inserts iniciais)

---

### 3) Configurar credenciais do banco
Edite o arquivo:
- `api/config/env.php` (ou equivalente)

E ajuste:
- host (normalmente `localhost`)
- database (ex: `financeiro_martinelli`)
- user (ex: `root`)
- password (ex: vazio no XAMPP padrão)

A classe de conexão costuma estar em:
- `api/config/Database.php`

---

### 4) Ativar o Apache e MySQL
No painel do **XAMPP Control Panel**:
- Start **Apache**
- Start **MySQL**

---

### 5) Abrir no navegador
Acesse:
- http://localhost/financeiro_martinelli/

Se seu front estiver em um arquivo específico, teste também:
- http://localhost/financeiro_martinelli/public/
- ou http://localhost/financeiro_martinelli/public/index.html

(Depende de como o `index.php` está encaminhando a tela.)

---

## 🧭 Como usar (rápido)

### Fluxo de Caixa
- Selecione **Mês/Ano**
- Clique em **Nova Transação**
- Preencha: descrição, valor, data, tipo (Receita/Despesa), categoria e status (pago/pendente)
- O sistema mostra:
  - Receitas pagas + pendentes
  - Despesas pagas + pendentes
  - Saldo atual (pagos)
  - Saldo previsto (considera pendências e fatura prevista)

### Categorias
- Clique em **Gerenciar Categorias**
- Crie/edite/exclua categorias de Receita/Despesa
- Ao excluir categoria, transações podem ficar como “Sem Categoria”.

### Cofrinhos (Caixinhas)
- Crie caixinhas com meta e cor do card
- Use **Guardar** (vira despesa no saldo principal)
- Use **Resgatar** (vira receita no saldo principal)

### Cartão de Crédito
- Visualiza fatura atual e itens no crédito
- **Pagar Fatura** marca compras como pagas e zera a fatura (conforme regra do backend)

---

## 🔌 Endpoints da API (principais)

O Front consome a API a partir de:
`/financeiro_martinelli/api` :contentReference[oaicite:3]{index=3}

Rotas usadas pelo JS:
- `GET /dashboard?mes=MM&ano=YYYY`
- `GET /transacoes` | `POST /transacoes`
- `PUT /transacoes/{id}` | `DELETE /transacoes/{id}`
- `GET /categorias` | `POST /categorias`
- `PUT /categorias/{id}` | `DELETE /categorias/{id}`
- `GET /cartao`
- `POST /cartao/pagar`
- `GET /cofrinhos`
- `POST /cofrinhos`
- `POST /cofrinhos/movimentar`
- `DELETE /cofrinhos/{id}`
- `PUT /cofrinhos/{id}/meta`

---

## 🛠️ Problemas comuns

### 1) “Erro de comunicação com o servidor”
O Front mostra esse alerta quando a API não responde :contentReference[oaicite:4]{index=4}.
Cheque:
- Apache e MySQL estão ligados no XAMPP?
- A URL está certa? (pasta `financeiro_martinelli`)
- O `.htaccess` está sendo lido? (módulo rewrite no Apache)

### 2) 404 nas rotas `/api/...`
- Confirme se existe `.htaccess` na raiz
- Confirme se o Apache permite rewrite (AllowOverride)
- Confirme se o `index.php` está roteando as requisições

### 3) Banco não conecta
- Revise `api/config/env.php` e `api/config/Database.php`
- Confirme usuário/senha do MySQL no XAMPP
- Confirme se o banco e tabelas foram criados

---

## 🔒 Observação de segurança
Projeto pensado para uso local/interno.
Se for publicar em servidor:
- Proteja credenciais do banco
- Valide/escape entradas
- Configure CORS corretamente (se necessário)
- Considere autenticação

---

## 📄 Licença
Uso interno/privado (ajuste conforme necessidade).
