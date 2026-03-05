<?php
// api/model/PersonalFinanceiro.php
require_once __DIR__ . '/../config/Database.php';

class PersonalFinanceiro
{
    private $conn;

    public function __construct() {
        if (!class_exists('Database')) { require_once __DIR__ . '/../config/Database.php'; }
        $database = new Database(); $this->conn = $database->getConnection();
    }

    public function getResumoMes($mes, $ano) {
        $sqlR = "SELECT COALESCE(SUM(valor), 0) as total FROM transacoes WHERE tipo = 'receita' AND status = 'pago' AND MONTH(data) = :mes AND YEAR(data) = :ano";
        $sqlRP = "SELECT COALESCE(SUM(valor), 0) as total FROM transacoes WHERE tipo = 'receita' AND status = 'pendente' AND MONTH(data) = :mes AND YEAR(data) = :ano";
        $sqlD = "SELECT COALESCE(SUM(valor), 0) as total FROM transacoes WHERE tipo = 'despesa' AND status = 'pago' AND MONTH(data) = :mes AND YEAR(data) = :ano";
        $sqlDP = "SELECT COALESCE(SUM(valor), 0) as total FROM transacoes WHERE tipo = 'despesa' AND status = 'pendente' AND MONTH(data) = :mes AND YEAR(data) = :ano";
        $stC = $this->conn->prepare("SELECT id FROM categorias WHERE nome LIKE :n LIMIT 1"); $stC->execute([':n' => '%Cartão%']); $idC = ($r = $stC->fetch()) ? $r['id'] : 999;
        $sqlF = "SELECT COALESCE(SUM(valor), 0) as total FROM transacoes WHERE id_categoria = :idC AND status = 'pendente'";
        try {
            $sR = $this->conn->prepare($sqlR); $sR->execute([':mes'=>$mes,':ano'=>$ano]); $vR = (float)$sR->fetchColumn();
            $sRP = $this->conn->prepare($sqlRP); $sRP->execute([':mes'=>$mes,':ano'=>$ano]); $vRP = (float)$sRP->fetchColumn();
            $sD = $this->conn->prepare($sqlD); $sD->execute([':mes'=>$mes,':ano'=>$ano]); $vD = (float)$sD->fetchColumn();
            $sDP = $this->conn->prepare($sqlDP); $sDP->execute([':mes'=>$mes,':ano'=>$ano]); $vDP = (float)$sDP->fetchColumn();
            $sF = $this->conn->prepare($sqlF); $sF->execute([':idC'=>$idC]); $vF = (float)$sF->fetchColumn();
            $sA = $vR - $vD; $sP = ($sA + $vRP) - ($vDP + $vF);
            return ['receitas'=>['receita_realizada'=>$vR,'receita_pendente'=>$vRP],'despesas'=>['despesa_realizada'=>$vD,'despesa_pendente'=>$vDP],'saldo_atual'=>$sA,'saldo_previsto'=>$sP,'fatura_prevista'=>$vF];
        } catch (Exception $e) { return null; }
    }

    public function getTransacoes($mes, $ano, $tipo = null) {
        $q = "SELECT t.*, c.nome as categoria_nome FROM transacoes t LEFT JOIN categorias c ON t.id_categoria = c.id WHERE MONTH(t.data) = :m AND YEAR(t.data) = :a";
        if ($tipo) $q .= " AND t.tipo = :t"; $q .= " ORDER BY t.data DESC, t.id DESC";
        try { $s = $this->conn->prepare($q); $p = [':m'=>$mes,':a'=>$ano]; if($tipo) $p[':t']=$tipo; $s->execute($p); return $s->fetchAll(PDO::FETCH_ASSOC); } catch (Exception $e) { return []; }
    }

    public function getDadosAnuais($ano) {
        $q = "SELECT MONTH(data) as mes, SUM(CASE WHEN tipo = 'receita' AND status = 'pago' THEN valor ELSE 0 END) as receitas, SUM(CASE WHEN tipo = 'despesa' AND status = 'pago' THEN valor ELSE 0 END) as despesas FROM transacoes WHERE YEAR(data) = :a GROUP BY MONTH(data) ORDER BY MONTH(data)";
        try { $s = $this->conn->prepare($q); $s->execute([':a'=>$ano]); return $s->fetchAll(PDO::FETCH_ASSOC); } catch (Exception $e) { return []; }
    }

