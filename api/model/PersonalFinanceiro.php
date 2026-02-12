<?php
// models/PersonalFinanceiro.php
require_once __DIR__ . '/../config/Database.php';

class PersonalFinanceiro
{
    private $conn;

    public function __construct()
    {
        $database = new Database();
        $this->conn = $database->getConnection();
    }

    // --- DASHBOARD (Cards do Topo) ---
    // --- DASHBOARD (Cards do Topo) ---
    // api/model/PersonalFinanceiro.php

    public function getResumoMes($mes, $ano)
    {
        // 1. RECEITAS REALIZADAS (Pagas)
        $sqlReceitas = "SELECT COALESCE(SUM(valor), 0) as total 
                        FROM transacoes 
                        WHERE tipo = 'receita' AND status = 'pago' 
                        AND MONTH(data) = :mes AND YEAR(data) = :ano";

        // 2. RECEITAS PENDENTES
        $sqlReceitasPend = "SELECT COALESCE(SUM(valor), 0) as total 
                            FROM transacoes 
                            WHERE tipo = 'receita' AND status = 'pendente' 
                            AND MONTH(data) = :mes AND YEAR(data) = :ano";

        // 3. DESPESAS REALIZADAS (Pagas)
        $sqlDespesas = "SELECT COALESCE(SUM(valor), 0) as total 
                        FROM transacoes 
                        WHERE tipo = 'despesa' AND status = 'pago' 
                        AND MONTH(data) = :mes AND YEAR(data) = :ano";

        // 4. DESPESAS PENDENTES (Normais)
        // Nota: O filtro de ID cartão é opcional aqui pois vamos somar a fatura separada abaixo
        $sqlDespesasPend = "SELECT COALESCE(SUM(valor), 0) as total 
                            FROM transacoes 
                            WHERE tipo = 'despesa' AND status = 'pendente' 
                            AND MONTH(data) = :mes AND YEAR(data) = :ano";

        // 5. FATURA CARTÃO (Total Acumulado Pendente)
        $stmtCat = $this->conn->prepare("SELECT id FROM categorias WHERE nome LIKE :nome LIMIT 1");
        $stmtCat->execute([':nome' => '%Cartão%']);
        $catCartao = $stmtCat->fetch(PDO::FETCH_ASSOC);
        $idCartao = $catCartao ? $catCartao['id'] : 999;

        $sqlFatura = "SELECT COALESCE(SUM(valor), 0) as total 
                      FROM transacoes 
                      WHERE id_categoria = :idCartao AND status = 'pendente'";

        try {
            // Execuções
            $stmtR = $this->conn->prepare($sqlReceitas);
            $stmtR->execute([':mes' => $mes, ':ano' => $ano]);
            $valReceitaRealizada = (float) $stmtR->fetch(PDO::FETCH_ASSOC)['total'];

            $stmtRP = $this->conn->prepare($sqlReceitasPend);
            $stmtRP->execute([':mes' => $mes, ':ano' => $ano]);
            $valReceitaPendente = (float) $stmtRP->fetch(PDO::FETCH_ASSOC)['total'];

            $stmtD = $this->conn->prepare($sqlDespesas);
            $stmtD->execute([':mes' => $mes, ':ano' => $ano]);
            $valDespesaRealizada = (float) $stmtD->fetch(PDO::FETCH_ASSOC)['total'];

            $stmtDP = $this->conn->prepare($sqlDespesasPend);
            $stmtDP->execute([':mes' => $mes, ':ano' => $ano]);
            $valDespesaPendente = (float) $stmtDP->fetch(PDO::FETCH_ASSOC)['total'];

            $stmtF = $this->conn->prepare($sqlFatura);
            $stmtF->execute([':idCartao' => $idCartao]);
            $valFaturaTotal = (float) $stmtF->fetch(PDO::FETCH_ASSOC)['total'];

            // --- CÁLCULOS FINAIS ---

            // Saldo Atual = O que entrou (Pago) - O que saiu (Pago)
            $saldoAtualCalc = $valReceitaRealizada - $valDespesaRealizada;

            // Saldo Previsto = Saldo Atual + A Receber - (A Pagar Mês + Fatura Total)
            // Obs: Se a fatura já estiver no "A Pagar Mês", isso duplica, mas melhor sobrar previsão de gasto que faltar.
            $saldoPrevistoCalc = ($saldoAtualCalc + $valReceitaPendente) - ($valDespesaPendente + $valFaturaTotal);

            return [
                'receitas' => [
                    'receita_realizada' => $valReceitaRealizada,
                    'receita_pendente' => $valReceitaPendente
                ],
                'despesas' => [
                    'despesa_realizada' => $valDespesaRealizada,
                    'despesa_pendente' => $valDespesaPendente
                ],
                // Aqui usamos nomes explícitos para evitar confusão de variáveis
                'saldo_atual' => $saldoAtualCalc,
                'saldo_previsto' => $saldoPrevistoCalc,
                'fatura_prevista' => $valFaturaTotal
            ];

        } catch (PDOException $e) {
            return null;
        }
    }
    // --- TRANSAÇÕES (Listagem Recente) ---
    public function getTransacoes($mes, $ano, $tipo = null)
    {
        $query = "SELECT t.*, c.nome as categoria_nome 
                  FROM transacoes t
                  LEFT JOIN categorias c ON t.id_categoria = c.id
                  WHERE MONTH(t.data) = :mes AND YEAR(t.data) = :ano";

        $params = [':mes' => $mes, ':ano' => $ano];

        if ($tipo) {
            $query .= " AND t.tipo = :tipo";
            $params[':tipo'] = $tipo;
        }

        $query .= " ORDER BY t.data DESC, t.id DESC";

        try {
            $stmt = $this->conn->prepare($query);
            $stmt->execute($params);
            return $stmt->fetchAll(PDO::FETCH_ASSOC);
        } catch (PDOException $e) {
            return [];
        }
    }

