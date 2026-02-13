<?php
require_once __DIR__ . '/../model/Usuario.php';

class AuthController
{
    private $model;

    public function __construct()
    {
        $this->model = new Usuario();
    }

    public function login()
    {
        $input = json_decode(file_get_contents('php://input'), true);
        $email = $input['email'] ?? '';
        $senha = $input['senha'] ?? '';

        $usuario = $this->model->buscarPorEmail($email);

        if ($usuario && password_verify($senha, $usuario['senha'])) {
            // Inicia a sessão com segurança
            if (session_status() === PHP_SESSION_NONE) {
                session_start([
                    'cookie_httponly' => true, // Impede acesso via JavaScript
                    'cookie_samesite' => 'Lax',
                ]);
            }

            $_SESSION['usuario_id'] = $usuario['id'];
            $_SESSION['usuario_nome'] = $usuario['nome'];

            echo json_encode(['success' => true, 'message' => 'Login realizado!']);
        } else {
            http_response_code(401);
            echo json_encode(['success' => false, 'message' => 'E-mail ou senha inválidos.']);
        }
    }

    public function logout()
    {
        session_start();
        session_destroy();
        echo json_encode(['success' => true]);
    }

    public static function verificarAutenticacao()
    {
        if (session_status() === PHP_SESSION_NONE)
            session_start();
        if (!isset($_SESSION['usuario_id'])) {
            header('Content-Type: application/json');
            http_response_code(401);
            echo json_encode(['success' => false, 'message' => 'Não autorizado.']);
            exit;
        }
    }

    public function registrar()
    {
        $input = json_decode(file_get_contents('php://input'), true);

        $nome = $input['nome'] ?? '';
        $email = $input['email'] ?? '';
        $senha = $input['senha'] ?? '';

        if (empty($nome) || empty($email) || empty($senha)) {
            echo json_encode(['success' => false, 'message' => 'Preencha todos os campos.']);
            return;
        }

        // Verifica se o email já existe
        if ($this->model->buscarPorEmail($email)) {
            echo json_encode(['success' => false, 'message' => 'Este e-mail já está registado.']);
            return;
        }

        // CRIPTOGRAFIA: Gera o hash seguro da senha
        $senhaHash = password_hash($senha, PASSWORD_DEFAULT);

        if ($this->model->criar($nome, $email, $senhaHash)) {
            echo json_encode(['success' => true, 'message' => 'Utilizador criado com sucesso!']);
        } else {
            echo json_encode(['success' => false, 'message' => 'Erro ao criar utilizador.']);
        }
    }
}