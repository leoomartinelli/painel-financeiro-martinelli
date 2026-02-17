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
        // 1. Busca o ID do Cartão primeiro (para excluir das despesas gerais)
        $idCartao = $this->getIdCategoriaCartao($idUsuario);

        // 2. RECEITAS REALIZADAS (Pagas)
        $sqlReceitas = "SELECT COALESCE(SUM(valor), 0) as total 
                        FROM transacoes 
                        WHERE tipo = 'receita' AND status = 'pago' 
                        AND MONTH(data) = :mes AND YEAR(data) = :ano AND id_usuario = :id_user";

        // 3. RECEITAS PENDENTES
        $sqlReceitasPend = "SELECT COALESCE(SUM(valor), 0) as total 
                            FROM transacoes 
                            WHERE tipo = 'receita' AND status = 'pendente' 
                            AND MONTH(data) = :mes AND YEAR(data) = :ano AND id_usuario = :id_user";

        // 4. DESPESAS REALIZADAS (Pagas)
        // (Aqui não precisamos excluir o cartão, pois quando você paga a fatura, vira uma despesa paga normal ou uma transferência)
        $sqlDespesas = "SELECT COALESCE(SUM(valor), 0) as total 
                        FROM transacoes 
                        WHERE tipo = 'despesa' AND status = 'pago' 
                        AND MONTH(data) = :mes AND YEAR(data) = :ano AND id_usuario = :id_user";

        // 5. DESPESAS PENDENTES (CORREÇÃO AQUI!)
        // Adicionamos "AND id_categoria != :idCartao" para não somar compras do cartão aqui
        // Usamos COALESCE no id_categoria para garantir que NULLs não quebrem a lógica (se houver)
        $sqlDespesasPend = "SELECT COALESCE(SUM(valor), 0) as total 
                            FROM transacoes 
                            WHERE tipo = 'despesa' AND status = 'pendente' 
                            AND (id_categoria != :idCartao OR id_categoria IS NULL)
                            AND MONTH(data) = :mes AND YEAR(data) = :ano AND id_usuario = :id_user";

        // 6. FATURA CARTÃO (Total das compras pendentes do cartão)
        $sqlFatura = "SELECT COALESCE(SUM(valor), 0) as total 
                      FROM transacoes 
                      WHERE id_categoria = :idCartao AND status = 'pendente' AND id_usuario = :id_user";

        try {
            // Executa Receitas
            $stmtR = $this->conn->prepare($sqlReceitas);
            $stmtR->execute([':mes' => $mes, ':ano' => $ano, ':id_user' => $idUsuario]);
            $valReceitaRealizada = (float) $stmtR->fetch(PDO::FETCH_ASSOC)['total'];

            // Executa Receitas Pendentes
            $stmtRP = $this->conn->prepare($sqlReceitasPend);
            $stmtRP->execute([':mes' => $mes, ':ano' => $ano, ':id_user' => $idUsuario]);
            $valReceitaPendente = (float) $stmtRP->fetch(PDO::FETCH_ASSOC)['total'];

            // Executa Despesas
            $stmtD = $this->conn->prepare($sqlDespesas);
            $stmtD->execute([':mes' => $mes, ':ano' => $ano, ':id_user' => $idUsuario]);
            $valDespesaRealizada = (float) $stmtD->fetch(PDO::FETCH_ASSOC)['total'];

            // Executa Despesas Pendentes (AGORA PASSANDO O ID DO CARTÃO PARA EXCLUIR)
            $stmtDP = $this->conn->prepare($sqlDespesasPend);
            $stmtDP->execute([':mes' => $mes, ':ano' => $ano, ':id_user' => $idUsuario, ':idCartao' => $idCartao]);
            $valDespesaPendente = (float) $stmtDP->fetch(PDO::FETCH_ASSOC)['total'];

            // Executa Fatura
            $stmtF = $this->conn->prepare($sqlFatura);
            $stmtF->execute([':idCartao' => $idCartao, ':id_user' => $idUsuario]);
            $valFaturaTotal = (float) $stmtF->fetch(PDO::FETCH_ASSOC)['total'];

            // CÁLCULOS FINAIS
            $saldoAtualCalc = $valReceitaRealizada - $valDespesaRealizada;

            // O cálculo agora fica correto:
            // Saldo Atual + O que vai entrar - (Contas normais a pagar) - (Fatura do cartão)
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
    // models/PersonalFinanceiro.php

    public function getCategorias($idUsuario, $tipo = null)
    {
        // Alteração: Adicionamos verificação para 0 também e garantimos os parênteses
        $query = "SELECT * FROM categorias WHERE (id_usuario = :id_user OR id_usuario IS NULL OR id_usuario = 0)";

        $params = [':id_user' => $idUsuario];

        // O AND deve ficar FORA dos parênteses do id_usuario
        if ($tipo) {
            $query .= " AND tipo = :tipo";
            $params[':tipo'] = $tipo;
        }

        $query .= " ORDER BY id_usuario DESC, nome ASC"; // DESC para as do usuário (ID > 0) aparecerem antes, ou ASC para o sistema aparecer antes

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
            // Verifica saldo do cofrinho antes de qualquer coisa
            $stmtCofre = $this->conn->prepare("SELECT saldo_atual, nome FROM cofrinhos WHERE id = :id AND id_usuario = :id_user");
            $stmtCofre->execute([':id' => $idCofrinho, ':id_user' => $idUsuario]);
            $cofre = $stmtCofre->fetch(PDO::FETCH_ASSOC);

            if (!$cofre) {
                return ['success' => false, 'message' => 'Cofrinho não encontrado.'];
            }

            $saldoCofre = (float) $cofre['saldo_atual'];
            $nomeCofre = $cofre['nome'];

            // Validações de Regra de Negócio
            if ($tipo === 'deposito') {
                // REGRA 1: Só guarda se tiver saldo na carteira
                $saldoCarteira = $this->getSaldoGeralUsuario($idUsuario);

                if ($valor > $saldoCarteira) {
                    return ['success' => false, 'message' => "Saldo insuficiente na carteira (Disp: R$ " . number_format($saldoCarteira, 2, ',', '.') . ")"];
                }

                $sqlCofre = "UPDATE cofrinhos SET saldo_atual = saldo_atual + :valor WHERE id = :id AND id_usuario = :id_user";
                // Gera uma DESPESA na carteira (dinheiro saindo da conta principal)
                $sqlTransacao = "INSERT INTO transacoes (descricao, valor, data, tipo, status, id_usuario, observacao) VALUES (:desc, :valor, CURDATE(), 'despesa', 'pago', :id_user, 'Aplicação automática')";
                $descTransacao = "Guardado em: $nomeCofre";

            } else {
                // REGRA 2: Só resgata se tiver saldo no cofrinho
                if ($valor > $saldoCofre) {
                    return ['success' => false, 'message' => "O cofrinho só tem R$ " . number_format($saldoCofre, 2, ',', '.')];
                }

                $sqlCofre = "UPDATE cofrinhos SET saldo_atual = saldo_atual - :valor WHERE id = :id AND id_usuario = :id_user";
                // Gera uma RECEITA na carteira (dinheiro voltando para a conta principal)
                $sqlTransacao = "INSERT INTO transacoes (descricao, valor, data, tipo, status, id_usuario, observacao) VALUES (:desc, :valor, CURDATE(), 'receita', 'pago', :id_user, 'Resgate automático')";
                $descTransacao = "Resgate de: $nomeCofre";
            }

            // Executa tudo dentro de uma transação segura
            $this->conn->beginTransaction();

            // 1. Atualiza Cofrinho
            $this->conn->prepare($sqlCofre)->execute([':valor' => $valor, ':id' => $idCofrinho, ':id_user' => $idUsuario]);

            // 2. Cria o registro no extrato
            $this->conn->prepare($sqlTransacao)->execute([':desc' => $descTransacao, ':valor' => $valor, ':id_user' => $idUsuario]);

            $this->conn->commit();
            return ['success' => true];

        } catch (Exception $e) {
            if ($this->conn->inTransaction()) {
                $this->conn->rollBack();
            }
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
        try {
            $this->conn->beginTransaction();

            // 1. Verifica quanto tem de dinheiro lá dentro antes de apagar
            $stmt = $this->conn->prepare("SELECT saldo_atual, nome FROM cofrinhos WHERE id = :id AND id_usuario = :id_user");
            $stmt->execute([':id' => $id, ':id_user' => $idUsuario]);
            $cofre = $stmt->fetch(PDO::FETCH_ASSOC);

            if ($cofre) {
                $valorEstorno = (float) $cofre['saldo_atual'];

                // REGRA 3: Se tiver dinheiro, devolve para a carteira (Cria uma Receita)
                if ($valorEstorno > 0) {
                    $sqlEstorno = "INSERT INTO transacoes (descricao, valor, data, tipo, status, id_usuario, observacao) 
                                   VALUES (:desc, :valor, CURDATE(), 'receita', 'pago', :id_user, 'Estorno por exclusão de cofrinho')";

                    $this->conn->prepare($sqlEstorno)->execute([
                        ':desc' => "Estorno: " . $cofre['nome'],
                        ':valor' => $valorEstorno,
                        ':id_user' => $idUsuario
                    ]);
                }
            }

            // 2. Deleta o cofrinho
            $stmtDelete = $this->conn->prepare("DELETE FROM cofrinhos WHERE id = :id AND id_usuario = :id_user");
            $stmtDelete->execute([':id' => $id, ':id_user' => $idUsuario]);

            $this->conn->commit();
            return ['success' => true];

        } catch (Exception $e) {
            if ($this->conn->inTransaction()) {
                $this->conn->rollBack();
            }
            return ['success' => false, 'message' => "Erro ao excluir: " . $e->getMessage()];
        }
    }

    public function atualizarCofrinho($id, $novoNome, $novaMeta, $idUsuario)
    {
        // Agora atualiza nome e meta
        $stmt = $this->conn->prepare("UPDATE cofrinhos SET nome = :nome, meta = :meta WHERE id = :id AND id_usuario = :id_user");
        return [
            'success' => $stmt->execute([
                ':nome' => $novoNome,
                ':meta' => $novaMeta,
                ':id' => $id,
                ':id_user' => $idUsuario
            ])
        ];
    }

    private function getSaldoGeralUsuario($idUsuario)
    {
        // Calcula: Total Receitas Pagas - Total Despesas Pagas
        $sql = "SELECT 
                (SELECT COALESCE(SUM(valor), 0) FROM transacoes WHERE id_usuario = :id_u1 AND tipo = 'receita' AND status = 'pago') -
                (SELECT COALESCE(SUM(valor), 0) FROM transacoes WHERE id_usuario = :id_u2 AND tipo = 'despesa' AND status = 'pago') 
                as saldo_total";

        $stmt = $this->conn->prepare($sql);
        $stmt->execute([':id_u1' => $idUsuario, ':id_u2' => $idUsuario]);
        return (float) $stmt->fetch(PDO::FETCH_ASSOC)['saldo_total'];
    }

    private function getIdCategoriaCartao($idUsuario)
    {
        // Busca por 'Cartão' do usuário OU universal (NULL ou 0)
        // O ORDER BY id_usuario DESC prioriza a do usuário se ele tiver criado uma específica
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

    public function getLinkWpp($idUsuario)
    {
        $stmt = $this->conn->prepare("SELECT link_grupo_wpp FROM usuarios WHERE id = :id");
        $stmt->execute([':id' => $idUsuario]);
        $res = $stmt->fetch(PDO::FETCH_ASSOC);
        return $res ? $res['link_grupo_wpp'] : null;
    }

    // 2. Adicione esta função para salvar o link
    public function salvarLinkWpp($link, $idUsuario)
    {
        $stmt = $this->conn->prepare("UPDATE usuarios SET link_grupo_wpp = :link WHERE id = :id");
        return ['success' => $stmt->execute([':link' => $link, ':id' => $idUsuario])];
    }


    public function salvarFixa($dados, $idUsuario)
    {
        // Aceita o limite ou NULL se estiver vazio
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
        // Ao excluir a fixa, NÃO apagamos as transações passadas, apenas a regra futura
        $stmt = $this->conn->prepare("DELETE FROM transacoes_fixas WHERE id = :id AND id_usuario = :user");
        $stmt->execute([':id' => $id, ':user' => $idUsuario]);
        return ['success' => true];
    }

    // --- MOTOR DE PROCESSAMENTO AUTOMÁTICO ---
    public function listarFixas($idUsuario)
    {
        $mesAtual = date('m');
        $anoAtual = date('Y');

        // Agora contamos quantas parcelas JÁ FORAM geradas para saber em qual estamos (ex: 3/12)
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
            $stmt->execute([
                ':user_t' => $idUsuario,
                ':user_f' => $idUsuario,
                ':mes' => $mesAtual,
                ':ano' => $anoAtual
            ]);
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

            // 1. Busca todas as regras
            $stmtFixas = $this->conn->prepare("SELECT * FROM transacoes_fixas WHERE id_usuario = :user");
            $stmtFixas->execute([':user' => $idUsuario]);
            $regras = $stmtFixas->fetchAll(PDO::FETCH_ASSOC);

            foreach ($regras as $regra) {
                // 1.1 VERIFICAÇÃO DE LIMITE
                // Conta quantas vezes essa regra já virou transação no histórico total
                $sqlCount = "SELECT COUNT(*) FROM transacoes WHERE id_fixa = :id_fixa";
                $stmtCount = $this->conn->prepare($sqlCount);
                $stmtCount->execute([':id_fixa' => $regra['id']]);
                $qtdJaGerada = (int) $stmtCount->fetchColumn();

                // Se tem limite definido E já atingiu a quantidade, PULA essa regra (não gera mais)
                if (!empty($regra['limite_parcelas']) && $qtdJaGerada >= $regra['limite_parcelas']) {
                    continue;
                }

                // 2. Verifica se JÁ EXISTE transação NESTE MÊS (para não duplicar)
                $sqlCheck = "SELECT COUNT(*) FROM transacoes 
                             WHERE id_fixa = :id_fixa 
                             AND MONTH(data) = :mes 
                             AND YEAR(data) = :ano 
                             AND id_usuario = :user";

                $stmtCheck = $this->conn->prepare($sqlCheck);
                $stmtCheck->execute([
                    ':id_fixa' => $regra['id'],
                    ':mes' => $mesAtual,
                    ':ano' => $anoAtual,
                    ':user' => $idUsuario
                ]);

                if ($stmtCheck->fetchColumn() == 0) {
                    // 3. SE NÃO EXISTE, CRIA A PENDÊNCIA
                    $dia = $regra['dia_vencimento'];
                    $ultimoDiaMes = date('t');
                    if ($dia > $ultimoDiaMes)
                        $dia = $ultimoDiaMes;

                    $dataVencimento = "$anoAtual-$mesAtual-$dia";

                    // Personaliza o nome: Ex: "Compra Carro (1/10)"
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
            // Silencia erro para não travar dashboard
        }
    }

}
