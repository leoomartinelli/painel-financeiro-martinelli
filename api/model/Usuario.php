<?php
require_once __DIR__ . '/../config/Database.php';

class Usuario
{
    private $conn;

    public function __construct()
    {
        $database = new Database();
        $this->conn = $database->getConnection();
    }

    public function buscarPorEmail($email)
    {
        $sql = "SELECT * FROM usuarios WHERE email = :email LIMIT 1";
        $stmt = $this->conn->prepare($sql);
        $stmt->execute([':email' => $email]);
        return $stmt->fetch(PDO::FETCH_ASSOC);
    }

    public function criar($nome, $email, $senha)
    {
        try {
            $sql = "INSERT INTO usuarios (nome, email, senha) VALUES (:nome, :email, :senha)";
            $stmt = $this->conn->prepare($sql);

            // O hash da senha deve ser gerado no Controller, não aqui
            return $stmt->execute([
                ':nome' => $nome,
                ':email' => $email,
                ':senha' => $senha
            ]);
        } catch (PDOException $e) {
            return false;
        }
    }
}