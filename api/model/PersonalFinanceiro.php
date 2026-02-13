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
    public function getResumoMes($mes, $ano, $idUsuario)
    {
        // 1. RECEITAS REALIZADAS (Pagas)
        $sqlReceitas = "SELECT COALESCE(SUM(valor), 0) as total 
                        FROM transacoes 
                        WHERE tipo = 'receita' AND status = 'pago' 
                        AND MONTH(data) = :mes AND YEAR(data) = :ano AND id_usuario = :id_user";

        // 2. RECEITAS PENDENTES
        $sqlReceitasPend = "SELECT COALESCE(SUM(valor), 0) as total 
                            FROM transacoes 
                            WHERE tipo = 'receita' AND status = 'pendente' 
                            AND MONTH(data) = :mes AND YEAR(data) = :ano AND id_usuario = :id_user";

        // 3. DESPESAS REALIZADAS (Pagas)
        $sqlDespesas = "SELECT COALESCE(SUM(valor), 0) as total 
                        FROM transacoes 
                        WHERE tipo = 'despesa' AND status = 'pago' 
                        AND MONTH(data) = :mes AND YEAR(data) = :ano AND id_usuario = :id_user";

        // 4. DESPESAS PENDENTES
        $sqlDespesasPend = "SELECT COALESCE(SUM(valor), 0) as total 
                            FROM transacoes 
                            WHERE tipo = 'despesa' AND status = 'pendente' 
                            AND MONTH(data) = :mes AND YEAR(data) = :ano AND id_usuario = :id_user";

        // 5. FATURA CARTÃO (Baseado na categoria do usuário)
        $stmtCat = $this->conn->prepare("SELECT id FROM categorias WHERE nome LIKE :nome AND id_usuario = :id_user LIMIT 1");
        $stmtCat->execute([':nome' => '%Cartão%', ':id_user' => $idUsuario]);
        $catCartao = $stmtCat->fetch(PDO::FETCH_ASSOC);
        $idCartao = $catCartao ? $catCartao['id'] : 0;

        $sqlFatura = "SELECT COALESCE(SUM(valor), 0) as total 
                      FROM transacoes 
                      WHERE id_categoria = :idCartao AND status = 'pendente' AND id_usuario = :id_user";

        try {
            $stmtR = $this->conn->prepare($sqlReceitas);
            $stmtR->execute([':mes' => $mes, ':ano' => $ano, ':id_user' => $idUsuario]);
            $valReceitaRealizada = (float) $stmtR->fetch(PDO::FETCH_ASSOC)['total'];

            $stmtRP = $this->conn->prepare($sqlReceitasPend);
            $stmtRP->execute([':mes' => $mes, ':ano' => $ano, ':id_user' => $idUsuario]);
            $valReceitaPendente = (float) $stmtRP->fetch(PDO::FETCH_ASSOC)['total'];

            $stmtD = $this->conn->prepare($sqlDespesas);
            $stmtD->execute([':mes' => $mes, ':ano' => $ano, ':id_user' => $idUsuario]);
            $valDespesaRealizada = (float) $stmtD->fetch(PDO::FETCH_ASSOC)['total'];

            $stmtDP = $this->conn->prepare($sqlDespesasPend);
            $stmtDP->execute([':mes' => $mes, ':ano' => $ano, ':id_user' => $idUsuario]);
            $valDespesaPendente = (float) $stmtDP->fetch(PDO::FETCH_ASSOC)['total'];

            $stmtF = $this->conn->prepare($sqlFatura);
            $stmtF->execute([':idCartao' => $idCartao, ':id_user' => $idUsuario]);
            $valFaturaTotal = (float) $stmtF->fetch(PDO::FETCH_ASSOC)['total'];

            $saldoAtualCalc = $valReceitaRealizada - $valDespesaRealizada;
            $saldoPrevistoCalc = ($saldoAtualCalc + $valReceitaPendente) - ($valDespesaPendente + $valFaturaTotal);

            return [
                'receitas' => ['receita_realizada' => $valReceitaRealizada, 'receita_pendente' => $valReceitaPendente],
                'despesas' => ['despesa_realizada' => $valDespesaRealizada, 'despesa_pendente' => $valDespesaPendente],
                'saldo_atual' => $saldoAtualCalc,
                'saldo_previsto' => $saldoPrevistoCalc,
                'fatura_prevista' => $valFaturaTotal
            ];
        } catch (PDOException $e) {
            return null;
        }
    }

    // --- TRANSAÇÕES ---
    public function getTransacoes($mes, $ano, $idUsuario, $tipo = null)
    {
        $query = "SELECT t.*, c.nome as categoria_nome 
                  FROM transacoes t
                  LEFT JOIN categorias c ON t.id_categoria = c.id
                  WHERE MONTH(t.data) = :mes AND YEAR(t.data) = :ano AND t.id_usuario = :id_user";

        $params = [':mes' => $mes, ':ano' => $ano, ':id_user' => $idUsuario];

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

    public function getDadosAnuais($ano, $idUsuario)
    {
        $query = "SELECT 
                    MONTH(data) as mes,
                    SUM(CASE WHEN tipo = 'receita' AND status = 'pago' THEN valor ELSE 0 END) as receitas,
                    SUM(CASE WHEN tipo = 'despesa' AND status = 'pago' THEN valor ELSE 0 END) as despesas
                  FROM transacoes
                  WHERE YEAR(data) = :ano AND id_usuario = :id_user
                  GROUP BY MONTH(data)
                  ORDER BY MONTH(data)";
        try {
            $stmt = $this->conn->prepare($query);
            $stmt->execute([':ano' => $ano, ':id_user' => $idUsuario]);
            return $stmt->fetchAll(PDO::FETCH_ASSOC);
        } catch (PDOException $e) {
            return [];
        }
    }

    public function criarTransacao($dados, $idUsuario)
    {
        $query = "INSERT INTO transacoes (descricao, valor, data, tipo, status, id_categoria, observacao, id_usuario) 
                  VALUES (:descricao, :valor, :data, :tipo, :status, :id_categoria, :observacao, :id_user)";
        try {
            $stmt = $this->conn->prepare($query);
            $stmt->execute([
                ':descricao' => $dados['descricao'],
                ':valor' => $dados['valor'],
                ':data' => $dados['data'],
                ':tipo' => $dados['tipo'],
                ':status' => $dados['status'] ?? 'pago',
                ':id_categoria' => !empty($dados['id_categoria']) ? $dados['id_categoria'] : null,
                ':observacao' => $dados['observacao'] ?? null,
                ':id_user' => $idUsuario
            ]);
            return ['success' => true];
        } catch (PDOException $e) {
            return ['success' => false, 'message' => $e->getMessage()];
        }
    }

    public function atualizarTransacao($id, $dados, $idUsuario)
    {
        $query = "UPDATE transacoes SET 
                    descricao = :descricao, valor = :valor, data = :data, 
                    tipo = :tipo, status = :status, id_categoria = :id_categoria, observacao = :observacao
                  WHERE id = :id AND id_usuario = :id_user";
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
                ':id' => $id,
                ':id_user' => $idUsuario
            ]);
            return ['success' => true];
        } catch (PDOException $e) {
            return ['success' => false, 'message' => $e->getMessage()];
        }
    }

    public function deletarTransacao($id, $idUsuario)
    {
        $query = "DELETE FROM transacoes WHERE id = :id AND id_usuario = :id_user";
        try {
            $stmt = $this->conn->prepare($query);
            $stmt->execute([':id' => $id, ':id_user' => $idUsuario]);
            return ['success' => true];
        } catch (PDOException $e) {
            return ['success' => false, 'message' => $e->getMessage()];
        }
    }

    // --- CATEGORIAS ---
    public function getCategorias($idUsuario, $tipo = null)
    {
        $query = "SELECT * FROM categorias WHERE id_usuario = :id_user";
        $params = [':id_user' => $idUsuario];
        if ($tipo) {
            $query .= " AND tipo = :tipo";
            $params[':tipo'] = $tipo;
        }
        $query .= " ORDER BY nome ASC";
        $stmt = $this->conn->prepare($query);
        $stmt->execute($params);
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }

    public function criarCategoria($nome, $tipo, $idUsuario)
    {
        $query = "INSERT INTO categorias (nome, tipo, id_usuario) VALUES (:nome, :tipo, :id_user)";
        try {
            $stmt = $this->conn->prepare($query);
            $stmt->execute([':nome' => $nome, ':tipo' => $tipo, ':id_user' => $idUsuario]);
            return ['success' => true, 'id' => $this->conn->lastInsertId()];
        } catch (PDOException $e) {
            return ['success' => false, 'message' => $e->getMessage()];
        }
    }

    public function deletarCategoria($id, $idUsuario)
    {
        try {
            $this->conn->prepare("UPDATE transacoes SET id_categoria = NULL WHERE id_categoria = :id AND id_usuario = :id_user")->execute([':id' => $id, ':id_user' => $idUsuario]);
            $stmt = $this->conn->prepare("DELETE FROM categorias WHERE id = :id AND id_usuario = :id_user");
            $stmt->execute([':id' => $id, ':id_user' => $idUsuario]);
            return ['success' => true];
        } catch (PDOException $e) {
            return ['success' => false, 'message' => $e->getMessage()];
        }
    }

    // --- FATURA CARTÃO ---
    public function getFaturaAberta($idUsuario)
    {
        $stmtCat = $this->conn->prepare("SELECT id FROM categorias WHERE nome LIKE :nome AND id_usuario = :id_user LIMIT 1");
        $stmtCat->execute([':nome' => '%Cartão%', ':id_user' => $idUsuario]);
        $idCartao = $stmtCat->fetch(PDO::FETCH_ASSOC)['id'] ?? 0;

        try {
            $stmtT = $this->conn->prepare("SELECT COALESCE(SUM(valor), 0) as total FROM transacoes WHERE id_categoria = :id_cat AND status = 'pendente' AND id_usuario = :id_user");
            $stmtT->execute([':id_cat' => $idCartao, ':id_user' => $idUsuario]);
            $total = $stmtT->fetch(PDO::FETCH_ASSOC)['total'];

            $stmtI = $this->conn->prepare("SELECT * FROM transacoes WHERE id_categoria = :id_cat AND status = 'pendente' AND id_usuario = :id_user ORDER BY data ASC");
            $stmtI->execute([':id_cat' => $idCartao, ':id_user' => $idUsuario]);
            return ['total' => $total, 'itens' => $stmtI->fetchAll(PDO::FETCH_ASSOC)];
        } catch (PDOException $e) {
            return ['total' => 0, 'itens' => []];
        }
    }

    public function pagarFatura($idUsuario)
    {
        $stmtCat = $this->conn->prepare("SELECT id FROM categorias WHERE nome LIKE :nome AND id_usuario = :id_user LIMIT 1");
        $stmtCat->execute([':nome' => '%Cartão%', ':id_user' => $idUsuario]);
        $idCartao = $stmtCat->fetch(PDO::FETCH_ASSOC)['id'] ?? 0;

        $query = "UPDATE transacoes SET status = 'pago' WHERE id_categoria = :id_cat AND status = 'pendente' AND id_usuario = :id_user";
        try {
            $stmt = $this->conn->prepare($query);
            $stmt->execute([':id_cat' => $idCartao, ':id_user' => $idUsuario]);
            return ['success' => true];
        } catch (PDOException $e) {
            return ['success' => false, 'message' => $e->getMessage()];
        }
    }

    // --- COFRINHOS ---
    public function listarCofrinhos($idUsuario)
    {
        $stmt = $this->conn->prepare("SELECT * FROM cofrinhos WHERE id_usuario = :id_user ORDER BY id DESC");
        $stmt->execute([':id_user' => $idUsuario]);
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }

    public function criarCofrinho($nome, $meta, $cor, $idUsuario)
    {
        $query = "INSERT INTO cofrinhos (nome, meta, saldo_atual, cor_fundo, id_usuario) VALUES (:nome, :meta, 0, :cor, :id_user)";
        try {
            $stmt = $this->conn->prepare($query);
            $stmt->execute([':nome' => $nome, ':meta' => $meta, ':cor' => $cor, ':id_user' => $idUsuario]);
            return ['success' => true];
        } catch (PDOException $e) {
            return ['success' => false, 'message' => $e->getMessage()];
        }
    }

    public function movimentarCofrinho($idCofrinho, $valor, $tipo, $idUsuario)
    {
        try {
            $this->conn->beginTransaction();
            $nomeCofre = $this->getNomeCofrinho($idCofrinho, $idUsuario);

            if ($tipo === 'deposito') {
                $this->conn->prepare("UPDATE cofrinhos SET saldo_atual = saldo_atual + :valor WHERE id = :id AND id_usuario = :id_user")->execute([':valor' => $valor, ':id' => $idCofrinho, ':id_user' => $idUsuario]);
                $sqlT = "INSERT INTO transacoes (descricao, valor, data, tipo, status, id_usuario, observacao) VALUES (:desc, :valor, CURDATE(), 'despesa', 'pago', :id_user, 'Aplicação automática')";
            } else {
                $this->conn->prepare("UPDATE cofrinhos SET saldo_atual = saldo_atual - :valor WHERE id = :id AND id_usuario = :id_user")->execute([':valor' => $valor, ':id' => $idCofrinho, ':id_user' => $idUsuario]);
                $sqlT = "INSERT INTO transacoes (descricao, valor, data, tipo, status, id_usuario, observacao) VALUES (:desc, :valor, CURDATE(), 'receita', 'pago', :id_user, 'Resgate automático')";
            }

            $stmt2 = $this->conn->prepare($sqlT);
            $stmt2->execute([':desc' => ($tipo === 'deposito' ? "Depósito: $nomeCofre" : "Resgate: $nomeCofre"), ':valor' => $valor, ':id_user' => $idUsuario]);

            $this->conn->commit();
            return ['success' => true];
        } catch (Exception $e) {
            $this->conn->rollBack();
            return ['success' => false, 'message' => $e->getMessage()];
        }
    }

    private function getNomeCofrinho($id, $idUsuario)
    {
        $stmt = $this->conn->prepare("SELECT nome FROM cofrinhos WHERE id = :id AND id_usuario = :id_user");
        $stmt->execute([':id' => $id, ':id_user' => $idUsuario]);
        return $stmt->fetchColumn() ?: 'Cofrinho';
    }

    public function excluirCofrinho($id, $idUsuario)
    {
        $stmt = $this->conn->prepare("DELETE FROM cofrinhos WHERE id = :id AND id_usuario = :id_user");
        return ['success' => $stmt->execute([':id' => $id, ':id_user' => $idUsuario])];
    }

    public function atualizarMetaCofrinho($id, $novaMeta, $idUsuario)
    {
        $stmt = $this->conn->prepare("UPDATE cofrinhos SET meta = :meta WHERE id = :id AND id_usuario = :id_user");
        return ['success' => $stmt->execute([':meta' => $novaMeta, ':id' => $id, ':id_user' => $idUsuario])];
    }
}