    // --- GRÁFICO ANUAL ---
    public function getDadosAnuais($ano)
    {
        $query = "SELECT 
                    MONTH(data) as mes,
                    SUM(CASE WHEN tipo = 'receita' AND status = 'pago' THEN valor ELSE 0 END) as receitas,
                    SUM(CASE WHEN tipo = 'despesa' AND status = 'pago' THEN valor ELSE 0 END) as despesas
                  FROM transacoes
                  WHERE YEAR(data) = :ano
                  GROUP BY MONTH(data)
                  ORDER BY MONTH(data)";

        try {
            $stmt = $this->conn->prepare($query);
            $stmt->execute([':ano' => $ano]);
            return $stmt->fetchAll(PDO::FETCH_ASSOC);
        } catch (PDOException $e) {
            return [];
        }
    }

    // --- CRUD TRANSAÇÕES ---
    public function criarTransacao($dados)
    {
        $query = "INSERT INTO transacoes (descricao, valor, data, tipo, status, id_categoria, observacao) 
                  VALUES (:descricao, :valor, :data, :tipo, :status, :id_categoria, :observacao)";

        try {
            $stmt = $this->conn->prepare($query);
            $stmt->execute([
                ':descricao' => $dados['descricao'],
                ':valor' => $dados['valor'],
                ':data' => $dados['data'],
                ':tipo' => $dados['tipo'],
                ':status' => $dados['status'] ?? 'pago',
                ':id_categoria' => !empty($dados['id_categoria']) ? $dados['id_categoria'] : null,
                ':observacao' => $dados['observacao'] ?? null
            ]);
            return ['success' => true, 'message' => 'Transação criada com sucesso!'];
        } catch (PDOException $e) {
            return ['success' => false, 'message' => 'Erro ao criar: ' . $e->getMessage()];
        }
    }

    public function atualizarTransacao($id, $dados)
    {
        $query = "UPDATE transacoes SET 
                    descricao = :descricao, valor = :valor, data = :data, 
                    tipo = :tipo, status = :status, id_categoria = :id_categoria, observacao = :observacao
                  WHERE id = :id";
        try {
            $stmt = $this->conn->prepare($query);
            $stmt->execute([
                ':descricao' => $dados['descricao'],
                ':valor' => $dados['valor'],
                ':data' => $dados['data'],
                ':tipo' => $dados['tipo'],
                ':status' => $dados['status'],
                ':id_categoria' => !empty($dados['id_categoria']) ? $dados['id_categoria'] : null,
                ':observacao' => $dados['observacao'] ?? null,
                ':id' => $id
            ]);
            return ['success' => true];
        } catch (PDOException $e) {
            return ['success' => false, 'message' => $e->getMessage()];
        }
    }

