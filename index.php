<?php
// index.php

// 1. Configurações de erro para não quebrar o JSON da API
ini_set('display_errors', 0);
error_reporting(E_ALL);

// Função para devolver erros em JSON
function enviarErroJSON($mensagem)
{
    header('Content-Type: application/json');
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => $mensagem]);
    exit();
}

// Captura erros fatais
register_shutdown_function(function () {
    $error = error_get_last();
    if ($error && ($error['type'] === E_ERROR || $error['type'] === E_PARSE)) {
        enviarErroJSON("Erro Fatal PHP: " . $error['message']);
    }
});

try {
    date_default_timezone_set('America/Sao_Paulo');

    // Inicia a sessão de forma segura
    if (session_status() === PHP_SESSION_NONE) {
        session_start([
            'cookie_httponly' => true,
            'cookie_samesite' => 'Lax',
        ]);
    }

    require_once __DIR__ . '/api/config/env.php';
    require_once __DIR__ . '/api/controller/PersonalController.php';
    require_once __DIR__ . '/api/controller/AuthController.php';

    $personalController = new PersonalController();
    $authController = new AuthController();

    $requestUri = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
    $requestUri = str_replace('/financeiro_martinelli', '', $requestUri);
    $requestMethod = $_SERVER['REQUEST_METHOD'];

    // --- PROTEÇÃO DE PRIVACIDADE ---

    // Apenas estas rotas podem ser acedidas sem login
    // 1. Verificar se é um arquivo físico na pasta public (CSS, JS, Imagens, Favicon)
    // 1. Identificar se é um arquivo físico (CSS, JS, Imagens)
    // Procuramos o arquivo dentro da pasta /public/ do projeto
    $arquivoCaminho = __DIR__ . '/public' . str_replace('/public', '', $requestUri);
    $ehArquivoFisico = file_exists($arquivoCaminho) && is_file($arquivoCaminho);

    // 2. Rotas que não precisam de login
    $rotasPublicas = ['/api/login', '/login.html'];
    $ehPublica = in_array($requestUri, $rotasPublicas);

    // SE não for arquivo físico E não for rota pública E não estiver logado -> BLOQUEIA
    if (!$ehArquivoFisico && !$ehPublica && !isset($_SESSION['usuario_id'])) {
        if (strpos($requestUri, '/api/') !== false) {
            header('Content-Type: application/json');
            http_response_code(401);
            echo json_encode(['success' => false, 'message' => 'Sessão expirada.']);
            exit;
        } else {
            header('Location: /financeiro_martinelli/login.html');
            exit;
        }
    }

    // --- ROTEAMENTO DO SISTEMA ---

    switch (true) {
        // Rota Raiz ou index.html (Protegido pelo check acima)
        case ($requestUri === '/' || $requestUri === '/index.html'):
            $arquivoInicio = __DIR__ . '/public/index.html';
            if (file_exists($arquivoInicio)) {
                header('Content-Type: text/html; charset=UTF-8');
                readfile($arquivoInicio);
            }
            break;

        // AUTH API
        case ($requestUri === '/api/login'):
            if ($requestMethod === 'POST')
                $authController->login();
            break;

        case ($requestUri === '/api/logout'):
            if ($requestMethod === 'POST')
                $authController->logout();
            break;

        // DASHBOARD & TRANSAÇÕES
        case ($requestUri === '/api/dashboard'):
            if ($requestMethod === 'GET')
                $personalController->getDashboard();
            break;

        case ($requestUri === '/api/transacoes'):
            if ($requestMethod === 'GET')
                $personalController->listarTransacoes();
            elseif ($requestMethod === 'POST')
                $personalController->salvarTransacao();
            break;

        case ($requestUri === '/api/cartao'):
            if ($requestMethod === 'GET')
                $personalController->getDadosCartao();
            break;

        case ($requestUri === '/api/cartao/pagar'):
            if ($requestMethod === 'POST')
                $personalController->pagarFatura();
            break;

        case preg_match('/\/api\/transacoes\/(\d+)$/', $requestUri, $matches):
            $id = $matches[1];
            if ($requestMethod === 'DELETE')
                $personalController->excluirTransacao($id);
            elseif ($requestMethod === 'PUT')
                $personalController->editarTransacao($id);
            break;

        // CATEGORIAS
        case ($requestUri === '/api/categorias'):
            if ($requestMethod === 'GET')
                $personalController->listarCategorias();
            elseif ($requestMethod === 'POST')
                $personalController->salvarCategoria();
            break;

        // COFRINHOS
        case ($requestUri === '/api/cofrinhos'):
            if ($requestMethod === 'GET')
                $personalController->listarCofrinhos();
            elseif ($requestMethod === 'POST')
                $personalController->criarCofrinho();
            break;

        case ($requestUri === '/api/cofrinhos/movimentar'):
            if ($requestMethod === 'POST')
                $personalController->movimentarCofrinho();
            break;

        case preg_match('/\/api\/cofrinhos\/(\d+)$/', $requestUri, $matches):
            if ($requestMethod === 'DELETE')
                $personalController->excluirCofrinho($matches[1]);
            break;

        case preg_match('/^\/api\/cofrinhos\/(\d+)\/meta$/', $requestUri, $matches):
            if ($requestMethod === 'PUT')
                $personalController->editarMetaCofrinho($matches[1]);
            break;



        // GESTÃO DE ARQUIVOS ESTÁTICOS & 404
        default:
            if (strpos($requestUri, '/api/') !== false) {
                header('Content-Type: application/json');
                http_response_code(404);
                echo json_encode(['success' => false, 'message' => 'Rota não encontrada.']);
            } else {
                // Tenta servir arquivos da pasta public (CSS, JS, Imagens)
                $arquivoCaminho = __DIR__ . '/public' . $requestUri;
                if (file_exists($arquivoCaminho) && is_file($arquivoCaminho)) {
                    readfile($arquivoCaminho);
                } else {
                    // Se nada for encontrado, volta para o login ou home conforme o estado
                    header('Location: /financeiro_martinelli/login.html');
                }
            }
            break;
    }

} catch (Exception $e) {
    enviarErroJSON($e->getMessage());
}