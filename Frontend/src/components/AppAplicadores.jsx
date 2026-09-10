// ==========================================
// CÓDIGO PARA O NOVO FRONTEND DOS APLICADORES
// ==========================================

import React, { useState, useEffect } from 'react';


// URL do seu backend no Render (substitua pela sua URL real de produção quando publicar)
const API_URL = "https://capyos.onrender.com";

export default function App() {
  const [token, setToken] = useState(localStorage.getItem('capy_token') || '');
  const [usuarioNome, setUsuarioNome] = useState(localStorage.getItem('capy_nome') || '');
  const [loginInput, setLoginInput] = useState('');
  const [senhaInput, setSenhaInput] = useState('');
  const [pendencias, setPendencias] = useState([]);
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(false);

  // Função de Login
  const handleLogin = async (e) => {
    e.preventDefault();
    setErro('');
    setCarregando(true);

    try {
      const response = await fetch(`${API_URL}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ login: loginInput, senha: senhaInput })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || 'Erro ao fazer login');
      }

      // Salva o token e o nome no localStorage do celular
      localStorage.setItem('capy_token', data.access_token);
      localStorage.setItem('capy_nome', data.nome);
      setToken(data.access_token);
      setUsuarioNome(data.nome);
    } catch (err) {
      setErro(err.message);
    } finally {
      setCarregando(false);
    }
  };

  // Buscar Pendências do Aplicador logado
  const carregarPendencias = async () => {
    try {
      const response = await fetch(`${API_URL}/pendencias`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.status === 401) {
        handleLogout(); // Token expirou
        return;
      }

      const data = await response.json();
      setPendencias(data);
    } catch (err) {
      console.error("Erro ao buscar pendências:", err);
    }
  };

  // Marcar/Desmarcar Pendência (✅)
  const toggleFeito = async (id, statusAtual) => {
    const novoStatus = !statusAtual;
    
    // Atualização otimista na tela para dar feedback imediato ao aplicador
    setPendencias(pendencias.map(p => p.id === id ? { ...p, feito: novoStatus } : p));

    try {
      const response = await fetch(`${API_URL}/pendencias/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ feito: novoStatus })
      });

      if (!response.ok) {
        // Se der erro, reverte na tela
        setPendencias(pendencias.map(p => p.id === id ? { ...p, feito: statusAtual } : p));
      }
    } catch (err) {
      console.error("Erro ao atualizar status:", err);
      setPendencias(pendencias.map(p => p.id === id ? { ...p, feito: statusAtual } : p));
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('capy_token');
    localStorage.removeItem('capy_nome');
    setToken('');
    setUsuarioNome('');
    setPendencias([]);
  };

  useEffect(() => {
    if (token) {
      carregarPendencias();
    }
  }, [token]);

  // Se não estiver logado, mostra a Tela de Login
  if (!token) {
    return (
      <div style={{ maxWidth: '400px', margin: '40px auto', padding: '20px', fontFamily: 'sans-serif' }}>
        <h2>CapyOS - Aplicadores</h2>
        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <input 
            type="text" 
            placeholder="Seu login" 
            value={loginInput}
            onChange={(e) => setLoginInput(e.target.value)}
            style={{ padding: '10px', fontSize: '16px' }}
            required
          />
          <input 
            type="password" 
            placeholder="Sua senha" 
            value={senhaInput}
            onChange={(e) => setSenhaInput(e.target.value)}
            style={{ padding: '10px', fontSize: '16px' }}
            required
          />
          <button type="submit" style={{ padding: '10px', fontSize: '16px', background: '#2c3e50', color: '#fff', border: 'none', cursor: 'pointer' }}>
            {carregando ? 'Entrando...' : 'Entrar'}
          </button>
          {erro && <p style={{ color: 'red' }}>{erro}</p>}
        </form>
      </div>
    );
  }

  // Tela Principal de Pendências (Mobile friendly)
  return (
    <div style={{ maxWidth: '600px', margin: '0 auto', padding: '16px', fontFamily: 'sans-serif' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #ddd', paddingBottom: '12px', marginBottom: '16px' }}>
        <div>
          <h3 style={{ margin: 0 }}>Olá, {usuarioNome} 💜</h3>
          <small style={{ color: '#666' }}>Suas pendências de titas</small>
        </div>
        <button onClick={handleLogout} style={{ padding: '6px 12px', background: '#e74c3c', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
          Sair
        </button>
      </div>

      {pendencias.length === 0 ? (
        <p style={{ textAlign: 'center', color: '#888', marginTop: '40px' }}>Nenhuma pendência encontrada por enquanto! 🎉</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {pendencias.map((p) => (
            <div 
              key={p.id} 
              onClick={() => toggleFeito(p.id, p.feito)}
              style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center', 
                padding: '14px', 
                background: p.feito ? '#e8f8f5' : '#f9f9f9', 
                border: `1px solid ${p.feito ? '#2ecc71' : '#ddd'}`,
                borderRadius: '8px',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
            >
              <div>
                <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#333' }}>
                  {p.data} ({p.dia_semana}) — {p.horario}
                </div>
                <div style={{ fontSize: '16px', marginTop: '4px', color: '#111' }}>
                  Tita: <strong>{p.tita}</strong>
                </div>
                {p.observacao && <div style={{ fontSize: '12px', color: '#666', marginTop: '2px' }}>Obs: {p.observacao}</div>}
              </div>
              <div style={{ fontSize: '24px' }}>
                {p.feito ? '✅' : '⬜'}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