    public function deletarTransacao($id)
    {
        $query = "DELETE FROM transacoes WHERE id = :id";
        try {
            $stmt = $this->conn->prepare($query);
            $stmt->execute([':id' => $id]);
            return ['success' => true];
        } catch (PDOException $e) {
            return ['success' => false, 'message' => $e->getMessage()];
        }
    }

    // --- CATEGORIAS ---
    public function getCategorias($tipo = null)
    {
        $query = "SELECT * FROM categorias";
        $params = [];

        if ($tipo) {
            $query .= " WHERE tipo = :tipo";
            $params[':tipo'] = $tipo;
        }

        $query .= " ORDER BY nome ASC";
        $stmt = $this->conn->prepare($query);
        $stmt->execute($params);
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }

    public function criarCategoria($nome, $tipo)
    {
        $query = "INSERT INTO categorias (nome, tipo) VALUES (:nome, :tipo)";
        try {
            $stmt = $this->conn->prepare($query);
            $stmt->execute([':nome' => $nome, ':tipo' => $tipo]);
            return ['success' => true, 'id' => $this->conn->lastInsertId()];
        } catch (PDOException $e) {
            return ['success' => false, 'message' => $e->getMessage()];
        }
    }

    public function atualizarCategoria($id, $nome, $tipo)
    {
        $query = "UPDATE categorias SET nome = :nome, tipo = :tipo WHERE id = :id";
        try {
            $stmt = $this->conn->prepare($query);
            $stmt->execute([':nome' => $nome, ':tipo' => $tipo, ':id' => $id]);
            return ['success' => true];
        } catch (PDOException $e) {
            return ['success' => false, 'message' => $e->getMessage()];
        }
    }

    public function deletarCategoria($id)
    {
        // Primeiro: Desvincula das transações existentes para não dar erro
        // As transações ficarão "Sem Categoria"
        $queryDesvincular = "UPDATE transacoes SET id_categoria = NULL WHERE id_categoria = :id";

        $queryDeletar = "DELETE FROM categorias WHERE id = :id";

        try {
            // Executa desvinculo
            $stmt1 = $this->conn->prepare($queryDesvincular);
            $stmt1->execute([':id' => $id]);

            // Executa deleção
            $stmt2 = $this->conn->prepare($queryDeletar);
            $stmt2->execute([':id' => $id]);

            return ['success' => true];
        } catch (PDOException $e) {
            return ['success' => false, 'message' => $e->getMessage()];
        }
    }

    public function getFaturaAberta()
    {
        // Ajuste o ID 999 para o ID real da sua categoria Cartão
        $idCartao = 999;

        // 1. Total da Fatura
        $sqlTotal = "SELECT COALESCE(SUM(valor), 0) as total 
                     FROM transacoes 
                     WHERE id_categoria = :id_cat AND status = 'pendente'";

        // 2. Itens da Fatura
        $sqlItens = "SELECT * FROM transacoes 
                     WHERE id_categoria = :id_cat AND status = 'pendente'
                     ORDER BY data ASC";

        try {
            $stmtT = $this->conn->prepare($sqlTotal);
            $stmtT->execute([':id_cat' => $idCartao]);
            $total = $stmtT->fetch(PDO::FETCH_ASSOC)['total'];

            $stmtI = $this->conn->prepare($sqlItens);
            $stmtI->execute([':id_cat' => $idCartao]);
            $itens = $stmtI->fetchAll(PDO::FETCH_ASSOC);

            return ['total' => $total, 'itens' => $itens];
        } catch (PDOException $e) {
            return ['total' => 0, 'itens' => []];
        }
    }

