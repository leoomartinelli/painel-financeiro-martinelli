<?php
// api/controller/PersonalController.php

require_once __DIR__ . '/../model/PersonalFinanceiro.php';

class PersonalController
{
    private $model;

    public function __construct()
    {
        $this->model = new PersonalFinanceiro();
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
        $mes = $_GET['mes'] ?? date('m');
        $ano = $_GET['ano'] ?? date('Y');

        $resumo = $this->model->getResumoMes($mes, $ano);
        $transacoes = $this->model->getTransacoes($mes, $ano);
        $grafico = $this->model->getDadosAnuais($ano);

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
        $mes = $_GET['mes'] ?? date('m');
        $ano = $_GET['ano'] ?? date('Y');
        $tipo = $_GET['tipo'] ?? null;

        $dados = $this->model->getTransacoes($mes, $ano, $tipo);
        $this->jsonResponse(['success' => true, 'data' => $dados]);
    }

    // POST /api/transacoes
    public function salvarTransacao() // <--- PARENTESES VAZIOS (CORRETO)
    {
        // Pega os dados aqui dentro
        $input = json_decode(file_get_contents('php://input'), true);

        if (empty($input['descricao']) || empty($input['valor']) || empty($input['data'])) {
            $this->jsonResponse(['success' => false, 'message' => 'Campos obrigatórios faltando.'], 400);
        }

        if (!isset($input['tipo']) || !in_array($input['tipo'], ['receita', 'despesa'])) {
            $this->jsonResponse(['success' => false, 'message' => 'Tipo inválido.'], 400);
        }

        $resultado = $this->model->criarTransacao($input);
        $this->jsonResponse($resultado);
    }

    // PUT /api/transacoes/{id}
    public function editarTransacao($id) // <--- Recebe apenas o ID da URL
    {
        $input = json_decode(file_get_contents('php://input'), true);
        $resultado = $this->model->atualizarTransacao($id, $input);
        $this->jsonResponse($resultado);
    }

    // DELETE /api/transacoes/{id}
    public function excluirTransacao($id)
    {
        $resultado = $this->model->deletarTransacao($id);
        $this->jsonResponse($resultado);
    }

    // GET /api/categorias
    public function listarCategorias()
    {
        $tipo = $_GET['tipo'] ?? null;
        $dados = $this->model->getCategorias($tipo);
        $this->jsonResponse(['success' => true, 'data' => $dados]);
    }

    // POST /api/categorias
    public function criarCategoria() // <--- PARENTESES VAZIOS (CORRIGIDO AQUI)
    {
        // Pega os dados aqui dentro
        $input = json_decode(file_get_contents('php://input'), true);

        if (empty($input['nome']) || empty($input['tipo'])) {
            $this->jsonResponse(['success' => false, 'message' => 'Nome e Tipo são obrigatórios.'], 400);
        }

        $resultado = $this->model->criarCategoria($input['nome'], $input['tipo']);
        $this->jsonResponse($resultado);
    }

    public function editarCategoria($id)
    {
        $input = json_decode(file_get_contents('php://input'), true);

        if (empty($input['nome']) || empty($input['tipo'])) {
            $this->jsonResponse(['success' => false, 'message' => 'Dados incompletos.'], 400);
        }

        $resultado = $this->model->atualizarCategoria($id, $input['nome'], $input['tipo']);
        $this->jsonResponse($resultado);
    }

    // DELETE /api/categorias/{id}
    public function excluirCategoria($id)
    {
        $resultado = $this->model->deletarCategoria($id);
        $this->jsonResponse($resultado);
    }

    public function getDadosCartao()
    {
        $dados = $this->model->getFaturaAberta();
        $this->jsonResponse(['success' => true, 'data' => $dados]);
    }

    // POST /api/cartao/pagar
    public function pagarFatura()
    {
        $resultado = $this->model->pagarFatura();
        $this->jsonResponse($resultado);
    }

    // --- COFRINHOS ---

    // GET /api/cofrinhos
    public function listarCofrinhos()
    {
        $dados = $this->model->listarCofrinhos();
        $this->jsonResponse(['success' => true, 'data' => $dados]);
    }

    // POST /api/cofrinhos
    public function criarCofrinho()
    {
        $input = json_decode(file_get_contents('php://input'), true);
        if (empty($input['nome'])) {
            $this->jsonResponse(['success' => false, 'message' => 'Nome obrigatório'], 400);
        }
        $res = $this->model->criarCofrinho($input['nome'], $input['meta'] ?? 0, $input['cor'] ?? 'bg-blue-600');
        $this->jsonResponse($res);
    }

    // POST /api/cofrinhos/movimentar
    public function movimentarCofrinho()
    {
        $input = json_decode(file_get_contents('php://input'), true);

        if (empty($input['id']) || empty($input['valor']) || empty($input['tipo'])) {
            $this->jsonResponse(['success' => false, 'message' => 'Dados inválidos'], 400);
        }

        $res = $this->model->movimentarCofrinho($input['id'], $input['valor'], $input['tipo']);
        $this->jsonResponse($res);
    }

    // DELETE /api/cofrinhos/{id}
    public function excluirCofrinho($id)
    {
        $res = $this->model->excluirCofrinho($id);
        $this->jsonResponse($res);
    }

    public function editarMetaCofrinho($id)
    {
        $input = json_decode(file_get_contents('php://input'), true);

        if (!isset($input['meta']) || $input['meta'] < 0) {
            $this->jsonResponse(['success' => false, 'message' => 'Valor da meta inválido.'], 400);
        }

        $res = $this->model->atualizarMetaCofrinho($id, $input['meta']);
        $this->jsonResponse($res);
    }
}
