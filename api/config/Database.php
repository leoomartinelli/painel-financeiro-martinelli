<?php

class Database
{
    private $host;
    private $db_name;
    private $username;
    private $password;
    private $port;
    private $charset;

    public $conn;

    public function __construct()
    {
        $this->host = $_ENV['DB_HOST'] ?? 'localhost';
        $this->db_name = $_ENV['DB_NAME'] ?? '';
        $this->username = $_ENV['DB_USER'] ?? '';
        $this->password = $_ENV['DB_PASS'] ?? '';
        $this->port = $_ENV['DB_PORT'] ?? '3306';
        $this->charset = $_ENV['DB_CHARSET'] ?? 'utf8mb4';
    }

    public function getConnection()
    {
        $this->conn = null;

        try {

            $dsn = "mysql:host={$this->host};
                    port={$this->port};
                    dbname={$this->db_name};
                    charset={$this->charset}";

            $this->conn = new PDO(
                $dsn,
                $this->username,
                $this->password,
                [
                    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                    PDO::ATTR_EMULATE_PREPARES => false,
                ]
            );

        } catch (PDOException $exception) {

            throw new Exception(
                "Erro de conexão com banco: " . $exception->getMessage()
            );

        }

        return $this->conn;
    }
}
