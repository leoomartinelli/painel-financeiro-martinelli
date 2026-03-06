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

    // ==========================================================
    // --- DASHBOARD (Cards do Topo) ---
    // ==========================================================

    public function getResumoMes($mes, $ano, $idUsuario)
    {
        $idCartao = $this->getIdCategoriaCartao($idUsuario);

        $sqlReceitas = "SELECT COALESCE(SUM(valor), 0) as total FROM transacoes 
                        WHERE tipo = 'receita' AND status = 'pago' 
                        AND MONTH(data) = :mes AND YEAR(data) = :ano AND id_usuario = :id_user";

        $sqlReceitasPend = "SELECT COALESCE(SUM(valor), 0) as total FROM transacoes 
                            WHERE tipo = 'receita' AND status = 'pendente' 
                            AND MONTH(data) = :mes AND YEAR(data) = :ano AND id_usuario = :id_user";

        $sqlDespesas = "SELECT COALESCE(SUM(valor), 0) as total FROM transacoes 
                        WHERE tipo = 'despesa' AND status = 'pago' 
                        AND MONTH(data) = :mes AND YEAR(data) = :ano AND id_usuario = :id_user";

        $sqlDespesasPend = "SELECT COALESCE(SUM(valor), 0) as total FROM transacoes 
                            WHERE tipo = 'despesa' AND status = 'pendente' 
                            AND (id_categoria != :idCartao OR id_categoria IS NULL)
                            AND MONTH(data) = :mes AND YEAR(data) = :ano AND id_usuario = :id_user";

        $sqlFatura = "SELECT COALESCE(SUM(valor), 0) as total FROM transacoes 
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
            $stmtDP->execute([':mes' => $mes, ':ano' => $ano, ':id_user' => $idUsuario, ':idCartao' => $idCartao]);
            $valDespesaPendente = (float) $stmtDP->fetch(PDO::FETCH_ASSOC)['total'];

            $stmtF = $this->conn->prepare($sqlFatura);
            $stmtF->execute([':idCartao' => $idCartao, ':id_user' => $idUsuario]);
            $valFaturaTotal = (float) $stmtF->fetch(PDO::FETCH_ASSOC)['total'];

            $saldoAtualCalc = $valReceitaRealizada - $valDespesaRealizada;
            $saldoPrevistoCalc = ($saldoAtualCalc + $valReceitaPendente) - ($valDespesaPendente + $valFaturaTotal);

            $linkWpp = $this->getLinkWpp($idUsuario);

            return [
                'receitas' => ['receita_realizada' => $valReceitaRealizada, 'receita_pendente' => $valReceitaPendente],
                'despesas' => ['despesa_realizada' => $valDespesaRealizada, 'despesa_pendente' => $valDespesaPendente],
                'saldo_atual' => $saldoAtualCalc,
                'saldo_previsto' => $saldoPrevistoCalc,
                'fatura_prevista' => $valFaturaTotal,
                'link_wpp' => $linkWpp
            ];
        } catch (PDOException $e) {
            return null;
        }
    }


    // ==========================================================
    // --- TRANSAÇÕES ---
    // ==========================================================

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


    // ==========================================================
    // --- CATEGORIAS ---
    // ==========================================================

    public function getCategorias($idUsuario, $tipo = null)
    {
        $query = "SELECT * FROM categorias WHERE (id_usuario = :id_user OR id_usuario IS NULL OR id_usuario = 0)";
        $params = [':id_user' => $idUsuario];

        if ($tipo) {
            $query .= " AND tipo = :tipo";
            $params[':tipo'] = $tipo;
        }

        $query .= " ORDER BY id_usuario DESC, nome ASC";
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

    public function atualizarCategoria($id, $nome, $tipo, $idUsuario)
    {
        $query = "UPDATE categorias SET nome=:nome, tipo=:tipo WHERE id=:id AND id_usuario=:id_user";
        try {
            $stmt = $this->conn->prepare($query);
            $stmt->execute([':nome' => $nome, ':tipo' => $tipo, ':id' => $id, ':id_user' => $idUsuario]);
            return ['success' => true];
        } catch (Exception $e) {
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

    private function getIdCategoriaCartao($idUsuario)
    {
        $sql = "SELECT id FROM categorias 
                WHERE nome LIKE :nome 
                AND (id_usuario = :id_user OR id_usuario IS NULL OR id_usuario = 0) 
                ORDER BY id_usuario DESC 
                LIMIT 1";
        $stmt = $this->conn->prepare($sql);
        $stmt->execute([':nome' => '%Cartão%', ':id_user' => $idUsuario]);
        $res = $stmt->fetch(PDO::FETCH_ASSOC);
        return $res ? $res['id'] : 0;
    }


    // ==========================================================
    // --- FATURA CARTÃO ---
    // ==========================================================

    public function getFaturaAberta($idUsuario)
    {
        $idCartao = $this->getIdCategoriaCartao($idUsuario);
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
        $idCartao = $this->getIdCategoriaCartao($idUsuario);
        $query = "UPDATE transacoes SET status = 'pago' WHERE id_categoria = :id_cat AND status = 'pendente' AND id_usuario = :id_user";
        try {
            $stmt = $this->conn->prepare($query);
            $stmt->execute([':id_cat' => $idCartao, ':id_user' => $idUsuario]);
            return ['success' => true];
        } catch (PDOException $e) {
            return ['success' => false, 'message' => $e->getMessage()];
        }
    }


    // ==========================================================
    // --- COFRINHOS ---
    // ==========================================================

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
            $stmtCofre = $this->conn->prepare("SELECT saldo_atual, nome FROM cofrinhos WHERE id = :id AND id_usuario = :id_user");
            $stmtCofre->execute([':id' => $idCofrinho, ':id_user' => $idUsuario]);
            $cofre = $stmtCofre->fetch(PDO::FETCH_ASSOC);

            if (!$cofre)
                return ['success' => false, 'message' => 'Cofrinho não encontrado.'];

            $saldoCofre = (float) $cofre['saldo_atual'];
            $nomeCofre = $cofre['nome'];

            if ($tipo === 'deposito') {
                $saldoCarteira = $this->getSaldoGeralUsuario($idUsuario);
                if ($valor > $saldoCarteira) {
                    return ['success' => false, 'message' => "Saldo insuficiente na carteira (Disp: R$ " . number_format($saldoCarteira, 2, ',', '.') . ")"];
                }
                $sqlCofre = "UPDATE cofrinhos SET saldo_atual = saldo_atual + :valor WHERE id = :id AND id_usuario = :id_user";
                $sqlTransacao = "INSERT INTO transacoes (descricao, valor, data, tipo, status, id_usuario, observacao) VALUES (:desc, :valor, CURDATE(), 'despesa', 'pago', :id_user, 'Aplicação automática')";
                $descTransacao = "Guardado em: $nomeCofre";
            } else {
                if ($valor > $saldoCofre) {
                    return ['success' => false, 'message' => "O cofrinho só tem R$ " . number_format($saldoCofre, 2, ',', '.')];
                }
                $sqlCofre = "UPDATE cofrinhos SET saldo_atual = saldo_atual - :valor WHERE id = :id AND id_usuario = :id_user";
                $sqlTransacao = "INSERT INTO transacoes (descricao, valor, data, tipo, status, id_usuario, observacao) VALUES (:desc, :valor, CURDATE(), 'receita', 'pago', :id_user, 'Resgate automático')";
                $descTransacao = "Resgate de: $nomeCofre";
            }

            $this->conn->beginTransaction();
            $this->conn->prepare($sqlCofre)->execute([':valor' => $valor, ':id' => $idCofrinho, ':id_user' => $idUsuario]);
            $this->conn->prepare($sqlTransacao)->execute([':desc' => $descTransacao, ':valor' => $valor, ':id_user' => $idUsuario]);
            $this->conn->commit();
            return ['success' => true];
        } catch (Exception $e) {
            if ($this->conn->inTransaction())
                $this->conn->rollBack();
            return ['success' => false, 'message' => $e->getMessage()];
        }
    }

    public function excluirCofrinho($id, $idUsuario)
    {
        try {
            $this->conn->beginTransaction();
            $stmt = $this->conn->prepare("SELECT saldo_atual, nome FROM cofrinhos WHERE id = :id AND id_usuario = :id_user");
            $stmt->execute([':id' => $id, ':id_user' => $idUsuario]);
            $cofre = $stmt->fetch(PDO::FETCH_ASSOC);

            if ($cofre && (float) $cofre['saldo_atual'] > 0) {
                $valorEstorno = (float) $cofre['saldo_atual'];
                $sqlEstorno = "INSERT INTO transacoes (descricao, valor, data, tipo, status, id_usuario, observacao) 
                               VALUES (:desc, :valor, CURDATE(), 'receita', 'pago', :id_user, 'Estorno por exclusão de cofrinho')";
                $this->conn->prepare($sqlEstorno)->execute([':desc' => "Estorno: " . $cofre['nome'], ':valor' => $valorEstorno, ':id_user' => $idUsuario]);
            }

            $stmtDelete = $this->conn->prepare("DELETE FROM cofrinhos WHERE id = :id AND id_usuario = :id_user");
            $stmtDelete->execute([':id' => $id, ':id_user' => $idUsuario]);

            $this->conn->commit();
            return ['success' => true];
        } catch (Exception $e) {
            if ($this->conn->inTransaction())
                $this->conn->rollBack();
            return ['success' => false, 'message' => "Erro ao excluir: " . $e->getMessage()];
        }
    }

    public function atualizarCofrinho($id, $novoNome, $novaMeta, $idUsuario)
    {
        $stmt = $this->conn->prepare("UPDATE cofrinhos SET nome = :nome, meta = :meta WHERE id = :id AND id_usuario = :id_user");
        return [
            'success' => $stmt->execute([':nome' => $novoNome, ':meta' => $novaMeta, ':id' => $id, ':id_user' => $idUsuario])
        ];
    }

    public function atualizarMetaCofrinho($id, $novaMeta, $idUsuario)
    {
        $stmt = $this->conn->prepare("UPDATE cofrinhos SET meta = :meta WHERE id = :id AND id_usuario = :id_user");
        return [
            'success' => $stmt->execute([':meta' => $novaMeta, ':id' => $id, ':id_user' => $idUsuario])
        ];
    }

    private function getSaldoGeralUsuario($idUsuario)
    {
        $sql = "SELECT 
                (SELECT COALESCE(SUM(valor), 0) FROM transacoes WHERE id_usuario = :id_u1 AND tipo = 'receita' AND status = 'pago') -
                (SELECT COALESCE(SUM(valor), 0) FROM transacoes WHERE id_usuario = :id_u2 AND tipo = 'despesa' AND status = 'pago') 
                as saldo_total";
        $stmt = $this->conn->prepare($sql);
        $stmt->execute([':id_u1' => $idUsuario, ':id_u2' => $idUsuario]);
        return (float) $stmt->fetch(PDO::FETCH_ASSOC)['saldo_total'];
    }


    // ==========================================================
    // --- ORÇAMENTO MENSAL ---
    // ==========================================================

    private function criarTabelaOrcamento()
    {
        // Tenta criar a tabela com id_usuario já incluso
        $sqlCreate = "CREATE TABLE IF NOT EXISTS orcamento_mensal (
            id INT AUTO_INCREMENT PRIMARY KEY, 
            mes INT NOT NULL, 
            ano INT NOT NULL, 
            id_categoria INT NOT NULL, 
            id_usuario INT NOT NULL,
            valor_planejado DECIMAL(10,2) NOT NULL, 
            UNIQUE KEY uniq_orcamento (mes, ano, id_categoria, id_usuario), 
            FOREIGN KEY (id_categoria) REFERENCES categorias(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;";

        $this->conn->exec($sqlCreate);

        // ROTINA DE MIGRAÇÃO: 
        // Caso a tabela tenha sido criada antes sem a coluna id_usuario, esse script adiciona automaticamente.
        try {
            $this->conn->query("SELECT id_usuario FROM orcamento_mensal LIMIT 1");
        } catch (Exception $e) {
            // Se falhou, é porque a coluna id_usuario não existe. Vamos forçar a alteração.
            try {
                $this->conn->exec("ALTER TABLE orcamento_mensal ADD COLUMN id_usuario INT NOT NULL DEFAULT 0 AFTER id_categoria");
                $this->conn->exec("ALTER TABLE orcamento_mensal DROP INDEX uniq_orcamento");
                $this->conn->exec("ALTER TABLE orcamento_mensal ADD UNIQUE KEY uniq_orcamento (mes, ano, id_categoria, id_usuario)");
            } catch (Exception $e2) {
                // Silencia caso o index uniq_orcamento já não existisse
            }
        }
    }

    public function getOrcamento($m, $a, $idUsuario)
    {
        try {
            $this->criarTabelaOrcamento();

            // Busca os gastos reais do usuario no mes/ano (Agora incluindo "Sem Categoria")
            $sqlRealizado = "
                SELECT c.id, c.nome, COALESCE(SUM(t.valor), 0) as total_realizado
                FROM categorias c
                LEFT JOIN transacoes t ON t.id_categoria = c.id
                     AND t.tipo = 'despesa'
                     AND (t.status = 'pago' OR t.status = 'pendente')
                     AND MONTH(t.data) = :m1
                     AND YEAR(t.data) = :a1
                     AND t.id_usuario = :id_user1
                WHERE c.tipo = 'despesa'
                  AND (c.id_usuario = :id_user2 OR c.id_usuario IS NULL OR c.id_usuario = 0)
                GROUP BY c.id, c.nome

                UNION

                SELECT 0 as id, 'Sem Categoria' as nome, COALESCE(SUM(t.valor), 0) as total_realizado
                FROM transacoes t
                WHERE t.tipo = 'despesa'
                  AND (t.status = 'pago' OR t.status = 'pendente')
                  AND MONTH(t.data) = :m2
                  AND YEAR(t.data) = :a2
                  AND t.id_usuario = :id_user3
                  AND (t.id_categoria IS NULL OR t.id_categoria = 0)
                HAVING total_realizado > 0

                ORDER BY nome ASC
            ";

            $sR = $this->conn->prepare($sqlRealizado);
            $sR->execute([
                ':m1' => $m,
                ':a1' => $a,
                ':id_user1' => $idUsuario,
                ':id_user2' => $idUsuario,
                ':m2' => $m,
                ':a2' => $a,
                ':id_user3' => $idUsuario
            ]);
            $real = $sR->fetchAll(PDO::FETCH_ASSOC);

            // Busca o planejamento salvo pelo usuario
            $sP = $this->conn->prepare("SELECT id_categoria, valor_planejado FROM orcamento_mensal WHERE mes = :m AND ano = :a AND id_usuario = :id_user");
            $sP->execute([':m' => $m, ':a' => $a, ':id_user' => $idUsuario]);
            $plan = $sP->fetchAll(PDO::FETCH_KEY_PAIR);

            // Busca a receita total do usuario
            $sRec = $this->conn->prepare("SELECT COALESCE(SUM(valor), 0) FROM transacoes WHERE tipo = 'receita' AND (status = 'pago' OR status = 'pendente') AND MONTH(data) = :m AND YEAR(data) = :a AND id_usuario = :id_user");
            $sRec->execute([':m' => $m, ':a' => $a, ':id_user' => $idUsuario]);
            $rec = (float) $sRec->fetchColumn();

            // Junta as informacoes
            foreach ($real as &$c) {
                $c['valor_planejado'] = (float) ($plan[$c['id']] ?? 0);
                $c['total_realizado'] = (float) $c['total_realizado'];
            }
            return ['receita' => $rec, 'categorias' => $real];

        } catch (Exception $e) {
            return ['receita' => 0, 'categorias' => [], 'error' => $e->getMessage()];
        }
    }

    public function salvarOrcamento($m, $a, $aloc, $idUsuario)
    {
        try {
            $this->criarTabelaOrcamento();
            $this->conn->beginTransaction();

            $st = $this->conn->prepare("INSERT INTO orcamento_mensal (mes, ano, id_categoria, id_usuario, valor_planejado) 
                                        VALUES (:m, :a, :cat, :id_user, :v) 
                                        ON DUPLICATE KEY UPDATE valor_planejado = VALUES(valor_planejado)");
            foreach ($aloc as $id => $v) {
                $st->execute([':m' => $m, ':a' => $a, ':cat' => $id, ':id_user' => $idUsuario, ':v' => $v]);
            }

            $this->conn->commit();
            return ['success' => true];
        } catch (Exception $e) {
            $this->conn->rollBack();
            return ['success' => false, 'message' => $e->getMessage()];
        }
    }


    // ==========================================================
    // --- WHATSAPP ---
    // ==========================================================

    public function getLinkWpp($idUsuario)
    {
        $stmt = $this->conn->prepare("SELECT link_grupo_wpp FROM usuarios WHERE id = :id");
        $stmt->execute([':id' => $idUsuario]);
        $res = $stmt->fetch(PDO::FETCH_ASSOC);
        return $res ? $res['link_grupo_wpp'] : null;
    }

    public function salvarLinkWpp($link, $idGrupo, $idUsuario)
    {
        $stmt = $this->conn->prepare("UPDATE usuarios SET link_grupo_wpp = :link, id_grupo_wpp = :id_grupo WHERE id = :id");
        return [
            'success' => $stmt->execute([':link' => $link, ':id_grupo' => $idGrupo, ':id' => $idUsuario])
        ];
    }


    // ==========================================================
    // --- FIXAS E RECORRENTES ---
    // ==========================================================

    public function salvarFixa($dados, $idUsuario)
    {
        $limite = !empty($dados['limite_parcelas']) && $dados['limite_parcelas'] > 0 ? $dados['limite_parcelas'] : null;
        $sql = "INSERT INTO transacoes_fixas (descricao, valor, dia_vencimento, tipo, id_categoria, id_usuario, limite_parcelas) 
                VALUES (:desc, :valor, :dia, :tipo, :cat, :user, :limite)";
        try {
            $stmt = $this->conn->prepare($sql);
            $stmt->execute([
                ':desc' => $dados['descricao'],
                ':valor' => $dados['valor'],
                ':dia' => $dados['dia'],
                ':tipo' => $dados['tipo'],
                ':cat' => !empty($dados['id_categoria']) ? $dados['id_categoria'] : null,
                ':user' => $idUsuario,
                ':limite' => $limite
            ]);
            return ['success' => true];
        } catch (PDOException $e) {
            return ['success' => false, 'message' => $e->getMessage()];
        }
    }

    public function excluirFixa($id, $idUsuario)
    {
        $stmt = $this->conn->prepare("DELETE FROM transacoes_fixas WHERE id = :id AND id_usuario = :user");
        $stmt->execute([':id' => $id, ':user' => $idUsuario]);
        return ['success' => true];
    }

    public function listarFixas($idUsuario)
    {
        $mesAtual = date('m');
        $anoAtual = date('Y');

        $sql = "SELECT f.*, 
                       c.nome as categoria_nome,
                       t.status as status_mes_atual,
                       (SELECT COUNT(*) FROM transacoes WHERE id_fixa = f.id) as parcelas_geradas
                FROM transacoes_fixas f
                LEFT JOIN categorias c ON f.id_categoria = c.id
                LEFT JOIN transacoes t ON t.id_fixa = f.id 
                     AND MONTH(t.data) = :mes 
                     AND YEAR(t.data) = :ano 
                     AND t.id_usuario = :user_t
                WHERE f.id_usuario = :user_f 
                ORDER BY f.dia_vencimento ASC";

        try {
            $stmt = $this->conn->prepare($sql);
            $stmt->execute([':user_t' => $idUsuario, ':user_f' => $idUsuario, ':mes' => $mesAtual, ':ano' => $anoAtual]);
            return $stmt->fetchAll(PDO::FETCH_ASSOC);
        } catch (PDOException $e) {
            return [];
        }
    }

    public function processarTransacoesFixas($idUsuario)
    {
        try {
            $mesAtual = date('m');
            $anoAtual = date('Y');

            $stmtFixas = $this->conn->prepare("SELECT * FROM transacoes_fixas WHERE id_usuario = :user");
            $stmtFixas->execute([':user' => $idUsuario]);
            $regras = $stmtFixas->fetchAll(PDO::FETCH_ASSOC);

            foreach ($regras as $regra) {
                $sqlCount = "SELECT COUNT(*) FROM transacoes WHERE id_fixa = :id_fixa";
                $stmtCount = $this->conn->prepare($sqlCount);
                $stmtCount->execute([':id_fixa' => $regra['id']]);
                $qtdJaGerada = (int) $stmtCount->fetchColumn();

                if (!empty($regra['limite_parcelas']) && $qtdJaGerada >= $regra['limite_parcelas']) {
                    continue;
                }

                $sqlCheck = "SELECT COUNT(*) FROM transacoes 
                             WHERE id_fixa = :id_fixa 
                             AND MONTH(data) = :mes 
                             AND YEAR(data) = :ano 
                             AND id_usuario = :user";
                $stmtCheck = $this->conn->prepare($sqlCheck);
                $stmtCheck->execute([':id_fixa' => $regra['id'], ':mes' => $mesAtual, ':ano' => $anoAtual, ':user' => $idUsuario]);

                if ($stmtCheck->fetchColumn() == 0) {
                    $dia = $regra['dia_vencimento'];
                    $ultimoDiaMes = date('t');
                    if ($dia > $ultimoDiaMes)
                        $dia = $ultimoDiaMes;

                    $dataVencimento = "$anoAtual-$mesAtual-$dia";
                    $descricaoFinal = $regra['descricao'];

                    if (!empty($regra['limite_parcelas'])) {
                        $numeroParcelaAtual = $qtdJaGerada + 1;
                        $descricaoFinal .= " ($numeroParcelaAtual/" . $regra['limite_parcelas'] . ")";
                    }

                    $sqlInsert = "INSERT INTO transacoes (descricao, valor, data, tipo, status, id_categoria, id_usuario, id_fixa, observacao) 
                                  VALUES (:desc, :valor, :data, :tipo, 'pendente', :cat, :user, :id_fixa, 'Recorrência Automática')";
                    $this->conn->prepare($sqlInsert)->execute([
                        ':desc' => $descricaoFinal,
                        ':valor' => $regra['valor'],
                        ':data' => $dataVencimento,
                        ':tipo' => $regra['tipo'],
                        ':cat' => !empty($regra['id_categoria']) ? $regra['id_categoria'] : null,
                        ':user' => $idUsuario,
                        ':id_fixa' => $regra['id']
                    ]);
                }
            }
        } catch (Exception $e) {
            // Silencia erro no processamento automático para não travar o dashboard
        }
    }
}