    public function criarTransacao($d) {
        $q = "INSERT INTO transacoes (descricao, valor, data, tipo, status, id_categoria, observacao) VALUES (:d, :v, :dt, :t, :s, :c, :o)";
        try { $s = $this->conn->prepare($q); $s->execute([':d'=>$d['descricao'],':v'=>$d['valor'],':dt'=>$d['data'],':t'=>$d['tipo'],':s'=>$d['status']??'pago',':c'=>!empty($d['id_categoria'])?$d['id_categoria']:null,':o'=>$d['observacao']??null]); return ['success'=>true]; } catch (Exception $e) { return ['success'=>false,'message'=>$e->getMessage()]; }
    }

    public function atualizarTransacao($id, $d) {
        $q = "UPDATE transacoes SET descricao=:d, valor=:v, data=:dt, tipo=:t, status=:s, id_categoria=:c, observacao=:o WHERE id=:id";
        try { $s = $this->conn->prepare($q); $s->execute([':d'=>$d['descricao'],':v'=>$d['valor'],':dt'=>$d['data'],':t'=>$d['tipo'],':s'=>$d['status'],':c'=>!empty($d['id_categoria'])?$d['id_categoria']:null,':o'=>$d['observacao']??null,':id'=>$id]); return ['success'=>true]; } catch (Exception $e) { return ['success'=>false,'message'=>$e->getMessage()]; }
    }

    public function deletarTransacao($id) {
        $q = "DELETE FROM transacoes WHERE id=:id";
        try { $s = $this->conn->prepare($q); $s->execute([':id'=>$id]); return ['success'=>true]; } catch (Exception $e) { return ['success'=>false,'message'=>$e->getMessage()]; }
    }

    public function getCategorias($t = null) {
        $q = "SELECT * FROM categorias"; if ($t) $q .= " WHERE tipo = :t"; $q .= " ORDER BY nome ASC";
        $s = $this->conn->prepare($q); if($t) $s->execute([':t'=>$t]); else $s->execute(); return $s->fetchAll(PDO::FETCH_ASSOC);
    }

    public function criarCategoria($n, $t) {
        $q = "INSERT INTO categorias (nome, tipo) VALUES (:n, :t)";
        try { $s = $this->conn->prepare($q); $s->execute([':n'=>$n,':t'=>$t]); return ['success'=>true,'id'=>$this->conn->lastInsertId()]; } catch (Exception $e) { return ['success'=>false,'message'=>$e->getMessage()]; }
    }

    public function atualizarCategoria($id, $n, $t) {
        $q = "UPDATE categorias SET nome=:n, tipo=:t WHERE id=:id";
        try { $s = $this->conn->prepare($q); $s->execute([':n'=>$n,':t'=>$t,':id'=>$id]); return ['success'=>true]; } catch (Exception $e) { return ['success'=>false,'message'=>$e->getMessage()]; }
    }

    public function deletarCategoria($id) {
        try {
            $this->conn->prepare("UPDATE transacoes SET id_categoria=NULL WHERE id_categoria=:id")->execute([':id'=>$id]);
            $this->conn->prepare("DELETE FROM categorias WHERE id=:id")->execute([':id'=>$id]);
            return ['success'=>true];
        } catch (Exception $e) { return ['success'=>false,'message'=>$e->getMessage()]; }
    }

    public function getFaturaAberta() {
        $idC = 999;
        try {
            $stT = $this->conn->prepare("SELECT COALESCE(SUM(valor), 0) FROM transacoes WHERE id_categoria=:idC AND status='pendente'"); $stT->execute([':idC'=>$idC]); $tot = (float)$stT->fetchColumn();
            $stI = $this->conn->prepare("SELECT * FROM transacoes WHERE id_categoria=:idC AND status='pendente' ORDER BY data ASC"); $stI->execute([':idC'=>$idC]); $its = $stI->fetchAll(PDO::FETCH_ASSOC);
            return ['total'=>$tot,'itens'=>$its];
        } catch (Exception $e) { return ['total'=>0,'itens'=>[]]; }
    }

    public function pagarFatura() {
        $idC = 999;
        try { $this->conn->prepare("UPDATE transacoes SET status='pago' WHERE id_categoria=:idC AND status='pendente'")->execute([':idC'=>$idC]); return ['success'=>true]; } catch (Exception $e) { return ['success'=>false]; }
    }

    public function listarCofrinhos() { return $this->conn->query("SELECT * FROM cofrinhos ORDER BY id DESC")->fetchAll(PDO::FETCH_ASSOC); }

    public function criarCofrinho($n, $m, $c) {
        try { $this->conn->prepare("INSERT INTO cofrinhos (nome, meta, saldo_atual, cor_fundo) VALUES (:n, :m, 0, :c)")->execute([':n'=>$n,':m'=>$m,':c'=>$c]); return ['success'=>true]; } catch (Exception $e) { return ['success'=>false]; }
    }