    // Paga a fatura: Transforma tudo que é pendente do cartão em PAGO
    public function pagarFatura()
    {
        $idCartao = 999; // Mesmo ID de cima

        // Atualiza status para 'pago' e define a data de pagamento para HOJE
        // Assim você sabe quando o dinheiro saiu da conta de verdade
        $query = "UPDATE transacoes 
                  SET status = 'pago' 
                  WHERE id_categoria = :id_cat AND status = 'pendente'";

        try {
            $stmt = $this->conn->prepare($query);
            $stmt->execute([':id_cat' => $idCartao]);
            return ['success' => true, 'afetados' => $stmt->rowCount()];
        } catch (PDOException $e) {
            return ['success' => false, 'message' => $e->getMessage()];
        }
    }

    // --- COFRINHOS (INVESTIMENTOS) ---

    public function listarCofrinhos()
    {
        $stmt = $this->conn->query("SELECT * FROM cofrinhos ORDER BY id DESC");
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }

    public function criarCofrinho($nome, $meta, $cor)
    {
        $query = "INSERT INTO cofrinhos (nome, meta, saldo_atual, cor_fundo) VALUES (:nome, :meta, 0, :cor)";
        try {
            $stmt = $this->conn->prepare($query);
            $stmt->execute([':nome' => $nome, ':meta' => $meta, ':cor' => $cor]);
            return ['success' => true];
        } catch (PDOException $e) {
            return ['success' => false, 'message' => $e->getMessage()];
        }
    }

    public function movimentarCofrinho($idCofrinho, $valor, $tipo)
    {
        // $tipo: 'deposito' ou 'resgate'

        try {
            $this->conn->beginTransaction();

            // 1. Atualiza o saldo do Cofrinho
            if ($tipo === 'deposito') {
                $queryCofre = "UPDATE cofrinhos SET saldo_atual = saldo_atual + :valor WHERE id = :id";

                // 2. Gera a DESPESA no fluxo principal (saiu do caixa, foi pro cofre)
                $desc = "Aplicação: " . $this->getNomeCofrinho($idCofrinho);
                $queryTransacao = "INSERT INTO transacoes (descricao, valor, data, tipo, status, observacao) 
                                   VALUES (:desc, :valor, CURDATE(), 'despesa', 'pago', 'Movimentação automática para Cofrinho')";

            } else {
                // Resgate
                $queryCofre = "UPDATE cofrinhos SET saldo_atual = saldo_atual - :valor WHERE id = :id";

                // 2. Gera a RECEITA no fluxo principal (saiu do cofre, voltou pro caixa)
                $desc = "Resgate: " . $this->getNomeCofrinho($idCofrinho);
                $queryTransacao = "INSERT INTO transacoes (descricao, valor, data, tipo, status, observacao) 
                                   VALUES (:desc, :valor, CURDATE(), 'receita', 'pago', 'Resgate automático de Cofrinho')";
            }

            // Executa Cofrinho
            $stmt1 = $this->conn->prepare($queryCofre);
            $stmt1->execute([':valor' => $valor, ':id' => $idCofrinho]);

            // Executa Transação
            $stmt2 = $this->conn->prepare($queryTransacao);
            $stmt2->execute([':desc' => $desc, ':valor' => $valor]);

            $this->conn->commit();
            return ['success' => true];

        } catch (Exception $e) {
            $this->conn->rollBack();
            return ['success' => false, 'message' => $e->getMessage()];
        }
    }

    private function getNomeCofrinho($id)
    {
        $stmt = $this->conn->prepare("SELECT nome FROM cofrinhos WHERE id = :id");
        $stmt->execute([':id' => $id]);
        return $stmt->fetchColumn() ?: 'Cofrinho';
    }

    public function excluirCofrinho($id)
    {
        // Deleta o cofrinho (não apaga as transações históricas do fluxo)
        $stmt = $this->conn->prepare("DELETE FROM cofrinhos WHERE id = :id");
        return ['success' => $stmt->execute([':id' => $id])];
    }

    public function atualizarMetaCofrinho($id, $novaMeta)
    {
        $query = "UPDATE cofrinhos SET meta = :meta WHERE id = :id";
        try {
            $stmt = $this->conn->prepare($query);
            $stmt->execute([':meta' => $novaMeta, ':id' => $id]);
            return ['success' => true];
        } catch (PDOException $e) {
            return ['success' => false, 'message' => $e->getMessage()];
        }
    }
}


