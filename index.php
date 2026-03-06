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
        enviarErroJSON("Erro Fatal PHP: " . $error['message'] . " na linha " . $error['line']);
    }
});

try {
    date_default_timezone_set('America/Sao_Paulo');

    // Headers CORS (Vindo da alteração)
    header('Access-Control-Allow-Origin: *');
    header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');

    // Trata requisições OPTIONS para o CORS
    if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
        http_response_code(200);
        exit();
    }

    // Inicia a sessão de forma segura
    if (session_status() === PHP_SESSION_NONE) {
        session_start([
            'cookie_httponly' => true,
            'cookie_samesite' => 'Lax',
        ]);
    }

    require_once __DIR__ . '/api/config/env.php';

    // Carrega os controllers com verificação de existência (Vindo da alteração)
    $arqPersonalController = __DIR__ . '/api/controller/PersonalController.php';
    $arqAuthController = __DIR__ . '/api/controller/AuthController.php';

    if (!file_exists($arqPersonalController))
        throw new Exception("Controller não encontrado: $arqPersonalController");
    if (!file_exists($arqAuthController))
        throw new Exception("Controller Auth não encontrado: $arqAuthController");

    require_once $arqPersonalController;
    require_once $arqAuthController;

    $personalController = new PersonalController();
    $authController = new AuthController();

    // Limpeza e preparo da URL
    $requestUri = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
    $requestUri = str_replace('/financeiro_martinelli', '', $requestUri); // Ajuste de subpasta original
    if (strpos($requestUri, '/index.php') === 0) {
        $requestUri = substr($requestUri, strlen('/index.php')); // Ajuste do arquivo de alteração
    }
    if ($requestUri === '') {
        $requestUri = '/';
    }

    $requestMethod = $_SERVER['REQUEST_METHOD'];

    // --- PROTEÇÃO DE PRIVACIDADE (Mantida do original por segurança) ---

    $arquivoCaminho = __DIR__ . '/public' . str_replace('/public', '', $requestUri);
    $ehArquivoFisico = file_exists($arquivoCaminho) && is_file($arquivoCaminho);

    // Rotas que não precisam de login (adicionei o status aqui também)
    $rotasPublicas = ['/api/login', '/login.html', '/api/status'];
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
        // Rota Raiz ou index.html
        case ($requestUri === '/' || $requestUri === '/index.html'):
            $arquivoInicio = __DIR__ . '/public/index.html';
            if (file_exists($arquivoInicio)) {
                header('Content-Type: text/html; charset=UTF-8');
                readfile($arquivoInicio);
            } else {
                echo "Arquivo frontend não encontrado em: $arquivoInicio";
            }
            break;

        // STATUS DA API (Nova rota)
        case ($requestUri === '/api/status'):
            echo json_encode(['status' => 'ok']);
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

        // DASHBOARD
        case ($requestUri === '/api/dashboard'):
            if ($requestMethod === 'GET')
                $personalController->getDashboard();
            break;

        // TRANSAÇÕES
        case ($requestUri === '/api/transacoes'):
            if ($requestMethod === 'GET')
                $personalController->listarTransacoes();
            elseif ($requestMethod === 'POST')
                $personalController->salvarTransacao();
            break;

        case preg_match('/^\/api\/transacoes\/(\d+)$/', $requestUri, $matches):
            $id = $matches[1];
            if ($requestMethod === 'DELETE')
                $personalController->excluirTransacao($id);
            elseif ($requestMethod === 'PUT')
                $personalController->editarTransacao($id);
            break;

        // CARTÃO
        case ($requestUri === '/api/cartao'):
            if ($requestMethod === 'GET')
                $personalController->getDadosCartao();
            break;

        case ($requestUri === '/api/cartao/pagar'):
            if ($requestMethod === 'POST')
                $personalController->pagarFatura();
            break;

        // CATEGORIAS
        case ($requestUri === '/api/categorias'):
            if ($requestMethod === 'GET')
                $personalController->listarCategorias();
            elseif ($requestMethod === 'POST') {
                // Checa qual método você está usando no controller atualmente (salvar ou criar)
                if (method_exists($personalController, 'salvarCategoria')) {
                    $personalController->salvarCategoria();
                } else {
                    $personalController->criarCategoria();
                }
            }
            break;

        case preg_match('/^\/api\/categorias\/(\d+)$/', $requestUri, $matches):
            $id = $matches[1];
            if ($requestMethod === 'PUT')
                $personalController->editarCategoria($id);
            elseif ($requestMethod === 'DELETE')
                $personalController->excluirCategoria($id);
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

        case preg_match('/^\/api\/cofrinhos\/(\d+)$/', $requestUri, $matches):
            $id = $matches[1];
            if ($requestMethod === 'DELETE')
                $personalController->excluirCofrinho($id);
            elseif ($requestMethod === 'PUT')
                $personalController->editarCofrinho($id);
            break;

        case preg_match('/^\/api\/cofrinhos\/(\d+)\/meta$/', $requestUri, $matches):
            if ($requestMethod === 'PUT')
                $personalController->editarMetaCofrinho($matches[1]);
            break;

        // ORÇAMENTO (Nova rota)
        case ($requestUri === '/api/orcamento'):
            if ($requestMethod === 'GET')
                $personalController->getOrcamento();
            elseif ($requestMethod === 'POST')
                $personalController->salvarOrcamento();
            break;

        // FIXAS E OUTROS
        case ($requestUri === '/api/usuario/wpp'):
            if ($requestMethod === 'POST')
                $personalController->salvarLinkWhatsapp();
            break;

        case ($requestUri === '/api/fixas'):
            if ($requestMethod === 'GET')
                $personalController->listarFixas();
            elseif ($requestMethod === 'POST')
                $personalController->salvarFixa();
            break;

        case preg_match('/^\/api\/fixas\/(\d+)$/', $requestUri, $matches):
            $id = $matches[1];
            if ($requestMethod === 'DELETE')
                $personalController->excluirFixa($id);
            break;

        // GESTÃO DE ARQUIVOS ESTÁTICOS & 404
        default:
            if (strpos($requestUri, '/api/') !== false) {
                header('Content-Type: application/json');
                http_response_code(404);
                echo json_encode(['success' => false, 'message' => 'Rota não encontrada: ' . $requestUri]);
            } else {
                // Tenta servir arquivos da pasta public (CSS, JS, Imagens)
                $arquivoCaminho = __DIR__ . '/public' . $requestUri;
                if (file_exists($arquivoCaminho) && is_file($arquivoCaminho)) {
                    readfile($arquivoCaminho);
                } else {
                    // Se nada for encontrado, volta para o login
                    header('Location: /financeiro_martinelli/login.html');
                }
            }
            break;
    }

} catch (Exception $e) {
    enviarErroJSON($e->getMessage());
}