    public function movimentarCofrinho($idC, $v, $t) {
        try {
            $this->conn->beginTransaction();
            if ($t === 'deposito') {
                $this->conn->prepare("UPDATE cofrinhos SET saldo_atual=saldo_atual+:v WHERE id=:id")->execute([':v'=>$v,':id'=>$idC]);
                $this->conn->prepare("INSERT INTO transacoes (descricao, valor, data, tipo, status, observacao) VALUES (:d, :v, CURDATE(), 'despesa', 'pago', 'Cofre')")->execute([':d'=>'Aplicação: '.$idC,':v'=>$v]);
            } else {
                $this->conn->prepare("UPDATE cofrinhos SET saldo_atual=saldo_atual-:v WHERE id=:id")->execute([':v'=>$v,':id'=>$idC]);
                $this->conn->prepare("INSERT INTO transacoes (descricao, valor, data, tipo, status, observacao) VALUES (:d, :v, CURDATE(), 'receita', 'pago', 'Resgate')")->execute([':d'=>'Resgate: '.$idC,':v'=>$v]);
            }
            $this->conn->commit(); return ['success'=>true];
        } catch (Exception $e) { $this->conn->rollBack(); return ['success'=>false]; }
    }

    public function atualizarMetaCofrinho($id, $m) {
        try { $this->conn->prepare("UPDATE cofrinhos SET meta=:m WHERE id=:id")->execute([':m'=>$m,':id'=>$id]); return ['success'=>true]; } catch (Exception $e) { return ['success'=>false]; }
    }

    public function excluirCofrinho($id) {
        try { $this->conn->prepare("DELETE FROM cofrinhos WHERE id=:id")->execute([':id'=>$id]); return ['success'=>true]; } catch (Exception $e) { return ['success'=>false]; }
    }

    private function criarTabelaOrcamento() {
        $this->conn->exec("CREATE TABLE IF NOT EXISTS orcamento_mensal (id INT AUTO_INCREMENT PRIMARY KEY, mes INT NOT NULL, ano INT NOT NULL, id_categoria INT NOT NULL, valor_planejado DECIMAL(10,2) NOT NULL, UNIQUE KEY uniq_orcamento (mes, ano, id_categoria), FOREIGN KEY (id_categoria) REFERENCES categorias(id) ON DELETE CASCADE) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");
    }

    public function getOrcamento($m, $a) {
        try {
            $this->criarTabelaOrcamento();
            $sR = $this->conn->prepare("SELECT c.id, c.nome, COALESCE(SUM(t.valor), 0) as total_realizado FROM categorias c LEFT JOIN transacoes t ON t.id_categoria = c.id AND t.tipo = 'despesa' AND (t.status = 'pago' OR t.status = 'pendente') AND MONTH(t.data) = :m AND YEAR(t.data) = :a WHERE c.tipo = 'despesa' GROUP BY c.id, c.nome ORDER BY c.nome ASC"); $sR->execute([':m'=>$m,':a'=>$a]); $real = $sR->fetchAll(PDO::FETCH_ASSOC);
            $sP = $this->conn->prepare("SELECT id_categoria, valor_planejado FROM orcamento_mensal WHERE mes = :m AND ano = :a"); $sP->execute([':m'=>$m,':a'=>$a]); $plan = $sP->fetchAll(PDO::FETCH_KEY_PAIR);
            $sRec = $this->conn->prepare("SELECT COALESCE(SUM(valor), 0) FROM transacoes WHERE tipo = 'receita' AND status = 'pago' AND MONTH(data) = :m AND YEAR(data) = :a"); $sRec->execute([':m'=>$m,':a'=>$a]); $rec = (float)$sRec->fetchColumn();
            foreach ($real as &$c) { $c['valor_planejado'] = (float)($plan[$c['id']] ?? 0); $c['total_realizado'] = (float)$c['total_realizado']; }
            return ['receita' => $rec, 'categorias' => $real];
        } catch (Exception $e) { return ['receita' => 0, 'categorias' => [], 'error' => $e->getMessage()]; }
    }

    public function salvarOrcamento($m, $a, $aloc) {
        try {
            $this->criarTabelaOrcamento(); $this->conn->beginTransaction();
            $st = $this->conn->prepare("INSERT INTO orcamento_mensal (mes, ano, id_categoria, valor_planejado) VALUES (:m, :a, :cat, :v) ON DUPLICATE KEY UPDATE valor_planejado = VALUES(valor_planejado)");
            foreach ($aloc as $id => $v) { $st->execute([':m'=>$m,':a'=>$a,':cat'=>$id,':v'=>$v]); }
            $this->conn->commit(); return ['success' => true];
        } catch (Exception $e) { $this->conn->rollBack(); return ['success' => false]; }
    }
}