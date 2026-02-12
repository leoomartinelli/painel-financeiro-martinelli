<?php
// index.php

// Força o PHP a não mostrar erros HTML na tela, para não quebrar o JSON
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

// Captura erros fatais que escapam do try-catch
register_shutdown_function(function () {
    $error = error_get_last();
    if ($error && ($error['type'] === E_ERROR || $error['type'] === E_PARSE)) {
        enviarErroJSON("Erro Fatal PHP: " . $error['message'] . " na linha " . $error['line']);
    }
});

try {
    date_default_timezone_set('America/Sao_Paulo');

    header('Access-Control-Allow-Origin: *');
    header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');

    if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
        http_response_code(200);
        exit();
    }
    require_once __DIR__ . '/api/config/env.php';

    // 1. Tenta carregar o Banco
    $arqDatabase = __DIR__ . '/api/config/Database.php';
    if (!file_exists($arqDatabase))
        throw new Exception("Arquivo de banco não encontrado: $arqDatabase");
    require_once $arqDatabase;

    // 2. Tenta carregar o Controller
    $arqController = __DIR__ . '/api/controller/PersonalController.php';
    if (!file_exists($arqController))
        throw new Exception("Arquivo de controller não encontrado: $arqController");
    require_once $arqController;

    // Roteamento
    $requestMethod = $_SERVER['REQUEST_METHOD'];
    $requestUri = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);

    // Ajuste para subpastas
    if (strpos($requestUri, '/index.php') === 0) {
        $requestUri = substr($requestUri, strlen('/index.php'));
    }

    // Instancia o Controller
    if (!class_exists('PersonalController')) {
        throw new Exception("A classe PersonalController não foi encontrada dentro do arquivo.");
    }
    $personalController = new PersonalController();

    // Rotas
    switch (true) {
        // Rota Frontend
        case $requestUri === '/' || $requestUri === '' || strpos($requestUri, '/index.html') !== false:
            $arquivoInicio = __DIR__ . '/public/index.html';
            if (file_exists($arquivoInicio)) {
                header('Content-Type: text/html; charset=UTF-8');
                readfile($arquivoInicio);
            } else {
                echo "Arquivo frontend não encontrado em: $arquivoInicio";
            }
            exit();

        case strpos($requestUri, '/api/dashboard') !== false:
            if ($requestMethod === 'GET')
                $personalController->getDashboard();
            break;

        case strpos($requestUri, '/api/transacoes') !== false && !preg_match('/\/api\/transacoes\/\d+/', $requestUri):
            if ($requestMethod === 'GET')
                $personalController->listarTransacoes();
            elseif ($requestMethod === 'POST')
                $personalController->salvarTransacao();
            break;

        case preg_match('/\/api\/transacoes\/(\d+)$/', $requestUri, $matches):
            $id = $matches[1];
            if ($requestMethod === 'PUT')
                $personalController->editarTransacao($id);
            elseif ($requestMethod === 'DELETE')
                $personalController->excluirTransacao($id);
            break;

        case strpos($requestUri, '/api/categorias') !== false:
            if ($requestMethod === 'GET')
                $personalController->listarCategorias();
            elseif ($requestMethod === 'POST')
                $personalController->criarCategoria();
            break;

        case strpos($requestUri, '/api/status') !== false:
            echo json_encode(['status' => 'ok']);
            break;

        case strpos($requestUri, '/api/categorias') !== false && !preg_match('/\/api\/categorias\/\d+/', $requestUri):
            if ($requestMethod === 'GET') {
                $personalController->listarCategorias();
            } elseif ($requestMethod === 'POST') {
                $personalController->criarCategoria();
            }
            break;

        // --- CATEGORIAS (Editar e Excluir por ID) ---
        case preg_match('/\/api\/categorias\/(\d+)$/', $requestUri, $matches):
            $id = $matches[1];
            if ($requestMethod === 'PUT') {
                $personalController->editarCategoria($id);
            } elseif ($requestMethod === 'DELETE') {
                $personalController->excluirCategoria($id);
            }
            break;

        case strpos($requestUri, '/api/cartao/pagar') !== false:
            if ($requestMethod === 'POST')
                $personalController->pagarFatura();
            break;

        case strpos($requestUri, '/api/cartao') !== false:
            if ($requestMethod === 'GET')
                $personalController->getDadosCartao();
            break;

        case strpos($requestUri, '/api/cofrinhos/movimentar') !== false:
            if ($requestMethod === 'POST')
                $personalController->movimentarCofrinho();
            break;

        case strpos($requestUri, '/api/cofrinhos') !== false && !preg_match('/\/api\/cofrinhos\/\d+/', $requestUri):
            if ($requestMethod === 'GET')
                $personalController->listarCofrinhos();
            elseif ($requestMethod === 'POST')
                $personalController->criarCofrinho();
            break;

        case preg_match('/\/api\/cofrinhos\/(\d+)$/', $requestUri, $matches):
            $id = $matches[1];
            if ($requestMethod === 'DELETE')
                $personalController->excluirCofrinho($id);
            break;

        case preg_match('/^\/api\/cofrinhos\/(\d+)\/meta$/', $requestUri, $matches):
            if ($requestMethod === 'PUT') {
                $personalController->editarMetaCofrinho($matches[1]);
            }
            break;

        default:
            // Se chegou aqui e não é o frontend, é 404 API
            if (strpos($requestUri, '/api/') !== false) {
                header('Content-Type: application/json');
                http_response_code(404);
                echo json_encode(['success' => false, 'message' => 'Rota não encontrada: ' . $requestUri]);
            } else {
                // Tenta carregar o front de novo caso a URL esteja estranha
                $arquivoInicio = __DIR__ . '/public/index.html';
                if (file_exists($arquivoInicio)) {
                    header('Content-Type: text/html; charset=UTF-8');
                    readfile($arquivoInicio);
                }
            }
            break;
    }

} catch (Exception $e) {
    enviarErroJSON($e->getMessage());
}
?>