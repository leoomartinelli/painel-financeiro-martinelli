<?php
// api/controller/PersonalController.php

require_once __DIR__ . '/../model/PersonalFinanceiro.php';

class PersonalController
{
    private $model;

    public function __construct()
    {
        $this->model = new PersonalFinanceiro();
        // Garante que a sessão esteja ativa para acessar o usuario_id
        if (session_status() === PHP_SESSION_NONE) {
            session_start();
        }
    }

    private function jsonResponse($data, $status = 200)
    {
        header('Content-Type: application/json');
        http_response_code($status);
        echo json_encode($data);
        exit;
    }

    // GET /api/dashboard
    public function getDashboard()
    {
        $idUsuario = $_SESSION['usuario_id']; //
        $mes = $_GET['mes'] ?? date('m');
        $ano = $_GET['ano'] ?? date('Y');

        $resumo = $this->model->getResumoMes($mes, $ano, $idUsuario);
        $transacoes = $this->model->getTransacoes($mes, $ano, $idUsuario);
        $grafico = $this->model->getDadosAnuais($ano, $idUsuario);

        $this->jsonResponse([
            'success' => true,
            'data' => [
                'resumo' => $resumo,
                'transacoes' => $transacoes,
                'grafico' => $grafico
            ]
        ]);
    }

    // GET /api/transacoes
    public function listarTransacoes()
    {
        $idUsuario = $_SESSION['usuario_id'];
        $mes = $_GET['mes'] ?? date('m');
        $ano = $_GET['ano'] ?? date('Y');
        $tipo = $_GET['tipo'] ?? null;

        $dados = $this->model->getTransacoes($mes, $ano, $idUsuario, $tipo);
        $this->jsonResponse(['success' => true, 'data' => $dados]);
    }

    // POST /api/transacoes
    public function salvarTransacao()
    {
        $idUsuario = $_SESSION['usuario_id'];
        $input = json_decode(file_get_contents('php://input'), true);

        if (empty($input['descricao']) || empty($input['valor']) || empty($input['data'])) {
            $this->jsonResponse(['success' => false, 'message' => 'Campos obrigatórios faltando.'], 400);
        }

        $resultado = $this->model->criarTransacao($input, $idUsuario);
        $this->jsonResponse($resultado);
    }

    // PUT /api/transacoes/{id}
    public function editarTransacao($id)
    {
        $idUsuario = $_SESSION['usuario_id'];
        $input = json_decode(file_get_contents('php://input'), true);
        $resultado = $this->model->atualizarTransacao($id, $input, $idUsuario);
        $this->jsonResponse($resultado);
    }

    // DELETE /api/transacoes/{id}
    public function excluirTransacao($id)
    {
        $idUsuario = $_SESSION['usuario_id'];
        $resultado = $this->model->deletarTransacao($id, $idUsuario);
        $this->jsonResponse($resultado);
    }

    // GET /api/categorias
    public function listarCategorias()
    {
        $idUsuario = $_SESSION['usuario_id'];
        $tipo = $_GET['tipo'] ?? null;
        $dados = $this->model->getCategorias($idUsuario, $tipo);
        $this->jsonResponse(['success' => true, 'data' => $dados]);
    }

    // POST /api/categorias
    public function salvarCategoria()
    {
        $idUsuario = $_SESSION['usuario_id'];
        $input = json_decode(file_get_contents('php://input'), true);

        if (empty($input['nome']) || empty($input['tipo'])) {
            $this->jsonResponse(['success' => false, 'message' => 'Nome e Tipo são obrigatórios.'], 400);
        }

        $resultado = $this->model->criarCategoria($input['nome'], $input['tipo'], $idUsuario);
        $this->jsonResponse($resultado);
    }

    // DELETE /api/categorias/{id}
    public function excluirCategoria($id)
    {
        $idUsuario = $_SESSION['usuario_id'];
        $resultado = $this->model->deletarCategoria($id, $idUsuario);
        $this->jsonResponse($resultado);
    }

    // GET /api/cartao
    public function getDadosCartao()
    {
        $idUsuario = $_SESSION['usuario_id'];
        $dados = $this->model->getFaturaAberta($idUsuario);
        $this->jsonResponse(['success' => true, 'data' => $dados]);
    }

    // POST /api/cartao/pagar
    public function pagarFatura()
    {
        $idUsuario = $_SESSION['usuario_id'];
        $resultado = $this->model->pagarFatura($idUsuario);
        $this->jsonResponse($resultado);
    }

    // --- COFRINHOS ---

    public function listarCofrinhos()
    {
        $idUsuario = $_SESSION['usuario_id'];
        $dados = $this->model->listarCofrinhos($idUsuario);
        $this->jsonResponse(['success' => true, 'data' => $dados]);
    }

    public function criarCofrinho()
    {
        $idUsuario = $_SESSION['usuario_id'];
        $input = json_decode(file_get_contents('php://input'), true);

        $res = $this->model->criarCofrinho(
            $input['nome'],
            $input['meta'] ?? 0,
            $input['cor'] ?? 'bg-blue-600',
            $idUsuario
        );
        $this->jsonResponse($res);
    }

    public function movimentarCofrinho()
    {
        $idUsuario = $_SESSION['usuario_id'];
        $input = json_decode(file_get_contents('php://input'), true);

        if (empty($input['id']) || empty($input['valor']) || empty($input['tipo'])) {
            $this->jsonResponse(['success' => false, 'message' => 'Dados inválidos'], 400);
        }

        $res = $this->model->movimentarCofrinho($input['id'], $input['valor'], $input['tipo'], $idUsuario);
        $this->jsonResponse($res);
    }

    public function excluirCofrinho($id)
    {
        $idUsuario = $_SESSION['usuario_id'];
        $res = $this->model->excluirCofrinho($id, $idUsuario);
        $this->jsonResponse($res);
    }

    public function editarCofrinho($id)
    {
        $idUsuario = $_SESSION['usuario_id'];
        $input = json_decode(file_get_contents('php://input'), true);

        // Verifica se veio nome e meta
        if (empty($input['nome']) || !isset($input['meta'])) {
            $this->jsonResponse(['success' => false, 'message' => 'Nome e Meta são obrigatórios'], 400);
        }

        // Chama o método atualizado do Model
        $res = $this->model->atualizarCofrinho($id, $input['nome'], $input['meta'], $idUsuario);
        $this->jsonResponse($res);
    }

    public function salvarLinkWhatsapp()
    {
        $idUsuario = $_SESSION['usuario_id'];
        $input = json_decode(file_get_contents('php://input'), true);

        if (empty($input['link'])) {
            $this->jsonResponse(['success' => false, 'message' => 'Link inválido'], 400);
        }

        $res = $this->model->salvarLinkWpp($input['link'], $idUsuario);
        $this->jsonResponse($res);
    }


}